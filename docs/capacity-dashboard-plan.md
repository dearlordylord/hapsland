# Review capacity on the Hapsland dashboard

Plan for [#135](https://github.com/dearlordylord/hapsland/issues/135).
The current page and installed resident do not yet use `Canonical.step`.

## What to show

Place **Review capacity** directly below the main flow diagram. Show shared
usage and limits in bytes and work items, then one row per advicee (the agent
receiving advice). Use the same agent colors in the shared bar and rows.
Label reservations **Preparing review** or **Review unit**. Label the byte
bar **Reserved review bytes**; it does not measure process RAM.

Each agent's reservations are part of the shared total. Agent B can use enough
shared capacity to prevent agent A's next review. Keep this panel separate
from #141's 20 KiB evidence-tree bar: that budget applies to one review unit;
resident capacity covers all agents sharing one Hapsland process.

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
- Each live reservation's ID, agent, operation ID, bytes,
  and purpose (`Preparation` or `Review`).

For preparation completion, Bend must supply the ordered release and admission
decisions: reservation released, unit position, reported bytes, accepted or
refused, and issued IDs for accepted units. Each animated step needs Bend's capacity totals;
segmented bars also need its reservation snapshot. Name a specific refusal
reason only when Bend returns it. Otherwise show **No capacity**.

The #119 projection exposes limits, reservations, and totals from compiled
`Ledger.total` and `Ledger.partition_usage`. Its admission commands still lack
unit positions, refused sizes, and intermediate snapshots. #120 adds that Bend
output; #135 renders it. Tests must compare displayed decisions and values with
Bend output, including **accepted → refused → accepted** and competing agents.
Both cases already have independent canonical fixtures.

Before #135, label any capacity panel **Canonical Bend example** and give it
its own replay. The current `Flow.bend` trace is a separate execution.
