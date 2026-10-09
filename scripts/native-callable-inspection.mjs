import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { revealInspection } from "./test-harness/inspection-browser-controls.mjs"

const source =
  [
    'import { Effect } from "effect";',
    'import { helper, type Item } from "./support";',
    "function legacy(value: string): string;",
    "function legacy(value: number): number;",
    "function legacy(value: unknown) { return value }",
    "export const run = (item: Item): Item => helper({ value: item.value + 1 });",
    'export const wrapped = Effect.fn("wrapped")(function* (value: number) { return value + 1 });',
    "export const untraced = Effect.fnUntraced(function* (value: number) { return value + 1 });"
  ].join("\n") + "\n"

const requestFacts = (snapshot, name) => {
  const prepared = snapshot.records.find(
    (record) => record.fact.kind === "unit-prepared" && record.fact.declaration === name
  )
  assert.ok(prepared, `Missing prepared callable: ${name}`)
  assert.equal(prepared.fact.completeness, "complete", `Callable dependencies must be complete: ${name}`)
  const evaluationId = prepared.correlation.evaluationId
  const facts = snapshot.records.filter((record) => record.correlation.evaluationId === evaluationId)
  assert.ok(evaluationId, "Prepared unit must identify its evaluation")
  assert.ok(
    facts.some((record) => record.fact.kind === "model-input"),
    "Preparation must be followed by model invocation"
  )
  assert.ok(
    facts.some((record) => record.fact.kind === "evaluation-outcome" && record.fact.outcome === "clear"),
    "Invocation must have an observed clear outcome"
  )
  return { name, completeness: prepared.fact.completeness, receiptId: prepared.correlation.receiptId, evaluationId }
}

const assertOmissions = (snapshot) => {
  for (const [name, reason] of [
    ["legacy", "function-overload"],
    ["mutable", "unsupported-callable"]
  ]) {
    assert.ok(
      snapshot.records.some(
        (record) =>
          record.fact.kind === "preparation-omission" &&
          record.fact.declaration === name &&
          record.fact.reason === reason
      ),
      `Missing observed exclusion: ${name}`
    )
    assert.ok(
      !snapshot.records.some((record) => record.fact.kind === "unit-prepared" && record.fact.declaration === name),
      "Excluded callable must not prepare a review"
    )
  }
}

