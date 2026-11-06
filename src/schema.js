// Strict atomic schema validation for ClaimShield input (schemaVersion 1).
// Pure, isomorphic ESM. Any error means no partial results.

import { isValidIsoDate } from './dates.js';
import { isNonNegativeSafeInteger } from './integers.js';

export const SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_RULE_VERSION = 'CS-DEMO-1';

export const LIMITS = Object.freeze({
  MAX_BYTES: 1024 * 1024, // 1 MiB of raw UTF-8 text
  MAX_RECORDS: 1000, // total records across all registers, and per single array
  MAX_DEPTH: 8, // nesting depth of containers
  MAX_ID_LENGTH: 200,
  MAX_LABEL_LENGTH: 200,
  MAX_NOTE_LENGTH: 2000,
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT_TYPE: 'INVALID_INPUT_TYPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INVALID_JSON: 'INVALID_JSON',
  DEPTH_EXCEEDED: 'DEPTH_EXCEEDED',
  ROOT_NOT_OBJECT: 'ROOT_NOT_OBJECT',
  UNSUPPORTED_SCHEMA_VERSION: 'UNSUPPORTED_SCHEMA_VERSION',
  UNSUPPORTED_RULE_VERSION: 'UNSUPPORTED_RULE_VERSION',
  MISSING_KEY: 'MISSING_KEY',
  UNKNOWN_KEY: 'UNKNOWN_KEY',
  WRONG_TYPE: 'WRONG_TYPE',
  EMPTY_STRING: 'EMPTY_STRING',
  STRING_TOO_LONG: 'STRING_TOO_LONG',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_INTEGER: 'INVALID_INTEGER',
  DUPLICATE_ID: 'DUPLICATE_ID',
  TOO_MANY_RECORDS: 'TOO_MANY_RECORDS',
  AGGREGATE_AMOUNT_OVERFLOW: 'AGGREGATE_AMOUNT_OVERFLOW',
});

const ROOT_KEYS = ['schemaVersion', 'ruleVersion', 'claims', 'members', 'authorizations', 'documents'];
const REGISTER_KEYS = ['claims', 'members', 'authorizations', 'documents'];
const RECORD_KEYS = Object.freeze({
  claims: ['id', 'memberId', 'serviceDate', 'serviceLabel', 'amountCents', 'authorizationRef', 'documentRefs'],
  members: ['id'],
  authorizations: ['id', 'memberId'],
  documents: ['id'],
});

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function utf8ByteLength(text) {
  return new TextEncoder().encode(text).length;
}

/** True when container nesting is deeper than max (root container = depth 1). Iterative. */
export function exceedsDepth(value, max = LIMITS.MAX_DEPTH) {
  const stack = [[value, 1]];
  while (stack.length > 0) {
    const [v, depth] = stack.pop();
    if (v === null || typeof v !== 'object') continue;
    if (depth > max) return true;
    const children = Array.isArray(v) ? v : Object.values(v);
    for (const child of children) {
      if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
    }
  }
  return false;
}

function checkBoundedString(value, path, maxLength, errors, { allowNull = false } = {}) {
  if (value === null && allowNull) return true;
  if (typeof value !== 'string') {
    errors.push({ code: ERROR_CODES.WRONG_TYPE, path, message: `${path} must be a ${allowNull ? 'null or a ' : ''}string` });
    return false;
  }
  if (value.length === 0) {
    errors.push({ code: ERROR_CODES.EMPTY_STRING, path, message: `${path} must not be empty` });
    return false;
  }
  if (value.length > maxLength) {
    errors.push({ code: ERROR_CODES.STRING_TOO_LONG, path, message: `${path} exceeds ${maxLength} characters` });
    return false;
  }
  return true;
}

function checkRecordShape(record, path, allowedKeys, errors) {
  if (!isPlainObject(record)) {
    errors.push({ code: ERROR_CODES.WRONG_TYPE, path, message: `${path} must be an object` });
    return false;
  }
  let ok = true;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      errors.push({ code: ERROR_CODES.UNKNOWN_KEY, path: `${path}.${key}`, message: `unknown key "${key}"` });
      ok = false;
    }
  }
  for (const key of allowedKeys) {
    if (!hasOwn(record, key)) {
      errors.push({ code: ERROR_CODES.MISSING_KEY, path: `${path}.${key}`, message: `required key "${key}" is missing` });
      ok = false;
    }
  }
  return ok;
}

/**
 * Validate an already-parsed value. Returns {ok:true,data} or {ok:false,errors}.
 * Does not mutate the input.
 */
