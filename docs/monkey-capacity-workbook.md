# Shared-resident Monkey Business and capacity UX workbook

**Purpose:** Coordinate generated Monkey Business coverage and Bend-governed capacity indicators in the system diagram.
**Status:** Temporary implementation tracking workbook. The delivered diagram/Monkey scope has scoped validation and Astra review. Three approved Current admission-model laws are checked; six bounded PRE-only native probes are recorded separately. Current priorities are listed below; the initial 2026-10-01 advisory inventory and dated test results are preserved.
**Authority:** Advisory inventory plus subsequent implementation and validation evidence, including Astra medium's capacity/UX review. This is not an accepted product contract. Existing specification owners and [dashboard rules](../packages/agent-flow-viz/DASHBOARD-RULES.md) retain decision authority.
**Expected use:** Track authorized work, decisions and evidence, and coordinate implementation and UX reviews in the `feat/multi-agent-3d` worktree.
**Lifecycle:** Retain this requested workbook beyond the final handoff. At the **Next planning-cycle workbook replacement milestone**, after the user has finished using this workbook and a named replacement artifact or accepted backlog contains its still-useful deferred proposals, **consolidate** current simulator behavior and evidence boundaries into [Monkey Business README](../packages/monkey-business/README.md), diagram behavior into [visualization README](../packages/agent-flow-viz/README.md), and projection rules into [DASHBOARD-RULES.md](../packages/agent-flow-viz/DASHBOARD-RULES.md). Move any accepted product-policy decisions to their named specification owners, update inbound links to the replacement/backlog or maintained owners, and **delete** this workbook. Receipt of the final answer alone does not trigger retirement. Git history retains its chronology.

## Current navigation (2026-10-02)

