# Research: Codex hook and product process lifetime

**Checked:** 2026-09-20
**Scope:** pinned `@openai/codex` / `codex-cli 0.155.1`, Linux arm64, with the
repository's existing headless hook evidence.  This report does not research model
providers and does not select a product deployment architecture.

## Bottom line

There are two different process lifetimes, and they must not be conflated:

```text
Codex host process / session
  ├─ event 1: command-hook child process A (one JSON input, one output)
  ├─ event 2: command-hook child process B (new process)
  └─ event 3: command-hook child process C (new process)
```

For a configured `type: "command"` hook, the pinned Codex implementation spawns a
fresh operating-system child for each matching handler invocation.  The child is
waited on (or tracked as a background task), and there is no command-hook protocol
that keeps one child alive to receive later event payloads.  This is
**SOURCE-INSPECTED** at the exact `rust-v0.155.1` source, not merely an inference
from the repository's probes.

The Codex host itself has a different lifetime.  A headless `codex exec` invocation
is one host process that handles the events for that invocation and then exits.  An
interactive TUI session remains alive across its event sequence.  Codex also has an
app-server mode, including a managed daemon mode, where a server process can accept
multiple client connections/threads.  Those are host launch modes; they do not make
a normal command hook resident.

Therefore, a product process invoked directly as a command hook is normally
one-shot.  A product process can be resident only through an additional architecture,
such as a daemon reached by one-shot hook clients or an already-connected MCP server.
The standard command-hook boundary does not provide that residency itself.

## Evidence classes

- **DOCUMENTED:** official Codex documentation. The hooks page is a living page and
  is not a version lock; where exact 0.155.1 mechanics matter, the pinned source is
  authoritative for this report.
- **SOURCE-INSPECTED:** the annotated `rust-v0.155.1` source, resolving to commit
  `be2951ea34f0d295ed0becf97079f92fa5f6950e`.
- **RUNTIME-OBSERVED:** the repository's retained sanitized Linux arm64/headless
  `codex-cli 0.155.1` probes.
- **INFERRED:** a product or architecture consequence derived from the evidence;
  it is not a Codex promise.

## What the pinned command-hook runtime does

### A fresh child is created for every command-hook invocation

