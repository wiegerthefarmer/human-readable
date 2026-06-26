#!/usr/bin/env python3
"""Turn a comic-submission issue into a new comics/ folder.

Reads the GitHub Issue Form body from $ISSUE_BODY, extracts the title,
premise, format, optional script, and the attached image URL, then
scaffolds comics/NNNN-slug/ with comic.png, script.md, and notes.md.

The issue body is untrusted input: it is read from an environment
variable (never interpolated into a shell), the image is only fetched
from GitHub-hosted hosts, and the derived slug is sanitised to
[a-z0-9-] so it cannot escape the comics/ directory.
"""
import io
import os
import re
import urllib.request

from PIL import Image

COMICS_DIR = "comics"
MAX_BYTES = 15 * 1024 * 1024
ALLOWED_HOSTS = (
    "https://github.com/user-attachments/assets/",
    "https://user-images.githubusercontent.com/",
    "https://private-user-images.githubusercontent.com/",
    "https://raw.githubusercontent.com/",
)


def parse_form(body):
    """Split a GitHub Issue Form body into {lowercased heading: value}."""
    fields = {}
    current, buf = None, []
    for line in body.splitlines():
        m = re.match(r'^###\s+(.*)$', line)
        if m:
            if current is not None:
                fields[current] = '\n'.join(buf).strip()
            current, buf = m.group(1).strip().lower(), []
        else:
            buf.append(line)
    if current is not None:
        fields[current] = '\n'.join(buf).strip()
    return fields


def get(fields, *keys):
    """Return the first field whose heading contains one of keys as a word.

    Whole-word matching avoids collisions such as "script" matching the
    word "description".
    """
    for k in keys:
        pat = re.compile(r'\b' + re.escape(k) + r'\b')
        for label, val in fields.items():
            if pat.search(label):
                return '' if not val or val == '_No response_' else val
    return ''


def slugify(title):
    s = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())
    return re.sub(r'-+', '-', s).strip('-') or 'untitled'


def next_number():
    n = 0
    if os.path.isdir(COMICS_DIR):
        for d in os.listdir(COMICS_DIR):
            m = re.match(r'^(\d+)', d)
            if m and os.path.isdir(os.path.join(COMICS_DIR, d)):
                n = max(n, int(m.group(1)))
    return n + 1


def extract_image_url(value):
    m = re.search(r'\((https?://[^)\s]+)\)', value) or re.search(r'(https?://\S+)', value)
    return m.group(1) if m else ''


def download_png(url, dest):
    if not url.startswith(ALLOWED_HOSTS):
        raise SystemExit(f"Image URL host not allowed: {url}")
    req = urllib.request.Request(url, headers={'User-Agent': 'human-readable-bot'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = resp.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise SystemExit("Image exceeds the 15 MB size limit.")
    Image.MAX_IMAGE_PIXELS = 50_000_000
    Image.open(io.BytesIO(data)).verify()           # validate it is a real image
    img = Image.open(io.BytesIO(data))              # reopen for saving
    mode = 'RGBA' if img.mode in ('RGBA', 'LA', 'P') else 'RGB'
    img.convert(mode).save(dest, 'PNG')


def write(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def main():
    fields = parse_form(os.environ.get('ISSUE_BODY', ''))
    issue_num = os.environ.get('ISSUE_NUMBER', '0')

    title = get(fields, 'title') or 'Untitled'
    premise = get(fields, 'premise', 'description', 'alt')
    fmt = get(fields, 'format') or 'other'
    script = get(fields, 'script')
    url = extract_image_url(get(fields, 'image'))
    if not url:
        raise SystemExit("No image URL found in the submission.")

    nid = f"{next_number():04d}"
    slug = f"{nid}-{slugify(title)}"
    folder = os.path.join(COMICS_DIR, slug)
    os.makedirs(folder, exist_ok=True)

    download_png(url, os.path.join(folder, 'comic.png'))

    write(os.path.join(folder, 'script.md'),
          f"# {title}\n\n**Format:** {fmt}\n\n---\n\n"
          + (script + "\n" if script else "_Script pending review._\n"))
    write(os.path.join(folder, 'notes.md'),
          (premise or "_Notes pending review._") + "\n")

    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        with open(out, 'a', encoding='utf-8') as f:
            f.write(f"slug={slug}\n")
            f.write(f"number={nid}\n")
            f.write(f"title={title}\n")
            f.write(f"branch=submission/{nid}-issue-{issue_num}\n")
    print(f"Scaffolded {folder} from issue #{issue_num}")


if __name__ == '__main__':
    main()
