import Base
import ./FreshnessScenario.bend as Freshness
import ./ScopedRevision.bend as ScopedRevision
import ../agent-flow-bend/Canonical.bend as Canonical
import ./Callbacks.bend as Callbacks
import ./NoticeScenario.bend as NoticeScenario

type State is Data:
  State{callbacks: Callbacks.State, notices: NoticeScenario.State, clocks: List<&2, NoticeScenario.Clock>, freshness: Freshness.State, sources: ScopedRevision.State}

def initial() -> State:
  State{Callbacks.initial(), NoticeScenario.initial(), Nil{}, Freshness.initial(), ScopedRevision.initial()}

def callbacks(state: State) -> Callbacks.State:
  match state:
    case State{callbacks, _, _, _, _}: callbacks

def with_callbacks(state: State, callbacks: Callbacks.State) -> State:
  match state:
    case State{_, notices, clocks, freshness, sources}: State{callbacks, notices, clocks, freshness, sources}

def retain(state: State, canonical: Canonical.State) -> State:
  match state:
    case State{callbacks, notices, clocks, +freshness, sources}: State{Callbacks.retain(callbacks, canonical), notices, clocks, Freshness.retained(freshness, canonical), ScopedRevision.retain(sources,canonical,Freshness.bindings(Freshness.retained(freshness,canonical)))}

def notice_requested(state: State, scope: NoticeScenario.Scope, key: Nat, sequence: Nat, commands: List<&2,Canonical.Command>, now: Nat) -> NoticeScenario.Followup:
  match state:
    case State{_, notices, _, _, _}: NoticeScenario.request(notices, scope, key, sequence, commands)

def notice_reserved(state: State, partition: Nat, commands: List<&2,Canonical.Command>) -> NoticeScenario.Followup:
  match state:
    case State{_, NoticeScenario.State{pending}, _, _, _}: NoticeScenario.reserved(pending,partition,commands)

def freshness(state: State) -> Freshness.State:
  match state:
    case State{_,_,_,freshness,_}: freshness

def sources(state: State) -> ScopedRevision.State:
  match state:
    case State{_,_,_,_,sources}: sources

def with_freshness(state: State, freshness: Freshness.State) -> State:
  match state:
    case State{callbacks,notices,clocks,_,sources}: State{callbacks,notices,clocks,freshness,sources}

def with_sources(state: State, sources: ScopedRevision.State) -> State:
  match state:
    case State{callbacks,notices,clocks,freshness,_}: State{callbacks,notices,clocks,freshness,sources}

def accepted(+state: State, canonical: Canonical.State, event: Canonical.CanonicalEvent, commands: List<&2,Canonical.Command>) -> State:
  retain(with_freshness(state,Freshness.feedback(freshness(state),event,commands)),canonical)
