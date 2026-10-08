# Current edit-admission proof prototype

**Purpose:** Preserve three checked Current admission properties and their falsification controls.
**Audience:** Prototype contributors and evaluators; Product and specification owners.
**Status:** Temporary model/proof evidence; the rejected post-only A experiments have been deleted.
**Authority:** Owner-approved model laws and implementation evidence, not a replacement for the accepted product contract.
**Expected use:** Run the Current gates, inspect their explicit assumptions, and retain useful controls until production-aligned replacement checks exist.
**Lifecycle:** At the edit-admission design decision milestone, consolidate accepted requirements into `docs/advicing-target-contract.md` and production law/test owners; delete this prototype after replacement checks pass. Unresolved runtime validation remains scoped below until verified or transferred to the replacement checks.

## Retained checked properties

| Slice | Checked meaning | Gate |
| --- | --- | --- |
| `approved` | Current acceptance requires a correlated valid PRE after the closure fence: matching scope/lifetime/tool/production candidate round, start no later than POST, and POST strictly before the original deadline after expiry sweep. | `python3 approved/check-approved.py` |
| `approved-closure` | A reachable active round with pending PRE, successfully closed, rejects its matching later POST without changing count or round or becoming active. No intervening PRE/restart; equal clock timestamps are included. | `python3 approved-closure/check-approved.py` |
| `approved-reopen` | An already completed closed round, fresh unseen tool and independently successful PRE registration followed by a timely matching POST increments acceptance, opens its successor and becomes active. | `python3 approved-reopen/check-approved.py` |

The reopen law is conditional on actual PRE registration success; it does not
prove every raw PRE registers or exclude a reject-all PRE implementation. Its
mutant rejects reopening POST while preserving successful PRE premises. The
closure mutant actually reopens an old attempt; the validity mutant accepts
without PRE. Each compiles and fails an exact law literal and its own proof site.
The validity mutant needs the explicitly recorded mutant-only supporting
invariant adaptation; approved law/proof bodies remain unchanged.

The two later gates recursively preserve earlier Current gates. Their checker
controls include a disabled-kernel failure. `./check.sh` runs Current-only draft
literal probes, a compiling reject-all POST control, traces and retention
boundaries. Draft laws remain unapproved and unproved; passing literals is not a
universal proof. The positive reopening slice has 128 concrete cases (8 equal
start/issue/POST); closure has 160 cases (32 equal close/POST).

## Model and runtime boundary

Current imports production `Admission.bend`; its surrounding wrapper is an
explicit small admission projection with toy permit capacity 2, prospective
window 5 and retained completed identities 1000. It is not the entire resident.
PRE alone opens no round. Adapter expiry runs before POST and removes deadlines
at `now >= deadline`; direct production consume's inclusive deadline therefore
does not make this wrapper's at-deadline POST valid. `RoundClose` means accepted
successful round closure, not every native Stop invocation.

Canonical resident round slots (64), ledger, source capture, revision, Jev,
callbacks, delivery and actual Stop four-continuation authority are omitted.
Successful PRE does not reserve a production round slot or guarantee review.
NativeStart/Complete are monitor-only; actual synchronous host ordering remains
an external premise. Mutation timestamps are not native tool-start evidence.
The cumulative spending monitor proves no allowance bound/reset policy.

The accepted contract requires provably fresh edits after closure. Bare post-only
A was rejected because arrival facts cannot distinguish delayed old POST from a
fresh attempt; its experiments and proof slice are removed. This does not claim
that reviewing current snapshots is intrinsically unsafe. Retain PRE unless
verified original-attempt provenance supplies equivalent accepted evidence.

## Cleanup provenance

Owner-requested cleanup removed Receipt branches and comparison experiments.
Current reducer expressions and all three approved law/proof statements were
preserved. Approval manifests record the previous core hash and new Current-only
core hash; new gate reports validate the cleaned artifact rather than claiming
the original frozen whole-core hash still matches. No new laws were proved.
Pinned proof-only mathlib remains at `7601039f3fe561cb30e4bb7adefbcfba708c1f6c`.
Bend is 2.0.34 and every checker invocation uses `bend-check`'s five-second limit.
`lawcheck`/`bend-falsify` are unavailable; literal substitution is the disclosed
fallback, not a claimed invocation of those tools. No native PRE fault evidence
was deleted; the source-free reports remain in `evidence/native-negative/` with their original bounded claims.

## Remaining validation boundary

The six PRE-only native probes do not establish tool-start provenance or
registration followed by cancellation, late IPC/retry, closure or restart.
These remain separate empirical checks before stronger runtime support claims.
The three Current model proofs do not require further arrival-only comparison
experiments; that alternative was rejected and removed.
