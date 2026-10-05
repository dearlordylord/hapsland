import { assertReviewEngineBoundary } from "../../../runtime/review-engine-boundary.ts"

assertReviewEngineBoundary("bend-extractor")

/** Bounded Bend 2 surface facts. Never executes or imports edited source. */
export type BendDeclaration = {
  readonly name: string
  readonly source: string
  readonly startPosition: { readonly row: number; readonly column: number }
  readonly endPosition: { readonly row: number; readonly column: number }
  readonly references: ReadonlyArray<{ readonly kind: "named" | "unsupported"; readonly name: string }>
}
export type BendExtraction =
  | {
      readonly declarations: ReadonlyArray<BendDeclaration>
      readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string }>
    }
  | { readonly reason: "parse" | "no-declarations" | "declaration-limit" | "declaration-merge" }

const namePattern = "[A-Za-z_][A-Za-z0-9_]*"
// These are leaf assumptions, not a vendored Base library or compiler check.
// Composite Base types remain named evidence and therefore unresolved.
const baseLeaves = new Set(["Empty", "Unit", "Bool", "Cmp", "Nat", "U32", "F32", "Char", "String"])
// Namespace-prefix refusal assumptions from bend2/base.bend at compiler source
// 1adb0a61916b95de79d3541537462d0bf625f9d3. Names only: no library code is
// vendored. Review this bounded set when the declared Base profile changes.
const basePrefixes = new Set([
  "ALeaf",
  "ANode",
  "App",
  "Array",
  "Audio",
  "Bool",
  "Chan",
  "Char",
  "Chr",
  "Close",
  "Cmp",
  "Con",
  "Done",
  "EQ",
  "Either",
  "Emit",
  "Empty",
  "Equal",
  "Event",
  "Exists",
  "F32",
  "Fail",
  "False",
  "File",
  "GT",
  "Halt",
  "IO",
  "Image",
  "Inl",
  "Inr",
  "Key",
  "LT",
  "List",
  "Listener",
  "Look",
  "MLeaf",
  "MNode",
  "MTip",
  "Map",
  "Maybe",
  "Mouse",
  "Move",
  "Nat",
  "Nil",
  "None",
  "Or",
  "Pair",
  "Pix",
  "Process",
  "Qua",
  "Result",
  "SCon",
  "SNil",
  "Scroll",
  "Set",
  "Sigma",
  "Socket",
  "Some",
  "String",
  "Succ",
  "TCP",
  "True",
  "Tuple",
  "U32",
  "UDP",
  "Unit",
  "WCon",
  "WNil",
  "Window",
  "Word",
  "Zero"
])
const kinds = new Set(["Data", "Type", "Quant"])

type ExtractionReason = Extract<BendExtraction, { reason: unknown }>["reason"]
type Reference = BendDeclaration["references"][number]
type TypeTokens = { readonly tokens: ReadonlyArray<string>; readonly names: string[]; index: number }
const qualifiedName = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/
const typeArguments = (state: TypeTokens, depth: number): boolean => {
  state.index++
  if (!typeTerm(state, depth + 1)) return false
  while (state.tokens[state.index] === ",") {
    state.index++
    if (!typeTerm(state, depth + 1)) return false
  }
  return state.tokens[state.index++] === ">"
}
const typeTerm = (state: TypeTokens, depth: number): boolean => {
  if (depth > 32) return false
  const name = state.tokens[state.index++]
  if (name === undefined || !qualifiedName.test(name)) return false
  state.names.push(name)
  return state.tokens[state.index] === "<" ? typeArguments(state, depth) : true
}
/** Only names and nested datatype applications; no dependent terms or binders. */
const typeNames = (text: string): string[] | undefined => {
  const state: TypeTokens = {
    tokens: text.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|[<>(),]|\S/g) ?? [],
    names: [],
    index: 0
  }
  return typeTerm(state, 0) && state.index === state.tokens.length ? state.names : undefined
}
type FieldScan = { readonly parts: string[]; depth: number; start: number }
const scanFieldCharacter = (state: FieldScan, text: string, index: number): boolean => {
  switch (text[index]) {
    case "<":
      state.depth++
      return true
    case ">":
      return --state.depth >= 0
    case ",":
      if (state.depth === 0) {
        state.parts.push(text.slice(state.start, index))
        state.start = index + 1
      }
      return true
    default:
      return true
  }
}
const splitFields = (text: string): string[] | undefined => {
  const state: FieldScan = { parts: [], depth: 0, start: 0 }
  for (let index = 0; index < text.length; index++) {
    if (!scanFieldCharacter(state, text, index)) return undefined
  }
  if (state.depth !== 0) return undefined
  if (text.slice(state.start).trim() !== "") state.parts.push(text.slice(state.start))
  return state.parts
}
type BendScope = {
  readonly lines: ReadonlyArray<string>
  readonly clean: ReadonlyArray<string>
  readonly starts: number[]
  readonly aliases: Map<string, string>
  readonly imports: Map<string, { readonly path: string; readonly name: string }>
  readonly bindings: Set<string>
  readonly typeBindings: Set<string>
  readonly constructors: Set<string>
  base: boolean
  uncertainScope: boolean
  seenItem: boolean
}
const bindingPattern = new RegExp(
  `^(?:@unsafe\\s+)?(type|def|law)\\s+(${namePattern}(?:\\.${namePattern})*)(?=[<(:?\\s]|$)`
)
const headerPattern = new RegExp(`^type\\s+(${namePattern})(?:<([^\\n]*)>)?\\s+is\\s+([^:]+):\\s*$`)
const constructorPattern = new RegExp(`^  (${namePattern})\\{([^{}]*)\\}\\s*$`)
const parameterPattern = new RegExp(`^\\s*-(${namePattern})\\s*:\\s*(Data|Type)\\s*$`)
const fieldPattern = new RegExp(`^\\s*(${namePattern})\\s*:\\s*(.+?)\\s*$`)
const collectImport = (scope: BendScope, line: string): ExtractionReason | undefined => {
  if (scope.seenItem) return "parse"
  if (line.trim() === "import Base") {
    scope.base = true
    return undefined
  }
  const imported =
    /^import\s+((?:\.\/|(?:\.\.\/)+)(?:[A-Za-z_][A-Za-z0-9_-]*\/)*[A-Za-z_][A-Za-z0-9_-]*\.bend)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(
      line
    )
  if (imported === null) {
    scope.uncertainScope = true
    return undefined
  }
  if (scope.aliases.has(imported[2]!)) return "parse"
  scope.aliases.set(imported[2]!, imported[1]!)
  return undefined
}
const bindingCollision = (scope: BendScope, binding: string, kind: string): boolean =>
  (scope.bindings.has(binding) && (kind === "type" || scope.typeBindings.has(binding))) ||
  scope.aliases.has(binding.split(".")[0]!)
