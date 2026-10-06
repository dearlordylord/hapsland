# Hapsland agent flow in Bend

**Purpose:** Explain the Bend package, production boundary, generated artifacts, and executable checks.
**Status:** Active package documentation.
**Authority:** Maintained guidance; linked specifications own accepted product behavior.
**Expected use:** Build, inspect, and change Bend models and their checked production adapters.
**Lifecycle:** Maintained alongside package source, build scripts, and adapter changes. Review whenever a transition owner, generated ABI, build command, or model/production boundary changes, including #137 authority reconciliation and #138 import-graph adoption.

`ImportGraph.bend` defines source-free supporting-reference traversal for one
review unit. Its compiled graph and checked TypeScript adapter support the
visualization's replay. Run `npm run test:import-graph` for its laws and
independent traces. `import-graph-proof/LAWS.bend` and
`import-graph-proof/PROOF.bend` contain the general budget and finite-event
termination theorems; this command checks their BendTT kernel verdict.
The model holds pending edges, visited declaration IDs, phase, counters, and
the complete or incomplete result. Native code supplies syntax and import
binding, path eligibility, and stable capture facts. Bend chooses the next
edge and whether the measured work fits its limits. Before each supporting
source read, native code checks the path against containment, protected paths,
Git ignore, and user file selection. A denied path is never read; the graph
records an omission and later rule selection checks whether that evidence is
required. The separate dashboard import
view replays this checked model; production review uses the shared checked
`Canonical.step` adapter for its decisions.
Supporting tree contributions that do not fit the remaining budget emit `SkipImport(TreeLimit)` while
later pending edges continue within the file, read, work, depth, and deadline
limits. The accepted tree remains within its effective configured cap (20 KiB
by default). A graph with a skipped import finishes incomplete; a rule that does
not need that import may still reach Jev with the omission marked.
Each unit holds one versioned limits value and an event budget of
`4 × work + 2`. Each delivered graph event spends one event; exhaustion
terminates incomplete even when a captured node reports zero bytes. This
conditional liveness result assumes each `ResolveEdge`, `CheckPath`, and
`ReadSource` command eventually receives its matching fact or the host
delivers `DeadlineReached`. A stalled external command supplies no event.
Terminal phases deliberately self-loop on subsequent events.
Denied import paths emit `SkipImport(Excluded)` before any source read and leave
later edges pending. Missing, ambiguous, and unsupported targets also emit
`SkipImport` and leave later edges pending. If both a denied path and a tree-budget
skip occur, the final graph reason is `TreeLimit`; otherwise a denied path finishes
`Excluded`. Other omitted imports finish `Omitted`.

`Canonical.bend` is the production transition model and drives the main
visualization through the checked TypeScript adapter.
The maintained [TypeScript decision boundary ledger](../../docs/typescript-decision-boundary-ledger.md)
records reviewed product choices intentionally made outside this reducer.
`Flow.bend` remains only as a shared capacity-type dependency of the existing
Work policy artifact; no page or production path invokes `Flow.step`.
The older `Advicing.bend` is a small proof slice retained for continuity.

`Admission.bend`, `Work.bend`, and `Handoff.bend` extend the model with
pre-edit permits, observation fan-out, per-finding handoff limits, finish
reservation, and exclusive delivery leases. `Lifecycle.bend` is a separate
tested model of admission, work callbacks, and finish closure for one advicee
partition and resident lifetime. Production uses `Canonical.step` for those
decisions. Every preparation and review callback must carry the
partition, lifetime, and round issued by admission. The adapter maps exact
native identities to unique numeric IDs and measures the encoded host output
before passing its byte count to Bend.

The resident enters `Canonical.step` through the shared adapter for admission permits, source and
review work, composed rounds, finding selection and leases, finish waiting,
response authority and joined evaluation disposition, cancellation IDs, response
limits, logical capacity,
background-writer claims,
notice cooldown admission, collection order, readiness, expiry, output-token
phase transitions, and successful-review cache pressure. Internal Bend modules
provide the rules; the resident does not invoke their generated wrappers
independently. The generated artifacts are checked against source hashes and
their consumed constructors before the app builds or tests.
`Canonical.step` provides the resident's aggregate Stop wait and cutoff for an
explicit set of edit partitions, with exact dispatch cancellation IDs and a
decision fence. The wait gives unfinished reviews a chance to become advice
before the safe deadline; the cutoff requests cancellation of remaining work only when a finish
decision is made, as specified in the [accepted advicee contract](../../docs/advicing-target-contract.md).
`DeliveryState.bend` retains the exact selected Stop output
slot, authorization phase, terminal result, and continuation count.
`SubmissionState.bend` retains per finding leases and per output token batches;
it grants one same round Stop reoffer for terminal background advice.
`RevisionState.bend` retains source-free subject/input identities, the current
generation, and live same-input member counts. The resident uses its canonical
register, release, and supersession commands to fence older review callbacks
and retire their advice without changing another advicee's work.
`CollectorAuthority.bend` checks expiry, credential validity, and final opt-in
for an active Claude edit response. The native RPC binds its immutable authority
to the resident lifetime and original round, checked against common lifecycle
and round state. The resident keeps this authority only in the bounded RPC
context. It derives availability from common work and advice; no response
authority registry or per-unit
outcome mirror remains. `Reuse.bend` decides settlement of joined evaluations
against the shared revision and advice state.
`ReuseState.bend` retains source-free evaluation claims and successful cache
LRU order. The resident follows canonical route, admission, eviction, and
partition expiry commands while keeping request handles and cached payloads
native.
The resident reserves the selected batch before the final IPC barrier and can
release an unwritten provisional slot.
Other aggregate events remain tested models.

