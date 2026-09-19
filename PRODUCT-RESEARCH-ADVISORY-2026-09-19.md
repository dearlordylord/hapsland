# Product research advisory: realtime review architecture

> **Comparative status:** Fully superseded by [`PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md`](./PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md). Pass 2 uses the revised evidence model, tests the existing-solution baseline, expands candidate discovery, and provides claim-level traceability. Retain this file only for the prior reasoning and change history.

**Date:** 2026-09-19  
**Purpose:** Replace the earlier candidate landscape with one product-oriented
comparison. This report advises the specification and prototype stages; it is
not itself the product specification.

## Scope and evidence discipline

The product is the project in this repository. **Jev is the realtime-review
tool used by that project; it is not the project name.** The comparison is about
tools that can host, transport, evaluate, enforce, or report Jev reviews.

The target is a host-neutral review core with independent user-configured rules,
host adapters for Codex first and then OpenCode/Claude/Kimi/Pi/others, and a per-rule
choice between advisory feedback and blocking enforcement. Jev is the initial review
backend; model-provider selection is secondary metadata, not an adapter target.

Claims use these labels:

- **[Verified]**: directly observed in official documentation or repository
  source at the links supplied.
- **[Project-claimed]**: stated by the project, but not independently tested
  in this research pass.
- **[Inferred]**: a design conclusion derived from the observed evidence.

“Maintenance evidence” is a snapshot, not a reliability guarantee. Stars,
forks, issue counts, and commit history are signals only.

## Review method

Each candidate was reviewed in the same order:

1. **Role:** host, adapter, policy engine, compiler, orchestrator, reporter,
   or model gateway.
2. **Lifecycle:** exact pre-action, post-action, edit, session, stop, commit,
   and CI events; payload fidelity; and whether the action is already applied.
3. **Extension:** user rules/plugins, discovery, packaging, trust, and config
   ownership.
4. **Composition:** load/install order, multiple tools, duplicate execution,
   idempotence, and conflict resolution.
5. **Decision and failure:** allow, ask, deny, rewrite, advisory/context,
   aggregation, timeout, exception, headless behavior, and fail-open/closed.
6. **Host coverage:** native versus generated surfaces, version assumptions, and
   explicit capability degradation. Record backend/provider details only when they
   change this boundary or source-data flow.
7. **Security/privacy:** source and secret egress, local-project trust,
   policy weakening, sandboxing, and network access.
8. **Maintenance:** releases, activity, tests, compatibility guarantees,
   community evidence, and license.
9. **Reuse decision:** classify as `BORROW`, `DEPEND ON`, `OPTIONAL
   INTEGRATION`, or `REJECT`, with the reason tied to the preceding evidence.

The method records two related but unequal concerns:

- **Agent host (primary):** owns the tool loop and lifecycle hooks: Codex,
  OpenCode, Claude Code, Kimi Code, Pi, and others.
- **Model/backend provider (secondary):** supplies inference. Record it only when
  it changes lifecycle behavior, credentials, cost, or source-data egress.

Being a multi-provider host does not make a tool an adapter for an already-running
session in another host.

## Decision summary

