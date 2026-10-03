import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

type Context = { cwd: string; sessionManager: { getSessionId(): string } };
type Event = Record<string, any>;
type Handler = (event: Event, context: Context) => Promise<unknown>;
type ExtensionAPI = { on(name: string, handler: Handler): unknown };
type Identity = { cwd: string; session_id: string; tool_use_id: string; host_version: "1.0.0"; tool_name: string };
type Options = { command?: readonly string[]; env?: NodeJS.ProcessEnv };
// Sixfold JSON escaping of both bounded native evidence inputs fits this command envelope.
const MAX_PI_COMMAND_BYTES = 4 * 1_024 * 1_024;
const encode = (value: unknown, maximumBytes: number): string | undefined => {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" && Buffer.byteLength(text) <= maximumBytes ? text : undefined;
  } catch { return undefined; }
};
const digest = (value: unknown): string | undefined => {
  const encoded = encode(value, MAX_PI_COMMAND_BYTES);
  return encoded === undefined ? undefined : createHash("sha256").update(encoded).digest("hex");
};
const nativeContentItem = (item: unknown): boolean => {
  if (item === null || typeof item !== "object") return false;
  const content = item as Event;
  switch (content.type) {
    case "text": return typeof content.text === "string";
    case "image": return typeof content.data === "string" && typeof content.mimeType === "string";
    default: return false;
  }
};
const nativeOutput = (event: Event): Event | undefined => {
  try {
    if (!Array.isArray(event.content)) return undefined;
    const valid = event.content.every(nativeContentItem);
    if (!valid) return undefined;
    const output = { content: [...event.content], ...(event.structuredContent === undefined ? {} : { structuredContent: event.structuredContent }) };
    return output;
  } catch { return undefined; }
};
const identity = (ctx: Context, tool: string, id: string): Identity => ({ cwd: ctx.cwd, session_id: ctx.sessionManager.getSessionId(), tool_use_id: id, host_version: "1.0.0", tool_name: tool });
const partition = (id: Identity): string => `${id.cwd}\0${id.session_id}`;
const supported = (event: Event): boolean => event.toolName === "edit" && typeof event.toolCallId === "string" && event.toolCallId.length > 0 && event.parentToolCallId === undefined && event.agent_id === undefined;

/** Hooks use one bounded command call; source and review state belong to the resident. */
const command = (options: Options, value: unknown): Promise<Event> => {
  const input = encode(value, MAX_PI_COMMAND_BYTES);
  if (input === undefined) return Promise.resolve({ status: "unavailable" });
  return new Promise(resolve => {
  const env = { ...process.env, ...options.env };
  const argv = options.command ?? [fileURLToPath(new URL("../../bin/launch.sh", import.meta.url))];
  const args = [...argv.slice(1), "--pi-hook", ...(env.REVIEW_CONTROL_JSON === undefined ? [] : ["--controlled-reviewer"])];
  const child = spawn(argv[0]!, args, { env, stdio: ["pipe", "pipe", "ignore"] });
  let output = "";
  let settled = false;
  const finish = (result: Event) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
  const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ status: "unavailable" }); }, 7_000);
  child.stdout.on("data", (data: Buffer) => { output += data.toString(); if (output.length > 262_144) { child.kill(); finish({ status: "unavailable" }); } });
  child.on("error", () => finish({ status: "unavailable" }));
  child.on("close", code => { try { finish(code === 0 ? JSON.parse(output) : { status: "unavailable" }); } catch { finish({ status: "unavailable" }); } });
  child.stdin.on("error", () => finish({ status: "unavailable" }));
  child.stdin.end(input);
  });
};

