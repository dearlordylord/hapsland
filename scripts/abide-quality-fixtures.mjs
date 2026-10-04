// Prospective synthetic fixtures. Gold is authored before provider execution.
const r2 = "r2_meaningless_combinations"
const r4 = "r4_duplicate_encoding"
const r5 = "r5_absence_confusion"
const make = (id, category, ruleId, before, after, support, gold, rationale, counterexample, extras = {}) => ({
  id,
  category,
  ruleId,
  filename: "subject.ts",
  declarationName: "CaseState",
  before,
  after,
  support,
  gold,
  rationale,
  counterexample,
  needsEvidence: Object.keys(support),
  excludedPaths: [],
  prompt: "Update the CaseState declaration as requested, preserve the documented domain, and check your changes.",
  ...extras
})
export const cases = [
  make(
    "context-invoice",
    "contextual-violation",
    r4,
    'import type { Money } from "./support";\nexport interface CaseState { label: string; amountDue: Money; }\n',
    'import type { Money } from "./support";\nexport interface CaseState { label: string; amountDue: Money; invoiceCurrency: "EUR" | "USD"; }\n',
    { "support.ts": 'export interface Money { minorUnits: number; currency: "EUR" | "USD"; }\n' },
    true,
    "Invoice currency is exactly the currency of its amount due; a second independent encoding can disagree.",
    '{ label: "a", amountDue: { minorUnits: 100, currency: "EUR" }, invoiceCurrency: "USD" }'
  ),
  make(
    "context-rendering",
    "contextual-violation",
    r4,
    'import type { ImageAsset } from "./support";\nexport interface CaseState { label: string; asset: ImageAsset; }\n',
    'import type { ImageAsset } from "./support";\nexport interface CaseState { label: string; asset: ImageAsset; resolution: "small" | "large"; }\n',
    {
      "support.ts":
        'export interface ImageAsset { rendering: RenderingPreset; }\nexport interface RenderingPreset { resolution: "small" | "large"; }\n'
    },
    true,
    "A poster resolution is the rendering resolution of its only asset; these are the same fact.",
    '{ label: "a", asset: { rendering: { resolution: "small" } }, resolution: "large" }'
  ),
  make(
    "context-address",
    "contextual-violation",
    r4,
    'import type { Shipment } from "./support";\nexport interface CaseState { label: string; shipment: Shipment; }\n',
    'import type { Shipment } from "./support";\nexport interface CaseState { label: string; shipment: Shipment; destinationCountry: "CA" | "US"; }\n',
    {
      "support.ts":
        'export interface Shipment { destination: Destination; }\nexport interface Destination { country: "CA" | "US"; }\n'
    },
    true,
    "The shipment has one destination; destinationCountry repeats that destination country.",
    '{ label: "a", shipment: { destination: { country: "CA" } }, destinationCountry: "US" }'
  ),
  make(
    "context-seat",
    "contextual-violation",
    r4,
    'import type { SeatAssignment } from "./support";\nexport interface CaseState { label: string; assignment: SeatAssignment; }\n',
    'import type { SeatAssignment } from "./support";\nexport interface CaseState { label: string; assignment: SeatAssignment; row: "A" | "B"; }\n',
    {
      "support.ts":
        'export interface SeatAssignment { seat: Seat; }\nexport interface Seat { row: "A" | "B"; number: number; }\n'
    },
    true,
    "The ticket row is the row of the assigned seat, not a preference or another resource.",
    '{ label: "a", assignment: { seat: { row: "A", number: 1 } }, row: "B" }'
  ),
  make(
    "local-payment",
    "local-violation",
    r2,
    'export type CaseState = { label: string; status: "pending" } | { label: string; status: "paid"; receipt: string };\n',
    'export interface CaseState { label: string; status: "pending" | "paid"; receipt: string | null; }\n',
    {},
    true,
    "Pending payments have no receipt; paid payments must have one.",
    '{ label: "a", status: "paid", receipt: null }'
  ),
  make(
    "local-result",
    "local-violation",
    r2,
    'export type CaseState = { label: string; outcome: "success"; value: number } | { label: string; outcome: "failure"; error: string };\n',
    'export interface CaseState { label: string; outcome: "success" | "failure"; value: number | null; error: string | null; }\n',
    {},
    true,
    "Success has a value and no error; failure has an error and no value.",
    '{ label: "a", outcome: "success", value: null, error: "failed" }'
  ),
  make(
    "clean-payment",
    "clean-control",
    r2,
    'export type CaseState = { label: string; status: "pending" } | { label: string; status: "paid"; receipt: string };\n',
    'export type CaseState = { label: string; status: "pending"; note?: string } | { label: string; status: "paid"; receipt: string; note?: string };\n',
    {},
    false,
    "The union enforces receipt applicability; notes are genuinely independent.",
    null
  ),
  make(
    "clean-currencies",
    "clean-control",
    r4,
    'import type { Money } from "./support";\nexport interface CaseState { label: string; quoted: Money; }\n',
    'import type { Money } from "./support";\nexport interface CaseState { label: string; quoted: Money; settled: Money; }\n',
    { "support.ts": 'export interface Money { minorUnits: number; currency: "EUR" | "USD"; }\n' },
    false,
    "Quoted and settled amounts are different facts; conversion may change both amount and currency.",
    null
  ),
  make(
    "clean-note",
    "clean-control",
    r5,
    "export interface CaseState { label: string; }\n",
    "export interface CaseState { label: string; /** Omitted means no note was supplied, and has no other meaning. */ note?: string; }\n",
    {},
    false,
    "Absence has precisely one documented meaning; an empty string is a supplied note.",
    null
  ),
  make(
    "excluded-root",
    "insufficient-evidence",
    r2,
    'export type CaseState = { label: string; status: "pending" } | { label: string; status: "paid"; receipt: string };\n',
    'export interface CaseState { label: string; status: "pending" | "paid"; receipt: string | null; }\n',
    {},
    null,
    "Hapsland policy excludes the root before capture; no assessment is warranted by that product. Underlying full-source gold is a violation.",
    '{ label: "a", status: "paid", receipt: null }',
    { excludedPaths: ["subject.ts"], underlyingGold: true, expectedHapsland: "unchecked-root-excluded" }
  ),
  make(
    "excluded-support",
    "insufficient-evidence",
    r4,
    'import type { Money } from "./support";\nexport interface CaseState { label: string; amountDue: Money; }\n',
    'import type { Money } from "./support";\nexport interface CaseState { label: string; amountDue: Money; invoiceCurrency: "EUR" | "USD"; }\n',
    { "support.ts": 'export interface Money { minorUnits: number; currency: "EUR" | "USD"; }\n' },
    null,
    "Required supporting declaration is excluded; Hapsland should retain an unchecked reason, not infer a completed contextual assessment. Abide does not inherit this setting.",
    '{ label: "a", amountDue: { minorUnits: 100, currency: "EUR" }, invoiceCurrency: "USD" }',
    { excludedPaths: ["support.ts"], underlyingGold: true, expectedHapsland: "unchecked-support-excluded" }
  ),
  make(
    "diff-result-regression",
    "diff-favorable",
    r2,
    'export type CaseState = { label: string; result: "found"; item: string } | { label: string; result: "missing" };\n',
    'export interface CaseState { label: string; result: "found" | "missing"; item: string | null; }\n',
    {},
    true,
    "The diff explicitly removes a constrained union and creates meaningless found-without-item combinations.",
    '{ label: "a", result: "found", item: null }',
    {
      prompt:
        "Simplify the implementation representation while preserving the existing found/missing domain semantics; check the resulting API."
    }
  )
]

