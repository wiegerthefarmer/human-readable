/**
 * Human-Readable comic generator proxy (Cloudflare Worker).
 *
 * Endpoints (all POST + JSON unless noted):
 *
 *   /generate   { seed, format }
 *     GPT-4o writes a panel-by-panel script, then gpt-image-1 renders it.
 *     Returns { image, prompt, script }.
 *
 *   /submit     { image, prompt, title, seed, format, generations[] }
 *     Re-renders the chosen preview at high quality (same prompt + edits
 *     endpoint keeps composition intact), commits comic.png + all variant
 *     previews + variants.json + script.md + notes.md, opens a draft PR.
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
  "Simple stick figures with round heads and small dot eyes, expressive but restrained. Bold, consistent ink line weight throughout — lines should be clearly visible, not faint.",
  "Bold black ink linework on a plain white background. No color. Use hatching and cross-hatching to convey shadows, depth, and material texture.",
  "Hand-lettered text in plain speech bubbles and rectangular caption boxes. All text must be perfectly legible real English words — no garbled letters, no nonsense strings.",
  "Dry, observational, technically-aware humor; grounded rather than zany.",
  "Sparse backgrounds — props, labels, and small signs carry the context. Draw key props (whiteboards, mugs, labels) with enough detail to be recognizable.",
  "Thick black panel borders separating each panel cleanly.",
  "CRITICAL LAYOUT RULE: all content (figures, speech bubbles, text, props) must be centered within each panel with generous interior margins — at least 15% clear space from every panel edge. Nothing should touch or overlap a panel border.",
].join(" ");

const FORMATS = {
  "3-panel": { label: "3-panel strip",  size: "1536x1024", panels: 3, layout: "Arrange as a single horizontal row of 3 equal panels." },
  "9-panel": { label: "9-panel page",   size: "1024x1536", panels: 9, layout: "Arrange as a 3×3 grid of 9 equal panels read left-to-right, top-to-bottom." },
  "single":  { label: "single panel",   size: "1024x1024", panels: 1, layout: "A single panel." },
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

async function openaiGenerateRaw(env, prompt, fmt, quality = "low") {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: FORMATS[fmt]?.size || "1536x1024",
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

async function openaiEditRaw(env, b64Image, prompt, fmt) {
  // Use the edits endpoint so the composition is preserved; only clarity/resolution improves.
  const form = new FormData();
  form.append("image", b64ToBlob(b64Image), "comic.png");
  form.append("model", "gpt-image-1");
  form.append("prompt",
    prompt +
    "\n\nEnhance quality and linework clarity. " +
    "Keep the exact same composition, panel layout, characters, text, and visual beats."
  );
  form.append("size", FORMATS[fmt]?.size || "1536x1024");
  form.append("quality", "high");
  form.append("n", "1");

  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!r.ok) throw new Error(`OpenAI edit failed (${r.status}): ${await r.text()}`);
  const data = await r.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data in OpenAI edit response.");
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

// ---- /generate ----------------------------------------------------------

async function generate(req, env) {
  const { seed, format, script: providedScript } = await req.json();
  if (!seed || !seed.trim()) return json({ error: "Please enter an idea first." }, env, 400);
  const fmt = FORMATS[format] ? format : "3-panel";

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
    const b64 = await openaiGenerateRaw(env, prompt, fmt, "high");
    return json({ image: `data:image/png;base64,${b64}`, prompt, script }, env);
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
  // Treat as upload if mode says so OR if there is no AI prompt to work with.
  const isUpload = mode === "upload" || !prompt?.trim();
  const chosenB64 = image.replace(/^data:image\/[^;]+;base64,/, "");

  let hqB64;
  if (isUpload) {
    // Uploaded art goes through unchanged — zero AI involvement.
    hqB64 = chosenB64;
  } else {
    try {
      hqB64 = await openaiEditRaw(env, chosenB64, prompt, fmt);
    } catch (e) {
      return json({ error: `Re-render failed: ${e.message}` }, env, 502);
    }
  }

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
    // comic.png — high-quality re-render (generated) or the uploaded art as-is.
    await ghPut(env, `${dir}/comic.png`, hqB64, branch, `Add ${dir}/comic.png`);

    // Variant previews are only saved for AI-generated submissions.
    if (!isUpload) {
      const allGens = [...generations];
      const pickedB64 = image.replace(/^data:image\/[^;]+;base64,/, "");
      const alreadyIncluded = allGens.some(g =>
        (g.image || "").replace(/^data:image\/[^;]+;base64,/, "") === pickedB64
      );
      if (!alreadyIncluded) allGens.push({ image, prompt });

      const selectedIdx = allGens.findIndex(g =>
        (g.image || "").replace(/^data:image\/[^;]+;base64,/, "") === pickedB64
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

    // script.md — use the GPT-4o script if available, otherwise placeholder.
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

    // notes.md — description plus, for generated comics, prompt provenance.
    let notesMd = `${seed ? seed.trim() : "_Notes pending review._"}\n`;
    if (!isUpload) {
      notesMd += `\n---\n\n_Generated image. Prompt used:_\n\n` +
        `> ${(prompt || "").replace(/\n/g, "\n> ")}\n`;
    } else {
      notesMd += `\n---\n\n_Uploaded artwork._\n`;
    }
    await ghPut(env, `${dir}/notes.md`, b64utf8(notesMd), branch, `Add ${dir}/notes.md`);

    // Per-comic share page: static HTML with OG tags so social previews work.
    // Crawlers see the OG image; browsers are instantly redirected to the reader.
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
      `comic.png is a high-quality re-render of the chosen preview.\n` +
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
    // Files are safely on the branch — return a compare URL so the submitter
    // can still track their work even if PR creation threw.
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
      if (pathname === "/write-script") return await writeScriptEndpoint(req, env);
      if (pathname === "/generate") return await generate(req, env);
      if (pathname === "/submit")   return await submit(req, env);
      return json({ error: "Not found." }, env, 404);
    } catch (e) {
      return json({ error: "Unexpected error.", detail: String(e) }, env, 500);
    }
  },
};


