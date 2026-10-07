import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import { authoredTaskInputPath, authoredTaskToolingFiles } from "./authored-task-inputs.mjs"

const leases = ["HAPSLAND_BUILD_LOCK_LEASE", "HAPSLAND_BUILD_PROCESS_GROUP"]
const rootInput = (path) => `$TURBO_ROOT$/${path}`
const closure = (graph, owner) => {
  const visited = new Set()
  const visit = (name) => {
    if (visited.has(name)) return
    visited.add(name)
    for (const dependency of graph.packages.get(name).dependencies) visit(dependency)
  }
  visit(owner.manifest.name)
  return [...visited].sort()
}
const profiles = (owner) => {
  const declared = owner.manifest.hapsland?.assembly?.profiles
  if (declared === undefined) return []
  const allowed = owner.manifest.hapsland?.role
    ? ["linux-arm64", "darwin-arm64"]
    : owner.manifest.hapsland?.surface === "pi-extension"
      ? ["host"]
      : []
  if (
    !Array.isArray(declared) ||
    declared.length === 0 ||
    new Set(declared).size !== declared.length ||
    declared.some((profile) => !allowed.includes(profile))
  )
    throw new Error(`Unsupported assembly task profiles: ${owner.manifest.name}`)
  return [...declared].sort()
}
const nativeProfiles = (owner) => {
  const result = new Set()
  for (const asset of owner.manifest.hapsland?.nativeAssets ?? []) {
    if (
      !asset.producer ||
      !["c", "package-binding"].includes(asset.producer.kind) ||
      !asset.producer.profiles ||
      typeof asset.producer.profiles !== "object" ||
      Array.isArray(asset.producer.profiles)
    )
      throw new Error(`Unsupported native task metadata: ${owner.manifest.name}`)
    for (const profile of Object.keys(asset.producer.profiles)) {
      if (!["linux-arm64", "darwin-arm64"].includes(profile))
        throw new Error(`Unsupported native task profile: ${profile}`)
      result.add(profile)
    }
  }
  return [...result].sort()
}

/** Project task relationships from authoritative workspace manifests, without a second graph. */
export const deriveTurboTaskConfiguration = (graph, root = resolve(import.meta.dirname, "..")) => {
  const tasks = {}
  for (const owner of [...graph.packages.values()].sort((left, right) =>
    left.manifest.name.localeCompare(right.manifest.name)
  )) {
    const name = owner.manifest.name
    const build = `${name}#build`
    const stamp = relative(root, authoredTaskInputPath(root, owner)).replaceAll("\\", "/")
    const clean = `${name}#clean:compiler`
    if (!Object.hasOwn(owner.manifest.scripts ?? {}, "clean:compiler"))
      throw new Error(`Missing compiler cleanup script: ${name}`)
    tasks[clean] = {
      cache: false,
      inputs: [
        "package.json",
        ...["clean-compiler-output", "package-graph", "build-lock", "build-groups", "owned-lock"].map((helper) =>
          rootInput(`scripts/${helper}.mjs`)
        )
      ],
      outputs: [],
      passThroughEnv: [...leases]
    }
    tasks[build] = {
      dependsOn: [clean, ...owner.dependencies.map((dependency) => `${dependency}#build`)].sort(),
      inputs: [
        owner.compiler === "bend" ? "$TURBO_DEFAULT$" : "src/**",
        "!artifacts/**",
        "package.json",
        ...(owner.compiler === "bend" ? [] : ["tsconfig.json"]),
        rootInput(stamp),
        ...[...authoredTaskToolingFiles(owner), "scripts/generate-turbo-config.mjs"].map(rootInput)
      ],
      outputs: ["dist/**"],
      env: ["NODE_OPTIONS", "BUN_OPTIONS"],
      passThroughEnv: [...leases, ...(owner.compiler === "bend" ? ["HAPSLAND_BEND_PRODUCER_ENV"] : [])]
    }
    for (const profile of nativeProfiles(owner)) {
      const task = `native:${profile}`
      if (!Object.hasOwn(owner.manifest.scripts ?? {}, task))
        throw new Error(`Missing native task script: ${name}#${task}`)
      tasks[`${name}#${task}`] = {
        inputs: [
          "package.json",
          rootInput(`.test-runs/native-task-inputs/${owner.manifest.hapsland.domain}/${profile}.json`),
          rootInput("scripts/native-task.mjs")
        ],
        outputs: [`artifacts/native/${profile}/**`],
        cache: !(
          profile === "darwin-arm64" &&
          owner.manifest.hapsland.nativeAssets.some(
            (asset) => asset.producer.kind === "c" && Object.hasOwn(asset.producer.profiles, profile)
          )
        ),
        passThroughEnv: leases
      }
    }
    for (const profile of profiles(owner)) {
      const task = `assemble:${profile}`
      if (!Object.hasOwn(owner.manifest.scripts ?? {}, task))
        throw new Error(`Missing assembly task script: ${name}#${task}`)
      const names = closure(graph, owner)
      const builds = names.map((dependency) => `${dependency}#build`)
      const native =
        profile === "host"
          ? []
          : names.flatMap((dependency) =>
              nativeProfiles(graph.packages.get(dependency)).includes(profile)
                ? [`${dependency}#native:${profile}`]
                : []
            )
      const role = owner.manifest.hapsland.role ?? owner.manifest.hapsland.surface
      tasks[`${name}#${task}`] = {
        dependsOn: [...builds, ...native].sort(),
        inputs: [
          "package.json",
          rootInput(`.test-runs/assembly-prerequisites/${role}/${profile}.json`),
          ...[
            "assembly-prerequisites",
            ...(profile === "host"
              ? ["assemble-host-modules", "host-module-graph", "host-module-imports", "host-module-plan"]
              : ["assemble-entry", "assembly-context"])
          ].map((name) => rootInput(`scripts/${name}.mjs`)),
          ...(profile === "host"
            ? []
            : [rootInput("packages/source-analysis/src/direct-event/languages/native-bindings.ts")]),
          {
            mode: "dependencyOutputs",
            from: [...builds, ...native].sort(),
            globs: ["dist/**/*.js", "dist/**/*.json", ...(native.length ? [`artifacts/native/${profile}/**`] : [])]
          }
        ],
        outputs:
          profile === "host"
            ? ["artifacts/host/**"]
            : [
                `artifacts/${profile}/${owner.manifest.hapsland.executable}`,
                `artifacts/${profile}/assembly-receipt.json`
              ],
        env: ["NODE_OPTIONS", "BUN_OPTIONS"],
        passThroughEnv: [...leases, "HAPSLAND_BEND_PRODUCER_ENV"]
      }
    }
  }
  return { $schema: "https://turbo.build/schema.json", tasks }
}

export const generateTurboConfig = (root, { check = false } = {}) => {
  const graph = readPackageGraph(root)
  const configuration = deriveTurboTaskConfiguration(graph, root)
  const path = resolve(root, "turbo.json"),
    expected = JSON.stringify(configuration, null, 2) + "\n"
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected)
      throw new Error("Stale generated Turbo task configuration")
  } else if (!existsSync(path) || readFileSync(path, "utf8") !== expected) writeFileSync(path, expected)
  return configuration
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  generateTurboConfig(resolve(import.meta.dirname, ".."), { check: process.argv.includes("--check") })
