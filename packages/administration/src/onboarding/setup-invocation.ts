import type { InvocationSession } from "../invocation/session.ts"
import { childFlow } from "../interaction/flow-input.ts"
import { InteractionService } from "../interaction/interaction.ts"
import { CLIENT_NAMES, SUPPORTED_CLIENTS } from "@hapsland/runtime-environment/runtime/agent-clients"
import { NEW_KEY_FLAG } from "@hapsland/runtime-environment/runtime/cli-names"
import { HAPSLAND_CONFIG_DIRECTORY } from "@hapsland/runtime-environment/runtime/user-paths"
import type { SetupClient, ClientChoice } from "./client-selection.ts"
import { SetupOperation } from "./setup-request.ts"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { join } from "node:path"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { currentCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import { discoverWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { decodeJson } from "../invocation/json-input.ts"
import { hostFields } from "./invocation-fields.ts"
import { setupClientChoice } from "./client-discovery.ts"
import { localFailureMessage } from "../invocation/failure-message.ts"

export const decodeSetupOperation = (input: string) =>
  decodeJson(input).pipe(Effect.flatMap(Schema.decodeUnknownEffect(SetupOperation, { onExcessProperty: "error" })))

export const runJsonSetup = Effect.fn("Cli.runJsonSetup")(function* (
  input: string,
  statePath: string,
  userConfigPath: string | undefined
) {
  const operation: SetupOperation = yield* decodeSetupOperation(input)
  const { runSetup } = yield* Effect.promise(() => import("./setup.ts"))
  const { runCredentialSession } = yield* Effect.promise(() => import("../credentials/login-conversation.ts"))
  return yield* runSetup(operation, {
    statePath,
    ...(userConfigPath === undefined ? {} : { userConfigPath }),
    ...(operation.interactive === true
      ? {
          credentialConversation: (settings) =>
            runCredentialSession({
              root: settings.configuration.policy.root,
              envVar: settings.credentialEnvVar,
              referenceExplicit: settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
            })
        }
      : {})
  })
})

export const pilotConfiguration = Effect.fn("InteractiveSetup.configuration")(function* () {
  const configuredStatePath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_STATE_PATH")))
  const statePath =
    configuredStatePath ??
    (yield* Config.NonEmptyString("REVIEW_CONSENT_FILE").pipe(
      Config.withDefault(join(HAPSLAND_CONFIG_DIRECTORY, "consent"))
    ))
  const userConfigPath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  return { statePath, ...(userConfigPath === undefined ? {} : { userConfigPath }) }
})

const writeSetupRuleInventory = Effect.fn("InteractiveSetup.ruleInventory")(function* (
  session: InvocationSession,
  terminal: boolean,
  cwd: string,
  configuration: Effect.Success<ReturnType<typeof pilotConfiguration>> | undefined
) {
  if (terminal && !session.setupInventoryShown) {
    session.setupInventoryShown = true
    const { loadRuleInventory, formatRuleInventory } = yield* Effect.promise(() => import("../rules/inventory.ts"))
    const root = yield* discoverWorkingTreeRoot(cwd)
    const inventory = yield* loadRuleInventory(root, configuration ?? {}).pipe(Effect.result)
    if (inventory._tag === "Success") process.stderr.write(formatRuleInventory(inventory.success))
    else
      process.stderr.write(
        "Rule inventory unavailable; repair the connected rule files or configuration and run hapsland rules list.\n"
      )
  }
})

export const setupActivationCompleted = (
  result: Effect.Success<ReturnType<typeof import("./pilot.ts").runPilotSetup>>
): boolean => result.kind === "completed" && result.exitCode === 0 && result.model.activation === "completed"

export const pilotSetup = Effect.fn("InteractiveSetup.run")(function* (session: InvocationSession, host: SetupClient) {
  const interaction = yield* InteractionService
  const { runSetup } = yield* Effect.promise(() => import("./setup.ts"))
  const { runLoginConversation, credentialLoginLayer } = yield* Effect.promise(
    () => import("../credentials/login-conversation.ts")
  )
  const { activateCurrentPackage } = yield* Effect.promise(() => import("./client-lifecycle.ts"))
  const { runPilotSetup, SetupOwnerService } = yield* Effect.promise(() => import("./pilot.ts"))
  const { runGuidedCredentialCheck } = yield* Effect.promise(() => import("./verification-conversation.ts"))
  const terminal = Boolean(process.stdin.isTTY && process.stderr.isTTY)
  const configuration = terminal ? yield* pilotConfiguration() : undefined
  const cwd = process.cwd()
  const command = currentCommand()
  const result = yield* runPilotSetup({
    terminal,
    host,
    fields: hostFields(session, host),
    cwd,
    platform: process.platform,
    newKey: session.client?.flags.has(NEW_KEY_FLAG) ?? false
  }).pipe(
    Effect.provideService(SetupOwnerService, {
      run: (request, entered, onProgress) =>
        configuration === undefined
          ? Effect.fail(new Error("setup configuration unavailable"))
          : runSetup(request, {
              ...configuration,
              onProgress,
              credentialConversation: (settings) =>
                childFlow("setup", "login", runLoginConversation()).pipe(
                  Effect.provideService(InteractionService, interaction),
                  Effect.provide(
                    credentialLoginLayer({
                      root: settings.configuration.policy.root,
                      envVar: settings.credentialEnvVar,
                      referenceExplicit: settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
                    })
                  ),
                  Effect.tap((model) => (model.storage?.status === "stored" ? Effect.sync(entered) : Effect.void))
                )
            }),
      activate: activateCurrentPackage(command),
      verifyCredential: runGuidedCredentialCheck({
        cwd,
        host,
        platform: process.platform,
        ...(configuration?.userConfigPath === undefined ? {} : { userConfigPath: configuration.userConfigPath })
      }).pipe(Effect.provideService(InteractionService, interaction)),
      doctor: execFileClosedStdin(command.executable, [...command.args, "--doctor"], {
        cwd,
        env: process.env,
        maxBuffer: 1024 * 1024,
        input: JSON.stringify({ version: 1, operation: "doctor", cwd, ...hostFields(session, host) }),
        timeout: 10_000
      })
    })
  )
  if (result.exitCode !== 0) process.exitCode = result.exitCode
  if (result.kind === "completed") yield* writeSetupRuleInventory(session, terminal, cwd, configuration)
  if (setupActivationCompleted(result)) {
    yield* interaction.present(
      `\n✅ Setup complete.\nNext: restart ${CLIENT_NAMES[host]}, complete any native trust prompts, then make an edit and check the inspection dashboard.\n`
    )
  }
  return result
})

export const pilotSetupSession = Effect.fn("InteractiveSetup.session")(function* (
  session: InvocationSession,
  host: SetupClient
) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    process.stderr.write(
      "Guided setup needs a terminal. Run hapsland --pilot there, or use hapsland --setup with a versioned JSON request.\n"
    )
    process.exitCode = 6
    return
  }
  const { withInteractionSession } = yield* Effect.promise(() => import("../interaction/interaction-session.ts"))
  yield* withInteractionSession(
    (interaction) =>
      pilotSetup(session, host).pipe(Effect.provideService(InteractionService, interaction), Effect.asVoid),
    Effect.sync(() => {
      process.exitCode = 130
    })
  )
})

