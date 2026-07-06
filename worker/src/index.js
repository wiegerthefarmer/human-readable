/**
 * Human-Readable comic generator proxy (Cloudflare Worker).
 *
 * POST /generate    Generate a full-page Sunday comic preview.
 * POST /storyboard  Turn an idea into a structured Living Comic storyboard.
 * POST /scene       Render one storyboard scene independently.
 * POST /submit      Save either mode to a branch and open a draft PR.
 *
 * Required secrets:
 *   OPENAI_API_KEY, GITHUB_TOKEN
 *
 * Public vars:
 *   REPO, ALLOWED_ORIGIN, STORY_MODEL (optional), IMAGE_MODEL (optional)
 */

const STYLE_PREAMBLE = [
  "Human-Readable house style: a mostly monochrome, hand-drawn editorial webcomic.",
  "The recurring protagonist is a minimalist stick figure with a round head, dot eyes, and a consistent silhouette.",
  "Backgrounds are detailed and grounded; characters remain deliberately simple.",
  "Use clean black ink, restrained hatching, and at most one warm orange accent color.",
  "Dialogue is short, legible, and hand-lettered in plain speech bubbles.",
  "The humor is dry, observational, technically aware, and never explained.",
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

const SHOTS = [
  "wide",
  "medium",
  "close-up",
  "over-the-shoulder",
  "whiteboard",
  "terminal",
  "hallway",
  "server-room",
];

const LIMITS = {
  seed: 1200,
  title: 120,
  scenes: 9,
  generations: 8,
  imageChars: 12_000_000,
  requestBytes: 60_000_000,
};

function cleanString(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function singleLine(value, max) {
  return cleanString(value, max).replace(/\s+/g, " ");
}

function safeId(value, fallback) {
  return singleLine(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || fallback;
}

function buildPrompt(seed, format) {
  const f = FORMATS[format] || FORMATS["3-panel"];
  return [
    STYLE_PREAMBLE,
    f.layout,
    "Tell this idea as a short comic, inventing the beats and any dialogue:",
    `"${cleanString(seed, LIMITS.seed)}"`,
    "Land the ending softly with a realization, a label, or an understated escalation.",
    "Do not explain the joke in text.",
  ].join("\n\n");
}

function storyboardSchema(sceneCount) {
  const prop = {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "label",
      "kind",
      "description",
      "continuity",
      "interaction_label",
      "interaction_detail",
      "purchase_url",
    ],
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      kind: { type: "string" },
      description: { type: "string" },
      continuity: { type: "string" },
      interaction_label: { type: "string" },
      interaction_detail: { type: "string" },
      purchase_url: { type: "string" },
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "theme", "style_anchor", "accent", "protagonist", "scenes"],
    properties: {
      title: { type: "string" },
      theme: { type: "string" },
      style_anchor: { type: "string" },
      accent: { type: "string" },
      protagonist: {
        type: "object",
        additionalProperties: false,
        required: ["id", "description", "silhouette"],
        properties: {
          id: { type: "string" },
          description: { type: "string" },
          silhouette: { type: "string" },
        },
      },
      scenes: {
        type: "array",
        minItems: sceneCount,
        maxItems: sceneCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "shot", "description", "location", "dialogue", "props"],
          properties: {
            id: { type: "integer" },
            shot: { type: "string", enum: SHOTS },
            description: { type: "string" },
            location: { type: "string" },
            dialogue: {
              type: "array",
              maxItems: 3,
              items: { type: "string" },
            },
            props: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: prop,
            },
          },
        },
      },
    },
  };
}

