import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CREDENTIAL_LOOKUP_DEADLINE_MS = 750;
export const DEFAULT_CREDENTIAL_STATE_PATH = join(
  homedir(), ".local", "state", "realtime-review-tool", "credential-state.json",
);

export type SecretServiceStatus =
  | "available"
  | "stored"
  | "deleted"
  | "present"
  | "missing"
  | "locked"
  | "interaction-required"
  | "invalid"
  | "unavailable"
  | "indeterminate"
  | "timed-out"
  | "cancelled";

export type SecretServiceResult = {
  readonly status: SecretServiceStatus;
  readonly value?: string;
};

export type CredentialState = {
  readonly version: 1;
  readonly generation: number;
  readonly savedUseSuspended: boolean;
};

export type CredentialStateLockStatus = "acquired" | "recovered" | "busy" | "unavailable";

export type CredentialLifecycleResult = {
  readonly status: SecretServiceStatus | "busy";
  readonly state: CredentialState;
  readonly stateLock: CredentialStateLockStatus;
};

const initialState: CredentialState = {
  version: 1,
  generation: 0,
  savedUseSuspended: false,
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const helperCandidates = [
  resolve(moduleDirectory, "../native/credential-secret-service"),
  resolve(moduleDirectory, "../../dist/native/credential-secret-service"),
];

export const credentialHelperPath = (): string =>
  process.env.REVIEW_CREDENTIAL_HELPER ?? helperCandidates.find(existsSync) ??
  resolve(moduleDirectory, "../native/credential-secret-service");

const decodeState = (value: unknown): CredentialState => {
  if (
    typeof value === "object" && value !== null &&
    "version" in value && value.version === 1 &&
    "generation" in value && typeof value.generation === "number" &&
    Number.isSafeInteger(value.generation) && value.generation >= 0 &&
    "savedUseSuspended" in value && typeof value.savedUseSuspended === "boolean"
  ) return value as CredentialState;
  return { ...initialState, savedUseSuspended: true };
};

export const readCredentialState = (
  statePath = process.env.REVIEW_CREDENTIAL_STATE_PATH ?? DEFAULT_CREDENTIAL_STATE_PATH,
): CredentialState => {
  try {
    return decodeState(JSON.parse(readFileSync(statePath, "utf8")) as unknown);
  } catch (cause) {
    return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"
      ? initialState
      : { ...initialState, savedUseSuspended: true };
  }
};

const writeCredentialState = (statePath: string, state: CredentialState): void => {
  mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
  const temporary = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, statePath);
};

type StateLockOwner = {
  readonly version: 2;
  readonly pid: number;
  readonly machineIdentity: string;
  readonly bootIdentity: string;
  readonly processBirthIdentity: string | null;
  readonly token: string;
  readonly createdAt: number;
};

const STATE_LOCK_WAIT_MS = 1_000;
// An ownerless directory can come from the previous release, whose native
// mutation deadline was 15 seconds. Do not reclaim it while that process could
// still be live; a crashed legacy lock becomes recoverable after this bound.
const OWNERLESS_LOCK_GRACE_MS = 30_000;

const systemErrorCode = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;

