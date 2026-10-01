# Shared deterministic session scheduling. IO and absolute host time stay outside.
import Base

type Config is Data:
  Settings{interval: U32, variation: U32, edits: U32, pause: U32, response: U32, repairDelay: U32}

type State is Data:
  Stream{random: U32, phase: U32, edit: U32, task: Nat, revision: Nat, generation: Nat, suspended: Bool, pendingPhase: U32, pendingEdit: U32, pendingTask: Nat, bytes: Nat, units: List<&2, Nat>}

type Input is Data:
  Emission{delay: U32, kind: U32, task: Nat, revision: Nat, generation: Nat, bytes: Nat, units: List<&2, Nat>, repair: Bool, recurring: Bool}

type Transition is Data:
  Changed{state: State, events: List<&2, Input>}

def state_random(s: State) -> U32:
  match s:
    case Stream{random, _, _, _, _, _, _, _, _, _, _, _}:
      random

def state_phase(s: State) -> U32:
  match s:
    case Stream{_, phase, _, _, _, _, _, _, _, _, _, _}:
      phase

def state_edit(s: State) -> U32:
  match s:
    case Stream{_, _, edit, _, _, _, _, _, _, _, _, _}:
      edit

def state_task(s: State) -> Nat:
  match s:
    case Stream{_, _, _, task, _, _, _, _, _, _, _, _}:
      task

def state_revision(s: State) -> Nat:
  match s:
    case Stream{_, _, _, _, revision, _, _, _, _, _, _, _}:
      revision

def state_generation(s: State) -> Nat:
  match s:
    case Stream{_, _, _, _, _, generation, _, _, _, _, _, _}:
      generation

def state_suspended(s: State) -> Bool:
  match s:
    case Stream{_, _, _, _, _, _, suspended, _, _, _, _, _}:
      suspended

def state_pendingPhase(s: State) -> U32:
  match s:
    case Stream{_, _, _, _, _, _, _, pendingPhase, _, _, _, _}:
      pendingPhase

def state_pendingEdit(s: State) -> U32:
  match s:
    case Stream{_, _, _, _, _, _, _, _, pendingEdit, _, _, _}:
      pendingEdit

def state_pendingTask(s: State) -> Nat:
  match s:
    case Stream{_, _, _, _, _, _, _, _, _, pendingTask, _, _}:
      pendingTask

def state_bytes(s: State) -> Nat:
  match s:
    case Stream{_, _, _, _, _, _, _, _, _, _, bytes, _}:
      bytes

def state_units(s: State) -> List<&2, Nat>:
  match s:
    case Stream{_, _, _, _, _, _, _, _, _, _, _, units}:
      units

def set_random(s: State, value: U32) -> State:
  match s:
    case Stream{_, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}:
      Stream{value, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}

def set_phase(s: State, value: U32) -> State:
  match s:
    case Stream{random, _, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}:
      Stream{random, value, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}

def set_edit(s: State, value: U32) -> State:
  match s:
    case Stream{random, phase, _, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}:
      Stream{random, phase, value, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}

def set_task(s: State, value: Nat) -> State:
  match s:
    case Stream{random, phase, edit, _, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}:
      Stream{random, phase, edit, value, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}

def set_revision(s: State, value: Nat) -> State:
  match s:
    case Stream{random, phase, edit, task, _, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}:
      Stream{random, phase, edit, task, value, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}

def set_generation(s: State, value: Nat) -> State:
  match s:
    case Stream{random, phase, edit, task, revision, _, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}:
      Stream{random, phase, edit, task, revision, value, suspended, pendingPhase, pendingEdit, pendingTask, bytes, units}

def set_suspended(s: State, value: Bool) -> State:
  match s:
    case Stream{random, phase, edit, task, revision, generation, _, pendingPhase, pendingEdit, pendingTask, bytes, units}:
      Stream{random, phase, edit, task, revision, generation, value, pendingPhase, pendingEdit, pendingTask, bytes, units}

