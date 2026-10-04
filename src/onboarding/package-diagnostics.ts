import { packageRoot, packageCommand, commandEntrypoint, runtimeVersion } from "../runtime/package-runtime.ts";
import { Effect, Schema } from "effect";
import { nativeArchitecture } from "./native-architecture.ts";
import { execFileClosedStdin } from "./host-process.ts";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Check = {
  readonly name: string;
  readonly status: "ready" | "unsupported";
  readonly observed: string;
  readonly required: string;
  readonly action?: string;
};

const RuntimeDeclaration = Schema.Struct({
  runtime: Schema.Struct({ name: Schema.String, version: Schema.String }),
  profiles: Schema.Array(
    Schema.Struct({ operatingSystem: Schema.String, architecture: Schema.String, descriptorFacility: Schema.String }),
  ),
  requiredCommands: Schema.Array(Schema.String),
});
const check = (name: string, ready: boolean, observed: string, required: string, action?: string): Check => ({
  name,
  status: ready ? "ready" : "unsupported",
  observed,
  required,
  ...(ready || action === undefined ? {} : { action }),
});

const inspectCommand = Effect.fn("PackageDoctor.command")(function* (command: string) {
  const result = yield* execFileClosedStdin(command, ["--version"], {
    env: process.env,
    timeout: 2_000,
    maxBuffer: 1_048_576,
  });
  if (result.succeeded)
    return check(command, true, result.stdout.trim().split("\n")[0] ?? command, `${command} available`);
  return check(command, false, "unavailable", `${command} available`, `install ${command} and ensure it is on PATH`);
});

const nativeRoot = join(packageRoot, "native", "prebuilt", `${process.platform}-${process.arch}`);
const credentialHelperAction = () =>
  process.platform === "darwin"
    ? "reinstall a release archive containing the macOS arm64 credential helper; environment-only credentials remain available"
    : "reinstall a release archive containing the Linux arm64 credential helper; environment-only credentials remain available";

const inspectCredentialHelper = (): Check => {
  const helper = join(nativeRoot, "credential-secret-service");
  try {
    accessSync(helper, constants.X_OK);
    const architecture = nativeArchitecture(helper);
    return check(
      "native-credential-helper",
      architecture === process.arch,
      `${helper} (${architecture})`,
      `executable packaged native credential helper for ${process.arch}`,
    );
  } catch {
    return check(
      "native-credential-helper",
      false,
      "unavailable",
      "executable packaged native credential helper",
      credentialHelperAction(),
    );
  }
};

const parserBindings = [
  ["parser-runtime-binding", "tree-sitter/build/Release/tree_sitter_runtime_binding.node"],
  ["parser-typescript-binding", "tree-sitter-typescript/build/Release/tree_sitter_typescript_binding.node"],
  ["parser-rust-binding", "tree-sitter-rust/build/Release/tree_sitter_rust_binding.node"],
] as const;

const inspectParserBindings = (): Check[] =>
  parserBindings.map(([name, path]) => {
    const binding = join(nativeRoot, path);
    const architecture = nativeArchitecture(binding);
    return check(
      name,
      architecture === process.arch,
      `${binding} (${architecture})`,
      `prebuilt ${process.arch} parser binding`,
      "reinstall a release archive containing the parser bindings for this platform",
    );
  });

const inspectDescriptorFacility = (
  profile: Schema.Schema.Type<typeof RuntimeDeclaration>["profiles"][number] | undefined,
  supported: string,
): Check => {
  const facility = profile?.descriptorFacility;
  const available = facility !== undefined && existsSync(facility);
  return check(
    "stable-capture-facility",
    available,
    available ? facility : "unavailable",
    facility ?? "descriptor facility for a tested profile",
    profile === undefined
      ? `use one of the tested profiles: ${supported}`
      : `make ${facility} available; path-only source reads are unsupported`,
  );
};

