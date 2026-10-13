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
