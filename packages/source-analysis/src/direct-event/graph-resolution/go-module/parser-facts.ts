import type { GoFile } from "../../languages/go.ts"
import type { SyntaxNode } from "../../languages/native-parser.ts"
import { inspectGoFile } from "../../languages/go.ts"
import { list, type List } from "@hapsland/source-artifacts/direct-event/value/codec"
import { factDeclaration } from "../frontend-codec.ts"

type SyntaxField = { readonly $: "Types.SyntaxField"; readonly name: string; readonly child: number }
type SyntaxRow = {
  readonly $: "Types.GoSyntaxNode"
  readonly id: number
  readonly kind: string
  readonly text: string
  readonly start: number
  readonly end: number
  readonly children: List<number>
  readonly fields: List<SyntaxField>
}
const optional = <Value>(value: Value | undefined) =>
  value === undefined ? { $: "None" as const } : { $: "Some" as const, value }

// Preserve the existing single-file Hapsland extraction boundary. Package bindings, constant inference,
// work charging and module discovery are deliberately absent from this bridge.
export function goFileFacts(file: GoFile) {
  const rows: (SyntaxRow | null)[] = []
  const identities = new Map<string, number>()
  function project(node: SyntaxNode): number {
    // Native wrappers can differ for one node; this is the existing parser's
    // sameSyntaxNode identity, scoped to this captured file.
    const identity = JSON.stringify([node.type, node.startIndex, node.endIndex])
    const known = identities.get(identity)
    if (known !== undefined) return known
    const id = rows.length
    identities.set(identity, id)
    rows.push(null)
    const children = node.namedChildren.map(project)
    const fields: SyntaxField[] = []
    for (const name of ["operand", "operator", "left", "right", "function", "type", "arguments"]) {
      const child = node.childForFieldName(name)
      if (child !== null) fields.push({ $: "Types.SyntaxField", name, child: project(child) })
    }
    rows[id] = {
      $: "Types.GoSyntaxNode",
      id: Number(BigInt(id)),
      kind: node.type,
      text: node.text,
      start: node.startIndex,
      end: node.endIndex,
      children: list(children),
      fields: list(fields)
    }
    return id
  }
  const groups = file.constants.map((group) => ({
    $: "Types.GoConstantFacts" as const,
    artifact_name: group.artifact.name,
    names: list(group.names),
    members: list(
      group.members.map((member) => ({
        $: "Types.GoConstantMember" as const,
        name: member.name,
        type_name: optional(member.typeName),
        expression: optional(member.expression === undefined ? undefined : project(member.expression))
      }))
    )
  }))
  return {
    $: "Types.GoFileSyntax" as const,
    path: file.path,
    package_name: file.packageName,
    types: list(file.types.map((item) => factDeclaration(item.artifact.name, item))),
    type_locations: list(
      file.types.map((item) =>
        optional(
          item.location === undefined
            ? undefined
            : {
                $: "Types.GoSourceLocation" as const,
                start: { $: "Types.GoSourcePosition" as const, ...item.location.start },
                end: { $: "Types.GoSourcePosition" as const, ...item.location.end }
              }
        )
      )
    ),
    constants: list(
      file.constants.map((group) =>
        factDeclaration(group.artifact.name, {
          artifact: group.artifact,
          references: group.references,
          exported: false
        })
      )
    ),
    imports: list(
      file.imports.map((item) => ({ $: "Types.GoImport" as const, path: item.path, name: optional(item.name) }))
    ),
    aliases: list([...file.aliases].map(([name, target]) => ({ $: "Types.GoAlias" as const, name, target }))),
    groups: list(groups),
    bindings: list(file.bindings),
    imported_names: list([...file.importedNames]),
    uncertain_imports: file.uncertainImports,
    cgo: file.cgo,
    expressions: list(
      rows.map((row) => {
        if (row === null) throw new Error("unfinished Go syntax projection")
        return row
      })
    )
  }
}
export function parseGoFileFacts(path: string, source: string) {
  const file = inspectGoFile(path, source)
  return file === undefined ? undefined : goFileFacts(file)
}