const inspectResidentEntry = (): Check => {
  const command = packageCommand("resident");
  const resident = commandEntrypoint(command);
  try {
    accessSync(resident, command.args.length === 0 ? constants.X_OK : constants.R_OK);
    return check("resident-entry", true, resident, "available packaged resident command");
  } catch {
    return check(
      "resident-entry",
      false,
      "unavailable",
      "available packaged resident command",
      "reinstall the package; the resident command is missing or unavailable",
    );
  }
};

const inspectCaptureHelper = (): Check => {
  const helper = join(packageRoot, "native", "prebuilt", "darwin-arm64", "capture-open");
  const action = "reinstall a release archive containing the macOS arm64 capture helper";
  try {
    accessSync(helper, constants.X_OK);
    const architecture = nativeArchitecture(helper);
    return check(
      "descriptor-capture-helper",
      architecture === process.arch,
      `${helper} (${architecture})`,
      `executable packaged openat helper for ${process.arch}`,
      action,
    );
  } catch {
    return check("descriptor-capture-helper", false, "unavailable", "executable packaged openat helper", action);
  }
};

const parserFailure = (): Check[] => {
  // Effect.try and tryPromise expose UnknownError at this boundary.
  return [
    check(
      "parser",
      false,
      "load-failed",
      "packaged TypeScript parser loads and analyzes",
      "reinstall a release archive containing compatible parser bindings for this platform",
    ),
  ];
};

const inspectParsers = Effect.fn("PackageDoctor.parsers")(function* () {
  const { analyzeTypeFile } = yield* Effect.tryPromise(() => import("../direct-event/analyzer.ts")).pipe(
    Effect.uninterruptible,
  );
  const { registeredLanguages } = yield* Effect.tryPromise(() => import("../direct-event/languages/registry.ts")).pipe(
    Effect.uninterruptible,
  );
  return yield* Effect.try(() =>
    registeredLanguages.map((language) => {
      const parsed = analyzeTypeFile(language.probe.path, language.probe.source);
      return check(
        language.id === "typescript" ? "parser" : `parser-${language.id}`,
        parsed.status === "analyzed",
        parsed.status,
        `packaged ${language.displayName} parser loads and analyzes`,
        "reinstall the package for this exact OS/architecture; verify parser dependencies were installed",
      );
    }),
  );
});

export const diagnosePackage = Effect.fn("PackageDoctor.inspect")(function* () {
  const declaration = yield* Effect.try(() =>
    JSON.parse(readFileSync(join(packageRoot, "package-runtime.json"), "utf8")),
  ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(RuntimeDeclaration)));
  const profile = declaration.profiles.find(
    ({ operatingSystem, architecture }) => operatingSystem === process.platform && architecture === process.arch,
  );
  const supported = declaration.profiles
    .map(({ operatingSystem, architecture }) => `${operatingSystem}/${architecture}`)
    .join(", ");
  const checks = [
    check(
      "runtime",
      runtimeVersion() === declaration.runtime.version,
      runtimeVersion(),
      `${declaration.runtime.name} ${declaration.runtime.version}`,
      `install and invoke the packaged ${declaration.runtime.name} ${declaration.runtime.version} executable`,
    ),
    check(
      "platform-profile",
      profile !== undefined,
      `${process.platform}/${process.arch}`,
      supported,
      `use one of the tested profiles: ${supported}`,
    ),
  ];
  for (const command of declaration.requiredCommands) checks.push(yield* inspectCommand(command));
  if (process.platform === "linux" || process.platform === "darwin") checks.push(inspectCredentialHelper());
  checks.push(...inspectParserBindings(), inspectDescriptorFacility(profile, supported), inspectResidentEntry());
  if (process.platform === "darwin") checks.push(inspectCaptureHelper());
  checks.push(...(yield* inspectParsers().pipe(Effect.catch(() => Effect.sync(parserFailure)))));
  const ready = checks.every(({ status }) => status === "ready");
  return { schemaVersion: 1, status: ready ? "ready" : "unsupported", checks };
}, Effect.scoped);
