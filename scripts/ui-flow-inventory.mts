import {
  uiFlows,
  inputFragments,
  directUiExceptions
} from "../packages/administration/src/interaction/flow-registry.ts"

export const flowInventoryDocument = () => {
  const safe = (id: string) => id.replaceAll("-", "_")
  const edges: string[] = []
  for (const [id, flow] of Object.entries(uiFlows)) {
    edges.push(`  ${safe(id)}["${id}"]`)
    for (const child of flow.composes) edges.push(`  ${safe(id)} -->|"subflow"| ${safe(child)}`)
  }
  for (const [id, fragment] of Object.entries(inputFragments)) {
    edges.push(`  fragment_${safe(id)}["${id} shared input"]`)
    for (const parent of fragment.parents) edges.push(`  ${safe(parent)} -.-> fragment_${safe(id)}`)
  }
  for (const [id, exception] of Object.entries(directUiExceptions))
    for (const child of exception.composes)
      edges.push(`  direct_${safe(id)}["${id}"] -->|"authorized terminal subflow"| ${safe(child)}`)
  const workflows = Object.entries(uiFlows).map(
    ([id, flow]) =>
      `| ${id} | [${flow.entry}](../../${flow.owner}) | ${flow.inputs.join(", ")} | [Replay diagram](${flow.diagram.split("/").at(-1)}) |`
  )
  const fragments = Object.entries(inputFragments).map(
    ([id, fragment]) =>
      `| ${id} | [${fragment.entry}](../../${fragment.owner}) | ${fragment.parents.map((parent) => `[${parent}](${uiFlows[parent].diagram.split("/").at(-1)})`).join(", ")} |`
  )
  const exceptions = Object.entries(directUiExceptions).map(
    ([id, exception]) => `| ${id} | [${exception.entry}](../../${exception.owner}) | ${exception.reason} |`
  )
  return `This inventory and connection graph derive from the closed [production registry](../../packages/administration/src/interaction/flow-registry.ts). Connections declare interpreter composition; workflow diagrams below derive from actual named replays. Neither graph establishes exhaustive transition coverage or physical terminal support.

\`\`\`mermaid
flowchart TD
${edges.join("\n")}
\`\`\`

| Workflow | Production entry | Registered prompt kinds | Generated documentation |
| --- | --- | --- | --- |
${workflows.join("\n")}

Shared input fragments belong to registered parent workflows; they cannot introduce a standalone conversation without their own workflow registration and replay generator.

| Shared fragment | Production entry | Parent diagrams |
| --- | --- | --- |
${fragments.join("\n")}

Direct input/output exceptions have no invented dialog states. Any human prompt they add must use a registered workflow; interactive JSON setup delegates to login explicitly.

| Direct exception | Production entry | Reason and boundary |
| --- | --- | --- |
${exceptions.join("\n")}`
}
