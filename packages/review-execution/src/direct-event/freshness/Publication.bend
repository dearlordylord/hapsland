import Base
import ./PublicationRetention.bend as Retention

# Complete publication prefix composed with the existing retention suffix.
# All original handles remain lazy. The host performs primitives and IO only.
type Input is Data:
  Input{observation: Nat, evaluations: Nat, context: Nat, authority: Bool}
type Lens is Data:
  Lens{object: Nat, fields: List<&2, String>}
type Query is Data:
  Read{value: Lens}
  Truthy{value: Lens}
  Equal{left: Lens, right: Lens}
  AdviceeEqual{left: Lens, right: Lens}
  EqualValues{left: Nat, right: Nat}
  Identity{input: Nat}
  Length{array: Nat}
  Element{array: Nat, index: Nat}
  VerifyRoot{observation: Nat}
  NewMap{}
  NewSet{}
  MapGet{map: Nat, key: Nat}
  SetAdd{set: Nat, value: Nat}
  MapSet{map: Nat, key: Nat, value: Nat}
  Iterator{array: Nat}
  IteratorNext{iterator: Nat}
  Prepare{input: Input, names: Nat}
  StatusReady{outcome: Nat}
  FreshArray{values: List<&2, Nat>}
  RetentionQuery{query: Retention.Query}
type Response is Data:
  Handle{value: Nat}
  Flag{value: Bool}
  Count{value: Nat}
  Missing{}
  End{}
  Acknowledged{}
  RetentionResponse{response: Retention.Response}
type Frame is Data:
  Frame{invocation: Nat, request: Nat}
type Cursor is Data:
  Cursor{array: Nat, index: Nat, length: Nat}
type Stage is Data:
  Attribution{}
  Validity{}
type Names is Data:
  Names{input: Input, map: Nat, iterator: Nat}
type Named is Data:
  Named{names: Names, input: Nat, set: Nat}
type Next is Data:
  Controlled{input: Input}
  Advicee{input: Input}
  Sized{input: Input, stage: Stage}
  Item{input: Input, stage: Stage, cursor: Cursor}
  AttributePrepared{input: Input, cursor: Cursor}
  AttributeRoot{input: Input, cursor: Cursor, prepared: Nat}
  AttributeAdvicee{input: Input, cursor: Cursor}
  Nonempty{input: Input}
  EvaluationIdentity{input: Input, cursor: Cursor, evaluation: Nat}
  EvaluationInput{input: Input, cursor: Cursor, evaluation: Nat, identity: Nat}
  IdentityValue{input: Input, cursor: Cursor, evaluation: Nat, identity: Nat}
  IdentityEqual{input: Input, cursor: Cursor, evaluation: Nat}
  Findings{input: Input, cursor: Cursor, evaluation: Nat}
  FindingsSized{input: Input, cursor: Cursor, evaluation: Nat, findings: Nat}
  Finding{input: Input, cursor: Cursor, evaluation: Nat, findings: Cursor}
  FindingIdentity{input: Input, cursor: Cursor, evaluation: Nat, findings: Cursor, finding: Nat}
  FindingPath{input: Input, cursor: Cursor, evaluation: Nat, findings: Cursor, finding: Nat}
  FindingName{input: Input, cursor: Cursor, evaluation: Nat, findings: Cursor}
  Root{input: Input}
  MapCreated{input: Input}
  NamesIterator{input: Input, map: Nat}
  NamesItem{names: Names}
  NamesInput{names: Names}
  NamesPath{names: Names, input: Nat}
  NamesSet{names: Names, input: Nat}
  NamesSetCreated{names: Names, input: Nat}
  NamesName{named: Named}
  NameAdded{named: Named}
  SecondPath{named: Named}
  PathSet{names: Names}
  Prepared{input: Input}
  Outcomes{input: Input}
  OutcomesSized{input: Input, outcomes: Nat}
  Outcome{input: Input, cursor: Cursor, current: List<&2, Nat>}
  OutcomeReady{input: Input, cursor: Cursor, current: List<&2, Nat>, outcome: Nat}
  OutcomePrepared{input: Input, cursor: Cursor, current: List<&2, Nat>}
  CurrentArray{input: Input}
  RetentionNext{step: Retention.Step}
type Status is Data:
  Unattributed{}
  Unavailable{}
  Stale{}
  Current{}
type Step is Data:
  Await{frame: Frame, query: Query, next: Next}
  Completed{status: Status, evaluations: List<&2, Nat>, findings: List<&2, Nat>}
  InvalidReply{}
