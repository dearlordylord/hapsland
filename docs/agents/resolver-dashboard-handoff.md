# Resolver dashboard conversation handoff

**Purpose:** Preserve the discussion, corrections, agreed dashboard requirements, and the point reached in the step-by-step walkthrough.
**Audience:** Contributors, including coding agents, and the product owner.
**Status:** Temporary handoff, captured on 2026-10-10.
**Authority:** Conversation and code-inspection evidence. The dashboard requirements below are explicit user instructions for this task; the proposed implementation is not an accepted production architecture or proof of implementation.
**Expected use:** Resume the walkthrough at its stopping point and finish the dashboard execution and continuity work without repeating the misunderstandings recorded here.
**Lifecycle:** When the live compiled-Bend replay and continuity checks are accepted, consolidate the lasting dashboard guidance into `packages/agent-flow-viz/DASHBOARD-RULES.md`, put any accepted migration architecture into `docs/bend-migration.md`, and delete this handoff. Preserve issue #273 as the owner of the separate deadline investigation.

## Workspace and scope

- Worktree: `/workspace/typescript/hapsland-graph-comparison`.
- Branch: `review/graph-resolver-comparison`.
- Created from master commit `8e7dadd0615fd77ffc87deb1e969eb3244eaeb00`; candidate snapshot was cherry-picked as `98d61c565e6ee9b4d1d061c35ef1f0a3685e8782`.
- This worktree contains the full Bend resolver snapshot and dashboard work. It is separate from `/workspace/typescript/jev` (master) and the parent migration worktree `/workspace/typescript/hapsland-bend-selection-ui`.
- The master inspected later in the discussion was `47fdf0f0afffc6eca9f613813eee7e533808e082`. Do not confuse that master implementation with the candidate snapshot in this worktree.
- Dashboard address used during the conversation: `http://192.168.155.16:4317/index.html#import-graph`. Availability depends on the local Vite process remaining alive.

## Terminology and corrections

`Canonical` is the Bend machine for the review lifecycle: admission, resources, preparation lifecycle, dispatch, Jev requests and results. It is not `ImportGraph`.

`Resolver / Machine` coordinates preparation of a particular ReviewUnit. Its `initial` and `resume` functions currently settle internal computations until an external service request or a terminal result.

`ImportGraph` is the existing production Bend reducer for dependency traversal. The new candidate did not introduce Bend graph traversal for the first time. It extends the surrounding preparation logic into Bend.

The local declaration graph has its own `step(machine)` reducer. Product construction through `Core.review_unit` is a pure function, not another event-driven reducer. An earlier explanation incorrectly described all declaration expansion as an unstepped pure computation; this was corrected after inspecting the code.

Canonical and resolver are separate machines joined by TS/JS integration code. Within the full Bend resolver, calls to ImportGraph and local declaration expansion are direct Bend calls. External reading, path operations, frontends and encoding cross into TS/JS. TS/JS exists at those boundaries, but is not a technical necessity for keeping the domain reducers separate.

## Dashboard requirements agreed with the user

- Show the current implementation of this worktree, rather than a migration comparison or responsibility-change map.
- Keep one connected resolver process in the bottom Import exploration section, familiar boxes, both examples, the file tree, budgets and a horizontally scrollable diagram.
- Use a legend and light colors to distinguish traversal, declaration expansion, coordination/product construction and external services. These remain parts of one process.
- The purpose is detailed maintainer understanding, not a high-level illustration.
- Navigation must execute compiled Bend. A genuine trace captured earlier is insufficient as the sole source of interactive behavior.
- Project actual execution accurately. A persisted nested reducer state is not evidence that its diagram node is currently executing.
- Share one node/edge catalog between rendering and validation.
- Enforce continuity: observable execution transitions must have visible corresponding edges; successive states for the same reducer must join; cross-component calls and returns must have explicit causal links.
- Include negative checks: removing a required edge or breaking the state/call chain must fail. Do not automatically add an edge merely because a trace contains a transition.

