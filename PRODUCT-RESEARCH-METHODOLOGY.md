# Product research methodology

**Status:** advisory method for comparative research. It feeds product specification work;
it is not itself the product specification.

**Revision:** 2, incorporating independent Astra review and lessons from the first
methodology-backed rerun.

## Purpose

Research should answer four questions for every existing solution:

1. **What can we borrow?** Architectural patterns, contracts, safety controls, test
   methods, or operational practices worth reimplementing independently.
2. **What can we depend on?** A specific component whose API, behavior, maintenance,
   license, trust boundary, and replacement cost justify product coupling.
3. **What can we integrate optionally?** A neighboring system that should remain outside
   the core, such as an orchestrator, reporter, CI gate, or hard-policy engine.
4. **Can an existing solution satisfy the target workflows?** Treat “use an existing
   solution” as the baseline that a build recommendation must disprove.

The outcome is advisory input for later specification, prototype, or both. A research
classification is not authorization to adopt a dependency and must not silently become a
product requirement.

## 1. Research brief and candidate discovery

Write the brief before selecting candidates. It must contain:

- the research question, date, scope, and current product assumptions;
- representative workflows, including advisory post-edit feedback, optional blocking,
  multiple installed tools, headless execution, and failure of the remote Jev call;
- target agent hosts and required versus desirable capabilities;
- evaluation questions and an explicit existing-solution baseline;
- evidence that would overturn the current build, borrow, or dependency preference;
- discovery sources and search queries: official host ecosystems, package registries,
  code search, known projects, citations from candidate documentation, and issue trackers;
- inclusion and exclusion criteria, with a reason for every excluded serious candidate;
- a bounded stopping condition, such as two successive discovery passes producing no new
  candidate class or materially different architecture.

The brief is provisional advisory context, not a specification. If it changes during the
pass, record the change and reassess candidates rather than silently moving the goalposts.
If the final discovery round still finds a materially different architecture, the pass may
stop at its declared budget but must say that saturation was not reached and name the next
discovery step; it must not claim ecosystem completeness.

Classify each candidate before comparison:

- agent host;
- host-adapter/compatibility layer;
- rule or policy engine;
- configuration compiler/distributor;
- orchestration/control plane;
- finding/review reporter;
- model/provider gateway, secondary unless it changes the host boundary or Jev data flow;
- adjacent CI, VCS, or security control.

Do not compare projects from different classes as if they implement the same boundary.

## 2. Evidence model

Record two independent attributes for every material proposition.

Use primary sources for evidence: official documentation/specifications, repository source
and tests, released artifacts, and first-party issue or maintainer records. Secondary
sources may discover candidates or contradictions, but a material claim must be traced to
the source that owns it or remain `UNKNOWN`.

### Source class

- **DOC:** official documentation or published specification.
- **SRC:** source code, tests, fixtures, manifests, release notes, or generated artifacts.
- **RUN:** a retained result from a reproducible execution performed in this research pass.
- **ISSUE:** issue, pull request, or maintainer statement used to establish ambiguity,
  failure, history, or intended behavior.
- **META:** license, version, release, commit, adoption, or maintenance metadata; never
  proof of runtime behavior.

### Verification state

- **DOCUMENTED:** the source establishes what the project says or specifies, not that the
  behavior works at runtime.
- **SOURCE-INSPECTED:** implementation or tests visibly support the exact proposition, but
  the behavior was not independently executed.
- **RUNTIME-TESTED:** the exact proposition was exercised with a recorded environment,
  command/fixture, expected result, observed result, and retained output.
- **INFERRED:** a conclusion derived from cited evidence; state the inference and its
  assumptions.
- **UNKNOWN:** applicable, but not safely established.
- **NOT APPLICABLE:** outside this candidate class or intended boundary.

State the exact proposition and scope. For example, a README may establish
`DOC/DOCUMENTED: project advertises a Codex adapter`; it does not establish runtime
compatibility. Never use `Verified as README claims` or collapse documentation and runtime
verification into one label.

When sources conflict, record the competing propositions, source classes, versions/dates,
and observed result. Do not resolve a contradiction merely by applying the source ordering.

## 3. Evidence ledger and replay

Every material claim and capability-matrix cell must reference a compact evidence ledger
entry containing:

- stable claim identifier and exact proposition;
- candidate, component, intended use, and affected host/workflow;
- source URL plus commit/tag, immutable blob link, release version, or documentation
  access date;
- source class and verification state;
- relevant quotation or source location, paraphrased when quotation is unnecessary;
- limitations, counterevidence, contradictions, and unresolved assumptions;
- for `RUN`: OS/runtime, host and candidate versions, configuration, command or fixture,
  expected result, observed result, exit status, and retained output path.

Mark unexecuted checks explicitly. A reader must be able to tell whether two claims concern
different versions or configurations and reproduce every `RUNTIME-TESTED` claim.

For enforcement claims, record the strongest boundary actually evidenced:

1. configuration or documentation names a control;
2. an install witness proves an artifact is present;
3. a handler returns a decision in a fixture or unit test;
4. a live host visibly enforces the decision against the intended action;
5. enforcement remains defined when the handler hangs, crashes, is killed, or loses its
   backend.

Do not promote one level into another. In particular, an installed hook or handler-level
`deny` does not prove that the host prevented the operation, and simulated remote failure
does not establish behavior when the hook process itself dies.

## 4. Candidate-review procedure

For each candidate, produce one comparable card in this order:

1. **Identity and role:** exact component, version/commit/date, class, intended boundary,
   license, and proposed product use.
