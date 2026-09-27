# TraceTape

TraceTape is a line-oriented report format for one local test run. This package has no third-party runtime dependencies. It exports a parser, a canonical formatter, summary helpers, and TypeScript types for records and parsed documents.

## Install and commands

Install the development dependency, then use:

```sh
npm run typecheck
npm test
npm run example
```

`npm test` builds the TypeScript sources and runs the offline suite with Node's built-in test runner. The only package dependency is the TypeScript compiler used for development and builds.

## API

```ts
import { formatTraceTape, parseTraceTape, summarizeRun } from "tracetape";
import type { TraceTapeDocument, TraceRecord, TraceTapeDiagnostic } from "tracetape";

const document: TraceTapeDocument = parseTraceTape(inputText);
if (document.isValid) {
  const canonicalText = formatTraceTape(document);
  const summary = summarizeRun(document);
}
```

`parseTraceTape(text)` returns:

- `records`: accepted `TraceRecord` values in source order. Each record has its original one-based `lineNumber`.
- `run` and `done`: the accepted run boundaries, or `null` when no valid boundary was accepted.
- `cases`: a case-centered view. Each `TraceCase` has its declaration, optional `begin` and `end`, and accepted logs.
- `diagnostics`: issues with a stable `code`, one-based `lineNumber`, and a readable message.
- `isValid`: true only when no diagnostics were produced.

The diagnostic codes are `malformed-fields`, `unknown-record`, `duplicate-id`, `invalid-lifecycle-order`, `unknown-case-reference`, `incomplete-run`, and `incomplete-case`.

`formatTraceTape(document)` writes accepted records in source order, with normalized separators and a final newline. It throws a `TypeError` for a document marked invalid or one whose records do not form a valid run. Comments and original spacing are not retained. Formatting and parsing a valid document preserves its run, case, log, and end facts; source line numbers are recalculated.

`summarizeRun(document)` returns `byStatus` (`pass`, `fail`, and `skip` counts), `totalCases`, and `elapsedMilliseconds`. Only cases with an accepted `END` count toward statuses. Elapsed time is `DONE.finishedAt - RUN.startedAt` in milliseconds, or `null` if either boundary is absent or has an invalid timestamp. It uses JavaScript date millisecond precision, and a negative elapsed value is retained if the timestamps are chronologically reversed.

## Parsing and recovery decisions

- Empty lines and lines whose first non-whitespace character is `#` are ignored. LF, CRLF, and CR line endings are accepted.
- Each record is split on `|`, and surrounding whitespace is trimmed from every field. There is no quoting or escaping syntax, so a literal `|` cannot occur inside a field. A log message may be empty.
- Timestamps use the ISO 8601 extended form `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)`. Calendar dates and timezone values are checked; leap seconds and timestamps without seconds are rejected.
- Run and case IDs must be nonempty and contain no whitespace. Case IDs are unique within the run. Durations are nonnegative safe integers so they remain exact JavaScript numbers.
- A valid document has one `RUN` as its first record and one `DONE` as its last. Cases must be declared before `BEGIN`, and every declared case must have one `BEGIN` and one `END`; logs must fall between those records.
- A record that has malformed fields, an unknown name or reference, a duplicate ID, or an invalid lifecycle position is omitted from `records` and from the case view. Valid records from the same otherwise-invalid document remain available for recovery. Incomplete declarations remain in `cases` with missing lifecycle fields set to `null` and receive an `incomplete-case` diagnostic.
- Parsing continues after recoverable errors and does not throw for malformed TraceTape text. Text after an accepted `DONE` is ignored as records and gets an `invalid-lifecycle-order` diagnostic per nonblank, noncomment line.
- An incomplete-run diagnostic points to the end-of-input line. An incomplete-case diagnostic points to the declaration line if `BEGIN` is missing, or the `BEGIN` line if `END` is missing.

## Example

See [`examples/basic.ts`](examples/basic.ts). Its input is:

```text
# One test run
RUN|demo-run|2026-04-11T09:30:00Z
CASE|greeting|examples|prints a greeting
BEGIN|greeting|2026-04-11T09:30:00.010Z
LOG|greeting|info|starting
END|greeting|pass|18|
DONE|2026-04-11T09:30:00.100Z
```
