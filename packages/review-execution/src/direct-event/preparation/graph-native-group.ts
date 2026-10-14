import * as Effect from "effect/Effect"
import { graphProtocol } from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import { performGraphServiceFlow } from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { GraphServiceReply } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { runNativeEffect } from "@hapsland/runtime-environment/runtime/native-execution"
import type { ForeignCommand, ForeignReply } from "@hapsland/canonical-policy/canonical/child-execution"

type Continuation = ReturnType<typeof graphProtocol.initial>
type Request = Exclude<ReturnType<typeof graphProtocol.awaitRequest>, undefined>
export type GraphNativeRequest = Request & { readonly graphContinuation?: Continuation }
export type GraphNativeReply = {
  readonly $: "GraphNativeReply"
  readonly continuation: Continuation
  readonly reply?: GraphServiceReply
}

// The private Effect driver has no external provider hooks. Its Canonical lease
// checkpoints each native primitive and its Bend continuation commit. Actual
// suspensions leave this group and resume only after normal result acceptance.
export function performGraphNativeGroup(
  request: GraphNativeRequest,
  session: Parameters<typeof performGraphServiceFlow>[0],
  options: Parameters<typeof performGraphServiceFlow>[2]
): ForeignReply<GraphNativeReply> {
  const initial = request.graphContinuation
  if (initial === undefined) throw new TypeError("Missing private Graph continuation")
  let continuation = initial
  let next: Request | undefined = request
  return {
    group: {
      checkpoints: "canonical",
      next(): ForeignCommand<GraphNativeReply> {
        const current = next
        if (current === undefined) return { kind: "terminal", value: { $: "GraphNativeReply", continuation } }
        return {
          kind: "checkpointed",
          perform() {
            const flow = performGraphServiceFlow(session, current, options)
            const first = flow.next()
            if (first.done)
              return {
                commit() {
                  continuation = graphProtocol.resume(continuation, first.value)
                  next = graphProtocol.awaitRequest(graphProtocol.view(continuation))
                }
              }
            const pendingContinuation = continuation
            let completed: GraphNativeReply | undefined
            return {
              effect: runNativeEffect(flow, () => {}, first).pipe(
                Effect.map((reply) => {
                  completed = { $: "GraphNativeReply", continuation: pendingContinuation, reply }
                })
              ),
              map() {
                if (completed === undefined) throw new TypeError("Graph native suspension did not complete")
                return completed
              }
            }
          }
        }
      }
    }
  }
}
