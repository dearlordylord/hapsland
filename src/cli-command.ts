import { SUPPORTED_CLIENTS, supportedClientNames } from "./runtime/agent-clients.ts"
import {
  validInspectionAddress,
  INSPECTION_HOSTS,
  DEFAULT_INSPECTION_HOST,
  DEFAULT_INSPECTION_PORT
} from "./inspection/options.ts"
import { SETUP_REVIEW_CHOICES, SETUP_CREDENTIAL_CHOICES } from "./onboarding/setup-request.ts"
import { isHookInvocation } from "./runtime/hook-invocation.ts"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Console from "effect/Console"
import * as CliConfig from "effect/cli/CliConfig"
import * as CliError from "effect/cli/CliError"
import * as CliOutput from "effect/cli/CliOutput"
import * as GlobalFlag from "effect/cli/GlobalFlag"
import * as Option from "effect/Option"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { clientCommandDefinitions, type ClientCommand } from "./onboarding/client-command.ts"
import type { SetupClient } from "./onboarding/client-selection.ts"
import { JEV_PROVIDER } from "./runtime/backend.ts"
import { makeRulesCommand, type RulesOptions } from "./rules/cli-definition.ts"
import { ROOT_OPERATIONS, operationHelp, rootOperationExample } from "./cli-help.ts"
import { PACKAGE_VERSION, VERSION_FLAG } from "./runtime/cli-information.ts"
import {
  NEW_KEY_OPTION,
  NEW_KEY_FLAG,
  SETUP_COMMAND,
  CLI_NAME,
  UPDATE_CHANNELS,
  DEFAULT_UPDATE_CHANNEL
} from "./runtime/cli-names.ts"

export type { RulesOptions } from "./rules/cli-definition.ts"

const validate = <A>(read: () => A) =>
  Effect.try({
    try: read,
    catch: (cause) =>
      new CliError.UserError({ cause, userMessage: cause instanceof Error ? cause.message : "Invalid CLI arguments" })
  })

const switchFlag = (name: string, aliases: ReadonlyArray<string> = [], hidden = true) => {
  let flag = Flag.Boolean(name)
  for (const alias of aliases) flag = Flag.withAlias(flag, alias)
  if (hidden) flag = Flag.withHidden(flag)
  return flag.pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0] ?? false)
  )
}
const valueFlag = (name: string) =>
  Flag.String(name).pipe(
    Flag.filter(
      (value) => value.trim() !== "" && !value.startsWith("--"),
      () => "a nonempty value"
    ),
    Flag.atMost(1),
    Flag.map((values) => values[0])
  )
