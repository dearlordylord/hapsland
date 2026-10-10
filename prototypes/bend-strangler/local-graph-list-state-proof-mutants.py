from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent
owner = root / 'local-graph-representation-prototypes/list-state'
samples = []
mutations = [
    ('cached_size_exact', 'CACHE_PROOF.bend',
     'case DCon{_, _, _, count}: count', 'case DCon{_, _, _, count}: 0n'),
    ('lookup_after_insert_exact', 'LOOKUP_PROOF.bend',
     'case DNil{}: cons(V, key, value, DNil{})', 'case DNil{}: DNil{}'),
    ('other_lookup_preserved', 'OTHER_LOOKUP_PROOF.bend',
     'case True{}: cons(V, name, value, rest)', 'case True{}: cons(V, name, value, DNil{})'),
    ('insertion_membership_exact', 'MEMBERSHIP_PROOF.bend',
     'choose(Bool, Nat.is_eq(name, key), True{}, next => contains(V, rest, key))',
     'choose(Bool, Nat.is_eq(name, key), False{}, next => contains(V, rest, key))'),
    ('insertion_preserves_invariant', 'INVARIANT_PROOF.bend',
     'DCon{key, value, rest, (1n + size(V, rest) : Nat)}', 'DCon{key, value, rest, size(V, rest)}'),
    ('insertion_size_exact', 'SIZE_PROOF.bend',
     'case False{}: cons(V, name, previous, recurse(Unit{}))', 'case False{}: cons(V, name, previous, rest)'),
    ('unseen_insertion_nonincreasing', 'UNSEEN_PROOF.bend',
     'case True{}: cons(V, name, value, rest)', 'case True{}: cons(V, name, value, DNil{})'),
    ('unseen_declaration_bounded', 'INVENTORY_PROOF.bend',
     'case None{}: 0n', 'case None{}: 1n', 'RANK.bend'),
    ('unseen_insert_selected_zero', 'INVENTORY_PROOF.bend',
     'Own.choose(Nat, Core.has_identity(visited, identity), 0n,',
     'Own.choose(Nat, False{}, 0n,', 'RANK.bend'),
    ('selected_root_inventory_bound', 'ROOT_INVENTORY_PROOF.bend',
     'case Own.DCon{_, declaration, rest, _}: (declaration_reference_count(declaration) + trie_reference_count(',
     'case Own.DCon{_, declaration, rest, _}: (0n + trie_reference_count(', 'core.bend'),
    ('selected_child_inventory_decrease', 'CHILD_INVENTORY_PROOF.bend',
     'Own.choose(Nat, Core.has_identity(visited, identity), 0n,',
     'Own.choose(Nat, True{}, 0n,', 'RANK.bend'),
    ('initial_rank_bound', 'INITIAL_RANK_PROOF.bend',
     '(2n * trie_reference_count(declarations) + 2n : Nat)', '0n', 'core.bend'),
    ('reference_preserves_projection', 'MACHINE_BASE_PROOF.bend',
     'Machine{facts, path, frames, visited, budget, next, nodes, slot <> references, pending}',
     'Machine{facts, path, [], visited, budget, next, nodes, slot <> references, pending}', 'core.bend'),
    ('selected_expand_rank_bound', 'EXPAND_RANK_PROOF.bend',
     'Frame{next, depth, 0n, children} <> frames',
     'Frame{next, depth, 0n, children} <> Frame{next, depth, 0n, []} <> frames', 'core.bend'),
    ('nonterminal_rank_positive', 'POSITIVE_RANK_PROOF.bend',
     '(2n * unseen + 2n * pending_references(frames) + List.length(&2, Core.Frame, frames) : Nat)',
     '(2n * unseen + 2n * pending_references(frames) : Nat)', 'RANK.bend'),
    ('consuming_reference_rank_exact', 'CONSUMING_RANK_PROOF.bend',
     '(2n * unseen + 2n * pending_references(frames) + List.length(&2, Core.Frame, frames) : Nat)',
     '(2n * unseen + pending_references(frames) + List.length(&2, Core.Frame, frames) : Nat)', 'RANK.bend'),
    ('records_insert_exact', 'RECORDS_PROOF.bend',
     'case DNil{}: cons(V, key, value, DNil{})', 'case DNil{}: DNil{}'),
]
# Add a frame to each actual production output/budget operation independently.
# Every pristine canonical dependency closure must pass before the semantic mutant.
import re
core_source = (owner / 'core.bend').read_text()
frame_helper = """def mutant_add_frame(machine: Machine) -> Machine:
  match machine:
    case Machine{facts, path, frames, visited, budget, next, nodes, references, pending}:
      Machine{facts, path, Frame{0n, 0n, 0n, []} <> frames, visited, budget, next, nodes, references, pending}

"""
operation_names = ['observe_machine_depth', 'charge_machine_work', 'charge_machine_target', 'omit', 'include', 'queue_import', 'import_by_kind', 'import_present', 'charge_if_local', 'bundled_queue', 'bundled_materialize', 'bundled_budget', 'charge_if_visited', 'bundled_charged', 'bundled_seen', 'bundled_target', 'bundled_admit', 'bundled_lookup']
for operation in operation_names + ['visit_reference', 'process_frame']:
    block = re.search(r'^def ' + operation + r'\(.*?(?=^def |^type |\Z)', core_source, re.S | re.M).group(0)
    signature = re.search(r'^def ' + operation + r'\((.*?)\) -> Machine:', block, re.S).group(1)
    names = re.findall(r'(?:^|,)\s*\+?([a-z_]+)\s*:', signature)
    replacement = frame_helper + block.replace('def ' + operation + '(', 'def mutant_original_' + operation + '(', 1) + '\ndef ' + operation + '(' + signature + ') -> Machine:\n  mutant_add_frame(mutant_original_' + operation + '(' + ', '.join(names) + '))\n\n'
    if operation == 'visit_reference': law, proof = 'visit_reference_rank_bound', 'MACHINE_PROOF.bend'
    elif operation == 'process_frame': law, proof = 'step_decreases_rank', 'STEP_RANK_PROOF.bend'
    else: law, proof = operation + '_preserves_projection', 'DISPATCH_PROOF.bend'
    mutations.append((law, proof, block, replacement, 'core.bend'))
