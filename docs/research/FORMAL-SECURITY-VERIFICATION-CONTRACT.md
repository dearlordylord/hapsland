# Hapsland security verification contract and bounded prototype plan

Status: proposed verification contract and bounded prototype plan, 2026-09-24. This document proposes the contract for a later prototype; it does not establish that Hapsland satisfies it. No formal model or production security change is made by writing this contract.

## Purpose and boundaries

Demonstrate a mechanical connection between a small formal authorization model and the actual Hapsland TypeScript path that reads source, extracts review evidence, sends requests and emits local outputs. The intended security claim is authorized access and bounded source disclosure for a declared product profile.

The first profile is the supported Codex direct-event resident route with synthetic repository fixtures and an offline provider transport. Record the exact runtime/platform/package used; if the available environment differs from the supported production profile, results establish only the development harness until the packaged profile is exercised. Other host adapters and the legacy review route require their own evidence.

The user wants practical protection at two distinct levels: which files can be read, and which portions of an allowed file can be sent. Connector ownership makes any necessary Effect update a bounded integration task. All proposed new semantics below require explicit adoption in the prototype contract; they are not inferred current product requirements.

## Assurance layers

1. A finite model checks authorization state transitions under declared bounds.
2. A driver executes the corresponding operations through production code and compares observed effects/state with model expectations.
3. Concrete extraction/serialization fixtures check source-fragment provenance and request fields independently of the model's abstract identifiers.
4. Process-level witnesses exercise the installed artifact and observe effects that service injection may miss.
5. Deliberate code mutations establish that the checks detect bypasses.

Each layer reports its own result. A model pass cannot override failed implementation conformance or absent effect observations. Passing these checks is not a proof of all TypeScript executions, absence of secrets in approved declarations, arbitrary information-flow noninterference, or Jev's server-side retention policy.

## Concrete candidate contract

These are proposed acceptance requirements for the prototype, not an assertion that the current product implements them. The user authorized feasibility work and this contract/plan; product-wide adoption and implementation remain separate work.

### Authorized payload unit

For one accepted root declaration, define an authorized unit as:

- Canonical repository identity and eligible repository-relative path.
- One stable captured file version, with root declaration name/kind and exact source span.
- The root interface/type alias, including its enclosing export statement when that is the production extraction span.
- Distinct same-file declarations reachable through the supported named-reference graph; recursive expansion terminates cycles through included edges.
- The applicable, explicitly selected rule definitions and versioned input-contract metadata.

The currently feasible content guarantee is **exact raw declaration spans**, not a normalized structural type signature. Internal comments, export-span comments and literals remain authorized when inside those spans. Leading comments or unrelated siblings outside the spans are not authorized as source. Rule text, relative paths, identifiers and hashes are separate authorized fields; they must not become an escape hatch for arbitrary captured source.

Current bounds are 32 KiB captured files, 64 declarations per file and 16 distinct referenced names per root. Imports reject the file; unresolved/unsupported/over-limit reference extraction rejects the affected root. Other independent ready units may still proceed. No whole-file fallback is allowed.

Use the analyzer's explicitly documented **syntactic named-reference graph** as the initial closure meaning. Do not claim TypeScript compiler resolution: namespace-nested declarations are currently collected by unqualified name, and scope/generic behavior requires a separate decision. The initial positive corpus should use unambiguous top-level declarations; namespace/shadowing examples must remain visible as limitations or negative contract cases, not silently disappear from coverage. Adopting top-level-only production support would require a separate restriction and migration decision.

### Invariants, production connection and evidence

