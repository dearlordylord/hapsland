# Approved preview boundary laws.
import Base
import ./PreviewChoiceLAWS.bend as Laws

def Laws.preview_automatic_target(world, tower): {==}
def Laws.cooldown_has_no_instant_target(world, tower): {==}
def Laws.exact_callback_choice(target, other): {==}
def Laws.no_choice_without_callback(target): {==}
def Laws.key_scope(p, l, r, o): {==}
def Laws.finish_capture(owner, group, round, attempt, token, ids, order, selected): {==}
def Laws.jev_capture(owner, request, order, selected): {==}
def Laws.preparation_capture(owner, order, selected): {==}
def Laws.output_capture(owner, advice, token, order, selected): {==}
