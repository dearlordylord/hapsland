// Bend 2.0.36 names imported constructors relative to the emitting owner.
// The resolver interface has one Types/Local declaration owner; this conversion
// only rebases those constructor names at the preparation artifact boundary.
const importedTags = [
  ["Types.", "../../../../source-analysis/src/direct-event/graph-resolution/Types."],
  ["./traversal/core.", "../../../../source-analysis/src/direct-event/graph-resolution/traversal/core."]
]
const preparationAbi = (value, intoPreparation) => {
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
export function createPreparationMachine(core) {
  const pump = (initial) => {
    let step = initial
    for (let count = 0; count < 10000; count++) {
      if (step.$ !== "Internal") return step
      step = core.advance(step.state)
    }
    throw new Error("Preparation internal dispatch did not settle")
  }
  return {
    initial: (input) => pump(core.initial(input.invocation, preparationAbi(input.preparation, true))),
    resume: (step, event) => {
      if (event.$ !== "Types.ServiceReply") throw new Error("Invalid preparation reply envelope")
      return pump(core.resume(step, preparationAbi(event.reply, true)))
    },
    view: (step) => {
      switch (step.$) {
        case "Await":
          return { $: "Types.AwaitService", request: preparationAbi(step.request, false) }
        case "Finished":
          return { $: "PreparationFinished", result: preparationAbi(step.result, false) }
        case "Failed":
          return { $: "PreparationFailed", reason: step.reason }
        default:
          throw new Error("Unsettled preparation projection")
      }
    },
    accepted: (projection) => {
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
