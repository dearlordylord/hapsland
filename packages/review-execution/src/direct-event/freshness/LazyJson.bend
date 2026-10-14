import ../preparation/CanonicalJson.bend as Json
import Base

# Native handles preserve original getters, symbols and UTF-16 strings. This
# machine owns canonical traversal and review normalization under the parent's
# synchronous lease. Array map callbacks reenter this machine without a new IO.
type JsonKey is Data:
  JsonKey{value: Nat, units: List<&2, U32>}
type Lens is Data:
  Lens{object: Nat, fields: List<&2, String>}
type Operation is Data:
  Serialize{value: Nat}
  Compare{left: Nat, right: Nat}
  ReviewEqual{left: Nat, right: Nat}
  Identity{value: Nat}
  LensCompare{left: Lens, right: Lens}
type Query is Data:
  Classify{value: Nat}
  Scalar{value: Nat}
  ArrayMap{value: Nat}
  ArrayJoin{value: Nat}
  ObjectKeys{value: Nat}
  ReadKey{object: Nat, key: Nat}
  ReadPath{value: Lens}
  Literal{value: String}
  Concat{parts: List<&2, Nat>}
  TextEqual{left: Nat, right: Nat}
  Hash{value: Nat}
  ReadNamed{object: Nat, key: String}
  OwnKeys{value: Nat}
  NewObject{}
  KeyEqual{key: Nat, expected: String}
  Enumerable{object: Nat, key: Nat}
  Define{object: Nat, key: Nat, value: Nat}
type Response is Data:
  ArrayKind{}
  ObjectKind{}
  LeafKind{}
  Handle{value: Nat}
  Keys{values: List<&2, JsonKey>}
  Handles{values: List<&2, Nat>}
  Flag{value: Bool}
  Acknowledged{}
type Finish is Data:
  ReturnText{}
  CompareLeft{right: Nat}
  CompareRight{left: Nat}
  HashText{}
  FieldText{object: Nat, tail: List<&2, JsonKey>, parts: List<&2, Nat>, finish: Finish}
  LensLeft{right: Lens}
type RestFinish is Data:
  NormalizeLeft{right: Nat}
  NormalizeRight{left: Nat}
  NormalizeIdentity{}
type Next is Data:
  Classified{value: Nat, finish: Finish}
  Encoded{finish: Finish}
  Mapped{finish: Finish}
  Joined{finish: Finish}
  ArrayOpen{body: Nat, finish: Finish}
  ArrayClose{body: Nat, open: Nat, finish: Finish}
  Enumerated{object: Nat, finish: Finish}
  ObjectOpen{object: Nat, keys: List<&2, JsonKey>, finish: Finish}
  QuotedKey{
    object: Nat,
    key: JsonKey,
    tail: List<&2, JsonKey>,
    parts: List<&2, Nat>,
    finish: Finish
  }
  Colon{object: Nat, key: JsonKey, tail: List<&2, JsonKey>, parts: List<&2, Nat>, finish: Finish}
  FieldRead{object: Nat, tail: List<&2, JsonKey>, parts: List<&2, Nat>, finish: Finish}
  Comma{object: Nat, keys: List<&2, JsonKey>, parts: List<&2, Nat>, finish: Finish}
  ObjectClose{parts: List<&2, Nat>, finish: Finish}
  Compared{}
  Hashed{}
  LensReadLeft{right: Lens}
  LensReadRight{left: Nat}
  ExcludedCapture{value: Nat, finish: RestFinish}
  ExcludedLocation{value: Nat, finish: RestFinish}
  RestEnumerated{value: Nat, finish: RestFinish}
  RestCreated{value: Nat, keys: List<&2, Nat>, finish: RestFinish}
  RestCapture{source: Nat, target: Nat, key: Nat, tail: List<&2, Nat>, finish: RestFinish}
  RestLocation{source: Nat, target: Nat, key: Nat, tail: List<&2, Nat>, finish: RestFinish}
  RestEnumerable{source: Nat, target: Nat, key: Nat, tail: List<&2, Nat>, finish: RestFinish}
  RestRead{source: Nat, target: Nat, key: Nat, tail: List<&2, Nat>, finish: RestFinish}
  RestDefined{source: Nat, target: Nat, tail: List<&2, Nat>, finish: RestFinish}
type Frame is Data:
  Frame{invocation: Nat, request: Nat}
