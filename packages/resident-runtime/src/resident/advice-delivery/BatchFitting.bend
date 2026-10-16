import Base

# Delivery-local indices only. Canonical owns advice/lease/revision authority.
# Native iterators preserve lazy input reads; Bend owns staging and selection.
# Measurements are opaque handles so IEEE values reach the offer unchanged.
type Mode is Data:
  Findings{}
  CurrentFindings{}
  Notices{skip_unfitting: Bool}
type Stream is Data:
  Retained{}
  Candidates{}
  CurrentOffers{}
  NoticeOffers{}
type Batch is Data:
  Batch{mode: Mode, staged: List<&2, Nat>, selected: List<&2, Nat>}
type Command is Data:
  BeginCurrent{}
  Pull{stream: Stream}
  MeasureProspective{staged: List<&2, Nat>, index: Nat}
  MeasureSolo{index: Nat}
  OfferFinding{index: Nat, retained: Bool, selected_count: Nat, prospective: Nat, solo: Nat}
  NotifyLimited{index: Nat}
  OfferNotice{index: Nat, prospective: Nat, skip_unfitting: Bool}
type Response is Data:
  CurrentStarted{}
  Found{index: Nat}
  Exhausted{}
  Measured{handle: Nat}
  Selected{}
  Limited{}
  Omitted{}
  Included{}
  Skipped{}
  Stopped{}
  InvalidNotice{}
  Ack{}
  Failed{}
type Phase is Data:
  CurrentStarting{}
  Pulling{batch: Batch, stream: Stream}
  Prospective{batch: Batch, stream: Stream, index: Nat}
  Solo{batch: Batch, stream: Stream, index: Nat, prospective: Nat}
  FindingOffered{batch: Batch, stream: Stream, index: Nat}
  LimitedPending{batch: Batch, stream: Stream}
  NoticeOffered{batch: Batch, index: Nat}
type Request is Data:
  Request{invocation: Nat, id: Nat, command: Command}
type State is Data:
  State{invocation: Nat, next: Nat, phase: Phase}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, response: Response}
type Step is Data:
  Await{state: State, request: Request}
  Finished{selected: List<&2, Nat>}
  Rejected{}

def issue(+invocation: Nat, +next: Nat, phase: Phase, command: Command) -> Step:
  Await{State{invocation, (next + 1n : Nat), phase}, Request{invocation, next, command}}

def pull(invocation: Nat, next: Nat, batch: Batch, +stream: Stream) -> Step:
  issue(invocation, next, Pulling{batch, stream}, Pull{stream})

def initial(invocation: Nat, +mode: Mode) -> Step:
  match mode:
    case Findings{}: pull(invocation, 0n, Batch{mode, [], []}, Retained{})
    case CurrentFindings{}: issue(invocation, 0n, CurrentStarting{}, BeginCurrent{})
    case Notices{_}: pull(invocation, 0n, Batch{mode, [], []}, NoticeOffers{})

def appended(stream: Stream, index: Nat, selected: List<&2, Nat>) -> List<&2, Nat>:
  match stream:
    case Retained{}: selected
    case _: List.append(&2, Nat, selected, [index])

def retained(stream: Stream) -> Bool:
  match stream:
    case Retained{}: True{}
    case _: False{}

def accepted(invocation: Nat, next: Nat, batch: Batch, +stream: Stream, +index: Nat) -> Step:
  match batch:
    case Batch{mode, staged, selected}:
      pull(invocation, next, Batch{mode, List.append(&2, Nat, staged, [index]),
        appended(stream, index, selected)}, stream)

def omitted(invocation: Nat, next: Nat, batch: Batch, +stream: Stream) -> Step:
  match stream:
    case Retained{}: Finished{[]}
    case _: pull(invocation, next, batch, stream)

def limited(invocation: Nat, next: Nat, batch: Batch, +stream: Stream, index: Nat) -> Step:
  match stream:
    case Retained{}: Finished{[]}
    case _: issue(invocation, next, LimitedPending{batch, stream}, NotifyLimited{index})

