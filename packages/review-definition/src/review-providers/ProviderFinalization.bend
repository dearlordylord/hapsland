import Base
import ../../../runtime-environment/src/runtime/backend/Backend.bend as Backend
import ../../../runtime-inputs/src/configuration/review-backend/ReviewBackend.bend as Configuration
import ./ProviderIdentity.bend as Provider

type State is Data:
  State{invocation: Nat, request: Nat, provider: Provider.Step}
type Step is Data:
  Continue{state: State}
  EncodeComponent{state: State, value: String}
  Completed{identity: Backend.Identity}
  TypeError{message: String}
  URIError{}
  InvalidReply{}
type Reply is Data:
  Encoded{invocation: Nat, request: Nat, value: String}
  EncodingFailed{invocation: Nat, request: Nat}

def supplied(
  identity: Maybe<&2, Backend.Identity>,
  catalog: List<&2, Backend.Declaration>
) -> Provider.Step:
  match identity:
    case Some{identity}: Provider.Completed{identity}
    case None{}: Provider.initial(Backend.default_selection(), catalog)

def precedence(
  configuration: Maybe<&2, List<&2, Configuration.Layer>>,
  identity: Maybe<&2, Backend.Identity>,
  catalog: List<&2, Backend.Declaration>
) -> Provider.Step:
  match configuration:
    case Some{layers}: Provider.initial(Configuration.effective(layers), catalog)
    case None{}: supplied(identity, catalog)

def expose(invocation: Nat, request: Nat, value: Provider.Step) -> Step:
  match value:
    case Provider.Continue{state}: Continue{State{invocation, request, Provider.Continue{state}}}
    case Provider.EncodeComponent{+value, state}: EncodeComponent{
      State{invocation, Nat.add(1n, request), Provider.EncodeComponent{value, state}},
      value
    }
    case Provider.Completed{identity}: Completed{identity}
    case Provider.TypeError{message}: TypeError{message}
    case Provider.URIError{}: URIError{}
    case Provider.InvalidReply{}: InvalidReply{}

def initial(
  invocation: Nat,
  configuration: Maybe<&2, List<&2, Configuration.Layer>>,
  identity: Maybe<&2, Backend.Identity>,
  catalog: List<&2, Backend.Declaration>
) -> Step:
  expose(invocation, 0n, precedence(configuration, identity, catalog))

# Direct settings selection uses the same kernel, without invented layers.
def initial_selection(
  invocation: Nat,
  selection: Backend.Selection,
  catalog: List<&2, Backend.Declaration>
) -> Step:
  expose(invocation, 0n, Provider.initial(selection, catalog))

def advance(state: State) -> Step:
  match state:
    case State{invocation, request, Provider.Continue{state}}: expose(
      invocation,
      request,
      Provider.advance(state)
    )
    case _: InvalidReply{}

def same_request(
  +invocation: Nat,
  +request: Nat,
  received_invocation: Nat,
  received_request: Nat
) -> Bool:
  Bool.and(Nat.is_eq(invocation, received_invocation), Nat.is_eq(request, received_request))

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case EncodeComponent{State{+invocation, +request, provider}, _} Encoded{
      received_invocation,
      received_request,
      value
    }:
      Bool.pick(
        Step,
        same_request(invocation, request, received_invocation, received_request),
        expose(invocation, request, Provider.encoded(provider, value)),
        InvalidReply{}
      )
    case EncodeComponent{State{+invocation, +request, provider}, _} EncodingFailed{
      received_invocation,
      received_request
    }:
      Bool.pick(
        Step,
        same_request(invocation, request, received_invocation, received_request),
        expose(invocation, request, Provider.encoding_failed(provider)),
        InvalidReply{}
      )
    case _ _: InvalidReply{}
