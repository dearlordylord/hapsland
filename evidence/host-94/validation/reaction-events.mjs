// Reduces source-bearing host JSONL in memory to source-free native edit evidence.
// Unknown shapes are ignored, so a changed file alone never proves model reaction.
import { createHash } from 'node:crypto';

export const callKey = (salt, id) => typeof id === 'string' && id.length > 0
  ? createHash('sha256').update(`${salt}:${id}`).digest('hex') : null;

const target = value => typeof value === 'string' &&
  value.replaceAll('\\', '/').split('/').at(-1) === 'order-count.ts';
const initialInput = input => typeof input?.content === 'string' &&
  input.content.includes('type OrderCount = number');
const repairInput = input => (typeof input?.new_string === 'string' && input.new_string.includes('string')) ||
  (typeof input?.newString === 'string' && input.newString.includes('string')) ||
  (typeof input?.content === 'string' && input.content.includes('type OrderCount = string'));

export const nativeEditEvents = (host, line, observedAtMs, salt) => {
  let event;
  try { event = JSON.parse(line); } catch { return []; }
  if (host === 'claude') {
    if (event?.type !== 'assistant' || !Array.isArray(event?.message?.content)) return [];
    return event.message.content.flatMap(part => {
      if (part?.type !== 'tool_use' || !['Edit', 'Write'].includes(part.name) ||
        !target(part.input?.file_path)) return [];
      const key = callKey(salt, part.id);
      return key ? [{ key, tool: part.name, observedAtMs,
        initialInput: initialInput(part.input), repairInput: repairInput(part.input) }] : [];
    });
  }
  if (host !== 'opencode') return [];
  // OpenCode 1.x run JSON emits tool-use parts. Accept only attributed tool
  // parts; unrelated status/text/plugin messages cannot count as agent action.
  const part = event?.type === 'tool_use' ? event.part :
    event?.type === 'message.part.updated' ? event.properties?.part : undefined;
  if (part?.type !== 'tool' || !['edit', 'write'].includes(part.tool) ||
    !target(part.state?.input?.filePath) || typeof part.messageID !== 'string') return [];
  const key = callKey(salt, part.callID);
  return key ? [{ key, tool: part.tool, observedAtMs,
    initialInput: initialInput(part.state.input), repairInput: repairInput(part.state.input) }] : [];
};

export const reactionEvidence = ({ host, nativeEvents, hookEvents, finalRepairObserved,
  externalStaleMutation, scenario }) => {
  const submitted = hookEvents.find(e => e.findingSubmitted && typeof e.key === 'string' &&
    e.key.length > 0 && typeof e.tool === 'string' && e.tool.length > 0 &&
    Number.isFinite(e.finishedAtMs) && nativeEvents.some(n => n.key === e.key &&
      n.tool === e.tool && n.initialInput && Number.isFinite(n.observedAtMs) &&
      e.finishedAtMs > n.observedAtMs));
  const initiating = submitted && nativeEvents.find(e => e.key === submitted.key &&
    e.tool === submitted.tool && e.initialInput && e.observedAtMs < submitted.finishedAtMs);
  const later = submitted && initiating && nativeEvents.find(e => e.key !== submitted.key &&
    e.observedAtMs >= submitted.finishedAtMs && e.repairInput &&
    hookEvents.some(h => h.key === e.key && h.tool === e.tool && h.ok === true &&
      h.finishedAtMs >= e.observedAtMs));
  const observed = scenario === 'finding' && Boolean(submitted && initiating && later &&
    finalRepairObserved && !externalStaleMutation);
  return {
    status: observed ? 'observed-native-repair-after-advice' : 'unproven',
    initiatingNativeEditMatched: Boolean(initiating),
    laterNativeRepairMatched: Boolean(later),
    // Relative to process launch; no host or source identifiers are retained.
    submissionAtMs: submitted?.finishedAtMs ?? null,
    repairToolAtMs: later?.observedAtMs ?? null,
    elapsedSubmissionToRepairToolMs: later ? later.observedAtMs - submitted.finishedAtMs : null,
    parser: host === 'claude' ? 'claude-assistant-tool-use' : 'opencode-tool-use-part',
  };
};
