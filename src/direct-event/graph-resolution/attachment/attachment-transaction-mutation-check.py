"""Check the complete current attachment instance and an isolated phase mutant."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "packages/source-analysis/src/direct-event/graph-resolution"
ENTRY = SOURCE / "attachment/AttachmentTransactionLiteralCuts.bend"
LAW = SOURCE / "attachment/ATTACHMENT_TRANSACTION_LAWS.bend"
RESULTS = ROOT / ".test-runs/bend-migration/attachment-transaction"
RESULTS.mkdir(parents=True, exist_ok=True)
closure = set()

def collect(path):
    path = path.resolve()
    if path in closure:
        return
    path.relative_to(ROOT)
    closure.add(path)
    for dependency in re.findall(r"^import\s+(\S+\.bend)(?:\s+as\s+\S+)?\s*$", path.read_text(), re.M):
        collect(path.parent / dependency)

collect(ENTRY)
law_source = LAW.read_text()
instance = ENTRY.read_text()
if "  Contract.conclusion(" not in law_source or "def original_existential_instance() -> Contract.conclusion(" not in instance:
    raise RuntimeError("Complete instance no longer instantiates the current transaction conclusion")
for name in ["actual_ready_instance", "reference_ready_instance", "budget_instance"] + [f"literal_claim_{i}" for i in range(1, 10)]:
    if f"def {name}()" not in instance:
        raise RuntimeError("Complete current instance lost " + name)
before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in closure}
record = {"passed": False, "cases": 0,
          "law": "attachment_transaction_exact",
          "lawHash": hashlib.sha256(LAW.read_bytes()).hexdigest(),
          "instanceHash": before[ENTRY],
          "scope": "One complete current-law instance and a current Attach phase mutant; not universal proof"}

def check(path, name):
    try:
        result = subprocess.run(["taskset", "-c", "10", "bend", str(path), "--verdict"],
                                capture_output=True, text=True, timeout=5)
        output = result.stdout + result.stderr
        (RESULTS / (name + ".log")).write_text(output)
        return result.returncode, output
    except subprocess.TimeoutExpired as error:
        output = (error.stdout or b"") + (error.stderr or b"")
        (RESULTS / (name + ".log")).write_bytes(output)
        return "timeout", ""

with tempfile.TemporaryDirectory(prefix="current-closure-", dir=RESULTS) as directory:
    isolated = Path(directory)
    for path in closure:
        target = isolated / path.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    entry = isolated / ENTRY.relative_to(ROOT)
    code, output = check(entry, "control")
    record["controlExit"] = code
    if code == 0 and "ALL PROOFS CHECK" in output:
        actual = isolated / (SOURCE / "Attach.bend").relative_to(ROOT)
        source = actual.read_text()
        selected = "              T.MeasuringCandidateTree{},"
        if source.count(selected) != 1:
            raise RuntimeError("Current named attachment phase mutation moved")
        actual.write_text(source.replace(selected, "              T.CheckingIterationDeadline{},"))
        code, output = check(actual, "mutant-source")
        record["mutantSourceExit"] = code
        record["mutation"] = "attachment measurement resumes in the wrong phase"
        if code == 0 and "ALL PROOFS CHECK" in output:
            code, output = check(entry, "mutant")
            record["mutantExit"] = code
            record["passed"] = code == 1 and "Location: literal_claim_1" in output and "expected" in output
            record["cases"] = 1 if record["passed"] else 0
record["sourcesUnchanged"] = all(hashlib.sha256(p.read_bytes()).hexdigest() == value for p, value in before.items())
record["passed"] = record["passed"] and record["sourcesUnchanged"]
(RESULTS / "qualification.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record))
raise SystemExit(0 if record["passed"] else 1)
