# Pure target-to-visible-body annotations. Eligibility remains owned by TowerFire.
import Base
import ./Font.bend as F
import ./DefenseMotionTypes.bend as V

type Target is Data:
  Target{owner: V.WorkIdentity, members: Maybe<&2, List<&2, Nat>>, order: Nat, selected: Bool}

type Body is Data:
  Body{owner: V.WorkIdentity, x: U32, y: U32}
type Mark is Data:
  Mark{target: Target, body: Body, chosen: Bool, ready: Bool}

def contains(+id: Nat, items: List<&2, Nat>) -> Bool:
  match items:
    case Nil{}: False{}
    case head <> tail: Nat.is_eq(id, head) || contains(id, tail)
def same(a: V.WorkIdentity, b: V.WorkIdentity) -> Bool:
  match a b:
    case V.WorkIdentity{p, l, r, o} V.WorkIdentity{bp, bl, br, bo}: Nat.is_eq(p, bp) && Nat.is_eq(
      l,
      bl
    ) && Nat.is_eq(r, br) && Nat.is_eq(o, bo)
def belongs(target: Target, body: Body) -> Bool:
  match target body:
    case Target{V.WorkIdentity{p, l, r, _}, Some{ids}, _, _} Body{
      V.WorkIdentity{bp, bl, br, bo},
      _,
      _
    }:
      Nat.is_eq(p, bp) && Nat.is_eq(l, bl) && Nat.is_eq(r, br) && contains(bo, ids)
    case Target{owner, None{}, _, _} Body{other, _, _}: same(owner, other)
def chosen(target: Target) -> Bool:
  match target:
    case Target{_, _, _, value}: value
def keep(
  on: Bool,
  target: Target,
  body: Body,
  selected: Bool,
  ready: Bool,
  rest: List<&2, Mark>
) -> List<&2, Mark>:
  match on:
    case False{}: rest
    case True{}: Mark{target, body, selected, ready} <> rest
def for_body(
  +target: Target,
  +body: Body,
  selected: Bool,
  ready: Bool,
  rest: List<&2, Mark>
) -> List<&2, Mark>:
  keep(belongs(target, body), target, body, selected, ready, rest)
def for_target(
  bodies: List<&2, Body>,
  +target: Target,
  +selected: Bool,
  +ready: Bool,
  rest: List<&2, Mark>
) -> List<&2, Mark>:
  match bodies:
    case Nil{}: rest
    case body <> tail: for_body(
      target,
      body,
      selected,
      ready,
      for_target(tail, target, selected, ready, rest)
    )
def collect(
  targets: List<&2, Target>,
  +bodies: List<&2, Body>,
  +ready: Bool,
  rest: List<&2, Mark>
) -> List<&2, Mark>:
  match targets:
    case Nil{}: rest
    case +target <> tail: for_target(
      bodies,
      target,
      chosen(target),
      ready,
      collect(tail, bodies, ready, rest)
    )
def color(selected: Bool, ready: Bool) -> U32:
  match selected ready:
    case True{} True{}: 16768133
    # Eligibility stays green while paused or cooling; yellow alone means a shot now.
    case _ False{}: 6741384
    case _ _: 6741384
def left(+x: U32) -> U32: U32.sub(x, U32.min(x, 10))
def top(+y: U32) -> U32: U32.sub(y, U32.min(y, 10))
def draw_one(mark: Mark, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match mark:
    case Mark{_, Body{_, +x, +y}, +selected, +ready}:
      F.Box{left(x), top(y), 21, 2, color(selected, ready)} <>
      F.Box{left(x), (y + 9 : U32), 21, 2, color(selected, ready)} <>
      F.Box{left(x), top(y), 2, 21, color(selected, ready)} <>
      F.Box{(x + 9 : U32), top(y), 2, 21, color(selected, ready)} <> rest
def draw(marks: List<&2, Mark>, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match marks:
    case Nil{}: rest
    case mark <> tail: draw_one(mark, draw(tail, rest))
def scope(kind: U32) -> String:
  match kind:
    case 3: "AUTO: PREPARATION / JEV WORK"
    case 4: "AUTO: AUTHORIZED OUTPUT / FINISH"
    case 5: "AUTO: SHORTEST PREPARATION / CHECK"
    case 6: "AUTO: UP TO THREE PREPARATION / CHECK"
    case _: "UNKNOWN TOWER"

# Logical target anchors remain visible while their body's causal playback waits.
# A cross and label are annotations, never an extra monster body.
type Anchor is Data:
  Anchor{x: U32, y: U32, label: String, selected: Bool, ready: Bool}
def draw_anchor(value: Anchor, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match value:
    case Anchor{+x, +y, label, +selected, +ready}:
      F.Box{left(x), (y + 2 : U32), 21, 3, color(selected, ready)} <>
      F.Box{(x + 2 : U32), top(y), 3, 21, color(selected, ready)} <>
      F.text(
        label,
        (x + 15 : U32),
        top(y),
        1,
        color(selected, ready),
        F.Box{(x + 14 : U32), top(y), 104, 9, 1058076} <> rest
      )
def anchor_selected(value: Anchor) -> Bool:
  match value:
    case Anchor{_, _, _, selected, _}: selected
def anchor_keep(
  wanted: Bool,
  selected: Bool,
  value: Anchor,
  rest: List<&2, Anchor>
) -> List<&2, Anchor>:
  match wanted selected:
    case True{} True{}: value <> rest
    case False{} False{}: value <> rest
    case _ _: rest
def anchor_partition(items: List<&2, Anchor>, +wanted: Bool) -> List<&2, Anchor>:
  match items:
    case Nil{}: []
    case +head <> tail: anchor_keep(
      wanted,
      anchor_selected(head),
      head,
      anchor_partition(tail, wanted)
    )
def draw_ordered(items: List<&2, Anchor>, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match items:
    case Nil{}: rest
    case item <> tail: draw_anchor(item, draw_ordered(tail, rest))
def draw_anchors(+items: List<&2, Anchor>, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  draw_ordered(
    List.append(&2, Anchor, anchor_partition(items, True{}), anchor_partition(items, False{})),
    rest
  )
