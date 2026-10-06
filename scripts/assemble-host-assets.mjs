import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
const pi = resolve(root, "dist/pi")
const runtime = resolve(root, "dist/runtime")
const rules = resolve(root, "dist/rules/defaults")
for (const path of [pi, runtime, rules]) mkdirSync(path, { recursive: true })
const source = readFileSync(resolve(root, "packages/pi-extension/dist/pi/extension.js"), "utf8")
const specifier = '"@hapsland/runtime-environment/runtime/hook-catalog"'
if (!source.includes(specifier)) throw new Error("Pi emitted hook catalog contribution is missing")
writeFileSync(resolve(pi, "extension.js"), source.replace(specifier, '"../runtime/hook-catalog.js"'))
copyFileSync(
  resolve(root, "packages/runtime-environment/dist/runtime/hook-catalog.js"),
  resolve(runtime, "hook-catalog.js")
)
for (const name of [
  "meaningless_combinations",
  "split_correlations",
  "absence_confusion",
  "bare_domain_value",
  "name_wider_than_type",
  "name_claims_resource",
  "body_reaches_undeclared"
])
  copyFileSync(
    resolve(root, `packages/review-definition/src/rules/defaults/${name}.json`),
    resolve(rules, `${name}.json`)
  )
