# Independently expected placement and investment examples, not universal proofs.
import Base
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def built(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{+world,Lab.Applied{},55}:
      U32.is_eq(M.gold(world),105) && Nat.is_eq(List.length(&2,M.Tower,M.towers(world)),1n)
    case _: False{}
def illegal(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.IllegalPlacement{},0}: U32.is_eq(M.gold(world),160)
    case _: False{}
def poor(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.Unaffordable{},0}: U32.is_eq(M.gold(world),54)
    case _: False{}
def level_two(found: Maybe<&2,M.Tower>) -> Bool:
  match found:
    case Some{tower}: U32.is_eq(M.level(tower),2)
    case None{}: False{}
def upgraded(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{+world,Lab.Applied{},40}:
      U32.is_eq(M.gold(world),65) && level_two(H.selected_tower(M.towers(world),1))
    case _: False{}
def world(receipt: Lab.Receipt) -> M.World:
  match receipt:
    case Lab.Receipt{value,_,_}: value
def full(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.MaxLevel{},0}: U32.is_eq(M.gold(world),5)
    case _: False{}
def unknown(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.UnknownTower{},0}: U32.is_eq(M.gold(world),160)
    case _: False{}
def initial_observation(value: Lab.GameObservation) -> Bool:
  match value:
    case Lab.GameObservation{100,160,0,count}: Nat.is_eq(count,0n)
    case _: False{}
def main() -> IO(Unit):
  +origin = H.initial()
  +placed = world(Lab.apply(origin,Lab.Build{424,232,1}))
  +level_three = world(Lab.apply(world(Lab.apply(placed,Lab.Upgrade{1})),Lab.Upgrade{1}))
  do IO<Unit>:
    require(built(Lab.apply(origin,Lab.Build{424,232,1})),"Refiner legal placement costs55")
    require(illegal(Lab.apply(origin,Lab.Build{0,0,1})),"illegal placement preserves160 budget")
    require(poor(Lab.apply(Lab.with_budget(origin,54),Lab.Build{424,232,1})),"unaffordable placement costs zero")
    require(upgraded(Lab.apply(placed,Lab.Upgrade{1})),"first upgrade costs40")
    require(full(Lab.apply(level_three,Lab.Upgrade{1})),"maximum level rejects further upgrade without charge")
    require(unknown(Lab.apply(origin,Lab.Upgrade{1})),"absent tower upgrade costs zero")
    require(initial_observation(Lab.observe(origin)),"actual game health and budget observed separately")
