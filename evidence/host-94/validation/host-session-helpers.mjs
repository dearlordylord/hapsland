export const HOST_TERMINATION_GRACE_MS = 1_000;
export const HOST_KILL_WAIT_MS = 1_000;

export const HOST_VERSIONS = Object.freeze({ claude: '2.1.218', opencode: '1.14.44' });

const CLAUDE_EVENT_TYPES = new Set(['system', 'assistant', 'user', 'result', 'stream_event']);
const CLAUDE_RESULT_SUBTYPES = new Set([
  'success', 'error_during_execution', 'error_max_turns', 'error_max_budget_usd',
  'error_max_structured_output_retries', 'error_max_session_turns',
]);
const CLAUDE_NATIVE_TOOLS = new Map([['Read', 'read'], ['Edit', 'edit'], ['Write', 'write']]);

export function createClaudeStreamDiagnostics() {
  const summary = {
    eventTypeCounts: { system: 0, assistant: 0, user: 0, result: 0, stream_event: 0, unknown: 0 },
    resultSubtypeCounts: { success: 0, error_during_execution: 0, error_max_turns: 0,
      error_max_budget_usd: 0, error_max_structured_output_retries: 0,
      error_max_session_turns: 0, unknown: 0 },
    resultIsError: null,
    assistantNativeToolCounts: { read: 0, edit: 0, write: 0, unknown: 0 },
    parseFailureCount: 0,
    firstEventAtMs: null,
    lastEventAtMs: null,
  };
  return {
    observe(line, observedAtMs) {
      let event;
      try { event = JSON.parse(line); }
      catch { summary.parseFailureCount++; return; }
      const type = event !== null && typeof event === 'object' &&
        CLAUDE_EVENT_TYPES.has(event.type) ? event.type : 'unknown';
      summary.eventTypeCounts[type]++;
      if (Number.isFinite(observedAtMs) && observedAtMs >= 0) {
        if (summary.firstEventAtMs === null) summary.firstEventAtMs = observedAtMs;
        summary.lastEventAtMs = observedAtMs;
      }
      if (type === 'result') {
        const subtype = CLAUDE_RESULT_SUBTYPES.has(event.subtype) ? event.subtype : 'unknown';
        summary.resultSubtypeCounts[subtype]++;
        summary.resultIsError = typeof event.is_error === 'boolean' ? event.is_error : null;
      }
      if (type === 'assistant' && Array.isArray(event.message?.content)) {
        for (const part of event.message.content) {
          if (part?.type !== 'tool_use') continue;
          const category = CLAUDE_NATIVE_TOOLS.get(part.name) ?? 'unknown';
          summary.assistantNativeToolCounts[category]++;
        }
      }
    },
    snapshot() { return structuredClone(summary); },
  };
}

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
