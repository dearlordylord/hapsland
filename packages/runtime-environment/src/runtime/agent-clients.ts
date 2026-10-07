/** Agent runtimes supported by the public CLI and guided setup. */
export const SUPPORTED_CLIENTS = ["claude", "codex", "pi"] as const
export const CLIENT_NAMES = { claude: "Claude Code", codex: "Codex CLI", pi: "Pi" } as const satisfies Record<
  (typeof SUPPORTED_CLIENTS)[number],
  string
>
export const supportedClientNames = SUPPORTED_CLIENTS.map((client) => CLIENT_NAMES[client]).join(", ")
