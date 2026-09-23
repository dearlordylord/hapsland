import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeDirectory = resolve(root, "native/prebuilt", `${process.platform}-${process.arch}`);
if (process.arch !== "arm64" || !["darwin", "linux"].includes(process.platform)) {
  throw new Error("native release helpers can only be built on a declared arm64 platform");
}
mkdirSync(nativeDirectory, { recursive: true, mode: 0o755 });

if (process.platform === "darwin") {
  const captureOutput = resolve(nativeDirectory, "capture-open");
  const capture = spawnSync("cc", ["-O2", "-std=c11", "-Wall", "-Wextra", resolve(root, "native/capture-open.c"), "-o", captureOutput], {
    stdio: "inherit",
  });
  if (capture.error !== undefined || capture.status !== 0) {
    throw new Error("macOS descriptor capture helper could not be built; install the Xcode Command Line Tools so cc is available");
  }
  chmodSync(captureOutput, 0o755);
  const credentialOutput = resolve(nativeDirectory, "credential-secret-service");
  const credential = spawnSync("cc", [
    "-O2", "-std=c11", "-Wall", "-Wextra",
    resolve(root, "native/credential-keychain.c"),
    "-framework", "Security", "-framework", "CoreFoundation",
    "-o", credentialOutput,
  ], { stdio: "inherit" });
  if (credential.error !== undefined || credential.status !== 0) {
    throw new Error("macOS Keychain credential helper could not be built; install the Xcode Command Line Tools so cc is available");
  }
  chmodSync(credentialOutput, 0o755);
}

if (process.platform === "linux") {
  const output = resolve(nativeDirectory, "credential-secret-service");
  mkdirSync(dirname(output), { recursive: true, mode: 0o755 });
  const flags = spawnSync("pkg-config", ["--cflags", "--libs", "libsecret-1"], { encoding: "utf8" });
  if (flags.error !== undefined || flags.status !== 0) {
    throw new Error("Linux Secret Service credential support requires the libsecret development package and pkg-config");
  }
  const result = spawnSync("cc", [
    "-O2", "-std=c11", "-Wall", "-Wextra",
    resolve(root, "native/credential-secret-service.c"),
    "-o", output,
    ...flags.stdout.trim().split(/\s+/),
  ], { stdio: "inherit" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error("Linux Secret Service credential helper could not be built");
  }
  chmodSync(output, 0o755);
}

const parserBindings = [
  {
    packageName: "tree-sitter",
    localBuild: "tree_sitter_runtime_binding.node",
    publishedPrebuild: "tree-sitter.node",
  },
  {
    packageName: "tree-sitter-typescript",
    localBuild: "tree_sitter_typescript_binding.node",
    publishedPrebuild: "tree-sitter-typescript.node",
  },
];
for (const binding of parserBindings) {
  const packageRoot = resolve(root, "node_modules", binding.packageName);
  const localBuild = resolve(packageRoot, "build/Release", binding.localBuild);
  const publishedPrebuild = resolve(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, binding.publishedPrebuild);
  const candidates = process.platform === "darwin"
    ? [publishedPrebuild, localBuild]
    : [localBuild, publishedPrebuild];
  const source = candidates.find(existsSync);
  if (source === undefined) throw new Error(`release build is missing the ${binding.packageName} native binding`);
  const output = resolve(nativeDirectory, binding.packageName, "build/Release", binding.localBuild);
  mkdirSync(dirname(output), { recursive: true, mode: 0o755 });
  copyFileSync(source, output);
  chmodSync(output, 0o755);
}

const parserProbe = spawnSync(process.execPath, ["-e",
  "const Parser = require('tree-sitter'); const { typescript } = require('tree-sitter-typescript'); const parser = new Parser(); parser.setLanguage(typescript); parser.parse('type Probe = string');",
], {
  cwd: root,
  env: {
    ...process.env,
    TREE_SITTER_PREBUILD: resolve(nativeDirectory, "tree-sitter"),
    TREE_SITTER_TYPESCRIPT_PREBUILD: resolve(nativeDirectory, "tree-sitter-typescript"),
  },
  stdio: "pipe",
});
if (parserProbe.error !== undefined || parserProbe.status !== 0) {
  throw new Error("release parser bindings failed the target-host load probe");
}
