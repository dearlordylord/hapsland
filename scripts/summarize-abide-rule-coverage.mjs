// Join reviewer identities only after frozen anonymous scores and semantic review.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
const root = path.resolve(process.argv[2] ?? "evidence/abide-rule-coverage-current")
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name)))
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
const write = (name, value) =>
  fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
assert(fs.existsSync(path.join(root, "execution-complete.json")), "Execution must finish first")
const declaration = read("declaration.json")
const { cases } = await import(path.join(root, "abide-rule-coverage-fixtures.mjs"))
const families = [...new Set(cases.map((fixture) => fixture.ruleId))]
const ledger = fs
  .readFileSync(path.join(root, "attempts.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse)
assert.equal(new Set(ledger.map((row) => row.id)).size, ledger.length)
assert(ledger.length <= declaration.physicalRequestCap)
const project = path.resolve(import.meta.dirname, "..")
for (const [name, expected] of Object.entries(declaration.protectedDigests))
  assert.equal(hash(fs.readFileSync(path.join(project, name))), expected, `Protected source drift: ${name}`)
const frozenScores = {},
  frozenManual = {},
  manual = new Map()
for (const ruleId of families) {
  const scorePath = `${ruleId}/native/blind-scores.json`
  frozenScores[scorePath] = hash(fs.readFileSync(path.join(root, scorePath)))
  const scores = read(scorePath)
  const manualRows = scores.scores.filter((row) => row.status === "manual-adjudication-required")
  if (manualRows.length) {
    const filename = `manual/${ruleId}.json`
    const result = read(filename)
    assert.equal(result.rows.length, manualRows.length, `Missing semantic judgments: ${ruleId}`)
    frozenManual[filename] = hash(fs.readFileSync(path.join(root, filename)))
    for (const row of result.rows) {
      const scored = manualRows.find((item) => item.blindId === row.blindId)
      assert(scored && scored.sourceDigest === row.sourceDigest && scored.supportingDigest === row.supportingDigest)
      assert(["repaired", "remaining", "clean-preserved", "new-domain-restriction", "unassessed"].includes(row.status))
      assert(row.rationale && row.verificationState)
      assert(!manual.has(row.blindId))
      manual.set(row.blindId, row)
    }
  }
}
// This file is the receipt for joining the already frozen evidence.
write("unblinding-receipt.json", {
  version: 1,
  at: new Date().toISOString(),
  scoreDigests: frozenScores,
  manualDigests: frozenManual,
  manualRuleDeclarationDigest: hash(fs.readFileSync(path.join(root, "manual-scoring-declaration.json")))
})
const familyRows = [],
  attempts = []
for (const ruleId of families) {
  const detection = fs
    .readdirSync(path.join(root, ruleId, "detection"))
    .filter((name) => /^A-/.test(name))
    .map((name) => read(`${ruleId}/detection/${name}`))
  assert.equal(detection.length, 18)
  const nativeIndex = read(`${ruleId}/native/index.json`)
  assert.equal(nativeIndex.records.length, 9)
  const scoreData = read(`${ruleId}/native/blind-scores.json`)
  const native = nativeIndex.records.map((mapping) => {
    const record = read(`${ruleId}/native/B-${mapping.id}-${mapping.candidate}.json`)
    assert.equal(record.agentRuntimeVersion, "0.155.1")
    assert.equal(record.model, "gpt-6-luna")
    assert.equal(record.reasoning, "max")
    assert(record.requests.filter((item) => item.kind === "request").length <= 4)
    const scored = scoreData.scores.find((row) => row.blindId === mapping.blindId)
    assert(scored, "Missing anonymous score")
    const artifactRoot = path.join(root, ruleId, "native/blind", mapping.blindId)
    assert.equal(hash(fs.readFileSync(path.join(artifactRoot, "subject.ts"))), scored.sourceDigest)
    assert.equal(
      hash(
        fs.existsSync(path.join(artifactRoot, "support.ts"))
          ? fs.readFileSync(path.join(artifactRoot, "support.ts"))
          : ""
      ),
      scored.supportingDigest
    )
    const adjudication = manual.get(mapping.blindId)
    return {
      ...record,
      score: scored,
      finalStatus: adjudication?.status ?? scored.status,
      adjudication: adjudication ?? null
    }
  })
  const row = {
    ruleId,
    cases: cases
      .filter((fixture) => fixture.ruleId === ruleId)
      .map((fixture) => ({ id: fixture.id, gold: fixture.gold, supportingFiles: Object.keys(fixture.support) })),
    detection: {},
    native: {},
    cells: []
  }
  for (const candidate of ["hapsland", "abide"]) {
    const selected = detection.filter((record) => record.candidate === candidate)
    const count = {
      observations: selected.length,
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegativesAmongEvaluated: 0,
      uncheckedFlaws: 0,
      uncheckedClean: 0,
      middleBand: 0,
      emittedRuleBearingOutputs: 0,
      transportErrors: 0
    }
    for (const record of selected) {
      const fixture = cases.find((item) => item.id === record.caseId)
      const responses = record.requests.filter(
        (item) => item.kind === "response" && item.status === 200 && item.answers?.[ruleId]
      )
      const answer = responses.at(-1)?.answers?.[ruleId]
      const positive = answer?.finding === true
      const emitted =
        candidate === "hapsland"
          ? record.summary.evaluations?.some((item) => item.findingIds.includes(ruleId)) === true
          : record.summary.finding === true
      if (!answer) fixture.gold ? count.uncheckedFlaws++ : count.uncheckedClean++
      else if (positive) fixture.gold ? count.truePositives++ : count.falsePositives++
      else fixture.gold ? count.falseNegativesAmongEvaluated++ : count.trueNegatives++
      if (answer?.band === "middle") count.middleBand++
      if (emitted) count.emittedRuleBearingOutputs++
      count.transportErrors += record.requests.filter((item) => item.kind === "transport-error").length
      attempts.push(...record.requests.filter((item) => item.kind === "request"))
    }
    row.detection[candidate] = count
  }
  for (const candidate of ["baseline", "hapsland", "abide"]) {
    const selected = native.filter((record) => record.candidate === candidate)
    const count = {
      sessions: selected.length,
      flawedSessions: 0,
      repaired: 0,
      completedRepaired: 0,
      remaining: 0,
      cleanSessions: 0,
      cleanPreserved: 0,
      newDomainRestriction: 0,
      unassessed: 0,
      verifiedReceipts: 0,
      receiptLinkedRepairs: 0,
      positiveReviewerAnswers: 0,
      ruleBearingOutputs: 0,
      successfulSessions: 0,
      compiled: 0,
      timeouts: 0,
      transportErrors: 0,
      budgetStops: 0,
      requests: 0
    }
    for (const record of selected) {
      const flaw = record.score.underlyingGold
      flaw ? count.flawedSessions++ : count.cleanSessions++
      if (record.finalStatus === "repaired") count.repaired++
      if (record.finalStatus === "repaired" && record.code === 0 && record.finalTypecheck?.passes)
        count.completedRepaired++
      if (record.finalStatus === "remaining") count.remaining++
      if (record.finalStatus === "clean-preserved") count.cleanPreserved++
      if (record.finalStatus === "new-domain-restriction") count.newDomainRestriction++
      if (record.finalStatus === "unassessed") count.unassessed++
      const receipt = record.feedbackReceipt?.requestedByHook && record.feedbackReceipt?.echoedInFinalAgentMessage
      const ruleBearing = record.hookEvents?.some((event) => event.findingIds?.includes(ruleId))
      const positive = record.requests.some(
        (item) => item.kind === "response" && item.status === 200 && item.answers?.[ruleId]?.finding
      )
      if (receipt) count.verifiedReceipts++
      if (ruleBearing) count.ruleBearingOutputs++
      if (positive) count.positiveReviewerAnswers++
      if (
        receipt &&
        ruleBearing &&
        record.finalStatus === "repaired" &&
        record.feedbackReceipt?.reportedOutcome === "APPLIED"
      )
        count.receiptLinkedRepairs++
      if (record.code === 0) count.successfulSessions++
      if (record.finalTypecheck?.passes) count.compiled++
      if (record.timedOut) count.timeouts++
      count.transportErrors += record.requests.filter((item) => item.kind === "transport-error").length
      count.budgetStops += record.requests.filter((item) => item.kind === "budget-stop").length
      count.requests += record.requests.filter((item) => item.kind === "request").length
      attempts.push(...record.requests.filter((item) => item.kind === "request"))
      row.cells.push({
        caseId: record.score.caseId,
        candidate,
        blindId: record.blindId,
        originalScore: record.score.status,
        finalStatus: record.finalStatus,
        compiled: record.finalTypecheck?.passes === true,
        completed: record.code === 0,
        verifiedReceipt: Boolean(receipt),
        reportedApplication: record.feedbackReceipt?.reportedOutcome ?? null,
        sourceDigest: record.score.sourceDigest,
        supportingDigest: record.score.supportingDigest,
        adjudication: record.adjudication
      })
    }
    row.native[candidate] = count
  }
  familyRows.push(row)
}
assert.equal(attempts.length, ledger.length)
assert.deepEqual(attempts.map((item) => item.id).sort(), ledger.map((item) => item.id).sort())
write("comparison.json", {
  version: 1,
  completedAt: new Date().toISOString(),
  sourceClass: "RUN",
  verificationState: "RUNTIME-TESTED",
  agentRuntime: "Codex CLI",
  agentRuntimeVersion: "0.155.1",
  model: "gpt-6-luna",
  reasoning: "max",
  physicalRequests: ledger.length,
  plannedDetectionCells: cases.length * 6,
  plannedNativeSessions: cases.length * 3,
  families: familyRows,
  limits:
    "Selected synthetic examples. Three detection repetitions and one native session per case/arm. Anonymous semantic judgments supplement fixed finite probes; no general or context-only superiority claim."
})
console.log(JSON.stringify({ summarized: true, physicalRequests: ledger.length, families: familyRows.length }))
