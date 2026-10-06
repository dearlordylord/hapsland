import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { selectNativeArtifact } from "./native-artifact.mjs"

test("a foreign local parser binding cannot replace the retained target binding", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-native-selection-"))
  try {
    const foreign = join(root, "local.node")
    const retained = join(root, "retained.node")
    const elf = Buffer.alloc(32)
    elf.write("7f454c46", 0, "hex")
    elf.writeUInt16LE(183, 18)
    const mach = Buffer.alloc(32)
    mach.write("cffaedfe", 0, "hex")
    mach.writeUInt32LE(0x0100000c, 4)
    writeFileSync(foreign, elf)
    writeFileSync(retained, mach)
    assert.equal(selectNativeArtifact([foreign, retained], "darwin-arm64"), retained)
    assert.equal(selectNativeArtifact([foreign, retained], "linux-arm64"), foreign)
    assert.equal(selectNativeArtifact([join(root, "missing"), foreign], "darwin-arm64"), undefined)
    writeFileSync(retained, Buffer.from("truncated"))
    assert.equal(selectNativeArtifact([retained], "darwin-arm64"), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
