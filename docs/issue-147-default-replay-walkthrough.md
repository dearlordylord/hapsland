# Default diagram replay: step-by-step walkthrough

**Purpose:** Preserve a human-readable walkthrough of the default connected diagram for owner review.
**Status:** Temporary snapshot of the 63-step default guided replay on `feat/integrated-preparation`, awaiting #147 diagram review.
**Authority:** Implementation and validation evidence. The checked reducer and its adapter determine behavior; this walkthrough is not a product contract or a live runtime trace.
**Expected use:** Open the Hapsland dashboard's default guided case, advance one canonical step at a time, and compare the highlighted squares and connections with this table.
**Lifecycle:** At #147 diagram acceptance or closure, consolidate any still-useful explanation into the maintained diagram/package guide or the accepted specification owner, update inbound links, and **delete** this snapshot. Review it if the default replay, square mapping, or connection projection changes before that trigger.

Guided step numbers below count canonical events. The composed preparation trace
adds six A → B steps between canonical steps 10/11 and the branching-budget
traces for two artifacts between canonical steps 15/16;
these use the same Next, Previous and Redo controls and advance history while
the canonical step number stays fixed. See the maintained
[visualization guide](../packages/agent-flow-viz/README.md) for that inner view.

This table follows [`SHOWCASE_SCENARIO`](../packages/agent-flow-viz/src/canonical-replay.ts), using the checked before/after projection and the [flow evidence mapping](../packages/agent-flow-projection/src/index.ts). “Squares” means squares whose borders highlight **at that step**, not every square containing an item. “None” under connections means the step has no supported displayed arrow, even if a square or hidden reducer field changes. An arrow labeled **command** grants or records a decision; it does not assert that a native request or host write occurred. **Native fact** and **external Jev fact** are supplied observations. IDs are example IDs from this source-free trace.

The table uses canonical IDs in its event descriptions. The diagram now also
shows separate display ordinals: source reads #1/#2 are operations 1/2,
preparations #1/#2 are operations 3/5, and review items #1/#2/#3 are operations
4/6/7. Jev requests #1/#2/#3 have canonical request IDs 8/9/10; advice #1/#2 comes
from review operations 4/6. These display numbers do not replace the IDs
that connect reducer records.
The first unit charge is displayed as Unit charge #1 even though its canonical
capacity reservation ID is 2; ID 1 belonged to the earlier preparation charge.

The replay starts with a source-free pre-edit permit request, followed by the accepted attributed edit that consumes the permit and opens the virtual round in the same Bend transition. A second permit and accepted edit join that round. The actual agent-runtime hook payloads are outside this source-free replay; the [TypeScript decision boundary ledger](typescript-decision-boundary-ledger.md) records how native events become these reducer inputs.