| ID | Candidate invariant | Actual boundary and independent witness |
| --- | --- | --- |
| SEC-READ | A path rejected by effective file policy before capture produces no source-content read. Every accepted read remains physically contained under the capture contract. | `eligibleNamedPath` → `captureStable`, through `prepareObservation`; capture hook for fast feedback plus source-file identity read observation in a subprocess. Config/Git/metadata reads are explicitly distinguished. |
| SEC-FRAGMENTS | Every transmitted declaration source equals an allowed span of the captured artifact. Every expanded reference is reachable; included edges identify already reached nodes. No unrelated source enters any field. | `analyzeTypeFile`/prepared units → `preparedProviderInput` → installed provider encoding; expected spans/edges and complete request shape come from independently authored fixture manifests. |
| SEC-FAIL-CLOSED | Unsupported extraction never broadens to full-file input or dispatches the unsupported root. | Production preparation and evaluation; unsupported fixtures must complete with zero provider attempts for that root. |
| SEC-WIRE | Every observed request has the approved destination/method and exact permitted body fields, source fragments and selected questions; extra requests/fields fail. | Real `TypeSafeDecisionModel` and `TypeSafeClient` with offline `HttpClient` observation; check every request after serialization, not only the first or `DecisionModel` input. |
| SEC-AUTHORITY | A completed restrictive policy or consent update preceding the defined dispatch authority read prevents the now-unauthorized submission, including prepared/queued units. Grants cannot cross repository/backend/destination identities. | Real resident preparation/queue/evaluation with deterministic scheduling barriers and actual provider-attempt journal. Dispatch must compare prepared path/payload authority with the applicable current policy. |
| SEC-SINKS | Source and source-derived content reaches only its allowed sinks. Durable metadata records match exact schemas and configured allowed locations; arbitrary source-bearing errors cannot enter disk/log/host-output sinks. | Actual file-write attempts, file contents, child stderr/stdout, IPC frames and provider events. Explicit policies per sink; structured-store validation alone is insufficient. |
| SEC-INGRESS | Excluded patch content supplied by the host is discarded before the chosen resident admission boundary and is not persisted or sent remotely. | Actual serialized admission frame and downstream effects. This is a proposed strengthening: current ingress can carry patch lines before policy selection. |
| SEC-GATE | No missing observer/action coverage, empty trace run, timeout, checker failure or state/effect mismatch can yield a passing verification result. | Connector runner plus Hapsland wrapper, positive controls, action coverage manifest and mutation tests. |

Supported finite scenarios can establish these properties for the exercised cases. Proving the strongest reading for arbitrary filesystem/JS behavior requires additional assumptions or enforcement. SEC-INGRESS must report a gap until the early-discard boundary is implemented and observed; receiving host-provided bytes is outside a no-filesystem-read guarantee.

### Request and sink schemas

At the encoded provider request, allow exactly `{model, state, questions}`. The state contains exactly `artifact`, `evidence`, `inputContract`; enumerate and validate their nested schemas rather than relying on permissive object matching. The artifact contains the eligible path and root source. Evidence carries only the declared graph/artifact records. Questions exactly match enabled applicable rule IDs and their approved Noul instructions/criteria. Pin the provider cohort and detect schema changes on upgrades.

The configured Jev credential is permitted only in the required authentication transport field to the authorized destination. It is not permitted in state/questions, disk diagnostics, host responses or retained evidence. Check redirects explicitly; receiving an HTTP redirect must not silently authorize another source recipient. Ordinary host/runtime transport metadata may be allowed only through a documented schema, not arbitrary extra fields.

| Sink | Initial candidate allowance |
| --- | --- |
| Jev request | Authorized unit plus selected rules and enumerated metadata; authentication scoped to approved endpoint |
| CLI/resident memory | Bounded transient source necessary for capture/review; no physical erasure claim |
| Local IPC ingress | Necessary eligible patch observation; excluded text should be removed before admission under SEC-INGRESS |
| Host response / IPC response | Exact finding/notice schema, including permitted path/declaration/rule/message/probability; no arbitrary captured source or provider error |
| Consent/activity/owner/diagnostic files | Enumerated metadata fields and configured approved paths; no arbitrary exception text or source |
| stderr/stdout | Declared protocol or bounded sanitized diagnostic output; no raw source-bearing causes |
| Native capture helper pipe | Authorized captured source only to its parent; profile-specific read witness required |
| Demo/test files | Separate explicit fixture/demo profile; cannot be used to justify a blanket production persistence claim |

### Ordering semantics and freshness

