# Python and Go acceptance evidence

**Purpose:** Identify bounded-profile qualification and reproducible discovery evidence for #267 and the #268 coverage handoff.
**Audience:** Product/specification owners, contributors including coding agents, and evaluation reviewers.
**Status:** Locally qualified candidate evidence; qualification outcomes are recorded in acceptance.json.
**Authority:** Implementation and validation evidence. Accepted [review contracts](../../type-function-review-proposal.md) and owner-approved #267 define behavior; inventories and controlled providers do not establish coverage or classifier accuracy.
**Expected use:** Reproduce the named checks and resume #268 using the exact evidence scope and limitations.
**Lifecycle:** Update qualification when profile, parser, capture, rule or native delivery boundaries change. Review upon acceptance of a support extension; remove superseded guidance while retaining source-bound records needed for current claims and open coverage decisions.

The merged implementation base is `69825bc5ae09c2da797939a7bb198c6f4c380be4`,
which incorporates #269/#270/#271/#272. [Current language guidance](../../adding-language-support.md#python-and-go-bounded-profiles)
and the README own navigation; the accepted contracts own precise support.
[acceptance.json](acceptance.json) records this candidate's executed qualification.
Native records under [native/](native) identify their own source revision and
archive digest. Earlier child records do not qualify the later combined candidate.
Archives and full logs remain local-only; tracked sanitized records survive worktree
cleanup. No source-bearing provider responses, credentials or raw host streams are retained.

[research-provenance.json](research-provenance.json) identifies the immutable
2026-10-09 advisory capture. The four temporary Markdown reports were consolidated
into accepted contracts, current guidance and the #268 handoff rather than retained
as maintained snapshots. [research/](research) retains the original source-only
manifests, inventories and replay scripts with exact upstream revisions/digests.
Script comments preserve their historical replay declarations; original absolute
local hints are advisory, not required artifact locations. Go replay verifies remote
pinned file digests; Python replay accepts the pinned inventory JSON, fetches those exact public codeload
archives and parses them without importing or executing surveyed projects. From the
repository root: `python3 docs/validation/python-go/research/python-coverage-inventory.py
docs/validation/python-go/research/python-coverage-inventory.json > /tmp/python-coverage-replay.json`.
Parser probes record authored synthetic syntax only, never provider responses.

These inventories are discovery evidence. Python's methods statistic has sampled
function definitions as its denominator. Go's large-directory statistic has sampled
production roots as its denominator. Neither measures adapter misses or actual user
edit frequency. No adapter coverage corpus or ecosystem percentage is established.

The Linux arm64 Codex controlled fixtures use explicit trust/sandbox settings and
prepared residents. Go selects pinned Bun for installation identity probing while
registered execution uses packaged hook/resident binaries. Owner-reported historical measurements: a prior default packaged
probe took 3516 ms against the 2000 ms bound; its Bun control took 183 ms. No verified
baseline established regression attribution. Default/cold setup, ordinary interactive
trust, Darwin execution, Claude delivery and real Jev classifier accuracy remain
unqualified. The default probe bound is unchanged; raw failed preview receipts are unavailable in this revision.
The final unchanged package conformance command passed after two earlier pre-preparation
Rust admission failures. Startup timing is a suspected cause, not established attribution.

For #268, acquire immutable target-user model edits with project/build context and
consent; classify useful supported and missed cases through the direct-edit/provider
seam with denominators reported per language, root family and rule. Start a separately
labeled small pilot, not a fixed benchmark or mandatory stage. Stop on the declared
pilot budget or when no useful edit cases can be acquired; report discovery-only
results in the latter case. Rank validator/constant-only edits, external-type rule
omissions, large-package authority, dynamic Python schemas/layouts, Go workspace/build
forms and grammar gaps by observed demand and a concrete resolving experiment.
No automatic expansion, 90% gate or budget increase is accepted.


| Dimension | Python | Go |
| --- | --- | --- |
| Edited roots | Annotated model classes, bound dataclasses/TypedDict/BaseModel, explicit aliases/type statements, nominal NewType | Named structs, aliases, defined scalar/container types, interfaces and generic types |
| Supporting evidence | Exact reachable declarations, local bases, eligible fallback stubs; full selected class source | Exact reachable package/module declarations, complete relevant typed/iota groups; scalar constants never exhaust runtime values |
| Bindings | Imported identities and lexical shadows, named/module aliases, relative/absolute imports, explicit initializer reexports, static TYPE_CHECKING and simple forward annotations | File-scoped imports, actual package names/default aliases, exported entry bindings and internal visibility, package-scoped sibling declarations |
| Authority | Unambiguous conventional flat/src packages and captured supported static setuptools metadata | One local module, explicit GOOS/GOARCH/user tags, active package membership and supported constraints |
| Rules | Three shipped type rules when required closure is complete; root-only custom rules can accept declared omissions | Same evidence gates; interface structure is open, not closed implementation enumeration |
| Opaque/unsupported | System/installed types, dynamic factories/exports/loaders/metaclasses, broad ORM/attrs, notebooks, validator-only edits | System/cache/vendor types, workspaces/replacements/nested modules, cgo, unknown constraints, dot-import ambiguity, constant-only edits |
| Shared limits | 8 captured files, 2 MiB/source, 12 MiB reads, 20 KiB canonical tree, depth 4, 16 outgoing targets, 128 work, 5-second analysis deadline | Same ceilings, plus 128 entries per package directory; discovery is not whole-package upload |

Every read obeys physical containment, ignores and context/source exclusions. Required
static authority is fingerprinted even when it is not emitted. Authority alternatives,
metadata and supporting-source changes invalidate prepared evidence; independent eligible
roots can proceed. No application imports, compilers, generators or build scripts run
during analysis. Qualification compilers operate only on isolated synthetic fixtures.

Unresolved coverage experiments, ordered provisionally by likely utility (not measured
frequency): (1) collect real validator-only Python and constant-only Go edits, check whether
they need a separately selected model-root policy (low discovery cost, scope decision
required); (2) quantify external-type rule omissions on those edits and test bounded leaf
knowledge (medium); (3) replay a large Go package exceeding eight captured files, compare
selective authority discovery within unchanged ceilings (high); (4) sample dynamic Python
factories/layouts and Go workspace/build forms, identify one demand-backed binding extension
(high); (5) run pinned syntax probes for Python parameter defaults and compact Go constants,
compare a maintained compatible grammar fix (low probe cost, native packaging cost separate).

Historical source corpus: Python's raw selected stratum contains 4593 files across six
purposive projects, 53123 function definitions and 30825 direct methods. Its explicitly
focused subsample contains 4403 files, 51458 functions and 30616 methods; the earlier
59.5% statistic is 30616/51458 in that subsample. Each stratum has one parse error.
Go contains 320 evenly spaced sorted paths across four projects, including 119 test
files and two generated files. Go's 53.1% production-root/directory-size statistic
uses its separate production subset. Neither statistic measures Hapsland misses or
user-edit coverage. No target-user edit denominator exists.
