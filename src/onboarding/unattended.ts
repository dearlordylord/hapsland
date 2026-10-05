import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { Config, Effect, Option, Schema } from "effect"
import { unattendedSetupUsage, type ClientArguments } from "../cli-command.ts"
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

/** Prompt-free frontend over the same structured setup preview and digest application. */
export const runUnattendedSetup = Effect.fn("Setup.unattended")(function* (client: ClientArguments) {
  const flags = client.flags
  const planPath = flags.get("--apply-plan")
  if (flags.has("--new-key"))
    return yield* Effect.fail(
      new Error("Unattended setup does not accept --new-key; configure a saved or environment credential first.")
    )
  if (
    planPath !== undefined &&
    [...flags.keys()].some((name) => !["--no-input", "--apply-plan", "--json"].includes(name))
  )
    return yield* Effect.fail(
      new Error("--apply-plan supplies its saved client and choices; use only --no-input and --json alongside it.")
    )
  if (planPath !== undefined && client.host !== undefined)
    return yield* Effect.fail(new Error("--apply-plan supplies its saved client; omit a positional client."))
  if (flags.has("--apply") && flags.has("--save-plan"))
    return yield* Effect.fail(
      new Error("--save-plan is preview only; apply the saved file separately with --apply-plan.")
    )
  const saved =
    planPath === undefined
      ? undefined
      : yield* Effect.try({
          try: () =>
            Schema.decodeUnknownSync(SavedSetupPlan, { onExcessProperty: "error" })(
              JSON.parse(readFileSync(planPath, "utf8"))
            ),
          catch: () => new Error("Saved setup plan is missing or malformed; generate and review a new plan.")
        })
  let request: SetupRequest
  if (saved !== undefined) {
    if (
      saved.request.interactive === true ||
      saved.request.newKey === true ||
      saved.request.installProposalDigest !== undefined ||
      saved.request.rulesProposalDigest !== undefined
    )
      return yield* Effect.fail(
        new Error("Saved unattended plans must contain preview choices without prompt or application fields.")
      )
    request = saved.request
  } else {
    const credential = flags.get("--credential")
    const review = flags.get("--review")
    if (client.host === undefined || credential === undefined || review === undefined)
      return yield* Effect.fail(new Error(unattendedSetupUsage()))
    const host = client.host
    request = yield* Effect.try(() =>
      Schema.decodeUnknownSync(SetupOperation)({
        version: 1,
        operation: "setup",
        ...profileFields(host, flags),
        scope: { cwd: process.cwd(), review },
        credential
      })
    )
  }
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
  if (preview.status === "conflict" || preview.status === "unsupported") return preview
  const savePath = flags.get("--save-plan")
  if (savePath !== undefined)
    yield* Effect.try(() =>
      writeFileSync(
        savePath,
        JSON.stringify({ version: 1, operation: "setup-plan", request, digest }, null, 2) + "\n",
        { flag: "wx", mode: 0o600 }
      )
    )
  if (!flags.has("--apply") && saved === undefined)
    return { ...preview, selection: "preview", ...(savePath === undefined ? {} : { savedPlanPath: savePath }) }
  const authorization = Object.assign({}, ...preview.actions.map((action) => action.authorization ?? {}))
  return yield* runSetup({ ...request, ...authorization }, options)
})
