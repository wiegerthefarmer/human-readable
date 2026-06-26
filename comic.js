let comics = [];
let current = 0;

const els = {
  number: document.getElementById('comic-number'),
  title: document.getElementById('comic-title'),
  img: document.getElementById('comic-img'),
  empty: document.getElementById('comic-empty'),
  first: document.getElementById('btn-first'),
  prev: document.getElementById('btn-prev'),
  random: document.getElementById('btn-random'),
  next: document.getElementById('btn-next'),
  last: document.getElementById('btn-last'),
  theme: document.getElementById('btn-theme'),
};

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

  if (comics.length === 0) {
    showEmpty();
    return;
  }

  const hash = window.location.hash.slice(1);
  const idx = hash ? comics.findIndex(c => c.id === hash || c.slug === hash) : -1;
  current = idx >= 0 ? idx : comics.length - 1;

  render();
}

function render() {
  const comic = comics[current];
  if (!comic) {
    showEmpty();
    return;
  }

  els.number.textContent = `#${comic.id}`;
  els.title.textContent = comic.title;

  els.img.src = comic.image;
  els.img.alt = comic.alt || comic.title;
  els.img.hidden = false;
  els.empty.hidden = true;

  els.first.disabled = current === 0;
  els.prev.disabled = current === 0;
  els.random.disabled = comics.length < 2;
  els.next.disabled = current === comics.length - 1;
  els.last.disabled = current === comics.length - 1;

  history.replaceState(null, '', `#${comic.id}`);
  document.title = `${comic.title} — Human-Readable`;

  preloadNeighbor(current + 1);
  preloadNeighbor(current - 1);
}

function preloadNeighbor(index) {
  const comic = comics[index];
  if (!comic || !comic.image) return;

  const img = new Image();
  img.src = comic.image;
}

function showEmpty() {
  els.number.textContent = '';
  els.title.textContent = '';
  els.img.hidden = true;
  els.empty.hidden = false;

  [els.first, els.prev, els.random, els.next, els.last].forEach(button => {
    button.disabled = true;
  });
}

function goTo(index) {
  if (index < 0 || index >= comics.length || index === current) return;
  current = index;
  render();
}

els.first.onclick = () => goTo(0);
els.prev.onclick = () => goTo(current - 1);
els.next.onclick = () => goTo(current + 1);
els.last.onclick = () => goTo(comics.length - 1);

els.random.onclick = () => {
  if (comics.length < 2) return;

  let next;
  do {
    next = Math.floor(Math.random() * comics.length);
  } while (next === current);

  goTo(next);
};

els.img.onclick = () => {
  if (current < comics.length - 1) goTo(current + 1);
};

window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  if (event.key === 'ArrowLeft') goTo(current - 1);
  if (event.key === 'ArrowRight') goTo(current + 1);
  if (event.key.toLowerCase() === 'r') els.random.click();
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  const idx = comics.findIndex(c => c.id === hash || c.slug === hash);

  if (idx >= 0 && idx !== current) {
    current = idx;
    render();
  }
});

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
