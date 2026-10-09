import test from "node:test"
import assert from "node:assert/strict"
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runQualityReport } from "./quality-report.mjs"

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)))

async function fixture(t, { report, exitCode, stderr = "" }) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-quality-report-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const toolPath = join(root, "node_modules/.bin/crap4ts")
  await mkdir(join(root, "node_modules/.bin"), { recursive: true })
  const stdout = typeof report === "string" ? report : JSON.stringify(report)
  await writeFile(
    toolPath,
    `#!${process.execPath}\n` +
      `if (process.argv.slice(2).join(" ") !== "--json") process.exitCode = 64;\n` +
      `else { process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)}); process.exitCode = ${exitCode}; }\n`
  )
  await chmod(toolPath, 0o755)
  return {
    root,
    toolPath,
    runDirectory: join(root, ".test-runs", "fixture-run"),
    summaryPath: join(root, ".test-runs", "summary.md")
  }
}

const row = ({ path = "src/complex.ts", name = "risky", crap = 90, status = "measured" } = {}) => ({
  path,
  name,
  kind: "function_declaration",
  range: { start: { line: 12, column: 0 }, end: { line: 25, column: 1 } },
  complexity: 9,
  coverage: {
    status,
    covered: status === "measured" ? 0 : null,
    total: status === "measured" ? 9 : null,
    fraction: status === "measured" ? 0 : null
  },
  crap
})

test("maps a valid threshold breach to advisory and retains a compact report plus summary", async (t) => {
  const root = {
    version: 1,
    threshold: 8,
    rows: [row(), row({ path: "src/safe.ts", name: "safe", crap: 4, status: "measured" })],
    diagnostics: [
      { category: "coverage_attribution", message: "unmatched statement outside a source function" },
      { category: "threshold_breach", message: "risky exceeds the configured threshold" }
    ]
  }
  const stderr = `${"x".repeat(5000)}CRAP threshold exceeded\n`
  const paths = await fixture(t, { report: root, exitCode: 2, stderr })
  let forwardedStderr = ""

  const exitCode = await runQualityReport({ ...paths, writeStderr: (value) => (forwardedStderr += value) })

  assert.equal(exitCode, 0)
  assert.equal(forwardedStderr, stderr)
  const artifactPath = join(paths.runDirectory, "quality-report.json")
  const reportText = await readFile(artifactPath, "utf8")
  const report = JSON.parse(reportText)
  assert.equal(report.state, "advisory-threshold-breaches")
  assert.equal(report.toolExitCode, 2)
  assert.equal(report.exitCode, 0)
  assert.deepEqual(report.counts, { functions: 2, measured: 2, missingEvidence: 0, aboveThreshold: 1, diagnostics: 2 })
  assert.deepEqual(
    report.rowsAboveThreshold.map(({ path, name, line, crap }) => ({ path, name, line, crap })),
    [{ path: "src/complex.ts", name: "risky", line: 12, crap: 90 }]
  )
  assert.equal(report.stderrExcerpt, stderr.slice(-4000))
  assert.equal(reportText.trim(), JSON.stringify(report))
  const summary = await readFile(paths.summaryPath, "utf8")
  assert.match(summary, /Threshold 8 is advisory/)
  assert.match(summary, /src\/complex\.ts:12 — risky/)
  assert.match(summary, /Machine report:.*\.test-runs\/fixture-run\/quality-report\.json/)
  assert.match(summary, /CRAP threshold exceeded/)
})

test("stores the report beside its authenticated quality run", async (t) => {
  const paths = await fixture(t, {
    report: { version: 1, threshold: 8, rows: [row({ crap: 4 })], diagnostics: [] },
    exitCode: 0
  })
  const previousContext = process.env.HAPSLAND_CHECK_CONTEXT
  process.env.HAPSLAND_CHECK_CONTEXT = JSON.stringify({ id: "quality-run-42", root: paths.root })
  try {
    assert.equal(
      await runQualityReport({
        root: paths.root,
        toolPath: paths.toolPath,
        summaryPath: paths.summaryPath,
        writeStderr: () => {}
      }),
      0
    )
  } finally {
    if (previousContext === undefined) delete process.env.HAPSLAND_CHECK_CONTEXT
    else process.env.HAPSLAND_CHECK_CONTEXT = previousContext
  }
  const reportPath = join(paths.root, ".test-runs/quality-run-42/quality-report.json")
  assert.equal(JSON.parse(await readFile(reportPath, "utf8")).state, "passed")
})

