# TraceTape parser library task

Build a small TypeScript library that parses and formats **TraceTape**, a line-oriented format used by a local test runner to report a run. The library will be consumed by a CLI and a UI, so give callers well-defined exported types for the parsed document, records, diagnostics, and summary. Organize the implementation into multiple source files with clear responsibilities.

A TraceTape input is UTF-8 text. Blank lines and lines whose first non-space character is `#` are ignored. Every other line is a record whose fields are separated by `|`. Trim whitespace around fields. The first field is a record name:

- `RUN|<run-id>|<started-at>` begins a run. A run ID is a nonempty string without whitespace; the timestamp is an ISO 8601 instant with a timezone.
- `CASE|<case-id>|<suite>|<name>` declares a test case. IDs are unique within the run; suite and name are nonempty.
- `BEGIN|<case-id>|<started-at>` starts a declared case. A case may start once.
- `LOG|<case-id>|<level>|<message>` adds a log after the case has started and before it has ended. Level is `info`, `warn`, or `error`; message may be empty.
- `END|<case-id>|<status>|<duration-ms>|<detail>` ends a started case. Status is `pass`, `fail`, or `skip`; duration is a nonnegative integer. Detail must be nonempty for `fail` and must be empty for `pass` and `skip`.
- `DONE|<finished-at>` closes the run. No records may follow it. A valid document has exactly one `RUN` first and exactly one `DONE` last.

The parser should return the records in source order and a convenient case-centered view for consumers. Preserve the original one-based line number of each record. It should collect diagnostics with line number and a stable code for malformed fields, unknown record names, duplicate IDs, invalid lifecycle order, unknown case references, and incomplete runs/cases. Continue after a bad line where possible; never throw for malformed input. Document whether invalid records appear in the returned document and apply that policy consistently.

Provide `parseTraceTape(text)` and `formatTraceTape(document)` public functions. Formatting a valid parsed document and parsing it again must preserve the same run/case/log/end facts; comments and insignificant whitespace need not survive. Add a `summarizeRun(document)` helper returning counts by case status and the elapsed run time when both run timestamps are valid. The parser and formatter should not use third-party runtime libraries.

Include an example, a README explaining the API and recovery policy, and meaningful offline tests for valid input, mixed errors, lifecycle order, and parse/format round trips. Set up a working TypeScript typecheck and test command. Make reasonable implementation decisions where the format description leaves room, and state them in the README.
