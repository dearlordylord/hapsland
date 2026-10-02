# Edit admission comparison

**Purpose:** Compare the current pre-edit permit fence with proposal A: a short
synchronous post-edit admission receipt followed by independent resident review.
**Status:** Isolated prototype; the owner-approved necessary-valid-PRE law and
positive Receipt completeness law are kernel-checked. Remaining candidates are
unapproved and open. No production change.
**Authority:** Advisory design, falsification and model-proof evidence. The accepted target contract
and production Bend modules remain authoritative; this prototype does not change them.
**Expected use:** Inspect the approved proof slice and the remaining candidates
before further approval. Model proofs do not establish runtime conformance;
passing literal probes do not prove open universal laws.
**Lifecycle:** Temporary through the edit-admission design decision milestone.
Consolidate accepted requirements into `docs/advicing-target-contract.md` and
production law/test owners; delete the superseded prototype after the replacement
is checked. Move unresolved useful evidence to `docs/monkey-capacity-workbook.md`.

## Model boundary

`core.bend` computes both models over the same external histories. `Current`
imports production `packages/agent-flow-bend/Admission.bend` for scope/lifetime,
permit issue/consume/release/close/restart decisions. The adapter projection adds
bounded completed IDs, expiry-before-consume (at deadline is expired), and small
illustrative pending capacity 2 / prospective window 5 ticks. These are toy limits,
not the native 32/4096 defaults. Duplicate PRE keeps the same pending state; this
model exposes no PRE acceptance-response status. It omits Canonical's global
round slots, multiple-partition resident occupancy and precise fractional clock
intervals. It is a faithful use of the imported low-level decisions plus an
explicit small wrapper, **not equivalence with the entire production adapter**.

`Receipt` observes partition, resident lifetime, native tool ID, receipt time and
bounded retained identities. A previously unseen, correctly scoped receipt after
the observed closure fence is accepted. It receives no native edit start,
completion or monitor verdict. A missing PRE, expiry or capacity rejection in
Current does not prevent A from accepting that receipt. These are changed admission
criteria, not proof that every edit gets reviewed: lost POST still loses intake.

`NativeStart` / `NativeComplete` are hidden chronology labels, no-ops for both
reducers. The trace list records observation order; labels may describe earlier
native times. `traces.bend` reads native start and closure times **only in its
output monitor**, independently of admission, to display whether an edit is fresh.
Current's native-freshness implication additionally assumes the runtime keeps the
edit behind its synchronous PRE and `native_start >= admitted_pre_start`. The
`host-order-premise-violated` case shows Current can accept an old native edit when
that premise is false. The core cannot prove a host ordering premise.

`RoundClose` means **accepted successful round closure**, after any real Stop
waiting/decision, not every native Stop invocation. `Continue` increments a
cumulative spending monitor only. There is no four-continuation allowance gate,
output authorization, automatic allowance grant or per-round budget reset model.
Preserving this monitor on receipt/closure/restart says nothing about production
continuation allowance for a genuinely new round. The proposal's allowance policy
needs a separate accepted decision and model if it is to be proved.

Snapshots, semantic attribution, source-current checks, preparation, credentials,
Jev calls, callback binding, IPC disconnect and delivery are outside this small
admission projection. The merged master now uses bounded synchronous Claude
response authority, without retained tickets; this prototype depends on neither
old ticket transport nor its former registry.

## Exact approval candidates

The source draft `LAWS.bend` deliberately retains ten open declarations.
`current_fence_witness` was approved, copied into `approved/LAWS.bend`, and proved
in `approved/PROOF.bend`. A subsequent approval covers only the positive Receipt
specialization, `approved-receipt/LAWS.bend`'s `receipt_complete`. Neither approval
covers the entire first family, Current completeness, negative admission policy,
the full `exact_post`, remaining families or adoption of proposal A.
The following table is the candidate inventory, not a list of proved guarantees.

