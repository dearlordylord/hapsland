import Base

# Delivery-local source verification and capture-cache policy. Buffers remain
# native capabilities; current versus unavailable remains a three-way result.
type SMatch is Data:
  SUnavailable{}
  SCurrent{current: Bool}
type SCommand is Data:
  SVerify{member: Nat}
  SRecord{member: Nat, current: Bool}
  SCheckDrop{remaining: Nat, aborted: Bool}
  SClear{}
type SResponse is Data:
  SVerified{result: SMatch}
  STruth{value: Bool}
  SAck{}
type SPhase is Data:
  SMember{member: Nat, remaining: List<&2, Nat>, count: Nat}
  SRecorded{remaining: List<&2, Nat>, count: Nat}
  SDropChecked{remaining: List<&2, Nat>, count: Nat}
  SCleared{remaining: List<&2, Nat>, count: Nat}
  SCleanupChecked{}
  SCleanupCleared{}
type SRequest is Data:
  SRequest{invocation: Nat, id: Nat, command: SCommand}
type SReply is Data:
  SReply{invocation: Nat, id: Nat, response: SResponse}
type SStep is Data:
  SAwait{invocation: Nat, id: Nat, phase: SPhase, request: SRequest}
  SDone{}
  SRejected{}

def s_issue(+invocation: Nat, +id: Nat, +phase: SPhase, +command: SCommand) -> SStep:
  SAwait{invocation, id, phase, SRequest{invocation, id, command}}

def s_members(+members: List<&2, Nat>, +invocation: Nat, +next: Nat, +count: Nat) -> SStep:
  match members:
    case Nil{}: SDone{}
    case +member <> +remaining:
      s_issue(invocation, next, SMember{member, remaining, count}, SVerify{member})

def source_initial(+invocation: Nat, +members: List<&2, Nat>) -> SStep:
  s_members(members, invocation, 1n, List.length(&2, Nat, members))

def source_cleanup(+invocation: Nat) -> SStep:
  s_issue(invocation, 1n, SCleanupChecked{}, SCheckDrop{0n, True{}})

def s_drop(+invocation: Nat, +next: Nat, +remaining: List<&2, Nat>, +count: Nat) -> SStep:
  s_issue(
    invocation,
    next,
    SDropChecked{remaining, Nat.sub(count, 1n)},
    SCheckDrop{Nat.sub(count, 1n), False{}}
  )

def s_phase(+invocation: Nat, +next: Nat, +phase: SPhase, +response: SResponse) -> SStep:
  match phase response:
    case SMember{+member, +remaining, +count} SVerified{SCurrent{+current}}:
      s_issue(invocation, next, SRecorded{remaining, count}, SRecord{member, current})
    case SMember{_, +remaining, +count} SVerified{SUnavailable{}}: s_drop(
      invocation,
      next,
      remaining,
      count
    )
    case SRecorded{+remaining, +count} SAck{}: s_drop(invocation, next, remaining, count)
    case SDropChecked{+remaining, +count} STruth{True{}}: s_issue(
      invocation,
      next,
      SCleared{remaining, count},
      SClear{}
    )
    case SDropChecked{+remaining, +count} STruth{False{}}: s_members(
      remaining,
      invocation,
      next,
      count
    )
    case SCleared{+remaining, +count} SAck{}: s_members(remaining, invocation, next, count)
    case SCleanupChecked{} STruth{True{}}: s_issue(invocation, next, SCleanupCleared{}, SClear{})
    case SCleanupChecked{} STruth{False{}}: SDone{}
    case SCleanupCleared{} SAck{}: SDone{}
    case _ _: SRejected{}

def s_accept(
  +valid: Bool,
  +invocation: Nat,
  +id: Nat,
  +phase: SPhase,
  +response: SResponse
) -> SStep:
  match valid:
    case False{}: SRejected{}
    case True{}: s_phase(invocation, Nat.add(id, 1n), phase, response)

def source_resume(+step: SStep, +reply: SReply) -> SStep:
  match step reply:
    case SAwait{+invocation, +id, +phase, SRequest{+owner, +request, _}} SReply{
      +other,
      +received,
      +response
    }:
      s_accept(
        Bool.and(
          Nat.is_eq(invocation, other),
          Bool.and(
            Nat.is_eq(owner, other),
            Bool.and(Nat.is_eq(id, received), Nat.is_eq(request, received))
          )
        ),
        invocation,
        id,
        phase,
        response
      )
    case _ _: SRejected{}

# Capture callbacks use this same owner's pure policy entry. This does not hold
# a second continuation or serialize callbacks that the caller runs concurrently.
type SCache is Data:
  SClosed{}
  SMissing{}
  SCaptured{oversize: Bool}
  SFailed{size_limit: Bool, larger_limit: Bool}
type SCaptureRoute is Data:
  SCaptureUnavailable{}
  SCaptureRead{}
  SCaptureCached{}
  SCaptureLimit{}

def s_captured_route(+oversize: Bool) -> SCaptureRoute:
  match oversize:
    case True{}: SCaptureLimit{}
    case False{}: SCaptureCached{}

def s_failed_route(+retry: Bool) -> SCaptureRoute:
  match retry:
    case True{}: SCaptureRead{}
    case False{}: SCaptureCached{}

def source_capture(+cache: SCache) -> SCaptureRoute:
  match cache:
    case SClosed{}: SCaptureUnavailable{}
    case SMissing{}: SCaptureRead{}
    case SCaptured{+oversize}: s_captured_route(oversize)
    case SFailed{+size_limit, +larger_limit}: s_failed_route(Bool.and(size_limit, larger_limit))
