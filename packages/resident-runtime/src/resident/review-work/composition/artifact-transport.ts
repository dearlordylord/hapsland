import type { ArtifactAbi, ResolverAbi } from "./artifact-abi.d.ts"

const artifactNamespaces: readonly (readonly [string, string])[] = [
  [
    "../../../../source-artifacts/src/direct-event/value/Value.",
    "../../../../../source-artifacts/src/direct-event/value/Value."
  ],
  ...["Types", "State", "Protocol", "Loop", "ComposedBudget", "Clock"].map((name): readonly [string, string] => [
    name + ".",
    "../../../../../source-analysis/src/direct-event/graph-resolution/" + name + "."
  ]),
  ["traversal/core.", "../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core."],
  ...["PreparationModel", "Configuration", "RawText", "Input", "Package", "ArtifactProtocol"].map(
    (name): readonly [string, string] => [
      "go-module/" + name + ".",
      "../../../../../source-analysis/src/direct-event/graph-resolution/go-module/" + name + "."
    ]
  ),
  ["python-module/Session.", "../../../../../source-analysis/src/direct-event/graph-resolution/python-module/Session."],
  [
    "python-module/ArtifactProtocol.",
    "../../../../../source-analysis/src/direct-event/graph-resolution/python-module/ArtifactProtocol."
  ],
  ["../../../../agent-flow-bend/ImportGraph.", "../../../../../agent-flow-bend/ImportGraph."]
]
const artifactAbi = (value: unknown, intoArtifact: boolean): unknown => {
  if (Array.isArray(value)) return value.map((item: unknown) => artifactAbi(item, intoArtifact))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]: [string, unknown]) => {
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

// Structural assertions are limited to the exact declared namespace relocation.
export const intoArtifact = <Value>(value: Value): ArtifactAbi<Value> => artifactAbi(value, true) as ArtifactAbi<Value>
export const intoResolver = <Value>(value: Value): ResolverAbi<Value> => artifactAbi(value, false) as ResolverAbi<Value>
