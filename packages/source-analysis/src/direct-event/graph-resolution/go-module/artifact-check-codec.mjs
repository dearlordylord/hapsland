// Nominal paths for the independently emitted GoArtifact verification entry.
// Numeric Nat and shared records retain their current production representation.
const paths = [
  ["Types.", "../Types."],
  ["traversal/core.", "../traversal/core."],
  ["../../../../agent-flow-bend/ImportGraph.", "../../../../../agent-flow-bend/ImportGraph."],
  [
    "../../../../source-artifacts/src/direct-event/value/Value.",
    "../../../../../source-artifacts/src/direct-event/value/Value."
  ]
]
export const artifactTransport = (value, incoming = true) => {
  if (Array.isArray(value)) return value.map((item) => artifactTransport(item, incoming))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key !== "$" || typeof item !== "string") return [key, artifactTransport(item, incoming)]
      if (incoming && /^(?:ArtifactProtocol|Package|Configuration|PreparationModel)\./u.test(item))
        return [key, "../go-module/" + item]
      if (!incoming && item.startsWith("../go-module/")) return [key, item.slice(13)]
      for (const [host, artifact] of paths) {
        const from = incoming ? host : artifact
        if (item.startsWith(from)) return [key, (incoming ? artifact : host) + item.slice(from.length)]
      }
      return [key, item]
    })
  )
}
