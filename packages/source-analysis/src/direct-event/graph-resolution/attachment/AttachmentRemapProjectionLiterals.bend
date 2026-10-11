import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentMapping.bend as M
import ../Composition.bend as C
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as L

def artifact() -> T.Artifact:
  T.Artifact{None{}, Some{"root.ts"}, "Root", T.InterfaceArtifact{}, "Root", "interface Root {}", "h", []}

def catalog() -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{0n, artifact()}]

def valid() -> {P.project(7n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], 7n), C.shift_slots([L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], 7n), catalog(), M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}], 7n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], [L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], catalog(), [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}]) : Maybe<&2, F.Forest>}:
  {==}

def zero() -> {P.project(0n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], 0n), C.shift_slots([L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], 0n), catalog(), M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}], 0n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], [L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], catalog(), [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}]) : Maybe<&2, F.Forest>}:
  {==}

def duplicate_node() -> {P.project(3n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{0n, 0n}], 3n), C.shift_slots([L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], 3n), catalog(), M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}], 3n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{0n, 0n}], [L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], catalog(), [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}]) : Maybe<&2, F.Forest>}:
  {==}

def duplicate_birth() -> {P.project(3n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], 3n), C.shift_slots([L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], 3n), catalog(), M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, []}}], 3n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], [L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], catalog(), [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, []}}]) : Maybe<&2, F.Forest>}:
  {==}

def missing_catalog() -> {P.project(3n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], 3n), C.shift_slots([L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], 3n), [], M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}], 3n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], [L.ReferenceSlot{0n, 0n, "Child", L.Expanded{1n}}], [], [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}]) : Maybe<&2, F.Forest>}:
  {==}

def unknown_owner() -> {P.project(3n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], 3n), C.shift_slots([L.ReferenceSlot{9n, 0n, "Child", L.Expanded{1n}}], 3n), catalog(), M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}], 3n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], [L.ReferenceSlot{9n, 0n, "Child", L.Expanded{1n}}], catalog(), [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}]) : Maybe<&2, F.Forest>}:
  {==}

def backward_child() -> {P.project(3n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], 3n), C.shift_slots([L.ReferenceSlot{1n, 0n, "Child", L.Expanded{0n}}], 3n), catalog(), M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}], 3n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], [L.ReferenceSlot{1n, 0n, "Child", L.Expanded{0n}}], catalog(), [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}]) : Maybe<&2, F.Forest>}:
  {==}

def wrong_index() -> {P.project(3n, C.shift_nodes([L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], 3n), C.shift_slots([L.ReferenceSlot{0n, 2n, "Child", L.Expanded{1n}}], 3n), catalog(), M.shifted([F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}], 3n)) == P.project(0n, [L.PlannedNode{0n, 0n}, L.PlannedNode{1n, 0n}], [L.ReferenceSlot{0n, 2n, "Child", L.Expanded{1n}}], catalog(), [F.AddressEntry{0n, O.NodeAddress{0n, []}}, F.AddressEntry{1n, O.NodeAddress{0n, [0n]}}]) : Maybe<&2, F.Forest>}:
  {==}

def empty() -> {P.project(3n, C.shift_nodes([], 3n), C.shift_slots([], 3n), [], M.shifted([], 3n)) == P.project(0n, [], [], [], []) : Maybe<&2, F.Forest>}:
  {==}

def main() -> Unit:
  Unit{}
