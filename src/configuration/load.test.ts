import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { Effect } from "effect"
import { loadConfiguration } from "@hapsland/runtime-inputs/configuration/load"

const roots: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-config-load-"))
  roots.push(root)
  return { root, userConfigPath: join(root, "user.jsonc") }
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it("captures optional user and project configuration in precedence order", async () => {
  const { root, userConfigPath } = fixture()
  expect(await Effect.runPromise(loadConfiguration(root, { userConfigPath }))).toBeDefined()
  writeFileSync(userConfigPath, '{"version":1,"includes":["user/**"]}')
  const project = join(root, ".hapsland.jsonc")
  writeFileSync(project, '{"version":1,"includes":["project/**"]}')
  const captured = await Effect.runPromise(loadConfiguration(root, { userConfigPath }))
  expect(JSON.stringify(captured)).toContain("project/**")
  expect(JSON.stringify(captured)).toContain(project)
})

it("discovers the canonical project file and permits an explicit managed project path", async () => {
  const { root, userConfigPath } = fixture()
  writeFileSync(join(root, ".hapsland.jsonc"), '{"version":1,"includes":["first/**"]}')
  writeFileSync(join(root, "managed.jsonc"), '{"version":1,"includes":["second/**"]}')
  expect(JSON.stringify(await Effect.runPromise(loadConfiguration(root, { userConfigPath })))).toContain("first/**")
  for (const projectConfigPath of ["managed.jsonc", join(root, "managed.jsonc")]) {
    expect(
      JSON.stringify(await Effect.runPromise(loadConfiguration(root, { userConfigPath, projectConfigPath })))
    ).toContain("second/**")
  }
  expect(
    await Effect.runPromise(loadConfiguration(root, { userConfigPath, projectConfigPath: "missing.jsonc" }))
  ).toBeDefined()
})

it.each(["..", "../outside.jsonc", "/outside.jsonc"])(
  "rejects explicit project paths outside the root: %s",
  async (projectConfigPath) => {
    const { root, userConfigPath } = fixture()
    const error = await Effect.runPromise(
      loadConfiguration(root, { userConfigPath, projectConfigPath }).pipe(Effect.flip)
    )
    expect(error).toMatchObject({
      source: projectConfigPath,
      field: "projectConfigPath",
      reason: "project configuration must be inside the Git working tree"
    })
  }
)

it("keeps malformed project diagnostics attributed to their source", async () => {
  const { root, userConfigPath } = fixture()
  const projectConfigPath = join(root, "explicit.jsonc")
  writeFileSync(projectConfigPath, '{"version":1,"version":1}')
  const error = await Effect.runPromise(
    loadConfiguration(root, { userConfigPath, projectConfigPath }).pipe(Effect.flip)
  )
  expect(error.source).toBe(projectConfigPath)
  expect(error.reason).toContain("duplicate object key")
})
