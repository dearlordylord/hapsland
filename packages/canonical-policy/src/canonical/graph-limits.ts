/** Versioned graph profile captured once for a review unit. */
export type GraphLimits = Readonly<{
  version: 1
  sourceBytes: number
  treeBytes: number
  files: number
  readBytes: number
  outgoingEdges: number
  depth: number
  work: number
}>

export const GRAPH_LIMIT_CEILINGS: GraphLimits = Object.freeze({
  version: 1,
  sourceBytes: 2_097_152,
  treeBytes: 20_480,
  files: 8,
  readBytes: 12_582_912,
  outgoingEdges: 16,
  depth: 4,
  work: 128
})

export const graphLimitFields = [
  "sourceBytes",
  "treeBytes",
  "files",
  "readBytes",
  "outgoingEdges",
  "depth",
  "work"
] as const
export type GraphLimitField = (typeof graphLimitFields)[number]

const graphLimitWithinCeiling = (field: GraphLimitField, count: number): boolean =>
  Number.isSafeInteger(count) && count >= 1 && count <= GRAPH_LIMIT_CEILINGS[field]
const validateGraphLimitField = (field: GraphLimitField, count: number): void => {
  if (!graphLimitWithinCeiling(field, count))
    throw new RangeError(`graphLimits.${field} must be an integer from 1 to ${GRAPH_LIMIT_CEILINGS[field]}`)
}
export const validateGraphLimits = (value: GraphLimits): GraphLimits => {
  if (value.version !== 1) throw new RangeError("graphLimits.version must be 1")
  for (const field of graphLimitFields) validateGraphLimitField(field, value[field])
  if (value.readBytes < value.sourceBytes) {
    throw new RangeError("graphLimits.readBytes must be at least graphLimits.sourceBytes for full-file reservation")
  }
  return Object.freeze({ ...value })
}
