import * as Effect from "effect/Effect"
import { release as releaseCapacityReservation } from "../capacity/reservations.ts"
import { residentAdvice } from "../resident/advice.ts"
import { encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"
import { projectTrustedCanonical } from "@hapsland/canonical-policy/canonical/canonical-boundary"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"

import {
  toOwner,
  fromOwner,
  toOwnerCanonical,
  ownerList,
  ownerSequence
} from "@hapsland/canonical-policy/canonical/child-execution"

/**
 * @param {{ owner: import("@hapsland/agent-flow-bend/canonical-resolver-owner").CanonicalResolverOwner,
 * transaction: import("./provider-authority.ts").NativeTransaction,
 * onActions?: (actions: readonly import("@hapsland/agent-flow-bend/canonical-resolver-owner").Action[]) => Effect.Effect<void>,
 * validateAdviceInput?: (invocation: number, inputHandle: number) => boolean }} options
 */
export function createResidentOwnerTransaction({
  owner,
  transaction,
  onActions = () => Effect.void,
  validateAdviceInput
}) {
  /** @type {Map<number, import("./provider-authority.ts").AdviceReceipt>} */
  const adviceReceipts = new Map()
  /** @type {Map<number, { readonly reservation: import("../capacity/model.ts").CapacityReservation | undefined }>} */
  const sourceReservations = new Map()
  /**
   * @param {import("../capacity/model.ts").CapacityDraft} draft
   * @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Publication} raw
   * @returns {import("./provider-authority.ts").OwnerPublication}
   */
  const publication = (draft, raw) => {
    if (raw.$ === "Refused") return { refusal: raw.refusal, actions: [], outputs: [], raw }
    if (raw.$ !== "Published") throw new TypeError("Malformed resident owner publication")
    const canonical = fromOwner(raw.canonical)
    projectTrustedCanonical(canonical)
    draft.canonical = canonical
    draft.resolverCustody = freezeCanonicalData(raw.custody)
    return { actions: ownerList(raw.actions), outputs: fromOwner(ownerList(raw.outputs)), raw }
  }
  /**
   * @template {{ actions: readonly import("@hapsland/agent-flow-bend/canonical-resolver-owner").Action[] }} A
   * @param {Effect.Effect<A>} effect
   * @param {((publication: A) => void) | undefined} [onCommitted]
   * @returns {Effect.Effect<A>}
   */
  const finish = (effect, onCommitted) =>
    Effect.uninterruptible(
      effect.pipe(
        Effect.flatMap((result) =>
          Effect.sync(() => onCommitted?.(result)).pipe(Effect.ensuring(onActions(result.actions)), Effect.as(result))
        )
      )
    )
  /** @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent} input */
  const committedEvent = (input) =>
    transaction.commitAllEffect((draft, records) => [
      publication(draft, owner.resident_step(toOwnerCanonical(draft.canonical), draft.resolverCustody, input)),
      records
    ])
  /** @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent} input */
  const event = (input) => finish(committedEvent(input))
  /**
   * @param {unknown} value
   * @param {import("./provider-authority.ts").PendingRestore | undefined} pending
   * @returns {import("./provider-authority.ts").NativePublication<unknown>["restoredPending"]}
   */
  const restoredPending = (value, pending) => {
    if (!pending || !value || typeof value !== "object" || !("revision" in value) || !value.revision) return undefined
    const revision = value.revision
    if (
      typeof revision !== "object" ||
      !("subject" in revision) ||
      typeof revision.subject !== "string" ||
      !("token" in revision) ||
      typeof revision.token !== "string" ||
      !("generation" in revision) ||
      typeof revision.generation !== "number"
    )
      throw new TypeError("Malformed restored native revision")
    return {
      pendingOwnerIdentity: pending.owner,
      revision: /** @type {import("../revision.ts").WorkRevision} */ (revision)
    }
  }
  // Existing native capacity operations run once. Their resulting state and child
  // invalidation are published by the same actual resident commitAllEffect.
  /**
   * @template A
   * @param {import("./provider-authority.ts").NativeOperation<A>} operation
   * @param {import("./provider-authority.ts").ProviderLease | undefined} [credential]
   * @param {import("./provider-authority.ts").CommitReceipt | undefined} [onCommitted]
   * @param {import("./provider-authority.ts").PendingRestore | undefined} [pendingRestore]
   * @param {(import("./provider-authority.ts").AdviceBinding & { permission: import("@hapsland/agent-flow-bend/canonical-resolver-owner").AdvicePermission }) | undefined} [adviceTail]
   * @param {{ initial: import("../advice-records.ts").AdviceInitial, inputHandle: number } | undefined} [adviceBirth]
   * @param {import("./provider-authority.ts").AdviceBinding | undefined} [cleanupAdvice]
   * @param {{ readonly reservation: import("../capacity/model.ts").CapacityReservation | undefined } | undefined} [sourceRelease]
   * @returns {Effect.Effect<import("./provider-authority.ts").NativePublication<A>>}
   */
  const nativeCommit = (
    operation,
    credential,
    onCommitted,
    pendingRestore,
    adviceTail,
    adviceBirth,
    cleanupAdvice,
    sourceRelease
  ) =>
    finish(
      transaction.commitAllEffect((draft, records) => {
        if (
          adviceBirth &&
          (!credential ||
            !validateAdviceInput ||
            validateAdviceInput(credential.invocation, adviceBirth.inputHandle) !== true)
        )
          throw new Error("Advice input is not owned by its origin")
        if (
          credential &&
          !owner.provider_live(
            owner.assembled(toOwnerCanonical(draft.canonical), draft.resolverCustody),
            credential.invocation,
            credential.generation,
            credential.lease,
            credential.request
          )
        )
          throw new Error("Revoked resident provider permit")
        const child = credential ? owner.find(credential.invocation, draft.resolverCustody.children) : undefined
        if (
          child?.$ === "Some" &&
          child.value.scope.$ === "SourceScope" &&
          ["SourceObservation", "SourceStartObservation"].includes(child.value.scope.permission.$)
        )
          throw new Error("Source observation completion requires its closed operation")
        if (
          sourceRelease &&
          (!credential ||
            child?.$ !== "Some" ||
            child.value.scope.$ !== "AfterSourceScope" ||
            child.value.scope.permission.$ !== "AfterRecoveryRelease" ||
            sourceReservations.get(credential.invocation) !== sourceRelease)
        )
          throw new Error("Invalid original source reservation release")
        if (child?.$ === "Some" && child.value.scope.$ === "AfterSourceScope" && !sourceRelease)
          throw new Error("After source continuation forbids native mutations")
        const tailScope =
          child?.$ === "Some" && child.value.scope.$ === "AdviceTailScope" ? child.value.scope : undefined
        if (tailScope) {
          if (
            !credential ||
            !adviceTail ||
            !owner.advice_provider_allowed(
              owner.assembled(toOwnerCanonical(draft.canonical), draft.resolverCustody),
              credential.invocation,
              credential.generation,
              credential.lease,
              credential.request,
              adviceTail.permission
            )
          )
            throw new Error("Advice tail requires a closed capability operation")
          const capability = adviceTail.capability
          if (adviceReceipts.get(credential.invocation)?.capability !== capability)
            throw new Error("Advice capability differs from issued tail receipt")
          if (
            tailScope.partition !== Number(BigInt(draft.partitionIds.get(capability.partition) ?? 0)) ||
            tailScope.lifetime !== adviceReceipts.get(credential.invocation)?.scope.lifetime ||
            tailScope.round !== Number(BigInt(capability.canonicalRound)) ||
            tailScope.operation !== Number(BigInt(capability.canonicalOperationId))
          )
            throw new Error("Advice capability differs from issued tail scope")
        } else if (adviceTail) throw new Error("Closed advice operation requires tail authority")
        if (pendingRestore && records.reuse.pending.get(pendingRestore.key) !== pendingRestore.owner)
          throw new Error("Pending revision owner changed before commit")
        // Observe every assignment, including reset -> recreation in one callback.
        // This prototype interception is replaced by closed production capacity calls.
        let canonical = draft.canonical
        /** @type {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Action[]} */
        const actions = []
        Object.defineProperty(draft, "canonical", {
          configurable: true,
          enumerable: true,
          get: () => canonical,
          set: (next) => {
            const raw = owner.resident_reconcile(toOwnerCanonical(next), draft.resolverCustody)
            if (raw.$ !== "Published") throw new TypeError("Malformed native reconciliation")
            projectTrustedCanonical(next)
            canonical = next
            draft.resolverCustody = freezeCanonicalData(raw.custody)
            actions.push(...ownerList(raw.actions))
          }
        })
        let value, nextRecords
        try {
          ;[value, nextRecords] = operation(draft, records)
        } finally {
          Object.defineProperty(draft, "canonical", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: canonical
          })
        }
        const reconciled = publication(
          draft,
          owner.resident_reconcile(toOwnerCanonical(canonical), draft.resolverCustody)
        )
        let result = reconciled
        /** @type {import("./provider-authority.ts").AdviceReceipt | undefined} */
        let adviceReceipt
        if (adviceBirth) {
          const inserted = nextRecords.advice.entries.get(adviceBirth.initial.id)?.capability
          if (
            !credential ||
            !inserted ||
            inserted !== value ||
            inserted.reservation !== adviceBirth.initial.reservation ||
            inserted.revision !== adviceBirth.initial.revision
          )
            throw new Error("Advice insertion changed resource identity")
          result = publication(
            draft,
            owner.resident_step(toOwnerCanonical(draft.canonical), draft.resolverCustody, {
              $: "HandoffAdviceEvent",
              ...credential,
              operation: Number(BigInt(inserted.canonicalOperationId)),
              input_handle: adviceBirth.inputHandle
            })
          )
          if (result.refusal) throw new Error("Atomic advice handoff refused: " + result.refusal.$)
          const launch = result.actions.find((action) => action.$ === "LaunchAdviceTail")
          if (!launch) throw new Error("Advice handoff did not issue a child")
          const child = owner.find(launch.invocation, draft.resolverCustody.children)
          if (child.$ !== "Some" || child.value.scope.$ !== "AdviceTailScope")
            throw new Error("Advice handoff issued invalid custody")
          adviceReceipt = Object.freeze({
            invocation: launch.invocation,
            origin: credential.invocation,
            inputHandle: adviceBirth.inputHandle,
            capability: inserted,
            scope: freezeCanonicalData(child.value.scope)
          })
        }
        const ownershipBinding = adviceTail ?? cleanupAdvice
        const joined = [...actions, ...reconciled.actions, ...(adviceBirth ? result.actions : [])]
        const bendList = ownerSequence(joined)
        return [
          {
            ...result,
            adviceReceipt,
            adviceOwnership: ownershipBinding
              ? Object.freeze({
                  capability: ownershipBinding.capability,
                  presentBefore:
                    records.advice.entries.get(ownershipBinding.capability.id)?.capability ===
                    ownershipBinding.capability,
                  presentAfter:
                    nextRecords.advice.entries.get(ownershipBinding.capability.id)?.capability ===
                    ownershipBinding.capability,
                  removed: value === true,
                  findings:
                    value === true
                      ? records.advice.entries.get(ownershipBinding.capability.id)?.content.findings
                      : undefined,
                  retirement: ownershipBinding.retirement
                })
              : undefined,
            actions: joined,
            raw: { ...result.raw, actions: bendList },
            value,
            restoredPending: restoredPending(value, pendingRestore),
            claimedKeys:
              credential && nextRecords.reuse
                ? [...nextRecords.reuse.pending.keys()].filter((key) => !records.reuse.pending.has(key))
                : [],
            transferredUnits:
              credential && nextRecords.dispatch
                ? [...nextRecords.dispatch.entries]
                    .filter(([id]) => !records.dispatch.entries.has(id))
                    .map(([, entry]) => entry.value)
                : []
          },
          nextRecords
        ]
      }),
      (publication) => {
        if (publication.adviceReceipt)
          adviceReceipts.set(publication.adviceReceipt.invocation, publication.adviceReceipt)
        onCommitted?.(publication)
      }
    )
  /**
   * @param {import("./provider-authority.ts").ProviderLease} credential
   * @param {((publication: import("./provider-authority.ts").OwnerPublication) => void) | undefined} [onCommitted]
   */
  const startSourceObservation = (credential, onCommitted) =>
    finish(
      transaction.commitAllEffect((draft, records) => {
        const raw = owner.resident_step(toOwnerCanonical(draft.canonical), draft.resolverCustody, {
          $: "StartSourceObservationEvent",
          ...credential
        })
        return [publication(draft, raw), records]
      }),
      (result) => {
        if (!result.refusal) onCommitted?.(result)
      }
    )
  /**
   * @param {import("./provider-authority.ts").ProviderLease} credential
   * @param {((publication: import("./provider-authority.ts").OwnerPublication) => void) | undefined} [onCommitted]
   */
  const completeSourceObservation = (credential, onCommitted) =>
    finish(
      transaction.commitAllEffect((draft, records) => {
        const raw = owner.resident_step(toOwnerCanonical(draft.canonical), draft.resolverCustody, {
          $: "CompleteSourceObservationEvent",
          ...credential
        })
        if (raw.$ === "Refused") throw new Error("Source observation completion refused: " + raw.refusal.$)
        return [publication(draft, raw), records]
      }),
      onCommitted
    )
  /**
   * @param {number} invocation
   * @param {import("../capacity/model.ts").CapacityReservation | undefined} reservation
   */
  const bindSourceReservation = (invocation, reservation) => {
    const snapshot = Effect.runSync(transaction.read)
    const child = owner.find(invocation, snapshot.resolverCustody.children)
    if (
      sourceReservations.has(invocation) ||
      (child.$ === "Some" &&
        (child.value.scope.$ !== "SourceScope" ||
          child.value.scope.permission.$ !== "SourceNew" ||
          child.value.phase.$ !== "ChildInstalling" ||
          child.value.generation !== 0 ||
          child.value.lease.$ !== "None"))
    )
      throw new Error("Source reservation must bind before invocation launch")
    sourceReservations.set(invocation, Object.freeze({ reservation }))
  }
  /** @param {number} invocation */
  const forgetSourceReservation = (invocation) => {
    const snapshot = Effect.runSync(transaction.read),
      child = owner.find(invocation, snapshot.resolverCustody.children),
      receipt = sourceReservations.get(invocation)
    if (child.$ === "Some" && (owner.child_active(child.value) || child.value.lease.$ !== "None"))
      throw new Error("Source authority remains active")
    if (receipt?.reservation && snapshot.reservations.get(receipt.reservation.id)?.capability === receipt.reservation)
      throw new Error("Original source reservation remains owned")
    return sourceReservations.delete(invocation)
  }
  /**
   * @param {import("./provider-authority.ts").ProviderLease} credential
   * @param {import("./provider-authority.ts").CommitReceipt | undefined} [onCommitted]
   */
  const releaseSourceReservation = (credential, onCommitted) => {
    const receipt = sourceReservations.get(credential.invocation)
    if (!receipt) throw new Error("Source reservation not bound")
    return nativeCommit(
      (draft, records) => [
        receipt.reservation === undefined ? false : releaseCapacityReservation(draft, receipt.reservation),
        records
      ],
      credential,
      onCommitted,
      undefined,
      undefined,
      undefined,
      undefined,
      receipt
    )
  }
  /** @type {import("./provider-authority.ts").ProviderCommitBridge["native"]} */
  const native = (operation, onCommitted) => nativeCommit(operation, undefined, onCommitted)
  /** @type {import("./provider-authority.ts").ProviderCommitBridge["nativeScoped"]} */
  const nativeScoped = (credential, operation, onCommitted) => nativeCommit(operation, credential, onCommitted)
  /** @type {import("./provider-authority.ts").ProviderCommitBridge["nativeRestorePending"]} */
  const nativeRestorePending = (credential, pendingOwner, operation, onCommitted) =>
    nativeCommit(operation, credential, onCommitted, pendingOwner)
  // Closed effect bindings: callers cannot supply a native transaction callback.
  /**
   * @param {import("./provider-authority.ts").ProviderLease} credential
   * @param {import("../advice-records.ts").Advice} capability
   * @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").AdvicePermission} permission
   * @param {import("./provider-authority.ts").CommitReceipt | undefined} onCommitted
   * @param {import("../../review-work/preparation/post-preparation-core.js").AdviceRetirement | undefined} [retirement]
   */
  const adviceTailBinding = (credential, capability, permission, onCommitted, retirement) =>
    residentAdvice({
      ...transaction,
      commitAllEffect: (operation) =>
        nativeCommit(operation, credential, onCommitted, undefined, { capability, permission, retirement }).pipe(
          Effect.map((result) => result.value)
        )
    })
  /**
   * @param {import("./provider-authority.ts").ProviderLease} credential
   * @param {import("../advice-records.ts").AdviceInitial} initial
   * @param {number} inputHandle
   * @param {import("./provider-authority.ts").CommitReceipt | undefined} [onCommitted]
   */
  const adviceInsertAndHandoff = (credential, initial, inputHandle, onCommitted) => {
    if (!credential || typeof inputHandle !== "number" || inputHandle < 1)
      throw new Error("Advice birth requires provider credential and opaque input handle")
    return residentAdvice({
      ...transaction,
      commitAllEffect: (operation) =>
        nativeCommit(operation, credential, onCommitted, undefined, undefined, { initial, inputHandle }).pipe(
          Effect.map((result) => result.value)
        )
    }).insert(initial)
  }
  /**
   * @param {import("./provider-authority.ts").ProviderLease} credential
   * @param {import("../advice-records.ts").Advice} capability
   * @param {import("./provider-authority.ts").CommitReceipt | undefined} [onCommitted]
   */
  const adviceTailPublish = (credential, capability, onCommitted) =>
    adviceTailBinding(credential, capability, { $: "TailPublish" }, onCommitted).publish(capability)
  /** @param {import("../../review-work/preparation/post-preparation-core.js").AdviceRetirement} retirement */
  const retirementReason = (retirement) => {
    if (retirement.$ === "ExpiredRetirement") return "expired"
    if (retirement.$ === "RetentionFailureRetirement") return "stale"
    throw new Error("Invalid advice retirement")
  }
  /**
   * @param {import("./provider-authority.ts").ProviderLease} credential
   * @param {import("../advice-records.ts").Advice} capability
   * @param {import("./provider-authority.ts").CommitReceipt | undefined} onCommitted
   * @param {import("../../review-work/preparation/post-preparation-core.js").AdviceRetirement} [retirement]
   */
  const adviceTailRemove = (credential, capability, onCommitted, retirement = { $: "RetentionFailureRetirement" }) => {
    /** @type {import("./provider-authority.ts").AdviceOwnership | undefined} */
    let ownership
    return adviceTailBinding(
      credential,
      capability,
      { $: "TailRemove" },
      (publication) => {
        ownership = publication.adviceOwnership
        onCommitted?.(publication)
      },
      retirement
    )
      .remove(capability, retirementReason(retirement))
      .pipe(Effect.map((removed) => ({ removed, absent: ownership?.presentAfter === false })))
  }
  // A registry finalizer can remove only its exact capability after the lease ends.
  // Native advice.remove confirms absence without touching a replacement identity.
  /**
   * @param {import("../advice-records.ts").Advice} capability
   * @param {import("./provider-authority.ts").CommitReceipt | undefined} onCommitted
   * @param {import("../../review-work/preparation/post-preparation-core.js").AdviceRetirement} [retirement]
   */
  const adviceCleanup = (capability, onCommitted, retirement = { $: "RetentionFailureRetirement" }) =>
    residentAdvice({
      ...transaction,
      commitAllEffect: (operation) =>
        nativeCommit(operation, undefined, onCommitted, undefined, undefined, undefined, {
          capability,
          retirement
        }).pipe(Effect.map((result) => result.value))
    }).remove(capability, retirementReason(retirement))
  /**
   * @param {import("./provider-authority.ts").OwnerPublication} result
   * @returns {import("./provider-authority.ts").ControlledStep}
   */
  const ownerStep = (result) =>
    result.raw.$ === "Refused"
      ? { $: "Rejected", refusal: result.raw.refusal }
      : { $: "Advanced", actions: result.raw.actions, outputs: result.raw.outputs }
  const methods = {
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchEvent" }> ["scope"]} scope
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchEvent" }> ["input_handle"]} input_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchEvent" }>}
     */
    launch: (scope, input_handle) => ({ $: "LaunchEvent", scope, input_handle }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSettingsEvent" }> ["input_handle"]} input_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSettingsEvent" }>}
     */
    launch_settings: (input_handle) => ({ $: "LaunchSettingsEvent", input_handle }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchFreshnessEvent" }> ["input_handle"]} input_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchFreshnessEvent" }>}
     */
    launch_freshness: (input_handle) => ({ $: "LaunchFreshnessEvent", input_handle }),
    /** @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").DeliveryContext} context @param {number} input_handle @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, {$: "LaunchCollectionEvent"}>} */
    launch_collection: (context, input_handle) => ({ $: "LaunchCollectionEvent", context, input_handle }),
    /** @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").DeliveryReceipt} receipt @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, {$: "ClaimDeliveryEvent"}>} */
    claim_delivery: (receipt) => ({ $: "ClaimDeliveryEvent", receipt }),
    /** @param {number} invocation @param {number} generation @param {number} result_handle @param {import("@hapsland/agent-flow-bend/canonical-resolver-owner").DeliverySelection} selection @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, {$: "CompleteDeliveryEvent"}>} */
    complete_delivery: (invocation, generation, result_handle, selection) => ({
      $: "CompleteDeliveryEvent",
      invocation,
      generation,
      result_handle,
      selection
    }),

    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSourceEvent" }> ["scope"]} scope
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSourceEvent" }> ["input_handle"]} input_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSourceEvent" }>}
     */
    launch_source: (scope, input_handle) => ({ $: "LaunchSourceEvent", scope, input_handle }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSourcePreparationEvent" }> ["parent"]} parent
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSourcePreparationEvent" }> ["scope"]} scope
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSourcePreparationEvent" }> ["input_handle"]} input_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchSourcePreparationEvent" }>}
     */
    launch_source_preparation: (parent, scope, input_handle) => ({
      $: "LaunchSourcePreparationEvent",
      parent,
      scope,
      input_handle
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAfterSourceEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAfterSourceEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAfterSourceEvent" }> ["handle"]} handle
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAfterSourceEvent" }> ["request"]} request
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAfterSourceEvent" }> ["permission"]} permission
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAfterSourceEvent" }>}
     */
    install_after_source: (invocation, generation, handle, request, permission) => ({
      $: "InstallAfterSourceEvent",
      invocation,
      generation,
      handle,
      request,
      permission
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallSourceEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallSourceEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallSourceEvent" }> ["handle"]} handle
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallSourceEvent" }> ["request"]} request
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallSourceEvent" }> ["permission"]} permission
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallSourceEvent" }>}
     */
    install_source: (invocation, generation, handle, request, permission) => ({
      $: "InstallSourceEvent",
      invocation,
      generation,
      handle,
      request,
      permission
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchPreparationEvent" }> ["scope"]} scope
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchPreparationEvent" }> ["input_handle"]} input_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchPreparationEvent" }>}
     */
    launch_preparation: (scope, input_handle) => ({ $: "LaunchPreparationEvent", scope, input_handle }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationEvent" }> ["result_handle"]} result_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationEvent" }>}
     */
    terminal_preparation: (invocation, generation, result_handle) => ({
      $: "TerminalPreparationEvent",
      invocation,
      generation,
      result_handle
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalSourceFailedEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalSourceFailedEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalSourceFailedEvent" }> ["result_handle"]} result_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalSourceFailedEvent" }>}
     */
    terminal_source_failed: (invocation, generation, result_handle) => ({
      $: "TerminalSourceFailedEvent",
      invocation,
      generation,
      result_handle
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationFailedEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationFailedEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationFailedEvent" }> ["result_handle"]} result_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalPreparationFailedEvent" }>}
     */
    terminal_preparation_failed: (invocation, generation, result_handle) => ({
      $: "TerminalPreparationFailedEvent",
      invocation,
      generation,
      result_handle
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchNestedEvent" }> ["parent"]} parent
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchNestedEvent" }> ["input_handle"]} input_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "LaunchNestedEvent" }>}
     */
    launch_nested: (parent, input_handle) => ({ $: "LaunchNestedEvent", parent, input_handle }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallEvent" }> ["handle"]} handle
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallEvent" }> ["request"]} request
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallEvent" }>}
     */
    install: (invocation, generation, handle, request) => ({
      $: "InstallEvent",
      invocation,
      generation,
      handle,
      request
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAdviceEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAdviceEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAdviceEvent" }> ["handle"]} handle
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAdviceEvent" }> ["request"]} request
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAdviceEvent" }> ["permission"]} permission
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "InstallAdviceEvent" }>}
     */
    install_advice: (invocation, generation, handle, request, permission) => ({
      $: "InstallAdviceEvent",
      invocation,
      generation,
      handle,
      request,
      permission
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "ProviderStartEvent" }> ["invocation"]} invocation
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "ProviderStartEvent" }>}
     */
    provider_start: (invocation) => ({ $: "ProviderStartEvent", invocation }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "ProviderCompletedEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "ProviderCompletedEvent" }> ["lease"]} lease
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "ProviderCompletedEvent" }> ["request"]} request
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "ProviderCompletedEvent" }> ["reply_handle"]} reply_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "ProviderCompletedEvent" }>}
     */
    provider_completed: (invocation, lease, request, reply_handle) => ({
      $: "ProviderCompletedEvent",
      invocation,
      lease,
      request,
      reply_handle
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "CancelEvent" }> ["invocation"]} invocation
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "CancelEvent" }>}
     */
    cancel: (invocation) => ({ $: "CancelEvent", invocation }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalAdvicePreservedEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalAdvicePreservedEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalAdvicePreservedEvent" }> ["result_handle"]} result_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalAdvicePreservedEvent" }>}
     */
    terminal_advice_preserved: (invocation, generation, result_handle) => ({
      $: "TerminalAdvicePreservedEvent",
      invocation,
      generation,
      result_handle
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalEvent" }> ["invocation"]} invocation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalEvent" }> ["generation"]} generation
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalEvent" }> ["result_handle"]} result_handle
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "TerminalEvent" }>}
     */
    terminal: (invocation, generation, result_handle) => ({
      $: "TerminalEvent",
      invocation,
      generation,
      result_handle
    }),
    /**
     * @param {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "CanonicalEvent" }> ["event"]} event
     * @returns {Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent, { $: "CanonicalEvent" }>}
     */
    canonical_event: (event) => ({ $: "CanonicalEvent", event })
  }
  // Synchronous driver calls are serialized through the actual Ref transaction.
  // readState assembles a transient call snapshot; the driver stores no C.State.
  const control = {
    /** @param {number} invocation */
    readActive(invocation) {
      const snapshot = Effect.runSync(transaction.read)
      return owner.active_reader(snapshot.resolverCustody.children).query(invocation)
    },
    /** @returns {import("@hapsland/agent-flow-bend/canonical-resolver-owner").State} */
    readState() {
      const snapshot = Effect.runSync(transaction.read)
      return owner.assembled(toOwnerCanonical(snapshot.canonical), snapshot.resolverCustody)
    },
    /**
     * @template {keyof typeof methods} Method
     * @param {Method} method
     * @param {import("@hapsland/canonical-policy/canonical/child-execution").Arguments<Method>} args
     */
    invoke(method, args) {
      if (!Object.hasOwn(methods, method)) throw new Error("Unknown resident owner entry")
      // The checked method table correlates each name with its exact event fields.
      // Preserve that generic correlation where indexed union call inference loses it.
      const makeEvent =
        /** @type {(...args: import("@hapsland/canonical-policy/canonical/child-execution").Arguments<Method>) => import("@hapsland/agent-flow-bend/canonical-resolver-owner").ResidentEvent} */ (
          methods[method]
        )
      return ownerStep(Effect.runSync(committedEvent(makeEvent(...args))))
    }
  }
  return {
    read: transaction.read,
    event,
    bindSourceReservation,
    forgetSourceReservation,
    releaseSourceReservation,
    startSourceObservation,
    completeSourceObservation,
    native,
    nativeScoped,
    nativeRestorePending,
    adviceInsertAndHandoff,
    get adviceReceipts() {
      return [...adviceReceipts.values()]
    },
    adviceTailPublish,
    adviceTailRemove,
    adviceCleanup,
    control,
    ownerStep,
    /** @param {import("@hapsland/canonical-policy/canonical/adapter").CanonicalEvent} input */
    canonical: (input) => event({ $: "CanonicalEvent", event: toOwner(encodeCanonicalEvent(input)) })
  }
}
