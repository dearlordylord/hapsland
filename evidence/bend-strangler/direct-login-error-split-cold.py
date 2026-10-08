import pathlib, subprocess, json, os, hashlib, time, resource, statistics, datetime
ROOT = pathlib.Path.cwd()
ROOTS = {'upstream': pathlib.Path('/workspace/typescript/hapsland-bend-baseline-master-56d1f390'), 'qualifiedControl': pathlib.Path('/workspace/typescript/hapsland-bend-control-04208293'), 'directCandidate': ROOT}
BUN = '/home/node/.local/share/mise/installs/bun/1.3.14/bin/bun'
assert subprocess.check_output([BUN, '--version'], text=True, timeout=5).strip() == '1.3.14'
SCENARIOS = ['available', 'locked', 'empty']
RUNNER = (ROOT / 'evidence/bend-strangler/direct-login-cold-runner.mjs').read_bytes()
sha = lambda data: hashlib.sha256(data).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
revisions = {name: subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True, timeout=5).strip() for name, root in ROOTS.items()}
source_paths = ['packages/administration/src/credentials/direct-login-model.ts', 'packages/canonical-policy/src/canonical/direct-login-adapter.ts', 'packages/agent-flow-bend/direct-login-policy/core.bend', 'packages/agent-flow-bend/direct-login-policy/LAWS.bend', 'packages/agent-flow-bend/direct-login-policy/PROOF.bend', 'packages/agent-flow-bend/scripts/build-direct-login-policy.mjs', 'packages/agent-flow-bend/abi/direct-login-policy.generated.d.ts', 'evidence/bend-strangler/direct-login-error-split-cold.py']
source_paths += ['packages/administration/src/credentials/direct-input.ts','packages/administration/src/credentials/masked-input-error.ts']
source_hashes = {p: sha((ROOT / p).read_bytes()) for p in source_paths}
for lane in ['upstream', 'qualifiedControl']:
    for p in ['packages/administration/src/credentials/direct-login-model.ts', 'packages/administration/src/credentials/direct-input.ts']:
        native = subprocess.check_output(['git', 'show', 'HEAD:' + p], cwd=ROOTS[lane], timeout=5)
        assert native == (ROOTS[lane] / p).read_bytes(), f'{lane} control modified: {p}'
