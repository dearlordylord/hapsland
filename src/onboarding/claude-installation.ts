import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { atomicInstallationFile } from "./atomic-installation-file.ts";

import { withInstallationLock } from "./installation-lock.ts";
import { canonicalJson as canonical, reconcileOwnedEvent, removeMarkedHandlers, retainedHookSubset } from "./hook-reconciliation.ts";

const MARKER = "--review-tool-owned=claude-v1";
const COMPOSED_MARKER = "--review-tool-composed-owned=claude-v1";
const PROFILE = "2.1.218";
const OWNERSHIP_VERSION = 1;
type JsonObject = Record<string, unknown>;

export interface ClaudeInstallationRequest {
  readonly claudeHome?: string;
  readonly claudeExecutable?: string;
  readonly proposalDigest?: string;
  readonly reinstall?: boolean;
}

interface OwnedRecord {
  readonly version: 1;
  readonly adapter: "claude";
  readonly home: string;
  readonly hookDigest: string;
  readonly command: string;
  readonly hookGroups?: Record<string, unknown>;
  readonly composed?: { readonly stopDigest: string; readonly promptDigest: string; readonly subagentStopDigest?: string; readonly preToolUseDigest?: string };
}

const object = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const error = (cause: unknown) => cause instanceof Error ? cause.message : "installation failed";

const paths = (home: string) => ({
  settings: join(home, "settings.json"),
  ownership: join(home, ".realtime-review-tool", "claude-installation-v1.json"),
  lock: join(home, ".realtime-review-tool", "claude-installation.lock"),
});

const file = (path: string): string | undefined => {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error(`configuration is not a regular file: ${path}`);
    return readFileSync(path, "utf8");
  } catch (cause) {
    if (object(cause) && cause.code === "ENOENT") return undefined;
    throw cause;
  }
};

const parseObject = (content: string | undefined, label: string): JsonObject => {
  if (content === undefined) return {};
  try {
    const value: unknown = JSON.parse(content);
    if (object(value)) return value;
  } catch { /* reported below */ }
  throw new Error(`${label} must contain a JSON object`);
};

const readRecord = (path: string): OwnedRecord | undefined => {
  const content = file(path);
  if (content === undefined) return undefined;
  const value = parseObject(content, "Claude ownership record");
  if (value.version !== OWNERSHIP_VERSION || value.adapter !== "claude" || typeof value.home !== "string" ||
      typeof value.hookDigest !== "string" || typeof value.command !== "string" ||
      (value.composed !== undefined && (!object(value.composed) ||
        typeof value.composed.stopDigest !== "string" || typeof value.composed.promptDigest !== "string" ||
        (value.composed.subagentStopDigest !== undefined && typeof value.composed.subagentStopDigest !== "string") ||
        (value.composed.preToolUseDigest !== undefined && typeof value.composed.preToolUseDigest !== "string")))) {
    throw new Error("Claude ownership record has an unsupported shape");
  }
  return value as unknown as OwnedRecord;
};

const countMarker = (value: unknown): number => typeof value === "string"
  ? value.includes(MARKER) ? 1 : 0
  : Array.isArray(value) ? value.reduce<number>((sum, item) => sum + countMarker(item), 0)
    : object(value) ? Object.values(value).reduce<number>((sum, item) => sum + countMarker(item), 0) : 0;

const groups = (settings: JsonObject): ReadonlyArray<unknown> => {
  if (settings.hooks === undefined) return [];
  if (!object(settings.hooks)) throw new Error("Claude settings hooks must be an object");
  const post = settings.hooks.PostToolUse;
  if (post === undefined) return [];
  if (!Array.isArray(post)) throw new Error("Claude settings PostToolUse must be an array");
  return post;
};

