import { PROJECT_CONFIGURATION_FILE } from "@hapsland/runtime-inputs/configuration/load"
import { documentationFacts } from "./documentation-facts.ts"
import { unattendedSetupTemplates, cliCommandReference } from "@hapsland/administration/cli-command"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ConfigurationDocument, CONFIGURATION_VERSION } from "@hapsland/runtime-inputs/configuration/types"
import { RuleDefinition, RULE_SCHEMA_VERSION } from "@hapsland/review-definition/rules/schema"
import { ruleCommandReference } from "@hapsland/administration/rules/cli-definition"
import { rootOperationReference } from "@hapsland/administration/cli-help"
import { workerCommandReference, VERSION_FLAG } from "@hapsland/runtime-environment/runtime/cli-information"
import { CLI_NAME } from "@hapsland/runtime-environment/runtime/cli-names"

type JsonObject = Record<string, unknown>
type GeneratedTarget = { readonly path: string; readonly content?: string; readonly problem?: string }

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
const README_MARKERS = ["<!-- configuration-readme:start -->", "<!-- configuration-readme:end -->"] as const
const GUIDE_MARKERS = ["<!-- configuration-guide:start -->", "<!-- configuration-guide:end -->"] as const
const RULE_GUIDE_MARKERS = ["<!-- rule-guide:start -->", "<!-- rule-guide:end -->"] as const

const configurationExample = JSON.stringify({ version: CONFIGURATION_VERSION, includes: ["src/**"] }, null, 2)

const ruleExample = JSON.stringify(
  {
    version: RULE_SCHEMA_VERSION,
    id: "namespace/meaningful-combinations",
    question: "Does the artifact make an invalid state representable?",
    criteria: {
      false: "Every representable state has a domain meaning.",
      true: "The artifact admits a state with no domain meaning."
    },
    message: "Review this declaration's representable states.",
    inputs: [
      {
        languages: ["typescript", "rust", "bend", "go"],
        kind: "type",
        requires: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]
      }
    ]
  },
  null,
  2
)

const objectValue = (value: unknown): JsonObject | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined

const toJsonSchema = (schema: Schema.Constraint): JsonObject => {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" })
  const definitions = document.definitions as JsonObject
  return {
    $schema: JSON_SCHEMA_DIALECT,
    ...document.schema,
    ...(Object.keys(definitions).length === 0 ? {} : { $defs: definitions })
  }
}

/** Add JSON Schema constraints that also have semantic runtime checks. */
export const renderRuleSchema = (): JsonObject => {
  const schema = structuredClone(toJsonSchema(RuleDefinition))
  const definitions = objectValue(schema.$defs)
  const rule = objectValue(definitions?.RuleDocument) ?? schema
  const inputs = objectValue(objectValue(rule.properties)?.inputs)
  if (inputs === undefined) throw new Error("unexpected rule Effect schema shape")
  inputs.minItems = 1
  const items = objectValue(inputs.items)
  const branches = Array.isArray(items?.anyOf) ? items.anyOf : []
  for (const branch of branches) {
    const properties = objectValue(objectValue(branch)?.properties)
    const languages = objectValue(properties?.languages)
    const requires = objectValue(properties?.requires)
    if (languages !== undefined) {
      languages.minItems = 1
      languages.uniqueItems = true
    }
    if (requires !== undefined) requires.uniqueItems = true
  }
  return schema
}

const getDefinitions = (schema: JsonObject): JsonObject =>
  objectValue(schema.$defs) ?? objectValue(schema.definitions) ?? {}

const dereference = (
  schema: JsonObject,
  definitions: JsonObject,
  seen: ReadonlySet<string> = new Set()
): JsonObject => {
  if (typeof schema.$ref !== "string") return schema
  const name = schema.$ref.split("/").at(-1)?.replaceAll("~1", "/").replaceAll("~0", "~")
  if (name === undefined || seen.has(name)) return schema
  const target = objectValue(definitions[name])
  if (target === undefined) return schema
  const nextSeen = new Set(seen).add(name)
  return { ...dereference(target, definitions, nextSeen), ...schema }
}

