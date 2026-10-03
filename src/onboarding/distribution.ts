import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { execFileClosedStdin } from "./host-process.ts";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ReleaseVersion = Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/));
const ReleaseIdentity = Schema.Union([
  Schema.Struct({ version: ReleaseVersion, channel: Schema.Literals(["latest", "next"]) }),
  Schema.Struct({
    archiveSha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    archive: Schema.NonEmptyString,
  }),
]);
const Snapshot = Schema.Struct({
  version: Schema.Literal(1),
  packageVersion: Schema.NonEmptyString,
  source: ReleaseIdentity,
});
const Manifest = Schema.Struct({ name: Schema.Literal("@hapsland/hapsland"), version: Schema.NonEmptyString });

export const ReleaseSelection = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("registry"),
    channel: Schema.Literals(["latest", "next"]),
    version: Schema.optionalKey(ReleaseVersion),
  }),
  Schema.Struct({ kind: Schema.Literal("archive"), path: Schema.NonEmptyString }),
]);
export type ReleaseSelection = typeof ReleaseSelection.Type;

export type DistributionOptions = {
  readonly directory?: string;
  readonly run?: (command: string, args: ReadonlyArray<string>) => Effect.Effect<string, unknown>;
};
class DistributionError extends Schema.TaggedError<DistributionError>()("DistributionError", {
  message: Schema.NonEmptyString,
}) {}
const failure = (message: string) => Effect.fail(new DistributionError({ message }));
const nativeObservation = Effect.fn("Distribution.observe")(<A>(message: string, read: () => A) =>
  Effect.try({ try: read, catch: () => new DistributionError({ message }) }),
);
const runCommand = Effect.fn("Distribution.runCommand")(function* (command: string, args: ReadonlyArray<string>) {
  const result = yield* execFileClosedStdin(command, args, {
    env: process.env,
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (!result.succeeded) return yield* failure(`${command} ${args[0] ?? ""} failed`);
  return result.stdout;
});
const readManifest = (prefix: string) =>
  nativeObservation("installed package manifest is invalid", () =>
    Schema.decodeUnknownSync(Manifest)(
      JSON.parse(readFileSync(join(prefix, "lib", "node_modules", "@hapsland", "hapsland", "package.json"), "utf8")),
    ),
  );

type ReleaseIdentityValue = typeof ReleaseIdentity.Type;
type DistributionRunner = NonNullable<DistributionOptions["run"]>;
const registryVersionRejection = (
  selection: Extract<ReleaseSelection, { kind: "registry" }>,
  version: string,
): string | undefined => {
  if (selection.version !== undefined && selection.version !== version)
    return "registry returned a different version from the explicit selection";
  if (selection.channel === "next" && !version.includes("-"))
    return "candidate selection resolved to a stable version; use --channel=latest";
  if (selection.channel === "latest" && version.includes("-"))
    return "stable selection resolved to a prerelease; select --channel=next explicitly";
  return undefined;
};
const resolveReleaseSelection = Effect.fn("Distribution.resolveSelection")(function* (
  selection: ReleaseSelection,
  run: DistributionRunner,
) {
  if (selection.kind === "archive") {
    const source = resolve(selection.path);
    const archiveSha256 = yield* nativeObservation("release archive is unreadable", () =>
      createHash("sha256").update(readFileSync(source)).digest("hex"),
    );
    return { source, identity: { archive: source, archiveSha256 } satisfies ReleaseIdentityValue };
  }
  const requested = selection.version ?? selection.channel;
  const response = yield* run("npm", [
    "view",
    `@hapsland/hapsland@${requested}`,
    "version",
    "--json",
    "--registry=https://registry.npmjs.org/",
  ]);
  const version = yield* nativeObservation("registry version response is malformed", (): unknown =>
    JSON.parse(response),
  ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ReleaseVersion)));
  const rejection = registryVersionRejection(selection, version);
  if (rejection !== undefined) return yield* failure(rejection);
  return {
    source: `@hapsland/hapsland@${version}`,
    identity: { version, channel: selection.channel } satisfies ReleaseIdentityValue,
  };
});
const sameReleaseIdentity = (identity: ReleaseIdentityValue, saved: ReleaseIdentityValue): boolean =>
  "version" in identity
    ? "version" in saved && saved.version === identity.version
    : "archiveSha256" in saved && saved.archiveSha256 === identity.archiveSha256;