const collectBinding = (scope: BendScope, line: string, row: number): ExtractionReason | undefined => {
  const match = bindingPattern.exec(line)
  if (match === null) return "parse"
  scope.seenItem = true
  const binding = match[2]!
  if (bindingCollision(scope, binding, match[1]!)) return "declaration-merge"
  scope.bindings.add(binding)
  if (match[1] === "type") scope.typeBindings.add(binding)
  scope.starts.push(row)
  return undefined
}
const ignoredTopLevelLine = (line: string): boolean => line.trim() === "" || /^\s/.test(line)
const ambiguousBaseAliases = (scope: BendScope): boolean =>
  scope.base && [...scope.aliases.keys()].some((alias) => basePrefixes.has(alias))
const collectTopLevel = (scope: BendScope): ExtractionReason | undefined => {
  for (let row = 0; row < scope.clean.length; row++) {
    const line = scope.clean[row] ?? ""
    if (ignoredTopLevelLine(line)) continue
    const reason = line.startsWith("import ") ? collectImport(scope, line) : collectBinding(scope, line, row)
    if (reason !== undefined) return reason
  }
  // Base and aliased bindings may resolve the same written name; refuse closure.
  if (ambiguousBaseAliases(scope)) scope.uncertainScope = true
  return undefined
}
type BendType = {
  readonly scope: BendScope
  readonly name: string
  readonly parameters: Set<string>
  readonly references: Reference[]
  readonly localConstructors: Set<string>
}
const omitTypeReference = (type: BendType): void => {
  type.references.push({ kind: "unsupported", name: type.name })
}
const collectParameter = (type: BendType, field: string): void => {
  const parameter = parameterPattern.exec(field)
  if (parameter === null || type.parameters.has(parameter[1]!)) {
    omitTypeReference(type)
    return
  }
  type.parameters.add(parameter[1]!)
}
const collectParameters = (type: BendType, text: string | undefined): void => {
  if (text === undefined) return
  const fields = splitFields(text)
  if (fields === undefined || fields.length === 0) {
    omitTypeReference(type)
    return
  }
  for (const field of fields) collectParameter(type, field)
}
const collectImportedReference = (type: BendType, target: string, prefix: string): void => {
  const path = type.scope.aliases.get(prefix)
  if (!target.includes(".") || path === undefined) return
  if (type.scope.base && basePrefixes.has(prefix)) return
  type.scope.imports.set(target, { path, name: target.slice(prefix.length + 1) })
}
const assumedBaseLeaf = (scope: BendScope, target: string): boolean =>
  !scope.bindings.has(target) && !scope.aliases.has(target) && scope.base && baseLeaves.has(target)
