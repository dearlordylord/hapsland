# Codex CLI 0.155.1 runtime evidence

**Dates:** 2026-09-19 (baseline probes), 2026-09-20 (issue-4 lifecycle and diagnostic-channel probes)
**Platform:** Linux, headless `codex exec --ephemeral --json` and interactive TUI
**Codex:** `codex-cli 0.155.1`
**Pinned source:** annotated tag `rust-v0.155.1`, tag object
`4e21628f9ec9ee656650cd2b62ef92225725b5ac`, resolving to commit
`be2951ea34f0d295ed0becf97079f92fa5f6950e`

The fresh native edit boundary is documented in
[`NATIVE-APPLY-PATCH-EMISSION-2026-09-20.md`](./NATIVE-APPLY-PATCH-EMISSION-2026-09-20.md),
with sanitized runtime captures for one file creation and one file update. It records
the actual `PostToolUse` `tool_input.command` shape and separates that hook boundary
from the host's summarized JSONL `file_change` events.

The probes used a temporary `CODEX_HOME`, a disposable Git repository, and the repository
scripts in `probe/`. Only authentication material was copied into the temporary home. The
user's configuration was not read or changed. `--dangerously-bypass-hook-trust` was limited
to this isolated, reviewed configuration. No Jev request was made.

The validated ten-field interface example is reproducible with
[`validate-ten-field-interface-patch-shape.mjs`](./probe/validate-ten-field-interface-patch-shape.mjs).
It performs a real Codex run against a `Delivery` interface with exactly ten named fields,
captures the `PostToolUse` command, and asserts the exact one-field hunk. The retained
assertion record is
[`native-ten-field-interface-edit-validation-2026-09-20.json`](./native-ten-field-interface-edit-validation-2026-09-20.json).

The older ten-line probe remains historical evidence; it is not the dashboard's ten-field
example.

## Issue-4 lifecycle evidence

The exact replay command for the retained issue-4 lifecycle ledger is:

```sh
node evidence/codex/0.155.1/probe/issue-4-lifecycle.mjs
```

It ran on Linux arm64 with Node `v24.20.0`, Git `2.39.5`, and `codex-cli 0.155.1`. The runner
created disposable repositories on `master`, temporary mode-600 Codex homes, and source-free
hook captures. Successful Bash, nonzero Bash with a side effect, delayed final-state Bash, normal
Stop, two Stop-driven continuations, and external SIGINT were exercised. The successful and
continuation processes exited `0`; the interrupted process exited `1` with `SIGINT` handling. The
continuation case observed three Stop attempts and only the initial `UserPromptSubmit`; the
delayed-write case observed only the final snapshot; the interrupt case observed `Interrupt` and
`SessionEnd` without `PostToolUse(Bash)`.

The retained ledger assertions report `overallPass: true`, `69/69` assertions passed, `0` failed,
and `replayExitCode: 0`. The root environment assertions also confirm the expected Codex version,
Git availability, temporary-root cleanup, no Jev call, no retained credentials, and no retained raw
source.

Retained paths are [`issue-4-lifecycle.mjs`](./probe/issue-4-lifecycle.mjs),
[`issue-4-lifecycle-hook.mjs`](./probe/issue-4-lifecycle-hook.mjs), and
[`issue-4-lifecycle-2026-09-20.json`](./issue-4-lifecycle-2026-09-20.json). The ledger retains
versions, commands with disposable placeholders, expected/observed event order, process exit
status, final file sizes/hashes, and bounded timing. It retains no transcripts, command output,
credentials, or source bytes.

This is a headless direct-Bash claim only. Separate unified-exec/`write_stdin` transport,
interactive issue-4 PTY, restart/resume, kill/terminal-close, and another host release were not
exercised. The nonzero Bash fixture proves a side effect and post-event delivery, but the hook
payload exposes `tool_response` as an opaque string, so numeric exit `17` is not claimed as a
structured host fact.

## Observations

1. A successful native file creation emitted one `PostToolUse` event. Both configured
   handlers returned distinct marker context, and the model named both markers before any
   next tool action.
2. One native patch adding two files emitted one event whose patch command named both
   paths. Both files existed afterward.
3. A successful shell write emitted `tool_name: "Bash"` and the original command, but no
   authoritative changed-file list.
4. A deliberately failed patch against a missing file emitted no `PostToolUse` event.
5. Two matching handlers coexisted and both ran for each successful event.
6. Malformed stdout, exit code 7, and a handler killed at its one-second timeout did not
   reverse the completed edit and did not prevent Codex from continuing.
