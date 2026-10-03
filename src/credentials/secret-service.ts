import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Clock, Config, Effect, Option, Redacted, Schedule, Schema } from "effect";
import { runSecretServiceProcess, type SecretServiceOperation } from "./secret-service-process.ts";

export const CREDENTIAL_LOOKUP_DEADLINE_MS = 750;
export const DEFAULT_CREDENTIAL_STATE_PATH = join(
  homedir(),
  ".local",
  "state",
  "realtime-review-tool",
  "credential-state.json",
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
const packagedHelper = resolve(
  moduleDirectory,
  "../../native/prebuilt",
  `${process.platform}-${process.arch}`,
  "credential-secret-service",
);

const helperPathConfig = Config.NonEmptyString("REVIEW_CREDENTIAL_HELPER").pipe(Config.withDefault(packagedHelper));
const statePathConfig = Config.NonEmptyString("REVIEW_CREDENTIAL_STATE_PATH").pipe(
  Config.withDefault(DEFAULT_CREDENTIAL_STATE_PATH),
);
class CredentialStateError extends Schema.TaggedError<CredentialStateError>()("CredentialStateError", {}) {}
const resolveStatePath = Effect.fn("Credentials.statePath")((path?: string) =>
  Effect.gen(function* () {
    return path === undefined ? yield* statePathConfig : path;
  }),
);

const decodeState = (value: unknown): CredentialState =>
  Option.getOrElse(Schema.decodeUnknownOption(CredentialState)(value), () => ({
    ...initialState,
    savedUseSuspended: true,
  }));

export const readCredentialState = (statePath = DEFAULT_CREDENTIAL_STATE_PATH): CredentialState => {
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
      try {
        closeSync(descriptor);
      } catch {
        /* Preserve the primary failure. */
      }
    }
    try {
      rmSync(temporary, { force: true });
    } catch {
      /* Preserve the primary failure. */
    }
  }
};

const StateLockOwner = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Number.check(Schema.makeFilter(Number.isSafeInteger), Schema.isGreaterThan(0)),
  machineIdentity: Schema.NonEmptyString,
  bootIdentity: Schema.NonEmptyString,
  processBirthIdentity: Schema.NullOr(Schema.String),
  token: Schema.NonEmptyString,
  createdAt: Schema.Number.check(Schema.makeFilter(Number.isFinite)),
});
interface StateLockOwner extends Schema.Schema.Type<typeof StateLockOwner> {}

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

const nonemptyIdentity = (value: string): string | undefined => (value.length > 0 ? value : undefined);
const runIdentityCommand = (command: string, args: ReadonlyArray<string>): string | undefined => {
  try {
    const value = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
      env: { ...process.env, LC_ALL: "C" },
    }).trim();
    return nonemptyIdentity(value);
  } catch {
    return undefined;
  }
};

const digestIdentity = (kind: string, value: string): string =>
  createHash("sha256").update(`${kind}\0${value}`).digest("hex");

const rawMachineIdentity =
  process.platform === "linux"
    ? (readTrimmedFile("/etc/machine-id") ?? `host:${hostname()}`)
    : process.platform === "darwin"
      ? (runIdentityCommand("/usr/sbin/sysctl", ["-n", "kern.hostuuid"]) ?? `host:${hostname()}`)
      : `host:${hostname()}`;

const rawBootIdentity =
  process.platform === "linux"
    ? (readTrimmedFile("/proc/sys/kernel/random/boot_id") ?? `host:${hostname()}`)
    : process.platform === "darwin"
      ? (runIdentityCommand("/usr/sbin/sysctl", ["-n", "kern.boottime"]) ?? `host:${hostname()}`)
      : `host:${hostname()}`;

const machineIdentity = digestIdentity("machine", rawMachineIdentity);
const bootIdentity = digestIdentity("boot", rawBootIdentity);

