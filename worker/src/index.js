/**
 * Human-Readable comic generator proxy (Cloudflare Worker).
 *
 * Endpoints (all POST + JSON unless noted):
 *
 *   /write-script { seed, format }
 *     GPT-4o writes a panel-by-panel script.
 *     Returns { script }.
 *
 *   /generate   { seed, format, script }
 *     GPT-4o writes/reuses a panel-by-panel script, then gpt-image-1 renders
 *     each panel independently for multi-panel comics. The browser stitches the
 *     returned panel images into a deterministic strip/page preview.
 *     Returns { image, panelImages, prompt, panelPrompts, script, stitch }.
 *
 *   /submit     { image, prompt, title, seed, format, generations[] }
 *     Commits the selected deterministic composite + all variant previews +
 *     variants.json + script.md + notes.md, opens a draft PR.
 *     Returns { ok, url, number }.
 *
 * Secrets (wrangler secret put):
 *   OPENAI_API_KEY   OpenAI key (never reaches the browser)
 *   GITHUB_TOKEN     Fine-grained PAT: Contents:write + PRs:write
 *
 * Vars (wrangler.toml [vars]):
 *   REPO             "owner/name"
 *   ALLOWED_ORIGIN   Site origin for CORS
 */

const STYLE_PREAMBLE = [
  "Black-and-white webcomic in a minimalist hand-drawn style.",
  "Simple stick figures: a circle for the head connected to a vertical line for the body, with straight lines for arms and legs. No filled bodies, no clothing, no shading on characters. Bold, consistent ink line weight throughout — lines should be clearly visible, not faint.",
  "Bold black ink linework on a plain white background. No color. Use hatching and cross-hatching to convey shadows, depth, and material texture.",
  "Hand-lettered text in plain speech bubbles and rectangular caption boxes. All text must be perfectly legible real English words — no garbled letters, no nonsense strings.",
  "Dry, observational, technically-aware humor; grounded rather than zany.",
  "Sparse backgrounds — props, labels, and small signs carry the context. Draw key props (whiteboards, mugs, labels) with enough detail to be recognizable.",
  "Generous interior margins: all content must sit well inside the image, with at least 18% clear space from every outer edge. Nothing should touch or run off an edge.",
].join(" ");

const FORMATS = {
  "3-panel": {
    label: "3-panel strip",
    size: "1024x1024",
    panels: 3,
    layout: "Render each panel independently. The browser will stitch the 3 finished panels into one horizontal strip.",
    stitch: { cols: 3, rows: 1, panelSize: 1024, gutter: 0, border: 10 },
  },
  "9-panel": {
    label: "9-panel page",
    size: "1024x1024",
    panels: 9,
    layout: "Render each panel independently. The browser will stitch the 9 finished panels into a 3×3 page read left-to-right, top-to-bottom.",
    stitch: { cols: 3, rows: 3, panelSize: 1024, gutter: 0, border: 10 },
  },
  "single": {
    label: "single panel",
    size: "1024x1024",
    panels: 1,
    layout: "A single panel.",
    stitch: null,
  },
};

const WRITER_SYSTEM = `\
You write scripts for Human-Readable, a minimalist black-and-white webcomic about the interface between people and computers — and the funny, tender, absurd edges of everyday life.

Voice: dry, observational, technically-aware. Grounded rather than zany. Understatement beats punchlines.

Visual style: stick figures with round heads and dot eyes. Sparse backgrounds. Props carry context — whiteboards, coffee mugs, labels, signs, sticky notes, cats.

Rules:
- Find the hidden social or technical tension in the source text.
- Design escalation visually — each panel shifts the situation one step.
- Land the ending softly: a quiet realization, an ironic label, or an understated callback to panel 1. Never a joke that explains itself.
- Write exact, minimal dialogue. Every word will be rendered literally by an image model.
- Dialogue belongs in speech bubbles or caption boxes. Keep it short — one to two short sentences per panel maximum.
- Never explain the joke in dialogue.

Respond with valid JSON only — no markdown, no commentary:
{
  "concept": "one-sentence premise",
  "panels": [
    { "visual": "what is drawn — specific, concrete", "text": "exact speech bubble or caption, or null" }
  ]
}`;

