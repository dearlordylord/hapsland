# Configuration and rule specification

**Purpose:** Preserve the Phase F handoff and own the current rule-definition and configuration-composition decisions.
**Status:** Rule and configuration sections amended by the 2026-10-05 owner authorization; other Phase F milestone declarations remain historical.
**Authority:** Accepted product contract for current rule/configuration decisions. Later named contracts supersede historical input, consent, lifetime, and delivery decisions.
**Expected use:** Implement rule authoring and policy composition alongside the [current direct-review contract](docs/type-function-review-proposal.md) and [compatibility contract](docs/review-contract-compatibility.md).
**Lifecycle:** Update rule/configuration decisions after owner changes; review related contracts and generated guidance at the same time. Preserve historical milestone declarations as declarations made then, without treating them as present runtime claims.

The 2026-10-05 implementation authorization replaces the pack-oriented portions of
#220 and its #221–224 tasks with individual rule documents and root/context settings.
Historical GitHub issue text is not rewritten. The amendment below is the current
contract for those boundaries. The separate repository consent step was removed by
#132; the current direct-review contract replaces Phase F's full-file input.

## Problem Statement

The product now has an evidence-backed synchronous Codex review flow, but users still
have to edit implementation code to change most review behavior. They cannot reliably
share repository policy, add local declarative rules, inspect why a file was excluded,
or distinguish an inactive integration from a healthy headless review run.

Source is sent to an external review backend and may be proprietary. Installation or
repository-controlled configuration must not silently grant that permission. Users also
need reproducible tests describing how rules combine and empirical evidence that the
rules' actual judgments match their intended meaning.

## Solution

Deliver Phase F: JSONC project/user configuration, explicit repository/backend consent,
local declarative rules, configuration explanation, operational diagnostics, and
session review receipts. Preserve the synchronous, strictly advisory behavior established
by issue #1. Make these behaviors usable through the existing process command boundary
and small configuration/status operations without changing the Codex adapter for each rule.

Provide a sturdy rules test suite built around a shared fixture/scenario/observation
model. Ordinary tests exhaust important small combinations and generate broader cases
offline. Separately, explicit live milestones evaluate synthetic positive/negative
examples and isolated-versus-batched judgments. Quint and quint-connect-ts remain future
validation work, not dependencies or implementation requirements of this issue.

## User Stories

