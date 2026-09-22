# Filesystem point-in-time snapshots, writer ownership, and host post-images

**Status:** advisory research only; it does not change issue #24, issue #38, the
product specification, dependencies, or implementation.
**Date:** 2026-09-21
**Method:** [PRODUCT-RESEARCH-METHODOLOGY.md](./PRODUCT-RESEARCH-METHODOLOGY.md)
**Repository revision inspected:** `a3c72f1fc5374e768598348bcfde358a97a26109`

## 1. Research brief

### Question and boundary

Can a current Node/TypeScript product take an atomic, point-in-time file or working-tree
snapshot while arbitrary concurrent processes write; can it identify the writer; and can
the agent host instead supply an authoritative post-image?  The target is Linux arm64/Codex,
not a promise that every filesystem, host, or write path has identical guarantees.

The three properties are deliberately independent:

1. **Snapshot consistency:** bytes and tree membership all describe one instant (or an
   explicitly detected failure), rather than a torn/assembled read.
2. **Writer attribution/ownership:** a particular agent/process has authority for those
   bytes, rather than merely observed that they changed.
3. **Host post-image evidence:** a host says what operation completed and supplies its
   resulting path/content identity. It is not implied by (1) or (2).

The existing-solution baseline was: use a Node primitive, a maintained TypeScript lock
library, a Git tree, or a Linux CoW facility instead of a product stable-read/reconciliation
contract. It wins only if it supplies all required properties without uncontrolled source
retention or host/filesystem assumptions.

### Scope, discovery, and exclusions

Discovery used Node API documentation, Linux kernel documentation, Git documentation and
source-oriented project documentation/tests, current Codex hook documentation, the
maintained `proper-lockfile2` repository, the existing retained product research, and
GitHub issue #24/its linked resolution. Queries included `fs read concurrent modification`,
`COPYFILE_FICLONE`, `btrfs snapshot reflink`, `git write-tree index`, `Node TypeScript
lockfile`, and Codex `PostToolUse`.

Included mechanisms have a distinct consistency/ownership boundary. Excluded: editor-only
APIs, backup/sync products, and unmaintained or source-only discoveries with no primary
contract. `flock`/`fcntl` native bindings were considered as the OS-lock class, but are
not a portable Node built-in and do not compel an arbitrary writer to cooperate. A second
discovery pass produced only variants of the same five classes, which is this pass's
stopping condition; this is not an ecosystem-completeness claim.

### Local applicability witness

`findmnt -T .` on 2026-09-21 reported the workspace as `virtiofs`; `uname` reported Linux
`aarch64`, Node was `v24.20.0`, and Git `2.39.5`. This is a **RUN / RUNTIME-TESTED**
environment-identification witness, not a snapshot experiment. In particular, it is not a
Btrfs/XFS filesystem and exposes no product-controlled subvolume/volume boundary.

## 2. Candidate inventory and advisory classification

| Candidate and stated use | Class | Snapshot consistency | Ownership/attribution | Decision |
|---|---|---|---|---|
| Node `open`/`readFile`/directory walk; stable-read retry | Node API | Single read may race; no tree transaction. Retry can detect some changes, not create an instant. | None | **BORROW** a bounded stable-read + incomplete result contract. |
| Node `copyFile`/`cp` with `COPYFILE_FICLONE` | Node API / CoW copy | Reflink attempts a copy; Node explicitly makes no atomicity guarantee for copy. | None | **REJECT** as snapshot authority. |
| Cooperative lock/lease (`@bybrave/proper-lockfile2`) | TypeScript library | Can serialize participating readers/writers only. | Lease holder is a claim owner, not the host writer. | **BORROW** atomic-claim/recovery pattern; **REJECT** for arbitrary-write locking. |
| Btrfs subvolume snapshot | Linux filesystem facility | Actual filesystem-level snapshot when the tree is a managed Btrfs subvolume. | No writer identity. | **OPTIONAL INTEGRATION** only in an explicitly provisioned Btrfs deployment. |
| Linux `FICLONE` on a reflink filesystem | Linux filesystem facility | Atomic, consistent clone of **one** file; no recursive/tree transaction. | None | **OPTIONAL INTEGRATION** only for a detected supported filesystem and per-file use. |
| Git private index + `add` + `write-tree` | Git/VCS | Immutable tree after creation, but staging reads paths sequentially; not a worktree instant. Persists blobs. | Git identity is not writer identity. | **BORROW** immutable-identity/incomplete semantics; **REJECT** as default capture. |
| Codex direct tool event | Agent-host API | Exact only if the event itself identifies the resulting bytes and a current-content guard succeeds. | Recipient/root evidence may attribute a direct event. | **OPTIONAL INTEGRATION** at the host edge; no generic post-image implied. |