def set_pendingPhase(s: State, value: U32) -> State:
  match s:
    case Stream{random, phase, edit, task, revision, generation, suspended, _, pendingEdit, pendingTask, bytes, units}:
      Stream{random, phase, edit, task, revision, generation, suspended, value, pendingEdit, pendingTask, bytes, units}

def set_pendingEdit(s: State, value: U32) -> State:
  match s:
    case Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, _, pendingTask, bytes, units}:
      Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, value, pendingTask, bytes, units}

def set_pendingTask(s: State, value: Nat) -> State:
  match s:
    case Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, _, bytes, units}:
      Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, value, bytes, units}

def set_bytes(s: State, value: Nat) -> State:
  match s:
    case Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, _, units}:
      Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, value, units}

def set_units(s: State, value: List<&2, Nat>) -> State:
  match s:
    case Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, _}:
      Stream{random, phase, edit, task, revision, generation, suspended, pendingPhase, pendingEdit, pendingTask, bytes, value}

def transition_state(t: Transition) -> State:
  match t:
    case Changed{s, _}:
      s

def transition_events(t: Transition) -> List<&2, Input>:
  match t:
    case Changed{_, events}:
      events

def event_delay(e: Input) -> U32:
  match e:
    case Emission{delay, _, _, _, _, _, _, _, _}:
      delay

def event_kind(e: Input) -> U32:
  match e:
    case Emission{_, kind, _, _, _, _, _, _, _}:
      kind

def event_task(e: Input) -> Nat:
  match e:
    case Emission{_, _, task, _, _, _, _, _, _}:
      task

def event_revision(e: Input) -> Nat:
  match e:
    case Emission{_, _, _, revision, _, _, _, _, _}:
      revision

def event_generation(e: Input) -> Nat:
  match e:
    case Emission{_, _, _, _, generation, _, _, _, _}:
      generation

def event_bytes(e: Input) -> Nat:
  match e:
    case Emission{_, _, _, _, _, bytes, _, _, _}:
      bytes

def event_units(e: Input) -> List<&2, Nat>:
  match e:
    case Emission{_, _, _, _, _, _, units, _, _}:
      units

def event_repair(e: Input) -> Bool:
  match e:
    case Emission{_, _, _, _, _, _, _, repair, _}:
      repair

def event_recurring(e: Input) -> Bool:
  match e:
    case Emission{_, _, _, _, _, _, _, _, recurring}:
      recurring

def seed_hash(codes: List<&2, U32>, seed: U32) -> U32:
  match codes:
    case Nil{}:
      seed
    case Con{code, tail}:
      seed_hash(tail, ((seed .^. code) * 16777619 : U32))

def nonzero(+seed: U32) -> U32:
  Bool.pick(U32, U32.is_eq(seed, 0), 1, seed)

def initial(config: Config, seed: U32, codes: List<&2, U32>, bytes: Nat, units: List<&2, Nat>) -> State:
  Stream{nonzero(seed_hash(codes, seed)), 0, 0, 0n, 0n, 0n, False{}, 0, 0, 0n, bytes, units}

def random_step(+random: U32) -> U32:
  +a = (random .^. (random << 13n) : U32)
  +b = (a .^. (a >> 17n) : U32)
  (b .^. (b << 5n) : U32)

def positive_delay(+total: U32, +variation: U32) -> U32:
  Bool.pick(U32, (total > variation : U32), (total - variation : U32), 1)

def sample_delay(config: Config, random: U32) -> U32:
  match config:
    case Settings{interval, +variation, _, _, _, _}:
      positive_delay((interval + (random % (2 * variation + 1) : U32) : U32), variation)

def snapshot(+s: State) -> State:
  set_pendingTask(set_pendingEdit(set_pendingPhase(s, state_phase(s)), state_edit(s)), state_task(s))

def emission(+s: State, delay: U32, kind: U32, repair: Bool, recurring: Bool) -> Input:
  Emission{delay, kind, state_task(s), state_revision(s), state_generation(s), state_bytes(s), state_units(s), repair, recurring}

