export {
  analyze,
  evaluate,
  evaluateBundledFixture,
  parseInput,
  BUNDLED_FIXTURE_KEYS,
  COMPARISON_LABEL,
  REPORT_VERSION,
  UNKNOWN_FIXTURE_KEY,
} from './engine.js';
export { ERROR_CODES, LIMITS, SUPPORTED_RULE_VERSION, SUPPORTED_SCHEMA_VERSION, exceedsDepth, utf8ByteLength, validate } from './schema.js';
export { RULE_IDS, RULE_PACK, runRules, compareStrings } from './rules.js';
export { MAX_SAFE, OVERFLOW_CODE, checkedAdd, isNonNegativeSafeInteger, sumChecked } from './integers.js';
export { compareDates, daysInMonth, isLeapYear, isValidIsoDate, parseIsoDate, toDayNumber } from './dates.js';
// registerBundledFixtureReport is engine-internal and deliberately not exported here.
export { PROVENANCE_DISCLAIMER, PROVENANCE_KINDS, UNVERIFIED_LABEL, provenanceOf } from './provenance.js';
export {
  CSV_HEADER,
  DECISIONS,
  EXPORT_VERSION,
  ExportError,
  READABLE_EXPORT_VERSIONS,
  SYNTHETIC_LABEL,
  buildExport,
  createReviewLayer,
  csvCell,
  deepClone,
  deepFreeze,
  parseExport,
  toCsv,
  withDecision,
  withNote,
} from './report.js';
