import traverseModule from "@babel/traverse"
import { createHash } from "node:crypto"
import { npmToolingRequire } from "./npm-tooling.mjs"
import { parse } from "@babel/parser"
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { isBuiltin } from "node:module"
import { dirname, extname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph, resolveDevelopmentWorkspaceSource } from "./package-graph.mjs"

const inside = (root, path) => {
  const local = relative(root, path)
  return local !== ".." && !local.startsWith("../") && !local.startsWith("..\\")
}
const packageName = (specifier) =>
  specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]
const viteBrowserProfileSha256 = "744cb14c1fc62a816d2d5bcd34bd0d9aa095d1adb050fe5ca612ea6f6b9f9481"
const npmLoaderProfileSha256 = "9e94276e613a799daef430e79855777559908ad1d63dc48b2759517ee6a4125f"
const extensions = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs", ".cts"])

/** Development owners use declared dependencies and exact exported source APIs. */
export const checkDevelopmentImports = (root) => {
  const graph = readPackageGraph(root)
  const records = [],
    ambiguities = [],
    errors = []
  const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
  const resources = new Map()
  for (const owner of graph.auxiliaryWorkspaces.values()) {
    const inventory = new Map()
    for (const resource of owner.manifest.hapsland?.developmentResources ?? []) {
      if (
        !resource ||
        typeof resource.path !== "string" ||
        !(resource.authority === "root-conformance"
          ? /^conformance\/[a-zA-Z0-9_-]+\.json$/.test(resource.path)
          : resource.authority === "root-package-metadata" && resource.path === "package.json") ||
        inventory.has(resource.path)
      )
        throw new Error(`Invalid development resource: ${owner.manifest.name}`)
      const path = resolve(root, resource.path)
      if (!existsSync(path) || !statSync(path).isFile() || realpathSync(path) !== path)
        throw new Error(`Missing or escaped development resource: ${resource.path}`)
      JSON.parse(readFileSync(path, "utf8"))
      inventory.set(resource.path, { ...resource, sha256: hash(path) })
    }
    resources.set(owner.manifest.name, inventory)
  }
  let npmRequire
  const npmEvidence = (specifier) => {
    npmRequire ??= npmToolingRequire()
    const target = realpathSync(npmRequire.resolve(specifier))
    return { specifier, tool: "npm", target, sha256: hash(target), profileSha256: npmLoaderProfileSha256 }
  }
  const owners = [...graph.workspaces.values()]
  const ownerOf = (path) => owners.find((node) => inside(node.path, path))
  const declared = (node, name) =>
    name === node.manifest.name ||
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((field) =>
      Object.hasOwn(node.manifest[field] ?? {}, name)
    )
  const inspect = (owner, path) => {
    const record = { file: relative(root, path).replaceAll("\\", "/"), owner: owner.manifest.name, imports: [] }
    records.push(record)
    let ast
    try {
      ast = parse(readFileSync(path, "utf8"), {
        sourceType: "unambiguous",
        plugins: [
          ["typescript", { dts: /\.d\.[cm]?ts$/.test(path) }],
          "importAttributes",
          ...(path.endsWith(".tsx") ? ["jsx"] : [])
        ]
      })
    } catch (error) {
      throw new Error(`Cannot parse development source ${record.file}: ${error.message}`, { cause: error })
    }
    const lexical = new WeakMap()
    const traverse = traverseModule.default ?? traverseModule
    traverse(ast, {
      enter(path) {
        lexical.set(path.node, path)
      }
    })
    const npmLoader = (call) => {
      if (call?.callee?.type !== "Identifier" || call.callee.name !== "require") return false
      if (
        !existsSync(resolve(root, "scripts/npm-tooling.mjs")) ||
        hash(resolve(root, "scripts/npm-tooling.mjs")) !== npmLoaderProfileSha256
      )
        return false
      const binding = lexical.get(call)?.scope.getBinding("require")
      const initializer = binding?.path.node.init
      if (initializer?.type !== "CallExpression" || initializer.callee?.type !== "Identifier") return false
      if (initializer.callee.name === "npmToolingRequire") {
        const factory = binding.path.scope.getBinding("npmToolingRequire")
        if (record.file === "scripts/npm-tooling.mjs") return factory?.path.isFunctionDeclaration()
        return (
          factory?.path.isImportSpecifier() &&
          factory.path.node.imported.name === "npmToolingRequire" &&
          factory.path.parent.source.value === "./npm-tooling.mjs"
        )
      }
      if (record.file !== "scripts/npm-tooling.mjs" || initializer.callee.name !== "createRequire") return false
      const factory = binding.path.scope.getBinding("createRequire")
      const args = initializer.arguments
      const checked = binding.path.findParent(
        (path) => path.isVariableDeclarator() && path.node.id.name === "checkedRequire"
      )
      return (
        factory?.path.isImportSpecifier() &&
        factory.path.parent.source.value === "node:module" &&
        args.length === 1 &&
        args[0].type === "CallExpression" &&
        args[0].callee.name === "realpathSync" &&
        args[0].arguments.length === 1 &&
        args[0].arguments[0].name === "entrypoint" &&
        checked !== null &&
        /if \(require\("\.\.\/package\.json"\)\.name !== "npm"\) throw new Error\("Selected entrypoint does not belong to npm"\)/.test(
          readFileSync(path, "utf8")
        )
      )
    }
    const edge = (specifier, syntax) => {
      if (
        specifier === "/src/simulation/controller.ts" &&
        owner.role === "verification" &&
        declared(owner, "vite") &&
        record.file === "packages/agent-flow-viz/scripts/check-render-browser.mjs" &&
        hash(path) === viteBrowserProfileSha256 &&
        lexical
          .get(syntax)
          ?.findParent(
            (candidate) =>
              candidate.isCallExpression() &&
              candidate.node.callee.type === "MemberExpression" &&
              candidate.node.callee.property.name === "evaluate"
          )
      ) {
        const target = resolve(owner.path, "src/simulation/controller.ts")
        if (
          !existsSync(target) ||
          !statSync(target).isFile() ||
          !inside(realpathSync(owner.path), realpathSync(target))
        )
          throw new Error(`Missing or escaped Vite browser module: ${record.file}`)
        record.imports.push({
          specifier,
          target: relative(root, target).replaceAll("\\", "/"),
          sha256: hash(target),
          profile: "vite-browser-root",
          profileSha256: viteBrowserProfileSha256
        })
        return
      }
      if (npmLoader(syntax)) {
        if (!["../package.json", "@npmcli/arborist", "npm-packlist", "tar"].includes(specifier))
          throw new Error(`Unsupported npm-owned dependency: ${record.file} -> ${specifier}`)
        record.imports.push(npmEvidence(specifier))
        return
      }

      if (isBuiltin(specifier) || specifier === "bun" || specifier.startsWith("bun:")) {
        record.imports.push({ specifier, builtin: true })
        return
      }
      if (specifier.startsWith(".")) {
        if (specifier.endsWith("?url")) {
          const asset = resolve(dirname(path), specifier.slice(0, -4))
          if (
            owner.role !== "verification" ||
            !declared(owner, "vite") ||
            !/\.(svg|png|jpg|webp)$/.test(asset) ||
            !existsSync(asset) ||
            !statSync(asset).isFile() ||
            !inside(realpathSync(owner.path), realpathSync(asset))
          )
            throw new Error(`Unsupported development asset: ${record.file} -> ${specifier}`)
          record.imports.push({
            specifier,
            asset: relative(root, asset).replaceAll("\\", "/"),
            sha256: hash(asset),
            profile: "vite-url"
          })
          return
        }

        const candidate = resolve(dirname(path), specifier)
        const choices = [
          candidate,
          ...[".ts", ".tsx", ".mts", ".mjs", ".js", ".json"].map((extension) => candidate + extension),
          resolve(candidate, "index.ts"),
          ...(candidate.endsWith(".js") ? [candidate.slice(0, -3) + ".ts"] : [])
        ]
        const destination = choices.find((choice) => existsSync(choice) && statSync(choice).isFile())
        if (!destination) throw new Error(`Unresolved development import: ${record.file} -> ${specifier}`)
        const target = realpathSync(destination),
          targetOwner = ownerOf(target)
        const resource = resources.get(owner.manifest.name).get(relative(root, target).replaceAll("\\", "/"))
        if (resource) {
          record.imports.push({ specifier, resource })
          return
        }
        if (!targetOwner) throw new Error(`Development import has no workspace owner: ${record.file} -> ${specifier}`)
        if (targetOwner !== owner) {
          if (!declared(owner, targetOwner.manifest.name))
            throw new Error(`Undeclared development dependency: ${record.file} -> ${specifier}`)
          const exported = Object.keys(targetOwner.manifest.exports ?? {}).some((key) => {
            const publicSpecifier = targetOwner.manifest.name + (key === "." ? "" : key.slice(1))
            return realpathSync(resolveDevelopmentWorkspaceSource(graph, publicSpecifier)) === target
          })
          if (!exported)
            throw new Error(
              `Cross-owner development import must target a declared workspace export: ${record.file} -> ${specifier}`
            )
        }
        record.imports.push({ specifier, target: relative(root, target).replaceAll("\\", "/") })
        return
      }
      const name = packageName(specifier)
      if (!declared(owner, name)) throw new Error(`Undeclared development dependency: ${record.file} -> ${specifier}`)
      const target = resolveDevelopmentWorkspaceSource(graph, specifier)
      record.imports.push({
        specifier,
        ...(target ? { target: relative(root, target).replaceAll("\\", "/") } : { external: name })
      })
    }
    const checkedEdge = (specifier, syntax) => {
      try {
        edge(specifier, syntax)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
    const pending = [ast]
    while (pending.length) {
      const node = pending.pop()
      if (!node || typeof node !== "object") continue
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source)
        checkedEdge(node.source.value)
      if (node.type === "TSImportType" && node.argument?.type === "StringLiteral") checkedEdge(node.argument.value)
      if (node.type === "TSExternalModuleReference" && node.expression?.type === "StringLiteral")
        checkedEdge(node.expression.value)
      if (node.type === "ImportExpression") {
        if (node.source?.type === "StringLiteral") checkedEdge(node.source.value)
        else ambiguities.push({ file: record.file, kind: "computed-import", start: node.start })
      }
      if (
        node.type === "CallExpression" &&
        (node.callee?.type === "Import" || (node.callee?.type === "Identifier" && node.callee.name === "require"))
      ) {
        if (node.arguments?.[0]?.type === "StringLiteral") checkedEdge(node.arguments[0].value, node)
        else ambiguities.push({ file: record.file, kind: "computed-loader", start: node.start })
      }
      for (const [key, value] of Object.entries(node)) {
        if (["loc", "start", "end", "comments", "tokens"].includes(key)) continue
        if (Array.isArray(value)) pending.push(...value)
        else if (value && typeof value === "object") pending.push(value)
      }
    }
  }
  const visit = (owner, directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".test-runs"].includes(entry.name)) continue
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(owner, path)
      else if (extensions.has(extname(path))) {
        if (!inside(realpathSync(owner.path), realpathSync(path)))
          throw new Error(`Development source escapes owner: ${relative(root, path)}`)
        inspect(owner, path)
      }
    }
  }
  for (const owner of graph.auxiliaryWorkspaces.values()) visit(owner, owner.path)
  if (errors.length) throw new Error(`Invalid development imports:\n${errors.join("\n")}`)
  return {
    files: records.length,
    edges: records.reduce((sum, record) => sum + record.imports.length, 0),
    records,
    ambiguities
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDevelopmentImports(resolve(import.meta.dirname, ".."))
  console.log(JSON.stringify({ files: result.files, edges: result.edges, ambiguities: result.ambiguities }, null, 2))
}
