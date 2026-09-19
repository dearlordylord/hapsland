# Architecture candidate review

> **Comparative status:** Superseded by [`PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md`](./PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md), which applies the revised repository methodology and assigns each candidate use a claim-backed borrow/depend/integrate/reject classification. This report remains a concise source review and link index.

**Date:** 2026-09-19  
**Purpose:** shortlist existing projects for comparison with Jev, identify reusable architectural ideas, and decide which candidates merit a full specification/architecture review.

## Scope distinction

There are two independent axes:

- **Agent host:** the runtime that owns the tool loop and exposes lifecycle interception (Claude Code, Codex CLI, OpenCode, Kimi Code, Pi, etc.).
- **Model provider:** the API/model selected by a host (Anthropic, OpenAI, Moonshot/Kimi, Google, or an OpenAI-compatible endpoint).

OpenCode is now in Jev's supported-host set. It is a host adapter target, not a universal adapter for an already-running Claude, Codex, or Kimi session. Its provider abstraction is still useful: the official docs describe many providers, including Anthropic, OpenAI-compatible endpoints, and Moonshot/Kimi ([providers](https://opencode.ai/docs/providers/)).

## Shortlist

| Candidate | Role and lifecycle surface | Extensibility and composition | Enforcement / coverage | Recommendation |
|---|---|---|---|---|
| [OpenCode](https://opencode.ai/docs/plugins/) | Coding-agent host. TypeScript plugins receive `tool.execute.before`/`after`, file/session events, permission events, and can add tools. `file.edited` is useful for Jev's non-blocking edit-time feedback. | Project/global local plugins and npm plugins; all loaded hooks run in sequence. Permissions are separate, pattern-based config. Plugin load order and duplicate-package behavior are documented. | `allow`/`ask`/`deny` permissions; plugin exceptions can stop a tool call (for example, `.env` protection). `--auto` does not override explicit deny. | **Full review.** It is a required Jev host adapter and the cleanest current reference for combining post-edit feedback with pre-tool blocking in one host. Do not make it Jev's cross-host core. |
| [agenthooks](https://github.com/speakeasy-api/agenthooks) | Adapter/runtime library, not an agent host. Normalizes provider hook envelopes and runs a typed pre-tool pipeline; can also execute the same pipeline in-process. | Strong composition model: stacked handlers, `Any`, `All`, `When`, middleware, explicit dispatch order, and raw-event escape hatch. `install.Manifest` emits provider-specific files/scaffolding. | Explicit decision kinds, failure policy, ask fallback, capability matrix, and degradation (`Degrade` vs `Strict`). Claims Claude, Cursor, Codex, Gemini CLI, OpenCode, Kimi, OpenClaw, and Copilot variants. | **Full review, highest priority.** Closest architectural analogue to Jev's provider layer. Evaluate Go dependency, license, fidelity, release maturity, and whether Jev should implement the same concepts independently rather than depend on it. |
| [Chock](https://github.com/open-coder-ai/chock) | Policy compiler. A repository policy compiles into ambient instructions, native pre-tool controls, Git hooks, and CI gates; it is not an agent loop. | User-owned policy manifests and evaluation suites; generated plain files are committed to the repository. New rules are content rather than engine code. | Explicit coverage grades: `advisory`, `enforced-at-commit`, `enforced`. Claims only a grade backed by an install witness. Deterministic, no-network enforcement runner. | **Full review, with maturity caveat.** Its evidence/coverage vocabulary and layered fallback are highly relevant to Jev. Do not adopt as the Jev runtime without a spike: it is very new and its target semantics must be independently exercised. |
| [Rulesync](https://github.com/dyoshikawa/rulesync) | Cross-host configuration compiler. Generates rules, hooks, permissions, skills, commands, subagents, MCP, and checks from unified files. | Import/export, target-to-target conversion, selective generation, and a large target matrix. Composition is generated configuration plus each host's native semantics. | Advisory Markdown and native hooks/permissions have different strengths. Its own support table warns that a check means support in at least one mode (project, global, or simulated), not semantic parity. Explicitly lists Codex, Kimi, Pi, and OpenCode. | **Full review of the compiler boundary; targeted review of runtime semantics.** Best existing reference for target capability matrices and config translation. Likely complementary to Jev, not a Jev evaluator or blocking core. |
| [Shaka](https://github.com/jgmontoya/shaka) | Local shared-infrastructure layer around Claude Code, Codex, OpenCode, and Pi: session-start/end context, memory, MCP, workflows, and `tool.before` safety hooks. | Shared system with provider-specific generated bridges; user customizations override defaults. Native MCP/tools for some hosts and generated plugins/extensions for others. | `security-validator` checks Bash and paths before execution against YAML patterns; catastrophic operations block and dangerous operations ask. No Kimi adapter is advertised. | **Targeted review.** Mine its provider bridge layout, generated-config strategy, safety-pattern data model, and lifecycle mapping. It is broader than Jev and bundles memory/workflows, so it is not an obvious Jev base. |
| [CAO](https://github.com/awslabs/cli-agent-orchestrator) | Multi-agent orchestration/control plane: launches provider CLIs in isolated sessions, exposes APIs, profiles, flows, memory, and tool restrictions. Supports Claude, Codex, Kimi, OpenCode, Pi/OMP, and others. | Python entry-point plugins run in `cao-server`; they can add MCP tools and receive server/session/terminal/message events. | Current plugins are explicitly **observers only**: events are after successful operations and cannot block, modify, or reject them. Provider tool restrictions vary by host and are not a substitute for Jev's native pre-action adapters. | **Targeted review only.** Useful for orchestration, provider discovery, session identity, fleet APIs, and event contracts. Do not use as Jev's enforcement or rule-plugin substrate. |

## Candidate-specific notes

### OpenCode

OpenCode's [plugin documentation](https://opencode.ai/docs/plugins/) gives Jev two distinct seams:

1. `tool.execute.before` for synchronous decisions that can prevent or alter a tool call.
2. `file.edited`, `session.diff`, and related events for post-edit analysis and context injection.

Its plugin loader accepts project-local, global, and npm plugins; sources are loaded in a documented order and hooks run in sequence. Its [permission model](https://opencode.ai/docs/permissions/) independently resolves `allow`, `ask`, or `deny`, with last matching granular rule winning. Jev should preserve these as separate adapter capabilities rather than pretending every host's post-edit event is blocking.

### agenthooks

The most reusable ideas are:

- retain the verbatim provider event while exposing a normalized projection;
- make handler composition and precedence explicit (`deny > ask > allow > neutral` in its `All` combinator);
- represent provider capability and degradation explicitly;
- separate wire/install codecs from policy logic;
- use the same policy pipeline in a hook process and embedded/server mode;
- ship fixtures and real-CLI end-to-end tests.

Its README describes the library as owning JSON dialects, exit codes, stderr discipline, and provider quirks while the consumer owns policy logic. That separation maps closely to Jev's intended provider layer.

### Chock

Chock's central design lesson is that “supported” must be a per-rule, per-agent, evidenced claim. An ambient instruction, a commit gate, and an in-agent pre-tool hook are different enforcement grades. This is directly applicable to Jev rules that may be configured as blocking or advisory.

The important limitation is scope: Chock's policy language and gate catalog are narrower than Jev's prospective code-review findings, and the project is early. Treat it as an architectural reference and test target before considering reuse.

### Rulesync

Rulesync is the strongest reference for a canonical-source-to-native-config compiler. Its README explicitly covers selective generation, import/export, and conversion; its matrix includes Codex CLI, Kimi Code, Pi, and OpenCode. The critical design constraint is semantic drift: generated output inherits each host's lifecycle, failure, and permission behavior. Jev should borrow the matrix/capability-reporting approach, not promise universal parity from a generated file.

### Shaka

Shaka demonstrates a practical “one shared environment, many host bridges” layout. Its safety validator is especially relevant to Jev's blocking layer because it has data-driven patterns, path checks, confirmation behavior, and security logs. However, its core product also owns context, memory, workflows, MCP tools, and session summaries. Reusing it wholesale would couple Jev to unrelated stateful subsystems.

### CAO

CAO is valuable precisely because it draws a boundary Jev should not cross. Its plugin docs say lifecycle/message events are delivered after operations complete, and current plugins cannot veto or rewrite them. That makes CAO suitable for observation, audit, orchestration, and fleet-level reporting, but insufficient for pre-action Jev enforcement. A future Jev/CAO integration could publish findings or use CAO's MCP surface without treating CAO as the enforcement boundary.

## Review methodology to apply to every candidate

For a comparable architecture review, record the following in the same order:

1. **Role:** host, adapter, policy engine, compiler, orchestrator, reporter, or model gateway.
2. **Observed lifecycle:** exact pre-action, post-action, edit, commit, CI, and session events; payload fidelity and whether edits are whole-file or diff-based.
3. **Decision contract:** allow, warn, ask, deny, rewrite, context, and observe; aggregation and conflict precedence.
4. **Enforcement boundary:** what is actually prevented, what is merely reported, and what can bypass the boundary.
5. **Failure/headless behavior:** timeout, exception, nonzero exit, unavailable capability, and non-interactive `ask` semantics.
6. **Provider/host matrix:** adapters, version assumptions, native versus generated surfaces, and explicit degradation.
7. **Extension model:** user rules/plugins, discovery, packaging, trust, execution permissions, and config ownership.
8. **Composition:** installation and load order, multiple tools coexisting, duplicate hooks, idempotence, and conflict resolution.
9. **State and evidence:** caching, deduplication, concurrency, transcripts, logs, install/runtime witnesses, and reproducible fixtures.
10. **Security/privacy:** code and secret egress, policy weakening from project-local files, sandboxing, and network access.
11. **Adoption and maintenance:** source activity, release/version policy, test coverage, compatibility guarantees, and license.
12. **Reuse decision:** adopt, depend on, adapt, mine for patterns, integrate optionally, or reject—with the reason tied to the preceding evidence.

## Current recommendation

Do not replace Jev with a single existing project yet. No candidate combines Jev's code-review semantics, independent rule configuration, cross-host adapters, edit-time feedback, and configurable blocking with mature parity across all target hosts.

The best architecture-review sequence is:

1. **Full:** `agenthooks`, `Chock`, `Rulesync`, and OpenCode's native plugin/permission model.
2. **Targeted:** Shaka and CAO, focused on bridge generation, safety-pattern data, orchestration, and observation.
3. **Existing baseline:** retain Probity as the already-reviewed hard-policy comparison; integrate it optionally rather than making it Jev's core.

The likely Jev architecture remains a provider-neutral decision/evidence core with native host adapters, plus a Git/CI fallback for unobserved actions. The strongest borrowed practices are agenthooks' raw-event-plus-normalized-projection design, Chock's per-surface enforcement grades and install witnesses, Rulesync's capability matrix, OpenCode's explicit plugin load/permission semantics, Shaka's data-driven safety patterns, and CAO's separation of orchestration from enforcement.

## Primary source index

- [OpenCode plugins](https://opencode.ai/docs/plugins/), [permissions](https://opencode.ai/docs/permissions/), [providers](https://opencode.ai/docs/providers/)
- [agenthooks README and design](https://github.com/speakeasy-api/agenthooks)
- [Chock README](https://github.com/open-coder-ai/chock)
- [Rulesync README and support matrix](https://github.com/dyoshikawa/rulesync)
- [Shaka README](https://github.com/jgmontoya/shaka)
- [CAO README](https://github.com/awslabs/cli-agent-orchestrator), [CAO plugin contract](https://github.com/awslabs/cli-agent-orchestrator/blob/main/docs/plugins.md)
