import { execFileAsync } from "../../scripts/test-harness/process.mjs"
import { chmod, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import { closeSync, readdirSync, readlinkSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import {
  captureStable,
  decodeNativeCaptureFrame,
  MAX_SOURCE_BYTES,
  type CaptureResult
} from "@hapsland/native-observation/direct-event/capture"
import { eligibleNamedPath, inspectNamedPath } from "@hapsland/native-observation/direct-event/selection"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { addEvent, makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"

const required = <A>(value: A | undefined): A => {
  if (value === undefined) throw new Error("expected fixture value")
  return value
}

describe("direct-event named-path selection", () => {
  it("reports the actual policy, ignore and filesystem refusal instead of generic ineligibility", async () => {
    const root = await makeGitFixture()
    await put(root, ".scratch/example.ts", "export type Example = { title: string }")
    await put(root, "ignored.ts", "export type Ignored = { title: string }")
    await put(root, ".gitignore", "ignored.ts\n")
    expect(await Effect.runPromise(inspectNamedPath(root, ".scratch/example.ts"))).toEqual({
      status: "denied",
      reason: "not-included"
    })
    expect(
      await Effect.runPromise(
        inspectNamedPath(root, ".scratch/example.ts", { includes: ["**/*", ".scratch/**"], excludes: [] })
      )
    ).toMatchObject({ status: "selected", path: { relativePath: ".scratch/example.ts" } })
    expect(await Effect.runPromise(inspectNamedPath(root, "ignored.ts"))).toEqual({
      status: "denied",
      reason: "git-ignored"
    })
    expect(
      await Effect.runPromise(inspectNamedPath(root, "ignored.ts", { includes: ["**/*"], excludes: ["ignored.ts"] }))
    ).toEqual({ status: "denied", reason: "excluded" })
    expect(await Effect.runPromise(inspectNamedPath(root, "missing.ts"))).toEqual({
      status: "denied",
      reason: "path-observation-unavailable"
    })
    expect(await Effect.runPromise(inspectNamedPath(root, "../outside.ts"))).toEqual({
      status: "denied",
      reason: "repository-boundary"
    })
  })

  it("honors nested .gitignore for untracked files and tracked semantics", async () => {
    const root = await makeGitFixture()
    await put(root, ".gitignore", "ignored.ts\nsub/*.ts\n!sub/keep.ts\n")
    await put(root, "sub/.gitignore", "local.ts\n")
    for (const path of ["ignored.ts", "sub/drop.ts", "sub/keep.ts", "sub/local.ts"]) {
      await put(root, path, "type A = number")
    }
    expect(await Effect.runPromise(eligibleNamedPath(root, "ignored.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "sub/drop.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "sub/local.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "sub/keep.ts"))).toBeDefined()
    await execFileAsync("git", ["-C", root, "add", "-f", "ignored.ts"])
    expect(await Effect.runPromise(eligibleNamedPath(root, "ignored.ts"))).toBeDefined()
  })

  it("does not load .git/info/exclude or global excludes", async () => {
    const root = await makeGitFixture()
    await put(root, "local-info.ts", "type A = number")
    await writeFile(join(root, ".git/info/exclude"), "local-info.ts\n")
    const globalFile = await put(root, "global-ignore", "global.ts\n")
    await put(root, "global.ts", "type A = number")
    await execFileAsync("git", ["-C", root, "config", "core.excludesFile", globalFile])
    expect(await Effect.runPromise(eligibleNamedPath(root, "local-info.ts"))).toBeDefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "global.ts"))).toBeDefined()
  })

  it("applies replacement includes, accumulated exclusions, and the hard floor", async () => {
    const root = await makeGitFixture()
    for (const path of [
      "src/a.ts",
      "src/no.ts",
      "src/a.mts",
      "src/a.cts",
      "build/a.ts",
      "generated/a.ts",
      "vendor/a.ts",
      ".env.local",
      "node_modules/a.ts",
      "README.md",
      "program.exe"
    ]) {
      await put(root, path, "type A = number")
    }
    const policy = { includes: ["src/**"], excludes: ["src/no.ts"] }
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.ts", policy))).toBeDefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.mts", policy))).toBeDefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.cts", policy))).toBeDefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.ts", { includes: [], excludes: [] }))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/no.ts", policy))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "build/a.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "generated/a.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "vendor/a.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "README.md"))).toBeDefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "program.exe"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, ".env.local"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "node_modules/a.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, ".git/config"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "../outside.ts"))).toBeUndefined()
  })

  it("rejects symlink traversal and nonregular paths before capture", async () => {
    const root = await makeGitFixture()
    await put(root, "real/a.ts", "type A = number")
    await symlink(join(root, "real"), join(root, "link"))
    await mkdir(join(root, "directory"))
    expect(await Effect.runPromise(eligibleNamedPath(root, "link/a.ts"))).toBeUndefined()
    expect(await Effect.runPromise(eligibleNamedPath(root, "directory"))).toBeUndefined()
  })

  it("rejects the structured in-root Git directory without prefix overreach", async () => {
    const root = await makeGitFixture()
    const gitDirectory = join(root, "git-admin")
    await rename(join(root, ".git"), gitDirectory)
    await writeFile(join(root, ".git"), "gitdir: git-admin\n")
    await put(root, "git-admin/evidence.ts", "type Secret = string")
    await put(root, "git-admin-sibling/source.ts", "type Safe = string")
    expect(await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["git-admin/evidence.ts"])))).toBeUndefined()
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["git-admin-sibling/source.ts"])))
    expect(observation?.rootIdentity.gitDirectory).toBe(gitDirectory)
    expect(
      await Effect.runPromise(eligibleNamedPath(root, "git-admin/evidence.ts", undefined, observation?.rootIdentity))
    ).toBeUndefined()
    expect(
      await Effect.runPromise(
        eligibleNamedPath(root, "git-admin-sibling/source.ts", undefined, observation?.rootIdentity)
      )
    ).toBeDefined()
  })

  it("keeps an external Git directory distinct from all in-root source paths", async () => {
    const root = await makeGitFixture()
    const holder = await makeGitFixture()
    const gitDirectory = join(holder, "external-admin")
    await rename(join(root, ".git"), gitDirectory)
    await writeFile(join(root, ".git"), `gitdir: ${gitDirectory}\n`)
    await put(root, "source.ts", "type Safe = string")
    await put(holder, "external-admin/secret.ts", "type Secret = string")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["source.ts"])))
    expect(observation?.rootIdentity.gitDirectory).toBe(gitDirectory)
    expect(
      await Effect.runPromise(eligibleNamedPath(root, "source.ts", undefined, observation?.rootIdentity))
    ).toBeDefined()
    expect(
      await Effect.runPromise(
        eligibleNamedPath(root, join(gitDirectory, "secret.ts"), undefined, observation?.rootIdentity)
      )
    ).toBeUndefined()
  })
})

