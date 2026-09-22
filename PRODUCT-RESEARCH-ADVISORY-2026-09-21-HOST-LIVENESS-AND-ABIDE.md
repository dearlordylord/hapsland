# Product research advisory: host liveness, closure, and Abide

**Date:** 2026-09-21 (America/Montreal)
**Canonical path:** `PRODUCT-RESEARCH-ADVISORY-2026-09-21-HOST-LIVENESS-AND-ABIDE.md`
**Status:** advisory research, not a normative specification or adoption decision.

## 1. Brief, scope, and change log

**Question.** What can a short-lived hook client or a resident reviewer reliably use to
identify a host/session, determine that a host is still live, and establish actual host
closure?  How do the pinned Abide adapter/runtime and tests scope, retain, clean up, and
coordinate that state?  The immediate consumer is the open Wayfinder ticket *“Define
completeness, recovery, and concurrency semantics.”*

**Assumptions examined.** The product works at the agent-host boundary; normal Codex
`type: "command"` hooks are short-lived children; an optional resident reviewer would
be product-owned rather than an extension loaded into the host.  Representative cases
are a headless `codex exec`, interactive Codex, a Claude Code session, subagents,
concurrent worktrees, host interruption, a quiet-but-open session, and a reviewer crash.

This report *supplements only* [the 2026-09-20 Codex hook-lifetime report](./RESEARCH-CODEX-HOOK-PROCESS-LIFETIME-2026-09-20.md), [the 2026-09-19 Abide review](./RESEARCH-ABIDE-2026-09-19.md), and the retained branch-only
`RESEARCH-ABIDE-LIFETIME-2026-09-20.md`.  It does not repeat their rule-quality or
competitor comparison.  No new host/Abide execution was performed: existing sanitized
Codex evidence is reused, and no source, credentials, or paid response was retained.

**Discovery/stopping condition.** Inspection was limited to the pinned Codex source and
retained Linux arm64 probes, official Codex/Claude hook contracts, and Abide's pinned
source/tests at `ec3352e873163b74aca1ac9cf3bd0ea69a97723a`.  A current Abide revision
is deliberately not mixed in: the prior supplement separately inspected
`f2683828965ced03da07abae811e78af0383040c`; its source claims below remain clearly
scoped to the pinned revision unless stated otherwise.  Stop after identity, liveness,
closure, retention, and concurrency have an evidence entry.  This is not ecosystem
coverage.

## 2. Executive findings

1. **Identity is not liveness or closure.** Codex hook payload `session_id` and `cwd`
are usable host-supplied correlation inputs.  `turn_id` is usable only on events that
include it.  They do not prove that the named host is still running, that two processes
are the same agent, or that a session ID is globally unique across hosts/worktrees.
Codex documents parent-session identity for subagent hooks, so session ID alone cannot
separate a parent from its subagents.
2. **No hook signal proves OS-level host closure.** `SessionEnd` is the strongest
host-level semantic signal available to a hook, but it says the host dispatched its end
event, not that the host process has exited.  Its absence is also ambiguous: crash,
SIGKILL, transport failure, disabled hook, and an event the adapter did not register all
fit.  A command client observing its parent PID or a Unix socket disconnect can provide
a local hint, not a portable closure proof (re-parenting, PID reuse, reconnects, and
host launch topology remain possible).
3. **For the exact tested Codex envelope, clean and SIGINT headless runs delivered
`SessionEnd`, then the launched `codex exec` returned.** This is bounded RUN evidence,
not a contract that `SessionEnd` always arrives or that it means the OS process is gone.
Interactive evidence establishes multiple hook events in one TUI session, not a closure
or identity protocol. Claude facts in this report are DOC-only.
4. **Abide is not a singleton resident reviewer for Claude/Codex.** It configures fresh
command workers and carries continuity in `~/.abide/sessions`; its OpenCode plugin is
resident only inside the OpenCode server and still spawns the same worker per event.
Pinned source/test evidence does not establish safe global isolation: its durable turn
key omits host, canonical repository/worktree, and agent identity, and it has no
registered command-host `SessionEnd` cleanup.
5. **A short advice TTL is a relevance policy, not a closure detector.** A configurable
approximately ten-minute expiry can be a sensible *candidate* for pending advice if
delivery requires a later interaction.  It must not clear work merely because the host
looks quiet, or be represented as proof that the session ended.  Its useful value is an
empirical question about review latency, host delivery latency, edit supersession, and
user perception.

## 3. Evidence ledger

