export const HOST_TERMINATION_GRACE_MS = 1_000;
export const HOST_KILL_WAIT_MS = 1_000;

export const HOST_VERSIONS = Object.freeze({ claude: '2.1.218', opencode: '1.14.44' });

export function matchesKnownHostVersion(host, output) {
  const version = HOST_VERSIONS[host];
  const expectedOutput = host === 'claude' ? `${version} (Claude Code)` : version;
  return typeof output === 'string' && output.trim() === expectedOutput;
}

export function manageChildProcess(child, {
  terminationGraceMs = HOST_TERMINATION_GRACE_MS,
  killWaitMs = HOST_KILL_WAIT_MS,
} = {}) {
  let settled = false;
  let terminationRequested = false;
  let escalationTimer;
  let fallbackTimer;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });

  const settle = result => {
    if (settled) return;
    settled = true;
    clearTimeout(escalationTimer);
    clearTimeout(fallbackTimer);
    resolveClosed(result);
  };

  child.once('close', (code, signal) => settle({ code, signal, forcedClose: false }));
  child.once('error', error => settle({ code: null, signal: null, error, forcedClose: false }));

  const terminate = () => {
    if (settled || terminationRequested) return;
    terminationRequested = true;
    try { child.kill('SIGTERM'); } catch { /* escalation below still runs */ }
    escalationTimer = setTimeout(() => {
      if (settled) return;
      try { child.kill('SIGKILL'); } catch { /* bounded fallback still runs */ }
      fallbackTimer = setTimeout(() => {
        if (settled) return;
        child.stdout?.destroy?.();
        child.stderr?.destroy?.();
        settle({ code: child.exitCode ?? null, signal: child.signalCode ?? null, forcedClose: true });
      }, killWaitMs);
    }, terminationGraceMs);
  };

  return { closed, terminate, get settled() { return settled; } };
}
