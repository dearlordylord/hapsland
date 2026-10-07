import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, join, relative } from "node:path"
import { spawnSync } from "node:child_process"

const selection = await resolvePinnedTypeScript()
const nativeExecutable = selection.executable

// Candidate compiler evidence only; production configuration and routing are unchanged.
const destination = process.argv[2]
if (!destination) throw new Error("A fresh evidence directory is required")
const root = resolve(destination)
mkdirSync(root)
const repository = process.cwd()
const compiler = nativeExecutable
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const records = []
for (const [name, overrides] of [
  ["current-bun-conditions", {}],
  [
    "node-host-conditions",
    { module: "NodeNext", moduleResolution: "NodeNext", customConditions: ["node"], types: ["node"] }
  ]
]) {
  const directory = join(root, name)
  mkdirSync(directory)
  const configuration = join(directory, "tsconfig.json")
  writeFileSync(
    configuration,
    JSON.stringify(
      {
        extends: resolve("tsconfig.build.json"),
        compilerOptions: {
          ...overrides,
          typeRoots: [resolve("node_modules/@types")],
          outDir: join(directory, "dist"),
          noEmitOnError: true
        },
        files: [resolve("packages/pi-extension/src/pi/extension.ts")],
        include: [],
        exclude: []
      },
      null,
      2
    ) + "\n"
  )
  const command = ["-p", configuration, "--listFiles", "--listEmittedFiles"]
  const result = spawnSync(compiler, command, {
    cwd: repository,
    encoding: "utf8",
    timeout: 60_000,
    killSignal: "SIGKILL"
  })
  writeFileSync(join(directory, "compiler.log"), result.stdout + result.stderr)
  if (result.error || result.signal || result.status !== 0)
    throw new Error(`Pi ${name} compilation failed; retain compiler.log`)
  const lines = result.stdout.trim().split(/\r?\n/u)
  const outputs = lines.filter((line) => line.startsWith("TSFILE: ")).map((line) => line.slice(8))
  const inputs = lines.filter((line) => !line.startsWith("TSFILE: "))
  const owned = inputs.filter((path) => path.startsWith(join(repository, "src") + "/"))
  if (
    owned.length !== 2 ||
    owned.some(
      (path) =>
        ![
          "packages/pi-extension/src/pi/extension.ts",
          "packages/runtime-environment/src/runtime/hook-catalog.ts"
        ].includes(relative(repository, path))
    )
  )
    throw new Error("Unexpected Pi compiler source input")
  if (
    outputs.length !== 2 ||
    outputs.some(
      (path) => !["pi/extension.js", "runtime/hook-catalog.js"].includes(relative(join(directory, "dist"), path))
    )
  )
    throw new Error("Unexpected Pi emitted artifact")
  records.push({
    name,
    configuration: { path: configuration, sha256: digest(configuration) },
    command,
    inputs: inputs.map((path) => ({ path, sha256: digest(path) })),
    owned,
    outputs: outputs.map((path) => ({ path, sha256: digest(path) }))
  })
}
const hashes = records.map((record) => record.outputs.map((output) => output.sha256).sort())
writeFileSync(
  join(root, "result.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      purpose: "Selected Pi compiler closure and resolver-condition comparison; not production adoption",
      adapter: { path: "scripts/probe-pi-asset.mjs", sha256: digest("scripts/probe-pi-asset.mjs") },
      extendedConfigurations: ["tsconfig.json", "tsconfig.build.json"].map((path) => ({ path, sha256: digest(path) })),
      compiler: {
        path: compiler,
        sha256: digest(compiler),
        identity: selection.identity,
        nativeExecutable,
        nativeSha256: digest(nativeExecutable)
      },
      records,
      byteIdenticalOutputsAcrossConditions: JSON.stringify(hashes[0]) === JSON.stringify(hashes[1]),
      limitations: [
        "Selected project only; ordinary production compilation still spans the full source tree",
        "No conditional external package export is imported by this asset",
        "Actual Node/Pi host execution and installed child routing remain separate checks",
        "No cache/publication enforcement"
      ]
    },
    null,
    2
  ) + "\n"
)
process.stdout.write(JSON.stringify({ evidence: join(root, "result.json") }) + "\n")
