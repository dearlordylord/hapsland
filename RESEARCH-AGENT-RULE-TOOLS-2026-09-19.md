# Existing tools for portable, enforceable coding-agent rules

> **Comparative status:** Superseded by [`PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md`](./PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md) for current rankings and adoption recommendations. Retained for primary-source notes and host capability evidence; do not treat its older shortlist as the current decision.

**Landscape date:** 2026-09-19  
**Research question:** Which existing tools or frameworks satisfy most of the following: compose with other coding-agent tools, accept user-defined plugins or rules, adapt across Claude/Kimi/Codex/Pi or other providers and hosts, configure rules independently, and support blocking as well as advisory operation?

## Executive conclusion

No mature product yet provides one fully portable rule language with identical, deterministic pre-action enforcement across Claude Code, Kimi Code, Codex, Pi, and every other coding agent.

The closest current options are:

1. **Rulesync** is the broadest practical configuration compiler. Its own target matrix covers rules, hooks, permissions, skills, commands, and MCP configuration for Claude Code, Codex CLI, Kimi Code, Pi, OpenCode, Copilot, Cursor, Gemini, Goose, Cline, and many others. It is active and moderately adopted (about 1.45k GitHub stars). Its key limitation is semantic: it generates each host's native artifacts, so guarantees differ by host and feature; a generated prompt rule remains advisory while a generated pre-tool hook can block.
2. **Chock** most directly implements “author once, grade and enforce everywhere.” It compiles one policy manifest into ambient agent guidance, native pre-tool hooks where available, Git hooks, and CI gates, and explicitly reports `advisory`, `enforced-at-commit`, or `enforced`. However, it is extremely new (created 2026-08-17, about 7 stars), supports only a small set of gate kinds, and currently gives Kimi only Git/CI enforcement despite Kimi now having a native hook surface.
3. **Native host hooks** are the strongest enforcement layer today. Claude Code, Codex, Kimi Code, Pi, Gemini CLI, Cursor, and GitHub Copilot all expose pre-tool interception that can deny an action. Codex, Gemini, Kimi, OpenCode, and Copilot also expose declarative permission/policy mechanisms. A portable tool can target these hosts, but must preserve their different precedence, failure, trust, and non-interactive semantics.
4. **Invariant Guardrails/Gateway** is the strongest provider-neutral runtime policy option found for LLM and MCP traffic: it has a declarative trace/rule language, tool-call and data-flow constraints, and a transparent proxy. It only sees traffic routed through the gateway, not every built-in filesystem or shell action of an arbitrary coding agent.
5. **Repository gates** such as pre-commit, reviewdog, Danger, Semgrep, and ordinary CI remain the most portable enforcement floor. They work regardless of which agent authored the change and naturally offer warning versus failure modes, but they act after an edit or at commit/PR time rather than before every tool call.

The most defensible architecture in 2026 is therefore layered:

> canonical rules/config compiler → native host hooks/permissions → shared Git/CI gate → optional MCP/LLM gateway

Prompt files such as `AGENTS.md`, `CLAUDE.md`, or generated skills are useful guidance, but they are not an enforcement boundary.

## Method and confidence labels

This report uses primary sources: official product documentation, project-owned repositories, and repository metadata. “Verified” means the native host's documentation or source describes the behavior, not merely that a compatibility tool claims it. “Project claim” means the tool's own support table or README claims a target; it was not exercised end-to-end here. GitHub stars and last-push dates are point-in-time maintenance/adoption signals captured on 2026-09-19, not quality guarantees.

Terminology matters:

- **Advisory:** text placed in model context, a warning, a PR comment, or audit-only output. The agent or user can ignore it.
- **Blocking:** the tool call, commit, CI job, or merge gate cannot proceed on a matching failure.
- **Ask/HITL:** execution pauses for approval. In non-interactive environments this often becomes deny, but this is host-specific.
- **Provider adapter:** selects a model/API provider (Anthropic, OpenAI, Moonshot, etc.).
- **Host adapter:** writes configuration for or intercepts a coding-agent runtime (Claude Code, Codex CLI, Kimi Code, Pi, etc.). These are different axes.

