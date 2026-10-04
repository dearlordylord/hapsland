export class ResidentCleanupLimitation extends Error {}
export type ResidentIdentity = { readonly pid: number; readonly lifetime: string }
export function probeScopedResident(directory: string, timeoutMs?: number): Promise<ResidentIdentity>
export function stopScopedResident(
  stateRoot: string,
  dependencies?: {
    readonly probe?: (directory: string) => Promise<ResidentIdentity>
    readonly signal?: (pid: number, signal: NodeJS.Signals | 0) => void
    readonly wait?: (milliseconds: number) => Promise<void>
  }
): Promise<{ readonly status: "absent" | "already-stopped" | "stopped" }>
