import { API, TypeFlags, SignatureKind } from "typescript/unstable/sync"
import { getTokenAtPosition, SyntaxKind } from "typescript/unstable/ast"
import { existsSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { resolveWorkspaceTypeSource } from "./package-graph.mjs"

// Resolve TypeScript source APIs and Bend authored ABIs from their manifest owners.
// Bend runtime outputs remain independently inspected by the import checker.
export const sourceTypeEvidence = (root, graph) => {
  let api, snapshot
  const manifests = new Map(
    [...graph.packages.values()].map((owner) => {
      const manifest = structuredClone(owner.manifest)
      for (const [key, conditions] of Object.entries(manifest.exports)) {
        const source = resolveWorkspaceTypeSource(graph, manifest.name + (key === "." ? "" : key.slice(1)))
        conditions.types = "./" + source.slice(owner.path.length + 1)
      }
      return [realpathSync(resolve(owner.path, "package.json")), JSON.stringify(manifest)]
    })
  )
  const open = (file) => {
    api ??= new API({
      cwd: root,
      fs: {
        readFile: (path) => {
          if (!path.endsWith("/package.json") || !existsSync(path)) return undefined
          return manifests.get(realpathSync(path))
        }
      }
    })
    snapshot?.dispose()
    snapshot = api.updateSnapshot({ openFiles: [file] })
    return snapshot.getDefaultProjectForFile(file)
  }
  const primitive = TypeFlags.Primitive | TypeFlags.Never
  const safeType = (type, checker) => {
    if (
      !type ||
      type.flags & (TypeFlags.AnyOrUnknown | TypeFlags.TypeParameter | TypeFlags.IndexedAccess | TypeFlags.Conditional)
    )
      return false
    if (type.flags & TypeFlags.Union) return type.getTypes().every((child) => safeType(child, checker))
    return (
      !!(type.flags & primitive) ||
      (!!(type.flags & (TypeFlags.Object | TypeFlags.Intersection)) &&
        checker.getSignaturesOfType(type, SignatureKind.Call).length === 0 &&
        checker.getSignaturesOfType(type, SignatureKind.Construct).length === 0)
    )
  }
  return {
    nonCallableRead: (file, expression) => {
      const project = open(file)
      const source = project?.program.getSourceFile(file)
      if (!source) return false
      let node = getTokenAtPosition(source, expression.start)
      while (node && !(node.kind === SyntaxKind.ElementAccessExpression && node.end === expression.end))
        node = node.parent
      return !!node && safeType(project.checker.getTypeAtLocation(node), project.checker)
    },
    close: () => {
      snapshot?.dispose()
      api?.close()
    }
  }
}
