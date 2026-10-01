/** Bounded Bend 2 surface facts. Never executes or imports edited source. */
export type BendDeclaration = {
  readonly name: string;
  readonly source: string;
  readonly startPosition: { readonly row: number; readonly column: number };
  readonly endPosition: { readonly row: number; readonly column: number };
  readonly references: ReadonlyArray<{ readonly kind: "named" | "unsupported"; readonly name: string }>;
};
export type BendExtraction =
  | { readonly declarations: ReadonlyArray<BendDeclaration>; readonly imports: ReadonlyMap<string, { readonly path: string; readonly name: string }> }
  | { readonly reason: "parse" | "no-declarations" | "declaration-limit" | "declaration-merge" };

const namePattern = "[A-Za-z_][A-Za-z0-9_]*";
// These are leaf assumptions, not a vendored Base library or compiler check.
// Composite Base types remain named evidence and therefore unresolved.
const baseLeaves = new Set(["Empty", "Unit", "Bool", "Cmp", "Nat", "U32", "F32", "Char", "String"]);
// Namespace-prefix refusal assumptions from bend2/base.bend at compiler source
// 1adb0a61916b95de79d3541537462d0bf625f9d3. Names only: no library code is
// vendored. Review this bounded set when the declared Base profile changes.
const basePrefixes = new Set([
  "ALeaf", "ANode", "App", "Array", "Audio", "Bool", "Chan", "Char", "Chr", "Close", "Cmp", "Con",
  "Done", "EQ", "Either", "Emit", "Empty", "Equal", "Event", "Exists", "F32", "Fail", "False", "File",
  "GT", "Halt", "IO", "Image", "Inl", "Inr", "Key", "LT", "List", "Listener", "Look", "MLeaf",
  "MNode", "MTip", "Map", "Maybe", "Mouse", "Move", "Nat", "Nil", "None", "Or", "Pair", "Pix",
  "Process", "Qua", "Result", "SCon", "SNil", "Scroll", "Set", "Sigma", "Socket", "Some", "String",
  "Succ", "TCP", "True", "Tuple", "U32", "UDP", "Unit", "WCon", "WNil", "Window", "Word", "Zero",
]);
const kinds = new Set(["Data", "Type", "Quant"]);

/** Only names and nested datatype applications; no dependent terms or binders. */
const typeNames = (text: string): string[] | undefined => {
  const tokens = text.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|[<>(),]|\S/g) ?? [];
  let index = 0;
  const names: string[] = [];
  const term = (depth: number): boolean => {
    if (depth > 32) return false;
    const name = tokens[index++];
    if (name === undefined || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name)) return false;
    names.push(name);
    if (tokens[index] === "<") {
      index++;
      if (!term(depth + 1)) return false;
      while (tokens[index] === ",") { index++; if (!term(depth + 1)) return false; }
      if (tokens[index++] !== ">") return false;
    }
    return true;
  };
  return term(0) && index === tokens.length ? names : undefined;
};

const splitFields = (text: string): string[] | undefined => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "<") depth++;
    else if (character === ">") { if (--depth < 0) return undefined; }
    else if (character === "," && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  if (depth !== 0) return undefined;
  if (text.slice(start).trim() !== "") parts.push(text.slice(start));
  return parts;
};

