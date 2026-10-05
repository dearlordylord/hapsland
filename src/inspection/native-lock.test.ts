import { mkdtemp, open, rm, chmod, realpath, mkdir, copyFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { join, resolve } from "node:path"
import { expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { lockInspectionDirectory } from "./native-lock.ts"
import { packageAssetPath } from "../runtime/package-runtime.ts"

it("allows simultaneous read-only owners and excludes a writer until both release", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "hapsland-shared-lock-")))
  const first = await open(directory, "r")
  const second = await open(directory, "r")
  const writer = await open(directory, "r")
  let firstClosed = false,
    secondClosed = false
  try {
    expect(lockInspectionDirectory(first.fd, true)).toBe(true)
    expect(lockInspectionDirectory(second.fd, true)).toBe(true)
    expect(lockInspectionDirectory(writer.fd)).toBe(false)
    await first.close()
    firstClosed = true
    expect(lockInspectionDirectory(writer.fd)).toBe(false)
    await second.close()
    secondClosed = true
    expect(lockInspectionDirectory(writer.fd)).toBe(true)
  } finally {
    if (!firstClosed) await first.close()
    if (!secondClosed) await second.close()
    await writer.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it("accepts only private owned directory descriptors", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "hapsland-lock-")))
  const file = await open(join(directory, "file"), "wx", 0o600)
  const handle = await open(directory, "r")
  try {
    expect(() => lockInspectionDirectory(-1)).toThrow()
    expect(() => lockInspectionDirectory(0.5)).toThrow()
    expect(() => lockInspectionDirectory(file.fd)).toThrow("inspection storage unavailable")
    await chmod(directory, 0o755)
    expect(() => lockInspectionDirectory(handle.fd)).toThrow("inspection storage unavailable")
    await chmod(directory, 0o700)
    expect(lockInspectionDirectory(handle.fd)).toBe(true)
  } finally {
    await handle.close()
    await file.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it("loads the physical binding from a compiled Bun package and releases descriptor ownership", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "hapsland-packaged-lock-")))
  try {
    const profile = `${process.platform}-${process.arch}`
    const native = join(directory, "native/prebuilt", profile)
    const binary = join(directory, "dist/bin", profile, "probe")
    await mkdir(native, { recursive: true })
    await mkdir(join(directory, "dist/bin", profile), { recursive: true })
    await copyFile(
      packageAssetPath("native", "prebuilt", profile, "inspection-lock.node"),
      join(native, "inspection-lock.node")
    )
    await writeFile(join(directory, "package.json"), '{"type":"module"}')
    const entry = join(directory, "probe.ts")
    await writeFile(
      entry,
      `
      import { open, mkdir } from "node:fs/promises";
      import { lockInspectionDirectory } from ${JSON.stringify(fileURLToPath(new URL("./native-lock.ts", import.meta.url)))};
      await mkdir(process.argv[2], { mode: 0o700 });
      const first = await open(process.argv[2], "r"), second = await open(process.argv[2], "r");
      if (!lockInspectionDirectory(first.fd) || lockInspectionDirectory(second.fd)) throw new Error("ownership mismatch");
      await first.close();
      if (!lockInspectionDirectory(second.fd)) throw new Error("release mismatch");
      await second.close();
      console.log("packaged inspection lock passed");
    `
    )
    const bun =
      process.env.HAPSLAND_BUILD_BUN ??
      resolve(
        "node_modules/@oven",
        `bun-${process.platform}-${process.arch === "arm64" ? "aarch64" : process.arch}`,
        "bin/bun"
      )
    const version = spawnSync(bun, ["--version"], { encoding: "utf8", timeout: 5000 })
    expect(version.status, version.error?.message ?? version.stderr).toBe(0)
    expect(version.stdout.trim()).toBe("1.3.14")
    const compile = spawnSync(bun, ["build", "--compile", entry, "--outfile", binary], {
      encoding: "utf8",
      timeout: 20000
    })
    expect(compile.status, compile.error?.message ?? compile.stderr).toBe(0)
    const result = spawnSync(binary, [join(directory, "journal")], { encoding: "utf8", timeout: 5000 })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("packaged inspection lock passed")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
