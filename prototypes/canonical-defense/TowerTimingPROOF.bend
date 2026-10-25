import ./TowerTimingLAWS.bend as Laws
import ../../packages/monkey-business-bend/Callbacks.bend as CB

def Laws.intervention_time(world): {==}
def Laws.timed_transport(target, captured, action, completion, old, fresh, at): {==}
def Laws.invalid_time_no_change(original, at, fresh): {==}
def Laws.reschedule_time_guard(original, at, now, fresh):
  match original:
    case CB.Original{CB.Fact{target, captured, action, completion}, CB.Queued{}, order}: {==}
    case CB.Original{CB.Fact{target, captured, action, completion}, CB.Held{}, order}: {==}
    case CB.Original{CB.Fact{target, captured, action, completion}, CB.Dropped{}, order}: {==}
def Laws.upgrade_keeps_armed_deadline(x, y, kind, level, power, radius, ready): {==}
def Laws.preview_remaining_time(target, world): {==}
def Laws.quoted_upgrade_range(tower): {==}
def Laws.quoted_upgrade_cadence(tower): {==}
def Laws.finisher_prefers_short(at, other): {==}
def Laws.accelerator_prefers_long(at, other): {==}
def Laws.exhausted_volley_stops(items, world, tower, wanted): {==}
def Laws.empty_volley_is_inert(world, index, tower): {==}
def Laws.pulse_cadence(): {==}
def Laws.pulse_budget(): {==}
