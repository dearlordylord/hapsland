"""Reject type-valid changes to public lifecycle IDs and refused prefixes."""
import json
from pathlib import Path
import subprocess

owner = Path(__file__).with_name("CanonicalResolverOwner.bend")
proof = Path(__file__).with_name("PUBLIC_PREPARATION_PROOF.bend")
original = owner.read_bytes()
source = original.decode()
start = source.index("def public_preparation_begin_started(")
end = source.index("def public_preparation_begin_observed(", start)
refusal = source[start:end]
mutants = [
    ("wrong-issued-observation", source.replace(
        "C.StartObservation{partition, lifetime, round, observation}",
        "C.StartObservation{partition, lifetime, round, Nat.add(observation, 1n)}", 1),
     "outputs_exact"),
    ("continue-after-refusal", source[:start] + refusal.replace(
        "case _: result <> Nil{}",
        "case Rejected{state, _}: result <> canonical_event(state, C.BeginObservedPreparation{partition, lifetime, round, observation, bytes}) <> Nil{}", 1)
     + source[end:], "started_exact"),
]

def check(path, option):
    return subprocess.run(["timeout", "--signal=KILL", "10s", "taskset", "-c", "11", "bend", str(path), option],
                          capture_output=True, text=True)

records = []
try:
    pristine = check(proof, "--verdict")
    if pristine.returncode != 0:
        raise RuntimeError("Pristine universal lifecycle proof failed: " + pristine.stdout + pristine.stderr)
    for name, changed, location in mutants:
        if changed == source:
            raise RuntimeError("Missing mutation anchor: " + name)
        owner.write_text(changed)
        typing = check(owner, "--check-only")
        if typing.returncode != 0:
            raise RuntimeError("Mutant is not type-valid: " + name + typing.stdout + typing.stderr)
        result = check(proof, "--verdict")
        output = result.stdout + result.stderr
        if result.returncode != 1 or "Location: " + location not in output:
            raise RuntimeError("Mutant did not fail its lifecycle proof section: " + name + output)
        records.append({"mutant": name, "typeValid": True, "rejected": True, "location": location})
        owner.write_bytes(original)
finally:
    owner.write_bytes(original)
if owner.read_bytes() != original:
    raise RuntimeError("Lifecycle owner source changed")
print(json.dumps({"passed": True, "cases": len(records) + 1, "pristineVerdict": True, "mutants": records, "sourcesUnchanged": True,
                  "scope": "universal public lifecycle sequence only; no whole preparation acceptance"}))
