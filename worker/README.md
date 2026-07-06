# Comic generator Worker

This Cloudflare Worker powers both creation modes while keeping the OpenAI key
and GitHub token out of the browser.

## API

- `POST /generate` — produce one low-quality Sunday Comic preview.
- `POST /storyboard` — turn an idea into a strict JSON storyboard with a
  protagonist anchor, cinematic shots, persistent prop IDs, and interactions.
- `POST /scene` — render one storyboard scene. The browser runs a two-request
  queue so the first scene appears while later scenes draw in the background.
- `POST /submit` — save a Sunday Comic or a complete Living Comic to a uniquely
  named branch and open a draft pull request.

A Living Comic submission contains:

```text
comics/NNNN-title/
├── comic.png          # assembled grid, spread, or vertical edition
├── storyboard.json    # story, scene, continuity, and prop metadata
├── scenes/
│   ├── scene-01.png
│   └── ...
├── script.md
└── notes.md
```

## One-time setup

1. Install Wrangler and sign in:

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Add the two secrets:

   ```bash
   cd worker
   wrangler secret put OPENAI_API_KEY -c wrangler.toml
   wrangler secret put GITHUB_TOKEN -c wrangler.toml
   ```

   The GitHub token needs **Contents: Read and write** and **Pull requests: Read
   and write** for `wiegerthefarmer/human-readable`.

3. Deploy:

   ```bash
   wrangler deploy -c wrangler.toml
   ```

4. Copy the resulting Worker URL into `window.HUMAN_READABLE_WORKER_URL` near
   the bottom of `create.html`, without a trailing slash.

## Configuration

Public settings live in `wrangler.toml`:

- `REPO` — repository receiving draft submissions.
- `ALLOWED_ORIGIN` — exact browser origin allowed to call the Worker. Multiple
  origins can be comma-separated.
- `STORY_MODEL` — text model used for strict storyboard JSON.
- `IMAGE_MODEL` — image model used for previews, scenes, and high-quality edits.
- `GENERATION_RATE_LIMITER` — 20 generation calls per visitor per minute.
- `SUBMISSION_RATE_LIMITER` — 3 submission calls per visitor per minute.

The limits are intentionally beta-sized: one nine-scene story, its storyboard,
and a retry fit inside one window. Adjust them only after checking image spend.

## Safety and failure behavior

- Browser origins, request size, text length, scene count, image format, and
  variant count are validated server-side.
- Upstream error bodies are written to Worker logs but are not returned to the
  public client.
- Submission branches include a random suffix, avoiding collisions between
  simultaneous submissions.
- Nothing is published automatically; every path ends in a draft pull request.
