import { sha256 } from "./file-snapshots.ts"
import { canonicalJson as stableJson } from "../hook-reconciliation.ts"

export const OWNED_MARKER = "--review-tool-owned=codex-v1"

export const COMPOSED_MARKER = "--review-tool-composed-owned=codex-v1"

export const hookFingerprint = (value: unknown) => sha256(`installation-v1:hook\0${stableJson(value)}`)