| Family | Declaration(s) | Plain meaning / why it matters |
| --- | --- | --- |
| L1 Exact valid receipt and current witness | `exact_post`, `current_fence_witness` | Current accepts iff the independently inspected pending permit, scope/lifetime, completed identity, round and strict expiry predicates hold. A accepts iff its scope/lifetime, retained identity and arrival-fence predicates hold. Current acceptance has a correlated PRE start strictly after closure; only the stated host-ordering premise turns that into native edit freshness. Reject-all is excluded. |
| L2 Open/join exactly | `post_round`, `post_active` | Acceptance joins the active round or opens precisely its successor; refusal changes neither round nor active status. Does not assert source attribution or callback behavior. |
| L3 PRE is prospective only | `pre_boundary` | A PRE alone admits no review and opens no round. This prevents early round opening even with a valid permit. |
| L4 Retained dedupe and bounded sequence | `post_idempotent`, `retention_bound`, `retained_sequence` | Immediate replay has no second state effect; completed retention is at most 1000, and acceptance prepends the ID then keeps the exact independent `Base.List.take` prefix. Eviction and restart mean no lifetime-wide dedupe claim. |
| L5 No hidden native oracle | `native_erasure` | Each native start/completion label independently leaves either reducer unchanged, even when POST could occur between them. A therefore cannot secretly distinguish old versus new using monitor truth. |
| L6 Spending monitor conservation | `authority_accounting` | The cumulative counter changes by one only on explicit `Continue`; receipt/PRE/closure/restart do not change it. This is accounting, **not proof of allowance bounds or replenishment policy**. |

L1/L2 quantify reachable states through arbitrary histories; the remaining local
properties quantify states directly. Predicates in `spec.bend` inspect permit
fields independently of the reducers. Exact retention uses Base's separate list
take implementation. Native monitor times do not appear in eligibility.

## Computed outcomes and counterexamples

`evidence/traces.log` is output from Bend, not JavaScript admission decisions.
Counts include any earlier accepted edit used to establish the closure fence.

| Same case | Current new acceptance | A new acceptance | Meaning |
| --- | --- | --- | --- |
| Normal correlated receipt / before deadline | yes | yes | Positive control; both admit real valid inputs. |
| Missing PRE / expired / released / third pending slot / late prospective PRE | no | yes | A improves admission coverage under its changed criteria. |
| At exact expiry deadline | no | yes | Production adapter expiry-before-consume is represented. |
| Known duplicate / wrong advicee / original wrong lifetime | no | no | Shared identity/scope rejection. |
| Unseen old POST after closure vs genuine fresh POST with no PRE | no / no | yes / yes | Different native histories, identical observable A decision. A cannot promise strict native freshness from receipt facts alone. |
| Genuine fresh POST with fresh PRE after closure | yes | yes | Current is not reject-all; the fence permits a genuinely new attempt. |
| Old event restamped with new resident lifetime | no | yes | An unseen event first arriving after restart can be ambiguous; a newly attached lifetime is not original-edit provenance. |
| PRE before native edit ordering premise deliberately violated | yes | yes | Outside Current's supported host-order premise; no unconditional native-freshness claim. |

`evidence/indistinguishable.bend` checks the literal old/fresh A state equality.
The two deliberately false claims in `false-arrival-freshness.bend` and
`false-current-coverage.bend` fail by concrete normalized count mismatch: A admits
an unseen old event, and Current does not admit an actual edit without PRE.
Neither counterexample says reviewing an attributed current snapshot is inherently
unsafe. It exposes a choice between strict origin freshness and receipt coverage.

## Falsification and reproducibility

Bend version: 2.0.34. `bend guide` was read under five seconds. `lawcheck` and
`bend-falsify` were absent; no package was installed and neither tool was run.
The fallback is generated literal substitution into the **actual draft law
statements**, compiled in batches using `bend-check` (five seconds per invocation).

Run `./check.sh` from this directory. `falsify.py` generates syntax and checks
literal instances; Python never reduces an admission decision. Its deterministic
histories cover normal, pending, closed, restarted, consumed, expired, released,
capacity, duplicate and cumulative-spending contexts with matching/wrong scope
and lifetime. This is bounded falsification, not exhaustive history exploration.
Per-law counts and batch exit codes are in `evidence/falsification.json`; generated
bulk probes are ignored and reproducible. Boundary probes exercise retention
0/1/999/1000/1001. The planted reject-all A mutation must first compile, then fail
an exact-admission positive control. A baseline control passes. Wrong compiler
syntax or an uncompiled mutant does not count as catching a bug.