| ID | Exact proposition and primary evidence | Source / verification | Boundary and limitation |
|---|---|---|---|
| HL01 | At pinned `rust-v0.155.1` / commit `be2951ea34f0d295ed0becf97079f92fa5f6950e`, a command hook receives one JSON payload, spawns a child, waits or schedules it, and does not retain that child for later events. [`command_runner.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/command_runner.rs#L206-L335), [`dispatcher.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/dispatcher.rs#L101-L150) | SRC / SOURCE-INSPECTED | Proves the hook-child shape, not host identity or launch PID ancestry. |
| HL02 | At the pin, `PostToolUse` serializes a host thread ID as `session_id`; `Stop` serializes both `session_id` and `turn_id`; `SessionEnd` serializes `session_id` but no turn ID. The dispatcher classifies SessionStart/SessionEnd as thread-scoped and Stop/PostToolUse as turn-scoped. [`post_tool_use.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/events/post_tool_use.rs#L24-L35), [`stop.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/events/stop.rs#L28-L38), [`session_end.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/events/session_end.rs#L20-L31), [`dispatcher.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/engine/dispatcher.rs#L256-L270) | SRC / SOURCE-INSPECTED | Correlation fields and hook scope, not uniqueness across hosts/worktrees, resume equivalence, or OS-process identity. |
| HL03 | Matching Codex command hooks may run concurrently; background invocations are independent, bounded per session, and unfinished background work is cancelled at session end. [Codex background hooks](https://developers.openai.com/codex/hooks#run-hooks-in-the-background) | DOC / DOCUMENTED | Cancellation is host task handling, not an acknowledgement from a product daemon. The pinned runtime's JoinSet/semaphore and shutdown abort corroborate implementation, but not a live run. |
| HL04 | Sanitized Linux arm64 `codex-cli 0.155.1` headless probes recorded `SessionStart → UserPromptSubmit → PostToolUse → Stop → SessionEnd` for successful runs, and `Interrupt → SessionEnd` after an external SIGINT; the launched `codex exec` then returned (69/69 assertions). [retained README](./evidence/codex/0.155.1/README.md), [ledger](./evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json) | RUN / RUNTIME-TESTED | Does not test SIGKILL, terminal loss, resume, PID correlation, concurrent sessions, or a hook observing post-`SessionEnd` process death. |
| HL05 | The retained interactive Codex probe saw post-edit advice before the next action in one TUI session. [retained README](./evidence/codex/0.155.1/README.md) | RUN / RUNTIME-TESTED | No interactive close/kill/restart identity or closure probe. |
| HL06 | Claude documents `session_id`, `cwd`, event fields, session/turn/tool events, `agent_id` for subagent events, and concurrent matching/async command hooks. It documents SessionEnd reasons and says SessionEnd cannot control termination; its output is discarded and its default timeout is 1.5 seconds. [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) | DOC / DOCUMENTED | No pinned Claude runtime source or live Claude run was inspected here; documentation does not promise delivery after crash/kill/disconnect, so absent end remains unknown. |
| HL07 | Pinned Abide installs Claude/Codex `SessionStart`, `UserPromptSubmit`, edit `PostToolUse`, and `Stop` as command hooks; its hook runner emits output then calls `process.exit(0)`. [`settings.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/settings.ts), [`hosts.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/hosts.ts), [`abide-hook.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/abide-hook.ts), [`hookRunner.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/hookRunner.ts) | SRC / SOURCE-INSPECTED | Fresh-process conclusion is supported by configuration plus explicit exit; no live host installation in this pass. |
| HL08 | Abide state is keyed as `~/.abide/sessions/<safe(session_id)>/<safe(prompt_id or turn)>`; `safe` replaces non-alphanumerics, and the key does not include host, canonical repository/worktree, or agent ID. [`paths.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/paths.ts), [`session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts) | SRC / SOURCE-INSPECTED | Collision is a source-level risk, not proof that a particular host emits colliding IDs. |
| HL09 | Abide uses `wx` first-write files and marker files/counters for per-turn concurrent hooks; tests exercise parallel first-record/counter behavior and clear. [`session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts), [`session.test.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/session.test.ts) | SRC / SOURCE-INSPECTED | No transactional cross-key coordination or live multi-agent/worktree result. |
| HL10 | At `SessionStart`, Abide prunes session directories older than seven days. `Stop` clears non-blocked turns; a repair block is retained, Stop attempts are capped, and no command-host `SessionEnd` handler is installed. [`sessionStart.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/sessionStart.ts), [`session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts), [`stop.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts) | SRC / SOURCE-INSPECTED | Seven-day pruning is eventual cleanup on a future start, not session-end detection. |
| HL11 | Abide’s OpenCode module retains a closure `Map` keyed by `sessionID`, invokes turn handling on idle, and spawns its hook worker for events; it has no documented/source-visible `session.deleted` map cleanup in the pinned adapter. [`abide.mjs`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/opencode/abide.mjs), [OpenCode plugin events](https://opencode.ai/docs/plugins) | SRC / SOURCE-INSPECTED; DOC / DOCUMENTED | A resident plugin is not a cross-host singleton; server restart behavior was not exercised. |
| HL12 | Abide’s hook tests cover shell-created/deleted files and incomplete snapshots, while the broader pass says no real host was run against Abide. [`hook.test.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/hook.test.ts), [prior pass limitation](./RESEARCH-ABIDE-2026-09-19.md) | SRC / SOURCE-INSPECTED | Tests are not a runtime conformance witness. |
| HL13 | Codex documents `SessionEnd` for normal close, archive/delete, or idle/no-client teardown; it is synchronous/advisory. It documents parent-session IDs for subagent hooks. At the pin, SessionEnd is dispatched during teardown but its emitted reason is hard-coded `other`, so it cannot classify normal versus interrupted closure. [Codex SessionEnd reference](https://developers.openai.com/codex/hooks#sessionend), [`session_end.rs`](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/events/session_end.rs#L20-L24) | DOC / DOCUMENTED; SRC / SOURCE-INSPECTED | The living docs and source do not prove delivery after a crash/kill or OS exit after dispatch. |

## 4. Candidate cards and capability matrix

| Candidate / intended use | Identity available to a client | Reliable liveness / closure signal | State, expiry, concurrency | Classification |
|---|---|---|---|---|
| Codex 0.155.1 command hook → product client | `session_id`, `cwd`, event fields; `turn_id` where supplied (HL02) | Semantic `SessionEnd` only; no OS-exit proof. A fresh child is certain at this pinned boundary (HL01). | Host permits concurrent hooks; background cancellation is session-bound (HL03). | **OPTIONAL INTEGRATION**: native adapter edge; do not depend on it for residency or closure proof. |
| Codex interactive / headless observed envelope | Sanitized retained runs intentionally redact IDs; host payload shape confirms fields exist (HL04–05) | `SessionEnd` appeared before the launcher returned in bounded clean/SIGINT runs (HL04); no stronger claim. | Headless lifecycle and interactive delivery are distinct, both short-client compatible. | **BORROW**: test event-order and interruption fixtures, not a lifetime guarantee. |
| Claude Code command hook | Docs name session, cwd and subagent `agent_id` fields (HL06) | `SessionEnd` is documented semantic cleanup input; live closure semantics unknown. | Concurrent/async command processes; host-specific delivery/teardown needs a versioned probe. | **OPTIONAL INTEGRATION**: adapter only after conformance gate. |
| Abide command runtime/state | Session plus prompt/turn, but not host/root/worktree/agent (HL07–08) | No resident process and no registered SessionEnd cleanup. `Stop` and future-start seven-day prune are cleanup paths (HL10). | Per-key `wx`/marker coordination; no established multi-worktree isolation (HL09–12). | **BORROW**: atomic first-writer/marker and incomplete-turn patterns. **REJECT**: its global durable key and use as resident-reviewer dependency. |
| Abide OpenCode plugin | `sessionID` map plus same disk state (HL11) | Idle is an activity boundary, not end; no observed deletion cleanup. | Resident only in that host server; child worker per event. | **BORROW** adapter/worker separation; **REJECT** as a general singleton model. |

The existing-solution baseline does not supply a host-neutral, true-global singleton
with verified ownership, liveness, closure, and multi-worktree isolation.  Abide can
be borrowed for narrowly scoped patterns, but does not remove the need to specify and
test those concerns in the product.

## 5. Advisory implications for topology and advice expiry

### Singleton versus scoped resident process

| Shape | Advisory upside | Unresolved safety/completeness requirement |
|---|---|---|
| One process per host-session-worktree | Natural fault and identity boundary; a termination hint affects less unrelated work. | Need an authenticated/atomic ensure-start protocol, stale lock/socket recovery, and a definition for subagent sharing versus separation. |
| One machine-wide singleton routing all clients | Can share bounded backend concurrency, cache, and observability across clients. | Must receive an explicit routing key at least `{adapter/host kind, host session ID, agent ID when supplied, canonical repository identity, canonical worktree identity}`; prevent one client reading/delivering another’s advice; define authorization, lease/heartbeat, restart/reconciliation, and fairness. No inspected host signal proves it should tear down a route. |
| One-shot client only | Simplest isolation and no daemon ownership. | Cross-event work/advice is lost at child exit unless intentionally persisted; duplicate requests/races still require a source-free claim protocol. |

These are **INFERRED advisory consequences**, not a decision to add a daemon, queue, or
durable store.  A global singleton must not use Abide’s `session_id/prompt_id` key as a
model: it lacks the routing dimensions above.  Conversely, session/worktree-scoped
workers must not infer a clean teardown from a quiet interval.

### Proposed ~10-minute relevance window

Treat an advice TTL as the deadline after which a completed, undelivered finding is no
longer presented because it is likely stale—not as a deadline for the host, review
request, lease, or process.  It is useful only if a later host checkpoint can receive
advice and snapshot identity is checked again.  A TTL should produce an explicit
`expired-relevance` outcome/receipt, never silently claim review/delivery/closure.

`~10 minutes` is plausible only as a prototype starting arm.  It needs comparison with
shorter and longer values and at least these measurements:

1. event-to-review-complete and complete-to-next-delivery-checkpoint distributions,
separately for headless, interactive, and Claude;
2. percentage of results whose exact snapshot remains current at each candidate TTL;
3. percentage that become superseded by a later edit, session end, restart, or absent
next checkpoint; and
4. user-visible duplicate/late-advice rate, backend work wasted, and whether a later
session/worktree could ever receive the wrong route.

The prototype must model **four independent transitions**: host semantic end,
transport/client disconnect, reviewer lease/process loss, and advice relevance expiry.
Collapsing them would make silent data loss look like confirmed closure.

## 6. Prototype handoff and unknowns

| ID | Advisory implication / support | Affected workflow | Prototype acceptance check | Disposition |
|---|---|---|---|---|
| HL-H1 | Preserve explicit host/session/agent/root/worktree routing inputs, with “unknown” rather than fabricated values (HL02, HL06, HL08). | Concurrent Codex/Claude sessions, subagents, worktrees | Launch concurrent disposable sessions/worktrees; assert no state/advice crossing and record exact raw-field availability by host/version. | Take to both. |
| HL-H2 | `SessionEnd` is a semantic signal, not OS closure (HL02–06). | Clean exit, SIGINT, kill, terminal close, host crash | Timestamp hook event, client/daemon disconnect, parent/launcher exit, and server observation. Assert no test labels a missing end as closure. | Take to prototype. |
| HL-H3 | Shared state needs atomic claim/lease plus recoverable terminal states, following Abide’s limited first-writer lesson (HL09–10). | Parallel edits, duplicated hooks, reviewer crash | Deterministic barriers: one logical review gets one owner; expiry/retry cannot delete a later snapshot; killed owner is detectable without delivering stale advice. | Take to both. |
| HL-H4 | Evaluate pending-advice relevance independently of lifecycle. | Quiet interactive user, headless end, later edit | Controlled clock at 1/5/10/20 minutes; verify exact snapshot guard, explicit expiry receipt, and no expiry causes daemon teardown. | Take to prototype. |
| HL-H5 | Do not adopt Abide’s global key or assume its OpenCode resident plugin generalizes (HL08, HL11). | Singleton routing | Negative collision fixtures sharing session/prompt values but differing host/root/worktree/agent. | Take to specification. |

**Unknowns requiring versioned evidence:** Codex uniqueness/lifetime guarantees for IDs;
Codex interactive termination and multi-session/worktree behavior; actual direct parent
PID relationship for a command hook; Claude’s version-specific payload fields, async
teardown, end delivery, and subagent/worktree IDs; whether a resident product transport
can receive an authenticated closure acknowledgement; and real Abide host behavior under
all of the above.  None should be inferred from documentation or source alone.

## 7. Limitations and primary-source index

No new local probe was needed because the relevant retained Codex run is deterministic
and sanitized; rerunning it would not answer the missing closure cases.  No live Abide,
Claude Code, multi-session, kill, PID, or daemon probe occurred.  Source inspection is
not runtime behavior.  The primary sources are the pinned Codex source and official
Codex documentation (HL01–03), retained local run ledger (HL04–05), official Claude
documentation (HL06), and the immutable pinned Abide source/tests (HL07–12).  The
branch-only 2026-09-20 Abide supplement is prior advisory context, not a substitute for
those immutable links.
