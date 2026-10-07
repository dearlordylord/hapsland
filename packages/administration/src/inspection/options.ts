export const INSPECTION_HOSTS = ["127.0.0.1", "localhost", "::1"] as const
export const DEFAULT_INSPECTION_HOST = INSPECTION_HOSTS[0]
export const DEFAULT_INSPECTION_PORT = 0
export const validInspectionAddress = (host: string, port: number): boolean =>
  INSPECTION_HOSTS.some((allowed) => allowed === host) && Number.isInteger(port) && port >= 0 && port <= 65535
