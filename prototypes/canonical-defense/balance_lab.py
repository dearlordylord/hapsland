#!/usr/bin/env python3
"""Repeat isolated balance ablations; production sources remain untouched."""
import argparse, hashlib, json, pathlib, shutil, subprocess, tempfile
HERE = pathlib.Path(__file__).resolve().parent

def run(variant):
    with tempfile.TemporaryDirectory(prefix='hapsland-balance-') as directory:
        root = pathlib.Path(directory)
        target = root / 'prototypes' / 'canonical-defense'
        target.mkdir(parents=True)
        (root / 'packages').symlink_to(HERE.parents[1] / 'packages', target_is_directory=True)
        for source in HERE.glob('*.bend'):
            shutil.copy2(source, target / source.name)
        host = target / 'DefenseHost.bend'
        effects = target / 'DefenseEffects.bend'
        if variant == 'risk-only':
            text = host.read_text().replace('def pressure_buffer() -> U32: 80', 'def pressure_buffer() -> U32: 160').replace('(raw > pressure_buffer() : U32)', '(raw >= pressure_buffer() : U32)').replace('((200 * M.sub(raw,pressure_buffer())) / 80 : U32)', 'Bool.pick(U32,(raw >= pressure_buffer() : U32),200,0)')
            host.write_text(text)
        else:
            text = effects.read_text().replace('case 1: (10 + level * 5 : U32)', 'case 1: (10 + level * 10 : U32)').replace('case 1: 90', 'case 1: 18').replace('def risk_floor() -> U32: 60', 'def risk_floor() -> U32: 0').replace('U32.min(M.sub(risk,risk_floor()),((risk * power) / 100 : U32))', 'U32.min(risk,power)')
            effects.write_text(text)
        fixture = target / 'Ablation.bend'
        fixture.write_text('import Base\nimport ./DefenseBalance.bend as B\ndef main() -> IO(Unit):\n  B.plans(3n,0,0,0)\n')
        emitted = root / 'ablation.c'
        binary = root / 'ablation'
        subprocess.run(['bend',str(fixture),'-o',str(emitted)],check=True)
        subprocess.run(['clang','-std=c11','-O3',str(emitted),'-o',str(binary),'-lpthread','-lm'],check=True)
        result = subprocess.run([str(binary),'--threads','4'],check=True,text=True,capture_output=True)
        (HERE / f'balance-{variant}.txt').write_text(result.stdout)
        return {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [host,effects,target/'DefenseBalance.bend']}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--variant',choices=['risk-only','pressure-only','both'],default='both')
    args=parser.parse_args()
    variants=['risk-only','pressure-only'] if args.variant=='both' else [args.variant]
    receipt=HERE/'balance-ablation.json'
    data=json.loads(receipt.read_text()) if receipt.exists() else {}
    for variant in variants:
        data[variant]={'experiment_source_sha256':run(variant),'scope':'map0, plans0/1/2, authored draw offsets0/25/50/75; latest seed and timer fixes preserved; native Linux ARM64 clang O3 four workers'}
        receipt.write_text(json.dumps(data,indent=2)+'\n')