For the first prototype, a test writes a valid replacement policy or revokes consent, waits for that operation to complete, and only then releases the dispatch authority-read barrier. The ensuing dispatch must observe that change and reject excluded/revoked work. Recheck after any deliberately gated credential-resolution wait if the contract places authorization after that wait.

This does not claim that an arbitrary external config-file edit racing after the final read can cancel an already authorized transport operation. Re-reading an epoch alone does not make check-and-send atomic. Stronger global revocation requires a shared authority owner or lock covering updates and dispatch, with all writers participating; independent editor writes do not satisfy that assumption. Document the read and handoff points in the effect journal.

Prepared artifacts are bound to their captured identity and permitted fragments. This contract does not silently add a requirement to reread the latest file at dispatch: that would introduce new reads and ordering questions. If current-file freshness is desired in addition to authorization, specify it separately. Root replacement/identity invalidation remains subject to the existing containment gate.

### Independent expected results

For concrete fixtures, hand-author allowed spans and graph edges, exact authorized rule text and the expected decoded request shape. Use unique synthetic markers plus full equality/allowlist checks. Markers alone are insufficient; deriving expected payloads with the production analyzer or payload builder is circular. Include non-ASCII text to ensure span indexing/encoding assumptions are tested. Existing analyzer objects carry source strings rather than a complete span-provenance certificate, so production provenance records would be a future code change.

The abstract model uses independent fragment identities. The driver derives observations from actual effects and maps them to those identities only after concrete matching. Unexpected or unclassifiable data fails the mapping; it must not be discarded as irrelevant. Comparing the model's intended action with the driver's requested action is not an effect observation.

Evidence for this contract: [payload feasibility](formal-security-payload-feasibility.md) and [source/sink feasibility](formal-security-sinks-feasibility.md). Their current-code claims are SRC/SOURCE-INSPECTED except explicitly retained analyzer probes; these invariants are proposed requirements, not runtime conclusions.

## Connector integration and concrete entry points

The [connector investigation](formal-security-connector-feasibility.md) establishes an RC.116 compatibility candidate in `/workspace/typescript/quint-connect-rc116-investigation`, branch `agent/effect4-rc116-investigation`. It is uncommitted and unpublished. Build/typecheck, 40 targeted tests, packed-consumer smoke and four package-contract checks passed. Exact Effect RC.116 pins and peer resolve one Effect cohort; detailed environment and evidence limits are in the note. Its packed smoke is connector-local; importing and executing a real Hapsland driver remains part of the prototype.

Use `@firfi/quint-connect/effect` with `defineDriver`, `quintRun`, `stateCheck` and driver `getState`. Require fresh fixture state per trace, a pinned `quintBin`, seed, actual trace/action counts and mandatory post-action state/effect comparison. Compare initial state as well; do not allow an initial-state mismatch to vanish because no action ran.

The connector currently skips an unmapped action named `step`, and initial empty metadata can be skipped. For the security gate, add strict replay validation or a wrapper that rejects unexplained action omissions, and require observed execution of meaningful named actions. Merely renaming model actions does not detect a generator unexpectedly reporting `step`. Zero generated traces fail in the connector, but a positive trace count alone does not prove useful work occurred.

| Layer | Concrete production path | Observation and missing work |
| --- | --- | --- |
| Fast concrete payload/read driver | `prepareObservation` → `eligibleNamedPath`/`captureStable`/`analyzeTypeFile` → `evaluatePrepared` | Existing `captureHooks.sourceRead` and controlled `DecisionModel.inspectRequest` provide preliminary signals; use the real provider with recording HTTP transport for encoded-body claims. |
| Queued authorization witness | `makeResidentDispatchContext` → `admitObservation` → resident preparation/queue/evaluation → `collectReady` | Deterministic preparation/evaluation barriers exist. An `inspectRequest` function is omitted by IPC serialization, so it cannot observe resident requests across process boundaries. Add a serializable effect witness or process transport observation. |
| Package/effect witness | Installed CLI/resident and platform-specific capture helper | Observe all source read/send/write/output attempts in scope; report uncovered native/dependency effects as gaps. |

