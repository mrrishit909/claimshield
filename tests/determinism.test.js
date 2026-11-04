import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, evaluate, buildExport, createReviewLayer, withDecision, withNote, parseExport, toCsv, csvCell, ExportError } from '../src/index.js';
import { golden, threeDuplicates } from '../fixtures/index.js';
import { FIXED_TIME, seededShuffle, sha256Hex, text } from './helpers.js';

test('determinism: repeated validation yields identical findings and summary', () => {
  const a = evaluate(golden).report;
  const b = evaluate(golden).report;
  assert.equal(JSON.stringify(a.findings), JSON.stringify(b.findings));
  assert.equal(JSON.stringify(a.summary), JSON.stringify(b.summary));
});

test('determinism: shuffling every input array does not change findings or summary', () => {
  const base = evaluate(golden).report;
  for (const seed of [1, 7, 99, 2026]) {
    const shuffled = {
      ...golden,
      claims: seededShuffle(golden.claims, seed),
      members: seededShuffle(golden.members, seed + 1),
      authorizations: seededShuffle(golden.authorizations, seed + 2),
      documents: seededShuffle(golden.documents, seed + 3),
    };
    const r = evaluate(shuffled).report;
    assert.equal(JSON.stringify(r.findings), JSON.stringify(base.findings));
    assert.equal(JSON.stringify(r.summary), JSON.stringify(base.summary));
    assert.deepEqual(r.input.claims, shuffled.claims, 'input snapshot keeps the caller order');
  }
  const t = evaluate({ ...threeDuplicates, claims: seededShuffle(threeDuplicates.claims, 5) }).report;
  assert.deepEqual(t.findings.map((f) => f.id), ['CS04:C-1,C-2,C-3']);
});

test('immutability: the report is deep-frozen and mutation throws in strict mode', () => {
  const { report } = evaluate(golden);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.findings));
  assert.ok(Object.isFrozen(report.findings[0]));
  assert.ok(Object.isFrozen(report.findings[0].cited.claims[0]));
  assert.ok(Object.isFrozen(report.summary.countsByRule));
  assert.ok(Object.isFrozen(report.input.claims[0]));
  assert.throws(() => {
    report.findings.push({});
  }, TypeError);
  assert.throws(() => {
    report.summary.inputTotalCents = 0;
  }, TypeError);
  assert.throws(() => {
    report.findings[0].id = 'X';
  }, TypeError);
  assert.throws(() => {
    report.input.claims[0].amountCents = 1;
  }, TypeError);
});

test('notes isolation: adding notes and decisions leaves validation output byte-identical', () => {
  const before = evaluate(golden).report;
  const bytesBefore = JSON.stringify(before);
  let layer = createReviewLayer();
  layer = withNote(layer, 'CS04:C-1,C-4', 'Looks like a resubmission; confirm with the biller.');
  layer = withDecision(layer, 'CS04:C-1,C-4', 'needs-follow-up');
  layer = withNote(layer, 'CS01:C-3', 'Member id typo?');
  assert.equal(JSON.stringify(before), bytesBefore);
  const after = evaluate(golden).report;
  assert.equal(JSON.stringify(after), bytesBefore);
  assert.equal('notes' in before.findings[0], false);
  assert.equal(before.findings.length, 5, 'original findings are never removed by review');
  assert.equal(layer.notes['CS01:C-3'], 'Member id typo?');
});

test('notes isolation: notes are bounded and decisions are an enum', () => {
  const layer = createReviewLayer();
  assert.throws(() => withNote(layer, 'CS01:C-3', 'x'.repeat(2001)), (e) => e.code === 'REVIEW_NOTE_TOO_LONG');
  assert.equal(withNote(layer, 'CS01:C-3', 'x'.repeat(2000)).notes['CS01:C-3'].length, 2000);
  assert.throws(() => withDecision(layer, 'CS01:C-3', 'delete'), (e) => e.code === 'REVIEW_INVALID_DECISION');
  const cleared = withNote(withNote(layer, 'CS01:C-3', 'a'), 'CS01:C-3', '');
  assert.deepEqual(cleared.notes, {});
});

