import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ../../../../runtime-environment/src/runtime/backend/Backend.bend as Backend
import ../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend.bend as Configuration
import ../../../../review-definition/src/review-providers/ProviderFinalization.bend as Provider
import ./CanonicalJson.bend as Json
import ./UnitEvidence.bend as Evidence

# Connected frozen-input and semantic-identity construction. Upstream evidence
# and ordered rules supply their outputs; host engines only encode primitives,
# encode URI components, and hash UTF-8 bytes. One request namespace spans them.
type Frame is Data:
  Frame{
    contract: String,
    path: String,
    graph_limits: ArtifactValue.ProductValue,
    unit: ArtifactValue.ProductValue,
    root_location: Maybe<&2, ArtifactValue.ProductValue>,
    fingerprints: ArtifactValue.ProductValue,
    partial: Bool,
    rules: List<&2, ArtifactValue.ProductValue>
  }
type Work is Data:
  ProviderWork{frame: Frame, step: Provider.Step}
  JsonWork{input: ArtifactValue.ProductValue, state: Json.State}
  HashWork{input: ArtifactValue.ProductValue}
type State is Data:
  State{invocation: Nat, request: Nat, work: Work}
type Step is Data:
  Continue{state: State}
  EncodeComponent{state: State, value: String}
  JsonPrimitive{state: State, value: Json.Primitive}
  Digest{state: State, bytes: String}
  Completed{input: ArtifactValue.ProductValue, identity: String}
  TypeError{message: String}
  URIError{}
  InvalidReply{}
type Reply is Data:
  Encoded{invocation: Nat, request: Nat, value: String}
  EncodingFailed{invocation: Nat, request: Nat}
  Serialized{invocation: Nat, request: Nat, value: String}
  Hashed{invocation: Nat, request: Nat, value: String}

def identity_value(identity: Backend.Identity) -> ArtifactValue.ProductValue:
  match identity:
    case Backend.Identity{provider, model, destination}:
      ArtifactValue.ProductObject{
        [
          ArtifactValue.OrderedField{"provider", ArtifactValue.ProductText{provider}},
          ArtifactValue.OrderedField{"model", ArtifactValue.ProductText{model}},
          ArtifactValue.OrderedField{"destination", ArtifactValue.ProductText{destination}}
        ]
      }

def core_fields(
  frame: Frame,
  identity: Backend.Identity
) -> List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
  match frame:
    case Frame{contract, path, graph_limits, +unit, _, _, partial, rules}:
      [
        ArtifactValue.OrderedField{"contract", ArtifactValue.ProductText{contract}},
        ArtifactValue.OrderedField{"providerIdentity", identity_value(identity)},
        ArtifactValue.OrderedField{"graphLimits", graph_limits},
        ArtifactValue.OrderedField{"candidateProjection", ArtifactValue.ProductBool{True{}}},
        ArtifactValue.OrderedField{
          "completeness",
          ArtifactValue.ProductText{Bool.pick(String, partial, "incomplete-irrelevant", "complete")}
        },
        ArtifactValue.OrderedField{"path", ArtifactValue.ProductText{path}},
        ArtifactValue.OrderedField{"declaration", Evidence.unit_artifact(unit)},
        ArtifactValue.OrderedField{"unit", unit},
        ArtifactValue.OrderedField{"rules", ArtifactValue.ProductArray{rules}},
        ArtifactValue.OrderedField{
          "interpretation",
          ArtifactValue.ProductText{"probability-strictly-greater-than-threshold"}
        }
      ]

def location_fields(
  location: Maybe<&2, ArtifactValue.ProductValue>,
  fingerprints: ArtifactValue.ProductValue
) -> List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
  match location:
    case None{}: [ArtifactValue.OrderedField{"sourceFingerprints", fingerprints}]
    case Some{location}: [
      ArtifactValue.OrderedField{"rootLocation", location},
      ArtifactValue.OrderedField{"sourceFingerprints", fingerprints}
    ]

def insert_metadata(
  count: Nat,
  fields: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>,
  metadata: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>
) -> List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
  match count fields:
    case 0n _: List.append(
      &2,
      ArtifactValue.OrderedField<ArtifactValue.ProductValue>,
      metadata,
      fields
    )
    case _ Nil{}: metadata
    case 1n++k Con{head, tail}: head <> insert_metadata(k, tail, metadata)

def input_value(
  frame: Frame,
  fields: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>
) -> ArtifactValue.ProductValue:
  match frame:
    case Frame{_, _, _, _, location, fingerprints, _, _}:
      ArtifactValue.ProductObject{
        insert_metadata(4n, fields, location_fields(location, fingerprints))
      }