Run `npm test` in this directory. It rebuilds the import-graph and canonical
artifacts from Bend, checks the laws in
`PROOF.bend` and the import graph kernel proofs, and replays their independent
source-free contract traces.
The existing policy and lifecycle artifacts are
still checked against their source hashes by the root build. The canonical
ledger owns reservation limits.

Artifact generation requires exact **Bend 2.0.35**. The pinned Linux release
archives and SHA-256 digests live in `../../scripts/install-bend-toolchain.mjs`;
its proof kernel uses Lean 4.34.0. Build scripts reject another compiler version
before writing an artifact. A compiler update must update the pin and generated
bindings together, then pass the package proofs, mutation checks, independent
traces, production ABI checks and TypeScript adapter tests. The installed product
bundles generated JavaScript and does not invoke the Bend compiler at runtime.

Generated JavaScript is an artifact, not an alternate implementation. The
resident maps exact native identities to numeric IDs, revalidates each offered
finding at the final handoff and writer barriers, and keeps source capture,
Jev Effect calls, IPC, and output formatting in TypeScript. The accepted
contract in `../../docs/advicing-target-contract.md` remains the target for
the aggregate lifecycle and installed runtime behavior.

`Canonical.bend` and [`src/canonical/adapter.ts`](../../src/canonical/adapter.ts)
define the resident's checked state/event/command interface. It composes a
global ledger across advicee partitions with round and operation identities,
Stop waiting and cutoff, and uncertain background output. The resident uses
this interface for its decision paths; TypeScript owns runtime orchestration
and effects.
Run `npm run test:canonical` for Bend proofs and independent source-free traces.

TypeScript may derive display, layout, and instrumentation projections only
when those values cannot affect a product decision. It supplies any
decision-affecting value as an explicit fact to Bend. TypeScript measures time
and supplies clock and deadline facts; pure Bend decisions do not read an
implicit host clock.

## Content isolation proofs

Run `npm run test:content-isolation` in this package for the ten general laws in
[`content-proof/LAWS.bend`](content-proof/LAWS.bend) and their
[proofs](content-proof/PROOF.bend). The root command of the same name also runs
three production mutation checks. Both gates are in the root deterministic test
inventory. The ordinary suite includes the
[pipeline and HTTP checks](../../src/direct-event/content-isolation.test.ts).
Use Bend 2.0.35 on PATH, or set `HAPSLAND_CONTENT_BEND` to its absolute path.
Each compiler call has a five-second deadline. The gate checks 261 literal
instances and relational premises, rejects ten compiling model mutants, and
requires the BendTT kernel verdict. A deliberately disabled kernel must fail.
Nine mutants fail in their law's own proof; the relational theorem's mutant fails
in its supporting private-stuttering theorem, as recorded in the mutant table.

The theorem is **conditional content noninterference**. Two model executions with
the same permitted inputs and public control events produce identical request
content and pending public state, however their private data differs. Arbitrarily
many private-only notifications can be inserted or removed. The proof is induction
over arbitrary finite lists, not bounded simulation. Exact-projection and
transmission laws preserve the model, code and questions, preventing a vacuous
implementation that sends nothing. Cancellation clears the pending snapshot;
repeated sends project the stored snapshot; recovery accepts a supplied snapshot.
These are content operations, **not a replacement for the resident scheduler or
a claim that production automatically retries or restores requests**.

`core.bend` is a specification and proof driver; production does not execute it.
Its `Review` holds exact strings representing model, encoded review state, and
encoded questions. `Private` holds prompt, conversation, derivatives such as
hashes, inspection, and attribution. `project` selects only `Review`. The model
does not inspect string contents or establish where those strings came from.
Its emitted history is newest first. The two-run relation requires equal initial
public history; an empty history is the normal starting case.

The implementation correspondence is explicit:

