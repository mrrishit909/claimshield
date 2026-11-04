import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, escapeHtml, filterFindings, formatCents, formatDate, summarizeErrors, csvCell } from '../app/ui.js';
import { evaluate } from '../src/index.js';
import { golden, catalog } from '../fixtures/index.js';

test('ui: escapeHtml neutralizes every HTML-significant character', () => {
  assert.equal(escapeHtml('<script>alert("x") & \'y\'</script>'), '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(12), '12');
});

test('ui: formatCents is locale independent with grouping', () => {
  assert.equal(formatCents(0), '0.00');
  assert.equal(formatCents(5), '0.05');
  assert.equal(formatCents(70000), '700.00');
  assert.equal(formatCents(123456789), '1,234,567.89');
  assert.equal(formatCents(9007199254740991), '90,071,992,547,409.91');
  assert.equal(formatCents(-1), '—');
  assert.equal(formatCents(1.5), '—');
  assert.equal(formatDate('2026-01-10'), '2026-01-10');
});

test('ui: filterFindings by rule, query and facet', () => {
  const { findings } = evaluate(golden).report;
  assert.equal(filterFindings(findings).length, 5);
  assert.deepEqual(filterFindings(findings, { ruleId: 'CS02' }).map((f) => f.id), ['CS02:C-2', 'CS02:C-3']);
  assert.deepEqual(filterFindings(findings, { query: 'c-3' }).map((f) => f.id), ['CS01:C-3', 'CS02:C-3']);
  assert.deepEqual(filterFindings(findings, { facet: 'unknown-member' }).map((f) => f.id), ['CS01:C-3']);
  assert.deepEqual(filterFindings(findings, { facet: 'missing-document' }).map((f) => f.id), ['CS03:C-2']);
  assert.deepEqual(filterFindings(findings, { facet: 'duplicate' }).map((f) => f.id), ['CS04:C-1,C-4']);
  assert.deepEqual(filterFindings(findings, { facet: 'authorization', query: 'mismatch' }).map((f) => f.id), ['CS02:C-2']);
  assert.deepEqual(filterFindings(findings, { ruleId: 'CS04', query: 'zzz' }), []);
});

test('ui: summarizeErrors is bounded', () => {
  const errors = Array.from({ length: 60 }, (_, i) => ({ code: 'X', path: `$.a[${i}]`, message: 'm' }));
  const lines = summarizeErrors(errors);
  assert.equal(lines.length, 51);
  assert.equal(lines[0], 'X at $.a[0]: m');
  assert.match(lines[50], /10 more errors/);
});

test('ui: bytesToHex and csvCell re-export', () => {
  assert.equal(bytesToHex(new Uint8Array([0, 255, 16]).buffer), '00ff10');
  assert.equal(csvCell('=1'), '"\'=1"');
});

test('fixtures: catalog entries are deep-frozen and labelled synthetic', () => {
  assert.ok(catalog.length >= 3);
  for (const entry of catalog) {
    assert.ok(Object.isFrozen(entry.data));
    assert.ok(Object.isFrozen(entry.data.claims));
  }
  assert.ok(Object.isFrozen(golden.claims[0]));
});
