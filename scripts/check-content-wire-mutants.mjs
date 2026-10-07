import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from "node:fs"
import { resolve, join } from "node:path"

// Mutate isolated copies, never the candidate under validation. Retain logs on
// every outcome; a timeout, import error or compilation error is NOT a kill.
const root = resolve(import.meta.dirname, "..")
const evidence = join(root, ".test-runs", `content-wire-mutants-${Date.now()}`)
const fixture = join(evidence, "fixture")
mkdirSync(fixture, { recursive: true })
cpSync(join(root, "src"), join(fixture, "src"), { recursive: true })
for (const path of [
  "node_modules",
  "packages",
  "scripts",
  "evidence",
  "native",
  "package.json",
  "tsconfig.json",
  "vitest.config.ts"
]) {
  symlinkSync(join(root, path), join(fixture, path))
}
const mutants = [
  {
    name: "bypass-production-bend",
    file: "src/review-providers/transport.ts",
    before: "reviewRequestContent(request.body.body)",
    after: "new TextDecoder().decode(request.body.body)",
    test: "drops extra top-level fields at the actual shared transport"
  },
  {
    name: "compiled-bend-drops-questions",
    file: "src/review-providers/request-content.generated.js",
    before: '_questions_0 + "}"',
    after: '"null" + "}"',
    test: "changing private envelopes preserves exact nonempty wire contents"
  },
  {
    name: "schema-valid-prompt-in-source",
    file: "src/direct-event/pipeline.ts",
    before: "source: root.artifact.source",
    after: "source: root.artifact.source + input.rules[0]?.message",
    test: "changing private envelopes preserves exact nonempty wire contents"
  },
  {
    name: "inspection-live-buffer",
    file: "src/inspection/transport.ts",
    before: "Uint8Array.from(request.body.body)",
    after: "request.body.body",
    test: "inspection cannot replace source bytes with local conversation text"
  },
  {
    name: "ambient-trace-propagation",
    file: "src/review-providers/transport.ts",
    before: "HttpClient.TracerPropagationEnabled, false",
    after: "HttpClient.TracerPropagationEnabled, true",
    test: "changing private envelopes preserves exact nonempty wire contents"
  }
]
const run = (name, testName) => {
  const args = [
    join(root, "node_modules/vitest/vitest.mjs"),
    "run",
    "--root",
    fixture,
    "--maxWorkers=1",
    "src/direct-event/content-isolation.test.ts",
    "src/review-providers/request-content.test.ts"
  ]
  if (testName) args.push("-t", testName)
  const result = spawnSync(process.execPath, args, { cwd: fixture, encoding: "utf8", timeout: 20_000 })
  const output = result.stdout + result.stderr
  writeFileSync(join(evidence, `${name}.log`), output)
  assert.ifError(result.error)
  assert.equal(result.signal, null, `${name}: interrupted`)
  return { status: result.status, output }
}
try {
  const baseline = run("baseline")
  assert.equal(baseline.status, 0, baseline.output)
  for (const mutant of mutants) {
    const target = join(fixture, mutant.file)
    const original = readFileSync(target, "utf8")
    assert.equal(original.split(mutant.before).length, 2, `${mutant.name}: exactly one mutation target`)
    writeFileSync(target, original.replace(mutant.before, mutant.after))
    try {
      const result = run(mutant.name, mutant.test)
      assert.equal(result.status, 1, `${mutant.name}: mutant escaped or runner failed: ${result.output}`)
      assert.match(result.output, /AssertionError:/, `${mutant.name}: not an assertion failure`)
      assert.ok(result.output.includes(mutant.test), `${mutant.name}: intended regression did not run`)
      assert.doesNotMatch(
        result.output,
        /Failed to (?:load|resolve)|Transform failed|SyntaxError:/,
        `${mutant.name}: invalid mutation`
      )
      console.log(`${mutant.name}: rejected by ${mutant.test}`)
    } finally {
      writeFileSync(target, original)
    }
  }
  console.log(`Wire mutation logs: ${evidence}`)
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
