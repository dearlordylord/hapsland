from pathlib import Path
import itertools, json, shutil, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/binding-policy'
items = [
    ('unsupported_assignment', 'assignment_spec', 3, 'Bool', lambda i,b,p: i and b or p),
    ('binding_actions', 'actions_spec', 5, 'Core.BindingPlan', lambda u,m,x,b,i: 'Mark' if u else ('MarkBind' if i else 'MarkMark') if m and x and b else 'Mark' if m and x else ('Bind' if i else 'Mark') if b else 'NoAction'),
    ('initial_arguments', 'arguments_spec', 1, 'Bool', lambda l: not l)
]
with tempfile.TemporaryDirectory(prefix='hapsland-binding-facts-') as temporary:
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
    record = {'passed':True,'cases':count,'laws':3,'scope':'exhaustive conditional Boolean facts against independent literal Python oracle and actual law spec definitions; no native AST or universal proof claim','deadlineSeconds':5}
    (root/'evidence/bend-strangler/binding-draft-falsification.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record))
