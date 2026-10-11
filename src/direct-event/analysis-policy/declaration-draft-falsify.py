from pathlib import Path
import itertools, json, shutil, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/declaration-policy'
items = [
 ('function_admission','function_spec',5,'Bool',lambda i,b,f,m,o:i and b and not f and not m and not o),
 ('arrow_admission','arrow_spec',3,'Bool',lambda f,m,o:not f and not m and not o),
 ('type_admission','type_spec',3,'Bool',lambda i,t,m:i and not t and not m),
 ('type_kind','kind_spec',2,'Core.TypeKind',lambda i,a:'Interface' if i else 'TypeAlias' if a else 'Ignore'),
 ('root_result','result_spec',2,'Core.RootResult',lambda s,l:'Complete' if s else 'DeclarationLimit' if l else 'Unsupported')
]
with tempfile.TemporaryDirectory(prefix='hapsland-declaration-facts-') as temporary:
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
    record = {'passed':True,'cases':count,'laws':5,'scope':'exhaustive conditional Boolean facts against independent literal Python oracle and actual law spec definitions; no native AST or universal proof claim','deadlineSeconds':5}
    (root/'evidence/bend-strangler/declaration-draft-falsification.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record))
