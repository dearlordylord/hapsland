import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base

# Finalization's canonical JSON stage. The host receives primitives only.
# Input domain: unique object keys from the native-object producer ABI.
# General ProductValue validity is a composition obligation, not proved here.
# UTF-16 ordering matches Object.keys(value).sort(), including supplementary keys.
type Primitive is Data:
  NullPrimitive{}
  BoolPrimitive{value: Bool}
  NumberPrimitive{bits: ArtifactValue.Binary64}
  StringPrimitive{value: String}
type Work is Data:
  Visit{value: ArtifactValue.ProductValue}
  Literal{value: String}
type State is Data:
  State{pending: List<&2, Work>, reversed_parts: List<&2, String>}
type Step is Data:
  Continue{state: State}
  JsonPrimitive{state: State, value: Primitive}
  Complete{bytes: String}

def utf16_char(+code: U32, tail: List<&2, U32>, supplementary: Bool) -> List<&2, U32>:
  match supplementary:
    case False{}: code <> tail
    case True{}:
      (55296 + ((code - 65536 : U32) / 1024 : U32) : U32) <>
        (56320 + ((code - 65536 : U32) % 1024 : U32) : U32) <> tail

def utf16(value: String) -> List<&2, U32>:
  match value:
    case SNil{}: []
    case SCon{character, tail}:
      +code = Char.to_u32(character)
      utf16_char(code, utf16(tail), U32.is_gt(code, 65535))

def units_le(left: List<&2, U32>, right: List<&2, U32>) -> Bool:
  match left right:
    case Nil{} _: True{}
    case Con{_, _} Nil{}: False{}
    case Con{+a, tail_a} Con{+b, tail_b}:
      Bool.or(U32.is_lt(a, b), Bool.and(U32.is_eq(a, b), units_le(tail_a, tail_b)))

def fields_le(
  left: ArtifactValue.OrderedField<ArtifactValue.ProductValue>,
  right: ArtifactValue.OrderedField<ArtifactValue.ProductValue>
) -> Bool:
  match left right:
    case ArtifactValue.OrderedField{a, _} ArtifactValue.OrderedField{b, _}: units_le(
      utf16(a),
      utf16(b)
    )

def array_work(items: List<&2, ArtifactValue.ProductValue>) -> List<&2, Work>:
  match items:
    case []: [Literal{"]"}]
    case value <> []: [Visit{value}, Literal{"]"}]
    case value <> tail: Visit{value} <> Literal{","} <> array_work(tail)

def object_work(
  fields: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>
) -> List<&2, Work>:
  match fields:
    case []: [Literal{"}"}]
    case ArtifactValue.OrderedField{key, value} <> []:
      [Visit{ArtifactValue.ProductText{key}}, Literal{":"}, Visit{value}, Literal{"}"}]
    case ArtifactValue.OrderedField{key, value} <> tail:
      Visit{ArtifactValue.ProductText{key}} <> Literal{":"} <> Visit{value} <> Literal{","} <> object_work(
        tail
      )

def visit(
  value: ArtifactValue.ProductValue,
  pending: List<&2, Work>,
  parts: List<&2, String>
) -> Step:
  match value:
    case ArtifactValue.ProductNull{}: JsonPrimitive{State{pending, parts}, NullPrimitive{}}
    case ArtifactValue.ProductBool{value}: JsonPrimitive{
      State{pending, parts},
      BoolPrimitive{value}
    }
    case ArtifactValue.ProductNumber{bits}: JsonPrimitive{
      State{pending, parts},
      NumberPrimitive{bits}
    }
    case ArtifactValue.ProductText{value}: JsonPrimitive{
      State{pending, parts},
      StringPrimitive{value}
    }
    case ArtifactValue.ProductArray{items}:
      Continue{State{List.append(&2, Work, array_work(items), pending), "[" <> parts}}
    case ArtifactValue.ProductObject{fields}:
      Continue{
        State{
          List.append(
            &2,
            Work,
            object_work(
              List.sort(~ArtifactValue.OrderedField<ArtifactValue.ProductValue>, ~fields_le, fields)
            ),
            pending
          ),
          "{" <> parts
        }
      }

# Finish the existing literal-only traversal before crossing the host ABI.
# Stop before Visit so primitive serialization retains its native boundary.
def literal_prefix(pending: List<&2, Work>, parts: List<&2, String>) -> State:
  match pending:
    case []: State{[], parts}
    case Literal{value} <> tail: literal_prefix(tail, value <> parts)
    case Visit{value} <> tail: State{Visit{value} <> tail, parts}

def advance(state: State) -> Step:
  match state:
    case State{[], parts}: Complete{String.concat(List.reverse(&2, String, parts))}
    case State{Literal{value} <> pending, parts}: Continue{literal_prefix(pending, value <> parts)}
    case State{Visit{value} <> pending, parts}: visit(value, pending, parts)

def primitive_returned(state: State, token: String) -> State:
  match state:
    case State{pending, parts}: State{pending, token <> parts}

def initial(value: ArtifactValue.ProductValue) -> State:
  State{[Visit{value}], []}

def main() -> Unit:
  Unit{}
