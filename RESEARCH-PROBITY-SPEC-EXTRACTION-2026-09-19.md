# Probity externally observable specification (cleanroom extraction)

**Snapshot:** 2026-09-19. **Subject:** `nizos/probity`, `main` branch and the published-package metadata visible from that branch. This document records externally observable contracts, defaults, and behaviors only. It does not propose changes or evaluate the design.

## 1. Product scope and documented non-goals

Probity is an npm package and CLI that installs into a coding agent's hook system. Its stated operation is to inspect file writes and shell commands before execution, block actions that violate configured rules, and return a reason to the agent. The README lists deterministic string/regex rules and AI-validated rules, and says custom rules are TypeScript functions. [README](https://raw.githubusercontent.com/nizos/probity/main/README.md)

The documented supported host agents are Claude Code, OpenAI Codex, and GitHub Copilot CLI. The README says “more coming”; the CLI setup page specifies only those three `--agent` values. [README](https://raw.githubusercontent.com/nizos/probity/main/README.md) [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md)

Probity reads each host's session transcript rather than installing language/framework reporters. The README claims language/test-runner neutrality at that layer; the built-in fast path nevertheless has a finite language and test-pattern catalog. [README](https://raw.githubusercontent.com/nizos/probity/main/README.md) [rules](https://raw.githubusercontent.com/nizos/probity/main/docs/rules.md)

There is no documented result type for advisory findings, source ranges, severities, confidence scores, finding arrays, or post-hoc review reports. The public rule result is `pass` or `violation`; the host-facing decision is `allow` or `block`. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts) [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts) [configuration](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md)

## 2. Installation, distribution, and versioning

