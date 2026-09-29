# Default diagram replay: step-by-step walkthrough

**Purpose:** Preserve a human-readable walkthrough of the default connected diagram for owner review.
**Status:** Temporary snapshot of the 54-step default guided replay on the #147 integration branch.
**Authority:** Implementation and validation evidence. The checked reducer and its adapter determine behavior; this walkthrough is not a product contract or a live runtime trace.
**Expected use:** Open the Hapsland dashboard's default guided case, advance one canonical step at a time, and compare the highlighted squares and connections with this table.
**Lifecycle:** At #147 diagram acceptance or closure, consolidate any still-useful explanation into the maintained diagram/package guide or the accepted specification owner, update inbound links, and **delete** this snapshot. Review it if the default replay, square mapping, or connection projection changes before that trigger.

This table follows [`SHOWCASE_SCENARIO`](../packages/agent-flow-viz/src/canonical-replay.ts), using the checked before/after projection and the [flow evidence mapping](../packages/agent-flow-projection/src/index.ts). “Squares” means squares whose borders highlight **at that step**, not every square containing an item. “None” under connections means the step has no supported displayed arrow, even if a square or hidden reducer field changes. An arrow labeled **command** grants or records a decision; it does not assert that a native request or host write occurred. **Native fact** and **external Jev fact** are supplied observations. IDs are example IDs from this source-free trace.

The replay starts with `openRound`. In production an attributed edit, its permit, and admission lead the resident to request a round, but those preceding runtime and permit events are omitted here. The [TypeScript decision boundary ledger](typescript-decision-boundary-ledger.md) records the separately reviewed runtime-event recognition boundary.

## Open the round and prepare two edits

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 1 | `openRound`: Bend creates round #1. | Agent observation, Capacity check, Round state; round #1 appears. | None; opening a round changes state without a displayed transfer. |
| 2 | `admitObservation`: first edit becomes observation #1 in the round. | Agent observation, Capacity check; source work #1 and admission appear. | Agent observation → Capacity check: observation was supplied for admission (**native fact**). |
| 3 | `queueDispatch`: first edit's dispatch #1 starts immediately. | Capacity check, Source preparation; dispatch #1 is running. | Capacity check → Source preparation: dispatch #1 entered running (**state**). |
| 4 | `admitObservation`: second edit becomes observation #2. | Agent observation, Capacity check; source work #2 appears. | Agent observation → Capacity check: second observation supplied (**native fact**). |
| 5 | `queueDispatch`: dispatch #2 waits behind #1. | Capacity check, Preparation queue; dispatch #2 is pending. | Capacity check → Preparation queue: dispatch #2 entered pending (**state**). |
| 6 | `startObservation`: source work #1 starts reading. | Agent observation, Source preparation; #1 moves from source queued to source reading. | Agent observation → Source preparation: the same work ID #1 changed stage (**state**). |
| 7 | `beginObservedPreparation`: reserve workspace and emit `prepare` for #1. | Agent observation, Capacity check, Source preparation; preparation is authorized. | Agent observation → Capacity check (**native fact**); Capacity check → Source preparation (**prepare command**). |
| 8 | `preparationCompleted`: release preparation space and admit review unit #4. | Capacity check, Source preparation, Review work items; #4 starts reviewing. | Source preparation → Review work items: prepared work #1 produced child review #4 (**state**). |
| 9 | `completeObservation`: source work #1 completes. | Source preparation; its source-reading state clears. | None; completion clears a displayed item without identifying a destination square. |
| 10 | `dispatchSettled`: #1's dispatch ends and waiting #2 starts. | Preparation queue, Source preparation; #2 moves from pending to running. | Preparation queue → Source preparation: dispatch ID #2 changes stage (**state**). |
| 11 | `startObservation`: source work #2 starts reading. | Agent observation, Source preparation; #2 moves from source queued to source reading. | Agent observation → Source preparation: same work ID #2 (**state**). |
| 12 | `beginObservedPreparation`: reserve workspace and emit `prepare` for #2. | Agent observation, Capacity check, Source preparation. | Agent observation → Capacity check (**native fact**); Capacity check → Source preparation (**prepare command**). |
| 13 | `preparationCompleted`: release preparation space and admit review unit #6. | Capacity check, Source preparation, Review work items; #6 starts reviewing. | Source preparation → Review work items: prepared work #2 produced child review #6 (**state**). |
| 14 | `completeObservation`: source work #2 completes. | Source preparation; second source-reading item clears. | None; the source work ends here. |
| 15 | `dispatchSettled`: second source dispatch cycle completes. | Source preparation; dispatch #2 leaves running. | None; no item crosses a displayed connection. |

