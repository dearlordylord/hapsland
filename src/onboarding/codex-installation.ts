import { currentCommand, commandEntrypoint, commandTokens, packageRootFromEntrypoint, expectedRuntimeVersion, commandFromEntrypoint, runtimeProbeArguments } from "../runtime/package-runtime.ts";
import { Config, Effect, Schema } from "effect";
import { execFileClosedStdin } from "./host-process.ts";
import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { isCodexHostVersion } from "../direct-event/model.ts";

import { withInstallationLock } from "./installation-lock.ts";
import {
  canonicalJson as stableJson,
  reconcileOwnedEvent,
  removeMarkedHandlers,
  retainedHookSubset,
} from "./hook-reconciliation.ts";

class CodexInstallationError extends Schema.TaggedError<CodexInstallationError>()("CodexInstallationError", {
  reason: Schema.NonEmptyString,
}) {
  override get message() {
    return this.reason;
  }
}

const OWNERSHIP_VERSION = 1 as const;
const RESULT_VERSION = 1 as const;
const OWNED_MARKER = "--review-tool-owned=codex-v1";
const COMPOSED_MARKER = "--review-tool-composed-owned=codex-v1";
const OWNED_MATCHER = "^(apply_patch|Edit|Write|Bash)$";
const PRODUCT_DIRECTORY = ".hapsland";

type JsonObject = { [key: string]: unknown };

class TargetPackageMetadataInvalid extends Error {}

export interface InstallationRequest {
  readonly codexHome?: string;
  readonly proposalDigest?: string;
  readonly codexExecutable?: string;
  readonly reinstall?: boolean;
}

interface FileSnapshot {
  readonly path: string;
  readonly exists: boolean;
  readonly content: string;
  readonly digest: string;
}

interface Mutation {
  readonly path: string;
  readonly beforeDigest: string;
  readonly beforeContent: string | null;
  readonly afterDigest: string;
  readonly afterContent: string | null;
  readonly description: string;
}

interface OwnershipRecord {
  readonly version: 1;
  readonly adapter: "codex";
  readonly codexHome: string;
  readonly runtimeVersion: string;
  readonly packageVersion: string;
  readonly residentProtocol: number;
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly marker: typeof OWNED_MARKER;
  readonly hookFingerprint: string;
  readonly hookGroups?: Record<string, unknown>;
  readonly composedFingerprints?: {
    readonly stop: string;
    readonly prompt: string;
    readonly subagentStop?: string;
    readonly preToolUse?: string;
  };
  readonly owned: ReadonlyArray<{
    readonly file: string;
    readonly kind: "feature" | "hook";
    readonly fingerprint: string;
  }>;
}

interface Journal {
  readonly version: 1;
  readonly operation: "install" | "update" | "uninstall";
  readonly proposalDigest: string;
  readonly completed: ReadonlyArray<number>;
  readonly reinstall?: boolean;
  readonly replacedJournalDigest?: string;
  readonly mutations: ReadonlyArray<Mutation>;
}

export type InstallationResult =
  JsonObject | { readonly version: 1; readonly operation: string; readonly status: string };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const HOOKS_FEATURE_FINGERPRINT = sha256("features.hooks=true");
const missingDigest = sha256("installation-v1:missing");
const digestSnapshot = (exists: boolean, content: string) =>
  exists ? sha256(`installation-v1:file\0${content}`) : missingDigest;

const snapshot = (path: string): FileSnapshot => {
  try {
    const content = readFileSync(path, "utf8");
    return { path, exists: true, content, digest: digestSnapshot(true, content) };
  } catch (cause) {
    if (isNodeError(cause, "ENOENT")) {
      return { path, exists: false, content: "", digest: missingDigest };
    }
    throw new Error(`configuration is unreadable: ${path}`);
  }
};

const isNodeError = (value: unknown, code: string) =>
  typeof value === "object" && value !== null && "code" in value && value.code === code;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = (file: FileSnapshot): JsonObject => {
  if (!file.exists) return {};
  let value: unknown;
  try {
    value = JSON.parse(file.content);
  } catch {
    throw new Error(`configuration is malformed JSON: ${file.path}`);
  }
  if (!isObject(value)) throw new Error(`configuration root must be an object: ${file.path}`);
  return value;
};

const quoteShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const ownedHook = (runtime: string, entrypoint: string, hostVersion = "0.155.1", controlledReviewer = false) => {
  const controlled = controlledReviewer ? " --controlled-reviewer" : "";
  const version = hostVersion === "0.155.1" ? "" : ` --codex-version=${hostVersion}`;
  return {
    type: "command",
    command: `${commandTokens(runtime, entrypoint).map(quoteShell).join(" ")} --codex-hook${controlled} --controlled-writer --composed-edit-hook ${OWNED_MARKER}${version}`,
    timeout: 10,
  };
};

const composedCommand = (
  runtime: string,
  entrypoint: string,
  hostVersion: string,
  kind: "background" | "stop" | "prompt" | "before-edit",
  controlledReviewer = false,
) => {
  const controlled = controlledReviewer ? " --controlled-reviewer" : "";
  const version = hostVersion === "0.155.1" ? "" : ` --codex-version=${hostVersion}`;
  const exec = kind === "before-edit" ? "exec " : "";
  return `${exec}${commandTokens(runtime, entrypoint).map(quoteShell).join(" ")} --composed-${kind}-hook --composed-host=codex-cli${controlled} ${COMPOSED_MARKER}${version}`;
};

const composedGroups = (runtime: string, entrypoint: string, hostVersion: string, controlledReviewer = false) => ({
  PreToolUse: {
    matcher: OWNED_MATCHER,
    hooks: [
      {
        type: "command",
        command: composedCommand(runtime, entrypoint, hostVersion, "before-edit", controlledReviewer),
        timeout: 5,
      },
    ],
  },
  Stop: {
    hooks: [
      {
        type: "command",
        command: composedCommand(runtime, entrypoint, hostVersion, "stop", controlledReviewer),
        timeout: 5,
      },
    ],
  },
  SubagentStop: {
    hooks: [
      {
        type: "command",
        command: composedCommand(runtime, entrypoint, hostVersion, "stop", controlledReviewer),
        timeout: 5,
      },
    ],
  },
  UserPromptSubmit: {
    hooks: [
      {
        type: "command",
        command: composedCommand(runtime, entrypoint, hostVersion, "prompt", controlledReviewer),
        timeout: 4,
      },
    ],
  },
});

const ownedGroup = (runtime: string, entrypoint: string, hostVersion = "0.155.1", controlledReviewer = false) => ({
  matcher: OWNED_MATCHER,
  hooks: [
    ownedHook(runtime, entrypoint, hostVersion, controlledReviewer),
    {
      type: "command",
      command: composedCommand(runtime, entrypoint, hostVersion, "background", controlledReviewer),
      timeout: 25,
      async: true,
    },
  ],
});

const hookFingerprint = (value: unknown) => sha256(`installation-v1:hook\0${stableJson(value)}`);

const markerCount = (value: unknown): number => {
  if (typeof value === "string") return value.includes(OWNED_MARKER) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce<number>((count, item) => count + markerCount(item), 0);
  if (isObject(value)) return Object.values(value).reduce<number>((count, item) => count + markerCount(item), 0);
  return 0;
};

const postToolUseGroups = (root: JsonObject): Array<unknown> => {
  if (!("hooks" in root)) return [];
  if (!isObject(root.hooks)) throw new Error("hooks.json field 'hooks' must be an object");
  const post = root.hooks.PostToolUse;
  if (post === undefined) return [];
  if (!Array.isArray(post)) throw new Error("hooks.json PostToolUse must be an array");
  return post;
};

const withComposedGroups = (
  root: JsonObject,
  target: ReturnType<typeof composedGroups> | undefined,
  expected: OwnershipRecord["composedFingerprints"],
  restoreMissing = false,
  expectedGroups?: Record<string, unknown>,
): JsonObject => {
  let next = root;
  for (const [event, key] of [
    ["PreToolUse", "preToolUse"],
    ["Stop", "stop"],
    ["SubagentStop", "subagentStop"],
    ["UserPromptSubmit", "prompt"],
  ] as const) {
    next = reconcileOwnedEvent(next, event, target?.[event], {
      marker: COMPOSED_MARKER,
      fingerprint: hookFingerprint,
      expectedFingerprint: expected?.[key],
      expectedGroup: expectedGroups?.[event],
      restoreMissing,
      label: "Codex",
    });
  }
  return next;
};

const addOwnedHook = (root: JsonObject, group: unknown): JsonObject => {
  const count = markerCount(root);
  if (count > 1) throw new Error("duplicate owned Codex hook representations require manual reconciliation");
  if (count === 1) return root;
  const hooks = root.hooks === undefined ? {} : root.hooks;
  if (!isObject(hooks)) throw new Error("hooks.json field 'hooks' must be an object");
  const groups = postToolUseGroups(root);
  return {
    ...root,
    hooks: {
      ...hooks,
      PostToolUse: [...groups, group],
    },
  };
};

const isOwnedPostGroup = (group: unknown) => markerCount(group) > 0 || stableJson(group).includes(COMPOSED_MARKER);

const replaceOwnedHook = (root: JsonObject, group: unknown): JsonObject => {
  if (!postToolUseGroups(root).some(isOwnedPostGroup)) return addOwnedHook(root, group);
  const hooks = root.hooks;
  if (!isObject(hooks)) throw new Error("owned Codex hook is missing or locally modified");
  const groups = postToolUseGroups(root);
  const ownedIndexes = groups.flatMap((candidate, index) => (isOwnedPostGroup(candidate) ? [index] : []));
  if (ownedIndexes.length !== 1) throw new Error("owned Codex hook is missing, duplicated, or locally modified");
  const ownedIndex = ownedIndexes[0];
  if (ownedIndex === undefined) throw new Error("owned Codex hook is missing");
  return {
    ...root,
    hooks: {
      ...hooks,
      PostToolUse: groups.map((candidate, index) => (index === ownedIndex ? group : candidate)),
    },
  };
};

const validatedRemovalIndex = (
  ownedIndexes: ReadonlyArray<number>,
  groups: ReadonlyArray<unknown>,
  expectedFingerprint: string,
  expectedGroup: unknown,
) => {
  const index = ownedIndexes[0];
  if (
    index === undefined ||
    (hookFingerprint(groups[index]) !== expectedFingerprint && !retainedHookSubset(groups[index], expectedGroup))
  ) {
    throw new Error("owned Codex hook was locally modified; reconcile it before uninstalling");
  }
  return index;
};

const removeOwnedHook = (root: JsonObject, expectedFingerprint: string, expectedGroup?: unknown): JsonObject => {
  if (!postToolUseGroups(root).some(isOwnedPostGroup)) return root;
  const hooks = root.hooks;
  if (!isObject(hooks)) throw new Error("owned Codex hook is missing or locally modified");
  const groups = postToolUseGroups(root);
  const ownedIndexes = groups.flatMap((group, index) => (isOwnedPostGroup(group) ? [index] : []));
  if (ownedIndexes.length !== 1) throw new Error("owned Codex hook is missing, duplicated, or locally modified");
  const index = validatedRemovalIndex(ownedIndexes, groups, expectedFingerprint, expectedGroup);
  const nextGroups = groups.filter((_, candidate) => candidate !== index);
  const nextHooks = { ...hooks };
  if (nextGroups.length === 0) delete nextHooks.PostToolUse;
  else nextHooks.PostToolUse = nextGroups;
  const next = { ...root };
  if (Object.keys(nextHooks).length === 0) delete next.hooks;
  else next.hooks = nextHooks;
  return next;
};

