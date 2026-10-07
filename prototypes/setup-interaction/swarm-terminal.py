#!/usr/bin/env python3
"""Bounded adversarial PTY checks for the synthetic setup console.

This is an independent interaction probe. It uses only synthetic input, a PTY,
and the pinned Bun selected by run.mjs. Every child owns a process group so a
failed assertion can still reap the launcher and any Bun child it left behind.
"""
import argparse
import json
import os
import pty
import re
import select
import signal
import struct
import subprocess
import termios
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SUITE_SECONDS = 55.0
CASE_SECONDS = 4.0
SECRET = "SYNTHETIC_é_漢字_🔒"
ANSI = re.compile(rb"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))")

parser = argparse.ArgumentParser()
parser.add_argument("--bun", default="bun")
parser.add_argument("--direct", action="store_true", help="invoke Bun directly instead of node run.mjs")
args = parser.parse_args()
if args.direct and subprocess.check_output([args.bun, "--version"], timeout=3).strip() != b"1.3.14":
    parser.error("--direct requires exact Bun 1.3.14 via --bun")
COMMAND = [args.bun, "cli.ts"] if args.direct else ["node", "run.mjs", "cli.ts"]
SUITE_END = time.monotonic() + SUITE_SECONDS
results = []
failures = []


def safe_text(raw):
    if isinstance(raw, str):
        raw = raw.encode("utf-8", "replace")
    return raw.replace(SECRET.encode(), b"<SYNTHETIC-MARKER>").decode("utf-8", "replace")


