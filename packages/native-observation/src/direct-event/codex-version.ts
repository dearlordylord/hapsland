export type CodexAgentRuntimeVersion = string
export const isCodexAgentRuntimeVersion = (value: unknown): value is CodexAgentRuntimeVersion =>
  typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value)