const owned = (settings: JsonObject): { index: number; group: unknown } | undefined => {
  if (countMarker(settings) > 1) throw new Error("duplicate owned Claude hook markers require reconciliation");
  const foundGroups = groups(settings).map((group, index) => ({ group, index })).filter(({ group }) => countMarker(group) === 1 || JSON.stringify(group).includes(COMPOSED_MARKER));
  if (foundGroups.length > 1) throw new Error("duplicate owned Claude PostToolUse groups require reconciliation");
  const found = foundGroups[0];
  if (countMarker(settings) === 1 && found === undefined) throw new Error("owned Claude marker is outside PostToolUse");
  return found;
};

const withGroups = (settings: JsonObject, next: ReadonlyArray<unknown>): JsonObject => {
  const hooks = { ...(settings.hooks as JsonObject | undefined) };
  if (next.length === 0) delete hooks.PostToolUse;
  else hooks.PostToolUse = next;
  const result = { ...settings };
  if (Object.keys(hooks).length === 0) delete result.hooks;
  else result.hooks = hooks;
  return result;
};

const withComposedGroup = (
  settings: JsonObject, event: "PreToolUse" | "Stop" | "SubagentStop" | "UserPromptSubmit", next: unknown | undefined,
  expectedDigest: string | undefined,
  restoreMissing = false,
  expectedGroup?: unknown,
): JsonObject => reconcileOwnedEvent(settings, event, next, {
  marker: COMPOSED_MARKER,
  fingerprint: (group) => digest(canonical(group)),
  expectedFingerprint: expectedDigest,
  expectedGroup,
  restoreMissing,
  label: "Claude",
});

const host = (request: ClaudeInstallationRequest) => {
  const executable = request.claudeExecutable ?? "claude";
  const run = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 2_000 });
  const observed = run.status === 0 ? run.stdout.trim() : "unavailable";
  return { supported: observed === PROFILE || observed === `${PROFILE} (Claude Code)`, observed, required: `Claude Code ${PROFILE}` };
};

const inputs = (request: ClaudeInstallationRequest) => {
  const home = resolve(request.claudeHome ?? join(homedir(), ".claude"));
  const runtime = resolve(process.env.REVIEW_INSTALL_RUNTIME ?? process.execPath);
  let entrypoint = resolve(process.env.REVIEW_INSTALL_ENTRYPOINT ?? process.argv[1] ?? "dist/cli.js");
  try { entrypoint = realpathSync(entrypoint); } catch { /* readiness reports missing path */ }
  const command = `${quote(runtime)} ${quote(entrypoint)} --claude-hook --controlled-writer --composed-edit-hook ${MARKER}`;
  const composed = (kind: "background" | "stop" | "prompt" | "before-edit") =>
    `${kind === "before-edit" ? "exec " : ""}${quote(runtime)} ${quote(entrypoint)} --composed-${kind}-hook --composed-host=claude-code ${COMPOSED_MARKER}`;
  const group = { matcher: "Edit|Write", hooks: [
    { type: "command", command, timeout: 5 },
    { type: "command", command: composed("background"), timeout: 25, async: true },
  ] };
  const stopGroup = { hooks: [{ type: "command", command: composed("stop"), timeout: 5 }] };
  const preGroup = { matcher: "Edit|Write", hooks: [{ type: "command", command: composed("before-edit"), timeout: 5 }] };
  const promptGroup = { hooks: [{ type: "command", command: composed("prompt"), timeout: 4 }] };
  return { home, runtime, entrypoint, command, group, preGroup, stopGroup, promptGroup,
    paths: paths(home), host: host(request) };
};

const ready = (input: ReturnType<typeof inputs>) => {
  const runtime = spawnSync(input.runtime, ["-e", "process.stdout.write(process.version)"], { encoding: "utf8", timeout: 2_000 });
  const version = runtime.status === 0 ? runtime.stdout.trim() : "unavailable";
  let entrypointReady = false;
  try { entrypointReady = statSync(input.entrypoint).isFile(); } catch { /* reported as unavailable */ }
  return {
    supported: input.host.supported && version === "v24.20.0" && entrypointReady,
    host: input.host,
    runtime: { observed: version, required: "v24.20.0" },
    entrypoint: { path: input.entrypoint, ready: entrypointReady },
  };
};