mutations.extend([
    ('projection_equal_rank', 'DISPATCH_PROOF.bend', 'List.length(&2, Core.Frame, frames)', '0n', 'RANK_MACHINE.bend'),
    ('run_completes_from_rank', 'RUN_RANK_PROOF.bend',
     'case True{}: CompletePlan{finish(machine)}\n    case False{}: InvariantFailure{machine}',
     'case True{}: InvariantFailure{machine}\n    case False{}: InvariantFailure{machine}', 'core.bend'),
    ('plan_completes', 'PLAN_RANK_PROOF.bend', 'case None{}: MissingRoot{visited, budget}',
     'case None{}: InvariantFailure{Machine{facts, path, [], visited, budget, 0n, [], [], []}}', 'core.bend'),
])
registry_source = (owner / 'REGISTRY_RELATION.bend').read_text()
first_match = re.search(r'^def find_step\(.*?(?=^def find\()', registry_source, re.M | re.S).group(0)
last_match = """def last_match(found: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case None{}: Some{0n}
    case Some{index}: Some{(1n + index : Nat)}

def find_step(equal: Bool, recurse: Unit -> Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match equal:
    case True{}: last_match(recurse(Unit{}))
    case False{}: increment(recurse(Unit{}))

"""
mutations.extend([
    ('selected_id_decodes', 'REGISTRY_DECODE_PROOF.bend', 'increment(find(names, name))', 'find(names, name)', 'REGISTRY_RELATION.bend'),
    ('shared_id_exact', 'REGISTRY_DECODE_PROOF.bend', 'increment(find(names, name))', 'Some{1n}', 'REGISTRY_RELATION.bend'),
    ('intern_existing_exact', 'REGISTRY_DECODE_PROOF.bend', 'case Some{identity}: (names, identity)', 'case Some{identity}: (names, (1n + identity : Nat))', 'REGISTRY_RELATION.bend'),
    ('extension_preserves_selected', 'REGISTRY_GROWTH_PROOF.bend', first_match, last_match, 'REGISTRY_RELATION.bend'),
    ('intern_decodes', 'REGISTRY_GROWTH_PROOF.bend', '(1n + List.length(&2, String, names) : Nat)', '0n', 'REGISTRY_RELATION.bend'),
    ('intern_encodes', 'REGISTRY_GROWTH_PROOF.bend', '(1n + List.length(&2, String, names) : Nat)', '0n', 'REGISTRY_RELATION.bend'),
    ('intern_preserves_selected', 'REGISTRY_GROWTH_PROOF.bend', 'List.append(&2, String, names, [name])', 'name <> names', 'REGISTRY_RELATION.bend'),
    ('collect_preserves_selected', 'REGISTRY_GROWTH_PROOF.bend', 'collect(rest, names_of(intern(names, head)))', 'collect(rest, head <> names)', 'REGISTRY_RELATION.bend'),
])
mutations.extend([
    ('intern_preserves_unique', 'REGISTRY_PROOF.bend', 'case Some{identity}: (names, identity)', 'case Some{identity}: (List.append(&2, String, names, [name]), identity)', 'REGISTRY_RELATION.bend'),
    ('collect_preserves_unique', 'REGISTRY_PROOF.bend', 'case Some{identity}: (names, identity)', 'case Some{identity}: (List.append(&2, String, names, [name]), identity)', 'REGISTRY_RELATION.bend'),
    ('constructed_registry_unique', 'REGISTRY_PROOF.bend', 'case Some{identity}: (names, identity)', 'case Some{identity}: (List.append(&2, String, names, [name]), identity)', 'REGISTRY_RELATION.bend'),
    ('decoded_id_encodes', 'REGISTRY_PROOF.bend', 'case 1n+index: get(names, index)', 'case 1n+index: get(names, 0n)', 'REGISTRY_RELATION.bend'),
    ('collected_input_present', 'REGISTRY_PROOF.bend', 'collect(rest, names_of(intern(names, head)))', 'collect(rest, names)', 'REGISTRY_RELATION.bend'),
    ('assigned_id_in_range', 'REGISTRY_PROOF.bend', 'increment(find(names, name))', 'increment(increment(find(names, name)))', 'REGISTRY_RELATION.bend'),
])
boundary_mutations = [
    ('boundary_registry_unique', 'BOUNDARY_CONSTRUCTION_PROOF.bend', 'def registry(items: List<&2, String>) -> List<&2, String>:\n  collect(items, [])', 'def registry(+items: List<&2, String>) -> List<&2, String>:\n  collect(items, items)', 'REGISTRY_RELATION.bend'),
    ('boundary_registry_covers', 'BOUNDARY_CONSTRUCTION_PROOF.bend', 'collect(rest, names_of(intern(names, head)))', 'collect(rest, names)', 'REGISTRY_RELATION.bend'),
    ('boundary_encoding_complete', 'BOUNDARY_CONSTRUCTION_PROOF.bend', 'encode_if(\n    Bool.and(Registry.unique(names), all_present(input_strings(input), names)),\n    names,\n    input\n  )', 'MissingRegistry{}', 'BOUNDARY_ENCODING.bend'),
    ('covered_identity_exact', 'BOUNDARY_CONSTRUCTION_PROOF.bend', 'case Some{identity}: identity', 'case Some{identity}: 0n', 'BOUNDARY_ENCODING.bend'),
    ('covered_identity_in_range', 'BOUNDARY_CONSTRUCTION_PROOF.bend', 'case Some{identity}: identity', 'case Some{identity}: 0n', 'BOUNDARY_ENCODING.bend'),
    ('lookup_key_roundtrip', 'BOUNDARY_CONSTRUCTION_PROOF.bend', 'case TypeKind{}: label_type_key(name)', 'case TypeKind{}: label_key(name)', 'core.bend'),
    ('import_composite_exact', 'BOUNDARY_CONSTRUCTION_PROOF.bend', 'identity(names, Source.import_target_key(path, item))', 'identity(names, path)', 'BOUNDARY_ENCODING.bend'),
]
boundary_laws = {mutation[0] for mutation in boundary_mutations}
mutations.extend(boundary_mutations)
boundary_counter_js = """import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const c=(await import(pathToFileURL(process.argv[2]))).default,law=process.argv[3];
const source='../../local-graph-draft/core.',boundary='../../local-graph-draft/BOUNDARY.';
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'});
const binding={$:source+'ImportBinding',path:'pkg',name:'N',type_only:false};
const input={$:'Input',facts:{$:boundary+'BoundaryFacts',kind_aware:true,declarations:list([]),imports:list([{$:boundary+'ImportEntry',key:'I',binding}]),supporting:list([])},state:{$:boundary+'BoundaryState',visited:list([]),targets:list([]),limits:{$:source+'LocalLimits',work:10n,depth:10n,targets:10n},max_targets:0n,work:0n,graph_work:0n,max_depth:0n},path:'P',name:'N',expected:{$:source+'AnyKind'},depth:0n};
const items=c.input_strings(input),names=c['REGISTRY_RELATION.registry'](items);let falsified=false;
if(law==='boundary_registry_unique')falsified=!c['REGISTRY_RELATION.unique'](names);
if(law==='boundary_registry_covers')falsified=!c.all_present(items,names);
if(law==='boundary_encoding_complete')falsified=!c.is_encoded(c.encode_boundary(input));
if(law==='covered_identity_exact'){assert.equal(c['REGISTRY_RELATION.present'](names,'N'),true);const decoded=c['REGISTRY_RELATION.decode'](names,c.identity(names,'N'));falsified=decoded.$!=='Some'||decoded.value!=='N'}
if(law==='covered_identity_in_range'){assert.equal(c['REGISTRY_RELATION.present'](names,'N'),true);falsified=c.identity(names,'N')<=0n}
if(law==='lookup_key_roundtrip'){assert.equal(c.all_present(c.labels('N'),names),true);const key=c['core.lookup_key'](true,{$:'core.TypeKind'},c.label(names,'N'));falsified=c.text(names,key)!==c[source+'lookup_key'](true,{$:source+'TypeKind'},'N')}
if(law==='import_composite_exact'){assert.equal(c.all_present(c.import_strings('P',binding),names),true);const key=c['core.import_target_key'](c.identity(names,'P'),c.imported(names,'P',binding)),decoded=c['REGISTRY_RELATION.decode'](names,key);falsified=decoded.$!=='Some'||decoded.value!==c[source+'import_target_key']('P',binding)}
assert.equal(falsified,true);console.log(JSON.stringify({law,falsified:true,scope:'actual emitted boundary mutant falsifies named law at a concrete typed boundary; conditional law premises explicitly checked'}));
"""
history_laws = {'history_dictionary_valid'}
mutations.append(('history_dictionary_valid', 'MAP_HISTORY_INVARIANT_PROOF.bend',
    'DCon{key, value, rest, (1n + size(V, rest) : Nat)}',
    'DCon{key, value, rest, size(V, rest)}', 'Own.bend'))