type Reply is Data:
  Reply{invocation: Nat, request: Nat, response: Response}

def observation(input: Input) -> Nat:
  match input:
    case Input{value, _, _, _}: value

def evaluations(input: Input) -> Nat:
  match input:
    case Input{_, value, _, _}: value

def context(input: Input) -> Nat:
  match input:
    case Input{_, _, value, _}: value

def cursor_next(cursor: Cursor) -> Cursor:
  match cursor:
    case Cursor{array, index, length}: Cursor{array, Nat.add(index, 1n), length}

def ask(frame: Frame, query: Query, next: Next) -> Step:
  Await{frame, query, next}

def unavailable() -> Step:
  Completed{Unavailable{}, [], []}

def unattributed() -> Step:
  Completed{Unattributed{}, [], []}

def suffix_status(status: Retention.Status) -> Status:
  match status:
    case Retention.Current{}: Current{}
    case Retention.Stale{}: Stale{}
    case Retention.Unavailable{}: Unavailable{}

def suffix(+step: Retention.Step) -> Step:
  match step:
    case Retention.Await{Retention.Frame{invocation, request}, query, _}:
      ask(Frame{invocation, request}, RetentionQuery{query}, RetentionNext{step})
    case Retention.Completed{status, evaluations, findings}:
      Completed{suffix_status(status), evaluations, findings}
    case Retention.InvalidReply{}: InvalidReply{}

def retain(frame: Frame, input: Input, current: Nat) -> Step:
  match frame input:
    case Frame{invocation, request} Input{_, evaluations, _, authority}:
      suffix(
        Retention.start(
          Retention.Frame{invocation, request},
          Retention.Input{evaluations, current, authority}
        )
      )

def suffix_returned(step: Retention.Step, frame: Frame, value: Retention.Response) -> Step:
  match frame:
    case Frame{invocation, request}:
      suffix(Retention.resume(step, Retention.Reply{invocation, Nat.sub(request, 1n), value}))

def prepare(frame: Frame, +input: Input, map: Nat) -> Step:
  ask(frame, Prepare{input, map}, Prepared{input})

def names_next(frame: Frame, +names: Names) -> Step:
  match names:
    case Names{_, _, iterator}: ask(frame, IteratorNext{iterator}, NamesItem{names})

def names_item(frame: Frame, +names: Names, value: Response) -> Step:
  match names value:
    case Names{input, map, _} End{}: prepare(frame, input, map)
    case _ Handle{evaluation}: ask(
      frame,
      Read{Lens{evaluation, ["prepared", "input"]}},
      NamesInput{names}
    )
    case _ _: InvalidReply{}

def names_set(frame: Frame, names: Names, +input: Nat, value: Response) -> Step:
  match value:
    case Handle{+set}: ask(
      frame,
      Read{Lens{input, ["declaration", "name"]}},
      NamesName{Named{names, input, set}}
    )
    case Missing{}: ask(frame, NewSet{}, NamesSetCreated{names, input})
    case _: InvalidReply{}

def names_path(frame: Frame, +names: Names, input: Nat, path: Nat) -> Step:
  match names:
    case Names{_, map, _}: ask(frame, MapGet{map, path}, NamesSet{names, input})

def names_name(frame: Frame, +named: Named, value: Nat) -> Step:
  match named:
    case Named{_, _, set}: ask(frame, SetAdd{set, value}, NameAdded{named})

def name_added(frame: Frame, +named: Named) -> Step:
  match named:
    case Named{_, input, _}: ask(frame, Read{Lens{input, ["path"]}}, SecondPath{named})

def names_path_set(frame: Frame, +names: Names, set: Nat, path: Nat) -> Step:
  match names:
    case Names{_, map, _}: ask(frame, MapSet{map, path, set}, PathSet{names})

def second_path(frame: Frame, named: Named, path: Nat) -> Step:
  match named:
    case Named{+names, _, set}:
      names_path_set(frame, names, set, path)

# Keep Map.set after the second path getter.
def outcomes_live(
  frame: Frame,
  input: Input,
  +cursor: Cursor,
  current: List<&2, Nat>,
  live: Bool
) -> Step:
  match cursor live:
    case Cursor{array, index, _} True{}: ask(
      frame,
      Element{array, index},
      Outcome{input, cursor, current}
    )
    case _ False{}: ask(frame, FreshArray{Retention.reverse(current)}, CurrentArray{input})