const capturedSource = (result: CaptureResult) => {
  expect(result.status).toBe("captured")
  if (result.status !== "captured") throw new Error("fixture source capture failed")
  return result.capture
}

describe("native capture helper wire boundary", () => {
  const frame = (body: string, declaredBytes = Buffer.byteLength(body)) => ({
    succeeded: true,
    stdout: Buffer.from(`1:2:33188:${declaredBytes}:1:0:1:0\n${body}`),
    stderr: Buffer.alloc(0)
  })
  it("admits exact bounded frames and refuses malformed or over-limit source without partial bytes", () => {
    const accepted = decodeNativeCaptureFrame(frame("12345678"), 8)
    expect(accepted.status).toBe("captured")
    if (accepted.status !== "captured") throw new Error("native fixture decode failed")
    expect(accepted.read.bytes.toString()).toBe("12345678")
    for (const rejected of [frame("123456789"), frame("x", 2), { ...frame("x"), stdout: Buffer.from("invalid\nx") }]) {
      expect(decodeNativeCaptureFrame(rejected, 8)).toEqual({
        status: "unavailable",
        diagnostic: { stage: "capture", code: "panic", args: { boundary: "stable-capture" } }
      })
      expect(rejected.stdout.every((byte) => byte === 0)).toBe(true)
    }
  })
  it("decodes only closed source-free refusal facts with trustworthy size metadata", () => {
    const unavailable = (text: string | Buffer) => ({
      succeeded: false,
      stdout: Buffer.from("rejected partial source"),
      stderr: Buffer.from(text)
    })
    expect(decodeNativeCaptureFrame(unavailable("size-limit 9 8\n"), 8)).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-size-limit", args: { observedBytes: 9, limitBytes: 8 } }
    })
    for (const reason of ["missing", "access", "io"] as const)
      expect(decodeNativeCaptureFrame(unavailable(`${reason}\n`), 8)).toEqual({
        status: "unavailable",
        diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason } }
      })
    for (const reason of ["root-identity", "git-identity", "path-binding", "file-kind", "budget-argument"] as const)
      expect(decodeNativeCaptureFrame(unavailable(`${reason}\n`), 8)).toEqual({
        status: "unavailable",
        diagnostic: { stage: "capture", code: "capture-validation-failed", args: { reason } }
      })
    expect(decodeNativeCaptureFrame(unavailable("unstable\n"), 8)).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-unstable", args: { checkpoint: "descriptor" } }
    })
    expect(decodeNativeCaptureFrame(unavailable(""), 8)).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason: "unknown" } }
    })
    for (const text of [
      "size-limit 8 8\n",
      "size-limit 9 7\n",
      "size-limit 9007199254740992 8\n",
      "arbitrary exception",
      "x".repeat(129),
      Buffer.from([0xed, 0x69, 0x73, 0x73, 0x69, 0x6e, 0x67])
    ]) {
      const rejected = unavailable(text)
      expect(decodeNativeCaptureFrame(rejected, 8)).toEqual({
        status: "unavailable",
        diagnostic: { stage: "capture", code: "panic", args: { boundary: "stable-capture" } }
      })
      expect(rejected.stdout.every((byte) => byte === 0)).toBe(true)
      expect(rejected.stderr.every((byte) => byte === 0)).toBe(true)
    }
    expect(decodeNativeCaptureFrame(frame("x"), 0)).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-validation-failed", args: { reason: "budget-argument" } }
    })
  })
})