history_counter_js = """import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const c=(await import(pathToFileURL(process.argv[2]))).default,law=process.argv[3];
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'});
const items=list([{$:'MAP_HISTORY_RELATION.Record',key:'x',value:1n}]),names=list(['x']);
const falsified=!c.nat_valid(c.nat_numeric(items,names));assert.equal(falsified,true);
console.log(JSON.stringify({law,falsified:true,scope:'actual emitted Nat-payload history instance falsifies generated dictionary invariant'}));
"""
registry_counter_js = """import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const c=(await import(pathToFileURL(process.argv[2]))).default,law=process.argv[3];
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'});
const names=list(['x']),before=c.encode(names,'x');let falsified=false;
if(law==='selected_id_decodes'){const decoded=c.decode(names,before.value);falsified=decoded.$!=='Some'||decoded.value!=='x'}
if(law==='shared_id_exact'){const raw=list(['x','y']);falsified=c.encode(raw,'x').value===c.encode(raw,'y').value}
if(law==='intern_existing_exact')falsified=c.id_of(c.intern(names,'x'))!==before.value;
if(law==='extension_preserves_selected')falsified=c.encode(list(['x','x']),'x').value!==before.value;
if(law==='intern_decodes'){const result=c.intern(list([]),'x'),decoded=c.decode(c.names_of(result),c.id_of(result));falsified=decoded.$!=='Some'||decoded.value!=='x'}
if(law==='intern_encodes'){const result=c.intern(list([]),'x');falsified=c.encode(c.names_of(result),'x').value!==c.id_of(result)}
if(law==='intern_preserves_selected')falsified=c.encode(c.names_of(c.intern(names,'y')),'x').value!==before.value;
if(law==='collect_preserves_selected')falsified=c.encode(c.collect(list(['y']),names),'x').value!==before.value;
if(law==='intern_preserves_unique')falsified=!c.unique(c.names_of(c.intern(names,'x')));
if(law==='collect_preserves_unique')falsified=!c.unique(c.collect(list(['x']),names));
if(law==='constructed_registry_unique')falsified=!c.unique(c.registry(list(['x','x'])));
if(law==='decoded_id_encodes'){const raw=list(['x','y']),decoded=c.decode(raw,2n);falsified=c.encode(raw,decoded.value).value!==2n}
if(law==='collected_input_present')falsified=!c.present(c.collect(list(['x']),list([])),'x');
if(law==='assigned_id_in_range')falsified=before.value<=0n||before.value>1n;
assert.equal(falsified,true);console.log(JSON.stringify({law,falsified:true,scope:'actual emitted mutant falsifies named registry law at a concrete finite input'}));
"""
for mutation in mutations:
    law, proof, before, after, *target_files = mutation
    target_file = target_files[0] if target_files else 'Own.bend'
    with tempfile.TemporaryDirectory(prefix='.list-state-mutant-', dir=owner.parent) as name:
        directory = Path(name)
        for file in owner.glob('*.bend'):
            shutil.copyfile(file, directory / file.name)
        pristine = subprocess.run(['timeout', '5s', 'bend', str(directory / proof), '--verdict'], capture_output=True, text=True)
        assert pristine.returncode == 0 and 'ALL PROOFS CHECK' in pristine.stdout, (law, pristine.stdout, pristine.stderr)
        source = (directory / target_file).read_text()
        assert source.count(before) == 1
        (directory / target_file).write_text(source.replace(before, after))
        result = subprocess.run(['timeout', '5s', 'bend', str(directory / proof), '--verdict'],
                                capture_output=True, text=True)
        output = result.stdout + result.stderr
        detected = ('ALL PROOFS CHECK' not in output
                    and 'Error:' in output and '- expected :' in output and '- observed :' in output
                    and 'no such file' not in output and 'a filled definition' not in output
                    and result.returncode != 124)
        assert detected, (law, result.returncode, output)
        (root / ('local-graph-list-state-' + law + '-mutant.log')).write_text(output)
        counterexample = None
        if target_file == 'REGISTRY_RELATION.bend' or law in boundary_laws or law in history_laws:
            emitted = directory / 'mutant.mjs'
            emitter = subprocess.run(['timeout', '5s', 'bend', str(directory / ('MAP_HISTORY_CANARY.bend' if law in history_laws else 'BOUNDARY_ENCODING.bend' if law in boundary_laws else target_file)), '-o', str(emitted)], capture_output=True, text=True)
            assert emitter.returncode == 0 and emitted.exists(), (law, emitter.stdout, emitter.stderr)
            probe = directory / 'counter.mjs'
            probe.write_text(history_counter_js if law in history_laws else boundary_counter_js if law in boundary_laws else registry_counter_js)
            observed = subprocess.run(['node', str(probe), str(emitted), law], capture_output=True, text=True, timeout=5)
            assert observed.returncode == 0, (law, observed.stdout, observed.stderr)
            counterexample = json.loads(observed.stdout)
        samples.append({'law': law, 'proof': proof,
                        'proofSha256': hashlib.sha256((owner / proof).read_bytes()).hexdigest(),
                        'mutation': {'file': target_file, 'before': before, 'after': after},
                        'detected': detected, 'pristineProofPassed': True, 'exitCode': result.returncode,
                        'counterexample': counterexample,
                        'failureLocation': re.search(r'Location: ([^\n]+)', output).group(1) if re.search(r'Location: ([^\n]+)', output) else None,
                        'scope': 'selected exact-statement entry and its support dependencies; semantic expected/observed mismatch, rejection may occur in support; dedicated visit/step/run/plan mutations qualify list-state termination only, not String/output equivalence or production adoption'})
(root / 'local-graph-list-state-proof-mutants.json').write_text(
    json.dumps({'passed': True, 'mutants': samples}, indent=2) + '\n')
print(json.dumps({'passed': True, 'mutants': len(samples)}))
