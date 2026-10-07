import fs, { existsSync, rmSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { resolve } from "node:path"
import { withBuildLock } from "./build-lock.mjs"
import { writeAssemblyPrerequisites } from "./assembly-prerequisites.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { assemblyFixture } from "./assembly-test-fixture.mjs"
import { prepareHostModules, assembleHostModules, checkHostModuleReceipt } from "./assemble-host-modules.mjs"
test("Pi owner artifacts retain public layout and relocated relative imports", async (t) => {
  const f = assemblyFixture(t),
    snapshot = f.snapshots.get("pi-extension/host"),
    plan = await prepareHostModules(f.root, snapshot)
  const entry = plan.plan.find((output) => output.publicPath === "dist/pi/extension.js")
  assert.match(entry.path, /packages\/pi\/artifacts\/host\/dist\/pi\/extension.js$/)
  assert.match(entry.text, /\.\.\/runtime\/value\.js/)
  assert.ok(plan.plan.every((output) => output.path.startsWith("packages/pi/artifacts/host/")))
  await assert.rejects(assembleHostModules(f.root, snapshot), /requires fresh assembly admission/)
  f.write("packages/runtime/dist/runtime/value.js", 'import "../../../pi/dist/pi/extension.js";')
  await assert.rejects(prepareHostModules(f.root, snapshot), /Stale assembly prerequisite/)
})
test("host publication is atomic, receipt-checked and never writes public dist", async (t) => {
  const f = assemblyFixture(t),
    snapshot = f.snapshots.get("pi-extension/host"),
    before = process.env.HAPSLAND_BUILD_LOCK_LEASE
  await withBuildLock(f.root, async (environment) => {
    process.env.HAPSLAND_BUILD_LOCK_LEASE = environment.HAPSLAND_BUILD_LOCK_LEASE
    try {
      writeAssemblyPrerequisites(f.root, f.snapshots, { token: environment.HAPSLAND_BUILD_LOCK_LEASE })
      const receipt = await assembleHostModules(f.root, snapshot, { owner: snapshot.owner, target: "host" })
      assert.ok(
        receipt.outputs.every(
          (output) => output.path.startsWith("packages/pi/artifacts/host/") && output.publicPath.startsWith("dist/")
        )
      )
      assert.equal(existsSync(resolve(f.root, "dist")), false)
      assert.deepEqual(await checkHostModuleReceipt(f.root, snapshot), receipt)
      f.write("packages/pi/artifacts/host/unaccounted.js", "unexpected cached output")
      await assert.rejects(checkHostModuleReceipt(f.root, snapshot), /Incomplete or changed host artifact inventory/)
      rmSync(resolve(f.root, "packages/pi/artifacts/host/unaccounted.js"))
      const rename = fs.renameSync
      fs.renameSync = function (source, destination) {
        const result = rename.call(this, source, destination)
        if (String(destination).endsWith("/artifacts/host"))
          f.write("packages/runtime/dist/runtime/value.js", "changed during publication")
        return result
      }
      syncBuiltinESMExports()
      try {
        await assert.rejects(
          assembleHostModules(f.root, snapshot, { owner: snapshot.owner, target: "host" }),
          /Stale assembly prerequisite/
        )
      } finally {
        fs.renameSync = rename
        syncBuiltinESMExports()
      }
      assert.equal(existsSync(resolve(f.root, "packages/pi/artifacts/host")), false)
      assert.equal(existsSync(resolve(f.root, "dist")), false)
    } finally {
      if (before === undefined) delete process.env.HAPSLAND_BUILD_LOCK_LEASE
      else process.env.HAPSLAND_BUILD_LOCK_LEASE = before
    }
  })
})
