# Input-contract comparison experiment

This is the credential-gated milestone for issue #16. It compares four versioned
renderers over the same human-authored TypeScript fixtures:

| Mode | Rendered context |
| --- | --- |
| `diff` | Codex-native `apply_patch` update command with a bounded hunk and workspace path |
| `whole-file` | exact post-edit file and the same path |
| `declaration-only` | the edited interface, type alias, or schema and the same path |
| `declaration-context` | that declaration plus bounded outbound referenced declarations, completeness, and omission metadata |

The fixture manifest is [`fixtures.ts`](./fixtures.ts). It contains 25 fixtures (seven
interfaces, six type aliases, six Zod schemas, and six Effect Schema definitions),
human-authored Rule 2 expectations and rationales, stable content identities, and the
pre-registered category memberships. Every fixture has a real member-level before/after
edit; the diff renderer emits the host-observed `*** Begin Patch` / `*** Update File` /
`@@` / `+` / `*** End Patch` command shape rather than standard `--- before` / `+++ after`
unified-diff text. `manifest.ts` exposes the source-free identity view for report tooling.

The ten-field interface is the homogeneous `iface-delivery-ten-fields` fixture. Its
current sanitized Codex/semantic Jev comparison is retained in
[`live-codex-semantic-corpus-comparison-2026-09-20.json`](../../evidence/input-contract-comparison/live-codex-semantic-corpus-comparison-2026-09-20.json):
the Codex patch arm returned `r2_meaningless_combinations = 0.44` (outside the expected
violation band), while the declaration-context arm returned `0.86` (inside the band).

After the first milestone returned `reject-or-narrow`, the follow-up corpus was tightened
and then run as a separately authorized paid milestone. Diff-sufficient fixtures are now
a balanced Rule 2 calibration set, nominal dilution/context fixtures carry a deterministic
clear tail with an offline 3× source-size guard, and superiority is assessed as paired
wins. The final sanitized follow-up result is recorded in
[`live-report-2026-09-20-followup.json`](../../evidence/input-contract-comparison/live-report-2026-09-20-followup.json),
and the exact gates are recorded in [`PLAN.md`](./PLAN.md).

The declaration-context renderer reuses the parsing/artifact seam from the accepted
declaration-extraction experiment. It does not make extraction a production dependency;
this remains an experiment and has bounded declaration, depth, and source-character
caps. Missing required evidence is an explicit `incomplete-required` observation and is
never counted as a clear result. A renderer that structurally cannot carry a fixture's
required reference is recorded as `not-applicable`; it is excluded from semantic
denominators rather than treated as a provider failure or semantic negative. The
Codex-patch and declaration-only arms are therefore not baselines for context-required
fixtures, while whole-file and declaration-context remain applicable.

## Deterministic checks

```sh
npm run --silent test:input-contract
```

The test suite uses the same `ReviewBackend` and Effect `DecisionModel` seam with a
controlled offline model. It does not read credentials or make network calls.

## Live milestone

The pre-run contract is recorded in [`PLAN.md`](./PLAN.md). A command without `--live`
only prints the sanitized plan and an `inconclusive` outcome:

```sh
npm run --silent experiment:input-contract
```

The live command requires explicit opt-in, `TYPESAFE_API_KEY`, and an authorization
ledger covering all 288 logical slots and the selected retry maximum:

```sh
TYPESAFE_API_KEY=... npm run --silent experiment:input-contract -- \
  --live --authorized-remaining 216 --maximum-retries 0
```

The retry flag is part of the pre-run ledger. It may be lowered for a corrected
rerun when earlier observations have already consumed part of the project budget;
the semantic matrix and three repetitions remain unchanged.

Reports contain aggregate timing, usage, availability, request-size, coverage, gate,
and identity evidence only. They do not print source, credentials, or individual paid
probabilities. No live run is started by ordinary tests.

## Production request/result diagnostic

The dashboard also includes a separately authorized, bounded production diagnostic:
[`live-diagnostic-2026-09-20.json`](../../evidence/input-contract-comparison/live-diagnostic-2026-09-20.json).
It spent the final 64 calls (four no-reference fixtures × four renderers × four
repetitions, zero retries) to retain a sanitized representative trace. It records the
exact product-owned artifact metadata, the nine Noul question definitions, returned
decision keys, authored-band semantic outcomes, and aggregate timing. It deliberately
does not retain individual probabilities, raw/source-bearing Jev responses, usage
details, or credentials. This diagnostic is not a rerun of the 24-fixture acceptance
matrix and does not alter the `reject-or-narrow` verdict.

The reproducible runner is
[`live-diagnostic.ts`](./live-diagnostic.ts); do not execute it without a newly approved
paid-call authorization because the current 1,000-call budget is exhausted.

The user-authorized confidence probe for `iface-delivery-flat` is recorded in
[`live-confidence-probe-2026-09-20.json`](../../evidence/input-contract-comparison/live-confidence-probe-2026-09-20.json).
It made two additional zero-retry calls for the applicable whole-file and
declaration-context modes and retains the nine numeric per-rule probabilities. It does
not retain credentials, raw provider responses, or source-bearing paid responses.

The focused-diff renderer was then revised from the historical assumed textual diff to
the runtime-observed Codex patch shape. The retained paid reports and 64-call diagnostic
predate that revision and remain historical evidence for `textual-diff@2`; their focused
diff measurements do not apply to the current `codex-apply-patch@1` renderer. A new full
paid matrix is required to score the revised baseline.

## Runtime Codex comparison

The dashboard's Codex arm is populated from the retained runtime capture corpus
[`native-patch-corpus-2026-09-20.json`](../../evidence/codex/0.155.1/native-patch-corpus-2026-09-20.json), not from `render.ts` synthesizing a diff. Every one of the 24
fixture edits was executed by `codex-cli 0.155.1` in an isolated repository; the
`PostToolUse` callback was retained only after the resulting file matched the authored
`after` source.

The separately authorized comparison
[`live-codex-semantic-corpus-comparison-2026-09-20.json`](../../evidence/input-contract-comparison/live-codex-semantic-corpus-comparison-2026-09-20.json)
sent each captured Codex patch and each complete declaration-context semantic object
tree to Jev once, with zero retries (48 calls total). This is an observability
comparison, not a replacement for the historical repeated gate. The dashboard's
`Jev request` and `Jev result` views show those two arms side by side; whole-file is
intentionally omitted from the mode tabs.
