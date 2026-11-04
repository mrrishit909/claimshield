import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, analyze, evaluate, parseInput, validate, isValidIsoDate, toDayNumber, checkedAdd } from '../src/index.js';
import { golden, singleClean } from '../fixtures/index.js';
import { text } from './helpers.js';

const codes = (r) => r.errors.map((e) => e.code);

test('schema: golden fixture validates', () => {
  assert.equal(validate(golden).ok, true);
});

test('schema: non-object root rejected', () => {
  assert.deepEqual(codes(parseInput('[]')), ['ROOT_NOT_OBJECT']);
  assert.deepEqual(codes(parseInput('"x"')), ['ROOT_NOT_OBJECT']);
  assert.deepEqual(codes(parseInput('null')), ['ROOT_NOT_OBJECT']);
});

test('schema: invalid JSON rejected without throwing', () => {
  assert.deepEqual(codes(parseInput('{not json')), ['INVALID_JSON']);
  assert.deepEqual(codes(parseInput(42)), ['INVALID_INPUT_TYPE']);
});

test('schema: unknown schemaVersion and ruleVersion rejected', () => {
  assert.ok(codes(validate({ ...singleClean, schemaVersion: '1' })).includes('UNSUPPORTED_SCHEMA_VERSION'));
  assert.ok(codes(validate({ ...singleClean, schemaVersion: 2 })).includes('UNSUPPORTED_SCHEMA_VERSION'));
  assert.ok(codes(validate({ ...singleClean, ruleVersion: 'CS-DEMO-2' })).includes('UNSUPPORTED_RULE_VERSION'));
});

test('schema: missing and unknown root keys rejected with paths', () => {
  const { documents, ...rest } = singleClean;
  void documents;
  const r = validate(rest);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors[0], { code: 'MISSING_KEY', path: '$.documents', message: 'required root key "documents" is missing' });
  const u = validate({ ...singleClean, extra: 1 });
  assert.equal(u.errors[0].code, 'UNKNOWN_KEY');
  assert.equal(u.errors[0].path, '$.extra');
});

test('schema: wrong register types rejected', () => {
  assert.ok(codes(validate({ ...singleClean, members: {} })).includes('WRONG_TYPE'));
  assert.ok(codes(validate({ ...singleClean, claims: 'x' })).includes('WRONG_TYPE'));
});

test('schema: unknown key on a record rejected with row-level path', () => {
  const c = { ...singleClean.claims[0], bogus: true };
  const r = validate({ ...singleClean, claims: [c] });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'UNKNOWN_KEY');
  assert.equal(r.errors[0].path, '$.claims[0].bogus');
});

test('schema: missing required claim key rejected', () => {
  const { serviceDate, ...c } = singleClean.claims[0];
  void serviceDate;
  const r = validate({ ...singleClean, claims: [c] });
  assert.equal(r.errors[0].code, 'MISSING_KEY');
  assert.equal(r.errors[0].path, '$.claims[0].serviceDate');
});

test('schema: empty strings and nonstring ids rejected', () => {
  assert.ok(codes(validate({ ...singleClean, members: [{ id: '' }] })).includes('EMPTY_STRING'));
  assert.ok(codes(validate({ ...singleClean, members: [{ id: 7 }] })).includes('WRONG_TYPE'));
  assert.ok(codes(validate({ ...singleClean, authorizations: [{ id: 'A-1', memberId: '' }] })).includes('EMPTY_STRING'));
});

test('schema: strings over length bounds rejected', () => {
  const long = 'x'.repeat(LIMITS.MAX_ID_LENGTH + 1);
  assert.ok(codes(validate({ ...singleClean, members: [{ id: long }] })).includes('STRING_TOO_LONG'));
  const c = { ...singleClean.claims[0], serviceLabel: 'y'.repeat(LIMITS.MAX_LABEL_LENGTH + 1) };
  assert.ok(codes(validate({ ...singleClean, claims: [c] })).includes('STRING_TOO_LONG'));
  const ok = { ...singleClean.claims[0], serviceLabel: 'y'.repeat(LIMITS.MAX_LABEL_LENGTH) };
  assert.equal(validate({ ...singleClean, claims: [ok] }).ok, true);
});

test('schema: documentRefs must be an array of nonempty strings (unresolved refs are allowed)', () => {
  const bad = { ...singleClean.claims[0], documentRefs: 'NOTE-C-1' };
  assert.ok(codes(validate({ ...singleClean, claims: [bad] })).includes('WRONG_TYPE'));
  const empty = { ...singleClean.claims[0], documentRefs: [''] };
  assert.ok(codes(validate({ ...singleClean, claims: [empty] })).includes('EMPTY_STRING'));
  const unresolved = { ...singleClean.claims[0], documentRefs: ['NOTE-C-1', 'NOT-IN-REGISTER'] };
  assert.equal(validate({ ...singleClean, claims: [unresolved] }).ok, true);
});

test('schema: duplicate ids rejected in every register', () => {
  assert.ok(codes(validate({ ...singleClean, members: [{ id: 'M-1' }, { id: 'M-1' }] })).includes('DUPLICATE_ID'));
  assert.ok(codes(validate({ ...singleClean, documents: [{ id: 'NOTE-C-1' }, { id: 'NOTE-C-1' }] })).includes('DUPLICATE_ID'));
});

