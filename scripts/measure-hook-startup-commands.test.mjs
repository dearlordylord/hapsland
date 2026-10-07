import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { installedCommands } from "./measure-hook-startup-commands.mjs"

const fixture = () => {
  const prefix = mkdtempSync(join(tmpdir(), "startup-commands-"))
  const root = join(prefix, "node_modules/@hapsland/hapsland")
  const binaries = join(root, "dist/bin", `${process.platform}-${process.arch}`)
  mkdirSync(binaries, { recursive: true })
  mkdirSync(join(root, "bin"), { recursive: true })
  mkdirSync(join(prefix, "node_modules/.bin"), { recursive: true })
  writeFileSync(join(root, "bin/launch.sh"), "launcher")
  const bin = {}
  for (const name of ["hapsland", "hapsland-hook", "hapsland-resident"]) {
    writeFileSync(join(binaries, name), name)
    symlinkSync(join(root, "bin/launch.sh"), join(prefix, "node_modules/.bin", name))
    bin[name] = "bin/launch.sh"
  }
  writeFileSync(join(root, "package.json"), JSON.stringify({ bin }))
  writeFileSync(join(root, "package-runtime.json"), JSON.stringify({ runtime: { name: "bun", version: "1.3.14" } }))
  return { prefix, root, binaries }
}
for (const role of ["cli", "hook"]) {
  test(`selects actual installed ${role} entry and registered launcher`, () => {
    const value = fixture()
    try {
      const commands = installedCommands(value.prefix, role)
      const name = role === "cli" ? "hapsland" : "hapsland-hook"
      assert.equal(commands.hook.executable, join(value.binaries, name))
      assert.equal(commands.launcher, join(value.prefix, "node_modules/.bin", name))
      assert.equal(commands.resident.executable, join(value.binaries, "hapsland-resident"))
    } finally {
      rmSync(value.prefix, { recursive: true, force: true })
    }
  })
}
test("requires explicit role instead of silently measuring shared CLI", () => {
  assert.throws(() => installedCommands("unused"), /hookRole/)
})
test("rejects a launcher not matching installed manifest registration", () => {
  const value = fixture()
  try {
    writeFileSync(join(value.root, "bin/other.sh"), "other")
    writeFileSync(join(value.root, "package.json"), JSON.stringify({ bin: { "hapsland-hook": "bin/other.sh" } }))
    assert.throws(() => installedCommands(value.prefix, "hook"), /bin registration/)
  } finally {
    rmSync(value.prefix, { recursive: true, force: true })
  }
})
test("candidate missing standalone hook cannot fall back to CLI", () => {
  const value = fixture()
  try {
    rmSync(join(value.binaries, "hapsland-hook"))
    assert.throws(() => installedCommands(value.prefix, "hook"), /ENOENT/)
    assert.equal(installedCommands(value.prefix, "cli").hook.executable, join(value.binaries, "hapsland"))
  } finally {
    rmSync(value.prefix, { recursive: true, force: true })
  }
})