def fresh(+s: State, delay: U32, repair: Bool, recurring: Bool) -> Transition:
  +updated = set_revision(s, (state_revision(s) + 1n : Nat))
  Changed{updated, [emission(updated, delay, 1, repair, recurring)]}

def task_next(config: Config, +s: State) -> Transition:
  match config:
    case Settings{_, _, _, pause, _, _}:
      delay = Bool.pick(U32, Nat.is_eq(state_task(s), 0n), 0, pause)
      +updated = set_task(set_edit(set_phase(s, 1), 0), (state_task(s) + 1n : Nat))
      Changed{updated, [emission(updated, delay, 0, False{}, True{})]}

def edit_next(+config: Config, +s: State) -> Transition:
  match config:
    case Settings{_, _, edits, _, _, _}:
      +count = (state_edit(s) + 1 : U32)
      +random = random_step(state_random(s))
      updated = set_random(set_edit(set_phase(s, Bool.pick(U32, (count >= edits : U32), 2, 1)), count), random)
      fresh(updated, sample_delay(config, random), False{}, True{})

def finish_next(+config: Config, +s: State) -> Transition:
  +random = random_step(state_random(s))
  +updated = set_random(set_phase(s, 0), random)
  Changed{updated, [emission(updated, sample_delay(config, random), 2, False{}, True{})]}

def phase_next(config: Config, +s: State, phase: U32) -> Transition:
  match phase:
    case 0:
      task_next(config, s)
    case 1:
      edit_next(config, s)
    case _:
      finish_next(config, s)

def enabled_next(config: Config, +s: State, suspended: Bool) -> Transition:
  match suspended:
    case True{}:
      Changed{s, []}
    case False{}:
      +saved = snapshot(s)
      phase_next(config, saved, state_phase(saved))

def next(config: Config, +s: State) -> Transition:
  enabled_next(config, s, state_suspended(s))

def finish_state(s: State, continuation: Bool) -> State:
  match continuation:
    case True{}:
      set_edit(set_phase(s, 1), 0)
    case False{}:
      set_phase(s, 0)

def on_finish(config: Config, s: State, continuation: Bool) -> Transition:
  next(config, finish_state(s, continuation))

def rewind(+config: Config, +s: State) -> Transition:
  updated = set_task(set_edit(set_phase(set_generation(s, (state_generation(s) + 1n : Nat)), state_pendingPhase(s)), state_pendingEdit(s)), state_pendingTask(s))
  next(config, updated)

def sizes(s: State, bytes: Nat, units: List<&2, Nat>) -> State:
  set_units(set_bytes(s, bytes), units)

def suspend(config: Config, s: State, suspended: Bool) -> Transition:
  rewind(config, set_suspended(s, suspended))

def set_interval(config: Config, interval: U32) -> Config:
  match config:
    case Settings{_, variation, edits, pause, response, repairDelay}:
      Settings{interval, variation, edits, pause, response, repairDelay}

def advice_case(s: State, response: U32, repairDelay: U32) -> Transition:
  match response:
    case 0:
      Changed{s, []}
    case 1:
      Changed{s, []}
    case 2:
      fresh(s, 1, True{}, False{})
    case _:
      fresh(s, repairDelay, True{}, False{})

def on_advice(config: Config, s: State) -> Transition:
  match config:
    case Settings{_, _, _, _, response, repairDelay}:
      advice_case(s, response, repairDelay)

def burst_events(count: Nat, +s: State) -> List<&2, Input>:
  match count:
    case 0n:
      []
    case 1n+p:
      +updated = set_revision(s, (state_revision(s) + 1n : Nat))
      emission(updated, 0, 1, False{}, False{}) <> burst_events(p, updated)

def burst(+count: Nat, +s: State) -> Transition:
  Changed{set_revision(s, (state_revision(s) + count : Nat)), burst_events(count, s)}
