import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execute = promisify(execFile)
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

function thresholdValues(value) {
  if (typeof value === "number") return [value]
  if (value === null || typeof value !== "object") return []
  return Object.values(value).flatMap(thresholdValues)
}

export async function checkComplexity(root = repositoryRoot, output = console.log) {
  const temporary = await mkdtemp(join(tmpdir(), "hapsland-complexity-"))
  try {
    const emptyCoverage = join(temporary, "empty.lcov")
    await writeFile(emptyCoverage, "")
    // The native tool owns source discovery and complexity. Unknown coverage is
    // allowed only for this lower-bound check, never for the final CRAP gate.
    const { stdout } = await execute(
      join(root, "node_modules/.bin/crap4ts"),
      [
        "--config",
        join(root, "crap4ts.json"),
        "--no-generate",
        "--report-only",
        "--coverage",
        emptyCoverage,
        "--coverage-format",
        "lcov",
        "--format",
        "json"
      ],
      { cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 }
    )
    const report = JSON.parse(stdout)
    if (report.version !== 1 || !Array.isArray(report.rows) || !Number.isInteger(report.threshold))
      throw new Error("Unsupported complexity report; expected pinned crap4ts single-project report")
    const config = JSON.parse(await readFile(join(root, "crap4ts.json"), "utf8"))
    // A maximum is conservative for path overrides: it can miss an early
    // rejection, but cannot reject a function that its final threshold permits.
    const threshold = Math.max(
      report.threshold,
      ...thresholdValues(config.thresholds),
      ...thresholdValues(config.threshold_overrides ?? config.thresholdOverrides)
    )
    const breaches = report.rows.filter((row) => {
      if (!Number.isInteger(row.complexity) || row.complexity < 1) throw new Error("Invalid complexity measurement")
      return row.complexity > threshold
    })
    for (const row of breaches)
      output(
        `${row.path}:${row.range.start.line} ${row.name}: complexity ${row.complexity} exceeds ${threshold}; CRAP cannot pass`
      )
    output(
      `Complexity lower bound: ${report.rows.length} functions, threshold ceiling ${threshold}, ${breaches.length} guaranteed CRAP failures; coverage not checked`
    )
    return breaches.length ? 2 : 0
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await checkComplexity()
  } catch (error) {
    console.error(error.stderr || error.message)
    process.exitCode = 1
  }
}
