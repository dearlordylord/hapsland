#!/usr/bin/env python3
"""Offline structural/readiness checks for an unapproved #138 proposal; no live mode."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
PLAN = HERE / "live-plan-proposal.json"
CORPUS = HERE / "manifest.json"
PACK = HERE / "proposed-type-rule-pack-v2.json"
RENDERER = REPO / "src/direct-event/v2-renderer.ts"
WIRE = REPO / "evidence/issue-138-wire/type-candidate.json"
SEED = "hapsland-138-type-proposal-2026-09-29-seed-1"
ARMS = ("candidate", "focusedDiff", "wholeFile", "v1Type")
BASE_ARMS = ARMS[:3]
REPETITIONS = (1, 2, 3)
APPROVALS = ("corpusLabels", "rulePack", "rendererWire", "sourceEgress", "studyBudget", "hostProfile")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest_bytes(data):
    return sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def anchored(path):
    return {"path": path.relative_to(REPO).as_posix(), "sha256": digest_bytes(path.read_bytes())}


def repo_file(relative):
    require(isinstance(relative, str) and relative and not relative.startswith("/"), "non-relative fixture path")
    path = (HERE / relative).resolve()
    require(path.is_relative_to(HERE), "fixture escaped proposal corpus")
    return path


def renderer_identity():
    source = RENDERER.read_text(encoding="utf-8")
    version = re.search(r'CANDIDATE_RENDERER_VERSION\s*=\s*"([^"]+)"', source)
    payload = re.search(r'CANDIDATE_RENDERER_DIGEST\s*=\s*sha256\(\s*"([^"]+)"', source)
    require(version is not None and payload is not None, "renderer identity declaration missing")
    return {"version": version.group(1), "digest": digest_bytes(payload.group(1).encode("utf-8"))}


def source_case(case):
    require(case["branch"] == "type-shape/v2", f"wrong branch: {case['id']}")
    require(case["expectedCompleteness"] == "complete-candidate", f"incomplete case: {case['id']}")
    require(case["labelStatus"] == "proposed-unverified", f"missing label status: {case['id']}")
    require(case["expectedBand"] in (">0.70", "<0.30"), f"missing band: {case['id']}")
    require(case["rule"]["id"] == "r2_meaningless_combinations" and
            case["rule"]["contract"] == "direct-event/type-shape/v2", f"wrong rule: {case['id']}")
    comparators = case["comparators"]
    require(set(comparators) == set(ARMS) and all(comparators[a] is True for a in BASE_ARMS),
            f"missing base arm: {case['id']}")
    hashes = []
    for source in case["sources"]:
        path = repo_file(source["path"])
        data = path.read_bytes()
        require(len(data) == source["bytes"] and digest_bytes(data) == source["sha256"],
                f"source hash mismatch: {case['id']} {source['path']}")
        data.decode("utf-8")
        hashes.append({"path": source["path"], "sha256": source["sha256"], "bytes": source["bytes"]})
    require(len(hashes) == len({item["path"] for item in hashes}), f"duplicate source: {case['id']}")
    return {"id": case["id"], "category": case["category"], "expectedBand": case["expectedBand"],
            "labelStatus": case["labelStatus"], "selectedRoot": case["selectedRoot"],
            "fixtureHashes": hashes, "patchSha256": digest_bytes(case["event"]["patch"].encode("utf-8")),
            "applicableArms": [a for a in ARMS if comparators[a]],
            "inapplicableArms": [a for a in ARMS if not comparators[a]]}


def expected_slots(cases):
    tuples = [(case["id"], arm, repetition) for case in cases
              for arm in case["applicableArms"] for repetition in REPETITIONS]
    ordered = sorted(tuples, key=lambda item: (digest_bytes(
        f"{SEED}|{item[0]}|{item[1]}|{item[2]}".encode("utf-8")), item))
    return [{"order": index, "caseId": case_id, "arm": arm, "repetition": repetition}
            for index, (case_id, arm, repetition) in enumerate(ordered, 1)]


def structural(plan):
    require(set(plan) == {"schemaVersion", "phase", "status", "declaredOn", "branch", "scope", "recordPolicy",
                          "seed", "orderAlgorithm", "anchors", "budget", "approvals", "thresholds",
                          "metrics", "cases", "slots"}, "unexpected or missing plan fields")
    manifest = load(CORPUS)
    pack = load(PACK)
    require(manifest["status"] == "proposal-unapproved-no-live-egress", "corpus status changed")
    original = manifest["cases"]
    cases = [source_case(case) for case in original if case["branch"] == "type-shape/v2"]
    require(len(cases) == 12 and [case["id"] for case in cases] == [f"T{i:02d}" for i in range(1, 13)],
            "expected exactly T01-T12")
    require(sum("v1Type" in case["applicableArms"] for case in cases) == 9, "v1 must apply to 9 cases")
    require(pack["schemaVersion"] == 2 and pack["id"] == "noul-type-v2-proposal" and
            pack["contentVersion"] == "0.0.0-proposal.1" and len(pack["rules"]) == 1,
            "proposed pack identity changed")
    rule = pack["rules"][0]
    require(rule["id"] == "r2_meaningless_combinations" and rule["threshold"] == 0.7 and
            rule["reviewTargets"] == [{"artifactKind": "typeShape",
            "inputContract": "direct-event/type-shape/v2",
            "capabilities": ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]}],
            "proposed rule target changed")
    pack_digest = digest_bytes(canonical(pack).encode("utf-8"))
    definition_digest = digest_bytes(canonical({"packId": pack["id"], "packVersion": pack["contentVersion"],
                                                "rule": rule}).encode("utf-8"))
    wire = load(WIRE)
    require(wire["providerInput"]["inputContract"]["id"] == "direct-event/type-shape/v2",
            "wire example contract changed")
    require(wire["providerInput"]["inputContract"]["rendererDigest"] == renderer_identity()["digest"],
            "wire example renderer mismatch")
    expected_anchors = {"corpus": anchored(CORPUS), "pack": anchored(PACK), "wireExample": anchored(WIRE),
                        "packContentDigest": pack_digest, "ruleDefinitionDigest": definition_digest,
                        "renderer": renderer_identity()}
    require(plan["schemaVersion"] == 1 and plan["phase"] == "pre-execution-declaration" and
            plan["status"] == "proposal-unapproved-no-live", "plan identity/status changed")
    require(plan["declaredOn"] == "2026-09-29" and plan["branch"] == "type-shape/v2", "declaration changed")
    require(plan["scope"] == "12 proposed T cases, same rule/backend/batch per paired arm; synthetic fixtures only",
            "scope changed")
    require(plan["recordPolicy"] == "This is a pre-execution declaration. Owner decisions, amendments, and outcomes belong in separately dated successor artifacts; do not rewrite this declaration.",
            "record policy changed")
    require(plan["seed"] == SEED and plan["orderAlgorithm"] == "sha256(seed|caseId|arm|repetition)-ascending",
            "ordering changed")
    require(plan["anchors"] == expected_anchors, "immutable source/pack/wire anchor mismatch")
    require(plan["cases"] == cases, "case label/hash/arm declaration mismatch")
    slots = expected_slots(cases)
    require(plan["slots"] == slots, "slot list/order differs from declared seed")
    require(len(slots) == len(set((s["caseId"], s["arm"], s["repetition"]) for s in slots)) == 135,
            "slot count or uniqueness mismatch")
    counts = Counter(slot["arm"] for slot in slots)
    require(counts == Counter({"candidate": 36, "focusedDiff": 36, "wholeFile": 36, "v1Type": 27}),
            "arm count mismatch")
    require(plan["budget"] == {"maximumCalls": 135, "automaticRetries": 0,
                               "repetitionsPerApplicableArm": 3, "armSlots": dict(counts)},
            "budget declaration mismatch")
    require(plan["approvals"] == {name: "pending-owner-decision" for name in APPROVALS},
            "proposal approval fields overwritten; record decisions in a successor artifact")
    require(plan["thresholds"] == {"status": "pending-owner-decision", "semantic": None,
                                   "safety": None, "timing": None}, "proposal thresholds overwritten")
    require(plan["metrics"] == [
        {"name": "semantic-band-hit", "denominator": "complete labelled case-arm-repetition",
         "measure": "probability >0.70 on positive or <0.30 on clear negative, per declared case band"},
        {"name": "paired-superiority", "denominator": "same-case same-repetition candidate/comparator pair",
         "measure": "candidate band hit versus focusedDiff, wholeFile, and applicable v1Type; report by category"},
        {"name": "false-advice", "denominator": "clear-negative case-arm-repetition",
         "measure": "probability strictly above authored rule threshold 0.7"},
        {"name": "availability", "denominator": "declared slot",
         "measure": "response, timeout, error, and unavailable counts by arm"},
        {"name": "timing-ms", "denominator": "declared slot",
         "measure": "extraction, render, backend, and end-to-end p50/p95 and maximum separately"},
        {"name": "egress-bytes", "denominator": "declared slot",
         "measure": "encoded request bytes, distinct source paths, and source-byte totals by arm"},
    ], "metrics declaration mismatch")
    require("outcomes" not in plan and "execution" not in plan and "credentials" not in plan,
            "pre-execution declaration contains runtime material")
    return cases, slots


def eligible(plan):
    structural(plan)
    blockers = [name for name, value in plan["approvals"].items() if value != "owner-approved"]
    if plan["thresholds"]["status"] != "owner-approved-frozen":
        blockers.append("thresholds")
    require(not blockers, "not eligible: " + ", ".join(blockers))
    # This script deliberately contains no Jev client, network path, or execution mode.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--check", action="store_true", help="validate proposal structure offline")
    modes.add_argument("--eligible", action="store_true", help="check owner approval/freeze gates offline")
    args = parser.parse_args()
    plan = load(PLAN)
    try:
        if args.eligible:
            eligible(plan)
            print("eligible for a separately authorized future runner")
        else:
            cases, slots = structural(plan)
            print(f"proposal structure valid: {len(cases)} type cases, {len(slots)} slots, zero retries")
    except (ValueError, KeyError, TypeError, UnicodeError) as error:
        print(f"proposal validation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
