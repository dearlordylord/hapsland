import Base
import ../CollectionHandoff.bend as Root
import ../Handoff.bend as Handoff

# Verification observations, not a second production protocol. Finite tapes retain
# unconsumed replies and exact Await/Done/Rejected states; exhaustion is not success.
type RootEvent is Data:
  RootEvent{request: Root.RootRequest, atomic: Bool}
type RootTrace is Data:
  RootTrace{
    requests: List<&2, RootEvent>,
    remaining: List<&2, Root.RootReply>,
    final: Root.RootStep
  }
type PrepareTrace is Data:
  PrepareTrace{
    requests: List<&2, Handoff.PRequest>,
    remaining: List<&2, Handoff.PReply>,
    final: Handoff.PStep
  }
type FinalizeTrace is Data:
  FinalizeTrace{
    requests: List<&2, Handoff.DRequest>,
    remaining: List<&2, Handoff.DReply>,
    final: Handoff.DStep
  }
type CommitTrace is Data:
  CommitTrace{
    requests: List<&2, Handoff.KRequest>,
    remaining: List<&2, Handoff.KReply>,
    final: Handoff.KStep
  }
type ReconcileTrace is Data:
  ReconcileTrace{
    requests: List<&2, Handoff.RRequest>,
    remaining: List<&2, Handoff.RReply>,
    final: Handoff.RStep
  }
