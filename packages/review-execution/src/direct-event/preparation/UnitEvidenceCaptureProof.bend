import Base
import ./UnitEvidence.bend as E
import ./UnitEvidenceCaptureSpecification.bend as S
import ./UnitEvidenceCaptureLaws.bend as Laws
import ../../../../source-artifacts/src/direct-event/value/Value.bend as V
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/GRAPH_LIST_FACTS.bend as L
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_STRING_FACTS.bend as Strings

def reverse_cons(+rev: List<&2, E.PreparedCapture>, +head: E.PreparedCapture, +rest: List<&2, E.PreparedCapture>) -> {
  List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, head <> rev), rest)
  == List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), head <> rest)
  : List<&2, E.PreparedCapture>
}:
  Equal.trans(List<&2, E.PreparedCapture>,
    List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, head <> rev), rest),
    List.append(&2, E.PreparedCapture, List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), [head]), rest),
    List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), head <> rest),
    Equal.cong(List<&2, E.PreparedCapture>, List<&2, E.PreparedCapture>, xs => List.append(&2, E.PreparedCapture, xs, rest),
      List.reverse(&2, E.PreparedCapture, head <> rev),
      List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), [head]),
      L.reverse_go_spec(&2, E.PreparedCapture, rev, [head])),
    L.append_assoc(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), [head], rest))

def prepare_step(+path: Maybe<&2, String>, +capture: V.ProductValue, +tail: List<&2, V.ProductValue>,
  +rev: List<&2, E.PreparedCapture>,
  ih: @+acc: List<&2, E.PreparedCapture> -> {
    E.prepare_go(tail, acc) == List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, acc), S.prepare(tail))
    : List<&2, E.PreparedCapture>}) -> {
  E.prepare_go(tail, E.prepare_insert(path, capture, rev))
  == List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), E.prepare_insert(path, capture, S.prepare(tail)))
  : List<&2, E.PreparedCapture>
}:
  match path:
    case None{}: ih(rev)
    case Some{path}:
      +head = {E.PreparedCapture{path, E.capture_fields(path, E.field("contentHash", capture), E.field("byteLength", capture))} : E.PreparedCapture}
      Equal.trans(List<&2, E.PreparedCapture>,
        E.prepare_go(tail, head <> rev),
        List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, head <> rev), S.prepare(tail)),
        List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), head <> S.prepare(tail)),
        ih(head <> rev), reverse_cons(rev, head, S.prepare(tail)))

def prepare_go_exact(+captures: List<&2, V.ProductValue>, +rev: List<&2, E.PreparedCapture>) -> {
  E.prepare_go(captures, rev)
  == List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), S.prepare(captures))
  : List<&2, E.PreparedCapture>
}:
  match captures:
    case []:
      Equal.sym(List<&2, E.PreparedCapture>,
        List.append(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev), []),
        List.reverse(&2, E.PreparedCapture, rev), L.append_nil(&2, E.PreparedCapture, List.reverse(&2, E.PreparedCapture, rev)))
    case head <> tail:
      prepare_step(E.text(E.field("path", head)), head, tail, rev, acc => prepare_go_exact(tail, acc))

def selected_exact(+matched: Bool, +path: String, +candidate: String,
  +hash: Maybe<&2, V.ProductValue>, +bytes: Maybe<&2, V.ProductValue>,
  +actual: Maybe<&2, V.ProductValue>, +expected: Maybe<&2, V.ProductValue>,
  same: {matched == String.eq(path, candidate) : Bool}, equal: {actual == expected : Maybe<&2, V.ProductValue>}) -> {
  E.prepared_selected(matched, E.capture_fields(candidate, hash, bytes), _ => actual)
  == S.capture_selected(matched, E.capture_fields(path, hash, bytes), expected) : Maybe<&2, V.ProductValue>
}:
  match matched:
    case False{}: equal
    case True{}:
      Equal.cong(String, Maybe<&2, V.ProductValue>, key => E.capture_fields(key, hash, bytes), candidate, path,
        Equal.sym(String, path, candidate,
          Strings.eq_of_eq_true(path, candidate, Equal.sym(Bool, True{}, String.eq(path, candidate), same))))

