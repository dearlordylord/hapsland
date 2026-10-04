import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { standaloneEnvironment } from "../../scripts/test-harness/standalone-environment.mjs"
import {
  cleanupOwnedResident,
  observeOwnedResidentProcess
} from "../../scripts/test-harness/cleanup-owned-resident.mjs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanupPiFixtures, fixture, fixtureCommandMatches, setupInstalledPi } from "./pi-installed.ts"

beforeAll(() => setupInstalledPi("source"))
afterEach(cleanupPiFixtures)

const waitFile = async (path: string) => {
  const deadline = Date.now() + 5_000
  while (!existsSync(path) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  expect(existsSync(path)).toBe(true)
}
const closed = (child: ChildProcess) => new Promise<void>((resolve) => child.once("close", () => resolve()))
const expectClosed = async (completion: Promise<void>) => {
  let timer: ReturnType<typeof setTimeout>
  try {
    await Promise.race([
      completion,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("fixture child remained alive after cleanup")), 1_000)
      })
    ])
  } finally {
    clearTimeout(timer!)
  }
}
// Publish the readiness marker only once its owner record is complete.
const bootstrap =
  "const fs=require('node:fs');const path=require('node:path');const directory=process.argv[2];fs.mkdirSync(path.join(directory,'owner.lock'),{recursive:true,mode:0o700});const owner=path.join(directory,'owner.lock','owner.json');fs.writeFileSync(owner+'.tmp',JSON.stringify({pid:process.pid,token:'bootstrap-test'}),{mode:0o600});fs.renameSync(owner+'.tmp',owner);setInterval(()=>{},1000);"

