import Base
import ../ForestSpecification.bend as F

# Erased witness extension for the whole transaction. Child local IDs are paired
# with their immutable construction births; failed admission never removes them.
def shifted(items: List<&2, F.AddressEntry>, +offset: Nat) -> List<&2, F.AddressEntry>:
  match items:
    case []: []
    case F.AddressEntry{id, address} <> tail:
      F.AddressEntry{(id + offset : Nat), address} <> shifted(tail, offset)

def extended(old: List<&2, F.AddressEntry>, offset: Nat,
    created: F.Created) -> List<&2, F.AddressEntry>:
  match created:
    case F.Created{_, _, entries}:
      List.append(&2, F.AddressEntry, old, shifted(entries, offset))

def main() -> Unit:
  Unit{}
