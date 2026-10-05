/** Read native submission envelopes without treating partial duplicates as absent. */
const findingLines = (output, address) => {
  const context =
    output.decision === "block"
      ? output.reason
      : output.hookSpecificOutput?.hookEventName === "PostToolUse"
        ? output.hookSpecificOutput.additionalContext
        : undefined
  return typeof context === "string" ? context.split("\n").filter((line) => line.startsWith(`${address}:`)) : []
}

export const nativeFindingLines = (outputs, address) => outputs.flatMap((output) => findingLines(output, address))

/** This package fixture expects each configured finding in one native submission. */
export const nativeFindingsSubmittedOnce = (outputs, address, expected) => {
  const submissions = outputs.map((output) => findingLines(output, address)).filter((lines) => lines.length > 0)
  return submissions.length === 1 && JSON.stringify(submissions.flat().sort()) === JSON.stringify([...expected].sort())
}
