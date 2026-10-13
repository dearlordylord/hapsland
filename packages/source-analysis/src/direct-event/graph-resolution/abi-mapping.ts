// Mechanical graph ABI traversal preserves field order and sparse arrays while
// avoiding the JavaScript call-stack limit for source-bearing ProductValue trees.
export const mapGraphAbi = (value: unknown, field: (key: string, item: unknown) => unknown): unknown => {
  const result: Record<string, unknown> = {}
  type ValueTask = { value: unknown; target: object; key: string | number; field?: boolean }
  type ArrayTask = { source: unknown[]; target: unknown[]; index: number }
  const pending: Array<ValueTask | ArrayTask> = [{ value, target: result, key: "value" }]
  while (pending.length > 0) {
    const next = pending.pop()!
    if ("index" in next) {
      while (next.index < next.target.length && !(next.index in next.source)) next.index++
      if (next.index < next.target.length) {
        const key = next.index++
        const value = next.source[key]
        pending.push(next)
        pending.push({ value, target: next.target, key })
      }
      continue
    }
    const source = next.field ? field(String(next.key), next.value) : next.value
    let converted = source
    if (Array.isArray(source)) {
      const items = new Array<unknown>(source.length)
      converted = items
      pending.push({ source, target: items, index: 0 })
    } else if (source && typeof source === "object") {
      const fields: Record<string, unknown> = {}
      converted = fields
      for (const [key, item] of Object.entries(source).reverse())
        pending.push({ value: item, target: fields, key, field: true })
    }
    Object.defineProperty(next.target, next.key, {
      value: converted,
      enumerable: true,
      writable: true,
      configurable: true
    })
  }
  return result.value
}
