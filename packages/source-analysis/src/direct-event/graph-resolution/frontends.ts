import type { GraphFacts } from "../languages/contracts.ts"
import type { List, OrderedField } from "@hapsland/source-artifacts/direct-event/value/codec"
import { artifactValueTag, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { inspectTypeScript, inspectTypeScriptFunctions } from "../languages/typescript.ts"
import { inspectRust, inspectRustModules } from "../languages/rust.ts"
import { pythonAdapter } from "../languages/python.ts"
import { bendAdapter } from "../languages/bend/adapter.ts"
import { parse } from "smol-toml"
import { sourceFacts, tomlValue } from "./frontend-codec.ts"
import { projectPythonSyntax } from "./python-module/syntax-projection.ts"
type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }
export type Branch = { readonly $: "Types.TypeBranch" } | { readonly $: "Types.FunctionBranch" }
export type RustContext = {
  readonly $: "Types.RustContext"
  readonly crate_root: Maybe<boolean>
  readonly external_module: Maybe<boolean>
  readonly modules: Maybe<List<OrderedField<string>>>
}
export type FrontendContext =
  | { readonly $: "Types.TypeScriptContext"; readonly branch: Branch }
  | { readonly $: "Types.RustSourceContext"; readonly branch: Branch; readonly context: RustContext }
  | { readonly $: "Types.PythonSourceContext"; readonly branch: Branch }
  | { readonly $: "Types.BendSourceContext"; readonly branch: Branch }
const tag = (name: string) => artifactValueTag(name) ?? "Types." + name
const optional = <Value>(value: Maybe<Value>): Value | undefined => {
  if (value?.$ === "None") return undefined
  if (value?.$ === "Some") return value.value
  throw new Error("invalid optional context")
}
function branch(value: Branch) {
  if (value?.$ === tag("TypeBranch")) return "type"
  if (value?.$ === tag("FunctionBranch")) return "function"
  throw new Error("invalid branch context")
}
function rustContext(value: RustContext) {
  if (value?.$ !== tag("RustContext")) throw new Error("invalid Rust context")
  const result: {
    rustCrateRoot?: boolean
    rustExternalModule?: boolean
    rustCrateModules?: ReadonlyMap<string, string>
  } = {}
  for (const [field, target] of [
    ["crate_root", "rustCrateRoot"],
    ["external_module", "rustExternalModule"]
  ] as const) {
    const flag = optional(value[field])
    if (flag !== undefined) {
      if (typeof flag !== "boolean") throw new Error("invalid Rust flag")
      result[target] = flag
    }
  }
  const modules = optional(value.modules)
  if (modules !== undefined) {
    const entries = unlist(modules).map((field) => {
      if (field?.$ !== tag("OrderedField") || typeof field.key !== "string" || typeof field.value !== "string")
        throw new Error("invalid Rust module context")
      return [field.key, field.value] as const
    })
    if (new Set(entries.map((x) => x[0])).size !== entries.length) throw new Error("duplicate Rust module context")
    result.rustCrateModules = new Map(entries)
  }
  return result
}
// Named independent single-source application frontends. No file reads,
// candidate selection, graph budget or traversal is performed in this adapter.
export function inspectSourceFrontend(path: string, source: string, context: FrontendContext) {
  let facts: GraphFacts | undefined
  switch (context?.$) {
    case "Types.TypeScriptContext":
      facts =
        branch(context.branch) === "function"
          ? inspectTypeScriptFunctions(path, source)
          : inspectTypeScript(path, source)
      break
    case "Types.RustSourceContext":
      facts =
        branch(context.branch) === "function" ? undefined : inspectRust(path, source, rustContext(context.context))
      break
    case "Types.PythonSourceContext":
      facts = branch(context.branch) === "function" ? undefined : pythonAdapter.inspect(path, source)
      break
    case "Types.BendSourceContext":
      facts = branch(context.branch) === "function" ? undefined : bendAdapter.inspect(path, source)
      break
    default:
      throw new Error("invalid frontend context")
  }
  return facts === undefined ? undefined : sourceFacts(facts)
}
export function parseCargoSyntax(source: string) {
  let syntax
  try {
    syntax = parse(source)
  } catch {
    return undefined
  }
  return tomlValue(syntax)
}
export const inspectRustModuleSyntax = inspectRustModules

// Native-parser syntax projection only. No module-scope/binding/import policy.
export async function parsePythonSyntax(source: string) {
  const { Parser, Python } = await import("../languages/native-parser.ts")
  const parser = new Parser()
  // The pinned native Node binding exposes reset, not tree/parser delete. Native
  // objects stay call-local; the returned projection contains no engine handles.
  try {
    parser.setLanguage(Python)
    const tree = parser.parse(source)
    return projectPythonSyntax(tree.rootNode)
  } finally {
    parser.reset()
  }
}