const validateToml = (file: FileSnapshot): JsonObject => {
  if (!file.exists || file.content.trim() === "") return {};
  try {
    const parsed = parseToml(file.content);
    if (!isObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error(`configuration is malformed TOML: ${file.path}`);
  }
};

interface TomlLine {
  readonly start: number;
  readonly contentEnd: number;
  readonly end: number;
  readonly text: string;
  readonly syntactic: boolean;
}

type MultilineDelimiter = '"""' | "'''" | undefined;

const tomlDelimiterAt = (line: string, index: number): MultilineDelimiter => {
  if (line.startsWith('"""', index)) return '"""';
  if (line.startsWith("'''", index)) return "'''";
  return undefined;
};
const isTomlQuote = (character: string | undefined): character is '"' | "'" => character === '"' || character === "'";
const isTomlTerminator = (line: string, index: number, delimiter: string) =>
  line.startsWith(delimiter, index) && (delimiter.startsWith("'") || index === 0 || line[index - 1] !== "\\");
const advanceTomlMultiline = (line: string, index: number, multiline: Exclude<MultilineDelimiter, undefined>) =>
  isTomlTerminator(line, index, multiline) ? { index: index + 2, multiline: undefined } : { index, multiline };
const advanceTomlQuote = (line: string, index: number, quote: '"' | "'") =>
  isTomlTerminator(line, index, quote) ? undefined : quote;

const advanceTomlStringState = (line: string, initial: MultilineDelimiter): MultilineDelimiter => {
  let multiline = initial;
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < line.length; index += 1) {
    if (multiline !== undefined) {
      ({ index, multiline } = advanceTomlMultiline(line, index, multiline));
      continue;
    }
    const character = line[index];
    if (quote !== undefined) {
      quote = advanceTomlQuote(line, index, quote);
      continue;
    }
    if (character === "#") break;
    const delimiter = tomlDelimiterAt(line, index);
    if (delimiter !== undefined) {
      multiline = delimiter;
      index += 2;
      continue;
    }
    if (isTomlQuote(character)) quote = character;
  }
  return multiline;
};

const tomlLines = (content: string): ReadonlyArray<TomlLine> => {
  const lines: Array<TomlLine> = [];
  let offset = 0;
  let multiline: MultilineDelimiter;
  while (offset < content.length) {
    const newline = content.indexOf("\n", offset);
    const end = newline < 0 ? content.length : newline + 1;
    const contentEnd =
      newline < 0 ? content.length : newline > offset && content[newline - 1] === "\r" ? newline - 1 : newline;
    const text = content.slice(offset, contentEnd);
    const syntactic = multiline === undefined;
    lines.push({ start: offset, contentEnd, end, text, syntactic });
    multiline = advanceTomlStringState(text, multiline);
    offset = end;
  }
  return lines;
};

const tableHeader = (line: string): "features" | "other" | undefined => {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("[")) return undefined;
  try {
    const parsed = parseToml(`${line}\n__review_tool_probe__ = true\n`);
    return isObject(parsed.features) && parsed.features.__review_tool_probe__ === true ? "features" : "other";
  } catch {
    return "other";
  }
};

const isHooksAssignment = (line: string): boolean => {
  try {
    const parsed = parseToml(`["features"]\n${line}\n`);
    return isObject(parsed.features) && "hooks" in parsed.features;
  } catch {
    return false;
  }
};

const locateFeaturesSyntax = (content: string) => {
  let inFeatures = false;
  let header: TomlLine | undefined;
  let hooks: TomlLine | undefined;
  for (const line of tomlLines(content)) {
    if (!line.syntactic) continue;
    const table = tableHeader(line.text);
    if (table !== undefined) {
      inFeatures = table === "features";
      if (inFeatures) header = line;
      continue;
    }
    if (inFeatures && isHooksAssignment(line.text)) hooks = line;
  }
  return { header, hooks };
};

const hooksFeature = (parsed: unknown) => {
  const features = isObject(parsed) ? parsed.features : undefined;
  return isObject(features) ? features.hooks : undefined;
};

const insertHooksFeature = (content: string): string => {
  const syntax = locateFeaturesSyntax(content);
  if (syntax.header === undefined) {
    const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
    return `${content}${separator}${content.length === 0 ? "" : "\n"}[features]\nhooks = true\n`;
  }
  const newline = content.slice(syntax.header.contentEnd, syntax.header.end) || "\n";
  return `${content.slice(0, syntax.header.contentEnd)}${newline}hooks = true${content.slice(syntax.header.contentEnd)}`;
};

const assertHooksSemanticState = (content: string, expected: true | "absent") => {
  let parsed: unknown;
  try {
    parsed = parseToml(content);
  } catch {
    throw new Error("generated config.toml is invalid; no configuration was written");
  }
  const hooks = hooksFeature(parsed);
  if ((expected === true && hooks !== true) || (expected === "absent" && hooks !== undefined)) {
    throw new Error("generated config.toml does not have the required hooks feature state");
  }
};

const enableHooksFeature = (file: FileSnapshot): string => {
  const parsed = validateToml(file);
  const features = parsed.features;
  if (features !== undefined && !isObject(features)) {
    throw new Error("config.toml [features] must be a table");
  }
  const current = isObject(features) ? features.hooks : undefined;
  if (current === false) {
    throw new Error("Codex hooks are explicitly disabled; installation will not override user or managed policy");
  }
  if (current === true) return file.content;
  if (current !== undefined) throw new Error("config.toml features.hooks must be a boolean");
  const next = insertHooksFeature(file.content);
  assertHooksSemanticState(next, true);
  return next;
};

const disableOwnedFeature = (content: string): string => {
  const hooks = locateFeaturesSyntax(content).hooks;
  if (hooks === undefined) throw new Error("owned Codex feature entry is missing or locally modified");
  const next = `${content.slice(0, hooks.start)}${content.slice(hooks.end)}`;
  assertHooksSemanticState(next, "absent");
  return next;
};

const ComposedFingerprints = Schema.Struct({
  stop: Schema.String,
  prompt: Schema.String,
  subagentStop: Schema.optional(Schema.String),
  preToolUse: Schema.optional(Schema.String),
});

const OwnershipRecordShape = Schema.Struct({
  version: Schema.Literal(1),
  adapter: Schema.Literal("codex"),
  codexHome: Schema.String,
  runtimeVersion: Schema.String,
  packageVersion: Schema.String,
  residentProtocol: Schema.Literal(1),
  executable: Schema.String,
  args: Schema.Array(Schema.String),
  marker: Schema.Literal(OWNED_MARKER),
  hookFingerprint: Schema.String,
  hookGroups: Schema.optional(Schema.Unknown),
  composedFingerprints: Schema.optional(ComposedFingerprints),
  owned: Schema.Array(Schema.Unknown),
});

const OwnedEntry = Schema.Struct({
  file: Schema.String,
  kind: Schema.Literals(["feature", "hook"]),
  fingerprint: Schema.String,
});

const decodeOwnershipRecord = (value: unknown) => {
  try {
    return Schema.decodeUnknownSync(OwnershipRecordShape)(value);
  } catch {
    throw new Error("installation ownership record has an unsupported shape or version");
  }
};

const decodeOwnedEntry = (value: unknown) => {
  try {
    return Schema.decodeUnknownSync(OwnedEntry)(value);
  } catch {
    throw new Error("installation ownership record has an unsupported owned-entry shape");
  }
};

const readOwnership = (path: string): OwnershipRecord | undefined => {
  const file = snapshot(path);
  if (!file.exists) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    throw new Error("installation ownership record is malformed");
  }
  const value = decodeOwnershipRecord(parsed);
  return {
    version: 1,
    adapter: "codex",
    codexHome: value.codexHome,
    runtimeVersion: value.runtimeVersion,
    packageVersion: value.packageVersion,
    residentProtocol: 1,
    executable: value.executable,
    args: value.args,
    marker: OWNED_MARKER,
    hookFingerprint: value.hookFingerprint,
    ...(isObject(value.hookGroups) ? { hookGroups: value.hookGroups } : {}),
    ...(value.composedFingerprints === undefined
      ? {}
      : {
          composedFingerprints: {
            stop: value.composedFingerprints.stop,
            prompt: value.composedFingerprints.prompt,
            ...(value.composedFingerprints.subagentStop === undefined
              ? {}
              : { subagentStop: value.composedFingerprints.subagentStop }),
            ...(value.composedFingerprints.preToolUse === undefined
              ? {}
              : { preToolUse: value.composedFingerprints.preToolUse }),
          },
        }),
    owned: value.owned.map(decodeOwnedEntry),
  };
};

const reinstallDigest = (baseDigest: string, replacedJournalDigest?: string) =>
  replacedJournalDigest === undefined
    ? baseDigest
    : sha256(stableJson({ version: 1, baseDigest, replacedJournalDigest }));

const pathsFor = (home: string) => ({
  config: join(home, "config.toml"),
  hooks: join(home, "hooks.json"),
  product: join(home, PRODUCT_DIRECTORY),
  ownership: join(home, PRODUCT_DIRECTORY, "installation-v1.json"),
  journal: join(home, PRODUCT_DIRECTORY, "journal-v1.json"),
  lock: join(home, PRODUCT_DIRECTORY, "installation.lock"),
});

const atomicWrite = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
};

const atomicRemove = (path: string) => {
  try {
    unlinkSync(path);
  } catch (cause) {
    if (!isNodeError(cause, "ENOENT")) throw cause;
  }
};

const encodeJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const mutation = (file: FileSnapshot, afterContent: string | null, description: string): Mutation => ({
  path: file.path,
  beforeDigest: file.digest,
  beforeContent: file.exists ? file.content : null,
  afterDigest: afterContent === null ? missingDigest : digestSnapshot(true, afterContent),
  afterContent,
  description,
});

const installationDigest = (
  operation: "install" | "update" | "uninstall",
  home: string,
  mutations: ReadonlyArray<Mutation>,
) =>
  sha256(
    stableJson({
      version: 1,
      operation,
      adapter: "codex",
      home,
      changes: mutations.map(({ path, beforeDigest, afterDigest, description }) => ({
        path,
        beforeDigest,
        afterDigest,
        description,
      })),
    }),
  );

const codexCompatibility = (observed: string, versions: ReadonlyArray<string>, hooksAvailable: boolean) => {
  const version = /^codex-cli (\d+\.\d+\.\d+)$/.exec(observed)?.[1] ?? "unavailable";
  return {
    supported: isCodexHostVersion(version) && hooksAvailable,
    hooksAvailable,
    tested: versions.includes(version),
    observed,
    version,
    required: "Codex CLI with lifecycle hooks and a stable semantic version",
    testedVersions: versions,
  };
};

const pathReadiness = (path: string, executable: boolean) => {
  try {
    const metadata = statSync(path);
    accessSync(path, executable ? constants.R_OK | constants.X_OK : constants.R_OK);
    return { ready: metadata.isFile(), observed: metadata.isFile() ? "regular-file" : "not-a-regular-file" };
  } catch (cause) {
    return {
      ready: false,
      observed: isNodeError(cause, "ENOENT") ? "missing" : "unreadable",
    };
  }
};

const packagedRuntimeEntrypoints = (entrypoint: string) => {
  const extension = extname(entrypoint);
  if (extension === ".js" || extension === ".ts") {
    return {
      parser: join(dirname(entrypoint), `parser-main${extension}`),
      resident: join(dirname(entrypoint), "resident", `main${extension}`),
    };
  }
  return {
    parser: join(dirname(entrypoint), "hapsland-parser"),
    resident: join(dirname(entrypoint), "hapsland-resident"),
  };
};

const RuntimeObservation = Schema.Struct({
  version: Schema.String,
  platform: Schema.String,
  architecture: Schema.String,
});
type RuntimeProbe = {
  readonly ready: boolean;
  readonly observed: string | Schema.Schema.Type<typeof RuntimeObservation>;
};
const probeRuntime = Effect.fn("CodexInstallation.probeRuntime")(function* (executable: string) {
  const readiness = yield* Effect.sync(() => pathReadiness(executable, true));
  if (!readiness.ready) return { ready: false, observed: readiness.observed } satisfies RuntimeProbe;
  const probe = yield* execFileClosedStdin(
    executable,
    runtimeProbeArguments(executable),
    { env: process.env, timeout: 2_000, maxBuffer: 16_384 },
  );
  if (!probe.succeeded)
    return {
      ready: false,
      observed: probe.timedOut ? "timed-out" : "not-a-supported-runtime",
    } satisfies RuntimeProbe;
  const observed = yield* Effect.try({
    try: (): unknown => JSON.parse(probe.stdout),
    catch: () => "invalid-runtime-json",
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(RuntimeObservation)), Effect.result);
  return observed._tag === "Success"
    ? ({ ready: true, observed: observed.success } satisfies RuntimeProbe)
    : ({ ready: false, observed: "not-a-supported-runtime" } satisfies RuntimeProbe);
});

