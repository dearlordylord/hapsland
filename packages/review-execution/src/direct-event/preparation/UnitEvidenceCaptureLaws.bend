import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ./UnitEvidence.bend as E
import ./UnitEvidenceCaptureSpecification.bend as S

# Astra-approved arbitrary-input laws, including malformed/duplicate captures.
law lookup_exact:
  for +path: String
  for +captures: List<&2, Value.ProductValue>
  {E.lookup_prepared(path, E.prepare_captures(captures)) == S.capture_at(path, captures)
    : Maybe<&2, Value.ProductValue>}

law fingerprints_exact:
  for +paths: List<&2, String>
  for +captures: List<&2, Value.ProductValue>
  {E.fingerprints_prepared(paths, E.prepare_captures(captures)) == S.fingerprints(paths, captures)
    : Maybe<&2, List<&2, Value.ProductValue>>}

# Direct metadata coupling keeps root refusal and fingerprint omission unchanged.
law metadata_exact:
  for +step: E.Step
  for +contract: String
  for +declarations: List<&2, Value.ProductValue>
  for +captures: List<&2, Value.ProductValue>
  for +unit: Value.ProductValue
  {E.metadata(step, contract, declarations, E.prepare_captures(captures), unit)
    == S.metadata(step, contract, declarations, captures, unit) : E.Metadata}

def main() -> Unit:
  Unit{}