async function getSeriesContext(env) {
  try {
    const base = ghPagesBase(env);
    const r = await fetch(`${base}/comics.json`, { cf: { cacheTtl: 60 } });
    if (!r.ok) return "";
    const data = await r.json();
    const comics = data.comics || [];
    if (comics.length === 0) return "";
    const lines = comics.map(c =>
      `- #${c.id} "${c.title}"${c.alt ? `: ${c.alt.slice(0, 120)}` : ""}`
    );
    return `Previously published comics (avoid repeating themes; build on the voice and recurring elements):\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

async function writeScript(env, seed, fmt) {
  const f = FORMATS[fmt] || FORMATS["3-panel"];
  const [context] = await Promise.all([getSeriesContext(env)]);
  const userMsg = [
    context,
    `Format: ${f.label} (${f.panels} panels).`,
    `Source text: "${seed.trim()}"`,
  ].filter(Boolean).join("\n\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: WRITER_SYSTEM },
        { role: "user", content: userMsg },
      ],
      max_tokens: 800,
    }),
  });
  if (!r.ok) throw new Error(`Script generation failed (${r.status}): ${await r.text()}`);
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No script returned.");
  return JSON.parse(raw);
}

function buildPromptFromScript(script, format) {
  const f = FORMATS[format] || FORMATS["3-panel"];
  const panels = (script.panels || []).map((p, i) => {
    const txt = p.text ? ` Text: "${p.text}"` : "";
    return `Panel ${i + 1}: ${p.visual}${txt}`;
  }).join("\n");
  return [
    STYLE_PREAMBLE,
    f.layout,
    "Draw each panel exactly as described below. All text must be perfectly legible.",
    panels,
  ].join("\n\n");
}

function buildPanelPrompt(script, format, index) {
  const f = FORMATS[format] || FORMATS["3-panel"];
  const panel = script.panels?.[index] || {};
  const txt = panel.text ? `Text to render exactly: "${panel.text}"` : "No text unless it is required by the visual description.";
  return [
    STYLE_PREAMBLE,
    `This is panel ${index + 1} of a ${f.label}. Render ONLY this one panel as a complete square comic panel. Do not draw neighboring panels. Do not crop the scene.`,
    "The browser will add the final strip/page borders later, so leave safe white margins around the art and text.",
    `Visual: ${panel.visual || "simple stick-figure scene"}`,
    txt,
  ].join("\n\n");
}

// ---- CORS ---------------------------------------------------------------

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

// ---- OpenAI helpers -----------------------------------------------------

function b64ToBlob(b64, type = "image/png") {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function openaiGenerateRaw(env, prompt, fmt, quality = "low", sizeOverride = null) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: sizeOverride || FORMATS[fmt]?.size || "1024x1024",
      quality,
      n: 1,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI generate failed (${r.status}): ${await r.text()}`);
  const data = await r.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data in OpenAI response.");
  return b64;
}

// ---- /write-script ------------------------------------------------------

async function writeScriptEndpoint(req, env) {
  const { seed, format } = await req.json();
  if (!seed?.trim()) return json({ error: "Please enter an idea first." }, env, 400);
  const fmt = FORMATS[format] ? format : "3-panel";
  try {
    const script = await writeScript(env, seed, fmt);
    return json({ script }, env);
  } catch (e) {
    return json({ error: e.message }, env, 502);
  }
}

// ---- /quick-preview -----------------------------------------------------

async function quickPreview(req, env) {
  const { seed, format, script: providedScript } = await req.json();
  if (!seed?.trim()) return json({ error: "Please enter an idea first." }, env, 400);
  const fmt = FORMATS[format] ? format : "3-panel";

  let script = providedScript?.panels?.length ? providedScript : null;
  if (!script) {
    try {
      script = await writeScript(env, seed, fmt);
    } catch (e) {
      return json({ error: `Script failed: ${e.message}` }, env, 502);
    }
  }

  try {
    const prompt = buildPromptFromScript(script, fmt);
    const b64 = await openaiGenerateRaw(env, prompt, fmt, "low");
    return json({ image: `data:image/png;base64,${b64}`, script }, env);
  } catch (e) {
    return json({ error: e.message }, env, 502);
  }
}

// ---- /generate ----------------------------------------------------------

