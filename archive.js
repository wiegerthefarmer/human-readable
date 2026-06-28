const SITE_BASE = window.location.pathname.replace(/\/archive\.html$/, '').replace(/\/$/, '');

async function init() {
  const grid = document.getElementById('archive-grid');
  try {
    const r = await fetch(`${SITE_BASE}/comics.json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const comics = (data.comics || []).slice().reverse();

    if (comics.length === 0) {
      grid.innerHTML = '<div class="comic-empty">No comics yet. Check back soon.</div>';
      return;
    }

    grid.innerHTML = comics.map(c => `
      <a class="archive-item" href="${SITE_BASE}/${c.id}" title="${c.title}">
        <img src="${SITE_BASE}/${c.image}" alt="${c.alt || c.title}" loading="lazy">
        <div class="archive-item-meta">
          <div class="archive-item-num">#${c.id}</div>
          <div class="archive-item-title">${c.title}</div>
        </div>
      </a>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div class="comic-empty">Could not load archive.</div>`;
  }
}

// Theme toggle
const THEMES = ['', 'green', 'amber'];

function applyTheme(t) {
  document.documentElement.className = t;
  document.getElementById('btn-theme').textContent = t || 'light';
  t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme');
}

document.getElementById('btn-theme').onclick = () => {
  const idx = THEMES.indexOf(document.documentElement.className);
  applyTheme(THEMES[(idx + 1) % THEMES.length]);
};

const saved = localStorage.getItem('theme');
if (saved && THEMES.includes(saved)) applyTheme(saved);

init();