def outcomes_next(frame: Frame, input: Input, +cursor: Cursor, current: List<&2, Nat>) -> Step:
  match cursor:
    case Cursor{_, index, length}: outcomes_live(
      frame,
      input,
      cursor,
      current,
      Nat.is_lt(index, length)
    )

def outcome(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  current: List<&2, Nat>,
  value: Response
) -> Step:
  match value:
    case Missing{}: outcomes_next(frame, input, cursor_next(cursor), current)
    case Handle{+item}: ask(frame, StatusReady{item}, OutcomeReady{input, cursor, current, item})
    case _: InvalidReply{}

def outcome_ready(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  current: List<&2, Nat>,
  item: Nat,
  ready: Bool
) -> Step:
  match ready:
    case True{}: ask(frame, Read{Lens{item, ["prepared"]}}, OutcomePrepared{input, cursor, current})
    case False{}: outcomes_next(frame, input, cursor_next(cursor), current)

def scan_live(frame: Frame, +input: Input, +stage: Stage, +cursor: Cursor, live: Bool) -> Step:
  match stage cursor live:
    case _ Cursor{array, index, _} True{}: ask(
      frame,
      Element{array, index},
      Item{input, stage, cursor}
    )
    case Attribution{} _ False{}: ask(frame, Length{evaluations(input)}, Nonempty{input})
    case Validity{} _ False{}: ask(frame, VerifyRoot{observation(input)}, Root{input})

def scan(frame: Frame, input: Input, stage: Stage, +cursor: Cursor) -> Step:
  match cursor:
    case Cursor{_, index, length}: scan_live(frame, input, stage, cursor, Nat.is_lt(index, length))

def findings_live(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  evaluation: Nat,
  +findings: Cursor,
  live: Bool
) -> Step:
  match findings live:
    case Cursor{array, index, _} True{}: ask(
      frame,
      Element{array, index},
      Finding{input, cursor, evaluation, findings}
    )
    case _ False{}: scan(frame, input, Validity{}, cursor_next(cursor))

def findings_next(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  evaluation: Nat,
  +findings: Cursor
) -> Step:
  match findings:
    case Cursor{_, index, length}: findings_live(
      frame,
      input,
      cursor,
      evaluation,
      findings,
      Nat.is_lt(index, length)
    )

def item(frame: Frame, input: Input, stage: Stage, cursor: Cursor, value: Response) -> Step:
  match stage value:
    case _ Missing{}: scan(frame, input, stage, cursor_next(cursor))
    case Attribution{} Handle{evaluation}: ask(
      frame,
      Read{Lens{evaluation, ["prepared"]}},
      AttributePrepared{input, cursor}
    )
    case Validity{} Handle{+evaluation}: ask(
      frame,
      Read{Lens{evaluation, ["prepared", "identity"]}},
      EvaluationIdentity{input, cursor, evaluation}
    )
    case _ _: InvalidReply{}

def controlled(frame: Frame, +input: Input, valid: Bool) -> Step:
  match valid:
    case False{}: unattributed()
    case True{}: ask(
      frame,
      AdviceeEqual{Lens{observation(input), ["advicee"]}, Lens{context(input), ["advicee"]}},
      Advicee{input}
    )

def advicee(frame: Frame, +input: Input, valid: Bool) -> Step:
  match valid:
    case False{}: unattributed()
    case True{}: ask(frame, Length{evaluations(input)}, Sized{input, Attribution{}})

def nonempty(frame: Frame, +input: Input, length: Nat) -> Step:
  match length:
    case 0n: unavailable()
    case _: ask(frame, Length{evaluations(input)}, Sized{input, Validity{}})

def attribute_root(frame: Frame, +input: Input, cursor: Cursor, prepared: Nat, valid: Bool) -> Step:
  match valid:
    case False{}: unattributed()
    case True{}: ask(
      frame,
      AdviceeEqual{Lens{prepared, ["advicee"]}, Lens{observation(input), ["advicee"]}},
      AttributeAdvicee{input, cursor}
    )

def attribute_advicee(frame: Frame, input: Input, cursor: Cursor, valid: Bool) -> Step:
  match valid:
    case False{}: unattributed()
    case True{}: scan(frame, input, Attribution{}, cursor_next(cursor))

def identity_equal(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  +evaluation: Nat,
  valid: Bool
) -> Step:
  match valid:
    case False{}: unavailable()
    case True{}: ask(
      frame,
      Read{Lens{evaluation, ["findings"]}},
      Findings{input, cursor, evaluation}
    )

