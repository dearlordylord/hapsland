import Base
import ./Types.bend as T
import ./WholeObservation.bend as O

# A responder is a pure function of the operation independently selected by
# an interpreter and the entire current world. There is no expected-request
# script, graph policy, or requirement that the chosen request be correct.
type Response<-World: Data> is Data:
  Returned{world: World, outcome: T.ServiceOutcome, effects: List<&2, O.Effect>}
  Suspended{world: World, lease: O.ProviderLease, effects: List<&2, O.Effect>}

type WorldState<-World: Data> is Data:
  WorldState{world: World, effects: List<&2, O.Effect>}

type Exchange<-World: Data> is Data:
  Delivered{state: WorldState<World>, reply: T.Reply}
  Waiting{state: WorldState<World>, request: T.Request, lease: O.ProviderLease}

type Completion<-World: Data> is Data:
  Completion{
    lease: O.ProviderLease,
    world: World,
    outcome: T.ServiceOutcome,
    effects: List<&2, O.Effect>
  }

# These are exactly the pure path-algebra operations erased by the declared
# native trace projection. Encoding, cache, clock and engine operations stay.
def pure_path(operation: T.Operation) -> Bool:
  match operation:
    case T.PathDirname{_}: True{}
    case T.PathBasename{_, _}: True{}
    case T.ReadPathSeparator{}: True{}
    case T.PathJoin{_}: True{}
    case T.PathNormalize{_}: True{}
    case T.PathRelative{_, _}: True{}
    case T.PathExtension{_}: True{}
    case T.PathIsAbsolute{_}: True{}
    case T.JoinedPathFacts{_, _}: True{}
    case _: False{}

def stamp(request: T.Request, outcome: T.ServiceOutcome) -> T.Reply:
  match request:
    case T.Request{invocation, id, _}: T.Reply{invocation, id, outcome}

def delivered(-World: Data, world: World, +reply: T.Reply,
    effects: List<&2, O.Effect>) -> Exchange<World>:
  Delivered{WorldState{world, List.append(&2, O.Effect, effects, O.Responded{reply} <> [])}, reply}

def response(-World: Data, result: Response<World>, +request: T.Request,
    effects: List<&2, O.Effect>) -> Exchange<World>:
  match result:
    case Returned{world, outcome, nested}: delivered(World, world, stamp(request, outcome),
      List.append(&2, O.Effect, effects, nested))
    case Suspended{world, lease, nested}: Waiting{
      WorldState{world, List.append(&2, O.Effect, effects, nested)}, request, lease}

# Header stamping is a mechanical binding rule. Returned token ownership,
# engine facts and provider errors remain responder/world data. Separate laws
# quantify over arbitrary malformed replies rather than going through stamp.
def step(-World: Data, respond: T.Operation -> World -> Response<World>,
    +request: T.Request, state: WorldState<World>) -> Exchange<World>:
  match request state:
    case T.Request{_, _, operation} WorldState{world, effects}:
      response(World, respond(operation, world), request,
        List.append(&2, O.Effect, effects, O.Invoked{request} <> []))

def completed_lease(-World: Data, matches: Bool, old: Exchange<World>,
    world: World, reply: T.Reply, effects: List<&2, O.Effect>) -> Exchange<World>:
  match matches:
    case False{}: old
    case True{}: delivered(World, world, reply, effects)

# Complete a previously invoked provider without invoking it a second time.
# The world may change during provider work. A foreign lease cannot apply that
# world's completion to this suspension. Invocation/cancellation fencing and
# eventual non-cancellable provider cleanup belong to the fixed runtime model.
def same_lease(expected: O.ProviderLease, actual: O.ProviderLease) -> Bool:
  match expected actual:
    case O.ProviderLease{expected_owner, expected_id} O.ProviderLease{actual_owner, actual_id}:
      Bool.and(Nat.is_eq(expected_owner, actual_owner), Nat.is_eq(expected_id, actual_id))

def complete(
  -World: Data,
  +exchange: Exchange<World>,
  completion: Completion<World>
) -> Exchange<World>:
  match exchange completion:
    case Waiting{WorldState{_, effects}, request, expected} Completion{
      actual,
      world,
      outcome,
      nested
    }:
      completed_lease(World, same_lease(expected, actual), exchange,
        world, stamp(request, outcome), List.append(&2, O.Effect, effects, nested))
    case finished _: finished

def main() -> Unit:
  Unit{}
