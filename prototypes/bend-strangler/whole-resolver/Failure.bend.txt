import Base
import ./Types.bend as T
import ./Loop.bend as Loop

def malformed() -> Loop.Continuation:
  Loop.ServiceStep{T.FailedResolver{T.MalformedReply{}}}


def main() -> Unit:
  Unit{}
