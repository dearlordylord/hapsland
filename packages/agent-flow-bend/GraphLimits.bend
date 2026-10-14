import Base
import ./ImportGraph.bend as Graph

# Native graph profile validation for the existing natural-valued machine ABI.
# Called at graph initialization, after preparation/local admission, preserving
# native refusal and failure priority. Foreign RangeError construction is IO.
def checked_field(valid: Bool, message: String) -> Maybe<&2, String>:
  match valid:
    case True{}: None{}
    case False{}: Some{message}

def field_violation(+value: Nat, maximum: Nat, message: String) -> Maybe<&2, String>:
  checked_field(Bool.and(Nat.is_ge(value, 1n), Nat.is_ge(maximum, value)), message)

def first(found: Maybe<&2, String>, remaining: Unit -> Maybe<&2, String>) -> Maybe<&2, String>:
  match found:
    case Some{message}: Some{message}
    case None{}: remaining(Unit{})

def reservation(source: Nat, bytes: Nat) -> Maybe<&2, String>:
  checked_field(
    Nat.is_ge(bytes, source),
    "graphLimits.readBytes must be at least graphLimits.sourceBytes for full-file reservation"
  )

def fields(
  +source: Nat,
  tree: Nat,
  files: Nat,
  +bytes: Nat,
  edges: Nat,
  depth: Nat,
  work: Nat
) -> Maybe<&2, String>:
  reserve : Unit -> Maybe<&2, String> = _ => reservation(source, bytes)
  check_work : Unit -> Maybe<&2, String> = _ => first(
    field_violation(work, 128n, "graphLimits.work must be an integer from 1 to 128"),
    reserve
  )
  check_depth : Unit -> Maybe<&2, String> = _ => first(
    field_violation(depth, 4n, "graphLimits.depth must be an integer from 1 to 4"),
    check_work
  )
  check_edges : Unit -> Maybe<&2, String> = _ => first(
    field_violation(edges, 16n, "graphLimits.outgoingEdges must be an integer from 1 to 16"),
    check_depth
  )
  check_bytes : Unit -> Maybe<&2, String> = _ => first(
    field_violation(
      bytes,
      Nat.mul(12n, Nat.mul(Nat.mul(32n, 32n), Nat.mul(32n, 32n))),
      "graphLimits.readBytes must be an integer from 1 to 12582912"
    ),
    check_edges
  )
  check_files : Unit -> Maybe<&2, String> = _ => first(
    field_violation(files, 8n, "graphLimits.files must be an integer from 1 to 8"),
    check_bytes
  )
  check_tree : Unit -> Maybe<&2, String> = _ => first(
    field_violation(
      tree,
      Nat.mul(20n, Nat.mul(32n, 32n)),
      "graphLimits.treeBytes must be an integer from 1 to 20480"
    ),
    check_files
  )
  first(
    field_violation(
      source,
      Nat.mul(128n, Nat.mul(128n, 128n)),
      "graphLimits.sourceBytes must be an integer from 1 to 2097152"
    ),
    check_tree
  )

def version_violation(valid: Bool, remaining: Unit -> Maybe<&2, String>) -> Maybe<&2, String>:
  match valid:
    case True{}: remaining(Unit{})
    case False{}: Some{"graphLimits.version must be 1"}

def violation(limits: Graph.Limits) -> Maybe<&2, String>:
  match limits:
    case Graph.Limits{version, source, tree, files, bytes, edges, depth, work}:
      remaining : Unit -> Maybe<&2, String> = _ => fields(
        source,
        tree,
        files,
        bytes,
        edges,
        depth,
        work
      )
      version_violation(Nat.is_eq(version, 1n), remaining)

def main() -> Unit:
  Unit{}
