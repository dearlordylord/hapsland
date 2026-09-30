# Default diagram replay: step-by-step walkthrough

**Purpose:** Preserve a human-readable walkthrough of the default connected diagram for owner review.
**Status:** Temporary snapshot of the 57-step default guided replay on `feat/monkey-business-153-157`, awaiting #147 diagram review.
**Authority:** Implementation and validation evidence. The checked reducer and its adapter determine behavior; this walkthrough is not a product contract or a live runtime trace.
**Expected use:** Open the Hapsland dashboard's default guided case, advance one canonical step at a time, and compare the highlighted squares and connections with this table.
**Lifecycle:** At #147 diagram acceptance or closure, consolidate any still-useful explanation into the maintained diagram/package guide or the accepted specification owner, update inbound links, and **delete** this snapshot. Review it if the default replay, square mapping, or connection projection changes before that trigger.

This table follows [`SHOWCASE_SCENARIO`](../packages/agent-flow-viz/src/canonical-replay.ts), using the checked before/after projection and the [flow evidence mapping](../packages/agent-flow-projection/src/index.ts). “Squares” means squares whose borders highlight **at that step**, not every square containing an item. “None” under connections means the step has no supported displayed arrow, even if a square or hidden reducer field changes. An arrow labeled **command** grants or records a decision; it does not assert that a native request or host write occurred. **Native fact** and **external Jev fact** are supplied observations. IDs are example IDs from this source-free trace.

The replay starts with a source-free pre-edit permit request, followed by the accepted attributed edit that consumes the permit and opens the virtual round in the same Bend transition. A second permit and accepted edit join that round. The actual agent-runtime hook payloads are outside this source-free replay; the [TypeScript decision boundary ledger](typescript-decision-boundary-ledger.md) records how native events become these reducer inputs.

**Awaiting source read** holds Bend's `awaitingSourceRead` work records. **Job scheduling** separately shows pending, active, and running preparation or review jobs linked by operation ID. These are distinct Bend records about the same operation. The source work stays in **Awaiting source read** until reading starts, even when its job is running.

## Open the round and prepare two edits

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 1 | `issuePermit`: the pre-edit hook requests permission for edit #1; Bend issues permit #1. No edit or round exists yet. | Agent edit, Admission & capacity; one pending permit appears, with no round. | Agent edit → Admission & capacity: the pre-edit request supplied source-free identity and timing facts (**native fact**). |
| 2 | `consumePermit`: the successful attributed edit #1 consumes permit #1. Bend atomically opens virtual round #1. | Agent edit, Admission & capacity, Round state; the permit disappears and round #1 appears. | Agent edit → Admission & capacity: the accepted edit consumes its permit (**native fact**); the new round is a checked result, not a separate movement. |
| 3 | `admitObservation`: Bend accepts observation #1 for the open round and creates source work #1 in `awaitingSourceRead`. It has not read source or reserved review capacity. | Agent edit, Admission & capacity, Awaiting source read; work #1 appears in its own Bend-state square, while observation charges remain zero. | Agent edit → Admission & capacity: the resident supplied an attributed observation (**native fact**). Admission & capacity → Awaiting source read: Bend created work #1 after checking the round (**state**). |
| 4 | `queueDispatch`: Bend schedules source work #1. With no older job or running preparation, job #1 starts immediately; source reading has not begun. | Awaiting source read and Job scheduling; work #1 remains `awaitingSourceRead`, while its linked job appears as running preparation. Read & prepare source and Admission & capacity do not change. | Awaiting source read → Job scheduling links work #1 to its job without moving the work (**state**). No arrow enters Read & prepare source yet. |
| 5 | `issuePermit`: the pre-edit hook requests permission for edit #2; Bend issues permit #2. Round #1 stays open. | Agent edit, Admission & capacity; a pending permit appears beside the existing round. | Agent edit → Admission & capacity: a second pre-edit request supplied identity and timing facts (**native fact**). |
| 6 | `consumePermit`: successful attributed edit #2 consumes permit #2 and joins the existing virtual round. | Agent edit shows the transient fact “edit #2 accepted”; Admission & capacity shows “permit #2 used” as this step's checked result. The pending permit disappears; Round state does not change, and source work #2 does not exist until step 7. | Agent edit → Admission & capacity: the edit fact is supplied and Bend consumes its permit (**native fact**). No permit moves back to the agent. |
| 7 | `admitObservation`: edit #2 becomes observation #2. | Agent edit, Admission & capacity, Awaiting source read; work #2 appears beside #1. | Agent edit → Admission & capacity: observation #2 was supplied (**native fact**). Admission & capacity → Awaiting source read: Bend created work #2 (**state**). |
| 8 | `queueDispatch`: job #2 waits behind #1. | Awaiting source read and Job scheduling; job #2 is waiting for the next batch, while source work #2 still awaits reading. | Awaiting source read → Job scheduling links work #2 to its pending job (**state**). |
| 9 | `startObservation`: source work #1 starts reading. | Awaiting source read and Read & prepare source; #1 moves from `awaitingSourceRead` to `sourceReading`. | Awaiting source read → Read & prepare source: the same work ID #1 changed stage (**state**). |
| 10 | `beginObservedPreparation`: reserve workspace and emit `prepare` for #1. | Agent edit, Admission & capacity, Read & prepare source; preparation is authorized. | Agent edit → Admission & capacity (**native fact**); Admission & capacity → Read & prepare source (**prepare command**). |
| 11 | `preparationCompleted`: release preparation space and admit review unit #4. | Admission & capacity, Read & prepare source, Review work items; #4 starts reviewing. | Read & prepare source → Review work items: prepared work #1 produced child review #4 (**state**). |
| 12 | `completeObservation`: source work #1 completes. | Read & prepare source; its source-reading state clears. | None; completion clears a displayed item without identifying a destination square. |
| 13 | `dispatchSettled`: #1's job ends and waiting #2 starts. | Job scheduling; #2 changes from waiting for the next batch to running preparation. Source work #2 still awaits reading. | Job scheduling → Job scheduling: the same job ID #2 changes scheduling status (**state**). |
| 14 | `startObservation`: source work #2 starts reading. | Awaiting source read and Read & prepare source; #2 moves from `awaitingSourceRead` to `sourceReading`. | Awaiting source read → Read & prepare source: same work ID #2 (**state**). |
| 15 | `beginObservedPreparation`: reserve workspace and emit `prepare` for #2. | Agent edit, Admission & capacity, Read & prepare source. | Agent edit → Admission & capacity (**native fact**); Admission & capacity → Read & prepare source (**prepare command**). |
| 16 | `preparationCompleted`: release preparation space and admit review unit #6. | Admission & capacity, Read & prepare source, Review work items; #6 starts reviewing. | Read & prepare source → Review work items: prepared work #2 produced child review #6 (**state**). |
| 17 | `completeObservation`: source work #2 completes. | Read & prepare source; second source-reading item clears. | None; the source work ends here. |
| 18 | `dispatchSettled`: second source job settles. | Job scheduling; job #2 leaves running. | None; the job ends without a displayed destination. |

