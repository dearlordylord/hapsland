export const statusExitCodes = new Map<string, number>([
  ["unsupported", 3],
  ["conflict", 4],
  ["proposal-mismatch", 4],
  ["partial", 5],
  ...[
    "deletion-failed",
    "needs-user-action",
    "locked",
    "interaction-required",
    "unavailable",
    "timed-out",
    "indeterminate",
    "busy",
    "cancelled",
    "invalid",
    "incomplete",
    "inconclusive"
  ].map((status): [string, number] => [status, 6])
])

export const exitCodeForResult = (record: object): number => {
  const status = "status" in record ? record.status : undefined
  const statusCode = typeof status === "string" ? statusExitCodes.get(status) : undefined
  return statusCode ?? ("error" in record ? 2 : 0)
}

export const assignResultExitCode = (output: unknown): void => {
  if (typeof output === "object" && output !== null) {
    process.exitCode = exitCodeForResult(output)
  }
}
