# Configurable architectural queue roads and buildings; pure teaching-game data.
import Base

type Node is Data:
  Site{id: U32, label: String, startX: U32, startY: U32, x: U32, y: U32,
    length: U32, speed: U32, slots: U32, roadLimit: U32, work: U32,
    next: U32, nextFinding: U32, immediate: Bool, workers: U32,
    serviceMode: U32, releaseMode: U32, stopClass: U32}

# serviceMode0 ordinary worker slots;1 exclusive byte-batch writer.
# releaseMode1 waits an edit's sibling review frontier;0 ordinary.
# stopClass0 preparation;2 review unfinished until completion;1 retained finding.
type Rules is Data:
  Contract{groupSize: U32, batchBytes: U32, batchOverhead: U32,
    itemOverhead: U32, batchTarget: U32, flushTicks: U32, writerTicks: U32,
    stopTicks: U32, drainTicks: U32, smallBytes: U32, largeBytes: U32,
    oversizeEvery: U32}

type Config is Data:
  Board{label: String, nodes: List<&2, Node>, lives: U32, gold: U32, pace: U32,
    waves: U32, waveTicks: U32, pressureEvery: U32, baseDemand: U32, demandRamp: U32, rules: Rules}

type Enemy is Data:
  Packet{id: U32, stage: U32, progress: U32, effort: U32, inside: Bool,
    finding: Bool, edit: U32, bytes: U32}

type Support is Data:
  Pulse{charges: U32, prevented: U32}

# Shield charges are finite pressure-job-ticks, refreshed only at legitimate wave start.
type Tower is Data:
  Processor{x: U32, y: U32, kind: U32, level: U32, cooldown: U32,
    flash: U32, aimX: U32, aimY: U32, support: Support}

type Writer is Data:
  Output{members: List<&2, U32>, bytes: U32, left: U32, deadline: U32}

# stop0 ordinary;1 WAIT;2 DECIDING;3 OUTPUT;4 response cycle complete.
# At most4 finding-bearing Stop batches, each a separate automatic response.
type Runtime is Data:
  Run{stop: U32, deadline: U32, flushAge: U32, writer: Writer,
    cancelled: U32, limited: U32, batches: U32, acknowledged: U32,
    clear: U32, findings: U32, attempts: U32, cutoff: Bool}

# phase0 preparation,1active,2won,3lost; selected tower index one-based.
# pressure is residual arrived-building job-ticks including pending and reserved output, never safe-road travel.
type State is Data:
  World{clock: U32, waveClock: U32, wave: U32, phase: U32, lives: U32,
    gold: U32, score: U32, left: U32, arrivalIn: U32, pace: U32, paused: Bool,
    choice: U32, selected: U32, mouseX: U32, mouseY: U32, offered: U32,
    finished: U32, dropped: U32, pressure: U32,
    towers: List<&2, Tower>, enemies: List<&2, Enemy>, runtime: Runtime}

def choose(a: U32, b: U32, yes: Bool) -> U32:
  match yes:
    case True{}: a
    case False{}: b

def sub_if(a: U32, b: U32, less: Bool) -> U32:
  match less:
    case True{}: 0
    case False{}: (a - b : U32)

def sub(+a: U32, +b: U32) -> U32:
  sub_if(a, b, (a < b : U32))

def absdiff(+a: U32, +b: U32) -> U32:
  (sub(a, b) + sub(b, a) : U32)

def square(+x: U32) -> U32:
  (x * x : U32)

def distance(x: U32, y: U32, tx: U32, ty: U32) -> U32:
  (square(absdiff(x, tx)) + square(absdiff(y, ty)) : U32)
