import Base

# Ordered raw registrations from the existing language registry. The host only
# supplies ECMAScript extname(path).toLowerCase(); Bend owns language selection.
type Registration is Data:
  Registration{id: String, extensions: List<&2, String>}

def contains(+extension: String, extensions: List<&2, String>) -> Bool:
  match extensions:
    case []: False{}
    case head <> tail: Bool.or(String.eq(extension, head), contains(extension, tail))

def select(+extension: String, registrations: List<&2, Registration>) -> Maybe<&2, String>:
  match registrations:
    case []: None{}
    case Registration{id, extensions} <> tail:
      Bool.pick(
        Maybe<&2, String>,
        contains(extension, extensions),
        Some{id},
        select(extension, tail)
      )
