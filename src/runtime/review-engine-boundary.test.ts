import { bunExecutable } from "./bun-runtime.ts"
import { spawnSync } from "../../scripts/test-harness/process.mjs"
import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { expect, it } from "vitest"

const flags = [
  "--codex-hook",
  "--claude-hook",
  "--pi-hook",
  "--opencode-hook",
  "--composed-edit-hook",
  "--composed-before-edit-hook",
  "--composed-background-hook",
  "--composed-stop-hook",
  "--composed-prompt-hook"
]
const modules = [
  { module: "src/direct-event/pipeline.ts", label: "pipeline" },
  { module: "src/direct-event/languages/native-parser.ts", label: "native-parser" },
  { module: "src/jev-decision.ts", label: "jev-decision" },
  { module: "src/direct-event/languages/bend/extractor.ts", label: "bend-extractor" },
  { module: "src/review-providers/cloudflare.ts", label: "cloudflare" }
]
const runImport = (module: string, flag?: string) => {
  const preload =
    module === "src/direct-event/pipeline.ts"
      ? `await import(${JSON.stringify(pathToFileURL(resolve("src/direct-event/languages/native-parser.ts")).href)}); await import(${JSON.stringify(pathToFileURL(resolve("src/direct-event/languages/bend/extractor.ts")).href)});`
      : ""
  const code = `${preload} process.argv=${JSON.stringify([bunExecutable(), "boundary-probe", ...(flag ? [flag] : [])])};try { await import(${JSON.stringify(pathToFileURL(resolve(module)).href)}); process.stdout.write("allowed\\n"); } catch { process.stdout.write("caught\\n"); }`
  return spawnSync(bunExecutable(), ["--input-type=module", "-e", code], {
    encoding: "utf8",
    timeout: DEFAULT_CHILD_TIMEOUT_MS,
    env: { ...process.env, REVIEW_CONTROL_JSON: "not JSON", HAPSLAND_HOOK_CLIENT: "1" }
  })
}

for (const flag of flags) {
  for (const { module, label } of modules) {
    it(`emits a source-free diagnostic for ${module} under ${flag} even when the caller catches`, () => {
      const result = runImport(module, flag)
      expect(result.status).toBe(0)
      expect(result.stdout).toBe("caught\n")
      expect(result.stderr).toBe(`Hapsland hook-client review-engine import: ${label}\n`)
    })
  }
}
for (const { module } of modules) {
  it(`allows manual/resident/parser import ${module} despite an inherited marker`, () => {
    const result = runImport(module)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe("allowed\n")
    expect(result.stderr).toBe("")
  })
}
