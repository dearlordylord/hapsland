import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

const OWNERSHIP_VERSION = 1 as const;
const RESULT_VERSION = 1 as const;
const OWNED_MARKER = "--review-tool-owned=codex-v1";
const OWNED_MATCHER = "^(apply_patch|Edit|Write|Bash)$";
const PRODUCT_DIRECTORY = ".realtime-review-tool";

type JsonObject = { [key: string]: unknown };

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
  readonly operation: "install" | "uninstall";
  readonly proposalDigest: string;
  readonly completed: ReadonlyArray<number>;
  readonly mutations: ReadonlyArray<Mutation>;
}

export type InstallationResult =
  | JsonObject
  | { readonly version: 1; readonly operation: string; readonly status: string };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
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
  const header = /^\s*\[features\]\s*(?:#.*)?$/m;
  const match = header.exec(content);
  if (match === null) {
    const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
    return `${content}${separator}${content.length === 0 ? "" : "\n"}[features]\nhooks = true\n`;
  }
  const insertAt = match.index + match[0].length;
  return `${content.slice(0, insertAt)}\nhooks = true${content.slice(insertAt)}`;
};

const disableOwnedFeature = (content: string): string => {
  const lines = content.split("\n");
  let inFeatures = false;
  let removed = false;
  const next = lines.filter((line) => {
    if (/^\s*\[/.test(line)) inFeatures = /^\s*\[features\]\s*(?:#.*)?$/.test(line);
    if (inFeatures && /^\s*hooks\s*=\s*true\s*(?:#.*)?$/.test(line) && !removed) {
      removed = true;
      return false;
    }
    return true;
  });
  if (!removed) throw new Error("owned Codex feature entry is missing or locally modified");
  return next.join("\n");
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
  operation: "install" | "uninstall",
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

const compatibility = (codexExecutable: string) => {
  const run = spawnSync(codexExecutable, ["--version"], { encoding: "utf8", timeout: 2_000 });
  const observed = run.status === 0 ? run.stdout.trim() : "unavailable";
  return {
    supported: /^codex-cli 0\.155\.1$/.test(observed),
    observed,
    required: "codex-cli 0.155.1",
  };
};

const resolveInputs = (request: InstallationRequest) => {
  const home = resolve(request.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"));
  const executable = resolve(process.env.REVIEW_INSTALL_RUNTIME ?? process.execPath);
  const entrypoint = resolve(process.env.REVIEW_INSTALL_ENTRYPOINT ?? process.argv[1] ?? "dist/cli.js");
  const codexExecutable = request.codexExecutable ?? "codex";
  return { home, executable, entrypoint, codexExecutable, paths: pathsFor(home) };
};

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
  const record: OwnershipRecord = {
    version: OWNERSHIP_VERSION,
    adapter: "codex",
    codexHome: inputs.home,
    runtimeVersion: process.version,
    executable: inputs.executable,
    entrypoint: inputs.entrypoint,
    marker: OWNED_MARKER,
    hookFingerprint: fingerprint,
    owned: [
      ...(featureOwned
        ? [{ file: inputs.paths.config, kind: "feature" as const, fingerprint: sha256("features.hooks=true") }]
        : []),
      { file: inputs.paths.hooks, kind: "hook", fingerprint },
    ],
  };
  const nextOwnership = encodeJson(record);
  const mutations = [
    ...(nextConfig === config.content ? [] : [mutation(config, nextConfig, "enable Codex's native hooks feature")]),
    ...(nextHooks === hooks.content ? [] : [mutation(hooks, nextHooks, "append the owned PostToolUse adapter hook")]),
    ...(nextOwnership === ownership.content ? [] : [mutation(ownership, nextOwnership, "write the versioned ownership record")]),
  ];
  return { inputs, mutations, digest: installationDigest("install", inputs.home, mutations), alreadyInstalled: mutations.length === 0 };
};

const makeUninstallPlan = (request: InstallationRequest) => {
  const inputs = resolveInputs(request);
  const record = readOwnership(inputs.paths.ownership);
  if (record === undefined) return { inputs, mutations: [] as Array<Mutation>, digest: installationDigest("uninstall", inputs.home, []), alreadyRemoved: true };
  if (record.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home");
  const config = snapshot(inputs.paths.config);
  const hooks = snapshot(inputs.paths.hooks);
  const ownership = snapshot(inputs.paths.ownership);
  validateToml(config);
  const hookRoot = parseJsonObject(hooks);
  const nextHookRoot = removeOwnedHook(hookRoot, record.hookFingerprint);
  const nextHooks = encodeJson(nextHookRoot);
  const featureWasOwned = record.owned.some((entry) => entry.kind === "feature" && entry.file === inputs.paths.config);
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

const readJournal = (path: string): Journal | undefined => {
  if (!existsSync(path)) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.mutations) || !Array.isArray(value.completed) ||
        (value.operation !== "install" && value.operation !== "uninstall") || typeof value.proposalDigest !== "string") {
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

const previewChanges = (mutations: ReadonlyArray<Mutation>) => mutations.map((change) => ({
  file: change.path,
  action: change.afterContent === null ? "remove" : change.beforeDigest === missingDigest ? "create" : "update",
  description: change.description,
  beforeDigest: change.beforeDigest,
  afterDigest: change.afterDigest,
}));

export const previewCodexInstallation = (request: InstallationRequest): InstallationResult => {
  const home = resolveInputs(request).home;
  try {
    const inputs = resolveInputs(request);
    const host = compatibility(inputs.codexExecutable);
    const pendingJournal = readJournal(inputs.paths.journal);
    if (pendingJournal !== undefined) {
      return {
        version: RESULT_VERSION,
        operation: "install-preview",
        status: "partial",
        host: { adapter: "codex", home: inputs.home, compatibility: host },
        proposal: { digest: pendingJournal.proposalDigest, changes: previewChanges(pendingJournal.mutations) },
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
      status: host.supported ? "preview" : "unsupported",
      host: { adapter: "codex", home: plan.inputs.home, compatibility: host },
      proposal: { digest: plan.digest, changes: previewChanges(plan.mutations) },
      installed: plan.alreadyInstalled,
      sourceEgressAuthorized: false,
      recovery: { required: false },
      trust: {
        status: "native-confirmation-required",
        guidance: "Start Codex normally in the repository and approve its native repository and hook review prompts. No trust record or bypass flag was changed.",
      },
      completed: [],
      pending: host.supported ? ["install using this proposal digest", "enable each repository separately"] : ["install the supported Codex version before mutation"],
    };
  } catch (cause) {
    return conflictResult("install-preview", cause instanceof Error ? cause.message : "installation preview failed", home);
  }
};

export const installCodexIntegration = async (request: InstallationRequest): Promise<InstallationResult> => {
  const inputs = resolveInputs(request);
  try {
    return await withLock(inputs.paths.lock, async () => {
      const existingJournal = readJournal(inputs.paths.journal);
      if (existingJournal !== undefined) {
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
          const current = readJournal(inputs.paths.journal);
          return {
            version: RESULT_VERSION,
            operation: "install",
            status: "partial",
            host: { adapter: "codex", home: inputs.home },
            error: { code: "recovery_conflict", message: cause instanceof Error ? cause.message : "journal recovery could not continue" },
            recovery: { proposalDigest: existingJournal.proposalDigest, completedFiles: current?.completed.length ?? existingJournal.completed.length, totalFiles: existingJournal.mutations.length },
            completed: (current?.completed ?? existingJournal.completed).map((index) => existingJournal.mutations[index]?.description).filter((value) => value !== undefined),
            pending: ["resolve the changed pending file, then rerun with the same proposal digest"],
          };
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
      const host = compatibility(plan.inputs.codexExecutable);
      if (!host.supported) {
        return {
          version: RESULT_VERSION,
          operation: "install",
          status: "unsupported",
          host: { adapter: "codex", home: inputs.home, compatibility: host },
          completed: [],
          pending: ["install codex-cli 0.155.1; no configuration was changed"],
        };
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
        if (request.proposalDigest === existingJournal.proposalDigest && existingJournal.operation === "uninstall") {
          try {
            applyJournal(inputs.paths.journal, existingJournal);
          } catch (cause) {
            const current = readJournal(inputs.paths.journal);
            return {
              version: RESULT_VERSION,
              operation: "uninstall",
              status: "partial",
              host: { adapter: "codex", home: inputs.home },
              error: { code: "recovery_conflict", message: cause instanceof Error ? cause.message : "journal recovery could not continue" },
              recovery: { proposalDigest: existingJournal.proposalDigest, completedFiles: current?.completed.length ?? existingJournal.completed.length, totalFiles: existingJournal.mutations.length },
              completed: (current?.completed ?? existingJournal.completed).map((index) => existingJournal.mutations[index]?.description).filter((value) => value !== undefined),
              pending: ["resolve the changed pending file, then rerun with the same proposal digest"],
            };
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
};
