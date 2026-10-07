/** Shared ownership rules for every lifecycle command. Unmarked handlers survive reinstall. */
export const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (object(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export const retainedHookSubset = (current: unknown, expected: unknown): boolean => {
  if (!object(current) || !object(expected) || !Array.isArray(current.hooks) || !Array.isArray(expected.hooks))
    return false
  const { hooks: currentHandlers, ...currentFields } = current
  const { hooks: expectedHandlers, ...expectedFields } = expected
  if (canonicalJson(currentFields) !== canonicalJson(expectedFields)) return false
  const remaining = [...expectedHandlers]
  return currentHandlers.every((handler) => {
    const index = remaining.findIndex((candidate) => canonicalJson(candidate) === canonicalJson(handler))
    if (index < 0) return false
    remaining.splice(index, 1)
    return true
  })
}

type EventOwnership = {
  readonly marker: string
  readonly fingerprint: (group: unknown) => string
  readonly expectedFingerprint: string | undefined
  readonly expectedGroup: unknown
  readonly restoreMissing: boolean
  readonly label: string
}
const ownedEventGroups = (root: Record<string, unknown>, event: string, ownership: EventOwnership) => {
  const hooks = root.hooks === undefined ? {} : root.hooks
  if (!object(hooks)) throw new Error(`${ownership.label} hooks must be an object`)
  const existing = hooks[event]
  if (existing !== undefined && !Array.isArray(existing))
    throw new Error(`${ownership.label} ${event} must be an array`)
  const groups: unknown[] = existing === undefined ? [] : [...existing]
  return { hooks, groups }
}
const ownedGroupMatches = (
  groups: ReadonlyArray<unknown>,
  index: number | undefined,
  ownership: EventOwnership
): boolean => {
  if (index === undefined) return false
  return (
    ownership.fingerprint(groups[index]) === ownership.expectedFingerprint ||
    (ownership.restoreMissing && retainedHookSubset(groups[index], ownership.expectedGroup))
  )
}
const ownedGroupCountValid = (count: number, matches: boolean, ownership: EventOwnership): boolean => {
  if (count > 1) return false
  if (ownership.expectedFingerprint === undefined) return count === 0
  return matches || (ownership.restoreMissing && count === 0)
}
const replaceEventGroups = (
  root: Record<string, unknown>,
  hooks: Record<string, unknown>,
  event: string,
  groups: unknown[]
): Record<string, unknown> => {
  const nextHooks = { ...hooks }
  if (groups.length === 0) delete nextHooks[event]
  else nextHooks[event] = groups
  const result = { ...root }
  if (Object.keys(nextHooks).length === 0) delete result.hooks
  else result.hooks = nextHooks
  return result
}
/** Reconcile one owned event while preserving independent groups and root settings. */
export const reconcileOwnedEvent = (
  root: Record<string, unknown>,
  event: string,
  next: unknown | undefined,
  ownership: EventOwnership
): Record<string, unknown> => {
  const { hooks, groups } = ownedEventGroups(root, event, ownership)
  const indexes = groups.flatMap((group, index) => (canonicalJson(group).includes(ownership.marker) ? [index] : []))
  const index = indexes[0]
  const matches = ownedGroupMatches(groups, index, ownership)
  if (!ownedGroupCountValid(indexes.length, matches, ownership))
    throw new Error(`owned ${ownership.label} ${event} hook is missing, duplicated, or locally modified`)
  if (index !== undefined) groups.splice(index, 1)
  if (next !== undefined) groups.push(next)
  return replaceEventGroups(root, hooks, event, groups)
}

export const removeMarkedHandlers = (
  root: Record<string, unknown>,
  markers: ReadonlyArray<string>
): Record<string, unknown> => {
  if (root.hooks === undefined) return root
  if (!object(root.hooks)) throw new Error("hooks must be an object; repair its syntax before reinstalling")
  const hooks = { ...root.hooks }
  for (const [event, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) throw new Error(`hooks.${event} must be an array; repair its syntax before reinstalling`)
    const groups = value.flatMap((group) => {
      if (!object(group) || !Array.isArray(group.hooks)) return [group]
      const handlers = group.hooks.filter((handler) => {
        if (!object(handler) || typeof handler.command !== "string") return true
        const command = handler.command
        return !markers.some((marker) => command.includes(marker))
      })
      return handlers.length === group.hooks.length
        ? [group]
        : handlers.length === 0
          ? []
          : [{ ...group, hooks: handlers }]
    })
    if (groups.length === 0) delete hooks[event]
    else hooks[event] = groups
  }
  const next = { ...root }
  if (Object.keys(hooks).length === 0) delete next.hooks
  else next.hooks = hooks
  return next
}
