import { expect, it } from "vitest"
import { ConfigProvider, Effect, Redacted } from "effect"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { saveCredential, resolveCredential } from "../credentials/secret-service.ts"
import { runGuidedCredentialCheck, type KeyVerification } from "./credential-verification.ts"
import { JEV_PROVIDER } from "../runtime/backend.ts"

it.each(["rate-limited", "unconfirmed", "replace"] as const)(
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
      const output: string[] = []
      let requests = 0
      await Effect.runPromise(
        Effect.gen(function* () {
          expect((yield* saveCredential("original-key")).status).toBe("stored")
          yield* runGuidedCredentialCheck({
            cwd: root,
            host: "codex",
            platform: "linux",
            userConfigPath: join(root, "user.jsonc"),
            confirm: () => Effect.succeed(true),
            readCredential: () => Effect.succeed("replacement-key"),
            write: (text) => output.push(text),
            verify: (key) =>
              Effect.sync((): KeyVerification => {
                requests++
                if (scenario === "replace") return Redacted.value(key) === "replacement-key" ? "accepted" : "rejected"
                return scenario
              })
          })
          const selected = yield* resolveCredential({
            envVar: JEV_PROVIDER.credentialEnvVar,
            root,
            environmentOnly: false
          })
          expect(selected).toMatchObject({
            status: "present",
            source: "saved",
            value: scenario === "replace" ? "replacement-key" : "original-key"
          })
        }).pipe(Effect.provide(layer))
      )
      expect(readFileSync(vault, "utf8")).toBe(scenario === "replace" ? "replacement-key" : "original-key")
      expect(requests).toBe(scenario === "replace" ? 2 : 1)
      expect(output.join("")).not.toMatch(/original-key|replacement-key/)
      if (scenario !== "replace") expect(output.join("")).not.toMatch(/rerun|retry|restart/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)