test('export roundtrip: stringify, reparse, findings and summary deep-equal the live report', () => {
  const raw = text(golden);
  const { report } = analyze(raw);
  const hash = sha256Hex(raw);
  const layer = withDecision(withNote(createReviewLayer(), 'CS02:C-2', 'Auth belongs to M-1.'), 'CS02:C-2', 'confirmed');
  const exp = buildExport(report, { generatedAt: FIXED_TIME, sourceHash: hash, notes: layer.notes, decisions: layer.decisions });
  const json = JSON.stringify(exp);
  const back = parseExport(json);
  assert.deepEqual(back.findings, JSON.parse(JSON.stringify(report.findings)));
  assert.deepEqual(back.summary, JSON.parse(JSON.stringify(report.summary)));
  assert.deepEqual(back.input, JSON.parse(raw));
  assert.equal(back.ruleVersion, 'CS-DEMO-1');
  assert.equal(back.schemaVersion, 1);
  assert.equal(back.rulePack.version, 'CS-DEMO-1');
  assert.match(back.rulePack.provenance, /CLAIMSHIELD-VERTICAL-SLICE\.md/);
  assert.equal(back.generatedAt, FIXED_TIME);
  assert.equal(back.sourceHash, hash);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(back.exportVersion, 2);
  assert.match(back.dataLabel, /^UNVERIFIED USER-SUPPLIED DATA/, 'analyze(text) is never synthetic');
  assert.equal(back.provenance.kind, 'unverified-user-supplied');
  assert.deepEqual(back.review, { notes: { 'CS02:C-2': 'Auth belongs to M-1.' }, decisions: { 'CS02:C-2': 'confirmed' } });
  assert.equal(JSON.stringify(report.findings), JSON.stringify(evaluate(golden).report.findings), 'export did not alter the report');
});

test('export: invalid options throw ExportError (real export-error state)', () => {
  const { report } = evaluate(golden);
  assert.throws(() => buildExport(report, {}), (e) => e instanceof ExportError && e.code === 'EXPORT_INVALID_GENERATED_AT');
  assert.throws(() => buildExport(report, { generatedAt: FIXED_TIME, sourceHash: 'zz' }), (e) => e.code === 'EXPORT_INVALID_SOURCE_HASH');
  assert.throws(() => buildExport(report, { generatedAt: FIXED_TIME, notes: { 'CS09:Z': 'x' } }), (e) => e.code === 'EXPORT_UNKNOWN_FINDING');
  assert.throws(() => buildExport(report, { generatedAt: FIXED_TIME, notes: { 'CS01:C-3': 'x'.repeat(2001) } }), (e) => e.code === 'EXPORT_NOTE_TOO_LONG');
  assert.throws(() => buildExport(report, { generatedAt: FIXED_TIME, decisions: { 'CS01:C-3': 'purge' } }), (e) => e.code === 'EXPORT_INVALID_DECISION');
  assert.throws(() => buildExport(null, { generatedAt: FIXED_TIME }), (e) => e.code === 'EXPORT_INVALID_REPORT');
  assert.throws(() => parseExport('{"product":"Other"}'), (e) => e.code === 'EXPORT_INVALID_ROUNDTRIP');
});

test('export: generatedAt is injected, never produced by the engine', () => {
  const { report } = evaluate(golden);
  const a = buildExport(report, { generatedAt: FIXED_TIME });
  const b = buildExport(report, { generatedAt: FIXED_TIME });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.sourceHash, null);
});

test('csv: RFC 4180 quoting and formula neutralization', () => {
  assert.equal(csvCell('plain'), '"plain"');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('+1'), '"\'+1"');
  assert.equal(csvCell('-1'), '"\'-1"');
  assert.equal(csvCell('@cmd'), '"\'@cmd"');
  assert.equal(csvCell('\tx'), '"\'\tx"');
  assert.equal(csvCell('\rx'), '"\'\rx"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(12), '"12"');
  const { report } = evaluate(golden);
  const csv = toCsv(report, { notes: { 'CS01:C-3': '=HYPERLINK("x")' } });
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '"findingId","ruleId","ruleVersion","claimIds","reason","message","decision","note","dataLabel","provenance","fixtureKey"');
  assert.equal(lines.length, 7, 'header + 5 findings + trailing CRLF');
  assert.ok(lines[1].startsWith('"CS01:C-3","CS01","CS-DEMO-1","C-3","member-missing"'));
  assert.ok(lines[1].includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(lines[5].includes('"C-1;C-4"'));
});
