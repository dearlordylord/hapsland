import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import { resolveFunctionUnit } from "@hapsland/source-analysis/direct-event/function-resolver"

const identifier = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"), { minLength: 1, maxLength: 6 })
  .map((characters) => `h_${characters.join("")}`)

const localForm = fc.constantFrom(
  "parameter",
  "variable",
  "destructured-parameter",
  "destructured-variable",
  "catch",
  "for-of",
  "for-in",
  "nested-function",
  "nested-class",
  "assignment",
  "parenthesized-assignment",
  "object-assignment",
  "array-assignment",
  "compound-assignment",
  "prefix-update",
  "postfix-update"
)

const shadowOrWrite = (name: string, form: typeof localForm extends fc.Arbitrary<infer A> ? A : never): string => {
  switch (form) {
    case "parameter":
      return `function run(${name}: any) { ${name}() }`
    case "variable":
      return `function run(values: any) { const ${name} = values; ${name}() }`
    case "destructured-parameter":
      return `function run({ ${name} }: any) { ${name}() }`
    case "destructured-variable":
      return `function run(values: any) { const { ${name} } = values; ${name}() }`
    case "catch":
      return `function run(values: any) { try {} catch (${name}) { ${name}() } }`
    case "for-of":
      return `function run(values: any) { for (const ${name} of values) ${name}() }`
    case "for-in":
      return `function run(values: any) { for (${name} in values) ${name}() }`
    case "nested-function":
      return `function run(values: any) { { function ${name}() {} ${name}() } }`
    case "nested-class":
      return `function run(values: any) { { class ${name} {} ${name}() } }`
    case "assignment":
      return `function run(values: any) { ${name} = values; ${name}() }`
    case "parenthesized-assignment":
      return `function run(values: any) { (${name}) = values; ${name}() }`
    case "object-assignment":
      return `function run(values: any) { ({ ${name} } = values); ${name}() }`
    case "array-assignment":
      return `function run(values: any) { [${name}] = values; ${name}() }`
    case "compound-assignment":
      return `function run(values: any) { ${name} += values; ${name}() }`
    case "prefix-update":
      return `function run(values: any) { ++${name}; ${name}() }`
    case "postfix-update":
      return `function run(values: any) { ${name}--; ${name}() }`
  }
}

describe("function binding safety property", () => {
  it("rejects top-level destructuring that could shadow a named import", () => {
    fc.assert(
      fc.property(identifier, fc.constantFrom("object", "array"), (name, form) => {
        const pattern = form === "object" ? `{ ${name} }` : `[${name}]`
        const source = `import { ${name} } from './helper'; const ${pattern} = values; function run() { ${name}() }`
        expect(analyzeFunctionFile("a.ts", source)).toBeUndefined()
      }),
      { seed: 0x13894, numRuns: 64 }
    )
  })

  it("never treats a local shadow or write as a complete edge to a same-named top-level function", () => {
    fc.assert(
      fc.property(identifier, localForm, (name, form) => {
        const source = `function ${name}() {} ${shadowOrWrite(name, form)}`
        const file = analyzeFunctionFile("a.ts", source)
        expect(file).toBeDefined()
        if (file === undefined) return false
        const facts = resolveFunctionUnit(file, "run")
        expect(facts).toBeDefined()
        if (facts === undefined) return false
        const matching = facts.references.filter((edge) => edge.reference.name === name)
        expect(matching.every((edge) => edge.target.kind !== "local")).toBe(true)
        expect(
          facts.references.some((edge) => edge.target.kind === "unsupported" || edge.target.kind === "unresolved")
        ).toBe(true)
      }),
      { seed: 0x13893, numRuns: 128 }
    )
  })
})
