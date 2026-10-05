# Development-time architecture game balance laboratory

**Tracker owner:** [Laboratory issue #203](https://github.com/dearlordylord/hapsland/issues/203).

**Purpose:** Specify a development-time laboratory for controlled experiments with editable architecture-teaching game mechanisms.
**Status:** Implementation in progress. The owner confirmed the shared-engine seam on 2026-10-02 and superseded the earlier provisional roster on 2026-10-05 with Jev Service, Delivery Relay and Access Repair. Monkey Business and the qualified game consumer are available on master; the laboratory remains a separate branch.
**Authority:** Owner-agreed laboratory scope and testing seam synthesized from the discussion, constrained by the accepted shared-simulator specification. Detailed implementation choices remain proposals within that scope. This issue does not change product policy, accept a final tower roster or establish educational effectiveness.
**Expected use:** Implement the smallest reusable experiment boundary and bounded comparison/search workflow, then use evidence to select or replace mechanisms.
**Lifecycle:** The published issue owns implementation scheduling. At completion of #203, **consolidate** enduring experiment/configuration contracts into the optional-game guide and testing matrix, transfer roster decisions to the game-design owner, update inbound links and **delete** this local specification snapshot and superseded handoff documents.

## Problem Statement

The owner wants to identify imbalance and make meaningful choices about architecture-teaching towers, their abilities, investment and workload difficulty. The existing tower roster is not final. Tuning all seven towers now risks preserving weak teaching mechanisms and spending effort balancing abilities that may be replaced.

The current prototype offers useful directed comparisons but hardcodes tower parameters and named purchase plans. Existing proof checks establish their explicitly stated properties, not strategic balance or human learning. The owner needs reproducible evidence about causal effects, contextual tradeoffs, ineffective investments and powerful combinations while retaining freedom to change the game.

## Solution

Provide a game-owned headless experiment laboratory over the shared public Monkey Business simulation boundary. Define a small enabled mechanism set, configurable parameters, source-free workload contexts, deterministic player actions/policies and finite execution limits. Run matched baseline/candidate experiments, record separate game and business observations, and reproduce outcomes using ordinary replay plus the game-owned experiment inputs.

Start with bounded explicit plan enumeration and controlled comparisons. Produce evidence for selecting, replacing or deleting mechanisms before precise numerical balancing. Do not build a new business simulator or automatically apply discovered changes to the playable game. A sophisticated parameter optimizer is a later decision after the foundation demonstrates useful experiments.

The optional game is a continuous-workload consumer under [#176](https://github.com/dearlordylord/hapsland/issues/176) and [#199](https://github.com/dearlordylord/hapsland/issues/199). Workload intensity profiles and finite evaluation windows replace authored waves in the laboratory's target architecture. Retain old wave scenarios only as clearly scoped reference evidence; do not recreate a wave scheduler.

## User Stories

1. As a game designer, I want to enable a small subset of mechanisms, so that I can investigate interactions without committing to the current roster.
2. As a game designer, I want to change costs and effect parameters within declared bounds, so that tuning does not require changing business policy.
3. As a game designer, I want to replace an ability while retaining the experiment boundary, so that evidence guides design rather than preserving old code.
4. As a game designer, I want to remove a mechanism and its obsolete action paths, so that rejected mechanics do not remain hidden compatibility obligations.
5. As a learner, I want each candidate mechanism linked to a concrete architecture lesson, so that I understand what its effect represents.
6. As a learner, I want a countercase where that mechanism cannot help, so that I do not mistake it for a universal solution.
7. As a designer, I want baseline and candidate runs with matched exogenous workload inputs, so that differences can be attributed to the intervention.
8. As a designer, I want comparable investment budgets and purchase timing, so that an expensive plan does not win an unfair comparison.
9. As a designer, I want explicit no-action and no-investment baselines, so that I can see the value of decisions.
10. As a designer, I want baseline, A, B and A+B comparisons, so that useful or excessive combinations become visible.
11. As a designer, I want several workload contexts, so that a context-specific niche is distinguishable from a universal winning plan.
12. As a designer, I want workload difficulty to vary independently of game presentation, so that changes have an identifiable cause.
13. As a designer, I want continuous workload evaluated over explicit finite windows, so that every automated experiment has a bounded endpoint.
14. As a designer, I want deterministic player plans with placement and upgrade actions where supported, so that a result identifies what the player actually did.
15. As a designer, I want a bounded enumeration of declared plans, so that I can search for dead investments and strong combinations without introducing RL.
16. As a designer, I want search scope and exhaustion reported, so that an unobserved exploit is not described as impossible.
17. As a designer, I want game health, investment and remaining budget separate from business progress and retention, so that one aggregate score does not hide a bad lesson.
18. As a learner, I want acceleration distinguished from acquiring a shared request permit, so that I understand the bottleneck.
19. As a learner, I want prevention distinguished from removal of observed advice, so that the game preserves the meaning of retention.
20. As a learner, I want output commitment distinguished from acknowledgment and retirement, so that faster output is not mistaken for permission to discard ownership.
21. As a maintainer, I want interventions translated through supported generic environment actions, so that game objects never enter the shared simulator.
22. As a maintainer, I want already issued facts preserved unless a supported targeted intervention changes them, so that parameter changes do not rewrite history.
23. As a designer, I want an explicit unsupported-intervention result, so that a tower is not simulated by patching Canonical when its action is unavailable.
24. As an engineer, I want the headless and interactive consumers to use the same game action mapping, so that the laboratory tests the actual mechanic.
25. As an engineer, I want replay and mechanism/configuration identity attached to results, so that changes can be traced and reproduced.
26. As an engineer, I want rendering, playback and observation retention excluded from experiment decisions, so that they cannot change the outcome.
27. As a designer, I want authored fixtures distinguished from randomized samples, so that percentages do not imply unsupported probability estimates.
28. As a designer, I want held-out contexts separated from tuning contexts, so that a patch can be tested beyond the examples used to choose it.
29. As a maintainer, I want game-absent application/dashboard builds preserved, so that the laboratory remains optional.
30. As a designer, I want parameter suggestions and roster findings to remain reviewable proposals, so that experiments do not silently redesign the game.
31. As an educator, I want proposed human prediction/explanation checks recorded separately, so that numerical results are not described as evidence of learning or enjoyment.

## Implementation Decisions

- The laboratory belongs to the optional game. Reuse the shared public create/step/bounded-advance/control/injection/observation/replay operations; Canonical and ImportGraph remain the production decision authorities.
- The primary experiment boundary accepts mechanism configuration, a source-free shared scenario, deterministic player schedule/policy, context identity and finite run/search budgets. It returns applicable actions and refusals, separate metrics, ordinary business replay plus the game configuration/actions needed to reproduce game observations, and explicit termination reasons.
- Reuse the game consumer's mechanic-to-environment mapping. Add only the game-owned experiment wrapper required for comparison; do not introduce another interpretation of product commands or effect scheduling.
- Complete this specification while Monkey Business is being rewritten in Bend. The shared Bend consumer is now available; qualify the separate game branch before integrating it through master into the laboratory branch. Coordinate with the relevant complete slices of the shared-simulator and optional-game work; do not extend the old host into a fallback business engine. Unrelated deferred scenario families need not block the laboratory.
- Separate stable mechanism identity, display names, enabled catalogue, parameter settings and policy actions. Numeric tuning is configuration; ability replacement changes the corresponding mapping and focused scenarios. No universal plugin language is required.
- The current game-design direction supersedes the earlier provisional Coordinator/Packager/Parallelizer selection. Initial experiments use Jev Service (future request delay), Delivery Relay (future output delay), and Access Repair (source/credential availability), through the actual game Host mapping. Compare no-action, individual and pair plans, preserve captured deadlines and retention, and keep identifiers, construction prices and ability assignments configurable. These three mechanisms are an experimental teaching roster; unsupported replacement mappings remain explicit rather than patching product state.
- A mechanism descriptor records its intended lesson, intervention target, applicability conditions and business observation used to demonstrate its effect. This is experiment metadata, not a new product policy or in-run diagnostic architecture.
- Validate enabled mechanism references and declared numeric domains before starting. Disabled/removed mechanisms cannot be selected silently by a policy. Illegal placement, unaffordable purchase and inapplicable environment action remain explicit outcomes distinct from harness failure; never charge for a rejected action unless an explicitly chosen game rule requires it.
- The laboratory's minimal search is finite enumeration of declared plans/placements/timing/configurations. Specify limits and report which combinations ran, which were invalid and which were not explored. Do not declare global optimality or universal dominance from that search.
- Paired comparisons preserve the exogenous scenario and control schedule. Do not require identical realized event sequences after causal intervention: the intervention can legitimately change timing, business progress and subsequent endogenous player/workload responses.
- Where outcome assignment depends on issued-operation ordering, use existing supported explicit scripted outcomes for strict causal comparisons or identify the coupling limitation. The same seed alone does not prove identical per-item outcomes after a candidate changes request issuance. Do not require a new shared random-stream system in this task.
- Record initial budget, purchase/upgrade times, spent/remaining resources, placement, finite horizon and scenario assumptions. Continuous-game reward/accounting rules come from the game-design owner; do not reuse wave rewards or invent a persistent market. If that consumer has no accepted reward rule, begin with fixed experiment budgets and report the limitation.
- Preserve separate gameplay, business and teaching-observation metrics. Permit context-specific tradeoffs and pair interactions. Numeric thresholds and desired human difficulty are study-specific declarations, not arbitrary hardcoded acceptance targets.
- Hard correctness and teaching-boundary constraints are distinct from soft balance objectives. Optimization cannot change ownership, permits, freshness, authorization or committed output membership to improve the score. Game-only health/gold do not mutate business state.
- Replay remains input-oriented and formats remain version 1. Bind results to actual engine/game/mechanism identities and reject incompatible identities explicitly; no legacy replay shims or parallel formats.
- Keep business frames and experiment summaries in their appropriate structured formats. Reuse ordinary replay/test failure output; no automatic witness minimizer, special replay UI, comprehensive diagnostic taxonomy or dashboard game terminology is introduced.
- Treat the tower priority ranking as advisory source inspection. A high rank does not accept the ability, prove learning or require a new environment capability. Record unsupported translations rather than expanding shared scope to preserve a tower.
- Dependency/library choices and a later evolutionary, Bayesian or RL optimizer are deferred until bounded comparisons expose a concrete need. All routine experiments are offline, source-free and finite, with no credentials or live Jev.
- Delete replaced game-owned configuration/action/comparison paths when introducing their current owner. Earlier prototype deletion follows the existing owner-selection trigger, not automatic cleanup by this issue.

## Testing Decisions

- The highest seam is the game-owned headless experiment boundary over the shared public Monkey Business API. Test observable input-to-action, refusal, business observations, investment outcomes, metrics and replay; avoid tests mirroring private helper decomposition.
- Prior art includes existing actual-host paired balance matrices, causal risk/pressure ablations, directed campaign checks and saved-result validation; shared simulator replay, step/advance, environment and native/emitted conformance tests; and independent canonical boundary assertions.
- The test matrix includes identical experiment replay; baseline/candidate with equal fixed budgets; one meaningful positive causal case and one countercase per initial mechanism; A/B/A+B interaction; disable/remove and representative ability-replacement cases; invalid policy/configuration and unaffordable/inapplicable actions; deterministic finite exhaustion; and held-out-context separation.
- Expectations for the causal cases come from accepted business contracts and declared game rules. Compare a concrete permit, eligibility, retention or delivery observation and its timing/identity as appropriate; do not obtain the expected answer by running the same policy twice.
- Verify the game adapter does not patch Canonical and applies only supported environment actions. Exercise unchanged issued facts and committed output where relevant. Existing authority/proof gates remain authoritative; do not mandate an exhaustive new theorem inventory.
- Check step versus bounded advance, split advancement and presentation independence at matching control boundaries using existing simulator coverage where it suffices. New tests focus on the game mapping and experiment wrapper, not duplicate proofs of unchanged simulator internals.
- Reproduce applicable business traces under native Bend and emitted JavaScript using the shared conformance seam. Validate game-native mechanics on their actual supported lane; do not claim game/platform compatibility from business-lane equivalence alone.
- Demonstrate that representative intentionally wrong action mapping or metric accounting fails an independently expected scenario. This is test sensitivity, not a mandate for a new mutation-testing framework.
- Run documentation checks for specification changes. At implementation, select relevant optional-game/shared-simulator gates from the testing matrix; validate game-absent independence if dependency edges change. GitHub CI is not an additional completion gate.
- No participant study or live backend execution is required to accept the laboratory foundation. Report numerical scope, assumptions, unsearched combinations and human-validation gaps explicitly.

## Out of Scope

- Final tower roster, obligation to retain all seven towers or their current names/abilities, full game redesign, and global balance certification.
- Dynamic difficulty adjustment during play, automatic publishing/application of balance patches and self-modifying gameplay rules.
- A sophisticated optimizer, RL training, large statistical campaigns or a universal mechanism scripting/plugin language.
- Authoring waves or a duplicate business scheduler; restoring old wave compatibility after continuous-consumer migration.
- New product concurrency/capacity controls, retry/fairness/authorization semantics or simulator-wide diagnostic requirements not accepted in their contract owners.
- Live Jev, actual agent loops, source capture, transport or platform compatibility claims; formal proof of the complete game or of human enjoyment/learning.
- Synchronized game/dashboard networking, game terminology in shared business APIs, persistent player economies or trading systems.

## Further Notes

The owner's intended sequence is laboratory foundation, reversible mechanic selection/replacement, broader context comparisons, then precise development-time balancing if useful. Universal accounting and architecture constraints should be stable; prices, roster, abilities and game objectives remain editable study choices.

The Bend Monkey Business boundary and selected mechanism capabilities are now available. Laboratory implementation follows the qualified game branch through master. This work is downstream of the continuous consumer in #199 and reuses the public boundary from #176. It does not enlarge their already agreed scope or require every migration ticket to finish before specifying experiments. The strongest risk is optimizing a proxy or weak player policy while damaging the architectural lesson; preserve separate observations and retain a later human teaching check.

The [source-inspected tower priority assessment](tower-teaching-priority.md) and [game-design context](game-design-context.md) are prepared in the isolated `spec/game-balance-lab` worktree. They record proposed selection, unsupported mappings and follow-up decisions; no new balance experiment or learning validation is claimed. The owner confirmed the headless experiment boundary over the shared engine on 2026-10-02. This confirms the testing seam and permits publication/scheduling; current implementation and measured scope are recorded in the optional laboratory guide.