const manifestMatchesRelease = (identity: ReleaseIdentityValue, version: string): boolean =>
  !("version" in identity) || version === identity.version;
const cachedManifestMatches = (identity: ReleaseIdentityValue, expected: string, observed: string): boolean =>
  observed === expected && manifestMatchesRelease(identity, observed);
const stagedRelease = (prefix: string, packageVersion: string, identity: ReleaseIdentityValue) => ({
  prefix,
  executable: join(prefix, "bin", "hapsland"),
  packageVersion,
  identity,
});
const cachedRelease = Effect.fn("Distribution.cachedRelease")(function* (
  prefix: string,
  identity: ReleaseIdentityValue,
  run: DistributionRunner,
) {
  const saved = yield* nativeObservation("cached release snapshot is invalid", () =>
    Schema.decodeUnknownSync(Snapshot)(JSON.parse(readFileSync(join(prefix, "snapshot.json"), "utf8"))),
  ).pipe(Effect.result);
  if (saved._tag === "Failure") return undefined;
  if (!sameReleaseIdentity(identity, saved.success.source)) return undefined;
  const manifest = yield* readManifest(prefix).pipe(Effect.result);
  if (manifest._tag === "Failure") return undefined;
  if (!cachedManifestMatches(identity, saved.success.packageVersion, manifest.success.version)) return undefined;
  const verified = yield* run(join(prefix, "bin", "hapsland-doctor"), []).pipe(Effect.result);
  if (verified._tag === "Failure") return undefined;
  return stagedRelease(prefix, manifest.success.version, identity);
});
/** Acquires a new target without modifying any active package or host registration. */
export const stageRelease = Effect.fn("Distribution.stageRelease")(function* (
  selection: ReleaseSelection,
  options: DistributionOptions = {},
) {
  const checked = yield* Schema.decodeUnknownEffect(ReleaseSelection)(selection);
  const run = options.run ?? runCommand;
  const base = options.directory ?? join(homedir(), ".local", "share", "hapsland", "candidates");
  yield* nativeObservation("release candidate directory is unavailable", () =>
    mkdirSync(base, { recursive: true, mode: 0o700 }),
  );
  const { source, identity } = yield* resolveReleaseSelection(checked, run);
  const names = yield* nativeObservation("release candidate directory is unreadable", () =>
    readdirSync(base).filter((name) => name.startsWith("snapshot-")),
  );
  for (const name of names) {
    const prefix = join(base, name);
    const cached = yield* cachedRelease(prefix, identity, run);
    if (cached !== undefined) return cached;
  }
  const prefix = yield* nativeObservation("release candidate prefix cannot be created", () =>
    mkdtempSync(join(base, "snapshot-")),
  );
  // The fresh prefix is retained on failure for diagnosis. The active installation stays intact.
  yield* run("npm", [
    "install",
    "--global",
    "--prefix",
    prefix,
    "--ignore-scripts=true",
    "--include=optional",
    "--registry=https://registry.npmjs.org/",
    source,
  ]);
  const manifest = yield* readManifest(prefix);
  if (!manifestMatchesRelease(identity, manifest.version))
    return yield* failure("installed package version differs from the selected release");
  yield* run(join(prefix, "bin", "hapsland-doctor"), []);
  yield* nativeObservation("verified release snapshot cannot be recorded", () =>
    writeFileSync(
      join(prefix, "snapshot.json"),
      JSON.stringify(
        {
          version: 1,
          packageVersion: manifest.version,
          source: identity,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    ),
  );
  return stagedRelease(prefix, manifest.version, identity);
});
