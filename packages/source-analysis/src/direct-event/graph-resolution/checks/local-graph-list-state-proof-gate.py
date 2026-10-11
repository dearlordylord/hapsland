from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import subprocess
import time

root = Path(__file__).resolve().parent
owner = root / 'local-graph-representation-prototypes/list-state'
samples = []
for entry, scope in [
    ('NUMERIC_SPEC_ROOT_RANK_PROOF.bend', 'exact original initial_rank_within_original_bound at3R+3 for arbitrary raw catalogs and seen roots, with8 approved partition/lookup/count transports; adequate-rank completion remains unproved'),
    ('NUMERIC_SPEC_MEMBERSHIP_PROOF.bend', 'complete independent recursive interpreter visited preservation at any fuel including partial failures, with all39 approved state/reference/child/sibling transports; completion and full observation equivalence remain unproved'),
    ('NUMERIC_SPEC_INVENTORY_PROOF.bend', 'all three canonical whole-interpreter unseen inventory transports over arbitrary raw declaration catalogs; full adequate-rank completion remains unproved'),
    ('TREE_MACHINE_TERMINAL_PROOF.bend', 'one of five exact continuation laws: full terminal finish matches independent stack observation, without shape assumptions; full step/run/initial simulation and independent suffix completion remain unproved'),
    ('TREE_MACHINE_COMPLETION_PROOF.bend', 'one of three exact whole numeric graph laws: production completion lifted from existing full-machine termination; equality and independent recursive/flatten completion remain unproved'),
    ('PATRICIA_BIT_PROOF.bend', 'one of eight exact Patricia laws: complete key-preserving routing through actual BaseMap.bit, with three transport support laws; first-split arithmetic and structural update/lookup laws remain unproved'),
    ('PROOF.bend', 'six canonical dictionary laws and twelve update support laws'),
    ('MACHINE_PROOF.bend', 'nine canonical machine component laws including full reference dispatch'),
    ('RANK_PROOF.bend', 'seven canonical whole-machine termination laws including step, run and plan'),
    ('REGISTRY_PROOF.bend', 'all fourteen exact canonical registry laws and thirty-five supporting registry laws'),
    ('BOUNDARY_CONSTRUCTION_PROOF.bend', 'seven of nine exact boundary laws plus five supporting laws: whole construction coverage and direct ID/key/composite correspondence; two structural roundtrip laws remain unproved'),
    ('MAP_HISTORY_INVARIANT_PROOF.bend', 'one of seven generic Map-history laws plus one numeric fold invariant support; six exact structural/cardinality/lookup laws remain unproved'),
]:
    start = time.monotonic()
    result = subprocess.run(['timeout', '5s', 'bend', str(owner / entry), '--verdict'], capture_output=True, text=True)
    output = result.stdout + result.stderr
    (root / ('local-graph-list-state-' + entry.removesuffix('.bend') + '-gate.log')).write_text(output)
    passed = result.returncode == 0 and 'ALL PROOFS CHECK' in output
    sample = {'entry': entry, 'scope': scope, 'passed': passed, 'exitCode': result.returncode,
              'seconds': time.monotonic() - start, 'deadlineSeconds': 5,
              'sha256': hashlib.sha256((owner / entry).read_bytes()).hexdigest()}
    samples.append(sample)
    assert passed, (entry, output)
record = {
    'at': datetime.now(timezone.utc).isoformat(), 'passed': True, 'entries': samples,
    'sourceHashes': {name: hashlib.sha256((owner / name).read_bytes()).hexdigest() for name in
                     ['core.bend', 'Own.bend', 'LAWS.bend', 'RANK.bend', 'RANK_LAWS.bend',
                      'RANK_MACHINE.bend', 'RANK_MACHINE_LAWS.bend', 'RANK_DISPATCH_LAWS.bend',
                      'RANK_GROWTH_LAWS.bend', 'RANK_STEP_LAWS.bend', 'RANK_RUN_LAWS.bend', 'RANK_PLAN_LAWS.bend',
                      'REGISTRY_RELATION.bend', 'REGISTRY_LAWS.bend', 'REGISTRY_SUPPORT_LAWS.bend',
                      'REGISTRY_APPEND_LAWS.bend', 'REGISTRY_INTERN_LAWS.bend', 'REGISTRY_UNIQUE_LAWS.bend', 'REGISTRY_COMPLETION_LAWS.bend', 'BOUNDARY_ENCODING.bend', 'BOUNDARY_ENCODING_LAWS.bend', 'BOUNDARY_SUPPORT_LAWS.bend', 'MAP_HISTORY_RELATION.bend', 'MAP_HISTORY_LAWS.bend', 'MAP_HISTORY_SUPPORT_LAWS.bend', 'PATRICIA_RELATION.bend', 'PATRICIA_LAWS.bend', 'PATRICIA_BIT_SUPPORT_LAWS.bend', 'NUMERIC_SPEC.bend', 'TREE_MACHINE_RELATION.bend', 'TREE_MACHINE_LAWS.bend', 'TREE_MACHINE_SUPPORT_LAWS.bend', 'TREE_MACHINE_CONTINUATION.bend', 'TREE_MACHINE_CONTINUATION_LAWS.bend', 'NUMERIC_SPEC_RANK.bend', 'NUMERIC_SPEC_RANK_LAWS.bend', 'NUMERIC_SPEC_MEMBERSHIP.bend', 'NUMERIC_SPEC_MEMBERSHIP_LAWS.bend', 'NUMERIC_SPEC_INVENTORY_LAWS.bend', 'NUMERIC_SPEC_ROOT_RANK.bend', 'NUMERIC_SPEC_ROOT_RANK_LAWS.bend', 'NUMERIC_SPEC_ROOT_PARTITION_LAWS.bend', 'NUMERIC_SPEC_ROOT_LOOKUP_LAWS.bend', 'NUMERIC_SPEC_COUNT_LAWS.bend']},
    'scope': 'complete finite raw list-state planner termination and dictionary support; all fourteen canonical registry laws and thirty-five supporting registry laws checked; seven of nine boundary laws plus five supports and one generic history invariant plus one fold support checked; one of eight Patricia laws plus three bit transport supports checked; one of three whole numeric graph observation laws checked; full independent interpreter visited-preservation with39transports and3whole raw catalog inventory transports checked; no structural whole boundary roundtrip, complete String/codec bridge, output equivalence, connected performance or production adoption qualification',
}
(root / 'local-graph-list-state-proof-gate.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'passed': True, 'entries': samples}))
