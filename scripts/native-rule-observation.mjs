/** Recognize delivered user-facing rule text; runtime metadata is not feedback. */
export const findingRuleIds = (message, messages) =>
  Object.entries(messages)
    .filter(([, text]) => text.length > 0 && message.includes(text))
    .map(([id]) => id)