type Step is Data:
  Await{frame: Frame, query: Query, next: Next}
  CompletedText{value: Nat}
  CompletedFlag{value: Bool}
  InvalidReply{}
type Reply is Data:
  Reply{invocation: Nat, request: Nat, response: Response}

def increment(frame: Frame) -> Frame:
  match frame:
    case Frame{invocation, request}: Frame{invocation, Nat.add(request, 1n)}

def serialize(frame: Frame, +value: Nat, finish: Finish) -> Step:
  Await{frame, Classify{value}, Classified{value, finish}}

def normalize(frame: Frame, +value: Nat, finish: RestFinish) -> Step:
  Await{frame, ReadNamed{value, "sourceFingerprints"}, ExcludedCapture{value, finish}}

def rest_done(frame: Frame, target: Nat, finish: RestFinish) -> Step:
  match finish:
    case NormalizeLeft{right}: normalize(frame, right, NormalizeRight{target})
    case NormalizeRight{left}: serialize(frame, left, CompareLeft{target})
    case NormalizeIdentity{}: serialize(frame, target, HashText{})

def rest_next(
  frame: Frame,
  source: Nat,
  target: Nat,
  keys: List<&2, Nat>,
  finish: RestFinish
) -> Step:
  match keys:
    case []: rest_done(frame, target, finish)
    case +key <> tail:
      Await{
        frame,
        KeyEqual{key, "sourceFingerprints"},
        RestCapture{source, target, key, tail, finish}
      }

def keys_le(left: JsonKey, right: JsonKey) -> Bool:
  match left right:
    case JsonKey{_, a} JsonKey{_, b}: Json.units_le(a, b)

def object_fields(
  frame: Frame,
  object: Nat,
  keys: List<&2, JsonKey>,
  parts: List<&2, Nat>,
  finish: Finish
) -> Step:
  match keys:
    case []: Await{frame, Literal{"}"}, ObjectClose{parts, finish}}
    case JsonKey{+key, units} <> tail:
      Await{frame, Scalar{key}, QuotedKey{object, JsonKey{key, units}, tail, parts, finish}}

def field_done(
  frame: Frame,
  object: Nat,
  keys: List<&2, JsonKey>,
  parts: List<&2, Nat>,
  finish: Finish
) -> Step:
  match keys:
    case []: object_fields(frame, object, [], parts, finish)
    case +keys: Await{frame, Literal{","}, Comma{object, keys, parts, finish}}

def text_done(frame: Frame, +value: Nat, finish: Finish) -> Step:
  match finish:
    case ReturnText{}: CompletedText{value}
    case CompareLeft{right}: serialize(frame, right, CompareRight{value})
    case CompareRight{left}: Await{frame, TextEqual{left, value}, Compared{}}
    case HashText{}: Await{frame, Hash{value}, Hashed{}}
    case FieldText{object, tail, parts, finish}: field_done(
      frame,
      object,
      tail,
      value <> parts,
      finish
    )
    case LensLeft{right}: Await{frame, ReadPath{right}, LensReadRight{value}}

