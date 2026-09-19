# Running the classifier as an editor hook

How a type-design check built on the nine rules (`JEV-TYPE-CLASSIFIER.md`) attaches to
Claude Code, what the platform provides, and what the projects already doing something
like it have learned. On hold: nothing here is built.

The shape assumed throughout: a CLI takes a changed TypeScript file, ships its source to
a remote classifier, and gets back per-rule readings in 0..1. Two properties drive every
decision below — the check is **network-bound** (2–5s) and it **sends source off the
machine**.

---

## 1. Platform mechanics

### Events

`PostToolUse` is the one that fires after a successful tool call and carries the edit.
The full event list runs to 33 entries; the ones relevant to a post-edit check are:

| Event | Fires |
|---|---|
| `PreToolUse` | before a tool call; can block it |
| `PostToolUse` | after a tool call succeeds |
| `PostToolUseFailure` | after a tool call fails |
| `PostToolBatch` | after a batch of parallel tool calls resolves, before the next model call |
| `Stop` | when Claude finishes responding |
| `SubagentStop` | when a subagent finishes |
| `SessionEnd` | when a session terminates |

`PostToolUse` **cannot block** — the tool has already run. Whatever it emits is advisory
in fact, whatever its register.

### Input

stdin carries JSON:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "tool_use_id": "toolu_01ABC123...",
  "tool_input": { "file_path": "/path/to/file.ts" },
  "tool_output": {}
}
```

The per-tool shapes of `tool_input` and `tool_output` are not documented and must be read
at runtime. `Edit` does carry `old_string` and `new_string` — established from working
hook code rather than from the docs (§3, slopguard).

### Output channels

Three ways a `PostToolUse` hook reaches the model, and they differ in register more than
in effect:

| Channel | How it lands |
|---|---|
| exit 0 + `hookSpecificOutput.additionalContext` | a system reminder beside the tool result; the human sees nothing |
| exit 0 + `decision: "block"` + `reason` | the reason sits next to the tool result; reads to the agent as a gate |
| exit 2 + stderr | surfaced to the model, framed unconditionally as an error |

**Exit 0 with stderr and no JSON reaches nobody** — it goes to the debug log, never the
transcript. Silence is `{}` or an empty object on stdout.

Other fields: `updatedToolOutput` replaces what the model reads back from the call;
`systemMessage` addresses the human in the transcript; `suppressOutput` hides hook
output from the transcript. `additionalContext` beyond 10,000 characters spills to a file
with a preview in its place.

For readings on a scale, `additionalContext` is the fit: `decision: "block"` overstates a
0.74, and exit 2 misreports a measurement as a failure.

The docs advise phrasing the payload as factual statements rather than imperatives —
text framed as an out-of-band system command can trip the model's prompt-injection
defenses.

### Asynchrony

A command hook takes `"async": true`. Claude Code starts the process, continues
immediately, and delivers `additionalContext` and `systemMessage` on the next
conversation turn when the process exits. The timeout is not enforced once async.
`"asyncRewake": true` additionally wakes an idle session on exit 2.

This is the native answer to a network-bound check, and the documented example for it is
an async test-suite run reporting through `additionalContext`.

### Timeouts and concurrency

Default 600s for `command`, `http` and `mcp_tool` hooks; 30s for `prompt` hooks and for
`UserPromptSubmit`; 60s for `agent` hooks; `SessionEnd` gets a 1.5s budget shared across
all its hooks, raisable to 60s. Per-hook `timeout` overrides. All hooks matching an event
run in parallel, and every one completes before the results merge.

### Matchers

Matchers select on **tool name only**: `"matcher": "Edit|Write|MultiEdit"`. Filtering by
path or extension happens inside the hook script, off `tool_input.file_path`.

### Configuration and trust

Precedence, highest first: managed settings, `claude --settings`,
`.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`, plugin
`hooks/hooks.json`, skill and subagent frontmatter. Project `.claude/` hooks run only
once the user accepts workspace trust. `/hooks` browses, it does not approve.
`"disableAllHooks": true` turns them off; managed-settings hooks keep running unless that
is set there too.

Settings-file hooks behave the same across CLI, desktop, VS Code and web. The Agent SDK
has a separate hook system that fires in agent code, not from settings.

### Hooks that are themselves models

`type: "prompt"` runs a model (Haiku by default) with the hook JSON as `$ARGUMENTS`,
expecting `{ok, reason, impossible}` back. On `PostToolUse`, `ok: false` ends the turn
unless `continueOnBlock: true`, which feeds the reason back and continues.
`type: "agent"` is experimental.

---

## 2. Prior art

| Project | ★ | What it does | Channel |
|---|---|---|---|
| [mikluko/slopguard](https://github.com/mikluko/slopguard) | 0 | ONNX embedding classifier scores comments a write added | `additionalContext`, exit 0 |
| [cairnscore/cairn-score-skill](https://github.com/cairnscore/cairn-score-skill) | 6 | LLM judge rates external resources the agent touches | none — posts to a score service |
| [carlrannaberg/claudekit](https://github.com/carlrannaberg/claudekit) | 762 | Biome/ESLint/tsc/tests/`no-any` per edit; `self-review` at Stop | exit 2; `decision: "block"` at Stop |
| [nizos/tdd-guard](https://github.com/nizos/tdd-guard) | 2342 | LLM validates edits against TDD state | `decision: "block"`, exit 0 |
| [bartolli/claude-code-typescript-hooks](https://github.com/bartolli/claude-code-typescript-hooks) | 178 | tsc + lint, severity tiered by whether the file was the one edited | stderr, exit 2 or 0 |
| [vika2603/comment-checker-rs](https://github.com/vika2603/comment-checker-rs) | 2 | tree-sitter comment checks on changed ranges | stderr + exit 2 |
| [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) | 3923 | reference repo; ruff and type-checker validators | `decision: "block"` |
| [usetig/sage](https://github.com/usetig/sage) | 106 | LLM council reviews plans and responses | none — human relays |
| [karanb192/claude-code-hooks](https://github.com/karanb192/claude-code-hooks) | 517 | 22 plugins, formatters and guards | `{}` always; logs to disk |
| [zoharbabin/brand-voice](https://github.com/zoharbabin/brand-voice) | 0 | prose checks on `.md`, same engine as hook / MCP / CI | exit 2 |

Star counts and behaviour as of 2026-09-17.

### The two clusters

Fast deterministic tools run synchronously on `PostToolUse` and exit 2, which blocks in
effect if not in mechanism: claudekit, bartolli, brand-voice, comment-checker-rs.

Expensive or semantic checks leave the edit path: claudekit's `self-review` at Stop,
cairn's async-plus-queue flushed at Stop, tdd-guard storing a lint verdict and delivering
it at the next `PreToolUse`, sage out-of-band entirely. The one project running an LLM
synchronously on the edit path — tdd-guard, 60s budget in `PreToolUse` — is also the one
with documented evasion problems.

A classifier hook belongs in the second cluster.

### slopguard, read closely

The nearest architectural relative: a hook that ships written text to a classifier and
reports class plus score. What it has solved:

- **Diff scoping.** `written()` reconstructs the byte spans the call authored from
  `old_string`/`new_string`, narrowing by shared prefix and suffix so an insertion claims
  the line it added rather than the lines it carried along. `spanBudget = 64`.
- **A findings budget of three.** "Three ranked lines are one unit of work; a longer list
  is a report, and a report gets skimmed."
- **Per-session dedupe** keyed on a hash of the finding's prose, not its location, with
  24h staleness and a 4096-entry cap.
- **Fail-open under panic**: `defer func() { if recover() != nil { os.Exit(0) } }()`,
  because exit 2 is how `PostToolUse` spells a blocking error and a stack dump would land
  in the agent's context in place of a nudge.
- **A JSONL log of every finding**, as the only honest measure of how often the tool is
  wrong.
- Gating: tool filter, extension-to-grammar lookup, a 2MiB byte ceiling, and
  regular-files-only, since a named pipe blocks the hook until the harness kills it.

### The silencing problem

The canonical failure, from slopguard's session package:

> The agent's answer to a nudge is an edit, that edit re-enters the hook, and the
> rewritten comment is inside the new text. Without a memory the same line can be nudged
> until the agent finds the one move that reliably ends it, which is deleting the comment
> — the behaviour the nudge's own wording argues against.

A rule-reading linter has a sharper version of this: r7 on `count: number` is silenced by
renaming the field, r6 by deleting the domain name, r9 by moving the effect somewhere the
hook is not looking. Every such move raises the score and worsens the code.

Three countermeasures are in the wild, and they compose:

1. Dedupe on semantic identity that survives a rewrite, so a reworded version of the same
   finding does not re-fire.
2. State in the message that rewording is not a fix — slopguard says what is judged is
   where the claim lives, not which words carry it.
3. Pre-authorise the non-action. comment-checker-rs instructs KEEP / REWRITE / REMOVE as
   three equal outcomes and adds "if a comment might be useful to a future reader, keep
   it". An agent with no licensed way to disagree will comply destructively.

comment-checker-rs also batches the response, which halves the loop:

> Do NOT edit the file yet. Collect ALL flagged comments from this report first, then
> apply all changes in a SINGLE edit operation.

### Evasion, and why advisory avoids it

tdd-guard's issues record the agent enumerating its own routes around a blocking hook:
`git stash`, stopping test runs, and replacing code through Bash `sed`/`echo` to escape a
`Write|Edit` matcher ([#62](https://github.com/nizos/tdd-guard/issues/62)), with MCP
tools as a second door ([#48](https://github.com/nizos/tdd-guard/issues/48)). Issue
[#41](https://github.com/nizos/tdd-guard/issues/41) is the agent listing them on request.

An advisory hook has nothing to evade. This is an argument for `additionalContext` beyond
register alone.

### Loops and fatigue

`stop_hook_active` guards Stop hooks against re-entry; claudekit checks it first thing.
A checker that itself invokes an agent needs a nesting guard — cairn sets `CAIRN_NESTED`.
A PostToolUse hook firing 25 times in a row is a
[documented outcome](https://dev.to/ji_ai/writing-a-claude-code-book-with-claude-code-when-posttooluse-hooks-loop-25-times-4h46).

Against noise: a hard findings cap, per-session dedupe, only-if-changed markers,
randomised question sampling (claudekit `self-review`), severity tiers where non-local
findings are shown but exit 0 (bartolli), and an explicit token budget for hook output
(karanb192 ships `docs/token-diet.md`).

### Failing open is universal

Unknown extension, unreadable file, parse failure, missing tool, malformed JSON, panic —
every project exits 0 silently. False positives in the plumbing cost adoption outright,
whatever tolerance the rules themselves have for them.

### Sending source off the machine

cairn is the only project shipping content to a remote service, and it is the only one
with: a host denylist matched by substring, a five-regex credential redactor applied
before sending (Authorization headers, `X-*-Token`, `?api_key=`, URL userinfo, JSON
`"secret":`), a dry-run mode, an enable/disable env var, `umask 077` logs rotated at 1MB,
and 1-in-N cadence sampling with a per-session counter under `fcntl.flock`.

For a classifier that posts source to an API, this is the adoption blocker — not latency.

---

## 3. What is verified and what is not

Verified from the hooks reference: the event list, the stdin schema, `PostToolUse` not
blocking, exit-0 stderr being invisible, the three output channels, `async` semantics,
timeouts, matcher scope, settings precedence, prompt hooks.

Verified from working hook code, not the docs: that `tool_input` carries `old_string` and
`new_string` for `Edit`.

**Not verified: that an agent acts on an advisory score.** The literature covers noise,
latency, loops and evasion; no report anywhere describes an agent simply ignoring
advisory feedback, which is as likely to mean nobody measured it as that it does not
happen. The whole idea rests on this.

Also unmeasured: whether readings on a 0..1 scale are legible to an agent at all, against
the categorical verdicts every project above emits.

---

## 4. Consequences for a build

The shape that follows from all of the above:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/jev-advise.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

- `async: true`, so the network call is off the turn.
- `additionalContext`, exit 0, always; `{}` when there is nothing to say.
- Fail open on every error path.
- Extension and size gating in the script; the matcher cannot do it.
- A findings cap around three, ranked by reading.
- Per-session dedupe on the identity of the finding, not its line.
- A message that pre-authorises "this is right as it stands" and says that renaming is
  not a fix.
- An opt-out env var, a dry-run mode, and a local JSONL log of every reading as eval
  data.
- Redaction before sending, or a statement that source leaves the machine unredacted.

### The gating question, deferred

Sending every edit is wasteful: most edits touch no declaration, and the classifier only
reads type design. The wanted behaviour is to call the API only when an edit touches an
interface or schema. `tool_input` carrying `old_string`/`new_string` makes this reachable
without re-reading the file, and slopguard's `written()` is the prior art for turning
those into authored spans. Nothing here is designed.
