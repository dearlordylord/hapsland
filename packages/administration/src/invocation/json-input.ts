import * as Effect from "effect/Effect"

export const decodeJson = (input: string) =>
  Effect.try({ try: () => JSON.parse(input) as unknown, catch: () => new Error("stdin is not valid JSON") })

export type ProgramInput = {
  readonly input: string
  readonly statePath: string
  readonly activityPath: string
  readonly userConfigPath: string | undefined
}
