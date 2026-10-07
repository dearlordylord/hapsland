import { parse } from "@babel/parser"
const expression = (source) =>
  parse(source, { sourceType: "module", plugins: ["typescript"] }).program.body[0].expression
const shape = (value) =>
  JSON.stringify(value, (key, child) =>
    ["start", "end", "loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(key)
      ? undefined
      : child
  )
const demo = shape(expression('pathToFileURL(join(root, "session.ts")).href'))
const native = shape(
  expression(
    'createRequire(packageAssetPath("package.json"))(packageAssetPath("native", "prebuilt", `${process.platform}-${process.arch}`, "inspection-lock.node"))'
  )
)
const approvedBindings = (node, paths, imports, demoRoot = false) => {
  let valid = true
  const visit = (value) => {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const path = paths.get(value)
    if (value.type === "Identifier" && path?.isReferencedIdentifier()) {
      const binding = path.scope.getBinding(value.name)
      if (Object.hasOwn(imports, value.name)) {
        const [source, imported] = imports[value.name]
        valid &&=
          binding?.constant === true &&
          binding.path.isImportSpecifier() &&
          binding.path.node.imported.name === imported &&
          binding.path.parentPath.isImportDeclaration() &&
          binding.path.parentPath.node.source.value === source
      } else if (value.name === "process") valid &&= !binding
      else if (demoRoot && value.name === "root") {
        const owner = binding?.path.parentPath
        valid &&=
          binding?.constant === true &&
          binding.kind === "param" &&
          owner?.isArrowFunctionExpression() &&
          owner.node.params.length === 1 &&
          owner.node.params[0] === binding.path.node &&
          owner.parentPath.isVariableDeclarator() &&
          owner.parentPath.node.id.name === "validateDemoSession"
      }
    }
    for (const [key, child] of Object.entries(value))
      if (!["loc", "start", "end", "comments", "tokens"].includes(key)) visit(child)
  }
  visit(node)
  return valid
}
export const loaderPolicy = (policy) => {
  if (
    policy !== undefined &&
    !["demo-session", "inspection-native-lock", "bend-system-ffi", "machine-clock-ffi"].includes(policy)
  )
    throw new Error(`Unknown source loader policy: ${policy}`)
  const libraries =
    policy === "bend-system-ffi"
      ? ["libSystem.dylib", "libc.so.6"]
      : policy === "machine-clock-ffi"
        ? ["/usr/lib/libSystem.B.dylib", "libc.so.6"]
        : []
  const literals = (node) =>
    node?.type === "StringLiteral"
      ? [node.value]
      : node?.type === "ConditionalExpression"
        ? [...literals(node.consequent), ...literals(node.alternate)]
        : [undefined]
  return {
    nativeLibraries: (node) => {
      const values = literals(node)
      return values.every((value) => libraries.includes(value)) ? [...new Set(values)] : undefined
    },
    nativeSymbol: (node) =>
      policy === "bend-system-ffi" && literals(node).every((value) => ["__error", "__errno_location"].includes(value)),
    computedImport: (node, paths) =>
      policy === "demo-session" &&
      shape(node) === demo &&
      approvedBindings(
        node,
        paths,
        { join: ["node:path", "join"], pathToFileURL: ["node:url", "pathToFileURL"] },
        true
      ),
    nativeRequire: (node, paths) =>
      policy === "inspection-native-lock" &&
      shape(node) === native &&
      approvedBindings(node, paths, {
        createRequire: ["node:module", "createRequire"],
        packageAssetPath: ["@hapsland/runtime-environment/runtime/package-runtime", "packageAssetPath"]
      }),
    loaderModule: policy === "inspection-native-lock"
  }
}