const readTrimmedFile = (path: string): string | undefined => {
  try {
    const value = readFileSync(path, "utf8").trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

const runIdentityCommand = (command: string, args: ReadonlyArray<string>): string | undefined => {
  try {
    const value = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
      env: { ...process.env, LC_ALL: "C" },
    }).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

const digestIdentity = (kind: string, value: string): string =>
  createHash("sha256").update(`${kind}\0${value}`).digest("hex");

const rawMachineIdentity = process.platform === "linux"
  ? readTrimmedFile("/etc/machine-id") ?? `host:${hostname()}`
  : process.platform === "darwin"
    ? runIdentityCommand("/usr/sbin/sysctl", ["-n", "kern.hostuuid"]) ?? `host:${hostname()}`
    : `host:${hostname()}`;

const rawBootIdentity = process.platform === "linux"
  ? readTrimmedFile("/proc/sys/kernel/random/boot_id") ?? `host:${hostname()}`
  : process.platform === "darwin"
    ? runIdentityCommand("/usr/sbin/sysctl", ["-n", "kern.boottime"]) ?? `host:${hostname()}`
    : `host:${hostname()}`;

const machineIdentity = digestIdentity("machine", rawMachineIdentity);
const bootIdentity = digestIdentity("boot", rawBootIdentity);

const processBirthIdentity = (pid: number): string | undefined => {
  if (process.platform === "linux") {
    const stat = readTrimmedFile(`/proc/${pid}/stat`);
    if (stat === undefined) return undefined;
    const commandEnd = stat.lastIndexOf(") ");
    if (commandEnd < 0) return undefined;
    const startTime = stat.slice(commandEnd + 2).split(" ")[19];
    return startTime === undefined || startTime.length === 0
      ? undefined
      : digestIdentity("process-birth-linux", startTime);
  }
  if (process.platform === "darwin") {
    const started = runIdentityCommand("/bin/ps", ["-p", String(pid), "-o", "lstart="]);
    return started === undefined ? undefined : digestIdentity("process-birth-darwin", started);
  }
  return undefined;
};

const readStateLockOwner = (lock: string): StateLockOwner | undefined => {
  try {
    const value = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as unknown;
    if (
      typeof value === "object" && value !== null &&
      "version" in value && value.version === 2 &&
      "pid" in value && typeof value.pid === "number" && Number.isSafeInteger(value.pid) && value.pid > 0 &&
      "machineIdentity" in value && typeof value.machineIdentity === "string" && value.machineIdentity.length > 0 &&
      "bootIdentity" in value && typeof value.bootIdentity === "string" && value.bootIdentity.length > 0 &&
      "processBirthIdentity" in value &&
        (value.processBirthIdentity === null || typeof value.processBirthIdentity === "string") &&
      "token" in value && typeof value.token === "string" && value.token.length > 0 &&
      "createdAt" in value && typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
    ) return value as StateLockOwner;
  } catch { /* A creator can be between mkdir and publishing its owner record. */ }
  return undefined;
};

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return systemErrorCode(cause) !== "ESRCH";
  }
};

const recoverStaleStateLock = (lock: string): boolean => {
  const owner = readStateLockOwner(lock);
  let retirementIdentity: string;
  if (owner !== undefined) {
    // Never reclaim state from a different machine: a shared state path cannot
    // prove the remote owner dead. A changed boot on this machine proves every
    // process from the recorded boot has exited.
    if (owner.machineIdentity !== machineIdentity) return false;
    if (owner.bootIdentity === bootIdentity && processIsAlive(owner.pid)) {
      const currentBirth = processBirthIdentity(owner.pid);
      if (owner.processBirthIdentity === null || currentBirth === undefined ||
          currentBirth === owner.processBirthIdentity) return false;
    }
    retirementIdentity = `owner-${owner.token}`;
  } else {
    try {
      const stat = statSync(lock);
      if (Date.now() - stat.mtimeMs < OWNERLESS_LOCK_GRACE_MS) return false;
      retirementIdentity = `legacy-${stat.dev.toString(36)}-${stat.ino.toString(36)}`;
      // Make the deterministic retirement directory nonempty before rename.
      // A delayed second reclaimer then cannot rename a successor over it.
      try {
        writeFileSync(join(lock, ".retired"), "", { mode: 0o600, flag: "wx" });
      } catch (cause) {
        if (systemErrorCode(cause) !== "EEXIST") return false;
      }
    } catch {
      return false;
    }
  }
  // The retirement name is derived from the observed lock identity and is
  // deliberately retained. If two reclaimers observed A, the first moves A
  // here; a delayed second rename cannot replace this nonempty tombstone with B.
  const reclaimed = `${lock}.retired.${retirementIdentity}`;
  try {
    renameSync(lock, reclaimed);
  } catch {
    return false;
  }
  return true;
};

