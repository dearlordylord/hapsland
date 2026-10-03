# Architecture teaching game: design context and next decisions

**Purpose:** Preserve the owner's goals for the teaching game and balance laboratory without fixing the tower roster or abilities prematurely.
**Status:** Active design proposal from the 2026-10-02 discussion; the owner selected Coordinator, Packager and Parallelizer for initial experiments; confirmation of the laboratory testing seam remains pending.
**Authority:** Owner-stated design intentions and proposed game decisions. Existing product contracts and shared-simulator issues own business behavior; this document neither changes them nor establishes learning outcomes.
**Expected use:** Select a small initial set of teaching mechanisms, specify the laboratory, and evaluate replacements or wider gameplay changes against the same goals.
**Lifecycle:** At acceptance of the first laboratory/game-design specification, **consolidate** its selected decisions into the implementation issue and enduring optional-game guide; keep unresolved roster/ability decisions in that named design owner, update inbound links, and **delete** this temporary context document. Review before changing a teaching mechanism or replacing the shared simulator consumer.

## Owner goals and sequence

The owner wants to learn how to find imbalance and eventually balance towers, workload difficulty and investment choices. Development-time automatic parameter search is the intended direction; adaptive difficulty during play is a separate feature and is not requested. The present task ranks teaching mechanisms and prepares specifications, not implementation or new balance trials.

The seven existing towers and their abilities are candidates. They are not a retention requirement. A laboratory must allow an enabled subset, parameter changes, ability replacement and removal, and later changes to the game's principles without creating a second business engine. The correct research outcome may be "replace this ability", not merely a numerical nerf.

Sequence:

1. Rank current mechanisms by importance and fidelity of the architecture lesson, causal clarity and suitability for a small first experiment.
2. Use the owner-selected provisional study set: Coordinator, Packager and Parallelizer. Selection is reversible and does not require all seven towers to become useful.
3. Build a headless laboratory for controlled comparisons and imbalance search at the highest existing simulation boundary.
4. Investigate universal purchase plans, dead investments, context-dependent tradeoffs and problematic combinations; allow these findings to change the roster or abilities.
5. After selecting useful mechanics, tune costs, strengths, radii, cadence and workload difficulty more precisely, using bounded development-time search where warranted.
6. Observe human predictions and explanations separately from difficulty, engagement and willingness to replay.

## Existing architecture constraint