async function generate(req, env) {
  const { seed, format, script: providedScript } = await req.json();
  if (!seed || !seed.trim()) return json({ error: "Please enter an idea first." }, env, 400);
  const fmt = FORMATS[format] ? format : "3-panel";
  const f = FORMATS[fmt];

  let script;
  if (providedScript?.panels?.length) {
    script = providedScript;
  } else {
    try {
      script = await writeScript(env, seed, fmt);
    } catch (e) {
      return json({ error: `Script step failed: ${e.message}` }, env, 502);
    }
  }

  const prompt = buildPromptFromScript(script, fmt);
  try {
    if (f.panels === 1) {
      const b64 = await openaiGenerateRaw(env, prompt, fmt, "high");
      return json({ image: `data:image/png;base64,${b64}`, prompt, script }, env);
    }

    const panelPrompts = Array.from({ length: f.panels }, (_, i) =>
      buildPanelPrompt(script, fmt, i)
    );
    const b64s = await Promise.all(
      panelPrompts.map(p => openaiGenerateRaw(env, p, fmt, "high", f.size))
    );
    const panelImages = b64s.map(b64 => `data:image/png;base64,${b64}`);

    return json({ image: null, panelImages, prompt, panelPrompts, script, stitch: f.stitch }, env);
  } catch (e) {
    return json({ error: e.message }, env, 502);
  }
}

// ---- GitHub helpers -----------------------------------------------------

function gh(env, path, method = "GET", body) {
  return fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "human-readable-bot",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function slugify(title) {
  return (title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "")) || "untitled";
}

