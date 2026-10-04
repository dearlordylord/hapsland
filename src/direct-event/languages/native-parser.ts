import { assertReviewEngineBoundary } from "../../runtime/review-engine-boundary.ts";
import { packageAssetPath } from "../../runtime/package-runtime.ts";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";
assertReviewEngineBoundary("native-parser");

const nativeRoot = packageAssetPath("native", "prebuilt", `${process.platform}-${process.arch}`);
const parserRuntime = resolve(nativeRoot, "tree-sitter");
const rustLanguage = resolve(nativeRoot, "tree-sitter-rust");
if (
  existsSync(
    resolve(rustLanguage, "build/Release/tree_sitter_rust_binding.node"),
  )
) {
  process.env.TREE_SITTER_RUST_PREBUILD = rustLanguage;
}
const parserLanguage = resolve(nativeRoot, "tree-sitter-typescript");
if (
  existsSync(
    resolve(parserRuntime, "build/Release/tree_sitter_runtime_binding.node"),
  ) &&
  existsSync(
    resolve(
      parserLanguage,
      "build/Release/tree_sitter_typescript_binding.node",
    ),
  )
) {
  process.env.TREE_SITTER_PREBUILD = parserRuntime;
  process.env.TREE_SITTER_TYPESCRIPT_PREBUILD = parserLanguage;
}
export const { default: Parser } = await import("tree-sitter");
export const { default: TypeScript } = await import("tree-sitter-typescript");
export const { default: Rust } = await import("tree-sitter-rust");

/** The pinned Node binding exposes indices and columns in UTF-16 code units. */
export type SyntaxNode = {
  readonly type: string;
  readonly startIndex: number;
  readonly endIndex: number;
  childForFieldName(name: string): SyntaxNode | null;
  readonly text: string;
  readonly namedChildren: ReadonlyArray<SyntaxNode>;
  readonly startPosition: { readonly row: number; readonly column: number };
  readonly endPosition: { readonly row: number; readonly column: number };
  readonly parent?: SyntaxNode | null;
  readonly hasError?: boolean;
};

export const typeScriptRoot = (path: string, source: string): SyntaxNode => {
  const parser = new Parser();
  parser.setLanguage(
    extname(path).toLowerCase() === ".tsx"
      ? TypeScript.tsx
      : TypeScript.typescript,
  );
  return (parser.parse(source) as unknown as { rootNode: SyntaxNode }).rootNode;
};

export const descendants = (node: SyntaxNode): ReadonlyArray<SyntaxNode> => {
  const result: Array<SyntaxNode> = [];
  const pending = [...node.namedChildren].reverse();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    result.push(current);
    for (let index = current.namedChildren.length - 1; index >= 0; index -= 1) {
      const child = current.namedChildren[index];
      if (child !== undefined) pending.push(child);
    }
  }
  return result;
};

/** Native bindings may return different JS wrappers for the same syntax node. */
export const sameSyntaxNode = (
  left: SyntaxNode | null | undefined,
  right: SyntaxNode | null | undefined,
): boolean =>
  left !== null &&
  left !== undefined &&
  right !== null &&
  right !== undefined &&
  left.type === right.type &&
  left.startIndex === right.startIndex &&
  left.endIndex === right.endIndex;