function normalizeStoryboard(value, requestedCount = LIMITS.scenes) {
  const source = value && typeof value === "object" ? value : {};
  const count = Math.max(1, Math.min(Number(requestedCount) || LIMITS.scenes, LIMITS.scenes));
  const scenes = Array.isArray(source.scenes) ? source.scenes.slice(0, count) : [];

  return {
    title: singleLine(source.title, LIMITS.title) || "Untitled Living Comic",
    theme: singleLine(source.theme, 200),
    style: "Human-Readable",
    style_anchor: cleanString(source.style_anchor, 700) || STYLE_PREAMBLE,
    accent: singleLine(source.accent, 80) || "warm orange",
    protagonist: {
      id: safeId(source.protagonist?.id, "protagonist_01"),
      description: cleanString(source.protagonist?.description, 400) ||
        "A minimalist stick figure with a round head and dot eyes.",
      silhouette: cleanString(source.protagonist?.silhouette, 300) ||
        "Round head, narrow body, simple limbs, expressive posture.",
    },
    scenes: scenes.map((scene, index) => ({
      id: index + 1,
      shot: SHOTS.includes(scene?.shot) ? scene.shot : "medium",
      description: cleanString(scene?.description, 700),
      location: singleLine(scene?.location, 160),
      dialogue: (Array.isArray(scene?.dialogue) ? scene.dialogue : [])
        .slice(0, 3)
        .map(line => cleanString(line, 180))
        .filter(Boolean),
      props: (Array.isArray(scene?.props) ? scene.props : [])
        .slice(0, 4)
        .map((prop, propIndex) => ({
          id: safeId(prop?.id, `scene_${index + 1}_prop_${propIndex + 1}`),
          label: singleLine(prop?.label, 100) || `Prop ${propIndex + 1}`,
          kind: singleLine(prop?.kind, 80) || "object",
          description: cleanString(prop?.description, 300),
          continuity: cleanString(prop?.continuity, 240),
          interaction_label: singleLine(prop?.interaction_label, 100) || "inspect",
          interaction_detail: cleanString(prop?.interaction_detail, 500) || "Nothing happens. Suspicious.",
          purchase_url: cleanString(prop?.purchase_url, 500),
        })),
    })),
  };
}

function buildScenePrompt(storyboard, scene) {
  const propHistory = storyboard.scenes
    .flatMap(item => item.props)
    .reduce((items, prop) => {
      if (!items.some(item => item.id === prop.id)) items.push(prop);
      return items;
    }, [])
    .map(prop => `${prop.id}: ${prop.label}; ${prop.description}; continuity: ${prop.continuity}`)
    .join("\n");

  const dialogue = scene.dialogue.length
    ? scene.dialogue.map(line => `- ${line}`).join("\n")
    : "No dialogue.";
  const visibleProps = scene.props
    .map(prop => `- ${prop.id}: ${prop.label}; ${prop.description}; ${prop.continuity}`)
    .join("\n");

  return [
    STYLE_PREAMBLE,
    storyboard.style_anchor,
    `Render one self-contained cinematic comic scene, not a multi-panel page. Camera: ${scene.shot}.`,
    `Location: ${scene.location}. Scene: ${scene.description}`,
    `Recurring protagonist (${storyboard.protagonist.id}): ${storyboard.protagonist.description} Silhouette: ${storyboard.protagonist.silhouette}`,
    `Keep the protagonist's proportions, face, and silhouette identical across every scene. Accent color: ${storyboard.accent}.`,
    `Visible prop continuity:\n${visibleProps || "No prominent props."}`,
    `World prop reference (IDs are metadata; never print an ID in the artwork):\n${propHistory || "No established props."}`,
    `Dialogue to reproduce exactly and legibly:\n${dialogue}`,
    "Use detailed environmental storytelling and readable prop labels. Do not add a title, scene number, caption explaining the joke, or metadata IDs.",
  ].join("\n\n");
}

// ---- CORS and request guards --------------------------------------------

function allowedOrigins(env) {
  return cleanString(env.ALLOWED_ORIGIN, 1000)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function corsHeaders(req, env) {
  const origin = req?.headers?.get("Origin") || "";
  const allowed = allowedOrigins(env);
  const value = allowed.length === 0 || allowed.includes("*")
    ? "*"
    : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function originIsAllowed(req, env) {
  const origin = req.headers.get("Origin");
  const allowed = allowedOrigins(env);
  return !origin || allowed.length === 0 || allowed.includes("*") || allowed.includes(origin);
}

function json(body, req, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req, env) },
  });
}

function validateContentLength(req) {
  const contentLength = Number(req.headers.get("Content-Length") || 0);
  return !contentLength || contentLength <= LIMITS.requestBytes;
}

async function rateLimit(req, env, pathname) {
  const binding = pathname === "/submit"
    ? env.SUBMISSION_RATE_LIMITER
    : env.GENERATION_RATE_LIMITER;
  if (!binding?.limit) return true;
  const key = req.headers.get("CF-Connecting-IP") || "unknown";
  const result = await binding.limit({ key });
  return result.success;
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
      model: env.IMAGE_MODEL || "gpt-image-2",
      prompt,
      size: FORMATS[fmt]?.size || "1536x1024",
      quality,
      n: 1,
    }),
  });
  if (!r.ok) {
    console.error("OpenAI image generation failed", r.status, await r.text());
    throw new Error(`Image generation failed (${r.status}).`);
  }
  const data = await r.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned.");
  return b64;
}

