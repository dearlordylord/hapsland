import { connect, createServer, type TLSSocket } from "node:tls"
import { randomBytes, timingSafeEqual } from "node:crypto"

export const RESIDENT_LOOPBACK = "127.0.0.1" as const
export const RESIDENT_AUTH_REPLY = "authenticated\n"
export const RESIDENT_AUTH_BYTES = 65

export type ResidentPortIdentity = { readonly certificate: string; readonly privateKey: string }
export type ResidentPortAddress = { readonly port: number; readonly certificate: string; readonly token: string }

/** TLS proves the resident before the secret is sent; the secret authorizes a client. */
export function createResidentPort(
  identity: ResidentPortIdentity,
  accept: (socket: TLSSocket) => void,
  maxConnections: number
) {
  const token = randomBytes(32).toString("hex")
  const expected = Buffer.from(`${token}\n`, "ascii")
  const server = createServer(
    { cert: identity.certificate, key: identity.privateKey, minVersion: "TLSv1.3", handshakeTimeout: 1500 },
    (socket) => {
      const chunks: Buffer[] = []
      let bytes = 0
      const ignoreError = () => undefined
      const timeout = () => socket.destroy()
      const authenticationDeadline = setTimeout(timeout, 1500)
      socket.once("close", () => {
        clearTimeout(authenticationDeadline)
        socket.removeListener("error", ignoreError)
      })
      socket.on("error", ignoreError)
      socket.setTimeout(1500, timeout)
      const authenticate = (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > RESIDENT_AUTH_BYTES) {
          socket.destroy()
          return
        }
        chunks.push(chunk)
        if (bytes !== RESIDENT_AUTH_BYTES) return
        if (!timingSafeEqual(Buffer.concat(chunks), expected)) {
          socket.destroy()
          return
        }
        socket.pause()
        clearTimeout(authenticationDeadline)
        socket.removeListener("data", authenticate)
        socket.removeListener("timeout", timeout)
        // The application reader owns resume; it may yield while installing listeners.
        socket.write(RESIDENT_AUTH_REPLY)
        accept(socket)
      }
      socket.on("data", authenticate)
    }
  )
  server.maxConnections = maxConnections
  // Count and bound raw connections too, including incomplete TLS handshakes.
  server.on("connection", (socket) => socket.setTimeout(1500, () => socket.destroy()))
  server.on("tlsClientError", () => {})
  return { server, token, certificate: identity.certificate }
}

/** No application payload is written until TLS verification and token acknowledgement. */
export function connectResidentPort(address: ResidentPortAddress, ready: (socket: TLSSocket) => void) {
  const socket = connect({
    host: RESIDENT_LOOPBACK,
    port: address.port,
    ca: address.certificate,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3"
  })
  let reply = ""
  const authenticate = (chunk: Buffer) => {
    reply += chunk.toString("ascii")
    if (reply.length > RESIDENT_AUTH_REPLY.length || !RESIDENT_AUTH_REPLY.startsWith(reply)) {
      socket.destroy(new Error("resident authentication failed"))
      return
    }
    if (reply !== RESIDENT_AUTH_REPLY) return
    socket.removeListener("data", authenticate)
    ready(socket)
  }
  socket.on("data", authenticate)
  socket.once("secureConnect", () => socket.write(`${address.token}\n`))
  return socket
}
