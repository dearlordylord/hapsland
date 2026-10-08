import { lookupSources, saveAvailable, type CredentialSource } from "@hapsland/agent-flow-bend/credential-policy"

export type CredentialSourceName = "environment" | "project-local" | "project" | "user" | "native"
const names: Record<CredentialSource["$"], CredentialSourceName> = {
  Environment: "environment",
  ProjectLocal: "project-local",
  Project: "project",
  User: "user",
  Native: "native"
}
const constructors: Record<CredentialSourceName, CredentialSource> = {
  environment: { $: "Environment" },
  "project-local": { $: "ProjectLocal" },
  project: { $: "Project" },
  user: { $: "User" },
  native: { $: "Native" }
}
const sourceIds: Record<CredentialSourceName, number> = {
  environment: 0,
  "project-local": 1,
  project: 2,
  user: 3,
  native: 4
}
// Fixed finite domains; values contain no paths, targets, secrets or descriptors.
const lookupCache: Array<readonly CredentialSourceName[] | undefined> = new Array(32)
const saveCache: Array<boolean | undefined> = new Array(10)
export const credentialLookupSources = (
  explicit: boolean,
  captured: boolean,
  root: boolean,
  local: boolean,
  project: boolean
): readonly CredentialSourceName[] => {
  if (
    typeof explicit !== "boolean" ||
    typeof captured !== "boolean" ||
    typeof root !== "boolean" ||
    typeof local !== "boolean" ||
    typeof project !== "boolean"
  )
    throw new TypeError("Credential planning requires Boolean facts")
  const key =
    Number(explicit) | (Number(captured) << 1) | (Number(root) << 2) | (Number(local) << 3) | (Number(project) << 4)
  const cached = lookupCache[key]
  if (cached !== undefined) return cached
  const result: CredentialSourceName[] = []
  for (let list = lookupSources(explicit, captured, root, local, project); list.$ === "Con"; list = list.tail) {
    if (result.length >= 5) throw new TypeError("Credential planning returned an oversized source list")
    if (!Object.hasOwn(names, list.head.$)) throw new TypeError("Unknown credential source")
    result.push(names[list.head.$])
  }
  const immutable = Object.freeze(result)
  lookupCache[key] = immutable
  return immutable
}
export const credentialSaveAvailable = (destination: CredentialSourceName, local: boolean): boolean => {
  if (typeof local !== "boolean") throw new TypeError("Credential planning requires Boolean facts")
  const sourceId = sourceIds[destination]
  if (typeof sourceId !== "number") throw new TypeError("Unknown credential destination")
  const key = sourceId * 2 + Number(local)
  const cached = saveCache[key]
  if (cached !== undefined) return cached
  const available = saveAvailable(constructors[destination], local)
  if (typeof available !== "boolean") throw new TypeError("Credential planning returned a non-Boolean save decision")
  saveCache[key] = available
  return available
}
