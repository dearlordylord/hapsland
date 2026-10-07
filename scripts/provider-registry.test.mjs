import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"

const root = resolve(import.meta.dirname, "..")

test("adding a provider requires both its declaration and execution registration", async () => {
  const selected = await resolvePinnedTypeScript(root)
  const runs = join(root, ".test-runs")
  mkdirSync(runs, { recursive: true })
  const fixture = mkdtempSync(join(runs, "provider-registry-"))
  try {
    const source = readFileSync(join(root, "packages/runtime-environment/src/runtime/backend.ts"), "utf8")
    const backend = join(fixture, "backend.ts")
    const config = join(fixture, "tsconfig.json")
    writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: {
          target: "esnext",
          module: "preserve",
          moduleResolution: "bundler",
          customConditions: ["bun"],
          types: ["bun"],
          strict: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          paths: { "@hapsland/runtime-environment/runtime/backend": [backend] }
        },
        files: [backend, join(root, "packages/review-execution/src/review-providers/live.ts")]
      })
    )
    const compile = (text) => {
      writeFileSync(backend, text)
      const result = spawnSync(selected.executable, ["--project", config], {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000
      })
      assert.ifError(result.error)
      return { status: result.status, output: result.stdout + result.stderr }
    }
    const baseline = compile(source)
    assert.equal(baseline.status, 0, baseline.output)
    const added = source.replace(
      'Schema.Literals(["jev", "cloudflare", "openai"])',
      'Schema.Literals(["jev", "cloudflare", "openai", "acceptance-provider"])'
    )
    assert.notEqual(added, source, "closed provider list must be located")
    const missing = compile(added)
    assert.notEqual(missing.status, 0)
    assert.match(missing.output, /backend\.ts[^\n]*error TS[^\n]*acceptance-provider/u)
    assert.match(missing.output, /live\.ts[^\n]*error TS[^\n]*acceptance-provider/u)
    for (const { before, after, owners } of [
      {
        before: 'type RequestContentProfile = "state" | "openai"',
        after: 'type RequestContentProfile = "state" | "openai" | "acceptance-profile"',
        owners: ["request.ts", "request-content.ts"]
      },
      {
        before: 'type WireQuestionIdProfile = "rule-id" | "opaque"',
        after: 'type WireQuestionIdProfile = "rule-id" | "opaque" | "acceptance-profile"',
        owners: ["request.ts"]
      },
      {
        before: 'type CredentialMode = "jev-key-store" | "environment"',
        after: 'type CredentialMode = "jev-key-store" | "environment" | "acceptance-profile"',
        owners: ["backend.ts"]
      }
    ]) {
      const changed = source.replace(before, after)
      assert.notEqual(changed, source, `closed profile must be located: ${before}`)
      const incomplete = compile(changed)
      assert.notEqual(incomplete.status, 0)
      for (const owner of owners) {
        const diagnostic = incomplete.output
          .split("\n")
          .find((line) => line.includes(owner) && line.includes("error TS") && line.includes("acceptance-profile"))
        assert.ok(diagnostic, `${owner} must reject the missing profile: ${incomplete.output}`)
      }
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
