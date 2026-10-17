import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type * as C from "../collection-core.js"
import type * as H from "./handoff-core.js"

// Imported Bend constructors carry their source owner; Base constructors do not.
export type Imported<Value, Owner extends string> = Value extends object
  ? {
      readonly [Key in keyof Value]: Key extends "$"
        ? Value[Key] extends "Nil" | "Con" | "Some" | "None"
          ? Value[Key]
          : Value[Key] extends string
            ? `${Owner}${Value[Key]}`
            : Value[Key]
        : Imported<Value[Key], Owner>
    }
  : Value

export function decodeGCommand(value: Imported<H.GCommand, "Handoff.">): H.GCommand {
  switch (value.$) {
    case "Handoff.GOwnStop":
      return { ...value, $: "GOwnStop" }
    case "Handoff.GPruneNotices":
      return { ...value, $: "GPruneNotices" }
    case "Handoff.GAdvice":
      return { ...value, $: "GAdvice" }
    case "Handoff.GRound":
      return { ...value, $: "GRound" }
    case "Handoff.GTotalUnfinished":
      return { ...value, $: "GTotalUnfinished" }
    case "Handoff.GOwnUnfinished":
      return { ...value, $: "GOwnUnfinished" }
    case "Handoff.GDiscard":
      return { ...value, $: "GDiscard" }
    case "Handoff.GExpired":
      return { ...value, $: "GExpired" }
    case "Handoff.GRelease":
      return { ...value, $: "GRelease" }
    case "Handoff.GGate":
      return { ...value, $: "GGate" }
    case "Handoff.GAllow":
      return {
        ...value,
        $: "GAllow",
        reason: value.reason.$ === "Handoff.GLimit" ? { $: "GLimit" } : { $: "GUnavailable" }
      }
  }
}

export function encodeGResponse(value: H.GResponse): Imported<H.GResponse, "Handoff."> {
  switch (value.$) {
    case "GAck":
      return { ...value, $: "Handoff.GAck" }
    case "GNoGate":
      return { ...value, $: "Handoff.GNoGate" }
    case "GWaiting":
      return { ...value, $: "Handoff.GWaiting" }
    case "GTruth":
      return { ...value, $: "Handoff.GTruth" }
    case "GLeases":
      return {
        ...value,
        $: "Handoff.GLeases",
        leases: list(unlist(value.leases).map((item) => ({ ...item, $: "Handoff.GLease" })))
      }
    case "GCount":
      return { ...value, $: "Handoff.GCount" }
    case "GCutoff":
      return { ...value, $: "Handoff.GCutoff" }
  }
}

export function decodeRCommand(value: Imported<H.RCommand, "Handoff.">): H.RCommand {
  switch (value.$) {
    case "Handoff.RRevoke":
      return { ...value, $: "RRevoke" }
    case "Handoff.RRound":
      return { ...value, $: "RRound" }
    case "Handoff.RSnapshots":
      return { ...value, $: "RSnapshots" }
    case "Handoff.RPendingFindings":
      return { ...value, $: "RPendingFindings" }
    case "Handoff.RClock":
      return { ...value, $: "RClock" }
    case "Handoff.RDecide":
      return { ...value, $: "RDecide" }
    case "Handoff.RRelease":
      return { ...value, $: "RRelease" }
    case "Handoff.RAllow":
      return { ...value, $: "RAllow", reason: decodeRReason(value.reason) }
  }
}

export function encodeRResponse(value: H.RResponse): Imported<H.RResponse, "Handoff."> {
  switch (value.$) {
    case "RAck":
      return { ...value, $: "Handoff.RAck" }
    case "RTruth":
      return { ...value, $: "Handoff.RTruth" }
    case "RSnapshotValues":
      return {
        ...value,
        $: "Handoff.RSnapshotValues",
        values: list(unlist(value.values).map((item) => ({ ...item, $: "Handoff.RSnapshot" })))
      }
    case "RPendingValues":
      return {
        ...value,
        $: "Handoff.RPendingValues",
        values: list(unlist(value.values).map((item) => ({ ...item, $: "Handoff.RPending" })))
      }
    case "RDecided":
      return { ...value, $: "Handoff.RDecided", decision: encodeRDecision(value.decision) }
  }
}

export function decodeRReason(value: Imported<H.RReason, "Handoff.">): H.RReason {
  switch (value.$) {
    case "Handoff.RNoAdvice":
      return { ...value, $: "RNoAdvice" }
    case "Handoff.RDeadline":
      return { ...value, $: "RDeadline" }
    case "Handoff.RUnavailable":
      return { ...value, $: "RUnavailable" }
  }
}

