// Deployed Cloudflare Worker URL (no trailing slash).
const WORKER_URL = 'https://human-readable-comics.aaron-visser.workers.dev';

const els = {
  seed: document.getElementById('seed'),
  seedField: document.getElementById('seed-field'),
  title: document.getElementById('title'),
  format: document.getElementById('format'),
  formatField: document.getElementById('format-field'),
  generate: document.getElementById('btn-generate'),
  refresh: document.getElementById('btn-refresh'),
  upload: document.getElementById('btn-upload'),
  fileInput: document.getElementById('file-input'),
  submit: document.getElementById('btn-submit'),
  status: document.getElementById('status'),
  preview: document.getElementById('preview'),
  previewEmpty: document.getElementById('preview-empty'),
  gallery: document.getElementById('gallery'),
  theme: document.getElementById('btn-theme'),
  modeGenerate: document.getElementById('btn-mode-generate'),
  modeUpload: document.getElementById('btn-mode-upload'),
  introGenerate: document.getElementById('intro-generate'),
  introUpload: document.getElementById('intro-upload'),
  scriptPreview: document.getElementById('script-preview'),
  scriptConcept: document.getElementById('script-concept'),
  scriptPanels: document.getElementById('script-panels'),
  btnDraw: document.getElementById('btn-draw'),
  btnRewrite: document.getElementById('btn-rewrite'),
};

// Each entry: { image: dataURL, prompt: string, script: object, uploaded: boolean }
let generations = [];
let selected = -1;
let busy = false;
let mode = 'generate'; // 'generate' | 'upload'
let pendingScript = null;

function setMode(m) {
  mode = m;
  const gen = m === 'generate';
  els.modeGenerate.classList.toggle('active', gen);
  els.modeUpload.classList.toggle('active', !gen);
  els.introGenerate.hidden = !gen;
  els.introUpload.hidden = gen;
  els.generate.hidden = !gen;
  els.refresh.hidden = !gen;
  els.upload.hidden = gen;
  els.formatField.hidden = !gen;
  els.seedField.hidden = !gen;
  generations = [];
  selected = -1;
  pendingScript = null;
  els.scriptPreview.hidden = true;
  showSelected();
  renderGallery();
  updateButtons();
  setStatus('');
}

els.modeGenerate.onclick = () => setMode('generate');
els.modeUpload.onclick   = () => setMode('upload');


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
  els.refresh.disabled = busy || (generations.length === 0 && !pendingScript);
  els.upload.disabled = busy;
  els.submit.disabled = busy || selected < 0;
  els.btnDraw.disabled = busy;
  els.btnRewrite.disabled = busy;
}

function showScript(script) {
  pendingScript = script;
  els.scriptConcept.textContent = script.concept || '';
  els.scriptPanels.innerHTML = (script.panels || []).map(p => {
    const txt = p.text ? ` — <em>“${p.text}”</em>` : '';
    return `<li>${p.visual}${txt}</li>`;
  }).join('');
  els.scriptPreview.hidden = false;
}

function handleFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    setStatus('Please choose a PNG or JPG image.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    generations.push({ image: reader.result, prompt: '', uploaded: true });
    selected = generations.length - 1;
    showSelected();
    renderGallery();
    updateButtons();
    setStatus('Image ready. Add a title, then submit.');
  };
  reader.onerror = () => setStatus('Could not read that file.', true);
  reader.readAsDataURL(file);
}

async function writeScriptStep() {
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
  setStatus('Writing script…', false, true);

  try {
    const resp = await fetch(`${WORKER_URL}/write-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, format: els.format.value }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
    showScript(data.script);
    setStatus('Script ready — draw it or rewrite.');
  } catch (err) {
    setStatus(err.message || 'Script generation failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function drawStep() {
  if (busy) return;
  const seed = els.seed.value.trim();
  if (!WORKER_URL) {
    setStatus('The generator backend is not configured yet (set WORKER_URL in create.js).', true);
    return;
  }

  busy = true;
  updateButtons();
  setStatus('Drawing comic…', false, true);

  try {
    const resp = await fetch(`${WORKER_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, format: els.format.value, script: pendingScript }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);

    generations.push({ image: data.image, prompt: data.prompt, script: data.script });
    selected = generations.length - 1;
    showSelected();
    renderGallery();
    setStatus(`Generation ${generations.length} ready. Refresh to redraw, or submit.`);
  } catch (err) {
    setStatus(err.message || 'Generation failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

function submitXhr(payload) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${WORKER_URL}/submit`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 240000;

    let uploadSent = false;

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setStatus(`Uploading… ${pct}%`);
      }
    };
    xhr.upload.onload = () => { uploadSent = true; setStatus('Processing…', false, true); };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Request failed (${xhr.status})`));
      } catch {
        reject(new Error(`Invalid response (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error(
      uploadSent
        ? 'Connection dropped while the server was processing — your submission may have gone through. Check the repo\'s pull requests before retrying.'
        : 'Upload failed — check your connection.'
    ));
    xhr.ontimeout = () => reject(new Error(
      'Upload timed out — the server may still be processing. Check the repo\'s pull requests before retrying.'
    ));

    xhr.send(JSON.stringify(payload));
  });
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

  try {
    const g = generations[selected];
    const isUpload = !!g.uploaded;
    setStatus(isUpload ? 'Uploading your image… 0%' : 'Re-rendering at high quality…', false, !isUpload);

    const aiVariants = generations.filter(x => !x.uploaded);
    const data = await submitXhr({
      image: g.image,
      prompt: g.prompt,
      script: g.script || null,
      title,
      seed: els.seed.value.trim(),
      format: els.format.value,
      mode: isUpload ? 'upload' : 'generated',
      generations: isUpload ? [] : aiVariants,
    });

    const tail = isUpload ? 'queued for review.' : 'high-quality re-render saved.';
    setStatus(`Submitted! <a href="${data.url}" target="_blank" rel="noopener">Track it ›</a> — ${tail}`);
  } catch (err) {
    setStatus(err.message || 'Submission failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

els.generate.onclick = writeScriptStep;
els.refresh.onclick  = () => pendingScript ? drawStep() : writeScriptStep();
els.btnDraw.onclick  = drawStep;
els.btnRewrite.onclick = writeScriptStep;
els.submit.onclick = submit;
els.upload.onclick = () => els.fileInput.click();
els.fileInput.onchange = e => {
  handleFile(e.target.files[0]);
  e.target.value = ''; // allow re-selecting the same file
};

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
