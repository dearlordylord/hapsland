// Freeze all anonymous judgments before joining product identities.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
const root = path.resolve(process.argv[2] ?? ".test-runs/abide-large-declarations-current")
const read = (n) => JSON.parse(fs.readFileSync(path.join(root, n)))
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex")
const write = (n, v) => fs.writeFileSync(path.join(root, n), JSON.stringify(v, null, 2) + "\n", { flag: "wx" })
assert(fs.existsSync(path.join(root, "execution-complete.json")), "Wait for complete execution")
const declaration = read("declaration.json")
const { cases: allCases } = await import(path.join(root, "abide-large-declaration-fixtures.mjs"))
const cases = allCases.filter((f) => declaration.selectedDomains.includes(f.candidateId))
for (const [p, h] of Object.entries(declaration.protectedDigests))
  assert.equal(hash(fs.readFileSync(path.resolve(import.meta.dirname, "..", p))), h, `Source drift: ${p}`)
const domains = [...new Set(cases.map((f) => f.candidateId))]
const frozenScores = {},
  frozenManual = {},
  manual = new Map()
for (const domain of domains) {
  const name = `${domain}/native/blind-scores.json`
  frozenScores[name] = hash(fs.readFileSync(path.join(root, name)))
  const scored = read(name).scores
  assert.equal(scored.length, 12)
  const required = scored.filter((s) => s.status === "manual-adjudication-required")
  if (required.length) {
    const name = `manual/${domain}.json`,
      r = read(name)
    assert.equal(r.rows.length, required.length)
    frozenManual[name] = hash(fs.readFileSync(path.join(root, name)))
    for (const row of r.rows) {
      const s = required.find((s) => s.blindId === row.blindId)
      assert(s && s.sourceDigest === row.sourceDigest && s.supportingDigest === row.supportingDigest)
      assert(["repaired", "remaining", "clean-preserved", "new-domain-restriction", "unassessed"].includes(row.status))
      assert(row.rationale && row.verificationState && !manual.has(row.blindId))
      manual.set(row.blindId, row)
    }
  }
}
write("unblinding-receipt.json", {
  version: 1,
  at: new Date().toISOString(),
  scoreDigests: frozenScores,
  manualDigests: frozenManual,
  manualRuleDeclarationDigest: hash(fs.readFileSync(path.join(root, "manual-scoring-declaration.json")))
})
const rows = [],
  attempts = []
