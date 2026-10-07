"""Bounded PTY witnesses at the shared interaction seam; fake secrets only."""
import argparse, json, os, pty, select, signal, subprocess, sys, termios, time
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--compiled')
args = parser.parse_args()
HERE = Path(__file__).resolve().parent
END = time.monotonic() + 25
reports = []

def case(name, mode, operations, expected, controlling=False):
    master, slave = pty.openpty()
    before = termios.tcgetattr(slave)
    command = [args.compiled] if args.compiled else ['node', 'run.mjs', 'interaction-cli.ts']
    # Keep the session leader alive until flags are inspected: macOS revokes
    # its controlling PTY on leader exit, which otherwise defeats that witness.
    release_read, release_write = os.pipe()
    fixture = """
import fcntl, os, signal, subprocess, sys, termios
os.setsid()
fcntl.ioctl(2, termios.TIOCSCTTY, 0)
child = subprocess.Popen(sys.argv[2:])
for sig in [signal.SIGINT, signal.SIGTERM, signal.SIGHUP]:
    signal.signal(sig, lambda sig, frame: child.send_signal(sig))
status = child.wait()
os.write(2, b'FIXTURE_DONE\\n')
os.read(int(sys.argv[1]), 1)
sys.exit(status)
"""
    p = subprocess.Popen([sys.executable, '-c', fixture, str(release_read)] + command + [mode] + (['--controlling-terminal'] if controlling else []), cwd=HERE,
        stdin=subprocess.PIPE if controlling else slave, stderr=slave, stdout=subprocess.PIPE, pass_fds=(release_read,),
        env={**os.environ, 'TERM': 'xterm-256color', 'NO_COLOR': '1'})
    os.close(release_read)
    data = b''
    deadline = min(END, time.monotonic() + 4)
    descendants = set()
    def until(marker, start=0):
        nonlocal data
        while marker not in data[start:]:
            assert time.monotonic() < deadline, (name, 'timeout', data[-4500:])
            if not args.compiled:
                found = subprocess.run(['pgrep', '-P', str(p.pid)], capture_output=True, timeout=.5)
                descendants.update(int(pid) for pid in found.stdout.split())
            assert p.poll() is None, (name, 'early exit', data[-500:])
            ready, _, _ = select.select([master], [], [], .03)
            if ready: data += os.read(master, 65536)
    try:
        until({'hidden': b'Enter fake secret', 'many': b'Choose synthetic targets', 'confirm': b'[y/N]'}[mode])
        for keys, marker in operations:
            start = len(data)
            if isinstance(keys, int): p.send_signal(keys)
            else: os.write(master, keys)
            if marker: until(marker, start)
        until(b'FIXTURE_DONE')
        stdout = p.stdout.readline()
        assert json.loads(stdout) == expected, (name, stdout)
        after = termios.tcgetattr(slave)
        # PENDIN is a kernel pending-input marker set by restoring canonical
        # input on macOS, not a changed input/echo configuration. Preserve all
        # configuration flags and control characters; exclude only this marker.
        before[3] &= ~getattr(termios, 'PENDIN', 0)
        after[3] &= ~getattr(termios, 'PENDIN', 0)
        assert after == before, (name, 'terminal configuration leak')
        assert b'FAKE_TTY_SENTINEL' not in data + stdout, (name, 'secret leaked')
        os.write(release_write, b'x')
        p.wait(timeout=.5)
        assert p.returncode == 0, (name, p.returncode)
        reports.append({'name': name, 'restored': True, 'secretAbsent': True, 'stdoutJSON': True})
    finally:
        for pid in descendants:
            try: os.kill(pid, signal.SIGKILL)
            except ProcessLookupError: pass
        try: os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        if p.poll() is None: p.wait(timeout=1)
        p.stdout.close()
        if p.stdin: p.stdin.close()
        os.close(release_write)
        os.close(master); os.close(slave)

for controlling in [False, True]:
    case('hidden-' + str(controlling), 'hidden', [(b'FAKE_TTY_SENTINEL\r', None)], {'kind': 'captured'}, controlling)
    for key in [b'\x1b', b'\x03', b'\x04']:
        case('hidden-cancel-' + str(controlling) + repr(key), 'hidden', [(key, None)], {'kind': 'terminated'}, controlling)
    case('hidden-signal-' + str(controlling), 'hidden', [(signal.SIGTERM, None)], {'kind': 'interrupted'}, controlling)
case('many-empty-guard', 'many', [(b'\r', b'Select at least one'), (b'\x1b[B \r', None)], {'kind': 'selected', 'value': ['a', 'b']})
case('many-back', 'many', [(b'\x1b', None)], {'kind': 'back'})
case('confirm-default', 'confirm', [(b'\r', None)], {'kind': 'confirmed', 'yes': False})
case('confirm-y', 'confirm', [(b'y\r', None)], {'kind': 'confirmed', 'yes': True}, True)
case('confirm-back', 'confirm', [(b'\x1b', None)], {'kind': 'back'})
print(json.dumps({'runner': 'compiled' if args.compiled else 'source', 'cases': reports, 'realCredentialReads': 0}))
