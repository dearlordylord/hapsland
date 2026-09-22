import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
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

const OWNERSHIP_VERSION = 1 as const;
const RESULT_VERSION = 1 as const;
const OWNED_MARKER = "--review-tool-owned=codex-v1";
const OWNED_MATCHER = "^(apply_patch|Edit|Write|Bash)$";
const PRODUCT_DIRECTORY = ".realtime-review-tool";

type JsonObject = { [key: string]: unknown };

class ResidentProtocolIncompatible extends Error {
  readonly installed: number;
  readonly target: number;

  constructor(installed: number, target: number) {
    super(`resident protocol ${installed} is incompatible with target protocol ${target}; active work was left on the installed version`);
    this.installed = installed;
    this.target = target;
  }
}

export interface InstallationRequest {
  readonly codexHome?: string;
  readonly proposalDigest?: string;
  readonly codexExecutable?: string;
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
  readonly entrypoint: string;
  readonly marker: typeof OWNED_MARKER;
  readonly hookFingerprint: string;
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
  readonly mutations: ReadonlyArray<Mutation>;
}

export type InstallationResult =
  | JsonObject
  | { readonly version: 1; readonly operation: string; readonly status: string };

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

const ownedHook = (runtime: string, entrypoint: string) => ({
  type: "command",
  command: `${quoteShell(runtime)} ${quoteShell(entrypoint)} --codex-hook${process.env.REVIEW_INSTALL_CONTROLLED === "1" ? " --controlled" : ""} --controlled-writer ${OWNED_MARKER}`,
  timeout: 10,
});

const ownedGroup = (runtime: string, entrypoint: string) => ({
  matcher: OWNED_MATCHER,
  hooks: [ownedHook(runtime, entrypoint)],
});

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

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

const replaceOwnedHook = (root: JsonObject, group: unknown): JsonObject => {
  const hooks = root.hooks;
  if (!isObject(hooks)) throw new Error("owned Codex hook is missing or locally modified");
  const groups = postToolUseGroups(root);
  const ownedIndexes = groups.flatMap((candidate, index) => markerCount(candidate) > 0 ? [index] : []);
  if (ownedIndexes.length !== 1) throw new Error("owned Codex hook is missing, duplicated, or locally modified");
  const ownedIndex = ownedIndexes[0];
  if (ownedIndex === undefined) throw new Error("owned Codex hook is missing");
  return {
    ...root,
    hooks: {
      ...hooks,
      PostToolUse: groups.map((candidate, index) => index === ownedIndex ? group : candidate),
    },
  };
};

