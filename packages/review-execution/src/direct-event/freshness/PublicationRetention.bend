import Base

# The publication suffix preserves full filter-before-find, completes every
# semantic match before authority IO, then flattens findings in original order.
# Handles retain original objects; queries are primitive reads or external IO.
type Lens is Data:
  Lens{object: Nat, fields: List<&2, String>}
type Input is Data:
  Input{evaluations: Nat, current: Nat, authority: Bool}
type Query is Data:
  Iterator{array: Nat}
  IteratorNext{iterator: Nat}
  Read{value: Lens}
  Equal{left: Lens, right: Lens}
  InputEqual{left: Nat, right: Nat}
  CurrentMethod{}
  CurrentWork{method: Nat, prepared: Nat}
  IsArray{value: Nat}
  Length{array: Nat}
  Element{array: Nat, index: Nat}
type Response is Data:
  Handle{value: Nat}
  Flag{value: Bool}
  Count{value: Nat}
  End{}
  Missing{}
type Status is Data:
  Current{}
  Stale{}
  Unavailable{}
type Frame is Data:
  Frame{invocation: Nat, request: Nat}
type Work is Data:
  Work{input: Input, iterator: Nat, retained: List<&2, Nat>, changed: Bool}
type Cursor is Data:
  Cursor{array: Nat, index: Nat, length: Nat}
type Subject is Data:
  Subject{
    work: Work,
    evaluation: Nat,
    expected: Nat,
    cursor: Cursor,
    found: List<&2, Nat>
  }
type Match is Data:
  Match{work: Work, evaluation: Nat, expected: Nat, remaining: List<&2, Nat>}
type Authority is Data:
  Authority{remaining: List<&2, Nat>, publishable: List<&2, Nat>}
type Flatten is Data:
  Flatten{evaluations: List<&2, Nat>, remaining: List<&2, Nat>, findings: List<&2, Nat>}
type ArrayScan is Data:
  ArrayScan{flatten: Flatten, array: Nat, index: Nat, length: Nat}
type Next is Data:
  Iterated{input: Input}
  Evaluation{work: Work}
  Expected{work: Work, evaluation: Nat}
  SubjectLength{work: Work, evaluation: Nat, expected: Nat, array: Nat}
  SubjectItem{subject: Subject}
  Path{subject: Subject, candidate: Nat}
  Name{subject: Subject, candidate: Nat}
  Identity{matching: Match, candidate: Nat}
  CandidateInput{matching: Match}
  ComparedInput{matching: Match}
  AuthorityMethod{authority: Authority, evaluation: Nat}
  AuthorityPrepared{authority: Authority, evaluation: Nat, method: Nat}
  AuthorityResult{authority: Authority, evaluation: Nat}
  Findings{flatten: Flatten}
  FindingsKind{flatten: Flatten, value: Nat}
  FindingsLength{flatten: Flatten, array: Nat}
  Finding{scan: ArrayScan}
type Step is Data:
  Await{frame: Frame, query: Query, next: Next}
  Completed{status: Status, evaluations: List<&2, Nat>, findings: List<&2, Nat>}
  InvalidReply{}
type Reply is Data:
  Reply{invocation: Nat, request: Nat, response: Response}

def reverse_into(values: List<&2, Nat>, reversed: List<&2, Nat>) -> List<&2, Nat>:
  match values:
    case []: reversed
    case head <> tail: reverse_into(tail, head <> reversed)

def reverse(values: List<&2, Nat>) -> List<&2, Nat>:
  reverse_into(values, [])

def ask(frame: Frame, query: Query, next: Next) -> Step:
  Await{frame, query, next}

def work_current(work: Work) -> Nat:
  match work:
    case Work{Input{_, current, _}, _, _, _}: current

def work_authority(work: Work) -> Bool:
  match work:
    case Work{Input{_, _, authority}, _, _, _}: authority

def next_evaluation(frame: Frame, +work: Work) -> Step:
  match work:
    case Work{_, iterator, _, _}: ask(frame, IteratorNext{iterator}, Evaluation{work})

def finish_flatten(flatten: Flatten) -> Step:
  match flatten:
    case Flatten{evaluations, _, findings}: Completed{Current{}, evaluations, reverse(findings)}

def flatten_next(frame: Frame, flatten: Flatten) -> Step:
  match flatten:
    case Flatten{evaluations, [], findings}: finish_flatten(Flatten{evaluations, [], findings})
    case Flatten{evaluations, head <> tail, findings}:
      ask(frame, Read{Lens{head, ["findings"]}}, Findings{Flatten{evaluations, tail, findings}})

def array_scan_live(frame: Frame, +scan: ArrayScan, live: Bool) -> Step:
  match scan live:
    case ArrayScan{_, array, index, _} True{}: ask(frame, Element{array, index}, Finding{scan})
    case ArrayScan{flatten, _, _, _} False{}: flatten_next(frame, flatten)

def array_scan(frame: Frame, +scan: ArrayScan) -> Step:
  match scan:
    case ArrayScan{_, _, index, length}: array_scan_live(frame, scan, Nat.is_lt(index, length))