7. An interactive `codex --no-alt-screen` session with an isolated temporary
   `CODEX_HOME` showed the product hook running after the edit and delivered its advice
   before the next action. Interactive mode does not accept `--ephemeral`, so all state
   was confined to the temporary home and repository and the session was exited normally.
8. The actual `src/cli.ts --codex-hook --controlled` command returned rule
   `r1_inferred_case` at probability `0.95` for `review-me.ts`. Codex repeated snapshot hash
   prefix `48a53e989644`; the on-disk SHA-256 began with the same prefix. No tool action
   occurred between the completed edit and that model-visible advice.
9. The same command and controlled decision model were exercised in the interactive TUI
   for `interactive-review.ts`. Codex repeated the same rule, probability, and hash prefix;
   an independent post-session SHA-256 was
   `48a53e989644754fbf5ddfc06ff8456ed971952966531446d8fb8decfc1845ad`.
10. One headless patch added `alpha-review.ts` and `beta-review.ts`. The actual product
    command reviewed both files independently and returned two advice items before Codex's
    next action. Codex repeated hash prefixes `97b28afb7737` and `6950f2526f5c`; both
    matched independent post-session SHA-256 values. See
    `product-advice-delivery-multi-file.json`.

The sanitized fixtures intentionally replace session, turn, tool-use, model, response, and
workspace identities. Source text in these fixtures is synthetic.

## Deterministic subprocess timing

Twenty local end-to-end invocations of the version-1 command with a zero-delay controlled
`DecisionModel` and a 146-byte request measured: p50 825.9 ms, p95 1361.8 ms, p99
1613.5 ms (min 573.6 ms, max 1613.5 ms). These figures include Node startup and TypeScript
loading on this development container; provider duration was 0 ms. They are not live Jev
latency claims and show that packaging/startup needs later hardening.

## Live Jev milestone validation

The repository owner authorized paid validation at declared milestones. With the configured
credential, the isolated live suite passed on 2026-09-19:

- the exact synthetic `library-loan.ts` r6 cell recorded at p=0.853 before migration remained
  above the local 0.7 violation threshold through Effect's provider-neutral
  `DecisionModel` and `@effect/ai-typesafe`;
- the full nine-rule Noul set returned the exact requested key set in one `decide` operation.

The first full-set assertion incorrectly required object insertion order even though every
key was present. It was corrected to compare the exact key set, and the two-check suite then
passed. No credential, source-bearing response, or paid probability output was committed.
The passing suite took 1.13 seconds wall-clock in this container. A later declared milestone
then exercised 100 complete product-process calls, with all nine rules requested per call:

- outcomes: 100 reviewed, 0 unavailable, 0 protocol failures;
- backend latency: p50 411 ms, p95 475 ms, p99 509 ms (354–563 ms);
- process-visible latency: p50 649.97 ms, p95 722.77 ms, p99 807.74 ms
  (579.43–942.87 ms);
- retries: 0 total, maximum 0 on one call;
- provider usage metadata: 100 responses, 370,300 input tokens and 19,900 output tokens;
- synthetic source size: 344 bytes; product protocol request size: 173–175 bytes.

Percentiles use nearest-rank. The Effect provider does not expose provider-wire byte size,
so the report does not claim it. One additional live diagnostic call occurred outside the
100-call sample while correcting a benchmark wrapper that had failed to send stdin; the
aborted processes made no paid request. See `live-milestone-100.json` and the reproducible
`probe/benchmark-live.mjs`. No individual assessment, probability, credential, or
source-bearing paid response was retained.

## Issue-13 diagnostic channel evidence

The product-owned diagnostic renderer emits bounded problem/recovery text as the top-level
Codex `systemMessage` (the interactive user-visible channel) and keeps review findings in
`hookSpecificOutput.additionalContext` (the agent-facing channel). It never copies a
backend reason, source path content, credential, or environment value into either channel.

The sanitized ledger is [`diagnostic-channel-issue-13.json`](./diagnostic-channel-issue-13.json).
Its pinned-source fields identify the Codex TUI renderer and headless JSON event processor;
the repository's existing compatibility contract remains the normative source for the
adapter seam. An isolated interactive Codex 0.155.1 PTY probe performed a successful
synthetic `apply_patch`. The TUI visibly rendered the bounded `systemMessage` as a Hook
history cell, and the next model response confirmed receipt of the separate
`additionalContext` value. The raw transcript, temporary repository, copied authentication
files, and model session were deleted; the ledger retains only the exact sanitized
observations and cryptographic digests. The deterministic process-boundary suite separately
proves healthy/problem/repeated/changed/recovered/concurrent/independent transitions and
secret-sentinel absence offline.