const removeOwnedHook = (root: JsonObject, expectedFingerprint: string): JsonObject => {
  const hooks = root.hooks;
  if (!isObject(hooks)) throw new Error("owned Codex hook is missing or locally modified");
  const groups = postToolUseGroups(root);
  const ownedIndexes = groups.flatMap((group, index) => markerCount(group) > 0 ? [index] : []);
  if (ownedIndexes.length !== 1) throw new Error("owned Codex hook is missing, duplicated, or locally modified");
  const index = ownedIndexes[0];
  if (index === undefined || hookFingerprint(groups[index]) !== expectedFingerprint) {
    throw new Error("owned Codex hook was locally modified; reconcile it before uninstalling");
  }
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

const advanceTomlStringState = (line: string, initial: MultilineDelimiter): MultilineDelimiter => {
  let multiline = initial;
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < line.length; index += 1) {
    if (multiline !== undefined) {
      if (line.startsWith(multiline, index) &&
          (multiline === "'''" || index === 0 || line[index - 1] !== "\\")) {
        index += 2;
        multiline = undefined;
      }
      continue;
    }
    const character = line[index];
    if (quote !== undefined) {
      if (character === quote && (quote === "'" || index === 0 || line[index - 1] !== "\\")) quote = undefined;
      continue;
    }
    if (character === "#") break;
    if (line.startsWith('"""', index) || line.startsWith("'''", index)) {
      multiline = line.startsWith('"""', index) ? '"""' : "'''";
      index += 2;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
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
    const contentEnd = newline < 0
      ? content.length
      : newline > offset && content[newline - 1] === "\r" ? newline - 1 : newline;
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
    return isObject(parsed.features) && parsed.features.__review_tool_probe__ === true
      ? "features"
      : "other";
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

const assertHooksSemanticState = (content: string, expected: true | "absent") => {
  let parsed: unknown;
  try {
    parsed = parseToml(content);
  } catch {
    throw new Error("generated config.toml is invalid; no configuration was written");
  }
  const features = isObject(parsed) ? parsed.features : undefined;
  const hooks = isObject(features) ? features.hooks : undefined;
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
  const content = file.content;
  const syntax = locateFeaturesSyntax(content);
  let next: string;
  if (syntax.header === undefined) {
    const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
    next = `${content}${separator}${content.length === 0 ? "" : "\n"}[features]\nhooks = true\n`;
  } else {
    const newline = content.slice(syntax.header.contentEnd, syntax.header.end) || "\n";
    next = `${content.slice(0, syntax.header.contentEnd)}${newline}hooks = true${content.slice(syntax.header.contentEnd)}`;
  }
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

const readOwnership = (path: string): OwnershipRecord | undefined => {
  const file = snapshot(path);
  if (!file.exists) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(file.content);
  } catch {
    throw new Error("installation ownership record is malformed");
  }
  if (!isObject(value) || value.version !== 1 || value.adapter !== "codex" ||
      typeof value.hookFingerprint !== "string" || !Array.isArray(value.owned) ||
      typeof value.executable !== "string" || typeof value.entrypoint !== "string" ||
      typeof value.runtimeVersion !== "string" || typeof value.codexHome !== "string" ||
      (value.packageVersion !== undefined && typeof value.packageVersion !== "string") ||
      (value.residentProtocol !== undefined && (typeof value.residentProtocol !== "number" ||
        !Number.isSafeInteger(value.residentProtocol) || value.residentProtocol <= 0)) ||
      value.marker !== OWNED_MARKER) {
    throw new Error("installation ownership record has an unsupported shape or version");
  }
  const owned = value.owned.map((entry) => {
    if (!isObject(entry) || typeof entry.file !== "string" ||
        (entry.kind !== "feature" && entry.kind !== "hook") || typeof entry.fingerprint !== "string") {
      throw new Error("installation ownership record has an unsupported owned-entry shape");
    }
    const kind: "feature" | "hook" = entry.kind;
    return { file: entry.file, kind, fingerprint: entry.fingerprint };
  });
  return {
    version: 1,
    adapter: "codex",
    codexHome: value.codexHome,
    runtimeVersion: value.runtimeVersion,
    packageVersion: typeof value.packageVersion === "string" ? value.packageVersion : "legacy",
    residentProtocol: typeof value.residentProtocol === "number" ? value.residentProtocol : 1,
    executable: value.executable,
    entrypoint: value.entrypoint,
    marker: OWNED_MARKER,
    hookFingerprint: value.hookFingerprint,
    owned,
  };
};

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
  afterDigest: afterContent === null ? missingDigest : digestSnapshot(true, afterContent),
  afterContent,
  description,
});

const installationDigest = (
  operation: "install" | "update" | "uninstall",
  home: string,
  mutations: ReadonlyArray<Mutation>,
) => sha256(stableJson({
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
}));

const codexCompatibility = (codexExecutable: string) => {
  const run = spawnSync(codexExecutable, ["--version"], { encoding: "utf8", timeout: 2_000 });
  const observed = run.status === 0 ? run.stdout.trim() : "unavailable";
  return {
    supported: /^codex-cli 0\.155\.1$/.test(observed),
    observed,
    required: "codex-cli 0.155.1",
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
    parser: join(dirname(entrypoint), "review-tool-parser"),
    resident: join(dirname(entrypoint), "review-tool-resident"),
  };
};

const probeRuntime = (executable: string) => {
  const probe = spawnSync(executable, [
    "-e",
    "process.stdout.write(JSON.stringify({version:process.version,platform:process.platform,architecture:process.arch}))",
  ], { encoding: "utf8", timeout: 2_000, maxBuffer: 16_384 });
  if (probe.status !== 0 || probe.error !== undefined) {
    return { ready: false, observed: probe.error?.message.includes("timed out") ? "timed-out" : "not-a-supported-node-runtime" };
  }
  try {
    const value: unknown = JSON.parse(probe.stdout);
    if (!isObject(value) || typeof value.version !== "string" || typeof value.platform !== "string" ||
        typeof value.architecture !== "string") throw new Error("shape");
    return {
      ready: value.version === "v24.20.0" && value.platform === "linux" && value.architecture === "arm64",
      observed: { version: value.version, platform: value.platform, architecture: value.architecture },
    };
  } catch {
    return { ready: false, observed: "not-a-supported-node-runtime" };
  }
};

const runtimeCompatibility = (inputs: ReturnType<typeof resolveInputs>) => {
  const executable = pathReadiness(inputs.executable, true);
  const entrypoint = pathReadiness(inputs.entrypoint, false);
  const runtimeProbe = executable.ready
    ? probeRuntime(inputs.executable)
    : { ready: false, observed: executable.observed };
  const packaged = packagedRuntimeEntrypoints(inputs.entrypoint);
  const parser = pathReadiness(packaged.parser, false);
  const resident = pathReadiness(packaged.resident, false);
  const observedRuntime = isObject(runtimeProbe.observed) ? runtimeProbe.observed : undefined;
  const checks = {
    runtime: { ...executable, path: inputs.executable },
    entrypoint: { ...entrypoint, path: inputs.entrypoint },
    parser: { ...parser, path: packaged.parser },
    resident: { ...resident, path: packaged.resident },
    node: { ready: runtimeProbe.ready && observedRuntime?.version === "v24.20.0", observed: observedRuntime?.version ?? runtimeProbe.observed, required: "v24.20.0" },
    platform: { ready: runtimeProbe.ready && observedRuntime?.platform === "linux", observed: observedRuntime?.platform ?? runtimeProbe.observed, required: "linux" },
    architecture: { ready: runtimeProbe.ready && observedRuntime?.architecture === "arm64", observed: observedRuntime?.architecture ?? runtimeProbe.observed, required: "arm64" },
  };
  return {
    supported: Object.values(checks).every((check) => check.ready),
    checks,
  };
};

const compatibility = (inputs: ReturnType<typeof resolveInputs>) => {
  const codex = codexCompatibility(inputs.codexExecutable);
  const runtime = runtimeCompatibility(inputs);
  return { supported: codex.supported && runtime.supported, codex, runtime };
};

const unsupportedResult = (
  operation: "install" | "install-preview" | "update" | "update-preview",
  inputs: ReturnType<typeof resolveInputs>,
  host: ReturnType<typeof compatibility>,
) => ({
  version: RESULT_VERSION,
  operation,
  status: "unsupported",
  host: { adapter: "codex", home: inputs.home, compatibility: host },
  completed: [],
  pending: ["install the declared runtime, packaged entrypoint, and Codex 0.155.1 before mutation"],
});

const resolveInputs = (request: InstallationRequest) => {
  const home = resolve(request.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"));
  const executable = resolve(process.env.REVIEW_INSTALL_RUNTIME ?? process.execPath);
  const requestedEntrypoint = resolve(process.env.REVIEW_INSTALL_ENTRYPOINT ?? process.argv[1] ?? "dist/cli.js");
  let entrypoint = requestedEntrypoint;
  try {
    entrypoint = realpathSync(requestedEntrypoint);
  } catch {
    // Compatibility reports the unresolved missing path without creating state.
  }
  const codexExecutable = request.codexExecutable ?? "codex";
  const packageRoot = resolve(dirname(entrypoint), "..");
  let packageVersion = "development";
  let residentProtocol = 1;
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    if (isObject(manifest) && typeof manifest.version === "string" && manifest.version.length > 0) {
      packageVersion = manifest.version;
    }
    const declaration: unknown = JSON.parse(readFileSync(join(packageRoot, "package-runtime.json"), "utf8"));
    if (isObject(declaration) && typeof declaration.residentProtocol === "number" &&
        Number.isSafeInteger(declaration.residentProtocol) && declaration.residentProtocol > 0) {
      residentProtocol = declaration.residentProtocol;
    }
  } catch {
    // Source-checkout and focused installer fixtures may not have packaged metadata
    // adjacent to their synthetic entrypoint. The production package always does.
  }
  return { home, executable, entrypoint, codexExecutable, packageVersion, residentProtocol, paths: pathsFor(home) };
};

const makeOwnershipRecord = (
  inputs: ReturnType<typeof resolveInputs>,
  fingerprint: string,
  featureOwned: boolean,
): OwnershipRecord => ({
  version: OWNERSHIP_VERSION,
  adapter: "codex",
  codexHome: inputs.home,
  runtimeVersion: process.version,
  packageVersion: inputs.packageVersion,
  residentProtocol: inputs.residentProtocol,
  executable: inputs.executable,
  entrypoint: inputs.entrypoint,
  marker: OWNED_MARKER,
  hookFingerprint: fingerprint,
  owned: [
    ...(featureOwned
      ? [{ file: inputs.paths.config, kind: "feature" as const, fingerprint: HOOKS_FEATURE_FINGERPRINT }]
      : []),
    { file: inputs.paths.hooks, kind: "hook", fingerprint },
  ],
});

const makeInstallPlan = (request: InstallationRequest) => {
  const inputs = resolveInputs(request);
  const config = snapshot(inputs.paths.config);
  const hooks = snapshot(inputs.paths.hooks);
  const ownership = snapshot(inputs.paths.ownership);
  const existingRecord = readOwnership(inputs.paths.ownership);
  const group = ownedGroup(inputs.executable, inputs.entrypoint);
  const fingerprint = hookFingerprint(group);
  const hookRoot = parseJsonObject(hooks);
  const count = markerCount(hookRoot);
  if (count > 1) throw new Error("duplicate owned Codex hook representations require manual reconciliation");
  if (existingRecord !== undefined) {
    if (existingRecord.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home");
    if (count !== 1) throw new Error("owned Codex hook is missing or locally modified");
    const currentGroup = postToolUseGroups(hookRoot).find((candidate) => markerCount(candidate) > 0);
    if (hookFingerprint(currentGroup) !== existingRecord.hookFingerprint) {
      throw new Error("owned Codex hook was locally modified; reconcile before reinstalling");
    }
  } else if (count !== 0) {
    throw new Error("an unrecorded owned-marker hook requires manual reconciliation");
  }
  const nextConfig = enableHooksFeature(config);
  if (existingRecord?.owned.some((entry) => entry.kind === "feature") === true && nextConfig !== config.content) {
    throw new Error("owned Codex feature entry is missing or locally modified");
  }
  const nextHooksRoot = existingRecord === undefined
    ? addOwnedHook(hookRoot, group)
    : replaceOwnedHook(hookRoot, group);
  const nextHooks = encodeJson(nextHooksRoot);
  const featureOwned = existingRecord?.owned.some((entry) =>
    entry.kind === "feature" && entry.file === inputs.paths.config
  ) ?? nextConfig !== config.content;
  const record = makeOwnershipRecord(inputs, fingerprint, featureOwned);
  const nextOwnership = encodeJson(record);
  const mutations = [
    ...(nextConfig === config.content ? [] : [mutation(config, nextConfig, "enable Codex's native hooks feature")]),
    ...(nextHooks === hooks.content ? [] : [mutation(hooks, nextHooks, "append the owned PostToolUse adapter hook")]),
    ...(nextOwnership === ownership.content ? [] : [mutation(ownership, nextOwnership, "write the versioned ownership record")]),
  ];
  return { inputs, mutations, digest: installationDigest("install", inputs.home, mutations), alreadyInstalled: mutations.length === 0 };
};

const makeUpdatePlan = (request: InstallationRequest) => {
  const inputs = resolveInputs(request);
  const record = readOwnership(inputs.paths.ownership);
  if (record === undefined) throw new Error("no owned Codex installation exists; run install first");
  if (record.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home");
  if (record.residentProtocol !== inputs.residentProtocol) {
    throw new ResidentProtocolIncompatible(record.residentProtocol, inputs.residentProtocol);
  }
  const config = snapshot(inputs.paths.config);
  const parsedConfig = validateToml(config);
  const ownedFeature = record.owned.find((entry) => entry.kind === "feature" && entry.file === inputs.paths.config);
  if (ownedFeature !== undefined) {
    if (ownedFeature.fingerprint !== HOOKS_FEATURE_FINGERPRINT ||
        !isObject(parsedConfig.features) || parsedConfig.features.hooks !== true) {
      throw new Error("owned Codex feature value was locally modified; the installed version was preserved");
    }
  } else if (!isObject(parsedConfig.features) || parsedConfig.features.hooks !== true) {
    throw new Error("preexisting Codex hooks feature is no longer enabled; the installed version was preserved");
  }
  const hooks = snapshot(inputs.paths.hooks);
  const hookRoot = parseJsonObject(hooks);
  const currentGroup = postToolUseGroups(hookRoot).find((candidate) => markerCount(candidate) > 0);
  if (markerCount(hookRoot) !== 1 || hookFingerprint(currentGroup) !== record.hookFingerprint) {
    throw new Error("owned Codex hook was locally modified; the installed version was preserved");
  }
  const targetGroup = ownedGroup(inputs.executable, inputs.entrypoint);
  const targetFingerprint = hookFingerprint(targetGroup);
  const nextHooks = encodeJson(replaceOwnedHook(hookRoot, targetGroup));
  const ownership = snapshot(inputs.paths.ownership);
  const nextOwnership = encodeJson(makeOwnershipRecord(inputs, targetFingerprint, ownedFeature !== undefined));
  const mutations = [
    // Recording the target first retains the previous working hook if a later
    // per-file write fails. The journal reports and safely resumes this exact state.
    ...(nextOwnership === ownership.content ? [] : [mutation(ownership, nextOwnership, "record the target packaged runtime")]),
    ...(nextHooks === hooks.content ? [] : [mutation(hooks, nextHooks, "replace only the owned PostToolUse adapter hook")]),
  ];
  return {
    inputs,
    record,
    mutations,
    digest: installationDigest("update", inputs.home, mutations),
    alreadyCurrent: mutations.length === 0,
  };
};

const makeUninstallPlan = (request: InstallationRequest) => {
  const inputs = resolveInputs(request);
  const record = readOwnership(inputs.paths.ownership);
  if (record === undefined) return { inputs, mutations: [] as Array<Mutation>, digest: installationDigest("uninstall", inputs.home, []), alreadyRemoved: true };
  if (record.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home");
  const config = snapshot(inputs.paths.config);
  const hooks = snapshot(inputs.paths.hooks);
  const ownership = snapshot(inputs.paths.ownership);
  const parsedConfig = validateToml(config);
  const hookRoot = parseJsonObject(hooks);
  const nextHookRoot = removeOwnedHook(hookRoot, record.hookFingerprint);
  const nextHooks = encodeJson(nextHookRoot);
  const ownedFeature = record.owned.find((entry) => entry.kind === "feature" && entry.file === inputs.paths.config);
  const featureWasOwned = ownedFeature !== undefined;
  if (featureWasOwned) {
    const features = parsedConfig.features;
    if (ownedFeature.fingerprint !== HOOKS_FEATURE_FINGERPRINT ||
        !isObject(features) || features.hooks !== true) {
      throw new Error("owned Codex feature value was locally modified; it was preserved");
    }
  }
  const unrelatedHooksRemain = markerCount(nextHookRoot) === 0 &&
    isObject(nextHookRoot.hooks) && Object.values(nextHookRoot.hooks).some((value) => Array.isArray(value) && value.length > 0);
  const nextConfig = featureWasOwned && !unrelatedHooksRemain
    ? disableOwnedFeature(config.content)
    : config.content;
  const mutations = [
    ...(nextConfig === config.content ? [] : [mutation(config, nextConfig, "remove the owned Codex hooks feature entry")]),
    ...(nextHooks === hooks.content ? [] : [mutation(hooks, nextHooks, "remove only the owned PostToolUse adapter hook")]),
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

const protocolConflictResult = (
  operation: "update-preview" | "update",
  cause: ResidentProtocolIncompatible,
  home: string,
) => ({
  version: RESULT_VERSION,
  operation,
  status: "conflict",
  host: { adapter: "codex", home },
  error: {
    code: "resident_protocol_incompatible",
    message: cause.message,
    installed: cause.installed,
    target: cause.target,
  },
  preserved: ["installed hook", "repository grants", "credentials", "user rules", "independent hooks", "in-flight work"],
  completed: [],
  pending: ["choose a target package with a compatible resident protocol or finish current work before a separately supported migration"],
});

const readJournal = (path: string): Journal | undefined => {
  if (!existsSync(path)) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.mutations) || !Array.isArray(value.completed) ||
        (value.operation !== "install" && value.operation !== "update" && value.operation !== "uninstall") ||
        typeof value.proposalDigest !== "string") {
      throw new Error("shape");
    }
    const mutations = value.mutations.map((change) => {
      if (!isObject(change) || typeof change.path !== "string" || typeof change.beforeDigest !== "string" ||
          typeof change.afterDigest !== "string" || (typeof change.afterContent !== "string" && change.afterContent !== null) ||
          typeof change.description !== "string") throw new Error("mutation shape");
      return {
        path: change.path,
        beforeDigest: change.beforeDigest,
        afterDigest: change.afterDigest,
        afterContent: change.afterContent,
        description: change.description,
      };
    });
    const completed = value.completed.map((index) => {
      if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= mutations.length) {
        throw new Error("completed shape");
      }
      return index;
    });
    return {
      version: 1,
      operation: value.operation,
      proposalDigest: value.proposalDigest,
      completed,
      mutations,
    };
  } catch {
    throw new Error("recovery journal is malformed; inspect it before making further changes");
  }
};

const sleep = (milliseconds: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const withLock = async <A>(path: string, use: () => Promise<A>): Promise<A> => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 1_500;
  let descriptor: number | undefined;
  while (descriptor === undefined) {
    try {
      descriptor = openSync(path, "wx", 0o600);
      writeFileSync(descriptor, `${JSON.stringify({ version: 1, pid: process.pid, createdAt: new Date().toISOString() })}\n`);
    } catch (cause) {
      if (!isNodeError(cause, "EEXIST")) throw cause;
      if (Date.now() >= deadline) throw new Error("configuration lock remained busy for 1500ms");
      await sleep(25);
    }
  }
  try {
    return await use();
  } finally {
    closeSync(descriptor);
    atomicRemove(path);
  }
};

const applyJournal = (journalPath: string, journal: Journal) => {
  let completed = [...journal.completed];
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index];
    if (change === undefined) continue;
    const current = snapshot(change.path);
    if (completed.includes(index) && current.digest !== change.afterDigest) {
      throw new Error(`completed journal step changed for ${change.path}; the unrelated edit was preserved`);
    }
    if (!completed.includes(index) && current.digest !== change.beforeDigest && current.digest !== change.afterDigest) {
      throw new Error(`concurrent change detected for ${change.path}; no stale content was restored`);
    }
  }
  atomicWrite(journalPath, encodeJson(journal));
  const failAfter = Number(process.env.REVIEW_INSTALL_FAIL_AFTER_WRITES ?? "-1");
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index];
    if (change === undefined || completed.includes(index)) continue;
    const current = snapshot(change.path);
    if (current.digest === change.afterDigest) {
      completed = [...completed, index];
      atomicWrite(journalPath, encodeJson({ ...journal, completed }));
      continue;
    }
    if (current.digest !== change.beforeDigest) {
      throw new Error(`concurrent change detected for ${change.path}; no stale content was restored`);
    }
    if (change.afterContent === null) atomicRemove(change.path);
    else atomicWrite(change.path, change.afterContent);
    completed = [...completed, index];
    atomicWrite(journalPath, encodeJson({ ...journal, completed }));
    if (failAfter >= 0 && completed.length >= failAfter) throw new Error("injected multi-file failure");
  }
  atomicRemove(journalPath);
};

