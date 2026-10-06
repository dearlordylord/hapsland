import { dirname } from "node:path"
import type { Server, Socket } from "node:net"
import type { TLSSocket } from "node:tls"
import { Effect } from "effect"
import { generateResidentIdentity } from "../resident/tls-identity.ts"
import { createResidentPort, connectResidentPort, RESIDENT_LOOPBACK } from "../resident/port.ts"
import { readResidentEndpoint, publishResidentEndpoint } from "../resident/endpoint.ts"
import { residentPaths } from "../resident/paths.ts"

let identity: ReturnType<typeof generateResidentIdentity> | undefined
const ports = new WeakMap<Server, ReturnType<typeof createResidentPort>>()
export async function createTestPort(accept: (socket: Socket) => void) {
  identity ??= generateResidentIdentity()
  const port = createResidentPort(
    await identity,
    (socket) => {
      accept(socket)
      socket.resume()
    },
    32
  )
  ports.set(port.server, port)
  return port.server
}
export async function listenTestPort(server: Server, path: string) {
  const port = ports.get(server)
  if (port === undefined) throw new Error("Unknown test port")
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, RESIDENT_LOOPBACK, resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("No port address")
  await Effect.runPromise(
    publishResidentEndpoint(
      { ...residentPaths(dirname(path)), endpoint: path },
      {
        version: 1,
        host: RESIDENT_LOOPBACK,
        port: address.port,
        certificate: port.certificate,
        token: port.token,
        pid: process.pid,
        lifetime: "fixture"
      }
    )
  )
}
export async function connectTestPort(path: string): Promise<TLSSocket> {
  const endpoint = await Effect.runPromise(readResidentEndpoint({ ...residentPaths(dirname(path)), endpoint: path }))
  return new Promise((resolve, reject) => {
    const socket = connectResidentPort(endpoint, resolve)
    socket.setTimeout(1500, () => socket.destroy(new Error("test connection deadline")))
    socket.once("error", reject)
    socket.once("close", () => reject(new Error("test connection closed before authentication")))
  })
}
