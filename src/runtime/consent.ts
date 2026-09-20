import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ConsentGrant = Schema.Struct({
  root: Schema.String,
  backend: Schema.String,
  destination: Schema.String,
});
export const ConsentGrantFile = Schema.Struct({
  version: Schema.Literal(1),
  grant: ConsentGrant,
});
export const ConsentStore = Schema.Struct({
  version: Schema.Literal(1),
  grants: Schema.Array(ConsentGrant),
});
export interface ConsentStore extends Schema.Schema.Type<typeof ConsentStore> {}

export type ConsentIdentity = ConsentStore["grants"][number];

export class ConsentError extends Schema.TaggedError<ConsentError>()(
  "ConsentError",
  { reason: Schema.String },
) {}

export type Authorization =
  | { readonly status: "approved"; readonly identity: ConsentIdentity }
  | {
      readonly status: "missing-consent";
      readonly identity: ConsentIdentity;
    }
  | { readonly status: "unsupported"; readonly reason: string };

export interface Interface {
  readonly discoverRoot: (cwd: string) => Effect.Effect<string, ConsentError>;
  readonly normalizeIdentity: (
    cwd: string,
    backend: string,
    destination: string,
  ) => Effect.Effect<ConsentIdentity, ConsentError>;
  readonly authorize: (
    cwd: string,
    backend: string,
    destination: string,
  ) => Effect.Effect<Authorization, ConsentError>;
  readonly enable: (
    cwd: string,
    backend: string,
    destination: string,
  ) => Effect.Effect<ConsentIdentity, ConsentError>;
  readonly disable: (
    cwd: string,
    backend: string,
    destination: string,
  ) => Effect.Effect<boolean, ConsentError>;
  readonly list: () => Effect.Effect<ReadonlyArray<ConsentIdentity>, ConsentError>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@review/Consent",
) {}

const emptyStore: ConsentStore = { version: 1, grants: [] };

const grantFileName = (grant: ConsentIdentity) =>
  `${createHash("sha256")
    .update(`${grant.root}\0${grant.backend}\0${grant.destination}`)
    .digest("hex")}.json`;

const sameIdentity = (left: ConsentIdentity, right: ConsentIdentity) =>
  left.root === right.root &&
  left.backend === right.backend &&
  left.destination === right.destination;

const readStore = (statePath: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        const entries = await readdir(statePath, { withFileTypes: true });
        const grants: Array<ConsentIdentity> = [];
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
          const encoded = await readFile(`${statePath}/${entry.name}`, "utf8");
          const unknown: unknown = JSON.parse(encoded);
          const decoded = await Effect.runPromise(
            Schema.decodeUnknownEffect(ConsentGrantFile, {
              onExcessProperty: "error",
              errors: "all",
            })(unknown),
          );
          grants.push(decoded.grant);
        }
        return { ...emptyStore, grants };
      } catch (cause) {
        if (
          typeof cause === "object" &&
          cause !== null &&
          "code" in cause &&
          cause.code === "ENOENT"
        ) {
          return emptyStore;
        }
        throw cause;
      }
    },
    catch: () => new ConsentError({ reason: "consent state is missing or invalid" }),
  });

const writeGrant = (statePath: string, grant: ConsentIdentity) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
      await mkdir(statePath, { recursive: true, mode: 0o700 });
      const target = `${statePath}/${grantFileName(grant)}`;
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(
          temporary,
          `${JSON.stringify({ version: 1, grant })}\n`,
          { encoding: "utf8", mode: 0o600 },
        );
        await rename(temporary, target);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    },
    catch: () => new ConsentError({ reason: "could not update user consent state" }),
  });

const removeGrant = (statePath: string, grant: ConsentIdentity) =>
  Effect.tryPromise({
    try: async () => {
      await unlink(`${statePath}/${grantFileName(grant)}`).catch((cause) => {
        if (
          typeof cause === "object" &&
          cause !== null &&
          "code" in cause &&
          cause.code === "ENOENT"
        ) {
          return;
        }
        throw cause;
      });
    },
    catch: () => new ConsentError({ reason: "could not update user consent state" }),
  });

const discoverRoot = Effect.fn("Consent.discoverRoot")(function* (cwd: string) {
  const result = yield* Effect.tryPromise({
    try: () => execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel"]),
    catch: () => new ConsentError({ reason: "working tree could not be discovered" }),
  });
  const reported = result.stdout.trim();
  if (reported.length === 0) {
    return yield* new ConsentError({ reason: "working tree could not be discovered" });
  }
  return yield* Effect.tryPromise({
    try: () => realpath(reported),
    catch: () => new ConsentError({ reason: "working tree root is not accessible" }),
  });
});

const normalizeDestination = (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("destination must be an absolute HTTP URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("destination must use HTTP or HTTPS");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("destination must not contain credentials");
  }
  return parsed.toString().replace(/\/$/, "");
};

const makeIdentity = Effect.fn("Consent.normalizeIdentity")(function* (
  cwd: string,
  backend: string,
  destination: string,
) {
  const root = yield* discoverRoot(cwd);
  if (backend !== "jev") {
    return yield* new ConsentError({ reason: "unsupported review backend" });
  }
  if (backend.length > 128 || destination.length > 2048) {
    return yield* new ConsentError({ reason: "review destination identity is too long" });
  }
  let normalizedDestination: string;
  try {
    normalizedDestination = normalizeDestination(destination);
  } catch {
    return yield* new ConsentError({ reason: "review destination is invalid" });
  }
  return { root, backend, destination: normalizedDestination } satisfies ConsentIdentity;
});

