// Classify only known Hapsland handoff lines. Callers retain the booleans, not
// the hook context, which can contain source or model-authored text.
const SYNTHETIC_RULE_ID = 'r6_bare_domain_value';
const probability = '(?:0\\.\\d{2}|1\\.00)';
const findingLine = new RegExp(
  `^.* :: .+ \\[${SYNTHETIC_RULE_ID}, p=${probability}\\]: .*$`,
);

const operationalNotice = new RegExp(
  '^Operational notice: (?:' +
    'review capacity was unavailable; some eligible edits were not reviewed\\.|' +
    'the saved review credential was unavailable; run hapsland --login in a user terminal to unlock or approve native access, then retry\\. Background hooks never prompt\\.|' +
    'Jev was unavailable; some eligible edits were not reviewed\\.)' +
    '(?: \\(1 similar failure was suppressed\\.\\)| \\((?:[2-9]|[1-9][0-9]+) similar failures were suppressed\\.\\))?$',
);

const classifyContext = context => {
  const lines = context.split(/\r?\n/);
  return {
    findingSubmitted: lines.some(line => findingLine.test(line)),
    noticeSubmitted: lines.some(line => operationalNotice.test(line)),
  };
};

/**
 * Classify a completed controlled hook invocation without retaining its text.
 * Claude emits a PostToolUse JSON envelope; OpenCode emits plain context text.
 */
export const classifyHookResult = input => {
  const neither = { findingSubmitted: false, noticeSubmitted: false, blockFindingSubmitted: false };
  const { host, status, stdout } = input ?? {};
  if (status !== 0 || typeof stdout !== 'string') return neither;

  if (host === 'claude') {
    let output;
    try { output = JSON.parse(stdout); } catch { return neither; }
    if (output?.decision === 'block' && output.hookSpecificOutput !== undefined) return neither;
    if (output?.decision === 'block' && typeof output.reason === 'string' &&
      output.hookSpecificOutput === undefined) {
      const classified = classifyContext(output.reason);
      return { ...classified, blockFindingSubmitted: classified.findingSubmitted };
    }
    const hook = output?.hookSpecificOutput;
    if (hook?.hookEventName !== 'PostToolUse' || typeof hook.additionalContext !== 'string') return neither;
    return { ...classifyContext(hook.additionalContext), blockFindingSubmitted: false };
  }

  if (host === 'opencode') {
    const context = stdout.trim();
    // This host path emits context directly. JSON-looking output is an unknown
    // plugin/CLI result and must not be interpreted as a handoff.
    if (context.length === 0 || context.startsWith('{') || context.startsWith('[')) return neither;
    return { ...classifyContext(context), blockFindingSubmitted: false };
  }

  return neither;
};
