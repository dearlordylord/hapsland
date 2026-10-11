import Base
import ./Types.bend as T
import ./CargoSpecification.bend as Specification

# Native Linux path algebra for the declared validation lane only.
def absolute(path: String) -> Bool:
  String.starts_with(path, "/")

def select(syntax: T.TomlValue, selected: String, limit: Nat) -> Maybe<&2, T.CargoPlan>:
  Specification.select(~absolute, syntax, selected, "/", limit)

def main() -> Unit:
  Unit{}
