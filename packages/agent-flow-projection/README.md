# Canonical flow projection

<!--
**Purpose:** Describe the package boundary for reducer-derived flow evidence.
**Audience:** Contributors, including coding agents maintaining this package and its consumers.
**Status:** Active package documentation.
**Authority:** Maintained implementation guidance; the canonical reducer and accepted product specifications remain authoritative.
**Expected use:** Use this package to locate checked records in conceptual flow stages and explain an accepted canonical step.
**Lifecycle:** Maintain with the projection API and canonical adapter. Review when canonical fields, events, outputs, or the displayed flow stages change.
-->

`projectFlowStep` reads the checked projection before and after one canonical event,
the event, ordered outputs, and any rejection. It reports identified stage
movements, source boundaries, and which stages changed. `locateFlow` reports the
current stage of identified work, dispatch entries, Jev requests, advice, output,
and rounds. Outputs retain their typed categories: action requests, established canonical
events, and policy decisions. An action request does not establish that its
native effect succeeded. An established event describes the canonical transition;
native effects still require their own supplied observations.

`numberRecords` derives separate source-read, preparation, review-item,
Jev-request, advice, and per-purpose capacity-charge ordinals from accepted state transitions. These are
presentation identities. The canonical operation and request IDs remain the
stable keys for record links and events; callers may show both. A consumer
with incomplete history must omit an ordinal it cannot establish.

The stages describe the process. They are not Bend states and do not add a
second reducer. The package has no FoldKit dependency, SVG, or visual style. A consumer can draw
the reported movements as arrows, a timeline, or another presentation. Shared
square titles, coordinates, possible routes and text formatting live in
`production-flow-presentation.ts`; `production-flow-mermaid.ts` serializes those
facts for repository documentation. The dashboard owns rendering and arrow
placement in `agent-flow-viz`. `setup-copy.ts` supplies shared website and
installation-documentation copy. Keeping these pure modules here lets tooling
and the dashboard consume them without depending on each other.

Run `npm run typecheck` here; the dashboard build also runs this check and
exercises replay evidence through its offline fixture.