def measured_prospective(
  invocation: Nat,
  next: Nat,
  +batch: Batch,
  stream: Stream,
  +index: Nat,
  prospective: Nat
) -> Step:
  match batch:
    case Batch{Notices{skip_unfitting}, _, _}:
      issue(
        invocation,
        next,
        NoticeOffered{batch, index},
        OfferNotice{index, prospective, skip_unfitting}
      )
    case _:
      issue(invocation, next, Solo{batch, stream, index, prospective}, MeasureSolo{index})

def measured_solo(invocation: Nat, next: Nat, +batch: Batch, +stream: Stream, +index: Nat,
    prospective: Nat, solo: Nat) -> Step:
  match batch:
    case Batch{_, staged, _}:
      issue(invocation, next, FindingOffered{batch, stream, index},
        OfferFinding{index, retained(stream), List.length(&2, Nat, staged), prospective, solo})

def exhausted(invocation: Nat, next: Nat, +batch: Batch, stream: Stream) -> Step:
  match batch stream:
    case _ Retained{}: pull(invocation, next, batch, Candidates{})
    case Batch{_, _, selected} _: Finished{selected}

def finding_response(
  invocation: Nat,
  next: Nat,
  batch: Batch,
  stream: Stream,
  index: Nat,
  response: Response
) -> Step:
  match response:
    case Selected{}: accepted(invocation, next, batch, stream, index)
    case Limited{}: limited(invocation, next, batch, stream, index)
    case Omitted{}: omitted(invocation, next, batch, stream)
    case _: Rejected{}

def notice_response(
  invocation: Nat,
  next: Nat,
  +batch: Batch,
  index: Nat,
  response: Response
) -> Step:
  match batch response:
    case _ Included{}: accepted(invocation, next, batch, NoticeOffers{}, index)
    case _ Skipped{}: pull(invocation, next, batch, NoticeOffers{})
    case Batch{_, _, selected} Stopped{}: Finished{selected}
    case _ InvalidNotice{}: Finished{[]}
    case _ _: Rejected{}

def match_found(invocation: Nat, next: Nat, +batch: Batch, stream: Stream, +index: Nat) -> Step:
  match batch:
    case Batch{_, staged, _}:
      issue(invocation, next, Prospective{batch, stream, index}, MeasureProspective{staged, index})

def phase_response(invocation: Nat, next: Nat, phase: Phase, response: Response) -> Step:
  match phase response:
    case CurrentStarting{} CurrentStarted{}: pull(
      invocation,
      next,
      Batch{CurrentFindings{}, [], []},
      CurrentOffers{}
    )
    case CurrentStarting{} Exhausted{}: Finished{[]}
    case Pulling{+batch, +stream} Found{+index}:
      match_found(invocation, next, batch, stream, index)
    case Pulling{batch, stream} Exhausted{}: exhausted(invocation, next, batch, stream)
    case Prospective{batch, stream, index} Measured{handle}:
      measured_prospective(invocation, next, batch, stream, index, handle)
    case Solo{batch, stream, index, prospective} Measured{handle}:
      measured_solo(invocation, next, batch, stream, index, prospective, handle)
    case FindingOffered{batch, stream, index} _:
      finding_response(invocation, next, batch, stream, index, response)
    case LimitedPending{batch, stream} Ack{}: pull(invocation, next, batch, stream)
    case NoticeOffered{batch, index} _: notice_response(invocation, next, batch, index, response)
    case _ _: Rejected{}

def matching_response(invocation: Nat, next: Nat, phase: Phase, response: Response) -> Step:
  match response:
    case Failed{}: Finished{[]}
    case _: phase_response(invocation, next, phase, response)

def correlated(matches: Bool, state: State, response: Response) -> Step:
  match matches state:
    case False{} _: Rejected{}
    case True{} State{invocation, next, phase}: matching_response(invocation, next, phase, response)

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Await{State{+invocation, +next, phase}, _} Reply{actual, id, response}:
      correlated(Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(next, (id + 1n : Nat))),
        State{invocation, next, phase}, response)
    case _ _: Rejected{}

def failure() -> Step:
  Finished{[]}

def main() -> Unit:
  Unit{}