const validateJournalScope = (journal: Journal, inputs: ReturnType<typeof resolveInputs>) => {
  const allowed = new Set([inputs.paths.config, inputs.paths.hooks, inputs.paths.ownership]);
  if (journal.mutations.some((change) => !allowed.has(change.path)) ||
      new Set(journal.mutations.map((change) => change.path)).size !== journal.mutations.length) {
    throw new Error("recovery journal contains an unexpected or duplicate configuration target");
  }
  if (journal.operation === "install" &&
      !journal.mutations.some((change) => change.path === inputs.paths.config)) {
    const config = validateToml(snapshot(inputs.paths.config));
    if (!isObject(config.features) || config.features.hooks !== true) {
      throw new Error("preexisting Codex hooks feature changed during recovery; the current config was preserved");
    }
  }
  if (journal.operation === "update") {
    const config = validateToml(snapshot(inputs.paths.config));
    if (!isObject(config.features) || config.features.hooks !== true) {
      throw new Error("Codex hooks feature changed during update recovery; the current config was preserved");
    }
  }
  for (const change of journal.mutations) {
    if (change.afterContent === null) continue;
    if (change.path === inputs.paths.config) {
      assertHooksSemanticState(change.afterContent, journal.operation === "uninstall" ? "absent" : true);
    } else if (change.path === inputs.paths.hooks) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(change.afterContent);
      } catch {
        throw new Error("recovery journal contains malformed hooks configuration");
      }
      if (!isObject(decoded) || markerCount(decoded) !== (journal.operation === "uninstall" ? 0 : 1)) {
        throw new Error("recovery journal does not contain the required owned-hook state");
      }
    } else if (change.path === inputs.paths.ownership) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(change.afterContent);
      } catch {
        throw new Error("recovery journal contains a malformed ownership record");
      }
      if (!isObject(decoded) || decoded.version !== 1 || decoded.adapter !== "codex" ||
          decoded.executable !== inputs.executable || decoded.entrypoint !== inputs.entrypoint ||
          (journal.operation === "update" && decoded.residentProtocol !== inputs.residentProtocol)) {
        throw new Error("recovery journal ownership does not match the current packaged runtime");
      }
    }
  }
};