async function openaiEditRaw(env, b64Image, prompt, fmt) {
  const form = new FormData();
  form.append("image", b64ToBlob(b64Image), "comic.png");
  form.append("model", env.IMAGE_MODEL || "gpt-image-2");
  form.append("prompt",
    `${prompt}\n\nEnhance quality and linework clarity. Keep the exact same composition, panel layout, characters, text, and visual beats.`
  );
  form.append("size", FORMATS[fmt]?.size || "1536x1024");
  form.append("quality", "high");
  form.append("n", "1");

  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!r.ok) {
    console.error("OpenAI image edit failed", r.status, await r.text());
    throw new Error(`Image edit failed (${r.status}).`);
  }
  const data = await r.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No edited image data returned.");
  return b64;
}

async function openaiStoryboard(env, seed, sceneCount) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.STORY_MODEL || "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: [
            "You are the story editor and continuity designer for Human-Readable.",
            "Create a concise visual narrative with a gentle arc and dry, technically aware humor.",
            "Every scene is an independent cinematic shot, but the protagonist and recurring props must remain visually consistent.",
            "Give every physical prop a stable snake_case ID. Reuse an ID only when the exact same object returns.",
            "Unless continuity requires reuse, vary cups, bottles, desk objects, and background details.",
            "Every scene needs at least one discoverable prop with a short interaction label and a rewarding detail.",
            "Do not invent purchase URLs; leave purchase_url empty unless the user's premise explicitly supplies one.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Create exactly ${sceneCount} scenes from this premise:\n\n${seed}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "human_readable_storyboard",
          strict: true,
          schema: storyboardSchema(sceneCount),
        },
      },
      max_completion_tokens: 6000,
    }),
  });
  if (!r.ok) {
    console.error("OpenAI storyboard failed", r.status, await r.text());
    throw new Error(`Storyboard generation failed (${r.status}).`);
  }
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No storyboard returned.");
  return JSON.parse(content);
}

// ---- Generation endpoints ---------------------------------------------

async function generate(req, env) {
  const { seed, format } = await req.json();
  const cleanSeed = cleanString(seed, LIMITS.seed);
  if (!cleanSeed) return json({ error: "Please enter an idea first." }, req, env, 400);
  const fmt = FORMATS[format] ? format : "3-panel";
  const prompt = buildPrompt(cleanSeed, fmt);
  try {
    const b64 = await openaiGenerateRaw(env, prompt, fmt, "low");
    return json({ image: `data:image/png;base64,${b64}`, prompt }, req, env);
  } catch (error) {
    return json({ error: error.message }, req, env, 502);
  }
}

async function storyboard(req, env) {
  const { seed, sceneCount } = await req.json();
  const cleanSeed = cleanString(seed, LIMITS.seed);
  const count = Math.max(3, Math.min(Number(sceneCount) || 6, LIMITS.scenes));
  if (!cleanSeed) return json({ error: "Please enter an idea first." }, req, env, 400);
  try {
    const raw = await openaiStoryboard(env, cleanSeed, count);
    const result = normalizeStoryboard(raw, count);
    if (result.scenes.length !== count || result.scenes.some(scene => !scene.description || scene.props.length === 0)) {
      throw new Error("The storyboard was incomplete. Please try again.");
    }
    return json({ storyboard: result }, req, env);
  } catch (error) {
    return json({ error: error.message }, req, env, 502);
  }
}

