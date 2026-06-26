#!/usr/bin/env python3
"""Scan comics/ for numbered folders containing comic.png and emit comics.json."""
import json
import os
import re


def title_from_slug(slug):
    return ' '.join(word.capitalize() for word in slug.split('-'))


def title_from_script(script_path, fallback):
    if not os.path.exists(script_path):
        return fallback
    with open(script_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('# '):
                return line[2:]
    return fallback


def alt_from_notes(notes_path):
    if not os.path.exists(notes_path):
        return ''
    with open(notes_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                return line
    return ''


comics = []
comics_dir = 'comics'

for folder in sorted(os.listdir(comics_dir)):
    path = os.path.join(comics_dir, folder)
    if not os.path.isdir(path):
        continue
    if not re.match(r'^\d+', folder):
        continue
    image_path = os.path.join(path, 'comic.png')
    if not os.path.exists(image_path):
        continue

    parts = folder.split('-', 1)
    comic_id = parts[0]
    name_slug = parts[1] if len(parts) > 1 else folder
    slug_title = title_from_slug(name_slug)
    title = title_from_script(os.path.join(path, 'script.md'), slug_title)
    alt = alt_from_notes(os.path.join(path, 'notes.md'))

    # Load variants.json if present.
    variants = []
    variants_path = os.path.join(path, 'variants.json')
    if os.path.exists(variants_path):
        try:
            with open(variants_path, encoding='utf-8') as vf:
                vdata = json.load(vf)
            for v in vdata.get('variants', []):
                vfile = v.get('file', '')
                if vfile and os.path.exists(os.path.join(path, 'variants', vfile)):
                    variants.append({
                        'image': f'{path}/variants/{vfile}',
                        'prompt': v.get('prompt', ''),
                        'seed': v.get('seed', ''),
                        'selected': v.get('selected', False),
                    })
        except (json.JSONDecodeError, OSError):
            pass

    comics.append({
        'id': comic_id,
        'slug': folder,
        'title': title,
        'image': f'{path}/comic.png',
        'alt': alt,
        'variants': variants,
    })

with open('comics.json', 'w', encoding='utf-8') as f:
    json.dump({'comics': comics}, f, indent=2)
    f.write('\n')

print(f'Generated comics.json with {len(comics)} comic(s).')
