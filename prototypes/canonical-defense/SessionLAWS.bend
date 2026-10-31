import Base
import ./DefenseSession.bend as S

# Guarantees: normal play stops exactly when health is zero.
# Why it matters: the player's defeated world must stop rather than silently run.
law normal_health_gate:
  for hp: U32
  {S.playable(S.Normal{}, hp) == (hp > 0 : U32) : Bool}
# Guarantees: sandbox play remains enabled for every health value.
# Why it matters: continuing the defeated world at zero health resumes its queues.
law sandbox_keeps_running:
  for hp: U32
  {S.playable(S.Sandbox{}, hp) == True{} : Bool}
# Guarantees: continuing normal play at zero health selects sandbox mode.
# Why it matters: the continuation action must preserve zero health without stopping again.
law continue_defeat:
  {S.continue_mode(S.Normal{}, 0) == S.Sandbox{} : S.Mode}
# Guarantees: sandbox continuation stays sandbox for every health value.
# Why it matters: repeating Continue cannot re-enable health damage.
law sandbox_stays_sandbox:
  for hp: U32
  {S.continue_mode(S.Sandbox{}, hp) == S.Sandbox{} : S.Mode}
# Guarantees: every accumulated pressure total is zeroed in sandbox.
# Why it matters: pressure may remain high while the player watches the old queue drain.
law sandbox_has_no_damage:
  for total: U32
  {S.damage_total(S.Sandbox{}, total) == 0 : U32}
