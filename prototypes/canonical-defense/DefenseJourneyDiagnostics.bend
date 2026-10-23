# Actual Host journeys and captured capacity decisions; test observation only.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotion.bend as Motion
import ./DefenseRouteQueue.bend as Queue
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ./DefenseHistory.bend as History
import ./DefenseProjection.bend as P
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

import ../../packages/monkey-business-bend/OutputScenario.bend as Output
import ../../packages/agent-flow-bend/CollectionState.bend as Collection
import ../../packages/agent-flow-bend/Handoff.bend as Handoff

def start(burst: U32) -> M.World:
  H.key(
    H.key(
      M.with_control(
        H.initial(),
        M.with_settings(M.control(H.initial()), M.with_burst(M.settings(H.initial()), burst))
      ),
      110
    ),
    97
  )
def observe(world: M.World) -> H.TickObserved: H.tick_observed(world)
def tick(world: M.World) -> M.World: H.tick(world)
def actors(world: M.World) -> List<&2, V.Actor>: M.actors(world)
def works(world: M.World) -> List<&2, C.ReviewWorkRecord>: M.work(M.core(world))
def bytes(world: M.World) -> U32: P.ledger_bytes(world)
def time(world: M.World) -> U32: M.time(world)
def cues(world: M.World) -> List<&2, M.Cue>: M.cues(world)
def fits(states: List<&2, C.State>, partition: Nat, bytes: Nat) -> Bool:
  match states:
    case C.State{ledger, _, _, _, _, _, _, _, _} <> _: Ledger.decision_fits(
      Ledger.admission(ledger, partition, bytes)
    )
    case _: False{}
def maze(layout: U32) -> List<&2, Map.Point>: Map.room_route(layout, 1, 0)
def track(actor: V.Actor) -> Queue.Track: Queue.track(actor)
def blocked(
  actor: V.Actor,
  others: List<&2, V.Actor>
) -> Bool: Bool.not(Motion.can_play(actor, others))
def ordinary(active: Bool, actor: V.Actor) -> V.Actor: Motion.ordinary_step(active, actor)
def step(actors: List<&2, V.Actor>) -> List<&2, V.Actor>: Motion.step(actors)
def refuse_label() -> String: History.terminal_name(5)

def core(world: M.World) -> C.State: M.core(world)

def uncertain(world: M.World) -> M.World:
  H.action(world, T.OutputProfileControl{Output.Uncertain{}, 800n, 12000n})
def release(world: M.World) -> M.World: H.key(world, 110)
def stop(world: M.World) -> M.World: H.key(world, 115)
def retirement(state: C.State, p: Nat, l: Nat, r: Nat, o: Nat) -> C.Step:
  C.step(state, C.RetireReview{p, l, r, o})
def duplicate(state: C.State, advice: Nat, token: Nat) -> C.Step:
  C.step(state, C.SubmissionTerminal{advice, token, True{}})
def suppressed(state: C.State, +advice: Nat, round: Nat) -> Bool:
  match state:
    case C.State{_, _, _, _, _, _, _, collection, _}:
      Collection.submission_suppresses(collection, advice, advice, round, Handoff.Stop{})
