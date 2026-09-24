# Convenient Codex onboarding — implementation specification

Implementation handoff: Implement convenient Codex onboarding (issue #62) (`ready-for-agent`).

## Problem Statement

The product has demonstrated a real Codex edit → Jev finding → model repair loop,
but users still lack a supported way to install, activate, diagnose, update and
remove it. A source-checkout demo does not establish a convenient installed
experience. Users should enter a key once, preserve their other tools, and know
whether review actually happened. Coding agents need to invoke the same setup
operations without asking for secrets in chat or hanging on interactive prompts.

## Solution

Provide a terminal-first, resumable installed CLI. Start with Codex on Linux and
macOS, in interactive and headless operation, while keeping host-specific
installation behind an adapter boundary. Install once into the selected user's
host configuration; enable review separately for each canonical repository and
Jev destination. Store one default Jev key in persistent native credential storage,
with an explicit environment option for automation.

Setup checks compatibility, previews owned changes, installs the integration,
connects credentials, offers repository enablement, guides native host trust,
and reports readiness. Trust may occur earlier if the adapter requires it. Users
can stop with the integration installed and repository review disabled. Repeated
setup resumes incomplete steps without duplicating or damaging working ones.
The supported happy path requires no manual configuration or source-code edits.

This is an implementation contract, not a claim that onboarding or the expanded
platform matrix already works. Product, package and executable names remain
undecided; `review-tool` is only a command placeholder.

## User Stories

1. As a new user, I want to install a released package without cloning the repository, so that setup does not depend on a development environment.
2. As a Codex user, I want compatibility checked before configuration changes, so that unsupported environments receive a useful explanation.
3. As a user with multiple agent profiles, I want to choose the host configuration home, so that installation affects the intended profile.
4. As a user, I want to preview installation changes, so that I understand what will run in my agent.
5. As a user of other hooks, I want their configuration preserved, so that adding review does not break my workflow.
6. As a returning user, I want repeated setup to resume safely, so that interruptions do not require starting over.
7. As a user with malformed or modified configuration, I want a precise conflict and recovery action, so that setup does not overwrite my work.
8. As a user, I want to enter my Jev key once through a masked prompt, so that later sessions can reuse it securely.
9. As a user, I want the key kept out of project files, command arguments and logs, so that ordinary collaboration does not disclose it.
10. As a user with a locked credential store, I want explicit login to guide recovery, so that background hooks never unexpectedly ask for passwords.
11. As an automation operator, I want an explicit environment credential option, so that headless execution can work without a user-session vault.
12. As a user with both saved and environment credentials, I want the selected source identified without its value, so that account selection is predictable.
13. As a user replacing a key, I want cancellation or storage failure to preserve the old key, so that unsuccessful login does not destroy working access.
14. As a user logging out, I want the saved key removed and future queued use invalidated, so that later calls cannot reuse it.
15. As a user logging out with an environment override, I want to know that override remains active, so that I can disable review if that is my intent.
16. As a repository owner, I want to approve the canonical root, destination and eligible-source scope, so that installation alone cannot authorize source transmission.
17. As a returning user, I want valid prior repository approval reused, so that routine setup does not repeatedly ask the same question.
18. As a user, I want host trust handled by Codex, so that installation respects the host's security and managed policy.
19. As a coding agent, I want noninteractive commands and structured outcomes, so that I can install, diagnose and perform requested updates reliably.
20. As a coding agent, I want actionable user handoffs for unavailable authorization or credentials, so that setup does not hang or solicit secrets in conversation.
21. As a user, I want offline doctor to distinguish installation, trust, credentials and enablement, so that I can fix the actual missing step.
22. As a user, I want activity to distinguish pending, clear, finding and unavailable states, so that silence is not mistaken for successful review.
23. As a user, I want finding submission distinguished from observed model reaction, so that status does not exaggerate delivery evidence.
24. As a new user, I want an optional explicitly paid synthetic demo, so that I can observe useful review without sending my current project.
25. As a user, I want ordinary supported edits to establish review activity, so that a demo is not mandatory.
26. As a user, I want explicit updates with clear failure recovery, so that version changes do not silently disrupt my integration.
27. As a user, I want changed hooks to report required trust or restart steps, so that an update cannot claim readiness prematurely.
28. As a user, I want repository disable to prevent future dispatch regardless of credential source, so that I can stop review without uninstalling shared components.
29. As a user, I want scoped uninstall to preserve other hooks, rules, credentials and grants, so that removing one integration does not damage reusable state.
30. As a Linux or macOS user, I want exact tested compatibility stated, so that I can distinguish supported execution from an unverified configuration.

## Implementation Decisions

- **Scope and baseline.** Retain the existing asynchronous direct-event review contract, bundled Noul rules, source eligibility/extraction limits, session/child identity and existing runtime safeguards. Do not add scanning or alter rule meaning for onboarding. Use TypeScript and the matched exact Effect `4.0.0-rc.116` cohort with Decision/DecisionModel and the ai-typesafe provider; the historical vendored SDK is not a production dependency.
- **Installed runtime.** Package a durable executable, resident entry point, parser artifacts and runtime dependencies that work without development dependencies or a source checkout. Declare and validate runtime, OS and architecture requirements. No transient package download on each hook invocation. Do not promise a standalone binary before native packaging works. Package coordinates are release details, not an authorization to publish.
- **Command surface.** Support setup, install, login/logout, enable/disable, doctor, status, optional live demo, explicit update and scoped uninstall. These share operation contracts for humans and agents. Doctor is read-only and offline; install/login/enable do not implicitly call Jev. Updates may download packages but do not transmit project source.
- **Automation contract.** Provide explicit host/scope inputs, noninteractive operation, stable exit outcomes and versioned JSON results with completed/pending steps and actionable errors. Missing secret entry, vault unlock, host trust or consent yields bounded `needs-user-action`; no unattended terminal wait. Existing concrete user authorization can be reused. Project instructions cannot grant source-egress consent. Secret handoff is a masked user terminal prompt or explicitly selected automation stdin channel, never chat or an argument value.
- **Ownership and preservation.** Maintain source-free, secret-free versioned user-owned installation records identifying host, scope, configuration location, exact owned entries, runtime version and fingerprints. Parse actual host configuration; preserve unrelated settings, matcher groups and meaningful order. Reject unreadable/malformed configuration instead of treating it as empty. Detect duplicate representations and locally modified owned entries. Reconcile explicitly rather than overwrite. Honor custom configuration homes and managed policy; never modify trust records or enable globally disabled hooks to evade policy.
- **Mutation recovery.** Preview owned changes. Use bounded configuration locking or concurrent-change detection and atomic writes per file. Journal multi-file progress and expose partial completion/recovery; do not claim cross-file atomicity. Do not restore stale whole-file backups over another tool's changes. Quote executable and argument paths correctly. This protects installer configuration, not concurrent source-writer attribution.
- **Credential storage.** Keep one saved default Jev credential per user, shared across enabled repositories and future adapters. Select persistent native storage scoped to product/backend/destination/profile; repositories cannot choose arbitrary vault entries. Linux Secret Service and macOS Keychain are mechanism candidates. Choose a binding only after real-context probes prove persistence and bounded nonprompting lookup. No plaintext, colocated-key encryption or volatile-store fallback presented as saved secure storage.
- **Credential selection.** An explicitly configured credential environment variable is environment-only: absence or invalidity is an error, with no saved-key fallback. Otherwise a nonempty default `TYPESAFE_API_KEY` overrides the saved default. Report source and accessibility, never values. A rejected credential must not trigger a retry with another account. Do not automatically source environment files or edit shell startup files.
- **Credential lifecycle.** Only explicit login/setup credential actions may unlock storage. Hooks, residents and offline doctor never initiate prompts; lookup must be bounded within responsiveness requirements. Preserve the old key if replacement fails or is cancelled; successful replacement invalidates its old generation. Logout deletes only the owned saved item and invalidates queued/cached generations before new dispatch. Report deletion failure honestly and suspend saved-key use pending recovery. Logout preserves repository grants and cannot remove the caller's environment key. Already dispatched requests cannot be recalled; do not claim guaranteed zeroization of JavaScript strings.
- **Consent and trust.** Reuse preview plus matching-digest confirmation for canonical working root, Jev backend/destination and repository-wide eligible-source scope. Store grants in user-owned state and recheck at dispatch. Installation, saved credentials and host trust are separate from enablement. No automatic grant for another or moved root. Respect normal host trust and required reload/restart behavior without bypass flags. Users can install without enabling any repository.
- **Readiness and activity.** Report installed/compatible runtime, configured integration, trusted/required/unknown host trust, credential accessibility in the execution context and repository enablement independently. Source-free observed activity distinguishes no observation, skipped, pending, completed-clear, findings, submitted, unavailable, incomplete and restart/lost state. Hook output proves submission, not model visibility. Report model reaction only with separate observed evidence. Missing instrumentation must be reported as unavailable, never clear.
- **First-value experience.** Offer ordinary supported edits or a separate opt-in live demo in a disposable synthetic repository with its own consent and declared source/call/time limits. Use the installed release, actual host, normal trust and production provider. Disclose the intentionally flawed input without prescribing the model's repair. Keep only sanitized stage outcomes, versions, timestamps and bounded counts. Record stochastic failures/inconclusive outcomes honestly; never lower thresholds or silently substitute a fake backend to force success.
- **Updates.** Require a user-requested update operation; omit update-available notices unless simple. No automatic upgrades or polling subsystem. Preview executable/hook changes, preserve still-applicable grants and credentials, report new trust/restart requirements, and respect resident protocol compatibility and in-flight work. Retain the previous working installation on failure where possible; otherwise report precise partial state and a recovery command.
- **Disable and uninstall.** Disable prevents future provider dispatch for the selected repository regardless of credential source. Uninstall removes only selected owned host integration and its installation record, preserving unrelated hooks, user rules, saved keys and grants. Explain remaining reusable state and use separate logout/disable operations for removal or revocation. Do not kill another active installation's work or imply already sent requests can be recalled.
- **Advisory adoption.** Borrow convenient staged setup, explicit ownership, preservation and actionable diagnosis patterns from the comparative research. Do not adopt a competitor installer dependency, substring ownership heuristic, destructive default rewrite, or checkout/cache-dependent runtime. Native plugin distribution is deferred; it is not required to ship this CLI contract.

## Testing Decisions

The primary acceptance boundary is the **installed product**: invoke the packaged
CLI in isolated user homes and repositories and run its generated integration
through real Codex. Assert observable outcomes and preserved user state, not
internal call sequences. Reuse existing direct-event, resident, consent and host
conformance fixtures for deterministic checks beneath that boundary. Test the
installer, credential resolver, consent integration and status behavior through
their public operations; do not build a separate test-only review implementation.

| Gate | Required evidence |
| --- | --- |
| Clean package | Packed release without source checkout or development dependencies executes CLI, parser, resident and hook; declare exact runtime/OS/architecture versions. |
| Preservation and recovery | Install/repeat/update/uninstall preserve an independent hook and unrelated settings; cover malformed/unreadable config, duplicates, modified owned entries, concurrent configuration edits, partial writes and quoted paths. |
| Authorization | Install performs zero provider calls; unapproved or moved roots remain disabled; disable is checked before later dispatch; normal native trust applies. |
| Credential lifecycle | Saved key survives new sessions; real hook/resident access is bounded and nonprompting; test locked/absent storage, explicit/default environment precedence, cancellation, replacement, deletion failure and queued-generation invalidation without value leakage. |
| Platform and mode | Linux and macOS each demonstrate interactive and headless Codex. Publish exact tested profiles; an untested cell stays a release gap. Environment-only server tests complement but do not replace saved-key validation. |
| Honest activity | Distinguish readiness from actual invocation/completion/submission; cover no observation, skipped, pending, clear, findings, unavailable and lost state. Observe the independent hook in the real host rather than assuming handler order. |
| Lifecycle | Reject unsupported profiles before configuration writes; diagnose missing parser/runtime/resident facilities; exercise update failure, trust/restart requirements and scoped removal without disrupting unrelated work. |
| Live first value | At a declared budgeted milestone, the installed release with real Codex and Jev yields a finding, observed model reaction, independently validated repair and follow-up completion. A failed or inconclusive run is recorded as such. |
| Privacy and convenience | No paid calls in ordinary tests/doctor; sanitized evidence only; no manual host-config or implementation edits in the supported happy path. Record setup actions and time separately from review latency. |

Ordinary tests use controlled offline responses. Real native-vault and host tests
are explicitly separated from portable deterministic suites. Existing real-host
conformance and the recorded MVP review-and-repair demonstration provide prior art,
but the latter bypassed ordinary trust and packaging and proves only the documented
Linux arm64 headless profile. It is not macOS, interactive or install-to-first-review
evidence. Unit tests and successful installer exit alone cannot satisfy acceptance.

Before committing to a vault binding or advertising compatibility, probe native
prompt suppression, actual lookup deadlines, persistence, macOS capture/resident
portability and installed parser loading. These are implementation prerequisites,
not unanswered product preferences. If they fail, resolve the mechanism or raise
a material scope decision; do not silently reduce Linux/macOS scope.

## Out of Scope

- Additional host implementations, Windows, enterprise deployment and remote rule distribution.
- Native plugin packaging, automatic upgrades and update-notification infrastructure.
- Checkpoint reconciliation, shell/Stop discovery, changed rule meaning or broader source extraction.
- Overlapping-writer coordination and stronger concurrent-write attribution. Preserve current limitations and safeguards without a new single-writer confirmation or exclusive-worktree setup requirement.
- Multiple saved credential profiles and arbitrary project-selected vault identities.
- Public product naming, registry publication and changing the user's real host installation as part of this specification task.

## Further Notes

The user selected the major scope choices, delegated routine defaults and explicitly
chose to proceed without a mandatory walkthrough review. The prototype captures
the chosen interaction model; it has not received human usability validation.
Testing defaults are settled under that delegation. No new paid validation or
production implementation was performed while finalizing this specification.

This specification fills the onboarding deferral in Phase F and adds saved native
credentials while preserving explicit environment selection, consent semantics and
the direct-event review contract. Research remains advisory; only requirements
stated here are adopted. The earlier onboarding draft is historical design input.

- Onboarding decision map (issue #56)
- Installation and activation decision (issue #57)
- Credential research and adoption gates (issue #58)
- Saved credential lifecycle (issue #59)
- Disposable walkthrough (revision `525888c`; not retained locally: `experiments/onboarding-walkthrough/README.md`)
- Direct-event review contract (issue #42)
- Phase F configuration (issue #3)
