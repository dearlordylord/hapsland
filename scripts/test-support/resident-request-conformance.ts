import type { ResidentRequest } from "@hapsland/resident-transport/resident/protocol"

/** Structural IPC cases use a deliberately obsolete lifetime to avoid resident work. */
export const requestConformanceCases: ReadonlyArray<ResidentRequest> = (() => {
  const advicee = {
    host: "codex-cli",
    hostVersion: "0.156.0",
    sessionId: "session",
    turnId: "turn",
    toolUseId: "tool",
    subagentId: "child"
  } as const
  const dispatch = { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} } as const
  const root = "/tmp/repository"
  const observation = {
    root,
    rootIdentity: { rootDevice: "1", rootInode: "2", gitDirectory: `${root}/.git`, gitDevice: "1", gitInode: "3" },
    advicee,
    candidates: [{ operation: "add", path: "type.ts" }]
  } as const
  const owner = { requestRoute: "shared", lifetime: "obsolete-conformance", root, advicee } as const
  const token = { requestRoute: "shared", lifetime: owner.lifetime, token: "attempt" } as const
  const collect = { ...owner, operation: "collect", dispatch, composed: true } as const
  return [
    { requestRoute: "shared", operation: "hello" },
    { ...owner, operation: "recipient-root" },
    { ...owner, operation: "edit-policy" },
    { ...owner, operation: "prompt-marker", marker: "a".repeat(64) },
    { ...owner, operation: "prompt-marker", marker: "a".repeat(64), promptDigest: "b".repeat(64), onlyIfMissing: true },
    ...(["begin-stop", "finish-stop"] as const).map((operation) => ({ ...owner, operation, token: "attempt" })),
    { ...owner, operation: "finish-stop", token: "attempt", close: false, reason: "quiescent" },
    { ...owner, operation: "register-edit", startedAt: 1 },
    {
      ...owner,
      operation: "register-edit",
      startedAt: 1.5,
      activityPath: "/tmp/activity",
      userConfigPath: "/tmp/config"
    },
    ...(["claim-background", "release-background"] as const).map((operation) => ({
      ...owner,
      operation,
      token: "00000000-0000-4000-8000-000000000001"
    })),
    ...(["edit", "background", "stop"] as const).map((surface) => ({
      ...token,
      operation: "begin-submission" as const,
      surface
    })),
    ...(["release", "acknowledge", "finalize"] as const).map((operation) => ({ ...token, operation })),
    {
      requestRoute: "shared",
      operation: "admit",
      lifetime: owner.lifetime,
      observation,
      controlledWriter: true,
      composed: true,
      dispatch
    },
    collect,
    { ...collect, mode: "ordinary", reportWorkState: true },
    { ...collect, mode: "turn-end", finish: { token: "attempt", deadlineReached: false } },
    { ...collect, mode: "turn-end", finish: { token: "attempt", deadlineReached: true } },
    {
      requestRoute: "edit",
      operation: "admit-and-collect",
      lifetime: owner.lifetime,
      observation: {
        ...observation,
        advicee: { ...advicee, host: "claude-code", hostVersion: "2.1.218", turnId: null }
      },
      controlledWriter: true,
      composed: true,
      dispatch,
      waitMs: 0
    },
    { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime },
    { requestRoute: "shared", operation: "cleanup", lifetime: owner.lifetime }
  ]
})()
