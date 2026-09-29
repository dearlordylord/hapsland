/** Prototype facts for direct-root-selection/v2. No source or patch text escapes this module. */
export type PostEditSnapshot = {
  readonly path: string;
  readonly operation: "add" | "update";
  /** Stable captured source; the caller owns capture and path eligibility. */
  readonly source: string;
};

export type PostEditPosition = { readonly line: number; readonly column: number };
export type PostEditLocation = { readonly start: PostEditPosition; readonly end: PostEditPosition };
export type SupportedRootDeclarationV2 = {
  readonly path: string;
  readonly kind: "interface" | "type-alias" | "function";
  readonly name: string;
  /** Half-open range of the complete root, including signature/header. */
  readonly location: PostEditLocation;
};
export type VerifiedPatchHunkV2 = {
  readonly path: string;
  /** Explicit adapter assertion: coordinates were checked against this snapshot. */
  readonly verified: true;
  /** Changed post-edit range, half-open. Empty deletions cannot identify a root. */
  readonly location: PostEditLocation;
};
export type SelectedRootV2 = Pick<SupportedRootDeclarationV2, "path" | "kind" | "name" | "location">;
export type AmbiguousSpanV2 = { readonly path: string; readonly location: PostEditLocation; readonly reason: "ambiguous-attribution" };
export type RootSelectionV2 = {
  readonly selected: ReadonlyArray<SelectedRootV2>;
  readonly ambiguous: ReadonlyArray<AmbiguousSpanV2>;
};

const validPath = (path: string): boolean => path.length > 0 && !path.startsWith("/") &&
  !path.includes("\\") && !path.includes("\0") && !path.split("/").some((part) => part === "" || part === "." || part === "..");
const linesOf = (source: string): ReadonlyArray<number> => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === "\n") starts.push(index + 1);
  return starts;
};
const offset = (position: PostEditPosition, starts: ReadonlyArray<number>, source: string): number | undefined => {
  const start = starts[position.line - 1];
  if (start === undefined || !Number.isSafeInteger(position.line) || !Number.isSafeInteger(position.column) || position.column < 1) return undefined;
  const next = starts[position.line];
  const end = next === undefined ? source.length : next - 1;
  const result = start + position.column - 1;
  return result <= end ? result : undefined;
};
const range = (location: PostEditLocation, starts: ReadonlyArray<number>, source: string): readonly [number, number] | undefined => {
  const start = offset(location.start, starts, source);
  const end = offset(location.end, starts, source);
  return start === undefined || end === undefined || end < start ? undefined : [start, end];
};
const frozenLocation = (location: PostEditLocation): PostEditLocation => Object.freeze({
  start: Object.freeze({ ...location.start }), end: Object.freeze({ ...location.end }),
});

/** Select uniquely enclosed roots from verified coordinates only. Invalid facts fail closed. */
export const selectEditedRootsV2 = (
  snapshot: PostEditSnapshot,
  patchHunks: ReadonlyArray<VerifiedPatchHunkV2>,
  declarations: ReadonlyArray<SupportedRootDeclarationV2>,
): RootSelectionV2 => {
  if (!validPath(snapshot.path)) throw new Error("invalid snapshot path");
  const starts = linesOf(snapshot.source);
  const roots = declarations.map((declaration) => {
    if (declaration.path !== snapshot.path || !validPath(declaration.path) || declaration.name.length === 0) throw new Error("invalid declaration identity");
    const bounds = range(declaration.location, starts, snapshot.source);
    if (bounds === undefined || bounds[0] === bounds[1]) throw new Error("invalid declaration range");
    return { declaration, bounds };
  });
  const identities = new Map<string, number>();
  for (const { declaration } of roots) {
    const key = `${declaration.kind}:${declaration.name}`;
    identities.set(key, (identities.get(key) ?? 0) + 1);
  }
  const selected = new Map<string, SelectedRootV2>();
  const ambiguous: AmbiguousSpanV2[] = [];
  const select = (declaration: SupportedRootDeclarationV2): void => {
    const key = `${declaration.kind}:${declaration.name}`;
    selected.set(key, Object.freeze({ path: declaration.path, kind: declaration.kind, name: declaration.name, location: frozenLocation(declaration.location) }));
  };
  if (snapshot.operation === "add") {
    for (const { declaration } of roots) {
      if (identities.get(`${declaration.kind}:${declaration.name}`) === 1) select(declaration);
      else ambiguous.push(Object.freeze({ path: snapshot.path, location: frozenLocation(declaration.location), reason: "ambiguous-attribution" }));
    }
  } else {
    for (const hunk of patchHunks) {
      if (hunk.verified !== true || hunk.path !== snapshot.path) throw new Error("unverified or mismatched patch hunk");
      const bounds = range(hunk.location, starts, snapshot.source);
      if (bounds === undefined) throw new Error("invalid patch hunk range");
      const enclosing = bounds[0] === bounds[1] ? [] : roots.filter(({ bounds: root }) => root[0] <= bounds[0] && bounds[1] <= root[1]);
      enclosing.sort((a, b) => (a.bounds[1] - a.bounds[0]) - (b.bounds[1] - b.bounds[0]));
      const smallest = enclosing[0];
      const unique = smallest !== undefined && identities.get(`${smallest.declaration.kind}:${smallest.declaration.name}`) === 1 &&
        (enclosing[1] === undefined || enclosing[1].bounds[1] - enclosing[1].bounds[0] > smallest.bounds[1] - smallest.bounds[0]);
      if (unique && smallest !== undefined) select(smallest.declaration);
      else ambiguous.push(Object.freeze({ path: snapshot.path, location: frozenLocation(hunk.location), reason: "ambiguous-attribution" }));
    }
  }
  return Object.freeze({ selected: Object.freeze([...selected.values()]), ambiguous: Object.freeze(ambiguous) });
};
