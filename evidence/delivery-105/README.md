# Issue #105 Linux composed delivery probe

## Matched Codex and Claude outcome gate

The [new sanitized record](linux-matched-before-after.json) contains matched
before/after headless sessions on Linux arm64, Node 24.20.0, Codex CLI 0.155.1,
and Claude Code 2.1.218. The [runner](run-matched-linux.mjs) invokes each exact
host with temporary native hook settings and the production Hapsland CLI and
resident. Its controlled offline Effect `DecisionModel` completes an actionable
finding for the initial edit. The before sessions expose only the synchronous
edit hook. The after sessions run the shared background, Stop, and prompt
hook commands. The fixture holds the async background command so Stop can be
the last delivery opportunity in the headless turn. It asserts that neither
before session receives a finding or repairs the file, while both after
sessions receive a Stop block, make a second native edit, repair the file,
and complete a clear follow-up review. This is one matched pair per host, not a
population estimate. The early-background visibility edge remains open.

After removing the runtime activation flag, three consecutive full matched
attempts on the same exact Linux host and Node versions passed all four cases:
[attempt 1](linux-repeatability-1.json), [attempt 2](linux-repeatability-2.json),
and [attempt 3](linux-repeatability-3.json). Each before review completed before
host exit without handoff or repair; each after Stop response led to a second
native edit, repaired file, and clear follow-up review. These are three selected
controlled attempts, not a population reliability estimate. Earlier retained
misses remain relevant to the unresolved background opportunity and host
lifecycle gates.

The record contains only event kinds, counts, timing, and outcome flags. Raw
host output, source, credentials, and backend responses are not retained.
The [background opportunity record](linux-background-opportunities.json) adds
one selected early-completion run per host. Both native async hooks submitted a
finding. Claude then made a native repair edit and its follow-up review was clear;
Codex finished without repair. Claude's sanitized native tool sequence shows
`Write`, `Read`, then `Edit`; the Codex stream did not expose comparable tool
names in this probe. A separate [contended run](linux-background-opportunities-contended.json)
and [late Claude run](linux-claude-background-late-miss.json) also retain
submissions that did not lead to repair. Host submission alone did not establish
model visibility. The [Linux command timing record](linux-host-command-timing.json)
uses a ptrace wrapper to measure native hook child creation through exit,
including process startup. Tracing adds overhead. It also records Claude's
pending async command termination at headless teardown.
The [isolated installer record](linux-installed-registration.json) verifies
install, inspect, and scoped uninstall against both exact Linux host binaries
and the compiled Hapsland CLI. It makes no model or Jev request.
One traced Claude run repaired the file but did not record a completed clear
follow-up review within the probe window. That source-free
[missed-clear record](linux-host-command-timing-missed-clear.json) is retained
separately. Subsequent selected runs did record clear follow-ups; the cause of
the miss is not established, so it is an open reliability gate.
A [matched race record](linux-matched-race-miss.json) preserves a later Codex
after case in which background submitted a finding just before Stop, but no
repair followed. Its Claude after case passed. The fixture now holds the
background command longer for an isolated Stop opportunity; the missed
submission remains an unresolved composition outcome.
A later [post-review rerun](linux-matched-postreview-instability.json) passed
both Codex cases but failed Claude hook admission: the before edit command
timed out, and the after session did not record a mapped edit hook or backend
completion. This is retained as an exact-host reproducibility failure.
An alternate Claude [Read/Edit fixture](linux-claude-edit-fixture.json) reached
repair and clear review in its after case, but its before case had no edit hook
and no backend completion. Two further [before probes](linux-claude-explicit-settings-before.json)
and [recheck](linux-claude-explicit-settings-before-recheck.json) loaded the hook
explicitly, but the five-second edit command timed out. Neither is counted as a
passing before case; the original matched record remains the selected passing
pair, and repeatability remains open.
Run with exact binaries installed at the runner's default temporary paths or
set `HAPSLAND_105_CODEX` and `HAPSLAND_105_CLAUDE`. Set
`HAPSLAND_105_EVIDENCE_FILE` to write a new sanitized record. Set
`HAPSLAND_105_TRACE_LAUNCH=1` to collect launch-to-exit command windows.