def lookup_step(+raw: Maybe<&2, V.ProductValue>, +path: String, +head: V.ProductValue,
  +tail: List<&2, V.ProductValue>,
  ih: {E.lookup_prepared(path, S.prepare(tail)) == S.capture_at(path, tail) : Maybe<&2, V.ProductValue>}) -> {
  E.lookup_prepared(path, E.prepare_insert(E.text(raw), head, S.prepare(tail)))
  == S.capture_selected(E.same_text(Some{V.ProductText{path}}, raw),
    E.capture_fields(path, E.field("contentHash", head), E.field("byteLength", head)), S.capture_at(path, tail))
  : Maybe<&2, V.ProductValue>
}:
  match raw:
    case None{}: ih
    case Some{V.ProductText{candidate}}:
      selected_exact(String.eq(path, candidate), path, candidate, E.field("contentHash", head), E.field("byteLength", head),
        E.lookup_prepared(path, S.prepare(tail)), S.capture_at(path, tail), {==}, ih)
    case Some{V.ProductNull{}}: ih
    case Some{V.ProductBool{_}}: ih
    case Some{V.ProductNumber{_}}: ih
    case Some{V.ProductArray{_}}: ih
    case Some{V.ProductObject{_}}: ih

def lookup_spec(+captures: List<&2, V.ProductValue>, +path: String) -> {
  E.lookup_prepared(path, S.prepare(captures)) == S.capture_at(path, captures) : Maybe<&2, V.ProductValue>
}:
  match captures:
    case []: {==}
    case head <> tail: lookup_step(E.field("path", head), path, head, tail, lookup_spec(tail, path))

def Laws.lookup_exact(path, captures):
  Equal.trans(Maybe<&2, V.ProductValue>,
    E.lookup_prepared(path, E.prepare_captures(captures)), E.lookup_prepared(path, S.prepare(captures)), S.capture_at(path, captures),
    Equal.cong(List<&2, E.PreparedCapture>, Maybe<&2, V.ProductValue>, values => E.lookup_prepared(path, values),
      E.prepare_captures(captures), S.prepare(captures), prepare_go_exact(captures, [])),
    lookup_spec(captures, path))

def Laws.fingerprints_exact(paths, captures):
  match paths:
    case []: {==}
    case path <> tail:
      Equal.trans(Maybe<&2, List<&2, V.ProductValue>>,
        E.fingerprints_prepared(path <> tail, E.prepare_captures(captures)),
        E.fingerprint_cons(S.capture_at(path, captures), E.fingerprints_prepared(tail, E.prepare_captures(captures))),
        S.fingerprints(path <> tail, captures),
        Equal.cong(Maybe<&2, V.ProductValue>, Maybe<&2, List<&2, V.ProductValue>>,
          head => E.fingerprint_cons(head, E.fingerprints_prepared(tail, E.prepare_captures(captures))),
          E.lookup_prepared(path, E.prepare_captures(captures)), S.capture_at(path, captures), Laws.lookup_exact(path, captures)),
        Equal.cong(Maybe<&2, List<&2, V.ProductValue>>, Maybe<&2, List<&2, V.ProductValue>>,
          rest => E.fingerprint_cons(S.capture_at(path, captures), rest),
          E.fingerprints_prepared(tail, E.prepare_captures(captures)), S.fingerprints(tail, captures), Laws.fingerprints_exact(tail, captures)))

def Laws.metadata_exact(step, contract, declarations, captures, unit):
  match step:
    case E.Inspected{partial, paths}:
      Equal.cong(Maybe<&2, List<&2, V.ProductValue>>, E.Metadata,
        fingerprints => E.metadata_ready(
          Bool.and(Bool.or(String.eq(contract, "direct-event/type-shape/v1"), String.eq(contract, "direct-event/function/v1")),
            E.absent(E.root_location(contract, E.unit_artifact(unit), declarations))), partial,
          E.root_location(contract, E.unit_artifact(unit), declarations), fingerprints),
        E.fingerprints_prepared(paths, E.prepare_captures(captures)), S.fingerprints(paths, captures),
        Laws.fingerprints_exact(paths, captures))
    case E.MissingEvidence{}: {==}
    case E.InvalidInput{}: {==}
    case E.Continue{_}: {==}

def main() -> Unit:
  Unit{}
