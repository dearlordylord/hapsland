import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base

# Internal stage of whole finalization, consuming the compiled-rule snapshot.
# Applicability admission stays with Canonical; this stage computes its facts
# and freezes the admitted original rule, never a host-selected input.
# Private projections of the shared producer ABI, not evidence policy.
def field_list(
  +key: String,
  fields: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>
) -> Maybe<&2, ArtifactValue.ProductValue>:
  match fields:
    case []: None{}
    case ArtifactValue.OrderedField{+candidate, value} <> tail:
      Bool.pick(
        Maybe<&2, ArtifactValue.ProductValue>,
        String.eq(key, candidate),
        Some{value},
        field_list(key, tail)
      )

def field(key: String, value: ArtifactValue.ProductValue) -> Maybe<&2, ArtifactValue.ProductValue>:
  match value:
    case ArtifactValue.ProductObject{fields}: field_list(key, fields)
    case _: None{}

def same_text(
  left: Maybe<&2, ArtifactValue.ProductValue>,
  right: Maybe<&2, ArtifactValue.ProductValue>
) -> Bool:
  match left right:
    case Some{ArtifactValue.ProductText{a}} Some{ArtifactValue.ProductText{b}}: String.eq(a, b)
    case _ _: False{}

def absent(value: Maybe<&2, ArtifactValue.ProductValue>) -> Bool:
  match value:
    case None{}: True{}
    case _: False{}

def artifact_value(value: Maybe<&2, ArtifactValue.ProductValue>) -> ArtifactValue.ProductValue:
  match value:
    case Some{value}: value
    case None{}: ArtifactValue.ProductNull{}

def items(value: Maybe<&2, ArtifactValue.ProductValue>) -> List<&2, ArtifactValue.ProductValue>:
  match value:
    case Some{ArtifactValue.ProductArray{values}}: values
    case _: []

def contains(+value: String, values: List<&2, ArtifactValue.ProductValue>) -> Bool:
  match values:
    case []: False{}
    case head <> tail:
      Bool.or(same_text(Some{ArtifactValue.ProductText{value}}, Some{head}), contains(value, tail))

def input_matches(+input: ArtifactValue.ProductValue, language: String, kind: String) -> Bool:
  Bool.and(same_text(Some{ArtifactValue.ProductText{kind}}, field("kind", input)),
    contains(language, items(field("languages", input))))

def choose_input(
  matches: Bool,
  head: ArtifactValue.ProductValue,
  rest: Maybe<&2, ArtifactValue.ProductValue>
) -> Maybe<&2, ArtifactValue.ProductValue>:
  match matches:
    case True{}: Some{head}
    case False{}: rest

def first_input(
  inputs: List<&2, ArtifactValue.ProductValue>,
  +language: String,
  +kind: String
) -> Maybe<&2, ArtifactValue.ProductValue>:
  match inputs:
    case []: None{}
    case +head <> tail:
      choose_input(input_matches(head, language, kind), head, first_input(tail, language, kind))

def language_allowed(language: String, restriction: Maybe<&2, ArtifactValue.ProductValue>) -> Bool:
  match restriction:
    case None{}: True{}
    case Some{ArtifactValue.ProductArray{values}}: contains(language, values)
    case _: False{}

def all_requirements(
  requirements: List<&2, ArtifactValue.ProductValue>,
  +available: List<&2, ArtifactValue.ProductValue>
) -> Bool:
  match requirements:
    case []: True{}
    case ArtifactValue.ProductText{value} <> tail:
      Bool.and(contains(value, available), all_requirements(tail, available))
    case _: False{}

def any_capable(
  inputs: List<&2, ArtifactValue.ProductValue>,
  +language: String,
  +kind: String,
  +available: List<&2, ArtifactValue.ProductValue>
) -> Bool:
  match inputs:
    case []: False{}
    case +head <> tail:
      Bool.or(Bool.and(input_matches(head, language, kind),
        all_requirements(items(field("requires", head)), available)),
        any_capable(tail, language, kind, available))

def target_declared(+rule: ArtifactValue.ProductValue, +language: String, kind: String) -> Bool:
  Bool.and(language_allowed(language, field("languages", rule)),
    Bool.not(absent(first_input(items(field("inputs", rule)), language, kind))))

def capabilities_available(
  +rule: ArtifactValue.ProductValue,
  +language: String,
  kind: String,
  available: List<&2, ArtifactValue.ProductValue>
) -> Bool:
  Bool.and(language_allowed(language, field("languages", rule)),
    any_capable(items(field("inputs", rule)), language, kind, available))

def type_capabilities() -> List<&2, ArtifactValue.ProductValue>:
  [
    ArtifactValue.ProductText{"root-declaration"},
    ArtifactValue.ProductText{"resolved-outbound-types"},
    ArtifactValue.ProductText{"selected-source-type-closure"}
  ]

def function_capabilities() -> List<&2, ArtifactValue.ProductValue>:
  [
    ArtifactValue.ProductText{"signature"},
    ArtifactValue.ProductText{"body"},
    ArtifactValue.ProductText{"resolved-local-calls"},
    ArtifactValue.ProductText{"resolved-outbound-types"}
  ]

