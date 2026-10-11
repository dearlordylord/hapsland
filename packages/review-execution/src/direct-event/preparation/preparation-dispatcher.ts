import type { Input, Step, Request, Reply } from "./preparation-core.js"

type ResolverTag<Tag> = Tag extends `../../../../source-analysis/src/direct-event/graph-resolution/Types.${infer Name}`
  ? `Types.${Name}`
  : Tag extends `../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.${infer Name}`
    ? `./traversal/core.${Name}`
    : Tag
export type ResolverWire<Value> = Value extends object
  ? { [Key in keyof Value]: Key extends "$" ? ResolverTag<Value[Key]> : ResolverWire<Value[Key]> }
  : Value
export type PreparationInvocation = { readonly invocation: bigint; readonly preparation: ResolverWire<Input> }
export type PreparationEvent = { readonly $: "Types.ServiceReply"; readonly reply: ResolverWire<Reply> }
type SettledStep = Exclude<Step, { readonly $: "Internal" }>
type Projection =
  | { readonly $: "Types.AwaitService"; readonly request: ResolverWire<Request> }
  | { readonly $: "PreparationFinished"; readonly result: ResolverWire<Extract<Step, { $: "Finished" }>["result"]> }
  | { readonly $: "PreparationFailed"; readonly reason: string }

// Bend 2.0.36 names imported constructors relative to the emitting owner.
// Resolver Types/Local retain their graph owners; artifact values have one lower
// Value owner. This boundary rebases graph names; Value names already match
// the preparation artifact root.
const importedTags = [
  ["Types.", "../../../../source-analysis/src/direct-event/graph-resolution/Types."],
  ["./traversal/core.", "../../../../source-analysis/src/direct-event/graph-resolution/traversal/core."]
] as const
const preparationAbi = (value: unknown, intoPreparation: boolean): unknown => {
  if (Array.isArray(value)) return value.map((item) => preparationAbi(item, intoPreparation))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "$" && typeof item === "string") {
        for (const [resolver, preparation] of importedTags) {
          const from = intoPreparation ? resolver : preparation
          if (item.startsWith(from)) return [key, (intoPreparation ? preparation : resolver) + item.slice(from.length)]
        }
        return [key, item]
      }
      return [key, preparationAbi(item, intoPreparation)]
    })
  )
}

// Mechanical dispatch only: Bend chooses each contract, candidate and root.
// Canonical owns lifecycle through the same driver envelope as resolver children.
export function createPreparationMachine(core: typeof import("./preparation-core.js").default) {
  const pump = (initial: Step): SettledStep => {
    let step = initial
    for (let count = 0; count < 10000; count++) {
      if (step.$ !== "Internal") return step
      step = core.advance(step.state)
    }
    throw new Error("Preparation internal dispatch did not settle")
  }
  return {
    initial: (input: PreparationInvocation) =>
      pump(core.initial(input.invocation, preparationAbi(input.preparation, true) as Input)),
    resume: (step: SettledStep, event: PreparationEvent) => {
      if (event.$ !== "Types.ServiceReply") throw new Error("Invalid preparation reply envelope")
      return pump(core.resume(step, preparationAbi(event.reply, true) as Reply))
    },
    view: (step: SettledStep): Projection => {
      switch (step.$) {
        case "Await":
          return { $: "Types.AwaitService", request: preparationAbi(step.request, false) as ResolverWire<Request> }
        case "Finished":
          return {
            $: "PreparationFinished",
            result: preparationAbi(step.result, false) as ResolverWire<typeof step.result>
          }
        case "Failed":
          return { $: "PreparationFailed", reason: step.reason }
        default:
          throw new Error("Unsettled preparation projection")
      }
    },
    accepted: (projection: Projection) => {
      if (projection.$ === "PreparationFinished") return { preparation: projection.result }
      if (projection.$ === "PreparationFailed") return { failure: { reason: projection.reason } }
      throw new Error("Invalid accepted preparation projection")
    },
    disposeInvocation() {},
    get retainedHandles() {
      return 0
    }
  }
}
