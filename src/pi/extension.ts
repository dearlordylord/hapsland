import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

type Context = { cwd: string; sessionManager: { getSessionId(): string } };
type Event = Record<string, any>;
type Handler = (event: Event, context: Context) => Promise<unknown>;
type ExtensionAPI = { on(name: string, handler: Handler): unknown };
type Identity = { cwd: string; session_id: string; tool_use_id: string; host_version: "1.0.0"; tool_name: string };
type Options = { command?: readonly string[]; env?: NodeJS.ProcessEnv };
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identity = (ctx: Context, tool: string, id: string): Identity => ({ cwd: ctx.cwd, session_id: ctx.sessionManager.getSessionId(), tool_use_id: id, host_version: "1.0.0", tool_name: tool });
const partition = (id: Identity): string => `${id.cwd}\0${id.session_id}`;
const supported = (event: Event): boolean => event.toolName === "edit" && typeof event.toolCallId === "string" && event.toolCallId.length > 0 && event.parentToolCallId === undefined && event.agent_id === undefined;

/** Hooks use one bounded command call; source and review state belong to the resident. */
const command = (options: Options, value: unknown): Promise<Event> => new Promise(resolve => {
  const env = { ...process.env, ...options.env };
  const argv = options.command ?? [process.execPath, fileURLToPath(new URL("../cli.js", import.meta.url))];
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
  child.stdin.end(JSON.stringify(value));
});

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
  api.on("tool_call", async (event, ctx) => {
    prune();
    if (!supported(event) || calls.size >= 64) return;
    const id = identity(ctx, event.toolName, event.toolCallId);
    const key = `${partition(id)}\0${id.tool_use_id}`;
    if (calls.has(key)) return;
    const generation = epoch;
    const result = await send(id, "before");
    if (result.status !== "registered" || generation !== epoch) { if (result.status === "registered") await send(id, "retire"); return; }
    calls.set(key, { id, input: digest(event.input), expires: Date.now() + 30_000 });
    partitions.set(partition(id), id);
  });
  api.on("tool_result", async (event, ctx) => {
    prune();
    if (!supported(event)) return;
    const incoming = identity(ctx, event.toolName, event.toolCallId);
    const key = `${partition(incoming)}\0${incoming.tool_use_id}`;
    const call = calls.get(key);
    if (call === undefined) return;
    calls.delete(key);
    if (event.isError !== false || call.input !== digest(event.input)) { await send(call.id, "retire"); return; }
    const generation = epoch;
    const result = await send(call.id, "edit", { input: event.input, details: event.details, isError: false });
    if (result.status !== "advice" || generation !== epoch) { if (result.status === "incomplete") await send(call.id, "retire"); return; }
    // This ack proves our native handler offered these bytes; later handlers may replace them.
    await send(call.id, "ack", { token: result.token, lifetime: result.lifetime });
    if (generation !== epoch) return;
    return { content: [...event.content, { type: "text", text: result.text }], ...(event.structuredContent === undefined ? {} : { structuredContent: event.structuredContent }) };
  });
  api.on("agent_before_settle", async (event, ctx) => {
    const id = identity(ctx, "finish", randomUUID());
    const generation = epoch;
    boundary = { id, generation };
    if (event.outcome !== "completed") { await send(id, "close"); return; }
    // Pi rebuilds canContinue after our entry: an initial assistant-only preview is false.
    const result = await send(id, "finish");
    if (result.status !== "advice" || generation !== epoch) return;
    await send(id, "ack", { token: result.token, lifetime: result.lifetime, stopToken: result.stopToken, continued: result.continued });
    if (generation !== epoch) return;
    return { entries: [...event.entries, { type: "custom_message", customType: "hapsland", content: result.text, display: false }], continue: event.continue || result.continued };
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
  api.on("agent_settled", async () => {
    const origin = boundary ?? active; boundary = undefined; active = undefined;
    if (origin !== undefined && origin.generation === epoch) await send(origin.id, "close");
  });
};
export default createPiExtension();
