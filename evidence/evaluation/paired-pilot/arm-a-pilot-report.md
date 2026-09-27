# Issue #95 Stage 2: stopped after pair 1, Arm A

**Recorded:** 2026-09-24. **Meter correction:** 2026-09-24, after supplemental review. This is an incomplete paired evaluation. No Arm B or pair 2 session was started. The [preregistered protocol](../../../docs/evaluation-paired-pilot-protocol.md) remains unchanged.

## Observed session

The owner accepted the Stage 1 TraceTape prompt/tree. Pair 1 Arm A then ran in a fresh repository with Codex CLI `0.155.1` on Linux arm64, `gpt-6-luna` at `max` reasoning, native `PostToolUse` hooks wired to Hapsland's production `--codex-hook --controlled-writer` path, explicit repository consent, and a source-free provider-boundary guard. The isolated test invocation used Codex sandbox and hook-trust bypass in both planned arms. The final [source tree](./runs/pair-1-A/tree/) and [sanitized machine record](./runs/pair-1-A/sanitized.json) are retained. No raw host transcript, Jev response, or credential was retained.

| Measure | Arm A observation |
| --- | ---: |
| Host completion | exit 0; no timeout; 749,647 ms host wall time |
| Jev boundary | 14 requests and 14 HTTP 200 completions; the old meter recorded 1,918 **root-source bytes only**. Full encoded request bytes, including source-bearing evidence nodes, were not recorded. The 80-request limit was met; compliance with the intended 2 MiB aggregate full-source/request bound cannot be established. |
| Resident activity markers | 14 pending, 8 clear, 6 findings, 2 submitted, 12 incomplete; markers are stages and are not additive disjoint outcomes |
| Hook responses | 34 hook invocations; 2 advice responses carrying 8 finding lines in total |
| Final offline verification | Typecheck passed; test command passed (six tests) |
| Cost | Codex and Jev dollar charges unavailable from this instrumentation |

The host reported **1,336,616 input tokens**, of which **1,253,632 were cached input tokens** and **82,984 were uncached input tokens**. It reported **36,983 output tokens**, including **19,812 reasoning output tokens**. Total input plus output was **1,373,599**; uncached input plus output was **119,967**. Cached tokens are a subset of input tokens, and reasoning tokens are a subset of output tokens; neither should be added twice.

The original provider guard counted only `state.artifact.source`. Review input can also contain source-bearing evidence nodes, so its byte counter was incomplete. The 1,918-byte value in the immutable [sanitized run record](./runs/pair-1-A/sanitized.json) must be read as **root-source bytes**, not total egress or total source bytes. The actual encoded request-byte total cannot be recovered because request bodies and raw responses were correctly discarded. After this finding, the guard was changed for future runs to charge every byte of the encoded request body and fail closed; the [offline meter checks](./provider-guard.test.mjs) cover evidence-node overflow and aggregate limits. No live run used the corrected guard.

The preregistered stopping rule said to stop before another session when reported Codex tokens reach 250,000 in any run. On the conservative reading that includes cached input, this first session exceeded that threshold. Further runs were stopped before Arm B. Reinterpreting the limit after observing Arm A would make the original comparison post hoc. The session remains a feasibility pilot, with no A–B quality difference or variance estimate.

## Exposure and visibility limits

The provider-boundary ledger proves 14 requests reached Jev and all 14 returned HTTP 200. Production activity separately classified eight reviewed-clear and six finding unit outcomes. Two later mapped Bash hooks wrote advice responses, one with five finding lines and one with three. This establishes attempted host submission, not model receipt of each finding. The sanitized host stream records one final agent message that mentioned Hapsland after both submissions, so there is evidence of product-level awareness. The retained record does not preserve the message wording or an advice-specific acknowledgement. It cannot prove that any individual finding was read, used, or caused a repair. Thus finding-level demonstrated visibility is **0/8**, with **8/8 unproven**; later-turn visibility was not tested because this was one host turn. The final tree includes type changes consistent with self-review and possible advice, but this instrumented run cannot attribute them to either source.

The final tree has six TypeScript source files. Hapsland's production analyzer marks four roots in `src/types.ts` ready and 20 roots in that file unsupported, predominantly because branded-value references are outside current same-file evidence. Four other source files contain imports and are unsupported as whole files; `src/index.ts` has no declaration roots. These are **final-tree** cells. The instrumentation did not retain a per-unit intermediate analyzer snapshot at every edit, so the 14 provider requests cannot be mapped precisely back to each final type root. The final exported `EndFacts` union encodes fail detail by status; `TraceTapeDocument` still exports both source-order `records` and case-centered `cases`, which can disagree if constructed externally, but that root is unsupported in the final analyzer state. No blind comparative rubric score was assigned to this single artifact.

The source-only tree remains useful for reviewing the host/profile and exposure limits. It is not evidence that Hapsland improved or harmed code quality. Any continuation needs the separately proposed, owner-approved amendment; no more live Jev calls are authorized under the stopped protocol.
