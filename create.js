// Set this after deploying the Worker. It can also be supplied before this
// script as window.HUMAN_READABLE_WORKER_URL.
const WORKER_URL = (window.HUMAN_READABLE_WORKER_URL || '').replace(/\/$/, '');

const els = {
  seed: document.getElementById('seed'),
  title: document.getElementById('title'),
  format: document.getElementById('format'),
  sceneCount: document.getElementById('scene-count'),
  sundayFormatField: document.getElementById('sunday-format-field'),
  livingScenesField: document.getElementById('living-scenes-field'),
  modeSunday: document.getElementById('mode-sunday'),
  modeLiving: document.getElementById('mode-living'),
  modeDescription: document.getElementById('mode-description'),
  generate: document.getElementById('btn-generate'),
  refresh: document.getElementById('btn-refresh'),
  submit: document.getElementById('btn-submit'),
  status: document.getElementById('status'),
  sundayView: document.getElementById('sunday-view'),
  preview: document.getElementById('preview'),
  previewEmpty: document.getElementById('preview-empty'),
  gallery: document.getElementById('gallery'),
  livingView: document.getElementById('living-view'),
  storyTitle: document.getElementById('story-title'),
  storyTheme: document.getElementById('story-theme'),
  sceneProgress: document.getElementById('scene-progress'),
  sceneStage: document.getElementById('scene-stage'),
  sceneDots: document.getElementById('scene-dots'),
  scenePrev: document.getElementById('scene-prev'),
  sceneNext: document.getElementById('scene-next'),
  propInspector: document.getElementById('prop-inspector'),
  propClose: document.getElementById('prop-close'),
  propKind: document.getElementById('prop-kind'),
  propTitle: document.getElementById('prop-title'),
  propDetail: document.getElementById('prop-detail'),
  propLink: document.getElementById('prop-link'),
  assembly: document.getElementById('assembly'),
  assemblyLayout: document.getElementById('assembly-layout'),
  assemblyPreview: document.getElementById('assembly-preview'),
  downloadAssembly: document.getElementById('btn-download-assembly'),
  printAssembly: document.getElementById('btn-print-assembly'),
  theme: document.getElementById('btn-theme'),
};

let mode = 'sunday';
let generations = [];
let selected = -1;
let storyboard = null;
let scenes = [];
let currentScene = 0;
let assemblyDataUrl = '';
let busy = false;
let runId = 0;

function clearElement(element) {
  while (element.firstChild) element.firstChild.remove();
}

function setStatus(message, isError = false, spinner = false) {
  els.status.className = 'create-status' + (isError ? ' error' : '');
  clearElement(els.status);
  if (spinner) {
    const icon = document.createElement('span');
    icon.className = 'spinner';
    els.status.appendChild(icon);
  }
  els.status.appendChild(document.createTextNode(message));
}

function setSubmissionStatus(data) {
  els.status.className = 'create-status';
  clearElement(els.status);
  els.status.appendChild(document.createTextNode('Submitted! Draft PR opened: '));
  const link = document.createElement('a');
  link.href = data.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = `#${data.number}`;
  els.status.appendChild(link);
  els.status.appendChild(document.createTextNode(' — ready for review.'));
}

async function api(path, body) {
  if (!WORKER_URL) {
    throw new Error('The generator backend is not configured yet (set HUMAN_READABLE_WORKER_URL in create.html).');
  }
  const response = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The generator returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
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
  clearElement(els.gallery);
  generations.forEach((generation, index) => {
    const image = new Image();
    image.src = generation.image;
    image.alt = `Generation ${index + 1}`;
    image.className = index === selected ? 'selected' : '';
    image.title = `Generation ${index + 1}`;
    image.onclick = () => {
      selected = index;
      showSelected();
      renderGallery();
      updateButtons();
    };
    els.gallery.appendChild(image);
  });
}

function allScenesReady() {
  return scenes.length > 0 && scenes.every(item => item.status === 'ready');
}

function updateButtons() {
  els.generate.disabled = busy;
  els.refresh.disabled = busy || mode !== 'sunday' || generations.length === 0;
  els.submit.disabled = busy || (mode === 'sunday' ? selected < 0 : !allScenesReady());
}

