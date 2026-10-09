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
test("nested output unions retain category ownership without separate streams", () => {
  const requests = Schema.Struct({ category: Schema.Literal("request"), kind: Schema.Literal("prepare") })
  const events = Schema.Union([
    Schema.Struct({ category: Schema.Literal("event"), kind: Schema.Literal("findingRetained") }),
    Schema.Struct({ category: Schema.Literal("event"), kind: Schema.Literal("clearSettled") })
  ])
  const decisions = Schema.Struct({ category: Schema.Literal("decision"), kind: Schema.Literal("collectionFits") })
  assert.deepEqual(boundarySchemaRows(Schema.Union([Schema.suspend(() => requests), events, decisions])), [
    { kind: "clearSettled", category: "event", fields: [] },
    { kind: "collectionFits", category: "decision", fields: [] },
    { kind: "findingRetained", category: "event", fields: [] },
    { kind: "prepare", category: "request", fields: [] }
  ])
  assert.throws(
    () =>
      boundarySchemaRows(
        Schema.Union([requests, Schema.Struct({ category: Schema.Literal("event"), kind: Schema.Literal("prepare") })])
      ),
    /Duplicate boundary kind/
  )
  assert.throws(
    () =>
      boundarySchemaRows(
        Schema.Union([Schema.Struct({ category: Schema.Literal("unknown"), kind: Schema.Literal("first") }), requests])
      ),
    /recognized category/
  )
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
  const outputs = model.inventories.find((inventory) => inventory.name === "Canonical outputs")!
  assert.equal(outputs.rows.length, 217)
  assert.equal(outputs.rows.find((row) => row.kind === "prepare")?.category, "request")
  assert.equal(outputs.rows.find((row) => row.kind === "findingRetained")?.category, "event")
  assert.equal(outputs.rows.find((row) => row.kind === "collectionFits")?.category, "decision")
  assert.equal(outputs.rows.find((row) => row.kind === "sourceCacheDrop")?.category, "decision")
  assert.equal(outputs.rows.find((row) => row.kind === "sourceCacheRetain")?.category, "decision")
  assert.match(next, /Canonical outputs form one ordered stream/)
  assert.doesNotMatch(next, /### Canonical commands/)
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