## Send both review units toward Jev

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 16 | `queueDispatch`: review dispatch #4 starts. | Capacity check, Source preparation; dispatch #4 is running. | Capacity check → Source preparation: dispatch #4 entered running (**state**). |
| 17 | `startReview`: Bend emits `reviewStarted` for #4. | None; the displayed square details do not change. | None; the decision alone establishes no displayed movement. |
| 18 | `jevRequestReady`: supplied readiness facts let Bend issue request #7. | Review work items, Jev ready check, Awaiting Jev result; work #4 becomes at-Jev and request #7 is issued but not started. | Review work items → Awaiting Jev result (**state**); Review work items → Jev ready check (**native fact**); Jev ready check → Jev request attempt (**command**, permission only). |
| 19 | `jevRequestStarted`: native request attempt #7 is observed. | Jev ready check, Jev request attempt, Awaiting Jev result; #7 is now started. | Jev ready check → Jev request attempt (**state**); Jev request attempt → Awaiting Jev result (**native fact**). |
| 20 | `queueDispatch`: review dispatch #6 starts. | Capacity check, Source preparation; dispatch #6 is running. | Capacity check → Source preparation: dispatch #6 entered running (**state**). |
| 21 | `startReview`: Bend emits `reviewStarted` for #6. | None; the displayed square details do not change. | None; no displayed movement is established. |
| 22 | `jevRequestReady`: readiness facts let Bend issue request #8. | Review work items, Jev ready check, Awaiting Jev result; work #6 becomes at-Jev while #7 is still in flight. | Review work items → Awaiting Jev result (**state**); Review work items → Jev ready check (**native fact**); Jev ready check → Jev request attempt (**command**). |
| 23 | `jevRequestStarted`: native attempt #8 is observed; two requests are in flight. | Jev ready check, Jev request attempt, Awaiting Jev result; #7 and #8 are started. | Jev ready check → Jev request attempt (**state**); Jev request attempt → Awaiting Jev result (**native fact**). |
| 24 | `jevRequestSettled`: Jev supplies a finding for work #4. Bend records it and commands retention. | Capacity check, Review work items, Jev request attempt, Awaiting Jev result, Review outcomes; #4 is pending finding. | Awaiting Jev result → Review outcomes (**state** and **external Jev fact**); Review outcomes → Pending advice (**retain command**, storage not yet observed). |
| 25 | `collectionReady`: native storage reports advice #10 ready. | Review outcomes, Pending advice; ready #10 appears. | Review outcomes → Pending advice (**native fact**); Pending advice → Advice collection (**eligibility command**, not a lease). |
| 26 | `dispatchSettled`: review dispatch #4 ends. | Source preparation; dispatch #4 leaves running. | None; no displayed transfer. |
| 27 | `jevRequestSettled`: Jev supplies a finding for work #6. | Capacity check, Review work items, Jev request attempt, Awaiting Jev result, Review outcomes; #6 is pending finding. | Awaiting Jev result → Review outcomes (**state** and **external Jev fact**); Review outcomes → Pending advice (**retain command**). |
| 28 | `collectionReady`: native storage reports advice #11 ready. | Review outcomes, Pending advice; ready #10 and #11 appear. | Review outcomes → Pending advice (**native fact**); Pending advice → Advice collection (**eligibility command**). |
| 29 | `dispatchSettled`: review dispatch #6 ends. | Source preparation; no running dispatch remains. | None; no displayed transfer. |

