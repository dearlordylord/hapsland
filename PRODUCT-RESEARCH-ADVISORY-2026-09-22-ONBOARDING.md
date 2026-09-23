# Agent onboarding and reversible installation

**Date:** 2026-09-22. **Status:** advisory research, not product requirements.
**Canonical path for this bounded pass:** this file. No host was installed or modified; no paid request, credential access, or runtime conformance experiment was performed.

## 1. Research brief and change log

**Question:** How should the product reach a useful first review conveniently, without confusing installation with activation or damaging an agent's existing configuration?

The brief was written before candidate selection in `/tmp/onboarding-research-brief.md`. During handoff the user settled two decisions: Codex first with a design extensible to other hosts, and entering the API key once into secure local storage. These refine scope; they do not imply Abide's plaintext storage is acceptable. Assumptions: the product has a Codex-first MVP, uses Jev, and defaults to advisory post-edit review. Required onboarding capabilities are explicit host/scope selection, credential and source-egress boundaries, ownership of configuration edits, deterministic headless operation, and credible activation evidence. Host detection, offline diagnostics, and a guided first finding are desirable. Claude Code, Codex CLI, OpenCode, Kimi Code, and Pi are the target host vocabulary; this pass does not establish support for them all.

Representative workflows: install and run advisory review; explicitly opt into any blocking capability; coexist with another installed reviewer; configure and verify headlessly; distinguish unavailable Jev from a clean result; update or uninstall without deleting another tool's configuration. A normal user's first session, rather than a synthetic handler invocation alone, is the target experience.

**Existing-solution baseline:** use Abide for integrated review, or reuse an adapter/configuration distributor instead of writing an installer. Evidence overturning independent implementation would be an existing component satisfying the required ownership, activation, lifetime, and egress contracts with acceptable coupling and real-host evidence.

Discovery used existing [Abide research](RESEARCH-ABIDE-2026-09-19.md), [competitors research](RESEARCH-AGENT-RULE-TOOLS-2026-09-19.md), and [comparative pass 2](PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md), then official GitHub pages and current source checkouts. Searches within those sources: `install`, `init`, `login`, `doctor`, `uninstall`, `scope`, `ownership`, `preserveUnownedHooks`, `check`, and `dry-run`. Inclusion requires an agent-install boundary or a distinct configuration-ownership design. Budget: one integrated review product and two different infrastructure classes. Stop after those classes are inspected; this is deliberately not ecosystem saturation.

**Change log:** this supplements the older reports only for onboarding. It inspects current Abide `f268382`, whereas the original baseline inspected `ec3352e`; no conclusion here claims those commits are equivalent. It identifies stronger credential-file handling, but still weak hook-file ownership and activation evidence. Older broader product, lifetime, and review-quality conclusions remain outside this pass. Forward links from the original Abide report and comparative pass 2 now point to this scoped update. The [onboarding specification draft](./PRODUCT-ONBOARDING-SPEC-DRAFT.md) records the separate product decisions.

## 2. Candidate inventory

| Candidate / class | Inclusion and intended use | Version inspected |
| --- | --- | --- |
| Abide / integrated rule-review engine with host adapters | Closest existing-solution baseline; inspect complete login/init/first-value journey | CLI 0.0.5, `f2683828965ced03da07abae811e78af0383040c` |
| agentseam / host-adapter compatibility layer | Installation identity and evidence-aware diagnostics | 0.3.2, `71d7ced4d2d7d336d5b1231fd1436d0dd0f030a6` |
| Rulesync / configuration compiler-distributor | Declarative generation, ownership lock, dry-run/drift workflow | 17.0.0, `d3cf1caa8663a6979b7d8a1299859c74db878161` |

Excluded serious candidates from prior discovery: Chock (policy compiler; its install-witness lesson overlaps the adapter class here), Ruler/AgentSync/ai-rulez (additional distributors beyond this bounded budget), Probity (review-engine comparison already covered; Abide is the requested integrated baseline), and reviewdog/pre-commit (reporting/commit boundaries do not install agent review). These are scope exclusions, not negative quality assessments. Native host documentation constrains later implementation; this pass does not re-audit each host's trust semantics.

