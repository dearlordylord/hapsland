import Base

# Lazy original-object handles. Engines only execute the named reads, equality,
# serialization, root verification and preparation. Bend owns every branch.
type Mode is Data:
  SnapshotLine{}
  SnapshotUnit{}
type Input is Data:
  Input{mode: Mode, observation: Nat, prepared: Nat, context: Nat}
type Lens is Data:
  Lens{object: Nat, fields: List<&2, String>}
type Name is Data:
  Name{path: Nat, name: Nat}
type Query is Data:
  VerifyRoot{observation: Nat}
  Read{value: Lens}
  Prepare{input: Input, names: List<&2, Name>}
  Length{array: Nat}
  Element{array: Nat, index: Nat}
  TextIs{value: Lens, expected: String}
  Equal{left: Lens, right: Lens}
  CanonicalEqual{left: Lens, right: Lens, review_input: Bool}
type Response is Data:
  Flag{value: Bool}
  Handle{value: Nat}
  Count{value: Nat}
  Missing{}
type Cursor is Data:
  Cursor{array: Nat, index: Nat, length: Nat}
type Next is Data:
  RootChecked{input: Input}
  UnitPath{input: Input}
  UnitName{input: Input, path: Nat}
  Prepared{input: Input}
  Outcomes{input: Input}
  Sized{input: Input, array: Nat}
  Item{input: Input, cursor: Cursor, ready: List<&2, Nat>}
  Status{input: Input, cursor: Cursor, ready: List<&2, Nat>, item: Nat}
  LineStatus{input: Input, item: Nat}
  PathMatched{input: Input, cursor: Cursor, ready: List<&2, Nat>, item: Nat}
  IdentityMatched{input: Input, cursor: Cursor, ready: List<&2, Nat>, item: Nat}
  InputMatched{input: Input, cursor: Cursor, ready: List<&2, Nat>, item: Nat}
  FingerprintsMatched{input: Input, cursor: Cursor, ready: List<&2, Nat>}
type Frame is Data:
  Frame{invocation: Nat, request: Nat}
type Step is Data:
  Await{frame: Frame, query: Query, next: Next}
  Completed{current: Bool}
  InvalidReply{}
type Reply is Data:
  Reply{invocation: Nat, request: Nat, response: Response}

def prepared(input: Input) -> Nat:
  match input:
    case Input{_, _, value, _}: value

def mode(input: Input) -> Mode:
  match input:
    case Input{value, _, _, _}: value

def increment(frame: Frame) -> Frame:
  match frame:
    case Frame{invocation, request}: Frame{invocation, Nat.add(request, 1n)}

def next_cursor(cursor: Cursor) -> Cursor:
  match cursor:
    case Cursor{array, index, length}: Cursor{array, Nat.add(index, 1n), length}

def ask(frame: Frame, query: Query, next: Next) -> Step:
  Await{frame, query, next}

def compare_fingerprints(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  item: Nat
) -> Step:
  ask(frame, CanonicalEqual{
    Lens{item, ["prepared", "input", "sourceFingerprints"]},
    Lens{prepared(input), ["input", "sourceFingerprints"]},
    False{}
  }, FingerprintsMatched{input, cursor, ready})

def compare_input(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  +item: Nat
) -> Step:
  ask(frame, CanonicalEqual{
    Lens{item, ["prepared", "input"]}, Lens{prepared(input), ["input"]}, True{}
  }, InputMatched{input, cursor, ready, item})

def compare_identity(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  +item: Nat
) -> Step:
  ask(frame, Equal{
    Lens{item, ["prepared", "identity"]}, Lens{prepared(input), ["identity"]}
  }, IdentityMatched{input, cursor, ready, item})

def compare_path(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  +item: Nat
) -> Step:
  ask(frame, Equal{
    Lens{item, ["prepared", "input", "path"]}, Lens{prepared(input), ["input", "path"]}
  }, PathMatched{input, cursor, ready, item})

def line_ready(frame: Frame, input: Input, ready: List<&2, Nat>) -> Step:
  match ready:
    case +item <> []:
      ask(frame, TextIs{Lens{item, ["status"]}, "ready"}, LineStatus{input, item})
    case _: Completed{False{}}

def exhausted(frame: Frame, input: Input, ready: List<&2, Nat>, selected: Mode) -> Step:
  match selected:
    case SnapshotLine{}: line_ready(frame, input, ready)
    case SnapshotUnit{}: Completed{False{}}

def scan_live(
  frame: Frame,
  +input: Input,
  live: Bool,
  cursor: Cursor,
  ready: List<&2, Nat>
) -> Step:
  match live cursor:
    case True{} Cursor{+array, +index, length}:
      ask(frame, Element{array, index}, Item{input, Cursor{array, index, length}, ready})
    case False{} _:
      exhausted(frame, input, ready, mode(input))

def scan(frame: Frame, input: Input, +cursor: Cursor, ready: List<&2, Nat>) -> Step:
  match cursor:
    case Cursor{_, index, length}: scan_live(frame, input, Nat.is_lt(index, length), cursor, ready)

def mismatch(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  selected: Mode
) -> Step:
  match selected:
    case SnapshotLine{}: Completed{False{}}
    case SnapshotUnit{}: scan(frame, input, next_cursor(cursor), ready)

