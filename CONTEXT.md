# Product context

This glossary records the domain language for the product under design. It is not an
implementation specification.

| Term | Meaning |
|---|---|
| Product | Hapsland, the host-neutral system we are designing around realtime coding-agent reviews. |
| Jev | TypeSafe's external tool used by the product for typed, realtime review judgments. Jev is not the product name. |
| Review integration | The product's integration boundary around agent hosts, rules, findings, and review backends. |
| Host installation | The product integration made available to a particular agent host for a user. Installation does not itself authorize review of a repository. |
| Repository enablement | The user-approved activation of review for a canonical working root and its review backend/destination, subject to source eligibility rules. |
| Host trust | The agent host's approval to execute an installed integration. It is separate from repository enablement and credential availability. |
| Agent host | A runtime that owns an agent's tool/edit loop and exposes lifecycle interception, such as Codex CLI or OpenCode. |
| Agent | A coding assistant that edits source in an agent host and can receive advice from Hapsland. |
| Subagent | An agent started by another agent within an agent host. It remains an agent for review and advice. |
| Model provider | Secondary metadata about the inference service selected by a host or review backend. It is not a first-class adapter target in the current phase. |
| Artifact | An independently identifiable semantic subject extracted from source. Its kind identifies what it describes; the initial kind is `typeShape`. |
| Type-shape artifact | An artifact describing the domain values admitted by one interface, type declaration, or schema. |
| Change observation | Host or reconciliation evidence that eligible working-tree content may have changed. |
| Observation origin | The kind of evidence behind a change observation: direct edit or checkpoint reconciliation. |
| Change attribution | Host evidence that associates an exact current snapshot with an intended advicee and canonical working root. Root co-location or checkpoint discovery alone is not attribution. |
| File selection | The policy decision that a candidate path may be captured. Selection is based on containment, file kind, ignore rules, and declarative includes/excludes; it does not encode language or semantic-analyzer applicability. |
| Analysis applicability | Whether bounded captured content is understood by an available semantic analyzer and yields reviewable artifacts. No applicable analyzer is an ordinary quiet result, distinct from file exclusion. |
| Snapshot | The exact eligible source content observed at one capture boundary, identified by its source identity. It is transient review evidence, not a backup, history, or durable replay record. |
| Unattributed change | A checkpoint-discovered change for which the exact current snapshot cannot be associated with an advicee. It has unknown origin and no advicee, so it cannot produce agent-addressed advice. |
| Direct-edit observation | Change evidence obtained at a dedicated edit boundary exposed by an agent host. |
| Checkpoint reconciliation | Comparison of eligible working-tree content with prior observation state to discover changes not yet accounted for. |
| Observation baseline | The bounded, source-free in-memory record of eligible file fingerprints and per-file artifact projections used by the current resident reviewer for checkpoint reconciliation. It is discarded when that reviewer restarts. |
| Artifact index | The part of an observation baseline that groups review-projection fingerprints by eligible file so newly added or changed artifacts can be selected without retaining source. A missing entry is unknown, never evidence that an artifact is unchanged. |
| Checkpoint trigger | A host-neutral reason to perform checkpoint reconciliation, mapped from an agent host’s lifecycle events. |
| Turn-completion checkpoint | A catch-up checkpoint at an agent host’s attempt to finish a turn. |
| Change set | The complete, stable source changes established by one successful observation. An incomplete or unstable capture produces no change set. |
| Observation result | The completion, skip, or incompleteness outcome of processing one change observation before semantic review work exists. |
| Review unit | One root artifact together with the supporting evidence evaluated independently in one review-backend request. |
| Review work item | One review unit together with the frozen observation, rule-set, and input-contract context needed to schedule its evaluation. |
| Review dispatch cycle | A finite group of review work items selected together for evaluation; work arriving after selection belongs to a later cycle. |
| Review result | The operational result of evaluating one actual review work item. |
| Advicee | The agent that Hapsland can advise about an attributed edit. A working root or the latest caller does not identify that agent by itself. |
| Stop continuation | More work that Hapsland asks an agent to do when it tries to finish, so it can act on advice. |
| Stop allowance | Permission for Hapsland to request one Stop continuation from a specific agent. |
| Pending advice | Advice from a completed review that remains eligible for delivery to its intended advicee. |
| Advice relevance expiry | The transition after which undelivered pending advice is no longer eligible for delivery because its configured relevance age has elapsed. It does not imply delivery, host closure, or loss of the observation baseline. |
| Advice batch | The bounded collection of review results selected for delivery together through one agent-host interaction. |
| Source fingerprint | A deterministic fingerprint of an artifact's exact source, used as equality evidence rather than as the identity of an observation. |
| Review projection fingerprint | A deterministic fingerprint of the canonical evidence projection evaluated for a review unit. |
| Review input contract | A versioned definition of the source, path, domain text, completeness metadata, and rendering presented to a review backend. Different input contracts are distinct evaluation scenarios even when they describe the same edit. |
| Review input | The exact semantic payload rendered from one review unit under a review input contract for backend evaluation. |
| Evidence completeness | Whether the evidence required for a checked rule expectation is present. Missing required evidence is incomplete, not evidence that the source is clear. |
| Rule | A user-configurable criterion evaluated against an action, edit, diff, or related context. |
| Finding | Evidence produced by a rule evaluation, including its explanation, location, severity, and confidence where available. |
| Decision | The operational result of a review: allow, ask, block, advisory, context, or observe. |
| Host adapter | The translation layer between a canonical product event/decision and one agent host's native hooks and response format. |
