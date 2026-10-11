import Base
import ../Types.bend as T
import ../traversal/core.bend as Local
import ./Input.bend as Input

# Complete package inference over producer-valid ordered single-file facts.
# Positional members preserve native object identity; no package policy is foreign.
type Inferred is Data:
  LocalType{name: String}
  QualifiedType{name: String, +source_path: String}
type Member is Data:
  Member{
    id: Nat,
    +file: Nat,
    +group: Nat,
    +name: String,
    +type_name: Maybe<&2, String>,
    +expression: Maybe<&2, Nat>,
    +known: List<&2, Inferred>
  }
type Group is Data:
  Group{id: Nat, +file: Nat, +declaration: T.FactDeclaration, +names: List<&2, String>}
type Declaration is Data:
  Declaration{value: T.FactDeclaration, +location: Maybe<&2, T.GoSourceLocation>}
type ConstantTypes is Data:
  ConstantTypes{name: String, +values: List<&2, Inferred>}
type PackageResult is Data:
  Refused{}
  PackageFacts{
    declarations: List<&2, Declaration>,
    +discovery_work: Nat,
    +constant_types: List<&2, ConstantTypes>
  }
type Environment is Data:
  Environment{
    files: List<&2, T.GoFileSyntax>,
    +groups: List<&2, Group>,
    +bindings: List<&2, String>,
    +types: List<&2, String>,
    +spellings: List<&2, Input.Spelling>
  }
type State is Data:
  State{work: Nat, +limit: Nat, +valid: Bool, +members: List<&2, Member>, +changed: Bool}
type Job is Data:
  Visit{node: Nat}
  Target{node: Maybe<&2, Nat>, +arguments: Maybe<&2, Nat>}
  Alias{name: String, +seen: List<&2, String>, +origin: Maybe<&2, Nat>}
type Evaluation is Data:
  Evaluation{state: State, +values: List<&2, Inferred>}

def contains( +items: List<&2, String>, +name: String) -> Bool:
  match items:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, name), contains(tail, name))

def add_name(+items: List<&2, String>, +name: String) -> List<&2, String>:
  Bool.pick(
    List<&2, String>,
    contains(items, name),
    items,
    List.append(&2, String, items, name <> [])
  )

def inferred_eq( +a: Inferred, +b: Inferred) -> Bool:
  match a b:
    case LocalType{ +x} LocalType{ +y}: String.eq(x, y)
    case QualifiedType{ +x, +p} QualifiedType{ +y, +q}: Bool.and(String.eq(x, y), String.eq(p, q))
    case _ _: False{}

def inferred_has( +items: List<&2, Inferred>, +value: Inferred) -> Bool:
  match items:
    case []: False{}
    case head <> tail: Bool.or(inferred_eq(head, value), inferred_has(tail, value))

def union( +items: List<&2, Inferred>, +acc: List<&2, Inferred>) -> List<&2, Inferred>:
  match items:
    case []: acc
    case +head <> tail: union(
      tail,
      Bool.pick(
        List<&2, Inferred>,
        inferred_has(acc, head),
        acc,
        List.append(&2, Inferred, acc, head <> [])
      )
    )

def declaration_name( +value: T.FactDeclaration) -> String:
  match value:
    case T.FactDeclaration{ +key, _, _, _}: key

def references( +value: T.FactDeclaration) -> List<&2, T.FactReference>:
  match value:
    case T.FactDeclaration{_, _, +refs, _}: refs

def file_path( +value: T.GoFileSyntax) -> String:
  match value:
    case T.GoFileSyntax{ +path, _, _, _, _, _, _, _, _, _, _, _, _}: path

def file_imported( +value: T.GoFileSyntax) -> List<&2, String>:
  match value:
    case T.GoFileSyntax{_, _, _, _, _, _, _, _, _, +names, _, _, _}: names

def file_at( +items: List<&2, T.GoFileSyntax>, +index: Nat) -> Maybe<&2, T.GoFileSyntax>:
  match items index:
    case [] _: None{}
    case head <> _ 0n: Some{head}
    case _ <> tail 1n++pred: file_at(tail, pred)

def path_some( +value: Maybe<&2, T.GoFileSyntax>) -> String:
  match value:
    case None{}: ""
    case Some{ +file}: file_path(file)

def path_at( +files: List<&2, T.GoFileSyntax>, +index: Nat) -> String:
  path_some(file_at(files, index))

def imported_some( +value: Maybe<&2, T.GoFileSyntax>) -> List<&2, String>:
  match value:
    case None{}: []
    case Some{ +file}: file_imported(file)

def imported( +env: Environment, +file: Nat) -> List<&2, String>:
  match env:
    case Environment{ +files, _, _, _, _}: imported_some(file_at(files, file))

def local_type( +env: Environment, +name: String) -> Bool:
  match env:
    case Environment{_, _, _, +types, _}: contains(types, name)

def package_name( +env: Environment, +name: String) -> Bool:
  match env:
    case Environment{_, _, +bindings, _, _}: contains(bindings, name)

def qualified( +env: Environment, +name: String) -> Bool:
  match env:
    case Environment{_, _, _, _, +spellings}: Input.qualified(spellings, name)

