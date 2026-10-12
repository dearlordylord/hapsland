import { mapGraphAbi } from "../frontend-codec.ts"
import type { ArtifactAbi, ResolverAbi } from "./artifact-abi.d.ts"

const artifactNamespaces: readonly (readonly [string, string])[] = [
  [
    "../../../../source-artifacts/src/direct-event/value/Value.",
    "../../../../../source-artifacts/src/direct-event/value/Value."
  ],
  ...["Types", "State", "Protocol", "Loop", "ComposedBudget", "Clock"].map((name): readonly [string, string] => [
    name + ".",
    "../" + name + "."
  ]),
  ["traversal/core.", "../traversal/core."],
  ...["PreparationModel", "Configuration", "RawText", "Input", "Package", "ArtifactProtocol"].map(
    (name): readonly [string, string] => ["go-module/" + name + ".", "../go-module/" + name + "."]
  ),
  ["python-module/Session.", "../python-module/Session."],
  ["python-module/ArtifactProtocol.", "../python-module/ArtifactProtocol."],
  ["../../../../agent-flow-bend/ImportGraph.", "../../../../../agent-flow-bend/ImportGraph."]
]
const artifactAbi = (value: unknown, intoArtifact: boolean): unknown =>
  mapGraphAbi(value, (key, item) => {
    if (key === "$" && typeof item === "string")
      for (const [resolver, artifact] of artifactNamespaces) {
        const from = intoArtifact ? resolver : artifact
        if (item.startsWith(from)) return (intoArtifact ? artifact : resolver) + item.slice(from.length)
      }
    return item
  })

// Structural assertions are limited to the exact declared namespace relocation.
export const intoArtifact = <Value>(value: Value): ArtifactAbi<Value> => artifactAbi(value, true) as ArtifactAbi<Value>
export const intoResolver = <Value>(value: Value): ResolverAbi<Value> => artifactAbi(value, false) as ResolverAbi<Value>
