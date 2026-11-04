# ClaimShield (vertical slice)

Bounded, deterministic preflight of **synthetic** claim batches against the **fictional** rule pack `CS-DEMO-1`. Dependency-free Node 24 ESM engine plus a static, loopback-only workbench UI.

## Read this first: synthetic data, fictional rules, no authority

- **Every record in this repository is fictional.** Fixtures in `fixtures/index.js` are labelled `SYNTHETIC DEMO DATA` when run through the bundled-fixture path. Anything else (an imported file, data passed to `evaluate`, a re-read export) is labelled `UNVERIFIED USER-SUPPLIED DATA`. See [Data provenance labels](#data-provenance-labels).
- **The labels do not detect or prevent real or sensitive data.** They only record how data entered the app. ClaimShield never inspects content for PHI or real records and cannot block them. Do not import real data.
- **`CS-DEMO-1` is a fictional configuration.** Its only source is the spec file `atlas/docs/specs/CLAIMSHIELD-VERTICAL-SLICE.md`. It does not represent any insurer policy, coding guideline, coverage rule, payment determination or regulatory requirement, and it performs no clinical or medical-necessity evaluation. `serviceLabel` values are plain-text fictional labels, not licensed codes.
- **Findings are candidates for human review, never decisions.** Nothing is deleted, blocked, denied or paid. The CS04 "duplicate comparison amount" is a comparison measure, not proven overpayment.
- **Not production ready. No certification claim.** A qualified billing specialist must validate any real payer rule before use, and a separate privacy/security assessment must precede any real-world deployment. Real-PHI workflows are out of scope for this demo.
- The project's own tests are the author's tests, not an independent audit.

## Run

```sh
npm test          # = node --test "tests/**/*.test.js"
npm run serve     # = node scripts/serve.mjs  -> http://127.0.0.1:4173/app/
```

Requires Node >= 24. No `npm install` is needed; there are zero dependencies. The server binds `127.0.0.1` only, serves static files from this directory, refuses `.git`, sets `connect-src 'none'`, and never proxies or fetches anything. `PORT=... npm run serve` changes the port.

## Layout

| Path | Role |
|---|---|
| `src/schema.js` | Strict atomic validation of the JSON input (versions, keys, types, bounds, dates, integers, duplicate ids). Any error means no partial results. |
| `src/integers.js` | Checked integer addition (`checkedAdd`, `sumChecked`); overflow rejects the batch with `AGGREGATE_AMOUNT_OVERFLOW`. |
| `src/dates.js` | Real ISO `YYYY-MM-DD` calendar date check (leap years, month lengths). |
| `src/rules.js` | Versioned fictional rule pack `CS-DEMO-1` with provenance text, and `runRules`. |
| `src/engine.js` | `parseInput(text)`, `evaluate(data)`, `analyze(text)`, `evaluateBundledFixture(key)`; produces a deep-frozen report. |
| `src/provenance.js` | Provenance labels and `provenanceOf(report)`; records which engine path produced a report. |
| `src/report.js` | Reviewer layer (`withNote`, `withDecision`), `buildExport`, `parseExport`, `toCsv`, `csvCell`. |
| `fixtures/index.js` | Synthetic fixtures (spec golden batch, clean variant, adversarial cases) and the workbench catalog. |
| `app/index.html`, `app/app.js`, `app/ui.js` | Workbench: static HTML, ESM controller wired to `src/`, pure UI helpers. |
| `scripts/serve.mjs` | Loopback-only static server. |
| `tests/` | `node:test` suites: schema, golden oracle, adversarial, determinism, UI helpers, app wiring guards. |

## Input contract (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "ruleVersion": "CS-DEMO-1",
  "claims": [{ "id": "C-1", "memberId": "M-1", "serviceDate": "2026-01-10", "serviceLabel": "VISIT-A",
               "amountCents": 10000, "authorizationRef": "A-1", "documentRefs": ["NOTE-C-1"] }],
  "members": [{ "id": "M-1" }],
  "authorizations": [{ "id": "A-1", "memberId": "M-1" }],
  "documents": [{ "id": "NOTE-C-1" }]
}
```

Rules of the contract (all enforced in `src/schema.js`, all violations are schema errors and block rule execution):

- Root must be a plain object with exactly these six keys; unknown keys anywhere are rejected.
- `schemaVersion` must be the number `1`; `ruleVersion` must be the string `CS-DEMO-1`. Unknown versions are rejected, never guessed.
- Each register is an array of plain objects with exactly the listed keys. Record ids are nonempty strings, unique within their register.
- `memberId` (claims, authorizations) is a nonempty string. `serviceLabel` is a nonempty string. `serviceDate` is a real ISO `YYYY-MM-DD` date (`2026-02-30` is rejected). `amountCents` is a nonnegative safe integer (negative, fractional, string and `> 2^53-1` values are rejected).
- `authorizationRef` is required and is either `null` (no supplied authorization) or a nonempty string. Omitted key, empty string or non-string is a schema error.
- `documentRefs` is an array of nonempty strings.
- Unresolved references (member, authorization, document) are **domain findings**, not schema errors.

### Bounds

| Limit | Value |
|---|---|
| Raw payload | 1 MiB (1,048,576 UTF-8 bytes) |
| Records | 1,000 total across registers, and 1,000 per array (including `documentRefs`) |
| Nesting depth | 8 |
| Id / label length | 200 characters |
| Reviewer note | 2,000 characters |
| Aggregate total | checked addition; rejects the whole batch when `b > Number.MAX_SAFE_INTEGER - a` |

## Rule pack CS-DEMO-1 (fictional)

| Rule | Finding |
|---|---|
| CS01 | `claim.memberId` not in `members[]` |
| CS02 | `authorizationRef` is `null`, does not resolve, or resolves to an authorization for a different member |
| CS03 | configured document `NOTE-<claimId>` absent from `documentRefs` or from `documents[]` |
| CS04 | two or more claims share the exact key `(memberId, serviceDate, serviceLabel, amountCents)`: one finding per group with sorted claim ids |

Findings are sorted by rule id then entity key, and each carries `id` (`RULE:entityKey`), `ruleId`, `ruleVersion`, `claimIds`, `reason`, `message`, `evidence` and `cited` input records.

## Report shape

`evaluate` and `evaluateBundledFixture` return `{ ok: true, report }` or `{ ok: false, errors: [{ code, path, message }] }`. The report is deep-frozen and contains `product`, `reportVersion` (`2`), `schemaVersion`, `ruleVersion`, `rulePack` (version, rule provenance text, rules), `dataLabel`, `provenance` (`kind`, `fixtureKey`, `label`, `basis`, `disclaimer`), `input` (preserved copy), `summary` and `findings`. The summary includes `claimCount`, `inputTotalCents`, `findingCount`, `countsByRule`, `claimsWithFindings`, `claimsWithoutFindings` (a claim in several findings is counted once), `affectedClaimIds`, `duplicateGroups` and `duplicateComparisonCents` with its comparison label.

## Data provenance labels

The JSON input carries no proof of origin, so ClaimShield never trusts a file name, a field inside the data, or byte-equality with a fixture.

| Path | `provenance.kind` | `dataLabel` starts with |
|---|---|---|
| `evaluateBundledFixture(key)` with `key` in `BUNDLED_FIXTURE_KEYS` (the workbench fixture picker) | `bundled-fixture` (with `fixtureKey`) | `SYNTHETIC DEMO DATA` |
| `evaluate(data)`, `analyze(text)` (the workbench file import), including data identical to a fixture | `unverified-user-supplied` | `UNVERIFIED USER-SUPPLIED DATA` |

- `evaluateBundledFixture` reads the data from `fixtures/index.js` itself; the caller supplies only the key. Unknown, filename-like, case-variant, prototype (`__proto__`, `constructor`) and non-string keys fail with `UNKNOWN_FIXTURE_KEY`. Rejection fixtures (for example `invalidDate`) still reject with their schema errors.
- Extra arguments to `evaluate` are ignored. A `provenance`, `dataLabel` or similar key inside the input is an unknown key, so the schema rejects it.
- `buildExport`, `toCsv` and the UI use `provenanceOf(report)`, not the report's own `dataLabel` or `provenance` fields. Only a report object the engine produced through `evaluateBundledFixture` counts as synthetic. Clones, hand-built objects and parsed exports are unverified.
- Findings, summaries and errors are identical on both paths. Only `dataLabel` and `provenance` differ. Schema, rules and business logic are unchanged.
- Both labels say they do not detect or prevent real or sensitive data. They describe the load path, not the content.
- Limits: this guards against untrusted *data*, not against hostile code in the same JavaScript realm. Someone can still type fictional-looking data into a file, or real data into a file, and it will only ever be labelled unverified, never blocked.

## Exports

- **JSON** (`buildExport`): `exportVersion` (`2`), product, `dataLabel` and `provenance` (from `provenanceOf`), `schemaVersion`, `ruleVersion`, rule pack provenance, caller-injected `generatedAt`, optional SHA-256 `sourceHash` of the raw input text, the input snapshot, summary, findings, and the reviewer `notes`/`decisions` layer. `parseExport` reparses it; tests compare reparsed findings with the original.
- **CSV** (`toCsv`): RFC 4180 quoted cells, CRLF line ends, formula-leading characters (`= + - @ TAB CR`) neutralized with a leading apostrophe. Every row carries the `dataLabel`, `provenance` (kind) and `fixtureKey` (empty when unverified).

### Versions and legacy exports

- **Report v1** (no `reportVersion` field) and **export v1** (`exportVersion: 1`) always wrote `SYNTHETIC DEMO DATA`, whatever the source. That label was not reliable. **v2** chooses the label by provenance and adds the `provenance` object.
- **CSV v2** appends two columns, `provenance` and `fixtureKey`, after the nine v1 columns. The v1 column positions are unchanged. CSV has no version cell: an 11-column header means v2.
- `parseExport` accepts `exportVersion` 1 or 2 and rejects anything else with `EXPORT_UNSUPPORTED_VERSION`. A re-read export keeps its original `dataLabel`/`provenance` as plain data, but those fields are not trusted. `provenanceOf`, `buildExport` and `toCsv` treat every re-read export as `UNVERIFIED USER-SUPPLIED DATA`. That includes a v1 export claiming `SYNTHETIC` and a v2 export of a bundled fixture. Re-exporting one produces export v2 labelled unverified.

Reviewer notes and decisions never change validation results; they live in a separate layer and only travel in exports.

## Workbench

Open `http://127.0.0.1:4173/app/` after `npm run serve`. Load a named synthetic fixture (run via `evaluateBundledFixture`, labelled synthetic) or import a JSON file (size is checked before reading; always run via `evaluate` and labelled unverified, whatever its name or contents). The source line, run status, finding detail and export status all show which label applies. Then inspect the source registers, run validation, filter findings by rule, facet or text, open a finding to see its rule, rule version, provenance, evidence and cited records, record a note and decision, and export JSON or CSV. Loading, empty, invalid-file and export-error states are real. The page uses system fonts, no external URLs, and builds the DOM with `textContent` only.

## Limitations

- Vertical slice only: four fictional rules, one schema version, one rule version, no persistence, no accounts, no multi-batch history.
- The workbench controller (`app/app.js`) is covered by static source guards in `tests/app-wiring.test.js`, by the pure helpers in `app/ui.js`, and by fake-DOM tests in `tests/app-import-reject.test.js` (atomic reject, fixture versus file provenance). There is no real-browser automated test, and no browser verification was performed in the resume session (only a loopback HTTP smoke test of the served module paths). See `docs/IMPLEMENTATION-RESULT.md`.
- Input SHA-256 in the UI needs `crypto.subtle`, which browsers expose on `127.0.0.1`; otherwise `sourceHash` is `null`.
- No landing page at the repository root; the footer of the workbench links to this README.
- Not an audit tool, not a payer system, not legal, regulatory or clinical guidance.