**Awaiting source read** holds Bend's `awaitingSourceRead` work records. **Job scheduling** separately shows queued and running preparation or review jobs linked by operation ID. These are distinct Bend records about the same operation. The source work stays in **Awaiting source read** until the resident enters its source-read phase, even when its job is running. Entering that phase precedes the actual source capture and does not prove bytes were read.

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
| 8 | `queueDispatch`: job #2 starts while a preparation slot is free, alongside #1. | Awaiting source read and Job scheduling; two preparation jobs are running, while source work #2 still awaits its source-read phase. | Awaiting source read → Job scheduling links work #2 to its running job (**state**). Starting the job does not claim that source reading occurred. |
| 9 | `startObservation`: the resident starts job #1's source-read phase. It sends this event before the backend gate, settings checks, and actual source capture. | Awaiting source read and Read & prepare source; #1 moves from `awaitingSourceRead` to `sourceReading`. This is a phase transition, not proof that bytes have been read. | Awaiting source read → Read & prepare source: the same work ID #1 changed stage (**state**). |
| 10 | `beginObservedPreparation`: reserve workspace and emit `prepare` for #1. | Agent edit, Admission & capacity, Read & prepare source; preparation is authorized. | Agent edit → Admission & capacity (**native fact**); Admission & capacity → Read & prepare source (**prepare command**). |
| 11 | `preparationCompleted`: release preparation space and admit review unit #4. | Admission & capacity, Read & prepare source, Review work items; #4 starts reviewing. | Read & prepare source → Review work items: prepared work #1 produced child review #4 (**state**). |
| 12 | `completeObservation`: source work #1 completes. | Read & prepare source; its source-reading state clears. | None; completion clears a displayed item without identifying a destination square. |
| 13 | `dispatchSettled`: #1's job ends; #2 continues independently. | Job scheduling; #1 disappears, while #2 remains running. Source work #2 still awaits its source-read phase. | No connection claims a transfer; this step only removes the settled job from scheduling. |
| 14 | `startObservation`: job #2 enters its source-read phase before actual capture. | Awaiting source read and Read & prepare source; #2 moves from `awaitingSourceRead` to `sourceReading`. | Awaiting source read → Read & prepare source: same work ID #2 (**state**). |
| 15 | `beginObservedPreparation`: reserve workspace and emit `prepare` for #2. | Agent edit, Admission & capacity, Read & prepare source. | Agent edit → Admission & capacity (**native fact**); Admission & capacity → Read & prepare source (**prepare command**). |
| 16 | `preparationCompleted`: release preparation space and admit review units #6 and #7. | Admission & capacity, Read & prepare source, Review work items; both units start reviewing. | Read & prepare source → Review work items: prepared work #2 produced two child reviews (**state**). |
| 17 | `completeObservation`: source work #2 completes. | Read & prepare source; second source-reading item clears. | None; the source work ends here. |
| 18 | `dispatchSettled`: second source job settles. | Job scheduling; job #2 leaves running. | None; the job ends without a displayed destination. |

