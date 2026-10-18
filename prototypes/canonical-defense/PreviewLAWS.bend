# Owner-approved preview laws (2026-10-15): exact bodies, complete annotations,
# real draw commands, automatic selection agreement and read-only world assembly.
import Base
import ./DefensePreviewMarks.bend as P
import ./Font.bend as F
import ./DefenseMotionTypes.bend as V

# Both sides of inclusion: a valid body is marked; an invalid body is untouched.
law valid_body_is_marked:
  for target: P.Target
  for body: P.Body
  for selected: Bool
  for ready: Bool
  for rest: List<&2, P.Mark>
  {
    P.keep(True{}, target, body, selected, ready, rest)
    == P.Mark{target, body, selected, ready} <> rest
    : List<&2, P.Mark>
  }
law invalid_body_not_marked:
  for target: P.Target
  for body: P.Body
  for selected: Bool
  for ready: Bool
  for +rest: List<&2, P.Mark>
  {P.keep(False{}, target, body, selected, ready, rest) == rest : List<&2, P.Mark>}
# Every body is visited, even when several bodies belong to one review.
law visits_every_body:
  for +head: P.Body
  for +tail: List<&2, P.Body>
  for +target: P.Target
  for +selected: Bool
  for +ready: Bool
  for +rest: List<&2, P.Mark>
  {
    P.for_target(head <> tail, target, selected, ready, rest)
    == P.for_body(target, head, selected, ready, P.for_target(tail, target, selected, ready, rest))
    : List<&2, P.Mark>
  }
law visits_every_target:
  for +target: P.Target
  for +tail: List<&2, P.Target>
  for +bodies: List<&2, P.Body>
  for +ready: Bool
  for +rest: List<&2, P.Mark>
  {
    P.collect(target <> tail, bodies, ready, rest)
    == P.for_target(bodies, target, P.chosen(target), ready, P.collect(tail, bodies, ready, rest))
    : List<&2, P.Mark>
  }
# Exact ordinary identity: no operation-only matching across lifetimes or rounds.
law ordinary_identity:
  for +owner: V.WorkIdentity
  for +other: V.WorkIdentity
  for selected: Bool
  for order: Nat
  for x: U32
  for y: U32
  {
    P.belongs(P.Target{owner, None{}, order, selected}, P.Body{other, x, y})
    == P.same(owner, other)
    : Bool
  }
# Finish marks only committed members in the same full scope.
law finish_membership:
  for +p: Nat
  for +l: Nat
  for +r: Nat
  for op: Nat
  for selected: Bool
  for +ids: List<&2, Nat>
  for order: Nat
  for +bp: Nat
  for +bl: Nat
  for +br: Nat
  for +bo: Nat
  for x: U32
  for y: U32
  {
    P.belongs(
      P.Target{V.WorkIdentity{p, l, r, op}, Some{ids}, order, selected},
      P.Body{V.WorkIdentity{bp, bl, br, bo}, x, y}
    )
    == (Nat.is_eq(p, bp) && Nat.is_eq(l, bl) && Nat.is_eq(r, br) && P.contains(bo, ids))
    : Bool
  }
# The chosen mark retains the exact callback, not merely its operation number.
law exact_chosen:
  for owner: V.WorkIdentity
  for members: Maybe<&2, List<&2, Nat>>
  for order: Nat
  for +selected: Bool
  {P.chosen(P.Target{owner, members, order, selected}) == selected : Bool}
# Marking must reach actual rectangle commands; deleting it breaks these laws.
law render_every_mark:
  for +mark: P.Mark
  for +tail: List<&2, P.Mark>
  for +rest: List<&2, F.Rect>
  {P.draw(mark <> tail, rest) == P.draw_one(mark, P.draw(tail, rest)) : List<&2, F.Rect>}
law visible_marker_at_body:
  for target: P.Target
  for owner: V.WorkIdentity
  for +x: U32
  for +y: U32
  for +selected: Bool
  for +ready: Bool
  for +rest: List<&2, F.Rect>
  {P.draw_one(P.Mark{target, P.Body{owner, x, y}, selected, ready}, rest) ==
    F.Box{P.left(x), P.top(y), 21, 2, P.color(selected, ready)} <>
    F.Box{P.left(x), (y + 9 : U32), 21, 2, P.color(selected, ready)} <>
    F.Box{P.left(x), P.top(y), 2, 21, P.color(selected, ready)} <>
    F.Box{(x + 9 : U32), P.top(y), 2, 21, P.color(selected, ready)} <> rest : List<&2, F.Rect>}
law empty_targets_no_phantoms:
  for bodies: List<&2, P.Body>
  for ready: Bool
  for +rest: List<&2, P.Mark>
  {P.collect([], bodies, ready, rest) == rest : List<&2, P.Mark>}
law cooldown_is_visible:
  for selected: Bool
  {P.color(selected, False{}) == 6741384 : U32}