const runtimeIdentityChecks = (inputs: ReturnType<typeof buildInputs>, runtimeProbe: RuntimeProbe) => {
  const observedRuntime = isObject(runtimeProbe.observed) ? runtimeProbe.observed : undefined;
  const requiredVersion = expectedRuntimeVersion(inputs.entrypoint);
  const declaredPlatforms = [...new Set(inputs.runtimeProfiles.map(({ operatingSystem }) => operatingSystem))];
  const declaredArchitectures = [...new Set(inputs.runtimeProfiles.map(({ architecture }) => architecture))];
  const declaredProfile = inputs.runtimeProfiles.some(
    ({ operatingSystem, architecture }) =>
      operatingSystem === observedRuntime?.platform && architecture === observedRuntime?.architecture,
  );
  return {
    engine: {
      ready: runtimeProbe.ready && observedRuntime?.version === requiredVersion,
      observed: observedRuntime?.version ?? runtimeProbe.observed,
      required: requiredVersion,
    },
    platform: {
      ready: runtimeProbe.ready && declaredProfile,
      observed: observedRuntime?.platform ?? runtimeProbe.observed,
      required: declaredPlatforms.join(", "),
    },
    architecture: {
      ready: runtimeProbe.ready && declaredProfile,
      observed: observedRuntime?.architecture ?? runtimeProbe.observed,
      required: declaredArchitectures.join(", "),
    },
  };
};

const runtimeCompatibility = (inputs: ReturnType<typeof buildInputs>) => {
  const executable = pathReadiness(inputs.executable, true);
  const entrypoint = pathReadiness(inputs.entrypoint, false);
  const runtimeProbe = executable.ready ? inputs.runtimeProbe : { ready: false, observed: executable.observed };
  const packaged = packagedRuntimeEntrypoints(inputs.entrypoint);
  const parser = pathReadiness(packaged.parser, false);
  const resident = pathReadiness(packaged.resident, false);
  const checks = {
    runtime: { ...executable, path: inputs.executable },
    entrypoint: { ...entrypoint, path: inputs.entrypoint },
    parser: { ...parser, path: packaged.parser },
    resident: { ...resident, path: packaged.resident },
    ...runtimeIdentityChecks(inputs, runtimeProbe),
  };
  return {
    supported: Object.values(checks).every((check) => check.ready),
    checks,
  };
};

const compatibility = (inputs: ReturnType<typeof buildInputs>) => {
  const codex = inputs.codex;
  const runtime = runtimeCompatibility(inputs);
  return { supported: codex.supported && runtime.supported, codex, runtime };
};

const unsupportedResult = (
  operation: "install" | "install-preview" | "update" | "update-preview",
  inputs: ReturnType<typeof buildInputs>,
  host: ReturnType<typeof compatibility>,
) => ({
  version: RESULT_VERSION,
  operation,
  status: "unsupported",
  host: { adapter: "codex", home: inputs.home, compatibility: host },
  completed: [],
  pending: ["install the declared runtime, packaged entrypoint, and a declared Codex CLI version before mutation"],
});

const PackageManifest = Schema.Struct({ version: Schema.NonEmptyString });
const PackageRuntimeDeclaration = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  runtime: Schema.Struct({ name: Schema.Literals(["bun", "node"]), version: Schema.String }),
  profiles: Schema.NonEmptyArray(Schema.Unknown),
  residentProtocol: Schema.Literal(1),
  codex: Schema.optional(Schema.Unknown),
});
const RuntimeProfile = Schema.Struct({ operatingSystem: Schema.String, architecture: Schema.String });
const DeclaredCodex = Schema.Struct({ testedVersions: Schema.NonEmptyArray(Schema.String) });

const packageVersionAt = (root: string) => {
  const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  try {
    return Schema.decodeUnknownSync(PackageManifest)(manifest).version;
  } catch {
    throw new Error("package.json must declare a nonempty version");
  }
};

const packageRuntimeAt = (root: string) => {
  const declaration: unknown = JSON.parse(readFileSync(join(root, "package-runtime.json"), "utf8"));
  try {
    return Schema.decodeUnknownSync(PackageRuntimeDeclaration)(declaration);
  } catch {
    throw new Error("package-runtime.json must declare the embedded runtime, nonempty profiles, and residentProtocol 1");
  }
};

const decodeRuntimeProfile = (profile: unknown) => {
  try {
    return Schema.decodeUnknownSync(RuntimeProfile)(profile);
  } catch {
    throw new Error("package-runtime.json contains an invalid runtime profile");
  }
};

const declaredCodexVersions = (codex: unknown): ReadonlyArray<string> => {
  if (codex === undefined) return ["0.155.1"];
  try {
    const { testedVersions } = Schema.decodeUnknownSync(DeclaredCodex)(codex);
    if (!testedVersions.every(isCodexHostVersion)) throw new Error("unsupported");
    return testedVersions;
  } catch {
    throw new Error("package-runtime.json declares unsupported Codex versions");
  }
};

interface PackageMetadata {
  packageVersion: string;
  residentProtocol: number;
  runtimeVersion: string;
  codexVersions: ReadonlyArray<string>;
  runtimeProfiles: ReadonlyArray<{ readonly operatingSystem: string; readonly architecture: string }>;
  packageMetadata: { readonly ready: true } | { readonly ready: false; readonly reason: string };
}

const readPackageMetadata = (root: string): PackageMetadata => {
  const metadata: PackageMetadata = {
    packageVersion: "development",
    residentProtocol: 1,
    runtimeVersion: "unsupported",
    codexVersions: ["0.155.1"],
    runtimeProfiles: [],
    packageMetadata: { ready: true },
  };
  try {
    metadata.packageVersion = packageVersionAt(root);
    const declaration = packageRuntimeAt(root);
    const profiles = declaration.profiles.map(decodeRuntimeProfile);
    metadata.residentProtocol = declaration.residentProtocol;
    metadata.runtimeVersion = declaration.runtime.version;
    metadata.codexVersions = declaredCodexVersions(declaration.codex);
    metadata.runtimeProfiles = profiles;
  } catch (cause) {
    metadata.packageMetadata = {
      ready: false,
      reason: cause instanceof Error ? cause.message : "package metadata is unreadable",
    };
  }
  return metadata;
};

const resolvedEntrypoint = (entrypoint: string) => {
  const requested = resolve(entrypoint);
  try {
    return realpathSync(requested);
  } catch {
    return requested;
  } // Compatibility reports the missing path without creating state.
};

const buildInputs = (
  request: InstallationRequest,
  configured: {
    readonly home: string;
    readonly executable: string;
    readonly entrypoint: string;
    readonly controlledReviewer: boolean;
    readonly failAfterWrites: number;
    readonly hostObserved: string;
    readonly hooksAvailable: boolean;
    readonly runtimeProbe: RuntimeProbe;
  },
) => {
  const home = resolve(configured.home);
  const executable = resolve(configured.executable);
  const entrypoint = resolvedEntrypoint(configured.entrypoint);
  const { codexVersions, ...metadata } = readPackageMetadata(packageRootFromEntrypoint(entrypoint));
  return {
    home,
    executable,
    entrypoint,
    codexExecutable: request.codexExecutable ?? "codex",
    controlledReviewer: configured.controlledReviewer,
    failAfterWrites: configured.failAfterWrites,
    codex: codexCompatibility(configured.hostObserved, codexVersions, configured.hooksAvailable),
    runtimeProbe: configured.runtimeProbe,
    ...metadata,
    paths: pathsFor(home),
  };
};

const resolveInputs = Effect.fn("CodexInstallation.inputs")(
  function* (request: InstallationRequest) {
    const home =
      request.codexHome ??
      (yield* Config.NonEmptyString("CODEX_HOME").pipe(Config.withDefault(join(homedir(), ".codex"))));
    const executable = yield* Config.NonEmptyString("REVIEW_INSTALL_RUNTIME").pipe(
      Config.withDefault(currentCommand().executable),
    );
    const entrypoint = yield* Config.NonEmptyString("REVIEW_INSTALL_ENTRYPOINT").pipe(
      Config.withDefault(commandEntrypoint(currentCommand())),
    );
    const controlled = yield* Config.NonEmptyString("REVIEW_INSTALL_CONTROLLED").pipe(Config.withDefault("0"));
    const failAfterWrites = yield* Config.Int("REVIEW_INSTALL_FAIL_AFTER_WRITES").pipe(Config.withDefault(-1));
    const host = yield* execFileClosedStdin(request.codexExecutable ?? "codex", ["--version"], {
      env: process.env,
      timeout: 2_000,
      maxBuffer: 1_048_576,
    });
    const features = yield* execFileClosedStdin(request.codexExecutable ?? "codex", ["features", "list"], {
      env: process.env, timeout: 2_000, maxBuffer: 1_048_576,
    });
    const runtimeProbe = yield* probeRuntime(resolve(executable));
    return yield* Effect.try({
      try: () =>
        buildInputs(request, {
          home,
          executable,
          entrypoint,
          controlledReviewer: controlled === "1",
          failAfterWrites,
          hostObserved: host.succeeded ? host.stdout.trim() : "unavailable",
          hooksAvailable: features.succeeded && /^hooks\s+\S+\s+(?:true|false)\s*$/m.test(features.stdout),
          runtimeProbe,
        }),
      catch: () => new CodexInstallationError({ reason: "Codex installation inputs unavailable" }),
    });
  },
  Effect.mapError(() => new CodexInstallationError({ reason: "Codex installation configuration is invalid" })),
);

const requireTargetPackageMetadata = (inputs: ReturnType<typeof buildInputs>) => {
  if (!inputs.packageMetadata.ready) {
    throw new TargetPackageMetadataInvalid(
      `target package metadata is missing or malformed: ${inputs.packageMetadata.reason}`,
    );
  }
};

const makeOwnershipRecord = (
  inputs: ReturnType<typeof buildInputs>,
  fingerprint: string,
  featureOwned: boolean,
): OwnershipRecord => ({
  version: OWNERSHIP_VERSION,
  adapter: "codex",
  codexHome: inputs.home,
  runtimeVersion: expectedRuntimeVersion(inputs.entrypoint),
  packageVersion: inputs.packageVersion,
  residentProtocol: inputs.residentProtocol,
  ...commandFromEntrypoint(inputs.executable, inputs.entrypoint),
  marker: OWNED_MARKER,
  hookFingerprint: fingerprint,
  hookGroups: {
    PostToolUse: ownedGroup(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer),
    ...composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer),
  },
  composedFingerprints: {
    preToolUse: hookFingerprint(
      composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer).PreToolUse,
    ),
    stop: hookFingerprint(
      composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer).Stop,
    ),
    subagentStop: hookFingerprint(
      composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer)
        .SubagentStop,
    ),
    prompt: hookFingerprint(
      composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer)
        .UserPromptSubmit,
    ),
  },
  owned: [
    ...(featureOwned
      ? [{ file: inputs.paths.config, kind: "feature" as const, fingerprint: HOOKS_FEATURE_FINGERPRINT }]
      : []),
    { file: inputs.paths.hooks, kind: "hook", fingerprint },
  ],
});

const existingInstallOwnership = (path: string, reinstall: boolean | undefined) => {
  try {
    return readOwnership(path);
  } catch (cause) {
    if (!reinstall) throw cause;
    return undefined;
  }
};

