"""Give a subprocess a real controlling terminal over piped stdin/stdout."""

import errno
import fcntl
import os
import select
import signal
import subprocess
import sys
import termios


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: pty-bridge.py COMMAND [ARG ...]")
    master, slave = os.openpty()

    def controlling_terminal():
        os.setsid()
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)

    child = subprocess.Popen(
        sys.argv[1:], stdin=slave, stdout=slave, stderr=slave,
        preexec_fn=controlling_terminal,
    )
    os.close(slave)

    def terminate(_signal, _frame):
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, terminate)
    reading_stdin = True
    while True:
        inputs = [master] + ([sys.stdin.fileno()] if reading_stdin else [])
        readable, _, _ = select.select(inputs, [], [], 0.1)
        if sys.stdin.fileno() in readable:
            data = os.read(sys.stdin.fileno(), 4096)
            if data:
                os.write(master, data)
            else:
                reading_stdin = False
        if master in readable:
            try:
                data = os.read(master, 4096)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b""
            if not data:
                break
            os.write(sys.stdout.fileno(), data)
        if child.poll() is not None and not readable:
            break
    return child.wait()


if __name__ == "__main__":
    sys.exit(main())
