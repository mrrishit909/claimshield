// Data provenance labels for reports and exports. Pure, isomorphic ESM, no imports.
//
// The JSON input carries NO proof of where it came from. A self-declared flag, a filename, a
// label string inside the data, or byte-equality with a bundled fixture proves nothing. The only
// origin ClaimShield treats as synthetic is a report the engine produced itself from an
// allowlisted bundled fixture key (evaluateBundledFixture in engine.js). Everything else, including
// engine calls without that origin and any re-read export, is UNVERIFIED USER-SUPPLIED DATA.
//
// These labels only record how data entered the app. They never inspect content, and they do
// not detect, block or prevent real or sensitive data.
//
// Boundary: this guards against untrusted *data*. It is not a defence against hostile code
// running in the same JavaScript realm, which could call anything it likes.

export const PROVENANCE_KINDS = Object.freeze({
  BUNDLED_FIXTURE: 'bundled-fixture',
  UNVERIFIED: 'unverified-user-supplied',
});

export const SYNTHETIC_LABEL =
  'SYNTHETIC DEMO DATA. Every record is fictional. Not real claims, members, providers or policies. ' +
  'This label records only that a bundled ClaimShield fixture was selected; it does not detect or prevent real or sensitive data. ' +
  'Not a coverage, payment or clinical determination.';

export const UNVERIFIED_LABEL =
  'UNVERIFIED USER-SUPPLIED DATA. ClaimShield cannot verify where this data came from or what it contains. ' +
  'This label does not detect or prevent real or sensitive data (real claims, members, providers, policies or health information). ' +
  'Not a coverage, payment or clinical determination.';

export const PROVENANCE_DISCLAIMER =
  'Provenance labels record only how data entered ClaimShield (the bundled fixture control versus any other path). ' +
  'They do not inspect the data and do not detect or prevent real or sensitive data.';

const UNVERIFIED = Object.freeze({
  kind: PROVENANCE_KINDS.UNVERIFIED,
  fixtureKey: null,
  label: UNVERIFIED_LABEL,
  basis: 'No trusted origin: local file, re-read export, or engine call without a bundled fixture key.',
  disclaimer: PROVENANCE_DISCLAIMER,
});

function bundled(fixtureKey) {
  return Object.freeze({
    kind: PROVENANCE_KINDS.BUNDLED_FIXTURE,
    fixtureKey,
    label: SYNTHETIC_LABEL,
    basis: `Bundled fixture "${fixtureKey}" chosen by allowlisted key; data taken from fixtures/index.js, not from user input.`,
    disclaimer: PROVENANCE_DISCLAIMER,
  });
}

export function unverifiedProvenance() {
  return UNVERIFIED;
}

// Reports minted by the engine from an allowlisted fixture. Identity-keyed, so a clone, a parsed
// export or a hand-built object with a forged `provenance` field is never found here.
const minted = new WeakMap();

/**
 * Engine-internal: record that `report` (already deep-frozen) was built from the bundled fixture
 * `fixtureKey`. The caller (engine.js) has already checked the key against the fixture allowlist.
 * Not re-exported from src/index.js.
 */
export function registerBundledFixtureReport(report, fixtureKey) {
  if (!report || typeof report !== 'object' || !Object.isFrozen(report)) throw new TypeError('a frozen report is required');
  if (typeof fixtureKey !== 'string' || fixtureKey.length === 0) throw new TypeError('fixture key required');
  minted.set(report, fixtureKey);
}

export function bundledFixtureProvenance(fixtureKey) {
  return bundled(fixtureKey);
}

/**
 * Effective provenance of any report-like object. Ignores every self-declared field on the object
 * (`provenance`, `dataLabel`, `exportVersion`, ...): only engine-minted fixture reports are synthetic.
 */
export function provenanceOf(report) {
  if (report && typeof report === 'object' && minted.has(report)) return bundled(minted.get(report));
  return UNVERIFIED;
}