def qualified_value( +env: Environment, +file: Nat, +name: String) -> Inferred:
  match env:
    case Environment{ +files, _, _, _, _}: QualifiedType{name, path_at(files, file)}

def charge( +state: State) -> State:
  match state:
    case State{+work, +limit, +valid, +members, +changed}:
      State{Nat.add(work, 1n), limit, Bool.and(valid, Nat.is_lt(work, limit)), members, changed}

def valid( +state: State) -> Bool:
  match state:
    case State{_, _, +valid, _, _}: valid

def members( +state: State) -> List<&2, Member>:
  match state:
    case State{_, _, _, +members, _}: members

def known_by_name(
  +items: List<&2, Member>,
  +name: String,
  +acc: List<&2, Inferred>
) -> List<&2, Inferred>:
  match items:
    case []: acc
    case Member{_, _, _, +key, _, _, +values} <> tail:
      known_by_name(
        tail,
        name,
        Bool.pick(
          List<&2, Inferred>,
          Bool.and(String.eq(key, name), Bool.not(String.eq(name, "_"))),
          values,
          acc
        )
      )

def node_choose(
  +row: T.GoSyntaxNode,
  +fallback: Maybe<&2, T.GoSyntaxNode>,
  +wanted: Nat
) -> Maybe<&2, T.GoSyntaxNode>:
  match row:
    case T.GoSyntaxNode{ +id, _, _, _, _, _, _}: Bool.pick(
      Maybe<&2, T.GoSyntaxNode>,
      Nat.is_eq(id, wanted),
      Some{row},
      fallback
    )

def node_at( +rows: List<&2, T.GoSyntaxNode>, +wanted: Nat) -> Maybe<&2, T.GoSyntaxNode>:
  match rows:
    case []: None{}
    case +row <> tail: node_choose(row, node_at(tail, wanted), wanted)

def node_in_file( +file: Maybe<&2, T.GoFileSyntax>, +id: Nat) -> Maybe<&2, T.GoSyntaxNode>:
  match file:
    case Some{T.GoFileSyntax{_, _, _, _, _, _, _, _, _, _, _, _, +rows}}: node_at(rows, id)
    case None{}: None{}

def node( +env: Environment, +file: Nat, +id: Nat) -> Maybe<&2, T.GoSyntaxNode>:
  match env:
    case Environment{ +files, _, _, _, _}: node_in_file(file_at(files, file), id)

def field( +fields: List<&2, T.SyntaxField>, +wanted: String) -> Maybe<&2, Nat>:
  match fields:
    case []: None{}
    case T.SyntaxField{ +key, +id} <> tail: Bool.pick(
      Maybe<&2, Nat>,
      String.eq(key, wanted),
      Some{id},
      field(tail, wanted)
    )

def first( +items: List<&2, Nat>) -> Maybe<&2, Nat>:
  match items:
    case []: None{}
    case head <> _: Some{head}

def node_text( +value: Maybe<&2, T.GoSyntaxNode>) -> String:
  match value:
    case None{}: ""
    case Some{T.GoSyntaxNode{_, _, +text, _, _, _, _}}: text

def maybe_node( +env: Environment, +file: Nat, +id: Maybe<&2, Nat>) -> Maybe<&2, T.GoSyntaxNode>:
  match id:
    case None{}: None{}
    case Some{ +value}: node(env, file, value)

def alias_in(
  +items: List<&2, T.GoAlias>,
  +wanted: String,
  +acc: Maybe<&2, String>
) -> Maybe<&2, String>:
  match items:
    case []: acc
    case T.GoAlias{ +name, +value} <> tail:
      alias_in(
        tail,
        wanted,
        Bool.pick(Maybe<&2, String>, String.eq(name, wanted), Some{value}, acc)
      )

type AliasValue is Data:
  AliasValue{value: String, +file: Nat}

def alias_found(
  +found: Maybe<&2, String>,
  +file: Nat,
  +previous: Maybe<&2, AliasValue>
) -> Maybe<&2, AliasValue>:
  match found:
    case None{}: previous
    case Some{ +value}: Some{AliasValue{value, file}}

def alias_file( +file: T.GoFileSyntax, +name: String) -> Maybe<&2, String>:
  match file:
    case T.GoFileSyntax{_, _, _, _, _, _, +aliases, _, _, _, _, _, _}: alias_in(
      aliases,
      name,
      None{}
    )

def aliases(
  +files: List<&2, T.GoFileSyntax>,
  +index: Nat,
  +name: String,
  +acc: Maybe<&2, AliasValue>
) -> Maybe<&2, AliasValue>:
  match files:
    case []: acc
    case head <> tail: aliases(
      tail,
      Nat.add(index, 1n),
      name,
      alias_found(alias_file(head, name), index, acc)
    )

def alias( +env: Environment, +name: String) -> Maybe<&2, AliasValue>:
  match env:
    case Environment{ +files, _, _, _, _}: aliases(files, 0n, name, None{})

type Frame is Data:
  Frame{jobs: List<&2, Job>, +state: State, +values: List<&2, Inferred>}

def push( +id: Maybe<&2, Nat>, +jobs: List<&2, Job>) -> List<&2, Job>:
  match id:
    case None{}: jobs
    case Some{ +value}: Visit{value} <> jobs

