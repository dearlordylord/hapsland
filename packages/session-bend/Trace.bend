# Native parity witness for the literal same module imported by Monkey Business.
import Base
import ./Session.bend as S

def main() -> IO(Unit):
  +config = {S.Settings{31, 23, 2, 71, 3, 113} : S.Config}
  +state = S.initial(config, 4294967295, [97, 103, 101, 110, 116, 45, 49], 123n, [1n, 2n, 333n])
  +task = S.next(config, state)
  +edit = S.next(config, S.transition_state(task))
  +after = S.transition_state(edit)
  text = Nat.show(S.state_task(after)) ++ ":" ++ Nat.show(S.state_revision(after)) ++ ":" ++ U32.show(S.state_random(after)) ++ ":" ++ U32.show(S.sample_delay(config, S.state_random(after)))
  IO.print(text)
