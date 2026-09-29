import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigurationDocument, CONFIGURATION_VERSION } from "../src/configuration/types.ts";
import { RulePack, RULE_PACK_SCHEMA_VERSION } from "../src/rules/schema.ts";
import { V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "../src/rules/v2-targets.ts";

type JsonObject = Record<string, unknown>;
type GeneratedTarget = {
  readonly path: string;
  readonly content?: string;
  readonly problem?: string;
};

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
const README_MARKERS = ["<!-- configuration-readme:start -->", "<!-- configuration-readme:end -->"] as const;
const GUIDE_MARKERS = ["<!-- configuration-guide:start -->", "<!-- configuration-guide:end -->"] as const;
const PACK_GUIDE_MARKERS = ["<!-- rule-pack-guide:start -->", "<!-- rule-pack-guide:end -->"] as const;

const configurationExample = JSON.stringify({
  version: CONFIGURATION_VERSION,
  includes: ["src/**"],
}, null, 2);

const rulePackExample = JSON.stringify({
  schemaVersion: 2,
  id: "team",
  contentVersion: "1.0.0",
  rules: [{
    id: "meaningful-combinations",
    question: "Does the artifact make an invalid state representable?",
    criteria: {
      false: "Every representable state has a domain meaning.",
      true: "The artifact admits a state with no domain meaning.",
    },
    message: "Review this declaration's representable states.",
    applicability: { includes: ["src/**"] },
    reviewTargets: [{
      artifactKind: "typeShape",
      inputContract: V2_TYPE_CONTRACT,
      capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"],
    }],
  }],
}, null, 2);

const objectValue = (value: unknown): JsonObject | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;

const toJsonSchema = (schema: Schema.Constraint): JsonObject => {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" });
  const definitions = document.definitions as JsonObject;
  return {
    $schema: JSON_SCHEMA_DIALECT,
    ...document.schema,
    ...(Object.keys(definitions).length === 0 ? {} : { $defs: definitions }),
  };
};

/** Derive shared rule fields from the v1 Effect schema, then describe the strict v2 target boundary. */
export const renderRulePackV2Schema = (): JsonObject => {
  const schema = structuredClone(toJsonSchema(RulePack));
  const definitions = objectValue(schema.$defs);
  const pack = objectValue(definitions?.RulePackDocument);
  const rule = objectValue(definitions?.RuleDefinition);
  const packProperties = objectValue(pack?.properties);
  const ruleProperties = objectValue(rule?.properties);
  const version = objectValue(packProperties?.schemaVersion);
  if (definitions === undefined || pack === undefined || rule === undefined ||
    packProperties === undefined || ruleProperties === undefined || version === undefined) {
    throw new Error("unexpected rule-pack Effect schema shape");
  }
  if (RULE_PACK_SCHEMA_VERSION !== 1) throw new Error("review v2 schema derivation after v1 changes");
  version.enum = [2];
  pack.title = "Rule pack v2";
  ruleProperties.reviewTargets = {
    type: "array",
    minItems: 1,
    maxItems: 2,
    items: {
      type: "object",
      properties: {
        artifactKind: { type: "string", enum: ["typeShape", "function"], description: "Semantic artifact kind." },
        inputContract: { type: "string", enum: [V2_TYPE_CONTRACT, V2_FUNCTION_CONTRACT],
          description: "Exact versioned review input contract; it must match the artifact kind." },
        capabilities: { type: "array", minItems: 1, uniqueItems: true,
          items: { type: "string", enum: ["root-declaration", "resolved-outbound-types",
            "selected-source-type-closure", "signature", "body", "resolved-local-calls"] },
          description: "Evidence that must be complete for this target before Jev review." },
      },
      required: ["artifactKind", "inputContract", "capabilities"],
      additionalProperties: false,
      oneOf: [
        { $ref: "#/$defs/TypeShapeReviewTarget" },
        { $ref: "#/$defs/FunctionReviewTarget" },
      ],
    },
    allOf: [
      { contains: { $ref: "#/$defs/TypeShapeReviewTarget" }, minContains: 0, maxContains: 1 },
      { contains: { $ref: "#/$defs/FunctionReviewTarget" }, minContains: 0, maxContains: 1 },
    ],
    description: "Exact review input contracts and evidence required by this rule. At most one target of each kind is allowed.",
  };
  rule.required = [...(rule.required as string[]), "reviewTargets"];
  const target = (artifactKind: string, inputContract: string, capabilities: readonly string[]): JsonObject => ({
    type: "object",
    properties: {
      artifactKind: { const: artifactKind, description: "Semantic artifact kind." },
      inputContract: { const: inputContract, description: "Exact versioned review input contract." },
      capabilities: {
        type: "array", minItems: 1, uniqueItems: true,
        items: { type: "string", enum: capabilities },
        description: "Evidence that must be complete for this target before Jev review.",
      },
    },
    required: ["artifactKind", "inputContract", "capabilities"],
    additionalProperties: false,
  });
  definitions.TypeShapeReviewTarget = target("typeShape", V2_TYPE_CONTRACT,
    ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]);
  definitions.FunctionReviewTarget = target("function", V2_FUNCTION_CONTRACT,
    ["signature", "body", "resolved-local-calls", "resolved-outbound-types"]);
  return schema;
};