export const extractBendDeclarations = (source: string, limit: number): BendExtraction => {
  const lines = source.split("\n");
  // Comments cannot introduce declarations. Strings and multiline surface forms
  // are deliberately outside this profile; rejecting them avoids false roots.
  const clean = lines.map((line) => line.replace(/#.*$/, "").replace(/\r$/, ""));
  if (clean.some((line) => /["'`]/.test(line))) return { reason: "parse" };
  const starts: number[] = [];
  let base = false;
  let uncertainScope = false;
  let seenItem = false;
  const aliases = new Map<string, string>();
  const imports = new Map<string, { path: string; name: string }>();
  const bindings = new Set<string>();
  const typeBindings = new Set<string>();
  for (let row = 0; row < clean.length; row++) {
    const line = clean[row] ?? "";
    if (line.trim() === "" || /^\s/.test(line)) continue;
    if (line.startsWith("import ")) {
      if (seenItem) return { reason: "parse" };
      if (line.trim() === "import Base") base = true;
      else {
        const imported = /^import\s+((?:\.\/|(?:\.\.\/)+)(?:[A-Za-z_][A-Za-z0-9_-]*\/)*[A-Za-z_][A-Za-z0-9_-]*\.bend)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(line);
        if (imported === null) uncertainScope = true;
        else if (aliases.has(imported[2]!)) return { reason: "parse" };
        else aliases.set(imported[2]!, imported[1]!);
      }
      continue;
    }
    const match = new RegExp(`^(?:@unsafe\\s+)?(type|def|law)\\s+(${namePattern}(?:\\.${namePattern})*)(?=[<(:?\\s]|$)`).exec(line);
    if (match === null) return { reason: "parse" };
    seenItem = true;
    const binding = match[2]!;
    if (bindings.has(binding) && (match[1] === "type" || typeBindings.has(binding))) return { reason: "declaration-merge" };
    if (aliases.has(binding.split(".")[0]!)) return { reason: "declaration-merge" };
    bindings.add(binding);
    if (match[1] === "type") typeBindings.add(binding);
    starts.push(row);
  }
  // Base and aliased module bindings can both resolve the same written name.
  // Refuse closure rather than assume the imported declaration wins.
  if (base && [...aliases.keys()].some((alias) => basePrefixes.has(alias))) uncertainScope = true;
  const typeStarts = starts.filter((row) => /^type\s/.test(clean[row] ?? ""));
  if (typeStarts.length === 0) return { reason: "no-declarations" };
  if (typeStarts.length > limit) return { reason: "declaration-limit" };
  const declarations: BendDeclaration[] = [];
  const constructors = new Set<string>();
  for (const row of typeStarts) {
    const next = starts.find((start) => start > row) ?? lines.length;
    let endRow = next - 1;
    while (endRow > row && (clean[endRow] ?? "").trim() === "") endRow--;
    const header = new RegExp(`^type\\s+(${namePattern})(?:<([^\\n]*)>)?\\s+is\\s+([^:]+):\\s*$`).exec(clean[row] ?? "");
    if (header === null) return { reason: "parse" };
    const name = header[1]!;
    const references: Array<{ kind: "named" | "unsupported"; name: string }> = [];
    const omitted = () => { references.push({ kind: "unsupported", name }); };
    if (uncertainScope) omitted();
    if (!/^(Data|Type)$/.test(header[3]!.trim())) omitted();
    const parameters = new Set<string>();
    if (header[2] !== undefined) {
      const fields = splitFields(header[2]);
      if (fields === undefined || fields.length === 0) omitted();
      else for (const field of fields) {
        const parameter = new RegExp(`^\\s*-(${namePattern})\\s*:\\s*(Data|Type)\\s*$`).exec(field);
        if (parameter === null || parameters.has(parameter[1]!)) omitted();
        else parameters.add(parameter[1]!);
      }
    }
    const addType = (text: string) => {
      const names = typeNames(text);
      if (names === undefined) { omitted(); return; }
      for (const target of names) {
        const prefix = target.split(".")[0]!;
        if (target.includes(".") && parameters.has(prefix)) { omitted(); continue; }
        if (parameters.has(target) || kinds.has(target)) continue;
        const importedPath = aliases.get(prefix);
        if (target.includes(".") && importedPath !== undefined && !(base && basePrefixes.has(prefix))) {
          imports.set(target, { path: importedPath, name: target.slice(prefix.length + 1) });
        }
        if (!bindings.has(target) && !aliases.has(target) && base && baseLeaves.has(target)) continue;
        references.push({ kind: "named", name: target });
      }
    };
    const localConstructors = new Set<string>();
    for (let current = row + 1; current <= endRow; current++) {
      const line = clean[current] ?? "";
      if (line.trim() === "") continue;
      const constructor = new RegExp(`^  (${namePattern})\\{([^{}]*)\\}\\s*$`).exec(line);
      if (constructor === null) { omitted(); continue; }
      const constructorName = constructor[1]!;
      if (aliases.has(constructorName) || localConstructors.has(constructorName) || constructors.has(constructorName)) return { reason: "declaration-merge" };
      localConstructors.add(constructorName);
      constructors.add(constructorName);
      const fields = splitFields(constructor[2]!);
      if (fields === undefined) { omitted(); continue; }
      const fieldNames = new Set<string>();
      for (const field of fields) {
        const match = new RegExp(`^\\s*(${namePattern})\\s*:\\s*(.+?)\\s*$`).exec(field);
        if (match === null || fieldNames.has(match[1]!)) { omitted(); continue; }
        fieldNames.add(match[1]!);
        // A field binder can occur in later field types: it is not a datatype.
        const names = typeNames(match[2]!);
        if (names?.some((target) => fieldNames.has(target.split(".")[0]!))) omitted();
        addType(match[2]!);
      }
    }
    declarations.push({ name, source: lines.slice(row, endRow + 1).join("\n"),
      startPosition: { row, column: 0 }, endPosition: { row: endRow, column: (lines[endRow] ?? "").length },
      references: [...new Map(references.map((reference) => [`${reference.kind}:${reference.name}`, reference])).values()] });
  }
  if (new Set(declarations.map((declaration) => declaration.name)).size !== declarations.length) return { reason: "declaration-merge" };
  return { declarations, imports };
};
