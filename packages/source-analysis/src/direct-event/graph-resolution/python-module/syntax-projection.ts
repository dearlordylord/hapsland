import type Parser from "tree-sitter"
import { list, type List } from "@hapsland/source-artifacts/direct-event/value/codec"

// Exact native node identity is projected to call-local stable row IDs.
// All data here is parser syntax; no binding, authority or import decision.
export type SyntaxField = { readonly $: "Types.SyntaxField"; readonly name: string; readonly child: number }
export type SyntaxRow = {
  readonly $: "Types.PythonSyntaxNode"
  readonly id: number
  readonly kind: string
  readonly text: string
  readonly start: number
  readonly end: number
  readonly children: List<number>
  readonly fields: List<SyntaxField>
}
export type PythonSyntax = {
  readonly $: "Types.PythonSyntax"
  readonly has_error: boolean
  readonly root: number
  readonly nodes: List<SyntaxRow>
}
export function projectPythonSyntax(rootNode: Parser.SyntaxNode): PythonSyntax {
  const rows: (SyntaxRow | null)[] = [],
    ids = new Map<number, number>(),
    fieldNames = [
      "name",
      "alias",
      "module_name",
      "left",
      "right",
      "definition",
      "condition",
      "consequence",
      "alternative",
      "function",
      "parameters",
      "body",
      "superclasses",
      "value",
      "type",
      "type_parameters",
      "argument",
      "arguments",
      "object",
      "attribute"
    ]
  function project(node: Parser.SyntaxNode): number {
    const known = ids.get(node.id)
    if (known !== undefined) return known
    const id = rows.length
    ids.set(node.id, id)
    rows.push(null)
    const children = node.namedChildren.map(project)
    const fields: SyntaxField[] = []
    for (const name of fieldNames) {
      const child = node.childForFieldName(name)
      if (child !== null) fields.push({ $: "Types.SyntaxField", name, child: project(child) })
    }
    rows[id] = {
      $: "Types.PythonSyntaxNode",
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
  const root = project(rootNode)
  return {
    $: "Types.PythonSyntax",
    has_error: rootNode.hasError,
    root,
    nodes: list(
      rows.map((row) => {
        if (row === null) throw new Error("unfinished syntax projection")
        return row
      })
    )
  }
}
