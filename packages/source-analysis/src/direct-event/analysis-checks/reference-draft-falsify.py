from pathlib import Path
import itertools, json, shutil, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/reference-policy'
items = [
    ('call_reference', 'call_spec', 5, 'Core.ReferencePlan', lambda c,e,i,u,l: 'NamedFunction' if c and e and i and not u and not l else 'Unsupported' if c and e else 'Ignore'),
    ('ignored_value', 'ignore_spec', 4, 'Bool', lambda s,p,d,f: s or not p or d and f),
    ('value_reference', 'value_spec', 3, 'Core.ReferencePlan', lambda l,k,u: 'Ignore' if l else 'NamedFunction' if k and not u else 'Unsupported'),
    ('declared_type', 'declared_spec', 2, 'Bool', lambda i,m: not i or m),
    ('readonly_intrinsic', 'readonly_spec', 5, 'Bool', lambda n,b,g,f,o: n and not b and g and f and o),
    ('type_reference', 'type_spec', 7, 'Core.ReferencePlan', lambda u,i,o,c,p,r,d: 'Unsupported' if u else 'NamedType' if i and not o and c and not p and not r and d else 'Ignore')
]
with tempfile.TemporaryDirectory(prefix='hapsland-reference-facts-') as temporary:
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
    record = {'passed':True,'cases':count,'laws':6,'scope':'exhaustive conditional Boolean facts against independent literal Python oracle and actual law spec definitions; no native AST or universal proof claim','deadlineSeconds':5}
    (root/'evidence/bend-strangler/reference-draft-falsification.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record))