// Separate repair tasks use seeded code, not prior scored evaluator outputs.
// A neutral field rename supplies a genuine direct-edit opportunity to all arms.
const taskCaseIds = [
  "context-invoice",
  "context-rendering",
  "local-payment",
  "clean-payment",
  "clean-currencies",
  "excluded-support"
]
const taskDomains = {
  "context-invoice": "An invoice has one amount due. Its invoice currency is the currency of that amount.",
  "context-rendering": "A poster displays one asset. Its resolution is the rendering resolution of that asset.",
  "local-payment": "A payment is pending or paid. Pending payments have no receipt. Paid payments have a receipt.",
  "local-result":
    "An operation succeeds with a numeric value, or fails with an error message. Successful operations have no error; failed operations have no value.",
  "clean-payment":
    "A payment is pending or paid. Pending payments have no receipt. Paid payments have a receipt. Either may carry an independently supplied note.",
  "clean-currencies":
    "A transaction records a quoted amount and a settled amount. Settlement may apply currency conversion. The quoted and settled values are independent observations.",
  "excluded-support": "An invoice has one amount due. Its invoice currency is the currency of that amount."
}
const taskWitnesses = {
  "context-invoice": ['{ displayLabel: "a", amountDue: { minorUnits: 100, currency: "EUR" }, invoiceCurrency: "EUR" }'],
  "context-rendering": ['{ displayLabel: "a", asset: { rendering: { resolution: "small" } }, resolution: "small" }'],
  "local-payment": [
    '{ displayLabel: "a", status: "pending", receipt: null }',
    '{ displayLabel: "a", status: "paid", receipt: "receipt-1" }'
  ],
  "clean-payment": [
    '{ displayLabel: "a", status: "pending" }',
    '{ displayLabel: "a", status: "paid", receipt: "receipt-1", note: "thanks" }'
  ],
  "clean-currencies": [
    '{ displayLabel: "a", quoted: { minorUnits: 100, currency: "EUR" }, settled: { minorUnits: 110, currency: "USD" } }'
  ],
  "excluded-support": ['{ displayLabel: "a", amountDue: { minorUnits: 100, currency: "EUR" }, invoiceCurrency: "EUR" }']
}
export const tasks = taskCaseIds.map((caseId, index) => {
  const fixture = cases.find((item) => item.id === caseId)
  const domain = fixture.rationale
  return {
    id: `repair-${index + 1}-${caseId}`,
    caseId,
    ruleId: fixture.ruleId,
    filename: fixture.filename,
    declarationName: fixture.declarationName,
    initial: fixture.after,
    support: fixture.support,
    excludedPaths: fixture.excludedPaths,
    readme: `# Domain\n\n${taskDomains[caseId]}\n\nCaseState is the public domain record. Its label is presentation text. Keep the recorded domain semantics and independent facts.\n`,
    prompt:
      "First make only the presentation-field rename from label to displayLabel in subject.ts, using one apply_patch call and leaving the rest of the type unchanged. Keep CaseState exported. After that tool call returns, run npm run typecheck. Then review the public type against README.md, make any changes you judge necessary to preserve its domain semantics, run typecheck and tests, and report what you verified. Do not add runtime dependencies.",
    gold: fixture.gold,
    probe: {
      strategy: fixture.gold ? "concrete-domain-counterexample" : "valid-domain-witnesses",
      counterexample: fixture.counterexample?.replaceAll("label:", "displayLabel:") ?? null,
      validWitnesses: taskWitnesses[caseId],
      rationale: domain,
      requireExport: "CaseState",
      requireRenamedField: "displayLabel",
      // TypeScript import/assignment probes, not formatting/regex checks, determine
      // whether an invalid value is still admitted. A changed API needs blind
      // adjudication and domain witness checks, never an automatic perfect score.
      adjudicateChangedShape: true
    }
  }
})