export const chooseSetupClients = Effect.fn("InteractiveSetup.chooseClients")(function* (session: InvocationSession) {
  const { runSetupSelection } = yield* Effect.promise(() => import("./setup-selection.ts"))
  if (!process.stdin.isTTY || !process.stderr.isTTY)
    throw new Error("Guided setup needs a terminal. Use --setup JSON for automation.")
  const choices: ClientChoice[] = yield* Effect.forEach(SUPPORTED_CLIENTS, setupClientChoice.bind(null, session))
  const { InteractionService } = yield* Effect.promise(() => import("../interaction/interaction.ts"))
  const { withInteractionSession } = yield* Effect.promise(() => import("../interaction/interaction-session.ts"))
  yield* withInteractionSession(
    (input) =>
      runSetupSelection(choices, (host) =>
        Effect.gen(function* () {
          const result = yield* pilotSetup(session, host).pipe(
            Effect.catchDefect((cause) => Effect.fail(cause)),
            Effect.result
          )
          if (result._tag === "Failure") {
            process.stderr.write(`${host}: ${localFailureMessage(result.failure)}\n`)
            process.exitCode = 6
            return "cancelled" as const
          }
          return result.success.kind
        })
      ).pipe(Effect.provideService(InteractionService, input)),
    Effect.sync(() => {
      process.exitCode = 130
    })
  )
})
