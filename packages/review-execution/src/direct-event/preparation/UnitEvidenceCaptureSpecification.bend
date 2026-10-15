import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as V
import ./UnitEvidence.bend as E

# Independent original capture traversal; production does not import this owner.
def capture_selected(
  matched: Bool,
  value: Maybe<&2, V.ProductValue>,
  rest: Maybe<&2, V.ProductValue>
) -> Maybe<&2, V.ProductValue>:
  match matched:
    case True{}: value
    case False{}: rest

def capture_at(
  +path: String,
  captures: List<&2, V.ProductValue>
) -> Maybe<&2, V.ProductValue>:
  match captures:
    case []: None{}
    case +capture <> tail:
      capture_selected(
        E.same_text(Some{V.ProductText{path}}, E.field("path", capture)),
        E.capture_fields(path, E.field("contentHash", capture), E.field("byteLength", capture)),
        capture_at(path, tail)
      )


def fingerprints(
  paths: List<&2, String>,
  +captures: List<&2, V.ProductValue>
) -> Maybe<&2, List<&2, V.ProductValue>>:
  match paths:
    case []: Some{[]}
    case path <> tail: E.fingerprint_cons(capture_at(path, captures), fingerprints(tail, captures))

def prepare(captures: List<&2, V.ProductValue>) -> List<&2, E.PreparedCapture>:
  match captures:
    case []: []
    case +head <> tail:
      E.prepare_insert(E.text(E.field("path", head)), head, prepare(tail))

def metadata_location(
  partial: Bool,
  paths: List<&2, String>,
  +contract: String,
  +location: Maybe<&2, V.ProductValue>,
  captures: List<&2, V.ProductValue>
) -> E.Metadata:
  E.metadata_ready(
    Bool.and(
      Bool.or(
        String.eq(contract, "direct-event/type-shape/v1"),
        String.eq(contract, "direct-event/function/v1")
      ),
      E.absent(location)
    ),
    partial,
    location,
    fingerprints(paths, captures)
  )

def metadata(
  step: E.Step,
  +contract: String,
  declarations: List<&2, V.ProductValue>,
  captures: List<&2, V.ProductValue>,
  unit: V.ProductValue
) -> E.Metadata:
  match step:
    case E.Inspected{partial, paths}:
      metadata_location(
        partial,
        paths,
        contract,
        E.root_location(contract, E.unit_artifact(unit), declarations),
        captures
      )
    case E.MissingEvidence{}: E.EvidenceMissing{}
    case _: E.EvidenceInvalid{}

def main() -> Unit:
  Unit{}
