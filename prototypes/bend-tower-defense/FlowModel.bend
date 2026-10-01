# Generic teaching-game data; distinct from production Hapsland contracts.
import Base

type Stage is Data:
  Node{id: U32, label: String, serviceTicks: U32, queueLimit: U32, immediate: Bool,
    resourceLimit: U32, holdTicks: U32, next: U32, nextFinding: U32, upgradeCost: U32}

type Config is Data:
  Board{label: String, stages: List<&2, Stage>, startLives: U32, startGold: U32,
    workerPool: U32, basePace: U32, jobDeadline: U32, waves: U32, waveTicks: U32}

type StageState is Data:
  Station{id: U32, workers: U32, level: U32, completed: U32, refused: U32}

type Job is Data:
  Packet{id: U32, stage: U32, elapsed: U32, age: U32, finding: Bool, held: Bool}

# phase: preparation0, active1, won2, lost3. Selection is a stage ID.
# offered counts actual attempts plus missed deadline demand; conservation:
# offered = unfinished job count + finished + dropped.
type State is Data:
  World{clock: U32, waveClock: U32, wave: U32, phase: U32, lives: U32, gold: U32,
    score: U32, arrivalsLeft: U32, arrivalIn: U32, pace: U32, paused: Bool,
    selected: U32, freeWorkers: U32, offered: U32, finished: U32, dropped: U32,
    stages: List<&2, StageState>, jobs: List<&2, Job>}

def choose(+a: U32, +b: U32, yes: Bool) -> U32:
  match yes:
    case True{}: a
    case False{}: b

def sub_if(+a: U32, +b: U32, under: Bool) -> U32:
  match under:
    case True{}: 0
    case False{}: (a - b : U32)

def sub(+a: U32, +b: U32) -> U32:
  sub_if(a, b, (a < b : U32))
