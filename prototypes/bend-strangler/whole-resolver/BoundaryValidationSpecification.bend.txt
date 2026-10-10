import Base
import ./Types.bend as T

# Independent reference envelope contract. Preserve the rejection precedence:
# reply owner, correlation, operation/outcome variant, returned resource owner.
# Graph selection and consumption happen only after this validation succeeds.
def compatible(operation: T.Operation, outcome: T.ServiceOutcome) -> Bool:
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

def owner(+expected: Nat, +actual: Nat) -> Maybe<&2, T.TechnicalFailure>:
  Bool.pick(Maybe<&2, T.TechnicalFailure>, Nat.is_eq(expected, actual),
    None{}, Some{T.WrongInvocation{expected, actual}})

def resource_owner(expected: Nat, outcome: T.ServiceOutcome) -> Maybe<&2, T.TechnicalFailure>:
  match outcome:
    case T.ClockStarted{T.ClockToken{actual, _}}: owner(expected, actual)
    case T.InvocationCacheCreated{T.CacheToken{actual, _}}: owner(expected, actual)
    case T.AccessResult{T.AccessAllowed{T.SelectionToken{actual, _}, _}}: owner(expected, actual)
    case T.CacheResult{T.CachePresent{T.CaptureToken{actual, _}, _}}: owner(expected, actual)
    case T.CaptureResult{T.SourceCaptured{T.CaptureToken{actual, _}, _, _}}: owner(expected, actual)
    case T.ProviderRejected{T.ExceptionToken{actual, _}}: owner(expected, actual)
    case _: None{}

def variant(
  matches: Bool,
  expected: Nat,
  outcome: T.ServiceOutcome
) -> Maybe<&2, T.TechnicalFailure>:
  match matches:
    case False{}: Some{T.WrongReplyKind{}}
    case True{}: resource_owner(expected, outcome)

def correlation(same: Bool, expected: Nat, actual: Nat, invocation: Nat,
    operation: T.Operation, +outcome: T.ServiceOutcome) -> Maybe<&2, T.TechnicalFailure>:
  match same:
    case False{}: Some{T.WrongCorrelation{expected, actual}}
    case True{}: variant(compatible(operation, outcome), invocation, outcome)

def header(same: Bool, expected: Nat, actual: Nat, +id: Nat, +reply_id: Nat,
    operation: T.Operation, outcome: T.ServiceOutcome) -> Maybe<&2, T.TechnicalFailure>:
  match same:
    case False{}: Some{T.WrongInvocation{expected, actual}}
    case True{}: correlation(Nat.is_eq(id, reply_id), id, reply_id, expected, operation, outcome)

def check(request: T.Request, reply: T.Reply) -> Maybe<&2, T.TechnicalFailure>:
  match request reply:
    case T.Request{+expected, id, operation} T.Reply{+actual, reply_id, outcome}:
      header(Nat.is_eq(expected, actual), expected, actual, id, reply_id, operation, outcome)

def main() -> Unit:
  Unit{}
