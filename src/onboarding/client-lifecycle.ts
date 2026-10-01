import * as Schema from "effect/Schema";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { readFileSync, realpathSync } from "node:fs";
import { atomicInstallationFile } from "./atomic-installation-file.ts";
import { hasClaudeRegistration } from "./claude-installation.ts";
import { hasCodexRegistration } from "./codex-installation.ts";
import type { SetupClient } from "./client-selection.ts";

export const clientCommands = ["setup", "update", "doctor", "repair", "reinstall", "uninstall"] as const;
export type ClientCommand = typeof clientCommands[number];
export const clients: ReadonlyArray<SetupClient> = ["claude", "codex"];
const valueFlags = ["--host", "--claude-home", "--claude-executable", "--codex-home", "--codex-executable"];
const releaseFlags = ["--target", "--tarball", "--channel", "--version"];
export const parseClientArguments = (command: ClientCommand, args: ReadonlyArray<string>) => {
  const flags = new Map<string, string>();
  let host: SetupClient | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) {
      if (host !== undefined || !clients.some(client => client === argument)) throw new Error(`Unexpected argument: ${argument}. Use hapsland ${command} [claude|codex].`);
      host = argument as SetupClient;
      continue;
    }
    const equals = argument.indexOf("=");
    const name = equals < 0 ? argument : argument.slice(0, equals);
    if (![...valueFlags, ...(command === "update" ? releaseFlags : command === "setup" || command === "repair" || command === "reinstall" ? ["--target"] : [])].includes(name)) throw new Error(`Unknown option: ${name}. Run hapsland --help.`);
    const value = equals < 0 ? args[++index] : argument.slice(equals + 1);
    if (value === undefined || value.trim() === "" || value.startsWith("--")) throw new Error(`${name} requires a nonempty value.`);
    if (flags.has(name)) throw new Error(`Repeated option: ${name}.`);
    flags.set(name, value);
  }
  const flagHost = flags.get("--host");
  if (flagHost !== undefined) {
    if (!clients.some(client => client === flagHost)) throw new Error("--host must be claude or codex.");
    if (host !== undefined && host !== flagHost) throw new Error("Positional client and --host disagree.");
    host = flagHost as SetupClient;
  }
  if (command === "update") {
    const sourceFlags = releaseFlags.filter(flag => flags.has(flag));
    if (flags.has("--target") && sourceFlags.length > 1) throw new Error("--target cannot be combined with other release options.");
    if (flags.has("--tarball") && sourceFlags.length > 1) throw new Error("--tarball cannot be combined with other release options.");
    const channel = flags.get("--channel");
    if (channel !== undefined && channel !== "latest" && channel !== "next") throw new Error("--channel must be latest or next.");
  }
  return { host, flags };
};
export const profileFields = (host: SetupClient, flags: ReadonlyMap<string, string>) => {
  const home = flags.get(`--${host}-home`);
  const executable = flags.get(`--${host}-executable`);
  return host === "claude"
    ? { host, ...(home === undefined ? {} : { claudeHome: home }), ...(executable === undefined ? {} : { claudeExecutable: executable }) }
    : { host, ...(home === undefined ? {} : { codexHome: home }), ...(executable === undefined ? {} : { codexExecutable: executable }) };
};
export const registeredClients = (flags: ReadonlyMap<string, string>, onError?: (host: SetupClient, cause: unknown) => void): SetupClient[] => clients.filter(host => {
  try {
    const fields = profileFields(host, flags);
    return fields.host === "claude" ? hasClaudeRegistration(fields) : hasCodexRegistration(fields);
  } catch (cause) { if (onError === undefined) throw cause; onError(host, cause); return false; }
});