const getDefinitions = (schema: JsonObject): JsonObject =>
  objectValue(schema.$defs) ?? objectValue(schema.definitions) ?? {};

const dereference = (
  schema: JsonObject,
  definitions: JsonObject,
  seen: ReadonlySet<string> = new Set(),
): JsonObject => {
  if (typeof schema.$ref !== "string") return schema;
  const name = schema.$ref.split("/").at(-1)?.replaceAll("~1", "/").replaceAll("~0", "~");
  if (name === undefined || seen.has(name)) return schema;
  const target = objectValue(definitions[name]);
  if (target === undefined) return schema;
  const nextSeen = new Set(seen).add(name);
  return { ...dereference(target, definitions, nextSeen), ...schema };
};

const objectBranches = (schema: JsonObject, definitions: JsonObject): ReadonlyArray<JsonObject> => {
  const resolved = dereference(schema, definitions);
  const branches = Array.isArray(resolved.anyOf)
    ? resolved.anyOf
    : Array.isArray(resolved.oneOf)
      ? resolved.oneOf
      : [];
  return branches
    .map(objectValue)
    .filter((branch): branch is JsonObject => branch !== undefined)
    .map((branch) => dereference(branch, definitions))
    .filter((branch) => branch.type === "object");
};

const typeForBranch = (schema: JsonObject, definitions: JsonObject): string => {
  const branch = dereference(schema, definitions);
  if (branch.type === "object") {
    const kind = objectValue(objectValue(branch.properties)?.artifactKind)?.const;
    if (typeof kind === "string") return `${kind} target`;
    const required = Array.isArray(branch.required)
      ? branch.required.filter((key): key is string => typeof key === "string")
      : [];
    return required.length === 0 ? "object" : `object with ${required.map((key) => `\`${key}\``).join(" or ")}`;
  }
  return typeSummary(branch, definitions);
};

const typeSummary = (schema: JsonObject, definitions: JsonObject): string => {
  const resolved = dereference(schema, definitions);
  const branches = Array.isArray(resolved.anyOf)
    ? resolved.anyOf
    : Array.isArray(resolved.oneOf)
      ? resolved.oneOf
      : undefined;
  if (branches !== undefined) {
    const names = [...new Set(branches
      .map(objectValue)
      .filter((branch): branch is JsonObject => branch !== undefined)
      .map((branch) => typeForBranch(branch, definitions)))];
    return names.join(" or ");
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length === 1) {
    return `fixed value ${JSON.stringify(resolved.enum[0])}`;
  }
  if (Object.hasOwn(resolved, "const")) return `fixed value ${JSON.stringify(resolved.const)}`;
  if (resolved.type === "array") {
    const itemSchema = objectValue(resolved.items) ?? {};
    const constraints = [
      typeof resolved.minItems === "number" && resolved.minItems > 0
        ? `at least ${resolved.minItems} item${resolved.minItems === 1 ? "" : "s"}`
        : undefined,
      typeof resolved.maxItems === "number"
        ? `at most ${resolved.maxItems} item${resolved.maxItems === 1 ? "" : "s"}`
        : undefined,
    ].filter((constraint): constraint is string => constraint !== undefined);
    return `array of ${typeSummary(itemSchema, definitions)} (${constraints.length === 0 ? "may be empty" : constraints.join(", ")})`;
  }
  if (resolved.type === "object") {
    const additional = objectValue(resolved.additionalProperties);
    if (additional === undefined || resolved.additionalProperties === false) return "object";
    const constraints = [
      typeof resolved.minProperties === "number" && resolved.minProperties > 0
        ? `at least ${resolved.minProperties} entr${resolved.minProperties === 1 ? "y" : "ies"}`
        : undefined,
      typeof resolved.maxProperties === "number"
        ? `at most ${resolved.maxProperties} entr${resolved.maxProperties === 1 ? "y" : "ies"}`
        : undefined,
    ].filter((constraint): constraint is string => constraint !== undefined);
    return `map of ${typeSummary(additional, definitions)} (${constraints.length === 0 ? "may be empty" : constraints.join(", ")})`;
  }

  let type = resolved.type === "integer" ? "integer" : resolved.type;
  if (typeof type !== "string") type = "JSON value";
  if (type === "string" && resolved.minLength === 1) type = "non-empty string";
  if (typeof resolved.minimum === "number" && typeof resolved.maximum === "number") {
    type += ` (${resolved.minimum}–${resolved.maximum})`;
  } else if (typeof resolved.minimum === "number") {
    type += ` (at least ${resolved.minimum})`;
  } else if (typeof resolved.maximum === "number") {
    type += ` (at most ${resolved.maximum})`;
  }
  if (typeof resolved.pattern === "string") type += " matching a pattern";
  return type;
};

type Field = {
  readonly path: string;
  readonly schema: JsonObject;
  readonly required: boolean;
  readonly requiredWhen?: string;
  readonly collectionEntry?: "array" | "map";
};

const fieldsOf = (root: JsonObject): ReadonlyArray<Field> => {
  const definitions = getDefinitions(root);
  const fields: Array<Field> = [];

  const visit = (
    schema: JsonObject,
    path: string,
    required: boolean,
    requiredWhen?: string,
    collectionEntry?: "array" | "map",
  ): void => {
    fields.push({
      path,
      schema,
      required,
      ...(requiredWhen === undefined ? {} : { requiredWhen }),
      ...(collectionEntry === undefined ? {} : { collectionEntry }),
    });
    const resolved = dereference(schema, definitions);
    const properties = objectValue(resolved.properties);
    if (properties !== undefined) {
      const requiredKeys = new Set(
        Array.isArray(resolved.required)
          ? resolved.required.filter((key): key is string => typeof key === "string")
          : [],
      );
      for (const [key, child] of Object.entries(properties)) {
        const childSchema = objectValue(child);
        if (childSchema !== undefined) visit(childSchema, path.length === 0 ? key : `${path}.${key}`, requiredKeys.has(key));
      }
    }

    if (resolved.type === "array") {
      const item = objectValue(resolved.items);
      if (item !== undefined) visit(item, `${path}[]`, true, undefined, "array");
    }

    const additional = objectValue(resolved.additionalProperties);
    if (resolved.type === "object" && properties === undefined && additional !== undefined) {
      visit(additional, `${path}.<key>`, true, undefined, "map");
    }

    for (const branch of objectBranches(schema, definitions)) {
      const branchProperties = objectValue(branch.properties);
      if (branchProperties === undefined) continue;
      const branchRequired = new Set(
        Array.isArray(branch.required)
          ? branch.required.filter((key): key is string => typeof key === "string")
          : [],
      );
      const branchCondition = branchRequired.size === 1
        ? `${[...branchRequired][0]} form`
        : "object form";
      for (const [key, child] of Object.entries(branchProperties)) {
        const childSchema = objectValue(child);
        if (childSchema !== undefined) {
          visit(childSchema, `${path}.${key}`, branchRequired.has(key), branchCondition);
        }
      }
    }
  };

  visit(root, "", true);
  return fields.slice(1);
};

const markdownCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

const markdownTable = (schema: JsonObject): string => {
  const definitions = getDefinitions(schema);
  const byPath = new Map<string, { readonly field: Field; readonly conditions: Set<string> }>();
  for (const field of fieldsOf(schema)) {
    const existing = byPath.get(field.path);
    if (existing === undefined) {
      byPath.set(field.path, {
        field,
        conditions: new Set(field.requiredWhen === undefined ? [] : [field.requiredWhen]),
      });
    } else if (field.requiredWhen !== undefined) {
      existing.conditions.add(field.requiredWhen);
    }
  }
  const rows = [...byPath.values()].map(({ field: entry, conditions }) => {
    const { path, schema: field, required, collectionEntry } = entry;
    const resolved = dereference(field, definitions);
    const description = typeof field.description === "string"
      ? field.description
      : typeof resolved.description === "string"
        ? resolved.description
        : "—";
    const defaultValue = Object.hasOwn(field, "default") ? JSON.stringify(field.default) : "—";
    const presence = collectionEntry === "array"
      ? "Array item (array may be empty)"
      : collectionEntry === "map"
        ? "Map value (map may be empty)"
        : conditions.size === 0
          ? required ? "Required" : "Optional"
          : required
            ? `Required (${[...conditions].join(" or ")})`
            : "Optional";
    return `| \`${markdownCell(path)}\` | ${markdownCell(typeSummary(field, definitions))} | ${markdownCell(presence)} | ${markdownCell(defaultValue)} | ${markdownCell(description)} |`;
  });
  return [
    "| Field | Type and bounds | Presence | Default | Description |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
};