type Kind = "install" | "update" | "uninstall";
const plan = (kind: Kind, request: ClaudeInstallationRequest) => {
  const input = inputs(request);
  const beforeSettings = file(input.paths.settings);
  const beforeRecord = file(input.paths.ownership);
  const originalSettings = parseObject(beforeSettings, "Claude settings.json");
  const settings = request.reinstall ? removeMarkedHandlers(originalSettings, [MARKER, COMPOSED_MARKER]) : originalSettings;
  let previousRecord: OwnedRecord | undefined;
  try { previousRecord = readRecord(input.paths.ownership); } catch (cause) { if (!request.reinstall) throw cause; }
  if (previousRecord !== undefined && previousRecord.home !== input.home) throw new Error("Claude ownership record belongs to another home");
  const record = request.reinstall ? undefined : previousRecord;
  const current = owned(settings);
  if (record === undefined) {
    withComposedGroup(settings, "PreToolUse", undefined, undefined);
    withComposedGroup(settings, "Stop", undefined, undefined);
    withComposedGroup(settings, "SubagentStop", undefined, undefined);
    withComposedGroup(settings, "UserPromptSubmit", undefined, undefined);
  }
  if (record?.home !== undefined && record.home !== input.home) throw new Error("Claude ownership record belongs to another home");
  if (current !== undefined && record === undefined) throw new Error("owned Claude hook has no ownership record");
  if (record !== undefined && current !== undefined && digest(canonical(current.group)) !== record.hookDigest &&
      !retainedHookSubset(current.group, record.hookGroups?.PostToolUse)) {
    throw new Error("owned Claude hook is missing or locally modified");
  }
  const composed = record?.composed;
  if (kind === "install" && record !== undefined) throw new Error("Claude integration already installed; use update");
  if (kind === "update" && previousRecord === undefined && !request.reinstall) throw new Error("Claude integration is not installed");
  const nextGroups = [...groups(settings)];
  if (kind === "uninstall") {
    if (current !== undefined) nextGroups.splice(current.index, 1);
  } else if (current === undefined) nextGroups.push(input.group);
  else nextGroups[current.index] = input.group;
  const nextSettings = kind === "uninstall" && record === undefined ? settings
    : withComposedGroup(
      withComposedGroup(
        withComposedGroup(
          withComposedGroup(withGroups(settings, nextGroups), "PreToolUse",
            kind === "uninstall" ? undefined : input.preGroup, composed?.preToolUseDigest, true, record?.hookGroups?.PreToolUse),
          "Stop", kind === "uninstall" ? undefined : input.stopGroup, composed?.stopDigest, true, record?.hookGroups?.Stop),
        "SubagentStop", kind === "uninstall" ? undefined : input.stopGroup, composed?.subagentStopDigest, true, record?.hookGroups?.SubagentStop),
      "UserPromptSubmit", kind === "uninstall" ? undefined : input.promptGroup, composed?.promptDigest, true, record?.hookGroups?.UserPromptSubmit,
    );
  const afterSettings = kind === "uninstall" && record === undefined ? beforeSettings : encode(nextSettings);
  const afterRecord = kind === "uninstall" ? undefined : encode({
    version: OWNERSHIP_VERSION, adapter: "claude", home: input.home,
    hookDigest: digest(canonical(input.group)), command: input.command,
    hookGroups: { PostToolUse: input.group, PreToolUse: input.preGroup, Stop: input.stopGroup, SubagentStop: input.stopGroup, UserPromptSubmit: input.promptGroup },
    composed: { preToolUseDigest: digest(canonical(input.preGroup)), stopDigest: digest(canonical(input.stopGroup)), promptDigest: digest(canonical(input.promptGroup)),
      subagentStopDigest: digest(canonical(input.stopGroup)) },
  } satisfies OwnedRecord);
  const proposalDigest = digest(canonical({ version: 1, adapter: "claude", operation: kind, home: input.home,
    beforeSettings: digest(beforeSettings ?? "<missing>"), beforeRecord: digest(beforeRecord ?? "<missing>"),
    afterSettings: digest(afterSettings ?? "<missing>"), afterRecord: digest(afterRecord ?? "<missing>") }));
  return { input, beforeSettings, beforeRecord, afterSettings, afterRecord, proposalDigest,
    noChange: beforeSettings === afterSettings && beforeRecord === afterRecord };
};