## 3. Evidence ledger

Every source link below pins the inspected commit unless stated otherwise. `S` means **SRC / SOURCE-INSPECTED**, `D` means **DOC / DOCUMENTED**, `M` means **META / SOURCE-INSPECTED** for manifest/license identity only, and `I` means **SRC / INFERRED**. These abbreviations keep source class separate from verification state. There are **no RUNTIME-TESTED claims** in this report.

| ID | Exact proposition, component and workflow | Evidence and location | Limits / counterevidence |
| --- | --- | --- | --- |
| A01 | Abide identifies as MIT, CLI 0.0.5, Node >=22 | M: [package manifest][a-package] | Checkout metadata, not proof this exact source is the registry artifact |
| A02 | `init` requires discoverable credentials and instruction sources, executes a SessionStart child-process self-test, then installs selected hosts; no host names means all detected hosts | S: [init command][a-init], `runInit`, `chooseHosts`, `selfTest` | Self-test checks child exit status only; [hook runner][a-runner] catches exceptions and exits zero. It cannot establish host acceptance, credential validity, or live review |
| A03 | Detection uses configuration-directory existence or `which`; global locations are default, `--project` changes targets; Codex output tells users to accept four entries with `/hooks` | S: [host selection][a-hosts], `hostPresent`, `installTarget`, `installHost` | Detection is not version/capability verification. Codex instruction is Abide's implementation claim, not independent host validation |
| A04 | `login` asks key type and user/project storage; keys are not CLI flags; on non-TTY both menus select their first option, TypeSafe and user scope | S: [login command][a-login], `ask`, `choosePlace`, `runLogin` | Silent headless defaults are deterministic but can choose an unintended credential destination. Project key ignore warning is after saving |
| A05 | Credential resolution precedence is environment, repo `.env.local`, repo `.env`, user file; only named keys are parsed. Saving uses mode 0600 and refuses non-regular or unreadable existing files | S: [credentials][a-credentials], `findCredentials`, `saveKey` | Inspection is not a complete race/security audit. No credential validity check is established by this path |
| A06 | Hook reinstall removes entries whose command contains `abide-hook.js`, preserves other groups/fields structurally, appends new entries; uninstall uses the same ownership test | S: [settings][a-settings], `isOurs`, `withoutOurs`, `installHooks`, `uninstallHooks` | Substring ownership can match an unrelated command. Read failures all return `{}`; writes rewrite JSON directly, without an atomic replacement or concurrent-edit guard in this file |
| A07 | OpenCode install writes its named shim unconditionally; uninstall removes it only if marker text is present | S: [plugin installer][a-plugin], `installOpencodePlugin`, `uninstallOpencodePlugin` | Existing unrelated same-name file can be overwritten on install. Marker alone does not establish exact content ownership |
| A08 | Installed hooks/shims refer to absolute paths in the executing package; source says plugin upgrades need no reinstall | S: [package paths][a-paths], [settings][a-settings], [plugin installer][a-plugin] | I: moving/removing that package path can break invocation. A cached `npx` path's durability was not tested; no general update guarantee follows |
| A09 | SessionStart requests compilation for stale/missing rubrics and reports missing credentials or invalid rubric; uninstall retains rubric files | S: [SessionStart][a-start], [uninstall][a-uninstall] | A compilation request is not proof the host obeys it. With no sources, there may be no checks; first value is conditional |
| A10 | Public command dispatcher includes login/init/uninstall and review/report commands, but no dedicated doctor/update command | S: [dispatcher][a-bin] | Narrow statement about this dispatcher, not proof diagnostics are absent elsewhere. Hook failures/timeouts are emitted as silent output by [runner][a-runner]; a quiet session is ambiguous |
| B01 | agentseam identifies as Apache-2.0, version 0.3.2 | M: [manifest][b-package] | No dependency license review performed |
| B02 | Installer uses owner-specific metadata / bounded TOML blocks; strips owned entries, merges generated entries; refuses unreadable/non-object/invalid JSON instead of treating it as missing | S: [config helpers][b-config], [installer][b-install] | Direct writes are not a transaction. Marker preservation does not demonstrate all live hosts accept added metadata |
| B03 | `installed()` can compare expected hook content when events and command are supplied; ordinary mode only looks for ownership witness | S: [installation identity][b-identity] | Presence or expected content still does not establish host trust or invocation |
| B04 | `doctor` reports wired presence and capability-evidence staleness offline; it invokes the presence-only installed check | S: [report CLI][b-report], `_cmd_doctor` | Neither a live backend probe nor proof that the installed handler matches current expected content |
| B05 | Unsupported event wiring raises an explicit error; repository install/uninstall and capability grading are public operations | S: [config helpers][b-config], `check_wireable`; D: [README][b-readme] | Host-version support and failure enforcement remain unexecuted in this pass |
| C01 | Rulesync identifies as MIT, version 17.0.0; distributes configuration rather than doing Jev review | M: [manifest][c-package]; D: [README][c-readme] | A generation target does not establish live lifecycle equivalence |
| C02 | Hook preservation is opt-in and defaults false; documentation says default generation replaces destination hook lists; preservation covers Claude Code/Codex/Cursor, excluding Claude plugin bundles | S: [configuration][c-config], default value; D: [file-format documentation][c-formats], Hooks | Do not borrow the destructive default. Coverage outside these preservation targets is not established |
| C03 | Ownership sidecar records event/matcher/identity, serializes stably, and treats unreadable/unsupported lock content as empty ownership, preserving existing handlers in preservation mode | S: [ownership lock][c-lock] | An empty owned set may leave stale generated entries; exact concurrent-write/recovery behavior is untested |
| C04 | `generate --dry-run` previews, `--check` returns 1 for out-of-date files; targets/features are selectable | D: [dry-run guide][c-dry], [README][c-readme] | Documentation establishes advertised interface, not runtime behavior or host activation |