const validateRecordedInstallHook = (
  hookRoot: Record<string, unknown>,
  record: OwnershipRecord,
  home: string,
  reinstall: boolean | undefined,
) => {
  if (record.codexHome !== home) throw new Error("ownership record targets another Codex home");
  const group = postToolUseGroups(hookRoot).find(isOwnedPostGroup);
  if (
    !reinstall &&
    group !== undefined &&
    hookFingerprint(group) !== record.hookFingerprint &&
    !retainedHookSubset(group, record.hookGroups?.PostToolUse)
  ) {
    throw new Error("owned Codex hook was locally modified; reconcile before reinstalling");
  }
};

const validateInstallOwnership = (
  hookRoot: Record<string, unknown>,
  record: OwnershipRecord | undefined,
  home: string,
  reinstall: boolean | undefined,
) => {
  const count = markerCount(hookRoot);
  if (count > 1 || postToolUseGroups(hookRoot).filter(isOwnedPostGroup).length > 1) {
    throw new Error("duplicate owned Codex hook representations require manual reconciliation");
  }
  if (record !== undefined) return validateRecordedInstallHook(hookRoot, record, home, reinstall);
  if (count !== 0 || postToolUseGroups(hookRoot).some(isOwnedPostGroup)) {
    throw new Error("an unrecorded owned-marker hook requires manual reconciliation");
  }
};

const installFeatureOwned = (record: OwnershipRecord | undefined, config: FileSnapshot, nextConfig: string) =>
  (record?.owned.some((entry) => entry.kind === "feature" && entry.file === config.path) ?? false) ||
  nextConfig !== config.content;

const installMutations = (
  config: FileSnapshot,
  hooks: FileSnapshot,
  ownership: FileSnapshot,
  nextConfig: string,
  nextHooks: string,
  nextOwnership: string,
  resetJournal: FileSnapshot | undefined,
) => [
  ...(nextConfig === config.content ? [] : [mutation(config, nextConfig, "enable Codex's native hooks feature")]),
  ...(nextHooks === hooks.content ? [] : [mutation(hooks, nextHooks, "append the owned PostToolUse adapter hook")]),
  ...(nextOwnership === ownership.content &&
  nextHooks === hooks.content &&
  nextConfig === config.content &&
  resetJournal?.exists !== true
    ? []
    : [mutation(ownership, nextOwnership, "write the versioned ownership record")]),
];

const makeInstallPlan = (request: InstallationRequest, inputs: ReturnType<typeof buildInputs>) => {
  const config = snapshot(inputs.paths.config);
  const hooks = snapshot(inputs.paths.hooks);
  const ownership = snapshot(inputs.paths.ownership);
  const resetJournal = request.reinstall ? snapshot(inputs.paths.journal) : undefined;
  const existingRecord = existingInstallOwnership(inputs.paths.ownership, request.reinstall);
  const group = ownedGroup(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer);
  const fingerprint = hookFingerprint(group);
  const originalRoot = parseJsonObject(hooks);
  const hookRoot = request.reinstall
    ? removeMarkedHandlers(originalRoot, [OWNED_MARKER, COMPOSED_MARKER])
    : originalRoot;
  validateInstallOwnership(hookRoot, existingRecord, inputs.home, request.reinstall);
  const nextConfig = enableHooksFeature(config);

  const nextHooksRoot =
    existingRecord === undefined ? addOwnedHook(hookRoot, group) : replaceOwnedHook(hookRoot, group);
  const nextHooks = encodeJson(
    withComposedGroups(
      nextHooksRoot,
      composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer),
      request.reinstall ? undefined : existingRecord?.composedFingerprints,
      true,
      existingRecord?.hookGroups,
    ),
  );
  const featureOwned = installFeatureOwned(existingRecord, config, nextConfig);
  const record = makeOwnershipRecord(inputs, fingerprint, featureOwned);
  const nextOwnership = encodeJson(record);
  const mutations = installMutations(config, hooks, ownership, nextConfig, nextHooks, nextOwnership, resetJournal);
  return {
    inputs,
    mutations,
    resetJournal,
    digest: reinstallDigest(
      installationDigest("install", inputs.home, mutations),
      resetJournal?.exists ? resetJournal.digest : undefined,
    ),
    alreadyInstalled: mutations.length === 0,
  };
};

const updateOwnership = (inputs: ReturnType<typeof buildInputs>) => {
  const record = readOwnership(inputs.paths.ownership);
  if (record === undefined) throw new Error("no owned Codex installation exists; run install first");
  if (record.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home");
  return record;
};

const updateOwnedFeature = (record: OwnershipRecord, inputs: ReturnType<typeof buildInputs>) => {
  const ownedFeature = record.owned.find((entry) => entry.kind === "feature" && entry.file === inputs.paths.config);
  if (ownedFeature !== undefined && ownedFeature.fingerprint !== HOOKS_FEATURE_FINGERPRINT)
    throw new Error("owned Codex feature record was locally modified");
  return ownedFeature;
};

const validateUpdateHook = (hookRoot: Record<string, unknown>, record: OwnershipRecord) => {
  const currentGroup = postToolUseGroups(hookRoot).find(isOwnedPostGroup);
  if (
    postToolUseGroups(hookRoot).filter(isOwnedPostGroup).length > 1 ||
    markerCount(hookRoot) > 1 ||
    (currentGroup !== undefined &&
      hookFingerprint(currentGroup) !== record.hookFingerprint &&
      !retainedHookSubset(currentGroup, record.hookGroups?.PostToolUse))
  ) {
    throw new Error("owned Codex hook was locally modified; the installed version was preserved");
  }
};

const makeUpdatePlan = (request: InstallationRequest, inputs: ReturnType<typeof buildInputs>) => {
  requireTargetPackageMetadata(inputs);
  const record = updateOwnership(inputs);
  const config = snapshot(inputs.paths.config);
  const parsedConfig = validateToml(config);
  const ownedFeature = updateOwnedFeature(record, inputs);
  const nextConfig = enableHooksFeature(config);
  const hooks = snapshot(inputs.paths.hooks);
  const hookRoot = parseJsonObject(hooks);
  validateUpdateHook(hookRoot, record);
  const targetGroup = ownedGroup(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer);
  const targetFingerprint = hookFingerprint(targetGroup);
  const nextHooks = encodeJson(
    withComposedGroups(
      replaceOwnedHook(hookRoot, targetGroup),
      composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer),
      record.composedFingerprints,
      true,
      record.hookGroups,
    ),
  );
  const ownership = snapshot(inputs.paths.ownership);
  const nextOwnership = encodeJson(
    makeOwnershipRecord(inputs, targetFingerprint, ownedFeature !== undefined || nextConfig !== config.content),
  );
  const mutations = [
    // Recording the target first retains the previous working hook if a later
    // per-file write fails. The journal reports and safely resumes this exact state.
    ...(nextOwnership === ownership.content && nextHooks === hooks.content && nextConfig === config.content
      ? []
      : [mutation(ownership, nextOwnership, "record the target packaged runtime")]),
    ...(nextConfig === config.content ? [] : [mutation(config, nextConfig, "enable Codex's native hooks feature")]),
    ...(nextHooks === hooks.content
      ? []
      : [mutation(hooks, nextHooks, "replace only the owned PostToolUse adapter hook")]),
  ];
  return {
    inputs,
    record,
    mutations,
    digest: installationDigest("update", inputs.home, mutations),
    alreadyCurrent: mutations.length === 0,
  };
};

const validateOwnedFeatureRemoval = (
  record: OwnershipRecord,
  inputs: ReturnType<typeof buildInputs>,
  parsedConfig: JsonObject,
) => {
  const feature = record.owned.find((entry) => entry.kind === "feature" && entry.file === inputs.paths.config);
  if (feature === undefined) return false;
  const features = parsedConfig.features;
  if (
    feature.fingerprint !== HOOKS_FEATURE_FINGERPRINT ||
    (isObject(features) && features.hooks !== undefined && features.hooks !== true)
  ) {
    throw new Error("owned Codex feature value was locally modified; it was preserved");
  }
  return true;
};

const unrelatedHooksRemain = (root: JsonObject) =>
  markerCount(root) === 0 &&
  isObject(root.hooks) &&
  Object.values(root.hooks).some((value) => Array.isArray(value) && value.length > 0);

const uninstallConfig = (config: FileSnapshot, parsed: JsonObject, featureOwned: boolean, hookRoot: JsonObject) => {
  const unrelated = unrelatedHooksRemain(hookRoot);
  return featureOwned && isObject(parsed.features) && parsed.features.hooks === true && !unrelated
    ? disableOwnedFeature(config.content)
    : config.content;
};

const makeUninstallPlan = (request: InstallationRequest, inputs: ReturnType<typeof buildInputs>) => {
  const record = readOwnership(inputs.paths.ownership);
  if (record === undefined) {
    withComposedGroups(parseJsonObject(snapshot(inputs.paths.hooks)), undefined, undefined);
    return {
      inputs,
      mutations: [] as Array<Mutation>,
      digest: installationDigest("uninstall", inputs.home, []),
      alreadyRemoved: true,
    };
  }
  if (record.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home");
  const config = snapshot(inputs.paths.config);
  const hooks = snapshot(inputs.paths.hooks);
  const ownership = snapshot(inputs.paths.ownership);
  const parsedConfig = validateToml(config);
  const hookRoot = parseJsonObject(hooks);
  const nextHookRoot = withComposedGroups(
    removeOwnedHook(hookRoot, record.hookFingerprint, record.hookGroups?.PostToolUse),
    undefined,
    record.composedFingerprints,
    true,
    record.hookGroups,
  );
  const nextHooks = encodeJson(nextHookRoot);
  const featureWasOwned = validateOwnedFeatureRemoval(record, inputs, parsedConfig);
  const nextConfig = uninstallConfig(config, parsedConfig, featureWasOwned, nextHookRoot);
  const mutations = [
    ...(nextConfig === config.content
      ? []
      : [mutation(config, nextConfig, "remove the owned Codex hooks feature entry")]),
    ...(nextHooks === hooks.content
      ? []
      : [mutation(hooks, nextHooks, "remove only the owned PostToolUse adapter hook")]),
    mutation(ownership, null, "remove the versioned ownership record"),
  ];
  return { inputs, mutations, digest: installationDigest("uninstall", inputs.home, mutations), alreadyRemoved: false };
};

const conflictResult = (operation: string, reason: string, home?: string) => ({
  version: RESULT_VERSION,
  operation,
  status: "conflict",
  ...(home === undefined ? {} : { host: { adapter: "codex", home } }),
  error: { code: "configuration_conflict", message: reason },
  completed: [],
  pending: ["resolve the reported conflict and preview again"],
});

const packageMetadataConflictResult = (
  operation: "update-preview" | "update",
  cause: TargetPackageMetadataInvalid,
  home: string,
) => ({
  version: RESULT_VERSION,
  operation,
  status: "conflict",
  host: { adapter: "codex", home },
  error: { code: "target_package_metadata_invalid", message: cause.message },
  completed: [],
  pending: ["use a packaged target with a declared package version and version-1 runtime metadata"],
});

const JournalShape = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literals(["install", "update", "uninstall"]),
  proposalDigest: Schema.String,
  mutations: Schema.Array(Schema.Unknown),
  completed: Schema.Array(Schema.Unknown),
  reinstall: Schema.optional(Schema.Unknown),
  replacedJournalDigest: Schema.optional(Schema.Unknown),
});

const MutationShape = Schema.Struct({
  path: Schema.String,
  beforeDigest: Schema.String,
  beforeContent: Schema.NullOr(Schema.String),
  afterDigest: Schema.String,
  afterContent: Schema.NullOr(Schema.String),
  description: Schema.String,
});
const decodeMutation = (value: unknown) => Schema.decodeUnknownSync(MutationShape)(value);

const completedJournalStep = (index: unknown, length: number) => {
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new Error("completed shape");
  }
  return index;
};