def finding(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  +evaluation: Nat,
  findings: Cursor,
  value: Response
) -> Step:
  match value:
    case Missing{}: findings_next(frame, input, cursor, evaluation, cursor_next(findings))
    case Handle{+value}: ask(
      frame,
      Equal{Lens{value, ["semanticIdentity"]}, Lens{evaluation, ["prepared", "identity"]}},
      FindingIdentity{input, cursor, evaluation, findings, value}
    )
    case _: InvalidReply{}

def finding_identity(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  +evaluation: Nat,
  findings: Cursor,
  +finding: Nat,
  valid: Bool
) -> Step:
  match valid:
    case False{}: unavailable()
    case True{}: ask(
      frame,
      Equal{Lens{finding, ["path"]}, Lens{evaluation, ["prepared", "input", "path"]}},
      FindingPath{input, cursor, evaluation, findings, finding}
    )

def finding_path(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  +evaluation: Nat,
  findings: Cursor,
  finding: Nat,
  valid: Bool
) -> Step:
  match valid:
    case False{}: unavailable()
    case True{}: ask(
      frame,
      Equal{
        Lens{finding, ["declaration"]},
        Lens{evaluation, ["prepared", "input", "declaration", "name"]}
      },
      FindingName{input, cursor, evaluation, findings}
    )

def finding_name(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  evaluation: Nat,
  findings: Cursor,
  valid: Bool
) -> Step:
  match valid:
    case False{}: unavailable()
    case True{}: findings_next(frame, input, cursor, evaluation, cursor_next(findings))

def root(frame: Frame, input: Input, valid: Bool) -> Step:
  match valid:
    case False{}: unavailable()
    case True{}: ask(frame, NewMap{}, MapCreated{input})

def returned_value(frame: Frame, next: Next, value: Response) -> Step:
  match next value:
    case Controlled{input} Flag{valid}: controlled(frame, input, valid)
    case Advicee{input} Flag{valid}: advicee(frame, input, valid)
    case Sized{+input, stage} Count{length}: scan(
      frame,
      input,
      stage,
      Cursor{evaluations(input), 0n, length}
    )
    case Item{input, stage, cursor} +value: item(frame, input, stage, cursor, value)
    case AttributePrepared{+input, cursor} Handle{+prepared}: ask(
      frame,
      Equal{Lens{prepared, ["root"]}, Lens{observation(input), ["root"]}},
      AttributeRoot{input, cursor, prepared}
    )
    case AttributeRoot{input, cursor, prepared} Flag{valid}: attribute_root(
      frame,
      input,
      cursor,
      prepared,
      valid
    )
    case AttributeAdvicee{input, cursor} Flag{valid}: attribute_advicee(frame, input, cursor, valid)
    case Nonempty{input} Count{length}: nonempty(frame, input, length)
    case EvaluationIdentity{input, cursor, +evaluation} Handle{identity}: ask(
      frame,
      Read{Lens{evaluation, ["prepared", "input"]}},
      EvaluationInput{input, cursor, evaluation, identity}
    )
    case EvaluationInput{input, cursor, evaluation, identity} Handle{value}: ask(
      frame,
      Identity{value},
      IdentityValue{input, cursor, evaluation, identity}
    )
    case IdentityValue{input, cursor, evaluation, identity} Handle{value}: ask(
      frame,
      EqualValues{identity, value},
      IdentityEqual{input, cursor, evaluation}
    )
    case IdentityEqual{input, cursor, evaluation} Flag{valid}: identity_equal(
      frame,
      input,
      cursor,
      evaluation,
      valid
    )
    case Findings{input, cursor, evaluation} Handle{+findings}: ask(
      frame,
      Length{findings},
      FindingsSized{input, cursor, evaluation, findings}
    )
    case FindingsSized{input, cursor, evaluation, findings} Count{length}: findings_next(
      frame,
      input,
      cursor,
      evaluation,
      Cursor{findings, 0n, length}
    )
    case Finding{input, cursor, evaluation, findings} +value: finding(
      frame,
      input,
      cursor,
      evaluation,
      findings,
      value
    )
    case FindingIdentity{input, cursor, evaluation, findings, finding} Flag{valid}: finding_identity(
      frame,
      input,
      cursor,
      evaluation,
      findings,
      finding,
      valid
    )
    case FindingPath{input, cursor, evaluation, findings, finding} Flag{valid}: finding_path(
      frame,
      input,
      cursor,
      evaluation,
      findings,
      finding,
      valid
    )
    case FindingName{input, cursor, evaluation, findings} Flag{valid}: finding_name(
      frame,
      input,
      cursor,
      evaluation,
      findings,
      valid
    )
    case Root{input} Flag{valid}: root(frame, input, valid)
    case MapCreated{+input} Handle{+map}: ask(
      frame,
      Iterator{evaluations(input)},
      NamesIterator{input, map}
    )
    case NamesIterator{input, map} Handle{iterator}: names_next(frame, Names{input, map, iterator})
    case NamesItem{names} +value: names_item(frame, names, value)
    case NamesInput{names} Handle{+input}: ask(
      frame,
      Read{Lens{input, ["path"]}},
      NamesPath{names, input}
    )
    case NamesPath{names, input} Handle{path}: names_path(frame, names, input, path)
    case NamesSet{names, input} +value: names_set(frame, names, input, value)
    case NamesSetCreated{names, +input} Handle{set}: ask(
      frame,
      Read{Lens{input, ["declaration", "name"]}},
      NamesName{Named{names, input, set}}
    )
    case NamesName{named} Handle{value}: names_name(frame, named, value)
    case NameAdded{named} Acknowledged{}: name_added(frame, named)
    case SecondPath{named} Handle{path}: second_path(frame, named, path)
    case PathSet{names} Acknowledged{}: names_next(frame, names)
    case Prepared{input} Handle{latest}: ask(
      frame,
      Read{Lens{latest, ["outcomes"]}},
      Outcomes{input}
    )
    case Outcomes{input} Handle{+outcomes}: ask(
      frame,
      Length{outcomes},
      OutcomesSized{input, outcomes}
    )
    case OutcomesSized{input, outcomes} Count{length}: outcomes_next(
      frame,
      input,
      Cursor{outcomes, 0n, length},
      []
    )
    case Outcome{input, cursor, current} +value: outcome(frame, input, cursor, current, value)
    case OutcomeReady{input, cursor, current, outcome} Flag{ready}: outcome_ready(
      frame,
      input,
      cursor,
      current,
      outcome,
      ready
    )
    case OutcomePrepared{input, cursor, current} Handle{value}: outcomes_next(
      frame,
      input,
      cursor_next(cursor),
      value <> current
    )
    case CurrentArray{input} Handle{current}: retain(frame, input, current)
    case RetentionNext{step} RetentionResponse{value}: suffix_returned(step, frame, value)
    case _ _: InvalidReply{}