const profiles = {
  host: Flag.Literals("host", SUPPORTED_CLIENTS).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0]),
    Flag.withDescription("Agent runtime; alternative to positional CLIENT (must agree when both are given)")
  ),
  "claude-home": valueFlag("claude-home").pipe(
    Flag.withDescription("Claude registration home; does not change how Claude itself is launched")
  ),
  "claude-executable": valueFlag("claude-executable").pipe(
    Flag.withDescription("Claude executable to probe; defaults to runtime discovery")
  ),
  "pi-home": valueFlag("pi-home").pipe(
    Flag.withDescription("Pi registration home; does not change how Pi itself is launched")
  ),
  "pi-executable": valueFlag("pi-executable").pipe(
    Flag.withDescription("Pi executable to probe; defaults to runtime discovery")
  ),
  "codex-home": valueFlag("codex-home").pipe(
    Flag.withDescription("Codex registration home; does not change how Codex itself is launched")
  ),
  "codex-executable": valueFlag("codex-executable").pipe(
    Flag.withDescription("Codex executable to probe; defaults to runtime discovery")
  )
}
const operationFlags = Object.fromEntries(
  Object.keys(ROOT_OPERATIONS).map((key) => {
    const information = operationHelp(key as keyof typeof ROOT_OPERATIONS)
    return [
      key,
      switchFlag(information.flag ?? key, information.aliases ?? [], information.hidden ?? false).pipe(
        Flag.withDescription(information.description)
      )
    ]
  })
) as { readonly [Key in keyof typeof ROOT_OPERATIONS]: Flag.Flag<boolean> }
const automationFlags = {
  ...operationFlags,
  [NEW_KEY_OPTION]: switchFlag(NEW_KEY_OPTION, [], false).pipe(
    Flag.withDescription(
      `With setup or --pilot, request a new saved ${JEV_PROVIDER.name} key instead of checking the existing key`
    )
  ),
  human: switchFlag("human", ["status-human"], false).pipe(
    Flag.withDescription("Human output for --status; JSON is the status default")
  ),
  json: switchFlag("json", [], false).pipe(
    Flag.withDescription("Structured credential login/logout output; JSON-stdin operations already return JSON")
  ),
  "credential-stdin": switchFlag("credential-stdin"),
  "evaluation-live": switchFlag("evaluation-live"),
  "codex-hook": switchFlag("codex-hook"),
  "claude-hook": switchFlag("claude-hook"),
  "pi-hook": switchFlag("pi-hook"),
  "opencode-hook": switchFlag("opencode-hook"),
  "composed-edit-hook": switchFlag("composed-edit-hook"),
  "composed-before-edit-hook": switchFlag("composed-before-edit-hook"),
  "composed-background-hook": switchFlag("composed-background-hook"),
  "composed-stop-hook": switchFlag("composed-stop-hook"),
  "composed-prompt-hook": switchFlag("composed-prompt-hook"),
  "controlled-reviewer": switchFlag("controlled-reviewer"),
  "controlled-writer": switchFlag("controlled-writer"),
  "review-tool-owned": valueFlag("review-tool-owned").pipe(Flag.withHidden),
  "review-tool-composed-owned": valueFlag("review-tool-composed-owned").pipe(Flag.withHidden),
  "codex-version": valueFlag("codex-version").pipe(Flag.withHidden),
  "composed-host": Flag.Literals("composed-host", ["claude-code", "codex-cli"]).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0]),
    Flag.withHidden
  )
}
export const unattendedSetupOptions = {
  "no-input": switchFlag("no-input", [], false).pipe(
    Flag.withDescription("Suppress prompts; previews unless application is authorized separately")
  ),
  apply: switchFlag("apply", [], false).pipe(
    Flag.withDescription("Authorize applying the current validated setup preview")
  ),
  "save-plan": valueFlag("save-plan").pipe(Flag.withDescription("Save a setup plan for later explicit application")),
  "apply-plan": valueFlag("apply-plan").pipe(
    Flag.withDescription("Apply a saved setup plan after validating its current digests")
  ),
  credential: Flag.Literals("credential", SETUP_CREDENTIAL_CHOICES).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0]),
    Flag.withDescription("Unattended credential choice; required with explicit review/client choices")
  ),
  review: Flag.Literals("review", SETUP_REVIEW_CHOICES).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0]),
    Flag.withDescription("Unattended review choice; required with explicit credential/client choices")
  ),
  json: switchFlag("json", [], false).pipe(
    Flag.withDescription("Structured unattended setup results; does not authorize applying changes")
  )
}
const setupFlag = (name: keyof typeof unattendedSetupOptions): string => `--${name}`
export const unattendedSetupTemplates = (): ReadonlyArray<string> => {
  const base = `${CLI_NAME} ${SETUP_COMMAND} codex ${setupFlag("no-input")} ${setupFlag("review")} ${SETUP_REVIEW_CHOICES[0]} ${setupFlag("credential")}`
  return [
    `${base} ${SETUP_CREDENTIAL_CHOICES[1]} ${setupFlag("json")}`,
    `${base} ${SETUP_CREDENTIAL_CHOICES[1]} ${setupFlag("apply")} ${setupFlag("json")}`,
    `${base} ${SETUP_CREDENTIAL_CHOICES[0]} ${setupFlag("save-plan")} setup-plan.json ${setupFlag("json")}`,
    `${CLI_NAME} ${SETUP_COMMAND} ${setupFlag("no-input")} ${setupFlag("apply-plan")} setup-plan.json ${setupFlag("json")}`
  ]
}
export const unattendedSetupUsage = (): string =>
  `Unattended setup requires an explicit client, ${setupFlag("review")} ${SETUP_REVIEW_CHOICES.join("|")} and ${setupFlag("credential")} ${SETUP_CREDENTIAL_CHOICES.join("|")}. Preview example: ${unattendedSetupTemplates()[0]}. Add ${setupFlag("apply")} to authorize changes, or use ${setupFlag("apply-plan")} FILE.`
