# Shell/script-written change detection advisory

**Status:** advisory research and planning only. This report does not change the normative product
specification, version-one scope, adapter contract, or implementation.

**Date:** 2026-09-20
**Canonical path for this pass:** `PRODUCT-RESEARCH-ADVISORY-2026-09-20-SHELL-WRITE-DETECTION.md`
**Method:** [PRODUCT-RESEARCH-METHODOLOGY.md](./PRODUCT-RESEARCH-METHODOLOGY.md)
**Issue:** [GitHub issue #4](https://github.com/dearlordylord/jevs/issues/4)
**Repository revision inspected:** `5bf7b3e6e0910e0acc00c1fe77bb1fd409e340e6`

**Boundary:** This pass is advisory research only. It makes no version-one change, adds no
production dependency, installs no host hook, and makes no paid Jev call. The lifecycle probe and
manifest prototype were run and are retained below. The recommendation is deliberately bounded by
that evidence: one Linux arm64/headless Codex `0.155.1` environment, one local working tree, and a
measured authoritative catch-up envelope through 1,000 small files under a 5-second candidate scan
budget. Ten-thousand-file scans took 11.8–20.8 seconds and are not a realtime per-Bash envelope
without optimization. It is a later-version scope to take to specification, not a production
authorization or a universal interception promise.

## 1. Research brief

### Question and current boundary

Can a later version of the product detect and review relevant working-tree changes made through
shell commands, scripts, generators, renames, deletions, or other paths that do not provide the
current edit adapter with an authoritative file list?

Version one is intentionally narrower. The normative Codex contract accepts successful
`apply_patch` events and explicitly rejects inference from arbitrary Bash syntax. The adapter source
returns no review request for any other tool, and its test names shell-mediated writes as unsupported.
Issue #4 is post-first-version research and is not a completion condition for issue #3.

The target is reliable **net-change discovery at declared checkpoints**, not universal interception.
The product cannot truthfully promise to observe every intermediate write, identify which process or
human caused it, or review a file while an arbitrary command is still modifying it.

### Representative workflows

| ID | Workflow | Required result for a later bounded scope |
|---|---|---|
| W1 | `printf`, redirection, `sed -i`, or a script modifies one eligible source file | For every emitted `PostToolUse(Bash)` event, regardless of exit status, detect the final changed snapshot after command completion and no later than the next supported catch-up checkpoint |
| W2 | A generator adds, modifies, renames, and deletes several files | Discover every eligible final path; represent rename safely as delete plus add if identity is uncertain |
| W3 | A long-running unified-exec command writes over time | State explicitly that review occurs after command completion; do not promise mid-command latency |
| W4 | An autonomous goal continues without another human prompt | Reconcile at the retained `Stop` lifecycle point after automatic continuations; the evidence supports a bounded Codex 0.155.1 claim, not every future autonomous-goal mode |
| W5 | The repository is already dirty at session start | Compare against a session/checkpoint baseline, not against `HEAD` or the real index |
| W6 | A file changes during scan or review | Mark the attempted result stale/incomplete, retain the newer change as pending, and reconcile again |
| W7 | A separate Git worktree is active | Isolate consent, baseline, locks, and receipts by canonical working-tree identity |
| W8 | The process restarts or state is corrupt | Never invent coverage; seed a new baseline or resume only from validated, compatible state |

The initial later-version research target remains Codex on the exact evidence release `codex-cli 0.155.1`, one local Git working
tree, configured regular source files, and advisory feedback. Nested repositories, submodule
worktrees, writes outside the working tree, device/FIFO/socket content, and universal attribution are
excluded unless a later specification deliberately adds them.

### Existing-solution baseline and falsifiers

The baseline is to reuse an existing host or VCS change report rather than build reconciliation.
That preference would win if a supported host event supplied an authoritative resulting path/snapshot
set for every relevant write, or if an existing dependency met the product's dirty-baseline,
privacy-filter, worktree, restart, bounded-latency, and failure-reporting requirements.

It would overturn the recommendation below if a future Codex release provides a versioned
post-operation change-set contract, or if the future declaration extractor requires a durable
before/after representation that cannot be derived safely from source-free checkpoint metadata.

### Discovery queries, inclusion, and exclusion

This pass inspected issue #4, issue #3, the current adapter/contract/tests/evidence, configuration and
snapshot behavior, the declaration-extraction advisory, official Codex hook documentation, official
Git status/diff/file-list documentation, Node filesystem-watch documentation, Chokidar source/docs,
and the pinned Abide snapshot implementation already evaluated in this repository. Discovery covered
four materially different mechanisms: host reporting, checkpoint reconciliation, VCS reporting, and
filesystem notification. A follow-up pass produced only combinations/optimizations of those classes,
so the bounded stopping condition was met. This is not an ecosystem-completeness claim.

The actual discovery queries and repository searches were:

| Source | Query or search expression |
|---|---|
| Issue tracker | `repo:dearlordylord/jevs #4 shell script changes detection`; `repo:dearlordylord/jevs #3 Codex adapter hook` |
| Codex documentation | `site:developers.openai.com/codex/hooks PostToolUse Bash Stop UserPromptSubmit tool coverage` |
| Git documentation | `site:git-scm.com/docs git-status porcelain v2 untracked ignored rename`; `site:git-scm.com/docs git-diff raw rename`; `site:git-scm.com/docs git-ls-files --others --exclude-standard` |
| Filesystem APIs | `site:nodejs.org/api/fs.html fs.watch caveats inode network filesystem`; `github chokidar README awaitWriteFinish atomic write` |
| Existing implementations | `github abide git add -A write-tree scratch index turnStart stop`; repository search `rg -n "PostToolUse|Stop|snapshot|scratch index|fs\\.watch|chokidar|git diff|shell" .` |
| Existing research | `rg -n "candidate|inclusion|exclusion|BORROW|DEPEND ON|OPTIONAL INTEGRATION|REJECT" PRODUCT-RESEARCH-*.md RESEARCH-*.md` |

General inclusion criteria were: (a) operates at the agent-host, working-tree checkpoint, VCS, or
filesystem-observation boundary; (b) has a primary source that exposes its contract or implementation;
(c) can inform at least one of the declared workflows W1–W8; and (d) can be classified as BORROW,
DEPEND ON, OPTIONAL INTEGRATION, or REJECT. General exclusion criteria were: (a) content rules or
review engines that do not discover changed paths; (b) editor-only APIs with no headless lifecycle;
(c) claims supported only by secondary summaries; and (d) mechanisms whose source persistence or
security boundary is incompatible with the declared product scope.

Serious exclusions were recorded explicitly: generic linters/review bots and CI-only gates have no
local checkpoint authority; IDE/editor file APIs do not cover autonomous/headless host execution;
backup/synchronization and content-addressable tools retain source beyond the source-free manifest
boundary; mtime-only scanners cannot establish content identity; other agent hosts were not compared
because this bounded pass is Codex-specific and lacks comparable retained evidence; and shell AST
analyzers were considered only as the command-parsing candidate because intent is not resulting
filesystem state. These exclusions are scope decisions, not findings that the excluded systems are
universally unsuitable.

### Discovery and stopping condition

This pass completed the bounded runtime work needed for the issue decision: the pinned Codex
lifecycle probe and the offline source-free manifest prototype. The retained runs cover the
declared host/checkpoint question and the product-policy correctness fixtures; they do not claim
interactive issue-4 PTY behavior, a separate unified-exec/`write_stdin` transport, process-restart
recovery, a 100,000-file tree, HDD-like storage, another OS/architecture, or another host. The
stopping condition was reached when the retained mechanism classes (host lifecycle, product-owned
manifest, Git reporting/private-index evidence, filesystem notifications, and command parsing) had
been compared and the completed evidence chose a bounded scope. No source-bearing fixture,
credential, production hook, or paid Jev call was retained.

### Change log and relationship to prior research

The prior untracked working draft `RESEARCH-SHELL-WRITE-DETECTION-2026-09-20.md` was renamed to this
methodology-conforming canonical path; it is not retained as a competing current report. This pass
supersedes no previously canonical report. It narrows the shell-write question from
[JEV-RESEARCH-CODEX-EXTENSIONS-2026-09-19.md](./JEV-RESEARCH-CODEX-EXTENSIONS-2026-09-19.md),
reuses the pinned Abide evidence in
[RESEARCH-ABIDE-2026-09-19.md](./RESEARCH-ABIDE-2026-09-19.md), and coordinates—but does not adopt—the
artifact contract proposed by
[RESEARCH-DECLARATION-EXTRACTION-2026-09-20.md](./RESEARCH-DECLARATION-EXTRACTION-2026-09-20.md).

## 2. Candidate inventory and decisions

| Candidate / stated use | Class | Inclusion reason | Advisory decision |
|---|---|---|---|
| Codex `PostToolUse(Bash)` plus `Stop`/session lifecycle | Agent-host API | Available triggers around shell completion and turn completion | **DEPEND ON**, conditionally, as Codex reconciliation triggers after pinned-version conformance |
| Product-owned eligible-path/content manifest | Host-neutral checkpoint reconciliation | Handles a dirty baseline without storing source or trusting command syntax | **BORROW** snapshot/reconciliation patterns and implement behind a product contract |
| Abide private-index Git tree snapshots | Existing review integration / VCS snapshot | Demonstrates shell-write and deletion recovery at Stop | **BORROW** complete-or-incomplete semantics; **REJECT** the exact source-persisting mechanism for this product |
| Git porcelain status/diff/file listing | Adjacent VCS mechanism | Stable machine-readable path/status/rename information and useful optimization | **OPTIONAL INTEGRATION** for candidate discovery/diagnostics; **REJECT** as the sole correctness baseline |
| Node `fs.watch` / Chokidar | Filesystem observation | Can reduce discovery delay in a persistent process | **OPTIONAL INTEGRATION** as a wake-up hint only; **REJECT** as a coverage authority |
| Shell-command/path parsing | Host-adapter heuristic | Can recognize a few common redirection/generator forms cheaply | **REJECT** as authoritative discovery; an optional non-security hint must always be reconciled |

No new npm runtime dependency is recommended by this pass. The product already requires a
discoverable Git working tree for consent, but the proposed correctness mechanism should not depend
on Git object creation or Chokidar delivery.

## 3. Evidence ledger

Evidence was accessed 2026-09-20. `DOC`, `SRC`, `RUN`, `ISSUE`, and `META` are source classes;
`DOCUMENTED`, `SOURCE-INSPECTED`, `RUNTIME-TESTED`, `INFERRED`, and `UNKNOWN` are verification states.

| ID | Exact proposition | Evidence | Class / state | Limitation |
|---|---|---|---|---|
| E01 | Issue #4 declares shell/script discovery post-first-version research, asks for host/VCS/filesystem comparison, and forbids a universal-interception promise. | [Issue #4](https://github.com/dearlordylord/jevs/issues/4) | ISSUE / DOCUMENTED | The issue is project intent, not runtime behavior. |
| E02 | Contract v1 reviews canonical `apply_patch` only; Bash has the original command but no authoritative resulting-file set. | [CODEX-ADAPTER-CONTRACT-v1.md](./CODEX-ADAPTER-CONTRACT-v1.md), supported path and ledger | SRC / SOURCE-INSPECTED + RUN / RUNTIME-TESTED at Codex 0.155.1 | The retained Bash fixture proves that version/scenario, not every shell or future host version. |
| E03 | The current adapter returns `undefined` unless `tool_name === "apply_patch"`; the test explicitly declares shell-mediated writes unsupported. | [`src/adapters/codex.ts`](./src/adapters/codex.ts), `toReviewRequest`; [`src/adapters/codex.test.ts`](./src/adapters/codex.test.ts) | SRC / SOURCE-INSPECTED | Tests were not rerun in this research-only pass. |
| E04 | Current Codex documentation says `PostToolUse` observes Bash, unified exec, `apply_patch`, MCP, and most local function tools; unified exec delivers its post event when the command finishes; specialized paths may opt out. | [Codex hooks, tool coverage](https://developers.openai.com/codex/hooks#tool-coverage) | DOC / DOCUMENTED | Living documentation; must be pinned and runtime-tested for the supported release. |
| E05 | A `PostToolUse` input names the tool and carries tool-specific input/output, not a host-normalized resulting filesystem change set. | [Codex hooks, common input and `PostToolUse`](https://developers.openai.com/codex/hooks#posttooluse); E02 | DOC / DOCUMENTED + RUN / RUNTIME-TESTED for the retained 0.155.1 Bash fixture | Absence in this contract does not preclude a future host API. |
| E06 | `Stop` includes `turn_id` and `stop_hook_active`; blocking a Stop creates an automatic continuation. `UserPromptSubmit` is a distinct event. | [Codex hooks, `Stop`](https://developers.openai.com/codex/hooks#stop); [Codex hooks, `UserPromptSubmit`](https://developers.openai.com/codex/hooks#userpromptsubmit) | DOC / DOCUMENTED | Documentation does not establish which events fire in the product's autonomous-goal workflow. |
| E07 | A retained Codex 0.155.1 headless probe saw `Stop` across two automatic continuations (three attempts total) and only the initial `UserPromptSubmit`. | [`issue-4-lifecycle-2026-09-20.json`](./evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json), `stop-automatic-continuation` | RUN / RUNTIME-TESTED | This is a bounded two-continuation fixture, not a guarantee for every autonomous-goal mode or future host release. |
| E08 | Git porcelain status is stable for scripts, can NUL-terminate raw paths, and reports tracked, untracked, ignored, and rename/copy records when requested. | [Git status porcelain v2](https://git-scm.com/docs/git-status#_porcelain_format_version_2) | DOC / DOCUMENTED | Status compares with index/`HEAD`, not an arbitrary dirty session baseline. Rename/copy is similarity classification, not durable identity. |
| E09 | `git ls-files --others` enumerates untracked paths; `--exclude-standard` applies Git's standard ignore sources. | [Git `ls-files`](https://git-scm.com/docs/git-ls-files) | DOC / DOCUMENTED | The product intentionally does not load `.gitignore` as review policy, so this enumeration can omit product-eligible ignored source. |
| E10 | Git diff compares trees, index, worktree, blobs, or filesystem paths and provides raw/rename formats. | [Git diff](https://git-scm.com/docs/git-diff) | DOC / DOCUMENTED | It needs a suitable baseline. The real index/`HEAD` cannot isolate changes made after an already-dirty session start. |
| E11 | Abide copies the real index to a private scratch index, runs `git add -A`, writes a tree, and diffs start/end trees; its Stop path treats timeout/failure as incomplete rather than judging a partial turn. | [Pinned `git.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/git.ts); [pinned `turnStart.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/turnStart.ts); [pinned `stop.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts) | SRC / SOURCE-INSPECTED | `git add`/`write-tree` writes eligible source blobs into the repository object database; removing the scratch index does not clean those objects. |
| E12 | The repository's prior Abide pass ran deterministic tests covering shell writes/deletes and incomplete snapshots, but not a real host. | [RESEARCH-ABIDE-2026-09-19.md](./RESEARCH-ABIDE-2026-09-19.md), A06/R01 | RUN / RUNTIME-TESTED in that pass | Evidence applies to pinned Abide, not this product or live Codex delivery. |
| E13 | Node documents `fs.watch` as platform-dependent and sometimes unavailable/unreliable; filenames may be absent, inode replacement can lose later events, and network/virtualized filesystems are problematic. | [Node `fs.watch` caveats](https://nodejs.org/api/fs.html#caveats) | DOC / DOCUMENTED | Exact behavior varies by OS/runtime/filesystem and needs a matrix if adopted. |
| E14 | Chokidar normalizes events and offers atomic-write and write-finish options, but write-finish delays are workload-dependent and polling can cost CPU. | [Chokidar README](https://github.com/paulmillr/chokidar/blob/main/README.md); [write-finish implementation](https://github.com/paulmillr/chokidar/blob/main/src/index.ts) | DOC + SRC / SOURCE-INSPECTED | A library can reduce platform differences but cannot turn notifications into a complete historical ledger. No version/license/dependency gate was run. |
| E15 | Product configuration uses repository-relative selection, accumulated privacy exclusions, protected path/type/size/regular-file gates, and explicitly does not load `.gitignore`. | [docs/configuration.md](./docs/configuration.md) | SRC / SOURCE-INSPECTED | This is current normative configuration behavior; broader discovery would need an explicit specification decision to change it. |
| E16 | The current review path captures a content hash and rereads before delivery; a changed snapshot returns `stale_snapshot`. | [`src/runtime/review.ts`](./src/runtime/review.ts), `reviewPath` | SRC / SOURCE-INSPECTED | It protects one known path after dispatch; it does not discover unknown changed paths. |
| E17 | The declaration-extraction advisory proposes stable artifact identity, current range, exact source hash, projection hash, and bounded context rather than a permanent full-file review unit. | [RESEARCH-DECLARATION-EXTRACTION-2026-09-20.md](./RESEARCH-DECLARATION-EXTRACTION-2026-09-20.md), H1–H4 | SRC / DOCUMENTED advisory | Candidate contract, not an accepted specification or implementation. |
| E18 | Current consent deliberately treats a separate Git worktree as a separate repository identity. | [`src/cli.test.ts`](./src/cli.test.ts), separate-worktree case; [ADR 0001](./docs/adr/0001-repository-scoped-backend-consent.md) | SRC / SOURCE-INSPECTED | The future checkpoint-state key and storage location are not specified. |
| E19 | The installed Codex host is `@openai/codex` version `0.155.1` and its package metadata declares `Apache-2.0`. | [npm package record for `@openai/codex@0.155.1`](https://www.npmjs.com/package/@openai/codex/v/0.155.1); installed package metadata inspected in the isolated host | META / SOURCE-INSPECTED | Package metadata establishes version/license only; it does not establish hook runtime behavior or long-term support. |
| E20 | The research environment provides Git `2.39.5`; Git's v2.39.5 distribution is GPL-2.0-or-later. | [`git --version`](https://git-scm.com/docs/git-version); [Git v2.39.5 `COPYING`](https://github.com/git/git/blob/v2.39.5/COPYING) | META / DOCUMENTED | The observed Git version is environment metadata, not a selected product dependency or compatibility guarantee. |
| E21 | The pinned headless lifecycle runner exercised successful Bash, nonzero Bash with a side effect, a delayed final-state write, normal Stop, two Stop-driven continuations, and external SIGINT; its retained assertions passed 69/69 and the replay exited `0`. | [`issue-4-lifecycle-2026-09-20.json`](./evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json); replay `node evidence/codex/0.155.1/probe/issue-4-lifecycle.mjs` | RUN / RUNTIME-TESTED | Linux arm64, `codex-cli 0.155.1`; the numeric nonzero exit is not structured in the hook payload, separate `write_stdin`/unified-exec transport and interactive issue-4 PTY were not exercised, and restart/kill recovery was not tested. |
| E22 | The regenerated source-free prototype passed 12 deterministic scenarios, including dirty baselines, add/modify/delete/rename-as-delete-plus-add, product-eligible ignored/untracked files, mixed-extension partial excludes, exact reverts, nonregular files, unstable reads, late concurrent adds, failures, duplicate triggers, restart state, and separate worktrees. | [`summary.json`](./experiments/shell-write-detection/evidence/summary.json), [`records.jsonl`](./experiments/shell-write-detection/evidence/records.jsonl); replay `node --experimental-strip-types experiments/shell-write-detection/run.ts --write-evidence` | RUN / RUNTIME-TESTED | The concurrent-add tree-quiescence and mixed-extension regression fixtures passed. This validates only the captured experiment policy and source-free prototype, not full product policy/consent, multiprocess locking, writes during review, or over-budget behavior. |
| E23 | The regenerated prototype retained ten benchmark rows: 243-file actual repository plus 1,000- and 10,000-file synthetic trees, each with cold/warm and one-/multi-file change phases. | [`summary.json`](./experiments/shell-write-detection/evidence/summary.json); [`experiments/shell-write-detection/README.md`](./experiments/shell-write-detection/README.md) | RUN / RUNTIME-TESTED | Timings are one machine-dependent Linux arm64 sample. The measured 1,000-file rows are 273.29–4,170.15 ms; 10,000-file rows are 11,779.49–20,753.68 ms and are not a realtime per-Bash envelope. No 100,000-file or HDD-like matrix was run. |

### Completed evidence and explicit limitations

The originally planned lifecycle, prototype, and benchmark work is now represented by E21–E23.
The following table records what the evidence establishes and what remains intentionally untested;
an untested item is a limitation, not an implied failure or a gate to close this advisory.

| Evidence area | Retained result | Explicit limitation |
|---|---|---|
| Lifecycle | E21: headless event traces and source-free file digests retained; 69/69 assertions passed and replay exit status was `0`. | Interactive issue-4 PTY, separate unified-exec/`write_stdin`, restart/resume, and kill/terminal-close behavior remain unexecuted. |
| Detection correctness/privacy/state | E22: the regenerated run passed 12/12 offline scenarios; incomplete scans did not advance state, protected sentinel reads were zero, tree-quiescence caught late adds, mixed-extension filtering preserved eligible siblings, and restart/worktree identity behavior was exercised. | Production process locks, host hook installation, write-during-review, and cross-process crash recovery remain future work. |
| Performance | E23: the regenerated run has 10 rows with wall/CPU time, bytes read, content reads, state size, and change counts. | The envelope supports a candidate ≤1,000-small-file/5-second scan budget on this Linux arm64 host; 10,000-file rows are too slow for realtime per-Bash use, and no 100,000-file, HDD-like, filesystem, or cross-platform matrix was run. |
| Declaration extraction | No extraction implementation or runtime handoff was needed to answer issue #4. | Extraction remains an advisory follow-up and is not a completion gate or production authorization. |

## 4. Comparable candidate cards

### 4.1 Codex lifecycle events

**Role and contract.** `PostToolUse(Bash)` is a low-delay trigger after the tested shell command
completion. `Stop` is the broad catch-up trigger observed after two automatic continuations.
`SessionStart` can seed state. `UserPromptSubmit` is not sufficient as the only baseline trigger:
the retained continuation fixture emitted it only once while emitting three `Stop` attempts
(E04–E07, E21).

**Failure and composition.** A missing hook, killed process, unsupported specialized tool, interrupt,
or host exit can leave a gap. Multiple hook invocations and processes can race over the same state.
The adapter therefore needs atomic claims/locks, idempotent event IDs, and an explicit
`incomplete/coverage-unknown` receipt. Hooks should trigger reconciliation, not themselves assert
which paths changed. Backend failure remains advisory/fail-open and must not advance an unreviewed
snapshot as if it were reviewed; detection state and review-delivery state must be separate.

**Decision: `DEPEND ON`, bounded to the tested Codex trigger surface.** The agent-host boundary is
the product's current target. A later specification may use headless `PostToolUse(Bash)` as an
optional early trigger and `Stop` as the authoritative catch-up trigger for the tested release;
upgrade conformance, restart behavior, and any interactive support remain separate gates.

### 4.2 Product-owned eligible-path/content manifest

**Shape.** At a validated checkpoint, enumerate paths beneath the canonical worktree, apply the exact
captured product selection/protected gates before reading content, and record source-free metadata for
eligible regular files: normalized relative path, file kind/mode as needed, content identity, policy
digest, checkpoint/session identity, and scan completion. Compare the next complete manifest to
derive `added`, `modified`, and `deleted`. Treat a rename as delete plus add unless a separate
presentation heuristic proves useful.

The digest must be computed from a stable read. A bounded `lstat/read/lstat` or existing
`SnapshotReader`-style operation should reject symlink swaps, oversize files, and changes during the
read. If any selected subtree/path cannot be enumerated or any eligible file cannot be stabilized
within the budget, the checkpoint is **incomplete**; it must not silently publish a partial clean
result.

**State and concurrency.** Persist manifests atomically under user-owned state keyed by canonical
worktree plus host session. Separate the last **observed** checkpoint from the last **reviewed**
snapshot per path. A later checkpoint must rediscover writes that happened during review. On corrupt,
missing, incompatible-policy, or expired state, seed a new baseline and disclose that earlier writes
were not reconstructed.

**Privacy and operations.** Directory entry names and local digests remain local but are still
sensitive metadata; use owner-only permissions, bounded retention, atomic replacement, and no source
text. Do not hash/read excluded source. A full eligible sweep costs traversal plus content reads, so
the retained prototype benchmarks cold/warm trees and establishes an explicit budget/incomplete
outcome for the bounded host envelope.
Host/VCS/watcher hints may narrow an early scan, but a Stop catch-up sweep must remain the coverage
authority for the declared scope.

**Decision: `BORROW` complete/incomplete snapshot reconciliation and take the bounded manifest
contract to specification.** The regenerated prototype supports the shape, including tree
quiescence and mixed-extension filtering, within the captured experiment policy; it does not
authorize production implementation.

### 4.3 Git reporting and private-index trees

Git porcelain is valuable for machine-safe path discovery, staged/unstaged status, deletions, and
rename hints (E08–E10). It is not enough alone: a dirty worktree needs an arbitrary session baseline,
standard untracked enumeration omits ignored paths, and another process can alter the index.

Abide proves a stronger shape: a scratch index can snapshot the complete nonignored working tree and
later produce a turn diff (E11/E12). Its complete-or-incomplete rule is worth borrowing. Its exact
mechanism is a poor product default because `git add -A` and `write-tree` place source blobs in the
repository object store, including previously untracked source. Their cleanup follows Git object
reachability/garbage collection rather than the product's retention policy. It also inherits Git
ignore semantics that are not the product's selection contract (E09/E15).

**Decision:** `OPTIONAL INTEGRATION` for candidate-path acceleration, diagnostics, and rename display;
`BORROW` Abide's failure semantics; `REJECT` private-index trees as the default source-of-truth
implementation. The private-index mechanism is an existing comparison reference, not a required
issue-completion experiment or future dependency.

### 4.4 Filesystem observation

Node and Chokidar can wake a persistent process quickly and coalesce editor/generator patterns, but
the documented portability, inode, missing-filename, network filesystem, atomic-write, and polling
trade-offs prevent a coverage guarantee (E13/E14). A short-lived hook process also cannot observe
between invocations without introducing a daemon, which issue #3 explicitly left out of scope.

**Decision: `OPTIONAL INTEGRATION` as a future latency optimization only.** Every event must be treated
as a dirty hint followed by manifest reconciliation. Overflow/error/restart must force a full sweep.
Do not add Chokidar until a persistent-process requirement and dependency gates are accepted.

### 4.5 Shell-command parsing

Parsing can cheaply recognize a few forms such as a literal redirect, but shells permit variables,
subshells, functions, interpreters, build tools, generated manifests, process substitution, and
arbitrary child processes. The command describes intent, not the resulting filesystem state, and a
failed command can still have side effects (current Codex documentation now says Bash
`PostToolUse` also runs after nonzero exit).

**Decision: `REJECT` as authoritative detection.** If retained at all, parsing is an optimization hint
whose output is reconciled and never used to widen source egress or claim complete coverage.

### 4.6 Dimension-complete comparable cards

The narrative cards above are retained for rationale. The following compact cards provide the ten
methodology dimensions in the required order. `UNKNOWN` means the pass did not establish the behavior;
`N/A` means the dimension does not apply to the candidate's stated use. Runtime-tested claims cite
E21–E23; unexecuted cases remain explicit limitations rather than inferred results.

#### Card A — Codex lifecycle events

| Dimension | Assessment |
|---|---|
| 1. Identity and role | `@openai/codex` / `codex-cli 0.155.1`, agent-host API; research target for the Codex boundary. Package license: **Apache-2.0** (E19). This is a conditional host integration, not an authorized new product dependency (E04–E07, E21). |
| 2. Lifecycle | Headless `PostToolUse(Bash)` followed command completion in the retained success, nonzero-side-effect, and delayed-write cases; `Stop` ran after normal turns and two blocked continuations. Product rule: process every emitted Bash post-event regardless of exit status. Separate unified-exec/`write_stdin` and interactive issue-4 behavior are unexecuted (E21). |
| 3. Canonical contract | Tool name plus tool-specific input/output; no host-normalized resulting path set. The product uses events only as reconciliation triggers. Host decision algebra for this stated use: **UNKNOWN**; no path authority is claimed (E05). |
| 4. Failure behavior | External SIGINT produced `Interrupt` and `SessionEnd` without `PostToolUse(Bash)`, leaving a one-byte partial fixture; desired product receipt is incomplete/coverage-unknown and advisory fail-open. Hook timeout/crash and restart recovery were not exercised in E21. |
| 5. Extension model | Hook commands are configured at the host boundary. Rule/plugin discovery, packaging, trust, and independent versioning are **UNKNOWN** for this use; no host extension dependency is selected. |
| 6. Composition | Multiple hook processes require idempotency, locks, and event identity. The retained lifecycle run does not exercise shared product state, so install order, collision handling, and concurrent host composition remain **UNKNOWN**. |
| 7. State | Host supplies session/turn identifiers, but not the product's dirty baseline. Checkpoint and reviewed state must be product-owned; retention and re-entry behavior are **UNKNOWN** until specified. |
| 8. Security and privacy | Hook payload may contain tool input/output; source/secret egress, credentials, and project-local weakening are **UNKNOWN** for the future detector. The hook must not widen the existing selection/privacy gates (E15). |
| 9. Portability | Evidence target is Linux Codex 0.155.1 in interactive/headless modes. Other Codex releases, operating systems, and other agent hosts are **UNKNOWN/N/A** for this bounded pass. |
| 10. Operations | Expected value is low-delay trigger plus Stop catch-up. E21 retains per-case duration and event timing, but these are host-run observations, not a production timeout guarantee. Scan cost is measured separately in E23. |

#### Card B — Product-owned eligible-path/content manifest

| Dimension | Assessment |
|---|---|
| 1. Identity and role | Internal host-neutral checkpoint/reconciliation contract; version and license: **N/A** (not an external dependency). Stated use is product-owned net-change discovery (E15–E16, provisional). |
| 2. Lifecycle | Candidate host events trigger scans; Stop catch-up is observed in the retained headless fixture, including two automatic continuations. The claim is bounded to E21; restart seeding and separate unified-exec/`write_stdin` remain unexecuted. |
| 3. Canonical contract | Advisory `ReconciliationCheckpoint` shape records policy/worktree identity, complete/incomplete status, and added/modified/deleted stable snapshots. Schema, aggregation, and conflict precedence are **NOT SETTLED** (section 7). |
| 4. Failure behavior | Stable-read failure, enumeration error, and concurrent mutation produced incomplete/coverage-unknown; corrupt/incompatible restart seeds a disclosed baseline reset. Tree-quiescence and mixed-extension regression fixtures pass (E22). Timeout, unwritable storage, and process-boundary failures remain future production fixtures. |
| 5. Extension model | Reuses product selection, exclusion, protected-path/type/size, and regular-file policy. Plugin discovery, executable rule packaging, and user override trust are **N/A/UNKNOWN** for this detector (E15). |
| 6. Composition | Atomic state replacement, duplicate-trigger idempotence, restart compatibility checks, and separate-worktree identities were exercised in E22. Per-worktree/session locks and multi-process races remain future production work. |
| 7. State | Source-free observed baseline, reviewed snapshot state, policy digest, checkpoint identity, and pending newer snapshots are proposed. E22 exercises compatible/corrupt/incompatible restart state, but retention, migration, and re-entry behavior remain **UNKNOWN** until specification. |
| 8. Security and privacy | No source text persisted in the retained prototype; an excluded sentinel had zero content reads and was absent from persisted/emitted results. Paths, sizes, and digests remain sensitive metadata; production retention and ownership policy remain to specify (E22). |
| 9. Portability | The tested envelope is one local Git worktree and regular files on Linux arm64. Symlinks/nonregular files are skipped in E22; nested repositories, submodules, sparse checkouts, case-insensitive filesystems, and network mounts remain outside the selected scope. |
| 10. Operations | E23 measures traversal/read cost, cold/warm behavior, bytes read, state size, and CPU/wall time for 243-, 1,000-, and 10,000-file fixtures. On this host, the candidate authoritative envelope is up to 1,000 small files under a 5-second scan budget; 10,000-file rows are 11.8–20.8 seconds. |

#### Card C — Abide private-index Git tree snapshots

| Dimension | Assessment |
|---|---|
| 1. Identity and role | Abide snapshot/turn hooks at commit `ec3352e873163b74aca1ac9cf3bd0ea69a97723a`, existing review integration/VCS mechanism. License: **UNKNOWN/not assessed**; not a proposed runtime dependency (E11–E12). |
| 2. Lifecycle | Pinned source uses turn-start and Stop paths to create/diff snapshots; prior retained tests cover shell writes/deletes. Exact live host delivery and exit-status behavior for this product: **UNKNOWN**. |
| 3. Canonical contract | Private index, `git add -A`, tree write, and start/end tree diff; complete/incomplete turn semantics are the reusable contract. Git's path/rename semantics are inherited; product rule aggregation is **N/A**. |
| 4. Failure behavior | Pinned source treats timeout/failure as incomplete rather than partial clean (E11); killed-process, crash recovery, and host enforcement remain **UNKNOWN** for this product. |
| 5. Extension model | Abide configuration and rule packaging are outside this stated discovery use; user rule trust/versioning: **UNKNOWN/N/A**. |
| 6. Composition | Scratch-index ownership can collide with concurrent Git/index operations; install order and multiple hook composition: **UNKNOWN**. |
| 7. State | Start/end tree IDs and scratch index state provide a baseline, but Git object storage persists source blobs. Retention/cleanup follows Git reachability, not product policy (E11). |
| 8. Security and privacy | Source enters `.git/objects`, including previously untracked eligible files; this violates the proposed source-free detector retention boundary. Credential/remote egress: **UNKNOWN**. |
| 9. Portability | Depends on Git and its index/object semantics; OS/filesystem matrix and separate-worktree edge behavior: **UNKNOWN**. |
| 10. Operations | Prior deterministic tests are carried-forward evidence only; no current real-host run or benchmark was performed. Maintenance, integration, and replacement cost: **UNKNOWN** (E12). |

#### Card D — Git porcelain status/diff/file listing

| Dimension | Assessment |
|---|---|
| 1. Identity and role | Git command-line interfaces as an adjacent VCS mechanism; `git 2.39.5` was observed in the research environment, but no product version is selected. Git license is GPL-2.0-or-later per [the v2.39.5 COPYING file](https://github.com/git/git/blob/v2.39.5/COPYING); optional integration, not a new dependency (E08–E10). |
| 2. Lifecycle | No host lifecycle events; commands run when invoked by a detector. Whether each invocation sees a stable worktree under concurrent mutation is **UNKNOWN**. |
| 3. Canonical contract | Porcelain v2/NUL paths, status records, untracked/ignored enumeration, and raw/rename diff forms are documented. Product checkpoint aggregation and arbitrary session baseline are **NOT PROVIDED** (E08–E10). |
| 4. Failure behavior | Command errors, index locks, races, and partial output require explicit handling; exact fail-open/closed behavior for the proposed integration is **UNKNOWN**. |
| 5. Extension model | Git ignore/exclude configuration influences standard enumeration but is not the product selection policy. Plugin/discovery packaging for this use: **N/A**. |
| 6. Composition | Real index, worktree, branch changes, and concurrent Git processes can interfere. Collision/idempotence semantics for a product scanner: **UNKNOWN**. |
| 7. State | `HEAD`/index/worktree comparisons are documented, but they do not represent an arbitrary dirty session baseline. A private baseline would require a separate state design (E08–E10). |
| 8. Security and privacy | Status/diff can operate without creating new blobs, but standard ignore behavior can omit product-eligible files; credentials/remote access are **N/A/UNKNOWN** for local commands. |
| 9. Portability | Requires Git and a compatible working tree; supported Git versions, sparse/nested repositories, and filesystem edge cases are **UNKNOWN** beyond the cited interface documentation. |
| 10. Operations | Machine-readable output is useful for acceleration/diagnostics. E22/E23 test the optional hint plus catch-up path and measure its current fixture cost; false-negative behavior outside the product-policy replay and index-lock cost remain **UNKNOWN**. |

#### Card E — Node `fs.watch` / Chokidar notifications

| Dimension | Assessment |
|---|---|
| 1. Identity and role | Node built-in `fs.watch` plus Chokidar as an optional filesystem-observation layer; exact Node/Chokidar version and license are **N/A/UNKNOWN** because no watcher dependency is selected. The cited docs/source are living references (E13–E14). |
| 2. Lifecycle | Persistent process receives change/rename notifications; short-lived hooks cannot observe between invocations. Command exit/Stop semantics are **N/A** to the watcher and host delivery is **UNKNOWN**. |
| 3. Canonical contract | Event names and optional paths are hints; missing filenames, coalescing, and atomic-write behavior mean no authoritative change-set schema. Product decision algebra is **N/A**. |
| 4. Failure behavior | Platform caveats, inode replacement, overflow, network/virtualized filesystem behavior, and polling cost can lose or delay events. Recovery policy must force a full sweep; exact runtime matrix is **UNKNOWN** (E13–E14). |
| 5. Extension model | Watch globs, polling, atomic-write, and await-write-finish options are configuration knobs. Rule/plugin trust and packaging are **N/A**. |
| 6. Composition | Multiple watchers may duplicate/coalesce events; watcher order, locks, and process restart behavior are **UNKNOWN**. Every notification remains a dirty hint. |
| 7. State | Watchers provide no historical baseline; product manifest state must own checkpoint/review history. Watch history after restart is lost or **UNKNOWN**. |
| 8. Security and privacy | Watch events need not read content, but downstream reconciliation controls source/secret access. Path-name exposure and consumer egress are **UNKNOWN**. |
| 9. Portability | Node documents platform/filesystem variation; Chokidar normalizes some behavior but cannot provide cross-platform coverage authority (E13–E14). |
| 10. Operations | Potential latency reduction and event coalescing are documented; no watcher was implemented or benchmarked, so CPU/polling and write-finish budget remain **UNKNOWN** and are not part of the bounded scope. |

#### Card F — Shell-command/path parsing

| Dimension | Assessment |
|---|---|
| 1. Identity and role | Host-adapter heuristic for shell syntax; parser version/license: **N/A**, no dependency selected. Stated use is optional hint only, never authoritative discovery. |
| 2. Lifecycle | Can inspect a command at a host event, but cannot observe arbitrary child processes or writes after parsing. Event emission and exit-status timing are inherited from Codex and **UNKNOWN** (E04–E07). |
| 3. Canonical contract | Produces syntax/intent tokens, not resulting path/content snapshots; no valid change-set or decision algebra for this boundary. |
| 4. Failure behavior | Variables, subshells, functions, interpreters, process substitution, generators, failed commands with side effects, parse errors, and shell dialects create false negatives/positives. Exact error policy is **UNKNOWN**. |
| 5. Extension model | User-configured patterns could expand syntax coverage, but executable rule trust and packaging are **N/A/UNKNOWN**; no parser adoption is recommended. |
| 6. Composition | Shell expansion and child-process composition defeat local parsing; multiple tools and wrappers are **UNKNOWN**. Any hint must be reconciled and deduplicated by the manifest. |
| 7. State | No baseline/history; parser output cannot establish dirty-start, restart, or write-during-review state. **N/A** without a separate manifest. |
| 8. Security and privacy | Commands can contain secrets and paths; parsing must never widen source/credential egress. Exact redaction behavior is **UNKNOWN**; reject as a security or coverage authority. |
| 9. Portability | Shell dialects, operating systems, interpreters, and command wrappers vary; portability is **UNKNOWN**. |
| 10. Operations | Parsing may be cheap, but coverage/latency trade-offs are **UNKNOWN** and no benchmark is warranted while authoritative use is rejected. |

## 5. Capability and decision matrices

### Capability matrix

| Capability | Host event | Product manifest | Git status/diff | Private Git tree | `fs.watch`/Chokidar | Command parsing |
|---|---|---|---|---|---|---|
| Trigger after supported shell completion | DOCUMENTED E04 | N/A | N/A | N/A | Persistent process only E13/E14 | Uses host trigger |
| Dirty session baseline | No | Feasible, INFERRED from E15/E16 | No, E08–E10 | SOURCE-INSPECTED E11 | No historical baseline | No |
| Product-eligible ignored file | Event has no path, E05 | Feasible under product walk, INFERRED E15 | Omitted by standard exclusions, E09 | Normally omitted, E11 | Potentially, but unreliable E13/E14 | UNKNOWN |
| Add/modify/delete | No authoritative set, E05 | Feasible by manifest comparison, INFERRED | DOCUMENTED E08–E10 | SOURCE-INSPECTED E11 | Event hints, DOCUMENTED E13/E14 | UNKNOWN |
| Rename identity | No | Delete + add safely | Similarity record, DOCUMENTED E08/E10 | Git heuristic | Event-dependent | UNKNOWN |
| Detect writes during review | Later trigger only | Next reconciliation, INFERRED with E16 | Next query | Next snapshot | Hint only | No |
| Restart truthfulness | Host IDs only | Feasible with validated state/incomplete result | Current state only | Persisted tree ID possible | Watch history lost | No |
| Avoid persistent source copy | Yes | Yes if metadata-only | Yes for status/hash-only use | **No**, E11 | Yes | Yes |
| Cross-platform coverage authority | No, host-specific | Prototype required | Git-dependent | Git-dependent | **No**, E13/E14 | **No** |

Cells marked `INFERRED` are architecture conclusions, not runtime proof.

### Decision matrix

| Component and use | BORROW | DEPEND ON | OPTIONAL INTEGRATION | REJECT |
|---|---:|---:|---:|---:|
| Codex lifecycle as triggers | Event IDs, fail-open semantics | **Conditional yes** | — | As path authority |
| Product manifest reconciliation | **Yes** | Internal code, not external candidate | — | — |
| Git porcelain | Machine-safe path/status formats | — | **Yes** | Sole baseline |
| Abide snapshot design | Complete/incomplete and catch-up concepts | — | — | Scratch-index source persistence as default |
| Node/Chokidar watch | Dirty-hint/reconcile pattern | — | **Later only** | Coverage authority |
| Command parsing | — | — | Non-security hint at most | **Authoritative use** |

## 6. Conditional dependency gates: Codex lifecycle

The completed evidence separates gates needed to recommend a bounded later-version scope from
future production-conformance work. Documentation alone is insufficient for a supported release;
the statuses below describe exactly what the retained run established.

| Gate | Mandatory for bounded advisory? | Current status | Evidence / limitation | Future specification or production check |
|---|---:|---|---|---|
| License/API availability | Yes | PASS | `@openai/codex@0.155.1` metadata is Apache-2.0 and the documented hook surface is available (E04–E06, E19). | Recheck on every selected host upgrade. |
| Real-host lifecycle conformance | Yes | PASS | E21 retained bounded headless Linux arm64 traces for Bash, Stop, continuation, and Interrupt; interactive issue-4 PTY is outside the scope. | Re-run on the selected upgrade; interactive issue-4 PTY is not included. |
| Long-running command semantics | Yes | PASS | E21 observed a delayed direct-Bash write only at its final two-byte snapshot. Separate unified-exec/`write_stdin` transport is excluded from this bounded scope. | Specify final-state-only semantics; add transport-specific conformance only if supported later. |
| Interrupt/exit/restart gaps | Yes | PASS | E21 characterized the bounded interrupt gap: external SIGINT produced no `PostToolUse(Bash)` and left a partial final file. Recovery is explicitly deferred and excluded from this scope. | Define incomplete/coverage-unknown recovery and test process-boundary behavior before production. |
| Multiple hook/process composition | No | UNRESOLVED | Existing hook evidence shows multiple handlers can coexist, but E21/E22 do not establish shared manifest locks or out-of-order event handling. This is non-mandatory for the bounded advisory. | Add lock/idempotence/process-boundary tests if production scope is authorized. |
| Source/credential/privacy boundary | Yes | PASS | Temporary homes/repositories, no retained transcripts, and E22 protected-sentinel assertions establish the retained research boundary. | Revalidate layered product selection/consent and retention before production; the prototype policy is a narrowed stand-in. |
| Failure/degradation behavior | Yes | PASS | E22 retained bounded offline unstable-read, enumeration/read failure, and corrupt/incompatible state behavior. Timeout, unwritable state, and killed-hook paths are unexecuted production limitations. | Define fail-open receipts and test all accepted storage/process failures. |
| Version maintenance ownership | No | UNRESOLVED | This report pins the observed release only and does not assign a long-term upgrade owner. This is non-mandatory for the bounded advisory. | Assign compatibility ownership and an upgrade probe in specification. |
| Integration/replacement cost and fallback | No | UNRESOLVED | The prototype interface is host-triggerable, but no production adapter, hook installation, or fallback contract exists. This is non-mandatory for the bounded advisory. | Specify the host-neutral reconciliation seam and process cost before implementation. |

No Chokidar dependency gate is warranted unless a later specification selects a persistent watcher.

## 7. Recommended later-version architecture

### Recommendation

Adopt a **trigger plus reconciliation** design:

1. Codex lifecycle events say **when to look**, never **what changed**.
2. A product-owned, source-free manifest of eligible stable snapshots says what net content changed
   since the last complete checkpoint.
3. The existing review runtime or the future declaration extractor reads only the resulting eligible
   paths, under the captured configuration/consent contract.
4. Review completion is checked against snapshot identity. Concurrent later writes remain pending for
   the next reconciliation.
5. Receipts distinguish `complete`, `incomplete`, `skipped`, `reviewed`, `stale`, and
   `coverage-unknown`; no clean result is synthesized from a partial scan.

The evidence-backed later-version envelope is intentionally narrow:

- Codex `0.155.1` on the tested Linux arm64/headless surface only;
- `Stop`-authoritative reconciliation after the observed automatic continuations, with each emitted
  `PostToolUse(Bash)` treated as a possible early trigger regardless of command success;
- an authoritative Stop catch-up walk through the measured **1,000-small-file envelope under a
  5-second candidate scan budget** on this Linux arm64 host. Ten-thousand-file scans took
  11,779.49–20,753.68 ms and are not a realtime per-Bash envelope without optimization;
- optional earlier post-Bash full scans only when a prior measurement fits a much tighter budget.
  A post-Bash hint does not have coverage authority by itself; an over-budget or unavailable scan
  is incomplete/coverage-unknown and Stop remains the catch-up authority; and
- final-state-only handling for long commands: the delayed Bash fixture was observed only after its
  final snapshot, with no mid-command review promise. A separate unified-exec/`write_stdin`
  transport is outside the retained claim.

This is a feasible bounded later-version scope to take to specification, not a production detector
or a claim of universal interception. Interruption can leave a change with no post-tool event;
restart recovery, process locks, out-of-order hooks, and the full layered product policy remain
explicit production/specification work. Version one remains `apply_patch`-only, and declaration
extraction remains advisory.

### Candidate change-set contract

This is an advisory handoff shape, not a settled schema:

```text
ReconciliationCheckpoint {
  version, host, hostVersion, sessionId, turnId?, trigger,
  canonicalWorktreeId, capturedPolicyDigest,
  previousCheckpointId?, checkpointId, startedAt, completedAt?,
  status: complete | incomplete,
  changes: [
    { path, kind: added | modified | deleted,
      beforeContentId?, afterSnapshot?: { contentHash, size } }
  ],
  limitations: [bounded machine-readable reason]
}
```

Detection state must advance only to a **complete observed checkpoint**. Review state advances per
snapshot after a valid review outcome. Backend outage must not erase the detected change, and retry
must reuse or recapture an identified stable snapshot rather than reread an unnamed moving file.

### Declaration/context extraction handoff (advisory only)

This is a research handoff, not a specification or implementation authorization. The changed file is
a **local discovery envelope**, not the permanent review unit. If a later specification accepts the
artifact contract, an implementation could pass each stable added/modified snapshot to extraction and
emit:

- enclosing changed artifact identities and exact current ranges;
- exact source and review-projection hashes;
- bounded referenced declaration/schema context and explicit omitted-edge reasons;
- completeness sufficient for the selected rule, or no finding when evidence is incomplete.

Persist artifact identities/projection hashes rather than full source where they can make later
checkpoint comparisons cheaper. Deletions should produce local observation/receipt data only until a
rule contract explicitly defines how to review absent source. Renames may be correlated for display,
but delete-plus-add remains the safe semantic fallback. This report does not adopt Tree-sitter, LSP,
or any extractor dependency from the parallel advisory (E17).

## 8. Edge-case and guarantee table

| Case | Proposed behavior / maximum honest claim |
|---|---|
| Every emitted `PostToolUse(Bash)` event, regardless of exit status | Reconcile after command completion; checkpoint delay is host duration plus bounded scan/review time |
| Nonzero Bash with side effects | Reconcile anyway; exit status does not imply no change |
| Long-running command | No mid-command guarantee without a separately accepted watcher/daemon |
| Automatic goal continuation | Use reproduced `Stop`/session behavior and rolling checkpoints; never require another human prompt |
| Add/modify/delete | Detect by path/content manifest delta; deleted source is not sent to Jev |
| Rename | Delete + add; optional Git similarity is presentation metadata, not identity truth |
| Ignored/untracked file | Product policy, not `.gitignore`, decides eligibility; protected/excluded paths remain unread and unsent |
| Write followed by exact revert before checkpoint | Net unchanged and not reviewed; intermediate write is outside the declared guarantee |
| Concurrent writer | The stable-read fixture rejects mutation as incomplete; the regenerated tree-quiescence fixture rejects a late concurrent add and the next checkpoint finds it. No author/process attribution is claimed. |
| Write during review | Existing stale check suppresses old advice for a known path; full discovery/retry during review was not exercised and remains a production gate. |
| Index/branch operation changes many files | Treat as a bounded change set; an over-budget scan must be incomplete, never silently truncated clean. The over-budget path was not executed in this research run. |
| Separate worktree | Independent identity, baseline, lock, consent, receipt, and retention |
| Restart with compatible complete state | Resume only after validating worktree/session/policy identity; otherwise seed and report coverage gap |
| State corruption/unwritable storage | Review remains fail-open; emit bounded coverage-unknown/incomplete evidence |
| Watcher event loss | Force/full sweep; watcher never proves no changes |
| Excluded or sensitive path | Filter before content read/hash and backend dispatch; enumeration may see a local name but stores no source |
| Submodule/nested repository | Unsupported in initial slice unless explicitly enumerated by a later specification |

## 9. Synthesis, sufficiency, and disconfirmation

The mechanisms converge on one useful pattern: notifications are hints; snapshot comparison is the
coverage mechanism; incomplete comparison must stay visible. Host hooks offer the right checkpoints,
Git offers excellent machine-safe metadata and a demonstrated snapshot technique, and filesystem
watchers can improve latency. None alone meets the product's exact selection, privacy, dirty-baseline,
and storage boundaries.

The existing-solution baseline is insufficient for the bounded product use. E21 supplies the
tested trigger behavior, while E22/E23 supply the source-free reconciliation evidence and measured
size envelope. Abide is the strongest
implementation evidence for complete/incomplete snapshot semantics, but adopting its private-index
tree wholesale would persist source in Git objects and inherit Git ignore semantics. The recommended
manifest borrows the reconciliation contract without those couplings; its production use still
requires an explicit specification and process-boundary implementation gate.

The strongest case against the recommendation is cost: an authoritative eligible-tree walk and
content hashing at frequent Bash/Stop checkpoints may be too slow beyond the measured 1,000-file
envelope, and a metadata-only optimization can miss same-metadata content changes. The bounded scope
therefore uses Stop-only authoritative catch-up plus optional measured early scans; it does not
silently degrade to lossy hints. A future host-provided authoritative change set would replace most
reconciliation work.

## 10. Completed research record and future gates

The research work for issue #4 is complete at the advisory boundary. The exact replay anchors,
environment, expected/observed outcomes, exit status, and retained paths are recorded here so a
future specification or host upgrade can reproduce the claims without expanding issue completion
into production implementation.

### Completed run A — pinned Codex lifecycle

| Field | Record |
|---|---|
| Replay command | `node evidence/codex/0.155.1/probe/issue-4-lifecycle.mjs` |
| Environment | Linux arm64; Node `v24.20.0`; Git `2.39.5`; `codex-cli 0.155.1`; disposable Git repository initialized with `--initial-branch=master`; temporary mode-600 `CODEX_HOME` containing copied auth only; user configuration not loaded |
| Expected / observed | Successful Bash: `SessionStart → UserPromptSubmit → PostToolUse(Bash) → Stop(allow) → SessionEnd`; nonzero side-effect Bash: same order; delayed write: post-hook after final two-byte state only; continuation: `Stop(block) → Stop(block) → Stop(allow)` with one initial `UserPromptSubmit`; interrupt: `Interrupt → SessionEnd` and no `PostToolUse(Bash)` |
| Exit status | Replay exit `0`; root assertions `overallPass: true`, `69/69` passed, `0` failed. Success cases and continuation process exit `0`; interrupt case process exit `1`, `interrupted: true`; per-case durations and sanitized host event summaries are in the ledger |
| Retained paths | `evidence/codex/0.155.1/probe/issue-4-lifecycle.mjs`, `evidence/codex/0.155.1/probe/issue-4-lifecycle-hook.mjs`, `evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json` |
| Unexecuted limitation | No separate unified-exec/`write_stdin` transport, interactive issue-4 PTY, restart/resume, kill/terminal-close, or future Codex release matrix. The nonzero command's numeric exit is not a structured hook-payload fact. |

### Completed run B — source-free manifest prototype

| Field | Record |
|---|---|
| Replay command | `node --experimental-strip-types experiments/shell-write-detection/run.ts --write-evidence` |
| Environment | Repository worktree on Linux arm64; temporary Git repositories and owner-only state directories; offline synthetic fixtures; no source-bearing output retained |
| Expected / observed | Captured experiment-policy walk plus Git-hint/catch-up path exercised add/modify/delete/rename-as-delete-plus-add, dirty start, eligible ignored/untracked paths, protected sentinel, mixed-extension partial excludes, exact revert, nonregular files, unstable reads, late concurrent adds, read/enumeration errors, duplicate triggers, restart state, and separate worktrees. Regenerated run reported `12 scenarios passed`, `10 benchmark rows generated`, and exit `0`. |
| Retained paths | `experiments/shell-write-detection/evidence/summary.json`, `experiments/shell-write-detection/evidence/records.jsonl`, `experiments/shell-write-detection/evidence/README.txt`, plus `experiments/shell-write-detection/README.md` and `VERDICT.md` |
| Correctness limitation | Tree-quiescence and mixed-extension regression fixtures passed. The prototype is a narrowed policy stand-in, not full layered product selection/consent/size fidelity. The replay's unavailable scope is: multiprocess state locking and cross-process idempotence; writes during host review or after the final tree-stability boundary; full product policy and consent-layer fidelity; and oversized files or `maxFiles`/`maxBytes` over-budget behavior. |

### Completed run C — benchmark envelope

The retained rows are: actual repository (243 files) cold baseline `222.26 ms`, warm no-change
`174.90 ms`; synthetic 1,000-file cold `699.33 ms`, warm `273.29 ms`, one-file `4,170.15 ms`,
multi-file `3,576.77 ms`; and synthetic 10,000-file cold `20,753.68 ms`, warm `18,465.21 ms`,
one-file `14,642.90 ms`, multi-file `11,779.49 ms`. All rows read every eligible file and
revalidated traversed directories; bytes read, content reads, CPU time, state size, and change
counts are retained in E23's JSON. These are one observational sample on the stated machine, not
a performance guarantee. The candidate envelope is up to 1,000 small files under 5 seconds on this
host; 10,000 files are too slow for realtime per-Bash use. No 100,000-file, HDD-like,
cross-platform, or watcher matrix was required or run.

### Future specification and production gates

These are follow-on decisions, not missing issue-completion evidence:

1. Adopt or reject the bounded Linux arm64/headless Codex 0.155.1 envelope, including Stop-authoritative
   catch-up, the measured up-to-1,000-small-file/5-second candidate budget, over-budget incomplete
   receipts, and optional measured early Bash scans without independent coverage authority.
2. Specify the full layered product selection/consent/protected-path/size policy and source-free state
   retention; the prototype's policy is a test stand-in.
3. Add production process locking, duplicate/out-of-order hook handling, write-during-review retry,
   unwritable/over-budget behavior, restart recovery, and cross-process failure tests.
4. Re-run the lifecycle probe on each supported Codex upgrade. Add interactive or separate
   unified-exec/`write_stdin` coverage only if those surfaces enter the supported product scope.
5. Keep declaration/context extraction as a separate advisory contract decision. No extractor
   implementation or backend request is required to close issue #4.

## Explicitly unauthorized future production work

The following are outside this report and require a later explicit specification/implementation
authorization: editing version-one adapter or contract behavior; adding a manifest, watcher, parser,
or Git-tree implementation to `src/`; adding or selecting a runtime dependency; installing or
activating hooks in a user's Codex configuration; running production host conformance; changing the
Effect/Decision integration; sending source to Jev; and making any paid Jev call. No production change,
version-one scope change, or paid Jev validation is authorized by this advisory.

## 11. Research evidence gate summary

| Gate | Current evidence and disposition |
|---|---|
| G1 Lifecycle | **Complete for bounded scope:** E21 retains headless Codex 0.155.1 Bash/Stop/continuation/Interrupt traces. Interactive PTY, separate unified-exec/`write_stdin`, and restart are explicit limitations. |
| G2 Detection correctness | **Complete for bounded experiment:** E22 records 12/12 scenarios, including concurrent-add tree-quiescence and mixed-extension exclusion regressions, under the captured experiment policy. |
| G3 Privacy/storage | **Complete for retained experiment:** protected sentinel reads/state/output are absent and state is source-free; the prototype is not full layered product policy. |
| G4 Failure truthfulness | **Partial and bounded:** unstable-read, enumeration/read failure, and corrupt/incompatible state paths are retained as incomplete/baseline-reset; timeout, unwritable storage, killed-hook, and over-budget paths remain future production tests. |
| G5 Concurrency/state | **Partial and bounded:** duplicate triggers, restart compatibility, and separate worktree identity are retained; multiprocess locks, out-of-order hooks, and write-during-review are future work. |
| G6 Performance | **Complete for bounded envelope:** E23 has ten observational rows. The candidate scope is authoritative Stop catch-up through 1,000 small files under a 5-second scan budget on this Linux arm64 host; 10,000-file rows are 11.8–20.8 seconds and not a realtime per-Bash envelope. No 100,000-file/HDD matrix is required for issue completion. |
| G7 Advisory extraction | **Explicitly out of scope for issue completion:** extraction remains a separate advisory handoff; no extractor implementation, extractor fixture matrix, or backend request is required. |
| G8 Research decision | **Complete:** take the bounded manifest/Stop-catch-up envelope to specification; keep version one `apply_patch`-only and do not authorize production implementation from this report. |
| Future production conformance | **Not a gate in this report:** host installation, production implementation, process locking, version-one changes, and paid Jev validation require later authorization. No Jev/paid call was made. |

## 12. Traceable specification/prototype handoff

All implications remain advisory until explicitly adopted.

| ID | Advisory implication | Evidence / counterevidence | Uncertainty and consequence | Disposition / acceptance check |
|---|---|---|---|---|
| H1 | Treat host events as triggers, not authoritative changed-path reports | E02–E07, E21; a future host change-set could overturn it | Interrupts and unsupported transports can leave checkpoint gaps | Take to specification with a versioned trigger contract |
| H2 | Use product-policy manifest reconciliation as correctness source | E08–E16, E22–E23; regenerated tree-quiescence/mixed-extension fixtures and bounded timings | Full sweeps may exceed the measured budget | Specify the ≤1k/5s Stop-catch-up envelope and retain incomplete over-budget semantics |
| H3 | A checkpoint is complete or explicitly incomplete; never partially clean | E11/E12, E22; no production implementation | Silent misses would make receipts misleading | Specify failure algebra and production process tests |
| H4 | Keep observed/detected and reviewed state separate | E16; backend outage semantics not selected | Advancing too early loses unreviewed work | Specification + state-machine/property tests |
| H5 | Git status/diff and watchers are accelerators only | E08–E14 | Removing catch-up would inherit omissions | Specification + forced lost-hint tests |
| H6 | Do not use private-index trees as default | E11 versus source-free retention boundary | Git object persistence violates the proposed storage boundary | Keep as comparison evidence only; no reimplementation required |
| H7 | Apply captured product selection before content reads | E15/E16 | Enumeration itself still exposes local names | Both: path-only traversal contract and sentinel trace |
| H8 | Worktree/session/policy identity keys baseline and locks | E18; layout unknown | Cross-worktree state can leak coverage/consent | Both: separate-worktree/restart fixtures |
| H9 | Stable changed files feed artifact extraction, not permanent full-file review | E17; extractor unaccepted | Premature coupling can freeze wrong unit | Keep extraction advisory; no issue-completion implementation gate |
| H10 | Initial guarantee is post-command/Stop net change, not mid-command interception | E04/E13/E14 | Users may expect realtime during generators | Specification and user-facing limitation |
| H11 | Rename is delete + add unless identity is proved | E08/E10 | May duplicate review/cost | Specification; optional presentation correlation |
| H12 | Persist no source in detector state and bound metadata retention | E11 counterexample; current receipts are source-free | Hashes/paths still carry metadata risk | Specification + storage inspection/cleanup test |

## 13. Open questions

1. What maximum reconciliation delay and repository-size envelope is acceptable for a feature called
   realtime when long-running commands cannot be reviewed until completion?
2. Should every Bash completion perform a full eligible sweep, or may it run a hint-based early scan
   while reserving full coverage for Stop? The answer changes latency and the meaning of receipts.
3. Should compatible checkpoint state survive host process restart, or should restart always seed a
   new disclosed baseline? How is a resumed Codex session identified across modes?
4. Is SHA-256 acceptable for local manifest equality, matching current snapshot identity, or should
   equality state use a keyed digest to reduce dictionary disclosure of tiny known files?
5. How should policy changes between checkpoints be represented: new baseline, newly eligible adds,
   or an incomplete boundary requiring explicit status?
6. Does a deleted declaration need a future diff-aware rule contract, or is a source-free deletion
   receipt sufficient for the initial slice?
7. Are Git submodules, nested repositories, sparse checkouts, case-insensitive filesystems, and
   network mounts unsupported, or which receive dedicated conformance matrices?
8. Which component owns pending-review retry/retention so an outage does not create either an
   unbounded queue or silent loss?
9. Can artifact projection hashes replace most file-content hashing after extraction without missing
   parser/semantic changes or changes in referenced context?
10. What exact Stop/continuation behavior occurs on the next supported Codex release? E21 is retained
    for 0.155.1 and must be replayed before widening the supported host envelope.

## 14. Limitations and primary-source index

This pass ran and retained the bounded lifecycle probe (E21) and regenerated source-free
prototype/benchmark (E22–E23). Interactive issue-4 PTY, separate unified-exec/`write_stdin`,
restart and process-boundary recovery, multiprocess locking, write-during-review, over-budget/
unwritable state, 100,000-file/HDD, filesystem, and cross-platform matrices were not executed.
The prototype replay specifically does not claim multiprocess state locking/cross-process
idempotence, writes during host review or after the final tree-stability boundary, full product
policy/consent fidelity, or oversized-file and `maxFiles`/`maxBytes` over-budget behavior.
Declaration extraction was not implemented because it is advisory and not an issue-completion gate.
The current product remains version-one `apply_patch`-only for Codex. No implementation dependency
or requirement is authorized by this report, and no Jev/paid call was made.

Primary sources are linked in E01–E23. The most important replay anchors are the official
[Codex hook contract](https://developers.openai.com/codex/hooks), official
[Git status](https://git-scm.com/docs/git-status), [Git diff](https://git-scm.com/docs/git-diff), and
[Git file listing](https://git-scm.com/docs/git-ls-files) documentation, official
[Node filesystem documentation](https://nodejs.org/api/fs.html), pinned
[Abide source](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a),
and this repository's pinned Codex evidence under
[evidence/codex/0.155.1](./evidence/codex/0.155.1/README.md).