export function validate(data) {
  const errors = [];
  if (!isPlainObject(data)) {
    errors.push({ code: ERROR_CODES.ROOT_NOT_OBJECT, path: '$', message: 'root must be a JSON object' });
    return { ok: false, errors };
  }
  for (const key of Object.keys(data)) {
    if (!ROOT_KEYS.includes(key)) {
      errors.push({ code: ERROR_CODES.UNKNOWN_KEY, path: `$.${key}`, message: `unknown root key "${key}"` });
    }
  }
  for (const key of ROOT_KEYS) {
    if (!hasOwn(data, key)) {
      errors.push({ code: ERROR_CODES.MISSING_KEY, path: `$.${key}`, message: `required root key "${key}" is missing` });
    }
  }
  if (hasOwn(data, 'schemaVersion') && data.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    errors.push({
      code: ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION,
      path: '$.schemaVersion',
      message: `schemaVersion must be the number ${SUPPORTED_SCHEMA_VERSION}`,
    });
  }
  if (hasOwn(data, 'ruleVersion') && data.ruleVersion !== SUPPORTED_RULE_VERSION) {
    errors.push({
      code: ERROR_CODES.UNSUPPORTED_RULE_VERSION,
      path: '$.ruleVersion',
      message: `ruleVersion must be "${SUPPORTED_RULE_VERSION}"`,
    });
  }
  let totalRecords = 0;
  for (const key of REGISTER_KEYS) {
    if (!hasOwn(data, key)) continue;
    if (!Array.isArray(data[key])) {
      errors.push({ code: ERROR_CODES.WRONG_TYPE, path: `$.${key}`, message: `${key} must be an array` });
      continue;
    }
    if (data[key].length > LIMITS.MAX_RECORDS) {
      errors.push({
        code: ERROR_CODES.TOO_MANY_RECORDS,
        path: `$.${key}`,
        message: `${key} has ${data[key].length} records; the limit is ${LIMITS.MAX_RECORDS}`,
      });
    }
    totalRecords += data[key].length;
  }
  if (totalRecords > LIMITS.MAX_RECORDS) {
    errors.push({
      code: ERROR_CODES.TOO_MANY_RECORDS,
      path: '$',
      message: `${totalRecords} records in total; the limit is ${LIMITS.MAX_RECORDS}`,
    });
  }
  if (errors.length > 0) return { ok: false, errors };

  for (const register of REGISTER_KEYS) {
    const seen = new Set();
    const rows = data[register];
    for (let i = 0; i < rows.length; i += 1) {
      const path = `$.${register}[${i}]`;
      const record = rows[i];
      if (!checkRecordShape(record, path, RECORD_KEYS[register], errors)) continue;
      if (checkBoundedString(record.id, `${path}.id`, LIMITS.MAX_ID_LENGTH, errors)) {
        if (seen.has(record.id)) {
          errors.push({ code: ERROR_CODES.DUPLICATE_ID, path: `${path}.id`, message: `duplicate ${register} id "${record.id}"` });
        }
        seen.add(record.id);
      }
      if (register === 'authorizations') {
        checkBoundedString(record.memberId, `${path}.memberId`, LIMITS.MAX_ID_LENGTH, errors);
      }
      if (register === 'claims') {
        checkBoundedString(record.memberId, `${path}.memberId`, LIMITS.MAX_ID_LENGTH, errors);
        if (typeof record.serviceDate !== 'string') {
          errors.push({ code: ERROR_CODES.WRONG_TYPE, path: `${path}.serviceDate`, message: 'serviceDate must be a string' });
        } else if (!isValidIsoDate(record.serviceDate)) {
          errors.push({
            code: ERROR_CODES.INVALID_DATE,
            path: `${path}.serviceDate`,
            message: `"${record.serviceDate}" is not a real ISO YYYY-MM-DD calendar date`,
          });
        }
        checkBoundedString(record.serviceLabel, `${path}.serviceLabel`, LIMITS.MAX_LABEL_LENGTH, errors);
        if (!isNonNegativeSafeInteger(record.amountCents)) {
          errors.push({
            code: ERROR_CODES.INVALID_INTEGER,
            path: `${path}.amountCents`,
            message: 'amountCents must be a nonnegative safe integer',
          });
        }
        checkBoundedString(record.authorizationRef, `${path}.authorizationRef`, LIMITS.MAX_ID_LENGTH, errors, { allowNull: true });
        if (!Array.isArray(record.documentRefs)) {
          errors.push({ code: ERROR_CODES.WRONG_TYPE, path: `${path}.documentRefs`, message: 'documentRefs must be an array' });
        } else if (record.documentRefs.length > LIMITS.MAX_RECORDS) {
          errors.push({
            code: ERROR_CODES.TOO_MANY_RECORDS,
            path: `${path}.documentRefs`,
            message: `documentRefs has ${record.documentRefs.length} entries; the limit is ${LIMITS.MAX_RECORDS}`,
          });
        } else {
          for (let j = 0; j < record.documentRefs.length; j += 1) {
            checkBoundedString(record.documentRefs[j], `${path}.documentRefs[${j}]`, LIMITS.MAX_ID_LENGTH, errors);
          }
        }
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}
