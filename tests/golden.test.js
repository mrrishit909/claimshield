import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, evaluate, RULE_PACK } from '../src/index.js';
import { clean, golden } from '../fixtures/index.js';
import { text } from './helpers.js';

test('golden oracle: exactly 5 findings with the literal ids in order', () => {
  const r = analyze(text(golden));
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.report.findings.map((f) => f.id),
    ['CS01:C-3', 'CS02:C-2', 'CS02:C-3', 'CS03:C-2', 'CS04:C-1,C-4'],
  );
});

test('golden oracle: counts 1/2/1/1 by rule', () => {
  const { report } = evaluate(golden);
  assert.deepEqual(report.summary.countsByRule, { CS01: 1, CS02: 2, CS03: 1, CS04: 1 });
  assert.equal(report.summary.findingCount, 5);
});

test('golden oracle: four claims, total 70000 cents, 4 affected, 0 clean', () => {
  const { report } = evaluate(golden);
  assert.equal(report.summary.claimCount, 4);
  assert.equal(report.summary.inputTotalCents, 70000);
  assert.equal(report.summary.claimsWithFindings, 4);
  assert.equal(report.summary.claimsWithoutFindings, 0);
  assert.deepEqual(report.summary.affectedClaimIds, ['C-1', 'C-2', 'C-3', 'C-4']);
});

test('golden oracle: CS02 reasons are member-mismatch for C-2 and unresolved for C-3', () => {
  const { report } = evaluate(golden);
  const byId = Object.fromEntries(report.findings.map((f) => [f.id, f]));
  assert.equal(byId['CS02:C-2'].reason, 'member-mismatch');
  assert.equal(byId['CS02:C-2'].evidence.authorizationMemberId, 'M-1');
  assert.equal(byId['CS02:C-3'].reason, 'unresolved');
  assert.equal(byId['CS01:C-3'].evidence.memberId, 'M-X');
  assert.equal(byId['CS03:C-2'].evidence.requiredDocumentId, 'NOTE-C-2');
  assert.equal(byId['CS03:C-2'].reason, 'missing-ref-and-document');
});

test('golden oracle: CS04 group cites both claims, sorted, comparison 10000 labelled', () => {
  const { report } = evaluate(golden);
  const dup = report.findings.find((f) => f.ruleId === 'CS04');
  assert.deepEqual(dup.claimIds, ['C-1', 'C-4']);
  assert.deepEqual(dup.cited.claims.map((c) => c.id), ['C-1', 'C-4']);
  assert.equal(report.summary.duplicateGroups.length, 1);
  assert.equal(report.summary.duplicateGroups[0].comparisonCents, 10000);
  assert.equal(report.summary.duplicateComparisonCents, 10000);
  assert.equal(report.summary.duplicateGroups[0].comparisonLabel, 'comparison measure, not proven overpayment');
  assert.equal(report.summary.comparisonLabel, 'comparison measure, not proven overpayment');
});

test('golden oracle: every finding carries rule version and provenance; input preserved untouched', () => {
  const { report } = evaluate(golden);
  for (const f of report.findings) {
    assert.equal(f.ruleVersion, 'CS-DEMO-1');
    assert.ok(f.cited.claims.length >= 1);
  }
  assert.equal(report.ruleVersion, 'CS-DEMO-1');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.rulePack, RULE_PACK);
  assert.match(report.rulePack.provenance, /CLAIMSHIELD-VERTICAL-SLICE\.md/);
  assert.match(report.rulePack.provenance, /Fictional/);
  assert.deepEqual(report.input, JSON.parse(JSON.stringify(golden)));
  // evaluate() has no trusted origin, even for the bundled fixture object itself.
  assert.match(report.dataLabel, /^UNVERIFIED USER-SUPPLIED DATA/);
});

test('clean variant: zero findings, total 70000, 4 clean claims', () => {
  const r = analyze(text(clean));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.findings, []);
  assert.equal(r.report.summary.inputTotalCents, 70000);
  assert.deepEqual(r.report.summary.countsByRule, { CS01: 0, CS02: 0, CS03: 0, CS04: 0 });
  assert.equal(r.report.summary.claimsWithFindings, 0);
  assert.equal(r.report.summary.claimsWithoutFindings, 4);
  assert.equal(r.report.summary.duplicateComparisonCents, 0);
});
