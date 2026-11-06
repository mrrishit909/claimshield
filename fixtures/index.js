// SYNTHETIC DEMO DATA. Single source of truth for tests and the workbench UI.
// Every record here is fictional. Oversize / over-limit payloads are built in
// memory at test time, never stored on disk.

import { deepFreeze } from '../src/report.js';

export const FIXTURE_LABEL = 'SYNTHETIC DEMO DATA: fictional records defined in fixtures/index.js from the ClaimShield spec.';

function claim(id, memberId, serviceDate, serviceLabel, amountCents, authorizationRef, documentRefs) {
  return { id, memberId, serviceDate, serviceLabel, amountCents, authorizationRef, documentRefs };
}

const base = () => ({
  schemaVersion: 1,
  ruleVersion: 'CS-DEMO-1',
  claims: [],
  members: [],
  authorizations: [],
  documents: [],
});

/** Literal fixture from the spec: expected 5 findings, total 70000. */
export const golden = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-1']),
    claim('C-2', 'M-2', '2026-01-11', 'VISIT-B', 20000, 'A-1', []),
    claim('C-3', 'M-X', '2026-01-12', 'VISIT-C', 30000, 'A-X', ['NOTE-C-3']),
    claim('C-4', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-4']),
  ],
  members: [{ id: 'M-1' }, { id: 'M-2' }],
  authorizations: [
    { id: 'A-1', memberId: 'M-1' },
    { id: 'A-2', memberId: 'M-2' },
  ],
  documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-3' }, { id: 'NOTE-C-4' }],
});

/** Clean variant from the spec: zero findings, total 70000. */
export const clean = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-1']),
    claim('C-2', 'M-2', '2026-01-11', 'VISIT-B', 20000, 'A-2', ['NOTE-C-2']),
    claim('C-3', 'M-X', '2026-01-12', 'VISIT-C', 30000, 'A-X', ['NOTE-C-3']),
    claim('C-4', 'M-1', '2026-01-13', 'VISIT-A', 10000, 'A-1', ['NOTE-C-4']),
  ],
  members: [{ id: 'M-1' }, { id: 'M-2' }, { id: 'M-X' }],
  authorizations: [
    { id: 'A-1', memberId: 'M-1' },
    { id: 'A-2', memberId: 'M-2' },
    { id: 'A-X', memberId: 'M-X' },
  ],
  documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-2' }, { id: 'NOTE-C-3' }, { id: 'NOTE-C-4' }],
});

/** Adversarial 1: empty claims. */
export const empty = deepFreeze({ ...base(), members: [{ id: 'M-1' }] });

/** Adversarial 2: duplicate claim id. */
export const duplicateClaimId = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-1']),
    claim('C-1', 'M-1', '2026-01-11', 'VISIT-B', 20000, 'A-1', ['NOTE-C-1']),
  ],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }],
});

/** Adversarial 3: invalid calendar date. */
export const invalidDate = deepFreeze({
  ...base(),
  claims: [claim('C-1', 'M-1', '2026-02-30', 'VISIT-A', 10000, 'A-1', ['NOTE-C-1'])],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }],
});

/** Otherwise-clean single C-1 fixture used by several adversarial variants. */
export const singleClean = deepFreeze({
  ...base(),
  claims: [claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-1'])],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }],
});

function singleWith(overrides) {
  const c = { ...singleClean.claims[0], ...overrides };
  return { ...singleClean, claims: [c] };
}

/** Adversarial 4: bad integers. */
export const negativeAmount = deepFreeze(singleWith({ amountCents: -1 }));
export const fractionalAmount = deepFreeze(singleWith({ amountCents: 100.5 }));
export const unsafeAmount = deepFreeze(singleWith({ amountCents: 9007199254740992 }));
export const stringAmount = deepFreeze(singleWith({ amountCents: '10000' }));

/** Adversarial 4 literal overflow: individually safe amounts whose sum overflows. */
export const overflowPair = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 9007199254740991, 'A-1', ['NOTE-C-1']),
    claim('C-2', 'M-1', '2026-01-11', 'VISIT-B', 1, 'A-1', ['NOTE-C-2']),
  ],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-2' }],
});

/** Adversarial 4 boundary: exact total of MAX_SAFE_INTEGER passes. */
export const boundaryExact = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 9007199254740990, 'A-1', ['NOTE-C-1']),
    claim('C-2', 'M-1', '2026-01-11', 'VISIT-B', 1, 'A-1', ['NOTE-C-2']),
  ],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-2' }],
});

/** Adversarial 5: same member/date/service but different amount -> no CS04. */
export const sameKeyDifferentAmount = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-1']),
    claim('C-2', 'M-1', '2026-01-10', 'VISIT-A', 10001, 'A-1', ['NOTE-C-2']),
  ],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-2' }],
});
export const singleNullAuth = deepFreeze(singleWith({ authorizationRef: null }));
export const singleEmptyAuth = deepFreeze(singleWith({ authorizationRef: '' }));
export const singleUnresolvedAuth = deepFreeze(singleWith({ authorizationRef: 'A-X' }));
export const singleOmittedAuth = deepFreeze(
  (() => {
    const { authorizationRef, ...rest } = singleClean.claims[0];
    void authorizationRef;
    return { ...singleClean, claims: [rest] };
  })(),
);

/** Adversarial 6: three exact duplicates -> one CS04 group citing 3 records. */
export const threeDuplicates = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-1']),
    claim('C-2', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-2']),
    claim('C-3', 'M-1', '2026-01-10', 'VISIT-A', 10000, 'A-1', ['NOTE-C-3']),
  ],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-2' }, { id: 'NOTE-C-3' }],
});

/** Adversarial 7: HTML in serviceLabel (must be escaped, never executed). */
export const HTML_LABEL = '<img src=x onerror=alert(1)><script>alert("x")</script>';
export const htmlLabel = deepFreeze({
  ...base(),
  claims: [
    claim('C-1', 'M-1', '2026-01-10', HTML_LABEL, 10000, 'A-1', ['NOTE-C-1']),
    claim('C-2', 'M-1', '2026-01-10', HTML_LABEL, 10000, 'A-1', ['NOTE-C-2']),
  ],
  members: [{ id: 'M-1' }],
  authorizations: [{ id: 'A-1', memberId: 'M-1' }],
  documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-2' }],
});

/** Adversarial 8: unknown versions. */
export const unknownSchemaVersion = deepFreeze({ ...singleClean, schemaVersion: 2 });
export const unknownRuleVersion = deepFreeze({ ...singleClean, ruleVersion: 'CS-DEMO-2' });

/** Named fixtures offered in the workbench. */
export const catalog = deepFreeze([
  { key: 'golden', title: 'Golden batch (spec literal, 5 findings)', data: golden },
  { key: 'clean', title: 'Clean variant (0 findings)', data: clean },
  { key: 'empty', title: 'Empty claims (empty state)', data: empty },
  { key: 'threeDuplicates', title: 'Three exact duplicates (one CS04 group)', data: threeDuplicates },
  { key: 'htmlLabel', title: 'HTML in serviceLabel (escaping check)', data: htmlLabel },
  { key: 'invalidDate', title: 'Invalid date 2026-02-30 (schema rejection)', data: invalidDate },
  { key: 'duplicateClaimId', title: 'Duplicate claim id (schema rejection)', data: duplicateClaimId },
  { key: 'overflowPair', title: 'Overflow pair (AGGREGATE_AMOUNT_OVERFLOW)', data: overflowPair },
  { key: 'unknownRuleVersion', title: 'Unknown rule version (rejection)', data: unknownRuleVersion },
]);
