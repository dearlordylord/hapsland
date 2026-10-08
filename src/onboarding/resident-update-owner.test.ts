import { Effect } from "effect"
import { afterEach, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { previewResidentUpdate, applyResidentUpdate } from "@hapsland/administration/onboarding/resident-update"

const resident = vi.hoisted(() => ({ inspect: vi.fn(), request: vi.fn(), ensure: vi.fn() }))
vi.mock("@hapsland/resident-transport/resident/client", async () => ({
  inspectResidentEffect: resident.inspect,
  residentRequestEffect: resident.request,
  ensureResidentEffect: resident.ensure,
  residentStartupLayer: (await import("effect/Layer")).empty
}))
const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "resident-selection-"))
  roots.push(root)
  vi.stubEnv("HOME", root)
  vi.stubEnv("REVIEW_RESIDENT_DIR", join(root, "runtime"))
  const target = { version: 1, build: "target", command: { executable: join(root, "resident"), args: [] } }
  const executable = join(root, "cli")
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({ name: "@hapsland/hapsland", resident: target })}'\n`,
    { mode: 0o700 }
  )
  const selectedPath = join(root, ".local/share/hapsland/resident-target.json")
  const select = (build: string) => {
    mkdirSync(join(root, ".local/share/hapsland"), { recursive: true })
    writeFileSync(selectedPath, JSON.stringify({ ...target, build }))
  }
  select("previous")
  resident.inspect.mockReturnValue(
    Effect.succeed({ ready: true, observed: "ready", build: "previous", lifetime: "first" })
  )
  resident.request.mockReturnValue(Effect.succeed({ status: "replacing" }))
  resident.ensure.mockReturnValue(Effect.succeed({ status: "ready", build: "target", lifetime: "activated" }))
  return { executable, selectedPath, target, select }
}
it("approval survives normal lifetime change and fences the freshly observed owner", async () => {
  const f = fixture()
  const preview = await Effect.runPromise(previewResidentUpdate(f.executable))
  resident.inspect.mockReturnValue(
    Effect.succeed({ ready: true, observed: "ready", build: "previous", lifetime: "replacement" })
  )
  const applied = await Effect.runPromise(applyResidentUpdate(f.executable, preview.proposal.digest))
  expect(applied.status).toBe("updated")
  expect(resident.request).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ operation: "replace", lifetime: "replacement" })
  )
  expect(JSON.parse(readFileSync(f.selectedPath, "utf8"))).toEqual(f.target)
})
it("a changed shared selection requires fresh approval before replacement", async () => {
  const f = fixture()
  const preview = await Effect.runPromise(previewResidentUpdate(f.executable))
  f.select("another-selected-build")
  const applied = await Effect.runPromise(applyResidentUpdate(f.executable, preview.proposal.digest))
  expect(applied.status).toBe("proposal-mismatch")
  expect(resident.request).not.toHaveBeenCalled()
  expect(JSON.parse(readFileSync(f.selectedPath, "utf8")).build).toBe("another-selected-build")
})
it("a changed requested target requires fresh approval before replacement", async () => {
  const f = fixture()
  const preview = await Effect.runPromise(previewResidentUpdate(f.executable))
  const target = { ...f.target, build: "different-target" }
  writeFileSync(
    f.executable,
    `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({ name: "@hapsland/hapsland", resident: target })}'\n`,
    { mode: 0o700 }
  )
  const applied = await Effect.runPromise(applyResidentUpdate(f.executable, preview.proposal.digest))
  expect(applied.status).toBe("proposal-mismatch")
  expect(resident.request).not.toHaveBeenCalled()
  expect(JSON.parse(readFileSync(f.selectedPath, "utf8")).build).toBe("previous")
})