## 4. Comparable candidate cards

### Abide

1. **Identity/role:** integrated review product, MIT, A01; baseline alternative to building. Proposed use: borrow journey, not depend on its runtime.
2. **Lifecycle:** four named hooks and OpenCode shim; post-edit checks and completion review surfaces (A03/A06/A07). This pass does not validate enforcement against a live action.
3. **Contract:** host settings groups and command/timeouts; SessionStart contextual compilation request; no installation receipt proving a review completed (A02/A06/A09).
4. **Failure:** self-test can exit zero after internal failure; hook exceptions/timeouts are silent (A02/A10). Missing key is surfaced at initialization/start, but invalid key and unavailable remote outcome are untested. Headless login chooses first menu options (A04).
5. **Extension:** repository instructions compile into rubric; sources are required before installation (A02/A09). Runtime installer owns hooks by substring (A06).
6. **Composition:** structurally preserves unrelated hooks but risks false ownership and overwrite on read failure; OpenCode collision handling is weaker (A06/A07). Reinstall reconstructs matching entries, not a transactional migration.
7. **State:** freshness-driven rubric compilation and retained rubric on uninstall (A09); cross-scope duplicate delivery, concurrent installs and update rollback UNKNOWN.
8. **Security/privacy:** named-key parsing, owner-only credentials, no secret CLI flag (A04/A05). Presence of a key is neither informed source-egress consent nor authenticated backend success. Full source-egress audit is outside this pass.
9. **Portability:** three host targets and host-specific aftermath (A03/A07); detection does not verify installed versions. Kimi/Pi installer behavior not supplied by this inspected host module.
10. **Operations:** tangible local checks and user next steps; no dedicated doctor/update verb, absolute runtime paths and untested package-cache lifecycle (A08/A10). Installation speed, maintenance trend, and end-to-end reliability not measured.

### agentseam

