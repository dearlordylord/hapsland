import type { SetupClient } from "./client-selection.ts"
import { SETUP_COMMAND } from "../runtime/cli-names.ts"

export const clientCommands = [SETUP_COMMAND, "update", "doctor", "repair", "reinstall", "uninstall"] as const
export type ClientCommand = (typeof clientCommands)[number]
export const clients: ReadonlyArray<SetupClient> = ["claude", "codex", "pi"]
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