1. As a repository owner, I want review settings in one root configuration, so that collaborators share a readable policy.
2. As a user, I want personal defaults across repositories, so that I do not repeat settings everywhere.
3. As a user, I want JSONC comments, schema validation, and editor completion, so that configuration is understandable and mistakes are discoverable.
4. As a user, I want omitted fields to inherit predictably, so that small project configurations remain useful.
5. As a repository owner, I want project review settings to override ordinary user defaults, so that the project can select its intended rules and thresholds.
6. As a user, I want my consent and privacy restrictions protected from project overrides, so that repository changes cannot silently authorize source disclosure.
7. As a user, I want an explicit enable operation identifying the repository and review destination, so that I understand what I am approving.
8. As a user, I want approval remembered separately for each repository/backend/destination, so that returning to an approved backend does not prompt again.
9. As a user, I want a disable operation to revoke approval, so that I can stop subsequent source transmission.
10. As a user, I want repository approval to cover its eligible files, so that ordinary file-selection changes do not create repeated consent prompts.
11. As a user, I want missing approval reported, so that an installed but inactive integration does not silently appear functional.
12. As a headless user, I want hooks never to wait for interactive consent, so that automation cannot hang on a prompt.
13. As a user, I want credentials supplied through an environment-variable reference, so that secrets are not stored in shared configuration.
14. As a user, I want inspection to report credential presence without its value, so that diagnostics remain safe to read and share.
15. As a user, I want project include lists to replace inherited selection, so that each repository can describe its source layout.
16. As a user, I want exclusions to accumulate across layers, so that project includes cannot undo a privacy exclusion.
17. As a user, I want omitted and empty lists distinguished, so that selecting no files is explicit rather than surprising.
18. As a user, I want matching rooted at the working-tree root, so that invoking the hook from a subdirectory does not change policy.
19. As a user, I want a command explaining inclusion/exclusion and origin, so that I can understand why a particular file is reviewed or skipped.
20. As a user, I want overridden include lists distinguished from effective ones, so that inspection accurately describes the policy that ran.
21. As a user, I want explanations to use the same resolved configuration as review, so that debugging does not describe a different algorithm.
22. As a rule author, I want an individual declarative rule containing its question, criteria, supported inputs, threshold, and message, so that I can add checks without executable plugins.
23. As a repository owner, I want to commit rule documents with configuration, so that collaborators can inspect and reproduce definitions and policy.
24. As a rule author, I want a stable rule ID and content digest independent of file placement, so that findings and evaluations remain traceable.
25. As a user, I want duplicate identities and unknown inherited references rejected, so that load order cannot silently replace a rule.
26. As a user, I want explicit connection to activate a rule by default, so that saving a file alone never changes review behavior.
27. As a user, I want per-rule enable/disable controls, so that I can reduce review scope deliberately.
28. As a user, I want the editable Hapsland default rules available after authorized setup, so that the first configurable version retains a useful baseline.
29. As a user, I want rule-specific paths and language restrictions in configuration, so that deployment policy stays separate from the rule definition.
30. As a user, I want rule-specific selection unable to expand global root scope or intrinsic input support, so that configuration cannot invent evidence capabilities.
31. As a rule author, I want advice text defined with the rule, so that a reported judgment has an intentional explanation.
32. As a repository owner, I want to override advice messages and thresholds locally, so that feedback fits the project without changing the rule's question.
33. As a user, I want an invalid selected configuration to stop review with a precise error, so that the product does not silently substitute another policy.
34. As a user, I want review errors to preserve the completed edit, so that configuration never becomes an edit gate.
35. As a user, I want timeout, concurrency, advice budget, and transient retries configurable, so that I can control waiting and review activity.
36. As a user, I want missing consent, misconfiguration, missing credentials, and outages to use a consistent diagnostic vocabulary, so that failures are actionable.
37. As an interactive user, I want a visible warning on a new problem, so that I do not have to infer health from the agent's prose.
38. As a user, I want repeated identical warnings suppressed per session and recovery announced once, so that diagnostics remain useful without becoming noise.
39. As a headless user, I want a local session receipt showing observed review activity, so that I can determine whether this run actually performed reviews.
40. As a headless user, I want reviewed, skipped, unavailable, and incomplete activity distinguished, so that a missing record or all-skipped run cannot look like successful backend review.
41. As an automation author, I want human-readable and JSON status output for an explicit session, so that I can inspect results without making another paid call.
42. As a user, I want receipts and routine diagnostics to omit source, secrets, and individual paid responses, so that observability does not create a second sensitive-data store.
43. As a maintainer, I want a shared model of fixtures, expectations, scenarios, observations, and comparisons, so that deterministic and semantic tests describe the same rules precisely.
44. As a maintainer, I want an exhaustive small selection matrix, so that activation, consent, inclusion, and exclusion combinations are specified rather than assumed.
45. As a maintainer, I want property-based tests for composition laws with replayable counterexamples, so that broad configuration spaces receive meaningful coverage.
46. As a maintainer, I want exact probability and threshold boundary cases, so that equality, zero, one, and malformed answers behave predictably.
47. As a maintainer, I want batching, budget, ordering, concurrency, timeout, stale-result, and duplicate-delivery combinations tested, so that adding rules does not break orchestration.
48. As a maintainer, I want tests at the real JSON subprocess boundary, so that fixtures exercise the product path users invoke.
49. As a rule author, I want synthetic positive and negative examples with explicit rationales, so that the intended meaning of a rule is reviewable.
50. As a rule author, I want isolated and batched judgments compared on identical fixtures, so that interactions between rules become visible.
51. As a maintainer, I want semantic expectations separated from transport availability and deterministic correctness, so that one passing dimension does not conceal another failing dimension.
52. As a maintainer, I want semantic evaluations explicitly budgeted and separate from ordinary tests, so that test runs do not unexpectedly send source or incur charges.
53. As a maintainer, I want definition and fixture digests as well as version labels, so that silently edited local content cannot reuse stale evidence.
54. As a future verification author, I want explicit states, actions, identities, and observations, so that later Quint-based conformance work can reuse this model.
55. As a product owner, I want deferred directory consent, remote distribution, release installation, async review, and additional hosts kept separate, so that Phase F stays bounded.