1. **Identity/role:** Apache-2.0 Python compatibility layer, B01; borrow ownership and evidence distinction.
2. **Lifecycle:** requested events mapped per adapter; unsupported mappings rejected (B05); no standalone review.
3. **Contract:** owner-specific installed fragment and expected-content checks (B02/B03); review finding algebra outside onboarding scope.
4. **Failure:** invalid/unreadable JSON is an explicit error (B02); live host crash/backend behavior UNKNOWN here.
5. **Extension:** caller supplies handler command and owner; executable trust belongs to the caller (B02/B05).
6. **Composition:** owner-targeted strip/merge and removal (B02). No transaction or full cross-tool conformance proved.
7. **State:** witness presence versus expected content distinguished (B03); concurrent mutation/recovery UNKNOWN.
8. **Security/privacy:** configuration preservation is source-inspected; it is not a Jev credential or source-egress authority (B02/B05).
9. **Portability:** capability matrix exists (B05); breadth is not inherited by the product and untested hosts remain UNKNOWN.
10. **Operations:** offline doctor reports evidence staleness; it does not actually invoke handler/backend (B04). Python/runtime coupling and ongoing conformance cost argue against premature dependency.

### Rulesync

1. **Identity/role:** MIT TypeScript configuration distributor, C01; borrow preview/drift and ownership lock.
2. **Lifecycle:** generates configuration, not an executing reviewer (C01/C04).
3. **Contract:** selective target/features and owned hook references (C03/C04); no review outcomes.
4. **Failure:** unknown lock version degrades to no assumed ownership (C03); live host/backend failure NOT APPLICABLE to generator.
5. **Extension:** common source configuration compiled into target artifacts (C01/C04); trust remains in supplied source and generated commands.
6. **Composition:** opt-in preservation is useful, default wholesale hook replacement is unacceptable for this product's coexistence requirement (C02).
7. **State:** versioned sidecar and stable identity serialization (C03); races and recovery UNKNOWN.
8. **Security/privacy:** ownership evidence does not configure Jev credentials or grant source-egress consent (C01/C03).
9. **Portability:** preservation has a narrower target set than general generation (C02). A broad feature matrix is insufficient for one-click activation.
10. **Operations:** dry-run and check are documented (C04), but doctor, uninstall semantics for our runtime, first review, and upgrade activation remain product responsibilities.

## 5. Capability and decision matrices

Cells retain source/verification labels from the ledger. `U` = applicable but UNKNOWN; `N/A` = outside candidate boundary.

| Capability | Abide | agentseam | Rulesync |
| --- | --- | --- | --- |
| Credentials and first review setup | S A02/A04/A05/A09 | N/A B05 | N/A C01 |
| Explicit host/scope selection | S A03, automatic all-host default | S B02/B05, adapter-dependent path | D C04, targets/features |
| Safe third-party composition | S mixed/weak ownership A06/A07 | S owner metadata/refusal B02 | S opt-in only C02/C03 |
| Idempotent owned config identity | S substring reconstruction A06 | S expected-content option B03 | S stable ownership lock C03 |
| Offline diagnostics | S limited init self-test A02 | S offline doctor B04 | D generated drift check C04 |
| Live host activation | U A02/A03 | U B03/B04 | U C04 |
| Uninstall and updates | S removal A06/A07/A09; update durability U A08 | S owned removal B02; update transaction U | U for product runtime; generated ownership S C03 |

| Component and intended use | Classification | Reason |
| --- | --- | --- |
| Abide's login → initialize → host-specific next action → first finding journey | **BORROW** | Concrete, short path to value (A02–A05/A09) |
| Abide auto-all-host/global default, substring ownership and absolute transient package paths as product defaults | **REJECT** | Scope surprise, collisions and runtime durability uncertainty (A03/A06–A08) |
| agentseam ownership/refusal and evidence-aware diagnosis patterns | **BORROW** | Keeps configuration presence separate from runtime evidence (B02–B04) |
| Rulesync dry-run/check and versioned sidecar ownership concepts | **BORROW** | Preview, drift detection, conservative unknown ownership (C03/C04) |
| Rulesync default wholesale hook replacement | **REJECT** | Documented loss of third-party hooks (C02) |
| Rulesync-managed distribution in teams already using it | **OPTIONAL INTEGRATION** | Export to an existing configuration workflow after coexistence conformance; no core coupling (C01–C04) |

No **DEPEND ON** recommendation is made, so no dependency gate is passed or implied. Borrowing contracts does not mean copying implementation or accepting their defaults.

