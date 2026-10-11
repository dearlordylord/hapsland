import { type Mutation } from "./file-snapshots.ts"
import { Schema } from "effect"
import { existsSync, readFileSync } from "node:fs"

export interface Journal {
  readonly version: 1
  readonly operation: "install" | "update" | "uninstall"
  readonly proposalDigest: string
  readonly completed: ReadonlyArray<number>
  readonly reinstall?: boolean
  readonly replacedJournalDigest?: string
  readonly mutations: ReadonlyArray<Mutation>
}

const JournalShape = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literals(["install", "update", "uninstall"]),
  proposalDigest: Schema.String,
  mutations: Schema.Array(Schema.Unknown),
  completed: Schema.Array(Schema.Unknown),
  reinstall: Schema.optional(Schema.Unknown),
  replacedJournalDigest: Schema.optional(Schema.Unknown)
})

const MutationShape = Schema.Struct({
  path: Schema.String,
  beforeDigest: Schema.String,
  beforeContent: Schema.NullOr(Schema.String),
  afterDigest: Schema.String,
  afterContent: Schema.NullOr(Schema.String),
  description: Schema.String
})

const decodeMutation = (value: unknown) => Schema.decodeUnknownSync(MutationShape)(value)

const completedJournalStep = (index: unknown, length: number) => {
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new Error("completed shape")
  }
  return index
}

const replacedJournalDigest = (digest: unknown) =>
  typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest) ? { replacedJournalDigest: digest } : {}

export const readJournal = (path: string): Journal | undefined => {
  if (!existsSync(path)) return undefined
  try {
    const value = Schema.decodeUnknownSync(JournalShape)(JSON.parse(readFileSync(path, "utf8")))
    const mutations = value.mutations.map(decodeMutation)
    return {
      version: 1,
      operation: value.operation,
      proposalDigest: value.proposalDigest,
      completed: value.completed.map((index) => completedJournalStep(index, mutations.length)),
      ...(value.reinstall === true ? { reinstall: true } : {}),
      ...replacedJournalDigest(value.replacedJournalDigest),
      mutations
    }
  } catch {
    throw new Error("recovery journal is malformed; inspect it before making further changes")
  }
}
