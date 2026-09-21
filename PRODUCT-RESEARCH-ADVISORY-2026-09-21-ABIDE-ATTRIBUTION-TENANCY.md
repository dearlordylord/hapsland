# Abide attribution and tenancy patterns across agent hosts

**Status:** advisory research only. This report is not a product specification, does not authorize
a production dependency, and does not change the version-one adapter contract.

**Date:** 2026-09-21

**Issue:** [GitHub issue #37](https://github.com/dearlordylord/jevs/issues/37)

**Canonical path:** `PRODUCT-RESEARCH-ADVISORY-2026-09-21-ABIDE-ATTRIBUTION-TENANCY.md`

**Method:** [PRODUCT-RESEARCH-METHODOLOGY.md](./PRODUCT-RESEARCH-METHODOLOGY.md)

**Abide revisions compared:** pinned `ec3352e873163b74aca1ac9cf3bd0ea69a97723a` (2026-09-19,
CLI `0.0.5`, schema `0.0.3`) and latest upstream observed
`f2683828965ced03da07abae811e78af0383040c` (2026-09-20). The latter is the latest upstream
revision observed on 2026-09-21; it is not asserted to be a release.

**Boundary:** No paid review call, credential, live host installation, source-bearing response, or
external production mutation was used. The report inspects Abide source/tests and official host
contracts, and runs only deterministic offline tests with a no-key fixture. Host documentation is
living documentation and is separated from source/runtime evidence below.

## 1. Research brief

### Question

What reusable attribution and tenancy mechanisms exist in Abide for direct edits and
checkpoint-discovered changes across Claude Code, Codex, and OpenCode? In particular, can Abide
prevent cross-talk when agents X and Y concurrently edit one working root while a checkpoint
reconciliation is running? The dimensions in scope are:

* direct edit and shell/checkpoint-discovered change ownership;
* session, agent/subagent, canonical repository/worktree, turn, and intended advice recipient keys;
* concurrent hooks/workers sharing a root;
* queue/result ownership and feedback routing;
* singleton/resident versus fresh worker lifetimes;
* ambiguity, missing identity, cleanup, and expiry.

This is deliberately not a broad review of review tools or host ecosystems. The question is the
boundary between a host's lifecycle contract and Abide's state/checkpoint implementation.

### Existing-solution baseline and falsifier

The existing-solution baseline is to reuse Abide's host hooks, session state, first-write capture,
and Git tree snapshot instead of designing a new attribution protocol. That baseline would be
sufficient for this issue only if every relevant change had an authoritative owner or if an
explicit safe rule prevented an unowned root-wide snapshot from being addressed to multiple
concurrent agents.

The baseline would be overturned by a supported Abide/host path that records an authoritative
origin for shell and checkpoint-discovered paths, or by a live host contract that guarantees one
root per session and one owner per snapshot. Neither was found in the inspected revisions.

### Workflows and stopping condition

| ID | Workflow | Question answered |
|---|---|---|
| W1 | One session directly emits Edit/Write/apply_patch | Can Abide key the original file, turn, and feedback to that session? |
| W2 | A shell, script, or another process writes files without a direct edit hook | How does Stop discover the files, and who owns them? |
| W3 | X and Y concurrently edit one Git root | Does each recipient receive only its own advice? |
| W4 | Two hooks/workers update the same state or events file | Are writes atomic, serialized, and idempotent? |
| W5 | A host process restarts, a resident plugin unloads, or a hook times out | Does state survive, expire, or become ambiguous? |
| W6 | A root/worktree/cwd changes during a turn | Is the baseline and result still for the same canonical worktree? |
| W7 | A subagent edits under a parent session | Is the subagent an independent tenant or merely another event source? |

Stopping condition: inspect the pinned and latest Abide source/tests for all relevant state,
hook, host, Git, event, and replay paths; inspect current official lifecycle/input/output contracts
for Claude Code, Codex, and OpenCode; and run one deterministic X/Y same-root fixture. More
ecosystem comparison would duplicate the broad competitor review and would not resolve the
source-level ownership gap.

### Revision/change log

The pinned and current revisions have identical blobs for the attribution/lifecycle paths used in
this report: schema host/hooks/verdict, paths, session, events, regular-file writer, hook runner,
all four hooks, host installers, settings, Git snapshot, and tests. The current revision adds the
Jev retention-policy route/tests and related docs/gitignore/rubric changes; it does not add
host/worktree/agent keys or change the lifecycle reviewed here. Claims below therefore identify
the pinned source as the stable implementation evidence and name current revision `f268382` where
version separation matters.

## 2. Candidate inventory

| Candidate / stated use | Source class | Classification | Why included / boundary |
|---|---|---|---|
| Abide four command hooks plus shared session state | Existing implementation | **BORROW** patterns | It is the focal candidate; source and tests are inspectable and pinned. |
| Abide scratch-index Git checkpoint at Stop | Existing implementation | **BORROW** snapshot pattern; **REJECT** as attribution | It detects shell/untracked/deleted changes but has no per-origin ownership. |
| Abide `session_id` + `prompt_id`/`turn_id` directory key | Existing implementation | **REJECT** as complete tenancy key | It separates host sessions when identifiers are distinct, but omits host, root/worktree, agent, and snapshot identity. |
| Claude Code lifecycle/input hooks | Official host contract | **OPTIONAL INTEGRATION** | Supplies prompt/session, agent, worktree, and cleanup signals that Abide currently ignores. |
| Codex lifecycle/input hooks | Official host contract | **OPTIONAL INTEGRATION** | Supplies session/turn and subagent signals, but subagent hooks share parent session IDs and current Abide does not consume them. |
| OpenCode V1 plugin bridge | Official host contract + Abide adapter | **OPTIONAL INTEGRATION** | Supplies a resident session map and current directory, but Abide V1 ignores the plugin worktree and has weak cleanup. |
| OpenCode V2 plugin context/hooks | Official host contract | **OPTIONAL INTEGRATION** | Stronger project/workspace/session/agent concepts; the inspected Abide adapter is V1 and has no compatibility pin. |
| Abide Claude/Codex/OpenCode replay readers | Existing offline implementation | **OPTIONAL INTEGRATION** | Useful forensic import, not live attribution or queue ownership. |
| A new external tenancy/queue service | New dependency | **REJECT** for this research scope | No primary evidence that it solves same-root origin attribution; would expand product boundary and retention risk. |

No candidate met the evidence threshold for `DEPEND ON`. The classifications are advisory uses, not
decisions for the normative product specification.

## 3. Executive answer

**Abide has no reusable mechanism that solves the X/Y same-root failure case.** Direct edit checks
can be separated when X and Y provide distinct session and turn identifiers. Stop/checkpoint
reconciliation is different: each session snapshots the same Git root and compares its own
baseline to the same current tree. The snapshot contains paths and blobs, not the process, agent,
tool call, or session that caused each path to change. Both X and Y therefore receive the same
root-wide candidate set unless a caller supplies an external ownership rule.

The offline fixture below observed exactly that behavior with distinct session IDs: X's Stop event
listed both `x.ts` and `y.ts`, and Y's Stop event listed both files. No paid call was made; the
review skipped with `NO_API_KEY`, but path ownership and event routing were still observable.

The strongest reusable patterns are narrower:

1. First-write capture plus `(session_id, prompt_id/turn_id)` can retain direct-edit continuity.
2. A scratch Git index/tree gives a useful root-wide **change detector** for shell writes, adds,
   deletes, and changes outside direct edit hooks.
3. Per-process hooks are short-lived command workers; OpenCode's V1 plugin is a resident process
   with an in-memory session map and child hook workers.
4. The host contracts expose additional identity dimensions—Claude `agent_id`, worktree events,
   Codex subagent `agent_id`/`agent_type`, and OpenCode V2 project/workspace/session/agent
   concepts—but Abide does not persist or route them.

These patterns are useful evidence for a future host adapter, but they are not a product-owned
tenancy protocol.

## 4. Evidence ledger

Evidence was accessed or run on 2026-09-21. Source class and verification state are separate:
`SRC` = implementation/tests, `DOC` = official host documentation, `RUN` = deterministic runtime
fixture, `META` = revision/version metadata. States are `SOURCE-INSPECTED`, `DOCUMENTED`,
`RUNTIME-TESTED`, `INFERRED`, or `UNKNOWN`.

| ID | Exact proposition | Primary source / evidence | Class / state | Limitation or counterevidence |
|---|---|---|---|---|
| AT01 | Pinned Abide CLI is `0.0.5` and schema is `0.0.3`; current observed upstream is `f268382` and the attribution/lifecycle blobs are unchanged from pinned `ec3352e`. | [Pinned tree](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a); [current tree](https://github.com/coldteadotai/abide/tree/f2683828965ced03da07abae811e78af0383040c); local `git diff --name-status ec3352e f268382` | META/SRC / SOURCE-INSPECTED | Current is latest observed upstream, not a tagged release; docs/source may change after access. |
| AT02 | Supported Abide hosts are exactly `claude`, `codex`, and `opencode`. | [Pinned `packages/schema/src/host.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/host.ts) | SRC / SOURCE-INSPECTED | Host enum does not prove host runtime conformance. |
| AT03 | Common hook input has `session_id`, optional `prompt_id` and `turn_id`, optional transcript path, `cwd`, permission mode, and prompt; it has no `agent_id`, worktree, root identity, tool-call owner, or recipient field. `turnIdOf` chooses `prompt_id` then `turn_id`. | [Pinned `packages/schema/src/hooks.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/hooks.ts) | SRC / SOURCE-INSPECTED | Unknown host fields are not an Abide identity contract; schema permissiveness/stripping depends on the parser boundary. |
| AT04 | Verdict events contain check/skip/error/compile-needed information with `sessionId`, `promptId`, files, rules, verdicts, and blocked state; they do not contain host, canonical root/worktree, agent, tool-use, snapshot, or recipient identity. | [Pinned `packages/schema/src/verdict.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/verdict.ts) | SRC / SOURCE-INSPECTED | An event can be correlated externally, but Abide does not record that correlation. |
| AT05 | Global state is under `~/.abide`; repo-local rubric/events are under the discovered root's `.abide`. `findRepoRoot` walks to the nearest Git ancestor, with marker-file fallbacks. | [Pinned `packages/cli/src/lib/paths.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/paths.ts) | SRC / SOURCE-INSPECTED | Nearest Git ancestor is a useful root heuristic, not a canonical worktree/tenant identity. |
| AT06 | Turn state is `~/.abide/sessions/<safe(session_id)>/<safe(prompt_id || "turn")>`; `safe` replaces unsupported characters. The key omits host, root/worktree, agent, and baseline fingerprint. | [Pinned `packages/cli/src/lib/session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts) | SRC / SOURCE-INSPECTED | Distinct host IDs normally create distinct directories; same IDs across roots or hosts can collide. |
| AT07 | State captures source-bearing original file contents, prompt, baselines, checked blob IDs, blocked files, counters, and baseline status. First-write capture uses exclusive creation and marker counters; it is continuity state, not an ownership lease. | [Pinned `packages/cli/src/lib/session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts) | SRC / SOURCE-INSPECTED | Source retention creates privacy/expiry obligations; exclusive creation prevents duplicate first writes but cannot identify a different writer's shell change. |
| AT08 | Turn state is cleared after a clean Stop; blocked state remains for repair. Session directories older than seven days are pruned only when SessionStart runs. | [Pinned `session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts); [pinned `sessionStart.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/sessionStart.ts); [pinned `stop.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts) | SRC / SOURCE-INSPECTED | No SessionEnd hook is installed by Abide; an abandoned turn can remain until later startup pruning. |
| AT09 | Repo-local events are best-effort JSONL append records; invalid/torn lines are skipped. Events contain only optional session and prompt IDs plus phase/files/verdict details. | [Pinned `packages/cli/src/lib/events.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/events.ts); [pinned `regularFile.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/regularFile.ts) | SRC / SOURCE-INSPECTED | `O_APPEND` and sync writes help append safety, but there is no durable queue, claim, receipt, or concurrent live-worker proof; torn records are discarded. |
| AT10 | Abide launches four hook commands: SessionStart, UserPromptSubmit/turn-start, PostToolUse, and Stop. Hook runner deadlines finish silently and process exits; the command design is fresh-process per invocation. | [Pinned `packages/cli/src/abide-hook.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/abide-hook.ts); [pinned `hookRunner.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/hookRunner.ts); [pinned `settings.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/settings.ts) | SRC / SOURCE-INSPECTED | Fresh process is inferred from command installation and explicit exit; no live host process trace was run. |
| AT11 | Direct PostToolUse handling covers Edit, Write, MultiEdit, and `apply_patch`; it records originals and checks edits concurrently. | [Pinned `postToolUse.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/postToolUse.ts); [pinned `hooks.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/hooks.ts) | SRC / SOURCE-INSPECTED | The source list is only as reliable as the host's event delivery; direct edit feedback occurs after the edit. |
| AT12 | Stop snapshots the Git root at turn start and Stop, compares trees, and therefore sees all eligible net changes in the root—including shell writes, untracked files, and deletions—but does not know which session/agent made each path. | [Pinned `turnStart.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/turnStart.ts); [pinned `stop.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts); [pinned `git.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/git.ts) | SRC / SOURCE-INSPECTED | If root/cwd changes, baseline and Stop may refer to different roots; this is a source-level risk, not a claimed host observation. |
| AT13 | Abide runs checks per grouped file set with `Promise.all`; the request sent to the review backend carries task/files/diff, not session/root/agent/recipient identity. | [Pinned `checkRunner.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/checkRunner.ts); [pinned `jev.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/jev.ts) | SRC / SOURCE-INSPECTED | Backend provider metadata may exist outside the inspected request, but Abide does not use it for tenancy. |
| AT14 | The offline X/Y fixture used one temporary Git root, separate sessions/prompts, and `x.ts`/`y.ts`; each Stop event listed both files. Calls skipped with `no api key`; no source or credential was retained. | Sanitized runtime record in §8; compiled current Abide CLI, temporary `ABIDE_HOME_DIR`, deterministic no-key rule | RUN / RUNTIME-TESTED | This proves the observed source path and fixture, not every concurrent timing or host-specific hook delivery mode. |
| AT15 | Claude common hook input exposes `session_id`, `prompt_id`, transcript path, cwd, permission mode, and (newer versions) scratchpad; subagent hooks expose `agent_id`/`agent_type`. | [Claude Code hooks: input](https://code.claude.com/docs/en/hooks#common-input-fields); [subagent hooks](https://code.claude.com/docs/en/hooks#subagentstart); accessed 2026-09-21 | DOC / DOCUMENTED | Docs do not establish global uniqueness across roots/worktrees/restarts or what a third-party installer receives when fields are absent. |
| AT16 | Claude has lifecycle events for SessionStart/End, prompt submit/stop, tool pre/post, subagent start/stop, cwd change, worktree create/remove, and file changes. PostToolUse is after execution and cannot undo a file; FileChanged is the documented route for watcher-style changes. | [Claude lifecycle](https://code.claude.com/docs/en/hooks#hook-lifecycle); [PostToolUse](https://code.claude.com/docs/en/hooks#posttooluse); [FileChanged](https://code.claude.com/docs/en/hooks#filechanged); accessed 2026-09-21 | DOC / DOCUMENTED | Host contract offers signals Abide does not install or persist; exact behavior is version-sensitive. |
| AT17 | Claude Stop receives session context and can block/continue with feedback; SessionEnd is cleanup-oriented, has no decision control, and has a short default timeout. | [Claude Stop](https://code.claude.com/docs/en/hooks#stop); [SessionEnd](https://code.claude.com/docs/en/hooks#sessionend); accessed 2026-09-21 | DOC / DOCUMENTED | Abide does not install SessionEnd, and no live Claude installation was performed. |
| AT18 | Codex common input has session ID, transcript path, cwd, event name, and (for turn-scoped hooks) turn ID; subagent hooks expose agent ID/type but use the parent session ID. | [Codex hooks: common input](https://developers.openai.com/codex/hooks#common-input-fields); [SubagentStart](https://developers.openai.com/codex/hooks#subagentstart); accessed 2026-09-21 | DOC / DOCUMENTED | Docs do not guarantee an agent-level session key or identity semantics for all PostToolUse events. |
| AT19 | Codex hooks cover Bash and apply_patch; matching command hooks can run concurrently. Background hooks cannot block/approve/rewrite, may finish out of order, and unfinished output can be discarded at session end. | [Codex tool coverage](https://developers.openai.com/codex/hooks#tool-coverage); [concurrency/background hooks](https://developers.openai.com/codex/hooks#background-hooks); accessed 2026-09-21 | DOC / DOCUMENTED | The current Abide Codex adapter does not install the full subagent/SessionEnd surface and has no live Codex proof in this pass. |
| AT20 | Codex documents PostToolUse system messages/continue control but does not document the Claude-style top-level `decision:block` result for PostToolUse; Abide's generic output can therefore have a host-contract mismatch. | [Codex PostToolUse](https://developers.openai.com/codex/hooks#posttooluse); [Codex PreToolUse decisions](https://developers.openai.com/codex/hooks#pretooluse); [pinned `output.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/output.ts) | DOC/SRC / DOCUMENTED + SOURCE-INSPECTED | This is a documentation compatibility concern, not a claim that every Codex build rejects the output. |
| AT21 | OpenCode V1 loads local plugins from project/global plugin directories; plugin context includes `directory` and `worktree`, and events include session idle and tool execute hooks. | [OpenCode V1 plugins](https://opencode.ai/docs/plugins); accessed 2026-09-21 | DOC / DOCUMENTED | V1 docs do not fully specify multi-root plugin instance lifetime or every tool-after payload field. |
| AT22 | Abide's OpenCode V1 bridge is a resident plugin closure with an in-memory `Map` keyed by `sessionID`; it runs child hook processes, uses plugin `directory` as cwd, omits plugin `worktree`, follows one follow-up on idle, and does not delete map state on idle/session deletion. | [Pinned `packages/cli/opencode/abide.mjs`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/opencode/abide.mjs) | SRC / SOURCE-INSPECTED | A plugin restart loses the map while disk state can remain; a `Map` is not a durable queue or ownership lease. |
| AT23 | OpenCode V2 documents plugin location/project metadata, session IDs, permission hooks with session/agent/source IDs, tool-after results, cleanup return functions, and version compatibility requirements; current Abide V1 does not consume these fields. | [OpenCode V2 build plugins](https://opencode.ai/v2/docs/build/plugins); [OpenCode V2 plugins/config](https://opencode.ai/v2/docs/plugins); accessed 2026-09-21 | DOC / DOCUMENTED | V2 compatibility with the installed Abide V1 plugin is untested; V2 source/versions are not a dependency decision. |
| AT24 | Replay readers can recover session/cwd/directory from Claude transcripts, Codex rollout metadata, and OpenCode SQLite rows, but they only reconstruct host records after the fact and do not assign shell-origin ownership. | [Pinned replay directory](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/replay); pinned `replayClaude.ts`, `replayCodex.ts`, `replayOpencode.ts` | SRC / SOURCE-INSPECTED | Forensic reconstruction is optional and incomplete; shell writes are absent from the inspected replay paths. |
| AT25 | Existing deterministic Abide tests pass for hooks, sessions, hosts, settings, events, and the current test suite, but they do not assert same-root X/Y ownership. | External clone: `pnpm --filter @coldtea/abide test -- --run test/session.test.ts test/hook.test.ts test/hosts.test.ts test/settings.test.ts test/events.test.ts`; 104 tests passed | RUN / RUNTIME-TESTED | Vitest selected the package's full 23-file suite; no live paid/backend or host hook was used. |

### Evidence interpretation

AT03–AT14 establish the implementation gap. AT15–AT23 show that host contracts offer useful
additional signals, not that Abide currently uses them. AT24 is deliberately classified as
forensic/optional rather than a live tenancy solution. AT25 establishes deterministic offline
health, not ownership correctness.

## 5. Abide core candidate card

### Identity and storage

The core key is effectively:

```text
~/.abide/sessions/safe(session_id)/safe(prompt_id ?? turn)
```

The repository root is computed at operation time from `cwd` or the first edited file. It is not
stored in the turn key or event. The same session ID used with two roots can therefore collide;
different IDs used in one root do not collide in the turn directory, but still share the same
filesystem and Git tree at Stop. No agent/subagent, worktree, host, tool-use, snapshot, or advice
recipient key is persisted.

### Direct edits

On an edit event, Abide chooses the root, creates the session/turn directory, records the original
file on first write, and checks the resulting edit. Edit checks can be associated with the session
and turn when the host provides stable identifiers. The check result is emitted to the current hook
caller, not claimed by a durable queue. Concurrent edits are checked with `Promise.all`; this is
parallelism, not a per-owner lease.

### Checkpoint-discovered changes

At turn start, a Git repository gets a scratch-index baseline. At Stop, Abide snapshots the current
root and diffs the trees. This catches shell/script writes, adds, deletes, and changes made by a
different worker. It is a good net-change detector. It cannot establish origin because a Git tree
stores content/path state, not the process/session/agent/event that changed it. A no-Git fallback
only knows files captured by direct edit hooks, so it is less complete and still has no shell owner.

### Concurrency and queue ownership

First-write files use exclusive creation and counter marker files, which avoids two workers both
claiming the same original content in the ordinary direct-edit path. The implementation has no
root-level lock, snapshot claim, owner lease, epoch, or durable result queue. JSONL event append is
best effort. Two root-wide Stops can each review the same net change and emit independent feedback.

### Lifetime, cleanup, and privacy

Claude/Codex-style installations execute short-lived Node hook commands. OpenCode V1 keeps a
resident plugin map but spawns child hook commands. Clean Stops delete turn state; blocked turns
remain for repair; stale session top-level state is pruned after seven days only when a later
SessionStart runs. Original file content and prompts are stored in global state. Git scratch trees
create ordinary Git objects that are not removed when the scratch index is deleted. These are
operational and privacy facts, not a complete retention policy.

**Card decision:** **BORROW** first-write and checkpoint patterns; **REJECT** the exact
`session_id`-only key and root-wide Stop result as a product tenancy mechanism.

## 6. Per-host candidate cards

### Claude Code

**Contract.** Official hooks identify a session, prompt, cwd, transcript, permission mode, and
tool-use context. Current documentation also exposes subagent `agent_id`/`agent_type`, CwdChanged,
WorktreeCreate/Remove, FileChanged, SessionStart/End, prompt/stop, and tool pre/post events. A
PostToolUse event is after a successful tool operation: a block can add feedback to the model but
cannot undo the already executed file change. The docs explicitly distinguish tool hooks from
watcher-style file changes and provide FileChanged for changes not attributable to an edit tool.

**Abide fit.** The installed hook set has SessionStart, prompt/turn, Edit/Write/MultiEdit/apply_patch
PostToolUse, and Stop. It does not install Claude's SubagentStart/Stop, CwdChanged,
WorktreeCreate/Remove, FileChanged, or SessionEnd. It accepts no `agent_id` and does not store
worktree identity. Consequently a direct main-agent edit can have session/turn continuity, while a
subagent or shell/file-watcher change falls into the shared root snapshot.

**Feedback and cleanup.** Stop can return blocking feedback and Claude can continue the turn;
SessionEnd would be the natural cleanup signal but Abide does not register it. PostToolUse feedback
is post-operation and cannot guarantee a repair before another worker touches the same root.

**Decision:** **OPTIONAL INTEGRATION** for richer host signals. A future adapter could borrow
`agent_id`, worktree lifecycle, FileChanged, and SessionEnd, but this report does not recommend
depending on their undocumented uniqueness or treating a root snapshot as agent-owned.

### Codex

**Contract.** Official hooks expose session ID, transcript path, cwd, event name, and turn ID for
turn-scoped hooks. Bash and apply_patch are covered. SubagentStart/Stop expose agent ID/type, but
subagent hooks use the parent session ID. Multiple matching commands can run concurrently.
Background hooks cannot block/approve/rewrite and may finish out of order; unfinished output may be
discarded at session end. SessionEnd is main-thread cleanup and does not steer the thread.

**Abide fit.** The Codex installer configures the four generic Abide commands only. It does not
install subagent or SessionEnd hooks and the schema drops/ignores agent identity. Thus a subagent
can share the parent session key, while a same-root sibling session still gets its own turn key but
the Stop snapshot remains root-wide.

**Feedback and contract risk.** Codex documents PostToolUse messages/continue behavior and
PreToolUse permission decisions. It does not document Claude's top-level `decision:block` result
for PostToolUse in the inspected current docs. Abide's generic output path emits a block-shaped
decision for a blocked edit, so live Codex conformance must be proven before treating that output
as reliable routing or enforcement. This report did not install Codex or make a paid call.

**Decision:** **OPTIONAL INTEGRATION** for explicit turn/subagent lifecycle signals after versioned
conformance. Do not use Codex's parent-session subagent key as proof of per-agent tenancy.

### OpenCode

**V1 contract and adapter.** OpenCode V1 loads project/global plugins and gives the plugin
`directory`, `worktree`, project, client, and shell context. Abide's plugin closure is resident and
keys a `Map` by OpenCode `sessionID`; it starts a session, turns, direct Edit/Write after hooks, and
Stop on session idle. It resolves files against `directory`, does not pass `worktree` to Abide,
and maps tool calls to session/prompt/cwd without an agent key. It allows one follow-up prompt on a
block and skips its own `Abide:` repair prompt. Idle/session deletion does not clear the map.

**V2 contract.** Current OpenCode V2 documentation adds project metadata with canonical directory,
workspace/location context, session IDs, permission hooks with session/agent/source identifiers,
tool-after results, and unload cleanup. The V2 docs require testing against the target OpenCode
version and describe V1 compatibility, but the current Abide source is a V1 bridge with no adapter
version pin or V2 field mapping.

**Decision:** **OPTIONAL INTEGRATION**. Borrow the resident-plugin lifecycle and V2 identity fields
only behind an explicit adapter/version contract. Do not treat the V1 in-memory map or `directory`
alone as durable worktree tenancy.

## 7. Capability and ownership matrix

| Dimension | Abide pinned/current | Claude official contract | Codex official contract | OpenCode V1/V2 contract |
|---|---|---|---|---|
| Direct edit key | Session + prompt/turn directory; no agent/root | Session + prompt + tool; agent for subagent hooks | Session + turn; agent only on subagent hooks, parent session | V1 session map; V2 session/agent/source hooks |
| Shell/checkpoint discovery | Stop Git tree diff; no origin | FileChanged/watcher contract exists, but Abide ignores it; Stop still root-wide | Bash PostToolUse exists, but Abide's Stop remains root-wide | Event/tool hooks exist; Abide V1 direct paths only, Stop root-wide |
| Canonical root/worktree | Nearest Git ancestor from cwd; not stored in key | cwd plus worktree create/remove signals | cwd; no Abide worktree key | V1 exposes directory + worktree; Abide uses directory; V2 project canonical directory |
| Agent/subagent | Not accepted/persisted | `agent_id`, `agent_type` available in subagent hooks | `agent_id`, `agent_type`; parent session ID | V2 agent/session/source; V1 Abide ignores agent |
| Advice recipient | Current hook stdout/model context | Host event recipient/model; no Abide durable receipt | Host hook output/session/turn; PostToolUse shape needs conformance | V1 session map + one follow-up; V2 result/permission context |
| Concurrent workers | Direct first-write exclusivity; no root snapshot lease | Host may run multiple hooks; Abide does not claim ownership | Matching hooks can run concurrently; background out-of-order | Resident map + child workers; no durable claim |
| Worker lifetime | Fresh command per installed hook (inferred) | Host invokes hook commands | Host invokes hook commands | Resident plugin plus fresh child hook commands |
| Queue/result ownership | Best-effort JSONL; no queue/receipt | Host lifecycle only; Abide no queue | Host output delivery rules; Abide no queue | In-memory map; no durable queue |
| Cleanup/expiry | Clean Stop deletes turn; 7-day startup prune; source/Git objects remain | SessionEnd available but not installed | SessionEnd available; background output can discard | No map cleanup on idle/delete; restart loses map |
| X/Y same-root answer | **Fails** for checkpoint files | Host signals could improve direct attribution, not current Abide | Host signals could improve direct attribution, not current Abide | V2 could improve metadata, not current V1 bridge |

The host columns document available signals, not a claim that Abide currently receives or preserves
them. A missing/ambiguous field must not be silently replaced with another tenant's identity.

## 8. Deterministic X/Y runtime fixture

The fixture ran compiled current Abide source in an external clone of Abide. It created a temporary
Git root and temporary Abide home, configured one local rule with no API key, and invoked:

1. `turn-start(session_id=X, prompt_id=tx)`;
2. `turn-start(session_id=Y, prompt_id=ty)`;
3. write `x.ts` and `y.ts` in the same root;
4. `stop(session_id=X, prompt_id=tx)`;
5. `stop(session_id=Y, prompt_id=ty)`.

The sanitized output was:

```json
{
  "fixture": "two sessions X/Y, one git root, two files, no API key",
  "events": [
    {"kind":"skip","phase":"turn","sessionId":"X","files":["x.ts","y.ts"],"reason":"no api key"},
    {"kind":"error","phase":"turn","sessionId":"X","files":[],"reason":"NO_API_KEY"},
    {"kind":"skip","phase":"turn","sessionId":"Y","files":["x.ts","y.ts"],"reason":"no api key"},
    {"kind":"error","phase":"turn","sessionId":"Y","files":[],"reason":"NO_API_KEY"}
  ]
}
```

This is a path-ownership result, not a paid verdict. It contains no source content or credential.
It directly disconfirms the proposition “distinct Abide session IDs are sufficient to route
checkpoint-discovered same-root changes.”

The same external clone's deterministic package suite passed 104 tests across 23 test files,
including session, hook, host, settings, and event tests. Those tests establish implementation
health but contain no assertion that X and Y receive disjoint root-wide snapshots.

## 9. Queue, feedback, and ambiguity analysis

### Direct versus root-wide observations

| Observation | Safe attribution rule suggested by evidence | Why |
|---|---|---|
| Host supplied direct edit + session/turn + path | Attribute to that event owner, subject to stable root/worktree validation | Abide first-write state and direct check have session/turn continuity. |
| Host supplied agent identity | Preserve it as a separate dimension; do not collapse into session | Claude/Codex expose agent signals that Abide currently discards. |
| Stop sees a changed path only in a shared root | Mark origin/recipient **unknown or mixed**; aggregate once at root if a later policy permits | Git tree proves net change, not origin. Sending the same advice to X and Y is cross-talk. |
| A path is changed by both X and Y between checkpoints | Mark shared/mixed ownership; no individual clean receipt | No inspected Abide field establishes last writer or causality. |
| cwd/root/worktree differs from baseline | Do not reuse the prior baseline; require a new validated tenant/checkpoint | Abide computes root again but does not store or compare a canonical root identity. |
| Worker times out, state is corrupt, or append is torn | Emit incomplete/unknown coverage and retain no false clean result | Hook runner is fail-silent and event parser skips invalid lines. |

### Queue and result ownership

Abide has no durable queue protocol. Hook stdout is delivered by the host; repo-local JSONL is an
audit-ish stream; session files are continuity state. There is no claim token, lease, event ID,
acknowledgement, retry count, delivery receipt, or result owner containing root/agent/snapshot
identity. `Promise.all` groups checks but does not make their results idempotent across two Stops.

For a product-owned adapter, “checked” and “delivered to recipient” would need to be separate
states. A backend result must be associated with an immutable owner tuple and a snapshot digest;
otherwise X can receive Y's result even if the underlying verdict is valid for the same bytes.

### Worker lifetime

Fresh hook processes reduce resident-memory contamination but require durable state and atomic
claims. OpenCode V1's resident map makes session routing convenient but loses state on plugin
restart and lacks idle/deletion cleanup. Neither lifetime model supplies origin attribution for a
shared root. A future adapter should explicitly declare worker lifetime and recovery behavior rather
than infer tenancy from process identity.

### Cleanup and expiry

The seven-day startup prune is a useful bounded cleanup pattern, but it applies to global session
directories and is not tied to SessionEnd or a root/worktree. Source-bearing originals and prompts
remain until the turn is cleared/pruned. Git scratch objects can outlive state. OpenCode in-memory
state has no source-level expiry. Therefore “state deleted” cannot be treated as “source erased” or
“all advice delivery stopped.”

## 10. Synthesis, disconfirmation, and sufficiency

### Convergent patterns

* **Host event identity is richer than Abide's identity.** Every host exposes at least a session
  or turn signal; Claude and Codex expose subagent identity, and OpenCode V2 exposes project and
  source/tool identity. Abide's common schema intentionally normalizes only session/turn/cwd.
* **Checkpoint detection and attribution are different capabilities.** The scratch tree is a
  credible way to discover net changes; it is not an origin ledger.
* **A root is not a tenant.** Multiple sessions, subagents, or hooks can share a Git root. A
  nearest-Git-root heuristic cannot safely route recipient-specific feedback.
* **Fresh and resident workers have opposite operational risks.** Fresh workers need claims and
  durable state; resident workers need restart/reload cleanup and durable recovery.
* **Host feedback semantics differ.** Claude PostToolUse feedback is post-operation; Codex's
  current documented decision surface differs; OpenCode V1 appends one follow-up. A generic
  “block” output cannot be assumed portable.
* **Cleanup is layered.** Turn state, event receipts, source-bearing originals, and Git objects
  have different lifetimes. One seven-day directory prune is not an erasure contract.

### What would disconfirm the conclusion?

The X/Y conclusion would be weakened if a live, version-pinned Abide run demonstrated that its Stop
path receives a host-provided per-agent changed-file manifest, or if a host guaranteed no concurrent
agents can modify one root and provided a durable root/session ownership lock. Neither condition is
present in the source or tested fixture. A future live matrix should test two real host sessions,
one root, direct edits and shell writes, subagents, restart, cwd/worktree changes, and feedback
delivery. This report intentionally does not claim those unrun host behaviors.

### Sufficiency result

The inspected evidence is sufficient to answer the bounded question: Abide's current generic
session key is insufficient for shared-root checkpoint attribution; the current root-wide Stop
path can cross-talk. It is not sufficient to choose a product tenancy protocol, guarantee host
versions, or declare a host adapter production-ready.

## 11. Prototype/specification implications (advisory handoff)

These are research implications for issue #36 and later specification work, not accepted
requirements. Each item names the evidence and the disposition to preserve.

| ID | Implication to carry forward | Evidence / uncertainty | Classification |
|---|---|---|---|
| H1 | Define a canonical owner tuple that includes host, canonical repository/worktree identity, session, optional agent/subagent, turn/prompt, tool event, and checkpoint/snapshot identity. Missing dimensions must be explicit unknowns. | AT03, AT05–AT07, AT12, AT15, AT18, AT21–AT23; uniqueness and host version semantics remain unknown. | **BORROW** the dimensions exposed by hosts; **REJECT** `session_id` alone. |
| H2 | Keep direct-edit attribution separate from root-wide discovery. For a checkpoint-only path with no origin, aggregate/dedupe once or route only to an explicitly chosen root recipient; never copy advice to every concurrent session by default. | AT12, AT14, §9; no Abide origin ledger. | **BORROW** Git snapshot for detection; **REJECT** per-session fan-out. |
| H3 | Persist canonical root/worktree and baseline fingerprint, and invalidate/reseed when cwd/worktree/root changes. | AT05, AT12, AT16, AT21, AT23; worktree identity normalization is an open design question. | **BORROW** host worktree signals optionally; no dependency yet. |
| H4 | Model fresh-worker and resident-plugin recovery explicitly: atomic claim/lease, idempotent event ID, durable receipt, timeout/incomplete state, restart recovery, and no false clean result. | AT09–AT10, AT19, AT22, §9; no live crash matrix. | **BORROW** lifecycle patterns; **REJECT** process identity as ownership. |
| H5 | Separate “observed,” “reviewed,” “feedback delivered,” and “recipient acknowledged.” Carry owner tuple plus snapshot digest in every result/receipt. | AT04, AT09, AT13, AT22; no Abide queue/receipt. | **BORROW** event/audit idea; **REJECT** best-effort JSONL as a queue. |
| H6 | Define ambiguity policy: if the path cannot be assigned to one owner, mark unknown/mixed and surface bounded aggregate advice; do not invent X or Y. | AT14, §9; product policy decides whether aggregate advice is permitted. | **BORROW** incomplete semantics; **REJECT** silent fallback. |
| H7 | Separate retention classes: source-bearing originals/prompts, source-free digests, receipts, and Git objects; cleanup must be explicit and observable. | AT07–AT08, Git snapshot source, §9; legal/privacy period is unresolved. | **BORROW** bounded cleanup intent; **REJECT** seven-day startup prune as a complete erasure policy. |
| H8 | Treat host adapters as versioned contracts with conformance fixtures. Claude, Codex, and OpenCode feedback/agent/worktree fields cannot be normalized by names alone. | AT15–AT23; live installs were not run. | **OPTIONAL INTEGRATION** until version gates pass; no `DEPEND ON` declared here. |
| H9 | OpenCode integration should map V1 `worktree`/directory and V2 canonical project/session/agent fields, or state that the adapter is intentionally directory-scoped. | AT21–AT23; V1/V2 compatibility and installed target version are unknown. | **OPTIONAL INTEGRATION**, not a core tenancy dependency. |

### Implications for issue #36

Issue #36 should not treat “per-session advice” as solved merely because Abide creates a
session-named directory. Its acceptance criteria should cover the X/Y same-root case, distinct
agent/subagent identity, canonical worktree changes, unowned shell writes, duplicate/concurrent
results, worker restart, feedback delivery, and expiry. The smallest safe prototype should make
the unknown/mixed result visible and prove that one root-wide snapshot is not delivered to both
recipients. A host-specific adapter may add richer identity later, but it should not silently
upgrade Abide's generic `session_id` key into a global tenant key.

## 12. Classifications summary

| Stated use | Classification | Boundary |
|---|---|---|
| Abide first-write capture for direct edit continuity | **BORROW** | Useful source/turn continuity when host IDs are valid; not origin attribution for shell writes. |
| Abide scratch-index/tree diff for net-change discovery | **BORROW** | Detection only; do not copy its root-wide result to every session. |
| Abide `session_id`/prompt directory as complete tenant key | **REJECT** | Missing host/root/agent/worktree/snapshot identity and collision protection. |
| Abide best-effort JSONL events as queue/result ownership | **REJECT** | No claim, receipt, owner tuple, retry, or guaranteed append/replay. |
| Claude agent/worktree/FileChanged/SessionEnd signals | **OPTIONAL INTEGRATION** | Useful adapter inputs; no dependency without versioned conformance. |
| Codex Bash/subagent/SessionEnd/turn signals | **OPTIONAL INTEGRATION** | Useful adapter inputs; parent-session subagent key is not per-agent tenancy. |
| OpenCode V1 resident plugin bridge | **OPTIONAL INTEGRATION** | Keep version/lifetime boundary explicit; current bridge ignores worktree/agent. |
| OpenCode V2 canonical project/session/agent hooks | **OPTIONAL INTEGRATION** | Investigate only with target-version fixture and explicit V1/V2 adapter boundary. |
| Abide replay readers | **OPTIONAL INTEGRATION** | Forensic reconstruction, not live queue/ownership. |
| New external tenancy/queue service | **REJECT** | Out of scope and unsupported by evidence; no need to add a dependency to answer issue #37. |

**`DEPEND ON`: none in this advisory.** Host-specific signals may become gates in a later
specification, but the current evidence does not justify making any Abide or host path a product
dependency.

## 13. Exact unknowns and residual risks

1. No live Claude, Codex, or OpenCode hook/plugin installation was run; documented fields may differ
   in installed versions or under subagents.
2. The global uniqueness and restart persistence of host session/prompt/turn/agent IDs are not
   established by the host docs inspected.
3. Codex's exact PostToolUse acceptance of Abide's generic block output needs a version-pinned live
   conformance test.
4. OpenCode V1 plugin instance scope across multiple project roots and the actual `tool.execute.after`
   payload's agent fields are not fully specified by the V1 page; V2 migration was not tested.
5. The offline fixture does not vary timing, simultaneous Stop calls, process crash, append tearing,
   root rename, nested Git repositories, or multiple worktrees.
6. Abide's source-bearing state and Git object retention need a separate privacy/retention decision;
   seven-day startup pruning is not enough evidence for deletion guarantees.
7. Official docs are current at access date, not immutable runtime proof. Pin host versions and retain
   sanitized conformance fixtures before relying on any field.

## 14. Limitations and no-go claims

This report does not claim that Abide is generally unsafe, that host IDs are globally unstable, or
that host-specific integrations cannot solve attribution. It claims only that the inspected Abide
revisions do not record enough information to attribute a root-wide checkpoint to X versus Y, and
that the deterministic same-root fixture reproduces the resulting cross-talk. It does not select a
normative product design, add a dependency, run a paid review, or promise universal host coverage.

## 15. Primary-source index

### Abide pinned/current implementation

* [Pinned source tree at `ec3352e`](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a)
* [Current observed source tree at `f268382`](https://github.com/coldteadotai/abide/tree/f2683828965ced03da07abae811e78af0383040c)
* [Schema host](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/host.ts)
* [Schema hooks](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/hooks.ts)
* [Schema verdicts](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/verdict.ts)
* [State paths](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/paths.ts)
* [Session state](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts)
* [Events](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/events.ts)
* [Regular-file writer](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/regularFile.ts)
* [Turn start](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/turnStart.ts)
* [PostToolUse](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/postToolUse.ts)
* [Stop](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts)
* [Git snapshot](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/git.ts)
* [Hook runner](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/hookRunner.ts)
* [Host installers](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/hosts.ts)
* [OpenCode bridge](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/opencode/abide.mjs)

### Official host contracts (accessed 2026-09-21)

* [Claude Code hooks](https://code.claude.com/docs/en/hooks)
* [Codex hooks](https://developers.openai.com/codex/hooks)
* [OpenCode V1 plugins](https://opencode.ai/docs/plugins)
* [OpenCode V2 plugin construction](https://opencode.ai/v2/docs/build/plugins)
* [OpenCode V2 plugin configuration and compatibility](https://opencode.ai/v2/docs/plugins)

### Repository methodology and adjacent context

* [Research methodology](./PRODUCT-RESEARCH-METHODOLOGY.md)
* [Pinned Abide research](./RESEARCH-ABIDE-2026-09-19.md)
* [Abide lifetime research](./RESEARCH-ABIDE-LIFETIME-2026-09-20.md)
