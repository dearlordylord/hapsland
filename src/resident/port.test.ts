import { expect, it } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { connect as tlsConnect } from "node:tls"
import { connect as netConnect } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { createTestPort, listenTestPort, connectTestPort } from "../test-support/resident-port.ts"
import { readResidentEndpoint } from "./endpoint.ts"
import { residentPaths } from "./paths.ts"
import { connectResidentPort } from "./port.ts"
import { generateResidentIdentity } from "./tls-identity.ts"

async function fixture(
  run: (endpoint: Awaited<ReturnType<typeof endpointFor>>, path: string, accepted: () => number) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), "hapsland-port-test-"))
  let accepted = 0
  const server = await createTestPort((socket) => {
    accepted++
    socket.once("data", (chunk) => socket.end(chunk))
  })
  const path = join(directory, "endpoint.json")
  try {
    await listenTestPort(server, path)
    await run(await endpointFor(directory), path, () => accepted)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
}
const endpointFor = (directory: string) => Effect.runPromise(readResidentEndpoint(residentPaths(directory)))

it("authenticates a TLS connection before exchanging the application frame", async () => {
  await fixture(async (_endpoint, path, accepted) => {
    const socket = await connectTestPort(path)
    try {
      const reply = new Promise<string>((resolve, reject) => {
        socket.once("data", (chunk) => resolve(chunk.toString("utf8")))
        socket.once("error", reject)
      })
      socket.write("application frame\n")
      expect(await reply).toBe("application frame\n")
      expect(accepted()).toBe(1)
    } finally {
      socket.destroy()
    }
  })
})

it("rejects a wrong token without admitting an application connection", async () => {
  await fixture(async (endpoint, _path, accepted) => {
    let ready = false
    const socket = connectResidentPort({ ...endpoint, token: "0".repeat(64) }, () => {
      ready = true
    })
    await new Promise<void>((resolve) => {
      socket.on("error", () => {})
      socket.once("close", () => resolve())
    })
    expect(ready).toBe(false)
    expect(accepted()).toBe(0)
  })
})

it("rejects a certificate mismatch before sending the authentication secret", async () => {
  await fixture(async (endpoint, _path, accepted) => {
    const other = await generateResidentIdentity()
    let ready = false
    const socket = connectResidentPort({ ...endpoint, certificate: other.certificate }, () => {
      ready = true
    })
    const failure = await new Promise<Error>((resolve) => socket.once("error", resolve))
    socket.destroy()
    expect(failure).toBeInstanceOf(Error)
    expect(ready).toBe(false)
    expect(accepted()).toBe(0)
  })
})

it("rejects application data pipelined ahead of the authentication acknowledgement", async () => {
  await fixture(async (endpoint, _path, accepted) => {
    const socket = tlsConnect({
      host: endpoint.host,
      port: endpoint.port,
      ca: endpoint.certificate,
      rejectUnauthorized: true
    })
    socket.once("secureConnect", () => socket.write(`${endpoint.token}\napplication frame\n`))
    await new Promise<void>((resolve) => {
      socket.on("error", () => {})
      socket.once("close", () => resolve())
    })
    expect(accepted()).toBe(0)
  })
})

it("bounds a raw connection which never starts TLS", async () => {
  await fixture(async (endpoint, _path, accepted) => {
    const started = performance.now()
    const socket = netConnect({ host: endpoint.host, port: endpoint.port })
    await new Promise<void>((resolve) => {
      socket.on("error", () => {})
      socket.once("close", () => resolve())
    })
    expect(performance.now() - started).toBeLessThan(3000)
    expect(accepted()).toBe(0)
  })
})

it("bounds trickled authentication with an absolute deadline", async () => {
  await fixture(async (endpoint, _path, accepted) => {
    const socket = tlsConnect({
      host: endpoint.host,
      port: endpoint.port,
      ca: endpoint.certificate,
      rejectUnauthorized: true
    })
    let interval: ReturnType<typeof setInterval> | undefined
    const started = performance.now()
    try {
      socket.once("secureConnect", () => {
        interval = setInterval(() => socket.write("a"), 100)
      })
      await new Promise<void>((resolve) => {
        socket.on("error", () => {})
        socket.once("close", () => resolve())
      })
      expect(performance.now() - started).toBeLessThan(3000)
      expect(accepted()).toBe(0)
    } finally {
      clearInterval(interval)
      socket.destroy()
    }
  })
})
