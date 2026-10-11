import Base
import ./BOUNDARY_ENCODING.bend as Encoding
import ./REGISTRY_RELATION.bend as Registry

# Collection covers the whole input list simultaneously, including every duplicate occurrence.
law all_present_collect:
  for +items: List<&2, String>
  for +names: List<&2, String>
  {Encoding.all_present(items, Registry.collect(items, names)) == True{} : Bool}

# The encoding discriminator exactly reflects its validated branch for any typed boundary.
law encoded_if_exact:
  for +valid: Bool
  for names: List<&2, String>
  for input: Encoding.Input
  {Encoding.is_encoded(Encoding.encode_if(valid, names, input)) == valid : Bool}

# Actual presence disallows None before assigning the identity and decoding it.
law covered_id_step:
  for +found: Maybe<&2, Nat>
  for +names: List<&2, String>
  for +name: String
  for matches: {Registry.encode(names, name) == found : Maybe<&2, Nat>}
  for covered: {Bool.not(Registry.is_missing(found)) == True{} : Bool}
  {Registry.decode(names, Encoding.assigned(found)) == Some{name} : Maybe<&2, String>}

# The same actual presence guarantees a positive, bounded identity in both branches.
law covered_range_step:
  for +found: Maybe<&2, Nat>
  for +names: List<&2, String>
  for +name: String
  for matches: {Registry.encode(names, name) == found : Maybe<&2, Nat>}
  for covered: {Bool.not(Registry.is_missing(found)) == True{} : Bool}
  {
    Bool.and(
      Nat.is_lt(0n, Encoding.assigned(found)),
      Nat.is_le(Encoding.assigned(found), List.length(&2, String, names))
    )
    == True{}
    : Bool
  }

# Covered identity decoding yields the exact String without using the total default.
law covered_text_exact:
  for +names: List<&2, String>
  for +name: String
  for covered: {Registry.present(names, name) == True{} : Bool}
  {Encoding.text(names, Encoding.identity(names, name)) == name : String}
