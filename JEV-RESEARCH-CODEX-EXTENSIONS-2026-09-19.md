# Research: Codex edit hooks and extensible code review

Checked 2026-09-19. This note re-runs the landscape search for the Jev use case: a coding-agent-aware check that can react to edits, plus more general ways to add custom review or lint logic. Sources are first-party product documentation or the source repositories themselves. Star counts and repository activity are snapshots, not quality guarantees.

## Bottom line

Jev no longer needs an upstream Codex integration to get a native realtime seam. The current Codex hook runtime is documented as a stable extensibility framework. `PostToolUse` covers Bash, native `apply_patch`, MCP tools, and other local function tools; file-edit matchers accept `apply_patch` and the `Edit`/`Write` aliases. A command hook can call Jev asynchronously, or an `mcp_tool` hook can call an already-connected local/remote MCP scanner. Codex can feed a result back as developer context (`additionalContext`) or continue the turn with a stop hook.

That is a good fit for Jev if the product is split into:

1. a backend-neutral `JevClient` / analyzer contract;
2. a thin Codex adapter that extracts a bounded edit/diff and emits structured feedback; and
3. an optional plugin package containing the adapter and hook configuration.

The main uncertainty is now operational rather than architectural: hooks are trusted by exact definition hash, plugin and project hook behavior has changed across Codex releases, and the edit is already applied by `PostToolUse`. A release should test the exact supported Codex version and provide a diagnostic/smoke command.

## Official Codex extension points

### Lifecycle hooks are the native realtime seam

