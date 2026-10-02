import Base
import ./Random.bend as Random
import ../session-bend/Session.bend as Session

# Source-free environment facts. Production ImportGraph alone chooses traversal.
type Profile is Data:
  Profile{min_files: Nat, max_files: Nat, max_imports: Nat, max_depth: Nat, denied_percent: Nat, missing_percent: Nat, unreadable_percent: Nat, repeated_percent: Nat, cyclic_percent: Nat, unsupported_percent: Nat, deadline_step: Nat, local_work: Nat, min_source: Nat, max_source: Nat, min_tree: Nat, max_tree: Nat}
type TreeFile is Data:
  TreeFile{target: Nat, depth: Nat, allowed: Bool, source_bytes: Nat, tree_bytes: Nat, edges: List<&2, Nat>, missing: Bool, unreadable: Bool, unsupported: Bool}
type Draw is Data:
  Draw{random: U32, value: Nat}
type Chance is Data:
  Chance{random: U32, yes: Bool}
type Made is Data:
  Made{random: U32, file: TreeFile}
type Files is Data:
  Files{random: U32, files: List<&2, TreeFile>}
type Tree is Data:
  Tree{files: List<&2, TreeFile>, depth: Nat}

def profile_min_files(value: Profile) -> Nat:
  match value:
    case Profile{item, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: item

def profile_max_files(value: Profile) -> Nat:
  match value:
    case Profile{_, item, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: item

def profile_max_imports(value: Profile) -> Nat:
  match value:
    case Profile{_, _, item, _, _, _, _, _, _, _, _, _, _, _, _, _}: item

def profile_max_depth(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, item, _, _, _, _, _, _, _, _, _, _, _, _}: item

def profile_denied_percent(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, item, _, _, _, _, _, _, _, _, _, _, _}: item

def profile_missing_percent(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, item, _, _, _, _, _, _, _, _, _, _}: item

def profile_unreadable_percent(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, item, _, _, _, _, _, _, _, _, _}: item

def profile_repeated_percent(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, item, _, _, _, _, _, _, _, _}: item

def profile_cyclic_percent(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, item, _, _, _, _, _, _, _}: item

def profile_unsupported_percent(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, _, item, _, _, _, _, _, _}: item

def profile_deadline_step(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, _, _, item, _, _, _, _, _}: item

def profile_local_work(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, _, _, _, item, _, _, _, _}: item

def profile_min_source(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, _, _, _, _, item, _, _, _}: item

def profile_max_source(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, _, _, _, _, _, item, _, _}: item

def profile_min_tree(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, _, _, _, _, _, _, item, _}: item

def profile_max_tree(value: Profile) -> Nat:
  match value:
    case Profile{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, item}: item

def file_target(value: TreeFile) -> Nat:
  match value:
    case TreeFile{item, _, _, _, _, _, _, _, _}: item

def file_depth(value: TreeFile) -> Nat:
  match value:
    case TreeFile{_, item, _, _, _, _, _, _, _}: item

def file_allowed(value: TreeFile) -> Bool:
  match value:
    case TreeFile{_, _, item, _, _, _, _, _, _}: item

def file_source_bytes(value: TreeFile) -> Nat:
  match value:
    case TreeFile{_, _, _, item, _, _, _, _, _}: item

def file_tree_bytes(value: TreeFile) -> Nat:
  match value:
    case TreeFile{_, _, _, _, item, _, _, _, _}: item

def file_edges(value: TreeFile) -> List<&2, Nat>:
  match value:
    case TreeFile{_, _, _, _, _, item, _, _, _}: item

def file_missing(value: TreeFile) -> Bool:
  match value:
    case TreeFile{_, _, _, _, _, _, item, _, _}: item

def file_unreadable(value: TreeFile) -> Bool:
  match value:
    case TreeFile{_, _, _, _, _, _, _, item, _}: item

def file_unsupported(value: TreeFile) -> Bool:
  match value:
    case TreeFile{_, _, _, _, _, _, _, _, item}: item

def decimal_more(more: Bool, value: Nat, digit: U32, rest: Nat -> List<&2, U32>) -> List<&2, U32>:
  match more:
    case False{}: [digit]
    case True{}: List.append(&2, U32, rest(value), [digit])

def decimal_loop(fuel: Nat, +value: Nat) -> List<&2, U32>:
  match fuel:
    case 0n: []
    case 1n+rest: decimal_more(Nat.is_ge(value, 10n), (value / 10n : Nat), Random.word((48n + value % 10n : Nat)), next => decimal_loop(rest, next))

def decimal(value: Nat) -> List<&2, U32>:
  decimal_loop(15n, value)

def initial(seed: Nat, operation: Nat, unit: Nat) -> U32:
  Session.nonzero(Session.seed_hash(List.append(&2, U32, [105,109,112,111,114,116,45,116,114,101,101,115,58],
    List.append(&2, U32, decimal(operation), List.append(&2, U32, [58], decimal(unit)))), Random.folded(seed)))

def scaled(+word: Nat, +range: Nat) -> Nat:
  ((word / 65536n * range + word % 65536n * range / 65536n : Nat) / 65536n : Nat)

def drawn(+random: U32, min: Nat, range: Nat) -> Draw:
  Draw{random, (min + scaled(U32.to_nat(random), range) : Nat)}

def between(random: U32, +min: Nat, max: Nat) -> Draw:
  drawn(Session.random_step(random), min, (max - min + 1n : Nat))

def chance_drawn(+random: U32, percent: Nat) -> Chance:
  Chance{random, Nat.is_lt((U32.to_nat(random) * 100n : Nat), (percent * (4294967295n + 1n : Nat) : Nat))}

def chance_enabled(enabled: Bool, +random: U32, percent: Nat) -> Chance:
  match enabled:
    case False{}: Chance{random, False{}}
    case True{}: chance_drawn(Session.random_step(random), percent)

def chance(+percent: Nat, random: U32) -> Chance:
  chance_enabled(Nat.is_gt(percent, 0n), random, percent)

# The historical root skips the denial draw; other files always consume it,
# including a zero denial percentage.
def allowed(root: Bool, +random: U32, percent: Nat) -> Chance:
  match root:
    case True{}: Chance{random, False{}}
    case False{}: chance_drawn(Session.random_step(random), percent)

def made_tree(value: Draw, target: Nat, depth: Nat, allowed: Bool, source: Nat) -> Made:
  match value:
    case Draw{random, tree}: Made{random, TreeFile{target, depth, allowed, source, tree, [], False{}, False{}, False{}}}

def made_source(value: Draw, target: Nat, depth: Nat, allowed: Bool, +profile: Profile) -> Made:
  match value:
    case Draw{random, source}: made_tree(between(random, profile_min_tree(profile), profile_max_tree(profile)), target, depth, allowed, source)

def made_allowed(value: Chance, target: Nat, depth: Nat, +profile: Profile) -> Made:
  match value:
    case Chance{random, denied}: made_source(between(random, profile_min_source(profile), profile_max_source(profile)), target, depth, Bool.not(denied), profile)

def make(random: U32, +target: Nat, depth: Nat, +profile: Profile) -> Made:
  made_allowed(allowed(Nat.is_eq(target, 1n), random, profile_denied_percent(profile)), target, depth, profile)

def candidate(+file: TreeFile, +profile: Profile) -> Bool:
  Nat.is_lt(file_depth(file), profile_max_depth(profile)) && Nat.is_lt(List.length(&2, Nat, file_edges(file)), profile_max_imports(profile))

def candidates(files: List<&2, TreeFile>, +profile: Profile) -> List<&2, TreeFile>:
  match files:
    case Nil{}: []
    case +head <> tail:
      +rest = {candidates(tail, profile) : List<&2, TreeFile>}
      Bool.pick(List<&2, TreeFile>, candidate(head, profile), head <> rest, rest)

def nth(index: Nat, files: List<&2, TreeFile>) -> TreeFile:
  match index files:
    case _ Nil{}: TreeFile{0n, 0n, False{}, 0n, 0n, [], False{}, False{}, False{}}
    case 0n head <> _: head
    case 1n+rest _ <> tail: nth(rest, tail)

def connected(file: TreeFile, target: Nat) -> TreeFile:
  match file:
    case TreeFile{id, depth, allowed, source, tree, edges, missing, unreadable, unsupported}:
      TreeFile{id, depth, allowed, source, tree, List.append(&2, Nat, edges, [target]), missing, unreadable, unsupported}

def connect(files: List<&2, TreeFile>, +parent: Nat, +target: Nat) -> List<&2, TreeFile>:
  match files:
    case Nil{}: []
    case +head <> tail: Bool.pick(TreeFile, Nat.is_eq(file_target(head), parent), connected(head, target), head) <> connect(tail, parent, target)

def appended(made: Made, files: List<&2, TreeFile>) -> Files:
  match made:
    case Made{random, file}: Files{random, List.append(&2, TreeFile, files, [file])}

def chosen(draw: Draw, +parents: List<&2, TreeFile>, files: List<&2, TreeFile>, +target: Nat, +profile: Profile) -> Files:
  match draw:
    case Draw{random, index}:
      +parent = {nth(index, parents) : TreeFile}
      appended(make(random, target, (file_depth(parent) + 1n : Nat), profile), connect(files, file_target(parent), target))

def append_file(random: U32, +files: List<&2, TreeFile>, target: Nat, +profile: Profile) -> Files:
  +parents = {candidates(files, profile) : List<&2, TreeFile>}
  chosen(between(random, 0n, (List.length(&2, TreeFile, parents) - 1n : Nat)), parents, files, target, profile)

def grown(value: Files, target: Nat, profile: Profile,
    rest: U32 -> List<&2, TreeFile> -> Nat -> Profile -> Files) -> Files:
  match value:
    case Files{random, files}: rest(random, files, target, profile)

def grow(fuel: Nat, random: U32, files: List<&2, TreeFile>, +target: Nat, +profile: Profile) -> Files:
  match fuel:
    case 0n: Files{random, files}
    case 1n+rest: grown(append_file(random, files, target, profile), (target + 1n : Nat), profile, r => xs => t => p => grow(rest, r, xs, t, p))

def flagged(file: TreeFile, missing: Bool, unreadable: Bool, unsupported: Bool, edges: List<&2, Nat>) -> TreeFile:
  match file:
    case TreeFile{target, depth, allowed, source, tree, _, _, _, _}:
      TreeFile{target, depth, allowed, source, tree, edges, missing, unreadable, unsupported}

def first(edges: List<&2, Nat>) -> Nat:
  match edges:
    case Nil{}: 0n
    case head <> _: head

def cyclic(value: Chance, +file: TreeFile, missing: Bool, unreadable: Bool, unsupported: Bool, +edges: List<&2, Nat>) -> Made:
  match value:
    case Chance{random, yes}: Made{random, flagged(file, missing, unreadable, unsupported, Bool.pick(List<&2, Nat>, yes, List.append(&2, Nat, edges, [1n]), edges))}

def repeated(value: Chance, +file: TreeFile, missing: Bool, unreadable: Bool, unsupported: Bool, +profile: Profile) -> Made:
  match value:
    case Chance{random, yes}:
      +edges = {Bool.pick(List<&2, Nat>, yes, List.append(&2, Nat, file_edges(file), [first(file_edges(file))]), file_edges(file)) : List<&2, Nat>}
      cyclic(chance_enabled(Nat.is_lt(List.length(&2, Nat, edges), profile_max_imports(profile)) && Nat.is_gt(profile_cyclic_percent(profile), 0n), random, profile_cyclic_percent(profile)), file, missing, unreadable, unsupported, edges)

def unsupported(value: Chance, +file: TreeFile, missing: Bool, unreadable: Bool, +profile: Profile) -> Made:
  match value:
    case Chance{random, no_support}:
      repeated(chance_enabled(Nat.is_gt(List.length(&2, Nat, file_edges(file)), 0n) && Nat.is_lt(List.length(&2, Nat, file_edges(file)), profile_max_imports(profile)) && Nat.is_gt(profile_repeated_percent(profile), 0n), random, profile_repeated_percent(profile)), file, missing, unreadable, no_support, profile)

def unreadable(value: Chance, +file: TreeFile, missing: Bool, +profile: Profile) -> Made:
  match value:
    case Chance{random, unreadable}:
      unsupported(chance_enabled(Nat.is_gt(file_target(file), 1n) && Nat.is_gt(profile_unsupported_percent(profile), 0n), random, profile_unsupported_percent(profile)), file, missing, unreadable, profile)

def missing(value: Chance, +file: TreeFile, +profile: Profile) -> Made:
  match value:
    case Chance{random, missing}:
      unreadable(chance_enabled(Nat.is_gt(file_target(file), 1n) && Nat.is_gt(profile_unreadable_percent(profile), 0n), random, profile_unreadable_percent(profile)), file, missing, profile)

def decorate(random: U32, +file: TreeFile, +profile: Profile) -> Made:
  missing(chance_enabled(Nat.is_gt(file_target(file), 1n) && Nat.is_gt(profile_missing_percent(profile), 0n), random, profile_missing_percent(profile)), file, profile)

def decorated_tail(tail: Files, file: TreeFile) -> Files:
  match tail:
    case Files{random, files}: Files{random, file <> files}

def decorated_head(made: Made, profile: Profile,
    rest: U32 -> Profile -> Files) -> Files:
  match made:
    case Made{random, file}: decorated_tail(rest(random, profile), file)

def decorations(files: List<&2, TreeFile>, random: U32, +profile: Profile) -> Files:
  match files:
    case Nil{}: Files{random, []}
    case head <> tail: decorated_head(decorate(random, head, profile), profile, r => p => decorations(tail, r, p))

def depth(files: List<&2, TreeFile>) -> Nat:
  match files:
    case Nil{}: 0n
    case head <> tail: Nat.max(file_depth(head), depth(tail))

def finished(value: Files) -> Tree:
  match value:
    case Files{_, +files}: Tree{files, depth(files)}

def decorated(value: Files, +profile: Profile) -> Tree:
  match value:
    case Files{random, files}: finished(decorations(files, random, profile))

def rooted(value: Made, count: Nat, +profile: Profile) -> Tree:
  match value:
    case Made{random, root}: decorated(grow(count, random, [root], 2n, profile), profile)

def counted(draw: Draw, +profile: Profile) -> Tree:
  match draw:
    case Draw{random, count}: rooted(make(random, 1n, 0n, profile), (count - 1n : Nat), profile)

def generate(seed: Nat, operation: Nat, unit: Nat, +profile: Profile) -> Tree:
  counted(between(initial(seed, operation, unit), profile_min_files(profile), profile_max_files(profile)), profile)