const linuxProcessBirthIdentity = (pid: number): string | undefined => {
  const stat = readTrimmedFile(`/proc/${pid}/stat`);
  if (stat === undefined) return undefined;
  const commandEnd = stat.lastIndexOf(") ");
  if (commandEnd < 0) return undefined;
  const startTime = stat.slice(commandEnd + 2).split(" ")[19];
  if (startTime === undefined) return undefined;
  return startTime.length === 0 ? undefined : digestIdentity("process-birth-linux", startTime);
};
const darwinProcessBirthIdentity = (pid: number): string | undefined => {
  const started = runIdentityCommand("/bin/ps", ["-p", String(pid), "-o", "lstart="]);
  return started === undefined ? undefined : digestIdentity("process-birth-darwin", started);
};
const processBirthIdentity = (pid: number): string | undefined => {
  if (process.platform === "linux") return linuxProcessBirthIdentity(pid);
  return process.platform === "darwin" ? darwinProcessBirthIdentity(pid) : undefined;
};
const readStateLockOwner = (lock: string): StateLockOwner | undefined => {
  try {
    const value: unknown = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8"));
    return Option.getOrUndefined(Schema.decodeUnknownOption(StateLockOwner)(value));
  } catch {
    return undefined;
  } // A creator may still be publishing its record.
};

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return systemErrorCode(cause) !== "ESRCH";
  }
};

const ownerBirthStillLive = (owner: StateLockOwner): boolean => {
  const currentBirth = processBirthIdentity(owner.pid);
  return (
    owner.processBirthIdentity === null || currentBirth === undefined || currentBirth === owner.processBirthIdentity
  );
};
const ownedLockRetirement = (owner: StateLockOwner): string | undefined => {
  // A local observation cannot prove an owner on a different machine dead.
  if (owner.machineIdentity !== machineIdentity) return undefined;
  if (owner.bootIdentity === bootIdentity && processIsAlive(owner.pid) && ownerBirthStillLive(owner)) return undefined;
  return `owner-${owner.token}`;
};
const sealOwnerlessLock = (lock: string): boolean => {
  try {
    writeFileSync(join(lock, ".retired"), "", { mode: 0o600, flag: "wx" });
    return true;
  } catch (cause) {
    return systemErrorCode(cause) === "EEXIST";
  }
};
const ownerlessLockRetirement = (lock: string, now: number): string | undefined => {
  try {
    const stat = statSync(lock);
    if (now - stat.mtimeMs < OWNERLESS_LOCK_GRACE_MS) return undefined;
    // A nonempty deterministic tombstone fences delayed reclaimers.
    if (!sealOwnerlessLock(lock)) return undefined;
    return `ownerless-${stat.dev.toString(36)}-${stat.ino.toString(36)}`;
  } catch {
    return undefined;
  }
};
const recoverStaleStateLock = (lock: string, now: number): boolean => {
  const owner = readStateLockOwner(lock);
  const retirementIdentity = owner === undefined ? ownerlessLockRetirement(lock, now) : ownedLockRetirement(owner);
  if (retirementIdentity === undefined) return false;
  // Retain the retirement directory: a delayed rename cannot replace it with a successor.
  try {
    renameSync(lock, `${lock}.retired.${retirementIdentity}`);
    return true;
  } catch {
    return false;
  }
};

const writeState = Effect.fn("Credentials.writeState")((path: string, state: CredentialState) =>
  Effect.try({
    try: () => writeCredentialState(path, state),
    catch: () => new CredentialStateError(),
  }),
);

const prepareStateDirectory = (statePath: string): boolean => {
  try {
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
    return true;
  } catch {
    return false;
  }
};
const publishStateLockOwner = (lock: string, owner: StateLockOwner): boolean => {
  try {
    writeFileSync(join(lock, "owner.json"), `${JSON.stringify(owner)}\n`, { mode: 0o600, flag: "wx" });
    return true;
  } catch {
    try {
      rmSync(lock, { recursive: true, force: true });
    } catch {
      /* Retain for bounded ownerless recovery. */
    }
    return false;
  }
};
const stateLockRetryStatus = (elapsed: number): "busy" | "retry" => (elapsed >= STATE_LOCK_WAIT_MS ? "busy" : "retry");
const mutationIndeterminate = (status: SecretServiceStatus): boolean =>
  status === "timed-out" || status === "indeterminate";
