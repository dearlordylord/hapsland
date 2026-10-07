# Issue #95 initial blind artifact scores — 2026-09-24

**Provenance clarification (2026-10-07):** References below to `TYPE-DESIGN-RULES.md` name the [frozen five-rule rubric](https://github.com/dearlordylord/hapsland/blob/2d5ec8f3e2359dd4aa3bf37a0588d9e69e3b2496/TYPE-DESIGN-RULES.md). Its removal from current guidance does not amend this historical declaration or scoring.

These scores were frozen from the source-only `blind-score-2026-09-24/` package, accepted prompt, `TYPE-DESIGN-RULES.md`, and preregistered Stage 2 rubric. Candidate labels are arbitrary. I did not inspect the mapping key, run records, Hapsland findings, prior scores, or host ledger. This is descriptive artifact scoring of an incomplete pilot, not a paired quality effect claim. Hapsland-supported-unit status cannot be determined from the blind source package and is **unassessed** for every defect below.

| Frozen cell | Maximum | candidate-r4 | candidate-m7 |
| --- | ---: | ---: | ---: |
| Field grammar | 5 | 5 | 5 |
| Lifecycle and identity | 5 | 5 | 5 |
| Diagnostic classification | 5 | 5 | 5 |
| Recovery and accepted records | 5 | 5 | 5 |
| Source line numbers | 5 | 5 | 5 |
| Round-trip facts | 8 | 8 | 8 |
| Invalid-document policy | 4 | 4 | 4 |
| Summary counts and time | 3 | 3 | 3 |
| Type rule 1: explicit variants | 7 | 0 | 0 |
| Type rule 2: meaningful combinations | 7 | 0 | 0 |
| Type rule 3: correlated facts, one shape | 7 | 0 | 7 |
| Type rule 4: one representation | 7 | 0 | 0 |
| Type rule 5: absent and empty | 7 | 0 | 0 |
| Runnable typecheck and tests | 5 | 5 | 5 |
| Meaningful test assertions | 7 | 7 | 7 |
| Example execution | 3 | 3 | 3 |
| Accurate public exports | 5 | 5 | 5 |
| Accurate recovery and formatting docs | 5 | 5 | 5 |
| **Initial raw score** | **100** | **65** | **72** |

## Concrete defects behind deductions

Every item is a defect in the exported final-source type, not a claim about parser output or advice seen by a host. Each is **material** for consumers constructing or changing document values. All supported-unit statuses are **unassessed while blind**.

| Candidate | Rule | Exact source location and admitted counterexample | Severity |
| --- | --- | --- | --- |
| r4 | 1 | `src/types.ts`, `TraceTapeCase`: `{caseId:'c',suite:'s',name:'n',declarationLine:2,logs:[],end:validEnd}` has an ended case without a begin. The case lifecycle has no phase discriminant; consumers infer phase from optional `begin`/`end`. Adding a new phase would not force an exhaustive consumer check. | Material |
| r4 | 2 | `src/types.ts`, `TraceTapeCase`: the same value admits `end` while `begin` is absent, and also permits `logs:[validLog]` with no begin. Neither is a possible accepted case lifecycle. | Material |
| r4 | 3 | `src/types.ts`, `CaseDeclarationRecord` and `TraceTapeCase`: one declaration is a record with `type`, `lineNumber`, `caseId`, `suite`, `name`, while the case view inlines a different shape with `declarationLine`, `caseId`, `suite`, `name`. Changing only `TraceTapeCase.suite` leaves its corresponding declaration record stale; the same declaration has no shared value in the view. | Material |
| r4 | 4 | `src/types.ts`, `TraceTapeDocument`: `records` may contain `CASE` for `c`, while `cases` may be `[]` or name `d`; `run` can differ from the `RUN` record and `done` from `DONE`. All encodings are independently mutable and accepted by the type. | Material |
| r4 | 5 | `src/types.ts`, `EndRecord`: `{type:'END',lineNumber:4,caseId:'c',status:'fail',durationMs:1,detail:''}` is admitted though fail detail must be nonempty. Empty and nonempty detail are indistinguishable at the type level for the status that requires a nonempty value. | Material |
| m7 | 1 | `src/types.ts`, `TraceTapeCase`: `{declaration:validCase,logs:[],end:validEnd}` has no begin but an end. Phase is inferred by optional field presence, with no phase discriminant or exhaustive match. | Material |
| m7 | 2 | `src/types.ts`, `TraceTapeCase`: `end` without `begin`, or a nonempty `logs` array without `begin`, is representable although no accepted lifecycle has it. | Material |
| m7 | 4 | `src/types.ts`, `TraceTapeDocument`: `records` may hold `CASE` for `c` while `cases` is `[]`, or `run` may claim a different run ID than the `RUN` record. The required `valid` boolean can also be `true` while `diagnostics` is nonempty. The type contains competing encodings of the same facts. | Material |
| m7 | 5 | `src/types.ts`, `EndRecord`: `status:'fail', detail:''` is admitted though the grammar requires nonempty fail detail; a caller can also make `status:'pass', detail:'error'`. A conditional nonempty fact is only checked by the parser, not expressed in the exported shape. | Material |

Rule 3 earns credit for m7 because the case view carries its declaration as a single `CaseRecord` value of the same exported shape used in `records`; I did not count mere references to a case ID as a correlated-fact violation. The above rule 1 and 2 examples overlap, as the frozen rubric checks each invariant separately. Both record unions themselves have explicit `type` tags. Both parsers validate field values before constructing their own records; the deductions concern values public types allow consumers to construct or mutate.

## Offline execution and hidden grammar checks

From each candidate directory, I ran `npm run typecheck`, `npm test`, and a Node ESM import of `dist/index.js` parsing its bundled `.tracetape` example and calling `summarizeRun`. All exited 0. r4: 5/5 tests passed; example had no diagnostics and summarized one pass, 2000 ms. m7: 6/6 tests passed; example had no diagnostics and summarized one pass, one fail, 100 ms. Neither package lists a runtime dependency.

I also ran an offline, read-only Node ESM script against each built `dist/index.js` with five independent grammar fixtures:

- A valid CRLF document with a comment, two interleaved cases, logs (including empty message), skip and fail endings: both returned ten records at physical lines 2–11, no diagnostics, status counts fail 1 and skip 1, elapsed 1000 ms; parse/format/parse record facts matched exactly after excluding regenerated line numbers.
- Seven malformed values across empty suite, bad BEGIN/DONE timestamps, bad LOG level, negative duration, missing fail detail, and nonempty pass detail: each implementation rejected precisely those seven lines as malformed and retained later valid records.
- Duplicate case ID, unknown case reference, END before BEGIN, unknown record between valid records, and a record after DONE: both classified and rejected them while retaining the later valid BEGIN/LOG/END sequence.
- CASE before RUN followed by later RUN: both rejected all content, reported lifecycle faults and incomplete run. A later RUN did not silently repair the first-record rule.
- RUN with two incomplete CASE declarations (one never begun, one begun without END) and no DONE: both reported incomplete run and both incomplete cases.

The implementations differ in names of their stable diagnostic codes and end-of-input line convention, both documented in their READMEs. r4 reports one `INCOMPLETE_RUN` when no RUN exists; m7 reports separate missing-RUN and missing-DONE diagnostics. Neither difference violates the accepted prompt. The tested source-only artifacts have no observed blocking parse or package defect under these cases. I did not use test pass as evidence to clear the exported type defects.
