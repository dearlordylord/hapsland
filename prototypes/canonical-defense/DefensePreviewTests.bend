# Read-only hover and game ownership checks using original generic controls.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefensePreview.bend as Preview
import ./DefenseConsumerTests.bend as Check
import ../../packages/monkey-business-bend/NativeRun.bend as Run

def hovered(world: M.World, x: U32, y: U32, kind: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, _, g, h, ts, a, o, r, cl, d, auto, _, _, _, damage, flash}:
      M.World{core, t, p, l, kind, g, h, ts, a, o, r, cl, d, auto, x, y, 0, damage, flash}
def world_value(items: List<&2, M.World>) -> M.World:
  match items:
    case world <> _: world
    case _: H.initial()
def main() -> IO(Unit):
  +world: List<&2, M.World> = [H.initial()]
  +hover: List<&2, M.World> = [hovered(world_value(world), 424, 392, 3)]
  +preview = Preview.calculate(world_value(hover))
  do IO<Unit>:
    Check.require(
      Check.same_observation(
        Run.observe(M.engine(world_value(hover))),
        Run.observe(M.engine(world_value(world)))
      ),
      "hover preserves engine time, transitions and queue"
    )
    Check.require(
      U32.is_eq(Preview.cost(preview), 50) && U32.is_eq(Preview.kind(preview), 3),
      "accelerator preview displays the actual50 gold price"
    )
    Check.require(
      U32.is_eq(
        Preview.before(preview),
        0
      ) && U32.is_eq(Preview.delta(preview), 0) && U32.is_eq(Preview.after(preview), 0),
      "empty construction state invents no current acceleration target"
    )
    Check.require(
      U32.is_eq(M.gold(H.click(world_value(hover), 424, 392)), 110),
      "legal preview construction charges the displayed50 gold"
    )
    Check.require(
      U32.is_eq(Preview.status(Preview.calculate(hovered(world_value(world), 424, 232, 3))), 4),
      "out-of-range hover explicitly displays no current work in range"
    )
