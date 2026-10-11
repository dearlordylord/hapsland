import { Schema } from "effect"
import { type JsonObject } from "./configuration-values.ts"

export class CodexInstallationError extends Schema.TaggedError<CodexInstallationError>()("CodexInstallationError", {
  reason: Schema.NonEmptyString
}) {
  override get message() {
    return this.reason
  }
}

export const RESULT_VERSION = 1 as const

export interface InstallationRequest {
  readonly codexHome?: string
  readonly proposalDigest?: string
  readonly codexExecutable?: string
  readonly reinstall?: boolean
}

export type InstallationResult =
  | JsonObject
  | { readonly version: 1; readonly operation: string; readonly status: string }
