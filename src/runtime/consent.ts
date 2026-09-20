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
import {
  JEV_BACKEND,
  JEV_DESTINATION,
} from "./backend.ts";

const execFileAsync = promisify(execFile);

export const CanonicalRoot = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.brand("CanonicalWorkingTreeRoot"),
);
export type CanonicalRoot = typeof CanonicalRoot.Type;

/** Stored identities are extensible so a future backend can coexist in user state. */
export const ConsentBackend = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
).pipe(Schema.brand("ConsentBackend"));
export const ConsentDestination = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2048),
  Schema.isPattern(/^https?:\/\/[^\s]+$/),
).pipe(Schema.brand("ConsentDestination"));

export const ConsentGrant = Schema.Struct({
  root: CanonicalRoot,
  backend: ConsentBackend,
  destination: ConsentDestination,
});
export const ConsentGrantFile = Schema.Struct({
  version: Schema.Literal(1),
  grant: ConsentGrant,
});
export const ConsentScope = Schema.Literal("repository-wide eligible source files");
export const ProposalDigest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(
  Schema.brand("ConsentProposalDigest"),
);
export type ProposalDigest = typeof ProposalDigest.Type;
export const ConsentProposal = Schema.Struct({
  version: Schema.Literal(1),
  target: ConsentGrant,
  scope: ConsentScope,
  digest: ProposalDigest,
});
export interface ConsentProposal extends Schema.Schema.Type<typeof ConsentProposal> {}
export const ConsentStore = Schema.Struct({
  version: Schema.Literal(1),
  grants: Schema.Array(ConsentGrant),
});
export interface ConsentStore extends Schema.Schema.Type<typeof ConsentStore> {}

export type ConsentIdentity = ConsentStore["grants"][number];
export type ConsentTarget = {
  readonly root: CanonicalRoot;
  readonly backend: typeof ConsentBackend.Type;
  readonly destination: typeof ConsentDestination.Type;
};

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
  readonly preview: (
    cwd: string,
    backend: string,
    destination: string,
  ) => Effect.Effect<ConsentProposal, ConsentError>;
  /** Confirm a proposal that was freshly previewed for the same target. */
  readonly enable: (
    proposal: ConsentProposal,
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

const digestProposal = (target: ConsentIdentity) =>
  createHash("sha256")
    .update(
      `consent-v1\0${target.root}\0${target.backend}\0${target.destination}\0repository-wide eligible source files`,
    )
    .digest("hex");

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

const makeIdentity = Effect.fn("Consent.normalizeIdentity")(function* (
  cwd: string,
  backend: string,
  destination: string,
) {
  const root = yield* discoverRoot(cwd);
  if (backend !== JEV_BACKEND) {
    return yield* new ConsentError({ reason: "unsupported review backend" });
  }
  if (destination !== JEV_DESTINATION) {
    return yield* new ConsentError({
      reason: "review destination is fixed to the Jev System One endpoint",
    });
  }
  return yield* Schema.decodeUnknownEffect(ConsentGrant, {
    onExcessProperty: "error",
  })({ root, backend, destination }).pipe(
    Effect.mapError(() => new ConsentError({ reason: "consent target identity is invalid" })),
  );
});

const makeProposal = Effect.fn("Consent.preview")(function* (target: ConsentIdentity) {
  return yield* Schema.decodeUnknownEffect(ConsentProposal, {
    onExcessProperty: "error",
  })({
    version: 1,
    target,
    scope: "repository-wide eligible source files",
    digest: digestProposal(target),
  }).pipe(
    Effect.mapError(
      () => new ConsentError({ reason: "consent proposal could not be created" }),
    ),
  );
});

const isSupportedTarget = (target: ConsentIdentity) =>
  target.backend === JEV_BACKEND && target.destination === JEV_DESTINATION;

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
    const loaded = Effect.fn("Consent.read")(function* () {
      // Dispatch checks intentionally reread disk state. A separate process may
      // revoke a grant after an earlier preparation check.
      return yield* readStore(statePath);
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
    });
    const identity = (cwd: string, backend: string, destination: string) =>
      makeIdentity(cwd, backend, destination);
    const preview = Effect.fn("Consent.preview")(function* (
      cwd: string,
      backend: string,
      destination: string,
    ) {
      return yield* identity(cwd, backend, destination).pipe(Effect.flatMap(makeProposal));
    });
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
    const enable = Effect.fn("Consent.enable")(function* (proposal: ConsentProposal) {
      const candidate = yield* Schema.decodeUnknownEffect(ConsentProposal, {
        onExcessProperty: "error",
      })(proposal).pipe(
        Effect.mapError(
          () => new ConsentError({ reason: "consent proposal is invalid" }),
        ),
      );
      if (!isSupportedTarget(candidate.target)) {
        return yield* new ConsentError({
          reason: "consent proposal targets an unsupported review destination",
        });
      }
      const current = yield* preview(
        candidate.target.root,
        candidate.target.backend,
        candidate.target.destination,
      );
      if (current.digest !== candidate.digest) {
        return yield* new ConsentError({
          reason: "consent proposal no longer matches the current repository target",
        });
      }
      const value = current.target;
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
      preview,
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
        preview: Effect.fn("Consent.Test.preview")(function* (cwd, backend, destination) {
          const identity = yield* makeIdentity(cwd, backend, destination);
          return yield* makeProposal(identity);
        }),
        enable: Effect.fn("Consent.Test.enable")(function* (proposal) {
          if (!isSupportedTarget(proposal.target)) {
            return yield* new ConsentError({
              reason: "consent proposal targets an unsupported review destination",
            });
          }
          const current = yield* makeProposal(proposal.target);
          if (current.digest !== proposal.digest) {
            return yield* new ConsentError({
              reason: "consent proposal no longer matches the current repository target",
            });
          }
          const identity = current.target;
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