test("consumes real crap4ts JSON after its configured coverage command runs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-quality-report-real-tool-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourcePath = join(root, "src", "sample.ts")
  const commandPath = join(root, "generate-coverage.mjs")
  const preparedCoveragePath = join(root, "prepared-coverage.json")
  const coveragePath = join(root, "coverage", "coverage-final.json")
  const commandCountPath = join(root, "coverage-command-count.txt")
  const runDirectory = join(root, ".test-runs", "real-tool-run")
  const summaryPath = join(root, ".test-runs", "summary.md")
  const source = "export function tiny() {\n  return 1\n}\n"
  await mkdir(dirname(sourcePath), { recursive: true })
  await writeFile(sourcePath, source)
  await writeFile(
    preparedCoveragePath,
    `${JSON.stringify({
      [sourcePath]: {
        path: sourcePath,
        statementMap: { 0: { start: { line: 2, column: 2 }, end: { line: 2, column: 10 } } },
        fnMap: {
          0: {
            name: "tiny",
            decl: { start: { line: 1, column: 7 }, end: { line: 1, column: 21 } },
            loc: { start: { line: 1, column: 7 }, end: { line: 3, column: 1 } },
            line: 1
          }
        },
        branchMap: {},
        s: { 0: 1 },
        f: { 0: 1 },
        b: {}
      }
    })}\n`
  )
  await writeFile(
    commandPath,
    `import { appendFileSync, copyFileSync, mkdirSync } from "node:fs"\n` +
      `import { dirname } from "node:path"\n` +
      `mkdirSync(dirname(${JSON.stringify(coveragePath)}), { recursive: true })\n` +
      `copyFileSync(${JSON.stringify(preparedCoveragePath)}, ${JSON.stringify(coveragePath)})\n` +
      `appendFileSync(${JSON.stringify(commandCountPath)}, "called\\n")\n` +
      `console.log("coverage command stdout marker")\n` +
      `console.error("coverage command stderr marker")\n`
  )
  await writeFile(
    join(root, "crap4ts.json"),
    `${JSON.stringify(
      {
        sources: ["src"],
        coverage: {
          path: "coverage/coverage-final.json",
          format: "istanbul",
          command: [process.execPath, commandPath]
        },
        threshold: 8,
        missing_evidence: "error"
      },
      null,
      2
    )}\n`
  )
  let forwardedStderr = ""

  const exitCode = await runQualityReport({
    root,
    runDirectory,
    summaryPath,
    toolPath: join(repositoryRoot, "node_modules", ".bin", "crap4ts"),
    writeStderr: (value) => (forwardedStderr += value)
  })

  const report = JSON.parse(await readFile(join(runDirectory, "quality-report.json"), "utf8"))
  assert.equal(exitCode, 0)
  assert.equal(report.state, "passed")
  assert.equal(report.counts.functions, 1)
  assert.equal(report.counts.measured, 1)
  assert.equal(report.counts.missingEvidence, 0)
  assert.match(await readFile(commandCountPath, "utf8"), /^called\n$/)
  assert.match(forwardedStderr, /coverage command stderr marker/)
  assert.match(await readFile(summaryPath, "utf8"), /Threshold 8 passed across 1 functions/)
})

