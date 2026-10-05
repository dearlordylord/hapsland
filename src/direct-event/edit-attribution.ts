/** Prototype facts for direct-root-selection. No source or patch text escapes this module. */
export type PostEditSnapshot = {
  readonly path: string
  readonly operation: "add" | "update"
  /** Stable captured source; the caller owns capture and path eligibility. */
  readonly source: string
}

/** One-based lines and UTF-16 code-unit columns, matching JavaScript and the Node parser binding. */
export type PostEditPosition = { readonly line: number; readonly column: number }
export type PostEditLocation = { readonly start: PostEditPosition; readonly end: PostEditPosition }
export type SupportedRootDeclaration = {
  readonly path: string
  readonly kind: "interface" | "type-alias" | "struct" | "enum" | "datatype" | "function"
  readonly name: string
  /** Half-open range of the complete root, including signature/header. */
  readonly location: PostEditLocation
}
export type VerifiedPatchHunk = {
  readonly path: string
  /** Explicit adapter assertion: coordinates were checked against this snapshot. */
  readonly verified: true
  /** Changed post-edit range, half-open. Empty deletions cannot identify a root. */
  readonly location: PostEditLocation
}
export type SelectedRoot = Pick<SupportedRootDeclaration, "path" | "kind" | "name" | "location">
export type AmbiguousSpan = {
  readonly path: string
  readonly location: PostEditLocation
  readonly reason: "ambiguous-attribution"
}
export type RootSelection = {
  readonly selected: ReadonlyArray<SelectedRoot>
  readonly ambiguous: ReadonlyArray<AmbiguousSpan>
}

const validPath = (path: string): boolean =>
  path.length > 0 &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.includes("\0") &&
  !path.split("/").some((part) => part === "" || part === "." || part === "..")
const linesOf = (source: string): ReadonlyArray<number> => {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) if (source[index] === "\n") starts.push(index + 1)
  return starts
}
const offset = (position: PostEditPosition, starts: ReadonlyArray<number>, source: string): number | undefined => {
  const start = starts[position.line - 1]
  if (
    start === undefined ||
    !Number.isSafeInteger(position.line) ||
    !Number.isSafeInteger(position.column) ||
    position.column < 1
  )
    return undefined
  const next = starts[position.line]
  const end = next === undefined ? source.length : next - 1
  const result = start + position.column - 1
  return result <= end ? result : undefined
}
const range = (
  location: PostEditLocation,
  starts: ReadonlyArray<number>,
  source: string
): readonly [number, number] | undefined => {
  const start = offset(location.start, starts, source)
  const end = offset(location.end, starts, source)
  return start === undefined || end === undefined || end < start ? undefined : [start, end]
}
const frozenLocation = (location: PostEditLocation): PostEditLocation =>
  Object.freeze({ start: Object.freeze({ ...location.start }), end: Object.freeze({ ...location.end }) })

type RootBounds = { readonly declaration: SupportedRootDeclaration; readonly bounds: readonly [number, number] }
const declarationKey = (declaration: SupportedRootDeclaration): string => `${declaration.kind}:${declaration.name}`
const boundedDeclaration = (
  snapshot: PostEditSnapshot,
  starts: ReadonlyArray<number>,
  declaration: SupportedRootDeclaration
): RootBounds => {
  if (declaration.path !== snapshot.path || !validPath(declaration.path) || declaration.name.length === 0)
    throw new Error("invalid declaration identity")
  const bounds = range(declaration.location, starts, snapshot.source)
  if (bounds === undefined || bounds[0] === bounds[1]) throw new Error("invalid declaration range")
  return { declaration, bounds }
}
const declarationIdentities = (roots: ReadonlyArray<RootBounds>): ReadonlyMap<string, number> => {
  const identities = new Map<string, number>()
  for (const { declaration } of roots) {
    const key = declarationKey(declaration)
    identities.set(key, (identities.get(key) ?? 0) + 1)
  }
  return identities
}
const ambiguousSpan = (path: string, location: PostEditLocation): AmbiguousSpan =>
  Object.freeze({ path, location: frozenLocation(location), reason: "ambiguous-attribution" })
const selectedDeclaration = (declaration: SupportedRootDeclaration): SelectedRoot =>
  Object.freeze({
    path: declaration.path,
    kind: declaration.kind,
    name: declaration.name,
    location: frozenLocation(declaration.location)
  })
const hunkBounds = (
  snapshot: PostEditSnapshot,
  starts: ReadonlyArray<number>,
  hunk: VerifiedPatchHunk
): readonly [number, number] => {
  if (hunk.verified !== true || hunk.path !== snapshot.path) throw new Error("unverified or mismatched patch hunk")
  const bounds = range(hunk.location, starts, snapshot.source)
  if (bounds === undefined) throw new Error("invalid patch hunk range")
  return bounds
}
const hunkContentEnd = (source: string, bounds: readonly [number, number]): number =>
  bounds[1] > bounds[0] && source[bounds[1] - 1] === "\n" ? bounds[1] - 1 : bounds[1]
const boundsWidth = (root: RootBounds): number => root.bounds[1] - root.bounds[0]
const uniqueEnclosedDeclaration = (
  snapshot: PostEditSnapshot,
  roots: ReadonlyArray<RootBounds>,
  identities: ReadonlyMap<string, number>,
  bounds: readonly [number, number]
): SupportedRootDeclaration | undefined => {
  // Line spans include a final line break; parser declaration spans do not.
  const contentEnd = hunkContentEnd(snapshot.source, bounds)
  const enclosing =
    bounds[0] === contentEnd ? [] : roots.filter(({ bounds: root }) => root[0] <= bounds[0] && contentEnd <= root[1])
  enclosing.sort((a, b) => boundsWidth(a) - boundsWidth(b))
  const smallest = enclosing[0]
  if (smallest === undefined || identities.get(declarationKey(smallest.declaration)) !== 1) return undefined
  const next = enclosing[1]
  return next === undefined || boundsWidth(next) > boundsWidth(smallest) ? smallest.declaration : undefined
}
/** Select uniquely enclosed roots from verified coordinates only. Invalid facts fail closed. */
export const selectEditedRoots = (
  snapshot: PostEditSnapshot,
  patchHunks: ReadonlyArray<VerifiedPatchHunk>,
  declarations: ReadonlyArray<SupportedRootDeclaration>
): RootSelection => {
  if (!validPath(snapshot.path)) throw new Error("invalid snapshot path")
  const starts = linesOf(snapshot.source)
  const roots = declarations.map((declaration) => boundedDeclaration(snapshot, starts, declaration))
  const identities = declarationIdentities(roots)
  const selected = new Map<string, SelectedRoot>()
  const ambiguous: AmbiguousSpan[] = []
  const select = (declaration: SupportedRootDeclaration): void => {
    selected.set(declarationKey(declaration), selectedDeclaration(declaration))
  }
  if (snapshot.operation === "add") {
    for (const { declaration } of roots) {
      if (identities.get(declarationKey(declaration)) === 1) select(declaration)
      else ambiguous.push(ambiguousSpan(snapshot.path, declaration.location))
    }
  } else {
    for (const hunk of patchHunks) {
      const bounds = hunkBounds(snapshot, starts, hunk)
      const declaration = uniqueEnclosedDeclaration(snapshot, roots, identities, bounds)
      if (declaration !== undefined) select(declaration)
      else ambiguous.push(ambiguousSpan(snapshot.path, hunk.location))
    }
  }
  return Object.freeze({ selected: Object.freeze([...selected.values()]), ambiguous: Object.freeze(ambiguous) })
}
