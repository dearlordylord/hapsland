import { bunExecutable } from "../runtime/bun-runtime.ts"
import { SHIPPED_DEFAULT_RULES } from "../rules/shipped.ts"
import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs"
import { createInstallationPackageFixture } from "../test-support/installation-package.ts"
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { execFileSync, spawnSync } from "../../scripts/test-harness/process.mjs"
import { afterEach, describe, expect, it } from "vitest"

const roots: Array<string> = []
const setupEntrypoint = () => process.env.REVIEW_SETUP_ENTRYPOINT ?? join(process.cwd(), "src", "cli.ts")

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "review-setup-"))
  roots.push(root)
  const repository = join(root, "repository")
  const codexHome = join(root, "codex-home")
  const codexExecutable = join(root, "codex")
  mkdirSync(repository)
  mkdirSync(codexHome)
  execFileSync("git", ["init", "--quiet", repository])
  writeFileSync(
    codexExecutable,
    "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli 0.155.1\\n'\n",
    { mode: 0o700 }
  )
  chmodSync(codexExecutable, 0o700)
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(root),
    REVIEW_STATE_PATH: join(root, "consent"),
    REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
    REVIEW_CREDENTIAL_STATE_PATH: join(root, "credential-state.json"),
    TYPESAFE_API_KEY: "setup-environment-secret"
  }
  return { root, repository, codexHome, codexExecutable, environment }
}

type SetupOutput = {
  readonly error?: unknown
  readonly status: string
  readonly providerCalls: number
  readonly stages: ReadonlyArray<{
    readonly stage: string
    readonly status: string
    readonly summary: string
    readonly observed?: unknown
  }>
  readonly actions: ReadonlyArray<{
    readonly code: string
    readonly action: string
    readonly authorization?: {
      readonly installProposalDigest?: string
      readonly rulesProposalDigest?: string
      readonly consentProposalDigest?: string
    }
  }>
}

const invoke = (
  fixtureValue: ReturnType<typeof fixture>,
  request: Record<string, unknown>,
  environment: NodeJS.ProcessEnv = fixtureValue.environment
) => {
  const child = spawnSync(bunExecutable(), [setupEntrypoint(), "--setup"], {
    cwd: fixtureValue.repository,
    env: environment,
    input: JSON.stringify({
      version: 1,
      operation: "setup",
      host: "codex",
      scope: { cwd: fixtureValue.repository, review: "enabled" },
      credential: "environment",
      ...(request.host === "claude"
        ? {}
        : { codexHome: fixtureValue.codexHome, codexExecutable: fixtureValue.codexExecutable }),
      ...request
    }),
    encoding: "utf8",
    timeout: DEFAULT_CHILD_TIMEOUT_MS
  })
  expect(child.stderr).toBe("")
  const output = JSON.parse(child.stdout) as SetupOutput
  const expectedExit =
    output.error !== undefined
      ? 2
      : output.status === "needs-user-action"
        ? 6
        : output.status === "partial"
          ? 5
          : output.status === "conflict"
            ? 4
            : output.status === "unsupported"
              ? 3
              : 0
  expect(child.status).toBe(expectedExit)
  if (output.error === undefined) expect(output.providerCalls).toBe(0)
  expect(`${child.stdout}${child.stderr}`).not.toContain("setup-environment-secret")
  return output
}

const authorization = (output: SetupOutput) => ({
  rulesProposalDigest: output.actions.find((action) => action.code === "approve-default-rules")?.authorization
    ?.rulesProposalDigest,
  installProposalDigest: output.actions.find((action) => action.code === "approve-installation")?.authorization
    ?.installProposalDigest
})

const installDisabled = (test: ReturnType<typeof fixture>) => {
  writeFileSync(join(test.root, "user.jsonc"), '{"version":1,"excludes":["**/*"]}')
  const request = { scope: { cwd: test.repository, review: "disabled" }, credential: "skip" }
  const preview = invoke(test, request)
  const installProposalDigest = authorization(preview).installProposalDigest
  const completed = invoke(test, { ...request, installProposalDigest })
  expect(completed.status).toBe("completed")
}

