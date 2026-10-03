# Review contract compatibility

**Purpose:** Record how direct-edit type and function review fits configuration, rules, identity, and delivery.
**Status:** Maintained; amended by the 2026-09-29 owner decision.
**Authority:** Accepted product contract for the named compatibility decisions. Tests and conformance records supply implementation evidence.
**Expected use:** Check changes to configuration, rule packs, review input, and review result reuse.
**Lifecycle:** Review when any of those boundaries or the #93 type/function contract changes.

The owner approved bounded cross-file source use for direct-edit type and
function review on 2026-09-29. The earlier one-file named-type input is retired
as a production route. A later comparison of advice quality is a separate task;
this decision does not claim measured live Jev quality. The [#93 contract](type-function-review-proposal.md)
owns the source, completeness, and input requirements.

## Configuration and rule packs

Configuration remains version 1. Built-in, user, and project layers retain
their order. A higher include list replaces a lower one, exclusions accumulate,
and protected paths cannot be restored by an include. Every root and supporting
file passes containment, protected-path, Git-ignore, and file-selection checks
before Hapsland reads its source. Configuration must be valid before source
capture. The old repository grant is not a dispatch gate.

Authored packs for direct review use schemaVersion 1, updated in place during
this pre-release phase. Each rule declares
reviewTargets with an exact artifact kind, input contract, and required
capabilities. A rule shared by type and function review names both targets.
Unknown versions, targets, capabilities, or fields fail the selected pack.
Invalid or unsupported pack versions fail configuration before source capture.
Bundled Noul rules target type review; its body rule also targets function review.
The function target of the body rule requires the exact signature and body, not
complete call/type closure. It reviews resource use visible in included source
with omissions retained explicitly; missing references alone are not findings.
Other targets retain their declared closure requirements.
Rule IDs, enablement,
path filters, probability thresholds, and authored messages retain their
configured meanings. Choice and Score result forms remain separate decisions.

## Review input and result identity

The active input contracts are direct-event/type-shape/v1 and
direct-event/function/v1. Each request carries one changed root and its
bounded evidence tree with marked omissions. Supporting declarations can come from other
selected files through supported local imports. They do not become separate
edited roots. Omitted reference sites may contain opaque expression text, such
as an anonymous callback or dynamic call, rather than a named binding. This
text remains a bounded JSON string with its omission reason; it neither adds
a resolved node nor makes the graph complete. Resolved edges retain their
named-reference grammar, and the aggregate evidence-size limit still applies.
The request contains neither a whole file nor an edit diff,
agent transcript, absolute path, or unrelated source.

Hapsland selects each rule only when its declared evidence needs are met. A
rule may run with a marked omission that is irrelevant to it. If no rule applies,
Hapsland sends no request. A review input's identity includes the exact input contract,
renderer, root, evidence tree, selected rule definitions, and effective
policy. Source-file fingerprints support freshness checks but do not by
themselves change semantic identity when an unrelated comment moves. Before
dispatch, Hapsland requires the captured files to match exactly. Before
advice, it rereads contributing files and rebuilds the unit; changed review
input, rules, file selection, attribution, or working root retires the result.
Only a still-current matching unit may reuse a successful review-backend result.
The prepared identity includes the selected provider, model selector, and full
destination; a change to any of these invalidates reuse. See the
[provider boundary](review-providers.md) for transport validation and declared limits.

Update attribution currently requires an exact verified post-edit span. Codex
`apply_patch` hunks, Claude `Edit`/`Write` native content evidence, and Pi 1.0.0 native `edit` unified-result patches can supply one. Pi verifies the exact patch coordinates against bounded current source; it does not retain a separate pre-edit image. Every supplied replacement must be accounted for exactly once within native hunk material; a replacement spanning omitted context across separate hunks remains incomplete. Native Pi `write`, nested/child mutations, shell mutations, and custom tools are unsupported/incomplete rather than inferred Add or Update observations. Source containing non-ASCII characters currently fails this coordinate
check closed for both Add and Update, so the path produces no review unit.
[#151](https://github.com/dearlordylord/hapsland/issues/151) tracks this limit.

The previous compatibility assessment for the one-file input remains in Git
history. Its old prospective gates do not govern the 2026-09-29 decision.
