# Issue #97: Codex turn-end delivery measurement

Status: isolated prototype evidence, 2026-09-25. No production hook or adapter change.

## Tested envelope and method

The first test host was `codex-cli 0.156.1` on Linux, outside Hapsland's declared Linux profile. On 2026-09-25, the full matrix was repeated on the exact supported Linux profile: Codex CLI 0.155.1, Node.js 24.20.0, Linux arm64. Both runs used `gpt-6-luna` at `model_reasoning_effort="max"` with headless `codex exec --ephemeral`. The earlier [0.155.1 lifecycle evidence](../evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json) established synchronous Stop hooks, two successful `decision: "block"` continuations, and ordinary `SessionEnd`; this issue's exact-version run measures delivery behavior. The current Codex path admits direct edits to a resident asynchronous review/work/advice queue and collects ready advice through subsequent mapped `PostToolUse` replies. It has no Stop collection path.

The [Codex hook documentation](https://developers.openai.com/codex/hooks) establishes the host's documented hook events and async-command option. Those are documentation claims; behavior and output visibility below are measured separately for each exact CLI version. The macOS 0.156.0 profile was not run for this issue.

The [matrix runner](../evidence/delivery-97/run.mjs) creates a disposable Git repository and temporary Codex home for each case, copies Codex authentication without reading or printing it, enables the test hooks, and removes the temporary state. A synthetic `apply_patch` adds a BAD value. Its [hook](../evidence/delivery-97/hook.mjs) simulates review admission and completion with a controlled clock delay. It emits a fixed, source-free finding. The matrix does not call Jev or measure real backend latency. The later IPC probe below adds a real local service. Runners accept an explicit CLI binary, version label, and evidence path so each tested profile has a separate record. Their [machine-readable evidence](../evidence/delivery-97/codex-0.156.1-luna-max-2026-09-24.json) retains event types, source-free timestamps, outcome flags, and selected synthetic fixture labels. Neither probe retains host JSONL, prompts, source, credentials, or raw model text. These are selected fixtures, not a field population rate.

The baseline simulates admission at the first edit and collects ready advice only on a subsequent mapped `PostToolUse`, matching the current opportunity-based delivery policy. Its bounded candidate waits for the current `(session, agent, cwd)` recipient's admitted work at Stop. It submits one fixed finding through `decision: "block"` and permits only one continuation. The first 0.156.1 candidate timed only its post-parse wait and had no resident IPC path, so it did not meet #97's exact five-second contract. The later IPC probe times from its first script statement through parsing, IPC, collection, and the response write callback. The background candidate uses Codex's native `async: true` `PostToolUse` command hook, described in the [Codex hook documentation](https://developers.openai.com/codex/hooks); Codex documents its lifecycle, but the results below come from the exact-version host runs. Background output is a separate delivery surface and does not increment the prototype's explicit `hostSubmissions` counter.

## Initial 0.156.1 matrix

There were 11 isolated sessions, each with one eligible BAD direct edit: 11 eligible edits, 12 admitted synthetic review units (one two-unit fixture), 11 finding units, zero clear units, and one simulated unavailable unit. Seven finding units were ready by the first Stop entry; four were still in flight. Eight finding units became ready before session end. These counts derive from scheduled completion timestamps; the prototype has no actual backend completion event for the bounded or baseline modes. No population frequency can be inferred.

| Candidate and fixture | First Stop wait | Host delivery and independently observed reaction |
| --- | ---: | --- |
| Subsequent hook, no later edit | 0 ms | Ready finding remained unsubmitted; BAD remained. |
| Subsequent hook, second mapped edit | 0 ms | `PostToolUse` submitted finding; Luna changed BAD to GOOD. |
| Bounded Stop, ready before Stop (0 and 1.5 s delays) | 1 ms each | Stop submitted finding; Luna changed BAD to GOOD in both. |
| Bounded Stop, ready during Stop (4 s after edit) | 2,396 ms | Stop submitted finding; Luna changed BAD to GOOD. |
| Bounded Stop, two ready units | 2 ms | One combined message was submitted; Luna changed BAD to GOOD. The two units were not independently distinguishable to the model. |
| Bounded Stop, 7.5 s delay | 4,859 ms | Deadline passed; no submission, BAD remained, session ended before scheduled completion. |
| Bounded Stop, unavailable | 0 ms | No finding submitted; BAD remained. This is unavailable, not clean. |
| Native background, 1.5 s delay | 0 ms at Stop | The background hook emitted `additionalContext`; Luna changed BAD to GOOD without our Stop submission. |
| Native background, 4 and 7.5 s delays | 0 ms at Stop | Session ended before background output; no model repair. |

Six sessions had an independently observed same-turn repair after finding output: baseline next hook, three single-unit bounded cases, bounded multi-unit, and background 1.5 s. That represents seven synthetic units in six output opportunities, but the second unit in the multi-unit case has no separate visibility proof. No later-turn session was tested, so later visibility is **unmeasured**, not zero in the population. Four finding units had no visible delivery before session end: the baseline without a later event, the bounded timeout, and the two late background cases. The one unavailable unit is excluded from finding visibility counts.

For the initial bounded candidate, measured edit-hook entry-to-return was 0–1 ms in these cases; this clock resolution does not establish end-to-end native edit latency. The 4-second-delay Stop case spent 2,396 ms waiting; the timeout spent 4,859 ms. The other first Stop calls took 0–2 ms. Response creation/writing are inside the measured hook duration, while process launch and stdin parsing are outside it and resident IPC is absent. These figures cannot establish compliance with a five-second limit from actual hook entry through IPC and response writing. The local IPC probe below addresses most of that gap.

The native background hook's process returned about 1.5 seconds after entry. The Codex `file_change` completion event was already emitted just before that entry, and the next model message came after background output. This supports delivery at a later safe point in this fixture; it does **not** establish zero native edit latency or guaranteed delivery at turn end. The 4-second background case ended before completion and yielded no output. The [hook-level checks](../evidence/delivery-97/hook.test.mjs) verified recipient mismatch does not collect advice, only one continuation is emitted, changing BAD to GOOD before handoff suppresses stale advice, and a timed-out Stop attempt leaves work available for a later Stop attempt. Those are prototype checks, not host concurrency conformance.

## Exact-profile Linux 0.155.1 matrix

The declared Linux host profile was tested directly on Linux arm64 with Node.js 24.20.0 and Codex CLI 0.155.1. The [sanitized evidence](../evidence/delivery-97/codex-0.155.1-luna-max-2026-09-25.json) contains 11 isolated sessions: 11 eligible direct edits, 12 admitted units, 11 finding units, one simulated unavailable unit, and no clear units. Seven findings were ready at first Stop entry and four were still in flight. Eight synthetic findings completed before session end. These are selected fixtures with scheduled completions, not an estimate of production frequency.

| Candidate and fixture | First Stop wait | Host delivery and independently observed reaction |
| --- | ---: | --- |
| Subsequent hook, no later edit | 0 ms | Ready finding remained unsubmitted; BAD remained. |
| Subsequent hook, second mapped edit | 0 ms | `PostToolUse` submitted the finding; Luna changed BAD to GOOD. |
| Bounded Stop, ready before Stop (0 and 1.5 s delays) | 3 ms and 1 ms | Stop submitted the finding; Luna repaired both. |
| Bounded Stop, ready during Stop (4 s after edit) | 2,237 ms | Stop submitted the finding; Luna repaired BAD to GOOD. |
| Bounded Stop, 7.5 s delay | 4,871 ms | No submission; the synthetic result was scheduled after the session ended. |
| Bounded Stop, two ready units | 1 ms | One combined message submitted both; Luna repaired BAD to GOOD. Per-unit visibility remains unproven. |
| Bounded Stop, unavailable | 0 ms | No finding submitted; BAD remained. This was unavailable, not clear. |
| Native background, 1.5 s delay | 0 ms at Stop | The async `PostToolUse` completed 1,505 ms after entry; Luna repaired BAD to GOOD in the same turn. |
| Native background, 4 and 7.5 s delays | 0 ms at Stop | No output or repair; no background completion event appeared during an 8.5 s observation after Codex exited. |

Six sessions showed same-turn repair after finding output: the next-hook case, four bounded cases, and the 1.5-second background case. This represents seven synthetic units across six output opportunities; the second unit in the multi-unit message still has no separate visibility proof. Four finding units were not visible before session end: the no-later-event baseline and three late cases. Later-turn visibility was not measured. The unavailable unit is excluded from finding visibility counts.

The bounded Stop waits ranged from 0 to 4,871 ms. Event-level edit-hook entry-to-return was 0–1 ms for synchronous baseline and bounded cases; it is below useful precision for native edit latency. The background command did not delay the edit tool, and its 1.5-second runtime delivered only because output arrived before the model finished. The two longer async runs produced no recorded completion even during the post-session observation window. The previous 0.156.1 matrix had the same high-level outcome pattern; neither selected sample is a field distribution.

## Initial 0.156.1 local IPC follow-up

The [IPC runner](../evidence/delivery-97/run-ipc.mjs) repeated five bounded Stop fixtures with an actual local Unix-socket [review service](../evidence/delivery-97/ipc-service.mjs). The service owns recipient-keyed admitted work, schedules controlled offline completions with real timers, and logs each actual finding or unavailable completion. The edit and Stop [hook](../evidence/delivery-97/ipc-hook.mjs) crosses that socket. Its Stop clock starts at the first executable statement in the hook script, before stdin parsing, and ends after the stdout write callback but just before the final timing log; this includes parsing, IPC, collection, and response writing. The Stop request deadline is 4.5 seconds, its socket deadline is 4.7 seconds, and Codex itself is configured to terminate a hook command after five seconds. Node process launch and module loading precede the script-entry clock. Codex JSONL does not expose a separate hook-command launch timestamp, so launch-to-return wall time cannot be derived from this evidence. The native five-second command timeout is the external guard for that gap; it is not evidence that a timed-out hook successfully submitted advice.

| Local IPC fixture | Edit hook entry to return | First Stop script entry to return | Actual backend completion and result |
| --- | ---: | ---: | --- |
| Ready before Stop | 10 ms | 11 ms | One finding completed; Stop submitted it; Luna repaired BAD to GOOD. |
| Completes during Stop | 40 ms | 2,386 ms | One finding completed during collection; Stop submitted it; Luna repaired BAD to GOOD. |
| Beyond Stop deadline | 10 ms | 4,451 ms | No completion before session end; no submission or repair. |
| Two units | 5 ms | 10 ms | Two finding completions; one combined submission; Luna repaired BAD to GOOD. |
| Backend unavailable | 18 ms | 10 ms | One unavailable completion; no finding submission or repair. |

These five selected sessions contain five eligible direct edits, six admitted units, five finding units, zero clear units, and one unavailable unit. Three finding units were completed before first Stop entry (ready and two-unit cases); two were in flight (during-Stop and beyond-deadline). Four finding units completed by session end. Three sessions showed independent same-turn repair after an output opportunity, representing four units; the two-unit message still lacks separate unit-level visibility proof. One finding unit was not visible before session end, and later-turn visibility was not tested. The first Stop script-entry durations were 10–4,451 ms, all below five seconds. The edit-hook script durations were 5–40 ms. These are fixture observations, not a delivery frequency or latency distribution for real Jev.

The [IPC test](../evidence/delivery-97/ipc.test.mjs) passes recipient isolation, one-time collection, two-unit collection, explicit unavailable outcome, and retention across an expired collection deadline. The [sanitized IPC evidence](../evidence/delivery-97/codex-0.156.1-luna-max-ipc-2026-09-24.json) records only event timing, outcome counts, generic recipient aliases, and host event types. It retains no socket payloads, session identifiers, source, model text, or credentials. The service is a disposable prototype; it does not implement Hapsland's production queue bounds, extraction, cache, real Jev calls, or all stale-result races.

## Exact-profile Linux 0.155.1 local IPC follow-up

The same Unix-socket service and Stop hook were run on Codex CLI 0.155.1. The [sanitized IPC record](../evidence/delivery-97/codex-0.155.1-luna-max-ipc-2026-09-25.json) contains six direct-edit sessions, seven admitted units, six synthetic findings, one unavailable outcome, and no clear outcome. Edit-hook script entry-to-return was 3–8 ms. First Stop script entry-to-return was 2, 2,441, 2,712, 2, 4, and 4,437 ms; all six were below five seconds. These clocks include JSON parsing, socket IPC, collection, and response writing through the stdout callback. They start at the first JavaScript statement, after Node process launch and module loading.

| Local IPC fixture | First Stop wait | Actual backend completion and result |
| --- | ---: | --- |
| Ready before Stop | 2 ms | One finding completed before Stop; it was submitted and Luna repaired BAD to GOOD. |
| Completes during Stop | 2,441 ms | A finding completed during collection; Stop submitted it and Luna repaired BAD to GOOD. |
| 7.5 s after edit | 2,712 ms | The finding completed during Stop, was submitted, and Luna repaired BAD to GOOD. It was not a timeout in this run. |
| Two units | 2 ms | Both findings completed before Stop; one combined message was submitted and Luna repaired BAD to GOOD. Per-unit visibility remains unproven. |
| Backend unavailable | 4 ms | The service returned unavailable; no finding was submitted and BAD remained. |
| 12 s after edit | 4,437 ms | Stop returned without a finding. Codex ended at 12,555 ms; the service completed at 17,897 ms, 5,986 ms after `SessionEnd`. No same-turn submission or repair occurred. |

For the six selected sessions, five finding units completed by session end and one completed after the host process exited. Four output opportunities produced same-turn repair, representing five units; the two-unit response still lacks separate unit-level visibility evidence. Later-turn visibility was not tested. The 12-second case's separate 6.5-second post-session observation confirmed the result completed after the turn-end collection timed out. The offline [IPC test](../evidence/delivery-97/ipc.test.mjs) separately verifies recipient isolation, one-time collection, two-unit collection, explicit unavailable outcomes, and that a finding remains collectable after an earlier collection deadline expires.

The 7.5-second fixture shows why results must be classified by observed event order: with this host's longer time from edit to Stop, that result was ready during the Stop budget and was delivered. The 12-second fixture remained in flight through the full Stop wait and session end. Neither synthetic delay estimates live Jev latency.

## Comparison and recommendation

Subsequent-hook collection is fast when another mapped edit occurs, but has no delivery opportunity when the turn stops after the reviewed edit. Native background delivery worked when output finished early enough for another model safe point; the 4- and 7.5-second cases did not produce a finding before the turn ended, and no completion appeared during the 8.5-second post-session observation on the exact Linux profile. Bounded Stop collection reached Luna when a finding finished during the wait. On exact Codex 0.155.1, those waits were 2.441 and 2.712 seconds; a separate finding that remained in flight returned at 4.437 seconds with no submission. The repeated 7.5-second delay was ready during Stop on this host and must not be counted as a timeout. The provisional five-second ceiling is useful enough to specify as a **candidate maximum for further compatibility testing**, not a production default or observed optimum.

Recommend specifying a recipient-scoped bounded Stop collection path for the next contract, while keeping native background hooks as a separate candidate. Before production adoption, validate the production resident and adapter through host launch, IPC, collection, and response writing against the strict five-second ceiling; also validate timeout retention for an active session, response bounds for multiple units, stale revalidation, concurrent recipients and subagents, and the macOS 0.156.0 profile. The local IPC run establishes the scripted path on Linux 0.155.1, not production resident compatibility or the command-launch interval before the first JavaScript statement. Delivery remains a fire-and-forget host submission unless the model reaction is independently observed. No claim about Claude Code or OpenCode follows from this Codex result.
