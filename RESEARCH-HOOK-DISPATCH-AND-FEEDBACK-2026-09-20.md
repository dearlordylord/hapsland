# Research: hook dispatch, batch boundaries, and feedback delivery

**Checked:** 2026-09-20 (America/Montreal)

**Scope:** How bursts of tool events reach hook handlers and how feedback can reach
Claude Code and pinned Codex (codex-cli 0.155.1). This pass checks one host session,
parallel tools, multiple agents, asynchronous work, Stop/session-end behavior, and a
product-owned resident worker started from SessionStart or a later hook. It reuses the
existing Abide report and resident-MCP probe.

**Disposition:** research only. This report does not select one-shot workers, a
resident daemon, MCP, SQLite, or any other product architecture.

The current product behavior is already settled for this pass: ordinary edits should
receive the earliest supported coherent feedback, with bounded turn-end collection.
This report does not reopen that target. It only records which host dispatch points can
provide it and what work may be lost at process or session boundaries.

## Research brief

The question is whether an incoming burst has a host-defined batch/worker ownership
model that the product can rely on.

1. Does one Write/Edit/apply_patch call produce one hook invocation, one invocation
   per changed file, or a host-level batch?
2. Do parallel tool calls invoke the same handler concurrently, serialize through one
   process, or use a host-provided resident worker?
3. Can an invocation drain all pending work before it exits, and what work is lost or
   delivered when the host continues, goes idle, is cancelled, or exits?
4. Can a later hook call find an earlier worker without product-owned IPC or durable
   state?
5. How do Claude Code and Codex identify main sessions and subagents, and which
   identity fields must product state preserve?

The existing solution is the baseline: Abide's source-inspected process-per-hook and
rule-batching behavior is compared with host-native dispatch surfaces. Source claims
and documentation claims are kept separate from retained runtime evidence.

## Evidence model and prior material

The repository methodology requires separate source class and verification state:

- DOC/DOCUMENTED: current official host documentation. This establishes the host's
  stated contract, not independent runtime behavior.
- SRC/SOURCE-INSPECTED: pinned host source or first-party plugin source inspected at
  an immutable revision.
- RUN/RUNTIME-TESTED: a retained reproducible result from an earlier pass. No new
  paid backend or host installation was used here.
- INFERRED: a product consequence derived from the evidence and its assumptions.
- UNKNOWN: the question remains open and a resolving probe is named.