## Deliver advice, then clean up

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 30 | `stopPolled`: Bend says the Stop decision is ready. | Advice collection, Round state; round #1 changes its wait state. | Advice collection → Round state (**finishReady command**). |
| 31 | `collectionReserveLease`: reserve advice #10 for output token #8. | Pending advice, Advice collection; #10 has a lease and remains ready. | Pending advice → Advice collection: lease #10 appears while ready #10 remains (**state**). |
| 32 | `collectionReserveLease`: reserve advice #11 for the same output token. | Pending advice, Advice collection; #11 also has a lease and remains ready. | Pending advice → Advice collection: lease #11 appears (**state**). |
| 33 | `finishReserve`: reserve the Stop output slot for both selected units. | Host output; finish #1 is reserved. | None; creating a slot changes Host output without asserting a write. |
| 34 | `submissionBegin`: begin advice #10's Stop submission batch. | Host output; #10 batch is reserved. | None; a new batch appears inside Host output. |
| 35 | `submissionBegin`: begin advice #11's Stop submission batch. | Host output; #11 batch is reserved. | None; a second batch appears inside Host output. |
| 36 | `finishAuthorize`: authorize the combined Stop output slot. | Advice collection, Host output; finish #1 changes reserved → authorized. | Advice collection → Host output (**authorization command**); Host output → Host output (**state phase change**). No host write is established. |
| 37 | `submissionAuthorize`: authorize advice #10's batch. | Advice collection, Host output; #10 changes reserved → authorized. | Advice collection → Host output (**command**); Host output → Host output (**state phase change**). |
| 38 | `submissionAuthorize`: authorize advice #11's batch. | Advice collection, Host output; #11 changes reserved → authorized. | Advice collection → Host output (**command**); Host output → Host output (**state phase change**). |
| 39 | `deliveryAcknowledgeCheck`: supplied output facts pass the acknowledgment gate. | None; Bend emits `deliveryAckReady` without changing displayed state. | None; the gate result is not a host-output fact. |
| 40 | `submissionTerminal`: record advice #10's certain submission. | Host output; #10 changes authorized → submitted. | Host output → Host output: #10 phase change (**state**). |
| 41 | `submissionTerminal`: record advice #11's certain submission. | Host output; #11 changes authorized → submitted. | Host output → Host output: #11 phase change (**state**). |
| 42 | `finishTerminal`: record the acknowledged Stop output result. | Host output; finish #1 changes authorized → submitted. | Host output → Host output: finish phase change (**state**). This does not prove the agent used the advice. |
| 43 | `deliveryFinalizeCheck`: Bend says all two submissions can finalize. | None; `deliveryFinalReady` changes no displayed state. | None; a decision is emitted without a displayed transition. |
| 44 | `deliveryFindingDispositionCheck`: Bend chooses `deliveryKeepForReoffer` for the first finding. | None; the decision changes no displayed state. | None; disposition is a decision, not a movement. |
| 45 | `collectionReleaseLease`: release advice #10's lease. | Pending advice, Advice collection; #10 remains ready without a lease. | None; lease removal does not establish a new destination. |
| 46 | `deliveryFindingDispositionCheck`: same disposition for the second finding. | None; `deliveryKeepForReoffer` changes no displayed state. | None; no displayed transition. |
| 47 | `collectionReleaseLease`: release advice #11's lease. | Pending advice, Advice collection; neither advice is leased. | None; lease removal only. |
| 48 | `stopGroupEnded`: end the Stop group for round #1. | Round state; its Stop/wait state changes. | None; no displayed connection carries this state change. |
| 49 | `finishEnd`: close the reserved output slot. | Host output; finish #1 disappears. | None; the slot ends inside Host output. |
| 50 | `retirePartition`: retire round #1 and release its remaining work and reservations. | Agent observation, Capacity check, Review outcomes, Round state; active round, work, and charges disappear. | Round state → Round state: checked round #1 is retired (**state**). |
| 51 | `collectionRetireAdvice`: retire ready advice #10. | Pending advice, Host output; #10 leaves the ready set and its delivery record changes. | None; retirement clears records without a supported displayed destination. |
| 52 | `submissionForget`: forget #10's completed submission record. | None; no displayed square detail changes. | None. |
| 53 | `collectionRetireAdvice`: retire ready advice #11. | Pending advice, Host output; #11 leaves the ready set and its delivery record changes. | None; retirement clears records. |
| 54 | `submissionForget`: forget #11's completed submission record. | None; no displayed square detail changes. | None. The checked state now has no active round, work, capacity charge, ready advice, lease, submission batch, or output slot. |

The final state retains a source-free usage counter; that counter is not an active round or reservation. The replay is an example of accepted reducer events, not proof that a live Jev request or agent acknowledgment occurred in this run.
