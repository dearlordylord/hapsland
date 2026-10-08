import Base
import ./CollectionScenario.bend as Response
import ./Advicees.bend as Advicees
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical

# Candidate #176/#192 laws; source-only, not accepted or mechanically checked.
# Premises concern the actual original owner and representation, not fixtures.
# This observation only inspects production outputs; it never authorizes work.
def contains_proceed(outputs: List<&2, Canonical.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case Canonical.PolicyDecided{Canonical.CollectorProceed{}} <> _: True{}
    case _ <> tail: contains_proceed(tail)

def step_proceeds(result: Canonical.Step) -> Bool:
  match result:
    case Canonical.Advanced{_, outputs}: contains_proceed(outputs)
    case _: False{}

law expired_original_never_proceeds:
  for canonical: Canonical.State
  for p: Nat
  for l: Nat
  for r: Nat
  for started: Nat
  for +deadline: Nat
  for admitted: Bool
  for +now: Nat
  for credential: Bool
  for expired: {Nat.is_ge(now, deadline) == True{} : Bool}
  {
    step_proceeds(
      Canonical.step(
        canonical,
        Response.gate(Response.Response{p, l, r, started, deadline, admitted}, now, credential)
      )
    )
    == False{}
    : Bool
  }

# An arbitrary set of healthy overlapping peers has no occurrence of this exact
# target. Closing the original removes it, preserves every peer and route scope,
# and releases precisely its one provisional lease (no physical output lease).
law close_preserves_overlapping_peers:
  for +next: Nat
  for +target: Response.Identity
  for response: Response.Response
  for credential: Nat
  for phase: Response.Phase
  for +advice: Nat
  for +token: Nat
  for +peers: List<&2, Response.Context>
  for +controlled: List<&2, Response.Scope>
  for distinct: {Response.lookup(peers, target) == None{} : Maybe<&2, Response.Context>}
  {
    Response.close(
      Response.State{
        next,
        Response.Context{
          target,
          response,
          credential,
          phase,
          [Response.Selection{advice, token}]
        } <> peers,
        controlled
      },
      target
    )
    == Response.Change{
      Response.State{next, peers, controlled},
      Response.Applied{},
      None{},
      [Driver.Action{Canonical.CollectionReleaseLease{advice, token}, 0n, None{}, False{}, None{}}]
    }
    : Response.Change
  }

# Existing logical-list transport bound; not collector capacity or eligibility.
law full_context_representation_refuses_without_minting:
  for +next: Nat
  for +contexts: List<&2, Response.Context>
  for +controlled: List<&2, Response.Scope>
  for response: Response.Response
  for credential: Nat
  for canonical: Canonical.State
  for full: {Nat.is_ge(List.length(&2, Response.Context, contexts), 2048n) == True{} : Bool}
  {
    Response.issue(Response.State{next, contexts, controlled}, response, credential, canonical)
    == Response.Change{
      Response.State{next, contexts, controlled},
      Response.ContextBound{},
      None{},
      []
    }
    : Response.Change
  }

# Allocation at the u48 endpoint refuses atomically; it never wraps into an old
# response identity. Room distinguishes this reason from representation refusal.
law exhausted_identity_refuses_without_state_change:
  for +contexts: List<&2, Response.Context>
  for +controlled: List<&2, Response.Scope>
  for response: Response.Response
  for credential: Nat
  for canonical: Canonical.State
  for room: {Nat.is_lt(List.length(&2, Response.Context, contexts), 2048n) == True{} : Bool}
  {
    Response.issue(
      Response.State{Advicees.maximum(), contexts, controlled},
      response,
      credential,
      canonical
    )
    == Response.Change{
      Response.State{Advicees.maximum(), contexts, controlled},
      Response.IdentityExhausted{},
      None{},
      []
    }
    : Response.Change
  }
