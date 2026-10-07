import type { SetupClient } from "./client-selection.ts"
import { SETUP_COMMAND, DEFAULT_UPDATE_CHANNEL } from "@hapsland/runtime-environment/runtime/cli-names"
import { SUPPORTED_CLIENTS } from "@hapsland/runtime-environment/runtime/agent-clients"

export const clientCommandDefinitions = [
  {
    name: SETUP_COMMAND,
    summary: "Set up review integrations interactively or with an explicit unattended plan",
    description:
      "Without CLIENT, a terminal opens the client selector; an explicit client selects one profile. Guided setup previews changes and asks before installing. Unattended setup requires explicit client, review and credential choices (unless applying a saved plan); --no-input suppresses prompts, while --apply separately authorizes changes. Local setup is offline; guided setup may offer a separately confirmed paid key check.",
    clientDescription:
      "Optional in a terminal (opens selector); required for unattended choices unless --apply-plan supplies them",
    options: "setup",
    examples: ["", ...SUPPORTED_CLIENTS]
  },
  {
    name: "update",
    summary: "Preview and confirm updates to registered integrations",
    description: `Without CLIENT, updates registered profiles. Requires a terminal and confirmation. The registry channel defaults to ${DEFAULT_UPDATE_CHANNEL}; --version selects a release within a channel. --target and --tarball cannot be combined with other release selectors. For automation, use version-one --update-preview / --update JSON requests instead of this interactive command.`,
    clientDescription: "Optional; omitted means all registered profiles",
    options: "update",
    examples: ["", ...SUPPORTED_CLIENTS.map((client) => `${client} --channel ${DEFAULT_UPDATE_CHANNEL}`)]
  },
  {
    name: "doctor",
    summary: "Inspect installed integrations offline (read-only)",
    description:
      "Without CLIENT, checks registered profiles. Reports local configuration, credentials and installation readiness; native trust and actual review execution remain unverified. Human output does not require a terminal. For structured output, use a version-one --doctor JSON request. Package prerequisites are checked separately by hapsland-doctor.",
    clientDescription: "Optional; omitted means all registered profiles",
    options: "profile",
    examples: ["", ...SUPPORTED_CLIENTS]
  },
  {
    name: "repair",
    summary: "Restore missing owned Hapsland hooks",
    description:
      "Without CLIENT, repairs registered profiles. Requires a terminal; previews and asks before applying. Changed or conflicting entries are not replaced by repair; use reinstall for marked Hapsland entries. Keeps unrelated hooks. For unattended workflows, use the documented version-one installation requests.",
    clientDescription: "Optional; omitted means all registered profiles",
    options: "target",
    examples: SUPPORTED_CLIENTS
  },
  {
    name: "reinstall",
    summary: "Replace marked Hapsland hooks, preserving user settings",
    description:
      "Without CLIENT, reinstalls registered profiles. Requires a terminal; previews and asks before applying. Replaces only marked Hapsland entries and preserves unrelated hooks and user settings. For unattended workflows, use the documented version-one installation requests with reinstall enabled.",
    clientDescription: "Optional; omitted means all registered profiles",
    options: "target",
    examples: SUPPORTED_CLIENTS
  },
  {
    name: "uninstall",
    summary: "Remove owned Hapsland hooks from registered integrations",
    description:
      "Without CLIENT, uninstalls registered profiles. Requires a terminal; previews and asks before removal. Preserves unrelated hooks and leaves the package installed. For automation, use a version-one --uninstall JSON request.",
    clientDescription: "Optional; omitted means all registered profiles",
    options: "profile",
    examples: SUPPORTED_CLIENTS
  }
] as const
export const clientCommands = clientCommandDefinitions.map((command) => command.name)
export type ClientCommand = (typeof clientCommandDefinitions)[number]["name"]
const piProfile = (home: string | undefined, executable: string | undefined) => ({
  host: "pi" as const,
  ...(home === undefined ? {} : { piHome: home }),
  ...(executable === undefined ? {} : { piExecutable: executable })
})
export const profileFields = (host: SetupClient, flags: ReadonlyMap<string, string>) => {
  const home = flags.get(`--${host}-home`)
  const executable = flags.get(`--${host}-executable`)
  if (host === "pi") return piProfile(home, executable)
  return host === "claude"
    ? {
        host,
        ...(home === undefined ? {} : { claudeHome: home }),
        ...(executable === undefined ? {} : { claudeExecutable: executable })
      }
    : {
        host,
        ...(home === undefined ? {} : { codexHome: home }),
        ...(executable === undefined ? {} : { codexExecutable: executable })
      }
}
