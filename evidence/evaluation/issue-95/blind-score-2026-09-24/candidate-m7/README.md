# TraceTape

TraceTape is a small TypeScript library for parsing, formatting, and summarizing
line-oriented local test-run reports. It has no runtime dependencies. TypeScript
is used only to build and typecheck the library.

## Install and develop

```sh
npm install
npm run typecheck
npm test
```

`npm test` builds the TypeScript sources and runs the offline tests with Node's
built-in test runner. The package entry point and declaration files are emitted
to `dist/` by `npm run build`.

## API

```ts
import {
  formatTraceTape,
  parseTraceTape,
  summarizeRun,
  type TraceTapeDocument,
} from "tracetape";

const document: TraceTapeDocument = parseTraceTape(inputText);
if (document.valid) {
  console.log(summarizeRun(document));
  const normalizedText = formatTraceTape(document);
}
```

The public types describe each record, the ordered `records` array, a
case-centered `cases` array, diagnostics, and the summary. Each parsed record
and diagnostic has a one-based `lineNumber`. `document.run` and `document.done`
are present when their records were accepted. Each case view has a
`declaration`, optional `begin` and `end`, and its accepted `logs` in source
order.

`RunSummary.totalCases` counts accepted declarations. `casesByStatus` counts
cases with an accepted `END` record; incomplete cases are included in
`totalCases` but not in a status count. `elapsedRunTimeMs` is present when both
accepted run timestamps are valid. It is the `DONE` instant minus the `RUN`
instant, in milliseconds. Timestamp order is not checked, so this value can be
negative for inconsistent source timestamps.

## Format and parser decisions

- Blank lines and lines whose first non-space character is `#` are ignored.
  Records are split at `|`, and whitespace around every field is trimmed.
- Timestamp fields use the four-digit-year calendar date and time form
  `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)`. `T` and `Z` may be uppercase or
  lowercase. Calendar values are checked, seconds range from 00 through 59, and
  offsets range through `23:59`. The original timestamp text is preserved.
- Case IDs must be nonempty and unique; whitespace inside a case ID is allowed.
  Run IDs must also be nonempty and cannot contain whitespace. Suite and case
  name fields must be nonempty.
- A duration is parsed as a JavaScript safe integer, so it must be between zero
  and `Number.MAX_SAFE_INTEGER`.
- There is no escape syntax for `|` or newlines inside fields. Extra separators
  make a record malformed. Empty LOG messages and empty pass/skip details are
  preserved.
- `DONE` closes a run. Comments and blank lines after it are still ignored;
  every later record line is rejected.

The parser never throws for malformed text. It continues after bad lines when
possible and returns line-numbered diagnostics with stable codes:
`MALFORMED_FIELDS`, `UNKNOWN_RECORD`, `DUPLICATE_CASE_ID`,
`INVALID_LIFECYCLE_ORDER`, `UNKNOWN_CASE_REFERENCE`, `INCOMPLETE_RUN`, and
`INCOMPLETE_CASE`.

Only records with valid fields and valid lifecycle placement appear in
`document.records` or the case-centered view. Rejected records appear only as
diagnostics. Accepted records retain source order. Incomplete accepted
declarations remain in the document and receive `INCOMPLETE_CASE`; absent
`RUN` or `DONE` records receive `INCOMPLETE_RUN` at the end-of-input line.
`document.valid` is true only when there are no diagnostics.

`formatTraceTape` serializes the accepted `records` in source order with
canonical separators and no comments. It does not serialize diagnostics or
attempt to repair an invalid document. Formatting and reparsing a valid parsed
document preserves its run, case, log, and end facts; source line numbers and
comments are naturally regenerated or omitted.

## Example

See [`examples/sample.tracetape`](examples/sample.tracetape) for a complete
report with passing and failing cases.
