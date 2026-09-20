# Issue #4 shell-write detection prototype

This is a bounded, disposable experiment for GitHub issue #4. It answers one
question: can a product-owned source-free manifest reconcile net working-tree
changes at a checkpoint while applying the experiment's captured file policy?
The policy captures protected paths and a simplified include/exclude matcher; it
is not a proof of full product-policy or consent-layer parity.

The experiment compares two paths behind the same checkpoint behavior:

1. a full policy walk that hashes stable eligible regular files; and
2. Git NUL-delimited porcelain as a candidate hint followed by the same full
   experiment-policy walk as the authority.

The private-index Git snapshot is not reimplemented here. The retained Abide
research evidence already demonstrates its source-bearing Git object consequence;
this prototype therefore keeps the comparison focused on the proposed
host-neutral manifest and the optional Git acceleration.

The retained run is offline and source-free. It used temporary Git repositories
and owner-only state directories on the Linux arm64 issue-4 worktree. The runner
reported `12 scenarios passed`, `10 benchmark rows generated`, and exit status
`0`. The evidence is an observational prototype result, not production host
conformance; replay metadata and unavailable scope are recorded in
`evidence/summary.json`.

## Run

From the repository root, with the pinned repository dependencies unchanged:

```sh
node --experimental-strip-types experiments/shell-write-detection/run.ts
```

The command creates temporary Git repositories and temporary state directories,
runs all assertions, scans the current repository read-only for the actual-tree
benchmark, creates 1,000- and 10,000-file synthetic trees, and removes all
fixtures before exit. It prints only a source-free pass summary.

To retain sanitized evidence:

```sh
node --experimental-strip-types experiments/shell-write-detection/run.ts --write-evidence
```

This writes only `evidence/records.jsonl`, `evidence/summary.json`, and this
directory's short `evidence/README.txt`. The retained files contain IDs, paths,
hashes, counts, timings, and bounded issue codes; they contain no fixture source
bytes, credentials, or paid responses. Timings are observational and will vary by
machine.

## What is exercised

The deterministic fixtures cover:

- dirty state at session baseline;
- added, modified, deleted, and rename-as-delete-plus-add paths;
- product-eligible ignored and untracked files;
- an excluded sentinel whose bytes are never opened, hashed, persisted, logged,
  or emitted;
- a partial `excluded/*.ts` pattern that traverses its directory, skips the
  excluded TypeScript file, and still includes an eligible JavaScript sibling;
- exact revert before a checkpoint;
- symlink and FIFO/nonregular handling;
- mutation during the stable-read window;
- a non-adversarial concurrent add to an already-enumerated directory while a
  sibling directory is scanned;
- injected content-read and directory-enumeration failures;
- duplicate trigger idempotence;
- valid restart plus corrupt and incompatible state reset;
- separate Git worktree identity and isolated state; and
- atomic source-free state replacement.

An incomplete scan has no manifest and cannot advance checkpoint state. In
addition to per-file pre/post-read checks, the scan records every traversed
directory's identity and sorted entry facts, then revalidates them after the
walk. This catches a non-adversarial add such as `a/late.ts` after `a` was
enumerated but before `b` finished. The final validation is a bounded
quiescence boundary: a writer that changes the tree after that boundary, or an
adversary that defeats filesystem metadata, is outside this prototype's claim.

A complete scan persists only normalized relative paths, content hashes, sizes,
modes, policy identity, and a hashed canonical-worktree identity. Rename
identity is not inferred: the manifest reports a deletion and an addition.
Whole-subtree exclusions such as `excluded/**` may be pruned; partial file
patterns are always traversed and filtered so eligible siblings are not lost.

The benchmark records cold baseline, warm no-change, one-file change, and
multi-file change rows for the synthetic trees. The actual repository is read
only and supplies cold/warm rows; mutating it would violate the worktree's
change boundary. Each retained benchmark row is one observational sample per
phase on the replay host, not a statistical latency guarantee. `summary.json`
records the exact replay command/configuration, Node/Git/OS/architecture/kernel
metadata, expected and observed outcomes, retained paths, and unavailable
scope.

The prototype does not establish multiprocess state locking, writes during host
review, full product-policy/consent fidelity, or oversized-file and
over-budget behavior.

The retained benchmark rows are: actual repository (243 files), cold `222.26 ms`
and warm `174.90 ms`; synthetic 1,000-file, cold `699.33 ms`, warm `273.29 ms`,
one-file `4,170.15 ms`, multi-file `3,576.77 ms`; synthetic 10,000-file, cold
`20,753.68 ms`, warm `18,465.21 ms`, one-file `14,642.90 ms`, multi-file
`11,779.49 ms`. Each row hashes every eligible file and revalidates every
traversed directory. Timings depend on this machine and are not a universal
per-Bash budget. The candidate authoritative Stop catch-up envelope is therefore
up to 1,000 small files under 5 seconds on this Linux arm64 host. Ten-thousand
files are too slow for realtime per-Bash use; a post-Bash scan is only an optional
early scan when a prior measurement fits a much tighter budget and does not have
coverage authority by itself. No 100,000-file, HDD-like, cross-platform,
watcher, or production lock matrix was run; private-index reimplementation is
not required for issue completion.
