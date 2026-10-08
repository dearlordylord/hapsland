# Hapsland architecture

**Purpose:** Give technical users a short map of review context, user control, and verification boundaries.
**Audience:** Prospective technical users; contributors, including coding agents; product and specification owners.
**Status:** Active architecture explanation; public copy remains subject to editorial review.
**Authority:** Maintained explanatory guidance. The linked accepted contracts own product behavior; this page introduces no new guarantees.
**Expected use:** Understand what can leave the repository, why context is structured, and which guarantees have executable evidence.
**Lifecycle:** Update alongside changes to review inputs, file policy, reducer authority, provider routing, or runtime ownership. Review before public publication and whenever one of those boundaries changes.

Hapsland helps a coding agent revisit data-model and API decisions before more code builds on them. After an edit, it reviews the changed type or function together with related definitions, using built-in rules and rules you supply. The selected review backend evaluates the supplied code against rule questions. Hapsland chooses which code and rules can be sent, maps the result to configured feedback, and checks that feedback still applies to the current code.

Feedback follows the edit. It cannot undo that edit or guarantee that the agent repairs it. Optional stronger feedback depends on the agent runtime and user settings; see [feedback configuration](configuration.md#configuration-fields).

<!-- production-flow:start -->

```mermaid
flowchart TB
  observation["Agent edit"]
  admission["Admission #38; capacity"]
  sourcePending["Awaiting source read"]
  scheduling["Job scheduling"]
  preparation["Read #38; prepare source"]
  units["Review work items"]
  authorization["Jev ready check"]
  effect["Jev request attempt"]
  jev["Awaiting Jev result"]
  outcomes["Review outcomes"]
  advice["Ready advice"]
  collection["Advice collection"]
  delivery["Host output"]
  round["Round state"]
  observation -->|"Edit attempt or observation supplied"| admission
  admission -->|"observation admitted as source work"| sourcePending
  sourcePending -->|"source job scheduled"| scheduling
  units -->|"review job scheduled"| scheduling
  scheduling -->|"job scheduling status changes"| scheduling
  sourcePending -->|"source read phase entered"| preparation
  admission -->|"preparation admitted"| preparation
  preparation -->|"review unit admitted"| units
  units -->|"ready facts supplied"| authorization
  units -->|"work enters Jev phase"| jev
  authorization -->|"request command or observed start"| effect
  authorization -->|"request unavailable or never sent"| outcomes
  effect -->|"attempt observed"| jev
  effect -->|"attempt interrupted or failed"| outcomes
  jev -->|"review result supplied"| outcomes
  outcomes -->|"finding marked ready"| advice
  outcomes -->|"outcome recorded"| outcomes
  advice -->|"advice selected or leased"| collection
  collection -->|"wait, keep, or allow finish"| collection
  collection -->|"cancel work command"| preparation
  collection -->|"Stop decision"| round
  collection -->|"output authorized"| delivery
  delivery -->|"delivery phase recorded"| delivery
  delivery -->|"output fact changes round"| round
  round -->|"round retirement and release"| round
```
<!-- production-flow:end -->

## Recipient rounds and source roots

A recipient is an agent runtime/version, session and reliably identified child,
independent of cwd. Its first admitted eligible edit pins one physical Git working
copy for the virtual round. Settings, revisions, evidence and evaluation reuse
remain source-qualified. Other-root edits produce explicit skips before source
capture, without cancelling work or resetting allowances. Collection follows the
recipient from any cwd and renders target-identifying paths. Pre-edit policy
snapshots stay immutable through delivery; physical-root and dependency freshness
remain checked. See the [accepted advice contract](advicing-target-contract.md#advicee-identity-and-admission)
and [complete multi-root research #247](https://github.com/dearlordylord/hapsland/issues/247).

## Context follows code structure

Hapsland uses the local edit to find the changed type or function. It expands beyond the edited lines to the complete declaration, then follows local references to collect related definitions. The resulting tree marks references it could not include. Files, traversal work, and selected code have limits. The edit diff stays local; it is not sent to Jev. The request contains neither a whole file nor agent transcript, absolute path, or unrelated source. Related definitions provide context; they are not separate review targets. This makes questions about representable states and API relationships possible beyond the changed lines.

The tree still contains selected code. Structure provides focused context; it does not anonymize source or detect secrets embedded in declarations. Related definitions let rules examine relationships beyond the changed lines. This does not establish better judgment accuracy. See the [accepted input contract](review-contract-compatibility.md#review-input-and-result-identity) and [review profiles](type-function-review-proposal.md).

![Illustrative repair loop: an edit gains related code context, receives feedback, and is repaired and reviewed again](../assets/review-flow.gif)

## Built-in rules and rules you supply

Seven editable Hapsland default rule files supply probability questions about code design. Each rule declares language/input combinations and the evidence it needs. A rule runs only when those needs are met. An omitted reference can be irrelevant to one rule but necessary for another; an omission need not prevent every rule from running.

Each local JSONC document defines one rule with a stable identity. Configuration declares its path and selects activation, language and file restrictions, thresholds, and feedback messages. Rule settings narrow global root scope and intrinsic input support. Runtime validation schemas are a separate unsupported input form; they are not automatically treated as type declarations. See [rules and configuration](configuration.md#declarative-rules).

## The user controls the source boundary

Sending source to an external review service is a data-sharing decision. Hapsland controls which code enters its review requests; it does not set the review service’s data-retention policy. The user’s task prompt and conversation with the agent are not review inputs. Jev receives source definitions and rule questions.

Every file must pass repository containment, protected-path, Git-ignore, and capture checks before its source is read. Root files additionally pass global root selection and rule settings; supporting files pass context selection. Omitted context settings inherit root file scope, while explicit context settings may permit related files outside root scope. `privacyExcludes` applies to both roles and cannot be overridden. Exclusions accumulate across user and project settings; a user `excludes: ["**/*"]` leaves no review roots and turns review off.

With credentials available and no file settings, all otherwise eligible files are selected. There is no per-request approval prompt. Users should set an explicit source scope when they want a narrower boundary. Graph limits also bound files, reference depth, source reads, work, and encoded evidence; the default evidence-tree cap is 20 KiB. The cap limits code because the review model has a finite context window. Rule questions and provider overhead also occupy that window; they are outside the code-tree cap. This byte cap is not an exact measurement of model tokens.

Access exclusions and size limits act at different points. An excluded dependency is refused before its source is read. A dependency's source may already have been read when its contribution is found not to fit the evidence tree; that contribution is then omitted. A walkthrough must distinguish local reads from code included in the request.

Each edit retains its captured configuration and compiled rules; changing exclusions
affects later edit snapshots. The [edit-owned settings contract](review-contract-compatibility.md#edit-owned-settings)
owns that boundary. [Source freshness](review-contract-compatibility.md#freshness-and-result-reuse)
and [credential and handoff authority](advicing-target-contract.md#handoff-reoffer-and-continuation-count)
are rechecked independently. The [provider boundary and limit catalog](review-providers.md)
describe provider selection, model input constraints and unmeasured token budgets;
[configuration](configuration.md) describes the controls and precedence.

## Runtime ownership

Effect 4 services compose the resident, client, source preparation, backend evaluation, and host-output workflows. Each resident acquisition owns one shared state record: short synchronous commits publish the Bend state and matching native records together, while filesystem and network effects run outside those commits. Scoped fibers execute admitted work; process and host adapters enter the Effect runtime at their boundaries. Review integration uses provider-neutral `Decision` / `DecisionModel` with `@effect/ai-typesafe` for Jev, a Workers AI REST adapter for Cloudflare, and `Decision.probability` for probability rules.

Version-one resident requests and responses decode through Effect Schema. Requests use exact operation alternatives after size-limited JSON framing, with recursive excess-field rejection and structural identity, credential, collection, and coordinate bounds. The decoder rejects unsupported runtime identities, internal route fields on the wire, and finish decisions outside composed turn-end collection. Optional collection mode remains absent when omitted; runtime lifetime, authorization, credential generation, and canonical decisions retain their existing owners. Native patch commands must be strings, and unknown request fields are rejected rather than silently discarded.

An IPC connection owns its response context and provisional delivery lease. Shared review work belongs to the resident lifetime, so disconnecting a collector does not cancel another collector's evaluation. Cancellation stops further authorized work, but issued requests and capture workspace retain their accounting until native work physically settles. Shutdown waits for that settlement before releasing ownership artifacts. Claude edit feedback uses one admission-and-collection request with a deadline and immutable response authority; it retains no edit tickets or duplicate outcome registry. The [advicee contract](advicing-target-contract.md) owns the delivery rules.

Public lifecycle commands use Effect CLI in [`packages/administration/src/cli-command.ts`](../packages/administration/src/cli-command.ts); native hook arguments and their quiet parser belong to [`packages/hook-runtime/src/hooks/command.ts`](../packages/hook-runtime/src/hooks/command.ts). Parsing rejects unknown, repeated, missing, empty and conflicting arguments before reading stdin or dispatching a package. Help is generated from those declarations. Installed hook ownership markers are declared internal flags; hook help and argument failures remain quiet. JSON stdin decoding and protocol-specific output stay in their existing workflow owners, with the caller's configuration provider.

Credential resolution, save, and logout compose in the caller's Effect runtime and configuration provider. The pure serializable credential policy in runtime-inputs derives lookup and save plans. The credential owner coordinates file/native mutations and publishes a suspended generation before replacing a key or deleting the native item. Guided saving defaults to the user plaintext file and requires approval bound to a validated owner proposal; direct credential-stdin retains its native-save automation contract. The state lock remains owned until the helper physically closes, including after timeout or interruption; token checks prevent cleanup from deleting a successor's lock. Lock polling uses an Effect schedule, and persisted version-one state is decoded with Schema. CLI and resident process configuration preserve empty environment values so empty credential paths are rejected rather than replaced by defaults.

Installation mutations compose in the caller's Effect runtime and own a scoped generation lock. Cancelled waiters remove their unpublished owner records; completion releases the exact published owner. Retained generation links fence competing stale-owner reclaimers. Mutation plans, journal revalidation and rollback preserve unrelated configuration and incomplete-operation recovery.

The offline installed doctor composes its read-only resident probe with a timeout in the caller's Effect runtime and configuration provider. It does not launch a resident or issue provider review calls. Native observation failures carry operation labels rather than source or credential contents.

The explicitly selected first-review demo uses named Effect workflows for fixture preparation, claim consumption, host execution, observation and cleanup. A claimed preview owns a scoped cleanup capability. Native process timeout or interruption waits for callback settlement and physical closure before that scope removes the disposable root. Pending preview records remain available for explicit live selection or cancellation; their digest, owner marker and cleanup token fence execution and removal. Observation polling and elapsed-time measurements use Schedule and the caller's monotonic Clock. Budget expiry and persisted timestamps use epoch time.

## What verification establishes

Bend owns the production transition decisions through `Canonical.step`, including admission, rule eligibility, capacity, request permission, freshness-related transitions, and delivery authorization. The import-graph reducer orders traversal and checks budgets. TypeScript observes native facts and executes filesystem, parser, credential, network, and host-output effects.

General kernel-checked proofs cover import-graph budget properties and finite-event termination, plus named conditional progress properties. Canonical laws and independent traces check specific decision cases. These establish their declared properties under their premises; they are not an end-to-end proof that arbitrary process execution cannot leak data. Native enforcement has separate implementation and conformance evidence. A Jev judgment is also not a formal proof of the reviewed code's correctness.

The core has a formally checked exclusion case with no source-read command: [`import_graph_exclusion_has_no_read_command`](../packages/agent-flow-bend/LAWS.bend) and its [proof](../packages/agent-flow-bend/PROOF.bend). It proves the specified transition, not a universal confidentiality theorem. Separately, the [general tree-size laws](../packages/agent-flow-bend/import-graph-proof/LAWS.bend) prove that accepted size contributions stay within their cap under the stated premises. These are the precise meanings behind the README's qualified core-verification claim.

The [content laws](../packages/agent-flow-bend/README.md#content-isolation-proofs)
constrain the production Bend request-body projector used by both HTTP providers.
It selects only `model`, `state`, and `questions` from all supplied top-level fields
and constructs the outgoing body. Fresh compilation is compared with the imported
JavaScript artifact. These are selection/framing laws, not a history model or an
end-to-end confidentiality theorem. Source/rule provenance, the native JSON/ABI
bridge, compiler and transport remain outside the proof; wire and mutation tests
exercise these boundaries, inspection isolation and trace suppression.

See the [Bend package and proof scope](../packages/agent-flow-bend/README.md), the [reviewed TypeScript decision boundary](typescript-decision-boundary-ledger.md), and [installed compatibility evidence](installed-release-compatibility.md).

Deterministic simulation adds a separate layer of evidence. [monkey-business](../packages/monkey-business/README.md) runs the compiled policy reducers under a virtual clock with seeded workloads, generated import trees, synthetic failures, and exact replay. Tests cover request saturation, stale work, credential changes, uncertain output, expiry, and recovery within configured limits. Graph property tests check permissions and budgets at each graph frame. This simulates the core and environment; it does not execute the complete resident, real source capture, IPC, or Jev transport. Resource limits account for declared logical charges and native bounds, rather than proving a fixed process RSS ceiling.

## Inspect behavior rather than infer it from silence

An unsupported declaration, insufficient required evidence, unavailable credential, or refused admission can prevent review. Silence does not mean the code passed. [Status and doctor](status.md) explain observed activity and readiness without exposing source in diagnostics.

The [interactive architecture dashboard](../packages/agent-flow-viz/README.md) replays checked decisions and source-free import scenarios. It distinguishes action requests, established canonical events, policy decisions, observations, results, and output authorization. The canonical reducer emits all three output categories in one ordered stream; consumers retain that ordering rather than executing separate category streams. Its seeded simulation is an offline exploration tool; it does not monitor a live agent or call Jev, and simulated handoff does not establish that an agent used the advice.

## Compiler and executable ownership

This section records the current implementation structure for [issue #243](https://github.com/dearlordylord/hapsland/issues/243). It is maintained implementation guidance, not issue completion, a new product contract, or a platform/performance acceptance record. Package names and seams are implementation/reviewer choices; the linked contracts continue to own behavior.

Workspace manifests own dependencies, exact private exports, compiler hosts and entry surfaces. [`package-graph.mjs`](../scripts/package-graph.mjs) derives the structural model used by builds and the module views below. [`architecture-descriptions.json`](../scripts/architecture-descriptions.json) adds descriptions and selected contract/verification references; it contains no dependency inventory. `npm run docs:generate` regenerates both views; `npm run docs:generated:check` rejects drift.

Turbo schedules dependency-first private compilation from manifests. Production owners emit JavaScript/declarations into their own `dist`; the root publishes the installable release. Production deterministic tests remain under `src` and consume private exports. Auxiliary owners retain test, simulation and browser consumers without becoming production dependencies. Production owners cannot depend on auxiliary owners; the production runtime-dependency graph remains acyclic. Root conformance JSON owns fixtures and root release metadata owns the release.

<!-- architecture-modules:start -->

30 private workspaces: 23 production and 7 auxiliary owners.

Edges point from consumer to dependency and retain the manifest dependency field. External dependencies are omitted. Selected verification references identify checks to consult; they do not claim coverage or a passing result.

### Production owners

| Workspace and concept | Direct consumers | Workspace dependencies | Contracts and selected verification |
| --- | --- | --- | --- |
| [@hapsland/activity-observation](../packages/activity-observation/package.json): Source-free review activity, status, analytics and demo budgets | dependencies: `@hapsland/administration`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/hook-runtime`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/verification` | dependencies: `@hapsland/native-observation` | [Status contract](../docs/status.md)<br>Selected verification: src/activity/\{status,analytics,storage,demo-budget\}.test.ts |
| [@hapsland/administration](../packages/administration/package.json): Setup/update/repair, credential mutation, rule management, dashboard and evaluation command workflows | dependencies: `@hapsland/agent-flow-viz`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/doctor-entry`, `@hapsland/verification` | dependencies: `@hapsland/activity-observation`, `@hapsland/credential-storage`, `@hapsland/delivery-output`, `@hapsland/inspection-records`, `@hapsland/native-observation`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs`, `@hapsland/source-analysis`, `@hapsland/source-artifacts` | [Installation](../docs/installation-workflows.md); [rules](../docs/configuration.md#declarative-rules); [inspection](../docs/status.md#opt-in-local-inspection); [evaluation](../docs/evaluation.md)<br>Selected verification: src/onboarding, src/rules/cli.test.ts, src/evaluation |
| [@hapsland/agent-flow-bend](../packages/agent-flow-bend/package.json): Source-free canonical transitions, bounded import-graph decisions and request-content selection/framing compiled from Bend | dependencies: `@hapsland/agent-flow-viz`, `@hapsland/canonical-policy`, `@hapsland/monkey-business`, `@hapsland/review-execution`, `@hapsland/verification` | — | [Bend laws and proof scope](../packages/agent-flow-bend/README.md); authored abi declarations<br>Selected verification: producer receipt, compiler rejection tests, independent canonical/import-graph traces and request-content proof/wire mutation checks |
| [@hapsland/canonical-policy](../packages/canonical-policy/package.json): Checked Bend transition ABI, import-graph policy, limits and immutable decision records | dependencies: `@hapsland/agent-flow-projection`, `@hapsland/agent-flow-viz`, `@hapsland/build-tooling`, `@hapsland/canonical-defense`, `@hapsland/monkey-business`, `@hapsland/resident-runtime`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/runtime-inputs`, `@hapsland/source-analysis`, `@hapsland/verification` | dependencies: `@hapsland/agent-flow-bend` | [Decision ledger](../docs/typescript-decision-boundary-ledger.md); [Bend laws/proofs](../packages/agent-flow-bend/README.md)<br>Selected verification: canonical authority scripts and src/canonical |
| [@hapsland/cli-entry](../packages/cli-entry/package.json): Administrative command composition and installed CLI entry | — | dependencies: `@hapsland/activity-observation`, `@hapsland/administration`, `@hapsland/credential-storage`, `@hapsland/delivery-output`, `@hapsland/native-observation`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs` | [Installation](../docs/installation-workflows.md); [evaluation](../docs/evaluation.md)<br>Selected verification: src/cli.test.ts, src/cli-command.test.ts, installed CLI checks |
| [@hapsland/credential-storage](../packages/credential-storage/package.json): Native credential resolution/store transport and generation-lock lifetime | dependencies: `@hapsland/administration`, `@hapsland/agent-flow-viz`, `@hapsland/cli-entry`, `@hapsland/resident-runtime`, `@hapsland/verification` | dependencies: `@hapsland/runtime-environment`, `@hapsland/runtime-inputs` | [Credential configuration](../docs/configuration.md); [installation authorization](../docs/installation-workflows.md)<br>Selected verification: src/credentials/\{secret-service,secret-service-process\}.test.ts |
| [@hapsland/delivery-output](../packages/delivery-output/package.json): Feedback text and runtime-specific response encoding, including Claude stop authority | dependencies: `@hapsland/administration`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/hook-runtime`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-execution`, `@hapsland/verification` | — | [Advice contract](../docs/advicing-target-contract.md); [Claude authority](../docs/adr/0003-claude-direct-edit-blocking-authority.md)<br>Selected verification: src/feedback, src/direct-event/output.test.ts, Claude delivery checks |
| [@hapsland/doctor-entry](../packages/doctor-entry/package.json): Standalone read-only installed diagnostic composition | — | dependencies: `@hapsland/administration`, `@hapsland/runtime-environment` | [Status/doctor](../docs/status.md); [installed compatibility](../docs/installed-release-compatibility.md)<br>Selected verification: src/onboarding/doctor.test.ts, package doctor checks |
| [@hapsland/hook-entry](../packages/hook-entry/package.json): Standalone Bun native-hook process composition | — | dependencies: `@hapsland/hook-runtime`, `@hapsland/resident-transport`, `@hapsland/runtime-environment` | [Supported events](../docs/direct-event-v1-supported-profile.md); [installation](../docs/installation-workflows.md)<br>Selected verification: src/hook-main.test.ts, installed hook checks |
| [@hapsland/hook-runtime](../packages/hook-runtime/package.json): Quiet hook grammar, direct/composed execution and Pi subprocess transport | dependencies: `@hapsland/hook-entry`, `@hapsland/verification` | dependencies: `@hapsland/activity-observation`, `@hapsland/delivery-output`, `@hapsland/native-observation`, `@hapsland/resident-transport`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs` | [Advice contract](../docs/advicing-target-contract.md); [Pi](../docs/pi-installation.md)<br>Selected verification: src/hooks/command.test.ts, src/resident/composed-hook.test.ts, src/pi/installed-boundary.test.ts |
| [@hapsland/inspection-records](../packages/inspection-records/package.json): Private source-free inspection journal, recording and retained replay | dependencies: `@hapsland/administration`, `@hapsland/agent-flow-viz`, `@hapsland/build-tooling`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-execution`, `@hapsland/verification` | dependencies: `@hapsland/runtime-environment`, `@hapsland/runtime-inputs` | [Inspection contract #225](https://github.com/dearlordylord/hapsland/issues/225); [status](../docs/status.md#opt-in-local-inspection)<br>Selected verification: src/inspection recording/replay tests and inspection browser gates |
| [@hapsland/native-observation](../packages/native-observation/package.json): Native edit/session observations, attribution, source capture and file-access facts | dependencies: `@hapsland/activity-observation`, `@hapsland/administration`, `@hapsland/agent-flow-viz`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/hook-runtime`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/source-analysis`, `@hapsland/verification` | dependencies: `@hapsland/runtime-environment`, `@hapsland/runtime-inputs` | [Supported events](../docs/direct-event-v1-supported-profile.md); [input identity](../docs/review-contract-compatibility.md)<br>Selected verification: src/direct-event/\{adapter,selection-capture,edit-attribution\}.test.ts, file-policy checks |
| [@hapsland/parser-entry](../packages/parser-entry/package.json): Standalone constrained source-analysis worker composition | — | dependencies: `@hapsland/runtime-environment`, `@hapsland/source-analysis` | [Input contract](../docs/review-contract-compatibility.md); [supported languages](../docs/adding-language-support.md)<br>Selected verification: parser subprocess/security boundary checks |
| [@hapsland/pi-extension](../packages/pi-extension/package.json): Node-hosted Pi event translation and installed subprocess invocation | dependencies: `@hapsland/build-tooling`, `@hapsland/verification` | dependencies: `@hapsland/runtime-environment` | [Pi contract](../docs/pi-installation.md); [advice contract](../docs/advicing-target-contract.md)<br>Selected verification: src/pi/\{extension,installed-boundary,inspection-native\}.test.ts, native Pi runner |
| [@hapsland/resident-entry](../packages/resident-entry/package.json): Standalone resident lifetime/process composition | — | dependencies: `@hapsland/resident-runtime`, `@hapsland/runtime-environment` | [Advice contract](../docs/advicing-target-contract.md); [decision ledger](../docs/typescript-decision-boundary-ledger.md)<br>Selected verification: src/resident/subprocess.test.ts, lifecycle/reuse integration checks |
| [@hapsland/resident-runtime](../packages/resident-runtime/package.json): Resident admission, shared review scheduling, freshness, collection and state lifetime | dependencies: `@hapsland/administration`, `@hapsland/agent-flow-viz`, `@hapsland/build-tooling`, `@hapsland/resident-entry`, `@hapsland/verification` | dependencies: `@hapsland/activity-observation`, `@hapsland/canonical-policy`, `@hapsland/credential-storage`, `@hapsland/delivery-output`, `@hapsland/inspection-records`, `@hapsland/native-observation`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs`, `@hapsland/source-analysis` | [Advice contract](../docs/advicing-target-contract.md); [resources](../docs/review-resources.md); [decision ledger](../docs/typescript-decision-boundary-ledger.md)<br>Selected verification: resident server/capacity/collection/reuse/security tests |
| [@hapsland/resident-transport](../packages/resident-transport/package.json): Version-one IPC schema, client discovery/reuse and bounded request transport | dependencies: `@hapsland/administration`, `@hapsland/agent-flow-viz`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/hook-entry`, `@hapsland/hook-runtime`, `@hapsland/resident-runtime`, `@hapsland/verification` | dependencies: `@hapsland/activity-observation`, `@hapsland/delivery-output`, `@hapsland/inspection-records`, `@hapsland/native-observation`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs` | [IPC/advice contract](../docs/advicing-target-contract.md); [compatibility](../docs/review-contract-compatibility.md)<br>Selected verification: src/resident/\{protocol,client\}.test.ts, process lifecycle checks |
| [@hapsland/review-definition](../packages/review-definition/package.json): Editable rule/input definitions, compilation, settings snapshots and provider limits | dependencies: `@hapsland/administration`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/monkey-business`, `@hapsland/resident-runtime`, `@hapsland/review-execution`, `@hapsland/verification` | dependencies: `@hapsland/canonical-policy`, `@hapsland/native-observation`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs`, `@hapsland/source-artifacts` | [Rule/input contract](../docs/review-contract-compatibility.md); [configuration](../docs/configuration.md); [provider limits](../docs/review-providers.md)<br>Selected verification: src/rules, editable-rule/settings tests |
| [@hapsland/review-execution](../packages/review-execution/package.json): Review preparation, rule evaluation, provider effects and result explanation | dependencies: `@hapsland/administration`, `@hapsland/build-tooling`, `@hapsland/resident-runtime`, `@hapsland/verification` | dependencies: `@hapsland/agent-flow-bend`, `@hapsland/canonical-policy`, `@hapsland/delivery-output`, `@hapsland/inspection-records`, `@hapsland/native-observation`, `@hapsland/review-definition`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs`, `@hapsland/source-analysis`, `@hapsland/source-artifacts` | [Input/result contract](../docs/review-contract-compatibility.md); [provider contract](../docs/review-providers.md)<br>Selected verification: src/direct-event/\{pipeline,provider-http-wire,review-wire-contract\}.test.ts, src/jev-decision.test.ts |
| [@hapsland/runtime-environment](../packages/runtime-environment/package.json): Installed runtime coordinates, command/event catalog, bounded processes, clocks and process-role guards | dependencies: `@hapsland/administration`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/credential-storage`, `@hapsland/doctor-entry`, `@hapsland/hook-entry`, `@hapsland/hook-runtime`, `@hapsland/inspection-records`, `@hapsland/native-observation`, `@hapsland/parser-entry`, `@hapsland/pi-extension`, `@hapsland/resident-entry`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/runtime-inputs`, `@hapsland/source-analysis`, `@hapsland/verification` | — | [Installation](../docs/installation-workflows.md); [runtime bounds](../docs/installed-release-compatibility.md)<br>Selected verification: runtime catalog/package-layout, clock and process-role tests |
| [@hapsland/runtime-inputs](../packages/runtime-inputs/package.json): Read-only configuration, credential state/input, selectors and settings errors | dependencies: `@hapsland/administration`, `@hapsland/build-tooling`, `@hapsland/cli-entry`, `@hapsland/credential-storage`, `@hapsland/hook-runtime`, `@hapsland/inspection-records`, `@hapsland/monkey-business`, `@hapsland/native-observation`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/verification` | dependencies: `@hapsland/canonical-policy`, `@hapsland/runtime-environment` | [Configuration/precedence](../docs/configuration.md); [compatibility](../docs/review-contract-compatibility.md)<br>Selected verification: src/configuration, src/credentials/\{state,input\}.test.ts |
| [@hapsland/source-analysis](../packages/source-analysis/package.json): Language parsing, physical native parser bindings, related-definition resolution and constrained demo validation | dependencies: `@hapsland/administration`, `@hapsland/build-tooling`, `@hapsland/parser-entry`, `@hapsland/resident-runtime`, `@hapsland/review-execution`, `@hapsland/verification` | dependencies: `@hapsland/canonical-policy`, `@hapsland/native-observation`, `@hapsland/runtime-environment`, `@hapsland/source-artifacts` | [Input contract](../docs/review-contract-compatibility.md); [language ownership](../docs/adding-language-support.md)<br>Selected verification: analyzer/function/graph/language and demo-validation tests; scripts/native-bindings.test.mjs |
| [@hapsland/source-artifacts](../packages/source-artifacts/package.json): Dependency-free source-analysis artifact and reference/evidence data contracts | dependencies: `@hapsland/administration`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/source-analysis`, `@hapsland/verification` | — | [Review input identity](../docs/review-contract-compatibility.md)<br>Selected verification: analyzer, graph resolver, rule compiler and review-wire consumer tests |

### Auxiliary owners

| Workspace and concept | Direct consumers | Workspace dependencies | Contracts and selected verification |
| --- | --- | --- | --- |
| [@hapsland/agent-flow-projection](../packages/agent-flow-projection/package.json): Reducer-derived flow stages, record locations and evidence of accepted transitions | dependencies: `@hapsland/agent-flow-viz`, `@hapsland/build-tooling` | dependencies: `@hapsland/canonical-policy` | [Projection boundary](../packages/agent-flow-projection/README.md)<br>Selected verification: Projection typechecking and dashboard replay fixtures |
| [@hapsland/agent-flow-viz](../packages/agent-flow-viz/package.json): Public site, decision dashboard and visual presentation of checked flow evidence | — | dependencies: `@hapsland/administration`, `@hapsland/agent-flow-bend`, `@hapsland/agent-flow-projection`, `@hapsland/canonical-policy`, `@hapsland/credential-storage`, `@hapsland/inspection-records`, `@hapsland/monkey-business`, `@hapsland/native-observation`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`<br>devDependencies: `@hapsland/build-tooling` | [Visualization guidance](../packages/agent-flow-viz/README.md); [Dashboard rules](../packages/agent-flow-viz/DASHBOARD-RULES.md)<br>Selected verification: Dashboard replay fixtures and browser checks |
| [@hapsland/build-tooling](../scripts/package.json): Build orchestration, artifact publication, repository generators and verification harness adapters | dependencies: `@hapsland/verification`<br>devDependencies: `@hapsland/agent-flow-viz` | dependencies: `@hapsland/activity-observation`, `@hapsland/administration`, `@hapsland/agent-flow-projection`, `@hapsland/canonical-defense`, `@hapsland/canonical-policy`, `@hapsland/delivery-output`, `@hapsland/inspection-records`, `@hapsland/monkey-business-bend`, `@hapsland/native-observation`, `@hapsland/pi-extension`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs`, `@hapsland/source-analysis` | [Build ownership guidance](../docs/architecture.md#compiler-and-executable-ownership); [Check selection and evidence boundaries](../docs/testing-matrix.md)<br>Selected verification: Build tooling and harness focused tests |
| [@hapsland/canonical-defense](../prototypes/canonical-defense/package.json): Optional native teaching game and balance laboratory over a separate shared simulation engine instance | dependencies: `@hapsland/build-tooling` | dependencies: `@hapsland/canonical-policy`, `@hapsland/monkey-business`, `@hapsland/monkey-business-bend` | [Game proposal and evidence scope](../prototypes/canonical-defense/README.md); [Balance laboratory guidance](../prototypes/canonical-defense/lab/README.md)<br>Selected verification: Optional game and laboratory focused checks |
| [@hapsland/monkey-business](../packages/monkey-business/package.json): Source-free deterministic simulation API, seeded boundary facts and exact replay over checked reducers | dependencies: `@hapsland/agent-flow-viz`, `@hapsland/canonical-defense`, `@hapsland/verification` | dependencies: `@hapsland/agent-flow-bend`, `@hapsland/canonical-policy`, `@hapsland/monkey-business-bend`, `@hapsland/review-definition`, `@hapsland/runtime-inputs` | [Simulation API and evidence scope](../packages/monkey-business/README.md)<br>Selected verification: Simulation package tests and typechecking |
| [@hapsland/monkey-business-bend](../packages/monkey-business-bend/package.json): Shared source-free simulation state, virtual-time scheduler and review scenario driver | dependencies: `@hapsland/build-tooling`, `@hapsland/canonical-defense`, `@hapsland/monkey-business`, `@hapsland/verification` | — | [Shared engine and host obligations](../packages/monkey-business-bend/README.md)<br>Selected verification: Generated engine freshness and simulation boundary checks |
| [@hapsland/verification](../src/package.json): Deterministic product tests and cross-component conformance fixtures consuming private exports | — | dependencies: `@hapsland/activity-observation`, `@hapsland/administration`, `@hapsland/agent-flow-bend`, `@hapsland/build-tooling`, `@hapsland/canonical-policy`, `@hapsland/credential-storage`, `@hapsland/delivery-output`, `@hapsland/hook-runtime`, `@hapsland/inspection-records`, `@hapsland/monkey-business`, `@hapsland/monkey-business-bend`, `@hapsland/native-observation`, `@hapsland/pi-extension`, `@hapsland/resident-runtime`, `@hapsland/resident-transport`, `@hapsland/review-definition`, `@hapsland/review-execution`, `@hapsland/runtime-environment`, `@hapsland/runtime-inputs`, `@hapsland/source-analysis`, `@hapsland/source-artifacts` | [Testing matrix](../docs/testing-matrix.md)<br>Selected verification: Deterministic test and boundary suites |

### Workspace dependency graph

```mermaid
flowchart LR
  subgraph production["Production"]
    module0["@hapsland/activity-observation"]
    module1["@hapsland/administration"]
    module2["@hapsland/agent-flow-bend"]
    module7["@hapsland/canonical-policy"]
    module8["@hapsland/cli-entry"]
    module9["@hapsland/credential-storage"]
    module10["@hapsland/delivery-output"]
    module11["@hapsland/doctor-entry"]
    module12["@hapsland/hook-entry"]
    module13["@hapsland/hook-runtime"]
    module14["@hapsland/inspection-records"]
    module17["@hapsland/native-observation"]
    module18["@hapsland/parser-entry"]
    module19["@hapsland/pi-extension"]
    module20["@hapsland/resident-entry"]
    module21["@hapsland/resident-runtime"]
    module22["@hapsland/resident-transport"]
    module23["@hapsland/review-definition"]
    module24["@hapsland/review-execution"]
    module25["@hapsland/runtime-environment"]
    module26["@hapsland/runtime-inputs"]
    module27["@hapsland/source-analysis"]
    module28["@hapsland/source-artifacts"]
  end
  subgraph tooling["Tooling"]
    module5["@hapsland/build-tooling"]
  end
  subgraph verification["Verification"]
    module3["@hapsland/agent-flow-projection"]
    module4["@hapsland/agent-flow-viz"]
    module6["@hapsland/canonical-defense"]
    module15["@hapsland/monkey-business"]
    module16["@hapsland/monkey-business-bend"]
    module29["@hapsland/verification"]
  end
  module0 -->|dependencies| module17
  module1 -->|dependencies| module0
  module1 -->|dependencies| module9
  module1 -->|dependencies| module10
  module1 -->|dependencies| module14
  module1 -->|dependencies| module17
  module1 -->|dependencies| module21
  module1 -->|dependencies| module22
  module1 -->|dependencies| module23
  module1 -->|dependencies| module24
  module1 -->|dependencies| module25
  module1 -->|dependencies| module26
  module1 -->|dependencies| module27
  module1 -->|dependencies| module28
  module3 -->|dependencies| module7
  module4 -->|dependencies| module1
  module4 -->|dependencies| module2
  module4 -->|dependencies| module3
  module4 -->|dependencies| module7
  module4 -->|dependencies| module9
  module4 -->|dependencies| module14
  module4 -->|dependencies| module15
  module4 -->|dependencies| module17
  module4 -->|dependencies| module21
  module4 -->|dependencies| module22
  module4 -->|devDependencies| module5
  module5 -->|dependencies| module0
  module5 -->|dependencies| module1
  module5 -->|dependencies| module3
  module5 -->|dependencies| module6
  module5 -->|dependencies| module7
  module5 -->|dependencies| module10
  module5 -->|dependencies| module14
  module5 -->|dependencies| module16
  module5 -->|dependencies| module17
  module5 -->|dependencies| module19
  module5 -->|dependencies| module21
  module5 -->|dependencies| module22
  module5 -->|dependencies| module23
  module5 -->|dependencies| module24
  module5 -->|dependencies| module25
  module5 -->|dependencies| module26
  module5 -->|dependencies| module27
  module6 -->|dependencies| module7
  module6 -->|dependencies| module15
  module6 -->|dependencies| module16
  module7 -->|dependencies| module2
  module8 -->|dependencies| module0
  module8 -->|dependencies| module1
  module8 -->|dependencies| module9
  module8 -->|dependencies| module10
  module8 -->|dependencies| module17
  module8 -->|dependencies| module22
  module8 -->|dependencies| module23
  module8 -->|dependencies| module25
  module8 -->|dependencies| module26
  module9 -->|dependencies| module25
  module9 -->|dependencies| module26
  module11 -->|dependencies| module1
  module11 -->|dependencies| module25
  module12 -->|dependencies| module13
  module12 -->|dependencies| module22
  module12 -->|dependencies| module25
  module13 -->|dependencies| module0
  module13 -->|dependencies| module10
  module13 -->|dependencies| module17
  module13 -->|dependencies| module22
  module13 -->|dependencies| module25
  module13 -->|dependencies| module26
  module14 -->|dependencies| module25
  module14 -->|dependencies| module26
  module15 -->|dependencies| module2
  module15 -->|dependencies| module7
  module15 -->|dependencies| module16
  module15 -->|dependencies| module23
  module15 -->|dependencies| module26
  module17 -->|dependencies| module25
  module17 -->|dependencies| module26
  module18 -->|dependencies| module25
  module18 -->|dependencies| module27
  module19 -->|dependencies| module25
  module20 -->|dependencies| module21
  module20 -->|dependencies| module25
  module21 -->|dependencies| module0
  module21 -->|dependencies| module7
  module21 -->|dependencies| module9
  module21 -->|dependencies| module10
  module21 -->|dependencies| module14
  module21 -->|dependencies| module17
  module21 -->|dependencies| module22
  module21 -->|dependencies| module23
  module21 -->|dependencies| module24
  module21 -->|dependencies| module25
  module21 -->|dependencies| module26
  module21 -->|dependencies| module27
  module22 -->|dependencies| module0
  module22 -->|dependencies| module10
  module22 -->|dependencies| module14
  module22 -->|dependencies| module17
  module22 -->|dependencies| module25
  module22 -->|dependencies| module26
  module23 -->|dependencies| module7
  module23 -->|dependencies| module17
  module23 -->|dependencies| module25
  module23 -->|dependencies| module26
  module23 -->|dependencies| module28
  module24 -->|dependencies| module2
  module24 -->|dependencies| module7
  module24 -->|dependencies| module10
  module24 -->|dependencies| module14
  module24 -->|dependencies| module17
  module24 -->|dependencies| module23
  module24 -->|dependencies| module25
  module24 -->|dependencies| module26
  module24 -->|dependencies| module27
  module24 -->|dependencies| module28
  module26 -->|dependencies| module7
  module26 -->|dependencies| module25
  module27 -->|dependencies| module7
  module27 -->|dependencies| module17
  module27 -->|dependencies| module25
  module27 -->|dependencies| module28
  module29 -->|dependencies| module0
  module29 -->|dependencies| module1
  module29 -->|dependencies| module2
  module29 -->|dependencies| module5
  module29 -->|dependencies| module7
  module29 -->|dependencies| module9
  module29 -->|dependencies| module10
  module29 -->|dependencies| module13
  module29 -->|dependencies| module14
  module29 -->|dependencies| module15
  module29 -->|dependencies| module16
  module29 -->|dependencies| module17
  module29 -->|dependencies| module19
  module29 -->|dependencies| module21
  module29 -->|dependencies| module22
  module29 -->|dependencies| module23
  module29 -->|dependencies| module24
  module29 -->|dependencies| module25
  module29 -->|dependencies| module26
  module29 -->|dependencies| module27
  module29 -->|dependencies| module28
```

All workspace dependency fields must be acyclic; the build graph reader rejects production and auxiliary cycles.

No workspace dependency cycles.
<!-- architecture-modules:end -->

The root manifest's standard Bun default `catalog` is the single authority for shared external dependency pins and the Effect cohort. Consuming manifests use `catalog:`; workspace dependencies use `workspace:*`. The graph resolver validates and resolves those declarations without retaining another version table. Single-owner tools retain their exact manifest pins. The separate research scorer alias retains its classic TypeScript compiler API and is not the production compiler.

The release identity generator projects `catalog.bun` into the packaged runtime constant and rejects package-manager or Bun type-companion drift. Reviewed runtime profiles keep their observed version so a dependency update cannot silently approve old evidence. The Bend producer manifest owns the Bend and Lean toolchain versions, source identity and platform archive hashes; installation, generation and compiler receipts consume that same cohort.

[`pinned-typescript.mjs`](../scripts/pinned-typescript.mjs) selects TypeScript from the consuming owner's declared catalog dependency, validates the compiler-owned platform package and actual native version, and records compiler, helper, platform and support bytes. Production callers execute that selected native binary rather than the shared `node_modules/.bin/tsc` link, which can point at the scorer alias. [`readCompilerToolchain`](../scripts/compiler-context.mjs) checks the selected identity retained in the toolchain stamp before compiler receipts are reused. Selecting the compiler and checking its identity does not establish that compilation or publication passed.

The root prepares actual compiler, platform and external-tool identities before Turbo hashes tasks. Authored owner stamps bind source membership, bytes, modes, configuration and resolved catalog pins; each producer compares that observation before and after execution. [`generate-turbo-config.mjs`](../scripts/generate-turbo-config.mjs) derives task relationships and owned outputs from manifests. One production-filtered Turbo phase compiles Bend, dependent TypeScript and selected native targets using `dependsOn`; there is no preparatory Bend compilation loop. Typechecking selects the compiler tasks without requiring native compilation. The root release has no private consumer dependencies: tooling and tests declare those in their own workspaces so they do not become Turbo root-global internal dependency inputs.

After that phase, one fresh global source/compiler/native gate projects stable prerequisites for each executable or Pi entry. A second Turbo phase assembles those entries into owner-local `artifacts` directories and restores missing outputs. Assembly task inputs include scoped prerequisites and actual upstream runtime outputs, including JavaScript changes that leave declarations unchanged. The global gate is deliberately outside assembly dependency hashes: the pinned-Turbo experiment showed that adding a global gate dependency made an administration edit invalidate the unrelated hook. External installed dependency identity remains a conservative assembly input until a complete scoped external runtime identity is proven. Cached producers never write public `dist` or installed native paths. The uncached publisher validates owner inventories and publishes the complete staged release after its final freshness gate; native files use atomic inode replacement. A failure revokes public `dist`.

### Turbo ownership audit

The admission barrier remains between two Turbo invocations because it must observe the complete freshly compiled candidate before assembly snapshots are consumed. In pinned Turbo 2.11.7, making that global gate an assembly dependency also imports its dependency hashes: the administration-only edit in the [gate experiment](../evidence/build-243/turbo-feasibility/gate-fanout-08.json) invalidated the unrelated hook. Deferred `jit` and `dependencyOutputs` inputs hash files after dependencies complete; they provide no ordering-only edge that excludes those upstream task hashes. Removing the edge within one invocation would allow assembly to consume stale snapshots before admission finishes. The root therefore coordinates this transaction barrier; Turbo retains task scheduling and caching within both phases.

Fresh cached-receipt checks establish complete output inventories and current bytes and modes. Producer observations before and after execution reject source-input drift. Loader-policy and installed dependency byte proofs establish the actual resolver suppliers and authorized transformations. These are independent guarantees: successful Turbo execution and restoration do not establish them. Tooling imports the exact authored native-binding adapter through its declared source-analysis dependency and existing public export mapping; assembly hashes that source directly, without requiring emitted adapter bootstrap or adding parser dependencies to hook or Pi product owners.

Within one assembly receipt check, repeated file references must agree on mode and digest, then each distinct file is freshly observed once. Loader syntax analysis has a bounded process-local cache keyed by the exact text digest, filename and native approval; it retains neither ASTs nor resolved targets. Every invocation still resolves every edge and checks current supplier bytes and ownership under the current role policy. Publication checks and subsequent receipt checks make new filesystem observations; syntax reuse does not certify a restored artifact or skip its admission.

Linux file evidence also reuses a bounded process-local digest when the current descriptor's device, inode, size, mode, `mtimeNs` and `ctimeNs` match the prior observation. Each call rejects non-regular files, opens with `O_NOFOLLOW`, and checks both descriptor and pathname before returning evidence. Changed or evicted identities are hashed again; same-size edits with restored mtime still invalidate through ctime. Compiler observations are not persisted across processes. Darwin continues descriptor-checked full hashing. Filesystem metadata must come from the trusted local filesystem; this mechanism does not authenticate a hostile filesystem or cache writer. Build tooling does not separately fingerprint the installed dependency tree; Turbo owns dependency inputs for task caching.

The [Turbo 2.11.7 feasibility evidence](../evidence/build-243/turbo-feasibility/summary.json) records actual multilingual builds, restoration, invalidation and failure experiments. These observations concern the pinned tool, not an untested reading of newer documentation.

| Mechanism | Responsibility | Guarantee and limits |
| --- | --- | --- |
| Turbo artifact cache | Executable and native reuse and restoration use task `inputs`, dependency hashes and `outputs` | Fresh receipts validate restored bytes, modes and inventories. |
| Archive preparation | Ordinary build, validation and packing | Immutable archive bytes and SHA retention identify the packed release. |
| Turbo task graph | Dependency ordering uses `dependsOn` | Manifest projections select role and platform tasks. |
| Global source/compiler admission | An uncached global gate supplies scoped entry prerequisites | The [gate experiment](../evidence/build-243/turbo-feasibility/gate-fanout-08.json) demonstrates why the gate is not a transitive assembly dependency. |
| Exact loader/resolver and emitted-contribution checks | Turbo boundaries checks workspace relationships | [Actual boundary probes](../evidence/build-243/turbo-feasibility/boundaries.jsonl) accepted undeclared `require`, computed/reflective loaders and unsupported private targets. |
| Input drift, artifact provenance and publication guard | Turbo hashes inputs and caches successful tasks | Failed producers left prior public output and partial private output; incomplete valid cache archives also required fresh inventory rejection. |
| Build lease, finite deadline and descendant draining | Turbo schedules task processes | Owns process groups, interrupted publication and unresolved descendants. Scheduler success alone does not prove lifecycle cleanup. |
| Watch transaction coordinator | Turbo watches source changes | A transaction/event adapter, without a task dependency graph or artifact cache. [Pinned watch probes](../evidence/build-243/turbo-feasibility/watch.jsonl) observed no rebuild for an explicitly declared ignored identity file or deleted output. |
| Dependency byte identity memo | Turbo accepts preformed tool/platform identities in inputs | Detects actual installed bytes and resolver suppliers, which a lockfile version alone does not describe; it stores digest observations, not build artifacts. |

Compiler output restoration has an additional lifecycle boundary: pinned Turbo restored an older complete cache entry without deleting files emitted by a newer valid source shape. The strict compiler inventory rejected those leftover files and publication stayed revoked. Each production compiler owner therefore has an uncached `clean:compiler` prerequisite that removes only its own `dist` before compilation or restoration, under the existing build lease. Its inputs are static manifest/helper identities rather than owner source, and it has no cached outputs. The [isolated pinned-Turbo probe](../evidence/build-243/compiler-cleanup-turbo-probe/result.json) observed warm cache hits and source-add/delete/revert convergence while cleanup executed; ordinary production acceptance remains separate. This trades warm in-place output retention for complete cache restoration. Native artifacts, public release output and receipts retain their separate ownership and strict checks; cleanup does not prune or excuse malformed restored inventories.

Darwin C compilation stays uncached until a Clang/framework contribution profile is demonstrated. Foreign-host retained binaries are hash- and format-verified suppliers, not target-host execution evidence. The [before-architecture benchmark](../evidence/build-243/turbo-architecture-benchmark-before-1791341454160.json) observed cold/warm/deleted-output builds at 155.111/50.807/57.634 seconds on Linux ARM64. The [integrated candidate benchmark](../evidence/build-243/turbo-architecture-benchmark-final-1791359834592.json) observed 120.277/59.870/64.646 seconds. Warm and restoration each recorded 58 actual producer cache hits, exact restored bytes/modes and six executable probes. The [environment comparison](../evidence/build-243/final-benchmark-before-environment-comparison-1791359834592.json) verifies identical recorded environment and selected tool identities, including PATH and locale. Cold was faster; warm and restoration were slower in these observations. Host load differed and OS page cache was uncontrolled; these are single paired measurements, without a statistical speedup claim.

The [warm-stage diagnostic](../evidence/build-243/warm-build-stage-timing-1791349086640.json) retained the recorded toolchain environment and observed 58 actual cache hits. Turbo itself took 88 and 301 ms; the instrumented build entry took 48.651 seconds. Preparation consumed 6.679 seconds, fresh source/compiler admission approximately 5.640, native admission 7.310, restored assembly validation 11.472, and publication with final guards approximately 16.276. Output bytes and modes remained unchanged. This single diagnostic excludes npm launch overhead and includes observer overhead; it is not an improvement comparison. The remaining cost belongs mainly to fresh evidence and publication. Further consolidation requires proving that another mechanism prevents the same failure; elapsed time alone does not justify deleting a freshness guarantee.

The [process-local evidence reuse comparison](../evidence/build-243/build-evidence-reuse-20261008.json) measures the ordinary build entry on Linux ARM64 with three warm runs per candidate: median 62.050 seconds before and 20.927 seconds after, each with 58 producer cache hits and no misses. A later reverse control observed 85.197 and 35.738 seconds respectively, also without producer misses. It excludes preparation and npm launch overhead; host load and OS page cache are uncontrolled. Reuse reduces repeated hashing and syntax analysis while retaining fresh resolution, file observations and publication guards. The same candidate passed the build-workflow adapters and selected production restoration/corrupt-cache cases. These observations do not establish cold-build improvement or Darwin performance.

Bend owns `dist/canonical.generated.js` and `dist/import-graph.generated.js`, with declarations copied from its authored `abi` inputs. Canonical adapters import the exact producer exports; no generated copies or forwarding adapter remain in other owners. Generator/receipt checks establish current artifacts and bounded loader evidence. They do not rerun the independent laws/proofs or establish native agent behavior. Compilation receipts, emitted contributions, assembly and cache verification are distinct evidence boundaries; a cache success log alone is not publication evidence.

The leaves are domain contracts rather than a generic common package: canonical transition authority, source-artifact evidence shapes, and delivery encoding serve different concepts. `runtime-inputs` depends on canonical graph-limit definitions because configuration chooses among accepted limit profiles; canonical policy does not import configuration. `native-observation` owns observed capture/attribution facts without importing the rule compiler or provider. `resident-transport` owns wire types, including collection mode and controlled options, so hooks do not obtain those types from resident execution or a provider implementation. Type-only imports obey the same ownership boundary as runtime imports.

### Vertical capabilities across packages

- Onboarding remains in [`administration/src/onboarding`](../packages/administration/src/onboarding/), including setup, update, retained-release registrations, first-review workflows and repair. The command/event catalog belongs to [`runtime-environment/runtime/hook-catalog.ts`](../packages/runtime-environment/src/runtime/hook-catalog.ts); source-free demo observation and budgets belong to activity. Credential state reading belongs to runtime inputs; native resolution/store lifetime belongs to credential storage; login/logout authorization and mutation workflows remain administration. Resident use of credential storage does not authorize hook access to its mutation capability.
- Rule authoring, connection and inventory remain in [`administration/src/rules`](../packages/administration/src/rules/). [`review-definition/src/rules`](../packages/review-definition/src/rules/) owns schemas, compilation, accepted defaults and decisions. Execution uses these definitions rather than moving rule authority into transport or a composition root. The [configuration/rule contract](configuration.md#declarative-rules) and rule CLI/settings tests govern both sides.
- Inspection recording/replay remains in [`inspection-records/src/inspection`](../packages/inspection-records/src/inspection/); resident and review execution publish observations. [`administration/src/inspection`](../packages/administration/src/inspection/) owns discovery and the foreground HTTP dashboard. This process/package split preserves [#225](https://github.com/dearlordylord/hapsland/issues/225) ownership; journal tests and browser/installed gates establish separate boundaries.
- Activity/status/analytics and source-free demo traces remain in [`activity-observation/src/activity`](../packages/activity-observation/src/activity/). Hooks, resident transport and administration consume observations; this package does not execute review providers or installation mutations. [Status](status.md) owns the public explanation.
- [`review-execution/src/direct-event/pipeline.ts`](../packages/review-execution/src/direct-event/pipeline.ts) and provider implementations own review effects; source analysis owns parsing/capture expansion, while resident runtime owns admission, scheduling, freshness and advice collection. Bend remains the transition-policy authority. Moving these responsibilities does not amend the [review](review-contract-compatibility.md), [advice](advicing-target-contract.md) or [provider](review-providers.md) contracts.
- Evaluation remains an administrative capability in [`administration/src/evaluation`](../packages/administration/src/evaluation/), using review execution and recorded results. The CLI may select a controlled reviewer for evaluation; that does not restore native hook dispatch to the administrative CLI. [Evaluation guidance](evaluation.md) and `src/evaluation` tests own its behavior.

### Architectural review and enforcement disposition

The parser binding map, native configuration and Bun loader transformer belong to [`source-analysis/direct-event/languages/native-bindings.ts`](../packages/source-analysis/src/direct-event/languages/native-bindings.ts), exposed through its exact private export. Runtime-environment owns the process-role guard consumed by parser/provider modules.

The dedicated [`hook-main`](../packages/hook-entry/src/hook-main.ts) composes [`hook-runtime/program`](../packages/hook-runtime/src/hooks/program.ts). Administrative routing and native hook grammar are separate. The launcher and owned registrations select the retained hook command. Root manifest policies forbid administration, credential mutation, source analysis, provider execution and review orchestration in both standalone-hook and Pi source closures. Lazy and type-only imports do not excuse forbidden ownership.

The source checker follows actual relative/private-export edges with lexical bindings and pinned TypeScript callable evidence. Unsupported computed loaders, loader aliases/factories, reflective code loading and receiver assertions cannot substitute for analyzed edges. Named demo/native/FFI exceptions constrain particular source shapes and imported helpers. This is a supported-language policy, not a JavaScript sandbox or proof about arbitrary supplied runtime values.

Production compilation and executable assembly are separate evidence boundaries: compiler receipts account for compiler inputs and current output inventories; standalone Bun assembly consumes emitted JavaScript and records actual inputs, resolved discarded imports and native assets. Source closure and emitted contribution sets need not be identical because types erase and exports can be pruned; every relevant edge/contribution must be accounted for and authorized. Cache restoration must validate current inputs, policies, toolchain, bytes and modes, not merely replay successful task logs.

Pi remains a Node-hosted extension. [`assemble-host-modules.mjs`](../scripts/assemble-host-modules.mjs) derives its static emitted graph from exact private manifest exports, rewrites parsed specifiers, and checks relocated imports against inventoried outputs. Its receipt binds current source/compiler/toolchain evidence and maps owner artifacts to public paths; the public Pi export and executable-relative layout are validated. Rule asset membership is derived from manifests. Complete staged publication and tarball checks consume the validated release inventory rather than a hardcoded two-module graph. Current private exports support exact `types`/`default` targets only; unsupported export conditions and undeclared imports are rejected rather than silently resolved under another host profile.

Build orchestration owns the checkout lease and process lifetime; compiler workers enter that ownership before writes. Registered task groups account for scheduler-created process groups. An unresolved descendant or unreadable ownership record prevents successful release of ownership. These adapters require their own fault checks; package structure alone does not establish process cleanup or publication safety.

### Remaining validation limits

The external runtime profile records transformed parser-wrapper bytes, bounded native targets and external loader/code-generation evidence, comparing preview with compiled observations. The [terminal acceptance ledger](../evidence/build-243/build-acceptance-ledger.json) accounts for 35 unique Linux ARM64 scenarios across retained candidates: ordinary/cache paths, input invalidation, source and resolver boundaries, failure refusal, rollback/repair and watch recovery. Each completed case names its evidence and repair disposition. These observations establish their selected cases, not that transformed/runtime code can never conceal a loader. Hooks must continue to exclude parser machinery, including external contributions.

The [integrated ordinary-build benchmark](../evidence/build-243/turbo-architecture-benchmark-final-1791359834592.json) revalidated cold/warm/restoration behavior after upstream integration. The [installed startup comparison](../evidence/build-243/startup-comparison-linux-arm64-final-03.json) completed 40 calls with exact archive and resident lifetime identities. Installed Claude 2.1.218, Codex 0.155.1 and Pi 1.0.0 execution passed on the archives identified by the [installed ledger](../evidence/build-243/installed-validation-final.json). Final packaging and two installed smoke cases passed on the latest archive. The owner selected [bounded final validation](../evidence/build-243/final-check-selection.json); no subsequent full quality pass is claimed. Adapter tests, declarations and cross-compilation do not establish macOS execution or a new supported version cell. The [testing matrix](testing-matrix.md) and [installed compatibility record](installed-release-compatibility.md) distinguish those claims.

The structural review of the current production and auxiliary graph found an acyclic production graph with no production dependency on tooling or verification. Domain scopes and vertical capabilities retain the owners in the table above; no architectural decision changed. Its cleanup findings were resolved by deleting unused administration credential/resident forwarding facades and correcting the decision ledger's native-hook entry. The compiler-selection finding requires the build stamp to identify the actual tooling-owned compiler, including fresh selection checks before and after execution. The [installed milestone review](../evidence/build-243/installed-architecture-review.json) and installed ledger retain that disposition and observed execution. The final retained-advice refactor preserves publication capability checks and has [focused current-runtime evidence](../evidence/build-243/retained-advice-focused.json).

Bend producer toolchain evidence records dynamic libraries with Linux `ldd` and, on macOS, the actual `dyld` image list from bounded version probes. The loader resolves Mach-O relative install names, including `@rpath`, and supplies transitive image paths. Receipt validation observes the list again and checks library bytes and the existing system shared-cache inventory. Missing, suppressed or unrecognized loader evidence rejects reuse; version-probe evidence does not claim to inventory libraries loaded only during later compilation.
