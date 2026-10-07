#!/usr/bin/env python3
"""Finite real-PTY checks of the rules workflow; no real owner operations."""
import argparse, fcntl, json, os, pty, select, signal, struct, subprocess, termios, time
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--compiled')
args = parser.parse_args()
HERE = Path(__file__).resolve().parent
END = time.monotonic() + 40
reports = []

def case(name, operations, outcome='applied', phase='Done', writes=1, width=80):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, width, 0, 0))
    before = termios.tcgetattr(slave)
    command = [args.compiled] if args.compiled else ['node', 'run.mjs', 'rules-cli.ts']
    p = subprocess.Popen(command + ['--outcome=' + outcome], cwd=HERE, stdin=slave, stderr=slave, stdout=subprocess.PIPE,
                         env={**os.environ, 'TERM': 'xterm-256color', 'NO_COLOR': '1'}, start_new_session=True)
    data = b''
    deadline = min(END, time.monotonic() + 4)
    descendants = set()
    def until(marker, start=0):
        nonlocal data
        while marker not in data[start:]:
            assert time.monotonic() < deadline, (name, 'timeout', data[-700:])
            assert p.poll() is None, (name, 'early exit', data[-700:])
            if not args.compiled:
                found = subprocess.run(['pgrep', '-P', str(p.pid)], capture_output=True, timeout=.5)
                descendants.update(int(pid) for pid in found.stdout.split())
            ready, _, _ = select.select([master], [], [], .05)
            if ready: data += os.read(master, 65536)
    try:
        until(b'Choose scope for rule')
        for keys, marker in operations:
            start = len(data)
            if isinstance(keys, int): p.send_signal(keys)
            else: os.write(master, keys)
            if marker: until(marker, start)
        while p.poll() is None:
            assert time.monotonic() < deadline, (name, 'exit timeout', data[-1500:])
            ready, _, _ = select.select([master], [], [], .03)
            if ready:
                try: data += os.read(master, 65536)
                except OSError: pass
        stdout = p.communicate(timeout=.5)[0]
        result = json.loads(stdout)
        assert p.returncode == 0, (name, p.returncode)
        assert result['phase'] == phase and result['simulatedWrites'] == writes, (name, result)
        assert termios.tcgetattr(slave) == before, (name, 'terminal modes changed')
        assert b'\x1b' not in stdout and b'SYNTHETIC_ONLY_DO_NOT_LOG' not in data + stdout
        reports.append({'name': name, 'phase': phase, 'simulatedWrites': writes, 'modesRestored': True, 'stdoutJSON': True})
    finally:
        for pid in descendants:
            try: os.kill(pid, signal.SIGKILL)
            except ProcessLookupError: pass
        try: os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        if p.poll() is None: p.communicate(timeout=1)
        p.stdout.close()
        os.close(master); os.close(slave)

preview = b'Review rule changes'
approval = b'[y/N]'
for scope, key in [('project', b'\r'), ('personal', b'\x1b[B\r')]:
    case('approve-' + scope, [(key, preview), (b'\r', approval), (b'y\r', None)])
for line in [b'\r', b'yes\r', b'n\r']:
    case('decline-' + repr(line), [(b'\r', preview), (b'\r', approval), (line, None)], writes=0)
case('stale-renewed-consent', [(b'\r', preview), (b'\r', approval), (b'y\r', preview), (b'\r', approval), (b'y\r', None)], outcome='stale')
for outcome, writes in [('failed', 0), ('partial', 1)]:
    case(outcome, [(b'\r', preview), (b'\r', approval), (b'y\r', None)], outcome=outcome, writes=writes)
case('escape-back', [(b'\r', preview), (b'\r', approval), (b'\x1b', preview), (b'\x1b', b'Choose scope for rule'),
                     (b'\x1b[B\r', preview), (b'\r', approval), (b'Y\r', None)])
case('explicit-back-exit', [(b'\r', preview), (b'\x1b[B\r', b'Choose scope for rule'), (b'\x1b[B\x1b[B\r', None)], phase='Cancelled', writes=0)
for i, prefix in enumerate([[], [(b'\r', preview)], [(b'\r', preview), (b'\r', approval)]]):
    case('ctrl-d-' + str(i), prefix + [(b'\x04', None)], phase='Cancelled', writes=0)
case('escape-initial-exit', [(b'\x1b', None)], phase='Cancelled', writes=0)
for s in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
    case('signal-' + str(s), [(s, None)], phase='Cancelled', writes=0)
case('narrow', [(b'\r', preview), (b'\r', approval), (b'y\r', None)], width=20)
# Previews and command payloads cannot consume a following prompt's buffered input.
case('typeahead', [(b'\r\x1b[B\r', preview), (b'\x04', None)], phase='Cancelled', writes=0)
print(json.dumps({'runner': 'compiled' if args.compiled else 'source', 'cases': reports, 'realWrites': 0}))
