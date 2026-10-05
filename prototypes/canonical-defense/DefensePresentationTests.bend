# Actual game Host regressions for the five owner-reported presentation cases.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefensePresentation.bend as Display
import ./DefenseHistory.bend as R
import ./DefenseTestSupport.bend as Tests
import ./DefenseConsumer.bend as Consumer
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/SubmissionState.bend as Submission
import ../../packages/agent-flow-bend/Handoff.bend as Handoff
import ../../packages/agent-flow-bend/Delivery.bend as Delivery
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def actor_value(found: Maybe<&2,V.Actor>) -> V.Actor:
  match found:
    case Some{actor}: actor
    case _: Tests.single([])
def actor(world: M.World,id: Nat) -> V.Actor:
  actor_value(Tests.find(V.WorkIdentity{1n,1n,1n,id},M.actors(world)))
def no_ghost(+world: M.World,parent: Nat,+child: Nat) -> Bool:
  Bool.not(Motion.contains(V.WorkIdentity{1n,1n,1n,parent},M.actors(world))) &&
    Motion.released(actor(world,child)) &&
    Nat.is_eq(List.length(&2,V.WorkIdentity,Display.parent(actor(world,child))),1n)
def submitted_pair(+world: M.World) -> Bool:
  U32.is_eq(Motion.outcome(actor(world,3n)),10) && U32.is_eq(Motion.outcome(actor(world,4n)),10)
def long_wait_explained(+world: M.World) -> Bool:
  +a = actor(world,3n)
  +b = actor(world,4n)
  U32.is_eq(Motion.wait_kind(a,M.actors(world)),3) && U32.is_eq(Motion.wait_kind(b,M.actors(world)),2) &&
    String.eq(R.wait_text(3,a,M.actors(world)),"RETAINED RECORD / SENT") &&
    String.eq(R.wait_text(2,b,M.actors(world)),"VISUAL QUEUE 1/1/1/3")
def checks(+early: M.World,+source_handoff: M.World,+prep_handoff: M.World,+clear: M.World,+sent: M.World,+stored: M.World) -> IO(Unit):
  +first = actor(early,1n)
  +batch: List<&2,Submission.Batch> = [Submission.Batch{3n,1n,1n,99n,Handoff.Stop{},Delivery.Submitted{},[],[3n]}]
  do IO<Unit>:
    Tests.require((Motion.terminal(first) > 0 : U32) && Bool.not(Motion.empty(Motion.path(first))) && U32.is_eq(R.body_color(first),R.phase_color(Motion.visible_phase(first))),"case 1 actual completed business keeps visible-stage colour during first-road playback")
    Tests.require(String.eq(R.fork_text_for(actor(source_handoff,2n),M.actors(source_handoff)),"PREP UNITS IN PLAYBACK 2"),"case 5 preparation inspection counts its own admitted units rather than its source parent")
    Tests.require(no_ghost(source_handoff,1n,2n),"case 2 source predecessor vanishes at handoff while its child retains causal identity")
    Tests.require(no_ghost(prep_handoff,2n,3n),"case 2 preparation predecessor vanishes without a lingering duplicate body")
    Tests.require(U32.is_eq(Motion.outcome(actor(clear,3n)),2) && U32.is_eq(Motion.outcome(actor(clear,4n)),2) && Nat.is_eq(List.length(&2,C.Work,M.work(M.core(clear))),0n),"case 3 explicitly forced Clear produces two clear histories and no invented advice")
    Tests.require(submitted_pair(sent),"case 4 default Finding reaches accepted actual submission is recorded before retained-room visual travel finishes")
    Tests.require(long_wait_explained(stored),"case 4 storage and a queue behind its full-identity leader have different explicit reasons")
    Tests.require(Nat.is_eq(List.length(&2,V.Actor,M.actors(prep_handoff)),2n) && Motion.same(Motion.actor_key(actor(prep_handoff,3n)),V.WorkIdentity{1n,1n,1n,3n}) && Motion.same(Motion.actor_key(actor(prep_handoff,4n)),V.WorkIdentity{1n,1n,1n,4n}),"case 5 only the two actually admitted review units survive preparation")
    Tests.require(String.eq(R.fork_text_for(actor(prep_handoff,3n),M.actors(prep_handoff)),"PREP UNITS IN PLAYBACK 2"),"case 5 inspection counts actual admitted child histories rather than assuming a fixed fork")
    Tests.require(String.eq(R.predecessor_text(Display.parent(actor(prep_handoff,3n))),"1/1/1/2") && String.eq(R.predecessor_text(Display.parent(actor(prep_handoff,4n))),"1/1/1/2"),"case 5 both moving children preserve their complete preparation identity")
    Tests.require(Motion.submission_matches(V.WorkIdentity{1n,1n,1n,3n},3n,99n,batch) && Bool.not(Motion.submission_matches(V.WorkIdentity{2n,1n,1n,3n},3n,99n,batch)) && Bool.not(Motion.submission_matches(V.WorkIdentity{1n,1n,2n,3n},3n,99n,batch)),"submission evidence respects its actual partition and round rather than operation number alone")

def world_value(worlds: List<&2,M.World>) -> M.World:
  match worlds:
    case world <> _: world
    case _: H.initial()
def main() -> IO(Unit):
  +early: List<&2,M.World> = Tests.run_boxed(40n,[H.start(H.initial_config(Tests.forced_config(Consumer.config()),152n))])
  +source: List<&2,M.World> = Tests.run_boxed(113n,early)
  +clear: List<&2,M.World> = Tests.run_boxed(47n,source)
  +prep: List<&2,M.World> = Tests.run_boxed(85n,clear)
  +sent: List<&2,M.World> = Tests.run_boxed(240n,[H.start(H.initial_config(Consumer.config(),152n))])
  +stored: List<&2,M.World> = Tests.run_boxed(760n,sent)
  checks(world_value(early),world_value(source),world_value(prep),world_value(clear),world_value(sent),world_value(stored))
