import { readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const targets = [
  ["linux-arm64", "inspection-lock.node"],
  ["darwin-arm64", "inspection-lock.node"],
  ["linux-arm64", "credential-secret-service"],
  ["linux-arm64", "tree-sitter/build/Release/tree_sitter_runtime_binding.node"],
  ["linux-arm64", "tree-sitter-typescript/build/Release/tree_sitter_typescript_binding.node"],
  ["linux-arm64", "tree-sitter-rust/build/Release/tree_sitter_rust_binding.node"],
  ["darwin-arm64", "credential-secret-service"],
  ["darwin-arm64", "capture-open"],
  ["darwin-arm64", "tree-sitter/build/Release/tree_sitter_runtime_binding.node"],
  ["darwin-arm64", "tree-sitter-typescript/build/Release/tree_sitter_typescript_binding.node"],
  ["darwin-arm64", "tree-sitter-rust/build/Release/tree_sitter_rust_binding.node"]
]

for (const [profile, relativePath] of targets) {
  const path = resolve(root, "native/prebuilt", profile, relativePath)
  let bytes
  try {
    if (!statSync(path).isFile()) throw new Error("not a regular file")
    bytes = readFileSync(path)
  } catch {
    throw new Error(`release native artifact is missing: ${profile}/${relativePath}`)
  }
  const elfArm64 =
    bytes.length >= 20 && bytes.subarray(0, 4).toString("hex") === "7f454c46" && bytes.readUInt16LE(18) === 183
  const machArm64 =
    bytes.length >= 8 &&
    ["cffaedfe", "feedfacf"].includes(bytes.subarray(0, 4).toString("hex")) &&
    (bytes.subarray(0, 4).toString("hex") === "cffaedfe" ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4)) === 0x0100000c
  if (!(profile === "linux-arm64" ? elfArm64 : machArm64)) {
    throw new Error(`release native artifact has the wrong format or architecture: ${profile}/${relativePath}`)
  }
}
process.stdout.write("native release artifacts verified for Linux arm64 and macOS arm64\n")
