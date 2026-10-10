import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol

# Exact staticRoot policy over raw TOML-engine values; the host only normalizes
# and observes path primitives. Date records match native record(Date) == {}.
type Directive is Data:
  Directive{discovered_text: Maybe<&2, String>, mapping: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>}
type View is Data:
  Unsupported{}
  Supported{directive: Directive}
type Stage is Data:
  NormalizingDiscovered{}
  CheckingDiscovered{}
  NormalizingMapping{}
  CheckingMapping{}
type State is Data:
  State{
    mapping: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>,
    discovered: Maybe<&2, String>,
    path: String,
    separator: String,
    invocation: Nat,
    next_request: Nat,
    stage: Stage
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{root: Maybe<&2, String>, next_request: Nat}
  Failed{failure: T.TechnicalFailure}

def state_mapping(state: State) -> Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>:
  match state:
    case State{mapping, _, _, _, _, _, _}: mapping

def with_mapping(state: State, replacement: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>) -> State:
  match state:
    case State{_, discovered, path, separator, invocation, next_request, stage}:
      State{replacement, discovered, path, separator, invocation, next_request, stage}

def state_discovered(state: State) -> Maybe<&2, String>:
  match state:
    case State{_, discovered, _, _, _, _, _}: discovered

def with_discovered(state: State, replacement: Maybe<&2, String>) -> State:
  match state:
    case State{mapping, _, path, separator, invocation, next_request, stage}:
      State{mapping, replacement, path, separator, invocation, next_request, stage}

def state_path(state: State) -> String:
  match state:
    case State{_, _, path, _, _, _, _}: path

def with_path(state: State, replacement: String) -> State:
  match state:
    case State{mapping, discovered, _, separator, invocation, next_request, stage}:
      State{mapping, discovered, replacement, separator, invocation, next_request, stage}

def state_separator(state: State) -> String:
  match state:
    case State{_, _, _, separator, _, _, _}: separator

def with_separator(state: State, replacement: String) -> State:
  match state:
    case State{mapping, discovered, path, _, invocation, next_request, stage}:
      State{mapping, discovered, path, replacement, invocation, next_request, stage}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, invocation, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{mapping, discovered, path, separator, _, next_request, stage}:
      State{mapping, discovered, path, separator, replacement, next_request, stage}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, next_request, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{mapping, discovered, path, separator, invocation, _, stage}:
      State{mapping, discovered, path, separator, invocation, replacement, stage}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, stage}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{mapping, discovered, path, separator, invocation, next_request, _}:
      State{mapping, discovered, path, separator, invocation, next_request, replacement}

def record(value: Maybe<&2, T.TomlValue>) -> Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>:
  match value:
    case Some{T.TomlRecord{fields}}: Some{fields}
    case Some{T.TomlDate{_}}: Some{[]}
    case _: None{}

def field(fields: List<&2, T.OrderedField<T.TomlValue>>, +key: String) -> Maybe<&2, T.TomlValue>:
  match fields:
    case []: None{}
    case T.OrderedField{name, value} <> tail:
      Bool.pick(Maybe<&2, T.TomlValue>, String.eq(name, key), Some{value}, field(tail, key))

def record_field(record: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>, key: String) -> Maybe<&2, T.TomlValue>:
  match record:
    case None{}: None{}
    case Some{fields}: field(fields, key)

def get(value: Maybe<&2, T.TomlValue>, key: String) -> Maybe<&2, T.TomlValue>:
  record_field(record(value), key)

def present(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case None{}: False{}
    case Some{_}: True{}

def discovered_value(value: Maybe<&2, T.TomlValue>, mapping: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>) -> View:
  match value:
    case None{}: Supported{Directive{None{}, mapping}}
    case Some{T.TomlArray{T.TomlString{text} <> []}}: Supported{Directive{Some{text}, mapping}}
    case _: Unsupported{}

def allowed(allowed: Bool, +tool: Maybe<&2, T.TomlValue>) -> View:
  match allowed:
    case False{}: Unsupported{}
    case True{}:
      +setuptools = get(tool, "setuptools")
      discovered_value(get(get(get(setuptools, "packages"), "find"), "where"), record(get(setuptools, "package-dir")))

def view(syntax: T.TomlValue) -> View:
  +tool = get(Some{syntax}, "tool")
  allowed(Bool.not(Bool.or(present(get(tool, "poetry")),
    Bool.or(present(get(tool, "hatch")), present(get(tool, "pdm"))))), tool)

def request(+state: State, stage: Stage, operation: T.Operation) -> Step:
  Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}

