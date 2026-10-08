import {
  installedResidentUpdateJourney,
  type UpdateJourneyPorts
} from "@hapsland/build-tooling/test-support/installed-resident-update"
import { prepareTestPackage } from "@hapsland/build-tooling/test-support/test-package"
import { spawnSync } from "../../scripts/test-harness/process.mjs"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import assert from "node:assert/strict"
import { it } from "vitest"

const ports: UpdateJourneyPorts = {
  run: async (command, args, options = {}) => {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      input: options.input,
      encoding: "utf8",
      timeout: options.timeoutMs ?? 30_000
    })
    if (result.error) throw result.error
    return { code: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
  },
  parse: (result, label, expectedExit) => {
    assert.equal(result.code, expectedExit, `${label}: ${result.stderr || result.stdout}`)
    return JSON.parse(result.stdout) as unknown
  },
  expect: (condition, message) => assert.ok(condition, message),
  quote: (value) => `'${value.replaceAll("'", "'\\''")}'`
}
it("installed updates replace idle and busy residents, retain failed selection, and keep runtime hooks independent", async () => {
  const installed = prepareTestPackage()
  const temporary = mkdtempSync(join(tmpdir(), "hapsland-update-"))
  const repository = join(temporary, "repository")
  const codexHome = join(temporary, "codex-home")
  const codexExecutable = join(temporary, "codex")
  mkdirSync(repository)
  writeFileSync(
    codexExecutable,
    '#!/bin/sh\nif [ "$1" = features ]; then printf "hooks stable true\\n"; else printf "codex-cli 0.155.1\\n"; fi\n'
  )
  chmodSync(codexExecutable, 0o700)
  const environment = {
    ...installed.environment,
    REVIEW_STATE_PATH: join(temporary, "consent"),
    REVIEW_USER_CONFIG_PATH: join(temporary, "user.jsonc"),
    REVIEW_RESIDENT_DIR: join(temporary, "resident"),
    TYPESAFE_API_KEY: "offline-fixture-key",
    REVIEW_CONTROL_JSON: "{}"
  }
  const cli = installed.cli.executable
  try {
    await ports.run("/usr/bin/git", ["init", "--quiet", repository])
    const request = {
      version: 1,
      operation: "setup",
      host: "codex",
      scope: { cwd: repository, review: "enabled" },
      credential: "environment",
      codexHome,
      codexExecutable
    }
    const setup = async (extra = {}) => {
      const result = await ports.run(cli, ["--setup"], {
        cwd: repository,
        env: environment,
        input: JSON.stringify({ ...request, ...extra })
      })
      return JSON.parse(result.stdout) as {
        status: string
        actions: { code: string; authorization?: Record<string, string> }[]
      }
    }
    const preview = await setup()
    const approved = await setup({
      installProposalDigest: preview.actions.find((action) => action.code === "approve-installation")?.authorization
        ?.installProposalDigest
    })
    const rules = approved.actions.find((action) => action.code === "approve-default-rules")?.authorization
      ?.rulesProposalDigest
    if (rules !== undefined) await setup({ rulesProposalDigest: rules })
    const archive = installed.archivePath
    await installedResidentUpdateJourney(
      { cli, archive, temporary, repository, codexHome, codexExecutable, environment },
      ports
    )
  } finally {
    installed.cleanup()
    rmSync(temporary, { recursive: true, force: true })
  }
}, 120_000)