describe("stable bounded source capture", () => {
  it("captures a ten-thousand-line source above the former byte ceiling", async () => {
    const root = await makeGitFixture()
    const source = "export type Example = { value: string };\n".repeat(10_000)
    expect(Buffer.byteLength(source)).toBeGreaterThan(262_144)
    await put(root, "large-source.ts", source)
    const path = required(await Effect.runPromise(eligibleNamedPath(root, "large-source.ts")))
    expect(capturedSource(await Effect.runPromise(captureStable(root, path))).text).toBe(source)
  })

  it("accepts matching reads, BOM, and the exact byte limit", async () => {
    const root = await makeGitFixture()
    await put(root, "bom.ts", Buffer.from("\ufefftype A = number", "utf8"))
    const bom = await Effect.runPromise(eligibleNamedPath(root, "bom.ts"))
    expect(bom).toBeDefined()
    expect(capturedSource(await Effect.runPromise(captureStable(root, required(bom)))).text).toContain("type A")
    await put(root, "limit.ts", "x".repeat(MAX_SOURCE_BYTES))
    const limit = await Effect.runPromise(eligibleNamedPath(root, "limit.ts"))
    expect(capturedSource(await Effect.runPromise(captureStable(root, required(limit)))).byteLength).toBe(
      MAX_SOURCE_BYTES
    )
  })

  it("bounds each stable source read by a configured lower cap", async () => {
    const root = await makeGitFixture()
    await put(root, "exact.ts", "x".repeat(80))
    await put(root, "over.ts", "x".repeat(81))
    const exact = required(await Effect.runPromise(eligibleNamedPath(root, "exact.ts")))
    const over = required(await Effect.runPromise(eligibleNamedPath(root, "over.ts")))
    const reads: string[] = []
    const captured = await Effect.runPromise(
      captureStable(
        root,
        exact,
        {
          sourceRead: (path) => {
            reads.push(path)
          }
        },
        undefined,
        80
      )
    )
    expect(capturedSource(captured).byteLength).toBe(80)
    expect(
      await Effect.runPromise(
        captureStable(
          root,
          over,
          {
            sourceRead: (path) => {
              reads.push(path)
            }
          },
          undefined,
          80
        )
      )
    ).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-size-limit", args: { observedBytes: 81, limitBytes: 80 } }
    })
    expect(reads).toEqual(["exact.ts", "exact.ts"])
  })

  it("contains oversize, malformed UTF-8, and NUL input", async () => {
    const root = await makeGitFixture()
    const fixtures: ReadonlyArray<[string, Uint8Array]> = [
      ["large.ts", Buffer.alloc(MAX_SOURCE_BYTES + 1, 0x61)],
      ["bad.ts", Buffer.from([0xc3, 0x28])],
      ["nul.ts", Buffer.from("type\0A = number")]
    ]
    for (const [path, bytes] of fixtures) {
      await put(root, path, bytes)
      const eligible = await Effect.runPromise(eligibleNamedPath(root, path))
      expect(eligible).toBeDefined()
      const result = await Effect.runPromise(captureStable(root, required(eligible)))
      expect(result).toEqual({
        status: "unavailable",
        diagnostic:
          path === "large.ts"
            ? {
                stage: "capture",
                code: "capture-size-limit",
                args: { observedBytes: MAX_SOURCE_BYTES + 1, limitBytes: MAX_SOURCE_BYTES }
              }
            : {
                stage: "capture",
                code: "capture-validation-failed",
                args: { reason: path === "bad.ts" ? "text-encoding" : "source-null-byte" }
              }
      })
    }
  })

  it("contains mutation and deletion/recreation between reads", async () => {
    const root = await makeGitFixture()
    await put(root, "race.ts", "type A = number")
    const eligible = await Effect.runPromise(eligibleNamedPath(root, "race.ts"))
    expect(
      await Effect.runPromise(
        captureStable(root, required(eligible), {
          betweenReads: () => Effect.promise(() => writeFile(join(root, "race.ts"), "type B = string"))
        })
      )
    ).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-unstable", args: { checkpoint: "double-read" } }
    })
    await put(root, "race.ts", "type A = number")
    expect(
      await Effect.runPromise(
        captureStable(root, required(eligible), {
          betweenReads: () =>
            Effect.promise(async () => {
              await rm(join(root, "race.ts"))
              await put(root, "race.ts", "type A = number")
            })
        })
      )
    ).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-unstable", args: { checkpoint: "double-read" } }
    })
  })

  it("contains disappearance and a change to nonregular after selection", async () => {
    const root = await makeGitFixture()
    await put(root, "gone.ts", "type A = number")
    const gone = required(await Effect.runPromise(eligibleNamedPath(root, "gone.ts")))
    await rm(join(root, "gone.ts"))
    expect(await Effect.runPromise(captureStable(root, gone))).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason: "missing" } }
    })
    await put(root, "directory.ts", "type A = number")
    const directory = required(await Effect.runPromise(eligibleNamedPath(root, "directory.ts")))
    await rm(join(root, "directory.ts"))
    await mkdir(join(root, "directory.ts"))
    expect(await Effect.runPromise(captureStable(root, directory))).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-validation-failed", args: { reason: "file-kind" } }
    })
  })

  it("distinguishes access, root validation and unexpected failure without source/error text", async () => {
    const root = await makeGitFixture()
    await put(root, "private.ts", "type Private = string")
    const observation = required(await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["private.ts"]))))
    const eligible = required(await Effect.runPromise(eligibleNamedPath(root, "private.ts")))
    if (process.getuid?.() !== 0) {
      await chmod(join(root, "private.ts"), 0)
      try {
        expect(await Effect.runPromise(captureStable(root, eligible))).toEqual({
          status: "unavailable",
          diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason: "access" } }
        })
      } finally {
        await chmod(join(root, "private.ts"), 0o600)
      }
    }
    expect(
      await Effect.runPromise(captureStable(root, eligible, {}, { ...observation.rootIdentity, rootInode: "0" }))
    ).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "capture-validation-failed", args: { reason: "root-identity" } }
    })
    const panic = await Effect.runPromise(
      captureStable(root, eligible, { betweenReads: () => Effect.fail(new Error("secret exception and source")) })
    )
    expect(panic).toEqual({
      status: "unavailable",
      diagnostic: { stage: "capture", code: "panic", args: { boundary: "stable-capture" } }
    })
    expect(JSON.stringify(panic)).not.toContain("secret")
    const operationalCodes = [
      ["ENOENT", { stage: "capture", code: "capture-unavailable", args: { reason: "missing" } }],
      ["EACCES", { stage: "capture", code: "capture-unavailable", args: { reason: "access" } }],
      ["EPERM", { stage: "capture", code: "capture-unavailable", args: { reason: "access" } }],
      ["ELOOP", { stage: "capture", code: "capture-validation-failed", args: { reason: "file-kind" } }],
      ["ENOTDIR", { stage: "capture", code: "capture-validation-failed", args: { reason: "file-kind" } }],
      ["EIO", { stage: "capture", code: "capture-unavailable", args: { reason: "io" } }]
    ] as const
    for (const [code, diagnostic] of operationalCodes) {
      const classified = await Effect.runPromise(
        captureStable(root, eligible, {
          betweenReads: () => Effect.fail(Object.assign(new Error("private operating-system detail"), { code }))
        })
      )
      expect(classified).toEqual({ status: "unavailable", diagnostic })
      expect(JSON.stringify(classified)).not.toContain("private operating-system detail")
    }
    expect(
      await Effect.runPromise(
        captureStable(root, eligible, {
          betweenReads: () =>
            Effect.sync(() => {
              throw new Error("secret unexpected defect")
            })
        })
      )
    ).toEqual(panic)
  })

  it("is interruptible without returning capture evidence", async () => {
    const root = await makeGitFixture()
    await put(root, "cancel.ts", "type A = number")
    const eligible = await Effect.runPromise(eligibleNamedPath(root, "cancel.ts"))
    const descriptorCount = () =>
      readdirSync("/proc/self/fd").filter((fd) => {
        try {
          return readlinkSync(`/proc/self/fd/${fd}`).startsWith(root)
        } catch {
          return false
        }
      }).length
    if (process.platform === "linux") expect(descriptorCount()).toBe(0)
    const controller = new AbortController()
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let reads = 0
    const running = Effect.runPromise(
      captureStable(root, required(eligible), {
        sourceRead: () => {
          reads += 1
          markStarted?.()
          if (process.platform === "linux") expect(descriptorCount()).toBeGreaterThan(0)
        },
        betweenReads: () => Effect.never
      }),
      { signal: controller.signal }
    )
    await started
    expect(reads).toBe(1)
    controller.abort()
    await expect(running).rejects.toBeDefined()
    if (process.platform === "linux") expect(descriptorCount()).toBe(0)
  })

  it("preserves interruption combined with failure or a cleanup defect", async () => {
    const root = await makeGitFixture()
    await put(root, "cancel.ts", "type A = number")
    const eligible = required(await Effect.runPromise(eligibleNamedPath(root, "cancel.ts")))
    for (const failure of [Cause.fail(new Error("secret operational failure")), Cause.die("secret cleanup defect")]) {
      const exit = await Effect.runPromiseExit(
        captureStable(root, eligible, {
          betweenReads: () => Effect.failCause(Cause.combine(Cause.interrupt(123), failure))
        })
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error("interruption returned capture evidence")
      expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    }
  })

  it.skipIf(process.platform !== "linux")(
    "preserves the primary capture failure when descriptor closure also fails",
    async () => {
      const root = await makeGitFixture()
      const path = join(root, "close.ts")
      await put(root, "close.ts", "type A = number")
      const eligible = required(await Effect.runPromise(eligibleNamedPath(root, "close.ts")))
      let closed = false
      const result = await Effect.runPromise(
        captureStable(root, eligible, {
          sourceRead: () => {
            const fd = readdirSync("/proc/self/fd").find((descriptor) => {
              try {
                return readlinkSync(`/proc/self/fd/${descriptor}`) === path
              } catch {
                return false
              }
            })
            if (fd === undefined) throw new Error("fixture capture descriptor missing")
            closeSync(Number(fd))
            closed = true
            throw new Error("secret primary capture failure")
          }
        })
      )
      expect(closed).toBe(true)
      expect(result).toEqual({
        status: "unavailable",
        diagnostic: { stage: "capture", code: "panic", args: { boundary: "stable-capture" } }
      })
    }
  )
})
