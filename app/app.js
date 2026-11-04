// ClaimShield workbench controller. Wires the static page to the REAL engine in ../src/.
// DOM is built with createElement/textContent only: no HTML-string injection, no code
// evaluation, no network. Reviewer notes live in a separate layer; the report is frozen by the engine.
import {
  ExportError,
  LIMITS,
  buildExport,
  createReviewLayer,
  evaluate,
  parseInput,
  toCsv,
  withDecision,
  withNote,
} from '../src/index.js';
import { FIXTURE_LABEL, catalog } from '../fixtures/index.js';
import { bytesToHex, filterFindings, formatCents, formatDate, summarizeErrors } from './ui.js';

const $ = (id) => document.getElementById(id);
const els = {
  stamp: $('stamp'),
  fixtureSelect: $('fixture-select'),
  fileInput: $('file-input'),
  runBtn: $('run-btn'),
  status: $('status'),
  errors: $('errors'),
  sourceMeta: $('source-meta'),
  sourceTables: $('source-tables'),
  summary: $('summary'),
  dupNote: $('dup-note'),
  filterRule: $('filter-rule'),
  filterFacet: $('filter-facet'),
  filterQuery: $('filter-query'),
  findingsCount: $('findings-count'),
  findings: $('findings'),
  detailEmpty: $('detail-empty'),
  detail: $('detail'),
  detailClose: $('detail-close'),
  detailTitle: $('detail-title'),
  detailDl: $('detail-dl'),
  detailCited: $('detail-cited'),
  noteInput: $('note-input'),
  decisionInput: $('decision-input'),
  saveReview: $('save-review'),
  reviewStatus: $('review-status'),
  exportJson: $('export-json'),
  exportCsv: $('export-csv'),
  exportStatus: $('export-status'),
};

const state = {
  sourceName: '',
  sourceKey: '', // fixture key of the current source, '' when it came from a file
  sourceText: null,
  sourceHash: null,
  data: null, // schema-validated input (engine output of parseInput)
  report: null, // frozen engine report
  review: createReviewLayer(),
  selectedId: null,
};

// ---------- tiny DOM helpers (text only) ----------
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}
function clear(node) {
  node.replaceChildren();
}
function setStatus(node, message, kind = '') {
  clear(node);
  node.className = `status${kind ? ` ${kind}` : ''}`;
  if (!message) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.append(el('div', { text: message }));
}
function showErrors(title, errors) {
  clear(els.errors);
  els.errors.className = 'status error';
  els.errors.hidden = false;
  els.errors.append(el('strong', { text: title }));
  const list = el('ul', { class: 'errors' });
  for (const line of summarizeErrors(errors)) list.append(el('li', { text: line }));
  els.errors.append(list);
}
function setStamp(text, kind = '') {
  els.stamp.textContent = text;
  els.stamp.className = `stamp${kind ? ` ${kind}` : ''}`;
}

// ---------- source rendering ----------
const COLUMNS = {
  claims: ['id', 'memberId', 'serviceDate', 'serviceLabel', 'amountCents', 'authorizationRef', 'documentRefs'],
  members: ['id'],
  authorizations: ['id', 'memberId'],
  documents: ['id'],
};
function cellText(key, value) {
  if (key === 'amountCents') return formatCents(value);
  if (key === 'serviceDate') return formatDate(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)';
  if (value === null) return 'null';
  return String(value);
}
function renderSource(data) {
  clear(els.sourceTables);
  for (const register of Object.keys(COLUMNS)) {
    const rows = data[register];
    const table = el('table');
    table.append(el('caption', { text: `${register} (${rows.length})` }));
    const head = el('tr');
    for (const col of COLUMNS[register]) head.append(el('th', { scope: 'col', text: col }));
    table.append(el('thead', {}, [head]));
    const body = el('tbody');
    if (rows.length === 0) {
      body.append(el('tr', {}, [el('td', { colspan: String(COLUMNS[register].length), class: 'muted', text: 'No records in this register.' })]));
    }
    for (const row of rows) {
      const tr = el('tr');
      for (const col of COLUMNS[register]) {
        tr.append(el('td', { class: col === 'amountCents' ? 'num' : '', text: cellText(col, row[col]) }));
      }
      body.append(tr);
    }
    table.append(body);
    els.sourceTables.append(el('div', { class: 'tablewrap' }, [table]));
  }
}

