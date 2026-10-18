# Actual game investment controls; business state remains owned by NativeRun.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMechanics.bend as Mechanics
import ./DefenseTowerFire.bend as Fire
import ./DefenseConsumerTests.bend as Check
import ../../packages/monkey-business-bend/NativeRun.bend as Run

def world_value(items: List<&2, M.World>) -> M.World:
  match items:
    case world <> _: world
    case _: H.initial()
def first(items: List<&2, M.Tower>) -> M.Tower:
  match items:
    case tower <> _: tower
    case _: M.Tower{0, 0, 3, 1, 1, 60, 0}
def main() -> IO(Unit):
  +origin: List<&2, M.World> = [H.initial()]
  +built: List<&2, M.World> = [H.build(world_value(origin), 424, 392, 3)]
  +two: List<&2, M.World> = [H.upgrade(H.select(world_value(built), 1))]
  +three: List<&2, M.World> = [H.upgrade(world_value(two))]
  do IO<Unit>:
    Check.require(U32.is_eq(M.gold(world_value(built)), 110), "accelerator costs50")
    Check.require(
      U32.is_eq(M.gold(H.build(world_value(origin), 152, 392, 4)), 120),
      "courier costs40"
    )
    Check.require(
      U32.is_eq(M.gold(H.build(world_value(origin), 424, 392, 0)), 160),
      "retired building-scoped kind cannot be bought"
    )
    Check.require(
      U32.is_eq(
        M.choice(H.key(world_value(origin), 49)),
        3
      ) && U32.is_eq(M.choice(H.key(world_value(origin), 50)), 4),
      "keys1 and2 select actual automatic kinds"
    )
    Check.require(
      Check.same_observation(
        Run.observe(M.engine(world_value(built))),
        Run.observe(M.engine(world_value(origin)))
      ),
      "construction changes no business profile or captured outcome"
    )
    Check.require(
      U32.is_eq(M.gold(world_value(two)), 70) && U32.is_eq(M.gold(world_value(three)), 10),
      "upgrades cost40 then60"
    )
    Check.require(
      U32.is_eq(
        Fire.cooldown(first(M.towers(world_value(built)))),
        20
      ) && U32.is_eq(
        Fire.cooldown(first(M.towers(world_value(two)))),
        10
      ) && U32.is_eq(Fire.cooldown(first(M.towers(world_value(three)))), 6),
      "upgrades shorten shot gap20 to10 to6 ticks"
    )
    Check.require(
      U32.is_eq(
        H.built_range(first(M.towers(world_value(built)))),
        72
      ) && U32.is_eq(
        H.built_range(first(M.towers(world_value(two)))),
        84
      ) && U32.is_eq(H.built_range(first(M.towers(world_value(three)))), 96),
      "upgrades expand radius72 to84 to96"
    )
    Check.require(
      U32.is_eq(M.gold(H.upgrade(world_value(three))), 10),
      "max-level upgrade spends nothing"
    )
    Check.require(
      U32.is_eq(M.ready_at(Mechanics.upgraded(M.Tower{328, 424, 3, 1, 1, 60, 77})), 77),
      "upgrade preserves armed cooldown deadline77"
    )
    Check.require(
      U32.is_eq(M.gold(H.build_tuned(world_value(origin), 424, 392, 3, 0, 60)), 160),
      "zero strength refuses without charge"
    )
