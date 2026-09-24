# Formal security validation connected to Hapsland code

Status: advisory pre-research; not a product specification or adoption decision.

For the current investigation direction, user priorities, connector ownership and payload-authorization scope, start with [the current-state investigation note](FORMAL-SECURITY-INVESTIGATION.md). This report retains the supporting evidence; the current-state note updates its recommendations where indicated.
Date: 2026-09-24. Canonical report for this targeted pass; no earlier report superseded.

## Research brief and change log

Question: how can Hapsland connect formal validation to actual TypeScript and enforce it through quality gates, starting with source egress, persistence, and configured path access?

Current assumptions: Hapsland owns the integration boundary, Jev is the external review backend, and agent hosts have their own independent capabilities. Existing consent and path controls are inputs to research, not assumed proof of security. A model must cover the supported production route, including resident work, rather than infer it from legacy helpers.

Representative workflows: post-edit advisory review, a future optional blocking mode, multiple installed tools, headless operation, remote failure, queued work after consent revocation, and exclusion changes between capture and dispatch. The supported Codex profile is the initial scope; Claude Code/OpenCode and other hosts require separate boundary evidence. Required: offline reproducible gates and a connection to production effects. Desirable: counterexample replay and eventual proof for a small policy kernel.

Baseline: use existing code-connected formal tooling with Hapsland-specific adapters, plus existing deterministic conformance tests, before building a verifier. Named candidates are Quint/quint-connect-ts, TLA+/PlusCal/TLC/Apalache, and the Bend project identified by the installed Bend skill. These are adjacent development/CI security controls, not agent-host substitutes. A demonstrated maintained TypeScript refinement pipeline or lower-cost complete effect coverage would overturn a preference for Quint conformance.

Discovery: official repositories and docs, package metadata, linked sources, local production source and supported-profile documentation. Queries include `quint-connect-ts`, `TLA+ trace validation implementation`, and the installed Bend project's official references. This is a targeted named-candidate pass, ending after each candidate's implementation bridge and limits are checked; it does not establish ecosystem completeness. General theorem-prover surveys, live provider retention audits, and full OS sandbox design are excluded to keep the question bounded.

Change log: initial brief established before synthesis. The user subsequently preferred whichever exclusion guarantee is reasonably achievable. The recommended contract below applies that preference; it is advisory until adopted in the product specification. No implementation, formal model, test execution, or live backend call is part of this pass.

## Candidate inventory, evidence ledger and cards

Evidence is divided into three supporting notes, which are part of this report. Every material external capability below points to their claim IDs. Source class and verification state are recorded separately in those ledgers; none of this pass is runtime-tested.

- [Quint and TypeScript connector](formal-security-quint-notes.md): Q1–Q9; pinned source references, package metadata, compatibility and dependency gates.
- [TLA+, PlusCal, TLC, Apalache and Bend](formal-security-tla-bend-notes.md): T1–T8 and B1–B4; primary-source claims and comparable candidate cards.
- [Current Hapsland code map](formal-security-code-map.md): C1–C11; source locations for ingress, path policy, capture, dispatch, persistence and HTTP encoding.

Inventory: include Quint and its TypeScript connector because a driver can exercise production TS; TLA+/TLC and Apalache because implementation trace validation supplies an alternative connection; PlusCal only as a TLA+ authoring front end; Bend 2 because proof-bearing executable definitions might own a small policy kernel. Reject a duplicate Bend rewrite as evidence about unchanged TypeScript. Exclude the earlier HigherOrderCO/Bend language from the proof comparison because it is a different toolchain [B1]. No general theorem prover or whole-program JS information-flow survey was attempted.

