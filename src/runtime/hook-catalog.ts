/** Installed hook definitions. Installers, extensions and README generation consume this catalog. */
export type CommandHookEvent = "PreToolUse" | "PostToolUse" | "Stop" | "SubagentStop" | "UserPromptSubmit";
type CommandHookDefinition = {
  readonly event: CommandHookEvent;
  readonly flags: readonly string[];
  readonly ownership: "edit" | "composed";
  readonly timeout: number;
  readonly matcher?: string;
  readonly async?: true;
  readonly exec?: true;
  readonly purpose: string;
};
const codexMatcher = "^(apply_patch|Edit|Write|Bash)$";
const claudeMatcher = "Edit|Write";
export const commandHooks = {
  codex: {
    beforeEdit: { event: "PreToolUse", flags: ["--composed-before-edit-hook", "--composed-host=codex-cli"], ownership: "composed", timeout: 5, matcher: codexMatcher, exec: true, purpose: "Register an edit attempt before the tool runs" },
    afterEdit: { event: "PostToolUse", flags: ["--codex-hook", "--controlled-writer", "--composed-edit-hook"], ownership: "edit", timeout: 10, matcher: codexMatcher, purpose: "Report the edit and collect ready advice" },
    background: { event: "PostToolUse", flags: ["--composed-background-hook", "--composed-host=codex-cli"], ownership: "composed", timeout: 25, matcher: codexMatcher, async: true, purpose: "Deliver advice that finishes after the edit response" },
    stop: { event: "Stop", flags: ["--composed-stop-hook", "--composed-host=codex-cli"], ownership: "composed", timeout: 5, purpose: "Collect admitted review results before the agent finishes" },
    subagentStop: { event: "SubagentStop", flags: ["--composed-stop-hook", "--composed-host=codex-cli"], ownership: "composed", timeout: 5, purpose: "Collect admitted review results before a subagent finishes" },
  },
  claude: {
    beforeEdit: { event: "PreToolUse", flags: ["--composed-before-edit-hook", "--composed-host=claude-code"], ownership: "composed", timeout: 5, matcher: claudeMatcher, exec: true, purpose: "Register an edit attempt before the tool runs" },
    afterEdit: { event: "PostToolUse", flags: ["--claude-hook", "--controlled-writer", "--composed-edit-hook"], ownership: "edit", timeout: 5, matcher: claudeMatcher, purpose: "Report the edit and collect ready advice" },
    stop: { event: "Stop", flags: ["--composed-stop-hook", "--composed-host=claude-code"], ownership: "composed", timeout: 5, purpose: "Collect admitted review results before the agent finishes" },
    subagentStop: { event: "SubagentStop", flags: ["--composed-stop-hook", "--composed-host=claude-code"], ownership: "composed", timeout: 5, purpose: "Collect admitted review results before a subagent finishes" },
    prompt: { event: "UserPromptSubmit", flags: ["--composed-prompt-hook", "--composed-host=claude-code"], ownership: "composed", timeout: 4, purpose: "Notify the resident of the user prompt; does not open a review round" },
  },
} as const satisfies Record<string, Record<string, CommandHookDefinition>>;

export const piHookCommand = { flags: ["--pi-hook"], timeoutMs: 7_000 } as const;
export const piHooks = {
  agentStart: { event: "agent_start", purpose: "Remember the agent identity for cleanup", callsResident: false },
  toolCall: { event: "tool_call", tool: "edit", purpose: "Register a supported edit attempt", callsResident: true },
  toolResult: { event: "tool_result", tool: "edit", purpose: "Report the edit and offer ready advice in the tool result", callsResident: true },
  beforeSettle: { event: "agent_before_settle", purpose: "Offer review advice before the agent settles", callsResident: true },
  beforeSwitch: { event: "session_before_switch", purpose: "Retire edit attempts and close owned partitions", callsResident: true },
  shutdown: { event: "session_shutdown", purpose: "Retire edit attempts and close owned partitions", callsResident: true },
  settled: { event: "agent_settled", purpose: "Close the originating agent partition", callsResident: true },
} as const;

export function commandHookGroup(runtime: keyof typeof commandHooks, event: CommandHookEvent, options: {
  readonly command: string;
  readonly editMarker: string;
  readonly composedMarker: string;
  readonly versionFlag?: string;
  readonly controlledReviewer?: boolean;
}) {
  const definitions: readonly CommandHookDefinition[] = Object.values(commandHooks[runtime]);
  const selected = definitions.filter(definition => definition.event === event);
  if (selected.length === 0) throw new Error(`No installed ${runtime} hook for ${event}`);
  const matcher = selected[0]?.matcher;
  return {
    ...(matcher === undefined ? {} : { matcher }),
    hooks: selected.map(definition => {
      const flags = [...definition.flags];
      if (options.controlledReviewer) flags.splice(definition.ownership === "edit" ? 1 : flags.length, 0, "--controlled-reviewer");
      flags.push(definition.ownership === "edit" ? options.editMarker : options.composedMarker);
      if (options.versionFlag) flags.push(options.versionFlag);
      return { type: "command", command: `${definition.exec ? "exec " : ""}${options.command} ${flags.join(" ")}`, timeout: definition.timeout, ...(definition.async ? { async: true } : {}) };
    }),
  };
}
