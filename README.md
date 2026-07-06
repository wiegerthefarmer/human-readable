# Human-Readable

> Notes from the interface between people and computers.

**Human-Readable** is a comic series about software, systems, interfaces, infrastructure, and the odd places where human expectations meet machine logic.

The tone is observational rather than punchline-heavy: dry, technical, lightly whimsical, and occasionally philosophical.

The core format is simple:

> A real or realistically overheard sentence becomes a comic about the culture around that sentence.

The sentence is the seed, not necessarily the script. It may appear in the first panel, the last panel, a caption, a whiteboard note, or simply shape the scene.

## Repository Layout

- `comics/` — Published comics and per-comic source material
- `characters/` — Recurring and guest character notes
- `style/` — Visual style, layout rules, humor guide, and recurring motifs
- `prompts/` — AI image generation and writing prompts
- `scripts/` — Draft scripts and dialogue
- `ideas/` — Loose ideas, fragments, and future comic concepts

## Working Format

Each finished comic should eventually live in its own numbered folder:

```text
comics/
└── 0001-dhcp-friday/
    ├── comic.png
    ├── script.md
    ├── prompt.md
    └── notes.md
```

## Generation Modes

- **Sunday Comic** generates a complete page in one pass for the archive and
  print.
- **Living Comic (Beta)** first creates a structured storyboard, then renders
  independent cinematic scenes two at a time. Scenes share a protagonist
  anchor and persistent prop IDs, can expose interactive details, and can be
  assembled in the browser as a 3×3 page, Sunday spread, or 9:16 edition.

Living Comic submissions retain every scene and their `storyboard.json`, so the
same source can support print and interactive editions.

## Submitting a Comic

Anyone can submit a comic via the [**Submit a comic**](https://github.com/wiegerthefarmer/human-readable/issues/new?template=comic-submission.yml) form (also in the site footer). A bot scaffolds the comic folder and opens a draft pull request for a maintainer to review and merge. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

## Current Comic Seeds

- DHCP change on a Friday afternoon
- Bring your own jar
- UUIDs, art hashes, and alphanumeric shishkebabs

## Editorial Direction

The recurring subject is not just "tech jokes."

The series focuses on the human side of technical systems:

- unwritten conventions
- naming problems
- operational folklore
- UX compromises
- systems that are logical but not humane
- humans trying to make machine output meaningful
- shared experiences navigating implicit social expectations
- technical people recognizing the culture they live inside

## AI Character Rule

AI is not a default mascot.

An AI agent may appear when a seed sentence, prompt, or scene explicitly involves AI. Otherwise, the comic should stay grounded in the human conversation and the culture surrounding it.
