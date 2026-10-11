import Base
import ../../../../../agent-flow-bend/ImportGraph.bend as G
import ../Types.bend as T
import ../Environment.bend as E
import ../ExpansionSpecification.bend as X
import ../ExpansionDriverSpecification.bend as D
import ../ForestAllowance.bend as Allowance

# Fixed reference attachment boundary, not a provider or an application callback.
# It starts after the previous product measurement. File/bundle ordering before
# this point remains owned by the full driver. No graph policy is parameterized.
def attached(+state: D.State, +transaction: X.Transaction) -> D.Selection:
  match transaction:
    case X.MeasureAfter{X.Frame{_, _, +forest, _, _, _, _, _, _, _, _}, _, _}:
      D.transaction_selection(state, X.choose(Allowance.materialization(forest), transaction))
    case _:
      D.transaction_selection(state, X.Continue{transaction})

def enter(+state: D.State, child: X.Child, previous: Nat) -> D.Selection:
  attached(state, X.attach(D.frame(state), child, previous))

# This is the actual transaction row and provider-failure priority of D.consume.
# Other driver stages are deliberately not interpreted by this boundary adapter.
def consume_reusable(+state: D.State, +outcome: T.ServiceOutcome) -> D.Selection:
  match state outcome:
    case _ T.ProviderRejected{exception}:
      D.Rejected{state, T.ForeignProviderFailure{exception}}
    case D.State{_, _, _, _, _, _, _, D.Transaction{transaction}} _:
      D.transaction_selection(state, X.Continue{X.consume(transaction, outcome)})
    case _ _:
      D.Rejected{state, T.WrongReplyKind{}}

def consume(state: D.State, outcome: T.ServiceOutcome) -> D.Selection:
  consume_reusable(state, outcome)

# Request allocation exactly matches D.issue without invoking E.step/respond.
# Caller supplies the already selected operation, never an expected query script.
# This projection does not increment the counter; allocation below does it once.
def selected_request(selection: D.Selection) -> Maybe<&2, T.Request>:
  match selection:
    case D.Selected{D.State{config, _, _, _, _, next, _, _}, operation}:
      Some{T.Request{D.invocation(config), next, operation}}
    case _: None{}

# Transport of an arbitrary completed reply through the independent protocol
# validator. No correctness premise on owner, correlation, kind or bytes exists.
# The supplied world is already the post-provider world; this pure adapter does
# not manufacture Invoked/Responded effects or allocate a suspension lease.
def deliver(-World: Data, +selection: D.Selection, reply: T.Reply,
    world: E.WorldState<World>) -> D.Progress<World>:
  match selection:
    case D.Selected{
      D.State{+config, frame, targets, ids, target, +next, iterations, stage},
      operation
    }:
      D.delivered(
        consume,
        World,
        T.Request{D.invocation(config), next, operation},
        D.State{config, frame, targets, ids, target, (next + 1n : Nat), iterations, stage},
        reply,
        world
      )
    case _:
      D.consumed(World, selection, world)

# One explicit pure driver transition. Callers retaining cancellation stutters
# can observe each intermediate Selection instead of using next_boundary.
# Completion allowance counts all retained nodes, including detached children.
# Its adequacy is a reachable-forest obligation, not assumed by this adapter;
# exhaustion and invalid materialization remain explicit driver outcomes.
def completion_frame(+state: D.State, frame: X.Frame,
    partial: Maybe<&2, G.Reason>) -> D.Selection:
  match frame:
    case X.Frame{_, _, forest, _, _, _, _, _, _, _, _}:
      D.completion(Allowance.materialization(forest), state, partial)

def boundary_step(+selection: D.Selection) -> D.Selection:
  match selection:
    case D.Internal{
      D.State{+config, +frame, +targets, +ids, +target, +next, +iterations, D.AfterCommand{+skip}}
    }:
      D.after_command(
        D.State{config, frame, targets, ids, target, next, iterations, D.AfterCommand{skip}},
        frame,
        skip
      )
    case D.Internal{
      D.State{+config, +frame, +targets, +ids, +target, +next, +iterations, D.Iteration{}}
    }:
      D.iteration(D.State{config, frame, targets, ids, target, next, iterations, D.Iteration{}})
    case D.Internal{D.State{
      +config, +frame, +targets, +ids, +target, +next, +iterations, D.Completion{+partial}
    }}:
      completion_frame(
        D.State{config, frame, targets, ids, target, next, iterations, D.Completion{partial}},
        frame,
        partial
      )
    case _: selection

# Exactly the two pure transitions after attachment admission. This does not
# interpret Command, apply Graph.Next, invoke a provider, or consume a reply.
# Selected requests remain unallocated, as in D.choose; selected_request names
# their current counter and deliver allocates it exactly once. Earlier path
# stutters and runtime cancellation interleavings are not erased by a law here.
def next_boundary(selection: D.Selection) -> D.Selection:
  boundary_step(boundary_step(selection))

def normalize_progress(-World: Data, progress: D.Progress<World>) -> D.Progress<World>:
  match progress:
    case D.DriverReady{state, world}:
      D.consumed(World, next_boundary(D.Internal{state}), world)
    case _: progress

# Convenience composition leaves deliver and boundary_step independently
# available for a small-step cancellation relation. No World/effects change.
def deliver_next(-World: Data, selection: D.Selection, reply: T.Reply,
    world: E.WorldState<World>) -> D.Progress<World>:
  normalize_progress(World, deliver(World, selection, reply, world))

def main() -> Unit:
  Unit{}
