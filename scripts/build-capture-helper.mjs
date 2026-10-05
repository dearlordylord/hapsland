import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildNativeArtifact, copyNativeArtifact } from "./native-artifact.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const nativeDirectory = resolve(root, "native/prebuilt", `${process.platform}-${process.arch}`)
if (process.arch !== "arm64" || !["darwin", "linux"].includes(process.platform)) {
  // Source CI may run on another host; it cannot compile or validate a new profile.
  // Require the same declared artifacts as release assembly before retaining them.
  await import("./verify-native-release.mjs")
  console.log(
    `source-only build on ${process.platform}-${process.arch}: retained verified arm64 native artifacts; no target-host validation`
  )
  process.exit(0)
}
mkdirSync(nativeDirectory, { recursive: true, mode: 0o755 })

const nodeIncludes = [
  resolve(dirname(process.execPath), "../include/node"),
  "/usr/local/include/node",
  "/usr/include/node",
  "/opt/homebrew/include/node"
].find((path) => existsSync(resolve(path, "node_api.h")))
if (!nodeIncludes) throw new Error("inspection locking requires Node-API development headers")
const inspectionOutput = resolve(nativeDirectory, "inspection-lock.node")
buildNativeArtifact(inspectionOutput, (stagedOutput) => {
  const result = spawnSync(
    "cc",
    [
      "-O2",
      "-std=c11",
      "-Wall",
      "-Wextra",
      "-Werror",
      `-I${nodeIncludes}`,
      ...(process.platform === "darwin" ? ["-bundle", "-undefined", "dynamic_lookup"] : ["-shared", "-fPIC"]),
      resolve(root, "native/inspection-lock.c"),
      "-o",
      stagedOutput
    ],
    { stdio: "inherit", timeout: 30000 }
  )
  if (result.error !== undefined || result.status !== 0)
    throw new Error("inspection directory lock binding could not be built")
})

if (process.platform === "darwin") {
  const captureOutput = resolve(nativeDirectory, "capture-open")
  buildNativeArtifact(captureOutput, (stagedOutput) => {
    const capture = spawnSync(
      "cc",
      ["-O2", "-std=c11", "-Wall", "-Wextra", resolve(root, "native/capture-open.c"), "-o", stagedOutput],
      { stdio: "inherit" }
    )
    if (capture.error !== undefined || capture.status !== 0) {
      throw new Error(
        "macOS descriptor capture helper could not be built; install the Xcode Command Line Tools so cc is available"
      )
    }
  })
  const credentialOutput = resolve(nativeDirectory, "credential-secret-service")
  buildNativeArtifact(credentialOutput, (stagedOutput) => {
    const credential = spawnSync(
      "cc",
      [
        "-O2",
        "-std=c11",
        "-Wall",
        "-Wextra",
        resolve(root, "native/credential-keychain.c"),
        "-framework",
        "Security",
        "-framework",
        "CoreFoundation",
        "-o",
        stagedOutput
      ],
      { stdio: "inherit" }
    )
    if (credential.error !== undefined || credential.status !== 0) {
      throw new Error(
        "macOS Keychain credential helper could not be built; install the Xcode Command Line Tools so cc is available"
      )
    }
  })
}

if (process.platform === "linux") {
  const output = resolve(nativeDirectory, "credential-secret-service")
  buildNativeArtifact(output, (stagedOutput) => {
    mkdirSync(dirname(output), { recursive: true, mode: 0o755 })
    const flags = spawnSync("pkg-config", ["--cflags", "--libs", "libsecret-1"], { encoding: "utf8" })
    if (flags.error !== undefined || flags.status !== 0) {
      throw new Error(
        "Linux Secret Service credential support requires the libsecret development package and pkg-config"
      )
    }
    const result = spawnSync(
      "cc",
      [
        "-O2",
        "-std=c11",
        "-Wall",
        "-Wextra",
        resolve(root, "native/credential-secret-service.c"),
        "-o",
        stagedOutput,
        ...flags.stdout.trim().split(/\s+/)
      ],
      { stdio: "inherit" }
    )
    if (result.error !== undefined || result.status !== 0) {
      throw new Error("Linux Secret Service credential helper could not be built")
    }
  })
}

const parserBindings = [
  {
    packageName: "tree-sitter-rust",
    localBuild: "tree_sitter_rust_binding.node",
    publishedPrebuild: "tree-sitter-rust.node"
  },
  { packageName: "tree-sitter", localBuild: "tree_sitter_runtime_binding.node", publishedPrebuild: "tree-sitter.node" },
  {
    packageName: "tree-sitter-typescript",
    localBuild: "tree_sitter_typescript_binding.node",
    publishedPrebuild: "tree-sitter-typescript.node"
  }
]
for (const binding of parserBindings) {
  const packageRoot = resolve(root, "node_modules", binding.packageName)
  const localBuild = resolve(packageRoot, "build/Release", binding.localBuild)
  const publishedPrebuild = resolve(
    packageRoot,
    "prebuilds",
    `${process.platform}-${process.arch}`,
    binding.publishedPrebuild
  )
  const candidates = process.platform === "darwin" ? [publishedPrebuild, localBuild] : [localBuild, publishedPrebuild]
  const source = candidates.find(existsSync)
  if (source === undefined) throw new Error(`release build is missing the ${binding.packageName} native binding`)
  const output = resolve(nativeDirectory, binding.packageName, "build/Release", binding.localBuild)
  mkdirSync(dirname(output), { recursive: true, mode: 0o755 })
  copyNativeArtifact(source, output)
}

const parserProbe = spawnSync(
  process.execPath,
  [
    "-e",
    "const Parser = require('tree-sitter'); const { typescript } = require('tree-sitter-typescript'); const parser = new Parser(); parser.setLanguage(typescript); parser.parse('type Probe = string'); const Rust = require('tree-sitter-rust'); parser.setLanguage(Rust); const tree = parser.parse('struct Probe { value: Option<String> }'); if (tree.rootNode.hasError) process.exit(1);"
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      TREE_SITTER_PREBUILD: resolve(nativeDirectory, "tree-sitter"),
      TREE_SITTER_TYPESCRIPT_PREBUILD: resolve(nativeDirectory, "tree-sitter-typescript"),
      TREE_SITTER_RUST_PREBUILD: resolve(nativeDirectory, "tree-sitter-rust")
    },
    stdio: "pipe"
  }
)
if (parserProbe.error !== undefined || parserProbe.status !== 0) {
  throw new Error("release parser bindings failed the target-host load probe")
}
