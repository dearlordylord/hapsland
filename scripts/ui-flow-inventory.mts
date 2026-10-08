import { cliJourneyCommands } from "../packages/administration/src/cli-command.ts"
import { uiFlows, uiJourneys } from "../packages/administration/src/interaction/flow-registry.ts"

export const flowInventoryDocument = () => {
  const commands = cliJourneyCommands()
  const rows = (Object.keys(uiJourneys) as (keyof typeof uiJourneys)[]).map(
    (id) =>
      `| ${uiJourneys[id].title} | ${commands[id].map((command) => `\`${command}\``).join("<br>")} | [Journey diagram](${uiFlows[uiJourneys[id].diagramFlow].diagram.split("/").at(-1)}) |`
  )
  return `Choose the journey by the command you run. Named-agent variants skip discovery or selection where the command already supplies the agent. This index is generated from the command and parameter declarations used by the CLI parser.

| User journey | CLI command | Diagram |
| --- | --- | --- |
${rows.join("\n")}


Credential verification is a step within setup, not a separate CLI journey. Its [detail diagram](verification.md) explains paid-check approval and recovery. Setup includes credential saving; [login](login.md) also documents the standalone saving command.

Explicit automation and observation commands keep their existing contracts: [unattended setup and lifecycle JSON](../installation-workflows.md), [credential stdin input](../configuration.md), [doctor and dashboard](../status.md), and [rule inspection](../configuration.md#declarative-rules). They do not introduce implicit terminal dialogs.`
}
