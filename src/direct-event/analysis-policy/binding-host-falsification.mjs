import assert from "node:assert/strict"
import { readFileSync, writeFileSync, rmSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { pathToFileURL } from "node:url"
const root = resolve(import.meta.dirname, "../../..")
const baselineRoot =
  process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT ?? "/workspace/typescript/hapsland-bend-baseline-master-5726758e"
const sourcePath = resolve(baselineRoot, "packages/source-analysis/dist/direct-event/languages/typescript-functions.js")
const exposure = resolve(dirname(sourcePath), `.binding-probe-${process.pid}.mjs`)
const artifact =
  process.env.HAPSLAND_BINDING_ARTIFACT ?? resolve(root, "packages/agent-flow-bend/dist/binding-policy.generated.js")
let cases = 0,
  exceptionCases = 0
try {
  writeFileSync(
    exposure,
    readFileSync(sourcePath, "utf8") +
      "\nexport {inspectFunctionBinding,unsupportedAssignmentTarget,markUncertainBinding,uncertainScopeSyntax,mutationSyntax,bindingSyntax,uncertainAssignmentSyntax};\n"
  )
  const native = await import(pathToFileURL(exposure)),
    api = await import(pathToFileURL(artifact))
  const generatedTarget = api.bindUnsupportedAssignment(native.uncertainAssignmentSyntax)
  const generated = api.bindFunctionBinding(
    native.uncertainScopeSyntax,
    native.mutationSyntax,
    native.bindingSyntax,
    generatedTarget,
    native.markUncertainBinding
  )
  function execute(fn, bits, throwAt = Infinity) {
    const [uncertain, mutation, unsupported, binding, identifier] = bits,
      trace = []
    const touch = (name, value) => {
      trace.push(name)
      if (trace.length === throwAt) throw Error("injected")
      return value
    }
    native.uncertainScopeSyntax.has = () => touch("uncertain.has", uncertain)
    native.mutationSyntax.has = () => touch("mutation.has", mutation)
    native.bindingSyntax.has = () => touch("binding.has", binding)
    native.uncertainAssignmentSyntax.has = () => touch("pattern.has", unsupported)
    let firstReads = 0
    const target = {
      get type() {
        return touch("target.type", "other")
      },
      get text() {
        return touch("target.text", "target")
      }
    }
    const local = {
      get type() {
        return touch("local.type", identifier ? "identifier" : "other")
      },
      get text() {
        return touch("local.text", "local")
      }
    }
    const child = {
      get type() {
        return touch("child.type", "X")
      },
      get text() {
        return touch("child.text", "child")
      },
      get startIndex() {
        return touch("child.offset", 17)
      },
      get namedChildren() {
        touch("child.children")
        return [mutation && ++firstReads === 1 ? target : local]
      }
    }
    let flag = false
    const unsupportedBindings = []
    const scope = {
      get localBindings() {
        return touch("scope.locals", { add: (name) => touch("locals.add:" + name) })
      },
      set uncertainBinding(value) {
        touch("scope.uncertain=" + value)
        flag = value
      },
      get unsupportedBindings() {
        return touch("scope.unsupported", unsupportedBindings)
      }
    }
    const functions = { has: (name) => touch("bound.has:" + name, false) }
    let error
    try {
      fn(child, scope, functions)
    } catch (e) {
      error = e.message
    }
    return { trace, flag, unsupportedBindings, error }
  }
  for (let value = 0; value < 32; value++) {
    const bits = Array.from({ length: 5 }, (_, axis) => Boolean(value & (1 << axis)))
    const expected = execute(native.inspectFunctionBinding, bits),
      actual = execute(generated, bits)
    assert.deepEqual(actual, expected)
    cases++
    for (let at = 1; at <= expected.trace.length; at++) {
      assert.deepEqual(execute(generated, bits, at), execute(native.inspectFunctionBinding, bits, at))
      exceptionCases++
    }
  }
  // Assignment reads cover identifier lookup short circuit and fallback pattern test.
  for (let value = 0; value < 8; value++) {
    const [identifier, bound, pattern] = Array.from({ length: 3 }, (_, axis) => Boolean(value & (1 << axis)))
    const run = (fn) => {
      const trace = []
      native.uncertainAssignmentSyntax.has = (type) => {
        trace.push("pattern:" + type)
        return pattern
      }
      const target = {
        get type() {
          trace.push("type")
          return identifier ? "identifier" : "other"
        },
        get text() {
          trace.push("text")
          return "X"
        }
      }
      const result = fn(target, {
        has: (name) => {
          trace.push("bound:" + name)
          return bound
        }
      })
      return { trace, result }
    }
    assert.deepEqual(run(generatedTarget), run(native.unsupportedAssignmentTarget))
    cases++
  }
  for (const target of [undefined, null])
    assert.equal(generatedTarget(target, new Set()), native.unsupportedAssignmentTarget(target, new Set()))
  const record = {
    passed: true,
    cases,
    exceptionCases,
    scope:
      "actual compiled unchanged native helpers versus generated staged binder; all 32 conditional action cases and 8 assignment cases with exact read/effect traces; injected exceptions at every binding trace event; no real parser or universal host correctness claim"
  }
  writeFileSync(
    resolve(root, "evidence/bend-strangler/binding-host-falsification.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(exposure, { force: true })
}
