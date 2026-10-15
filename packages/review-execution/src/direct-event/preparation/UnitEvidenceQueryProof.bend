import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ./UnitEvidence.bend as Evidence
import ./UnitEvidenceQuerySpec.bend as Spec
import ./UnitEvidenceQueryLaws.bend as Laws
import ./CanonicalJson.bend as Json

def field_bridge(found: Bool, value: Value.ProductValue,
  actual: Maybe<&2, Value.ProductValue>, expected: Maybe<&2, Value.ProductValue>,
  same: {actual == expected : Maybe<&2, Value.ProductValue>}) -> {
  Evidence.field_answer(found, value, _ => actual)
  == Bool.pick(Maybe<&2, Value.ProductValue>, found, Some{value}, expected)
  : Maybe<&2, Value.ProductValue>}:
  match found:
    case True{}: {==}
    case False{}: same

def Laws.field_exact(key, fields):
  match fields:
    case []: {==}
    case Value.OrderedField{candidate, value} <> tail:
      field_bridge(String.eq(key, candidate), value, Evidence.field_list(key, tail),
        Spec.field_list(key, tail), Laws.field_exact(key, tail))

def field_value_exact(key: String, value: Value.ProductValue) -> {
  Evidence.field(key, value) == Spec.field(key, value) : Maybe<&2, Value.ProductValue>}:
  match value:
    case Value.ProductObject{fields}: Laws.field_exact(key, fields)
    case Value.ProductNull{}: {==}
    case Value.ProductBool{_}: {==}
    case Value.ProductNumber{_}: {==}
    case Value.ProductText{_}: {==}
    case Value.ProductArray{_}: {==}

def and_same(first: Bool, rest: Bool) -> {
  Evidence.query_and(first, _ => rest) == Bool.and(first, rest) : Bool}:
  match first:
    case False{}: {==}
    case True{}: {==}

def or_same(first: Bool, rest: Bool) -> {
  Evidence.query_or(first, _ => rest) == Bool.or(first, rest) : Bool}:
  match first:
    case False{}: {==}
    case True{}: {==}

def and_bridge(a: Bool, b: Bool, c: Bool, d: Bool,
  first: {a == b : Bool}, rest: {c == d : Bool}) -> {
  Evidence.query_and(a, _ => c) == Bool.and(b, d) : Bool}:
  %Equal.sym(Bool, a, b, first): {Evidence.query_and(_, _ => c) == Bool.and(b, d) : Bool}
  %Equal.sym(Bool, c, d, rest): {Evidence.query_and(b, _ => _) == Bool.and(b, d) : Bool}
  and_same(b, d)

def or_bridge(a: Bool, b: Bool, c: Bool, d: Bool,
  first: {a == b : Bool}, rest: {c == d : Bool}) -> {
  Evidence.query_or(a, _ => c) == Bool.or(b, d) : Bool}:
  %Equal.sym(Bool, a, b, first): {Evidence.query_or(_, _ => c) == Bool.or(b, d) : Bool}
  %Equal.sym(Bool, c, d, rest): {Evidence.query_or(b, _ => _) == Bool.or(b, d) : Bool}
  or_same(b, d)

def text_exact(+key: String, +actual: Value.ProductValue, +candidate: Value.ProductValue) -> {
  Evidence.same_text(Evidence.field(key, actual), Evidence.field(key, candidate))
  == Evidence.same_text(Spec.field(key, actual), Spec.field(key, candidate)) : Bool}:
  %Equal.sym(Maybe<&2, Value.ProductValue>, Evidence.field(key, actual), Spec.field(key, actual),
    field_value_exact(key, actual)): {
    Evidence.same_text(_, Evidence.field(key, candidate))
    == Evidence.same_text(Spec.field(key, actual), Spec.field(key, candidate)) : Bool}
  Equal.cong(
    Maybe<&2, Value.ProductValue>,
    Bool,
    right => Evidence.same_text(Spec.field(key, actual), right),
    Evidence.field(key, candidate),
    Spec.field(key, candidate),
    field_value_exact(key, candidate)
  )

