# Synthetic Hapsland-inspired teaching scenario; no production policy claim.
import Base
import ./FlowModel.bend as M

def hapsland() -> M.Config:
  M.Board{"HAPSLAND FLOW LAB", [
    M.Node{0, "CAPTURE", 6, 10, False{}, 16, 0, 1, 1, 35},
    M.Node{1, "REVIEW", 24, 0, True{}, 8, 0, 255, 2, 50},
    M.Node{2, "ADVICE", 18, 6, False{}, 8, 0, 3, 3, 35},
    M.Node{3, "OUTPUT", 6, 2, False{}, 4, 80, 255, 255, 50}],
    24, 80, 6, 12, 300, 6, 900}

def wave_label(+wave: U32) -> String:
  "DEMAND " ++ U32.show((18 + M.sub(wave, 1) * 6 : U32)) ++ " / 18 SECONDS"

# Playable counterparts of the declared headless bottleneck contexts.
# No engine changes: only labels and station service/holding configuration.
def change_stage(node: M.Stage, +target: U32) -> M.Stage:
  match node:
    case M.Node{+id, label, +service, queue, immediate, resource, +hold, next, finding, cost}:
      +slow = U32.is_eq(id, target)
      M.Node{id, label, M.choose((service * 4 : U32), service, slow), queue,
        immediate, resource, M.choose((hold * 2 : U32), hold, slow), next, finding, cost}

def change_stages(nodes: List<&2, M.Stage>, +target: U32) -> List<&2, M.Stage>:
  match nodes:
    case Nil{}: Nil{}
    case node <> rest: change_stage(node, target) <> change_stages(rest, target)

def changed(board: M.Config, target: U32, label: String) -> M.Config:
  match board:
    case M.Board{_, nodes, lives, gold, workers, pace, deadline, waves, ticks}:
      M.Board{label, change_stages(nodes, target), lives, gold, workers, pace, deadline, waves, ticks}

def select(index: U32) -> M.Config:
  match index:
    case 1: changed(hapsland(), 0, "CAPTURE BOTTLENECK")
    case 2: changed(hapsland(), 1, "REVIEW BOTTLENECK")
    case 3: changed(hapsland(), 2, "ADVICE BOTTLENECK")
    case _: hapsland()
