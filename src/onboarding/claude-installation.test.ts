import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"
import { ConfigProvider, Effect } from "effect"
import { createHash } from "node:crypto"
import { canonicalJson } from "@hapsland/administration/onboarding/hook-reconciliation"
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  diagnoseClaudeIntegration,
  inspectClaudeInstallation,
  installClaudeIntegration,
  previewClaudeInstallation,
  previewClaudeUpdate,
  uninstallClaudeIntegration,
  updateClaudeIntegration
} from "@hapsland/administration/onboarding/claude-installation"

const testConfiguration = () => ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }))
const runPreview = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(testConfiguration())))
const runInstallation = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(testConfiguration())))

const roots: string[] = []
afterEach(() => {
  delete process.env.REVIEW_INSTALL_RUNTIME
  delete process.env.REVIEW_INSTALL_ENTRYPOINT
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const fixture = (version = "2.1.218") => {
  const root = mkdtempSync(join(tmpdir(), "claude installation ' "))
  roots.push(root)
  const home = join(root, "custom .claude")
  mkdirSync(home)
  const claudeExecutable = join(root, "claude fake")
  writeFileSync(claudeExecutable, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`)
  chmodSync(claudeExecutable, 0o700)
  const entrypoint = join(root, "cli.js")
  writeFileSync(entrypoint, "process.stdin.resume();\n")
  process.env.REVIEW_INSTALL_RUNTIME = bunExecutable()
  process.env.REVIEW_INSTALL_ENTRYPOINT = entrypoint
  return { root, home, claudeExecutable }
}

const settings = (home: string) =>
  JSON.parse(readFileSync(join(home, "settings.json"), "utf8")) as Record<string, unknown>
const digestOf = (preview: object) => {
  const proposal = (preview as { proposal?: { digest: string } }).proposal
  expect(proposal?.digest).toMatch(/^[a-f0-9]{64}$/)
  return proposal!.digest
}

describe("Claude installation lifecycle", () => {
  it.each(["REVIEW_INSTALL_RUNTIME", "REVIEW_INSTALL_ENTRYPOINT"])(
    "rejects empty %s before installation writes",
    async (key) => {
      const { home, claudeExecutable } = fixture()
      const result = await Effect.runPromise(
        installClaudeIntegration({ claudeHome: home, claudeExecutable }).pipe(
          Effect.result,
          Effect.provide(
            ConfigProvider.layer(ConfigProvider.fromUnknown({ [key]: "" }, { preserveEmptyStrings: true }))
          )
        )
      )
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { reason: "Claude installation configuration is invalid" }
      })
      expect(existsSync(join(home, "settings.json"))).toBe(false)
      expect(existsSync(join(home, ".hapsland"))).toBe(false)
    }
  )

  it("uses caller configuration instead of ambient installation inputs", async () => {
    const { root, home, claudeExecutable } = fixture()
    process.env.REVIEW_INSTALL_RUNTIME = ""
    process.env.REVIEW_INSTALL_ENTRYPOINT = ""
    const preview = await Effect.runPromise(
      previewClaudeInstallation({ claudeHome: home, claudeExecutable }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown(
              { REVIEW_INSTALL_RUNTIME: bunExecutable(), REVIEW_INSTALL_ENTRYPOINT: join(root, "cli.js") },
              { preserveEmptyStrings: true }
            )
          )
        )
      )
    )
    expect(preview.status).toBe("preview")
    expect(digestOf(preview)).toMatch(/^[a-f0-9]{64}$/)
    expect(existsSync(join(home, "settings.json"))).toBe(false)
  })

  it("previews a pinned host, preserves unrelated settings, and removes only its owned hook", async () => {
    const { home, claudeExecutable } = fixture()
    const original = {
      permissions: { allow: ["Read"] },
      hooks: {
        PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "other-tool" }] }],
        Stop: [{ hooks: [{ type: "command", command: "stop-tool" }] }]
      }
    }
    writeFileSync(join(home, "settings.json"), JSON.stringify(original))
    const request = { claudeHome: home, claudeExecutable }
    const preview = await runPreview(previewClaudeInstallation(request))
    expect(preview.status).toBe("preview")
    expect(preview).not.toHaveProperty("sourceEgressAuthorized")
    expect(settings(home)).toEqual(original)
    expect(
      (await runInstallation(installClaudeIntegration({ ...request, proposalDigest: digestOf(preview) }))).status
    ).toBe("complete")
    const installed = settings(home)
    expect(installed.permissions).toEqual(original.permissions)
    const installedHooks = installed.hooks as typeof original.hooks & {
      PreToolUse: unknown[]
      UserPromptSubmit: unknown[]
      SubagentStop: unknown[]
    }
    expect(installedHooks.PreToolUse).toHaveLength(1)
    expect(JSON.stringify(installedHooks.PreToolUse)).toContain("exec ")
    expect(JSON.stringify(installedHooks.PreToolUse)).toContain("--composed-before-edit-hook")
    expect(installedHooks.Stop[0]).toEqual(original.hooks.Stop[0])
    expect(installedHooks.Stop).toHaveLength(2)
    expect(JSON.stringify(installedHooks.Stop[1])).toContain("--composed-stop-hook")
    expect(JSON.stringify(installedHooks.UserPromptSubmit)).toContain("--composed-prompt-hook")
    expect(installedHooks.SubagentStop).toHaveLength(1)
    expect(JSON.stringify(installedHooks.SubagentStop)).toContain("--composed-stop-hook")
    const post = (installed.hooks as typeof original.hooks).PostToolUse
    expect(post[0]).toEqual(original.hooks.PostToolUse[0])
    expect(post).toHaveLength(2)
    expect(JSON.stringify(post[1])).toContain("--claude-hook")
    expect(JSON.stringify(post[1])).not.toContain("--composed-background-hook")
    expect(JSON.stringify(post[1])).not.toContain('"async":true')
    expect(JSON.stringify(post[1])).toContain("--review-tool-owned=claude-v1")
    expect(((await runPreview(inspectClaudeInstallation(request))) as { installed?: boolean }).installed).toBe(true)
    const removal = await runInstallation(uninstallClaudeIntegration(request))
    expect(removal.status).toBe("preview")
    expect(
      (await runInstallation(uninstallClaudeIntegration({ ...request, proposalDigest: digestOf(removal) }))).status
    ).toBe("complete")
    expect(settings(home)).toEqual(original)
    expect(((await runPreview(inspectClaudeInstallation(request))) as { installed?: boolean }).installed).toBe(false)
  })

  it("updates an older owned installation to add SubagentStop", async () => {
    const { home, claudeExecutable } = fixture()
    const request = { claudeHome: home, claudeExecutable }
    await runInstallation(
      installClaudeIntegration({
        ...request,
        proposalDigest: digestOf(await runPreview(previewClaudeInstallation(request)))
      })
    )
    const previous = settings(home)
    delete (previous.hooks as Record<string, unknown>).SubagentStop
    writeFileSync(join(home, "settings.json"), JSON.stringify(previous))
    const recordPath = join(home, ".hapsland", "claude-installation-v1.json")
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { composed: { subagentStopDigest?: string } }
    delete record.composed.subagentStopDigest
    writeFileSync(recordPath, JSON.stringify(record))
    const proposal = await runPreview(previewClaudeUpdate(request))
    expect(proposal.status).toBe("preview")
    expect(
      (await runInstallation(updateClaudeIntegration({ ...request, proposalDigest: digestOf(proposal) }))).status
    ).toBe("complete")
    expect((settings(home).hooks as Record<string, unknown>).SubagentStop).toBeDefined()
  })

  it("updates an owned asynchronous PostToolUse group to synchronous delivery while preserving Stop", async () => {
    const { home, claudeExecutable } = fixture()
    const request = { claudeHome: home, claudeExecutable }
    await runInstallation(
      installClaudeIntegration({
        ...request,
        proposalDigest: digestOf(await runPreview(previewClaudeInstallation(request)))
      })
    )
    const previous = settings(home)
    const hooks = previous.hooks as Record<string, Array<{ hooks: unknown[] }>>
    const group = hooks.PostToolUse![0]!
    group.hooks.push({
      type: "command",
      command: "old-cli --composed-background-hook --composed-host=claude-code --review-tool-composed-owned=claude-v1",
      timeout: 25,
      async: true
    })
    writeFileSync(join(home, "settings.json"), JSON.stringify(previous))
    const recordPath = join(home, ".hapsland", "claude-installation-v1.json")
    const record = JSON.parse(readFileSync(recordPath, "utf8"))
    record.hookGroups.PostToolUse = group
    record.hookDigest = createHash("sha256").update(canonicalJson(group)).digest("hex")
    writeFileSync(recordPath, JSON.stringify(record))
    const proposal = await runPreview(previewClaudeUpdate(request))
    expect(proposal.status).toBe("preview")
    expect(
      (await runInstallation(updateClaudeIntegration({ ...request, proposalDigest: digestOf(proposal) }))).status
    ).toBe("complete")
    const updated = settings(home).hooks as typeof hooks
    expect(updated.PostToolUse![0]!.hooks).toHaveLength(1)
    expect(JSON.stringify(updated.PostToolUse)).not.toContain("--composed-background-hook")
    expect(updated.Stop).toEqual(hooks.Stop)
    expect(updated.SubagentStop).toEqual(hooks.SubagentStop)
    expect(await runPreview(inspectClaudeInstallation(request))).toMatchObject({ installed: true })
  })

  it("requires the exact tested host profile and an approval digest", async () => {
    const { home, claudeExecutable } = fixture("2.1.219")
    const request = { claudeHome: home, claudeExecutable }
    expect((await runPreview(previewClaudeInstallation(request))).status).toBe("unsupported")
    expect(
      (await runInstallation(installClaudeIntegration({ ...request, proposalDigest: "0".repeat(64) }))).status
    ).toBe("unsupported")
    expect(((await runPreview(inspectClaudeInstallation(request))) as { installed?: boolean }).installed).toBe(false)
    expect(
      (await runPreview(diagnoseClaudeIntegration(request))).checks.find((check) => check.stage === "host")?.status
    ).toBe("unsupported")
  })

  it("detects concurrent settings edits and locally modified owned entries", async () => {
    const { home, claudeExecutable } = fixture()
    const request = { claudeHome: home, claudeExecutable }
    const proposal = await runPreview(previewClaudeInstallation(request))
    writeFileSync(join(home, "settings.json"), JSON.stringify({ custom: true }))
    expect(
      (await runInstallation(installClaudeIntegration({ ...request, proposalDigest: digestOf(proposal) }))).status
    ).toBe("proposal-mismatch")
    const current = await runPreview(previewClaudeInstallation(request))
    expect(
      (await runInstallation(installClaudeIntegration({ ...request, proposalDigest: digestOf(current) }))).status
    ).toBe("complete")
    const changed = settings(home)
    const hooks = (changed.hooks as { PostToolUse: Array<{ matcher: string }> }).PostToolUse
    hooks[0]!.matcher = "Write"
    writeFileSync(join(home, "settings.json"), JSON.stringify(changed))
    expect((await runPreview(inspectClaudeInstallation(request))).status).toBe("conflict")
    expect((await runInstallation(uninstallClaudeIntegration(request))).status).toBe("conflict")
    expect(settings(home)).toEqual(changed)
  })

  it.each(["Stop", "SubagentStop"] as const)("rejects a locally modified owned %s hook", async (event) => {
    const { home, claudeExecutable } = fixture()
    const request = { claudeHome: home, claudeExecutable }
    await runInstallation(
      installClaudeIntegration({
        ...request,
        proposalDigest: digestOf(await runPreview(previewClaudeInstallation(request)))
      })
    )
    const changed = settings(home)
    const stop = (changed.hooks as Record<typeof event, Array<{ hooks: Array<{ timeout: number }> }>>)[event]
    stop[0]!.hooks[0]!.timeout = 3
    writeFileSync(join(home, "settings.json"), JSON.stringify(changed))
    expect((await runPreview(inspectClaudeInstallation(request))).status).toBe("conflict")
    expect((await runInstallation(uninstallClaudeIntegration(request))).status).toBe("conflict")
  })

  it("updates only the owned hook and keeps host trust separate from source egress", async () => {
    const { home, claudeExecutable, root } = fixture()
    const request = { claudeHome: home, claudeExecutable }
    const initial = await runPreview(previewClaudeInstallation(request))
    await runInstallation(installClaudeIntegration({ ...request, proposalDigest: digestOf(initial) }))
    const replacement = join(root, "new-cli.js")
    writeFileSync(replacement, "process.stdin.resume();\n")
    process.env.REVIEW_INSTALL_ENTRYPOINT = replacement
    const preview = await runPreview(previewClaudeUpdate(request))
    expect(preview.status).toBe("preview")
    expect(
      (await runInstallation(updateClaudeIntegration({ ...request, proposalDigest: digestOf(preview) }))).status
    ).toBe("complete")
    expect(JSON.stringify(settings(home))).toContain("new-cli.js")
    expect(((await runPreview(inspectClaudeInstallation(request))) as { installed?: boolean }).installed).toBe(true)
    const doctor = await runPreview(diagnoseClaudeIntegration(request))
    expect(doctor.providerCalls).toBe(0)
    expect(doctor.checks.find((check) => check.stage === "native-trust")?.status).toBe("unknown")
    expect(doctor.checks.find((check) => check.stage === "file-selection")?.status).toBe("unknown")
  })
})

it.each(["PostToolUse", "PreToolUse", "Stop", "SubagentStop", "UserPromptSubmit", "foreground"])(
  "repairs deleted Claude %s without losing user settings",
  async (missing) => {
    const { home, claudeExecutable } = fixture()
    const request = { claudeHome: home, claudeExecutable }
    writeFileSync(join(home, "settings.json"), JSON.stringify({ permissions: { allow: ["Read"] }, custom: 42 }))
    await runInstallation(
      installClaudeIntegration({
        ...request,
        proposalDigest: digestOf(await runPreview(previewClaudeInstallation(request)))
      })
    )
    const changed = settings(home) as {
      hooks: Record<string, Array<{ hooks: unknown[] }>>
      permissions: unknown
      custom: number
    }
    if (missing === "foreground") changed.hooks.PostToolUse![0]!.hooks.splice(0, 1)
    else delete changed.hooks[missing]
    writeFileSync(join(home, "settings.json"), JSON.stringify(changed))
    expect((await runPreview(inspectClaudeInstallation(request))).status).toBe("conflict")
    const proposal = await runPreview(previewClaudeUpdate(request))
    expect(proposal.status).toBe("preview")
    expect(
      (await runInstallation(updateClaudeIntegration({ ...request, proposalDigest: digestOf(proposal) }))).status
    ).toBe("complete")
    expect(await runPreview(inspectClaudeInstallation(request))).toMatchObject({ installed: true })
    expect(settings(home)).toMatchObject({ permissions: { allow: ["Read"] }, custom: 42 })
    expect(await runPreview(previewClaudeUpdate(request))).toMatchObject({
      alreadyCurrent: true,
      proposal: { changes: [] }
    })
  }
)

it("explicit Claude reinstall replaces changed and duplicate marked handlers while preserving independent handlers", async () => {
  const { home, claudeExecutable } = fixture()
  const request = { claudeHome: home, claudeExecutable }
  await runInstallation(
    installClaudeIntegration({
      ...request,
      proposalDigest: digestOf(await runPreview(previewClaudeInstallation(request)))
    })
  )
  const changed = settings(home) as {
    hooks: Record<string, Array<{ hooks: Array<{ command: string; timeout?: number }> }>>
  }
  changed.hooks.PostToolUse![0]!.hooks[0]!.timeout = 99
  changed.hooks.PostToolUse![0]!.hooks.push({ command: "independent-handler" })
  changed.hooks.Stop!.push(structuredClone(changed.hooks.Stop![0]!))
  writeFileSync(join(home, "settings.json"), JSON.stringify(changed))
  expect((await runPreview(previewClaudeUpdate(request))).status).toBe("conflict")
  const reinstall = { ...request, reinstall: true }
  const proposal = await runPreview(previewClaudeInstallation(reinstall))
  expect(
    (await runInstallation(installClaudeIntegration({ ...reinstall, proposalDigest: digestOf(proposal) }))).status
  ).toBe("complete")
  expect(await runPreview(inspectClaudeInstallation(request))).toMatchObject({ installed: true })
  expect(JSON.stringify(settings(home))).toContain("independent-handler")
  expect(JSON.stringify(settings(home))).not.toContain('"timeout":99')
})

it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "rolls back a published record when settings cannot be written",
  async () => {
    const { home, claudeExecutable } = fixture()
    const settingsPath = join(home, "settings.json")
    const ownershipDirectory = join(home, ".hapsland")
    mkdirSync(ownershipDirectory, { mode: 0o700 })
    const original = JSON.stringify({ userSetting: "retained" })
    writeFileSync(settingsPath, original)
    const request = { claudeHome: home, claudeExecutable }
    const preview = await runPreview(previewClaudeInstallation(request))
    chmodSync(home, 0o500)
    try {
      const result = await runInstallation(installClaudeIntegration({ ...request, proposalDigest: digestOf(preview) }))
      expect(result.status).toBe("conflict")
      expect(readFileSync(settingsPath, "utf8")).toBe(original)
      expect(existsSync(join(ownershipDirectory, "claude-installation-v1.json"))).toBe(false)
    } finally {
      chmodSync(home, 0o700)
    }
  }
)
