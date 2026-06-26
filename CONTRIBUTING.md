# Submitting a Comic

Anyone can submit a comic to **Human-Readable**. You'll need a free GitHub account.

## How it works

1. Open the [**Submit a comic**](https://github.com/wiegerthefarmer/human-readable/issues/new?template=comic-submission.yml) form (also linked in the site footer).
2. Fill in:
   - **Title**
   - **Premise / Description** — a plain description of what happens. This becomes the image's accessibility alt text, so describe the comic rather than explaining the joke.
   - **Format** — 3-panel strip, 9-panel page, or other.
   - **Comic Image** — drag and drop a PNG or JPG. GitHub uploads it for you.
   - **Script** (optional) — panel-by-panel dialogue.
3. Submit. A bot scaffolds `comics/NNNN-your-title/` (image, `script.md`, `notes.md`), regenerates the index, and opens a **draft pull request**.
4. A maintainer reviews the pull request, tidies the script/notes if needed, and merges. Once merged, the comic appears on the site automatically.

## Notes

- Submissions are reviewed before publishing — opening the form does not publish anything directly.
- Keep the tone in mind: dry, observational, lightly whimsical. See [`style/`](style/) for guidance.
- Images over 15 MB are rejected. PNG with white background and black lines works best.

## Maintainers

- The flow is driven by [`.github/workflows/comic-submission.yml`](.github/workflows/comic-submission.yml) and [`.github/scripts/process_submission.py`](.github/scripts/process_submission.py).
- The workflow runs on issues created from the submission form (detected by the `### Comic Image` heading). The issue body is treated as untrusted input.
- To pause submissions, disable the workflow in the Actions tab, or turn off Issues in repository settings.
