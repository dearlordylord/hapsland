import { precheckStages } from "./check-stages.mjs"
import { resolveNativeAgentProfile } from "../native-agent-profiles.mjs"

export const VERIFICATION_PROFILES = Object.freeze({
  fast: { timeoutMs: 60000, coverageMode: "none" },
  boundary: { timeoutMs: 180000, coverageMode: "none" },
  native: { timeoutMs: 300000, coverageMode: "none" },
  stress: { timeoutMs: 900000, coverageMode: "none" },
  quality: { timeoutMs: 1500000, coverageMode: "fresh-full" }
})
export function resolveVerificationPlan({
  profile,
  selectedTests = [],
  consumerArtifacts = [],
  testOptions = [],
  nativeTarget,
  host,
  provider,
  model,
  scenario,
  timeoutMs
}) {
  const defaults = VERIFICATION_PROFILES[profile]
  if (!defaults) throw new Error("Choose fast, boundary, native, stress or quality")
  timeoutMs ??= defaults.timeoutMs
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 86400000)
    throw new Error("Verification needs a finite positive deadline of at most one day")
  const selectedTestFiles = [...new Set(selectedTests)].sort()
  if (["boundary", "stress"].includes(profile) && !selectedTestFiles.length)
    throw new Error(`${profile} requires explicit test files`)
  if (profile === "quality" && (selectedTestFiles.length || testOptions.length))
    throw new Error("quality always checks the complete deterministic inventory")
  if (profile !== "native" && [nativeTarget, host, provider, model, scenario].some((value) => value !== undefined))
    throw new Error("Native parameters require the native profile")
  const stages = [],
    requiredArtifacts = []
  if (profile === "fast") stages.push({ name: "check-fast", kind: "fast-checks" })
  if (profile === "boundary" && consumerArtifacts.includes("package")) {
    requiredArtifacts.push("package")
    stages.push({ name: "package-archive", kind: "package" })
  }
  if (profile === "native") {
    if (host !== undefined) {
      if (nativeTarget !== undefined || selectedTestFiles.length || testOptions.length)
        throw new Error("Choose an agent scenario or compiler tests")
      resolveNativeAgentProfile({ host, provider, model, scenario })
      if (host === "pi") {
        stages.push({ name: "native-auth-model", kind: "agent-preflight", host, provider, model })
        requiredArtifacts.push("package")
        stages.push({ name: "package-archive", kind: "package" })
      }
      stages.push({ name: "native-agent", kind: "agent", host, provider, model, scenario })
    } else {
      if (!["typescript", "rust", "bend"].includes(nativeTarget) || !selectedTestFiles.length)
        throw new Error("Native compiler checks require a target and explicit compiler test files")
      if ([provider, model, scenario].some((value) => value !== undefined))
        throw new Error("Agent parameters require a host")
      stages.push({ name: "native-toolchain", kind: "toolchain", target: nativeTarget })
    }
  }
  if (profile === "quality")
    stages.push(
      { name: "source-identity", kind: "inputs" },
      { name: "quality", kind: "quality", deterministicPrerequisites: precheckStages.map((stage) => stage[0]) }
    )
  if (selectedTestFiles.some((file) => /\.(mjs|cjs)$/.test(file))) stages.push({ name: "node-focused", kind: "tests" })
  if (selectedTestFiles.some((file) => !/\.(mjs|cjs)$/.test(file)))
    stages.push({ name: "vitest-focused", kind: "tests" })
  return {
    profile,
    timeoutMs,
    coverageMode: defaults.coverageMode,
    selectedTestFiles,
    testOptions,
    requiredArtifacts,
    stages
  }
}