No external runtime dependency passes a **DEPEND ON** gate in this pass.

## 3. Evidence ledger

Accessed 2026-09-21. Source class and verification state are separate as required by the
repository methodology.

| ID | Exact proposition | Evidence | Class / state | Limitation |
|---|---|---|---|---|
| FS01 | Node warns promise FS operations are not synchronized/threadsafe when concurrent modifications touch the same file; its read API only describes EOF absent concurrent modification. | [Node FS API](https://nodejs.org/api/fs.html#promises-api), [`FileHandle.read`](https://nodejs.org/api/fs.html#filehandlereadbuffer-options) | DOC / DOCUMENTED | It does not specify a transactional stable-read API. |
| FS02 | Node says `copyFile` has no atomicity guarantee. `COPYFILE_FICLONE` only attempts CoW and falls back; `_FORCE` fails if unavailable. | [Node `copyFile`](https://nodejs.org/api/fs.html#fscopyfilesrc-dest-mode-callback) | DOC / DOCUMENTED | A successful copy is a separate destination, not evidence that source bytes were one instant. |
| FS03 | A POSIX file descriptor keeps the looked-up dentry/inode in use while open; this explains resilience to pathname replacement, not immutability of in-place file data. | [Linux VFS file object](https://www.kernel.org/doc/html/latest/filesystems/vfs.html#the-file-object) | DOC / DOCUMENTED + INFERRED | The VFS overview is not a user-space snapshot contract. |
| FS04 | Btrfs is CoW and advertises writable snapshots, subvolumes, and reflink. | [Linux Btrfs documentation](https://docs.kernel.org/filesystems/btrfs.html) | DOC / DOCUMENTED | Requires Btrfs and suitable control over subvolumes. |
| FS05 | `FICLONE` creates a CoW clone atomically relative to concurrent writes, but only for one file on the same supported filesystem; it can return `EOPNOTSUPP`. | [Linux `FICLONE(2)`](https://man7.org/linux/man-pages/man2/FICLONE.2const.html) | DOC / DOCUMENTED | It does not establish a tree-wide instant. |
| FS06 | Native Btrfs snapshot creation requires `CAP_SYS_ADMIN`; nested subvolumes are not recursively captured. | [btrfs-progs API header](https://github.com/kdave/btrfs-progs/blob/devel/libbtrfsutil/btrfsutil.h), [nested subvolumes](https://btrfs.readthedocs.io/en/stable/btrfs-subvolume.html#nested-subvolumes) | SRC / SOURCE-INSPECTED + DOC / DOCUMENTED | Requires a privileged/delegated helper and explicit nested-subvolume policy. |
| FS07 | VFS freeze (`FIFREEZE`) forces a filesystem consistent and stops writes until thawed; it is used by LVM/ioctl. | [Linux VFS freeze documentation](https://www.kernel.org/doc/html/latest/filesystems/vfs.html#struct-super-operations), [`fsfreeze(8)`](https://man7.org/linux/man-pages/man8/fsfreeze.8.html) | DOC / DOCUMENTED | Broad, privileged/disruptive mount-wide operation; not usable for ordinary review capture. |
| FS08 | Git `write-tree` creates a tree object from the index; `read-tree` operates on trees/indexes. | [Git `write-tree`](https://git-scm.com/docs/git-write-tree), [Git `read-tree`](https://git-scm.com/docs/git-read-tree) | DOC / DOCUMENTED | Neither makes sequential worktree staging an atomic worktree capture. |
| FS09 | The retained Abide research source-inspected its scratch index, `git add -A`, `write-tree` design and recorded that eligible source—including untracked source—enters Git objects. | [prior Abide report](./RESEARCH-ABIDE-2026-09-19.md) | SRC / SOURCE-INSPECTED (carried forward) | Evidence is Abide/Git behavior, not product conformance. |
| FS10 | `proper-lockfile2` documents atomic `mkdir` acquisition, mtime leases, a stale-reclaim race fix via rename, `onReclaimed`, and TypeScript declarations; its fork test is the source regression fixture. | [README](https://github.com/bybraveHQ/proper-lockfile2/blob/main/README.md), [fork race test](https://github.com/bybraveHQ/proper-lockfile2/blob/main/test/fork.test.js) | DOC / DOCUMENTED + SRC / SOURCE-INSPECTED | Cooperative protocol; a nonparticipant can write at any time. Maintenance, release/security, and host conformance gates were not run. |
| FS11 | Node `fs.watch` is platform/filesystem dependent; filename can be absent and inode replacement can prevent watching the new inode. | [Node watcher caveats](https://nodejs.org/api/fs.html#caveats) | DOC / DOCUMENTED | Notifications are not a durable history or writer record. |
| FS12 | Codex `PostToolUse` provides tool-specific input/output after a supported tool; it does not document a normalized resultant-file/post-image set. | [Codex hooks: PostToolUse](https://developers.openai.com/codex/hooks#posttooluse), [tool coverage](https://developers.openai.com/codex/hooks#tool-coverage) | DOC / DOCUMENTED | Living docs; release-specific conformance remains necessary. |
| FS13 | The accepted issue #36 resolution allows agent-addressed advice only for an exact current snapshot claimed by direct host evidence; root-wide checkpoint changes under shared writers are origin unknown/recipient none. | [issue #36 resolution](https://github.com/dearlordylord/jevs/issues/36#issuecomment-5755946932) | ISSUE / DOCUMENTED | Planning/prototype decision, not an OS-level attribution claim. |
| FS14 | Current issue #24 explicitly delegates checkpoint reconciliation/otherwise-unaccounted filesystem-change claims to issue #38. | [issue #24](https://github.com/dearlordylord/jevs/issues/24) | ISSUE / DOCUMENTED | Does not settle #38. |

## 4. Findings by property

### 4.1 Snapshot consistency

There is no Node API that takes an atomic snapshot of a mutable directory tree. `open` binds a
descriptor to the looked-up object, and a reader may hash/read/re-`lstat` to reject a detected
change; it still cannot prove that no in-place write occurred and returned to matching metadata,
nor make individually read paths one tree-wide instant (FS01, FS03). This supports the existing
**complete / incomplete / newer-pending** reconciliation shape, not a claim of atomic capture.

`copyFile(..., COPYFILE_FICLONE)` is useful only as a performance/storage optimization once bytes
were already safely captured: Node expressly declines atomic-copy guarantees (FS02). A reflink is
not a tree snapshot and must not be described as one.

Btrfs can provide the missing filesystem primitive when the product is deployed inside a product-
managed Btrfs subvolume: snapshot first, then read the snapshot. It requires a privileged or
explicitly delegated helper and a nested-subvolume policy, so is a deployment-specific escape hatch,
not a Linux/Node capability. `FICLONE` can take a consistent clone of one file on a
supported same-filesystem pair, but has no recursive/tree transaction; XFS reflink therefore does
not solve the repository snapshot problem. Mount freezing is stronger but freezes unrelated writers
and normally requires authority that the product should not assume (FS04–FS07).

Git tree objects are immutable *after* index content has been assembled, so are useful as a content
identity. `git add -A` must traverse/read the live tree first; a write can occur between paths. It
therefore cannot prove that the generated tree was one wall-clock instant, and it violates the
product's source-free retention boundary by creating objects (FS08–FS09).

### 4.2 Writer attribution and ownership

None of Node reading/copying, Git tree creation, reflinks, or Btrfs snapshots identifies the process,
agent, or host action that wrote a byte. A snapshot says *what was visible*, not *who caused it*.
Linux inotify/Node watching reports a change class/path hint, not a causal author (FS11).

Locks answer a smaller question: which cooperative participant owns a critical section or product
state transition. A lease can make duplicate hook starts elect one reviewer and safely recover a
dead owner, but it cannot stop or attribute an editor, shell, human, another runtime, or a process
that ignores the lock. Moreover, expiry/reclaim is an availability heuristic, so product claims need
generation/fencing tokens and must reject late owners; they must never treat a lease as evidence that
the lease holder wrote the source (FS10).

The only current evidence path to recipient attribution is a direct host event containing explicit
recipient/root evidence plus an exact-current-content claim. A root-wide scan remains origin unknown
in a concurrently shared worktree, exactly as the accepted issue #36 resolution says (FS13).

### 4.3 Host post-image evidence

`PostToolUse` establishes that a host reports a supported tool after it completes; it does **not**
turn arbitrary Bash/unified-exec side effects into an authoritative resulting path or post-image
schema (FS12). A direct structured edit can be treated more strongly only when the particular host
contract exposes the intended file bytes/path and the product validates that exact snapshot before
dispatch and delivery. A later scan can detect its current bytes, but cannot retroactively prove
which intermediate post-image the tool produced, or attribute a same-root competing write.

## 5. Practical options for Linux arm64/Codex

| Option | Truthful claim | Main limitation | Advisory result |
|---|---|---|---|
| Per-file stable read: open, metadata/content hash, re-stat; bounded retries | “Captured this file or marked the attempt unstable/incomplete.” | No simultaneous tree cut; metadata race residual must remain explicit. | Product baseline. |
| Serialized product claim/lease plus generation token | “One reviewer owns this product evaluation attempt.” | Does not lock or name arbitrary source writers. | Use for singleton/duplicate work only; BORROW, no dependency selected. |
| Complete checkpoint manifest + current-snapshot guard | “Observed net content at bounded checkpoints; incomplete if stability/coverage fails.” | Cannot reconstruct every intermediate write or writer. | Existing source-free direction remains the practical default. |
| Btrfs managed subvolume snapshot | “Read this Btrfs snapshot.” | Not available on this workspace (`virtiofs`); requires a privileged/delegated helper, managed deployment, and nested-subvolume policy. | Optional future deployment mode. |
| Private Git index/tree | “Immutable Git object was generated.” | Sequential capture, source persists in `.git/objects`, ignore-policy mismatch. | Reject default; borrow only lessons. |
| Watcher / command parsing | “Dirty hint; schedule reconciliation.” | Loss/coalescing and no author/post-image evidence. | Optional latency hint, never authority. |

## 6. Synthesis, Q5 implication, and remaining user decision

**Can Q5 change?** Yes, but only if Q5 currently assumes that an ordinary Node/Git/reflink read can
be made an atomic or attributable filesystem snapshot. The evidence supports replacing that premise
with this bounded statement: *a direct event may be captured and attributed only with host-provided
recipient/root evidence and an exact-current snapshot guard; all other concurrent filesystem changes
are checkpoint observations with explicit `incomplete` or `origin unknown`, not clean or agent-
addressed advice.* It does **not** support changing Q5 to promise arbitrary-writer atomic capture,
writer attribution, or a generic Codex post-image.

The remaining user question is a product trade-off, not a research fact:

> For future checkpoint reconciliation, does the user want the portable source-free,
> bounded stable-read manifest (with incomplete/origin-unknown outcomes), or an opt-in,
> explicitly provisioned Btrfs snapshot mode whose stronger consistency is available only on
> managed Btrfs worktrees and still supplies no writer attribution?

If the answer is “portable only,” Q5/#24 should retain stable-capture and attribution boundaries;
issue #38 owns the precise checkpoint/reseed/envelope decision (FS14).

### Strongest case against this conclusion

A controlled Btrfs-only product deployment could materially improve tree consistency without source
retention. This pass would change its portability conclusion if a Linux arm64/Codex deployment
contract guarantees product-owned Btrfs subvolumes, proves a supported Node/native snapshot adapter,
and runs concurrent-writer/restart tests. It would change the attribution conclusion only if a host
publishes a versioned post-image plus writer/recipient identity contract; filesystem snapshots alone
cannot provide that fact.

## 7. Traceable handoff

| ID | Advisory implication | Evidence | Uncertainty / consequence | Proposed follow-up | Disposition |
|---|---|---|---|---|---|
| FS-H1 | Model capture as stable-or-incomplete, not atomic on ordinary Node filesystems. | FS01–03 | Exact residual race definition needs a prototype. | Stable-read adversarial fixture. | Take to prototype. |
| FS-H2 | Separate reviewer ownership lease from source-writer attribution; fence reclaiming owners. | FS10, FS13 | Cross-process crash/clock behavior untested here. | Claim/lease state-machine specification and kill/reclaim fixtures. | Take to both. |
| FS-H3 | Direct host evidence plus exact-current guard is the only agent-addressed path under shared-root concurrency. | FS12–13 | Other host/version contracts unknown. | Per-host conformance matrix. | Take to specification. |
| FS-H4 | Do not make Btrfs/Git/reflink the portable default. | FS02, FS04–09 | A managed Btrfs tier could later be viable. | Opt-in Btrfs spike only if the user selects it. | Defer. |

## 8. Limitations and primary-source index

No production code, lock, hook, filesystem snapshot, paid Jev call, or tracker edit was made. Apart
from the local environment identification, this pass did not execute a concurrent-writer benchmark,
mount Btrfs, invoke privileged freeze, or install a locking library. It does not establish XFS runtime
behavior, security/maintenance health of any npm library, or live post-image behavior for a future
Codex release.

Primary sources are linked inline: Node FS documentation, Linux kernel documentation, Git
documentation, Codex hook documentation, the selected library's own README/test, and first-party
project issues/retained research. The latter two establish product intent and carried-forward source
inspection, not runtime guarantees.
