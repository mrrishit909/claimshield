// Data provenance: only evaluateBundledFixture(allowlistedKey) is SYNTHETIC; every other path,
// including byte-identical copies, self-declarations, forged report fields and re-read exports,
// is UNVERIFIED USER-SUPPLIED DATA. Findings and summaries are identical on both paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLED_FIXTURE_KEYS,
  CSV_HEADER,
  EXPORT_VERSION,
  PROVENANCE_KINDS,
  REPORT_VERSION,
  SYNTHETIC_LABEL,
  UNKNOWN_FIXTURE_KEY,
  UNVERIFIED_LABEL,
  analyze,
  buildExport,
  deepClone,
  deepFreeze,
  evaluate,
  evaluateBundledFixture,
  parseExport,
  provenanceOf,
  toCsv,
} from '../src/index.js';
import * as api from '../src/index.js';
import { catalog, golden } from '../fixtures/index.js';
import { FIXED_TIME } from './helpers.js';

const NO_DETECT = /does not detect or prevent real or sensitive data/;
const exportOf = (report) => buildExport(report, { generatedAt: FIXED_TIME });
const csvLabelCells = (csv) =>
  csv
    .trim()
    .split('\r\n')
    .slice(1)
    .map((line) => line.split('","').slice(-3).map((c) => c.replace(/^"|"$/g, '')));

function assertUnverified(report, why) {
  assert.equal(report.dataLabel, UNVERIFIED_LABEL, why);
  assert.equal(report.provenance.kind, PROVENANCE_KINDS.UNVERIFIED, why);
  assert.equal(provenanceOf(report).kind, PROVENANCE_KINDS.UNVERIFIED, why);
  const exp = exportOf(report);
  assert.equal(exp.dataLabel, UNVERIFIED_LABEL, why);
  assert.equal(exp.provenance.kind, PROVENANCE_KINDS.UNVERIFIED, why);
  assert.equal(exp.provenance.fixtureKey, null, why);
  for (const cells of csvLabelCells(toCsv(report))) assert.deepEqual(cells, [UNVERIFIED_LABEL, PROVENANCE_KINDS.UNVERIFIED, ''], why);
}

test('provenance: both labels state they do not detect or prevent real or sensitive data', () => {
  assert.match(SYNTHETIC_LABEL, /^SYNTHETIC DEMO DATA/);
  assert.match(SYNTHETIC_LABEL, NO_DETECT);
  assert.match(UNVERIFIED_LABEL, /^UNVERIFIED USER-SUPPLIED DATA/);
  assert.match(UNVERIFIED_LABEL, NO_DETECT);
  assert.equal(REPORT_VERSION, 2);
  assert.equal(EXPORT_VERSION, 2);
  assert.equal('registerBundledFixtureReport' in api, false, 'minting is not part of the public API');
});

test('provenance: bundled fixture by allowlisted key is SYNTHETIC in report, JSON and CSV', () => {
  const r = evaluateBundledFixture('golden');
  assert.equal(r.ok, true);
  assert.equal(r.report.reportVersion, 2);
  assert.equal(r.report.dataLabel, SYNTHETIC_LABEL);
  assert.deepEqual({ kind: r.report.provenance.kind, fixtureKey: r.report.provenance.fixtureKey }, { kind: 'bundled-fixture', fixtureKey: 'golden' });
  assert.ok(Object.isFrozen(r.report.provenance));

  const exp = exportOf(r.report);
  assert.equal(exp.exportVersion, 2);
  assert.equal(exp.dataLabel, SYNTHETIC_LABEL);
  assert.equal(exp.provenance.kind, 'bundled-fixture');
  assert.equal(exp.provenance.fixtureKey, 'golden');
  assert.match(exp.provenance.disclaimer, /do not detect or prevent real or sensitive data/);

  const csv = toCsv(r.report);
  assert.equal(csv.split('\r\n')[0], CSV_HEADER.map((h) => `"${h}"`).join(','));
  const rows = csvLabelCells(csv);
  assert.equal(rows.length, 5);
  for (const cells of rows) assert.deepEqual(cells, [SYNTHETIC_LABEL, 'bundled-fixture', 'golden']);
});

test('provenance: business output is identical on both paths; only label fields differ', () => {
  const strip = ({ dataLabel, provenance, ...rest }) => (void dataLabel, void provenance, rest);
  for (const key of BUNDLED_FIXTURE_KEYS) {
    const a = evaluateBundledFixture(key);
    const b = evaluate(catalog.find((c) => c.key === key).data);
    assert.equal(a.ok, b.ok, key);
    if (a.ok) assert.deepEqual(strip(a.report), strip(b.report), key);
    else assert.deepEqual(a.errors, b.errors, `${key}: rejection fixtures still reject`);
  }
});

test('provenance: arbitrary local data is UNVERIFIED', () => {
  const data = deepClone(golden);
  data.claims[0].serviceLabel = 'VISIT-Z';
  assertUnverified(evaluate(data).report, 'modified data via evaluate');
  assertUnverified(analyze(JSON.stringify(data)).report, 'modified data via analyze');
});

