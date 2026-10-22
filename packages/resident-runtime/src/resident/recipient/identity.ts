import {
  isCodexAgentRuntimeVersion,
  isClaudeAgentRuntimeVersion,
  type DirectAdvicee
} from "@hapsland/native-observation/direct-event/observation"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { type ResidentReviewExecutionContext } from "@hapsland/resident-transport/resident/protocol"

/** Identifies the recipient across runtime, version, session and child agent; excludes the working root. */
export const adviceeScopeKey = (advicee: DirectAdvicee) =>
  canonicalValue({
    agentRuntime: advicee.agentRuntime,
    agentRuntimeVersion: advicee.agentRuntimeVersion,
    sessionId: advicee.sessionId,
    subagentId: advicee.subagentId
  })

/** Identifies one recipient and working root, so equal paths in different roots stay separate. */
export const sourceScopeKey = (root: string, advicee: DirectAdvicee) =>
  canonicalValue({ root, recipient: adviceeScopeKey(advicee) })

export const editPermitIdentity = (root: string, advicee: DirectAdvicee) =>
  canonicalValue({ root, tool: advicee.toolUseId })

export const dispatchForSourceRoot = (
  dispatch: ResidentReviewExecutionContext,
  root: string
): ResidentReviewExecutionContext | undefined => {
  const { sourceContexts, ...shared } = dispatch
  if (sourceContexts === undefined) return shared
  const source = sourceContexts.find((context) => context.root === root)
  return source === undefined
    ? undefined
    : { ...shared, credential: source.credential, sessionAnalytics: source.sessionAnalytics }
}

const exactAgentRuntimeVersions = { pi: "1.0.0", opencode: "1.14.44" } as const

const supportedAdviceeVersion = (advicee: DirectAdvicee): boolean =>
  advicee.agentRuntime === "codex-cli"
    ? isCodexAgentRuntimeVersion(advicee.agentRuntimeVersion)
    : advicee.agentRuntime === "claude-code"
      ? isClaudeAgentRuntimeVersion(advicee.agentRuntimeVersion)
      : advicee.agentRuntimeVersion === exactAgentRuntimeVersions[advicee.agentRuntime]

export const addressableAdvicee = (advicee: DirectAdvicee): boolean =>
  supportedAdviceeVersion(advicee) &&
  advicee.sessionId.length > 0 &&
  advicee.toolUseId.length > 0 &&
  (advicee.agentRuntime !== "codex-cli" || advicee.turnId.length > 0)
