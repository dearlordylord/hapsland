import { physicalNativeBindings, configureNativeBindings, sourceNativeParserRoot } from "./native-bindings.ts"
import { assertReviewEngineBoundary } from "@hapsland/runtime-environment/runtime/review-engine-boundary"
import { packageAssetPath, packageRoot, standalone } from "@hapsland/runtime-environment/runtime/package-runtime"
import { extname } from "node:path"
assertReviewEngineBoundary("native-parser")

const profile = `${process.platform}-${process.arch}`
const nativeRoot = standalone
  ? packageAssetPath("native", "prebuilt", profile)
  : sourceNativeParserRoot(packageRoot, profile)
if (!standalone && typeof Bun !== "undefined") Bun.plugin(physicalNativeBindings(JSON.stringify(nativeRoot), true))
configureNativeBindings(nativeRoot)
export const { default: Parser } = await import("tree-sitter")
export const { default: TypeScript } = await import("tree-sitter-typescript")
export const { default: Python } = await import("tree-sitter-python")
export const { default: Go } = await import("tree-sitter-go")
export const { default: Rust } = await import("tree-sitter-rust")

/** The pinned Node binding exposes indices and columns in UTF-16 code units. */
export type SyntaxNode = {
  readonly type: string
  readonly startIndex: number
  readonly endIndex: number
  childForFieldName(name: string): SyntaxNode | null
  readonly text: string
  readonly namedChildren: ReadonlyArray<SyntaxNode>
  readonly startPosition: { readonly row: number; readonly column: number }
  readonly endPosition: { readonly row: number; readonly column: number }
  readonly parent?: SyntaxNode | null
  readonly hasError?: boolean
}

export const typeScriptRoot = (path: string, source: string): SyntaxNode => {
  const parser = new Parser()
  parser.setLanguage(extname(path).toLowerCase() === ".tsx" ? TypeScript.tsx : TypeScript.typescript)
  return (parser.parse(source) as unknown as { rootNode: SyntaxNode }).rootNode
}

export const descendants = (node: SyntaxNode): ReadonlyArray<SyntaxNode> => {
  const result: Array<SyntaxNode> = []
  const pending = [...node.namedChildren].reverse()
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) continue
    result.push(current)
    for (let index = current.namedChildren.length - 1; index >= 0; index -= 1) {
      const child = current.namedChildren[index]
      if (child !== undefined) pending.push(child)
    }
  }
  return result
}

/** Native bindings may return different JS wrappers for the same syntax node. */
export const sameSyntaxNode = (left: SyntaxNode | null | undefined, right: SyntaxNode | null | undefined): boolean =>
  left !== null &&
  left !== undefined &&
  right !== null &&
  right !== undefined &&
  left.type === right.type &&
  left.startIndex === right.startIndex &&
  left.endIndex === right.endIndex
