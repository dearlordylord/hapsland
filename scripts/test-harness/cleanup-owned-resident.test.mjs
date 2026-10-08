import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { sharedRuntimeLauncher } from "../shared-runtime-bundle.mjs"
import { observeOwnedResidentProcess } from "./cleanup-owned-resident.mjs"

test("shared resident ownership requires the exact runtime, flags, bundle and state directory", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-shared-owner-")))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ["hapsland", "hapsland-resident.js", "foreign.js"]) writeFileSync(join(root, name), "fixture")
  const launcher = join(root, "hapsland-resident")
  writeFileSync(launcher, sharedRuntimeLauncher("hapsland-resident"))
  const command = `${join(root, "hapsland")} --no-install --no-env-file --config=/dev/null ${join(root, "hapsland-resident.js")} ${root}`
  const observe = (argv) =>
    observeOwnedResidentProcess(123, root, [{ executable: launcher, args: [] }], {
      platform: "darwin",
      inspectPs: () => `Thu Oct  8 14:00:00 2026 ${argv}`,
      probe: () => {}
    })
  assert.equal(observe(command).owned, true)
  assert.equal(observe(command.replace("--no-env-file", "--env-file")).owned, false)
  assert.equal(observe(command.replace("hapsland-resident.js", "foreign.js")).owned, false)
  assert.equal(observe(`${command} extra`).owned, false)
  writeFileSync(launcher, "#!/bin/sh\nexec another-runtime\n")
  assert.equal(observe(command).owned, false)
})