assert (ROOTS['upstream'] / source_paths[0]).read_bytes() == (ROOTS['qualifiedControl'] / source_paths[0]).read_bytes()
assert len({(root / 'packages/administration/src/credentials/direct-input.ts').read_text().replace('./masked-input-error.ts','./masked-input.ts') for root in ROOTS.values()}) == 1
old_error=(ROOTS['upstream']/'packages/administration/src/credentials/masked-input.ts').read_text();old_error=old_error[old_error.index('export class MaskedInputError'):old_error.index('// The secret')].strip()
new_error=(ROOT/'packages/administration/src/credentials/masked-input-error.ts').read_text().split('\n\n',1)[1].strip()
assert old_error==new_error
print(json.dumps({'stage': 'preparation', 'revisions': revisions, 'sourceFrozen': source_hashes}), flush=True)
declaration = {'at': now(), 'kind': 'pre-execution declaration', 'revisions': revisions, 'sampleRounds': 41, 'ordering': 'three lane rotations with alternating reversal; scenario rotations with alternating reversal', 'runtime': BUN, 'affinity': 'CPU 11, nonexclusive', 'sourceSha256': source_hashes, 'runnerSha256': sha(RUNNER), 'comparison': {'isolation': 'directCandidate / qualifiedControl isolates the additional direct-login migration', 'upstreamGuard': 'directCandidate / upstream preserves raw <=1 median wall and summed CPU conditions for both actual journeys', 'accumulated': 'qualifiedControl / upstream diagnoses prior migrated graph cost'}, 'limits': 'compiled minified bytecode fixtures with controlled offline owners; identical empty controls are diagnostics, never subtracted or normalized; historical failed cold results retained; no native-store, Jev, installed-package or platform claim'}
(ROOT / 'evidence/bend-strangler/direct-login-error-split-cold-declaration.json').write_text(json.dumps(declaration, indent=2) + '\n')
created = []
paths = {}
control_paths = {}
try:
    for lane, root in ROOTS.items():
        directory = root / '.test-runs'
        directory.mkdir(exist_ok=True)
        entry = directory / 'bend-direct-login-isolated-runner.mjs'
        binary = directory / 'bend-direct-login-isolated-executable'
        entry.write_bytes(RUNNER)
        created += [entry, binary]
        command = [BUN, 'build', str(entry), '--target=bun', '--format=esm', '--minify', '--compile', '--bytecode', '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json', '--outfile', str(binary)]
        result = subprocess.run(command, cwd=root, capture_output=True, timeout=30)
        assert result.returncode == 0, result.stderr.decode()
        paths[lane] = binary
    root = ROOTS['upstream']
    entry = root / '.test-runs/bend-direct-login-isolated-empty.mjs'
    binary = root / '.test-runs/bend-direct-login-isolated-empty-executable'
    entry.write_text('console.log("empty-process-control")\n')
    created += [entry, binary]
    result = subprocess.run([BUN, 'build', str(entry), '--target=bun', '--format=esm', '--minify', '--compile', '--bytecode', '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json', '--outfile', str(binary)], cwd=root, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr.decode()
    empty = binary.read_bytes()
    for lane, root in ROOTS.items():
        control = root / '.test-runs/bend-direct-login-isolated-empty-executable'
        if control != binary:
            created.append(control)
            control.write_bytes(empty)
            control.chmod(0o755)
        control_paths[lane] = control
    before = {lane: {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size} for lane, p in paths.items()}
    empty_hashes = {lane: sha(p.read_bytes()) for lane, p in control_paths.items()}
    assert len(set(empty_hashes.values())) == 1
    expected = {}
    for scenario in SCENARIOS:
        outputs = []
        for lane, root in ROOTS.items():
            p = control_paths[lane] if scenario == 'empty' else paths[lane]
            r = subprocess.run(['taskset', '-c', '11', str(p), scenario], cwd=root, capture_output=True, timeout=5)
            assert r.returncode == 0 and not r.stderr, r.stderr.decode()
            outputs.append(sha(r.stdout))
        assert len(set(outputs)) == 1, (scenario, outputs)
        expected[scenario] = outputs[0]
    print(json.dumps({'stage': 'actual-fixture-prerequisites-passed', 'executedArtifacts': before}), flush=True)
    started = now()
    deadline = time.monotonic() + 180
    samples = {s: {lane: [] for lane in ROOTS} for s in SCENARIOS}
    for round in range(41):
        scenarios = SCENARIOS[round % 3:] + SCENARIOS[:round % 3]
        lanes = list(ROOTS)
        lanes = lanes[round % 3:] + lanes[:round % 3]
        if round % 2:
            scenarios.reverse()
            lanes.reverse()
        for scenario in scenarios:
            for lane in lanes:
                p = control_paths[lane] if scenario == 'empty' else paths[lane]
                usage = resource.getrusage(resource.RUSAGE_CHILDREN)
                start = time.monotonic()
                remaining = deadline - start
                assert remaining > 0, 'measurement deadline exhausted'
                r = subprocess.run(['taskset', '-c', '11', str(p), scenario], cwd=ROOTS[lane], capture_output=True, timeout=min(5, remaining))
                elapsed = time.monotonic() - start
                after = resource.getrusage(resource.RUSAGE_CHILDREN)
                assert r.returncode == 0 and not r.stderr, r.stderr.decode()
                assert sha(r.stdout) == expected[scenario]
                samples[scenario][lane].append({'milliseconds': elapsed * 1000, 'cpuSeconds': after.ru_utime + after.ru_stime - usage.ru_utime - usage.ru_stime, 'stdoutSha256': sha(r.stdout)})
        if round % 10 == 0:
            print(json.dumps({'stage': 'measuring', 'roundsCompleted': round + 1}), flush=True)
    after = {lane: {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size} for lane, p in paths.items()}
    assert before == after
    assert source_hashes == {p: sha((ROOT / p).read_bytes()) for p in source_paths}
    assert empty_hashes == {lane: sha(p.read_bytes()) for lane, p in control_paths.items()}
    summary = {}
    for scenario in SCENARIOS:
        comparisons = {}
        for name, a, b in [('isolation', 'directCandidate', 'qualifiedControl'), ('upstreamGuard', 'directCandidate', 'upstream'), ('accumulated', 'qualifiedControl', 'upstream')]:
            wall = statistics.median(s['milliseconds'] for s in samples[scenario][a]) / statistics.median(s['milliseconds'] for s in samples[scenario][b])
            cpu = sum(s['cpuSeconds'] for s in samples[scenario][a]) / sum(s['cpuSeconds'] for s in samples[scenario][b])
            comparisons[name] = {'medianWallRatio': wall, 'cpuRatio': cpu, 'wallParity': wall <= 1, 'cpuParity': cpu <= 1}
        summary[scenario] = comparisons
    guard = all(summary[s]['upstreamGuard'][field] for s in ['available', 'locked'] for field in ['wallParity', 'cpuParity'])
    record = {'at': now(), 'startedAt': started, 'diagnostic': True, 'declaration': declaration, 'sampleRounds': 41, 'executedArtifacts': before, 'identicalEmptyControls': empty_hashes, 'artifactsAndSourceFrozen': True, 'actualFixturePrerequisitesPassed': True, 'upstreamColdGuardPassed': guard, 'summary': summary, 'samples': samples, 'scope': declaration['limits']}
    (ROOT / 'evidence/bend-strangler/direct-login-error-split-cold.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'upstreamColdGuardPassed': guard, 'summary': summary}), flush=True)
finally:
    for p in set(created):
        p.unlink(missing_ok=True)