test('schema: NaN, Infinity, negative, fractional and unsafe integers rejected', () => {
  for (const v of [NaN, Infinity, -Infinity, -1, 0.5, 2 ** 53, '1', null, true]) {
    const c = { ...singleClean.claims[0], amountCents: v };
    const r = validate({ ...singleClean, claims: [c] });
    assert.equal(r.ok, false, `amountCents ${String(v)} should be rejected`);
    assert.equal(r.errors[0].code, 'INVALID_INTEGER');
    assert.equal(r.errors[0].path, '$.claims[0].amountCents');
  }
  const zero = { ...singleClean.claims[0], amountCents: 0 };
  assert.equal(validate({ ...singleClean, claims: [zero] }).ok, true);
});

test('schema: calendar dates validated with leap years', () => {
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('1900-02-29'), false);
  assert.equal(isValidIsoDate('2000-02-29'), true);
  assert.equal(isValidIsoDate('2026-04-31'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('2026-00-10'), false);
  assert.equal(isValidIsoDate('2026-1-10'), false);
  assert.equal(isValidIsoDate('2026-01-10T00:00:00Z'), false);
  assert.equal(toDayNumber('1970-01-01'), 0);
  assert.equal(toDayNumber('1970-01-02') - toDayNumber('1970-01-01'), 1);
  assert.equal(toDayNumber('2026-03-01') - toDayNumber('2026-02-28'), 1);
  assert.equal(toDayNumber('2024-03-01') - toDayNumber('2024-02-28'), 2);
});

test('schema: raw text over 1 MiB (UTF-8 bytes) rejected before parsing', () => {
  const pad = ' '.repeat(LIMITS.MAX_BYTES + 1 - text(singleClean).length);
  const r = parseInput(text(singleClean) + pad);
  assert.deepEqual(codes(r), ['PAYLOAD_TOO_LARGE']);
  const exactly = text(singleClean) + ' '.repeat(LIMITS.MAX_BYTES - text(singleClean).length);
  assert.equal(parseInput(exactly).ok, true);
});

test('schema: multibyte characters count as UTF-8 bytes', () => {
  const label = '€'.repeat(100); // 300 bytes, 100 chars
  const body = { ...singleClean, claims: [{ ...singleClean.claims[0], serviceLabel: label }] };
  const t = text(body);
  // t has t.length chars but t.length + 200 bytes; pad so chars < limit while bytes > limit
  const pad = ' '.repeat(LIMITS.MAX_BYTES - 150 - t.length);
  const payload = t + pad;
  assert.ok(payload.length < LIMITS.MAX_BYTES, 'character count stays under the limit');
  assert.deepEqual(codes(parseInput(payload)), ['PAYLOAD_TOO_LARGE']);
});

test('schema: nesting depth over 8 rejected', () => {
  const deep = `{"schemaVersion":1,"ruleVersion":"CS-DEMO-1","claims":[],"members":[],"authorizations":[],"documents":[],"x":${'['.repeat(9)}${']'.repeat(9)}}`;
  assert.deepEqual(codes(parseInput(deep)), ['DEPTH_EXCEEDED']);
  const okDepth = text({ ...singleClean });
  assert.equal(parseInput(okDepth).ok, true);
});

test('schema: more than 1000 records in one array or in total rejected', () => {
  const many = Array.from({ length: LIMITS.MAX_RECORDS + 1 }, (_, i) => ({ id: `M-${i}` }));
  assert.ok(codes(validate({ ...singleClean, members: many })).includes('TOO_MANY_RECORDS'));
  const half = Array.from({ length: 501 }, (_, i) => ({ id: `X-${i}` }));
  assert.ok(codes(validate({ ...singleClean, members: half, documents: half })).includes('TOO_MANY_RECORDS'));
  const atLimit = Array.from({ length: LIMITS.MAX_RECORDS - 3 }, (_, i) => ({ id: `Y-${i}` }));
  assert.equal(validate({ ...singleClean, members: atLimit }).ok, true);
});

test('schema: any error means no report and no partial findings', () => {
  const r = analyze(text({ ...golden, claims: [...golden.claims, { ...golden.claims[0], id: 'C-5', amountCents: -5 }] }));
  assert.equal(r.ok, false);
  assert.equal('report' in r, false);
  assert.equal('findings' in r, false);
});

test('schema: validation does not mutate its input', () => {
  const copy = JSON.parse(JSON.stringify(golden));
  const before = JSON.stringify(copy);
  evaluate(copy);
  assert.equal(JSON.stringify(copy), before);
});

test('integers: checkedAdd enforces the literal precondition', () => {
  assert.equal(checkedAdd(0, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.throws(() => checkedAdd(Number.MAX_SAFE_INTEGER, 1), (e) => e.code === 'AGGREGATE_AMOUNT_OVERFLOW');
  assert.throws(() => checkedAdd(1, -1), (e) => e.code === 'AGGREGATE_AMOUNT_OVERFLOW');
  assert.throws(() => checkedAdd(0.5, 1), (e) => e.code === 'AGGREGATE_AMOUNT_OVERFLOW');
});
