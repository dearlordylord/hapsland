import Base

# Content-boundary specification, NOT the resident scheduler. Strings stand for
# exact encoded content, not hashes. The host must establish their provenance.
type Review is Data:
  Review{model: String, state: String, questions: String}

type Private is Data:
  Private{prompt: String, conversation: String, derived: String, inspection: String, attribution: String}

type Envelope is Data:
  Envelope{review: Review, private: Private}

type Request is Data:
  Request{model: String, state: String, questions: String}

def empty_private() -> Private:
  Private{"", "", "", "", ""}

def project(envelope: Envelope) -> Request:
  match envelope:
    case Envelope{Review{model, state, questions}, _}:
      Request{model, state, questions}

def erase_envelope(envelope: Envelope) -> Envelope:
  match envelope:
    case Envelope{review, _}: Envelope{review, empty_private()}

# A stored snapshot can be replaced, cleared or dispatched repeatedly. Recovery
# is a supplied snapshot: proving that storage supplies the right snapshot is a
# separate host obligation. No timing/admission/liveness claim is made here.
type ContentEvent is Data:
  Stage{envelope: Envelope}
  Recover{envelope: Envelope}
  PrivateChanged{private: Private}
  Send{}
  Retry{}
  Cancel{}

type State is Data:
  State{pending: Maybe<&2, Envelope>, private: Private, sent: List<&2, Request>}

def erase_pending(pending: Maybe<&2, Envelope>) -> Maybe<&2, Envelope>:
  match pending:
    case None{}: None{}
    case Some{envelope}: Some{erase_envelope(envelope)}

def erase_state(state: State) -> State:
  match state:
    case State{pending, _, sent}: State{erase_pending(pending), empty_private(), sent}

def erase_event(event: ContentEvent) -> ContentEvent:
  match event:
    case Stage{envelope}: Stage{erase_envelope(envelope)}
    case Recover{envelope}: Recover{erase_envelope(envelope)}
    case PrivateChanged{_}: PrivateChanged{empty_private()}
    case Send{}: Send{}
    case Retry{}: Retry{}
    case Cancel{}: Cancel{}

def transmit(pending: Maybe<&2, Envelope>, private: Private, sent: List<&2, Request>) -> State:
  match pending:
    case None{}: State{None{}, private, sent}
    case Some{+envelope}: State{Some{envelope}, private, project(envelope) <> sent}

def step(event: ContentEvent, state: State) -> State:
  match event state:
    case Stage{envelope} State{_, private, sent}: State{Some{envelope}, private, sent}
    case Recover{envelope} State{_, private, sent}: State{Some{envelope}, private, sent}
    case PrivateChanged{private} State{pending, _, sent}: State{pending, private, sent}
    case Send{} State{pending, private, sent}: transmit(pending, private, sent)
    case Retry{} State{pending, private, sent}: transmit(pending, private, sent)
    case Cancel{} State{_, private, sent}: State{None{}, private, sent}

def run(events: List<&2, ContentEvent>, state: State) -> State:
  match events:
    case Nil{}: state
    case event <> rest: run(rest, step(event, state))

def erase_events(events: List<&2, ContentEvent>) -> List<&2, ContentEvent>:
  match events:
    case Nil{}: Nil{}
    case event <> rest: erase_event(event) <> erase_events(rest)

# Private-only notifications may be inserted or removed, not merely replaced.
def public_events(events: List<&2, ContentEvent>) -> List<&2, ContentEvent>:
  match events:
    case Nil{}: Nil{}
    case PrivateChanged{_} <> rest: public_events(rest)
    case event <> rest: erase_event(event) <> public_events(rest)
