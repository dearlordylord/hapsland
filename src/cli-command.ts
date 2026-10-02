import { Argument, Command, Flag } from "effect/cli";
import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import { CliConfig, CliError, CliOutput, GlobalFlag } from "effect/cli";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ClientCommand } from "./onboarding/client-lifecycle.ts";
import type { SetupClient } from "./onboarding/client-selection.ts";

/** Transport classification only: used when help/errors short-circuit declarative handlers. */
const hookFlags = new Set([
  "--codex-hook", "--claude-hook", "--opencode-hook", "--composed-edit-hook", "--composed-before-edit-hook", "--composed-background-hook", "--composed-stop-hook", "--composed-prompt-hook",
]);
export const isHookInvocation = (args: ReadonlyArray<string>) => args.some(argument => hookFlags.has(argument.split("=")[0] ?? argument));
const validate = <A>(read: () => A) => Effect.try({ try: read, catch: cause => new CliError.UserError({ cause, userMessage: cause instanceof Error ? cause.message : "Invalid CLI arguments" }) });

const switchFlag = (name: string, aliases: ReadonlyArray<string> = [], hidden = true) => {
  let flag = Flag.Boolean(name);
  for (const alias of aliases) flag = Flag.withAlias(flag, alias);
  if (hidden) flag = Flag.withHidden(flag);
  return flag.pipe(Flag.atMost(1), Flag.map(values => values[0] ?? false));
};
const valueFlag = (name: string) => Flag.String(name).pipe(
  Flag.filter(value => value.trim() !== "" && !value.startsWith("--"), () => "a nonempty value"),
  Flag.atMost(1), Flag.map(values => values[0]),
);
const profiles = {
  host: Flag.Literals("host", ["claude", "codex"]).pipe(Flag.atMost(1), Flag.map(values => values[0])),
  "claude-home": valueFlag("claude-home"), "claude-executable": valueFlag("claude-executable"),
  "codex-home": valueFlag("codex-home"), "codex-executable": valueFlag("codex-executable"),
};
const operationFlags = {
  credentials: switchFlag("inspect-credentials", ["credentials"], false),
  status: switchFlag("status", ["inspect-consent"], false),
  explain: switchFlag("explain", ["config-explain"], false),
  doctor: switchFlag("doctor", [], false), "install-preview": switchFlag("install-preview", [], false), install: switchFlag("install", [], false),
  "update-preview": switchFlag("update-preview", [], false), update: switchFlag("update", [], false), uninstall: switchFlag("uninstall", [], false),
  "evaluation-plan": switchFlag("evaluation-plan", [], false), "evaluation-run": switchFlag("evaluation-run", [], false), "evaluation-report": switchFlag("evaluation-report", [], false),
  setup: switchFlag("setup", [], false), demo: switchFlag("demo", [], false),
  login: switchFlag("login", [], false), logout: switchFlag("logout", [], false),
  "package-identity": switchFlag("package-identity"), pilot: switchFlag("pilot", [], false),
};
const automationFlags = {
  ...operationFlags,
  human: switchFlag("human", ["status-human"], false), json: switchFlag("json", [], false),
  "credential-stdin": switchFlag("credential-stdin"), "evaluation-live": switchFlag("evaluation-live"),
  "codex-hook": switchFlag("codex-hook"), "claude-hook": switchFlag("claude-hook"), "opencode-hook": switchFlag("opencode-hook"),
  "composed-edit-hook": switchFlag("composed-edit-hook"), "composed-before-edit-hook": switchFlag("composed-before-edit-hook"),
  "composed-background-hook": switchFlag("composed-background-hook"), "composed-stop-hook": switchFlag("composed-stop-hook"),
  "composed-prompt-hook": switchFlag("composed-prompt-hook"),
  "controlled-reviewer": switchFlag("controlled-reviewer"), "controlled-writer": switchFlag("controlled-writer"),
  "review-tool-owned": valueFlag("review-tool-owned").pipe(Flag.withHidden),
  "review-tool-composed-owned": valueFlag("review-tool-composed-owned").pipe(Flag.withHidden),
  "codex-version": valueFlag("codex-version").pipe(Flag.withHidden),
  "composed-host": Flag.Literals("composed-host", ["claude-code", "codex-cli"]).pipe(Flag.atMost(1), Flag.map(values => values[0]), Flag.withHidden),
};
export type AutomationOptions = Command.Command.Config.Infer<typeof automationFlags>;
export interface ClientArguments { readonly host: SetupClient | undefined; readonly flags: ReadonlyMap<string, string> }
export type Invocation = { readonly kind: "automation"; readonly options: AutomationOptions; readonly client: ClientArguments }
  | { readonly kind: "lifecycle"; readonly command: ClientCommand; readonly client: ClientArguments };

