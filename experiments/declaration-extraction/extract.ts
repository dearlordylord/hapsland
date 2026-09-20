import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  NativeLspClient,
  pathToUri,
  relativePath,
  uriToPath,
  type DefinitionResponse,
  type LspLocation,
  type LspLocationLink,
} from "./protocol.ts";
import {
  artifactsFor,
  byteRangeFromLsp,
  exactRange,
  parseSource,
  pathFromUri,
  schemaCandidatesFor,
  schemaFrameworkPackageHint,
  type DeclarationArtifact,
  type DeclarationKind,
  type ExactRange,
  type SchemaFramework,
  type SchemaOpaqueSegment,
  type SourceFile,
} from "./source.ts";
import { parseCapOverrides, readFixture, type Fixture, type TraversalCaps } from "./fixture.ts";

type Definition = {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
};

type NavigationDefinition = Definition & {
  path: string;
  external: boolean;
  packageName?: string;
  symbolName?: string;
  declaration?: DeclarationArtifact;
};

type TraversalState = {
  started: number;
  deadline: number;
  roots: DeclarationArtifact[];
  context: DeclarationArtifact[];
  edges: Array<Record<string, unknown>>;
  queue: Array<{ artifact: DeclarationArtifact; depth: number; from: string }>;
  visited: Set<string>;
  files: Set<string>;
  externalPackages: Set<string>;
  sourceCharacters: number;
  omitted: Array<{ edgeId: string; reason: string }>;
  completenessReasons: Set<string>;
  navigationFailures: Array<{ path: string; name: string; reason: string }>;
  schemaFailures: Array<{ path: string; name: string; reason: string }>;
  schemaAnnotated: Set<string>;
  definitionCache: Map<string, DefinitionResponse>;
};

const require = createRequire(import.meta.url);
const packageVersion = (name: string) => {
  try {
    return (require(`${name}/package.json`) as { version: string }).version;
  } catch {
    return "unknown";
  }
};

const typescriptVersion = packageVersion("typescript");

const usage = () => {
  throw new Error(
    "usage: node experiments/declaration-extraction/extract.ts --fixture <dir> [--edit <name|path:line:char-line:char>] [--caps <json>]",
  );
};