def correlated(frame: Frame, reply: Reply) -> Bool:
  match frame reply:
    case Frame{invocation, request} Reply{owner, command, _}: Bool.and(
      Nat.is_eq(invocation, owner),
      Nat.is_eq(request, command)
    )

def returned(frame: Frame, next: Next, reply: Reply, valid: Bool) -> Step:
  match frame reply valid:
    case Frame{invocation, request} Reply{_, _, value} True{}: returned_value(
      Frame{invocation, Nat.add(request, 1n)},
      next,
      value
    )
    case _ _ False{}: InvalidReply{}

def resume(step: Step, +reply: Reply) -> Step:
  match step:
    case Await{+frame, _, next}: returned(frame, next, reply, correlated(frame, reply))
    case _: InvalidReply{}

def initial(invocation: Nat, +input: Input) -> Step:
  ask(Frame{invocation, 1n}, Truthy{Lens{context(input), ["controlledWriter"]}}, Controlled{input})

# Internal retention commands stay under the same issued outer lease.
type Boundary is Data:
  PrimitiveBoundary{}
  IoBoundary{}
  TerminalBoundary{}
  InvalidBoundary{}

def retention_boundary(query: Retention.Query) -> Boundary:
  match query:
    case Retention.CurrentWork{_, _}: IoBoundary{}
    case _: PrimitiveBoundary{}

def query_boundary(query: Query) -> Boundary:
  match query:
    case VerifyRoot{_}: IoBoundary{}
    case Prepare{_, _}: IoBoundary{}
    case RetentionQuery{query}: retention_boundary(query)
    case _: PrimitiveBoundary{}

def boundary(step: Step) -> Boundary:
  match step:
    case Await{_, query, _}: query_boundary(query)
    case Completed{_, _, _}: TerminalBoundary{}
    case InvalidReply{}: InvalidBoundary{}
