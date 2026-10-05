import { createHash } from "node:crypto"
import type { PreparedUnit } from "../direct-event/model.ts"
import type { Finding } from "../direct-event/output.ts"
import type { InspectionFact } from "./contract.ts"

const fits = (value: unknown, bytes = 16384): boolean => Buffer.byteLength(JSON.stringify(value)) <= bytes

/** Read only the already-frozen policy; never reload configuration or apply review decisions. */
export const captureInspectionPolicy = (
  prepared: PreparedUnit,
  controlled: boolean
): Extract<InspectionFact, { kind: "unit-policy" }> => {
  const rules = prepared.input.rules.map((rule) => ({
    ruleId: rule.id,
    qualifiedId: rule.qualifiedId,
    question: rule.decision.instructions,
    criteria: rule.decision.criteria,
    threshold: rule.threshold,
    message: rule.message,
    rank: rule.rank,
    packDigest: rule.packDigest,
    definitionDigest: rule.definitionDigest
  }))
  return {
    kind: "unit-policy",
    provider: prepared.input.providerIdentity.provider,
    model: prepared.input.providerIdentity.model,
    activity: controlled ? "controlled" : "live",
    interpretation: prepared.input.interpretation,
    payload:
      rules.length > 128 || !fits(rules, 65536)
        ? { status: "missing", reason: "oversized" }
        : { status: "available", rules }
  }
}

/** Preserve the pipeline's interpreted findings and ordering; do not evaluate probabilities again. */
export const captureInspectionFindings = (
  findings: ReadonlyArray<Finding>
): Extract<InspectionFact, { kind: "interpreted-findings" }> => ({
  kind: "interpreted-findings",
  payload:
    findings.length > 128 || !fits(findings)
      ? { status: "missing", reason: "oversized" }
      : { status: "available", findings }
})

/** Stable identity of the interpreted rule finding, independent of any submission attempt. */
export const captureInspectionFate = (
  findings: ReadonlyArray<Finding>,
  fate: Extract<InspectionFact, { kind: "finding-fate" }>["fate"],
  reason: Extract<InspectionFact, { kind: "finding-fate" }>["reason"],
  adviceId?: string
): Extract<InspectionFact, { kind: "finding-fate" }> => ({
  kind: "finding-fate",
  fate,
  reason,
  ...(adviceId === undefined ? {} : { adviceId }),
  payload:
    findings.length > 128
      ? { status: "missing", reason: "oversized" }
      : {
          status: "available",
          findingIds: findings.map((finding) =>
            createHash("sha256")
              .update(JSON.stringify([finding.semanticIdentity, finding.ruleId]))
              .digest("hex")
          )
        }
})
