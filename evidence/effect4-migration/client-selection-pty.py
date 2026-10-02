"""Bounded Linux PTY evidence for native selector restoration; no credentials."""
import json
import os
from pathlib import Path
import pty
import select
import subprocess
import termios
import time

root = Path(__file__).resolve().parents[2]
program = '''import * as Effect from "./node_modules/effect/dist/Effect.js";
import {selectSetupClients} from "./src/onboarding/client-selection.ts";
const result = await Effect.runPromise(selectSetupClients([
{host:"claude",name:"Claude Code",status:"installed"},
{host:"codex",name:"Codex CLI",status:"not installed"}]));
console.log("SELECTION_RESULT="+JSON.stringify(result));
'''
results = []
for name, keys, expected in [("enter", b"\r", ["claude"]), ("escape", b"\x1b", [])]:
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    child = subprocess.Popen(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", program],
        cwd=root, stdin=slave, stdout=slave, stderr=slave,
    )
    output = b""
    deadline = time.monotonic() + 10
    try:
        while b"Unchecking a client keeps its existing installation." not in output:
            if time.monotonic() > deadline:
                raise RuntimeError("selector render deadline exceeded")
            if select.select([master], [], [], 0.1)[0]:
                output += os.read(master, 65536)
        os.write(master, keys)
        child.wait(timeout=5)
        while select.select([master], [], [], 0.1)[0]:
            output += os.read(master, 65536)
        restored = termios.tcgetattr(slave) == original
        marker = ("SELECTION_RESULT=" + json.dumps(expected, separators=(",", ":"))).encode()
        assert child.returncode == 0 and restored and marker in output
        results.append({"case": name, "exitCode": child.returncode,
                        "termiosRestored": restored, "selection": expected})
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)
        os.close(slave)
print(json.dumps({"platform": "Linux PTY", "cases": results}))
