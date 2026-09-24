# Issue #94: offline cold-hook timing investigation

Status: the Stage A timing prerequisite passed for the selected offline ticketed terminal-clear fixture on 2026-09-24. This does not constitute real-model acceptance or authorize an authenticated host run. The report retains two earlier bounded **offline scripted Claude controls** that failed, followed by one passing post-implementation control. No authenticated host, Jev, or model was invoked; the bridge kept its 4,400 ms ceiling and the fixture kept Claude's five-second native hook setting.

## Clock and method

[`run-cold-hook-timing.mjs`](../evidence/host-94/validation/run-cold-hook-timing.mjs) runs exactly one named control test per invocation, using a fresh disposable repository and resident. A Node preload records wall-clock `Date.now()` at bridge and compiled CLI process entry, resident launch and entry, source-free IPC operation/status boundaries, activity stage labels, and process exit. The report's times are milliseconds relative to bridge preload; the runner's admission-marker and controlled-outcome file modification times are converted to that origin. The preload discards IPC payloads and activity-marker contents after extracting fixed operation/status/stage labels. The temporary raw timing log is deleted. The harness output retains no paths, identifiers, credentials, source, or model text.

This clock has millisecond granularity and includes scheduler delay. Bridge preload precedes the bridge's `spawnSync` call; compiled CLI preload precedes its module imports. `first-read` is the first exported `fs.readSync` call, **not** proof that module loading or CLI setup is complete. Resident readiness is the first successful `hello` response. The first two probes used the earlier un-ticketed path: their global admission marker did not prove call identity, and `collect: empty` did not distinguish pending review from completed clear. The scripted fixture independently matched one native call to its hook. Controlled completion was identified from the resident `clear` activity stage and controlled outcome-file timestamp. The post-implementation v2 probe instead records a fixed accepted-ticket status and ticketed `pending`/`clear` collection statuses; see its [sanitized result](../evidence/host-94/validation/terminal-clear-cold-result.json). The Node preload adds startup, filesystem, and socket-listener overhead, so these are path measurements rather than an uninstrumented performance distribution.

The disposable timing wrapper owns a fixed session root and terminates its test process group on its 90-second outer deadline. After test exit it uses Linux `/proc` command and process-group checks to terminate the logged runner group and any detached resident tied to that root before deleting the fixture. A focused offline test covers a stuck group plus detached resident. If process ownership cannot be verified or descendants remain, the wrapper retains the temporary fixture and reports its location for inspection. This is bounded best-effort cleanup on Linux; it cannot guarantee cleanup if the wrapper itself is forcibly killed or `/proc` is unavailable. The passing run's cleanup report found no remaining resident or owned process group.

## Observations

The two pre-change probes ran with a fresh resident under the same fixed timeouts. The host is a shared 12-CPU machine; their load averages before and after were 2.42→2.31 and 2.90→2.82 for the one-minute window. No dedicated load generator ran. These remain selected shared-machine observations, not a controlled load distribution.

| Boundary, relative to bridge preload | Probe 1 | Probe 2 |
| --- | ---: | ---: |
| Compiled CLI preload | 59 ms | 69 ms |
| CLI requests resident spawn | 1,510 ms | 933 ms |
| Resident preload | 1,586 ms | 1,138 ms |
| First resident `hello: ready` | 2,362 ms | 1,729 ms |
| `admit: accepted` response | 2,411 ms | 1,755 ms |
| Controlled `clear` stage / outcome file | not observed / absent | 1,857 / 1,872 ms |
| First collection request | 2,437 ms | 1,771 ms |
| Last collection response | 4,386 ms, `empty` | 4,397 ms, `empty` |
| Collection requests | at least 30 | 47 |
| Bridge inner CLI wait | 4,440 ms | 4,416 ms |
| Bridge return relative to preload | approximately 4,463 ms | 4,440 ms |
| Control acceptance | incomplete | incomplete |

The first probe accepted admission but did not show review completion before the bridge deadline. Its absence of completion cannot identify which resident stage consumed the remaining time. The second probe shows a different, concrete failure path: review completed clear roughly 2.6 seconds before the bridge returned, yet collection continued to return `empty` until the bridge terminated the inner CLI. The scripted native call and hook key matched, but the hook could not finish successfully; the control acceptance gate stayed incomplete. An earlier **uninstrumented** compiled-CLI control also hit 4,435 ms with admission observed and no successful hook, as recorded in the [next-pass proposal](issue-94-next-pass-proposal.md).

## Selected ticketed terminal-clear control

After the v2 implementation and build, the authorized one-shot offline control passed. The exact command, acceptance facts, timing, and cleanup result are retained in the [sanitized evidence record](../evidence/host-94/validation/terminal-clear-cold-result.json). It used a fresh disposable repository and resident plus a scripted Claude stand-in. One matching native edit completed its initial hook; the resident returned one accepted v2 ticket, the controlled review completed clear, and ticketed collection ended with `clear` after three responses. There were zero host submissions and no repair.

The bridge-observed CLI invocation was 816 ms against its 4,400 ms ceiling. Native event to hook finish was 845 ms against the fixture's five-second ceiling. The 3,900 ms CLI deadline remained unchanged. The bridge-observed duration is not compared with the CLI's separate internal deadline clock, so this run does not record an independent CLI-deadline timing assertion. This one selected instrumented offline result passes the cold timing prerequisite for the proposed Stage A gate; it is not a latency distribution, general guarantee, real-host acceptance result, or authorization to run an authenticated host.

## Decision and next step

The earlier observations supported the **product-owned timing change proposal** in [the terminal-collection proposal](issue-94-terminal-collection-proposal.md). The ticketed terminal-clear path has since been implemented, built, and passed the selected offline cold control above. This closes the selected offline timing prerequisite; a separate owner decision is still required before any authenticated Stage A host sessions. The result does not establish real-host launch behavior, model reaction, or behavior under higher load.

No product behavior change is made by this investigation.