2. **Lifecycle:** exact pre/post/edit/session/commit/CI events, payload fidelity, and
   whether the candidate can block, ask, rewrite, warn, add context, or only observe.
3. **Canonical contract:** event/action schema, finding schema, decision algebra,
   aggregation, and conflict precedence.
4. **Failure behavior:** timeout, exception, crash, unavailable capability, retry,
   fail-open/fail-closed, and headless/non-interactive `ask` semantics.
5. **Extension model:** user rules/plugins, discovery, packaging, trust, config ownership,
   independent release/versioning, and whether rules are data or executable code.
6. **Composition:** load/install order, multiple tools, collision handling, idempotence,
   CLI/MCP/hook/CI/reporting modes, and coexistence with other tools.
7. **State:** baselines, history, deduplication, caching, concurrency, and re-entry when
   the agent edits in response to its own finding.
8. **Security and privacy:** source/secret egress, credentials, path exclusions,
   sandboxing, project-local weakening, audit logs, and trust boundaries.
9. **Portability:** host capability matrix, native versus generated surfaces, version
   assumptions, unsupported features, and explicit degradation. Record model-provider
   support only when it changes lifecycle behavior, authentication, cost, or data egress.
10. **Operations:** latency, findings budget, observability, fixtures, end-to-end tests,
    release policy, maintenance, adoption, integration cost, and replacement cost.

Every unknown must either remain visibly unknown or name the experiment needed to resolve
it. Absence of evidence is not a negative result.

## 5. Decision classification

Classify the stated component and intended use, not an entire project in the abstract:

- **BORROW:** reimplement a pattern or contract; do not add the component as a runtime
  dependency.
- **DEPEND ON:** conditionally recommend a component as a dependency after its gate below
  passes. The label remains advisory and does not authorize adoption.
- **OPTIONAL INTEGRATION:** support the component at an edge without coupling the review
  core to it.
- **REJECT:** do not use or emulate the component for the stated use; cite the reason.

A candidate may have secondary lessons, but the primary classification for each stated use
must be unambiguous. “Full” and “targeted” describe research depth, not adoption.

For every `DEPEND ON` recommendation, include a gate table with evidence, status, unresolved
conditions, and the resolving experiment for:

- license compatibility;
- API and versioning guarantees;
- real-host conformance for required workflows;
- trust boundary, source egress, credential handling, and supply-chain exposure;
- timeout, crash, degradation, and fail-open/fail-closed behavior;
- maintenance/release health and compatibility ownership;
- integration and ongoing adapter cost;
- replacement/exit cost and an available fallback.

Each gate status is `PASS`, `FAIL`, or `UNRESOLVED`; define mandatory gates for the stated
use before scoring the candidate.

A failed mandatory gate becomes `BORROW`, `OPTIONAL INTEGRATION`, or `REJECT`. An unresolved
gate remains a conditional recommendation pending a named spike; it is not silently passed.

## 6. Comparative synthesis and disconfirmation

After the cards, produce:

1. a capability matrix using the verification states above, with claim identifiers;
2. a borrow/depend/integrate/reject matrix scoped to component and intended use;
3. convergent patterns appearing in multiple independent systems;
4. conflicts and trade-offs, such as advisory versus blocking or fail-open versus
   fail-closed;
5. product implications phrased as candidate requirements, not settled requirements;
6. unresolved questions for specification or prototype;
7. a sufficiency assessment for the existing-solution baseline;
8. the strongest case against the recommended architecture and evidence that would change
   the recommendation.

The report must state search limitations and avoid claiming ecosystem completeness beyond
the research brief's sources and stopping condition.

## 7. Specification/prototype handoff

For every proposed product implication, provide a traceability row containing:

- implication identifier and advisory statement;
- supporting claim identifiers and counterevidence;
- affected workflow and agent hosts;
- uncertainty and consequence if wrong;
- proposed specification decision, prototype acceptance check, or both;
- disposition: take to specification, take to prototype, take to both, or defer with a
  reason and revisit condition.

Research does not require both later phases for every implication. Specification may be
deferred when runtime behavior must be discovered first; a prototype may be deferred when
the issue is purely contractual. Compatibility claims derived only from documentation must
not become settled requirements without an explicit decision.

## 8. Research lifecycle and cleanup

Each pass must declare its scope and canonical report path. A later report records whether
it fully supersedes an older pass or updates only named scopes.

When a pass supersedes older research:

- link the old report forward and the new report backward;
- include a change log naming conclusions that changed and why;
- retain useful evidence-ledger entries and decision-relevant rationale;
- remove duplicated conclusions or stale rankings only after the repository history or
  another stable revision preserves their provenance;
- preserve specialized reports, such as cleanroom specifications, when their scope remains
  distinct;
- do not leave two competing current recommendations or create a separate archive pile.

If the report author cannot edit older documents, the new report must list forward-link
cleanup as outstanding. The repository owner must complete those links before calling the
new report canonical.

Partial supersession invalidates only the named scope. Unrelated conclusions remain valid
until explicitly revisited.

## 9. Required report structure

The canonical `PRODUCT-RESEARCH-ADVISORY-YYYY-MM-DD[-PASS].md` contains:

1. research brief and change log;
2. candidate inventory with inclusion/exclusion reasons;
3. evidence ledger;
4. comparable candidate cards;
5. capability and decision matrices;
6. dependency gate tables, if any;
7. synthesis, sufficiency assessment, and disconfirmation case;
8. traceable specification/prototype handoff;
9. limitations, stopping condition, and primary-source index.
