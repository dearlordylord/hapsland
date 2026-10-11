"""Freeze authored inputs and qualify bounded paired production measurements."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("lane", choices=["build", "execution"])
parser.add_argument("--baseline", required=True, type=Path)
parser.add_argument("--environment", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
baseline = args.baseline.resolve()
env = os.environ.copy()
if args.environment:
    for key, value in json.loads(args.environment.read_text()).items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
env.update(HAPSLAND_PERFORMANCE_BASELINE_ROOT=str(baseline), HAPSLAND_PERFORMANCE_CANDIDATE_ROOT=str(root))

def git(checkout, *options):
    return subprocess.check_output(["git", *options], cwd=checkout)

def sources(checkout):
    # Include untracked authored inputs; an unchanged working diff alone omits them.
    names = set(git(checkout, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0"))
    digest = hashlib.sha256()
    for name in sorted(names - {b""}):
        path = checkout / os.fsdecode(name)
        digest.update(name + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest() if path.is_file() else b"deleted")
    return digest.hexdigest()

def artifacts():
    result = {}
    for checkout in [baseline, root]:
        for package in sorted((checkout / "packages").iterdir()):
            for directory in [package / "dist", package / "artifacts/native"]:
                if not directory.is_dir():
                    continue
                for path in sorted(directory.rglob("*")):
                    if path.is_file() and path.suffix in [".js", ".mjs", ".cjs", ".node"]:
                        result[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result

worker = root / "packages/source-analysis/src/direct-event/analysis-checks/reference-isolated-worker.mjs"
if args.lane == "execution":
    with tempfile.TemporaryDirectory(prefix="hapsland-current-analyzer-preflight-") as temporary:
        golden = str(Path(temporary) / "golden.json")
        bun = str(root / "node_modules/bun/bin/bun.exe")
        for checkout, mode in [(baseline, "prepare"), (root, "measure")]:
            checked = subprocess.run(["taskset", "-c", "11", bun, str(worker), str(checkout), mode, golden], cwd=root, env=env, capture_output=True, text=True, timeout=20)
            print(json.dumps({"preflightRoot": str(checkout), "exitCode": checked.returncode, "output": checked.stdout, "error": checked.stderr}), flush=True)
            if checked.returncode:
                raise SystemExit(checked.returncode)

heads = {str(p): git(p, "rev-parse", "HEAD").decode().strip() for p in [baseline, root]}
frozen_sources = {str(p): sources(p) for p in [baseline, root]}
frozen_artifacts = artifacts()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
output = root / ".test-runs/bend-migration/performance" / started.replace(":", "-")
output.mkdir(parents=True)
measurement_path = output / "measurement.json"
env["HAPSLAND_PERFORMANCE_OUTPUT"] = str(measurement_path)
runner = root / ("scripts/performance/build-performance.mjs" if args.lane == "build" else "packages/source-analysis/src/direct-event/analysis-checks/reference-isolated-performance.mjs")
deadline = 610 if args.lane == "build" else 190
with (output / "run.log").open("w") as log:
    result = subprocess.run(["timeout", "--signal=KILL", str(deadline) + "s", "node", str(runner)], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
measurement = json.loads(measurement_path.read_text()) if measurement_path.exists() else None
heads_unchanged = all(git(Path(p), "rev-parse", "HEAD").decode().strip() == value for p, value in heads.items())
sources_unchanged = all(sources(Path(p)) == value for p, value in frozen_sources.items())
artifacts_unchanged = artifacts() == frozen_artifacts
complete = measurement is not None and all(len(measurement.get("samples", {}).get(lane, [])) == 17 for lane in ["typescript", "integratedBend"])
qualified = result.returncode == 0 and heads_unchanged and sources_unchanged and artifacts_unchanged and complete
parity = qualified and bool(measurement.get(args.lane + "Parity"))
record = {"startedAt": started, "terminalAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "lane": args.lane, "deadlineSeconds": deadline, "exitCode": result.returncode, "qualified": qualified, "parity": parity, "roots": heads, "headsUnchanged": heads_unchanged, "sourcesUnchanged": sources_unchanged, "sourceHashes": frozen_sources, "artifactTreesUnchanged": artifacts_unchanged, "artifactHashes": frozen_artifacts, "scope": "existing production after master integration and source relocation; not unadopted whole preparation", "measurement": measurement}
(output / "qualification.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"evidence": str(output / "qualification.json"), "exitCode": result.returncode, "qualified": qualified, "parity": parity, "ratio": measurement.get("meanRatio") if measurement else None}), flush=True)
raise SystemExit(0 if parity else 1)
