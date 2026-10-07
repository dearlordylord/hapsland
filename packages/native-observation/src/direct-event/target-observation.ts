import { relative, resolve, sep } from "node:path"
import type { DirectObservation, PhysicalRootIdentity } from "./observation.ts"

/** Keep one source's candidates and patch coordinates without changing the invocation's ordering. */
export const observationForTargetRoot = (
  observation: DirectObservation,
  root: string,
  rootIdentity: PhysicalRootIdentity,
  indices: ReadonlyArray<number>
): DirectObservation => {
  const paths = new Map<string, string>()
  const candidates = indices.map((index) => {
    const candidate = observation.candidates[index]
    if (candidate === undefined) throw new Error("missing native target candidate")
    const path = relative(root, resolve(observation.root, candidate.path)).replaceAll(sep, "/")
    paths.set(candidate.path, path)
    return { ...candidate, path }
  })
  // Retain only selected source sections; skipped roots must not enter the job's source payload.
  let selectedSection = true
  const nativePatchCommand = observation.nativePatchCommand
    ?.split("\n")
    .flatMap((line) => {
      const header = /^(\*\*\* (?:Add|Update|Delete) File: )(.+)$/u.exec(line)
      if (header !== null) {
        const path = paths.get(header[2]!.trim())
        selectedSection = path !== undefined
        return path === undefined ? [] : [`${header[1]}${path}`]
      }
      if (line === "*** End Patch") return [line]
      return selectedSection ? [line] : []
    })
    .join("\n")
  return {
    root,
    rootIdentity,
    advicee: observation.advicee,
    candidates,
    ...(nativePatchCommand === undefined ? {} : { nativePatchCommand }),
    ...(observation.verifiedPostEditHunks === undefined
      ? {}
      : { verifiedPostEditHunks: observation.verifiedPostEditHunks })
  }
}

/** Candidate ordering is native ordering; this helper only assigns a physical source. */
export const candidateRootObservation = (observation: DirectObservation, index: number, selectedRoot?: string) => {
  const target = observation.candidateRoots?.[index]
  if (target === undefined || target === null) return undefined
  if (selectedRoot !== undefined && target.root !== selectedRoot) return undefined
  return observationForTargetRoot(observation, target.root, target.rootIdentity, [index])
}
export const candidatesForSourceRoot = (observation: DirectObservation, root: string) => {
  const indices = observation.candidates.flatMap((_candidate, index) =>
    observation.candidateRoots?.[index]?.root === root ? [index] : []
  )
  const selected = new Set(indices)
  const skipped = observation.candidates
    .filter((_candidate, index) => !selected.has(index))
    .map((candidate) => resolve(observation.root, candidate.path))
  return { indices, skipped }
}
