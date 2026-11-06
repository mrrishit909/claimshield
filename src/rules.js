// Fictional, versioned rule pack CS-DEMO-1 and its evaluation.
// Pure, isomorphic ESM. Never deletes or blocks claims.

export const RULE_PACK = Object.freeze({
  version: 'CS-DEMO-1',
  provenance:
    'Fictional demo configuration. Its only source is the specification file ' +
    'atlas/docs/specs/CLAIMSHIELD-VERTICAL-SLICE.md. It does not represent any insurer policy, ' +
    'coding guideline, coverage or payment determination, and performs no clinical or medical-necessity evaluation.',
  rules: Object.freeze([
    Object.freeze({
      id: 'CS01',
      title: 'Member missing from member register',
      description: 'claim.memberId does not resolve to a record in members[].',
    }),
    Object.freeze({
      id: 'CS02',
      title: 'Authorization null, unresolved, or for a different member',
      description:
        'claim.authorizationRef is null, does not resolve in authorizations[], or resolves to an ' +
        'authorization whose memberId differs from the claim memberId. Fictional configuration check; ' +
        'not a claim that every service requires authorization.',
    }),
    Object.freeze({
      id: 'CS03',
      title: 'Configured NOTE-<claimId> document absent',
      description: 'The configured document id NOTE-<claimId> is absent from the claim documentRefs or from documents[].',
    }),
    Object.freeze({
      id: 'CS04',
      title: 'Exact duplicate candidate group',
      description:
        'Two or more claims share the exact key (memberId, serviceDate, serviceLabel, amountCents). ' +
        'One finding per group with sorted claim ids; a candidate for human review, never an automatic deletion.',
    }),
  ]),
});

export const RULE_IDS = Object.freeze(RULE_PACK.rules.map((r) => r.id));

export function compareStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function makeFinding({ ruleId, claimIds, reason, message, evidence, cited }) {
  const sortedIds = [...claimIds].sort(compareStrings);
  const entityKey = sortedIds.join(',');
  return {
    id: `${ruleId}:${entityKey}`,
    ruleId,
    ruleVersion: RULE_PACK.version,
    claimIds: sortedIds,
    entityKey,
    reason,
    message,
    evidence,
    cited,
  };
}

/**
 * Evaluate all rules against validated data. Returns findings sorted by
 * rule id, then entity key (code-unit order). Input is not mutated.
 */
export function runRules(data) {
  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const authById = new Map(data.authorizations.map((a) => [a.id, a]));
  const docById = new Map(data.documents.map((d) => [d.id, d]));
  const findings = [];

  for (const claim of data.claims) {
    const member = memberById.get(claim.memberId);
    if (!member) {
      findings.push(
        makeFinding({
          ruleId: 'CS01',
          claimIds: [claim.id],
          reason: 'member-missing',
          message: `Claim ${claim.id} references member ${claim.memberId}, which is not in the member register.`,
          evidence: { memberId: claim.memberId },
          cited: { claims: [claim], members: [], authorizations: [], documents: [] },
        }),
      );
    }

    let authReason = null;
    const auth = claim.authorizationRef === null ? undefined : authById.get(claim.authorizationRef);
    if (claim.authorizationRef === null) authReason = 'null';
    else if (!auth) authReason = 'unresolved';
    else if (auth.memberId !== claim.memberId) authReason = 'member-mismatch';
    if (authReason) {
      const detail =
        authReason === 'null'
          ? 'has no supplied authorization reference (null)'
          : authReason === 'unresolved'
            ? `references authorization ${claim.authorizationRef}, which does not resolve`
            : `references authorization ${claim.authorizationRef}, which belongs to member ${auth.memberId}, not ${claim.memberId}`;
      findings.push(
        makeFinding({
          ruleId: 'CS02',
          claimIds: [claim.id],
          reason: authReason,
          message: `Claim ${claim.id} ${detail}.`,
          evidence: {
            authorizationRef: claim.authorizationRef,
            claimMemberId: claim.memberId,
            authorizationMemberId: auth ? auth.memberId : null,
          },
          cited: {
            claims: [claim],
            members: member ? [member] : [],
            authorizations: auth ? [auth] : [],
            documents: [],
          },
        }),
      );
    }

    const noteId = `NOTE-${claim.id}`;
    const inRefs = claim.documentRefs.includes(noteId);
    const doc = docById.get(noteId);
    if (!inRefs || !doc) {
      const reason = !inRefs && !doc ? 'missing-ref-and-document' : !inRefs ? 'missing-ref' : 'missing-document';
      findings.push(
        makeFinding({
          ruleId: 'CS03',
          claimIds: [claim.id],
          reason,
          message:
            `Claim ${claim.id} requires configured document ${noteId}; ` +
            (!inRefs ? 'it is absent from documentRefs' : 'it is listed in documentRefs') +
            (!doc ? ' and absent from the document register.' : ' and present in the document register.'),
          evidence: { requiredDocumentId: noteId, inDocumentRefs: inRefs, inDocumentRegister: Boolean(doc) },
          cited: {
            claims: [claim],
            members: [],
            authorizations: [],
            documents: claim.documentRefs.map((id) => docById.get(id)).filter(Boolean),
          },
        }),
      );
    }
  }

  const groups = new Map();
  for (const claim of data.claims) {
    const key = JSON.stringify([claim.memberId, claim.serviceDate, claim.serviceLabel, claim.amountCents]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(claim);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => compareStrings(a.id, b.id));
    const first = sorted[0];
    findings.push(
      makeFinding({
        ruleId: 'CS04',
        claimIds: sorted.map((c) => c.id),
        reason: 'exact-duplicate-key',
        message:
          `${sorted.length} claims (${sorted.map((c) => c.id).join(', ')}) share the exact key ` +
          `(${first.memberId}, ${first.serviceDate}, ${first.serviceLabel}, ${first.amountCents}). ` +
          'Duplicate candidate for human review; nothing is deleted or blocked.',
        evidence: {
          memberId: first.memberId,
          serviceDate: first.serviceDate,
          serviceLabel: first.serviceLabel,
          amountCents: first.amountCents,
          claimCount: sorted.length,
        },
        cited: {
          claims: sorted,
          members: memberById.has(first.memberId) ? [memberById.get(first.memberId)] : [],
          authorizations: [],
          documents: [],
        },
      }),
    );
  }

  findings.sort((a, b) => compareStrings(a.ruleId, b.ruleId) || compareStrings(a.entityKey, b.entityKey));
  return findings;
}
