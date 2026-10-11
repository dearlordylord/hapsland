import Base
import ./PATRICIA_RELATION.bend as Patricia
import ./PATRICIA_BIT_SUPPORT_LAWS.bend as Support

law bit_preserves_key:
  for +key: String
  for +position: Nat
  {Map.bit(key, position) == Tuple{key, Patricia.route(key, position)} : String & Bool}

def Support.char_preserves_key(character, offset):
  match character offset:
    case Chr{x} 0n: {==}
    case Chr{x} 1n++rest: {==}

def Support.go_preserves_key(key, index, offset):
  match key index:
    case SNil{} +index: {==}
    case SCon{+character, +rest} 0n:
      %Equal.sym(Char & Bool,
        Map.bit.chr(character, offset),
        Tuple{character, Support.char_bit(Map.bit.chr(character, offset))},
        Support.char_preserves_key(character, offset)):
        {
          Map.bit.go.chr(rest, _)
          == Tuple{SCon{character, rest}, Patricia.bit_value(Map.bit.go.chr(rest, _))}
          : String & Bool
        }
      {==}
    case SCon{+character, +rest} 1n++previous:
      %Equal.sym(String & Bool,
        Map.bit.go(rest, previous, offset),
        Tuple{rest, Patricia.bit_value(Map.bit.go(rest, previous, offset))},
        Support.go_preserves_key(rest, previous, offset)):
        {
          Map.bit.go.rec(character, _)
          == Tuple{SCon{character, rest}, Patricia.bit_value(Map.bit.go.rec(character, _))}
          : String & Bool
        }
      {==}

def Support.at_preserves_key(key, index, offset):
  Support.go_preserves_key(key, index, offset)

def at_from_coordinates(+key: String, coordinates: Nat & Nat) -> {
    Map.bit.at(key, coordinates)
    == Tuple{key, Patricia.bit_value(Map.bit.at(key, coordinates))} : String & Bool
  }:
  match coordinates:
    case Tuple{index, offset}: Support.at_preserves_key(key, index, offset)

def bit_preserves_key(key, position):
  at_from_coordinates(key, Nat.divmod(position, 33n))