def finding_returned(frame: Frame, scan: ArrayScan, response: Response) -> Step:
  match scan response:
    case ArrayScan{Flatten{evaluations, remaining, findings}, array, index, length} Handle{value}:
      array_scan(
        frame,
        ArrayScan{
          Flatten{evaluations, remaining, value <> findings},
          array,
          Nat.add(index, 1n),
          length
        }
      )
    case ArrayScan{flatten, array, index, length} Missing{}:
      array_scan(frame, ArrayScan{flatten, array, Nat.add(index, 1n), length})
    case _ _: InvalidReply{}

def findings_kind(frame: Frame, flatten: Flatten, +value: Nat, array: Bool) -> Step:
  match flatten array:
    case _ True{}: ask(frame, Length{value}, FindingsLength{flatten, value})
    case Flatten{evaluations, remaining, findings} False{}:
      flatten_next(frame, Flatten{evaluations, remaining, value <> findings})

def authority_finished(frame: Frame, publishable: List<&2, Nat>) -> Step:
  match publishable:
    case []: Completed{Stale{}, [], []}
    case +head <> +tail:
      flatten_next(frame, Flatten{reverse(head <> tail), reverse(head <> tail), []})

def authority_next(frame: Frame, authority: Authority, enabled: Bool) -> Step:
  match authority enabled:
    case Authority{[], publishable} _: authority_finished(frame, publishable)
    case Authority{+head <> tail, publishable} True{}:
      ask(
        frame,
        CurrentMethod{},
        AuthorityMethod{Authority{tail, publishable}, head}
      )
    case Authority{head <> tail, publishable} False{}:
      authority_finished(frame, reverse_into(head <> tail, publishable))

def authority_returned(frame: Frame, authority: Authority, evaluation: Nat, valid: Bool) -> Step:
  match authority valid:
    case Authority{remaining, publishable} True{}:
      authority_next(frame, Authority{remaining, evaluation <> publishable}, True{})
    case _ False{}: authority_next(frame, authority, True{})

def semantic_finished(frame: Frame, work: Work) -> Step:
  match work:
    case Work{_, _, [], True{}}: Completed{Stale{}, [], []}
    case Work{_, _, [], False{}}: Completed{Unavailable{}, [], []}
    case Work{Input{_, _, authority}, _, retained, _}:
      authority_next(frame, Authority{reverse(retained), []}, authority)

def matched(frame: Frame, work: Work, evaluation: Nat) -> Step:
  match work:
    case Work{input, iterator, retained, changed}:
      next_evaluation(frame, Work{input, iterator, evaluation <> retained, changed})

def unmatched(frame: Frame, work: Work) -> Step:
  match work:
    case Work{input, iterator, retained, _}: next_evaluation(
      frame,
      Work{input, iterator, retained, True{}}
    )

def matching_next(frame: Frame, matching: Match) -> Step:
  match matching:
    case Match{work, _, _, []}: unmatched(frame, work)
    case Match{work, +evaluation, expected, +head <> tail}:
      ask(
        frame,
        Equal{Lens{head, ["identity"]}, Lens{evaluation, ["prepared", "identity"]}},
        Identity{Match{work, evaluation, expected, tail}, head}
      )

def subjects_finished(
  frame: Frame,
  work: Work,
  evaluation: Nat,
  expected: Nat,
  subjects: List<&2, Nat>
) -> Step:
  match work subjects:
    case _ Nil{}: next_evaluation(frame, work)
    case +work Con{head, tail}:
      matching_next(frame, Match{work, evaluation, expected, reverse(head <> tail)})

def subject_scan(frame: Frame, +subject: Subject, live: Bool) -> Step:
  match subject live:
    case Subject{_, _, _, Cursor{array, index, _}, _} True{}:
      ask(frame, Element{array, index}, SubjectItem{subject})
    case Subject{work, evaluation, expected, _, found} False{}:
      subjects_finished(frame, work, evaluation, expected, found)

def subject_next(frame: Frame, +subject: Subject) -> Step:
  match subject:
    case Subject{_, _, _, Cursor{_, index, length}, _}:
      subject_scan(frame, subject, Nat.is_lt(index, length))

def subject_advance(subject: Subject) -> Subject:
  match subject:
    case Subject{work, evaluation, expected, Cursor{array, index, length}, found}:
      Subject{work, evaluation, expected, Cursor{array, Nat.add(index, 1n), length}, found}

def subject_item(frame: Frame, +subject: Subject, response: Response) -> Step:
  match subject response:
    case Subject{_, _, expected, _, _} Handle{+candidate}:
      ask(
        frame,
        Equal{Lens{candidate, ["input", "path"]}, Lens{expected, ["path"]}},
        Path{subject_advance(subject), candidate}
      )
    case _ Missing{}: subject_next(frame, subject_advance(subject))
    case _ _: InvalidReply{}

