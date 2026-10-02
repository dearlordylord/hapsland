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
  Schema.Struct({ archiveSha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)), archive: Schema.NonEmptyString }),
]);
const Snapshot = Schema.Struct({ version: Schema.Literal(1), packageVersion: Schema.NonEmptyString, source: ReleaseIdentity });
const Manifest = Schema.Struct({ name: Schema.Literal("@hapsland/hapsland"), version: Schema.NonEmptyString });

export const ReleaseSelection = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("registry"), channel: Schema.Literals(["latest", "next"]), version: Schema.optionalKey(ReleaseVersion) }),
  Schema.Struct({ kind: Schema.Literal("archive"), path: Schema.NonEmptyString }),
]);
export type ReleaseSelection = typeof ReleaseSelection.Type;

export type DistributionOptions = {
  readonly directory?: string;
  readonly run?: (command: string, args: ReadonlyArray<string>) => Effect.Effect<string, unknown>;
};
class DistributionError extends Schema.TaggedError<DistributionError>()("DistributionError", { message: Schema.NonEmptyString }) {}
const failure = (message: string) => Effect.fail(new DistributionError({ message }));
const nativeObservation = Effect.fn("Distribution.observe")(<A>(message: string, read: () => A) =>
  Effect.try({ try: read, catch: () => new DistributionError({ message }) }));
const runCommand = Effect.fn("Distribution.runCommand")(function* (command: string, args: ReadonlyArray<string>) {
  const result = yield* execFileClosedStdin(command, args, {
    env: process.env, timeout: 300_000, maxBuffer: 2 * 1024 * 1024,
  });
  if (!result.succeeded) return yield* failure(`${command} ${args[0] ?? ""} failed`);
  return result.stdout;
});
const readManifest = (prefix: string) => nativeObservation("installed package manifest is invalid", () =>
  Schema.decodeUnknownSync(Manifest)(JSON.parse(readFileSync(join(prefix, "lib", "node_modules", "@hapsland", "hapsland", "package.json"), "utf8"))));

/** Acquires a new target without modifying any active package or host registration. */
export const stageRelease = Effect.fn("Distribution.stageRelease")(function* (
  selection: ReleaseSelection,
  options: DistributionOptions = {},
) {
  const checked = yield* Schema.decodeUnknownEffect(ReleaseSelection)(selection);
  const run = options.run ?? runCommand;
  const base = options.directory ?? join(homedir(), ".local", "share", "hapsland", "candidates");
  yield* nativeObservation("release candidate directory is unavailable", () => mkdirSync(base, { recursive: true, mode: 0o700 }));
  let source: string;
  let identity: typeof ReleaseIdentity.Type;
  if (checked.kind === "registry") {
    const requested = checked.version ?? checked.channel;
    const response = yield* run("npm", ["view", `@hapsland/hapsland@${requested}`, "version", "--json", "--registry=https://registry.npmjs.org/"]);
    const version = yield* nativeObservation("registry version response is malformed", (): unknown => JSON.parse(response)).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ReleaseVersion)),
    );
    if (checked.version !== undefined && checked.version !== version) return yield* failure("registry returned a different version from the explicit selection");
    if (checked.channel === "next" && !version.includes("-")) return yield* failure("candidate selection resolved to a stable version; use --channel=latest");
    if (checked.channel === "latest" && version.includes("-")) return yield* failure("stable selection resolved to a prerelease; select --channel=next explicitly");
    source = `@hapsland/hapsland@${version}`;
    identity = { version, channel: checked.channel };
  } else {
    source = resolve(checked.path);
    const archiveSha256 = yield* nativeObservation("release archive is unreadable", () => createHash("sha256").update(readFileSync(source)).digest("hex"));
    identity = { archive: source, archiveSha256 };
  }
  const names = yield* nativeObservation("release candidate directory is unreadable", () => readdirSync(base).filter(name => name.startsWith("snapshot-")));
  for (const name of names) {
    const prefix = join(base, name);
    const saved = yield* nativeObservation("cached release snapshot is invalid", () =>
      Schema.decodeUnknownSync(Snapshot)(JSON.parse(readFileSync(join(prefix, "snapshot.json"), "utf8")))).pipe(Effect.result);
    if (saved._tag === "Failure") continue;
    const same = "version" in identity
      ? "version" in saved.success.source && saved.success.source.version === identity.version
      : "archiveSha256" in saved.success.source && saved.success.source.archiveSha256 === identity.archiveSha256;
    if (!same) continue;
    const manifest = yield* readManifest(prefix).pipe(Effect.result);
    if (manifest._tag === "Failure" || manifest.success.version !== saved.success.packageVersion ||
      ("version" in identity && manifest.success.version !== identity.version)) continue;
    const verified = yield* run(join(prefix, "bin", "hapsland-doctor"), []).pipe(Effect.result);
    if (verified._tag === "Failure") continue;
    return { prefix, executable: join(prefix, "bin", "hapsland"), packageVersion: manifest.success.version, identity };
  }
  const prefix = yield* nativeObservation("release candidate prefix cannot be created", () => mkdtempSync(join(base, "snapshot-")));
  // The fresh prefix is retained on failure for diagnosis. The active installation stays intact.
  yield* run("npm", ["install", "--global", "--prefix", prefix, "--ignore-scripts=true", "--include=optional", "--registry=https://registry.npmjs.org/", source]);
  const manifest = yield* readManifest(prefix);
  if ("version" in identity && manifest.version !== identity.version) return yield* failure("installed package version differs from the selected release");
  yield* run(join(prefix, "bin", "hapsland-doctor"), []);
  yield* nativeObservation("verified release snapshot cannot be recorded", () => writeFileSync(join(prefix, "snapshot.json"), JSON.stringify({
    version: 1, packageVersion: manifest.version, source: identity,
  }, null, 2) + "\n", { mode: 0o600 }));
  return { prefix, executable: join(prefix, "bin", "hapsland"), packageVersion: manifest.version, identity };
});