describe("Pi fixture process ownership", { timeout: 15_000 }, () => {
  it.each(process.platform === "linux" ? ["direct", "symlink"] : ["direct"])(
    "stops its bootstrap process through %s paths before an endpoint owner exists",
    async (mode) => {
      const { root } = fixture()
      const directory = join(root, "runtime")
      const preload = join(root, "bootstrap.cjs")
      writeFileSync(preload, bootstrap)
      const main = join(process.cwd(), "src/resident/main.ts")
      const mainAlias = mode === "symlink" ? join(root, "resident-main.ts") : main
      const directoryAlias = mode === "symlink" ? join(root, "runtime-alias") : directory
      if (mode === "symlink") {
        mkdirSync(directory)
        symlinkSync(main, mainAlias)
        symlinkSync(directory, directoryAlias)
      }
      const child = spawn(process.execPath, [mainAlias, directoryAlias], {
        env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${JSON.stringify(preload)}` },
        stdio: "ignore"
      })
      const completion = closed(child)
      try {
        await waitFile(join(directory, "owner.lock/owner.json"))
        expect(existsSync(join(directory, "owner.json"))).toBe(false)
        await cleanupPiFixtures()
        await expectClosed(completion)
        expect(existsSync(root)).toBe(false)
      } finally {
        child.kill("SIGKILL")
        await completion
      }
    }
  )

  it("does not signal a foreign process named by fixture metadata", async () => {
    const { root } = fixture()
    const directory = join(root, "runtime")
    const foreign = join(root, "foreign.cjs")
    writeFileSync(foreign, bootstrap)
    const child = spawn(process.execPath, [foreign, directory], { stdio: "ignore" })
    const completion = closed(child)
    try {
      await waitFile(join(directory, "owner.lock/owner.json"))
      await cleanupPiFixtures()
      expect(child.exitCode).toBeNull()
      expect(child.signalCode).toBeNull()
      expect(() => process.kill(child.pid!, 0)).not.toThrow()
    } finally {
      child.kill("SIGKILL")
      await completion
    }
  })
})

it("limits resident cleanup to the exact standalone binary and runtime directory", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cleanup-identity-"))
  try {
    const binary = join(root, "hapsland-resident"),
      directory = join(root, "runtime")
    writeFileSync(binary, "fixture")
    mkdirSync(directory)
    expect(fixtureCommandMatches([binary, directory, ""], binary, directory)).toBe(true)
    expect(fixtureCommandMatches([process.execPath, binary, directory, ""], binary, directory)).toBe(false)
    expect(fixtureCommandMatches([binary, root, ""], binary, directory)).toBe(false)
    expect(fixtureCommandMatches([binary, directory, "unexpected", ""], binary, directory)).toBe(false)
    const source = join(root, "main.ts")
    writeFileSync(source, "fixture")
    expect(fixtureCommandMatches([process.execPath, source, directory, ""], source, directory)).toBe(true)
    expect(fixtureCommandMatches([source, directory, ""], source, directory)).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("installed fixture PATH retains Git while exposing neither Node nor Bun", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-standalone-path-"))
  try {
    const env = standaloneEnvironment(root)
    const interpreters = execFileSync("/bin/sh", ["-c", "command -v node || true; command -v bun || true"], {
      env,
      encoding: "utf8"
    })
    expect(interpreters).toBe("")
    expect(execFileSync("git", ["--version"], { env, encoding: "utf8" })).toMatch(/^git version /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it.each(["owner.json", "owner.lock/owner.json"])(
  "shared cleanup stops its proven %s process before deleting state",
  async (ownerFile) => {
    const root = mkdtempSync(join(tmpdir(), "pi-shared-cleanup-"))
    const main = join(root, "resident.mjs")
    writeFileSync(main, "setInterval(()=>{},1000)")
    const child = spawn(process.execPath, [main, root], { stdio: "ignore" })
    const completion = closed(child)
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve)
        child.once("error", reject)
      })
      if (ownerFile.startsWith("owner.lock")) mkdirSync(join(root, "owner.lock"))
      writeFileSync(join(root, ownerFile), JSON.stringify({ pid: child.pid }))
      await cleanupOwnedResident(root, [{ executable: process.execPath, args: [main] }])
      await expectClosed(completion)
      expect(existsSync(root)).toBe(true)
    } finally {
      child.kill("SIGKILL")
      await completion
      rmSync(root, { recursive: true, force: true })
    }
  }
)
it("shared cleanup preserves uncertain metadata and never signals a foreign process", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-shared-foreign-"))
  const foreign = join(root, "foreign.mjs"),
    expected = join(root, "resident.mjs")
  writeFileSync(foreign, "setInterval(()=>{},1000)")
  writeFileSync(expected, "fixture")
  const child = spawn(process.execPath, [foreign, root], { stdio: "ignore" })
  const completion = closed(child)
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve)
      child.once("error", reject)
    })
    writeFileSync(join(root, "owner.json"), JSON.stringify({ pid: child.pid }))
    await expect(cleanupOwnedResident(root, [{ executable: process.execPath, args: [expected] }])).rejects.toThrow(
      "Unproven resident owner"
    )
    expect(() => process.kill(child.pid!, 0)).not.toThrow()
    expect(existsSync(join(root, "owner.json"))).toBe(true)
  } finally {
    child.kill("SIGKILL")
    await completion
    rmSync(root, { recursive: true, force: true })
  }
})

it("a Darwin ps exit alone does not prove death: ESRCH confirms absence while EPERM retains uncertainty", () => {
  const inspectPs = () => {
    throw Object.assign(new Error("ps: no row"), { status: 1 })
  }
  const absent = () => {
    throw Object.assign(new Error("no process"), { code: "ESRCH" })
  }
  const denied = () => {
    throw Object.assign(new Error("unknown process"), { code: "EPERM" })
  }
  expect(
    observeOwnedResidentProcess(123, "/fixture", [], { platform: "darwin", inspectPs, probe: absent })
  ).toBeUndefined()
  expect(() =>
    observeOwnedResidentProcess(123, "/fixture", [], { platform: "darwin", inspectPs, probe: denied })
  ).toThrow("Unable to establish resident ownership")
  expect(() =>
    observeOwnedResidentProcess(123, "/fixture", [], { platform: "darwin", inspectPs, probe: () => {} })
  ).toThrow("Unable to establish resident ownership")
})
