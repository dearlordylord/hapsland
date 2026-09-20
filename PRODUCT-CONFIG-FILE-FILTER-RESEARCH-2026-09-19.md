# Configuration file-filter research

Status: advisory input to Phase F Q17, not normative configuration policy.
Date: 2026-09-19. Canonical path: this file. Initial pass; supersedes no report.
Method: [PRODUCT-RESEARCH-METHODOLOGY.md](./PRODUCT-RESEARCH-METHODOLOGY.md).

## Research brief

Question: do standards or established developer tools determine how built-in, user,
and project include/exclude lists should combine? Distinguish syntax, merge rules,
pattern matching, and protection of user privacy. The task is a bounded pattern study,
not a new dependency or configuration-feature proposal.

Accepted context: one JSONC project file at the Git working-tree root; built-in → user
→ project review-policy precedence; user privacy restrictions cannot be weakened by
project policy; repository/backend consent; local rule packs. The host is currently
Codex, with host-neutral eligibility desirable. Selection must behave identically for
interactive and headless post-edit review. Optional blocking is outside Phase F;
coexisting tools retain their own settings. A remote Jev failure occurs after local
eligibility and does not justify widening selection.

Existing-solution baseline: reuse an established configuration/filter contract whole.
Evaluate precedence, array treatment, roots, defaults, negation, and whether exclusion
actually prevents processing. Evidence of a widely applicable mandatory standard, or
a reviewed existing contract satisfying both the accepted privacy boundary and simple
layering, would overturn independent composition. Bound the pass to one merge standard,
one JSONC syntax reference, and three established tools with distinct roles. Discovery
used direct primary-document lookups: RFC 7396; VS Code JSONC; TypeScript `extends`,
root `include`/`exclude`; ESLint flat configuration/ignores; Git `gitignore`.

## Candidate inventory

| Candidate | Class / included reason | Intended use |
|---|---|---|
| RFC 7396 | Configuration-composition analogue; actual merge standard | Array replacement precedent |
| VS Code JSONC documentation | Configuration syntax/editor surface | Separate syntax from policy |
| TypeScript tsconfig | Compiler configuration; closest familiar JSON settings | Inheritance/default-selection comparison |
| ESLint flat config | Rule engine configuration | Rule applicability versus global exclusion |
| Git gitignore | Adjacent VCS control | Layered personal/project ignores and negation |

Ripgrep is excluded from this bounded pass: Git and ESLint already provide two distinct
ordered-ignore comparisons; another CLI does not settle the accepted privacy authority.
OPA/managed policy engines are excluded because no executable policy or managed
organization layer is in scope. No registry/distribution candidates are needed for
local-only packs. This does not claim exhaustive ecosystem discovery.

## Evidence ledger

All sources below were accessed 2026-09-19. Source class is **DOC** and verification
state **DOCUMENTED** for E1–E8. No source inspection or runtime checks were performed.
Living documentation is date-scoped, not a claim about an installed release. Each
entry affects file selection for both supported host modes; none establishes host
execution, enforcement, credentials handling, or remote-call behavior.