export type AutomationOptions = Command.Command.Config.Infer<typeof automationFlags>
export interface ClientArguments {
  readonly host: SetupClient | undefined
  readonly flags: ReadonlyMap<string, string>
}
export type Invocation =
  | { readonly kind: "dashboard"; readonly host: string; readonly port: number }
  | { readonly kind: "rules"; readonly options: RulesOptions }
  | { readonly kind: "automation"; readonly options: AutomationOptions; readonly client: ClientArguments }
  | { readonly kind: "lifecycle"; readonly command: ClientCommand; readonly client: ClientArguments }

type ClientArgumentValues = {
  readonly host?: SetupClient | undefined
  readonly client?: Option.Option<SetupClient>
  readonly [name: string]: unknown
}
const selectedClientHost = (values: ClientArgumentValues): SetupClient | undefined => {
  const positional = values.client === undefined ? undefined : Option.getOrUndefined(values.client)
  if (positional !== undefined && values.host !== undefined && positional !== values.host)
    throw new Error("Positional client and --host disagree.")
  return positional ?? values.host
}
const clientArguments = (values: ClientArgumentValues): ClientArguments => {
  const host = selectedClientHost(values)
  const flags = new Map<string, string>()
  for (const [name, value] of Object.entries(values)) if (typeof value === "string") flags.set(`--${name}`, value)
  if (values[NEW_KEY_OPTION] === true) flags.set(NEW_KEY_FLAG, "true")
  for (const name of ["no-input", "apply", "json"]) if (values[name] === true) flags.set(`--${name}`, "true")
  return { host, flags }
}

const parentOptions = {
  ...automationFlags,
  ...profiles,
  target: valueFlag("target").pipe(
    Flag.withDescription("Explicit Hapsland executable for lifecycle package selection; use a lifecycle subcommand")
  ),
  client: Argument.Literals("client", SUPPORTED_CLIENTS).pipe(
    Argument.optional,
    Argument.withDescription(`Agent runtime: ${SUPPORTED_CLIENTS.join(" | ")}; guided --pilot selection only`)
  )
}
type ParentOptions = Command.Command.Config.Infer<typeof parentOptions>
const activeOption = (value: unknown): boolean => value !== false && value !== undefined
const automationOptionNames = new Set(Object.keys(automationFlags))
const forbiddenPilotOption = (name: string): boolean =>
  automationOptionNames.has(name) && name !== "pilot" && name !== NEW_KEY_OPTION
const pilotConflicts = (values: ParentOptions): boolean =>
  Object.entries(values).some(([name, value]) => forbiddenPilotOption(name) && activeOption(value))
const validateHookChannels = (
  hooks: ReadonlyArray<string>,
  composed: ReadonlyArray<string>,
  operations: ReadonlyArray<string>
): void => {
  if (hooks.length > 1 || composed.length > 1) throw new Error("Hook and operation options cannot be combined.")
  if (hooks.length + composed.length > 0 && operations.length > 0)
    throw new Error("Hook and operation options cannot be combined.")
}
const validateAutomationMode = (values: ParentOptions, operations: ReadonlyArray<string>): void => {
  if (values.pilot && pilotConflicts(values))
    throw new Error(`--pilot accepts only client profile, --target and ${NEW_KEY_FLAG} options.`)
  if (values[NEW_KEY_OPTION] && !values.pilot) throw new Error(`${NEW_KEY_FLAG} requires the setup command or --pilot.`)
  if (values["credential-stdin"] && !values.login) throw new Error("--credential-stdin requires --login.")
  if (operations.length > 1) throw new Error("Operation options cannot be combined.")
}
const hasClientProfile = (values: ParentOptions): boolean =>
  [
    Option.getOrUndefined(values.client),
    values.host,
    values["claude-home"],
    values["claude-executable"],
    values["codex-home"],
    values["codex-executable"],
    values["pi-home"],
    values["pi-executable"],
    values.target
  ].some((value) => value !== undefined)