const withStateLock = Effect.fn("Credentials.withStateLock")(
  (
    statePath: string,
    unexpectedStatus: "indeterminate" | "unavailable",
    operation: Effect.Effect<Omit<CredentialLifecycleResult, "stateLock">, CredentialStateError>,
  ) =>
    Effect.gen(function* () {
      const lock = `${statePath}.lock`;
      const createdAt = yield* Clock.currentTimeMillis;
      const started = yield* Clock.monotonicTimeNanos;
      const owner: StateLockOwner = {
        version: 1,
        pid: process.pid,
        machineIdentity,
        bootIdentity,
        processBirthIdentity: processBirthIdentity(process.pid) ?? null,
        token: randomUUID(),
        createdAt,
      };
      let recovered = false;
      const attempt = Effect.fn("Credentials.acquireStateLock")(() =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
          return yield* Effect.sync(() => {
            if (!prepareStateDirectory(statePath)) return "unavailable" as const;
            try {
              mkdirSync(lock, { mode: 0o700 });
            } catch (cause) {
              if (systemErrorCode(cause) !== "EEXIST") return "unavailable" as const;
              if (recoverStaleStateLock(lock, now)) {
                recovered = true;
                return "retry" as const;
              }
              return stateLockRetryStatus(elapsed);
            }
            // Native creation/publication is uninterrupted; remove only an unpublished lock.
            if (!publishStateLockOwner(lock, owner)) return "unavailable" as const;
            return recovered ? ("recovered" as const) : ("acquired" as const);
          });
        }),
      );
      return yield* Effect.acquireUseRelease(
        attempt().pipe(
          Effect.repeat({ schedule: Schedule.spaced("10 millis"), while: (status) => status === "retry" }),
        ),
        (stateLock) =>
          stateLock === "busy" || stateLock === "unavailable" || stateLock === "retry"
            ? Effect.succeed<CredentialLifecycleResult>({
                status: stateLock === "busy" ? "busy" : "unavailable",
                state: readCredentialState(statePath),
                stateLock: stateLock === "busy" ? "busy" : "unavailable",
              })
            : operation.pipe(
                Effect.map((result): CredentialLifecycleResult => ({ ...result, stateLock })),
                Effect.catch(() =>
                  Effect.succeed<CredentialLifecycleResult>({
                    status: unexpectedStatus,
                    state: readCredentialState(statePath),
                    stateLock,
                  }),
                ),
              ),
        (stateLock) =>
          Effect.sync(() => {
            if (stateLock !== "acquired" && stateLock !== "recovered") return;
            // Never delete a successor lock after stale-owner retirement.
            if (readStateLockOwner(lock)?.token !== owner.token) return;
            try {
              rmSync(lock, { recursive: true, force: true });
            } catch {
              /* A later invocation can reclaim after process exit. */
            }
          }),
      );
    }),
);

export const runSecretService = Effect.fn("Credentials.runHelper")(
  (
    operation: SecretServiceOperation,
    options: {
      readonly input?: string;
      readonly deadlineMs?: number;
      readonly signal?: AbortSignal;
      readonly allowInteraction?: boolean;
    } = {},
  ) =>
    Effect.gen(function* () {
      const helper = yield* helperPathConfig;
      return yield* runSecretServiceProcess(helper, operation, {
        ...options,
        deadlineMs: options.deadlineMs ?? CREDENTIAL_LOOKUP_DEADLINE_MS,
      });
    }).pipe(Effect.catch(() => Effect.succeed<SecretServiceResult>({ status: "unavailable" }))),
);

export type CredentialResolution =
  | {
      readonly status: "present";
      readonly source: "environment" | "saved";
      readonly value: string;
      readonly generation: number;
    }
  | {
      readonly status:
        "missing" | "invalid" | "locked" | "interaction-required" | "unavailable" | "timed-out" | "suspended";
      readonly source: "environment" | "saved";
      readonly generation: number;
    };

type CredentialResolutionOptions = {
  readonly envVar: string;
  readonly environmentOnly: boolean;
  readonly environmentValue?: string | null;
  readonly expectedGeneration?: number;
  readonly statePath?: string;
};
const hasEnvironmentCredential = (value: string | undefined): boolean => value !== undefined && value.length > 0;
const credentialSource = (options: CredentialResolutionOptions, value: string | undefined): "environment" | "saved" =>
  options.environmentOnly || hasEnvironmentCredential(value) ? "environment" : "saved";
const expectedGenerationChanged = (expected: number | undefined, state: CredentialState): boolean =>
  expected !== undefined && expected !== state.generation;
