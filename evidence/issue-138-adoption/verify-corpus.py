#!/usr/bin/env python3
"""Deterministic structural/hash check for the proposed #138 corpus; no Jev calls."""
from hashlib import sha256
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
SEMANTIC = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
OFFLINE = json.loads((ROOT / "offline-manifest.json").read_text(encoding="utf-8"))


def source_records(case):
    assert case["sources"], case["id"]
    for item in case["sources"]:
        path = (ROOT / item["path"]).resolve()
        assert path.is_relative_to(ROOT), case["id"]
        data = path.read_bytes()
        assert len(data) == item["bytes"], case["id"]
        assert sha256(data).hexdigest() == item["sha256"], case["id"]
        assert data.decode("utf-8").encode("utf-8") == data, case["id"]


def semantic_case(case):
    source_records(case)
    source = (ROOT / "cases" / case["id"] / "root.ts").read_text(encoding="utf-8")
    event = case["event"]
    assert event["tool"] == "Codex apply_patch"
    patch = event["patch"]
    assert patch.startswith("*** Begin Patch\n") and patch.endswith("*** End Patch\n")
    assert ("*** Add File: root.ts\n" in patch or "*** Update File: root.ts\n" in patch)
    assert len(patch.encode("utf-8")) <= 65536, case["id"]
    if event["kind"] == "Add":
        assert "*** Add File: root.ts\n" in patch
        added = [line[1:] for line in patch.splitlines()[2:-1]]
        assert all(line.startswith("+") for line in patch.splitlines()[2:-1])
        assert "\n".join(added) + "\n" == source, case["id"]
    else:
        assert event["kind"] == "Update" and event["confirmedSuccessRequired"] is True
        before = (ROOT / "cases" / case["id"] / "root.before.ts").read_text(encoding="utf-8")
        changed = [i for i, pair in enumerate(zip(before.splitlines(), source.splitlines()), 1)
                   if pair[0] != pair[1]]
        assert len(before.splitlines()) == len(source.splitlines()) and len(changed) == 1, case["id"]
        index = changed[0]
        assert f"@@ -{index},1 +{index},1 @@" in patch, case["id"]
        assert f"-{before.splitlines()[index - 1]}\n+{source.splitlines()[index - 1]}\n" in patch, case["id"]
        assert event["postEditSpan"] == {"startLine": index, "endLine": index}, case["id"]
        assert source.splitlines().count(source.splitlines()[index - 1]) == 1, case["id"]
    root = case["selectedRoot"]
    assert root["path"] == "root.ts"
    kind = {"interface": "interface", "type": "type-alias", "function": "function"}
    match = re.search(r"\b(?:export\s+)?(interface|type|function)\s+" +
                      re.escape(root["name"]) + r"\b", source)
    assert match and root["kind"] == kind[match.group(1)], case["id"]
    assert root["declarationStart"] == {
        "line": source.count("\n", 0, match.start()) + 1,
        "column": match.start() - source.rfind("\n", 0, match.start()),
    }, case["id"]
    assert case["rationale"] and case["rule"]["id"] and case["category"], case["id"]
    assert case["labelStatus"] in {"proposed-unverified", "withheld-not-ground-truth"}
    assert case["expectedBand"] in {"<0.30", ">0.70", None}
    if case["expectedBand"] is None:
        assert case["labelStatus"] == "withheld-not-ground-truth"
        assert case["expectedCompleteness"] != "complete-candidate"
        assert case["blocker"], case["id"]
    else:
        assert case["labelStatus"] == "proposed-unverified"
        assert case["expectedCompleteness"] == "complete-candidate"


assert SEMANTIC["schemaVersion"] == OFFLINE["schemaVersion"] == 1
assert SEMANTIC["status"] == "proposal-unapproved-no-live-egress"
assert len(SEMANTIC["cases"]) == len(OFFLINE["cases"]) == 24
assert len({case["id"] for case in SEMANTIC["cases"] + OFFLINE["cases"]}) == 48
assert sum(case["branch"] == "type-shape/v2" for case in SEMANTIC["cases"]) == 12
assert sum(case["branch"] == "function/v1" for case in SEMANTIC["cases"]) == 12
for case in SEMANTIC["cases"]:
    semantic_case(case)
for case in OFFLINE["cases"]:
    source_records(case)
    assert case["status"] == "proposed-offline-assertion-unverified"
    assert case["rationale"] and case["expected"] and case["event"]["kind"] in {"Add", "Update"}
    source = (ROOT / "offline" / case["id"] / "root.ts").read_text(encoding="utf-8")
    event = case["event"]
    patch = event["patch"]
    assert patch.startswith("*** Begin Patch\n") and patch.endswith("*** End Patch\n"), case["id"]
    assert len(patch.encode("utf-8")) <= 65536, case["id"]
    if event["kind"] == "Add":
        assert "*** Add File: root.ts\n" in patch, case["id"]
        assert "\n".join(line[1:] for line in patch.splitlines()[2:-1]) + "\n" == source, case["id"]
    else:
        assert event["confirmedSuccessRequired"] is True, case["id"]
        assert "*** Update File: root.ts\n" in patch, case["id"]
        before = (ROOT / "offline" / case["id"] / "root.before.ts").read_text(encoding="utf-8")
        if case["id"].endswith("09"):
            assert source.count("// marker") == 2 and before.count("// marker") == 1
            assert event["verifiedPostEditSpan"] is None, case["id"]
        else:
            assert case["id"].endswith("07") and source != before
            assert event["verifiedPostEditSpan"] is not None, case["id"]
print("verified 24 proposed semantic cases, 24 offline cases, all hashes and semantic patch shapes")