def path_returned(frame: Frame, +subject: Subject, +candidate: Nat, valid: Bool) -> Step:
  match subject valid:
    case Subject{_, _, expected, _, _} True{}:
      ask(
        frame,
        Equal{
          Lens{candidate, ["input", "declaration", "name"]},
          Lens{expected, ["declaration", "name"]}
        },
        Name{subject, candidate}
      )
    case _ False{}: subject_next(frame, subject)

def name_returned(frame: Frame, subject: Subject, candidate: Nat, valid: Bool) -> Step:
  match subject valid:
    case Subject{work, evaluation, expected, remaining, found} True{}:
      subject_next(frame, Subject{work, evaluation, expected, remaining, candidate <> found})
    case _ False{}: subject_next(frame, subject)

def identity_returned(frame: Frame, matching: Match, candidate: Nat, valid: Bool) -> Step:
  match valid:
    case True{}: ask(frame, Read{Lens{candidate, ["input"]}}, CandidateInput{matching})
    case False{}: matching_next(frame, matching)

def input_returned(frame: Frame, matching: Match, valid: Bool) -> Step:
  match matching valid:
    case Match{work, evaluation, _, _} True{}: matched(frame, work, evaluation)
    case _ False{}: matching_next(frame, matching)

def candidate_input(frame: Frame, +matching: Match, value: Nat) -> Step:
  match matching:
    case Match{_, _, expected, _}: ask(frame, InputEqual{value, expected}, ComparedInput{matching})

def evaluation_expected(frame: Frame, +work: Work, evaluation: Nat, expected: Nat) -> Step:
  ask(
    frame,
    Length{work_current(work)},
    SubjectLength{work, evaluation, expected, work_current(work)}
  )

def response(frame: Frame, next: Next, response: Response) -> Step:
  match next response:
    case Iterated{input} Handle{iterator}: next_evaluation(
      frame,
      Work{input, iterator, [], False{}}
    )
    case Evaluation{work} End{}: semantic_finished(frame, work)
    case Evaluation{work} Handle{+evaluation}:
      ask(frame, Read{Lens{evaluation, ["prepared", "input"]}}, Expected{work, evaluation})
    case Expected{work, evaluation} Handle{expected}: evaluation_expected(
      frame,
      work,
      evaluation,
      expected
    )
    case SubjectLength{work, evaluation, expected, array} Count{length}:
      subject_next(frame, Subject{work, evaluation, expected, Cursor{array, 0n, length}, []})
    case SubjectItem{subject} +reply: subject_item(frame, subject, reply)
    case Path{subject, candidate} Flag{valid}: path_returned(frame, subject, candidate, valid)
    case Name{subject, candidate} Flag{valid}: name_returned(frame, subject, candidate, valid)
    case Identity{matching, candidate} Flag{valid}: identity_returned(
      frame,
      matching,
      candidate,
      valid
    )
    case CandidateInput{matching} Handle{value}: candidate_input(frame, matching, value)
    case ComparedInput{matching} Flag{valid}: input_returned(frame, matching, valid)
    case AuthorityMethod{authority, +evaluation} Handle{method}:
      ask(
        frame,
        Read{Lens{evaluation, ["prepared"]}},
        AuthorityPrepared{authority, evaluation, method}
      )
    case AuthorityPrepared{authority, evaluation, method} Handle{prepared}:
      ask(frame, CurrentWork{method, prepared}, AuthorityResult{authority, evaluation})
    case AuthorityResult{authority, evaluation} Flag{valid}: authority_returned(
      frame,
      authority,
      evaluation,
      valid
    )
    case Findings{flatten} Handle{+value}: ask(frame, IsArray{value}, FindingsKind{flatten, value})
    case FindingsKind{flatten, value} Flag{array}: findings_kind(frame, flatten, value, array)
    case FindingsLength{flatten, array} Count{length}: array_scan(
      frame,
      ArrayScan{flatten, array, 0n, length}
    )
    case Finding{scan} +reply: finding_returned(frame, scan, reply)
    case _ _: InvalidReply{}

def correlated(frame: Frame, reply: Reply) -> Bool:
  match frame reply:
    case Frame{invocation, request} Reply{owner, command, _}:
      Bool.and(Nat.is_eq(invocation, owner), Nat.is_eq(request, command))

def returned(frame: Frame, next: Next, reply: Reply, valid: Bool) -> Step:
  match frame reply valid:
    case Frame{invocation, request} Reply{_, _, value} True{}:
      response(Frame{invocation, Nat.add(request, 1n)}, next, value)
    case _ _ False{}: InvalidReply{}

def resume(step: Step, +reply: Reply) -> Step:
  match step:
    case Await{+frame, _, next}: returned(frame, next, reply, correlated(frame, reply))
    case _: InvalidReply{}

def start(+frame: Frame, +input: Input) -> Step:
  match input:
    case Input{evaluations, _, _}: ask(frame, Iterator{evaluations}, Iterated{input})

def initial(invocation: Nat, input: Input) -> Step:
  start(Frame{invocation, 1n}, input)
