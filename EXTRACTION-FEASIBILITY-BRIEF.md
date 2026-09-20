# Declaration-extraction feasibility brief

Date: 2026-09-20. Status: agreed discussion scope and experiment hypothesis;
not a production architecture or a claim of implemented behavior.

## Agreed scope

- Target TypeScript 7 and later. Do not assume the legacy JavaScript Compiler API
  or ts-morph supplies TypeScript 7 semantics.
- Cover TypeScript type aliases, interfaces, Zod definitions, and Effect Schema
  definitions in the initial feasibility experiment.
- Keep the door open for other languages by separating language-specific discovery
  and reference resolution from extracted artifacts, context budgets, and review
  requests. Do not implement other languages now or require a second frontend to
  complete this experiment.
- Select added or directly changed declarations as independent type-shape artifacts.
  Include a bounded tree of referenced types/schemas, including unchanged definitions
  when needed as context. Jev's small context window rules out unbounded collection.
  Exact budgets and traversal policy remain experiment choices, not settled requirements.
- Requests may include user-configured domain free text, for example a ubiquitous-language
  file. Include the filename; when domain text is absent, the filename accompanies
  the extracted source. Automatic discovery of domain intent is not required.
- Uncertain suspected violations remain unreported. The user accepts incomplete detection
  where domain meaning is not supplied; manual review remains the backstop. This does not
  establish a calibrated numeric uncertainty threshold.
- Re-reviewing unchanged dependents is deferred under
  [the recorded deferral](./EXTRACTION-DEFERRED-WORK.md).

## Hypothesis and evidence boundary

The user's working hypothesis is that diff-only input will miss violations of the existing
type-design rules when a small edit breaks a previously valid example: a one-line change
may omit the surrounding shape or referenced definitions needed to judge the result.
Use the existing [rules](./TYPE-DESIGN-RULES.md),
[classifier questions and examples](./JEV-TYPE-CLASSIFIER.md), and
[experimental evidence](./JEV-EXPERIMENT-LOG.md) to construct such before/after cases.

This is a hypothesis to test, not a conclusion that every diff is insufficient. Record the
actual diff context, and retain cases where a diff is sufficient as controls. A fixture
whose whole declaration fits in the diff is not evidence of missing-context failure.

The immediate feasibility test asks whether source parsing plus TypeScript 7's native
language server can recover declaration source and bounded referenced context reliably
for an interface/type with an imported alias, a composed Zod schema, and a composed
Effect Schema. Parser/server versions, exact source ranges, resolution results, omissions,
and cold/warm timing should be recorded. The
[tooling report](./RESEARCH-DECLARATION-EXTRACTION-2026-09-20.md) supplies advisory candidates,
not a selected production architecture. No extractor has yet been runtime-validated.

Later classification experiments should compare the same edited examples as diffs,
whole files, and individual declarations with bounded context. Include imported-context
and whole-file dilution cases and valid negative controls. Rule 2 remains the genesis
focus; use other existing rules where the chosen examples make them relevant rather
than treating all rules as declaration-only checks.

No numerical accuracy/latency/cost threshold or final continue-versus-Abide decision has
been agreed. Establish those criteria before interpreting classification outcomes. The
local extraction feasibility test can proceed without deciding the final product gate.

## Parked work and continuity

- Broader host integration and Phase F implementation remain paused for this research gate.
- Before Phase F implementation resumes, reconcile the local specification corrections
  with [the configuration issue](https://github.com/dearlordylord/jevs/issues/3).
  The [assumption audit](./PRODUCT-PROTOTYPE-ASSUMPTION-AUDIT-2026-09-19.md) records this
  follow-through; tracker reconciliation is not claimed complete.
- Whether to prohibit auxiliary source persistence remains an unanswered discussion from
  that audit. It is not an adopted prohibition; existing source-free receipt requirements
  remain in force. Revisit before selecting production snapshot/cache storage behavior.
- Planned configuration and consent work is not shipped behavior. Directory consent remains
  separately tracked in [the consent issue](https://github.com/dearlordylord/jevs/issues/2).
- No Wayfinder map exists yet. The user expressed interest in using it later; map creation
  is not a prerequisite for this bounded feasibility test.
- Discuss experiment results with the user before choosing production architecture or
  resuming broader integration. Other-language implementations remain future work.

This brief preserves the current discussion beyond the temporary handoff at
`/tmp/jev-extraction-handoff.md`. Historical reports remain evidence of their original
experiments; their input restrictions do not override this newly agreed experiment scope.
