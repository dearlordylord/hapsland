# Hapsland architecture

**Purpose:** Give technical users a short map of review context, user control, and verification boundaries.
**Status:** Active architecture explanation; public copy remains subject to editorial review.
**Authority:** Maintained explanatory guidance. The linked accepted contracts own product behavior; this page introduces no new guarantees.
**Expected use:** Understand what can leave the repository, why context is structured, and which guarantees have executable evidence.
**Lifecycle:** Update alongside changes to review inputs, file policy, reducer authority, provider routing, or runtime ownership. Review before public publication and whenever one of those boundaries changes.

Hapsland helps a coding agent revisit data-model and API decisions before more code builds on them. After a supported edit, it reviews the changed type or function together with related definitions, using built-in rules and rules you supply. The selected review backend evaluates the supplied code against rule questions. Hapsland chooses which code and rules can be sent, maps the result to configured feedback, and checks that feedback still applies to the current code.

Feedback follows the edit. It cannot undo that edit or guarantee that the agent repairs it. Optional stronger feedback depends on the agent runtime and user settings; see [feedback configuration](configuration.md#configuration-fields).

```mermaid
flowchart LR
  A[Edited lines] --> B[Find the changed type or function]
  B --> C[Check file access and read source]
  C --> D[Changed type or function and related code]
  D --> E[Choose checks with enough code]
  E --> F[Jev evaluates rule questions]
  F --> G[Discard outdated feedback]
  G --> H[Feedback to agent runtime]
```

## Context follows code structure

Hapsland uses the local edit to find the changed type or function. It expands beyond the edited lines to the complete declaration, then follows supported local references to collect related definitions. The resulting tree marks references it could not include. Files, traversal work, and selected code have limits. The edit diff stays local; it is not sent to Jev. The request contains neither a whole file nor agent transcript, absolute path, or unrelated source. Related definitions provide context; they are not separate review targets. This makes questions about representable states and API relationships possible beyond the changed lines.

The tree still contains selected code. Structure provides focused context; it does not anonymize source or detect secrets embedded in otherwise eligible declarations. Related definitions let rules examine relationships beyond the changed lines. This does not establish better judgment accuracy. See the [accepted input contract](review-contract-compatibility.md#review-input-and-result-identity) and [supported review profiles](type-function-review-proposal.md).

![Illustrative repair loop: an edit gains related code context, receives feedback, and is repaired and reviewed again](../assets/review-flow.gif)

## Built-in rules and rules you supply

Seven editable Hapsland default rule files supply probability questions about code design. Each rule declares supported language/input combinations and the evidence it needs. A rule runs only when those needs are met. An omitted reference can be irrelevant to one rule but necessary for another; an omission need not prevent every rule from running.

Each local JSONC document defines one rule with a stable identity. Configuration explicitly connects it and selects activation, language and file restrictions, thresholds, and feedback messages. Rule settings narrow global root scope and intrinsic input support. Runtime validation schemas are a separate unsupported input form; they are not automatically treated as type declarations. See [rules and configuration](configuration.md#declarative-rules).

## The user controls the source boundary

Sending source to an external review service is a data-sharing decision. Hapsland controls which code enters its review requests; it does not set the review service’s data-retention policy. The user’s task prompt and conversation with the agent are not review inputs. Jev receives eligible source definitions and rule questions.

Every file must pass repository containment, protected-path, Git-ignore, and capture checks before its source is read. Root files additionally pass global root selection and rule settings; supporting files pass context selection. Omitted context settings inherit root file scope, while explicit context settings may permit related files outside root scope. `privacyExcludes` applies to both roles and cannot be overridden. Exclusions accumulate across user and project settings; a user `excludes: ["**/*"]` leaves no review roots and turns review off.

With credentials available and no file settings, all otherwise eligible files are selected. There is no per-request approval prompt. Users should set an explicit source scope when they want a narrower boundary. Graph limits also bound files, reference depth, source reads, work, and encoded evidence; the default evidence-tree cap is 20 KiB. The cap limits code because the review model has a finite context window. Rule questions and provider overhead also occupy that window; they are outside the code-tree cap. This byte cap is not an exact measurement of model tokens.

Access exclusions and size limits act at different points. An excluded dependency is refused before its source is read. A dependency's source may already have been read when its contribution is found not to fit the evidence tree; that contribution is then omitted. A walkthrough must distinguish local reads from code included in the request.

Before dispatch, captured files must still match. Before advice is delivered, Hapsland rebuilds the unit and checks current source, policy, rules, and attribution. Changing exclusions affects future dispatches; it cannot recall a request already sent. The user configuration selects Jev or Cloudflare Clef/Clef-flash through Effect's provider-neutral `DecisionModel`. The [provider boundary and limit catalog](review-providers.md) separate model input constraints from graph and resident limits and identify unmeasured token budgets. See [configuration](configuration.md) for exact controls and precedence.

## Runtime ownership

Effect 4 services compose the resident, client, source preparation, backend evaluation, and host-output workflows. Each resident acquisition owns one shared state record: short synchronous commits publish the Bend state and matching native records together, while filesystem and network effects run outside those commits. Scoped fibers execute admitted work; process and host adapters enter the Effect runtime at their boundaries. Review integration uses provider-neutral `Decision` / `DecisionModel` with `@effect/ai-typesafe` for Jev, a Workers AI REST adapter for Cloudflare, and `Decision.probability` for probability rules.

Version-one resident requests and responses decode through Effect Schema. Requests use exact operation alternatives after bounded JSON framing, with recursive excess-field rejection and structural identity, credential, collection, and coordinate bounds. The decoder rejects retired ticket fields, unsupported runtime identities, internal route fields on the wire, and finish decisions outside composed turn-end collection. Optional collection mode remains absent when omitted; runtime lifetime, authorization, credential generation, and canonical decisions retain their existing owners. Native patch commands must be strings, and unknown request fields are rejected rather than silently discarded.

Resident IPC uses ephemeral TCP ports bound to `127.0.0.1`. Private endpoint records (mode `0600` within a user-owned `0700` directory) advertise the port, per-lifetime certificate, authentication token, PID, and lifetime. Clients verify the resident's TLS certificate before sending the token, then wait for an authentication acknowledgement before sending an application frame. The resident keeps the certificate's private key in memory. Inspection has its own port and token, with four connection slots independent of the 32 hook-control slots. TLS and authentication deadlines bound unauthenticated connections; existing application deadlines and version-one framing remain in force. Platform support still requires the existing native dependencies and checks; the choice of TCP alone does not extend it.

An IPC connection owns its response context and provisional delivery lease. Shared review work belongs to the resident lifetime, so disconnecting a collector does not cancel another collector's evaluation. Cancellation stops further authorized work, but issued requests and capture workspace retain their accounting until native work physically settles. Shutdown waits for that settlement before releasing ownership artifacts. Claude edit feedback uses one bounded admission-and-collection request with immutable response authority; it retains no edit tickets or duplicate outcome registry. The [advicee contract](advicing-target-contract.md) owns the delivery rules.

The public lifecycle commands and internal automation flags are declared together with Effect CLI in [`src/cli-command.ts`](../src/cli-command.ts). Parsing rejects unknown, repeated, missing, empty and conflicting arguments before reading stdin or dispatching a package. Help is generated from those declarations. Installed hook ownership markers are declared internal flags; hook help and argument failures remain quiet. JSON stdin decoding and protocol-specific output stay in their existing workflow owners, with the caller's configuration provider.

Credential resolution, save, and logout compose in the caller's Effect runtime and configuration provider. Save and logout publish a suspended generation before invoking the native credential helper. The state lock remains owned until the helper physically closes, including after timeout or interruption; token checks prevent cleanup from deleting a successor's lock. Lock polling uses an Effect schedule, and persisted version-one state is decoded with Schema. CLI and resident process configuration preserve empty environment values so empty credential paths are rejected rather than replaced by defaults.

Installation mutations compose in the caller's Effect runtime and own a scoped generation lock. Cancelled waiters remove their unpublished owner records; completion releases the exact published owner. Retained generation links fence competing stale-owner reclaimers. Mutation plans, journal revalidation and rollback preserve unrelated configuration and incomplete-operation recovery.

The offline installed doctor composes its bounded, read-only resident probe in the caller's Effect runtime and configuration provider. It does not launch a resident or issue provider review calls. Native observation failures carry operation labels rather than source or credential contents.

The explicitly selected first-review demo uses named Effect workflows for fixture preparation, claim consumption, host execution, observation and cleanup. A claimed preview owns a scoped cleanup capability. Native process timeout or interruption waits for callback settlement and physical closure before that scope removes the disposable root. Pending preview records remain available for explicit live selection or cancellation; their digest, owner marker and cleanup token fence execution and removal. Observation polling and elapsed-time measurements use Schedule and the caller's monotonic Clock. Budget expiry and persisted timestamps use epoch time.

## What verification establishes

Bend owns the production transition decisions through `Canonical.step`, including admission, rule eligibility, capacity, request permission, freshness-related transitions, and delivery authorization. The import-graph reducer orders traversal and checks budgets. TypeScript observes native facts and executes filesystem, parser, credential, network, and host-output effects.

General kernel-checked proofs cover import-graph budget properties and finite-event termination, plus named conditional progress properties. Canonical laws and independent traces check specific decision cases. These establish their declared properties under their premises; they are not an end-to-end proof that arbitrary process execution cannot leak data. Native enforcement has separate implementation and conformance evidence. A Jev judgment is also not a formal proof of the reviewed code's correctness.

The core has a formally checked exclusion case with no source-read command: [`import_graph_exclusion_has_no_read_command`](../packages/agent-flow-bend/LAWS.bend) and its [proof](../packages/agent-flow-bend/PROOF.bend). It proves the specified transition, not a universal confidentiality theorem. Separately, the [general tree-size laws](../packages/agent-flow-bend/import-graph-proof/LAWS.bend) prove that accepted size contributions stay within their cap under the stated premises. These are the precise meanings behind the README's qualified core-verification claim.

See the [Bend package and proof scope](../packages/agent-flow-bend/README.md), the [reviewed TypeScript decision boundary](typescript-decision-boundary-ledger.md), and [installed compatibility evidence](installed-release-compatibility.md).

Deterministic simulation adds a separate layer of evidence. [monkey-business](../packages/monkey-business/README.md) runs the compiled policy reducers under a virtual clock with seeded workloads, generated import trees, synthetic failures, and exact replay. Tests cover request saturation, stale work, credential changes, uncertain output, expiry, and bounded recovery. Graph property tests check permissions and budgets at each graph frame. This simulates the supported core and environment; it does not execute the complete resident, real source capture, IPC, or Jev transport. Resource limits account for declared logical charges and native bounds, rather than proving a fixed process RSS ceiling.

## Inspect behavior rather than infer it from silence

An unsupported declaration, insufficient required evidence, unavailable credential, or refused admission can prevent review. Silence does not mean the code passed. [Status and doctor](status.md) explain observed activity and readiness without exposing source in diagnostics.

The [interactive architecture dashboard](../packages/agent-flow-viz/README.md) replays checked decisions and source-free import scenarios. It distinguishes commands, observations, results, and output authorization. Its seeded simulation is an offline exploration tool; it does not monitor a live agent or call Jev, and simulated handoff does not establish that an agent used the advice.
