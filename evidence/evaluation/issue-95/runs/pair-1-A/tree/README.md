# TraceTape parser

A small TypeScript library for parsing, formatting, and summarizing TraceTape test-run reports. It has no third-party runtime dependencies.

## Install and commands

```sh
npm install
npm run typecheck
npm test
```

`npm test` builds the TypeScript source and runs the offline tests with Node's built-in test runner. TypeScript is only a development dependency.

## API

```ts
import { formatTraceTape, parseTraceTape, summarizeRun } from "tracetape-parser";
import type { TraceTapeDocument, TraceTapeRecord, TraceTapeDiagnostic } from "tracetape-parser";

const document: TraceTapeDocument = parseTraceTape(inputText);
if (document.diagnostics.length > 0) {
  for (const diagnostic of document.diagnostics) {
    console.error(diagnostic.line, diagnostic.code, diagnostic.message);
  }
}

const canonicalText = formatTraceTape(document);
const summary = summarizeRun(document);
```

`parseTraceTape(text)` returns a `TraceTapeDocument` with accepted records in source order, a case-centered `cases` array, and diagnostics. Records retain their original one-based source line. Each case has a `state` of `declared`, `started`, or `ended`; its TypeScript type exposes only facts available in that state. The exported record, case, summary, and diagnostic types are available from the package root. ID, timestamp, duration, and nonempty-string fields use branded types to distinguish parser-validated values.

`formatTraceTape(document)` writes accepted records in source order with canonical `|` separators and no comments. For a valid document, parsing the formatted text preserves the run ID and timestamps, case declarations, logs, statuses, durations, and details. It returns an empty string for a document with no accepted records. Formatting a recovered invalid document emits only its accepted records.

`summarizeRun(document)` counts completed cases by `pass`, `fail`, and `skip`, reports `incompleteCases` and `totalCases`, and includes `elapsedMs` when both accepted run boundary timestamps are valid. Elapsed time is the wall-clock difference between the two instants in milliseconds; it may be negative if the source timestamps are reversed.

## Grammar decisions

- A complete run has exactly one `RUN` record first and one `DONE` record last. Each case is declared once, starts once, may have logs between `BEGIN` and `END`, and ends once.
- Records are case-sensitive and field counts must be exact. Every field is trimmed at both ends; internal whitespace is preserved. A message can be empty, but `|` is always a separator and has no escaping form.
- IDs are nonempty tokens without whitespace. Suite and case names must be nonempty after trimming.
- Timestamps use the extended ISO date-time spelling `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)`. Calendar dates, clock fields, and offset fields are range-checked. Leap seconds are rejected. Elapsed-time arithmetic uses JavaScript millisecond precision.
- Durations are nonnegative safe integers in milliseconds so they remain exact as JavaScript numbers. Leading zeroes are accepted and formatted as their numeric value.
- Comments begin when the first non-whitespace character on a line is `#`. Empty lines are ignored.

## Recovery policy

The parser does not throw for malformed input. It emits stable diagnostic codes (`MALFORMED_FIELDS`, `UNKNOWN_RECORD`, `DUPLICATE_ID`, `INVALID_LIFECYCLE_ORDER`, `UNKNOWN_CASE_REFERENCE`, `INCOMPLETE_RUN`, and `INCOMPLETE_CASE`) with a one-based line and human-readable message.

Only records that pass field validation and lifecycle checks appear in `document.records` or the case-centered view. A rejected line is omitted; subsequent lines are still parsed when possible. A malformed or unknown line before RUN does not prevent recovery if a valid RUN appears later, but the diagnostic means the result remains invalid. Non-RUN records before RUN, duplicate case declarations, invalid lifecycle transitions, and all records after DONE are omitted. DONE is accepted even if cases are incomplete, which lets the parser report each incomplete case at end of input. A missing RUN diagnostic points to the final input line (line 1 for empty input); a missing DONE diagnostic points to the accepted RUN line. An unstarted case diagnostic points to its CASE line, and a started but unfinished case diagnostic points to its BEGIN line.

The result is valid only when `diagnostics` is empty. An empty, malformed, or partially recovered document can still be formatted, but the output contains only the accepted records and may not itself be a complete valid run.

## Example

See [`examples/basic.trace`](examples/basic.trace).