| Candidate / intended use | Capability and code connection | Classification | Limitation / next gate |
| --- | --- | --- | --- |
| Quint model + `quint-connect-ts` for first prototype | Model checking and sampled trace replay into TS handlers, with optional state comparison [Q1–Q4: DOC/DOCUMENTED, SRC/SOURCE-INSPECTED] | OPTIONAL INTEGRATION | Require state/effect comparison, every meaningful action mapped, reproducible trace generation and deliberate bypass detection. Published Effect 4 connector targets RC.112; Hapsland RC.116 compatibility UNKNOWN [Q7: META/DOCUMENTED]. |
| Trace driver and observed effect pattern | Separate formal state exploration from exercising real product effects [Q2–Q4, T6–T7] | BORROW | Driver and observer completeness remain trusted assumptions. |
| TLA+ / TLC with TS trace validation | Finite model exploration plus validation of recorded implementation behavior [T1,T3,T5–T8: DOC/DOCUMENTED, SRC/SOURCE-INSPECTED] | OPTIONAL INTEGRATION | TS trace capture/projection needs product-specific work; no selected-trace result is a proof of all TS executions. |
| Apalache model backend | Bounded checking and inductiveness checks over a model [T4: DOC/DOCUMENTED] | OPTIONAL INTEGRATION | Bounded success must name depth; pin tool and assess license before adoption. Quint can also use Apalache [Q1]. |
| PlusCal authoring | Translates an algorithm into TLA+ [T2: DOC/DOCUMENTED] | OPTIONAL INTEGRATION | Does not generate a verified TS implementation. |
| Bend 2 proof of existing TS | Laws refer to Bend definitions [B2: DOC/DOCUMENTED] | REJECT | Proving a separate implementation does not prove Hapsland TS. |
| Bend 2 generated production policy kernel | Guide describes JS emission [B3: DOC/DOCUMENTED]; using it to own policy is INFERRED | OPTIONAL INTEGRATION | Defer until a prototype establishes proof checking, generated artifact fidelity, wrapper behavior and acceptable compiler trust. |

There is no unconditional DEPEND ON recommendation. The Quint note records readiness gates for a possible later test dependency: license metadata is present, while RC.116 compatibility, product conformance, supply chain, failure semantics and maintenance/exit remain unresolved. A declaration of a license is not a legal compatibility decision. TLA+/Bend exact deployment choices and Apalache license review remain open as recorded in their note. Host lifecycle, blocking and headless interaction are properties of the Hapsland harness; these tools do not supply agent-host enforcement.

## Current-code findings that determine priority

The code map is SRC/SOURCE-INSPECTED, not a runtime security assessment. Source inspection supports these narrower findings:

- Configuration excludes are accumulated and checked before named-file capture, which uses descriptor-anchored containment [C2–C4]. These mechanisms are useful verification seams.
- The hook has already received source-bearing patch lines before this gate; those lines can traverse local IPC [C1,C8]. A no-filesystem-read promise and a never-ingest-source promise are different contracts.
- Prepared source includes the declaration, same-file reference evidence, relative path and contract information; provider encoding also includes rule questions [C5,C11]. Observing only `artifact.source` would miss part of the actual egress contract.
- **First temporal case:** resident dispatch reloads settings and checks consent/root/credential authority, then uses `job.prepared`. No explicit current-exclusion check was found at that edge. Current policy is checked before publishing findings, after evaluation [code-map question 2]. This is an experiment target; whether queued work must obey newly restrictive config is not yet a settled requirement.
- **First persistence case:** metadata and consent are intentionally persisted; resident stderr/debug causes lack the same demonstrated bounded schema as structured diagnostics [C9,C10]. Inject a synthetic source-bearing failure and observe the resulting files before claiming source-free persistence.

## Recommended exclusion contract after user clarification

The user prefers the strongest reasonably achievable guarantee. Recommend that excluded paths cannot trigger Hapsland filesystem source-content reads or source dispatch to Jev. Newly restrictive exclusions should invalidate queued source before dispatch at an explicitly defined authorization point. Already transmitted requests cannot be recalled; concurrent policy updates and dispatch need a precise ordering contract rather than a claim of instantaneous revocation.

Host events can already contain excluded-path patch text before Hapsland decides eligibility. Do not promise that Hapsland never receives those bytes. Recommend discarding that content as early as practical, preferably before resident IPC, and preventing its persistence or provider dispatch. Event parsing, path metadata inspection and configuration reads must be distinguished from reading excluded file contents. Current ingress/IPC behavior needs a prototype before any stronger guarantee is advertised.

This recommendation selects no-filesystem-source-read plus no-provider-egress as the initial target. It does not authorize an implementation change or establish that the existing code meets the target. The first prototype should exercise both the pre-capture gate and the prepare → exclude → dispatch interval, then test early disposal of excluded host payload content.

## Proposed verification contract

The following is a proposed design, not a claim about current implementation.

Begin with **source release authority**: the relation between a source artifact, its canonical repository/path identity, the applicable policy revision, current user consent, destination, and permitted output sinks. Path configuration is part of that relation. Starting with an isolated glob matcher would miss stale queued work; starting with all possible information flow would be too broad for an initial gate.

Candidate properties:

