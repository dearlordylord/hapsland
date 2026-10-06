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
  | { readonly operation: "delete" | "move"; readonly path: string; readonly addedLines: readonly [] }

export type PhysicalRootIdentity = {
  readonly rootDevice: string
  readonly rootInode: string
  readonly gitDirectory: string
  readonly gitDevice: string
  readonly gitInode: string
}

export type DirectObservation = {
  readonly root: string
  /** Physical working-tree and Git-administration identity captured at adaptation. */
  readonly rootIdentity: PhysicalRootIdentity
  readonly advicee: DirectAdvicee
  readonly candidates: ReadonlyArray<DirectCandidate>
  /** Bounded Codex patch retained only to verify Update coordinates after capture. */
  readonly nativePatchCommand?: string
  /** Claude's exact pre/post image establishes these ranges for one captured snapshot. */
  readonly verifiedPostEditHunks?: {
    readonly path: string
    readonly contentHash: string
    readonly hunks: ReadonlyArray<VerifiedPatchHunk>
  }
}