- **Delivered diagram/Monkey scope:** See [scope tracking](#scope-tracking-against-the-initial-inventory). Later owner decisions removed notice/cache/ticket indicators; master also removed the ticket subsystem. Earlier tables are dated inventories, not outstanding tasks.
- **Admission decision:** Retain PRE and strict post-closure freshness. Bare arrival-only A is rejected. Three Current model laws are checked: necessary valid PRE, rejection/no reopening for a pending PRE's POST after successful closure, and positive reopening after fresh successful PRE registration.
- **Positive reopening, approved and checked:** A completed round's fresh successfully registered PRE and timely matching POST add one acceptance and open the successor round. The law is conditional on actual registration success; it excludes reject-all reopening POST, not reject-all PRE. Original deadline, scope, lifetime, retained-unseen identity and clock predicates are explicit. Duplicate POST remains separate and unapproved.
- **Next work:** Return to the 3D shared-resource visual review; [no further comparison proofs are required](#proof-value-filter-before-returning-to-shared-resource-design-2026-10-02). Preserve the three Current gates. Registration-enabled timeout/late-IPC/retry evidence remains deferred before stronger runtime support claims.
- **Native evidence still bounded:** Six PRE-only probes characterize delayed/failed hooks; actual tool-start provenance, registration followed by cancellation, late IPC/retry and closure/restart remain separate validation work.
- **Deferred simulator boundary:** Preparation result linkage still lacks source-free per-rule capability facts; do not infer that every incomplete graph makes every rule unusable.

## Working agreement

- Independent agent generators feed **one simulated resident**: one checked Bend state, capacity ledger, preparation pool, Jev permit pool, clock, history and replay.
- **Every UX or visual change must receive advice from Astra medium before implementation and review from Astra medium after implementation.** This is the user's instruction, including future work coordinated through this workbook.
- Record a concrete before/after case for each visual review: the affected square/panel, observable change, and specific view or screenshot. Separate UX review from empirical validation and design acceptance.
- The tables below preserve the **2026-10-01 pre-implementation advisory inventory**. Record later decisions and outcomes separately; do not silently rewrite recommendations as accepted requirements or completed evidence.
- This workbook authorizes no live Jev calls and makes no release/platform support claim.

## Thread 1: generated Monkey Business coverage

Monkey Business already executes compiled Bend. The gaps below concern generated orchestration of additional Bend lifecycles. Direct canonical fixtures covering a subsystem do not establish generated end-to-end coverage.

| Priority proposed by the coverage review | Generated behavior to include | Purpose and meaningful checks |
|---|---|---|
| First | Pre-edit permits | Generated edits currently bypass prospective permit admission. Supply tool identities and timing facts; exercise issue, consume, release and expiry, shared/per-agent ceilings and duplicate-tool refusal. |
| First | Background collector claims | Exercise exclusive writer ownership per group, shared claim capacity, correct-token release, expiry and recovery after a claimant leaves. |
| First, together | Revision supersession and evaluation reuse/cache | Generate identical and changed input identities. Verify joins/cache hits avoid additional Jev calls, superseded work is fenced, and eviction releases ledger charges. Preserve actual evaluation identity and partition isolation; identical file labels do not establish reuse eligibility. |
| Next | Quiet-round/inactivity closure | Exercise inactivity retirement after work, claims and output settle. Activity resets quiet timing; outstanding ownership blocks closure. Depends on permit and collector lifecycles. |
| Next, selectable scenario | Ticket lifecycle | Exercise unit status, collection, credential/expiry facts and retention eviction. Do not imply every background edit creates a ticket. |
| Next, failure scenario | Operational notices | Exercise failure accumulation, cooldown/suppression, bounded keys, collection and storage release. Notices use ledger capacity, not Jev permits. |
| Next | Encoded output-size checks | Supply explicit synthetic encoded-byte facts; exercise fitting and oversized output through Bend before reservation/authorization. Do not claim native serialization was measured. |

Additional coverage improvements:

- **Import traversal:** generate missing/unreadable targets, repeated/cyclic edges, deadlines and exact budget boundaries. Current generation largely produces acyclic trees with successful resolution/capture and optional path denial.
- **Preparation result linkage:** graph traversal and supplied preparation results currently have a separate boundary; `preparationCompleted` receives supplied unit sizes. Define the source-free artifact contract before coupling graph results to completion/per-rule evidence. Do not insert a second product decision reducer in TypeScript.
- **Cancellation:** retain the valid late-callback/stale-result scenario, and consider a selectable callback-suppressed outcome. An environment identity guard rejecting duplicate callbacks is not evidence of native duplicate-callback handling.
- **Keep outside this synthetic workload:** actual sockets/IPC framing, source capture, real encoding, credentials/transport, live Jev and runtime hooks. A synthetic shutdown scenario would not demonstrate native shutdown correctness.

Proposed order: **permits → collector claims → revision/reuse/cache → quiet closure**, followed by selectable ticket, notice and output-fit scenarios. Validate contention/recovery outcomes and exact shared-resident replay, not merely event-name coverage.

Evidence: [generated driver](../packages/monkey-business/src/index.ts), [current omission inventory](../packages/monkey-business/README.md), [canonical fixture checks](../packages/agent-flow-bend/scripts/check-canonical.mjs), [native reuse integration](../src/resident/evaluation-reuse.ts), [collector/permit integration](../src/resident/composed-delivery.ts).

## Thread 2: Bend-governed capacity inventory

Include constraints enforced by Bend even when TypeScript/configuration supplies their limits. Exclude native-only IPC, partition-name and collection-token registry limits.

Categories assign each resource once by its existing visual owner. Process squares can own indicators without literally being queue boxes. Counts are not taken/max bars; adjacency to a square does not make an indicator part of that square.

| Category | Bend-governed capacity | Representation at initial review | Astra medium's recommendation |
|---|---|---|---|
| **1 — Existing square; indicator missing inside it** | Per-partition ledger: items and bytes | Admission & capacity has charge counts. Partition usage/ceilings are outside the layer. | **Priority 1:** two local taken/max bars in Admission; connect them to the single resident ledger. |
| 1 | Edit permits: per-advicee and resident ceilings | Admission has permit count, no denominator. Effective limits are supplied with admission facts. | **Priority 2:** local permit meter in Admission; resident total once in the shared rail. Expose active limits first. |
| 1 | Preparation workers: 8 resident-wide | Scheduling has queued/running counts. The ordinary diagram footer separately shows preparation running n/8. | **Priority 1:** shared worker meter above the layers; small pool reference/current-agent contribution in Job scheduling. Queue length remains a count. |
| 1 | Jev request permits: 8 resident-wide | Three squares show lifecycle facets. Top panel already has n/8 and eight occupied/free cards; footer has n/8. | **Priority 1:** retain the shared slot visualization. Reference it from Awaiting Jev result; do not create three independent pools or a redundant smooth bar. |
| 1 | Background collector claims: supplied capacity, currently 64 by default | Advice collection shows claims count, no maximum. | **Priority 2:** claim meter associated with collection, explicitly scoped to the resident. |
| 1 | Advice lease exclusivity: one owner per advice | Lease counts in Ready advice / Advice collection. | Show per-record leased/free status in details. No pooled leases/ready-advice denominator is defined. |
| 1 | Stop output exclusivity: one active slot per group | Host output shows slot counts, not selected-group occupancy. | **Priority 2:** occupied/free marker for the selected group. Never divide all groups' slots by one. |
| 1 | Continuation budget: 4 per round | Round state omits consumed budget; delivery counters are projected. | **Priority 2:** four consumed/remaining marks for the selected round. Label as a budget, not queue occupancy. |
| 1 | Encoded collection response bound: 10 KiB | No measured bytes/max in Host output; this is a candidate fit check rather than a live pool. | Display in output details when explicit candidate byte facts exist; label synthetic facts as simulated. This is not permanent occupancy. |
| **2 — No resource square; absent from diagram** | Successful-evaluation cache: 8 entries / 128 KiB defaults | No cache capacity display. | **Priority 2, after generated coverage:** compact resource card with entry and byte meters, not a new processing stage. |
| 2 | Ticket retention: 256 default | Outcomes shows ticket units, not retained tickets or registry capacity. | **Priority 3:** tickets/max in resource details; defer main-view indicators until ticket scenarios exist. |
| 2 | Operational-notice key registry: 64 default | No registry capacity display. | **Priority 3:** detail near collection, surfaced during notice activity. Key usage is distinct from common ledger byte charges. |
| **3 — No dedicated resource square; represented elsewhere** | Resident item/byte ledger | Shared panel has taken/max text, segmented byte bar, agent contributions and per-agent ceiling. Footer also lists ledger totals. | **Priority 1:** add an item bar beside the existing byte bar in the single shared rail. |
| 3 | Import-graph budgets | Detailed view has files, read bytes, accepted tree bytes and work taken/max; tree-byte bar exists. Preparation contains a nested schematic/progress text. Source/edge/depth gates lack continuous main-view indicators. | **Priority 2:** four detailed budget meters in expanded preparation. Source size, outgoing edges and depth remain per-fact checks. Main square needs at most a pressure summary. |

### Astra medium's placement advice

- Keep shared capacities **screen-facing above the 3D layers**. The layer diagrams are already too small for numerous tiny meters.
- Put the two partition-ledger bars in Admission. Show a shared-pool reference or highlighted agent contribution at the relevant stage rather than duplicating independent-looking limits on each layer.
- Use focused/flat inspection for detailed meters. The empty area below the Jev row, right of Round state, can hold a **Budgets & retained resources** inset for cache/tickets/notices without inventing pipeline stages or flow edges.
- Keep the eight-slot Jev visualization: it already expresses occupancy and ownership. Add no second indicator unless it adds information.
- Native resource payloads and handles remain outside Bend even when Bend governs their logical capacity and lifecycle.

Evidence: [square facets](../packages/agent-flow-viz/src/production-flow-presentation.ts), [shared resource panel](../packages/agent-flow-viz/src/shared-resident-view.ts), [existing diagram footer](../packages/agent-flow-viz/src/production-flow-view.ts), [projection fields](../src/canonical/adapter.ts), [import budget details](../packages/agent-flow-viz/src/import-graph-view.ts), [dispatch limits](../packages/agent-flow-bend/Dispatch.bend), [claim limits](../packages/agent-flow-bend/CollectionState.bend), [cache](../packages/agent-flow-bend/ReuseState.bend), [ticket retention](../packages/agent-flow-bend/TicketState.bend), [notice keys](../packages/agent-flow-bend/NoticeState.bend).

## Constraints and decisions

| Constraint / choice | Handling |
|---|---|
| One resident, independent agent generators | Already explicitly required by the user. Preserve shared enforcement, clock, history and replay. |
| No independent maxima for Awaiting source read, Review work items, Review outcomes or Ready advice | Keep backlog/ownership counts and identify common ledger charges. Do not invent a maximum per stage. |
| Six charge purposes are accounting categories, not six pools | All use the same global/partition item and byte limits. No per-purpose denominator unless an accepted contract introduces one. |
| Some maxima are transient inputs, absent from current projection metadata | Expose effective permit, collector, cache, ticket and notice limits through truthful visualization metadata before showing bars. Never hardcode production defaults as active replay limits. |
| Import progress is not always capacity | The mini's files/generated-tree-files ratio may describe fixture completion, not files/file-cap utilization. Keep these meanings distinct. |
| Response sizes and per-step import gates require measured/supplied facts | Show absent/unknown when those facts are unavailable. Do not invent measurements. |
| Claims, leases and output slots have different scopes | Distinguish resident-wide claim capacity, per-record lease exclusivity, and per-group Stop output exclusivity. |
| Compiled Bend remains product-decision authority | Generate source-free inputs and execute emitted commands. Add no parallel reducer, scheduler policy, eligibility decision or capacity gate to the renderer. |
| Deterministic offline validation | Test saturation, recovery, identity fences and exact replay. Browser checks establish UI behavior, not native enforcement or release support. |
| UX process | Astra medium advises before each UX implementation and reviews its concrete result afterward. Product design acceptance and empirical checks remain separate. |
| Implementation order / main-view clutter | The priorities and placements above are advisory recommendations. No additional owner decision is needed for exposing accurate data or retaining established product semantics. Confirm scope when implementation is requested. |
| Preparation artifact contract | **Potential modeling decision before changing linkage:** first consult existing accepted preparation/per-rule evidence contracts; ask the owner only if they leave unresolved which source-free result facts should follow each graph terminal outcome. Incomplete traversal is not automatically equivalent to a wholly unusable review artifact. Safe default: retain the separate result boundary while adding graph failure/budget fixtures. |
| Reuse identity and ticket applicability | Follow the existing partition-scoped evaluation identity and route contracts. No new policy decision unless scope is deliberately changed. |

## Decision and execution record

| Date | Record | State |
|---|---|---|
| 2026-10-01 | Coverage analysis and Astra medium's review of the existing diagram completed. No visual diff was created. | Advisory inventory |
| 2026-10-01 | User requested this temporary workbook and required Astra medium advice/review for UX work. | Working agreement |
| 2026-10-01 | Astra medium reviewed this workbook for capacity grouping and UX advice; clarified simulated byte facts and conditional contract questions. No diagram changed. | Advisory review complete |
| 2026-10-01 | User requested implementation of the suggested parts, with Sol 6.1 implementing, Astra medium advising/reviewing UX, and the parent coordinating. All suggested parts are in scope; exclusions and unresolved contracts remain explicit. | Implementation authorized |
| 2026-10-01 | Sol 6.1 owns generated resident lifecycles; a separate Sol 6.1 worker owns import traversal scenarios and contract inspection; another owns optional resource scenarios and capacity UX. | Ownership declaration at assignment; outcomes below |
| 2026-10-01 | Astra medium's implementation advice: keep ledger item/byte meters and Jev slots in the shared rail; add compact resident preparation/permit/collector meters. Replace Admission charge-count lines with local meters without enlarging the squares; retain charge details in inspection. Detailed budgets and retained resources belong in the screen-facing selected-stage inspector. | Before-implementation advice; subsequent review below |

Append accepted scope, subsequent Astra advice/review, concrete visual cases, checks and limitations here as work proceeds. Keep initial recommendations distinguishable from later outcomes.

## Post-implementation import record (2026-10-01)

| Initial inventory item | Outcome | Evidence and limitation |
|---|---|---|
| Import traversal | Implemented | Optional missing/unreadable/repeated/cyclic percentage facts and deterministic deadline fact index follow compiled Bend commands. Focused file-tree tests cover distinct skip reasons, no recapture of visited targets, exact source/tree/read/files/outgoing/depth/work caps and adjacent-boundary rejection, deterministic generation and exact resident replay. No native source or deadline measurement. |
| Preparation result linkage | Deferred | The accepted [branch evidence contract](type-function-review-proposal.md#branch-contracts) permits `incomplete-irrelevant` review inputs; omitted required evidence prevents only the affected rule. Terminal graph incompleteness does not imply an unusable artifact. The synthetic generator lacks source-free rule capability/requirement facts, so supplied `unitBytes` stays independent. A future capability adapter can implement the accepted policy without a new owner decision; no new mapping is accepted here. |
| Native sockets/IPC, source capture, encoding, credentials/transport, live Jev, runtime hooks and native shutdown | Not implemented; outside scope | Synthetic facts do not execute or empirically validate these native effects. |

Verification: `npx vitest run packages/monkey-business/src/file-trees.test.ts` (7 tests), including 100 seeded property cases; `npm run typecheck --prefix packages/monkey-business`. This evidence covers import changes only; the remaining generated and capacity rows are recorded separately after their own checks and rendered review.

## Scope tracking against the initial inventory

The initial tables remain declarations made before execution. The rows below
record the current implementation and scoped verification, distinguish synthetic
fixtures from native execution, and name the explicit deferred boundaries.

| Generated inventory row | Current outcome | Why / required remaining evidence |
|---|---|---|
| Pre-edit permits | Implemented; focused checks passed | Generated edit/session adapter follows issue/consume/release/expiry; shared saturation/recovery, late-expiry recovery and inclusive deadline tests pass. Duplicate-tool and local/resident edge fixtures also pass; those direct fixtures are distinguished from generated orchestration. |
| Background collector claims | Implemented; focused checks passed | Generated candidates follow claim/release/expiry and exact resident replay. Wrong-token/expiry-recovery checks additionally use direct canonical fixtures; they do not imply native writer execution. |
| Revision supersession and evaluation reuse/cache | Implemented; late-join/unavailable drainage and ledger regressions passed | Generated sessions produce paired/changed captured fixtures; tests show one request for identical pending/cache work, finding retention, changed-revision fences and eviction releasing stored-result charges. Source-free evaluation identity remains assumed native fact. |
| Quiet-round/inactivity closure | Implemented; settled/reset/ownership checks passed | Generated quiet ticks follow active permit admission. A timed external collector claim blocks closure, activity resets its timer, and expiry restarts the quiet window; generated output leases/retained advice block closure until settlement and retirement. Exact resident replay passed. |
| Ticket lifecycle | Implemented selectable fixture; resident replay passed | Optional ticket facts execute in the resident Run; tests assert oldest retention eviction, unit statuses, invalid credentials and forgetting. This is not an automatic ticket per background edit. |
| Operational notices | Implemented selectable failure fixture; resident replay passed | Tests establish count suppression/merge, leased preservation, bounded keys, storage release and recovery; Run integrates ordered facts in one ledger. Not every generated Jev failure creates a native notice. |
| Encoded output-size checks | Implemented; boundary and generated handoff/replay tests passed | 10,240-byte synthetic candidates authorize; 10,241-byte candidates do not begin/authorize output. No native serialization measurement. |
| Import traversal | Implemented; focused tests passed | Missing/unreadable/repeated/cyclic/deadline and inclusive budget boundaries described above. |
| Preparation result linkage | Deferred | Accepted per-rule capabilities remain absent from synthetic artifacts; incomplete graph is not automatically unusable. |
| Cancellation | Implemented selectable terminal outcome; focused checks passed | Default late callback preserved; suppressed cancellation supplies checked terminal disposition and drains request/dispatch ownership without original callback. Native interruption/duplicate callback behavior remains outside scope. |
| Native effects / shutdown | Not implemented; excluded | Source-free execution cannot validate native capture, transport, IPC, encoding or shutdown. |

| Capacity inventory row | Current outcome | Concrete scope / remaining evidence |
|---|---|---|
| Per-partition ledger items/bytes | Implemented; browser suite passed; Astra rendered review complete | Local occupancy uses selected partition and active checked denominator. |
| Edit permit per-advicee/resident ceilings | Implemented; browser suite and Astra review complete | Partition-specific 1/2 versus 1/3 ceilings persist separately; historical unknowns do not borrow another agent or future facts. Shared resident ceiling remains independent. |
| Preparation workers | Implemented; browser saturation/recovery checked; Astra rendered review complete | Parent browser run observed shared 8/8 across agents, selection preserved shared totals, suspension drained to 0/8 and replay restored exact rendering. Queue length remains separate. |
| Jev request permits | Implemented; browser saturation/recovery checked; Astra rendered review complete | Parent browser run observed one shared 8/8 pool across agents, agent selection preserved totals, suspension drained to 0/8 and replay restored rendering. |
| Background collectors | Implemented; browser suite passed; Astra rendered review complete | Resident meter and group ownership remain separate. |
| Advice lease exclusivity | Implemented; browser suite passed; Astra rendered review complete | Per-record free/leased state, no invented denominator. |
| Stop output exclusivity | Implemented; browser suite passed; Astra rendered review complete | Group occupancy, never aggregate slots divided by one. |
| Continuation budget | Implemented; browser suite passed; Astra rendered review complete | Selected round's consumed/remaining budget. |
| Encoded response bound | Implemented; browser suite passed; Astra rendered review complete | Candidate bytes carry synthetic provenance and raw oversized number. |
| Successful-evaluation cache | Implemented; browser suite passed; Astra rendered review complete | Resident entry/byte meters use checked cached records and active limits; generated cache join/eviction evidence passed. |
| Ticket retention | Implemented; browser suite passed; Astra rendered review complete | Registry ticket count differs from ticket-unit status count. |
| Operational-notice keys | Implemented; browser suite passed; Astra rendered review complete | Key occupancy differs from shared ledger byte charges. |
| Resident item/byte ledger | Implemented; browser suite passed; Astra rendered review complete | One rail owns shared totals; per-agent contributions do not create pools. |
| Import-graph budgets | Implemented; scoped Astra rendered review complete | Four per-artifact upright meters use checked files/read/tree/work totals and limits. Latest supplied source/edge facts display raw value/limit; missing facts and unrecorded depth remain explicitly unknown. Existing tree view retains contribution ownership, and incomplete reason remains visible below-cap. Astra provided before-advice and reviewed before/after unknown/tree-limit plus expanded desktop/narrow source/read/work/missing/unreadable/cyclic states with no blocking finding. |

| Initial constraint row | Execution disposition |
|---|---|
| One resident / independent generators | Preserved architecture; shared 8/8 contention/recovery and exact replay checks passed. |
| No independent stage maxima | Preserved constraint in implementation; Astra rendered stage review complete. |
| Six purposes share one ledger | Preserved constraint; reservations still enter checked canonical ledger. |
| Transient effective maxima | Known initial/event-supplied frame metadata implemented; browser replay and unknown-limit checks passed. Astra rendered review complete. |
| Import progress vs capacity | Implemented distinction: four bars use checked caps; generated file count is never their denominator. |
| Response and per-step import facts | Implemented source/edge fact visibility and unrecorded depth; generated output-fit/replay evidence passed; Astra rendered review complete. |
| Claims/leases/output scopes | Lifecycle ownership fixtures and generated output checks passed; selected group/round UI implemented, Astra rendered review complete. |
| Compiled Bend authority | Import generator and meters consume checked commands/projections; independent generated-driver read-only review completed for covered scenarios; cache-clear/concurrent cache-commit refusals release reservations; partition-scoped permit metadata passed exact replay and rendered verification. |
| Deterministic offline validation | Corrected 142-test suite and package typecheck passed, including 12 two-agent timing/drainage cases; resource/ensemble/simulation browser reruns and final build passed. No empirical-native claim. |
| Astra UX process | All capacity changes received Astra advice and final rendered review; no UX blocker remains in the reviewed cases. |
| Implementation order / clutter | Scope authorized by user in execution record; placement follows Astra advice and final rendered review is complete. |
| Preparation artifact contract | Deferred coupling for absent rule-capability facts under accepted per-rule contract; no owner approval requested for retaining current semantics. |
| Reuse identity / ticket applicability | Preserve partition-scoped exact evaluation identity and selectable ticket fixtures; focused integration tests and independent implementation audit passed. |

## Current verification and explicit boundaries

The corrected execution suite passed **142 tests across 14 files**, plus package
typecheck, including **40 focused lifecycle tests**, **six optional-resource tests**
and **seven import tests** (the latter include 100 seeded property cases).
Prospective permits issue without opening a round; checked consumption atomically
opens/joins it. Revision registration and quiet activity follow accepted observation
admission, so an unused permit or refused changed revision cannot alter accepted
work. Tests cover partition-scoped reuse, changed captured tree profiles,
member/owner stale fences, finding reuse and eviction/clear/refused concurrent
commit releasing their ledger reservations. These are source-free deterministic
checks, not native runtime validation.

The fulfilled native result remains available to late pending/claimed joiners
until checked ownership release; a fresh checked owner clears its prior result.
Unavailable owner outcomes also terminate joined work. Twelve bounded two-agent
timing cases now drain work, request/dispatch ownership and reuse claims after
arrivals are suspended, with exact shared replay. The default 1,000-frame retention
case also reproduces its endpoint. Canonical round IDs are taken from each
partition's checked resident round after permit consumption, rather than treating
the per-advicee permit generation as that global ID; both agents are admitted
without `StaleRound`. No product policy was changed by these command-following corrections.

Import checks cover exact source/tree/read/files/outgoing/depth/work boundaries,
missing/unreadable targets, repeated/cyclic edges and deadline facts. Optional
resources cover ticket/notice retention and fitting/oversized generated handoff,
including exact shared replay. Independent read-only review inspected compiled
command ownership, reservation releases, quiet ownership and replay metadata;
identified issues were corrected and retested by their implementation owners.
Per-advicee permit ceilings now retain partition identity: agent 1 at 1/2 and
agent 2 at 1/3 do not borrow each other's latest fact. Before a partition's fact,
its denominator remains unknown unless an explicitly configured uniform initial
limit exists. Historical inspection never borrows future facts. Backend tests,
resource browser checks and Astra's targeted follow-up review passed this case.

| Browser evidence | Result and scope |
|---|---|
| Ensemble suite | Passed; shared history/replay, targeted controls, agent selection and narrow layout. |
| Parent pool exercise | Passed; three-agent preparation/Jev 8/8 saturation, selecting another agent preserving shared totals, suspension draining to 0/8 and exact replay rendering. |
| Expanded resource suite | Passed; local 2/2 refusal while global 2/4, global 4/4 refusal, cache eviction and ledger release, retained-resource retirement, free/leased advice, selected-group Stop occupancy, distinct 1/4 and 2/4 round budgets, oversized checked candidate, optional selector, import details, and heterogeneous per-agent permit limits/history. Its explicit rendered ledger-zero assertion passed. |
| Import screenshot exercise | Passed in an isolated HMR-disabled renderer: exported Run replay at graph terminal; source/read/work limits, missing/unreadable targets and cyclic/repeated edges at 1512/390 px. Numeric/outcome assertions and no 390 px page overflow passed. |
| Simulation suite | Passed after Host output facet replacement and prospective first-event assertions were updated to the supported behavior. |
| Usability suite | Passed; keyboard/pointer interaction and responsive layout. |
| Broader guided browser suite | Failure reproduced on exact baseline; this unrelated suite is not reported as passing. |

Before/after import captures compare original HEAD import components with current
components in the same current page shell: `/tmp/import-budgets-before-unknown.png`,
`/tmp/import-budgets-after-unknown.png`,
`/tmp/import-budgets-before-tree-limit.png` and
`/tmp/import-budgets-after-tree-limit.png`. Current terminal pairs use
`/tmp/import-{source-over-limit,read-limit,work-over-limit,missing,unreadable,cyclic}-{1512,390}.png`.
Raw supplied oversized facts remain separate from accepted totals and checked
reasons. Rejected roots say `Root was not accepted · ReadLimit/WorkLimit`.

Astra completed review across the eleven requested case groups and all fourteen
capacity rows, then confirmed the targeted heterogeneous permit-limit case; no UX
blocker remains in that reviewed scope. The review covers shared/asymmetric
ownership, pool saturation/recovery, local/global refusals, leases/group slots,
round budgets, retained-resource occupancy/release, encoded fit, import boundaries,
history/replay and desktop/narrow interaction. Corrected findings include inspector
clipping, overlapping output rows, missing running-review counts, ownership colors,
stale group/round selections, supplied-fact wording, terminal empty-root captions
and cache-clear ledger release. The released capture visibly shows zero resident
items/bytes with empty cache, tickets and notices. This scoped UX review is separate
from the checked execution tests and does not establish native effects or product
design acceptance.

Generated reuse covers pending/claimed joins and successful clear/finding cache
hits under partition-scoped evaluation identity. The driver supplies
`liveAdvice:false`; `reuseJoinAdvice` for already-live advice is not orchestrated.
Graph-to-unit/per-rule capability linkage remains deferred under the accepted
contract: incomplete traversal does not alone imply an unusable artifact. Native
capture, serialization, transport, IPC, credentials/live Jev, runtime hooks and
shutdown remain excluded. No native enforcement or release/platform claim is made.

Final evidence: `/tmp/hapsland-capacity-final-monkey-tests.log` records 142 passing
tests. The package typecheck passed. Resource, ensemble and simulation browser
reruns passed against the corrected source, with logs at
`/tmp/hapsland-final-resource-browser.log`,
`/tmp/hapsland-final-ensemble-browser.log` and
`/tmp/hapsland-final-simulation-browser.log`. The final build passed TypeScript,
projection, the 59-step showcase/rejection checks, inventory/replay/import/native-
timing checks and Vite (`/tmp/hapsland-capacity-final-build.log`). Usability passed
(`/tmp/hapsland-capacity-final-usability.log`). These are scoped executable and
rendered checks; the unrelated baseline guided-browser failure remains disclosed.

All authorized implementation and scoped verification are complete. No additional
user or product-policy decision is required for this delivered scope. The explicit
capability-linkage deferral and live-advice/native exclusions remain boundaries,
not implied completed coverage. Retain this requested workbook until the lifecycle
replacement milestone above.


## Requested Jev pool placement change (2026-10-01)

The owner requested moving the shared Jev request pool from its external panel
into **Jev request attempt**, with eight occupied/free positions colored by their
owning agent. This user direction supersedes the earlier advisory rail placement
for this change; the pre-implementation recommendation above remains historical.
Review decisions will be presented to the owner one at a time.

Astra's advice before implementation keeps the 224×116 square and existing
owner/title rows, replaces its facet area with a shared held/maximum line and
eight compact positions, and preserves a separate local started count. Every
layer receives the same full resident requests and the same fleet ownership
palette. Positions are request permits, not independent per-agent pools or
physical connections. Exact owner/request identities and ready/started status
remain in accessibility labels and the screen-facing stage inspector. The
superseded external panel and its maintained CSS are removed; the ledger uses
the full rail width. Rendered review and verification outcomes will be appended
separately after checks, without implying native effects or release support.


Implementation and validation outcome: the Jev request attempt square now
contains eight deterministic permit positions, shared held/maximum usage, and
its separate agent-local started count. The external pool panel is deleted.
Exact owner, request identity, and authorized/started status remain available
through keyboard inspection. README and dashboard guidance describe the new
placement without changing the historical advice.

The dedicated `test:jev-pool-browser` check passed empty, three mixed owners
(including an authorized request that has not started), eight occupied permits,
release to zero, identical resident mirrors and colors across layers, agent
selection, history rewind/export/reload, keyboard inspection, flat and 3D views,
and a 390px page with existing horizontal panning. The updated ensemble browser
also passed, and the final visualization build passed. Logs are `/tmp/hapsland-jev-square-browser.log` and
`/tmp/hapsland-jev-square-ensemble.log`; the build log is
`/tmp/hapsland-jev-square-build.log`. Astra's rendered after-review found no
blocking issue in the desktop and narrow square/inspector cases. Representative
captures are `/tmp/hapsland-jev-square-mixed-flat-1512.png`,
`/tmp/hapsland-jev-square-mixed-scrolled-390.png`, and
`/tmp/hapsland-jev-square-inspector-390.png`. This is source-free visualization
and checked replay evidence; it does not claim live Jev behavior or platform
release support. The user accepted the Jev presentation after viewing the
published square screenshots ("отлично"). This acceptance covers the displayed
presentation; the empirical checks above remain separate validation evidence.

Review-image handling: publish user-review images under `/workspace` and delete
them after the user has viewed or reviewed them, as requested. The four
published Jev screenshots have been deleted. The `/tmp` capture paths above are
historical validation references, not active user-review attachments.

Next review: the retained cache, tickets, and notices panel is an unchanged
existing design, with no new visual diff or code change. Astra recommends
keeping its expandable shared panel rather than moving it into the diagram;
the user's placement decision has not yet been made. Current review captures
are `/workspace/hapsland-review/retained-resources/resident-panel-current.png`
and `/workspace/hapsland-review/retained-resources/retained-detail-current.png`;
delete them after the user views or reviews them.


Demo retention capacities are computed once from the configured generator count
N and stored in replay configuration: cache entries `min(8, max(4, 2*N))`, cache
bytes `entries * 8192`, ticket retention `min(256, 16*N)`, and notice keys
`min(64, 8*N)`. These are one resident-wide demo set, still subject to the shared
ledger, not additional capacity granted per agent. Native constants are unchanged
(cache 8 entries/128 KiB, tickets 256, notices 64). Explicit tiny boundary fixtures
retain their supplied maxima; existing replay values remain explicit and are not
rewritten. Optional scenarios create at most three tickets and two notice
identities independently of these maxima, so ordinary demos do not imply that a
handful of records saturates native retention. The retained-resource inset remains
a preview, not an accepted placement.


Validation of the demo-capacity amendment: Astra advised the formulas before
implementation and reviewed the rendered ordinary three-agent narrow panel
(`/tmp/hapsland-demo-limits-390.png`) without a blocking layout finding. The
resource browser passed explicit replay-config assertions for cache 6/48 KiB and
tickets 48, along with the existing explicit 2/1 saturation fixtures. The full
Monkey suite passed 144 tests; subsequent focused tests also cover suppression
of the demo badge after a checked effective-limit change while preserving older
frames. Both package typechecks and the visualization build passed. Evidence
logs: `/tmp/hapsland-demo-all-tests.log`,
`/tmp/hapsland-demo-capacity-tests.log`,
`/tmp/hapsland-demo-capacity-browser.log`, and
`/tmp/hapsland-demo-capacity-build.log`. Demo provenance is shown only when
supplied limits match the formula at the selected replay frame. This validates
scalar demo defaults, not acceptance of the retained-resource inset preview.


## Ticket necessity investigation

Deferred follow-up: [issue #170 — Investigate removing retained Claude edit
tickets while preserving collection authority](https://github.com/dearlordylord/hapsland/issues/170)
records this investigation for later work. The current review moves to notice
keys and the reuse cache; no hook refactor is underway.

**Status and authority:** Advisory design audit of current source; not an accepted
change, implementation, or runtime validation of ticket elimination. The user
asked to settle ticket necessity before changing hook behavior. Current
synchronous Claude post-edit collection remains required by the
[accepted target contract](advicing-target-contract.md), lines 34–40 and 202–218;
[ADR 0003](adr/0003-claude-direct-edit-blocking-authority.md), lines 3–16, requires
user opt-in for blocking but does not require a retained ticket registry. No hook,
IPC, glossary, or product-code change is authorized by this investigation.

**Finding:** A separate retained ticket entity and duplicated ticket-unit outcome
registry are not intrinsically required by that behavior. Frozen authority for
the particular synchronous response attempt is required. The current
`admit → collect` API obtains that authority through a ticket, so deleting its
lookup without replacing the authority would be incorrect. Collection already
batches completed admissions in the same advicee/round: edit B may return A's
still-current advice; the ticket is not a one-edit result container. See target
contract lines 213–218 and `server.ts` lines 1019–1039, 3159–3166. Current responses
are `pending`, `empty`, `advice`, or `unavailable`, not a historical ticket-wide
clear/delivered result (`protocol.ts` lines 114–118).

### Current field ownership and actual gaps

Source: [`TicketRecord`](../src/resident/server.ts), lines 240–247 and 793–807;
existing ingress/unit facts are at lines 167–179 and 249–271. A field already
present in a running job is not necessarily available after that job settles.

| Ticket field | Existing fact or required replacement |
| --- | --- |
| `ticket.nonce` | No business meaning beyond resident lookup. An active request context needs no additional issued nonce. Keeping an opaque lookup handle is still a capability, even if renamed. |
| `ticket.lifetime` | Resident/request lifetime already exists; retain the original owner across collection. Restart must produce lost/unavailable, never attach the old attempt to a replacement resident. |
| `generation` | Independent ticket admission ID; existing `canonicalObservationId` / unit `admissionId` can identify accepted work. Current ticket-unit ownership uses this extra ID, so those references must be removed or moved, not silently orphaned. |
| `partition` | Already derived from the accepted observation's root/advicee and carried by jobs/advice. Bind the collector to that scope; do not infer it from the latest caller. |
| `editAuthority` | Existing accepted observation supplies partition plus `toolUseId`; the tool-bound binding must remain immutable for the response attempt (`server.ts` lines 385–389, 3130–3138). |
| `root` | Already on the accepted observation and request. Retain it in the response context for configuration and source checks. |
| `userConfigPath` | Admission dispatch already supplies it while work exists. A collector must retain the original reference for the final current-authority read, even if its own edit's work has finished. |
| `claudeFeedbackMode` | **Missing from common admission/round facts:** admission-time advisory/block authority must be captured by the resident. Reading only current configuration would improperly elevate an originally advisory attempt; reading only the admission snapshot would ignore revocation. |
| `credentialGeneration` | Dispatch/advice carry generations, but selected advice may come from another admission. The collector's own captured generation and final validity check remain necessary. |
| `credentialStatePath` | Available in admission dispatch and advice; preserve the collector's original state reference independently of whichever advice is selected. |
| `credentialRequired` | Admission dispatch/controlled mode can establish this fact; retain the captured value for the response attempt. |
| `credentialEnvironmentOnly` | Available from admitted credential context; preserve its meaning when checking suspended saved credentials. |
| `expiresAt` | **No equivalent collection-authority expiry in common round/work facts.** Consumed pre-edit permits, advice relevance expiry, and virtual-round quiet closure have different purposes. A replacement must explicitly preserve an authority deadline; changing its duration is a separate choice. |

The concrete authority gates are ticket identity/scope (`server.ts` lines
3130–3138), collector expiry/credential (`3146–3174`), and admitted plus current
block opt-in at final handoff (`3350–3366`). Common collection already checks
selected advice credentials, source/revision currency, expiry, fitting, leases,
and submission ownership (`1000–1008`, `1047–1065`, `3260–3289`). These common
checks replace neither the collector's admission-time block snapshot nor its
own expiry. Ticket removal must retain both sets of checks.

### Ticket-unit state and bounded alternatives

`TicketState.bend` lines 4–14 explicitly derives collection status from live
work/advice/activity rather than a ticket-wide outcome. Current collection status
also ignores the retained unit stages (`server.ts` lines 3159–3166). Ticket-unit
stages still participate in supersession, joined-result finality, and delivery
bookkeeping (`1784–1811`, `1865–1869`, `2794–2820`, `1333–1335`); they cannot simply
be deleted from callbacks. Common revision/member ownership and delivery state
can own those invariants, but the existing non-ticket joined branch does not
express every ticket-stage check. Migration needs explicit stale-member and
late/duplicate callback tests, not an assertion that all stages are unused.

The strongest elimination candidate is **one bounded admission-and-collection
RPC**, preserving today's synchronous feedback behavior. Its active request
context holds the frozen authority above; it uses the shared ready-advice batch,
leases, source/credential revalidation, and final block gate. It issues no ticket
nonce, retains no independently collectible ticket after the attempt, and needs
no duplicate ticket-unit outcomes. Review work must continue after hook timeout
or disconnect; the request context and provisional delivery must clean up
independently of that work. The original resident/lifetime, IPC timeout bound,
final handoff and concurrent collector exclusions must remain intact. This is
source-inspected feasibility, **not implemented or runtime-proven elimination**.

Keeping `admit → poll` with a short-lived opaque authority handle is a smaller
API change, but still retains a capability lookup; shortening its lifetime and
removing ticket-unit duplication would be a reduction, not complete elimination
of a registry. Using only existing tool/admission IDs with no handle does not
recover the missing authority snapshot: retaining those snapshots under those
IDs would otherwise recreate the same registry. A signed client-held authority
could remove lookup retention, but adds a new integrity/restart-key boundary and
is not presently justified over a bounded active request context.

**Recommendation:** investigate removal of the independent retained ticket and
unit registries while keeping synchronous hook behavior unchanged. Do not
promise deletion until a bounded replacement passes: n edits with B collecting
A's advice; independent concurrent-hook authority snapshots and exclusive leases;
advisory admission followed by opt-in without elevation; admitted opt-in revoked
at final handoff; credential rotation/suspension; wrong tool/advicee/root and old
resident lifetime; collector expiry distinct from advice expiry; stale/joined
and duplicate callbacks; hook timeout/disconnect with continuing resident work;
and complete authority/context cleanup. Existing tests such as
`claude-delivery.test.ts` lines 155 and 249, and `server.test.ts` lines 897 and
1197 establish current invariants, **not** registry-free behavior. The later
question of making ordinary Claude edit feedback asynchronous remains a
separate, unimplemented product decision.


## Owner decision: diagnostic notice retention outside the main diagram (2026-10-01)

The owner authorized removing operational-notice key retention from the main
advice-delivery diagram. These keys retain operational-failure diagnostics for
the composed/installed flow, rather than the main review advice delivered to
agents. The native storage declaration now states this distinction. Historical
workbook tables and earlier fourteen-row reviews remain evidence of their scope
at that time; they do not claim all fourteen resources are visible currently.

Astra advised removing notice meters, notice lists, notice-storage copy, and the
notice-inspection link from resident and Collection/Advice inspectors. Current
retained-resource details contain cache and tickets. Background collector claims
and advice lease details remain. Checked diagnostic state, events, optional
exercises, and native functionality remain; real notice storage still contributes
to the unfiltered shared ledger. No replacement diagnostic UI is introduced.
The retained-resource inset remains an unaccepted preview. The next term for
owner review is the reuse cache, considered separately.


Implementation checks for this owner decision passed: visualization typecheck and
build, the revised resource browser, and nine focused diagnostic/scenario tests.
Browser assertions explicitly reject notice-key/storage/link text in retained
resource details and Collection inspection while checking that the actual
retained fixture still includes diagnostic storage in its shared ledger.
Collector/advice lease checks remain. Logs:
`/tmp/hapsland-diagnostic-ui-build.log`,
`/tmp/hapsland-diagnostic-ui-browser.log`, and
`/tmp/hapsland-diagnostic-state-tests.log`. Rendered after-review examines the
cache/ticket disclosure at desktop/narrow widths and the Collection lease panel.


Astra's rendered after-review found no blocking issue in the current desktop and
narrow cache/ticket details or Collection panel. The outside-git preview was also
updated to two resource cards; its placement remains unaccepted. Source and
maintained documentation are stable for the authorized removal. Review of the
reuse-cache term is the next separate owner decision.


## Owner decision: cache and ticket retention omitted from the diagram (2026-10-01)

The owner authorized removing both remaining retained-resource families, cache
and tickets, from the main diagram. The entire resident retention disclosure,
inspection link, Outcomes retention rows, unused helper/style/callback, and
retention-only demo provenance label are removed. Actual Outcomes records and
shared ledger charges remain, along with Jev permits, preparation/edit permits,
collector claims/advice leases, host output slots, and round budgets. Backend
cache/ticket/diagnostic state, checked events, selectable exercise controls, and
effective replay configuration remain. This is a visualization decision, not
implementation of issue 170. The retained-in-diagram inset proposal is now
rejected. Earlier table rows and advice are historical evidence of the scope at
that time, not current visible-feature claims.

Astra advised this bounded removal before editing and requested desktop shared
rail/Outcomes inspection plus ordinary narrow rail after-review. Browser evidence
checks absence of all three retained families while comparing the rendered
aggregate ledger to the unchanged populated projection and its exact replay.


The scope also removes the pre-existing Outcomes ticket-unit facet, following
owner clarification; finding work and findings waiting for work remain. Final
visualization typecheck/build and resource browser pass, including negative
checks for retention labels and ticket-unit labels, exact populated replay, and
unfiltered aggregate ledger equality. Evidence logs are
`/tmp/hapsland-retention-removal-build.log` and
`/tmp/hapsland-retention-removal-browser.log`. The refreshed Outcomes screenshot
is `/tmp/hapsland-capacity-outcomes-no-retention-1512.png`; shared rail captures
are `/tmp/hapsland-capacity-retention-1512.png` and
`/tmp/hapsland-capacity-resources-390.png`.


Astra's final rendered after-review confirmed the refreshed Outcomes inspector
and flat diagram have no ticket-unit facet, preserve outcome work counts, and
have no visual blocker. Desktop and narrow shared-rail removal also passed.
The next preparation-workers image records its existing placement for a separate
discussion; no preparation design change is included in this decision.


## Accepted combined execution-pool inset (2026-10-01)

The owner accepted Astra's combined Preparation/Jev pool prototype and explicitly
removed the words “independently allocated” from its subtitle. This placement
supersedes the earlier Jev-request-square placement decision while preserving
that historical record. The dashed inset at the right of Round state contains
two separately labeled rows and the subtitle “Shared by all agents”. Every layer
uses the same complete resident snapshot and owner palette. Preparation counts
only running jobs marked preparation, sorted by operation ID; Jev permits use
request IDs and checked authorization/started status. The two rows have no
position pairing or additional flow arrows. Their maxima come from projection.
The old Jev-square slot helper and top-rail preparation meter are removed; the
square retains concise shared/local references and the original gold Jev contact
remains. No cache, ticket, or notice UI is restored. Backend policy is unchanged.


Validation of the accepted placement: visualization typecheck/build, dedicated
execution-pools browser, ensemble browser, resource browser, and diff checks pass.
The dedicated browser checks empty/released rows, mixed Preparation 2/8 and Jev
3/8 with three owner colors, separate saturation of each row, identical resident
mirrors across agent layers/selection, history/export/reload, keyboard owner
inspection, 3D/flat views, and a panned 390px view. Astra reviewed nine rendered
cases with no blocking mismatch; accepted geometry and subtitle are honored and
black owner labels remain readable against the owner palette. Logs:
`/tmp/hapsland-execution-pools-build.log`,
`/tmp/hapsland-execution-pools-browser.log`,
`/tmp/hapsland-execution-pools-ensemble.log`, and
`/tmp/hapsland-execution-pools-resource.log`. This validates the authorized
visualization change, not native Jev behavior or a backend policy change.


## Owner-selected Monkey edit-permit ceilings (2026-10-01)

The owner requested 16 edit permits per agent and 64 shared resident permits for
new Monkey dashboard runs, replacing the earlier 2/8 demo defaults. The start
configuration and ordinary-run browser assertions now use 16/64. Explicit
partition-scope boundary fixtures retain their supplied limits, and native
32/4096 defaults are unchanged. This changes demo configuration only.


Typecheck, visualization build, resource browser, and diff checks passed. The
browser verifies ordinary exported 16/64 configuration and rendered local0/16
versus resident1/64 after a permit issued to another partition; explicit fixture
ceilings and historical unknown-limit behavior remain checked. Logs:
`/tmp/hapsland-permit-16-64-build.log` and
`/tmp/hapsland-permit-16-64-browser.log`.

Astra's bounded rendered after-review confirmed the new local/resident labels fit
and scope remains clear, with no UX blocker.


## Master reconciliation: ticket removal and response authority (2026-10-02)

The authorized merge of master includes issue #171: ticket retention/state/events
and native ticket routes are removed, with active response authority replacing
those contracts. The superseded Monkey ticket exercise/config/metadata/tests and
selector are removed rather than retained as a compatibility shim. Older workbook
ticket investigations and capacity tables are historical and resolved by this
removal, not outstanding implementation requirements. Notice diagnostics and
cache performance scenarios remain. Outcomes now uses master's pending-finding
facet, not a ticket facet. Multi-agent execution pools, 16/64 demo edit permits,
and current/proposed hook timing illustrations remain. Claude's current
foreground review wait now follows the merged active response RPC, so its
illustrated wait/return ordering remains valid. Master site/analytics/branding
changes are retained, and the diagnostic notice-storage comment is preserved.


Merge validation passed both package typechecks, visualization build/projection
checks, all 143 Monkey tests, and 88 focused native capacity/admission/protocol/
collection tests. Timing, execution-pool, and resource browser checks passed.
Astra's bounded post-merge rendered review found no blocker: the pending-findings
facet fits, retained-resource UI remains absent, and current hook timing and the
combined pool remain unchanged. Evidence logs use `/tmp/hapsland-merge-` followed
by `typecheck.log`, `viz-build.log`, `monkey-tests.log`,
`admission-tests.log`, `timing-browser.log`, `execution-browser.log`, and
`resource-browser.log`. The untracked admission comparison prototype is outside
this merge and is neither staged nor deleted.

### Owner decision: retain the strict closure boundary

The owner rejected allowing a delayed POST for an old edit to open a successor
round. This confirms the existing target contract rather than changing it.
Bare A is rejected for this requirement; retain PRE unless independently verified
original-attempt provenance supplies equivalent closure evidence. Arrival-only
admission is not an accepted implementation direction.

Next, inspect the current scheme's external premise: the native edit stays behind
its synchronous PRE, and original invocation identity/start/deadline survive
retries and resident startup. The model proof does not establish that runtime
premise. Lost POST and fail-open PRE coverage remain separate limitations.

Bounded source inspection confirms that `hookProcessStartedAt` is sampled once
and passed unchanged through resident startup (`src/resident/hook-clock.ts:4`,
`src/resident/client.ts:518`). Permit expiry derives from that start; a pending
duplicate does not renew it (`src/resident/composed-delivery.ts:224`, `:247`).
Installed PRE commands use `exec` and are configured synchronously. These facts
do not establish native tool ordering or cancellation empirically. The sampled
clock covers Node startup, not earlier runtime/shell queuing. A delayed PRE is
not itself an old-edit counterexample if the actual edit remains blocked behind
it. Next validation must distinguish hook invocation from actual tool execution
and inspect timeout/cancellation and replay behavior per supported runtime.

### Runtime premise audit (2026-10-02)

**Scope and classification:** Advisory research into the existing PRE premise,
not a new admission policy or runtime-conformance result. The declared adapter
profiles are Claude Code `2.1.218` and Codex CLI `0.155.1`/`0.156.0`; platform and
execution scope remain those of each [supported-profile record](direct-event-v1-supported-profile.md).
Local package metadata and executable symlinks currently identify newer
`0.160.0`/`2.1.281` binaries; neither was run for this audit, and they do not
replace the declared profiles.

| Evidence class / verification | Bounded finding |
| --- | --- |
| Official DOC / inspected, rolling documentation | [Claude's hooks reference](https://code.claude.com/docs/en/hooks#timeouts) describes PRE before tool execution; a timed-out command hook is canceled and its output discarded, but the tool can continue through normal permission handling. This documents fail-open edit behavior, not successful review admission or proof that every descendant process stopped. |
| Official DOC / inspected, rolling documentation | [Codex's hooks reference](https://developers.openai.com/codex/hooks#run-hooks-in-the-background) says command hooks wait by default; explicit asynchronous handlers continue separately. It documents `apply_patch` coverage with specialized-path exceptions and a tool-call ID, not an original edit timestamp or resident epoch. Current documentation is not version-pinned conformance evidence. |
| Local SRC / inspected | Installed PRE uses `exec`, timeout five seconds, and no `async` (`src/onboarding/claude-installation.ts:141`, `src/onboarding/codex-installation.ts:140`). Node process start is sampled once and passed unchanged through startup; permit expiry derives from it and pending duplicates do not renew it (`src/resident/hook-clock.ts:4`, `src/resident/client.ts:518`, `src/resident/composed-delivery.ts:224`, `:247`). This does not measure earlier native/shell queuing. |
| Native SRC evidence / selected prior execution | The [negative matrix](../evidence/native-negative/index.json) covers selected controlled source-checkout trials, not installed-package or normal-trust validation. Its [Claude timeout sample](../evidence/native-negative/claude-typescript-hook-timeout-controlled-offline-1790857421849.json) and [Codex timeout sample](../evidence/native-negative/codex-typescript-hook-timeout-controlled-offline-1790858004083.json) pin `2.1.218` and `0.155.1` respectively. Timeout/crash injection targets POST edit/background handlers, not PRE (`scripts/run-native-crossfile-current.mjs:111`). Normal PRE/POST traces correlate a hashed tool ID but do not log actual tool start; they establish neither PRE-timeout cancellation nor the closure-order premise. |

No inspected source establishes preservation of an original native invocation
start across a runtime retry that launches a new hook process. A delayed PRE is
not an old-edit counterexample while actual tool execution remains blocked
behind it. The exact distinction between native invocation, command startup,
Node startup, and actual edit execution must remain explicit when validating
the target contract's closure fence.

Next empirical cases, on each exact supported runtime/platform profile:

- Record native invocation before closure, delayed PRE process startup after
  closure, and actual tool execution; identify which observed start supplies
  the accepted fence evidence.
- Timeout or cancel PRE before and after resident registration; check surviving
  descendants, late IPC registration, and whether an edit that continues without
  a permit remains unadmitted for review.
- Delay resident startup and retry an invocation; track unchanged tool/session/
  advicee/root, original start/deadline, and resident lifetime without refreshing
  a stale attempt.
- Replay POST after closure and across resident restart or retained-identity
  eviction; verify that missing original authority cannot open a successor.

A delayed invocation followed by an edit after closure tests original-start
stamping; it is not evidence that an old mutation reopened a round. Keep
invocation request, actual tool start, first file mutation, and POST arrival
separate: a file watcher is a proxy, and missing completion logs do not prove
process termination. Existing valid POST-fault evidence remains useful under
its stated scope; dedicated PRE scenarios must carry distinct declarations.

These cases are proposals, not executed results. Retain PRE; resolving its
external runtime premise does not require proving arrival-only A or treating
lost-POST/fail-open edit coverage as a freshness guarantee.

## Executed PRE-only native fault probes (2026-10-02)

Validation evidence, separate from the broader audit proposals above. Six bounded
runs used source-checkout hooks with pinned Claude Code 2.1.218 and Codex CLI
0.155.1, one persistent synthetic TypeScript creation per run, no automatic
retries, no controlled reviewer calls and no Jev requests. PRE used the installed
command shape's `exec` prefix. The injected wrapper deliberately bypassed permit
registration: these are native hook-wait/failure observations, not production PRE
admission conformance. The declarations were written before each host execution.

| Runtime | PRE injection | Observed fixture mutation | Completion observation | Bounded checks |
| --- | --- | --- | --- | --- |
| Claude 2.1.218 | 1,500 ms hold, 5 s hook deadline | 17.8 ms after hold completion | 31 samples remained absent; completion sentinel present | 17/17 |
| Codex 0.155.1 | 1,500 ms hold, 5 s hook deadline | 6.8 ms after hold completion | 31 samples remained absent; completion sentinel present | 17/17 |
| Claude 2.1.218 | 10 s hold, 2 s hook deadline | 2,001.7 ms after PRE Node entry | No natural-completion sentinel; mutation-time PID probe false | 12/12 |
| Codex 0.155.1 | 10 s hold, 2 s hook deadline | 1,967.3 ms after PRE Node entry | No natural-completion sentinel; mutation-time PID probe false | 12/12 |
| Claude 2.1.218 | PRE exits 42 | 190.9 ms after PRE Node entry | Exit-42 completion marker present | 12/12 |
| Codex 0.155.1 | PRE exits 42 | 5.7 ms after PRE Node entry | Exit-42 completion marker present | 12/12 |

All six observed exactly one matched PRE/POST identity and the expected final
fixture, with no advice delivered or applied. The timeout gates establish those
bounded observations; they do **not** prove deadline enforcement or process
termination. The configured runtime deadline covers earlier command startup too,
so it is not measured from Node entry. A false PID probe and missing completion
sentinel do not establish a kill signal or cancellation of every descendant.

The independent filesystem observer was armed before host execution; the PRE
process also sampled fixture existence/hash every 50 ms during the delay. Seven
offline controls passed, including forced persistent mutation detected by the
same sampling function, an early-mutation/async-PRE rejection, unrelated/multiple
POST rejection, and absence of provider-observer rejection. The observation is
first detectable fixture mutation, an upper bound on native tool start, **not**
an instrumented native start. Samples do not rule out transient write/revert
between samples. No deliberate resident closure, late registration, IPC retry,
lifetime restamping, or restart was tested here; those remain audit proposals.
This source-checkout/controlled-trust profile does not validate an installed
package, ordinary trust configuration, or all executions of either runtime.

Source-free evidence and matching `-declaration.json` files are in
[`evidence/native-negative`](../evidence/native-negative), with these run IDs:

- `claude-typescript-pre-delay-controlled-offline-1790951227977`
- `codex-typescript-pre-delay-controlled-offline-1790951233648`
- `claude-typescript-pre-timeout-controlled-offline-1790951379155`
- `codex-typescript-pre-timeout-controlled-offline-1790951380147`
- `claude-typescript-pre-crash-controlled-offline-1790951439591`
- `codex-typescript-pre-crash-controlled-offline-1790951425205`

Raw host streams, source, provider bodies and credentials were discarded with
the disposable repositories. Existing POST crash/timeout cases remain POST-only
fault evidence. The runner's unsupported requirement that missing natural
completion demonstrated timeout cancellation has been removed; earlier evidence
and declarations are preserved as dated observations, not rewritten. Run
`node --test scripts/native-hook-faults.test.mjs` for the checker controls.
The accepted closure freshness contract and unapproved conditional proof remain
unchanged.

## Approved pending-PRE closure proof (2026-10-02)

The owner approved the concrete sequence: an already active round has a registered
pending PRE; that round successfully closes; its matching POST then arrives,
without a new PRE or restart. The checked model law requires no additional
acceptance, no successor round, and inactive status. PRE alone opens no round;
a rejected inactive or backward-clock closure is not used as a vacuous success.
POST follows closure in event order and may have the same clock tick.

The isolated [approved closure slice](../prototypes/edit-admission-comparison/approved-closure/LAWS.bend)
uses a reachable Current-state witness, both active flags, independently inspected
pending tool, valid closure clock and same owner/lifetime/tool. Its
[proof](../prototypes/edit-admission-comparison/approved-closure/PROOF.bend)
kernel-checks all three outcomes. Before proof work, 160 concrete valid-premise
instances passed, including 32 equal-clock POST cases. Eleven gate controls pass,
including the original Current nine-control gate after rejected-A cleanup.
A compiling dropped-closure mutant really accepts the old POST and opens round 2;
it fails both the exact law literal and `Laws.delayed_post_after_close`. It defeats
multiple closure defenses deliberately; merely retaining a fenced permit was not
misrepresented as a caught admission bug. No supporting mutant proof adjustment
was needed. Inactive/backward-clock closure controls are checked separately.

This is the second retained Current model slice, not a production change or empirical
native-event ordering guarantee. The approved law/proof statements remain unchanged; the Current-only cleanup
records new shared-core hashes transparently. The conditional native-freshness chain is
now **deferred, not required**: after its explanation the owner delegated whether
a separate proof was necessary; the closure law addresses the requested boundary.
The broader native audit proposals remain separate from this formal result and
from the six already executed PRE-only fault probes.


## Approved fresh-PRE positive reopening proof (2026-10-02)

The owner approved the positive Current counterpart: after a real completed
round, a fresh PRE is successfully registered and its timely matching POST opens
the successor. The [approved reopening slice](../prototypes/edit-admission-comparison/approved-reopen/LAWS.bend)
requires a reachable closed round >0, empty pending authority, retained-unseen
tool, matched scope/lifetime, PRE start after the fence, valid issue window,
original deadline and POST strictly before expiry. Actual PRE output is linked
to independently inspected new-permit facts, not to a desired POST decision.
No intervening release, expiry, closure or restart is included.

The [proof](../prototypes/edit-admission-comparison/approved-reopen/PROOF.bend)
kernel-checks count +1, round +1 and active status. Before proof work, 128
non-vacuous successful-registration instances passed with 13 explicit premises,
including eight equal start/issue/POST cases and prior completed rounds 1–8.
Eleven gate controls pass, preserving the preceding two Current slice gates. Concrete
negative boundaries remain literal controls, not newly approved universal laws.
A compiling reject-all-reopening-POST mutant preserves completed-round setup
and fresh PRE success, then really refuses the POST; the exact law literal
and own main proof fail while unchanged support facts check.

Scope: successful registration is a premise, not proof that every raw PRE request
registers. Global reject-all PRE could make that premise false; duplicate POST
remains a separate unapproved property. This admission projection omits Canonical
round-slot and ledger capacity, so successful PRE does not promise downstream
production review or reserve a round slot. No production code, native ordering
claim, new dependency, or prior frozen law/proof/helper changed. This is the
third retained Current model slice; the broader native audit proposals remain pending.


## Proof-value filter before returning to shared-resource design (2026-10-02)

Advisory prioritization, reviewed with Astra; this does not approve another law,
change the accepted closure contract, or replace production validation. Keep the
three retained Current slices and their gates. No additional comparison-projection proof
is required before resuming the 3D shared-resource design.

| Candidate or gap | Value and existing evidence | Priority |
| --- | --- | --- |
| Current full `exact_post`; `post_round` / `post_active` | The three retained Current slices do not prove every refusal or joining an already active round. Actual composed-delivery tests already cover same-active-round admission, duplicate handling, no-PRE round creation and the Canonical 64-round capacity boundary (`src/resident/composed-delivery.test.ts:214`, `:250`, `:307`, `:335`, `:364`, `:378`, `:559`). A broader toy proof would not establish those omitted resident capacities. | Defer; preserve production-aligned coverage rather than complete the projection by habit. |
| `pre_boundary` | Useful requirement: PRE alone creates no round. Already covered by actual adapter tests and generated release/expiry scenarios; the positive reopening proof explicitly conditions on later POST. | No new toy proof prerequisite. |
| Current `post_idempotent` and retained identity behavior | Not implied by the three retained Current slices. The draft tests immediate replay with identical time; that is weaker than delayed retries with intervening closure, expiry, eviction or restart. Exact retained sequence would imply its separate length bound through `List.take`; proving both independently adds little. | Keep real replay, identity and charge-release tests; defer a production law until a concrete uncovered failure warrants it. |
| Conditional native-freshness chain | Necessary valid PRE already pins start after the fence. Native-start-after-PRE would imply native-start-after-fence arithmetically, under an external host-ordering premise. Another model proof cannot validate that premise. | Defer; not a required pending proof. |
| `authority_accounting` | Conserves only a cumulative monitor. It proves neither the real four-continuation bound nor grant/reset behavior. | Remove from proof priority, retain its explicit model limitation. |
| Registration-enabled PRE timeout, late IPC and retry | All six executed PRE fault probes bypassed resident registration. They therefore do not establish what happens when an authority is registered and a hook later times out, a late child sends IPC, or a retry attempts to refresh original timing/lifetime. | Highest remaining empirical freshness audit; separate bounded declaration and runtime evidence needed before making a stronger support claim. |

The minimum for the design return is already available: retain the accepted PRE
boundary, preserve the checked necessary-validity / closure / positive-reopening
model facts, and show actual shared ownership, limits and replay state truthfully.
The next empirical audit is not a prerequisite for drawing or reviewing that
existing behavior; it is a prerequisite for claiming the untested timeout/retry
freshness guarantee. No new proof, runtime execution or product change was made
for this filter.


## Shared-resource 3D design return: mirrored-pool clarification (2026-10-02)

Astra advised and reviewed one screen-facing explanation beside the Agent layers
controls: “The same resident pools are shown on every layer.” Before, the sidebar
explained only hover and selection; after, it also explicitly identifies the
repeated Preparation/Jev blocks as mirrors of one resident. Pool placement,
checked data, limits, owner colors, rotation and hover behavior are unchanged.

Rendered after-review passed at desktop and 390px: the sentence wraps without
clipping; the controlled mixed fixture still shows preparation 2/8 and Jev 3/8
on every layer. Agent 2 hover retains layer opacity `[0.1, 1, 0.1]` with unchanged
resident totals and owner slots. These are scoped presentation checks, not new
capacity or runtime support claims. Visualization typecheck and diff check passed.

Before captures: `/workspace/hapsland-review/shared-resources-3d/mixed-3d-1512.png`
and `mixed-hover-agent2-1512.png`. After captures:
`/workspace/hapsland-review/shared-resources-3d/after/mixed-3d-1512.png`,
`mixed-hover-agent2-1512.png`, and `mixed-390.png`. No broader tests were rerun
for this copy-only change.


### Spatial axis-caption correction (2026-10-02)

Root's screenshot review identified a remaining decorative “X / Y · SYSTEM FLOW
Z · AGENTS” caption, contrary to the user's earlier removal instruction. The
whole caption is now omitted in 3D mode; the flat selected-agent inspection
label remains because it identifies the active inspection scope. The resident-
pool explanation beside Agent layers remains. This corrects the earlier review
record's incomplete copy inventory; no resource or interaction semantics change.
Visualization typecheck and diff check passed. Astra's refreshed rendered review
passed: the spatial orientation node is absent, the flat “AGENT 1 / INSPECTION
VIEW” label remains, and mixed ownership, totals and hover are unchanged. The
existing `after/mixed-3d-1512.png`, `after/mixed-hover-agent2-1512.png` and
`after/mixed-390.png` captures above are refreshed; flat scope is shown in
`/workspace/hapsland-review/shared-resources-3d/after/mixed-flat-1512.png`. This
review covers both copy differences and supersedes the earlier hint-only review.

## Owner-requested rejected-A cleanup (2026-10-02)

Deleted the Receipt proof slice, no-PRE comparison decision experiments and
old/fresh counterpair artifacts. The Current-only core retains its reducer
expressions and three completed approved laws; no new proof or implementation
was needed. Whole-core hashes are refreshed with previous hashes recorded in
approval manifests. Gate chaining no longer depends on Receipt. Native PRE fault
reports remain intact. The accepted reason is unchanged: arrival alone cannot
establish the required original-edit freshness after closure.

The Current validity, closure and positive reopening gates are rerun against
the cleaned model, alongside Current-only draft probes, meaningful mutation
controls, traces and retention-boundary checks. The rejected comparison's
experiments are not retained as a parallel path; Git history holds their chronology.


Cleanup verification: all three Current gates pass (validity 9 controls, closure
11, reopening 11). The Current-only draft falsifier passes 3,480 literal instances
and its compiling reject-all POST negative control; the evidence checker passes
seven checks including actual computed traces and retained-sequence boundaries.
No new universal law was approved or proved.

The dashboard's obsolete A/B/C no-PRE proposal section, proposal-only helpers,
styles and browser assertions are removed. The installed Claude/Codex timing
illustrations remain, with their five lanes, repeated-edit explanation, fail-open
PRE boundary and both Stop paths. Visualization typecheck and the adapted
current-only timing browser passed in the existing `LD_LIBRARY_PATH` browser
environment; this is not a default browser-launch support claim. Astra's rendered
review passed desktop and narrow current views at
`/workspace/hapsland-review/current-hook-timing/current-1512.png`,
`current-390.png`, and `current-left-390.png`. Native PRE evidence was not removed.

## Current visual work and first placement question (2026-10-02)

The owner requested deleting the temporary hook-timing panel, making the visible
layer order match the Agent 1–2–3 sidebar, and adding wheel/touchpad zoom with a
wider range. The temporary renderer, its styles, test script/package entry and
maintained README instructions are removed. Agent 1 is now the front/top plane,
followed by 2 and 3; contacts reverse depth with the layers while scope/color
identity remains unchanged. Zoom spans 20–200%, using viewport-centered wheel,
touchpad control-wheel and two-finger touch pinch. Reset remains 72%; single-
finger rotation/vertical page scroll and scrolling outside the viewport remain.
The focused camera browser and existing ensemble browser passed in the existing
`LD_LIBRARY_PATH` environment, as did typecheck. Astra rendered after-review passed; these checks do not imply general
platform support. Pinch was exercised by CDP touch input, not physical-device
validation. High zoom intentionally crops edges and is recoverable through
wheel/reset or flat focus.

The global resident item/byte ledger remains above the diagram because of the
initial Astra readability advice, not a product requirement or an accepted
placement decision. Astra now proposes a separate shared-resident capacity inset
beside Admission & capacity, at its existing green resident contact. Each layer
would mirror the same global item/byte owner segments; Admission retains local
agent meters. Remove the external item/byte duplicate if this placement is
accepted. Edit permits and background collectors are separate resources and are
excluded from this first placement question.

**Owner authorized placement prototype:** show the global item/byte ledger
inside the diagram and discuss the result afterward. This permits implementing
the inset and removing only its top item/byte duplicate; it is not final
acceptance of a finished visual artifact. Review the specific inset beside
Admission and the removed top item/byte rows before accepting final placement.
Astra advises and reviews the visual work. Implementation is in progress.

**Additional owner request:** place a small event-owner dot beside the agent
in the sidebar so the currently changing agent is visible. The dot must reflect
event ownership rather than selection or hover; shared events without an agent
must not fabricate an owner. The implemented dot uses explicit checked event
scope or a checked linked work/request owner; it does not use ambient generator
partition for global events. It follows the displayed history frame and remains
steady while paused. Tests cover agent 2 owning an event while agent 1 is
selected, history movement and an unowned resident event. Astra advised this
implementation and passed final rendered review. Specific captures are
`/workspace/hapsland-review/visual-update/mixed-3d.png`,
`event-agent2-selected1.png`, `mixed-hover-agent2.png`, and `mixed-zoom115.png`.


The complete temporary hook-timing panel is now deleted, superseding the earlier
dated current-only timing cleanup outcome above. Native PRE reports and the
three Current proof slices remain; no additional proof was required for these
UI changes. Global ledger inset prototype acceptance remains the owner's
separate next decision after the specific before/after review.

## Focus, scroll stability and resource relationship (2026-10-02)

The owner requested expanding the focused agent diagram, fixing wheel zoom
jumps/native scrollbar conflicts, and investigating the relationship between
resident capacity and execution pools. This is authorized UX correction and
relationship review, not a change to capacity policy.

**Inspected implementation relationship:** these are distinct hard limits on
the same work lifecycle. The [ledger](../packages/agent-flow-bend/Ledger.bend)
counts logical item/byte reservations, globally and per agent. It includes
preparation workspaces, review units, retained findings and other charged data;
it is not a measurement of process memory. [Canonical](../packages/agent-flow-bend/Canonical.bend)
reserves a workspace before preparation, swaps it for accepted review-unit
reservations, and can retain a stored finding after review settles.
[Dispatch](../packages/agent-flow-bend/Dispatch.bend) separately bounds running
preparation jobs and authorized Jev requests. There is no fixed item-to-slot
ratio. Both execution pools can be empty while a stored finding still consumes
ledger capacity; cancellation can release data before an execution permit is
finally released. These code facts do not establish native timing guarantees.

**Astra advice:** preserve current positions and flow routes, use the same green
dashed shared-resource family and ONE RESIDENT heading, distinguish Work
reservations from Execution limits, and explain that items/bytes may remain
reserved after execution slots are released. Add no conversion arrows or paired
slots. A larger merged-card placement is not selected by this record. Preserve
the existing reference from the resident contact to the capacity inset.

**Implementation and validation:** focused desktop diagrams fill the available
width with their natural aspect ratio instead of a fixed 3D-height reservation.
Narrow focus preserves a readable minimum width with horizontal scrolling.
Spatial wheel zoom retains plain-wheel capture only inside the camera,
normalizes/clamps deltas and batches gentle updates per animation frame. The
spatial surface has no native internal scrollbar; scrolling outside it and in
flat focus remains native. The two resource cards now share family styling and
state their distinct roles; the screen-facing legend explains reservation
lifetime. TypeScript, camera and ensemble browser checks passed. A focused
capacity browser also checks a retained storedResult (1 item/35 bytes) with both
execution pools empty. Astra's final rendered review passed desktop focus, narrow readable scrolling,
normalized burst zoom, shared-resource roles and the retained-finding/idle-pool
case. Placement remains a prototype for owner inspection. Physical-device
gesture support is not claimed by browser emulation. Review captures:
`/workspace/hapsland-review/focus-gesture/mixed-flat.png`,
`/workspace/hapsland-review/focus-gesture/focus-narrow.png`, and
`/workspace/hapsland-review/global-capacity/retained-idle-flat.png`.
Astra independently reran the camera browser: a burst of 100 huge wheel events
in one frame changes zoom by less than 9%; range 20–200, no internal spatial
scrollbar, outside native scroll, keyboard/reset and CDP pinch checks passed.
The existing execution-pool browser also passed saturation, release, history,
reload, keyboard and narrow cases after the family styling change.
