import { request } from "node:https"
import { readFileSync } from "node:fs"

// Transport control only. Endpoint discovery and hook logic are evaluated separately.
const certificate = readFileSync(process.env.HAPSLAND_PROBE_CERT ?? "", "utf8")
const body = JSON.stringify({ version: 1, operation: "hello" })
const connection = request(
  {
    hostname: "127.0.0.1",
    port: Number(process.env.HAPSLAND_PROBE_PORT ?? "0"),
    path: "/ipc",
    method: "POST",
    ca: certificate,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
    agent: false,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      authorization: `Bearer ${process.env.HAPSLAND_PROBE_TOKEN ?? ""}`
    }
  },
  (response) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let failed = false
    response.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes > 262_144) {
        failed = true
        process.exitCode = 1
        connection.destroy()
      } else chunks.push(chunk)
    })
    response.on("end", () => {
      if (response.statusCode !== 200) process.exitCode = 1
      else if (!failed) process.stdout.write(Buffer.concat(chunks).toString("utf8"))
    })
  }
)
connection.on("error", (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
connection.setTimeout(1500, () => {
  process.exitCode = 1
  connection.destroy()
})
connection.end(body)
