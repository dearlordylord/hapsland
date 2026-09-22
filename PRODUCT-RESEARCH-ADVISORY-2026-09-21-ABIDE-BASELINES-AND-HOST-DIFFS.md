# Baselines, host-reported edits, and Abide turn reconciliation

**Status:** focused advisory supplement; not a normative product specification.

**Date:** 2026-09-21
**Scope:** the baseline question in [issue #22](https://github.com/dearlordylord/jevs/issues/22): why a checkpoint baseline is useful when an agent says that it changed a file; what the pinned Abide implementation actually does; and whether host or VCS facilities can remove a product-owned root walk.  This report does not redo the broader shell-write research in [the 2026-09-20 shell-write advisory](./PRODUCT-RESEARCH-ADVISORY-2026-09-20-SHELL-WRITE-DETECTION.md), or the broad [Abide review](./RESEARCH-ABIDE-2026-09-19.md).

**Method:** [PRODUCT-RESEARCH-METHODOLOGY.md](./PRODUCT-RESEARCH-METHODOLOGY.md).  Sources were inspected 2026-09-21.  Claims distinguish source class (`DOC`, `SRC`, `RUN`, `ISSUE`) from verification state (`DOCUMENTED`, `SOURCE-INSPECTED`, `RUNTIME-TESTED`, `INFERRED`, or `UNKNOWN`).

**Follow-up change log:** This supplement now evaluates a source-free Git-assisted hybrid: use
existing index/tree OIDs and stat metadata for tracked content where Git can establish a clean
worktree, and transiently hash only dirty, untracked, or otherwise unrepresented selected paths.
The prior broad wording that treated Git as only a rejected sole baseline is narrowed: the hybrid is
an open optimization candidate, subject to the acceptance matrix in §5.2.  Universal hard exclusions
are not assumed; the exact product floor for `.git`, `node_modules`, and other special paths remains
unresolved and is outside this follow-up.

## 1. Short answer

An agent saying “this was changed” is not by itself a complete change-set contract.  It may be an
intent message, a path-only event, a patch for one host tool, or a tool response that does not cover
shells, generators, editors, MCP tools, another process, or a human.  Even a trustworthy direct-edit
event does not answer the separate question “what changed since the turn/checkpoint began?” when the
worktree was already dirty.  A baseline is needed for that delta, for deletions and exact reverts,
and for a defensible “no other eligible files changed” or “all changed files were covered” claim.

The useful split is therefore:

1. **Direct-edit fast path.** If a host supplies an authoritative resulting path and bytes (or a
   complete before/after record), review that event without a full root scan.  Reread or hash the
   resulting bytes if the product promises the state on disk rather than merely the host's report.
2. **Catch-up authority.** When the host does not supply a complete resulting set, or delivery,
   coverage, deletion, or policy scope is uncertain, compare a complete product-policy snapshot to a
   prior checkpoint.  This catches shell/other-tool/external changes and separates new changes from
   dirty-start state.
3. **Lifecycle reset.** A memory-only baseline can survive ordinary hook-client exit when a resident
   reviewer/tenant owns the state.  A resident reviewer restart, policy change, worktree change, or
   incompatible/missing state requires a new seed scan.  If the product is only a one-shot hook
   client, memory-only state cannot cross that process boundary; retaining source-free durable state
   is a separate product decision and is strongly disfavored by the current privacy direction.

The pinned Abide implementation follows this split: it records direct edit starts for fast feedback,
but at turn start takes a private Git-tree snapshot and at Stop diffs the start and end trees.  That
is why it sees a shell-created file and a shell deletion.  Its private-index tree is a useful
complete/incomplete pattern, not a reason to put source blobs in this product's Git object store.

The prior “root-wide” decision remains semantically the right **catch-up scope**: a full walk of the
user-selected product-eligible set, not necessarily a scan on every hook event or every startup.  It
does not imply hard-coded exclusions such as `build`, `coverage`, `dist`, `generated`, `target`, or
`vendor`; selection and exclusion are user-owned policy.  The exact floor for `.git`, `node_modules`,
and other special paths is not decided by this report.  If a policy selects a path, the product must
either cover it or disclose that the policy is unsupported/incomplete.  The product should expose a
budget and report incomplete/coverage-unknown rather than silently omit selected files or claim
completeness.

## 2. Research brief and candidate inventory

### Questions and assumptions

The focused questions are:

- What guarantee does a baseline add beyond an agent-reported edit?
- Does Abide's pinned implementation snapshot source, and what exactly is compared?
- Can Codex, Claude Code, or OpenCode provide a resulting change set or native diff that makes a
  product-owned root scan unnecessary?
- What is the right role for Git status/diff, a private index, and filesystem watchers?
- Does root-wide mean startup always pays the full cost, especially with broad user policy?

The product boundary is host-neutral, source-free checkpoint metadata where possible, explicit
coverage state, and no assumption that Git ignore rules are the product's selection rules.  This is
advisory evidence, not authorization to add a dependency or change the specification.

### Candidate inventory

| Candidate / intended use | Class | Decision |
|---|---|---|
| Host-reported resulting path/content for a supported direct edit | Agent-host contract | **BORROW** as a fast-path contract when completeness and post-state are proven |
| Codex `PostToolUse` plus `Stop` | Agent-host lifecycle | **OPTIONAL INTEGRATION**/conditional trigger; not a changed-set authority on current evidence |
| Claude `PostToolUse` and `FileChanged` | Agent-host lifecycle/watcher | **OPTIONAL INTEGRATION** for direct payloads and finite wake-up hints; not catch-up authority |
| OpenCode `file.edited`, `file.watcher.updated`, VCS/session diff APIs | Agent-host lifecycle/VCS edge | **OPTIONAL INTEGRATION**; current source does not establish a complete session baseline contract |
| Git status/diff/`ls-files` | Adjacent VCS mechanism | **OPTIONAL INTEGRATION** for candidate acceleration and diagnostics; raw Git alone is **REJECT**, while the source-free hybrid remains an open candidate |
| Abide private Git-index/tree snapshots | Existing review integration | **BORROW** complete-or-incomplete and turn-start/Stop shape; **REJECT** exact source-persisting default |
| Product-policy full eligible-set snapshot | Host-neutral reconciliation | **BORROW** as catch-up authority; implementation remains a later specification/prototype decision |
| Filesystem watcher/journal | Filesystem observation | **OPTIONAL INTEGRATION** wake-up/candidate hint; **REJECT** as lossless authority |

No candidate in this pass meets the evidence threshold to replace product-owned catch-up scanning
for the product's broad guarantee.

## 3. What a baseline buys

### 3.1 Dirty starts make `HEAD` an insufficient reference

Suppose `a.ts` was dirty before the turn.  During the turn the agent changes `b.ts`.  `git diff
HEAD` reports both files, but cannot say that `a.ts` predated this turn.  A turn-start snapshot
`S0`, followed by an end snapshot `S1`, yields the relevant delta `S1 - S0`.  The same distinction
matters for a pre-existing deletion, a file that is changed and then restored exactly, and a rename
whose identity is uncertain.  Git's own docs describe `git diff <commit>` as comparing the working
tree against a named commit; they do not make `HEAD` an arbitrary session-start checkpoint
([Git diff](https://git-scm.com/docs/git-diff), `DOC/DOCUMENTED`, E-GIT-DIFF).

### 3.2 “This changed” is not necessarily the resulting state

A host can report the tool's intent (`file_path`, command, patch hunk), an event saying that a file
was touched, or a tool-specific response.  Those are different from an authoritative final byte
sequence.  A command can write multiple paths, fail after a side effect, spawn a generator, rename
or delete a file, and continue writing after a notification.  Codex's documented `PostToolUse`
payload carries tool-specific input and response; the documentation does not promise a normalized
resulting path/content set for Bash or every tool ([Codex hooks](https://developers.openai.com/codex/hooks#posttooluse),
`DOC/DOCUMENTED`, E-CODEX-HOOK).  The retained Codex 0.155.1 probe verifies the event lifecycle,
not an authoritative filesystem change-set (`RUN/RUNTIME-TESTED`, prior report E21).

If the host contract is upgraded to provide complete resulting paths and bytes for a tool, a direct
review can skip a full scan for that event.  The product still needs to establish whether the event
is complete for the relevant policy and whether the bytes correspond to the current disk state.  A
path-only or patch-only report is a candidate hint, not proof that no other selected path changed.

### 3.3 External and other-tool edits are the main reason for catch-up

“External” includes a shell command or script, a generator, an editor, a separate agent process, an
MCP/local function, and a human process.  It also includes writes made by a tool whose host adapter
does not expose a complete result.  If the explicit product guarantee is only “review files named by
the trusted direct-edit event,” no baseline is needed for that narrow path.  If the guarantee is
“review all selected files changed since this checkpoint,” a baseline or equivalent checkpoint
identity is required.  This is the decisive distinction behind the earlier root-wide proposal.

A baseline also supports stale detection: if a file changes during reading or review, the product
must not advance the observed/reviewed checkpoint as though the older bytes were final.  Existing
product research records the source-free prototype's stable-read and incomplete-scan behavior; this
report does not repeat that implementation evidence.

## 4. Pinned Abide mechanism

The comparison below is against commit
[`ec3352e873163b74aca1ac9cf3bd0ea69a97723a`](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a),
not an unpinned branch.  The source was inspected; the repository's earlier deterministic tests
were retained in [RESEARCH-ABIDE-2026-09-19.md](./RESEARCH-ABIDE-2026-09-19.md).  No live Abide host
session was run in this focused pass.

### 4.1 Turn-start state and storage

`turnStart.ts` handles the turn-start hook, resolves the repository root, and creates a session/prompt
directory under `~/.abide/sessions/<session>/<prompt>`.  For a Git repository it marks the baseline
pending, calls `snapshotTree(root, <turn>/index, timeout)`, and stores the resulting tree hash as
the baseline.  `session.ts` writes owner-only directories/files and first-write-wins direct-edit
records under `files/`.  `SessionStart` only prunes old turns; it does not seed the turn baseline.

Sources: [`turnStart.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/turnStart.ts),
[`session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts),
[`sessionStart.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/sessionStart.ts)
(`SRC/SOURCE-INSPECTED`, E-ABIDE-START).  The implementation stores the tree hash and direct-edit
originals durably under the user's home state; it is not a memory-only baseline.

### 4.2 What `snapshotTree` does

`git.ts` copies the real Git index to a scratch index, sets `GIT_INDEX_FILE`, runs `git add -A -- .`
with Abide's secret pathspec exclusions, and runs `git write-tree`.  The real index is not changed,
and ignored files are omitted by Git's normal add semantics.  The resulting tree contains blobs for
tracked and newly added nonignored files.  `blobIdsAt` obtains blob IDs from that tree.  Thus Abide
does not merely store a path list: its start/end tree snapshots are content-addressed Git trees.

The consequence is important for this product: `git add`/`write-tree` can place source blobs,
including untracked source, in `.git/objects`.  Deleting the scratch index does not immediately
remove unreachable objects; their lifetime follows Git object retention/garbage collection rather
than a product source-retention policy.  This is a source-inspected fact, not a claim that Abide
intends to retain source indefinitely.

Source: [`git.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a)
(`SRC/SOURCE-INSPECTED`, E-ABIDE-SNAPSHOT).  Abide's Git ignore and secret exclusions are also not
the product's selection contract; a product-selected ignored file would not be represented by this
snapshot unless the mechanism changed.

### 4.3 Stop reconciliation and direct fast path

At Stop, `stop.ts` reads baseline status.  If the baseline is pending or failed it returns an
incomplete turn.  Otherwise it takes a new `snapshotTree`, runs `diffTrees(root, baseline, now)`,
splits the patch, maps files, and obtains start blob IDs.  A snapshot failure or timeout remains
incomplete; it is not silently treated as clean.  If no usable Git baseline exists, the fallback
reads only the direct-edit `recordFileStart` entries and diffs their stored originals against the
current files, explicitly leaving the result incomplete.  This fallback cannot discover an unknown
shell-created path or deletion.

`postToolUse.ts` parses direct Edit/Write/MultiEdit/apply_patch payloads and records original/current
content and checked blob IDs.  Its `coverage.ts` chains before/after IDs so a shell or other change
breaks the direct-edit coverage chain.  In particular, an `apply_patch` deletion has no complete
immediate hunk and depends on the Stop baseline.

Sources: [`stop.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts),
[`postToolUse.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/postToolUse.ts),
[`diff.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/diff.ts),
[`coverage.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/coverage.ts)
(`SRC/SOURCE-INSPECTED`, E-ABIDE-STOP).  The pinned tests cover shell-created files and shell
deletions, and failed/incomplete snapshots (`SRC/RUNTIME-TESTED` in the earlier pass, E-ABIDE-TEST).

### 4.4 Abide conclusion

Abide answers “why baseline?” concretely: direct tool events are useful for immediate rule checks,
but only the turn-start/end snapshot can recover unreported shell writes, deletion, and the dirty
turn delta.  Borrow its explicit `pending`/`failed`/`incomplete` states and its separation of direct
edit coverage from turn reconciliation.  Do not depend on its private Git index as the product's
default source-of-truth unless a future privacy/retention decision explicitly accepts source blobs in
Git's object database.

## 5. Host and native diff comparison

| Mechanism | What it can establish | What it cannot establish on current evidence | Product use |
|---|---|---|---|
| **Codex `PostToolUse`** | Event after supported tool execution; tool-specific input/output. `Stop` is a broad catch-up trigger. | No documented normalized complete path/content set for arbitrary Bash/MCP/local functions; specialized tools may opt out; hook loss/crash leaves gaps. | **OPTIONAL INTEGRATION** trigger and direct fast path only when a future conformance fixture proves completeness. Keep catch-up scan. |
| **Claude `PostToolUse`** | Successful tool payload can contain useful direct `Write` input/content; `PostToolUseFailure` covers failed tools separately. | Docs explicitly say Edit/Write matching does not fire when Bash/external process rewrites a file; tool output is tool-specific and already ran. | **OPTIONAL INTEGRATION** direct fast path; external catch-up remains required. |
| **Claude `FileChanged`** | Filesystem watcher reports `file_path` plus add/change/unlink for explicitly watched files, regardless of writer. | No content; finite watch list, not a lossless all-root journal; delivery and watcher/platform caveats remain. | **OPTIONAL INTEGRATION** wake-up/candidate hint, never authority. |
| **OpenCode `file.edited` / watcher events** | Current generated types expose file paths/events; plugin hooks expose before/after tool lifecycle. | Tool after hook has no resulting path/content; current pinned V2 `session.diff` implementation returns an empty array, and migration text says historical session diffs are unavailable until snapshot semantics are defined. | **OPTIONAL INTEGRATION** if a host-versioned adapter proves semantics; no dependency for correctness. |
| **OpenCode VCS diff/status** | Git-relative status/diff and `FileDiff` shape can accelerate diagnostics. | Current VCS diff is HEAD/branch-relative, not an arbitrary turn-start baseline; untracked/ignored semantics differ from product policy. | **OPTIONAL INTEGRATION**, not sole authority. |
| **Git status/diff/`ls-files`** | Stable machine-readable status; tracked/untracked/delete/rename hints; tree/blob comparisons if supplied a baseline. | `HEAD` and real index cannot isolate dirty-start changes; standard ignored enumeration omits product-selected ignored files; index can race. | **OPTIONAL INTEGRATION** candidate accelerator; **REJECT** sole baseline. |
| **Filesystem watcher/journal** | Low-latency notification to schedule a scan. | Node documents platform-dependent caveats; events can miss inode replacement, lack filenames, or fail on network/virtualized filesystems. No retained historical content. | **OPTIONAL INTEGRATION** wake-up only. |

Primary sources: [Codex hooks](https://developers.openai.com/codex/hooks), [Claude Code hooks](https://code.claude.com/docs/en/hooks),
[OpenCode plugins](https://opencode.ai/docs/plugins), [OpenCode server diff](https://dev.opencode.ai/docs/server/),
[pinned OpenCode generated types](https://raw.githubusercontent.com/anomalyco/opencode/70a24697ea0028e19f22712fd63059538cb4bee7/packages/sdk/js/src/gen/types.gen.ts),
[pinned OpenCode session source](https://raw.githubusercontent.com/anomalyco/opencode/70a24697ea0028e19f22712fd63059538cb4bee7/packages/opencode/src/session/session.ts),
[pinned OpenCode V1 migration note](https://raw.githubusercontent.com/anomalyco/opencode/70a24697ea0028e19f22712fd63059538cb4bee7/packages/app/V1_API_MIGRATION.md),
[Git status](https://git-scm.com/docs/git-status), [Git diff](https://git-scm.com/docs/git-diff), [Git ls-files](https://git-scm.com/docs/git-ls-files),
and [Node fs watcher caveats](https://nodejs.org/api/fs.html#caveats).  These are `DOC/DOCUMENTED` or
`SRC/SOURCE-INSPECTED`; they establish advertised/source behavior, not a cross-host runtime guarantee.

### 5.1 Source-free Git-assisted hybrid: plausible optimization, not yet an authority

The proposed hybrid is narrower than Abide's private-index snapshot:

1. At seed, identify the canonical worktree and Git object hash algorithm.  Enumerate the product's
   selected paths, not merely paths accepted by Git's ignore rules.  For each stage-0 tracked path,
   retain source-free metadata in resident memory: relative path, mode/kind, index stage, index blob
   OID, relevant stat identity, and the index/HEAD identity observed.  For selected paths absent from
   the index, or tracked paths whose worktree is not represented by the index entry, compute a
   transient product fingerprint from a stable read; do not write a Git object.
2. At a checkpoint, atomically capture the index/HEAD identities and enumerate the selected path
   set again.  Use index/tree OIDs for paths whose current worktree is proven to match a stage-0
   index entry.  Hash only paths that are dirty, untracked, selected-but-ignored, unmerged,
   ambiguous, or whose stat/index evidence changed.  Compare each current content identity with the
   seed identity; missing paths are deletions.  Present renames as delete plus add unless a content-
   equality heuristic is explicitly only a presentation aid.
3. Recheck the index identity and stable-read markers before committing the checkpoint.  If the
   index, directory membership, or a file changes during the operation, retry within a bounded
   budget; otherwise publish `incomplete/coverage-unknown` and do not advance the complete baseline.

This is source-free with respect to product-owned retained state and does not require `git add`,
`git write-tree`, or any other object-creating operation.  Git's `ls-files --stage` exposes mode,
object name, and stage; `git cat-file --batch-check` can inspect object metadata without emitting
contents; and `git hash-object` writes only when `-w` is supplied ([Git ls-files](https://git-scm.com/docs/git-ls-files),
`DOC/DOCUMENTED`, [Git cat-file](https://git-scm.com/docs/git-cat-file), `DOC/DOCUMENTED`, [Git
hash-object](https://git-scm.com/docs/git-hash-object), `DOC/DOCUMENTED`).  The hybrid must never
silently add `-w` or use a scratch index.

The exact identity contract must be decided before implementation.  A Git index OID identifies the
blob recorded in the index, whose content can be affected by Git clean filters; it is not inherently
the raw bytes currently read by the product.  If the product's identity is Git-canonical content and
the applicable filter behavior is part of the contract, a clean stage-0 path can use its OID.  If
the product's identity is raw worktree bytes, an index OID alone is insufficient where attributes,
line-ending conversion, symlinks, submodules, or special modes matter.  A prototype must either
prove the no-filter/raw equivalence or hash the affected path.  A dirty worktree can be transiently
hashed with a product digest (or a no-write Git-style hash); it cannot be compared exactly to an
OID-only raw baseline unless the identity schemes are compatible.

Git's own stat cache is a performance hint with important boundaries.  The racy-Git documentation
describes cached `lstat` fields, the same-timestamp case, and the fallback to content comparison
for racily-clean entries ([racy-Git documentation](https://git-scm.com/docs/racy-git),
`DOC/DOCUMENTED`; [v2.39.5 `read-cache.c`](https://github.com/git/git/blob/v2.39.5/read-cache.c),
`SRC/SOURCE-INSPECTED`).  But `assume-unchanged`, `skip-worktree`, and fsmonitor-valid state can
change what Git checks; the `git update-index` documentation explicitly says assume-unchanged lets
Git omit checking a promised-unchanged path ([v2.39.5 `git-update-index`](https://git-scm.com/docs/git-update-index/2.25.0.html),
`DOC/DOCUMENTED`).  The product therefore cannot treat “Git status is clean” as an unconditional
proof for arbitrary external writes.  It must detect such flags/configurations or treat the path as
ambiguous and hash it.  Even a correct stat check cannot guarantee a future write after the check;
stable-read/quiescence is the boundary of an exact checkpoint.

The status command itself is not a read-only contract: current Git documentation says `status` may
refresh cached stat data and write the index, and recommends `--no-optional-locks` for background
scripts because that write can conflict with another process ([Git status, background refresh](https://git-scm.com/docs/git-status#_background_refresh),
`DOC/DOCUMENTED`).  A product hybrid should either use that no-optional-locks mode and treat any
index identity change as a retry, or use lower-level read-only inspection.  It must not create a
scratch index or mutate the user's index merely to optimize reconciliation.

### 5.2 Exact guarantee and minimum prototype matrix

The hybrid can be an exact **checkpoint observation** under these narrowed guarantees: (a) the
selected path set is completely enumerated under product policy; (b) stage-0 OID use is limited to
paths whose worktree match has been established under a documented identity/filter contract and no
trust-bypassing index flags; (c) all other selected paths receive stable transient hashes; and (d)
index/path/read races retry or produce incomplete state.  It cannot promise zero content reads, live
interception, or correctness while a writer keeps mutating a file.  Without those conditions it is a
practical candidate accelerator only.

| Case | OID-only result? | Required treatment for exact checkpoint |
|---|---|---|
| Clean stage-0 tracked file, ordinary index stat metadata, compatible identity | **Conditionally yes** | Use OID only after a Git/version/filesystem conformance test; otherwise hash. |
| Arbitrarily dirty tracked file at seed | **No** | Stable transient hash; record the resulting product identity. |
| Staged file whose worktree matches stage-0 index | **Conditionally yes** | Index OID captures staged/current content; detect and hash if worktree differs. |
| Staged file with unstaged worktree edits | **No** | Hash current worktree; retain stage-0 OID/stage as separate metadata. |
| Commit during session with unchanged worktree bytes | **Yes for file-content scope** | Re-key HEAD/index observation; do not report a commit as a file change unless policy says so. |
| Reset/checkout/switch | **Conditionally yes** | Re-enumerate and compare OIDs; hash paths whose worktree is dirty, absent, sparse, or ambiguous. |
| Add/delete | **No for an untracked add; yes for clean tracked add/delete detection** | Enumerate path membership; hash untracked adds; missing paths are deletions. |
| Rename | **No identity guarantee** | Exact result is delete + add; same-OID pairing is only a presentation heuristic. |
| Unmerged index (stages 1–3) | **No singular OID** | Retain the stage tuple and hash current worktree; unresolved/missing state is incomplete. |
| Racily-clean/stat-cache path | **No unconditional shortcut** | Force/borrow Git's content check only under tested semantics; otherwise hash. |
| assume-unchanged, skip-worktree, fsmonitor-valid, sparse index, or unsupported filter | **No** | Treat as ambiguous and hash or mark incomplete; do not trust clean status. |
| User-selected ignored/untracked path | **No Git OID shortcut** | Product enumeration plus stable transient hash. The selection floor is unresolved here. |
| Concurrent index/worktree mutation | **No** | Capture before/after identities, retry; publish incomplete if not stable. |
| Non-Git root | **No** | Product-owned manifest/fingerprints remain the authority. |

The minimum prototype acceptance matrix should use source-free fixtures and assert both correctness
and “no object creation” (object count/IDs before and after):

- clean tracked files with unchanged and changed bytes, same-size/same-mtime rewrites, executable
  mode changes, symlinks, CRLF/clean-filter attributes, and a sparse/skip-worktree path;
- dirty-at-seed tracked files, staged-only files, staged-plus-unstaged files, intent-to-add, and
  unmerged stages 1/2/3;
- commit, reset, checkout/switch, and index rewrites during the resident session, including a
  commit whose worktree bytes are unchanged;
- untracked and policy-selected ignored files, additions, deletions, directory/file replacement,
  same-content rename, modified rename, and pathnames requiring NUL-safe parsing;
- index lock/contention, index replacement, file replacement, concurrent writes during enumeration
  and hashing, and repeated retries ending in explicit incomplete state;
- a non-Git root and a Git root with a deliberately broad user selection, with no universal
  assumptions about `build`, `coverage`, `dist`, `generated`, `target`, `vendor`, `.git`, or
  `node_modules` until the product policy separately resolves those paths.

The Git source/test evidence supports the need for this matrix rather than closing it.  `git
ls-files` documents stage tuples and its lower-level status tags; `git diff-index` distinguishes the
index from the filesystem and uses an all-zero object ID for a worktree state without a backing
object ([Git diff-index](https://git-scm.com/docs/git-diff-index), `DOC/DOCUMENTED`).  Git's v2.39.5
tests exercise fsmonitor invalidation, staging/unstaging, sparse-index expansion, and filesystem
watcher inputs ([`t7519-status-fsmonitor.sh`](https://github.com/git/git/blob/v2.39.5/t/t7519-status-fsmonitor.sh),
`SRC/SOURCE-INSPECTED`), while the racy-Git documentation demonstrates that content comparison can
be required and costly.  These sources establish a credible optimization boundary, not product
conformance.

## 6. Root-wide scope and startup cost

“Root-wide” should be read as **the full configured eligible set at a catch-up checkpoint**, not
“walk every file on every hook event.”  The proposed lifecycle is:

| Situation | Work | State consequence |
|---|---|---|
| Complete host direct result, stable read | Review named path(s); update per-path observed/reviewed metadata | No full walk for that event |
| Resident reviewer receives ordinary hook events | Keep source-free baseline/manifest in memory | Hook-client process exit does not lose state if the resident owner remains alive |
| Host report incomplete, watcher hint, Stop/checkpoint | Full product-policy walk of the selected set, subject to budget | Publish only a complete snapshot; otherwise `incomplete/coverage-unknown` |
| Resident reviewer or tenant restart; policy/worktree identity changes; state invalid | Reseed with full eligible-set walk | Do not infer changes before the new seed; disclose reset boundary |
| One-shot client with no durable state | Reseed on each process that needs a cross-event guarantee | A memory-only baseline cannot cross ordinary process exit |

The selection set is user-owned.  Do not silently hard-code `build`, `coverage`, `dist`,
`generated`, `target`, or `vendor` as universal exclusions.  Whether `.git`, `node_modules`, or any
other special subtree is inside the eventual product floor remains unresolved here; if a user policy
selects a path, the implementation must either cover it or disclose that the policy is unsupported.
The cost model therefore needs a visible file/byte/time budget, bounded reads, and an explicit
incomplete result.  It is acceptable for a broad user policy to be expensive; it is not acceptable
to pretend that a timed-out selected subtree was covered.

The earlier source-free prototype measured one Linux arm64 environment: roughly 0.27–4.17 seconds
for 1,000 small files and 11.8–20.8 seconds for 10,000 files across its retained phases; those
figures are prior `RUN/RUNTIME-TESTED` evidence, not a `node_modules` benchmark or cross-platform
promise ([shell-write advisory](./PRODUCT-RESEARCH-ADVISORY-2026-09-20-SHELL-WRITE-DETECTION.md),
E23).  They support avoiding a full scan on every direct event and setting a bounded catch-up
budget, but do not justify an implementation-level hard exclusion.  Metadata-only shortcuts such as
mtime/size can be useful candidates but cannot guarantee detection of same-size/same-mtime content
changes; Git status and watcher events have the same candidate-versus-authority distinction.

## 7. Product implications (advisory, not settled requirements)

| ID | Candidate implication | Evidence / counterevidence | Take-forward disposition |
|---|---|---|---|
| I1 | Define two contracts: direct event review and complete checkpoint reconciliation. | E-CODEX-HOOK, E-ABIDE-STOP; host events differ in fidelity. | Take to specification and prototype. Acceptance test: trusted direct path plus shell/external catch-up. |
| I2 | A direct event may bypass a root walk only when resulting path/content and event completeness are proven; otherwise it is a hint. | Host docs are tool-specific; Claude explicitly misses Bash rewrites; OpenCode tool hooks lack file output. | Take to prototype with per-host conformance fixtures. |
| I3 | Preserve source-free baseline state in memory for a resident reviewer; restart/policy reset reseeds. | Product privacy direction; Abide demonstrates durable state but source-bearing Git trees are not acceptable by default. | Take to specification; prototype restart and coverage receipts. |
| I4 | Catch-up scope is the user-selected eligible set. Budget exhaustion is incomplete, not an implicit exclusion. | Existing product policy and user constraint; prior benchmark E23. | Take to specification and prototype. |
| I5 | Git/watcher facilities can accelerate candidate discovery but cannot close the coverage contract. | E-GIT-DIFF; E-CODEX-HOOK/host rows; Node watcher caveats. | Optional integration only; retain full-scan fallback. |
| I6 | Keep observed and reviewed checkpoints distinct; do not advance reviewed state after an unstable or failed scan. | Abide pending/failed/incomplete handling and existing product stale-snapshot evidence. | Take to prototype, then specification. |
| I7 | Prototype a source-free Git hybrid as an optimization for clean stage-0 tracked paths, while retaining product enumeration and transient hashing for all ambiguous/unrepresented paths. | E-GIT-HYBRID: index OIDs/stages, racy-stat behavior, assume-unchanged/skip-worktree caveats, and no-write hashing docs/source/tests. | Take to prototype only; keep the full product-policy fallback until the matrix passes. |

## 8. Disconfirmation and open questions

The recommendation would change if a supported host supplied a versioned, lossless post-operation
record containing every relevant resulting path, deletion/rename semantics, stable resulting bytes or
content IDs, delivery ordering, and a recovery/cursor mechanism across hook and reviewer restarts.  A
host-provided native diff would also need an arbitrary turn-start identity, not merely `HEAD` or the
current session summary.  A runtime fixture should prove shell, generator, external editor,
ignored-but-selected path, deletion, rename, dirty start, process restart, and event loss.

The hybrid recommendation would be promoted from open candidate only if its prototype proves the
matrix in §5.2 across supported Git versions/filesystems and the product chooses a content identity
(raw worktree bytes versus Git-canonical filtered bytes).  It would be narrowed or rejected if
index flags, filters, sparse/unmerged states, broad user-selected non-index paths, or concurrent
mutation force hashing so often that no meaningful budget win remains, or if the product cannot
guarantee that Git commands do not create objects.

Evidence that would *not* overturn the conclusion by itself: a path-only host event; `git status`
against `HEAD`; a watcher that reports changes without content or replay; an OpenCode/Claude API
description without a live conformance fixture; or a faster scan that silently excludes selected
paths.  Conversely, a source-free durable private index or manifest may be acceptable only after an
explicit retention, privacy, corruption, locking, and replacement-cost decision; this report does
not assume that durable state is forbidden, only that memory-only resident state is the preferred
default and restart reseeding must be honest.

Unresolved prototype questions are: the exact resident-reviewer ownership/liveness model; atomic
multi-process state and crash recovery; whether a content-ID manifest can stay source-free under all
supported filesystems; budget UX for very broad user selection; and conformance fixtures for each
host release.  None is resolved by this advisory.

## 9. Limitations and source index

This is a focused source-inspection supplement, not an ecosystem-complete survey.  The Abide claim is
pinned source inspection plus the deterministic tests documented in the prior report, not a live
Abide/Claude/OpenCode runtime session.  Codex lifecycle runtime evidence is the prior Linux arm64
`0.155.1` fixture.  OpenCode source evidence is pinned to commit
`70a24697ea0028e19f22712fd63059538cb4bee7`; generated APIs and V1/V2 migration state may change.
Claude and Codex documentation are living pages accessed 2026-09-21 and require version-specific
conformance before dependence.  No paid call, runtime install, or source-bearing retained output was
used.

Evidence index:

- **E-ABIDE-START/SNAPSHOT/STOP/TEST:** pinned Abide `turnStart.ts`, `session.ts`, `sessionStart.ts`,
  `git.ts`, `stop.ts`, `postToolUse.ts`, `diff.ts`, `coverage.ts`, and `hook.test.ts` linked above;
  `SRC/SOURCE-INSPECTED` plus prior deterministic `RUN/RUNTIME-TESTED` tests.
- **E-CODEX-HOOK:** [Codex hooks](https://developers.openai.com/codex/hooks), `DOC/DOCUMENTED`,
  plus prior 0.155.1 lifecycle fixture `RUN/RUNTIME-TESTED` for event timing only.
- **E-CLAUDE-HOOK:** [Claude Code hooks](https://code.claude.com/docs/en/hooks), `DOC/DOCUMENTED`,
  including the documented Bash/external-process limitation for Edit/Write matching and finite
  `FileChanged` watcher paths.
- **E-OPENCODE:** official plugin/server docs and pinned source/types/migration links above,
  `DOC/DOCUMENTED` + `SRC/SOURCE-INSPECTED`; no live runtime conformance.
- **E-GIT-DIFF:** official Git status/diff/ls-files docs above, `DOC/DOCUMENTED`.
- **E-GIT-HYBRID:** official [Git diff-index](https://git-scm.com/docs/git-diff-index),
  [Git cat-file](https://git-scm.com/docs/git-cat-file), [Git hash-object](https://git-scm.com/docs/git-hash-object),
  [Git index format](https://git-scm.com/docs/index-format), [racy-Git](https://git-scm.com/docs/racy-git),
  [v2.39.5 `read-cache.c`](https://github.com/git/git/blob/v2.39.5/read-cache.c),
  [v2.39.5 `git-ls-files` documentation](https://github.com/git/git/blob/v2.39.5/Documentation/git-ls-files.txt),
  and [v2.39.5 fsmonitor tests](https://github.com/git/git/blob/v2.39.5/t/t7519-status-fsmonitor.sh);
  `DOC/DOCUMENTED` + `SRC/SOURCE-INSPECTED`, no product runtime conformance yet.
- **E-WATCH:** [Node fs caveats](https://nodejs.org/api/fs.html#caveats), `DOC/DOCUMENTED`.
- **E-BENCH:** prior shell-write advisory E23, `RUN/RUNTIME-TESTED`, one Linux arm64 machine; not
  a guarantee for broad user-selected trees.

The prior reports remain specialized rather than superseded: this supplement narrows only the
baseline/host-diff question and should be read alongside their broader lifecycle and performance
evidence.
