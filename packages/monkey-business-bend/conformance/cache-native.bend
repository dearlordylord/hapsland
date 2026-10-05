import Base
import ../CacheScenario.bend as Cache
import ../SharingScenario.bend as Sharing
import ../FreshnessScenario.bend as Freshness
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/CollectionState.bend as Collection
import ../../agent-flow-bend/ReuseState.bend as Reuse
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original source-free cache commands; cleanup comes from shared CacheScenario
# and real Canonical feedback, not a native expected trace.
type Runtime is Data:
  Runtime{canonical: C.State, cache: Cache.State}

def initial() -> Runtime:
  Runtime{C.initial(Ledger.Limits{512n,1048576n,16n,65536n}),Cache.initial()}

def accepted(result: C.Step) -> C.State:
  match result:
    case C.Advanced{state,_}: state
    case C.Rejected{state,_}: state

def send_all(events: List<&2,C.CanonicalEvent>, state: C.State) -> C.State:
  match events:
    case []: state
    case event <> tail: send_all(tail,accepted(C.step(state,event)))

def feedback_value(value: Cache.Feedback, canonical: C.State) -> Runtime:
  match value:
    case Cache.Feedback{cache,releases}: Runtime{send_all(releases,canonical),cache}

def apply_feedback(+before: C.State, cache: Cache.State, result: C.Step) -> Runtime:
  match result:
    case C.Advanced{state,commands}:
      feedback_value(Cache.feedback(cache,before,commands),state)
    case C.Rejected{state,_}: Runtime{state,cache}

def send(runtime: Runtime, event: C.CanonicalEvent) -> Runtime:
  match runtime:
    case Runtime{+state,cache}: apply_feedback(state,cache,C.step(state,event))

def offer(+id: Nat, +partition: Nat) -> Cache.Offer:
  Cache.Offer{id,Sharing.SharingKey{partition,id},Freshness.Scope{partition,1n,1n,id},5n,C.RequestClear{}}

def commit_result(+before: C.State, +cache: Cache.State, +offer: Cache.Offer, +reservation: Nat, result: C.Step) -> Runtime:
  match result:
    case C.Advanced{+state,+commands}:
      Runtime{send_all(Cache.refused_release(before,offer,reservation,commands),state),
        Cache.retain(cache,state,offer,reservation,commands)}
    case C.Rejected{state,_}: Runtime{state,cache}

def commit(runtime: Runtime, +offer: Cache.Offer, +reservation: Nat, limit: Nat) -> Runtime:
  match runtime:
    case Runtime{+state,cache}: commit_result(state,cache,offer,reservation,C.step(state,Cache.commit(offer,reservation,limit,20n)))

def add(runtime: Runtime, +id: Nat, +partition: Nat, reservation: Nat, +limit: Nat) -> Runtime:
  commit(send(send(runtime,Cache.prepare(offer(id,partition),limit,20n)),Cache.reserve(offer(id,partition))),offer(id,partition),reservation,limit)

def cache_words(entries: List<&2,Reuse.Entry>) -> List<&2,Nat>:
  match entries:
    case []: []
    case Reuse.Entry{id,partition,bytes,reservation} <> tail:
      id <> partition <> bytes <> reservation <> cache_words(tail)

def charge_words(charges: List<&2,Ledger.Charge>) -> List<&2,Nat>:
  match charges:
    case []: []
    case Ledger.Charge{id,partition,bytes,_} <> tail: id <> partition <> bytes <> charge_words(tail)

def row_value(usage: Ledger.Usage, reuse: Reuse.State, charges: List<&2,Ledger.Charge>, payloads: Nat) -> List<&2,List<&2,Nat>>:
  match usage reuse:
    case Ledger.Usage{items,bytes} Reuse.State{claims,cache}:
      [[items,bytes,payloads,List.length(&2,Reuse.Claim,claims)],cache_words(cache),charge_words(charges)]

def row(runtime: Runtime) -> List<&2,List<&2,Nat>>:
  match runtime:
    case Runtime{+state,Cache.State{payloads}}:
      row_value(Ledger.total(Cache.ledger_charges(state)),Collection.reuse_state(C.collection_of(state)),
        Cache.ledger_charges(state),List.length(&2,Cache.Payload,payloads))

def pressure() -> List<&2,List<&2,List<&2,Nat>>>:
  +one = add(initial(),11n,1n,1n,2n)
  +two = add(one,22n,2n,2n,2n)
  +touch = send(two,C.ReuseTouch{11n})
  +prepare = send(touch,C.CachePrepare{33n,5n,2n,20n})
  +three = commit(send(prepare,Cache.reserve(offer(33n,1n))),offer(33n,1n),3n,2n)
  +other = add(three,44n,2n,4n,3n)
  +discard = send(other,C.CacheDiscardPartition{1n})
  +clear = send(discard,C.CacheClear{})
  [row(one),row(two),row(touch),row(prepare),row(three),row(other),row(discard),row(clear)]

def rejected_commit() -> List<&2,List<&2,List<&2,Nat>>>:
  +reserved = send(send(initial(),Cache.reserve(offer(11n,1n))),Cache.reserve(offer(22n,2n)))
  +prepared = send(send(reserved,Cache.prepare(offer(11n,1n),1n,20n)),Cache.prepare(offer(22n,2n),1n,20n))
  +first = commit(prepared,offer(11n,1n),1n,1n)
  +refused = commit(first,offer(22n,2n),2n,1n)
  [row(first),row(refused),row(send(refused,C.CacheClear{}))]

def oversized() -> List<&2,List<&2,List<&2,Nat>>>:
  +one = add(initial(),11n,1n,1n,1n)
  [row(one),row(send(one,C.CachePrepare{22n,21n,1n,20n}))]

def comma(text: String) -> String:
  match text:
    case SNil{}: SNil{}
    case SCon{head,tail}: String.append(",",SCon{head,tail})
def bracket(text: String) -> String:
  String.append("[",String.append(text,"]"))
def numbers(items: List<&2,Nat>) -> String:
  match items:
    case []: ""
    case head <> tail: String.append(Nat.show(head),comma(numbers(tail)))
def lists(items: List<&2,List<&2,Nat>>) -> String:
  match items:
    case []: ""
    case head <> tail: String.append(bracket(numbers(head)),comma(lists(tail)))
def rows(items: List<&2,List<&2,List<&2,Nat>>>) -> String:
  match items:
    case []: ""
    case head <> tail: String.append(bracket(lists(head)),comma(rows(tail)))
def main() -> IO(Unit):
  IO.print(bracket(rows(List.append(&2,List<&2,List<&2,Nat>>,pressure(),List.append(&2,List<&2,List<&2,Nat>>,rejected_commit(),oversized())))))
