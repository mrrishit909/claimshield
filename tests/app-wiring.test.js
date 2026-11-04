// Static guards for the workbench wiring. The browser controller cannot run under
// node:test without a DOM, so these checks read the source text and assert the
// contract: real engine import, no innerHTML/eval, no external URLs, loopback server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalog } from '../fixtures/index.js';

const root = new URL('../', import.meta.url);
const read = (rel) => readFile(new URL(rel, root), 'utf8');

test('app: index.html loads app.js as an ESM module and app.js exists', async () => {
  const html = await read('app/index.html');
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  const app = await read('app/app.js');
  assert.ok(app.length > 0);
  assert.doesNotMatch(html, /https?:\/\//, 'no external URLs in the page');
  assert.doesNotMatch(html, /<script(?![^>]*type="module")/, 'only module scripts');
});

test('app: controller imports the real engine and fixtures, no innerHTML/eval/network', async () => {
  const app = await read('app/app.js');
  assert.match(app, /from '\.\.\/src\/index\.js'/);
  assert.match(app, /from '\.\.\/fixtures\/index\.js'/);
  for (const fn of ['parseInput', 'evaluate', 'buildExport', 'toCsv', 'withNote', 'withDecision', 'filterFindings']) {
    assert.match(app, new RegExp(`\\b${fn}\\(`), `${fn} is called`);
  }
  for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'eval(', 'new Function', 'fetch(', 'XMLHttpRequest', 'document.write', 'https://', 'http://']) {
    assert.ok(!app.includes(banned), `app.js must not contain ${banned}`);
  }
  assert.ok(catalog.length >= 3, 'fixture catalog drives the fixture select');
});

test('app: every element id the controller looks up exists in index.html', async () => {
  const [html, app] = await Promise.all([read('app/index.html'), read('app/app.js')]);
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const wanted = [...app.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
  assert.ok(wanted.length >= 20, 'controller binds the workbench controls');
  for (const id of wanted) assert.ok(htmlIds.has(id), `index.html is missing #${id}`);
  for (const key of catalog.map((c) => c.key)) assert.match(key, /^[A-Za-z]+$/, 'fixture keys are plain tokens');
});

test('app: ui.js has no DOM access and the server binds loopback only', async () => {
  const ui = await read('app/ui.js');
  assert.ok(!ui.includes('document.') && !ui.includes('window.'), 'ui.js stays pure');
  const serve = await read('scripts/serve.mjs');
  assert.match(serve, /const HOST = '127\.0\.0\.1';/);
  assert.match(serve, /server\.listen\(PORT, HOST/);
  assert.match(serve, /connect-src 'none'/);
});