const credentialHelper = (test: ReturnType<typeof fixture>, setStatus: string) => {
  const helper = join(test.root, `credential-${setStatus}.mjs`)
  writeFileSync(
    helper,
    `#!/usr/bin/env node
const operation = process.argv[2];
if (operation === "get") console.log('{"status":"missing"}');
else if (operation === "set") { for await (const chunk of process.stdin) void chunk; console.log(JSON.stringify({status:${JSON.stringify(setStatus)}})); }
else if (operation === "probe") console.log('{"status":"available"}');
`
  )
  chmodSync(helper, 0o700)
  return helper
}

const invokeMaskedSetup = async (
  test: ReturnType<typeof fixture>,
  environment: NodeJS.ProcessEnv,
  credential: string
) => {
  const requestPath = join(test.root, `masked-${credential.length}-${Date.now()}.json`)
  writeFileSync(
    requestPath,
    JSON.stringify({
      version: 1,
      operation: "setup",
      host: "codex",
      scope: { cwd: test.repository, review: "enabled" },
      credential: "saved",
      codexHome: test.codexHome,
      codexExecutable: test.codexExecutable,
      interactive: true
    })
  )
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const command = `${quote(bunExecutable())} ${quote(setupEntrypoint())} --setup < ${quote(requestPath)}`
  const child = spawn("script", ["-qfec", command, "/dev/null"], {
    cwd: test.repository,
    env: environment,
    stdio: ["pipe", "pipe", "pipe"]
  })
  let output = ""
  let supplied = false
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8")
    if (!supplied && output.includes("Jev API key:")) {
      supplied = true
      child.stdin.write(`${credential}\n`)
    }
  })
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8")
  })
  const exit = await new Promise<number | null>((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      rejectExit(new Error(`interactive setup timed out: ${output}`))
    }, DEFAULT_CHILD_TIMEOUT_MS)
    child.once("exit", (code) => {
      clearTimeout(timeout)
      resolveExit(code)
    })
    child.once("error", rejectExit)
  })
  expect(exit).toBe(6)
  expect(supplied).toBe(true)
  if (credential.length > 0) expect(output).not.toContain(credential)
  const encoded = output.split(/\r?\n/).find((line) => line.startsWith('{"version":1,"operation":"setup"'))
  if (encoded === undefined) throw new Error(`setup JSON was not emitted: ${output}`)
  return JSON.parse(encoded) as SetupOutput
}

