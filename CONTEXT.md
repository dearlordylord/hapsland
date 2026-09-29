# Product context

This glossary records the domain language for the product under design. It is not an
implementation specification. Product explanations and dashboard labels use
these meanings. A Bend or TypeScript constructor name appears in reader-facing
material only beside the plain-language meaning it represents.

| Term | Meaning |
|---|---|
| Product | Hapsland, the runtime-neutral system we are designing around realtime coding-agent reviews. |
| Jev | TypeSafe's external tool used by the product for typed, realtime review judgments. Jev is not the product name. |
| Review integration | The product's integration boundary around agent runtimes, rules, findings, and review backends. |
| Flow stage | A conceptual location in the observed Hapsland review and advice process, such as preparation or pending advice. A stage groups checked state and facts for explanation; it is not a state in the reducer. |
| Runtime installation | The product integration made available to a particular agent runtime for a user. When the runtime executes it and Jev credentials are available, review can run for files allowed by file selection. |
| Runtime trust | The agent runtime's approval to execute an installed integration. It is separate from Hapsland's file selection and credential availability. |
| Agent runtime | A program that runs an agent's tool and edit loop and reports its events, such as Codex CLI or Claude Code. |
| Agent | A coding assistant that edits source in an agent runtime and can receive advice from Hapsland. |
| Subagent | An agent started by another agent within an agent runtime. It remains an agent for review and advice. |
| Resident | Hapsland's local background process. An agent runtime starts a short Hapsland command when an edit or Stop event occurs. That command sends the event to the resident. The resident schedules review work, calls Jev, and holds temporary review state in its own memory. |
| Resident connection directory | A filesystem directory that contains the resident's local connection socket and ownership files. It does not contain the agents' source files or the capacity ledger. By default, Hapsland uses one such directory per operating-system user, outside Git worktrees. `REVIEW_RESIDENT_DIR` can select a different directory. Commands that select the same directory reach the same resident. |
| Hapsland round | One agent's period of review and advice in Hapsland. It continues when Hapsland asks that agent to work on advice at Stop. It ends when Hapsland allows a Stop attempt to finish, even if another hook keeps the agent working. New work after that boundary starts a new Hapsland round. |
| Runtime turn | A unit of conversation identified by an agent runtime. Its boundary need not match a Hapsland round. |
| Model provider | Secondary metadata about the inference service selected by an agent runtime or review backend. It is not a first-class adapter target in the current phase. |
| Artifact | An independently identifiable semantic subject extracted from source. Its kind identifies what it describes; the initial kind is `typeShape`. |
| Type-shape artifact | An artifact describing the domain values admitted by one interface, type declaration, or schema. |
| Change observation | Agent runtime or reconciliation evidence that eligible working-tree content may have changed. |
| Observation origin | The kind of evidence behind a change observation: direct edit or checkpoint reconciliation. |
| Agent attribution | Agent runtime evidence that associates an exact current snapshot with an intended advicee and canonical working root. Root co-location or checkpoint discovery alone is not agent attribution. |
| Codex patch hunk | A part of Codex `apply_patch` edit data that shows added, removed, and nearby unchanged lines. |
| Claude edit data | The file path and before-and-after content reported by a Claude Code `Edit` or `Write` event. |
| Post-edit span | A range of lines or characters in the file after an edit, derived from a Codex patch hunk or Claude edit data. It gives Hapsland one way to locate a change when identifying the changed type or function. |
| Verified post-edit span | A post-edit span whose position Hapsland has checked against the captured snapshot. This check links the reported edit to observed file content; it does not prove who made the edit. |
| File selection | The policy decision that a candidate path may be captured. By default, otherwise eligible files are included. User file settings can include or exclude paths; containment, protected paths, file kind, and ignore rules still apply. Selection does not encode language or semantic-analyzer applicability. |
| Analysis applicability | Whether bounded captured content is understood by an available semantic analyzer and yields reviewable artifacts. No applicable analyzer is an ordinary quiet result, distinct from file exclusion. |
| Snapshot | The exact eligible source content observed at one capture boundary, identified by its source identity. It is transient review evidence, not a backup, history, or durable replay record. |
| Supporting source | An eligible source file reached through a selected root's reference graph. It contributes evidence to that root's review unit without becoming an attributed edit or a separately selected root. |
| Evidence tree | The finite projection of one selected root, its resolved supporting declarations, and their reference edges that a review unit presents for evaluation. |
| Unattributed change | A checkpoint-discovered change for which the exact current snapshot cannot be associated with an advicee. It has unknown origin and no advicee, so it cannot produce agent-addressed advice. |
| Direct-edit observation | Change evidence obtained at a dedicated edit boundary exposed by an agent runtime. |
| Checkpoint reconciliation | Comparison of eligible working-tree content with prior observation state to discover changes not yet accounted for. |
| Observation baseline | The bounded, source-free in-memory record of eligible file fingerprints and per-file artifact projections used by the current resident reviewer for checkpoint reconciliation. It is discarded when that reviewer restarts. |
| Artifact index | The part of an observation baseline that groups review-projection fingerprints by eligible file so newly added or changed artifacts can be selected without retaining source. A missing entry is unknown, never evidence that an artifact is unchanged. |
| Checkpoint trigger | A runtime-neutral reason to perform checkpoint reconciliation, mapped from an agent runtime’s lifecycle events. |
| Turn-completion checkpoint | A catch-up checkpoint when an agent runtime attempts to finish one of its turns. |
| Change set | The complete, stable source changes established by one successful observation. An incomplete or unstable capture produces no change set. |
| Observation result | The completion, skip, or incompleteness outcome of processing one change observation before semantic review work exists. |
| Review unit | One root artifact together with the supporting evidence evaluated independently in one review-backend request. |
| Review work item | One review unit together with the frozen observation, rule-set, and input-contract context needed to schedule its evaluation. |
| Review dispatch cycle | A finite group of review work items selected together for evaluation; work arriving after selection belongs to a later cycle. |
| Review result | The operational result of evaluating one actual review work item. |
| Advicee | The agent that Hapsland can advise about an attributed edit. A working root or the latest caller does not identify that agent by itself. |
| Advicee partition | The resident's separate review and advice scope for one identified agent, in one session and one physical working root. A supplied subagent ID distinguishes a child from its parent. A missing ID currently maps to the main-agent scope; it does not prove that an event came from the main agent. Hapsland must not give child-specific advice without reliable child attribution. |
| Stop continuation | More work that Hapsland asks an agent to do when it tries to finish, so it can act on advice. |
| Stop allowance | Permission for Hapsland to request a Stop continuation from an agent. |
| Pending advice | Advice from a completed review that remains eligible for delivery to its intended advicee. |
| Advice relevance expiry | The transition after which undelivered pending advice is no longer eligible for delivery because its configured relevance age has elapsed. It does not imply delivery, runtime closure, or loss of the observation baseline. |
| Advice batch | The bounded collection of review results selected for delivery together through one agent-runtime interaction. |
| Source fingerprint | A deterministic fingerprint of an artifact's exact source, used as equality evidence rather than as the identity of an observation. |
| Review projection fingerprint | A deterministic fingerprint of the canonical evidence projection evaluated for a review unit. |
| Review input contract | A versioned definition of the source, path, domain text, completeness metadata, and rendering presented to a review backend. Different input contracts are distinct evaluation scenarios even when they describe the same edit. |
| Review input | The exact semantic payload rendered from one review unit under a review input contract for backend evaluation. |
| Evidence completeness | Whether the evidence required for a checked rule expectation is present. Missing required evidence is incomplete, not evidence that the source is clear. |
| Review capacity limit | A bound on how many resident records and measured bytes Hapsland can retain. The resident checks a shared bound and a bound for the identified agent's scope. These are four checks: item count and bytes at each of two scopes. They are not four kinds of work. This is distinct from Jev request concurrency and process RAM. |
| Review capacity ledger | The temporary record, in the resident process's memory, of which review-related records use that capacity. The same resident schedules review work and calls Jev. Each agent's usage is part of the shared total. The ledger does not measure all process memory or Jev's own capacity. |
| Review capacity reservation | Space held in the ledger for one resident record: one item and its measured bytes. A reservation starts and ends when that record changes or leaves the resident. The Bend `Charge` constructor represents a reservation; “charge” does not mean payment or a Jev request. |
| Background advice submission | An attempt to send advice to an agent runtime after an edit, before that agent asks to finish. “Background” distinguishes this opportunity from a response to the finish attempt. A successful submission does not prove that the agent saw the advice. |
| Rule | A user-configurable criterion evaluated against an action, edit, diff, or related context. |
| Finding | Evidence produced by a rule evaluation, including its explanation, location, severity, and confidence where available. |
| Decision | The operational result of a review: allow, ask, block, advisory, context, or observe. |
| Runtime adapter | The translation layer between a canonical product event/decision and one agent runtime's native hooks and response format. |
