let comics = [];
let current = 0;

async function init() {
  try {
    const resp = await fetch('comics.json');
    const data = await resp.json();
    comics = data.comics || [];
  } catch (_) {
    comics = [];
  }

  if (comics.length === 0) {
    showEmpty();
    return;
  }

  const hash = window.location.hash.slice(1);
  const idx = hash ? comics.findIndex(c => c.id === hash) : -1;
  current = idx >= 0 ? idx : comics.length - 1;

  render();
}

function render() {
  const comic = comics[current];

  document.getElementById('comic-number').textContent = `#${comic.id}`;
  document.getElementById('comic-title').textContent = comic.title;

  const img = document.getElementById('comic-img');
  img.src = comic.image;
  img.alt = comic.alt || comic.title;
  img.hidden = false;
  document.getElementById('comic-empty').hidden = true;

  document.getElementById('btn-first').disabled = current === 0;
  document.getElementById('btn-prev').disabled = current === 0;
  document.getElementById('btn-next').disabled = current === comics.length - 1;
  document.getElementById('btn-last').disabled = current === comics.length - 1;

  history.replaceState(null, '', `#${comic.id}`);
  document.title = `${comic.title} — Human-Readable`;
}

function showEmpty() {
  document.getElementById('comic-number').textContent = '';
  document.getElementById('comic-title').textContent = '';
  document.getElementById('comic-img').hidden = true;
  document.getElementById('comic-empty').hidden = false;
  ['btn-first', 'btn-prev', 'btn-random', 'btn-next', 'btn-last'].forEach(id => {
    document.getElementById(id).disabled = true;
  });
}

document.getElementById('btn-first').onclick = () => { current = 0; render(); };
document.getElementById('btn-random').onclick = () => {
  if (comics.length > 1) {
    let next;
    do { next = Math.floor(Math.random() * comics.length); } while (next === current);
    current = next;
    render();
  }
};
document.getElementById('btn-prev').onclick = () => { if (current > 0) { current--; render(); } };
document.getElementById('btn-next').onclick = () => { if (current < comics.length - 1) { current++; render(); } };
document.getElementById('btn-last').onclick = () => { current = comics.length - 1; render(); };

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  const idx = comics.findIndex(c => c.id === hash);
  if (idx >= 0 && idx !== current) {
    current = idx;
    render();
  }
});

init();
