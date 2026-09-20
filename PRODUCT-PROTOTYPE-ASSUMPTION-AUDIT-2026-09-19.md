# Prototype assumption audit

Date: 2026-09-19. Status: specification provenance correction, not implementation.

The user clarified that the whole-file input is a prototype artifact, not a settled
product limitation. The configuration interview record combines explicit answers and
delegated design choices; it does not provide question-level provenance for every
decision. A statement already written in a specification is not independent evidence
that the user explicitly selected it.

Sources: [implementation plan](./PRODUCT-IMPLEMENTATION-PLAN.md),
[interview record](./PRODUCT-CONFIGURATION-SPEC-DRAFT.md),
[Phase F specification](./PRODUCT-PHASE-F-SPEC.md),
[rule implementation](./src/policy/rules.ts),
[eligibility implementation](./src/policy/eligibility.ts), and
[evaluation model](./PRODUCT-RULE-EVALUATION-MODEL.md).

## Carried-forward choices

| Choice | Recorded origin/status | Correct interpretation |
|---|---|---|
| Full post-edit file plus path; one artifact per request; independent file reviews | Implemented B–E baseline, carried into F | Reopened by user correction. Not a universal rule-input model. Define required evidence before finalizing input and pack contracts. |
| Synchronous post-write advisory review, Codex first, no rollback | Explicit scope of the earlier implementation plan/issue #1 | Milestone boundary, not proof that other cadences or hosts are unsuitable. No scope expansion authorized now. |
| Noul/binary questions and nine bundled rules | Initial integration baseline; Noul-only initial rule set also required by current project instructions | Initial supported set, not the universe of useful rules. Other answer kinds need a concrete later requirement. |
| Bundled source-content applicability heuristics; custom applicability only by path | Prototype checks preserved by delegated pack decisions in the interview record | Heuristics and a scoped extension choice, not proven domain truths or a general applicability model. Reassess compatibility with the selected input contract. |
| Default threshold 0.7; strict greater-than reporting | Existing rule code and carried-forward F reporting contract | Local policy choices, not calibrated correctness guarantees. Thresholds are configurable. Keep comparator explicit unless deliberately changed. |
| Probability-first ordering, deterministic tie breaks, five advice items | Existing implementation/plan; F preserves stable budgeted output | Operational selection policy, not evidence that probabilities across rules measure comparable importance. |
| 1,000 ms deadline, concurrency four, two retries, fixed backoff | Existing limits explicitly carried into the configuration interview record | Initial configurable defaults, not universal latency/cost optima. Measurements do not validate every custom pack or larger input. |
| Extension allowlist, excluded names/directories, 256 KiB snapshot limit | Current eligibility/snapshot implementation; F already delegates exact defaults | Baseline safeguards and tuning choices. Privacy/containment guarantees are distinct from the particular lists and size number. |
| Static rule-authored advice, no separate model call for prose | Configuration interview decision record | Recorded design choice, not a backend limitation. Preserve unless deliberately revised. |
| Snapshot hashes, exact answers, skipped/unavailable distinction, deterministic tests | Explicit safety/correctness contracts in plan and F | Retain the guarantees, but adapt identities and checks if review inputs become richer than one file. |

Consent, accumulated exclusions, explanation, local-only packs, diagnostics, headless
receipts, and semantic/combinatoric testing came from the specification discussion,
not merely from copying prototype behavior. This audit does not reopen them wholesale.
Exact Effect integration/cohort requirements come from project instructions.

## Correction and accepted follow-through

- Treat prototype measurements as evidence about their exact inputs, model, rules, and
  environment. They establish neither optimality nor universal product requirements.
- Separate prototype baselines, explicit decisions, delegated choices, and unresolved
  assumptions in subsequent design work. Do not use a generated document as proof of
  explicit user approval for every sentence it contains.
- The user accepted documenting the input contract; the clarification above means
  defining that contract deliberately, not freezing the prototype input. Record input
  contract/renderer identity in evaluation evidence.
- The user accepted actual-provider/fake-HTTP transport tests. These are now required in
  the local Phase F specification, with no automatic additional context egress.
- The proposed prohibition on auxiliary source persistence is not adopted yet. The user
  requested an explanation. Existing source-free receipt requirements remain intact.

No implementation, GitHub issue mutation, CONTEXT.md change, or paid validation is part
of this audit. The local specification correction must be reconciled with issue #3
before an implementation handoff uses its older copied body.
