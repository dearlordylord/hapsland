import Base
import ./DefenseConsumerTests.bend as Consumer
import ./ConfigAgreement.bend as Agreement
import ./DefensePreviewTests.bend as Preview
import ./DefenseMapTests.bend as Map
import ./DefenseDrawTests.bend as Draw
import ./DefenseRasterTests.bend as Raster
def main() -> IO(Unit):
  do IO<Unit>:
    Consumer.main()
    Preview.main()
    Map.main()
    Draw.main()
    Raster.main()
