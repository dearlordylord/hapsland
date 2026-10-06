import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { createInstallationPackageFixture } from "../test-support/installation-package.ts"
import { ConfigProvider, Effect } from "effect"
import { it as effectIt } from "@effect/vitest"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync, spawnSync } from "../../scripts/test-harness/process.mjs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  installCodexIntegration,
  previewCodexInstallation
} from "@hapsland/administration/onboarding/codex-installation"
import { diagnoseInstalledIntegration, type DoctorCheck } from "@hapsland/administration/onboarding/doctor"

const runDoctor = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }))))
  )

const roots: Array<string> = []
const previousEnvironment = new Map<string, string | undefined>()
const setEnvironment = (name: string, value: string) => {
  if (!previousEnvironment.has(name)) previousEnvironment.set(name, process.env[name])
  process.env[name] = value
}
const readyCheck = (stage: string): DoctorCheck => ({ stage, status: "ready", observed: "fixture" })

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  previousEnvironment.clear()
})

describe("offline installed integration doctor", () => {
  effectIt.effect("doctor honors the caller provider and sanitizes configuration source failures", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(join(tmpdir(), "doctor-provider-"))
      roots.push(root)
      const options = {
        installation: { codexHome: root, codexExecutable: bunExecutable() },
        repository: readyCheck("file-selection"),
        credential: readyCheck("credential-accessibility")
      }
      const empty = yield* diagnoseInstalledIntegration(options).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: "" }, { preserveEmptyStrings: true }))
        ),
        Effect.result
      )
      expect(empty).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "ResidentEndpointError", operation: "resolveConfiguration" }
      })
      const privateDetail = "synthetic-private-doctor-configuration"
      const unavailable = yield* diagnoseInstalledIntegration(options).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.make(() => Effect.fail(new ConfigProvider.SourceError({ message: privateDetail })))
          )
        ),
        Effect.result
      )
      expect(unavailable).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "CodexInstallationError", reason: "Codex installation configuration is invalid" }
      })
      expect(JSON.stringify(unavailable)).not.toContain(privateDetail)
    })
  )

  it("diagnoses exact ownership and drift without mutations, provider calls, or secret disclosure", async () => {
    const root = mkdtempSync(join(tmpdir(), "doctor-"))
    roots.push(root)
    const codexHome = join(root, "codex home")
    const runtime = join(root, "runtime")
    const fakeCodex = join(root, "codex")
    writeFileSync(
      fakeCodex,
      "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli 0.155.1\\n'\n",
      { mode: 0o700 }
    )
    chmodSync(fakeCodex, 0o700)
    setEnvironment("REVIEW_INSTALL_RUNTIME", bunExecutable())
    setEnvironment("REVIEW_INSTALL_ENTRYPOINT", createInstallationPackageFixture(root))
    setEnvironment("REVIEW_RESIDENT_DIR", runtime)

    const request = { codexHome, codexExecutable: fakeCodex }
    const preview = (await runDoctor(previewCodexInstallation(request))) as { proposal?: { digest?: string } }
    expect(preview.proposal?.digest).toBeTypeOf("string")
    const proposalDigest = preview.proposal?.digest
    if (proposalDigest === undefined) throw new Error("installation preview omitted its digest")
    const installed = await runDoctor(installCodexIntegration({ ...request, proposalDigest }))
    expect(installed).toMatchObject({ status: "installed" })
    const configBefore = readFileSync(join(codexHome, "config.toml"), "utf8")
    const hooksBefore = readFileSync(join(codexHome, "hooks.json"), "utf8")
    const secret = "doctor-secret-must-not-appear"
    execFileSync("git", ["init", "--quiet", "--initial-branch=master", root])
    const publicDoctor = spawnSync(bunExecutable(), ["packages/cli-entry/src/cli.ts", "--doctor"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "doctor", cwd: root, ...request }),
      encoding: "utf8",
      env: { ...process.env, TYPESAFE_API_KEY: secret }
    })
    expect(publicDoctor.status).toBe(0)
    const publicResult = JSON.parse(publicDoctor.stdout) as { checks: Array<DoctorCheck> }
    expect(publicResult.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "credential-accessibility",
          status: "ready",
          observed: {
            inspectedContext: "doctor-process",
            configuredEnvironmentVariable: "TYPESAFE_API_KEY",
            doctorProcessEnvironment: "present",
            actualHookAccessibility: "requires-host-environment-verification",
            savedCredentialAccessibility: "not-selected-environment-precedence",
            selectedSource: "environment"
          }
        })
      ])
    )
    expect(publicDoctor.stdout).not.toContain(secret)
    const credentialHelper = join(root, "interaction-required-helper.mjs")
    writeFileSync(
      credentialHelper,
      `#!/usr/bin/env node
if (process.argv[2] === "get") console.log('{"version":1,"status":"interaction-required"}');
else console.log('{"version":1,"status":"available"}');
`,
      { mode: 0o700 }
    )
    const savedCredentialDoctor = spawnSync(bunExecutable(), ["packages/cli-entry/src/cli.ts", "--doctor"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "doctor", cwd: root, ...request }),
      encoding: "utf8",
      env: {
        ...process.env,
        TYPESAFE_API_KEY: undefined,
        REVIEW_CREDENTIAL_HELPER: credentialHelper,
        REVIEW_CREDENTIAL_STATE_PATH: join(root, "credential-state.json")
      }
    })
    const savedCredentialResult = JSON.parse(savedCredentialDoctor.stdout) as { checks: Array<DoctorCheck> }
    expect(savedCredentialResult.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "credential-accessibility",
          status: "missing",
          observed: expect.objectContaining({
            selectedSource: "saved",
            savedCredentialAccessibility: "interaction-required",
            actualHookAccessibility: "unavailable"
          }),
          action: expect.stringContaining("background hooks never prompt")
        })
      ])
    )
    const result = await runDoctor(
      diagnoseInstalledIntegration({
        installation: request,
        repository: readyCheck("file-selection"),
        credential: {
          stage: "credential-accessibility",
          status: "ready",
          observed: { source: "environment", accessible: true }
        }
      })
    )
    expect(result).toMatchObject({
      operation: "doctor",
      status: "unknown",
      offline: true,
      readOnly: true,
      providerCalls: 0,
      checks: expect.arrayContaining([
        expect.objectContaining({ stage: "package", status: "ready" }),
        expect.objectContaining({ stage: "parser", status: "ready" }),
        expect.objectContaining({ stage: "runtime", status: "ready" }),
        expect.objectContaining({ stage: "host", status: "ready" }),
        expect.objectContaining({ stage: "configuration-ownership", status: "ready" }),
        expect.objectContaining({ stage: "resident", status: "unknown" }),
        expect.objectContaining({ stage: "host-trust", status: "unknown" }),
        expect.objectContaining({ stage: "credential-accessibility", status: "ready" }),
        expect.objectContaining({ stage: "file-selection", status: "ready" })
      ])
    })
    expect(result.nextSteps.map((step) => step.stage)).toEqual(expect.arrayContaining(["resident", "host-trust"]))
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(readFileSync(join(codexHome, "config.toml"), "utf8")).toBe(configBefore)
    expect(readFileSync(join(codexHome, "hooks.json"), "utf8")).toBe(hooksBefore)

    const hooks = JSON.parse(hooksBefore) as { hooks: { PostToolUse: Array<unknown> } }
    hooks.hooks.PostToolUse.push(hooks.hooks.PostToolUse[0])
    writeFileSync(join(codexHome, "hooks.json"), `${JSON.stringify(hooks)}\n`)
    const drift = await runDoctor(
      diagnoseInstalledIntegration({
        installation: request,
        repository: readyCheck("file-selection"),
        credential: readyCheck("credential-accessibility")
      })
    )
    expect(drift).toMatchObject({
      status: "not-ready",
      checks: expect.arrayContaining([
        expect.objectContaining({ stage: "configuration-ownership", status: "conflict" })
      ])
    })
    const unsupportedWithDrift = await runDoctor(
      diagnoseInstalledIntegration({
        installation: { ...request, codexExecutable: "/bin/true" },
        repository: readyCheck("file-selection"),
        credential: readyCheck("credential-accessibility")
      })
    )
    expect(unsupportedWithDrift).toMatchObject({
      checks: expect.arrayContaining([
        expect.objectContaining({ stage: "host", status: "unsupported" }),
        expect.objectContaining({ stage: "configuration-ownership", status: "conflict" })
      ])
    })
  })
})
