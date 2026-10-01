# Scenario-owned geometry and architecture; engine does not name these stages.
import Base
import ./RoadModel.bend as M

def hapsland() -> M.Config:
  M.Board{"ARCHITECTURE DEFENSE", [
    M.Site{0, "CAPTURE", 32, 152, 144, 152, 112, 4, 12, 12, 24, 1, 1, False{}, 3, 0, 0, 0},
    M.Site{1, "REVIEW", 144, 152, 400, 152, 256, 4, 12, 12, 60, 255, 2, True{}, 3, 0, 0, 2},
    M.Site{2, "ADVICE", 400, 152, 400, 344, 192, 4, 16, 12, 30, 3, 3, False{}, 2, 0, 1, 1},
    M.Site{3, "OUTPUT", 400, 344, 144, 344, 256, 4, 24, 12, 20, 255, 255, False{}, 1, 1, 0, 1}],
    220, 120, 18, 6, 2000, 120, 24, 6,
    M.Contract{3, 10240, 128, 32, 3, 40, 12, 480, 240, 256, 2300, 0}}

def wave_label(+wave: U32) -> String:
  "DEMAND " ++ U32.show((24 + M.sub(wave, 1) * 6 : U32)) ++ " / 40 SECONDS"

def alter_site(+site: M.Node, +index: U32) -> M.Node:
  match site:
    case M.Site{+id, label, sx, sy, x, y, length, speed, slots, roadLimit, +work, next, nextFinding, immediate, workers, serviceMode, releaseMode, stopClass}:
      +heavy = (U32.is_eq(index, 1) && U32.is_eq(id, 0)) || (U32.is_eq(index, 2) && U32.is_eq(id, 1))
      M.Site{id, label, sx, sy, x, y, length, speed, slots, roadLimit, M.choose((work * 2 : U32), work, heavy || (U32.is_eq(index, 3) && U32.is_eq(id, 3))), next, nextFinding, immediate, workers, serviceMode, releaseMode, stopClass}

def alter_nodes(xs: List<&2, M.Node>, +index: U32) -> List<&2, M.Node>:
  match xs:
    case Nil{}: Nil{}
    case Con{head, tail}: Con{alter_site(head, index), alter_nodes(tail, index)}

def profile_label(index: U32) -> String:
  match index:
    case 1: "CAPTURE PRESSURE"
    case 2: "REVIEW PRESSURE"
    case 3: "OUTPUT BATCHING"
    case _: "ARCHITECTURE DEFENSE"

def alter_rules(rules: M.Rules, +index: U32) -> M.Rules:
  match rules:
    case M.Contract{groupSize, batchBytes, batchOverhead, itemOverhead, +batchTarget, flushTicks, writerTicks, stopTicks, drainTicks, +smallBytes, +largeBytes, +oversizeEvery}:
      M.Contract{groupSize, batchBytes, batchOverhead, itemOverhead, M.choose(4, batchTarget, U32.is_eq(index, 3)), flushTicks, writerTicks, stopTicks, drainTicks, M.choose(2500, smallBytes, U32.is_eq(index, 3)), M.choose(2500, largeBytes, U32.is_eq(index, 3)), M.choose(0, oversizeEvery, U32.is_eq(index, 3))}

def alter_config(config: M.Config, +index: U32) -> M.Config:
  match config:
    case M.Board{label, nodes, lives, gold, pace, waves, waveTicks, pressureEvery, baseDemand, demandRamp, +rules}:
      M.Board{profile_label(index), alter_nodes(nodes, index), lives, gold, pace, waves, waveTicks, pressureEvery, baseDemand, demandRamp, alter_rules(rules, index)}

def select(index: U32) -> M.Config:
  alter_config(hapsland(), index)
