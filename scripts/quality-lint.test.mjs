import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  realpathSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  rmSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { installGitHooks } from "./install-git-hooks.mjs"

const runner = resolve("scripts/run-quality-lint.mjs")
test("lint failure prevents formatting; explicit and changed selection stay bounded", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-lint-runner-")))
  try {
    mkdirSync(join(root, "node_modules/.bin"), { recursive: true })
    mkdirSync(join(root, "src"))
    writeFileSync(join(root, "src/example.ts"), "export const value = 1\n")
    for (const tool of ["oxlint", "dprint"])
      writeFileSync(
        join(root, "node_modules/.bin", tool),
        `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(join(root, "calls"))}, JSON.stringify({tool:${JSON.stringify(tool)},args:process.argv.slice(2)})+'\\n');process.exit(${tool === "oxlint" ? "Number(process.env.FIXTURE_LINT_EXIT ?? 0)" : "0"});\n`,
        { mode: 0o755 }
      )
    const run = (args, extra = {}) =>
      spawnSync(process.execPath, [runner, ...args], {
        cwd: root,
        env: { ...process.env, ...extra },
        encoding: "utf8",
        timeout: 15_000
      })
    const calls = () =>
      readFileSync(join(root, "calls"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    assert.equal(run([join(root, "src/example.ts"), "--staged", "--fix"]).status, 0)
    assert.deepEqual(
      calls().map((call) => call.tool),
      ["oxlint", "dprint"]
    )
    assert.ok(calls()[0].args.includes("--fix"))
    assert.ok(calls()[1].args.includes("fmt"))
    assert.equal(run(["src/example.ts"], { FIXTURE_LINT_EXIT: "7" }).status, 7)
    assert.equal(calls().length, 3)
    assert.equal(run(["src/example.ts", "--census"], { FIXTURE_LINT_EXIT: "7" }).status, 1)
    assert.equal(calls().length, 5)
    assert.equal(run(["../outside.ts"]).status, 0)
    assert.equal(calls().length, 5)
    assert.notEqual(run(["--unknown"]).status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("real pre-commit formats staged code and rejects a lint defect", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-precommit-"))
  const run = (command, args) =>
    spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 30_000, env: process.env })
  try {
    assert.equal(run("git", ["init", "--quiet"]).status, 0)
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir")
    mkdirSync(join(root, ".husky"))
    mkdirSync(join(root, "src"))
    mkdirSync(join(root, "scripts"))
    copyFileSync("scripts/bend-format.py", join(root, "scripts/bend-format.py"))
    for (const file of [".oxlintrc.json", "dprint.json"]) copyFileSync(file, join(root, file))
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        scripts: {
          typecheck: "tsc --noEmit --skipLibCheck --types node src/example.ts",
          "config:check": `node -e "process.exit(require('node:fs').existsSync('stale-docs') ? 1 : 0)"`
        },
        "lint-staged": { "*.ts": `${process.execPath} ${runner} --staged --fix` }
      })
    )
    copyFileSync(".husky/pre-commit", join(root, ".husky/pre-commit"))
    installGitHooks(root)
    writeFileSync(join(root, "src/example.ts"), 'export const value={nested:"hello"};\n')
    assert.equal(run("git", ["add", "."]).status, 0)
    const commit = () =>
      run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"])
    const first = commit()
    assert.equal(first.status, 0, first.stdout + first.stderr)
    assert.equal(run("git", ["show", "HEAD:src/example.ts"]).stdout, 'export const value = { nested: "hello" }\n')
    writeFileSync(join(root, "src/example.ts"), 'export const value={nested:"staged"};\n')
    assert.equal(run("git", ["add", "src/example.ts"]).status, 0)
    writeFileSync(
      join(root, "src/example.ts"),
      'export const value={nested:"staged"};\nexport const unstaged = "preserved"\n'
    )
    const partial = commit()
    assert.equal(partial.status, 0, partial.stdout + partial.stderr)
    assert.equal(run("git", ["show", "HEAD:src/example.ts"]).stdout, 'export const value = { nested: "staged" }\n')
    assert.match(readFileSync(join(root, "src/example.ts"), "utf8"), /export const unstaged = "preserved"/)
    assert.match(run("git", ["diff", "--", "src/example.ts"]).stdout, /unstaged/)
    writeFileSync(join(root, "stale-docs"), "stale")
    assert.notEqual(commit().status, 0, "stale generated docs must reject a commit")
    rmSync(join(root, "stale-docs"))
    writeFileSync(join(root, "src/example.ts"), "const unused = 1\n")
    assert.equal(run("git", ["add", "src/example.ts"]).status, 0)
    const rejected = commit()
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stdout + rejected.stderr, /no-unused-vars/u)
    assert.equal(readFileSync(join(root, "src/example.ts"), "utf8"), "const unused = 1\n")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
