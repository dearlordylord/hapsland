// Preserve the deterministic boundary/proof inventory independently of CLI routing.
export const precheckStages = [
  ["configuration", "--experimental-strip-types", "scripts/generate-configuration.ts", "--check"],
  ["bend-artifacts", "scripts/verify-bend-artifacts.mjs"],
  ["monkey-business-freshness", "packages/monkey-business-bend/build.mjs", "--check"],
  ["canonical-authority", "scripts/check-canonical-authority.mjs"],
  ["jev-request", "--experimental-strip-types", "packages/agent-flow-bend/scripts/check-jev-request.mjs"],
  ...[
    "production-authority",
    "capacity-boundary",
    "permit-boundary",
    "review-boundary",
    "dispatch-boundary",
    "stop-boundary",
    "collection-boundary",
    "delivery-boundary",
    "revision-boundary",
    "response-authority-boundary",
    "reuse-boundary",
    "notice-boundary",
    "retention-boundary",
    "configuration-boundary",
    "file-eligibility-boundary",
    "rule-boundary"
  ].map((name) => [name, `scripts/check-${name}.mjs`]),
  ["bend-progress", "packages/agent-flow-bend/scripts/check-progress.mjs"],
  ["native-pi-observation", "--test", "scripts/native-pi-observation.test.mjs"],
  ["native-rule-observation", "--test", "scripts/native-rule-observation.test.mjs"],
  [
    "test-harness",
    "--test",
    "scripts/test-harness/run-checks.test.mjs",
    "scripts/test-harness/prepare-archive.test.mjs",
    "scripts/test-harness/immediate-errors.test.mjs"
  ]
]