| Candidate | Primary role | Classification | What is useful | Why it is not the product core |
|---|---|---|---|---|
| [OpenCode](https://opencode.ai/docs/plugins/) | Agent host and plugin/permission runtime | **OPTIONAL INTEGRATION** | Native edit events, pre/post tool hooks, permission algebra, plugin loading | It is another host to adapt to, not a universal adapter for Codex or Claude |
| [agenthooks](https://github.com/speakeasy-api/agenthooks) | Cross-host hook adapter library | **BORROW**; dependency only after a spike | Raw-event fidelity, typed projection, capability matrix, install codecs, composition | Very young; Go dependency and provider behavior still need independent conformance testing |
| [Chock](https://github.com/open-coder-ai/chock) | Policy compiler and enforcement-coverage system | **BORROW** | Per-agent/per-policy enforcement grades and install witnesses | Its policy catalog and runtime are narrower and newer than Jev's review model |
| [Rulesync](https://github.com/dyoshikawa/rulesync) | Cross-host configuration compiler | **OPTIONAL INTEGRATION** | Target matrix, generated native config, explicit semantic differences | Translation is not evaluation; generated config cannot guarantee review parity |
| [Shaka](https://github.com/jgmontoya/shaka) | Shared agent environment with safety hooks | **BORROW** | Provider bridges, declarative safety patterns, generated setup | Bundles context, memory, workflows, MCP, and inference unrelated to Jev |
| [CAO](https://github.com/awslabs/cli-agent-orchestrator) | Multi-agent orchestration/control plane | **OPTIONAL INTEGRATION** | Agent discovery, session identity, fleet APIs, observation | Its plugins are outbound observers; they are not the pre-action enforcement boundary |
| [Probity](https://github.com/nizos/probity) | Cross-host hard-policy engine | **OPTIONAL INTEGRATION** | Canonical action/rule/adapter split and Codex blocking precedent | Binary fail-closed pass/violation loses Jev findings and advisory semantics |
| [reviewdog](https://github.com/reviewdog/reviewdog) | Finding transport and review reporter | **OPTIONAL INTEGRATION** | Stable diagnostic schema, diff filtering, reporter adapters | It has no agent-turn lifecycle or pre-tool enforcement |

**Current conclusion:** no candidate is justified as a required dependency.
Build or retain a Jev-owned review contract and thin native adapters. Run
dependency spikes against `agenthooks` and `reviewdog`; integrate Probity only
where a hard pre-action policy is desired. Use OpenCode, Codex, Chock, and
Rulesync as conformance/reference targets.

## Candidate reviews

### OpenCode

**Role and lifecycle — [Verified].** OpenCode is an agent host. Its plugin API
exposes `tool.execute.before`, `tool.execute.after`, `file.edited`,
`file.watcher.updated`, session events, and other lifecycle events. The
`file.edited` event is a useful post-edit advisory seam; `tool.execute.before`
is the blocking/rewriting seam. Plugins can also add custom tools. See the
[official plugin events](https://opencode.ai/docs/plugins/).

**Extension and composition — [Verified].** Plugins may be project-local,
global, or npm packages configured in `opencode.json`. The documented loading
order is global config, project config, global plugin directory, then project
plugin directory; hooks run in sequence. This gives Jev a normal host adapter
and an explicit load-order surface, but also means Jev must be idempotent when
another review plugin is installed.

**Decision/failure — [Verified].** OpenCode permissions use `allow`, `ask`, and
`deny`, with granular patterns and last matching rule behavior. Plugin code can
throw to prevent a tool call in examples. `--auto` does not override explicit
denials. The docs do not establish a general universal failure policy for every
plugin exception, so Jev must test the exact runtime behavior before relying on
it.

**Host coverage / backend metadata — [Project-claimed, partly verified].** OpenCode has a
provider abstraction documented separately from plugins; its provider page
advertises a broad set of hosted and compatible providers. That provider
selection concerns OpenCode's own session, not Codex/Claude/Kimi adapter
coverage.

**Security/privacy — [Verified/inferred].** Project plugins are executable code
and project configuration can affect permissions, so installation and trust
must be explicit. The permission docs show `.env` denial as a normal pattern.
Sending source to a remote Jev backend remains Jev's responsibility, not an
OpenCode privacy guarantee.

**Maintenance — [Verified].** The official docs are maintained and dated
2026-09-19 in this snapshot. This proves current documentation, not long-term
API stability.

**Classification: OPTIONAL INTEGRATION.** Implement an OpenCode adapter after
the Codex adapter. Borrow separate post-edit and pre-tool capabilities and
permission precedence; do not make OpenCode the cross-host core.

### agenthooks

**Role and lifecycle — [Project-claimed, source-visible].** agenthooks is a Go
adapter/runtime library. Its README describes a typed pre-tool pipeline,
post/other events, an in-process `Decide` mode, and a raw event escape hatch.
It presents normalized projections while retaining the provider payload.
See its [README and design files](https://github.com/speakeasy-api/agenthooks).

**Extension and composition — [Verified from source/README].** Handlers stack
in registration order. `Any`, `All`, `When`, middleware, custom matchers, and
`Walk` expose explicit composition and introspection. `install.Manifest` emits
provider-specific hook files/scaffolding. This is the strongest direct prior
art for separating policy logic from wire codecs.

**Decision/failure — [Project-claimed, source-visible].** The project exposes
neutral, allow, ask, deny/block-style decisions, `NoDecision`, fail-closed
policy, ask fallback, and `Strict` versus `Degrade` behavior for unsupported
capabilities. `All` merges the most restrictive decision and joins errors.
These semantics should be reproduced in Jev's conformance tests before any
dependency adoption.

**Host coverage — [Project-claimed].** It lists Claude Code, Cursor,
Codex, Gemini CLI, OpenCode, Kimi Code, OpenClaw, GitHub Copilot CLI, and
Copilot Chat. The repository contains provider codecs and end-to-end fixtures,
but this report did not execute each real CLI.

**Security/privacy — [Inferred from design].** Keeping `Event.Raw` and unknown
fields prevents lossy normalization, but it also preserves sensitive payloads.
Transcript/MCP resolution and shell execution require an explicit Jev data-flow
policy. The library's adapter boundary does not itself guarantee source stays
local.

**Maintenance — [Verified].** The repository showed 71 commits, MIT license,
4 stars, 2 forks, zero issues, and three open pull requests at the snapshot.
It contains tests, fixtures, and opt-in real-CLI E2E tooling. Low adoption and
no release evidence are material dependency risks.

**Classification: BORROW.** Borrow raw-plus-normalized events, capability
degradation, explicit decision algebra, and installer/codec separation. Run a
time-boxed Go dependency spike; do not couple Jev's core to it until versioned
API and provider conformance are proven.

### Chock

**Role and lifecycle — [Project-claimed/source-visible].** Chock is a
governance-as-code policy compiler. A repository policy fans out to ambient
instructions, native agent controls, Git hooks, and CI. It is not an agent
loop or a semantic code-review engine.

**Extension and composition — [Project-claimed].** Users add catalog policies
and commit generated artifacts. Its repository describes 39 policies, generated
agent plugins, catalog/evaluation data, and context reports. The policy source
is the composition point rather than runtime package discovery.

**Decision/failure — [Verified from project documentation].** Chock labels each
policy/agent result `enforced`, `enforced-at-commit`, or `advisory`; it claims a
grade only after an install witness. Ambient `AGENTS.md` is advisory, a Git/CI
gate is commit-enforced, and a native fail-closed control is enforced. This
vocabulary maps directly to Jev's blocking/advisory requirement.

**Host coverage — [Project-claimed].** The README claims 15 agents and
multiple enforcement surfaces, including Codex, Claude, Copilot, and Cursor.
The matrix distinguishes surfaces rather than claiming parity, which is the
important design practice. Independent runtime verification remains pending.

**Security/privacy — [Project-claimed/inferred].** The README describes a
deterministic no-network enforcement runner and signed/evidenced context
reports. Generated project artifacts still become project-controlled policy
inputs; Jev must define whether a repository may weaken a user/global rule.

**Maintenance — [Verified].** The repository is very new in this research
snapshot, with low visible adoption despite a substantial README/catalog claim.
The exact policy count and coverage are project claims, not independently
replayed here.

**Classification: BORROW.** Adopt the idea that “supported” is per-rule,
per-host, per-surface, and backed by an install/runtime witness. Do not adopt
the runtime as a Jev dependency until policy semantics and evidence artifacts
are tested against real hosts.

### Rulesync

**Role and lifecycle — [Project-claimed/source-visible].** Rulesync is a
cross-host configuration compiler. It generates rules, hooks, permissions,
skills, commands, subagents, MCP configuration, and checks from unified files.
It does not itself evaluate a Jev reading during an edit.

**Extension and composition — [Project-claimed].** Import/export, conversion,
selective generation, and a large target matrix are its primary seams. The
generated artifacts compose through each target host's own semantics; they do
not create a common runtime.

**Decision/failure — [Inferred from architecture].** Advisory Markdown, native
hooks, permissions, and CI checks have different enforcement strengths. A
successful generation does not mean the generated hook will block, nor that
failure modes match across hosts. Jev should expose generated-config diagnostics
and preserve unsupported-capability warnings.

**Host coverage — [Verified/project-claimed].** The support table lists
OpenCode and Kimi Code, and the existing matrix includes Codex and Pi. It also
warns that feature support may mean project, global, or simulated support rather
than semantic equivalence. See the [support matrix](https://github.com/dyoshikawa/rulesync#supported-tools-and-features).

**Security/privacy — [Inferred].** Generation writes executable hooks and
permissions into project/user locations. A compiler must distinguish trusted
configuration from untrusted repository content and avoid silently broadening
permissions. Rulesync's generated files should be reviewed like code.

**Maintenance — [Verified].** The repository has a broad, actively maintained
target matrix in the checked snapshot. Exact semantic coverage is project
documentation and needs host-level tests.

**Classification: OPTIONAL INTEGRATION.** Use Rulesync as an optional
distribution/configuration compiler or as a target-matrix reference. Do not
make it Jev's evaluation or enforcement runtime.

### Shaka

**Role and lifecycle — [Project-claimed/source-visible].** Shaka is a local,
provider-neutral shared environment around Claude Code, Codex, OpenCode, and
Pi. It installs session hooks, memory/context loading, workflows, MCP/native
tools, and a `tool.before` security validator. See the [README](https://github.com/jgmontoya/shaka).

**Extension and composition — [Verified/project-claimed].** `shaka init`
detects providers and generates provider-specific bridges. Claude/Codex use an
MCP server for some tools; OpenCode uses a generated plugin; Pi uses a generated
extension. User customization directories and generated links are part of its
configuration model.

**Decision/failure — [Project-claimed/source-visible].** Its security validator
matches Bash patterns and sensitive paths from YAML; catastrophic operations
block and dangerous operations ask. This is useful data-driven safety prior
art, but the full failure policy and all host adapters need runtime testing.

**Host coverage — [Verified/project-claimed].** It explicitly supports
Claude Code, OpenCode, Codex, and Pi; no Kimi adapter is advertised. Its
provider-neutral label describes shared infrastructure, not universal model
provider routing.

**Security/privacy — [Project-claimed].** Shaka is local-oriented and its
security patterns are repository data, but it also includes inference wrappers
around provider CLIs. Jev must separately audit any network calls, credentials,
transcripts, and source sent to model CLIs.

**Maintenance — [Verified].** The repository showed 28 stars, 5 forks, MIT
license, tests, and provider-specific Docker/E2E commands in this snapshot.
Its README labels several feature ideas as planned rather than implemented.

**Classification: BORROW.** Borrow generated bridge layout, provider parity
discipline, and declarative safety patterns. Do not depend on the whole shared
environment or couple Jev to its memory/workflow/inference subsystems.

### AWS CLI Agent Orchestrator (CAO)

**Role and lifecycle — [Verified/project-claimed].** CAO is a Python control
plane that launches many provider CLIs in isolated tmux sessions and exposes
profiles, flows, APIs, PTY streams, MCP, memory, and restrictions. Its README
lists Kiro, Claude, Codex, Antigravity, Hermes, Kimi, MiniMax, Copilot,
OpenCode, Oh My Pi, Cursor, and Grok CLIs.

**Extension and composition — [Verified from project docs].** CAO has server
plugins, MCP tools, session/terminal/message events, provider profiles, and
workflow surfaces. It is designed to coordinate agents, not to be embedded as
an in-process Jev rule engine.

**Decision/failure — [Verified from existing plugin contract review].** Current
plugin events are outbound/after-the-fact observers and cannot block, modify,
or reject an already-running provider action. Tool restrictions vary by provider
and can be soft/advisory for some hosts. Therefore CAO cannot replace native
Codex/OpenCode pre-action adapters for Jev enforcement.

**Host coverage — [Verified as README claims].** CAO has the broadest
listed provider-CLI set in this comparison, but provider behavior is a separate
documented compatibility surface and must be tested per CLI/version.

**Security/privacy — [Inferred from architecture].** Isolated sessions and
Kubernetes deployment are useful operational controls, but CAO necessarily
handles credentials, workspace state, terminal streams, and potentially source
content. The review integration should minimize what is sent to the control plane.

**Maintenance — [Verified].** The repository showed about 1.3k stars, 272 forks,
Apache-2.0 license, and extensive operational documentation. This is strong
adoption evidence for orchestration, not evidence that its plugins enforce
policy.

**Classification: OPTIONAL INTEGRATION.** Integrate later for fleet/session
observation or orchestration if needed. Borrow its provider discovery and
session identity concepts. Reject CAO as the Jev enforcement or rule-plugin
substrate.

### Probity

**Role and lifecycle — [Verified in prior cleanroom extraction].** Probity is a
TypeScript hard-policy engine with pre-tool adapters. Its canonical action is a
write or command; the main shipped path evaluates before the action and returns
pass or violation. It is not a post-edit advisory bus.

**Extension and composition — [Verified].** `probity.config.ts` composes user
rules and path-scoped rule blocks as ordinary TypeScript imports. Rules execute
in declaration order and stop at the first violation. The project has an
internal per-vendor adapter registry, but no documented dynamic third-party
adapter/plugin discovery API.

**Decision/failure — [Verified].** The public result is binary `pass` or
`violation`; malformed output, thrown rules, parse failures, and validator
errors fail closed. A custom `Config.ai` agent can replace the prompt-to-verdict
backend, but the contract loses Jev's structured findings, score, confidence,
and advisory disposition.

**Host coverage — [Verified].** Current documented hosts are Claude Code,
OpenAI Codex, and GitHub Copilot CLI. Kimi, Pi, and OpenCode are not shipped in
the reviewed registry/setup. Shell-mediated writes are a known completeness
gap for file rules.

**Security/privacy — [Verified/inferred].** Vendor SDKs use the user's host
authentication, so AI rules can send prompts/transcript-derived context through
the selected provider. Existing issue evidence includes prompt-injection risk
in raw command history. Jev must not inherit that data flow without an explicit
privacy policy.

**Maintenance — [Verified from prior report].** The checked repository had
substantial activity, 571 commits, 206 stars, 24 forks, and active Codex-related
issues/PRs. It also demonstrates that host payload compatibility is a continuing
maintenance cost.

**Classification: OPTIONAL INTEGRATION.** Keep Probity as a hard-policy
comparison and offer a thin adapter for users who want Jev findings promoted to
blocking violations. Borrow its canonical action and anti-corruption adapter
split. Do not make Probity the product core or force the review contract into its binary format.

### reviewdog

**Role and lifecycle — [Verified].** reviewdog is a mature linter/formatter
diagnostic transport and review reporter. It accepts RDJSON/RDJSONL, unified
diff, Checkstyle, SARIF, and other inputs; it is normally run locally or in CI,
not inside an agent tool loop. See the [README and RDFormat docs](https://github.com/reviewdog/reviewdog#reviewdog-diagnostic-format-rdformat).

**Extension and composition — [Verified].** A checker emits a stable diagnostic
format and reviewdog selects diff filtering and a reporter (GitHub PR, GitLab,
local, and others). This is an excellent separation between analyzer, finding
schema, and presentation adapter.

**Decision/failure — [Verified/inferred].** Its primary result is a finding and
reporting outcome; it is not a pre-tool allow/ask/deny decision engine. Process
exit status and CI configuration can gate a build, but there is no agent-session
rollback or permission semantics.

**Host coverage — [Verified].** It is language/tool/reporter neutral,
not agent-host neutral in the lifecycle sense. It can consume Jev output from a
Codex hook or CI command, but does not adapt Codex/OpenCode payloads itself.

**Security/privacy — [Inferred].** Local execution and direct reporters can
avoid a hosted reviewdog server, but CI/reporting destinations can receive
source locations, messages, and suggestions. Jev must choose its own redaction
and egress policy before emitting RDJSON.

**Maintenance — [Verified].** The repository showed approximately 9.6k stars,
495 forks, a long-lived Go codebase, and an established reporter ecosystem in
this snapshot. That is the strongest maturity signal in this set for finding
transport, not realtime agent integration.

**Classification: OPTIONAL INTEGRATION.** Emit a Jev-to-RDJSON adapter for CI,
diff review, and editor/reporting workflows if the product needs it. Borrow its
stable finding/report separation; do not use it as the realtime lifecycle host.

## Product implications for later specification/prototype work

1. **Canonical review contract:** define an action/edit request and a rich
   finding response independently of any host. Include rule identity, message,
   score/confidence, optional source range, evidence, backend identity, and a
   disposition such as advisory or block.
2. **Host adapter contract:** preserve the raw host event and expose a
   normalized projection. Every adapter must declare capabilities, timing,
   payload fidelity, timeout behavior, and whether the action is already
   applied. Model-provider details remain secondary metadata unless they change
   this contract or Jev data flow.
3. **Enforcement grades:** represent runtime blocking, commit/CI enforcement,
   and advisory context as distinct guarantees. Never report a host as simply
   “supported.”
4. **Composition:** define multiple-hook ordering, duplicate invocation,
   idempotence, conflict precedence, and coexistence with Probity or another
   policy tool before implementation.
5. **Failure policy:** advisory and blocking rules need explicit per-rule or
   per-run fail-open/fail-closed settings. A probabilistic or network-backed
   reading should not silently inherit a hard-policy failure mode.
6. **Cadence split:** Codex `PostToolUse`/OpenCode `file.edited` are post-effect
   advisory surfaces; native pre-tool hooks are blocking surfaces; Stop/commit/CI
   are broader review surfaces. The prototype should test all three scopes.
7. **Privacy:** default to local/no-network behavior or make source egress an
   explicit opt-in. Add file globs, byte/line limits, secret-file exclusions,
   redaction, backend identity, and a kill switch.
8. **Evidence and testing:** create a host/version fixture matrix and real
   smoke tests for Codex `apply_patch`, Bash-mediated writes, MCP, OpenCode
   plugin events, nested projects, worktrees, and multiple installed tools.
9. **Dependency strategy:** first spike agenthooks and reviewdog independently;
   keep the review core dependency-free until their API/version/privacy tradeoffs are
   proven. Probity is an optional hard-policy integration, not a required
   foundation.

## Open questions for the next specification/prototype

- What is the exact canonical edit representation: full file, patch, changed
  ranges, or an event with a lazy file reader?
- Is advisory feedback model-visible context, terminal/UI output, a structured
  event stream, or all three?
- Can a user configure blocking per rule, per host, per cadence, and per failure
  mode without duplicating rule logic?
- What is the aggregation algebra when several rules produce findings or when
  Jev runs alongside Probity?
- Which host trust/install state is required before Jev reports that an adapter
  is active?
- What are the exact limits and redaction rules for source, diffs, transcripts,
  and Jev/backend requests?
- Do we need a standalone plugin package, an MCP server, a CLI, or all three in
  the first prototype?
- Is `agenthooks` a temporary implementation dependency, a permanent adapter
  layer, or only a source of test cases and design ideas?

## Primary sources

- [OpenCode plugins](https://opencode.ai/docs/plugins/), [permissions](https://opencode.ai/docs/permissions/), and [providers](https://opencode.ai/docs/providers/)
- [agenthooks README/design](https://github.com/speakeasy-api/agenthooks)
- [Chock README](https://github.com/open-coder-ai/chock)
- [Rulesync README/support matrix](https://github.com/dyoshikawa/rulesync)
- [Shaka README](https://github.com/jgmontoya/shaka)
- [AWS CLI Agent Orchestrator README](https://github.com/awslabs/cli-agent-orchestrator) and [plugin docs](https://github.com/awslabs/cli-agent-orchestrator/blob/main/docs/plugins.md)
- [Probity repository](https://github.com/nizos/probity), [configuration](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md), and [adapter contract](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts)
- [reviewdog README](https://github.com/reviewdog/reviewdog)
