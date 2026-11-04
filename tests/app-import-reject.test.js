// Regression: Golden batch -> Run (5 findings) -> import malformed JSON must be rejected
// atomically. Drives the real app/app.js against a minimal in-memory DOM (no dependencies).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode {
  constructor(tag, id = '') {
    this.tagName = tag;
    this.id = id;
    this.childNodes = [];
    this.ownText = '';
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
  }
  get textContent() {
    return this.ownText + this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    this.ownText = String(v);
  }
  append(...nodes) {
    this.childNodes.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.childNodes = [];
    this.ownText = '';
    this.append(...nodes);
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  async fire(type, event = {}) {
    for (const fn of this.listeners[type] ?? []) await fn(event);
  }
  click() {
    return this.fire('click');
  }
  focus() {}
  remove() {}
}

const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
const byId = new Map();
for (const m of html.matchAll(/<(\w+)\b([^>]*)\bid="([^"]+)"([^>]*)>/g)) {
  const node = new FakeNode(m[1], m[3]);
  node.disabled = /\sdisabled\b/.test(m[2] + m[4]);
  node.hidden = /\shidden\b/.test(m[2] + m[4]);
  byId.set(m[3], node);
}
const docListeners = new FakeNode('document');
globalThis.document = {
  getElementById: (id) => byId.get(id) ?? null,
  createElement: (tag) => new FakeNode(tag),
  addEventListener: (t, f) => docListeners.addEventListener(t, f),
  body: new FakeNode('body'),
};
const downloads = [];
mock.method(URL, 'createObjectURL', (blob) => {
  downloads.push(blob);
  return 'blob:fake';
});
mock.method(URL, 'revokeObjectURL', () => {});
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-04T00:00:00.000Z') });

await import('../app/app.js');
const $ = (id) => byId.get(id);

/** Everything a user can see or export, as plain values. */
async function snapshot() {
  downloads.length = 0;
  const exportsEnabled = !$('export-json').disabled && !$('export-csv').disabled;
  if (exportsEnabled) {
    await $('export-json').click();
    await $('export-csv').click();
  }
  const files = await Promise.all(downloads.map((b) => b.text()));
  return {
    runEnabled: !$('run-btn').disabled,
    exportsEnabled,
    stamp: $('stamp').textContent,
    status: $('status').textContent,
    fixture: $('fixture-select').value,
    sourceMeta: $('source-meta').textContent,
    sourceTables: $('source-tables').textContent,
    summary: $('summary').textContent,
    dupNote: $('dup-note').textContent,
    findingsCount: $('findings-count').textContent,
    findings: $('findings').textContent,
    detailHidden: $('detail').hidden,
    detailTitle: $('detail-title').textContent,
    files,
  };
}

