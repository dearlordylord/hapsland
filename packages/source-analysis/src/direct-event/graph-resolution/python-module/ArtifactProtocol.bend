import Base
import ../Types.bend as T
import ./Session.bend as Python

# Sole source-bearing Python child contract, consumed by resident composition
# and reference orchestration. Lifecycle handles and provider leases belong to
# the resident owner; no policy implementation is imported here.
type Resolution is Data:
  Resolution{path: String, name: String}
type PythonCommand is Data:
  Prepare{root: String, capture: T.CaptureToken, root_bytes: Nat, files: Nat,
    read_bytes: Nat, work: Nat, source_cap: Nat, depth: Nat, clock: T.ClockToken,
    invocation: Nat, caller_cache: Maybe<&2, T.CacheToken>, next: Nat}
  Inspect{branch: T.Branch, path: String, root: String, capture: T.CaptureToken,
    invocation: Nat, next: Nat}
  ResolveImport{session: Python.Session, remaining: Python.Remaining, from: String,
    module: String, member: String, root: String, clock: T.ClockToken,
    cache: T.CacheToken, separator: String, invocation: Nat, next: Nat}
  Revalidate{session: Python.Session, remaining: Python.Remaining, clock: T.ClockToken,
    separator: String, invocation: Nat, next: Nat}
type PythonResult is Data:
  PreparationUnavailable{}
  Prepared{session: Python.Session, cache: T.CacheToken}
  Inspected{facts: Maybe<&2, T.SourceFacts>}
  Resolved{session: Python.Session, result: Maybe<&2, Resolution>}
  Revalidated{session: Python.Session, valid: Bool}
type PythonView is Data:
  Await{request: T.Request, session: Maybe<&2, Python.Session>, next: Nat}
  Returned{result: PythonResult, next: Nat}
  Failed{failure: T.TechnicalFailure, session: Maybe<&2, Python.Session>, next: Maybe<&2, Nat>}


def main() -> Unit:
  Unit{}
