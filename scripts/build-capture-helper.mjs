import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "darwin") {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const nativeDirectory = resolve(root, "dist/native");
  mkdirSync(nativeDirectory, { recursive: true, mode: 0o755 });
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
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(root, "dist/native/credential-secret-service");
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
