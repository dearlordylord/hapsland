# Issue #94: offline cold-hook timing investigation

Status: product timing decision needed before authenticated Stage A. This report records two bounded **offline scripted Claude controls** on 2026-09-24. Neither invoked an authenticated host, Jev, or a model. The bridge kept its 4,400 ms inner CLI ceiling and the fixture kept Claude's five-second native hook setting.

## Clock and method

[`run-cold-hook-timing.mjs`](../evidence/host-94/validation/run-cold-hook-timing.mjs) runs exactly one named control test per invocation, using a fresh disposable repository and resident. A Node preload records wall-clock `Date.now()` at bridge and compiled CLI process entry, resident launch and entry, source-free IPC operation/status boundaries, activity stage labels, and process exit. The report's times are milliseconds relative to bridge preload; the runner's admission-marker and controlled-outcome file modification times are converted to that origin. The preload discards IPC payloads and activity-marker contents after extracting fixed operation/status/stage labels. The temporary raw timing log is deleted. The harness output retains no paths, identifiers, credentials, source, or model text.

This clock has millisecond granularity and includes scheduler delay. Bridge preload precedes the bridge's `spawnSync` call; compiled CLI preload precedes its module imports. `first-read` is the first exported `fs.readSync` call, **not** proof that module loading or CLI setup is complete. Resident readiness is the first successful `hello` response. The admission marker is global and does not prove call identity by itself; the scripted fixture independently matched one native call to its hook. Controlled review completion is the resident's `clear` activity stage and controlled outcome-file timestamp. IPC `collect: empty` means no advice was handed off; the current protocol does not distinguish pending review from completed clear. The Node preload adds some startup, filesystem, and socket-listener overhead, so these are path measurements rather than an uninstrumented performance distribution.

The disposable timing wrapper now owns a fixed session root and terminates its test process group on its 90-second outer deadline. After test exit it uses Linux `/proc` command and process-group checks to terminate the logged runner group and any detached resident tied to that root before deleting the fixture. A focused offline test covers a stuck group plus detached resident. If process ownership cannot be verified or descendants remain, the wrapper retains the temporary fixture and reports its location for inspection. This is bounded best-effort cleanup on Linux; it cannot guarantee cleanup if the wrapper itself is forcibly killed or `/proc` is unavailable. No cold-control probe was rerun to validate this cleanup change.

## Observations

Both probes ran with a fresh resident under the same fixed timeouts. The host is a shared 12-CPU machine; load averages before and after were 2.42→2.31 and 2.90→2.82 for the one-minute window. No dedicated load generator ran. This is a selected shared-machine context, not a controlled load distribution.

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

## Decision and next step

The compiled-artifact fixture correction was necessary to match the installed package, but it is insufficient. A fixture-only early return after reading the controlled outcome file would bypass the production CLI/resident contract and would not validate installed behavior. Prewarming the resident could reduce cold startup but would not address the observed completed-clear polling path or establish a cold first-hook guarantee. These observations support a **product-owned timing change proposal for review**: make the resident's collection contract expose an authoritative terminal no-advice state for the current recipient and admitted work, then have the synchronous Claude/OpenCode hook return immediately on that state. The state must distinguish completed clear from pending, unavailable, stale, and a collection race; it must preserve recipient/lifetime ownership and avoid dropping a finding that becomes ready concurrently. Keep the existing 4,400 ms bridge and five-second host ceilings while evaluating that design.

Before any authenticated Stage A, specify the terminal-state semantics, implement them in a separate product change with deterministic resident/client tests, and rerun one bounded cold offline control against the installed compiled path. The timing probe does not establish model reaction, real-host hook launch latency, or behavior under higher load. No product behavior change is made by this investigation.