class Console:
    def __init__(self, name, width=80, engine="reducer", stdin_tty=True, stderr_tty=True):
        self.name = name
        self.width = width
        self.deadline = min(SUITE_END, time.monotonic() + CASE_SECONDS)
        self.masters = []
        self.slaves = []
        self.stdin_master = None
        self.stderr_master = None
        self.stdout_data = bytearray()
        self.stderr_data = bytearray()
        self.terminal_data = bytearray()
        self.before = None
        self.descendant_pids = set()
        stdin = self._channel(stdin_tty, "stdin")
        stderr = self._channel(stderr_tty, "stderr")
        if stdin_tty:
            self.stdin_master = stdin[1]
            self.before = termios.tcgetattr(stdin[0])
            self.stdin_slave = stdin[0]
        else:
            self.stdin_slave = None
        if stderr_tty:
            self.stderr_master = stderr[1]
        self.stderr_pipe = None if stderr_tty else -1
        command = COMMAND + (["--machine"] if engine == "machine" else [])
        self.process = subprocess.Popen(
            command,
            cwd=HERE,
            stdin=stdin[0],
            stdout=subprocess.PIPE,
            stderr=stderr[0],
            env={**os.environ, "TERM": "xterm-256color", "NO_COLOR": "1", "LANG": "C.UTF-8"},
            start_new_session=True,
        )
        if self.stderr_pipe is not None:
            self.stderr_pipe = self.process.stderr.fileno()
        if self.stdin_master is not None:
            self._size(self.stdin_master, width)
        if self.stderr_master is not None and self.stderr_master != self.stdin_master:
            self._size(self.stderr_master, width)

    def _channel(self, is_tty, name):
        if not is_tty:
            return (subprocess.PIPE, None)
        master, slave = pty.openpty()
        self.masters.append(master)
        self.slaves.append(slave)
        fcntl_set_nonblocking(master)
        return (slave, master)

    @staticmethod
    def _size(fd, width):
        import fcntl
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 24, width, 0, 0))

    def snapshot_descendants(self):
        # Keep PIDs before a parent-only signal can reparent a detached Bun
        # child. Cleanup uses only PIDs observed below this owned launcher.
        snapshot = subprocess.run(
            ["ps", "-axo", "pid=,ppid="], capture_output=True, text=True, timeout=0.5, check=True
        ).stdout
        children = {}
        for row in snapshot.splitlines():
            fields = row.split()
            if len(fields) == 2:
                pid, ppid = map(int, fields)
                children.setdefault(ppid, []).append(pid)
        frontier = [self.process.pid]
        while frontier:
            parent = frontier.pop()
            for child in children.get(parent, []):
                if child not in self.descendant_pids:
                    self.descendant_pids.add(child)
                    frontier.append(child)

    def _read_ready(self, wait=0.05):
        fds = [
            fd
            for fd in (self.stderr_master, self.stderr_pipe, self.process.stdout.fileno())
            if fd is not None
        ]
        ready, _, _ = select.select(fds, [], [], max(0, min(wait, self.deadline - time.monotonic())))
        for fd in ready:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                chunk = b""
            if fd == self.stderr_master:
                self.terminal_data.extend(chunk)
            elif fd == self.stderr_pipe:
                self.stderr_data.extend(chunk)
            elif chunk:
                self.stdout_data.extend(chunk)

    def until(self, marker, timeout=None, start=0):
        stop = min(self.deadline, time.monotonic() + (timeout or CASE_SECONDS))
        while marker not in self.terminal_data[start:] and time.monotonic() < stop:
            self._read_ready(min(0.05, stop - time.monotonic()))
            if self.process.poll() is not None:
                break
        return marker in self.terminal_data[start:]

    def raw(self, timeout=1.0):
        slave = self.stdin_slave
        if slave is None:
            return False
        stop = min(self.deadline, time.monotonic() + timeout)
        while time.monotonic() < stop:
            try:
                attrs = termios.tcgetattr(slave)
                if not attrs[3] & termios.ICANON and not attrs[3] & termios.ECHO:
                    return True
            except OSError:
                return False
            self._read_ready(0.02)
        return False

    def send(self, data):
        if self.stdin_master is None:
            raise AssertionError(f"{self.name}: no interactive PTY stdin")
        os.write(self.stdin_master, data)

    def finish(self, expected_phase=None):
        if not self.until(b"RESULT ", timeout=2.0):
            raise AssertionError(self.diag("durable RESULT transcript did not arrive"))
        remaining = max(0.05, min(2.0, self.deadline - time.monotonic()))
        try:
            out, _ = self.process.communicate(timeout=remaining)
            self.stdout_data.extend(out or b"")
        except subprocess.TimeoutExpired:
            raise AssertionError(self.diag("launcher did not exit after RESULT"))
        if self.process.returncode != 0:
            raise AssertionError(self.diag(f"normal interaction exit code is {self.process.returncode}, expected 0"))
        result = json.loads(bytes(self.stdout_data).decode("utf-8"))
        plain = ANSI.sub(b"", bytes(self.terminal_data))
        if self.before is not None and self.stdin_slave is not None:
            after = termios.tcgetattr(self.stdin_slave)
            if after is not None and after != self.before:
                raise AssertionError(self.diag("PTY termios mode differs after normal exit"))
        if SECRET.encode() in self.terminal_data or SECRET.encode() in self.stdout_data:
            raise AssertionError(self.diag("synthetic hidden input leaked to an output channel"))
        if not plain.rstrip().endswith(b"RESULT " + json.dumps(result, separators=(",", ":")).encode()):
            # JSON property spacing is stable in Bun, but only the RESULT record
            # and readable final line are contractual for this probe.
            if b"RESULT {\"phase\":" not in plain:
                raise AssertionError(self.diag("plain final transcript is not readable"))
        if b"Setup:" not in plain or b"Next:" not in plain:
            raise AssertionError(self.diag("durable readiness and next-step text are missing from the final transcript"))
        if expected_phase and result.get("phase") != expected_phase:
            raise AssertionError(self.diag(f"expected phase {expected_phase}, got {result.get('phase')}"))
        return result, safe_text(plain[-700:])

    def diag(self, expectation):
        tail = safe_text(bytes(self.terminal_data[-500:]))
        return f"{self.name}: expected {expectation}; exit={self.process.poll()}; terminal tail={tail!r}"

    def cleanup(self):
        # The node launcher can exit while its Bun child survives. Always
        # address the owned group and any detached descendant, even when
        # Popen's leader already exited.
        for pid in sorted(self.descendant_pids, reverse=True):
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        try:
            os.killpg(self.process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        if self.process.poll() is None:
            try:
                self.process.communicate(timeout=0.5)
            except subprocess.TimeoutExpired:
                pass
        for fd in self.masters + self.slaves:
            try:
                os.close(fd)
            except OSError:
                pass
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if stream is not None and not stream.closed:
                stream.close()


def fcntl_set_nonblocking(fd):
    import fcntl
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def record(name, fn):
    try:
        detail = fn()
        results.append({"name": name, "ok": True, **detail})
    except Exception as error:
        failures.append(str(error))
        results.append({"name": name, "ok": False, "failure": safe_text(str(error))})


def make(name, **kwargs):
    return Console(name, **kwargs)


def await_initial(c):
    assert c.until(b"0 selected"), c.diag("initial selection prompt")
    assert c.raw(), c.diag("initial prompt enters raw/no-echo mode")
    c.snapshot_descendants()


def initial(c, select=b"\x1b[B\x1b[B \r"):
    await_initial(c)
    c.send(select)
    return c


def to_hidden(c):
    initial(c)
    assert c.until(b"Preview Claude hooks"), c.diag("Claude hook approval prompt")
    assert c.raw(), c.diag("hook approval enters raw/no-echo mode")
    c.send(b"\x1b[B\r")
    assert c.until(b"Where should the credential"), c.diag("credential destination prompt")
    assert c.raw(), c.diag("destination prompt enters raw/no-echo mode")
    c.send(b"\r")
    assert c.until(b"Save fake key"), c.diag("save approval prompt")
    assert c.raw(), c.diag("save approval enters raw/no-echo mode")
    c.send(b"\x1b[B\r")
    assert c.until(b"Enter a FAKE key"), c.diag("hidden input prompt")
    assert c.raw(), c.diag("hidden prompt enters raw/no-echo mode")
    return c


def idle_control(name, data):
    c = make(name)
    try:
        await_initial(c)
        c.send(data)
        result, transcript = c.finish("Cancelled")
        return {"phase": result["phase"], "restored": True, "finalTranscript": "RESULT" in transcript}
    finally:
        c.cleanup()


def hidden_abort(name, data, engine="reducer"):
    c = make(name, engine=engine)
    try:
        to_hidden(c)
        c.send(data)
        result, transcript = c.finish("Cancelled")
        return {"phase": result["phase"], "markerAbsent": True, "finalTranscript": "RESULT" in transcript}
    finally:
        c.cleanup()


def hidden_multibyte():
    c = make("hidden-multibyte-narrow", width=12)
    try:
        to_hidden(c)
        c.send(SECRET.encode() + b"\r")
        assert c.until(b"Run one separately consented key check"), c.diag("check consent after save")
        assert c.raw(), c.diag("check prompt enters raw/no-echo mode")
        c.send(b"\r")
        result, transcript = c.finish("Done")
        return {"phase": result["phase"], "width": 12, "markerAbsent": True, "finalTranscript": "RESULT" in transcript}
    finally:
        c.cleanup()


def escape_and_back():
    c = make("escape-and-back")
    try:
        initial(c)
        assert c.until(b"Preview Claude hooks"), c.diag("hook prompt")
        assert c.raw(), c.diag("hook prompt enters raw mode")
        start = len(c.terminal_data)
        c.send(b"\x1b")
        assert c.until(b"Select agents", start=start), c.diag("Escape returns to agent selection")
        assert c.raw(), c.diag("returned selection active")
        c.send(b"\x04")
        result, transcript = c.finish("Cancelled")
        assert result.get("results", {}).get("Claude") != "complete", c.diag("Escape must not approve")
        return {"phase": result["phase"], "escapeBack": True}
    finally:
        c.cleanup()


def typeahead_boundary(engine="reducer"):
    name = "typeahead-boundary" if engine == "reducer" else f"{engine}-typeahead-boundary"
    c = make(name, engine=engine)
    try:
        initial(c)
        assert c.until(b"Preview Claude hooks"), c.diag("hook approval prompt")
        assert c.raw(), c.diag("hook prompt accepts input")
        # The first Enter declines hooks. Buffered arrow/Enter would select a
        # destination on the next screen if input escaped its prompt scope.
        c.send(b"\r\x1b[B\r")
        assert c.until(b"Where should the credential"), c.diag("default decline reaches destination")
        c._read_ready(0.08)
        assert b'"phase":"SaveApproval"' not in c.terminal_data, c.diag("typeahead must not select a new destination")
        assert b'"phase":"Applying"' not in c.terminal_data, c.diag("typeahead must not approve hooks")
        assert c.raw(), c.diag("destination prompt enters raw mode")
        c.send(b"\x04")
        result, transcript = c.finish("Cancelled")
        return {"phase": result["phase"], "approvalLeakedAcrossPrompt": False, "destinationLeakedAcrossPrompt": False, "finalTranscript": "RESULT" in transcript}
    finally:
        c.cleanup()


def selection_bindings(engine="reducer", empty=False):
    c = make(f"{engine}-guarded-continue-{empty}", engine=engine)
    try:
        await_initial(c)
        start = len(c.terminal_data)
        c.send(b"\r")
        assert c.until(b"Select at least one agent.", start=start), c.diag("empty Enter warns")
        assert b"Preview " not in c.terminal_data and b"RESULT " not in c.terminal_data, c.diag("empty Enter stays")
        assert b"Inverse" not in c.terminal_data, c.diag("inverse selection removed")
        assert c.raw(), c.diag("selection stays active")
        c.send(b"\x1b[B ")
        assert c.until(b"3 selected"), c.diag("Space selects all")
        assert c.raw(), c.diag("selection stays active")
        if empty:
            start = len(c.terminal_data)
            c.send(b" \r")
            assert c.until(b"Select at least one agent.", start=start), c.diag("clear all guards Enter")
            assert c.raw(), c.diag("selection stays active")
            c.send(b"\x1b")
            result, transcript = c.finish("Cancelled")
            assert result["hosts"] == [], c.diag("Escape does not submit selection")
        else:
            c.send(b"\r")
            assert c.until(b"Preview Claude hooks"), c.diag("Enter continues selection")
            assert c.raw(), c.diag("hook prompt active")
            c.send(b"\x04")
            result, transcript = c.finish("Cancelled")
            assert result["hosts"] == ["Claude", "Codex", "Pi"], c.diag("Enter retains selection")
        return {"phase": result["phase"], "emptyEnterGuarded": True, "spaceSelects": True, "escapeExits": True}
    finally:
        c.cleanup()


def back_from_save_approval(engine="reducer"):
    name = "back-from-save-approval" if engine == "reducer" else f"{engine}-back-from-save-approval"
    c = make(name, engine=engine)
    try:
        initial(c)
        assert c.until(b"Preview Claude hooks"), c.diag("hook prompt")
        assert c.raw(), c.diag("hook prompt enters raw mode")
        c.send(b"\x1b[B\r")
        assert c.until(b"Where should the credential"), c.diag("destination prompt")
        assert c.raw(), c.diag("destination prompt enters raw mode")
        c.send(b"\r")
        assert c.until(b"Save fake key"), c.diag("save approval prompt")
        assert c.raw(), c.diag("save approval prompt enters raw mode")
        back_start = len(c.terminal_data)
        c.send(b"\x1b[B\x1b[B\r")
        assert c.until(b"Where should the credential", start=back_start), c.diag("Back returns to destination")
        assert c.raw(), c.diag("returned destination prompt enters raw mode")
        # Skip, without initiating another save.
        c.send(b"\x1b[B\x1b[B\x1b[B\r")
        result, transcript = c.finish("Done")
        states = re.findall(rb"STATE (\{[^\r\n]+)", c.terminal_data)
        phases = [json.loads(item).get("phase") for item in states]
        if "Saving" in phases:
            raise AssertionError(c.diag("Back from save approval entered Saving"))
        if phases.count("Credential") < 2:
            raise AssertionError(c.diag("Back did not re-enter the destination state"))
        return {"phase": result["phase"], "backReturnedToCredential": True, "savingObserved": False, "finalTranscript": "RESULT" in transcript}
    finally:
        c.cleanup()


def back_to_agents(engine="reducer"):
    name = "back-to-agents" if engine == "reducer" else f"{engine}-back-to-agents"
    c = make(name, engine=engine)
    try:
        initial(c)
        assert c.until(b"Preview Claude hooks"), c.diag("initial hook prompt")
        assert c.raw(), c.diag("hook prompt enters raw mode")
        c.send(b"\r")  # Decline, the safe default.
        assert c.until(b"Where should the credential"), c.diag("credential prompt after decline")
        assert c.raw(), c.diag("credential prompt enters raw mode")
        selection_start = len(c.terminal_data)
        c.send(b"\x1b[B\x1b[B\x1b[B\x1b[B\r")  # Back to agents, after Skip.
        assert c.until(b"Select agents", start=selection_start), c.diag("Back returns to agent selection")
        assert c.raw(), c.diag("returned selection enters raw mode")
        hook_start = len(c.terminal_data)
        c.send(b"\r")
        assert c.until(b"Preview Claude hooks", start=hook_start), c.diag("previous agent selection remains available")
        c.send(b"\x04")
        result, transcript = c.finish("Cancelled")
        if result.get("hosts") != ["Claude"]:
            raise AssertionError(c.diag(f"Back to agents lost the prior selection: {result.get('hosts')}"))
        return {"phase": result["phase"], "priorSelectionRetained": True, "finalTranscript": "RESULT" in transcript}
    finally:
        c.cleanup()


def channel_rejection(name, stdin_tty, stderr_tty):
    c = make(name, stdin_tty=stdin_tty, stderr_tty=stderr_tty)
    try:
        stop = min(c.deadline, time.monotonic() + 2.0)
        while c.process.poll() is None and time.monotonic() < stop:
            c._read_ready(0.05)
        if c.process.poll() is None:
            raise AssertionError(c.diag("non-interactive channel combination was rejected promptly"))
        out, err = c.process.communicate(timeout=0.5)
        c.stdout_data.extend(out or b"")
        c.stderr_data.extend(err or b"")
        if c.process.returncode != 2 or c.stdout_data:
            raise AssertionError(c.diag(f"expected exit 2 and empty stdout, got exit={c.process.returncode}"))
        transcript = safe_text(bytes(c.terminal_data + c.stderr_data))
        if "requires interactive" not in transcript:
            raise AssertionError(c.diag("plain next-step explanation is missing"))
        return {"stdinTTY": stdin_tty, "stderrTTY": stderr_tty, "exit": 2, "stdoutEmpty": True}
    finally:
        c.cleanup()


def launcher_parent_signal_cleanup():
    c = make("launcher-parent-only-SIGTERM")
    try:
        await_initial(c)
        # Signal only the node launcher. A terminal-generated process-group
        # signal would also reach Bun and mask a launcher child leak.
        os.kill(c.process.pid, signal.SIGTERM)
        stop = min(c.deadline, time.monotonic() + 0.75)
        while c.process.poll() is None and time.monotonic() < stop:
            c._read_ready(0.03)
        if c.process.poll() is None:
            raise AssertionError(c.diag("node launcher exits after SIGTERM"))
        # stdout EOF proves the Bun writer also exited; a readable pipe may hold
        # buffered output, so drain it before checking EOF.
        stop = min(c.deadline, time.monotonic() + 0.5)
        eof = False
        while time.monotonic() < stop:
            c._read_ready(0.04)
            ready, _, _ = select.select([c.process.stdout.fileno()], [], [], 0)
            if ready:
                chunk = os.read(c.process.stdout.fileno(), 65536)
                if not chunk:
                    eof = True
                    break
                c.stdout_data.extend(chunk)
        if not eof:
            raise AssertionError(c.diag("node launcher reaps/exits its Bun child after parent-only SIGTERM; stdout pipe remained open"))
        if c.process.returncode != 0:
            raise AssertionError(c.diag(f"signal-forwarding launcher exit code is {c.process.returncode}, expected 0"))
        result = json.loads(bytes(c.stdout_data).decode("utf-8"))
        if result.get("phase") != "Cancelled":
            raise AssertionError(c.diag(f"forwarded signal produced phase {result.get('phase')}, expected Cancelled"))
        if c.stdin_slave is not None and termios.tcgetattr(c.stdin_slave) != c.before:
            raise AssertionError(c.diag("forwarded SIGTERM did not restore PTY mode"))
        plain = ANSI.sub(b"", bytes(c.terminal_data))
        if b"Setup:" not in plain or b"Next:" not in plain or b"RESULT " not in plain:
            raise AssertionError(c.diag("forwarded signal did not leave a readable final transcript"))
        return {"launcher": "node run.mjs cli.ts", "nodeExit": c.process.returncode, "childPipeEOF": True, "phase": result["phase"], "terminalRestored": True}
    finally:
        c.cleanup()


def signal_active_step(engine="reducer"):
    name = "signal-during-hook-step" if engine == "reducer" else f"{engine}-signal-during-hook-step"
    c = make(name, engine=engine)
    try:
        await_initial(c)
        c.send(b"\x1b[B\x1b[B \r")
        assert c.until(b"Preview Claude hooks"), c.diag("hook prompt before signal")
        assert c.raw(), c.diag("hook prompt is active before signal")
        os.killpg(c.process.pid, signal.SIGTERM)
        # The process-group signal reaches both node and Bun; Bun should still
        # run its prompt finalizer before the owned PTY goes away.
        if not c.until(b"RESULT ", timeout=1.2):
            stop = min(c.deadline, time.monotonic() + 0.3)
            while c.process.poll() is None and time.monotonic() < stop:
                c._read_ready(0.03)
            restored = c.stdin_slave is not None and termios.tcgetattr(c.stdin_slave) == c.before
            raise AssertionError(
                c.diag(
                    "process-group SIGTERM while a prompt is active produces a durable cancellation result; "
                    f"wrapperExit={c.process.poll()}, terminalRestored={restored}, stdout={safe_text(bytes(c.stdout_data))!r}"
                )
            )
        if c.stdin_slave is not None and termios.tcgetattr(c.stdin_slave) != c.before:
            raise AssertionError(c.diag("SIGTERM did not restore PTY termios mode"))
        return {"launcher": "node run.mjs cli.ts", "durableResult": True}
    finally:
        c.cleanup()


def selection_exit(engine, selected, explicit):
    c = make(f"{engine}-selection-exit-{selected}-{explicit}", engine=engine)
    try:
        await_initial(c)
        if selected:
            c.send(b"\x1b[B ")
            assert c.until(b"3 selected"), c.diag("selected before exit")
            assert c.raw(), c.diag("selection active")
        c.send(b"\x1b[F\r" if explicit else b"\x1b")
        result, transcript = c.finish("Cancelled")
        assert result["hosts"] == [] and result["results"] == {}, c.diag("Exit never submits draft selection")
        return {"phase": result["phase"], "draftSelectionDiscarded": True, "explicitExit": explicit}
    finally:
        c.cleanup()


def escape_navigation(engine):
    c = make(f"{engine}-escape-navigation", engine=engine)
    def go(keys, marker):
        assert c.raw(), c.diag("current menu active")
        start = len(c.terminal_data)
        c.send(keys)
        assert c.until(marker, start=start), c.diag("navigation destination")
    try:
        initial(c)
        assert c.until(b"Preview Claude hooks"), c.diag("hook preview")
        go(b"\x1b", b"Select agents")
        go(b"\r", b"Preview Claude hooks")
        go(b"\r", b"Where should the credential")
        go(b"\x1b", b"Select agents")
        go(b"\r", b"Preview Claude hooks")
        go(b"\r", b"Where should the credential")
        go(b"\r", b"Save fake key")
        go(b"\x1b", b"Where should the credential")
        go(b"\r", b"Save fake key")
        go(b"\x1b[B\r", b"Enter a FAKE key")
        go(b"SYNTHETIC_ESCAPE_TEST\r", b"Run one separately")
        go(b"\x1b", b"Where should the credential")
        assert c.raw(), c.diag("returned credential menu active")
        c.send(b"\x04")
        result, transcript = c.finish("Cancelled")
        assert result["credentialOutcome"] == "saved", c.diag("Back preserves saved outcome")
        return {"phase": result["phase"], "escapeBackMenus": ["Hooks", "Credential", "SaveApproval", "CheckApproval"]}
    finally:
        c.cleanup()


def run_all():
    for engine in ("reducer", "machine"):
        record(f"{engine}-escape-navigation", lambda engine=engine: escape_navigation(engine))
    for engine in ("reducer", "machine"):
        for selected in (False, True):
            for explicit in (False, True):
                record(f"{engine}-selection-exit-{selected}-{explicit}", lambda engine=engine, selected=selected, explicit=explicit: selection_exit(engine, selected, explicit))
    record("hidden-escape", lambda: hidden_abort("hidden-escape", b"\x1b"))
    record("machine-hidden-escape", lambda: hidden_abort("machine-hidden-escape", b"\x1b", "machine"))
    for engine in ("reducer", "machine"):
        for empty in (False, True):
            record(f"{engine}-guarded-continue-{empty}", lambda engine=engine, empty=empty: selection_bindings(engine, empty))
    record("idle-ctrl-d", lambda: idle_control("idle-ctrl-d", b"\x04"))
    record("idle-repeated-ctrl-d", lambda: idle_control("idle-repeated-ctrl-d", b"\x04\x04\x04"))
    record("hidden-ctrl-d", lambda: hidden_abort("hidden-ctrl-d", b"\x04"))
    record("hidden-ctrl-c", lambda: hidden_abort("hidden-ctrl-c", b"\x03"))
    record("machine-hidden-ctrl-d", lambda: hidden_abort("machine-hidden-ctrl-d", b"\x04", "machine"))
    record("hidden-multibyte-narrow", hidden_multibyte)
    record("escape-and-back", escape_and_back)
    record("back-from-save-approval", back_from_save_approval)
    record("machine-back-from-save-approval", lambda: back_from_save_approval("machine"))
    record("back-to-agents", back_to_agents)
    record("machine-back-to-agents", lambda: back_to_agents("machine"))
    record("typeahead-boundary", typeahead_boundary)
    record("machine-typeahead-boundary", lambda: typeahead_boundary("machine"))
    record("stdin-tty-stderr-pipe", lambda: channel_rejection("stdin-tty-stderr-pipe", True, False))
    record("stdin-pipe-stderr-tty", lambda: channel_rejection("stdin-pipe-stderr-tty", False, True))
    record("both-channels-pipe", lambda: channel_rejection("both-channels-pipe", False, False))
    record("signal-during-hook-step", signal_active_step)
    record("machine-signal-during-hook-step", lambda: signal_active_step("machine"))
    record("launcher-parent-only-SIGTERM", launcher_parent_signal_cleanup)
    print(json.dumps({"runner": "node run.mjs cli.ts" if not args.direct else "direct pinned Bun", "seconds": round(time.monotonic() - (SUITE_END - SUITE_SECONDS), 3), "budgetSeconds": SUITE_SECONDS, "results": results, "failures": failures}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(run_all())