const argument = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const sanitizeText = (value: unknown, workspaceRoot?: string) => {
  let text = String(value).replaceAll("\\", "/");
  const roots = [workspaceRoot, process.cwd()].filter((root): root is string => Boolean(root));
  for (const root of roots) text = text.replaceAll(root.replaceAll("\\", "/"), "<fixture-root>");
  text = text.replace(/file:\/\/\/[^\s"']+/g, "fixture://external");
  text = text.replace(/(?:^|\s)(?:\/tmp|\/private\/tmp)\/[^\s"']+/g, "$1<temp-path>");
  text = text.replace(/(?:^|\s)\/(?:[^\s"']+\/)+[^\s"']+/g, "$1<absolute-path>");
  text = text.replace(/(?:^|\s)[A-Za-z]:\/[^\s"']+/g, "$1<absolute-path>");
  return text;
};

const stableDefinitionUri = (definition: NavigationDefinition) => {
  if (definition.external) {
    const packageName = definition.packageName ?? "package";
    return `fixture://external/${encodeURIComponent(packageName)}`;
  }
  return `fixture://${definition.path.replace(/^\.\.\//, "external/")}`;
};

const packageNameFor = (path: string) => {
  const normalized = path.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const index = normalized.lastIndexOf(marker);
  if (index < 0) return undefined;
  const tail = normalized.slice(index + marker.length);
  const parts = tail.split("/");
  if (parts[0]?.startsWith("@")) return parts.slice(0, 2).join("/");
  return parts[0];
};

const symbolNameAt = (path: string, range: Definition["range"]) => {
  try {
    const source = readFileSync(path, "utf8");
    const lines = source.split("\n");
    const line = lines[range.start.line] ?? "";
    const start = Math.max(0, Math.min(range.start.character, line.length));
    const end = Math.max(start, Math.min(range.end.line === range.start.line ? range.end.character : line.length, line.length));
    const selected = line.slice(start, end);
    return /[$A-Z_a-z][$\w]*/.exec(selected)?.[0];
  } catch {
    return undefined;
  }
};

const isInside = (workspaceRoot: string, path: string) => {
  const value = relative(workspaceRoot, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${"/"}`) && !value.startsWith("..\\"));
};

const rangesEqual = (left: ExactRange, right: ExactRange) =>
  left.byte.start === right.byte.start && left.byte.end === right.byte.end;

const summarizeArtifact = (artifact: DeclarationArtifact) => ({
  id: artifact.id,
  path: artifact.path,
  kind: artifact.kind,
  name: artifact.name,
  source: artifact.source,
  sourceHash: artifact.sourceHash,
  range: artifact.range,
  parserError: artifact.parserError,
  ...(artifact.schema ? { schema: artifact.schema } : {}),
});

const normalizeDefinitions = (response: DefinitionResponse): Definition[] | null => {
  if (!response.result) return null;
  const values = Array.isArray(response.result) ? response.result : [response.result];
  return values.flatMap((value) => {
    const location = value as LspLocation;
    if (location.uri && location.range) return [{ uri: location.uri, range: location.range }];
    const link = value as LspLocationLink;
    if (link.targetUri && link.targetSelectionRange) {
      return [{ uri: link.targetUri, range: link.targetSelectionRange }];
    }
    return [];
  });
};

const definitionKey = (definition: Definition) =>
  `${definition.uri}:${definition.range.start.line}:${definition.range.start.character}:${definition.range.end.line}:${definition.range.end.character}`;

const sortDefinitions = <T extends Definition>(definitions: T[]): T[] =>
  definitions.slice().sort((left, right) => definitionKey(left).localeCompare(definitionKey(right)));

const loadWorkspace = (fixture: Fixture) => {
  const files = new Map<string, SourceFile>();
  for (const path of fixture.paths) {
    if (!path.endsWith(".ts") && !path.endsWith(".tsx") && !path.endsWith(".mts") && !path.endsWith(".cts") && !path.endsWith(".d.ts")) continue;
    const absolutePath = resolve(fixture.workspaceRoot, path);
    const text = readFileSync(absolutePath, "utf8");
    files.set(path.replaceAll("\\", "/"), parseSource(path, absolutePath, text, pathToUri(absolutePath)));
  }
  return files;
};

const indexWorkspaceArtifacts = (workspace: Map<string, SourceFile>) => {
  const index = new Map<string, DeclarationArtifact[]>();
  for (const [path, sourceFile] of workspace) {
    index.set(path, [
      ...artifactsFor(sourceFile, path),
      ...schemaCandidatesFor(sourceFile, path),
    ]);
  }
  return index;
};

const selectedRoots = (
  fixture: Fixture,
  workspace: Map<string, SourceFile>,
  artifactIndex: Map<string, DeclarationArtifact[]>,
) => {
  const after = workspace.get(fixture.edit.path);
  if (!after) throw new Error(`edit path is not a TypeScript workspace file: ${fixture.edit.path}`);
  const beforeAbsolute = join(fixture.root, fixture.manifest.before ?? "before", fixture.edit.path);
  const beforeText = existsSync(beforeAbsolute) ? readFileSync(beforeAbsolute, "utf8") : fixture.edit.beforeText;
  const before = parseSource(
    fixture.edit.path,
    beforeAbsolute,
    beforeText,
    pathToUri(beforeAbsolute),
  );
  const afterArtifacts = artifactIndex.get(fixture.edit.path) ?? [];
  const beforeArtifacts = [
    ...artifactsFor(before, fixture.edit.path),
    ...schemaCandidatesFor(before, fixture.edit.path),
  ];
  const afterChanged = fixture.edit.afterBytes;
  const beforeChanged = fixture.edit.beforeBytes;
  const afterSelected = afterArtifacts.filter((artifact) =>
    artifact.range.byte.start < afterChanged.end && afterChanged.start < artifact.range.byte.end ||
      afterChanged.start === afterChanged.end && artifact.range.byte.start <= afterChanged.start && afterChanged.start <= artifact.range.byte.end,
  );
  const beforeSelected = beforeArtifacts.filter((artifact) =>
    artifact.range.byte.start < beforeChanged.end && beforeChanged.start < artifact.range.byte.end ||
      beforeChanged.start === beforeChanged.end && artifact.range.byte.start <= beforeChanged.start && beforeChanged.start <= artifact.range.byte.end,
  );
  const candidates = new Map<string, { after?: DeclarationArtifact; before?: DeclarationArtifact }>();
  for (const artifact of afterSelected) {
    const key = artifact.id.split(":").slice(1).join(":");
    candidates.set(key, { ...(candidates.get(key) ?? {}), after: artifact });
  }
  for (const artifact of beforeSelected) {
    const key = artifact.id.split(":").slice(1).join(":");
    candidates.set(key, { ...(candidates.get(key) ?? {}), before: artifact });
  }
  const roots = [...candidates.values()]
    .sort((left, right) => (left.after ?? left.before)!.range.byte.start - (right.after ?? right.before)!.range.byte.start)
    .map((candidate) => candidate.after ?? candidate.before!)
    .filter((artifact) => artifact !== undefined);
  return { roots, before: beforeSelected, after: afterSelected };
};

const exactDefinition = (
  workspaceRoot: string,
  sourceFiles: Map<string, SourceFile>,
  artifactIndex: Map<string, DeclarationArtifact[]>,
  definition: Definition,
): NavigationDefinition => {
  const absolutePath = uriToPath(definition.uri);
  const path = relativePath(workspaceRoot, absolutePath);
  const external = !isInside(workspaceRoot, absolutePath) || path.includes("node_modules/");
  const packageName = packageNameFor(absolutePath);
  const sourceFile = sourceFiles.get(path);
  const declaration = sourceFile
    ? (artifactIndex.get(path) ?? artifactsFor(sourceFile, path)).find((artifact) => {
        const byte = byteRangeFromLsp(sourceFile.text, definition.range).start;
        return artifact.range.byte.start <= byte && byte <= artifact.range.byte.end;
      })
    : undefined;
  return { ...definition, path, external, packageName, symbolName: symbolNameAt(absolutePath, definition.range), declaration };
};

const zodSchemaSymbols = new Set([
  "any", "array", "bigint", "boolean", "catch", "coerce", "custom", "date",
  "default", "discriminatedUnion", "enum", "file", "function", "instanceof",
  "intersection", "lazy", "literal", "map", "nativeEnum", "never", "null",
  "nullable", "number", "object", "optional", "ostring", "onumber", "oboolean",
  "promise", "record", "set", "string", "symbol", "transform", "tuple", "undefined",
  "union", "unknown", "void", "strictObject", "looseObject", "int", "uint32",
  "uint64", "int32", "int64", "json", "preprocess", "pipe", "refine", "superRefine",
  "brand", "check", "filter",
]);

const effectSchemaSymbols = new Set([
  "Array", "ArrayEnsure", "Boolean", "BigInt", "Date", "declare", "declareConstructor",
  "decode", "decodeTo", "encode", "encodeTo", "Literal", "Literals", "Number", "optional",
  "Readonly", "Record", "String", "Struct", "TaggedStruct", "TaggedUnion", "Tuple", "Union",
  "Unknown", "Undefined", "Void", "compose", "filter", "refine", "check", "suspend", "transform",
  "brand",
]);

const zodNonSchemaSymbols = new Set([
  "treeifyError", "locales", "regexes", "prettifyError", "formatError", "flattenError",
  "toJSONSchema", "config", "registry", "globalRegistry", "clone", "NEVER", "INVALID",
]);

const effectNonSchemaSymbols = new Set([
  "isSchema", "isSchemaError", "decodeSync", "encodeSync", "decodeUnknownSync",
  "encodeUnknownSync", "toJsonSchemaDocument", "toStandardSchemaV1", "makeFilter",
]);

const schemaFrameworkForDefinition = (definition: NavigationDefinition, candidateName?: string): SchemaFramework | null => {
  if (
    definition.packageName === "zod" &&
    ((definition.symbolName && zodSchemaSymbols.has(definition.symbolName)) ||
      (candidateName !== undefined && zodSchemaSymbols.has(candidateName)))
  ) return "zod";
  // The package exports many modules.  Requiring a Schema declaration path
  // prevents an ordinary `Effect` import from becoming an Effect Schema root
  // merely because it happens to live in the `effect` package.
  if (
    definition.packageName === "effect" &&
    /(?:^|[\\/])schema(?:\.d\.ts|\.ts|\.js)?$/i.test(definition.path) &&
    Boolean(
      (definition.symbolName && effectSchemaSymbols.has(definition.symbolName)) ||
      (candidateName && effectSchemaSymbols.has(candidateName)),
    )
  ) {
    return "effect-schema";
  }
  return null;
};

const isFrameworkDefinition = (definition: NavigationDefinition) =>
  definition.packageName === "zod" ||
  definition.packageName === "effect" && /(?:^|[\\/])schema(?:\.d\.ts|\.ts|\.js)?$/i.test(definition.path);

const hasUnsupportedFrameworkDefinition = (schema: NonNullable<DeclarationArtifact["schema"]>) => {
  const definitions = schema.constructor.definitions;
  // Framework identity is a positive allowlist.  A location in a pinned
  // framework package is not enough: exports such as Z.regexes are framework
  // values, but are not schema constructors or operations and must be dropped.
  return definitions.length > 0 && definitions.every((definition) =>
    isFrameworkDefinition(definition) && schemaFrameworkForDefinition(definition, schema.constructor.name) === null,
  );
};

const stableSchemaDefinition = (definition: NavigationDefinition) => ({
  uri: stableDefinitionUri(definition),
  path: definition.path,
  packageName: definition.packageName ?? null,
  external: definition.external,
  symbolName: definition.symbolName ?? null,
  range: definition.range,
});

const unsupportedSchemaOperations = (expression: string) => {
  const operations = new Set<string>();
  const matcher = /\.(transform|refine|superRefine|filter|check|declare|pipe|preprocess|brand|decodeTo|encodeTo|decode|encode|compose)\b/g;
  for (const match of expression.matchAll(matcher)) {
    if (match[1]) operations.add(match[1]);
  }
  return [...operations].sort();
};

const schemaOperations = (schema: NonNullable<DeclarationArtifact["schema"]>) => {
  const operations = new Set(unsupportedSchemaOperations(schema.expression));
  if (/declare/i.test(schema.constructor.name)) operations.add("declare");
  return [...operations].sort();
};

const annotateSchemaArtifact = async (
  fixture: Fixture,
  client: NativeLspClient,
  workspace: Map<string, SourceFile>,
  artifactIndex: Map<string, DeclarationArtifact[]>,
  artifact: DeclarationArtifact,
  deadline: number,
) => {
  const schema = artifact.schema;
  if (artifact.kind !== "schema" || !schema) return undefined;
  const sourceFile = workspace.get(artifact.path);
  if (!sourceFile) {
    schema.provenance = "unresolved";
    schema.interpretation = "unresolved";
    schema.opaque = [{
      source: schema.expression,
      range: schema.expressionRange,
      reason: "source file unavailable for constructor provenance",
    }];
    return { path: artifact.path, name: artifact.name, reason: "source file unavailable" };
  }
  const response = await client.definition(
    sourceFile.uri,
    schema.constructor.range.utf16.start,
    deadline,
  );
  const definitions = normalizeDefinitions(response)
    ?.map((definition) => exactDefinition(fixture.workspaceRoot, workspace, artifactIndex, definition)) ?? null;
  const sorted = definitions ? sortDefinitions(definitions) : null;
  const stableDefinitions = sorted?.map(stableSchemaDefinition) ?? [];
  schema.constructor.definition = stableDefinitions.length === 1 ? stableDefinitions[0]! : null;
  schema.constructor.definitions = stableDefinitions;
  if (response.timedOut || performance.now() >= deadline) {
    schema.provenance = "unresolved";
    schema.framework = null;
    schema.interpretation = "unresolved";
    schema.opaque = [{
      source: schema.expression,
      range: schema.expressionRange,
      reason: response.error ?? "constructor provenance deadline exceeded",
    }];
    return { path: artifact.path, name: artifact.name, reason: response.error ?? "constructor provenance deadline exceeded" };
  }
  if (!sorted || sorted.length === 0) {
    schema.provenance = response.error ? "unresolved" : "null";
    schema.framework = null;
    schema.interpretation = "unresolved";
    schema.opaque = [{
      source: schema.expression,
      range: schema.expressionRange,
      reason: response.error ?? "constructor definition returned null",
    }];
    return response.error ? { path: artifact.path, name: artifact.name, reason: response.error } : undefined;
  }
  if (sorted.length > 1) {
    schema.provenance = "multiple";
    const frameworks = [...new Set(sorted.map((definition) => schemaFrameworkForDefinition(definition, schema.constructor.name)).filter((value): value is SchemaFramework => value !== null))];
    if (frameworks.length === 1 && sorted.every((definition) => schemaFrameworkForDefinition(definition, schema.constructor.name) === frameworks[0])) {
      schema.framework = frameworks[0]!;
      const operations = schemaOperations(schema);
      schema.opaque = operations.map((operation) => ({
        source: schema.expression,
        range: schema.expressionRange,
        reason: `unsupported ${frameworks[0]} operation .${operation}; source retained opaquely`,
      }));
      schema.interpretation = schema.opaque.length > 0 ? "partial" : "complete";
    } else {
      schema.framework = null;
      schema.interpretation = "unresolved";
      schema.opaque = [{
        source: schema.expression,
        range: schema.expressionRange,
        reason: "constructor definition returned multiple locations",
      }];
    }
    return undefined;
  }
  const definition = sorted[0]!;
  const framework = schemaFrameworkForDefinition(definition, schema.constructor.name);
  if (!framework) {
    schema.provenance = definition.external ? "external" : "project";
    schema.framework = null;
    schema.interpretation = "unresolved";
    schema.opaque = [{
      source: schema.expression,
      range: schema.expressionRange,
      reason: definition.external
        ? `unsupported external constructor ${definition.packageName ?? "<unknown>"}`
        : "constructor resolves to a project declaration rather than a framework export",
    }];
    return undefined;
  }
  schema.provenance = "native-lsp";
  schema.framework = framework;
  const operations = schemaOperations(schema);
  const opaque: SchemaOpaqueSegment[] = operations.map((operation) => ({
    source: schema.expression,
    range: schema.expressionRange,
    reason: `unsupported ${framework} operation .${operation}; source retained opaquely`,
  }));
  schema.opaque = opaque;
  schema.interpretation = opaque.length > 0 ? "partial" : "complete";
  return undefined;
};

const removeUnprovenProjectRoots = (roots: DeclarationArtifact[]) =>
  roots.filter((artifact) => {
    if (artifact.kind !== "schema" || !artifact.schema) return true;
    if (hasUnsupportedFrameworkDefinition(artifact.schema)) return false;
    // A definition in an unrecognized external package is not a schema root.
    // Keep null/unresolved/multiple results as explicit uncertainty, but do not
    // let an external ordinary factory enter the graph as if it were one.
    if (artifact.schema.provenance === "external" && artifact.schema.framework === null) return false;
    if (artifact.schema.provenance !== "project" || artifact.schema.framework !== null) return true;
    // A project wrapper is retained as an unresolved schema only when a native
    // LSP edge reached a separately recognized schema artifact identity. This
    // keeps helper evidence (for example wrap(Composed)) while rejecting a
    // similarly-shaped ordinary factory call with no schema provenance.
    return artifact.schema.referencedSchemaIds.length > 0;
  });

const definitionCacheKey = (sourceUri: string, position: { line: number; character: number }) =>
  `${sourceUri}:${position.line}:${position.character}`;

const candidateMayReachSchemaIdentity = (
  artifact: DeclarationArtifact,
  schemaNames: Set<string>,
  sourceFile?: SourceFile,
) => {
  if (!artifact.schema) return false;
  const packageHint = schemaFrameworkPackageHint(artifact.schema);
  if (packageHint === "zod" && zodNonSchemaSymbols.has(artifact.schema.constructor.name)) return false;
  if (packageHint === "effect" && effectNonSchemaSymbols.has(artifact.schema.constructor.name)) return false;
  if (packageHint !== undefined) return true;
  if (artifact.references.some((reference) => schemaNames.has(reference.name))) return true;
  // A helper/re-exported constructor is still a valid project provenance
  // candidate.  Keep it only when the constructor binding is imported from a
  // project-relative module; local ordinary factories are dropped here.
  const name = artifact.schema.constructor.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = sourceFile?.text ?? "";
  const imported = new RegExp(`\\bimport\\b[\\s\\S]*?\\b${name}\\b[\\s\\S]*?\\bfrom\\s*[\\\"']\\.?\\.?/[^\\\"']+[\\\"']`).test(text);
  return imported;
};

const edgeResolution = (definitions: NavigationDefinition[] | null, response: DefinitionResponse) => {
  if (response.error) return "error";
  if (!definitions || definitions.length === 0) return "null";
  if (definitions.length > 1) return "multiple";
  if (definitions[0]?.external) return "external";
  if (!definitions[0]?.declaration) return "unresolved";
  return "resolved";
};

const addReason = (state: TraversalState, reason: string, edgeId?: string) => {
  state.completenessReasons.add(reason);
  if (edgeId) state.omitted.push({ edgeId, reason });
};

const omitSchemaProvenance = (
  state: TraversalState,
  artifact: DeclarationArtifact,
  reason: string,
) => {
  const schema = artifact.schema;
  if (!schema) return;
  schema.provenance = "unresolved";
  schema.framework = null;
  schema.interpretation = "unresolved";
  schema.opaque = [{
    source: schema.expression,
    range: schema.expressionRange,
    reason: `schema constructor provenance omitted at ${reason} cap`,
  }];
  addReason(state, reason);
  state.schemaFailures.push({ path: artifact.path, name: artifact.name, reason });
  state.schemaAnnotated.add(artifact.id);
};

const recordSchemaExternalPackage = (state: TraversalState, artifact: DeclarationArtifact) => {
  const packageName = artifact.schema?.constructor.definitions.find((definition) => definition.external)?.packageName;
  if (packageName) state.externalPackages.add(packageName);
};

const capCheck = (
  state: TraversalState,
  fixture: Fixture,
  edgeId: string,
  artifact: DeclarationArtifact,
  depth: number,
  externalPackage?: string,
  usage: { declarations?: number; sourceCharacters?: number; files?: number } = {},
) => {
  const caps = fixture.caps;
  if (performance.now() - state.started >= caps.elapsedMs) return "elapsed-time";
  if (depth > caps.depth) return "depth";
  const declarations = usage.declarations ?? state.context.length + state.roots.length + 1;
  if (declarations > caps.declarations) return "declarations";
  const files = usage.files ?? state.files.size + (state.files.has(artifact.path) ? 0 : 1);
  if (files > caps.files) return "files";
  const sourceCharacters = usage.sourceCharacters ?? state.sourceCharacters + artifact.source.length;
  if (sourceCharacters > caps.sourceCharacters) return "source-characters";
  if (externalPackage && !state.externalPackages.has(externalPackage) && state.externalPackages.size >= caps.externalPackages) {
    return "external-packages";
  }
  return undefined;
};

const runTraversal = async (
  fixture: Fixture,
  client: NativeLspClient,
  workspace: Map<string, SourceFile>,
  artifactIndex: Map<string, DeclarationArtifact[]>,
  roots: DeclarationArtifact[],
  started = performance.now(),
  forceSchemaAnnotation = false,
) => {
  const deadline = started + fixture.caps.elapsedMs;
  const state: TraversalState = {
    started,
    deadline,
    roots: roots.slice(),
    context: [],
    edges: [],
    queue: [],
    visited: new Set(),
    files: new Set(),
    externalPackages: new Set(),
    sourceCharacters: 0,
    omitted: [],
    completenessReasons: new Set(),
    navigationFailures: [],
    schemaFailures: [],
    schemaAnnotated: new Set(),
    definitionCache: new Map(),
  };
  // Syntactic const discovery is intentionally broad, but a candidate with no
  // framework hint and no possible schema-valued identity cannot become a
  // useful root.  Drop those ordinary lookalikes before asking the server for
  // provenance or walking their values.  Project wrappers that mention another
  // discovered schema stay in this provisional set and are checked below by
  // native-LSP identity.
  const schemaNames = new Set(
    [...artifactIndex.values()].flat()
      .filter((artifact) => artifact.kind === "schema")
      .map((artifact) => artifact.name),
  );
  state.roots = state.roots.filter((root) =>
    root.kind !== "schema" || candidateMayReachSchemaIdentity(root, schemaNames, workspace.get(root.path)),
  );
  let rootSourceCharacters = 0;
  const rootFiles = new Set<string>();
  for (const [index, root] of state.roots.entries()) {
    rootSourceCharacters += root.source.length;
    rootFiles.add(root.path);
    if (root.kind === "schema" && root.schema) {
      root.schema.referencedSchemaIds = [];
      if (forceSchemaAnnotation || !state.schemaAnnotated.has(root.id)) {
        const packageHint = schemaFrameworkPackageHint(root.schema) ??
          (fixture.caps.externalPackages === 0 ? "<unknown>" : undefined);
        const rootCap = capCheck(
          state,
          fixture,
          `root-${String(index).padStart(4, "0")}`,
          root,
          0,
          packageHint,
          {
            declarations: index + 1,
            sourceCharacters: rootSourceCharacters,
            files: rootFiles.size,
          },
        );
        if (rootCap) {
          omitSchemaProvenance(state, root, rootCap);
        } else {
          const failure = await annotateSchemaArtifact(
            fixture,
            client,
            workspace,
            artifactIndex,
            root,
            deadline,
          );
          if (failure) state.schemaFailures.push(failure);
        }
        state.schemaAnnotated.add(root.id);
      }
    }
  }
  // A project-owned constructor is not itself proof that the value is a
  // schema.  Probe its syntactic references once and retain the wrapper only
  // when native LSP reaches a separately recognized schema artifact identity.
  // These probes are cached and become ordinary edges only for retained roots.
  for (const root of state.roots) {
    if (root.kind !== "schema" || !root.schema || root.schema.provenance !== "project") continue;
    for (const reference of root.references) {
      const sourceFile = workspace.get(root.path);
      if (!sourceFile) break;
      const key = definitionCacheKey(sourceFile.uri, reference.sourceRange.utf16.start);
      const response = await client.definition(sourceFile.uri, reference.sourceRange.utf16.start, deadline);
      state.definitionCache.set(key, response);
      if (response.timedOut || performance.now() >= deadline) break;
      const definitions = normalizeDefinitions(response)
        ?.map((definition) => exactDefinition(fixture.workspaceRoot, workspace, artifactIndex, definition)) ?? null;
      const sorted = definitions ? sortDefinitions(definitions) : null;
      if (sorted?.length !== 1) continue;
      const target = sorted[0]?.declaration;
      if (target?.kind === "schema" && target.schema?.framework !== null && target.schema?.framework !== undefined) {
        if (!root.schema.referencedSchemaIds.includes(target.id)) root.schema.referencedSchemaIds.push(target.id);
      }
    }
  }
  state.roots = state.roots.filter((root) => !root.schema || !hasUnsupportedFrameworkDefinition(root.schema));
  state.roots = removeUnprovenProjectRoots(state.roots);
  // Rejected candidates must not consume traversal budgets or package
  // observations.  Only retained roots enter the queue and contribute their
  // source/file totals.
  for (const root of state.roots) {
    if (root.kind === "schema" && root.schema) recordSchemaExternalPackage(state, root);
    if (root.parserError) addReason(state, "parser-error");
  }
  for (const root of state.roots) {
    state.visited.add(root.id);
    state.queue.push({ artifact: root, depth: 0, from: root.id });
    state.files.add(root.path);
    state.sourceCharacters += root.source.length;
  }
  if (state.roots.length > fixture.caps.declarations) addReason(state, "declarations");
  if (state.files.size > fixture.caps.files) addReason(state, "files");
  if (state.sourceCharacters > fixture.caps.sourceCharacters) addReason(state, "source-characters");
  for (const root of state.roots) {
    if (root.kind !== "schema" || !root.schema) continue;
    if (root.schema.interpretation === "partial") addReason(state, "schema-partial");
    if (root.schema.interpretation === "unresolved") addReason(state, "schema-unresolved");
  }

  let edgeNumber = 0;
  while (state.queue.length > 0) {
    const current = state.queue.shift()!;
    const sourceFile = workspace.get(current.artifact.path);
    if (!sourceFile) {
      addReason(state, "source-file-unavailable");
      continue;
    }
    for (const reference of current.artifact.references) {
      const edgeId = `edge-${String(edgeNumber++).padStart(4, "0")}`;
      const edge: Record<string, unknown> = {
        id: edgeId,
        from: summarizeArtifact(current.artifact),
        depth: current.depth + 1,
        reason: "syntactic-outbound-reference",
        reference: {
          name: reference.name,
          syntaxKind: reference.syntaxKind,
          range: reference.sourceRange,
        },
        resolution: "unresolved",
        unresolved: true,
        definitions: null,
        sourceDeclaration: null,
        included: false,
        omission: null,
      };
      const edgeDepth = current.depth + 1;
      if (performance.now() >= state.deadline) {
        edge.omission = "elapsed-time";
        addReason(state, "elapsed-time", edgeId);
        state.edges.push(edge);
        continue;
      }
      if (edgeDepth > fixture.caps.depth) {
        edge.omission = "depth";
        addReason(state, "depth", edgeId);
        state.edges.push(edge);
        continue;
      }
      const cacheKey = definitionCacheKey(sourceFile.uri, reference.sourceRange.utf16.start);
      const response = state.definitionCache.get(cacheKey) ?? await client.definition(
        sourceFile.uri,
        reference.sourceRange.utf16.start,
        state.deadline,
      );
      state.definitionCache.set(cacheKey, response);
      const definitions = normalizeDefinitions(response)
        ?.map((definition) => exactDefinition(fixture.workspaceRoot, workspace, artifactIndex, definition)) ?? null;
      const sorted = definitions ? sortDefinitions(definitions) : null;
      if (response.timedOut || performance.now() >= state.deadline) {
        edge.resolution = "timeout";
        edge.unresolved = true;
        edge.definitions = null;
        edge.omission = "elapsed-time";
        state.navigationFailures.push({
          path: current.artifact.path,
          name: reference.name,
          reason: response.error ?? "elapsed-time deadline exceeded",
        });
        addReason(state, "elapsed-time", edgeId);
        state.edges.push(edge);
        continue;
      }
      const resolution = edgeResolution(sorted, response);
      edge.resolution = resolution;
      edge.unresolved = resolution === "null" || resolution === "unresolved" || resolution === "error";
      edge.definitions = sorted?.map((definition) => ({
        uri: stableDefinitionUri(definition),
        path: definition.path,
        range: definition.range,
        external: definition.external,
        packageName: definition.packageName ?? null,
        declaration: definition.declaration ? summarizeArtifact(definition.declaration) : null,
      })) ?? null;
      if (response.error) {
        edge.omission = "navigation-error";
        state.navigationFailures.push({ path: current.artifact.path, name: reference.name, reason: response.error });
        addReason(state, "navigation-error", edgeId);
      } else if (resolution === "null") {
        addReason(state, "null-definition", edgeId);
      } else if (resolution === "multiple") {
        addReason(state, "multiple-definitions", edgeId);
      } else if (resolution === "external") {
        const definition = sorted?.[0];
        const packageName = definition?.packageName ?? definition?.path ?? "<external>";
        if (!state.externalPackages.has(packageName) && state.externalPackages.size >= fixture.caps.externalPackages) {
          edge.omission = "external-packages";
          addReason(state, "external-packages", edgeId);
        } else {
          state.externalPackages.add(packageName);
          edge.omission = "external-package-terminal";
          addReason(state, "external-package-terminal", edgeId);
        }
      } else if (resolution === "unresolved") {
        addReason(state, "definition-without-source-declaration", edgeId);
      } else {
        const definition = sorted?.[0];
        const artifact = definition?.declaration;
        if (!definition || !artifact) {
          edge.resolution = "unresolved";
          addReason(state, "definition-without-source-declaration", edgeId);
        } else {
          if (artifact.kind === "schema" && artifact.schema && !state.schemaAnnotated.has(artifact.id)) {
            const schemaCap = capCheck(
              state,
              fixture,
              edgeId,
              artifact,
              edgeDepth,
              schemaFrameworkPackageHint(artifact.schema),
            );
            if (schemaCap) {
              omitSchemaProvenance(state, artifact, schemaCap);
            } else {
              const failure = await annotateSchemaArtifact(
                fixture,
                client,
                workspace,
                artifactIndex,
                artifact,
                state.deadline,
              );
              if (failure) state.schemaFailures.push(failure);
              recordSchemaExternalPackage(state, artifact);
            }
            state.schemaAnnotated.add(artifact.id);
          }
          if (
            current.artifact.schema &&
            artifact.kind === "schema" &&
            artifact.schema?.framework !== null &&
            artifact.schema?.framework !== undefined &&
            !current.artifact.schema.referencedSchemaIds.includes(artifact.id)
          ) {
            current.artifact.schema.referencedSchemaIds.push(artifact.id);
          }
          edge.sourceDeclaration = summarizeArtifact(artifact);
          const cap = capCheck(state, fixture, edgeId, artifact, edgeDepth);
          if (cap) {
            edge.omission = cap;
            addReason(state, cap, edgeId);
          } else if (state.visited.has(artifact.id)) {
            edge.omission = "already-visited";
          } else {
            if (artifact.parserError) addReason(state, "parser-error", edgeId);
            state.visited.add(artifact.id);
            state.context.push(artifact);
            state.files.add(artifact.path);
            state.sourceCharacters += artifact.source.length;
            edge.included = true;
            state.queue.push({ artifact, depth: edgeDepth, from: current.artifact.id });
          }
        }
      }
      state.edges.push(edge);
    }
  }
  const retainedRoots = state.roots;
  return {
    roots: retainedRoots.map(summarizeArtifact),
    context: state.context.map(summarizeArtifact),
    edges: state.edges,
    completeness: {
      complete: state.completenessReasons.size === 0,
      reasons: [...state.completenessReasons].sort(),
      omittedEdges: state.omitted,
      caps: reportedCaps(fixture.caps),
      observed: {
        declarations: retainedRoots.length + state.context.length,
        depth: Math.max(0, ...state.edges.map((edge) => Number(edge.depth ?? 0))),
        sourceCharacters: state.sourceCharacters,
        files: state.files.size,
        externalPackages: state.externalPackages.size,
        elapsedMs: performance.now() - state.started,
      },
    },
    navigationFailures: state.navigationFailures,
    schemaFailures: state.schemaFailures,
  };
};

const packageVersions = () => {
  const parser = packageVersion("tree-sitter");
  const grammar = packageVersion("tree-sitter-typescript");
  const zod = packageVersion("zod");
  const effectSchema = packageVersion("effect");
  return {
    typescript: typescriptVersion,
    zod,
    effectSchema,
    frameworks: {
      zod: { package: "zod", version: zod },
      effectSchema: { package: "effect", subpath: "effect/Schema", version: effectSchema },
    },
    parser,
    grammar,
    parserPackage: "tree-sitter",
    grammarPackage: "tree-sitter-typescript",
    binding: {
      parser: { package: "tree-sitter", version: parser, nativeAddon: "tree-sitter.node" },
      grammar: { package: "tree-sitter-typescript", version: grammar, nativeAddon: "tree-sitter-typescript.node" },
      implementation: "Node-API native addons",
      napi: process.versions.napi ?? "unknown",
      modules: process.versions.modules ?? "unknown",
    },
    runtime: {
      name: "node",
      version: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
  };
};

const countDelta = (before: Record<string, number>, after: Record<string, number>) => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Object.fromEntries([...keys].sort().map((key) => [key, (after[key] ?? 0) - (before[key] ?? 0)]));
};

const reportedCaps = (caps: TraversalCaps) => ({
  ...caps,
  maxElapsedMs: caps.elapsedMs,
});

const main = async () => {
  const args = process.argv.slice(2);
  const fixturePath = argument(args, "--fixture");
  if (!fixturePath) usage();
  const fixture = readFixture(fixturePath as string, argument(args, "--edit"), parseCapOverrides(args));
  const workspace = loadWorkspace(fixture);
  const artifactIndex = indexWorkspaceArtifacts(workspace);
  const rootSelection = selectedRoots(fixture, workspace, artifactIndex);
  const traversalRoots = rootSelection.roots.slice();
  const markerBeforeContent = fixture.markerPath && existsSync(fixture.markerPath)
    ? readFileSync(fixture.markerPath, "utf8")
    : undefined;
  const markerBefore = markerBeforeContent !== undefined;
  const markerToken = `declaration-extraction:${randomUUID()}`;
  const previousMarkerToken = process.env.DECLARATION_EXTRACTION_MARKER_TOKEN;
  const requestedFault = argument(args, "--fault");
  process.env.DECLARATION_EXTRACTION_MARKER_TOKEN = markerToken;
  const lsp = await NativeLspClient.start(fixture.workspaceRoot, 2_000, {
    nonResponding: requestedFault === "nonresponding",
    crash: requestedFault === "crash",
  });
  const documents = [...workspace.values()].map((file) => ({
      uri: file.uri,
      languageId: "typescript" as const,
      version: 1,
      text: file.text,
    }));
  await lsp.open(documents);
  if (requestedFault === "stale-document") {
    const target = documents.find((document) => document.uri === workspace.get(fixture.edit.path)?.uri);
    if (target) {
      const staleText = fixture.edit.beforeText;
      await lsp.sendStaleDocument({ ...target, text: staleText }, 0);
    }
  }
  const coldStarted = performance.now();
  const coldCounts = lsp.snapshotCounts();
  const cold = await runTraversal(fixture, lsp, workspace, artifactIndex, traversalRoots, coldStarted);
  const coldMs = performance.now() - coldStarted;
  const retainedRootIds = new Set((cold.roots as Array<{ id: string }>).map((root) => root.id));
  rootSelection.after = rootSelection.after.filter((root) => retainedRootIds.has(root.id));
  const afterSchemaById = new Map(
    [...artifactIndex.values()].flat()
      .filter((artifact) => artifact.kind === "schema")
      .map((artifact) => [artifact.id, artifact]),
  );
  for (const artifact of rootSelection.before) {
    const after = afterSchemaById.get(artifact.id);
    if (artifact.kind === "schema" && artifact.schema && after?.schema) {
      const expression = artifact.schema.expression;
      const expressionRange = artifact.schema.expressionRange;
      const resolution = structuredClone(after.schema);
      resolution.expression = expression;
      resolution.expressionRange = expressionRange;
      resolution.opaque = resolution.opaque.map((segment) => ({
        ...segment,
        source: expression,
        range: expressionRange,
      }));
      artifact.schema = resolution;
    }
  }
  rootSelection.before = rootSelection.before.filter((root) => retainedRootIds.has(root.id));
  const warmStarted = performance.now();
  const warmCounts = lsp.snapshotCounts();
  const warm = await runTraversal(fixture, lsp, workspace, artifactIndex, traversalRoots, warmStarted, true);
  const warmMs = performance.now() - warmStarted;
  const afterWarmCounts = lsp.snapshotCounts();
  const phaseTimingsMs = lsp.phaseTimingsMs;
  const serverVersion = lsp.serverVersion;
  await lsp.stop();
  if (previousMarkerToken === undefined) delete process.env.DECLARATION_EXTRACTION_MARKER_TOKEN;
  else process.env.DECLARATION_EXTRACTION_MARKER_TOKEN = previousMarkerToken;
  const markerAfterContent = fixture.markerPath && existsSync(fixture.markerPath)
    ? readFileSync(fixture.markerPath, "utf8")
    : undefined;
  const markerAfter = markerAfterContent !== undefined;
  const markerChanged = markerBeforeContent !== markerAfterContent;
  const markerTokenObserved = markerAfterContent === markerToken;
  const modulesImported: boolean | null = markerTokenObserved
    ? true
    : markerAfterContent === undefined
      ? false
      : null;
  const noEvaluationObserved: boolean | null = !markerBefore && !markerAfter
    ? true
    : markerTokenObserved
      ? false
      : null;
  const stableCold = JSON.stringify({
    roots: cold.roots,
    context: cold.context,
    edges: cold.edges,
    completeness: { ...cold.completeness, observed: undefined },
  });
  const stableWarm = JSON.stringify({
    roots: warm.roots,
    context: warm.context,
    edges: warm.edges,
    completeness: { ...warm.completeness, observed: undefined },
  });
  const record = {
    schemaVersion: 1,
    status: "ok",
    fixture: fixture.manifest.name ?? basename(fixture.root),
    input: {
      workspace: "fixture-workspace",
      edit: {
        name: fixture.edit.name,
        path: fixture.edit.path,
        beforeRange: exactRange(fixture.edit.beforeText, fixture.edit.beforeBytes.start, fixture.edit.beforeBytes.end),
        afterRange: exactRange(fixture.edit.afterText, fixture.edit.afterBytes.start, fixture.edit.afterBytes.end),
        diff: fixture.edit.diff,
      },
    },
    observations: {
      files: {
        workspaceEntries: fixture.paths.length,
        directWorkspaceSourceReads: workspace.size,
        configurationPathsDiscovered: fixture.paths.filter((path) => /(?:^|\/)(?:tsconfig|package)\.json$/.test(path)).sort(),
        filesystemWrites: null,
        filesystemWriteInstrumentation: "not-instrumented",
      },
      subprocess: {
        directChildrenSpawnedByHarness: 1,
        command: "typescript/bin/tsc --lsp --stdio",
        descendantProcesses: null,
        plugins: null,
        descendantProcessInstrumentation: "not-instrumented",
        pluginInstrumentation: "not-instrumented",
      },
      network: {
        directNetworkApisInvokedByHarness: null,
        directNetworkInstrumentation: "not-instrumented",
        networkEgress: null,
        networkEgressInstrumentation: "not-instrumented",
      },
    },
    versions: {
      ...packageVersions(),
      typescriptServer: serverVersion,
    },
    extraction: cold,
    rootSelection: {
      before: rootSelection.before.map(summarizeArtifact),
      after: rootSelection.after.map(summarizeArtifact),
      union: cold.roots,
    },
    timingsMs: {
      processStartup: phaseTimingsMs.processStartup,
      initialize: phaseTimingsMs.initialize,
      openDispatch: phaseTimingsMs.openDispatch,
      coldExtraction: coldMs,
      warmExtraction: warmMs,
      // Keep the original short names for existing consumers of the disposable
      // record while exposing phase-specific names for evidence summaries.
      cold: coldMs,
      warm: warmMs,
    },
    positionalRequestCounts: {
      cold: countDelta(coldCounts.positionalRequests, warmCounts.positionalRequests),
      warm: countDelta(warmCounts.positionalRequests, afterWarmCounts.positionalRequests),
    },
    lsp: {
      serverRequests: lsp.counts.serverRequests,
      clientRequests: lsp.counts.clientRequests,
      notifications: lsp.counts.notifications,
      shutdownParamsOmitted: true,
      exitParamsOmitted: true,
      unexpectedOrFailedNavigation: [
        ...cold.navigationFailures.map((failure) => ({
          ...failure,
          reason: sanitizeText(failure.reason, fixture.workspaceRoot),
        })),
        ...warm.navigationFailures.map((failure) => ({
          ...failure,
          reason: sanitizeText(failure.reason, fixture.workspaceRoot),
        })),
        ...lsp.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          message: sanitizeText(diagnostic.message, fixture.workspaceRoot),
        })),
        ...[...cold.schemaFailures, ...warm.schemaFailures].map((failure) => ({
          ...failure,
          reason: sanitizeText(failure.reason, fixture.workspaceRoot),
        })),
      ],
      stderr: sanitizeText(lsp.stderr, fixture.workspaceRoot),
      fault: requestedFault ?? null,
      faultEvidence: lsp.faultEvidence,
    },
    evaluation: {
      marker: fixture.markerPath ? relativePath(fixture.workspaceRoot, fixture.markerPath) : null,
      existsBefore: markerBefore,
      existsAfter: markerAfter,
      observed: !markerBefore && !markerAfter,
      markerChanged,
      markerTokenObserved,
      modulesImported,
      noEvaluationObserved,
      observation: markerTokenObserved
        ? "module-evaluated-during-extraction"
        : markerBefore
        ? "indeterminate-marker-preexisted"
        : markerAfter
          ? "indeterminate-marker-changed-without-run-token"
          : "marker-absent-no-evaluation-observed",
    },
    determinism: { coldWarmStable: stableCold === stableWarm },
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
};

const run = async () => {
  try {
    await main();
  } catch (error) {
    const record = {
      schemaVersion: 1,
      status: "error",
      error: sanitizeText(error instanceof Error ? error.message : String(error)),
    };
    process.stdout.write(`${JSON.stringify(record)}\n`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) void run();

export { main };
