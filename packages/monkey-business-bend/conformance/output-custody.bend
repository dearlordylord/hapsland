import Base
import ../Callbacks.bend as Callbacks
import ../OutputScenario.bend as Output
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/CollectionState.bend as Collection
import ../../agent-flow-bend/DeliveryState.bend as Delivery
import ../../agent-flow-bend/SubmissionState.bend as Submission
import ../../agent-flow-bend/Ledger.bend as Ledger
import ./minimal-scenario.bend as Minimal

# Independent production-owner state fixture. A retained finding and an
# unrelated individual lease share the Finish attempt's numeric ID, but neither
# owns its ordered output slot. No simulator projection determines expectations.
def collection(initial: Collection.State, slots: List<&2,Delivery.Slot>) -> Collection.State:
  match initial:
    case Collection.State{ready,_,claims,Delivery.State{_,counters,submissions},revision,reuse,notices}:
      Collection.State{ready,[Collection.Lease{5n,11n}],claims,Delivery.State{slots,counters,submissions},revision,reuse,notices}

def owned(initial: C.State, slots: List<&2,Delivery.Slot>) -> C.State:
  match initial:
    case C.State{Ledger.Ledger{limits,_,_},_,_,next_round,next_operation,admissions,dispatch,old,history}:
      C.State{Ledger.Ledger{limits,10n,[Ledger.Charge{7n,1n,5n,Ledger.StoredResult{}},Ledger.Charge{9n,1n,5n,Ledger.StoredResult{}}]},
        [C.Round{1n,2n,3n,False{},False{},None{},False{},None{}}],
        [C.Work{1n,2n,3n,7n,7n,C.PendingFinding{1n},0n},C.Work{1n,2n,3n,9n,9n,C.PendingFinding{1n},0n}],
        next_round,next_operation,admissions,dispatch,collection(old,slots),history}

def original() -> Callbacks.State:
  Callbacks.State{[Callbacks.Original{Callbacks.Fact{
    Callbacks.Target{Callbacks.Owner{1n,2n,3n,7n},Callbacks.FinishTerminal{1n,3n,5n,11n,[7n,9n]},17n},25n,
    Output.action(C.FinishTerminal{1n,3n,5n,11n,[7n,9n],C.Unknown{}},5n),
    Some{Output.Capture{Output.Finish{1n,3n,5n,11n,[7n,9n]},20n,Output.Uncertain{},5n,10n}}},Callbacks.Dropped{},17n}]}

def count(state: Callbacks.State) -> Nat:
  match state:
    case Callbacks.State{items}: List.length(&2,Callbacks.Original,items)

def retained(slots: List<&2,Delivery.Slot>) -> Nat:
  count(Callbacks.retain(original(),owned(C.initial(Ledger.Limits{10n,100n,10n,100n}),slots)))

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_rows([[
    retained(Nil{}),
    retained([Delivery.Slot{1n,3n,5n,11n,[7n,9n],Delivery.Authorized{}}]),
    retained([Delivery.Slot{1n,3n,5n,11n,[9n,7n],Delivery.Authorized{}}]),
    retained([Delivery.Slot{2n,3n,5n,11n,[7n,9n],Delivery.Authorized{}}]),
    retained([Delivery.Slot{1n,3n,5n,11n,[7n,9n],Delivery.Submitted{}}])
  ]])))