The exact pinned [`command_runner.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/command_runner.rs#L206-L265)
builds the configured command and calls `tokio::process::Command::spawn()` inside
`run_command`.  The function receives one `input_json` value for that invocation,
sets stdin/stdout/stderr, and records the spawned child's process ID for cleanup.
This is **SOURCE-INSPECTED** evidence for fresh child creation.

The same function writes the JSON payload once and waits for the child output under
the configured timeout ([`command_runner.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/command_runner.rs#L267-L335)).
The command-hook child is therefore request-shaped: one event payload in, one
completion result out.  A command that intentionally stays open does not become a
server; it holds the current synchronous hook open until completion or timeout.

The pinned dispatcher calls `execute_handler` for each synchronous command handler
and routes each command handler through `run_command`; asynchronous handlers are
scheduled separately but still call the same command runner
([`dispatcher.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/dispatcher.rs#L101-L150),
[`command_runner.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/command_runner.rs#L108-L177)).

### Synchronous and asynchronous change waiting, not process reuse

The official hooks documentation says that matching command hooks are launched
concurrently and that the default is to wait for a command hook before continuing.
Setting `async` moves the command into the background; it does not turn it into a
resident listener.  The same documentation says each matching background invocation
runs independently, up to eight run concurrently per session, and unfinished
background hooks are cancelled when the session ends:

- [Hooks runtime behavior](https://developers.openai.com/codex/hooks#hooks)
- [Background hooks](https://developers.openai.com/codex/hooks#run-hooks-in-the-background)

The pinned source matches that description. `CommandHookRuntime` owns a `JoinSet`
and a semaphore that bounds concurrent background execution, while each task invokes
`run_command`; [`command_runner.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/command_runner.rs#L48-L60)
and [`command_runner.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/command_runner.rs#L164-L188).
`shutdown` aborts and joins outstanding background tasks.  The process that remains
resident here is Codex's in-process hook runtime, not the external product command.

### The hook runtime itself belongs to a host session

The pinned registry creates a `Hooks` value and a `CommandHookRuntime` for a session
and exposes `reconfigured` and `shutdown` on that runtime
([`registry.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/registry.rs#L59-L100),
[`registry.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/registry.rs#L152-L155)).
That host-side object can therefore retain in-memory task state with bounded concurrency while one
Codex session is alive.  This does not imply that state is shared by separate
`codex exec` invocations, separate host sessions, or separate command-hook children.

### Other hook handler kinds are different

The command-child conclusion applies to `type: "command"`.  The official docs also
describe `type: "mcp_tool"`: it calls a tool on an **already-connected** MCP server;
the hook does not start or reconnect that server.  This gives a possible resident
product server, but its lifetime is the MCP connection/server's responsibility, not
the command-hook process's:

- [MCP tool hooks](https://developers.openai.com/codex/hooks#mcp-tool-hooks),
  especially the execution/lifecycle notes.

At the pinned 0.155.1 boundary, `prompt` and `agent` handlers are not a demonstrated
product in-process extension point.  The current official page says those handler
types are parsed but skipped.  The pinned source makes the same distinction:
`ConfiguredHandlerKind` contains only `Command` and `McpTool`, while discovery
records prompt/agent handlers as unsupported
([`engine/mod.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/mod.rs#L115-L150),
[`discovery.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/discovery.rs#L582-L649)).
This report does not treat them as an available resident option.

## Host-process lifetime and headless evidence

### Headless `codex exec`

The retained issue-4 runner directly invokes one `codex exec --ephemeral --json` process per
synthetic case and records that tested host process's completion.  Within a successful case
the observed sequence was `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`,
and `SessionEnd`; the automatic-continuation case delivered three `Stop` attempts
inside one headless run.  The retained ledger reports 69/69 assertions passing:

- [`evidence/codex/0.155.1/README.md`](./evidence/codex/0.155.1/README.md), lines
  21–54;
- [`issue-4-lifecycle-2026-09-20.json`](./evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json);
- runner spawn and completion logic in
  [`issue-4-lifecycle.mjs`](./evidence/codex/0.155.1/probe/issue-4-lifecycle.mjs).

This is **RUNTIME-OBSERVED** evidence that a headless invocation can deliver
multiple lifecycle events during one host run.  The retained probe did not record
the PID of each command-hook child, so it is not by itself a PID-level experiment.
The exact pinned source above supplies that missing process-lifetime fact.

`--ephemeral` in the retained command controls Codex session persistence; it does
not change the command-hook runner into a persistent server.  This distinction is
important when interpreting the probe.

### Interactive TUI

The retained interactive probe saw the product hook execute after an edit and its
advice arrive before the next action in the same session
([`evidence/codex/0.155.1/README.md`](./evidence/codex/0.155.1/README.md), lines
69–80).  This is **RUNTIME-OBSERVED** evidence for a multi-event interactive host
session, not evidence that the external hook process was reused.

### App-server and managed daemon

Codex has a separate long-lived host mode.  The official [app-server documentation](https://developers.openai.com/codex/app-server)
describes JSON-RPC over stdio, Unix sockets, or WebSockets, and says that every
thread in one app-server process shares its selected Code Mode host.  The pinned
CLI also exposes `codex app-server daemon start|restart|stop` in the local
`codex-cli 0.155.1 --help` output.  The cited exact pinned app-server call sites
configure a Unix listener and await a long-running transport/processor path, with a
managed-daemon flag ([`app-server/src/lib.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/app-server/src/lib.rs#L754-L800),
[`app-server/src/lib.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/app-server/src/lib.rs#L1017-L1088)).

This proves a resident **Codex host** option exists.  It does not prove that the
ordinary headless hook installation uses the app-server daemon, nor does it expose
an API for loading the product directly into Codex's process.  The product must not
assume app-server residency unless that launch mode is explicitly part of its
supported host contract.

## What the repository previously knew versus assumed

| Existing material | Claim or behavior | Classification before this report |
|---|---|---|
| [`CODEX-ADAPTER-CONTRACT-v1.md`](./CODEX-ADAPTER-CONTRACT-v1.md), lines 94–97 | Says duplicate advice is suppressed “across short-lived hook processes” with an atomic temporary marker. | **INFERRED/product design.** It names the expected process boundary but does not cite pinned Codex process source. The marker is a product persistence choice, not proof of a Codex hook PID model. |
| [`PRODUCT-RESEARCH-ADVISORY-2026-09-20-SHELL-WRITE-DETECTION.md`](./PRODUCT-RESEARCH-ADVISORY-2026-09-20-SHELL-WRITE-DETECTION.md), lines 263–270 | Treats a short-lived hook as unable to observe between invocations without a daemon; leaves persistent watchers optional and deferred. | **INFERRED/advisory.** This was directionally correct for a one-shot command hook, but it was not a focused host-process investigation. |
| Same advisory, lifecycle limitations and future-work tables | Records that restart/resume, process locks, hook PIDs, and cross-process races were not exercised by the retained issue-4 probe. | **RUNTIME-OBSERVED limitation.** The repository explicitly did not claim those facts from the earlier probe. |
| [`evidence/codex/0.155.1/README.md`](./evidence/codex/0.155.1/README.md), lines 29–54 | Demonstrates headless event order and host-process completion for bounded cases. | **RUNTIME-OBSERVED**, but not PID-level child-process evidence. |
| Issue [#3](https://github.com/dearlordylord/jevs/issues/3) implementation decisions/out-of-scope text | Excludes a daemon, persistent review queue, and async cadence from that phase. | **Product scope decision**, not evidence about how Codex launches hooks. |
| [`experiments/shell-write-detection`](./experiments/shell-write-detection) restart scenarios | Tests a product-owned source-free manifest store across reconstructed instances. | **Product prototype evidence only.** It does not establish Codex process lifetime or authorize persisted checkpoint state. |

The new pinned-source finding closes the narrow factual gap: standard command hooks
are fresh children per matching invocation.  It does **not** answer which host launch
mode the product should support, and it does not decide whether the product should
be one-shot or daemon-backed.

## Product consequences (inferred)

If the product is installed as a normal synchronous or asynchronous command hook:

- one event can share memory across all files/semantic work discovered within that
  invocation;
- a later event normally reaches a new product process, so in-memory queues, caches,
  and in-flight registries do not survive the earlier hook process;
- multiple matching command hooks can run concurrently, so separate product children
  can race over any shared external state;
- a hook child that waits for later events would block or time out; it is not a
  supported resident listener;
- cross-event deduplication therefore requires either source-free persistence,
  another resident process, or accepting duplicate work after each process boundary.

These are **INFERRED** product consequences.  They do not mean that every host
invocation is a separate process: an interactive Codex session or app-server can
remain alive while still spawning a new command child for each matching event.

## Architectural options still open

No option is selected here.

| Option | Process shape | What it would make possible | Cost / unresolved questions |
|---|---|---|---|
| One-shot command-hook CLI | Codex host → fresh product child per event | Simplest installation and failure isolation; per-event in-memory queues/cache. | No cross-event memory. Decide whether duplicate work is acceptable or which source-free metadata is durable. Startup latency repeats. |
| One-shot hook client + resident product daemon | Codex host → short-lived client → local IPC → resident product process | In-memory queue/cache and in-flight joining can span hook events and host turns without copying source into durable state. | Daemon startup/ownership, stale socket/lock handling, crash loss, authorization, idle shutdown, multi-worktree identity, and delivery semantics require specification. |
| MCP tool hook + resident MCP server | Codex hook runtime → existing MCP connection → MCP server process | A connected server can own long-lived queues/cache and receive multiple tool calls. | Codex docs say hooks do not start/reconnect the MCP server; exact 0.155.1 headless connection/startup behavior needs a focused conformance probe. Deployment and trust differ from command hooks. |
| App-server-integrated host mode | Product talks to or is hosted alongside a resident Codex app-server | Multiple threads/connections can share a resident host process. | No evidence of a supported product in-process hook/plugin API. The CLI labels the app-server command experimental and the official docs specifically mark its WebSocket transport experimental; standard command hooks remain child processes. |

## Decision gate before checkpoint persistence

The immediate question is no longer “does Codex keep command-hook children alive?”
The pinned answer is no.  The decision gate is:

1. Which Codex launch modes are in the supported product envelope: headless
   `codex exec`, interactive TUI, app-server/managed daemon, or MCP-backed use?
2. Is the product itself one-shot, or is a resident daemon/MCP server part of the
   product installation?
3. If one-shot, do we accept duplicate work and lost in-memory state across hook
   invocations, or do we retain only the minimum source-free metadata needed for
   cross-process dedupe/checkpoint comparison?

Until those are answered, choosing a persisted checkpoint lifetime would be premature.
The process-lifetime evidence supports all three product options above but selects
none of them.

## Sources and reproducibility

Primary sources used:

1. Pinned `@openai/codex@0.155.1` package metadata and local binary:
   `/usr/local/share/npm-global/lib/node_modules/@openai/codex/package.json`,
   `/usr/local/share/npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/codex-package.json`,
   and `codex --version` → `codex-cli 0.155.1`.
2. OpenAI Codex annotated source tag `rust-v0.155.1`, tag object
   `4e21628f9ec9ee656650cd2b62ef92225725b5ac`, resolving to commit
   `be2951ea34f0d295ed0becf97079f92fa5f6950e`; links are attached above.
3. Official [Codex hooks documentation](https://developers.openai.com/codex/hooks)
   and [Codex app-server documentation](https://developers.openai.com/codex/app-server),
   inspected 2026-09-20.  These pages are living documentation, so exact release
   conformance remains a pinned-source/runtime responsibility.
4. Retained sanitized local evidence under
   [`evidence/codex/0.155.1`](./evidence/codex/0.155.1/README.md).  No credentials,
   transcripts, raw hook output, source-bearing paid responses, or new persistent
   source copy was created for this report.
