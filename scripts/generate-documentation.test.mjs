import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { generateDocumentation } from "./generate-documentation.mjs"

test("updates and checks visit the same owners and stop before later writes on failure", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-doc-generation-"))
  try {
    mkdirSync(join(root, "scripts"))
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }))
    writeFileSync(
      join(root, "scripts/build-workspaces.mjs"),
      `import { appendFileSync, existsSync, writeFileSync } from "node:fs";
appendFileSync("visits", "prepare\\n");
if (existsSync("fail-preparation")) process.exit(9);
writeFileSync("compiled-owner", "ready");`
    )
    const files = [
      "generate-configuration.ts",
      "generate-hook-index.mjs",
      "generate-architecture-diagram.mjs",
      "generate-module-architecture.mjs",
      "generate-decision-boundary-ledger.mts",
      "generate-interaction-diagrams.mts"
    ]
    for (const file of files) {
      writeFileSync(
        join(root, "scripts", file),
        `import { appendFileSync, existsSync } from "node:fs";
if (!existsSync("compiled-owner")) throw new Error("compiled owner missing");
const mode = process.argv.includes("--check") ? "check" : "update";
appendFileSync("visits", mode + ":${file}\\n");
if (existsSync("fail-${file}")) process.exit(7);
`
      )
    }
    assert.equal(generateDocumentation("--update", root), 0)
    assert.equal(generateDocumentation("--check", root), 0)
    assert.deepEqual(readFileSync(join(root, "visits"), "utf8").trim().split("\n"), [
      "prepare",
      ...files.map((file) => `update:${file}`),
      "prepare",
      ...files.map((file) => `check:${file}`)
    ])
    writeFileSync(join(root, "visits"), "")
    writeFileSync(join(root, "fail-generate-hook-index.mjs"), "")
    assert.equal(generateDocumentation("--update", root), 7)
    assert.deepEqual(readFileSync(join(root, "visits"), "utf8").trim().split("\n"), [
      "prepare",
      "update:generate-configuration.ts",
      "update:generate-hook-index.mjs"
    ])
    rmSync(join(root, "fail-generate-hook-index.mjs"))
    writeFileSync(join(root, "visits"), "")
    writeFileSync(join(root, "fail-generate-architecture-diagram.mjs"), "")
    assert.equal(generateDocumentation("--check", root), 7)
    assert.deepEqual(readFileSync(join(root, "visits"), "utf8").trim().split("\n"), [
      "prepare",
      "check:generate-configuration.ts",
      "check:generate-hook-index.mjs",
      "check:generate-architecture-diagram.mjs"
    ])
    rmSync(join(root, "compiled-owner"))
    writeFileSync(join(root, "visits"), "")
    writeFileSync(join(root, "fail-preparation"), "")
    assert.equal(generateDocumentation("--update", root), 9)
    assert.equal(readFileSync(join(root, "visits"), "utf8"), "prepare\n")
    assert.throws(() => generateDocumentation("--typo", root), /Choose --update or --check/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