const objectBranches = (schema: JsonObject, definitions: JsonObject): ReadonlyArray<JsonObject> => {
  const resolved = dereference(schema, definitions)
  const branches = Array.isArray(resolved.anyOf) ? resolved.anyOf : Array.isArray(resolved.oneOf) ? resolved.oneOf : []
  return branches
    .map(objectValue)
    .filter((branch): branch is JsonObject => branch !== undefined)
    .map((branch) => dereference(branch, definitions))
    .filter((branch) => branch.type === "object")
}

const typeForBranch = (schema: JsonObject, definitions: JsonObject): string => {
  const branch = dereference(schema, definitions)
  if (branch.type === "object") {
    const kind = objectValue(objectValue(branch.properties)?.artifactKind)?.const
    if (typeof kind === "string") return `${kind} target`
    const required = Array.isArray(branch.required)
      ? branch.required.filter((key): key is string => typeof key === "string")
      : []
    return required.length === 0 ? "object" : `object with ${required.map((key) => `\`${key}\``).join(" and ")}`
  }
  return typeSummary(branch, definitions)
}

const typeSummary = (schema: JsonObject, definitions: JsonObject): string => {
  const resolved = dereference(schema, definitions)
  const branches = Array.isArray(resolved.anyOf)
    ? resolved.anyOf
    : Array.isArray(resolved.oneOf)
      ? resolved.oneOf
      : undefined
  if (branches !== undefined) {
    const names = [
      ...new Set(
        branches
          .map(objectValue)
          .filter((branch): branch is JsonObject => branch !== undefined)
          .map((branch) => typeForBranch(branch, definitions))
      )
    ]
    return names.join(" or ")
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length === 1) {
    return `fixed value ${JSON.stringify(resolved.enum[0])}`
  }
  if (Array.isArray(resolved.enum)) return resolved.enum.map((value) => JSON.stringify(value)).join(" or ")
  if (Object.hasOwn(resolved, "const")) return `fixed value ${JSON.stringify(resolved.const)}`
  if (resolved.type === "array") {
    const itemSchema = objectValue(resolved.items) ?? {}
    const constraints = [
      typeof resolved.minItems === "number" && resolved.minItems > 0
        ? `at least ${resolved.minItems} item${resolved.minItems === 1 ? "" : "s"}`
        : undefined,
      typeof resolved.maxItems === "number"
        ? `at most ${resolved.maxItems} item${resolved.maxItems === 1 ? "" : "s"}`
        : undefined
    ].filter((constraint): constraint is string => constraint !== undefined)
    return `array of ${typeSummary(itemSchema, definitions)} (${constraints.length === 0 ? "may be empty" : constraints.join(", ")})`
  }
  if (resolved.type === "object") {
    const additional = objectValue(resolved.additionalProperties)
    if (additional === undefined || resolved.additionalProperties === false) return "object"
    const constraints = [
      typeof resolved.minProperties === "number" && resolved.minProperties > 0
        ? `at least ${resolved.minProperties} entr${resolved.minProperties === 1 ? "y" : "ies"}`
        : undefined,
      typeof resolved.maxProperties === "number"
        ? `at most ${resolved.maxProperties} entr${resolved.maxProperties === 1 ? "y" : "ies"}`
        : undefined
    ].filter((constraint): constraint is string => constraint !== undefined)
    return `map of ${typeSummary(additional, definitions)} (${constraints.length === 0 ? "may be empty" : constraints.join(", ")})`
  }

  let type = resolved.type === "integer" ? "integer" : resolved.type
  if (typeof type !== "string") type = "JSON value"
  if (type === "string" && resolved.minLength === 1) type = "non-empty string"
  if (typeof resolved.minimum === "number" && typeof resolved.maximum === "number") {
    type += ` (${resolved.minimum}–${resolved.maximum})`
  } else if (typeof resolved.minimum === "number") {
    type += ` (at least ${resolved.minimum})`
  } else if (typeof resolved.maximum === "number") {
    type += ` (at most ${resolved.maximum})`
  }
  if (typeof resolved.pattern === "string") type += " matching a pattern"
  return type
}

type Field = {
  readonly path: string
  readonly schema: JsonObject
  readonly required: boolean
  readonly requiredWhen?: string
  readonly collectionEntry?: "array" | "map"
}

const fieldsOf = (root: JsonObject): ReadonlyArray<Field> => {
  const definitions = getDefinitions(root)
  const fields: Array<Field> = []

  const visit = (
    schema: JsonObject,
    path: string,
    required: boolean,
    requiredWhen?: string,
    collectionEntry?: "array" | "map"
  ): void => {
    fields.push({
      path,
      schema,
      required,
      ...(requiredWhen === undefined ? {} : { requiredWhen }),
      ...(collectionEntry === undefined ? {} : { collectionEntry })
    })
    const resolved = dereference(schema, definitions)
    const properties = objectValue(resolved.properties)
    if (properties !== undefined) {
      const requiredKeys = new Set(
        Array.isArray(resolved.required)
          ? resolved.required.filter((key): key is string => typeof key === "string")
          : []
      )
      for (const [key, child] of Object.entries(properties)) {
        const childSchema = objectValue(child)
        if (childSchema !== undefined)
          visit(childSchema, path.length === 0 ? key : `${path}.${key}`, requiredKeys.has(key))
      }
    }

    if (resolved.type === "array") {
      const item = objectValue(resolved.items)
      if (item !== undefined) visit(item, `${path}[]`, true, undefined, "array")
    }

    const additional = objectValue(resolved.additionalProperties)
    if (resolved.type === "object" && properties === undefined && additional !== undefined) {
      visit(additional, `${path}.<key>`, true, undefined, "map")
    }

    for (const branch of objectBranches(schema, definitions)) {
      const branchProperties = objectValue(branch.properties)
      if (branchProperties === undefined) continue
      const branchRequired = new Set(
        Array.isArray(branch.required) ? branch.required.filter((key): key is string => typeof key === "string") : []
      )
      const providerSchema = objectValue(branchProperties.provider)
      const provider =
        providerSchema?.const ??
        (Array.isArray(providerSchema?.enum) && providerSchema.enum.length === 1 ? providerSchema.enum[0] : undefined)
      const branchCondition =
        typeof provider === "string"
          ? `provider = ${JSON.stringify(provider)}`
          : branchRequired.size === 1
            ? `${[...branchRequired][0]} form`
            : "object form"
      for (const [key, child] of Object.entries(branchProperties)) {
        const childSchema = objectValue(child)
        if (childSchema !== undefined) {
          visit(childSchema, `${path}.${key}`, branchRequired.has(key), branchCondition)
        }
      }
    }
  }

  visit(root, "", true)
  return fields.slice(1)
}

const markdownCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ")

const fullCliReference = (): string => {
  const reference = cliCommandReference()
  return [
    "## Command reference",
    "",
    "This reference is generated from the command and flag definitions that supply terminal help. Use `hapsland COMMAND --help` for flags, client choices and examples.",
    "",
    `Run \`${CLI_NAME} ${VERSION_FLAG}\` alone to identify the invoked package version. This does not read stdin or start a workflow. Lifecycle commands may route to a retained active package; the version is not a freshness or compatibility check.`,
    "",
    "### Human commands",
    "",
    "| Command | Purpose |",
    "|---|---|",
    ...reference.commands.map((command) => `| \`${command.name}\` | ${markdownCell(command.summary)} |`),
    "",
    ...reference.commands.flatMap((command) => [
      `#### ${CLI_NAME} ${command.name}`,
      "",
      command.description,
      "",
      "```sh",
      ...command.examples.map((example) => example.command),
      "```",
      ""
    ]),
    "### Flag-based operations",
    "",
    "These retain their version-one input/output contracts. Operations described as JSON requests read one request from stdin; a subcommand is not required. `--json` selects credential login/logout output, while JSON-stdin operations already return structured output. `--human` applies to status. Check exit status before parsing results.",
    "",
    "| Operation | Aliases | Input and behavior |",
    "|---|---|---|",
    ...rootOperationReference().map(
      (operation) =>
        `| \`${operation.name}\` | ${operation.aliases.map((alias) => `\`--${alias}\``).join(", ") || "—"} | ${markdownCell(operation.description)} |`
    ),
    "",
    "```sh",
    ...reference.examples.map((example) => example.command),
    "```",
    "",
    "### Package and worker entry points",
    "",
    ...workerCommandReference().flatMap((command) => [
      `#### ${command.name}`,
      "",
      command.description,
      "",
      `Usage: \`${command.name} ${command.arguments}\`. Use \`--help\`/\`-h\` or \`${VERSION_FLAG}\` alone for information before any stdin or state handling.`,
      ""
    ])
  ].join("\n")
}

