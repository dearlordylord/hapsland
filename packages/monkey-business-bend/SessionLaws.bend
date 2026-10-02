# Proposed, unapproved laws. Do not import this file in runnable consumers.
import Base
import ./Session.bend as S

# Suspension emits nothing and preserves the input stream exactly.
law suspended_next:
  for config: S.Config
  for +state: S.State
  {S.next(config, S.set_suspended(state, True{})) == S.Changed{S.set_suspended(state, True{}), []} : S.Transition}

# A nonrecurring burst cannot invalidate the existing recurring generation.
law burst_generation:
  for +state: S.State
  for count: Nat
  {S.state_generation(S.transition_state(S.burst(count, state))) == S.state_generation(state) : Nat}

# Burst revisions advance once per emitted edit, preserving exact count.
law burst_revision:
  for +state: S.State
  for +count: Nat
  {S.state_revision(S.transition_state(S.burst(count, state))) == (S.state_revision(state) + count : Nat) : Nat}
