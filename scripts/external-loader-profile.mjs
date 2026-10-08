import { createHash } from "node:crypto"
import { parse } from "@babel/parser"
import traverseModule from "@babel/traverse"
const traverse = traverseModule.default ?? traverseModule
export const externalLoaderHash = (text) => createHash("sha256").update(text).digest("hex")
const shape = (node) =>
  JSON.stringify(node, (key, value) =>
    ["start", "end", "loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(key)
      ? undefined
      : value
  )
const expression = (text) => parse(text, { sourceType: "unambiguous" }).program.body[0].expression
export const standaloneNativeRootExpression =
  'require("node:path").resolve(require("node:path").dirname(process.execPath), "../../../native/prebuilt", process.platform + "-" + process.arch)'
export const pinnedExternalLoaderProfiles = Object.freeze({
  "tree-sitter": Object.freeze({
    originalSha256: "df00db57bc2069340e887d22efd7e279b52ee78219f6ea2526ca44786f5471e2",
    nativeBinding: "tree_sitter_runtime_binding.node",
    policy: "tree-sitter-native-and-node-class"
  }),
  "tree-sitter-typescript": Object.freeze({
    originalSha256: "b3bdc95667c309b13ffde9165aa27d3e1436ab957e99c7e5defa1eda699b0a1d",
    nativeBinding: "tree_sitter_typescript_binding.node",
    policy: "tree-sitter-native"
  }),
  "tree-sitter-rust": Object.freeze({
    originalSha256: "e0a42d089243cc2ea9539fdd3b154f620a644abca0cc4d800e8b97e63490d147",
    nativeBinding: "tree_sitter_rust_binding.node",
    policy: "tree-sitter-native"
  })
})
// Reviewed data-reflection sites in the exact Effect 4.0.0 byte profile.
// A modified file receives no exemption, including an appended loader.
const dataReflectionProfiles = {
  "Equivalence.js": "fdb6c2fbedb6eea2fc23de55291741082256e77f55a3a5e57fa0101adec8860e",
  "Formatter.js": "97bccfa38937c47642bb91078e8a734391691ca384711f400cc5d076e51cdb89",
  "Redactable.js": "6b6a14ee694d16a73a531f96ec21330be346a39442f45956256dea980b48297c",
  "Schema.js": "502b32d5804e1aba237fa6e50026d7a5d53d4e8ee53a40ab7f8c183755dc88d7",
  "SchemaAST.js": "dee43cadf36f56cc2b819a1b0f6a35c777e7eeabfb0b268ddf3cfb465a5e920a",
  "Struct.js": "eb6cac3d61bf089966e32238edf19a68b669f6206a19856f5633a4205f5f24fe",
  "internal/effect.js": "ccfdc5fbe93aebd043a9c40e6e055ef1c4d3de14707b7956df7d9f3b86358183",
  "internal/equal.js": "9647a0b07469083ac41575ac7cedefe27f4b4acc74ff594b8dd0f43eb5726513",
  "internal/record.js": "5f69f20dae4d32a2022c820c969702245ec760db16ec7fd1b301e5542f3e04c0"
}
// Exact pinned Effect indexed-dispatch expressions: callbacks, tagged cases and symbol protocols.
const indexedDispatchProfiles = {
  "Channel.js": {
    sha256: "32c0e011c9020849361faab0cbd036e3a06ce6e25dd9b7209f06dcc6b5a5fb36",
    members: [
      "72ab937ff581f103c1d7f62e1129eae3c90cc5b682aa96d3139487aaebc6a5ea",
      "db22f39c79a195beeedb70f041e70dacb51aefaee9e0b09472680b1f57f81c30",
      "7bf0e96a48f9be28e9b87678c8dd4b358410f6b1141a06eb9acae5fcbcda6aac"
    ]
  },
  "Chunk.js": {
    sha256: "3f55086f93d4008ace882e8f088e983e2efd82a9670e312499904f5234808a4c",
    members: [
      "d3d31ce38a4808e97a10370ead80ae1b53e4f68280704301843589b52b416efe",
      "eba27b9202dbaa13831953efed72aa7a4c82d3b08ac97a821e7a75a6df680c2e",
      "766fa223a33308c9354ce34def9b921e7e7d3388dbd1521bf160a69a5e10d09b"
    ]
  },
  "cli/Param.js": {
    sha256: "c749f759810dc7f53d0893ecf1e6b4167a8168cd94764d1be7c9a0d61789da29",
    members: ["bca04809f96263b8c27e78fb0702c323ed10d911158bfff3bb3fbc74ffcdcd5d"]
  },
  "cli/Prompt.js": {
    sha256: "f6dfe32fa9ce3226c301d79386bc533eb2f96d5a5d0a018509d08ac849519bd1",
    members: ["32ed0b0e0c734a43167eff7dd7c1c07127e069bb72acfaf29589c691b9eb9edd"]
  },
  "Data.js": {
    sha256: "9fd50d62d4e8d9e5873c41301acc3a79e9a83f63f4035bf13b7be03cb8f4d50e",
    members: ["f95666a5e3c9767648b69a438ec6f9c9c718d1de91fb77204260ff491998bdcd"]
  },
  "Deferred.js": {
    sha256: "84002bff8ce017020784d39d1b57991b3d8d80fad9461bdf53ad9c28da58254a",
    members: ["64e10fa76d8066674d7fe80d259fac80e87fbd533fbbf6fd1c6d8f4ed929e874"]
  },
  "Equal.js": {
    sha256: "1afff1fbec7b2f98e28579d52440956db0be6e1398f69c757e32443ab671ffa3",
    members: ["d880a5e6610d7cd65a1a5ce7f28d9160026481ce9ef2fc8a4f7d9c293eab3b2f"]
  },
  "Equivalence.js": {
    sha256: "fdb6c2fbedb6eea2fc23de55291741082256e77f55a3a5e57fa0101adec8860e",
    members: [
      "6e4efc7ee3342704dcfb9a9a7ef1a77c1354c169e95bb3c44734c90484c851e1",
      "0069da714ff7a061696e2b55206c8224840a4bb7bd00733cbca2d0e32a3fbda9"
    ]
  },
  "Hash.js": {
    sha256: "dc468c48ed3a28c7020c7eb3a13657d9db4f079f7a9207672efc81480e361215",
    members: ["d880a5e6610d7cd65a1a5ce7f28d9160026481ce9ef2fc8a4f7d9c293eab3b2f"]
  },
  "http/HttpClient.js": {
    sha256: "70b6d0b751e3889806388a4ac2af70a3042c5275f57cf0d089d6e9153993f0ce",
    members: [
      "fee959ba1c7d1ba139a387b8b75cc0d60ab06c6cc2c558e127375993f95f8928",
      "2609e8c04a4c07960888eba9390e7d5d4a428d001f1515ba282e9e61bb6b914e"
    ]
  },
  "http/HttpClientResponse.js": {
    sha256: "39500e2be3b41b9fc8bbe8bfba4282675308763145c42ec51548830be1eebd5c",
    members: ["7fed57b3e8e0b495a424aca6343d71bced2ae8ec6662cf4da13a9d9a960cb084"]
  },
  "http/HttpEffect.js": {
    sha256: "2b08077cf3241e4051836ce344d1290e8074d4139e25942467decc92857d43cc",
    members: ["f316628e7efedca4d3e76b5784dd77a5e158ffe75fb7aaa953e871ced99ac0ae"]
  },
  "http/HttpServerError.js": {
    sha256: "b60ae3ed3dfad4537f9c22899956ccd52ec3168cb1d5a8199ea53bbba04a5b8b",
    members: ["19b4c4c650202f3ce0c7452b6bb1ef5d05a5dbe9525cb1111d40b17373e1244b"]
  },
  "http/HttpServerRespondable.js": {
    sha256: "982b867291e1df6ab62e6ee911fcdd5757a936a970f91a2e9b19adcf56dbf6d6",
    members: [
      "d880a5e6610d7cd65a1a5ce7f28d9160026481ce9ef2fc8a4f7d9c293eab3b2f",
      "73988d6f4e91baead76eaf2b1714c8ca0f6c0bf53212b0e2676345e27d90a996"
    ]
  },
  "http/UrlParams.js": {
    sha256: "b12f3514919c49dafd4313fdaf6a451f191a27e756ea90da0aa9dbd5a46a31d1",
    members: ["65d1594312adfeb75f1b3905133f8bdaf30a2e600a8e29f2744754c88e1fa8d6"]
  },
  "internal/core.js": {
    sha256: "12721b291e5e9bde033a183e84ed5a9d3ac24af31d86d681526e7de3b844b80b",
    members: [
      "97a3dc5f8384ab2d16e052ffe9787ea54d14b125293963773a156684c0903f40",
      "c39ca848b34f1e1f519ec8ecad0f3c3739e1eaabc66c29278493c325d541d9da",
      "7ee1d0e70c8b19ca59d0aa3d29da841809d860acb8435cf1b3a9e7d93e29bb3c"
    ]
  },
  "internal/effect.js": {
    sha256: "ccfdc5fbe93aebd043a9c40e6e055ef1c4d3de14707b7956df7d9f3b86358183",
    members: [
      "7cc71a32a82d8ebaed01d3c1c245a88addb88a5b2115ba60ffb90640fefd2e82",
      "f46180be3f48c5c3a670c2a1bd6ee1d276bae1ad5a53201ca19bf4387f49253a",
      "97a3dc5f8384ab2d16e052ffe9787ea54d14b125293963773a156684c0903f40",
      "7d5a480841651a984bf9ba810064a6986ce57d473d82e7ee7e581964c1666440",
      "7ee1d0e70c8b19ca59d0aa3d29da841809d860acb8435cf1b3a9e7d93e29bb3c",
      "0b63dfc73bd5a354fbb1aafff27dcddb79f55f6a5cbabe041f16033c5ea9960b",
      "c4e7e8a2f11c080e4381e13c39fa09103752dd33786767775878acfb33f2c7ae",
      "9941cdd70a3d8f94b549dc080b09edfe73499b81f79c45cfe7cb0e63b3ee5159",
      "cf34b595e123521ceaa03313f75af39ae5d69f1e7eab0bb4c0d571536957139c",
      "7bf0e96a48f9be28e9b87678c8dd4b358410f6b1141a06eb9acae5fcbcda6aac",
      "5dffbf4048b01d1f3de5cf3178ea79a40bd906b972a097f922c98fc4070d22af",
      "bcdc465c82a33605e8131c18927d5bfb61404c9b2b879c506a9aec882c92300d",
      "519c5df9154a1f543569bd2097d6cd8ef0270d8f273442b8e5615af2f87dc856",
      "4b9ddba8c217d5d40c8c02776ba1ee7cf3bfb61749f2b633d9ad0176ed71439d",
      "72ab937ff581f103c1d7f62e1129eae3c90cc5b682aa96d3139487aaebc6a5ea",
      "7a97bff5be34f25dfad5de50c1b784fc19cf3af32fc0dfca3d1fc5ba1def5eac"
    ]
  },
  "internal/graph.js": {
    sha256: "53929319a3a5bc487bf225d6611f2ce4e950a1c3e140e603893a2f3713072e46",
    members: ["8854679a5379cda8b7e093f9c973a8641168d6c472ac17b35bf28aa667957271"]
  },
  "internal/hashMap.js": {
    sha256: "792c63f9cbaa5e079071711eef17f248ca73d867bd4dfa25df0ce767842dbf46",
    members: ["7d5a480841651a984bf9ba810064a6986ce57d473d82e7ee7e581964c1666440"]
  },
  "internal/schema/interpreter.js": {
    sha256: "5ce05e0bf13f695a9ac747179cd53e31560e2136c1b6c63065baf2c5c0f6b01a",
    members: [
      "ede8dfa858b6dc9bf312228f2ca5c656b530403099d199957afad5ba17de2e61",
      "351f709ec2e934ff2c8363da994fcf7de35d696b35b548a47945587061c9d106"
    ]
  },
  "internal/schema/toEquivalence.js": {
    sha256: "dc10f2b98efd9e4690f57fa909ffcdf646929c0f2e77a4683e7386e56b0a2a0f",
    members: [
      "6e4efc7ee3342704dcfb9a9a7ef1a77c1354c169e95bb3c44734c90484c851e1",
      "d95886abfe132984a87ed86dc97ba6933dd5814eec6ab0ac861a18f1a94f3021",
      "90d354844f69f5ce900c6e5920ca575601e4e9765ffe5c76234764effdc1d506",
      "2b926fcc05c65ede6ce9b60f5f2064f1afa93ff77a390783e62fb2ac7cfb763f"
    ]
  },
  "internal/schema/toFormatter.js": {
    sha256: "46bb1abdc1c7b826bc26e4698b1b21d7b9799111af275c7ad69f049b2023c9ab",
    members: [
      "6e4efc7ee3342704dcfb9a9a7ef1a77c1354c169e95bb3c44734c90484c851e1",
      "d95886abfe132984a87ed86dc97ba6933dd5814eec6ab0ac861a18f1a94f3021",
      "90d354844f69f5ce900c6e5920ca575601e4e9765ffe5c76234764effdc1d506",
      "2b926fcc05c65ede6ce9b60f5f2064f1afa93ff77a390783e62fb2ac7cfb763f"
    ]
  },
  "Iterable.js": {
    sha256: "bb9ea2e6381f7520566ddf529c40c08648a90e8d2b02a53f0e93baafbded5932",
    members: [
      "7d5a480841651a984bf9ba810064a6986ce57d473d82e7ee7e581964c1666440",
      "07f478f9ec04e6c91d725ec29b772add705d7f773f7003ff2ec7c506532ec7c2",
      "425d18bbfd8033db72794cd057636fe29ec01e94bc35517a037288e86e9a0791",
      "852d449a6e82e41d81793d96cb80cac56309492c0505aee0de2c3a70c2b594c7"
    ]
  },
  "Layer.js": {
    sha256: "674995871578d0b92a6354a172f96ebc12ce7d89f82d76f9678c6fca9a04cb14",
    members: ["ac05735e4a1b6306a4a3cf007a90cc00f773d6a102bc63870a8a639fa7080bc3"]
  },
  "MutableHashMap.js": {
    sha256: "6e17c59a8a6fb0e14964b01bd3904c4861784e87e6b9fa33e250e9421a31f604",
    members: ["f554b2366f713da23ec67d24488a516199a84d2d561c520f38b6613f032453d3"]
  },
  "Order.js": {
    sha256: "0e6c659a4739558b648be232b0c2287de704578cae6521c14931c6a341a7d427",
    members: [
      "6e4efc7ee3342704dcfb9a9a7ef1a77c1354c169e95bb3c44734c90484c851e1",
      "0069da714ff7a061696e2b55206c8224840a4bb7bd00733cbca2d0e32a3fbda9"
    ]
  },
  "Pipeable.js": {
    sha256: "4e391e01fd4be4e2e3c61af43be90e8c84c130fc0dce42c4350ac6069b3c6315",
    members: [
      "724fd47f1aede63658b470dc8af1071f1d5d7c1f6b7cabe7d008eab28c8a0fb3",
      "430573eae16c7d6fc9780bd85e1d8b8bf3f4a5689ff63e261597099a768cdaf7",
      "aa41d5da1b3a17706dee2975994e87743a5d9bb314fecbd999ef78b44fd33be9",
      "76be3e90435e73267d9a213d67c3c5b8978464bbda981791797747017cf507d6",
      "c6f995514b58c024903f357fdcf024fa0befcac69f1531cac15dc47e73d0017a",
      "f6195cfb29c2933f14bdfa497d6e09b2a5a3a2c640492d03467187112a25bcba",
      "d1f9f92b32c5daf4dc33d3c23eab61d9b3397a0ce6b27054ecf0360bdca811ed",
      "86374dba17272c53c5b1351308c1d78f7fc9e6c65d661fcf1dfb76df328034dc",
      "9c7b3bf7a32b8dee47e7fbf68c73388a6a58564e6b504f731ffa7f70a0864cec",
      "0de507046700f6705aeb79ea314adf6a43fdc7b305eb0fba8897a40156888395"
    ]
  },
  "Predicate.js": {
    sha256: "eab1a7c2b8413d9b9439e6c3c03ea2deedf45424b542d835f8a2134f977cc036",
    members: [
      "6e4efc7ee3342704dcfb9a9a7ef1a77c1354c169e95bb3c44734c90484c851e1",
      "0069da714ff7a061696e2b55206c8224840a4bb7bd00733cbca2d0e32a3fbda9"
    ]
  },
  "PubSub.js": {
    sha256: "e5dcdef7bfac650be041921cfb9137a6c8267f89dfd13addaefa44b5302c38b9",
    members: ["4b9ddba8c217d5d40c8c02776ba1ee7cf3bfb61749f2b633d9ad0176ed71439d"]
  },
  "Redactable.js": {
    sha256: "6b6a14ee694d16a73a531f96ec21330be346a39442f45956256dea980b48297c",
    members: ["872653da75f093001e7a9cc5399ee6d36ae16ba85ebd6ba6cb1ce3a384d525b8"]
  },
  "Scheduler.js": {
    sha256: "333100ff95ecfaee48439b9e58480028a4f19cbec783f60243a34c17a10f8e06",
    members: ["9427dd63e974d7b1a2494b3356ab2ff0af011c2c209673304831fac1cfce3626"]
  },
  "Stream.js": {
    sha256: "a7c354ddf381bf6815813ba239fcadbfa9267da2b6c8d55db5c72849264f8af5",
    members: [
      "cf34b595e123521ceaa03313f75af39ae5d69f1e7eab0bb4c0d571536957139c",
      "1c0ff4e40bfb3fd839f005b111f684e91e7798759327b0cead6e3e828ed0f5b9"
    ]
  },
  "Struct.js": {
    sha256: "eb6cac3d61bf089966e32238edf19a68b669f6206a19856f5633a4205f5f24fe",
    members: ["b6091f292893a4171d00336de23b01b691ed4d137efe29a03ee71c222c3263ce"]
  },
  "Tuple.js": {
    sha256: "cf2d3c4f16e1ee9208ea8c0e48c76679ca3c875cc4c3c798a87aa529b2cdd0a3",
    members: ["4e8e9306c3fc3c659c752740a99bdaa0ed77e13597a4690e0e24509f9d06c61a"]
  },
  "Utils.js": {
    sha256: "2162964fea44e1dd560e0fa640132d67c7f40202aaaa805085ca1cdad91718ea",
    members: ["1fd9f6bdd964c5f7bdf07219790872102be24a0d573731691298b3843cda13fe"]
  }
}
const dangerous = new Set(["eval", "Function", "require", "createRequire", "Worker", "SharedWorker", "importScripts"])
// Cache syntax only, never resolved targets, ownership or filesystem evidence.
// The full byte digest, filename and native approval identify every scan input.
// Bound this process-local cache; no ASTs or build receipts are retained.
const syntaxProfiles = new Map()
const syntaxProfileLimit = 512
function scanExternalLoader(text, file, approval, sha256) {
  const reject = (reason) => {
    throw new Error(`Unsupported external loader: ${file}: ${reason}`)
  }
  const ast = parse(text, { sourceType: "unambiguous", createImportExpressions: true })
  const edges = []
  const indexedDispatch = Object.entries(indexedDispatchProfiles).find(
    ([suffix, profile]) => file.endsWith(`/effect/dist/${suffix}`) && sha256 === profile.sha256
  )?.[1]
  const reflectionFile = Object.entries(dataReflectionProfiles).find(
    ([suffix, hash]) => file.endsWith(`/effect/dist/${suffix}`) && sha256 === hash
  )?.[0]
  const approvedNodes = new Set()
  let nativeUses = 0
  let codegenUses = 0
  if (approval) {
    if (!/^[a-f0-9]{64}$/.test(approval.originalSha256 ?? "") || approval.transformedSha256 !== sha256)
      reject("missing or stale pinned transformation evidence")
    if (!approval.file || approval.file !== file) reject("approval file mismatch")
    if (!["tree-sitter-native", "tree-sitter-native-and-node-class"].includes(approval.policy))
      reject("unknown approval policy")
    const pinned = pinnedExternalLoaderProfiles[approval.packageName]
    if (
      !pinned ||
      pinned.originalSha256 !== approval.originalSha256 ||
      pinned.nativeBinding !== approval.nativeBinding ||
      pinned.policy !== approval.policy
    )
      reject("unapproved external dependency identity")
    if (
      !approval.packageName ||
      !approval.nativeBinding ||
      !Array.isArray(approval.nativeTargets) ||
      approval.nativeTargets.length !== 1 ||
      typeof approval.nativeTargets[0] !== "string"
    )
      reject("missing finite native target evidence")
    const expected = shape(
      expression(
        `require(require("node:path").resolve(${standaloneNativeRootExpression}, ${JSON.stringify(approval.packageName)}, "build/Release", ${JSON.stringify(approval.nativeBinding)}))`
      )
    )
    const codegen = shape(
      expression(
        "new Function('SyntaxNode', `\n      return class ${camelCase(typeName, true)}Node extends SyntaxNode {}\n    `)(SyntaxNode)"
      )
    )
    traverse(ast, {
      CallExpression(path) {
        const value = shape(path.node)
        if (value !== expected && !(approval.policy === "tree-sitter-native-and-node-class" && value === codegen))
          return
        for (const name of value === expected
          ? ["require", "process"]
          : ["Function", "SyntaxNode", "camelCase", "typeName"]) {
          const binding = path.scope.getBinding(name)
          if (["require", "process", "Function"].includes(name) ? Boolean(binding) : !binding?.constant)
            reject(`unproven approved binding ${name}`)
        }
        path.traverse({
          enter(child) {
            approvedNodes.add(child.node)
          }
        })
        approvedNodes.add(path.node)
        if (value === expected) {
          nativeUses++
          edges.push({ kind: "native", specifier: approval.nativeTargets[0], start: path.node.start })
        } else codegenUses++
      }
    })
    if (nativeUses !== 1 || codegenUses !== (approval.policy === "tree-sitter-native-and-node-class" ? 1 : 0))
      reject("approved expression inventory mismatch")
  }
  const record = (node, kind) => {
    if (node?.type !== "StringLiteral") reject(`computed ${kind}`)
    edges.push({ kind, specifier: node.value, start: node.start })
  }
  traverse(ast, {
    enter(path) {
      const node = path.node
      if (approvedNodes.has(node)) return
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source) {
        if (node.attributes?.length || node.assertions?.length || node.phase) reject("import attributes")
        record(node.source, node.type)
      }
      if (node.type === "ImportExpression") record(node.source, "import")
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require") {
        if (path.scope.getBinding("require") || node.arguments.length !== 1) reject("shadowed or malformed require")
        record(node.arguments[0], "require")
      }
      if (path.isReferencedIdentifier() && dangerous.has(node.name)) {
        const binding = path.scope.getBinding(node.name)
        if (
          node.name === "Function" &&
          binding?.constant &&
          binding.path.isImportNamespaceSpecifier() &&
          binding.path.parent.source.value === "effect/Function" &&
          path.parentPath.isMemberExpression() &&
          !path.parent.computed &&
          ["flow", "pipe", "identity"].includes(path.parent.property.name)
        )
          return
        if (node.name === "require" && path.parentPath.isCallExpression() && path.parent.callee === node) return
        reject(`loader reference ${node.name}`)
      }
      if (["MemberExpression", "OptionalMemberExpression"].includes(node.type)) {
        if (
          node.computed &&
          (path.parentPath.isCallExpression() || path.parentPath.isNewExpression()) &&
          path.parent.callee === node &&
          node.property.type !== "StringLiteral" &&
          !indexedDispatch?.members.includes(externalLoaderHash(shape(node)))
        )
          reject("computed callable member")
        const key = node.computed ? node.property.value : node.property.name
        if (key === "constructor" && ["Formatter.js", "internal/equal.js"].includes(reflectionFile)) return
        if (
          key === "constructor" &&
          approval?.packageName === "tree-sitter" &&
          node.object.type === "ThisExpression" &&
          path.parentPath.isMemberExpression() &&
          path.parent.object === node &&
          !path.parent.computed &&
          path.parent.property.name === "name"
        )
          return
        if (node.object.type === "Identifier" && node.object.name === "module" && key === "load") reject("module.load")
        if (
          dangerous.has(key) ||
          ["constructor", "_load", "runInContext", "runInNewContext", "compileFunction"].includes(key)
        )
          reject(`reflective member ${key}`)
        if (
          node.computed &&
          ["internal/effect.js", "Redactable.js"].includes(reflectionFile) &&
          node.object.type === "Identifier" &&
          node.object.name === "globalThis"
        )
          return
        if (
          node.computed &&
          node.object.type === "Identifier" &&
          ["globalThis", "global", "window", "Reflect", "module"].includes(node.object.name)
        )
          reject("computed global or module member")
      }
      if (
        path.isReferencedIdentifier() &&
        node.name === "Reflect" &&
        reflectionFile &&
        !path.scope.getBinding("Reflect") &&
        path.parentPath.isMemberExpression() &&
        !path.parent.computed &&
        path.parent.property.name === "ownKeys" &&
        path.parentPath.parentPath.isCallExpression() &&
        path.parentPath.parent.callee === path.parent
      )
        return
      if (path.isReferencedIdentifier() && node.name === "Reflect") reject("Reflect loader indirection")
    }
  })
  return { sha256, edges, nativeUses, codegenUses }
}
/** Scan the actual transformed contribution and freshly resolve every loader edge. */
export function externalLoaderProfile(text, file, { resolveTarget, approval } = {}) {
  if (typeof resolveTarget !== "function")
    throw new Error(`Unsupported external loader: ${file}: missing target resolver`)
  const sha256 = externalLoaderHash(text)
  const key = JSON.stringify([file, sha256, approval ?? null])
  let syntax = syntaxProfiles.get(key)
  if (!syntax) {
    syntax = scanExternalLoader(text, file, approval, sha256)
    if (syntaxProfiles.size >= syntaxProfileLimit) syntaxProfiles.delete(syntaxProfiles.keys().next().value)
    syntaxProfiles.set(key, syntax)
  }
  const edges = syntax.edges.map((edge) => {
    const target = resolveTarget(edge.specifier, file, edge.kind)
    if (!target) throw new Error(`Unsupported external loader: ${file}: unresolved ${edge.specifier}`)
    return { ...edge, target }
  })
  return {
    approval: approval ? { ...approval, nativeTargets: [...approval.nativeTargets] } : null,
    file,
    sha256,
    edges: edges.sort((a, b) => a.start - b.start),
    nativeUses: syntax.nativeUses,
    codegenUses: syntax.codegenUses
  }
}