test("keeps strict missing evidence, malformed reports, and tool failures blocking", async (t) => {
  await t.test("preserves a successful tool exit 0", async (t) => {
    const paths = await fixture(t, {
      report: { version: 1, threshold: 8, rows: [row({ crap: 4 })], diagnostics: [] },
      exitCode: 0
    })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 0)
    assert.equal(report.state, "passed")
    assert.match(await readFile(paths.summaryPath, "utf8"), /Threshold 8 passed across 1 functions/)
  })

  await t.test("does not suppress exit 2 without a reported threshold breach", async (t) => {
    const paths = await fixture(t, {
      report: { version: 1, threshold: 8, rows: [row({ crap: 4 })], diagnostics: [] },
      exitCode: 2
    })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 2)
    assert.equal(report.state, "failed")
    assert.match(report.message, /without a row above/)
  })

  await t.test("turns successful output with missing evidence into a blocking inconsistency", async (t) => {
    const paths = await fixture(t, {
      report: { version: 1, threshold: 8, rows: [row({ status: "unknown" })], diagnostics: [] },
      exitCode: 0
    })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 1)
    assert.equal(report.state, "failed")
    assert.equal(report.counts.missingEvidence, 1)
    assert.match(report.message, /missing coverage evidence/i)
  })

  await t.test("does not downgrade analysis-error diagnostics with exit 2", async (t) => {
    const paths = await fixture(t, {
      report: {
        version: 1,
        threshold: 8,
        rows: [row()],
        diagnostics: [{ category: "analysis_error", message: "source parsing failed" }]
      },
      exitCode: 2
    })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 2)
    assert.equal(report.state, "failed")
    assert.match(report.message, /analysis diagnostics/i)
    assert.deepEqual(report.diagnostics, [{ category: "analysis_error", message: "source parsing failed" }])
  })

  await t.test("turns successful output with a threshold breach into a blocking inconsistency", async (t) => {
    const paths = await fixture(t, {
      report: { version: 1, threshold: 8, rows: [row()], diagnostics: [] },
      exitCode: 0
    })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 1)
    assert.equal(report.state, "failed")
    assert.match(report.message, /threshold breach contradicts/i)
  })

  await t.test("does not accept a threshold diagnostic that contradicts exit 0", async (t) => {
    const paths = await fixture(t, {
      report: {
        version: 1,
        threshold: 8,
        rows: [row({ crap: 4 })],
        diagnostics: [{ category: "threshold_breach", message: "a function exceeded the threshold" }]
      },
      exitCode: 0
    })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 1)
    assert.equal(report.state, "failed")
    assert.match(report.message, /analysis diagnostics contradict/i)
  })

  await t.test("unknown coverage remains a failure even with exit 2", async (t) => {
    const paths = await fixture(t, {
      report: { version: 1, threshold: 8, rows: [row({ status: "unknown" })], diagnostics: [] },
      exitCode: 2,
      stderr: "missing coverage\n"
    })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 2)
    assert.equal(report.state, "failed")
    assert.equal(report.counts.missingEvidence, 1)
    assert.match(
      await readFile(paths.summaryPath, "utf8"),
      /missing coverage evidence remains blocking|analysis failed/
    )
  })

  await t.test("malformed JSON does not turn exit 2 into an advisory pass", async (t) => {
    const paths = await fixture(t, { report: "not JSON", exitCode: 2, stderr: "analysis emitted invalid output\n" })
    const exitCode = await runQualityReport({ ...paths, writeStderr: () => {} })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 2)
    assert.equal(report.state, "invalid-report")
    assert.match(report.message, /JSON|report/i)
  })

  await t.test("preserves a generation or analysis exit 1", async (t) => {
    const paths = await fixture(t, { report: "", exitCode: 1, stderr: "coverage generation failed\n" })
    let forwardedStderr = ""
    const exitCode = await runQualityReport({ ...paths, writeStderr: (value) => (forwardedStderr += value) })
    const report = JSON.parse(await readFile(join(paths.runDirectory, "quality-report.json"), "utf8"))
    assert.equal(exitCode, 1)
    assert.equal(report.state, "invalid-report")
    assert.equal(forwardedStderr, "coverage generation failed\n")
    assert.match(report.stderrExcerpt, /coverage generation failed/)
  })
})
