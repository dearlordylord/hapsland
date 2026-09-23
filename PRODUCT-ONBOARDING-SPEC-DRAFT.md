# Onboarding and agent installation — specification draft

> Superseded by the [final onboarding specification](./PRODUCT-ONBOARDING-SPEC.md)
> and [implementation handoff](https://github.com/dearlordylord/jevs/issues/62).
> Proposed-status language below is retained as historical design input.

**Status:** specification draft, 2026-09-22. The user has selected Codex-first
onboarding with room for more host adapters, and enter-once secure local API-key
storage. The user subsequently selected interactive and headless Codex on Linux
and macOS, terminal-first agent-callable setup, user-scope installation with
per-repository enablement, and explicit updates with optional simple notices.
These requirements are accepted; remaining design details are proposed.
This document separates existing requirements from new design recommendations. It does not claim that installation
is implemented, authorize publication, or expand the supported host profile.

Wayfinder map: [Specify convenient Codex onboarding](https://github.com/dearlordylord/jevs/issues/56).
Its child decisions govern the remaining draft choices; the map keeps resolution pointers.

**Objective:** a user can install the product into a supported agent, understand
whether it is active, see a first useful review, and remove it without damaging
other tools. The product remains unnamed; `review-tool` below is a command
placeholder, not a chosen product or package name.

## 1. Specification audit and authority

| Existing source | What it settles | What it does not settle |
| --- | --- | --- |
| [Phase F specification](./PRODUCT-PHASE-F-SPEC.md), consent and credential decisions | Explicit per-working-root/backend/destination consent; installation never grants consent; headless hooks never prompt; environment-variable credential reference; user/project separation | Explicitly defers production installation, doctor/uninstall, coexistence certification, release packaging |
| [Consent ADR](./docs/adr/0001-repository-scoped-backend-consent.md) | Preview then matching digest confirmation; dispatch-time revocation | Friendly setup orchestration and agent-host activation |
| [Implementation plan, Phase G](./PRODUCT-IMPLEMENTATION-PLAN.md#phase-g--composition-and-release-hardening) | Proposed install/doctor/uninstall, coexistence, compatibility declaration | No detailed command, distribution, ownership, migration, or success contract |
| [Current supported profile](./docs/direct-event-v1-supported-profile.md) | Asynchronous advisory direct-event review, Codex CLI 0.155.1, Linux arm64, headless command hooks, controlled writer | General interactive installation, other versions/platforms/hosts, invisible competing writers |
| [Full MVP demonstration](./evidence/direct-event-v1/MVP-EXPERIENCE.md) | One real headless write → live finding → repair → successful checks | Packaged installation, ordinary host trust onboarding, reliability estimates |
| [Status documentation](./docs/status.md) | Readiness differs from activity; no-observation is not reviewed; source-free receipts | Evidence that the new resident path writes equivalent completion receipts |

The old implementation plan and Phase F narrative contain historical synchronous,
whole-file, timeout, and retry assumptions. This draft uses the current direct-event
profile for runtime behavior; it does not revive those superseded assumptions.
The checkpoint-reconciliation effort remains deferred and is not an onboarding
prerequisite.

Requirements explicitly accepted above and in section 10 are settled. Other
design details remain **proposed** until their Wayfinder decisions are resolved. The [onboarding research](./PRODUCT-RESEARCH-ADVISORY-2026-09-22-ONBOARDING.md)
is advisory evidence, not an independent source of product requirements.

## 2. First-release scope

Accepted host scope: Codex first, with an installer contract that can gain other
host adapters. The user selected both interactive and headless Codex, on Linux and
macOS. The existing runtime evidence covers only the pinned Linux arm64 headless
profile; the additional selected profiles require validation and any necessary
portability work before release. Detecting an installed agent does not
mean that agent is supported. List unsupported agents separately; never silently
install a Claude-compatible hook into an untested host.

A successful installer must not broaden filesystem coverage, start repository
scanning, add Stop-based discovery, change rule meaning, or add extra source to
backend requests. Keep the default bundled Noul rules and current extraction limits.
Users should not need to author rules or compile their instruction files before
getting a first review.

Interactive Codex is required for this onboarding release and needs its own host
execution and feedback evidence. A headless smoke test does not supply that evidence.
Likewise, current Linux-specific capture and resident-launch assumptions do not
establish macOS support.

## 3. User journey

The accepted entry point is a terminal setup command after acquiring a released
package. The exact command name remains a placeholder:

```text
review-tool setup
```

It coordinates resumable steps, showing a concise summary before applying changes:

1. **Check compatibility.** Identify the selected host, version, active configuration
   home, operating system, runtime, repository root, and required facilities. Do not
   auto-select every detected host. With one supported host, offer it as the default.
2. **Choose installation scope.** Default to the user's selected agent configuration
   home. Explain that the hook becomes available across repositories while review
   stays off for every repository that has not been enabled. Preserve other profiles.
3. **Preview and install the integration.** Show the exact files/entries to change
   and any conflicts. Apply only owned changes. This step does not transmit source.
4. **Connect the review backend.** Offer masked enter-once API-key entry and secure
   local storage. Reuse an existing key or supported environment credential when
   appropriate. Verify that the actual hook/resident context can retrieve it. Show
   presence and next action, never the value; terminal presence is not sufficient.
5. **Enable this repository, optionally.** Show the canonical root, Jev, actual
   destination, eligible-source scope, exclusions, and paid nature of review. Reuse
   the existing preview/digest-confirm contract. The user may finish installation
   with repository review disabled.
6. **Complete host trust.** Guide the user through the host-owned trust mechanism.
   A changed hook can require fresh trust. Do not edit trust records or relax agent
   sandbox/approval settings. Show a restart/reload step only when the selected host
   contract requires it.
7. **Show readiness and offer a first review.** End with a small state summary and
   the next action. Offer an explicitly paid synthetic demo or allow the first normal
   supported edit to establish observed activity. Never silently send project files
   as a connection test.

The host-trust step can be presented earlier when required by that adapter; its
completion must remain distinct from repository consent and backend credentials.
Returning to `setup` resumes unfinished steps and preserves working ones.

No opaque JSON piping, source-checkout path, backend identifier selection, or model
provider choice should be necessary in this happy path. An advanced JSON interface
remains available for automation.

### Agent-initiated setup

The user explicitly wants the coding agent to be able to run the CLI. This is part
of the accepted terminal-first approach, using the same installed executable and
operation contracts as human setup, not a separate installation service.

Provide explicit arguments, noninteractive execution, stable exit outcomes and
versioned structured output. Installation, diagnosis and user-requested updates can
be initiated by an agent within its existing host permissions. Repeated invocations
must safely report completed steps and pending steps.

A required secret-entry, vault-unlock, host-trust or unresolved consent action
returns a bounded `needs-user-action` outcome with the next step; a headless call
must not hang waiting for a terminal. An agent may use already-authorized credential
access and concrete repository consent, but project instructions cannot manufacture
consent. Never ask users to paste API keys into the agent conversation, put keys in
command arguments, or bypass native host trust to make automation look complete.
The precise secret-entry handoff is part of the credential-lifecycle/walkthrough
decisions; it is not claimed implemented here.

## 4. Commands and visible states

Proposed command responsibilities (names remain placeholders):

| Operation | Responsibility | Network/source effects |
| --- | --- | --- |
| `setup` | Guided orchestration with selected host/scope | Package acquisition may use network; no backend call merely to install |
| `install --host codex --scope user` | Install owned host integration only | No source transmission or consent grant |
| `login` / `logout` | Store/replace or remove the user-owned saved key; no repository consent change | No backend call by default; explicit verification is separate |
| `enable --repo <path>` / `disable --repo <path>` | Friendly wrapper around current consent operations | No backend call; disable affects future dispatch |
| `doctor [--host codex] [--repo <path>]` | Read-only compatibility/configuration/credential/trust diagnostics | Offline by default; never repairs implicitly |
| `status --session <id>` | Current readiness plus source-free observed session activity | No backend call |
| `demo --live` | Explicit synthetic first-value exercise | Declared paid host/backend execution in a disposable repository |
| `update --version <exact>` | Preview and explicitly migrate the owned installation | Package download, no project source transmission |
| `uninstall --host codex --scope user` | Remove only the selected owned integration | No backend call |

Use these independent facts in output rather than one green “installed” badge:

- runtime installed and compatible;
- host integration configured;
- hook trusted, trust required, or trust unknown;
- credential available to the execution context, absent, or unverified;
- this working root enabled or disabled;
- the supported profile and its documented same-artifact-overwrite limitation;
- activity not yet observed, hook observed, review pending, review completed,
  finding submitted, or unavailable/incomplete;
- model visibility observed in a particular probe, or unverified.

A clear evaluation is successful review. Missing advice alone proves neither clear
review nor failure. Writing hook output proves submission, not model visibility.
Do not treat installing a file, returning exit zero, or running a handler directly
as proof that the real host invoked it.

For headless operation: require explicit host, scope, and any consent confirmation;
never read prompts from stdin unexpectedly. Provide versioned JSON outcomes and
stable nonzero results for incompatible, conflicted, or incomplete requested setup.
A deliberately install-only request can succeed while accurately reporting disabled
repository review. `--yes` must not stand in for a missing source-egress proposal.

## 5. Packaging and configuration ownership

### Distribution proposal

The accepted distribution surface is an installed CLI. A versioned npm package is
the current packaging proposal, not a separately accepted registry decision; do not
require users to clone the source repository. Exact package coordinates and public
name remain unresolved. A release installation must be durable: hooks must not
point into a temporary `npx` download/cache location or run `npx ...@latest` on every
edit. Package acquisition and hook execution are separate operations.

The release must declare and test its Node/platform requirements, include the
resident entry point and parser artifacts, and keep Effect packages exact-pinned to
the same cohort. All runtime dependencies must work with development dependencies
omitted. Test the actual published tarball, not the source checkout with a populated
`node_modules`. Prefer compiled runnable assets; any retained TypeScript execution
must explicitly test its runtime and package-loading restrictions.

Do not promise a standalone binary until native-parser and resident-process
packaging have been demonstrated. Registry publication, naming, license/release
metadata, and supported platform artifacts are release gates, not assumed facts.

### Distribution alternatives considered

| Surface | Benefit | Trade-off and proposed disposition |
| --- | --- | --- |
| Installed CLI plus host adapters | One setup/doctor/update surface and stable runtime shared across hosts | Installer owns format-preserving configuration changes; recommended first candidate, subject to tarball and native-trust tests |
| Native agent plugin | Familiar host discovery/install path; can bundle hook definitions | Still needs runtime, credentials, repository consent and hook trust; host-specific packaging/version support must be tested; optional distribution wrapper, not a second review engine |
| Transient `npx` as the hook command | Short installation instructions | Per-edit dependency on registry/cache/version resolution; reject as the steady-state execution path |
| Copy/paste hook JSON pointing at a checkout | Useful maintainer development setup | Paths and dependencies break easily; reject as the user-facing onboarding target |

Codex officially documents plugin-bundled hooks, but says they join the same
non-managed hook trust flow. Native packaging therefore does not eliminate the
activation step ([official hooks documentation](https://learn.chatgpt.com/docs/hooks),
accessed 2026-09-22; DOC/DOCUMENTED, not a runtime packaging test). Compare the CLI
and plugin candidate using the actual supported host before declaring either the
best installation experience. A plugin cannot broaden the host capability claim.

### Host configuration

Maintain a versioned installation record in user-owned state with host/scope,
configuration location, owned entry identities, executable/version, and installed
content fingerprints. It contains no secret or reviewed source.

- Parse the actual host format and preserve unrelated entries, matcher groups,
  settings, and semantically significant ordering.
- Use an exact ownership identity plus installation record; substring matching a
  command is insufficient evidence that an entry belongs to the product.
- Repeated installation is a no-op when the intended installation already exists.
  Detect user/project/plugin duplicates and explain their origin before mutation.
- Treat malformed or unreadable configuration as a conflict, not an empty document.
- Preview changes. Use bounded locking/concurrent-change detection and atomic writes
  for each owned file. For multi-file updates, journal progress and report partial
  completion with explicit recovery; do not claim a cross-file atomic transaction.
- Do not overwrite locally modified owned entries without a displayed reconciliation
  choice. A stale whole-file backup must not replace subsequent changes by other tools.
- Quote executable and argument paths correctly, including spaces and shell symbols.
  Honor the host's actual configuration home rather than hardcoding `~/.codex`.
- Respect managed host policy. Do not automatically enable globally disabled hooks,
  install a second representation to evade policy, or bypass host trust.

### Credentials

Preserve support for the current environment-variable contract. Inspect only
presence and configuration provenance. Never put credentials in project JSONC, hook
command arguments, manifests, ordinary logs, or shell history. Never automatically
source `.env` or rewrite shell startup files. The research demo's explicit local
credential lookup is a test harness behavior, not an installer design.

The user has selected **enter once with secure local storage**, one default saved
key shared across enabled repositories, environment override, and logout that
forgets the key while preserving repository enablement. The lifecycle decision is
[recorded in Wayfinder](https://github.com/dearlordylord/jevs/issues/59). Environment-only
onboarding therefore does not satisfy the release requirement. Detailed lifecycle contract (routine choices delegated by the user):

- `setup`/`login` accept a key through a masked terminal prompt; automation may use a
  specifically requested stdin channel. Never accept key values as command-line
  arguments. Do not require a paid call merely to save a key.
- Use a user-session credential vault, with the product's backend/destination and
  credential profile as lookup identity. Repository files store no secret and
  cannot select arbitrary vault entries. Start with one saved Jev profile per user;
  additional hosts share this resolver rather than making separate copies.
- Linux Secret Service is the initial candidate implementation. Its availability
  and noninteractive access from the real host/resident must be validated on the
  chosen supported environment before selecting a library. No silent plaintext
  fallback, self-encrypted file with a colocated key, or project-local key file.
- If the vault is absent, locked, inaccessible, or requires interaction, setup
  reports the exact missing step. Explicit `login` may invoke the vault's unlock
  flow; hooks, resident dispatch and offline doctor must not initiate that flow.
  Headless automation may explicitly supply an environment credential instead.
- Preserve explicit `credentialEnvVar` configuration as environment-only selection;
  if that selected variable is missing, do not silently use another account's saved
  key. Without explicit selection, a nonempty default `TYPESAFE_API_KEY` wins,
  otherwise use the saved default. Doctor reports the selected source, any override,
  and accessibility without exposing values. An invalid selected key is an error,
  not a reason to retry with another credential source.
- Replacement writes the new item successfully before retiring the previous value.
  Cancellation or storage failure must not erase the existing working key. Replacement
  does not change root/backend/destination consent.
- `logout` deletes only the owned saved credential and invalidates its in-process
  credential generation for future dispatch. Already sent requests cannot be recalled.
  Clearly report an environment override that remains active; logout cannot delete
  the caller's shell environment. If deletion fails, report the remaining vault item
  honestly and suspend saved-key use pending recovery rather than claiming logout
  succeeded. Use repository `disable` to stop all future review
  there regardless of credential source.
- Retrieve as late as practical, bound noninteractive vault lookup within the hook's
  existing responsiveness budget, and do not retain plaintext on disk. The current
  resident dispatch context can carry a credential value; implementation must prevent
  queued contexts or a resident cache from keeping a logged-out saved generation
  usable for new provider calls. Do not claim guaranteed zeroization of JS strings.
- Saving a key establishes storage, not credential validity, repository consent,
  backend availability, or actual model-visible delivery. A paid connection/demo
  check remains explicitly requested and budgeted.

The Secret Service API documents login-session storage, locked items, and an explicit
client invocation for displaying unlock prompts ([API description](https://specifications.freedesktop.org/secret-service/latest/description.html),
[client prompting](https://specifications.freedesktop.org/secret-service/latest/prompts.html);
DOC/DOCUMENTED, accessed 2026-09-22). These facts motivate the proposed noninteractive
lookup boundary; they do not prove compatibility with this host or a specific vault.
The vault backend/library and headless deployment fixture remain validation gates.

## 6. Current-runtime gaps that onboarding must resolve

These are source-inspected gaps, not newly demonstrated runtime failures:

| Gap | Local evidence | Required resolution before claiming ready |
| --- | --- | --- |
| No user-facing distribution | `package.json` is private, has no public `bin`, and commands invoke `src/cli.ts` | Packaged artifact, durable entry point, clean-install test |
| Native parser packaging | `src/direct-event/analyzer.ts` imports `tree-sitter` and `tree-sitter-typescript`; both are currently dev dependencies | Include/test runtime parser dependencies and supported ABI/platform assets |
| Resident launch assumptions | `src/resident/client.ts` launches `flock` plus `main.ts`; capture uses Linux `/proc/self/fd` | Doctor checks real prerequisites; package tests exercise resident start, not just CLI help |
| Controlled writer is asserted | `src/cli.ts` forwards `--controlled-writer`; `src/resident/client.ts` refuses admission without it | Retain documented limitation and existing safeguards; user deferred concurrent-write handling as an onboarding prerequisite |
| New path differs from old receipts | `src/cli.ts` returns direct-hook output before the legacy receipt-wrapped review call | Add/test source-free observation of resident admission, completion and submission, or accurately report activity unavailable |
| Bypassed trust in demo | `scripts/run-mvp-experience.mjs` uses one-off host trust/approval bypasses | Normal user onboarding must work through native trust; no such bypass in generated ordinary launch commands |

**Scope decision (2026-09-22):** the user considers overlapping writes rare and
has deferred handling them. They are not an onboarding blocker. Do not add a new
single-writer confirmation, exclusive-worktree requirement, locking feature, or
parallel-agent prohibition to this onboarding effort.

Keep the current same-artifact-overwrite limitation documented in the supported
profile. This decision does not establish exact authorship under invisible
concurrent overwrites, remove existing implementation safeguards, or change the
review-input contract. Hook session/child identity remains available and must be
preserved. See the [focused attribution recheck](./RESEARCH-HOOK-ATTRIBUTION-2026-09-22.md).

The adapter installation work must accurately describe its use of the existing
controlled-writer profile; the internal flag is not proof of exclusivity. Improving
that guarantee belongs to a separate effort when real usage justifies it.

## 7. Verification and first useful review

Offline doctor checks release/runtime identity, parser loading, resident prerequisites,
selected host/version, active configuration scope, installation ownership/drift,
known duplicate hook registrations, credential presence in the reachable context,
repository consent/configuration, and eligibility. Unknown facts stay unknown.
Doctor prints one actionable next step per failed or pending stage.

A synthetic demo must use a disposable working root with its own consent, the installed
release, actual selected host, normal trust semantics, and the production provider.
Declare the call/source/time limits before execution. It must not inherit permission
to transmit arbitrary files from the user's current repository. The synthetic draft
is disclosed as deliberately flawed; the model receives no prescribed repair.

Retain only source-free stage outcomes, timestamps, compatibility versions and bounded
counts. Distinguish backend response, completed evaluation, advice submission, model
visibility, and actual repair. Independently test that the repair rejects the intended
invalid states. A stochastic miss is an honest failed/inconclusive demo, never a reason
to force a finding by lowering thresholds or substitute a controlled backend unnoticed.

The current 55-second demonstration is a useful starting fixture. It is not an
install-to-first-review benchmark because it bypassed packaging and normal trust.
Measure first-time setup separately, recording human actions, manual file edits,
time to first observed review, and actionable recovery from failure. Proposed UX gate:
no manual editing of host configuration or implementation source in the supported
happy path; credential and native host-trust actions may remain explicit.

## 8. Update, disable, and removal

Disabling a repository revokes future review dispatch without removing host integration
or shared rules. Removing a host integration removes only its owned entries/files and
its installation record; leave user-authored rule/config files and reusable credentials
alone. Do not restore an entire old host configuration file.

Existing per-root consent may remain for other host integrations. Uninstall must state
that it is not global consent revocation and that running sessions may have already
accepted work. Offer a separate explicit revoke operation; do not claim recall of
requests already sent. Stop only idle resident processes when safe and never terminate
another active installation's work to make cleanup look complete.

The user selected explicit updates. An update command is required; automatic
update-available notices are optional only if simple, and may be omitted entirely.
No polling service or release-detection subsystem is required for notifications.
Necessary update failures and host-required trust/restart next steps still need
accurate outcomes; these are not optional promotional update notices.

Updates are versioned and preserve consent only when the existing exact
root/backend/destination grant remains applicable. Preview executable/hook changes
and any trust re-review. Version resident protocols and avoid killing incompatible
in-flight work: report a required restart or use an explicitly compatible handoff.
On failure, preserve the previous working installation where possible and give a
specific recovery command. No automatic background upgrades in this first release.

## 9. Acceptance gates

| Gate | Required evidence |
| --- | --- |
| G1 Clean installation | Install the actual release into a fresh supported environment without repository/dev dependencies; CLI, parser, resident start and hook run |
| G2 Preservation | Existing unrelated hook and config survive install, repeat install, update, and uninstall; exact owned-entry checks |
| G3 Conflict recovery | Malformed/unreadable config, concurrent edits, partial writes, user modifications, duplicate scopes and path quoting have deterministic fixtures |
| G4 Consent separation | Install performs zero review calls; unapproved/moved/other working roots stay disabled; disable prevents future dispatch |
| G5 Credential context | Enter once and reuse after new host/resident launch; test locked/absent vault, environment precedence, cancellation, replacement, logout with queued work, and actual hook access without prompts or leaked values |
| G6 Native activation | Selected host loads and trusts integration through its normal process; no bypass flags in ordinary generated configuration |
| G7 Real first value | Installed artifact plus actual host/backend produces a finding, model reaction and validated repair under the declared profile; record stochastic failures honestly |
| G8 Truthful status | No observation, all skipped, pending, reviewed-clear, findings submitted, unavailable, incomplete and restarted/lost state remain distinguishable |
| G9 Coexistence | Second independent hook remains effective in a live host run; handler ordering is not assumed; layered duplicate installs are detected |
| G10 Lifecycle | Wrong host version/platform rejected before config writes; missing runtime/parser/flock diagnosed; update/removal preserve unrelated work and report restart needs |
| G11 Privacy | Source-free local records; credential redaction; explicit budgets and consent for demo; no paid requests in ordinary tests/doctor |
| G12 Scope honesty | Installation preserves session/child identity and describes the supported profile without claiming exact ownership under overlapping writes; no new concurrency setup gate |

Do not call onboarding complete on unit tests or installer exit status alone.

## 10. Decision status

| Decision | Status / recommendation | Consequence |
| --- | --- | --- |
| D1 Initial host scope | **Accepted by user:** Codex first, design for more hosts; interactive and headless, Linux and macOS | New modes/platforms require separate evidence and portability work |
| D2 Credential experience | **Accepted:** one saved default key, environment override, logout preserves repository enablement; routine lifecycle defaults delegated and recorded in the credential decision | Native backend/library adoption still requires runtime validation |
| D3 Distribution surface | **Accepted:** terminal-first installed CLI, callable by coding agents; install once for the user's Codex, enable each repository separately; native plugin deferred | Exact package coordinates and runtime packaging remain release details |
| D4 Overlapping-write handling | **Deferred by user:** rare case, not an onboarding blocker; preserve documented limitation | No new single-writer onboarding requirement or concurrency work in this effort |
| D5 Updates | **Accepted:** explicit update command; update-available notices only if simple, otherwise omit | No automatic upgrades or notification infrastructure required |
| D6 Public identity | Choose product/package/executable name before publishing | Placeholder commands are not installation instructions today |

Implementation should follow settled decisions, not invent them while changing users'
agent settings. This draft is the reviewable input for those decisions.

## 11. Research-to-specification traceability

| Advisory handoff | Proposed specification treatment | Status |
| --- | --- | --- |
| O1 readiness evidence | Sections 3–4 and G8 separate configured/trusted/invoked/completed/submitted | Proposed product contract |
| O2 selected host/scope | Sections 2–3 and G4; Codex first accepted, user-scope install proposed | Part accepted, scope details proposed |
| O3 durable runtime/owned edits | Section 5 packaging and ownership; G1–G3/G9/G10 | Proposed product contract; no competitor dependency adopted |
| O4 credential/consent separation | Sections 3/5/8 and G4/G5/G11; enter-once storage accepted | User experience accepted; vault mechanism and detailed contract proposed |
| O5 doctor | Sections 4/7, G5/G6/G8/G10 | Proposed product contract |
| O6 first useful review | Section 7 and G7; builds on recorded MVP demonstration | Proposed installed-release acceptance gate |
| O7 team distribution | Deferred; native plugin/Rulesync integrations do not block Codex CLI setup | Revisit with concrete team-distribution demand |


## 12. Walkthrough and selected verification defaults

The [disposable onboarding walkthrough](https://github.com/dearlordylord/jevs/blob/525888c/experiments/onboarding-walkthrough/prototype.html)
records the proposed interaction model. Open the HTML locally in a browser; it
requires no server and makes no network calls. It covers nine scenarios, including
agent handoff, configuration coexistence, locked or absent vaults, logout,
environment overrides, explicit updates and separately approved synthetic demos.
It is a simulation, not compatibility evidence or a claim of human usability review.

Following the user's delegation of routine defaults, use these verification boundaries:

- Prefer one installed-product seam: invoke the shipped CLI in an isolated user
  home and working root, then exercise its generated integration through real Codex.
  Use the existing direct-event fixtures beneath that seam for deterministic cases;
  do not create parallel test-only installer or review implementations.
- Test clean install, repeat setup, diagnosis, enable/disable, update failure and
  scoped removal from a packed release without a source checkout. Include an
  independent hook and paths containing spaces. Observe results and preserved
  user configuration rather than internal function calls.
- Require Linux and macOS evidence for interactive and headless Codex. Publish the
  exact tested OS, architecture, host and runtime versions. An untested matrix cell
  remains a release gap, not an inferred pass. The current Linux arm64 headless
  demonstration does not establish the other cells.
- Probe persistent native storage and bounded, nonprompting retrieval from the
  actual host/resident context before adopting a binding. Exercise login cancellation,
  replacement, locked/absent storage, deletion failure and queued-key invalidation.
  A headless environment-key fixture complements, but does not replace, the
  promised saved-key experience.
- Keep ordinary verification offline with controlled provider responses. At the
  declared live milestone, run the installed artifact with the real host and Jev
  under normal host trust, capturing only sanitized finding, reaction, independently
  checked repair and follow-up completion evidence. Declare source/call/time limits.
- Make native prompt suppression, macOS runtime portability, installed parser
  loading and resident startup prerequisites for a compatibility claim. If a probe
  fails, resolve the mechanism or surface a material scope decision; do not silently
  narrow the user's Linux/macOS requirement.

These defaults prepare the acceptance decision. They do not assert that the
walkthrough has been user-tested or that any new release gate has passed.
