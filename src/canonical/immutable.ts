const isDataObject = (value: unknown): value is object => typeof value === "object" && value !== null
const mutableDataObject = (value: unknown): value is object => isDataObject(value) && !Object.isFrozen(value)

/** Freeze a trusted data graph once, preserving shared immutable subgraphs. */
export const freezeCanonicalData = <A>(value: A): A => {
  if (!mutableDataObject(value)) return value
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!mutableDataObject(current)) continue
    const children = Object.values(current)
    Object.freeze(current)
    for (const child of children) if (isDataObject(child)) pending.push(child)
  }
  return value
}
