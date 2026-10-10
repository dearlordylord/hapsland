import type { InvocationSession } from "../invocation/session.ts"
import { profileFields } from "./client-command.ts"
import type { SetupClient } from "./client-selection.ts"

export const flagValue = (session: InvocationSession, name: string): string | undefined =>
  session.client?.flags.get(name)

export const positionalHost = (session: InvocationSession) => session.client?.host

export const selectedHost = (session: InvocationSession): SetupClient => session.client?.host ?? "codex"

export const hostFields = (session: InvocationSession, host: SetupClient) =>
  profileFields(host, session.client?.flags ?? new Map())
