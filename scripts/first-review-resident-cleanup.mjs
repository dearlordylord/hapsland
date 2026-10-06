import { readFile } from "node:fs/promises"
import { Effect } from "effect"
import { residentRequestEffect } from "../src/resident/client.ts"
import { residentPaths } from "../src/resident/paths.ts"
import { join } from "node:path"

export class ResidentCleanupLimitation extends Error {}

export const probeScopedResident = async (directory, timeoutMs = 1_000) => {
  try {
    const response = await Effect.runPromise(
      residentRequestEffect(residentPaths(directory), { requestRoute: "shared", operation: "hello" }, timeoutMs)
    )
    if (response.status !== "ready") throw new Error("invalid identity response")
    return { pid: response.pid, lifetime: response.lifetime }
  } catch {
    throw new ResidentCleanupLimitation("scoped resident identity endpoint was unavailable or invalid")
  }
}

export const stopScopedResident = async (stateRoot, dependencies = {}) => {
  const directory = join(stateRoot, "resident")
  let encodedOwner
  try {
    encodedOwner = await readFile(join(directory, "owner.json"), "utf8")
  } catch (cause) {
    if (cause?.code === "ENOENT") return { status: "absent" }
    throw new ResidentCleanupLimitation("scoped resident owner identity was unavailable; no process was signaled")
  }
  let owner
  try {
    owner = JSON.parse(encodedOwner)
  } catch {
    throw new ResidentCleanupLimitation("scoped resident owner identity was invalid; no process was signaled")
  }
  if (
    !Number.isSafeInteger(owner?.pid) ||
    owner.pid <= 0 ||
    typeof owner.lifetime !== "string" ||
    owner.lifetime.length === 0
  ) {
    throw new ResidentCleanupLimitation("scoped resident owner identity was invalid; no process was signaled")
  }
  const probe = dependencies.probe ?? probeScopedResident
  let live
  try {
    live = await probe(directory)
  } catch {
    throw new ResidentCleanupLimitation("scoped resident identity was unavailable; no process was signaled")
  }
  if (live.pid !== owner.pid || live.lifetime !== owner.lifetime) {
    throw new ResidentCleanupLimitation("scoped resident owner identity changed; no process was signaled")
  }
  const signal = dependencies.signal ?? process.kill
  const wait =
    dependencies.wait ?? ((milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)))
  try {
    signal(owner.pid, "SIGTERM")
  } catch {
    return { status: "already-stopped" }
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      signal(owner.pid, 0)
    } catch {
      return { status: "stopped" }
    }
    await wait(100)
  }
  throw new ResidentCleanupLimitation("scoped resident did not stop during cleanup")
}