## What is implemented and what remains open

The lower dashboard has a connected process SVG, colors/legend, horizontal scrolling and a single cursor. Its generator runs the actual compiled resolver against physical source fixtures, observes ImportGraph and local reducer calls, continuations, and product-call inputs/outputs. The two captured timelines contain 69 and 230 frames respectively.

However, the lower dashboard still reads `preparation-resolver.generated.json` when its cursor moves. It does not execute compiled Bend interactively. Continuity enforcement and a single shared semantic edge catalog are not yet implemented. Do not claim that the complete agreed dashboard contract is satisfied.

The user noticed a move from Accept or skip import at step 17 to Next pending edge at step 18. Inspection showed that frame 17 is actually `CheckingIterationDeadline`, with ImportGraph retaining phase `ready`; frame 18 is the `ImportGraph.next` event. The UI incorrectly treated that retained phase as the active execution location. A return edge exists in the manually authored SVG, but neither that edge nor extra arrows fixes the incorrect execution projection.

The upper Guided replay is the reference: it invokes `stepCanonical` through the compiled Bend adapter, projects before/event/after and outputs, and checks that projected evidence has a visible entry in `CONNECTIONS`. The lower replay must achieve the equivalent execution and projection discipline for nested reducers.

A proposed direction was discussed, not implemented: expose a shared granular execution mechanism from the existing resolver, used by both normal settling and interactive stepping. A thin Bend observation/projection module could return actual transition data and a common diagram catalog. It must delegate to the existing execution composition rather than introduce a dashboard-only scheduler whose sequence diverges from the runtime. The lower diagram should show resolver and its internals; adding a second full Canonical diagram is not required.

Checks passed during the preceding dashboard work: visualization build, root `check:fast`, regeneration drift, focused resolver browser checks, and the general browser consumer. The general browser consumer first timed out waiting for an unrelated interrupted scenario, then passed in a separate run. These passes do not establish the unimplemented live-replay or continuity requirements, universal correctness, performance parity, or adoption on master.

Relevant worktree owners:

```text
/workspace/typescript/hapsland-graph-comparison/packages/agent-flow-viz/src/import-graph-view.ts
/workspace/typescript/hapsland-graph-comparison/packages/agent-flow-viz/src/import-graph-diagram.ts
/workspace/typescript/hapsland-graph-comparison/packages/agent-flow-viz/src/canonical-replay.ts
/workspace/typescript/hapsland-graph-comparison/packages/agent-flow-viz/src/production-flow-view.ts
/workspace/typescript/hapsland-graph-comparison/packages/agent-flow-viz/scripts/check-flow-inference.mjs
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/generate-preparation-replay.mjs
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/whole-resolver/Machine.bend
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/whole-resolver/Runtime.bend
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/whole-resolver/Loop.bend
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/whole-resolver/Root.bend
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/whole-resolver/Read.bend
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/whole-resolver/Attach.bend
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/whole-resolver/Core.bend
/workspace/typescript/hapsland-graph-comparison/prototypes/bend-strangler/local-graph-draft/core.bend
```

## Step-by-step walkthrough: where we stopped

The user wants to ask about one step at a time. Continue in that style, rather than dumping the entire pipeline.

1. We assumed an Edit has already completed. The agent-runtime adapter on TS/JS receives the notification (for example, PostToolUse), normalizes it into DirectObservation, and sends it to the Hapsland resident. Resolver and ImportGraph have not started.
2. The resident checks admission prerequisites, settings/root/session freshness, resources, and edit permission where required. It registers the observation through Canonical and creates an IngressJob.
3. "Resident active" means lifecycle state permits new work, not merely that the process is alive. A living process can be winding down and refuse new admission.
4. Canonical does contain the dispatch queue. TS sends `queueDispatch`; Bend owns the queued/running state and emits `dispatchStarted`. The earlier statement that the queue lived in TS was corrected.
5. The TS registry maps operation IDs to actual native job data. It is used to find the job on `dispatchStarted`, launch it, discard it and clean up on completion. It does not independently choose queue order. There is a check against divergence between Canonical dispatch and native handles.
6. For this Edit, the job is IngressJob: the observation, settings, Canonical IDs, partition and reservation. The dispatcher invokes `residentRun`, which selects `residentPrepare` for ingress. Effect executes the asynchronous preparation work and manages cleanup. It does not perform the original Edit again.