const replacedJournalDigest = (digest: unknown) =>
  typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest) ? { replacedJournalDigest: digest } : {};

const readJournal = (path: string): Journal | undefined => {
  if (!existsSync(path)) return undefined;
  try {
    const value = Schema.decodeUnknownSync(JournalShape)(JSON.parse(readFileSync(path, "utf8")));
    const mutations = value.mutations.map(decodeMutation);
    return {
      version: 1,
      operation: value.operation,
      proposalDigest: value.proposalDigest,
      completed: value.completed.map((index) => completedJournalStep(index, mutations.length)),
      ...(value.reinstall === true ? { reinstall: true } : {}),
      ...replacedJournalDigest(value.replacedJournalDigest),
      mutations,
    };
  } catch {
    throw new Error("recovery journal is malformed; inspect it before making further changes");
  }
};

const recordCompletedMutation = (
  journalPath: string,
  journal: Journal,
  completed: ReadonlyArray<number>,
  index: number,
) => {
  const next = [...completed, index];
  atomicWrite(journalPath, encodeJson({ ...journal, completed: next }));
  return next;
};

const applyJournalMutation = (
  change: Mutation,
  index: number,
  completed: ReadonlyArray<number>,
  journalPath: string,
  journal: Journal,
  failAfter: number,
) => {
  const current = snapshot(change.path);
  if (current.digest === change.afterDigest) {
    return recordCompletedMutation(journalPath, journal, completed, index);
  }
  if (current.digest !== change.beforeDigest) {
    throw new Error(`concurrent change detected for ${change.path}; no stale content was restored`);
  }
  if (change.afterContent === null) atomicRemove(change.path);
  else atomicWrite(change.path, change.afterContent);
  const next = recordCompletedMutation(journalPath, journal, completed, index);
  if (failAfter >= 0 && next.length >= failAfter) throw new Error("injected multi-file failure");
  return next;
};

const applyJournal = (journalPath: string, journal: Journal, failAfter: number) => {
  let completed = [...journal.completed];
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index];
    if (change === undefined) continue;
    validateMutationCurrent(change, completed.includes(index));
  }
  atomicWrite(journalPath, encodeJson(journal));
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index];
    if (change === undefined || completed.includes(index)) continue;
    completed = applyJournalMutation(change, index, completed, journalPath, journal, failAfter);
  }
  atomicRemove(journalPath);
};

const mutationBeforeFile = (change: Mutation): FileSnapshot => ({
  path: change.path,
  exists: change.beforeContent !== null,
  content: change.beforeContent ?? "",
  digest: change.beforeDigest,
});

const decodedOwnershipContent = (content: string | null) => {
  if (content === null) return undefined;
  try {
    const value: unknown = JSON.parse(content);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const validateMutationContent = (change: Mutation) => {
  const recomputedBefore = change.beforeContent === null ? missingDigest : digestSnapshot(true, change.beforeContent);
  const recomputedAfter = change.afterContent === null ? missingDigest : digestSnapshot(true, change.afterContent);
  if (change.beforeDigest !== recomputedBefore || change.afterDigest !== recomputedAfter) {
    throw new Error("recovery journal content does not match its recorded file digests");
  }
};

const validateMutationCurrent = (change: Mutation, completed: boolean) => {
  const current = snapshot(change.path);
  if (completed) {
    if (current.digest !== change.afterDigest) {
      throw new Error(`completed journal step changed for ${change.path}; the unrelated edit was preserved`);
    }
  } else if (current.digest !== change.beforeDigest && current.digest !== change.afterDigest) {
    throw new Error(`concurrent change detected for ${change.path}; no stale content was restored`);
  }
};

const recoveryComposedFingerprints = (priorOwnership: Record<string, unknown> | undefined) => {
  const priorComposed =
    isObject(priorOwnership?.composedFingerprints) &&
    typeof priorOwnership.composedFingerprints.stop === "string" &&
    typeof priorOwnership.composedFingerprints.prompt === "string"
      ? {
          stop: priorOwnership.composedFingerprints.stop,
          prompt: priorOwnership.composedFingerprints.prompt,
          ...(typeof priorOwnership.composedFingerprints.preToolUse === "string"
            ? { preToolUse: priorOwnership.composedFingerprints.preToolUse }
            : {}),
          ...(typeof priorOwnership.composedFingerprints.subagentStop === "string"
            ? { subagentStop: priorOwnership.composedFingerprints.subagentStop }
            : {}),
        }
      : undefined;
  return priorComposed;
};

const recoveryFeatureOwned = (priorOwnership: Record<string, unknown> | undefined, configPath: string) => {
  const priorOwned = Array.isArray(priorOwnership?.owned) ? priorOwnership.owned : [];
  const priorFeatureOwned = priorOwned.some(
    (entry) =>
      isObject(entry) &&
      entry.kind === "feature" &&
      entry.file === configPath &&
      entry.fingerprint === HOOKS_FEATURE_FINGERPRINT,
  );

  return priorFeatureOwned;
};

const recoveryPlan = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  const byPath = new Map(journal.mutations.map((change) => [change.path, change]));
  const configChange = byPath.get(inputs.paths.config);
  const hooksChange = byPath.get(inputs.paths.hooks);
  const ownershipChange = byPath.get(inputs.paths.ownership);
  const targetGroup = ownedGroup(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer);
  const targetFingerprint = hookFingerprint(targetGroup);
  const priorOwnership = decodedOwnershipContent(ownershipChange?.beforeContent ?? null);
  const priorComposed = recoveryComposedFingerprints(priorOwnership);
  const targetComposed = composedGroups(
    inputs.executable,
    inputs.entrypoint,
    inputs.codex.version,
    inputs.controlledReviewer,
  );
  const priorFeatureOwned = recoveryFeatureOwned(priorOwnership, inputs.paths.config);
  return {
    configChange,
    hooksChange,
    ownershipChange,
    targetGroup,
    targetFingerprint,
    priorOwnership,
    priorComposed,
    targetComposed,
    priorFeatureOwned,
  };
};
type RecoveryPlan = ReturnType<typeof recoveryPlan>;
const recoveryHookGroups = (plan: RecoveryPlan) =>
  isObject(plan.priorOwnership?.hookGroups) ? plan.priorOwnership.hookGroups : undefined;

const validateCurrentRecoveryHooks = (inputs: ReturnType<typeof buildInputs>, plan: RecoveryPlan, message: string) => {
  const { targetGroup, targetComposed } = plan;
  const currentRoot = parseJsonObject(snapshot(inputs.paths.hooks));
  const currentGroup = postToolUseGroups(currentRoot).find(isOwnedPostGroup);
  if (markerCount(currentRoot) !== 1 || stableJson(currentGroup) !== stableJson(targetGroup)) {
    throw new Error(message);
  }
  withComposedGroups(currentRoot, targetComposed, {
    preToolUse: hookFingerprint(targetComposed.PreToolUse),
    stop: hookFingerprint(targetComposed.Stop),
    prompt: hookFingerprint(targetComposed.UserPromptSubmit),
    subagentStop: hookFingerprint(targetComposed.SubagentStop),
  });
};

const validateRecoveryFeatureChange = (change: Mutation | undefined) => {
  if (
    change !== undefined &&
    (change.description !== "enable Codex's native hooks feature" ||
      change.afterContent !== enableHooksFeature(mutationBeforeFile(change)))
  ) {
    throw new Error("recovery journal contains an unexpected Codex feature change");
  }
};

const requireUpdateOwnership = (journal: Journal, inputs: ReturnType<typeof buildInputs>, plan: RecoveryPlan) => {
  const { ownershipChange, hooksChange } = plan;
  if (
    ownershipChange === undefined ||
    journal.mutations[0]?.path !== inputs.paths.ownership ||
    ownershipChange.description !== "record the target packaged runtime" ||
    (hooksChange !== undefined && hooksChange.description !== "replace only the owned PostToolUse adapter hook")
  ) {
    throw new Error("recovery journal is not an exact owned update plan");
  }
  return ownershipChange;
};

const validateUpdateOwnership = (
  ownershipChange: Mutation,
  inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan,
) => {
  const { targetFingerprint, priorFeatureOwned, configChange } = plan;
  const expectedOwnership = encodeJson(
    makeOwnershipRecord(inputs, targetFingerprint, priorFeatureOwned || configChange !== undefined),
  );
  if (ownershipChange.afterContent !== expectedOwnership) {
    throw new Error("recovery journal ownership does not match the exact target package");
  }
};

const validateUpdatedRecoveryHooks = (hooksChange: Mutation, plan: RecoveryPlan) => {
  const { targetGroup, targetComposed, priorComposed } = plan;
  const beforeRoot = parseJsonObject(mutationBeforeFile(hooksChange));
  const expectedHooks = encodeJson(
    withComposedGroups(
      replaceOwnedHook(beforeRoot, targetGroup),
      targetComposed,
      priorComposed,
      true,
      recoveryHookGroups(plan),
    ),
  );
  if (hooksChange.afterContent !== expectedHooks) {
    throw new Error("recovery journal hook change does not preserve the exact unrelated hook state");
  }
};

const validateUpdateRecoveryPlan = (journal: Journal, inputs: ReturnType<typeof buildInputs>, plan: RecoveryPlan) => {
  const ownershipChange = requireUpdateOwnership(journal, inputs, plan);
  validateRecoveryFeatureChange(plan.configChange);
  validateUpdateOwnership(ownershipChange, inputs, plan);
  if (plan.hooksChange !== undefined) validateUpdatedRecoveryHooks(plan.hooksChange, plan);
  else validateCurrentRecoveryHooks(inputs, plan, "recovery journal does not bind the exact target owned hook");
};

const validateInstalledRecoveryHooks = (hooksChange: Mutation, journal: Journal, plan: RecoveryPlan) => {
  const { targetGroup, targetComposed, priorComposed } = plan;
  const originalRoot = parseJsonObject(mutationBeforeFile(hooksChange));
  const beforeRoot = journal.reinstall
    ? removeMarkedHandlers(originalRoot, [OWNED_MARKER, COMPOSED_MARKER])
    : originalRoot;
  const expectedRoot = postToolUseGroups(beforeRoot).some(isOwnedPostGroup)
    ? replaceOwnedHook(beforeRoot, targetGroup)
    : addOwnedHook(beforeRoot, targetGroup);
  if (
    hooksChange.description !== "append the owned PostToolUse adapter hook" ||
    hooksChange.afterContent !==
      encodeJson(
        withComposedGroups(
          expectedRoot,
          targetComposed,
          journal.reinstall ? undefined : priorComposed,
          true,
          recoveryHookGroups(plan),
        ),
      )
  ) {
    throw new Error("recovery journal install hook does not preserve unrelated hooks");
  }
};

const validateInstalledOwnership = (
  ownershipChange: Mutation,
  inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan,
) => {
  const { priorFeatureOwned, configChange, targetFingerprint } = plan;
  const featureOwned = priorFeatureOwned || configChange !== undefined;
  if (
    ownershipChange.description !== "write the versioned ownership record" ||
    ownershipChange.afterContent !== encodeJson(makeOwnershipRecord(inputs, targetFingerprint, featureOwned))
  ) {
    throw new Error("recovery journal contains an unexpected installation ownership record");
  }
};

const validateInstallRecoveryPlan = (journal: Journal, inputs: ReturnType<typeof buildInputs>, plan: RecoveryPlan) => {
  if (plan.ownershipChange === undefined)
    throw new Error("recovery journal install plan is missing its owned installation record");
  validateRecoveryFeatureChange(plan.configChange);
  if (plan.hooksChange !== undefined) validateInstalledRecoveryHooks(plan.hooksChange, journal, plan);
  else validateCurrentRecoveryHooks(inputs, plan, "recovery journal install plan does not bind the exact owned hook");
  validateInstalledOwnership(plan.ownershipChange, inputs, plan);
};

const validateUninstalledRecoveryHooks = (plan: RecoveryPlan) => {
  const { priorOwnership, hooksChange, priorComposed } = plan;
  const installedFingerprint =
    typeof priorOwnership?.hookFingerprint === "string" ? priorOwnership.hookFingerprint : undefined;
  if (hooksChange !== undefined) {
    if (
      installedFingerprint === undefined ||
      hooksChange.description !== "remove only the owned PostToolUse adapter hook" ||
      hooksChange.afterContent !==
        encodeJson(
          withComposedGroups(
            removeOwnedHook(
              parseJsonObject(mutationBeforeFile(hooksChange)),
              installedFingerprint,
              recoveryHookGroups(plan)?.PostToolUse,
            ),
            undefined,
            priorComposed,
            true,
            isObject(priorOwnership?.hookGroups) ? priorOwnership.hookGroups : undefined,
          ),
        )
    ) {
      throw new Error("recovery journal uninstall hook does not preserve unrelated hooks");
    }
  }
};

const validateRemovedRecoveryFeature = (configChange: Mutation | undefined) => {
  if (
    configChange !== undefined &&
    (configChange.description !== "remove the owned Codex hooks feature entry" ||
      configChange.afterContent !== disableOwnedFeature(mutationBeforeFile(configChange).content))
  ) {
    throw new Error("recovery journal contains an unexpected Codex feature removal");
  }
};

const validateUninstallRecoveryPlan = (
  _journal: Journal,
  _inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan,
) => {
  const { ownershipChange } = plan;
  if (
    ownershipChange === undefined ||
    ownershipChange.afterContent !== null ||
    ownershipChange.description !== "remove the versioned ownership record"
  ) {
    throw new Error("recovery journal does not contain the exact owned uninstall record removal");
  }
  validateUninstalledRecoveryHooks(plan);
  validateRemovedRecoveryFeature(plan.configChange);
};
const recoveryValidators = {
  install: validateInstallRecoveryPlan,
  update: validateUpdateRecoveryPlan,
  uninstall: validateUninstallRecoveryPlan,
};

const validateJournalIntegrity = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  if (new Set(journal.completed).size !== journal.completed.length) {
    throw new Error("recovery journal repeats a completed step");
  }
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index];
    if (change === undefined) continue;
    validateMutationContent(change);
    validateMutationCurrent(change, journal.completed.includes(index));
  }
  if (
    reinstallDigest(
      installationDigest(journal.operation, inputs.home, journal.mutations),
      journal.replacedJournalDigest,
    ) !== journal.proposalDigest
  ) {
    throw new Error("recovery journal proposal digest does not match its declared changes");
  }

  recoveryValidators[journal.operation](journal, inputs, recoveryPlan(journal, inputs));
};