describe("public resumable setup operation", () => {
  it("installs with exact approval and effective file settings without a repository grant", () => {
    const test = fixture()
    const preview = invoke(test, {})
    expect(preview.status).toBe("needs-user-action")
    expect(preview.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "compatibility", status: "complete" }),
        expect.objectContaining({ stage: "installation", status: "pending" }),
        expect.objectContaining({ stage: "credential", status: "complete" }),
        expect.objectContaining({ stage: "repository", status: "complete" }),
        expect.objectContaining({ stage: "execution-context", status: "unknown" })
      ])
    )
    const approvals = authorization(preview)
    expect(approvals.installProposalDigest).toMatch(/^[a-f0-9]{64}$/)
    const installationStage = preview.stages.find((stage) => stage.stage === "installation")
    expect(installationStage?.observed).toMatchObject({
      proposal: {
        digest: approvals.installProposalDigest,
        changes: expect.arrayContaining([
          expect.objectContaining({
            file: expect.any(String),
            beforeDigest: expect.any(String),
            afterDigest: expect.any(String)
          })
        ]),
        ownedChanges: {
          runtime: { executable: expect.any(String), args: expect.any(Array) },
          hook: {
            file: join(test.codexHome, "hooks.json"),
            matcher: "^(apply_patch|Edit|Write|Bash)$",
            handlers: [
              expect.objectContaining({ command: expect.any(String), timeout: 10 }),
              expect.objectContaining({ command: expect.any(String), timeout: 25, async: true })
            ]
          },
          ownership: { file: join(test.codexHome, ".hapsland", "installation-v1.json") }
        }
      }
    })

    const installed = invoke(test, approvals)
    expect(installed.status).toBe("needs-user-action")
    expect(installed.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "installation", status: "complete" }),
        expect.objectContaining({ stage: "repository", status: "complete" }),
        expect.objectContaining({ stage: "host-trust", status: "unknown" })
      ])
    )

    const repeated = invoke(test, authorization(invoke(test, {})))
    expect(repeated.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "installation", summary: expect.stringContaining("already installed") }),
        expect.objectContaining({ stage: "repository", summary: expect.stringContaining("file settings loaded") })
      ])
    )
    const hooks = JSON.parse(readFileSync(join(test.codexHome, "hooks.json"), "utf8")) as {
      hooks: { PostToolUse: ReadonlyArray<unknown> }
    }
    expect(hooks.hooks.PostToolUse).toHaveLength(1)
    expect(existsSync(join(test.root, "consent"))).toBe(false)
  })

  it("resumes an interrupted owned installation with the same approval", () => {
    const test = fixture()
    const preview = invoke(test, {})
    const approvals = authorization(preview)
    const interrupted = invoke(test, approvals, { ...test.environment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" })
    expect(interrupted.status).toBe("partial")
    expect(interrupted.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resume-installation",
          authorization: { installProposalDigest: approvals.installProposalDigest }
        })
      ])
    )
    expect(existsSync(join(test.codexHome, ".hapsland", "journal-v1.json"))).toBe(true)

    const pending = invoke(test, {})
    expect(pending.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "installation",
          status: "partial",
          observed: expect.objectContaining({
            recovery: expect.any(Object),
            proposal: expect.objectContaining({
              digest: approvals.installProposalDigest,
              changes: expect.any(Array),
              ownedChanges: expect.any(Object)
            })
          })
        })
      ])
    )

    const resumed = invoke(test, approvals)
    expect(resumed.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "installation", status: "complete" }),
        expect.objectContaining({ stage: "repository", status: "complete" })
      ])
    )
    expect(existsSync(join(test.codexHome, ".hapsland", "journal-v1.json"))).toBe(false)
  })

  it("asks for user exclude-all when review disabled is requested", () => {
    const test = fixture()
    const pending = invoke(test, { scope: { cwd: test.repository, review: "disabled" }, credential: "skip" })
    expect(pending.stages).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: "repository", status: "pending" })])
    )
    expect(pending.actions).toEqual(expect.arrayContaining([expect.objectContaining({ code: "exclude-all-files" })]))
  })

  it("completes with review disabled and no credential", () => {
    const test = fixture()
    writeFileSync(join(test.root, "user.jsonc"), '{"version":1,"excludes":["**/*"]}')
    const preview = invoke(test, { scope: { cwd: test.repository, review: "disabled" }, credential: "skip" })
    const installProposalDigest = authorization(preview).installProposalDigest
    const completed = invoke(test, {
      scope: { cwd: test.repository, review: "disabled" },
      credential: "skip",
      installProposalDigest
    })
    expect(completed.status).toBe("completed")
    expect(completed.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "credential", status: "skipped" }),
        expect.objectContaining({
          stage: "repository",
          status: "complete",
          summary: expect.stringContaining("exclude all files")
        }),
        expect.objectContaining({ stage: "execution-context", status: "unknown" })
      ])
    )
    expect(existsSync(join(test.root, "consent"))).toBe(false)
  })

  it("bounds noninteractive missing-secret handoff", () => {
    const test = fixture()
    const environment = { ...test.environment }
    delete environment.TYPESAFE_API_KEY
    const output = invoke(test, {}, environment)
    expect(output.status).toBe("needs-user-action")
    expect(output.actions).toEqual(expect.arrayContaining([expect.objectContaining({ code: "provide-credential" })]))
    expect(output.actions.length).toBeLessThanOrEqual(4)
  })

  it("setup and standalone credential inspection read the project file without inherited keys", () => {
    const test = fixture()
    const environment = { ...test.environment }
    delete environment.TYPESAFE_API_KEY
    const file = join(test.repository, ".env.local")
    writeFileSync(file, "TYPESAFE_API_KEY=project-setup-fixture\n")
    const result = invoke(test, {}, environment)
    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "credential",
          status: "complete",
          observed: expect.objectContaining({ file, valueDisclosed: false })
        })
      ])
    )
    const child = spawnSync(bunExecutable(), [setupEntrypoint(), "--credentials"], {
      cwd: test.repository,
      env: environment,
      input: JSON.stringify({ version: 1, operation: "credentials", cwd: test.repository }),
      encoding: "utf8",
      timeout: DEFAULT_CHILD_TIMEOUT_MS
    })
    expect(child.status).toBe(0)
    expect(JSON.parse(child.stdout)).toMatchObject({ present: true, source: "environment", file })
    expect(child.stdout + child.stderr).not.toContain("project-setup-fixture")
  })

  it("reports a rejected project key file without asking to repair native storage", () => {
    const test = fixture()
    const environment = { ...test.environment }
    delete environment.TYPESAFE_API_KEY
    const file = join(test.repository, ".env.local")
    mkdirSync(file)
    const result = invoke(test, { credential: "saved" }, environment)
    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "credential",
          status: "pending",
          observed: expect.objectContaining({ file, status: "unavailable" })
        })
      ])
    )
    const credentialActions = result.actions.filter((action) => action.code === "provide-credential")
    expect(credentialActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: expect.stringContaining(file) })])
    )
    expect(credentialActions.some((action) => action.action.includes("native credential storage"))).toBe(false)
  })

  it("distinguishes inaccessible storage from an absent key", () => {
    const test = fixture()
    const helper = join(test.root, "unavailable-helper")
    writeFileSync(helper, `#!/bin/sh\nprintf '{"status":"unavailable"}\\n'\n`, { mode: 0o700 })
    const environment = { ...test.environment, TYPESAFE_API_KEY: "", REVIEW_CREDENTIAL_HELPER: helper }
    const result = invoke(test, { credential: "saved" }, environment)
    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "credential", summary: expect.stringContaining("could not check") })
      ])
    )
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "credential", action: expect.stringContaining("TYPESAFE_API_KEY") })
      ])
    )
  })

  it("does not inspect an existing key during forced-entry preview", () => {
    const test = fixture()
    const result = invoke(test, { credential: "saved", newKey: true })
    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "credential",
          status: "pending",
          summary: expect.stringContaining("new Jev key")
        })
      ])
    )
    expect(result.providerCalls).toBe(0)
  })

  it.skipIf(process.platform !== "linux").each([
    { newKey: false, fileOverride: false },
    { newKey: true, fileOverride: false },
    { newKey: true, fileOverride: true }
  ])(
    "uses masked terminal entry with forced replacement=$newKey and file override=$fileOverride",
    async ({ newKey, fileOverride }) => {
      const test = fixture()
      const preview = invoke(test, {})
      const approvals = authorization(preview)
      invoke(test, approvals)

      const helper = join(test.root, "secret-helper.mjs")
      const vault = join(test.root, "vault")
      if (newKey) writeFileSync(vault, "old-saved-secret")
      writeFileSync(
        helper,
        `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
appendFileSync(vault + ".operations", operation + "\\n");
if (operation === "get") process.stdout.write(existsSync(vault) ? '{"status":"present"}\\n' + readFileSync(vault) : '{"status":"missing"}\\n');
else if (operation === "set") { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"status":"stored"}'); }
else if (operation === "probe") console.log('{"status":"available"}');
`
      )
      chmodSync(helper, 0o700)
      const requestPath = join(test.root, "setup-request.json")
      writeFileSync(
        requestPath,
        JSON.stringify({
          version: 1,
          operation: "setup",
          host: "codex",
          scope: { cwd: test.repository, review: "enabled" },
          credential: "saved",
          codexHome: test.codexHome,
          codexExecutable: test.codexExecutable,
          interactive: true,
          newKey
        })
      )
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
      const entrypoint = setupEntrypoint()
      const command = `${quote(bunExecutable())} ${quote(entrypoint)} --setup < ${quote(requestPath)}`
      const environment: NodeJS.ProcessEnv = {
        ...test.environment,
        REVIEW_CREDENTIAL_HELPER: helper,
        TEST_SECRET_VAULT: vault
      }
      delete environment.TYPESAFE_API_KEY
      const keyFile = join(test.repository, ".env.local")
      if (fileOverride) writeFileSync(keyFile, "TYPESAFE_API_KEY=project-override-key\n")
      const child = spawn("script", ["-qfec", command, "/dev/null"], {
        cwd: test.repository,
        env: environment,
        stdio: ["pipe", "pipe", "pipe"]
      })
      const marker = "interactive-setup-secret"
      let output = ""
      let supplied = false
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8")
        if (!supplied && output.includes("Jev API key:")) {
          supplied = true
          child.stdin.write(`${marker}\n`)
        }
      })
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8")
      })
      const exit = await new Promise<number | null>((resolveExit, rejectExit) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL")
          rejectExit(new Error(`interactive setup timed out: ${output}`))
        }, DEFAULT_CHILD_TIMEOUT_MS)
        child.once("exit", (code) => {
          clearTimeout(timeout)
          resolveExit(code)
        })
        child.once("error", rejectExit)
      })
      expect(exit).toBe(6)
      expect(supplied).toBe(true)
      expect(output).not.toContain(marker)
      expect(readFileSync(vault, "utf8")).toBe(marker)
      const operations = readFileSync(vault + ".operations", "utf8")
        .trim()
        .split("\n")
      if (newKey) expect(operations).toEqual(fileOverride ? ["set"] : ["set", "get"])
      const encoded = output.split(/\r?\n/).find((line) => line.startsWith('{"version":1,"operation":"setup"'))
      if (encoded === undefined) throw new Error(`setup JSON was not emitted: ${output}`)
      const result = JSON.parse(encoded) as SetupOutput
      if (fileOverride) {
        expect(result.stages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              stage: "credential",
              observed: expect.objectContaining({ source: "environment", file: keyFile })
            })
          ])
        )
        expect(output).not.toContain("project-override-key")
      }
      expect(result.stages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "credential", status: "complete" }),
          expect.objectContaining({ stage: "host-trust", status: "unknown" })
        ])
      )
      expect(result.providerCalls).toBe(0)
    }
  )

  it("reports cancelled masked input without falling back to stale missing state", () => {
    const test = fixture()
    installDisabled(test)
    const environment: NodeJS.ProcessEnv = {
      ...test.environment,
      REVIEW_CREDENTIAL_HELPER: credentialHelper(test, "unavailable")
    }
    delete environment.TYPESAFE_API_KEY
    const result = invoke(test, { credential: "saved", interactive: true }, environment)
    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "credential",
          status: "pending",
          observed: expect.objectContaining({ status: "cancelled", previousCredentialPreserved: true })
        })
      ])
    )
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "credential-entry-cancelled",
          action: expect.stringContaining("hapsland --login")
        })
      ])
    )
  })

  it.skipIf(process.platform !== "linux")(
    "reports invalid, unavailable, and indeterminate interactive storage outcomes",
    async () => {
      const cases = [
        { helperStatus: "unavailable", input: "", expectedStatus: "invalid", code: "replace-invalid-credential" },
        {
          helperStatus: "unavailable",
          input: "unavailable-secret",
          expectedStatus: "unavailable",
          code: "recover-credential-storage"
        },
        {
          helperStatus: "indeterminate",
          input: "indeterminate-secret",
          expectedStatus: "indeterminate",
          code: "reconcile-credential-lifecycle"
        }
      ] as const
      for (const fixtureCase of cases) {
        const test = fixture()
        installDisabled(test)
        const environment: NodeJS.ProcessEnv = {
          ...test.environment,
          REVIEW_CREDENTIAL_HELPER: credentialHelper(test, fixtureCase.helperStatus)
        }
        delete environment.TYPESAFE_API_KEY
        const result = await invokeMaskedSetup(test, environment, fixtureCase.input)
        expect(result.stages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              stage: "credential",
              status: "pending",
              observed: expect.objectContaining({
                status: fixtureCase.expectedStatus,
                ...(fixtureCase.expectedStatus === "indeterminate"
                  ? { savedCredentialUse: "suspended" }
                  : { previousCredentialPreserved: true })
              })
            })
          ])
        )
        const recovery = result.actions.find((action) => action.code === fixtureCase.code)
        expect(recovery?.action).toContain("hapsland --login")
        if (fixtureCase.expectedStatus === "indeterminate") {
          expect(recovery?.action).toContain("hapsland --logout")
        }
      }
    }
  )
})