## 6. Synthesis, sufficiency, and disconfirmation

The convergent pattern is a small installer with explicit owned artifacts, recognizable user/project scope, and a separate check of what was written. The important disagreement is preservation: Abide and agentseam attempt to remove only their entries, while Rulesync needs an explicit preservation option. Another distinction is evidence strength: package executable, installed config, host approval, event dispatch, successful remote review, advice delivered, and repair are different states (A02/B03/B04/C04).

**Recommended candidate journey:** discover the selected host and show its capabilities; configure the backend without exposing secrets; select repository and allowed source scope; preview exact owned changes; install a durable runtime; guide required host activation; run an offline diagnostic; offer an explicit live first-review demonstration with a visible result. The interface can be short while exposing these states progressively. Installing a hook should not print “working” before a host has invoked it. Discovery should suggest, not silently enable, every host on the machine.

**Existing-solution sufficiency:** Abide supplies a much more complete onboarding journey than an adapter alone. It remains a serious alternative for users wanting its instruction-to-rubric product. This source inspection does not establish that it satisfies the product's controlled-writer boundary, exact egress consent, durable packaging, owned-edit collision recovery, or current Effect integration. agentseam and Rulesync solve parts, not first Jev value. Independent implementation is provisionally justified for those product-specific contracts, not because installers are inherently novel.

**Strongest case against building:** the product could spend its limited effort reconstructing Abide's already coherent setup journey and all its edge cases. A clean-room acceptance test showing Abide satisfies the actual required user workflow with acceptable disclosure/ownership and no product-specific gap would change the recommendation toward using it. Conversely, a narrow product installer that cannot survive repeated setup, package relocation, host update, and uninstall is not an improvement merely because its prompt is shorter.

## 7. Traceable specification/prototype handoff

These are candidate requirements for explicit product decisions, not adopted requirements.

