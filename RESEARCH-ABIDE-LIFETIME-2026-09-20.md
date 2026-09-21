# Abide process and state lifetime review

**Date:** 2026-09-20 (America/Montreal)

**Candidate:** [coldteadotai/abide](https://github.com/coldteadotai/abide)

**Pinned source:** commit [`ec3352e873163b74aca1ac9cf3bd0ea69a97723a`](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a), CLI `0.0.5`, schema `0.0.3`

**Current source inspected:** commit [`f2683828965ced03da07abae811e78af0383040c`](https://github.com/coldteadotai/abide/tree/f2683828965ced03da07abae811e78af0383040c), `feat: adds jev retention policy`
**Canonical path:** `RESEARCH-ABIDE-LIFETIME-2026-09-20.md`

This is product-specification advisory material. It supplements the broader [Abide review](./RESEARCH-ABIDE-2026-09-19.md) and the [Phase F companion](./PRODUCT-ABIDE-PHASE-F-REVIEW-2026-09-19.md); it does not supersede either report or authorize adoption.

## Executive answer

Abide uses two process-lifetime strategies behind one hook contract:

- Claude Code and Codex invoke `node .../abide-hook.js <event>` as a fresh process for each registered event. Continuity is carried by files under `~/.abide/sessions/<session>/<turn>`, not by an Abide daemon or an in-memory process.
- OpenCode loads a resident JavaScript plugin into its server. The plugin keeps a per-`sessionID` map in memory, but still starts the same hook script as a child process for each session, turn, edit, and idle event.

The design is coherent for one repository, one active session, and host-supplied turn IDs. It explicitly handles parallel edit hook processes with first-write-only records and marker-file counters, and it uses a turn-start Git snapshot plus an end-of-turn backstop for shell changes. The tests cover those local seams.

The source does not establish safe isolation for concurrent agents, repositories, or worktrees sharing one home directory. The durable key is only a sanitized host `session_id` plus `prompt_id`/`turn_id` (or the literal fallback `turn`); it omits the repository root, worktree, host, and agent identifier. Claude's documented user-prompt input has no turn ID in the fields Abide accepts, while Codex documents that subagent hooks use the parent session ID. These facts create source-level collision and attribution risks that require real-host experiments before becoming product requirements.

Abide also has no registered `SessionEnd` cleanup path. Normal `Stop` handling clears a turn only when it does not return a repair block; aborted or blocked state remains until a later event or the seven-day pruning pass at a future `SessionStart`. OpenCode has no `session.deleted` cleanup in its plugin map: `session.idle` runs the end-of-turn check, and the map survives until the plugin process exits. A restart clears that map but does not restore it from disk.

The strongest reusable lesson is the separation between a host-specific event adapter and a short-lived, schema-validated hook worker. The strongest lesson to reject is a global state key without project/worktree/agent scope. No dependency recommendation is made.

## 1. Research brief, scope, and change log

### Question and baseline

How does the pinned and current Abide source keep review state alive across edits, turns, restarts, host processes, concurrent tool calls, concurrent agents, and worktrees on Claude Code, Codex, and OpenCode? Which parts are safe patterns to borrow for a host-neutral product whose agent host owns the tool loop?

The existing-solution baseline is using Abide's installed adapters and lifecycle behavior for the supported host workflows. A product-owned lifecycle remains justified only if it needs stronger identity, retention, teardown, attribution, or host conformance than this design establishes.

Representative workflows in scope:

1. A normal edit followed by a turn-end check.
2. Parallel edit events and shell-written files in one turn.
3. Two sessions, subagents, or worktrees sharing one machine and repository.
4. Host resume/restart, an interrupted hook, a stale repair block, and normal cleanup.
5. OpenCode's resident plugin versus command-hook hosts.
6. Missing credentials, a remote timeout, a process kill, and event-log failure.

Out of scope: rule quality, rubric compilation, benchmark precision, broad competitor discovery, paid Jev behavior, and a live installation into an agent host. Those are covered by the earlier reports or require a separate runtime pass.

### Discovery and stopping condition

The pass inspected the pinned and current official Abide source, its tests, its README/install paths, and the current first-party lifecycle references for Claude Code, Codex, and OpenCode. Discovery queries were limited to the official Abide repository and the official host hook/plugin documentation. No secondary write-up was used as evidence. The pass stops after every lifecycle/state subsystem in the source tree and the three supported host boundaries has an evidence entry; it does not claim ecosystem completeness.

### Change log

This is a new focused supplement. A local immutable-commit comparison found the lifecycle files unchanged between the pinned and current Abide revisions. The current revision adds the provider retention routing change in `jev.ts`, a sample `.abide/rubric.json`, and moves the events/compile-skill ignore entry into `.abide/.gitignore`; it does not add a session-end event, a project/worktree state key, or OpenCode session-map cleanup. No earlier conclusion is superseded.

## 2. Candidate inventory

| Candidate/component | Class | Included use | Why included or excluded |
|---|---|---|---|
| Abide command hooks and durable session state | Host adapter + review runtime | Fresh event processes, turn state, cleanup, concurrency | Included: the requested lifetime boundary. |
| Abide OpenCode plugin | Host adapter | Resident plugin lifetime and child-hook bridge | Included: its process model differs materially from command-hook hosts. |
| Claude Code hook lifecycle | Agent host | Session, turn, tool, subagent, worktree, and end events | Included as the host contract Abide consumes; official DOC evidence only. |
| Codex hook lifecycle | Agent host | Session/turn/subagent IDs and session end | Included as the host contract Abide consumes; official DOC evidence only. |
| OpenCode plugin lifecycle | Agent host | Plugin load and session/tool events | Included as the host contract Abide consumes; official DOC evidence only. |
| Other competitors or host adapters | Other classes | — | Excluded to avoid repeating the broad competitor pass; no ecosystem claim follows. |

## 3. Evidence ledger

The source class and verification state are independent. No live paid call or real host installation was performed in this pass.

| ID | Exact proposition and immutable source | Class / state | Limitation |
|---|---|---|---|
| AL01 | The schema's supported host set is exactly `claude`, `codex`, and `opencode`; the common hook input carries `session_id`, optional `prompt_id`/`turn_id`, `cwd`, optional transcript path, and optional prompt. [`host.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/schema/src/host.ts#L1-L5), [`hooks.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/schema/src/hooks.ts#L1-L17) | SRC / SOURCE-INSPECTED | This describes Abide's accepted contract, not complete host support. |
| AL02 | Claude Code and Codex are installed as four command hooks: `SessionStart`, `UserPromptSubmit`, `PostToolUse` for edit tools, and `Stop`; each command invokes the installed `abide-hook.js` with a host-specific timeout. [`settings.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/settings.ts#L19-L37), [`hosts.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/hosts.ts#L48-L95) | SRC / SOURCE-INSPECTED | The source does not prove that every host version invokes these commands exactly as configured. |
| AL03 | The hook entry point dispatches one named handler, and `runHook` installs a deadline, emits only the host JSON, and calls `process.exit(0)` after output or timeout. [`abide-hook.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/abide-hook.ts#L1-L22), [`hookRunner.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/hookRunner.ts#L14-L55) | SRC / SOURCE-INSPECTED | Fresh-process lifetime is an inference from the command installation plus this explicit process exit; no host process trace was run. |
| AL04 | OpenCode's shipped module says it is loaded into the server, spawns the same hook script for every event, catches failures, and keeps a `Map` of session state in the plugin closure. [`abide.mjs`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/opencode/abide.mjs#L1-L12), [`abide.mjs`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/opencode/abide.mjs#L20-L69), [`abide.mjs`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/opencode/abide.mjs#L100-L124) | SRC / SOURCE-INSPECTED | The plugin's actual server lifetime and restart behavior were not run. |
| AL05 | Abide's durable turn key is `~/.abide/sessions/<safe(session_id)>/<safe(prompt_id ?? "turn")>`; `safe` replaces non-alphanumeric characters with `_` and the key has no project, worktree, host, or agent component. [`paths.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/paths.ts#L6-L15), [`session.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/session.ts#L8-L23) | SRC / SOURCE-INSPECTED | Whether a host guarantees globally unique IDs is a host question and remains UNKNOWN here. |
| AL06 | Turn state uses first-write-only files (`wx`) for file starts, baselines, prompts, blocked paths, and checked edits; marker-file counts avoid read-modify-write for block and Stop counters. [`session.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/session.ts#L25-L58), [`session.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/session.ts#L60-L148) | SRC / SOURCE-INSPECTED | This reduces races within one intended turn key; it does not isolate colliding keys or make directory removal transactional. |
| AL07 | `SessionStart` prunes session directories older than seven days; `TurnStart` clears only the no-ID fallback directory, records a prompt when present, writes `baseline-status=pending` before the Git snapshot, and marks `ok` or `failed`. [`session.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/session.ts#L159-L223), [`turnStart.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/turnStart.ts#L8-L35), [`sessionStart.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/sessionStart.ts#L64-L70) | SRC / SOURCE-INSPECTED | TTL cleanup runs only when a SessionStart hook reaches the prune call; Git object lifetime is separate. |
| AL08 | Edit hooks record the first file content, run checks concurrently with `Promise.all`, record judged blob IDs, create block/counter markers, and keep blocked turn state for a possible Stop repair loop. [`postToolUse.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/postToolUse.ts#L35-L70), [`postToolUse.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/postToolUse.ts#L84-L121), [`postToolUse.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/postToolUse.ts#L123-L171) | SRC / SOURCE-INSPECTED | The source records no host/agent/worktree identity in the turn state. |
| AL09 | Stop compares the turn-start Git tree with the current tree, falls back to per-file starts without Git, refuses a partial check when the baseline/diff is incomplete, and clears the turn for every non-`block` output. A block leaves state for repair; Stop checks are capped at two. [`stop.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/stop.ts#L56-L131), [`stop.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/stop.ts#L135-L275), [`constants.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/constants.ts#L18-L30) | SRC / SOURCE-INSPECTED | No `SessionEnd` cleanup is registered; an interrupted process can leave state until a later event or prune. |
| AL10 | Turn snapshots use a scratch Git index but `git add -A` and `git write-tree` create ordinary Git objects for eligible untracked source; Abide's session cleanup does not remove those objects. [`git.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/git.ts#L151-L182), [`session.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/session.ts#L205-L223) | SRC / SOURCE-INSPECTED | Actual reachability/garbage-collection timing was not measured. |
| AL11 | Events are best-effort JSONL appends at `<repo>/.abide/events.jsonl`; invalid or torn lines are skipped on read. Current initialization writes `.abide/.gitignore` entries for the event log and compile skill. [`events.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/events.ts#L6-L33), [`init.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/commands/init.ts#L71-L83), [current ignore file](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/.abide/.gitignore#L1-L2) | SRC / SOURCE-INSPECTED | Event records identify a session and prompt, but not host, agent, root, or worktree. Concurrent append integrity was not live-tested here. |
| AL12 | The session tests intentionally exercise parallel-safe first-record semantics, marker counters, owner-only state, state separation by session/prompt, and whole-turn clear. The hook tests cover shell-created/deleted files, failed snapshots, and incomplete turn reads. [`session.test.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/test/session.test.ts#L23-L106), [`hook.test.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/test/hook.test.ts#L96-L127), [`hook.test.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/test/hook.test.ts#L243-L297) | SRC / SOURCE-INSPECTED | Test inspection is not an executed result in this pass. |
| AL13 | Claude Code documents per-session `SessionStart`/`SessionEnd`, per-turn `UserPromptSubmit`/`Stop`, per-tool `PostToolUse`, subagent hooks with `agent_id`, and worktree/cwd changes. [`Hooks reference`](https://code.claude.com/docs/en/hooks) | DOC / DOCUMENTED | Host documentation does not prove the installed Abide hook runs in every listed event; Abide registers only four events. |
| AL14 | Codex documents `session_id` as the current session ID, says subagent hooks use the parent session ID, supplies `turn_id` for turn-scoped hooks, and has a `SessionEnd` event that does not run for subagents. [`Hooks reference`](https://developers.openai.com/codex/hooks) | DOC / DOCUMENTED | Abide's accepted schema has no agent-specific field and does not register Codex SessionEnd/Subagent events. |
| AL15 | OpenCode documents plugins loaded from global/project sources and exposes `session.idle`, `session.deleted`, and `tool.execute.after` events. [`Plugins documentation`](https://opencode.ai/docs/plugins) | DOC / DOCUMENTED | Abide listens to `session.idle` and edit-after events; it does not listen to `session.deleted`. |
| AL16 | The pinned and current lifecycle source blobs are identical for `session.ts`, `turnStart.ts`, `stop.ts`, `settings.ts`, `schema/hooks.ts`, and `opencode/abide.mjs`; current changes are confined to Jev retention routing, sample rubric/ignore files, and README wording. [Pinned tree](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a), [current tree](https://github.com/coldteadotai/abide/tree/f2683828965ced03da07abae811e78af0383040c), [current `jev.ts`](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/jev.ts#L148-L171) | SRC / SOURCE-INSPECTED | This comparison establishes source continuity, not current live behavior. |

## 4. Comparable candidate card: lifetime boundary

### Identity and role

Abide is a combined host adapter, rubric runtime, event logger, and stateful turn backstop. Its supported host set is intentionally small. Claude Code and Codex share the command-hook path; OpenCode has a plugin edge that translates host events into the same command-hook payload. The lifecycle component is therefore an adapter/runtime boundary rather than a standalone state service. [AL01, AL02, AL04]

### Host lifecycle and process lifetime

| Host | Installed surface | Abide process lifetime | Durable/in-memory state | Teardown behavior |
|---|---|---|---|---|
| Claude Code | User/project settings JSON with four command hooks | One fresh Node process per matching event; `runHook` exits after output or deadline | Global on-disk turn state; repo-local event log; no resident Abide memory | `Stop` may clear a turn; no Abide `SessionEnd` hook. Claude can resume, fork, change cwd, or enter a worktree, but those host events are not part of Abide's installed surface. |
| Codex | User/project `hooks.json` with the same four command hooks; new hooks need one trust approval according to Abide's README | One fresh Node process per matching event | Same global turn directory and repo-local event log; `turn_id` is used when supplied | `Stop` may clear a turn; no Abide `SessionEnd`, `SubagentStart`, or `SubagentStop` hook. Codex's documented parent session ID for subagents is not augmented by an Abide agent key. |
| OpenCode | Global/project plugin shim pointing at the package's `opencode/abide.mjs` | Resident plugin closure plus one spawned Node child per event; plugin timeouts kill/settle the child path | In-memory `Map<sessionID, { turnId, followups, repairing }>` plus the same global on-disk turn directory and repo-local event log | `session.idle` invokes Stop and allows at most one follow-up; no map deletion on idle/deleted; plugin restart drops the map while disk state may remain. |

The host documentation confirms that these are materially different boundaries: Claude and Codex expose command hooks as lifecycle events, while OpenCode loads plugins into its own process and exposes session/tool events. Abide's child-worker reuse is a good contract seam, but it must not be read as identical host lifetime semantics. [AL02–AL04, AL13–AL15]

### Canonical state contract

The durable state is deliberately file-oriented:

```text
~/.abide/sessions/<sanitized session_id>/<sanitized prompt_id or "turn">/
  files/<hash>.json                 first file content seen this turn
  checked/<hash>.json               judged before/after blob IDs
  blocked/<hash>                    paths needing a Stop backstop
  blocks/<hash>.<n>                 per-rule/file block markers
  stops/stop.<n>                    Stop-check markers
  prompt                           bounded prompt text, when supplied
  baseline                         Git tree ID, when snapshot succeeded
  baseline-status                  pending | ok | failed
```

The first-write-only rule is well chosen for parallel PostToolUse calls: two calls cannot overwrite the first file-start content, and marker creation gives each racing block/Stop attempt its own slot. `Promise.all` also makes per-file checks concurrent. This is a source-inspected concurrency pattern, not evidence that different turns or agents are isolated. [AL06, AL08, AL12]

The key is weaker than the state contents. It is not rooted in the repository or worktree and does not record host or agent identity. `safe` also maps distinct strings to the same path when they differ only by characters replaced with `_`. When `prompt_id` and `turn_id` are both absent, every turn for that session uses the literal `turn` directory; `TurnStart` clears it before writing the next baseline. [AL05, AL07]

### Restart, failure, and cleanup

The hook runner has an outer deadline and the model call has inner timeouts. A timeout returns silent output and process exit zero. If a turn-start snapshot dies, `baseline-status=pending` or `failed` makes Stop report the turn incomplete instead of judging only a partial view. If Stop returns a block, state remains for the bounded repair attempt; any other Stop result clears the turn. This gives a useful crash-tolerant state machine for the current turn, but it is not a session teardown protocol. [AL03, AL07, AL09]

Abide's only general session cleanup is `pruneOldTurns`, called during `SessionStart`, which removes session directories older than seven days. There is no lock or session-end marker, and no code path in the inspected lifecycle files deletes the OpenCode `sessions` map on `session.idle` or `session.deleted`. A killed hook can therefore leave source-bearing files and a pending baseline; a restarted OpenCode plugin starts with an empty map while the global disk state is still eligible for the next hook. [AL04, AL07, AL09]

The Git snapshot has a second lifetime: `write-tree` stores eligible working-tree blobs in the repository object database. Deleting the global session directory does not delete those Git objects, so local source retention can outlive Abide's seven-day state policy until normal Git reachability cleanup. [AL10]

### Concurrent agents, sessions, and worktrees

The implementation handles parallel calls that share one intended session/turn key, but it does not establish isolation for the broader cases:

- Claude documents `agent_id` for subagent events and `cwd` changes/worktrees. Abide's common accepted input has no agent field, and its turn key omits `cwd` or repository root. Claude's documented `UserPromptSubmit` shape has `session_id`, `cwd`, and `prompt`, but no `prompt_id` in the fields Abide accepts; the fallback `turn` therefore matters for Claude unless the host supplies an extra field. [AL01, AL05, AL13]
- Codex documents that subagent hooks use the parent `session_id`. Abide can separate work only when a distinct `turn_id` is supplied, and the source has no `agent_id` dimension. The parent and subagent therefore share the same session directory namespace. [AL01, AL05, AL14]
- Two projects or worktrees can use the same sanitized session/turn names under one `~/.abide/sessions` directory. The source does not persist the root with a baseline or file-start record, while Stop resolves the current root from the later event's `cwd`. A cwd/worktree change during a turn is consequently an untested cross-root case. [AL05, AL07, AL13]
- Event records include `sessionId` and `promptId` but no host, agent, root, or worktree field. A shared `.abide/events.jsonl` therefore cannot distinguish all concurrent producers from its own data. [AL11]
- The settings installer removes only Abide entries in the file it edits. Official Claude and Codex documentation describes merged configuration sources, so a user who installs both user- and project-level hooks can plausibly run duplicate Abide event handlers; this was not exercised in a host. [AL02, AL13, AL14]

These are source-level risks and unknowns, not a claim that every host currently collides. A host conformance matrix must provide the actual uniqueness and ordering guarantees before the product treats `session_id` as a sufficient state key.

### Security and privacy lifetime

Session state is created owner-only (`0700` directories and `0600` files) and includes raw original file content and bounded prompt text. The event log is best effort and repo-local; the current commit ignores it inside `.abide`. The scratch Git snapshot can retain source-bearing objects as described above. The current revision's provider change corrects the earlier direct/gateway retention ambiguity: direct TypeSafe calls omit a gateway-only option, while gateway calls carry `zeroDataRetention: true`; this changes remote request metadata, not local state lifetime. [AL06, AL10, AL11, AL16]

### Operations and observability

The design makes missed review visible as skip/error JSONL events, bounds child/process work, and has tests for failed snapshots, shell writes, deletes, and parallel marker behavior. It does not record a host or agent identity, does not expose session-state age or cleanup outcomes in the event schema, and has no live evidence for host process termination, duplicate hooks, concurrent roots, or restart recovery. [AL03, AL09, AL11, AL12]

## 5. Capability matrix

`SOURCE-INSPECTED` means the implementation visibly supports the proposition. `DOCUMENTED` means the host says the lifecycle exists. `UNKNOWN` means the relevant behavior needs a named experiment; absence of a runtime witness is not scored as unsupported.

| Capability | Claude Code | Codex | OpenCode | Evidence |
|---|---|---|---|---|
| Fresh Abide process per event | SOURCE-INSPECTED (adapter + worker) | SOURCE-INSPECTED (adapter + worker) | NOT APPLICABLE for plugin, child worker is SOURCE-INSPECTED | AL02–AL04 |
| Resident host integration | UNKNOWN | UNKNOWN | SOURCE-INSPECTED plugin closure | AL04, AL13–AL15 |
| Per-session/per-turn durable state | SOURCE-INSPECTED | SOURCE-INSPECTED | SOURCE-INSPECTED | AL05–AL09 |
| Parallel tool-call writes | SOURCE-INSPECTED tests | SOURCE-INSPECTED tests | SOURCE-INSPECTED through shared child state | AL06, AL08, AL12 |
| Shell changes recovered at turn end | SOURCE-INSPECTED | SOURCE-INSPECTED | SOURCE-INSPECTED | AL09, AL12 |
| Agent-specific state isolation | UNKNOWN; no Abide agent key | UNKNOWN; subagents use parent session ID | UNKNOWN; map key is sessionID only | AL01, AL04, AL05, AL13, AL14 |
| Worktree/root isolation | UNKNOWN; key omits root and cwd changes are host-supported | UNKNOWN; key omits root | UNKNOWN; plugin closure has one directory, disk key omits root | AL04, AL05, AL13 |
| Normal session-end cleanup | UNKNOWN host event; Abide does not register it | UNKNOWN host event; Abide does not register it | NOT IMPLEMENTED in the inspected map | AL09, AL13–AL15 |
| Interrupted hook handling | SOURCE-INSPECTED state marks pending/failed and fails open | SOURCE-INSPECTED state marks pending/failed and fails open | SOURCE-INSPECTED child timeout/catch path | AL03, AL07, AL09 |
| State TTL | SOURCE-INSPECTED seven-day prune at SessionStart | SOURCE-INSPECTED seven-day prune at SessionStart | SOURCE-INSPECTED shared prune path | AL07 |
| Source-free local lifetime | UNKNOWN; raw file starts plus Git tree objects exist | UNKNOWN; same | UNKNOWN; same | AL06, AL10 |
| Current/pinned lifecycle continuity | SOURCE-INSPECTED | SOURCE-INSPECTED | SOURCE-INSPECTED | AL16 |

## 6. Decision classifications

| Stated use | Classification | Advisory rationale |
|---|---|---|
| Use the Abide runtime as the product's core lifecycle/dependency | **REJECT** | It would couple the product to an early, host-specific implementation whose state identity and teardown guarantees are not established for concurrent agents/worktrees. No dependency gate is passed or proposed. |
| Borrow the fresh command-hook worker plus a common, schema-validated event contract | **BORROW** | The same bounded worker can serve multiple command hosts and keeps host transport outside the review core. Preserve explicit host-specific capability semantics. |
| Borrow first-write-only files and marker counters for parallel event handlers | **BORROW** | This is a practical source-inspected pattern for local races, provided the state key is stronger and directory cleanup is coordinated. |
| Borrow turn-start snapshot plus end-of-turn backstop | **BORROW** | It covers shell writes and missed edit events, with an incomplete-turn result instead of silently judging a partial view. |
| Support Claude Code/Codex command hooks as edge adapters | **OPTIONAL INTEGRATION** | Keep the adapter at the host boundary; each host needs its own event, ID, ordering, trust, and teardown conformance. |
| Support OpenCode through a resident plugin that delegates to the common worker | **OPTIONAL INTEGRATION** | The plugin is a host edge. Its in-memory map must remain presentation/coordination state, never the sole source of durable review identity. |
| Copy Abide's global source-bearing session directory and seven-day cleanup as the product default | **REJECT** | The key omits root/worktree/agent scope, cleanup is not session-end driven, and Git objects can outlive the policy. Adopt only after explicit retention and isolation decisions. |
| Treat `session.idle` or a Stop event as definitive session teardown | **REJECT** | They are end-of-turn/review events in the inspected adapter; OpenCode separately exposes `session.deleted`, and neither Abide nor the command adapters implement a complete teardown path. |

No `DEPEND ON` recommendation is made, so no dependency gate table applies.

## 7. Convergent patterns, conflicts, and product implications

### Patterns worth carrying forward

The Claude and Codex hook contracts both expose session and turn lifecycle identifiers, and Abide's adapters translate them into one validated payload. Abide's source then demonstrates a useful split: host transport is short-lived, while only the minimum turn continuity needed for coverage and repair is durable. First-write-only records and marker files make that durable seam tolerant of parallel event processes. [AL01–AL03, AL06, AL12–AL14]

The second reusable pattern is to make a whole-turn backstop independent of individual tool delivery. A start snapshot, checked-edit chain, and end-of-turn diff can detect shell-written files and avoid claiming a complete judgment when snapshot/diff work failed. [AL07–AL09, AL12]

### Conflicts and trade-offs

Fresh processes isolate crashes and make restart behavior simple, but pay startup and filesystem costs on every event. A resident plugin reduces host registration friction and can hold per-session coordination in memory, but map state disappears on restart, has no automatic deletion in Abide, and must not replace durable identity. [AL03, AL04]

A global state directory lets parallel hooks share one turn without modifying the host, but it makes project/worktree/agent scope implicit. Session-end cleanup would reduce retention but is not uniformly available or equivalent across hosts: Claude and Codex expose SessionEnd with different subagent semantics, while OpenCode has both idle and deleted session events. [AL05, AL07, AL13–AL15]

Fail-open bounded hooks protect the host from a stalled reviewer, but an interrupted process can leave partial state and an unreviewed edit. Abide records skipped/error outcomes, yet no host-level runtime witness here establishes what a killed command or plugin process does to the enclosing agent. [AL03, AL09, AL11]

### Candidate product implications

These are advisory implications, not settled requirements:

- A host adapter contract should declare whether it runs in a fresh process or a resident host process, what event ordering it receives, and what output can affect the host.
- A durable review key should include at least host, repository/worktree identity, agent/session identity, and turn identity; if a host lacks one dimension, the adapter should declare the fallback and its isolation limit.
- State should distinguish source-bearing snapshots from source-free receipts, with retention, crash recovery, deletion, and Git/object-store effects specified separately.
- Normal session teardown should be best effort and idempotent, but correctness must not depend on receiving it. Restart should have a documented behavior for pending blocks and stale turn state.
- Event receipts should attribute host, root/worktree, session, agent, turn, and adapter version so concurrent reviews can be diagnosed.
- The core should support both command-hook hosts and resident plugins through one schema-validated worker contract; host-specific adapters should be optional edges.

## 8. Traceable specification/prototype handoff

| ID | Advisory implication and evidence | Counterevidence / uncertainty | Affected workflows/hosts | Proposed acceptance | Disposition |
|---|---|---|---|---|---|
| AL-H1 | Declare fresh versus resident transport and preserve one worker contract. [AL02–AL04] | Abide demonstrates practical reuse, but no live process trace was run. | Claude, Codex, OpenCode; every edit/turn | Fake host drivers invoke each adapter with identical event fixtures; assert process boundary, stdout contract, timeout, and output placement. | Take to specification and prototype |
| AL-H2 | Make the durable key explicit and root/agent-aware. [AL05, AL13, AL14] | Host ID uniqueness may make the narrow key adequate in single-session use. | Concurrent agents/sessions/worktrees on all supported hosts | Run two roots, two worktrees, a parent plus subagent, and two turns in parallel with colliding/fallback IDs; assert no cross-read, cross-clear, or mixed receipt. | Take to both |
| AL-H3 | Define crash/restart/teardown semantics independently of SessionEnd. [AL03, AL07, AL09, AL15] | Host shutdown behavior is not established by source inspection. | Hook kill, host restart/resume, OpenCode idle/delete | Kill at each state transition; restart before Stop; assert pending/blocked state, bounded retry, idempotent cleanup, and no stale advice after TTL. | Take to both |
| AL-H4 | Separate source-bearing state retention from Git/object-store retention. [AL06, AL10, AL11] | No storage experiment was run, and Git garbage collection is host/user controlled. | Privacy-sensitive edits and long-lived sessions | Synthetic sentinels in file starts, prompts, receipts, temp files, and Git objects; document deletion/retention and verify no hidden source store. | Take to specification and prototype |
| AL-H5 | Attribute events to host, root/worktree, session, agent, turn, and adapter. [AL11, AL13, AL14] | Abide's compact event log is adequate for a single stream. | Concurrent host sessions and diagnostics | Interleave events from two adapters and roots; report must reconstruct each stream without relying on wall-clock order alone. | Take to specification |
| AL-H6 | Keep OpenCode's resident map as an edge coordination cache, never canonical state. [AL04, AL15] | A resident map can reduce duplicate work in a single server process. | OpenCode restart, idle, delete, and multi-session server | Start two session IDs, idle/delete one, restart plugin/server, and replay a pending repair; assert disk state and map state reconcile or fail explicitly. | Take to prototype |
| AL-H7 | Compare Abide's lifecycle cost with a product-owned implementation before expanding scope. [AL02–AL16] | For one sequential session, Abide may already be sufficient and cheaper to reuse. | Initial host rollout | Measure startup, state I/O, missed/duplicate events, repair latency, and cleanup across the same fixtures and host versions. | Defer; revisit at host conformance milestone |

## 9. Sufficiency and strongest disconfirmation case

Abide is sufficient as an existing-solution baseline for a single active root/session with ordinary sequential turns: the hooks are installable, the worker is bounded, state survives separate event processes, and tests cover parallel file records and shell backstops. Its process model is substantially simpler than requiring a long-lived daemon on every host.

It is not yet sufficient evidence for a product that promises concurrent agent/worktree isolation, exact lifecycle cleanup, or complete audit attribution. Those gaps arise from the source key and missing teardown dimensions, not from a missing model provider feature.

The strongest case against a product-owned lifecycle is that real host IDs may already be unique enough, users may rarely share a root across active agents, and Abide's existing adapters may pass the product's intended workflows at much lower implementation cost. This review should change the recommendation toward an Abide integration if a bounded live matrix demonstrates no cross-talk across supported host versions, restart/cleanup behavior is acceptable, and source-bearing retention is an explicit user-approved trade-off. Conversely, any reproduced collision, stale state after resume, or unbounded OpenCode map growth in required workflows supports a product-owned adapter/core boundary.

## 10. Limitations and unresolved questions

- No paid Jev call, credentials, host installation, or live concurrent agent session was run.
- `pnpm` dependencies were not installed in the temporary source checkout; claims are source/test inspection, not a rerun of Abide's test suite.
- The current commit is a rapidly changing `master`; lifecycle continuity is established only between the two named immutable revisions.
- Host documentation is current at access time and can change; it establishes host contracts, not Abide conformance.
- The source does not establish whether Claude/Codex session and turn IDs are globally unique across roots, worktrees, subagents, or restarts.
- The source does not establish OpenCode plugin process lifetime, plugin instance sharing across directories, or exact ordering under concurrent event callbacks.
- Git object reachability/garbage-collection timing and append-log behavior under concurrent large writes remain untested.
- No new ecosystem candidates were searched, and no completeness claim is made.

Named resolving experiments are AL-H2 through AL-H7 above. Until they run, collision, teardown, and retention claims remain source-grounded risks or UNKNOWN rather than settled product requirements.

## 11. Primary-source index

All Abide source links are immutable commit URLs. Host documentation was accessed 2026-09-20.

| Key | Primary source |
|---|---|
| A01 | [Pinned Abide tree at `ec3352e`](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a) |
| A02 | [Current Abide tree at `f268382`](https://github.com/coldteadotai/abide/tree/f2683828965ced03da07abae811e78af0383040c) |
| A03 | [Host schema](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/schema/src/host.ts), [hook schema](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/schema/src/hooks.ts), [settings installer](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/settings.ts), and [host installer](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/hosts.ts) |
| A04 | [Hook entry point](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/abide-hook.ts), [hook runner](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/hookRunner.ts), and [output contract](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/output.ts) |
| A05 | [Session state](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/session.ts), [paths](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/paths.ts), [turn start](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/turnStart.ts), [session start](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/sessionStart.ts), and [stop](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/stop.ts) |
| A06 | [PostToolUse](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/postToolUse.ts), [Git snapshot](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/git.ts), and [event log](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/events.ts) |
| A07 | [OpenCode plugin](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/opencode/abide.mjs), [plugin installer](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/opencodePlugin.ts), and [host tests](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/test/hosts.test.ts) |
| A08 | [Session tests](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/test/session.test.ts), [hook tests](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/test/hook.test.ts), and [Git tests](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/test/git.test.ts) |
| A09 | [Current Jev retention target](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/jev.ts), [current ignore file](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/.abide/.gitignore), and [current commit metadata](https://github.com/coldteadotai/abide/commit/f2683828965ced03da07abae811e78af0383040c) |
| H01 | [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) |
| H02 | [Codex hooks reference](https://developers.openai.com/codex/hooks) |
| H03 | [OpenCode plugins reference](https://opencode.ai/docs/plugins) |