def Laws.matching_exact(keys, actual, candidate):
  match keys:
    case []: {==}
    case key <> tail:
      and_bridge(
        Evidence.same_text(Evidence.field(key, actual), Evidence.field(key, candidate)),
        Evidence.same_text(Spec.field(key, actual), Spec.field(key, candidate)),
        Evidence.matching_fields(tail, actual, candidate),
        Spec.matching_fields(tail, actual, candidate),
        text_exact(key, actual, candidate),
        Laws.matching_exact(tail, actual, candidate)
      )

def origin_exact(
  actual: Maybe<&2, Value.ProductValue>,
  candidate: Maybe<&2, Value.ProductValue>
) -> {
  Evidence.origin_equal(actual, candidate) == Spec.origin_equal(actual, candidate) : Bool}:
  match actual candidate:
    case Some{actual} Some{candidate}:
      Laws.matching_exact(
        ["kind", "library", "compilerVersion", "compilerSource", "moduleHash", "declarationHash"],
        actual,
        candidate
      )
    case None{} None{}: {==}
    case None{} Some{_}: {==}
    case Some{_} None{}: {==}

def member_bridge(+a: Bool, +b: Bool, +c: Bool, +d: Bool) -> {
  Evidence.query_and(a, _ => Evidence.query_and(b, _ => Evidence.query_and(c, _ => d)))
  == Bool.and(a, Bool.and(b, Bool.and(c, d))) : Bool}:
  and_bridge(a, a, Evidence.query_and(b, _ => Evidence.query_and(c, _ => d)),
    Bool.and(b, Bool.and(c, d)), {==},
    and_bridge(b, b, Evidence.query_and(c, _ => d), Bool.and(c, d), {==}, and_same(c, d)))

