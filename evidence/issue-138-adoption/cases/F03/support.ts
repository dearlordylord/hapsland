function remoteClient(): number { return globalThis.fetch ? 1 : 0 }
export function fetchRemote(): number { return remoteClient() }
