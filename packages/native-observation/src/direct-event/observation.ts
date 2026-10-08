import type { PathEligibilityReason } from "./selection.ts"
import type { VerifiedPatchHunk } from "./edit-attribution.ts"

export type CodexHostVersion = string
export const isCodexHostVersion = (value: unknown): value is CodexHostVersion =>
  typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value)

export type DirectAdvicee =
  | {
      readonly host: "codex-cli"
      readonly hostVersion: CodexHostVersion
      readonly sessionId: string
      readonly turnId: string
      readonly toolUseId: string
      readonly subagentId: string | null
    }
  | {
      readonly host: "claude-code"
      readonly hostVersion: "2.1.218"
      readonly sessionId: string
      /** Claude 2.1.218 PostToolUse does not provide a turn identifier. */
      readonly turnId: null
      readonly toolUseId: string
      /** Preserve a supplied subagent identity; main-thread hooks may omit it. */
      readonly subagentId: string | null
    }
  | {
      readonly host: "pi"
      readonly hostVersion: "1.0.0"
      readonly sessionId: string
      readonly turnId: null
      readonly toolUseId: string
      readonly subagentId: null
    }
  | {
      readonly host: "opencode"
      readonly hostVersion: "1.14.44"
      readonly sessionId: string
      readonly turnId: null
      readonly toolUseId: string
      readonly subagentId: null
    }

export type AddCandidate = {
  readonly operation: "add"
  readonly path: string
  /** Native patch additions, without the patch marker. */
  readonly addedLines?: ReadonlyArray<string>
}

export type DirectCandidate =
  | AddCandidate
  | { readonly operation: "update"; readonly path: string; readonly addedLines: ReadonlyArray<string> }
  | {
      readonly operation: "delete" | "move"
      readonly path: string
      readonly addedLines: readonly []
      readonly moveTo?: string
    }

export type PhysicalRootIdentity = {
  readonly rootDevice: string
  readonly rootInode: string
  readonly gitDirectory: string
  readonly gitDevice: string
  readonly gitInode: string
}

export type DirectObservation = {
  readonly root: string
  /** Source-free initial native outcomes carried to recording on admission. */
  readonly nativeMetadata?: ReadonlyArray<NativeEditMetadata>
  /** Physical working-tree and Git-administration identity captured at adaptation. */
  readonly rootIdentity: PhysicalRootIdentity
  readonly advicee: DirectAdvicee
  readonly candidates: ReadonlyArray<DirectCandidate>
  /** Root discoveries in native candidate order; null denotes an unsafe or unavailable target. */
  readonly candidateRoots?: ReadonlyArray<{ readonly root: string; readonly rootIdentity: PhysicalRootIdentity } | null>
  /** Bounded Codex patch retained only to verify Update coordinates after capture. */
  readonly nativePatchCommand?: string
  /** Claude's exact pre/post image establishes these ranges for one captured snapshot. */
  readonly verifiedPostEditHunks?: {
    readonly path: string
    readonly contentHash: string
    readonly hunks: ReadonlyArray<VerifiedPatchHunk>
  }
}

/** Native diagnostic facts do not depend on inspection storage or presentation. */
export type NativeSelection =
  | { readonly status: "selected" | "not-evaluated" }
  | {
      readonly status: "excluded"
      readonly diagnostic:
        | {
            readonly stage: "selection"
            readonly code: "file-extension"
            readonly args: { readonly extension: string }
          }
        | {
            readonly stage: "selection"
            readonly code:
              | Exclude<PathEligibilityReason, "file-extension" | "path-observation-unavailable">
              | "unsupported-operation"
            readonly args: {}
          }
    }
  | {
      readonly status: "unavailable"
      readonly diagnostic: {
        readonly stage: "selection"
        readonly code: "path-observation-unavailable" | "edit-policy-unavailable"
        readonly args: {}
      }
    }
export type NativeCandidateMetadata = {
  readonly position: number
  readonly operation: DirectCandidate["operation"]
  readonly path: string
  readonly moveTo?: string
  readonly selection: NativeSelection
}
export type NativeBoundaryDiagnostic =
  | {
      readonly stage: "capture"
      readonly code: "capture-size-limit"
      readonly args: { readonly observedBytes: number; readonly limitBytes: number }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-budget-limit"
      readonly args: {
        readonly resource: "files" | "bytes"
        readonly used: number
        readonly requested: number
        readonly limit: number
      }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-unavailable"
      readonly args: { readonly reason: "missing" | "access" | "io" | "mechanism" | "unknown" }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-unstable"
      readonly args: { readonly checkpoint: "descriptor" | "double-read" }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-validation-failed"
      readonly args: {
        readonly reason:
          | "root-identity"
          | "git-identity"
          | "path-binding"
          | "file-kind"
          | "text-encoding"
          | "source-null-byte"
          | "budget-argument"
      }
    }
  | { readonly stage: "capture"; readonly code: "panic"; readonly args: { readonly boundary: "stable-capture" } }
  | { readonly stage: "observation"; readonly code: "attribution-unavailable"; readonly args: {} }
  | { readonly stage: "admission"; readonly code: "dispatch-unavailable"; readonly args: {} }
export type NativeEditMetadata = {
  readonly root: string
  readonly rootIdentity: PhysicalRootIdentity
  readonly advicee: DirectAdvicee
  readonly candidates: ReadonlyArray<NativeCandidateMetadata>
  readonly admission?: "skipped-other-root"
  readonly diagnostic?: NativeBoundaryDiagnostic
}