const markdownTable = (schema: JsonObject): string => {
  const definitions = getDefinitions(schema)
  const byPath = new Map<
    string,
    { readonly field: Field; readonly schemas: JsonObject[]; readonly conditions: Set<string> }
  >()
  for (const field of fieldsOf(schema)) {
    const existing = byPath.get(field.path)
    if (existing === undefined) {
      byPath.set(field.path, {
        field,
        schemas: [field.schema],
        conditions: new Set(field.requiredWhen === undefined ? [] : [field.requiredWhen])
      })
    } else {
      existing.schemas.push(field.schema)
      if (field.requiredWhen !== undefined) existing.conditions.add(field.requiredWhen)
    }
  }
  const rows = [...byPath.values()].map(({ field: entry, schemas, conditions }) => {
    const { path, required, collectionEntry } = entry
    const field = schemas.length === 1 ? entry.schema : { ...entry.schema, anyOf: schemas }
    const resolved = dereference(field, definitions)
    const description =
      typeof field.description === "string"
        ? field.description
        : typeof resolved.description === "string"
          ? resolved.description
          : "—"
    const defaultValue = Object.hasOwn(resolved, "default") ? JSON.stringify(resolved.default) : "—"
    const presence =
      collectionEntry === "array"
        ? "Array item (array may be empty)"
        : collectionEntry === "map"
          ? "Map value (map may be empty)"
          : conditions.size === 0
            ? required
              ? "Required"
              : "Optional"
            : required
              ? `Required (${[...conditions].join(" or ")})`
              : "Optional"
    return `| \`${markdownCell(path)}\` | ${markdownCell(typeSummary(field, definitions))} | ${markdownCell(presence)} | ${markdownCell(defaultValue)} | ${markdownCell(description)} |`
  })
  return ["| Field | Type and bounds | Presence | Default | Description |", "|---|---|---|---|---|", ...rows].join("\n")
}

