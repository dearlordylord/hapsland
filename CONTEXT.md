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
| Rule | A user-configurable criterion evaluated against an action, edit, diff, or related context. |
| Finding | Evidence produced by a rule evaluation, including its explanation, location, severity, and confidence where available. |
| Decision | The operational result of a review: allow, ask, block, advisory, context, or observe. |
| Host adapter | The translation layer between a canonical product event/decision and one agent host's native hooks and response format. |
