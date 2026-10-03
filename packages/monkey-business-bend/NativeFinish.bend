import Base
import ./Driver.bend as Driver
import ./StopScenario.bend as StopScenario

# Factual native poll timing. The shared Stop owner decides every transition.
def poll(finish: StopScenario.Finish, +now: Nat, +delay: Nat) -> Driver.Action:
  match finish:
    case StopScenario.Finish{p, l, r, _, _, deadline, _, _, _, _, started, fit_pending, output}:
      Driver.Action{StopScenario.cutoff_poll(p,l,r,deadline,Nat.add(now,delay)), delay, None{}, False{}, None{}}
