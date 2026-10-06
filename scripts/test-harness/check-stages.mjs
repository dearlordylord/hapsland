// Preserve the deterministic boundary/proof inventory independently of CLI routing.
export const precheckStages = [
  ["configuration", "--experimental-strip-types", "scripts/generate-configuration.ts", "--check"],
  ["bend-artifacts", "scripts/verify-bend-artifacts.mjs"],
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
  ["content-isolation", "packages/agent-flow-bend/scripts/check-content-isolation.mjs"],
  ["content-wire-mutants", "scripts/check-content-wire-mutants.mjs"],
  [
    "native-pi-observation",
    "--test",
    "scripts/native-pi-observation.test.mjs",
    "scripts/native-pi-package-assets.test.mjs"
  ],
  ["native-rule-observation", "--test", "scripts/native-rule-observation.test.mjs"],
  [
    "verification-infrastructure",
    "--test",
    "--test-concurrency=1",
    "scripts/artifact-store.test.mjs",
    "scripts/dependency-digests.test.mjs",
    "scripts/dev-pack.test.mjs",
    "scripts/archive-inventory.test.mjs",
    "scripts/install-git-hooks.test.mjs",
    "scripts/pinned-bun.test.mjs",
    "scripts/native-bindings.test.mjs",
    "scripts/native-pi-preflight.test.mjs",
    "scripts/native-process.test.mjs",
    "scripts/test-harness/bun-coverage.test.mjs",
    "scripts/test-harness/verification-plan.test.mjs",
    "scripts/test-harness/verify.test.mjs"
  ],
  [
    "test-harness",
    "--test",
    "scripts/test-harness/run-checks.test.mjs",
    "scripts/test-harness/prepare-archive.test.mjs",
    "scripts/test-harness/immediate-errors.test.mjs"
  ]
]
