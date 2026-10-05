import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { readInspectionSettings } from "./settings.ts"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
it("refreshes consent independently of analytics and suspends recording on invalid configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "haps-inspection-settings-"))
  roots.push(root)
  const user = join(root, "user.jsonc")
  const project = join(root, ".hapsland.jsonc")
  expect(readInspectionSettings(root, user)?.enabled).toBe(false)
  await writeFile(
    user,
    JSON.stringify({ version: 1, sessionInspection: true, inspectionRetentionDays: 2, inspectionStorageBytes: 65536 })
  )
  expect(readInspectionSettings(root, user)).toEqual({ enabled: true, retentionMs: 172800000, storageBytes: 65536 })
  await writeFile(project, JSON.stringify({ version: 1, sessionInspection: false, sessionAnalytics: true }))
  expect(readInspectionSettings(root, user)?.enabled).toBe(false)
  await writeFile(project, "{ invalid")
  expect(readInspectionSettings(root, user)).toBeUndefined()
  await writeFile(project, JSON.stringify({ version: 1, inspectionStorageBytes: 1 }))
  expect(readInspectionSettings(root, user)).toBeUndefined()
})
