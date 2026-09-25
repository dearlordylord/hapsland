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

## Exact-profile Linux 0.155.1 production-resident follow-up

The [resident runner](../evidence/delivery-97/run-resident.mjs) used Codex CLI 0.155.1, Node.js 24.20.0, Linux arm64, Luna at maximum reasoning effort, and the source-run production `src/cli.ts` direct Codex hook. Codex delivered its native `PostToolUse(apply_patch)` event to Hapsland's real adapter and resident admission path. The resident ran the real extraction, queue, offline controlled Effect `DecisionModel`, collection, lease, and acknowledgement code. No Jev request was made. At Stop, a test-only client called the production resident APIs, scoped by the test repository and the Codex session/root-agent recipient. It handed the production finding text to Codex as `decision: "block"`, then used the production acknowledgement path after the stdout callback. No production Stop hook or installation change was made.

The Stop command in Codex's temporary hook profile is a compiled C wrapper. Its monotonic clock starts at the wrapper's `main` entry, before it forks and launches Node; it stops after Node exits. This includes Node startup and module loading, stdin parsing, resident IPC, bounded collection, host-response writing, and advice finalization. Node awaits its stdout callback before exit, so the full command duration is a conservative upper bound on response time. Executable-loader time before `main` is outside the clock. The wrapper uses a 4.2-second collection deadline and Codex has a five-second command timeout. The separate PostToolUse clock uses the same wrapper around the production CLI command and ends after CLI exit.

| Controlled fixture | Production PostToolUse command | Stop command through response and exit | Completion and host reaction |
| --- | ---: | ---: | --- |
| Ready before Stop (0 ms backend delay) | 637 ms | 261 ms | Finding completed before Stop, was submitted, and Luna changed the file in the same turn. The follow-up review completed clear. |
| Completes during Stop (4 s backend delay) | 601 ms | 2,418 ms | Finding completed during the wait, was submitted, and Luna changed the file in the same turn. |
| Beyond Stop deadline (12 s backend delay) | 625 ms | 4,254 ms | Stop returned quietly; `SessionEnd` followed 38 ms later. The finding completed 5,630 ms after `SessionEnd`; a post-session call to the production resident client collected and acknowledged it. No model reaction occurred after the session. |

All three direct edits were admitted and produced one initial synthetic finding each. One was ready at Stop entry; two were in flight. One of those completed during the wait and was delivered. The other remained pending through Stop and `SessionEnd`, then completed afterward. Two findings were submitted during the turn and independently followed by a same-turn file change; one was not visible to the model during that turn. The later post-session client read proves resident retention and collection, not later-turn model visibility. The three complete Stop commands took 261–4,254 ms, below the five-second command limit. Successful repairs triggered a second Stop with `stop_hook_active`; the continuation guard returned quietly in 21–29 ms. The production PostToolUse command took 601–637 ms on first edits, including process startup and resident admission; repair-hook calls took about 314–315 ms. This is measured command duration in the isolated profile, not a field latency distribution.

The [sanitized resident evidence](../evidence/delivery-97/codex-0.155.1-luna-max-resident-2026-09-25.json) records source-free admission, completion, Stop, and `SessionEnd` timestamps; command durations; outcome labels; continuation and repair flags; and post-session collectability. It retains no host transcript, prompt, source, recipient identifiers, credential, or model text. This is one root-agent fixture per timing case, not a population estimate or a concurrency test. The in-flight result remains available after the turn because the resident queue outlives the host session in this probe.

## Comparison and recommendation

Subsequent-hook collection has no delivery opportunity when a turn stops after the reviewed edit. Native background delivery worked when output finished early enough for another model safe point; later completion did not reach the model in the selected longer-delay cases. The bounded Stop prototype submitted findings that were ready at entry or completed during the wait. On the supported Linux profile, the real production resident and adapter completed this path under the five-second command ceiling, including process startup, IPC, response writing, and acknowledgement. A result that missed the ceiling remained collectable after `SessionEnd`.

Recommend specifying recipient-scoped bounded Stop collection for the next product contract, while retaining the current production delivery policy until that contract is accepted. Keep native background hooks as a separate candidate. The five-second ceiling was useful in these selected Linux cases, but does not establish an optimum or production default. The synchronous PostToolUse command measured 601–637 ms on initial edits, which should be weighed separately from turn-end latency. Before production adoption, validate the macOS 0.156.0 profile, response bounds and per-unit visibility for multiple findings, unavailable and failure outcomes through the production resident, stale revalidation, and concurrent recipients and subagents. The direct command clock begins at the compiled wrapper's `main` entry and excludes executable-loader startup. No live Jev latency or population rate was measured. No claim about Claude Code or OpenCode follows from this Codex result.
