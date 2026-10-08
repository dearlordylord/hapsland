/** Decode checked Bend outputs; TypeScript never makes the collection decision. */
const findingOutcomes = new Map<string, "selected" | "retained" | "limited" | "expired">([
  ["collectionFindingSelected", "selected"],
  ["collectionFindingRetained", "retained"],
  ["collectionFindingLimited", "limited"],
  ["collectionFindingExpired", "expired"]
] as const)
const orderingOutcomes = new Map<string, number>([
  ["collectionBefore", -1],
  ["collectionEqual", 0],
  ["collectionAfter", 1]
] as const)

export const findingCollectionOutcome = (
  command: string | undefined
): "selected" | "retained" | "limited" | "expired" => {
  const outcome = findingOutcomes.get(command ?? "")
  if (outcome === undefined) throw new Error("invalid canonical finding fit")
  return outcome
}

export const collectionOrdering = (command: string | undefined): number => {
  const outcome = orderingOutcomes.get(command ?? "")
  if (outcome === undefined) throw new Error("invalid canonical collection order")
  return outcome
}

export const finalCollectionFits = (result: {
  readonly rejection?: unknown
  readonly outputs: ReadonlyArray<{ readonly category: "request" | "event" | "decision"; readonly kind: string }>
}): boolean => {
  if (result.rejection !== undefined || result.outputs.length !== 1 || result.outputs[0]?.category !== "decision")
    throw new Error("canonical final response fit refused")
  switch (result.outputs[0]?.kind) {
    case "collectionLimited":
      return false
    case "collectionFits":
      return true
    default:
      throw new Error("invalid canonical final response fit")
  }
}
