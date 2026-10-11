import { isCodexHostVersion } from "@hapsland/native-observation/direct-event/codex-version"
import { statSync, accessSync, constants, realpathSync } from "node:fs"
import { isNodeError } from "./file-snapshots.ts"
import { sourceRuntimeFromEntrypoint } from "@hapsland/runtime-environment/runtime/source-runtime-layout"
import { join, extname, resolve, dirname } from "node:path"
import {
  sourceReleaseEntrypoints,
  emittedReleaseEntrypoints,
  packageRootFromEntrypoint,
  runtimeProbeArguments,
  expectedRuntimeVersion,
  packageCommand,
  commandEntrypoint
} from "@hapsland/runtime-environment/runtime/package-runtime"
import { Schema, Effect, Config } from "effect"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { isObject } from "./configuration-values.ts"
import { type InstallationRequest, CodexInstallationError } from "./request.ts"
import { readPackageMetadata, TargetPackageMetadataInvalid } from "./package-metadata.ts"
import { standaloneHookBinding } from "../hook-binding.ts"
import { pathsFor } from "./paths.ts"
import { homedir } from "node:os"

const codexCompatibility = (observed: string, versions: ReadonlyArray<string>, hooksAvailable: boolean) => {
  const version = /^codex-cli (\d+\.\d+\.\d+)$/.exec(observed)?.[1] ?? "unavailable"
  return {
    supported: isCodexHostVersion(version) && hooksAvailable,
    hooksAvailable,
    tested: versions.includes(version),
    observed,
    version,
    required: "Codex CLI with lifecycle hooks and a stable semantic version",
    testedVersions: versions
  }
}

const pathReadiness = (path: string, executable: boolean) => {
  try {
    const metadata = statSync(path)
    accessSync(path, executable ? constants.R_OK | constants.X_OK : constants.R_OK)
    return { ready: metadata.isFile(), observed: metadata.isFile() ? "regular-file" : "not-a-regular-file" }
  } catch (cause) {
    return { ready: false, observed: isNodeError(cause, "ENOENT") ? "missing" : "unreadable" }
  }
}

export const packagedRuntimeEntrypoints = (entrypoint: string) => {
  const materialized = sourceRuntimeFromEntrypoint(entrypoint)
  if (materialized)
    return {
      parser: join(materialized.directory, "parser.mjs"),
      resident: join(materialized.directory, "resident.mjs")
    }
  const extension = extname(entrypoint)
  if ([".js", ".ts", ".mjs"].includes(extension)) {
    const entries = extension === ".ts" ? sourceReleaseEntrypoints : emittedReleaseEntrypoints
    const root = packageRootFromEntrypoint(entrypoint)
    if (!Object.values(entries).some((entry) => resolve(entrypoint) === join(root, entry)))
      throw new Error(
        "Unsupported source runtime entrypoint; use a manifest-owned entry or materialized source runtime"
      )
    return { parser: join(root, entries.parser), resident: join(root, entries.resident) }
  }
  return {
    parser: join(dirname(entrypoint), "hapsland-parser"),
    resident: join(dirname(entrypoint), "hapsland-resident")
  }
}

const RuntimeObservation = Schema.Struct({
  version: Schema.String,
  platform: Schema.String,
  architecture: Schema.String
})

type RuntimeProbe = {
  readonly ready: boolean
  readonly observed: string | Schema.Schema.Type<typeof RuntimeObservation>
}

export const probeRuntime = Effect.fn("CodexInstallation.probeRuntime")(function* (executable: string) {
  const readiness = yield* Effect.sync(() => pathReadiness(executable, true))
  if (!readiness.ready) return { ready: false, observed: readiness.observed } satisfies RuntimeProbe
  const probe = yield* execFileClosedStdin(executable, runtimeProbeArguments(executable), {
    env: process.env,
    timeout: 2_000,
    maxBuffer: 16_384
  })
  if (!probe.succeeded)
    return { ready: false, observed: probe.timedOut ? "timed-out" : "not-a-supported-runtime" } satisfies RuntimeProbe
  const observed = yield* Effect.try({
    try: (): unknown => JSON.parse(probe.stdout),
    catch: () => "invalid-runtime-json"
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(RuntimeObservation)), Effect.result)
  return observed._tag === "Success"
    ? ({ ready: true, observed: observed.success } satisfies RuntimeProbe)
    : ({ ready: false, observed: "not-a-supported-runtime" } satisfies RuntimeProbe)
})

const runtimeIdentityChecks = (inputs: ReturnType<typeof buildInputs>, runtimeProbe: RuntimeProbe) => {
  const observedRuntime = isObject(runtimeProbe.observed) ? runtimeProbe.observed : undefined
  const requiredVersion = expectedRuntimeVersion(inputs.entrypoint)
  const declaredPlatforms = [...new Set(inputs.runtimeProfiles.map(({ operatingSystem }) => operatingSystem))]
  const declaredArchitectures = [...new Set(inputs.runtimeProfiles.map(({ architecture }) => architecture))]
  const declaredProfile = inputs.runtimeProfiles.some(
    ({ operatingSystem, architecture }) =>
      operatingSystem === observedRuntime?.platform && architecture === observedRuntime?.architecture
  )
  return {
    engine: {
      ready: runtimeProbe.ready && observedRuntime?.version === requiredVersion,
      observed: observedRuntime?.version ?? runtimeProbe.observed,
      required: requiredVersion
    },
    platform: {
      ready: runtimeProbe.ready && declaredProfile,
      observed: observedRuntime?.platform ?? runtimeProbe.observed,
      required: declaredPlatforms.join(", ")
    },
    architecture: {
      ready: runtimeProbe.ready && declaredProfile,
      observed: observedRuntime?.architecture ?? runtimeProbe.observed,
      required: declaredArchitectures.join(", ")
    }
  }
}

