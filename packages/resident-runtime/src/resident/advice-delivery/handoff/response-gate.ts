import * as Config from "effect/Config"
import * as Option from "effect/Option"
import * as Effect from "effect/Effect"
import { access, writeFile } from "node:fs/promises"
import { type ResidentRequest, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import * as Schedule from "effect/Schedule"
import { ResidentAdapterError, residentAdapter } from "../../adapter-error.ts"

const residentResponseGateVariable = (operation: ResidentRequest["operation"], advice: boolean): string | undefined => {
  if (advice && (operation === "collect" || operation === "admit-and-collect"))
    return "REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"
  const variables: Partial<Record<ResidentRequest["operation"], string>> = {
    admit: "REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH",
    cleanup: "REVIEW_RESIDENT_CLEANUP_RESPONSE_GATE_PATH",
    collect: "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH",
    "admit-and-collect": "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH",
    acknowledge: "REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH"
  }
  return variables[operation]
}

export const residentResponseGate = Effect.fn("ResidentIpc.responseGate")(
  (operation: ResidentRequest["operation"], response: ResidentResponse) =>
    Effect.gen(function* () {
      const adviceGate = yield* Config.option(Config.String("REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"))
      const variable = residentResponseGateVariable(
        operation,
        response.status === "advice" && Option.isSome(adviceGate)
      )
      if (variable === undefined) return
      const configured = yield* Config.option(Config.String(variable))
      if (Option.isNone(configured)) return
      const gate = configured.value
      const enabled = yield* residentAdapter("observe response gate", () => access(`${gate}.enabled`)).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false))
      )
      if (!enabled) return
      yield* residentAdapter("enter response gate", () => writeFile(`${gate}.entered`, "entered\n"))
      yield* residentAdapter("observe response release", () => access(`${gate}.release`)).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
        Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (released) => released })
      )
    }).pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "response gate" })))
)
