import { afterAll, expect, it, vi } from "vitest"
import { ConfigProvider, Effect, Redacted } from "effect"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { saveCredential, resolveCredential } from "@hapsland/credential-storage/credentials/owner"
import { type KeyVerification } from "@hapsland/administration/onboarding/credential-verification"
import {
  nativeVerificationLayer,
  runVerificationConversation
} from "@hapsland/administration/onboarding/verification-conversation"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { scriptedInteraction, type ScriptStep } from "../../scripts/test-support/scripted-interaction.ts"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"

it.each(["rate-limited", "unconfirmed", "replace", "precedence"] as const)(
  "preserves usable native storage through verification: %s",
  async (scenario) => {
    const root = mkdtempSync(join(tmpdir(), "hapsland-key-check-"))
    try {
      execFileSync("git", ["init", "--quiet", root])
      const vault = join(root, "vault")
      const helper = join(root, "helper.mjs")
      writeFileSync(
        helper,
        `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const vault = ${JSON.stringify(vault)};
if (process.argv[2] === "set") {
  const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
  writeFileSync(vault, Buffer.concat(chunks)); console.log('{"status":"stored"}');
} else if (process.argv[2] === "get") {
  console.log('{"status":"present"}'); process.stdout.write(readFileSync(vault));
} else console.log('{"status":"available"}');
`,
        { mode: 0o700 }
      )
      const layer = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          REVIEW_CREDENTIAL_HELPER: helper,
          REVIEW_CREDENTIAL_STATE_PATH: join(root, "credential-state.json")
        })
      )
      const steps: ScriptStep[] = [
        { kind: "confirm", line: "y" },
        ...(scenario === "replace" || scenario === "precedence"
          ? ([
              { kind: "choose", index: 0 },
              { kind: "confirm", line: "y" },
              { kind: "hidden", value: "replacement-key" },
              { kind: "confirm", line: "y" }
            ] as const)
          : [])
      ]
      const script = scriptedInteraction(steps)
      const output = script.transcript
      let requests = 0
      await Effect.runPromise(
        Effect.gen(function* () {
          expect((yield* saveCredential("original-key")).status).toBe("stored")
          yield* runVerificationConversation().pipe(
            Effect.provideService(InteractionService, script.interaction),
            Effect.provide(
              nativeVerificationLayer({
                cwd: root,
                host: "codex",
                platform: "linux",
                userConfigPath: join(root, "user.jsonc"),
                verify: (key) =>
                  Effect.sync((): KeyVerification => {
                    requests++
                    if (scenario === "precedence") {
                      if (requests === 1) {
                        writeFileSync(join(root, ".env"), `${JEV_PROVIDER.credentialEnvVar}=file-priority-key\n`)
                        return "rejected"
                      }
                      expect(Redacted.value(key)).toBe("file-priority-key")
                      return "accepted"
                    }
                    if (scenario === "replace")
                      return Redacted.value(key) === "replacement-key" ? "accepted" : "rejected"
                    return scenario
                  })
              })
            )
          )
          const selected = yield* resolveCredential({
            envVar: JEV_PROVIDER.credentialEnvVar,
            root,
            environmentOnly: false
          })
          expect(selected).toMatchObject({
            status: "present",
            source: scenario === "precedence" ? "environment" : "saved",
            value:
              scenario === "precedence"
                ? "file-priority-key"
                : scenario === "replace"
                  ? "replacement-key"
                  : "original-key"
          })
        }).pipe(Effect.provide(layer))
      )
      expect(readFileSync(vault, "utf8")).toBe(
        scenario === "replace" || scenario === "precedence" ? "replacement-key" : "original-key"
      )
      expect(requests).toBe(scenario === "replace" || scenario === "precedence" ? 2 : 1)
      expect(output.join("")).not.toMatch(/original-key|replacement-key|file-priority-key/)
      if (scenario !== "replace" && scenario !== "precedence")
        expect(output.join("")).not.toMatch(/rerun|retry|restart/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)

// User credential files belong to this fixture, independently of the developer's configuration.
const privateConfiguration = await vi.hoisted(async () => {
  const fs = await import("node:fs")
  const os = await import("node:os")
  const path = await import("node:path")
  const previous = process.env.XDG_CONFIG_HOME
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hapsland-private-config-"))
  process.env.XDG_CONFIG_HOME = directory
  return { directory, previous }
})
afterAll(() => {
  if (privateConfiguration.previous === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = privateConfiguration.previous
  rmSync(privateConfiguration.directory, { recursive: true, force: true })
})