function switchMode(nextMode) {
  mode = nextMode;
  const living = mode === 'living';
  els.modeSunday.classList.toggle('active', !living);
  els.modeLiving.classList.toggle('active', living);
  els.modeSunday.setAttribute('aria-selected', String(!living));
  els.modeLiving.setAttribute('aria-selected', String(living));
  els.sundayFormatField.hidden = living;
  els.livingScenesField.hidden = !living;
  els.sundayView.hidden = living;
  els.livingView.hidden = !living;
  els.refresh.hidden = living;
  els.generate.textContent = living ? 'Build living comic' : 'Generate page';
  els.submit.textContent = living ? 'Submit story' : 'Submit pick';
  els.modeDescription.textContent = living
    ? 'A storyboard becomes a queue of cinematic shots. Read the first while the next two draw in the background.'
    : 'Generate a complete, print-ready comic composition.';
  setStatus('');
  updateButtons();
}

async function generateSunday() {
  const seed = els.seed.value.trim();
  if (!seed) {
    setStatus('Enter an idea first.', true);
    return;
  }
  busy = true;
  updateButtons();
  setStatus('Drawing the full page…', false, true);
  try {
    const data = await api('/generate', { seed, format: els.format.value });
    generations.push({ image: data.image, prompt: data.prompt });
    selected = generations.length - 1;
    showSelected();
    renderGallery();
    setStatus(`Generation ${generations.length} ready. Refresh for another, or submit this one.`);
  } catch (error) {
    setStatus(error.message || 'Generation failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

function sceneLabel(index) {
  const item = scenes[index];
  if (!item) return `Scene ${index + 1}`;
  if (item.status === 'ready') return `Scene ${index + 1}, ready`;
  if (item.status === 'rendering') return `Scene ${index + 1}, rendering`;
  if (item.status === 'error') return `Scene ${index + 1}, failed`;
  return `Scene ${index + 1}, queued`;
}

function renderSceneDots() {
  clearElement(els.sceneDots);
  scenes.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `scene-dot ${item.status}` + (index === currentScene ? ' active' : '');
    button.setAttribute('aria-label', sceneLabel(index));
    button.setAttribute('aria-current', index === currentScene ? 'step' : 'false');
    button.title = sceneLabel(index);
    button.onclick = () => {
      currentScene = index;
      closePropInspector();
      renderCurrentScene();
    };
    els.sceneDots.appendChild(button);
  });
}

function showPropInspector(prop) {
  els.propKind.textContent = prop.kind || 'object';
  els.propTitle.textContent = prop.label;
  els.propDetail.textContent = prop.interaction_detail || prop.description;
  els.propLink.hidden = true;
  try {
    const url = new URL(prop.purchase_url);
    if (url.protocol === 'https:') {
      els.propLink.href = url.href;
      els.propLink.hidden = false;
      els.propLink.textContent = prop.interaction_label || 'view item';
    }
  } catch {
    // Empty and invalid purchase links simply remain a behind-the-scenes detail.
  }
  els.propInspector.hidden = false;
}

function closePropInspector() {
  els.propInspector.hidden = true;
}

function placeholderFor(item, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'scene-placeholder';
  if (item?.status === 'rendering') {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    wrapper.appendChild(spinner);
    wrapper.appendChild(document.createTextNode(`Scene ${index + 1} is drawing…`));
  } else if (item?.status === 'error') {
    const message = document.createElement('p');
    message.textContent = item.error || 'This scene could not be rendered.';
    wrapper.appendChild(message);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'retry scene';
    retry.onclick = () => retryScene(index);
    wrapper.appendChild(retry);
  } else {
    wrapper.textContent = `Scene ${index + 1} is queued…`;
  }
  return wrapper;
}

function renderCurrentScene() {
  clearElement(els.sceneStage);
  const item = scenes[currentScene];
  const scene = storyboard?.scenes?.[currentScene];
  if (!item || item.status !== 'ready') {
    els.sceneStage.appendChild(placeholderFor(item, currentScene));
  } else {
    const figure = document.createElement('figure');
    figure.className = 'scene-figure';
    const image = new Image();
    image.src = item.image;
    image.alt = scene.description || `Scene ${currentScene + 1}`;
    figure.appendChild(image);

    const caption = document.createElement('figcaption');
    const shot = document.createElement('span');
    shot.className = 'eyebrow';
    shot.textContent = `scene ${scene.id} · ${scene.shot} · ${scene.location}`;
    caption.appendChild(shot);
    const description = document.createElement('p');
    description.textContent = scene.description;
    caption.appendChild(description);

    if (scene.props.length) {
      const props = document.createElement('div');
      props.className = 'scene-props';
      scene.props.forEach(prop => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'prop-chip';
        button.textContent = `+ ${prop.label}`;
        button.title = prop.interaction_label || 'inspect';
        button.onclick = () => showPropInspector(prop);
        props.appendChild(button);
      });
      caption.appendChild(props);
    }
    figure.appendChild(caption);
    els.sceneStage.appendChild(figure);
  }

  els.scenePrev.disabled = currentScene <= 0;
  els.sceneNext.disabled = currentScene >= scenes.length - 1;
  renderSceneDots();
}

