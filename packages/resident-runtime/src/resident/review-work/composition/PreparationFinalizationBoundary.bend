import Base
import ../../../../../agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend as Owner
import ../../../../../agent-flow-bend/Canonical.bend as Canonical

# Definitions for the whole RenderUnits delivery contract, not a second owner.
# The credential is the actual driver's ownerLease. Resource-table correspondence
# and reachability from launch belong to the composed law, not to this data type.
type Credential is Data:
  Credential{invocation: Nat, generation: Nat, lease: Nat, request: Nat}

def invocation(credential: Credential) -> Nat:
  match credential:
    case Credential{invocation, _, _, _}: invocation

# These are exactly Finalization.Invocation.owner and .command at the actual
# binding. Keep the owner boundary independent of specialized algorithm imports.
def request(credential: Credential) -> Nat:
  match credential:
    case Credential{_, _, _, request}: request

def live(state: Owner.State, credential: Credential) -> Bool:
  match credential:
    case Credential{invocation, generation, lease, request}:
      Owner.provider_live(state, invocation, generation, lease, request)

# A completed RenderUnits response is an intermediate provider reply. Actual
# provider_completed owns whether Resume or cleanup is issued, including late
# completion after a committed cancellation. Do not add a host admission filter.
def complete(state: Owner.State, credential: Credential, reply_handle: Nat) -> Owner.Step:
  match credential:
    case Credential{invocation, _, lease, request}:
      Owner.provider_completed(state, invocation, lease, request, reply_handle)

# Cancellation is invocation control, not a right granted by a stale credential.
def cancel(state: Owner.State, invocation: Nat) -> Owner.Step:
  Owner.cancel(state, invocation)

# Preserve the full transition, including refusal and ordered actions/outputs.
# Empty Advanced actions must not be confused with a rejected transition.
def post_state(step: Owner.Step) -> Owner.State:
  match step:
    case Owner.Advanced{state, _, _}: state
    case Owner.Rejected{state, _}: state

def actions(step: Owner.Step) -> Maybe<&2, List<&2, Owner.Action>>:
  match step:
    case Owner.Advanced{_, _, actions}: Some{actions}
    case Owner.Rejected{_, _}: None{}

def outputs(step: Owner.Step) -> Maybe<&2, List<&2, Canonical.Output>>:
  match step:
    case Owner.Advanced{_, outputs, _}: Some{outputs}
    case Owner.Rejected{_, _}: None{}

def refusal(step: Owner.Step) -> Maybe<&2, Owner.Refusal>:
  match step:
    case Owner.Advanced{_, _, _}: None{}
    case Owner.Rejected{_, reason}: Some{reason}

type Issued is Data:
  Issued{credential: Credential, state_handle: Nat}

# Project a committed ExecuteProvider against its actual post-state. The complete
# composed relation must additionally bind this handle to the driver's saved
# engine Await and resource table, and select this action at its actual position
# in actions(committed_transition). Agreement with state alone does not prove
# that an action was emitted; this projection does not fabricate either fact.
def issued_child(state: Owner.State, found: Maybe<&2, Owner.Child>, +invocation: Nat,
    +lease: Nat, +request: Nat, +handle: Nat) -> Maybe<&2, Issued>:
  match found:
    case Some{Owner.Child{_, _, +generation, actual_handle, _, _, _, _}}:
      Bool.pick(
        Maybe<&2, Issued>,
        Bool.and(
          Nat.is_eq(handle, actual_handle),
          Owner.provider_live(state, invocation, generation, lease, request)
        ),
        Some{Issued{Credential{invocation, generation, lease, request}, handle}},
        None{}
      )
    case None{}: None{}

def issued(+state: Owner.State, action: Owner.Action) -> Maybe<&2, Issued>:
  match action:
    case Owner.ExecuteProvider{+invocation, lease, request, handle}:
      issued_child(
        state,
        Owner.find(invocation, Owner.state_children(state)),
        invocation,
        lease,
        request,
        handle
      )
    case _: None{}

# Observe actual emitted actions. A Resume consumes the saved Preparation state;
# AcceptResult is a later whole-child terminal handoff, never UnitsRendered itself.
def resumes(actions: List<&2, Owner.Action>, +invocation: Nat) -> Nat:
  match actions:
    case []: 0n
    case Owner.Resume{actual, _, _, _} <> tail:
      Nat.add(Bool.pick(Nat, Nat.is_eq(actual, invocation), 1n, 0n), resumes(tail, invocation))
    case _ <> tail: resumes(tail, invocation)

def completion_resumes(step: Owner.Step, invocation: Nat) -> Nat:
  match step:
    case Owner.Advanced{_, _, actions}: resumes(actions, invocation)
    case Owner.Rejected{_, _}: 0n

def cleanups(actions: List<&2, Owner.Action>, +invocation: Nat, +lease: Nat) -> Nat:
  match actions:
    case []: 0n
    case Owner.CleanupProvider{actual, held} <> tail:
      Nat.add(
        Bool.pick(Nat, Bool.and(Nat.is_eq(actual, invocation), Nat.is_eq(held, lease)), 1n, 0n),
        cleanups(tail, invocation, lease)
      )
    case _ <> tail: cleanups(tail, invocation, lease)

def completion_cleanups(step: Owner.Step, credential: Credential) -> Nat:
  match step credential:
    case Owner.Advanced{_, _, actions} Credential{invocation, _, lease, _}:
      cleanups(actions, invocation, lease)
    case Owner.Rejected{_, _} _: 0n
