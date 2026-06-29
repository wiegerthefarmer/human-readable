// Deployed Cloudflare Worker URL (no trailing slash).
const WORKER_URL = 'https://human-readable-comics.aaron-visser.workers.dev';

const els = {
  seed: document.getElementById('seed'),
  seedField: document.getElementById('seed-field'),
  title: document.getElementById('title'),
  format: document.getElementById('format'),
  formatField: document.getElementById('format-field'),
  generate: document.getElementById('btn-generate'),
  draw: document.getElementById('btn-draw'),
  rewrite: document.getElementById('btn-rewrite'),
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
};

// Enforce preview width after load and on rotation — CSS width:100% can be
// ignored by Safari for large data-URL images, so we reinforce it inline.
function constrainPreview() {
  if (els.preview.hidden) return;
  els.preview.style.width = '100%';
  els.preview.style.maxWidth = '100%';
  els.preview.style.height = 'auto';
}
window.addEventListener('resize', constrainPreview);

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
  els.draw.hidden = true;
  els.rewrite.hidden = true;
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not load a generated panel.'));
    if (src.startsWith('data:')) {
      // iOS Safari fails on large data URLs as img.src; use a Blob URL instead.
      const comma = src.indexOf(',');
      const mime = src.slice(5, src.indexOf(';')) || 'image/png';
      const bytes = Uint8Array.from(atob(src.slice(comma + 1)), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.src = url;
    } else {
      img.onload = () => resolve(img);
      img.src = src;
    }
  });
}

async function stitchPanelImages(panelImages, stitch) {
  if (!panelImages?.length || !stitch) {
    throw new Error('No panel images returned to stitch.');
  }

  const cols = stitch.cols || 1;
  const rows = stitch.rows || Math.ceil(panelImages.length / cols);
  const panelSize = stitch.panelSize || 1024;
  const gutter = stitch.gutter || 0;
  const border = stitch.border || 8;
  const width = cols * panelSize + (cols - 1) * gutter;
  const height = rows * panelSize + (rows - 1) * gutter;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  const imgs = await Promise.all(panelImages.map(loadImage));
  imgs.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (panelSize + gutter);
    const y = row * (panelSize + gutter);
    ctx.drawImage(img, x, y, panelSize, panelSize);
  });

  ctx.strokeStyle = '#000';
  ctx.lineWidth = border;
  ctx.lineJoin = 'miter';

  // Outer border.
  ctx.strokeRect(border / 2, border / 2, width - border, height - border);

  // Internal panel dividers. These are deterministic and never crop artwork.
  for (let c = 1; c < cols; c++) {
    const x = c * panelSize + (c - 0.5) * gutter;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = r * panelSize + (r - 0.5) * gutter;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

function showSelected() {
  if (selected < 0) {
    els.preview.hidden = true;
    els.previewEmpty.hidden = false;
    return;
  }
  els.preview.onload = constrainPreview;
  els.preview.src = generations[selected].image;
  els.preview.alt = els.seed.value.trim() || 'Generated comic preview';
  els.preview.hidden = false;
  els.previewEmpty.hidden = true;
  constrainPreview();
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
  els.draw.disabled = busy;
  els.rewrite.disabled = busy;
  els.upload.disabled = busy;
  els.submit.disabled = busy || selected < 0;
}

function showScript(script) {
  pendingScript = script;
  els.scriptConcept.textContent = script.concept || '';
  els.scriptPanels.innerHTML = (script.panels || []).map(p => {
    const txt = p.text ? ` — <em>”${p.text}”</em>` : '';
    return `<li>${p.visual}${txt}</li>`;
  }).join('');
  els.scriptPreview.hidden = false;
  // Swap buttons: hide “Write script”, reveal “Draw” + “New script”
  els.generate.hidden = true;
  els.draw.hidden = false;
  els.rewrite.hidden = false;
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
  setStatus('Drawing…', false, true);

  const body = JSON.stringify({ seed, format: els.format.value, script: pendingScript });
  const fetchOpts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };

  // Fire quick preview and full panel generation in parallel.
  const quickPromise = fetch(`${WORKER_URL}/quick-preview`, fetchOpts);
  const fullPromise  = fetch(`${WORKER_URL}/generate`, fetchOpts);

  let quickIdx = -1;

  // Show quick preview as soon as it arrives.
  try {
    const qResp = await quickPromise;
    const qData = await qResp.json();
    if (!qResp.ok) throw new Error(qData.error || `Quick preview failed (${qResp.status})`);
    generations.push({
      image: qData.image,
      prompt: '',
      script: qData.script || pendingScript,
      panelImages: [],
      panelPrompts: [],
      stitch: null,
      isQuickPreview: true,
    });
    quickIdx = generations.length - 1;
    selected = quickIdx;
    showSelected();
    renderGallery();
    updateButtons();
    setStatus('Preview ready — upgrading to full quality…', false, true);
  } catch (err) {
    setStatus(`Quick preview: ${err.message} — still rendering full quality…`, false, true);
  }

  // Wait for full quality panels, then stitch and replace the preview.
  try {
    const resp = await fullPromise;
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);

    let image = data.image;
    if (data.panelImages?.length) {
      setStatus('Stitching panels…', false, true);
      image = await stitchPanelImages(data.panelImages, data.stitch);
    }

    const gen = {
      image,
      prompt: data.prompt,
      script: data.script,
      panelImages: data.panelImages || [],
      panelPrompts: data.panelPrompts || [],
      stitch: data.stitch || null,
    };

    if (quickIdx >= 0) {
      generations[quickIdx] = gen;
    } else {
      generations.push(gen);
      selected = generations.length - 1;
    }
    showSelected();
    renderGallery();
    setStatus(`Generation ${quickIdx >= 0 ? quickIdx + 1 : generations.length} ready. Refresh to redraw, or submit.`);
  } catch (err) {
    setStatus(err.message || 'Full generation failed.', true);
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
    setStatus(isUpload ? 'Uploading your image… 0%' : 'Uploading deterministic comic…', false, !isUpload);

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

    const tail = isUpload ? 'queued for review.' : 'stitched comic saved.';
    setStatus(`Submitted! <a href="${data.url}" target="_blank" rel="noopener">Track it ›</a> — ${tail}`);
  } catch (err) {
    setStatus(err.message || 'Submission failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

els.generate.onclick = writeScriptStep;
els.draw.onclick     = drawStep;
els.rewrite.onclick  = writeScriptStep;
els.submit.onclick   = submit;
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
