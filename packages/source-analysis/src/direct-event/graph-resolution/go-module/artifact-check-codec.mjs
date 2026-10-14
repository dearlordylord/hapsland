// Mechanical nominal ABI conversion for the actual Go artifact check consumers.
const artifactOwner = "../"
export const artifactTransport = (value, incoming = true) => {
  if (Array.isArray(value)) return value.map((item) => artifactTransport(item, incoming))
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (key !== "$" || typeof item !== "string") return [key, artifactTransport(item, incoming)]
        if (incoming) {
          if (item.startsWith("../Types.") || item.startsWith("../traversal/core."))
            return [key, artifactOwner + item.slice(3)]
          if (/^(?:PreparationModel|Configuration|RawText|Input|Package|ArtifactProtocol)\./u.test(item))
            return [key, artifactOwner + "go-module/" + item]
        } else if (item.startsWith(artifactOwner)) {
          const local = item.slice(artifactOwner.length)
          return [key, local.startsWith("go-module/") ? local.slice(10) : "../" + local]
        }
        return [key, item]
      })
    )
  return value
}

// Entry-root emission has one fewer path segment than the component artifact.
// Keep the independent component consumers on their original nominal ABI.
const graphEntryTags = [
  ["../Types.", "Types."],
  ["../traversal/core.", "traversal/core."],
  ["../go-module/", "go-module/"],
  ["../../../../../agent-flow-bend/ImportGraph.", "../../../../agent-flow-bend/ImportGraph."],
  [
    "../../../../../source-artifacts/src/direct-event/value/Value.",
    "../../../../source-artifacts/src/direct-event/value/Value."
  ]
]
const entryTags = (value, incoming) => {
  if (Array.isArray(value)) return value.map((item) => entryTags(item, incoming))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "$" && typeof item === "string") {
        for (const [component, entry] of graphEntryTags) {
          const from = incoming ? component : entry
          if (item.startsWith(from)) return [key, (incoming ? entry : component) + item.slice(from.length)]
        }
        return [key, item]
      }
      return [key, entryTags(item, incoming)]
    })
  )
}
export const graphEntryTransport = (value, incoming = true) =>
  incoming ? entryTags(artifactTransport(value), true) : artifactTransport(entryTags(value, false), false)