// ---------- batch loading ----------
function resetResults() {
  state.report = null;
  state.review = createReviewLayer();
  state.selectedId = null;
  clear(els.summary);
  els.summary.append(el('p', { class: 'muted', text: 'Run validation to compute totals and counts from the report.' }));
  els.dupNote.textContent = '';
  clear(els.findings);
  els.findingsCount.textContent = '';
  closeDetail();
  els.exportJson.disabled = true;
  els.exportCsv.disabled = true;
  setStatus(els.exportStatus, '');
}

async function sha256Hex(text) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(digest);
}

// Atomic reject: a batch that fails validation changes nothing but the error panel.
// The last valid source, its report, the review layer and the exports stay intact.
function rejectBatch(name, errors) {
  const kept = state.data ? ` The previous batch (${state.sourceName}) and its report are unchanged.` : ' No partial results.';
  showErrors(`${name}: rejected before any rule ran (${errors.length} error${errors.length === 1 ? '' : 's'}).${kept}`, errors);
}

/** Returns true when the batch replaced the current source, false when it was rejected. */
async function loadBatch(name, text) {
  const parsed = parseInput(text);
  if (!parsed.ok) {
    rejectBatch(name, parsed.errors);
    return false;
  }
  resetResults();
  state.sourceName = name;
  state.sourceText = text;
  state.sourceHash = null;
  clear(els.sourceTables);
  els.errors.hidden = true;
  els.runBtn.disabled = true;
  state.data = parsed.data;
  state.sourceHash = await sha256Hex(text);
  const total = ['claims', 'members', 'authorizations', 'documents'].reduce((n, k) => n + parsed.data[k].length, 0);
  els.sourceMeta.textContent =
    `${name}: ${total} record${total === 1 ? '' : 's'} passed schema validation (schemaVersion ${parsed.data.schemaVersion}, ruleVersion ${parsed.data.ruleVersion}). ` +
    `${FIXTURE_LABEL}${state.sourceHash ? ` Input SHA-256 ${state.sourceHash.slice(0, 16)}…` : ''}`;
  renderSource(parsed.data);
  setStatus(els.status, 'Schema accepted. Press "Run validation" to apply rule pack CS-DEMO-1.', 'ok');
  setStamp(`Loaded · ${total} records`, '');
  els.runBtn.disabled = false;
  return true;
}

els.fixtureSelect.addEventListener('change', async () => {
  const entry = catalog.find((c) => c.key === els.fixtureSelect.value);
  if (!entry) return;
  if (await loadBatch(entry.title, JSON.stringify(entry.data, null, 2))) {
    state.sourceKey = entry.key;
    els.fileInput.value = '';
  } else {
    els.fixtureSelect.value = state.sourceKey; // the picker keeps pointing at the batch that is actually loaded
  }
});

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files && els.fileInput.files[0];
  if (!file) return;
  let replaced = false;
  if (file.size > LIMITS.MAX_BYTES) {
    rejectBatch(file.name, [
      { code: 'PAYLOAD_TOO_LARGE', path: '$', message: `${file.name} is ${file.size} bytes; the limit is ${LIMITS.MAX_BYTES} bytes (1 MiB)` },
    ]);
  } else {
    try {
      replaced = await loadBatch(file.name, await file.text());
    } catch (err) {
      rejectBatch(file.name, [{ code: 'READ_FAILED', path: '$', message: err instanceof Error ? err.message : 'unknown error' }]);
    }
  }
  if (replaced) {
    state.sourceKey = '';
    els.fixtureSelect.value = '';
  } else {
    els.fileInput.value = '';
  }
});

