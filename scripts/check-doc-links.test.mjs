import assert from "node:assert/strict"
import { copyFile, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { checkerPath, root, verifyChecker } from "./install-doc-link-checker.mjs"

test("the offline gate checks new docs, deleted targets, raw HTML, and heading anchors", async () => {
  const binary = checkerPath()
  verifyChecker(binary)
  const fixture = await mkdtemp(join(tmpdir(), "hapsland-doc-links-fixture-"))
  const run = (command, args) => spawnSync(command, args, { cwd: fixture, encoding: "utf8" })
  try {
    await mkdir(join(fixture, "scripts"))
    for (const name of ["check-doc-links.mjs", "install-doc-link-checker.mjs"]) {
      await copyFile(join(root, "scripts", name), join(fixture, "scripts", name))
    }
    const installed = join(fixture, relative(root, binary))
    await mkdir(dirname(installed), { recursive: true })
    await symlink(binary, installed)
    assert.equal(run("git", ["init", "-q"]).status, 0)
    await writeFile(join(fixture, ".gitignore"), ".tools/\n")
    await writeFile(join(fixture, "target.md"), "# Existing heading\n")
    await writeFile(join(fixture, "obsolete.md"), "# Obsolete\n")
    await writeFile(
      join(fixture, "README.md"),
      [
        "[Valid](target.md#existing-heading)",
        '<a href="target.md#absent">Missing heading</a>',
        '<img src="missing.svg">',
        "[Deleted](obsolete.md)",
        "[Remote](https://never-request.invalid/)"
      ].join("\n")
    )
    assert.equal(run("git", ["add", "README.md", "target.md", "obsolete.md", ".gitignore"]).status, 0)
    await unlink(join(fixture, "obsolete.md"))
    await writeFile(join(fixture, "new.md"), "[New broken doc](missing.md)\n")

    const rejected = run(process.execPath, ["scripts/check-doc-links.mjs"])
    const failure = rejected.stdout + rejected.stderr
    assert.equal(rejected.status, 2, failure)
    for (const target of ["absent", "missing.svg", "obsolete.md", "missing.md"]) {
      assert.ok(failure.includes(target), `Expected a failure for ${target}: ${failure}`)
    }
    assert.ok(!failure.includes("never-request.invalid"), failure)

    await writeFile(
      join(fixture, "README.md"),
      [
        "[Valid](target.md#existing-heading)",
        '<a href="target.md#existing-heading">HTML link</a>',
        '<img src="icon.svg">',
        "[Remote](https://never-request.invalid/)"
      ].join("\n")
    )
    await writeFile(join(fixture, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    await writeFile(join(fixture, "new.md"), "[Valid new doc](target.md#existing-heading)\n")
    const accepted = run(process.execPath, ["scripts/check-doc-links.mjs"])
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
