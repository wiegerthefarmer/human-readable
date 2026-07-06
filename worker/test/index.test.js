import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import worker, {
  buildScenePrompt,
  normalizeStoryboard,
  storyboardSchema,
} from '../src/index.js';

const rawStoryboard = {
  title: 'The Pager Knows',
  theme: 'Operational folklore',
  style_anchor: 'Detailed server rooms and restrained expressions.',
  accent: 'orange backpack',
  protagonist: {
    id: 'Cool Sysadmin 01',
    description: 'A calm stick figure in a plain shirt.',
    silhouette: 'Round head, long narrow body, rolled sleeves.',
  },
  scenes: [
    {
      id: 44,
      shot: 'server-room',
      description: 'The pager vibrates beside an immaculate rack.',
      location: 'Lab A',
      dialogue: ['It knows.'],
      props: [{
        id: 'Pager #1',
        label: 'VMFUEL pager',
        kind: 'pager',
        description: 'A scuffed black pager with an orange button.',
        continuity: 'The orange button is always chipped.',
        interaction_label: 'hear the alert',
        interaction_detail: 'It only buzzes when someone says “quiet day.”',
        purchase_url: '',
      }],
    },
  ],
};

test('normalizes stable IDs and scene numbering', () => {
  const result = normalizeStoryboard(rawStoryboard, 1);
  assert.equal(result.protagonist.id, 'cool_sysadmin_01');
  assert.equal(result.scenes[0].id, 1);
  assert.equal(result.scenes[0].props[0].id, 'pager_1');
  assert.equal(result.style, 'Human-Readable');
});

test('scene prompt carries protagonist and prop continuity', () => {
  const result = normalizeStoryboard(rawStoryboard, 1);
  const prompt = buildScenePrompt(result, result.scenes[0]);
  assert.match(prompt, /cool_sysadmin_01/);
  assert.match(prompt, /pager_1/);
  assert.match(prompt, /orange button is always chipped/i);
  assert.match(prompt, /It knows\./);
  assert.match(prompt, /never print an ID/i);
});

test('storyboard schema requests exactly the configured scene count', () => {
  const schema = storyboardSchema(6);
  assert.equal(schema.properties.scenes.minItems, 6);
  assert.equal(schema.properties.scenes.maxItems, 6);
  assert.equal(schema.additionalProperties, false);
});

test('router rejects a disallowed browser origin before generation', async () => {
  const request = new Request('https://worker.example/storyboard', {
    method: 'POST',
    headers: {
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ seed: 'hello', sceneCount: 4 }),
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: 'https://human.example' });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Origin not allowed.' });
});

test('router answers unknown routes without touching external services', async () => {
  const request = new Request('https://worker.example/nope', { method: 'POST' });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: '*' });
  assert.equal(response.status, 404);
});

test('router enforces the configured generation rate limit', async () => {
  const request = new Request('https://worker.example/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed: 'hello', format: 'single' }),
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: '*',
    GENERATION_RATE_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /wait a minute/i);
});

test('storyboard endpoint requests strict JSON and returns normalized scenes', async () => {
  const originalFetch = globalThis.fetch;
  const fourScenes = Array.from({ length: 4 }, (_, index) => ({
    ...rawStoryboard.scenes[0],
    id: index + 1,
    description: `Scene ${index + 1}`,
  }));
  let upstreamBody;
  globalThis.fetch = async (_url, options) => {
    upstreamBody = JSON.parse(options.body);
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ ...rawStoryboard, scenes: fourScenes }) } }],
    });
  };

  try {
    const request = new Request('https://worker.example/storyboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 'A pager develops stage fright', sceneCount: 4 }),
    });
    const response = await worker.fetch(request, {
      ALLOWED_ORIGIN: '*',
      OPENAI_API_KEY: 'test',
      STORY_MODEL: 'story-test-model',
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.storyboard.scenes.length, 4);
    assert.equal(data.storyboard.scenes[3].id, 4);
    assert.equal(upstreamBody.model, 'story-test-model');
    assert.equal(upstreamBody.response_format.type, 'json_schema');
    assert.equal(upstreamBody.response_format.json_schema.strict, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('create page provides every DOM element used by its controller', () => {
  const html = readFileSync(new URL('../../create.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../create.js', import.meta.url), 'utf8');
  const usedIds = [...script.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]);
  const markupIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(markupIds).size, markupIds.length, 'HTML IDs must be unique');
  for (const id of usedIds) {
    assert.ok(markupIds.includes(id), `create.html is missing #${id}`);
  }
});

test('reader page provides every DOM element used by its controller', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../comic.js', import.meta.url), 'utf8');
  const usedIds = [...script.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]);
  const markupIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(markupIds).size, markupIds.length, 'HTML IDs must be unique');
  for (const id of usedIds) {
    assert.ok(markupIds.includes(id), `index.html is missing #${id}`);
  }
});