// ---------- validation run ----------
els.runBtn.addEventListener('click', () => {
  if (!state.data) return;
  resetResults();
  setStatus(els.status, 'Running rule pack CS-DEMO-1…', 'loading');
  const result = evaluate(state.data);
  if (!result.ok) {
    setStatus(els.status, '');
    showErrors('Batch rejected during evaluation. No partial findings.', result.errors);
    setStamp('Rejected', '');
    return;
  }
  state.report = result.report;
  els.errors.hidden = true;
  setStatus(els.status, `Validation complete: ${result.report.summary.findingCount} finding${result.report.summary.findingCount === 1 ? '' : 's'} on ${result.report.summary.claimCount} claim${result.report.summary.claimCount === 1 ? '' : 's'}.`, 'ok');
  renderSummary(result.report);
  renderFindings();
  els.exportJson.disabled = false;
  els.exportCsv.disabled = false;
  const n = result.report.summary.findingCount;
  setStamp(n === 0 ? 'No findings' : `${n} finding${n === 1 ? '' : 's'}`, n === 0 ? 'ok' : '');
});

function card(label, value, red = false) {
  return el('div', { class: `card${red ? ' red' : ''}` }, [el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value })]);
}
function renderSummary(report) {
  const s = report.summary;
  clear(els.summary);
  els.summary.append(
    card('Claims', String(s.claimCount)),
    card('Input total', formatCents(s.inputTotalCents)),
    card('Findings', String(s.findingCount), s.findingCount > 0),
    card('CS01 member', String(s.countsByRule.CS01), s.countsByRule.CS01 > 0),
    card('CS02 authorization', String(s.countsByRule.CS02), s.countsByRule.CS02 > 0),
    card('CS03 document', String(s.countsByRule.CS03), s.countsByRule.CS03 > 0),
    card('CS04 duplicate', String(s.countsByRule.CS04), s.countsByRule.CS04 > 0),
    card('Claims with findings', String(s.claimsWithFindings)),
    card('Claims without findings', String(s.claimsWithoutFindings)),
    card('Members / auths / docs', `${s.memberCount} / ${s.authorizationCount} / ${s.documentCount}`),
  );
  els.dupNote.textContent =
    s.duplicateGroups.length === 0
      ? `No duplicate candidate groups. Every amount is a ${s.comparisonLabel}.`
      : `${s.duplicateGroups.length} duplicate candidate group${s.duplicateGroups.length === 1 ? '' : 's'}; ` +
        `duplicate comparison amount ${formatCents(s.duplicateComparisonCents)} (${s.comparisonLabel}). ` +
        'Claims are never deleted or blocked.';
}

// ---------- findings list, filters, detail ----------
function currentFilter() {
  return { ruleId: els.filterRule.value, facet: els.filterFacet.value, query: els.filterQuery.value };
}
function renderFindings() {
  clear(els.findings);
  if (!state.report) {
    els.findingsCount.textContent = '';
    return;
  }
  const all = state.report.findings;
  const shown = filterFindings(all, currentFilter());
  els.findingsCount.textContent = `Showing ${shown.length} of ${all.length} finding${all.length === 1 ? '' : 's'}.`;
  if (all.length === 0) {
    els.findings.append(el('li', { class: 'muted', text: `No findings. ${state.report.summary.claimCount} claim(s), input total ${formatCents(state.report.summary.inputTotalCents)}.` }));
    return;
  }
  if (shown.length === 0) {
    els.findings.append(el('li', { class: 'muted', text: 'No findings match the current filters.' }));
    return;
  }
  for (const f of shown) {
    const button = el('button', { class: 'linklike', type: 'button', 'aria-pressed': String(f.id === state.selectedId) }, [
      el('span', { class: 'fid', text: f.id }),
      el('span', { class: 'badge', text: f.ruleId }),
      el('span', { class: 'fmsg', text: f.message }),
      el('span', { class: 'fmeta', text: `claims: ${f.claimIds.join(', ')} · reason: ${f.reason}${state.review.decisions[f.id] ? ` · decision: ${state.review.decisions[f.id]}` : ''}` }),
    ]);
    button.addEventListener('click', () => openDetail(f.id));
    els.findings.append(el('li', { class: f.id === state.selectedId ? 'selected' : '' }, [button]));
  }
}
for (const node of [els.filterRule, els.filterFacet]) node.addEventListener('change', renderFindings);
els.filterQuery.addEventListener('input', renderFindings);