const recoveryConflictResult = (
  operation: "install" | "update" | "uninstall",
  inputs: ReturnType<typeof resolveInputs>,
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
        executable: "review-tool",
        arguments: [`--${journal.operation}`],
        request: { version: 1, operation: journal.operation, codexHome: inputs.home, proposalDigest: journal.proposalDigest },
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

const previewChanges = (mutations: ReadonlyArray<Mutation>) => mutations.map((change) => ({
  file: change.path,
  action: change.afterContent === null ? "remove" : change.beforeDigest === missingDigest ? "create" : "update",
  description: change.description,
  beforeDigest: change.beforeDigest,
  afterDigest: change.afterDigest,
}));

const ownedChanges = (inputs: ReturnType<typeof resolveInputs>) => ({
  runtime: {
    executable: inputs.executable,
    entrypoint: inputs.entrypoint,
    parserEntrypoint: packagedRuntimeEntrypoints(inputs.entrypoint).parser,
    residentEntrypoint: packagedRuntimeEntrypoints(inputs.entrypoint).resident,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
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
    handlers: [ownedHook(inputs.executable, inputs.entrypoint)],
  },
  ownership: {
    file: inputs.paths.ownership,
    version: OWNERSHIP_VERSION,
    adapter: "codex",
  },
});

export const previewCodexInstallation = (request: InstallationRequest): InstallationResult => {
  const home = resolveInputs(request).home;
  try {
    const inputs = resolveInputs(request);
    const host = compatibility(inputs);
    if (!host.supported) return unsupportedResult("install-preview", inputs, host);
    const pendingJournal = readJournal(inputs.paths.journal);
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
        sourceEgressAuthorized: false,
        recovery: {
          required: true,
          operation: pendingJournal.operation,
          proposalDigest: pendingJournal.proposalDigest,
          completedFiles: pendingJournal.completed.length,
          totalFiles: pendingJournal.mutations.length,
        },
        completed: pendingJournal.completed.map((index) => pendingJournal.mutations[index]?.description).filter((value) => value !== undefined),
        pending: [`resume the journaled ${pendingJournal.operation} with its original proposal digest`],
      };
    }
    const plan = makeInstallPlan(request);
    return {
      version: RESULT_VERSION,
      operation: "install-preview",
      status: "preview",
      host: { adapter: "codex", home: plan.inputs.home, compatibility: host },
      proposal: {
        digest: plan.digest,
        changes: previewChanges(plan.mutations),
        ownedChanges: ownedChanges(plan.inputs),
      },
      installed: plan.alreadyInstalled,
      sourceEgressAuthorized: false,
      recovery: { required: false },
      trust: {
        status: "native-confirmation-required",
        guidance: "Start Codex normally in the repository and approve its native repository and hook review prompts. No trust record or bypass flag was changed.",
      },
      completed: [],
      pending: ["install using this proposal digest", "enable each repository separately"],
    };
  } catch (cause) {
    const inputs = resolveInputs(request);
    return {
      ...conflictResult("install-preview", cause instanceof Error ? cause.message : "installation preview failed", home),
      host: { adapter: "codex", home, compatibility: compatibility(inputs) },
    };
  }
};