const clientArguments = (values: {
  readonly host?: SetupClient | undefined; readonly client?: Option.Option<SetupClient>;
  readonly [name: string]: unknown;
}): ClientArguments => {
  const positional = values.client === undefined ? undefined : Option.getOrUndefined(values.client);
  if (positional !== undefined && values.host !== undefined && positional !== values.host) throw new Error("Positional client and --host disagree.");
  const flags = new Map<string, string>();
  for (const [name, value] of Object.entries(values)) if (typeof value === "string") flags.set(`--${name}`, value);
  return { host: positional ?? values.host, flags };
};

/** Parse once before any workflow, stdin read, package dispatch or installation mutation. */
export const parseInvocation = async (args: ReadonlyArray<string>): Promise<Invocation | undefined> => {
  let invocation: Invocation | undefined;
  const parent = Command.make("hapsland", { ...automationFlags, ...profiles, target: valueFlag("target"), client: Argument.Literals("client", ["claude", "codex"]).pipe(Argument.optional) }, values => validate(() => {
    const operations = (Object.keys(operationFlags) as Array<keyof typeof operationFlags>).filter(key => values[key]);
    const hooks = ["codex-hook", "claude-hook", "opencode-hook"].filter(key => values[key as keyof typeof values] === true);
    const composed = ["composed-before-edit-hook", "composed-background-hook", "composed-stop-hook", "composed-prompt-hook", "composed-edit-hook"].filter(key => values[key as keyof typeof values] === true);
    if (hooks.length > 1 || composed.length > 1 || ((hooks.length > 0 || composed.length > 0) && operations.length > 0)) throw new Error("Hook and operation options cannot be combined.");
    if (values.pilot && Object.keys(automationFlags).some(key => key !== "pilot" && values[key as keyof typeof automationFlags] !== false && values[key as keyof typeof automationFlags] !== undefined)) throw new Error("--pilot accepts only client profile and --target options.");
    if (values["credential-stdin"] && !values.login) throw new Error("--credential-stdin requires --login.");
    if (operations.length > 1) throw new Error("Operation options cannot be combined.");
    if (!values.pilot && [Option.getOrUndefined(values.client), values.host, values["claude-home"], values["claude-executable"], values["codex-home"], values["codex-executable"], values.target].some(value => value !== undefined)) throw new Error("Client options require a lifecycle command or --pilot.");
    invocation = { kind: "automation", options: values, client: clientArguments(values) };
  })).pipe(Command.withDescription("Hapsland — Claude Code and Codex review integration"));
  const root = parent.pipe(Command.withSubcommands(
    (["setup", "update", "doctor", "repair", "reinstall", "uninstall"] as const).map(command => Command.make(command, {
      ...profiles, client: Argument.Literals("client", ["claude", "codex"]).pipe(Argument.optional),
      ...(command === "update" || command === "setup" || command === "repair" || command === "reinstall" ? { target: valueFlag("target") } : {}),
      ...(command === "update" ? { tarball: valueFlag("tarball"), channel: Flag.Literals("channel", ["latest", "next"]).pipe(Flag.atMost(1), Flag.map(values => values[0])), version: valueFlag("version") } : {}),
    }, values => Effect.gen(function* () {
      yield* validate(() => {
        const client = clientArguments(values);
        if (command === "update") {
          const releases = ["--target", "--tarball", "--channel", "--version"].filter(name => client.flags.has(name));
          if (releases.length > 1 && (client.flags.has("--target") || client.flags.has("--tarball"))) throw new Error("--target and --tarball cannot be combined with other release options.");
        }
        invocation = { kind: "lifecycle", command, client };
      });
    })).pipe(Command.withDescription({ setup: "Guided client setup", update: "Update installed integrations", doctor: "Check installed clients (read-only)", repair: "Restore missing Hapsland hooks", reinstall: "Replace marked Hapsland hooks; preserve user settings", uninstall: "Remove Hapsland from installed clients" }[command])))
  ));
  const output: string[] = [];
  const capturedConsole = Object.assign(Object.create(console), { log: (...values: unknown[]) => output.push(values.map(String).join(" ")) });
  const result = await Effect.runPromise(Command.runWith(root, { version: "0.1.0", renderErrors: false })(args).pipe(
    Effect.provide(NodeServices.layer), Effect.provideService(CliConfig.CliConfig, { builtIns: [GlobalFlag.Help] }), Effect.provideService(Console.Console, capturedConsole), Effect.result,
  ));
  if (result._tag === "Failure") {
    const failure = result.failure;
    throw new Error(failure._tag === "ShowHelp" ? CliOutput.defaultFormatter({ colors: false }).formatErrors(failure.errors) : failure._tag === "UserError" ? failure.userMessage ?? "Invalid CLI arguments" : String(failure));
  }
  if (invocation === undefined && output.length > 0 && !isHookInvocation(args)) process.stdout.write(output.join("\n") + "\n");
  return invocation;
};
