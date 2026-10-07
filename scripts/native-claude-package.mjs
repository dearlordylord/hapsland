import { preparePackageInstall } from "./test-harness/package-install.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { executeNative } from "./native-process.mjs"
import { nativePackageAssetsDigest } from "./native-package-assets.mjs"
import { commandHooks, commandHookGroup } from "@hapsland/runtime-environment/runtime/hook-catalog"
import { createHash } from "node:crypto"
import { readFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"

const hash = (value) => createHash("sha256").update(value).digest("hex")
export const validateClaudeArchiveProfile = ({
  host,
  language,
  scenario,
  mode,
  coexistence,
  unicodeUpdate,
  archivePath
}) => {
  if (archivePath === undefined) return
  if (
    !archivePath ||
    host !== "claude" ||
    language !== "typescript" ||
    scenario !== "adoption" ||
    mode !== "controlled-offline" ||
    coexistence !== undefined ||
    unicodeUpdate
  )
    throw new Error(
      "Claude archive mode requires controlled TypeScript adoption without coexistence or Unicode mutation"
    )
}

export const claudeRegisteredCommands = (settings, hookExecutable) => {
  const result = {}
  for (const [kind, definition] of Object.entries(commandHooks.claude)) {
    const groups = settings.hooks?.[definition.event] ?? []
    const handlers = groups.flatMap((group) => group.hooks ?? [])
    const expected = commandHookGroup("claude", definition.event, {
      command: `'${hookExecutable.replaceAll("'", "'\\''")}'`,
      editMarker: "--review-tool-owned=claude-v1",
      composedMarker: "--review-tool-composed-owned=claude-v1"
    }).hooks.find((handler) => definition.flags.every((flag) => handler.command.split(" ").includes(flag)))
    const selected = handlers.filter(
      (handler) =>
        typeof handler.command === "string" &&
        definition.flags.every((flag) => handler.command.split(" ").includes(flag))
    )
    if (
      selected.length !== 1 ||
      selected[0].type !== "command" ||
      selected[0].timeout !== definition.timeout ||
      (selected[0].async === true) !== (definition.async === true) ||
      groups.length !== 1 ||
      groups[0].matcher !== definition.matcher ||
      selected[0].command !== expected?.command
    )
      throw new Error(`Installed Claude catalog variant is missing, changed or targets another hook: ${kind}`)
    result[kind === "beforeEdit" ? "before-edit" : kind === "afterEdit" ? "edit" : kind] = selected[0].command
  }
  const count = Object.values(settings.hooks ?? {}).flatMap((groups) =>
    groups.flatMap((group) => group.hooks ?? [])
  ).length
  if (count !== Object.keys(commandHooks.claude).length)
    throw new Error("Installed Claude registrations contain missing or unexpected handlers")
  return result
}

export const instrumentClaudeRegistrations = (settings, commands, observerCommand) => ({
  ...settings,
  hooks: Object.fromEntries(
    Object.entries(settings.hooks).map(([event, groups]) => [
      event,
      groups.map((group) => ({
        ...group,
        hooks: group.hooks.map((handler) => {
          const match = Object.entries(commands).filter(([kind, command]) => {
            const catalogKind = kind === "before-edit" ? "beforeEdit" : kind === "edit" ? "afterEdit" : kind
            return command === handler.command && commandHooks.claude[catalogKind]?.event === event
          })
          if (match.length !== 1) throw new Error("Cannot instrument an unaccounted installed Claude command")
          return { ...handler, command: observerCommand(match[0][0]) }
        })
      }))
    ])
  )
})

export async function installClaudeNativeArchive({ project, archivePath, installation, execute = executeNative }) {
  const archive = resolve(archivePath)
  const archiveSha256 = hash(readFileSync(archive))
  const installer = await preparePackageInstall(installation, archive, {
    ...process.env,
    HAPSLAND_BUILD_BUN: resolveBunRuntime().executable
  })
  const result = await execute(installer.executable, installer.args, { cwd: installation, timeout: 240000 })
  if (result.code !== 0) throw new Error(`Claude archive installation failed (exit ${result.code ?? "signal"})`)
  const root = join(installation, "node_modules/@hapsland/hapsland")
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(readFileSync(join(project, "package.json"), "utf8"))))
    throw new Error("Installed Claude archive manifest differs from the current package")
  if (hash(readFileSync(archive)) !== archiveSha256) throw new Error("Claude archive changed during installation")
  const assets = nativePackageAssetsDigest(root)
  if (assets.sha256 !== nativePackageAssetsDigest(project).sha256)
    throw new Error("Installed Claude archive assets differ from the current build")
  return {
    root,
    cli: join(installation, "node_modules/.bin/hapsland"),
    hook: join(root, "dist/bin", `${process.platform}-${process.arch}`, "hapsland-hook"),
    evidence: {
      adapterSha256: hash(readFileSync(new URL(import.meta.url))),
      archiveSha256,
      runtimeAssets: assets,
      packageManager: installer.manager,
      operatingSystem: process.platform,
      architecture: process.arch,
      version: manifest.version
    }
  }
}

export async function setupClaudeNativeArchive({
  installed,
  repository,
  claudeHome,
  binary,
  env,
  execute = executeNative
}) {
  mkdirSync(claudeHome, { recursive: true })
  const json = async (flag, request) => {
    const result = await execute(installed.cli, [flag], {
      cwd: repository,
      env,
      input: JSON.stringify(request),
      timeout: 30000
    })
    let value
    try {
      value = JSON.parse(result.stdout)
    } catch {
      throw new Error(`Installed Claude ${flag} omitted structured output`)
    }
    return { code: result.code, value }
  }
  const request = {
    version: 1,
    operation: "setup",
    host: "claude",
    claudeHome,
    claudeExecutable: binary,
    scope: { cwd: repository, review: "enabled" },
    credential: "skip"
  }
  const preview = await json("--setup", request)
  const digest = preview.value.actions?.find((action) => action.authorization?.installProposalDigest)?.authorization
    ?.installProposalDigest
  if (!digest) throw new Error("Claude setup omitted installation approval digest")
  const setup = await json("--setup", { ...request, installProposalDigest: digest })
  if (
    ![0, 6].includes(setup.code) ||
    !setup.value.stages?.some((stage) => stage.stage === "installation" && stage.status === "complete")
  )
    throw new Error("Installed Claude setup did not complete the approved installation")
  const doctor = await json("--doctor", {
    version: 1,
    operation: "doctor",
    host: "claude",
    claudeHome,
    claudeExecutable: binary,
    cwd: repository
  })
  if (!doctor.value.checks?.some((check) => check.stage === "configuration-ownership" && check.status === "ready"))
    throw new Error("Installed Claude doctor did not validate owned registrations")
  const settingsPath = join(claudeHome, "settings.json")
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"))
  const commands = claudeRegisteredCommands(settings, installed.hook)
  return {
    settingsPath,
    settings,
    commands,
    evidence: {
      setup: "installation-complete",
      doctor: "owned-registration-ready",
      registrationSha256: hash(readFileSync(settingsPath)),
      commands: Object.keys(commands),
      normalTrustValidated: false
    }
  }
}