const validateClientProfile = (values: ParentOptions): void => {
  if (!values.pilot && hasClientProfile(values))
    throw new Error("Client options require a lifecycle command or --pilot.")
}
const validateAutomation = (values: ParentOptions): void => {
  const operations = (Object.keys(operationFlags) as Array<keyof typeof operationFlags>).filter((key) => values[key])
  const hooks = ["codex-hook", "claude-hook", "opencode-hook", "pi-hook"].filter(
    (key) => values[key as keyof typeof values] === true
  )
  const composed = [
    "composed-before-edit-hook",
    "composed-background-hook",
    "composed-stop-hook",
    "composed-prompt-hook",
    "composed-edit-hook"
  ].filter((key) => values[key as keyof typeof values] === true)
  validateHookChannels(hooks, composed, operations)
  validateAutomationMode(values, operations)
  validateClientProfile(values)
}

/** One command tree supplies parsing, terminal help and generated references. */
export const makeCliCommand = (invoke: (invocation: Invocation) => void) => {
  const parent = Command.make(CLI_NAME, parentOptions, (values) =>
    validate(() => {
      validateAutomation(values)
      invoke({ kind: "automation", options: values, client: clientArguments(values) })
    })
  ).pipe(
    Command.withDescription(
      `Hapsland — ${supportedClientNames} review integration. Use a subcommand for human workflows, or an operation flag with one version-one JSON request on stdin for automation. Root client profile flags apply to --pilot; automation requests carry profiles in JSON. JSON operations already return structured results; --json is not a universal output switch. Run ${CLI_NAME} ${VERSION_FLAG} alone for the invoked package version; lifecycle commands may route to a retained active package. Use COMMAND --help for details.`
    ),
    Command.withExamples([
      { command: `${CLI_NAME} ${SETUP_COMMAND}`, description: "Choose agent runtimes interactively" },
      rootOperationExample("status"),
      rootOperationExample("explain"),
      rootOperationExample("install-preview"),
      rootOperationExample("login"),
      { command: `${CLI_NAME} ${VERSION_FLAG}`, description: "Identify the invoked package; no stdin or workflow runs" }
    ])
  )
  const rulesCommand = makeRulesCommand((options) => {
    invoke({ kind: "rules", options })
  })
  return parent.pipe(
    Command.withSubcommands([
      Command.make(
        "dashboard",
        {
          host: valueFlag("host").pipe(
            Flag.withDescription(
              `Loopback address (${INSPECTION_HOSTS.join(" | ")}); default ${DEFAULT_INSPECTION_HOST}`
            )
          ),
          port: valueFlag("port").pipe(
            Flag.withDescription(`Port 0–65535; default ${DEFAULT_INSPECTION_PORT} lets the OS choose a free port`)
          )
        },
        (values) =>
          validate(() => {
            const host = values.host ?? DEFAULT_INSPECTION_HOST
            const text = values.port ?? String(DEFAULT_INSPECTION_PORT)
            const port = Number(text)
            if (!/^[0-9]+$/.test(text) || !validInspectionAddress(host, port))
              throw new Error("dashboard requires a loopback host and a port from 0 to 65535")
            invoke({ kind: "dashboard", host, port })
          })
      ).pipe(
        Command.withShortDescription("Serve the local inspection dashboard in the foreground"),
        Command.withDescription(
          "Serve retained local inspection at a private URL printed to stdout. Runs in the foreground until interrupted; does not enable recording. Use a loopback address. See docs/status.md for recording and dashboard controls."
        ),
        Command.withExamples([
          {
            command: `${CLI_NAME} dashboard --host ${DEFAULT_INSPECTION_HOST} --port ${DEFAULT_INSPECTION_PORT}`,
            description: "Print a private dashboard URL on an OS-selected port"
          }
        ])
      ),
      ...clientCommandDefinitions.map((definition) => {
        const command = definition.name
        return Command.make(
          command,
          {
            ...profiles,
            ...(definition.options === "setup"
              ? { [NEW_KEY_OPTION]: automationFlags[NEW_KEY_OPTION], ...unattendedSetupOptions }
              : {}),
            client: Argument.Literals("client", SUPPORTED_CLIENTS).pipe(
              Argument.optional,
              Argument.withDescription(`${SUPPORTED_CLIENTS.join(" | ")}. ${definition.clientDescription}`)
            ),
            ...(definition.options !== "profile"
              ? {
                  target: valueFlag("target").pipe(
                    Flag.withDescription(
                      "Explicit Hapsland executable; overrides active package routing; cannot combine with update acquisition selectors"
                    )
                  )
                }
              : {}),
            ...(definition.options === "update"
              ? {
                  tarball: valueFlag("tarball").pipe(
                    Flag.withDescription("Local package archive; cannot combine with --target, --channel or --version")
                  ),
                  channel: Flag.Literals("channel", UPDATE_CHANNELS).pipe(
                    Flag.atMost(1),
                    Flag.map((values) => values[0]),
                    Flag.withDescription(
                      `Registry channel; default ${DEFAULT_UPDATE_CHANNEL}; may combine with release --version`
                    )
                  ),
                  version: valueFlag("version").pipe(
                    Flag.withDescription(
                      "Release version to install; distinct from root --version, which reports this package"
                    )
                  )
                }
              : {})
          },
          (values) =>
            Effect.gen(function* () {
              yield* validate(() => {
                const client = clientArguments(values)
                if (command === "update") {
                  const releases = ["--target", "--tarball", "--channel", "--version"].filter((name) =>
                    client.flags.has(name)
                  )
                  if (releases.length > 1 && (client.flags.has("--target") || client.flags.has("--tarball")))
                    throw new Error("--target and --tarball cannot be combined with other release options.")
                }
                invoke({ kind: "lifecycle", command, client })
              })
            })
        ).pipe(
          Command.withShortDescription(definition.summary),
          Command.withDescription(definition.description),
          Command.withExamples([
            ...definition.examples.map((arguments_) => ({
              command: `${CLI_NAME} ${command}${arguments_ === "" ? "" : ` ${arguments_}`}`,
              description: definition.summary
            })),
            ...(definition.options === "setup"
              ? unattendedSetupTemplates().map((example) => ({
                  command: example,
                  description: "Explicit unattended setup; application is authorized separately"
                }))
              : [])
          ])
        )
      }),
      rulesCommand
    ])
  )
}