async function scene(req, env) {
  const body = await req.json();
  const normalized = normalizeStoryboard(body.storyboard, LIMITS.scenes);
  const sceneId = Number(body.sceneId);
  const target = normalized.scenes.find(item => item.id === sceneId);
  if (!target) return json({ error: "A valid storyboard scene is required." }, req, env, 400);
  const prompt = buildScenePrompt(normalized, target);
  try {
    const b64 = await openaiGenerateRaw(env, prompt, "3-panel", "low");
    return json({
      sceneId: target.id,
      image: `data:image/png;base64,${b64}`,
      prompt,
    }, req, env);
  } catch (error) {
    return json({ error: error.message, sceneId: target.id }, req, env, 502);
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
  return singleLine(title, LIMITS.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

function b64utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function stripPngDataUrl(value) {
  if (typeof value !== "string" || value.length > LIMITS.imageChars) return "";
  const match = value.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  return match?.[1] || "";
}

async function nextNumber(env) {
  const r = await gh(env, "/contents/comics?ref=main");
  if (!r.ok) throw new Error("Could not inspect the comics directory.");
  const items = await r.json();
  let max = 0;
  for (const item of items) {
    const match = item.name.match(/^(\d+)/);
    if (match && item.type === "dir") max = Math.max(max, parseInt(match[1], 10));
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
    console.error("GitHub write failed", path, put.status, await put.text());
    throw new Error(`Could not write ${path}.`);
  }
}

async function createSubmissionBranch(env, title) {
  const n = await nextNumber(env);
  const nid = String(n).padStart(4, "0");
  const slug = `${nid}-${slugify(title)}`;
  const branch = `submission/${slug}-${crypto.randomUUID().slice(0, 8)}`;
  const ref = await gh(env, "/git/ref/heads/main");
  if (!ref.ok) throw new Error("Could not read the main branch.");
  const sha = (await ref.json()).object.sha;
  const created = await gh(env, "/git/refs", "POST", { ref: `refs/heads/${branch}`, sha });
  if (!created.ok) throw new Error("Could not create the submission branch.");
  return { nid, slug, branch, dir: `comics/${slug}` };
}

async function openDraftPr(env, submission, title, body) {
  const pr = await gh(env, "/pulls", "POST", {
    title: `Comic submission #${submission.nid}: ${title}`,
    head: submission.branch,
    base: "main",
    draft: true,
    body,
  });
  if (!pr.ok) {
    console.error("GitHub PR creation failed", pr.status, await pr.text());
    throw new Error("Files were saved, but the draft pull request could not be opened.");
  }
  return pr.json();
}

async function submitLiving(req, env, body) {
  const title = singleLine(body.title, LIMITS.title);
  const seed = cleanString(body.seed, LIMITS.seed);
  const assembledB64 = stripPngDataUrl(body.image);
  const livingScenes = Array.isArray(body.scenes) ? body.scenes.slice(0, LIMITS.scenes) : [];
  const story = normalizeStoryboard(body.storyboard, livingScenes.length);
  if (!title || !assembledB64 || livingScenes.length < 1 || story.scenes.length !== livingScenes.length) {
    return json({ error: "A title, assembled page, storyboard, and rendered scenes are required." }, req, env, 400);
  }

  const normalizedScenes = livingScenes.map((item, index) => ({
    id: index + 1,
    image: stripPngDataUrl(item?.image),
    prompt: cleanString(item?.prompt, 12_000),
  }));
  if (normalizedScenes.some(item => !item.image)) {
    return json({ error: "Every scene must be rendered before submission." }, req, env, 400);
  }

  let submission;
  try {
    submission = await createSubmissionBranch(env, title);
    await ghPut(env, `${submission.dir}/comic.png`, assembledB64, submission.branch, `Add ${submission.dir}/comic.png`);
    for (const item of normalizedScenes) {
      const filename = `scene-${String(item.id).padStart(2, "0")}.png`;
      await ghPut(env, `${submission.dir}/scenes/${filename}`, item.image, submission.branch, `Add ${submission.dir}/scenes/${filename}`);
    }

    const sceneMeta = normalizedScenes.map((item, index) => ({
      id: item.id,
      file: `scene-${String(item.id).padStart(2, "0")}.png`,
      prompt: item.prompt,
      ...story.scenes[index],
    }));
    await ghPut(env, `${submission.dir}/storyboard.json`, b64utf8(JSON.stringify({ ...story, scenes: sceneMeta }, null, 2)), submission.branch, `Add ${submission.dir}/storyboard.json`);

    const script = story.scenes.map(item =>
      `## Scene ${item.id} — ${item.shot}\n\n${item.description}\n\n${item.dialogue.map(line => `- ${line}`).join("\n") || "_Silent._"}`
    ).join("\n\n");
    await ghPut(env, `${submission.dir}/script.md`, b64utf8(`# ${title}\n\n**Format:** Living Comic (${story.scenes.length} scenes)\n\n---\n\n${script}\n`), submission.branch, `Add ${submission.dir}/script.md`);
    await ghPut(env, `${submission.dir}/notes.md`, b64utf8(`${seed || story.theme}\n\n---\n\nTheme: ${story.theme}\nAccent: ${story.accent}\n`), submission.branch, `Add ${submission.dir}/notes.md`);

    const pr = await openDraftPr(env, submission, title,
      `Generated via Living Comic (Beta).\n\n**Idea:** ${seed || "(none)"}\n` +
      `**Scenes:** ${story.scenes.length}\n\n` +
      `The assembled page is in \`comic.png\`; independent shots and interaction metadata are in \`scenes/\` and \`storyboard.json\`.\n\n` +
      `Review continuity, dialogue, prop links, and page assembly before merging.`
    );
    return json({ ok: true, url: pr.html_url, number: submission.nid }, req, env);
  } catch (error) {
    return json({ error: error.message }, req, env, 502);
  }
}

async function submitSunday(req, env, body) {
  const title = singleLine(body.title, LIMITS.title);
  const seed = cleanString(body.seed, LIMITS.seed);
  const format = FORMATS[body.format] ? body.format : "3-panel";
  const formatLabel = FORMATS[format].label;
  const chosenB64 = stripPngDataUrl(body.image);
  const prompt = cleanString(body.prompt, 12_000) || buildPrompt(seed, format);
  if (!title || !chosenB64) {
    return json({ error: "A title and a generated PNG image are required." }, req, env, 400);
  }

  let hqB64;
  try {
    hqB64 = await openaiEditRaw(env, chosenB64, prompt, format);
  } catch {
    try {
      hqB64 = await openaiGenerateRaw(env, prompt, format, "high");
    } catch (error) {
      return json({ error: `Re-render failed: ${error.message}` }, req, env, 502);
    }
  }

  const generations = Array.isArray(body.generations)
    ? body.generations.slice(0, LIMITS.generations)
    : [];
  const allGens = generations
    .map(item => ({ image: stripPngDataUrl(item?.image), prompt: cleanString(item?.prompt, 12_000) }))
    .filter(item => item.image);
  if (!allGens.some(item => item.image === chosenB64)) allGens.push({ image: chosenB64, prompt });
  const selectedIndex = allGens.findIndex(item => item.image === chosenB64);

  try {
    const submission = await createSubmissionBranch(env, title);
    await ghPut(env, `${submission.dir}/comic.png`, hqB64, submission.branch, `Add ${submission.dir}/comic.png`);

    const variantMeta = [];
    for (let index = 0; index < allGens.length; index++) {
      const filename = `v${String(index + 1).padStart(2, "0")}.png`;
      await ghPut(env, `${submission.dir}/variants/${filename}`, allGens[index].image, submission.branch, `Add ${submission.dir}/variants/${filename}`);
      variantMeta.push({
        file: filename,
        prompt: allGens[index].prompt || prompt,
        seed,
        selected: index === selectedIndex,
      });
    }

    await ghPut(env, `${submission.dir}/variants.json`, b64utf8(JSON.stringify({ variants: variantMeta }, null, 2)), submission.branch, `Add ${submission.dir}/variants.json`);
    await ghPut(env, `${submission.dir}/script.md`, b64utf8(`# ${title}\n\n**Format:** ${formatLabel}\n\n---\n\n_Script pending review._\n`), submission.branch, `Add ${submission.dir}/script.md`);
    const notes = `${seed || "_Notes pending review._"}\n\n---\n\n_Generated image. Prompt used:_\n\n> ${prompt.replace(/\n/g, "\n> ")}\n`;
    await ghPut(env, `${submission.dir}/notes.md`, b64utf8(notes), submission.branch, `Add ${submission.dir}/notes.md`);

    const pr = await openDraftPr(env, submission, title,
      `Generated via the Sunday Comic create page.\n\n**Idea:** ${seed || "(none)"}\n` +
      `**Variants generated:** ${allGens.length}\n\n` +
      `\`comic.png\` is a high-quality re-render of the chosen preview. All previews and prompt provenance are retained for review.`
    );
    return json({ ok: true, url: pr.html_url, number: submission.nid }, req, env);
  } catch (error) {
    return json({ error: error.message }, req, env, 502);
  }
}

async function submit(req, env) {
  const body = await req.json();
  return body.mode === "living"
    ? submitLiving(req, env, body)
    : submitSunday(req, env, body);
}

// ---- Router -------------------------------------------------------------

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      if (!originIsAllowed(req, env)) return new Response(null, { status: 403 });
      return new Response(null, { headers: corsHeaders(req, env) });
    }
    if (!originIsAllowed(req, env)) return json({ error: "Origin not allowed." }, req, env, 403);
    if (req.method !== "POST") return json({ error: "POST only." }, req, env, 405);
    if (!validateContentLength(req)) return json({ error: "Request is too large." }, req, env, 413);

    const { pathname } = new URL(req.url);
    try {
      if (["/generate", "/storyboard", "/scene", "/submit"].includes(pathname) &&
          !await rateLimit(req, env, pathname)) {
        return json({ error: "The beta is busy. Please wait a minute and try again." }, req, env, 429);
      }
      if (pathname === "/generate") return await generate(req, env);
      if (pathname === "/storyboard") return await storyboard(req, env);
      if (pathname === "/scene") return await scene(req, env);
      if (pathname === "/submit") return await submit(req, env);
      return json({ error: "Not found." }, req, env, 404);
    } catch (error) {
      console.error("Unexpected worker error", error);
      return json({ error: "Unexpected error." }, req, env, 500);
    }
  },
};

export {
  buildPrompt,
  buildScenePrompt,
  normalizeStoryboard,
  storyboardSchema,
};
