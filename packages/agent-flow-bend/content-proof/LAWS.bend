import Base
import ./core.bend as Core

# Exact content preservation prevents a vacuous 'safe' implementation that sends
# nothing, drops questions, or substitutes unrelated content.
law projection_exact:
  for +model: String
  for +state: String
  for +questions: String
  for private: Core.Private
  {Core.project(Core.Envelope{Core.Review{model, state, questions}, private}) == Core.Request{model, state, questions} : Core.Request}

# Prompt, transcript, their hashes/derivatives, inspection and attribution may
# all change independently. None is an input to the projected request.
law projection_noninterference:
  for +review: Core.Review
  for left: Core.Private
  for right: Core.Private
  {Core.project(Core.Envelope{review, left}) == Core.project(Core.Envelope{review, right}) : Core.Request}

# This connects projection to the erasure relation used for whole traces.
law projection_erasure:
  for +envelope: Core.Envelope
  {Core.project(envelope) == Core.project(Core.erase_envelope(envelope)) : Core.Request}

# One emitted request is exactly the projection of the stored snapshot, keeping
# all previous emissions. Retry uses this SAME operation, not a second encoder.
law transmission_exact:
  for +envelope: Core.Envelope
  for +private: Core.Private
  for +sent: List<&2, Core.Request>
  {Core.transmit(Some{envelope}, private, sent) == Core.State{Some{envelope}, private, Core.project(envelope) <> sent} : Core.State}

# A cancellation cannot cause the previous source or local private data to be
# used as a fallback request.
law cancellation_has_no_fallback:
  for +state: Core.State
  {Core.step(Core.Send{}, Core.step(Core.Cancel{}, state)) == Core.step(Core.Cancel{}, state) : Core.State}

# Local unwinding obligation, over EVERY state and event, including arbitrary
# pre-existing queues/history. This is the induction step, not a sampled case.
law step_erasure:
  for +event: Core.ContentEvent
  for +state: Core.State
  {Core.erase_state(Core.step(event, state)) == Core.step(Core.erase_event(event), Core.erase_state(state)) : Core.State}

# Arbitrarily long finite histories, including replacement, recovery, retries
# and private updates. The retained pending snapshot is covered as well as sent
# content; an indirect leak through a later send cannot evade the conclusion.
law trace_erasure:
  for +events: List<&2, Core.ContentEvent>
  for +state: Core.State
  {Core.erase_state(Core.run(events, state)) == Core.run(Core.erase_events(events), Core.erase_state(state)) : Core.State}

# A private-only notification cannot alter pending or already sent content.
law private_event_stutters:
  for +state: Core.State
  for private: Core.Private
  {Core.erase_state(Core.step(Core.PrivateChanged{private}, state)) == Core.erase_state(state) : Core.State}

# Any number of private notifications can be inserted, removed or changed.
law trace_private_stuttering:
  for +events: List<&2, Core.ContentEvent>
  for +state: Core.State
  {Core.erase_state(Core.run(events, state)) == Core.run(Core.public_events(events), Core.erase_state(state)) : Core.State}

# Two executions with the same public inputs/control events but completely
# different private values have the same public final state and request history.
# Equal erasure is an INPUT relation; the conclusion is not a premise.
# Public control events must still agree: traffic timing/count is not covered.
law trace_noninterference:
  for +left: List<&2, Core.ContentEvent>
  for +right: List<&2, Core.ContentEvent>
  for +ls: Core.State
  for +rs: Core.State
  for events_equal: {Core.public_events(left) == Core.public_events(right) : List<&2, Core.ContentEvent>}
  for states_equal: {Core.erase_state(ls) == Core.erase_state(rs) : Core.State}
  {Core.erase_state(Core.run(left, ls)) == Core.erase_state(Core.run(right, rs)) : Core.State}
