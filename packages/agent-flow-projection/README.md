# Canonical flow projection

**Purpose:** Describe the package boundary for reducer-derived flow evidence.
**Status:** Active package documentation.
**Authority:** Maintained implementation guidance; the canonical reducer and accepted product specifications remain authoritative.
**Expected use:** Use this package to locate checked records in conceptual flow stages and explain an accepted canonical step.
**Lifecycle:** Maintain with the projection API and canonical adapter. Review when canonical fields, events, commands, or the displayed flow stages change.

`projectFlowStep` reads the checked projection before and after one canonical event,
the event, emitted commands, and any rejection. It reports identified stage
movements, source boundaries, and which stages changed. `locateFlow` reports the
current stage of identified work, dispatch entries, Jev requests, advice, output,
and rounds. An emitted command is evidence of a decision, not evidence that a
native effect or storage succeeded.

`numberRecords` derives separate source-read, preparation, review-item,
Jev-request, advice, and per-purpose capacity-charge ordinals from accepted state transitions. These are
presentation identities. The canonical operation and request IDs remain the
stable keys for record links and events; callers may show both. A consumer
with incomplete history must omit an ordinal it cannot establish.

The stages describe the process. They are not Bend states and do not add a
second reducer. The package has no FoldKit dependency, square titles or
coordinates, route geometry, SVG, or visual style. A consumer can draw the
reported movements as arrows, a timeline, or another presentation. The
production dashboard maps stages to squares and keeps possible routes, text
formatting, and arrow placement in `agent-flow-viz`.

Run `npm run typecheck` here; the dashboard build also runs this check and
exercises replay evidence through its offline fixture.