export const callableInspectionProfile = {
  scenario: "callable-review",
  prepareResident: true,
  seed(repo) {
    writeFileSync(
      join(repo, "support.ts"),
      "export interface Item { value: number }\nexport const helper = (item: Item): Item => item;\n"
    )
    writeFileSync(join(repo, "callables.ts"), source)
    writeFileSync(join(repo, "unsupported.ts"), "export let mutable = (value: number) => value + 1;\n")
  },
  prompts: [
    "Use apply_patch to change run in callables.ts to increment its input value by 2 instead of 1. Preserve its existing export and API form. Leave the other functions, support.ts and README.md unchanged.",
    "Use apply_patch to change wrapped in callables.ts to increment its input value by 2 instead of 1. Preserve its existing export and API form. Leave the other functions, support.ts and README.md unchanged.",
    "Use apply_patch to change untraced in callables.ts to increment its input value by 2 instead of 1. Preserve its existing export and API form. Leave the other functions, support.ts and README.md unchanged.",
    "Use apply_patch to change legacy in callables.ts to return its input unchanged using a local variable. Change mutable in unsupported.ts to increment by 2 instead of 1. Preserve existing exports and API forms. Leave the other functions, support.ts and README.md unchanged."
  ],
  async verify({ url, page, bounded, setPhase, reportDiagnostic }) {
    setPhase("callable-outcomes")
    const snapshot = await bounded(
      async () => {
        const value = await (await fetch(`${url}snapshot`, { signal: AbortSignal.timeout(10000) })).json()
        reportDiagnostic({
          records: value.records.length,
          diagnostics: value.records
            .filter((record) => record.fact.kind === "diagnostic")
            .map((record) => ({ stage: record.fact.diagnostic.stage, code: record.fact.diagnostic.code })),
          admissions: value.records
            .filter((record) => record.fact.kind === "edit-admission")
            .map((record) => record.fact.outcome),
          candidateStates: value.records
            .filter((record) => record.fact.kind === "edit-received")
            .flatMap((record) =>
              record.fact.candidates.map((candidate) => ({
                knownPath: candidate.path === "callables.ts" || candidate.path === "unsupported.ts",
                operation: candidate.operation,
                selection: candidate.selection.status,
                diagnosticCode: candidate.selection.diagnostic?.code
              }))
            ),
          facts: Object.fromEntries(
            ["edit-received", "edit-admission", "unit-prepared", "model-input", "evaluation-outcome"].map((kind) => [
              kind,
              value.records.filter((record) => record.fact.kind === kind).length
            ])
          ),
          callables: ["run", "wrapped", "untraced", "legacy", "mutable"].map((name) => ({
            name,
            prepared: value.records.filter(
              (record) => record.fact.kind === "unit-prepared" && record.fact.declaration === name
            ).length,
            omissions: value.records
              .filter((record) => record.fact.kind === "preparation-omission" && record.fact.declaration === name)
              .map((record) => record.fact.reason)
          })),
          unnamedOmissions: value.records
            .filter((record) => record.fact.kind === "preparation-omission" && record.fact.declaration === undefined)
            .map((record) => record.fact.reason)
        })
        return ["run", "wrapped", "untraced"].every((name) =>
          value.records.some((record) => record.fact.kind === "unit-prepared" && record.fact.declaration === name)
        ) &&
          value.records.filter((record) => record.fact.kind === "evaluation-outcome" && record.fact.outcome === "clear")
            .length >= 3
          ? value
          : undefined
      },
      "native callable review outcomes",
      30000
    )
    const units = ["run", "wrapped", "untraced"].map((name) => requestFacts(snapshot, name))
    const receipts = snapshot.records.filter((record) => record.fact.kind === "edit-received")
    for (const unit of units) {
      assert.ok(
        receipts.some(
          (record) =>
            record.correlation.receiptId === unit.receiptId &&
            record.fact.candidates.some((candidate) => candidate.path === "callables.ts")
        ),
        "Every unit must have its native edit receipt"
      )
      assert.ok(
        snapshot.records.some(
          (record) =>
            record.correlation.receiptId === unit.receiptId &&
            record.fact.kind === "edit-admission" &&
            record.fact.outcome === "accepted"
        ),
        "Receipt and admission are independent of classifier outcome"
      )
    }
    assertOmissions(snapshot)
    setPhase("callable-browser")
    await page.goto(url)
    await page.locator("#hide-unreviewed").uncheck()
    await page.locator("#edits button").filter({ hasText: "unsupported.ts" }).first().click()
    await revealInspection(page, "#routes")
    await page
      .locator("#routes")
      .getByText(/Callable form is outside/)
      .waitFor()
    await page.reload()
    await page.locator("#hide-unreviewed").uncheck()
    await page.locator("#edits button").filter({ hasText: "unsupported.ts" }).first().click()
    await revealInspection(page, "#routes")
    await page
      .locator("#routes")
      .getByText(/Callable form is outside/)
      .waitFor()
    setPhase("callable-replay")
    const replay = await (
      await fetch(`${url}snapshot?cursor=${encodeURIComponent(snapshot.watermark.cursor)}`, {
        signal: AbortSignal.timeout(10000)
      })
    ).json()
    assertOmissions(replay)
    for (const name of ["run", "wrapped", "untraced"])
      assert.deepEqual(requestFacts(replay, name), requestFacts(snapshot, name))
    return {
      units,
      checks: {
        nativeUpdate: true,
        admission: true,
        preparation: true,
        classifierOutcomes: true,
        overloadIsolation: true,
        unsupportedCallable: true,
        publicHttp: true,
        browser: true,
        reload: true,
        replay: true
      }
    }
  }
}
