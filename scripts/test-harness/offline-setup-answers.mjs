/** Answer each production interaction session once, even when its prompt repaints. */
export const offlineSetupAnswers = (output) => {
  const sessions = output
    .split(/Esc: (?:Back|Exit) \| (?:Enter: selected option \| )?Ctrl\+C\/Ctrl\+D: Exit\r?\n/)
    .slice(1)
  return sessions.flatMap((session) => {
    if (session.includes("[y/N]")) {
      const verification = session.includes("Verify this key")
      return [{ answer: verification ? "n" : "y", verification, navigation: false }]
    }
    if (session.includes("Continue to grouped approval") || session.includes("Continue to approval"))
      return [{ answer: "", verification: false, navigation: true }]
    return []
  })
}