def push_all( +ids: List<&2, Nat>, +jobs: List<&2, Job>) -> List<&2, Job>:
  match ids:
    case []: jobs
    case head <> tail: Visit{head} <> push_all(tail, jobs)

def arguments( +value: Maybe<&2, T.GoSyntaxNode>, +jobs: List<&2, Job>) -> List<&2, Job>:
  match value:
    case None{}: jobs
    case Some{T.GoSyntaxNode{_, _, _, _, _, +children, _}}: push_all(children, jobs)

def append_values(
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>,
  +added: List<&2, Inferred>
) -> Frame:
  Frame{jobs, state, List.append(&2, Inferred, values, added)}

def alias_continue(
  +found: Maybe<&2, AliasValue>,
  +seen: List<&2, String>,
  +jobs: List<&2, Job>
) -> List<&2, Job>:
  match found:
    case None{}: jobs
    case Some{AliasValue{ +name, +file}}: Alias{name, seen, Some{file}} <> jobs

def alias_endpoint(
  +origin: Maybe<&2, Nat>,
  +env: Environment,
  +name: String
) -> List<&2, Inferred>:
  match origin:
    case None{}: []
    case Some{ +file}: Bool.pick(
      List<&2, Inferred>,
      qualified(env, name),
      qualified_value(env, file, name) <> [],
      []
    )