| ID | Exact proposition and source location | Limitation |
|---|---|---|
| E1 | [RFC 7396 §2](https://www.rfc-editor.org/rfc/rfc7396#section-2): object members recurse; a non-object patch replaces the target, so arrays replace as complete values. §5 leaves authorization to the receiving application. | October 2014 standard for JSON Merge Patch, principally HTTP PATCH; not an include/exclude or general configuration standard. |
| E2 | [VS Code, JSON with Comments](https://code.visualstudio.com/docs/languages/json#_json-with-comments): JSONC editor mode accepts line/block comments; schema support describes/validates structure. | Syntax and editor support do not establish inheritance or file-matching policy. |
| E3 | [TypeScript `extends`](https://www.typescriptlang.org/tsconfig/extends.html): derived `files`, `include`, and `exclude` replace their inherited counterparts; relative paths retain their originating configuration directory. | No cumulative exclusion guarantee. |
| E4 | [TypeScript root `include`/`exclude`](https://www.typescriptlang.org/tsconfig/#include): supported wildcard patterns select source files; default include is `**/*` unless `files` is specified, then `[]`. Exclude filters include discovery, but imports/references/explicit files can still bring a file in. | Compiler membership filtering is not a source-egress boundary. The separate `/include.html` and `/exclude.html` pages currently describe type acquisition and were not used for these claims. |
| E5 | [ESLint configuration objects and cascade](https://eslint.org/docs/latest/use/configure/configuration-files#specifying-files-and-ignores): minimatch patterns normally use the configuration directory; matching objects merge with later conflicts winning. Per-object ignores prevent that object applying; global ignores apply across objects. | This is conditional configuration composition, not inherited array replacement. Alternate config and `basePath` alter roots. |
| E6 | [ESLint ignore files](https://eslint.org/docs/latest/use/configure/ignore): global ignores append after default `.git`/`node_modules` ignores; negation can re-include previously ignored paths. Default JS selection remains when additional extensions are configured. | Ignoring whole directories affects traversal and possible re-inclusion. Not irrevocable user permission. |
| E7 | [Git ignore description and pattern format](https://git-scm.com/docs/gitignore): layers have priority and the last matching pattern at a level decides. Project `.gitignore` takes priority over `core.excludesFile`; `!` can re-include. Tracked files are unaffected. | An ignore file is not a privacy policy. Excluded parent directories prevent re-including contained files without restoring traversal. |
| E8 | [Git ignore pattern format](https://git-scm.com/docs/gitignore#_pattern_format): patterns depend on the ignore-file directory and slash placement; excludes outside the working tree are treated as rooted at the working-tree root. | Git basename matching differs from ESLint; syntax cannot be described merely as “standard glob.” |

## Comparable candidate cards

These are targeted contract cards. For all candidates, lifecycle hooks, review findings,
blocking, remote retries, host failures, session state, and provider behavior are **NOT
APPLICABLE** to the proposed pattern use. Runtime conformance is untested. Package
license compatibility and maintenance gates are **UNKNOWN/not evaluated** because no
dependency or source-code copying is proposed.

| Candidate | Contract, extension/composition, state | Privacy/portability/operations | Decision |
|---|---|---|---|
| RFC 7396, October 2014 | Data transformation with object recursion and array replacement; E1 | No file scope or authority model; adoption would need product-specific constraints | **BORROW** replacement precedent; **REJECT** wholesale merge-patch semantics for protected exclusions |
| VS Code JSONC, docs accessed above | Data syntax/editor validation; E2 | Host-independent representation, no permission boundary | **BORROW** syntax/policy separation; not a runtime dependency recommendation |
| TypeScript tsconfig, date-scoped docs | Data inheritance and replacement; E3–E4 | Origin-relative paths; compiler discovery can expand beyond exclusion | **BORROW** include replacement; **REJECT** compiler exclusion semantics as privacy enforcement |
| ESLint flat configuration, date-scoped docs | Ordered conditional objects and separate global ignores; E5–E6 | Useful distinction between applicability and total exclusion; neither promises immutable personal protection | **BORROW** conceptual separation; **REJECT** full ordered/negated configuration machinery for this minimal phase |
| Git gitignore, date-scoped docs | Ordered layered text patterns with override/negation; E7–E8 | Familiar root treatment for global patterns; concerns intentionally untracked files | **BORROW** repository-root interpretation for user patterns; **REJECT** Git ignore precedence as privacy authority |

No **DEPEND ON** or **OPTIONAL INTEGRATION** recommendation is made, so dependency gate
tables are not applicable. In particular, no automatic `.gitignore` loading is proposed.

## Capability comparison and synthesis

| Question | RFC 7396 | TypeScript | ESLint | Git |
|---|---|---|---|---|
| Arrays replace? | Yes, E1 | Relevant lists yes, E3 | Different composition model, E5 | Not applicable: ordered text patterns, E7 |
| Exclusion is permanent across later policy? | No authority supplied, E1 | No, E3–E4 | No, E6 | No, E7 |
| Path base specified? | Not applicable | Origin config, E3 | Config/basePath/CLI context, E5 | Ignore location or working-tree root, E8 |

Cells summarize **DOC/DOCUMENTED** evidence, not runtime tests. The inference from
E1–E8 is that this pass establishes no universal inheritance contract. Array replacement
has strong precedent; accumulation and ordered re-inclusion also have established uses.
The convergent lesson is explicit precedence and roots, not one common algorithm.

For the product, the simplest advisory choice remains Q17's proposed policy:

- The highest-precedence supplied include list replaces the inherited include list.
- Exclusions accumulate from all three layers, and any exclusion wins.
- Treat exclusion entries as positive deny patterns; do not add negated re-inclusion
  in this phase. A leading `!` should be rejected clearly if unsupported.
- Evaluate filter patterns against repository-relative paths, including patterns in
  user settings. This is independent of where a local rule-pack file is resolved.
- Omission inherits; an explicit empty include list selects nothing. An empty project
  exclude list adds no exclusions and cannot clear inherited ones.

This is **product-policy inference**, grounded primarily in the accepted privacy
constraint, rather than compliance with an external standard. It avoids introducing a
second exclusion namespace now. It also makes ordinary exclusions hard restrictions:
to undo an overbroad user exclusion, the user edits the user setting that supplied it.

Strongest counterargument: permanent accumulated excludes are less flexible than familiar
overrides and make broad built-in defaults hard to undo. Built-in exclusions should
therefore be narrow and explicit. If real workflows require safe per-project exceptions,
revisit separating overridable selection defaults from protected privacy restrictions;
do not quietly turn the current exclusion list into last-match-wins.

No examined existing contract alone satisfies the accepted privacy ownership while
also providing the proposed minimal layering. That supports borrowing small patterns,
not importing a policy framework. This sufficiency conclusion is bounded to the selected
contracts and does not establish that no suitable library exists.

## Specification and prototype handoff

All rows are proposals awaiting a specification decision; they do not settle Q17.

| ID | Advisory implication / evidence and counterevidence | Workflow; uncertainty/consequence | Disposition / acceptance check |
|---|---|---|---|
| P1 | Includes replace; E1/E3, unlike E5 composition | Both Codex modes; surprising inheritance can select unwanted files | Specification + offline test: user `src/**`, project `lib/**` selects only eligible `lib` files |
| P2 | Exclusions union with deny winning; accepted user authority; E3/E6/E7 show competing conventional behavior | All outgoing files; weakening could permit unintended egress | Specification + offline test: user excludes `**/*.secret.ts`, project includes `lib/**`; secret stays excluded even with project exclude `[]` |
| P3 | One repository-relative matching root; E8 precedent, E3/E5 different roots | User/project settings and subdirectory invocations; root mismatch can bypass intent | Specification + offline test: invocation from root or `src/` gives identical eligibility |
| P4 | Omitted versus empty lists and unsupported negation are explicit | Both modes; ambiguous defaults can widen selection | Specification + offline tests: omitted include inherits, `[]` selects none, unsupported negation errors before send |
| P5 | Exclusion is enforced independently of source discovery; E4/E7 caution | Explicit hook file paths; ignored/tracked/imported distinctions must not override privacy | Implementation acceptance: excluded explicit file produces zero backend calls |

Exact glob dialect, case sensitivity, separator normalization, dotfiles, symlink handling,
and the built-in list still need implementation/spec alignment. No matcher is selected
here. Test existing path safety together with the eventual matcher before claiming an
egress boundary; documentation about other tools cannot establish this product's runtime
behavior.

## Limits and stopping condition

The declared bound was reached: one relevant standards comparison and three distinct
tool contracts, plus syntax context. No ecosystem-saturation claim is made. The next
discovery step, only if a disputed matching behavior requires it, is the selected matcher
implementation and its versioned tests. This pass did not run tools, benchmark latency,
test failure enforcement, add dependencies, or expand local pack scope. The evidence
ledger is the primary-source index; stable RFC numbering and documentation access dates
are provided for replay. No prior report is superseded and no forward-link cleanup is
required.
