import Base
import ../CollectionHandoff.bend as Root
import ../Handoff.bend as Handoff
import ./DeliveryTrace.bend as Trace

# Mechanical observations of shipped entry/resume functions. Business equations
# belong to independent specifications; these evaluators never decide an effect.

def root_prepend(+request: Trace.RootEvent, +trace: Trace.RootTrace) -> Trace.RootTrace:
  match trace:
    case Trace.RootTrace{+requests, +remaining, +final}:
      Trace.RootTrace{request <> requests, remaining, final}

def run_root(+replies: List<&2, Root.RootReply>, +step: Root.RootStep) -> Trace.RootTrace:
  match replies step:
    case Nil{} _: Trace.RootTrace{[], [], step}
    case +reply <> +rest Root.RootAwait{_, _, _, +request}:
      root_prepend(
        Trace.RootEvent{request, Root.atomic(step)},
        run_root(rest, Root.resume(step, reply))
      )
    case _ _: Trace.RootTrace{[], replies, step}

def prepare_prepend(+request: Handoff.PRequest, +trace: Trace.PrepareTrace) -> Trace.PrepareTrace:
  match trace:
    case Trace.PrepareTrace{+requests, +remaining, +final}:
      Trace.PrepareTrace{request <> requests, remaining, final}

def run_prepare(+replies: List<&2, Handoff.PReply>, +step: Handoff.PStep) -> Trace.PrepareTrace:
  match replies step:
    case Nil{} _: Trace.PrepareTrace{[], [], step}
    case +reply <> +rest Handoff.PAwait{_, _, _, +request}:
      prepare_prepend(request, run_prepare(rest, Handoff.prepare_resume(step, reply)))
    case _ _: Trace.PrepareTrace{[], replies, step}

def finalize_prepend(
  +request: Handoff.DRequest,
  +trace: Trace.FinalizeTrace
) -> Trace.FinalizeTrace:
  match trace:
    case Trace.FinalizeTrace{+requests, +remaining, +final}:
      Trace.FinalizeTrace{request <> requests, remaining, final}

def run_finalize(+replies: List<&2, Handoff.DReply>, +step: Handoff.DStep) -> Trace.FinalizeTrace:
  match replies step:
    case Nil{} _: Trace.FinalizeTrace{[], [], step}
    case +reply <> +rest Handoff.DAwait{_, _, _, +request}:
      finalize_prepend(request, run_finalize(rest, Handoff.delivery_finalize_resume(step, reply)))
    case _ _: Trace.FinalizeTrace{[], replies, step}

def commit_prepend(+request: Handoff.KRequest, +trace: Trace.CommitTrace) -> Trace.CommitTrace:
  match trace:
    case Trace.CommitTrace{+requests, +remaining, +final}:
      Trace.CommitTrace{request <> requests, remaining, final}

def run_commit(+replies: List<&2, Handoff.KReply>, +step: Handoff.KStep) -> Trace.CommitTrace:
  match replies step:
    case Nil{} _: Trace.CommitTrace{[], [], step}
    case +reply <> +rest Handoff.KAwait{_, _, _, +request}:
      commit_prepend(request, run_commit(rest, Handoff.prepare_commit_resume(step, reply)))
    case _ _: Trace.CommitTrace{[], replies, step}