const shortIntroduction = (): string =>
  [
    "## Configuration",
    "",
    "Configure file selection, related-code access, privacy exclusions, and per-rule application through personal and project JSONC settings. With no file settings, all otherwise eligible files are selected; user exclusions can turn review off.",
    "",
    "A small project configuration:",
    "",
    "```jsonc",
    configurationExample,
    "```",
    "",
    "See the [complete configuration guide](./docs/configuration.md) for fields, precedence, rule selection, and when saved changes apply."
  ].join("\n")

const fullConfigurationReference = (schema: JsonObject): string =>
  [
    "## Configuration example",
    "",
    "```jsonc",
    configurationExample,
    "```",
    "",
    "## Configuration fields",
    "",
    markdownTable(schema)
  ].join("\n")

export const renderConfigurationArtifacts = (schema: Schema.Constraint) => {
  const jsonSchema = toJsonSchema(schema)
  return { jsonSchema, documentation: fullConfigurationReference(jsonSchema) }
}

export const renderInspectionArtifacts = (schema: Schema.Constraint) => {
  const jsonSchema = toJsonSchema(schema)
  const definitions = getDefinitions(jsonSchema)
  const properties = objectValue(jsonSchema.properties) ?? {}
  const matches = Object.entries(properties).filter(
    ([, value]) => objectValue(value)?.$ref === "#/$defs/InspectionRecordingEnabled"
  )
  if (matches.length !== 1) throw new Error("expected one inspection recording field on the configuration schema")
  const [fieldName, value] = matches[0]!
  const field = dereference(objectValue(value)!, definitions)
  const example = Array.isArray(field.examples) ? field.examples[0] : undefined
  if (example !== true || field.default !== false)
    throw new Error("inspection opt-in must declare a true example and false default")
  const template = JSON.stringify({ version: CONFIGURATION_VERSION, [fieldName]: example }, null, 2)
  const notice = (href: string) =>
    `Recording is off by default: add \`"${fieldName}": true\` into your project's \`${PROJECT_CONFIGURATION_FILE}\` using the [configuration template](${href}), then make a new edit. Neither dashboard enables recording or backfills old edits; retained history can remain visible after recording is turned off.`
  const documentation = [
    "**Both dashboards need recorded history.** Recording is disabled by default.",
    `Merge this [generated configuration template](examples/session-inspection.jsonc) into the repository-root \`${PROJECT_CONFIGURATION_FILE}\`, preserving existing rules and scope:`,
    "",
    "```jsonc",
    template,
    "```",
    "",
    "Then make a new edit through an installed Hapsland integration. The setting applies on the next edit; enabling it does not backfill earlier edits. A fresh journal stays empty until new events are recorded. Opening either dashboard does not enable recording. Existing retained history can still be shown after recording is disabled. This history contains captured source and review messages; source-free analytics does not enable it.",
    `A user default can also enable recording, but an explicit project \`${fieldName}: false\` overrides it.`
  ].join("\n")
  return {
    template: `// Generated by npm run config:generate from the configuration schema.\n// Merge into existing ${PROJECT_CONFIGURATION_FILE}; preserve rules, file scope, and other settings.\n${template}\n`,
    documentation,
    notice
  }
}