test('app: rejected malformed import keeps the last valid source, report and exports byte-for-byte', async () => {
  $('fixture-select').value = 'golden';
  await $('fixture-select').fire('change');
  await $('run-btn').click();
  assert.match($('findings-count').textContent, /Showing 5 of 5 findings/);

  // Record a reviewer note + decision so the export carries review state too.
  await $('findings').childNodes[0].childNodes[0].click();
  $('note-input').value = 'checked by reviewer';
  $('decision-input').value = 'confirmed';
  await $('save-review').click();

  const before = await snapshot();
  assert.equal(before.exportsEnabled, true);
  assert.equal(before.detailHidden, false);
  assert.equal(before.files.length, 2);
  const exported = JSON.parse(before.files[0]);
  assert.equal(exported.findings.length, 5);
  assert.match(JSON.stringify(exported), /checked by reviewer/);

  const rejected = [
    // The reported case: malformed JSON file.
    async () => {
      $('file-input').value = 'C:\\fakepath\\bad.json';
      $('file-input').files = [{ name: 'bad.json', size: 9, text: async () => '{"claims":' }];
      await $('file-input').fire('change');
      assert.match($('errors').textContent, /bad\.json: rejected[^]*INVALID_JSON/);
      assert.equal($('file-input').value, '', 'the rejected file is cleared from the picker');
    },
    // Sibling reject paths through the same guard.
    async () => {
      $('file-input').files = [{ name: 'big.json', size: 2 * 1024 * 1024, text: async () => '{}' }];
      await $('file-input').fire('change');
      assert.match($('errors').textContent, /PAYLOAD_TOO_LARGE/);
    },
    async () => {
      $('fixture-select').value = 'invalidDate';
      await $('fixture-select').fire('change');
      assert.match($('errors').textContent, /Invalid date[^]*rejected/);
    },
  ];
  for (const reject of rejected) {
    await reject();
    assert.equal($('errors').hidden, false, 'rejection is reported');
    assert.match($('errors').textContent, /previous batch \(Golden batch/);
    assert.deepEqual(await snapshot(), before, 'source, findings, summary, review, controls and both export files are unchanged');
  }

  // Run still works on the preserved source (a run starts a fresh review layer by design).
  await $('run-btn').click();
  assert.match($('findings-count').textContent, /Showing 5 of 5 findings/);
  assert.equal($('export-json').disabled, false);
});

const { golden } = await import('../fixtures/index.js');
const NO_DETECT = /do(es)? not detect or prevent real or sensitive data/;

async function runAndExport() {
  await $('run-btn').click();
  downloads.length = 0;
  await $('export-json').click();
  await $('export-csv').click();
  const [json, csv] = await Promise.all(downloads.map((b) => b.text()));
  return { json: JSON.parse(json), csvRows: csv.trim().split('\r\n').slice(1), status: $('status').textContent, meta: $('source-meta').textContent, exportStatus: $('export-status').textContent };
}

test('app: fixture picker is SYNTHETIC; a file byte-identical to it, even named like it, is UNVERIFIED', async () => {
  $('fixture-select').value = 'golden';
  await $('fixture-select').fire('change');
  const fx = await runAndExport();
  assert.match(fx.meta, /Source: bundled fixture "golden"\. SYNTHETIC DEMO DATA/);
  assert.match(fx.status, /Source: bundled fixture "golden"\. SYNTHETIC DEMO DATA/);
  assert.match(fx.status, NO_DETECT);
  assert.equal(fx.json.exportVersion, 2);
  assert.equal(fx.json.provenance.kind, 'bundled-fixture');
  assert.match(fx.json.dataLabel, /^SYNTHETIC DEMO DATA/);
  assert.match(fx.exportStatus, /bundled-fixture/);
  for (const row of fx.csvRows) assert.match(row, /"SYNTHETIC DEMO DATA[^"]*","bundled-fixture","golden"$/);

  // Exactly the bytes the picker loads, under fixture-looking file names.
  const bytes = JSON.stringify(golden, null, 2);
  for (const name of ['golden', 'golden.json', 'Golden batch (spec literal, 5 findings)']) {
    $('file-input').files = [{ name, size: bytes.length, text: async () => bytes }];
    await $('file-input').fire('change');
    assert.equal($('fixture-select').value, '', 'picker cleared once a file replaced the source');
    const f = await runAndExport();
    assert.match(f.meta, /Source: local file\. UNVERIFIED USER-SUPPLIED DATA/, name);
    assert.match(f.meta, NO_DETECT, name);
    assert.match(f.status, /Source: unverified \(local file\)\. UNVERIFIED USER-SUPPLIED DATA/, name);
    assert.doesNotMatch(f.status + f.meta, /SYNTHETIC DEMO DATA/, name);
    assert.equal(f.json.provenance.kind, 'unverified-user-supplied', name);
    assert.equal(f.json.provenance.fixtureKey, null, name);
    assert.match(f.json.dataLabel, /^UNVERIFIED USER-SUPPLIED DATA/, name);
    assert.deepEqual(f.json.findings, fx.json.findings, 'same findings, different label');
    assert.equal(f.csvRows.length, 5);
    for (const row of f.csvRows) assert.match(row, /"UNVERIFIED USER-SUPPLIED DATA[^"]*","unverified-user-supplied",""$/, name);
  }

  // A rejected file after a fixture keeps the fixture's provenance (atomic reject).
  $('fixture-select').value = 'golden';
  await $('fixture-select').fire('change');
  $('file-input').files = [{ name: 'golden', size: 9, text: async () => '{"claims":' }];
  await $('file-input').fire('change');
  assert.equal((await runAndExport()).json.provenance.kind, 'bundled-fixture');
});