def returned(+state: State, root: Maybe<&2, String>) -> Step:
  Returned{root, state_next_request(state)}

def default_root(discovered: Maybe<&2, String>) -> String:
  match discovered:
    case None{}: "."
    case Some{root}: root

def mapping_fields(fields: List<&2, T.OrderedField<T.TomlValue>>, +state: State) -> Step:
  match fields:
    case T.OrderedField{"", T.TomlString{text}} <> []:
      request(state, NormalizingMapping{}, T.PathNormalize{text})
    case _: returned(state, None{})

def validate_mapping(value: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>, +state: State) -> Step:
  match value:
    case None{}: returned(state, Some{default_root(state_discovered(state))})
    case Some{fields}: mapping_fields(fields, state)

def component_count(path: String, +separator: String) -> Nat:
  match path:
    case SNil{}: 1n
    case SCon{head, +tail}:
      (component_count(tail, separator) + Bool.pick(Nat, String.eq(SCon{head, SNil{}}, separator), 1n, 0n) : Nat)

def within(+path: String, +separator: String, absolute: Bool) -> Bool:
  Bool.and(Bool.not(absolute), Bool.and(Bool.not(String.eq(path, "..")),
    Bool.and(Bool.not(String.starts_with(path, String.append("..", separator))),
      Nat.is_le(component_count(path, separator), 4n))))

def mapping_equal(discovered: Maybe<&2, String>, path: String) -> Bool:
  match discovered:
    case None{}: True{}
    case Some{root}: String.eq(root, path)

def discovered_allowed(allowed: Bool, +state: State) -> Step:
  match allowed:
    case False{}: returned(state, None{})
    case True{}: validate_mapping(state_mapping(state), with_discovered(state, Some{state_path(state)}))

def mapped_allowed(allowed: Bool, +state: State) -> Step:
  match allowed:
    case False{}: returned(state, None{})
    case True{}: returned(state, Some{state_path(state)})

def apply_outcome(stage: Stage, +state: State, outcome: T.ServiceOutcome) -> Step:
  match stage outcome:
    case NormalizingDiscovered{} T.NormalizedResult{+path}: request(with_path(state, path), CheckingDiscovered{}, T.PathIsAbsolute{path})
    case CheckingDiscovered{} T.AbsoluteResult{absolute}: discovered_allowed(
      within(state_path(state), state_separator(state), absolute), state)
    case NormalizingMapping{} T.NormalizedResult{+path}: request(with_path(state, path), CheckingMapping{}, T.PathIsAbsolute{path})
    case CheckingMapping{} T.AbsoluteResult{absolute}: mapped_allowed(
      Bool.and(within(state_path(state), state_separator(state), absolute),
        mapping_equal(state_discovered(state), state_path(state))), state)
    case _ T.ProviderRejected{exception}: Failed{T.ForeignProviderFailure{exception}}
    case _ _: Failed{T.MalformedReply{}}

def checked(reply: Protocol.CheckedReply, +state: State) -> Step:
  match reply:
    case Protocol.RejectedReply{failure}: Failed{failure}
    case Protocol.CheckedOutcome{outcome}: apply_outcome(state_stage(state), state, outcome)

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Await{state, request}: checked(Protocol.check(request, reply), state)
    case _: Failed{T.MalformedReply{}}

def begin_view(view: View, separator: String, invocation: Nat, next_request: Nat) -> Step:
  match view:
    case Unsupported{}: Returned{None{}, next_request}
    case Supported{Directive{None{}, +mapping}}:
      validate_mapping(mapping, State{mapping, None{}, "", separator, invocation, next_request, NormalizingMapping{}})
    case Supported{Directive{Some{+text}, mapping}}: request(
      State{mapping, None{}, "", separator, invocation, next_request, NormalizingDiscovered{}},
      NormalizingDiscovered{}, T.PathNormalize{text})

def begin(syntax: T.TomlValue, separator: String, invocation: Nat, next_request: Nat) -> Step:
  begin_view(view(syntax), separator, invocation, next_request)

def main() -> Unit:
  Unit{}
