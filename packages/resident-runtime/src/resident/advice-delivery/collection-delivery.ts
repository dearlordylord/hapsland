import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { makeResidentCollectionRoot, type RootConfiguration } from "./handoff/collection-root.ts"
import type { createResidentPreparationBinding } from "../review-work/composition/preparation-binding.ts"
import type { ResidentLedger } from "../work-ownership/jobs.ts"
import type { ResponseContext } from "./authority.ts"

export const makeResidentCollectionDelivery = (
  deps: Parameters<typeof makeResidentCollectionRoot>[0] & {
    readonly canonicalDelivery: Pick<ReturnType<typeof createResidentPreparationBinding>, "collect">
    readonly residentLedger: ResidentLedger
  }
) =>
  Effect.fn("ResidentRuntime.collectDelivery")(function* (
    configuration: RootConfiguration,
    recipient: string,
    localDelivery: boolean,
    context: Ref.Ref<ResponseContext>
  ) {
    const partition = yield* deps.residentLedger.knownPartitionId(recipient)
    const round = yield* deps.residentLedger.currentRoundId(recipient)
    const native = makeResidentCollectionRoot(deps, configuration)
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const outcome = yield* restore(
          deps.canonicalDelivery.collect(
            {
              $: "DeliveryContext",
              recipient,
              partition: partition === undefined ? { $: "None" } : { $: "Some", value: partition },
              round: round === undefined ? { $: "None" } : { $: "Some", value: round },
              lifetime: deps.residentLedger.canonicalLifetime,
              local_delivery: localDelivery
            },
            native
          )
        )
        if ("failure" in outcome) return yield* Effect.interrupt
        if (outcome.delivery.kind !== "handoff" || outcome.delivery.value.stage !== "collect")
          return yield* Effect.die(new Error("Canonical collection did not issue Prepare"))
        const { response } = outcome.delivery.value
        const receipt = outcome.delivery.receipt
        yield* Ref.update(context, (state) => ({
          ...state,
          delivery: receipt,
          ...(response.status === "advice" ? { token: response.token } : {})
        }))
        return response
      })
    )
  })