| Model boundary | Production owner | Evidence and remaining obligation |
| --- | --- | --- |
| Permitted `Review.state` | `candidateReviewInput` / `preparedProviderInput` in [pipeline.ts](../../src/direct-event/pipeline.ts), [renderer](../../src/direct-event/review-renderer.ts) | [Capture tests](../../src/direct-event/content-provenance.test.ts) run Codex, Claude and Pi adapters on real source and transcript files; wire tests vary prepared metadata and extra private fields while holding source fixed. These are selected native witnesses; general parsing/capture provenance remains unproved. |
| Permitted `Review.questions` | Frozen compiled rules and Effect `DecisionModel` | Tests retain exact IDs, instructions and criteria while varying local rule paths/messages. Rule-file provenance remains a host obligation. |
| Projection and encoding | `evaluatePrepared`, Jev's pinned Effect provider, [Cloudflare encoder](../../src/review-providers/request.ts) | Exact nonempty bodies and headers are checked at the HTTP seam; Jev also uses real Fetch and a loopback socket. JSON encoding, provider code, runtime and OS remain trusted. |
| Private inspection and ambient context | [inspection copy](../../src/inspection/transport.ts), [review transport](../../src/review-providers/transport.ts) | Tests attempt to overwrite source through inspection and propagate private parent trace IDs. Both providers enforce the shared boundary. |
| Stage, send, retry, cancel, recover | Resident snapshots, reuse and dispatch; separate lifecycle proofs/tests | The content proof does **not** verify all resident transitions, cache/persistence codecs, async interleavings, or that every outbound call follows this projection. Formal implementation refinement is still missing. |

The three [production mutants](../../scripts/check-content-wire-mutants.mjs)
inject local metadata into a schema-valid source field, restore the live inspection
buffer, and restore ambient tracing. Each must fail a named assertion after the
unchanged suite passes; syntax/import failures and timeouts do not count as kills.
Runs use isolated source copies and retain logs in `.test-runs`.

Scope limits are part of the claim: conversation text copied into selected code
or rules can be reviewed; timing/count/admission channels are excluded; arbitrary
developer scripts using the general-purpose `decide` API are outside the direct-edit
contract. This is not a proof against all process/network leaks or compromised
dependencies, and does not verify backend retention. Review the laws, correspondence
table and mutation sets whenever capture, rules, request construction, transport,
inspection, or retained request handling changes.

## Conditional progress proofs

Run `npm run test:progress` for `progress-proof/LAWS.bend` and
`progress-proof/PROOF.bend`. The eight general laws support the accepted
[conditional progress contract](../../docs/advicing-target-contract.md#conditional-progress):

- Matching completions remove exactly one request permit in any order. Every
  responsive finite completion permutation drains its original cohort, while
  preserving dispatch metadata. The response premise checks identity against
  the then-current pool and requires one response per initial permit; it does
  not assume the terminal conclusion. Request start/interruption facts must
  satisfy the production outcome predicate.
- Eligible available advice, existing reserved/authorized writers and the
  permitted uncertain-background Stop reoffer reach the submitted lease phase
  under matching authorization and successful completion facts. Closed leases
  and spent uncertain writes are outside the runnable predicate.
- After a finite set of failed requests resolves, an open dispatcher accepts a
  fresh request without resetting queued work, running jobs, or sequence.

`progress-proof/core.bend` contains proof drivers composing the production
`Dispatch`, `Handoff` and `Canonical` functions. It is not a second production
scheduler. The proof covers these checked boundaries, not execution of the
TypeScript resident or simulator, source capture, aggregate ledger admission,
collector fairness, actual agent receipt, or an infinite trace with continuing
new admissions. External responsiveness, eventual scheduling, stable eligibility,
available capacity and delivery opportunities remain host obligations. The
simulator's bounded recovery/replay tests exercise that orchestration separately.

The gate falsifies literal law instances and their hypotheses before checking the
BendTT kernel verdict. A planted never-sent bug must be detected. Every law has a
compiling, false mutant: its literal witness must fail and its isolated proof
must be refused in the named location. Two additional production mutations fail
in shared supporting lemmas, which the report distinguishes from a failure in a
law's own proof. No third-party test dependency is added. Each checker invocation
has a five-second limit. Review the laws and mutation coverage whenever request
settlement, handoff/reoffer eligibility, dispatch closure or orchestration
assumptions change.

`Canonical.CancelReview` is an explicit logical cancellation fact for one exact
partition/lifetime/round/operation in `Reviewing` or `AtJev`. It releases that
work's reservation once, removes its logical work, and discards only its queued
or running dispatch operation. Issued physical requests remain unchanged until
their original callback settles them. The commands are `ReservationReleased`,
`CancelWork`, and applicable `DispatchDiscarded`; cancellation does not record a
review outcome. Missing/wrong tuples and other work kinds refuse atomically.
This represents the existing scoped release behavior in `src/resident/capacity.ts`
without using a fabricated backend completion; accepted release/retention
behavior remains owned by `docs/advicing-target-contract.md`.