describe("setup repository failures", () => {
  it("reports an undiscoverable scope without claiming credential readiness", () => {
    const test = fixture()
    const output = invoke(test, { scope: { cwd: test.root, review: "enabled" } })
    expect(output.status).toBe("unsupported")
    expect(output.stages.find((stage) => stage.stage === "credential")?.status).toBe("unknown")
    expect(output.stages.find((stage) => stage.stage === "repository")?.status).toBe("unsupported")
    expect(output.actions.some((action) => action.code === "select-repository")).toBe(true)
    expect(output.actions.some((action) => action.code === "provide-credential")).toBe(false)
  })

  it("reports invalid review configuration as a conflict without requesting a credential", () => {
    const test = fixture()
    writeFileSync(join(test.root, "user.jsonc"), '{"version":1,"includes":42}')
    const output = invoke(test, {})
    expect(output.status).toBe("conflict")
    expect(output.stages.find((stage) => stage.stage === "credential")?.status).toBe("unknown")
    expect(output.stages.find((stage) => stage.stage === "repository")?.status).toBe("conflict")
    expect(output.actions.some((action) => action.code === "repair-repository-configuration")).toBe(true)
    expect(output.actions.some((action) => action.code === "provide-credential")).toBe(false)
  })
})

describe("Claude setup shares the resumable credential and repository workflow", () => {
  it("requires digest approval, preserves independent hooks, and supports repeated setup", () => {
    const test = fixture()
    const claudeHome = join(test.root, "claude-home")
    mkdirSync(claudeHome)
    const claudeExecutable = join(test.root, "claude")
    writeFileSync(claudeExecutable, "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 })
    const independent = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: "independent-stop" }] }] },
      permissions: { allow: ["Read"] }
    }
    writeFileSync(join(claudeHome, "settings.json"), JSON.stringify(independent))
    const request = { host: "claude", claudeHome, claudeExecutable }
    const preview = invoke(test, request)
    expect(preview.stages.find((stage) => stage.stage === "installation")?.status).toBe("pending")
    expect(readFileSync(join(claudeHome, "settings.json"), "utf8")).toBe(JSON.stringify(independent))
    const applied = invoke(test, { ...request, ...authorization(preview) })
    expect(applied.stages.find((stage) => stage.stage === "installation")?.status).toBe("complete")
    expect(applied.stages.find((stage) => stage.stage === "credential")?.status).toBe("complete")
    expect(applied.actions.find((action) => action.code === "complete-native-trust")?.action).toContain("Claude Code")
    const settings = JSON.parse(readFileSync(join(claudeHome, "settings.json"), "utf8"))
    expect(settings.hooks.Stop[0]).toEqual(independent.hooks.Stop[0])
    expect(settings.permissions).toEqual(independent.permissions)
    const repeated = invoke(test, request)
    expect(repeated.stages.find((stage) => stage.stage === "installation")?.status).toBe("complete")
    expect(repeated.actions.some((action) => action.code === "approve-installation")).toBe(false)
    const targetEntrypoint = join(test.root, "next-cli.js")
    writeFileSync(targetEntrypoint, "// next installed entrypoint\n")
    const targetEnvironment = { ...test.environment, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint }
    const targetPreview = invoke(test, request, targetEnvironment)
    expect(targetPreview.stages.find((stage) => stage.stage === "installation")?.status).toBe("pending")
    expect(readFileSync(join(claudeHome, "settings.json"), "utf8")).not.toContain(targetEntrypoint)
    const targetApplied = invoke(test, { ...request, ...authorization(targetPreview) }, targetEnvironment)
    expect(targetApplied.stages.find((stage) => stage.stage === "installation")?.status).toBe("complete")
    expect(readFileSync(join(claudeHome, "settings.json"), "utf8")).toContain(targetEntrypoint)
  })
  it("rejects an unsupported Claude profile before writing hooks", () => {
    const test = fixture()
    const claudeHome = join(test.root, "claude-home")
    const claudeExecutable = join(test.root, "claude")
    writeFileSync(claudeExecutable, "#!/bin/sh\nprintf '1.0.0\\n'\n", { mode: 0o700 })
    const output = invoke(test, { host: "claude", claudeHome, claudeExecutable })
    expect(output.status).toBe("unsupported")
    expect(existsSync(join(claudeHome, "settings.json"))).toBe(false)
  })
})

