# Read-only presentation history. No field is a simulator control.
import Base

type WorkIdentity is Data:
  WorkIdentity{partition: Nat,lifetime: Nat,round: Nat,operation: Nat}
type Waypoint is Data:
  Waypoint{x: U32,y: U32,phase: U32,time: Nat}
type Actor is Data:
  Actor{key: WorkIdentity,family: Nat,lane: U32,x: U32,y: U32,phase: U32,observed: U32,
    path: List<&2,Waypoint>,terminal: U32,predecessor: List<&2,WorkIdentity>,shown: Nat,outcome: U32,released: Bool}