const resultError = (operation: string, cause: unknown, home?: string) => ({
  version: 1 as const, operation, status: "conflict" as const, home, error: { message: error(cause) },
});

const preview = (kind: Kind, request: ClaudeInstallationRequest) => {
  const operation = kind === "install" ? "install-preview" : kind === "update" ? "update-preview" : "uninstall";
  try {
    const input = inputs(request);
    const compatibility = ready(input);
    if (kind !== "uninstall" && !compatibility.supported) return {
      version: 1 as const, operation, status: "unsupported" as const, host: { adapter: "claude", home: input.home, compatibility },
    };
    const next = plan(kind, request);
    return { version: 1 as const, operation, status: "preview" as const,
      host: { adapter: "claude", home: input.home, compatibility },
      proposal: { digest: next.proposalDigest, changes: [
        ...(next.beforeSettings === next.afterSettings ? [] : [{ path: input.paths.settings, description: "owned PostToolUse, PreToolUse, Stop, SubagentStop and UserPromptSubmit hooks" }]),
        ...(next.beforeRecord === next.afterRecord ? [] : [{ path: input.paths.ownership, description: "Claude ownership record" }]),
      ], ownedChanges: { hooks: { file: input.paths.settings, groups: kind === "uninstall" ? next.beforeRecord === undefined ? {} : readRecord(input.paths.ownership)?.hookGroups ?? {} : { PostToolUse: input.group, PreToolUse: input.preGroup, Stop: input.stopGroup, SubagentStop: input.stopGroup, UserPromptSubmit: input.promptGroup } }, ownershipRecord: input.paths.ownership } },
      installed: next.noChange && kind !== "uninstall",
      alreadyCurrent: next.noChange,
      trust: { status: "native-confirmation-required", guidance: "Claude Code owns workspace trust and hook approval; open the repository normally and review native prompts." },
      pending: ["apply this proposal digest", "review effective file settings and credential access"] };
  } catch (cause) { return resultError(operation, cause, request.claudeHome); }
};

const apply = async (kind: Kind, request: ClaudeInstallationRequest) => {
  const operation = kind;
  try {
    const input = inputs(request);
    if (kind !== "uninstall" && !ready(input).supported) return { version: 1 as const, operation, status: "unsupported" as const, host: input.host };
    return await withInstallationLock(input.paths.lock, async () => {
      const next = plan(kind, request);
      if (request.proposalDigest === undefined) return preview(kind, request);
      if (request.proposalDigest !== next.proposalDigest) return {
        version: 1 as const, operation, status: "proposal-mismatch" as const,
        error: { message: "Claude settings changed since preview; obtain a new proposal" },
      };
      if (next.noChange) return { version: 1 as const, operation, status: "already-current" as const };
      // Settings is applied last so a failed record write cannot enable a new hook.
      try {
        if (file(input.paths.ownership) !== next.beforeRecord || file(input.paths.settings) !== next.beforeSettings) throw new Error("Claude configuration changed during apply; obtain a fresh preview");
        atomicInstallationFile(input.paths.ownership, next.afterRecord);
        if (file(input.paths.settings) !== next.beforeSettings || file(input.paths.ownership) !== next.afterRecord) throw new Error("Claude configuration changed during apply; current settings were preserved");
        atomicInstallationFile(input.paths.settings, next.afterSettings);
      } catch (cause) {
        try {
          if (file(input.paths.settings) === next.beforeSettings && file(input.paths.ownership) === next.afterRecord) atomicInstallationFile(input.paths.ownership, next.beforeRecord);
        } catch { /* preserve the original error and expose the partial state to inspection */ }
        throw cause;
      }
      return { version: 1 as const, operation, status: "complete" as const,
        trust: { status: "native-confirmation-required" } };
    });
  } catch (cause) { return resultError(operation, cause, request.claudeHome); }
};

