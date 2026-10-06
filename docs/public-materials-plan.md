# Hapsland public materials handoff

**Purpose:** Draft the README and site story, with a reusable bank of editorial ideas.
**Status:** Temporary design proposal following the owner's 2026-10-01 scope agreement; copy and visual execution remain drafts.
**Authority:** Communication proposal, not an accepted product contract or new verification evidence. Linked maintained owners define behavior.
**Expected use:** Write public explanations and brief later visual implementation without expanding product promises.
**Lifecycle:** On owner acceptance and implementation of the README/site handoff, **consolidate** current architecture and visualization requirements into [architecture](architecture.md) and the [dashboard guide](../packages/agent-flow-viz/README.md), transfer remaining editorial ideas to an owner-chosen editorial backlog, update inbound links, then **delete** this document. Retain the idea bank here until its destination is explicitly chosen and the transfer is complete.

**Implementation update:** The README narrative and an undeployed FoldKit site
candidate are now implemented. The [visualization guide](../packages/agent-flow-viz/README.md#public-site-and-shared-import-replay)
owns run commands, shared-module boundaries, browser checks, and specific visual
review panels. The story and editorial bank below remain proposal material;
later owner design acceptance is distinct from these implementation checks.

## Audience and story

The first reader is a developer who wants their coding agent to catch questionable
modeling decisions before subsequent changes depend on them. Lead with that goal,
then explain how review works and how the reader controls the source boundary.
Use calm technical language; playful imagery can support illustrations and posts.
No comparisons, superiority claims, or implied review-quality benchmarks.

Proposed hero:

> Review changed types and functions with their related code.
> Hapsland starts from edited lines, finds the changed type or function, and follows references to related definitions. It sends selected code with rule questions to Jev. Feedback can help the agent reconsider a data model or code decision before further changes build on it.

Early feedback gives the agent an opportunity to reconsider a
choice. It does not guarantee repair or prevent every subsequent change. Runtime
and feedback mode determine when advice reaches the agent and whether work waits.
See the [advice delivery contract](advicing-target-contract.md).

Explain the mechanism in everyday terms: “Start with the edited lines, find the changed declaration, then follow its
references and review the related code.” In deeper
technical sections, call this a declaration tree and explain its size limits.
Selected source code remains source code; the tree is not anonymization.

## Editorial rule: answer the reader's next question

Apply this rule to the README, site, captions, posts, and release videos. Each
visible element should answer a question the reader has at that point. A new
number, symbol, term, or detail earns its place only if it helps the reader
understand the behavior or make a decision now. Otherwise remove it or move it
to clearly named technical details. A precise detail can still be premature.

For each section or animation frame, ask:

1. What does the reader know, and what question are they trying to answer?
2. What answer does this element provide in ordinary language?
3. What new questions does it create? Does the reader need their answers now?
4. Can a concrete code example or observed consequence replace the unexplained detail?
5. Should it stay, be rewritten, move to linked details, or be removed?

Review the result with a reader unfamiliar with Hapsland's internals. For example,
“two copies of the cover width can disagree” explains a code-design concern;
a probability compared with a threshold introduces unexplained scoring and
configuration questions. Show the concern first. Explain scoring in the
configuration guide when the reader wants to change when feedback appears.
Do not remove information needed to understand source permissions, default file
selection, skipped checks, or the scope of a proof. Explain those boundaries
where the reader encounters the corresponding claim.

## README handoff

Keep the README short enough to find setup without reading an architecture essay.
Preserve the existing [edit/review/repair GIF](../assets/review-flow.gif).
The narrative order is:

1. Hero and a short explanation of reviewing types, functions, and related definitions.
2. GIF showing one possible feedback cycle, with no promise that every agent repairs.
3. Setup using built-in rules; a visible sentence that teams can add their own rules.
4. Source controls: distinct root/context selection, unbeatable privacy exclusions, no read of a denied supporting path,
   context size limits, and the user-selected review recipient.
5. Short “what is checked” paragraph with precise proof scope and links.
6. Links to the interactive example, configuration, and technical architecture.

Each custom rule is one local JSONC document, explicitly connected through configuration. Mention the
capability and link [configuration](configuration.md); a full authoring tutorial
is outside the first-read flow. Supported rule targets depend on language/context.
Do not imply every built-in rule applies to every function or type.

Future short README animations should be captures of the same approved scenarios
used by the interactive site. GitHub cannot run the widget; captions must preserve
what each captured step means. No new animation is produced by this handoff.

## Site scenario and sections

The primary interactive illustration reuses the circular flow from the existing
research video, adapted to FoldKit controls. Keep the actor loop visible on desktop;
on mobile use a compact actor overview with the same readable HTML code stage.
Do not replace that flow with a row of code cards. Its six stages are: local edit,
expanded related code and review question, Jev rule result, configured feedback
to the agent, possible edit, and recheck. No numerical score, pass seal, or commit
step is needed to explain the loop. The edit and recheck are illustrative, not
promises that an agent repairs code or that Hapsland gates commits.

After the main loop, explain rules and file configuration. Place the separate
source-control widget immediately before “Checks behind source selection.”
It answers how file exclusions and size limits restrict review input; it must not
repeat the hero's explanation of following references. The README retains its
GIF; omit a duplicate GIF section from the interactive site. Keep setup easy to find.

Open with the video's actual three-line local diff: `title`, the added
`coverWidth`, and `public`. Do not show the whole interface or a dependency before
the expansion step. Then reveal `Gallery` and follow its references through
`ImageFile` to `Dimensions`. This explains why the edit needs related code:
the duplicated width is not visible in the edited lines alone. The diff stays
local; selected declarations and rule questions are what Jev receives.

Use the `Gallery` example from the existing [video demo](https://github.com/dearlordylord/hapsland-research/blob/master/marketing/video/README.md), copied into `src/site-example.ts`. Show the changed type alongside the definitions it refers to:

```ts
interface Gallery {
  cover: ImageFile;
  title: string;
  coverWidth: number;
  public: boolean;
}
interface ImageFile {
  path: string;
  dimensions: Dimensions;
  format: "jpeg" | "png";
}
interface Dimensions {
  width: number;
  height: number;
  unit: "px";
}
```

State the domain assumption: `coverWidth` means the current cover image's width,
also stored in `cover.dimensions.width`. Independently writable copies can disagree.
A deliberate snapshot or a separate layout width would be a different design.
The example edit removes `Gallery.coverWidth` and reads width from the cover's
own dimensions. This is an authored example edit, not a guaranteed agent repair.

This historical example uses the recorded `r4_duplicate_encoding` rule, removed
from shipped defaults by #240 because of clean warnings in a separate compact study.
It demonstrates an authored duplicate-fact concern, not a current default. Its recorded
message is “The type appears to store the same fact in places that can disagree.”
Jev classifies the supplied code against the supplied question and returns a
probability; Hapsland applies the configured threshold and message. Jev does not
know the application's domain intent and does not compose that explanation.

The main example should show the design concern, the configured feedback, and an
example edit that removes the duplicated width. Do not make the reader interpret
probabilities, a comparison symbol, or an arbitrary threshold to understand it.
The historical classifier measurements belong in linked study details, where their
input, settings, and limitations can be explained. They are not a live site request,
a current installed-integration check, or an accuracy benchmark. The traversal
illustration relocates the same declarations into separate files so exclusions can
be shown; that adaptation was not the recorded classifier input.

This type example does not establish function-rule behavior. Explain function
review separately: the current default `body_reaches_undeclared` asks
whether a callable reaches state or resources absent from its declaration.
Related definitions provide context; they are not additional edited targets.

Use three clearly separated modes, resetting the example between them:

| Case | Reader action and visible result | Acceptance observation |
| --- | --- | --- |
| Normal traversal | Step along Gallery → ImageFile → Dimensions | Each accepted dependency enters the tree through the existing checked graph behavior |
| User exclusion | Exclude one supporting file before traversal | Path refusal appears before any source-read command for that file; the dependency is marked omitted |
| Tree size limit | Lower the tree cap so one permitted contribution will not fit | That contribution stays out of the accepted tree; local reading may already have occurred; later pending edges follow existing behavior |

Use labels such as “Checked locally,” “Read locally,” and “Included for review.”
A command to read is not evidence that a read happened. Do not animate a network
send from a graph-only scenario: graph inclusion precedes separate eligibility and
dispatch decisions. The current dashboard is an offline replay, not a live monitor.

Show the selected definitions with visible source excerpts, explicitly marked illustrative.
Explain that requests contain selected source code and rule questions, rather than
only names or tree structure. The tree limit covers code in the tree, not all
request overhead. Silence is not a pass: rules needing omitted evidence can be
skipped, while other eligible rules may still run.

Show a symbolic payload outline only in technical details. Later,
render a synthetic input from the real preparation path under the accepted
[review input contract](review-contract-compatibility.md). Do not hand-author
fields and present them as a captured request. Exclusions and omitted evidence can
make a rule ineligible; an incomplete tree does not universally mean no dispatch.

Use minimal controls: case selector, next step, restart, and current explanation.
Keep advanced dashboard controls on the full dashboard page. Avoid exposing
internal IDs and protocol names unless the reader opens technical details.
The site candidate implements these controls and graph cases; it is not deployed.
Its selected-definition outline stays illustrative. The maintained visualization
guide links the new view's exact review panels and the shared-module checks.

## Shared code and architecture reviews

Adapt the research video's `full-code.mjs` drawing primitives in
`src/review-loop-renderer.ts`, preserving source provenance. The research animation
supplies the visual flow and example source, not production behavior or policy.
Use the shared HTML stage for readable code and FoldKit for controls and phase
state. The desktop actor loop and mobile compact overview must represent the
same six stages. Validate this adaptation after implementation; prior browser
checks do not validate the new renderer or layout.

Reuse the existing [import traversal view](../packages/agent-flow-viz/README.md).
Before implementing the compact site view, map graph adapter, scenario inputs,
replay state, projection, and rendering dependencies. Extract common modules where
both dashboard and site need them; keep page-specific layout outside those modules.
Do not duplicate reducers, infer a parallel permission policy, or fork graph semantics.

First architecture review: agree module ownership and the three named cases above,
including how local reads and accepted context are distinguished. Record which
parts already exist and which presentation changes are proposed.
Second review after implementation: inspect the exact Normal traversal, User
exclusion, and Tree size limit panels against the shared replay. Check that both
views expose the same decisions and that README captures use those same scenarios.

Visual acceptance must link the specific panel, describe its before/after change,
and name the behavior to inspect. The site candidate changes the hero example and replaces the earlier branch with
a three-definition chain; inspect those specific frames when reviewing it.
Design acceptance does not establish native execution, improved review quality,
or additional agent-runtime support. Architecture review is a planned workflow;
the visualization guide records the implemented shared-module extraction and
its checks.

## Claim boundaries used across all channels

| Public statement | Evidence and exact limitation |
| --- | --- |
| “Formal proofs cover context limits in the core logic.” | General proofs `import_graph_fitting_tree_stays_within_cap` and `import_graph_skipped_tree_stays_within_cap` in [graph PROOF.bend](../packages/agent-flow-bend/import-graph-proof/PROOF.bend), under their declared premises |
| “The checked core exclusion case issues no source-read command.” | Named law `import_graph_exclusion_has_no_read_command` in [PROOF.bend](../packages/agent-flow-bend/PROOF.bend); this concrete case is not a general theorem covering all possible execution states |
| “We test core decisions with deterministic simulation and replay.” | [monkey-business](../packages/monkey-business/README.md) exercises compiled decisions with virtual time and synthetic facts; excludes the complete resident, real source capture, IPC, and Jev transport |
| “You control which files are eligible for review.” | [Configuration](configuration.md): exclusions accumulate; without file settings otherwise eligible files are selected; no per-request confirmation |
| “Review context follows related definitions.” | [Input contract](review-contract-compatibility.md): selected source is included, with omissions and limits; does not establish better judgment accuracy |
| “Use built-in rules or add your own.” | [Configuration](configuration.md): individual local JSONC rules and declared supported language/input combinations; rule matching still respects input capabilities |
| “The selected review backend evaluates the selected code.” | [Provider boundary](review-providers.md): user configuration selects Jev or Cloudflare Clef/Clef-flash; offline adapter checks do not establish live Cloudflare quality or latency |

Proposed compact assurance copy: “Formally checked core logic: proven context limits
and checked access-refusal cases.*” Put the scope beside the claim, not only in a
remote footer. The asterisk names the properties above and excludes end-to-end
leak absence, native I/O correctness, secret detection, and reviewed-code correctness.
Do not publish “absence of leaks proven in the core” as an umbrella claim.

## Idea bank for later independent editorial work

These are topics and tropes for the owner to develop, not scheduled posts or finished copy.

| Topic | Angle / trope | Possible visual |
| --- | --- | --- |
| Before the second change | A small modeling choice becomes a foundation | Two changes stacking on the same state model |
| A function carries a model | Return values expose decisions about data | A callable beside the state or resources it uses |
| Definitions behind the diff | Explain a change through what it refers to | Lines opening into a small dependency tree |
| Representing a state | Show exactly which combination is invalid and why | One named example beside a type that rules it out |
| A closed branch | A deliberate boundary is visible | Excluded dependency stops before reading |
| Read is not sent | Make two distinct source boundaries understandable | Local read tray and separate review tree |
| Code that does not fit | Explain why a related definition was left out | One included definition and one omitted definition, with the reason |
| Your team's questions | Review reflects local design concerns | Built-in questions plus a small custom rule card |
| Silence is not a pass | Explain why no advice may arrive | Status reasons linked to absent feedback |
| What has actually been checked? | Connect each claim to its evidence and limits | One concrete guarantee, then links to proof and execution details |
| Reproduce a failed decision | Inspect the same failure without a live service | The same inputs leading to the same decision twice |
| Advice can grow stale | The code may change before feedback arrives | Old finding separated from the current declaration |

Release video ideas: (1) one edit → related definitions → advice → voluntary
repair → recheck; (2) the same traversal with permission refusal and size omission,
shown separately; (3) setup with built-in rules and a brief custom-rule capability
reveal. Capture observed behavior and caption scope; avoid staged “guaranteed wins.”
A game video is a possible later idea. Browser embedding and a game port are deferred.

TigerBeetle-inspired enhancements remain deferred in [#169](https://github.com/dearlordylord/hapsland/issues/169),
possibly indefinitely; they are not prerequisites for any material here.
