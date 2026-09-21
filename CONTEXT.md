# Product context

This glossary records the domain language for the product under design. It is not an
implementation specification.

| Term | Meaning |
|---|---|
| Product | The still-unnamed host-neutral system we are designing around realtime coding-agent reviews. |
| Jev | TypeSafe's external tool used by the product for typed, realtime review judgments. Jev is not the product name. |
| Review integration | The product's integration boundary around agent hosts, rules, findings, and review backends. |
| Agent host | A runtime that owns an agent's tool/edit loop and exposes lifecycle interception, such as Codex CLI or OpenCode. |
| Model provider | Secondary metadata about the inference service selected by a host or review backend. It is not a first-class adapter target in the current phase. |
| Artifact | An independently identifiable semantic subject extracted from source. Its kind identifies what it describes; the initial kind is `typeShape`. |
| Type-shape artifact | An artifact describing the domain values admitted by one interface, type declaration, or schema. |
| Change observation | Host or reconciliation evidence that eligible working-tree content may have changed. |
| Change set | The complete, stable source changes established by one successful observation. An incomplete or unstable capture produces no change set. |
| Observation result | The completion, skip, or incompleteness outcome of processing one change observation before semantic review work exists. |
| Review unit | One root artifact together with the supporting evidence evaluated independently in one review-backend request. |
| Review work item | One review unit together with the frozen observation, rule-set, and input-contract context needed to schedule its evaluation. |
| Review dispatch cycle | A finite group of review work items selected together for evaluation; work arriving after selection belongs to a later cycle. |
| Review result | The operational result of evaluating one actual review work item. |
| Pending advice | Advice from a completed review that remains eligible for delivery to its intended recipient. |
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
