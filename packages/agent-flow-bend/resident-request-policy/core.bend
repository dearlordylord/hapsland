import Base

# Source-free request entry decisions; native host retains snapshot, identity and response payloads.
type Operation is Data:
  Hello{}
  RegisterEdit{}
  Admit{}
  AdmitAndCollect{}
  BeginStop{}
  Other{}

type LifetimePlan is Data:
  RequestContinue{}
  RequestReady{}
  RequestObsolete{}
  RequestEditLost{}

def needs_sweep(operation: Operation) -> Bool:
  match operation:
    case RegisterEdit{}: True{}
    case Admit{}: True{}
    case AdmitAndCollect{}: True{}
    case BeginStop{}: True{}
    case _: False{}

def unsupported(operation: Operation, direct_opencode: Bool, observation_opencode: Bool) -> Bool:
  match operation:
    case Admit{}: Bool.pick(Bool, direct_opencode, True{}, observation_opencode)
    case AdmitAndCollect{}: Bool.pick(Bool, direct_opencode, True{}, observation_opencode)
    case _: direct_opencode

def needs_snapshot(operation: Operation, lifetime_matched: Bool) -> Bool:
  match operation:
    case Hello{}: True{}
    case _: lifetime_matched

def ordinary_lifetime(matched: Bool, active: Bool, edit: Bool) -> LifetimePlan:
  match matched active:
    case True{} True{}: RequestContinue{}
    case _ _: Bool.pick(LifetimePlan, edit, RequestEditLost{}, RequestObsolete{})

def lifetime(operation: Operation, matched: Bool, active: Bool, edit: Bool) -> LifetimePlan:
  match operation:
    case Hello{}: Bool.pick(LifetimePlan, active, RequestReady{}, RequestObsolete{})
    case _: ordinary_lifetime(matched, active, edit)
