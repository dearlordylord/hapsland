import Base
import ../CacheScenario.bend as Cache
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/CollectionState.bend as Collection
import ../../agent-flow-bend/ReuseState.bend as Reuse
import ../../agent-flow-bend/Ledger.bend as Ledger
import ./cache-native.bend as Fixture

# Original fixture-local intern labels:
# 11=same original namespace+semantic input;
# 22=changed original work cohort, same semantic input;
# 33=changed configured captured credential generation, same semantic input;
# 11=controlled-null namespace unchanged despite an unrelated authority counter;
# 44=controlled-null to actual configured credential capture.
# Ledger partition is always 1; original cached result owner remains unchanged.
def code(outputs: List<&2, C.Output>) -> Nat:
  match outputs:
    case []: 99n
    case C.EventEstablished{C.ReuseCacheHit{}} <> _: 1n
    case C.EventEstablished{C.ReuseOwned{}} <> _: 2n
    case _ <> tail: code(tail)

def cached_owner(items: List<&2, Reuse.Entry>) -> List<&2, Nat>:
  match items:
    case Reuse.Entry{id, _, _, reservation} <> _: [id, reservation]
    case []: [0n, 0n]

def result_values(
  outputs: List<&2, C.Output>,
  usage: Ledger.Usage,
  reused: Reuse.State
) -> List<&2, Nat>:
  match usage reused:
    case Ledger.Usage{items, bytes} Reuse.State{claims, +cache}:
      List.append(
        &2,
        Nat,
        [
          code(outputs),
          items,
          bytes,
          List.length(&2, Reuse.Claim, claims),
          List.length(&2, Reuse.Entry, cache)
        ],
        cached_owner(cache)
      )

def result(step: C.Step) -> List<&2, Nat>:
  match step:
    case C.Advanced{+state, outputs}:
      result_values(
        outputs,
        Ledger.total(Cache.ledger_charges(state)),
        Collection.reuse_state(C.collection_of(state))
      )
    case C.Rejected{_, _}: [98n]

def routed(runtime: Fixture.Runtime, id: Nat) -> List<&2, Nat>:
  match runtime:
    case Fixture.Runtime{state, _}: result(C.step(state, C.ReuseRoute{id, False{}}))

def route(id: Nat) -> List<&2, Nat>:
  routed(Fixture.add(Fixture.initial(), 11n, 1n, 1n, 8n), id)

def main() -> IO(Unit):
  IO.print(
    Fixture.bracket(Fixture.lists([route(11n), route(22n), route(33n), route(11n), route(44n)]))
  )
