import Base

# Raw source-bearing selection facts for preparation. Coordinates are one-based
# UTF-16 code-unit columns, matching native parser facts and captured JS text.
type Position is Data:
  Position{line: Nat, column: Nat}
type Location is Data:
  Location{start: Position, end: Position}
type Declaration is Data:
  Declaration{path: String, kind: String, name: String, location: Location,
    selection_locations: Maybe<&2, List<&2, Location>>}
type Hunk is Data:
  Hunk{path: String, verified: Bool, location: Location}
type Snapshot is Data:
  Snapshot{path: String, addition: Bool, source: String}
type Bounds is Data:
  Bounds{start: Nat, end: Nat}
type Bounded is Data:
  Bounded{declaration: Declaration, bounds: Bounds}
type Enclosing is Data:
  Enclosing{best: Maybe<&2, Bounded>, ties: Nat}
type Selection is Data:
  Selection{selected: List<&2, Declaration>, ambiguous: List<&2, Location>}
type Outcome is Data:
  Selected{selection: Selection}
  InvalidFacts{}

# Lines are computed in Bend from captured text, including UTF-16 surrogate
# widths. No preselected roots, normalized policy ranges or counts enter here.
def char_width(char: Char) -> Nat:
  Bool.pick(Nat, U32.is_ge(Char.to_u32(char), 65536), 2n, 1n)

def utf16_length(text: String) -> Nat:
  match text:
    case SNil{}: 0n
    case SCon{char, rest}: Nat.add(char_width(char), utf16_length(rest))

def line_lengths(lines: List<&2, String>) -> List<&2, Nat>:
  match lines:
    case Nil{}: Nil{}
    case line <> rest: utf16_length(line) <> line_lengths(rest)

def segment_valid(+segment: String) -> Bool:
  Bool.and(Bool.not(String.is_empty(segment)), Bool.and(Bool.not(String.eq(segment, ".")), Bool.not(String.eq(segment, ".."))))

def segments_valid(segments: List<&2, String>) -> Bool:
  match segments:
    case Nil{}: True{}
    case head <> rest: Bool.and(segment_valid(head), segments_valid(rest))

def valid_path(+path: String) -> Bool:
  Bool.and(Bool.not(String.contains(path, "\\")), Bool.and(Bool.not(String.contains(path, "\0")),
    segments_valid(String.split(path, Char.from_u32(47)))))

def offset_column(valid: Bool, column: Nat, offset: Nat) -> Maybe<&2, Nat>:
  match valid:
    case True{}: Some{Nat.add(offset, Nat.sub(column, 1n))}
    case False{}: None{}

def offset(lines: List<&2, Nat>, line: Nat, +column: Nat, +acc: Nat) -> Maybe<&2, Nat>:
  match lines line:
    case _ 0n: None{}
    case Nil{} _: None{}
    case length <> _ 1n: offset_column(Bool.and(Nat.is_ge(column, 1n), Nat.is_le(column, Nat.add(length, 1n))), column, acc)
    case length <> rest 2n++line: offset(rest, Nat.add(line, 1n), column, Nat.add(acc, Nat.add(length, 1n)))

def range_ordered(valid: Bool, start: Nat, end: Nat) -> Maybe<&2, Bounds>:
  match valid:
    case True{}: Some{Bounds{start, end}}
    case False{}: None{}

def range_offsets(start: Maybe<&2, Nat>, end: Maybe<&2, Nat>) -> Maybe<&2, Bounds>:
  match start end:
    case Some{+start} Some{+end}: range_ordered(Nat.is_le(start, end), start, end)
    case _ _: None{}

def range(+lines: List<&2, Nat>, location: Location) -> Maybe<&2, Bounds>:
  match location:
    case Location{Position{start_line, start_column}, Position{end_line, end_column}}:
      range_offsets(offset(lines, start_line, start_column, 0n), offset(lines, end_line, end_column, 0n))

def bounds_nonempty(bounds: Bounds) -> Bool:
  match bounds:
    case Bounds{start, end}: Nat.is_lt(start, end)

def declaration_valid(+path: String, declaration: Declaration) -> Bool:
  match declaration:
    case Declaration{decl_path, _, name, _, _}: Bool.and(String.eq(path, decl_path),
      Bool.and(valid_path(path), Bool.not(String.is_empty(name))))

def bounded_checked(valid: Bool, declaration: Declaration, bounds: Maybe<&2, Bounds>) -> Maybe<&2, Bounded>:
  match valid bounds:
    case True{} Some{+bounds}: Bool.pick(Maybe<&2, Bounded>, bounds_nonempty(bounds), Some{Bounded{declaration, bounds}}, None{})
    case _ _: None{}

def bounded(+path: String, +lines: List<&2, Nat>, +declaration: Declaration) -> Maybe<&2, Bounded>:
  match declaration:
    case Declaration{_, _, _, location, _}: bounded_checked(declaration_valid(path, declaration), declaration, range(lines, location))

