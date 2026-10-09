import test from "node:test"
import assert from "node:assert/strict"
import { commandHooks, commandHookGroup } from "@hapsland/runtime-environment/runtime/hook-catalog"
import {
  validateClaudeArchiveProfile,
  claudeRegisteredCommands,
  instrumentClaudeRegistrations,
  setupClaudeNativeArchive
} from "./native-claude-package.mjs"

const hook = "/tmp/installed-package/dist/bin/linux-arm64/hapsland-hook"
const settings = (command = `'${hook}'`) => ({
  userSetting: "preserved",
  hooks: Object.fromEntries(
    Object.values(commandHooks.claude).map((definition) => [
      definition.event,
      [
        commandHookGroup("claude", definition.event, {
          command,
          editMarker: "--review-tool-owned=claude-v1",
          composedMarker: "--review-tool-composed-owned=claude-v1",
          versionFlag: "--claude-version=2.1.218"
        })
      ]
    ])
  )
})

const profile = {
  host: "claude",
  language: "typescript",
  scenario: "adoption",
  mode: "controlled-offline",
  archivePath: "/tmp/candidate.tgz"
}

test("accepts the installed controlled Claude adoption profile and preserves source mode", () => {
  validateClaudeArchiveProfile(profile)
  validateClaudeArchiveProfile({ ...profile, language: "go" })
  validateClaudeArchiveProfile({ host: "claude" })
})
for (const [field, value] of [
  ["host", "codex"],
  ["language", "rust"],
  ["scenario", "hook-crash"],
  ["mode", "live-jev"],
  ["coexistence", "both"],
  ["unicodeUpdate", true],
  ["archivePath", ""]
])
  test(`rejects unsupported installed Claude ${field}`, () => {
    assert.throws(
      () => validateClaudeArchiveProfile({ ...profile, [field]: value }),
      /requires controlled TypeScript or Go adoption/
    )
  })

test("accounts for every installed Claude catalog variant", () => {
  const commands = claudeRegisteredCommands(settings(), `'${hook}'`)
  assert.deepEqual(Object.keys(commands), ["before-edit", "edit", "stop", "subagentStop", "prompt"])
  assert.equal(commands.stop, commands.subagentStop)
})

test("preserves catalog timeout, matcher and native event when observing identical stop commands", () => {
  const original = settings(),
    commands = claudeRegisteredCommands(original, `'${hook}'`)
  const observed = instrumentClaudeRegistrations(original, commands, (kind) => `observer ${kind}`)
  assert.equal(observed.hooks.Stop[0].hooks[0].command, "observer stop")
  assert.equal(observed.hooks.SubagentStop[0].hooks[0].command, "observer subagentStop")
  assert.equal(observed.userSetting, original.userSetting)
  assert.equal(observed.hooks.PreToolUse[0].matcher, original.hooks.PreToolUse[0].matcher)
  assert.equal(observed.hooks.PostToolUse[0].hooks[0].timeout, original.hooks.PostToolUse[0].hooks[0].timeout)
  assert.ok(original.hooks.Stop[0].hooks[0].command.startsWith(`'${hook}'`))
})
for (const [name, mutate] of [
  [
    "administrative executable",
    (value) => {
      value.hooks.Stop[0].hooks[0].command = value.hooks.Stop[0].hooks[0].command.replace("hapsland-hook", "hapsland")
    }
  ],
  [
    "unaccounted shell prefix",
    (value) => {
      value.hooks.Stop[0].hooks[0].command = "echo " + value.hooks.Stop[0].hooks[0].command
    }
  ],
  [
    "unaccounted shell suffix",
    (value) => {
      value.hooks.Stop[0].hooks[0].command += " && unexpected"
    }
  ],
  [
    "missing event",
    (value) => {
      delete value.hooks.UserPromptSubmit
    }
  ],
  [
    "duplicated variant",
    (value) => {
      value.hooks.Stop[0].hooks.push(value.hooks.Stop[0].hooks[0])
    }
  ],
  [
    "unexpected event",
    (value) => {
      value.hooks.Unknown = [{ hooks: [{ type: "command", command: "unexpected" }] }]
    }
  ],
  [
    "changed timeout",
    (value) => {
      value.hooks.Stop[0].hooks[0].timeout = 100
    }
  ],
  [
    "changed async delivery",
    (value) => {
      value.hooks.PostToolUse[0].hooks[0].async = true
    }
  ]
])
  test(`rejects ${name} before native execution`, () => {
    const value = settings()
    mutate(value)
    assert.throws(() => claudeRegisteredCommands(value, `'${hook}'`), /Installed Claude/)
  })

test("refuses instrumentation of an unaccounted handler", () => {
  const original = settings(),
    commands = claudeRegisteredCommands(original, `'${hook}'`)
  original.hooks.Stop[0].hooks[0].command = "unexpected"
  assert.throws(() => instrumentClaudeRegistrations(original, commands, () => "observer"), /unaccounted/)
})

test("installed Claude setup approves the exact proposal before observing registrations", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const home = mkdtempSync(join(tmpdir(), "hapsland-claude-setup-"))
  const requests = []
  try {
    const execute = async (cli, args, options) => {
      assert.equal(cli, "/private/hapsland")
      assert.equal(options.cwd, "/private/repository")
      assert.equal(options.env.SELECTED, "fixture")
      const request = JSON.parse(options.input)
      requests.push({ flag: args[0], request })
      if (requests.length === 1)
        return {
          code: 6,
          stdout: JSON.stringify({ actions: [{ authorization: { installProposalDigest: "approved-proposal" } }] })
        }
      if (requests.length === 2) {
        const launcher = join(home, ".hapsland", "claude-hook-launcher.sh")
        mkdirSync(join(home, ".hapsland"))
        writeFileSync(launcher, `#!/bin/sh\nexec '${hook}' "$@"\n`)
        writeFileSync(join(home, "settings.json"), JSON.stringify(settings(`'/bin/sh' '${launcher}'`)))
        return { code: 6, stdout: JSON.stringify({ stages: [{ stage: "installation", status: "complete" }] }) }
      }
      return { code: 0, stdout: JSON.stringify({ checks: [{ stage: "configuration-ownership", status: "ready" }] }) }
    }
    const result = await setupClaudeNativeArchive({
      installed: { cli: "/private/hapsland", hook },
      repository: "/private/repository",
      claudeHome: home,
      binary: "/pinned/claude",
      env: { SELECTED: "fixture" },
      execute
    })
    assert.equal(requests[0].request.installProposalDigest, undefined)
    assert.equal(requests[1].request.installProposalDigest, "approved-proposal")
    assert.equal(requests[1].request.claudeExecutable, "/pinned/claude")
    assert.equal(requests[2].flag, "--doctor")
    assert.equal(result.evidence.normalTrustValidated, false)
    assert.deepEqual(result.evidence.commands, ["before-edit", "edit", "stop", "subagentStop", "prompt"])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("installed Claude setup refuses a preview without authorization evidence", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const home = mkdtempSync(join(tmpdir(), "hapsland-claude-refusal-"))
  let calls = 0
  try {
    await assert.rejects(
      setupClaudeNativeArchive({
        installed: { cli: "/private/hapsland", hook },
        repository: "/private/repository",
        claudeHome: home,
        binary: "/pinned/claude",
        env: {},
        execute: async () => {
          calls++
          return { code: 6, stdout: JSON.stringify({ actions: [] }) }
        }
      }),
      /approval digest/
    )
    assert.equal(calls, 1)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
