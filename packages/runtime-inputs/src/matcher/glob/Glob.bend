import Base

# Whole native glob dialect, over JS UTF-16 code units. Foreign callers only
# compile/test the emitted regular expressions without flags. A valid false
# engine reply is distinct from an invalid expression. Every expression must
# be validated before any path/dot rejection is accepted by the caller.
type Cut is Data:
  Cut{before: List<&2, U32>, after: List<&2, U32>, found: Bool}
type Scan is Data:
  Scan{mode: Nat, body: List<&2, U32>, groups: Nat, expansions: Nat, error: Maybe<&2, String>}
type DotStep is Data:
  DotStep{allowed: Bool, patterns: List<&2, List<&2, U32>>}
type Plan is Data:
  Invalid{reason: String}
  Prepared{canonical: List<&2, U32>, expressions: List<&2, List<&2, U32>>, matching: List<&2, List<&2, U32>>, candidate: Maybe<&2, List<&2, U32>>}
type EngineState is Data:
  EngineState{canonical: List<&2, U32>, validation: List<&2, List<&2, U32>>, matching: List<&2, List<&2, U32>>, candidate: Maybe<&2, List<&2, U32>>}
type Protocol is Data:
  CompileExpression{state: EngineState, expression: List<&2, U32>}
  TestExpression{state: EngineState, expression: List<&2, U32>, candidate: List<&2, U32>}
  Completed{canonical: List<&2, U32>, matched: Bool}
  Refused{reason: String}
type AnyProtocol is Data:
  AnyContinue{pending: List<&2, String>, path: String}
  AnyCompile{pending: List<&2, String>, path: String, state: EngineState, expression: List<&2, U32>}
  AnyTest{pending: List<&2, String>, path: String, state: EngineState, expression: List<&2, U32>, candidate: List<&2, U32>}
  AnyCompleted{matched: Bool}

def utf16_char(+code: U32, tail: List<&2, U32>, supplementary: Bool) -> List<&2, U32>:
  match supplementary:
    case False{}: code <> tail
    case True{}:
      (55296 + ((code - 65536 : U32) / 1024 : U32) : U32) <>
        (56320 + ((code - 65536 : U32) % 1024 : U32) : U32) <> tail

def utf16(value: String) -> List<&2, U32>:
  match value:
    case SNil{}: []
    case SCon{character, tail}:
      +code = Char.to_u32(character)
      utf16_char(code, utf16(tail), U32.is_gt(code, 65535))

def units_equal(left: List<&2, U32>, right: List<&2, U32>) -> Bool:
  match left right:
    case Nil{} Nil{}: True{}
    case Con{a, tail_a} Con{b, tail_b}: Bool.and(U32.is_eq(a, b), units_equal(tail_a, tail_b))
    case _ _: False{}

def contains(+unit: U32, values: List<&2, U32>) -> Bool:
  match values:
    case []: False{}
    case head <> tail: Bool.or(U32.is_eq(unit, head), contains(unit, tail))

def slash(units: List<&2, U32>) -> List<&2, U32>:
  match units:
    case []: []
    case +head <> tail: Bool.pick(U32, U32.is_eq(head, 92), 47, head) <> slash(tail)

def cut_cons(head: U32, cut: Cut) -> Cut:
  match cut:
    case Cut{before, after, found}: Cut{head <> before, after, found}

def cut_at(+delimiter: U32, units: List<&2, U32>) -> Cut:
  match units:
    case []: Cut{[], [], False{}}
    case +head <> +tail:
      Bool.pick(Cut, U32.is_eq(head, delimiter), Cut{[], tail, True{}}, cut_cons(head, cut_at(delimiter, tail)))

