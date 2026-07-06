let comics = [];
let current = 0;
let variantIndex = -1; // -1 = canonical comic.png
let livingStoryboard = null;
let livingIndex = 0;
let livingRequest = 0;

// Base path (e.g. '/human-readable') used to build per-comic share URLs.
const SITE_BASE = window.location.pathname.replace(/\/\d+\/?$/, '').replace(/\/$/, '');

const els = {
  number:       document.getElementById('comic-number'),
  title:        document.getElementById('comic-title'),
  img:          document.getElementById('comic-img'),
  empty:        document.getElementById('comic-empty'),
  frame:        document.getElementById('comic-frame'),
  nav:          document.getElementById('comic-nav'),
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
  livingEntry:  document.getElementById('living-entry'),
  livingOpen:   document.getElementById('btn-living'),
  livingClose:  document.getElementById('btn-living-close'),
  publishedLiving: document.getElementById('published-living'),
  publishedStoryTitle: document.getElementById('published-story-title'),
  publishedStoryTheme: document.getElementById('published-story-theme'),
  publishedSceneStage: document.getElementById('published-scene-stage'),
  publishedSceneDots: document.getElementById('published-scene-dots'),
  publishedScenePrev: document.getElementById('published-scene-prev'),
  publishedSceneNext: document.getElementById('published-scene-next'),
  publishedPropInspector: document.getElementById('published-prop-inspector'),
  publishedPropClose: document.getElementById('published-prop-close'),
  publishedPropKind: document.getElementById('published-prop-kind'),
  publishedPropTitle: document.getElementById('published-prop-title'),
  publishedPropDetail: document.getElementById('published-prop-detail'),
  publishedPropLink: document.getElementById('published-prop-link'),
};

function clearElement(element) {
  while (element.firstChild) element.firstChild.remove();
}

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
  livingRequest++;
  livingStoryboard = null;
  livingIndex = 0;
  els.frame.hidden = false;
  els.nav.hidden = false;
  els.publishedLiving.hidden = true;
  els.publishedPropInspector.hidden = true;
  els.livingEntry.hidden = !comic.storyboard;

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
  trackView(comic.id, comic.title);

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

