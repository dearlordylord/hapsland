from pathlib import Path
import itertools, json, shutil, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/import-policy'
items = [
 ('import_ready','ready_spec',2,'Bool',lambda m,c:m and c),
 ('namespace_admission','namespace_spec',2,'Bool',lambda l,d:l and not d),
 ('specifier_admission','specifier_spec',3,'Bool',lambda i,l,d:i and l and not d),
 ('type_only','type_spec',2,'Bool',lambda s,p:s or p)
]
with tempfile.TemporaryDirectory(prefix='hapsland-import-facts-') as temporary:
    directory = Path(temporary)
    shutil.copyfile(owner/'core.bend', directory/'core.bend')
    # Open laws are declarations, not evidence; this literal probe checks their spec definitions only.
    (directory/'spec.bend').write_text((owner/'LAWS.bend').read_text().split('\nlaw ', 1)[0])
    source = 'import Base\nimport ./core.bend as Core\nimport ./spec.bend as Spec\n'
    count = 0
    for fn, spec, arity, typ, oracle in items:
        for bits in itertools.product([False, True], repeat=arity):
            values = ', '.join('True{}' if bit else 'False{}' for bit in bits)
            answer = oracle(*bits)
            expected = ('True{}' if answer else 'False{}') if typ == 'Bool' else 'Core.'+answer+'{}'
            for namespace, name in [('Core',fn), ('Spec',spec)]:
                source += f'\ndef case_{count}_{namespace}() -> {{ {namespace}.{name}({values}) == {expected} : {typ} }}:\n  {{==}}\n'
            count += 1
    (directory/'probe.bend').write_text(source)
    result = subprocess.run(['bend',str(directory/'probe.bend'),'--verdict'],capture_output=True,text=True,timeout=5)
    assert result.returncode == 0 and 'ALL PROOFS CHECK' in result.stdout, result.stdout+result.stderr
    record = {'passed':True,'cases':count,'laws':4,'scope':'exhaustive conditional Boolean facts against independent literal Python oracle and actual law spec definitions; no native AST or universal proof claim','deadlineSeconds':5}
    (root/'evidence/bend-strangler/import-draft-falsification.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record))