## Send both review units toward Jev

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 19 | `queueDispatch`: review job #4 starts. | Review work items and Job scheduling; review work #4 stays in place and its linked job becomes running. | Review work items → Job scheduling links the work to its new job (**state**). |
| 20 | `startReview`: Bend emits `reviewStarted` for #4. | None; the displayed square details do not change. | None; the decision alone establishes no displayed movement. |
| 21 | `jevRequestReady`: supplied readiness facts let Bend issue Jev request #1 (internal ID 8). | Review work items, Jev ready check, Awaiting Jev result; work #4 becomes at-Jev and request #1 is issued but not started. | Review work items → Awaiting Jev result (**state**); Review work items → Jev ready check (**native fact**); Jev ready check → Jev request attempt (**command**, permission only). |
| 22 | `jevRequestStarted`: native attempt for Jev request #1 is observed. | Jev ready check, Jev request attempt, Awaiting Jev result; request #1 is now started. | Jev ready check → Jev request attempt (**state**); Jev request attempt → Awaiting Jev result (**native fact**). |
| 23 | `queueDispatch`: review job #6 starts. | Review work items and Job scheduling; review work #6 stays in place and its linked job becomes running. | Review work items → Job scheduling links the work to its new job (**state**). |
| 24 | `startReview`: Bend emits `reviewStarted` for #6. | None; the displayed square details do not change. | None; no displayed movement is established. |
| 25 | `jevRequestReady`: readiness facts let Bend issue Jev request #2 (internal ID 9). | Review work items, Jev ready check, Awaiting Jev result; work #6 becomes at-Jev while request #1 is still in flight. | Review work items → Awaiting Jev result (**state**); Review work items → Jev ready check (**native fact**); Jev ready check → Jev request attempt (**command**). |
| 26 | `jevRequestStarted`: native attempt for Jev request #2 is observed; two requests are in flight. | Jev ready check, Jev request attempt, Awaiting Jev result; requests #1 and #2 are started. | Jev ready check → Jev request attempt (**state**); Jev request attempt → Awaiting Jev result (**native fact**). |
| 27 | `jevRequestSettled`: Jev supplies a finding for Review item #1. Bend records it and commands retention. | Admission & capacity shows “Unit charge #1 → stored” and its persistent stored result charge #1; Jev request attempt, Awaiting Jev result, and Review outcomes change. | Awaiting Jev result → Review outcomes (**state** and **external Jev fact**); Review outcomes → Advice ready / retained (**retain command**, storage not yet observed). |
| 28 | `collectionReady`: the resident asks Bend to mark advice #1 ready; Bend checks its finding, edit, and remaining work. | Review outcomes, Advice ready / retained; advice #1 appears ready. | Review outcomes → Advice ready / retained (**checked state link**); Advice ready / retained → Advice collection (**eligibility command**, not a lease). |
| 29 | `dispatchSettled`: review job #4 ends. | Job scheduling; job #4 leaves running. | None; no displayed transfer. |
| 30 | `jevRequestSettled`: Jev supplies a finding for Review item #2. | Admission & capacity shows its charge becoming stored result; Jev request attempt, Awaiting Jev result, and Review outcomes change. Advice for edit #2 still waits for its other review item. | Awaiting Jev result → Review outcomes (**state** and **external Jev fact**); Review outcomes → Advice ready / retained (**retain command**, storage not yet observed). |
| 31 | `dispatchSettled`: review job #2 ends. | Job scheduling; Review item #3 still awaits its own job. | None; no displayed transfer. |
| 32 | `queueDispatch`: review job #3 starts. | Review work items and Job scheduling show the linked work and running job. | Review work items → Job scheduling (**linked record**). |
| 33 | `startReview`: Bend emits `reviewStarted` for Review item #3. | None; displayed records do not move. | None; this decision alone establishes no movement. |
| 34 | `jevRequestReady`: readiness facts let Bend issue Jev request #3 (internal ID 10). | Review work items, Jev ready check, Awaiting Jev result; Review item #3 enters the Jev phase. | The checked state and readiness command light the same routes as steps 21 and 25. |
| 35 | `jevRequestStarted`: native attempt for Jev request #3 is observed. | Jev ready check, Jev request attempt, Awaiting Jev result. | The request moves from issued to started (**state** and **native fact**). |
| 36 | `jevRequestSettled`: Jev reports `clear` for Review item #3. | Review outcomes explicitly shows “NOW · Review item #3 clear”; its work and unit charge disappear. Advice does not appear. | Awaiting Jev result → Review outcomes (**external Jev fact**); no retain-finding route lights. |
| 37 | `dispatchSettled`: review job #3 ends. | Job scheduling loses the job; no review job remains. | None; no displayed transfer. |
| 38 | `collectionReady`: the resident asks Bend to mark advice #2 ready now that both review items from edit #2 have finished. | Review outcomes and Advice ready / retained; both advice groups are now ready. | Review outcomes → Advice ready / retained (**checked state link**); Advice ready / retained → Advice collection (**eligibility command**). |

## Deliver advice, then clean up

