const frozenGraphs = new WeakSet<object>()

/** Freeze a trusted data graph once, preserving shared immutable subgraphs. */
export const freezeCanonicalData = <A>(value: A): A => {
  if (typeof value === "object" && value !== null && frozenGraphs.has(value)) return value
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current !== "object" || current === null || frozenGraphs.has(current) || Object.isFrozen(current))
      continue
    const children = Object.values(current)
    Object.freeze(current)
    frozenGraphs.add(current)
    for (const child of children) pending.push(child)
  }
  return value
}
