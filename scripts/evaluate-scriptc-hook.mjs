import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// Build-host evaluation only. This runner never changes the installed hook command.
const [compilerPath, inputPath, outputPath, outputKind = "ir", packages = "effect", mode = "static"] =
  process.argv.slice(2)
if (!compilerPath || !inputPath || !outputPath) throw new Error("compiler module, entry and output are required")
const entry = resolve(inputPath)
const output = resolve(outputPath)
const compiler = pathToFileURL(resolve(compilerPath)).href
await mkdir(dirname(output), { recursive: true })
const options = {
  npmStatic: packages.split(","),
  dynamic: mode === "hybrid",
  optimization: "dev",
  outputKind,
  outDir: dirname(output),
  outPath: output
}
const record = {
  version: 1,
  startedAt: new Date().toISOString(),
  entry,
  entrySha256: createHash("sha256")
    .update(await readFile(entry))
    .digest("hex"),
  compiler,
  options,
  timeoutMs: 300_000,
  status: "running"
}
const recordPath = `${output}.evaluation.json`
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`)
const childCode = `
  import { writeFileSync } from "node:fs";
  try {
    const { compile } = await import(process.argv[1]);
    const result = await compile(process.argv[2], JSON.parse(process.argv[3]));
    writeFileSync(process.argv[4], JSON.stringify(result, (key, value) => key === "sourceTexts" ? undefined : value));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    writeFileSync(process.argv[4], JSON.stringify({ok:false,exception:error.message,stack:error.stack}));
    process.exitCode = 1;
  }
`
const resultPath = `${output}.compile.json`
const started = performance.now()
const child = spawn(
  process.execPath,
  ["--input-type=module", "--eval", childCode, compiler, entry, JSON.stringify(options), resultPath],
  { stdio: ["ignore", "pipe", "pipe"], detached: true }
)
let log = ""
child.stdout.on("data", (data) => {
  log += data
})
child.stderr.on("data", (data) => {
  log += data
})
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  try {
    process.kill(-child.pid, "SIGKILL")
  } catch {}
}, record.timeoutMs)
const termination = await new Promise((done) => {
  child.once("error", (error) => done({ exitCode: null, error: error.message }))
  child.once("close", (exitCode, signal) => done({ exitCode, signal }))
})
clearTimeout(timer)
await writeFile(`${output}.log`, log)
const result = await readFile(resultPath, "utf8")
  .then(JSON.parse)
  .catch(() => null)
Object.assign(record, termination, {
  finishedAt: new Date().toISOString(),
  elapsedMs: performance.now() - started,
  timedOut,
  status: timedOut ? "timed-out" : termination.exitCode === 0 ? "passed" : "failed",
  result
})
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`)
console.log(
  JSON.stringify({ status: record.status, exitCode: record.exitCode, elapsedMs: record.elapsedMs, recordPath })
)
process.exitCode = record.status === "passed" ? 0 : 1
