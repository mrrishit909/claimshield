// Pure, testable UI helpers for the ClaimShield workbench. No DOM access here.
import { csvCell } from '../src/report.js';

export { csvCell };

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Cents -> "1,234.56" with no locale dependence (tabular numerals via CSS). */
export function formatCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return '—';
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  const digits = String(whole);
  let grouped = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    grouped += digits[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) grouped += ',';
  }
  return `${grouped}.${frac}`;
}

/** Pass-through for valid ISO dates; the engine already rejected invalid ones. */
export function formatDate(iso) {
  return typeof iso === 'string' ? iso : '—';
}

/**
 * Filter findings by rule id, free-text entity/claim search and spec-named
 * reason facets (unknown member, missing document, authorization issue).
 */
export function filterFindings(findings, { ruleId = '', query = '', facet = '' } = {}) {
  const q = query.trim().toLowerCase();
  return findings.filter((f) => {
    if (ruleId && f.ruleId !== ruleId) return false;
    if (facet === 'unknown-member' && f.ruleId !== 'CS01') return false;
    if (facet === 'authorization' && f.ruleId !== 'CS02') return false;
    if (facet === 'missing-document' && f.ruleId !== 'CS03') return false;
    if (facet === 'duplicate' && f.ruleId !== 'CS04') return false;
    if (q) {
      const hay = [f.id, f.entityKey, f.reason, f.message, ...f.claimIds].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Human-readable summary of validation errors, bounded to the first n. */
export function summarizeErrors(errors, max = 50) {
  const shown = errors.slice(0, max).map((e) => `${e.code} at ${e.path}: ${e.message}`);
  if (errors.length > max) shown.push(`… ${errors.length - max} more errors not shown`);
  return shown;
}

export function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}
