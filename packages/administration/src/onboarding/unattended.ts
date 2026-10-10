import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { Config, Effect, Option, Schema } from "effect"
import { unattendedSetupUsage } from "../cli-command.ts"
import { type ClientArguments } from "../invocation/arguments.ts"
import { profileFields } from "./client-command.ts"
import { SetupOperation } from "./setup-request.ts"
import { runSetup, type SetupRequest } from "./setup.ts"

const SavedSetupPlan = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("setup-plan"),
  request: SetupOperation,
  digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
})
const planDigest = (request: SetupRequest, result: Effect.Success<ReturnType<typeof runSetup>>) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        request,
        installation: result.stages.find((stage) => stage.stage === "installation")?.observed,
        rules: result.stages.find((stage) => stage.stage === "rules")?.observed,
        repository: result.stages.find((stage) => stage.stage === "repository")?.observed
      })
    )
    .digest("hex")

const validateSavedPlanArguments = Effect.fn("Setup.validateSavedPlanArguments")(function* (
  client: ClientArguments,
  planPath: string | undefined
) {
  if (
    planPath !== undefined &&
    [...client.flags.keys()].some((name) => !["--no-input", "--apply-plan", "--json"].includes(name))
  )
    return yield* Effect.fail(
      new Error("--apply-plan supplies its saved client and choices; use only --no-input and --json alongside it.")
    )
  if (planPath !== undefined && client.host !== undefined)
    return yield* Effect.fail(new Error("--apply-plan supplies its saved client; omit a positional client."))
})
const validateUnattendedArguments = Effect.fn("Setup.validateUnattendedArguments")(function* (client: ClientArguments) {
  if (client.flags.has("--new-key"))
    return yield* Effect.fail(
      new Error("Unattended setup does not accept --new-key; configure a saved or environment credential first.")
    )
  yield* validateSavedPlanArguments(client, client.flags.get("--apply-plan"))
  if (client.flags.has("--apply") && client.flags.has("--save-plan"))
    return yield* Effect.fail(
      new Error("--save-plan is preview only; apply the saved file separately with --apply-plan.")
    )
})
const loadSavedSetupPlan = Effect.fn("Setup.loadSavedPlan")(function* (planPath: string | undefined) {
  if (planPath === undefined) return undefined
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(SavedSetupPlan, { onExcessProperty: "error" })(
        JSON.parse(readFileSync(planPath, "utf8"))
      ),
    catch: () => new Error("Saved setup plan is missing or malformed; generate and review a new plan.")
  })
})
const savedPreviewRequest = Effect.fn("Setup.savedPreviewRequest")(function* (request: SetupRequest) {
  if (
    request.interactive === true ||
    request.newKey === true ||
    request.installProposalDigest !== undefined ||
    request.rulesProposalDigest !== undefined
  )
    return yield* Effect.fail(
      new Error("Saved unattended plans must contain preview choices without prompt or application fields.")
    )
  return request
})
const unattendedRequest = Effect.fn("Setup.unattendedRequest")(function* (client: ClientArguments) {
  const credential = client.flags.get("--credential")
  const review = client.flags.get("--review")
  if (client.host === undefined || credential === undefined || review === undefined)
    return yield* Effect.fail(new Error(unattendedSetupUsage()))
  const host = client.host
  return yield* Effect.try(() =>
    Schema.decodeUnknownSync(SetupOperation)({
      version: 1,
      operation: "setup",
      ...profileFields(host, client.flags),
      scope: { cwd: process.cwd(), review },
      credential
    })
  )
})
const saveSetupPlan = Effect.fn("Setup.savePlan")(function* (
  path: string | undefined,
  request: SetupRequest,
  digest: string
) {
  if (path === undefined) return
  yield* Effect.try(() =>
    writeFileSync(path, JSON.stringify({ version: 1, operation: "setup-plan", request, digest }, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600
    })
  )
})
const setupPreviewResult = (preview: Effect.Success<ReturnType<typeof runSetup>>, savePath: string | undefined) => ({
  ...preview,
  selection: "preview",
  ...(savePath === undefined ? {} : { savedPlanPath: savePath })
})
const previewOnly = (client: ClientArguments, saved: typeof SavedSetupPlan.Type | undefined): boolean =>
  !client.flags.has("--apply") && saved === undefined
const blockedSetupPreview = (preview: Effect.Success<ReturnType<typeof runSetup>>): boolean =>
  preview.status === "conflict" || preview.status === "unsupported"
/** Prompt-free frontend over the same structured setup preview and digest application. */
export const runUnattendedSetup = Effect.fn("Setup.unattended")(function* (client: ClientArguments) {
  const flags = client.flags
  yield* validateUnattendedArguments(client)
  const saved = yield* loadSavedSetupPlan(flags.get("--apply-plan"))
  const request = saved === undefined ? yield* unattendedRequest(client) : yield* savedPreviewRequest(saved.request)
  const configured = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  const statePath = yield* Config.String("REVIEW_STATE_PATH").pipe(Config.withDefault(""))
  const options = { statePath, ...(configured === undefined ? {} : { userConfigPath: configured }) }
  const preview = yield* runSetup(request, options)
  const digest = planDigest(request, preview)
  if (saved !== undefined && saved.digest !== digest)
    return {
      version: 1,
      operation: "setup",
      status: "proposal-mismatch",
      providerCalls: 0,
      paidVerificationPerformed: false,
      message: "Saved setup plan is stale; generate and review a new plan."
    }
  if (blockedSetupPreview(preview)) return preview
  const savePath = flags.get("--save-plan")
  yield* saveSetupPlan(savePath, request, digest)
  if (previewOnly(client, saved)) return setupPreviewResult(preview, savePath)
  const authorization = Object.assign({}, ...preview.actions.map((action) => action.authorization ?? {}))
  return yield* runSetup({ ...request, ...authorization }, options)
})
