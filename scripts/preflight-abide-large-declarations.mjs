// Offline strict compilation and the actual selected localized-patch boundary.
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cases } from "./abide-large-declaration-fixtures.mjs"
const project = path.resolve(import.meta.dirname, "..")
const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9)
assert(output && !fs.existsSync(output), "Fresh --output required")
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
const command = (args, cwd) => {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8", timeout: 45000 })
  assert.equal(r.status, 0, `${args[0]} failed: ${r.stderr.slice(0, 500)} ${r.stdout.slice(0, 500)}`)
}
const records = []
for (const fixture of cases) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haps-large-preflight-"))
  try {
    for (const [name, source] of Object.entries(fixture.support)) fs.writeFileSync(path.join(root, name), source)
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          types: [],
          skipLibCheck: true
        },
        include: ["*.ts"]
      })
    )
    command(["git", "init", "-q", "--initial-branch=master"], root)
    command(["git", "config", "user.email", "study@example.invalid"], root)
    command(["git", "config", "user.name", "Offline study"], root)
    fs.writeFileSync(path.join(root, "subject.ts"), fixture.before)
    command([process.execPath, path.join(project, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], root)
    command(["git", "add", "."], root)
    command(["git", "commit", "-qm", "Frozen synthetic input"], root)
    const r = spawnSync(process.execPath, [path.join(project, "scripts/abide-quality-capture.mjs")], {
      cwd: project,
      encoding: "utf8",
      timeout: 45000,
      env: { ...process.env, QUALITY_PREPARE_ONLY: "1", TYPESAFE_API_KEY: "offline-not-a-credential" },
      input: JSON.stringify({ fixture, repo: root, candidate: "hapsland" })
    })
    assert.equal(r.status, 0, r.stderr.slice(0, 500))
    const prepared = JSON.parse(r.stdout.trim().split("\n").at(-1))
    assert.equal(prepared.ready, 1, `${fixture.id}: expected one eligible root`)
    assert.equal(prepared.preparedUnits[0].declaration, "CaseState")
    assert.deepEqual(prepared.preparedUnits[0].ruleIds, [fixture.ruleId])
    command([process.execPath, path.join(project, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], root)
    assert.equal(fs.readFileSync(path.join(root, "subject.ts"), "utf8"), fixture.after)
    const lines = fixture.captureCommand.split("\n")
    records.push({
      caseId: fixture.id,
      candidateId: fixture.candidateId,
      layout: fixture.layout,
      gold: fixture.gold,
      fixtureDigest: hash(JSON.stringify(fixture)),
      compiledBeforeAndAfter: true,
      prepared,
      sourceLines: fixture.before.trimEnd().split("\n").length,
      patch: {
        totalLines: lines.length,
        contextLines: lines.filter((l) => l.startsWith(" ")).length,
        addedLines: lines.filter((l) => l.startsWith("+")).length,
        removedLines: lines.filter((l) => l.startsWith("-")).length,
        hunks: lines.filter((l) => l.startsWith("@@")).length
      }
    })
    console.log(JSON.stringify({ caseId: fixture.id, ready: 1, compiled: true }))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      version: 1,
      sourceClass: "RUN",
      verificationState: "RUNTIME-TESTED",
      offline: true,
      providerRequests: 0,
      records
    },
    null,
    2
  ) + "\n",
  { flag: "wx" }
)
