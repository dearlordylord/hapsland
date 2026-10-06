import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { CLI_NAME } from "../runtime/cli-names.ts"

const ruleActions = [
  {
    name: "list",
    description: "List connected rules, activation and source files",
    flags: "list",
    example: "",
    detail: "Includes disabled rules. With no action, rules defaults to list."
  },
  {
    name: "show",
    description: "View a connected rule and its effective settings",
    flags: "id",
    example: "--id r1_inferred_case",
    detail: "Find identities with rules list. Edit the displayed JSON file to change the rule."
  },
  {
    name: "explain",
    description: "Explain activation and file/language selection",
    flags: "explain",
    example: "--id r1_inferred_case --path src/example.ts",
    detail: "Static configuration inspection only; source and required evidence are not examined."
  },
  {
    name: "check",
    description: "Review the declaration at a file and line with the classifier",
    flags: "check",
    example: "--path src/example.ts --line 12 --id r1_inferred_case",
    callsClassifier: true,
    detail:
      "Selects the enclosing supported declaration and its bounded related code, not an arbitrary line window. Sends that code and eligible enabled rules to the configured external classifier (may incur charges); returns probabilities and findings. Uses normal key discovery. No resident or agent session. Exit 0 means evaluated (including findings); exit 6 means skipped/unavailable. --json includes the actual source-bearing classifier input."
  },
  {
    name: "create",
    description: "Create and connect an editable rule",
    flags: "createId",
    example: "--id no-primitive-obsession --scope project",
    detail: "Preserves existing authored files. Edit the created JSON file to define your concern."
  },
  {
    name: "connect",
    description: "Connect an existing local JSON rule",
    flags: "changePath",
    example: "--path .hapsland/rules/custom/no-primitive-obsession.json --scope project",
    detail: "Validates the file before connecting it. A new connection enables the rule."
  },
  {
    name: "enable",
    description: "Enable a connected rule in the selected scope",
    flags: "changeId",
    example: "--id no-primitive-obsession --scope project",
    detail: "Changes configuration, preserving the authored rule file."
  },
  {
    name: "disable",
    description: "Disable a connected rule in the selected scope",
    flags: "changeId",
    example: "--id no-primitive-obsession --scope project",
    detail: "Keeps the rule connected and its authored file intact."
  }
] as const

export type RuleAction = (typeof ruleActions)[number]["name"]
export const DEFAULT_RULE_ACTION = ruleActions[0].name
export interface RulesOptions {
  readonly action: RuleAction
  readonly id: string | undefined
  readonly path: string | undefined
  readonly scope: "personal" | "project" | undefined
  readonly line?: number | undefined
  readonly json: boolean
}

const textFlag = (name: string, description: string) =>
  Flag.String(name).pipe(
    Flag.filter(
      (value) => value.trim() !== "" && !value.startsWith("--"),
      () => "a nonempty value"
    ),
    Flag.between(1, 1),
    Flag.map(([value]) => value),
    Flag.withDescription(description)
  )
const id = textFlag("id", "Connected rule identity (required); find it with rules list")
const path = textFlag("path", "Existing local JSON rule file (required)")
const scope = Flag.Literals("scope", ["personal", "project"]).pipe(
  Flag.atMost(1),
  Flag.map(([value]) => value),
  Flag.withDescription("Configuration to change; required without a terminal")
)
const json = Flag.Boolean("json").pipe(
  Flag.atMost(1),
  Flag.map((values) => values[0] ?? false),
  Flag.withDescription("Write machine-readable JSON to stdout")
)
const flags = {
  list: {},
  id: { id },
  explain: {
    id,
    path: textFlag("path", "Repository-relative source path to inspect").pipe(
      Flag.optional,
      Flag.map(Option.getOrUndefined)
    )
  },
  check: {
    path: textFlag("path", "Source file relative to the current directory (required); normal source policy applies"),
    line: Flag.Int("line").pipe(
      Flag.between(1, 1),
      Flag.map(([value]) => value ?? 0),
      Flag.filter(
        (value) => Number.isSafeInteger(value) && value > 0,
        () => "a positive one-based line"
      ),
      Flag.withDescription("One-based line inside a supported declaration (required)")
    ),
    id: textFlag("id", "Enabled connected rule identity; omit to run all eligible enabled rules").pipe(
      Flag.optional,
      Flag.map(Option.getOrUndefined)
    )
  },
  changeId: { id, scope },
  createId: { id: textFlag("id", "New rule identity (required), such as no-primitive-obsession"), scope },
  changePath: { path, scope }
}

/** The parser, terminal help and generated documentation share these commands. */
export const makeRulesCommand = (invoke: (options: RulesOptions) => void) => {
  const parent = Command.make("rules").pipe(
    Command.withSharedFlags({ json }),
    Command.withHandler((options) =>
      Effect.sync(() =>
        invoke({ action: DEFAULT_RULE_ACTION, id: undefined, path: undefined, scope: undefined, json: options.json })
      )
    )
  )
  const commands = ruleActions.map((action) =>
    Command.make(action.name, flags[action.flags], (options) =>
      Effect.gen(function* () {
        const shared = yield* parent
        invoke({
          action: action.name,
          id: "id" in options ? options.id : undefined,
          path: "path" in options ? options.path : undefined,
          line: "line" in options ? options.line : undefined,
          scope: "scope" in options ? options.scope : undefined,
          json: shared.json
        })
      })
    ).pipe(
      Command.withShortDescription(action.description),
      Command.withDescription(
        `${action.description}. ${action.detail}${action.name === "list" ? "" : "scope" in flags[action.flags] ? " Examples use no-primitive-obsession, a custom rule ID. Create or connect it before using activation commands." : " Examples use the shipped default r1_inferred_case. Use rules list to find IDs connected in this project."} ${"callsClassifier" in action ? "" : "No classifier calls."} ${"scope" in flags[action.flags] ? "Interactive changes show a preview and ask for confirmation; unattended changes require --scope." : "callsClassifier" in action ? "Explicit one-off review." : "Read-only."}`
      ),
      Command.withExamples([
        {
          command: `${CLI_NAME} rules ${action.name}${action.example === "" ? "" : ` ${action.example}`}`,
          description: action.description
        }
      ])
    )
  )
  return parent.pipe(
    Command.withDescription(
      "Inspect, manage and test local JSON rules. Only check sends code to the classifier; other actions make no classifier calls. Defaults to list. Edit connected JSON files in your editor; there is no editor or disconnect command."
    ),
    Command.withSubcommands(commands),
    Command.withExamples(commands.flatMap((command) => command.examples))
  )
}

export const ruleCommandReference = () =>
  makeRulesCommand(() => {}).subcommands.flatMap((group) =>
    group.commands.map((command) => ({
      name: command.name,
      description: command.shortDescription ?? command.description ?? "",
      examples: command.examples
    }))
  )