## Send both review units toward Jev

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 19 | `queueDispatch`: review job #4 starts. | Review work items and Job scheduling; review work #4 stays in place and its linked job becomes running. | Review work items → Job scheduling links the work to its new job (**state**). |
| 20 | `startReview`: Bend emits `reviewStarted` for #4. | None; the displayed square details do not change. | None; the decision alone establishes no displayed movement. |
| 21 | `jevRequestReady`: supplied readiness facts let Bend issue request #7. | Review work items, Jev ready check, Awaiting Jev result; work #4 becomes at-Jev and request #7 is issued but not started. | Review work items → Awaiting Jev result (**state**); Review work items → Jev ready check (**native fact**); Jev ready check → Jev request attempt (**command**, permission only). |
| 22 | `jevRequestStarted`: native request attempt #7 is observed. | Jev ready check, Jev request attempt, Awaiting Jev result; #7 is now started. | Jev ready check → Jev request attempt (**state**); Jev request attempt → Awaiting Jev result (**native fact**). |
| 23 | `queueDispatch`: review job #6 starts. | Review work items and Job scheduling; review work #6 stays in place and its linked job becomes running. | Review work items → Job scheduling links the work to its new job (**state**). |
| 24 | `startReview`: Bend emits `reviewStarted` for #6. | None; the displayed square details do not change. | None; no displayed movement is established. |
| 25 | `jevRequestReady`: readiness facts let Bend issue request #8. | Review work items, Jev ready check, Awaiting Jev result; work #6 becomes at-Jev while #7 is still in flight. | Review work items → Awaiting Jev result (**state**); Review work items → Jev ready check (**native fact**); Jev ready check → Jev request attempt (**command**). |
| 26 | `jevRequestStarted`: native attempt #8 is observed; two requests are in flight. | Jev ready check, Jev request attempt, Awaiting Jev result; #7 and #8 are started. | Jev ready check → Jev request attempt (**state**); Jev request attempt → Awaiting Jev result (**native fact**). |
| 27 | `jevRequestSettled`: Jev supplies a finding for work #4. Bend records it and commands retention. | Admission & capacity, Review work items, Jev request attempt, Awaiting Jev result, Review outcomes; #4 is pending finding. | Awaiting Jev result → Review outcomes (**state** and **external Jev fact**); Review outcomes → Pending advice (**retain command**, storage not yet observed). |
| 28 | `collectionReady`: native storage reports advice #10 ready. | Review outcomes, Pending advice; ready #10 appears. | Review outcomes → Pending advice (**native fact**); Pending advice → Advice collection (**eligibility command**, not a lease). |
| 29 | `dispatchSettled`: review job #4 ends. | Job scheduling; job #4 leaves running. | None; no displayed transfer. |
| 30 | `jevRequestSettled`: Jev supplies a finding for work #6. | Admission & capacity, Review work items, Jev request attempt, Awaiting Jev result, Review outcomes; #6 is pending finding. | Awaiting Jev result → Review outcomes (**state** and **external Jev fact**); Review outcomes → Pending advice (**retain command**). |
| 31 | `collectionReady`: native storage reports advice #11 ready. | Review outcomes, Pending advice; ready #10 and #11 appear. | Review outcomes → Pending advice (**native fact**); Pending advice → Advice collection (**eligibility command**). |
| 32 | `dispatchSettled`: review job #6 ends. | Job scheduling; no running review job remains. | None; no displayed transfer. |

