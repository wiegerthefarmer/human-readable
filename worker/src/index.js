/**
 * Human-Readable comic generator proxy (Cloudflare Worker).
 *
 * Two endpoints, both POST + JSON:
 *
 *   /generate  { seed, format }
 *     -> builds a style-guided prompt, calls OpenAI gpt-image-1 at low
 *        quality (fast, cheap previews), returns { image, prompt }.
 *
 *   /submit    { image, prompt, title, seed, format }
 *     -> commits the chosen PNG + script.md + notes.md to a new branch
 *        and opens a DRAFT pull request via the GitHub API. Nothing
 *        publishes without a maintainer merging the PR.
 *
 * Secrets (set with `wrangler secret put`):
 *   OPENAI_API_KEY   - your OpenAI key (never exposed to the browser)
 *   GITHUB_TOKEN     - fine-grained PAT with contents:write + PRs:write
 *
 * Vars (wrangler.toml [vars]):
 *   REPO             - "owner/name", e.g. "wiegerthefarmer/human-readable"
 *   ALLOWED_ORIGIN   - the site origin allowed to call this Worker
 */

const STYLE_PREAMBLE = [
  "Black-and-white webcomic in a minimalist hand-drawn style.",
  "Simple stick figures with round heads and small dot eyes, expressive but restrained.",
  "Clean black ink linework on a plain white background. No color. Light hatching only where needed.",
  "Hand-lettered text in plain speech bubbles and rectangular caption boxes; keep dialogue short and legible.",
  "Dry, observational, technically-aware humor; grounded rather than zany.",
  "Sparse backgrounds — props, labels, and small signs carry the context.",
  "Thin black panel borders separating each panel cleanly.",
].join(" ");

const FORMATS = {
  "3-panel": {
    label: "3-panel strip",
    size: "1536x1024",
    layout: "Arrange as a single horizontal row of 3 equal panels.",
  },
  "9-panel": {
    label: "9-panel page",
    size: "1024x1536",
    layout: "Arrange as a 3x3 grid of 9 equal panels read left-to-right, top-to-bottom.",
  },
  single: {
    label: "single panel",
    size: "1024x1024",
    layout: "A single panel.",
  },
};

function buildPrompt(seed, format) {
  const f = FORMATS[format] || FORMATS["3-panel"];
  return [
    STYLE_PREAMBLE,
    f.layout,
    "Tell this idea as a short comic, inventing the beats and any dialogue:",
    `"${seed.trim()}"`,
    "Land the ending softly with a realization, a label, or an understated escalation.",
    "Do not explain the joke in text.",
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

// ---- OpenAI -------------------------------------------------------------

async function generate(req, env) {
  const { seed, format } = await req.json();
  if (!seed || !seed.trim()) {
    return json({ error: "Please enter an idea first." }, env, 400);
  }
  const fmt = FORMATS[format] ? format : "3-panel";
  const prompt = buildPrompt(seed, fmt);

  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: FORMATS[fmt].size,
      quality: "low", // fast, inexpensive previews
      n: 1,
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return json({ error: "Image generation failed.", detail }, env, 502);
  }
  const data = await r.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return json({ error: "No image returned." }, env, 502);

  return json({ image: `data:image/png;base64,${b64}`, prompt }, env);
}

// ---- GitHub -------------------------------------------------------------

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
  const s = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
  return s.replace(/-+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

function b64utf8(text) {
  return btoa(unescape(encodeURIComponent(text)));
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

async function submit(req, env) {
  const { image, prompt, title, seed, format } = await req.json();
  if (!image || !title || !title.trim()) {
    return json({ error: "A title and a generated image are required." }, env, 400);
  }
  const png = image.replace(/^data:image\/png;base64,/, "");
  const fmt = FORMATS[format]?.label || "comic";

  const n = await nextNumber(env);
  const nid = String(n).padStart(4, "0");
  const slug = `${nid}-${slugify(title)}`;
  const branch = `submission/${slug}`;
  const dir = `comics/${slug}`;

  // Branch from main.
  const refR = await gh(env, "/git/ref/heads/main");
  if (!refR.ok) return json({ error: "Could not read main branch." }, env, 502);
  const sha = (await refR.json()).object.sha;

  const mk = await gh(env, "/git/refs", "POST", {
    ref: `refs/heads/${branch}`,
    sha,
  });
  if (!mk.ok && mk.status !== 422) {
    return json({ error: "Could not create branch.", detail: await mk.text() }, env, 502);
  }

  const scriptMd =
    `# ${title.trim()}\n\n**Format:** ${fmt}\n\n---\n\n_Script pending review._\n`;
  const notesMd =
    `${seed ? seed.trim() : "_Notes pending review._"}\n\n` +
    `---\n\n_Generated image. Prompt used:_\n\n> ${(prompt || "").replace(/\n/g, "\n> ")}\n`;

  const files = [
    [`${dir}/comic.png`, png],
    [`${dir}/script.md`, b64utf8(scriptMd)],
    [`${dir}/notes.md`, b64utf8(notesMd)],
  ];
  for (const [path, content] of files) {
    const put = await gh(env, `/contents/${path}`, "PUT", {
      message: `Add ${path}`,
      content,
      branch,
    });
    if (!put.ok) {
      return json({ error: `Could not write ${path}.`, detail: await put.text() }, env, 502);
    }
  }

  const pr = await gh(env, "/pulls", "POST", {
    title: `Comic submission #${nid}: ${title.trim()}`,
    head: branch,
    base: "main",
    draft: true,
    body:
      `Generated via the create page.\n\n` +
      `**Idea:** ${seed ? seed.trim() : "(none)"}\n\n` +
      `Review the image and tidy \`script.md\` / \`notes.md\` before merging. ` +
      `The generation prompt is recorded in \`notes.md\`.`,
  });
  if (!pr.ok) {
    return json({ error: "Could not open pull request.", detail: await pr.text() }, env, 502);
  }
  const prData = await pr.json();
  return json({ ok: true, url: prData.html_url, number: nid }, env);
}

// ---- Router -------------------------------------------------------------

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }
    if (req.method !== "POST") {
      return json({ error: "POST only." }, env, 405);
    }
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/generate") return await generate(req, env);
      if (pathname === "/submit") return await submit(req, env);
      return json({ error: "Not found." }, env, 404);
    } catch (e) {
      return json({ error: "Unexpected error.", detail: String(e) }, env, 500);
    }
  },
};
