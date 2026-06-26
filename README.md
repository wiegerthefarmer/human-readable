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

## Submitting a Comic

Anyone can submit a comic from the **Create a comic** page on the site (linked in the footer). Generate one from an idea in the house style, or upload your own finished art — either way it opens a draft pull request for a maintainer to review and merge. Nothing publishes automatically. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

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