def bounded_join(head: Maybe<&2, Bounded>, tail: Maybe<&2, List<&2, Bounded>>) -> Maybe<&2, List<&2, Bounded>>:
  match head tail:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def bounded_all(+path: String, +lines: List<&2, Nat>, declarations: List<&2, Declaration>) -> Maybe<&2, List<&2, Bounded>>:
  match declarations:
    case Nil{}: Some{Nil{}}
    case head <> rest: bounded_join(bounded(path, lines, head), bounded_all(path, lines, rest))

def same_identity(a: Declaration, b: Declaration) -> Bool:
  match a b:
    case Declaration{_, kind_a, name_a, _, _} Declaration{_, kind_b, name_b, _, _}:
      String.eq(String.append(kind_a, String.append(":", name_a)), String.append(kind_b, String.append(":", name_b)))

def identity_count(+declaration: Declaration, roots: List<&2, Bounded>) -> Nat:
  match roots:
    case Nil{}: 0n
    case Bounded{root, _} <> rest: Nat.add(Bool.pick(Nat, same_identity(declaration, root), 1n, 0n), identity_count(declaration, rest))

def select_unique(hit: Bool, declaration: Declaration, selected: List<&2, Declaration>, location: Location, ambiguous: List<&2, Location>) -> Selection:
  match hit:
    case True{}: Selection{declaration <> selected, ambiguous}
    case False{}: Selection{selected, location <> ambiguous}

def add_join(unique: Bool, +declaration: Declaration, tail: Selection) -> Selection:
  match declaration tail:
    case Declaration{_, _, _, location, _} Selection{selected, ambiguous}: select_unique(unique, declaration, selected, location, ambiguous)

def additions(roots: List<&2, Bounded>, +all: List<&2, Bounded>) -> Selection:
  match roots:
    case Nil{}: Selection{Nil{}, Nil{}}
    case Bounded{+declaration, _} <> rest: add_join(Nat.is_eq(identity_count(declaration, all), 1n), declaration, additions(rest, all))

def width(bounds: Bounds) -> Nat:
  match bounds:
    case Bounds{start, end}: Nat.sub(end, start)

def encloses(root: Bounds, hunk: Bounds) -> Bool:
  match root hunk:
    case Bounds{start, end} Bounds{+hunk_start, +hunk_end}:
      Bool.and(Nat.is_lt(hunk_start, hunk_end), Bool.and(Nat.is_le(start, hunk_start), Nat.is_le(hunk_end, end)))

def smallest_pick(less: Bool, equal: Bool, root: Bounded, best: Bounded, ties: Nat) -> Enclosing:
  match less equal:
    case True{} _: Enclosing{Some{root}, 1n}
    case False{} True{}: Enclosing{Some{best}, Nat.add(ties, 1n)}
    case _ _: Enclosing{Some{best}, ties}

def compare_bounds(root: Bounded, best: Maybe<&2, Bounded>, ties: Nat) -> Enclosing:
  match root best:
    case +root None{}: Enclosing{Some{root}, 1n}
    case Bounded{+declaration, +bounds} Some{Bounded{+old, +old_bounds}}:
      smallest_pick(Nat.is_lt(width(bounds), width(old_bounds)), Nat.is_eq(width(bounds), width(old_bounds)),
        Bounded{declaration, bounds}, Bounded{old, old_bounds}, ties)

def enclosing_pick(hit: Bool, root: Bounded, best: Maybe<&2, Bounded>, ties: Nat) -> Enclosing:
  match hit:
    case True{}: compare_bounds(root, best, ties)
    case False{}: Enclosing{best, ties}

def enclosing(roots: List<&2, Bounded>, +hunk: Bounds, accumulator: Enclosing) -> Enclosing:
  match roots accumulator:
    case Nil{} _: accumulator
    case Con{Bounded{declaration, +bounds}, rest} Enclosing{best, ties}:
      enclosing(rest, hunk, enclosing_pick(encloses(bounds, hunk), Bounded{declaration, bounds}, best, ties))

def trimmed(bounds: Bounds, location: Location) -> Bounds:
  match bounds location:
    case Bounds{+start, +end} Location{_, Position{line, column}}:
      Bounds{start, Bool.pick(Nat, Bool.and(Nat.is_gt(end, start), Bool.and(Nat.is_gt(line, 1n), Nat.is_eq(column, 1n))), Nat.sub(end, 1n), end)}

def overlap(bounds: Maybe<&2, Bounds>, hunk: Bounds) -> Bool:
  match bounds hunk:
    case Some{Bounds{start, end}} Bounds{hunk_start, hunk_end}: Bool.and(Nat.is_lt(start, hunk_end), Nat.is_lt(hunk_start, end))
    case _ _: False{}

