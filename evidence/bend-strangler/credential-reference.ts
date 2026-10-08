// Frozen execution baseline from master a071b9b58; evidence only, never a production import.
import { Schema } from "effect"

export const ReadableSource = Schema.Literals(["environment", "project-local", "project", "user", "native"])
export type ReadableSource = typeof ReadableSource.Type
export const SaveDestination = Schema.Literals(["user", "project-local", "native"])
export type SaveDestination = typeof SaveDestination.Type
export const CredentialPolicy = Schema.Struct({
  version: Schema.Literal(1),
  sources: Schema.Array(ReadableSource),
  destinations: Schema.Array(
    Schema.Struct({ kind: SaveDestination, title: Schema.String, scope: Schema.String, storage: Schema.String })
  ),
  defaultDestination: SaveDestination
})
export type CredentialPolicy = typeof CredentialPolicy.Type
export const credentialPolicy: CredentialPolicy = {
  version: 1,
  sources: ["environment", "project-local", "project", "user", "native"],
  destinations: [
    { kind: "user", title: "Every project on this machine", scope: "user", storage: "Local plaintext file" },
    { kind: "project-local", title: "This project only", scope: "project", storage: "Local plaintext file" },
    { kind: "native", title: "Native credential store", scope: "user", storage: "Platform credential store" }
  ],
  defaultDestination: "user"
}
export const CredentialContext = Schema.Struct({
  envVar: Schema.NonEmptyString,
  referenceExplicit: Schema.Boolean,
  captured: Schema.Boolean,
  root: Schema.UndefinedOr(Schema.String),
  userFile: Schema.String,
  projectLocalFile: Schema.UndefinedOr(Schema.String),
  projectFile: Schema.UndefinedOr(Schema.String),
  nativeTarget: Schema.String
})
export type CredentialContext = typeof CredentialContext.Type
export const LookupStep = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("environment"), envVar: Schema.String }),
  Schema.Struct({ kind: Schema.Literals(["project-local", "project", "user"]), file: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("native"), target: Schema.String })
])
export type LookupStep = typeof LookupStep.Type
export const LookupPlan = Schema.Array(LookupStep)
export const SavePlan = Schema.Struct({
  destination: SaveDestination,
  target: Schema.String,
  scope: Schema.String,
  storage: Schema.String
})
export type SavePlan = typeof SavePlan.Type
export const CredentialProposal = Schema.Struct({
  id: Schema.NonEmptyString,
  plan: SavePlan,
  availability: Schema.Literals(["available", "blocked"]),
  reason: Schema.UndefinedOr(Schema.String),
  activeSource: Schema.UndefinedOr(ReadableSource),
  activeFile: Schema.UndefinedOr(Schema.String),
  notice: Schema.optionalKey(Schema.String)
})
export type CredentialProposal = typeof CredentialProposal.Type

export const CredentialState = Schema.Struct({
  version: Schema.Literal(1),
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  savedUseSuspended: Schema.Boolean
})
export type CredentialState = typeof CredentialState.Type
export const ActiveCredentialObservation = Schema.Struct({
  status: Schema.Literals([
    "present",
    "missing",
    "invalid",
    "locked",
    "interaction-required",
    "unavailable",
    "timed-out",
    "suspended"
  ]),
  source: ReadableSource,
  file: Schema.optionalKey(Schema.String),
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
})
export type ActiveCredentialObservation = typeof ActiveCredentialObservation.Type
export const CredentialSaveResult = Schema.Struct({
  status: Schema.Literals([
    "available",
    "stored",
    "deleted",
    "present",
    "missing",
    "locked",
    "interaction-required",
    "invalid",
    "unavailable",
    "indeterminate",
    "timed-out",
    "cancelled",
    "busy",
    "stale"
  ]),
  state: CredentialState,
  stateLock: Schema.Literals(["acquired", "recovered", "busy", "unavailable"])
})
export type CredentialSaveResult = typeof CredentialSaveResult.Type

export const deriveLookupPlan = (context: CredentialContext): LookupStep[] =>
  credentialPolicy.sources.flatMap((kind): LookupStep[] => {
    if (kind === "environment") return [{ kind, envVar: context.envVar }]
    if (kind === "native") return context.referenceExplicit ? [] : [{ kind, target: context.nativeTarget }]
    if (context.captured || context.root === undefined) return []
    const file =
      kind === "user" ? context.userFile : kind === "project" ? context.projectFile : context.projectLocalFile
    return file === undefined ? [] : [{ kind, file }]
  })
export const deriveSavePlan = (context: CredentialContext, destination: SaveDestination): SavePlan | undefined => {
  const descriptor = credentialPolicy.destinations.find((item) => item.kind === destination)
  const target =
    destination === "user"
      ? context.userFile
      : destination === "native"
        ? context.nativeTarget
        : context.projectLocalFile
  return descriptor === undefined || target === undefined
    ? undefined
    : { destination, target, scope: descriptor.scope, storage: descriptor.storage }
}
export const nativeEligible = (context: CredentialContext): boolean =>
  deriveLookupPlan(context).some((step) => step.kind === "native")