const validateUnchangedRecoveryFeature = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  if (journal.operation === "uninstall") return;
  if (journal.mutations.some((change) => change.path === inputs.paths.config)) return;
  const config = validateToml(snapshot(inputs.paths.config));
  if (!isObject(config.features) || config.features.hooks !== true) {
    throw new Error(
      journal.operation === "install"
        ? "preexisting Codex hooks feature changed during recovery; the current config was preserved"
        : "Codex hooks feature changed during update recovery; the current config was preserved",
    );
  }
};

const parseRecoveryContent = (content: string, message: string): unknown => {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(message);
  }
};

const validateRecoveryHookContent = (content: string, operation: Journal["operation"]) => {
  const decoded = parseRecoveryContent(content, "recovery journal contains malformed hooks configuration");
  if (!isObject(decoded) || markerCount(decoded) !== (operation === "uninstall" ? 0 : 1)) {
    throw new Error("recovery journal does not contain the required owned-hook state");
  }
};

const requireRecoveryRuntimeIdentity = (decoded: unknown, inputs: ReturnType<typeof buildInputs>) => {
  if (
    !isObject(decoded) ||
    decoded.version !== 1 ||
    decoded.adapter !== "codex" ||
    decoded.executable !== commandFromEntrypoint(inputs.executable, inputs.entrypoint).executable ||
    JSON.stringify(decoded.args) !== JSON.stringify(commandFromEntrypoint(inputs.executable, inputs.entrypoint).args)
  ) {
    throw new Error("recovery journal ownership does not match the current packaged runtime");
  }
  return decoded;
};

const validateRecoveryOwnershipContent = (
  content: string,
  operation: Journal["operation"],
  inputs: ReturnType<typeof buildInputs>,
) => {
  const decoded = requireRecoveryRuntimeIdentity(
    parseRecoveryContent(content, "recovery journal contains a malformed ownership record"),
    inputs,
  );
  if (
    operation === "update" &&
    (decoded.residentProtocol !== inputs.residentProtocol || decoded.packageVersion !== inputs.packageVersion)
  ) {
    throw new Error("recovery journal ownership does not match the current packaged runtime");
  }
};

const validateRecoveryMutation = (
  change: Mutation,
  operation: Journal["operation"],
  inputs: ReturnType<typeof buildInputs>,
) => {
  if (change.afterContent === null) return;
  if (change.path === inputs.paths.config) {
    assertHooksSemanticState(change.afterContent, operation === "uninstall" ? "absent" : true);
  } else if (change.path === inputs.paths.hooks) {
    validateRecoveryHookContent(change.afterContent, operation);
  } else if (change.path === inputs.paths.ownership) {
    validateRecoveryOwnershipContent(change.afterContent, operation, inputs);
  }
};
const validateJournalScope = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  const allowed = new Set([inputs.paths.config, inputs.paths.hooks, inputs.paths.ownership]);
  if (
    journal.mutations.some((change) => !allowed.has(change.path)) ||
    new Set(journal.mutations.map((change) => change.path)).size !== journal.mutations.length
  ) {
    throw new Error("recovery journal contains an unexpected or duplicate configuration target");
  }
  validateJournalIntegrity(journal, inputs);
  validateUnchangedRecoveryFeature(journal, inputs);
  for (const change of journal.mutations) validateRecoveryMutation(change, journal.operation, inputs);
};

const recoveryConflictResult = (
  operation: "install" | "update" | "uninstall",
  inputs: ReturnType<typeof buildInputs>,
  journal: Journal,
  cause: unknown,
) => {
  const current = readJournal(inputs.paths.journal);
  const completedIndexes = current?.completed ?? journal.completed;
  return {
    version: RESULT_VERSION,
    operation,
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "recovery_conflict",
      message: cause instanceof Error ? cause.message : "journal recovery prerequisites no longer match",
    },
    recovery: {
      proposalDigest: journal.proposalDigest,
      completedFiles: completedIndexes.length,
      totalFiles: journal.mutations.length,
      command: {
        executable: "hapsland",
        arguments: [`--${journal.operation}`],
        request: {
          version: 1,
          operation: journal.operation,
          codexHome: inputs.home,
          proposalDigest: journal.proposalDigest,
        },
      },
    },
    completed: completedIndexes
      .map((index) => journal.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: [
      "preserve the current files, resolve the reported prerequisite conflict, then rerun with the same proposal digest",
    ],
  };
};

const previewChanges = (mutations: ReadonlyArray<Mutation>) =>
  mutations.map((change) => ({
    file: change.path,
    action: change.afterContent === null ? "remove" : change.beforeDigest === missingDigest ? "create" : "update",
    description: change.description,
    beforeDigest: change.beforeDigest,
    afterDigest: change.afterDigest,
  }));

const ownedChanges = (inputs: ReturnType<typeof buildInputs>) => ({
  runtime: {
    ...commandFromEntrypoint(inputs.executable, inputs.entrypoint),
    parser: commandFromEntrypoint(inputs.executable, packagedRuntimeEntrypoints(inputs.entrypoint).parser),
    resident: commandFromEntrypoint(inputs.executable, packagedRuntimeEntrypoints(inputs.entrypoint).resident),
    observed: inputs.runtimeProbe.observed,
  },
  feature: {
    file: inputs.paths.config,
    table: "features",
    key: "hooks",
    value: true,
  },
  hook: {
    file: inputs.paths.hooks,
    event: "PostToolUse",
    matcher: OWNED_MATCHER,
    handlers: ownedGroup(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer).hooks,
    groups: {
      PostToolUse: ownedGroup(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer),
      ...composedGroups(inputs.executable, inputs.entrypoint, inputs.codex.version, inputs.controlledReviewer),
    },
  },
  ownership: {
    file: inputs.paths.ownership,
    version: OWNERSHIP_VERSION,
    adapter: "codex",
  },
});

const installationJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
): Journal | undefined => {
  if (!request.reinstall) return readJournal(inputs.paths.journal);
  try {
    const journal = readJournal(inputs.paths.journal);
    if (journal?.reinstall !== true) return undefined;
    validateJournalScope(journal, inputs);
    return journal;
  } catch {
    return undefined;
  }
};

export const previewCodexInstallation = Effect.fn("CodexInstallation.preview")(function* (
  request: InstallationRequest,
) {
  const inputs = yield* resolveInputs(request);
  const home = inputs.home;
  try {
    const host = compatibility(inputs);
    if (!host.supported) return unsupportedResult("install-preview", inputs, host);
    const pendingJournal = installationJournal(inputs, request);
    if (pendingJournal !== undefined) {
      validateJournalScope(pendingJournal, inputs);
      return {
        version: RESULT_VERSION,
        operation: "install-preview",
        status: "partial",
        host: { adapter: "codex", home: inputs.home, compatibility: host },
        proposal: {
          digest: pendingJournal.proposalDigest,
          changes: previewChanges(pendingJournal.mutations),
          ownedChanges: ownedChanges(inputs),
        },
        recovery: {
          required: true,
          operation: pendingJournal.operation,
          proposalDigest: pendingJournal.proposalDigest,
          completedFiles: pendingJournal.completed.length,
          totalFiles: pendingJournal.mutations.length,
        },
        completed: pendingJournal.completed
          .map((index) => pendingJournal.mutations[index]?.description)
          .filter((value) => value !== undefined),
        pending: [`resume the journaled ${pendingJournal.operation} with its original proposal digest`],
      };
    }
    const plan = makeInstallPlan(request, inputs);
    return {
      version: RESULT_VERSION,
      operation: "install-preview",
      status: "preview",
      host: { adapter: "codex", home: plan.inputs.home, compatibility: host },
      proposal: {
        digest: plan.digest,
        changes: previewChanges(plan.mutations),
        ownedChanges: ownedChanges(plan.inputs),
        ...(plan.resetJournal?.exists
          ? {
              journalReplacement: {
                file: inputs.paths.journal,
                action: "back up the interrupted journal and rebuild from current settings",
              },
            }
          : {}),
      },
      installed: plan.alreadyInstalled,
      recovery: { required: false },
      trust: {
        status: "native-confirmation-required",
        guidance:
          "Start Codex normally in the repository and approve its native repository and hook review prompts. No trust record or bypass flag was changed.",
      },
      completed: [],
      pending: [
        "install using this proposal digest",
        "configure file includes/excludes if you want to narrow or turn off review",
      ],
    };
  } catch (cause) {
    return {
      ...conflictResult(
        "install-preview",
        cause instanceof Error ? cause.message : "installation preview failed",
        home,
      ),
      host: { adapter: "codex", home, compatibility: compatibility(inputs) },
    };
  }
});

/** Read-only ownership/configuration inspection independent of host compatibility. */
/** Discover owned registration state without requiring this package or host version to be current. */
export const hasCodexRegistration = (request: InstallationRequest): boolean => {
  const paths = pathsFor(resolve(request.codexHome ?? join(homedir(), ".codex")));
  if (snapshot(paths.ownership).exists || snapshot(paths.journal).exists) return true;
  const hooks = snapshot(paths.hooks).content;
  return hooks.includes(OWNED_MARKER) || hooks.includes(COMPOSED_MARKER);
};

const requireEnabledHooksFeature = (config: JsonObject) => {
  if (!isObject(config.features) || config.features.hooks !== true)
    throw new Error("Codex hooks feature is missing or disabled");
};

