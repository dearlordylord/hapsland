# Bounded executable hover checks; no product state is mutated by the preview.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefensePreview.bend as P
import ./DefenseEffects.bend as E
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit, 1, "FAIL " ++ message)

def hovered(world: M.World, x: U32, y: U32, kind: U32) -> M.World:
  match world:
    case M.World{core, t, _, l, _, g, h, ts, ms, a, o, r, cl, d, out, auto, _, _, _, damage, flash}:
      M.World{core, t, True{}, l, kind, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, 0, damage, flash}

def active_source() -> M.World:
  +world = H.initial()
  +core = H.event(M.core(world), C.AdmitObservation{1n, 1n, 1n})
  +core = H.event(core, C.QueueDispatch{1n, 1n, 1n, 1n})
  +core = H.event(core, C.StartObservation{1n, 1n, 1n, 1n})
  M.with_effects(M.with_core(world, core), Nil{}, [M.Timer{1n, 1, 10, 1n, 100, 1, 0}])
def refiner_hover() -> M.World:
  +point = Map.center(0, 1, 0)
  hovered(active_source(), (Map.px(point) + 60 : U32), Map.py(point), 1)
def actual_risk_after(+world: M.World) -> U32:
  +shot = E.shoot(world, M.Tower{M.mouse_x(world), M.mouse_y(world), 1, 1, 0, 0, 0n, 240})
  M.timer_risk(E.find_timer(1n, E.shot_timers(shot)))

def hover_cost() -> IO(Unit):
  +world = hovered(H.initial(), 60, 300, 0)
  +preview = P.calculate(world)
  require(U32.is_eq(P.cost(preview), H.tower_cost(M.choice(world))) && U32.is_eq(P.range(preview), H.tower_range(M.choice(world), 1)), "hover uses actual host cost and level-one radius")
def hover_pause() -> IO(Unit):
  +world = hovered(H.initial(), 60, 300, 0)
  require(U32.is_eq(M.gold(world), M.gold(H.tick(world))) && U32.is_eq(M.time(world), M.time(H.tick(world))), "paused hover does not spend gold or advance host clock")
def hover_risk() -> IO(Unit):
  +world = refiner_hover()
  +preview = P.calculate(world)
  require(Nat.is_eq(P.target(preview), 1n) && U32.is_eq(P.before(preview), 100) && U32.is_eq(P.after(preview), actual_risk_after(world)), "hover risk delta matches exact next actual Refiner shot")

def main() -> IO(Unit):
  do IO<Unit>:
    require(U32.is_eq(P.classify(0, True{}, True{}, 255, 0), 4), "structural absence differs from temporary inactivity")
    require(U32.is_eq(P.classify(0, True{}, True{}, 4, 0), 5), "eligible site without current marginal effect is amber")
    require(U32.is_eq(P.classify(0, True{}, True{}, 4, 10), 1), "positive current marginal effect is effective")
    require(U32.is_eq(P.classify(0, False{}, True{}, 4, 10), 2), "invalid placement takes priority over effect")
    require(U32.is_eq(P.classify(0, True{}, False{}, 4, 10), 3), "unfunded placement takes priority over effect")
    require(U32.is_eq(P.classify(1, True{}, True{}, 4, 10), 0), "selected tower inspection suppresses build preview")
    require(U32.is_eq(P.after(P.Preview{1, 1, 0, 0, 1n, 4, 100, 15, 120, 50, 0, 0}), 85), "risk preview is permanent reduction in percentage points")
    require(U32.is_eq(P.after(P.Preview{1, 3, 0, 0, 0n, 4, 2, 1, 120, 50, 0, 0}), 3), "parallelizer preview adds host service slots")
    require(U32.is_eq(P.after(P.Preview{1, 6, 0, 0, 0n, 4, 1, 2, 120, 50, 0, 0}), 0), "pressure protection preview saturates at zero")
    hover_cost()
    hover_pause()
    hover_risk()
    IO.print("PASS preview classification and read-only snapshot checks complete")
