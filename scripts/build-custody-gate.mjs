import { constants, existsSync } from "node:fs"
import { mkdir, open, readFile, mkdtemp, rename, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve, dirname } from "node:path"

import { createHash } from "node:crypto"
import { runBuildProcess } from "./build-process.mjs"

const require = createRequire(import.meta.url)
let binding
async function loadKernelLock(deadline) {
  if (!["linux", "darwin"].includes(process.platform)) throw new Error("Unsupported build custody kernel lock host")
  const source = resolve(import.meta.dirname, "../native/src/inspection-lock.c")
  const identity = createHash("sha256")
    .update(await readFile(source))
    .update(`${process.platform}-${process.arch}-${process.version}`)
    .digest("hex")
  const cache = resolve(import.meta.dirname, "../.test-runs/build-custody-native")
  const binary = resolve(cache, `${identity}.node`)
  if (!existsSync(binary)) {
    const headers = [
      resolve(dirname(process.execPath), "../include/node"),
      "/usr/local/include/node",
      "/usr/include/node",
      "/opt/homebrew/include/node"
    ].find((path) => existsSync(resolve(path, "node_api.h")))
    if (!headers) throw new Error("Build custody kernel lock requires Node-API headers")
    await mkdir(cache, { recursive: true, mode: 0o700 })
    const staging = await mkdtemp(resolve(cache, ".compile-"))
    try {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error("Build custody gate deadline exceeded")
      await runBuildProcess(
        "cc",
        [
          "-O2",
          "-std=c11",
          "-Wall",
          "-Wextra",
          "-Werror",
          "-fPIC",
          `-I${headers}`,
          ...(process.platform === "darwin" ? ["-bundle", "-undefined", "dynamic_lookup"] : ["-shared"]),
          source,
          "-o",
          resolve(staging, "lock.node")
        ],
        { timeout: Math.min(10000, remaining), stdio: "pipe" }
      )
      await rename(resolve(staging, "lock.node"), binary)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
  const value = require(binary).lockDirectory
  if (typeof value !== "function") throw new Error("Invalid build custody kernel lock binding")
  return value
}
// This persistent directory is never removed or replaced. Descriptor close (or
// process exit) releases the existing native kernel lock, including after SIGKILL.
export async function withBuildCustodyGate(root, work, { shared = true, timeoutMs = 5000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("Build custody gate requires a finite deadline")
  const deadline = Date.now() + timeoutMs
  if (!Number.isSafeInteger(deadline)) throw new Error("Build custody gate deadline is out of range")
  binding ??= loadKernelLock(deadline).catch((error) => {
    binding = undefined
    throw error
  })
  const lockDirectory = await binding
  const path = resolve(root, ".test-runs/build-custody-gate")
  await mkdir(path, { recursive: true, mode: 0o700 })
  const descriptor = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    while (true) {
      if (Date.now() >= deadline) throw new Error("Build custody gate deadline exceeded")
      const acquired = lockDirectory(descriptor.fd, shared)
      if (typeof acquired !== "boolean") throw new Error("Invalid build custody kernel lock result")
      if (acquired) return await work()
      await new Promise((done) => setTimeout(done, Math.min(25, Math.max(1, deadline - Date.now()))))
    }
  } finally {
    await descriptor.close()
  }
}
