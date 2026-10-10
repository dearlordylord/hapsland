const sharedScenarios = [
  "adoption",
  "reviewer-unavailable",
  "hook-crash",
  "hook-timeout",
  "stale-result",
  "pre-delay",
  "pre-timeout",
  "pre-crash"
]
export const NATIVE_AGENT_PROFILES = Object.freeze({
  codex: Object.freeze({
    provider: "openai",
    version: "codex-cli 0.155.1",
    scenarios: Object.freeze([
      ...sharedScenarios,
      "inspection-exclusions",
      "callable-review",
      "go-package-model-review"
    ])
  }),
  claude: Object.freeze({
    provider: "anthropic",
    version: "2.1.218 (Claude Code)",
    scenarios: Object.freeze([...sharedScenarios])
  }),
  pi: Object.freeze({
    provider: "openai",
    model: "gpt-6-luna",
    version: "1.0.0",
    scenarios: Object.freeze(["adoption", "reviewer-unavailable", "unsupported-write", "unicode-edit"])
  })
})
export function resolveNativeAgentProfile({ host, provider, model, scenario }) {
  const profile = Object.hasOwn(NATIVE_AGENT_PROFILES, host) ? NATIVE_AGENT_PROFILES[host] : undefined
  if (!profile || !provider || !model || !scenario)
    throw new Error(
      "Native agent checks require an explicit host, provider, model and scenario from the supported native profiles"
    )
  if (provider !== profile.provider) throw new Error("Native provider must match the selected host profile")
  if (!/^[a-zA-Z0-9_.:/-]{1,120}$/.test(model)) throw new Error("Invalid native model identifier")
  if (profile.model && model !== profile.model)
    throw new Error("Pi native checks require the existing openai/gpt-6-luna profile")
  if (!profile.scenarios.includes(scenario)) throw new Error("Scenario is unsupported by the selected native host")
  return profile
}