law body_membership_exact:
  for +target: P.Target
  for +body: P.Body
  for +selected: Bool
  for +ready: Bool
  for +rest: List<&2, P.Mark>
  {
    P.for_body(target, body, selected, ready, rest)
    == P.keep(P.belongs(target, body), target, body, selected, ready, rest)
    : List<&2, P.Mark>
  }
law membership_empty:
  for id: Nat
  {P.contains(id, []) == False{} : Bool}
law membership_step:
  for +id: Nat
  for +head: Nat
  for +tail: List<&2, Nat>
  {P.contains(id, head <> tail) == (Nat.is_eq(id, head) || P.contains(id, tail)) : Bool}
law same_full_identity:
  for +p: Nat
  for +l: Nat
  for +r: Nat
  for +o: Nat
  for +bp: Nat
  for +bl: Nat
  for +br: Nat
  for +bo: Nat
  {
    P.same(V.WorkIdentity{p, l, r, o}, V.WorkIdentity{bp, bl, br, bo})
    == (Nat.is_eq(p, bp) && Nat.is_eq(l, bl) && Nat.is_eq(r, br) && Nat.is_eq(o, bo))
    : Bool
  }
law accelerator_scope_without_targets:
  {P.scope(3) == "AUTO: PREPARATION / JEV WORK" : String}
law courier_scope_without_targets:
  {P.scope(4) == "AUTO: AUTHORIZED OUTPUT / FINISH" : String}
law no_bodies_no_mark:
  for target: P.Target
  for selected: Bool
  for ready: Bool
  for +rest: List<&2, P.Mark>
  {P.for_target([], target, selected, ready, rest) == rest : List<&2, P.Mark>}
law no_marks_no_drawing:
  for +rest: List<&2, F.Rect>
  {P.draw([], rest) == rest : List<&2, F.Rect>}
law every_anchor_is_drawn:
  for +head: P.Anchor
  for +tail: List<&2, P.Anchor>
  for +rest: List<&2, F.Rect>
  {
    P.draw_ordered(head <> tail, rest)
    == P.draw_anchor(head, P.draw_ordered(tail, rest))
    : List<&2, F.Rect>
  }
law no_targets_no_anchor_drawing:
  for +rest: List<&2, F.Rect>
  {P.draw_anchors([], rest) == rest : List<&2, F.Rect>}
law anchor_visible_at_target:
  for +x: U32
  for +y: U32
  for +label: String
  for +selected: Bool
  for +ready: Bool
  for +rest: List<&2, F.Rect>
  {
    P.draw_anchor(P.Anchor{x, y, label, selected, ready}, rest)
    == F.Box{
      P.left(x),
      (y + 2 : U32),
      21,
      3,
      P.color(selected, ready)
    } <> F.Box{
      (x + 2 : U32),
      P.top(y),
      3,
      21,
      P.color(selected, ready)
    } <> F.text(
      label,
      (x + 15 : U32),
      P.top(y),
      1,
      P.color(selected, ready),
      F.Box{(x + 14 : U32), P.top(y), 104, 9, 1058076} <> rest
    )
    : List<&2, F.Rect>
  }

law anchor_partition_empty:
  for wanted: Bool
  {P.anchor_partition([], wanted) == [] : List<&2, P.Anchor>}
law anchor_partition_step:
  for +head: P.Anchor
  for +tail: List<&2, P.Anchor>
  for +wanted: Bool
  {
    P.anchor_partition(head <> tail, wanted)
    == P.anchor_keep(wanted, P.anchor_selected(head), head, P.anchor_partition(tail, wanted))
    : List<&2, P.Anchor>
  }
law anchor_partition_membership:
  for +wanted: Bool
  for +selected: Bool
  for +head: P.Anchor
  for +rest: List<&2, P.Anchor>
  {
    P.anchor_keep(wanted, selected, head, rest)
    == Bool.pick(List<&2, P.Anchor>, Bool.not(Bool.xor(wanted, selected)), head <> rest, rest)
    : List<&2, P.Anchor>
  }
law anchors_order_chosen_first:
  for +items: List<&2, P.Anchor>
  for +rest: List<&2, F.Rect>
  {
    P.draw_anchors(items, rest)
    == P.draw_ordered(
      List.append(
        &2,
        P.Anchor,
        P.anchor_partition(items, True{}),
        P.anchor_partition(items, False{})
      ),
      rest
    )
    : List<&2, F.Rect>
  }
law left_coordinate:
  for +x: U32
  {P.left(x) == U32.sub(x, U32.min(x, 10)) : U32}
law top_coordinate:
  for +y: U32
  {P.top(y) == U32.sub(y, U32.min(y, 10)) : U32}
law anchor_selected_field:
  for x: U32
  for y: U32
  for label: String
  for +selected: Bool
  for ready: Bool
  {P.anchor_selected(P.Anchor{x, y, label, selected, ready}) == selected : Bool}
law selected_ready_color:
  {P.color(True{}, True{}) == 16768133 : U32}
law other_ready_color:
  {P.color(False{}, True{}) == 6741384 : U32}
