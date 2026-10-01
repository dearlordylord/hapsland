# Shared-resident Monkey Business and capacity UX workbook

**Purpose:** Coordinate generated Monkey Business coverage and Bend-governed capacity indicators in the system diagram.
**Status:** Temporary working proposal; initial review recorded on 2026-10-01. No implementation scope is accepted by the tables alone.
**Authority:** Advisory findings from the Monkey Business coverage subagent and Astra medium's capacity/UX review. This is not an accepted product contract. Existing specification owners and [dashboard rules](../packages/agent-flow-viz/DASHBOARD-RULES.md) retain decision authority.
**Expected use:** Select work, record decisions and evidence, and coordinate implementation and UX reviews in the `feat/multi-agent-3d` worktree.
**Lifecycle:** Delete at the **Shared-resident coverage and capacity UX milestone**: the scope selected from this workbook has been implemented or explicitly deferred, relevant checks are complete, and Astra medium has reviewed the resulting UX. Before deletion, consolidate simulator behavior and evidence boundaries into [Monkey Business README](../packages/monkey-business/README.md), diagram behavior into [visualization README](../packages/agent-flow-viz/README.md), and projection rules into [DASHBOARD-RULES.md](../packages/agent-flow-viz/DASHBOARD-RULES.md). Move accepted product-policy changes to their existing named specification owners; carry still-useful deferred proposals into the project backlog. Update inbound links and delete this workbook. Git history retains its chronology.

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
| Pending | Select implementation scope; check the existing preparation contract and record any unresolved modeling choice separately. | Not started |

Append accepted scope, subsequent Astra advice/review, concrete visual cases, checks and limitations here as work proceeds. Keep initial recommendations distinguishable from later outcomes.
