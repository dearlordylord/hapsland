// Experimental bridge retained for pre-integration measurements.
// Production uses canonical-policy/canonical/credential-adapter.
// Caches contain source kinds and Boolean decisions, never paths or credentials.
export function createCredentialPlanner(core, policy, { cache = true } = {}) {
  const names = { Environment: "environment", ProjectLocal: "project-local", Project: "project", User: "user", Native: "native" }
  const constructors = { user: { $: "User" }, native: { $: "Native" }, "project-local": { $: "ProjectLocal" } }
  const destinationIds = { user: 0, native: 1, "project-local": 2 }
  const lookupCache = new Map()
  const saveCache = new Map()
  function kinds(context) {
    const key = Number(context.referenceExplicit) | Number(context.captured) << 1 | Number(context.root !== undefined) << 2
      | Number(context.projectLocalFile !== undefined) << 3 | Number(context.projectFile !== undefined) << 4
    let result = cache ? lookupCache.get(key) : undefined
    if (result === undefined) {
      result = []
      for (let list = core.lookup(context.referenceExplicit, context.captured, context.root !== undefined,
        context.projectLocalFile !== undefined, context.projectFile !== undefined); list.$ === "Con"; list = list.tail)
        result.push(names[list.head.$])
      if (cache) lookupCache.set(key, result)
    }
    return result
  }
  function lookup(context) {
    const result = []
    for (const kind of kinds(context)) result.push(kind === "environment" ? { kind, envVar: context.envVar } : kind === "native"
      ? { kind, target: context.nativeTarget } : { kind, file: kind === "user" ? context.userFile
        : kind === "project" ? context.projectFile : context.projectLocalFile })
    return result
  }
  function save(context, destination) {
    const key = destinationIds[destination] * 2 + Number(context.projectLocalFile !== undefined)
    let available = cache ? saveCache.get(key) : undefined
    if (available === undefined) {
      available = core.save_available(constructors[destination], context.projectLocalFile !== undefined)
      if (cache) saveCache.set(key, available)
    }
    if (!available) return undefined
    const descriptor = policy.destinations.find(item => item.kind === destination)
    return { destination, target: destination === "user" ? context.userFile : destination === "native" ? context.nativeTarget : context.projectLocalFile,
      scope: descriptor.scope, storage: descriptor.storage }
  }
  return { lookup, save, cacheEntries: () => ({ lookup: lookupCache.size, save: saveCache.size }) }
}