**Stopping point:** The user asked which files implement creation of that job, Bend-to-TS dispatch, and TS-to-Bend return events. Absolute paths and entry lines were provided below. The next substantive step to explain is what `residentPrepare` does after `dispatchStarted`, starting with `startObservation` and then source preparation. Do not jump directly to ImportGraph.

Master code references inspected at `47fdf0f0` (line numbers are navigation hints and may move):

```text
/workspace/typescript/jev/packages/resident-runtime/src/resident/server.ts
  1060: residentAdmissionJob creates IngressJob
  1253: residentDispatcher.enqueue
  3130: residentRun selects preparation versus unit evaluation
  3210: residentPrepare, including startObservation
  3817: completeObservation
  6490: makeDispatcher wired to residentRun

/workspace/typescript/jev/packages/resident-runtime/src/resident/dispatch.ts
  120: consume dispatchStarted and resolve the native job handle
  143: commit events through the Canonical owner
  181: startCommitted
  204: dispatchSettled
  220: execute the actual handler through Effect
  264: enqueue sends queueDispatch

/workspace/typescript/jev/packages/resident-runtime/src/resident/capacity.ts
  1660: transition calls stepCanonical
  1721: admitObservation
  1734: observation lifecycle events

/workspace/typescript/jev/packages/canonical-policy/src/canonical/canonical-boundary.ts
  2894: stepCanonical calls compiled bendCanonicalStep and decodes its result

/workspace/typescript/jev/packages/agent-flow-bend/Canonical.bend
  2909: emit DispatchStarted
  3052: queue_dispatch
```

The user explicitly requested literal absolute paths; clickable labels alone did not meet that request.

## Resolver walkthrough already discussed

After the outer preparation work chooses a named root and calls the full Bend resolver, the typical path is: establish a clock; obtain the path extension; select the language in Bend; check the deadline; obtain frontend facts externally; expand the root locally in Bend; build and externally measure the product; initialize ImportGraph with Root; resolve pending edges; check access externally; capture and inspect allowed targets externally; expand and construct tentative contributions in Bend; measure them externally; submit Captured to ImportGraph for admission; publish or omit the contribution; continue; finalize and return.

Do not treat every import as an external file read: bundled declarations and cache paths have their own routes. Unadmitted tentative children must not be described as committed result content.

Language selection is specifically an extension mapping: TS/JS obtains the extension; Bend maps `.ts`, `.tsx`, `.mts`, `.cts`, `.rs`, and `.bend` to a supported language/context. The frontend parses the source externally. This is not content-based language detection.

## Deadline question and follow-up issue

The resolver time budget is 5 seconds. StartClock stores a monotonic start time externally; ReadClock returns elapsed time; Bend decides whether the limit has expired. Checks occur at boundaries and do not forcibly interrupt an already-running external operation at exactly five seconds.

Both inspected master and the full Bend candidate discard the result on deadline (`undefined` / `NoReviewUnit`). They do not return everything already found. Master explicitly excludes Deadline from partial-result eligibility. The captured dashboard fixtures use a zero clock and do not demonstrate expiration.

The user requested an English investigation issue, which was created as [#273: Explore returning a validated partial ReviewUnit when graph preparation reaches its deadline](https://github.com/dearlordylord/hapsland/issues/273). It asks for a design decision about committed checkpoints, omissions, structural and budget guarantees, bounded finalization, usefulness and TS/Bend parity. It does not authorize changing deadline semantics immediately.
