import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Clock, Config, Effect, Option, Redacted, Schedule, Schema } from "effect";
import { runSecretServiceProcess, type SecretServiceOperation } from "./secret-service-process.ts";

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

export const CredentialState = Schema.Struct({
  version: Schema.Literal(1),
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  savedUseSuspended: Schema.Boolean,
});
export interface CredentialState extends Schema.Schema.Type<typeof CredentialState> {}

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
const packagedHelper = resolve(moduleDirectory, "../../native/prebuilt", `${process.platform}-${process.arch}`, "credential-secret-service");

const helperPathConfig = Config.NonEmptyString("REVIEW_CREDENTIAL_HELPER").pipe(Config.withDefault(packagedHelper));
const statePathConfig = Config.NonEmptyString("REVIEW_CREDENTIAL_STATE_PATH").pipe(Config.withDefault(DEFAULT_CREDENTIAL_STATE_PATH));
class CredentialStateError extends Schema.TaggedError<CredentialStateError>()("CredentialStateError", {}) {}
const resolveStatePath = Effect.fn("Credentials.statePath")((path?: string) => Effect.gen(function* () {
  return path === undefined ? yield* statePathConfig : path;
}));

const decodeState = (value: unknown): CredentialState => Option.getOrElse(
  Schema.decodeUnknownOption(CredentialState)(value),
  () => ({ ...initialState, savedUseSuspended: true }),
);

export const readCredentialState = (
  statePath = DEFAULT_CREDENTIAL_STATE_PATH,
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
  // Own the exclusive file before writing, including partial-write failures.
  const descriptor = openSync(temporary, "wx", 0o600);
  let closed = false;
  try {
    writeFileSync(descriptor, `${JSON.stringify(state)}\n`);
    closeSync(descriptor);
    closed = true;
    renameSync(temporary, statePath);
  } finally {
    if (!closed) {
      try { closeSync(descriptor); } catch { /* Preserve the primary failure. */ }
    }
    try { rmSync(temporary, { force: true }); } catch { /* Preserve the primary failure. */ }
  }
};

type StateLockOwner = {
  readonly version: 1;
  readonly pid: number;
  readonly machineIdentity: string;
  readonly bootIdentity: string;
  readonly processBirthIdentity: string | null;
  readonly token: string;
  readonly createdAt: number;
};

const STATE_LOCK_WAIT_MS = 1_000;
// A creator can crash between making the lock directory and publishing its
// owner. Give that incomplete state time to finish before recovery.
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
      "version" in value && value.version === 1 &&
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

