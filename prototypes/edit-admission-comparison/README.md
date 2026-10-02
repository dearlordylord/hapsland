# Edit admission comparison

**Purpose:** Compare the current pre-edit permit fence with proposal A: a short
synchronous post-edit admission receipt followed by independent resident review.
**Status:** Isolated prototype; three owner-approved slices are kernel-checked:
necessary valid PRE, positive Receipt completeness, and delayed POST after
successful closure. Remaining candidates are unapproved and open. No production change.
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

## Decision: what would justify removing PRE?

**Owner outcome:** Delayed POST for an old edit must not open a successor round.
The existing strict closure requirement is retained; bare A is rejected as an
implementation direction. Keep PRE unless verified original-attempt provenance
provides equivalent evidence. This decision does not validate native host ordering.

The accepted contract already requires **only a provably fresh edit may open a
round after closure** ([target contract, line 96](../../docs/advicing-target-contract.md#advicee-identity-and-admission)).
Its PRE/start/deadline/host-order requirements are at lines 112–140; its explicit
restart attribution limitation and lifetime-scoped continuation cap are at
lines 371–376. The comparison therefore has a concrete compatibility result:
**bare A is not a replacement under that existing closure requirement.**
This does not make late review of an attributed current snapshot inherently
unsafe; it means its authority to open a successor differs from the contract.

| Situation / required guarantee | Current projection | A projection | Premise or limit |
| --- | --- | --- | --- |
| Correct new POST without successful PRE | Incomplete admission | Accepted | Checked positive Receipt law; not a guarantee that POST arrives. |
| New round after accepted closure requires native edit start after closure | Correlated fresh PRE provides the start fence | Receipt arrival alone does not provide native freshness | Current needs the external synchronous host-order premise; bare A conflicts with the accepted requirement. |
| Old unseen POST delayed past closure versus genuinely fresh unseen POST | Neither accepted without a permit | Both accepted, opening successor round 2 | Their observable receipt histories are identical; native chronology differs only in the monitor. |
| Known duplicate after closure | No second admission | No second admission | Literal case; identity evidence is bounded, not durable dedupe. |
| Several POSTs before closure | Only successfully permitted observations admitted | Each eligible unseen receipt joins the active round | Computed model behavior; round topology remains an unapproved law candidate. |
| PRE fails open, is missing, expires or reaches capacity | Native edit can happen without review admission | A can accept a later correct POST | Current hook returns quiet even on registration failure; no claim every actual edit is reviewed. |
| POST is lost | No observation admitted for that edit | No observation admitted for that edit | PRE alone does not produce review; recovery would need separately attributed evidence. |
| Old IPC retains original resident lifetime after restart | Rejected | Rejected | Literal case; accepted contract deliberately loses old work and leases. |
| Previously unseen old event is stamped with the new lifetime | Still needs a fresh correlated PRE; not an absolute origin proof | May be accepted as newly arrived | Current POST attaches the connected resident lifetime; the accepted contract explicitly limits restart attribution. |

`decision/cases.bend` computes six focused cases; `evidence/decision-cases.log`
records counts/rounds for lost POST, three POSTs before closure, known late POST,
the old/fresh indistinguishable pair, and restamped old POST after restart.
In the decisive pair Current stays at one accepted edit / round 1; A reaches two
accepted edits / round 2 for both old and fresh native histories. No snapshot,
Jev call, advice delivery or four-request allowance is simulated. Opening a new
round matters to a per-round allowance policy, but this model does not prove or
measure budget replenishment.

The source boundary supports this distinction: `src/direct-event/model.ts:12–27`
and `:57` identify session/tool and observation, not native start/origin epoch;
`src/resident/protocol.ts:52–57,76–85` carries observation and current lifetime;
`src/resident/client.ts:326–333` obtains that lifetime at POST handling.
`src/resident/composed-hook.ts:110–113` registers PRE with the conservative process
start from `src/resident/hook-clock.ts:4–7`; `src/resident/server.ts:681–694`
consumes the tool-correlated permit. These are source-inspected current adapter
facts, not a claim that upstream runtimes can never supply better provenance or
that supported runtime ordering has been empirically verified.

**Recommendation:** Keep PRE while preserving the accepted strict post-closure
native-freshness requirement. Its necessity is for that admission fence, not
for capturing or reviewing edits in general. If the owner instead prefers
post-receipt coverage, explicitly change the closure admission requirement before
adopting A and separately decide how late observations affect successor rounds
and their continuation allowance. No additional universal proof is needed to
make this policy choice: the computed indistinguishable pair already defeats
bare A's strict-freshness claim.

A can preserve the strict requirement with compensating evidence only if it is
correlated to the original tool attempt and reliably ordered against closure:
for example a native edit-start timestamp on a shared trusted clock, or an
original monotonic event sequence/epoch plus a closure watermark and a verified
drain/order contract. Original lifetime binding and bounded replay handling
must survive retries/restarts where claimed. A short synchronous POST receipt
before background work improves ordinary intake ordering but cannot identify an
old event first observed after closure by itself. POST arrival time, prompt/turn
ID, or a freshly assigned resident lifetime alone is insufficient. None of these
compensating runtime contracts has been implemented or validated here.

Advisory classifications: **BORROW** the correlated start/fence and immutable
attempt identity pattern; **REJECT** bare A as a drop-in for the current strict
closure contract; treat an arrival-based A policy as an **OPTIONAL INTEGRATION**
experiment requiring an explicit product decision. No new **DEPEND ON** candidate
is proposed. Contract statements are DOC/accepted; implementation boundary facts
are SRC/inspected; model outputs are SRC/executed; native conformance is UNKNOWN.

`decision/LAWS.bend` contains three **unapproved** candidates: whole-trace native
label erasure for A; conditional Current native freshness under the external
host-order premise; and exact A round/active boundary effects. They clarify
possible next proof scopes, not prerequisites for this decision. Their 392 literal
instances pass (8 erasure, 288 conditional freshness, 96 boundaries), and their
universal checker intentionally reports three TODOs. Sketches: induct over
histories for erasure; combine the already checked PRE fence with the explicit
native-start ordering premise for conditional freshness; inspect accepted/refused
round effects for boundaries. No proof terms were written for these candidates.

## Approved pending PRE followed by closure and delayed POST

The owner next approved: **if PRE is registered, its round successfully closes,
and the corresponding POST arrives afterward, reject it and do not open a
successor round.** PRE alone does not open a round.
`approved-closure/LAWS.bend` therefore starts with a reachable Current state
whose wrapper and production admission round are active and whose native tool
has an actual pending permit. Closure time must be no earlier than the recorded
fence or the correlated PRE start. The expression closes the state and then
posts directly, with matching owner/lifetime/tool and no intervening PRE or
restart. POST time is nondecreasing, so equal-clock Close→POST events are included.
A rejected inactive/backdated closure is not substituted for successful closure.

`approved-closure/PROOF.bend` proves all three outcomes: acceptance count remains
the pre-closure count, round ID remains the pre-closure round, and active status
is false. The state/history equality witness pins reachability to the frozen
Current reducer; pending presence is inspected independently of the POST reducer.
The proof uses production closure's permit purge and source-free bookkeeping,
then the empty-authority POST fact. That helper works for every POST clock; the
approved statement deliberately names the normal nondecreasing event domain.
It does not establish the host's native ordering, classify arbitrary Stop calls
as successful closures, cover a fresh PRE after closure, or cover restart.

Before proof work, `python3 approved-closure/falsify.py` checked 160 concrete
active/pending-PRE cases with each independent premise explicitly true, including
32 same-clock POST cases. `controls.bend` separately checks excluded inactive
and backward-clock rejected closures. Run
`python3 approved-closure/check-approved.py` for eleven controls, including both
prior approved gates. Its compiling dropped-closure mutant retains the old
production admission state and completed identities while the wrapper becomes
inactive. This deliberately defeats multiple closure defenses, not merely
retention of a permit that the fence could still reject. A computed witness
actually reaches two accepted edits, successor round 2 and active status true.
The exact approved literal and unchanged main proof then fail at
`approved_at` and `Laws.delayed_post_after_close`; all supporting proof files are
unchanged and still kernel-check. No equivalent mutation is counted as caught.

`evidence/closure-approved-gate.json` records the checks and source hashes.
The frozen core, original draft, and both prior approved laws/proofs are unchanged.
The separate conditional native-freshness chain is deferred: the owner found
its explanation clear and delegated whether it needed a proof; no separate
proof was necessary for this closure decision. Other decision candidates remain
unapproved and unproved.
