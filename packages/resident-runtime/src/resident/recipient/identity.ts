import {
  isCodexHostVersion,
  isClaudeHostVersion,
  type DirectAdvicee
} from "@hapsland/native-observation/direct-event/observation"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { type ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"

export const recipientPartition = (advicee: DirectAdvicee) =>
  canonicalValue({
    host: advicee.host,
    hostVersion: advicee.hostVersion,
    sessionId: advicee.sessionId,
    subagentId: advicee.subagentId
  })

export const sourcePartition = (root: string, advicee: DirectAdvicee) =>
  canonicalValue({ root, recipient: recipientPartition(advicee) })

export const editPermitIdentity = (root: string, advicee: DirectAdvicee) =>
  canonicalValue({ root, tool: advicee.toolUseId })

export const dispatchForSourceRoot = (
  dispatch: ResidentDispatchContext,
  root: string
): ResidentDispatchContext | undefined => {
  const { sourceContexts, ...shared } = dispatch
  if (sourceContexts === undefined) return shared
  const source = sourceContexts.find((context) => context.root === root)
  return source === undefined
    ? undefined
    : { ...shared, credential: source.credential, sessionAnalytics: source.sessionAnalytics }
}

const exactHostVersions = { pi: "1.0.0", opencode: "1.14.44" } as const

const supportedAdviceeVersion = (advicee: DirectAdvicee): boolean =>
  advicee.host === "codex-cli"
    ? isCodexHostVersion(advicee.hostVersion)
    : advicee.host === "claude-code"
      ? isClaudeHostVersion(advicee.hostVersion)
      : advicee.hostVersion === exactHostVersions[advicee.host]

export const addressableAdvicee = (advicee: DirectAdvicee): boolean =>
  supportedAdviceeVersion(advicee) &&
  advicee.sessionId.length > 0 &&
  advicee.toolUseId.length > 0 &&
  (advicee.host !== "codex-cli" || advicee.turnId.length > 0)
