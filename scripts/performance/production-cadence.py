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
parser.add_argument("lane", choices=["build", "execution", "preparation"])
parser.add_argument("--baseline", required=True, type=Path)
parser.add_argument("--environment", type=Path)
parser.add_argument("--baseline-environment", type=Path)
parser.add_argument("--preparation-reference", choices=["fixed-baseline", "current-native"], default="fixed-baseline")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
baseline = args.baseline.resolve()
if args.preparation_reference == "current-native" and (args.lane != "preparation" or baseline != root):
    parser.error("current-native is supplemental preparation only; --baseline must name the current checkout")
if args.baseline_environment and args.lane != "build":
    parser.error("--baseline-environment is supported only for build")
environment_inputs = {}
def environment_overrides(path):
    content = path.read_bytes()
    values = json.loads(content)
    if not isinstance(values, dict) or any(not isinstance(key, str) or (value is not None and not isinstance(value, str)) for key, value in values.items()):
        raise ValueError("Environment overrides must map names to strings or null")
    environment_inputs[str(path.resolve())] = hashlib.sha256(content).hexdigest()
    return values

env = os.environ.copy()
if args.environment:
    for key, value in environment_overrides(args.environment).items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
if args.baseline_environment:
    env["HAPSLAND_PERFORMANCE_BASELINE_ENV"] = json.dumps(environment_overrides(args.baseline_environment))
else:
    env.pop("HAPSLAND_PERFORMANCE_BASELINE_ENV", None)
env.update(HAPSLAND_PERFORMANCE_BASELINE_ROOT=str(baseline), HAPSLAND_PERFORMANCE_CANDIDATE_ROOT=str(root), HAPSLAND_PREPARATION_REFERENCE=args.preparation_reference)

def git(checkout, *options):
    return subprocess.check_output(["git", *options], cwd=checkout)

def workspace_resolutions(checkout):
    resolved = {}
    manifest = json.loads((checkout / "package.json").read_text())
    for pattern in manifest["workspaces"]:
        for directory in sorted(checkout.glob(pattern)):
            declaration = directory / "package.json"
            if not declaration.is_file():
                continue
            name = json.loads(declaration.read_text())["name"]
            actual = (checkout / "node_modules" / name).resolve()
            expected = directory.resolve()
            if actual != expected:
                raise RuntimeError(f"Workspace dependency escapes measurement checkout: {checkout}: {name}: {actual} != {expected}")
            resolved[name] = str(actual)
    if not resolved:
        raise RuntimeError(f"No installed workspace dependencies verified: {checkout}")
    return resolved

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
                    if path.is_file() and (path.suffix in [".js", ".mjs", ".cjs", ".node"] or path.name == ".bend-receipt.json"):
                        result[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result

frozen_workspaces = {str(p): workspace_resolutions(p) for p in [baseline, root]}
print(json.dumps({"workspacePreflight": {path: len(packages) for path, packages in frozen_workspaces.items()}}), flush=True)

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
runner = root / {"build": "scripts/performance/build-performance.mjs", "execution": "packages/source-analysis/src/direct-event/analysis-checks/reference-isolated-performance.mjs", "preparation": "scripts/performance/preparation-performance.mjs"}[args.lane]
deadline = 610 if args.lane == "build" else 190
with (output / "run.log").open("w") as log:
    result = subprocess.run(["timeout", "--signal=KILL", str(deadline) + "s", "node", str(runner)], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
measurement = json.loads(measurement_path.read_text()) if measurement_path.exists() else None
heads_unchanged = all(git(Path(p), "rev-parse", "HEAD").decode().strip() == value for p, value in heads.items())
sources_unchanged = all(sources(Path(p)) == value for p, value in frozen_sources.items())
artifacts_unchanged = artifacts() == frozen_artifacts
workspaces_unchanged = all(workspace_resolutions(Path(p)) == value for p, value in frozen_workspaces.items())
complete = measurement is not None and all(len(measurement.get("samples", {}).get(lane, [])) == 17 for lane in ["typescript", "integratedBend"])
environments_unchanged = all(hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest for path, digest in environment_inputs.items())
qualified = environments_unchanged and result.returncode == 0 and heads_unchanged and sources_unchanged and artifacts_unchanged and workspaces_unchanged and complete
parity = qualified and bool(measurement.get(args.lane + "Parity"))
ratio_limit = 3 if args.lane == "preparation" else 1
performance_accepted = qualified and isinstance(measurement.get("meanRatio"), (int, float)) and measurement["meanRatio"] <= ratio_limit
record = {"environmentFileHashes": environment_inputs, "environmentFilesUnchanged": environments_unchanged, "startedAt": started, "terminalAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "lane": args.lane, "deadlineSeconds": deadline, "exitCode": result.returncode, "qualified": qualified, "parity": parity, "performanceAccepted": performance_accepted, "acceptanceRatioLimit": ratio_limit, "roots": heads, "headsUnchanged": heads_unchanged, "sourcesUnchanged": sources_unchanged, "sourceHashes": frozen_sources, "workspaceResolutions": frozen_workspaces, "workspaceResolutionsUnchanged": workspaces_unchanged, "artifactTreesUnchanged": artifacts_unchanged, "artifactHashes": frozen_artifacts, "scope": "supplemental current-native whole preparation" if args.lane == "preparation" and args.preparation_reference == "current-native" else "compiled public preparation against fixed baseline" if args.lane == "preparation" else "existing production analyzer/build; whole preparation measured separately", "measurement": measurement}
(output / "qualification.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"evidence": str(output / "qualification.json"), "exitCode": result.returncode, "qualified": qualified, "parity": parity, "performanceAccepted": performance_accepted, "acceptanceRatioLimit": ratio_limit, "preparationReference": args.preparation_reference if args.lane == "preparation" else None, "ratio": measurement.get("meanRatio") if measurement else None}), flush=True)
raise SystemExit(0 if performance_accepted else 1)
