import { execFileSync, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:https"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { generateResidentIdentity } from "../src/resident/tls-identity.ts"

const binary = resolve(process.argv[2])
const output = resolve(process.argv[3])
const tlsVersion = process.argv[4] ?? "TLSv1.3"
const root = await mkdtemp(join(tmpdir(), "hapsland-scriptc-https-"))
let identity = await generateResidentIdentity()
const algorithm = process.argv[5] ?? "P-256"
if (algorithm === "RSA-2048") {
  // Fixture generation only; openssl is not a user/runtime dependency.
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(root, "key.pem"),
      "-out",
      join(root, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=Hapsland resident",
      "-addext",
      "subjectAltName=IP:127.0.0.1"
    ],
    { stdio: "ignore", timeout: 10_000 }
  )
  identity = {
    certificate: await readFile(join(root, "cert.pem"), "utf8"),
    privateKey: await readFile(join(root, "key.pem"), "utf8")
  }
}
const other = await generateResidentIdentity()
const certificate = join(root, "trusted.pem")
const wrongCertificate = join(root, "wrong.pem")
await writeFile(certificate, identity.certificate, { mode: 0o600 })
await writeFile(wrongCertificate, other.certificate, { mode: 0o600 })
const token = randomBytes(32).toString("hex")
const expected = JSON.stringify({ version: 1, status: "resident", lifetime: "日本語-resident" }) + "\n"
const cases = []
try {
  for (const scenario of ["trusted", "wrong-certificate", "wrong-token", "split-unicode", "stalled", "oversized"]) {
    let requests = 0
    let authorized = 0
    const sockets = new Set()
    const tlsErrors = []
    const server = createServer(
      { cert: identity.certificate, key: identity.privateKey, minVersion: tlsVersion, maxVersion: tlsVersion },
      (request, response) => {
        requests += 1
        if (request.headers.authorization !== `Bearer ${token}`) {
          response.writeHead(401)
          response.end()
          return
        }
        authorized += 1
        request.resume()
        if (scenario === "stalled") return
        if (scenario === "oversized") {
          response.end("x".repeat(262_145))
          return
        }
        response.writeHead(200, { "content-type": "application/json" })
        if (scenario === "split-unicode") {
          const bytes = Buffer.from(expected)
          const split = bytes.indexOf(Buffer.from("日")) + 1
          response.write(bytes.subarray(0, split))
          setImmediate(() => response.end(bytes.subarray(split)))
        } else response.end(expected)
      }
    )
    server.on("connection", (socket) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
    })
    server.on("tlsClientError", (error) => {
      tlsErrors.push(error.message)
    })
    await new Promise((done, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", done)
    })
    const started = performance.now()
    const child = spawn(binary, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HAPSLAND_PROBE_CERT: scenario === "wrong-certificate" ? wrongCertificate : certificate,
        HAPSLAND_PROBE_PORT: String(server.address().port),
        HAPSLAND_PROBE_TOKEN: scenario === "wrong-token" ? "invalid" : token
      }
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 8000)
    const exitCode = await new Promise((done) => child.once("close", done))
    clearTimeout(timer)
    const success = scenario === "trusted" || scenario === "split-unicode"
    const passed =
      !timedOut &&
      (success ? exitCode === 0 && stdout === expected : exitCode !== 0 && stdout === "") &&
      (scenario !== "wrong-certificate" || requests === 0) &&
      (scenario !== "wrong-token" || (requests === 1 && authorized === 0)) &&
      (!["stalled", "oversized"].includes(scenario) || authorized === 1)
    cases.push({
      scenario,
      passed,
      exitCode,
      timedOut,
      requests,
      authorized,
      stdout,
      stderrBytes: Buffer.byteLength(stderr),
      diagnostic: stderr.replaceAll(token, "<redacted>").slice(0, 2000),
      tlsVersion,
      algorithm,
      tlsErrors,
      elapsedMs: performance.now() - started
    })
    for (const socket of sockets) socket.destroy()
    await new Promise((done) => server.close(done))
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
await mkdir(dirname(output), { recursive: true })
await writeFile(
  output,
  `${JSON.stringify({ version: 1, scope: "HTTPS transport control; no hook/discovery qualification", cases }, null, 2)}\n`
)
console.log(JSON.stringify(cases.map(({ scenario, passed, elapsedMs }) => ({ scenario, passed, elapsedMs }))))
process.exitCode = cases.every((test) => test.passed) ? 0 : 1
