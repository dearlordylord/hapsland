import { CONNECTIONS, PLACE_ORDER, SQUARES } from "./production-flow-presentation.ts"

/** Mermaid entity codes keep presentation text inside quoted labels. */
const label = (text: string): string => text.replace(/["#&<>|`\r\n]/gu, (character) => `#${character.codePointAt(0)};`)

/** Possible dashboard routes, without implying that a command or effect occurred. */
export const productionFlowMermaid = (): string =>
  [
    "flowchart TB",
    ...PLACE_ORDER.map((stage) => `  ${stage}["${label(SQUARES[stage].title)}"]`),
    ...CONNECTIONS.map(({ from, to, label: description }) => `  ${from} -->|"${label(description)}"| ${to}`)
  ].join("\n")