function b64utf8(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ghPagesBase(env) {
  const [owner, repo] = (env.REPO || '/').split('/');
  return `https://${owner}.github.io/${repo}`;
}

async function nextNumber(env) {
  const r = await gh(env, "/contents/comics?ref=main");
  if (!r.ok) return 1;
  const items = await r.json();
  let max = 0;
  for (const it of items) {
    const m = it.name.match(/^(\d+)/);
    if (m && it.type === "dir") max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

async function ghPut(env, path, b64content, branch, message) {
  const put = await gh(env, `/contents/${path}`, "PUT", {
    message,
    content: b64content,
    branch,
  });
  if (!put.ok) {
    const detail = await put.text();
    throw new Error(`Could not write ${path}: ${detail}`);
  }
}

// ---- /submit ------------------------------------------------------------

async function submit(req, env) {
  const body = await req.json();
  const { image, prompt, title, seed, format, generations = [], mode = "generated", script } = body;

  if (!image || !title?.trim()) {
    return json({ error: "A title and an image are required." }, env, 400);
  }

  const fmt = FORMATS[format] ? format : "3-panel";
  const fmtLabel = FORMATS[fmt].label;
  const isUpload = mode === "upload" || !prompt?.trim();
  const chosenB64 = image.replace(/^data:image\/[^;]+;base64,/, "");

  // Generated multi-panel art is now a deterministic browser-side composite.
  // Do not send it back through image edits; that can re-crop/recompose the strip.
  const hqB64 = chosenB64;

  // Scaffold folder and branch.
  const n = await nextNumber(env);
  const nid = String(n).padStart(4, "0");
  const slug = `${nid}-${slugify(title)}`;
  const branch = `submission/${slug}`;
  const dir = `comics/${slug}`;

  const refR = await gh(env, "/git/ref/heads/main");
  if (!refR.ok) return json({ error: "Could not read main branch." }, env, 502);
  const sha = (await refR.json()).object.sha;

  const mk = await gh(env, "/git/refs", "POST", { ref: `refs/heads/${branch}`, sha });
  if (!mk.ok && mk.status !== 422) {
    return json({ error: "Could not create branch.", detail: await mk.text() }, env, 502);
  }

  let variantCount = 0;
  try {
    await ghPut(env, `${dir}/comic.png`, hqB64, branch, `Add ${dir}/comic.png`);

    if (!isUpload) {
      const allGens = [...generations];
      const alreadyIncluded = allGens.some(g =>
        (g.image || "").replace(/^data:image\/[^;]+;base64,/, "") === chosenB64
      );
      if (!alreadyIncluded) allGens.push({ image, prompt });

      const selectedIdx = allGens.findIndex(g =>
        (g.image || "").replace(/^data:image\/[^;]+;base64,/, "") === chosenB64
      );

      const variantMeta = [];
      for (let i = 0; i < allGens.length; i++) {
        const vB64 = (allGens[i].image || "").replace(/^data:image\/[^;]+;base64,/, "");
        if (!vB64) continue;
        const fname = `v${String(i + 1).padStart(2, "0")}.png`;
        await ghPut(env, `${dir}/variants/${fname}`, vB64, branch, `Add ${dir}/variants/${fname}`);
        variantMeta.push({
          file: fname,
          prompt: allGens[i].prompt || prompt,
          panelPrompts: allGens[i].panelPrompts || [],
          seed: seed || "",
          selected: i === selectedIdx,
        });
      }
      variantCount = variantMeta.length;

      await ghPut(env,
        `${dir}/variants.json`,
        b64utf8(JSON.stringify({ variants: variantMeta }, null, 2)),
        branch,
        `Add ${dir}/variants.json`
      );
    }

    let scriptMd = `# ${title.trim()}\n\n**Format:** ${fmtLabel}\n\n`;
    if (!isUpload && script?.concept) {
      scriptMd += `**Concept:** ${script.concept}\n\n`;
      if (script.panels?.length) {
        scriptMd += `## Panels\n\n`;
        script.panels.forEach((p, i) => {
          scriptMd += `**Panel ${i + 1}:** ${p.visual}`;
          if (p.text) scriptMd += `\n> "${p.text}"`;
          scriptMd += `\n\n`;
        });
      }
    } else {
      scriptMd += `---\n\n_Script pending review._\n`;
    }
    await ghPut(env, `${dir}/script.md`, b64utf8(scriptMd), branch, `Add ${dir}/script.md`);

    let notesMd = `${seed ? seed.trim() : "_Notes pending review._"}\n`;
    if (!isUpload) {
      notesMd += `\n---\n\n_Generated image. Final comic is a deterministic stitched composite of independently rendered panels._\n\n` +
        `_Composite prompt provenance:_\n\n> ${(prompt || "").replace(/\n/g, "\n> ")}\n`;
    } else {
      notesMd += `\n---\n\n_Uploaded artwork._\n`;
    }
    await ghPut(env, `${dir}/notes.md`, b64utf8(notesMd), branch, `Add ${dir}/notes.md`);

    const siteBase = ghPagesBase(env);
    const ogTitle = escHtml(title.trim());
    const ogDesc  = escHtml((seed ? seed.trim() : `A Human-Readable comic.`).slice(0, 300));
    const ogImage = `${siteBase}/comics/${slug}/comic.png`;
    const ogUrl   = `${siteBase}/${nid}`;
    const stubHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ogTitle} — Human-Readable</title>
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Human-Readable" />
  <meta property="og:title" content="${ogTitle} — Human-Readable" />
  <meta property="og:description" content="${ogDesc}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:url" content="${ogUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle} — Human-Readable" />
  <meta name="twitter:description" content="${ogDesc}" />
  <meta name="twitter:image" content="${ogImage}" />
</head>
<body>
  <script>location.replace('../#${nid}');<\/script>
</body>
</html>`;
    await ghPut(env, `${nid}/index.html`, b64utf8(stubHtml), branch, `Add ${nid}/index.html (share page)`);

  } catch (e) {
    return json({ error: e.message }, env, 502);
  }

  const prBody = isUpload
    ? `Uploaded via the create page.\n\n` +
      `**Description:** ${seed ? seed.trim() : "(none)"}\n\n` +
      `comic.png is the contributor's uploaded artwork, committed unchanged.\n\n` +
      `Review the image and tidy \`script.md\` / \`notes.md\` before merging.`
    : `Generated via the create page.\n\n` +
      `**Idea:** ${seed ? seed.trim() : "(none)"}\n` +
      `**Variants generated:** ${variantCount}\n\n` +
      `comic.png is a deterministic composite stitched from independently rendered panels.\n` +
      `All previews are saved in \`variants/\` with prompt provenance in \`variants.json\`.\n\n` +
      `Review the image and tidy \`script.md\` / \`notes.md\` before merging.`;

  let prUrl;
  try {
    const pr = await gh(env, "/pulls", "POST", {
      title: `Comic submission #${nid}: ${title.trim()}`,
      head: branch,
      base: "main",
      draft: true,
      body: prBody,
    });
    if (!pr.ok) {
      const detail = await pr.text();
      return json({ error: "Could not open pull request.", detail }, env, 502);
    }
    const prData = await pr.json();
    prUrl = prData.html_url;
  } catch (e) {
    prUrl = `https://github.com/${env.REPO}/compare/${branch}`;
  }

  return json({ ok: true, url: prUrl, number: nid }, env);
}

// ---- Router -------------------------------------------------------------

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(env) });
    if (req.method !== "POST") return json({ error: "POST only." }, env, 405);
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/write-script")   return await writeScriptEndpoint(req, env);
      if (pathname === "/quick-preview")  return await quickPreview(req, env);
      if (pathname === "/generate")       return await generate(req, env);
      if (pathname === "/submit")   return await submit(req, env);
      return json({ error: "Not found." }, env, 404);
    } catch (e) {
      return json({ error: "Unexpected error.", detail: String(e) }, env, 500);
    }
  },
};