export function encodeRReason(value: H.RReason): Imported<H.RReason, "Handoff."> {
  switch (value.$) {
    case "RNoAdvice":
      return { ...value, $: "Handoff.RNoAdvice" }
    case "RDeadline":
      return { ...value, $: "Handoff.RDeadline" }
    case "RUnavailable":
      return { ...value, $: "Handoff.RUnavailable" }
  }
}

export function encodeRDecision(value: H.RDecision): Imported<H.RDecision, "Handoff."> {
  switch (value.$) {
    case "RReserved":
      return { ...value, $: "Handoff.RReserved" }
    case "RFailed":
      return { ...value, $: "Handoff.RFailed" }
    case "RNotices":
      return { ...value, $: "Handoff.RNotices" }
    case "RAllowed":
      return { ...value, $: "Handoff.RAllowed", reason: encodeRReason(value.reason) }
  }
}

export function decodeCommand(value: Imported<C.Command, "../Collection.">): C.Command {
  switch (value.$) {
    case "../Collection.AllocateToken":
      return { ...value, $: "AllocateToken" }
    case "../Collection.OpenFresh":
      return { ...value, $: "OpenFresh" }
    case "../Collection.PullFresh":
      return { ...value, $: "PullFresh" }
    case "../Collection.CloseStream":
      return { ...value, $: "CloseStream" }
    case "../Collection.Reserve":
      return { ...value, $: "Reserve" }
    case "../Collection.ReadDelivery":
      return { ...value, $: "ReadDelivery" }
    case "../Collection.RemoveStale":
      return { ...value, $: "RemoveStale" }
    case "../Collection.Remove":
      return { ...value, $: "Remove" }
    case "../Collection.Barrier":
      return { ...value, $: "Barrier" }
    case "../Collection.OpenRetained":
      return { ...value, $: "OpenRetained" }
    case "../Collection.CheckWork":
      return { ...value, $: "CheckWork" }
    case "../Collection.RecordLimited":
      return { ...value, $: "RecordLimited" }
    case "../Collection.Release":
      return { ...value, $: "Release" }
    case "../Collection.PullRetained":
      return { ...value, $: "PullRetained" }
    case "../Collection.OpenFindings":
      return { ...value, $: "OpenFindings" }
    case "../Collection.PullFinding":
      return { ...value, $: "PullFinding" }
    case "../Collection.Suppressed":
      return { ...value, $: "Suppressed" }
    case "../Collection.ObserveSuppressed":
      return { ...value, $: "ObserveSuppressed" }
    case "../Collection.Fit":
      return { ...value, $: "Fit" }
    case "../Collection.PostCheck":
      return { ...value, $: "PostCheck" }
    case "../Collection.Update":
      return { ...value, $: "Update" }
  }
}

export function encodeResponse(value: C.Response): Imported<C.Response, "../Collection."> {
  switch (value.$) {
    case "Ack":
      return { ...value, $: "../Collection.Ack" }
    case "Exhausted":
      return { ...value, $: "../Collection.Exhausted" }
    case "Handle":
      return { ...value, $: "../Collection.Handle" }
    case "Fresh":
      return { ...value, $: "../Collection.Fresh" }
    case "Owner":
      return { ...value, $: "../Collection.Owner" }
    case "Content":
      return { ...value, $: "../Collection.Content" }
    case "Truth":
      return { ...value, $: "../Collection.Truth" }
    case "Fitting":
      return { ...value, $: "../Collection.Fitting" }
    case "Route":
      return { ...value, $: "../Collection.Route", disposition: encodeDisposition(value.disposition) }
  }
}

export function encodeDisposition(value: C.Disposition): Imported<C.Disposition, "../Collection."> {
  switch (value.$) {
    case "Retain":
      return { ...value, $: "../Collection.Retain" }
    case "Retire":
      return { ...value, $: "../Collection.Retire" }
    case "ReleaseCandidate":
      return { ...value, $: "../Collection.ReleaseCandidate" }
    case "Other":
      return { ...value, $: "../Collection.Other" }
  }
}

