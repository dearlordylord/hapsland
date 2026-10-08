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

`credential-policy/core.bend` owns source-free credential lookup ordering and
save-target availability. Its approved laws and kernel-checked proofs pin every
Boolean planning input and every source constructor. The emitted artifact is
consumed through the canonical-policy credential adapter; host code retains
paths, target strings, descriptor text, file safety, empty-environment handling
and save consent. The generator checks the proofs before emitting the artifact,
and the producer receipt binds the laws, proofs, implementation and authored ABI.
The credential artifact retains only the compiled function dependency closure for
lookup and save availability; generation compares all 32 lookup fact tuples and
all ten save inputs with the complete compiler output. The host adapter checks
the closed source constructors and Boolean result without initializing a schema
codec. Finite caches retain only source kinds and Boolean decisions.

`login-policy/core.bend` owns login command selection, navigation and payload
patch selection through the canonical-policy login adapter. Astra-approved laws
characterize all phases, actions and Boolean facts; the kernel checks their
proofs before generation. Native code compares revision and callback tokens,
compares the current proposal identity, applies exactly the selected patch and
retains Effect owners for input capture, consent and storage. The finite adapter
tables contain immutable navigation plans only. Replay-derived diagrams remain
behavioral evidence; these proofs do not establish secret lifetime, owner
revalidation, IO or platform support.

`verification-policy/core.bend` owns guided credential verification commands,
request-budget decisions, recovery/replacement navigation and native patch
selection. Six Astra-approved laws pin the three-check limit, exact transitions,
exhaustion and safe attempt-bucket specialization for every natural count. The
generator derives compact fact axes and plans from the compiled core, compares
the complete finite enum/Boolean domain and representative saturated counts,
and binds those outputs through a checked canonical-policy adapter. Native code
keeps exact model/observation counts, callback and key-revision identities,
secret input, fresh consent, timeout, one-request execution and owner storage.
The laws do not prove external request count or those host mechanisms.
Production login and verification artifacts omit unused raw compiler wrappers.
Verification retains exact compiled functions for the natural-count bucket and
limit through a source-bound function dependency closure; the generator still
compares plans against the full compiled core. Its checked host tables and
materializers are prepared once on first verification use.

`update-policy/core.bend` owns update command selection and transition plans.
Its two Astra-approved laws pin grouped-approval, current-host and callback
fences, preview/apply continuation, activation routing and native patches.
The generator checks the complete Boolean domain and derives a short-circuit
phase dispatcher, direct native materializer bindings and command bindings; native
constructor templates keep command IDs,
hosts and digests. Array measurements, payload materialization, full-line consent
and owner revalidation remain native obligations. The [migration checkpoint](../../evidence/bend-strangler/checkpoint.json)
records current timing qualification and finite consumer evidence separately from
the laws. These measurements do not establish acquisition, owner IO or platform support.

`setup-policy/core.bend` owns per-agent setup commands, stage readiness and
transition plans, including progress ordering, exact approval fences, fresh
proposals, exit codes and activation before input cancellation. Five
Astra-approved laws characterize these decisions conditional on native facts.
The generator compares every Boolean transition tuple and stage-status tuple
before emitting a compact reducer bound to native materializers. The host
retains first-match stage extraction, exact digest and token comparisons,
observation references, sequence/revision arithmetic, consent and Effect owners.
These proofs do not establish physical installation or platform support.

`maintenance-policy/core.bend` owns repair, reinstall and uninstall commands
and transition plans. Two Astra-approved exact laws preserve discovery gates,
per-host approval, callback fences, failure continuation, activation and
navigation. The generator compares the complete phase/action/Boolean domain
before binding native materializers. Host code retains host and digest equality,
lowercase digest validation, native cursor arithmetic, ordered discovery,
untouched agent references, consent and owner effects. The laws alone establish
neither physical mutation nor platform support.

