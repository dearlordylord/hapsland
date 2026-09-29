/** Versioned graph profile captured once for a review unit. */
export type GraphLimits = Readonly<{
  version: 1;
  sourceBytes: number;
  treeBytes: number;
  files: number;
  readBytes: number;
  outgoingEdges: number;
  depth: number;
  work: number;
}>;

export const GRAPH_LIMIT_CEILINGS: GraphLimits = Object.freeze({
  version: 1, sourceBytes: 262_144, treeBytes: 20_480, files: 8,
  readBytes: 1_572_864, outgoingEdges: 16, depth: 4, work: 128,
});

export const graphLimitFields = [
  "sourceBytes", "treeBytes", "files", "readBytes", "outgoingEdges", "depth", "work",
] as const;
export type GraphLimitField = typeof graphLimitFields[number];

export const validateGraphLimits = (value: GraphLimits): GraphLimits => {
  if (value.version !== 1) throw new RangeError("graphLimits.version must be 1");
  for (const field of graphLimitFields) {
    const count = value[field];
    if (!Number.isSafeInteger(count) || count < 1 || count > GRAPH_LIMIT_CEILINGS[field]) {
      throw new RangeError(`graphLimits.${field} must be an integer from 1 to ${GRAPH_LIMIT_CEILINGS[field]}`);
    }
  }
  if (value.readBytes < value.sourceBytes) {
    throw new RangeError("graphLimits.readBytes must be at least graphLimits.sourceBytes for full-file reservation");
  }
  return Object.freeze({ ...value });
};