const recoverStaleStateLock = (lock: string, now: number): boolean => {
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
      if (now - stat.mtimeMs < OWNERLESS_LOCK_GRACE_MS) return false;
      retirementIdentity = `ownerless-${stat.dev.toString(36)}-${stat.ino.toString(36)}`;
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

const writeState = Effect.fn("Credentials.writeState")((path: string, state: CredentialState) => Effect.try({
  try: () => writeCredentialState(path, state),
  catch: () => new CredentialStateError(),
}));

const withStateLock = Effect.fn("Credentials.withStateLock")((statePath: string,
  unexpectedStatus: "indeterminate" | "unavailable",
  operation: Effect.Effect<Omit<CredentialLifecycleResult, "stateLock">, CredentialStateError>,
) => Effect.gen(function* () {
  const lock = `${statePath}.lock`;
  const createdAt = yield* Clock.currentTimeMillis;
  const started = yield* Clock.monotonicTimeNanos;
  const owner: StateLockOwner = {
    version: 1, pid: process.pid, machineIdentity, bootIdentity,
    processBirthIdentity: processBirthIdentity(process.pid) ?? null,
    token: randomUUID(), createdAt,
  };
  let recovered = false;
  const attempt = Effect.fn("Credentials.acquireStateLock")(() => Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
    return yield* Effect.sync(() => {
      try { mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 }); }
      catch { return "unavailable" as const; }
      try { mkdirSync(lock, { mode: 0o700 }); }
      catch (cause) {
        if (systemErrorCode(cause) !== "EEXIST") return "unavailable" as const;
        if (recoverStaleStateLock(lock, now)) { recovered = true; return "retry" as const; }
        return elapsed >= STATE_LOCK_WAIT_MS ? "busy" as const : "retry" as const;
      }
      // Directory creation and owner publication are one uninterrupted native
      // acquisition. A failed publication removes only this unpublished lock.
      try { writeFileSync(join(lock, "owner.json"), `${JSON.stringify(owner)}\n`, { mode: 0o600, flag: "wx" }); }
      catch {
        try { rmSync(lock, { recursive: true, force: true }); }
        catch { /* Retain ownerless lock for bounded recovery. */ }
        return "unavailable" as const;
      }
      return recovered ? "recovered" as const : "acquired" as const;
    });
  }));
  return yield* Effect.acquireUseRelease(
    attempt().pipe(Effect.repeat({ schedule: Schedule.spaced("10 millis"), while: (status) => status === "retry" })),
    (stateLock) => stateLock === "busy" || stateLock === "unavailable" || stateLock === "retry"
      ? Effect.succeed<CredentialLifecycleResult>({ status: stateLock === "busy" ? "busy" : "unavailable",
          state: readCredentialState(statePath), stateLock: stateLock === "busy" ? "busy" : "unavailable" })
      : operation.pipe(
          Effect.map((result): CredentialLifecycleResult => ({ ...result, stateLock })),
          Effect.catch(() => Effect.succeed<CredentialLifecycleResult>({ status: unexpectedStatus,
            state: readCredentialState(statePath), stateLock })),
        ),
    (stateLock) => Effect.sync(() => {
      if (stateLock !== "acquired" && stateLock !== "recovered") return;
      // Never delete a successor lock after stale-owner retirement.
      if (readStateLockOwner(lock)?.token !== owner.token) return;
      try { rmSync(lock, { recursive: true, force: true }); }
      catch { /* A later invocation can reclaim after process exit. */ }
    }),
  );
}));

export const runSecretService = Effect.fn("Credentials.runHelper")((operation: SecretServiceOperation,
  options: { readonly input?: string; readonly deadlineMs?: number; readonly signal?: AbortSignal;
    readonly allowInteraction?: boolean } = {},
) => Effect.gen(function* () {
  const helper = yield* helperPathConfig;
  return yield* runSecretServiceProcess(helper, operation, {
    ...options, deadlineMs: options.deadlineMs ?? CREDENTIAL_LOOKUP_DEADLINE_MS,
  });
}).pipe(Effect.catch(() => Effect.succeed<SecretServiceResult>({ status: "unavailable" }))));

export type CredentialResolution =
  | { readonly status: "present"; readonly source: "environment" | "saved"; readonly value: string; readonly generation: number }
  | { readonly status: "missing" | "invalid" | "locked" | "interaction-required" | "unavailable" | "timed-out" | "suspended"; readonly source: "environment" | "saved"; readonly generation: number };

