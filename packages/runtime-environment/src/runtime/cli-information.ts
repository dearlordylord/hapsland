import { RELEASE_VERSION, RELEASE_COMMAND_NAMES } from "./release-identity.generated.ts"

export const PACKAGE_VERSION = RELEASE_VERSION
export const VERSION_FLAG = "--version"
export const HELP_FLAGS = ["--help", "-h"] as const
export const PACKAGE_COMMAND_NAMES = RELEASE_COMMAND_NAMES

const workerInformation = {
  hook: {
    arguments: "[native hook flags]",
    description:
      "Native hook RPC client. Uses read-only runtime inputs and the resident transport; unrelated arguments return quietly.",
    exampleArguments: ["--version", "--codex-event", "--pi-edit"]
  },
  doctor: {
    arguments: "[--json]",
    description:
      "Inspect local package prerequisites; no Jev request. Human output is the default, including when redirected. Use --json for the version-one report. For installed agent checks, use hapsland doctor CLIENT.",
    exampleArguments: ["", "--json"]
  },
  parser: {
    arguments: "< request.json",
    description:
      "Internal source-analysis worker. Read one JSON object with string path and source fields from stdin and write the analysis as JSON. No review request. --demo-validate validates the existing demo in the current directory without reading stdin.",
    exampleArguments: ["< request.json", "--demo-validate"]
  },
  resident: {
    arguments: "RUNTIME_DIRECTORY",
    description:
      "Internal review worker, normally started by Hapsland hooks. RUNTIME_DIRECTORY is required; normal startup creates private state and listens on its socket until idle shutdown or a signal. This is not the inspection dashboard. Use hapsland dashboard for inspection.",
    exampleArguments: ["/absolute/private/runtime-directory"]
  }
} as const

export const workerCommandReference = () =>
  Object.entries(workerInformation).map(([role, information]) => ({
    name: PACKAGE_COMMAND_NAMES[role as keyof typeof workerInformation],
    ...information
  }))

export const formatWorkerHelp = (role: keyof typeof workerInformation): string => {
  const information = workerInformation[role]
  const name = PACKAGE_COMMAND_NAMES[role]
  return (
    [
      `Usage: ${name} ${information.arguments}`,
      information.description,
      "",
      `Information: ${HELP_FLAGS.join(", ")} shows help; ${VERSION_FLAG} reports this package version. Both exit before reading stdin or creating state.`,
      "",
      "Examples:",
      ...information.exampleArguments.map((arguments_) => `  ${name}${arguments_ === "" ? "" : ` ${arguments_}`}`)
    ].join("\n") + "\n"
  )
}

/** Worker information must return before stdin, state or diagnostics are used. */
export const handleWorkerInformation = (role: keyof typeof workerInformation, args: ReadonlyArray<string>): boolean => {
  if (args.length !== 1) return false
  if (HELP_FLAGS.some((flag) => args[0] === flag)) process.stdout.write(formatWorkerHelp(role))
  else if (args[0] === VERSION_FLAG) process.stdout.write(PACKAGE_VERSION + "\n")
  else return false
  return true
}
