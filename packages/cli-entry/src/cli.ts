#!/usr/bin/env node
import type { InvocationSession } from "@hapsland/administration/invocation/session"
import { cliJourney } from "@hapsland/administration/interaction/flow-input"
import {
  statePathConfig,
  activityPathConfig,
  userConfigPathConfig
} from "@hapsland/runtime-inputs/runtime/input-settings"
import { formatReviewFeedback } from "@hapsland/delivery-output/feedback/message"
import { parseInvocation, type Invocation } from "@hapsland/administration/cli-command"
import "effect/Schedule"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Option from "effect/Option"
import "node:os"
import { readFileSync } from "node:fs"
import {
  currentCommand,
  runtimeVersion,
  packageCommand,
  packageBuildIdentity
} from "@hapsland/runtime-environment/runtime/package-runtime"
import { machineClockLayer } from "@hapsland/runtime-environment/runtime/machine-clock"
import { forcedEvaluationOperation, runJsonEvaluation } from "@hapsland/administration/evaluation/invocation"
import { cliSwitch, isCredentialCommand } from "@hapsland/administration/invocation/session-options"
import { forcedInstallationOperation } from "@hapsland/administration/onboarding/installation/request"
import { forcedOperation } from "@hapsland/administration/composition/read-request"
import { type ProgramInput } from "@hapsland/administration/invocation/json-input"
import { runJsonSetup } from "@hapsland/administration/onboarding/setup-invocation"
import { runJsonDemo } from "@hapsland/administration/onboarding/demo-invocation"
import { runJsonInstallation } from "@hapsland/administration/onboarding/installation/dispatch"
import { runAdministrativeOperation } from "@hapsland/administration/composition/read-command"
import { writeCredentialSummary } from "@hapsland/administration/credentials/summary"
import { runCredentialCommand } from "@hapsland/administration/credentials/command"
import { runLifecycle } from "@hapsland/administration/onboarding/lifecycle-invocation"
import { localFailureMessage } from "@hapsland/administration/invocation/failure-message"
import { assignResultExitCode } from "@hapsland/administration/invocation/result"

const readStdin = Effect.try({ try: () => readFileSync(0, "utf8"), catch: () => new Error("could not read stdin") })

const readProgramInput = Effect.fn("Cli.readProgramInput")(function* () {
  const input = yield* readStdin
  const statePath = yield* statePathConfig
  const activityPath = yield* activityPathConfig
  const userConfigPath = Option.getOrUndefined(yield* userConfigPathConfig)
  return { input, statePath, activityPath, userConfigPath }
})

const jsonRoute = (session: InvocationSession, input: string) => {
  const routes = [
    {
      kind: "evaluation",
      requested:
        forcedEvaluationOperation(session) !== undefined || /"operation"\s*:\s*"(?:plan|run|report)"/.test(input)
    },
    { kind: "setup", requested: cliSwitch(session, "setup") || /"operation"\s*:\s*"setup"/.test(input) },
    { kind: "demo", requested: cliSwitch(session, "demo") || /"operation"\s*:\s*"demo"/.test(input) },
    {
      kind: "installation",
      requested:
        forcedInstallationOperation(session) !== undefined ||
        /"operation"\s*:\s*"(?:doctor|install-preview|install|update-preview|update|uninstall)"/.test(input)
    },
    {
      kind: "administrative",
      requested:
        forcedOperation(session) !== undefined || /"operation"\s*:\s*"(?:credentials|status|explain)"/.test(input)
    }
  ] as const
  return routes.find((route) => route.requested)?.kind ?? "unsupported"
}

const dispatchJsonInput = Effect.fn("Cli.dispatchJsonInput")(function* (
  session: InvocationSession,
  context: ProgramInput
) {
  const handlers = {
    evaluation: (context: ProgramInput) => runJsonEvaluation(session, context.input),
    setup: (context: ProgramInput) => runJsonSetup(context.input, context.statePath, context.userConfigPath),
    demo: (context: ProgramInput) => runJsonDemo(context.input),
    installation: runJsonInstallation.bind(null, session),
    administrative: (context: ProgramInput) =>
      runAdministrativeOperation(
        session,
        context.input,
        context.statePath,
        context.activityPath,
        context.userConfigPath
      ),
    unsupported: () =>
      Effect.succeed({ version: 1, error: { code: "invalid_request", message: "unsupported command" } })
  }
  return yield* handlers[jsonRoute(session, context.input)](context)
})

