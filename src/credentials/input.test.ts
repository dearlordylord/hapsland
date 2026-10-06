import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { ConfigProvider, Effect, Redacted } from "effect"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { beforeEach, afterEach, expect, it } from "vitest"
import { resolveCredentialInput } from "@hapsland/runtime-inputs/credentials/input"

let root: string
let userDirectory: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hapsland-key-input-"))
  userDirectory = join(root, "user")
  mkdirSync(userDirectory)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
const readInput = (environment: Record<string, string> = {}, extra = {}) =>
  Effect.runPromise(
    resolveCredentialInput({ envVar: "TYPESAFE_API_KEY", root, userDirectory, ...extra }).pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(environment, { preserveEmptyStrings: true })))
    )
  )

const read = async (environment: Record<string, string> = {}, extra = {}) => {
  const input = await readInput(environment, extra)
  return input.value === undefined ? input : { ...input, value: Redacted.value(input.value) }
}

it("keeps a discovered credential redacted until an explicit dispatch boundary", async () => {
  writeFileSync(join(root, ".env"), "TYPESAFE_API_KEY=synthetic-redaction-fixture\n")
  const input = await readInput()
  expect(Redacted.isRedacted(input.value)).toBe(true)
  expect(JSON.stringify(input)).not.toContain("synthetic-redaction-fixture")
})

it("uses explicit environment, project local, project, user, then absence", async () => {
  writeFileSync(join(userDirectory, ".env"), "TYPESAFE_API_KEY=user-fixture\n")
  expect(await read()).toEqual({ value: "user-fixture", file: join(userDirectory, ".env") })
  writeFileSync(join(root, ".env"), "TYPESAFE_API_KEY=project-fixture\n")
  expect(await read()).toEqual({ value: "project-fixture", file: join(root, ".env") })
  writeFileSync(join(root, ".env.local"), 'export TYPESAFE_API_KEY="local # fixture" # comment\n')
  expect(await read()).toEqual({ value: "local # fixture", file: join(root, ".env.local") })
  expect(await read({ TYPESAFE_API_KEY: "explicit" })).toEqual({ value: "explicit" })
  expect(await read({ TYPESAFE_API_KEY: "" })).toEqual({ value: "" })
  expect(await read({}, { environmentValue: "captured" })).toEqual({ value: "captured" })
  expect(await read({}, { environmentValue: null })).toEqual({ value: undefined })
})

it("ignores empty file keys and unrelated fields; honors the configured key name", async () => {
  writeFileSync(join(root, ".env.local"), "TYPESAFE_API_KEY=\n")
  writeFileSync(join(root, ".env"), "UNRELATED=fixture\nALT_KEY='custom fixture'\n")
  expect(await read()).toEqual({})
  expect(await read({}, { envVar: "ALT_KEY" })).toEqual({ value: "custom fixture", file: join(root, ".env") })
  const unscoped = resolveCredentialInput({ envVar: "ALT_KEY" }).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))
  )
  expect(await Effect.runPromise(unscoped)).toEqual({})
})

it.each(["directory", "symlink", "oversized"])(
  "rejects %s credential files without falling through or disclosing contents",
  async (kind) => {
    const file = join(root, ".env.local")
    if (kind === "directory") mkdirSync(file)
    if (kind === "symlink") symlinkSync(join(root, "missing"), file)
    if (kind === "oversized") writeFileSync(file, "DO_NOT_DISCLOSE=" + "x".repeat(65_536))
    writeFileSync(join(root, ".env"), "TYPESAFE_API_KEY=lower-priority\n")
    await expect(read()).rejects.toMatchObject({ _tag: "CredentialInputError" })
  }
)

it("a fresh process independently reads the file without inherited key or environment mutation", () => {
  writeFileSync(join(root, ".env"), "TYPESAFE_API_KEY=synthetic-fresh-process\nUNRELATED=must-not-load\n")
  const environment = { ...process.env }
  delete environment.TYPESAFE_API_KEY
  delete environment.UNRELATED
  const module = fileURLToPath(new URL("./input.ts", import.meta.url))
  const script = `import {resolveCredentialInput} from ${JSON.stringify(module)};
    import {Effect,ConfigProvider,Redacted} from "effect";
    const input=await Effect.runPromise(resolveCredentialInput(${JSON.stringify({ envVar: "TYPESAFE_API_KEY", root, userDirectory })}).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({preserveEmptyStrings:true})))));
    console.log(JSON.stringify({present:input.value !== undefined && Redacted.value(input.value) === "synthetic-fresh-process",file:input.file === ${JSON.stringify(join(root, ".env"))},unchanged:process.env.TYPESAFE_API_KEY === undefined && process.env.UNRELATED === undefined}));`
  const result = spawnSync(bunExecutable(), ["--input-type=module", "-e", script], {
    env: environment,
    encoding: "utf8",
    timeout: 10_000
  })
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ present: true, file: true, unchanged: true })
  expect(result.stdout).not.toContain("synthetic-fresh-process")
})
