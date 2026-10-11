// Constructor names are an artifact ABI detail of Bend 2.0.36, not policy.
// Graph and artifact-value payloads retain their separate declaration owners.
// Resident artifacts refer to those exact owners through different import paths.
const artifactNamespaces = [
  [
    "../../../../source-artifacts/src/direct-event/value/Value.",
    "../../../../../source-artifacts/src/direct-event/value/Value."
  ],
  ...["Types", "State", "Protocol", "Loop", "ComposedBudget", "Clock"].map((name) => [
    name + ".",
    "../../../../../source-analysis/src/direct-event/graph-resolution/" + name + "."
  ]),
  ["traversal/core.", "../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core."],
  ...["PreparationModel", "Configuration", "RawText", "Input", "Package", "ArtifactProtocol"].map((name) => [
    "go-module/" + name + ".",
    "../../../../../source-analysis/src/direct-event/graph-resolution/go-module/" + name + "."
  ]),
  ["python-module/Session.", "../../../../../source-analysis/src/direct-event/graph-resolution/python-module/Session."],
  [
    "python-module/ArtifactProtocol.",
    "../../../../../source-analysis/src/direct-event/graph-resolution/python-module/ArtifactProtocol."
  ],
  ["../../../../agent-flow-bend/ImportGraph.", "../../../../../agent-flow-bend/ImportGraph."]
]
const artifactAbi = (value, intoArtifact) => {
  if (Array.isArray(value)) return value.map((item) => artifactAbi(item, intoArtifact))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "$" && typeof item === "string") {
        for (const [resolver, artifact] of artifactNamespaces) {
          const from = intoArtifact ? resolver : artifact
          if (item.startsWith(from)) return [key, (intoArtifact ? artifact : resolver) + item.slice(from.length)]
        }
        return [key, item]
      }
      return [key, artifactAbi(item, intoArtifact)]
    })
  )
}

// Closed export dispatch only. Source-bearing artifact states stay behind handles.
// Prefix mode preserves immutable states for cloned probes. Operational mode
// consumes artifact handles; owned-artifact-driver binds their outer lifecycle
// to Canonical. Production resident preparation integration remains open.
export function createArtifactMachine({ composition, parent, python, go, retainPrefixes = true }) {
  const handles = new Map()
  let next = 1n
  const save = (invocation, artifact, state) => {
    const id = next++
    handles.set(id, { invocation, artifact, state })
    return { $: "ArtifactProtocol.StateHandle", invocation, id }
  }
  const load = (handle, artifact) => {
    const stored = handles.get(handle.id)
    if (!stored || stored.invocation !== handle.invocation || stored.artifact !== artifact)
      throw new Error("Invalid artifact handle")
    if (!retainPrefixes) handles.delete(handle.id)
    return stored.state
  }
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
            throw new Error("Unknown parent dispatch tag " + command.$)
        }
        const handle = save(step.context.invocation, "parent", raw)
        try {
          step = composition.receive_parent(step, handle, raw)
        } finally {
          if (!retainPrefixes && step.owner?.handle?.id !== handle.id) handles.delete(handle.id)
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
            throw new Error("Unknown Python dispatch tag " + command.$)
        }
        const handle = save(step.context.invocation, "python", raw)
        try {
          step = composition.receive_python(step, handle, python.view(raw))
        } finally {
          if (!retainPrefixes && step.owner?.handle?.id !== handle.id) handles.delete(handle.id)
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
            throw new Error("Unknown Go dispatch tag " + command.$)
        }
        const handle = save(step.context.invocation, "go", raw)
        try {
          step = composition.receive_go(step, handle, go.view(raw))
        } finally {
          if (!retainPrefixes && step.owner?.handle?.id !== handle.id && step.command?.handle?.id !== handle.id)
            handles.delete(handle.id)
        }
        continue
      }
      if (step.$ === "Service" || step.$ === "Terminal") return step
      throw new Error("Unknown composition dispatch tag " + step.$)
    }
  }
  return {
    initial: (input) => pump(composition.initial(artifactAbi(input, true))),
    resume: (step, event) => pump(composition.resume(step, artifactAbi(event, true))),
    view: (step) => artifactAbi(composition.view(step), false),
    dispose: () => handles.clear(),
    disposeInvocation: (invocation) => {
      for (const [id, value] of handles) if (value.invocation === invocation) handles.delete(id)
    },
    get retainedHandles() {
      return handles.size
    }
  }
}
