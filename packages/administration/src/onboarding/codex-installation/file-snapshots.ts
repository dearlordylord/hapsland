import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

export interface FileSnapshot {
  readonly path: string
  readonly exists: boolean
  readonly content: string
  readonly digest: string
}

export interface Mutation {
  readonly path: string
  readonly beforeDigest: string
  readonly beforeContent: string | null
  readonly afterDigest: string
  readonly afterContent: string | null
  readonly description: string
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

export const missingDigest = sha256("installation-v1:missing")

const digestSnapshot = (exists: boolean, content: string) =>
  exists ? sha256(`installation-v1:file\0${content}`) : missingDigest

export const snapshot = (path: string): FileSnapshot => {
  try {
    const content = readFileSync(path, "utf8")
    return { path, exists: true, content, digest: digestSnapshot(true, content) }
  } catch (cause) {
    if (isNodeError(cause, "ENOENT")) {
      return { path, exists: false, content: "", digest: missingDigest }
    }
    throw new Error(`configuration is unreadable: ${path}`)
  }
}

export const isNodeError = (value: unknown, code: string) =>
  typeof value === "object" && value !== null && "code" in value && value.code === code

export const mutation = (file: FileSnapshot, afterContent: string | null, description: string): Mutation => ({
  path: file.path,
  beforeDigest: file.digest,
  beforeContent: file.exists ? file.content : null,
  afterDigest: afterContent === null ? missingDigest : digestSnapshot(true, afterContent),
  afterContent,
  description
})

export const mutationBeforeFile = (change: Mutation): FileSnapshot => ({
  path: change.path,
  exists: change.beforeContent !== null,
  content: change.beforeContent ?? "",
  digest: change.beforeDigest
})

export const validateMutationContent = (change: Mutation) => {
  const recomputedBefore = change.beforeContent === null ? missingDigest : digestSnapshot(true, change.beforeContent)
  const recomputedAfter = change.afterContent === null ? missingDigest : digestSnapshot(true, change.afterContent)
  if (change.beforeDigest !== recomputedBefore || change.afterDigest !== recomputedAfter) {
    throw new Error("recovery journal content does not match its recorded file digests")
  }
}

export const validateMutationCurrent = (change: Mutation, completed: boolean) => {
  const current = snapshot(change.path)
  if (completed) {
    if (current.digest !== change.afterDigest) {
      throw new Error(`completed journal step changed for ${change.path}; the unrelated edit was preserved`)
    }
  } else if (current.digest !== change.beforeDigest && current.digest !== change.afterDigest) {
    throw new Error(`concurrent change detected for ${change.path}; no stale content was restored`)
  }
}
