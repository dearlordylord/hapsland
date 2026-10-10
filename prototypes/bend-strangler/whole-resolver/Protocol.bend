import Base
import ./Types.bend as T

# Every reply is checked against its outstanding typed operation and correlation.
type CheckedReply is Data:
  CheckedOutcome{outcome: T.ServiceOutcome}
  RejectedReply{failure: T.TechnicalFailure}

def matching(operation: T.Operation, outcome: T.ServiceOutcome) -> Bool:
  match operation outcome:
    case T.StartClock{} T.ClockStarted{_}: True{}
    case T.ReadClock{_} T.ClockRead{_}: True{}
    case T.PathDirname{_} T.DirnameResult{_}: True{}
    case T.PathBasename{_, _} T.BasenameResult{_}: True{}
    case T.ReadPathSeparator{} T.PathSeparatorResult{_}: True{}
    case T.PathJoin{_} T.JoinedResult{_}: True{}
    case T.PathNormalize{_} T.NormalizedResult{_}: True{}
    case T.PathRelative{_, _} T.RelativeResult{_}: True{}
    case T.PathExtension{_} T.ExtensionResult{_}: True{}
    case T.PathIsAbsolute{_} T.AbsoluteResult{_}: True{}
    case T.JoinedPathFacts{_, _} T.JoinedPathFactsResult{_, _, _, _, _}: True{}
    case T.ReadFileStatus{_} T.StatusResult{_}: True{}
    case T.AccessPath{_} T.AccessResult{_}: True{}
    case T.CreateInvocationCache{} T.InvocationCacheCreated{_}: True{}
    case T.LookupCaptureCache{_, _} T.CacheResult{_}: True{}
    case T.SnapshotCaptureCache{_} T.CacheSnapshot{_}: True{}
    case T.StoreCaptureCache{_, _, _} T.CacheStored{}: True{}
    case T.InsertRootCaptureCache{_, _, _} T.RootCacheInserted{}: True{}
    case T.CaptureSource{_, _} T.CaptureResult{_}: True{}
    case T.InspectSource{_, _, _} T.FrontendResult{_}: True{}
    case T.ParseCargo{_} T.CargoResult{_}: True{}
    case T.InspectRustModules{_} T.RustModulesResult{_}: True{}
    case T.ObserveDiagnostic{_, _} T.DiagnosticObserved{}: True{}
    case T.EncodeProduct{_} T.ProductEncoded{_}: True{}
    case T.EncodeSourceText{_} T.SourceTextEncoded{_}: True{}
    case _ T.ProviderRejected{_}: True{}
    case _ _: False{}

def token_owner(same: Bool, expected: Nat, actual: Nat, outcome: T.ServiceOutcome) -> CheckedReply:
  match same:
    case False{}: RejectedReply{T.WrongInvocation{expected, actual}}
    case True{}: CheckedOutcome{outcome}

def output_owner(+expected: Nat, +outcome: T.ServiceOutcome) -> CheckedReply:
  match outcome:
    case T.ClockStarted{T.ClockToken{+actual, _}}: token_owner(
      Nat.is_eq(expected, actual),
      expected,
      actual,
      outcome
    )
    case T.InvocationCacheCreated{T.CacheToken{+actual, _}}: token_owner(
      Nat.is_eq(expected, actual),
      expected,
      actual,
      outcome
    )
    case T.AccessResult{T.AccessAllowed{T.SelectionToken{+actual, _}, _}}: token_owner(
      Nat.is_eq(expected, actual),
      expected,
      actual,
      outcome
    )
    case T.CacheResult{T.CachePresent{T.CaptureToken{+actual, _}, _}}: token_owner(
      Nat.is_eq(expected, actual),
      expected,
      actual,
      outcome
    )
    case T.CaptureResult{T.SourceCaptured{T.CaptureToken{+actual, _}, _, _}}: token_owner(
      Nat.is_eq(expected, actual),
      expected,
      actual,
      outcome
    )
    case T.ProviderRejected{T.ExceptionToken{+actual, _}}: token_owner(
      Nat.is_eq(expected, actual),
      expected,
      actual,
      outcome
    )
    case _: CheckedOutcome{outcome}

def check_matching(matches: Bool, outcome: T.ServiceOutcome, owner: Nat) -> CheckedReply:
  match matches:
    case True{}: output_owner(owner, outcome)
    case False{}: RejectedReply{T.WrongReplyKind{}}

def check_correlation(same: Bool, expected: Nat, actual: Nat, operation: T.Operation,
    +outcome: T.ServiceOutcome, owner: Nat) -> CheckedReply:
  match same:
    case False{}: RejectedReply{T.WrongCorrelation{expected, actual}}
    case True{}: check_matching(matching(operation, outcome), outcome, owner)

def check_owner(same: Bool, +expected: Nat, actual: Nat, +id: Nat, +reply_id: Nat,
    operation: T.Operation, outcome: T.ServiceOutcome) -> CheckedReply:
  match same:
    case False{}: RejectedReply{T.WrongInvocation{expected, actual}}
    case True{}: check_correlation(
      Nat.is_eq(id, reply_id),
      id,
      reply_id,
      operation,
      outcome,
      expected
    )

def check(request: T.Request, reply: T.Reply) -> CheckedReply:
  match request reply:
    case T.Request{+owner, id, operation} T.Reply{+reply_owner, reply_id, +outcome}:
      check_owner(
        Nat.is_eq(owner, reply_owner),
        owner,
        reply_owner,
        id,
        reply_id,
        operation,
        outcome
      )

def main() -> Unit:
  Unit{}