The existing legacy `ReviewBackend`, `SnapshotReader` and `ReceiptStore` ports are not substitutes for the direct-event route above. Reusing them would create a test that can pass while the supported resident route differs.

Prefer intercepting the actual installed provider HTTP client while preserving the logical approved Jev URL. A loopback receiver is useful only with a documented transport redirection seam; do not relax production consent/destination checks merely to reach it, then infer endpoint enforcement from that run. If the resident provider construction cannot accept an observer yet, that injection seam is a named prototype change, not assumed existing capability.

## Proposed finite model and abstraction

Use a small authorization state machine, not a model of the TypeScript parser or OS. Suggested state: repository identity, effective policy revision, consent state, credential authority, jobs with prepared artifact identities, permitted fragment sets, destination, phase and a bounded observed-effect journal.

Initial exploration bounds are proposals to measure, not established coverage sufficiency:

| Dimension | Initial bound |
| --- | --- |
| Repository identities | 2, for cross-repository consent isolation |
| Named candidate paths | 2 per repository: eligible and excluded; outside-root/symlink cases in concrete fixtures |
| Configuration states | 2 revisions, one strictly more restrictive |
| Consent/credential states | Granted/revoked and present/unavailable |
| Prepared jobs | 2, allowing one queued job while another is active |
| Abstract source fragments | Root, permitted reference, unrelated fragment |
| Remote outcomes | Success, failure, timeout |
| Trace length / generated scenarios | At most 20 actions / 200 seeded traces in the first measured run |
| Checker resource budget | 120 seconds per bounded configuration; incomplete exploration is inconclusive |

Suggested actions: configure, grant, revoke, observe edit, prepare, enqueue, dispatch attempt, provider outcome, collect, restart. Do not require denied actions to be enabled only when permitted: the harness must attempt excluded reads and denied dispatches and observe zero unauthorized effects. Actual sink events are observations, never fabricated from the driver's chosen action name.

Keep counters and journals finite. Separate exhaustive finite-state exploration, bounded checking and randomized simulation in reported results. Record reachable/visited states or checker bounds when available; “200 traces passed” is not exhaustive coverage. A fixed-depth run without a counterexample cannot be presented as an inductive proof.

Concrete fixtures cover parser grammar, exact strings, path aliases, filesystem races and serialization. The abstraction mapping must preserve repository, path/artifact identity, applicable authorization revision, fragment membership, destination, sink type and operation order. Dropping a field needed to detect an unauthorized effect invalidates the corresponding claim.

## Proposed observation record

During offline execution, retain actual synthetic request/file/output bytes in the ephemeral harness so they can be compared. Durable evidence uses an allowlisted record:

- Code revision and dirty diff identity, package digest, dependency/tool/runtime/platform versions.
- Contract/model identity, fixture identifiers, seed, action sequence and declared bounds.
- Observer identity and coverage, attempted-effect counts, decision classes and invariant outcomes.
- Fixture-local repository/artifact/fragment identifiers and the authorization ordering used.
- Overall verdict and replay instructions; source-free failure category when a check fails.

Do not persist real source, credentials, HTTP bodies, provider responses or arbitrary exception strings in CI evidence. Seed plus versioned synthetic fixture IDs must suffice for replay. A redacted report alone is not evidence that the original effect was authorized; compare the actual bytes before reducing the report.

## Bounded implementation sequence

1. **Freeze contract and baseline:** adopt a named draft revision; inventory exact production entry points and observer coverage. Record expected failures rather than weakening properties to fit current behavior.
2. **Establish connector consumer:** pin compatible connector/Quint/Effect versions; demonstrate driver execution, state/effect mismatch failure, deterministic replay and rejection of empty/omitted action coverage in an isolated consumer.
3. **Connect one production route:** drive actual preparation and resident dispatch with synthetic files and an offline HTTP observer. Add only the narrow injection seams needed to preserve the production extraction/provider path.
4. **Add the model:** implement the finite actions/invariants and mandatory state/effect comparisons. Run explicit scenario traces before generated exploration.
5. **Prove gate sensitivity:** run the selected deliberate bypass mutations in an isolated tree. Require baseline passes and relevant mutated cases fail with the expected reason; compilation failure alone is not a successful security detection.
6. **Exercise package boundary:** repeat critical scenarios against the compiled installed artifact on the declared supported platform, including child stderr and disk/output observations.
7. **Evaluate permanent CI:** record runtime, coverage and failure diagnostics. Only then wire named required checks and release-artifact linkage; remote repository protection must be separately inspected/configured.

