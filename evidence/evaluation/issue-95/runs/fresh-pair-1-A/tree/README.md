# TraceTape parser

A small TypeScript library for parsing, formatting, and summarizing TraceTape
run reports. It has no runtime dependencies.

## Install and commands

```sh
npm install
npm run typecheck
npm test
```

`npm test` builds the TypeScript source and runs the offline tests with Node's
built-in test runner. `npm run check` runs both the typecheck and tests.

## API

```ts
import {
  formatTraceTape,
  parseTraceTape,
  summarizeRun,
} from "tracetape-parser";

const document = parseTraceTape(text);
const summary = summarizeRun(document);

if (document.diagnostics.length === 0) {
  const canonicalText = formatTraceTape(document);
}
```

`TraceTapeDocument` exposes:

- `records`: accepted discriminated-union records in source order. Every record
  has its one-based `lineNumber`.
- `run` and `done`: the accepted run boundaries, when present.
- `cases`: declared cases with their accepted `begin`, `logs`, and `end` records.
- `diagnostics`: recoverable parse errors with a one-based `lineNumber`, stable
  `code`, and human-readable `message`.

All public record, document, diagnostic, and summary types are exported from
the package entry point. `summarizeRun` returns the number of declared cases,
counts of accepted `END` outcomes (`pass`, `fail`, and `skip`), and `elapsedMs`.
Elapsed time is undefined unless both run boundary timestamps are valid. It is
the finish instant minus the start instant, so it can be negative if the input
timestamps are reversed.

## Recovery and validation

The parser never throws for malformed input. Blank lines and lines whose first
non-space character is `#` are ignored. Other lines are split on `|`, and each
field is trimmed. A wrong number of fields or invalid field value receives
`MALFORMED_FIELDS`; unrecognized names receive `UNKNOWN_RECORD`.

Rejected records do not appear in `records` or in the case view. Valid records
that remain independent of a bad line are kept, so callers can inspect useful
partial results alongside diagnostics. Diagnostics use these codes:

- `MALFORMED_FIELDS`: field count or field values are invalid.
- `UNKNOWN_RECORD`: the record name is not recognized.
- `DUPLICATE_ID`: a case ID was declared more than once.
- `INVALID_LIFECYCLE`: records are out of order, repeat a one-time event, or
  occur after `DONE`.
- `UNKNOWN_CASE`: a lifecycle or log record refers to an undeclared case.
- `INCOMPLETE_RUN`: no accepted `RUN` or `DONE` was found.
- `INCOMPLETE_CASE`: a declared case never began, or a begun case has no end.

For end-of-input diagnostics, `lineNumber` points at the next physical line
(the empty input reports line 1). A case that never began is attributed to its
declaration line; a begun case missing `END` is attributed to its `BEGIN` line.
The first non-comment, nonblank line must be `RUN`, and `DONE` closes the run;
all later non-comment, nonblank lines are rejected. The parser continues after
rejected lines where it can, but a later `RUN` cannot repair a run that did not
start on the first content line.

`formatTraceTape` accepts a complete document with no diagnostics. It emits
canonical records in source order, one per line, ending in a newline. It throws
a `TypeError` if the document has diagnostics, is incomplete/inconsistent, or
contains field data that cannot be represented safely (a pipe or line break,
or leading/trailing whitespace). Parsing formatted valid output preserves run,
case, log, and end facts; comments, whitespace, and source line numbers are not
preserved.

## Format decisions

- Timestamps use the extended `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:MM)` form.
  Calendar dates and times are checked, and an explicit timezone is required.
- Case IDs must be nonempty but may contain internal whitespace; uniqueness is
  exact and case-sensitive. Run IDs must also be nonempty and contain no
  whitespace.
- Durations are nonnegative safe integers because the public duration type is
  JavaScript `number`.
- Empty `LOG` messages are allowed. `END` detail is required only for `fail`
  and must be empty for `pass` and `skip`.
- Timestamp ordering is not independently enforced. Summary elapsed time is
  the arithmetic difference of the accepted run instants.

## Example

See [`examples/basic.tracetape`](examples/basic.tracetape).
