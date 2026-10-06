import { CLI_NAME, SETUP_COMMAND, LOGIN_OPTION, LOGOUT_OPTION } from "@hapsland/runtime-environment/runtime/cli-names"

export interface OperationHelp {
  readonly flag?: string
  readonly aliases?: ReadonlyArray<string>
  readonly hidden?: boolean
  readonly stdin?: string
  readonly description: string
}

/** Flag names, aliases, descriptions and input examples belong to one catalog. */
export const ROOT_OPERATIONS = {
  "feedback-preview": { description: "Print synthetic agent feedback; no stdin, writes or review request" },
  credentials: {
    flag: "inspect-credentials",
    aliases: ["credentials"],
    stdin: "request.json",
    description: "Read version-one credentials JSON from stdin; report credential sources without secrets; no Jev call"
  },
  status: {
    aliases: ["inspect-consent"],
    stdin: "request.json",
    description:
      "Read version-one status JSON from stdin; report session activity as JSON (or --human); no review request"
  },
  explain: {
    aliases: ["config-explain"],
    stdin: "request.json",
    description:
      "Read version-one explain JSON from stdin; report effective path/configuration policy as JSON; no review request"
  },
  doctor: {
    stdin: "request.json",
    description: "Read version-one doctor JSON from stdin; inspect an installed integration offline and return JSON"
  },
  "install-preview": {
    stdin: "request.json",
    description:
      "Read version-one installation JSON from stdin; preview owned hook changes without applying them; return JSON"
  },
  install: {
    stdin: "request.json",
    description:
      "Read version-one installation JSON from stdin; apply changes authorized by proposalDigest; return JSON"
  },
  "update-preview": {
    stdin: "request.json",
    description:
      "Read version-one update JSON from stdin; preview installed hook changes without applying them; return JSON"
  },
  update: {
    stdin: "request.json",
    description: "Read version-one update JSON from stdin; apply changes authorized by proposalDigest; return JSON"
  },
  uninstall: {
    stdin: "request.json",
    description:
      "Read version-one uninstall JSON from stdin; remove owned hooks under the request's authorization; return JSON"
  },
  "evaluation-plan": {
    stdin: "request.json",
    description:
      "Read version-one evaluation plan JSON from stdin; describe the evaluation without live calls; return JSON"
  },
  "evaluation-run": {
    stdin: "request.json",
    description:
      "Read version-one evaluation run JSON from stdin; run the requested evaluation; live calls require --evaluation-live and explicit live authorization"
  },
  "evaluation-report": {
    stdin: "request.json",
    description: "Read version-one evaluation report JSON from stdin; format the supplied evidence as JSON"
  },
  [SETUP_COMMAND]: {
    stdin: "request.json",
    description:
      "Read version-one setup JSON from stdin; preview/apply only the request's authorized stages; interactive requests may prompt for credentials; return JSON"
  },
  demo: {
    stdin: "request.json",
    description:
      "Read version-one demo JSON from stdin; preview/cancel a first review or execute its explicitly authorized live selection"
  },
  [LOGIN_OPTION]: {
    description:
      "Save a Jev key in native storage using a masked terminal prompt; --json selects structured output; no Jev call"
  },
  [LOGOUT_OPTION]: {
    description:
      "Remove native saved login; environment/file credentials remain separate; --json selects structured output; no Jev call"
  },
  "package-identity": { hidden: true, description: "Internal package executable identity" },
  "runtime-identity": { hidden: true, description: "Internal packaged runtime identity" },
  pilot: {
    description:
      "Guided terminal setup; optional CLIENT or --host selects one runtime, otherwise opens the client selector"
  }
} as const satisfies Record<string, OperationHelp>

export type RootOperation = keyof typeof ROOT_OPERATIONS
export const operationHelp = (key: RootOperation): OperationHelp => ROOT_OPERATIONS[key]
export const rootOperationExample = (key: RootOperation) => {
  const information = operationHelp(key)
  return {
    command: `${CLI_NAME} --${information.flag ?? key}${information.stdin === undefined ? "" : ` < ${information.stdin}`}`,
    description: information.description
  }
}
export const rootOperationReference = () =>
  Object.entries(ROOT_OPERATIONS).flatMap(([key, value]) => {
    const information: OperationHelp = value
    if (information.hidden === true) return []
    return [
      {
        name: `--${information.flag ?? key}`,
        aliases: information.aliases ?? [],
        description: information.description,
        input: information.stdin === undefined ? "No JSON request" : "Version-one JSON on stdin"
      }
    ]
  })
