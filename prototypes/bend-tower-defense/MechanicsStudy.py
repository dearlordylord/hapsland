#!/usr/bin/env python3
"""Throwaway analytical calibration; this is NOT gameplay or a Hapsland reducer.

Replay: python3 MechanicsStudy.py [--output mechanics-results.json]
Only Python's standard library is used. Immutable demands and exogenous outcomes
are paired across policies, with no policy-dependent RNG consumption.

Discrete loss-network recurrences, with completion before arrival each tick:
  P[t+1] = P[t] + admitted[t] - preparation_done[t]
  R[t+1] = R[t] + review_started[t] - review_done[t]
  O[t+1] = O[t] + retained_findings[t] - collected[t]
  demanded = gate_loss + preparation_loss + review_loss + completed + P + R
  findings = output_loss + retained + collected
No refused demand is queued or retried. Admission gating sacrifices coverage,
not demand: the denominator is always the entire authored workload.

This simplified candidate game model allocates slots across three stages. It
deliberately omits canonical identities, revisions, advice leases, encoded bytes,
stale callbacks, multiple agents and backend failure. Canonical/Bend experiments
must validate selected configurations separately. Exact recurrence assertions
establish accounting in this model, not mathematical proof of Hapsland.

Theory context: https://web.mit.edu/urban_or_book/www/book/chapter4/4.1.html
MIT's original textbook emphasizes model assumptions and approximations. No
steady-state Poisson formula is applied to transient authored bursts here.
Game calibration thresholds below are proposed heuristics, not validated
engagement measures. Human enjoyment and teaching transfer remain UNKNOWN.

PREREGISTERED SELECTION CRITERIA (recorded before first execution/tuning):
1. No action universally Pareto-dominates all others across scenario/difficulty.
2. At least two scenario families prefer different scarce-resource allocations.
3. Worst simple vs best named policy differs by >=0.10 coverage OR delivery in
   at least two normal-difficulty families; lower load should be easier.
4. Immutable offered-demand denominator makes idle score0 rather than a win.
5. Decisions expose stage occupancy, refusal, output hold and immutable forecast;
   visible state churn is only a legibility opportunity, not a learning measure.
6. Report coverage, delivery, losses and occupancy separately as Pareto outcomes;
   optional equal-weight scalar is a designer preference, never engagement.
7. Static allocations cannot be churned to release held permits; reject an idle
   exploit; dynamic retasking in the actual Bend game needs an independent check.
These criteria are hypotheses to falsify, not a promise to tune until they pass.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import itertools
import json
import platform
import random
import statistics
from pathlib import Path


@dataclasses.dataclass(frozen=True)
class Scenario:
    name: str
    prep: int
    review: int
    collection: int
    burst: bool = False
    findings: float = 0.6


SCENARIOS = (
    Scenario("steady", 3, 5, 8),
    Scenario("preparation-heavy", 11, 3, 8),
    Scenario("review-heavy", 2, 15, 8),
    Scenario("output-heavy", 2, 3, 25, findings=0.9),
    Scenario("burst", 3, 7, 8, burst=True),
    Scenario("deadline", 3, 12, 8, burst=True),
)
ALLOCATIONS = {"balanced": (4, 4, 4), "preparation": (7, 3, 2),
               "review": (2, 8, 2), "output": (2, 3, 7)}
DIFFICULTIES = {"easy": 0.28, "normal": 0.50, "hard": 0.80}
SEEDS = range(64)
HORIZON = 180
BUDGET = 12


def demands(scenario: Scenario, seed: int, rate: float) -> list[tuple[int, int, int, bool]]:
    rng = random.Random(seed)
    result = []
    for tick in range(HORIZON):
        if scenario.burst:
            # Same expected offered demand as steady; eight-tick bursts in a
            # 24-tick cycle. Compound arrivals intentionally test transients.
            density = rate * 3 if tick % 24 < 8 else 0
        else:
            density = rate
        count = int(density) + int(rng.random() < density % 1)
        for _ in range(count):
            result.append((tick, max(1, scenario.prep + rng.randrange(-1, 2)),
                           max(1, scenario.review + rng.randrange(-1, 2)),
                           rng.random() < scenario.findings))
    return result


def simulate(scenario: Scenario, jobs: list[tuple[int, int, int, bool]],
             allocation: tuple[int, int, int], gate: bool = False) -> dict:
    pcap, rcap, ocap = allocation
    assert sum(allocation) == BUDGET and min(allocation) >= 1
    prep = []
    review = []
    retained = []
    c = dict(demanded=0, gate_loss=0, preparation_loss=0, review_loss=0,
             completed=0, findings=0, output_loss=0, collected=0,
             deadline_pending=0, deadline_retained=0)
    integral = [0, 0, 0]
    visible_changes = 0
    arrivals = {}
    for job in jobs:
        arrivals.setdefault(job[0], []).append(job)
    # Finite service drain after the visible deadline, with no invented Stop.
    tail = scenario.prep + scenario.review + scenario.collection + 5
    previous = (0, 0, 0, 0, 0)
    for tick in range(HORIZON + tail):
        # Product collection mechanics are richer; this candidate toy simply
        # empties retained output at a fixed opportunity before new arrivals.
        if tick % scenario.collection == 0:
            c["collected"] += len(retained)
            retained.clear()
        completed = [item for item in review if item[0] <= tick]
        review = [item for item in review if item[0] > tick]
        for _, job in completed:
            c["completed"] += 1
            if job[3]:
                c["findings"] += 1
                if len(retained) < ocap:
                    retained.append(job)
                else:
                    c["output_loss"] += 1
        ready = [item for item in prep if item[0] <= tick]
        prep = [item for item in prep if item[0] > tick]
        for _, job in ready:
            if len(review) < rcap:
                review.append((tick + job[2], job))
            else:
                c["review_loss"] += 1
        for job in arrivals.get(tick, ()):
            c["demanded"] += 1
            # Conservative occupancy gating uses observable present state only.
            # No access to future demand, sampled service times or outcomes.
            if gate == "idle" or gate and (len(review) + len(prep) >= rcap or len(retained) >= ocap):
                c["gate_loss"] += 1
            elif len(prep) < pcap:
                prep.append((tick + job[1], job))
            else:
                c["preparation_loss"] += 1
        assert c["demanded"] == sum(c[key] for key in
            ("gate_loss", "preparation_loss", "review_loss", "completed")) + len(prep) + len(review)
        assert c["findings"] == c["output_loss"] + c["collected"] + len(retained)
        assert len(prep) <= pcap and len(review) <= rcap and len(retained) <= ocap
        if tick < HORIZON:
            integral = [value + occupancy for value, occupancy in
                        zip(integral, (len(prep), len(review), len(retained)))]
            now = (len(prep), len(review), len(retained), c["completed"],
                   c["gate_loss"] + c["preparation_loss"] + c["review_loss"])
            visible_changes += now != previous
            previous = now
        if tick == HORIZON - 1:
            c["deadline_pending"] = len(prep) + len(review)
            c["deadline_retained"] = len(retained)
            c["completed_at_deadline"] = c["completed"]
            c["collected_at_deadline"] = c["collected"]
    assert not prep and not review and not retained
    total = len(jobs)
    offered_findings = sum(job[3] for job in jobs)
    coverage = c["completed_at_deadline"] / total if total else 1
    delivery = c["collected_at_deadline"] / offered_findings if offered_findings else 1
    # Equal weights are a declared designer choice; retain raw quantities too.
    # No rewards for withholding workload or inventing certainty about quality.
    score = 0.5 * coverage + 0.5 * delivery
    return dict(c, coverage=coverage, delivery=delivery, score=score,
                offered_findings=offered_findings,
                occupancy_mean=[x / HORIZON for x in integral],
                visible_change_fraction=visible_changes / HORIZON,
                service_lower_bound_slots=[rate_work(jobs, 1), rate_work(jobs, 2),
                    offered_findings / HORIZON * scenario.collection],
                **{"source_boundary": "analytical candidate model; not Bend canonical execution"})


def rate_work(jobs: list, index: int) -> float:
    return sum(job[index] for job in jobs) / HORIZON


def mean(values: list[float]) -> float:
    return round(statistics.mean(values), 6)


def run() -> dict:
    rows = []
    configurations = {**{name: (alloc, False) for name, alloc in ALLOCATIONS.items()},
                      "balanced-gate": (ALLOCATIONS["balanced"], True),
                      "review-gate": (ALLOCATIONS["review"], True),
                      "idle": (ALLOCATIONS["balanced"], "idle")}
    for scenario, (difficulty, rate), seed in itertools.product(SCENARIOS, DIFFICULTIES.items(), SEEDS):
        jobs = demands(scenario, seed, rate)
        for policy, (alloc, gate) in configurations.items():
            rows.append(dict(scenario=scenario.name, difficulty=difficulty,
                             seed=seed, policy=policy, allocation=alloc,
                             **simulate(scenario, jobs, alloc, gate)))
    summary = []
    for scenario, difficulty, policy in itertools.product(SCENARIOS, DIFFICULTIES, configurations):
        group = [r for r in rows if (r["scenario"], r["difficulty"], r["policy"]) ==
                 (scenario.name, difficulty, policy)]
        summary.append(dict(scenario=scenario.name, difficulty=difficulty, policy=policy,
            mean_score=mean([r["score"] for r in group]),
            mean_coverage=mean([r["coverage"] for r in group]),
            mean_delivery=mean([r["delivery"] for r in group]),
            score_min=round(min(r["score"] for r in group), 6),
            score_max=round(max(r["score"] for r in group), 6),
            # Proposed threshold only; this is not a human difficulty metric.
            candidate_clear_rate=mean([r["score"] >= 0.75 for r in group]),
            mean_review_loss=mean([r["review_loss"] for r in group]),
            mean_gate_loss=mean([r["gate_loss"] for r in group]),
            mean_output_loss=mean([r["output_loss"] for r in group]),
            resource_budget=BUDGET,
            mean_occupancy=[mean([r["occupancy_mean"][i] for r in group]) for i in range(3)],
            mean_visible_change_fraction=mean([r["visible_change_fraction"] for r in group])))
    def cell(s, d, p):
        return next(r for r in summary if (r["scenario"], r["difficulty"], r["policy"]) == (s, d, p))
    reversals = []
    dominance = []
    for a, b in itertools.combinations(configurations, 2):
        wins_a = []
        wins_b = []
        for s, d in itertools.product(SCENARIOS, DIFFICULTIES):
            delta = cell(s.name, d, a)["mean_score"] - cell(s.name, d, b)["mean_score"]
            if delta > .02:
                wins_a.append(dict(scenario=s.name, difficulty=d, delta=round(delta, 6)))
            if delta < -.02:
                wins_b.append(dict(scenario=s.name, difficulty=d, delta=round(-delta, 6)))
        if wins_a and wins_b:
            reversals.append(dict(policies=[a, b], a_better=wins_a, b_better=wins_b))
        if wins_a and not wins_b:
            dominance.append(dict(winner=a, loser=b, criterion="mean score +0.02; approximate context dominance"))
        if wins_b and not wins_a:
            dominance.append(dict(winner=b, loser=a, criterion="mean score +0.02; approximate context dominance"))
    chosen = []
    for s, d in itertools.product(SCENARIOS, DIFFICULTIES):
        cells = [cell(s.name, d, p) for p in configurations if p != "idle"]
        best = max(cells, key=lambda r: r["mean_score"])
        worst = min(cells, key=lambda r: r["mean_score"])
        chosen.append(dict(scenario=s.name, difficulty=d, best=best["policy"],
            best_mean_score=best["mean_score"], worst=worst["policy"],
            decision_score_span=round(best["mean_score"] - worst["mean_score"], 6),
            best_candidate_clear_rate=best["candidate_clear_rate"]))
    # A finite grid oracle is a calibration ceiling, never an available player.
    oracle = []
    grid = [(p, r, BUDGET-p-r) for p in range(1, BUDGET-1)
            for r in range(1, BUDGET-p) if BUDGET-p-r >= 1]
    for scenario, (difficulty, rate) in itertools.product(SCENARIOS, DIFFICULTIES.items()):
        experiments = []
        for alloc in grid:
            scores = [simulate(scenario, demands(scenario, seed, rate), alloc)["score"] for seed in range(16)]
            experiments.append((statistics.mean(scores), alloc))
        score, alloc = max(experiments)
        oracle.append(dict(scenario=scenario.name, difficulty=difficulty,
                           best_static_allocation=alloc, mean_score=round(score, 6),
                           seeds=16, grid_allocations=len(grid)))
    pareto = []
    for scenario, difficulty in itertools.product(SCENARIOS, DIFFICULTIES):
        cells = [cell(scenario.name, difficulty, p) for p in configurations]
        frontier = [a["policy"] for a in cells if not any(
            b["mean_coverage"] >= a["mean_coverage"] and
            b["mean_delivery"] >= a["mean_delivery"] and
            (b["mean_coverage"] > a["mean_coverage"] or b["mean_delivery"] > a["mean_delivery"])
            for b in cells)]
        pareto.append(dict(scenario=scenario.name, difficulty=difficulty,
                           coverage_delivery_frontier=frontier))
    universal = [p for p in configurations if all(p in r["coverage_delivery_frontier"] for r in pareto)]
    gaps = []
    for s in SCENARIOS:
        cells = [cell(s.name, "normal", p) for p in configurations if p != "idle"]
        gaps.append(dict(scenario=s.name,
            coverage_span=round(max(c["mean_coverage"] for c in cells)-min(c["mean_coverage"] for c in cells), 6),
            delivery_span=round(max(c["mean_delivery"] for c in cells)-min(c["mean_delivery"] for c in cells), 6)))
    idle_safe = all(row["coverage"] == 0 and row["delivery"] == 0 and row["score"] == 0
                    for row in rows if row["policy"] == "idle")
    assert idle_safe
    pacing = []
    # Same immutable workload/outcomes, authored deadline preserved. Slowing
    # compresses excess arrivals at the final tick rather than deleting demand.
    # This is an intentionally strict deadline test, not a canonical pace API.
    for scenario, (name, factor), (policy, allocation) in itertools.product(
            SCENARIOS, (("frontload", .6), ("original", 1.0), ("delay", 1.4)), ALLOCATIONS.items()):
        results = []
        for seed in range(16):
            jobs = demands(scenario, seed, DIFFICULTIES["normal"])
            shifted = [(min(HORIZON - 1, int(t * factor)), p, r, f) for t, p, r, f in jobs]
            results.append(simulate(scenario, shifted, allocation))
        pacing.append(dict(scenario=scenario.name, pacing=name, allocation=policy,
            immutable_job_count=True, seeds=16,
            mean_coverage=mean([r["coverage"] for r in results]),
            mean_delivery=mean([r["delivery"] for r in results]),
            mean_pending_deadline=mean([r["deadline_pending"] for r in results])))
    return dict(schema=1, authority="temporary implementation/validation evidence; advisory only",
        replay_command="python3 prototypes/bend-tower-defense/MechanicsStudy.py",
        environment=dict(python=platform.python_version(), platform=platform.platform()),
        source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        model=dict(tick_unit="abstract integer; not native wall time", horizon=HORIZON,
            stages="finite loss network: preparation, review, retained findings",
            budget=BUDGET, allocations=ALLOCATIONS,
            scenarios=[dataclasses.asdict(s) for s in SCENARIOS],
            difficulty_offered_rates=DIFFICULTIES, seed_count=len(SEEDS),
            score="0.5 completed-by-deadline/demanded + 0.5 collected-by-deadline/offered-findings",
            same_tick_order="collect, review completions, preparation completions, arrivals",
            no_queue=True, failures_modeled=False),
        run_count=len(rows), calibration_grid_run_count=len(SCENARIOS)*len(DIFFICULTIES)*len(grid)*16,
        pacing_run_count=len(pacing)*16,
        assertions="per-tick demand/finding conservation, capacity bounds, finite drain",
        preregistration=dict(recorded="before first study execution; no data tuning",
            criteria=__doc__.split("PREREGISTERED SELECTION CRITERIA")[1],
            coverage_delivery_pareto_metrics=True,
            candidate_clear_threshold=.75, threshold_status="proposed optional designer heuristic"),
        study_history=[
            dict(stage="before first execution", declaration="six scenario families, three offered rates, named allocations/gates/idle,64seeds; preregistered selection criteria recorded",
                 exploratory_search="55allocation grid on16seeds was already implemented; exploratory ceiling, not an acceptance criterion"),
            dict(stage="after first execution", amendment="exclude idle from reported competent-vs-weak decision spans; idle remains negative-control exploit check",
                 data_tuning="none; service durations, demand rates, budgets and thresholds unchanged"),
            dict(stage="after first execution", amendment="added72 pacing/allocation cells on16seeds with same jobs and fixed deadline",
                 status="postexecution exploratory extension; not preregistered evidence"),
            dict(stage="final clarification", amendment="document named-policy vs exhaustive search denominators and advisory classifications",
                 data_tuning="none")],
        comparison_scope=dict(named_policies="six active named policies plus idle negative control;64seeds; best_named_policy includes clear rates",
            static_grid="55positive integer allocations of12slots,16seeds; exploratory optimized mean ceiling, no reported clear rate",
            easy_burst="named balanced mean0.639,clear2%; grid3/6/3 mean0.778821; different policies and seed counts",
            easy_deadline="named review mean0.580; grid3/6/3 mean0.728058; different policies and seed counts",
            interpretation="Expanded action search can rescue the easy burst mean; does not prove high clear rate, human difficulty or teaching. Easy deadline remains below optional0.75mean threshold"),
        recommendations=[
            dict(classification="BORROW", component="scarce stage-resource allocation",
                 rationale="Context reversals and Pareto fronts support candidate choices; explain occupancy, immediate refusal and held output before upgrades",
                 boundary="Analytical model only; actual Bend runtime checks required"),
            dict(classification="BORROW", component="paced admission with immutable workload obligation",
                 rationale="Pacing and deadline jointly constrain throughput; outputhold can impose a bottleneck workers cannot fix",
                 boundary="Preserve total demand and count late/unattempted work as uncovered. Proposed Bend interval>=15bound is optimistic, not a validated winning strategy"),
            dict(classification="REJECT", component="naive current-occupancy gate as generally beneficial control",
                 rationale="Neither gate improves mean coverage in any18family/difficultycells; tiny mean delivery gains in3cells do not support a blanket improvement claim",
                 boundary="Reject this heuristic for this analytical workload; not a universal theorem against gating. Revisit with actual permit/queue costs or forecast-based bounded intervention"),
            dict(classification="REJECT", component="idle or withholding-demand victory",
                 rationale="Immutable-demand denominator gives idle coverage/delivery0; unlimited waiting must not erase obligations",
                 boundary="Dynamic worker churn/retasking is not modeled and needs separate Bend checks"),
            dict(classification="BORROW", component="exploratory balanced easy-wave calibration",
                 rationale="Use generous steady wave for onboarding; burst needs finer allocation options or lighter demand before a novice challenge",
                 boundary="Namedpolicy versus grid means have different seeds and do not establish human enjoyment")],
        selection_checks=dict(universal_pareto_frontier_members=universal,
            normal_difficulty_policy_gaps=gaps,
            idle_exploit_rejected=idle_safe,
            churn="NOT APPLICABLE to static allocation model; actual live Bend retasking requires separate validation"),
        pacing_and_allocation=pacing,
        pacing_scope="Fixed offered jobs; frontload0.6/original1.0/delay1.4 arrival times; excess shifted demand arrives at final deadline tick, never disappears",
        pareto_frontiers=pareto,
        bend_fixture_advisory=dict(source="FlowModel.bend Stage/Config/Job/State inspected; numeric fixture supplied by canonical_experiments, not yet executed in this study",
            provided=dict(capture_service=6, review_service=24, advice_service=18,
                output_service=6, output_hold=80, output_resource_cap=4,
                finding_visit_fraction="2/3", initial_arrival_interval=12),
            recurrence="work_i[t+1]=work_i[t]+entered_i-left_i; held output consumes resources after service",
            necessary_load_condition="lambda * visit_fraction_i < mu_i for every stage; finite admission/refusal may stabilize occupancy by discarding offered work, not satisfy coverage",
            output_optimistic_max_rate=4/86,
            minimum_edit_interval_continuous=(2/3)*86/4,
            inference="At interval12, offered finding load exceeds optimistic output resource throughput even with arbitrarily many workers; retention is a bottleneck. Finite deadlines/refusals and initial empty state require actual Bend execution",
            mismatches="Python model has three loss stages, slot allocation, periodic collection; Bend candidate has four stages, queues/backpressure, workers and postservice retention. Not a parity test"),
        evidence_scope="Python analytical model executed; no canonical conformance, human engagement or teaching validation",
        references=[dict(url="https://web.mit.edu/urban_or_book/www/book/chapter4/4.1.html",
            source_class="DOC", verification_state="DOCUMENTED", accessed="2026-09-30",
            proposition="Queue models simplify reality; explicit assumptions bound interpretation")],
        summary=summary, best_named_policy=chosen, context_reversals=reversals,
        approximate_dominance=dominance, static_grid_calibration=oracle,
        raw_runs=dict(columns=list(rows[0]), values=[list(r.values()) for r in rows]),
        engagement=dict(status="UNKNOWN", proxies="decision score span, context reversal and visible change are candidate design diagnostics, not enjoyment",
            next="Counterbalanced human challenge/spectator playtest; causal predictions, voluntary replay, frustration and enjoyment; no engagement claim from bots"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("mechanics-results.json"))
    args = parser.parse_args()
    result = run()
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Analytical runs: {result['run_count']}; all accounting/drain assertions passed")
    print(f"Context-reversing policy pairs: {len(result['context_reversals'])}")
    for item in result["best_named_policy"]:
        print(f"{item['scenario']:18} {item['difficulty']:6} {item['best']:14} score={item['best_mean_score']:.3f} span={item['decision_score_span']:.3f} clear={item['best_candidate_clear_rate']:.2f}")
    print(f"Retained evidence: {args.output}")
    print("Human engagement and teaching effectiveness: UNKNOWN")


if __name__ == "__main__":
    main()