`rules-policy/core.bend` owns the rules conversation's commands and transitions.
Two Astra-approved exact laws retain scope/plan command gates, terminal holds,
approval digests, distinct Back behavior and stale-result recovery. The generated
bridge preserves original plan references and delegates payload materialization
to the native model. Rule parsing, proposal construction, displayed consent,
owner revalidation and writes remain with their existing owners; a stale result
selects a new preview without authorizing a write.

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
The canonical ledger owns reservation limits. The separate lifecycle model and
its checks retain their own model scope; they are not the production canonical
or import-graph artifact receipt.

This private production workspace is the single generated-output owner. Its
manifest declares the Bend compiler, authored `abi/*.generated.d.ts` inputs and
exact `@hapsland/agent-flow-bend/canonical` and `/import-graph` exports. Ordinary
builds invoke the [producer runner](../../scripts/bend-producer.mjs) through
Turbo, generate both bindings into an owned staging directory, copy the ABI
declarations, validate the compiler/source/loader evidence and publish its own
`dist`. Canonical TypeScript adapters consume those exports; other packages do
not retain generated copies or forwarding adapters. Individual generator scripts
accept an explicit output directory, defaulting to this owner's `dist`.

A cold root build prepares the actual producer/toolchain identities, then Turbo
schedules the manifest-derived production graph, including Bend before its
TypeScript consumers. Fresh source and adapter checks follow compilation before
assembly. Shared TypeScript/Effect/tooling pins belong to the root Bun catalog;
this producer retains its separate exact Bend compiler and ABI identity. The
manifest-derived [root task configuration](../../turbo.json) binds its
compiler/support stamp and build adapters; consumer task dependencies carry
changes downstream.
Generating current bindings and validating receipts does not establish that the
independent proof suite passed, nor that a native runtime or installed release
passed its behavioral gates. Issue #243's final build/cache/publication and
quality acceptance remain separate from this ownership description.

Artifact generation requires exact **Bend 2.0.36**. The pinned Linux release
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

`Canonical.bend` and [`packages/canonical-policy/src/canonical/adapter.ts`](../../packages/canonical-policy/src/canonical/adapter.ts)
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

The production HTTP boundary for Jev, Cloudflare and OpenAI calls
[`request-content/core.bend`](request-content/core.bend), compiled into
`dist/request-content.generated.js` by the [producer](scripts/build-request-content.mjs).
The [host bridge](../review-execution/src/review-providers/request-content.ts) parses the provider's
JSON object and encodes **every** top-level field into the Bend ABI. Bend selects
only `model`, `state`, and `questions` for Jev/Cloudflare, or `model`, `input`, and
`questions` for the explicit OpenAI profile, and constructs the outgoing body. Inspection
observes this final body through a defensive copy; ambient trace propagation is disabled.

The seven [laws](request-content/LAWS.bend) and [proofs](request-content/PROOF.bend)
cover the actual functions used by production:

- Empty lookup preserves its fallback.
- A matching field supplies its value; later matching fields replace earlier ones.
- A nonmatching field leaves lookup unchanged, whatever its value.
- Encoding preserves the three supplied JSON fragments with exact fixed framing.
- Projection constructs the body exclusively from the three named lookups.
- OpenAI encoding preserves its three JSON fragments with exact fixed framing.
- OpenAI projection selects only `model`, `input`, and `questions`, including when
  both `input` and `state` are supplied.

Missing fields become JSON `null`; normal provider validation supplies all three.
JSON parsing resolves duplicate keys before the bridge, following native JSON semantics.
There is no private-envelope, request-history, retry, recovery or scheduler model in
this proof. The earlier disconnected content model has been deleted.

Run `npm run test:content-isolation`. Use Bend 2.0.36 on PATH or set
`HAPSLAND_CONTENT_BEND` to its executable. The gate checks 448 literal instances and
all equality premises, rejects seven compiling mutants at their own law proofs,
requires the BendTT kernel verdict, and verifies that disabling the kernel fails.
It freshly compiles the production source and compares the complete JavaScript
artifact byte for byte. Build validation repeats that comparison; packaging copies
the artifact into the runtime. Every compiler call has a five-second deadline.
To regenerate after an intentional source change, run
`node packages/agent-flow-bend/scripts/build-request-content.mjs` from the repository root.

