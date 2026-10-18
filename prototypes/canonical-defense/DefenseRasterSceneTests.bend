# Actual game scene parity; native adapter primitives have a separate small root.
import Base
import ./DefenseRaster.bend as Native
import ./DefenseNativeRasterTests.bend as Pixel
import ./DefenseRender.bend as R
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M

def actual(+world: M.World) -> IO(Unit):
  do IO<Unit>:
    +image : Image <- Native.rasterize(R.scene(~R.base_scene, world))
    Pixel.check(Pixel.same_image(image, R.view(world)))
    return Image.free(4n, image)
def main() -> IO(Unit):
  do IO<Unit>:
    actual(H.key(H.reset_layout(0), 49))
    actual(H.key(H.reset_layout(1), 50))
    actual(H.key(H.reset_layout(2), 49))
    actual(H.move(H.key(H.reset_layout(0), 49), 652, 215))
    actual(H.move(H.key(H.reset_layout(0), 50), 152, 456))
    actual(H.key(H.move(H.key(H.reset_layout(0), 49), 652, 215), 112))
