# Universal proofs for the owner-approved target/body and drawing laws.
import Base
import ./PreviewLAWS.bend as Laws
import ./DefenseMotionTypes.bend as V

def Laws.valid_body_is_marked(target, body, selected, ready, rest): {==}
def Laws.invalid_body_not_marked(target, body, selected, ready, rest): {==}
def Laws.visits_every_body(head, tail, target, selected, ready, rest): {==}
def Laws.visits_every_target(target, tail, bodies, ready, rest): {==}
def Laws.ordinary_identity(owner, other, selected, order, x, y):
  match owner other:
    case V.WorkIdentity{p, l, r, o} V.WorkIdentity{bp, bl, br, bo}: {==}
def Laws.finish_membership(p, l, r, op, selected, ids, order, bp, bl, br, bo, x, y): {==}
def Laws.exact_chosen(owner, members, order, selected): {==}
def Laws.render_every_mark(mark, tail, rest): {==}
def Laws.visible_marker_at_body(target, owner, x, y, selected, ready, rest): {==}
def Laws.empty_targets_no_phantoms(bodies, ready, rest): {==}
def Laws.cooldown_is_visible(selected):
  match selected:
    case False{}: {==}
    case True{}: {==}
def Laws.body_membership_exact(target, body, selected, ready, rest): {==}
def Laws.membership_empty(id): {==}
def Laws.membership_step(id, head, tail): {==}
def Laws.same_full_identity(p, l, r, o, bp, bl, br, bo): {==}
def Laws.accelerator_scope_without_targets(): {==}
def Laws.courier_scope_without_targets(): {==}
def Laws.no_bodies_no_mark(target, selected, ready, rest): {==}
def Laws.no_marks_no_drawing(rest): {==}
def Laws.every_anchor_is_drawn(head, tail, rest): {==}
def Laws.no_targets_no_anchor_drawing(rest): {==}
def Laws.anchor_visible_at_target(x, y, label, selected, ready, rest): {==}
def Laws.anchor_partition_empty(wanted): {==}
def Laws.anchor_partition_step(head, tail, wanted): {==}
def Laws.anchor_partition_membership(wanted, selected, head, rest):
  match wanted selected:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}
def Laws.anchors_order_chosen_first(items, rest): {==}
def Laws.left_coordinate(x): {==}
def Laws.top_coordinate(y): {==}
def Laws.anchor_selected_field(x, y, label, selected, ready): {==}
def Laws.selected_ready_color(): {==}
def Laws.other_ready_color(): {==}
