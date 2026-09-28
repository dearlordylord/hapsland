# Review capacity on the Hapsland dashboard

Historical plan for [#135](https://github.com/dearlordylord/hapsland/issues/135).
The current implementation and its evidence are in
[issue 135 visualization evidence](issue-135-visualization-evidence.md).
The page now uses the resident's checked `Canonical.step` adapter for its main
production replay. Details below retain the original design targets.

## What to show

Place **What uses review capacity** and **Review capacity** directly below the
main flow diagram. The first is a static inventory of reservation purposes and
the limits each uses. The second shows live usage and limits in bytes and work
items, then one row per advicee (the agent receiving advice). Use the same agent
colors in the shared bar and rows. Label the shared total **All agents in this
Hapsland process**. Label the byte bar **Reserved review bytes**; it does not
measure process RAM.

Each agent's reservations are part of the shared total. Agent B can use enough
shared capacity to prevent agent A's next review. Keep this panel separate
from #141's 20 KiB evidence-tree bar: that budget applies to one review unit;
resident capacity covers all agents sharing one Hapsland process.

Generate the inventory from checked, compiled Bend output during the build.
Its reservation purposes and limit connections must come from the same Bend
definitions used by admission, with a build check that every purpose and limit
is represented. The renderer supplies wording and layout, not policy edges.
For the current #119 model, **Preparing review** and **Review unit** are two
reservation lifetimes in one review flow. Preparing review is still review:
Hapsland holds temporary space while it makes review units, then releases that
space and reserves space for each unit. These are not arbitrary review phases.
Each reservation faces four checks: resident item count, resident bytes, agent
item count, and agent bytes. Four checks do not mean four kinds of work. There
are no separate pools for preparation and units.

The #120 Bend inventory includes observation and dispatch data, preparation,
review units, stored results, operational notices, and temporary advice recheck
space. The resident labels each reservation or purpose change. #122 may extend
the result and retention lifetime model before #135 labels the inventory as
complete. Until then, label it **Canonical Bend model**.
Example numeric limits must be labelled as examples; live limits must come
from the selected Bend state.

Show preparation results under the relevant agent:

> Preparation space released → Unit 1: accepted → Unit 2: no capacity → Unit 3: accepted

A refused unit does not stop later units. Show **No capacity**; refused units
currently have no retry queue. Show usage before and after this event.
Label any animation **Decisions within this preparation result**.
`PreparationCompleted` is one atomic Bend transition. Animation frames explain
its decisions; they are not separate runtime events.

## Bend data required before rendering

The final page must replay the **same checked compiled Bend transition** as
production. The page controls labels, colors, bar scales, and layout. Bend
supplies admission decisions, totals, and any intermediate capacity states.

Bend must supply:

- Shared usage and limits, in work items and reserved bytes.
- Usage and limits for each agent.
- Each live reservation's ID, agent, operation ID, bytes, and purpose.
- A checked inventory of reservation purposes and the item/byte limit rules
  that each purpose uses, derived from the admission definitions.

For preparation completion, Bend must supply the ordered release and admission
decisions: reservation released, unit position, reported bytes, accepted or
refused, and issued IDs for accepted units. Each animated step needs Bend's capacity totals;
segmented bars also need its reservation snapshot. Name a specific refusal
reason only when Bend returns it. Otherwise show **No capacity**.

The #120 projection exposes limits, reservations, purposes, and totals from compiled
`Ledger.total` and `Ledger.partition_usage`. Its preparation commands now carry
unit positions, refused sizes, limit reasons, and intermediate snapshots. Bend
also supplies the purpose inventory from the limit definitions used in admission.
#122 checks the remaining result and retention lifetimes; #135 renders it in a dedicated task
worktree based on the then-current integrated `feat/bend-full-flow` branch.
Tests must compare displayed decisions and values with
Bend output, including **accepted → refused → accepted** and competing agents.
Both cases already have independent canonical fixtures.

Before #135, label any capacity panel **Canonical Bend example** and give it
its own replay. The current `Flow.bend` trace is a separate execution.
