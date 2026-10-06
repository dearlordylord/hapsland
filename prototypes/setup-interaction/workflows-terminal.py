"""Bounded PTY witnesses for four synthetic workflow entry points."""
import argparse, json, os, pty, select, signal, subprocess, termios, time
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--compiled')
args = parser.parse_args()
HERE = Path(__file__).resolve().parent
END = time.monotonic() + 40
reports = []
def case(name, flow, operations, phase='Done', extra=None, writes=0, checks=None):
    master, slave = pty.openpty()
    before = termios.tcgetattr(slave)
    command = [args.compiled] if args.compiled else ['node', 'run.mjs', 'workflows-cli.ts']
    p = subprocess.Popen(command + [flow] + (extra or []), cwd=HERE, stdin=slave, stderr=slave, stdout=subprocess.PIPE,
        env={**os.environ, 'TERM': 'xterm-256color', 'NO_COLOR': '1'}, start_new_session=True)
    data = b''
    deadline = min(END, time.monotonic() + 4)
    descendants = set()
    def until(marker, start=0):
        nonlocal data
        while marker not in data[start:]:
            assert time.monotonic() < deadline, (name, 'timeout', data[-800:])
            assert p.poll() is None, (name, 'early exit', data[-800:])
            if not args.compiled:
                found = subprocess.run(['pgrep', '-P', str(p.pid)], capture_output=True, timeout=.5)
                descendants.update(int(pid) for pid in found.stdout.split())
            ready, _, _ = select.select([master], [], [], .03)
            if ready: data += os.read(master, 65536)
    try:
        until({'update': b'Review batch update', 'maintenance': b'Review maintenance', 'login': b'Enter fake login key', 'verification': b'[y/N]'}[flow])
        for keys, marker in operations:
            start = len(data)
            if isinstance(keys, int): p.send_signal(keys)
            else: os.write(master, keys)
            if marker: until(marker, start)
        while p.poll() is None:
            assert time.monotonic() < deadline, (name, 'exit timeout', data[-800:])
            ready, _, _ = select.select([master], [], [], .03)
            if ready: data += os.read(master, 65536)
        stdout = p.communicate(timeout=.5)[0]
        result = json.loads(stdout)
        assert p.returncode == 0 and result['model']['phase'] == phase, (name, result)
        assert result['observed'].get('writes', result['observed'].get('saves', 0)) == writes, (name, result)
        if checks is not None: assert result['observed']['checks'] == checks, (name, result)
        assert termios.tcgetattr(slave) == before, (name, 'terminal mode leak')
        assert b'FAKE_PTY_WORKFLOW_SENTINEL' not in data + stdout
        assert b'\x1b' not in stdout
        reports.append({'name': name, 'phase': phase, 'modesRestored': True, 'secretAbsent': True, 'stdoutJSON': True})
    finally:
        for pid in descendants:
            try: os.kill(pid, signal.SIGKILL)
            except ProcessLookupError: pass
        try: os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        if p.poll() is None: p.communicate(timeout=1)
        p.stdout.close(); os.close(master); os.close(slave)

approval = b'[y/N]'
case('update-group-partial', 'update', [(b'\r', approval), (b'y\r', None)], extra=['--scenario=partial'], writes=2)
case('update-decline', 'update', [(b'\r', approval), (b'\r', None)])
case('update-back', 'update', [(b'\r', approval), (b'\x1b', b'Review batch update'), (b'\r', approval), (b'y\r', None)], writes=2)
case('update-stale', 'update', [(b'\r', approval), (b'y\r', b'Review batch update'), (b'\r', approval), (b'y\r', None)], extra=['--scenario=stale'], writes=2)
case('maintenance-per-agent', 'maintenance', [(b'\r', approval), (b'y\r', b'Review maintenance'), (b'\r', approval), (b'\r', None)], writes=1)
case('maintenance-partial-exit', 'maintenance', [(b'\r', approval), (b'y\r', b'Review maintenance'), (b'\x1b', None)], phase='Cancelled', extra=['--scenario=partial'], writes=1)
case('maintenance-back', 'maintenance', [(b'\r', approval), (b'\x1b', b'Review maintenance'), (b'\x1b', None)], phase='Cancelled')
case('login-hidden', 'login', [(b'FAKE_PTY_WORKFLOW_SENTINEL\r', None)], writes=1)
case('login-escape', 'login', [(b'\x1b', None)], phase='Cancelled')
case('login-eof', 'login', [(b'\x04', None)], phase='Cancelled')
case('verification-replace', 'verification', [(b'y\r', b'Credential correction'), (b'\r', approval), (b'y\r', b'Enter fake replacement key'), (b'FAKE_PTY_WORKFLOW_SENTINEL\r', None)], writes=1, checks=2)
case('verification-file-recheck', 'verification', [(b'y\r', b'Credential correction'), (b'\r', approval), (b'y\r', None)], extra=['--source=file'], checks=2)
case('verification-decline', 'verification', [(b'\r', None)], checks=0)
case('verification-env-guidance', 'verification', [(b'y\r', None)], extra=['--source=environment'], checks=1)
case('verification-hidden-cancel', 'verification', [(b'y\r', b'Credential correction'), (b'\r', approval), (b'y\r', b'Enter fake replacement key'), (b'\x1b', None)], phase='Cancelled', checks=1)
for flow in ['update', 'maintenance', 'login', 'verification']:
    case(flow + '-signal', flow, [(signal.SIGTERM, None)], phase='Interrupted', checks=0 if flow == 'verification' else None)
    case(flow + '-eof', flow, [(b'\x04', None)], phase='Cancelled', checks=0 if flow == 'verification' else None)
base = [args.compiled] if args.compiled else ['node', 'run.mjs', 'workflows-cli.ts']
for flow in ['update', 'maintenance', 'login', 'verification']:
    rejected = subprocess.run(base + [flow], cwd=HERE, input=b'', capture_output=True, timeout=4, env={**os.environ, 'TERM': 'xterm'})
    assert rejected.returncode == 2 and rejected.stdout == b'', (flow, 'headless should reject input')
print(json.dumps({'runner': 'compiled' if args.compiled else 'source', 'cases': reports, 'headlessCases': 4, 'realWrites': 0, 'providerRequests': 0}))
