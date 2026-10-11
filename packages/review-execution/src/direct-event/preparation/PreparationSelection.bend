import Base
import ../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.bend as Attribution

# Preparation's selection owner consumes raw declarations and ordered analyses;
# it preserves pipeline precedence and never receives host-selected roots.
type Root is Data:
  Root{id: String, declaration: Attribution.Declaration}
type Analysis is Data:
  Analysis{id: String, kind: String, name: String}
type Contract is Data:
  TypeContract{}
  FunctionContract{}
  OtherContract{name: String}
type VerifiedSpans is Data:
  VerifiedSpans{path: String, content_hash: String, hunks: List<&2, Attribution.Hunk>}
type Input is Data:
  Input{snapshot: Attribution.Snapshot, content_hash: String, contract: Contract,
    line: Maybe<&2, Nat>, frozen: Maybe<&2, List<&2, String>>,
    verified: Maybe<&2, VerifiedSpans>, native_hunks: Maybe<&2, List<&2, Attribution.Hunk>>,
    declarations: List<&2, Root>, analyses: List<&2, Analysis>}
type Selection is Data:
  Selection{selected: List<&2, Analysis>, ambiguous: Bool,
    ambiguous_spans: List<&2, Attribution.Location>, line_roots: List<&2, String>}

def names_contain(+name: String, names: List<&2, String>) -> Bool:
  match names:
    case Nil{}: False{}
    case head <> rest: Bool.or(String.eq(name, head), names_contain(name, rest))

def analysis_name(analysis: Analysis) -> String:
  match analysis:
    case Analysis{_, _, name}: name

def named_join(hit: Bool, head: Analysis, rest: List<&2, Analysis>) -> List<&2, Analysis>:
  match hit:
    case True{}: head <> rest
    case False{}: rest

def frozen_filter(analyses: List<&2, Analysis>, +names: List<&2, String>) -> List<&2, Analysis>:
  match analyses:
    case Nil{}: Nil{}
    case +head <> rest: named_join(names_contain(analysis_name(head), names), head, frozen_filter(rest, names))

def line_matches(+line: Nat, root: Root) -> Bool:
  match root:
    case Root{_, Attribution.Declaration{_, _, _, Attribution.Location{Attribution.Position{start, _}, Attribution.Position{+end, column}}, _}}:
      Bool.and(Nat.is_ge(line, start), Bool.or(Nat.is_lt(line, end), Bool.and(Nat.is_eq(line, end), Nat.is_gt(column, 1n))))

def roots_join(hit: Bool, head: Root, rest: List<&2, Root>) -> List<&2, Root>:
  match hit:
    case True{}: head <> rest
    case False{}: rest

def matching_roots(roots: List<&2, Root>, +line: Nat) -> List<&2, Root>:
  match roots:
    case Nil{}: Nil{}
    case +head <> rest: roots_join(line_matches(line, head), head, matching_roots(rest, line))

def root_ids(roots: List<&2, Root>) -> List<&2, String>:
  match roots:
    case Nil{}: Nil{}
    case Root{id, _} <> rest: id <> root_ids(rest)

def id_matches(analysis: Analysis, id: String) -> Bool:
  match analysis:
    case Analysis{actual, _, _}: String.eq(actual, id)

def by_id(analyses: List<&2, Analysis>, +id: String) -> List<&2, Analysis>:
  match analyses:
    case Nil{}: Nil{}
    case +head <> rest: named_join(id_matches(head, id), head, by_id(rest, id))

def line_selection(+matching: List<&2, Root>, analyses: List<&2, Analysis>) -> Selection:
  match matching:
    case Nil{}: Selection{Nil{}, False{}, Nil{}, Nil{}}
    case Root{+id, _} <> Nil{}: Selection{by_id(analyses, id), False{}, Nil{}, id <> Nil{}}
    case _: Selection{Nil{}, True{}, Nil{}, root_ids(matching)}

def graph_contract(contract: Contract) -> Bool:
  match contract:
    case TypeContract{}: True{}
    case FunctionContract{}: True{}
    case _: False{}

def declarations_join(constant: Bool, declaration: Attribution.Declaration, rest: List<&2, Attribution.Declaration>) -> List<&2, Attribution.Declaration>:
  match constant:
    case True{}: rest
    case False{}: declaration <> rest

# Declaration kind access is kept as a pure owner projection.
def declaration_kind(declaration: Attribution.Declaration) -> String:
  match declaration:
    case Attribution.Declaration{_, kind, _, _, _}: kind

