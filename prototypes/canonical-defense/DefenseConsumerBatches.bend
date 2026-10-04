import Base
import ./DefenseConsumerObserved.bend as Observed
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

# Lossless transport partitions actual retained observations, never game execution.
type Batch is Data:
  GameBatch{config: T.Config, creation_seed: Nat, campaign_seed: Nat,
    original: List<&2,Observed.Input>, checkpoint: Nat, input: Observed.Input,
    before: List<&2,M.World>, after: List<&2,M.World>, offset: Nat,
    ticks: List<&2,Observed.TickSnapshot>, checkpoint_end: Bool}

def with_ticks(batch: Batch, offset: Nat, ticks: List<&2,Observed.TickSnapshot>, ended: Bool) -> Batch:
  match batch:
    case GameBatch{config,creation,campaign,original,index,input,before,after,_,_,_}:
      GameBatch{config,creation,campaign,original,index,input,before,after,offset,ticks,ended}

def chunk_ready(full: Bool, +batch: Batch, +offset: Nat, +count: Nat,
    current: List<&2,Observed.TickSnapshot>, rest: List<&2,Observed.TickSnapshot> -> Nat -> List<&2,Batch>) -> List<&2,Batch>:
  match full:
    case True{}: with_ticks(batch,offset,List.reverse(&2,Observed.TickSnapshot,current),False{}) <> rest([],Nat.add(offset,count))
    case False{}: rest(current,offset)

def tick_batches(ticks: List<&2,Observed.TickSnapshot>, +batch: Batch, +offset: Nat,
    current: List<&2,Observed.TickSnapshot>, +count: Nat) -> List<&2,Batch>:
  match ticks:
    case Nil{}: [with_ticks(batch,offset,List.reverse(&2,Observed.TickSnapshot,current),True{})]
    case head <> +tail:
      chunk_ready(Nat.is_eq(count,63n),batch,offset,Nat.add(count,1n),head <> current,
        next => position => tick_batches(tail,batch,position,next,
          Nat.mod(Nat.add(count,1n),64n)))

def checkpoint_batches(checkpoints: List<&2,Observed.Checkpoint>, +config: T.Config,
    +creation: Nat, +campaign: Nat, +original: List<&2,Observed.Input>, index: Nat) -> List<&2,Batch>:
  match checkpoints:
    case Nil{}: []
    case Observed.Checkpoint{input,before,after,ticks} <> tail:
      List.append(&2,Batch,tick_batches(ticks,GameBatch{config,creation,campaign,original,index,input,before,after,0n,[],False{}},0n,[],0n),
        checkpoint_batches(tail,config,creation,campaign,original,Nat.add(index,1n)))

def envelope_batches(envelope: Observed.Envelope) -> List<&2,Batch>:
  match envelope:
    case Observed.Envelope{config,creation,campaign,original,Observed.Trace{_,checkpoints}}:
      checkpoint_batches(checkpoints,config,creation,campaign,original,0n)

def batches(envelopes: List<&2,Observed.Envelope>) -> List<&2,Batch>:
  match envelopes:
    case Nil{}: []
    case head <> tail: List.append(&2,Batch,envelope_batches(head),batches(tail))