/** Read-only ownership/configuration inspection independent of host compatibility. */
export const inspectCodexInstallation = (request: InstallationRequest): InstallationResult => {
  const inputs = resolveInputs(request);
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
    const plan = makeInstallPlan(request);
    return {
      version: RESULT_VERSION,
      operation: "inspect-installation",
      status: plan.alreadyInstalled ? "installed" : "missing",
      installed: plan.alreadyInstalled,
      host: { adapter: "codex", home: plan.inputs.home },
    };
  } catch (cause) {
    return conflictResult(
      "inspect-installation",
      cause instanceof Error ? cause.message : "installation inspection failed",
      inputs.home,
    );
  }
};

const updateRecoveryCommand = (
  inputs: ReturnType<typeof resolveInputs>,
  proposalDigest: string,
) => ({
  executable: "review-tool",
  arguments: ["--update"],
  request: { version: 1, operation: "update", codexHome: inputs.home, proposalDigest },
});

export const previewCodexUpdate = (request: InstallationRequest): InstallationResult => {
  const home = resolveInputs(request).home;
  try {
    const inputs = resolveInputs(request);
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
        preserved: ["repository grants", "credentials", "user rules", "independent hooks", "in-flight work"],
        completed: pendingJournal.completed
          .map((index) => pendingJournal.mutations[index]?.description)
          .filter((value) => value !== undefined),
        pending: ["resume the journaled update with its original proposal digest"],
      };
    }
    const plan = makeUpdatePlan(request);
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
          entrypoint: plan.record.entrypoint,
          residentProtocol: plan.record.residentProtocol,
        },
        target: {
          packageVersion: inputs.packageVersion,
          runtimeVersion: process.version,
          executable: inputs.executable,
          entrypoint: inputs.entrypoint,
          residentProtocol: inputs.residentProtocol,
          hook: ownedChanges(inputs).hook,
        },
      },
      alreadyCurrent: plan.alreadyCurrent,
      automaticUpdate: false,
      sourceEgressAuthorized: false,
      preserved: ["repository grants", "credentials", "user rules", "independent hooks", "in-flight work"],
      trust: {
        modified: false,
        status: plan.alreadyCurrent ? "unchanged" : "renewal-required",
        guidance: plan.alreadyCurrent
          ? "The exact owned hook definition is already current."
          : "After current work completes, restart Codex normally and approve renewed native hook trust if prompted. No trust record or bypass flag was changed.",
      },
      restart: { required: !plan.alreadyCurrent, processesStopped: false },
      completed: [],
      pending: plan.alreadyCurrent ? [] : ["update using this proposal digest", "restart Codex after current work completes"],
    };
  } catch (cause) {
    if (cause instanceof ResidentProtocolIncompatible) {
      return protocolConflictResult("update-preview", cause, home);
    }
    return conflictResult("update-preview", cause instanceof Error ? cause.message : "update preview failed", home);
  }
};

