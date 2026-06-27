// Deployed Cloudflare Worker URL (no trailing slash).
const WORKER_URL = 'https://human-readable-comics.aaron-visser.workers.dev';

const els = {
  seed: document.getElementById('seed'),
  title: document.getElementById('title'),
  format: document.getElementById('format'),
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
};

// Each entry: { image: dataURL, prompt: string, uploaded: boolean }
let generations = [];
let selected = -1;
let busy = false;

const MAX_DIM = 1500; // cap uploaded image dimensions — 1500px is plenty for a webcomic

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
  //els.generate.disabled = busy;
  //els.refresh.disabled = busy || generations.length === 0;
  els.upload.disabled = busy;
  els.submit.disabled = busy || selected < 0;
}

// Read a chosen file, normalise it to a PNG data URL via canvas (handles
// JPG -> PNG and caps dimensions), and add it as a selectable entry.
function handleFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    setStatus('Please choose a PNG or JPG image.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, MAX_DIM / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/png');
      generations.push({ image: dataUrl, prompt: '', uploaded: true });
      selected = generations.length - 1;
      showSelected();
      renderGallery();
      updateButtons();
      setStatus('Image ready. Add a title, then submit.');
    };
    img.onerror = () => setStatus('Could not read that image.', true);
    img.src = reader.result;
  };
  reader.onerror = () => setStatus('Could not read that file.', true);
  reader.readAsDataURL(file);
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

function submitXhr(payload) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${WORKER_URL}/submit`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 120000;

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
    xhr.ontimeout = () => reject(new Error('Upload timed out.'));

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

// els.generate.onclick = generate;
// els.refresh.onclick = generate;
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
