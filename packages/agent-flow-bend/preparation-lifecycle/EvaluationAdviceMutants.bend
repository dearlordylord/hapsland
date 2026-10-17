import Base
import ./CanonicalResolverOwner.bend as O

# Typed negative witness: linking a committed advice tail to its Evaluation
# parent lets parent cancellation revoke transferred work. Never production.
# Maintain with handoff birth; delete when that entry contract is replaced.
def linked_parent(found: Maybe<&2, O.Child>) -> Maybe<&2, O.Parent>:
  match found:
    case Some{O.Child{_, invocation, generation, _, _, Some{request}, _, _}}:
      Some{O.Parent{invocation, generation, request}}
    case _: Some{O.Parent{0n, 0n, 0n}}

def parent_linked_birth(valid: Bool, state: O.State, p: Nat, l: Nat, r: Nat,
  +origin: Nat, +operation: Nat, input: Nat) -> O.Step:
  match valid state:
    case True{} O.State{canonical, +next, lease, +rest}:
      O.Advanced{
        O.State{canonical, Nat.add(next, 1n), lease,
          O.Child{O.AdviceTailScope{p, l, r, operation, origin, O.TailNew{}},
            next, 0n, 0n, O.ChildInstalling{}, None{}, None{},
            linked_parent(O.find(origin, rest))} <> rest},
        Nil{}, [O.LaunchAdviceTail{next, origin, operation, input}]}
    case _ _: O.Rejected{state, O.WrongPhase{}}

def main() -> Unit:
  Unit{}