export const previewClaudeInstallation = (request: ClaudeInstallationRequest) => preview("install", request);
export const installClaudeIntegration = async (request: ClaudeInstallationRequest) => apply("install", request);
export const previewClaudeUpdate = (request: ClaudeInstallationRequest) => preview("update", request);
export const updateClaudeIntegration = async (request: ClaudeInstallationRequest) => apply("update", request);
export const uninstallClaudeIntegration = async (request: ClaudeInstallationRequest) =>
  request.proposalDigest === undefined ? preview("uninstall", request) : apply("uninstall", request);

/** Include damaged owned state so an update reports it instead of silently skipping the client. */
export const hasClaudeRegistration = (request: ClaudeInstallationRequest): boolean => {
  const selected = paths(resolve(request.claudeHome ?? join(homedir(), ".claude")));
  if (file(selected.ownership) !== undefined) return true;
  const settings = file(selected.settings) ?? "";
  return settings.includes(MARKER) || settings.includes(COMPOSED_MARKER);
};

export const inspectClaudeInstallation = (request: ClaudeInstallationRequest) => {
  try {
    const input = inputs(request);
    const settings = parseObject(file(input.paths.settings), "Claude settings.json");
    const record = readRecord(input.paths.ownership);
    const current = owned(settings);
    if (record === undefined) {
      withComposedGroup(settings, "PreToolUse", undefined, undefined);
      withComposedGroup(settings, "Stop", undefined, undefined);
      withComposedGroup(settings, "SubagentStop", undefined, undefined);
      withComposedGroup(settings, "UserPromptSubmit", undefined, undefined);
    }
    if (record === undefined && current === undefined) return { version: 1 as const, operation: "inspect-installation", status: "ready" as const, installed: false };
    if (record === undefined || current === undefined || record.home !== input.home || digest(canonical(current.group)) !== record.hookDigest) {
      throw new Error("owned Claude hook and ownership record disagree");
    }
    if (record.composed !== undefined) {
      withComposedGroup(settings, "PreToolUse", undefined, record.composed.preToolUseDigest);
      withComposedGroup(settings, "Stop", undefined, record.composed.stopDigest);
      withComposedGroup(settings, "SubagentStop", undefined, record.composed.subagentStopDigest);
      withComposedGroup(settings, "UserPromptSubmit", undefined, record.composed.promptDigest);
    }
    return { version: 1 as const, operation: "inspect-installation", status: "ready" as const, installed: true };
  } catch (cause) { return resultError("inspect-installation", cause, request.claudeHome); }
};

export const diagnoseClaudeIntegration = (request: ClaudeInstallationRequest) => {
  const input = inputs(request);
  const compatibility = ready(input);
  const inspection = inspectClaudeInstallation(request);
  const checks = [
    { stage: "host", status: compatibility.host.supported ? "ready" : "unsupported", observed: compatibility.host },
    { stage: "runtime", status: compatibility.runtime.observed === compatibility.runtime.required ? "ready" : "unsupported", observed: compatibility.runtime },
    { stage: "configuration-ownership", status: inspection.status === "conflict" ? "conflict" : inspection.installed ? "ready" : "missing", observed: inspection },
    { stage: "native-trust", status: "unknown", observed: "Claude Code workspace trust and hook approval are host-owned" },
    { stage: "file-selection", status: "unknown", observed: "inspect effective file settings" },
  ];
  return { version: 1 as const, operation: "doctor" as const,
    status: checks.some((check) => check.status === "conflict" || check.status === "unsupported" || check.status === "missing") ? "not-ready" as const : "unknown" as const,
    offline: true as const, readOnly: true as const, providerCalls: 0 as const, checks };
};