def identity_ready(
  invocation: Nat,
  request: Nat,
  +frame: Frame,
  identity: Backend.Identity
) -> Step:
  +fields = core_fields(frame, identity)
  Continue{
    State{
      invocation,
      request,
      JsonWork{input_value(frame, fields), Json.initial(ArtifactValue.ProductObject{fields})}
    }
  }

def provider_expose(invocation: Nat, request: Nat, frame: Frame, step: Provider.Step) -> Step:
  match step:
    case Provider.Completed{identity}: identity_ready(invocation, request, frame, identity)
    case Provider.TypeError{message}: TypeError{message}
    case Provider.URIError{}: URIError{}
    case Provider.InvalidReply{}: InvalidReply{}
    case Provider.EncodeComponent{state, +value}:
      EncodeComponent{
        State{
          invocation,
          Nat.add(1n, request),
          ProviderWork{frame, Provider.EncodeComponent{state, value}}
        },
        value
      }
    case Provider.Continue{state}: Continue{
      State{invocation, request, ProviderWork{frame, Provider.Continue{state}}}
    }

def initial(
  +invocation: Nat,
  frame: Frame,
  configuration: Maybe<&2, List<&2, Configuration.Layer>>,
  identity: Maybe<&2, Backend.Identity>,
  catalog: List<&2, Backend.Declaration>
) -> Step:
  provider_expose(
    invocation,
    0n,
    frame,
    Provider.initial(invocation, configuration, identity, catalog)
  )

def json_expose(
  invocation: Nat,
  request: Nat,
  input: ArtifactValue.ProductValue,
  step: Json.Step
) -> Step:
  match step:
    case Json.Continue{state}: Continue{State{invocation, request, JsonWork{input, state}}}
    case Json.JsonPrimitive{state, value}: JsonPrimitive{
      State{invocation, Nat.add(1n, request), JsonWork{input, state}},
      value
    }
    case Json.Complete{bytes}: Digest{
      State{invocation, Nat.add(1n, request), HashWork{input}},
      bytes
    }

def advance(state: State) -> Step:
  match state:
    case State{invocation, request, ProviderWork{frame, Provider.Continue{state}}}:
      provider_expose(invocation, request, frame, Provider.advance(state))
    case State{invocation, request, JsonWork{input, state}}: json_expose(
      invocation,
      request,
      input,
      Json.advance(state)
    )
    case _: InvalidReply{}

def same(+invocation: Nat, +request: Nat, received_invocation: Nat, received_request: Nat) -> Bool:
  Bool.and(Nat.is_eq(invocation, received_invocation), Nat.is_eq(request, received_request))

def provider_encoded(state: Provider.State, value: String) -> Provider.Step:
  match state:
    case Provider.State{+invocation, +request, provider}:
      Provider.resume(
        Provider.EncodeComponent{Provider.State{invocation, request, provider}, ""},
        Provider.Encoded{invocation, request, value}
      )

def provider_failed(state: Provider.State) -> Provider.Step:
  match state:
    case Provider.State{+invocation, +request, provider}:
      Provider.resume(
        Provider.EncodeComponent{Provider.State{invocation, request, provider}, ""},
        Provider.EncodingFailed{invocation, request}
      )

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case EncodeComponent{
      State{+invocation, +request, ProviderWork{frame, Provider.EncodeComponent{state, _}}},
      _
    } Encoded{received_invocation, received_request, value}:
      Bool.pick(
        Step,
        same(invocation, request, received_invocation, received_request),
        provider_expose(invocation, request, frame, provider_encoded(state, value)),
        InvalidReply{}
      )
    case EncodeComponent{
      State{+invocation, +request, ProviderWork{frame, Provider.EncodeComponent{state, _}}},
      _
    } EncodingFailed{received_invocation, received_request}:
      Bool.pick(
        Step,
        same(invocation, request, received_invocation, received_request),
        provider_expose(invocation, request, frame, provider_failed(state)),
        InvalidReply{}
      )
    case JsonPrimitive{State{+invocation, +request, JsonWork{input, state}}, _} Serialized{
      received_invocation,
      received_request,
      value
    }:
      Bool.pick(
        Step,
        same(invocation, request, received_invocation, received_request),
        Continue{
          State{invocation, request, JsonWork{input, Json.primitive_returned(state, value)}}
        },
        InvalidReply{}
      )
    case Digest{State{invocation, request, HashWork{input}}, _} Hashed{
      received_invocation,
      received_request,
      value
    }:
      Bool.pick(
        Step,
        same(invocation, request, received_invocation, received_request),
        Completed{input, value},
        InvalidReply{}
      )
    case _ _: InvalidReply{}