export const updateCodexIntegration = async (request: InstallationRequest): Promise<InstallationResult> => {
  const inputs = resolveInputs(request);
  const initialCompatibility = compatibility(inputs);
  if (!initialCompatibility.supported) return unsupportedResult("update", inputs, initialCompatibility);
  try {
    return await withLock(inputs.paths.lock, async () => {
      const currentCompatibility = compatibility(inputs);
      if (!currentCompatibility.supported) return unsupportedResult("update", inputs, currentCompatibility);
      const existingJournal = readJournal(inputs.paths.journal);
      if (existingJournal !== undefined) {
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
            error: { code: "recovery_required", message: "a prior operation is incomplete; recover it with its original operation and proposal digest" },
            recovery: {
              proposalDigest: existingJournal.proposalDigest,
              completedFiles: existingJournal.completed.length,
              totalFiles: existingJournal.mutations.length,
              command: existingJournal.operation === "update"
                ? updateRecoveryCommand(inputs, existingJournal.proposalDigest)
                : {
                    executable: "review-tool",
                    arguments: [`--${existingJournal.operation}`],
                    request: { version: 1, operation: existingJournal.operation, codexHome: inputs.home, proposalDigest: existingJournal.proposalDigest },
                  },
            },
            completed: existingJournal.completed
              .map((index) => existingJournal.mutations[index]?.description)
              .filter((value) => value !== undefined),
            pending: [`resume the journaled ${existingJournal.operation}`],
          };
        }
        try {
          applyJournal(inputs.paths.journal, existingJournal);
        } catch (cause) {
          return recoveryConflictResult("update", inputs, existingJournal, cause);
        }
        return {
          version: RESULT_VERSION,
          operation: "update",
          status: "updated",
          host: { adapter: "codex", home: inputs.home },
          resumed: true,
          preserved: ["repository grants", "credentials", "user rules", "independent hooks", "in-flight work"],
          trust: { modified: false, status: "renewal-required", bypassUsed: false },
          restart: { required: true, processesStopped: false },
          completed: existingJournal.mutations.map((change) => change.description),
          pending: ["restart Codex after current work completes and approve renewed hook trust if prompted"],
        };
      }
      const plan = makeUpdatePlan(request);
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
          preserved: ["repository grants", "credentials", "user rules", "independent hooks", "in-flight work"],
          trust: { modified: false, status: "unchanged", bypassUsed: false },
          restart: { required: false, processesStopped: false },
          completed: [],
          pending: [],
        };
      }
      const journal: Journal = {
        version: 1,
        operation: "update",
        proposalDigest: plan.digest,
        completed: [],
        mutations: plan.mutations,
      };
      try {
        applyJournal(inputs.paths.journal, journal);
      } catch (cause) {
        const current = readJournal(inputs.paths.journal);
        return {
          version: RESULT_VERSION,
          operation: "update",
          status: "partial",
          host: { adapter: "codex", home: inputs.home },
          error: { code: "partial_completion", message: cause instanceof Error ? cause.message : "update stopped after partial completion" },
          recovery: {
            proposalDigest: plan.digest,
            completedFiles: current?.completed.length ?? 0,
            totalFiles: plan.mutations.length,
            command: updateRecoveryCommand(inputs, plan.digest),
          },
          preserved: ["repository grants", "credentials", "user rules", "independent hooks", "in-flight work"],
          completed: (current?.completed ?? [])
            .map((index) => plan.mutations[index]?.description)
            .filter((value) => value !== undefined),
          pending: ["rerun update with the same proposal digest to resume safely"],
        };
      }
      return {
        version: RESULT_VERSION,
        operation: "update",
        status: "updated",
        host: { adapter: "codex", home: inputs.home },
        preserved: ["repository grants", "credentials", "user rules", "independent hooks", "in-flight work"],
        trust: { modified: false, status: "renewal-required", bypassUsed: false },
        restart: { required: true, processesStopped: false },
        completed: plan.mutations.map((change) => change.description),
        pending: ["restart Codex after current work completes and approve renewed hook trust if prompted"],
      };
    });
  } catch (cause) {
    if (cause instanceof ResidentProtocolIncompatible) {
      return protocolConflictResult("update", cause, inputs.home);
    }
    return conflictResult("update", cause instanceof Error ? cause.message : "update failed", inputs.home);
  }
};

