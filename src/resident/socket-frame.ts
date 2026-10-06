import type { Socket } from "node:net"
import { StringDecoder } from "node:string_decoder"
import { Effect } from "effect"
import { MAX_IPC_FRAME_BYTES } from "./protocol.ts"

export type SocketFrame =
  | { readonly _tag: "Frame"; readonly encoded: string }
  | { readonly _tag: "Oversized" }
  | { readonly _tag: "Closed" }

/** One bounded IPC frame and an acknowledged native socket lifetime. */
export interface SocketFramePort {
  readonly read: Effect.Effect<SocketFrame>
  readonly closed: Effect.Effect<void>
  readonly close: Effect.Effect<void>
  readonly canWrite: () => boolean
  readonly setIdleTimeout: (milliseconds: number) => Effect.Effect<void>
  readonly write: (encoded: string) => Effect.Effect<boolean>
  readonly errored: () => boolean
}

export const makeSocketFramePort = Effect.fn("ResidentSocket.make")((socket: Socket) =>
  Effect.sync(() => {
    const ignoreError = () => undefined
    socket.on("error", ignoreError)
    const onTimeout = () => socket.destroy()
    socket.setTimeout(1_500, onTimeout)
    const closed = Effect.callback<void>((resume) => {
      if (socket.closed) {
        resume(Effect.void)
        return
      }
      const onClose = () => resume(Effect.void)
      socket.once("close", onClose)
      return Effect.sync(() => socket.removeListener("close", onClose))
    })
    return Object.freeze({
      closed,
      close: Effect.sync(() => socket.destroy()).pipe(
        Effect.andThen(closed),
        Effect.andThen(
          Effect.sync(() => {
            socket.setTimeout(0)
            socket.removeListener("timeout", onTimeout)
            socket.removeListener("error", ignoreError)
          })
        ),
        Effect.asVoid
      ),
      canWrite: () => !socket.destroyed,
      setIdleTimeout: Effect.fn("ResidentSocket.setIdleTimeout")((milliseconds: number) =>
        Effect.sync(() => {
          socket.setTimeout(milliseconds)
        })
      ),
      errored: () => socket.errored !== null,
      write: Effect.fn("ResidentSocket.write")((encoded: string) =>
        Effect.sync(() => {
          if (socket.destroyed) return false
          socket.end(`${encoded}\n`)
          // Read handlers are detached after the first frame. Drain EOF so Bun can
          // acknowledge native closure and release the bounded connection slot.
          socket.resume()
          return true
        })
      ),
      read: Effect.callback<SocketFrame>((resume) => {
        let bytes = 0
        let encoded = ""
        let finished = false
        const decoder = new StringDecoder("utf8")
        const complete = (frame: SocketFrame) => {
          if (finished) return
          finished = true
          socket.pause()
          cleanup()
          resume(Effect.succeed(frame))
        }
        const onClose = () => complete({ _tag: "Closed" })
        const onData = (chunk: Buffer) => {
          if (finished) return
          bytes += chunk.byteLength
          if (bytes > MAX_IPC_FRAME_BYTES) {
            complete({ _tag: "Oversized" })
            return
          }
          encoded += decoder.write(chunk)
          const newline = encoded.indexOf("\n")
          if (newline >= 0) complete({ _tag: "Frame", encoded: encoded.slice(0, newline) })
        }
        const cleanup = () => {
          socket.removeListener("close", onClose)
          socket.removeListener("data", onData)
        }
        socket.once("close", onClose)
        socket.on("data", onData)
        socket.resume()
        if (socket.closed) onClose()
        return Effect.sync(cleanup)
      })
    } satisfies SocketFramePort)
  })
)
