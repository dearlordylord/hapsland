import Base
import ../Handoff.bend as Handoff

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