The pinned Codex child-process findings are in [Codex hook process lifetime research](https://github.com/dearlordylord/jevs/blob/a3c72f1/RESEARCH-CODEX-HOOK-PROCESS-LIFETIME-2026-09-20.md).
The retained resident-MCP evidence is in the [resident MCP-hook lifetime verdict](https://github.com/dearlordylord/jevs/blob/055df19/experiments/resident-mcp-lifetime/VERDICT.md).
The previous Abide pass is [Abide research](https://github.com/dearlordylord/jevs/blob/cba2ace/RESEARCH-ABIDE-2026-09-19.md), especially claims A03, A05, A06, A07, A08, A14, and A20.

## Findings

### 1. There is no host-level “latest worker owns the burst” guarantee

The two target hosts expose different batch boundaries, but neither host promises
that later events are routed to the process that handled the earlier event.

| Host surface | Event cardinality and concurrency | Batch boundary | Worker/lifetime fact | Verification |
| --- | --- | --- | --- | --- |
| Codex PostToolUse/Stop command hooks | One command child is spawned for each matching command-handler invocation. Matching hooks may launch concurrently. | The hook receives one event payload. A single apply_patch tool call is one host event even if its command edits several files; whether a particular multi-file patch is split before the hook is UNKNOWN. | The child is request-shaped: one JSON input and one result. A later event is not delivered to that child. | SRC/SOURCE-INSPECTED; DOC/DOCUMENTED |
| Codex background command hooks | Each matching invocation is independent; up to eight background hooks run at once per session, later work waits, and completion can be out of order. | No native full-tool-batch callback was found in the pinned hook surface. | At session end, unfinished background hooks are cancelled and undelivered output is discarded. | DOC/DOCUMENTED; pinned source corroborates the child runner |
| Claude Code PostToolUse | Fires once per tool call. When Claude makes parallel calls, matching PostToolUse hooks fire concurrently. | One tool call is the per-call payload. A MultiEdit input can contain multiple edit entries, but the docs do not promise one hook per file. | All matching handlers run in parallel. For async: true, every execution creates a separate background process; no deduplication is provided. | DOC/DOCUMENTED; SRC/SOURCE-INSPECTED for a first-party plugin's handling |
| Claude Code PostToolBatch | Fires once after every call in a host batch resolves, before the next model call. | The tool_calls array is the complete batch; it includes each tool call's serialized result. | This is the closest host-native “review the burst once” boundary. It is not a general resident worker. | DOC/DOCUMENTED |
| Abide | Its Claude/Codex adapters are command-hook invocations. Within one invocation, active rules sharing the same file set are grouped and evaluated concurrently; no cross-event worker reuse or duplicate-call coalescing was found. | Edit checks normally operate on one changed file/diff; turn/Stop checks can carry multiple files. | State files and Git snapshots provide continuity; a later hook is a fresh worker that reads prior state. | SRC/SOURCE-INSPECTED in prior Abide pass |

The important distinction is between a host batch and a product queue. A batch is the
set of events the host gives one callback. A queue is product-owned state that can be
claimed by another invocation. The first does not imply the second.

An invocation may drain all currently claimable work before it returns. That is a valid
product policy, subject to the host's synchronous timeout or the host's cancellation
rules. It does not mean the latest-started invocation will own the backlog: concurrent
invocations can race, and the host permits out-of-order completion. The worker that
claims an item owns that item; start time is not an ownership protocol.

The current product constraint is that work and advice queues are bounded and
in-memory. Queue-full is explicit; ordinary operation must not silently drop work.
Queued, running, cached, or undelivered items may be lost on restart, and source-free
reconciliation does not regenerate them. This is an accepted lifecycle bound for the
current target, not an unresolved SQLite or durable-queue requirement.

### 2. Codex: fresh command children, bounded background callbacks, resident MCP only through the host connection

The pinned rust-v0.155.1 source creates a fresh operating-system child inside the
command runner for each command hook invocation, writes one input JSON value, and
waits for one result. The exact source and line references are retained in the
[pinned process-lifetime report](https://github.com/dearlordylord/jevs/blob/a3c72f1/RESEARCH-CODEX-HOOK-PROCESS-LIFETIME-2026-09-20.md#what-the-pinned-command-hook-runtime-does).
This is SRC/SOURCE-INSPECTED, not an inference from process IDs.

The current official [Codex hooks documentation](https://developers.openai.com/codex/hooks)
says matching command hooks run concurrently. The async option changes whether Codex
waits for the command; it does not make the command a listener. The same page
documents a maximum of eight concurrent background hooks per session, independent
invocations that may complete out of order, and cancellation/discard of unfinished
background output when the session ends. This is DOC/DOCUMENTED and is the host
contract to target until a pinned runtime probe says otherwise.

For synchronous PostToolUse, feedback can still affect the model after the tool has
completed: it can add context or replace the model-facing result. For an asynchronous
hook, Codex makes informational output available at the next safe model request in an
active turn, or at the next user turn if idle; finishing the hook does not start a turn.
SessionEnd is synchronous but advisory, and its output cannot keep the thread open.
These are DOC/DOCUMENTED facts from the [background hook section](https://developers.openai.com/codex/hooks#run-hooks-in-the-background)
and [SessionEnd section](https://developers.openai.com/codex/hooks#sessionend).

The retained resident-MCP probe adds bounded runtime evidence:

- one already-connected stdio MCP server received apply_patch, Bash, and repeated Stop
  callbacks in one headless Codex invocation;
- startup events can arrive before the server is ready and are not replayed;
- a server timeout lets the host progress while server work can finish later;
- MCP errors are fail-open in the fixture;
- later hooks do not relaunch a deliberately crashed server; and
- no MCP SessionEnd callback was delivered.

This is RUN/RUNTIME-TESTED retained evidence, not a guarantee about all MCP transports
or all launch modes. The probe did not test concurrent sessions, multiple worktrees,
Write/Edit aliases, or multi-file patch cardinality.

Codex's mcp_tool hook supplies a resident transport only when the host already has an
MCP connection. The [official MCP hook documentation](https://developers.openai.com/codex/hooks#mcp-tool-hooks)
says hooks do not start or reconnect that server. A product that wants lazy
ensure-running and restart must own that protocol outside the normal MCP hook
contract.

### 3. Claude Code: a native full-batch callback exists, but async delivery remains session-bound

The current [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) defines
session, turn, and tool-call cadences. It states that PostToolUse runs per tool and
concurrently for parallel tool calls. It also defines PostToolBatch, which runs exactly
once after all calls in a parallel batch resolve. Its tool_calls array is the complete
batch, with serialized tool results; additionalContext is injected once before the
next model call. These are DOC/DOCUMENTED claims, not a live Claude Code conformance
run.

The Claude docs also state:

- synchronous hooks block Claude's execution until they complete;
- async: true is available for command hooks and lets Claude continue immediately;
- each async firing creates a separate background process, with no deduplication;
- async output arrives on the next conversation turn, or waits for the next user
  interaction while idle; and
- claude -p kills unfinished async hooks at teardown unless the hook starts a fully
  detached process.

The ordinary async path is useful for eventual feedback but cannot promise that a
review finishes before a headless session ends. A product worker can persist state
before doing slow work, but host feedback still needs a later conversation checkpoint.
A synchronous hook can keep the current call/turn waiting, at the cost of making review
latency part of the host path.

Claude's SessionStart does not solve readiness by itself. At interactive launch,
resume, or clear, the docs say SessionStart hooks may run in the background; Claude's
first response waits for them, but changing session or clearing while they are still
running can discard returned context. An mcp_tool SessionStart handler is skipped at
launch when the MCP client context is not ready; it can run on later SessionStart
events after clear or compaction. This is why “start at session init” and “available
before the first review” are separate acceptance checks.

Claude SessionEnd can perform cleanup or save state, but it has no decision control,
cannot block termination, discards output fields, and has a short default timeout. It
is a cleanup signal, not a reliable queue-drain or feedback-delivery boundary.

### 4. First-party Claude source demonstrates lazy recovery and atomic claims

The current first-party security-guidance plugin source was inspected at immutable
commit [7974a70773fa229e4cc65aa1b356cc21f5c216c4](https://github.com/anthropics/claude-code/tree/7974a70773fa229e4cc65aa1b356cc21f5c216c4).
It is an implementation example, not proof of the private Claude Code runtime.

The source has two relevant patterns:

1. [ensure_agent_sdk.py](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/ensure_agent_sdk.py#L80-L117)
   runs from SessionStart, but uses a sidecar sentinel and O_EXCL to make concurrent
   startup attempts single-owner. It treats a recent sentinel as an in-flight build
   and ignores stale sentinels. The plugin's main hook also has a [PostToolUse fallback](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/security_reminder_hook.py#L1974-L2017)
   because remote plugin synchronization can happen after SessionStart. A throttle
   file is touched before a detached spawn so a burst of PostToolUse events does not
   start dozens of bootstrap processes.
2. [_claim_bash_hook_once](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/security_reminder_hook.py#L646-L696)
   handles one Bash call matching multiple if conditions. It observes that Claude can
   spawn the same script twice with the same tool_use_id, and uses an atomic per-clone
   .git sentinel to allow one claim. This is a concrete example of product-owned
   de-duplication at a host event boundary.

The source's state implementation uses a JSON file keyed by the remote session ID
when available, otherwise the host session_id, and wraps read-modify-write in an fcntl
lock ([session_state.py](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/session_state.py#L25-L147)).
That implementation does not include agent_id, agent_type, or worktree in its state
filename. This is not evidence that Claude IDs are unsafe; it is evidence that one
inspected plugin chose a session-scoped key and relies on per-clone sentinels for one
class of cross-process dedupe. Cross-agent and cross-worktree isolation for this plugin
remains UNKNOWN because no live concurrent-host run was performed.

The same plugin uses atomic read-and-clear for Stop state, then restores consumed work
after transient review failure ([diffstate.py](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/diffstate.py#L57-L137)).
That pattern matters for a product queue: claim/consume must be atomic, and a failed
remote call must not silently erase work that a later hook is expected to review.

### 5. Abide's batching answers a different question from host dispatch

The previous Abide pass found that active rules are grouped by identical in-scope file
sets and evaluated concurrently; a model call carries all rules in one group, then the
loudest verdict per rule survives the merge. This is SRC/SOURCE-INSPECTED in Abide's
ec3352e source (claim A03 in the [prior report](https://github.com/dearlordylord/jevs/blob/cba2ace/RESEARCH-ABIDE-2026-09-19.md#evidence-ledger)).

That batching happens inside a fresh hook invocation. It does not mean that multiple
Claude Write/Edit events are automatically coalesced into one worker, and it does not
provide cross-event in-flight joining. Abide's Stop path is the turn-level backstop:
it snapshots/diffs the complete turn and can review several files. The prior report
marks per-edit and Stop behavior source-inspected, while real Claude/Codex delivery was
not run in that pass.

The useful pattern to borrow is separation of:

- host event collection;
- an explicit logical review batch (rules by file set, or files by turn);
- bounded parallel model calls within that batch; and
- a bounded record of what was claimed, reviewed, delivered, or retried. The current
  product keeps these queues in memory; persistence is a later change only if the
  product goal changes.

The host does not supply the last item.

## Feedback and queue consequences

### Synchronous path

A synchronous hook can drain all currently claimable work before returning, but the
drain is bounded by the host hook timeout and the user-visible latency budget. Its
feedback can reach the current model request boundary. It should prefer work whose input
is available in the current event or whose queue record carries an exact snapshot
identity. If the worker waits for future tool events, it holds the current hook open;
the host does not turn it into a resident listener.

### Asynchronous path

An async hook can enqueue or claim work without delaying the host, but output delivery
is host-specific:

- Codex delivers informational output at the next safe model request or next user
  turn; idle completion does not start a turn, and session shutdown cancels unfinished
  work.
- Claude Code delivers output on the next conversation turn; idle sessions wait for
  the next interaction. asyncRewake is a Claude-specific escape hatch for a hook that
  exits with code 2, but it is still a host control path and should not be treated as
  generic background delivery.
- Claude claude -p kills unfinished async hooks at teardown unless the hook starts a
  fully detached process. A detached product worker must persist its result and rely
  on a later synchronous/async hook to deliver it.

The current in-memory queues can preserve work only while the owning process remains
alive. They still need both a work state and a presentation state, for example:

    observed -> claimable -> running -> reviewed -> deliverable -> delivered
                        \-> retryable / unavailable

The names are illustrative, not a proposed product schema. The important distinction
is that a review can finish after the host has moved on, while advice may remain
undelivered until a later hook checkpoint. A failed or killed worker may lose the
in-memory item; source-free reconciliation does not recreate it.

### What is safe to coalesce

The host facts support three distinct coalescing policies, each requiring product
identity rules:

1. Within one host batch: Claude PostToolBatch can carry all tool calls and is a
   natural place for one review operation. Codex has no equivalent documented full
   batch callback in the pinned surface, so a Codex adapter would need to collect
   turn_id-scoped events or use Stop.
2. Across concurrent callbacks: use a product-owned atomic claim keyed by a stable
   event identity such as host session/turn/tool-use ID plus worktree identity. A
   start timestamp is insufficient.
3. Across later turns/sessions: coalesce only if the product defines whether the unit
   means “review this exact snapshot” or “review the latest content for this path.”
   These are different semantics. A source-free marker can suppress duplicate advice,
   but it cannot reconstruct an old source snapshot after the file changes.

A future persistent queue could implement all three policies, but queue persistence is
not required by the current crash behavior and is not selected here. Whether
source-bearing inputs should be retained remains a separate privacy and stale-result
decision.

## Multiple agents and identity

Claude Code's current docs say configured hooks also run inside subagents. Common hook
input includes agent_id only when the hook fires inside a subagent, and SubagentStart/
SubagentStop provide agent_id, agent_type, and the subagent transcript path. The
[subagent hook sections](https://code.claude.com/docs/en/hooks#subagentstart) are
DOC/DOCUMENTED evidence. The docs do not establish that two independent sessions or
worktrees share an agent ID namespace in a way product storage can infer.

Codex's current docs expose agent_id and agent_type on SubagentStart, and state that
SessionEnd does not run for subagents. The [Codex lifecycle table](https://developers.openai.com/codex/hooks#hooks)
is DOC/DOCUMENTED evidence. The pinned resident-MCP run did not exercise subagents,
concurrent sessions, or worktrees.

The minimum identity tuple for a product-owned queue remains an open specification
question. The evidence says it cannot safely be only “the latest worker” or only a
filesystem path. At minimum, a prototype should record and compare:

- host kind and host session/thread ID;
- agent ID/type when the host supplies them;
- repository/worktree identity and current working directory;
- turn ID and tool-use ID when present; and
- a content or snapshot identity for the reviewed input.

Whether each field is part of a partition key, a dedupe key, or merely audit metadata
is not selected here.

## Evidence ledger

| ID | Material proposition | Source class / state | Primary source and limitation |
| --- | --- | --- | --- |
| HD-01 | Pinned Codex command hooks spawn a fresh child per matching command-handler invocation; one input/result pair does not create a listener. | SRC/SOURCE-INSPECTED | [Pinned process-lifetime report](https://github.com/dearlordylord/jevs/blob/a3c72f1/RESEARCH-CODEX-HOOK-PROCESS-LIFETIME-2026-09-20.md#what-the-pinned-command-hook-runtime-does), exact rust-v0.155.1 source links. |
| HD-02 | Codex matching hooks run concurrently; background hooks are independent, bounded to eight concurrent per session, may complete out of order, and are cancelled at session end. | DOC/DOCUMENTED | [Codex hooks](https://developers.openai.com/codex/hooks#run-hooks-in-the-background). Living docs; pinned source corroborates the runner but does not make docs version-locked. |
| HD-03 | Codex async output is delivered at the next safe model request or next user turn; idle completion does not start a turn. | DOC/DOCUMENTED | [Codex background delivery](https://developers.openai.com/codex/hooks#run-hooks-in-the-background). |
| HD-04 | A retained pinned Codex run kept one MCP server across edit/Bash/Stop callbacks, missed early startup events, did not relaunch a crashed server, and delivered no MCP SessionEnd. | RUN/RUNTIME-TESTED (retained) | [58/58 resident-MCP verdict](https://github.com/dearlordylord/jevs/blob/055df19/experiments/resident-mcp-lifetime/VERDICT.md). One host surface, stdio fixture, no concurrent sessions/worktrees. |
| HD-05 | Claude PostToolUse fires once per tool; parallel tool calls fire concurrently; PostToolBatch fires once after the complete batch. | DOC/DOCUMENTED | [Claude hooks lifecycle and PostToolBatch](https://code.claude.com/docs/en/hooks#posttoolbatch). Current living docs; no live host run in this pass. |
| HD-06 | Claude async command-hook executions are separate background processes without deduplication; output arrives on a later turn, and claude -p kills unfinished work at teardown unless detached. | DOC/DOCUMENTED | [Claude async hooks](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background). Exact behavior is version-sensitive; docs inspected 2026-09-20. |
| HD-07 | Claude SessionStart may run in background; initial MCP tool hooks can be skipped before MCP context is ready; SessionEnd cannot block or deliver feedback. | DOC/DOCUMENTED | [Claude SessionStart](https://code.claude.com/docs/en/hooks#sessionstart), [MCP tool hooks](https://code.claude.com/docs/en/hooks#mcp-tool-hook-fields), and [SessionEnd](https://code.claude.com/docs/en/hooks#sessionend). |
| HD-08 | Claude first-party security guidance uses atomic startup sentinels, a lazy PostToolUse fallback, and a burst throttle when ensuring a dependency. | SRC/SOURCE-INSPECTED | [ensure_agent_sdk.py](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/ensure_agent_sdk.py#L80-L117) and [lazy fallback](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/security_reminder_hook.py#L1974-L2017). Plugin behavior, not private host implementation. |
| HD-09 | Claude first-party security guidance deduplicates multiple matching if handlers for one Bash tool_use_id with a per-clone atomic sentinel. | SRC/SOURCE-INSPECTED | [claim helper](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/security_reminder_hook.py#L646-L696). One plugin policy, not a universal host guarantee. |
| HD-10 | Claude first-party state is keyed by remote session ID or host session ID and protected by file locks; cross-agent/worktree isolation is not established by that source. | SRC/SOURCE-INSPECTED | [session_state.py](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/session_state.py#L25-L147). Absence of additional key components is not proof that host IDs collide. |
| HD-11 | Claude first-party Stop state uses atomic read-and-clear and restores work after transient failure. | SRC/SOURCE-INSPECTED | [diffstate.py](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/plugins/security-guidance/hooks/diffstate.py#L57-L137). |
| HD-12 | Abide groups rules by equal file sets within an invocation, but has no cross-event worker reuse or duplicate-call coalescing. | SRC/SOURCE-INSPECTED | Prior report claim A03 and [Abide source references](https://github.com/dearlordylord/jevs/blob/cba2ace/RESEARCH-ABIDE-2026-09-19.md#primary-source-index). No real-host dispatch run in that pass. |
| HD-13 | Claude and Codex expose subagent identity fields, but cross-session/worktree queue partitioning remains unresolved. | DOC/DOCUMENTED + UNKNOWN | [Claude subagent hooks](https://code.claude.com/docs/en/hooks#subagentstart) and [Codex lifecycle hooks](https://developers.openai.com/codex/hooks#subagentstart). No concurrent multi-agent probe retained. |

## Candidate cards and decision classifications

### Codex hook surface

**Role:** agent host lifecycle and dispatch surface. **Potential use:** receive events
and deliver advice. **Lifecycle:** per-event command children; optional bounded
background callbacks; existing-connection MCP callbacks. **State:** host retains
runtime bookkeeping, but normal command children do not share product memory.
**Failure:** synchronous timeout controls progress; async work can be cancelled at
session end; MCP startup/restart gaps are demonstrated above. **Composition:** matching
handlers run concurrently and can race on product-owned state. **Portability:** facts
are pinned to 0.155.1 where source mechanics matter.

**Classification:** BORROW the explicit event/feedback semantics. OPTIONAL INTEGRATION
for an MCP-backed resident transport after a readiness/restart probe. No dependency
decision follows from this research.

### Claude Code hook surface

**Role:** agent host lifecycle and dispatch surface. **Potential use:** use
PostToolBatch for a host-provided batch, synchronous PostToolUse for immediate
per-tool feedback, or async hooks for eventual delivery. **Lifecycle:** concurrent
per-tool events, explicit full-batch callback, SessionStart/SessionEnd caveats, and
subagent events. **State:** product must own dedupe/claims; first-party source uses
locked files but does not establish a universal storage contract. **Failure:** async
work is session-bound unless detached and persisted. **Portability:** current docs are
living and require versioned conformance before a release promise.

**Classification:** BORROW the explicit batch/feedback distinction and lazy
ensure-running pattern. OPTIONAL INTEGRATION for using PostToolBatch in the Claude
adapter. No dependency or rejection decision is made.

### Abide's process/batching patterns

**Role:** neighboring review integration and implementation baseline. **Potential
use:** process-per-hook continuity with durable state, logical rule batching, Stop
backstop, bounded repair loops. **Lifecycle:** fresh host worker per invocation;
source-inspected batch grouping within an invocation. **State:** session files and Git
snapshots preserve continuity, but cross-event coalescing is absent. **Failure:**
fail-open and bounded loops are documented in the prior report. **Portability:** Claude,
Codex, and OpenCode adapters differ.

**Classification:** BORROW the separation between host event, logical batch, and turn
backstop. REJECT treating its internal rule grouping as evidence that host events are
coalesced. No dependency recommendation is made.

## Product implications for later specification/prototype work

These are candidate requirements, not settled requirements.

| ID | Advisory implication | Supporting evidence and counterevidence | Affected workflow/hosts | What would resolve it | Disposition |
| --- | --- | --- | --- | --- | --- |
| HD-P1 | Treat host event collection, logical review batching, queue claiming, and advice delivery as separate contracts. | HD-01–HD-07, HD-12; Claude PostToolBatch can collapse a host batch, but only on Claude. | Post-edit advisory; Claude/Codex | Specify event identity and batch semantics per adapter. | Take to specification |
| HD-P2 | A worker may drain currently claimable work, but ownership must be atomic and bounded; start time must not assign ownership. | HD-02, HD-05, HD-08, HD-09, HD-11; no host routes later calls to one worker. | Bursts, concurrent agents, retries | Prototype N concurrent invocations with bounded claim and explicit queue-full assertions. | Take to both |
| HD-P3 | Define whether in-memory queued work means an exact snapshot review or a latest-content review; persistence is not required for the current crash behavior. | HD-03, HD-04, HD-06, Abide A06/A11; stale source and privacy consequences differ. | Async feedback and next-turn delivery | Changed-file-before-worker and changed-file-after-review fixtures. | Take to specification + prototype |
| HD-P4 | Use Claude PostToolBatch when the decision needs the complete parallel tool set; provide a separate Codex aggregation path. | HD-05; Codex has no equivalent documented event in scope. | Multi-file/parallel edits | Host conformance probes with parallel calls and batch payload capture. | Take to both |
| HD-P5 | SessionStart plus lazy ensure-running is a recovery pattern, not a host guarantee; use atomic lock/sentinel and a later hook fallback if a resident process is selected. | HD-04, HD-07, HD-08; MCP startup may be unavailable and crashed MCP is not relaunched. | Resident daemon/MCP option | Startup-not-ready, crash, stale-lock, concurrent-start probe. | Take to both |
| HD-P6 | Separate review completion from advice presentation. Idle async completion can wait until the next model/user checkpoint or be lost at teardown. | HD-03, HD-06, HD-07. | Good feedback goal; headless mode | Delivery probe for active turn, idle turn, Stop, clear, and process exit. | Take to specification + prototype |
| HD-P7 | Partition and audit state with host/session/agent/worktree/turn/tool-use context where available; do not infer identity from latest worker. | HD-10, HD-13; no concurrent multi-agent runtime evidence. | Multiple agents/worktrees | Two-agent same-worktree and two-worktree conformance run. | Take to both |
| HD-P8 | Storage technology is deferred. The current contract uses bounded in-memory work/advice queues, explicit queue-full behavior, and accepts restart loss; SQLite is not needed for crash recovery. | HD-08–HD-12 show behavior, not a required storage engine. | Product state layer | Revisit only if the product later requires durable replay or background work across restarts. | Defer unless scope changes |

## Minimal conformance probes still needed

No host installs or paid calls were run in this pass. The smallest useful probes are:

1. Claude dispatch: one PostToolUse handler plus PostToolBatch; exercise sequential
   Write/Edit/MultiEdit, one multi-file MultiEdit, and a model batch of parallel tool
   calls. Record process IDs, tool_use_ids, batch membership, and whether one callback
   sees all files.
2. Codex dispatch: on pinned 0.155.1, exercise one multi-file apply_patch, several
   matching handlers, and concurrent background hooks. Record child PIDs, event IDs,
   start/finish order, timeout, and whether all expected files arrive in one payload.
3. Queue drain: seed N bounded in-memory work items, fire M concurrent synchronous
   and asynchronous hook invocations, and assert atomic ownership, count/byte bounds,
   and explicit queue-full behavior. Let one worker exceed its host budget and verify
   the documented restart-loss behavior; source-free reconciliation must not recreate
   the lost item.
4. Feedback timing: complete a review while the host is active, idle, at Stop, after
   clear or resume, and during claude -p/codex exec teardown. Record whether advice
   reaches the model, the user, a later turn, or durable state only.
5. Readiness/restart: start SessionStart before the resident service is ready, fire a
   later hook, kill the service, fire another hook, and test stale lock cleanup.
   Include Codex MCP and a product-owned IPC daemon separately; their contracts differ.
6. Identity/isolation: run two sessions and two subagents in one worktree, then two
   worktrees, and verify the queue key, claim scope, result delivery, and cleanup.

## Limitations and stopping condition

This pass used official current host documentation, the pinned Codex source findings
already retained in the repository, a shallow inspection of the first-party Claude Code
plugin repository at commit 7974a707..., and the existing Abide report. Claude Code's
private CLI implementation was not inspected; the current docs are living and were not
version-pinned to a CLI binary. No live Claude Code run, concurrent-agent run,
multi-worktree run, or new Codex runtime was performed. The resident-MCP run used one
stdio fake server and did not prove cross-session sharing or queue persistence.

The stopping condition for this focused pass is met: current primary sources establish
distinct host dispatch and feedback boundaries, and the remaining questions are
product-owned queue, identity, readiness, and conformance questions. A later pass
should run the minimal probes above rather than repeat this documentation review.

## Primary-source index

1. [OpenAI Codex hooks documentation](https://developers.openai.com/codex/hooks),
   inspected 2026-09-20.
2. [Pinned Codex hook process-lifetime report](https://github.com/dearlordylord/jevs/blob/a3c72f1/RESEARCH-CODEX-HOOK-PROCESS-LIFETIME-2026-09-20.md),
   including immutable rust-v0.155.1 source links.
3. [Retained resident MCP-hook verdict](https://github.com/dearlordylord/jevs/blob/055df19/experiments/resident-mcp-lifetime/VERDICT.md),
   codex-cli 0.155.1, Linux arm64.
4. [Claude Code hooks reference](https://code.claude.com/docs/en/hooks),
   inspected 2026-09-20.
5. [Anthropic Claude Code repository](https://github.com/anthropics/claude-code/tree/7974a70773fa229e4cc65aa1b356cc21f5c216c4),
   first-party plugin source inspected at immutable commit
   7974a70773fa229e4cc65aa1b356cc21f5c216c4.
6. [Prior Abide research](https://github.com/dearlordylord/jevs/blob/cba2ace/RESEARCH-ABIDE-2026-09-19.md),
   source-inspected at Abide commit ec3352e873163b74aca1ac9cf3bd0ea69a97723a.
