#!/usr/bin/env python3
"""
Push newly-merged comics to Printful as sync products.

For each comic folder that has a comic.png but no printful.json, this script
creates four Printful products (poster, mug, tshirt, mousepad) and writes
printful.json with the resulting product URLs.

Required secrets / env vars:
  PRINTFUL_API_KEY       Printful API key
  PRINTFUL_STORE_ID      Printful store ID (numeric)
  SITE_BASE_URL          Public site URL, e.g. https://wiegerthefarmer.github.io/human-readable
                         Used to build the source image URL sent to Printful.

Optional:
  PRINTFUL_STORE_BASE_URL  Your store's public base URL (e.g. https://your-store.com).
                           Product page URLs are built as {base}/products/{product_id}.
                           Defaults to https://www.printful.com if not set.

Catalog variant IDs:
  These are Printful's internal variant IDs. If a product variant is unavailable
  in your store, Printful returns a 400 — update the ID from your store's catalog
  (dashboard → Products → catalog, or GET /store/variants).
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error


API_BASE = "https://api.printful.com"

# Printful catalog variant IDs per product type.
# Each entry maps to one or more Printful catalog variant IDs.
# For multi-variant products (t-shirts), list one per size — Printful creates
# a single sync product with multiple variants.
PRODUCT_CONFIGS = {
    "poster": {
        "name_suffix": "Poster",
        # 18×12" Enhanced Matte Paper Poster
        "variant_ids": [12701],
        # Placement key recognised by Printful for this product type.
        "placement": "default",
    },
    "mug": {
        "name_suffix": "Mug",
        # 11oz White Glossy Mug
        "variant_ids": [1320],
        "placement": "default",
    },
    "tshirt": {
        "name_suffix": "T-Shirt",
        # Bella+Canvas 3001 unisex tee — S, M, L, XL, 2XL in White
        "variant_ids": [4011, 4012, 4013, 4014, 4015],
        "placement": "front",
    },
    "mousepad": {
        "name_suffix": "Mousepad",
        # Sublimation Mousepad
        "variant_ids": [11526],
        "placement": "default",
    },
}


def api(method, path, body=None):
    """Make a Printful API call; return parsed JSON result dict."""
    api_key = os.environ["PRINTFUL_API_KEY"]
    store_id = os.environ["PRINTFUL_STORE_ID"]
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "X-PF-Store-Id": store_id,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Printful API {method} {path} → {e.code}: {body_text}") from e


def create_sync_product(title, product_key, image_url):
    """Create a Printful sync product; return the product ID."""
    cfg = PRODUCT_CONFIGS[product_key]
    name = f"{title} — {cfg['name_suffix']}"
    variants = []
    for vid in cfg["variant_ids"]:
        variants.append({
            "variant_id": vid,
            "files": [
                {
                    "placement": cfg["placement"],
                    "url": image_url,
                }
            ],
        })
    payload = {
        "sync_product": {"name": name},
        "sync_variants": variants,
    }
    result = api("POST", "/store/products", payload)
    return result["result"]["id"]


def etsy_listing_url(printful_product_id, retries=4, delay=5):
    """Fetch a Printful sync product and return the Etsy listing URL.

    Printful syncs to Etsy asynchronously, so external_id may not be
    populated immediately. Retry a few times before giving up.
    """
    for attempt in range(retries):
        try:
            result = api("GET", f"/store/products/{printful_product_id}")
            ext_id = result.get("result", {}).get("external_id")
            if ext_id:
                return f"https://www.etsy.com/listing/{ext_id}"
        except RuntimeError:
            pass
        if attempt < retries - 1:
            time.sleep(delay)
    return None


def process_comic(folder, path):
    printful_path = os.path.join(path, "printful.json")
    if os.path.exists(printful_path):
        print(f"  {folder}: printful.json exists, skipping.")
        return False

    image_path = os.path.join(path, "comic.png")
    if not os.path.exists(image_path):
        return False

    # Build the public image URL (GitHub Pages CDN).
    site_base = os.environ.get("SITE_BASE_URL", "").rstrip("/")
    image_url = f"{site_base}/comics/{folder}/comic.png" if site_base else None
    if not image_url:
        print(f"  {folder}: SITE_BASE_URL not set, skipping.", file=sys.stderr)
        return False

    # Read title from script.md if present.
    script_path = os.path.join(path, "script.md")
    title = folder
    if os.path.exists(script_path):
        with open(script_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith("# "):
                    title = line[2:].strip()
                    break

    print(f"  {folder}: creating Printful products for "{title}" …")
    products = {}
    for key in PRODUCT_CONFIGS:
        try:
            pid = create_sync_product(title, key, image_url)
            # Printful syncs to Etsy asynchronously; poll for the Etsy listing ID.
            url = etsy_listing_url(pid)
            if not url:
                # Etsy listing ID not yet available — link to shop root as fallback.
                shop = os.environ.get("ETSY_SHOP_NAME", "")
                url = f"https://www.etsy.com/shop/{shop}" if shop else "https://www.etsy.com"
            products[key] = {"id": pid, "url": url}
            print(f"    {key}: product #{pid} → {url}")
            time.sleep(1)  # gentle rate-limit between products
        except RuntimeError as e:
            print(f"    {key}: FAILED — {e}", file=sys.stderr)
            products[key] = {"id": None, "url": None, "error": str(e)}

    with open(printful_path, "w", encoding="utf-8") as f:
        json.dump({"products": products}, f, indent=2)
        f.write("\n")

    return True


def main():
    if not os.environ.get("PRINTFUL_API_KEY"):
        print("PRINTFUL_API_KEY not set — skipping Printful sync.")
        return
    if not os.environ.get("PRINTFUL_STORE_ID"):
        print("PRINTFUL_STORE_ID not set — skipping Printful sync.")
        return

    comics_dir = "comics"
    if not os.path.isdir(comics_dir):
        print("comics/ directory not found.")
        return

    changed = 0
    for folder in sorted(os.listdir(comics_dir)):
        path = os.path.join(comics_dir, folder)
        if not os.path.isdir(path):
            continue
        if not re.match(r"^\d+", folder):
            continue
        if process_comic(folder, path):
            changed += 1

    print(f"\nPrintful sync done. {changed} new product set(s) created.")


if __name__ == "__main__":
    main()