## Implementation Decisions

- Milestone input decision (2026-09-20): Phase F proceeds with the existing full post-edit file plus repository-relative path as backend artifact context. This is a provisional milestone contract, not the permanent product model. Declaration extraction and bounded referenced context are deferred parallel research and do not block this issue. The completed feasibility result is conditionally accepted, while issue #16 separately tests whether declaration-oriented inputs improve semantic quality enough to justify production architecture work. Rule-author documentation must describe the available evidence: the current input does not supply a before/after diff, task/transcript context, or other files, and findings can concern pre-existing content. Do not promise support for questions requiring missing evidence. Any future input/context expansion requires an explicit contract, consent/egress review, and updated evaluation fixtures. See [the prototype assumption audit](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-PROTOTYPE-ASSUMPTION-AUDIT-2026-09-19.md).
- Scope is the existing plan's Phase F plus the diagnostic/status and rules-test capabilities explicitly selected during the interview. Issue #1 supplies the B–E baseline; this issue does not restart or replace that implementation.
- Hapsland is the product; Jev is the review backend. Agent-host identity and model-provider metadata remain separate. Findings are locally derived evidence and messages; host advice is their delivery representation. Probabilities are not permission decisions or generic confidence scores.
- Preserve TypeScript, strict boundary decoding, and the exact matched Effect 4 stable cohort currently selected by project policy: 4.0.0. Use Decision.probability, DecisionModel, and ai-typesafe for the live Jev integration.
- Prefer extending the existing configuration/policy, snapshot, backend, orchestration, adapter, and process-command responsibilities. Add configuration provenance, consent, and session observation storage at their owning boundaries. Do not build a general policy engine, daemon, or rule-specific host adapters.
- Use version-one JSONC for configuration and individual rule documents. One file defines one rule. Unknown versions, fields, IDs, malformed values, duplicate identities, and unsupported enabled selected inputs fail configuration instead of being silently stripped. No pack schema, contentVersion, authored applicability, or minimumRung remains.
- Discover exactly one project configuration at the Git working-tree root, independent of the event's subdirectory. Nested configuration inheritance is out of scope. Resolve repository consent identity from the canonical local working-tree root; another checkout, moved root, or separate worktree does not inherit approval by repository name or remote URL. Outside a discoverable working tree, report unsupported/not configured without egress.
- Resolve ordinary review settings from built-in defaults through personal defaults to project settings. Omitted fields inherit. Explicit rule references merge by stable identity; per-rule fields resolve independently. Privacy and other user-owned settings retain their authority boundaries.
- The highest supplied includes or languages list replaces inherited selection; an explicit empty list selects nothing. Exclusions accumulate across layers and win. Rule-level fields follow these composition rules, then intersect global root selection and intrinsic input support.
- All source matching is repository-root-relative, independent of rule-file placement or invocation directory. Global includes/excludes select roots; contextIncludes/contextExcludes select supporting source, inheriting effective root file selection when omitted. Explicit context scope may admit related files without making them roots. privacyExcludes applies to every read and cannot be overridden. Negated re-inclusion is unsupported.
- Keep built-in exclusions narrow and explicit while preserving sensitive-file, repository-boundary, regular-file, generated/vendor, and size protections. Pattern syntax, dotfile/case/separator behavior, and the exact defaults must be documented and backed by fixtures before implementation completion. Do not automatically load Git ignore files or introduce additional exclusion namespaces.
- Preserve origin information during configuration resolution: supplying layer, configuration source, and field. Configuration explanation shows matching includes/excludes, overridden includes, and the final selection decision for a supplied path. It uses the same resolved policy as runtime and makes no backend request.
- Enable is an explicit user operation showing the repository, review backend, destination, and repository-wide eligible-source scope before recording approval. Disable revokes that approval for future dispatches. Neither repository configuration nor hook installation grants consent. Headless hooks never prompt.
- Store consent in user-owned state keyed by canonical repository identity, review backend identity, and actual destination identity. Previously approved combinations reuse approval. Bind consent to the destination actually used by the backend configuration; changing recipients cannot reuse an unrelated grant. Phase F does not require a new backend or endpoint-routing feature.
- A grant covers eligible source throughout its repository, including later files within that scope, subject to exclusions. Directory-scoped grants are deferred to issue #2. Revoke affects subsequent dispatches and cannot recall already transmitted source.
- Configuration contains an environment-variable reference for credentials; Jev defaults to TYPESAFE_API_KEY. Inspection may expose the variable name and presence, never its value. Do not automatically source environment files or store secrets in JSONC.
- Load explicitly referenced local rule documents only, including editable materialized defaults. Project references remain within the Git worktree; personal references may point to user-managed files. Resolve a path from its declaring configuration and retain that origin through inheritance.
- Each rule declares version 1 and a stable ID independent of its filename; safe namespace IDs such as team/domain-state are allowed. Configuration rules entries contain exactly one locator: path for a definition, or id for an inherited rule. Duplicate definition identities, unknown inherited references, and rebinding an inherited ID to another file are errors; forks use new IDs.
- Explicit connection enables a rule unless configured otherwise. Only when no configuration layer declares rules, authorized initial setup writes nine separate default rule JSON files into the personal defaults directory and explicitly connects them. An explicit rules field, including [], is authoritative: repeat setup does not add or reconnect defaults. Existing rN_* identities remain stable. No unconditional embedded loader or replacement of missing connected files remains; repeated setup preserves authored files.
- Rule definitions contain a binary question, criteria, optional title, default threshold/message, and inputs. Each input lists distinct nonempty languages, kind, and distinct required evidence in requires. An empty requires list is valid and adds no evidence requirement beyond supported root extraction; it does not establish full dependency evidence. Current combinations are type for TypeScript/Rust/Bend and function for TypeScript. Duplicate combinations fail validation. Enabled inputs selected by configured languages must use supported combinations and requirements. Disabled rules may retain unsupported schema inputs for future use, and a multi-input rule may explicitly select a supported language subset; neither grants schema execution support. Runtime schemas need a distinct input kind and supported dialect/extraction contract before evaluation; concrete values remain unsupported roots. There is no evidence-rung ordering.
- Personal/project rules references may set enabled, languages, includes, excludes, threshold, and message. Paths belong exclusively to configuration. Per-rule languages must be a subset of authored languages; an extra language fails configuration. Within this boundary settings narrow intrinsic input support. Question/criteria edits belong to the rule document. Definition and effective-policy digests capture changes without content-version labels. Advice is local authored text with rule identity and available result metadata; no extra model call generates it.
- Preserve the strict probability-greater-than-threshold reporting rule. Probabilities and thresholds are finite within the inclusive zero-to-one range. Reporting policy is independent of empirical fixture expectations. Unrelated rules are not combined into a weighted quality score.
- For this milestone, batch all selected questions for one eligible file into one logical DecisionModel operation per attempt, with independent bounded-concurrency file reviews. This preserves the implemented baseline without making it a universal rule-pack limitation. Preserve its regression coverage until an explicit replacement contract is specified. Combine findings into one stable, budgeted response; asynchronous completion or object-key order must not change final ordering.
- Runtime defaults remain a 1,000 ms per-file deadline including retries, four concurrent file reviews, five advice items per edit, and at most two transient retries beyond the initial attempt. Expose these settings, retain a fixed retry-backoff algorithm, validate finite bounded values, and document host-hook timeout compatibility. Retries never replay host edits. These controls are not a monetary spending guarantee.
- Validate the effective selected configuration before source egress. Invalid configuration stops review for that invocation with the offending source/field identified; do not run a valid subset, substitute a default policy, or reverse the completed edit. Missing consent, exclusions, review unavailability, and a successful review with no findings remain distinct.
- Capture the effective configuration for an event so concurrent configuration edits cannot mix policies within it. Check consent at dispatch and snapshot identity before delivery. Document the sampling checkpoints; do not claim that changes after a checkpoint retroactively cancel transmitted requests or freeze files.
- Use a common bounded diagnostic vocabulary for missing consent, invalid configuration, missing credentials, outages, and recovery. Diagnostic text explains consequence and remedy without provider error dumps, source, or secret values.
- Notify once per session for each distinct problem; notify on a changed problem and once on recovery. Key suppression by session/repository/backend and stable problem identity rather than volatile request IDs or timestamps. Concurrent files experiencing one outage must not emit duplicate warnings. Outcomes remain recorded when repeated notifications are suppressed.
- In pinned Codex 0.155.1, systemMessage is the candidate user-visible TUI diagnostic channel; additionalContext remains agent-facing context. Source inspection supports TUI warning rendering but finds headless message omission. Do not promise automatic headless diagnostic visibility or rely on the model repeating a warning. Verify the TUI channel in a targeted runtime probe.
- Provide a human-readable/JSON status operation for an explicit host session. Keep current configuration readiness distinct from observed review activity. Identify resumed sessions consistently with the host-provided session identity; document that a receipt covers that session's observed activity rather than inventing independent run boundaries.
- Keep a small local session receipt containing observed event/review completion, reviewed/skipped/unavailable/incomplete counts, times, and bounded diagnostic categories. Observed start without completion remains incomplete. Missing receipt means no observed activity; an all-skipped session explains its reasons rather than reporting successful backend review.
- Receipt/status operations make no paid call. Receipts omit source text, credentials, advice text, raw paid responses, and individual paid probability snapshots. Coordinate concurrent writers and duplicate events so counts are accurate. Corrupt or unwritable state must expose an observation limitation rather than fabricate success. Use bounded retention with a documented policy.
- A receipt proves only the activity observed by the review integration. It cannot prove every host edit was intercepted or that the overall agent run succeeded. Preserve the existing unsupported-write and host-mode limitations.
- Extend the existing JSON process boundary deliberately. Qualified rule IDs, receipt identities, or new outcome metadata must not silently change an existing version's meaning; preserve compatibility or introduce an explicit version migration with fixtures and documentation.
- Define semantic evaluation through fixture, rule-definition, expectation, configuration-case, scenario, observation, comparison, and run entities. Track actual content digests alongside names/versions. Fixture domain/path context remains stable within a comparison.
- Expectations are human-authored and include rationales. Missing expectations mean unchecked, not clear. Live observations are not ground truth. Distinguish deterministic conformance, transport availability, semantic acceptance, and combination coverage in reports.
- Semantic scenarios include isolated rules, the full enabled batch, and named related-rule interactions on identical synthetic fixtures. Use qualitative bands or explicit justified intervals; do not require exact live probability equality. Plan repetitions, tolerances, and maximum request counts including retries before a milestone, not after seeing results.
- Local semantic fixture/evaluation support must reuse the same rule definitions and live DecisionModel path. It does not create remote rule distribution, arbitrary executable generators, or automatic paid runs. Formal conformance work remains deferred, but scenario states/actions/observations should remain independent of Effect internals so later model checks can reuse them.
- Routine command names, schema field names, local storage layout, numeric upper bounds, and matcher/library choices are delegated implementation details within these behavioral constraints. Document them, preserve scope, and validate their externally observable behavior; they do not require another product interview.