const shortIntroduction = (): string => [
  "## Configuration",
  "",
  "Configure file selection and exclusions, local rule packs, per-rule overrides, and the credential environment-variable reference. The product accepts layered JSONC files. With no file settings, all otherwise eligible files are selected; user exclusions can turn review off.",
  "",
  "A small project configuration:",
  "",
  "```jsonc",
  configurationExample,
  "```",
  "",
  "See the [complete configuration guide](./docs/configuration.md) for field details, rule packs, precedence, and runtime behavior.",
].join("\n");

const fullConfigurationReference = (schema: JsonObject): string => [
  "## Configuration example",
  "",
  "```jsonc",
  configurationExample,
  "```",
  "",
  "## Configuration fields",
  "",
  markdownTable(schema),
].join("\n");

export const renderConfigurationArtifacts = (schema: Schema.Constraint) => {
  const jsonSchema = toJsonSchema(schema);
  return {
    jsonSchema,
    documentation: fullConfigurationReference(jsonSchema),
  };
};

const fullRulePackReference = (schema: JsonObject): string => [
  "### Rule-pack example",
  "",
  "```jsonc",
  rulePackExample,
  "```",
  "",
  "### Rule-pack fields",
  "",
  markdownTable(schema),
  "",
  "A type target uses `typeShape` with `direct-event/type-shape/v2`. Its capabilities may be `root-declaration`, `resolved-outbound-types`, and `selected-source-type-closure`.",
  "A function target uses `function` with `direct-event/function/v1`. Its capabilities may be `signature`, `body`, `resolved-local-calls`, and `resolved-outbound-types`.",
  "Each target must name at least one capability. A rule may name one target of each kind. Hapsland sends a review unit to Jev only when the required evidence is complete.",
].join("\n");