test('provenance: input byte-identical (or identity-equal) to a bundled fixture is still UNVERIFIED', () => {
  const pretty = JSON.stringify(golden, null, 2); // exactly what the fixture picker stringifies
  const compact = JSON.stringify(golden);
  assertUnverified(analyze(pretty).report, 'pretty bytes identical to fixture');
  assertUnverified(analyze(compact).report, 'compact bytes identical to fixture');
  assertUnverified(evaluate(golden).report, 'the frozen fixture object itself');
});

test('provenance: self-declaration and filename/key spoofs are UNVERIFIED or rejected', () => {
  // Extra arguments claiming an origin are ignored.
  assertUnverified(evaluate(golden, 'golden').report, 'key as 2nd arg');
  assertUnverified(evaluate(golden, { fixtureKey: 'golden', kind: 'bundled-fixture' }).report, 'options object');
  // A self-declared provenance or label inside the input is a schema error (unknown root key).
  for (const extra of [{ provenance: { kind: 'bundled-fixture', fixtureKey: 'golden' } }, { dataLabel: SYNTHETIC_LABEL }, { fixtureKey: 'golden' }]) {
    const r = analyze(JSON.stringify({ ...golden, ...extra }));
    assert.equal(r.ok, false, `self-declared ${Object.keys(extra)[0]} is rejected`);
  }
  // Filename-like, title-like, case-variant, prototype and non-string keys are not allowlisted.
  for (const key of ['golden.json', 'Golden', ' golden', catalog[0].title, '__proto__', 'constructor', 'toString', '', null, undefined, 1, {}, ['golden']]) {
    const r = evaluateBundledFixture(key);
    assert.equal(r.ok, false, `key ${String(key)}`);
    assert.equal(r.errors[0].code, UNKNOWN_FIXTURE_KEY);
  }
});

test('provenance: forged or cloned report objects are UNVERIFIED in JSON and CSV', () => {
  const minted = evaluateBundledFixture('golden').report;
  const clone = deepClone(minted); // carries dataLabel SYNTHETIC and provenance bundled-fixture as plain data
  assert.equal(clone.dataLabel, SYNTHETIC_LABEL);
  const forgedFrozen = deepFreeze({ ...deepClone(evaluate(golden).report), dataLabel: SYNTHETIC_LABEL, provenance: { kind: 'bundled-fixture', fixtureKey: 'golden', label: SYNTHETIC_LABEL } });
  for (const [why, fake] of [['clone of minted report', clone], ['frozen forged report', forgedFrozen]]) {
    assert.equal(provenanceOf(fake).kind, PROVENANCE_KINDS.UNVERIFIED, why);
    const exp = exportOf(fake);
    assert.equal(exp.dataLabel, UNVERIFIED_LABEL, why);
    assert.equal(exp.provenance.kind, PROVENANCE_KINDS.UNVERIFIED, why);
    for (const cells of csvLabelCells(toCsv(fake))) assert.deepEqual(cells, [UNVERIFIED_LABEL, PROVENANCE_KINDS.UNVERIFIED, ''], why);
  }
});

test('provenance: re-read v2 export and legacy v1 export are UNVERIFIED when re-exported', () => {
  const v2 = parseExport(JSON.stringify(exportOf(evaluateBundledFixture('golden').report)));
  assert.equal(v2.exportVersion, 2);
  assert.equal(v2.provenance.kind, 'bundled-fixture', 'self-declared field survives as data');
  assert.equal(provenanceOf(v2).kind, PROVENANCE_KINDS.UNVERIFIED, 'but is not trusted');
  const v2again = exportOf(v2);
  assert.equal(v2again.dataLabel, UNVERIFIED_LABEL);
  assert.equal(v2again.provenance.kind, PROVENANCE_KINDS.UNVERIFIED);

  // Legacy v1 shape: no provenance field, always claimed SYNTHETIC, 9 CSV columns.
  const { provenance, ...v1shape } = exportOf(evaluateBundledFixture('golden').report);
  void provenance;
  const v1 = parseExport(JSON.stringify({ ...v1shape, exportVersion: 1, dataLabel: 'SYNTHETIC DEMO DATA. Every record is fictional.' }));
  assert.equal(v1.exportVersion, 1);
  assert.equal(provenanceOf(v1).kind, PROVENANCE_KINDS.UNVERIFIED);
  const v1again = exportOf(v1);
  assert.equal(v1again.exportVersion, 2);
  assert.equal(v1again.dataLabel, UNVERIFIED_LABEL);
  for (const cells of csvLabelCells(toCsv(v1))) assert.deepEqual(cells, [UNVERIFIED_LABEL, PROVENANCE_KINDS.UNVERIFIED, '']);

  for (const bad of [undefined, 0, 3, '2']) {
    assert.throws(
      () => parseExport(JSON.stringify({ ...v1shape, exportVersion: bad })),
      (e) => e.code === 'EXPORT_UNSUPPORTED_VERSION',
      `exportVersion ${String(bad)}`,
    );
  }
});
