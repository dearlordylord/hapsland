import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { makeInitialCredentialState, readCredentialState } from "@hapsland/runtime-inputs/credentials/state"

it("keeps independent readers and lifecycle defaults isolated from returned-state mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-state-default-"))
  try {
    const path = join(root, "missing.json")
    const returned = readCredentialState(path)
    Object.assign(returned, { generation: 99, savedUseSuspended: true })
    const lifecycleDefault = makeInitialCredentialState()
    Object.assign(lifecycleDefault, { generation: 42 })
    expect(readCredentialState(path)).toEqual({ version: 1, generation: 0, savedUseSuspended: false })
    expect(makeInitialCredentialState()).toEqual({ version: 1, generation: 0, savedUseSuspended: false })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