The prototype stops after these bounded acceptance checks and a gap report. It does not expand into other hosts, secret scanning, backend retention audits or a production-wide rewrite. If an observation boundary cannot detect a planted bypass, report that claim as unestablished and describe the smallest additional seam/containment needed.

## Mandatory scenario and mutation matrix

| Scenario | Expected observation | Deliberate violation that must fail |
| --- | --- | --- |
| Excluded candidate before preparation | No source-content read and no provider request for that path | Bypass configured exclusion before capture |
| Allowed declaration with unrelated source nearby | Only approved declaration/reference material in complete encoded request | Add sibling/whole-file text to any request field |
| Unsupported or unresolved extraction | No provider request for unsupported unit | Add whole-file fallback |
| Prepare, then commit stricter config, then dispatch | Queued excluded source is not sent under the adopted ordering contract | Omit dispatch-time path/payload reauthorization |
| Prepare, then revoke consent, then dispatch | No provider request | Omit consent recheck |
| Wrong repository or destination | No authorized submission | Reuse a grant across identities or alter endpoint |
| Backend failure with synthetic source in error | No unauthorized durable/output source | Write raw error/request to diagnostic or stderr |
| New source-bearing field or direct send/write | Observer rejects unauthorized effect | Add a sink outside the intended wrapper |
| Checker/driver empty output or omitted action | Gate is failed/inconclusive, never passed | Drop action mapping or return zero executed traces |

Positive controls are mandatory: an authorized fixture must produce the expected request and permitted metadata writes. A harness that suppresses all I/O must fail those controls. Negative observations need explicit completion/quiescence barriers; a short sleep followed by zero requests is insufficient evidence.

## CI and release integration constraints

The existing direct-event conformance manifest maps obligations to named tests. Its validator checks references/evidence shape; those checks are useful precedent but do not themselves execute or prove an obligation. Add a separate security contract manifest linking each invariant to model checks, concrete witnesses and mutations, with execution results tied to the same commit/artifact.

At inspection, the repository's visible workflow was `.github/workflows/macos-package-conformance.yml`, triggered manually or for a specific task branch. This does not establish universal PR security gates or required branch protection. Proposed permanent jobs must run on the intended PR/release events, reject missing evidence and incomplete checks, and gate the exact artifact being released.

Primary local evidence: [conformance manifest](../../conformance/direct-event-v1.json), [manifest validator](../../scripts/validate-direct-event-conformance.mjs), [package workflow](../../.github/workflows/macos-package-conformance.yml). Classification: SRC / SOURCE-INSPECTED; no workflow or remote-protection check was executed in this investigation.

## Completion state and next action

The three feasibility investigations and this contract/plan are complete. Hapsland production code was not changed; twelve synthetic analyzer probes were executed and retained. The connector compatibility change exists only in its isolated worktree. No live Jev request was made.

The next implementation action is to freeze this candidate contract, connect a production direct-event/resident harness to independent payload and effect observers, and reproduce the queued-exclusion scenario offline. Then implement the small Quint model and strict connector driver against that same harness, followed by the bounded mutation and package checks above. The model, driver, queued-gap reproduction and required CI enforcement are still pending.

Confirmed defects uncovered during implementation/reproduction must be filed in the Hapsland GitHub issue tracker under the user authorization in [the handoff note](FORMAL-SECURITY-INVESTIGATION.md#confirmed-bug-reporting-authorization). Distinguish defects against an established contract from proposed policy enhancements and retain sanitized reproductions.