[Shared Monkey Business specification #176](https://github.com/dearlordylord/hapsland/issues/176) and [optional game migration #199](https://github.com/dearlordylord/hapsland/issues/199) already require continuous workload, one shared simulation owner and independent game/dashboard engine instances. Authored game waves are removed in that migration; finite scenario scripts and test endpoints remain useful, but must not rebuild a wave scheduler. The owner's earlier reference to waves is retained here as motivation to study challenge over time, not a silent reversal of that accepted architecture.

Canonical owns product decisions. Monkey Business owns source-free workload generation, virtual time and ordered simulated environment effects. The optional game owns geometry, economy, health, presentation, tower selection and the mapping of player actions to supported generic environment actions. Neither game metrics nor optimization may patch Canonical, invent retries/fairness, release retained ownership, bypass permits or change delivery authorization.

The latest source-checkout teaching prototype is [canonical defense](../prototypes/canonical-defense/README.md); its declared current source and evidence must be distinguished from the continuous consumer targeted by #199. Earlier prototypes are mechanism references, not runtime dependencies or evidence that the migration has landed. Select useful lessons before deleting them, as the parent specification requires.

## Teaching selection criteria

Use [the tower priority assessment](tower-teaching-priority.md). Rank by:

- importance of the illustrated production concept;
- an observable causal before/after case tied to an actual business observation;
- a clear distinction between the synthetic intervention and the production decision;
- a useful countercase where the intervention cannot help;
- compatibility with supported replayable environment actions;
- complementary lessons within a small roster and risk of teaching a false architecture.

A mechanism may have high teaching value but lack a suitable supported action in the continuous consumer. Record these as separate facts. Do not make a preservation requirement or expand the core API just to retain a tower name. Naming, art and the final roster remain open.

## Principles that keep the game editable

Separate mechanism identity, presentation identity, configurable parameters and policy/action representation. An existing tower name is not the public business API. A headless experiment runs the same game mechanic-to-environment adapter as interactive play; replacing a mechanic requires its mapping and focused scenarios to change, rather than another engine.

Changing price/radius/strength/cooldown should be a configuration change within declared bounds. Adding or removing a mechanism changes the enabled catalogue and applicable action policies. Replacing an ability changes its adapter and meaningful observations. Changing the game's principles may require new metrics, scenario composition and policies; no architecture can make that free. Preserve the headless experiment boundary and avoid parameterizing every hypothetical future mechanic.

General accounting and product-authority boundaries deserve stable laws/checks. Current prices and abilities remain experimental. Bend's checker verifies stated proof terms, not automatically that unstated game requirements hold. Concrete arithmetic examples, general quantified laws, scenario outcomes and human observations must remain distinct.

## Comparison and balance principles

Compare baseline, A, B and A+B against matched source-free workload inputs and budgets. A contextual niche is acceptable; a tower need not help everywhere. Identify starting budget, purchase time, placement, residual gold and finite evaluation horizon. Holding exogenous inputs equal does not mean forcing identical business event timelines after an intervention.

Expose separate metrics for gameplay survival/investment, business progress/retention, and teaching distinctions. Do not require a global 50% victory rate for a single-player teaching game or collapse the whole design into one score. Preserve ability identity through explicit constraints where relevant; optimization can otherwise erase the mechanic it was meant to improve.

Search a bounded space of plans/placements/timing and supported workload scenarios. Absence of a counterexample means only "none found within this search". Keep parameter tuning contexts separate from held-out evaluation contexts. Authored deterministic draw rotations are fixtures, not random samples establishing probabilities. Use actual randomized sampling only with declared distributions and independent streams; no universal statistical accuracy target is imposed before a study defines one.

Preserve the causal lesson: accelerating service differs from acquiring a shared permit; preventing unresolved findings differs from removing observed retained advice; output commitment differs from acknowledgment and retirement; reducing game damage does not process business work. Business traces show only their supported simulated scope, not real Jev timings or agent behavior.

## Proposed laboratory boundary and next work

One game-owned headless experiment interface takes mechanism settings, a source-free scenario, a deterministic player action schedule/policy and finite budgets. It consumes the shared public Monkey Business boundary and returns game metrics, business observations and sufficient ordinary replay input to reproduce the run. It owns no duplicate business simulation.

The [laboratory specification draft](game-balance-lab-spec.md) makes these decisions reviewable. The `to-spec` workflow requires the owner to confirm this testing seam before publishing the laboratory implementation issue. The concrete draft also covers mechanism replacement, disable/remove cases and meaningful tests of paired comparison. Publication schedules work; it does not accept the provisional roster or prove teaching effectiveness.

Outstanding decisions after the laboratory foundation:

- implement the selected provisional Coordinator, Packager and Parallelizer experiments using the ranked causal cases;
- revise or remove unsupported/misleading abilities;
- decide the first workload contexts and finite experiment objectives;
- establish gameplay economy/reward rules suitable for continuous workload, without importing obsolete wave rewards;
- choose whether a later bounded optimizer is worthwhile after simple comparisons/search;
- define a small human teaching study before claiming educational benefit.

## Evidence and limits

Source inspection and accepted issue scope inform this proposal. No new game campaign, participant study, proof check or platform compatibility experiment is performed here. Existing balance runners, causal ablations and narrow proofs provide prior art, not acceptance of a new game design. Useful research entry points: [Micro-Machinations](https://ir.cwi.nl/pub/21923/21923B.pdf), [tower-defense action-impact balancing](https://sander.landofsand.com/publications/bakkes_cig2016_paper_74.pdf), [Metagame Autobalancing](https://arxiv.org/abs/2006.04419).