const fullRuleReference = (schema: JsonObject): string =>
  [
    "## Rule commands",
    "",
    "The command definitions generate this reference and terminal help. `hapsland rules` defaults to `list`; use `hapsland rules <command> --help` for command-specific flags and examples.",
    "",
    "| Command | Purpose |",
    "|---|---|",
    ...ruleCommandReference().map((command) => `| \`${command.name}\` | ${markdownCell(command.description)} |`),
    "",
    "```sh",
    ...ruleCommandReference().flatMap((command) => command.examples.map((example) => example.command)),
    "```",
    "",
    "## Rule example",
    "",
    "```jsonc",
    ruleExample,
    "```",
    "",
    "## Rule fields",
    "",
    markdownTable(schema),
    "",
    "Inputs pair each declared language with a kind and required capabilities. Type inputs support TypeScript, Rust and Bend; function inputs currently support TypeScript.",
    "Schema inputs remain distinct declarations and produce an explicit unsupported-input diagnostic when selected. Concrete values are not review inputs.",
    "Hapsland dispatches only when the selected language/kind pair and required evidence match. File and language restrictions belong in configuration rule references."
  ].join("\n")

const replaceMarkedSection = (
  source: string,
  [startMarker, endMarker]: readonly [string, string],
  generated: string
): string => {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (
    start < 0 ||
    end < 0 ||
    end < start ||
    source.indexOf(startMarker, start + startMarker.length) >= 0 ||
    source.indexOf(endMarker, end + endMarker.length) >= 0
  ) {
    throw new Error("expected exactly one ordered start/end marker pair")
  }
  return `${source.slice(0, start + startMarker.length)}\n\n${generated.trimEnd()}\n\n${source.slice(end)}`
}

const readMarkdown = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8")
  } catch (cause) {
    if (objectValue(cause)?.code === "ENOENT") return undefined
    throw cause
  }
}