1. A Hapsland source read is authorized by path policy before reading source bytes, using a filesystem identity that remains contained during the read. Incoming host event source is a separate ingestion channel: a plugin cannot undo its receipt of bytes the host already sent.
2. Every source-bearing HTTP submission has a matching repository/backend/destination grant and eligible evidence at the specified authorization point. Rules, examples, file names and derived content are part of the payload inventory, not just the `source` field.
3. Adding exclusions cannot increase the eligible set. Project settings and rule overrides cannot restore a globally excluded path. Empty includes remain distinct from omitted includes.
4. Captured/queued/cached artifacts cannot bypass revocation or a newly restrictive policy. Whether a policy snapshot remains authoritative must be explicitly decided. Model an authorization point and concurrent change; do not claim a prior check is atomic with a later network write.
5. Source and source-derived sensitive values can reach only explicitly permitted sinks. Durable records use an allowlisted schema; neither source-bearing errors nor arbitrary provider responses are admitted as diagnostics. Cache, IPC, hook responses and stdout/stderr each need their own sink policy.
6. Exceptions, timeout, restart and retry do not create an alternate release path. A backend outage may leave the host edit allowed while source dispatch stays denied; edit blocking and source authorization are different decisions.

These are trace safety properties for authorized effects. A stronger claim that changing secret contents cannot affect any public output is a **noninterference** claim requiring comparison of executions (and a declared observation/declassification policy). A byte-canary check alone does not establish it. Encrypted/encoded/hashed/derived values need explicit treatment. Physical RAM erasure, swap, crash dumps, host transcript retention and Jev's server-side retention are separate boundaries; this proposal does not prove them.

## How the code connection would work

A small pure policy kernel decides whether an operation is allowed and why. Actual Effect services perform reads, provider requests, persistence and host output. The production service implementations and their injection points should be reused by the conformance harness; a second implementation in a test adapter would weaken the connection.

The formal model generates sequences such as configure → capture → enqueue → revoke → dispatch → provider failure → persist diagnostic. A TypeScript driver maps model actions to real product operations. It compares abstract states and records **actual attempted effects**, including rejected attempts, through controlled filesystem/network/output boundaries. It must include implementation-originated behaviors and failure schedules, not merely execute model-approved happy paths.

A model action named `send` is insufficient evidence of sending. Check serialized HTTP bodies after provider encoding, destinations and redirect policy, actual file paths/content, stderr/stdout and child-process effects. Use synthetic source and local endpoints; retained reports need only opaque fixture IDs and sanitized outcomes. Tests involving live backend source are unnecessary for this gate.

Static import restrictions can make bypasses conspicuous but cannot prove confinement of arbitrary JavaScript, dynamic imports, native helpers or dependencies. Add packaged-process observation/containment on each supported platform. State the trusted boundary explicitly: model, abstraction mapping, driver, observers, compiler/runtime, filesystem/native helper and provider transport.

## Proposed quality gates and acceptance experiment

| Gate | Required evidence before passing |
| --- | --- |
| Formal model | Pinned tools; parse/type checks; named invariants; declared finite bounds or proof obligations; timeout/unknown is inconclusive and cannot pass the gate |
| Production conformance | Same production functions/services; reproducible seeds and schedules; action/state and effect matching; saved replayable counterexamples |
| Effect boundary coverage | Inventory of production source reads, HTTP, subprocesses, writes and output; deny unexpected effects in the harness; record exact covered profile |
| Adversarial cases | Restrictive config changes while queued, consent revocation, cached work, malformed config, symlink/rename races, backend errors that echo synthetic source, debug output, restart and failure paths |
| Gate sensitivity | Deliberately remove consent/exclusion checks, add an unauthorized write/send, and leak an error canary; each mutation must make the relevant gate fail |
| Packaged release | Exercise the compiled installed artifact and pinned provider dependency; connect evidence to commit, package digest, model and tool versions |
| Merge/release enforcement | Make the checks required in repository protection/release automation; inspect remote settings separately because local YAML does not establish enforcement |

The first experiment should use one supported production profile, two repository identities, allowed/excluded paths, two policy revisions, consent grant/revoke, a queued item and a retry/failure transition. These are proposed initial bounds, not a coverage sufficiency claim. It succeeds when an actual unauthorized read/send/write is rejected and an intentionally introduced bypass reliably fails CI. Measure runtime and coverage before selecting PR versus scheduled exploration budgets. A successful model check with a surviving bypass mutation fails the experiment.

## Synthesis, sufficiency and disconfirmation

Recommendation: prototype **Quint plus code conformance** for the source-release state machine first, including the path policy that authorizes release. This is an inference from the available TS driver [Q3–Q4] and the concrete queued-work interval [C6 and code-map question 2], not a measured ranking of tools. Keep the connector optional until RC.116 compatibility is established. A local driver borrowing its trace pattern is a fallback, not a reason to silently add an incompatible Effect cohort.