def checked_identity(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  item: Nat,
  valid: Bool
) -> Step:
  match valid:
    case True{}: compare_input(frame, input, cursor, ready, item)
    case False{}: mismatch(frame, input, cursor, ready, mode(input))

def checked_input(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  item: Nat,
  valid: Bool
) -> Step:
  match valid:
    case True{}: compare_fingerprints(frame, input, cursor, ready, item)
    case False{}: mismatch(frame, input, cursor, ready, mode(input))

def checked_fingerprints(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  valid: Bool
) -> Step:
  match valid:
    case True{}: Completed{True{}}
    case False{}: mismatch(frame, input, cursor, ready, mode(input))

def checked_path(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  item: Nat,
  valid: Bool
) -> Step:
  match valid:
    case True{}: compare_identity(frame, input, cursor, ready, item)
    case False{}: scan(frame, input, next_cursor(cursor), ready)

def ready_item(
  frame: Frame,
  input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  item: Nat,
  selected: Mode
) -> Step:
  match selected:
    case SnapshotLine{}: scan(frame, input, next_cursor(cursor), item <> ready)
    case SnapshotUnit{}: compare_path(frame, input, cursor, ready, item)

def checked_status(
  frame: Frame,
  +input: Input,
  cursor: Cursor,
  ready: List<&2, Nat>,
  item: Nat,
  valid: Bool
) -> Step:
  match valid:
    case True{}: ready_item(frame, input, cursor, ready, item, mode(input))
    case False{}: scan(frame, input, next_cursor(cursor), ready)

def checked_line_status(frame: Frame, input: Input, item: Nat, valid: Bool) -> Step:
  match valid:
    case True{}: compare_identity(frame, input, Cursor{0n, 0n, 0n}, [], item)
    case False{}: Completed{False{}}

def prepare(frame: Frame, +input: Input, names: List<&2, Name>) -> Step:
  ask(frame, Prepare{input, names}, Prepared{input})

def root_live(frame: Frame, +input: Input, selected: Mode) -> Step:
  match selected:
    case SnapshotLine{}: prepare(frame, input, [])
    case SnapshotUnit{}:
      ask(frame, Read{Lens{prepared(input), ["input", "path"]}}, UnitPath{input})

def checked_root(frame: Frame, +input: Input, valid: Bool) -> Step:
  match valid:
    case True{}: root_live(frame, input, mode(input))
    case False{}: Completed{False{}}

def resume_value(frame: Frame, next: Next, response: Response) -> Step:
  match next response:
    case RootChecked{input} Flag{valid}: checked_root(frame, input, valid)
    case UnitPath{+input} Handle{path}:
      ask(
        frame,
        Read{Lens{prepared(input), ["input", "declaration", "name"]}},
        UnitName{input, path}
      )
    case UnitName{input, path} Handle{name}: prepare(frame, input, [Name{path, name}])
    case Prepared{input} Handle{latest}:
      ask(frame, Read{Lens{latest, ["outcomes"]}}, Outcomes{input})
    case Outcomes{input} Handle{+array}: ask(frame, Length{array}, Sized{input, array})
    case Sized{input, array} Count{length}: scan(frame, input, Cursor{array, 0n, length}, [])
    case Item{input, cursor, ready} Missing{}: scan(frame, input, next_cursor(cursor), ready)
    case Item{input, cursor, ready} Handle{+item}:
      ask(frame, TextIs{Lens{item, ["status"]}, "ready"}, Status{input, cursor, ready, item})
    case Status{input, cursor, ready, item} Flag{valid}: checked_status(
      frame,
      input,
      cursor,
      ready,
      item,
      valid
    )
    case LineStatus{input, item} Flag{valid}: checked_line_status(frame, input, item, valid)
    case PathMatched{input, cursor, ready, item} Flag{valid}: checked_path(
      frame,
      input,
      cursor,
      ready,
      item,
      valid
    )
    case IdentityMatched{input, cursor, ready, item} Flag{valid}: checked_identity(
      frame,
      input,
      cursor,
      ready,
      item,
      valid
    )
    case InputMatched{input, cursor, ready, item} Flag{valid}: checked_input(
      frame,
      input,
      cursor,
      ready,
      item,
      valid
    )
    case FingerprintsMatched{input, cursor, ready} Flag{valid}: checked_fingerprints(
      frame,
      input,
      cursor,
      ready,
      valid
    )
    case _ _: InvalidReply{}

def correlated(frame: Frame, reply: Reply) -> Bool:
  match frame reply:
    case Frame{invocation, request} Reply{owner, command, _}:
      Bool.and(Nat.is_eq(invocation, owner), Nat.is_eq(request, command))

def returned(frame: Frame, next: Next, valid: Bool, reply: Reply) -> Step:
  match valid reply:
    case True{} Reply{_, _, response}: resume_value(increment(frame), next, response)
    case False{} _: InvalidReply{}

def resume(step: Step, +reply: Reply) -> Step:
  match step:
    case Await{+frame, _, next}: returned(frame, next, correlated(frame, reply), reply)
    case _: InvalidReply{}

def initial(invocation: Nat, +input: Input) -> Step:
  match input:
    case Input{_, observation, _, _}:
      ask(Frame{invocation, 1n}, VerifyRoot{observation}, RootChecked{input})
