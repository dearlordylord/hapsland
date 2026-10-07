import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { checkComplexity } from "./check-complexity.mjs"

async function fixture(t, source, policy = {}) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-complexity-test-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, "src"))
  await symlink(fileURLToPath(new URL("../../node_modules", import.meta.url)), join(root, "node_modules"), "dir")
  await writeFile(join(root, "src/main.ts"), source)
  await writeFile(
    join(root, "crap4ts.json"),
    JSON.stringify({
      sources: ["src"],
      threshold: 8,
      missing_evidence: "error",
      coverage: {
        path: "coverage.json",
        command: [process.execPath, "-e", "require('node:fs').writeFileSync('coverage-started', 'unexpected')"]
      },
      ...policy
    })
  )
  return root
}

const branching = (branches) =>
  `export function choose(value: number) { ${Array.from({ length: branches }, (_, n) => `if (value === ${n}) return ${n};`).join(" ")} return -1; }`

test("rejects guaranteed CRAP failure without generating coverage", async (t) => {
  const root = await fixture(t, branching(8))
  const output = []
  assert.equal(await checkComplexity(root, (line) => output.push(line)), 2)
  assert.match(output.join("\n"), /complexity 9 exceeds 8/)
  await assert.rejects(readFile(join(root, "coverage-started")), /ENOENT/)
  await assert.rejects(readFile(join(root, "coverage.json")), /ENOENT/)
})

test("equality passes the lower bound without claiming coverage", async (t) => {
  const root = await fixture(t, branching(7))
  const output = []
  assert.equal(await checkComplexity(root, (line) => output.push(line)), 0)
  assert.match(output.join("\n"), /coverage not checked/)
  await assert.rejects(readFile(join(root, "coverage-started")), /ENOENT/)
})

test("preserves native source selection and global threshold", async (t) => {
  const root = await fixture(t, branching(2), { threshold: 2 })
  await writeFile(join(root, "src/ignored.test.ts"), branching(20))
  const output = []
  assert.equal(await checkComplexity(root, (line) => output.push(line)), 2)
  assert.match(output.join("\n"), /1 functions, threshold ceiling 2/)
})

test("a higher path override cannot cause false early rejection", async (t) => {
  const root = await fixture(t, branching(8), { threshold: 2, threshold_overrides: { "src/main.ts": 9 } })
  assert.equal(await checkComplexity(root, () => {}), 0)
})

test("source and configuration analysis errors remain errors", async (t) => {
  const root = await fixture(t, "export function broken( {")
  await assert.rejects(checkComplexity(root, () => {}))
  await writeFile(join(root, "src/main.ts"), branching(0))
  await writeFile(join(root, "crap4ts.json"), '{"threshold": 8, "threshold": 99}')
  await assert.rejects(checkComplexity(root, () => {}))
})