def alias_step(
  +continue: Bool,
  +env: Environment,
  +name: String,
  +seen: List<&2, String>,
  +origin: Maybe<&2, Nat>,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match continue:
    case True{}: append_values(
      alias_continue(alias(env, name), name <> seen, jobs),
      charge(state),
      values,
      LocalType{name} <> []
    )
    case False{}: append_values(jobs, state, values, alias_endpoint(origin, env, name))

def target_name(
  +value: Maybe<&2, T.GoSyntaxNode>,
  +env: Environment,
  +file: Nat
) -> Maybe<&2, String>:
  match value:
    case None{}: None{}
    case Some{T.GoSyntaxNode{_, +kind, +text, _, _, +children, _}}:
      Bool.pick(
        Maybe<&2, String>,
        contains(
          "identifier" <> "type_identifier" <> "qualified_type" <> "selector_expression" <> [],
          kind
        ),
        Some{text},
        Bool.pick(
          Maybe<&2, String>,
          contains("type_instantiation_expression" <> "generic_type" <> [], kind),
          Some{node_text(maybe_node(env, file, first(children)))},
          None{}
        )
      )

def target_dispatch(
  +imported: Bool,
  +is_qualified: Bool,
  +is_local: Bool,
  +is_minmax: Bool,
  +env: Environment,
  +file: Nat,
  +name: String,
  +args: Maybe<&2, Nat>,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match imported is_qualified is_local is_minmax:
    case True{} _ _ _: Frame{jobs, state, values}
    case False{} True{} _ _: append_values(
      jobs,
      state,
      values,
      qualified_value(env, file, name) <> []
    )
    case False{} False{} True{} _: Frame{Alias{name, [], None{}} <> jobs, state, values}
    case False{} False{} False{} True{}: Frame{
      arguments(maybe_node(env, file, args), jobs),
      state,
      values
    }
    case _ _ _ _: Frame{jobs, state, values}

def target_ready(
  +name: Maybe<&2, String>,
  +env: Environment,
  +file: Nat,
  +args: Maybe<&2, Nat>,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match name:
    case None{}: Frame{jobs, state, values}
    case Some{+text}: target_dispatch(
      contains(imported(env, file), text),
      qualified(env, text),
      local_type(env, text),
      Bool.and(contains("min" <> "max" <> [], text), Bool.not(package_name(env, text))),
      env,
      file,
      text,
      args,
      jobs,
      state,
      values
    )

def target_unwrap(
  +unwrap: Bool,
  +children: List<&2, Nat>,
  +row: Maybe<&2, T.GoSyntaxNode>,
  +env: Environment,
  +file: Nat,
  +args: Maybe<&2, Nat>,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match unwrap:
    case True{}: Frame{Target{first(children), args} <> jobs, charge(state), values}
    case False{}: target_ready(target_name(row, env, file), env, file, args, jobs, state, values)

def target_step(
  +row: Maybe<&2, T.GoSyntaxNode>,
  +env: Environment,
  +file: Nat,
  +args: Maybe<&2, Nat>,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match row:
    case None{}: Frame{jobs, state, values}
    case Some{T.GoSyntaxNode{_, +kind, _, _, _, +children, _}}: target_unwrap(
      contains("parenthesized_expression" <> "parenthesized_type" <> [], kind),
      children,
      row,
      env,
      file,
      args,
      jobs,
      state,
      values
    )

def binary(
  +op: String,
  +fields: List<&2, T.SyntaxField>,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  +comparison = contains("==" <> "!=" <> "<" <> "<=" <> ">" <> ">=" <> [], op)
  Frame{
    Bool.pick(
      List<&2, Job>,
      comparison,
      jobs,
      push(
        field(fields, "left"),
        Bool.pick(
          List<&2, Job>,
          contains("<<" <> ">>" <> [], op),
          jobs,
          push(field(fields, "right"), jobs)
        )
      )
    ),
    state,
    values
  }

def visit_kind(
  +identifier: Bool,
  +selector: Bool,
  +parenthesized: Bool,
  +unary: Bool,
  +binary_kind: Bool,
  +call: Bool,
  +conversion: Bool,
  +text: String,
  +children: List<&2, Nat>,
  +fields: List<&2, T.SyntaxField>,
  +env: Environment,
  +file: Nat,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match identifier selector parenthesized unary binary_kind call conversion:
    case True{} _ _ _ _ _ _: append_values(
      jobs,
      state,
      values,
      Bool.pick(
        List<&2, Inferred>,
        contains(imported(env, file), text),
        [],
        known_by_name(members(state), text, [])
      )
    )
    case _ True{} _ _ _ _ _: append_values(
      jobs,
      state,
      values,
      qualified_value(env, file, text) <> []
    )
    case _ _ True{} _ _ _ _: Frame{push(first(children), jobs), state, values}
    case _ _ _ True{} _ _ _: Frame{push(field(fields, "operand"), jobs), state, values}
    case _ _ _ _ True{} _ _: binary(
      node_text(maybe_node(env, file, field(fields, "operator"))),
      fields,
      jobs,
      state,
      values
    )
    case _ _ _ _ _ True{} _: Frame{
      Target{field(fields, "function"), field(fields, "arguments")} <> jobs,
      state,
      values
    }
    case _ _ _ _ _ _ True{}: Frame{
      Target{field(fields, "type"), field(fields, "arguments")} <> jobs,
      state,
      values
    }
    case _ _ _ _ _ _ _: Frame{jobs, state, values}

def visit(
  +row: Maybe<&2, T.GoSyntaxNode>,
  +env: Environment,
  +file: Nat,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match row:
    case None{}: Frame{jobs, state, values}
    case Some{T.GoSyntaxNode{_, +kind, +text, _, _, +children, +fields}}:
      visit_kind(
        contains("identifier" <> "iota" <> "true" <> "false" <> [], kind),
        String.eq(kind, "selector_expression"),
        String.eq(kind, "parenthesized_expression"),
        String.eq(kind, "unary_expression"),
        String.eq(kind, "binary_expression"),
        String.eq(kind, "call_expression"),
        String.eq(kind, "type_conversion_expression"),
        text,
        children,
        fields,
        env,
        file,
        jobs,
        charge(state),
        values
      )

def job_step(
  +job: Job,
  +env: Environment,
  +file: Nat,
  +jobs: List<&2, Job>,
  +state: State,
  +values: List<&2, Inferred>
) -> Frame:
  match job:
    case Visit{ +id}: visit(node(env, file, id), env, file, jobs, state, values)
    case Target{ +id, +args}: target_step(
      maybe_node(env, file, id),
      env,
      file,
      args,
      jobs,
      state,
      values
    )
    case Alias{+name, +seen, +origin}: alias_step(
      Bool.and(local_type(env, name), Bool.not(contains(seen, name))),
      env,
      name,
      seen,
      origin,
      jobs,
      state,
      values
    )

def step( +frame: Frame, +env: Environment, +file: Nat) -> Frame:
  match frame:
    case Frame{[], +state, +values}: Frame{[], state, values}
    case Frame{head <> tail, +state, +values}: job_step(head, env, file, tail, state, values)

def running( +frame: Frame) -> Bool:
  match frame:
    case Frame{[], _, _}: False{}
    case Frame{_ <> _, +state, _}: valid(state)

# Each Visit and alias advance charges one work; each Target unwrap does too.
# Uncharged Target dispatch/alias endpoints are bounded by charged predecessors.
# Thus 3*limit+4 covers producer-valid jobs; exhaustion is never successful.
def exhausted(frame: Frame) -> Frame:
  match frame:
    case Frame{[], state, values}: Frame{[], state, values}
    case Frame{jobs, State{work, limit, _, members, changed}, values}:
      Frame{jobs, State{work, limit, False{}, members, changed}, values}

def eval_loop( +fuel: Nat, +active: Bool, +frame: Frame, +env: Environment, +file: Nat) -> Frame:
  match fuel active:
    case 0n _: exhausted(frame)
    case _ False{}: frame
    case 1n++rest True{}:
      +next = step(frame, env, file)
      eval_loop(rest, running(next), next, env, file)

def fuel( +state: State) -> Nat:
  match state:
    case State{_, +limit, _, _, _}: Nat.add(Nat.mul(limit, 3n), 4n)

def make_frame(jobs: List<&2, Job>, state: State) -> Frame:
  Frame{jobs, state, []}

def evaluate( +jobs: List<&2, Job>, +state: State, +env: Environment, +file: Nat) -> Frame:
  +frame = make_frame(jobs, state)
  eval_loop(fuel(state), running(frame), frame, env, file)

def member_jobs(
  +type_name: Maybe<&2, String>,
  +expression: Maybe<&2, Nat>,
  +env: Environment,
  +file: Nat
) -> List<&2, Job>:
  match type_name:
    case None{}: push(expression, [])
    case Some{+name}: Bool.pick(
      List<&2, Job>,
      Bool.and(local_type(env, name), Bool.not(contains(imported(env, file), name))),
      Alias{name, [], None{}} <> [],
      Bool.pick(List<&2, Job>, qualified(env, name), Alias{name, [], Some{file}} <> [], [])
    )

# An explicit qualified type must bypass local alias traversal when its spelling
# also belongs to imported names; native producer identifiers cannot contain dots.
def update_member(
  +items: List<&2, Member>,
  +wanted: Nat,
  +added: List<&2, Inferred>
) -> List<&2, Member>:
  match items:
    case []: []
    case Member{+id, +file, +group, +name, +type_name, +expression, +known} <> tail:
      Member{
        id,
        file,
        group,
        name,
        type_name,
        expression,
        Bool.pick(List<&2, Inferred>, Nat.is_eq(id, wanted), union(added, known), known)
      } <> update_member(tail, wanted, added)

def known_at( +items: List<&2, Member>, +wanted: Nat) -> List<&2, Inferred>:
  match items:
    case []: []
    case Member{ +id, _, _, _, _, _, +known} <> tail: Bool.pick(
      List<&2, Inferred>,
      Nat.is_eq(id, wanted),
      known,
      known_at(tail, wanted)
    )

def commit_inference( +frame: Frame, +id: Nat) -> State:
  match frame:
    case Frame{_, State{ +work, +limit, +valid, +items, +changed}, +values}:
      +old = known_at(items, id)
      State{
        work,
        limit,
        valid,
        update_member(items, id, values),
        Bool.or(
          changed,
          Nat.is_gt(List.length(&2, Inferred, union(values, old)), List.length(&2, Inferred, old))
        )
      }

def infer_one( +member: Member, +env: Environment, +state: State) -> State:
  match member:
    case Member{ +id, +file, _, _, +type_name, +expression, _}:
      commit_inference(
        evaluate(member_jobs(type_name, expression, env, file), charge(state), env, file),
        id
      )

def infer_members( +items: List<&2, Member>, +env: Environment, +state: State) -> State:
  match items:
    case []: state
    case head <> tail: infer_members(tail, env, infer_one(head, env, state))

def reset_changed( +state: State) -> State:
  match state:
    case State{ +work, +limit, +valid, +members, _}: State{work, limit, valid, members, False{}}

def changed_valid( +state: State) -> Bool:
  match state:
    case State{_, _, +valid, _, +changed}: Bool.and(valid, changed)

def passes( +fuel: Nat, +active: Bool, +state: State, +env: Environment) -> State:
  match fuel active:
    case 0n _: state
    case _ False{}: state
    case 1n++rest True{}:
      +next = infer_members(members(state), env, reset_changed(state))
      passes(rest, changed_valid(next), next, env)

def append_strings( +files: List<&2, T.GoFileSyntax>) -> List<&2, String>:
  match files:
    case []: []
    case T.GoFileSyntax{_, _, _, _, _, _, _, _, +bindings, _, _, _, _} <> tail:
      List.append(&2, String, bindings, append_strings(tail))

def no_duplicates( +items: List<&2, String>, +seen: List<&2, String>) -> Bool:
  match items:
    case []: True{}
    case +head <> tail: Bool.and(
      Bool.or(String.eq(head, "_"), Bool.not(contains(seen, head))),
      no_duplicates(tail, head <> seen)
    )

def declaration_names( +items: List<&2, T.FactDeclaration>) -> List<&2, String>:
  match items:
    case []: []
    case head <> tail: declaration_name(head) <> declaration_names(tail)

def type_names( +files: List<&2, T.GoFileSyntax>) -> List<&2, String>:
  match files:
    case []: []
    case T.GoFileSyntax{_, _, +types, _, _, _, _, _, _, _, _, _, _} <> tail:
      List.append(&2, String, declaration_names(types), type_names(tail))

def reference_work( +items: List<&2, T.FactDeclaration>) -> Nat:
  match items:
    case []: 0n
    case head <> tail: Nat.add(
      List.length(&2, T.FactReference, references(head)),
      reference_work(tail)
    )

def initial_work( +files: List<&2, T.GoFileSyntax>) -> Nat:
  match files:
    case []: 0n
    case T.GoFileSyntax{_, _, +types, _, +constants, _, _, _, +bindings, _, _, _, _} <> tail:
      Nat.add(
        List.length(&2, String, bindings),
        Nat.add(
          List.length(&2, T.FactDeclaration, constants),
          Nat.add(reference_work(types), Nat.add(reference_work(constants), initial_work(tail)))
        )
      )

def make_groups(
  +declarations: List<&2, T.FactDeclaration>,
  +groups: List<&2, T.GoConstantFacts>,
  +file: Nat,
  +index: Nat
) -> List<&2, Group>:
  match declarations groups:
    case declaration <> tail T.GoConstantFacts{_, +names, _} <> rest:
      Group{index, file, declaration, names} <> make_groups(tail, rest, file, Nat.add(index, 1n))
    case _ _: []

def collect_groups( +files: List<&2, T.GoFileSyntax>, +file: Nat, +index: Nat) -> List<&2, Group>:
  match files:
    case []: []
    case T.GoFileSyntax{_, _, _, _, +constants, _, _, +groups, _, _, _, _, _} <> tail:
      List.append(
        &2,
        Group,
        make_groups(constants, groups, file, index),
        collect_groups(
          tail,
          Nat.add(file, 1n),
          Nat.add(index, List.length(&2, T.FactDeclaration, constants))
        )
      )

def make_members(
  +items: List<&2, T.GoConstantMember>,
  +file: Nat,
  +group: Nat,
  +index: Nat
) -> List<&2, Member>:
  match items:
    case []: []
    case T.GoConstantMember{ +name, +type_name, +expression} <> tail:
      Member{index, file, group, name, type_name, expression, []} <> make_members(
        tail,
        file,
        group,
        Nat.add(index, 1n)
      )

def group_members(
  +groups: List<&2, T.GoConstantFacts>,
  +file: Nat,
  +group: Nat,
  +index: Nat
) -> List<&2, Member>:
  match groups:
    case []: []
    case T.GoConstantFacts{_, _, +items} <> tail:
      List.append(
        &2,
        Member,
        make_members(items, file, group, index),
        group_members(
          tail,
          file,
          Nat.add(group, 1n),
          Nat.add(index, List.length(&2, T.GoConstantMember, items))
        )
      )

def collect_members(
  +files: List<&2, T.GoFileSyntax>,
  +file: Nat,
  +group: Nat,
  +index: Nat
) -> List<&2, Member>:
  match files:
    case []: []
    case T.GoFileSyntax{_, _, _, _, _, _, _, +groups, _, _, _, _, _} <> tail:
      +batch = group_members(groups, file, group, index)
      List.append(
        &2,
        Member,
        batch,
        collect_members(
          tail,
          Nat.add(file, 1n),
          Nat.add(group, List.length(&2, T.GoConstantFacts, groups)),
          Nat.add(index, List.length(&2, Member, batch))
        )
      )

def group_collision( +groups: List<&2, Group>, +bindings: List<&2, String>) -> Bool:
  match groups:
    case []: False{}
    case Group{_, _, +declaration, _} <> tail: Bool.or(
      contains(bindings, declaration_name(declaration)),
      group_collision(tail, bindings)
    )

def builtin(+name: String) -> Bool:
  contains(
    "bool" <> "byte" <> "complex64" <> "complex128" <> "error" <> "float32" <> "float64" <> "int" <> "int8" <> "int16" <> "int32" <> "int64" <> "rune" <> "string" <> "uint" <> "uint8" <> "uint16" <> "uint32" <> "uint64" <> "uintptr" <> "any" <> "comparable" <> [],
    name
  )

def constant_binding(
  +groups: List<&2, Group>,
  +name: String,
  +acc: Maybe<&2, String>
) -> Maybe<&2, String>:
  match groups:
    case []: acc
    case Group{_, _, +declaration, +names} <> tail:
      constant_binding(
        tail,
        name,
        Bool.pick(
          Maybe<&2, String>,
          contains(names, name),
          Some{declaration_name(declaration)},
          acc
        )
      )

def constant_name( +env: Environment, +name: String) -> Maybe<&2, String>:
  match env:
    case Environment{_, +groups, _, _, _}: constant_binding(groups, name, None{})

def named( +name: String) -> T.FactReference:
  T.FactReference{Local.Named{}, name, Local.AnyKind{}, None{}}

def remap_named( +value: Maybe<&2, String>, +original: T.FactReference) -> T.FactReference:
  match value:
    case None{}: original
    case Some{ +name}: named(name)

def is_named( +kind: Local.ReferenceKind) -> Bool:
  match kind:
    case Local.Named{}: True{}
    case _: False{}

def type_reference(
  +ref: T.FactReference,
  +tail: List<&2, T.FactReference>,
  +env: Environment
) -> List<&2, T.FactReference>:
  match ref:
    case T.FactReference{ +kind, +name, _, _}:
      +isnamed = is_named(kind)
      Bool.pick(
        List<&2, T.FactReference>,
        Bool.and(isnamed, Bool.and(builtin(name), Bool.not(package_name(env, name)))),
        tail,
        Bool.pick(T.FactReference, isnamed, remap_named(constant_name(env, name), ref), ref) <> tail
      )

def type_references(
  +items: List<&2, T.FactReference>,
  +env: Environment
) -> List<&2, T.FactReference>:
  match items:
    case []: []
    case +head <> tail: type_reference(head, type_references(tail, env), env)

def group_types(
  +items: List<&2, Member>,
  +group: Nat,
  +acc: List<&2, Inferred>
) -> List<&2, Inferred>:
  match items:
    case []: acc
    case Member{_, _, +id, _, _, _, +known} <> tail:
      group_types(
        tail,
        group,
        Bool.pick(List<&2, Inferred>, Nat.is_eq(id, group), union(known, acc), acc)
      )

type ReferenceState is Data:
  ReferenceState{state: State, +references: List<&2, T.FactReference>}

def add_demands(
  +groups: List<&2, Group>,
  +name: String,
  +state: State,
  +refs: List<&2, T.FactReference>
) -> ReferenceState:
  match groups:
    case []: ReferenceState{state, refs}
    case Group{ +id, _, +declaration, _} <> tail:
      add_demands(
        tail,
        name,
        charge(state),
        Bool.pick(
          List<&2, T.FactReference>,
          inferred_has(group_types(members(state), id, []), LocalType{name}),
          List.append(&2, T.FactReference, refs, named(declaration_name(declaration)) <> []),
          refs
        )
      )

def constant_reference_remap(
  +imported_name: Bool,
  +dependency: Maybe<&2, String>,
  +local: Bool,
  +name: String,
  +original: T.FactReference
) -> T.FactReference:
  match imported_name dependency local:
    case True{} _ _: T.FactReference{Local.Unsupported{}, name, Local.AnyKind{}, None{}}
    case False{} Some{ +group} _: named(group)
    case False{} None{} True{}: named(name)
    case False{} None{} False{}: original

def constant_reference(
  +ref: T.FactReference,
  +tail: List<&2, T.FactReference>,
  +own_names: List<&2, String>,
  +env: Environment,
  +file: Nat
) -> List<&2, T.FactReference>:
  match ref:
    case T.FactReference{_, +name, _, _}:
      +imported_name = contains(imported(env, file), name)
      +shadowed = Bool.or(package_name(env, name), imported_name)
      +excluded = Bool.or(
        contains(own_names, name),
        Bool.and(
          Bool.not(shadowed),
          Bool.or(
            builtin(name),
            contains("iota" <> "true" <> "false" <> "min" <> "max" <> [], name)
          )
        )
      )
      Bool.pick(
        List<&2, T.FactReference>,
        excluded,
        tail,
        constant_reference_remap(
          imported_name,
          constant_name(env, name),
          local_type(env, name),
          name,
          ref
        ) <> tail
      )

def constant_references(
  +items: List<&2, T.FactReference>,
  +names: List<&2, String>,
  +env: Environment,
  +file: Nat
) -> List<&2, T.FactReference>:
  match items:
    case []: []
    case +head <> tail: constant_reference(
      head,
      constant_references(tail, names, env, file),
      names,
      env,
      file
    )

def with_references(
  +value: T.FactDeclaration,
  +refs: List<&2, T.FactReference>
) -> T.FactDeclaration:
  match value:
    case T.FactDeclaration{ +key, +artifact, _, +exported}: T.FactDeclaration{
      key,
      artifact,
      refs,
      exported
    }

def declaration_key( +value: Declaration) -> String:
  match value:
    case Declaration{ +value, _}: declaration_name(value)

def set_declaration( +items: List<&2, Declaration>, +value: Declaration) -> List<&2, Declaration>:
  match items:
    case []: value <> []
    case +head <> +tail:
      Bool.pick(
        List<&2, Declaration>,
        String.eq(declaration_key(head), declaration_key(value)),
        value <> tail,
        head <> set_declaration(tail, value)
      )

type Assembly is Data:
  Assembly{state: State, +declarations: List<&2, Declaration>}

def assembled_type(
  +value: ReferenceState,
  +declaration: T.FactDeclaration,
  +location: Maybe<&2, T.GoSourceLocation>,
  +acc: List<&2, Declaration>
) -> Assembly:
  match value:
    case ReferenceState{ +state, +refs}: Assembly{
      state,
      set_declaration(acc, Declaration{with_references(declaration, refs), location})
    }

def assemble_type(
  +declaration: T.FactDeclaration,
  +location: Maybe<&2, T.GoSourceLocation>,
  +env: Environment,
  +assembly: Assembly
) -> Assembly:
  match env assembly:
    case Environment{_, +groups, _, _, _} Assembly{ +state, +acc}:
      assembled_type(
        add_demands(
          groups,
          declaration_name(declaration),
          state,
          type_references(references(declaration), env)
        ),
        declaration,
        location,
        acc
      )

def location_head(
  +items: List<&2, Maybe<&2, T.GoSourceLocation>>
) -> Maybe<&2, T.GoSourceLocation>:
  match items:
    case []: None{}
    case head <> _: head

def location_tail(
  +items: List<&2, Maybe<&2, T.GoSourceLocation>>
) -> List<&2, Maybe<&2, T.GoSourceLocation>>:
  match items:
    case []: []
    case _ <> tail: tail

def assemble_types(
  +items: List<&2, T.FactDeclaration>,
  +locations: List<&2, Maybe<&2, T.GoSourceLocation>>,
  +env: Environment,
  +assembly: Assembly
) -> Assembly:
  match items:
    case []: assembly
    case head <> tail: assemble_types(
      tail,
      location_tail(locations),
      env,
      assemble_type(head, location_head(locations), env, assembly)
    )

def assemble_constant(
  +declaration: T.FactDeclaration,
  +names: List<&2, String>,
  +env: Environment,
  +file: Nat,
  +assembly: Assembly
) -> Assembly:
  match assembly:
    case Assembly{ +state, +acc}: Assembly{
      state,
      set_declaration(
        acc,
        Declaration{
          with_references(
            declaration,
            constant_references(references(declaration), names, env, file)
          ),
          None{}
        }
      )
    }

def assemble_constants(
  +items: List<&2, T.FactDeclaration>,
  +groups: List<&2, T.GoConstantFacts>,
  +env: Environment,
  +file: Nat,
  +assembly: Assembly
) -> Assembly:
  match items groups:
    case head <> tail T.GoConstantFacts{_, +names, _} <> rest: assemble_constants(
      tail,
      rest,
      env,
      file,
      assemble_constant(head, names, env, file, assembly)
    )
    case _ _: assembly

def assemble(
  +files: List<&2, T.GoFileSyntax>,
  +file: Nat,
  +env: Environment,
  +assembly: Assembly
) -> Assembly:
  match files:
    case []: assembly
    case T.GoFileSyntax{_, _, +types, +locations, +constants, _, _, +groups, _, _, _, _, _} <> tail:
      assemble(
        tail,
        Nat.add(file, 1n),
        env,
        assemble_constants(
          constants,
          groups,
          env,
          file,
          assemble_types(types, locations, env, assembly)
        )
      )

def types_key( +value: ConstantTypes) -> String:
  match value:
    case ConstantTypes{ +name, _}: name

def set_types( +items: List<&2, ConstantTypes>, +value: ConstantTypes) -> List<&2, ConstantTypes>:
  match items:
    case []: value <> []
    case +head <> +tail: Bool.pick(
      List<&2, ConstantTypes>,
      String.eq(types_key(head), types_key(value)),
      value <> tail,
      head <> set_types(tail, value)
    )

def constant_types(
  +groups: List<&2, Group>,
  +items: List<&2, Member>,
  +acc: List<&2, ConstantTypes>
) -> List<&2, ConstantTypes>:
  match groups:
    case []: acc
    case Group{ +id, _, +declaration, _} <> tail:
      constant_types(
        tail,
        items,
        set_types(acc, ConstantTypes{declaration_name(declaration), group_types(items, id, [])})
      )

def finish( +assembly: Assembly, +groups: List<&2, Group>) -> PackageResult:
  match assembly:
    case Assembly{State{ +work, _, +valid, +items, _}, +declarations}:
      Bool.pick(
        PackageResult,
        valid,
        PackageFacts{declarations, work, constant_types(groups, items, [])},
        Refused{}
      )

def admitted(
  +ok: Bool,
  +files: List<&2, T.GoFileSyntax>,
  +env: Environment,
  +groups: List<&2, Group>,
  +items: List<&2, Member>,
  +work: Nat,
  +limit: Nat
) -> PackageResult:
  match ok:
    case False{}: Refused{}
    case True{}: finish(
      assemble(
        files,
        0n,
        env,
        Assembly{
          passes(
            Nat.add(List.length(&2, Member, items), 1n),
            True{},
            State{work, limit, True{}, items, False{}},
            env
          ),
          []
        }
      ),
      groups
    )

def optional_covered(value: Maybe<&2, String>, spellings: List<&2, Input.Spelling>) -> Bool:
  match value:
    case None{}: True{}
    case Some{text}: Input.has(spellings, text)

def members_covered(
  items: List<&2, T.GoConstantMember>,
  +spellings: List<&2, Input.Spelling>
) -> Bool:
  match items:
    case []: True{}
    case T.GoConstantMember{_, name, _} <> tail: Bool.and(
      optional_covered(name, spellings),
      members_covered(tail, spellings)
    )

def groups_covered(
  items: List<&2, T.GoConstantFacts>,
  +spellings: List<&2, Input.Spelling>
) -> Bool:
  match items:
    case []: True{}
    case T.GoConstantFacts{_, _, members} <> tail: Bool.and(
      members_covered(members, spellings),
      groups_covered(tail, spellings)
    )

def aliases_covered(items: List<&2, T.GoAlias>, +spellings: List<&2, Input.Spelling>) -> Bool:
  match items:
    case []: True{}
    case T.GoAlias{_, target} <> tail: Bool.and(
      Input.has(spellings, target),
      aliases_covered(tail, spellings)
    )

def rows_covered(items: List<&2, T.GoSyntaxNode>, +spellings: List<&2, Input.Spelling>) -> Bool:
  match items:
    case []: True{}
    case T.GoSyntaxNode{_, _, text, _, _, _, _} <> tail: Bool.and(
      Input.has(spellings, text),
      rows_covered(tail, spellings)
    )

def covered(files: List<&2, T.GoFileSyntax>, +spellings: List<&2, Input.Spelling>) -> Bool:
  match files:
    case []: True{}
    case T.GoFileSyntax{_, _, _, _, _, _, aliases, groups, _, _, _, _, rows} <> tail:
      Bool.and(
        aliases_covered(aliases, spellings),
        Bool.and(
          groups_covered(groups, spellings),
          Bool.and(rows_covered(rows, spellings), covered(tail, spellings))
        )
      )

def run(
  +files: List<&2, T.GoFileSyntax>,
  +work_limit: Nat,
  +spellings: List<&2, Input.Spelling>
) -> PackageResult:
  +work = initial_work(files)
  +bindings = append_strings(files)
  +groups = collect_groups(files, 0n, 0n)
  admitted(
    Bool.and(
      Bool.and(covered(files, spellings), Nat.is_le(work, work_limit)),
      Bool.and(no_duplicates(bindings, []), Bool.not(group_collision(groups, bindings)))
    ),
    files,
    Environment{files, groups, bindings, type_names(files), spellings},
    groups,
    collect_members(files, 0n, 0n, 0n),
    work,
    work_limit
  )