## Ranked comparison

| Tool | Category | Portable targets / providers | User-defined units | Advisory and blocking | Evidence level | Maintenance/adoption snapshot |
|---|---|---|---|---|---|---|
| [Rulesync](https://github.com/dyoshikawa/rulesync) | Cross-host config compiler | Claims 40+ coding tools; explicitly lists Claude, Codex, Kimi, Pi, Gemini, Copilot, Cursor, OpenCode, Goose, Cline | Separate rules, hooks, permissions, checks, skills, agents, commands, MCP | Yes, through generated native artifacts; strength varies by target | Target matrix is a project claim; major host primitives independently verified below | Active on 2026-09-19; ~1,451 stars, ~153 forks |
| [Chock](https://github.com/open-coder-ai/chock) | Governance/policy compiler | 15 agents; native hooks for Claude, Cursor, Copilot, Codex, Gemini and others; Git/CI floor for all listed targets | One independently testable policy folder/manifest plus eval cases | Explicit `advisory`, `enforced-at-commit`, `enforced` grading | Architecture and install witnesses are project claims; emitted host surfaces are inspectable | Active 2026-09-13; ~7 stars; created one month before this report |
| [AgentSync](https://github.com/yelmuratoff/agent_sync) | Cross-host config compiler | Claude, Cursor, Copilot, Gemini, Codex, Kimi, OpenCode, Cline, Windsurf, others | Individually scoped rules, skills, commands, agents, settings, hooks, MCP | Advisory rules plus generated native hooks/permissions for selected hosts | Project claim; README documents per-target transformations and limitations | Active on 2026-09-19; ~17 stars; created 2026-02 |
| [ai-rulez](https://github.com/Goldziher/ai-rulez) | Cross-host workflow/plugin generator | 20 host presets; plugin bundles for Claude, Cursor, Codex, Gemini, Kimi, OpenCode, Factory, Hermes | Rules/domains, skills, agents, commands, MCP, hooks; per-preset overrides | Mostly advisory at agent layer; blocking via generated hooks and optional pre-commit enforcement | Project claim; generated output and verification commands are inspectable | Active on 2026-09-19; ~143 stars |
| [Ruler](https://github.com/intellectronica/ruler) | Shared instruction/skill generator | Broad AGENTS/CLAUDE ecosystem including Claude, Codex, Pi, OpenCode, Gemini, Cursor, Goose, Aider | Multiple Markdown rules, skills, subagents, MCP | Primarily advisory; drift can be blocked in CI, but it is not a general runtime policy engine | Project claim; output map documented | Active 2026-09-16; ~2,933 stars |
| [Invariant Guardrails + Gateway](https://invariantlabs.ai/guardrails) | Runtime policy language and LLM/MCP proxy | Model/agent neutral when traffic is routed through its compatible LLM or MCP proxy | Independent declarative rules over messages, tool calls, outputs, order, data flow, loops | Blocking through `raise`; Explorer/trace path supports observation and testing | Official docs and open-source implementation | Core repo ~459 stars; gateway/repo activity is less strong than the largest agent hosts |
| [NVIDIA NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/about-nemo-guardrails-library/rail-types) | General guardrail framework | Framework/model integrations rather than coding-host adapters | Colang/config, custom actions, input/retrieval/dialog/execution/output rails | Can block/filter/modify; execution rails validate tool inputs and outputs | Official NVIDIA docs | [Open-source repo](https://github.com/NVIDIA-NeMo/Guardrails) ~7.2k stars; active 2026-09-18 |
| [Open Policy Agent](https://www.openpolicyagent.org/docs/integration) | General policy decision point | Provider/host neutral, but requires a custom hook/gateway adapter | Independent Rego modules and data bundles | Engine returns decisions; caller chooses enforce versus observe; decision logs support advisory rollout | Official OPA docs | Mature CNCF project; ~12.2k stars; active 2026-09-19 |
| [reviewdog](https://github.com/reviewdog/reviewdog) | Linter/review multiplexer | Agent neutral; consumes many linter formats and reports locally or to code hosts | Runner config plus any upstream linter/rule set | `fail-level=none` for advisory through `any/info/warning/error` for CI failure | Project-owned docs/source | ~9.6k stars; active 2026-09-19 |
| [Danger JS](https://danger.systems/js/) | Programmable PR policy/review | Agent neutral; many CI/code-host integrations | Arbitrary JS/TS `Dangerfile`, reusable plugins | `message`/`warn` advisory; `fail` blocks CI | Official project docs | ~5.5k stars; active 2026-08-28 |
| [pre-commit](https://pre-commit.com/) | Local VCS gate/plugin host | Agent neutral | Repository-local hook list; local or remote hook plugins in any supported language | Hook exit status blocks commit; manual/stage selection can make checks advisory or deferred | Official project docs | ~15.6k stars; active 2026-08-17 |

## Cross-agent compilers and synchronizers

### 1. Rulesync: broadest current host coverage

Rulesync is the best-supported answer if “one source tree, many coding agents” is the primary requirement. Its [support matrix](https://github.com/dyoshikawa/rulesync#supported-tools-and-features) distinguishes rules, ignore patterns, MCP, commands, subagents, skills, hooks, permissions, and checks. As of the research date it marks:

- Claude Code: rules, hooks, permissions, skills, subagents, commands, MCP.
- Codex CLI: all of the above.
- Kimi Code: rules, MCP, subagents, skills, hooks, permissions.
- Pi: rules, commands, skills, hooks, permissions.
- Many additional targets, including Copilot, Gemini, OpenCode, Cline, Goose, Cursor, Kiro, and Qwen Code.

Rulesync can import existing configuration, generate target-native configuration, or directly convert one target format to another. This is materially more than `AGENTS.md` mirroring.

Important caveats:

- A check mark means support in at least one scope or simulation mode, not necessarily project-local native support in every mode. The project explicitly says so.
- Its common source is configuration, not one universal runtime. Generated artifacts retain native semantics. A Claude/Codex/Kimi/Pi hook can block before tool use; a Markdown rule cannot.
- Cross-target parity should be validated with generated fixtures and each host's own configuration validator. The support matrix is maintained by Rulesync, not by the target vendors.

### 2. Chock: best conceptual fit, least mature

Chock's [architecture and README](https://github.com/open-coder-ai/chock#how-it-works) directly address the requested shape. A policy has a manifest, gate, and evaluation cases. `chock sync` can emit:

- an ambient `AGENTS.md` instruction (advisory);
- a repository Git hook and CI gate (enforced at commit/PR once installed);
- a native pre-tool-use hook where the target exposes one (live enforced).

It refuses to call a prompt rule “enforced” and uses install witnesses before crediting a surface. Its current table verifies native hook emission for Claude Code, Cursor, Copilot/VS Code, Codex, Gemini, Windsurf, Devin, Grok, Tabnine, and Antigravity CLI. It lists Aider, Junie, Kimi Code, and Replit as Git-hook/CI-only targets. Three planned surfaces—managed setting, generic gateway, and MCP gateway—currently credit no agent.

This honesty is valuable, but the project is too new to treat as a proven foundation without a spike. The present policy gate catalog is also much narrower than a mature general-purpose rules engine. Kimi's own hook documentation now shows `PreToolUse` blocking, so Chock's Kimi adapter is behind the host's available capability.

### 3. AgentSync, ai-rulez, and Ruler

[AgentSync](https://github.com/yelmuratoff/agent_sync) is notable because it explicitly handles Codex and Kimi alongside Claude/Cursor/Copilot/Gemini. It supports path-scoped rules, skills, commands, subagents, settings, MCP, and per-host hooks. Its README distinguishes native translations from fallbacks—for example, commands may become skills or an inlined index on hosts without a matching command surface. It is feature-rich but young and lightly adopted.

[ai-rulez](https://github.com/Goldziher/ai-rulez) provides centralized rule/domain authoring, per-preset agent model/effort overrides, plugin bundle generation, verification, and pre-commit integration. Plugin output currently names Claude, Cursor, Codex, Gemini, Kimi, OpenCode, Factory, and Hermes. It is attractive for distributing reusable workflows; its built-in “rules” are mostly model instructions unless paired with hooks or repository enforcement.

[Ruler](https://github.com/intellectronica/ruler) is the most adopted of these specialized synchronizers. It propagates rules, MCP configuration, skills, and experimental subagent definitions across a long list that includes Claude Code, Codex, Pi, OpenCode, Goose, Gemini, Cursor, Aider, and others. It is a strong shared-context tool, but not a standalone blocking policy engine. Its most reliable enforcement use is checking generated-file drift in CI and coupling the generated instructions to separate hooks/gates.

## Native agent hook and policy hosts

The following capabilities are independently verified from host-owned sources. These hosts can also serve as adapter backends for Rulesync, Chock, or a custom compiler.

| Host | Extensibility and independent rules | Blocking/advisory behavior | Provider breadth / portability notes |
|---|---|---|---|
| **Claude Code** | `CLAUDE.md`, skills, plugins, MCP, subagents, permissions, and lifecycle hooks. Plugins package skills/hooks/agents/MCP. | `PreToolUse` can deny; hooks are deterministic at trigger time, while CLAUDE/skill instructions remain model-interpreted. Permissions add allow/ask/deny patterns. | Claude host only. Its hook format has become a de facto compatibility target. See [Claude Code feature overview](https://code.claude.com/docs/en/features-overview) and [hooks guide](https://code.claude.com/docs/en/hooks-guide). |
| **OpenAI Codex** | Plugins can bundle skills, MCP servers, and hooks. Project/user/system `hooks.json` or inline TOML layers are merged. `.rules` files use side-effect-free Starlark `prefix_rule`; `codex execpolicy check` tests them. | Synchronous `PreToolUse` can deny or rewrite supported tool calls; `PermissionRequest` can allow/deny. Rules choose `allow`, `prompt`, or `forbidden`, with the most restrictive match winning. Async hooks are advisory only. | Codex host only, but command and MCP hooks make external policy engines composable. Verified in official OpenAI docs for [hooks](https://developers.openai.com/es-419/docs/hooks), [plugins](https://developers.openai.com/es-419/docs/plugins), and [rules](https://developers.openai.com/es-419/docs/agent-configuration/rules). |
| **Kimi Code CLI** | Plugins can contribute skills, agents, system instructions, MCP servers, and hooks. Configuration supports permission rules and separate hook entries. | Beta `PreToolUse` hooks can block dangerous commands or protected paths; failures are documented as fail-open. Permission rules determine confirmation behavior. `Stop` hooks can reject completion once. | Surprisingly provider-neutral: Kimi documents provider types for Kimi, OpenAI-compatible/Responses, Anthropic, Gemini, and Vertex AI. See [hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html), [plugins](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md), and [providers](https://moonshotai.github.io/kimi-cli/en/configuration/providers.html). Hooks are beta. |
| **Pi** | TypeScript extensions can register tools/providers/commands, intercept events, alter context/results, and communicate over an event bus. Pi packages bundle extensions, skills, prompts, and themes. | `tool_call` handlers can return `{block: true, reason}`. The official docs state tool-call handler errors block fail-safe. Permission behavior is extension-provided rather than a comprehensive built-in policy engine. | Very broad provider layer, including Anthropic, OpenAI/Codex, Gemini, Copilot and custom OpenAI/Anthropic/Google-compatible providers. See [Pi extensions](https://pi.dev/docs/latest/extensions) and [security model](https://pi.dev/docs/latest/security). Community [pi-permission-system](https://pi.dev/packages/pi-permission-system) adds `allow`/`ask`/`deny` policy. |
| **Gemini CLI** | Extensions can package commands, context, MCP, skills, subagents, hooks, and TOML policy files. A native policy engine matches tool, arguments, MCP server, annotations, subagent, mode, and interactive state. | Policies decide `allow`, `deny`, or `ask_user`; `BeforeTool` hook exit 2 or deny blocks and can rewrite inputs. | Gemini host/model oriented. Critical current limitation: official docs say workspace-tier `.gemini/policies` are non-functional due to issue #18186; use user/admin or extension policies. See [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md), [extension reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md), and [hook reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md). |
| **Cursor** | Project/global hooks, rules, MCP, plugins; command and prompt-based hooks. Generic and operation-specific lifecycle events exist. | Pre-tool/shell/MCP/read hooks return `allow`, `deny`, or `ask`. Prompt hooks use an LLM policy. Failures are normally fail-open; `failClosed: true` exists for security-critical hooks. | Cursor host only. Official [hooks documentation](https://prod.cursor.com/docs/hooks) documents exact decision and failure semantics. |
| **GitHub Copilot CLI/cloud agent/SDK** | Repository, user, plugin, and administrator policy hooks; custom agents, skills, MCP; SDK callbacks. CLI also reads cross-tool Claude-format hook configuration. | `preToolUse` can allow/deny/ask/modify arguments. SDK `onPreToolUse` supports an explicit permission layer. Command hook errors are usually fail-closed, but timeouts and HTTP failures are fail-open. Cloud agent is non-interactive, so `ask` becomes deny. | Copilot host with multiple selectable models; it can also orchestrate supported third-party cloud coding agents. See [hook concepts](https://docs.github.com/en/copilot/concepts/agents/hooks), [hook reference](https://docs.github.com/en/copilot/reference/hooks-reference), and [SDK hooks](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/hooks). |
| **OpenCode** | Local/npm TypeScript plugins, `AGENTS.md`/Claude-compatible rules, custom agents, MCP, and before/after tool hooks. Permissions are global, tool-pattern, and per-agent. | Permission values are `allow`, `ask`, `deny`; plugins can intercept `tool.execute.before`. Explicit deny remains enforced in auto mode. | Uses AI SDK/Models.dev for 75+ providers and explicitly documents Anthropic, OpenAI-compatible custom providers, and Moonshot/Kimi. See [plugins](https://opencode.ai/docs/plugins/), [permissions](https://opencode.ai/docs/permissions/), and [providers](https://opencode.ai/docs/providers). |

### Failure-mode differences that a portable adapter must preserve

These are not cosmetic incompatibilities:

- Kimi documents hook failures as **fail-open**.
- Cursor is fail-open by default but offers `failClosed: true` for selected hooks.
- Copilot command `preToolUse` errors deny, but command timeouts and HTTP hook failures are fail-open.
- Pi says errors in `tool_call` handlers block fail-safe.
- Codex requires un-managed hook definitions to be reviewed/trusted and treats unsupported output fields as a failed hook that may continue the tool call.
- Gemini uses exit code 2 as a system block, other nonzero exits as warnings; its project policy tier is presently disabled.
- “Ask” has no useful interactive path in headless/cloud execution and normally becomes deny.

Any cross-host compiler that flattens these differences into one boolean “hooks supported” flag is overstating parity.

## Provider-neutral coding-agent orchestration

### OpenCode

OpenCode is the strongest integrated host when the requirement is one agent runtime with user plugins, rules, granular permissions, and many model providers. Its official provider docs state 75+ providers via AI SDK/Models.dev, include Moonshot/Kimi, Anthropic, and OpenAI, and permit arbitrary OpenAI-compatible endpoints. It does not adapt or govern an already-running Claude Code/Kimi/Codex/Pi session; it replaces those hosts with OpenCode's loop.

Maintenance/adoption is exceptionally strong for its age: the repository had about 208k stars and was active on the landscape date. This is a signal of reach, not proof that every provider/tool combination has identical behavior.

### Pi

Pi is both a coding-agent host and an embeddable extension substrate. Its extension API is unusually complete: provider registration, before-provider inspection/replacement, pre-tool blocking, result modification, custom tools, custom UI, and packages. It can therefore host a policy plugin cleanly. The security docs are explicit that extensions run with the user's permissions and are not a security sandbox. The repository had about 107k stars and active development.

### Kimi Code CLI

Kimi's name understates its provider abstraction. Its first-party provider configuration supports Kimi, OpenAI Chat Completions/Responses, Anthropic, Gemini, and Vertex AI; plugins and beta hooks coexist with declarative permissions. That makes Kimi a plausible provider-neutral host, although the hook system is new and deliberately fail-open on failures.

### Goose

[Goose](https://block.github.io/goose/) offers 15+ model providers, MCP extensions, YAML recipes, skills, permission controls, sandboxing, and ACP exposure. It can act as an ACP server and has used Claude Code and Codex ACP agents as providers. This sounds like the ideal “alongside other coding agents” layer, but there is an important current caveat: the Goose maintainers [announced in August 2026](https://github.com/aaif-goose/goose/discussions/11384) that ACP provider wrapping is costly and that all ACP providers except Claude and Codex would be deprecated, with eventual removal of those two also planned. Goose remains a strong neutral agent host (~54k stars), but its nested-agent-provider path should not be treated as a stable universal adapter.

### Continue

[Continue](https://docs.continue.dev/reference) defines agents from models, rules, and MCP tools, supports many model providers, and exposes per-tool policies: Ask First, Automatic, or Excluded. Local `.continue/rules` are independently versionable. This is useful orchestration and advisory control, but “Excluded” removes a tool rather than evaluating an arbitrary per-call policy, and Continue does not provide the same general pre-tool programmable hook described by Claude/Codex/Kimi/Pi/Gemini. Repository adoption is strong (~36k stars, active on the landscape date).

### Adjacent hosts not shortlisted

Cline, Roo Code, OpenHands, Aider, and framework stacks such as LangGraph, AutoGen, CrewAI, PydanticAI, and the OpenAI Agents SDK all support meaningful combinations of provider choice, tools, instructions, approvals, middleware, or guardrails. They were not ranked as direct answers because they either replace the coding-agent host, lack a broad native cross-host adapter story, or require the user to build the policy interception seam. They remain sensible implementation substrates if building a new orchestrator rather than governing existing coding agents.

## External policy engines and gateways

### Invariant Guardrails and Gateway

Invariant's [guardrail language](https://invariantlabs-ai.github.io/docs/mcp-scan/guardrails-reference/) models traces containing messages, tool calls, and tool outputs. Rules can restrict tool names and arguments, ordering, retry loops, content, secrets/PII, and data flow, and a violation raises an error. The [Gateway](https://github.com/invariantlabs-ai/invariant-gateway) is a transparent proxy for compatible LLM and MCP transports, so policy can be added without modifying agent code beyond endpoint routing.

This best satisfies independent, composable runtime rules outside one vendor's agent. Boundaries:

- it only governs calls that traverse the proxy;
- a coding agent's local Bash/edit implementation may bypass an MCP gateway;
- hosted Explorer/Gateway operational details should be evaluated separately from the open-source rule language;
- activity/adoption is smaller than the native coding-agent projects.

### NeMo Guardrails

NVIDIA documents five rail types: input, retrieval, dialog, execution, and output. Execution rails validate tool/function arguments and results. Colang and custom actions make rules independently configurable, and integrations allow use around different model backends. It is mature relative to new agent-specific policy projects, but it is a framework to embed in an agent/application; it does not ship adapters that transparently intercept all native actions of Claude Code, Codex, Kimi, or Pi.

### Open Policy Agent

OPA is the most mature general policy engine in the set. Rego evaluates structured JSON input through REST, Go, Wasm, or SDK integration; bundles distribute policy; [decision logs](https://www.openpolicyagent.org/docs/management-decision-logs) support audit and staged rollout. A hook can encode `{host, agent, tool, arguments, cwd, user, mode}` as OPA input and map the decision to allow/deny/ask.

OPA does not understand coding-agent events out of the box and does not itself choose blocking versus advisory. That is the adapter's responsibility. This is an advantage for portability but means OPA alone is not an off-the-shelf answer.

### Early agent-specific policy libraries

- [Agent Policy](https://agent-policy.github.io/guard/) defines YAML policy sets with `allow`, `deny`, HITL/AITL/PITL, `filter`, and custom effects, with Python/TypeScript/Go engines. Its own site says it is under active development and not yet published to registries. The repository had roughly one star and had not been pushed since 2026-02-22.
- [Agent Guard](https://github.com/agent-rails/agent-guard) offers `allow`, `deny`, and fail-closed `require_human`, explainable audit, optional identity/rate limits/isolation, and wrappers for Python functions, MCP, or custom dispatch seams. It is highly relevant but was created 2026-07 and had roughly three stars.
- [Janus](https://github.com/Agentic-AI-Risk-Mitigation/Janus) claims argument-level JSON Schema conditions and adapters for LangChain, Google ADK, Claude Agent SDK, and a Claude Code `PreToolUse` shim. It remains research/early-stage rather than a broadly adopted coding-agent compatibility layer.

These are worth watching or mining for design ideas, not selecting as the sole production enforcement foundation today.

## Review and lint extensibility as a universal floor

These tools do not intercept the model's intent. They enforce properties of the resulting repository state, which is often the more reliable boundary.

### pre-commit

pre-commit is a mature plugin host for repository hooks. Teams can select and configure each check independently and use local scripts or versioned third-party hook repositories. Any coding agent that ultimately commits through Git encounters the same hook. A nonzero exit blocks the commit; CI can re-run the hooks to close the local-bypass gap. It cannot stop a destructive shell command or an edit before it happens, and Git hooks are not cloned by Git unless installed/bootstraped.

### reviewdog

reviewdog accepts output from arbitrary linters (including errorformat, Checkstyle, SARIF, and its own diagnostic format), filters findings against diffs, and reports locally or through GitHub/GitLab/Gerrit/Bitbucket/Gitea reporters. Its documented `fail-level` makes the same rule feed advisory (`none`) or blocking (`any`, `info`, `warning`, `error`). It is therefore a strong review adapter behind agent hooks or CI, not a tool-call policy engine.

### Danger JS

Danger evaluates a project-owned JS/TS `Dangerfile` in CI with PR metadata and a plugin ecosystem. The API explicitly distinguishes `message`, `warn`, and build-blocking `fail`. It is excellent for independently configurable workflow rules (changelog, PR size, issue link, generated-file checks) and works regardless of the authoring agent. It does not police local tool execution.

### Semgrep and ast-grep

[Semgrep custom rules](https://semgrep.dev/docs/writing-rules/overview) and [ast-grep YAML rules](https://ast-grep.github.io/guide/rule-config.html) provide language-aware, repository-level policy. They are much more expressive than regular-expression gates for code structure. Both can be run from a native agent hook, pre-commit, reviewdog, or CI; severity/exit handling supplies advisory versus blocking behavior. They inspect files/diffs, not arbitrary network, shell, or MCP side effects.

## What is actually verified versus merely claimed

### Independently verified in first-party host documentation

- Claude Code has deterministic lifecycle hooks and blocking pre-tool decisions; prompt instructions are not guarantees.
- Codex has trusted command/MCP hooks, pre-tool deny/rewrite, permission-request allow/deny, plugins, and testable `allow`/`prompt`/`forbidden` command rules.
- Kimi Code has beta lifecycle hooks, `PreToolUse` blocking, fail-open hook failures, plugin packaging, permission rules, and multiple provider protocols.
- Pi extensions can block `tool_call`, fail safe on handler errors, register providers/tools, and package extensions/skills.
- Gemini CLI has blocking/rewriting hooks plus a priority-tiered policy engine; workspace policy is presently disabled.
- Cursor and Copilot have pre-tool decisions with documented ask/deny/failure behavior.
- OpenCode has project/global plugins and `allow`/`ask`/`deny` permissions across built-in, custom, and MCP tools.

### Project claims not exercised end-to-end here

- Rulesync's complete target/feature matrix.
- Chock's per-agent install witnesses and coverage grades.
- AgentSync's and ai-rulez's target-specific transformations.
- Ruler's experimental skill/subagent propagation details.
- Early policy projects' cross-framework wrappers.

The report treats those claims as credible implementation leads because the projects publish source and generated formats, but not as vendor guarantees.

## Practical selection guidance

### If the goal is a product/tool to use now

Use **Rulesync** for canonical authoring and broad host emission, then run **pre-commit/CI** as the universal enforcement floor. For the highest-risk rules, generate or hand-maintain each host's native pre-tool hook and verify it with host-specific fixtures. Put warning-only checks through reviewdog or Danger, and merge-blocking checks through CI.

### If the goal is a prototype of a unified policy product

Prototype against these four adapters first:

1. Claude-compatible command-hook JSON (also useful to Codex/Copilot compatibility paths).
2. Kimi TOML hook + permission rules.
3. Pi TypeScript `tool_call` extension.
4. Gemini TOML policy + hook format.

Use a host-neutral decision contract such as:

```json
{
  "effect": "allow | warn | ask | deny",
  "rule_id": "no-destructive-shell",
  "reason": "...",
  "replacement_input": null
}
```

Map that contract explicitly to each host's failure and headless semantics. Keep policy sources out of the agent's write scope when they are intended as a security boundary. Compile the same rules to a Git/CI gate for actions the runtime adapter cannot observe.

### If the primary concern is MCP or external-service actions

Evaluate **Invariant Gateway** first, and compare an OPA-backed proxy if organizational policy is already in Rego. MCP routing gives a provider-neutral choke point, but separately govern native shell/file tools.

### If the primary concern is code quality rather than side effects

Use **Semgrep/ast-grep or existing linters → reviewdog/Danger → CI**. This path is substantially more mature and agent-independent than teaching each coding host the same prose rule.

## Remaining market gap

The missing mature tool is a small, auditable policy compiler/runtime that combines:

- one independently versioned rule format;
- pure deterministic predicates plus test fixtures;
- adapters for Claude, Codex, Kimi, Pi, Gemini, Cursor, Copilot, and OpenCode;
- a normalized `allow/warn/ask/deny/rewrite` result;
- explicit fail-open/fail-closed and headless behavior per rule;
- install and runtime witnesses rather than static compatibility check marks;
- Git/CI and MCP-gateway fallback surfaces;
- dry-run/audit mode and decision logs;
- protection against project-local policy weakening;
- transparent reporting of where enforcement is pre-action, post-action, commit-time, or merely advisory.

Rulesync supplies most of the adapter breadth. Chock supplies much of the enforcement vocabulary and evidence model. Native hosts supply the actual action interception. OPA/Invariant supply reusable policy ideas. No single mature project currently combines all four.

## Primary source index

- Cross-host: [Rulesync](https://github.com/dyoshikawa/rulesync), [Chock](https://github.com/open-coder-ai/chock), [AgentSync](https://github.com/yelmuratoff/agent_sync), [ai-rulez](https://github.com/Goldziher/ai-rulez), [Ruler](https://github.com/intellectronica/ruler).
- Native hosts: [Claude Code](https://code.claude.com/docs/en/features-overview), [Codex hooks](https://developers.openai.com/es-419/docs/hooks), [Codex rules](https://developers.openai.com/es-419/docs/agent-configuration/rules), [Kimi hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html), [Kimi providers](https://moonshotai.github.io/kimi-cli/en/configuration/providers.html), [Pi extensions](https://pi.dev/docs/latest/extensions), [Gemini policy](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md), [Cursor hooks](https://prod.cursor.com/docs/hooks), [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference), [OpenCode permissions](https://opencode.ai/docs/permissions/).
- Neutral orchestration: [Goose](https://block.github.io/goose/), [Goose provider docs](https://github.com/aaif-goose/goose/blob/main/documentation/docs/getting-started/providers.md), [Continue config](https://docs.continue.dev/reference), [Continue tool policies](https://docs.continue.dev/ide-extensions/agent/how-to-customize).
- Policy/gateway: [Invariant Guardrails](https://invariantlabs-ai.github.io/docs/mcp-scan/guardrails-reference/), [Invariant Gateway](https://github.com/invariantlabs-ai/invariant-gateway), [NeMo rail types](https://docs.nvidia.com/nemo/guardrails/about-nemo-guardrails-library/rail-types), [OPA integration](https://www.openpolicyagent.org/docs/integration), [OPA decision logs](https://www.openpolicyagent.org/docs/management-decision-logs).
- Review/lint: [pre-commit](https://pre-commit.com/), [reviewdog](https://github.com/reviewdog/reviewdog), [Danger JS](https://danger.systems/js/), [Semgrep rules](https://semgrep.dev/docs/writing-rules/overview), [ast-grep rules](https://ast-grep.github.io/guide/rule-config.html).
