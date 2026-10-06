import Base
import ./LAWS.bend as Laws
import ./core.bend as Core

# ---- projection_exact ----
def Laws.projection_exact(model, state, questions, private):
  {==}

# ---- projection_noninterference ----
def Laws.projection_noninterference(review, left, right):
  match review:
    case Core.Review{_, _, _}: {==}

# ---- projection_erasure ----
def Laws.projection_erasure(envelope):
  match envelope:
    case Core.Envelope{Core.Review{_, _, _}, _}: {==}

# ---- transmission_exact ----
def Laws.transmission_exact(envelope, private, sent):
  {==}

# ---- cancellation_has_no_fallback ----
def Laws.cancellation_has_no_fallback(state):
  match state:
    case Core.State{_, _, _}: {==}

# ---- shared ----
def transmission_erasure(+pending: Maybe<&2, Core.Envelope>, +private: Core.Private, +sent: List<&2, Core.Request>) ->
    {Core.erase_state(Core.transmit(pending, private, sent)) == Core.transmit(Core.erase_pending(pending), Core.empty_private(), sent) : Core.State}:
  match pending:
    case None{}: {==}
    case Some{envelope}:
      %Laws.projection_erasure(envelope) : {Core.State{Some{Core.erase_envelope(envelope)}, Core.empty_private(), Core.project(envelope) <> sent} == Core.State{Some{Core.erase_envelope(envelope)}, Core.empty_private(), _ <> sent} : Core.State}
      {==}

# ---- step_erasure ----
def Laws.step_erasure(event, state):
  match event state:
    case Core.Stage{_} Core.State{_, _, _}: {==}
    case Core.Recover{_} Core.State{_, _, _}: {==}
    case Core.PrivateChanged{_} Core.State{_, _, _}: {==}
    case Core.Send{} Core.State{pending, private, sent}: transmission_erasure(pending, private, sent)
    case Core.Retry{} Core.State{pending, private, sent}: transmission_erasure(pending, private, sent)
    case Core.Cancel{} Core.State{_, _, _}: {==}

# ---- trace_erasure ----
def Laws.trace_erasure(events, state):
  match events:
    case Nil{}: {==}
    case event <> rest:
      %Laws.step_erasure(event, state) : {Core.erase_state(Core.run(rest, Core.step(event, state))) == Core.run(Core.erase_events(rest), _) : Core.State}
      Laws.trace_erasure(rest, Core.step(event, state))

# ---- private_event_stutters ----
def Laws.private_event_stutters(state, private):
  match state:
    case Core.State{_, _, _}: {==}

# ---- trace_private_stuttering ----
def Laws.trace_private_stuttering(events, state):
  match events:
    case Nil{}: {==}
    case Core.PrivateChanged{private} <> rest:
      %Laws.private_event_stutters(state, private) : {Core.erase_state(Core.run(rest, Core.step(Core.PrivateChanged{private}, state))) == Core.run(Core.public_events(rest), _) : Core.State}
      Laws.trace_private_stuttering(rest, Core.step(Core.PrivateChanged{private}, state))
    case Core.Stage{envelope} <> rest:
      %Laws.step_erasure(Core.Stage{envelope}, state) : {Core.erase_state(Core.run(rest, Core.step(Core.Stage{envelope}, state))) == Core.run(Core.public_events(rest), _) : Core.State}
      Laws.trace_private_stuttering(rest, Core.step(Core.Stage{envelope}, state))
    case Core.Recover{envelope} <> rest:
      %Laws.step_erasure(Core.Recover{envelope}, state) : {Core.erase_state(Core.run(rest, Core.step(Core.Recover{envelope}, state))) == Core.run(Core.public_events(rest), _) : Core.State}
      Laws.trace_private_stuttering(rest, Core.step(Core.Recover{envelope}, state))
    case Core.Send{} <> rest:
      %Laws.step_erasure(Core.Send{}, state) : {Core.erase_state(Core.run(rest, Core.step(Core.Send{}, state))) == Core.run(Core.public_events(rest), _) : Core.State}
      Laws.trace_private_stuttering(rest, Core.step(Core.Send{}, state))
    case Core.Retry{} <> rest:
      %Laws.step_erasure(Core.Retry{}, state) : {Core.erase_state(Core.run(rest, Core.step(Core.Retry{}, state))) == Core.run(Core.public_events(rest), _) : Core.State}
      Laws.trace_private_stuttering(rest, Core.step(Core.Retry{}, state))
    case Core.Cancel{} <> rest:
      %Laws.step_erasure(Core.Cancel{}, state) : {Core.erase_state(Core.run(rest, Core.step(Core.Cancel{}, state))) == Core.run(Core.public_events(rest), _) : Core.State}
      Laws.trace_private_stuttering(rest, Core.step(Core.Cancel{}, state))

# ---- trace_noninterference ----
def Laws.trace_noninterference(left, right, ls, rs, events_equal, states_equal):
  %Equal.sym(Core.State, Core.erase_state(Core.run(left, ls)), Core.run(Core.public_events(left), Core.erase_state(ls)), Laws.trace_private_stuttering(left, ls)) : {_ == Core.erase_state(Core.run(right, rs)) : Core.State}
  %Equal.sym(Core.State, Core.erase_state(Core.run(right, rs)), Core.run(Core.public_events(right), Core.erase_state(rs)), Laws.trace_private_stuttering(right, rs)) : {Core.run(Core.public_events(left), Core.erase_state(ls)) == _ : Core.State}
  %events_equal : {Core.run(Core.public_events(left), Core.erase_state(ls)) == Core.run(_, Core.erase_state(rs)) : Core.State}
  %states_equal : {Core.run(Core.public_events(left), Core.erase_state(ls)) == Core.run(Core.public_events(left), _) : Core.State}
  {==}