### Editable rule management and unattended setup (#220, amended 2026-10-05)

- Personal defaults use one file per rule under ~/.config/hapsland/rules/defaults/, respecting XDG conventions. Personal custom rules use rules/custom; project custom rules use <Git root>/.hapsland/rules/custom. Placement does not activate a rule. Create makes a starting rule and connects it; its preview states both effects before writes.
- Inventory and details derive from definitions and effective configuration, include disabled rules and concrete paths, and warn when zero rules are enabled. Guided setup displays one inventory per invocation across selected clients. Minimal create/connect and enable/disable commands use explicit configuration scope without editor or classifier calls.
- Unattended setup suppresses prompts separately from application authorization. Its preview/digest/apply frontend reuses structured setup, resolves existing credentials without prompting or paid verification, and rejects stale saved plans. Setup defaults provisioning participates in that authorization and digest binding. See [installation workflows](docs/installation-workflows.md#unattended-setup) for command-derived options and templates.
- Rule, configuration, resident IPC and structured setup formats remain version 1. Noul denotes TypeSafe's probability result type. No pack identity, contentVersion, or legacy loading route remains in production.

## Testing Decisions

- The primary acceptance seam remains the real versioned JSON subprocess command established in issue #1. Temporary project/user configuration, consent state, local rule documents, fixture files, and a controlled DecisionModel supply inputs; assert emitted results, source-request selection, advice, hashes, provenance, receipts, and unchanged completed edits. Configuration/status operations are tested through the same CLI boundary.
- Supplement that seam only where needed: pure component tests for exhaustive/generated composition laws, deterministic Effect tests for scheduling/failure semantics, isolated real-host probes for host-owned delivery, and explicit live semantic milestones. Do not substitute internal layer-construction assertions for behavior.
- The existing subprocess, controlled DecisionModel, policy, exact assessment, timeout, stale-snapshot, concurrency, deduplication, and live migration tests are prior art. Their current passing status is a baseline, not evidence that Phase F's new configuration combinations are already covered.
- Exhaust bounded combinations of activation, global and per-rule root selection, and exclusions. Independently cover intrinsic/configured language intersection, supported input kinds, context selection, privacy denial, and missing required evidence. State the axes actually covered; the retired pack-enabled axis is not a product setting.
- Maintain readable cases for a disabled rule, rule scope outside global roots, inherited versus empty lists, duplicate IDs, invalid selected definitions, stable identity after file relocation, unsupported schema inputs, no applicable rule, and context-only files that never become roots.
- Generate valid bounded layered configurations directly. Use separate invalid generators for unknown fields/versions, malformed patterns/values, duplicate identities, and invalid references. Require reproducible seeds, counterexample shrinking, and named regression fixtures for discovered edge cases.
- Test exclusion monotonicity, include/language replacement, empty-layer inheritance, per-rule override locality, root/context separation, privacy denial across both roles, rule-scope intersection, stable meaning under object-key/pattern duplication, serialization roundtrips, and explanation/runtime agreement. Path-only inspection must not claim observed artifact kind or complete evidence. Layers do not commute.
- Test source-path semantics from root and subdirectory invocations, case/dotfile/separator behavior, similar directory prefixes, traversal, symlinks, explicit excluded hook paths, missing files, generated/vendor paths, and oversized/non-regular files. Exclusions must prevent backend dispatch rather than merely influence discovery.
- Test repository/backend/destination consent combinations, reused grants, disable/revoke, distinct working trees, and project attempts to supply or weaken user-owned approval/restrictions. No consent and invalid configuration produce zero source egress.
- Test credentials absent/present without network calls in ordinary runs; inspection shows presence only. Seed synthetic secret markers into errors/configuration test inputs and assert that protocol diagnostics, receipt output, and routine logs do not leak them.
- Add deterministic transport-contract tests using the actual Effect TypeSafe provider with a fake HTTP transport, not only a controlled DecisionModel. Assert the actual destination, authentication channel, and exact allowed serialized fields for the explicitly selected input contract. Use synthetic markers to detect accidental transcript/task context, unrelated file content, absolute local paths, environment dumps, and credentials in payloads or logs. Intentionally supplied rule questions/criteria and approved source context are egress too and must be accounted for. Changing the input contract requires updating these tests explicitly. A passing test establishes client transmission behavior, not server-side retention guarantees; no live or paid call is needed.
- Test exact requested rule keys, missing/extra keys at the product-owned assessment boundary, wrong answer kinds, non-finite and out-of-range probabilities, thresholds zero/one/equal/adjacent, message overrides, no-finding reviewed outcomes, and explicit skipped/unavailable results. Account for DecisionModel normalization rather than expecting invisible raw-provider extras downstream.
- Test zero/one/multiple rules and files, duplicate paths, one logical batch per eligible file per attempt, transient retries, deterministic ties, global findings budget, and completion-order invariance. Increasing the budget extends the same sorted candidate list; unrelated rule changes do not change another rule's candidate finding for a fixed assessment.
- Use controlled clocks/barriers for deadlines, retry backoff, concurrency, stale snapshots, and cancellation. Exercise the existing representative delay classes and boundaries of configured deadlines; do not use real sleeps as the ordinary scheduling oracle.
- Test notification traces from healthy to problem, repeated problem, changed problem, and recovery, including concurrent duplicate outage reports and independent session/repository/backend identities. Notification suppression does not suppress outcome evidence.
- Test session receipts with no observation, all skipped, clean reviewed/no findings, mixed reviewed/unavailable, incomplete events, concurrent updates, duplicate delivery, corruption, and write failures. Status must not make paid calls or infer success from configuration readiness.
- Runtime-test TUI diagnostic text using a synthetic isolated pinned-Codex probe; inspect headless status receipts independently of host warning output. Preserve exact version/mode provenance and distinguish documented, source-inspected, runtime-tested, and unknown behavior.
- Semantic fixtures include positive/negative examples, superficially similar negative controls, and documented ambiguous observations where hard expectations are unjustified. Evaluate rules alone and in full/named pair batches against identical source/domain context. Separate per-rule semantic failure, cross-batch band changes, transport unavailability, and unchecked cases.
- Existing Noul clear/violation conventions may seed explicitly declared empirical bands, but the test model must not call them truth guarantees or infer labels from current outputs. Declare repeat counts, tolerance, and release acceptance before running; do not silently weaken failed expectations afterward.
- Ordinary tests remain deterministic and offline. Live evaluation requires milestone opt-in and credentials, accounts for the remaining authorized cumulative call budget, and retains sanitized aggregate contract/quality/timing evidence only. The current user authorization is not an unlimited product-default allowance.
- The shared model defines identities, observations, and action sequences suitable for later formal work. Backend answers remain nondeterministic inputs to a future formal model; no formal claim can establish that a rule understands the source correctly.
- Completion requires the named combinations and laws to have executable coverage, the subprocess and diagnostic acceptance scenarios to pass, strict TypeScript and matched Effect dependency checks to pass, and live milestone evidence to state coverage and limits. A coverage percentage or the old test count is insufficient.

## Out of Scope

- Implementing or running the feature merely by publishing this specification.
- Directory-scoped consent, tracked separately in issue #2.
- Detecting shell/script-generated or otherwise unobserved writes, tracked as post-first-version research in issue #4. This is desirable if feasible, not a first-version requirement or a completion condition for this issue.
- Declaration extraction, bounded referenced context, and changing the review unit. The earlier declaration-extraction study remains advisory and deferred; this issue does not adopt its candidate dependencies or require its completion.
- Nested project configuration, executable rule plugins, remote rule fetching, registries, and automatic rule updates.
- Blocking, approving, denying, rolling back, or converting completed edits into permission requests. Source-egress consent authorizes backend transmission only.
- A daemon, persistent review queue, async cadence, debounce, replay worker, or universal interception of unsupported host writes. Local consent and bounded session observation storage do not imply those systems.
- Production installation, doctor/uninstall distribution flows, full coexistence certification, or release packaging from Phase G. The selected enable/disable, explanation, and status operations remain in Phase F.
- Automatic headless delivery wrappers or guaranteeing that an agent repeats hook diagnostics.
- Additional agent hosts, new review backends, general endpoint routing, Choice/Score results, aggregate quality scores, or localization below the reviewed file.
- Automatic environment-file sourcing, storing raw credentials in configuration, managed organization enforcement, and a monetary accounting/billing subsystem.
- Running semantic evaluations as ordinary tests, exhaustively paying for every rule subset, retaining raw paid responses, or treating live probabilities as deterministic golden snapshots.
- Implementing Quint or quint-connect-ts integration now, claiming model-checking coverage, or treating either as a Phase F dependency/completion gate.
- Updating CONTEXT.md, renaming the product, or modifying unrelated research work.

## Further Notes

- This is the historical Phase F successor to the completed, closed issue #1. Publishing it did not implement Phase F or complete the product roadmap. Issue #2 was closed after the target moved to file settings without a separate grant; issue #4 tracks later write-coverage research.
- Reconciliation on 2026-09-20 retains the approved actual-provider/fake-HTTP transport test and input-contract identity in evaluation evidence. No separate prohibition on source snapshot storage was adopted; source-free receipt requirements remain unchanged. Broader research findings do not silently add implementation requirements.
- This specification synthesizes explicit interview answers and the user's delegation of routine remaining decisions. It uses the accepted subprocess/conformance testing approach; no additional interview is required for those seams.
- Supporting documents: [rule combinatorics test specification](./PRODUCT-RULE-COMBINATORICS-TEST-SPEC.md) and [rule evaluation model](./PRODUCT-RULE-EVALUATION-MODEL.md). They record rationale and details; this consolidated task is the implementation handoff.
- Current target architectural decision: [ADR 0002 — accumulated file exclusions](./docs/adr/0002-accumulate-file-exclusions.md). The old repository-consent ADR was removed because the target uses file settings without a separate repository grant.
- The file-filter research remains advisory. It found no universal inheritance rule: TypeScript replaces lists, Git uses ordered overrides, and ESLint distinguishes ignore scopes. The product explicitly adopts include replacement plus accumulated exclusions to preserve the accepted privacy boundary; it does not claim standards compliance for that choice.
- Codex provenance: the tested 0.155.1 annotated tag object is 4e21628f9ec9ee656650cd2b62ef92225725b5ac, resolving to commit be2951ea34f0d295ed0becf97079f92fa5f6950e. Prior records calling the tag object a commit should be corrected when compatibility documentation is updated.
- Primary references: [Codex hook output](https://developers.openai.com/codex/hooks#common-output-fields), [pinned TUI rendering](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/tui/src/history_cell/hook_cell.rs#L270), [pinned headless JSON handling](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L467), [W3C permission-store precedent](https://www.w3.org/TR/permissions/#permission-store), [TypeScript inheritance](https://www.typescriptlang.org/tsconfig/extends.html), [ESLint ignores](https://eslint.org/docs/latest/use/configure/ignore), and [Git ignore rules](https://git-scm.com/docs/gitignore).
