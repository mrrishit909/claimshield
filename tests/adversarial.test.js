import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, evaluate, LIMITS, buildExport, toCsv } from '../src/index.js';
import { escapeHtml } from '../app/ui.js';
import {
  HTML_LABEL,
  boundaryExact,
  duplicateClaimId,
  empty,
  fractionalAmount,
  htmlLabel,
  invalidDate,
  negativeAmount,
  overflowPair,
  sameKeyDifferentAmount,
  singleClean,
  singleEmptyAuth,
  singleNullAuth,
  singleOmittedAuth,
  singleUnresolvedAuth,
  stringAmount,
  threeDuplicates,
  unknownRuleVersion,
  unknownSchemaVersion,
  unsafeAmount,
} from '../fixtures/index.js';
import { FIXED_TIME, text } from './helpers.js';

const codes = (r) => r.errors.map((e) => e.code);

test('adversarial 1: empty claims -> zero findings, total 0', () => {
  const r = analyze(text(empty));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.findings, []);
  assert.equal(r.report.summary.inputTotalCents, 0);
  assert.equal(r.report.summary.claimCount, 0);
  assert.equal(r.report.summary.claimsWithoutFindings, 0);
});

test('adversarial 2: duplicate claim id -> schema rejection', () => {
  const r = analyze(text(duplicateClaimId));
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes('DUPLICATE_ID'));
  assert.equal(r.errors.find((e) => e.code === 'DUPLICATE_ID').path, '$.claims[1].id');
});

test('adversarial 3: invalid date 2026-02-30 -> schema rejection', () => {
  const r = analyze(text(invalidDate));
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ['INVALID_DATE']);
  assert.equal(r.errors[0].path, '$.claims[0].serviceDate');
});

test('adversarial 4: negative, fractional, unsafe and string amounts -> schema rejection before summation', () => {
  for (const fx of [negativeAmount, fractionalAmount, unsafeAmount, stringAmount]) {
    const r = analyze(text(fx));
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), ['INVALID_INTEGER']);
  }
});

test('adversarial 4: literal overflow pair rejected with AGGREGATE_AMOUNT_OVERFLOW and zero findings', () => {
  const r = analyze(text(overflowPair));
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ['AGGREGATE_AMOUNT_OVERFLOW']);
  assert.equal(r.errors[0].path, '$.claims[1].amountCents'.replace('$.', ''));
  assert.equal('report' in r, false);
});

test('adversarial 4: exact-total boundary 9007199254740991 passes', () => {
  const r = analyze(text(boundaryExact));
  assert.equal(r.ok, true);
  assert.equal(r.report.summary.inputTotalCents, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(r.report.findings, []);
});

test('adversarial 5: same member/date/service with different amount -> no CS04', () => {
  const r = analyze(text(sameKeyDifferentAmount));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.findings, []);
  assert.equal(r.report.summary.countsByRule.CS04, 0);
});

test('adversarial 5: single clean C-1 variants for authorizationRef', () => {
  assert.deepEqual(evaluate(singleClean).report.findings, []);
  const nul = evaluate(singleNullAuth);
  assert.deepEqual(nul.report.findings.map((f) => f.id), ['CS02:C-1']);
  assert.equal(nul.report.findings[0].reason, 'null');
  const unresolved = evaluate(singleUnresolvedAuth);
  assert.deepEqual(unresolved.report.findings.map((f) => f.id), ['CS02:C-1']);
  assert.equal(unresolved.report.findings[0].reason, 'unresolved');
  const omitted = evaluate(singleOmittedAuth);
  assert.equal(omitted.ok, false);
  assert.ok(codes(omitted).includes('MISSING_KEY'));
  const emptyStr = evaluate(singleEmptyAuth);
  assert.equal(emptyStr.ok, false);
  assert.ok(codes(emptyStr).includes('EMPTY_STRING'));
});

test('adversarial 6: three exact duplicates -> one CS04 group citing 3 records', () => {
  const r = analyze(text(threeDuplicates));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.findings.map((f) => f.id), ['CS04:C-1,C-2,C-3']);
  assert.equal(r.report.findings[0].cited.claims.length, 3);
  assert.equal(r.report.summary.countsByRule.CS04, 1);
  assert.equal(r.report.summary.claimsWithFindings, 3);
  assert.equal(r.report.summary.duplicateGroups[0].comparisonCents, 20000);
});

test('adversarial 7: HTML in serviceLabel is preserved as data, escaped on render, safe in export', () => {
  const r = analyze(text(htmlLabel));
  assert.equal(r.ok, true);
  assert.equal(r.report.input.claims[0].serviceLabel, HTML_LABEL);
  const rendered = escapeHtml(r.report.findings[0].message);
  assert.equal(rendered.includes('<script>'), false);
  assert.equal(rendered.includes('<img'), false);
  assert.ok(rendered.includes('&lt;script&gt;'));
  const note = '<b onclick="x()">note</b> =SUM(A1)';
  const exp = buildExport(r.report, { generatedAt: FIXED_TIME, notes: { [r.report.findings[0].id]: note } });
  const json = JSON.stringify(exp);
  assert.equal(JSON.parse(json).review.notes[r.report.findings[0].id], note);
  const csv = toCsv(r.report, { notes: exp.review.notes });
  assert.ok(csv.includes('"<b onclick=""x()"">note</b> =SUM(A1)"'));
  assert.equal(escapeHtml(note).includes('<b'), false);
});

test('adversarial 8: malformed, oversized, over-limit and unknown-version payloads -> bounded rejection', () => {
  assert.deepEqual(codes(analyze('{"schemaVersion":1,')), ['INVALID_JSON']);
  const big = `${text(singleClean)}${' '.repeat(LIMITS.MAX_BYTES)}`;
  assert.deepEqual(codes(analyze(big)), ['PAYLOAD_TOO_LARGE']);
  const many = { ...singleClean, documents: Array.from({ length: LIMITS.MAX_RECORDS + 1 }, (_, i) => ({ id: `D-${i}` })) };
  assert.ok(codes(analyze(text(many))).includes('TOO_MANY_RECORDS'));
  assert.deepEqual(codes(analyze(text(unknownSchemaVersion))), ['UNSUPPORTED_SCHEMA_VERSION']);
  assert.deepEqual(codes(analyze(text(unknownRuleVersion))), ['UNSUPPORTED_RULE_VERSION']);
  for (const r of [analyze(big), analyze(text(many)), analyze(text(unknownRuleVersion))]) {
    assert.equal(r.ok, false);
    assert.equal('report' in r, false);
  }
});
