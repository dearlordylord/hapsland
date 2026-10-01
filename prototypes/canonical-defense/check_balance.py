#!/usr/bin/env python3
"""Validate recorded native balance traces and regenerate balance-summary.json.

Uses Python's standard library only. Run this file from any directory; --check
validates an existing summary without writing. Checks deliberately use explicit
exceptions so python -O cannot disable validation. This analyzes recorded facts;
it does not execute Bend or establish human engagement or universal probability.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import re
import statistics
import sys
from pathlib import Path


class ValidationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


KEY_FIELDS = ("map", "profile", "plan", "offset")
BALANCE_FIELDS = set(KEY_FIELDS) | {
    "towers", "cost", "hp", "clear", "delivered", "ticks", "peakBytes",
    "peakPressure", "hotTicks", "peakPending", "active", "owned",
}
CAMPAIGN_FIELDS = {"plan", "wave", "hp", "clear", "delivered", "status", "owned"}
METRICS = (
    "hp", "clear", "delivered", "ticks", "peakBytes", "peakPressure",
    "hotTicks", "peakPending",
)
# Intended successful construction, including the level-two upgrade cost.
PLANS = {
    0: ("No towers", 0, 0),
    1: ("Refiner level one", 1, 55),
    2: ("Refiner level two", 1, 95),
    3: ("Packager level one", 1, 60),
    4: ("Rapid", 1, 35),
    5: ("Refiner level one + Packager level one", 2, 115),
    6: ("Packager level two", 1, 100),
    7: ("Refiner level one + Rapid", 2, 90),
    8: ("Parallelizer", 1, 70),
    9: ("Coordinator", 1, 35),
    10: ("Shield", 1, 50),
    11: ("Relay", 1, 45),
}
OFFSETS = (0, 25, 50, 75)
PAIRED_KEYS = set(itertools.product(range(3), (0,), range(6), OFFSETS))
EXTRA_KEYS = (
    set(itertools.product(range(3), (0,), range(6, 12), OFFSETS[:2]))
    | set(itertools.product((0,), (3,), range(7), OFFSETS))
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_trace(path: Path) -> tuple[list[dict], list[dict], dict]:
    raw = path.read_bytes()
    balance, campaigns = [], []
    for line_number, line in enumerate(raw.decode("utf-8").splitlines(), 1):
        require(bool(line.strip()), f"{path.name}:{line_number}: blank record")
        tag, *tokens = line.split()
        require(tag in ("BALANCE", "CAMPAIGN"), f"{path.name}:{line_number}: unknown tag {tag}")
        fields = {}
        for token in tokens:
            match = re.fullmatch(r"([A-Za-z][A-Za-z0-9]*)=(\d+)", token)
            require(match is not None, f"{path.name}:{line_number}: malformed field {token}")
            name, value = match.groups()
            require(name not in fields, f"{path.name}:{line_number}: repeated field {name}")
            fields[name] = int(value)
            require(fields[name] < 2**32, f"{path.name}:{line_number}: field exceeds U32")
        expected = BALANCE_FIELDS if tag == "BALANCE" else CAMPAIGN_FIELDS
        require(set(fields) == expected, f"{path.name}:{line_number}: fields differ from {tag} schema")
        (balance if tag == "BALANCE" else campaigns).append(fields)
    return balance, campaigns, {
        "file": path.name,
        "sha256": digest(raw),
        "records": len(balance) + len(campaigns),
        "single_waves": len(balance),
        "campaigns": len(campaigns),
    }


def index_rows(rows: list[dict], label: str) -> dict[tuple, dict]:
    result = {}
    for row in rows:
        key = tuple(row[field] for field in KEY_FIELDS)
        require(key not in result, f"{label}: duplicate paired key {key}")
        result[key] = row
    return result


def validate_waves(rows: list[dict], label: str) -> None:
    for row in rows:
        key = tuple(row[field] for field in KEY_FIELDS)
        require(row["plan"] in PLANS, f"{label} {key}: unknown single-wave plan")
        name, towers, cost = PLANS[row["plan"]]
        require(row["towers"] == towers and row["cost"] == cost,
                f"{label} {key}: {name} requires towers={towers}, cost={cost}; "
                f"recorded towers={row['towers']}, cost={row['cost']}")
        require(0 <= row["hp"] <= 100, f"{label} {key}: HP outside initial bounds")
        require(row["clear"] + row["delivered"] == 16, f"{label} {key}: not sixteen outcomes")
        require(row["active"] == 0 and row["owned"] == 0, f"{label} {key}: wave did not drain")
        require(0 < row["ticks"] <= 12000, f"{label} {key}: invalid bounded duration")
        require(row["hotTicks"] <= row["ticks"], f"{label} {key}: hot ticks exceed total ticks")
        require(row["peakPending"] <= 16, f"{label} {key}: pending exceeds offered outcomes")
        require(row["peakPressure"] <= row["peakBytes"] <= 480,
                f"{label} {key}: pressure or ledger peak exceeds ledger bounds")


def stats(values: list[int]) -> dict:
    require(bool(values), "cannot summarize an empty cohort")
    return {"mean": round(statistics.mean(values), 6), "min": min(values), "max": max(values)}


def summarize(rows: list[dict]) -> dict:
    return {"samples": len(rows), "metrics": {field: stats([r[field] for r in rows]) for field in METRICS}}


def cohorts(index: dict[tuple, dict]) -> list[dict]:
    groups = {}
    for (layout, profile, plan, _), row in sorted(index.items()):
        groups.setdefault((layout, profile, plan), []).append(row)
    return [
        {"map": layout, "profile": profile, "plan": plan,
         "offsets": [r["offset"] for r in rows], **summarize(rows)}
        for (layout, profile, plan), rows in sorted(groups.items())
    ]


def compare(left: list[dict], right: list[dict], pairing: tuple[str, ...]) -> dict:
    """Report right minus left; matching fields deliberately exclude treatment."""
    left_index = {tuple(r[f] for f in pairing): r for r in left}
    right_index = {tuple(r[f] for f in pairing): r for r in right}
    require(len(left_index) == len(left) and len(right_index) == len(right), "comparison has duplicate keys")
    require(set(left_index) == set(right_index), "comparison cohorts are not identically paired")
    differences = [
        {field: right_index[key][field] - left_index[key][field] for field in METRICS}
        for key in sorted(left_index)
    ]
    return {
        "paired_samples": len(differences),
        "pairing_fields": list(pairing),
        "left": summarize(left),
        "right": summarize(right),
        "delta_right_minus_left": summarize(differences)["metrics"],
    }


def select(index: dict[tuple, dict], *, plan: int, profile: int = 0, layout: int | None = None) -> list[dict]:
    return [r for (m, p, n, _), r in sorted(index.items())
            if n == plan and p == profile and (layout is None or m == layout)]


def campaign_evidence(directory: Path, campaigns: list[dict]) -> dict:
    require(len(campaigns) == 3 and {r["plan"] for r in campaigns} == {1, 2, 12},
            "extra: expected exactly campaign plans 1, 2, 12")
    for row in campaigns:
        require(1 <= row["wave"] <= 6, "campaign wave outside finite campaign")
        require(row["hp"] == 0 and row["status"] == 3 and row["owned"] == 0,
                "recorded comparison campaign must be a settled defeat")
        require(row["clear"] + row["delivered"] == 16 * row["wave"],
                "campaign outcomes differ from actual completed wave demand")
    source = directory / "DefenseAutoTests.bend"
    validation = directory / "validation-balance-features.txt"
    source_raw, validation_raw = source.read_bytes(), validation.read_bytes()
    source_text, validation_text = source_raw.decode(), validation_raw.decode()
    # These source fixtures and explicit native PASS lines establish a distinct
    # viable strategy. They do not supply a missing numerical campaign trace.
    for snippet in ("H.build(H.initial(),424,232,1)", "H.build(upgraded,328,232,1)",
                    "U32.is_eq(M.wave(done),6)", "U32.is_eq(M.gold(done),130)"):
        require(snippet in source_text, f"campaign fixture changed: {snippet}")
    required_passes = (
        "PASS shared Session automatic defended campaign drains six actual rounds",
        "PASS automatic waves retain manual tower levels and award exactly twenty gold per completed survived wave",
        "PASS campaign settles ninety-six actual review outcomes with at most twenty-four real reservations",
        "PASS every observed actual delivery counter remains within the real four-reservation budget",
        "PASS repeated and stacked prevention cannot eliminate every finding risk",
        "PASS upgrades reach the same prevention floor faster",
    )
    for line in required_passes:
        require(line in validation_text.splitlines(), f"aggregate validation missing: {line}")
    require(not any(line.startswith("FAIL ") for line in validation_text.splitlines()),
            "aggregate validation records a failure")
    return {
        "recorded_comparison_campaigns": sorted(campaigns, key=lambda r: r["plan"]),
        "distinct_viable_fixture": {
            "source": source.name,
            "source_sha256": digest(source_raw),
            "validation": validation.name,
            "validation_sha256": digest(validation_raw),
            "manual_plan": "map 0: Refiner at (424,232), upgraded to level two; Refiner at (328,232), level one",
            "initial_cost": 150,
            "native_assertions_passed": {
                "survived_waves": 6, "outcomes": 96, "tower_count": 2,
                "sum_tower_levels": 3, "gold_after_rewards": 130,
                "maximum_total_reservations": 24, "maximum_per_round_reservations": 4,
            },
            "final_hp_numeric_trace": None,
            "scope": "Passed aggregate assertions for one authored strategy; no numerical HP sample or universal winning-strategy claim.",
        },
    }


def analyze(directory: Path) -> dict:
    before, before_campaigns, before_input = read_trace(directory / "balance-before.txt")
    final, final_campaigns, final_input = read_trace(directory / "balance-final.txt")
    extra, campaigns, extra_input = read_trace(directory / "balance-extra.txt")
    require((len(before), len(final), len(extra), len(campaigns)) == (72, 72, 64, 3),
            "expected record counts 72 / 72 / 67 (extra: 64 single waves + 3 campaigns)")
    require(not before_campaigns and not final_campaigns, "paired files must contain only single waves")
    before_index = index_rows(before, "before")
    final_index = index_rows(final, "final")
    extra_index = index_rows(extra, "extra")
    require(set(before_index) == set(final_index) == PAIRED_KEYS, "before/final paired key grid differs")
    require(set(extra_index) == EXTRA_KEYS, "extra key grid differs from declared scenarios")
    for label, rows in (("before", before), ("final", final), ("extra", extra)):
        validate_waves(rows, label)
    require(not (set(final_index) & set(extra_index)), "final and extra unexpectedly overlap")
    current = {**final_index, **extra_index}

    refiner_one, refiner_two = select(current, plan=1), select(current, plan=2)
    require(all(r["clear"] == 16 and r["delivered"] == 0
                for r in select(before_index, plan=1) + select(before_index, plan=2)),
            "before trace no longer establishes the Refiner all-clear issue")
    require(all(0 < r["clear"] < 16 and r["delivered"] > 0 for r in refiner_one + refiner_two),
            "final Refiner samples must retain actual findings")
    upgrade = compare(refiner_one, refiner_two, ("map", "profile", "offset"))
    require(upgrade["delta_right_minus_left"]["hp"]["mean"] > 0 and
            upgrade["delta_right_minus_left"]["clear"]["mean"] > 0,
            "Refiner level two has no measured average HP and clear benefit")

    paired_changes = [
        {"plan": plan, **compare(select(before_index, plan=plan), select(final_index, plan=plan), KEY_FIELDS)}
        for plan in range(6)
    ]
    heavy_comparisons = {}
    for label, left_plan, right_plan in (
        ("packager_one_vs_none", 0, 3), ("packager_two_vs_none", 0, 6),
        ("packager_two_vs_one", 3, 6), ("refiner_packager_vs_refiner", 1, 5),
    ):
        left = select(current, plan=left_plan, profile=3, layout=0)
        right = select(current, plan=right_plan, profile=3, layout=0)
        require(all((a["clear"], a["delivered"]) == (b["clear"], b["delivered"])
                    for a, b in zip(left, right)), f"{label}: outcomes differ; latency comparison is confounded")
        result = compare(left, right, ("map", "profile", "offset"))
        require(result["delta_right_minus_left"]["ticks"]["max"] < 0,
                f"{label}: not consistently faster in recorded heavy-ACK cases")
        heavy_comparisons[label] = result
    profile_deltas = []
    for plan in range(7):
        normal = select(current, plan=plan, layout=0)
        heavy = select(current, plan=plan, profile=3, layout=0)
        available_offsets = {r["offset"] for r in normal}
        heavy = [r for r in heavy if r["offset"] in available_offsets]
        profile_deltas.append({"plan": plan, **compare(normal, heavy, ("map", "plan", "offset"))})

    return {
        "purpose": "Reproducible validation and descriptive analysis of recorded canonical-defense balance traces.",
        "status": "Generated validation evidence.",
        "authority": "Implementation and measured simulation evidence; not an accepted product contract or human study.",
        "regenerate": "python3 prototypes/canonical-defense/check_balance.py",
        "verify": "python3 prototypes/canonical-defense/check_balance.py --check",
        "lifecycle": "Regenerate when any input trace, probe fixture, or aggregate validation evidence changes.",
        "inputs": [before_input, final_input, extra_input],
        "validation": {
            "paired_keys_identical": True, "paired_samples": 72,
            "single_waves_validated": 208, "all_single_wave_outcomes": 16,
            "all_single_waves_inactive": True, "all_reported_owned_ledger_bytes_zero": True,
            "intended_plan_tower_counts_and_costs_valid": True,
            "construction_exceptions_allowed": False,
            "tick_duration_ms": 20,
        },
        "plans": [{"plan": p, "name": name, "towers": towers, "cost": cost}
                  for p, (name, towers, cost) in PLANS.items()],
        "before_cohorts": cohorts(before_index),
        "final_cohorts": cohorts(current),
        "paired_final_minus_before": paired_changes,
        "refiner_level_two_minus_one_baseline": upgrade,
        "heavy_acknowledgement": {
            "map": 0, "profile": 3, "baseline_ack_ticks": 40, "heavy_ack_ticks": 200,
            "comparisons": heavy_comparisons,
            "heavy_minus_normal_matched_offsets": profile_deltas,
            "scope": "Heavy-ACK comparisons cover map 0 only. Normal Packager level two has two recorded offsets; its normal/heavy pairing uses only those offsets.",
        },
        "campaign_evidence": campaign_evidence(directory, campaigns),
        "limitations": [
            "Offsets 0,25,50,75 deterministically rotate the authored review draw. They are not independent random trials; no confidence interval or universal probability is established.",
            "The recorded grid samples three authored maps, fixed placements, one finite sixteen-outcome wave, and selected campaign strategies. It does not rank every strategy or establish general optimality.",
            "Extra ordinary-profile plans have two offsets, paired plans have four, and heavy ACK is sampled on map 0 only. Cohort sample sizes are explicit.",
            "The owned trace field reports ledger bytes, not separate dispatch, request, lease, or writer counts. The aggregate campaign assertions independently require the host ownership drain predicate.",
            "The analyzer checks recorded outputs and source/evidence hashes; it does not rerun Bend or certify that traces were produced by the latest unrecorded source snapshot.",
            "There was no human playtest or engagement measurement, and these descriptive results establish no release or platform-support claim.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path, help="default: DIRECTORY/balance-summary.json")
    parser.add_argument("--check", action="store_true", help="require the existing summary to match without writing")
    args = parser.parse_args()
    output = args.output or args.directory / "balance-summary.json"
    try:
        summary = analyze(args.directory)
        encoded = json.dumps(summary, indent=2, sort_keys=True) + "\n"
        if args.check:
            require(output.read_text() == encoded, "summary differs; regenerate with check_balance.py")
        else:
            output.write_text(encoded)
    except (ValidationError, OSError, UnicodeError) as error:
        print(f"BALANCE VALIDATION FAILED: {error}", file=sys.stderr)
        return 1
    upgrade = summary["refiner_level_two_minus_one_baseline"]["delta_right_minus_left"]
    heavy = summary["heavy_acknowledgement"]["comparisons"]
    print("BALANCE VALIDATION PASS: records 72/72/67; 208 single waves; paired keys, outcomes, drains and intended construction checked")
    print(f"Refiner L2-L1: mean HP {upgrade['hp']['mean']:+g}, clear {upgrade['clear']['mean']:+g}")
    print(f"Heavy ACK Packager L1/none: {heavy['packager_one_vs_none']['delta_right_minus_left']['ticks']['mean']:+g} ticks; "
          f"L2/none: {heavy['packager_two_vs_none']['delta_right_minus_left']['ticks']['mean']:+g} ticks")
    print(f"{'Verified' if args.check else 'Wrote'} {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