const makeTargets = async (root: string): Promise<ReadonlyArray<GeneratedTarget>> => {
  const configurationArtifacts = renderConfigurationArtifacts(ConfigurationDocument)
  const configurationSchema = configurationArtifacts.jsonSchema
  const ruleSchema = renderRuleSchema()
  const inspection = renderInspectionArtifacts(ConfigurationDocument)
  const readmePath = resolve(root, "README.md")
  const guidePath = resolve(root, "docs/configuration.md")
  const rulesPath = resolve(root, "docs/rules.md")
  const [readme, guide, rules] = await Promise.all([
    readMarkdown(readmePath),
    readMarkdown(guidePath),
    readMarkdown(rulesPath)
  ])
  const targets: Array<GeneratedTarget> = []
  const installationPath = resolve(root, "docs/installation-workflows.md")
  const installation = await readMarkdown(installationPath)
  if (installation === undefined) targets.push({ path: installationPath, problem: "source document is missing" })
  else {
    try {
      targets.push({
        path: installationPath,
        content: replaceMarkedSection(
          replaceMarkedSection(
            replaceMarkedSection(
              installation,
              ["<!-- inspection-recording:start -->", "<!-- inspection-recording:end -->"],
              inspection.notice("examples/session-inspection.jsonc")
            ),
            ["<!-- cli-reference:start -->", "<!-- cli-reference:end -->"],
            fullCliReference()
          ),
          ["<!-- unattended-setup-commands:start -->", "<!-- unattended-setup-commands:end -->"],
          "```sh\n" + unattendedSetupTemplates().join("\n") + "\n```"
        )
      })
    } catch {
      targets.push({
        path: installationPath,
        problem: "expected exactly one ordered marker pair for each generated installation section"
      })
    }
  }

  if (readme === undefined) {
    targets.push({ path: readmePath, problem: "source document is missing" })
  } else {
    try {
      targets.push({ path: readmePath, content: replaceMarkedSection(readme, README_MARKERS, shortIntroduction()) })
    } catch {
      targets.push({ path: readmePath, problem: "expected exactly one ordered README marker pair" })
    }
  }

  if (guide === undefined) {
    targets.push({ path: guidePath, problem: "source document is missing" })
  } else {
    try {
      targets.push({
        path: guidePath,
        content: replaceMarkedSection(guide, GUIDE_MARKERS, configurationArtifacts.documentation)
      })
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "invalid generated-section markers"
      targets.push({ path: guidePath, problem: reason })
    }
  }

  if (rules === undefined) {
    targets.push({ path: rulesPath, problem: "source document is missing" })
  } else {
    try {
      targets.push({
        path: rulesPath,
        content: replaceMarkedSection(rules, RULE_GUIDE_MARKERS, fullRuleReference(ruleSchema))
      })
    } catch (cause) {
      targets.push({
        path: rulesPath,
        problem: cause instanceof Error ? cause.message : "invalid generated-section markers"
      })
    }
  }

  const statusPath = resolve(root, "docs/status.md")
  const status = await readMarkdown(statusPath)
  if (status === undefined) targets.push({ path: statusPath, problem: "source document is missing" })
  else {
    try {
      targets.push({
        path: statusPath,
        content: replaceMarkedSection(
          status,
          ["<!-- inspection-recording:start -->", "<!-- inspection-recording:end -->"],
          inspection.documentation
        )
      })
    } catch {
      targets.push({ path: statusPath, problem: "expected exactly one ordered inspection recording marker pair" })
    }
  }
  targets.push({ path: resolve(root, "docs/examples/session-inspection.jsonc"), content: inspection.template })

  targets.push(
    {
      path: resolve(root, "schemas/review-config-v1.schema.json"),
      content: `${JSON.stringify(configurationSchema, null, 2)}\n`
    },
    { path: resolve(root, "schemas/review-rule-v1.schema.json"), content: `${JSON.stringify(ruleSchema, null, 2)}\n` }
  )
  for (const fact of documentationFacts()) {
    const path = resolve(root, fact.path)
    const existing = targets.find((target) => target.path === path)
    if (existing?.problem !== undefined) continue
    const source = existing?.content ?? (await readMarkdown(path))
    let target: GeneratedTarget
    try {
      if (source === undefined) throw new Error("source document is missing")
      target = {
        path,
        content: replaceMarkedSection(source, [`<!-- ${fact.name}:start -->`, `<!-- ${fact.name}:end -->`], fact.text)
      }
    } catch (cause) {
      target = { path, problem: cause instanceof Error ? cause.message : "invalid generated-section markers" }
    }
    if (existing === undefined) targets.push(target)
    else targets[targets.indexOf(existing)] = target
  }
  const brandAssets = await Promise.all(
    [
      ["inspectionFavicon", "favicon.svg"],
      ["inspectionProductIcon", "product-icon.svg"]
    ].map(async ([name, file]) => {
      const original = await readFile(new URL(`../assets/brand/${file}`, import.meta.url), "utf8")
      // Derive the dark-background icon from the canonical artwork without duplicating its geometry.
      const svg =
        file === "product-icon.svg"
          ? original.replaceAll("#151719", "#dce3eb").replace("black skeletal robot hand", "silver skeletal robot hand")
          : original
      return `export const ${name} =\n  "data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"`
    })
  )
  targets.push({
    path: resolve(root, "packages/administration/src/inspection/brand.ts"),
    content: ["// Generated by npm run config:generate from assets/brand.", ...brandAssets, ""].join("\n")
  })
  return targets
}