const withStateLock = async (
  statePath: string,
  unexpectedStatus: "indeterminate" | "unavailable",
  operation: () => Promise<Omit<CredentialLifecycleResult, "stateLock">>,
): Promise<CredentialLifecycleResult> => {
  const lock = `${statePath}.lock`;
  const owner: StateLockOwner = {
    version: 2,
    pid: process.pid,
    machineIdentity,
    bootIdentity,
    processBirthIdentity: processBirthIdentity(process.pid) ?? null,
    token: randomUUID(),
    createdAt: Date.now(),
  };
  try {
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
  } catch {
    return { status: "unavailable", state: readCredentialState(statePath), stateLock: "unavailable" };
  }
  const started = Date.now();
  let recovered = false;
  for (;;) {
    try {
      mkdirSync(lock, { mode: 0o700 });
    } catch (cause) {
      if (systemErrorCode(cause) !== "EEXIST") {
        return { status: "unavailable", state: readCredentialState(statePath), stateLock: "unavailable" };
      }
      if (recoverStaleStateLock(lock)) {
        recovered = true;
        continue;
      }
      if (Date.now() - started >= STATE_LOCK_WAIT_MS) {
        return { status: "busy", state: readCredentialState(statePath), stateLock: "busy" };
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      continue;
    }
    try {
      writeFileSync(join(lock, "owner.json"), `${JSON.stringify(owner)}\n`, { mode: 0o600, flag: "wx" });
      break;
    } catch {
      // We created this previously nonexistent directory and have not exposed a
      // valid owner, so it cannot be a successfully acquired competing lock.
      try {
        rmSync(lock, { recursive: true, force: true });
      } catch { /* It remains an ownerless lock with bounded legacy recovery. */ }
      return { status: "unavailable", state: readCredentialState(statePath), stateLock: "unavailable" };
    }
  }
  try {
    const result = await operation();
    return { ...result, stateLock: recovered ? "recovered" : "acquired" };
  } catch {
    return {
      status: unexpectedStatus,
      state: readCredentialState(statePath),
      stateLock: recovered ? "recovered" : "acquired",
    };
  } finally {
    // A stale owner may have been atomically moved aside. Never remove a lock
    // subsequently acquired by another process.
    if (readStateLockOwner(lock)?.token === owner.token) {
      try {
        rmSync(lock, { recursive: true, force: true });
      } catch { /* A later invocation can reclaim this owner after process exit. */ }
    }
  }
};

export const runSecretService = (
  operation: "probe" | "get" | "set" | "delete",
  options: {
    readonly input?: string;
    readonly deadlineMs?: number;
    readonly signal?: AbortSignal;
    readonly allowInteraction?: boolean;
  } = {},
): Promise<SecretServiceResult> => new Promise((resolveResult) => {
  let settled = false;
  let termination: "timed-out" | "cancelled" | undefined;
  const startHelper = () => spawn(
    credentialHelperPath(),
    options.allowInteraction === true ? [operation, "--allow-interaction"] : [operation],
    { stdio: ["pipe", "pipe", "ignore"], env: process.env },
  );
  let child: ReturnType<typeof startHelper>;
  try {
    child = startHelper();
  } catch {
    // A foreign native binary can throw synchronously on some Node/OS pairs.
    resolveResult({ status: "unavailable" });
    return;
  }
  const chunks: Array<Buffer> = [];
  let total = 0;
  const finish = (result: SecretServiceResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    resolveResult(result);
  };
  const timer = setTimeout(() => {
    termination = "timed-out";
    child.kill("SIGKILL");
  }, options.deadlineMs ?? CREDENTIAL_LOOKUP_DEADLINE_MS);
  const abort = () => {
    termination = "cancelled";
    child.kill("SIGKILL");
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted === true) abort();
  child.stdout.on("data", (chunk: Buffer) => {
    total += chunk.length;
    if (total <= 65_536) chunks.push(chunk);
    else child.kill("SIGKILL");
  });
  child.stdin.on("error", () => {
    // A helper may close stdin yet remain alive. Terminate it and let close (or
    // the retained deadline) settle the sanitized result.
    child.kill("SIGKILL");
  });
  child.on("error", () => finish({ status: termination ?? "unavailable" }));
  child.on("close", () => {
    if (settled) return;
    if (termination !== undefined) return finish({ status: termination });
    const malformedStatus = operation === "set" ? "indeterminate" as const : "unavailable" as const;
    try {
      const output = Buffer.concat(chunks);
      const newline = output.indexOf(0x0a);
      if (newline < 0) return finish({ status: malformedStatus });
      const header = JSON.parse(output.subarray(0, newline).toString("utf8")) as unknown;
      if (typeof header !== "object" || header === null || !("status" in header)) {
        return finish({ status: malformedStatus });
      }
      const status = header.status;
      const allowed: ReadonlyArray<SecretServiceStatus> = [
        "available", "stored", "deleted", "present", "missing", "locked", "interaction-required",
        "invalid", "unavailable", "indeterminate",
      ];
      if (typeof status !== "string" || !allowed.includes(status as SecretServiceStatus)) {
        return finish({ status: malformedStatus });
      }
      if (status === "present") {
        const value = output.subarray(newline + 1).toString("utf8");
        if (value.length === 0 || Buffer.byteLength(value, "utf8") > 32_768) {
          return finish({ status: "invalid" });
        }
        return finish({ status, value });
      }
      return finish({ status: status as SecretServiceStatus });
    } catch {
      return finish({ status: malformedStatus });
    }
  });
  child.stdin.end(options.input);
});

export type CredentialResolution =
  | { readonly status: "present"; readonly source: "environment" | "saved"; readonly value: string; readonly generation: number }
  | { readonly status: "missing" | "invalid" | "locked" | "interaction-required" | "unavailable" | "timed-out" | "suspended"; readonly source: "environment" | "saved"; readonly generation: number };

export const resolveCredential = async (options: {
  readonly envVar: string;
  readonly environmentOnly: boolean;
  readonly environmentValue?: string | null;
  readonly expectedGeneration?: number;
  readonly statePath?: string;
}): Promise<CredentialResolution> => {
  const state = readCredentialState(options.statePath);
  const environmentValue = "environmentValue" in options
    ? options.environmentValue ?? undefined
    : process.env[options.envVar];
  const selectedSource = options.environmentOnly ||
      (environmentValue !== undefined && environmentValue.length > 0)
    ? "environment" as const
    : "saved" as const;
  if (options.expectedGeneration !== undefined && options.expectedGeneration !== state.generation) {
    return { status: "suspended", source: selectedSource, generation: state.generation };
  }
  if (options.environmentOnly || (environmentValue !== undefined && environmentValue.length > 0)) {
    if (environmentValue === undefined || environmentValue.length === 0) {
      return { status: "missing", source: "environment", generation: state.generation };
    }
    if (Buffer.byteLength(environmentValue, "utf8") > 32_768) {
      return { status: "invalid", source: "environment", generation: state.generation };
    }
    const current = readCredentialState(options.statePath);
    if (current.generation !== state.generation) {
      return { status: "suspended", source: "environment", generation: current.generation };
    }
    return { status: "present", source: "environment", value: environmentValue, generation: state.generation };
  }
  if (state.savedUseSuspended) {
    return { status: "suspended", source: "saved", generation: state.generation };
  }
  const saved = await runSecretService("get");
  const current = readCredentialState(options.statePath);
  if (current.generation !== state.generation || current.savedUseSuspended) {
    return { status: "suspended", source: "saved", generation: current.generation };
  }
  if (saved.status === "present" && saved.value !== undefined) {
    return { status: "present", source: "saved", value: saved.value, generation: state.generation };
  }
  const status = saved.status === "missing" || saved.status === "locked" ||
      saved.status === "interaction-required" ||
      saved.status === "invalid" || saved.status === "timed-out"
    ? saved.status
    : "unavailable";
  return { status, source: "saved", generation: state.generation };
};

export const saveCredential = async (
  value: string,
  statePath = process.env.REVIEW_CREDENTIAL_STATE_PATH ?? DEFAULT_CREDENTIAL_STATE_PATH,
) => withStateLock(statePath, "indeterminate", async () => {
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > 32_768) {
    return { status: "invalid" as const, state: readCredentialState(statePath) };
  }
  const previous = readCredentialState(statePath);
  const pending = {
    version: 1 as const,
    generation: previous.generation + 1,
    savedUseSuspended: true,
  };
  // Publish invalidation before replacement so no old-generation resident work
  // can race the Secret Service commit.
  writeCredentialState(statePath, pending);
  const stored = await runSecretService("set", { input: value, deadlineMs: 15_000 });
  if (stored.status !== "stored") {
    const state = {
      ...pending,
      savedUseSuspended: previous.savedUseSuspended ||
        stored.status === "timed-out" || stored.status === "indeterminate",
    };
    writeCredentialState(statePath, state);
    return {
      status: stored.status === "timed-out" || stored.status === "indeterminate"
        ? "indeterminate" as const
        : stored.status,
      state,
    };
  }
  const state = { ...pending, savedUseSuspended: false };
  writeCredentialState(statePath, state);
  return { status: "stored" as const, state };
});

export const logoutCredential = async (
  statePath = process.env.REVIEW_CREDENTIAL_STATE_PATH ?? DEFAULT_CREDENTIAL_STATE_PATH,
) => withStateLock(statePath, "indeterminate", async () => {
  const previous = readCredentialState(statePath);
  const pending = {
    version: 1 as const,
    generation: previous.generation + 1,
    savedUseSuspended: true,
  };
  // Revoke all outstanding capabilities before deletion can block or commit.
  writeCredentialState(statePath, pending);
  const deleted = await runSecretService("delete", { deadlineMs: 15_000 });
  const successful = deleted.status === "deleted" || deleted.status === "missing";
  const state = {
    ...pending,
    savedUseSuspended: !successful,
  };
  writeCredentialState(statePath, state);
  return { status: deleted.status, state };
});
