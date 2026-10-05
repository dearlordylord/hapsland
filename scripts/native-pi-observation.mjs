// Source-free assertions shared by the native cross-file runner's Pi profile.
export const piModelProfile = (settings) => {
  if (settings.defaultProvider !== "openai" || settings.defaultModel !== "gpt-6-luna")
    throw new Error("Pi native milestone requires the existing openai/gpt-6-luna profile")
  return { provider: settings.defaultProvider, model: settings.defaultModel }
}

export const piModelObserved = (events, profile) => {
  const messages = events.filter((event) => event.kind === "native-message" && event.role === "assistant")
  return (
    messages.length > 0 &&
    messages.every((message) => message.provider === profile.provider && message.model === profile.model)
  )
}

export const assessPiAdoption = ({
  events,
  requests,
  outcomes,
  finalMatches,
  compiles,
  rejectsInvalid,
  setupReady,
  doctorReady
}) => {
  const edits = events.filter((e) => e.kind === "tool-result" && e.tool === "edit" && !e.isError)
  const first = edits.find((e) => e.initial)
  const delivered = events.find(
    (e) =>
      (e.kind === "tool-result" ||
        e.kind === "before-settle" ||
        (e.kind === "native-message" && ["toolResult", "custom"].includes(e.role))) &&
      e.finding
  )
  const visible = events.find((e) => e.kind === "provider-request" && e.finding)
  const repair = edits.find((e) => e.final && visible && e.at > visible.at)
  return {
    installedSetupReady: setupReady,
    installedDoctorOwnershipReady: doctorReady,
    beforeToolPermitRegistered:
      !!first && events.some((e) => e.kind === "hapsland-response" && e.status === "registered" && e.at < first.at),
    exactNativeEditEvidence: !!first && first.patchPresent && first.pathMatches && first.replacementsMatchCurrent,
    semanticCrossFileReview: requests.some(
      (e) => e.rootKind === "interface" && e.expandedEdges > 0 && e.conditionalFindingSourceMatched
    ),
    nativeAdviceSubmitted: !!delivered,
    adviceInProviderRequest: !!visible,
    repairAfterModelVisibleAdvice: !!repair,
    exactlyTwoNativeEdits: edits.length === 2 && !events.some((e) => e.kind === "tool-result" && e.tool === "write"),
    repairedSourceMatches: finalMatches,
    sourceCompiles: compiles,
    invalidConstructionRejected: rejectsInvalid,
    followupClearForRepair:
      !!repair && outcomes.some((e) => e.toolUseHash === repair.toolUseHash && e.outcome === "completed-clear")
  }
}
