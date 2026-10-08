import Base

# Draft pure warning decisions. Host owns recipient identity, clock and atomic budget publication.
type Operation is Data:
  Hello{}
  Admit{}
  AdmitAndCollect{}
  EditPolicy{}
  PromptMarker{}
  RegisterEdit{}
  Collect{}
  Other{}

type Override is Data:
  Automatic{}
  Explicit{value: Bool}

def incompatible(operation: Operation, contract_present: Bool, contract_current: Bool) -> Bool:
  match operation:
    case Hello{}: False{}
    case _: Bool.pick(
      Bool,
      contract_present,
      Bool.pick(Bool, contract_current, False{}, True{}),
      False{}
    )

def automatic_opportunity(operation: Operation, recipient_pi: Bool, ordinary: Bool) -> Bool:
  match operation:
    case Admit{}: True{}
    case AdmitAndCollect{}: True{}
    case EditPolicy{}: True{}
    case PromptMarker{}: True{}
    case RegisterEdit{}: Bool.pick(Bool, recipient_pi, False{}, True{})
    case Collect{}: ordinary
    case _: False{}

def opportunity(
  override: Override,
  operation: Operation,
  recipient_pi: Bool,
  ordinary: Bool
) -> Bool:
  match override:
    case Explicit{value}: value
    case Automatic{}: automatic_opportunity(operation, recipient_pi, ordinary)

def grant(already_warned: Bool, capacity_full: Bool) -> Bool:
  Bool.pick(Bool, already_warned, False{}, Bool.pick(Bool, capacity_full, False{}, True{}))
