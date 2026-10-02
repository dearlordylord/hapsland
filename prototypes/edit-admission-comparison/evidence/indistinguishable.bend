import Base
import ../core.bend as C

def base() -> List<&2,C.TraceEvent>:
  [C.Pre{1n,1n,1n,1n,20n,1n},C.Post{1n,1n,1n,4n},C.RoundClose{5n}]

def old() -> List<&2,C.TraceEvent>:
  List.append(&2,C.TraceEvent,base(),[C.NativeStart{2n,2n},C.NativeComplete{2n,3n},C.Post{1n,1n,2n,8n}])

def fresh() -> List<&2,C.TraceEvent>:
  List.append(&2,C.TraceEvent,base(),[C.NativeStart{2n,6n},C.NativeComplete{2n,7n},C.Post{1n,1n,2n,8n}])

# Literal counterpair, not a universal proof: different native times give A identical state.
def same_receipt_observation() -> {C.run(old(),C.Receipt{},C.initial()) == C.run(fresh(),C.Receipt{},C.initial()) : C.State}:
  {==}
