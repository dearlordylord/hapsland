# Maximum refusal history must be handled in a single pass, not exponential recursion.
import Base
import ./DefenseCues.bend as Cues
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def refusal_list(fuel: Nat) -> List<&2,M.Cue>:
  match fuel:
    case 0n: []
    case 1n++n: M.Cue{2,n,n,24,174,60} <> refusal_list(n)
def expired_ttl(items: List<&2,M.Cue>) -> Bool:
  match items:
    case Nil{}: True{}
    case cue <> rest: U32.is_eq(M.cue_ttl(cue),59) && expired_ttl(rest)
def main() -> IO(Unit):
  do IO<Unit>:
    require(Nat.is_eq(List.length(&2,M.Cue,Cues.select(refusal_list(32n),True{})),32n),"all32 retained refusal facts survive selection")
    require(expired_ttl(Cues.expire(refusal_list(32n),H.initial(),H.initial())),"all32 refusal timers expire once without duplicate tail evaluation")
