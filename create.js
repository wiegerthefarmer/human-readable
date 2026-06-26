// Set this to your deployed Cloudflare Worker URL (no trailing slash),
// e.g. "https://human-readable-comics.your-subdomain.workers.dev".
const WORKER_URL = '';

const els = {
  seed: document.getElementById('seed'),
  title: document.getElementById('title'),
  format: document.getElementById('format'),
  generate: document.getElementById('btn-generate'),
  refresh: document.getElementById('btn-refresh'),
  submit: document.getElementById('btn-submit'),
  status: document.getElementById('status'),
  preview: document.getElementById('preview'),
  previewEmpty: document.getElementById('preview-empty'),
  gallery: document.getElementById('gallery'),
  theme: document.getElementById('btn-theme'),
};

// Each generation: { image: dataURL, prompt: string }
let generations = [];
let selected = -1;
let busy = false;

function setStatus(msg, isError = false, spinner = false) {
  els.status.className = 'create-status' + (isError ? ' error' : '');
  els.status.innerHTML = (spinner ? '<span class="spinner"></span>' : '') + msg;
}

function showSelected() {
  if (selected < 0) {
    els.preview.hidden = true;
    els.previewEmpty.hidden = false;
    return;
  }
  els.preview.src = generations[selected].image;
  els.preview.alt = els.seed.value.trim() || 'Generated comic preview';
  els.preview.hidden = false;
  els.previewEmpty.hidden = true;
}

function renderGallery() {
  els.gallery.innerHTML = '';
  generations.forEach((g, i) => {
    const img = new Image();
    img.src = g.image;
    img.className = i === selected ? 'selected' : '';
    img.title = `Generation ${i + 1}`;
    img.onclick = () => {
      selected = i;
      showSelected();
      renderGallery();
      updateButtons();
    };
    els.gallery.appendChild(img);
  });
}

function updateButtons() {
  els.generate.disabled = busy;
  els.refresh.disabled = busy || generations.length === 0;
  els.submit.disabled = busy || selected < 0;
}

async function generate() {
  if (busy) return;
  const seed = els.seed.value.trim();
  if (!seed) {
    setStatus('Enter an idea first.', true);
    return;
  }
  if (!WORKER_URL) {
    setStatus('The generator backend is not configured yet (set WORKER_URL in create.js).', true);
    return;
  }

  busy = true;
  updateButtons();
  setStatus('Drawing…', false, true);

  try {
    const resp = await fetch(`${WORKER_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, format: els.format.value }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);

    generations.push({ image: data.image, prompt: data.prompt });
    selected = generations.length - 1;
    showSelected();
    renderGallery();
    setStatus(`Generation ${generations.length} ready. Refresh for another, or submit this one.`);
  } catch (err) {
    setStatus(err.message || 'Generation failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function submit() {
  if (busy || selected < 0) return;
  const title = els.title.value.trim();
  if (!title) {
    setStatus('Give the comic a title before submitting.', true);
    els.title.focus();
    return;
  }

  busy = true;
  updateButtons();
  setStatus('Submitting…', false, true);

  try {
    const g = generations[selected];
    const resp = await fetch(`${WORKER_URL}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: g.image,
        prompt: g.prompt,
        title,
        seed: els.seed.value.trim(),
        format: els.format.value,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);

    setStatus(`Submitted! Draft pull request opened: <a href="${data.url}" target="_blank" rel="noopener">#${data.number}</a>`);
  } catch (err) {
    setStatus(err.message || 'Submission failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

els.generate.onclick = generate;
els.refresh.onclick = generate;
els.submit.onclick = submit;

// Theme toggle — identical to the reader page.
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

updateButtons();