| ID | Advisory implication / supporting evidence and counterevidence | Workflow / hosts | Uncertainty and consequence | Proposed decision/check / disposition |
| --- | --- | --- | --- | --- |
| O1 | Separate installed, configured, host-approved, invoked, reviewed, and advice-delivered states (A02/A03/B03/B04; counter: a single success line is simpler) | First run; all hosts | Trust/introspection differs per host; false green creates silent non-review | Define readiness states, prove real-host invocation and correlated result; **both** |
| O2 | Explicit selected hosts and repository scope; detection suggests choices (A03; counter: Abide's all-host default is convenient) | Install/headless; Codex first | Global installation may exceed valid product review conditions | Specify defaults and noninteractive flags; fixtures with several discovered hosts; **both** |
| O3 | Use durable runtime path, exact ownership receipt and guarded/atomic edits; preserve unrelated hooks and refuse ambiguous drift (A06–A08/B02/C03; counter: more machinery) | Install/reinstall/update/uninstall; all | Unknown ownership can leave stale entries; broad removal can destroy user configuration | Specify transaction/recovery and conservative removal; test malformed/unreadable/symlink files, moved runtime, collision and interruption; **both** |
| O4 | Separate credential availability, backend authentication, source-egress authorization and paid verification (A02/A04/A05; counter: more setup steps) | Login/headless/remote failure; all | Key presence gives false readiness; automatic demo could spend money or send source unexpectedly | Specify one-time interactive secret entry into secure local storage (user decision), separately named automation injection, no silent plaintext fallback or headless prompts; validate vault availability/locked state and cross-process hook retrieval; offline by default, opt-in live probe; **both** |
| O5 | Doctor should inspect expected content and runtime path, then distinguish optional real-host/live checks (B03/B04/C04; counter: offline checks cannot prove activation) | Diagnosis/update; all | Host-version unknowns may make complete automation impossible | Machine-readable reasons and repair next step; missing executable, untrusted hook, absent credentials, remote failure fixtures; **both** |
| O6 | Make first value a small isolated review-and-repair example, with real evidence, not only self-test (A02/A09; counter: paid latency and host trust) | First session; validated host first | Synthetic fixture alone may omit native tool mediation | Define optional demonstration acceptance: native edit, genuine Jev finding, host receives advice, repair, terminal review; **both** |
| O7 | Give team distributors a supported export path only after preserving other owners is proven (C02–C04; counter: another configuration authority complicates upgrades) | Team rollout; target-specific | Two installers may erase each other's changes | Defer runtime integration until users request it; test generator preservation + reinstall/uninstall; **defer** |

## 8. Limitations, stopping condition, and primary-source index

Three current repositories were cloned read-only under `/tmp/onboarding-{abide,agentseam,rulesync}` and inspected; default branch SHA was captured before analysis. No dependencies were installed and no candidate code, hooks, login flow, or tests were run. There are no retained runtime outputs or live conformance claims. Reproduction: clone the listed repository, check out the exact SHA in its links, and inspect the named functions. Environment for source retrieval: project workspace on Linux, shell Git; this is not an execution claim about the products.

The declared three-class budget was reached. Saturation was not reached. Next discovery, if needed: Chock's install witness plus actual host-managed plugin installation for the first supported host. This pass does not settle platform packaging, registry publication, keychain integration, enterprise managed settings, operating-system support, or user-comprehension quality. Those require specification choices and targeted acceptance tests. In particular, Abide's mode-0600 plaintext files do not establish the secure local storage the user subsequently requested. The parent specification task is evaluating a native credential vault; no vault was executed or selected as a dependency by this research pass.

Primary-source index: all links below are immutable code/doc links, inspected 2026-09-22; official mutable repository landing pages were additionally browsed that day. Documentation/source observations were not promoted to runtime evidence.

[a-package]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/package.json
[a-init]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/commands/init.ts
[a-hosts]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/hosts.ts
[a-login]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/commands/login.ts
[a-credentials]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/credentials.ts
[a-settings]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/settings.ts
[a-plugin]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/opencodePlugin.ts
[a-paths]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/packageRoot.ts
[a-start]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/sessionStart.ts
[a-uninstall]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/commands/uninstall.ts
[a-bin]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/bin.ts
[a-runner]: https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/hookRunner.ts
[b-package]: https://github.com/open-coder-ai/agentseam/blob/71d7ced4d2d7d336d5b1231fd1436d0dd0f030a6/pyproject.toml
[b-config]: https://github.com/open-coder-ai/agentseam/blob/71d7ced4d2d7d336d5b1231fd1436d0dd0f030a6/src/agentseam/install_config.py
[b-install]: https://github.com/open-coder-ai/agentseam/blob/71d7ced4d2d7d336d5b1231fd1436d0dd0f030a6/src/agentseam/install.py
[b-identity]: https://github.com/open-coder-ai/agentseam/blob/71d7ced4d2d7d336d5b1231fd1436d0dd0f030a6/src/agentseam/install_identity.py
[b-report]: https://github.com/open-coder-ai/agentseam/blob/71d7ced4d2d7d336d5b1231fd1436d0dd0f030a6/src/agentseam/cli_report.py
[b-readme]: https://github.com/open-coder-ai/agentseam/blob/71d7ced4d2d7d336d5b1231fd1436d0dd0f030a6/README.md
[c-package]: https://github.com/dyoshikawa/rulesync/blob/d3cf1caa8663a6979b7d8a1299859c74db878161/package.json
[c-readme]: https://github.com/dyoshikawa/rulesync/blob/d3cf1caa8663a6979b7d8a1299859c74db878161/README.md
[c-config]: https://github.com/dyoshikawa/rulesync/blob/d3cf1caa8663a6979b7d8a1299859c74db878161/src/config/config.ts
[c-formats]: https://github.com/dyoshikawa/rulesync/blob/d3cf1caa8663a6979b7d8a1299859c74db878161/docs/reference/file-formats.md
[c-lock]: https://github.com/dyoshikawa/rulesync/blob/d3cf1caa8663a6979b7d8a1299859c74db878161/src/features/hooks/hooks-ownership-lock.ts
[c-dry]: https://github.com/dyoshikawa/rulesync/blob/d3cf1caa8663a6979b7d8a1299859c74db878161/docs/guide/dry-run.md
