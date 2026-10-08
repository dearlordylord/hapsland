# Transient presentation facts from accepted frames; never changes business state.
import Base
import ./DefenseModel.bend as M
import ./DefenseEffects.bend as E
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def take(items: List<&2, M.Cue>, fuel: Nat) -> List<&2, M.Cue>:
  match items fuel:
    case _ 0n: []
    case Nil{} _: []
    case cue <> tail 1n+n: cue <> take(tail, n)
def keep(on: Bool, cue: M.Cue, rest: List<&2, M.Cue>) -> List<&2, M.Cue>:
  match on:
    case True{}: cue <> rest
    case False{}: rest
def select(items: List<&2, M.Cue>, +refusals: Bool) -> List<&2, M.Cue>:
  match items:
    case Nil{}: []
    case +cue <> +tail:
      keep(
        Bool.pick(
          Bool,
          refusals,
          U32.is_eq(M.cue_kind(cue), 2),
          Bool.not(U32.is_eq(M.cue_kind(cue), 2))
        ),
        cue,
        select(tail, refusals)
      )
def add(+world: M.World, cue: M.Cue) -> M.World:
  +items: List<&2, M.Cue> = cue <> M.cues(world)
  # Keep the32 most recent refusal facts separately from two short notifications.
  M.with_cues(
    world,
    List.append(&2, M.Cue, take(select(items, True{}), 32n), take(select(items, False{}), 2n))
  )
def positioned(cue: M.Cue, found: Maybe<&2, C.Work>, world: M.World, ttl: U32) -> M.Cue:
  match cue found:
    case M.Cue{kind, id, family, x, y, _} None{}: M.Cue{kind, id, family, x, y, ttl}
    case M.Cue{kind, id, family, _, _, _} Some{work}:
      +point = Map.center(M.layout(world), 1, 0)
      M.Cue{kind, id, family, Map.px(point), Map.py(point), ttl}
def expire(items: List<&2, M.Cue>, +before: M.World, +world: M.World) -> List<&2, M.Cue>:
  match items:
    case Nil{}: []
    case M.Cue{+kind, +id, family, x, y, +ttl} <> +rest:
      +live = U32.is_eq(kind, 2) && Bool.not(Nat.is_eq(E.id_found(id, M.work(M.core(world))), 0n))
      +next = Bool.pick(U32, live, 60, M.sub(ttl, 1))
      keep(
        (next > 0 : U32),
        positioned(
          M.Cue{kind, id, family, x, y, next},
          E.find_work(id, M.work(M.core(before))),
          before,
          next
        ),
        expire(rest, before, world)
      )
def denied(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case C.PolicyDecided{C.PreparationRefused{}} <> _: True{}
    case _ <> rest: denied(rest)
def refusal(+world: M.World, id: Nat, found: Maybe<&2, C.Work>) -> M.World:
  match found:
    case None{}: world
    case Some{+work}:
      +point = Map.center(M.layout(world), 1, 0)
      add(world, M.Cue{2, id, E.family(work), Map.px(point), Map.py(point), 60})
def refused(on: Bool, +world: M.World, +id: Nat) -> M.World:
  match on:
    case False{}: world
    case True{}: refusal(world, id, E.find_work(id, M.work(M.core(world))))
def frame(+world: M.World, value: T.Frame) -> M.World:
  match value:
    case T.ProductFrame{_, _, C.BeginObservedPreparation{_, _, _, id, _}, _, _, outputs, None{}, _}:
      refused(denied(outputs), world, id)
    case T.ProductFrame{_, _, C.AdmitObservation{_, _, _}, _, _, _, None{}, _}:
      +point = Map.path_position(Map.source_route(M.layout(world)), 0)
      add(world, M.Cue{1, 0n, 0n, Map.px(point), Map.py(point), 40})
    case _: world
def frames(items: List<&2, T.Frame>, world: M.World) -> M.World:
  match items:
    case Nil{}: world
    case value <> rest: frames(rest, frame(world, value))
def tick(+before: M.World, +after: M.World, items: List<&2, T.Frame>) -> M.World:
  # Refusal markers identify the source service; actor history carries the moving body.
  M.with_cues(
    after,
    M.cues(frames(items, M.with_cues(before, expire(M.cues(before), before, after))))
  )
def burst(+world: M.World) -> M.World:
  +point = Map.path_position(Map.source_route(M.layout(world)), 0)
  add(world, M.Cue{0, 0n, 0n, Map.px(point), Map.py(point), 60})
def refused_id(items: List<&2, M.Cue>, +id: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case +cue <> tail: (U32.is_eq(M.cue_kind(cue), 2) && Nat.is_eq(M.cue_operation(cue), id)) || refused_id(
      tail,
      id
    )