OpenAI describes hooks as an extensibility framework for running scripts or MCP tools during the agentic loop. The documented examples include custom logging, prompt-secret scanning, persistent memory, and a custom validation check when a turn stops. Hook events include `PreToolUse`, `PermissionRequest`, `PostToolUse`, compaction events, prompt submission, subagent events, `Stop`, and session events. Matching hooks from multiple files all run, and matching command hooks run concurrently; a hook cannot prevent another matching hook from starting. [Codex Hooks documentation](https://developers.openai.com/codex/hooks) (current release page, checked 2026-09-19).

Codex discovers `hooks.json` or inline `[hooks]` tables from active config layers and documents plugin-bundled lifecycle configuration as supported. The useful locations are user and project `.codex` layers; project hooks require project trust. Non-managed hooks must be reviewed and trusted, with trust recorded against the exact hook-definition hash; changed hooks are skipped until trusted. This means a plugin install is not equivalent to an enabled hook. [Hooks: locations and trust](https://developers.openai.com/codex/hooks#where-codex-looks-for-hooks).

### Post-edit inputs and output register

The current docs say `PostToolUse` runs after Bash, `apply_patch`, MCP, and other local function tools. Its event contains `tool_name`, `tool_input`, and `tool_response`; for Bash and `apply_patch`, the command is in `tool_input.command`. File-edit matchers may use `apply_patch`, `Edit`, or `Write`, while the canonical input tool name remains `apply_patch`. [Hooks: PostToolUse](https://developers.openai.com/codex/hooks#posttooluse).

The event is post-effect: it cannot undo a completed tool call. A hook may return `additionalContext` for model-visible feedback, `decision: "block"` to replace the tool result with feedback and continue the model, or exit 2 with feedback on stderr. `continue: false` stops normal handling of the original result, but does not roll back the edit. For a probabilistic Jev reading, `additionalContext` is the honest register; use blocking only for a separate high-confidence policy.

Codex also documents asynchronous command hooks (`"async": true`) and an `mcp_tool` handler. The MCP form calls a named tool on an already-connected MCP server with structured argument templates, which provides a local/self-hosted backend option without putting a vendor API call in the hook script. [Hooks: async handlers and MCP tool hooks](https://developers.openai.com/codex/hooks#hooks-and-handlers) and [MCP tool hooks](https://developers.openai.com/codex/hooks#mcp-tool-hooks).

Hook output is bounded: long `additionalContext` is written to a temporary file and only a preview is shown to the model. The docs explicitly warn against returning secrets or confidential data in hook output. A Jev adapter should emit a small finding summary and keep source/diff payloads out of output. [Hooks: large output](https://developers.openai.com/codex/hooks#large-hook-output).

### Plugin packaging

OpenAI's plugin packaging page says a plugin can include skills, an MCP server, optional assets, and lifecycle hooks. OpenAI-specific hook settings belong under `extensions.com.openai` in a portable root `plugin.json`; existing `.codex-plugin/plugin.json` remains a compatibility fallback. Public plugins are published to a catalog shared by ChatGPT and Codex; local and repository marketplaces are available for development and team distribution. [Package your plugin](https://developers.openai.com/codex/plugins/build).

The practical implication is that Jev can be distributed as a Codex plugin, but the plugin should treat hook trust, version compatibility, and network disclosure as installation-time concerns. A standalone CLI remains useful for users who do not want plugin installation or who need CI/editor reuse.

## Official Codex review surfaces (not realtime edits)

Codex's `/review` is now available in the CLI, IDE extension, and desktop app. It reviews uncommitted changes, a commit, a branch diff, or a selected scope without changing the working tree. This is an excellent manual or turn-end fallback, but it is not a per-edit callback. [Codex code review](https://developers.openai.com/codex/code-review).

For GitHub pull requests, Codex Cloud can run on demand with `@codex review` or automatically. Repository-specific review behavior is configured in `AGENTS.md` under `## Code Review Rules`, with nested files applying to the code they cover. OpenAI explicitly recommends keeping formatting, lint, and other deterministic checks in CI, and reserving review rules for consequential repository-specific behavior. This is the strongest official answer to “custom review logic,” but it operates on PR diffs in Codex Cloud rather than on every local edit. [Review GitHub pull requests with Codex](https://developers.openai.com/codex/integrations/github), especially the [customization section](https://developers.openai.com/codex/integrations/github#customize-what-codex-reviews).

## Community Codex implementations

### `nizos/probity`: strongest direct prior art for cross-agent custom rules

[`nizos/probity`](https://github.com/nizos/probity) is the most directly relevant existing project found in this pass. It is a TypeScript policy/rule engine for Claude Code, Codex, and GitHub Copilot CLI. It hooks every file write and shell command before execution, supports deterministic command/content/file rules and AI-validated rules, reads recent session activity for context, and returns a reason/path forward when it blocks an action. Its public config is project-owned (`probity.config.ts`) and its README says one config works across supported agents ([README and quick start](https://github.com/nizos/probity#quick-start)).

Probity ships `enforceTdd()`, `forbidCommandPattern()`, `requireCommand()`, `forbidContentPattern()`, and `enforceFilenameCasing()`. Its AI rules reuse the agent vendor's official SDK/authentication rather than requiring a Probity key or subscription; the README distinguishes this from deterministic rules, which add no model turns. This is an important alternative to Jev's initial remote-classifier framing: Probity is a policy engine with backends/vendors underneath, whereas Jev is a typed judgment service that could become one backend used by a policy/review engine.

The repository showed 571 commits, 17 issues, 10 pull requests, 206 stars, and 24 forks when checked on 2026-09-19. Its CI page showed frequent commits/releases and active external pull requests, which is materially stronger maintenance evidence than the small Codex-only hook plugins ([repository](https://github.com/nizos/probity), [CI activity](https://github.com/nizos/probity/actions/workflows/ci.yml)).

Probity is also a warning about enforcement scope. Its approach blocks before writes/commands, so the rule author must cover each agent's tool paths and must handle loops, multi-step state, shell bypasses, and UX of corrective feedback. Jev's intended continuous 0..1 readings are better represented as advisory `additionalContext` after an edit; Probity's block/reason contract is a better fit for hard deterministic policy. A plausible Jev integration is therefore: keep Probity (or a Jev-like host) as the lifecycle/rule engine, and implement Jev as a pluggable semantic evaluator whose findings can be advisory or promoted to policy only by explicit configuration.

### `just-every/plugin-auto-review`: closest native Codex product analogue

[`just-every/plugin-auto-review`](https://github.com/just-every/plugin-auto-review) is a Codex plugin explicitly designed to review agent changes. Its README says it captures a baseline at `UserPromptSubmit`, reviews the baseline-to-stop diff at `Stop`, includes bounded recent transcript context when available, and returns findings as stop feedback so the main agent can fix them. It stores state under `${PLUGIN_DATA}`, uses schema-constrained reviewer output, and fails open on review infrastructure errors. It is turn-end rather than every-edit, but it validates the “plugin + hooks + diff-scoped semantic reviewer” shape.

The repository showed 31 commits, 5 stars, no issues, and no pull requests when checked ([repository metadata](https://github.com/just-every/plugin-auto-review), 2026-09-19). It has tests, plugin validation, npm packaging, and a release workflow, but adoption is still early. Its README names a fixed OpenAI model (`gpt-5.6-terra`) and does not present a backend interface, so Jev should preserve backend substitution explicitly rather than copying that coupling.

### `code-yeongyu/codex-rules`: local context/rule injection

[`code-yeongyu/codex-rules`](https://github.com/code-yeongyu/codex-rules) injects project rule files into Codex context through lifecycle hooks. It exposes `CODEX_RULES_DISABLED`, mode, source, and output-size controls; its default `PostToolUse` matcher is intentionally only Codex's canonical `apply_patch`; and it states that it runs locally, makes no network requests, and avoids logging rule bodies or tool responses ([configuration/debugging/privacy](https://github.com/code-yeongyu/codex-rules#configuration)).

This is not an analyzer, but it is important prior art for privacy-first custom review guidance and for environment-variable kill switches. The repository showed 13 stars and 1 fork when checked (2026-09-19). It is a useful reference for local mode and deterministic context limits, not evidence of broad adoption.

### `CorridorSecurity/hookshot`: cross-agent hook adapter/library

[`CorridorSecurity/hookshot`](https://github.com/CorridorSecurity/hookshot) is a Go library that normalizes hooks for Claude Code, Cursor, Windsurf Cascade, Factory Droid, and OpenAI Codex. Its unified API has `OnBeforeExecution`, `OnAfterFileEdit`, `OnPromptSubmit`, and `OnStop`; its Codex setup registers `Bash|apply_patch|mcp__.*`; and its Codex bridge parses native patches plus common Bash heredoc forms (`apply_patch <<...`, `cat/tee <<... > file`) into per-file edit contexts ([README](https://github.com/CorridorSecurity/hookshot), [Codex reference](https://github.com/CorridorSecurity/hookshot/blob/main/docs/reference-codex.md)).

This is the clearest existing “write one checker, adapt to many coding agents” architecture found in the search. The repository showed 22 commits, 8 open pull requests, 0 issues, 13 stars, and 4 forks on 2026-09-19. It is young, so use it as an implementation reference or integration candidate rather than a mature dependency. Its reference also contains behavior claims tied to particular Codex versions; verify against the current official hook schema before relying on its parser or output helpers.

### OpenAI's `codex-plugin-cc`: Codex review from Claude Code

[`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) is an OpenAI-maintained Claude Code plugin that invokes the local Codex CLI/app server. It provides `/codex:review`, an adversarial review command, delegation, and an optional `Stop` review gate. The gate is explicitly warned to create long-running Claude/Codex loops and consume usage limits ([review-gate README section](https://github.com/openai/codex-plugin-cc#enabling-review-gate)).

This is a comparison point, not a Codex-native solution: it proves a community-facing workflow can delegate a review to another agent, but it does not expose a generic analyzer backend or a per-edit Codex hook. GitHub showed 29 commits and 33.3k stars on 2026-09-19. The high star count is adoption evidence for the cross-agent workflow, not for its review-gate implementation specifically.

### Claude comparison: first-party security-guidance plugin

Anthropic's own Claude Code repository includes [`plugins/security-guidance`](https://github.com/anthropics/claude-code/blob/main/plugins/security-guidance/hooks/security_reminder_hook.py). The source documents a two-layer design: fast pattern rules on every edit via `PostToolUse`, and a `Stop` hook that diffs from a `UserPromptSubmit` baseline and runs two LLM analyses. It has explicit feature toggles, model/key environment variables, deduplication, and fail-open paths ([source architecture and configuration](https://github.com/anthropics/claude-code/blob/main/plugins/security-guidance/hooks/security_reminder_hook.py)).

This is unusually strong precedent for custom review logic, but it also illustrates Jev's privacy objection: LLM review requires an API credential and transmits changed code to the configured model service. The source's default is Anthropic-specific (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`), so it is not backend-neutral.

## General custom review and lint extension systems

These systems do not provide Codex turn events, but they solve the older, broader problem of adding custom review logic around existing linters and CI.

| System | Extension seam | Timing/output | Relevance to Jev |
|---|---|---|---|
| [`reviewdog/reviewdog`](https://github.com/reviewdog/reviewdog) | Pipe any linter or formatter into RDJSON/RDJSONL, diff, Checkstyle, or SARIF; configure runners in `.reviewdog.yml` | Local diff filtering, GitHub/GitLab/other review reporters, inline suggestions where supported | Strong precedent for a stable finding schema and reporter adapters. It showed 9.6k stars, 495 forks, 120 issues, and 7 PRs on 2026-09-19. It can avoid its hosted server by running in CI or using direct API reporters ([reporters and server note](https://github.com/reviewdog/reviewdog#reporters)). |
| [`Danger JS`](https://danger.systems/js/) | Project `Dangerfile.js`/`.ts` contains arbitrary JavaScript/TypeScript review rules | Runs in CI and posts messages, warnings, markdown, or failures on PRs | Strong precedent for repository-owned semantic rules and a plugin ecosystem, but PR/CI-only and requires hosting credentials. [Official overview](https://danger.systems/js/). |
| [`pre-commit`](https://pre-commit.com/) | `.pre-commit-config.yaml` references versioned hook repositories; `repo: local` supports repo-owned hooks | Git hook stages, normally changed/staged files; can also run in CI or on selected refs | Strong precedent for deterministic local checks, multi-language isolation, pinning, filtering, and kill switches. It is commit-time, not agent-turn-time. [Plugin and local-hook docs](https://pre-commit.com/#adding-pre-commit-plugins-to-your-project), [repository-local hooks](https://pre-commit.com/#repository-local-hooks). |

The useful design lesson is separation of concerns: reviewdog separates finding transport/reporters, Danger separates repository rules from CI orchestration, and pre-commit separates hook installation/runtime environments from individual checks. Jev should adopt the same separation while adding an agent feedback reporter.

## Re-thought Jev shape

### 1. Make the analyzer contract the product

Define a backend-neutral request/response contract, for example:

```text
Analyze({ diff/edit, repository metadata, rule set, privacy policy })
  -> Findings[{ file, range?, rule, score/confidence, severity?, message, evidence? }]
```

The Codex hook, a standalone CLI, CI/reviewdog adapter, and a future Claude adapter should all consume this contract. The transport may be Jev's hosted API, a local executable, a local MCP server, or another configured provider. This directly addresses the vendor-lock objection in the earlier discussion.

### 2. Offer two Codex cadences

* **PostToolUse mode:** inspect only the changed patch/file, apply strict byte/file/rule budgets, and return a concise `additionalContext` advisory. Set `async` for a network-bound call. This gives the requested realtime feedback without pretending a post-effect hook can roll back an edit.
* **Stop mode:** accumulate or recompute a bounded baseline-to-turn diff, run a more expensive semantic pass, and use `decision: "block"` only when the product deliberately wants a fix loop. Guard `stop_hook_active`, cap attempts/cost, deduplicate findings, and fail open on infrastructure errors unless the user explicitly selects fail-closed policy.

Keep `/review`/GitHub Code Review as manual and PR-scale fallback surfaces. Do not force a turn hook to reproduce a full PR review.

### 3. Make privacy and backend choice explicit

Default to no network call until the user opts in. A remote Jev backend should require an explicit key/configuration and disclose that source or diff content leaves the machine. Provide:

* file globs and maximum bytes/lines;
* secret-file and gitignored-file exclusions plus local redaction;
* an offline/local backend path (including Codex `mcp_tool` or a command hook);
* a backend name and request ID in diagnostics;
* a kill switch and per-rule/per-cadence enablement;
* fail-open/fail-closed policy as a named choice, not an accidental timeout behavior.

Do not put source, prompts, or secrets in hook output: Codex may spill large output to disk and expose a preview to the model.

### 4. Test the real Codex runtime, not only JSON fixtures

Older upstream issues document that behavior changed quickly: `#16732`/`#17794` reported `apply_patch` edits not firing hooks, and `#16430` reported plugin-local hooks not being discovered in CLI `v0.118.0` ([issue #17794](https://github.com/openai/codex/issues/17794), [issue #16430](https://github.com/openai/codex/issues/16430)). The current official docs now document those paths as supported, but this history means Jev should pin a minimum Codex version, run an install/trust diagnostic, and smoke-test Bash, native `apply_patch`, MCP, subdirectory startup, and worktrees. Treat third-party adapter claims as version-specific until reproduced.

## Recommendation for the parent project

Build Jev as a standalone backend-neutral analyzer plus a small Codex plugin/adapter. Use the official Codex hook seam first, with `PostToolUse` advisory feedback and optional `Stop` review. Keep a local/MCP backend and strict data-flow controls in the first release. A community plugin PR can still be worthwhile as distribution, but the current Codex plugin and hooks APIs mean upstream adoption is no longer a prerequisite for validating the product.
