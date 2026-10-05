/** Freeze one pending graph node before scheduling its object children. */
const freezePendingNode = (pending: unknown[]): void => {
  const current = pending.pop()
  if (typeof current !== "object" || current === null || Object.isFrozen(current)) return
  const children = Object.values(current)
  Object.freeze(current)
  for (const child of children) if (typeof child === "object" && child !== null) pending.push(child)
}

/** Freeze a trusted data graph once, preserving shared immutable subgraphs. */
export const freezeCanonicalData = <A>(value: A): A => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value
  const pending: unknown[] = [value]
  while (pending.length > 0) freezePendingNode(pending)
  return value
}
