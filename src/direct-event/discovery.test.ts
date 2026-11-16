import { afterEach, describe, expect, it, vi } from "vitest"
import * as Effect from "effect/Effect"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { discoverWorkingTreeCandidates } from "@hapsland/native-observation/direct-event/selection"
import { makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"
import { execFileAsync, spawnSync } from "../../scripts/test-harness/process.mjs"

const roots: string[] = []
const processRecords: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const record of processRecords.splice(0)) {
    try {
      const pid = Number(await readFile(record, "utf8"))
      process.kill(pid, "SIGKILL")
    } catch {
      // Completed discovery must already have reaped its child; clean up failed assertions too.
    }
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const fakeGit = async (body: string) => {
  const root = await mkdtemp(join(tmpdir(), "haps-discovery-"))
  roots.push(root)
  const record = join(root, "child.pid")
  processRecords.push(record)
  await writeFile(
    join(root, "git"),
    `#!${process.execPath}\nconst fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(record)}, String(process.pid));\n${body}\n`,
    { mode: 0o755 }
  )
  vi.stubEnv("PATH", `${root}${delimiter}${process.env.PATH ?? ""}`)
  return { root, record }
}

const expectChildReaped = async (record: string) => {
  const pid = Number(await readFile(record, "utf8"))
  expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
  expect(() => process.kill(pid, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }))
}

describe("working-tree candidate discovery process boundary", () => {
  it("frames separate UTF-8 bytes and NUL records without losing names", async () => {
    const { root, record } = await fakeGit(`
const bytes = Buffer.from("src/日本語-é.ts\\0skip.txt\\0src/second.ts\\0", "utf8");
let index = 0;
const writeNext = () => {
  if (index === bytes.length) return;
  process.stdout.write(bytes.subarray(index, ++index), () => setImmediate(writeNext));
};
writeNext();`)
    const observed: string[] = []
    const result = await Effect.runPromise(
      discoverWorkingTreeCandidates(root, (path) => {
        observed.push(path)
        return path.endsWith(".ts")
      })
    )
    expect(observed).toEqual(["src/日本語-é.ts", "skip.txt", "src/second.ts"])
    expect(result).toEqual({ paths: ["src/second.ts", "src/日本語-é.ts"], skipped: 1 })
    await expectChildReaped(record)
  })

  it.each([
    { name: "nonzero exit after complete output", text: "selected.ts\0", code: 2 },
    { name: "incomplete final record", text: "selected.ts\0unfinished.ts", code: 0 }
  ])("rejects $name instead of accepting partial discovery", async ({ text, code }) => {
    const { root, record } = await fakeGit(
      `process.stdout.write(${JSON.stringify(text)}, () => { process.exitCode = ${code}; });`
    )
    await expect(Effect.runPromise(discoverWorkingTreeCandidates(root, () => true))).rejects.toThrow(
      "Working-tree candidate discovery unavailable"
    )
    await expectChildReaped(record)
  })

  it("kills and reaps a silent process when the discovery deadline expires", async () => {
    const { root, record } = await fakeGit("setInterval(() => {}, 60_000);")
    await expect(Effect.runPromise(discoverWorkingTreeCandidates(root, () => true))).rejects.toThrow(
      "Working-tree candidate discovery unavailable"
    )
    await expectChildReaped(record)
  }, 8_000)

  it("fails and reaps the process when candidate selection throws", async () => {
    const { root, record } = await fakeGit('process.stdout.write("selected.ts\\0"); setInterval(() => {}, 60_000);')
    await expect(
      Effect.runPromise(
        discoverWorkingTreeCandidates(root, () => {
          throw new Error("selection failed")
        })
      )
    ).rejects.toThrow("Working-tree candidate discovery unavailable")
    await expectChildReaped(record)
  })

  it("kills and reaps its live process before interruption settles", async () => {
    const { root, record } = await fakeGit('process.stdout.write("ready.ts\\0"); setInterval(() => {}, 60_000);')
    let markReady: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      markReady = resolve
    })
    const controller = new AbortController()
    const result = Effect.runPromiseExit(
      discoverWorkingTreeCandidates(root, () => {
        markReady()
        return true
      }),
      { signal: controller.signal }
    )
    try {
      await ready
      controller.abort()
      expect((await result)._tag).toBe("Failure")
      await expectChildReaped(record)
    } finally {
      controller.abort()
      await result
    }
  })

  it("preserves repository-only ignores and counts unmerged filenames once", async () => {
    const root = await makeGitFixture()
    roots.push(root)
    await put(root, ".gitignore", "ignored.ts\n")
    await put(root, "ignored.ts", "type Ignored = string")
    await put(root, "info.ts", "type Info = string")
    await put(root, "global.ts", "type Global = string")
    await put(root, "conflict.txt", "conflict")
    await put(root, ".git/info/exclude", "info.ts\n")
    const globalIgnore = await put(root, "global-ignore", "global.ts\n")
    await execFileAsync("git", ["-C", root, "config", "core.excludesFile", globalIgnore])
    await execFileAsync("git", ["-C", root, "add", "conflict.txt"])
    const blob = (await execFileAsync("git", ["-C", root, "rev-parse", ":conflict.txt"])).stdout.trim()
    await put(
      root,
      "index-entries",
      `0 ${"0".repeat(40)}\tconflict.txt\n100644 ${blob} 1\tconflict.txt\n100644 ${blob} 2\tconflict.txt\n100644 ${blob} 3\tconflict.txt\n`
    )
    const updated = spawnSync("git", ["-C", root, "update-index", "--index-info"], {
      input: await readFile(join(root, "index-entries")),
      encoding: "utf8"
    })
    expect(updated.status, updated.stderr).toBe(0)
    const result = await Effect.runPromise(discoverWorkingTreeCandidates(root, (path) => path.endsWith(".ts")))
    expect(result.paths).toEqual(["global.ts", "info.ts"])
    // .gitignore, global-ignore, index-entries and one unmerged pathname.
    expect(result.skipped).toBe(4)
  })
})