const readCurrentTargets = (targets: ReadonlyArray<GeneratedTarget>) =>
  Effect.tryPromise({
    try: async () =>
      Promise.all(targets.map(async (target) => ({ ...target, current: await readMarkdown(target.path) }))),
    catch: () => new Error("could not read generated configuration artifacts")
  })

const generate = (root: string, mode: "--update" | "--check") =>
  Effect.gen(function* () {
    const targets = yield* Effect.tryPromise({
      try: () => makeTargets(root),
      catch: () => new Error("could not prepare generated configuration artifacts")
    })
    const currentTargets = yield* readCurrentTargets(targets)
    const problems = currentTargets.filter(
      (target) => target.problem !== undefined || target.content === undefined || target.current !== target.content
    )

    if (mode === "--check") {
      for (const target of problems) {
        const state = target.problem !== undefined ? "invalid" : target.current === undefined ? "missing" : "stale"
        console.log(
          `${state}: ${relative(root, target.path)}${target.problem === undefined ? "" : ` (${target.problem})`}`
        )
      }
      if (problems.length === 0) console.log("configuration documentation and schemas are current")
      return problems.length === 0 ? 0 : 1
    }

    const invalid = currentTargets.filter((target) => target.problem !== undefined || target.content === undefined)
    if (invalid.length > 0) {
      for (const target of invalid) {
        console.error(`cannot update ${relative(root, target.path)}: ${target.problem ?? "no generated content"}`)
      }
      return 1
    }

    yield* Effect.tryPromise({
      try: async () => {
        for (const target of currentTargets) {
          if (target.current === target.content || target.content === undefined) continue
          await mkdir(dirname(target.path), { recursive: true })
          await writeFile(target.path, target.content, "utf8")
        }
      },
      catch: () => new Error("could not write generated configuration artifacts")
    })
    console.log("updated configuration documentation and schemas")
    return 0
  })

const parseArguments = (arguments_: ReadonlyArray<string>) => {
  let mode: "--update" | "--check" | undefined
  let root = process.cwd()
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === "--update" || argument === "--check") {
      if (mode !== undefined) throw new Error("choose either --update or --check")
      mode = argument
    } else if (argument === "--root") {
      const value = arguments_[index + 1]
      if (value === undefined) throw new Error("--root requires a directory")
      root = resolve(value)
      index += 1
    } else {
      throw new Error("usage: generate-configuration.ts --update|--check [--root directory]")
    }
  }
  if (mode === undefined) throw new Error("usage: generate-configuration.ts --update|--check [--root directory]")
  return { mode, root }
}

const run = async (): Promise<void> => {
  try {
    const { mode, root } = parseArguments(process.argv.slice(2))
    process.exitCode = await Effect.runPromise(generate(root, mode))
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : "configuration generation failed")
    process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void run()