The source draft checker intentionally reports ten TODOs and exits 1. The
approved subset checks separately; this preserves the unapproved candidates
without treating their open declarations as a failed completed proof.

## Approved first law and its exact scope

The owner's approved meaning was: **Current accepts an edit only with a correlated
valid PRE record started after closure; A does not claim that guarantee.**
`approved/PROOF.bend` proves the frozen `Laws.current_fence_witness` and the
necessary strengthening `current_valid_pre`. The latter proves that any receipt
which changes the acceptance count satisfies `approved/validity.bend`'s
`valid_pre` predicate after the adapter's expiry sweep:

Acceptance is represented by the frozen model's counter and `accepted` helper.
This necessary law alone permits reject-all and does not pin every round/active
effect; completeness and full acceptance topology remain unapproved candidates.

- requested partition and resident lifetime match the production admission state;
- the looked-up permit matches the native tool identity and the production
  candidate round;
- its start is strictly after the closure fence and no later than receipt time;
- receipt time is strictly before its deadline (at-deadline expiry rejects it).

The original-state freshness witness is proved through arbitrary reachable
histories; checked expiry lookup/subset facts connect the surviving record with
the original pending record. This is necessary validity only. It does **not**
prove the unapproved `exact_post` biconditional or claim agreement with every
outer `spec.bend` eligibility predicate. Proof-owned lemmas support this one
approved meaning; no other product-law family was proved.

The proof imports mathematical facts from the owner-approved proof-only
`vendor/bendlib` submodule pinned to
`7601039f3fe561cb30e4bb7adefbcfba708c1f6c`. Runtime core modules do not import
mathlib. `approved/approval.json` records the semantic approval, frozen source
hashes and exclusions. The source core and draft law statement were unchanged.

Run `python3 approved/check-validity.py` for bounded necessary-validity probes,
and `python3 approved/check-approved.py` for the approved kernel and mutation
gate. The latter checks the normal kernel verdict, a disabled-kernel negative
control, the still-open source draft, a compiling missing-PRE bypass mutant,
and a literal instantiated at the exact approved law binders. The mutant's
true supporting freshness invariant is adapted only in the generated mutant
mirror: the bypass leaves the permit state unchanged after expiry. The approved
law and main proof remain unchanged. The mutant then fails specifically at
`Laws.current_fence_witness`, rather than an earlier shared lemma.
`evidence/approved-gate.json` and its logs record those nine checks.

The host ordering premise remains external and unproved. No IO, snapshots,
callbacks, native runtime conformance, real Stop waiting, four-continuation
allowance or deployment guarantee follows from this admission proof. Remaining
laws require separate owner approval before proof work.

## Approved positive Receipt admission

The next approved meaning was: **A accepts a correct new post without PRE.**
`approved-receipt/LAWS.bend` freezes only the positive implication
`eligible(Receipt) == True` → acceptance count increases by one.
`approved-receipt/PROOF.bend` proves it for arbitrary histories. A correct receipt
means matching partition and resident lifetime, arrival strictly after the
observed closure fence, and an identity absent from retained completed IDs.
“New” means unseen within this retention/lifetime scope; it does not establish
when the native edit happened. PRE is neither required nor a proof premise.

This is positive completeness only. It excludes reject-all, but does not prove
that ineligible receipts are refused. Current completeness, round/active effects,
review execution and delivery coverage remain outside this approval.

Run `python3 approved-receipt/falsify.py` for 896 bounded implication probes
(14 histories, 23 batches), checked before the universal proof was written.
Run `python3 approved-receipt/check-approved.py` for eight controls, including
the first slice's preserved nine-control gate. The new gate checks the kernel,
a disabled-kernel control, and a no-PRE literal instantiated from the exact law
and its eligibility premise. Its reject-all mutant replaces the Receipt POST
branch with unchanged state; it compiles, then fails both the literal and
`Laws.receipt_complete`. Predicate, law and proof sources remain unchanged in
that mutant; no supporting proof adjustment is needed.
`evidence/receipt-approved-gate.json` records the result and source hashes.