const collectTypeName = (type: BendType, target: string): void => {
  const prefix = target.split(".")[0]!
  if (target.includes(".") && type.parameters.has(prefix)) {
    omitTypeReference(type)
    return
  }
  if (type.parameters.has(target) || kinds.has(target)) return
  collectImportedReference(type, target, prefix)
  if (assumedBaseLeaf(type.scope, target)) return
  type.references.push({ kind: "named", name: target })
}
const collectTypeNames = (type: BendType, names: ReadonlyArray<string> | undefined): void => {
  if (names === undefined) {
    omitTypeReference(type)
    return
  }
  for (const target of names) collectTypeName(type, target)
}
const collectConstructorField = (type: BendType, field: string, fieldNames: Set<string>): void => {
  const match = fieldPattern.exec(field)
  if (match === null || fieldNames.has(match[1]!)) {
    omitTypeReference(type)
    return
  }
  fieldNames.add(match[1]!)
  // A field binder may occur in later field types; it is not a datatype.
  const names = typeNames(match[2]!)
  if (names?.some((target) => fieldNames.has(target.split(".")[0]!))) omitTypeReference(type)
  collectTypeNames(type, names)
}
const constructorCollision = (type: BendType, name: string): boolean =>
  type.scope.aliases.has(name) || type.localConstructors.has(name) || type.scope.constructors.has(name)
const collectConstructor = (type: BendType, line: string): ExtractionReason | undefined => {
  const constructor = constructorPattern.exec(line)
  if (constructor === null) {
    omitTypeReference(type)
    return undefined
  }
  const name = constructor[1]!
  if (constructorCollision(type, name)) return "declaration-merge"
  type.localConstructors.add(name)
  type.scope.constructors.add(name)
  const fields = splitFields(constructor[2]!)
  if (fields === undefined) {
    omitTypeReference(type)
    return undefined
  }
  const names = new Set<string>()
  for (const field of fields) collectConstructorField(type, field, names)
  return undefined
}
const typeEndRow = (scope: BendScope, row: number): number => {
  const next = scope.starts.find((start) => start > row) ?? scope.lines.length
  let end = next - 1
  while (end > row && (scope.clean[end] ?? "").trim() === "") end--
  return end
}
const collectConstructors = (type: BendType, row: number, end: number): ExtractionReason | undefined => {
  for (let current = row + 1; current <= end; current++) {
    const line = type.scope.clean[current] ?? ""
    if (line.trim() === "") continue
    const reason = collectConstructor(type, line)
    if (reason !== undefined) return reason
  }
  return undefined
}
const collectTypeDeclaration = (
  scope: BendScope,
  row: number
): BendDeclaration | { readonly reason: ExtractionReason } => {
  const end = typeEndRow(scope, row)
  const header = headerPattern.exec(scope.clean[row] ?? "")
  if (header === null) return { reason: "parse" }
  const type: BendType = {
    scope,
    name: header[1]!,
    parameters: new Set(),
    references: [],
    localConstructors: new Set()
  }
  if (scope.uncertainScope) omitTypeReference(type)
  if (!/^(Data|Type)$/.test(header[3]!.trim())) omitTypeReference(type)
  collectParameters(type, header[2])
  const reason = collectConstructors(type, row, end)
  if (reason !== undefined) return { reason }
  return {
    name: type.name,
    source: scope.lines.slice(row, end + 1).join("\n"),
    startPosition: { row, column: 0 },
    endPosition: { row: end, column: (scope.lines[end] ?? "").length },
    references: [
      ...new Map(type.references.map((reference) => [`${reference.kind}:${reference.name}`, reference])).values()
    ]
  }
}
const collectTypeDeclarations = (scope: BendScope, starts: ReadonlyArray<number>, limit: number): BendExtraction => {
  if (starts.length === 0) return { reason: "no-declarations" }
  if (starts.length > limit) return { reason: "declaration-limit" }
  const declarations: BendDeclaration[] = []
  for (const row of starts) {
    const declaration = collectTypeDeclaration(scope, row)
    if ("reason" in declaration) return declaration
    declarations.push(declaration)
  }
  if (new Set(declarations.map((declaration) => declaration.name)).size !== declarations.length)
    return { reason: "declaration-merge" }
  return { declarations, imports: scope.imports }
}
export const extractBendDeclarations = (source: string, limit: number): BendExtraction => {
  const lines = source.split("\n")
  // Comments cannot introduce declarations; strings and multiline forms stay outside this profile.
  const clean = lines.map((line) => line.replace(/#.*$/, "").replace(/\r$/, ""))
  if (clean.some((line) => /["'`]/.test(line))) return { reason: "parse" }
  const scope: BendScope = {
    lines,
    clean,
    starts: [],
    aliases: new Map(),
    imports: new Map(),
    bindings: new Set(),
    typeBindings: new Set(),
    constructors: new Set(),
    base: false,
    uncertainScope: false,
    seenItem: false
  }
  const reason = collectTopLevel(scope)
  if (reason !== undefined) return { reason }
  const starts = scope.starts.filter((row) => /^type\s/.test(clean[row] ?? ""))
  return collectTypeDeclarations(scope, starts, limit)
}
