import { type GraphLimitDrafts } from "../graph-limit-controls"
import { FILE_TREE_LABELS, validateFileTreeProfile, type FileTreeProfile } from "@hapsland/monkey-business"
import { type SimulationModel } from "./model"
import { number, InputError } from "./input"

export const graphFields = {
  sourceBytes: "graphSourceBytes",
  treeBytes: "graphTreeBytes",
  files: "graphFiles",
  readBytes: "graphReadBytes",
  outgoingEdges: "graphOutgoingEdges",
  depth: "graphDepth",
  work: "graphWork"
} as const
export const graphModelDrafts = (drafts: GraphLimitDrafts) =>
  Object.fromEntries(
    Object.entries(graphFields).map(([key, field]) => [field, drafts[key as keyof GraphLimitDrafts]])
  ) as Pick<SimulationModel, (typeof graphFields)[keyof typeof graphFields]>
export const graphDrafts = (model: SimulationModel): GraphLimitDrafts =>
  Object.fromEntries(Object.entries(graphFields).map(([key, field]) => [key, model[field]])) as GraphLimitDrafts
export const treeFields = {
  missingPercent: "treeMissingPercent",
  unsupportedPercent: "treeUnsupportedPercent",
  unreadablePercent: "treeUnreadablePercent",
  repeatedEdgePercent: "treeRepeatedPercent",
  cyclicEdgePercent: "treeCyclicPercent",
  deadlineStep: "treeDeadlineStep",
  localWork: "treeLocalWork",

  minFiles: "treeMinFiles",
  maxFiles: "treeMaxFiles",
  maxImports: "treeMaxImports",
  maxDepth: "treeMaxDepth",
  deniedPercent: "treeDeniedPercent",
  minSourceBytes: "treeMinSourceBytes",
  maxSourceBytes: "treeMaxSourceBytes",
  minTreeBytes: "treeMinTreeBytes",
  maxTreeBytes: "treeMaxTreeBytes"
} as const
export const treeDrafts = (profile: FileTreeProfile) =>
  Object.fromEntries(
    Object.entries(treeFields).map(([key, field]) => [field, String(profile[key as keyof FileTreeProfile] ?? 0)])
  ) as Pick<SimulationModel, (typeof treeFields)[keyof typeof treeFields]>
export const treeProfile = (model: SimulationModel): FileTreeProfile => {
  try {
    return validateFileTreeProfile(
      Object.fromEntries(
        Object.entries(treeFields).map(([key, field]) => [
          key,
          number(model[field], FILE_TREE_LABELS[key as keyof FileTreeProfile], 0, 1048576)
        ])
      ) as FileTreeProfile
    )
  } catch (error) {
    throw new InputError(error instanceof Error ? error.message : String(error))
  }
}
export const treeSummary = (profile: FileTreeProfile) =>
  `${profile.minFiles}–${profile.maxFiles} files/artifact · up to ${profile.maxImports} imports/file · depth ≤ ${profile.maxDepth} · ${profile.deniedPercent}% denied`
