import Base
import ../Handoff.bend as Handoff
import ../CollectionHandoff.bend as Root
import ../../Collection.bend as Collection

# Type-valid negative implementations. These must fail the independent trace
# checkers; no production module imports this verification owner.
def skip_barrier(+step: Handoff.PStep) -> Handoff.PStep:
  match step:
    case Handoff.PAwait{_, _, Handoff.PResponseBarriered{_}, Handoff.PRequest{+owner, +id, _}}:
      Handoff.prepare_resume(step, Handoff.PReply{owner, id, Handoff.PAck{}})
    case _: step

def prepare_without_barrier(+step: Handoff.PStep, +reply: Handoff.PReply) -> Handoff.PStep:
  skip_barrier(Handoff.prepare_resume(step, reply))

def skip_write(+step: Handoff.DStep) -> Handoff.DStep:
  match step:
    case Handoff.DAwait{_, _, Handoff.DWritability{}, _}: Handoff.DDone{False{}}
    case _: step

def finalize_without_write(+step: Handoff.DStep, +reply: Handoff.DReply) -> Handoff.DStep:
  skip_write(Handoff.delivery_finalize_resume(step, reply))

def skip_final_barrier(+step: Collection.Step) -> Collection.Step:
  match step:
    case Collection.Await{Collection.State{_, _, Collection.BarrierPassed{
      Collection.Selection{+token, Collection.Pass{True{}, +remaining, _, _}}, +advice
    }}, _}: Collection.Selected{token, advice <> remaining}
    case _: step

def selection_without_second_pass(
  +step: Collection.Step,
  +reply: Collection.Reply
) -> Collection.Step:
  skip_final_barrier(Collection.resume(step, reply))

def root_without_cutoff_atomic(+step: Root.RootStep) -> Bool:
  match step:
    case Root.RootAwait{_, _, Root.RootGating{
      Handoff.GAwait{_, _, Handoff.GGateRead{_}, _}, _, _, _
    }, _}: False{}
    case _: Root.atomic(step)