const runtimeCompatibility = (inputs: ReturnType<typeof buildInputs>) => {
  const executable = pathReadiness(inputs.executable, true)
  const entrypoint = pathReadiness(inputs.entrypoint, false)
  const runtimeProbe = executable.ready ? inputs.runtimeProbe : { ready: false, observed: executable.observed }
  const packaged = packagedRuntimeEntrypoints(inputs.entrypoint)
  const parser = pathReadiness(packaged.parser, false)
  const resident = pathReadiness(packaged.resident, false)
  const checks = {
    runtime: { ...executable, path: inputs.executable },
    entrypoint: { ...entrypoint, path: inputs.entrypoint },
    parser: { ...parser, path: packaged.parser },
    resident: { ...resident, path: packaged.resident },
    ...runtimeIdentityChecks(inputs, runtimeProbe)
  }
  return { supported: Object.values(checks).every((check) => check.ready), checks }
}

export const compatibility = (inputs: ReturnType<typeof buildInputs>) => {
  const codex = inputs.codex
  const runtime = runtimeCompatibility(inputs)
  return { supported: codex.supported && runtime.supported, codex, runtime }
}

const resolvedEntrypoint = (entrypoint: string) => {
  const requested = resolve(entrypoint)
  try {
    return realpathSync(requested)
  } catch {
    return requested
  } // Compatibility reports the missing path without creating state.
}

export const buildInputs = (
  request: InstallationRequest,
  configured: {
    readonly home: string
    readonly executable: string
    readonly entrypoint: string
    readonly controlledReviewer: boolean
    readonly failAfterWrites: number
    readonly hostObserved: string
    readonly hooksAvailable: boolean
    readonly runtimeProbe: RuntimeProbe
  }
) => {
  const home = resolve(configured.home)
  const executable = resolve(configured.executable)
  const entrypoint = resolvedEntrypoint(configured.entrypoint)
  const { codexVersions, ...metadata } = readPackageMetadata(packageRootFromEntrypoint(entrypoint))
  return {
    home,
    executable,
    entrypoint,
    codexExecutable: request.codexExecutable ?? "codex",
    controlledReviewer: configured.controlledReviewer,
    failAfterWrites: configured.failAfterWrites,
    codex: codexCompatibility(configured.hostObserved, codexVersions, configured.hooksAvailable),
    runtimeProbe: configured.runtimeProbe,
    ...metadata,
    binding: standaloneHookBinding(executable, entrypoint, home, "codex"),
    paths: pathsFor(home)
  }
}

export const resolveInputs = Effect.fn("CodexInstallation.inputs")(
  function* (request: InstallationRequest) {
    const home =
      request.codexHome ??
      (yield* Config.NonEmptyString("CODEX_HOME").pipe(Config.withDefault(join(homedir(), ".codex"))))
    const executable = yield* Config.NonEmptyString("REVIEW_INSTALL_RUNTIME").pipe(
      Config.withDefault(packageCommand("hook").executable)
    )
    const entrypoint = yield* Config.NonEmptyString("REVIEW_INSTALL_ENTRYPOINT").pipe(
      Config.withDefault(commandEntrypoint(packageCommand("hook")))
    )
    const controlled = yield* Config.NonEmptyString("REVIEW_INSTALL_CONTROLLED").pipe(Config.withDefault("0"))
    const failAfterWrites = yield* Config.Int("REVIEW_INSTALL_FAIL_AFTER_WRITES").pipe(Config.withDefault(-1))
    const host = yield* execFileClosedStdin(request.codexExecutable ?? "codex", ["--version"], {
      env: process.env,
      timeout: 2_000,
      maxBuffer: 1_048_576
    })
    const features = yield* execFileClosedStdin(request.codexExecutable ?? "codex", ["features", "list"], {
      env: process.env,
      timeout: 2_000,
      maxBuffer: 1_048_576
    })
    const runtimeProbe = yield* probeRuntime(resolve(executable))
    return yield* Effect.try({
      try: () =>
        buildInputs(request, {
          home,
          executable,
          entrypoint,
          controlledReviewer: controlled === "1",
          failAfterWrites,
          hostObserved: host.succeeded ? host.stdout.trim() : "unavailable",
          hooksAvailable: features.succeeded && /^hooks\s+\S+\s+(?:true|false)\s*$/m.test(features.stdout),
          runtimeProbe
        }),
      catch: () => new CodexInstallationError({ reason: "Codex installation inputs unavailable" })
    })
  },
  Effect.mapError(() => new CodexInstallationError({ reason: "Codex installation configuration is invalid" }))
)

export const requireTargetPackageMetadata = (inputs: ReturnType<typeof buildInputs>) => {
  if (!inputs.packageMetadata.ready) {
    throw new TargetPackageMetadataInvalid(
      `target package metadata is missing or malformed: ${inputs.packageMetadata.reason}`
    )
  }
}
