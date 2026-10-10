import type { InvocationSession } from "./session.ts"

export const cliSwitch = (session: InvocationSession, name: string): boolean =>
  session.options !== undefined &&
  name in session.options &&
  session.options[name as keyof typeof session.options] === true

export const isCredentialCommand = (session: InvocationSession) =>
  cliSwitch(session, "login") || cliSwitch(session, "logout")
