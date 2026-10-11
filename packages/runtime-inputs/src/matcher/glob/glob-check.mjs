import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { matchesGlob, matchesAnyGlob, validateGlobPattern } from "@hapsland/runtime-inputs/matcher/glob"

const unlist = (value) => {
  const result = []
  while (value.$ === "Con") {
    result.push(value.head)
    value = value.tail
  }
  assert.equal(value.$, "Nil")
  return result
}
const string = (units) => {
  const values = unlist(units)
  let result = ""
  for (let index = 0; index < values.length; index += 1024)
    result += String.fromCharCode(...values.slice(index, index + 1024))
  return result
}
const patterns = [
  "",
  ".",
  "./",
  "././a",
  "*",
  "**",
  "**/*",
  "**/.*",
  "**/.*/x",
  "a/**/b",
  "a/**",
  "a//b",
  "a\\b",
  "?",
  "[ab]",
  "[!ab]",
  "[^ab]",
  "[]",
  "[!]",
  "[[]",
  "[z-a]",
  "[--!]",
  "[-a]",
  "[a-]",
  "a]",
  "[a",
  "[a/b]",
  "[a/b",
  "{a,b}",
  "{,a}",
  "{a}",
  "{a,b}{c,d}",
  "{a,{b,c}}",
  "a}",
  "{a,b",
  "[{a,b}]",
  "[{a,{b,c}}]",
  "[{a,b}{c,d}]",
  "[{}]",
  "*.{ts,rs,py,bend,go}",
  "foo+bar",
  "(foo)",
  "a|b",
  "a$b",
  "a\nb",
  "**\n",
  "!a",
  "!\0",
  "a\0",
  "/a",
  "C:/a",
  "c:\\a",
  "../a",
  "a/../b",
  "😀?",
  "[😀-😃]",
  "[\ud800-\udfff]",
  "[\udfff-\ud800]",
  "\ud800*",
  "a".repeat(1024),
  "a".repeat(1025),
  "./" + "a".repeat(1024),
  "😀".repeat(512),
  "😀".repeat(513),
  "{a,b}".repeat(8),
  "{a,b}".repeat(9),
  "{a,b,c,d,e,f,g,h}",
  "{a,b,c,d,e,f,g,h,i}",
  "{a,b,c,d}".repeat(5)
]
const paths = [
  "",
  ".",
  "./",
  "a",
  "b",
  "a/b",
  "a//b",
  "a\\b",
  "a/x/b",
  "a/.x/b",
  ".a",
  ".x/x",
  "x/.y/x",
  "x/y/x",
  "x.ts",
  "x.go",
  "/a",
  "C:/a",
  "../a",
  "a/../b",
  "a\0",
  "a\n",
  "a\nb",
  "😀x",
  "😀",
  "\ud800x",
  "a".repeat(1024)
]
// Deterministic grammar fragments include malformed combinations, rather than
// filtering inputs through the native validator before comparing the core.
let seed = 41827
const pick = (size) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed % size
}
const fragments = ["a", "b", "*", "?", "**", "/", ".", "[", "]", "{", "}", ",", "!", "-", "😀", "\ud800", "\n", "\\"]
for (let index = 0; index < 400; index++) {
  let pattern = ""
  for (let count = pick(12); count > 0; count--) pattern += fragments[pick(fragments.length)]
  patterns.push(pattern)
}
const temporary = mkdtempSync(join(tmpdir(), "hapsland-glob-"))
try {
  const output = join(temporary, "glob.mjs")
  execFileSync("timeout", ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Glob.bend"), "-o", output], {
    timeout: 6000
  })
  const core = (await import(pathToFileURL(output))).default
  let cases = 0
  let engineValidations = 0
  const prepare = (pattern, path) => {
    let step = core.start(pattern, path)
    for (let requests = 0; requests < 100000; requests++) {
      const kind = step.$.split(".").at(-1)
      if (kind === "Refused") return { error: step.reason, matched: false }
      if (kind === "Completed") return { canonical: string(step.canonical), matched: step.matched }
      if (kind === "CompileExpression") {
        engineValidations++
        let valid = true
        try {
          new RegExp(string(step.expression))
        } catch {
          valid = false
        }
        step = core.compile_returned(valid, step.state)
      } else {
        assert.equal(kind, "TestExpression")
        let valid = true
        let matched = false
        try {
          matched = new RegExp(string(step.expression)).test(string(step.candidate))
        } catch {
          valid = false
        }
        step = core.match_returned(valid, matched, step.state)
      }
    }
    throw new Error("glob engine protocol did not settle")
  }

  for (const pattern of patterns) {
    let canonical
    let error
    try {
      canonical = validateGlobPattern(pattern)
    } catch (cause) {
      error = cause.message
    }
    for (const path of paths) {
      const actual = prepare(pattern, path)
      assert.equal(actual.error, error, JSON.stringify({ pattern, path, stage: "validation" }))
      assert.equal(actual.canonical, canonical, JSON.stringify({ pattern, path, stage: "normalization" }))
      assert.equal(actual.matched, matchesGlob(pattern, path), JSON.stringify({ pattern, path, stage: "matching" }))
      cases++
    }
  }
  const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const any = (patterns, path) => {
    let step = core.any_start(list(patterns), path)
    for (let requests = 0; requests < 100000; requests++) {
      const kind = step.$.split(".").at(-1)
      if (kind === "AnyCompleted") return step.matched
      if (kind === "AnyContinue") {
        step = core.any_advance(step.pending, step.path)
      } else if (kind === "AnyCompile") {
        engineValidations++
        let valid = true
        try {
          new RegExp(string(step.expression))
        } catch {
          valid = false
        }
        step = core.any_compile_returned(valid, step.state, step.pending, step.path)
      } else {
        assert.equal(kind, "AnyTest")
        let valid = true
        let matched = false
        try {
          matched = new RegExp(string(step.expression)).test(string(step.candidate))
        } catch {
          valid = false
        }
        step = core.any_match_returned(valid, matched, step.state, step.pending, step.path)
      }
    }
    throw new Error("ordered any-glob protocol did not settle")
  }
  for (const path of paths)
    for (const group of [[], ["**", "["], ["[", "*.ts"], ["**/.*", "*.go"]]) {
      assert.equal(any(group, path), matchesAnyGlob(group, path))
      cases++
    }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      engineValidations,
      scope:
        "Actual compiled whole glob dialect compared with native validation/matching, mechanical no-flags RegExp engine; not universal proof or whole-finalization production adoption"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