The root gate also runs seven [production mutants](../../scripts/check-content-wire-mutants.mjs):
selecting the state profile for OpenAI, reading state instead of input in the
compiled OpenAI projector, bypassing Bend, corrupting its compiled question encoder, injecting private text
into source upstream, sharing the inspection buffer, and propagating ambient traces.
Each must fail a named assertion; compilation errors and timeouts do not count.
Tests check the shared transport, all three providers, a Jev loopback socket, Unicode and
JSON values, a three-megabyte source, and 20,000 extra fields. The generated lookup
uses a loop rather than recursion on the JavaScript stack.

**The formal guarantee is deliberately limited to top-level request-content selection
and framing by the production Bend functions.** It is not end-to-end conversation
noninterference. A prompt already copied into `state`, a question, or a model value
is retained. Source and rule provenance have [capture tests](../../src/direct-event/content-provenance.test.ts)
and [wire tests](../../src/direct-event/content-isolation.test.ts), not a universal proof.
JSON parsing/fragment encoding, the ABI bridge, compiler, Base string operations,
Effect transport, runtime and OS remain trusted implementation boundaries. Header,
destination, timing/count, lifecycle and backend retention claims are outside these
laws. General `decide` callers supply their own JSON. Review these laws and boundary
tests whenever provider serialization or transport changes.

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
TypeScript resident or simulator, source capture, whole-runtime ledger ownership,
collector opportunity fairness, actual agent receipt, or an infinite trace with continuing
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
This represents the existing scoped release behavior in `packages/resident-runtime/src/resident/capacity.ts`
without using a fabricated backend completion; accepted release/retention
behavior remains owned by `docs/advicing-target-contract.md`.

### Edit-to-submission journey laws

The same `test:progress` gate also checks [journey-proof/LAWS.bend](journey-proof/LAWS.bend)
and [journey-proof/PROOF.bend](journey-proof/PROOF.bend): thirteen additional general
laws implementing the six approved directions.

- Findings retain their exact identity, ownership and charge across Stop cutoff,
  removal of another operation and changes to another operation's stage.
- Completed dependencies make that edit collectible; pending findings and
  unrelated edits do not block it.
- A terminal shared evaluation resolves every current member of an arbitrary
  finite cohort with the specified disposition and preserves member identities.
- An arbitrary blocked prefix cannot let later entries overtake the earliest
  runnable dispatch entry. Later advice sequence numbers sort after older ones.
- A finite cohort of distinct transient charges drains exactly, preserving
  retained owners and the next identifier. Fresh work fitting the remaining
  capacity can reserve without reset.
- A permitted, admitted edit with one prepared unit follows actual `Canonical.step`
  transitions through each of the six request outcomes. A finding reaches recorded
  submission with matching collection, authorization and successful write facts.
  Required commands must be emitted, including preparation and dispatch commands.

The journey quantifies over partition, payload size, fingerprint and capacity;
its structural trace has one unit. This does not prove arbitrary fanout orchestration,
execution of emitted commands, physical IO or eventual agent receipt. The finite
cohort laws quantify over arbitrary lists, but do not prove fairness on an infinite
host trace. Capacity, responsiveness, current joined members, stable eligibility
and a permitted delivery opportunity are explicit boundaries.

The journey gate checks 661 literal instances and their premises, fourteen compiling
mutants, isolated positive proof controls, the kernel verdict and rejection with the
kernel disabled. Mutation failures in supporting lemmas are identified by name.
`journey-proof/core.bend` composes production functions; `fixtures.bend` supplies
expected snapshots rather than a replacement state machine. Review this section
and these laws when the covered transitions or host assumptions change.

`setup-selection-policy/core.bend` owns outer setup navigation. Its exact transition
law retains empty-selection holds, completed iteration, Back and cancellation.
The native host copies newly selected agents, preserves selected references on
observations, and performs exact JavaScript index and revision arithmetic.
The interpreter retains remembered selections and reported results; per-agent
setup effects and consent remain separately owned.
