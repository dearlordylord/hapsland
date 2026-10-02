"""Bounded native masked-input PTY evidence with synthetic text, no credential persistence."""
import json
import os
from pathlib import Path
import pty
import select
import signal
import fcntl
import subprocess
import termios
import time

root = Path(__file__).resolve().parents[2]
program = '''import * as Effect from "./node_modules/effect/dist/Effect.js";
import {readMaskedCredential} from "./src/credentials/masked-input.ts";
const result = await Effect.runPromise(readMaskedCredential().pipe(Effect.result));
console.log("MASKED_RESULT="+JSON.stringify(result._tag === "Success"
  ? {success: result.success === "synthetic-no-secret"}
  : {cancelled: result.failure.message === "credential input cancelled"}));
'''
def controlling_terminal():
    os.setsid()
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)
results = []
for name, keys, expected in [("enter", b"synthetic-no-secret\n", {"success": True}), ("signal", None, {"cancelled": True})]:
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    child = subprocess.Popen(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", program],
        cwd=root, stdin=slave, stdout=slave, stderr=slave, preexec_fn=controlling_terminal,
    )
    output = b""
    deadline = time.monotonic() + 10
    try:
        while b"Jev API key: " not in output:
            if time.monotonic() > deadline:
                raise RuntimeError("masked input prompt deadline exceeded")
            if select.select([master], [], [], 0.1)[0]:
                output += os.read(master, 65536)
        if keys is None:
            child.send_signal(signal.SIGTERM)
        else:
            os.write(master, keys)
        child.wait(timeout=5)
        while select.select([master], [], [], 0.1)[0]:
            output += os.read(master, 65536)
        restored = termios.tcgetattr(slave) == original
        marker = ("MASKED_RESULT=" + json.dumps(expected, separators=(",", ":"))).encode()
        assert child.returncode == 0 and restored and marker in output
        results.append({"case": name, "exitCode": child.returncode,
                        "termiosRestored": restored, "result": expected})
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)
        os.close(slave)
print(json.dumps({"platform": "Linux PTY", "cases": results}))
