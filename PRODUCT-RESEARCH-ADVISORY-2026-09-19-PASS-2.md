# Product research advisory — pass 2

Date: 2026-09-19. Canonical path for this pass: `PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md`.

This is product-specification advisory material, not a product specification or dependency approval. The product remains unnamed. Jev is TypeSafe's external review/classification backend; agent hosts own the tool loop. This pass applies [PRODUCT-RESEARCH-METHODOLOGY.md](./PRODUCT-RESEARCH-METHODOLOGY.md).

## 1. Research brief and change log

### Question, scope, and provisional assumptions

Can existing components satisfy configurable realtime review across agent hosts with less new implementation than a separate review core and adapters? Which contracts should be borrowed, which components are credible dependency candidates, and which belong at optional edges?

The initial brief retains the preceding pass's provisional assumptions: Codex first; OpenCode and Claude Code next; Kimi Code and Pi as portability targets. This ordering is context for comparison, not an approved rollout. Required for the comparison are user-authored independent rules, usable advisory feedback, optional blocking with an honest coverage declaration, coexistence with installed tools, bounded headless behavior, and an explicit remote-failure disposition. Desirable capabilities are finding locations, severity and confidence, install diagnostics, stable reporting formats, caching, and independently versioned rules. The relative priority of these desirable features is unsettled. No model-provider breadth score is used.

| Workflow | Representative scenario | What would count as a sufficient existing solution |
|---|---|---|
| W1: advisory after an edit | Native edit or shell-mediated write changes two files; a review reports a problem without claiming the write was prevented | Configurable quality rule receives relevant changed state; findings reach the model or operator through a declared channel |
| W2: optional blocking | The same rule is promoted to block a proposed edit | Declared pre-action coverage and an actual rejected operation; post-action warnings do not count |
| W3: multiple tools | Another policy hook and a reporting plugin are already installed; installation is repeated | Existing configuration survives; decisions have defined precedence; no duplicate remote call or repeated finding for the same event |
| W4: headless execution | A rule returns ask during an unattended run | A documented and exercised fallback finishes within a bound without silent approval or an infinite wait |
| W5: Jev unavailable | Timeout, 429/5xx, malformed answer, cancellation, or missing credentials | Failure is distinguishable from a negative finding; advisory and blocking dispositions follow an explicit policy |
| W6: feedback and trust | Agent edits in response to a finding; a repository also edits its own policy configuration | Stale results are identifiable, repeat work is bounded, and authority to weaken policy is explicit |

**Existing-solution baseline:** first try configuration of an existing Jev hook product; then a small Jev rule in an existing adapter library; then a composition of a configuration compiler, native hook, and reporter. Building a new core is justified only for a demonstrated contract gap or an unfavorable measured integration/maintenance cost. No-runtime-evidence is a reason to run a spike, not evidence that the baseline failed.

**Falsifiers set for this comparison:** a single existing package satisfying W1–W6 on Codex and a second host with no maintained fork would overturn the new-core preference. An adapter library that preserves the required findings/decisions and passes crash, headless, and coexistence checks at lower ongoing cost would overturn the borrow-only adapter preference. A reporting format preserving required findings without extensions would overturn a new reporting-schema preference. Conversely, source-visible information loss, a missing interception boundary, or an irreconcilable policy authority model defeats that component for that specific use.

### Discovery design and execution

The bounded method is three query rounds plus one-hop primary-source follow-up, not an exhaustive crawl. Start with the eight prior candidates, search for alternative compatibility layers and actual Jev lifecycle packages, follow materially different architecture references, and stop after the third round and its primary-source checks. Include a candidate if it owns an interception, rule, distribution, decision, reporting, or evidence boundary relevant to W1–W6. Exclude provider routers, generic host replacements, and duplicate narrow examples from detailed comparison; retain reasons below. Do not expand the adapter target set merely because a package lists additional hosts.