const program = (session: InvocationSession) =>
  Effect.gen(function* () {
    return yield* dispatchJsonInput(session, yield* readProgramInput())
  }).pipe(
    Effect.catchCause(() =>
      Effect.succeed({
        version: 1,
        error: { code: "invalid_request", message: "input does not satisfy a supported command contract" }
      })
    )
  )

const processConfigurationLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }))

const interactiveCredentialOutput = (session: InvocationSession): boolean =>
  isCredentialCommand(session) &&
  !cliSwitch(session, "json") &&
  !cliSwitch(session, "credential-stdin") &&
  process.stdin.isTTY

const writeResultOutput = (session: InvocationSession, output: unknown): void => {
  if (interactiveCredentialOutput(session)) {
    writeCredentialSummary(output as Readonly<Record<string, unknown>>)
    return
  }
  process.stdout.write(typeof output === "string" ? output : `${JSON.stringify(output)}\n`)
}

const runAutomation = Effect.fn("Cli.automation")(function* (session: InvocationSession) {
  const output = yield* isCredentialCommand(session) ? runCredentialCommand(session) : program(session)
  assignResultExitCode(output)
  writeResultOutput(session, output)
})

const writeIdentityOutput = (session: InvocationSession): boolean => {
  if (cliSwitch(session, "feedback-preview")) {
    process.stdout.write(
      "Synthetic example; no review was run.\n\n" +
        formatReviewFeedback([
          {
            path: "example.ts",
            declaration: "ExampleState",
            message: "This is a sample finding. Actual messages come from the configured rule."
          }
        ]) +
        "\n"
    )
  } else if (cliSwitch(session, "runtime-identity")) {
    process.stdout.write(
      JSON.stringify({ version: runtimeVersion(), platform: process.platform, architecture: process.arch }) + "\n"
    )
  } else if (cliSwitch(session, "package-identity")) {
    process.stdout.write(
      JSON.stringify({
        name: "@hapsland/hapsland",
        ...currentCommand(),
        resident: { version: 1, build: packageBuildIdentity, command: packageCommand("resident") }
      }) + "\n"
    )
  } else return false
  return true
}

const dispatchInvocation = Effect.fn("Cli.dispatch")(function* (session: InvocationSession, invocation: Invocation) {
  if (invocation.kind === "dashboard") {
    const { runInspectionDashboard } = yield* Effect.promise(
      () => import("@hapsland/administration/inspection/command")
    )
    return yield* runInspectionDashboard(invocation)
  }
  if (writeIdentityOutput(session)) return
  if (invocation.kind === "rules") {
    const { runRulesCommand } = yield* Effect.promise(() => import("@hapsland/administration/rules/command"))
    return yield* cliJourney("rules", () => runRulesCommand(invocation.options))
  }
  if (invocation.kind === "lifecycle" || cliSwitch(session, "pilot")) return yield* runLifecycle(session, invocation)
  return yield* runAutomation(session)
})

const main = Effect.gen(function* () {
  const invocation = yield* parseInvocation(process.argv.slice(2))
  if (invocation === undefined) return
  const session: InvocationSession = {
    options: invocation.kind === "automation" ? invocation.options : undefined,
    client: invocation.kind === "lifecycle" || invocation.kind === "automation" ? invocation.client : undefined,
    setupInventoryShown: false
  }
  yield* dispatchInvocation(session, invocation)
}).pipe(
  Effect.provide(processConfigurationLayer),
  Effect.provide(machineClockLayer),
  Effect.catchDefect((cause) => Effect.fail(cause)),
  Effect.catch((cause) =>
    Effect.sync(() => {
      process.stderr.write(`${localFailureMessage(cause)}\n`)
      process.exitCode = 6
    })
  )
)

NodeRuntime.runMain(main, { disableErrorReporting: true })