def returned(frame: Frame, next: Next, response: Response) -> Step:
  match next response:
    case Classified{value, finish} ArrayKind{}: Await{frame, ArrayMap{value}, Mapped{finish}}
    case Classified{+value, finish} ObjectKind{}: Await{
      frame,
      ObjectKeys{value},
      Enumerated{value, finish}
    }
    case Classified{value, finish} LeafKind{}: Await{frame, Scalar{value}, Encoded{finish}}
    case Encoded{finish} Handle{value}: text_done(frame, value, finish)
    case Mapped{finish} Handle{value}: Await{frame, ArrayJoin{value}, Joined{finish}}
    case Joined{finish} Handle{body}: Await{frame, Literal{"["}, ArrayOpen{body, finish}}
    case ArrayOpen{body, finish} Handle{open}: Await{
      frame,
      Literal{"]"},
      ArrayClose{body, open, finish}
    }
    case ArrayClose{body, open, finish} Handle{close}: Await{
      frame,
      Concat{[open, body, close]},
      Encoded{finish}
    }
    case Enumerated{object, finish} Keys{keys}:
      Await{frame, Literal{"{"}, ObjectOpen{object, List.sort(~JsonKey, ~keys_le, keys), finish}}
    case ObjectOpen{object, keys, finish} Handle{open}: object_fields(
      frame,
      object,
      keys,
      [open],
      finish
    )
    case QuotedKey{object, key, tail, parts, finish} Handle{quoted}:
      Await{frame, Literal{":"}, Colon{object, key, tail, quoted <> parts, finish}}
    case Colon{+object, JsonKey{key, _}, tail, parts, finish} Handle{colon}:
      Await{frame, ReadKey{object, key}, FieldRead{object, tail, colon <> parts, finish}}
    case FieldRead{object, tail, parts, finish} Handle{value}:
      serialize(frame, value, FieldText{object, tail, parts, finish})
    case Comma{object, keys, parts, finish} Handle{comma}: object_fields(
      frame,
      object,
      keys,
      comma <> parts,
      finish
    )
    case ObjectClose{parts, finish} Handle{close}: Await{
      frame,
      Concat{List.reverse(&2, Nat, close <> parts)},
      Encoded{finish}
    }
    case Compared{} Flag{value}: CompletedFlag{value}
    case Hashed{} Handle{value}: CompletedText{value}
    case LensReadLeft{right} Handle{value}: serialize(frame, value, LensLeft{right})
    case LensReadRight{left} Handle{value}: serialize(frame, value, CompareRight{left})
    case ExcludedCapture{+value, finish} Handle{_}:
      Await{frame, ReadNamed{value, "rootLocation"}, ExcludedLocation{value, finish}}
    case ExcludedLocation{+value, finish} Handle{_}: Await{
      frame,
      OwnKeys{value},
      RestEnumerated{value, finish}
    }
    case RestEnumerated{value, finish} Handles{keys}: Await{
      frame,
      NewObject{},
      RestCreated{value, keys, finish}
    }
    case RestCreated{source, keys, finish} Handle{target}: rest_next(
      frame,
      source,
      target,
      keys,
      finish
    )
    case RestCapture{source, target, key, tail, finish} Flag{True{}}: rest_next(
      frame,
      source,
      target,
      tail,
      finish
    )
    case RestCapture{source, target, +key, tail, finish} Flag{False{}}:
      Await{frame, KeyEqual{key, "rootLocation"}, RestLocation{source, target, key, tail, finish}}
    case RestLocation{source, target, key, tail, finish} Flag{True{}}: rest_next(
      frame,
      source,
      target,
      tail,
      finish
    )
    case RestLocation{+source, target, +key, tail, finish} Flag{False{}}:
      Await{frame, Enumerable{source, key}, RestEnumerable{source, target, key, tail, finish}}
    case RestEnumerable{source, target, key, tail, finish} Flag{False{}}: rest_next(
      frame,
      source,
      target,
      tail,
      finish
    )
    case RestEnumerable{+source, target, +key, tail, finish} Flag{True{}}:
      Await{frame, ReadKey{source, key}, RestRead{source, target, key, tail, finish}}
    case RestRead{source, +target, key, tail, finish} Handle{value}:
      Await{frame, Define{target, key, value}, RestDefined{source, target, tail, finish}}
    case RestDefined{source, target, tail, finish} Acknowledged{}: rest_next(
      frame,
      source,
      target,
      tail,
      finish
    )
    case _ _: InvalidReply{}

def correlated(frame: Frame, next: Next, response: Response, valid: Bool) -> Step:
  match valid:
    case True{}: returned(increment(frame), next, response)
    case False{}: InvalidReply{}

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Await{Frame{+invocation, +request}, _, next} Reply{
      reply_invocation,
      reply_request,
      response
    }:
      correlated(Frame{invocation, request}, next, response,
        Bool.and(Nat.is_eq(invocation, reply_invocation), Nat.is_eq(request, reply_request)))
    case _ _: InvalidReply{}

def start(frame: Frame, operation: Operation) -> Step:
  match operation:
    case Serialize{value}: serialize(frame, value, ReturnText{})
    case Compare{left, right}: serialize(frame, left, CompareLeft{right})
    case ReviewEqual{left, right}: normalize(frame, left, NormalizeLeft{right})
    case Identity{value}: normalize(frame, value, NormalizeIdentity{})
    case LensCompare{left, right}: Await{frame, ReadPath{left}, LensReadLeft{right}}

def initial(invocation: Nat, operation: Operation) -> Step:
  start(Frame{invocation, 1n}, operation)

def main() -> Unit:
  Unit{}