| Round / surface | Executed query or source | Result and effect on the brief |
|---|---|---|
| 1: discovery search | `coding agent cross host hooks review rules agenthooks alternatives`; `Jev review agent hooks fail open jev guard pi jev`; `site:npmjs.com coding agent hooks rules review` | Found jev-guard, pi-jev-auto-mode, and a commit-review package. Added actual Jev gates to challenge the existing-solution baseline; workflows unchanged |
| 2: code-oriented web search | `site:github.com "agenthooks" "review" hooks policy`; `site:github.com "Jev" "review" "hooks" "rules"`; `site:github.com "pi-jev-auto-mode" "fail"` | Found jevwire, coding-ethos, and directories. jevwire adds escalation-only decisions; primary documentation examined |
| 2: citation follow-up | Chock README → agentseam; Shaka prior-art links; repository file trees for agenthooks, Probity, CAO, jev-guard | Added agentseam as a direct adapter competitor; inspected selected implementation files rather than treating filenames as behavior |
| 3: boundary challenge | `site:github.com cross agent hook library canonical decision agentseam agenthooks`; `site:github.com Jev review lifecycle plugin configurable rules advisory` | Added AgentHook, a draft evidence specification; found Jev Review and jev-code, redirecting to stanley-code, as callable-review alternatives |
| Official ecosystems | [OpenCode ecosystem](https://opencode.ai/docs/ecosystem/), [Pi package catalog](https://pi.dev/packages) | Inspected curated discovery surfaces; did not treat listing as certification. `/ecosystem` initially failed; `/docs/ecosystem/` succeeded |
| Registries | Exact npm `/<name>/latest` for agenthooks, agentseam, jev-guard, pi-jev-auto-mode, jevwire; PyPI JSON for agentseam and chock | npm verified jev-guard 0.3.1 and pi-jev-auto-mode 0.4.1; PyPI reported agentseam 0.2.1 and chock 0.8.0. jevwire npm endpoint returned 404; other empty npm records do not prove absence from their appropriate ecosystems |
| Issue trackers | Probity #62 and #75; repository issue links available in candidate docs | Inspected concrete write-coverage and transcript-shape reports. Did not perform a full issue census |

No authenticated global GitHub code search was performed. Source discovery used public web queries restricted to GitHub plus GitHub tree and raw-file APIs. Registry versions identify distributions, not the code exercised: **no candidate or agent was executed**. The brief expanded its candidate inventory, not its required workflows. The stopping condition was the fixed three-round budget; new results still existed in round 3, so this pass does not claim saturation.

### Relationship to prior research

This pass updates comparative decisions, evidence confidence, baseline sufficiency, and the handoff for the candidates below. It supersedes those scopes of [the prior advisory](./PRODUCT-RESEARCH-ADVISORY-2026-09-19.md), not the distinct [Probity cleanroom extraction](./RESEARCH-PROBITY-SPEC-EXTRACTION-2026-09-19.md), [Probity architecture report](./RESEARCH-PROBITY-ARCHITECTURE-2026-09-19.md), [agent-rule landscape](./RESEARCH-AGENT-RULE-TOOLS-2026-09-19.md), or [Jev tool inventory](./RESEARCH-JEV-TOOLS-2026-09-19.md). Those reports supplied discovery leads; material new conclusions below cite primary sources.

The delegated research task limited its edits to this new file. The repository owner then
completed the methodology's forward-link cleanup in the earlier comparative reports. Within
the updated scope, this is now the canonical advisory; use its recommendations rather than
the older rankings.

| Previous conclusion or practice | Pass-2 change | Why |
|---|---|---|
| Documentation and source were both called verified | Source class and verification state are separate for each ledger entry | A README and an independently executed host are different evidence |
| Build/retain a review contract and thin native adapters | Retain ownership as a provisional boundary; first compare existing-package composition in a spike | The earlier pass did not disprove the existing-solution baseline |
| agenthooks was the main adapter dependency spike | Compare agenthooks with agentseam | Chock directly points to a separate compatibility substrate |
| Eight candidates were the practical comparison | Add jev-guard, pi-jev-auto-mode, jevwire, agentseam, and AgentHook | They expose distinct failure, trust, approval, or evidence designs |
| Borrow fail-open/fail-closed settings | Separate handler failure from hook-process death and host enforcement | agenthooks' declared policy does not establish host behavior after the process dies; agentseam explicitly distinguishes these guarantees |
| Broad provider/host coverage claims | Record component, surface, scope, and confidence | Kimi hooks in one library and Git/CI-only Kimi in Chock are compatible claims about different install boundaries |
| Privacy discussion mostly inferred | Record a concrete jev-guard documentation/source contradiction | README's no-storage statement conflicts with session JSON writes |
| Maintenance snapshots used counts | Prefer pinned source and explicitly unresolved release/API gates | Popularity and recency do not prove conformance; Probity reports also disagree on package version |

## 2. Candidate inventory

| Candidate / class | Inclusion or exclusion reason |
|---|---|
| OpenCode / agent host | Include: native plugin and permission boundary |
| agenthooks / host-adapter library | Include: raw/native projection, decisions, capability degradation, installers |
| Chock / policy compiler and adjacent Git/CI control | Include: install witnesses and per-surface grades |
| Rulesync / configuration compiler | Include: representative broad configuration distribution |
| Shaka / host bridges and shared environment | Include: generated subprocess, plugin, and extension bridges |
| CAO / orchestration and control plane | Include: distinguish observer plugins from interception |
| Probity / hard-policy engine | Include: independent TypeScript rules and source-visible binary contract |
| reviewdog / finding reporter | Include: reusable reporting boundary |
| jev-guard / Jev rule engine and host adapters | Include: strongest direct cross-host Jev baseline found |
| pi-jev-auto-mode / native Pi policy extension | Include: fail-closed uncertainty and trusted override boundary |
| jevwire / Jev library, MCP, Claude hooks | Include: escalation-only hook policy and bounded feedback |
| agentseam / compatibility library | Include: direct alternative to agenthooks, explicit evidence grades |
| AgentHook / draft runtime-evidence contract | Include as an adjacent evidence standard, not a claimed host runtime |
| [y0usaf/pi-jev](https://github.com/y0usaf/pi-jev) / Pi gate | Exclude detailed card: native Pi Jev gate class represented by pi-jev-auto-mode; its documented shadow/fail-open option remains a counterexample to choosing fail-closed universally (E36) |
| [NiazMorshed2007/jev-review](https://github.com/NiazMorshed2007/jev-review), [devagrawal09/stanley-code](https://github.com/devagrawal09/stanley-code) / callable quality reviewers | Exclude detailed cards: useful W1 fallback, but the inspected descriptions establish MCP/CLI invocation rather than mandatory lifecycle interception. Do not infer they cannot be wrapped (E37) |
| [coding-ethos](https://github.com/paudley/coding-ethos) / policy suite | Defer detailed comparison: CEL/MCP/Git/SARIF span existing classes, but compatibility and Jev extensibility were not established within the discovery bound. This is an unresolved alternative, not rejection on quality |
| [@khoralabs/agent-review](https://www.npmjs.com/package/%40khoralabs/agent-review) / commit-review workflow | Exclude detailed card: staged/commit review is adjacent to realtime interception; selected reporter and Git/CI compiler already cover that boundary |
| AgentSync, ai-rulez, Ruler / config distributors from prior landscape | Exclude fresh deep dive: compiler class sampled by Rulesync; their previous rankings are not revalidated here |
| Invariant, NeMo Guardrails, OPA / general policy or gateway systems from prior landscape | Defer: they require an interception integration and do not establish W1–W6 across the selected hosts in this pass. Revisit if a general policy language becomes a specification priority |
| pre-commit, Danger, Semgrep, ast-grep / VCS/reporting/static checks from prior landscape | Exclude deep dive: remain adjacent checks; reviewdog/Chock sample reporting and delayed enforcement, not substitutes for static analysis |
| OpenCode ecosystem auth, routing, context-pruning, notification, and host-replacement projects | Exclude core candidacy: those listed purposes do not establish configurable review rules across existing hosts. No general quality judgment |
| HookBus / AgentHook reference implementation | Defer: the draft evidence contract is evaluated; a governance bus is not needed by the current brief, and its execution semantics were not inspected |

## 3. Evidence ledger

All sources were accessed **2026-09-19**. Each source key in section 9 identifies an immutable revision or an access-dated primary page. Code excerpts were fetched read-only over HTTPS. `DOC`, `SRC`, `ISSUE`, and `META` are source classes. `DOCUMENTED`, `SOURCE-INSPECTED`, `INFERRED`, `UNKNOWN`, and `NOT APPLICABLE` are verification states. There are **no RUN or RUNTIME-TESTED entries**. A project's reported live test is still documentation in this pass.

In the ledger, the component/use column fixes scope; all cards and matrices inherit it. U1 is a deliberately bounded unknown record, not an assertion that a feature is absent.

| ID | Exact proposition; component / intended use / host-workflow scope | Source and location | Class | State | Limits, counterevidence, or unresolved assumptions |
|---|---|---|---|---|---|
| E01 | OpenCode plugin API documents before/after tool and file-edited events; candidate native adapter for W1/W2 | S01, Events and .env protection example | DOC | DOCUMENTED | Example throws before a read; no process-crash, all-write coverage, or payload-fidelity experiment |
| E02 | OpenCode loads hooks sequentially in global-config, project-config, global-directory, project-directory order; identical npm name/version deduplicates but local/npm copies can both load | S01, Load order | DOC | DOCUMENTED | W3; not a guarantee of finding deduplication or cross-plugin precedence |
| E03 | OpenCode permissions use allow/ask/deny and last matching pattern wins | S02, Granular Rules | DOC | DOCUMENTED | Permission configuration is not identical to plugin-return semantics; W4 ask unresolved |
| E04 | agenthooks documents preserved raw payload plus typed projection, stacked first-conclusive handlers and an All combinator using deny > ask > allow > neutral | S03, Composing handlers and Semantics | DOC | DOCUMENTED | Adapter W1–W3; multi-product hook aggregation is not proved by in-library composition |
| E05 | agenthooks Policy declares FailOpen/FailClosed, Strict/Degrade, ask fallback, timeout, and continuation cap; nonblocking events cannot enforce FailClosed | S04, policy.go, Policy and enum definitions | SRC | SOURCE-INSPECTED | W4/W5; types/comments do not prove runtime enforcement after process death |
| E06 | agenthooks capability table gives Codex pre-tool deny but no ask; Kimi post-tool has no decision capabilities; OpenCode before-tool has deny/update-input | S05, capMatrix and Can | SRC | SOURCE-INSPECTED | Exact library table, not independently verified host facts; Pi has no row in this table |
| E07 | agenthooks README documents headless Kimi/Cursor prompt backfill as reporting-only and warns that installing both Copilot targets double-fires | S03, Semantics | DOC | DOCUMENTED | W3/W4; source comments' claimed real-host measurements are not replayed here |
| E08 | Chock documents policy manifests compiled into advisory, commit/CI, and native controls; grades require install witnesses | S06, What you get and Supported agents | DOC | DOCUMENTED | W1/W2; an install witness alone is not a runtime crash witness |
| E09 | Chock describes deterministic no-network enforcement, editable installed policies, and hash-pinned chock.lock; Kimi is Git/CI-only in its repo-scoped installer | S06, Security and Supported agents | DOC | DOCUMENTED | W5/W6; applies to Chock, not remote Jev; no proof project authors cannot weaken policy |
| E10 | Rulesync generates host-native configuration; support means at least one project/global/simulated mode and its table includes all five target hosts | S07, introduction and Supported Tools | DOC | DOCUMENTED | W1–W3: generation is not evaluation or semantic equivalence |
| E11 | Shaka documents Claude/Codex subprocess bridges, OpenCode plugin, Pi extension, and Bash/path safety patterns with block/confirm behavior | S08, Provider Support and Security | DOC | DOCUMENTED | W2/W3; no Kimi bridge claimed there; portable headless confirm unestablished |
| E12 | CAO plugins are documented as post-operation observers; packages use cao.plugins entry points and startup discovery | S09, opening, Installing and Events | DOC | DOCUMENTED | W1/W3 session observation; explicitly cannot veto CAO operations, much less an inner host tool |
| E13 | CAO skips misconfigured plugins and isolates MCP registration exceptions; pre-events/veto/hot reload are listed as future work | S09, Troubleshooting, MCP and Future improvements | DOC | DOCUMENTED | Failure applies to plugin startup/registration; event retry/delivery guarantees remain unknown |
| E14 | Probity public Action is write or command; RuleResult is pass or violation; Decision is allow or block; trace notes are not host-visible | S10, src/types.ts | SRC | SOURCE-INSPECTED | W1/W2; rich advisory findings would need another channel, not mere field renaming |
| E15 | Probity evaluate runs rules in declaration order, stops at first violation, blocks thrown/invalid rule results, and records per-rule duration | S11, evaluate/runRule/failed | SRC | SOURCE-INSPECTED | W2/W5; does not prove behavior when hook is killed, observer callbacks throw, or a rule never resolves |
| E16 | Probity registry statically names Claude Code, Codex, Copilot CLI and Copilot Chat; package is 1.10.1 and includes three vendor SDK dependencies | S12, registry.ts; S13, package.json | SRC | SOURCE-INSPECTED | Kimi/Pi/OpenCode absent from this registry, not claims about host capabilities; npm install not checked |
| E17 | Probity rules may be sync/async functions with optional AI, history, rawHistory and file-reader context | S14, Rule and RuleContext | SRC | SOURCE-INSPECTED | W1/W2/W6; executable code, not an isolation boundary; permission and egress audit pending |
| E18 | Probity issue #62 reports shell writes bypassing write-scoped rules; #75 reports array-shaped Codex transcript output loss | S15 and S16, issue descriptions | ISSUE | DOCUMENTED | Reports are counterexamples to blanket coverage; exact current reproduction/fix status not established |
| E19 | reviewdog accepts RDJSON/RDJSONL and documents local/code-host reporters, diff filtering, default fail-level none and selectable severity exit failure | S17, RDFormat, Reporters, Exit codes and Filter mode | DOC | DOCUMENTED | W1 and CI only; upstream checker supplies findings; external posting requires credentials |
| E20 | jev-guard documents pre-call risk decisions and post-result screening across Claude, Codex, Copilot, Gemini, Cursor, Pi, OpenCode and ACP | S18, CLI and Layout | DOC | DOCUMENTED | W1/W2: security judgment, not demonstrated independent code-quality rule packages |
| E21 | jev-guard documents default API-error fail-open, opt-in fail-closed and a 20-second total request budget; only Claude/OpenCode are claimed live-tested | S18, Configuration and Development | DOC | DOCUMENTED | W4/W5: Codex and others are described as payload tests; none run by this pass |
| E22 | jev-guard README says nothing is stored/logged and describes remote tool arguments/results; same README exposes session and scan-cache paths | S18, Security and Configuration | DOC | DOCUMENTED | Direct tension with E23; cannot rely on README as complete retention/data-flow statement |
| E23 | jev-guard session module writes bounded prompts, intents, calls and flags to owner-mode JSON; pruning runs only once directory has at least 200 files | S19, CAPS, remember, update and prune | SRC | SOURCE-INSPECTED | W6 privacy; contradicts unqualified E22. Read-modify-write concurrency and actual retention behavior unexecuted |
| E24 | pi-jev-auto-mode documents deterministic fast paths then Jev judgments, default uncertain deny, and blocking on unavailable/malformed/cancelled judgment | S20, What it does and How Jev decides | DOC | DOCUMENTED | W2/W5: no claim of universal code-quality review; allow fast paths intentionally skip Jev |
| E25 | pi-jev-auto-mode documents trusted-project-only overrides, owner-only API-key storage, bounded user messages and paths but no file contents/diffs sent | S20, Configuration, Usage and What leaves | DOC | DOCUMENTED | W6: strong egress minimization for permission judgment also prevents content-based review through that state alone |
| E26 | pi-jev-auto-mode reports calibration on twelve fixtures and a release procedure tied to publication | S20, Tuning and Releasing | DOC | DOCUMENTED | Neither calibration generalization nor release adherence independently checked; latency figures not adopted |
| E27 | jevwire documents Claude pre/post/stop hooks, default no ask, no permission allow, silent fail-open, and bounded time/feedback | S21, Where hooks sit and Guarantees | DOC | DOCUMENTED | W1–W5; package MCP setup for Codex is not a Codex lifecycle adapter; hook implementation not audited |
| E28 | jevwire DecisionModel contract carries typed questions/answers, model identity, usage, latency and cache-hit marker separately from deterministic gate thresholds | S22, EvaluateResult, DecisionModel and Gate | SRC | SOURCE-INSPECTED | Candidate backend seam; no source-range finding schema or promise of arbitrary rule packaging in this file |
| E29 | jevwire README advertises npm installation; direct registry latest endpoint returned HTTP 404 in this pass | S21 Install; S23 | DOC / META | DOCUMENTED | Distribution unresolved. Repository rename, registry visibility, or publication mismatch not diagnosed; not a runtime failure |
| E30 | agentseam documents normalized events, allow/deny/escalate/transform/warn/vouch, explicit degradation, and distinct none/unadapted states | S24, opening and Supported agents | DOC | DOCUMENTED | Adapter W1–W4; not real-host validation by this pass |
| E31 | agentseam grades process-death fail-open separately from configurable fail-closed, and caps enforcement claims by evidence basis | S24, What each agent can do and Verify | DOC | DOCUMENTED | W2/W5: native support and installed evidence still need local witness |
| E32 | agentseam describes Copilot CLI as packaging through the VS Code adapter, says OpenCode is researched/unbuilt, and provides distinct home-anchored Kimi configuration | S24, Supported agents and Contributing | DOC | DOCUMENTED | Copilot scope conflicts with E07's dedicated CLI codec claim; versions and dialects require controlled comparison |
| E33 | AgentHook is a v0.2 draft evidence grammar; README explicitly says no external runtime endorsement and permits incompatible 0.x changes | S25, opening and Status | DOC | DOCUMENTED | All hosts: evidence contract only; does not establish hook availability or host approval semantics |
| E34 | AgentHook proposes native plus normalized action/resource fields and draft publisher/trust manifests; reference implementation is distinct from the specification | S25, Action Governance and Documents | DOC | DOCUMENTED | W6 provenance pattern; compatibility and signing/trust guarantees untested |
| E35 | Repository metadata identifies MIT for OpenCode/agenthooks/Rulesync/Shaka/Probity/reviewdog and Apache-2.0 for Chock/CAO; the other candidate READMEs declare the licenses shown in their cards | S26 and S18/S20/S21/S24/S25 license sections | META | DOCUMENTED | License identifiers are not a full transitive license audit or approval to copy code |
| E36 | y0usaf/pi-jev describes a shadow/advisory mode and request-error fail-open | S27, README | DOC | DOCUMENTED | Discovery counterexample only; not run or source-audited |
| E37 | Jev Review describes an MCP quality-scoring tool; stanley-code describes callable bounded review workflows | S28, README; S29, repository overview | DOC | DOCUMENTED | Establishes callable-review baseline; mandatory invocation and parity unknown |
| U1 | Per-candidate unknowns listed in cards: exact real-host versions, crash/timeout outcome, headless ask, concurrent install/state safety, re-entry, latency/budgets and full egress | Relevant source keys E01–E37 define inspected scope; no execution evidence | DOC / SRC, as applicable | UNKNOWN | Applies to every card except explicitly documented/source-inspected subclaims. Resolve with P1–P5; unknown never means unsupported |
| I1 | An adapter declaring FailClosed cannot by itself guarantee the host blocks after the adapter process dies | E05, E21, E31 | SRC / DOC | INFERRED | Assumes the host owns the invocation boundary; falsify/qualify through process-kill experiments |
| I2 | Existing callable reviewers plus native adapters might satisfy the product with composition; insufficiency of the complete baseline is not proved | E04, E10, E20, E27, E30, E37 | DOC | INFERRED | W1–W6; depends on configurable rules and compatible feedback being practical |
| I3 | A reviewer can avoid adding explicit permission allow, preserving ordinary host approval flow while adding warnings/denials | E04, E27 | DOC | INFERRED | Product choice, not universal host theorem; inspect and test composed permissions |

### Contradictions and limits that change decisions

E22/E23 concern the **same pinned jev-guard revision**: the no-storage statement is too broad for source-visible session persistence. Source inspection establishes writes exist; it does not settle every path, retention bound, or egress claim. Record both and audit before interoperability.

E07/E32 differ on Copilot CLI identity/coverage. agenthooks documents dedicated codec behavior and CLI 1.0.81 measurements; agentseam's README includes dated evidence rows and describes a packaging identity routed through VS Code. These could be stale capability claims or intentionally narrower adapter scope. No experiment here resolves that. Do not adopt either matrix as a host truth table.

Chock's Kimi Git/CI-only install and agenthooks/agentseam Kimi hooks are **not** a contradiction: the former explains repository-only installation versus home configuration. Likewise Chock's install grade and agentseam's process-death grade measure different things. The product should decide whether it needs both witnesses.

The Probity architecture report names 1.10.0 while the cleanroom report and this pinned manifest name 1.10.1. This pass uses the pinned source, does not infer a behavior change from that number, and does not claim parity with an installed package. E29 remains an unresolved repository-versus-registry disagreement, not proof that jevwire is unusable.

## 4. Comparable candidate cards

Each numbered line follows the methodology's ten dimensions. U1 applies wherever an unknown is stated. All code/package adoption would require a separate decision; borrowing means independently implementing a pattern.

### OpenCode

1. **Identity:** agent host/plugin runtime; access-dated docs S01/S02, MIT metadata E35. Proposed use: native host adapter, not product-wide runtime.
2. **Lifecycle:** documented tool before/after, file and session events; throwing before a tool is the blocking example (E01).
3. **Contract:** host event objects and separate permission rules; allow/ask/deny precedence is last-match, not a review-finding aggregation contract (E03).
4. **Failure:** arbitrary plugin timeout/crash and unattended ask unknown; test P1/P3.
5. **Extension:** executable local/npm plugins, project/global configuration (E02).
6. **Composition:** sequential hooks, limited npm deduplication, possible local/npm duplicates (E02); verify repeated install and two tools.
7. **State:** session/file event presence does not establish review baselines, stale-result suppression, or re-entry control; unknown.
8. **Security:** executable plugins and configurable permissions imply a trust boundary; Jev egress remains separate (E01–E03, inference).
9. **Portability:** native OpenCode only; other hosts require adapters (E01).
10. **Operations:** no latency or conformance run; adapter/version cost unknown. **OPTIONAL INTEGRATION** for OpenCode sessions.

### agenthooks

1. **Identity:** Go compatibility library at S03–S05 commit, MIT (E35); proposed use: adapter contracts/install patterns.
2. **Lifecycle:** typed pre/post hooks and raw events; synthetic headless prompts explicitly cannot block (E04/E07).
3. **Contract:** neutral differs from allow; stacked first-conclusive differs from All restrictive merge (E04).
4. **Failure:** declared handler deadline, degradation, ask fallback and continuation cap; process-death enforcement unknown (E05/I1).
5. **Extension:** consumer Go handlers/middleware and installer manifest; rule isolation unknown (E04).
6. **Composition:** internal aggregation documented; Copilot dual installation can duplicate calls (E07).
7. **State:** reporting backfill is documented; review snapshot identity, concurrent result ordering and finding deduplication unknown.
8. **Security:** retaining raw payload increases fidelity and possible sensitive data exposure; default logging/redaction needs audit (E04, inference).
9. **Portability:** source table includes Codex/Claude/OpenCode/Kimi; no Pi row; ask differs by event (E06).
10. **Operations:** E2E command is documented, not run; Go subprocess/distribution cost unmeasured. **BORROW** contracts pending P1/P2 comparison with agentseam.

### Chock

1. **Identity:** policy compiler at S06 commit, Apache-2.0; PyPI lookup 0.8.0 is separate distribution metadata.
2. **Lifecycle:** native tool, Git/CI and ambient instruction surfaces; coverage grade is per policy/agent (E08).
3. **Contract:** manifests/eval cases and tiered enforcement grades; no general rich finding contract established.
4. **Failure:** documented deterministic local enforcement avoids a remote call; host crash/timeout semantics still need witness (E09/I1).
5. **Extension:** user-owned policy content and hash lock; not arbitrary Jev semantic judgment by configuration alone (E09).
6. **Composition:** generated files and install witnesses; coexistence with another installer unknown.
7. **State:** lock drift is documented; review baselines, cache and agent repair loops unknown.
8. **Security:** policy content is executable authority once installed; project weakening prevention unknown (E09).
9. **Portability:** Kimi installation is Git/CI-only; do not conflate with lack of native Kimi hooks (E09).
10. **Operations:** no catalog replay or real-host validation here; replacement cost unknown. **BORROW** install/coverage evidence; **REJECT** deterministic runner as remote semantic-review core.

### Rulesync

1. **Identity:** configuration compiler at S07 commit, MIT (E35); optional distribution edge.
2. **Lifecycle:** emits artifacts consumed later by hosts; not a review event loop (E10).
3. **Contract:** unified configuration to native forms; no shared runtime finding/decision algebra established.
4. **Failure:** remote Jev retries and ask belong to generated integrations, not the compiler; generation-error behavior unknown.
5. **Extension:** editable source configuration, import/export/generation and target options (E10).
6. **Composition:** multi-target output documented; preservation of another tool's settings/idempotence untested.
7. **State:** generated-file drift and review-state ownership need distinction; review cache/re-entry not applicable to compiler itself.
8. **Security:** generation can install permission/hook authority; inspect outputs under P2 rather than assuming harmless text (E10, inference).
9. **Portability:** all five hosts in target table, with project/global/simulation qualification (E10).
10. **Operations:** API/release guarantees and measured integration cost unknown. **OPTIONAL INTEGRATION** for configuration generation, not evaluation.

### Shaka

1. **Identity:** shared environment/bridges at S08 commit, MIT; reference for generated bridges.
2. **Lifecycle:** tool.before validator plus host-specific hooks (E11).
3. **Contract:** shared events with blocked/confirmation patterns; rich findings and cross-rule precedence unknown.
4. **Failure:** timeout/crash and headless confirmation unresolved; P3 before reuse.
5. **Extension:** generated bridges and editable YAML safety patterns (E11); executable hooks have independent trust concerns.
6. **Composition:** native/MCP/subprocess modes vary per host; collisions with existing generated environments unknown.
7. **State:** security logging is documented; review cache, baseline and re-entry semantics unknown.
8. **Security:** Bash/path controls documented; complete inference-wrapper egress and credentials audit absent.
9. **Portability:** Claude, Codex, OpenCode, Pi; Kimi not established by inspected support table (E11).
10. **Operations:** documented Docker E2E commands were not run; broad environment increases likely coupling cost (inference). **BORROW** bridge layout; **REJECT** whole environment as mandatory core.

### CAO

1. **Identity:** orchestration/control-plane plugins at S09 commit, Apache-2.0; optional fleet observation.
2. **Lifecycle:** post session/terminal/message operations, not tool preflight (E12).
3. **Contract:** observer event payloads carry session/terminal identity; no veto algebra (E12).
4. **Failure:** misconfiguration skip and MCP registration isolation documented; delivery/retry guarantees unknown (E13).
5. **Extension:** Python entry-point packages; independent package/config ownership and restart (E12).
6. **Composition:** plugins coexist at server startup; not a native host-hook combiner.
7. **State:** session IDs support correlation; review history/concurrency/re-entry unknown.
8. **Security:** message payloads may contain sensitive data; in-process plugins require trust. Complete egress review absent.
9. **Portability:** host launches and observation do not establish interception of each inner host (E12).
10. **Operations:** fleet integration and operational cost unmeasured. **OPTIONAL INTEGRATION** for observation; **REJECT** current plugins for W2 enforcement.

### Probity

1. **Identity:** TypeScript hard-policy engine, manifest 1.10.1 at S10–S14 commit, MIT; optional blocking wrapper.
2. **Lifecycle:** pre-action canonical writes/commands; shell-write issue limits blanket write coverage (E14/E18).
3. **Contract:** pass/violation to allow/block, first violation wins; trace notes not host-facing findings (E14/E15).
4. **Failure:** thrown/invalid rule result blocks; unresolved hangs/process death/headless ask is outside binary engine (E15).
5. **Extension:** executable sync/async rules and optional context capabilities (E17).
6. **Composition:** declaration order is explicit; host coexistence and install idempotence untested.
7. **State:** history access and timing traces exist; deduplication, caching and repair-loop semantics unknown.
8. **Security:** raw history plus AI context requires explicit egress decisions; SDK dependencies are a coupling signal, not proof of a particular request (E16/E17).
9. **Portability:** static registry includes Claude/Codex/Copilot variants; no Kimi/Pi/OpenCode entry at this commit (E16).
10. **Operations:** issue reports expose payload drift; no independent conformance run. **OPTIONAL INTEGRATION** for hard rules; **BORROW** action/adapter separation; **REJECT** binary result as full advisory contract.

### reviewdog

1. **Identity:** Go diagnostic/reporting CLI at S17 commit, MIT; optional output adapter.
2. **Lifecycle:** checker/CI invocation, not native agent interception (E19).
3. **Contract:** RDFormat diagnostics and reporter adapters; code supplies findings upstream (E19).
4. **Failure:** documented severity-based exit behavior; remote-reporting outage/retry details unknown. Native ask not applicable.
5. **Extension:** upstream tools and runner configuration; independent checkers can feed the CLI (E19).
6. **Composition:** diff filtering and multiple reporting modes; duplicate comments/collision behavior not exercised.
7. **State:** diff filtering is not product baseline or agent-loop deduplication; remaining state unknown.
8. **Security:** local reporter differs from credentialed code-host reporting; report content can cross that boundary (E19, inference).
9. **Portability:** authoring host irrelevant to diagnostic input; lifecycle adaptation absent from this intended boundary.
10. **Operations:** real report rendering and exit-code smoke check deferred to P5. **OPTIONAL INTEGRATION** for CI/reporting; **BORROW** finding/presentation separation.

### jev-guard

1. **Identity:** Jev-backed guard/adapters at S18/S19 commit; npm lookup 0.3.1; MIT (E20/E35).
2. **Lifecycle:** pre-call risk and post-result screening across documented hosts (E20).
3. **Contract:** risk/intent-derived allow/ask/deny; arbitrary quality-rule packages and rich edit findings unestablished.
4. **Failure:** default fail-open, configurable fail-closed, documented total budget; headless ask and process death unknown (E21).
5. **Extension:** thresholds, skip settings and adapters; general independent rule discovery unknown.
6. **Composition:** CLI/hook/plugin/ACP modes; coexistence and explicit allow interaction need P2/P3.
7. **State:** source writes session JSON; concurrent updates and stale results untested (E23).
8. **Security:** no-storage claim contradicted by source; remote tool/result disclosure incomplete until audited (E22/E23).
9. **Portability:** documentation distinguishes live-tested Claude/OpenCode from payload-tested Codex/etc.; Kimi not listed (E20/E21).
10. **Operations:** no timings or tests reproduced here. **OPTIONAL INTEGRATION** for existing security-guard users; **BORROW** failure configuration only after resolving data-flow questions.

### pi-jev-auto-mode

1. **Identity:** Pi-native policy extension at S20 commit; npm lookup 0.4.1; MIT.
2. **Lifecycle:** selected bash/write/edit calls, with intentional deterministic fast paths (E24).
3. **Contract:** condition probabilities, uncertainty band, policy severity/mode and allow/block; not a general edit-finding bus.
4. **Failure:** unavailable judgment blocks; default uncertainty deny, optional ask/allow documented (E24). Unattended ask unknown.
5. **Extension:** configurable policy notes, patterns and thresholds; general rule-package lifecycle unknown.
6. **Composition:** Pi package installation; another extension's precedence and repeated installation untested.
7. **State:** decision records documented; concurrent callbacks and repair loops unknown.
8. **Security:** trusted overrides and bounded content exclusion documented; source audit/egress capture still required (E25).
9. **Portability:** Pi only; sends paths rather than diff/file contents, so direct quality review needs more evidence (E25).
10. **Operations:** calibration/release practices documented, not independently reproduced (E26). **BORROW** trust/uncertainty design; **OPTIONAL INTEGRATION** for Pi permission gating.

### jevwire

1. **Identity:** backend library/MCP/Claude plugin at S21/S22 commit, MIT; npm availability unresolved (E29).
2. **Lifecycle:** pre/post/stop hooks and model-facing notes; callable MCP elsewhere is a separate boundary (E27).
3. **Contract:** hook no-allow policy differs from richer library decisions; typed backend measurements are source-visible (E27/E28).
4. **Failure:** hooks document silent fail-open and short deadline; library retry policy must not be conflated with hook deadline (E27).
5. **Extension:** replaceable DecisionModel and settings; independent quality-rule packaging unknown.
6. **Composition:** stdout discipline documented; interaction with other hooks and allow grants untested.
7. **State:** note budgets, suppression and bounded stop continuation documented; concurrent re-entry untested.
8. **Security:** no-allow design limits approval amplification; source sent to Jev and stored decision logs still need audit.
9. **Portability:** Claude lifecycle; MCP configuration for Codex does not confer Codex hooks (E27).
10. **Operations:** claimed calibration and tests are not this pass's runs; distribution mismatch blocks dependency selection. **BORROW** escalation-only and measurement contract; **REJECT** current package as cross-host lifecycle core.

### agentseam

1. **Identity:** Python compatibility layer at S24 commit; PyPI lookup 0.2.1; Apache-2.0.
2. **Lifecycle:** normalized host events with explicit unadapted versus missing capability (E30).
3. **Contract:** richer decision vocabulary with degradation; no established rich finding contract (E30).
4. **Failure:** best-effort/enforceable/enforced distinguish host crash behavior and evidence strength (E31); actual tested installation unknown.
5. **Extension:** consumer handlers, native install/uninstall and evidence probes documented.
6. **Composition:** installer claims removes its own entries; multi-tool preservation requires P2 rather than relying on claim.
7. **State:** evidence freshness documented; review baselines/cache/re-entry unknown.
8. **Security:** shape-only capture reduces payload retention; full installer and handler trust audit pending (S24).
9. **Portability:** Codex/Claude/Kimi documented; OpenCode unbuilt; Pi unestablished; Copilot scope conflicts with agenthooks (E32).
10. **Operations:** capture/reference/recorded/live distinctions are useful; no probe executed. **BORROW** evidence grading; compare adapter reuse with agenthooks before independent implementation.

### AgentHook

1. **Identity:** v0.2 draft runtime-evidence specification at S25 commit, Apache-2.0; adjacent contract pattern.
2. **Lifecycle:** describes lifecycle evidence; emission and blocking remain runtime responsibilities (E33/E34).
3. **Contract:** native plus normalized resource/action identity and proposed evidence envelopes (E34).
4. **Failure:** runtime timeout/retry/ask guarantees not applicable to a grammar; behavior of its implementation kit unknown.
5. **Extension:** proposals and schema conventions; independent runtime endorsement explicitly absent (E33).
6. **Composition:** transport/implementation neutrality is a documented intent, not proven cross-host interoperability.
7. **State:** retry/resume and requested-versus-executed evidence vocabulary; retention/concurrency implementation unspecified here.
8. **Security:** draft fingerprint/trust metadata is not itself a trust-enforcement mechanism (E34).
9. **Portability:** no host runtime conformance established; sample manifests are not adoption evidence (E33).
10. **Operations:** incompatible 0.x changes explicitly possible. **BORROW** evidence vocabulary; **REJECT** claiming this draft supplies host compatibility or adopting it as a fixed core wire standard now.

## 5. Capability and decision matrices

`D` = DOCUMENTED, `S` = SOURCE-INSPECTED, `I` = INFERRED, `U` = UNKNOWN, `N/A` = NOT APPLICABLE to the stated component. None means runtime-tested. Every cell includes its claim. The post-edit column asks whether the component offers a relevant channel, not whether semantic code-review quality is proved.

| Component | Post-edit/advisory channel | Pre-action block | Independent configuration | W3 composition | W4 headless / W5 remote failure |
|---|---|---|---|---|---|
| OpenCode plugins | D events E01; finding delivery U U1 | D example E01 | D executable plugins E02 | D sequence/dedupe E02 | U U1; permission ask D E03 |
| agenthooks | D post/raw E04; S host limits E06 | S capability table E06 | D handlers E04 | D internal merge and duplicate caveat E04/E07 | S fallback declarations E05; actual host result U U1 |
| Chock compiler | D ambient/CI E08 | D selected surfaces E08 | D manifests E09 | U coexistence U1 | D local no-network E09; remote Jev N/A E09 |
| Rulesync compiler | D generated surfaces E10 | D generated surfaces E10 | D unified config E10 | U coexistence U1 | Native outcome U U1; own remote review N/A E10 |
| Shaka bridges | D hooks E11; quality feedback U U1 | D patterns E11 | D YAML/hooks E11 | U coexistence U1 | U U1 |
| CAO observer plugins | D session observation E12 | N/A explicit observer boundary E12 | D package config E12 | D discovery E12; collisions U U1 | D startup isolation E13; Jev policy U U1 |
| Probity engine | S trace not host advisory E14 | S engine block E15 | S rule functions E17 | S first violation E15; other hooks U U1 | S throws block E15; hang/kill U U1 |
| reviewdog | D local/CI reporting E19 | N/A lifecycle E19 | D runners E19 | D filter/report modes E19; duplicates U U1 | D severity exit E19; transport failure U U1 |
| jev-guard | D result screening E20 | D risk gate E20 | D settings E21; arbitrary rules U U1 | U U1 | D remote policy E21; headless ask U U1 |
| pi-jev-auto-mode | D records E26; edit findings U U1 | D native gate E24 | D notes/thresholds E25 | U U1 | D uncertainty/error block E24; ask U U1 |
| jevwire hooks/library | D notes E27 | D escalation-only E27 | S model seam E28; rule packages U U1 | U U1 | D silent fail-open E27; composed host U U1 |
| agentseam | D warn/event E30 | D graded capability E31 | D handlers E30 | D managed installs S24/E30; collision U U1 | D host-failure distinction E31; actual U U1 |
| AgentHook draft | D evidence vocabulary E34 | N/A grammar E33 | D schemas E34 | U adoption U1/E33 | N/A grammar E33; implementation kit U U1 |

| Component | Codex | Claude Code | OpenCode | Kimi Code | Pi |
|---|---|---|---|---|---|
| agenthooks table | S E06 | S E06 | S E06 | S E06 | U/no row E06 |
| agentseam claims | D E32 | D E30/S24 | D unbuilt E32 | D home config E32 | U U1 |
| Shaka bridges | D E11 | D E11 | D E11 | U U1 | D E11 |
| Probity registry | S E16 | S E16 | S absent E16 | S absent E16 | S absent E16 |
| Rulesync targets | D generated E10 | D generated E10 | D generated E10 | D generated E10 | D generated E10 |
| Chock install | D native E08 | D native E08 | U U1 | D Git/CI E09 | U U1 |
| jev-guard claims | D payload-tested E21 | D project live claim E21 | D project live claim E21 | U U1 | D extension E20 |
| pi-jev-auto-mode | N/A Pi-only E24 | N/A E24 | N/A E24 | N/A E24 | D E24 |
| jevwire | D MCP only E27 | D lifecycle E27 | U U1 | U U1 | U U1 |

OpenCode itself is the native host (E01), while CAO, reviewdog and AgentHook operate at different boundaries (E12/E19/E33); assigning them equivalent host-adapter checkmarks would be misleading. A missing component adapter is not missing host capability.

| Component and intended use | Primary decision | Supporting claims and reason |
|---|---|---|
| OpenCode plugin seam for its sessions | OPTIONAL INTEGRATION | E01–E03: appropriate native boundary |
| agenthooks raw projection, policy and codec separation | BORROW | E04–E07: valuable contract; mandatory coupling not yet justified |
| Chock coverage/install witnesses | BORROW | E08/E09: make enforcement claims auditable |
| Chock deterministic runner as full remote-review engine | REJECT | E09: mismatched evaluation boundary |
| Rulesync configuration generation | OPTIONAL INTEGRATION | E10: distribution without owning evaluation |
| Shaka generated bridge pattern | BORROW | E11: useful native translations |
| Shaka complete environment as core | REJECT | E11/U1: wider ownership and unmeasured coupling |
| CAO fleet observation | OPTIONAL INTEGRATION | E12/E13: session events useful at edge |
| CAO current observer plugins as enforcement substrate | REJECT | E12: explicitly post-operation |
| Probity hard-policy wrapper | OPTIONAL INTEGRATION | E14–E18: usable narrow blocking contract |
| Probity action/adapter split | BORROW | E14/E16/E17: separates host parsing and user rules |
| Probity binary result as rich advisory core | REJECT | E14: loses host-facing advisory finding structure |
| reviewdog diagnostic reporting | OPTIONAL INTEGRATION | E19: already owns reporting boundary |
| reviewdog analyzer/finding/reporter separation | BORROW | E19: avoid coupling review to presentation |
| jev-guard installed security gate interoperability | OPTIONAL INTEGRATION | E20/E21; blocked on privacy audit E22/E23 before offering interoperability |
| pi-jev-auto-mode trusted overrides and uncertain state | BORROW | E24–E26: concrete authority and uncertainty choices |
| pi-jev-auto-mode Pi permission gate | OPTIONAL INTEGRATION | E24/E25: narrower use can be sufficient already |
| jevwire escalation-only hooks and backend measurements | BORROW | E27/E28: distinguish review from permission grant |
| jevwire as cross-host lifecycle core now | REJECT | E27/E29: Claude lifecycle and unresolved distribution |
| agentseam evidence/capability grading | BORROW | E30–E32: separates adaptation, capability and witness |
| AgentHook action/evidence vocabulary | BORROW | E33/E34: useful provenance distinctions |
| AgentHook draft as settled compatibility standard | REJECT | E33: unendorsed changing draft |

## 6. Dependency gates

There is **no DEPEND ON recommendation**, conditional or otherwise, in this pass. Therefore no gate is silently passed. This is not a recommendation to make the implementation dependency-free: the API/SDK and ordinary implementation dependencies are outside the comparative adoption decision here.

The following is a *future gate checklist*, not dependency approval. Apply separately to agenthooks and agentseam after P1/P2, and to any proposed reporting/library dependency rather than converting OPTIONAL INTEGRATION automatically into DEPEND ON.

| Gate | Present evidence/status | Resolving work before any dependency recommendation |
|---|---|---|
| License compatibility | Identifiers known E35; transitive compatibility unresolved | Inspect pinned license files and distribution dependency licenses against the product's chosen distribution terms |
| API/version guarantees | Pinned source exists; guarantees unresolved; draft AgentHook explicitly unstable E33 | Inspect tags, changelog and public API policy; test adapter wrapper against two releases |
| Required real-host workflows | No pass-2 runtime evidence | P1/P3 on pinned Codex and one second host, then Kimi/Pi before advertising them |
| Trust, egress, credentials, supply chain | Partial source/docs only; concrete E22/E23 contradiction | P4 plus install/build dependency audit, with captured outbound payload and local state |
| Timeout/crash/degradation | E05/E21/E31 disagree in scope, not measured | Kill and hang the hook separately from simulating remote failure; verify resulting file state |
| Maintenance and compatibility ownership | Current repositories accessible; no ownership commitment assessed | Identify update owner, release cadence, drift notification and supported host-version window |
| Integration/ongoing cost | Unknown | Timebox a Go/Python wrapper and native TypeScript control; record packaging, latency and upgrade effort |
| Exit cost and fallback | Conceptual native-adapter fallback, unbuilt | Replace one library adapter behind the same fixtures; measure effort and preserved behavior |

## 7. Synthesis, sufficiency, and disconfirmation

Several independent sources converge on boundaries rather than a single stack: Probity and agenthooks separate action handling from host codecs (E04/E14/E16); OpenCode and jevwire distinguish notification from preventing an action (E01/E27); reviewdog and jevwire separate analysis from presentation or deterministic policy (E19/E28). Chock and agentseam converge on evidence grades, but they are related projects and do **not** count as independent corroboration (E08/E31).

The consequential conflicts are policy choices. A Jev outage can preserve workflow continuity with fail-open, as jev-guard/jevwire document, or block undecidable operations, as pi-jev-auto-mode documents (E21/E24/E27). First-conclusive evaluation can be cheaper but omit later findings; an all-rules merge gives broader feedback at additional latency/cost (E04/E15). Permission allow is stronger than having no objection; jevwire's exclusion of allow suggests the product may not need authority to bypass ordinary host approval at all (I3). Sending only paths reduces exposure but cannot support content-dependent quality criteria without another source of evidence (E25).

| Baseline | Sufficient for | Why broader sufficiency is not established | Current verdict |
|---|---|---|---|
| Existing jev-guard package | Documented cross-host risk gating and result screening | Independent quality rules, W3, exact headless behavior, data retention and Codex live behavior unresolved E20–E23 | Credible spike; neither proven sufficient nor disproved |
| Existing pi-jev-auto-mode / jevwire | Documented Pi fail-closed permission gate / Claude advisory escalation | Different single-host scope and judgment inputs; arbitrary quality-rule packaging unestablished E24–E29 | Could satisfy narrowed needs now, after ordinary install validation |
| Jev Rule + agenthooks or agentseam | Adapter plumbing and declared decisions | Findings delivery, release ownership, Pi coverage and actual W1–W6 conformance unknown E04–E07/E30–E32 | Strongest composition baseline to test before building adapters |
| Rulesync + native hook + callable reviewer + reviewdog | Distribution, callable quality check, diagnostic reporting | Still needs lifecycle/state/failure glue; cost of that glue unmeasured E10/E19/E37 | May make a new framework unnecessary |
| Probity + custom Jev rule | Hard pre-action rules with custom evaluation | Public result cannot alone transport rich host-facing advisory findings; shell writes complicate coverage E14–E18 | Insufficient as the sole contract for W1; useful W2 edge |
| CAO observer alone | Fleet observation | Explicitly cannot veto even its own completed operations E12 | Disproved for W2 by documented boundary |

**Recommendation:** keep a provisional product-owned review/decision boundary, but postpone a broad new adapter framework until the adapter-composition experiment returns. Borrow per-event capabilities, explicit degradation, and evidence records; preserve optional reporting/orchestration integration. Do not convert desired confidence/source-range fields into requirements merely because earlier research listed them.

**Strongest case against this recommendation:** the product may only need several plain-language checks and warnings. An existing Jev plugin plus a few native hooks could meet that need more simply, and a new canonical contract could create its own compatibility burden. Rich findings, independent rule packaging and universal blocking may be unnecessary scope. E20/E27/E37 support that alternative; no measured implementation comparison defeats it yet. If P1/P2 demonstrate existing composition across W1–W6 with bounded glue and a sustainable upgrade owner, recommend depending on the specific adapter component after gates, and reduce the proposed core to configuration/policy glue. If quality-feedback needs can be met through existing MCP/CLI conventions without mandatory interception, narrow the product accordingly through an explicit specification decision.

## 8. Traceable specification/prototype handoff

The implications below are candidates for decisions, not requirements. P1–P5 are proposed experiments, **not executed checks**. Each acceptance check must retain OS/runtime, host/package versions, fixtures/configuration, exact commands, expected and observed results, exit statuses and output paths before any claim becomes RUNTIME-TESTED.

| ID | Advisory implication and evidence / counterevidence | Workflow and hosts | Uncertainty and consequence if wrong | Decision/check and disposition |
|---|---|---|---|---|
| H1 | Preserve action evidence separately from finding and operational decision; E04/E14/E19/E28; counter: binary rules may suffice E24 | W1/W2, all five | Extra schema could create unnecessary product scope | Decide minimum finding fields and channels using two actual user rules; **take to specification** |
| H2 | Advertise capabilities per host, event, install scope and evidence level; E06/E08/E31/E32; counter: two grade vocabularies differ | W2/W4, all five | Overstated blocking could allow an unwanted action | P1: one native edit, shell write, multi-file patch, cancellation, denied operation and headless ask on pinned hosts; compare artifact/file outcome, not stdout alone; **take to both** |
| H3 | Compare existing adapter libraries before implementing a broad adapter framework; E04/E30/I2; counter: missing Pi/OpenCode coverage E06/E32 | W1–W5, Codex + second host first | Polyglot packaging cost may outweigh saved codecs | P1/P2: same Jev stub and rule through agenthooks, agentseam and minimal native control; record glue size, install and upgrade effort; **take to prototype** |
| H4 | Distinguish no objection from explicit permission allow; E04/E27/I3; counter: users may want auto-approval E24 | W2/W3/W4, Codex/Claude/OpenCode | Wrong merge can weaken another policy tool or overblock | Decide approval authority; P2 compose allow/deny/neutral in both registration orders and with native permissions; **take to both** |
| H5 | Separate review failure from negative finding and select fallback per rule/cadence; E05/E21/E24/E27; counter: no universal fail policy | W4/W5, all five | Outage could freeze work or silently remove expected blocking | P3 inject timeout, kill, malformed JSON, 429/5xx and missing key separately; bound completion; verify actual operation and visible status; **take to both** |
| H6 | Make config weakening, outbound evidence and local retention explicit; E09/E22/E23/E25; counter: path-only evidence cannot review content | W1/W6, all five | Privacy promise could be false or rules could not evaluate | P4 capture request bodies with fake transport; inspect files after session, test untrusted override and sensitive paths; decide authority/retention; **take to both** |
| H7 | Associate findings with snapshot/session/rule identity and bound repeated feedback; E23/E27; counter: no cross-host concurrency proof | W1/W3/W6, all five | Old findings or repeated reviews can consume budget and produce repair loops | P2 run concurrent edits, duplicate event delivery, replay and repair edit; expect no stale result applied to new snapshot and declared duplicate policy; **take to prototype**, then specify based on result |
| H8 | Treat reporting as optional adapter output; E19; counter: desired confidence/evidence may not fit RDFormat | W1/CI, host-neutral output | Premature schema coupling loses evidence | P5 round-trip two representative findings through local reviewdog, check locations/severity/extra evidence and failure level; no external posting; **take to prototype** |
| H9 | Reuse evidence vocabulary without claiming draft-standard conformance; E33/E34; counter: moving 0.x contract | W6, all five | Premature standard adoption adds churn | Decide minimal provenance fields only if H2/H7 need them; **defer** standard adoption until stable version and independent runtime adoption |
| H10 | Keep fleet orchestration outside native enforcement ownership; E12/E13; counter: future veto remains roadmap | W2/W6, any CAO-managed host | A post-event observer cannot prevent inner tool execution | Record boundary in later spec if fleet integration enters scope; **defer** implementation until a user workflow needs CAO |

Specification questions still open: whether advisory feedback must be model-visible, whether every edit or only stable diffs must be reviewed, how many rules/findings may be evaluated per event, which party can grant permission, whether a remote outage may block ordinary edits, and which two hosts define initial acceptance. Those choices materially affect the existing-solution baseline and should precede universal portability promises.

## 9. Limitations, stopping condition, and primary-source index

The research stopped at three discovery rounds plus primary follow-up, with unresolved alternatives still visible. There was no installation, live Jev request, host execution, benchmark, package test run, full security audit, global code search, or maintenance census. No stars or vendor latency figures are treated as reliability evidence. Most host-compatibility claims come from integration authors, not independently inspected host source; only OpenCode's native docs were freshly examined here. This deliberately limits conclusions about Codex/Claude/Kimi/Pi behavior. Older host research remains context, not promoted into new verification.

Registry retrieval is a distribution observation, not runtime testing. For jevwire the observed 404 conflicts with installation documentation and remains unresolved. Source access can outlive current default branches because the links below pin commits; access-dated official docs and issues remain mutable. Read-only GitHub API metadata established commits and license identifiers. No local raw-response archive was written because this task permits exactly one new report; immutable source URLs preserve replayability of code inspection, while mutable-page/registry observations require re-fetching and may change.

Primary source keys (all accessed 2026-09-19):

| Key | Source, revision and inspected location |
|---|---|
| S01 | [OpenCode plugins](https://opencode.ai/docs/plugins/), access-dated official docs; Events, Load order, examples |
| S02 | [OpenCode permissions](https://opencode.ai/docs/permissions/), access-dated official docs; permission values and pattern precedence |
| S03 | [agenthooks README](https://github.com/speakeasy-api/agenthooks/blob/47aaf2a0393502aaaa798d97f074eae364643518/README.md) |
| S04 | [agenthooks policy.go](https://github.com/speakeasy-api/agenthooks/blob/47aaf2a0393502aaaa798d97f074eae364643518/policy.go) |
| S05 | [agenthooks capability.go](https://github.com/speakeasy-api/agenthooks/blob/47aaf2a0393502aaaa798d97f074eae364643518/capability.go) |
| S06 | [Chock README](https://github.com/open-coder-ai/chock/blob/887c2ab97c8f696f8a840a8e0011f28d979d52c1/README.md) |
| S07 | [Rulesync README](https://github.com/dyoshikawa/rulesync/blob/a78206f39e52b8ed0a1609f1e43cd2e3ff5005ce/README.md) |
| S08 | [Shaka README](https://github.com/jgmontoya/shaka/blob/ac8760023b280d91217f3c6abd88aa944dd90598/README.md) |
| S09 | [CAO plugins](https://github.com/awslabs/cli-agent-orchestrator/blob/9233416d22e52027a4a129c11a6a3aa1b2bc7cac/docs/plugins.md) |
| S10 | [Probity types](https://github.com/nizos/probity/blob/fabb04968f259416645f91f3c62bc12147e714b5/src/types.ts) |
| S11 | [Probity engine](https://github.com/nizos/probity/blob/fabb04968f259416645f91f3c62bc12147e714b5/src/engine.ts) |
| S12 | [Probity registry](https://github.com/nizos/probity/blob/fabb04968f259416645f91f3c62bc12147e714b5/src/registry.ts) |
| S13 | [Probity package manifest](https://github.com/nizos/probity/blob/fabb04968f259416645f91f3c62bc12147e714b5/package.json) |
| S14 | [Probity rule contract](https://github.com/nizos/probity/blob/fabb04968f259416645f91f3c62bc12147e714b5/src/rules/contract.ts) |
| S15 | [Probity issue #62](https://github.com/nizos/probity/issues/62), access-dated report, shell-mediated writes |
| S16 | [Probity issue #75](https://github.com/nizos/probity/issues/75), access-dated report, Codex transcript shape |
| S17 | [reviewdog README](https://github.com/reviewdog/reviewdog/blob/a47fcd34b9ccd8f4d6f17929775f52814230a5a6/README.md) |
| S18 | [jev-guard README](https://github.com/leepokai/jev-guard/blob/94996ea80b6b308327ac2077706a29ce6abd3ba0/README.md) |
| S19 | [jev-guard session source](https://github.com/leepokai/jev-guard/blob/94996ea80b6b308327ac2077706a29ce6abd3ba0/src/session.js) |
| S20 | [pi-jev-auto-mode README](https://github.com/jomatsu/pi-jev-auto-mode/blob/06a56043088124ed650471a8589fddd8139708f4/README.md) |
| S21 | [jevwire README](https://github.com/Brainwires/jevwire/blob/fabe7e79252b415278cd4b42355e63106fb5af80/README.md) |
| S22 | [jevwire decision types](https://github.com/Brainwires/jevwire/blob/fabe7e79252b415278cd4b42355e63106fb5af80/src/decision/types.ts) |
| S23 | [jevwire npm latest endpoint](https://registry.npmjs.org/jevwire/latest), accessed 2026-09-19, HTTP 404; [jev-guard endpoint](https://registry.npmjs.org/jev-guard/latest), 0.3.1; [pi-jev-auto-mode endpoint](https://registry.npmjs.org/pi-jev-auto-mode/latest), 0.4.1; [agentseam PyPI](https://pypi.org/pypi/agentseam/json), 0.2.1; [Chock PyPI](https://pypi.org/pypi/chock/json), 0.8.0 |
| S24 | [agentseam README](https://github.com/open-coder-ai/agentseam/blob/692d5ecffc22275c120cdbe76f302b0d8c31b4fe/README.md) |
| S25 | [AgentHook README](https://github.com/agentic-thinking/agenthook/blob/4945e578245e14b4ebe2fb67eefca68771e256b4/README.md) |
| S26 | GitHub repository metadata, accessed 2026-09-19: [OpenCode](https://api.github.com/repos/anomalyco/opencode), [agenthooks](https://api.github.com/repos/speakeasy-api/agenthooks), [Chock](https://api.github.com/repos/open-coder-ai/chock), [Rulesync](https://api.github.com/repos/dyoshikawa/rulesync), [Shaka](https://api.github.com/repos/jgmontoya/shaka), [CAO](https://api.github.com/repos/awslabs/cli-agent-orchestrator), [Probity](https://api.github.com/repos/nizos/probity), [reviewdog](https://api.github.com/repos/reviewdog/reviewdog); license identifiers and default branches only |
| S27 | [y0usaf/pi-jev README](https://github.com/y0usaf/pi-jev), access-dated discovery review; resolved HEAD b3478fd4ca1ac8ffcb703f6dc8d6069b555f531e, runtime untested |
| S28 | [Jev Review](https://github.com/NiazMorshed2007/jev-review), access-dated README discovery review |
| S29 | [stanley-code](https://github.com/devagrawal09/stanley-code), access-dated repository overview reached through jev-code redirect |