def contract_capabilities(
  +contract: String,
  +partial: Bool
) -> List<&2, ArtifactValue.ProductValue>:
  Bool.pick(
    List<&2, ArtifactValue.ProductValue>,
    String.eq(contract, "direct-event/type-shape/v1"),
    Bool.pick(
      List<&2, ArtifactValue.ProductValue>,
      partial,
      [ArtifactValue.ProductText{"root-declaration"}],
      type_capabilities()
    ),
    Bool.pick(
      List<&2, ArtifactValue.ProductValue>,
      String.eq(contract, "direct-event/function/v1"),
      Bool.pick(
        List<&2, ArtifactValue.ProductValue>,
        partial,
        [ArtifactValue.ProductText{"signature"}, ArtifactValue.ProductText{"body"}],
        function_capabilities()
      ),
      []
    )
  )

def selected_join(
  selected: Bool,
  head: ArtifactValue.ProductValue,
  tail: List<&2, ArtifactValue.ProductValue>
) -> List<&2, ArtifactValue.ProductValue>:
  match selected:
    case True{}: head <> tail
    case False{}: tail

def selected_capabilities(
  standard: List<&2, ArtifactValue.ProductValue>,
  +required: List<&2, ArtifactValue.ProductValue>
) -> List<&2, ArtifactValue.ProductValue>:
  match standard:
    case []: []
    case ArtifactValue.ProductText{+name} <> tail:
      selected_join(
        contains(name, required),
        ArtifactValue.ProductText{name},
        selected_capabilities(tail, required)
      )
    case _ <> tail: selected_capabilities(tail, required)

def target_object(
  kind: String,
  contract: String,
  capabilities: List<&2, ArtifactValue.ProductValue>
) -> ArtifactValue.ProductValue:
  ArtifactValue.ProductObject{
    [
      ArtifactValue.OrderedField{"artifactKind", ArtifactValue.ProductText{kind}},
      ArtifactValue.OrderedField{"inputContract", ArtifactValue.ProductText{contract}},
      ArtifactValue.OrderedField{"capabilities", ArtifactValue.ProductArray{capabilities}}
    ]
  }

def input_target(
  +input: ArtifactValue.ProductValue,
  +contract: String
) -> Maybe<&2, ArtifactValue.ProductValue>:
  Bool.pick(
    Maybe<&2, ArtifactValue.ProductValue>,
    same_text(field("kind", input), Some{ArtifactValue.ProductText{"type"}}),
    Bool.pick(
      Maybe<&2, ArtifactValue.ProductValue>,
      String.eq(contract, "direct-event/type-shape/v1"),
      Some{
        target_object(
          "typeShape",
          contract,
          selected_capabilities(type_capabilities(), items(field("requires", input)))
        )
      },
      None{}
    ),
    Bool.pick(
      Maybe<&2, ArtifactValue.ProductValue>,
      Bool.and(
        String.eq(contract, "direct-event/function/v1"),
        same_text(field("kind", input), Some{ArtifactValue.ProductText{"function"}})
      ),
      Some{
        target_object(
          "function",
          contract,
          selected_capabilities(function_capabilities(), items(field("requires", input)))
        )
      },
      None{}
    )
  )

def selected_target(
  input: Maybe<&2, ArtifactValue.ProductValue>,
  contract: String
) -> Maybe<&2, ArtifactValue.ProductValue>:
  match input:
    case Some{input}: input_target(input, contract)
    case None{}: None{}

def copied_fields(
  keys: List<&2, String>,
  +rule: ArtifactValue.ProductValue
) -> List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
  match keys:
    case []: []
    case +key <> tail:
      ArtifactValue.OrderedField{key, artifact_value(field(key, rule))} <> copied_fields(
        tail,
        rule
      )

def frozen_target(
  target: Maybe<&2, ArtifactValue.ProductValue>,
  fields: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>
) -> ArtifactValue.ProductValue:
  match target:
    case None{}: ArtifactValue.ProductObject{fields}
    case Some{value}: ArtifactValue.ProductObject{
      List.append(
        &2,
        ArtifactValue.OrderedField<ArtifactValue.ProductValue>,
        fields,
        [ArtifactValue.OrderedField{"target", value}]
      )
    }

def freeze_rule(
  +rule: ArtifactValue.ProductValue,
  language: String,
  kind: String,
  contract: String
) -> ArtifactValue.ProductValue:
  frozen_target(
    selected_target(first_input(items(field("inputs", rule)), language, kind), contract),
    copied_fields(
      ["id", "source", "definitionDigest", "threshold", "message", "rank", "decision"],
      rule
    )
  )

def freeze_rules(
  rules: List<&2, ArtifactValue.ProductValue>,
  +language: String,
  +kind: String,
  +contract: String
) -> List<&2, ArtifactValue.ProductValue>:
  match rules:
    case []: []
    case head <> tail: freeze_rule(head, language, kind, contract) <> freeze_rules(
      tail,
      language,
      kind,
      contract
    )

def main() -> Unit:
  Unit{}
