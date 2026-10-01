import Base
import ./DefenseTests.bend as HostTests
import ./DefensePreviewTests.bend as T0
import ./DefenseOutputTests.bend as T1
import ./DefenseAutoTests.bend as T2
import ./DefenseMapTests.bend as T3
import ./DefenseRasterTests.bend as T4

def main() -> IO(Unit):
  do IO<Unit>:
    HostTests.main()
    T0.main()
    T1.main()
    T2.main()
    T3.main()
    T4.main()
