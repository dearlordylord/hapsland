import Base
import ./Types.bend as T
import ./State.bend as S
import ./traversal/core.bend as Local
import ./python-module/Session.bend as Python
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

# Census is separate from inspected facts: semantically rejected captures and
# failed read reservations still consume source admission and authority budgets.
type Census is Data:
  Census{captures: Map<&2, Bool>, failed: Map<&2, Bool>, files: Nat, bytes: Nat, failures: Nat, amounts: Map<&2, Nat>}

def initial(+path: String, +bytes: Nat) -> Census:
  Census{Map.set(&2, Bool, MTip{}, path, True{}), MTip{}, 1n, bytes, 0n, Map.set(&2, Nat, MTip{}, path, bytes)}

def graph_usage(graph: Graph.Graph) -> Python.Usage:
  match graph:
    case Graph.Graph{_, _, _, files, bytes, _, work, _, _, _, _}: Python.Usage{files, bytes, work}

def combined_usage(census: Census, spent: Python.Usage, source_cap: Nat) -> Python.Usage:
  match census spent:
    case Census{_, _, files, bytes, +failures, _} Python.Usage{spent_files, spent_bytes, work}:
      Python.Usage{Nat.max(spent_files, Nat.add(files, failures)),
        Nat.max(spent_bytes, Nat.add(bytes, Nat.mul(failures, source_cap))), work}

def usage(census: Census, graph: Graph.Graph, source_cap: Nat) -> Python.Usage:
  combined_usage(census, graph_usage(graph), source_cap)

def remaining_usage(usage: Python.Usage, +limits: Graph.Limits) -> Python.Remaining:
  match usage:
    case Python.Usage{files, bytes, work}:
      Python.Remaining{Python.difference(Graph.file_cap(limits), files),
        Python.difference(Graph.read_cap(limits), bytes), Python.difference(Graph.work_cap(limits), work)}

def remaining(census: Census, +frame: T.ResolverFrame) -> Python.Remaining:
  +limits = S.frame_limits(frame)
  remaining_usage(usage(census, S.frame_graph(frame), Graph.source_cap(limits)), limits)

def available_usage(source: Python.Usage, authority: Python.Usage, +limits: Graph.Limits) -> Bool:
  match source authority:
    case Python.Usage{files, bytes, work} Python.Usage{extra_files, extra_bytes, extra_work}:
      Bool.and(Nat.is_le(Nat.add(files, extra_files), Graph.file_cap(limits)),
        Bool.and(Nat.is_le(Nat.add(bytes, extra_bytes), Graph.read_cap(limits)),
          Nat.is_le(Nat.add(work, extra_work), Graph.work_cap(limits))))

def available(census: Census, session: Python.Session, +frame: T.ResolverFrame) -> Bool:
  +limits = S.frame_limits(frame)
  available_usage(usage(census, S.frame_graph(frame), Graph.source_cap(limits)), Python.usage(session), limits)

def main() -> Unit:
  Unit{}

def captured_path(census: Census, path: String) -> Bool:
  match census:
    case Census{captures, _, _, _, _, _}: Local.map_result(Bool, Map.get(Bool, False{}, captures, path))

def failed_path(census: Census, path: String) -> Bool:
  match census:
    case Census{_, failed, _, _, _, _}: Local.map_result(Bool, Map.get(Bool, False{}, failed, path))

def reserved_once(census: Census, +path: String, already: Bool) -> Census:
  match census already:
    case _ True{}: census
    case Census{captures, failed, files, bytes, failures, amounts} False{}:
      Census{captures, Map.set(&2, Bool, failed, path, True{}), files, bytes, Nat.add(failures, 1n), amounts}

def reserved(+census: Census, +path: String, already: Bool) -> Census:
  reserved_once(census, path, Bool.or(already, failed_path(census, path)))

def reservation_allowed(source: Python.Usage, authority: Python.Usage, +limits: Graph.Limits,
    extra_file: Nat, reserve_bytes: Nat) -> Bool:
  match source authority:
    case Python.Usage{files, bytes, _} Python.Usage{extra_files, extra_bytes, _}:
      Bool.and(Nat.is_le(Nat.add(Nat.add(files, extra_files), extra_file), Graph.file_cap(limits)),
        Nat.is_le(Nat.add(Nat.add(bytes, extra_bytes), reserve_bytes), Graph.read_cap(limits)))

def reservation_size(already: Bool, cached: Maybe<&2, Nat>, source_cap: Nat) -> Nat:
  match already cached:
    case True{} _: 0n
    case False{} None{}: source_cap
    case False{} Some{bytes}: bytes

def reservation_file(already: Bool) -> Nat:
  match already:
    case True{}: 0n
    case False{}: 1n

def reserve_allowed(allowed: Bool, census: Census) -> Maybe<&2, Census>:
  match allowed:
    case False{}: None{}
    case True{}: Some{census}

def reserve(+census: Census, session: Python.Session, +frame: T.ResolverFrame,
    +path: String, cached: Maybe<&2, Nat>) -> Maybe<&2, Census>:
  +limits = S.frame_limits(frame)
  reserve_allowed(Bool.and(Bool.not(failed_path(census, path)),
    reservation_allowed(usage(census, S.frame_graph(frame), Graph.source_cap(limits)), Python.usage(session), limits,
      reservation_file(captured_path(census, path)), reservation_size(captured_path(census, path), cached, Graph.source_cap(limits)))),
    reserved(census, path, captured_path(census, path)))

def counted_success(census: Census, +path: String, +bytes: Nat, already: Bool, failed: Bool, previous: Nat) -> Census:
  match census already failed:
    case Census{captures, failures, files, total, count, amounts} False{} +was_failed:
      Census{Map.set(&2, Bool, captures, path, True{}), Map.set(&2, Bool, failures, path, False{}),
        Nat.add(files, 1n), Nat.add(total, bytes), Nat.sub(count, reservation_file(Bool.not(was_failed))), Map.set(&2, Nat, amounts, path, bytes)}
    case Census{captures, failures, files, total, count, amounts} True{} was_failed:
      Census{captures, Map.set(&2, Bool, failures, path, False{}), files, Nat.add(Nat.sub(total, previous), bytes),
        Nat.sub(count, reservation_file(Bool.not(was_failed))), Map.set(&2, Nat, amounts, path, bytes)}

def previous_bytes(census: Census, path: String) -> Nat:
  match census:
    case Census{_, _, _, _, _, amounts}: Local.map_result(Nat, Map.get(Nat, 0n, amounts, path))

def succeeded(+census: Census, +path: String, bytes: Nat) -> Census:
  counted_success(census, path, bytes, captured_path(census, path), failed_path(census, path), previous_bytes(census, path))
