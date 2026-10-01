import Base
import ./DefenseBalance.bend as B
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseAutoTests.bend as Campaign
import ./DefenseProjection.bend as P

def extra_maps(fuel: Nat,+layout: U32) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit,Unit{})
    case 1n+n:
      do IO<Unit>:
        B.offsets(2n,layout,0,6,0)
        B.offsets(2n,layout,0,7,0)
        B.offsets(2n,layout,0,8,0)
        B.offsets(2n,layout,0,9,0)
        B.offsets(2n,layout,0,10,0)
        B.offsets(2n,layout,0,11,0)
        extra_maps(n,(layout + 1 : U32))
def campaign(+kind: U32) -> IO(Unit):
  +start = H.key(B.plan(H.initial(),0,kind),97)
  +done = Campaign.checked_world(Campaign.run_checked(65000n,start,True{}))
  IO.print("CAMPAIGN plan=" ++ U32.show(kind) ++ " wave=" ++ U32.show(M.wave(done)) ++ " hp=" ++ U32.show(M.hp(done)) ++ " clear=" ++ U32.show(M.clear(done)) ++ " delivered=" ++ U32.show(M.delivered(done)) ++ " status=" ++ U32.show(H.wave_status(done)) ++ " owned=" ++ U32.show(P.ledger_bytes(done)))
def main() -> IO(Unit):
  do IO<Unit>:
    extra_maps(3n,0)
    B.plans(6n,0,3,0)
    B.offsets(4n,0,3,6,0)
    campaign(1)
    campaign(2)
    campaign(12)
