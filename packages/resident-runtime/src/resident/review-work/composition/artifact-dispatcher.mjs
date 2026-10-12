// Constructor names are an artifact ABI detail of Bend 2.0.36, not policy.
// Graph and artifact-value payloads retain their separate declaration owners.
// Resident artifacts refer to those exact owners through different import paths.
import { intoArtifact, intoResolver } from "./artifact-transport.ts"

// Closed export dispatch only. Source-bearing artifact states stay behind handles.
// Prefix mode preserves immutable states for cloned probes. Operational mode
// consumes artifact handles; owned-artifact-driver binds their outer lifecycle
// to Canonical. Production resident preparation integration remains open.
/**
 * @param {{ composition: typeof import("./artifact-composition-core.js").default,
 * parent: typeof import("./generic-artifact-core.js").default,
 * python: typeof import("./python-artifact-core.js").default,
 * go: typeof import("./go-artifact-core.js").default, retainPrefixes?: boolean }} options
 */
export function createArtifactMachine({ composition, parent, python, go, retainPrefixes = true }) {
  /** @type {Map<bigint, { invocation: bigint, artifact: "parent" | "python" | "go", state: import("./generic-artifact-core.js").Continuation | import("./python-artifact-core.js").Step | import("./go-artifact-core.js").Step }>} */
  const handles = new Map()
  let next = 1n
  /**
   * @overload
   * @param {bigint} invocation
   * @param {"parent"} artifact
   * @param {import("./generic-artifact-core.js").Continuation} state
   * @returns {import("./artifact-composition-core.js").StateHandle}
   */
  /**
   * @overload
   * @param {bigint} invocation
   * @param {"python"} artifact
   * @param {import("./python-artifact-core.js").Step} state
   * @returns {import("./artifact-composition-core.js").StateHandle}
   */
  /**
   * @overload
   * @param {bigint} invocation
   * @param {"go"} artifact
   * @param {import("./go-artifact-core.js").Step} state
   * @returns {import("./artifact-composition-core.js").StateHandle}
   */
  /**
   * @param {bigint} invocation
   * @param {"parent" | "python" | "go"} artifact
   * @param {import("./generic-artifact-core.js").Continuation | import("./python-artifact-core.js").Step | import("./go-artifact-core.js").Step} state
   * @returns {import("./artifact-composition-core.js").StateHandle}
   */
  function save(invocation, artifact, state) {
    const id = next++
    handles.set(id, { invocation, artifact, state })
    return { $: "ArtifactProtocol.StateHandle", invocation, id }
  }
  /**
   * @overload
   * @param {import("./artifact-composition-core.js").StateHandle} handle
   * @param {"parent"} artifact
   * @returns {import("./generic-artifact-core.js").Continuation}
   */
  /**
   * @overload
   * @param {import("./artifact-composition-core.js").StateHandle} handle
   * @param {"python"} artifact
   * @returns {import("./python-artifact-core.js").Step}
   */
  /**
   * @overload
   * @param {import("./artifact-composition-core.js").StateHandle} handle
   * @param {"go"} artifact
   * @returns {import("./go-artifact-core.js").Step}
   */
  /**
   * @param {import("./artifact-composition-core.js").StateHandle} handle
   * @param {"parent" | "python" | "go"} artifact
   * @returns {import("./generic-artifact-core.js").Continuation | import("./python-artifact-core.js").Step | import("./go-artifact-core.js").Step}
   */
  function load(handle, artifact) {
    const stored = handles.get(handle.id)
    if (!stored || stored.invocation !== handle.invocation || stored.artifact !== artifact)
      throw new Error("Invalid artifact handle")
    if (!retainPrefixes) handles.delete(handle.id)
    return stored.state
  }
  /** @param {import("./artifact-composition-core.js").Step} step */
  const heldOwnerHandle = (step) => (step.$ === "Service" && "handle" in step.owner ? step.owner.handle.id : undefined)
  /** @param {import("./artifact-composition-core.js").Step} step */
  const heldCommandHandle = (step) =>
    "command" in step && "handle" in step.command ? step.command.handle.id : undefined
  /** @param {unknown} value */
  const dispatchTag = (value) => (value && typeof value === "object" && "$" in value ? String(value.$) : "undefined")
  /**
   * @param {import("./artifact-composition-core.js").Step} initial
   * @returns {import("./artifact-composition-core.js").Step}
   */
  const pump = (initial) => {
    let step = initial
    while (true) {
      if (step.$ === "ParentCall") {
        const command = step.command
        let raw
        switch (command.$) {
          case "Initial":
            raw = parent.initial(command.input)
            break
          case "ResumeParent":
            raw = parent.resume(load(command.handle, "parent"), command.event)
            break
          case "Execute":
            raw = parent.execute(command.action)
            break
          default:
            throw new Error("Unknown parent dispatch tag " + dispatchTag(command))
        }
        const handle = save(step.context.invocation, "parent", raw)
        try {
          step = composition.receive_parent(step, handle, raw)
        } finally {
          if (!retainPrefixes && heldOwnerHandle(step) !== handle.id) handles.delete(handle.id)
        }
        continue
      }
      if (step.$ === "PythonCall") {
        const command = step.command
        let raw
        switch (command.$) {
          case "BeginPython":
            raw = python.begin(command.command)
            break
          case "ResumePython":
            raw = python.resume(load(command.handle, "python"), command.reply)
            break
          default:
            throw new Error("Unknown Python dispatch tag " + dispatchTag(command))
        }
        const handle = save(step.context.invocation, "python", raw)
        try {
          step = composition.receive_python(step, handle, python.view(raw))
        } finally {
          if (!retainPrefixes && heldOwnerHandle(step) !== handle.id) handles.delete(handle.id)
        }
        continue
      }
      if (step.$ === "GoCall") {
        const command = step.command
        let raw
        switch (command.$) {
          case "BeginGo":
            raw = go.begin(command.command)
            break
          case "ResumeGo":
            raw = go.resume(load(command.handle, "go"), command.reply)
            break
          case "AdvanceGo":
            raw = go.advance(load(command.handle, "go"))
            break
          default:
            throw new Error("Unknown Go dispatch tag " + dispatchTag(command))
        }
        const handle = save(step.context.invocation, "go", raw)
        try {
          step = composition.receive_go(step, handle, go.view(raw))
        } finally {
          if (!retainPrefixes && heldOwnerHandle(step) !== handle.id && heldCommandHandle(step) !== handle.id)
            handles.delete(handle.id)
        }
        continue
      }
      if (step.$ === "Service" || step.$ === "Terminal") return step
      throw new Error("Unknown composition dispatch tag " + dispatchTag(step))
    }
  }
  return {
    /** @type {"artifact"} */
    kind: "artifact",
    /** @param {import("@hapsland/source-analysis/direct-event/graph-resolver").ResolverInput} input */
    initial: (input) => pump(composition.initial(intoArtifact(input))),
    /**
     * @param {import("./artifact-composition-core.js").Step} step
     * @param {import("./artifact-abi.d.ts").ResolverAbi<import("./generic-artifact-core.js").ResolverEvent>} event
     */
    resume: (step, event) => pump(composition.resume(step, intoArtifact(event))),
    /** @param {import("./artifact-composition-core.js").Step} step */
    view: (step) => intoResolver(composition.view(step)),
    dispose: () => handles.clear(),
    /** @param {bigint} invocation */
    disposeInvocation: (invocation) => {
      for (const [id, value] of handles) if (value.invocation === invocation) handles.delete(id)
    },
    get retainedHandles() {
      return handles.size
    }
  }
}
