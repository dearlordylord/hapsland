import { canonicalValue } from "@hapsland/review-definition/direct-event/model"

export const logicalBytes = (value: unknown): number => Buffer.byteLength(canonicalValue(value), "utf8")
