# Shared-resident Monkey Business and capacity UX workbook

**Purpose:** Coordinate generated Monkey Business coverage and Bend-governed capacity indicators in the system diagram.
**Status:** Temporary implementation tracking workbook. Astra rendered review and heterogeneous per-agent permit verification are complete. The corrected 142-test execution suite, browser reruns and build passed. The initial 2026-10-01 advisory inventory is preserved.
**Authority:** Advisory inventory plus subsequent implementation and validation evidence, including Astra medium's capacity/UX review. This is not an accepted product contract. Existing specification owners and [dashboard rules](../packages/agent-flow-viz/DASHBOARD-RULES.md) retain decision authority.
**Expected use:** Track authorized work, decisions and evidence, and coordinate implementation and UX reviews in the `feat/multi-agent-3d` worktree.
**Lifecycle:** Retain this requested workbook beyond the final handoff. At the **Next planning-cycle workbook replacement milestone**, after the user has finished using this workbook and a named replacement artifact or accepted backlog contains its still-useful deferred proposals, **consolidate** current simulator behavior and evidence boundaries into [Monkey Business README](../packages/monkey-business/README.md), diagram behavior into [visualization README](../packages/agent-flow-viz/README.md), and projection rules into [DASHBOARD-RULES.md](../packages/agent-flow-viz/DASHBOARD-RULES.md). Move any accepted product-policy decisions to their named specification owners, update inbound links to the replacement/backlog or maintained owners, and **delete** this workbook. Receipt of the final answer alone does not trigger retirement. Git history retains its chronology.

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
