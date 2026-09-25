# Issue #105 Linux composed delivery probe

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
| `combined-stop-wins` | Stop collected one finding while the background waiter was active; it blocked once and the model repaired. Reentered Stop was capped. The waiter made no competing finding submission. |
| `combined-stop-during` | The result completed during Stop's wait; Stop submitted one finding, followed by model repair. |
| `combined-background-before-stop` | The final model message completed before the background finding was submitted during Stop's wait. Stop saw no remaining advice. No repair was observed before session end. The background write and resident acknowledgement did not prove model visibility. |
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

The current resident client finalizes advice after a completed stdout write.
`combined-background-before-stop` demonstrates the resulting uncertainty: Stop
could not offer a final delivery opportunity for advice already submitted by the
background hook, while no independent model visibility occurred. The proposed
resident submitted/uncertain state in the [contract](../../docs/issue-105-composed-delivery.md)
is therefore still required. The test-only Stop hook also waits about 4.2 seconds
when no finding can be collected, including after a clear or unavailable outcome;
the proposed production wait policy needs an explicit recipient work-state signal
to return promptly. The zero-finding failure notice was sent by background; the
prototype Stop path does not yet hand off such a notice.

These runs establish one exact Linux host subset only. They do not validate the
macOS arm64 / Codex CLI 0.156.0 profile, concurrent distinct host recipients,
shared-root unknown-origin attribution, stale handoff, lost acknowledgement,
collector crash, or the complete background lifecycle around tool calls and
session end. The proposed hooks remain unregistered in the product.
