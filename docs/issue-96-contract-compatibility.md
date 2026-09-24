# Issue #96: contract compatibility before new review branches

Status: present-day compatibility decision. The proposed branch behavior is in
[#93](./issue-93-type-function-review-spec.md); neither document enables it.

## Inventory

| Boundary | Current contract | Compatibility consequence |
| --- | --- | --- |
| Project and user configuration | `version: 1`, strict JSONC; built-in, user, project layers; includes replace and exclusions accumulate | Keep v1 fields and layer behavior. A new branch is not selected through an implicit config default. |
| Rule packs | `schemaVersion: 1`, strict fields; omitted threshold becomes 0.7; `question`, Boolean `criteria`, and message compile to `Decision.probability` | V1 retains current probability behavior in the existing whole-file and named-type paths. Target or result-form declarations need a separately versioned pack reader. |
| Overrides | Qualified `pack/rule` IDs; enablement, path filters, threshold, message | Existing overrides retain their identity and meaning. Threshold is specific to probability; a later Choice or Score form needs its own typed controls. |
| Rule and finding identity | Pack content digest and rule-definition digest feed compiled identity. Whole-file `Advice` and direct-event findings contain a probability. | A future form needs a tagged result and versioned finding/process boundary; do not put a score into `probability`. Target and effective result policy must enter evaluation identity. |
| Direct-event input | `direct-event/same-file-named-types/v1`; complete named-type units, probability interpretation | Type-shape v2 and function v1 use distinct exact input IDs, renderers, and evidence requirements. V1 bytes and interpretation stay fixed. |
| Setup, doctor, and consent | Version-1 Codex setup/doctor responses; repository-wide eligible-source consent bound to canonical root, backend, destination, and scope | Installed consent stays valid for its existing scope. A later expansion must preview any enlarged source or host scope and obtain authorization when required. Setup/doctor must report supported host and input profiles before claiming readiness. |
| JSON Schemas and guide | Generated config-v1 and rule-pack-v1 schemas with unknown fields rejected | Keep these artifacts unchanged. Publish a separate v2 rule-pack schema when its syntax is accepted. |

## Version and reader decision

Configuration v1 needs no new setting for either proposed branch or result form.
An installed v1 user/project file continues to load with the same effective
selection, exclusions, rule overrides, and consent state. Unknown config fields
and versions remain errors. An opt-in, if later needed, must be specified in a
new config version or another explicit versioned contract; this readiness work
does not expose a setting that appears to enable unsupported review.

Rule-pack v1 has *implicit* applicability to the existing review inputs and a
binary probability question. Adding optional target/form fields to v1 would
silently change what omission means when the new compiler arrives. Reserve
`schemaVersion: 2` for explicit per-rule `reviewTargets` and a typed result-form
declaration. The proposed target records in #93 name `artifactKind`, exact
`inputContract`, and required evidence capabilities. Candidate contract IDs are
`direct-event/type-shape/v2` and `direct-event/function/v1`; the present reader
rejects them. Choice and Score are representative future forms, not accepted
syntax or enabled decisions. The exact result-form shape, rule-level override
semantics, finding shape, and setup presentation remain open specification work.

A future reader should dispatch on `schemaVersion` before decoding: v1 through
the frozen v1 decoder and compiler, v2 through a strict v2 decoder and compiler.
Unknown versions and target/form values must fail the selected configuration
before source egress. No silent down-conversion from v2 to probability is allowed.
Current decoding reports unsupported versions and v1 `reviewTargets`, `target`,
or `resultForm` declarations at their source fields. The v1 digest and qualified
IDs remain untouched.

Every future target must still pass global selection, protected and privacy
exclusions, repository consent, host attribution, stable capture, and its own
required evidence gate. A rule filter can only narrow global eligibility. The
current v1 profile and consent record must not imply support for a new function
branch or another host. Existing whole-file review continues under its current
consent and request contract.

## Acceptance fixtures and handoff

`src/configuration/configuration.test.ts` exercises old mixed user/project
documents, inherited pack references, and exclusion precedence, and rejects
future config controls. `src/rules/rules.test.ts` locks v1 defaults/digest and
rejects representative function target, Choice, Score, and v2 declarations.
Existing setup, doctor, direct-event, and rule-loader tests cover installed
consent reuse, strict pack loading, and probability findings.

Before #93 implementation, settle the exact v2 JSON schema, whether rules with
multiple targets need per-target criteria/message, the typed Choice/Score result
and override semantics, and process/setup versioning. The [#93 branch proposal](./issue-93-type-function-review-spec.md)
owns extraction, evidence completeness, input rendering, and acceptance gates.