TLA+ remains a credible alternative if implementation-originated trace checking is easier to maintain than a Quint driver. As additional DOC/DOCUMENTED evidence, Microsoft's [Smart Casual Verification of the Confidential Consortium Framework](https://www.microsoft.com/en-us/research/wp-content/uploads/2024/07/nsdi25spring-final392.pdf) describes connecting TLA+ to an existing C++ implementation through trace validation in CI. It is a precedent for the method, not evidence of TypeScript or Hapsland compatibility. Accessed 2026-09-24. Bend is a later experiment for a pure policy kernel when a proof attached to executable definitions justifies moving that production boundary.

The convergent pattern is an explicit abstraction mapping plus observed production behavior. Existing tools satisfy the model/checker/trace-format portion of the baseline; none supplies Hapsland's payload policy, complete sink inventory, OS containment model or Jev retention assurance. Those remain product work. Maintaining three equivalent formal specifications initially would add drift opportunities without closing these boundaries.

Strongest case against the recommendation: Hapsland could invest in a precise model while the harness omits a debug log, direct network call, native helper or dependency effect. Ordinary process containment and adversarial integration tests might deliver more practical security first. Change the recommendation if the connector cannot work with the pinned cohort, a driver cannot exercise the production route without duplicating decisions, observer coverage cannot detect planted bypasses, or maintaining the mapping exceeds its demonstrated defect-finding value. Successful TLA+ trace replay with less mapping work would favor that alternative; a proven and reproducible Bend-generated kernel with safe wrappers would justify reopening Bend.

For a competitive claim, publish the exact properties, supported profiles, model bounds, tool versions and package-linked conformance evidence. “Model-checked source authorization with implementation conformance gates” is defensible only after those gates exist and pass. This research does not support “Hapsland is formally proven secure.”

## Traceable specification and prototype handoff

| ID | Advisory implication and supporting evidence | Uncertainty / consequence | Next decision and acceptance check | Disposition |
| --- | --- | --- | --- | --- |
| H1 | Specify read, ingress, send, disk and host-output permissions separately [C1,C5,C8–C11] | A no-read claim could conflict with host-supplied patches | Define no-filesystem-read versus no-ingestion; inventory source, rules, paths, findings, credentials and metadata per sink | Specification |
| H2 | Decide policy/consent authority for queued work [C3,C6; code-map question 2] | Snapshot semantics may permit source that a user now excludes; check/send races remain | Choose authorization point and restrictive-change semantics; replay prepare → exclude/revoke → dispatch against actual sink | Both |
| H3 | Use Quint code conformance as the first tool experiment [Q1–Q7] | Connector cohort and driver coverage unproven | Isolated RC.116 consumer; meaningful state/effect checking; unhandled actions and zero executed traces cannot pass | Prototype |
| H4 | Cover error and debug persistence [C9,C10] | Source-free structured records do not cover arbitrary stderr | Inject synthetic source into failures, capture child stderr and inspect allowed storage paths/content | Both |
| H5 | Pin and enforce quality gates [Q5–Q9,T3,T8] | CI scripts alone do not establish required checks or release linkage | Demonstrate planted bypass failure; inspect repository protection; associate gates with compiled package digest | Both |
| H6 | Keep Bend proof claims scoped to Bend-owned executable logic [B2,B3] | Compiler/wrapper assumptions could break claimed connection | Revisit after first TS gate if a pure policy core warrants a rewrite | Defer |

H1–H5 begin with the supported direct-event production profile. Additional host adapters, platforms and modes need separate effect witnesses; a core conformance result cannot establish that an agent host blocks an edit. Failure semantics must distinguish an allowed host edit from forbidden source dispatch.

## Limitations, stopping condition and source index

The three bounded delegated investigations covered the named tools and the current supported code route. The stopping condition is met for this pre-research question; ecosystem saturation is not claimed. No model, implementation change, test execution, compatibility installation or live provider request was performed. The reported policy-timing and debug-output questions are source-inspected investigation targets, not reproduced vulnerabilities. Remote repository branch protections and Jev server-side retention were not inspected.

Primary sources and claim provenance are indexed in the three linked evidence ledgers above, including immutable connector source links, documentation access dates, installed Effect RC.116 source, product ADRs and production code locations. Local source baseline: `f32acaf8cedef59cf03889f638ce83cfd4476ebb`, with pre-existing README/media changes left untouched. The subsequent user preference for whichever guarantee is reasonably achievable is reflected in the recommended exclusion contract above; exact concurrency and ingress semantics remain specification/prototype decisions.