const ActivePackage = Schema.Struct({ version: Schema.Literal(1), executable: Schema.NonEmptyString, runtime: Schema.NonEmptyString, entrypoint: Schema.NonEmptyString });
const PackageIdentity = Schema.Struct({ name: Schema.Literal("@hapsland/hapsland"), runtime: Schema.NonEmptyString, entrypoint: Schema.NonEmptyString });
const activePath = () => join(homedir(), ".local", "share", "hapsland", "active.json");
export const activateCurrentPackage = (entrypoint: string) => atomicInstallationFile(activePath(), JSON.stringify({ version: 1, executable: entrypoint, runtime: process.execPath, entrypoint }) + "\n");
export const activatePackage = (executable: string) => {
  const absolute = resolve(executable);
  realpathSync(absolute);
  const result = spawnSync(absolute, ["--package-identity"], { encoding: "utf8", timeout: 10_000, env: { ...process.env, HAPSLAND_ACTIVE_DISPATCH: "1" } });
  if (result.error !== undefined || result.status !== 0) throw new Error("The updated hooks are installed, but activating the public CLI failed. Keep the target package and retry update.");
  const identity = Schema.decodeUnknownSync(PackageIdentity)(JSON.parse(result.stdout));
  if (!isAbsolute(identity.runtime) || !isAbsolute(identity.entrypoint)) throw new Error("Target package identity paths must be absolute.");
  atomicInstallationFile(activePath(), JSON.stringify({ version: 1, executable: absolute, runtime: identity.runtime, entrypoint: identity.entrypoint }) + "\n");
};
/** Explicit package selection overrides the active administrative package. */
export const dispatchSelectedPackage = (executable: string, command: ClientCommand, host: SetupClient | undefined, flags: ReadonlyMap<string, string>) => {
  const args = [command, ...(host === undefined ? [] : [host]), ...[...flags].filter(([name]) => name !== "--target" && name !== "--host").map(([name, value]) => `${name}=${value}`)];
  const environment: NodeJS.ProcessEnv = { ...process.env, HAPSLAND_ACTIVE_DISPATCH: "1" };
  delete environment.REVIEW_INSTALL_RUNTIME;
  delete environment.REVIEW_INSTALL_ENTRYPOINT;
  const result = spawnSync(resolve(executable), args, { stdio: "inherit", env: environment });
  if (result.error !== undefined) throw new Error(`Selected package cannot run: ${executable}.`);
  return result.status ?? 6;
};

/** Only public lifecycle commands dispatch. Hook processes and JSON automation stay pinned. */
export const dispatchActivePackage = (args: ReadonlyArray<string>): number | undefined => {
  if (process.env.HAPSLAND_ACTIVE_DISPATCH === "1") return undefined;
  let active: typeof ActivePackage.Type;
  try {
    active = Schema.decodeUnknownSync(ActivePackage)(JSON.parse(readFileSync(activePath(), "utf8")));
    if (![active.executable, active.runtime, active.entrypoint].every(isAbsolute)) throw new Error("active package paths must be absolute");
  }
  catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return undefined;
    if (args[0] === "reinstall") { process.stderr.write("Active-package record is damaged; reinstalling from PATH.\n"); return undefined; }
    throw new Error("Hapsland active-package record is damaged. Run hapsland reinstall to rebuild it from the package in PATH.");
  }
  try {
    if (realpathSync(process.argv[1] ?? "") === realpathSync(active.entrypoint) && realpathSync(process.execPath) === realpathSync(active.runtime)) return undefined;
  } catch {
    if (args[0] === "reinstall") { process.stderr.write("Active package is unavailable; reinstalling from the package in PATH.\n"); return undefined; }
    throw new Error(`Active package is unavailable: ${active.entrypoint}. Run hapsland reinstall to restore hooks from the package in PATH.`);
  }
  const environment: NodeJS.ProcessEnv = { ...process.env, HAPSLAND_ACTIVE_DISPATCH: "1" };
  delete environment.REVIEW_INSTALL_RUNTIME;
  delete environment.REVIEW_INSTALL_ENTRYPOINT;
  const result = spawnSync(active.runtime, [active.entrypoint, ...args], { stdio: "inherit", env: environment });
  if (result.error !== undefined) throw new Error(`Active package cannot run: ${active.executable}. Restore that package or remove ~/.local/share/hapsland/active.json and run hapsland reinstall.`);
  return result.status ?? 6;
};