const environmentCredential = Effect.fn("Credentials.environmentCredential")(function* (
  options: CredentialResolutionOptions,
) {
  if ("environmentValue" in options) return options.environmentValue ?? undefined;
  return Option.getOrUndefined(
    yield* Config.option(Config.Redacted(options.envVar)).pipe(
      Effect.map((value) => Option.map(value, Redacted.value)),
    ),
  );
});
const resolvedEnvironmentCredential = (
  value: string | undefined,
  statePath: string,
  state: CredentialState,
): CredentialResolution => {
  if (value === undefined || value.length === 0)
    return { status: "missing", source: "environment", generation: state.generation };
  if (Buffer.byteLength(value, "utf8") > 32_768)
    return { status: "invalid", source: "environment", generation: state.generation };
  const current = readCredentialState(statePath);
  if (current.generation !== state.generation)
    return { status: "suspended", source: "environment", generation: current.generation };
  return { status: "present", source: "environment", value, generation: state.generation };
};
type SavedUnavailableStatus = "missing" | "locked" | "interaction-required" | "invalid" | "timed-out";
const savedUnavailableStatuses: ReadonlySet<SecretServiceStatus> = new Set([
  "missing",
  "locked",
  "interaction-required",
  "invalid",
  "timed-out",
]);
const savedUnavailableStatus = (status: SecretServiceStatus): status is SavedUnavailableStatus =>
  savedUnavailableStatuses.has(status);
const resolvedSavedCredential = Effect.fn("Credentials.savedCredential")(function* (
  statePath: string,
  state: CredentialState,
): Effect.fn.Return<CredentialResolution> {
  const saved = yield* runSecretService("get");
  const current = readCredentialState(statePath);
  if (current.generation !== state.generation || current.savedUseSuspended)
    return {
      status: "suspended",
      source: "saved",
      generation: current.generation,
    };
  if (saved.status === "present" && saved.value !== undefined)
    return {
      status: "present",
      source: "saved",
      value: saved.value,
      generation: state.generation,
    };
  return {
    status: savedUnavailableStatus(saved.status) ? saved.status : "unavailable",
    source: "saved",
    generation: state.generation,
  };
});
export const resolveCredential = Effect.fn("Credentials.resolve")((options: CredentialResolutionOptions) =>
  Effect.gen(function* () {
    const statePath = yield* resolveStatePath(options.statePath);
    const state = readCredentialState(statePath);
    const value = yield* environmentCredential(options);
    const source = credentialSource(options, value);
    if (expectedGenerationChanged(options.expectedGeneration, state))
      return { status: "suspended", source, generation: state.generation } as const;
    if (source === "environment") return resolvedEnvironmentCredential(value, statePath, state);
    if (state.savedUseSuspended) return { status: "suspended", source: "saved", generation: state.generation } as const;
    return yield* resolvedSavedCredential(statePath, state);
  }).pipe(
    Effect.map((result): CredentialResolution => result),
    Effect.catch(() =>
      Effect.succeed<CredentialResolution>({
        status: "unavailable",
        source: options.environmentOnly ? "environment" : "saved",
        generation: 0,
      }),
    ),
  ),
);

export const saveCredential = Effect.fn("Credentials.save")((value: string, path?: string) =>
  Effect.gen(function* () {
    const statePath = yield* resolveStatePath(path);
    return yield* withStateLock(
      statePath,
      "indeterminate",
      Effect.gen(function* () {
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
            savedUseSuspended: previous.savedUseSuspended || mutationIndeterminate(stored.status),
          };
          yield* writeState(statePath, state);
          return {
            status: mutationIndeterminate(stored.status) ? ("indeterminate" as const) : stored.status,
            state,
          };
        }
        const state = { ...pending, savedUseSuspended: false };
        yield* writeState(statePath, state);
        return { status: "stored" as const, state };
      }),
    );
  }).pipe(
    Effect.catch(() =>
      Effect.succeed<CredentialLifecycleResult>({
        status: "unavailable",
        state: { ...initialState, savedUseSuspended: true },
        stateLock: "unavailable",
      }),
    ),
  ),
);

export const logoutCredential = Effect.fn("Credentials.logout")((path?: string) =>
  Effect.gen(function* () {
    const statePath = yield* resolveStatePath(path);
    return yield* withStateLock(
      statePath,
      "indeterminate",
      Effect.gen(function* () {
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
      }),
    );
  }).pipe(
    Effect.catch(() =>
      Effect.succeed<CredentialLifecycleResult>({
        status: "unavailable",
        state: { ...initialState, savedUseSuspended: true },
        stateLock: "unavailable",
      }),
    ),
  ),
);
