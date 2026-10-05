# Game-owned rule receipts and visual fragments. No extra Jev requests.
import Base
import ./DefenseMotionTypes.bend as V

type Profile is Data:
  Profile{checks: U32, percent: U32}
type Fragment is Data:
  Fragment{rule: U32, finding: Bool, x: U32, y: U32, path: List<&2,V.Waypoint>}
type Group is Data:
  Group{owner: V.WorkIdentity, request: Nat, profile: Profile, results: List<&2,Bool>,
    split: Bool, fragments: List<&2,Fragment>, retired: Bool, sent: U32, seat: U32, shape: U32}
type State is Data:
  State{profile: Profile, groups: List<&2,Group>}
