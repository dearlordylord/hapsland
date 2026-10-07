import traverseModule from "@babel/traverse"
import { parse } from "@babel/parser"
import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs"
import { isBuiltin } from "node:module"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { sourceTypeEvidence } from "./source-type-evidence.mjs"
import { loaderPolicy } from "./source-loader-policy.mjs"
import { readPackageGraph, resolveWorkspaceSource } from "./package-graph.mjs"

export const checkWorkspaceImports = (root) => {
  const graph = readPackageGraph(root)
  const typeEvidence = sourceTypeEvidence(root, graph)
  let files = 0,
    edges = 0
  const records = []
  const sourceDirectories = (node) => (node.compiler === "bend" ? ["dist", "abi"] : ["src"])
  const owner = (path) => {
    const canonical = realpathSync(path)
    return [...graph.packages.values()].find((node) =>
      sourceDirectories(node).some((directory) => canonical.startsWith(`${resolve(node.path, directory)}/`))
    )
  }
  const inspect = (node, path) => {
    files++
    const record = {
      file: relative(root, path).replaceAll("\\", "/"),
      owner: node.manifest.name,
      imports: [],
      nativeLibraries: []
    }
    records.push(record)
    const declaredPolicy = node.manifest.hapsland?.loaderPolicies?.[relative(node.path, path).replaceAll("\\", "/")]
    if (
      (declaredPolicy === "demo-session" &&
        (node.manifest.hapsland.domain !== "source-analysis" ||
          relative(node.path, path) !== "src/direct-event/demo-validation.ts")) ||
      (declaredPolicy === "inspection-native-lock" &&
        (node.manifest.hapsland.domain !== "inspection-records" ||
          relative(node.path, path) !== "src/inspection/native-lock.ts"))
    )
      throw new Error(`Loader policy has a different source owner: ${relative(root, path)}`)
    if (
      (declaredPolicy === "bend-system-ffi" &&
        (node.compiler !== "bend" ||
          node.manifest.name !== "@hapsland/agent-flow-bend" ||
          !["dist/canonical.generated.js", "dist/import-graph.generated.js"].includes(relative(node.path, path)))) ||
      (declaredPolicy === "machine-clock-ffi" &&
        (node.manifest.hapsland.domain !== "runtime-environment" ||
          relative(node.path, path) !== "src/runtime/machine-clock.ts"))
    )
      throw new Error(`Native loader policy has a different source owner: ${relative(root, path)}`)
    const policy = loaderPolicy(
      node.manifest.hapsland?.loaderPolicies?.[relative(node.path, path).replaceAll("\\", "/")]
    )
    const ast = parse(readFileSync(path, "utf8"), {
      sourceType: "module",
      plugins: [["typescript", { dts: path.endsWith(".d.ts") }], "importAttributes"],
      errorRecovery: false
    })
    const paths = new WeakMap()
    const traverse = traverseModule.default ?? traverseModule
    traverse(ast, {
      enter(path) {
        paths.set(path.node, path)
      }
    })
    const edge = (specifier, syntax) => {
      edges++
      if (specifier.startsWith(".")) {
        const destination = resolve(dirname(path), specifier)
        const resolved = [destination, ...(destination.endsWith(".js") ? [destination.slice(0, -3) + ".ts"] : [])].find(
          (candidate) => existsSync(candidate)
        )
        if (!resolved) throw new Error(`Unresolved relative import: ${relative(root, path)} -> ${specifier}`)
        if (owner(resolved) !== node)
          throw new Error(`Import escapes source owner: ${relative(root, path)} -> ${specifier}`)
        record.imports.push({ specifier, target: relative(root, resolved).replaceAll("\\", "/") })
        return
      }
      if (
        ["vm", "node:vm", "worker_threads", "node:worker_threads"].includes(specifier) ||
        (["module", "node:module"].includes(specifier) &&
          !(
            policy.loaderModule &&
            syntax?.type === "ImportDeclaration" &&
            syntax.specifiers.length === 1 &&
            syntax.specifiers[0].type === "ImportSpecifier" &&
            syntax.specifiers[0].imported.name === "createRequire" &&
            syntax.specifiers[0].local.name === "createRequire"
          ))
      )
        throw new Error(`Unsupported loader module: ${relative(root, path)}`)
      if (isBuiltin(specifier) || specifier.startsWith("bun:")) {
        record.imports.push({ specifier, builtin: true })
        return
      }
      const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]
      if (name !== node.manifest.name && !Object.hasOwn(node.manifest.dependencies ?? {}, name))
        throw new Error(`Undeclared dependency: ${relative(root, path)} -> ${specifier}`)
      const target = graph.packages.has(name) ? resolveWorkspaceSource(graph, specifier) : undefined
      record.imports.push({
        specifier,
        ...(target ? { target: relative(root, target).replaceAll("\\", "/") } : { external: name })
      })
    }
    const literalRecord = (value) =>
      ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(value?.type)
        ? literalRecord(value.expression)
        : value?.type === "ObjectExpression" &&
          value.properties.every(
            (property) =>
              property.type === "ObjectProperty" &&
              !property.computed &&
              (property.key.name ?? property.key.value) !== "__proto__" &&
              (property.value.type !== "ObjectExpression" || literalRecord(property.value))
          )
    const closedRecordRead = (position) => {
      const object = position.node.object
      if (object.type !== "Identifier") return false
      const binding = position.scope.getBinding(object.name)
      return (
        binding?.constant &&
        literalRecord(binding.path.node.init) &&
        binding.referencePaths.every((reference) => {
          let current = reference
          while (
            ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(current.parentPath?.node.type)
          )
            current = current.parentPath
          const parent = current.parentPath
          return (
            parent.isProgram() ||
            parent.isTSTypeQuery() ||
            (parent.isMemberExpression() && parent.node.object === current.node && callableUse(parent)) ||
            (parent.isCallExpression() &&
              parent.node.arguments[0] === reference.node &&
              parent.node.callee.type === "MemberExpression" &&
              parent.node.callee.object.name === "Object" &&
              ["keys", "values", "entries", "hasOwn"].includes(parent.node.callee.property.name) &&
              !parent.scope.getBinding("Object"))
          )
        })
      )
    }
    const callableUse = (position, seen = new Set()) => {
      if (!position || seen.has(position.node)) return false
      seen.add(position.node)
      const parent = position.parentPath
      if (!parent) return false
      if (
        ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "ParenthesizedExpression"].includes(
          parent.node.type
        )
      )
        return callableUse(parent, seen)
      if (
        ["CallExpression", "OptionalCallExpression", "NewExpression"].includes(parent.node.type) &&
        parent.node.callee === position.node
      )
        return true
      if (
        ["MemberExpression", "OptionalMemberExpression"].includes(parent.node.type) &&
        parent.node.object === position.node
      )
        return callableUse(parent, seen)
      if (parent.isVariableDeclarator() && parent.node.init === position.node) {
        if (parent.node.id.type !== "Identifier") return true
        const binding = parent.scope.getBinding(parent.node.id.name)
        return !binding?.constant || binding.referencePaths.some((reference) => callableUse(reference, seen))
      }
      return false
    }
    const visit = (value, ancestors = [], nativeReference = false) => {
      if (!value || typeof value !== "object") return
      if (Array.isArray(value)) {
        for (const child of value) visit(child, ancestors, nativeReference)
        return
      }
      const parent = ancestors.at(-1)
      const reject = (reason) => {
        throw new Error(`Unsupported ${reason}: ${relative(root, path)}:${value.loc?.start.line ?? "?"}`)
      }
      const nativeCall = policy.nativeRequire(value, paths)
      if (
        value.type === "CallExpression" &&
        ((value.callee?.type === "Identifier" && value.callee.name === "dlopen") ||
          (["MemberExpression", "OptionalMemberExpression"].includes(value.callee?.type) &&
            (value.callee.property?.name ?? value.callee.property?.value) === "dlopen"))
      ) {
        const libraries = policy.nativeLibraries(value.arguments[0])
        if (!libraries) reject("native library loader")
        record.nativeLibraries.push(...libraries)
      }
      if (
        value.type === "CallExpression" &&
        ["MemberExpression", "OptionalMemberExpression"].includes(value.callee?.type) &&
        value.callee.computed
      ) {
        const callee = paths.get(value).get("callee"),
          property = callee.get("property").evaluate()
        if (!property.confident) {
          const object = value.callee.object
          const binding = object.type === "Identifier" ? paths.get(value).scope.getBinding(object.name) : undefined
          let initializer = binding?.path.node.init
          while (["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(initializer?.type))
            initializer = initializer.expression
          const table =
            binding?.constant &&
            initializer?.type === "ObjectExpression" &&
            initializer.properties.every(
              (property) =>
                property.type === "ObjectProperty" &&
                !property.computed &&
                (property.key.name ?? property.key.value) !== "__proto__"
            ) &&
            binding.referencePaths.every((reference) => {
              const parent = reference.parentPath
              if (parent.isTSTypeQuery()) return true
              if (
                parent.isMemberExpression() &&
                parent.node.object === reference.node &&
                parent.parentPath.isCallExpression() &&
                parent.parentPath.node.callee === parent.node
              )
                return true
              return (
                parent.isCallExpression() &&
                parent.node.callee.type === "MemberExpression" &&
                !parent.node.callee.computed &&
                parent.node.callee.object.name === "Object" &&
                parent.node.callee.property.name === "hasOwn" &&
                !parent.scope.getBinding("Object") &&
                parent.node.arguments[0] === reference.node
              )
            })
          const keyBinding =
            value.callee.property.type === "Identifier"
              ? paths.get(value).scope.getBinding(value.callee.property.name)
              : undefined
          const library =
            binding?.constant &&
            initializer?.type === "MemberExpression" &&
            initializer.property?.name === "symbols" &&
            initializer.object?.type === "CallExpression" &&
            initializer.object.callee?.type === "MemberExpression" &&
            initializer.object.callee.property?.name === "dlopen" &&
            policy.nativeLibraries(initializer.object.arguments[0]) &&
            keyBinding?.constant &&
            policy.nativeSymbol(keyBinding.path.node.init)
          if (!table && !library) reject("computed callable loader")
        }
      }
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(value.type) && value.source)
        edge(value.source.value, value)
      if (value.type === "TSImportType") {
        if (value.argument?.type !== "StringLiteral" || value.options) reject("type loader")
        edge(value.argument.value, value)
      }
      if (value.type === "ImportExpression") {
        if (value.options) reject("import options")
        if (value.source?.type === "StringLiteral") edge(value.source.value, value)
        else if (!policy.computedImport(value.source, paths)) reject("computed loader")
      }
      if (
        value.type === "CallExpression" &&
        (value.callee?.type === "Import" || (value.callee?.type === "Identifier" && value.callee.name === "require"))
      ) {
        if (value.arguments.length !== 1 || value.typeArguments || value.typeParameters) reject("loader arguments")
        const argument = value.arguments[0]
        if (argument?.type === "StringLiteral") edge(argument.value, value)
        else if (value.callee.type !== "Import" || !policy.computedImport(argument, paths)) reject("computed loader")
      }
      if (value.type === "TSImportEqualsDeclaration") reject("import equals")
      if (value.type === "Identifier" && paths.get(value)?.isReferencedIdentifier()) {
        if (value.name === "require" && !(parent?.type === "CallExpression" && parent.callee === value))
          reject("loader reference")
        if (
          value.name === "createRequire" &&
          !nativeReference &&
          !(
            policy.loaderModule &&
            parent?.type === "ImportSpecifier" &&
            parent.imported.name === "createRequire" &&
            parent.local.name === "createRequire"
          )
        )
          reject("loader factory")
        if (["eval", "Function", "getBuiltinModule", "_load"].includes(value.name)) reject("dynamic code or loader")
        if (
          ["process", "global", "globalThis"].includes(value.name) &&
          !paths.get(value).scope.getBinding(value.name)
        ) {
          let object = value,
            position = ancestors.length - 1
          while (["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression"].includes(ancestors[position]?.type))
            object = ancestors[position--]
          const member = ancestors[position]
          if (!(["MemberExpression", "OptionalMemberExpression"].includes(member?.type) && member.object === object))
            reject("runtime global alias")
        }
      }
      const assertedReceiver = (object, scope, seen = new Set()) => {
        if (!object || typeof object !== "object") return false
        if (object.type === "TSAsExpression" || object.type === "TSTypeAssertion") {
          if (!(object.typeAnnotation?.type === "TSTypeReference" && object.typeAnnotation.typeName?.name === "const"))
            return true
          return assertedReceiver(object.expression, scope, seen)
        }
        if (object.type === "Identifier") {
          if (seen.has(object.name)) return false
          seen.add(object.name)
          const binding = scope.getBinding(object.name)
          return assertedReceiver(binding?.path.node.init, binding?.path.scope ?? scope, seen)
        }
        return Object.entries(object).some(
          ([key, child]) =>
            !["loc", "start", "end", "comments", "tokens"].includes(key) &&
            (Array.isArray(child)
              ? child.some((item) => assertedReceiver(item, scope, new Set(seen)))
              : assertedReceiver(child, scope, new Set(seen)))
        )
      }
      const callableObject = (object, scope, seen = new Set()) => {
        if (["ArrowFunctionExpression", "FunctionExpression"].includes(object?.type)) return true
        if (["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(object?.type))
          return callableObject(object.expression, scope, seen)
        if (object?.type === "ConditionalExpression")
          return (
            callableObject(object.consequent, scope, new Set(seen)) ||
            callableObject(object.alternate, scope, new Set(seen))
          )
        if (object?.type === "MemberExpression" && !object.computed) {
          let receiver = object.object
          if (receiver.type === "Identifier") receiver = scope.getBinding(receiver.name)?.path.node.init
          if (receiver?.type === "ObjectExpression") {
            const field = receiver.properties.find(
              (property) =>
                property.type === "ObjectProperty" &&
                !property.computed &&
                (property.key.name ?? property.key.value) === object.property.name
            )
            return callableObject(field?.value, scope, seen)
          }
        }
        if (
          object?.type === "CallExpression" &&
          object.callee?.type === "MemberExpression" &&
          object.callee.object.name === "Object" &&
          object.callee.property.name === "getPrototypeOf" &&
          !scope.getBinding("Object")
        )
          return callableObject(object.arguments[0], scope, seen)
        if (object?.type !== "Identifier" || seen.has(object.name)) return false
        seen.add(object.name)
        const binding = scope.getBinding(object.name)
        return (
          binding?.path.isFunctionDeclaration() ||
          callableObject(binding?.path.node.init, binding?.path.scope ?? scope, seen)
        )
      }
      if (["MemberExpression", "OptionalMemberExpression"].includes(value.type)) {
        const evaluated = value.computed ? paths.get(value).get("property").evaluate() : undefined
        if (
          value.computed &&
          !evaluated?.confident &&
          (callableObject(value.object, paths.get(value).scope) ||
            (!(parent?.type === "CallExpression" && parent.callee === value) &&
              callableUse(paths.get(value)) &&
              !closedRecordRead(paths.get(value)) &&
              (assertedReceiver(value.object, paths.get(value).scope) || !typeEvidence.nonCallableRead(path, value))))
        )
          reject("computed callable extraction")
        const property =
          value.computed && evaluated?.confident ? evaluated.value : (value.property?.name ?? value.property?.value)
        if (["require", "createRequire", "constructor", "getBuiltinModule", "_load"].includes(property))
          reject("member loader or constructor")
        if (value.computed && ["process", "global", "globalThis"].includes(value.object?.name))
          reject("computed runtime access")
        if (["module", "Module"].includes(value.object?.name) && !paths.get(value).scope.getBinding(value.object.name))
          reject("module loader access")
      }
      for (const [key, child] of Object.entries(value))
        if (!["loc", "start", "end", "comments", "tokens"].includes(key))
          visit(child, [...ancestors, value], nativeReference || nativeCall)
    }

    visit(ast)
  }
  const walk = (node, directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Source symlinks are unsupported: ${path}`)
      if (entry.isDirectory()) walk(node, path)
      else if (/\.(?:tsx|mts|cts|jsx|mjs|cjs)$/.test(entry.name)) throw new Error(`Unsupported source syntax: ${path}`)
      else if (entry.name.endsWith(".json")) {
        JSON.parse(readFileSync(path, "utf8"))
        records.push({
          file: relative(root, path).replaceAll("\\", "/"),
          owner: node.manifest.name,
          imports: [],
          nativeLibraries: []
        })
      } else if (/\.(?:ts|js)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) inspect(node, path)
    }
  }
  try {
    for (const node of graph.packages.values()) {
      for (const key of Object.keys(node.manifest.exports ?? {}))
        resolveWorkspaceSource(graph, node.manifest.name + (key === "." ? "" : key.slice(1)))
      for (const path of Object.keys(node.manifest.hapsland?.loaderPolicies ?? {}))
        if (!existsSync(resolve(node.path, path)))
          throw new Error(`Missing declared loader policy source: ${node.manifest.name}: ${path}`)
      for (const directory of sourceDirectories(node)) {
        const path = resolve(node.path, directory)
        if (!existsSync(path))
          throw new Error(`Missing compiler-owned source boundary: ${node.manifest.name}: ${directory}`)
        walk(node, path)
      }
    }
  } finally {
    typeEvidence.close()
  }
  return { packages: graph.packages.size, files, edges, records }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(
    (({ records: _records, ...summary }) => summary)(checkWorkspaceImports(resolve(import.meta.dirname, "..")))
  )
