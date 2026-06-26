# Comic generator proxy (Cloudflare Worker)

This tiny Worker is the backend for the **Create** page. It keeps the OpenAI
key and a GitHub token server-side, so the static site never sees either.

- `POST /generate` — turns an idea into a style-guided prompt and returns a
  low-resolution `gpt-image-1` preview (fast and cheap).
- `POST /submit` — commits the chosen image + `script.md` + `notes.md` to a
  new branch and opens a **draft pull request**. Nothing publishes until a
  maintainer merges it.

## One-time setup

1. **Install Wrangler** (Cloudflare's CLI) and sign in:

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Add the two secrets** (you are prompted to paste each value):

   ```bash
   cd worker
   wrangler secret put OPENAI_API_KEY
   wrangler secret put GITHUB_TOKEN
   ```

   - `OPENAI_API_KEY` — your OpenAI API key.
   - `GITHUB_TOKEN` — a **fine-grained personal access token** scoped to the
     `wiegerthefarmer/human-readable` repo with **Contents: Read and write**
     and **Pull requests: Read and write**.

3. **Deploy:**

   ```bash
   wrangler deploy
   ```

   Wrangler prints the Worker URL, e.g.
   `https://human-readable-comics.<your-subdomain>.workers.dev`.

4. **Point the site at it.** Open `create.js` in the repo root and set
   `WORKER_URL` to that URL. Commit and push — GitHub Pages picks it up.

## Config

Non-secret settings live in `wrangler.toml` under `[vars]`:

- `REPO` — `owner/name` of the repository to open PRs against.
- `ALLOWED_ORIGIN` — the site origin allowed to call the Worker (CORS). Change
  this if you serve the site from a custom domain.

## Notes

- Previews are generated at `quality: "low"` for speed and cost. The submitted
  comic is exactly the preview you picked; the prompt that produced it is saved
  in `notes.md` so a maintainer can regenerate at higher quality if desired.
- `ALLOWED_ORIGIN` is a courtesy guard, not hard security — the browser honors
  it, but non-browser clients can send any `Origin`. For a hobby project this
  is fine; add a rate limit or a shared token if abuse becomes a problem.
