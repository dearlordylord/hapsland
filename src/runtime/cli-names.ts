/** Shared by executable naming, CLI declarations, invocation and human command templates. */
export const CLI_NAME = "hapsland" as const
export const SETUP_COMMAND = "setup" as const
export const NEW_KEY_OPTION = "new-key" as const
export const NEW_KEY_FLAG = `--${NEW_KEY_OPTION}` as const
export const LOGIN_OPTION = "login" as const
export const LOGIN_FLAG = `--${LOGIN_OPTION}` as const
export const LOGOUT_OPTION = "logout" as const
export const LOGOUT_FLAG = `--${LOGOUT_OPTION}` as const
export const UPDATE_CHANNELS = ["latest", "next"] as const
export const DEFAULT_UPDATE_CHANNEL = UPDATE_CHANNELS[0]
export const setupCommand = (host?: string, newKey = false): string =>
  [CLI_NAME, SETUP_COMMAND, ...(host === undefined ? [] : [host]), ...(newKey ? [NEW_KEY_FLAG] : [])].join(" ")