const replaceMarkedSection = (
  source: string,
  [startMarker, endMarker]: readonly [string, string],
  generated: string,
): string => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (
    start < 0 || end < 0 || end < start ||
    source.indexOf(startMarker, start + startMarker.length) >= 0 ||
    source.indexOf(endMarker, end + endMarker.length) >= 0
  ) {
    throw new Error("expected exactly one ordered start/end marker pair");
  }
  return `${source.slice(0, start + startMarker.length)}\n\n${generated.trimEnd()}\n\n${source.slice(end)}`;
};

const replaceDocumentSections = (
  source: string,
  markers: ReadonlyArray<readonly [string, string]>,
  generated: ReadonlyArray<string>,
): string => markers.reduce(
  (document, marker, index) => replaceMarkedSection(document, marker, generated[index] ?? ""),
  source,
);

const readMarkdown = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    if (objectValue(cause)?.code === "ENOENT") return undefined;
    throw cause;
  }
};

const makeTargets = async (root: string): Promise<ReadonlyArray<GeneratedTarget>> => {
  const configurationArtifacts = renderConfigurationArtifacts(ConfigurationDocument);
  const configurationSchema = configurationArtifacts.jsonSchema;
  const rulePackV1Schema = toJsonSchema(RulePack);
  const rulePackSchema = renderRulePackV2Schema();
  const readmePath = resolve(root, "README.md");
  const guidePath = resolve(root, "docs/configuration.md");
  const [readme, guide] = await Promise.all([readMarkdown(readmePath), readMarkdown(guidePath)]);
  const targets: Array<GeneratedTarget> = [];

  if (readme === undefined) {
    targets.push({ path: readmePath, problem: "source document is missing" });
  } else {
    try {
      targets.push({
        path: readmePath,
        content: replaceMarkedSection(readme, README_MARKERS, shortIntroduction()),
      });
    } catch {
      targets.push({ path: readmePath, problem: "expected exactly one ordered README marker pair" });
    }
  }

  if (guide === undefined) {
    targets.push({ path: guidePath, problem: "source document is missing" });
  } else {
    try {
      targets.push({
        path: guidePath,
        content: replaceDocumentSections(
          guide,
          [GUIDE_MARKERS, PACK_GUIDE_MARKERS],
          [configurationArtifacts.documentation, fullRulePackReference(rulePackSchema)],
        ),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "invalid generated-section markers";
      targets.push({ path: guidePath, problem: reason });
    }
  }

  targets.push(
    {
      path: resolve(root, "schemas/review-config-v1.schema.json"),
      content: `${JSON.stringify(configurationSchema, null, 2)}\n`,
    },
    {
      path: resolve(root, "schemas/review-rule-pack-v1.schema.json"),
      content: `${JSON.stringify(rulePackV1Schema, null, 2)}\n`,
    },
    {
      path: resolve(root, "schemas/review-rule-pack-v2.schema.json"),
      content: `${JSON.stringify(rulePackSchema, null, 2)}\n`,
    },
  );
  return targets;
};

const readCurrentTargets = (targets: ReadonlyArray<GeneratedTarget>) =>
  Effect.tryPromise({
    try: async () => Promise.all(targets.map(async (target) => ({
      ...target,
      current: await readMarkdown(target.path),
    }))),
    catch: () => new Error("could not read generated configuration artifacts"),
  });

const generate = (root: string, mode: "--update" | "--check") =>
  Effect.gen(function* () {
    const targets = yield* Effect.tryPromise({
      try: () => makeTargets(root),
      catch: () => new Error("could not prepare generated configuration artifacts"),
    });
    const currentTargets = yield* readCurrentTargets(targets);
    const problems = currentTargets.filter((target) =>
      target.problem !== undefined || target.content === undefined || target.current !== target.content,
    );

    if (mode === "--check") {
      for (const target of problems) {
        const state = target.problem !== undefined
          ? "invalid"
          : target.current === undefined
            ? "missing"
            : "stale";
        console.log(`${state}: ${relative(root, target.path)}${target.problem === undefined ? "" : ` (${target.problem})`}`);
      }
      if (problems.length === 0) console.log("configuration documentation and schemas are current");
      return problems.length === 0 ? 0 : 1;
    }

    const invalid = currentTargets.filter((target) => target.problem !== undefined || target.content === undefined);
    if (invalid.length > 0) {
      for (const target of invalid) {
        console.error(`cannot update ${relative(root, target.path)}: ${target.problem ?? "no generated content"}`);
      }
      return 1;
    }

    yield* Effect.tryPromise({
      try: async () => {
        for (const target of currentTargets) {
          if (target.current === target.content || target.content === undefined) continue;
          await mkdir(dirname(target.path), { recursive: true });
          await writeFile(target.path, target.content, "utf8");
        }
      },
      catch: () => new Error("could not write generated configuration artifacts"),
    });
    console.log("updated configuration documentation and schemas");
    return 0;
  });

const parseArguments = (arguments_: ReadonlyArray<string>) => {
  let mode: "--update" | "--check" | undefined;
  let root = process.cwd();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--update" || argument === "--check") {
      if (mode !== undefined) throw new Error("choose either --update or --check");
      mode = argument;
    } else if (argument === "--root") {
      const value = arguments_[index + 1];
      if (value === undefined) throw new Error("--root requires a directory");
      root = resolve(value);
      index += 1;
    } else {
      throw new Error("usage: generate-configuration.ts --update|--check [--root directory]");
    }
  }
  if (mode === undefined) throw new Error("usage: generate-configuration.ts --update|--check [--root directory]");
  return { mode, root };
};

const run = async (): Promise<void> => {
  try {
    const { mode, root } = parseArguments(process.argv.slice(2));
    process.exitCode = await Effect.runPromise(generate(root, mode));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : "configuration generation failed");
    process.exitCode = 1;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) void run();
