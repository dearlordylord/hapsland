import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"
import * as Schema from "effect/Schema"
import {
  boundarySchemaRows,
  decisionBoundaryModel,
  decisionBoundaryDocument
} from "./generate-decision-boundary-ledger.mts"
const root = resolve(import.meta.dirname, "..")
const descriptions = JSON.parse(readFileSync(resolve(root, "scripts/decision-boundary-descriptions.json"), "utf8"))
const current = readFileSync(resolve(root, "docs/typescript-decision-boundary-ledger.md"), "utf8")
test("schema fields track requiredness and shared multi-kind branches", () => {
  const schema = Schema.Union([
    Schema.Struct({ kind: Schema.Literals(["second", "third"]), changed: Schema.optionalKey(Schema.String) }),
    Schema.Struct({ kind: Schema.Literal("first"), count: Schema.Number })
  ])
  assert.deepEqual(boundarySchemaRows(schema), [
    { kind: "first", fields: ["count"] },
    { kind: "second", fields: ["changed?"] },
    { kind: "third", fields: ["changed?"] }
  ])
})
test("current production schemas and exports produce the maintained ledger without changing reviewed prose", () => {
  const model = decisionBoundaryModel(root, descriptions)
  const next = decisionBoundaryDocument(current, model)
  assert.equal(next, current)
  assert.ok(
    model.inventories[0]!.rows.some(
      (row) =>
        row.kind === "ruleApplicabilityCheck" &&
        row.fields.includes("capabilitiesAvailable") &&
        row.fields.includes("sourceRung")
    )
  )
  const marker = "<!-- decision-boundary-facts:start -->"
  const changed = current.replace("## TS-006 —", "A retained owner explanation.\n\n## TS-006 —")
  assert.equal(decisionBoundaryDocument(changed, model).split(marker)[0], changed.split(marker)[0])
  assert.ok(
    model.compilers.find((node) => node.compiler === "bend")!.exports.every((entry) => entry.source.includes("/abi/"))
  )
})
test("unknown event selections, owner exports and stale decision references fail rather than invent facts", () => {
  const changed = structuredClone(descriptions)
  changed[0].events = ["inventedEvent"]
  assert.throws(() => decisionBoundaryModel(root, changed), /Unknown or duplicate boundary event/)
  changed[0].events = []
  changed[0].owners = ["@hapsland/native-observation/nonexistent"]
  assert.throws(() => decisionBoundaryModel(root, changed), /Unsupported or undeclared workspace export/)
  const model = decisionBoundaryModel(root, descriptions)
  assert.throws(
    () => decisionBoundaryDocument(current.replace("## TS-001 —", "## Removed —"), model),
    /Missing or duplicate reviewed ledger entry/
  )
  assert.throws(
    () => decisionBoundaryDocument(`${current}\n<!-- decision-boundary-facts:start -->`, model),
    /ordered marker pair/
  )
})
