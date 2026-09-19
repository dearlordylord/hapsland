# Probity architecture for Jev integration (2026-09-19)

## Scope and verdict

This is a source-level review of [nizos/probity](https://github.com/nizos/probity), using the repository's `main` branch, published package metadata, documentation, ADRs, and issue/PR history checked on 2026-09-19. It is intentionally narrower than the landscape report: the questions here are whether Probity can host independent Jev rules, how its agent/provider seams actually work, and whether it supports advisory as well as blocking policy.

**Verdict:** Probity is credible direct prior art for a Codex realtime guard. Its strongest seam is a vendor-neutral rule engine behind per-vendor hook adapters. A project can compose synchronous or asynchronous TypeScript rules and can inject an independent AI validator through `Config.ai`. However, the shipped product is a fail-closed pre-tool blocker, not a general advisory review bus; its supported-host registry is currently Claude Code, Codex, and GitHub Copilot (with a hidden Copilot Chat adapter), not Kimi or Pi; and the published package directly depends on the three vendor SDKs. Jev can be used as a custom rule/AI backend, but it is not a drop-in Probity provider unless Jev implements the small `Agent` contract in project configuration or Probity adds an adapter.

For Jev, the useful split is: borrow Probity's canonical action/rule/adapter ideas, but keep Jev's analyzer, findings, backend selection, privacy policy, and advisory-vs-blocking policy independently owned.

## Evidence of adoption and maintenance

- The repository showed 206 stars, 24 forks, 17 open issues, and 10 open PRs when checked on 2026-09-19. The repository has 571 commits. These numbers are evidence of a real, active community project, not evidence of production reliability by themselves. See the [repository](https://github.com/nizos/probity).
- `package.json` reports version `1.10.0`, MIT licensing, Node `>=22`, and a published `probity` CLI. It currently lists `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, and `@github/copilot-sdk` as dependencies, with no Kimi or Pi SDK. See [package.json](https://github.com/nizos/probity/blob/main/package.json).
- Recent public activity is directly relevant to Codex: [PR #76](https://github.com/nizos/probity/pull/76) fixed array-shaped Codex custom-tool output, while [PR #81](https://github.com/nizos/probity/pull/81) addresses Claude subagent transcript merging. [Issue #75](https://github.com/nizos/probity/issues/75) documents a Codex transcript compatibility problem. This is healthy maintenance evidence, but also shows that host transcript and payload formats are moving compatibility surfaces.
- Provider expansion is active but not complete: [OpenCode issue #64](https://github.com/nizos/probity/issues/64) and [PR #65](https://github.com/nizos/probity/pull/65) remain separate work, and [Hermes issue #74](https://github.com/nizos/probity/issues/74) describes an integration that needs a Python plugin because Hermes cannot shell out to a JS hook. Thus “more agents coming” in the README is roadmap language, not current support.

## Actual architecture and extension seams

### Canonical rule engine

The [rule contract](https://raw.githubusercontent.com/nizos/probity/main/src/rules/contract.ts) is deliberately small:

```ts
type Rule = (action: Action, ctx?: RuleContext) =>
  | RuleResult
  | Promise<RuleResult>

type RuleResult =
  | { kind: 'pass'; reason?: string; notes?: readonly { kind: string }[] }
  | { kind: 'violation'; reason: string }
```

`Action` is canonicalized to either `{ kind: 'write', path, content }` or `{ kind: 'command', command }`. `RuleContext` can expose the selected AI validator, canonical/raw session history, and a bounded safe file reader. Rules therefore do not need to know whether the host payload came from Codex, Claude, or Copilot.

The [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts) evaluates entries in order and short-circuits on the first violation. A thrown rule, malformed result, or parse failure is a block (fail-closed). It returns an `Outcome` with a canonical decision plus a trace; the generic lifecycle hooks in that outcome are useful for metrics and audit observers, but they are not an advisory result channel.

### Config composition and user-defined rules

`probity.config.ts` is executable TypeScript/JavaScript loaded with Jiti. The [configuration docs](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md) expose two composition forms:

```ts
export default defineConfig({
  rules: [
    noTodoComments,                         // global rule
    { files: ['src/**'], rules: [ruleA, ruleB] }, // path-scoped rules
  ],
})
```

Flat rules receive every canonical action and self-filter; a `files` block narrows writes by glob. Multiple entries are evaluated in declaration order. This is a good independent rule seam: a Jev project can import Probity types and place Jev-owned deterministic checks in its own config without changing Probity source.

Probity's public package exports `defineConfig`, `Config`, `RuleEntry`, `RuleBlock`, the `Rule`/`RuleContext` types, and the built-in rules through the root and `./rules` exports. The code and docs show **user-defined functions and built-in rule factories**, not a runtime plugin registry, package discovery protocol, lifecycle for third-party rule packages, or a standalone linter-reporter API. A reusable Jev rule package is possible as a normal npm dependency, but distribution/registration remains ordinary TypeScript import and config composition.

### AI/backend seam

`Config.ai` is an explicit override for the minimal [Agent contract](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts):

```ts
type Agent = {
  reason: (prompt: string) => Promise<Verdict>
}
```

The [configuration docs](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md) say this can use a different model or provider. The default is selected by the host `--agent` value. Built-in vendor agents call their official SDKs, normalize output to `{ kind: 'pass' | 'violation', reason }`, and fail closed when the SDK fails or emits an invalid verdict. The [Codex agent](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/agent.ts), for example, creates a read-only, no-network Codex SDK thread for each validator call.

This is the cleanest Jev integration seam today:

```ts
import { defineConfig, type Agent } from '@nizos/probity'

const jevAgent: Agent = {
  reason: (prompt) => jevClient.review(prompt),
}

export default defineConfig({ ai: jevAgent, rules: [jevRule] })
```

That example is architectural, not a tested Jev API claim. Probity's `Agent` contract is only a prompt-to-verdict function: it does not carry the canonical action, path, structured findings, confidence score, provider identity, privacy decision, or advisory severity. A richer Jev result must be encoded into the reason or handled by a custom `Rule` outside Probity's built-in AI rules.

### Vendor adapter seam

The accepted [ADR-0001](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0001-per-vendor-adapter-anti-corruption-layer.md) makes the boundary explicit. A vendor folder supplies:

- `adapter.ts`: `parseAction(payload)` and `toResponse(decision)`,
- `agent.ts`: the vendor's AI-validator factory,
- `transcript.ts`: session-log parsing,
- `event.ts`: optional raw-to-canonical history classification.

The shared [adapter contract](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts) is only `parseAction`, `toResponse`, and optional `sessionPath`. The [registry](https://raw.githubusercontent.com/nizos/probity/main/src/registry.ts) wires vendor names to those pieces. Adding a host is therefore conceptually straightforward, but in the shipped package it requires source changes and a release: a new folder alone is not dynamically discovered. [Issue #64](https://github.com/nizos/probity/issues/64) and [PR #65](https://github.com/nizos/probity/pull/65) confirm that a new vendor requires a registry entry, tests, docs, and often a vendor SDK dependency.

The Codex adapter parses `Bash` as a command and `apply_patch` as one or more canonical writes, splitting multi-file patches. Its block response is `{ decision: 'block', reason }`; allow is empty stdout. See [Codex adapter source](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts). This is a strong realtime-edit shape, but it is necessarily host/version-specific.

## Provider and host coverage

| Host/provider requested | Current evidence | Assessment for Jev |
| --- | --- | --- |
| Claude Code | Registered in `src/registry.ts`; setup docs wire `PreToolUse`; Anthropic SDK dependency. | Shipped. |
| OpenAI Codex | Registered; Codex hooks setup and `apply_patch` multi-file parsing are documented; OpenAI Codex SDK dependency. | Shipped and the closest prior art for Jev's first adapter. |
| GitHub Copilot CLI | Registered as `github-copilot`; separate hidden `github-copilot-chat` adapter. | Shipped, but payload drift is active; see Copilot issue [#68](https://github.com/nizos/probity/issues/68). |
| Kimi | No Kimi entry in the current registry, no Kimi SDK in `package.json`, and no Kimi setup section. | Not shipped; no adapter seam available to users except writing/forking one. |
| Pi | No Pi entry, SDK, or setup section found in the current package/repository source. | Not shipped; unknown future support. |
| Other agents | OpenCode and Hermes are explicit open issues/PR work, not current documented support. The tree also contains an `antigravity-cli` adapter file, but it is not registered and is not named by the CLI/docs as a supported vendor. | Do not count as supported until registry, package, setup docs, and release agree. |

This distinction matters: Probity has a good **internal** adapter abstraction, but not a user-installable external adapter/plugin API. Kimi/Pi support would be a Probity upstream contribution or a maintained fork/wrapper, not a config-only operation.

## Independent Jev-owned rules and composability

There are three practical levels of composition:

1. **Rules in a Probity host:** Jev can ship a normal TypeScript rule (or rule factory) that consumes `Action`, `RuleContext`, and a Jev client. This keeps Jev's rule configuration in `probity.config.ts`, independent of Probity's built-ins. Path globs and ordering are available.
2. **AI validator replacement:** Jev can implement `Config.ai` and let Probity's existing AI-aware rules call Jev. This is useful only when a prompt-to-`Verdict` is enough. It does not preserve Jev's richer finding model.
3. **Jev as the primary analyzer:** Jev can own a backend-neutral analysis API and use a thin Probity `Rule` wrapper for hard pre-tool decisions. This is the least coupled option and allows the same Jev analysis to run from Codex PostToolUse/Stop, CI, editor integrations, or a standalone CLI.

Probity does not provide a generic “run arbitrary external linter and merge diagnostics” contract. A command can be blocked with `forbidCommandPattern`/`requireCommand`, and a custom rule can invoke a subprocess, but the canonical result has only pass/violation and a single reason. Existing lint findings, source ranges, confidence, and multiple advisory findings would need to be serialized into that reason or managed outside Probity.

Probity itself reads host transcripts for contextual rules. The [session-history ADR](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0003-session-history-via-host-transcript.md) intentionally exposes raw vendor events to AI rules and canonical events to deterministic rules. This is useful context composition, but it means an AI-backed Jev rule should make an explicit data-flow/privacy decision before forwarding transcript content to any service.

## Blocking versus advisory policy

Probity's public contract is binary and blocking:

- `{ kind: 'pass' }` means no objection;
- `{ kind: 'violation', reason }` becomes a canonical `block`;
- exceptions, malformed results, missing config, invalid payloads, and validator parse errors fail closed;
- adapters emit the vendor's deny/block response and leave allow empty so the host's normal permission flow remains intact.

The [setup docs](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md) describe a pre-tool hook and explicitly call the package's output a vendor response. The source's [CLI fail-closed path](https://raw.githubusercontent.com/nizos/probity/main/src/bin.ts) notes that some hosts treat a non-zero process exit as advisory, so Probity emits a block response on stdout and exits zero. That is a compatibility tactic, not an advisory mode.

There is no documented `advisory`, `warn`, `severity`, `confidence`, `additionalContext`, or “record but allow” rule result. The engine trace is operator-facing, not sent to the coding agent. A Jev advisory integration therefore needs a separate Codex hook/CLI projection or a custom rule that always passes while logging/printing findings; the latter cannot reliably surface structured feedback to the agent and should not be confused with enforcement.

## Limitations and concrete risk signals

- **Shell writes bypass write rules.** [Issue #62](https://github.com/nizos/probity/issues/62) reports that `echo >>`, `tee`, `sed -i`, `git apply`, and similar writes arrive as `command`, so `enforceTdd` and file-scoped write rules do not see them. The issue remains open in the checked snapshot. This is a material completeness limitation for “every realtime edit.”
- **Cross-host payload drift is real.** [Issue #56](https://github.com/nizos/probity/issues/56) reports Copilot receiving Codex `apply_patch` payloads that the Copilot adapter did not treat as writes. [Issue #68](https://github.com/nizos/probity/issues/68) reports another Copilot payload parsing change. Adapter tests and version smoke tests are required for any Jev integration.
- **Transcript-derived AI context can be prompt-injection-sensitive.** [Issue #61](https://github.com/nizos/probity/issues/61) reports raw command output being inserted into an AI judge prompt without a boundary, causing ordinary output to be interpreted as prompt injection. This is an open issue and directly affects any Jev rule that uses `ctx.rawHistory()` or Probity's AI rules.
- **Vendor SDK coupling remains.** The README says Probity needs no separate key because it reuses the user's vendor authentication; that is convenient but does not mean local-only or backend-neutral. AI validation still sends prompts/transcript-derived content through the selected SDK/provider. Package metadata currently installs all three SDK dependencies, while [PR #54](https://github.com/nizos/probity/pull/54) proposes making them optional peer dependencies; do not assume that packaging change has shipped.
- **Concurrency/semantics are host-dependent.** The engine short-circuits rule evaluation for one parsed action and for the first blocked action in a multi-action payload. It does not define a stable finding aggregation, score, or merge semantics for multiple analyzers.
- **No Kimi/Pi adapter is a meaningful gap, not merely missing documentation.** The registry, CLI vendor list, setup docs, package dependencies, and README all identify the currently supported set; a new host requires source-level adapter and registry work.

## Recommendation for Jev

Use Probity as an integration reference and optional hard-policy host, not as Jev's core abstraction.

1. Keep Jev's rule/analyzer API backend-neutral and richer than `pass | violation`: support findings, score/confidence, source locations, provider metadata, privacy/data-flow decisions, and an explicit disposition (`advisory` or `block`).
2. Add a thin Codex adapter that maps Jev findings to the official hook response. Make advisory the default and make blocking opt-in per rule/configuration; preserve a separate Stop/PostToolUse path for whole-diff review because pre-tool rules cannot catch shell-mediated writes.
3. If Probity interoperability is useful, publish a small `probity` rule wrapper that calls Jev and maps only blocking findings to `violation`. Keep Jev's own config/backend selection outside Probity's `probity.config.ts`; do not make Jev's identity or data policy depend on Probity's vendor SDK selection.
4. Treat Probity's `Config.ai` as a narrow escape hatch for experiments, not the long-term Jev provider API. It loses structured Jev results and inherits Probity's fail-closed semantics.
5. Test each Codex version and payload shape, including multi-file `apply_patch`, native writes, custom tools, transcript formats, and shell commands that mutate files. Probity's open issues demonstrate that adapter correctness is the critical maintenance surface.

## Primary sources

- [Probity repository](https://github.com/nizos/probity)
- [README](https://github.com/nizos/probity/blob/main/README.md)
- [package.json](https://github.com/nizos/probity/blob/main/package.json)
- [Setup](https://raw.githubusercontent.com/nizos/probity/main/docs/setup.md) and [configuration](https://raw.githubusercontent.com/nizos/probity/main/docs/configuration.md)
- [Rule docs](https://raw.githubusercontent.com/nizos/probity/main/docs/rules.md)
- [Rule contract](https://raw.githubusercontent.com/nizos/probity/main/src/rules/contract.ts), [engine](https://raw.githubusercontent.com/nizos/probity/main/src/engine.ts), [types](https://raw.githubusercontent.com/nizos/probity/main/src/types.ts)
- [Adapter contract](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/adapter.ts), [registry](https://raw.githubusercontent.com/nizos/probity/main/src/registry.ts), [Codex adapter](https://raw.githubusercontent.com/nizos/probity/main/src/vendors/codex/adapter.ts)
- [ADR-0001: vendor adapters](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0001-per-vendor-adapter-anti-corruption-layer.md), [ADR-0003: session history](https://raw.githubusercontent.com/nizos/probity/main/docs/adr/0003-session-history-via-host-transcript.md)
- [Issue #62: shell writes](https://github.com/nizos/probity/issues/62), [Issue #61: prompt injection in history](https://github.com/nizos/probity/issues/61), [Issue #56: Codex payload in Copilot](https://github.com/nizos/probity/issues/56), [Issue #68: Copilot payload parsing](https://github.com/nizos/probity/issues/68)
- [Issue #64 / PR #65: OpenCode](https://github.com/nizos/probity/issues/64), [Issue #74: Hermes](https://github.com/nizos/probity/issues/74), [Issue #58: Kiro](https://github.com/nizos/probity/issues/58)
