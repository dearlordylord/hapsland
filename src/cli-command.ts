import { validInspectionAddress } from "./inspection/options.ts"
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
import { clientCommands, type ClientCommand } from "./onboarding/client-command.ts"
import type { SetupClient } from "./onboarding/client-selection.ts"

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
  host: Flag.Literals("host", ["claude", "codex", "pi"]).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0])
  ),
  "claude-home": valueFlag("claude-home"),
  "claude-executable": valueFlag("claude-executable"),
  "pi-home": valueFlag("pi-home"),
  "pi-executable": valueFlag("pi-executable"),
  "codex-home": valueFlag("codex-home"),
  "codex-executable": valueFlag("codex-executable")
}
const operationFlags = {
  "feedback-preview": switchFlag("feedback-preview", [], false).pipe(
    Flag.withDescription("Preview shared agent feedback with a synthetic finding; no review request")
  ),
  credentials: switchFlag("inspect-credentials", ["credentials"], false),
  status: switchFlag("status", ["inspect-consent"], false),
  explain: switchFlag("explain", ["config-explain"], false),
  doctor: switchFlag("doctor", [], false),
  "install-preview": switchFlag("install-preview", [], false),
  install: switchFlag("install", [], false),
  "update-preview": switchFlag("update-preview", [], false),
  update: switchFlag("update", [], false),
  uninstall: switchFlag("uninstall", [], false),
  "evaluation-plan": switchFlag("evaluation-plan", [], false),
  "evaluation-run": switchFlag("evaluation-run", [], false),
  "evaluation-report": switchFlag("evaluation-report", [], false),
  setup: switchFlag("setup", [], false),
  demo: switchFlag("demo", [], false),
  login: switchFlag("login", [], false),
  logout: switchFlag("logout", [], false),
  "package-identity": switchFlag("package-identity"),
  "runtime-identity": switchFlag("runtime-identity"),
  pilot: switchFlag("pilot", [], false)
}
const automationFlags = {
  ...operationFlags,
  "new-key": switchFlag("new-key", [], false).pipe(
    Flag.withDescription("Request a new saved Jev key instead of checking the existing key")
  ),
  human: switchFlag("human", ["status-human"], false),
  json: switchFlag("json", [], false),
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
    Flag.map((values) => values[0])
  ),
  review: Flag.Literals("review", SETUP_REVIEW_CHOICES).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0])
  ),
  json: switchFlag("json", [], false)
}
const setupFlag = (name: keyof typeof unattendedSetupOptions): string => `--${name}`
export const unattendedSetupTemplates = (): ReadonlyArray<string> => {
  const base = `hapsland setup codex ${setupFlag("no-input")} ${setupFlag("review")} ${SETUP_REVIEW_CHOICES[0]} ${setupFlag("credential")}`
  return [
    `${base} ${SETUP_CREDENTIAL_CHOICES[1]} ${setupFlag("json")}`,
    `${base} ${SETUP_CREDENTIAL_CHOICES[1]} ${setupFlag("apply")} ${setupFlag("json")}`,
    `${base} ${SETUP_CREDENTIAL_CHOICES[0]} ${setupFlag("save-plan")} setup-plan.json ${setupFlag("json")}`,
    `hapsland setup ${setupFlag("no-input")} ${setupFlag("apply-plan")} setup-plan.json ${setupFlag("json")}`
  ]
}
export const unattendedSetupUsage = (): string =>
  `Unattended setup requires an explicit client, ${setupFlag("review")} ${SETUP_REVIEW_CHOICES.join("|")} and ${setupFlag("credential")} ${SETUP_CREDENTIAL_CHOICES.join("|")}. Preview example: ${unattendedSetupTemplates()[0]}. Add ${setupFlag("apply")} to authorize changes, or use ${setupFlag("apply-plan")} FILE.`
export type AutomationOptions = Command.Command.Config.Infer<typeof automationFlags>
export interface ClientArguments {
  readonly host: SetupClient | undefined
  readonly flags: ReadonlyMap<string, string>
}
const rulesOptions = {
  action: Argument.Literals("action", ["list", "show", "explain", "enable", "disable", "create", "connect"]).pipe(
    Argument.optional
  ),
  id: valueFlag("id"),
  path: valueFlag("path"),
  scope: Flag.Literals("scope", ["personal", "project"]).pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0])
  ),
  json: switchFlag("json", [], false)
}
export type RulesOptions = Command.Command.Config.Infer<typeof rulesOptions>
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
  for (const name of ["new-key", "no-input", "apply", "json"]) if (values[name] === true) flags.set(`--${name}`, "true")
  return { host, flags }
}

