/**
 * Mechanical native array reads for the Post-owned scan. Native strict equality
 * stays at the call site, preserving UTF-16 and lazy getter/error behavior.
 * @template A
 * @param {Pick<typeof import("./post-preparation-core.js").default, "selection_initial" | "selection_resume">} core
 * @param {readonly A[]} values
 * @param {import("./post-preparation-core.js").SelectionKind} kind
 * @param {(value: A) => boolean} equal
 * @param {{observed?: (value: A) => boolean, route?: (value: A) => import("./post-preparation-core.js").Route}} [ports]
 * @returns {{found: false} | {found: true, value: A}}
 */
export function selectPostValue(core, values, kind, equal, ports = {}) {
  // ToLength, as used by native some/find; no new input cap or scalar decoding.
  const length = Math.min(Math.max(Math.trunc(+values.length) || 0, 0), Number.MAX_SAFE_INTEGER)
  let step = core.selection_initial(kind, Number(BigInt(length)))
  /** @type {A | undefined} */
  let current
  let currentIndex = -1
  while (step.$ === "SelectionRead") {
    const index = Number(step.index)
    /** @type {import("./post-preparation-core.js").SelectionResponse} */
    let response
    switch (step.stage.$) {
      case "SelectionPresence":
        response = { $: "SelectionFlag", value: index in values }
        break
      case "SelectionStatus":
        current = values[index]
        currentIndex = index
        if (!ports.observed) throw new Error("Missing Post observation reader")
        // Native find passes undefined for a sparse slot too; propagate it to
        // the original native predicate rather than inventing a hole filter.
        response = { $: "SelectionFlag", value: ports.observed(/** @type {A} */ (current)) }
        break
      case "SelectionEquality":
        if (currentIndex !== index) {
          current = values[index]
          currentIndex = index
        }
        response = { $: "SelectionFlag", value: equal(/** @type {A} */ (current)) }
        break
      case "SelectionRoute":
        if (!ports.route) throw new Error("Missing Post plan route reader")
        response = { $: "SelectionPlanRoute", route: ports.route(/** @type {A} */ (current)) }
        break
    }
    step = core.selection_resume(step, response)
  }
  if (step.$ === "SelectionFound") {
    if (step.index !== Number(BigInt(currentIndex))) throw new Error("Post selection lacks its native receipt")
    return { found: true, value: /** @type {A} */ (current) }
  }
  if (step.$ === "SelectionMissing") return { found: false }
  throw new Error("Invalid Post selection reply")
}
