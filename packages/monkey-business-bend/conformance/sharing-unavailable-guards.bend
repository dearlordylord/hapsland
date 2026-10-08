import Base
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../SharingRuntime.bend as Runtime
import ../SharingScenario.bend as Sharing
import ../FreshnessScenario.bend as Freshness
import ../Engine.bend as Engine
import ../CacheScenario.bend as Cache
import ../Types.bend as Types

# Literal bookkeeping seam regressions, not laws or a substitute for the
# unchanged public late-join and original unavailable-owner scenarios.
def scope() -> Freshness.Scope:
  Freshness.Scope{1n, 1n, 1n, 3n}

def captured() -> Runtime.State:
  Runtime.State{
    Sharing.State{
      [
        Sharing.Evaluation{
          1n,
          Sharing.SharingKey{1n, 1n},
          [Sharing.Member{scope(), Freshness.Source{1n, 1n}, 1n}],
          None{},
          None{}
        }
      ],
      2n
    },
    [],
    [Runtime.Binding{scope(), 1n, 5n, False{}}],
    []
  }

def base() -> C.State:
  C.initial(Ledger.Limits{10n, 100n, 10n, 100n})

def reviewing(state: C.State) -> C.State:
  match state:
    case C.State{ledger, rounds, _, nr, no, admissions, dispatch, collection, history}:
      C.State{
        ledger,
        rounds,
        [C.Work{1n, 1n, 1n, 3n, 1n, C.Reviewing{}, 0n}],
        nr,
        no,
        admissions,
        dispatch,
        collection,
        history
      }

def ready(operation: Nat) -> C.CanonicalEvent:
  C.JevRequestReady{1n, 1n, 1n, operation, True{}, True{}, False{}, True{}, True{}, True{}}

def accepted() -> Runtime.State:
  Runtime.feedback(captured(), ready(3n), [C.PolicyDecided{C.JevRequestUnavailable{}}])

def physical() -> Runtime.State:
  Runtime.State{
    Sharing.State{
      [
        Sharing.Evaluation{
          1n,
          Sharing.SharingKey{1n, 1n},
          [Sharing.Member{scope(), Freshness.Source{1n, 1n}, 1n}],
          Some{Sharing.Physical{1n, 1n, 1n, 3n, 7n}},
          None{}
        }
      ],
      2n
    },
    [],
    [Runtime.Binding{scope(), 1n, 5n, False{}}],
    []
  }

def callback(request: Nat) -> C.CanonicalEvent:
  C.JevRequestSettled{1n, 1n, 1n, 3n, request, C.RequestBackendFailure{}, True{}}

def consumed() -> Runtime.State:
  Runtime.feedback(
    physical(),
    callback(7n),
    [C.EventEstablished{C.JevRequestOutcomeRecorded{C.RequestBackendFailure{}}}]
  )

def facts(
  before: C.State,
  after: C.State,
  operation: Nat,
  runtime: Runtime.State
) -> List<&2, C.CanonicalEvent>:
  Runtime.postprocess(captured(), runtime, before, after, Freshness.initial(), ready(operation))

def empty(items: List<&2, C.CanonicalEvent>) -> Bool:
  match items:
    case Nil{}: True{}
    case _ <> _: False{}

def settled(items: List<&2, C.CanonicalEvent>) -> Bool:
  match items:
    case C.ReuseMemberCheck{_, _, _, _} <> C.ReuseRelease{1n} <> Nil{}: True{}
    case _: False{}

def released(items: List<&2, C.CanonicalEvent>) -> Bool:
  match items:
    case C.ReuseRelease{1n} <> Nil{}: True{}
    case _: False{}

def no_cache_attempt(published: Engine.CachePublished) -> Bool:
  match published:
    case Engine.CachePublished{_, Nil{}, releases}: released(releases)
    case _: False{}

def rejected_cache(published: Engine.CachePublished) -> Bool:
  match published:
    case Engine.CachePublished{_, Nil{}, Nil{}}: True{}
    case _: False{}

def engine() -> Types.State:
  Engine.initial(Ledger.Limits{10n, 100n, 10n, 100n})

def clear_callback() -> C.CanonicalEvent:
  C.JevRequestSettled{1n, 1n, 1n, 3n, 7n, C.RequestClear{}, False{}}

def clear_result() -> Types.State:
  Engine.with_sharing_runtime(
    engine(),
    Runtime.feedback(physical(), clear_callback(), [C.PolicyDecided{C.JevObservationIgnored{}}])
  )

def cache_guards() -> Bool:
  no_cache_attempt(
    Engine.cache_begin_current(
      engine(),
      Cache.Offer{1n, Sharing.SharingKey{1n, 1n}, scope(), 5n, C.RequestClear{}},
      Freshness.Binding{scope(), Freshness.Source{1n, 1n}, 1n},
      False{}
    )
  ) &&
  rejected_cache(Engine.cache_begin(engine(), clear_result(), clear_callback(), [])) &&
  rejected_cache(
    Engine.cache_begin(
      engine(),
      clear_result(),
      clear_callback(),
      [C.PolicyDecided{C.JevObservationIgnored{}}]
    )
  )

def checks() -> Bool:
  settled(facts(reviewing(base()), base(), 3n, accepted())) &&
  empty(facts(reviewing(base()), reviewing(base()), 3n, accepted())) &&
  empty(facts(base(), base(), 3n, accepted())) &&
  empty(facts(reviewing(base()), base(), 4n, accepted())) &&
  empty(facts(reviewing(base()), base(), 3n, Runtime.feedback(captured(), ready(3n), []))) &&
  settled(
    Runtime.postprocess(physical(), consumed(), base(), base(), Freshness.initial(), callback(7n))
  ) &&
  empty(
    Runtime.postprocess(physical(), physical(), base(), base(), Freshness.initial(), callback(99n))
  ) &&
  empty(
    Runtime.postprocess(consumed(), consumed(), base(), base(), Freshness.initial(), callback(7n))
  ) && cache_guards()

def main() -> IO(Unit):
  IO.print(
    Bool.pick(
      String,
      checks(),
      "PASS unavailable ownership guards",
      "FAIL unavailable ownership guards"
    )
  )
