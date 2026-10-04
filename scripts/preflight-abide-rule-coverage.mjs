// Offline validation of synthetic inputs and the actual prepared review boundary.
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cases } from "./abide-rule-coverage-fixtures.mjs"
const project = path.resolve(import.meta.dirname, "..")
const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9)
assert(output, "--output required")
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
const command = (args, cwd) => {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8", timeout: 45000 })
  assert.equal(
    result.status,
    0,
    `Offline command failed: ${args[0]} ${result.stderr.slice(0, 500)} ${result.stdout.slice(0, 500)}`
  )
  return result.stdout
}
const records = []
for (const fixture of cases) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapsland-rule-preflight-"))
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
    for (const phase of ["detection", "maintenance"]) {
      const before = phase === "detection" ? fixture.before : fixture.after
      const after = phase === "detection" ? fixture.after : fixture.after.replaceAll("label", "displayLabel")
      fs.writeFileSync(path.join(root, "subject.ts"), before)
      command(["git", "add", "."], root)
      command(["git", "commit", "-qm", phase, "--allow-empty"], root)
      const _compileBefore = command(
        [process.execPath, path.join(project, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
        root
      )
      const result = spawnSync(process.execPath, [path.join(project, "scripts/abide-quality-capture.mjs")], {
        cwd: project,
        encoding: "utf8",
        timeout: 45000,
        env: { ...process.env, QUALITY_PREPARE_ONLY: "1", TYPESAFE_API_KEY: "offline-not-a-credential" },
        input: JSON.stringify({ fixture: { ...fixture, before, after }, repo: root, candidate: "hapsland" })
      })
      assert.equal(result.status, 0, `Preparation failed for ${fixture.id}: ${result.stderr.slice(0, 500)}`)
      const prepared = JSON.parse(result.stdout.trim().split("\n").at(-1))
      assert.equal(prepared.ready, 1, `Unexpected preparation for ${fixture.id}/${phase}: ${JSON.stringify(prepared)}`)
      if (prepared.ready === 1) {
        assert.equal(prepared.preparedUnits[0].declaration, fixture.declarationName)
        assert.deepEqual(prepared.preparedUnits[0].ruleIds, [fixture.ruleId])
      }
      command([process.execPath, path.join(project, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], root)
      const hasSupportingSource = Object.keys(fixture.support).length > 0
      const sourcePaths = [
        ...new Set([...prepared.preparedUnits, ...prepared.unitSummaries].flatMap((unit) => unit.sourcePaths))
      ]
      if (hasSupportingSource) assert(sourcePaths.includes("support.ts"), `Supporting source missing: ${fixture.id}`)
      records.push({
        caseId: fixture.id,
        ruleId: fixture.ruleId,
        phase,
        compiledBeforeAndAfter: true,
        prepared,
        hasSupportingSource,
        fixtureDigest: hash(JSON.stringify(fixture))
      })
      console.log(
        JSON.stringify({
          caseId: fixture.id,
          phase,
          ready: prepared.ready,
          supportingSourceIncluded: hasSupportingSource,
          ...(prepared.ready === 0
            ? { notEvaluated: "known incomplete supporting graph under bundled function capabilities" }
            : {})
        })
      )
    }
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
