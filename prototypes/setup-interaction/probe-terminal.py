"""Throwaway macOS/Linux PTY probe: synthetic inputs, no credential adapters."""
import argparse, fcntl, json, os, pty, select, signal, struct, subprocess, termios, time

parser = argparse.ArgumentParser()
parser.add_argument('--bun', required=True)
parser.add_argument('--compiled')
args = parser.parse_args()
reports = []
base_command = [args.compiled] if args.compiled else [args.bun, 'cli.ts']

def run(name, engine='reducer', width=80, action='complete', color=False):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, width, 0, 0))
    before = termios.tcgetattr(slave)
    env = dict(os.environ, TERM='dumb' if action == 'reject' else 'xterm-256color')
    if not color: env['NO_COLOR'] = '1'
    p = subprocess.Popen(base_command + (['--machine'] if engine == 'machine' else []), stdin=slave, stderr=slave, stdout=subprocess.PIPE, env=env)
    output = b''
    deadline = time.monotonic() + 12
    def until(marker):
        nonlocal output
        start = len(output)
        while marker not in output[start:]:
            assert time.monotonic() < deadline, (name, output.decode(errors='replace')[-1500:])
            ready, _, _ = select.select([master], [], [], .1)
            if ready:
                output += os.read(master, 65536)
            if p.poll() is not None and marker not in output[start:]:
                raise AssertionError((name, p.returncode, output.decode(errors='replace')[-1500:]))
    try:
        if action == 'reject':
            until(b'requires interactive')
            stdout = p.communicate(timeout=3)[0]
            assert p.returncode == 2 and stdout == b'' and before == termios.tcgetattr(slave)
            reports.append(dict(name=name, rejected=True, modesUnchanged=True))
            return
        until(b'Select synthetic agents')
        if action != 'complete':
            if action in ('SIGTERM', 'SIGINT', 'SIGHUP'): p.send_signal(getattr(signal, action))
            elif action == 'interrupt': os.write(master, b'\x03')
            elif action == 'eof': os.write(master, b'\x04')
            else: raise AssertionError(action)
        else:
            # Resize before selection; return one fake host.
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 12, max(20, width-10), 0, 0))
            p.send_signal(signal.SIGWINCH)
            os.write(master, b'\x1b[B\x1b[B\r\x1b')
            until(b'Preview Claude hooks'); os.write(master, b'\x1b[B\r')
            until(b'Where should the credential'); os.write(master, b'\r')
            until(b'Save fake key'); os.write(master, b'\x1b[B\r')
            until(b'Enter a FAKE key'); os.write(master, b'SYNTHETIC_PTY_SENTINEL\r')
            until(b'Run one separately'); os.write(master, b'\r')
        until(b'RESULT ')
        stdout = p.communicate(timeout=max(.1, deadline-time.monotonic()))[0]
        result = json.loads(stdout)
        after = termios.tcgetattr(slave)
        assert before == after, (name, 'terminal modes changed')
        assert b'SYNTHETIC_PTY_SENTINEL' not in output + stdout
        assert b'\x1b' not in stdout
        if not color:
            # Cursor/control sequences remain permitted; no SGR color sequence.
            import re
            assert not re.search(rb'\x1b\[[0-9;]*m', output), (name, 'color remains')
        assert result['phase'] == ('Done' if action == 'complete' else 'Cancelled'), result
        reports.append(dict(name=name, engine=engine, width=width, result=result['phase'], modesRestored=True, secretAbsent=True, stdoutJSON=True))
    finally:
        if p.poll() is None: p.kill(); p.wait()
        os.close(master); os.close(slave)

for engine in ('reducer', 'machine'):
    for width in (80, 40, 20): run(f'{engine}-{width}', engine, width)
    for action in ('interrupt', 'eof', 'SIGTERM', 'SIGINT', 'SIGHUP'): run(f'{engine}-{action}', engine, action=action)
run('TERM=dumb-on-TTY', action='reject')
run('color-enabled', color=True)
for name, env in [('redirected', dict(os.environ)), ('dumb', dict(os.environ, TERM='dumb'))]:
    p = subprocess.run(base_command, stdin=subprocess.DEVNULL, capture_output=True, env=env, timeout=5)
    assert p.returncode == 2 and p.stdout == b'' and b'requires interactive' in p.stderr
    reports.append(dict(name=name, rejected=True, stdoutEmpty=True))
print(json.dumps(reports, indent=2))