function dlRow(term, value) {
  return [el('dt', { text: term }), el('dd', { text: value })];
}
function openDetail(id) {
  const f = state.report && state.report.findings.find((x) => x.id === id);
  if (!f) return;
  state.selectedId = id;
  const rule = state.report.rulePack.rules.find((r) => r.id === f.ruleId);
  els.detailTitle.textContent = `${f.id} — ${rule ? rule.title : f.ruleId}`;
  clear(els.detailDl);
  els.detailDl.append(
    ...dlRow('Rule', `${f.ruleId}: ${rule ? rule.description : ''}`),
    ...dlRow('Rule version', f.ruleVersion),
    ...dlRow('Provenance', state.report.rulePack.provenance),
    ...dlRow('Reason', f.reason),
    ...dlRow('Claims', f.claimIds.join(', ')),
    ...dlRow('Message', f.message),
    ...dlRow('Evidence', JSON.stringify(f.evidence)),
    ...dlRow('Data label', state.report.dataLabel),
  );
  els.detailCited.textContent = JSON.stringify(f.cited, null, 2);
  els.noteInput.value = state.review.notes[id] ?? '';
  els.decisionInput.value = state.review.decisions[id] ?? 'open';
  els.reviewStatus.textContent = '';
  els.detailEmpty.hidden = true;
  els.detail.hidden = false;
  renderFindings();
  els.detailTitle.focus();
}
function closeDetail() {
  state.selectedId = null;
  els.detail.hidden = true;
  els.detailEmpty.hidden = false;
  if (state.report) renderFindings();
}
els.detailClose.addEventListener('click', closeDetail);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.detail.hidden) closeDetail();
});

els.saveReview.addEventListener('click', () => {
  if (!state.selectedId || !state.report) return;
  try {
    let layer = withNote(state.review, state.selectedId, els.noteInput.value);
    layer = withDecision(layer, state.selectedId, els.decisionInput.value);
    state.review = layer;
    els.reviewStatus.textContent = `Recorded for ${state.selectedId}. The finding and the report are unchanged; the review travels only in the export.`;
    renderFindings();
  } catch (err) {
    els.reviewStatus.textContent = err instanceof ExportError ? `${err.code}: ${err.message}` : 'Review could not be recorded.';
  }
});

// ---------- export ----------
function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function stampName() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
els.exportJson.addEventListener('click', () => {
  if (!state.report) return;
  try {
    const payload = buildExport(state.report, {
      generatedAt: new Date().toISOString(),
      sourceHash: state.sourceHash,
      notes: state.review.notes,
      decisions: state.review.decisions,
    });
    download(`claimshield-report-${stampName()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    setStatus(els.exportStatus, `JSON report exported (ruleVersion ${payload.ruleVersion}, ${payload.findings.length} findings, synthetic label included).`, 'ok');
  } catch (err) {
    setStatus(els.exportStatus, err instanceof ExportError ? `Export failed: ${err.code}: ${err.message}` : 'Export failed.', 'error');
  }
});
els.exportCsv.addEventListener('click', () => {
  if (!state.report) return;
  try {
    const csv = toCsv(state.report, state.review);
    download(`claimshield-findings-${stampName()}.csv`, csv, 'text/csv');
    setStatus(els.exportStatus, `Findings CSV exported (${state.report.findings.length} rows, formula-leading cells neutralized).`, 'ok');
  } catch (err) {
    setStatus(els.exportStatus, err instanceof Error ? `Export failed: ${err.message}` : 'Export failed.', 'error');
  }
});

// ---------- init ----------
for (const entry of catalog) els.fixtureSelect.append(el('option', { value: entry.key, text: entry.title }));
resetResults();