const toRelativeRootPath = (root: string, cwd: string, path: string) => {
  const absolute = resolve(cwd, path);
  const relativePath = relative(root, absolute);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath.includes("\0")
  ) {
    return undefined;
  }
  return relativePath.replaceAll(sep, "/") || ".";
};

const makeService = (statePath: string): Effect.Effect<Interface> =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ConsentStore | undefined>(undefined);
    const loaded = Effect.fn("Consent.read")(function* () {
      const cached = yield* Ref.get(store);
      if (cached !== undefined) return cached;
      const value = yield* readStore(statePath);
      yield* Ref.set(store, value);
      return value;
    });
    const save = Effect.fn("Consent.write")(function* (
      previous: ConsentStore,
      value: ConsentStore,
    ) {
      const previousGrants = new Set(previous.grants.map(grantFileName));
      const nextGrants = new Set(value.grants.map(grantFileName));
      for (const grant of value.grants) {
        if (!previousGrants.has(grantFileName(grant))) yield* writeGrant(statePath, grant);
      }
      for (const grant of previous.grants) {
        if (!nextGrants.has(grantFileName(grant))) yield* removeGrant(statePath, grant);
      }
      yield* Ref.set(store, value);
    });
    const identity = (cwd: string, backend: string, destination: string) =>
      makeIdentity(cwd, backend, destination);
    const authorize = Effect.fn("Consent.authorize")(function* (
      cwd: string,
      backend: string,
      destination: string,
    ) {
      const value = yield* identity(cwd, backend, destination).pipe(Effect.option);
      if (value._tag === "None") {
        return {
          status: "unsupported" as const,
          reason: "review is unsupported outside a discoverable Git working tree",
        };
      }
      const state = yield* loaded();
      return state.grants.some((grant) => sameIdentity(grant, value.value))
        ? { status: "approved" as const, identity: value.value }
        : { status: "missing-consent" as const, identity: value.value };
    });
    const enable = Effect.fn("Consent.enable")(function* (
      cwd: string,
      backend: string,
      destination: string,
    ) {
      const value = yield* identity(cwd, backend, destination);
      const state = yield* loaded();
      if (state.grants.some((grant) => sameIdentity(grant, value))) return value;
      yield* save(state, { version: 1, grants: [...state.grants, value] });
      return value;
    });
    const disable = Effect.fn("Consent.disable")(function* (
      cwd: string,
      backend: string,
      destination: string,
    ) {
      const value = yield* identity(cwd, backend, destination);
      const state = yield* loaded();
      const grants = state.grants.filter((grant) => !sameIdentity(grant, value));
      if (grants.length === state.grants.length) return false;
      yield* save(state, { version: 1, grants });
      return true;
    });
    return {
      discoverRoot,
      normalizeIdentity: identity,
      authorize,
      enable,
      disable,
      list: Effect.fn("Consent.list")(function* () {
        return (yield* loaded()).grants;
      }),
    } satisfies Interface;
  });

export const layer = (options: { readonly statePath: string }) =>
  Layer.effect(Service, makeService(options.statePath));

/** In-memory state for deterministic component tests; working-tree discovery remains real. */
export const testLayer = (grants: ReadonlyArray<ConsentIdentity> = []) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const state = yield* Ref.make<ReadonlyArray<ConsentIdentity>>([...grants]);
      const service: Interface = {
        discoverRoot,
        normalizeIdentity: makeIdentity,
        authorize: Effect.fn("Consent.Test.authorize")(function* (
          cwd,
          backend,
          destination,
        ) {
          const identity = yield* makeIdentity(cwd, backend, destination).pipe(Effect.option);
          if (identity._tag === "None") {
            return {
              status: "unsupported" as const,
              reason: "review is unsupported outside a discoverable Git working tree",
            };
          }
          const grantsValue = yield* Ref.get(state);
          return grantsValue.some((grant) => sameIdentity(grant, identity.value))
            ? { status: "approved" as const, identity: identity.value }
            : { status: "missing-consent" as const, identity: identity.value };
        }),
        enable: Effect.fn("Consent.Test.enable")(function* (cwd, backend, destination) {
          const identity = yield* makeIdentity(cwd, backend, destination);
          yield* Ref.update(state, (values) =>
            values.some((grant) => sameIdentity(grant, identity)) ? values : [...values, identity],
          );
          return identity;
        }),
        disable: Effect.fn("Consent.Test.disable")(function* (cwd, backend, destination) {
          const identity = yield* makeIdentity(cwd, backend, destination);
          let removed = false;
          yield* Ref.update(state, (values) =>
            values.filter((grant) => {
              const keep = !sameIdentity(grant, identity);
              removed ||= !keep;
              return keep;
            }),
          );
          return removed;
        }),
        list: Effect.fn("Consent.Test.list")(function* () {
          return yield* Ref.get(state);
        }),
      };
      return service;
    }),
  );

export const rootRelativePath = toRelativeRootPath;

export * as Consent from "./consent.ts";
