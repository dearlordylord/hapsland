# Native Linux background timing and lease contention

**Audience:** Contributors, including coding agents validating runtime behavior; Build and release maintainers; Product and specification owners.

Candidate: `294c3600af220179164e26ae5a385596506d12ed`.
Pinned runtimes: Codex CLI 0.155.1 and Claude Code 2.1.218.
The production resident and composed hooks use a controlled Effect reviewer;
these probes make no live Jev requests. Fixture source, credentials and raw
runtime/model output remain in scratch and are deleted. The retained records
contain timing, event types, marker booleans and hashed lease tokens.

## Observations

| Case | Codex | Claude |
| --- | --- | --- |
| Background submission followed by repair | Observed without a Stop block in the initial tool and final-response cases. | Observed without a Stop block in the initial tool case. |
| Review completion inside a native tool call | **Observed:** Bash PreToolUse 9.081 s, review completion 17.169 s, background submission 17.223 s, Bash PostToolUse 34.143 s. A native repair followed without a Stop block. | **Unproven:** three post-reset attempts still did not produce a successful actionable-finding/tool-window case; see `claude-reset-rerun-linux.md`. |
| Background output during a final response | Runtime exposes completed assistant items, so an in-progress final response or model request is not established. Background submission preceded a later repair. | Submission at 8.454 s occurred inside the native streamed message interval 8.404–30.478 s. Review completed at 8.352 s, just before that interval. Stop reoffered at 30.810 s; repair followed. This does not prove the earlier output was unseen. |
| Delayed backend work after the round closes | A 30-second injected review produced no completion, submission, repair or restart within the bounded observation. | Same observation. |
| Background and Stop collectors overlap | Stop began before review completion, acquired the only observed finding lease, submitted it and caused repair. Background did not acquire a finding lease. | Stop began before completion; background acquired and submitted a finding lease, then Stop acquired a **different** reoffer lease after background acknowledgment/finalization. Repair followed. |
| Concurrent background routing through one resident | Two native sessions in separate Git worktrees received only their own distinct background finding; both later received only their own Stop reoffer. | **Passed after runtime recovery:** both concurrent worktrees received only their own background finding and Stop reoffer; see `claude-reset-rerun-linux.md`. |

The race traces show overlapping collectors, followed by exclusive lease use
and, for Claude, intentional sequential reoffer. They do not demonstrate two
writers simultaneously owning one lease. No raw agent thought or visibility
signal is available: submission and subsequent repair are separate observations.

The initial nine instrumented PreToolUse commands had Linux ptrace launch-to-exit times of
294.16–356.35 ms, below the configured five-second deadline. These include
probe wrapper/IPC-observer overhead; they are not universal latency bounds.

The final Codex tool case repaired the file, but its ten-second follow-up review
did not clear before Stop cleanup. Its `clearFollowUp` is therefore false.
An earlier eighteen-second delay exercised the existing review timeout and
produced an unavailable outcome, not a late actionable finding. Both outcomes
remain in the records.

## Limits and failed attempts

- No direct model-provider request timing is instrumented. Native stream/tool
  events support only the intervals explicitly stated above.
- After-end cases observe for two seconds after native process exit. They
  establish no late output in that window; arbitrary delayed external responses
  and cancellation guarantees are covered by the separate deterministic round
  contract probe, not inferred from this native observation.
- The initial Codex immediate-finish race attempt made no edit and was
  inconclusive. Its single targeted repeat exercised the race successfully.
- The final Claude tool attempt and the retained Claude background pair exited
  1, each after a successful UserPromptSubmit hook but before any edit,
  PreToolUse/PostToolUse or Stop observation. A separate minimal headless
  invocation also exited 1 with a structured `is_error: true` result. The cause
  is **not established**; no authentication, quota or product-failure cause is
  inferred.
  Follow-up: `claude-runtime-diagnosis.md` records the same failure with all
  user/project/local settings excluded and no custom Hapsland hooks. The
  minimal diagnostics returned limit/reset information; no quota/account
  cause or guaranteed recovery time is established. No product retry followed.
- The session attempted 15 timing cases, four background-isolation pairs
  (two per runtime), and one minimal Claude diagnostic. The first two-pair
  isolation run reached a scratch cleanup race (`ENOTEMPTY`) and did not retain
  its report; bounded cleanup retries fixed the harness. The second run is
  retained. Every native process had a 100-second ceiling; the diagnostic had
  a 15-second ceiling. No retained case timed out.

## Evidence and reruns

Timing records:

- `linux-native-background-timing-initial-tools.json`: two initial cases.
- `linux-native-background-timing-initial-remaining.json`: six final-response,
  after-end and immediate-finish cases.
- `linux-native-background-timing-targeted-repeat.json`: five targeted repeats,
  including the successful Codex contention case and PreToolUse tracing.
- `linux-native-background-timing-final-tools.json`: final two tool cases and
  the sanitized minimal Claude diagnostic.
- `linux-native-isolation-codex-background-worktrees-claude-background-worktrees.json`:
  retained concurrent background routing run.

Run timing cases explicitly, for example:

```sh
HAPSLAND_105_EVIDENCE_FILE=/tmp/background-timing.json \
  node evidence/advicing-linux/run-native-background-timing-linux.mjs codex-tool claude-tool
```

Other case names end in `-final`, `-after-end` or `-race`. The current tool case
uses a ten-second review delay and requests a foreground shell wait. Native
agent tool choice can vary; the report records actual events without assuming
that the requested interval occurred. `command-trace-background-wrapper.c`
adds PreToolUse identification to the existing Linux command tracer.

Run concurrent background routing with:

```sh
node evidence/advicing-linux/run-native-isolation-linux.mjs \
  codex-background-worktrees claude-background-worktrees
```

The IPC observer records collection responses and submission boundaries. It
never retains request bodies or response/advice content. Repeated identical
records may be compressed into `at`, `lastAt`, and `count`.

## Post-reset follow-up

`claude-reset-rerun-linux.md` retains the successful minimal control, the
passing concurrent background-isolation pair, and all three tool-window
attempts. Runtime availability recovered; the actionable tool-window case
remains unproven. One attempt hit the timeout and returned after its signal
ceiling; the follow-up records that overrun and the probe cleanup fix.
