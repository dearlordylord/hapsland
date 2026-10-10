import * as Effect from "effect/Effect"
import { discoverWorkingTreeRoot, rootRelativePath } from "@hapsland/native-observation/repository/root"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import type { ExplainRequest } from "./request.ts"

export const explainCommand = Effect.fn("Cli.explainCommand")(function* (
  operation: ExplainRequest,
  userConfigPath: string | undefined
): Effect.fn.Return<unknown, Error> {
  const root = yield* discoverWorkingTreeRoot(operation.cwd)
  const settings = yield* loadReviewSettings(root, userConfigPath === undefined ? {} : { userConfigPath })
  const cwd = operation.cwd
  const { explainPath, formatPathExplanation } = yield* Effect.promise(() => import("./index.ts"))
  const relativePath = rootRelativePath(root, cwd, operation.path)
  const policy = settings.configuration.policy
  const explanation = explainPath(policy, relativePath ?? operation.path)
  return {
    version: 1,
    operation: "explain",
    repository: { canonicalRoot: root },
    explanation,
    text: formatPathExplanation(explanation)
  }
})