const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const formatCompatibility = (value: unknown): string[] => {
  const lines: string[] = [];
  const walk = (node: unknown, path: string) => {
    const item = record(node);
    if (item.required !== undefined) lines.push(`${path}: detected ${typeof item.observed === "string" ? item.observed : "unavailable"}; required ${String(item.required)}.`);
    else for (const [key, child] of Object.entries(item)) if (typeof child === "object") walk(child, path ? `${path} ${key}` : key);
  };
  walk(value, "Compatibility");
  return lines;
};
export const formatProposal = (value: unknown): string[] => {
  const proposal = record(value);
  const lines: string[] = [];
  const current = record(proposal.current); const target = record(proposal.target);
  if (target.packageVersion !== undefined) lines.push(`Version: ${String(current.packageVersion ?? "unrecorded")} → ${String(target.packageVersion)}.`);
  if (Array.isArray(proposal.changes)) for (const change of proposal.changes) {
    const item = record(change);
    lines.push(`${String(item.description ?? "Owned configuration change")}${(item.path ?? item.file) === undefined ? "" : `: ${String(item.path ?? item.file)}`}.`);
  }
  const journal = record(proposal.journalReplacement);
  if (journal.file !== undefined) lines.push(`Back up interrupted journal ${String(journal.file)} and rebuild using current settings.`);
  const owned = record(proposal.ownedChanges);
  const hooks = record(owned.hooks ?? owned.hook ?? target.hook);
  const groups = record(hooks.groups);
  for (const [event, value] of Object.entries(groups)) {
    const group = record(value);
    lines.push(`${event}${group.matcher === undefined ? "" : ` (${String(group.matcher)})`}${hooks.file === undefined ? "" : ` in ${String(hooks.file)}`}:`);
    if (Array.isArray(group.hooks)) for (const handler of group.hooks) {
      const item = record(handler);
      lines.push(`  ${item.async === true ? "background" : "foreground"}, timeout ${String(item.timeout)}s: ${String(item.command)}`);
    }
  }
  return lines;
};
export const formatDoctor = (value: unknown, host: SetupClient): string[] => {
  const result = record(value);
  const lines = [`${host}: ${String(result.status ?? "check failed")}.`];
  if (Array.isArray(result.checks)) for (const value of result.checks) {
    const check = record(value);
    lines.push(`  ${String(check.stage)}: ${check.stage === "configuration-ownership" && check.status === "conflict" ? "installation damaged" : String(check.status)}.`);
    if (check.status !== "ready") {
      if (typeof check.observed === "string") lines.push(`    ${check.observed}`);
      const detail = record(record(check.observed).error).message;
      if (typeof detail === "string") lines.push(`    ${detail}`);
      lines.push(...formatCompatibility(check.observed).map(line => `    ${line}`));
      if (typeof check.action === "string") lines.push(`    Next: ${check.action}`);
    }
    if (check.stage === "configuration-ownership" && check.status !== "ready") lines.push(`    Run hapsland repair ${host}; for changed Hapsland entries, use hapsland reinstall ${host}.`);
  }
  lines.push("Native trust and actual agent execution must be checked in the client.");
  return lines;
};
export const formatFailure = (value: unknown, host: SetupClient): string => {
  const result = record(value); const error = record(result.error);
  const message = String(error.message ?? result.status ?? "operation failed");
  if (message.includes("explicitly disabled")) return `${host}: ${message}. Enable features.hooks in the selected Codex config only if your policy permits Hapsland hooks, then rerun setup.`;
  return `${host}: ${String(error.message ?? result.status ?? "operation failed")}. Files were preserved where ownership could not be established. Run hapsland doctor ${host}; use hapsland reinstall ${host} to replace marked Hapsland hooks. Malformed configuration must be corrected first.`;
};

const LifecycleResult = Schema.Struct({
  status: Schema.String,
  alreadyCurrent: Schema.optionalKey(Schema.Boolean),
  error: Schema.optionalKey(Schema.Unknown),
  host: Schema.optionalKey(Schema.Unknown),
  recovery: Schema.optionalKey(Schema.Unknown),
  proposal: Schema.optionalKey(Schema.Struct({
    digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    changes: Schema.optionalKey(Schema.Array(Schema.Unknown)),
    ownedChanges: Schema.optionalKey(Schema.Unknown),
    current: Schema.optionalKey(Schema.Unknown),
    target: Schema.optionalKey(Schema.Unknown),
    journalReplacement: Schema.optionalKey(Schema.Unknown),
  })),
});
/** Every human mutation uses the same checked preview/apply transport. */
export const invokeLifecycle = (command: string, args: ReadonlyArray<string>, host: SetupClient, request: unknown, environment: NodeJS.ProcessEnv = process.env) => {
  const result = spawnSync(command, [...args], { input: JSON.stringify(request), encoding: "utf8", timeout: 30_000, env: environment });
  if (result.error !== undefined) throw result.error;
  let output: typeof LifecycleResult.Type;
  try { output = Schema.decodeUnknownSync(LifecycleResult)(JSON.parse(result.stdout)); }
  catch { throw new Error(`${host}: package returned an unreadable lifecycle result. Run hapsland doctor ${host}.`); }
  if (result.status !== 0 && output.status !== "partial") {
    const compatibility = formatCompatibility(record(output.host).compatibility);
    throw new Error([formatFailure(output, host), ...compatibility].join("\n"));
  }
  return output;
};