function detectionCounts(records, candidate, layout) {
  const selected = records.filter(
    (r) => r.candidate === candidate && cases.find((f) => f.id === r.caseId).layout === layout
  )
  const c = {
    observations: selected.length,
    flawedObservations: 0,
    cleanObservations: 0,
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
  for (const r of selected) {
    const f = cases.find((f) => f.id === r.caseId)
    f.gold ? c.flawedObservations++ : c.cleanObservations++
    const a = r.requests.filter((q) => q.kind === "response" && q.status === 200 && q.answers?.[f.ruleId]).at(-1)
      ?.answers[f.ruleId]
    if (!a) f.gold ? c.uncheckedFlaws++ : c.uncheckedClean++
    else if (a.finding) f.gold ? c.truePositives++ : c.falsePositives++
    else f.gold ? c.falseNegativesAmongEvaluated++ : c.trueNegatives++
    if (a?.band === "middle") c.middleBand++
    if (
      candidate === "hapsland"
        ? r.summary.evaluations?.some((e) => e.findingIds.includes(f.ruleId))
        : r.summary.finding === true
    )
      c.emittedRuleBearingOutputs++
    c.transportErrors += r.requests.filter((q) => q.kind === "transport-error").length
  }
  return c
}
function nativeCounts(records, candidate, layout) {
  const selected = records.filter((r) => r.candidate === candidate && r.fixture.layout === layout)
  const c = {
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
  for (const r of selected) {
    r.fixture.gold ? c.flawedSessions++ : c.cleanSessions++
    if (r.finalStatus === "repaired") c.repaired++
    if (r.finalStatus === "repaired" && r.code === 0 && r.finalTypecheck?.passes) c.completedRepaired++
    if (r.finalStatus === "remaining") c.remaining++
    if (r.finalStatus === "clean-preserved") c.cleanPreserved++
    if (r.finalStatus === "new-domain-restriction") c.newDomainRestriction++
    if (r.finalStatus === "unassessed") c.unassessed++
    const receipt = r.feedbackReceipt?.requestedByHook && r.feedbackReceipt?.echoedInFinalAgentMessage
    const output = r.hookEvents?.some((e) => e.findingIds?.includes(r.fixture.ruleId))
    if (receipt) c.verifiedReceipts++
    if (output) c.ruleBearingOutputs++
    if (r.requests.some((q) => q.kind === "response" && q.status === 200 && q.answers?.[r.fixture.ruleId]?.finding))
      c.positiveReviewerAnswers++
    if (receipt && output && r.finalStatus === "repaired" && r.feedbackReceipt?.reportedOutcome === "APPLIED")
      c.receiptLinkedRepairs++
    if (r.code === 0) c.successfulSessions++
    if (r.finalTypecheck?.passes) c.compiled++
    if (r.timedOut) c.timeouts++
    c.transportErrors += r.requests.filter((q) => q.kind === "transport-error").length
    c.budgetStops += r.requests.filter((q) => q.kind === "budget-stop").length
    c.requests += r.requests.filter((q) => q.kind === "request").length
  }
  return c
}
for (const domain of domains) {
  const detection = fs
    .readdirSync(path.join(root, domain, "detection"))
    .filter((n) => n.startsWith("A-"))
    .map((n) => read(`${domain}/detection/${n}`))
  assert.equal(detection.length, 24)
  const index = read(`${domain}/native/index.json`)
  assert.equal(index.records.length, 12)
  const scores = read(`${domain}/native/blind-scores.json`).scores
  const native = index.records.map((m) => {
    const r = read(`${domain}/native/B-${m.id}-${m.candidate}.json`),
      s = scores.find((s) => s.blindId === m.blindId),
      f = cases.find((f) => f.id === s?.caseId)
    assert(s && f)
    assert.equal(r.model, "gpt-6-luna")
    assert.equal(r.reasoning, "max")
    assert.equal(r.agentRuntimeVersion, "0.155.1")
    assert(r.requests.filter((q) => q.kind === "request").length <= 4)
    const dir = path.join(root, domain, "native/blind", m.blindId)
    assert.equal(hash(fs.readFileSync(path.join(dir, "subject.ts"))), s.sourceDigest)
    assert.equal(
      hash(fs.existsSync(path.join(dir, "support.ts")) ? fs.readFileSync(path.join(dir, "support.ts")) : ""),
      s.supportingDigest
    )
    return {
      ...r,
      score: s,
      fixture: f,
      finalStatus: manual.get(m.blindId)?.status ?? s.status,
      adjudication: manual.get(m.blindId) ?? null
    }
  })
  for (const r of [...detection, ...native]) attempts.push(...r.requests.filter((q) => q.kind === "request"))
  const row = {
    candidateId: domain,
    ruleId: cases.find((f) => f.candidateId === domain).ruleId,
    stratum: ["reservation-window", "moderation-decision"].includes(domain)
      ? "function-layout"
      : "type-added-facts-and-layout",
    detection: {},
    native: {},
    cells: []
  }
  for (const layout of ["small", "large-adjacent", "large-separated"])
    row.detection[layout] = Object.fromEntries(
      ["hapsland", "abide"].map((a) => [a, detectionCounts(detection, a, layout)])
    )
  for (const layout of ["small", "large-separated"])
    row.native[layout] = Object.fromEntries(
      ["baseline", "hapsland", "abide"].map((a) => [a, nativeCounts(native, a, layout)])
    )
  row.cells = native.map((r) => ({
    caseId: r.fixture.id,
    layout: r.fixture.layout,
    gold: r.fixture.gold,
    candidate: r.candidate,
    blindId: r.blindId,
    finalStatus: r.finalStatus,
    compiled: r.finalTypecheck?.passes === true,
    completed: r.code === 0,
    sourceDigest: r.score.sourceDigest,
    supportingDigest: r.score.supportingDigest,
    adjudication: r.adjudication,
    verifiedReceipt: Boolean(r.feedbackReceipt?.requestedByHook && r.feedbackReceipt?.echoedInFinalAgentMessage),
    reportedApplication: r.feedbackReceipt?.reportedOutcome ?? null,
    firstPatch:
      r.hookEvents
        ?.filter((e) => ["edit", "post-tool-use"].includes(e.kind) && e.patchStats)
        .sort((a, b) => a.at - b.at)[0]?.patchStats ?? null,
    uniquePatchShapes: [
      ...new Map(
        (r.hookEvents ?? []).filter((e) => e.patchStats).map((e) => [JSON.stringify(e.patchStats), e.patchStats])
      ).values()
    ]
  }))
  rows.push(row)
}
const ledger = fs
  .readFileSync(path.join(root, "attempts.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse)
assert.equal(new Set(ledger.map((q) => q.id)).size, ledger.length)
assert(ledger.length <= declaration.physicalRequestCap)
assert.equal(attempts.length, ledger.length)
assert.deepEqual(attempts.map((q) => q.id).sort(), ledger.map((q) => q.id).sort())
assert.equal(domains.length * 24, declaration.plannedDetectionCells)
assert.equal(domains.length * 12, declaration.plannedNativeSessions)
write("comparison.json", {
  version: 1,
  completedAt: new Date().toISOString(),
  sourceClass: "RUN",
  verificationState: "RUNTIME-TESTED",
  agentRuntime: "Codex CLI",
  agentRuntimeVersion: "0.155.1",
  model: "gpt-6-luna",
  reasoning: "max",
  plannedDetectionCells: declaration.plannedDetectionCells,
  plannedNativeSessions: declaration.plannedNativeSessions,
  physicalRequests: ledger.length,
  domains: rows,
  limits:
    "Exploratory selected synthetic domains. Two detection repeats, one native session per input/arm. Type and function treatments differ. Controlled localized detection patches; actual native patches retained. No general or isolated context-causality claim."
})
console.log(JSON.stringify({ summarized: true, domains: rows.length, physicalRequests: ledger.length }))