def root_declarations(roots: List<&2, Root>) -> List<&2, Attribution.Declaration>:
  match roots:
    case Nil{}: Nil{}
    case Root{_, +declaration} <> rest:
      declarations_join(String.eq(declaration_kind(declaration), "constant-group"), declaration, root_declarations(rest))

def key_matches(analysis: Analysis, declaration: Attribution.Declaration) -> Bool:
  match analysis declaration:
    case Analysis{_, kind, name} Attribution.Declaration{_, decl_kind, decl_name, _, _}:
      String.eq(String.append(kind, String.append(":", name)), String.append(decl_kind, String.append(":", decl_name)))

def keys_contain(+analysis: Analysis, roots: List<&2, Attribution.Declaration>) -> Bool:
  match roots:
    case Nil{}: False{}
    case head <> rest: Bool.or(key_matches(analysis, head), keys_contain(analysis, rest))

def by_keys(analyses: List<&2, Analysis>, +roots: List<&2, Attribution.Declaration>) -> List<&2, Analysis>:
  match analyses:
    case Nil{}: Nil{}
    case +head <> rest: named_join(keys_contain(head, roots), head, by_keys(rest, roots))

def attribution_result(outcome: Attribution.Outcome, analyses: List<&2, Analysis>) -> Selection:
  match outcome:
    case Attribution.InvalidFacts{}: Selection{Nil{}, True{}, Nil{}, Nil{}}
    case Attribution.Selected{Attribution.Selection{selected, +ambiguous}}:
      Selection{by_keys(analyses, selected), Bool.not(List.is_empty(&2, Attribution.Location, ambiguous)), ambiguous, Nil{}}

def verify_match(verified: VerifiedSpans, path: String, hash: String) -> Bool:
  match verified:
    case VerifiedSpans{actual_path, actual_hash, _}: Bool.and(String.eq(actual_path, path), String.eq(actual_hash, hash))

def verified_hunks(verified: VerifiedSpans) -> List<&2, Attribution.Hunk>:
  match verified:
    case VerifiedSpans{_, _, hunks}: hunks

def verified_pick(matches: Bool, verified: VerifiedSpans, native_hunks: Maybe<&2, List<&2, Attribution.Hunk>>) -> Maybe<&2, List<&2, Attribution.Hunk>>:
  match matches:
    case True{}: Some{verified_hunks(verified)}
    case False{}: native_hunks

def patch_hunks(snapshot: Attribution.Snapshot, hash: String, verified: Maybe<&2, VerifiedSpans>, native_hunks: Maybe<&2, List<&2, Attribution.Hunk>>) -> Maybe<&2, List<&2, Attribution.Hunk>>:
  match snapshot verified:
    case Attribution.Snapshot{_, True{}, _} _: Some{Nil{}}
    case Attribution.Snapshot{path, False{}, _} Some{+verified}: verified_pick(verify_match(verified, path, hash), verified, native_hunks)
    case _ None{}: native_hunks

def edited_hunks(hunks: Maybe<&2, List<&2, Attribution.Hunk>>, snapshot: Attribution.Snapshot, declarations: List<&2, Root>, analyses: List<&2, Analysis>) -> Selection:
  match hunks:
    case None{}: Selection{Nil{}, True{}, Nil{}, Nil{}}
    case Some{hunks}: attribution_result(Attribution.select(snapshot, root_declarations(declarations), hunks), analyses)

def edited_allowed(allowed: Bool, +snapshot: Attribution.Snapshot, hash: String, verified: Maybe<&2, VerifiedSpans>, native_hunks: Maybe<&2, List<&2, Attribution.Hunk>>, declarations: List<&2, Root>, analyses: List<&2, Analysis>) -> Selection:
  match allowed:
    case False{}: Selection{Nil{}, False{}, Nil{}, Nil{}}
    case True{}: edited_hunks(patch_hunks(snapshot, hash, verified, native_hunks), snapshot, declarations, analyses)

def select(input: Input) -> Selection:
  match input:
    case Input{_, _, _, Some{line}, _, _, _, declarations, analyses}: line_selection(matching_roots(declarations, line), analyses)
    case Input{_, _, _, None{}, Some{names}, _, _, _, analyses}: Selection{frozen_filter(analyses, names), False{}, Nil{}, Nil{}}
    case Input{+snapshot, hash, contract, None{}, None{}, verified, native_hunks, +declarations, analyses}:
      edited_allowed(Bool.and(graph_contract(contract), Bool.not(List.is_empty(&2, Root, declarations))), snapshot, hash, verified, native_hunks, declarations, analyses)

def main() -> Unit:
  Unit{}
