import { opendir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createHash } from "node:crypto"
import * as Effect from "effect/Effect"
import { LANGUAGE_EXTENSIONS } from "@hapsland/native-observation/direct-event/languages/path-language"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { contextDirectFilePolicy, eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection"
import { observationCaptureBudgetRefusal } from "../capture-budget.ts"
import { goFileMembership, goFilenameMembership, freezeGoBuildSnapshot } from "./go-build-context.ts"
import { goGraphFacts, inspectGoFile, parseGoTypes, goUnselectedTypeEditReason, type GoFile } from "./go.ts"
import type { LanguageAdapter } from "./contracts.ts"
export const MAX_GO_DIRECTORY_ENTRIES = 128
const inventory = async (root: string, directory: string): Promise<readonly string[] | undefined> => {
  try {
    const handle = await opendir(join(root, directory))
    const names: string[] = []
    let count = 0
    for await (const entry of handle) {
      if (++count > MAX_GO_DIRECTORY_ENTRIES) return undefined
      if (entry.name.endsWith(".go") && !/^[._]/u.test(entry.name) && !entry.name.endsWith("_test.go"))
        names.push(join(directory, entry.name))
    }
    return names.sort()
  } catch {
    return undefined
  }
}
export const goAdapter: LanguageAdapter = {
  id: "go",
  extensions: LANGUAGE_EXTENSIONS.go,
  displayName: "Go",
  probe: { path: "doctor.go", source: "package doctor\ntype DoctorProbe struct { Ready bool }\n" },
  parseTypes: parseGoTypes,
  inspect: (path, source) => {
    const file = inspectGoFile(path, source)
    const facts = file === undefined ? undefined : goGraphFacts([file])
    return facts === undefined
      ? undefined
      : { declarations: new Map(file?.types.map((type) => [type.artifact.name, type])), imports: new Map() }
  },
  unselectedTypeEditReason: goUnselectedTypeEditReason,
  hasImports: () => true,
  combinedPreflight: (_path, source, bound) =>
    bound ??
    (inspectGoFile("preflight.go", source) === undefined
      ? undefined
      : { declarations: 0, expandedUnitBytes: 0, hasImports: true }),
  prepareGraph: Effect.fn("Go.prepareActivePackage")(function* (path, capture, host, limits, expired) {
    if (host.branch === "function") return undefined
    const configuration = host.analysisConfiguration?.go
    const snapshot = configuration === undefined ? undefined : freezeGoBuildSnapshot(configuration)
    const directory = dirname(path)
    const candidates = yield* Effect.promise(() => inventory(host.root, directory))
    if (candidates === undefined || !candidates.includes(path) || expired()) return undefined
    const possible = candidates.filter((name) => goFilenameMembership(name, snapshot) !== "inactive")
    // Establish all alternative identities before reading any sibling. No partial
    // inventory may justify a unique binding or absence of typed constants.
    if (possible.length > limits.files) return undefined
    const files: GoFile[] = []
    const dependencies: string[] = []
    const identities: unknown[] = []
    let readBytes = capture.byteLength
    for (const candidate of possible) {
      if (expired()) return undefined
      const selected = yield* eligibleNamedPath(
        host.root,
        candidate,
        contextDirectFilePolicy(host.policy),
        host.rootIdentity
      )
      if (selected === undefined) return undefined
      let source = candidate === path ? capture : host.captureCache?.get(candidate)
      if (source === undefined) {
        if (
          host.captureCache !== undefined &&
          observationCaptureBudgetRefusal(host.captureCache, candidate) !== undefined
        )
          return undefined
        if (readBytes + limits.sourceBytes > limits.readBytes) return undefined
        const result = yield* (host.captureSource ?? captureStable)(
          host.root,
          selected,
          host.captureHooks,
          host.rootIdentity,
          limits.sourceBytes
        )
        if (result.status !== "captured") return undefined
        source = result.capture
        host.captureCache?.set(candidate, source)
      }
      if (source.byteLength > limits.sourceBytes) return undefined
      if (candidate !== path) {
        readBytes += source.byteLength
        dependencies.push(candidate)
      }
      if (readBytes > limits.readBytes) return undefined
      identities.push([candidate, source.contentHash])
      const membership = goFileMembership(candidate, source.text, snapshot)
      if (membership === "unknown" || (candidate === path && membership !== "active")) return undefined
      if (membership !== "active") continue
      const file = inspectGoFile(candidate, source.text)
      if (file === undefined || file.cgo || /^\/\/ Code generated .* DO NOT EDIT\.$/mu.test(source.text))
        return undefined
      files.push(file)
    }
    if (new Set(files.map((file) => file.packageName)).size !== 1) return undefined
    if (
      files.reduce(
        (count, file) =>
          count +
          file.bindings.length +
          file.constants.length +
          file.constants.reduce((sum, group) => sum + group.references.length, 0) +
          file.types.reduce((sum, type) => sum + type.references.length, 0),
        0
      ) > limits.work
    )
      return undefined
    const facts = goGraphFacts(files, limits.work)
    if (facts === undefined || expired()) return undefined
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          host.analysisConfigurationIdentity ?? "unconfigured",
          snapshot?.fingerprint ?? "unconditional",
          candidates,
          identities
        ])
      )
      .digest("hex")
    return {
      dependencies,
      bindingFingerprint: fingerprint,
      limits: {
        ...limits,
        files: limits.files - dependencies.length,
        work: limits.work - facts.discoveryWork,
        readBytes: limits.readBytes - (readBytes - capture.byteLength)
      },
      session: {
        inspect: (file, _source, branch) => (file === path && branch === "type" ? facts : undefined),
        importCandidates: () => []
      }
    }
  })
}
