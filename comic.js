let comics = [];
let current = 0;
let variantIndex = -1; // -1 = canonical comic.png

// Base path (e.g. '/human-readable') used to build per-comic share URLs.
const SITE_BASE = window.location.pathname.replace(/\/\d+\/?$/, '').replace(/\/$/, '');

const els = {
  number:       document.getElementById('comic-number'),
  title:        document.getElementById('comic-title'),
  img:          document.getElementById('comic-img'),
  empty:        document.getElementById('comic-empty'),
  first:        document.getElementById('btn-first'),
  prev:         document.getElementById('btn-prev'),
  random:       document.getElementById('btn-random'),
  next:         document.getElementById('btn-next'),
  last:         document.getElementById('btn-last'),
  theme:        document.getElementById('btn-theme'),
  variantsStrip: document.getElementById('variants-strip'),
  lightbox:     document.getElementById('lightbox'),
  lbImg:        document.getElementById('lb-img'),
  lbClose:      document.getElementById('lb-close'),
  lbDownload:   document.getElementById('lb-download'),
};

// ---- Init ---------------------------------------------------------------

async function init() {
  try {
    const resp = await fetch('comics.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Unable to load comics.json: ${resp.status}`);
    const data = await resp.json();
    comics = Array.isArray(data.comics) ? data.comics : [];
  } catch (err) {
    console.warn(err);
    comics = [];
  }

  if (comics.length === 0) { showEmpty(); return; }

  // Support both path-based URLs (/0007) and legacy hash URLs (#0007).
  const pathMatch = window.location.pathname.match(/\/(\d+)\/?$/);
  const requestedId = pathMatch ? pathMatch[1].padStart(4, '0') : window.location.hash.slice(1);
  const idx = requestedId ? comics.findIndex(c => c.id === requestedId || c.slug === requestedId) : -1;
  current = idx >= 0 ? idx : comics.length - 1;

  render();
}

// ---- Render -------------------------------------------------------------

function render() {
  const comic = comics[current];
  if (!comic) { showEmpty(); return; }

  variantIndex = -1;

  els.number.textContent = `#${comic.id}`;
  els.title.textContent = comic.title;
  setMainImage(comic.image, comic.alt || comic.title);

  els.first.disabled  = current === 0;
  els.prev.disabled   = current === 0;
  els.random.disabled = comics.length < 2;
  els.next.disabled   = current === comics.length - 1;
  els.last.disabled   = current === comics.length - 1;

  history.replaceState(null, '', `${SITE_BASE}/${comic.id}`);
  document.title = `${comic.title} — Human-Readable`;

  renderVariantsStrip(comic);
  preloadNeighbor(current + 1);
  preloadNeighbor(current - 1);
}

function setMainImage(src, alt) {
  els.img.src = src;
  els.img.alt = alt || '';
  els.img.hidden = false;
  els.empty.hidden = true;
}

function renderVariantsStrip(comic) {
  const variants = comic.variants || [];
  els.variantsStrip.innerHTML = '';
  els.variantsStrip.hidden = variants.length === 0;
  if (variants.length === 0) return;

  // Canonical thumbnail (the published comic.png).
  const canonical = makeThumb(comic.image, 'Published version', -1, true);
  els.variantsStrip.appendChild(canonical);

  variants.forEach((v, i) => {
    const label = v.selected ? `Generation (submitted)` : `Generation ${i + 1}`;
    const tooltip = [
      v.seed ? `Idea: ${v.seed}` : '',
      v.prompt ? `Prompt: ${v.prompt.slice(0, 200)}${v.prompt.length > 200 ? '…' : ''}` : '',
    ].filter(Boolean).join('\n\n');
    const thumb = makeThumb(v.image, tooltip || label, i, false);
    els.variantsStrip.appendChild(thumb);
  });
}

function makeThumb(src, tooltip, idx, isActive) {
  const img = document.createElement('img');
  img.src = src;
  img.className = 'variant-thumb' + (isActive ? ' active' : '');
  img.title = tooltip;
  img.onclick = () => selectVariant(idx);
  return img;
}

function selectVariant(idx) {
  const comic = comics[current];
  if (!comic) return;
  variantIndex = idx;
  const src   = idx === -1 ? comic.image : (comic.variants[idx]?.image || comic.image);
  const alt   = idx === -1 ? (comic.alt || comic.title) : (comic.variants[idx]?.seed || comic.title);
  setMainImage(src, alt);

  // Update active state in strip.
  const thumbs = els.variantsStrip.querySelectorAll('.variant-thumb');
  thumbs.forEach((t, i) => {
    // First thumb is canonical (idx -1), rest map to variant index i-1.
    t.classList.toggle('active', i === idx + 1);
  });
}

function preloadNeighbor(index) {
  const comic = comics[index];
  if (!comic || !comic.image) return;
  new Image().src = comic.image;
}

function showEmpty() {
  els.number.textContent = '';
  els.title.textContent  = '';
  els.img.hidden  = true;
  els.empty.hidden = false;
  els.variantsStrip.hidden = true;
  [els.first, els.prev, els.random, els.next, els.last].forEach(b => { b.disabled = true; });
}

function goTo(index) {
  if (index < 0 || index >= comics.length || index === current) return;
  current = index;
  render();
}

// ---- Nav ----------------------------------------------------------------

els.first.onclick  = () => goTo(0);
els.prev.onclick   = () => goTo(current - 1);
els.next.onclick   = () => goTo(current + 1);
els.last.onclick   = () => goTo(comics.length - 1);

els.random.onclick = () => {
  if (comics.length < 2) return;
  let next;
  do { next = Math.floor(Math.random() * comics.length); } while (next === current);
  goTo(next);
};

window.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (document.getElementById('lightbox') && !els.lightbox.hidden) {
    if (e.key === 'Escape') closeLightbox();
    return;
  }
  if (e.key === 'ArrowLeft')        goTo(current - 1);
  if (e.key === 'ArrowRight')       goTo(current + 1);
  if (e.key.toLowerCase() === 'r')  els.random.click();
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  const idx  = comics.findIndex(c => c.id === hash || c.slug === hash);
  if (idx >= 0 && idx !== current) { current = idx; render(); }
});

