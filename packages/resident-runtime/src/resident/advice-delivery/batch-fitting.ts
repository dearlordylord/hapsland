import * as Effect from "effect/Effect"
import core, { type Command, type Mode, type Response, type Step, type Stream } from "./batch-fitting-core.js"
import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

export const fittingIndices = (list: List<number>): number[] => {
  const values: number[] = []
  while (list.$ === "Con") {
    values.push(list.head)
    list = list.tail
  }
  return values
}

type OfferFinding = Extract<Command, { readonly $: "OfferFinding" }>
export type FindingBatchPorts = {
  readonly beginCurrent: () => boolean
  readonly pull: (stream: Stream) => number | undefined
  readonly prospective: (staged: readonly number[], index: number) => number
  readonly solo: (index: number) => number
  readonly offer: (command: OfferFinding, prospective: number, solo: number) => Effect.Effect<"selected" | "retained" | "limited" | "expired">
  readonly limited: (index: number) => void
  readonly close: () => void
}

const finished = (step: Step): readonly number[] => {
  if (step.$ !== "Finished") throw new Error("Bend batch fitting protocol refused")
  return fittingIndices(step.selected)
}

// This interpreter performs commands only; stream/staging/stop policy is Bend.
export const runFindingBatch = Effect.fn("Collection.runFindingBatch")(
  function* (mode: Exclude<Mode, { readonly $: "Notices" }>, ports: FindingBatchPorts) {
    const measurements: number[] = []
    const measured = (value: number): Response => ({ $: "Measured", handle: measurements.push(value) - 1 })
    try {
      try {
        let step = core.initial(1, mode)
        while (step.$ === "Await") {
          const { request } = step
          const command = request.command
          let response: Response
          switch (command.$) {
            case "BeginCurrent":
              response = { $: ports.beginCurrent() ? "CurrentStarted" : "Exhausted" }
              break
            case "Pull": {
              const index = ports.pull(command.stream)
              response = index === undefined ? { $: "Exhausted" } : { $: "Found", index }
              break
            }
            case "MeasureProspective":
              response = measured(ports.prospective(fittingIndices(command.staged), command.index))
              break
            case "MeasureSolo":
              response = measured(ports.solo(command.index))
              break
            case "OfferFinding": {
              const offered = yield* ports.offer(command, measurements[command.prospective]!, measurements[command.solo]!)
              response = { $: offered === "selected" ? "Selected" : offered === "limited" ? "Limited" : "Omitted" }
              break
            }
            case "NotifyLimited":
              ports.limited(command.index)
              response = { $: "Ack" }
              break
            case "OfferNotice":
              throw new Error("Notice command in finding batch")
            default: {
              const exhaustive: never = command
              throw new Error(`Unknown batch command: ${exhaustive}`)
            }
          }
          step = core.resume(step, { $: "Reply", invocation: request.invocation, id: request.id, response })
        }
        return finished(step)
      } finally {
        ports.close()
      }
    } catch {
      return finished(core.failure())
    }
  },
  (effect) => effect.pipe(Effect.catchDefect(() => Effect.succeed(finished(core.failure()))))
)

export type NoticeBatchPorts = {
  readonly pull: () => number | undefined
  readonly measure: (staged: readonly number[], index: number) => { readonly items: number; readonly bytes: number }
  readonly offer: (items: number, bytes: number, skipUnfitting: boolean) => string
  readonly close: () => void
}

const noticeResponseTags = new Map<string, "Included" | "Skipped" | "Stopped">([
  ["include", "Included"],
  ["skip", "Skipped"],
  ["stop", "Stopped"]
])

export const runNoticeBatch = (skipUnfitting: boolean, ports: NoticeBatchPorts): readonly number[] => {
  const measurements: { readonly items: number; readonly bytes: number }[] = []
  try {
    try {
      let step = core.initial(1, { $: "Notices", skip_unfitting: skipUnfitting })
      while (step.$ === "Await") {
        const { request } = step
        const command = request.command
        let response: Response
        switch (command.$) {
          case "Pull": {
            if (command.stream.$ !== "NoticeOffers") throw new Error("Finding stream in notice batch")
            const index = ports.pull()
            response = index === undefined ? { $: "Exhausted" } : { $: "Found", index }
            break
          }
          case "MeasureProspective":
            response = {
              $: "Measured",
              handle: measurements.push(ports.measure(fittingIndices(command.staged), command.index)) - 1
            }
            break
          case "OfferNotice": {
            const measurement = measurements[command.prospective]!
            const offered = ports.offer(measurement.items, measurement.bytes, command.skip_unfitting)
            response = { $: noticeResponseTags.get(offered) ?? "InvalidNotice" }
            break
          }
          default:
            throw new Error("Finding command in notice batch")
        }
        step = core.resume(step, { $: "Reply", invocation: request.invocation, id: request.id, response })
      }
      return finished(step)
    } finally {
      ports.close()
    }
  } catch {
    return finished(core.failure())
  }
}
