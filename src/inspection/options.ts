export const validInspectionAddress = (host: string, port: number): boolean =>
  ["127.0.0.1", "localhost", "::1"].includes(host) && Number.isInteger(port) && port >= 0 && port <= 65535
