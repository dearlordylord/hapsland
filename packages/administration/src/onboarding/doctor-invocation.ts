import type { InvocationSession } from "../invocation/session.ts"
import { formatOutcome } from "../interaction/outcome.ts"
import type { SetupClient } from "./client-selection.ts"
import { type ClientArguments } from "../invocation/arguments.ts"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { currentCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import { hostFields } from "./invocation-fields.ts"
import { reportClientFailure } from "./maintenance-invocation.ts"

const diagnoseClientProcess = Effect.fn("HumanDoctor.diagnoseClient")(function* (
  session: InvocationSession,
  host: SetupClient
) {
  const command = currentCommand()
  const result = yield* execFileClosedStdin(command.executable, [...command.args, "--doctor"], {
    input: JSON.stringify({ version: 1, operation: "doctor", cwd: process.cwd(), ...hostFields(session, host) }),
    env: process.env,
    timeout: 10_000,
    maxBuffer: 1024 * 1024
  })
  if (result.timedOut) return yield* Effect.fail(new Error("doctor request deadline exceeded"))
  const diagnosis: unknown = yield* Effect.try(() => JSON.parse(result.stdout))
  const checked = yield* Schema.decodeUnknownEffect(Schema.Struct({ status: Schema.String }))(diagnosis)
  return { diagnosis, status: checked.status, exitCode: result.exitCode }
})

export const runHumanDoctor = Effect.fn("Cli.humanDoctor")(function* (
  session: InvocationSession,
  args: ClientArguments
) {
  const { registeredClients, formatDoctor } = yield* Effect.promise(() => import("./client-lifecycle.ts"))
  const hosts = args.host === undefined ? registeredClients(args.flags, reportClientFailure) : [args.host]
  if (hosts.length === 0)
    process.stderr.write(`${formatOutcome("warning", "No Hapsland integrations found. Run hapsland setup first.")}\n`)
  for (const host of hosts) yield* reportHumanDoctorResult(session, host, formatDoctor)
})

const reportHumanDoctorResult = Effect.fn("Cli.reportHumanDoctorResult")(function* (
  session: InvocationSession,
  host: SetupClient,
  formatDoctor: typeof import("./client-lifecycle.ts").formatDoctor
) {
  const result = yield* diagnoseClientProcess(session, host).pipe(Effect.result)
  if (result._tag === "Failure") {
    reportClientFailure(host, result.failure)
    return
  }
  process.stdout.write(formatDoctor(result.success.diagnosis, host).join("\n") + "\n")
  if (result.success.exitCode !== 0 || result.success.status === "not-ready")
    process.exitCode = result.success.exitCode || 6
})