export function decodeFlowCommand(value: Imported<C.FlowCommand, "../Collection.">): C.FlowCommand {
  switch (value.$) {
    case "../Collection.CReadCredential":
      return { ...value, $: "CReadCredential" }
    case "../Collection.CCredentialMetadata":
      return { ...value, $: "CCredentialMetadata" }
    case "../Collection.CCaptureFrame":
      return { ...value, $: "CCaptureFrame" }
    case "../Collection.CReadDeciding":
      return { ...value, $: "CReadDeciding" }
    case "../Collection.CExpirePending":
      return { ...value, $: "CExpirePending" }
    case "../Collection.CPruneNotices":
      return { ...value, $: "CPruneNotices" }
    case "../Collection.CCaptureCredential":
      return { ...value, $: "CCaptureCredential" }
    case "../Collection.COpenSnapshots":
      return { ...value, $: "COpenSnapshots" }
    case "../Collection.CHandoffClock":
      return { ...value, $: "CHandoffClock" }
    case "../Collection.CSetStop":
      return { ...value, $: "CSetStop" }
    case "../Collection.COpenAdvice":
      return { ...value, $: "COpenAdvice" }
    case "../Collection.CPullAdvice":
      return { ...value, $: "CPullAdvice" }
    case "../Collection.CPullSnapshot":
      return { ...value, $: "CPullSnapshot" }
    case "../Collection.CCheckCredential":
      return { ...value, $: "CCheckCredential" }
    case "../Collection.CRemoveCredential":
      return { ...value, $: "CRemoveCredential" }
    case "../Collection.CCheckLease":
      return { ...value, $: "CCheckLease" }
    case "../Collection.CSetEligibility":
      return { ...value, $: "CSetEligibility" }
    case "../Collection.CReadEligibility":
      return { ...value, $: "CReadEligibility" }
    case "../Collection.CCheckExpiry":
      return { ...value, $: "CCheckExpiry" }
    case "../Collection.CHandoffOffers":
      return { ...value, $: "CHandoffOffers" }
    case "../Collection.CDeliveryFindings":
      return { ...value, $: "CDeliveryFindings" }
    case "../Collection.CResponseContent":
      return { ...value, $: "CResponseContent" }
    case "../Collection.CCandidateFacts":
      return { ...value, $: "CCandidateFacts" }
    case "../Collection.CResponseFindings":
      return { ...value, $: "CResponseFindings" }
    case "../Collection.CCandidateCheck":
      return { ...value, $: "CCandidateCheck" }
    case "../Collection.CCompare":
      return { ...value, $: "CCompare" }
    case "../Collection.CPrimitive":
      return { ...value, $: "CPrimitive", command: decodeCommand(value.command) }
    case "../Collection.CPullOwner":
      return { ...value, $: "CPullOwner" }
    case "../Collection.CHandoffInfo":
      return { ...value, $: "CHandoffInfo" }
    case "../Collection.CFinalRoute":
      return { ...value, $: "CFinalRoute" }
    case "../Collection.CRenew":
      return { ...value, $: "CRenew" }
    case "../Collection.CFitHandoff":
      return { ...value, $: "CFitHandoff" }
    case "../Collection.CHandoffLimited":
      return { ...value, $: "CHandoffLimited" }
  }
}

export function encodeFlowResponse(value: C.FlowResponse): Imported<C.FlowResponse, "../Collection."> {
  switch (value.$) {
    case "RCredentialMetadata":
      return { ...value, $: "../Collection.RCredentialMetadata" }
    case "RCredentialState":
      return { ...value, $: "../Collection.RCredentialState" }
    case "RAck":
      return { ...value, $: "../Collection.RAck" }
    case "RExhausted":
      return { ...value, $: "../Collection.RExhausted" }
    case "RTruth":
      return { ...value, $: "../Collection.RTruth" }
    case "RHandle":
      return { ...value, $: "../Collection.RHandle" }
    case "RAdvice":
      return { ...value, $: "../Collection.RAdvice" }
    case "RSnapshot":
      return { ...value, $: "../Collection.RSnapshot" }
    case "RCandidate":
      return { ...value, $: "../Collection.RCandidate" }
    case "RPrimitive":
      return { ...value, $: "../Collection.RPrimitive", response: encodeResponse(value.response) }
    case "ROwner":
      return { ...value, $: "../Collection.ROwner" }
    case "RInfo":
      return { ...value, $: "../Collection.RInfo" }
    case "RRoute":
      return { ...value, $: "../Collection.RRoute", disposition: encodeDisposition(value.disposition) }
    case "RFindings":
      return { ...value, $: "../Collection.RFindings" }
    case "RItems":
      return { ...value, $: "../Collection.RItems" }
    case "RFitting":
      return { ...value, $: "../Collection.RFitting" }
  }
}

export function decodeFlowResult(value: Imported<C.FlowStep, "../Collection.">): C.FlowStep {
  switch (value.$) {
    case "../Collection.FlowEmpty":
      return { $: "FlowEmpty" }
    case "../Collection.FlowRejected":
      return { $: "FlowRejected" }
    case "../Collection.FlowDone":
      return { ...value, $: "FlowDone" }
    case "../Collection.FlowAwait":
      throw new Error("collection decode requires a terminal result")
  }
}
