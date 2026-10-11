import Base
import ./BoundaryValidationSpecification.bend as B
import ./Types.bend as T
def token_0() -> {
  B.check(T.Request{1n, 1n, T.StartClock{}}, T.Reply{1n, 1n, T.ClockStarted{T.ClockToken{2n, 1n}}})
  == Some{T.WrongInvocation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def token_1() -> {
  B.check(
    T.Request{1n, 1n, T.CreateInvocationCache{}},
    T.Reply{1n, 1n, T.InvocationCacheCreated{T.CacheToken{2n, 1n}}}
  )
  == Some{T.WrongInvocation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def token_2() -> {
  B.check(
    T.Request{1n, 1n, T.AccessPath{""}},
    T.Reply{1n, 1n, T.AccessResult{T.AccessAllowed{T.SelectionToken{2n, 1n}, ""}}}
  )
  == Some{T.WrongInvocation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def token_3() -> {
  B.check(
    T.Request{1n, 1n, T.LookupCaptureCache{T.CacheToken{1n, 1n}, ""}},
    T.Reply{1n, 1n, T.CacheResult{T.CachePresent{T.CaptureToken{2n, 1n}, 0n}}}
  )
  == Some{T.WrongInvocation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def token_4() -> {
  B.check(
    T.Request{1n, 1n, T.CaptureSource{T.SelectionToken{1n, 1n}, 1n}},
    T.Reply{1n, 1n, T.CaptureResult{T.SourceCaptured{T.CaptureToken{2n, 1n}, "", 0n}}}
  )
  == Some{T.WrongInvocation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def token_5() -> {
  B.check(
    T.Request{1n, 1n, T.StartClock{}},
    T.Reply{1n, 1n, T.ProviderRejected{T.ExceptionToken{2n, 1n}}}
  )
  == Some{T.WrongInvocation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def priority_0() -> {
  B.check(T.Request{1n, 1n, T.StartClock{}}, T.Reply{2n, 2n, T.ClockRead{T.Binary64{0, 0}}})
  == Some{T.WrongInvocation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def priority_1() -> {
  B.check(T.Request{1n, 1n, T.StartClock{}}, T.Reply{1n, 2n, T.ClockRead{T.Binary64{0, 0}}})
  == Some{T.WrongCorrelation{1n, 2n}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def priority_2() -> {
  B.check(T.Request{1n, 1n, T.StartClock{}}, T.Reply{1n, 1n, T.ClockRead{T.Binary64{0, 0}}})
  == Some{T.WrongReplyKind{}}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def valid() -> {
  B.check(T.Request{1n, 1n, T.StartClock{}}, T.Reply{1n, 1n, T.ClockStarted{T.ClockToken{1n, 1n}}})
  == None{}
  : Maybe<&2, T.TechnicalFailure>
}:
  {==}
def main() -> Unit:
  Unit{}
