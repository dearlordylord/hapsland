import Base
import ./CacheRuntime.bend as CacheRuntime
import ./SharingRuntime.bend as SharingRuntime
import ./FreshnessScenario.bend as Freshness
import ./ScopedRevision.bend as ScopedRevision
import ../agent-flow-bend/Canonical.bend as Canonical
import ./Callbacks.bend as Callbacks
import ./NoticeScenario.bend as NoticeScenario

type State is Data:
  State{callbacks: Callbacks.State, notices: NoticeScenario.State, clocks: List<&2, NoticeScenario.Clock>, freshness: Freshness.State, sources: ScopedRevision.State, sharing: SharingRuntime.State, cache: CacheRuntime.State}

def initial() -> State:
  State{Callbacks.initial(), NoticeScenario.initial(), Nil{}, Freshness.initial(), ScopedRevision.initial(), SharingRuntime.initial(), CacheRuntime.initial()}

def callbacks(state: State) -> Callbacks.State:
  match state:
    case State{callbacks, _, _, _, _, _, _}: callbacks

def with_callbacks(state: State, callbacks: Callbacks.State) -> State:
  match state:
    case State{_, notices, clocks, freshness, sources, sharing, cache}: State{callbacks, notices, clocks, freshness, sources, sharing, cache}

def retained_state(callbacks: Callbacks.State, notices: NoticeScenario.State, clocks: List<&2,NoticeScenario.Clock>, +freshness: Freshness.State, sources: ScopedRevision.State, canonical: Canonical.State, sharing: SharingRuntime.State, cache: CacheRuntime.State) -> State:
  State{callbacks,notices,clocks,freshness,ScopedRevision.retain(sources,canonical,Freshness.bindings(freshness)),sharing,cache}

def retained_sharing(callbacks: Callbacks.State, notices: NoticeScenario.State, clocks: List<&2,NoticeScenario.Clock>, freshness: Freshness.State, sources: ScopedRevision.State, +canonical: Canonical.State, +sharing: SharingRuntime.State, +cache: CacheRuntime.State) -> State:
  retained_state(callbacks,notices,clocks,Freshness.retained_references(CacheRuntime.restored_sources(freshness,cache),canonical,List.append(&2,Freshness.Scope,SharingRuntime.source_references(sharing),CacheRuntime.references(cache))),sources,canonical,sharing,cache)

def retain(state: State, +canonical: Canonical.State) -> State:
  match state:
    case State{callbacks,notices,clocks,freshness,sources,sharing,cache}:
      retained_sharing(Callbacks.retain(callbacks,canonical),notices,clocks,freshness,sources,canonical,SharingRuntime.retain(sharing,canonical),CacheRuntime.retain(cache,canonical))

def notice_requested(state: State, scope: NoticeScenario.Scope, key: Nat, sequence: Nat, commands: List<&2,Canonical.Command>, now: Nat) -> NoticeScenario.Followup:
  match state:
    case State{_, notices, _, _, _, _, _}: NoticeScenario.request(notices, scope, key, sequence, commands)

def notice_reserved(state: State, partition: Nat, commands: List<&2,Canonical.Command>) -> NoticeScenario.Followup:
  match state:
    case State{_, NoticeScenario.State{pending}, _, _, _, _, _}: NoticeScenario.reserved(pending,partition,commands)

def freshness(state: State) -> Freshness.State:
  match state:
    case State{_,_,_,freshness,_,_,_}: freshness

def sources(state: State) -> ScopedRevision.State:
  match state:
    case State{_,_,_,_,sources,_,_}: sources

def with_freshness(state: State, freshness: Freshness.State) -> State:
  match state:
    case State{callbacks,notices,clocks,_,sources,sharing,cache}: State{callbacks,notices,clocks,freshness,sources,sharing,cache}

def with_sources(state: State, sources: ScopedRevision.State) -> State:
  match state:
    case State{callbacks,notices,clocks,freshness,_,sharing,cache}: State{callbacks,notices,clocks,freshness,sources,sharing,cache}

def sharing(state: State) -> SharingRuntime.State:
  match state:
    case State{_,_,_,_,_,sharing,_}: sharing

def with_sharing(state: State, sharing: SharingRuntime.State) -> State:
  match state:
    case State{callbacks,notices,clocks,freshness,sources,_,cache}: State{callbacks,notices,clocks,freshness,sources,sharing,cache}

def cache(state: State) -> CacheRuntime.State:
  match state:
    case State{_,_,_,_,_,_,cache}: cache

def with_cache(state: State, cache: CacheRuntime.State) -> State:
  match state:
    case State{callbacks,notices,clocks,freshness,sources,sharing,_}:
      State{callbacks,notices,clocks,freshness,sources,sharing,cache}

def cache_feedback_state(feedback: CacheRuntime.Feedback) -> CacheRuntime.State:
  match feedback:
    case CacheRuntime.Feedback{state,_}: state
def cache_feedback(state: CacheRuntime.State, before: Canonical.State, commands: List<&2,Canonical.Command>) -> CacheRuntime.State:
  cache_feedback_state(CacheRuntime.existing_removed(state,before,commands))

def accepted(+state: State, before: Canonical.State, canonical: Canonical.State, +event: Canonical.CanonicalEvent, +commands: List<&2,Canonical.Command>) -> State:
  retain(with_cache(with_sharing(with_freshness(state,Freshness.feedback(commands,freshness(state),event)),SharingRuntime.feedback(sharing(state),event,commands)),cache_feedback(cache(state),before,commands)),canonical)


