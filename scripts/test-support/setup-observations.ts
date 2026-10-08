import type { Effect } from "effect"
import type { runSetup } from "@hapsland/administration/onboarding/setup"

type Result = Effect.Success<ReturnType<typeof runSetup>>
export const complete: Result = {
  version: 1,
  operation: "setup",
  status: "completed",
  host: { adapter: "codex" },
  scope: { repository: "/controlled", review: "enabled" },
  providerCalls: 0,
  paidVerificationPerformed: false,
  stages: ["compatibility", "installation", "credential", "repository"].map((stage) => ({
    stage,
    status: "complete",
    summary: `${stage} complete`
  })) as Result["stages"],
  completed: [],
  pending: [],
  actions: []
}
export const preview = (digest = "hooks-current"): Result => ({
  ...complete,
  status: "needs-user-action",
  stages: complete.stages.map((stage) =>
    stage.stage === "installation"
      ? { ...stage, status: "pending", observed: { proposal: { changes: ["owned hook"] } } }
      : stage
  ),
  actions: [
    {
      stage: "installation",
      code: "approve-installation",
      action: "install owned hooks",
      authorization: { installProposalDigest: digest }
    },
    {
      stage: "rules",
      code: "approve-default-rules",
      action: "connect default rules",
      authorization: { rulesProposalDigest: "rules-current" }
    }
  ]
})
