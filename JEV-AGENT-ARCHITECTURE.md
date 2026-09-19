# Jev agent architecture and solution review

This is the working architecture note for putting Jev feedback around coding agents.
The product itself is not named Jev; see [`CONTEXT.md`](./CONTEXT.md) for the glossary
and [`AGENTS.md`](./AGENTS.md) for the naming rule.
The primary architecture axis is the agent host. Model-provider choice is secondary:
it matters only for backend configuration, credentials, cost, or data egress.

- **Agent host** — the runtime that owns the edit/tool loop and exposes lifecycle hooks
  (Claude Code, Codex CLI, OpenCode, Kimi Code, Pi, and others). This defines our adapter
  set.
- **Model provider** — secondary metadata about the service selected by a host or review
  backend. It does not define our adapter set.

OpenCode is now explicitly in the product's supported-host set. Supporting OpenCode means
shipping an OpenCode adapter/plugin; it does not mean that OpenCode becomes the adapter
for an already-running Claude, Codex, Kimi, or Pi session.

## Supported-host scope

| Host | Product integration status | Why it matters |
|---|---|---|
| Claude Code | planned/known hook target | Mature `PreToolUse`/`PostToolUse` lifecycle and plugin distribution. |
| Codex CLI | primary first implementation target | Native hooks, plugins, and synchronous pre-tool decisions; also useful for the user's realtime-edit workflow. |
| **OpenCode** | **supported host; adapter to add** | TypeScript plugins, `file.edited`, before/after tool hooks, and `allow`/`ask`/`deny` permissions. |
| Kimi Code CLI | planned adapter | Plugin and beta hook surfaces; provider configuration is broader than its name suggests. |
| Pi / Oh My Pi | planned adapter | TypeScript extensions can intercept tool calls and provide fail-safe blocking. |
| Copilot, Gemini, Cursor, Goose, others | secondary targets | Add when their capability matrix justifies the adapter cost. |

OpenCode's support for many model providers is useful context, but it does not make
OpenCode an adapter for another host. We record that fact only to avoid confusing model
selection with lifecycle integration.

## Architecture-review method

For every candidate, record the same facts before comparing it with Jev:

1. **Role:** host, host adapter, policy/rule engine, config compiler, orchestrator,
   reporter, or model/backend client.
2. **Interception:** events available, pre/post timing, edit/diff visibility, and whether
   the check can block, ask, rewrite, warn, or only observe.
3. **Canonical contract:** action/event schema, finding schema, decision algebra, and
   aggregation/precedence when several rules or tools disagree.
4. **Capability degradation:** per-host matrix, unsupported-event behavior, timeout and
   crash behavior, fail-open/fail-closed policy, and non-interactive behavior.
5. **Extension model:** data-only rules, code plugins, package discovery, versioning,
   configuration scope, and whether user rules can be independently released.
6. **Composition:** install/load order, collision handling, coexistence with other hooks,
   and whether it can run as a CLI, hook, MCP server, CI check, or reporter.
7. **State:** baselines, session history, deduplication, concurrency, retries, and
   idempotence when an agent responds to its own finding.
8. **Security and privacy:** trust boundary, source-file egress, credentials, path
   exclusions, sandbox assumptions, and auditability.
9. **Evidence:** conformance fixtures, real-runtime tests, version pinning, maintenance,
   adoption, and the difference between documented behavior and project claims.
10. **Operational output:** latency budget, finding limits, severity/confidence, and how
    feedback reaches the agent and human.

The comparison must preserve distinctions such as `advisory` versus `enforced`, rather
than collapsing every hook into a boolean “supported”.

## Candidates to inspect

### Full architecture reviews (recommended)