function updateLivingProgress() {
  const complete = scenes.filter(item => item.status === 'ready').length;
  const rendering = scenes.filter(item => item.status === 'rendering').length;
  els.sceneProgress.textContent = `${complete} / ${scenes.length} scenes`;
  if (complete < scenes.length) {
    setStatus(`${complete} scenes ready · ${rendering} drawing · staying ahead…`, false, true);
  }
}

async function renderScene(index, activeRun) {
  scenes[index].status = 'rendering';
  if (index === currentScene) renderCurrentScene();
  else renderSceneDots();
  updateLivingProgress();
  try {
    const data = await api('/scene', {
      storyboard,
      sceneId: storyboard.scenes[index].id,
    });
    if (activeRun !== runId) return;
    scenes[index] = { status: 'ready', image: data.image, prompt: data.prompt };
  } catch (error) {
    if (activeRun !== runId) return;
    scenes[index] = { status: 'error', error: error.message || 'Scene generation failed.' };
  }
  if (index === currentScene || (index === 0 && currentScene === 0)) renderCurrentScene();
  else renderSceneDots();
  updateLivingProgress();
}

async function runSceneQueue(activeRun) {
  let next = 0;
  const worker = async () => {
    while (next < scenes.length && activeRun === runId) {
      const index = next++;
      await renderScene(index, activeRun);
    }
  };
  await Promise.all([worker(), worker()]);
  if (activeRun !== runId) return;
  busy = false;
  if (allScenesReady()) {
    setStatus('Every scene is ready. Explore the props or reshape the story below.');
    els.assembly.hidden = false;
    await buildAssembly();
  } else {
    setStatus('The story is mostly ready. Retry the marked scenes to finish.', true);
  }
  updateButtons();
}

async function generateLiving() {
  const seed = els.seed.value.trim();
  if (!seed) {
    setStatus('Enter an idea first.', true);
    return;
  }
  const activeRun = ++runId;
  busy = true;
  storyboard = null;
  scenes = [];
  currentScene = 0;
  assemblyDataUrl = '';
  els.assembly.hidden = true;
  els.propInspector.hidden = true;
  els.storyTitle.textContent = 'Building story…';
  els.storyTheme.textContent = '';
  els.sceneProgress.textContent = 'storyboard';
  clearElement(els.sceneDots);
  clearElement(els.sceneStage);
  els.sceneStage.appendChild(placeholderFor({ status: 'rendering' }, 0));
  setStatus('Writing the outline and continuity map…', false, true);
  updateButtons();

  try {
    const data = await api('/storyboard', {
      seed,
      sceneCount: Number(els.sceneCount.value),
    });
    if (activeRun !== runId) return;
    storyboard = data.storyboard;
    scenes = storyboard.scenes.map(() => ({ status: 'queued' }));
    els.storyTitle.textContent = storyboard.title;
    els.storyTheme.textContent = storyboard.theme;
    if (!els.title.value.trim()) els.title.value = storyboard.title;
    renderCurrentScene();
    updateLivingProgress();
    await runSceneQueue(activeRun);
  } catch (error) {
    if (activeRun !== runId) return;
    busy = false;
    setStatus(error.message || 'The storyboard could not be created.', true);
    clearElement(els.sceneStage);
    els.sceneStage.appendChild(placeholderFor({ status: 'error', error: error.message }, 0));
    updateButtons();
  }
}

