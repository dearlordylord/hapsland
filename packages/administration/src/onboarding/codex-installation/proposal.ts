import { sha256, type Mutation, missingDigest } from "./file-snapshots.ts"
import { canonicalJson as stableJson } from "../hook-reconciliation.ts"

export const reinstallDigest = (baseDigest: string, replacedJournalDigest?: string) =>
  replacedJournalDigest === undefined
    ? baseDigest
    : sha256(stableJson({ version: 1, baseDigest, replacedJournalDigest }))

export const installationDigest = (
  operation: "install" | "update" | "uninstall",
  home: string,
  mutations: ReadonlyArray<Mutation>
) =>
  sha256(
    stableJson({
      version: 1,
      operation,
      adapter: "codex",
      home,
      changes: mutations.map(({ path, beforeDigest, afterDigest, description }) => ({
        path,
        beforeDigest,
        afterDigest,
        description
      }))
    })
  )

export const previewChanges = (mutations: ReadonlyArray<Mutation>) =>
  mutations.map((change) => ({
    file: change.path,
    action: change.afterContent === null ? "remove" : change.beforeDigest === missingDigest ? "create" : "update",
    description: change.description,
    beforeDigest: change.beforeDigest,
    afterDigest: change.afterDigest
  }))
