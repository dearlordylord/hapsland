import { afterEach, expect, it } from "vitest"
import {
  closeSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildNativeArtifact, buildNativeArtifactAsync, copyNativeArtifact } from "./native-artifact.mjs"

const directories = new Set<string>()
afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.clear()
})
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-native-artifact-"))
  directories.add(directory)
  return { directory, source: join(directory, "source"), output: join(directory, "executable") }
}

it("publishes on a new inode while existing readers retain the complete old artifact", () => {
  const { source, output } = fixture()
  writeFileSync(output, "old native artifact")
  writeFileSync(source, "complete replacement artifact")
  const reader = openSync(output, "r")
  try {
    const oldInode = fstatSync(reader).ino
    copyNativeArtifact(source, output)
    expect(statSync(output).ino).not.toBe(oldInode)
    expect(readFileSync(reader, "utf8")).toBe("old native artifact")
    expect(readFileSync(output, "utf8")).toBe("complete replacement artifact")
    expect(statSync(output).mode & 0o777).toBe(0o755)
  } finally {
    closeSync(reader)
  }
})

it("keeps the previous executable and removes staging after a failed build", () => {
  const { directory, output } = fixture()
  writeFileSync(output, "working artifact")
  const previousInode = statSync(output).ino
  expect(() =>
    buildNativeArtifact(output, (stagedOutput: string) => {
      writeFileSync(stagedOutput, "incomplete artifact")
      throw new Error("compiler failed")
    })
  ).toThrow("compiler failed")
  expect(statSync(output).ino).toBe(previousInode)
  expect(readFileSync(output, "utf8")).toBe("working artifact")
  expect(readdirSync(directory)).toEqual(["executable"])
})

it("does not publish when the builder produces no executable", () => {
  const { directory, output } = fixture()
  writeFileSync(output, "working artifact")
  expect(() => buildNativeArtifact(output, () => undefined)).toThrow()
  expect(readFileSync(output, "utf8")).toBe("working artifact")
  expect(readdirSync(directory)).toEqual(["executable"])
})

it("awaits compiler completion before publishing the replacement", async () => {
  const { output } = fixture()
  writeFileSync(output, "old")
  let finish: (() => void) | undefined
  const pending = buildNativeArtifactAsync(output, async (stagedOutput: string) => {
    writeFileSync(stagedOutput, "complete")
    await new Promise<void>((resolve) => {
      finish = resolve
    })
  })
  expect(readFileSync(output, "utf8")).toBe("old")
  finish!()
  await pending
  expect(readFileSync(output, "utf8")).toBe("complete")
})

it("does not publish a rejected asynchronous compiler result", async () => {
  const { directory, output } = fixture()
  writeFileSync(output, "old")
  await expect(
    buildNativeArtifactAsync(output, async (stagedOutput: string) => {
      writeFileSync(stagedOutput, "incomplete")
      throw new Error("compiler deadline")
    })
  ).rejects.toThrow("compiler deadline")
  expect(readFileSync(output, "utf8")).toBe("old")
  expect(readdirSync(directory)).toEqual(["executable"])
})