## Deliver advice, then clean up

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 33 | `stopPolled`: Bend says the Stop decision is ready. | Advice collection, Round state; round #1 changes its wait state. | Advice collection → Round state (**finishReady command**). |
| 34 | `collectionReserveLease`: reserve advice #10 for output token #8. | Pending advice, Advice collection; #10 has a lease and remains ready. | Pending advice → Advice collection: lease #10 appears while ready #10 remains (**state**). |
| 35 | `collectionReserveLease`: reserve advice #11 for the same output token. | Pending advice, Advice collection; #11 also has a lease and remains ready. | Pending advice → Advice collection: lease #11 appears (**state**). |
| 36 | `finishReserve`: reserve the Stop output slot for both selected units. | Host output; finish #1 is reserved. | None; creating a slot changes Host output without asserting a write. |
| 37 | `submissionBegin`: begin advice #10's Stop submission batch. | Host output; #10 batch is reserved. | None; a new batch appears inside Host output. |
| 38 | `submissionBegin`: begin advice #11's Stop submission batch. | Host output; #11 batch is reserved. | None; a second batch appears inside Host output. |
| 39 | `finishAuthorize`: authorize the combined Stop output slot. | Advice collection, Host output; finish #1 changes reserved → authorized. | Advice collection → Host output (**authorization command**); Host output → Host output (**state phase change**). No host write is established. |
| 40 | `submissionAuthorize`: authorize advice #10's batch. | Advice collection, Host output; #10 changes reserved → authorized. | Advice collection → Host output (**command**); Host output → Host output (**state phase change**). |
| 41 | `submissionAuthorize`: authorize advice #11's batch. | Advice collection, Host output; #11 changes reserved → authorized. | Advice collection → Host output (**command**); Host output → Host output (**state phase change**). |
| 42 | `deliveryAcknowledgeCheck`: supplied output facts pass the acknowledgment gate. | None; Bend emits `deliveryAckReady` without changing displayed state. | None; the gate result is not a host-output fact. |
| 43 | `submissionTerminal`: record advice #10's certain submission. | Host output; #10 changes authorized → submitted. | Host output → Host output: #10 phase change (**state**). |
| 44 | `submissionTerminal`: record advice #11's certain submission. | Host output; #11 changes authorized → submitted. | Host output → Host output: #11 phase change (**state**). |
| 45 | `finishTerminal`: record the acknowledged Stop output result. | Host output; finish #1 changes authorized → submitted. | Host output → Host output: finish phase change (**state**). This does not prove the agent used the advice. |
| 46 | `deliveryFinalizeCheck`: Bend says all two submissions can finalize. | None; `deliveryFinalReady` changes no displayed state. | None; a decision is emitted without a displayed transition. |
| 47 | `deliveryFindingDispositionCheck`: Bend chooses `deliveryKeepForReoffer` for the first finding. | None; the decision changes no displayed state. | None; disposition is a decision, not a movement. |
| 48 | `collectionReleaseLease`: release advice #10's lease. | Pending advice, Advice collection; #10 remains ready without a lease. | None; lease removal does not establish a new destination. |
| 49 | `deliveryFindingDispositionCheck`: same disposition for the second finding. | None; `deliveryKeepForReoffer` changes no displayed state. | None; no displayed transition. |
| 50 | `collectionReleaseLease`: release advice #11's lease. | Pending advice, Advice collection; neither advice is leased. | None; lease removal only. |
| 51 | `stopGroupEnded`: end the Stop group for round #1. | Round state; its Stop/wait state changes. | None; no displayed connection carries this state change. |
| 52 | `finishEnd`: close the reserved output slot. | Host output; finish #1 disappears. | None; the slot ends inside Host output. |
| 53 | `retirePartition`: retire round #1 and release its remaining work and reservations. | Admission & capacity, Review outcomes, Round state; active round, work, and charges disappear. | Round state → Round state: checked round #1 is retired (**state**). |
| 54 | `collectionRetireAdvice`: retire ready advice #10. | Pending advice, Host output; #10 leaves the ready set and its delivery record changes. | None; retirement clears records without a supported displayed destination. |
| 55 | `submissionForget`: forget #10's completed submission record. | None; no displayed square detail changes. | None. |
| 56 | `collectionRetireAdvice`: retire ready advice #11. | Pending advice, Host output; #11 leaves the ready set and its delivery record changes. | None; retirement clears records. |
| 57 | `submissionForget`: forget #11's completed submission record. | None; no displayed square detail changes. | None. The checked state now has no active round, work, capacity charge, ready advice, lease, submission batch, or output slot. |

The final state retains a source-free usage counter; that counter is not an active round or reservation. The replay is an example of accepted reducer events, not proof that a live Jev request or agent acknowledgment occurred in this run.