def split_cons(delimiter: U32, +head: U32, pieces: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match pieces:
    case []: [[head]]
    case +first <> +tail:
      Bool.pick(List<&2, List<&2, U32>>, U32.is_eq(head, delimiter), [] <> first <> tail, (head <> first) <> tail)

def split(+delimiter: U32, units: List<&2, U32>) -> List<&2, List<&2, U32>>:
  match units:
    case []: [[]]
    case head <> tail: split_cons(delimiter, head, split(delimiter, tail))

def nonempty(pieces: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match pieces:
    case []: []
    case [] <> tail: nonempty(tail)
    case head <> tail: head <> nonempty(tail)

def traversal(pieces: List<&2, List<&2, U32>>) -> Bool:
  match pieces:
    case []: False{}
    case head <> tail: Bool.or(units_equal(head, [46, 46]), traversal(tail))

def join_tail(pieces: List<&2, List<&2, U32>>) -> List<&2, U32>:
  match pieces:
    case []: []
    case head <> tail: 47 <> List.append(&2, U32, head, join_tail(tail))

def join_path(pieces: List<&2, List<&2, U32>>) -> List<&2, U32>:
  match pieces:
    case []: [46]
    case head <> tail: List.append(&2, U32, head, join_tail(tail))

def absolute(units: List<&2, U32>) -> Bool:
  match units:
    case 47 <> _: True{}
    case +letter <> 58 <> 47 <> _:
      Bool.or(Bool.and(U32.is_ge(letter, 65), U32.is_le(letter, 90)), Bool.and(U32.is_ge(letter, 97), U32.is_le(letter, 122)))
    case _: False{}

def path_normalized(+units: List<&2, U32>) -> Maybe<&2, List<&2, U32>>:
  Bool.pick(Maybe<&2, List<&2, U32>>, Bool.or(contains(0, units), Bool.or(absolute(units), traversal(split(47, units)))),
    None{}, Some{join_path(nonempty(split(47, units)))})

def pattern_canonical(units: List<&2, U32>) -> List<&2, U32>:
  match units:
    case 46 <> []: []
    case 46 <> 47 <> tail: tail
    case _: units

def pattern_shape_error(+original: List<&2, U32>, +normalized: List<&2, U32>) -> Maybe<&2, String>:
  match original:
    case []: Some{"glob pattern is empty"}
    case 33 <> _: Some{"negated re-inclusion patterns are not supported"}
    case _:
      Bool.pick(Maybe<&2, String>, contains(0, original), Some{"glob pattern contains NUL"},
        Bool.pick(Maybe<&2, String>, absolute(normalized), Some{"glob patterns must be repository-relative"},
          Bool.pick(Maybe<&2, String>, traversal(split(47, normalized)), Some{"glob patterns cannot traverse the repository root"}, None{})))

def pattern_error(+original: List<&2, U32>, normalized: List<&2, U32>) -> Maybe<&2, String>:
  Bool.pick(Maybe<&2, String>, contains(0, original), Some{"glob pattern contains NUL"}, pattern_shape_error(original, normalized))

def class_content(body: List<&2, U32>) -> List<&2, U32>:
  match body:
    case 33 <> tail: tail
    case 94 <> tail: tail
    case _: body

def reversed_range(units: List<&2, U32>) -> Bool:
  match units:
    case +left <> 45 <> +right <> +tail:
      Bool.or(Bool.and(Bool.not(U32.is_eq(right, 45)), U32.is_gt(left, right)), reversed_range(45 <> right <> tail))
    case _ <> tail: reversed_range(tail)
    case []: False{}

def class_error(+content: List<&2, U32>) -> Maybe<&2, String>:
  Bool.pick(Maybe<&2, String>, Bool.or(List.is_empty(&2, U32, content), contains(91, content)),
    Some{"glob character class is empty or nested"},
    Bool.pick(Maybe<&2, String>, reversed_range(content), Some{"glob character class range is reversed"}, None{}))

def choices_valid(choices: List<&2, List<&2, U32>>) -> Bool:
  match choices:
    case []: True{}
    case +head <> tail: Bool.and(Bool.not(Bool.or(List.is_empty(&2, U32, head), contains(123, head))), choices_valid(tail))

def braces_error(+choices: List<&2, List<&2, U32>>, +groups: Nat, +expansions: Nat) -> Maybe<&2, String>:
  +count = List.length(&2, List<&2, U32>, choices)
  Bool.pick(Maybe<&2, String>, Bool.or(Nat.is_lt(count, 2n), Bool.not(choices_valid(choices))),
    Some{"glob brace alternative must contain non-empty choices"},
    Bool.pick(Maybe<&2, String>, Nat.is_gt(groups, 8n), Some{"glob pattern exceeds the 8-group limit"},
      Bool.pick(Maybe<&2, String>, Nat.is_gt(count, 8n), Some{"glob brace alternatives exceed the 8-choice limit"},
        Bool.pick(Maybe<&2, String>, Nat.is_gt(Nat.mul(expansions, count), 256n), Some{"glob brace expansion exceeds the 256-expansion limit"}, None{}))))

def scan_normal(unit: U32, groups: Nat, expansions: Nat) -> Scan:
  match unit:
    case 91: Scan{1n, [], groups, expansions, None{}}
    case 123: Scan{2n, [], groups, expansions, None{}}
    case 93: Scan{0n, [], groups, expansions, Some{"glob character class closes without opening"}}
    case 125: Scan{0n, [], groups, expansions, Some{"glob brace alternative closes without opening"}}
    case _: Scan{0n, [], groups, expansions, None{}}

def scan_class(close: Bool, unit: U32, +body: List<&2, U32>, groups: Nat, expansions: Nat) -> Scan:
  match close:
    case True{}: Scan{0n, [], groups, expansions, class_error(class_content(List.reverse(&2, U32, body)))}
    case False{}: Scan{1n, unit <> body, groups, expansions, None{}}

def scan_brace(close: Bool, unit: U32, +body: List<&2, U32>, +groups: Nat, +expansions: Nat) -> Scan:
  match close:
    case True{}:
      +choices = split(44, List.reverse(&2, U32, body))
      Scan{0n, [], Nat.add(1n, groups), Nat.mul(expansions, List.length(&2, List<&2, U32>, choices)), braces_error(choices, Nat.add(1n, groups), expansions)}
    case False{}: Scan{2n, unit <> body, groups, expansions, None{}}

def scan_unit(+unit: U32, scan: Scan) -> Scan:
  match scan:
    case Scan{_, _, groups, expansions, Some{error}}: Scan{0n, [], groups, expansions, Some{error}}
    case Scan{0n, _, groups, expansions, None{}}: scan_normal(unit, groups, expansions)
    case Scan{1n, body, groups, expansions, None{}}: scan_class(U32.is_eq(unit, 93), unit, body, groups, expansions)
    case Scan{_, body, groups, expansions, None{}}: scan_brace(U32.is_eq(unit, 125), unit, body, groups, expansions)

def scan_finish(scan: Scan) -> Maybe<&2, String>:
  match scan:
    case Scan{_, _, _, _, Some{error}}: Some{error}
    case Scan{0n, _, _, _, None{}}: None{}
    case Scan{1n, _, _, _, None{}}: Some{"glob character class is not closed"}
    case _: Some{"glob brace alternative is not closed"}

def scan_structure(units: List<&2, U32>, scan: Scan) -> Maybe<&2, String>:
  match units:
    case []: scan_finish(scan)
    case head <> tail: scan_structure(tail, scan_unit(head, scan))

def brace_count(units: List<&2, U32>) -> Nat:
  match units:
    case []: 0n
    case +head <> tail: Nat.add(Bool.pick(Nat, U32.is_eq(head, 123), 1n, 0n), brace_count(tail))

def expand_choices(choices: List<&2, List<&2, U32>>, +prefix: List<&2, U32>, +suffix: List<&2, U32>) -> List<&2, List<&2, U32>>:
  match choices:
    case []: []
    case head <> tail:
      List.append(&2, U32, prefix, List.append(&2, U32, head, suffix)) <> expand_choices(tail, prefix, suffix)

def expansion_close(cut: Cut, prefix: List<&2, U32>, +original: List<&2, U32>) -> List<&2, List<&2, U32>>:
  match cut:
    case Cut{_, _, False{}}: [original]
    case Cut{body, suffix, True{}}:
      +choices = nonempty(split(44, body))
      Bool.pick(List<&2, List<&2, U32>>, List.is_empty(&2, List<&2, U32>, choices), [original], expand_choices(choices, prefix, suffix))

def expansion_open(cut: Cut, original: List<&2, U32>) -> List<&2, List<&2, U32>>:
  match cut:
    case Cut{_, _, False{}}: [original]
    case Cut{prefix, suffix, True{}}: expansion_close(cut_at(125, suffix), prefix, original)

def expand_once(patterns: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match patterns:
    case []: []
    case +head <> tail:
      List.append(&2, List<&2, U32>, expansion_open(cut_at(123, head), head), expand_once(tail))

# Each native expansion removes its first opening brace, including braces
# inside classes; stable flattening preserves native branch order.
def expand(fuel: Nat, patterns: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match fuel:
    case 0n: patterns
    case 1n++rest: expand(rest, expand_once(patterns))

def regex_literal(+unit: U32) -> List<&2, U32>:
  Bool.pick(List<&2, U32>, contains(unit, [124, 92, 123, 125, 40, 41, 91, 93, 94, 36, 43, 63, 46]), [92, unit], [unit])

def class_regex(body: List<&2, U32>) -> List<&2, U32>:
  match body:
    case 33 <> tail: List.append(&2, U32, [91, 94], List.append(&2, U32, tail, [93]))
    case 94 <> tail: List.append(&2, U32, [91, 94], List.append(&2, U32, tail, [93]))
    case _: 91 <> List.append(&2, U32, body, [93])

def segment_class(cut: Cut, original: List<&2, U32>, next: List<&2, U32> -> List<&2, U32>) -> List<&2, U32>:
  match cut:
    case Cut{[], _, _}: List.append(&2, U32, [92, 91], next(original))
    case Cut{body, tail, True{}}: List.append(&2, U32, class_regex(body), next(tail))
    case _: List.append(&2, U32, [92, 91], next(original))

def segment_regex(fuel: Nat, units: List<&2, U32>) -> List<&2, U32>:
  match fuel units:
    case 0n _: []
    case _ Nil{}: []
    case 1n++rest Con{42, tail}: List.append(&2, U32, utf16("[^/]*"), segment_regex(rest, tail))
    case 1n++rest Con{63, tail}: List.append(&2, U32, utf16("[^/]"), segment_regex(rest, tail))
    case 1n++rest Con{91, +tail}: segment_class(cut_at(93, tail), tail, value => segment_regex(rest, value))
    case 1n++rest Con{head, tail}: List.append(&2, U32, regex_literal(head), segment_regex(rest, tail))

def segment_expression(globstar: Bool, last: Bool, +segment: List<&2, U32>) -> List<&2, U32>:
  match globstar:
    case True{}: Bool.pick(List<&2, U32>, last, utf16(".*"), utf16("(?:[^/]+/)*"))
    case False{}: segment_regex(List.length(&2, U32, segment), segment)

def expression_parts(segments: List<&2, List<&2, U32>>, first: Bool, previous_globstar: Bool) -> List<&2, U32>:
  match segments:
    case []: [36]
    case +head <> +tail:
      +globstar = units_equal(head, [42, 42])
      List.append(&2, U32, Bool.pick(List<&2, U32>, Bool.or(first, previous_globstar), [], [47]),
        List.append(&2, U32, segment_expression(globstar, List.is_empty(&2, List<&2, U32>, tail), head), expression_parts(tail, False{}, globstar)))

def expression(pattern: List<&2, U32>) -> List<&2, U32>:
  94 <> expression_parts(split(47, pattern), True{}, False{})

def starts_dot(segment: List<&2, U32>) -> Bool:
  match segment:
    case 46 <> _: True{}
    case _: False{}

def skip_stars(patterns: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match patterns:
    case []: []
    case +head <> +tail:
      Bool.pick(List<&2, List<&2, U32>>, units_equal(head, [42, 42]), skip_stars(tail), head <> tail)

def dot_hidden(patterns: List<&2, List<&2, U32>>) -> DotStep:
  match patterns:
    case []: DotStep{False{}, []}
    case head <> tail: DotStep{starts_dot(head), tail}

def dot_plain(patterns: List<&2, List<&2, U32>>) -> DotStep:
  match patterns:
    case []: DotStep{True{}, []}
    case +head <> +tail:
      DotStep{True{}, Bool.pick(List<&2, List<&2, U32>>, units_equal(head, [42, 42]), head <> tail, tail)}

def dot_step(hidden: Bool, +patterns: List<&2, List<&2, U32>>) -> DotStep:
  match hidden:
    case True{}: dot_hidden(skip_stars(patterns))
    case False{}: dot_plain(patterns)

def dot_continue(step: DotStep, next: List<&2, List<&2, U32>> -> Bool) -> Bool:
  match step:
    case DotStep{allowed, patterns}: Bool.and(allowed, next(patterns))

def dot_paths(paths: List<&2, List<&2, U32>>, patterns: List<&2, List<&2, U32>>) -> Bool:
  match paths:
    case []: True{}
    case head <> tail: dot_continue(dot_step(starts_dot(head), patterns), rest => dot_paths(tail, rest))

def expressions(expanded: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match expanded:
    case []: []
    case head <> tail: expression(head) <> expressions(tail)

def matching_join(allowed: Bool, expression: List<&2, U32>, tail: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match allowed:
    case True{}: expression <> tail
    case False{}: tail

def matching(expanded: List<&2, List<&2, U32>>, +path: List<&2, List<&2, U32>>) -> List<&2, List<&2, U32>>:
  match expanded:
    case []: []
    case +head <> tail: matching_join(dot_paths(path, split(47, head)), expression(head), matching(tail, path))

def prepared_path(path: Maybe<&2, List<&2, U32>>, canonical: List<&2, U32>, +expanded: List<&2, List<&2, U32>>) -> Plan:
  match path:
    case None{}: Prepared{canonical, expressions(expanded), [], None{}}
    case Some{+path}:
      Prepared{canonical, expressions(expanded), matching(expanded, split(47, path)), Some{Bool.pick(List<&2, U32>, units_equal(path, [46]), [], path)}}

def prepared(error: Maybe<&2, String>, +canonical: List<&2, U32>, path: String) -> Plan:
  match error:
    case Some{reason}: Invalid{reason}
    case None{}: prepared_path(path_normalized(slash(utf16(path))), canonical, expand(brace_count(canonical), [canonical]))

def canonical_checked(error: Maybe<&2, String>, +canonical: List<&2, U32>, path: String) -> Plan:
  match error:
    case Some{reason}: Invalid{reason}
    case None{}:
      prepared(Bool.pick(Maybe<&2, String>, Nat.is_gt(List.length(&2, U32, canonical), 1024n),
        Some{"glob pattern exceeds the 1024-character limit"}, scan_structure(canonical, Scan{0n, [], 0n, 1n, None{}})), canonical, path)

def initial_units(+original: List<&2, U32>, path: String) -> Plan:
  +normalized = slash(original)
  canonical_checked(pattern_error(original, normalized), pattern_canonical(normalized), path)

def prepare(pattern: String, path: String) -> Plan:
  initial_units(utf16(pattern), path)

def test_request(state: EngineState) -> Protocol:
  match state:
    case EngineState{canonical, _, [], _}: Completed{canonical, False{}}
    case EngineState{canonical, _, _, None{}}: Completed{canonical, False{}}
    case EngineState{canonical, _, expression <> rest, Some{+candidate}}:
      TestExpression{EngineState{canonical, [], rest, Some{candidate}}, expression, candidate}

def compile_request(state: EngineState) -> Protocol:
  match state:
    case EngineState{canonical, [], matching, candidate}: test_request(EngineState{canonical, [], matching, candidate})
    case EngineState{canonical, expression <> rest, matching, candidate}:
      CompileExpression{EngineState{canonical, rest, matching, candidate}, expression}

def plan_protocol(plan: Plan) -> Protocol:
  match plan:
    case Invalid{reason}: Refused{reason}
    case Prepared{canonical, validation, matching, candidate}: compile_request(EngineState{canonical, validation, matching, candidate})

def start(pattern: String, path: String) -> Protocol:
  plan_protocol(prepare(pattern, path))

def compile_returned(valid: Bool, state: EngineState) -> Protocol:
  match valid:
    case False{}: Refused{"glob pattern contains invalid regular-expression syntax"}
    case True{}: compile_request(state)

def match_returned(valid: Bool, matched: Bool, state: EngineState) -> Protocol:
  match valid matched state:
    case False{} _ EngineState{canonical, _, _, _}: Completed{canonical, False{}}
    case True{} True{} EngineState{canonical, _, _, _}: Completed{canonical, True{}}
    case True{} False{} _: test_request(state)

def any_wrap(step: Protocol, pending: List<&2, String>, path: String) -> AnyProtocol:
  match step:
    case Refused{_}: AnyContinue{pending, path}
    case Completed{_, True{}}: AnyCompleted{True{}}
    case Completed{_, False{}}: AnyContinue{pending, path}
    case CompileExpression{state, expression}: AnyCompile{pending, path, state, expression}
    case TestExpression{state, expression, candidate}: AnyTest{pending, path, state, expression, candidate}

def any_advance(patterns: List<&2, String>, +path: String) -> AnyProtocol:
  match patterns:
    case []: AnyCompleted{False{}}
    case pattern <> tail: any_wrap(start(pattern, path), tail, path)

def any_start(patterns: List<&2, String>, path: String) -> AnyProtocol:
  AnyContinue{patterns, path}

def any_compile_returned(valid: Bool, state: EngineState, pending: List<&2, String>, path: String) -> AnyProtocol:
  any_wrap(compile_returned(valid, state), pending, path)

def any_match_returned(valid: Bool, matched: Bool, state: EngineState, pending: List<&2, String>, path: String) -> AnyProtocol:
  any_wrap(match_returned(valid, matched, state), pending, path)

def main() -> Unit:
  Unit{}
