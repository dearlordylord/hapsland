import { dirname, join } from "node:path"
import { withInstallationLock } from "./installation-lock.ts"
import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import {
  ResidentTarget,
  readResidentTarget,
  residentTargetPath
} from "@hapsland/runtime-environment/runtime/resident-selection"
import {
  ensureResidentEffect,
  inspectResidentEffect,
  residentRequestEffect,
  residentStartupLayer
} from "@hapsland/resident-transport/resident/client"
import { resolveResidentPaths } from "@hapsland/resident-transport/resident/paths"
import { atomicInstallationFile } from "./atomic-installation-file.ts"

const targetIdentity = Schema.Struct({ name: Schema.Literal("@hapsland/hapsland"), resident: ResidentTarget })
const readTarget = Effect.fn("ResidentUpdate.target")(function* (executable: string) {
  const result = yield* execFileClosedStdin(executable, ["--package-identity"], {
    timeout: 10_000,
    maxBuffer: 1_048_576,
    env: { ...process.env, HAPSLAND_ACTIVE_DISPATCH: "1" }
  })
  if (!result.succeeded) return yield* Effect.fail(new Error("Selected resident package cannot run."))
  const value = yield* Effect.try((): unknown => JSON.parse(result.stdout))
  return (yield* Schema.decodeUnknownEffect(targetIdentity)(value)).resident
})
const preview = Effect.fn("ResidentUpdate.preview")(function* (executable: string) {
  const target = yield* readTarget(executable)
  const selected = yield* Effect.try(() => readResidentTarget())
  const paths = yield* resolveResidentPaths()
  const serving = yield* inspectResidentEffect(paths)
  const alreadyCurrent = JSON.stringify(selected) === JSON.stringify(target) && serving.build === target.build
  // Approval binds the durable selection, not a lifetime that can retire normally.
  const digest = createHash("sha256")
    .update(JSON.stringify({ target, selected: selected ?? null }))
    .digest("hex")
  return {
    target,
    paths,
    serving,
    result: {
      status: "preview",
      alreadyCurrent,
      proposal: {
        digest,
        changes: alreadyCurrent
          ? []
          : [{ description: "Select and activate the shared resident; transient work may be lost" }],
        current: serving,
        target
      }
    }
  }
})
export const previewResidentUpdate = Effect.fn("ResidentUpdate.previewPublic")((executable: string) =>
  preview(executable).pipe(Effect.map((value) => value.result))
)
const apply = Effect.fn("ResidentUpdate.apply")(function* (executable: string, digest: string) {
  const candidate = yield* preview(executable)
  if (digest !== candidate.result.proposal.digest)
    return { status: "proposal-mismatch", error: { message: "Resident state changed; obtain a fresh preview." } }
  // Selection survives launch failure. No rollback or transient-state migration.
  yield* Effect.try(() => atomicInstallationFile(residentTargetPath(), JSON.stringify(candidate.target) + "\n"))
  const activation = yield* Effect.gen(function* () {
    if (candidate.serving.lifetime !== undefined && candidate.serving.build !== candidate.target.build) {
      const response = yield* residentRequestEffect(candidate.paths, {
        requestRoute: "shared",
        operation: "replace",
        lifetime: candidate.serving.lifetime
      })
      if (response.status !== "replacing")
        return yield* Effect.fail(new Error("Resident replacement was not acknowledged."))
    }
    const serving = yield* ensureResidentEffect(candidate.paths)
    if (serving.build !== candidate.target.build)
      return yield* Effect.fail(new Error("Selected resident is not serving; activation is pending."))
    return serving
  }).pipe(Effect.provide(residentStartupLayer), Effect.result)
  return activation._tag === "Success"
    ? {
        status: "updated",
        resident: { state: "active", build: activation.success.build, lifetime: activation.success.lifetime }
      }
    : {
        status: "partial",
        resident: { state: "unavailable", selected: candidate.target.build },
        error: { message: "Selected resident unavailable. Target retained; retry resident update." }
      }
})

export const applyResidentUpdate = Effect.fn("ResidentUpdate.lockedApply")((executable: string, digest: string) =>
  withInstallationLock(join(dirname(residentTargetPath()), "resident-update.lock"), apply(executable, digest))
)
