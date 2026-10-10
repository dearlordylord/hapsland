import { type RepeatEditDiagnostic, type DeliveryDraft } from "./model.ts"
import { createHash } from "node:crypto"
import type { CapacityLedger } from "../capacity/operations.ts"
import type { CompletedEditReason } from "@hapsland/canonical-policy/canonical/adapter"

export const deliveryEditIdentity = (
  state: DeliveryDraft,
  canonicalOwner: Pick<CapacityLedger, "transition">,
  reportRepeat: (diagnostic: RepeatEditDiagnostic) => void
) => {
  function editDigest(key: string): string {
    return createHash("sha256").update(key).digest("hex")
  }

  function repeatPending(key: string): void {
    const identityDigest = editDigest(key)
    const pending = state.permits.get(key)
    if (pending === undefined || pending.logged) return
    try {
      reportRepeat({ kind: "repeat-edit-id", phase: "pending", identityDigest })
    } catch {
      // Diagnostics cannot decide whether an edit is admitted.
    }
    pending.logged = true
  }

  function checkCompleted(key: string): boolean {
    const tool = toolId(key)
    const result = canonicalOwner.transition({ kind: "checkCompletedEdit", tool })
    const command = result.outputs[0]
    if (result.rejection !== undefined || command === undefined) throw new Error("invalid Bend completed edit check")
    if (command.kind === "completedEditAbsent") {
      dropTool(key)
      return false
    }
    if (command.kind !== "completedEditSeen") throw new Error("invalid Bend completed edit check")
    if (command.report) {
      try {
        reportRepeat({
          kind: "repeat-edit-id",
          phase: "completed",
          identityDigest: editDigest(key),
          completedReason: command.reason
        })
      } catch {
        // Diagnostics cannot decide whether an edit is admitted.
      }
    }
    return true
  }

  function dropTool(key: string): void {
    const digest = editDigest(key)
    const id = state.toolIds.get(digest)
    if (id !== undefined) state.toolKeys.delete(id)
    state.toolIds.delete(digest)
  }

  function finishPermit(key: string, reason: CompletedEditReason): void {
    state.permits.delete(key)
    const tool = state.toolIds.get(editDigest(key))
    if (tool === undefined) throw new Error("missing completed edit identity")
    const result = canonicalOwner.transition({ kind: "rememberCompletedEdit", tool, reason })
    const command = result.outputs[0]
    if (result.rejection !== undefined || command?.kind !== "completedEditRemembered")
      throw new Error("invalid Bend completed edit record")
    if (command.evicted !== undefined) forgetToolIdentity(command.evicted)
  }

  function forgetToolIdentity(tool: number): void {
    const digest = state.toolKeys.get(tool)
    if (digest === undefined) throw new Error("missing evicted edit identity")
    state.toolKeys.delete(tool)
    state.toolIds.delete(digest)
  }

  function toolId(key: string): number {
    const digest = editDigest(key)
    let id = state.toolIds.get(digest)
    if (id === undefined) {
      id = state.nextToolId++
      state.toolIds.set(digest, id)
      state.toolKeys.set(id, digest)
    }
    return id
  }
  return { repeatPending, checkCompleted, dropTool, finishPermit, toolId }
}