it("binds editable defaults and configuration to setup authorization and preserves authored content", () => {
  const test = fixture()
  const path = join(test.root, "rules", "defaults", `${SHIPPED_DEFAULT_RULES[0]?.id}.json`)
  const preview = invoke(test, {})
  expect(existsSync(path)).toBe(false)
  expect(existsSync(join(test.root, "user.jsonc"))).toBe(false)
  const authorized = authorization(preview)
  expect(authorized.rulesProposalDigest).toMatch(/^[a-f0-9]{64}$/)
  invoke(test, authorized)
  expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ version: 1, id: SHIPPED_DEFAULT_RULES[0]?.id })
  for (const rule of SHIPPED_DEFAULT_RULES)
    expect(existsSync(join(test.root, "rules", "defaults", `${rule.id}.json`))).toBe(true)
  expect(JSON.parse(readFileSync(join(test.root, "user.jsonc"), "utf8")).rules).toContain(path)
  const edited = JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), question: "Preserved authored concern" })
  writeFileSync(path, edited)
  invoke(test, {})
  expect(readFileSync(path, "utf8")).toBe(edited)
  rmSync(path)
  invoke(test, {})
  expect(existsSync(path)).toBe(false)
})

it.each(["changed", "malformed"])("rejects %s default rules before installing an approved setup", (variant) => {
  const test = fixture()
  const approved = authorization(invoke(test, {}))
  const path = join(test.root, "rules", "defaults", `${SHIPPED_DEFAULT_RULES[0]?.id}.json`)
  mkdirSync(join(test.root, "rules", "defaults"), { recursive: true })
  const original = readFileSync(join(process.cwd(), "src", "rules", "defaults", "r1_inferred_case.json"), "utf8")
  writeFileSync(
    path,
    variant === "malformed"
      ? '{"version":1,"question":null}'
      : JSON.stringify({ ...JSON.parse(original), question: "New authored concern after approval" })
  )
  const authored = readFileSync(path, "utf8")
  const rejected = invoke(test, approved)
  expect(rejected.error).toEqual({
    code: "invalid_request",
    message: "input does not satisfy a supported command contract"
  })
  expect(existsSync(join(test.codexHome, "hooks.json"))).toBe(false)
  expect(existsSync(join(test.root, "user.jsonc"))).toBe(false)
  expect(readFileSync(path, "utf8")).toBe(authored)
})