def Laws.member_exact(artifact, actual):
  %Equal.sym(
    Maybe<&2, Value.ProductValue>,
    Evidence.field("path", artifact),
    Spec.field("path", artifact),
    field_value_exact("path", artifact)
  ): {
    Evidence.query_and(
      Evidence.absent(_),
      _ => Evidence.query_and(
        Evidence.origin_shape(Evidence.field("origin", artifact)),
        _ => Evidence.query_and(
          Evidence.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
          _ => Evidence.origin_equal(Evidence.field("origin", actual), Evidence.field("origin", artifact))
        )
      )
    )
    == Spec.member(artifact, actual)
    : Bool
  }
  %Equal.sym(
    Maybe<&2, Value.ProductValue>,
    Evidence.field("origin", artifact),
    Spec.field("origin", artifact),
    field_value_exact("origin", artifact)
  ): {
    Evidence.query_and(
      Evidence.absent(Spec.field("path", artifact)),
      _ => Evidence.query_and(
        Evidence.origin_shape(_),
        _ => Evidence.query_and(
          Evidence.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
          _ => Evidence.origin_equal(Evidence.field("origin", actual), Evidence.field("origin", artifact))
        )
      )
    )
    == Spec.member(artifact, actual)
    : Bool
  }
  %Equal.sym(
    Maybe<&2, Value.ProductValue>,
    Evidence.field("origin", actual),
    Spec.field("origin", actual),
    field_value_exact("origin", actual)
  ): {
    Evidence.query_and(
      Evidence.absent(Spec.field("path", artifact)),
      _ => Evidence.query_and(
        Evidence.origin_shape(Spec.field("origin", artifact)),
        _ => Evidence.query_and(
          Evidence.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
          _ => Evidence.origin_equal(_, Evidence.field("origin", artifact))
        )
      )
    )
    == Spec.member(artifact, actual)
    : Bool
  }
  %Equal.sym(
    Maybe<&2, Value.ProductValue>,
    Evidence.field("origin", artifact),
    Spec.field("origin", artifact),
    field_value_exact("origin", artifact)
  ): {
    Evidence.query_and(
      Evidence.absent(Spec.field("path", artifact)),
      _ => Evidence.query_and(
        Evidence.origin_shape(Spec.field("origin", artifact)),
        _ => Evidence.query_and(
          Evidence.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
          _ => Evidence.origin_equal(Spec.field("origin", actual), _)
        )
      )
    )
    == Spec.member(artifact, actual)
    : Bool
  }
  %Equal.sym(
    Bool,
    Evidence.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
    Spec.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
    Laws.matching_exact(["id", "kind", "name", "source", "sourceHash"], actual, artifact)
  ): {
    Evidence.query_and(
      Evidence.absent(Spec.field("path", artifact)),
      _ => Evidence.query_and(
        Evidence.origin_shape(Spec.field("origin", artifact)),
        _ => Evidence.query_and(
          _,
          _ => Evidence.origin_equal(Spec.field("origin", actual), Spec.field("origin", artifact))
        )
      )
    )
    == Spec.member(artifact, actual)
    : Bool
  }
  %Equal.sym(
    Bool,
    Evidence.origin_equal(Spec.field("origin", actual), Spec.field("origin", artifact)),
    Spec.origin_equal(Spec.field("origin", actual), Spec.field("origin", artifact)),
    origin_exact(Spec.field("origin", actual), Spec.field("origin", artifact))
  ): {
    Evidence.query_and(
      Evidence.absent(Spec.field("path", artifact)),
      _ => Evidence.query_and(
        Evidence.origin_shape(Spec.field("origin", artifact)),
        _ => Evidence.query_and(
          Spec.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
          _ => _
        )
      )
    )
    == Spec.member(artifact, actual)
    : Bool
  }
  member_bridge(
    Evidence.absent(Spec.field("path", artifact)),
    Evidence.origin_shape(Spec.field("origin", artifact)),
    Spec.matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
    Spec.origin_equal(Spec.field("origin", actual), Spec.field("origin", artifact))
  )

def Laws.bundled_exact(artifact, catalog):
  match catalog:
    case []: {==}
    case actual <> tail:
      or_bridge(Evidence.member(artifact, actual), Spec.member(artifact, actual),
        Evidence.bundled(artifact, tail), Spec.bundled(artifact, tail),
        Laws.member_exact(artifact, actual), Laws.bundled_exact(artifact, tail))

def path_order(
  less: Bool,
  path: String,
  +head: String,
  tail: List<&2, String>,
  actual: List<&2, String>,
  expected: List<&2, String>,
  same: {actual == expected : List<&2, String>}
) -> {
  Evidence.path_insert_result(less, path, head, tail, _ => actual)
  == Spec.path_insert_result(less, path, head, tail, expected) : List<&2, String>}:
  match less:
    case True{}: {==}
    case False{}: Equal.cong(
      List<&2, String>,
      List<&2, String>,
      rest => head <> rest,
      actual,
      expected,
      same
    )

def path_step(
  same: Bool,
  +path: String,
  +head: String,
  tail: List<&2, String>,
  actual: List<&2, String>,
  expected: List<&2, String>,
  equal: {actual == expected : List<&2, String>}
) -> {
  Evidence.path_insert_same(same, path, head, tail, _ => actual)
  == Spec.path_insert_same(same, path, head, tail, expected) : List<&2, String>}:
  match same:
    case True{}: {==}
    case False{}: path_order(
      Json.units_le(Json.utf16(path), Json.utf16(head)),
      path,
      head,
      tail,
      actual,
      expected,
      equal
    )

def Laws.path_exact(path, paths):
  match paths:
    case []: {==}
    case head <> tail:
      path_step(String.eq(path, head), path, head, tail, Evidence.path_insert(path, tail),
        Spec.path_insert(path, tail), Laws.path_exact(path, tail))

def main() -> Unit:
  Unit{}
