import Base
import ./PATRICIA_RELATION.bend as Patricia

# The actual Word32 xor/msb split lies within the character payload and
# separates its two routes after an equal prefix. Bounds exclude the next
# character, allowing the String proof to keep arbitrary suffixes.
def character_split(+left: U32, +right: U32) -> Bool:
  +position = Map.diff.chr(U32.xor(left, right))
  +left_key = {SCon{Chr{left}, SNil{}} : String}
  +right_key = {SCon{Chr{right}, SNil{}} : String}
  Bool.and(Nat.is_le(1n, position),
    Bool.and(Nat.is_lt(position, 33n),
      Bool.and(Patricia.same_prefix(position, left_key, right_key),
        Bool.not(Patricia.bool_equal(
          Patricia.route(left_key, position),
          Patricia.route(right_key, position)
        )))))

law distinct_character_first_split:
  for +left: U32
  for +right: U32
  for distinct: {U32.is_eq(left, right) == False{} : Bool}
  {character_split(left, right) == True{} : Bool}
