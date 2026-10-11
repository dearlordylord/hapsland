export type CodexHostVersion = string
export const isCodexHostVersion = (value: unknown): value is CodexHostVersion =>
  typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value)