export const resolveCredential = Effect.fn("Credentials.resolve")((options: {
  readonly envVar: string;
  readonly environmentOnly: boolean;
  readonly environmentValue?: string | null;
  readonly expectedGeneration?: number;
  readonly statePath?: string;
}) => Effect.gen(function* () {
  const statePath = yield* resolveStatePath(options.statePath);
  const state = readCredentialState(statePath);
  const environmentValue = "environmentValue" in options
    ? options.environmentValue ?? undefined
    : Option.getOrUndefined(yield* Config.option(Config.Redacted(options.envVar)).pipe(
        Effect.map((value) => Option.map(value, Redacted.value)),
      ));
  const selectedSource = options.environmentOnly ||
      (environmentValue !== undefined && environmentValue.length > 0)
    ? "environment" as const
    : "saved" as const;
  if (options.expectedGeneration !== undefined && options.expectedGeneration !== state.generation) {
    return { status: "suspended", source: selectedSource, generation: state.generation } as const;
  }
  if (options.environmentOnly || (environmentValue !== undefined && environmentValue.length > 0)) {
    if (environmentValue === undefined || environmentValue.length === 0) {
      return { status: "missing", source: "environment", generation: state.generation } as const;
    }
    if (Buffer.byteLength(environmentValue, "utf8") > 32_768) {
      return { status: "invalid", source: "environment", generation: state.generation } as const;
    }
    const current = readCredentialState(statePath);
    if (current.generation !== state.generation) {
      return { status: "suspended", source: "environment", generation: current.generation } as const;
    }
    return { status: "present", source: "environment", value: environmentValue, generation: state.generation } as const;
  }
  if (state.savedUseSuspended) {
    return { status: "suspended", source: "saved", generation: state.generation } as const;
  }
  const saved = yield* runSecretService("get");
  const current = readCredentialState(statePath);
  if (current.generation !== state.generation || current.savedUseSuspended) {
    return { status: "suspended", source: "saved", generation: current.generation } as const;
  }
  if (saved.status === "present" && saved.value !== undefined) {
    return { status: "present", source: "saved", value: saved.value, generation: state.generation } as const;
  }
  const status = saved.status === "missing" || saved.status === "locked" ||
      saved.status === "interaction-required" ||
      saved.status === "invalid" || saved.status === "timed-out"
    ? saved.status
    : "unavailable";
  return { status, source: "saved", generation: state.generation } as const;
}).pipe(Effect.map((result): CredentialResolution => result), Effect.catch(() =>
  Effect.succeed<CredentialResolution>({ status: "unavailable", source: options.environmentOnly ? "environment" : "saved", generation: 0 }))));

export const saveCredential = Effect.fn("Credentials.save")((value: string, path?: string) => Effect.gen(function* () {
  const statePath = yield* resolveStatePath(path);
  return yield* withStateLock(statePath, "indeterminate", Effect.gen(function* () {
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
    yield* writeState(statePath, pending);
    const stored = yield* runSecretService("set", { input: value, deadlineMs: 15_000 });
    if (stored.status !== "stored") {
      const state = {
        ...pending,
        savedUseSuspended: previous.savedUseSuspended ||
          stored.status === "timed-out" || stored.status === "indeterminate",
      };
      yield* writeState(statePath, state);
      return {
        status: stored.status === "timed-out" || stored.status === "indeterminate"
          ? "indeterminate" as const
          : stored.status,
        state,
      };
    }
    const state = { ...pending, savedUseSuspended: false };
    yield* writeState(statePath, state);
    return { status: "stored" as const, state };
  }));
}).pipe(Effect.catch(() => Effect.succeed<CredentialLifecycleResult>({ status: "unavailable",
  state: { ...initialState, savedUseSuspended: true }, stateLock: "unavailable" }))));

export const logoutCredential = Effect.fn("Credentials.logout")((path?: string) => Effect.gen(function* () {
  const statePath = yield* resolveStatePath(path);
  return yield* withStateLock(statePath, "indeterminate", Effect.gen(function* () {
    const previous = readCredentialState(statePath);
    const pending = {
      version: 1 as const,
      generation: previous.generation + 1,
      savedUseSuspended: true,
    };
    // Revoke all outstanding capabilities before deletion can block or commit.
    yield* writeState(statePath, pending);
    const deleted = yield* runSecretService("delete", { deadlineMs: 15_000 });
    const successful = deleted.status === "deleted" || deleted.status === "missing";
    const state = {
      ...pending,
      savedUseSuspended: !successful,
    };
    yield* writeState(statePath, state);
    return { status: deleted.status, state };
  }));
}).pipe(Effect.catch(() => Effect.succeed<CredentialLifecycleResult>({ status: "unavailable",
  state: { ...initialState, savedUseSuspended: true }, stateLock: "unavailable" }))));