async function retryScene(index) {
  if (!storyboard || scenes[index]?.status === 'rendering') return;
  busy = true;
  updateButtons();
  await renderScene(index, runId);
  busy = false;
  if (allScenesReady()) {
    setStatus('Every scene is ready. Explore the props or reshape the story below.');
    els.assembly.hidden = false;
    await buildAssembly();
  }
  updateButtons();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawContained(context, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function buildAssembly() {
  if (!allScenesReady()) return;
  const images = await Promise.all(scenes.map(item => loadImage(item.image)));
  const layout = els.assemblyLayout.value;
  const canvas = document.createElement('canvas');
  const header = 120;
  let columns;
  let rows;
  let cellWidth;
  let cellHeight;

  if (layout === 'spread') {
    rows = 2;
    columns = Math.ceil(images.length / rows);
    cellWidth = 640;
    cellHeight = 427;
  } else if (layout === 'vertical') {
    columns = 2;
    rows = Math.ceil(images.length / columns);
    cellWidth = 540;
    cellHeight = Math.min(350, Math.floor((1920 - header) / rows));
  } else {
    columns = 3;
    rows = Math.ceil(images.length / columns);
    cellWidth = 640;
    cellHeight = 427;
  }

  canvas.width = layout === 'vertical' ? 1080 : columns * cellWidth;
  canvas.height = layout === 'vertical' ? 1920 : header + rows * cellHeight;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fffefb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1a1a1a';
  context.font = 'bold 34px Courier New, monospace';
  context.textBaseline = 'middle';
  context.fillText(storyboard.title.slice(0, 60), 28, header / 2);
  context.font = '18px Courier New, monospace';
  context.textAlign = 'right';
  context.fillText('HUMAN-READABLE', canvas.width - 28, header / 2);
  context.textAlign = 'left';

  const usedHeight = rows * cellHeight;
  const offsetY = layout === 'vertical' ? header + Math.max(0, (canvas.height - header - usedHeight) / 2) : header;
  images.forEach((image, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = offsetY + row * cellHeight;
    context.strokeStyle = '#1a1a1a';
    context.lineWidth = 3;
    context.strokeRect(x, y, cellWidth, cellHeight);
    drawContained(context, image, x + 8, y + 8, cellWidth - 16, cellHeight - 16);
  });

  assemblyDataUrl = canvas.toDataURL('image/png');
  els.assemblyPreview.src = assemblyDataUrl;
  els.assemblyPreview.alt = `${storyboard.title}, assembled as ${els.assemblyLayout.options[els.assemblyLayout.selectedIndex].text}`;
}

async function submit() {
  const title = els.title.value.trim();
  if (!title) {
    setStatus('Give the comic a title before submitting.', true);
    els.title.focus();
    return;
  }
  busy = true;
  updateButtons();
  setStatus(mode === 'living' ? 'Saving the story world…' : 'Re-rendering at high quality…', false, true);

  try {
    let body;
    if (mode === 'living') {
      if (!assemblyDataUrl) await buildAssembly();
      body = {
        mode: 'living',
        image: assemblyDataUrl,
        title,
        seed: els.seed.value.trim(),
        layout: els.assemblyLayout.value,
        storyboard,
        scenes: scenes.map((item, index) => ({
          id: storyboard.scenes[index].id,
          image: item.image,
          prompt: item.prompt,
        })),
      };
    } else {
      const generation = generations[selected];
      body = {
        mode: 'sunday',
        image: generation.image,
        prompt: generation.prompt,
        title,
        seed: els.seed.value.trim(),
        format: els.format.value,
        generations,
      };
    }
    const data = await api('/submit', body);
    setSubmissionStatus(data);
  } catch (error) {
    setStatus(error.message || 'Submission failed.', true);
  } finally {
    busy = false;
    updateButtons();
  }
}

els.modeSunday.onclick = () => switchMode('sunday');
els.modeLiving.onclick = () => switchMode('living');
els.generate.onclick = () => mode === 'living' ? generateLiving() : generateSunday();
els.refresh.onclick = generateSunday;
els.submit.onclick = submit;
els.scenePrev.onclick = () => {
  if (currentScene > 0) {
    currentScene--;
    closePropInspector();
    renderCurrentScene();
  }
};
els.sceneNext.onclick = () => {
  if (currentScene < scenes.length - 1) {
    currentScene++;
    closePropInspector();
    renderCurrentScene();
  }
};
els.propClose.onclick = closePropInspector;
els.assemblyLayout.onchange = buildAssembly;
els.downloadAssembly.onclick = () => {
  if (!assemblyDataUrl) return;
  const link = document.createElement('a');
  link.href = assemblyDataUrl;
  link.download = `${(storyboard?.title || 'living-comic').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${els.assemblyLayout.value}.png`;
  link.click();
};
els.printAssembly.onclick = () => window.print();

window.addEventListener('keydown', event => {
  if (mode !== 'living' || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft') els.scenePrev.click();
  if (event.key === 'ArrowRight') els.sceneNext.click();
  if (event.key === 'Escape') closePropInspector();
});

const THEMES = ['', 'green', 'amber'];

function applyTheme(theme) {
  document.documentElement.className = theme;
  els.theme.textContent = theme || 'light';
  theme ? localStorage.setItem('theme', theme) : localStorage.removeItem('theme');
}

els.theme.onclick = () => {
  const index = THEMES.indexOf(document.documentElement.className);
  applyTheme(THEMES[(index + 1) % THEMES.length]);
};

const saved = localStorage.getItem('theme');
if (saved && THEMES.includes(saved)) applyTheme(saved);

switchMode('sunday');
