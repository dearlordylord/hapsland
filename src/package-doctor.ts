#!/usr/bin/env node
import { Effect, Schema } from "effect";
import { execFileClosedStdin } from "./onboarding/host-process.ts";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Check = {
  readonly name: string;
  readonly status: "ready" | "unsupported";
  readonly observed: string;
  readonly required: string;
  readonly action?: string;
};

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const RuntimeDeclaration = Schema.Struct({
  runtime: Schema.Struct({ name: Schema.String, version: Schema.String }),
  profiles: Schema.Array(Schema.Struct({ operatingSystem: Schema.String, architecture: Schema.String, descriptorFacility: Schema.String })),
  requiredCommands: Schema.Array(Schema.String),
});
const diagnosePackage = Effect.fn("PackageDoctor.inspect")(function* () {
  const declaration = yield* Effect.try(() => JSON.parse(readFileSync(join(packageRoot, "package-runtime.json"), "utf8"))).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(RuntimeDeclaration)),
  );
  const checks: Array<Check> = [];
  const add = (name: string, ready: boolean, observed: string, required: string, action?: string) => {
    checks.push({ name, status: ready ? "ready" : "unsupported", observed, required, ...(ready || action === undefined ? {} : { action }) });
  };
  const nativeArchitecture = (path: string): string => {
    try {
      const bytes = readFileSync(path);
      const magic = bytes.subarray(0, 4).toString("hex");
      const expected = process.arch === "arm64" ? 0x0100000c : process.arch === "x64" ? 0x01000007 : undefined;
      if (expected === undefined) return "unsupported-host-architecture";
      if (process.platform === "linux" && magic === "7f454c46") {
        const machine = process.arch === "arm64" ? 183 : 62;
        return bytes.length >= 20 && bytes.readUInt16LE(18) === machine ? process.arch : "wrong-architecture";
      }
      if (process.platform === "darwin" && ["feedface", "feedfacf", "cefaedfe", "cffaedfe"].includes(magic)) {
        const littleEndian = magic === "cefaedfe" || magic === "cffaedfe";
        return bytes.length >= 8 && (littleEndian ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4)) === expected ? process.arch : "wrong-architecture";
      }
      if (process.platform === "darwin" && ["cafebabe", "bebafeca"].includes(magic)) {
        const littleEndian = magic === "bebafeca";
        const count = littleEndian ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4);
        for (let index = 0; index < count; index += 1) {
          const offset = 8 + index * 20;
          if (offset + 4 > bytes.length) break;
          if ((littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset)) === expected) return process.arch;
        }
        return "wrong-architecture";
      }
      return "wrong-native-format";
    } catch {
      return "unavailable";
    }
  };
  add("runtime", process.version === `v${declaration.runtime.version}`, process.version, `Node ${declaration.runtime.version}`, `install and invoke Node ${declaration.runtime.version}`);
  const profile = declaration.profiles.find(({ operatingSystem, architecture }) =>
    operatingSystem === process.platform && architecture === process.arch
  );
  const supported = declaration.profiles.map(({ operatingSystem, architecture }) => `${operatingSystem}/${architecture}`).join(", ");
  add("platform-profile", profile !== undefined, `${process.platform}/${process.arch}`, supported, `use one of the tested profiles: ${supported}`);

  for (const command of declaration.requiredCommands) {
    const result = yield* execFileClosedStdin(command, ["--version"], { env: process.env, timeout: 2_000, maxBuffer: 1_048_576 });
    if (result.succeeded) {
      const observed = result.stdout.trim().split("\n")[0] ?? command;
      add(command, true, observed, `${command} available`);
    } else {
      add(command, false, "unavailable", `${command} available`, `install ${command} and ensure it is on PATH`);
    }
  }

  if (process.platform === "linux" || process.platform === "darwin") {
    const credentialHelper = join(packageRoot, "native", "prebuilt", `${process.platform}-${process.arch}`, "credential-secret-service");
    try {
      accessSync(credentialHelper, constants.X_OK);
      const architecture = nativeArchitecture(credentialHelper);
      add("native-credential-helper", architecture === process.arch, `${credentialHelper} (${architecture})`, `executable packaged native credential helper for ${process.arch}`);
    } catch {
      add(
        "native-credential-helper",
        false,
        "unavailable",
        "executable packaged native credential helper",
        process.platform === "darwin"
          ? "reinstall a release archive containing the macOS arm64 credential helper; environment-only credentials remain available"
          : "reinstall a release archive containing the Linux arm64 credential helper; environment-only credentials remain available",
      );
    }
  }

  for (const [name, path] of [
    ["parser-runtime-binding", "tree-sitter/build/Release/tree_sitter_runtime_binding.node"],
    ["parser-typescript-binding", "tree-sitter-typescript/build/Release/tree_sitter_typescript_binding.node"],
    ["parser-rust-binding", "tree-sitter-rust/build/Release/tree_sitter_rust_binding.node"],
  ] as const) {
    const binding = join(packageRoot, "native", "prebuilt", `${process.platform}-${process.arch}`, path);
    const architecture = nativeArchitecture(binding);
    add(name, architecture === process.arch, `${binding} (${architecture})`, `prebuilt ${process.arch} parser binding`,
      "reinstall a release archive containing the parser bindings for this platform");
  }

  const descriptorFacility = profile?.descriptorFacility;
  add(
    "stable-capture-facility",
    descriptorFacility !== undefined && existsSync(descriptorFacility),
    descriptorFacility !== undefined && existsSync(descriptorFacility) ? descriptorFacility : "unavailable",
    descriptorFacility ?? "descriptor facility for a tested profile",
    profile === undefined
      ? `use one of the tested profiles: ${supported}`
      : `make ${descriptorFacility} available; path-only source reads are unsupported`,
  );

  const resident = join(packageRoot, "dist", "resident", "main.js");
  try {
    accessSync(resident, constants.R_OK);
    add("resident-entry", true, resident, "readable packaged resident entry");
  } catch {
    add("resident-entry", false, "unavailable", "readable packaged resident entry", "reinstall the package; dist/resident/main.js is missing or unreadable");
  }

  if (process.platform === "darwin") {
    const captureHelper = join(packageRoot, "native", "prebuilt", "darwin-arm64", "capture-open");
    try {
      accessSync(captureHelper, constants.X_OK);
      const architecture = nativeArchitecture(captureHelper);
      add("descriptor-capture-helper", architecture === process.arch, `${captureHelper} (${architecture})`, `executable packaged openat helper for ${process.arch}`,
        "reinstall a release archive containing the macOS arm64 capture helper");
    } catch {
      add(
        "descriptor-capture-helper",
        false,
        "unavailable",
        "executable packaged openat helper",
        "reinstall a release archive containing the macOS arm64 capture helper",
      );
    }
  }

  yield* Effect.gen(function* () {
    const { analyzeTypeFile } = yield* Effect.tryPromise(() => import("./direct-event/analyzer.ts")).pipe(Effect.uninterruptible);
    const { registeredLanguages } = yield* Effect.tryPromise(() => import("./direct-event/languages/registry.ts")).pipe(Effect.uninterruptible);
    yield* Effect.try(() => {
      for (const language of registeredLanguages) {
        const parsed = analyzeTypeFile(language.probe.path, language.probe.source);
        add(language.id === "typescript" ? "parser" : `parser-${language.id}`,
          parsed.status === "analyzed", parsed.status,
          `packaged ${language.displayName} parser loads and analyzes`,
          "reinstall the package for this exact OS/architecture; verify parser dependencies were installed");
      }
    });
  }).pipe(Effect.catch((cause) => Effect.sync(() => {
    const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "load-failed";
    add("parser", false, code, "packaged TypeScript parser loads and analyzes", "reinstall a release archive containing compatible parser bindings for this platform");
  })));

  const ready = checks.every(({ status }) => status === "ready");
  return { schemaVersion: 1, status: ready ? "ready" : "unsupported", checks };
}, Effect.scoped);

const output = await Effect.runPromise(diagnosePackage());
process.stdout.write(`${JSON.stringify(output)}\n`);
process.exitCode = output.status === "ready" ? 0 : 1;