| Step | Event and what happens | Squares that light; what to look for | Connections and why |
| --- | --- | --- | --- |
| 39 | `stopPolled`: Bend says the Stop decision is ready. | Advice collection, Round state; round #1 changes its wait state. | Advice collection → Round state (**finishReady command**). |
| 40 | `collectionReserveLease`: reserve advice #4 for output token #8. | Advice ready / retained, Advice collection; #4 has a lease and remains ready. | Advice ready / retained → Advice collection: lease #4 appears while ready #4 remains (**state**). |
| 41 | `collectionReserveLease`: reserve advice #6 for the same output token. | Advice ready / retained, Advice collection; #6 also has a lease and remains ready. | Advice ready / retained → Advice collection: lease #6 appears (**state**). |
| 42 | `finishReserve`: reserve the Stop output slot for both selected units. | Host output; finish #1 is reserved. | None; creating a slot changes Host output without asserting a write. |
| 43 | `submissionBegin`: begin advice #4's Stop submission batch. | Host output; #4 batch is reserved. | None; a new batch appears inside Host output. |
| 44 | `submissionBegin`: begin advice #6's Stop submission batch. | Host output; #6 batch is reserved. | None; a second batch appears inside Host output. |
| 45 | `finishAuthorize`: authorize the combined Stop output slot. | Advice collection, Host output; finish #1 changes reserved → authorized. | Advice collection → Host output (**authorization command**); Host output → Host output (**state phase change**). No host write is established. |
| 46 | `submissionAuthorize`: authorize advice #4's batch. | Advice collection, Host output; #4 changes reserved → authorized. | Advice collection → Host output (**command**); Host output → Host output (**state phase change**). |
| 47 | `submissionAuthorize`: authorize advice #6's batch. | Advice collection, Host output; #6 changes reserved → authorized. | Advice collection → Host output (**command**); Host output → Host output (**state phase change**). |
| 48 | `deliveryAcknowledgeCheck`: supplied output facts pass the acknowledgment gate. | None; Bend emits `deliveryAckReady` without changing displayed state. | None; the gate result is not a host-output fact. |
| 49 | `submissionTerminal`: record advice #4's certain submission. | Host output; #4 changes authorized → submitted. | Host output → Host output: #4 phase change (**state**). |
| 50 | `submissionTerminal`: record advice #6's certain submission. | Host output; #6 changes authorized → submitted. | Host output → Host output: #6 phase change (**state**). |
| 51 | `finishTerminal`: record the acknowledged Stop output result. | Host output; finish #1 changes authorized → submitted. | Host output → Host output: finish phase change (**state**). This does not prove the agent used the advice. |
| 52 | `deliveryFinalizeCheck`: Bend says all two submissions can finalize. | None; `deliveryFinalReady` changes no displayed state. | None; a decision is emitted without a displayed transition. |
| 53 | `deliveryFindingDispositionCheck`: Bend chooses `deliveryKeepForReoffer` for the first finding. | None; the decision changes no displayed state. | None; disposition is a decision, not a movement. |
| 54 | `collectionReleaseLease`: release advice #4's lease. | Advice ready / retained, Advice collection; #4 remains ready without a lease. | None; lease removal does not establish a new destination. |
| 55 | `deliveryFindingDispositionCheck`: same disposition for the second finding. | None; `deliveryKeepForReoffer` changes no displayed state. | None; no displayed transition. |
| 56 | `collectionReleaseLease`: release advice #6's lease. | Advice ready / retained, Advice collection; neither advice is leased. | None; lease removal only. |
| 57 | `stopGroupEnded`: end the Stop group for round #1. | Round state; its Stop/wait state changes. | None; no displayed connection carries this state change. |
| 58 | `finishEnd`: close the reserved output slot. | Host output; finish #1 disappears. | None; the slot ends inside Host output. |
| 59 | `retirePartition`: retire round #1 and release its remaining work and reservations. | Admission & capacity, Review outcomes, Round state; active round, work, and charges disappear. | Round state → Round state: checked round #1 is retired (**state**). |
| 60 | `collectionRetireAdvice`: retire ready advice #4. | Advice ready / retained, Host output; #4 leaves the ready set and its delivery record changes. | None; retirement clears records without a supported displayed destination. |
| 61 | `submissionForget`: forget #4's completed submission record. | None; no displayed square detail changes. | None. |
| 62 | `collectionRetireAdvice`: retire ready advice #6. | Advice ready / retained, Host output; #6 leaves the ready set and its delivery record changes. | None; retirement clears records. |
| 63 | `submissionForget`: forget #6's completed submission record. | None; no displayed square detail changes. | None. The checked state now has no active round, work, capacity charge, ready advice, lease, submission batch, or output slot. |

The final state retains a source-free usage counter; that counter is not an active round or reservation. The replay is an example of accepted reducer events, not proof that a live Jev request or agent acknowledgment occurred in this run.