The package name is `@nizos/probity`. The current `package.json` reports version `1.10.1`, MIT license, ESM (`"type": "module"`), Node `>=22`, and a `probity` executable mapped to `dist/bin.js`. The npm package publishes only `dist`. [package.json](https://raw.githubusercontent.com/nizos/probity/main/package.json)

The package exports the root API, `./types`, and `./rules`; each export points to generated `dist` JavaScript and declaration files. [package.json](https://raw.githubusercontent.com/nizos/probity/main/package.json)

Runtime dependencies include `@anthropic-ai/claude-agent-sdk` `0.3.204`, `@github/copilot-sdk` `1.0.5`, `@openai/codex-sdk` `0.154.0`, `jiti`, `picomatch`, and `zod`. Optional AST language packs are declared as optional peer dependencies; the package also depends on `@ast-grep/napi`. [package.json](https://raw.githubusercontent.com/nizos/probity/main/package.json)

The documented install is `npm install -D @nizos/probity`. For non-Node projects the setup page documents `npm install -g @nizos/probity`. [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md)

The package scripts define build, typecheck, Vitest test, integration test, lint, formatting, and a combined `checks` command. Publication requires `dist/bin.js` to exist. [package.json](https://raw.githubusercontent.com/nizos/probity/main/package.json)

## 3. Host adapters and hook wiring

### 3.1 Claude Code

The supported hook event is `PreToolUse`. The recommended integration is the Claude plugin marketplace:

```text
/plugin marketplace add nizos/probity
/plugin install probity@probity
```

The shipped plugin hook matcher is `Bash|Write|Edit|NotebookEdit`. Manual setup uses project `.claude/settings.json` or user-global `~/.claude/settings.json`, with a command hook invoking `npx @nizos/probity --agent claude-code`. [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md) [plugin hook](https://raw.githubusercontent.com/nizos/probity/main/hooks/hooks.json)

The Claude adapter recognizes `Bash`, `Edit`, `Write`, and `NotebookEdit`; unrecognized tool names become a no-op command. `Bash` becomes a command action. `Write` becomes a write action from `file_path` and `content`. `Edit` reads the current file and applies `old_string`/`new_string`; `replace_all` defaults to `false`. `NotebookEdit` becomes a write using `notebook_path` and `new_source`, or empty content for delete mode. All recognized write tools require a non-empty `cwd`. [Claude adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/adapter.ts)

The Claude block response is JSON with `hookSpecificOutput.hookEventName: "PreToolUse"`, `permissionDecision: "deny"`, and `permissionDecisionReason`. Allow produces empty stdout, leaving the host's normal permission flow in place. [Claude adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/adapter.ts)

### 3.2 OpenAI Codex

The supported hook event is `PreToolUse`. The setup example places it in `~/.codex/hooks.json`, with regex matcher `^(Bash|apply_patch|Edit|Write)$` and command `npx @nizos/probity --agent codex`. The setup document identifies `apply_patch` as Codex's file-write payload and `Edit`/`Write` as matcher synonyms. [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md)

The Codex adapter recognizes `Bash` and `apply_patch`. `Bash` requires `tool_input.command` and becomes a command action. `apply_patch` requires `tool_input.command` and `cwd`; each `*** Add File:`, `*** Update File:`, or `*** Delete File:` header starts one write action. The section from a header through the next header is the action content. Paths are resolved against `cwd` and normalized to absolute POSIX paths. A patch with no recognized file header is invalid. [Codex adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts) [Codex adapter tests](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.test.ts)

The Codex block response is `{ "decision": "block", "reason": "..." }`; allow is empty stdout. [Codex adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts)

### 3.3 GitHub Copilot CLI

The supported hook event is `preToolUse` in Copilot's hook configuration. The documented file is `.github/hooks/probity.json` at the project root; the setup page says the cloud agent also reads it from the repository's default branch. The file has `version: 1`, a `preToolUse` array, and shell-specific `bash` and `powershell` command values. Every Copilot tool call fires this hook in the documented configuration. [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md)

The Copilot adapter recognizes lower-case `bash`, `create`, and `edit`. `toolArgs` accepts either a structured object or a JSON-encoded string. `bash` becomes a command action. `create` uses `path` and `file_text` to form a write. `edit` reads the file and applies `old_str`/`new_str`. Recognized write payloads require `cwd`. [Copilot adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/adapter.ts) [object-or-JSON helper](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/object-or-json-string.ts)

The Copilot block response is `{ "permissionDecision": "deny", "permissionDecisionReason": "..." }`; allow is empty stdout. [Copilot adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/adapter.ts)

### 3.4 Registry and adapter contract

The source registry maps `claude-code`, `codex`, `github-copilot`, and `github-copilot-chat` to vendor entries. The last name is hidden from CLI help. Each entry contains an adapter, an AI-agent factory, a transcript reader, and an optional raw-to-canonical event classifier. [registry](https://raw.githubusercontent.com/nizos/probity/main/src/registry.ts) [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts)

The adapter interface is:

```ts
type Adapter = {
  parseAction: (payload: unknown) => Promise<
    | { ok: true; actions: readonly Action[] }
    | { ok: false; reason: string }
  >
  toResponse: (decision: Decision) => string
  sessionPath?: (payload: unknown) => string | undefined
}
```

Adapters own vendor payload parsing and vendor response formatting. The registry is a static source map; the CLI does not discover external adapter packages at runtime. [adapter contract](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts) [registry](https://raw.githubusercontent.com/nizos/probity/main/src/registry.ts)

The adapter helper passes unrecognized tool names through as `{ kind: 'command', command: '' }`. Recognized tool names are excluded from this path, so a malformed recognized payload becomes a parse failure. [adapter helper](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts)

## 4. CLI protocol and command-line precedence

The normal invocation is `probity --agent <vendor> < <hook-payload-json>`. The CLI reads one JSON payload from stdin, loads `probity.config`, evaluates its rules, and writes the selected vendor's response format to stdout. [CLI source](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts) [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md)

`--version` and `--help` are recognized before normal execution. `--agent` is required for a run. `--config <path>` overrides config discovery. `--debug <path>` appends invocation diagnostics. Missing `--agent`, unknown agent, or a missing path after `--config`/`--debug` is a CLI argument error with exit code 2 and stderr; those argument errors do not run vendor evaluation. [argument parser](https://raw.githubusercontent.com/nizos/probity/main/src/utils/parse-args.ts)

The `--config` path is resolved against the current working directory. Without it, Probity walks upward from `process.cwd()` looking for the first `probity.config.ts`, `.mts`, `.js`, or `.mjs`, in that extension order. If no file is found through `/`, config loading throws. [configuration loader](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts) [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts)

The stdin payload is capped at 10 MiB. Exceeding the cap throws during input resolution. Execution failures are projected to a vendor-shaped block response, stderr receives `Probity: <error>`, and the process exits 0. [CLI binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts)

`--debug` writes one JSONL record containing an ISO datetime, parsed-or-raw request, parsed-or-raw response, and trace. A failed debug append is ignored. [CLI binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts)

## 5. Canonical action, decision, outcome, and trace schemas

The canonical action union is:

```ts
type Action =
  | { kind: 'write'; path: string; content: string }
  | { kind: 'command'; command: string }
```

Write paths are absolute POSIX paths after adapter normalization. Command actions carry shell command text. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts)

The canonical decision union is `{ kind: 'allow' }` or `{ kind: 'block'; reason: string }`. An `Outcome` contains that decision and a readonly trace. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts)

The trace entry union is:

```ts
| { kind: 'rule-evaluated'; rule: string; result: RuleResult;
    durationMs: number; agentCalls?: readonly AgentCall[] }
| { kind: 'rule-failed'; rule: string; reason: string; durationMs: number }
| { kind: 'parse-failed'; reason: string }
```

The violating rule is included in the trace before short-circuiting. `durationMs` is measured around each rule call. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts) [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts)

`RuleResult` is `{ kind: 'pass', reason?, notes? }` or `{ kind: 'violation', reason }`. `notes` are structured trace context and are not sent to the host agent. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts)

## 6. Session schemas and transcript behavior

The raw session event union is a prompt `{ kind: 'prompt'; text }` or an action `{ kind: 'action'; tool; input; output; toolUseId }`. The canonical session event union is prompt, command, write, or other; the `other` form preserves tool, input, and output. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts)

The vendor transcript readers parse host JSONL files. They emit prompt/action events and associate tool outputs with previously emitted actions by tool-use ID. Missing or unrecognized transcript entries are skipped. The Claude reader recognizes `tool_use`, `tool_result`, and user text content; the Codex reader recognizes response-item messages, function calls/outputs, and custom tool calls/outputs; the Copilot reader recognizes `user.message`, `tool.execution_start`, and `tool.execution_complete`. [Claude transcript](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/transcript.ts) [Codex transcript](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/transcript.ts) [Copilot transcript](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/transcript.ts)

Claude obtains its transcript path from payload `transcript_path`; Codex does the same. Copilot derives `~/.copilot/session-state/<sessionId>/events.jsonl`, or uses `$COPILOT_HOME` when set; `sessionId` must match `[A-Za-z0-9_-]+`. [Claude adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/adapter.ts) [Codex adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts) [Copilot adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/adapter.ts)

The history ADR defines two views: `ctx.rawHistory()` exposes vendor-shaped events; `ctx.history()` maps them to canonical events. Both are optional. A vendor without a transcript reader exposes neither; a vendor without a canonical classifier may still expose raw history. [history ADR](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0003-session-history-via-host-transcript.md)

The raw-to-canonical mappings classify Claude `Bash`/Codex `shell` and `exec_command`/Copilot `bash` as commands, and Claude `Write`/`Edit`/Copilot `create`/`edit` as writes. Other events become `other`; Codex patch/custom tool calls do not have a special canonical write mapping in the current classifier. [Claude event](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/event.ts) [Codex event](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/event.ts) [Copilot event](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/event.ts)

Transcript JSONL reads default to 100 MiB, refuse symlink paths, parse one non-empty line at a time, and silently drop lines that fail `JSON.parse`. [JSONL reader](https://raw.githubusercontent.com/nizos/probity/main/src/utils/read-jsonl.ts)

## 7. Rule contracts and composition semantics

The rule contract is:

```ts
type Rule = (
  action: Action,
  ctx?: RuleContext,
) => RuleResult | Promise<RuleResult>
```

The context fields are all optional: `agent`, `history`, `rawHistory`, and `readFile`. Rule factories may accept options and return a rule function. [rule contract](https://raw.githubusercontent.com/nizos/probity/main/src/rules/contract.ts)

The config is:

```ts
type RuleBlock = {
  files?: readonly [string, ...string[]]
  rules: readonly Rule[]
}
type RuleEntry = Rule | RuleBlock
type Config = { rules: readonly RuleEntry[]; ai?: Agent }
```

`defineConfig` is a typed identity function. A flat rule runs for every action. A rule block without `files` also applies to every action. A block with `files` filters writes by path; command actions pass the block-level filter and are left to the contained rules' action-kind checks. [config source](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts) [configuration docs](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md)

Entries and rules execute sequentially in declaration order. The first violation returns a block and prevents later rules/entries from running. If all evaluated rules pass, the decision is allow. [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts) [engine tests](https://raw.githubusercontent.com/nizos/probity/main/src/engine.test.ts)

For a payload that expands to multiple actions, the CLI evaluates actions sequentially, appends each action's trace, and returns on the first block. A fresh AI-call collector is created per action. [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts)

## 8. Path matching

Config-file-relative globs are anchored to the directory containing the config file. A glob beginning with `**` remains unanchored. A negation retains `!` while anchoring the remainder; `!**` remains unanchored. Paths are normalized to POSIX form before matching. [config loader](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts) [config tests](https://raw.githubusercontent.com/nizos/probity/main/src/config.test.ts) [POSIX path helper](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/posix-absolute.ts)

The matcher uses picomatch with `dot: true`, supports include patterns and `!` ignore patterns, and supplies `**` as the positive include if a list contains only negations. An empty runtime pattern list matches nothing. [path matcher](https://raw.githubusercontent.com/nizos/probity/main/src/rules/utils/match-paths.ts)

For a rule block, an empty `files` list matches nothing at runtime. Non-write actions always pass the block-level path filter. [path matcher](https://raw.githubusercontent.com/nizos/probity/main/src/rules/utils/match-paths.ts) [engine tests](https://raw.githubusercontent.com/nizos/probity/main/src/engine.test.ts)

## 9. Rule context: AI, history, and file reads

`Config.ai`, when present, is injected into every rule context and takes precedence over the selected vendor's default agent. The host vendor remains selected by `--agent`; it is not selected by config. [config source](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts) [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts)

The AI contract is:

```ts
type Agent = { reason: (prompt: string) => Promise<Verdict> }
type Verdict = {
  kind: 'pass' | 'violation'
  reason: string
  meta?: AgentTelemetry
}
```

`AgentTelemetry` is a readonly JSON value map for operator trace metadata. Rules receive the verdict; telemetry is attached by the CLI-side collector to trace entries. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts) [agent-call collector](https://raw.githubusercontent.com/nizos/probity/main/src/agent-call-collector.ts)

The default validator is the agent factory in the selected vendor registry entry. Claude uses one SDK query turn, disables thinking, tools, permission prompts, auto-memory, settings sources, and session persistence. Codex starts a read-only thread with no approval, network, or web search. Copilot starts a session with no available tools and stops it after the response. [Claude agent](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/agent.ts) [Codex agent](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/agent.ts) [Copilot agent](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/agent.ts)

Vendor validators parse a JSON verdict. The shared parser accepts a complete JSON response, a JSON fenced block, or a balanced JSON object embedded after prose. A thrown SDK call, unparseable output, or wrong verdict shape becomes `{ kind: 'violation', reason }`. [verdict parser](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/to-verdict.ts)

`ctx.readFile` returns `{ kind: 'present', content }`, `{ kind: 'absent' }`, or `{ kind: 'unknown' }`. The CLI supplies a one-megabyte maximum. It opens with `O_NOFOLLOW`; symlink refusal, oversized content, permissions, and other I/O errors produce `unknown`, while `ENOENT` produces `absent`. [safe reader](https://raw.githubusercontent.com/nizos/probity/main/src/utils/safe-read.ts) [CLI context](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts)

## 10. Built-in rules and defaults

The package documents five built-in rule factories: `enforceTdd`, `enforceFilenameCasing`, `forbidCommandPattern`, `forbidContentPattern`, and `requireCommand`. Their documented options and action scopes are in the [rules reference](https://raw.githubusercontent.com/nizos/probity/main/docs/rules.md).

### `enforceTdd`

`enforceTdd()` applies only to writes. It asks the selected AI validator to judge recent history, current on-disk file content, and the pending write. Its default instruction describes Red → Green → Refactor, test-first behavior, minimum implementation, clean-red recovery, and refactoring under green. The validator response must be the standard JSON verdict. [rule source](https://raw.githubusercontent.com/nizos/probity/main/src/rules/enforce-tdd.ts) [rule reference](https://raw.githubusercontent.com/nizos/probity/main/docs/rules.md)

Options are `instructions` (string replacement or `(defaults) => string` extension), `maxEvents` default `10`, `maxContentChars` default `6000`, and `fastPath` default `false`. Matching writes call the AI unless the fast path applies. [rule source](https://raw.githubusercontent.com/nizos/probity/main/src/rules/enforce-tdd.ts)

The fast path passes without AI only when enabled, the file language is recognized, the current file can be read, and the AST count difference is exactly one new recognized test node. Unknown file content, unknown language, and all other writes use the AI path. Recognized languages are TypeScript, JavaScript, Python, C#, Ruby, and PHP; optional AST packs are required for Python, C#, Ruby, and PHP, and missing packs fall through to AI. [rule source](https://raw.githubusercontent.com/nizos/probity/main/src/rules/enforce-tdd.ts) [language registry](https://raw.githubusercontent.com/nizos/probity/main/src/rules/matchers/languages/index.ts) [rule reference](https://raw.githubusercontent.com/nizos/probity/main/docs/rules.md)

When `ctx.agent` is absent, `enforceTdd` returns a violation explaining that an AI agent is unavailable. It reads raw history on demand, trims it to the configured window, and formats unavailable current content as a marker. [enforceTdd source](https://raw.githubusercontent.com/nizos/probity/main/src/rules/enforce-tdd.ts)

### `enforceFilenameCasing`

This rule requires `{ style: 'kebab-case' | 'camelCase' | 'snake_case' }`, applies to writes, and passes commands. It examines the basename. Kebab-case rejects uppercase or underscore; camelCase rejects a hyphen or an initial uppercase; snake_case rejects uppercase. [source](https://raw.githubusercontent.com/nizos/probity/main/src/rules/enforce-filename-casing.ts)

### `forbidCommandPattern` and `forbidContentPattern`

Both require `match: string | RegExp` and `reason: string`. The command rule tests command text and passes writes; the content rule tests write content and passes commands. A string is a substring match. Regex `g` and `y` flags are removed before testing so matching is stateless across calls. [command rule](https://raw.githubusercontent.com/nizos/probity/main/src/rules/forbid-command-pattern.ts) [content rule](https://raw.githubusercontent.com/nizos/probity/main/src/rules/forbid-content-pattern.ts) [matcher](https://raw.githubusercontent.com/nizos/probity/main/src/rules/utils/string-or-regex-matches.ts)

### `requireCommand`

`requireCommand` applies to command actions. It requires `before: { kind: 'command'; match }`, a prior-command `command` string/regex, optional `after`, and optional `reason`. It finds the most recent matching canonical command in history. Without `after`, every later event invalidates it. With `{ kind: 'write' }`, only writes invalidate it; with `{ kind: 'command', match? }`, matching commands invalidate it, or all commands if `match` is omitted. [source](https://raw.githubusercontent.com/nizos/probity/main/src/rules/require-command.ts) [reference](https://raw.githubusercontent.com/nizos/probity/main/docs/rules.md)

## 11. History windows and content limits

The shared history window takes the last `maxEvents` events and clips each prompt's text or action's output to `maxContentChars`. Oversized values retain a head and tail separated by an omission marker. [history trimming](https://raw.githubusercontent.com/nizos/probity/main/src/rules/trim-history.ts)

The built-in TDD defaults are 10 events and 6000 characters per event. The source does not apply those limits to arbitrary custom-rule calls to `ctx.history()`/`ctx.rawHistory()`; custom rules control their own use of those accessors. [enforceTdd](https://raw.githubusercontent.com/nizos/probity/main/src/rules/enforce-tdd.ts) [configuration](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md)

## 12. Blocking, allow behavior, exit behavior, and failure modes

An evaluated violation becomes a block with the violation reason. All passes become allow. A rule throw or off-contract result becomes a `rule-failed` trace entry and a block with `rule error: ...`. [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts)

Invalid JSON input, invalid vendor payload, or a recognized tool payload that fails schema validation becomes a `parse-failed` trace entry and a vendor-shaped block response. Unknown tools intentionally parse as no-op commands and therefore do not block unless a rule independently matches the empty command. [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts) [adapter helper](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts)

Missing config, config import/load errors, transcript-read errors reached by a rule, validator failures, and other execution exceptions are caught by the binary and projected to a block response. The binary writes the block to stdout, writes the error to stderr, and exits 0. [CLI binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts) [configuration](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts)

Allow is represented as empty stdout for the shipped adapters. This means the host's normal permission/confirmation behavior remains active; Probity does not emit an explicit allow grant. [Claude adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/adapter.ts) [Codex adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts) [Copilot adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/adapter.ts)

No source or documentation defines an advisory/warning response. The only operator-visible non-blocking data is the local `--debug` trace, which is not part of the host response. [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts) [binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts) [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts)

## 13. Security, trust, and privacy behavior

The README says Probity has no separate API key or subscription: AI rules use the selected vendor's official SDK and existing user authentication. It also says AI-validated rules add a turn per checked action, while pattern rules add none. [README](https://raw.githubusercontent.com/nizos/probity/main/README.md)

The default Codex validator is configured with `sandboxMode: 'read-only'`, `approvalPolicy: 'never'`, `networkAccessEnabled: false`, and `webSearchEnabled: false`. The default Claude validator has no tools, `permissionMode: 'dontAsk'`, no setting sources, disabled auto-memory, and `persistSession: false`. The default Copilot validator creates a session with no available tools. [Codex agent](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/agent.ts) [Claude agent](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/agent.ts) [Copilot agent](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/agent.ts)

Project configuration is executable TypeScript/JavaScript loaded by Jiti. Config files can import the package and provide arbitrary rule functions and an arbitrary `Config.ai` implementation. [config source](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts) [configuration docs](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md)

File and transcript reads refuse symlinks. File reads are capped at 1 MiB when exposed through `ctx.readFile`; transcript JSONL reads default to 100 MiB. Transcript malformed lines are dropped rather than surfaced as errors. [safe reader](https://raw.githubusercontent.com/nizos/probity/main/src/utils/safe-read.ts) [JSONL reader](https://raw.githubusercontent.com/nizos/probity/main/src/utils/read-jsonl.ts)

`--debug` intentionally stores raw-or-parsed hook requests and responses plus traces at the user-provided path. The source does not redact those values. [CLI binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts)

## 14. State, ordering, and concurrency

The engine has no session-state store in its public API. Session context is read from the host transcript on demand. The history ADR describes the host transcript as the source and says Probity carries no session state. [history ADR](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0003-session-history-via-host-transcript.md)

Within one invocation, rules are awaited serially, entries are processed in declaration order, and evaluation stops at the first block. Multiple actions from one payload are also awaited serially and stop at the first block. [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts) [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts)

The agent-call collector is created per parsed action. It tracks the current rule through `onRuleStart`/`onRuleEnd`, records call duration and verdict, and attaches calls to that rule's trace entry. [agent-call collector](https://raw.githubusercontent.com/nizos/probity/main/src/agent-call-collector.ts) [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts)

The source exposes lifecycle callbacks `onRuleStart` and `onRuleEnd`; both are invoked around each rule, with the end callback in a `finally` path. The callbacks are framework-agnostic and do not alter the decision. [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts) [ADR-0009](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0009-outcome-value-type-and-evaluate-hooks.md)

The README states that Probity is safe with parallel sessions, but the exact cross-process behavior of simultaneous `--debug` appends, concurrent transcript reads, and concurrent validator calls is not specified by the public contract. [README](https://raw.githubusercontent.com/nizos/probity/main/README.md) [CLI binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts)

## 15. Testable invariants exposed by the repository

The repository's tests establish the following observable invariants:

- `defineConfig` returns its config unchanged; config loading supports all four documented extensions, anchors ordinary and negated globs, preserves `**` intent, and discovers configs by walking upward. [config tests](https://raw.githubusercontent.com/nizos/probity/main/src/config.test.ts)
- A passing rule produces allow; a violating rule produces block with its reason; an async rule is awaited; a thrown rule blocks; an off-contract result blocks; and later rules are not called after the first violation. [engine tests](https://raw.githubusercontent.com/nizos/probity/main/src/engine.test.ts)
- A `files` block skips a nonmatching write, still evaluates a command action, and an empty runtime files array matches nothing. [engine tests](https://raw.githubusercontent.com/nizos/probity/main/src/engine.test.ts)
- Codex multi-file patches produce one write action per file, malformed `apply_patch` payloads fail parsing, missing `cwd` fails parsing, absolute paths remain absolute, and unknown tool names become a no-op command. [Codex adapter tests](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.test.ts)
- Codex allow is empty stdout and block is a JSON `decision:block` response. [Codex adapter tests](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.test.ts)
- The Claude validator uses one turn, no tools, disabled thinking, `dontAsk`, disabled auto-memory, no setting sources, and no persisted session. Invalid or non-JSON verdicts are violations. [Claude agent tests](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/agent.test.ts)

## 16. Unresolved or underspecified points in the public surface

The following are observable gaps or questions, recorded without assuming behavior:

1. The source registry contains a hidden `github-copilot-chat` entry, while setup docs and CLI help describe three public vendors. Its supported invocation and payload contract are not documented in the setup/reference pages. [registry](https://raw.githubusercontent.com/nizos/probity/main/src/registry.ts) [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts) [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md)
2. The repository tree contains vendor-specific source beyond the documented set in some snapshots, but the static registry and package metadata determine the callable CLI vendor set. The source does not document a dynamic adapter discovery mechanism. [registry](https://raw.githubusercontent.com/nizos/probity/main/src/registry.ts) [package.json](https://raw.githubusercontent.com/nizos/probity/main/package.json)
3. `Config` is a TypeScript type and `defineConfig` is an identity function; the config loader does not publish a runtime schema or a documented merge behavior for malformed/default-export values. [config source](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts)
4. The public rule result has no advisory or structured-finding variant. The behavior of a custom rule that logs a finding and returns pass is therefore only “allow plus local side effects”; no host-facing warning channel is specified. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts) [configuration docs](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md)
5. The adapter contract allows `sessionPath` to be absent, and context fields are optional. The behavior of history-dependent custom rules when a host lacks transcript access is left to each rule. [adapter contract](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts) [rule contract](https://raw.githubusercontent.com/nizos/probity/main/src/rules/contract.ts)
6. The CLI's 10 MiB stdin cap, 1 MiB safe file-read cap, 100 MiB transcript cap, and TDD prompt-window defaults are specified independently; there is no public global configuration for changing the CLI stdin or safe-read caps. [CLI binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts) [CLI context](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts) [JSONL reader](https://raw.githubusercontent.com/nizos/probity/main/src/utils/read-jsonl.ts) [enforceTdd](https://raw.githubusercontent.com/nizos/probity/main/src/rules/enforce-tdd.ts)
7. Commands that mutate files remain canonical `command` actions because the adapters only map their explicitly modeled native write tools to `write`; the public action contract does not define command-to-write expansion. [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts) [Codex adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts) [Claude adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/adapter.ts)
8. Cross-process ordering and atomicity of `--debug` JSONL writes and simultaneous sessions are not specified in the public docs or source contract. [CLI binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts) [README](https://raw.githubusercontent.com/nizos/probity/main/README.md)

## 17. Source index

- [README](https://raw.githubusercontent.com/nizos/probity/main/README.md)
- [package metadata](https://raw.githubusercontent.com/nizos/probity/main/package.json)
- [setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md), [configuration](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md), [rules](https://raw.githubusercontent.com/nizos/probity/main/docs/rules.md)
- [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts), [config](https://raw.githubusercontent.com/nizos/probity/main/src/config.ts), [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts), [CLI](https://raw.githubusercontent.com/nizos/probity/main/src/cli.ts), [binary](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts), [registry](https://raw.githubusercontent.com/nizos/probity/main/src/registry.ts)
- [rule contract](https://raw.githubusercontent.com/nizos/probity/main/src/rules/contract.ts), [path matcher](https://raw.githubusercontent.com/nizos/probity/main/src/rules/utils/match-paths.ts), [safe file reader](https://raw.githubusercontent.com/nizos/probity/main/src/utils/safe-read.ts), [JSONL reader](https://raw.githubusercontent.com/nizos/probity/main/src/utils/read-jsonl.ts)
- [adapter contract](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts), [Claude adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/claude-code/adapter.ts), [Codex adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts), [Copilot adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/github-copilot/adapter.ts)
- [ADR-0001: vendor adapter boundary](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0001-per-vendor-adapter-anti-corruption-layer.md), [ADR-0003: host transcript history](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0003-session-history-via-host-transcript.md), [ADR-0009: outcome and lifecycle hooks](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0009-outcome-value-type-and-evaluate-hooks.md)
