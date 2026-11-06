// Report helpers: deep freeze/clone, reviewer layer, export, CSV, roundtrip.
// Pure, isomorphic ESM. generatedAt and sourceHash are injected by callers.

import { LIMITS } from './schema.js';
import { SYNTHETIC_LABEL, provenanceOf } from './provenance.js';

// Re-exported for v1 callers; it is no longer applied unconditionally.
export { SYNTHETIC_LABEL };

/**
 * Export contract version written by buildExport / toCsv.
 * v1: always wrote the SYNTHETIC DEMO DATA label regardless of where the data came from.
 * v2: label chosen from provenanceOf(report) plus a `provenance` object (JSON) / columns (CSV).
 */
export const EXPORT_VERSION = 2;
export const READABLE_EXPORT_VERSIONS = Object.freeze([1, 2]);

export const DECISIONS = Object.freeze(['open', 'confirmed', 'dismissed', 'needs-follow-up']);

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

/** JSON-only deep clone (inputs are JSON data by construction). */
export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class ExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

export function createReviewLayer() {
  return { notes: {}, decisions: {} };
}

/** Returns a new layer; the original layer and the report are untouched. */
export function withNote(layer, findingId, text) {
  if (typeof findingId !== 'string' || findingId.length === 0) throw new ExportError('REVIEW_INVALID_FINDING_ID', 'finding id required');
  if (typeof text !== 'string') throw new ExportError('REVIEW_INVALID_NOTE', 'note must be a string');
  if (text.length > LIMITS.MAX_NOTE_LENGTH) {
    throw new ExportError('REVIEW_NOTE_TOO_LONG', `note exceeds ${LIMITS.MAX_NOTE_LENGTH} characters`);
  }
  const notes = { ...layer.notes };
  if (text.length === 0) delete notes[findingId];
  else notes[findingId] = text;
  return { notes, decisions: { ...layer.decisions } };
}

export function withDecision(layer, findingId, decision) {
  if (typeof findingId !== 'string' || findingId.length === 0) throw new ExportError('REVIEW_INVALID_FINDING_ID', 'finding id required');
  if (!DECISIONS.includes(decision)) throw new ExportError('REVIEW_INVALID_DECISION', `decision must be one of ${DECISIONS.join(', ')}`);
  return { notes: { ...layer.notes }, decisions: { ...layer.decisions, [findingId]: decision } };
}

const HEX64 = /^[0-9a-f]{64}$/;

function validateReviewMap(map, findingIds, kind, check) {
  if (map === undefined) return {};
  if (map === null || typeof map !== 'object' || Array.isArray(map)) {
    throw new ExportError('EXPORT_INVALID_REVIEW', `${kind} must be an object keyed by finding id`);
  }
  const out = {};
  for (const key of Object.keys(map).sort()) {
    if (!findingIds.has(key)) throw new ExportError('EXPORT_UNKNOWN_FINDING', `${kind} refer to unknown finding "${key}"`);
    check(map[key], key);
    out[key] = map[key];
  }
  return out;
}

/**
 * Build a JSON-serializable export. Throws ExportError on invalid options.
 * generatedAt: caller-supplied ISO timestamp string. sourceHash: SHA-256 hex
 * of the raw input text supplied by the caller, or null when unavailable.
 */
export function buildExport(report, { generatedAt, sourceHash = null, notes, decisions } = {}) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.findings) || !report.summary) {
    throw new ExportError('EXPORT_INVALID_REPORT', 'a validated report is required');
  }
  if (typeof generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(generatedAt)) {
    throw new ExportError('EXPORT_INVALID_GENERATED_AT', 'generatedAt must be an ISO-8601 UTC timestamp string');
  }
  if (sourceHash !== null && (typeof sourceHash !== 'string' || !HEX64.test(sourceHash))) {
    throw new ExportError('EXPORT_INVALID_SOURCE_HASH', 'sourceHash must be null or 64 lowercase hex characters');
  }
  const findingIds = new Set(report.findings.map((f) => f.id));
  const safeNotes = validateReviewMap(notes, findingIds, 'notes', (v, k) => {
    if (typeof v !== 'string') throw new ExportError('EXPORT_INVALID_NOTE', `note for ${k} must be a string`);
    if (v.length > LIMITS.MAX_NOTE_LENGTH) throw new ExportError('EXPORT_NOTE_TOO_LONG', `note for ${k} exceeds ${LIMITS.MAX_NOTE_LENGTH} characters`);
  });
  const safeDecisions = validateReviewMap(decisions, findingIds, 'decisions', (v, k) => {
    if (!DECISIONS.includes(v)) throw new ExportError('EXPORT_INVALID_DECISION', `decision for ${k} is not allowed`);
  });
  // Effective provenance, never the report's own (possibly forged or legacy) label fields. A parsed
  // v1 or v2 export passed back in here is re-exported as UNVERIFIED USER-SUPPLIED DATA.
  const provenance = provenanceOf(report);
  return {
    exportVersion: EXPORT_VERSION,
    product: 'ClaimShield',
    dataLabel: provenance.label,
    provenance: { ...provenance },
    schemaVersion: report.schemaVersion,
    ruleVersion: report.ruleVersion,
    rulePack: deepClone(report.rulePack),
    generatedAt,
    sourceHash,
    input: deepClone(report.input),
    summary: deepClone(report.summary),
    findings: deepClone(report.findings),
    review: { notes: safeNotes, decisions: safeDecisions },
  };
}

/**
 * Parse an exported JSON text back into an object (roundtrip helper). Accepts exportVersion 1
 * (legacy) and 2. The returned object keeps its self-declared `dataLabel` / `provenance` as plain
 * data, but they are not trusted: provenanceOf(), buildExport() and toCsv() treat any re-read
 * export, v1 or v2, as UNVERIFIED USER-SUPPLIED DATA.
 */
export function parseExport(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || parsed.product !== 'ClaimShield' || !Array.isArray(parsed.findings)) {
    throw new ExportError('EXPORT_INVALID_ROUNDTRIP', 'not a ClaimShield export');
  }
  if (!READABLE_EXPORT_VERSIONS.includes(parsed.exportVersion)) {
    throw new ExportError('EXPORT_UNSUPPORTED_VERSION', `exportVersion must be one of ${READABLE_EXPORT_VERSIONS.join(', ')}`);
  }
  return parsed;
}

const FORMULA_LEADERS = ['=', '+', '-', '@', '\t', '\r'];

/** RFC 4180 quoted cell with spreadsheet-formula neutralization. */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (text.length > 0 && FORMULA_LEADERS.includes(text[0])) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// v2 appends provenance + fixtureKey after the v1 columns, so v1 column positions are unchanged.
export const CSV_HEADER = ['findingId', 'ruleId', 'ruleVersion', 'claimIds', 'reason', 'message', 'decision', 'note', 'dataLabel', 'provenance', 'fixtureKey'];

export function toCsv(report, { notes = {}, decisions = {} } = {}) {
  const provenance = provenanceOf(report); // same rule as buildExport: self-declared fields are ignored
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const f of report.findings) {
    lines.push(
      [
        f.id,
        f.ruleId,
        f.ruleVersion,
        f.claimIds.join(';'),
        f.reason,
        f.message,
        decisions[f.id] ?? '',
        notes[f.id] ?? '',
        provenance.label,
        provenance.kind,
        provenance.fixtureKey ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
