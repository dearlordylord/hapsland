# Fresh pilot stop after B1 postprocessing failure — 2026-09-24

## Decision and protocol status

The preregistered fresh order was A1, B1, B2, A2. A1 has a complete sanitized record and source tree. B1 produced a final source tree, but the harness exited with code 139 before writing its sanitized record. B2 and A2 are stopped. B1 cannot satisfy the protocol's completed-session definition for pairing: its host exit status, reported token use, time, and visibility record are missing, so the stop-before-next-session token gate cannot be checked. Do not retry B1 or substitute a new tree under the frozen protocol. The two-pair confirmatory pilot is incomplete; no pair difference, variance, or Hapsland effect estimate is reported.

## Retained facts

| Item | A1 | B1 |
| --- | --- | --- |
| Pinned host setup | Codex CLI 0.155.1, Linux arm64, Luna/max | Same command and setup; preflight passed |
| Host result | Exit 0, 759,326 ms | Host subprocess closed before tree copy; its exit code, signal, timeout flag, and exact elapsed time were in process memory only and are lost |
| Source artifact | `runs/fresh-pair-1-A/tree/` | `runs/fresh-pair-1-B/tree/`; byte comparison with temporary generated repository excluding build/dependency/Git files showed a complete copy |
| Sanitized record | `runs/fresh-pair-1-A/sanitized.json` | Absent; runner exited 139 after tree copy and before record write |
| Host reported tokens | 351,752 input (312,064 cached, 39,688 uncached), 22,963 output; 62,651 uncached plus output | Unavailable; no valid reconstruction from retained evidence |
| Jev activity | 16 requests, 261,950 full encoded request bytes, 16 HTTP 200 responses | No Hapsland hook configured; no Jev calls expected; no B1 run record exists to attest counters |
| Model-facing feedback | Eight backend finding outcomes; zero advice submissions and zero advice hook responses; model delivery unproven, exact suppression reason uninstrumented | None configured |
| Offline verification | Typecheck and test passed in sanitized A1 record | Retained temporary generated repository: `npm run typecheck` exit 0; `npm test` exit 0 with six tests passing. These commands were run after the harness failure and do not prove the host itself ran them |

The B1 output directory was created around 14:19 local time; the complete tree appeared around 14:27:56 local time. This bounds observed setup, host, and copy work to roughly nine minutes but does not recover the exact host elapsed time. The temporary Codex `state_5.sqlite` `threads` table had zero rows and its `logs_2.sqlite` `logs` table had zero rows. No raw host JSONL was retained by the harness. The host event stream, including any `turn.completed` usage, existed only in the crashed Node process. No raw host or Jev output was read to fill the gap.

## Crash localization

The runner awaits host process closure, assigns `hostEnded`, copies the source tree, then runs final analyzer, typecheck, tests, ledger aggregation, and writes `sanitized.json`. The complete B1 tree and absent record localize the failure **after host closure and source copy, before the record write**. The shell observed code 139, consistent with a segmentation fault in the Node harness; the exact native frame is unknown. The harness' final analyzer is a plausible but unproved site. A separate offline invocation of `analyzeTypeFile` on each retained TypeScript source and on all six sources in one process exited 0, so the failure did not reproduce in isolation. There is no evidence that the generated source caused the crash. The runner's `finally` cleanup did not execute. The private temporary directory, including the copied Codex credential, was deleted after source-free recovery checks and offline verification.

## Source-only review

`blind-score-2026-09-24/` contains two unlabeled final trees and instructions for the frozen 100-point rubric. Its mapping key is separate. Scoring these artifacts may describe concrete final-tree defects and supported/unsupported cells, but must stay separate from the incomplete comparative result and from claims about model visibility or intervention.

The [frozen blind scores](./blind-artifact-scores-2026-09-24.md) and [arm-aware addendum](./arm-aware-addendum-2026-09-24.md) now provide that descriptive review and distinguish ready named-type roots from demonstrated finding delivery.

## Options for owner review

1. **Close #95 Stage 2 as an incomplete pilot:** score both retained trees descriptively, report A1's observed zero delivery and B1's missing runtime ledger, and use the evidence to design a later evaluation. This is the only path that preserves the frozen protocol without new live work.
2. **Register a new prospective evaluation:** first isolate crash-prone postprocessing from the host runner, persist source-free usage and exit metadata durably before postprocessing, and instrument advice collection/revalidation/recipient decisions. Choose a new sample and ceilings before any new host run. The existing A1/B1 trees remain prior feasibility evidence and are excluded from the new sample.

Neither option authorizes B2, A2, a B1 retry, or additional Jev calls under the stopped pilot.