export const installCodexIntegration = async (request: InstallationRequest): Promise<InstallationResult> => {
  const inputs = resolveInputs(request);
  const initialCompatibility = compatibility(inputs);
  if (!initialCompatibility.supported) return unsupportedResult("install", inputs, initialCompatibility);
  try {
    return await withLock(inputs.paths.lock, async () => {
      const currentCompatibility = compatibility(inputs);
      if (!currentCompatibility.supported) return unsupportedResult("install", inputs, currentCompatibility);
      const existingJournal = readJournal(inputs.paths.journal);
      if (existingJournal !== undefined) {
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
            error: { code: "recovery_required", message: "a prior installation is incomplete; rerun install with its original proposal digest" },
            recovery: { proposalDigest: existingJournal.proposalDigest, completedFiles: existingJournal.completed.length, totalFiles: existingJournal.mutations.length },
            completed: existingJournal.completed.map((index) => existingJournal.mutations[index]?.description).filter((value) => value !== undefined),
            pending: ["resume the journaled installation"],
          };
        }
        try {
          applyJournal(inputs.paths.journal, existingJournal);
        } catch (cause) {
          return recoveryConflictResult("install", inputs, existingJournal, cause);
        }
        return {
          version: RESULT_VERSION,
          operation: "install",
          status: "installed",
          host: { adapter: "codex", home: inputs.home },
          resumed: true,
          sourceEgressAuthorized: false,
          completed: existingJournal.mutations.map((change) => change.description),
          pending: ["enable a canonical repository with matching-digest approval", "approve native Codex trust prompts when shown"],
        };
      }
      const plan = makeInstallPlan(request);
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
          sourceEgressAuthorized: false,
          completed: [],
          pending: ["enable a canonical repository separately"],
        };
      }
      const journal: Journal = { version: 1, operation: "install", proposalDigest: plan.digest, completed: [], mutations: plan.mutations };
      try {
        applyJournal(inputs.paths.journal, journal);
      } catch (cause) {
        const current = readJournal(inputs.paths.journal);
        return {
          version: RESULT_VERSION,
          operation: "install",
          status: "partial",
          host: { adapter: "codex", home: inputs.home },
          error: { code: "partial_completion", message: cause instanceof Error ? cause.message : "installation stopped after partial completion" },
          recovery: { proposalDigest: plan.digest, completedFiles: current?.completed.length ?? 0, totalFiles: plan.mutations.length },
          completed: (current?.completed ?? []).map((index) => plan.mutations[index]?.description).filter((value) => value !== undefined),
          pending: ["rerun install with the same proposal digest to resume safely"],
        };
      }
      return {
        version: RESULT_VERSION,
        operation: "install",
        status: "installed",
        host: { adapter: "codex", home: inputs.home },
        sourceEgressAuthorized: false,
        completed: plan.mutations.map((change) => change.description),
        pending: ["enable a canonical repository with matching-digest approval", "approve native Codex trust prompts when shown"],
        trust: { modified: false, bypassUsed: false },
      };
    });
  } catch (cause) {
    return conflictResult("install", cause instanceof Error ? cause.message : "installation failed", inputs.home);
  }
};

