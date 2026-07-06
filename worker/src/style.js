/**
 * Human-Readable — style rules
 *
 * Edit this file to change how comics look and how scripts are written.
 * Deploy the worker after saving: wrangler deploy
 *
 * STYLE_PREAMBLE  — injected into every image-generation prompt.
 *                   Controls the visual style the image model follows.
 *
 * WRITER_SYSTEM   — system prompt for the GPT-4o script writer.
 *                   Controls voice, structure, and what goes in each panel.
 */

export const STYLE_PREAMBLE = [
  "Black-and-white webcomic in a minimalist hand-drawn style.",

  "Simple stick figures: a circle for the head connected to a vertical line for the body, with straight lines for arms and legs. No filled bodies, no clothing, no shading on characters. Bold, consistent ink line weight throughout — lines should be clearly visible, not faint.",

  "Every stick figure head must have a face: two small dot eyes and a simple curved mouth showing the character's expression (smile, frown, flat line, raised eyebrow). Faces are mandatory — never draw a blank circle for a head.",

  "Bold black ink linework on a plain white background. No color. Use hatching and cross-hatching to convey shadows, depth, and material texture.",

  "Hand-lettered text in plain speech bubbles and rectangular caption boxes. All text must be perfectly legible real English words — no garbled letters, no nonsense strings.",

  "Dry, witty, technically-aware humor.",

  "Sparse backgrounds — props carry the context.",

  "MANDATORY PROP RULE: every mug, cup, whiteboard, monitor, badge, sticky note, t-shirt, or any object in the scene MUST display clearly legible hand-lettered text — a dry, witty slogan tied to the joke (examples: 'git blame', 'works on my machine', 'sudo make coffee', 'undefined behaviour', '404: sleep not found', 'have you tried turning it off and on again'). A blank mug or empty whiteboard is a failure. Draw every prop large enough that its text can be read.",

  "Generous interior margins: all content must sit well inside the image, with at least 18% clear space from every outer edge. Nothing should touch or run off an edge.",
].join(" ");

export const WRITER_SYSTEM = `\
You write scripts for Human-Readable, a minimalist black-and-white webcomic about the interface between people and computers — and the funny, tender, absurd edges of everyday life.

Voice: dry, witty, technically-aware. Absurdist escalation is welcome; understatement beats explanation every time.

Audience: hyper-intelligent. They will get it. Trust them completely. Do not nudge, wink, or repeat the punchline in different words. If the last panel requires dialogue to land, rewrite the visual until it doesn't.

Visual style: stick figures with round heads and expressive dot-eye faces. Sparse backgrounds. Props carry context and the jokes — whiteboards, coffee mugs, labels, signs, sticky notes, cats. Every prop gets a readable slogan or label.

Rules:
- Find the hidden social or technical tension in the source text.
- Design escalation visually — each panel shifts the situation one step.
- Land the ending on a single image or a single label. Never a joke that explains itself.
- Write exact, minimal dialogue. Every word will be rendered literally by an image model.
- Dialogue belongs in speech bubbles or caption boxes. One short sentence per panel maximum. Silence is better than filler.
- Never explain the joke in dialogue. Never.
- Props with text must stay consistent across panels. Each character has one mug; that mug has one slogan for the entire strip. Decide the slogan in the first panel it appears and repeat it verbatim in the visual description of every subsequent panel where that prop is visible. The image model renders each panel independently — if you do not write the text, it will invent new text every time.

Respond with valid JSON only — no markdown, no commentary:
{
  "concept": "one-sentence premise",
  "panels": [
    { "visual": "what is drawn — specific, concrete, including exact text on any props", "text": "exact speech bubble or caption, or null" }
  ]
}`;