const parentOptions = {
  ...automationFlags,
  ...profiles,
  target: valueFlag("target"),
  client: Argument.Literals("client", ["claude", "codex", "pi"]).pipe(Argument.optional)
}
type ParentOptions = Command.Command.Config.Infer<typeof parentOptions>
const activeOption = (value: unknown): boolean => value !== false && value !== undefined
const automationOptionNames = new Set(Object.keys(automationFlags))
const forbiddenPilotOption = (name: string): boolean =>
  automationOptionNames.has(name) && name !== "pilot" && name !== "new-key"
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
    throw new Error("--pilot accepts only client profile, --target and --new-key options.")
  if (values["new-key"] && !values.pilot) throw new Error("--new-key requires the setup command or --pilot.")
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

/** Parse once before any workflow, stdin read, package dispatch or installation mutation. */
export const parseInvocation = async (args: ReadonlyArray<string>): Promise<Invocation | undefined> => {
  let invocation: Invocation | undefined
  const parent = Command.make("hapsland", parentOptions, (values) =>
    validate(() => {
      validateAutomation(values)
      invocation = { kind: "automation", options: values, client: clientArguments(values) }
    })
  ).pipe(Command.withDescription("Hapsland — Claude Code and Codex review integration"))
  const rulesCommand = Command.make("rules", rulesOptions, (options) =>
    Effect.sync(() => {
      invocation = { kind: "rules", options }
    })
  ).pipe(Command.withDescription("Inspect, toggle, create or connect local JSON rules; no classifier calls"))
  const root = parent.pipe(
    Command.withSubcommands([
      Command.make("dashboard", { host: valueFlag("host"), port: valueFlag("port") }, (values) =>
        validate(() => {
          const host = values.host ?? "127.0.0.1"
          const text = values.port ?? "0"
          const port = Number(text)
          if (!/^[0-9]+$/.test(text) || !validInspectionAddress(host, port))
            throw new Error("dashboard requires a loopback host and a port from 0 to 65535")
          invocation = { kind: "dashboard", host, port }
        })
      ).pipe(Command.withDescription("Foreground local inspection dashboard; does not enable recording")),
      ...clientCommands.map((command) =>
        Command.make(
          command,
          {
            ...profiles,
            ...(command === "setup" ? { "new-key": automationFlags["new-key"], ...unattendedSetupOptions } : {}),
            client: Argument.Literals("client", ["claude", "codex", "pi"]).pipe(Argument.optional),
            ...(command === "update" || command === "setup" || command === "repair" || command === "reinstall"
              ? { target: valueFlag("target") }
              : {}),
            ...(command === "update"
              ? {
                  tarball: valueFlag("tarball"),
                  channel: Flag.Literals("channel", ["latest", "next"]).pipe(
                    Flag.atMost(1),
                    Flag.map((values) => values[0])
                  ),
                  version: valueFlag("version")
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
                invocation = { kind: "lifecycle", command, client }
              })
            })
        ).pipe(
          Command.withDescription(
            {
              setup: "Guided client setup",
              update: "Update installed integrations",
              doctor: "Check installed clients (read-only)",
              repair: "Restore missing Hapsland hooks",
              reinstall: "Replace marked Hapsland hooks; preserve user settings",
              uninstall: "Remove Hapsland from installed clients"
            }[command]
          )
        )
      ),
      rulesCommand
    ])
  )
  const output: string[] = []
  const capturedConsole = Object.assign(Object.create(console), {
    log: (...values: unknown[]) => output.push(values.map(String).join(" "))
  })
  const result = await Effect.runPromise(
    Command.runWith(root, { version: "0.1.0", renderErrors: false })(args).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(CliConfig.CliConfig, { builtIns: [GlobalFlag.Help] }),
      Effect.provideService(Console.Console, capturedConsole),
      Effect.result
    )
  )
  if (result._tag === "Failure") {
    const failure = result.failure
    throw new Error(
      failure._tag === "ShowHelp"
        ? CliOutput.defaultFormatter({ colors: false }).formatErrors(failure.errors)
        : failure._tag === "UserError"
          ? (failure.userMessage ?? "Invalid CLI arguments")
          : String(failure)
    )
  }
  if (invocation === undefined && output.length > 0 && !isHookInvocation(args))
    process.stdout.write(output.join("\n") + "\n")
  return invocation
}
