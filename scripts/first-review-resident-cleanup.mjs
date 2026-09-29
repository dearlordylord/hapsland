import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { join } from "node:path";

export class ResidentCleanupLimitation extends Error {}

const RESIDENT_WIRE_VERSION = 3;

export const probeScopedResident = (directory, timeoutMs = 1_000) => new Promise((resolve, reject) => {
  const socket = connect(join(directory, "resident.sock"));
  let settled = false;
  let encoded = "";
  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    socket.destroy();
    if (error !== undefined) reject(error);
    else resolve(value);
  };
  const timer = setTimeout(
    () => finish(new ResidentCleanupLimitation("scoped resident identity probe timed out")),
    timeoutMs,
  );
  socket.setEncoding("utf8");
  socket.once("connect", () => socket.write(`${JSON.stringify({ version: RESIDENT_WIRE_VERSION, operation: "hello" })}\n`));
  socket.on("data", (chunk) => {
    encoded += chunk;
    if (Buffer.byteLength(encoded, "utf8") > 65_536) {
      finish(new ResidentCleanupLimitation("scoped resident identity response exceeded its bound"));
      return;
    }
    const newline = encoded.indexOf("\n");
    if (newline < 0) return;
    try {
      const response = JSON.parse(encoded.slice(0, newline));
      if (response?.version !== RESIDENT_WIRE_VERSION || response.status !== "ready" || !Number.isSafeInteger(response.pid) ||
          response.pid <= 0 || typeof response.lifetime !== "string" || response.lifetime.length === 0) {
        throw new Error("invalid identity response");
      }
      finish(undefined, { pid: response.pid, lifetime: response.lifetime });
    } catch {
      finish(new ResidentCleanupLimitation("scoped resident identity response was invalid"));
    }
  });
  socket.once("error", () => finish(new ResidentCleanupLimitation("scoped resident identity endpoint was unavailable")));
  socket.once("close", () => finish(new ResidentCleanupLimitation("scoped resident identity endpoint closed before responding")));
});

export const stopScopedResident = async (stateRoot, dependencies = {}) => {
  const directory = join(stateRoot, "resident");
  let encodedOwner;
  try {
    encodedOwner = await readFile(join(directory, "owner.json"), "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") return { status: "absent" };
    throw new ResidentCleanupLimitation("scoped resident owner identity was unavailable; no process was signaled");
  }
  let owner;
  try { owner = JSON.parse(encodedOwner); }
  catch { throw new ResidentCleanupLimitation("scoped resident owner identity was invalid; no process was signaled"); }
  if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 ||
      typeof owner.lifetime !== "string" || owner.lifetime.length === 0) {
    throw new ResidentCleanupLimitation("scoped resident owner identity was invalid; no process was signaled");
  }
  const probe = dependencies.probe ?? probeScopedResident;
  let live;
  try {
    live = await probe(directory);
  } catch {
    throw new ResidentCleanupLimitation("scoped resident identity was unavailable; no process was signaled");
  }
  if (live.pid !== owner.pid || live.lifetime !== owner.lifetime) {
    throw new ResidentCleanupLimitation("scoped resident owner identity changed; no process was signaled");
  }
  const signal = dependencies.signal ?? process.kill;
  const wait = dependencies.wait ?? ((milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)));
  try { signal(owner.pid, "SIGTERM"); } catch { return { status: "already-stopped" }; }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { signal(owner.pid, 0); } catch { return { status: "stopped" }; }
    await wait(100);
  }
  throw new ResidentCleanupLimitation("scoped resident did not stop during cleanup");
};
