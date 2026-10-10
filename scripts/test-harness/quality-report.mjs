import { execFile } from "node:child_process"
import { appendFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execute = promisify(execFile)
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const contextVariable = "HAPSLAND_CHECK_CONTEXT"
const maximumOutputBytes = 64 * 1024 * 1024
const maximumExcerptLength = 4000
const maximumDiagnostics = 20
const maximumSummaryFunctions = 100
const advisoryDiagnosticCategories = new Set(["coverage_attribution", "threshold_breach"])

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const excerpt = (value, limit = maximumExcerptLength) => String(value ?? "").slice(-limit)
const cleanLine = (value) =>
  String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
const escapeHtml = (value) => cleanLine(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

function runDirectoryFor(root, contextValue) {
  if (contextValue === undefined || contextValue === "")
    return join(root, ".test-runs", `quality-report-${process.pid}-${Date.now()}`)
  let context
  try {
    context = JSON.parse(contextValue)
  } catch {
    throw new Error(`${contextVariable} is not valid JSON`)
  }
  if (
    !isObject(context) ||
    typeof context.root !== "string" ||
    resolve(context.root) !== root ||
    typeof context.id !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(context.id)
  )
    throw new Error(`${contextVariable} does not identify this repository run`)
  return join(root, ".test-runs", context.id)
}

function validateReport(value) {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !Number.isFinite(value.threshold) ||
    !Array.isArray(value.rows) ||
    (value.diagnostics !== undefined && !Array.isArray(value.diagnostics))
  )
    throw new Error("crap4ts returned an unsupported JSON report")
  for (const row of value.rows) {
    if (
      !isObject(row) ||
      typeof row.path !== "string" ||
      typeof row.name !== "string" ||
      !Number.isInteger(row.complexity) ||
      !isObject(row.coverage) ||
      typeof row.coverage.status !== "string" ||
      (row.crap !== null && !Number.isFinite(row.crap))
    )
      throw new Error("crap4ts returned an invalid function row")
  }
  return value
}

function compactDiagnostics(diagnostics = []) {
  return diagnostics
    .slice(0, maximumDiagnostics)
    .map((diagnostic) => ({
      category: cleanLine(diagnostic?.category).slice(0, 128),
      message: cleanLine(diagnostic?.message).slice(0, 512)
    }))
}

const compactRow = (row) => ({
  path: row.path,
  name: row.name,
  kind: row.kind,
  line: Number.isInteger(row.range?.start?.line) ? row.range.start.line : null,
  complexity: row.complexity,
  coverage: {
    status: row.coverage.status,
    covered: Number.isFinite(row.coverage.covered) ? row.coverage.covered : null,
    total: Number.isFinite(row.coverage.total) ? row.coverage.total : null,
    fraction: Number.isFinite(row.coverage.fraction) ? row.coverage.fraction : null
  },
  crap: Number.isFinite(row.crap) ? row.crap : null
})

function renderSummary(report, reportPath) {
  const lines = ["## CRAP quality report", ""]
  if (report.state === "advisory-threshold-breaches") {
    lines.push(
      `Threshold ${report.threshold} is advisory: ${report.counts.aboveThreshold} functions exceed it. Missing evidence and analysis errors remain blocking.`
    )
  } else if (report.state === "passed") {
    lines.push(`Threshold ${report.threshold} passed across ${report.counts.functions} functions.`)
  } else {
    lines.push(`CRAP analysis failed (tool exit ${report.toolExitCode ?? "unavailable"}); this remains blocking.`)
  }
  lines.push(`Machine report: <code>${escapeHtml(relative(report.root, reportPath))}</code>`, "")

  const failures = report.rowsAboveThreshold ?? []
  if (failures.length > 0) {
    lines.push("### Functions above threshold", "")
    for (const row of failures.slice(0, maximumSummaryFunctions)) {
      const location = row.line === null ? row.path : `${row.path}:${row.line}`
      lines.push(
        `- <code>${escapeHtml(location)} — ${escapeHtml(row.name)}</code> — CRAP ${row.crap ?? "unknown"}, complexity ${row.complexity}, coverage ${row.coverage.fraction ?? "unknown"}`
      )
    }
    if (failures.length > maximumSummaryFunctions)
      lines.push(`- ${failures.length - maximumSummaryFunctions} more; see the machine report.`)
    lines.push("")
  }

  const missing = report.missingEvidence ?? []
  if (missing.length > 0) {
    lines.push("### Functions with missing coverage evidence", "")
    for (const row of missing.slice(0, maximumSummaryFunctions)) {
      const location = row.line === null ? row.path : `${row.path}:${row.line}`
      lines.push(`- <code>${escapeHtml(location)} — ${escapeHtml(row.name)}</code>`)
    }
    if (missing.length > maximumSummaryFunctions)
      lines.push(`- ${missing.length - maximumSummaryFunctions} more; see the machine report.`)
    lines.push("")
  }

  if (report.stderrExcerpt) {
    lines.push("### Tool diagnostics", "", "```text", report.stderrExcerpt, "```", "")
  }
  return `${lines.join("\n")}\n`
}

async function persistReport(runDirectory, report, summaryPath, writeSummary) {
  const reportPath = join(runDirectory, "quality-report.json")
  await mkdir(runDirectory, { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, "utf8")
  if (summaryPath) {
    await mkdir(dirname(summaryPath), { recursive: true })
    await appendFile(summaryPath, renderSummary(report, reportPath), "utf8")
    writeSummary?.(reportPath)
  }
  return reportPath
}

export async function runQualityReport({
  root = repositoryRoot,
  runDirectory,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
  toolPath = join(root, "node_modules", ".bin", "crap4ts"),
  writeStderr = (value) => process.stderr.write(value),
  writeSummary
} = {}) {
  root = resolve(root)
  runDirectory ??= runDirectoryFor(root, process.env[contextVariable])

  let stdout = ""
  let stderr = ""
  let toolExitCode = 0
  let toolSignal = null
  let toolError
  let streamedStderr = false
  try {
    const execution = execute(toolPath, ["--json"], { cwd: root, encoding: "utf8", maxBuffer: maximumOutputBytes })
    const stderrStream = execution.child?.stderr
    if (stderrStream) {
      stderrStream.setEncoding("utf8")
      stderrStream.on("data", writeStderr)
      streamedStderr = true
    }
    const result = await execution
    stdout = result.stdout
    stderr = result.stderr
  } catch (error) {
    stdout = typeof error.stdout === "string" ? error.stdout : ""
    stderr = typeof error.stderr === "string" ? error.stderr : ""
    toolExitCode = Number.isInteger(error.code) ? error.code : 1
    toolSignal = error.signal ?? null
    if (!Number.isInteger(error.code)) toolError = cleanLine(error.message)
  }
  if (stderr && !streamedStderr) writeStderr(stderr)

  const stderrExcerpt = excerpt(stderr)
  let parsed
  let invalidReport
  try {
    parsed = validateReport(JSON.parse(stdout))
  } catch (error) {
    invalidReport = cleanLine(error.message)
  }

  if (!parsed) {
    const exitCode = toolExitCode === 0 ? 1 : toolExitCode
    const report = {
      version: 1,
      state: "invalid-report",
      toolExitCode,
      exitCode,
      toolSignal,
      threshold: null,
      counts: { functions: 0, measured: 0, missingEvidence: 0, aboveThreshold: 0 },
      rowsAboveThreshold: [],
      missingEvidence: [],
      diagnostics: [],
      stderrExcerpt,
      message: toolError ?? invalidReport,
      root
    }
    await persistReport(runDirectory, report, summaryPath, writeSummary)
    return exitCode
  }

  const rowsAboveThreshold = parsed.rows
    .filter((row) => Number.isFinite(row.crap) && row.crap > parsed.threshold)
    .map(compactRow)
    .sort((a, b) => (b.crap ?? 0) - (a.crap ?? 0) || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0))
  const missingEvidence = parsed.rows.filter((row) => row.coverage.status !== "measured").map(compactRow)
  const diagnostics = compactDiagnostics(parsed.diagnostics)
  const hasBlockingDiagnostics = (parsed.diagnostics ?? []).some(
    (diagnostic) =>
      !isObject(diagnostic) ||
      typeof diagnostic.category !== "string" ||
      !advisoryDiagnosticCategories.has(diagnostic.category) ||
      typeof diagnostic.message !== "string"
  )
  const hasThresholdDiagnostic = (parsed.diagnostics ?? []).some(
    (diagnostic) => diagnostic?.category === "threshold_breach"
  )
  const hasContradictorySuccess =
    toolExitCode === 0 &&
    (missingEvidence.length > 0 || rowsAboveThreshold.length > 0 || hasBlockingDiagnostics || hasThresholdDiagnostic)
  const canAdvise =
    toolExitCode === 2 && rowsAboveThreshold.length > 0 && missingEvidence.length === 0 && !hasBlockingDiagnostics
  const exitCode = canAdvise ? 0 : hasContradictorySuccess ? 1 : toolExitCode
  const report = {
    version: 1,
    state: canAdvise
      ? "advisory-threshold-breaches"
      : toolExitCode === 0 && !hasContradictorySuccess
        ? "passed"
        : "failed",
    toolExitCode,
    exitCode,
    toolSignal,
    threshold: parsed.threshold,
    counts: {
      functions: parsed.rows.length,
      measured: parsed.rows.length - missingEvidence.length,
      missingEvidence: missingEvidence.length,
      aboveThreshold: rowsAboveThreshold.length,
      diagnostics: parsed.diagnostics?.length ?? 0
    },
    rowsAboveThreshold,
    missingEvidence,
    diagnostics,
    stderrExcerpt,
    root
  }
  if (toolError) report.message = toolError
  else if (hasContradictorySuccess && missingEvidence.length > 0)
    report.message = "missing coverage evidence contradicts the successful tool exit"
  else if (hasContradictorySuccess && rowsAboveThreshold.length > 0)
    report.message = "a threshold breach contradicts the successful tool exit"
  else if (hasContradictorySuccess && (hasBlockingDiagnostics || hasThresholdDiagnostic))
    report.message = "analysis diagnostics contradict the successful tool exit"
  else if (toolExitCode === 2 && rowsAboveThreshold.length === 0)
    report.message = "crap4ts exited 2 without a row above the reported threshold"
  else if (toolExitCode === 2 && missingEvidence.length > 0)
    report.message = "missing coverage evidence remains blocking"
  else if (toolExitCode === 2 && hasBlockingDiagnostics) report.message = "analysis diagnostics remain blocking"
  await persistReport(runDirectory, report, summaryPath, writeSummary)
  return exitCode
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runQualityReport()
  } catch (error) {
    console.error(error.stack ?? error.message)
    process.exitCode = 1
  }
}