The [sanitized record](linux-arm64-codex-0.155.1.json) contains seven selected
headless Codex sessions on Linux arm64, Codex CLI 0.155.1, and Node 24.20.0. The
[runner](run-linux.mjs) creates a temporary Git repository, Codex home, repository
consent state, and production resident for each case. The production Codex direct
edit adapter admits work, and the resident uses the controlled offline Effect
`DecisionModel`. The Hapsland CLI and resident are source-run from this checkout;
the Codex binary itself is the exact installed 0.155.1 release. A native async
`PostToolUse` command and a test-only Stop command
collect through the production resident client and its lease/acknowledgement path.
No Jev request is made. The fixture's native edit, background, and Stop commands
run under a Linux process tracer that measures command child creation through exit.

The runner copies host authentication into the temporary Codex home without reading
or printing it. It discards raw host JSONL, prompts, source, IPC payloads, backend
text, and temporary homes. The record retains only source-free event kinds, timing,
counts, fixed fixture filenames and outcome labels, and whether a distinctive
model repair and independently changed file were observed. The script checks the
exact CLI version before running. Run with:

```sh
HAPSLAND_DELIVERY_105_CODEX_BIN=/path/to/codex-0.155.1 \
  node evidence/delivery-105/run-linux.mjs
```

## Observations

| Controlled case | Observed first handoff and host behavior |
| --- | --- |
| `combined-background-ready` | Async background submitted one finding with no intervening edit. A later model message repaired the file. |
| `combined-stop-wins` | Stop collected one finding while the background command was active but held before collection; it blocked once and the model repaired. Reentered Stop was capped. The background command made no finding submission. This fixture does not prove simultaneous resident collection. |
| `combined-stop-during` | The result completed during Stop's wait; Stop submitted one finding, followed by model repair. |
| `combined-background-before-stop` | Despite the fixture name, Stop had already started when the background finding was submitted during its wait. The final model message had completed. Stop saw no remaining advice and no repair was observed before session end. The background write and resident acknowledgement did not prove model visibility. |
| `combined-timeout-retained` | Neither hook submitted a finding before session end. The result completed later and a post-session client collected and acknowledged it from the same resident. No model reaction was observed. |
| `combined-multi-unit` | One background response carried two findings and the model repaired both files. The static controlled map generated new findings on subsequent edits, causing two additional two-finding background responses; those are distinct review work, not a repeat of the first lease. |
| `combined-backend-unavailable` | The controlled backend failure left resident activity `unavailable`, generated a zero-finding informational background response, and produced no repair. No clean result was claimed. |

The initial production edit commands in these seven selected sessions took
548–877 ms from host command launch to exit. First Stop commands took 1,170–4,257
ms; every recorded Stop command exited below five seconds. Background commands
that submitted a finding took 683–4,640 ms from host launch to exit in this sample.
The case record preserves each command separately and shows completion and response
timestamps; it does not infer a population latency or repair rate. The tracer adds
overhead, and the artificial background hold in `combined-stop-wins` is solely a
controlled overlap fixture.

## Contract gaps exposed

At the time of the earlier seven-case probe, the resident client finalized
advice after a completed stdout write.
`combined-background-before-stop` demonstrates the resulting uncertainty: Stop
could not offer a final delivery opportunity for advice already submitted by the
background hook, while no independent model visibility occurred. The proposed
resident submitted/uncertain state in the [contract](../../docs/issue-105-composed-delivery.md)
was subsequently implemented in the candidate shared resident path. The
test-only Stop hook also waited about 4.2 seconds
when no finding can be collected, including after a clear or unavailable outcome;
the proposed production wait policy needs an explicit advicee work-state signal
to return promptly. The zero-finding failure notice was sent by background; the
prototype Stop path does not yet hand off such a notice.

These runs establish one exact Linux host subset only. They do not validate the
macOS arm64 / Codex CLI 0.156.0 profile, concurrent distinct host advicees,
shared-root unknown-origin attribution, stale handoff, lost acknowledgement,
simultaneous resident collection, pre-Stop unconsumed output, collector crash, or the complete background lifecycle around tool calls and
session end. Those seven cases predate the candidate installer registration.
