# Directed progress on one authored route; screen proximity is not occupancy.
import Base
import ./DefenseMap.bend as Map
import ./DefenseMotionTypes.bend as V

type Track is Data:
  Track{key: V.WorkIdentity, phase: U32, end: Map.Point, remaining: Nat, moving: Bool}

def measured(
  +point: Map.Point,
  next: Map.Point,
  same: Bool,
  result: Nat & Map.Point
) -> (Nat & Map.Point):
  (distance, end) = result
  Bool.pick((Nat & Map.Point), same,
    ((U32.to_nat(Map.segment_length(point, next)) + distance : Nat), end), (0n, point))

def measure(items: List<&2, V.Waypoint>, +point: Map.Point, +phase: U32) -> (Nat & Map.Point):
  match items:
    case Nil{}: (0n, point)
    case V.Waypoint{x, y, p, _} <> rest:
      +next: Map.Point = Map.Point{x, y}
      measured(point, next, U32.is_eq(p, phase), measure(rest, next, phase))

def tracked(k: V.WorkIdentity, p: U32, retained: Bool, value: Nat & Map.Point) -> Track:
  (+remaining, end) = value
  Track{k, p, end, remaining, retained || (remaining > 0n : Nat)}
def track(actor: V.Actor) -> Track:
  match actor:
    case V.Actor{k, _, _, x, y, +p, _, path, timer, _, _, cause, _}:
      tracked(
        k,
        p,
        U32.is_eq(timer, 0) && Bool.not(U32.is_eq(cause, 6)),
        measure(path, Map.Point{x, y}, p)
      )
def tracks(items: List<&2, V.Actor>) -> List<&2, Track>:
  match items:
    case Nil{}: []
    case actor <> rest: track(actor) <> tracks(rest)
def before(a: V.WorkIdentity, b: V.WorkIdentity) -> Bool:
  match a b:
    case V.WorkIdentity{+ap, +al, +ar, ao} V.WorkIdentity{+bp, +bl, +br, bo}:
      (ap < bp : Nat) || (Nat.is_eq(ap, bp) && ((al < bl : Nat) || (Nat.is_eq(al, bl) && ((ar < br : Nat) || (Nat.is_eq(
        ar,
        br
      ) && (ao < bo : Nat))))))
def ahead(+remaining: Nat, +other: Nat, earlier: Bool) -> Bool:
  (other < remaining : Nat) || (Nat.is_eq(other, remaining) && earlier)
def blocks(a: Track, b: Track) -> Bool:
  match a b:
    case Track{k, p, end, +remaining, True{}} Track{other, q, finish, +left, True{}}:
       U32.is_eq(p, q) && Map.same(end, finish) && ahead(remaining, left, before(other, k)) && (Nat.sub(
         remaining,
         left
       ) < 28n : Nat)
    case _ _: False{}
def clear(+actor: Track, others: List<&2, Track>) -> Bool:
  match others:
    case Nil{}: True{}
    case other <> rest: Bool.not(blocks(actor, other)) && clear(actor, rest)
def blocked_key(on: Bool, item: Track, rest: List<&2, V.WorkIdentity>) -> List<&2, V.WorkIdentity>:
  match on item:
    case True{} Track{k, _, _, _, _}: [k]
    case False{} _: rest

def blocker(+actor: Track, others: List<&2, Track>) -> List<&2, V.WorkIdentity>:
  match others:
    case Nil{}: []
    case +other <> rest: blocked_key(blocks(actor, other), other, blocker(actor, rest))
