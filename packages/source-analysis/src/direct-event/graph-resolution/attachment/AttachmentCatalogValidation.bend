import Base
import ../SourceValidationSpecification.bend as Validation
import ../Types.bend as T

def catalog_valid(items: List<&2, T.ArtifactEntry>) -> Bool:
  match items:
    case []: True{}
    case T.ArtifactEntry{_, value} <> tail:
      Bool.and(Validation.artifact(value), catalog_valid(tail))

def main() -> Unit:
  Unit{}