export const uninstallCodexIntegration = async (request: InstallationRequest): Promise<InstallationResult> => {
  const inputs = resolveInputs(request);
  try {
    return await withLock(inputs.paths.lock, async () => {
      const existingJournal = readJournal(inputs.paths.journal);
      if (existingJournal !== undefined) {
        try {
          validateJournalScope(existingJournal, inputs);
        } catch (cause) {
          return recoveryConflictResult("uninstall", inputs, existingJournal, cause);
        }
        if (request.proposalDigest === existingJournal.proposalDigest && existingJournal.operation === "uninstall") {
          try {
            applyJournal(inputs.paths.journal, existingJournal);
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
            remaining: ["repository grants", "credentials", "user rules", "already dispatched requests cannot be recalled"],
          };
        }
        throw new Error("another journaled operation requires recovery before uninstall");
      }
      const plan = makeUninstallPlan(request);
      if (plan.alreadyRemoved) {
        return {
          version: RESULT_VERSION,
          operation: "uninstall",
          status: "already-uninstalled",
          host: { adapter: "codex", home: inputs.home },
          proposal: { digest: plan.digest, changes: [] },
          completed: [],
          pending: [],
          remaining: ["repository grants", "credentials", "user rules", "already dispatched requests cannot be recalled"],
        };
      }
      if (request.proposalDigest === undefined) {
        return {
          version: RESULT_VERSION,
          operation: "uninstall",
          status: "preview",
          host: { adapter: "codex", home: inputs.home },
          proposal: { digest: plan.digest, changes: previewChanges(plan.mutations) },
          completed: [],
          pending: ["rerun uninstall with this proposal digest"],
          remaining: ["repository grants", "credentials", "user rules", "already dispatched requests cannot be recalled"],
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
      const journal: Journal = { version: 1, operation: "uninstall", proposalDigest: plan.digest, completed: [], mutations: plan.mutations };
      try {
        applyJournal(inputs.paths.journal, journal);
      } catch (cause) {
        const current = readJournal(inputs.paths.journal);
        return {
          version: RESULT_VERSION,
          operation: "uninstall",
          status: "partial",
          host: { adapter: "codex", home: inputs.home },
          error: { code: "partial_completion", message: cause instanceof Error ? cause.message : "uninstall stopped after partial completion" },
          recovery: { proposalDigest: plan.digest, completedFiles: current?.completed.length ?? 0, totalFiles: plan.mutations.length },
          completed: (current?.completed ?? []).map((index) => plan.mutations[index]?.description).filter((value) => value !== undefined),
          pending: ["rerun uninstall with the same proposal digest to resume safely"],
        };
      }
      return {
        version: RESULT_VERSION,
        operation: "uninstall",
        status: "uninstalled",
        host: { adapter: "codex", home: inputs.home },
        completed: plan.mutations.map((change) => change.description),
        pending: [],
        remaining: ["repository grants", "credentials", "user rules", "already dispatched requests cannot be recalled"],
      };
    });
  } catch (cause) {
    return conflictResult("uninstall", cause instanceof Error ? cause.message : "uninstall failed", inputs.home);
  }
};

export const codexInstallation = {
  marker: OWNED_MARKER,
  preview: previewCodexInstallation,
  install: installCodexIntegration,
  uninstall: uninstallCodexIntegration,
  inspect: inspectCodexInstallation,
};