it("unattended setup previews without writes, applies a saved plan and rejects stale authored bytes", () => {
  const test = fixture()
  const plan = join(test.root, "setup-plan.json")
  const run = (...args: string[]) =>
    spawnSync(bunExecutable(), [setupEntrypoint(), "setup", ...args], {
      cwd: test.repository,
      env: { ...test.environment, HAPSLAND_ACTIVE_DISPATCH: "1" },
      encoding: "utf8",
      timeout: DEFAULT_CHILD_TIMEOUT_MS
    })
  const choices = [
    "codex",
    "--no-input",
    "--review",
    "enabled",
    "--credential",
    "environment",
    "--codex-home",
    test.codexHome,
    "--codex-executable",
    test.codexExecutable,
    "--json"
  ]
  const preview = run(...choices, "--save-plan", plan)
  expect(preview.stderr).toBe("")
  expect(existsSync(join(test.codexHome, "config.toml"))).toBe(false)
  expect(existsSync(join(test.root, "user.jsonc"))).toBe(false)
  expect(existsSync(join(test.root, `rules/defaults/${SHIPPED_DEFAULT_RULES[0]?.id}.json`))).toBe(false)
  expect(JSON.parse(preview.stdout)).toMatchObject({ providerCalls: 0, paidVerificationPerformed: false })
  expect(existsSync(plan)).toBe(true)
  const applied = run("--no-input", "--apply-plan", plan, "--json")
  expect(applied.stderr).toBe("")
  expect(JSON.parse(applied.stdout)).toMatchObject({
    status: "needs-user-action",
    stages: expect.arrayContaining([
      expect.objectContaining({ stage: "installation", status: "complete" }),
      expect.objectContaining({ stage: "rules", status: "complete" }),
      expect.objectContaining({ stage: "host-trust", status: "unknown" })
    ])
  })
  expect(existsSync(join(test.root, `rules/defaults/${SHIPPED_DEFAULT_RULES[0]?.id}.json`))).toBe(true)
  const next = join(test.root, "next-plan.json")
  run(...choices, "--save-plan", next)
  const path = join(test.root, `rules/defaults/${SHIPPED_DEFAULT_RULES[0]?.id}.json`)
  const edited = readFileSync(path, "utf8") + " "
  writeFileSync(path, edited)
  const stale = run("--no-input", "--apply-plan", next, "--json")
  expect(stale.status).toBe(4)
  expect(JSON.parse(stale.stdout).status).toBe("proposal-mismatch")
  expect(readFileSync(path, "utf8")).toBe(edited)
  const custom = join(test.root, "disabled-custom.json")
  writeFileSync(custom, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), id: "disabled-custom" }))
  const configurationPath = join(test.root, "user.jsonc")
  const configuration = JSON.parse(readFileSync(configurationPath, "utf8"))
  configuration.rules.push({ path: custom, enabled: false })
  writeFileSync(configurationPath, JSON.stringify(configuration))
  const disabledPlan = join(test.root, "disabled-plan.json")
  run(...choices, "--save-plan", disabledPlan)
  writeFileSync(
    custom,
    JSON.stringify({ ...JSON.parse(readFileSync(custom, "utf8")), question: "Changed disabled authored source" })
  )
  const disabledStale = run("--no-input", "--apply-plan", disabledPlan, "--json")
  expect(disabledStale.status).toBe(4)
  expect(JSON.parse(disabledStale.stdout).status).toBe("proposal-mismatch")
  expect(run("--no-input").status).toBe(6)
})
