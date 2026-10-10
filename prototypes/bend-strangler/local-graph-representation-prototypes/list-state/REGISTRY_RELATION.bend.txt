import Base
import ./Own.bend as Own

# One shared String namespace: positions are unbounded Nat IDs starting at one.
# Raw duplicate lists are accepted by lookup; constructive interning preserves uniqueness.
def increment(found: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case None{}: None{}
    case Some{index}: Some{(1n + index : Nat)}

def find_step(equal: Bool, recurse: Unit -> Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match equal:
    case True{}: Some{0n}
    case False{}: increment(recurse(Unit{}))

def find(+names: List<&2, String>, +name: String) -> Maybe<&2, Nat>:
  match names:
    case []: None{}
    case +head <> rest:
      find_step(String.eq(head, name), next => find(rest, name))

def encode(names: List<&2, String>, name: String) -> Maybe<&2, Nat>:
  increment(find(names, name))

def get(names: List<&2, String>, index: Nat) -> Maybe<&2, String>:
  match names index:
    case [] _: None{}
    case head <> _ 0n: Some{head}
    case _ <> rest 1n+tail: get(rest, tail)

def decode(names: List<&2, String>, identity: Nat) -> Maybe<&2, String>:
  match identity:
    case 0n: None{}
    case 1n+index: get(names, index)

def intern_select(
  found: Maybe<&2, Nat>,
  +names: List<&2, String>,
  name: String
) -> List<&2, String> & Nat:
  match found:
    case None{}: (
      List.append(&2, String, names, [name]),
      (1n + List.length(&2, String, names) : Nat)
    )
    case Some{identity}: (names, identity)

def intern(+names: List<&2, String>, +name: String) -> List<&2, String> & Nat:
  intern_select(encode(names, name), names, name)

def names_of(result: List<&2, String> & Nat) -> List<&2, String>:
  match result:
    case Tuple{names, _}: names

def id_of(result: List<&2, String> & Nat) -> Nat:
  match result:
    case Tuple{_, identity}: identity

def is_missing(found: Maybe<&2, Nat>) -> Bool:
  match found:
    case None{}: True{}
    case Some{_}: False{}

def unique(names: List<&2, String>) -> Bool:
  match names:
    case []: True{}
    case +head <> +rest: Bool.and(is_missing(encode(rest, head)), unique(rest))

def collect(items: List<&2, String>, names: List<&2, String>) -> List<&2, String>:
  match items:
    case []: names
    case head <> rest: collect(rest, names_of(intern(names, head)))

def registry(items: List<&2, String>) -> List<&2, String>:
  collect(items, [])

def present(names: List<&2, String>, name: String) -> Bool:
  Bool.not(is_missing(encode(names, name)))
