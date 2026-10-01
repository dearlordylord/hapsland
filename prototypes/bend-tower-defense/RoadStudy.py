#!/usr/bin/env python3
"""Analytical road/building mechanics study, NOT native gameplay or parity test.

Run: python3 prototypes/bend-tower-defense/RoadStudy.py
Same immutable demand and per-job work facts across all compared policies.
Safe approach and dangerous arrival are predicates of the SAME queued packet's
position; no duplicate road queue is introduced. Stage occupancy conservation:
Q_i(t+1)=Q_i(t)+entered_i(t)-departed_i(t). Global conservation:
offered=finished+dropped+len(jobs). All external obligations count at deadline.
Danger area A=sum_t N_arrived_unresolved(t); damage=floor(A/120), with
separate drops. Road travel T=L/v delays danger AND service, cannot erase work.

Proposed preregistered checks before first execution:
- conservation and hot<=occupancy every tick; no idle/wait victory;
- placement outside all ranges has zero service benefit;
- longer roads reduce danger only at a possible cost in finish/deadline;
- faster upstream may cause downstream congestion under finite resource caps;
- compare coverage, danger, drops, capital and occupancy separately;
- fixed budgets and at least two different contextual frontier loadouts;
- buffer-only cannot be called useful unless obligations still finish.

All numeric parameters/archetypes are advisory hypotheses. Buffer archetype is
an exploratory candidate, not an assertion that native Bend implements it.
The existing FlowModel is richer/different; no queue-policy authority transfers.
Primary methodology context (DOC/DOCUMENTED, accessed2026-09-30):
https://web.mit.edu/urban_or_book/www/book/chapter4/4.1.html
Its author explains approximation and explicit assumptions in queue models.
Human engagement, perceived challenge and teaching transfer remain UNKNOWN.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
import platform
import random
import statistics
from pathlib import Path


SITES = ((100, 160), (280, 160), (280, 340))
CAPS = (16, 8, 4)
BASE_WORK = (14, 24, 10)
OUTPUT_HOLD = 40
JOB_DEADLINE = 360
WAVE_DEADLINE = 900
GOLD = 120
DEMAND = 36
SEEDS = range(32)


@dataclasses.dataclass(frozen=True)
class Building:
    x: int
    y: int
    kind: str

    @property
    def specification(self):
        return {"fast": (40, 70, 2, 0), "wide": (55, 135, 1, 0),
                "buffer": (30, 100, 0, 40)}[self.kind]


LOADOUTS = {
    "baseline": (),
    "distributed-fast": tuple(Building(x, y, "fast") for x, y in SITES),
    "upstream-fast": (Building(100, 100, "fast"), Building(100, 160, "fast"), Building(100, 220, "fast")),
    "downstream-fast": (Building(220, 340, "fast"), Building(280, 340, "fast"), Building(340, 340, "fast")),
    "shared-wide": (Building(190, 160, "wide"), Building(280, 250, "wide")),
    "buffers": tuple(Building(x, y, "buffer") for x, y in SITES),
    "mixed": (Building(280, 160, "fast"), Building(280, 340, "fast"), Building(100, 160, "buffer")),
    "out-of-range": (Building(480, 40, "fast"), Building(480, 80, "fast"), Building(480, 120, "fast")),
}
FAMILIES = {
    "steady": dict(pace=12, road=40, speed=1, burst=False, work=BASE_WORK),
    "burst": dict(pace=12, road=40, speed=1, burst=True, work=BASE_WORK),
    "fast-demand": dict(pace=6, road=40, speed=1, burst=False, work=BASE_WORK),
    "review-heavy": dict(pace=12, road=40, speed=1, burst=False, work=(8, 45, 8)),
    "output-heavy": dict(pace=12, road=40, speed=1, burst=False, work=(8, 12, 30)),
    "long-roads": dict(pace=12, road=105, speed=1, burst=False, work=BASE_WORK),
    "fast-travel": dict(pace=12, road=40, speed=2, burst=False, work=BASE_WORK),
}


def distance(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])


def fixture(seed, family):
    rng = random.Random(seed)
    jobs = []
    for i in range(DEMAND):
        if family["burst"]:
            arrival = (i // 6) * (family["pace"] * 6) + i % 6
        else:
            arrival = i * family["pace"]
        # Jitter is precomputed, independent of control decisions.
        work = tuple(max(1, w + rng.randrange(-2, 3)) for w in family["work"])
        jobs.append(dict(id=i, arrival=arrival, work=work, finding=(i+1)%3 != 0))
    return jobs


def simulate(seed, family, loadout, wait_forever=False):
    towers = LOADOUTS[loadout]
    spent = sum(b.specification[0] for b in towers)
    assert spent <= GOLD
    rates, lengths = [], []
    for site in SITES:
        covered = [b for b in towers if distance(site, (b.x, b.y)) <= b.specification[1]]
        rates.append(1 + sum(b.specification[2] for b in covered))
        lengths.append(family["road"] + sum(b.specification[3] for b in covered))
    facts = fixture(seed, family)
    jobs = []
    finished = dropped = offered = 0
    congestion_drops = deadline_drops = 0
    danger_area = 0
    occupancy_area = [0, 0, 0]
    stage_danger = [0, 0, 0]
    downstream_blocked_area = [0, 0, 0]
    max_hot = [0, 0, 0]
    max_occupancy = [0, 0, 0]
    entered = [0, 0, 0]
    departed = [0, 0, 0]
    visible_transitions = 0
    for tick in range(WAVE_DEADLINE):
        # Read positional predicate from each same-queue job. No separate
        # safe/unsafe ownership state; progress is fixed on stage admission.
        before = (finished, dropped, tuple((j["id"], j["stage"], j["distance"] >= lengths[j["stage"]]) for j in jobs))
        survivors = []
        for job in jobs:
            if tick-job["born"] >= JOB_DEADLINE:
                dropped += 1
                deadline_drops += 1
                departed[job["stage"]] += 1
            else:
                survivors.append(job)
        jobs = survivors
        for stage in reversed(range(3)):
            current = [j for j in jobs if j["stage"] == stage]
            for job in current:
                job["distance"] = min(lengths[stage], job["distance"] + family["speed"])
            hot = [j for j in current if j["distance"] >= lengths[stage]]
            danger_area += len(hot)
            stage_danger[stage] += len(hot)
            occupancy_area[stage] += len(current)
            max_hot[stage] = max(max_hot[stage], len(hot))
            max_occupancy[stage] = max(max_occupancy[stage], len(current))
            assert len(hot) <= len(current) <= CAPS[stage]
            # Fixed aggregate work rate. Oldest-arrived-first; downstream
            # completion and admission commitments persist across future ticks.
            work_budget = 0 if wait_forever else rates[stage]
            for job in hot:
                if job["remaining"] > 0:
                    spent_work = min(work_budget, job["remaining"])
                    job["remaining"] -= spent_work
                    work_budget -= spent_work
                if job["remaining"] > 0:
                    continue
                if stage == 2:
                    job["hold"] += 1
                    if job["hold"] < OUTPUT_HOLD:
                        continue
                target = stage+1 if stage == 0 or stage == 1 and job["finding"] else 3
                if target == 3:
                    jobs.remove(job)
                    finished += 1
                    departed[stage] += 1
                elif sum(j["stage"] == target for j in jobs) < CAPS[target]:
                    departed[stage] += 1
                    entered[target] += 1
                    job.update(stage=target, distance=0, remaining=job["work"][target], hold=0)
                elif target == 1:
                    # Illustrative immediate review refusal (no hidden queue).
                    jobs.remove(job)
                    dropped += 1
                    congestion_drops += 1
                    departed[stage] += 1
                else:
                    downstream_blocked_area[stage] += 1
        for fact in facts:
            if fact["arrival"] != tick:
                continue
            offered += 1
            if sum(j["stage"] == 0 for j in jobs) == CAPS[0]:
                dropped += 1
                congestion_drops += 1
            else:
                jobs.append(dict(fact, born=tick, stage=0, distance=0,
                                 remaining=fact["work"][0], hold=0))
                entered[0] += 1
        assert offered == finished + dropped + len(jobs)
        assert all(entered[i]-departed[i] == sum(j["stage"] == i for j in jobs) for i in range(3))
        after = (finished, dropped, tuple((j["id"], j["stage"], j["distance"] >= lengths[j["stage"]]) for j in jobs))
        visible_transitions += before != after
    unoffered = DEMAND-offered
    deadline_unfinished = len(jobs) + unoffered
    # Deadline closes remaining obligations as uncovered, never uncounted.
    assert DEMAND == finished + dropped + deadline_unfinished
    return dict(finished=finished, dropped=dropped, unfinished=deadline_unfinished,
        coverage=finished/DEMAND, danger_area=danger_area,
        recurring_damage=danger_area//120, separate_drop_damage=dropped,
        total_damage=danger_area//120 + dropped,
        congestion_drops=congestion_drops, deadline_drops=deadline_drops,
        capital=spent, service_rates=rates, road_lengths=lengths,
        travel_ticks=[math.ceil(length/family["speed"]) for length in lengths],
        stage_danger=stage_danger, downstream_blocked_area=downstream_blocked_area,
        max_hot=max_hot, max_occupancy=max_occupancy,
        stage_entered=entered, stage_departed=departed,
        mean_occupancy=[area/WAVE_DEADLINE for area in occupancy_area],
        visible_transition_ticks=visible_transitions)


def run():
    rows = [dict(family=name, loadout=loadout, seed=seed, **simulate(seed, family, loadout))
            for name, family in FAMILIES.items() for loadout in LOADOUTS for seed in SEEDS]
    summary = []
    for family in FAMILIES:
        for loadout in LOADOUTS:
            group = [r for r in rows if r["family"] == family and r["loadout"] == loadout]
            summary.append(dict(family=family, loadout=loadout, seeds=len(group),
                **{f"mean_{k}": round(statistics.mean(r[k] for r in group),6)
                   for k in ("coverage", "danger_area", "total_damage", "congestion_drops", "deadline_drops", "capital")}))
    def cell(family, loadout):
        return next(r for r in summary if r["family"] == family and r["loadout"] == loadout)
    outside_exact = all(simulate(s, f, "baseline") | {"capital": 120} == simulate(s, f, "out-of-range")
                        for f in FAMILIES.values() for s in SEEDS)
    # Only cost differs. The equivalence is a real check of range accounting.
    assert outside_exact
    idle = simulate(0, FAMILIES["steady"], "baseline", wait_forever=True)
    assert idle["coverage"] == 0 and idle["unfinished"] + idle["dropped"] == DEMAND
    frontiers = []
    for family in FAMILIES:
        cells = [cell(family, loadout) for loadout in LOADOUTS]
        nondominated = [a["loadout"] for a in cells if not any(
            b["mean_coverage"] >= a["mean_coverage"] and
            b["mean_total_damage"] <= a["mean_total_damage"] and
            b["mean_capital"] <= a["mean_capital"] and
            (b["mean_coverage"] > a["mean_coverage"] or b["mean_total_damage"] < a["mean_total_damage"] or b["mean_capital"] < a["mean_capital"])
            for b in cells)]
        frontiers.append(dict(family=family, coverage_damage_capital_frontier=nondominated))
    paired_deltas = []
    for loadout in LOADOUTS:
        a,b=cell("steady",loadout),cell("long-roads",loadout)
        paired_deltas.append(dict(loadout=loadout,
            longer_road_coverage_delta=round(b["mean_coverage"]-a["mean_coverage"],6),
            longer_road_danger_delta=round(b["mean_danger_area"]-a["mean_danger_area"],6)))
    return dict(schema=1, authority="temporary analytical validation evidence; proposed game mechanics only",
        command="python3 prototypes/bend-tower-defense/RoadStudy.py",
        environment=dict(python=platform.python_version(),platform=platform.platform()),
        source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        scope="Independent analytical model; no native Bend parity or Hapsland conformance claim",
        study_history=[dict(stage="before first execution", declaration="sevenfamilies/eightloadouts/32seeds; fixed geometry,work,caps,budget,deadlines and assertion checks"),
            dict(stage="after first execution", amendment="Received native RoadModel/Scenario fourstage constants and perpacket naturalservice; added separate analytic bounds and mismatches without tuning original study")],
        preregistration=__doc__.split("Proposed preregistered")[1].split("All numeric")[0],
        model=dict(sites=SITES, resource_caps=CAPS, base_work=BASE_WORK,
            output_hold=OUTPUT_HOLD, job_deadline=JOB_DEADLINE,
            wave_deadline=WAVE_DEADLINE, immutable_demand=DEMAND, capital_budget=GOLD,
            archetypes={k:Building(0,0,k).specification for k in ("fast","wide","buffer")},
            archetype_fields=["cost","range","service_rate_boost","safe_road_extension"],
            damage="floor(sum arrived unresolved per tick/120) + dropped jobs",
            commitments="existing stage progress persists; fixed loadouts do not mutate inflight route or service facts",
            throughput="necessary sustained lambda*visit_i < effective_mu_i; output resource bound cap/(travel+service+hold) because inflight road occupies same-stage resources",
            finite_bound="long roads can stabilize danger by expiry; that is discarded coverage, not successful processing",
            partial_holding_tick="completion tick counts as first held tick in this analytical model, distinct from native future-tick convention"),
        scenario_families=FAMILIES,loadouts={k:[dataclasses.asdict(b) for b in v] for k,v in LOADOUTS.items()},
        run_count=len(rows),summary=summary,pareto_frontiers=frontiers,
        longer_roads_paired=paired_deltas,
        checks=dict(conservation="passed all ticks", capacity_and_hot_predicate="passed all ticks",
            out_of_range_zero_benefit=outside_exact, idle_does_not_win=True,
            damage_and_service_separate_from_capital=True),
        native_fixture_comparison=dict(source="RoadModel.bend/RoadScenario.bend inspected; processor proposals supplied by canonical_experiments; numeric runtime behavior not exercised here",
            verification="SOURCE-INSPECTED geometry/config; INFERRED analytic lower bounds; not RUNTIME-TESTED native game",
            sites=[(144,152),(400,152),(400,344),(144,344)],
            lengths=[112,224,160,224],speeds=[4,4,4,4],travel_ticks=[28,56,40,56],
            inside_slots=[6,3,4,3],safe_road_cap_each=12,natural_work=[24,60,30,20],
            natural_service="onework perinsidepacket pertick, parallel; analytical study instead uses aggregate perstage workbudget",
            hold80=True,pressure_every=120,lives=220,pace=18,waves=6,
            demand_total=sum(24+6*i for i in range(6)),finding_fraction="2/3",
            unavoidable_hold_damage_if_all_delivered=sum(24+6*i for i in range(6))*2/3*80/120,
            no_tower_processing_danger_estimate=(sum(24+6*i for i in range(6))*(24+60)+sum(24+6*i for i in range(6))*2/3*(30+20))/120,
            output_natural_optimistic_capacity=3/(20+80),
            output_offered_rate_at_pace18=(2/3)/18,
            necessary_natural_pace_strictly_greater_than=(2/3)*(20+80)/3,
            even_zero_processing_time_pace_strictly_greater_than=(2/3)*80/3,
            caveat="Finite waves can survive transient overload; hold/resource bounds are necessary sustained throughput estimates, not predicted win/loss or exact tick parity",
            omitted="Actual turret cooldown/targeting/levels/placement and native road-slot admission; no native campaign simulation in this study",
            discrepancy="Independent three-stage aggregate-service model has shared stagecap for safe/hot jobs and inventedbuffer archetype; native has fourstages, separate road/inside caps, parallel naturalservice and rapid/batch/relay processors"),
        recommendations=[
            dict(classification="BORROW",component="finite saferoad slack plus recurring arrived-job damage",
                evidence="Same demand longroads lowerdanger but drastically reduce finishedcoverage; immutable deadline prevents waitvictory",
                boundary="Arrivaldanger must follow actual positional boundary; withholding admission at arrived front must not silently shield danger"),
            dict(classification="BORROW",component="range placement and opportunity cost",
                evidence="Outofrange exactsame service outcomes asbaseline despite120cost; distributed/shared coverage choices give distinct damage/coveragefrontiers",
                boundary="Native range/cooldown laws differ; validate native loadouts independently"),
            dict(classification="REJECT",component="upstreamspeed as automatic improvement",
                evidence="Upstreamonlyfast steadymodel coverage0.650 versusdistributed1.000 withsamecapital; finite downstreamcaps dominate",
                boundary="Analytical contextspecific counterexample, not theorem that upstream upgrades are never useful"),
            dict(classification="REJECT",component="bufferonly as winning strategy or endless harmless waiting",
                evidence="Bufferssteadymodel coverage0.301 anddamage59.7 versusdistributed1.000/damage17; deadline must countallwork",
                boundary="Buffer archetype unimplemented candidate; do not add based on this negative result"),
            dict(classification="BORROW",component="native onboarding load and outputhold explanation",
                evidence="Pace18 findingload0.0370 exceeds optimistic native unassistedoutputcapacity0.0300; holdalone imposes104damage over234offers if alldelivered",
                advisory="Try pace24–28 firstwave for generous onboarding, pace18 later forpressure; show held output slots separately from processing effort. HP220 leaves116for processing/backlog/refusals after unavoidablehold, not220 discretionary slack",
                boundary="Proposed calibration, not tuned or nativeverified; levels/campaignrevenues/finiteburst behavior require actualcore runs")],
        raw_runs=rows,
        engagement="UNKNOWN; decision consequences and mathematical challenge are not enjoyment/learning evidence",
        references=[dict(url="https://web.mit.edu/urban_or_book/www/book/chapter4/4.1.html",
                         source_class="DOC",verification_state="DOCUMENTED",accessed="2026-09-30")])


if __name__ == "__main__":
    result=run()
    output=Path(__file__).with_name("road-mechanics-results.json")
    output.write_text(json.dumps(result,indent=2)+"\n")
    print(f"Road analytical runs:{result['run_count']}; assertions passed")
    for row in result["summary"]:
        if row["loadout"] in ("distributed-fast","shared-wide","buffers","upstream-fast"):
            print(f"{row['family']:14} {row['loadout']:18} coverage={row['mean_coverage']:.3f} danger={row['mean_danger_area']:.0f} damage={row['mean_total_damage']:.1f} cost={row['mean_capital']:.0f}")
    print(f"Evidence:{output}; human engagement UNKNOWN")
