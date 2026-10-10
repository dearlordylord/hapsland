import Base
import ./PATRICIA_RELATION.bend as Patricia

# Transport lemmas for the actual BaseMap routing implementation.
def char_bit(result: Char & Bool) -> Bool:
  match result:
    case Tuple{_, bit}: bit

law char_preserves_key:
  for +character: Char
  for +offset: Nat
  {
    Map.bit.chr(character, offset)
    == Tuple{character, char_bit(Map.bit.chr(character, offset))} : Char & Bool
  }

law go_preserves_key:
  for +key: String
  for +index: Nat
  for +offset: Nat
  {
    Map.bit.go(key, index, offset)
    == Tuple{key, Patricia.bit_value(Map.bit.go(key, index, offset))} : String & Bool
  }

law at_preserves_key:
  for +key: String
  for +index: Nat
  for +offset: Nat
  {
    Map.bit.at(key, Tuple{index, offset})
    == Tuple{key, Patricia.bit_value(Map.bit.at(key, Tuple{index, offset}))} : String & Bool
  }
