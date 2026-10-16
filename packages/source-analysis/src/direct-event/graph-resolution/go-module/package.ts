import core, { type PackageSpelling } from "../go-artifact-core.js"
import { goFileFacts } from "./parser-facts.ts"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { GoFile } from "../../languages/go.ts"
import type { GraphFacts, GraphReference } from "../../languages/contracts.ts"

// Unicode property observations are native facts. Package owns identifier
// grammar, inference, duplicate admission and all work charging.
export function packageSpellings(facts: readonly ReturnType<typeof goFileFacts>[]) {
  const texts = new Set<string>()
  const observe = (value: unknown): void => {
    if (typeof value === "string") texts.add(value)
    else if (Array.isArray(value)) value.forEach(observe)
    else if (value !== null && typeof value === "object") Object.values(value).forEach(observe)
  }
  facts.forEach(observe)
  return list(
    [...texts].map(
      (text): PackageSpelling => ({
        $: "go-module/Input.Spelling",
        text,
        characters: list(
          Array.from(text, (text) => ({
            $: "go-module/Input.Character",
            text,
            letter: /^\p{L}$/u.test(text),
            number: /^\p{N}$/u.test(text),
            uppercase: /^\p{Lu}$/u.test(text)
          }))
        )
      })
    )
  )
}
const run = (files: readonly GoFile[], work: number) => {
  const facts = files.map(goFileFacts)
  return core.package_facts(list(facts), work, packageSpellings(facts))
}

/** Source ExtractSource retains its existing Canonical lease and raw parser
 * projection. This synchronous admission introduces no checkpoints or IO. */
export const admitGoFile = (file: GoFile): boolean => run([file], 128).$ === "go-module/Package.PackageFacts"

export function projectGoFile(file: GoFile | undefined) {
  if (file === undefined || !admitGoFile(file)) return undefined
  return { declarations: new Map(file.types.map((type) => [type.artifact.name, type])), imports: new Map() }
}

/** Mechanical inspection of the same package result for capability consumers.
 * Artifact objects retain the identity supplied by the native parser. */
export function inspectGoPackage(files: readonly GoFile[], work = 128) {
  const result = run(files, work)
  if (result.$ === "go-module/Package.Refused") return undefined
  const artifacts = new Map(
    files.flatMap((file) => [...file.types, ...file.constants].map(({ artifact }) => [artifact.id, artifact]))
  )
  const declarations: Map<
    string,
    GraphFacts["declarations"] extends ReadonlyMap<string, infer Item> ? Item : never
  > = new Map()
  for (const { value, location } of unlist(result.declarations)) {
    const artifact = artifacts.get(value.artifact.id)
    if (artifact === undefined) throw new TypeError("GoPackage returned an unknown parser artifact")
    const references = unlist(value.references).map(
      (reference): GraphReference => ({
        kind: reference.kind.$ === "traversal/core.Unsupported" ? "unsupported" : "named",
        name: reference.name,
        ...(reference.kind.$ === "traversal/core.BoundNamed" ? { bindingName: reference.kind.binding } : {}),
        ...(reference.expected.$ === "traversal/core.AnyKind"
          ? {}
          : { expectedKind: reference.expected.$ === "traversal/core.TypeKind" ? "type" : "function" }),
        ...(reference.target.$ === "None" ? {} : { targetId: reference.target.value })
      })
    )
    declarations.set(value.key, {
      artifact,
      references,
      exported: value.exported,
      ...(location.$ === "None"
        ? {}
        : {
            location: {
              start: { line: location.value.start.line, column: location.value.start.column },
              end: { line: location.value.end.line, column: location.value.end.column }
            }
          })
    })
  }
  return {
    declarations,
    imports: new Map<string, { readonly path: string; readonly name: string }>(),
    discoveryWork: result.discovery_work,
    constantTypes: new Map(
      unlist(result.constant_types).map(({ name, values }) => [
        name,
        unlist(values).map((value) =>
          value.$ === "go-module/Package.LocalType"
            ? { name: value.name }
            : { name: value.name, sourcePath: value.source_path }
        )
      ])
    )
  }
}
