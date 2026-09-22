import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "darwin") {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(root, "dist/native/capture-open");
  mkdirSync(dirname(output), { recursive: true, mode: 0o755 });
  const result = spawnSync("cc", ["-O2", "-std=c11", "-Wall", "-Wextra", resolve(root, "native/capture-open.c"), "-o", output], {
    stdio: "inherit",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error("macOS descriptor capture helper could not be built; install the Xcode Command Line Tools so cc is available");
  }
  chmodSync(output, 0o755);
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
