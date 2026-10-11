// Experimental production-style entry. Core arithmetic and all decisions stay Bend-owned.
export function withDirectEntry(source) {
  for (const marker of [
    "function $plan$(",
    "function run_loop(",
    '"CompletePlan"',
    '"Own.DBranch"',
    "if (n > 281474976710655)"
  ])
    if (!source.includes(marker)) throw new TypeError("unrecognized Bend local-graph runtime layout")
  return (
    source +
    "\nconst graphEntrySchemas=" +
    JSON.stringify(graphEntrySchemas) +
    ";\n" +
    validator.toString() +
    "\n" +
    directPlan.toString() +
    "\nexport { directPlan };\n"
  )
}

const records = {
  Facts: {
    Facts: {
      kind_aware: "Bool",
      declarations: "Dict:MaybeDecl",
      imports: "Dict:MaybeImport",
      supporting: "Dict:MaybeDecl"
    }
  },
  Label: { Label: { key: "Key", type_key: "Key", function_key: "Key" } },
  Expected: { AnyKind: {}, TypeKind: {}, FunctionKind: {} },
  Kind: { Named: {}, Unsupported: {} },
  MaybeDecl: { None: {}, Some: { value: "Declaration" } },
  MaybeImport: { None: {}, Some: { value: "ImportBinding" } },
  MaybeKey: { None: {}, Some: { value: "Key" } },
  Declaration: {
    Declaration: { handle: "Nat", identity: "Key", function: "Bool", bundled: "Bool", references: "Refs" }
  },
  ImportBinding: { ImportBinding: { path: "Key", name: "Key", type_only: "Bool", composite: "Key" } },
  Reference: { Reference: { kind: "Kind", name: "Label", expected: "Expected", target: "MaybeKey" } },
  Refs: { Nil: {}, Con: { head: "Reference", tail: "Refs" } },
  Limits: { LocalLimits: { work: "Nat", depth: "Nat", targets: "Nat" } },
  Budget: {
    Budget: {
      limits: "Limits",
      targets_by_path: "Dict:Dict:Bool",
      max_targets: "Nat",
      work: "Nat",
      graph_work: "Nat",
      max_depth: "Nat"
    }
  }
}
for (const type of ["Dict:MaybeDecl", "Dict:MaybeImport", "Dict:Bool", "Dict:Dict:Bool"])
  records[type] = {
    "Own.DNil": {},
    "Own.DLeaf": { key: "Key", value: type.slice(5) },
    "Own.DBranch": { divisor: "Key", zero: type, one: type, count: "Nat" }
  }

const graphEntrySchemas = Object.fromEntries(
  Object.entries(records).map(([type, constructors]) => [
    type,
    Object.fromEntries(Object.entries(constructors).map(([tag, fields]) => [tag, Object.entries(fields)]))
  ])
)

function validator(args) {
  if (args.length !== 7) throw new TypeError("planner requires seven arguments")
  const stack = []
  const types = ["Facts", "Key", "Label", "Expected", "Dict:Bool", "Budget", "Nat"]
  for (let i = 0; i < types.length; i++) stack.push(args[i], types[i])
  while (stack.length) {
    const type = stack.pop(),
      value = stack.pop()
    if (type === "Nat" || type === "Key") {
      if (!Number.isSafeInteger(value) || value < 0 || value > (type === "Key" ? 0xffffffff : 281474976710655))
        throw new TypeError("invalid planner " + type)
      continue
    }
    if (type === "Bool") {
      if (typeof value !== "boolean") throw new TypeError("invalid planner Bool")
      continue
    }
    if (value === null || typeof value !== "object") throw new TypeError("invalid planner record")
    const constructors = graphEntrySchemas[type]
    if (
      !Object.hasOwn(value, "$") ||
      typeof value.$ !== "string" ||
      !constructors ||
      !Object.hasOwn(constructors, value.$)
    )
      throw new TypeError("invalid planner constructor " + type)
    const fields = constructors[value.$]
    if (fields === undefined || Object.keys(value).length !== fields.length + 1)
      throw new TypeError("invalid planner constructor " + type)
    for (const [field, fieldType] of fields) {
      if (!Object.hasOwn(value, field)) throw new TypeError("missing planner field " + field)
      stack.push(value[field], fieldType)
    }
  }
}

function directPlan(...args) {
  validator(args)
  return run_loop($plan$(...args))
}