def defining_overlap(+lines: List<&2, Nat>, spans: List<&2, Location>, +hunk: Bounds) -> Bool:
  match spans:
    case Nil{}: False{}
    case span <> rest: Bool.or(overlap(range(lines, span), hunk), defining_overlap(lines, rest, hunk))

def defining(+lines: List<&2, Nat>, declaration: Declaration, hunk: Bounds) -> Bool:
  match declaration:
    case Declaration{_, _, _, _, None{}}: True{}
    case Declaration{_, _, _, _, Some{spans}}: defining_overlap(lines, spans, hunk)

def contains_identity(+declaration: Declaration, selected: List<&2, Declaration>) -> Bool:
  match selected:
    case Nil{}: False{}
    case head <> rest: Bool.or(same_identity(declaration, head), contains_identity(declaration, rest))

def append_selected(already: Bool, selected: List<&2, Declaration>, declaration: Declaration) -> List<&2, Declaration>:
  match already:
    case True{}: selected
    case False{}: List.append(&2, Declaration, selected, declaration <> Nil{})

def chosen_defining(hit: Bool, selection: Selection, +declaration: Declaration) -> Selection:
  match hit selection:
    case True{} Selection{+selected, ambiguous}: Selection{append_selected(contains_identity(declaration, selected), selected, declaration), ambiguous}
    case False{} _: selection

def chosen_unique(unique: Bool, +lines: List<&2, Nat>, selection: Selection, +declaration: Declaration, hunk: Bounds, location: Location) -> Selection:
  match unique selection:
    case True{} _: chosen_defining(defining(lines, declaration, hunk), selection, declaration)
    case False{} Selection{selected, ambiguous}: Selection{selected, List.append(&2, Location, ambiguous, location <> Nil{})}

def chosen(best: Maybe<&2, Bounded>, ties: Nat, +roots: List<&2, Bounded>, +lines: List<&2, Nat>, selection: Selection, hunk: Bounds, +location: Location) -> Selection:
  match best:
    case None{}: chosen_unique(False{}, lines, selection, Declaration{"", "", "", location, None{}}, hunk, location)
    case Some{Bounded{+declaration, _}}: chosen_unique(Bool.and(Nat.is_eq(ties, 1n), Nat.is_eq(identity_count(declaration, roots), 1n)), lines, selection, declaration, hunk, location)

def chosen_enclosing(result: Enclosing, roots: List<&2, Bounded>, lines: List<&2, Nat>, selection: Selection, hunk: Bounds, location: Location) -> Outcome:
  match result:
    case Enclosing{best, ties}: Selected{chosen(best, ties, roots, lines, selection, hunk, location)}

def hunk_checked(valid: Bool, +path: String, +lines: List<&2, Nat>, +roots: List<&2, Bounded>, +location: Location, bounds: Maybe<&2, Bounds>, selection: Selection) -> Outcome:
  match valid bounds:
    case True{} Some{+bounds}:
      chosen_enclosing(enclosing(roots, trimmed(bounds, location), Enclosing{None{}, 0n}), roots, lines, selection, bounds, location)
    case _ _: InvalidFacts{}

def hunk(+path: String, +lines: List<&2, Nat>, +roots: List<&2, Bounded>, value: Hunk, selection: Selection) -> Outcome:
  match value:
    case Hunk{hunk_path, verified, +location}: hunk_checked(Bool.and(verified, String.eq(path, hunk_path)), path, lines, roots, location, range(lines, location), selection)

def updates(+path: String, +lines: List<&2, Nat>, +roots: List<&2, Bounded>, hunks: List<&2, Hunk>, outcome: Outcome) -> Outcome:
  match hunks outcome:
    case Nil{} _: outcome
    case _ InvalidFacts{}: InvalidFacts{}
    case Con{head, rest} Selected{selection}: updates(path, lines, roots, rest, hunk(path, lines, roots, head, selection))

def attributed(addition: Bool, path: String, lines: List<&2, Nat>, roots: Maybe<&2, List<&2, Bounded>>, hunks: List<&2, Hunk>) -> Outcome:
  match addition roots:
    case True{} Some{+roots}: Selected{additions(roots, roots)}
    case False{} Some{roots}: updates(path, lines, roots, hunks, Selected{Selection{Nil{}, Nil{}}})
    case _ None{}: InvalidFacts{}

def select_valid(valid: Bool, snapshot: Snapshot, declarations: List<&2, Declaration>, hunks: List<&2, Hunk>) -> Outcome:
  match valid snapshot:
    case True{} Snapshot{+path, addition, source}:
      +lines = line_lengths(String.split(source, Char.from_u32(10)))
      attributed(addition, path, lines, bounded_all(path, lines, declarations), hunks)
    case False{} _: InvalidFacts{}

def select(+snapshot: Snapshot, declarations: List<&2, Declaration>, hunks: List<&2, Hunk>) -> Outcome:
  match snapshot:
    case Snapshot{path, _, _}: select_valid(valid_path(path), snapshot, declarations, hunks)

def main() -> Unit:
  Unit{}
