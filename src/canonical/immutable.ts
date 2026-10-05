/** Freeze a trusted data graph once, preserving shared immutable subgraphs. */
export const freezeCanonicalData = <A>(value: A): A => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current !== "object" || current === null || Object.isFrozen(current)) continue
    const children = Object.values(current)
    Object.freeze(current)
    for (const child of children) pending.push(child)
  }
  return value
}
