import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import { resolve } from "node:path"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type HandoffRequest } from "./authority.ts"

export const residentResponse = (response: ResidentResponse): ResidentResponse => response

export const findingAtDeliveryRoot = (finding: Finding, sourceRoot: string, callerRoot: string): Finding =>
  sourceRoot === callerRoot ? finding : { ...finding, path: resolve(sourceRoot, finding.path) }

export const handoffCallerRoot = (request: HandoffRequest, sourceRoot: string): string =>
  "dispatch" in request
    ? (request.dispatch.deliveryCwd ??
      ("root" in request ? request.root : "observation" in request ? request.observation.root : sourceRoot))
    : sourceRoot

export const withoutDeliveredFindings = (
  findings: ReadonlyArray<Finding>,
  delivered: ReadonlyArray<Finding>
): ReadonlyArray<Finding> => {
  const counts = new Map<string, number>()
  for (const finding of delivered) {
    const key = canonicalValue(finding)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return findings.filter((finding) => {
    const key = canonicalValue(finding)
    const count = counts.get(key) ?? 0
    if (count === 0) return true
    if (count === 1) counts.delete(key)
    else counts.set(key, count - 1)
    return false
  })
}