- [OpenCode plugins](https://opencode.ai/docs/plugins/), [permissions](https://opencode.ai/docs/permissions/), and [providers](https://opencode.ai/docs/providers/)
  — the best first-party reference for a host with user plugins, typed lifecycle hooks,
  granular permission patterns, and optional model selection. Review its plugin load order,
  `file.edited`/`tool.execute.before` timing, permission precedence, and how an async Jev
  result could be surfaced. **Recommendation: full review as the OpenCode adapter spec;
  do not use it as the cross-host core.**

- [Speakeasy agenthooks](https://github.com/speakeasy-api/agenthooks)
  — a small Go layer that normalizes hook wire formats, JSON dialects, exit codes, and
  provider quirks for Claude Code, Codex, OpenCode, Kimi Code, and other hosts. The
  consumer supplies the policy. **Recommendation: full review as an adapter-contract
  reference; consider depending on it only after checking maturity and language fit.**

- [Shaka](https://github.com/jgmontoya/shaka)
  — local, provider-agnostic shared infrastructure for Claude Code, Codex, OpenCode, Pi,
  with generated host integrations and declarative YAML safety patterns. It is a useful
  example of one shared policy/context tree rendered into different hosts. **Recommendation:
  full review for composition, packaging, and safety-pattern design; do not adopt as Jev's
  core because it also owns context, memory, workflows, and MCP concerns.**

- [Chock](https://github.com/open-coder-ai/chock)
  — governance-as-code that grades a policy as `advisory`, `enforced-at-commit`, or
  `enforced`, then emits agent, Git, and CI surfaces. This is the clearest precedent for
  preserving enforcement strength instead of promising parity. **Recommendation: full
  review of its policy manifest, evidence/install witness, and capability grading; treat
  the project itself as young until a spike proves its adapters.**

### Targeted reviews (valuable, but not Jev-core candidates)

- [AWS CLI Agent Orchestrator (CAO)](https://github.com/awslabs/cli-agent-orchestrator)
  — broad multi-agent orchestration with profiles, PTY/HTTP control, and a plugin/event
  surface spanning Claude, Codex, Kimi, OpenCode, Pi and others. Its plugin model is
  primarily observation/orchestration, not a general blocking rule engine. **Recommendation:
  targeted review for host discovery, lifecycle telemetry, and provider profile modeling;
  do not select it as Jev's policy substrate.**

- [Rulesync](https://github.com/dyoshikawa/rulesync)
  — a broad configuration compiler for rules, hooks, permissions, skills, commands, and
  MCP across many agent hosts including Codex, Kimi, Pi, and OpenCode. Its generated
  artifacts retain each host's semantics. **Recommendation: targeted review for config
  distribution and host capability matrices; do not treat it as a runtime evaluator.**

- [Probity](https://github.com/nizos/probity)
  — the strongest existing policy/rule-engine comparison for Claude Code, Codex, and
  Copilot. Its contract is pre-tool `pass | violation`, so it is a hard-policy host rather
  than a natural home for Jev's graded advisory findings. **Recommendation: retain the
  existing architecture and cleanroom-spec reports; integrate as an optional hard-rule
  adapter, not as Jev's canonical core.**

- [OPA / Conftest](https://www.openpolicyagent.org/docs)
  — mature, provider-neutral policy evaluation and test tooling. It still needs host
  adapters and cannot see an agent's native filesystem/shell actions by itself.
  **Recommendation: targeted review for deterministic policy/CI gates, not realtime host
  interception.**

- [reviewdog](https://github.com/reviewdog/reviewdog)
  — mature adjacent precedent for turning arbitrary checker output into a stable finding
  format and routing it to local diffs, CI, and code-review reporters. **Recommendation:
  targeted review for Jev's finding/reporting adapter, not for agent lifecycle hooks.**

## Current recommendation

Do not replace Jev with one of these projects yet. The best architecture is a Jev-owned
canonical decision contract plus small host adapters:

```text
host event -> adapter -> canonical Jev action/context
                         -> deterministic rules and/or Jev backend
                         -> allow | ask | block | advisory | context
                         -> host-native response + CI/reporter output
```

Use the candidates as follows:

1. Start with Codex, then add OpenCode as the next first-class adapter.
2. Borrow the normalized adapter/capability ideas from `agenthooks`, the enforcement
   grading from Chock, and Shaka's shared-config/safety patterns.
3. Keep CAO and Rulesync as optional integration/distribution layers, not dependencies of
   the evaluator.
4. Preserve a standalone CLI and Git/CI path for hosts that cannot provide a reliable
   pre-edit hook.
5. Revisit “adopt an existing solution” only if a project exposes the required canonical
   contract, user-plugin seam, host capability reporting, and Jev-compatible graded
   findings without forcing Jev into its policy or provider model.

The detailed evidence behind this shortlist is in
[`RESEARCH-AGENT-RULE-TOOLS-2026-09-19.md`](./RESEARCH-AGENT-RULE-TOOLS-2026-09-19.md),
[`RESEARCH-PROBITY-ARCHITECTURE-2026-09-19.md`](./RESEARCH-PROBITY-ARCHITECTURE-2026-09-19.md),
and [`RESEARCH-PROBITY-SPEC-EXTRACTION-2026-09-19.md`](./RESEARCH-PROBITY-SPEC-EXTRACTION-2026-09-19.md).
The current comparative method and rerun are in
[`PRODUCT-RESEARCH-METHODOLOGY.md`](./PRODUCT-RESEARCH-METHODOLOGY.md) and
[`PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md`](./PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md).
