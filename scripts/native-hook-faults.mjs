import { existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
/** Native fault probes describe hook execution only, never native event freshness. */
export const faultProfile = (scenario) =>
  ({
    "hook-crash": { phase: "post", delayMs: 0, exitCode: 42, timeoutSeconds: 10 },
    "hook-timeout": { phase: "post", delayMs: 10000, exitCode: 42, timeoutSeconds: 2 },
    "pre-delay": { phase: "pre", delayMs: 1500, exitCode: 0, timeoutSeconds: 5 },
    "pre-timeout": { phase: "pre", delayMs: 10000, exitCode: 0, timeoutSeconds: 2 },
    "pre-crash": { phase: "pre", delayMs: 0, exitCode: 42, timeoutSeconds: 5 }
  })[scenario]
export const targetsFault = (profile, kind) =>
  profile?.phase === "pre"
    ? kind === "before-edit"
    : profile?.phase === "post" && (kind === "edit" || kind === "background")
export const assessPreFault = ({
  scenario,
  events,
  mutation,
  reviewerRequests,
  providerRequests,
  fixtureMatches = true,
  observerInstalled = true
}) => {
  const entry = events.find((e) => e.kind === "before-edit" && e.injectedFault === scenario)
  const ready = events.find((e) => e.kind === "fault-completed" && e.targetKind === "before-edit")
  const post = events.find((e) => e.kind === "edit")
  return {
    preFaultObserved: !!entry,
    singlePreInvocation: events.filter((e) => e.kind === "before-edit" && e.injectedFault === scenario).length === 1,
    singleSourceEditObservation: events.filter((e) => e.kind === "edit").length === 1,
    fixtureMatchesExpectedSingleEdit: fixtureMatches,
    providerObserverInstalled: observerInstalled,
    postForSameAttemptObserved: !!entry?.toolUseHash && entry.toolUseHash === post?.toolUseHash,
    fixtureMutationObserved: !!mutation,
    mutationAfterPreEntry: !!entry && !!mutation && mutation.monoMs >= entry.monoMs,
    ...(scenario === "pre-delay"
      ? {
          preCompletedNaturally: !!ready,
          observedHoldSamples: (ready?.hold?.samples ?? 0) >= 2,
          fixtureAbsentAtHoldStart: ready?.hold?.baselineExists === false,
          noPersistentMutationDuringHold: ready?.hold?.changedDuringHold === false && ready?.hold?.endExists === false,
          mutationAfterPreReady: !!ready && !!mutation && mutation.monoMs >= ready.monoMs
        }
      : {}),
    noReviewerRequests: reviewerRequests === 0,
    noProviderRequests: providerRequests === 0
  }
}

/** Samples only hashes/existence. A persistent planted edit must be detected. */
export const observeHold = async (path, delayMs, intervalMs = 50) => {
  const sample = () => (existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null)
  const baselineHash = sample()
  let samples = 0,
    changedDuringHold = false
  const endAt = performance.now() + delayMs
  do {
    changedDuringHold ||= sample() !== baselineHash
    samples++
    const remaining = endAt - performance.now()
    if (remaining <= 0) break
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)))
    // oxlint-disable-next-line no-constant-condition -- The finite wall-clock deadline above owns this sampling loop.
  } while (true)
  const endHash = sample()
  return {
    samples,
    changedDuringHold,
    baselineHash,
    endHash,
    baselineExists: baselineHash !== null,
    endExists: endHash !== null
  }
}