// ---- Lightbox -----------------------------------------------------------

function openLightbox() {
  const comic   = comics[current];
  if (!comic) return;
  const src     = variantIndex === -1 ? comic.image : (comic.variants[variantIndex]?.image || comic.image);
  const alt     = comic.alt || comic.title;
  els.lbImg.src = src;
  els.lbImg.alt = alt;
  els.lbDownload.href = src;
  els.lbDownload.download = `${comic.slug || comic.id}.png`;

  // Wire order links with the current image URL embedded.
  const orderLinks = els.lightbox.querySelectorAll('.lb-order');
  orderLinks.forEach(a => {
    a.href = printfulOrderUrl(a.dataset.product, src, comic.title);
  });

  els.lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  els.lightbox.hidden = true;
  document.body.style.overflow = '';
}

function printfulOrderUrl(product, imageUrl, title) {
  const comic = comics[current];
  const stored = comic?.printfulProducts?.[product];
  if (stored) return stored;
  // Printful store not yet configured for this comic — link to the store root.
  return 'https://www.printful.com';
}

els.img.style.cursor = 'zoom-in';
els.img.onclick = openLightbox;

els.lbClose.onclick = closeLightbox;
els.lightbox.querySelector('.lightbox-backdrop').onclick = closeLightbox;

// ---- Theme --------------------------------------------------------------

const THEMES = ['', 'green', 'amber'];

function applyTheme(t) {
  document.documentElement.className = t;
  els.theme.textContent = t || 'light';
  t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme');
}

els.theme.onclick = () => {
  const idx = THEMES.indexOf(document.documentElement.className);
  applyTheme(THEMES[(idx + 1) % THEMES.length]);
};

const saved = localStorage.getItem('theme');
if (saved && THEMES.includes(saved)) applyTheme(saved);

init();
