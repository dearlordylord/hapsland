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
  declaration?: DeclarationArtifact;
};

type TraversalState = {
  started: number;
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
  return { ...definition, path, external, packageName, declaration };
};

const schemaFrameworkForDefinition = (definition: NavigationDefinition): SchemaFramework | null => {
  if (definition.packageName === "zod") return "zod";
  // The package exports many modules.  Requiring a Schema declaration path
  // prevents an ordinary `Effect` import from becoming an Effect Schema root
  // merely because it happens to live in the `effect` package.
  if (
    definition.packageName === "effect" &&
    /(?:^|[\\/])schema(?:\.d\.ts|\.ts|\.js)?$/i.test(definition.path)
  ) {
    return "effect-schema";
  }
  return null;
};

const stableSchemaDefinition = (definition: NavigationDefinition) => ({
  uri: stableDefinitionUri(definition),
  path: definition.path,
  packageName: definition.packageName ?? null,
  external: definition.external,
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

type SchemaAnnotationResult = { failures: Array<{ path: string; name: string; reason: string }> };

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
    const frameworks = [...new Set(sorted.map(schemaFrameworkForDefinition).filter((value): value is SchemaFramework => value !== null))];
    if (frameworks.length === 1 && sorted.every((definition) => schemaFrameworkForDefinition(definition) === frameworks[0])) {
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
  const framework = schemaFrameworkForDefinition(definition);
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

const annotateSchemas = async (
  fixture: Fixture,
  client: NativeLspClient,
  workspace: Map<string, SourceFile>,
  artifactIndex: Map<string, DeclarationArtifact[]>,
  roots: DeclarationArtifact[],
  deadline: number,
): Promise<SchemaAnnotationResult> => {
  const failures: Array<{ path: string; name: string; reason: string }> = [];
  const candidates = [
    ...[...artifactIndex.values()].flat(),
    ...roots,
  ].filter((artifact) => artifact.kind === "schema" && artifact.schema);
  const unique = new Map(candidates.map((artifact) => [artifact.id, artifact]));
  for (const artifact of [...unique.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    if (performance.now() >= deadline) {
      artifact.schema!.provenance = "unresolved";
      artifact.schema!.framework = null;
      artifact.schema!.interpretation = "unresolved";
      artifact.schema!.opaque = [{
        source: artifact.schema!.expression,
        range: artifact.schema!.expressionRange,
        reason: "schema constructor provenance omitted at elapsed-time cap",
      }];
      failures.push({ path: artifact.path, name: artifact.name, reason: "elapsed-time deadline exceeded" });
      continue;
    }
    const failure = await annotateSchemaArtifact(
      fixture,
      client,
      workspace,
      artifactIndex,
      artifact,
      deadline,
    );
    if (failure) failures.push(failure);
  }
  return { failures };
};

const removeUnprovenProjectRoots = (roots: DeclarationArtifact[], knownSchemaNames: Set<string>) =>
  roots.filter((artifact) => {
    if (artifact.kind !== "schema" || !artifact.schema) return true;
    if (artifact.schema.provenance !== "project" || artifact.schema.framework !== null) return true;
    // A project wrapper is retained as an unresolved schema only when its
    // source expression references a separately recognized schema root.  This
    // keeps helper evidence (for example wrap(Composed)) while rejecting a
    // similarly-shaped ordinary factory call with no schema provenance.
    return artifact.references.some((reference) => knownSchemaNames.has(reference.name));
  });

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

const capCheck = (
  state: TraversalState,
  fixture: Fixture,
  edgeId: string,
  artifact: DeclarationArtifact,
  depth: number,
  externalPackage?: string,
) => {
  const caps = fixture.caps;
  if (performance.now() - state.started >= caps.elapsedMs) return "elapsed-time";
  if (depth > caps.depth) return "depth";
  if (state.context.length + state.roots.length >= caps.declarations) return "declarations";
  if (!state.files.has(artifact.path) && state.files.size >= caps.files) return "files";
  if (state.sourceCharacters + artifact.source.length > caps.sourceCharacters) return "source-characters";
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
) => {
  const state: TraversalState = {
    started: performance.now(),
    roots,
    context: [],
    edges: [],
    queue: roots.map((artifact) => ({ artifact, depth: 0, from: artifact.id })),
    visited: new Set(roots.map((artifact) => artifact.id)),
    files: new Set(roots.map((artifact) => artifact.path)),
    externalPackages: new Set(),
    sourceCharacters: roots.reduce((total, artifact) => total + artifact.source.length, 0),
    omitted: [],
    completenessReasons: new Set(),
    navigationFailures: [],
  };
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
      if (performance.now() - state.started >= fixture.caps.elapsedMs) {
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
      const deadline = state.started + fixture.caps.elapsedMs;
      const response = await client.definition(sourceFile.uri, reference.sourceRange.utf16.start, deadline);
      const definitions = normalizeDefinitions(response)
        ?.map((definition) => exactDefinition(fixture.workspaceRoot, workspace, artifactIndex, definition)) ?? null;
      const sorted = definitions ? sortDefinitions(definitions) : null;
      if (response.timedOut || performance.now() >= deadline) {
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
          edge.sourceDeclaration = summarizeArtifact(artifact);
          const cap = capCheck(state, fixture, edgeId, artifact, edgeDepth);
          if (cap) {
            edge.omission = cap;
            addReason(state, cap, edgeId);
          } else if (state.visited.has(artifact.id)) {
            edge.omission = "already-visited";
          } else {
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
  return {
    roots: state.roots.map(summarizeArtifact),
    context: state.context.map(summarizeArtifact),
    edges: state.edges,
    completeness: {
      complete: state.completenessReasons.size === 0,
      reasons: [...state.completenessReasons].sort(),
      omittedEdges: state.omitted,
      caps: reportedCaps(fixture.caps),
      observed: {
        declarations: state.roots.length + state.context.length,
        depth: Math.max(0, ...state.edges.map((edge) => Number(edge.depth ?? 0))),
        sourceCharacters: state.sourceCharacters,
        files: state.files.size,
        externalPackages: state.externalPackages.size,
        elapsedMs: performance.now() - state.started,
      },
    },
    navigationFailures: state.navigationFailures,
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
  let roots = rootSelection.roots;
  const markerBeforeContent = fixture.markerPath && existsSync(fixture.markerPath)
    ? readFileSync(fixture.markerPath, "utf8")
    : undefined;
  const markerBefore = markerBeforeContent !== undefined;
  const markerToken = `declaration-extraction:${randomUUID()}`;
  const previousMarkerToken = process.env.DECLARATION_EXTRACTION_MARKER_TOKEN;
  process.env.DECLARATION_EXTRACTION_MARKER_TOKEN = markerToken;
  const coldStarted = performance.now();
  const lsp = await NativeLspClient.start(fixture.workspaceRoot, 2_000, {
    nonResponding: argument(args, "--fault") === "nonresponding",
  });
  await lsp.open(
    [...workspace.values()].map((file) => ({
      uri: file.uri,
      languageId: "typescript" as const,
      version: 1,
      text: file.text,
    })),
  );
  const coldCounts = lsp.snapshotCounts();
  const schemaAnnotation = await annotateSchemas(
    fixture,
    lsp,
    workspace,
    artifactIndex,
    roots,
    performance.now() + fixture.caps.elapsedMs,
  );
  const knownSchemaNames = new Set(
    [...artifactIndex.values()]
      .flat()
      .filter((artifact) => artifact.kind === "schema" && artifact.schema?.framework !== null)
      .map((artifact) => artifact.name),
  );
  rootSelection.before = removeUnprovenProjectRoots(rootSelection.before, knownSchemaNames);
  rootSelection.after = removeUnprovenProjectRoots(rootSelection.after, knownSchemaNames);
  roots = removeUnprovenProjectRoots(roots, knownSchemaNames);
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
  const cold = await runTraversal(fixture, lsp, workspace, artifactIndex, roots);
  const coldMs = performance.now() - coldStarted;
  const warmStarted = performance.now();
  const warmCounts = lsp.snapshotCounts();
  const warm = await runTraversal(fixture, lsp, workspace, artifactIndex, roots);
  const warmMs = performance.now() - warmStarted;
  const afterWarmCounts = lsp.snapshotCounts();
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
    timingsMs: { cold: coldMs, warm: warmMs },
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
        ...schemaAnnotation.failures.map((failure) => ({
          ...failure,
          reason: sanitizeText(failure.reason, fixture.workspaceRoot),
        })),
      ],
      stderr: sanitizeText(lsp.stderr, fixture.workspaceRoot),
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
