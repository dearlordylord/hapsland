/** Keep guided lifecycle witnesses offline while approving local installation changes. */
export const offlineSetupAnswers = (output) =>
  Array.from(output.matchAll(/([^\r\n]*?)\[y\/N\]/g), ([, question]) => ({
    answer: question.includes("Verify this key") ? "n" : "y",
    verification: question.includes("Verify this key")
  }))
