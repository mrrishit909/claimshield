// ClaimShield engine: parse -> validate -> checked totals -> rules -> frozen report.
// Pure, isomorphic ESM. No Date.now, no network, no eval.

import { ERROR_CODES, LIMITS, SUPPORTED_RULE_VERSION, SUPPORTED_SCHEMA_VERSION, exceedsDepth, utf8ByteLength, validate } from './schema.js';
import { checkedAdd, sumChecked } from './integers.js';
import { RULE_IDS, RULE_PACK, compareStrings, runRules } from './rules.js';
import { deepClone, deepFreeze } from './report.js';
import { bundledFixtureProvenance, registerBundledFixtureReport, unverifiedProvenance } from './provenance.js';
import { catalog } from '../fixtures/index.js';

export const COMPARISON_LABEL = 'comparison measure, not proven overpayment';

/** Report output contract version. v1 (implicit, no field) always said SYNTHETIC; v2 labels by provenance. */
export const REPORT_VERSION = 2;

export const UNKNOWN_FIXTURE_KEY = 'UNKNOWN_FIXTURE_KEY';

// Allowlist of bundled fixture keys -> frozen fixture data. A Map, so prototype keys such as
// "__proto__" or "constructor" can never resolve.
const BUNDLED_FIXTURES = new Map(catalog.map((entry) => [entry.key, entry.data]));

export const BUNDLED_FIXTURE_KEYS = Object.freeze([...BUNDLED_FIXTURES.keys()]);

function fail(code, path, message) {
  return { ok: false, errors: [{ code, path, message }] };
}

/** Raw text -> {ok:true,data} | {ok:false,errors}. Size, JSON, depth, then schema. */
export function parseInput(text) {
  if (typeof text !== 'string') return fail(ERROR_CODES.INVALID_INPUT_TYPE, '$', 'input must be a string of JSON text');
  const bytes = utf8ByteLength(text);
  if (bytes > LIMITS.MAX_BYTES) {
    return fail(ERROR_CODES.PAYLOAD_TOO_LARGE, '$', `payload is ${bytes} bytes; the limit is ${LIMITS.MAX_BYTES} bytes (1 MiB)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return fail(ERROR_CODES.INVALID_JSON, '$', `invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
  }
  if (exceedsDepth(parsed, LIMITS.MAX_DEPTH)) {
    return fail(ERROR_CODES.DEPTH_EXCEEDED, '$', `nesting depth exceeds ${LIMITS.MAX_DEPTH}`);
  }
  return validate(parsed);
}

/**
 * Validated-or-not data -> {ok:true,report} | {ok:false,errors}. Report is deep-frozen.
 * Data passed here has no trusted origin, so the report is always labelled UNVERIFIED
 * USER-SUPPLIED DATA. Extra arguments (e.g. a self-declared origin or fixture key) are ignored,
 * and so is byte- or deep-equality with a bundled fixture.
 */
export function evaluate(data) {
  return buildReport(data, unverifiedProvenance());
}

/**
 * Evaluate a bundled fixture chosen by allowlisted key. The data comes from fixtures/index.js,
 * never from the caller, so this is the only path whose report is labelled SYNTHETIC DEMO DATA.
 */
export function evaluateBundledFixture(fixtureKey) {
  if (typeof fixtureKey !== 'string' || !BUNDLED_FIXTURES.has(fixtureKey)) {
    return fail(UNKNOWN_FIXTURE_KEY, '$', 'not an allowlisted bundled fixture key');
  }
  const result = buildReport(BUNDLED_FIXTURES.get(fixtureKey), bundledFixtureProvenance(fixtureKey));
  if (result.ok) registerBundledFixtureReport(result.report, fixtureKey);
  return result;
}

function buildReport(data, provenance) {
  const v = validate(data);
  if (!v.ok) return v;
  const input = deepClone(v.data);

  const sum = sumChecked(input.claims.map((c) => c.amountCents));
  if (!sum.ok) return { ok: false, errors: [sum.error] };

  const findings = runRules(input);

  const countsByRule = {};
  for (const id of RULE_IDS) countsByRule[id] = 0;
  const affected = new Set();
  for (const f of findings) {
    countsByRule[f.ruleId] += 1;
    for (const id of f.claimIds) affected.add(id);
  }
  const duplicateGroups = [];
  let duplicateComparisonCents = 0;
  for (const f of findings) {
    if (f.ruleId !== 'CS04') continue;
    let comparison = 0;
    for (let i = 1; i < f.claimIds.length; i += 1) comparison = checkedAdd(comparison, f.evidence.amountCents);
    duplicateComparisonCents = checkedAdd(duplicateComparisonCents, comparison);
    duplicateGroups.push({
      findingId: f.id,
      claimIds: [...f.claimIds],
      claimCount: f.claimIds.length,
      amountCentsPerClaim: f.evidence.amountCents,
      comparisonCents: comparison,
      comparisonLabel: COMPARISON_LABEL,
    });
  }

  const summary = {
    claimCount: input.claims.length,
    memberCount: input.members.length,
    authorizationCount: input.authorizations.length,
    documentCount: input.documents.length,
    inputTotalCents: sum.total,
    findingCount: findings.length,
    countsByRule,
    claimsWithFindings: affected.size,
    claimsWithoutFindings: input.claims.length - affected.size,
    affectedClaimIds: [...affected].sort(compareStrings),
    duplicateGroups,
    duplicateComparisonCents,
    comparisonLabel: COMPARISON_LABEL,
  };

  const report = {
    product: 'ClaimShield',
    reportVersion: REPORT_VERSION,
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    ruleVersion: SUPPORTED_RULE_VERSION,
    rulePack: RULE_PACK,
    dataLabel: provenance.label,
    provenance: { ...provenance },
    input,
    summary,
    findings,
  };
  return { ok: true, report: deepFreeze(report) };
}

/** Raw text -> report result. Convenience composition of parseInput and evaluate (always unverified). */
export function analyze(text) {
  const parsed = parseInput(text);
  if (!parsed.ok) return parsed;
  return evaluate(parsed.data);
}