export const cliCommandReference = () => {
  const root = makeCliCommand(() => {})
  return {
    description: root.description,
    examples: root.examples,
    commands: root.subcommands.flatMap((group) =>
      group.commands.map((command) => ({
        name: command.name,
        summary: command.shortDescription ?? command.description ?? "",
        description: command.description ?? "",
        examples: command.examples
      }))
    )
  }
}

const cliFailureMessage = (failure: CliError.CliError): string => {
  if (failure._tag === "ShowHelp") return CliOutput.defaultFormatter({ colors: false }).formatErrors(failure.errors)
  if (failure._tag === "UserError") return failure.userMessage ?? "Invalid CLI arguments"
  return String(failure)
}

/** Parse before any workflow, stdin read, package dispatch or installation mutation. */
export const parseInvocation = async (args: ReadonlyArray<string>): Promise<Invocation | undefined> => {
  if (args.length === 1 && args[0] === VERSION_FLAG) {
    process.stdout.write(PACKAGE_VERSION + "\n")
    return undefined
  }
  let invocation: Invocation | undefined
  const root = makeCliCommand((parsed) => {
    invocation = parsed
  })
  const output: string[] = []
  const capturedConsole = Object.assign(Object.create(console), {
    log: (...values: unknown[]) => output.push(values.map(String).join(" "))
  })
  const result = await Effect.runPromise(
    Command.runWith(root, { version: PACKAGE_VERSION, renderErrors: false })(args).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(CliConfig.CliConfig, { builtIns: [GlobalFlag.Help] }),
      Effect.provideService(Console.Console, capturedConsole),
      Effect.result
    )
  )
  if (result._tag === "Failure") throw new Error(cliFailureMessage(result.failure))
  if (invocation === undefined && output.length > 0 && !isHookInvocation(args))
    process.stdout.write(output.join("\n") + "\n")
  return invocation
}