export const createPiExtension = (options: Options = {}) => (api: ExtensionAPI): void => {
  // Source-free argument digest and originating identity only; expires and never stores edits or findings.
  const calls = new Map<string, { id: Identity; input: string; expires: number }>();
  const partitions = new Map<string, Identity>();
  let epoch = 0;
  let boundary: { id: Identity; generation: number } | undefined;
  let active: { id: Identity; generation: number } | undefined;
  const send = (id: Identity, operation: string, fields: Event = {}) => command(options, { ...id, operation, ...fields });
  const prune = () => { for (const [key, call] of calls) if (call.expires <= Date.now()) calls.delete(key); };
  api.on("agent_start", async (_event, ctx) => {
    active = { id: identity(ctx, "finish", randomUUID()), generation: epoch };
  });
  const registerCall = async (id: Identity, key: string, fingerprint: string) => {
    const generation = epoch;
    const result = await send(id, "before");
    if (result.status !== "registered") return;
    if (generation !== epoch) { await send(id, "retire"); return; }
    calls.set(key, { id, input: fingerprint, expires: Date.now() + 30_000 });
    partitions.set(partition(id), id);
  };
  const acknowledgeOffer = async (id: Identity, result: Event, output: Event, generation: number, fields: Event = {}) => {
    // This ack proves our native handler offered these bytes; later handlers may replace them.
    await send(id, "ack", { token: result.token, lifetime: result.lifetime, ...fields });
    if (generation !== epoch) return;
    return output;
  };
  const editOffer = async (id: Identity, event: Event, original: Event) => {
    const generation = epoch;
    const result = await send(id, "edit", { input: event.input, details: event.details, isError: false });
    if (["incomplete", "unavailable"].includes(result.status)) await send(id, "retire");
    if (result.status !== "advice" || generation !== epoch || typeof result.text !== "string") return;
    const output = { ...original, content: [...original.content, { type: "text", text: result.text }] };
    return acknowledgeOffer(id, result, output, generation);
  };
  const finishOffer = async (id: Identity, event: Event, entries: unknown[], generation: number) => {
    // Pi rebuilds canContinue after our entry: an initial assistant-only preview is false.
    const result = await send(id, "finish");
    if (result.status !== "advice" || generation !== epoch || typeof result.text !== "string") return;
    const output = { entries: [...entries, { type: "custom_message", customType: "hapsland", content: result.text, display: false }], continue: event.continue || result.continued };
    return acknowledgeOffer(id, result, output, generation, { stopToken: result.stopToken, continued: result.continued });
  };
  api.on("tool_call", async (event, ctx) => {
    prune();
    if (!supported(event) || calls.size >= 64) return;
    const fingerprint = digest(event.input);
    if (fingerprint === undefined) return;
    const id = identity(ctx, event.toolName, event.toolCallId);
    const key = `${partition(id)}\0${id.tool_use_id}`;
    if (calls.has(key)) return;
    await registerCall(id, key, fingerprint);
  });
  api.on("tool_result", async (event, ctx) => {
    prune();
    if (!supported(event)) return;
    const incoming = identity(ctx, event.toolName, event.toolCallId);
    const key = `${partition(incoming)}\0${incoming.tool_use_id}`;
    const call = calls.get(key);
    if (call === undefined) return;
    calls.delete(key);
    const original = nativeOutput(event);
    if (event.isError !== false || call.input !== digest(event.input) || original === undefined) { await send(call.id, "retire"); return; }
    return editOffer(call.id, event, original);
  });
  api.on("agent_before_settle", async (event, ctx) => {
    if (!Array.isArray(event.entries)) return;
    const entries = [...event.entries];
    const id = identity(ctx, "finish", randomUUID());
    const generation = epoch;
    boundary = { id, generation };
    if (event.outcome !== "completed") { await send(id, "close"); return; }
    return finishOffer(id, event, entries, generation);
  });
  const cleanup = async () => {
    epoch++;
    boundary = undefined;
    active = undefined;
    const ownedCalls = [...calls.values()]; calls.clear();
    const ownedPartitions = [...partitions.values()]; partitions.clear();
    await Promise.all(ownedCalls.map(call => send(call.id, "retire")));
    await Promise.all(ownedPartitions.map(id => send(id, "close")));
  };
  api.on("session_before_switch", cleanup);
  api.on("session_shutdown", cleanup);
  const retirePartition = async (id: Identity) => {
    const target = partition(id);
    const ownedCalls: Identity[] = [];
    for (const [key, call] of calls) {
      if (partition(call.id) !== target) continue;
      calls.delete(key);
      ownedCalls.push(call.id);
    }
    partitions.delete(target);
    await Promise.all(ownedCalls.map(call => send(call, "retire")));
    await send(id, "close");
  };
  api.on("agent_settled", async () => {
    const origin = boundary ?? active; boundary = undefined; active = undefined;
    if (origin === undefined || origin.generation !== epoch) return;
    epoch++;
    await retirePartition(origin.id);
  });
};
export default createPiExtension();
