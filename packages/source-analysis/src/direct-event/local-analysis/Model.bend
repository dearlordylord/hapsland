import Base

# Parser declarations retain their native artifact objects. Slots are opaque
# native-owner handles; this capability decides only traversal and plan shape.
type Reference is Data:
  Named{name: String, target_id: Maybe<&2, String>}
  Unsupported{name: String}

type Declaration is Data:
  Declaration{slot: Nat, identity: String, name: String, references: List<&2, Reference>}

type Supporting is Data:
  Supporting{key: String, declaration: Declaration}

type Catalog is Data:
  Catalog{declarations: List<&2, Declaration>, supporting: List<&2, Supporting>}

type Failure is Data:
  MissingEvidence{}
  UnsupportedReference{}
  ReferenceLimit{}

type Omission is Data:
  Unresolved{}
  UnsupportedSyntax{}
  LimitExceeded{}

type ReferencePlan is Data:
  Omitted{symbol: String, target: Maybe<&2, String>, reason: Omission}
  Included{symbol: String, target: String}
  Expanded{symbol: String, node: NodePlan}

type NodePlan is Data:
  NodePlan{slot: Nat, references: List<&2, ReferencePlan>}

type Mode is Data:
  Materialize{}
  OutcomesOnly{}

# A missing tree in OutcomesOnly is deliberate. Traversal decisions, status,
# first failure and root handle must agree with Materialize for the same input.
type Outcome is Data:
  Outcome{root: Nat, failure: Maybe<&2, Failure>, tree: Maybe<&2, NodePlan>}

# Native arithmetic-stack primitives selected by the local preflight cursor.
type Op is Data:
  Push{value: Nat}
  MeasureArtifact{slot: Nat}
  MeasureText{value: String}
  Add{}
  Multiply{}

# Semantic tasks count declaration visits and reference visits only. Native
# measurements and frame completion do not spend extra traversal tasks.
def declaration_inventory(declaration: Declaration) -> Nat:
  match declaration:
    case Declaration{_, _, _, references}: Nat.add(1n, List.length(&2, Reference, references))

def declarations_inventory(declarations: List<&2, Declaration>) -> Nat:
  match declarations:
    case []: 0n
    case head <> tail: Nat.add(declaration_inventory(head), declarations_inventory(tail))

def supporting_inventory(supporting: List<&2, Supporting>) -> Nat:
  match supporting:
    case []: 0n
    case Supporting{_, declaration} <> tail:
      Nat.add(declaration_inventory(declaration), supporting_inventory(tail))

# Include the entry root explicitly: the totality law must also cover a root
# not present in the catalog. Duplicate slots/identities only overcount work.
def traversal_inventory(root: Declaration, catalog: Catalog) -> Nat:
  match catalog:
    case Catalog{declarations, supporting}:
      Nat.add(declaration_inventory(root),
        Nat.add(declarations_inventory(declarations), supporting_inventory(supporting)))

def main() -> Unit:
  Unit{}
