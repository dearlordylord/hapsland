# Prototype verdict — issue #4 shell-write detection

## Result

The source-free manifest using the captured experiment policy is sufficient as
the correctness authority for the bounded checkpoint contract exercised here.
This is not evidence of full product-policy or consent-layer parity. Git
porcelain is useful as a candidate/wake-up hint, including for status
visibility, but the authoritative policy walk is still required.

The retained run passed 12 offline fixtures and retained sanitized benchmark
evidence with exit status `0`. The evidence replay metadata records the exact
command/configuration, environment, expected and observed outcomes, and
unavailable scope. The prototype does not establish host lifecycle behavior,
watcher coverage, a production state-lock protocol, or a latency guarantee for
repositories beyond the measured fixture.

The benchmark supports a candidate authoritative Stop catch-up envelope through
1,000 small files under a 5-second scan budget on this Linux arm64 host. The
10,000-file rows took 11.8–20.8 seconds and are not a realtime per-Bash
envelope without optimization. A post-Bash scan is only an optional early scan
when a prior measurement fits a much tighter budget; the hint has no coverage
authority without Stop catch-up.

## Observations

- A dirty session baseline is represented by the first complete manifest, not by
  `HEAD` or the real Git index.
- Net add/modify/delete detection is deterministic. Rename identity is safely
  represented as a deletion plus an addition.
- A product-eligible ignored file is found by the policy walk even though Git
  ignore state is not a product selection rule. Git hints alone therefore cannot
  be the coverage authority.
- An excluded sentinel is never content-read and does not occur in the
  source-free scan result or persisted state.
- Exact write/revert pairs are net unchanged at the checkpoint.
- Symlinks and nonregular files are skipped without content reads.
- A mutation between the pre-read and post-read stability checks rejects the
  scan. Read and enumeration failures likewise return `incomplete`, retain the
  prior checkpoint, and never publish a partial clean result.
- A directory identity/entry-fact revalidation after traversal rejects a
  non-adversarial add to an already-enumerated directory while a sibling is
  scanned; the next checkpoint then reports that late file. The final
  revalidation is a bounded quiescence boundary, not a guarantee against a
  writer that acts after it or an adversary that defeats filesystem metadata.
- Partial file excludes are traversed and filtered. Only explicit whole-subtree
  globstar forms (plus the built-in protected directory names) can prune a
  directory, so `excluded/*.ts` cannot hide an eligible `excluded/keep.js`.
- Duplicate triggers are idempotent after the complete checkpoint advances.
- A valid restart resumes from compatible state. Corrupt or incompatible state
  seeds a new baseline with `coverage: unknown`; it does not invent historical
  changes.
- Separate worktrees receive distinct hashed state identities and do not alter
  one another's pending changes.
- State files contain no source text. They are written through a temporary
  owner-only file followed by an atomic rename.

The benchmark exercises full content reads because correctness cannot rely on
lossy metadata. The retained rows report bytes read, content reads, state size,
wall time, and CPU time for the current repository and 1k/10k synthetic trees.
Each row is one observational sample per phase on the replay host, not a
statistical latency guarantee. The values are machine-dependent; selecting a
product cadence requires an explicit supported-size and timeout envelope.

The retained `summary.json` records the exact replay command/configuration,
Node/Git/OS/architecture/kernel metadata, expected and observed outcomes,
exit status, retained paths, benchmark interpretation, and unavailable scope.
The unavailable scope includes multiprocess state locking, writes during host
review, full product policy/consent fidelity, and oversized-file or
over-budget behavior.

## Decision handoff

`BORROW` the complete-or-incomplete checkpoint semantics and stale-read rule.
Implement a product-owned manifest behind the later checkpoint contract, after
promoting the accepted policy and consent semantics into the normative product
specification.
`OPTIONAL INTEGRATION` Git porcelain for candidate acceleration and diagnostics;
always run an authoritative policy catch-up walk before claiming coverage.
`REJECT` Git's private-index/tree snapshot as the default mechanism because the
existing Abide evidence shows that staging the worktree stores source-bearing
blobs in `.git/objects` outside the product's retention policy. `REJECT` shell
command parsing and filesystem notifications as correctness authorities.

## Future specification and production gates

1. Promote the bounded Linux arm64/headless Codex 0.155.1 path, Stop catch-up,
   up-to-1,000-small-file/5-second candidate budget, over-budget incomplete receipt,
   and optional measured early scans into the normative product specification.
2. Preserve the regenerated prototype evidence and re-run the lifecycle probe on
   each supported host upgrade.
3. Add production locks, duplicate/out-of-order handling, write-during-review
   retry, restart recovery, and unwritable/over-budget process-boundary tests.
4. Keep interactive PTY, separate unified-exec/`write_stdin`, 100,000-file/HDD,
   watcher, and extractor matrices outside issue completion unless the supported
   scope expands.
5. No Jev or paid call was made; any live validation remains a later authorized
   milestone.
