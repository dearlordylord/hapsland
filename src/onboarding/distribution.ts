import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { spawnSync } from "node:child_process";
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
  readonly run?: (command: string, args: ReadonlyArray<string>) => string;
};

const runCommand = (command: string, args: ReadonlyArray<string>): string => {
  const result = spawnSync(command, [...args], { encoding: "utf8", timeout: 300_000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
};

/** Acquires a new target without modifying any active package or host registration. */
export const stageRelease = Effect.fn("Distribution.stageRelease")(function* (
  selection: ReleaseSelection,
  options: DistributionOptions = {},
) {
  const checked = yield* Schema.decodeUnknownEffect(ReleaseSelection)(selection);
  return yield* Effect.try({ try: () => {
    const run = options.run ?? runCommand;
    const base = options.directory ?? join(homedir(), ".local", "share", "hapsland", "candidates");
    mkdirSync(base, { recursive: true, mode: 0o700 });
    let source: string;
    let identity: { version: string; channel: string } | { archiveSha256: string; archive: string };
    if (checked.kind === "registry") {
      const requested = checked.version ?? checked.channel;
      const version = Schema.decodeUnknownSync(ReleaseVersion)(
        JSON.parse(run("npm", ["view", `@hapsland/hapsland@${requested}`, "version", "--json", "--registry=https://registry.npmjs.org/"])),
      );
      if (checked.version !== undefined && checked.version !== version) throw new Error("registry returned a different version from the explicit selection");
      if (checked.channel === "next" && !version.includes("-")) throw new Error("candidate selection resolved to a stable version; use --channel=latest");
      if (checked.channel === "latest" && version.includes("-")) throw new Error("stable selection resolved to a prerelease; select --channel=next explicitly");
      source = `@hapsland/hapsland@${version}`;
      identity = { version, channel: checked.channel };
    } else {
      source = resolve(checked.path);
      identity = { archive: source, archiveSha256: createHash("sha256").update(readFileSync(source)).digest("hex") };
    }
    for (const name of readdirSync(base).filter(name => name.startsWith("snapshot-"))) {
      const prefix = join(base, name);
      let saved: typeof Snapshot.Type;
      try { saved = Schema.decodeUnknownSync(Snapshot)(JSON.parse(readFileSync(join(prefix, "snapshot.json"), "utf8"))); }
      catch { continue; }
      const same = "version" in identity
        ? "version" in saved.source && saved.source.version === identity.version
        : "archiveSha256" in saved.source && saved.source.archiveSha256 === identity.archiveSha256;
      if (!same) continue;
      try {
        const manifest = Schema.decodeUnknownSync(Manifest)(JSON.parse(readFileSync(join(prefix, "lib", "node_modules", "@hapsland", "hapsland", "package.json"), "utf8")));
        if (manifest.version !== saved.packageVersion || ("version" in identity && manifest.version !== identity.version)) continue;
        run(join(prefix, "bin", "hapsland-doctor"), []);
        return { prefix, executable: join(prefix, "bin", "hapsland"), packageVersion: manifest.version, identity };
      } catch { /* A damaged cached package is retained; acquire a healthy replacement. */ }
    }
    const prefix = mkdtempSync(join(base, "snapshot-"));
    // The fresh prefix is retained on failure for diagnosis. The active installation stays intact.
    run("npm", ["install", "--global", "--prefix", prefix, "--ignore-scripts=true", "--include=optional", "--registry=https://registry.npmjs.org/", source]);
    const manifest = Schema.decodeUnknownSync(Manifest)(
      JSON.parse(readFileSync(join(prefix, "lib", "node_modules", "@hapsland", "hapsland", "package.json"), "utf8")),
    );
    if ("version" in identity && manifest.version !== identity.version) throw new Error("installed package version differs from the selected release");
    run(join(prefix, "bin", "hapsland-doctor"), []);
    writeFileSync(join(prefix, "snapshot.json"), JSON.stringify({ version: 1, packageVersion: manifest.version, source: identity }, null, 2) + "\n", { mode: 0o600 });
    return { prefix, executable: join(prefix, "bin", "hapsland"), packageVersion: manifest.version, identity };
  }, catch: (cause) => cause instanceof Error ? cause : new Error("release acquisition failed") });
});
