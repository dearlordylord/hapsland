# Issue #96: contract compatibility before new review branches

Status: compatibility assessment of the [#93 target type and function specification](./issue-93-type-function-review-spec.md). The 2026-09-27 owner decision changes its evidence boundary to checked, bounded cross-file supporting references and its target source ceiling to 256 KiB. Existing installed behavior is still same-file and 32 KiB until migration and validation; this assessment does not claim that branch implementation, live Jev evaluation, or expanded source egress has occurred. The #93 prototype and adoption gates remain open.

## Current contract and compatibility decision

| Boundary | Current v1 behavior | Decision for the #93 proposal |
| --- | --- | --- |
| User and project configuration | Strict `version: 1` JSONC; built-in, user, and project layers; includes replace and exclusions accumulate | Preserve v1 fields, precedence, and effective selection. No implicit switch enables a branch. Reject unknown configuration fields and versions before source egress. |
| Rule packs | Strict `schemaVersion: 1`; omitted threshold becomes 0.7; Boolean criteria, question, and message compile to `Decision.probability` | Preserve v1 decoding, digests, and supported whole-file and named-type behavior. V1 packs do not acquire new targets by omission. Use a separately versioned, strict reader for explicit #93 targets. |
| Overrides | Qualified `pack/rule` IDs, enablement, path filters, probability threshold, and message | Preserve v1 identities and override meaning. Path filters only narrow global selection. Target-specific policy and non-probability controls need an explicit later contract. |
| Review identity and findings | Pack-content and rule-definition digests identify compiled rules; existing advice/direct-event findings carry probability | Keep v1 identities and findings stable. New evaluation identity must include exact target, input/renderer contract, complete projection, selected rule definitions, and effective policy. Never encode Score as probability. |
| Direct-event input | `direct-event/same-file-named-types/v1`, 32 KiB source capture, and its existing probability interpretation | Migrate deliberately to the #93 cross-file target and 256 KiB per-source-file ceiling. The named type/function inputs need distinct exact IDs, complete evidence projections, renderers, and conformance evidence. Existing source-bearing requests must not change silently during migration. |
| Setup and doctor | Current setup asks for a separate repository enable confirmation; doctor reports its grant state. | Remove that extra confirmation and grant check. When the installed agent runtime runs Hapsland and Jev credentials are available, file selection controls review. With no file settings, all otherwise eligible files are selected. Update setup and doctor to state this plainly. |
| Published schemas and guide | Generated config-v1 and rule-pack-v1 schemas reject unknown fields | Keep v1 artifacts and [configuration guidance](./configuration.md) as the supported contract. Publish a separate v2 pack schema only after its syntax is accepted. |

## Reader and migration boundary

Configuration v1 needs no new field for the target branches. Existing user
and project files keep their include/exclude precedence, pack references,
rule overrides, and credential reference. No file settings means the
built-in include pattern selects all otherwise eligible files. Every root
and supporting file still passes containment, protected-path, Git-ignore,
and file selection checks before its source is read. The target removes
the separate repository enable and confirmation steps. Setup and doctor
must explain when an installed runtime can send selected source to Jev;
they must not show a grant as a required readiness gate.

The proposed `rule-pack/v2` makes `reviewTargets` required on each rule. Every target names `artifactKind` (`typeShape` or `function`), an exact `inputContract`, and enumerated required evidence capabilities. The #93 contract IDs are `direct-event/type-shape/v2` and `direct-event/function/v1`; no wildcard kind or unversioned contract alias is accepted. A rule shared across branches declares both targets, with branch-specific criteria/message represented by separate rule IDs or an explicitly specified target-specific definition. A v1 pack has only its existing implicit applicability; migration to either #93 branch requires an authored v2 target. Neither v1 configuration nor a v1 pack opts in silently.

The #93 prototype keeps `Decision.probability` and one logical request per complete unit's selected rule batch. Choice and Score remain separate, undecided result-form work. The exact syntax, versioning, typed findings, overrides, and process boundary for those forms must be decided before use; they are not a required v2 field under the present #93 proposal. V1 probability thresholds retain their meaning and cannot act as generic controls for a future form.

A future pack reader must dispatch on `schemaVersion` before decoding: v1 through its frozen decoder/compiler and v2 through a strict v2 decoder/compiler. Unknown versions, target IDs, capabilities, and form declarations outside an accepted schema fail the selected configuration before egress. There is no down-conversion to v1 probability. Today the decoder reports unsupported `schemaVersion`, `reviewTargets`, `target`, and `resultForm` at their source fields. V1 pack digests, rule-definition digests, qualified IDs, and bundled Noul keys remain unchanged.

## Evidence gate and evaluation order

The #93 rule applies to the **whole review unit** before Hapsland selects a
rule. Hapsland must find the root and every required reference. Before it
reads a supporting file, it checks that file's path against containment,
protected/privacy paths, Git ignore, and file selection. If a required
reference is excluded, missing, ambiguous, unsupported, or over the 20 KiB
tree limit, the dependent unit is incomplete. Hapsland sends nothing for
that unit to Jev and does not call it clear. Other complete units can proceed.
No partial tree or omission report is sent to Jev.

Only a complete unit can reach rule selection. Hapsland selects rules from
the root kind, exact input format, available evidence, rule path settings,
and the rule's own conditions. A rule cannot excuse a missing reference.
If no rule applies, Hapsland sends no Jev request. Every unit still needs
an attributed edit, selected files, stable source, size limits, and a fresh
check before advice. Local status may count skipped units without source
text. It must not call a skipped unit clear.

Hapsland may reuse a Jev result only if the same selected root, complete
evidence tree, rules, effective file settings, and exact Jev input format
still apply. Before advice, it checks every source file that contributed
to the review unit and rebuilds the unit. If a required file is now
excluded or relevant content changed, it drops the old result. The current
same-file code does this only for event-named files; cross-file checks
remain to be implemented.

## Acceptance fixtures and remaining decisions

Current offline tests in `src/configuration/configuration.test.ts` cover layered v1 files, inherited pack references, exclusion precedence, and rejection of future config controls. `src/rules/rules.test.ts` covers v1 defaults and digests and rejects representative targets, result forms, and schema v2. Existing setup, doctor, loader, direct-event, and consent tests exercise the installed contract; they do not establish v2 branch support.

Before adoption, #93 must fix the expected complete/incomplete examples,
supported import forms, rule-pack fields, exact Jev input, file/read/work
limits, setup wording, host profiles, and evaluation checks. Remove the
current grant gate from setup, doctor, CLI, and resident as part of the
file-settings migration in #132; keep current instructions truthful until
that code lands. Raise or rework resident capacity with the 256 KiB file
limit. Offline tests must show that Hapsland never reads an excluded
supporting file and never sends an incomplete unit to Jev. Choice/Score
results remain a separate #96 decision.
