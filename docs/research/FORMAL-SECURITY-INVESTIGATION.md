# Hapsland formal security investigation — current state

Updated: 2026-09-24. Start here when resuming this investigation.

Status: bounded prototype completed with fixes and regression checks for two defects; the release security gate remains incomplete. This is advisory investigation material, not an adopted product specification or completed verification. Maintain this document as a current snapshot, not a chronological journal.

**Publication state:** This security branch contains the fixes in `src/direct-event/selection.ts` and `src/resident/server.ts`, their regression checks, and the prototype evidence. Track integration through [issue #99](https://github.com/dearlordylord/hapsland/issues/99) and [issue #100](https://github.com/dearlordylord/hapsland/issues/100). The temporary installed-package witnesses used local test archives; they were not published as releases. The separate `quint-connect` RC.116 candidate remains an uncommitted, unpublished local worktree.

## Resume in a new conversation

Start with this note, then read [the prototype results](formal-security-prototype/RESULTS.md) and [the verification contract and prototype plan](FORMAL-SECURITY-VERIFICATION-CONTRACT.md). Use the linked feasibility reports for exact code locations and earlier evidence. Do not repeat the comparative tool survey or the completed connector update.

Suggested next-session instruction:

> Resume Hapsland formal security work from `docs/research/FORMAL-SECURITY-INVESTIGATION.md` and [the prototype results](formal-security-prototype/RESULTS.md). Check the current Git and issue state. Use Sol/medium subagents for independent work. Connect strict Quint replay to the real resident queue and serialized offline HTTP request, then close the ingress and sink observation gaps in the ordered plan below. Do not describe the prototype as a release gate.

Before edits, read applicable `AGENTS.md`/skills and inspect Git status/worktrees in both repositories. The connector candidate is at `/workspace/typescript/quint-connect-rc116-investigation`, branch `agent/effect4-rc116-investigation`; its changes are uncommitted and unpublished. Preserve unrelated working-tree changes.

Completed now: the finite Quint model, direct-function connector consumer, independent payload/wire fixture, resident queued-policy reproduction and fix, debug-stderr reproduction and fix, focused tests, direct-event conformance, clean package conformance, and installed-module queued/debug witnesses with unfixed negative controls. The [prototype results](formal-security-prototype/RESULTS.md) give exact commands, seed, artifact digest and limits. The installed witnesses use the resident module from a freshly packed temporary installation; they do not observe an encoded resident HTTP request or launcher-owned diagnostic file.

### Ordered next steps

1. **Confirm the integration state.** Inspect the merged security change, issue outcomes and current checkout before changing files. Keep the remaining formal-gate work separate from unrelated concurrent edits. The bug fixes and their regression checks do not themselves establish a release security gate.
2. **Connect the model to the resident route.** Extend the strict connector driver beyond direct `prepareObservation`/`evaluatePrepared`: replay named configuration, consent, prepare, queue and dispatch actions through the actual resident path. Compare the model after every action with observed source-read, provider-attempt and output effects. Keep positive send and denied-send witnesses mandatory, reject skipped actions and empty traces, and retain fixed seeds/bounds.
3. **Observe serialized resident egress.** Add the smallest serializable offline transport seam needed for the real resident's installed TypeSafe provider. Preserve the approved logical Jev destination. Compare every encoded request, method, headers and complete body against the independent fixture oracle, including the prepare → exclude → dispatch trace. Reject redirects or extra requests rather than inferring wire safety from a `DecisionModel` call count.
4. **Finish ingress and local-sink witnesses.** Decide the earliest supported boundary for discarding excluded host patch text, then observe the actual IPC frame there. Exercise an injected unexpected error through the normal launched resident and inspect its diagnostic file, stderr/stdout and host response. Observe attempted writes and source-file identity reads at the process boundary, including native capture on supported platforms. State any observer blind spots.
5. **Run gate sensitivity and package checks.** Repeat critical security traces against the installed artifact, including encoded HTTP and durable sinks. Plant a compiling unauthorized read, send and write in isolated trees and require the corresponding gate to fail for the right reason. Then measure runtime and coverage, decide which checks become required CI/release gates, and inspect remote branch protection separately.

## Confirmed-bug reporting authorization

The user explicitly requests that bugs uncovered by this investigation be filed in GitHub. The Hapsland remote is `https://github.com/dearlordylord/hapsland`; use that issue tracker for Hapsland defects. Check for an existing matching issue before creating a duplicate, and record any created issue URL in this note and the relevant evidence report. No additional permission is required for this authorized issue filing.

For a confirmed bug, include the affected revision/profile, exact synthetic reproduction command/fixture, expected versus observed behavior, implicated contract/code boundary, and proposed regression acceptance check. Use sanitized evidence only. Do not describe an unexecuted suspected path or an unadopted stronger policy as a reproduced security defect. If the result instead motivates a new guarantee, label it as an enhancement/specification decision.

The queued-exclusion case was reproduced offline at the resident provider-neutral boundary. The deterministic [reproduction report](queued-exclusion-reproduction.md) records its pre-fix and fixed results, including a fresh installed-package witness and unfixed negative control. It violated existing conformance obligation 11b; [Hapsland issue #99](https://github.com/dearlordylord/hapsland/issues/99) tracks the fix. An injected unexpected cause also exposed a source marker through debug stderr; the catch now emits a fixed category in source and installed-module witnesses. [Issue #100](https://github.com/dearlordylord/hapsland/issues/100) and the [sink report](formal-security-prototype/sinks.md) record that result and its injection limits.

## Objective and user priorities

The user wants stronger security to be a competitive advantage for Hapsland, backed by formal validation with a strict connection to production code and enforceable quality gates. The central question is **how to validate the implementation**, not merely how to write a formal model.

Priority areas:

- What source and other data Hapsland sends to Jev, through which destination and transport.
- What data Hapsland saves locally, where, and through which paths, including failures and diagnostics.
- Which folders/files configuration permits Hapsland to access, and which it excludes.
- A second authorization boundary after reading: which specific portions of a permitted file may be transmitted. The user's example is interfaces and their reference trees, if a meaningful guarantee is feasible. Permission to read a file must not imply permission to send the entire file.

The user prefers whichever exclusion guarantee is reasonably achievable. Recommended target: prevent filesystem source-content reads from excluded paths and prevent their source egress; discard already supplied excluded-path host payload content as early as practical. This target still needs precise specification and feasibility evidence.

Product terminology: Hapsland is this product; Jev is its external review backend. An agent host is a separate trust boundary and can supply patch contents before Hapsland evaluates exclusions.

## Ownership and working preferences

The user owns `quint-connect`; its local repository is `../quint-connect`. An Effect 4 update there is authorized if needed, using an isolated worktree. The previously observed RC.112 versus Hapsland RC.116 difference is an integration task, not a strategic adoption blocker. Inspect the current local repository before assuming the published package describes its current state. Do not publish or merge merely because a local compatibility update is authorized.

Use Sol agents with medium reasoning effort for delegated work, in parallel where responsibilities are independent. The user authorized all three parallel feasibility investigations and automatic synthesis of a concrete verification contract and bounded prototype plan. Those deliverables are linked below. This authorization does not imply publishing/merging the connector update or implementing the full Hapsland prototype.

## Working recommendation

Quint plus a TypeScript conformance harness is the preferred first experiment. A formal model explores the security state machine; a driver calls actual production functions and observes real effects. Tests must not substitute a second policy implementation for Hapsland's own decisions.

TLA+ remains a credible alternative through implementation trace validation. Bend is a possible later experiment for a small production policy kernel implemented in Bend and compiled for integration. Proving a separate Bend implementation does not establish correctness of existing TypeScript.

Keep assurance claims precise:

- Model checking establishes properties of the model within its stated scope/bounds.
- Generated traces and implementation trace validation establish conformance for exercised executions.
- Neither alone proves arbitrary TypeScript safe or establishes complete information-flow noninterference.
- A passing gate must be shown to catch an intentionally introduced unauthorized read/send/write.

## Proposed authorization chain

1. **File access:** May Hapsland read source contents at this path under the applicable configuration and filesystem identity?
2. **Extraction and payload authorization:** Which declaration and reference fragments may leave the process? Does the complete encoded payload contain only authorized content and explicitly permitted metadata/rule material?
3. **Dispatch authority:** Is the repository/backend/destination consent current, and is this prepared payload still eligible at the defined authorization point?
4. **Persistence and output:** Which source, derived values and metadata may enter disk files, IPC, logs, stderr/stdout, caches and host responses?

Candidate extraction properties, not yet demonstrated:

- Every transmitted source fragment belongs to the selected declaration and an explicitly permitted reference closure.
- Unrelated declarations and surrounding source do not enter the payload.
- Unsupported or unresolved extraction cannot fall back to sending the whole file.
- The actual serialized HTTP request is checked, including evidence, rule questions/examples and metadata; inspecting only `artifact.source` is insufficient.
- Payload provenance and structural minimization do not prove that an authorized declaration contains no secrets. Secret detection would be an additional policy.

The formal model can initially represent artifacts/fragments with finite identities and provenance. Parser, extraction and serializer behavior still require a connection to concrete production code and adversarial fixtures; abstract fragment labels do not establish that connection by themselves.

## Existing evidence and investigation targets

Most findings are source-inspected, not reproduced vulnerabilities or runtime proof. The payload investigation additionally executed twelve retained synthetic analyzer probes. Recheck source-inspected findings against the checkout used for the next phase.

- Exclusions accumulate across configuration layers and are checked before named-file capture. Capture uses descriptor-anchored containment mechanisms.
- Host events already carry source-bearing patch lines before file selection; added lines can traverse resident IPC. No-filesystem-read and never-ingest-source are different guarantees.
- Prepared provider input includes raw declaration/export text, transitive same-file reference evidence, relative path and contract information. Internal comments and literal values are included when inside those spans; a reduced structural signature would require a different extraction design. Provider encoding includes rule questions as well. The named-reference graph is syntactic, not TypeScript compiler resolution; namespace declarations currently use unqualified names.
- **Queued-work defect and local fix:** an offline resident run confirmed one provider-neutral model attempt after a completed exclusion update and before dispatch. The local fix reloads file policy after the credential wait and applies the shared selection predicate to prepared work. Source and installed-module witnesses pass, including unfixed negative controls. Resident encoded HTTP remains unobserved. See the [reproduction](queued-exclusion-reproduction.md) and [issue #99](https://github.com/dearlordylord/hapsland/issues/99).
- **Persistence target and local fix:** consent and metadata are intentionally stored. An injected source-bearing cause reached debug stderr before the local fix; the two resident catches now emit fixed categories. Source and installed-module stderr witnesses pass, but the normal launcher's diagnostic-file path is not yet observed. See [issue #100](https://github.com/dearlordylord/hapsland/issues/100) and the [sink report](formal-security-prototype/sinks.md).
- A model/driver cannot establish that unobserved direct I/O, dependencies or native helpers respect policy. Sink inventory, architecture restrictions and packaged-process observation are needed.

## Remaining contract decisions

- Adopt or narrow the documented interface/type-alias and syntactic same-file reference profile; decide treatment of namespace/scope ambiguity. Current traversal and bounds are established in the payload report.
- Decide whether raw-span inclusion of internal comments and literals is acceptable, or whether a reduced structural representation is needed. Current inclusion behavior is established by the retained probes; effects on review quality remain unmeasured.
- Semantics of newly restrictive configuration for captured, queued and cached work. Recommended target is reauthorization before dispatch; define ordering with concurrent changes instead of promising instantaneous revocation.
- Exact permitted payload schema, destination behavior and redirects; permitted durable records, paths and metadata.
- Earliest practical point to discard excluded host payloads; separate event parsing and metadata/config reads from source-content reads.
- Exact supported host/platform profile and trusted assumptions for the first gate.

## Feasibility deliverables and concrete contract

Three parallel Sol/medium investigations address the requested next steps:

1. [Payload authorization feasibility](formal-security-payload-feasibility.md): exact raw-span and transitive-reference behavior, twelve reproducible analyzer probes, independent fixture oracle, whole-request checks, and the distinction between provenance and secret absence.
2. [Access and sink feasibility](formal-security-sinks-feasibility.md): source and local-effect inventory, concrete observation seams, and achievable ordering semantics. Its original queue/dispatch suspicion has since been reproduced and locally fixed as described above.
3. [Connector integration feasibility](formal-security-connector-feasibility.md): local RC.108 checkout updated in an isolated RC.116 worktree; build, typecheck, 40 targeted tests, packed-consumer smoke and four package-contract checks passed. The candidate uses exact RC.116 pins/peer and one resolved Effect version. It remains uncommitted/unpublished. A later Hapsland [connector consumer](formal-security-prototype/connector/README.md) exercises direct preparation/evaluation and strict action checks; resident replay remains outstanding.

The synthesis is [the verification contract and bounded prototype plan](FORMAL-SECURITY-VERIFICATION-CONTRACT.md). It defines named invariants for reads, payload fragments, unsupported extraction, encoded requests, dispatch authority, local sinks, ingress and verification-gate integrity. It also defines the finite model, concrete fixture oracle, production entry points, required observations, deliberate bypass mutations, and acceptance sequence.

The bounded prototype has produced a [finite Quint model](formal-security-prototype/model/README.md), a production-connected direct-function consumer, wire and sink fixtures, and the two local fixes. It is not yet a passing release security gate. Source authorization and exact raw declaration/reference spans are the initial target; removing internal comments/literals or proving semantic TypeScript reference resolution is separate work.

## Following milestone: code-connected prototype

The first bounded pass and its precise limitations are in [the prototype results](formal-security-prototype/RESULTS.md). Follow the ordered next steps above. The direct-function connector trace that fails under a restrictive update does not establish a resident failure; its `enqueue` is only a local fixture transition. The separate resident and installed-module witnesses show the local queued-policy fix at the provider-neutral boundary.

Acceptance requires:

- Passing declared model checks and concrete conformance cases with pinned tools and recorded bounds/seeds.
- Actual outbound body and filesystem/output effects match the contract.
- Deliberately bypassing exclusions, adding an unrelated source fragment, or adding an unauthorized write/send fails the relevant gate.
- No-trace runs, omitted meaningful actions, checker errors and timeouts cannot be treated as successful validation.
- Evidence states which compiled artifact/profile was exercised and which boundaries remain unverified.

Only then choose permanent CI integration and required merge/release checks. Server-side Jev retention and independent agent-host behavior remain separate evidence questions.

## Evidence references

- [Formal security advisory](PRODUCT-RESEARCH-ADVISORY-2026-09-24-FORMAL-SECURITY.md): detailed comparative research and proposed gate architecture.
- [Hapsland code map](formal-security-code-map.md): production source locations and findings C1–C11.
- [Quint/connector notes](formal-security-quint-notes.md): external source and package evidence Q1–Q9. Interpret the version difference using the ownership context above.
- [TLA+/Bend notes](formal-security-tla-bend-notes.md): alternative approaches and limits.

The feasibility pass inspected Hapsland baseline `b4af0533ba3fdf2689fdc15b2b745134e16c9caf`. The prototype was first exercised on a dirty worktree while `master` advanced independently; its exact revisions, commands, model seed, synthetic fixtures and artifact limits are in the linked reports. The encoded resident HTTP request remains unobserved. This snapshot and the proposed contract govern the current direction where earlier advisory recommendations differ, particularly connector ownership and payload-level authorization.