const validateInspectedOwnership = (ownership: OwnershipRecord, inputs: ReturnType<typeof buildInputs>) => {
  if (ownership.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home");
  const config = validateToml(snapshot(inputs.paths.config));
  requireEnabledHooksFeature(config);
  const hooks = parseJsonObject(snapshot(inputs.paths.hooks));
  if (markerCount(hooks) !== 1 || postToolUseGroups(hooks).filter(isOwnedPostGroup).length !== 1)
    throw new Error("owned Codex hook is missing or duplicated");
  const group = postToolUseGroups(hooks).find(isOwnedPostGroup);
  if (hookFingerprint(group) !== ownership.hookFingerprint) {
    throw new Error("owned Codex hook was locally modified");
  }
  if (ownership.composedFingerprints !== undefined) {
    withComposedGroups(hooks, undefined, ownership.composedFingerprints);
  }
};

export const inspectCodexInstallation = Effect.fn("CodexInstallation.inspect")(function* (
  request: InstallationRequest,
) {
  const inputs = yield* resolveInputs(request);
  try {
    const pendingJournal = readJournal(inputs.paths.journal);
    if (pendingJournal !== undefined) {
      validateJournalScope(pendingJournal, inputs);
      return {
        version: RESULT_VERSION,
        operation: "inspect-installation",
        status: "partial",
        installed: false,
        host: { adapter: "codex", home: inputs.home },
        recovery: {
          operation: pendingJournal.operation,
          proposalDigest: pendingJournal.proposalDigest,
          completedFiles: pendingJournal.completed.length,
          totalFiles: pendingJournal.mutations.length,
        },
      };
    }
    const ownership = readOwnership(inputs.paths.ownership);
    let installed = false;
    if (ownership !== undefined) {
      validateInspectedOwnership(ownership, inputs);
      const pinnedInputs = { ...inputs };
      pinnedInputs.executable = ownership.executable;
      pinnedInputs.entrypoint = commandEntrypoint(ownership);
      pinnedInputs.runtimeProbe = yield* probeRuntime(ownership.executable);
      installed = compatibility(pinnedInputs).supported && ownership.runtimeVersion === expectedRuntimeVersion(pinnedInputs.entrypoint);
    }
    return {
      version: RESULT_VERSION,
      operation: "inspect-installation",
      status: installed ? "installed" : "missing",
      installed,
      host: { adapter: "codex", home: inputs.home },
    };
  } catch (cause) {
    return conflictResult(
      "inspect-installation",
      cause instanceof Error ? cause.message : "installation inspection failed",
      inputs.home,
    );
  }
});

const updateRecoveryCommand = (inputs: ReturnType<typeof buildInputs>, proposalDigest: string) => ({
  executable: "hapsland",
  arguments: ["--update"],
  request: { version: 1, operation: "update", codexHome: inputs.home, proposalDigest },
});

const updatePreviewResult = (
  plan: ReturnType<typeof makeUpdatePlan>,
  host: ReturnType<typeof compatibility>,
  inputs: ReturnType<typeof buildInputs>,
) => {
  return {
    version: RESULT_VERSION,
    operation: "update-preview",
    status: "preview",
    host: { adapter: "codex", home: inputs.home, compatibility: host },
    proposal: {
      digest: plan.digest,
      changes: previewChanges(plan.mutations),
      current: {
        packageVersion: plan.record.packageVersion,
        runtimeVersion: plan.record.runtimeVersion,
        executable: plan.record.executable,
        args: plan.record.args,
        residentProtocol: plan.record.residentProtocol,
      },
      target: {
        packageVersion: inputs.packageVersion,
        runtimeVersion: expectedRuntimeVersion(inputs.entrypoint),
        ...commandFromEntrypoint(inputs.executable, inputs.entrypoint),
        residentProtocol: inputs.residentProtocol,
        hook: ownedChanges(inputs).hook,
      },
    },
    alreadyCurrent: plan.alreadyCurrent,
    automaticUpdate: false,
    preserved: ["old grant files", "credentials", "user rules", "independent hooks", "in-flight work"],
    trust: {
      modified: false,
      status: plan.alreadyCurrent ? "unchanged" : "renewal-required",
      guidance: plan.alreadyCurrent
        ? "The exact owned hook definition is already current."
        : "After current work completes, restart Codex normally and approve renewed native hook trust if prompted. No trust record or bypass flag was changed.",
    },
    restart: { required: !plan.alreadyCurrent, processesStopped: false },
    completed: [],
    pending: plan.alreadyCurrent
      ? []
      : ["update using this proposal digest", "restart Codex after current work completes"],
  };
};

export const previewCodexUpdate = Effect.fn("CodexInstallation.previewUpdate")(function* (
  request: InstallationRequest,
) {
  const inputs = yield* resolveInputs(request);
  const home = inputs.home;
  try {
    requireTargetPackageMetadata(inputs);
    const host = compatibility(inputs);
    if (!host.supported) return unsupportedResult("update-preview", inputs, host);
    const pendingJournal = readJournal(inputs.paths.journal);
    if (pendingJournal !== undefined) {
      validateJournalScope(pendingJournal, inputs);
      if (pendingJournal.operation !== "update") {
        throw new Error(`a journaled ${pendingJournal.operation} must be recovered before update`);
      }
      return {
        version: RESULT_VERSION,
        operation: "update-preview",
        status: "partial",
        host: { adapter: "codex", home: inputs.home, compatibility: host },
        proposal: { digest: pendingJournal.proposalDigest, changes: previewChanges(pendingJournal.mutations) },
        recovery: {
          required: true,
          proposalDigest: pendingJournal.proposalDigest,
          completedFiles: pendingJournal.completed.length,
          totalFiles: pendingJournal.mutations.length,
          command: updateRecoveryCommand(inputs, pendingJournal.proposalDigest),
        },
        preserved: ["old grant files", "credentials", "user rules", "independent hooks", "in-flight work"],
        completed: pendingJournal.completed
          .map((index) => pendingJournal.mutations[index]?.description)
          .filter((value) => value !== undefined),
        pending: ["resume the journaled update with its original proposal digest"],
      };
    }
    const plan = makeUpdatePlan(request, inputs);
    return updatePreviewResult(plan, host, inputs);
  } catch (cause) {
    if (cause instanceof TargetPackageMetadataInvalid) {
      return packageMetadataConflictResult("update-preview", cause, home);
    }
    return conflictResult("update-preview", cause instanceof Error ? cause.message : "update preview failed", home);
  }
});

const resumeUpdateJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  existingJournal: Journal,
): InstallationResult => {
  try {
    validateJournalScope(existingJournal, inputs);
  } catch (cause) {
    return recoveryConflictResult("update", inputs, existingJournal, cause);
  }
  if (request.proposalDigest !== existingJournal.proposalDigest || existingJournal.operation !== "update") {
    return {
      version: RESULT_VERSION,
      operation: "update",
      status: "partial",
      host: { adapter: "codex", home: inputs.home },
      error: {
        code: "recovery_required",
        message: "a prior operation is incomplete; recover it with its original operation and proposal digest",
      },
      recovery: {
        proposalDigest: existingJournal.proposalDigest,
        completedFiles: existingJournal.completed.length,
        totalFiles: existingJournal.mutations.length,
        command:
          existingJournal.operation === "update"
            ? updateRecoveryCommand(inputs, existingJournal.proposalDigest)
            : {
                executable: "hapsland",
                arguments: [`--${existingJournal.operation}`],
                request: {
                  version: 1,
                  operation: existingJournal.operation,
                  codexHome: inputs.home,
                  proposalDigest: existingJournal.proposalDigest,
                },
              },
      },
      completed: existingJournal.completed
        .map((index) => existingJournal.mutations[index]?.description)
        .filter((value) => value !== undefined),
      pending: [`resume the journaled ${existingJournal.operation}`],
    };
  }
  try {
    applyJournal(inputs.paths.journal, existingJournal, inputs.failAfterWrites);
  } catch (cause) {
    return recoveryConflictResult("update", inputs, existingJournal, cause);
  }
  return {
    version: RESULT_VERSION,
    operation: "update",
    status: "updated",
    host: { adapter: "codex", home: inputs.home },
    resumed: true,
    preserved: ["old grant files", "credentials", "user rules", "independent hooks", "in-flight work"],
    trust: { modified: false, status: "renewal-required", bypassUsed: false },
    restart: { required: true, processesStopped: false },
    completed: existingJournal.mutations.map((change) => change.description),
    pending: ["restart Codex after current work completes and approve renewed hook trust if prompted"],
  };
};

const partialUpdateResult = (
  cause: unknown,
  plan: ReturnType<typeof makeUpdatePlan>,
  inputs: ReturnType<typeof buildInputs>,
): InstallationResult => {
  const current = readJournal(inputs.paths.journal);
  return {
    version: RESULT_VERSION,
    operation: "update",
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "partial_completion",
      message: cause instanceof Error ? cause.message : "update stopped after partial completion",
    },
    recovery: {
      proposalDigest: plan.digest,
      completedFiles: current?.completed.length ?? 0,
      totalFiles: plan.mutations.length,
      command: updateRecoveryCommand(inputs, plan.digest),
    },
    preserved: ["old grant files", "credentials", "user rules", "independent hooks", "in-flight work"],
    completed: (current?.completed ?? [])
      .map((index) => plan.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: ["rerun update with the same proposal digest to resume safely"],
  };
};

const applyUpdatePlan = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  plan: ReturnType<typeof makeUpdatePlan>,
): InstallationResult => {
  const journal: Journal = {
    version: 1,
    operation: "update",
    proposalDigest: plan.digest,
    completed: [],
    mutations: plan.mutations,
  };
  try {
    applyJournal(inputs.paths.journal, journal, inputs.failAfterWrites);
  } catch (cause) {
    return partialUpdateResult(cause, plan, inputs);
  }
  return {
    version: RESULT_VERSION,
    operation: "update",
    status: "updated",
    host: { adapter: "codex", home: inputs.home },
    preserved: ["old grant files", "credentials", "user rules", "independent hooks", "in-flight work"],
    trust: { modified: false, status: "renewal-required", bypassUsed: false },
    restart: { required: true, processesStopped: false },
    completed: plan.mutations.map((change) => change.description),
    pending: ["restart Codex after current work completes and approve renewed hook trust if prompted"],
  };
};

export const updateCodexIntegration = Effect.fn("CodexInstallation.update")(function* (request: InstallationRequest) {
  const inputs = yield* resolveInputs(request);
  try {
    requireTargetPackageMetadata(inputs);
  } catch (cause) {
    if (cause instanceof TargetPackageMetadataInvalid) {
      return packageMetadataConflictResult("update", cause, inputs.home);
    }
    return conflictResult("update", "target package metadata validation failed", inputs.home);
  }
  const initialCompatibility = compatibility(inputs);
  if (!initialCompatibility.supported) return unsupportedResult("update", inputs, initialCompatibility);
  try {
    return yield* withInstallationLock(
      inputs.paths.lock,
      Effect.gen(function* () {
        const runtimeProbe = yield* probeRuntime(inputs.executable);
        return yield* Effect.try<InstallationResult, CodexInstallationError>({
          try: () => {
            const currentCompatibility = compatibility({ ...inputs, runtimeProbe });
            if (!currentCompatibility.supported) return unsupportedResult("update", inputs, currentCompatibility);
            const existingJournal = readJournal(inputs.paths.journal);
            if (existingJournal !== undefined) {
              return resumeUpdateJournal(inputs, request, existingJournal);
            }
            const plan = makeUpdatePlan(request, inputs);
            if (request.proposalDigest === undefined || request.proposalDigest !== plan.digest) {
              return {
                version: RESULT_VERSION,
                operation: "update",
                status: "proposal-mismatch",
                host: { adapter: "codex", home: inputs.home },
                currentProposalDigest: plan.digest,
                completed: [],
                pending: ["preview the update again and approve the matching digest"],
              };
            }
            if (plan.alreadyCurrent) {
              return {
                version: RESULT_VERSION,
                operation: "update",
                status: "already-current",
                host: { adapter: "codex", home: inputs.home },
                preserved: ["old grant files", "credentials", "user rules", "independent hooks", "in-flight work"],
                trust: { modified: false, status: "unchanged", bypassUsed: false },
                restart: { required: false, processesStopped: false },
                completed: [],
                pending: [],
              };
            }
            return applyUpdatePlan(inputs, request, plan);
          },
          catch: (cause) =>
            new CodexInstallationError({
              reason: cause instanceof Error && cause.message.length > 0 ? cause.message : "installation failed",
            }),
        });
      }),
    ).pipe(Effect.catch((error) => Effect.succeed(conflictResult("update", error.message, inputs.home))));
  } catch (cause) {
    return conflictResult("update", cause instanceof Error ? cause.message : "update failed", inputs.home);
  }
});

const resumeInstallJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  existingJournal: Journal,
): InstallationResult => {
  try {
    validateJournalScope(existingJournal, inputs);
  } catch (cause) {
    return recoveryConflictResult("install", inputs, existingJournal, cause);
  }
  if (request.proposalDigest !== existingJournal.proposalDigest || existingJournal.operation !== "install") {
    return {
      version: RESULT_VERSION,
      operation: "install",
      status: "partial",
      host: { adapter: "codex", home: inputs.home },
      error: {
        code: "recovery_required",
        message: "a prior installation is incomplete; rerun install with its original proposal digest",
      },
      recovery: {
        proposalDigest: existingJournal.proposalDigest,
        completedFiles: existingJournal.completed.length,
        totalFiles: existingJournal.mutations.length,
      },
      completed: existingJournal.completed
        .map((index) => existingJournal.mutations[index]?.description)
        .filter((value) => value !== undefined),
      pending: ["resume the journaled installation"],
    };
  }
  try {
    applyJournal(inputs.paths.journal, existingJournal, inputs.failAfterWrites);
  } catch (cause) {
    return recoveryConflictResult("install", inputs, existingJournal, cause);
  }
  return {
    version: RESULT_VERSION,
    operation: "install",
    status: "installed",
    host: { adapter: "codex", home: inputs.home },
    resumed: true,
    completed: existingJournal.mutations.map((change) => change.description),
    pending: [
      "make Jev credentials available and configure file settings if desired",
      "approve native Codex trust prompts when shown",
    ],
  };
};

const partialInstallResult = (
  cause: unknown,
  plan: ReturnType<typeof makeInstallPlan>,
  inputs: ReturnType<typeof buildInputs>,
): InstallationResult => {
  const current = readJournal(inputs.paths.journal);
  return {
    version: RESULT_VERSION,
    operation: "install",
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "partial_completion",
      message: cause instanceof Error ? cause.message : "installation stopped after partial completion",
    },
    recovery: {
      proposalDigest: plan.digest,
      completedFiles: current?.completed.length ?? 0,
      totalFiles: plan.mutations.length,
    },
    completed: (current?.completed ?? [])
      .map((index) => plan.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: ["rerun install with the same proposal digest to resume safely"],
  };
};

const applyInstallPlan = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  plan: ReturnType<typeof makeInstallPlan>,
): InstallationResult => {
  const journal: Journal = {
    version: 1,
    operation: "install",
    ...(request.reinstall ? { reinstall: true } : {}),
    ...(plan.resetJournal?.exists ? { replacedJournalDigest: plan.resetJournal.digest } : {}),
    proposalDigest: plan.digest,
    completed: [],
    mutations: plan.mutations,
  };
  try {
    if (plan.resetJournal?.exists)
      atomicWrite(`${inputs.paths.journal}.reinstall-backup.${randomUUID()}`, plan.resetJournal.content);
    applyJournal(inputs.paths.journal, journal, inputs.failAfterWrites);
  } catch (cause) {
    return partialInstallResult(cause, plan, inputs);
  }
  return {
    version: RESULT_VERSION,
    operation: "install",
    status: "installed",
    host: { adapter: "codex", home: inputs.home },
    completed: plan.mutations.map((change) => change.description),
    pending: [
      "make Jev credentials available and configure file settings if desired",
      "approve native Codex trust prompts when shown",
    ],
    trust: { modified: false, bypassUsed: false },
  };
};

export const installCodexIntegration = Effect.fn("CodexInstallation.install")(function* (request: InstallationRequest) {
  const inputs = yield* resolveInputs(request);
  const initialCompatibility = compatibility(inputs);
  if (!initialCompatibility.supported) return unsupportedResult("install", inputs, initialCompatibility);
  try {
    return yield* withInstallationLock(
      inputs.paths.lock,
      Effect.gen(function* () {
        const runtimeProbe = yield* probeRuntime(inputs.executable);
        return yield* Effect.try<InstallationResult, CodexInstallationError>({
          try: () => {
            const currentCompatibility = compatibility({ ...inputs, runtimeProbe });
            if (!currentCompatibility.supported) return unsupportedResult("install", inputs, currentCompatibility);
            const existingJournal = installationJournal(inputs, request);
            if (existingJournal !== undefined) {
              return resumeInstallJournal(inputs, request, existingJournal);
            }
            const plan = makeInstallPlan(request, inputs);
            const host = compatibility(plan.inputs);
            if (!host.supported) {
              return unsupportedResult("install", inputs, host);
            }
            if (request.proposalDigest === undefined || request.proposalDigest !== plan.digest) {
              return {
                version: RESULT_VERSION,
                operation: "install",
                status: "proposal-mismatch",
                host: { adapter: "codex", home: inputs.home },
                currentProposalDigest: plan.digest,
                completed: [],
                pending: ["preview again and approve the matching digest"],
              };
            }
            if (plan.alreadyInstalled) {
              return {
                version: RESULT_VERSION,
                operation: "install",
                status: "already-installed",
                host: { adapter: "codex", home: inputs.home },
                completed: [],
                pending: ["make Jev credentials available and configure file settings if desired"],
              };
            }
            return applyInstallPlan(inputs, request, plan);
          },
          catch: (cause) =>
            new CodexInstallationError({
              reason: cause instanceof Error && cause.message.length > 0 ? cause.message : "installation failed",
            }),
        });
      }),
    ).pipe(Effect.catch((error) => Effect.succeed(conflictResult("install", error.message, inputs.home))));
  } catch (cause) {
    return conflictResult("install", cause instanceof Error ? cause.message : "installation failed", inputs.home);
  }
});

const resumeUninstallJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  existingJournal: Journal,
): InstallationResult => {
  try {
    validateJournalScope(existingJournal, inputs);
  } catch (cause) {
    return recoveryConflictResult("uninstall", inputs, existingJournal, cause);
  }
  if (request.proposalDigest === existingJournal.proposalDigest && existingJournal.operation === "uninstall") {
    try {
      applyJournal(inputs.paths.journal, existingJournal, inputs.failAfterWrites);
    } catch (cause) {
      return recoveryConflictResult("uninstall", inputs, existingJournal, cause);
    }
    return {
      version: RESULT_VERSION,
      operation: "uninstall",
      status: "uninstalled",
      host: { adapter: "codex", home: inputs.home },
      resumed: true,
      completed: existingJournal.mutations.map((change) => change.description),
      pending: [],
      remaining: ["old grant files", "credentials", "user rules", "already dispatched requests cannot be recalled"],
    };
  }
  if (existingJournal.operation === "uninstall" && request.proposalDigest === undefined)
    return {
      version: RESULT_VERSION,
      operation: "uninstall",
      status: "partial",
      host: { adapter: "codex", home: inputs.home },
      proposal: { digest: existingJournal.proposalDigest, changes: previewChanges(existingJournal.mutations) },
      recovery: { operation: "uninstall", proposalDigest: existingJournal.proposalDigest },
    };
  throw new Error("another journaled operation requires recovery before uninstall");
};

const partialUninstallResult = (
  cause: unknown,
  plan: ReturnType<typeof makeUninstallPlan>,
  inputs: ReturnType<typeof buildInputs>,
): InstallationResult => {
  const current = readJournal(inputs.paths.journal);
  return {
    version: RESULT_VERSION,
    operation: "uninstall",
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "partial_completion",
      message: cause instanceof Error ? cause.message : "uninstall stopped after partial completion",
    },
    recovery: {
      proposalDigest: plan.digest,
      completedFiles: current?.completed.length ?? 0,
      totalFiles: plan.mutations.length,
    },
    completed: (current?.completed ?? [])
      .map((index) => plan.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: ["rerun uninstall with the same proposal digest to resume safely"],
  };
};

const applyUninstallPlan = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  plan: ReturnType<typeof makeUninstallPlan>,
): InstallationResult => {
  const journal: Journal = {
    version: 1,
    operation: "uninstall",
    proposalDigest: plan.digest,
    completed: [],
    mutations: plan.mutations,
  };
  try {
    applyJournal(inputs.paths.journal, journal, inputs.failAfterWrites);
  } catch (cause) {
    return partialUninstallResult(cause, plan, inputs);
  }
  return {
    version: RESULT_VERSION,
    operation: "uninstall",
    status: "uninstalled",
    host: { adapter: "codex", home: inputs.home },
    completed: plan.mutations.map((change) => change.description),
    pending: [],
    remaining: ["old grant files", "credentials", "user rules", "already dispatched requests cannot be recalled"],
  };
};

export const uninstallCodexIntegration = Effect.fn("CodexInstallation.uninstall")(function* (
  request: InstallationRequest,
) {
  const inputs = yield* resolveInputs(request);
  try {
    return yield* withInstallationLock(
      inputs.paths.lock,
      Effect.try<InstallationResult, CodexInstallationError>({
        try: () => {
          const existingJournal = readJournal(inputs.paths.journal);
          if (existingJournal !== undefined) {
            return resumeUninstallJournal(inputs, request, existingJournal);
          }
          const plan = makeUninstallPlan(request, inputs);
          if (plan.alreadyRemoved) {
            return {
              version: RESULT_VERSION,
              operation: "uninstall",
              status: "already-uninstalled",
              host: { adapter: "codex", home: inputs.home },
              proposal: { digest: plan.digest, changes: [] },
              completed: [],
              pending: [],
              remaining: [
                "old grant files",
                "credentials",
                "user rules",
                "already dispatched requests cannot be recalled",
              ],
            };
          }
          if (request.proposalDigest === undefined) {
            return {
              version: RESULT_VERSION,
              operation: "uninstall",
              status: "preview",
              host: { adapter: "codex", home: inputs.home },
              proposal: {
                digest: plan.digest,
                changes: previewChanges(plan.mutations),
                ownedChanges: {
                  hooks: { file: inputs.paths.hooks, groups: readOwnership(inputs.paths.ownership)?.hookGroups ?? {} },
                },
              },
              completed: [],
              pending: ["rerun uninstall with this proposal digest"],
              remaining: [
                "old grant files",
                "credentials",
                "user rules",
                "already dispatched requests cannot be recalled",
              ],
            };
          }
          if (request.proposalDigest !== plan.digest) {
            return {
              version: RESULT_VERSION,
              operation: "uninstall",
              status: "proposal-mismatch",
              host: { adapter: "codex", home: inputs.home },
              currentProposalDigest: plan.digest,
              completed: [],
              pending: ["preview uninstall again and approve the matching digest"],
            };
          }
          return applyUninstallPlan(inputs, request, plan);
        },
        catch: (cause) =>
          new CodexInstallationError({
            reason: cause instanceof Error && cause.message.length > 0 ? cause.message : "installation failed",
          }),
      }),
    ).pipe(Effect.catch((error) => Effect.succeed(conflictResult("uninstall", error.message, inputs.home))));
  } catch (cause) {
    return conflictResult("uninstall", cause instanceof Error ? cause.message : "uninstall failed", inputs.home);
  }
});

export const codexInstallation = {
  marker: OWNED_MARKER,
  preview: previewCodexInstallation,
  install: installCodexIntegration,
  uninstall: uninstallCodexIntegration,
  inspect: inspectCodexInstallation,
};