// GoatCounter auto-onload is disabled (see index.html) because this is a
// single-page app — the URL changes via history.replaceState, not a real
// navigation, so each comic view is recorded as its own virtual pageview.
function trackView(path, title) {
  if (window.goatcounter && window.goatcounter.count) {
    window.goatcounter.count({ path, title });
  }
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
  els.livingEntry.hidden = true;
  els.publishedLiving.hidden = true;
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
  if (!els.publishedLiving.hidden) {
    if (e.key === 'Escape') closePublishedLiving();
    if (e.key === 'ArrowLeft') goToLivingScene(livingIndex - 1);
    if (e.key === 'ArrowRight') goToLivingScene(livingIndex + 1);
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

// ---- Published Living Comic --------------------------------------------

function publishedSceneUrl(comic, filename) {
  if (!/^[a-zA-Z0-9._-]+$/.test(filename || '')) return '';
  const base = comic.image.split('/').slice(0, -1).join('/');
  return `${base}/scenes/${filename}`;
}

function publishedPlaceholder(message, spinner = false) {
  clearElement(els.publishedSceneStage);
  const placeholder = document.createElement('div');
  placeholder.className = 'scene-placeholder';
  if (spinner) {
    const icon = document.createElement('span');
    icon.className = 'spinner';
    placeholder.appendChild(icon);
  }
  placeholder.appendChild(document.createTextNode(message));
  els.publishedSceneStage.appendChild(placeholder);
}

async function openPublishedLiving() {
  const comic = comics[current];
  if (!comic?.storyboard) return;
  const requestId = ++livingRequest;
  livingStoryboard = null;
  livingIndex = 0;
  els.frame.hidden = true;
  els.nav.hidden = true;
  els.variantsStrip.hidden = true;
  els.livingEntry.hidden = true;
  els.publishedLiving.hidden = false;
  els.publishedStoryTitle.textContent = comic.title;
  els.publishedStoryTheme.textContent = '';
  publishedPlaceholder('Opening the scene archive…', true);

  try {
    const response = await fetch(comic.storyboard, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Unable to load storyboard (${response.status})`);
    const data = await response.json();
    if (requestId !== livingRequest) return;
    const scenes = Array.isArray(data.scenes)
      ? data.scenes.filter(scene => scene && publishedSceneUrl(comic, scene.file))
      : [];
    if (!scenes.length) throw new Error('This Living Comic has no readable scenes.');
    livingStoryboard = { ...data, scenes };
    els.publishedStoryTitle.textContent = data.title || comic.title;
    els.publishedStoryTheme.textContent = data.theme || '';
    renderPublishedScene();
  } catch (error) {
    if (requestId !== livingRequest) return;
    publishedPlaceholder(error.message || 'The Living Comic could not be loaded.');
  }
}

function closePublishedLiving() {
  livingRequest++;
  livingStoryboard = null;
  livingIndex = 0;
  els.publishedLiving.hidden = true;
  els.publishedPropInspector.hidden = true;
  els.frame.hidden = false;
  els.nav.hidden = false;
  const comic = comics[current];
  if (comic) {
    els.livingEntry.hidden = !comic.storyboard;
    renderVariantsStrip(comic);
  }
}

function showPublishedProp(prop) {
  els.publishedPropKind.textContent = prop.kind || 'object';
  els.publishedPropTitle.textContent = prop.label || 'Unlabelled prop';
  els.publishedPropDetail.textContent = prop.interaction_detail || prop.description || '';
  els.publishedPropLink.hidden = true;
  try {
    const url = new URL(prop.purchase_url);
    if (url.protocol === 'https:') {
      els.publishedPropLink.href = url.href;
      els.publishedPropLink.textContent = prop.interaction_label || 'view item';
      els.publishedPropLink.hidden = false;
    }
  } catch {
    // Empty and invalid links remain an in-world detail instead.
  }
  els.publishedPropInspector.hidden = false;
}

function renderPublishedScene() {
  const comic = comics[current];
  const scene = livingStoryboard?.scenes?.[livingIndex];
  if (!comic || !scene) return;
  clearElement(els.publishedSceneStage);
  els.publishedPropInspector.hidden = true;

  const figure = document.createElement('figure');
  figure.className = 'scene-figure';
  const image = new Image();
  image.src = publishedSceneUrl(comic, scene.file);
  image.alt = scene.description || `Scene ${livingIndex + 1}`;
  figure.appendChild(image);

  const caption = document.createElement('figcaption');
  const shot = document.createElement('span');
  shot.className = 'eyebrow';
  shot.textContent = `scene ${scene.id || livingIndex + 1} · ${scene.shot || 'shot'} · ${scene.location || ''}`;
  caption.appendChild(shot);
  const description = document.createElement('p');
  description.textContent = scene.description || '';
  caption.appendChild(description);

  const props = Array.isArray(scene.props) ? scene.props : [];
  if (props.length) {
    const propRow = document.createElement('div');
    propRow.className = 'scene-props';
    props.forEach(prop => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-chip';
      button.textContent = `+ ${prop.label || prop.id}`;
      button.title = prop.interaction_label || 'inspect';
      button.onclick = () => showPublishedProp(prop);
      propRow.appendChild(button);
    });
    caption.appendChild(propRow);
  }
  figure.appendChild(caption);
  els.publishedSceneStage.appendChild(figure);

  clearElement(els.publishedSceneDots);
  livingStoryboard.scenes.forEach((item, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'scene-dot ready' + (index === livingIndex ? ' active' : '');
    dot.setAttribute('aria-label', `Scene ${index + 1}`);
    dot.setAttribute('aria-current', index === livingIndex ? 'step' : 'false');
    dot.onclick = () => goToLivingScene(index);
    els.publishedSceneDots.appendChild(dot);
  });
  els.publishedScenePrev.disabled = livingIndex === 0;
  els.publishedSceneNext.disabled = livingIndex === livingStoryboard.scenes.length - 1;
}

function goToLivingScene(index) {
  if (!livingStoryboard || index < 0 || index >= livingStoryboard.scenes.length || index === livingIndex) return;
  livingIndex = index;
  renderPublishedScene();
}

els.livingOpen.onclick = openPublishedLiving;
els.livingClose.onclick = closePublishedLiving;
els.publishedScenePrev.onclick = () => goToLivingScene(livingIndex - 1);
els.publishedSceneNext.onclick = () => goToLivingScene(livingIndex + 1);
els.publishedPropClose.onclick = () => { els.publishedPropInspector.hidden = true; };

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
