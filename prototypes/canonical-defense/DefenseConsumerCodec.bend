import Base
import ../../packages/agent-flow-bend/Admission.bend as Admission
import ../../packages/monkey-business-bend/AdviceeActivity.bend as AdviceeActivity
import ../../packages/monkey-business-bend/AdviceeLifecycle.bend as AdviceeLifecycle
import ../../packages/monkey-business-bend/AdviceeLifecycleCleanup.bend as AdviceeLifecycleCleanup
import ../../packages/monkey-business-bend/Advicees.bend as Advicees
import ../../packages/monkey-business-bend/CacheRuntime.bend as CacheRuntime
import ../../packages/monkey-business-bend/CacheScenario.bend as CacheScenario
import ../../packages/monkey-business-bend/Callbacks.bend as Callbacks
import ../../packages/agent-flow-bend/Canonical.bend as Canonical
import ../../packages/monkey-business-bend/CollectionScenario.bend as CollectionScenario
import ../../packages/agent-flow-bend/CollectionState.bend as CollectionState
import ../../packages/agent-flow-bend/CollectorAuthority.bend as CollectorAuthority
import ../../packages/monkey-business-bend/CollectorScenario.bend as CollectorScenario
import ../../packages/agent-flow-bend/Configuration.bend as Configuration
import ../../packages/monkey-business-bend/CredentialFacts.bend as CredentialFacts
import ./DefenseAuto.bend as DefenseAuto
import ./DefenseConsumerBatches.bend as DefenseConsumerBatches
import ./DefenseConsumerObserved.bend as DefenseConsumerObserved
import ./DefenseModel.bend as DefenseModel
import ./DefenseMotionTypes.bend as DefenseMotionTypes
import ../../packages/agent-flow-bend/Delivery.bend as Delivery
import ../../packages/agent-flow-bend/DeliveryState.bend as DeliveryState
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/monkey-business-bend/Driver.bend as Driver
import ../../packages/agent-flow-bend/EditHistory.bend as EditHistory
import ../../packages/monkey-business-bend/ExpiryScenario.bend as ExpiryScenario
import ../../packages/monkey-business-bend/FreshnessScenario.bend as FreshnessScenario
import ../../packages/agent-flow-bend/Handoff.bend as Handoff
import ../../packages/agent-flow-bend/ImportGraph.bend as ImportGraph
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/monkey-business-bend/NativeRunTypes.bend as NativeRunTypes
import ../../packages/monkey-business-bend/NoticeScenario.bend as NoticeScenario
import ../../packages/agent-flow-bend/NoticeState.bend as NoticeState
import ../../packages/monkey-business-bend/Numeric.bend as Numeric
import ../../packages/monkey-business-bend/OutputScenario.bend as OutputScenario
import ../../packages/agent-flow-bend/Quiescence.bend as Quiescence
import ../../packages/monkey-business-bend/Random.bend as Random
import ../../packages/agent-flow-bend/Retention.bend as Retention
import ../../packages/agent-flow-bend/Reuse.bend as Reuse
import ../../packages/agent-flow-bend/ReuseState.bend as ReuseState
import ../../packages/agent-flow-bend/RevisionState.bend as RevisionState
import ../../packages/agent-flow-bend/RulePolicy.bend as RulePolicy
import ../../packages/monkey-business-bend/RuntimeScenarios.bend as RuntimeScenarios
import ../../packages/monkey-business-bend/Scheduler.bend as Scheduler
import ../../packages/monkey-business-bend/ScopedRevision.bend as ScopedRevision
import ../../packages/monkey-business-bend/Session.bend as Session
import ../../packages/monkey-business-bend/SharingRuntime.bend as SharingRuntime
import ../../packages/monkey-business-bend/SharingScenario.bend as SharingScenario
import ../../packages/monkey-business-bend/StopScenario.bend as StopScenario
import ../../packages/agent-flow-bend/SubmissionState.bend as SubmissionState
import ../../packages/monkey-business-bend/TreeFacts.bend as TreeFacts
import ../../packages/monkey-business-bend/Types.bend as Types
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ../../packages/monkey-business-bend/WriterScenario.bend as WriterScenario

# Lossless private prefix transport, generated from the actual owner ADTs.
# Every ordinal is local to its expected type; all fields remain in owner order.
# Each encoder prepends to a suffix, avoiding text/concat continuations.

def boolean(value: Bool, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match value:
    case False{}: 0n <> suffix
    case True{}: 1n <> suffix

def text_words(value: String) -> List<&2,Nat>:
  match value:
    case SNil{}: []
    case SCon{Chr{code},tail}: U32.to_nat(code) <> text_words(tail)

def text(values: List<&2,String>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case value <> Nil{}:
      +words=text_words(value)
      List.length(&2,Nat,words) <> List.append(&2,Nat,words,suffix)
    case _: 999999n <> suffix

def ledger_limits(values: List<&2,Ledger.Limits>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Ledger.Limits{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def ledger_purpose(values: List<&2,Ledger.Purpose>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Ledger.ObservationDispatch{} <> Nil{}: 0n <> suffix
    case Ledger.Preparation{} <> Nil{}: 1n <> suffix
    case Ledger.ReviewUnit{} <> Nil{}: 2n <> suffix
    case Ledger.StoredResult{} <> Nil{}: 3n <> suffix
    case Ledger.OperationalNotice{} <> Nil{}: 4n <> suffix
    case Ledger.AdviceRecheck{} <> Nil{}: 5n <> suffix
    case _: 999999n <> suffix

def ledger_charge(values: List<&2,Ledger.Charge>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Ledger.Charge{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> ledger_purpose([v3],suffix)
    case _: 999999n <> suffix

def list_ledger_charge_items(values: List<&2,List<&2,Ledger.Charge>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: ledger_charge([head],list_ledger_charge_items([tail],suffix))
    case _: 999999n <> suffix

def list_ledger_charge(values: List<&2,List<&2,Ledger.Charge>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Ledger.Charge,value) <> list_ledger_charge_items([value],suffix)
    case _: 999999n <> suffix

def ledger_ledger(values: List<&2,Ledger.Ledger>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Ledger.Ledger{v0,v1,v2} <> Nil{}: 0n <> ledger_limits([v0],v1 <> list_ledger_charge([v2],suffix))
    case _: 999999n <> suffix

def maybe_nat(values: List<&2,Maybe<&2,Nat>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> value <> suffix
    case _: 999999n <> suffix

def canonical_round(values: List<&2,Canonical.Round>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.Round{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 0n <> v0 <> v1 <> v2 <> boolean(v3,boolean(v4,maybe_nat([v5],boolean(v6,maybe_nat([v7],suffix)))))
    case _: 999999n <> suffix

def list_canonical_round_items(values: List<&2,List<&2,Canonical.Round>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: canonical_round([head],list_canonical_round_items([tail],suffix))
    case _: 999999n <> suffix

def list_canonical_round(values: List<&2,List<&2,Canonical.Round>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Canonical.Round,value) <> list_canonical_round_items([value],suffix)
    case _: 999999n <> suffix

def canonical_workkind(values: List<&2,Canonical.WorkKind>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.AwaitingSourceRead{} <> Nil{}: 0n <> suffix
    case Canonical.SourceReading{} <> Nil{}: 1n <> suffix
    case Canonical.Preparing{} <> Nil{}: 2n <> suffix
    case Canonical.Reviewing{} <> Nil{}: 3n <> suffix
    case Canonical.AtJev{} <> Nil{}: 4n <> suffix
    case Canonical.PendingFinding{v0} <> Nil{}: 5n <> v0 <> suffix
    case _: 999999n <> suffix

def canonical_work(values: List<&2,Canonical.Work>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.Work{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> canonical_workkind([v5],v6 <> suffix)
    case _: 999999n <> suffix

def list_canonical_work_items(values: List<&2,List<&2,Canonical.Work>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: canonical_work([head],list_canonical_work_items([tail],suffix))
    case _: 999999n <> suffix

def list_canonical_work(values: List<&2,List<&2,Canonical.Work>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Canonical.Work,value) <> list_canonical_work_items([value],suffix)
    case _: 999999n <> suffix

def admission_permit(values: List<&2,Admission.Permit>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Admission.Permit{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case _: 999999n <> suffix

def list_admission_permit_items(values: List<&2,List<&2,Admission.Permit>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: admission_permit([head],list_admission_permit_items([tail],suffix))
    case _: 999999n <> suffix

def list_admission_permit(values: List<&2,List<&2,Admission.Permit>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Admission.Permit,value) <> list_admission_permit_items([value],suffix)
    case _: 999999n <> suffix

def admission_admissionstate(values: List<&2,Admission.AdmissionState>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Admission.AdmissionState{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 0n <> v0 <> v1 <> v2 <> boolean(v3,v4 <> v5 <> list_admission_permit([v6],suffix))
    case _: 999999n <> suffix

def list_admission_admissionstate_items(values: List<&2,List<&2,Admission.AdmissionState>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: admission_admissionstate([head],list_admission_admissionstate_items([tail],suffix))
    case _: 999999n <> suffix

def list_admission_admissionstate(values: List<&2,List<&2,Admission.AdmissionState>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Admission.AdmissionState,value) <> list_admission_admissionstate_items([value],suffix)
    case _: 999999n <> suffix

def dispatch_entry(values: List<&2,Dispatch.Entry>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Dispatch.Entry{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> boolean(v5,boolean(v6,suffix))
    case _: 999999n <> suffix

def list_dispatch_entry_items(values: List<&2,List<&2,Dispatch.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: dispatch_entry([head],list_dispatch_entry_items([tail],suffix))
    case _: 999999n <> suffix

def list_dispatch_entry(values: List<&2,List<&2,Dispatch.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Dispatch.Entry,value) <> list_dispatch_entry_items([value],suffix)
    case _: 999999n <> suffix

def dispatch_request(values: List<&2,Dispatch.Request>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Dispatch.Request{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> boolean(v5,boolean(v6,suffix))
    case _: 999999n <> suffix

def list_dispatch_request_items(values: List<&2,List<&2,Dispatch.Request>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: dispatch_request([head],list_dispatch_request_items([tail],suffix))
    case _: 999999n <> suffix

def list_dispatch_request(values: List<&2,List<&2,Dispatch.Request>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Dispatch.Request,value) <> list_dispatch_request_items([value],suffix)
    case _: 999999n <> suffix

def dispatch_state(values: List<&2,Dispatch.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Dispatch.State{v0,v1,v2,v3,v4} <> Nil{}: 0n <> list_dispatch_entry([v0],list_dispatch_entry([v1],v2 <> boolean(v3,list_dispatch_request([v4],suffix))))
    case _: 999999n <> suffix

def list_nat_items(values: List<&2,List<&2,Nat>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: head <> list_nat_items([tail],suffix)
    case _: 999999n <> suffix

def list_nat(values: List<&2,List<&2,Nat>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Nat,value) <> list_nat_items([value],suffix)
    case _: 999999n <> suffix

def collectionstate_lease(values: List<&2,CollectionState.Lease>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionState.Lease{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_collectionstate_lease_items(values: List<&2,List<&2,CollectionState.Lease>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: collectionstate_lease([head],list_collectionstate_lease_items([tail],suffix))
    case _: 999999n <> suffix

def list_collectionstate_lease(values: List<&2,List<&2,CollectionState.Lease>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CollectionState.Lease,value) <> list_collectionstate_lease_items([value],suffix)
    case _: 999999n <> suffix

def collectionstate_claim(values: List<&2,CollectionState.Claim>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionState.Claim{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_collectionstate_claim_items(values: List<&2,List<&2,CollectionState.Claim>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: collectionstate_claim([head],list_collectionstate_claim_items([tail],suffix))
    case _: 999999n <> suffix

def list_collectionstate_claim(values: List<&2,List<&2,CollectionState.Claim>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CollectionState.Claim,value) <> list_collectionstate_claim_items([value],suffix)
    case _: 999999n <> suffix

def deliverystate_phase(values: List<&2,DeliveryState.Phase>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DeliveryState.Reserved{} <> Nil{}: 0n <> suffix
    case DeliveryState.Authorized{} <> Nil{}: 1n <> suffix
    case DeliveryState.Submitted{} <> Nil{}: 2n <> suffix
    case DeliveryState.Failed{} <> Nil{}: 3n <> suffix
    case DeliveryState.Uncertain{} <> Nil{}: 4n <> suffix
    case _: 999999n <> suffix

def deliverystate_slot(values: List<&2,DeliveryState.Slot>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DeliveryState.Slot{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],deliverystate_phase([v5],suffix))
    case _: 999999n <> suffix

def list_deliverystate_slot_items(values: List<&2,List<&2,DeliveryState.Slot>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: deliverystate_slot([head],list_deliverystate_slot_items([tail],suffix))
    case _: 999999n <> suffix

def list_deliverystate_slot(values: List<&2,List<&2,DeliveryState.Slot>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DeliveryState.Slot,value) <> list_deliverystate_slot_items([value],suffix)
    case _: 999999n <> suffix

def deliverystate_counter(values: List<&2,DeliveryState.Counter>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DeliveryState.Counter{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> v2 <> suffix
    case _: 999999n <> suffix

def list_deliverystate_counter_items(values: List<&2,List<&2,DeliveryState.Counter>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: deliverystate_counter([head],list_deliverystate_counter_items([tail],suffix))
    case _: 999999n <> suffix

def list_deliverystate_counter(values: List<&2,List<&2,DeliveryState.Counter>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DeliveryState.Counter,value) <> list_deliverystate_counter_items([value],suffix)
    case _: 999999n <> suffix

def handoff_surface(values: List<&2,Handoff.Surface>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Handoff.Edit{} <> Nil{}: 0n <> suffix
    case Handoff.Background{} <> Nil{}: 1n <> suffix
    case Handoff.Stop{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def handoff_leasephase(values: List<&2,Handoff.LeasePhase>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Handoff.Available{} <> Nil{}: 0n <> suffix
    case Handoff.Reserved{v0,v1} <> Nil{}: 1n <> v0 <> handoff_surface([v1],suffix)
    case Handoff.Authorized{v0,v1} <> Nil{}: 2n <> v0 <> handoff_surface([v1],suffix)
    case Handoff.Submitted{v0} <> Nil{}: 3n <> handoff_surface([v0],suffix)
    case Handoff.Uncertain{v0} <> Nil{}: 4n <> handoff_surface([v0],suffix)
    case _: 999999n <> suffix

def handoff_lease(values: List<&2,Handoff.Lease>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Handoff.Lease{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> boolean(v2,boolean(v3,handoff_leasephase([v4],suffix)))
    case _: 999999n <> suffix

def maybe_handoff_lease(values: List<&2,Maybe<&2,Handoff.Lease>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> handoff_lease([value],suffix)
    case _: 999999n <> suffix

def submissionstate_leaserecord(values: List<&2,SubmissionState.LeaseRecord>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SubmissionState.LeaseRecord{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> handoff_lease([v2],maybe_handoff_lease([v3],suffix))
    case _: 999999n <> suffix

def list_submissionstate_leaserecord_items(values: List<&2,List<&2,SubmissionState.LeaseRecord>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: submissionstate_leaserecord([head],list_submissionstate_leaserecord_items([tail],suffix))
    case _: 999999n <> suffix

def list_submissionstate_leaserecord(values: List<&2,List<&2,SubmissionState.LeaseRecord>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SubmissionState.LeaseRecord,value) <> list_submissionstate_leaserecord_items([value],suffix)
    case _: 999999n <> suffix

def delivery_phase(values: List<&2,Delivery.Phase>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Delivery.Reserved{} <> Nil{}: 0n <> suffix
    case Delivery.Authorized{} <> Nil{}: 1n <> suffix
    case Delivery.Submitted{} <> Nil{}: 2n <> suffix
    case Delivery.Uncertain{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def submissionstate_batch(values: List<&2,SubmissionState.Batch>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SubmissionState.Batch{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> handoff_surface([v4],delivery_phase([v5],list_nat([v6],list_nat([v7],suffix))))
    case _: 999999n <> suffix

def list_submissionstate_batch_items(values: List<&2,List<&2,SubmissionState.Batch>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: submissionstate_batch([head],list_submissionstate_batch_items([tail],suffix))
    case _: 999999n <> suffix

def list_submissionstate_batch(values: List<&2,List<&2,SubmissionState.Batch>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SubmissionState.Batch,value) <> list_submissionstate_batch_items([value],suffix)
    case _: 999999n <> suffix

def submissionstate_state(values: List<&2,SubmissionState.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SubmissionState.State{v0,v1} <> Nil{}: 0n <> list_submissionstate_leaserecord([v0],list_submissionstate_batch([v1],suffix))
    case _: 999999n <> suffix

def deliverystate_state(values: List<&2,DeliveryState.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DeliveryState.State{v0,v1,v2} <> Nil{}: 0n <> list_deliverystate_slot([v0],list_deliverystate_counter([v1],submissionstate_state([v2],suffix)))
    case _: 999999n <> suffix

def revisionstate_entry(values: List<&2,RevisionState.Entry>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case RevisionState.Entry{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def list_revisionstate_entry_items(values: List<&2,List<&2,RevisionState.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: revisionstate_entry([head],list_revisionstate_entry_items([tail],suffix))
    case _: 999999n <> suffix

def list_revisionstate_entry(values: List<&2,List<&2,RevisionState.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,RevisionState.Entry,value) <> list_revisionstate_entry_items([value],suffix)
    case _: 999999n <> suffix

def revisionstate_state(values: List<&2,RevisionState.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case RevisionState.State{v0,v1} <> Nil{}: 0n <> list_revisionstate_entry([v0],v1 <> suffix)
    case _: 999999n <> suffix

def reusestate_claim(values: List<&2,ReuseState.Claim>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ReuseState.Claim{v0,v1} <> Nil{}: 0n <> v0 <> boolean(v1,suffix)
    case _: 999999n <> suffix

def list_reusestate_claim_items(values: List<&2,List<&2,ReuseState.Claim>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: reusestate_claim([head],list_reusestate_claim_items([tail],suffix))
    case _: 999999n <> suffix

def list_reusestate_claim(values: List<&2,List<&2,ReuseState.Claim>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,ReuseState.Claim,value) <> list_reusestate_claim_items([value],suffix)
    case _: 999999n <> suffix

def reusestate_entry(values: List<&2,ReuseState.Entry>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ReuseState.Entry{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def list_reusestate_entry_items(values: List<&2,List<&2,ReuseState.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: reusestate_entry([head],list_reusestate_entry_items([tail],suffix))
    case _: 999999n <> suffix

def list_reusestate_entry(values: List<&2,List<&2,ReuseState.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,ReuseState.Entry,value) <> list_reusestate_entry_items([value],suffix)
    case _: 999999n <> suffix

def reusestate_state(values: List<&2,ReuseState.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ReuseState.State{v0,v1} <> Nil{}: 0n <> list_reusestate_claim([v0],list_reusestate_entry([v1],suffix))
    case _: 999999n <> suffix

def noticestate_pending(values: List<&2,NoticeState.Pending>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NoticeState.Pending{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> boolean(v3,suffix)
    case _: 999999n <> suffix

def maybe_noticestate_pending(values: List<&2,Maybe<&2,NoticeState.Pending>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> noticestate_pending([value],suffix)
    case _: 999999n <> suffix

def noticestate_record(values: List<&2,NoticeState.Record>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NoticeState.Record{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> maybe_noticestate_pending([v5],suffix)
    case _: 999999n <> suffix

def list_noticestate_record_items(values: List<&2,List<&2,NoticeState.Record>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: noticestate_record([head],list_noticestate_record_items([tail],suffix))
    case _: 999999n <> suffix

def list_noticestate_record(values: List<&2,List<&2,NoticeState.Record>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NoticeState.Record,value) <> list_noticestate_record_items([value],suffix)
    case _: 999999n <> suffix

def noticestate_state(values: List<&2,NoticeState.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NoticeState.State{v0} <> Nil{}: 0n <> list_noticestate_record([v0],suffix)
    case _: 999999n <> suffix

def collectionstate_state(values: List<&2,CollectionState.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionState.State{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 0n <> list_nat([v0],list_collectionstate_lease([v1],list_collectionstate_claim([v2],deliverystate_state([v3],revisionstate_state([v4],reusestate_state([v5],noticestate_state([v6],suffix)))))))
    case _: 999999n <> suffix

def edithistory_reason(values: List<&2,EditHistory.Reason>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case EditHistory.Consumed{} <> Nil{}: 0n <> suffix
    case EditHistory.Released{} <> Nil{}: 1n <> suffix
    case EditHistory.Expired{} <> Nil{}: 2n <> suffix
    case EditHistory.Closed{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def edithistory_completed(values: List<&2,EditHistory.Completed>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case EditHistory.Completed{v0,v1,v2} <> Nil{}: 0n <> v0 <> edithistory_reason([v1],boolean(v2,suffix))
    case _: 999999n <> suffix

def list_edithistory_completed_items(values: List<&2,List<&2,EditHistory.Completed>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: edithistory_completed([head],list_edithistory_completed_items([tail],suffix))
    case _: 999999n <> suffix

def list_edithistory_completed(values: List<&2,List<&2,EditHistory.Completed>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,EditHistory.Completed,value) <> list_edithistory_completed_items([value],suffix)
    case _: 999999n <> suffix

def edithistory_state(values: List<&2,EditHistory.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case EditHistory.State{v0} <> Nil{}: 0n <> list_edithistory_completed([v0],suffix)
    case _: 999999n <> suffix

def canonical_state(values: List<&2,Canonical.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.State{v0,v1,v2,v3,v4,v5,v6,v7,v8} <> Nil{}: 0n <> ledger_ledger([v0],list_canonical_round([v1],list_canonical_work([v2],v3 <> v4 <> list_admission_admissionstate([v5],dispatch_state([v6],collectionstate_state([v7],edithistory_state([v8],suffix)))))))
    case _: 999999n <> suffix

def ledger_usage(values: List<&2,Ledger.Usage>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Ledger.Usage{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def canonical_capacityview(values: List<&2,Canonical.CapacityView>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.CapacityView{v0,v1,v2} <> Nil{}: 0n <> ledger_usage([v0],ledger_usage([v1],list_ledger_charge([v2],suffix)))
    case _: 999999n <> suffix

def ledger_fitdecision(values: List<&2,Ledger.FitDecision>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Ledger.Fits{} <> Nil{}: 0n <> suffix
    case Ledger.GlobalItemLimit{} <> Nil{}: 1n <> suffix
    case Ledger.GlobalByteLimit{} <> Nil{}: 2n <> suffix
    case Ledger.PartitionItemLimit{} <> Nil{}: 3n <> suffix
    case Ledger.PartitionByteLimit{} <> Nil{}: 4n <> suffix
    case _: 999999n <> suffix

def canonical_requestoutcome(values: List<&2,Canonical.RequestOutcome>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.NeverSent{} <> Nil{}: 0n <> suffix
    case Canonical.RequestFinding{} <> Nil{}: 1n <> suffix
    case Canonical.RequestClear{} <> Nil{}: 2n <> suffix
    case Canonical.RequestBackendFailure{} <> Nil{}: 3n <> suffix
    case Canonical.RequestTimeout{} <> Nil{}: 4n <> suffix
    case Canonical.RequestInterrupted{} <> Nil{}: 5n <> suffix
    case _: 999999n <> suffix

def canonical_outcome(values: List<&2,Canonical.Outcome>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.Finding{} <> Nil{}: 0n <> suffix
    case Canonical.Clear{} <> Nil{}: 1n <> suffix
    case Canonical.Unavailable{} <> Nil{}: 2n <> suffix
    case Canonical.Interrupted{} <> Nil{}: 3n <> suffix
    case Canonical.Discarded{} <> Nil{}: 4n <> suffix
    case _: 999999n <> suffix

def canonical_writeoutcome(values: List<&2,Canonical.WriteOutcome>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.Acknowledged{} <> Nil{}: 0n <> suffix
    case Canonical.Failed{} <> Nil{}: 1n <> suffix
    case Canonical.Unknown{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def collectorauthority_reason(values: List<&2,CollectorAuthority.Reason>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectorAuthority.Backend{} <> Nil{}: 0n <> suffix
    case CollectorAuthority.Credential{} <> Nil{}: 1n <> suffix
    case CollectorAuthority.Capacity{} <> Nil{}: 2n <> suffix
    case CollectorAuthority.Stale{} <> Nil{}: 3n <> suffix
    case CollectorAuthority.Lost{} <> Nil{}: 4n <> suffix
    case CollectorAuthority.Expired{} <> Nil{}: 5n <> suffix
    case _: 999999n <> suffix

def configuration_includechoice(values: List<&2,Configuration.IncludeChoice>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Configuration.ReplaceIncludes{} <> Nil{}: 0n <> suffix
    case Configuration.KeepIncludes{} <> Nil{}: 1n <> suffix
    case _: 999999n <> suffix

def configuration_selection(values: List<&2,Configuration.Selection>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Configuration.Protected{} <> Nil{}: 0n <> suffix
    case Configuration.Excluded{} <> Nil{}: 1n <> suffix
    case Configuration.EmptyIncludes{} <> Nil{}: 2n <> suffix
    case Configuration.NotIncluded{} <> Nil{}: 3n <> suffix
    case Configuration.Selected{} <> Nil{}: 4n <> suffix
    case _: 999999n <> suffix

def configuration_protection(values: List<&2,Configuration.Protection>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Configuration.AllowedPath{} <> Nil{}: 0n <> suffix
    case Configuration.RepositoryBoundary{} <> Nil{}: 1n <> suffix
    case Configuration.SensitivePath{} <> Nil{}: 2n <> suffix
    case Configuration.GeneratedOrVendor{} <> Nil{}: 3n <> suffix
    case Configuration.FileExtension{} <> Nil{}: 4n <> suffix
    case _: 999999n <> suffix

def configuration_candidate(values: List<&2,Configuration.Candidate>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Configuration.CandidateAllowed{} <> Nil{}: 0n <> suffix
    case Configuration.RefuseGitAdmin{} <> Nil{}: 1n <> suffix
    case Configuration.RefuseFileKind{} <> Nil{}: 2n <> suffix
    case Configuration.RefuseGitIgnore{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def configuration_admission(values: List<&2,Configuration.Admission>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Configuration.AdmitReview{} <> Nil{}: 0n <> suffix
    case Configuration.RefuseRoot{} <> Nil{}: 1n <> suffix
    case Configuration.RefuseConfiguration{} <> Nil{}: 2n <> suffix
    case Configuration.RefuseCredential{} <> Nil{}: 3n <> suffix
    case Configuration.RefuseSelection{} <> Nil{}: 4n <> suffix
    case _: 999999n <> suffix

def rulepolicy_gate(values: List<&2,RulePolicy.Gate>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case RulePolicy.Admit{} <> Nil{}: 0n <> suffix
    case RulePolicy.Omit{} <> Nil{}: 1n <> suffix
    case _: 999999n <> suffix

def rulepolicy_order(values: List<&2,RulePolicy.Order>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case RulePolicy.Before{} <> Nil{}: 0n <> suffix
    case RulePolicy.Equal{} <> Nil{}: 1n <> suffix
    case RulePolicy.After{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def canonical_command(values: List<&2,Canonical.Command>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.CapacityGranted{v0,v1} <> Nil{}: 0n <> v0 <> canonical_capacityview([v1],suffix)
    case Canonical.CapacityRefused{v0,v1} <> Nil{}: 1n <> ledger_fitdecision([v0],canonical_capacityview([v1],suffix))
    case Canonical.CapacityResized{v0,v1} <> Nil{}: 2n <> v0 <> canonical_capacityview([v1],suffix)
    case Canonical.CapacityUnitAdmitted{v0,v1,v2,v3} <> Nil{}: 3n <> v0 <> v1 <> v2 <> canonical_capacityview([v3],suffix)
    case Canonical.CapacityUnitRefused{v0,v1,v2,v3} <> Nil{}: 4n <> v0 <> v1 <> ledger_fitdecision([v2],canonical_capacityview([v3],suffix))
    case Canonical.PermitIssued{v0,v1} <> Nil{}: 5n <> v0 <> v1 <> suffix
    case Canonical.CompletedEditAbsent{} <> Nil{}: 6n <> suffix
    case Canonical.CompletedEditSeen{v0,v1} <> Nil{}: 7n <> edithistory_reason([v0],boolean(v1,suffix))
    case Canonical.CompletedEditRemembered{v0} <> Nil{}: 8n <> maybe_nat([v0],suffix)
    case Canonical.QuietRoundBusy{} <> Nil{}: 9n <> suffix
    case Canonical.QuietRoundWaiting{v0} <> Nil{}: 10n <> v0 <> suffix
    case Canonical.QuietRoundExpired{v0} <> Nil{}: 11n <> v0 <> suffix
    case Canonical.QuietRoundResetRecorded{} <> Nil{}: 12n <> suffix
    case Canonical.PermitConsumed{v0} <> Nil{}: 13n <> v0 <> suffix
    case Canonical.PermitReleased{} <> Nil{}: 14n <> suffix
    case Canonical.PermitExpired{} <> Nil{}: 15n <> suffix
    case Canonical.PermitKept{} <> Nil{}: 16n <> suffix
    case Canonical.PermitRoundClosed{v0} <> Nil{}: 17n <> v0 <> suffix
    case Canonical.RoundStarted{v0} <> Nil{}: 18n <> v0 <> suffix
    case Canonical.ObservationAdmitted{v0} <> Nil{}: 19n <> v0 <> suffix
    case Canonical.ObservationStarted{} <> Nil{}: 20n <> suffix
    case Canonical.ObservationCompleted{} <> Nil{}: 21n <> suffix
    case Canonical.ObservationInterrupted{} <> Nil{}: 22n <> suffix
    case Canonical.Prepare{v0,v1} <> Nil{}: 23n <> v0 <> v1 <> suffix
    case Canonical.PreparationRefused{} <> Nil{}: 24n <> suffix
    case Canonical.UnitAdmitted{v0,v1,v2,v3,v4} <> Nil{}: 25n <> v0 <> v1 <> v2 <> v3 <> canonical_capacityview([v4],suffix)
    case Canonical.UnitRefused{v0,v1,v2,v3} <> Nil{}: 26n <> v0 <> v1 <> ledger_fitdecision([v2],canonical_capacityview([v3],suffix))
    case Canonical.PreparationReleased{v0,v1} <> Nil{}: 27n <> v0 <> canonical_capacityview([v1],suffix)
    case Canonical.ReviewStarted{} <> Nil{}: 28n <> suffix
    case Canonical.JevRequestIssued{v0,v1,v2,v3,v4} <> Nil{}: 29n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case Canonical.JevRequestUnavailable{} <> Nil{}: 30n <> suffix
    case Canonical.JevRequestStartRecorded{} <> Nil{}: 31n <> suffix
    case Canonical.JevInterruptionRecorded{} <> Nil{}: 32n <> suffix
    case Canonical.JevRequestOutcomeRecorded{v0} <> Nil{}: 33n <> canonical_requestoutcome([v0],suffix)
    case Canonical.JevObservationIgnored{} <> Nil{}: 34n <> suffix
    case Canonical.ReservationReleased{v0} <> Nil{}: 35n <> v0 <> suffix
    case Canonical.ReviewRecorded{v0} <> Nil{}: 36n <> canonical_outcome([v0],suffix)
    case Canonical.RetainFinding{} <> Nil{}: 37n <> suffix
    case Canonical.FindingCountRecorded{} <> Nil{}: 38n <> suffix
    case Canonical.SettleClear{} <> Nil{}: 39n <> suffix
    case Canonical.SettleStaleClear{} <> Nil{}: 40n <> suffix
    case Canonical.RetireStaleFinding{} <> Nil{}: 41n <> suffix
    case Canonical.PreparedSkipped{} <> Nil{}: 42n <> suffix
    case Canonical.PreparedAdmitted{} <> Nil{}: 43n <> suffix
    case Canonical.PreparedCapacityRefused{} <> Nil{}: 44n <> suffix
    case Canonical.EmptyLost{} <> Nil{}: 45n <> suffix
    case Canonical.EmptyAccepted{} <> Nil{}: 46n <> suffix
    case Canonical.FailureBackend{} <> Nil{}: 47n <> suffix
    case Canonical.FailureCredential{} <> Nil{}: 48n <> suffix
    case Canonical.FailureLost{} <> Nil{}: 49n <> suffix
    case Canonical.FailureNone{} <> Nil{}: 50n <> suffix
    case Canonical.DispatchStarted{v0,v1} <> Nil{}: 51n <> v0 <> v1 <> suffix
    case Canonical.DispatchDiscarded{v0,v1} <> Nil{}: 52n <> v0 <> boolean(v1,suffix)
    case Canonical.DiscardNamedOnly{} <> Nil{}: 53n <> suffix
    case Canonical.DiscardAllUnfinished{} <> Nil{}: 54n <> suffix
    case Canonical.WaitForWork{} <> Nil{}: 55n <> suffix
    case Canonical.CancelWork{v0} <> Nil{}: 56n <> v0 <> suffix
    case Canonical.FinishReady{} <> Nil{}: 57n <> suffix
    case Canonical.FinishLimit{} <> Nil{}: 58n <> suffix
    case Canonical.StopEnded{} <> Nil{}: 59n <> suffix
    case Canonical.CollectionEligible{} <> Nil{}: 60n <> suffix
    case Canonical.CollectionWaiting{} <> Nil{}: 61n <> suffix
    case Canonical.CollectionRetireCredential{} <> Nil{}: 62n <> suffix
    case Canonical.CollectionRetainCredential{} <> Nil{}: 63n <> suffix
    case Canonical.CollectionCandidate{} <> Nil{}: 64n <> suffix
    case Canonical.CollectionSkip{} <> Nil{}: 65n <> suffix
    case Canonical.CollectionBefore{} <> Nil{}: 66n <> suffix
    case Canonical.CollectionEqual{} <> Nil{}: 67n <> suffix
    case Canonical.CollectionAfter{} <> Nil{}: 68n <> suffix
    case Canonical.CollectionExpired{} <> Nil{}: 69n <> suffix
    case Canonical.CollectionCurrent{} <> Nil{}: 70n <> suffix
    case Canonical.CollectionFits{} <> Nil{}: 71n <> suffix
    case Canonical.CollectionLimited{} <> Nil{}: 72n <> suffix
    case Canonical.CollectionFindingSelected{} <> Nil{}: 73n <> suffix
    case Canonical.CollectionFindingRetained{} <> Nil{}: 74n <> suffix
    case Canonical.CollectionFindingLimited{} <> Nil{}: 75n <> suffix
    case Canonical.CollectionFindingExpired{} <> Nil{}: 76n <> suffix
    case Canonical.CollectionNoticeIncluded{} <> Nil{}: 77n <> suffix
    case Canonical.CollectionNoticeSkipped{} <> Nil{}: 78n <> suffix
    case Canonical.CollectionNoticeStopped{} <> Nil{}: 79n <> suffix
    case Canonical.CollectionLeaseReserved{} <> Nil{}: 80n <> suffix
    case Canonical.CollectionLeaseRefused{} <> Nil{}: 81n <> suffix
    case Canonical.CollectionLeaseReleased{} <> Nil{}: 82n <> suffix
    case Canonical.CollectionLeaseKept{} <> Nil{}: 83n <> suffix
    case Canonical.CollectionAdviceRetired{} <> Nil{}: 84n <> suffix
    case Canonical.CollectionBackgroundClaimed{} <> Nil{}: 85n <> suffix
    case Canonical.CollectionBackgroundRefused{} <> Nil{}: 86n <> suffix
    case Canonical.CollectionBackgroundReleased{} <> Nil{}: 87n <> suffix
    case Canonical.CollectionBackgroundKept{} <> Nil{}: 88n <> suffix
    case Canonical.FinishReserved{} <> Nil{}: 89n <> suffix
    case Canonical.FinishNotices{} <> Nil{}: 90n <> suffix
    case Canonical.FinishAllowedNoAdvice{} <> Nil{}: 91n <> suffix
    case Canonical.FinishAllowedDeadline{} <> Nil{}: 92n <> suffix
    case Canonical.FinishAllowedUnavailable{} <> Nil{}: 93n <> suffix
    case Canonical.FinishRefused{} <> Nil{}: 94n <> suffix
    case Canonical.FinishReleased{} <> Nil{}: 95n <> suffix
    case Canonical.FinishAuthorized{} <> Nil{}: 96n <> suffix
    case Canonical.FinishRecorded{v0} <> Nil{}: 97n <> canonical_writeoutcome([v0],suffix)
    case Canonical.FinishEnded{} <> Nil{}: 98n <> suffix
    case Canonical.ContinuationConsumed{} <> Nil{}: 99n <> suffix
    case Canonical.ContinuationRefused{} <> Nil{}: 100n <> suffix
    case Canonical.SubmissionBegun{} <> Nil{}: 101n <> suffix
    case Canonical.SubmissionAuthorized{} <> Nil{}: 102n <> suffix
    case Canonical.SubmissionRecorded{} <> Nil{}: 103n <> suffix
    case Canonical.SubmissionReleased{} <> Nil{}: 104n <> suffix
    case Canonical.SubmissionRefused{} <> Nil{}: 105n <> suffix
    case Canonical.SubmissionForgotten{} <> Nil{}: 106n <> suffix
    case Canonical.SubmissionSuppresses{} <> Nil{}: 107n <> suffix
    case Canonical.SubmissionUnsuppressed{} <> Nil{}: 108n <> suffix
    case Canonical.SubmissionReofferable{} <> Nil{}: 109n <> suffix
    case Canonical.SubmissionNotReofferable{} <> Nil{}: 110n <> suffix
    case Canonical.SubmissionExpired{} <> Nil{}: 111n <> suffix
    case Canonical.SubmissionCurrent{} <> Nil{}: 112n <> suffix
    case Canonical.RevisionReused{v0} <> Nil{}: 113n <> v0 <> suffix
    case Canonical.RevisionReplaced{v0} <> Nil{}: 114n <> v0 <> suffix
    case Canonical.RevisionReleased{} <> Nil{}: 115n <> suffix
    case Canonical.RevisionCurrent{} <> Nil{}: 116n <> suffix
    case Canonical.RevisionStale{} <> Nil{}: 117n <> suffix
    case Canonical.RevisionSuperseded{} <> Nil{}: 118n <> suffix
    case Canonical.RevisionNotSuperseded{} <> Nil{}: 119n <> suffix
    case Canonical.RevisionGeneration{v0} <> Nil{}: 120n <> v0 <> suffix
    case Canonical.RevisionCount{v0} <> Nil{}: 121n <> v0 <> suffix
    case Canonical.CollectorProceed{} <> Nil{}: 122n <> suffix
    case Canonical.CollectorUnavailable{v0} <> Nil{}: 123n <> collectorauthority_reason([v0],suffix)
    case Canonical.CollectorFinalProceed{} <> Nil{}: 124n <> suffix
    case Canonical.CollectorFinalRelease{} <> Nil{}: 125n <> suffix
    case Canonical.ReuseKeepMember{} <> Nil{}: 126n <> suffix
    case Canonical.ReuseSetMemberClear{} <> Nil{}: 127n <> suffix
    case Canonical.ReuseSetMemberFinding{} <> Nil{}: 128n <> suffix
    case Canonical.ReuseSetMemberUnavailable{} <> Nil{}: 129n <> suffix
    case Canonical.ReuseSetMemberLost{} <> Nil{}: 130n <> suffix
    case Canonical.CleanupReady{} <> Nil{}: 131n <> suffix
    case Canonical.CleanupBusy{} <> Nil{}: 132n <> suffix
    case Canonical.CleanupCommitted{} <> Nil{}: 133n <> suffix
    case Canonical.DeliveryReleaseUnacknowledged{} <> Nil{}: 134n <> suffix
    case Canonical.DeliveryKeepAcknowledged{} <> Nil{}: 135n <> suffix
    case Canonical.DeliveryAckReady{} <> Nil{}: 136n <> suffix
    case Canonical.DeliveryAckExpired{} <> Nil{}: 137n <> suffix
    case Canonical.DeliveryAckEmpty{} <> Nil{}: 138n <> suffix
    case Canonical.DeliveryFinalReady{} <> Nil{}: 139n <> suffix
    case Canonical.DeliveryFinalExpired{} <> Nil{}: 140n <> suffix
    case Canonical.DeliveryFinalEmpty{} <> Nil{}: 141n <> suffix
    case Canonical.DeliveryRetireAdvice{} <> Nil{}: 142n <> suffix
    case Canonical.DeliveryKeepRemaining{} <> Nil{}: 143n <> suffix
    case Canonical.DeliveryKeepForReoffer{} <> Nil{}: 144n <> suffix
    case Canonical.DeliverySubmissionCandidate{} <> Nil{}: 145n <> suffix
    case Canonical.DeliverySubmissionRefused{} <> Nil{}: 146n <> suffix
    case Canonical.DeliveryBatchProceed{} <> Nil{}: 147n <> suffix
    case Canonical.DeliveryBatchRelease{} <> Nil{}: 148n <> suffix
    case Canonical.DeliveryCredentialInvalid{} <> Nil{}: 149n <> suffix
    case Canonical.DeliveryCredentialValid{} <> Nil{}: 150n <> suffix
    case Canonical.IgnoreCandidate{} <> Nil{}: 151n <> suffix
    case Canonical.ReleaseCandidate{} <> Nil{}: 152n <> suffix
    case Canonical.RetireCandidate{} <> Nil{}: 153n <> suffix
    case Canonical.ContinueCandidate{} <> Nil{}: 154n <> suffix
    case Canonical.RetainCandidate{} <> Nil{}: 155n <> suffix
    case Canonical.RoundStopBegun{} <> Nil{}: 156n <> suffix
    case Canonical.RoundStopRefused{} <> Nil{}: 157n <> suffix
    case Canonical.RoundActive{} <> Nil{}: 158n <> suffix
    case Canonical.RoundInactive{} <> Nil{}: 159n <> suffix
    case Canonical.RoundBarrierRaised{} <> Nil{}: 160n <> suffix
    case Canonical.RoundBarrierClear{} <> Nil{}: 161n <> suffix
    case Canonical.RoundStopOwned{} <> Nil{}: 162n <> suffix
    case Canonical.RoundStopNotOwned{} <> Nil{}: 163n <> suffix
    case Canonical.RoundStopTerminal{v0,v1} <> Nil{}: 164n <> boolean(v0,boolean(v1,suffix))
    case Canonical.RoundExpireCloses{} <> Nil{}: 165n <> suffix
    case Canonical.RoundExpireKeeps{} <> Nil{}: 166n <> suffix
    case Canonical.RoundContinuationAvailable{} <> Nil{}: 167n <> suffix
    case Canonical.RoundContinuationExhausted{} <> Nil{}: 168n <> suffix
    case Canonical.DeliverySubmissionAllowed{} <> Nil{}: 169n <> suffix
    case Canonical.DeliverySubmissionDenied{} <> Nil{}: 170n <> suffix
    case Canonical.DeliveryExistingTokenAllowed{} <> Nil{}: 171n <> suffix
    case Canonical.DeliveryExistingTokenDenied{} <> Nil{}: 172n <> suffix
    case Canonical.DeliveryUnreservedStopAllowed{} <> Nil{}: 173n <> suffix
    case Canonical.DeliveryUnreservedStopDenied{} <> Nil{}: 174n <> suffix
    case Canonical.ReuseJoinAdvice{} <> Nil{}: 175n <> suffix
    case Canonical.ReuseJoinPending{} <> Nil{}: 176n <> suffix
    case Canonical.ReuseJoinClaimed{} <> Nil{}: 177n <> suffix
    case Canonical.ReuseCached{} <> Nil{}: 178n <> suffix
    case Canonical.ReuseOwn{} <> Nil{}: 179n <> suffix
    case Canonical.ReuseClaimed{} <> Nil{}: 180n <> suffix
    case Canonical.ReuseAttached{} <> Nil{}: 181n <> suffix
    case Canonical.ReuseReleased{} <> Nil{}: 182n <> suffix
    case Canonical.ReuseRefused{} <> Nil{}: 183n <> suffix
    case Canonical.CacheAlready{} <> Nil{}: 184n <> suffix
    case Canonical.CacheRejected{} <> Nil{}: 185n <> suffix
    case Canonical.CachePrepared{v0} <> Nil{}: 186n <> list_nat([v0],suffix)
    case Canonical.CacheCommitted{} <> Nil{}: 187n <> suffix
    case Canonical.CacheDiscarded{v0} <> Nil{}: 188n <> list_nat([v0],suffix)
    case Canonical.NoticeSuppressed{v0} <> Nil{}: 189n <> v0 <> suffix
    case Canonical.NoticeRejectedFull{} <> Nil{}: 190n <> suffix
    case Canonical.NoticeCreateKey{} <> Nil{}: 191n <> suffix
    case Canonical.NoticeCreatePending{v0} <> Nil{}: 192n <> v0 <> suffix
    case Canonical.NoticeMergePending{v0} <> Nil{}: 193n <> v0 <> suffix
    case Canonical.NoticeKeepLeased{} <> Nil{}: 194n <> suffix
    case Canonical.NoticeRefused{} <> Nil{}: 195n <> suffix
    case Canonical.NoticeCommitted{} <> Nil{}: 196n <> suffix
    case Canonical.NoticePruned{v0,v1,v2} <> Nil{}: 197n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.NoticeDropped{} <> Nil{}: 198n <> suffix
    case Canonical.NoticeLeased{} <> Nil{}: 199n <> suffix
    case Canonical.NoticePendingCleared{} <> Nil{}: 200n <> suffix
    case Canonical.NoticeSelected{v0} <> Nil{}: 201n <> list_nat([v0],suffix)
    case Canonical.IncludeChoice{v0} <> Nil{}: 202n <> configuration_includechoice([v0],suffix)
    case Canonical.FileSelection{v0} <> Nil{}: 203n <> configuration_selection([v0],suffix)
    case Canonical.FileProtection{v0} <> Nil{}: 204n <> configuration_protection([v0],suffix)
    case Canonical.CandidateFile{v0} <> Nil{}: 205n <> configuration_candidate([v0],suffix)
    case Canonical.ReviewAdmission{v0} <> Nil{}: 206n <> configuration_admission([v0],suffix)
    case Canonical.RuleGate{v0} <> Nil{}: 207n <> rulepolicy_gate([v0],suffix)
    case Canonical.RuleOrder{v0} <> Nil{}: 208n <> rulepolicy_order([v0],suffix)
    case Canonical.WriteAuthorized{v0} <> Nil{}: 209n <> v0 <> suffix
    case Canonical.WriteRecorded{v0} <> Nil{}: 210n <> canonical_writeoutcome([v0],suffix)
    case Canonical.WaitForOutput{} <> Nil{}: 211n <> suffix
    case Canonical.ReofferAtStop{} <> Nil{}: 212n <> suffix
    case Canonical.PartitionRetired{v0} <> Nil{}: 213n <> v0 <> suffix
    case Canonical.AdmissionForgotten{} <> Nil{}: 214n <> suffix
    case _: 999999n <> suffix

def list_canonical_command_items(values: List<&2,List<&2,Canonical.Command>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: list_canonical_command_items([tail],canonical_command([head],suffix))
    case _: 999999n <> suffix

def list_canonical_command(values: List<&2,List<&2,Canonical.Command>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Canonical.Command,value) <> list_canonical_command_items([List.reverse(&2,Canonical.Command,value)],suffix)
    case _: 999999n <> suffix

def admission_admissionrejection(values: List<&2,Admission.AdmissionRejection>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Admission.WrongPartition{} <> Nil{}: 0n <> suffix
    case Admission.WrongLifetime{} <> Nil{}: 1n <> suffix
    case Admission.StaleInvocation{} <> Nil{}: 2n <> suffix
    case Admission.Expired{} <> Nil{}: 3n <> suffix
    case Admission.DuplicateTool{} <> Nil{}: 4n <> suffix
    case Admission.NoPermit{} <> Nil{}: 5n <> suffix
    case Admission.WrongTool{} <> Nil{}: 6n <> suffix
    case Admission.OldRound{} <> Nil{}: 7n <> suffix
    case Admission.InvalidClock{} <> Nil{}: 8n <> suffix
    case Admission.RoundAlreadyClosed{} <> Nil{}: 9n <> suffix
    case Admission.LifetimeNotFresh{} <> Nil{}: 10n <> suffix
    case _: 999999n <> suffix

def canonical_reason(values: List<&2,Canonical.Reason>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.InvalidIdentity{} <> Nil{}: 0n <> suffix
    case Canonical.RoundLimit{} <> Nil{}: 1n <> suffix
    case Canonical.StaleRound{} <> Nil{}: 2n <> suffix
    case Canonical.StaleOperation{} <> Nil{}: 3n <> suffix
    case Canonical.WrongStage{} <> Nil{}: 4n <> suffix
    case Canonical.InconsistentLedger{} <> Nil{}: 5n <> suffix
    case Canonical.ProspectiveDenied{} <> Nil{}: 6n <> suffix
    case Canonical.AdviceePermitLimit{} <> Nil{}: 7n <> suffix
    case Canonical.ResidentPermitLimit{} <> Nil{}: 8n <> suffix
    case Canonical.PermitDenied{v0} <> Nil{}: 9n <> admission_admissionrejection([v0],suffix)
    case _: 999999n <> suffix

def canonical_step(values: List<&2,Canonical.Step>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.Advanced{v0,v1} <> Nil{}: 0n <> canonical_state([v0],list_canonical_command([v1],suffix))
    case Canonical.Rejected{v0,v1} <> Nil{}: 1n <> canonical_state([v0],canonical_reason([v1],suffix))
    case _: 999999n <> suffix

def admission_prospectivefacts(values: List<&2,Admission.ProspectiveFacts>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Admission.ProspectiveFacts{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> boolean(v0,v1 <> v2 <> v3 <> v4 <> v5 <> suffix)
    case _: 999999n <> suffix

def quiescence_facts(values: List<&2,Quiescence.Facts>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Quiescence.Facts{v0,v1,v2,v3} <> Nil{}: 0n <> boolean(v0,boolean(v1,boolean(v2,boolean(v3,suffix))))
    case _: 999999n <> suffix

def canonical_stopscope(values: List<&2,Canonical.StopScope>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.StopScope{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_canonical_stopscope_items(values: List<&2,List<&2,Canonical.StopScope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: canonical_stopscope([head],list_canonical_stopscope_items([tail],suffix))
    case _: 999999n <> suffix

def list_canonical_stopscope(values: List<&2,List<&2,Canonical.StopScope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Canonical.StopScope,value) <> list_canonical_stopscope_items([value],suffix)
    case _: 999999n <> suffix

def reuse_joinedstate(values: List<&2,Reuse.JoinedState>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Reuse.JoinedPending{} <> Nil{}: 0n <> suffix
    case Reuse.JoinedClear{} <> Nil{}: 1n <> suffix
    case Reuse.JoinedFinding{} <> Nil{}: 2n <> suffix
    case Reuse.JoinedUnavailable{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def retention_cleanupfacts(values: List<&2,Retention.CleanupFacts>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Retention.CleanupFacts{v0,v1,v2,v3,v4,v5,v6,v7,v8} <> Nil{}: 0n <> boolean(v0,boolean(v1,boolean(v2,boolean(v3,boolean(v4,boolean(v5,boolean(v6,boolean(v7,boolean(v8,suffix)))))))))
    case _: 999999n <> suffix

def delivery_submissionfacts(values: List<&2,Delivery.SubmissionFacts>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Delivery.SubmissionFacts{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 0n <> boolean(v0,boolean(v1,boolean(v2,boolean(v3,boolean(v4,boolean(v5,boolean(v6,boolean(v7,suffix))))))))
    case _: 999999n <> suffix

def handoff_validationstatus(values: List<&2,Handoff.ValidationStatus>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Handoff.Current{} <> Nil{}: 0n <> suffix
    case Handoff.Stale{} <> Nil{}: 1n <> suffix
    case Handoff.Unavailable{} <> Nil{}: 2n <> suffix
    case Handoff.Unattributed{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def delivery_surface(values: List<&2,Delivery.Surface>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Delivery.Edit{} <> Nil{}: 0n <> suffix
    case Delivery.Background{} <> Nil{}: 1n <> suffix
    case Delivery.Stop{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def rulepolicy_target(values: List<&2,RulePolicy.Target>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case RulePolicy.TypeShape{} <> Nil{}: 0n <> suffix
    case RulePolicy.FunctionTarget{} <> Nil{}: 1n <> suffix
    case RulePolicy.UnsupportedTarget{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def rulepolicy_probabilitywords(values: List<&2,RulePolicy.ProbabilityWords>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case RulePolicy.Words{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def canonical_canonicalevent(values: List<&2,Canonical.CanonicalEvent>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Canonical.ReserveCapacity{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> ledger_purpose([v2],suffix)
    case Canonical.ResizeCapacity{v0,v1,v2} <> Nil{}: 1n <> v0 <> v1 <> ledger_purpose([v2],suffix)
    case Canonical.ReleaseCapacity{v0} <> Nil{}: 2n <> v0 <> suffix
    case Canonical.ReplaceCapacity{v0,v1} <> Nil{}: 3n <> v0 <> list_nat([v1],suffix)
    case Canonical.IssuePermit{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 4n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> v6 <> admission_prospectivefacts([v7],suffix)
    case Canonical.CheckCompletedEdit{v0} <> Nil{}: 5n <> v0 <> suffix
    case Canonical.RememberCompletedEdit{v0,v1} <> Nil{}: 6n <> v0 <> edithistory_reason([v1],suffix)
    case Canonical.QuietRoundTick{v0,v1,v2,v3,v4,v5} <> Nil{}: 7n <> v0 <> v1 <> v2 <> v3 <> v4 <> quiescence_facts([v5],suffix)
    case Canonical.QuietRoundReset{v0,v1,v2} <> Nil{}: 8n <> v0 <> v1 <> v2 <> suffix
    case Canonical.ConsumePermit{v0,v1,v2,v3,v4} <> Nil{}: 9n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case Canonical.ReleasePermit{v0,v1,v2} <> Nil{}: 10n <> v0 <> v1 <> v2 <> suffix
    case Canonical.ExpirePermit{v0,v1,v2,v3} <> Nil{}: 11n <> v0 <> v1 <> v2 <> boolean(v3,suffix)
    case Canonical.ClosePermitRound{v0,v1,v2,v3} <> Nil{}: 12n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.ForgetAdmission{v0,v1} <> Nil{}: 13n <> v0 <> v1 <> suffix
    case Canonical.OpenRound{v0,v1} <> Nil{}: 14n <> v0 <> v1 <> suffix
    case Canonical.AdmitObservation{v0,v1,v2} <> Nil{}: 15n <> v0 <> v1 <> v2 <> suffix
    case Canonical.StartObservation{v0,v1,v2,v3} <> Nil{}: 16n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.CompleteObservation{v0,v1,v2,v3} <> Nil{}: 17n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.InterruptObservation{v0,v1,v2,v3} <> Nil{}: 18n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.BeginPreparation{v0,v1,v2,v3} <> Nil{}: 19n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.BeginObservedPreparation{v0,v1,v2,v3,v4} <> Nil{}: 20n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case Canonical.InterruptPreparation{v0,v1,v2,v3} <> Nil{}: 21n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.PreparationCompleted{v0,v1,v2,v3,v4} <> Nil{}: 22n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],suffix)
    case Canonical.StartReview{v0,v1,v2,v3} <> Nil{}: 23n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.JevRequestReady{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9} <> Nil{}: 24n <> v0 <> v1 <> v2 <> v3 <> boolean(v4,boolean(v5,boolean(v6,boolean(v7,boolean(v8,boolean(v9,suffix))))))
    case Canonical.JevRequestStarted{v0,v1,v2,v3,v4} <> Nil{}: 25n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case Canonical.JevRequestInterrupted{v0,v1,v2,v3,v4} <> Nil{}: 26n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case Canonical.JevRequestSettled{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 27n <> v0 <> v1 <> v2 <> v3 <> v4 <> canonical_requestoutcome([v5],boolean(v6,suffix))
    case Canonical.ReviewCompleted{v0,v1,v2,v3,v4} <> Nil{}: 28n <> v0 <> v1 <> v2 <> v3 <> canonical_outcome([v4],suffix)
    case Canonical.RetireReview{v0,v1,v2,v3} <> Nil{}: 29n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.CancelReview{v0,v1,v2,v3} <> Nil{}: 30n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.ReviewObserved{v0,v1,v2,v3,v4,v5} <> Nil{}: 31n <> v0 <> v1 <> v2 <> v3 <> canonical_outcome([v4],boolean(v5,suffix))
    case Canonical.FindingCountUpdated{v0,v1,v2,v3,v4} <> Nil{}: 32n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case Canonical.QueueDispatch{v0,v1,v2,v3} <> Nil{}: 33n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.DispatchSettled{v0,v1,v2,v3} <> Nil{}: 34n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.DiscardDispatch{v0} <> Nil{}: 35n <> list_nat([v0],suffix)
    case Canonical.DispatchScopeCheck{v0,v1,v2} <> Nil{}: 36n <> v0 <> v1 <> boolean(v2,suffix)
    case Canonical.CloseDispatch{} <> Nil{}: 37n <> suffix
    case Canonical.PreparedOfferCheck{v0,v1} <> Nil{}: 38n <> boolean(v0,boolean(v1,suffix))
    case Canonical.EmptyPreparedCheck{v0,v1,v2} <> Nil{}: 39n <> v0 <> boolean(v1,boolean(v2,suffix))
    case Canonical.ReviewFailureCheck{v0,v1,v2} <> Nil{}: 40n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.StopPolled{v0,v1,v2,v3} <> Nil{}: 41n <> v0 <> v1 <> v2 <> boolean(v3,suffix)
    case Canonical.StopGroupPolled{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 42n <> v0 <> v1 <> v2 <> list_canonical_stopscope([v3],boolean(v4,boolean(v5,v6 <> suffix)))
    case Canonical.StopGroupEnded{v0,v1,v2,v3} <> Nil{}: 43n <> v0 <> v1 <> v2 <> list_canonical_stopscope([v3],suffix)
    case Canonical.CollectionReady{v0,v1,v2,v3,v4,v5} <> Nil{}: 44n <> v0 <> v1 <> v2 <> v3 <> v4 <> boolean(v5,suffix)
    case Canonical.CollectionCredentialCheck{v0,v1} <> Nil{}: 45n <> boolean(v0,boolean(v1,suffix))
    case Canonical.CollectionCandidateCheck{v0,v1,v2,v3} <> Nil{}: 46n <> boolean(v0,boolean(v1,boolean(v2,boolean(v3,suffix))))
    case Canonical.CollectionOrderCheck{v0,v1} <> Nil{}: 47n <> v0 <> v1 <> suffix
    case Canonical.CollectionExpiryCheck{v0,v1} <> Nil{}: 48n <> v0 <> v1 <> suffix
    case Canonical.CollectionFitCheck{v0,v1} <> Nil{}: 49n <> v0 <> v1 <> suffix
    case Canonical.CollectionFindingCheck{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13} <> Nil{}: 50n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> v6 <> v7 <> v8 <> v9 <> v10 <> boolean(v11,v12 <> v13 <> suffix)
    case Canonical.CollectionNoticeCheck{v0,v1,v2} <> Nil{}: 51n <> v0 <> v1 <> boolean(v2,suffix)
    case Canonical.CollectionReserveLease{v0,v1} <> Nil{}: 52n <> v0 <> v1 <> suffix
    case Canonical.CollectionReleaseLease{v0,v1} <> Nil{}: 53n <> v0 <> v1 <> suffix
    case Canonical.CollectionLeaseCheck{v0,v1,v2,v3,v4,v5} <> Nil{}: 54n <> v0 <> v1 <> boolean(v2,boolean(v3,boolean(v4,boolean(v5,suffix))))
    case Canonical.CollectionRetireAdvice{v0} <> Nil{}: 55n <> v0 <> suffix
    case Canonical.CollectionClaimBackground{v0,v1,v2,v3} <> Nil{}: 56n <> v0 <> v1 <> boolean(v2,v3 <> suffix)
    case Canonical.CollectionReleaseBackground{v0,v1} <> Nil{}: 57n <> v0 <> v1 <> suffix
    case Canonical.CollectionExpireBackground{v0,v1,v2,v3} <> Nil{}: 58n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.FinishReserve{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10} <> Nil{}: 59n <> v0 <> v1 <> v2 <> v3 <> v4 <> list_nat([v5],boolean(v6,boolean(v7,boolean(v8,boolean(v9,boolean(v10,suffix))))))
    case Canonical.FinishRelease{v0,v1,v2,v3} <> Nil{}: 60n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.FinishAuthorize{v0,v1,v2,v3,v4} <> Nil{}: 61n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],suffix)
    case Canonical.FinishTerminal{v0,v1,v2,v3,v4,v5} <> Nil{}: 62n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],canonical_writeoutcome([v5],suffix))
    case Canonical.FinishEnd{v0,v1,v2,v3} <> Nil{}: 63n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.ContinuationConsume{v0,v1} <> Nil{}: 64n <> v0 <> v1 <> suffix
    case Canonical.SubmissionBegin{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 65n <> v0 <> v1 <> v2 <> v3 <> handoff_surface([v4],boolean(v5,list_nat([v6],list_nat([v7],suffix))))
    case Canonical.SubmissionAuthorize{v0,v1} <> Nil{}: 66n <> v0 <> v1 <> suffix
    case Canonical.SubmissionTerminal{v0,v1,v2} <> Nil{}: 67n <> v0 <> v1 <> boolean(v2,suffix)
    case Canonical.SubmissionRelease{v0,v1} <> Nil{}: 68n <> v0 <> v1 <> suffix
    case Canonical.SubmissionForget{v0} <> Nil{}: 69n <> v0 <> suffix
    case Canonical.SubmissionSuppressCheck{v0,v1,v2,v3} <> Nil{}: 70n <> v0 <> v1 <> v2 <> handoff_surface([v3],suffix)
    case Canonical.SubmissionReofferCheck{v0,v1} <> Nil{}: 71n <> v0 <> v1 <> suffix
    case Canonical.SubmissionExpiryCheck{v0,v1,v2,v3} <> Nil{}: 72n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.RevisionRegister{v0,v1,v2} <> Nil{}: 73n <> v0 <> v1 <> boolean(v2,suffix)
    case Canonical.RevisionRelease{v0,v1} <> Nil{}: 74n <> v0 <> v1 <> suffix
    case Canonical.RevisionCurrentCheck{v0,v1,v2} <> Nil{}: 75n <> v0 <> v1 <> v2 <> suffix
    case Canonical.RevisionSupersededCheck{v0,v1,v2} <> Nil{}: 76n <> v0 <> v1 <> v2 <> suffix
    case Canonical.RevisionGenerationCheck{v0} <> Nil{}: 77n <> v0 <> suffix
    case Canonical.RevisionCountCheck{} <> Nil{}: 78n <> suffix
    case Canonical.CollectorGateCheck{v0,v1} <> Nil{}: 79n <> boolean(v0,boolean(v1,suffix))
    case Canonical.CollectorFinalAuthorityCheck{v0,v1} <> Nil{}: 80n <> boolean(v0,boolean(v1,suffix))
    case Canonical.ReuseMemberCheck{v0,v1,v2,v3} <> Nil{}: 81n <> reuse_joinedstate([v0],boolean(v1,boolean(v2,boolean(v3,suffix))))
    case Canonical.CleanupCheck{v0} <> Nil{}: 82n <> retention_cleanupfacts([v0],suffix)
    case Canonical.CleanupCommit{} <> Nil{}: 83n <> suffix
    case Canonical.DeliveryReleaseCheck{v0} <> Nil{}: 84n <> boolean(v0,suffix)
    case Canonical.DeliveryAcknowledgeCheck{v0,v1} <> Nil{}: 85n <> v0 <> boolean(v1,suffix)
    case Canonical.DeliveryFinalizeCheck{v0,v1,v2} <> Nil{}: 86n <> v0 <> boolean(v1,boolean(v2,suffix))
    case Canonical.DeliveryFindingDispositionCheck{v0,v1} <> Nil{}: 87n <> boolean(v0,v1 <> suffix)
    case Canonical.DeliverySubmissionCandidateCheck{v0} <> Nil{}: 88n <> delivery_submissionfacts([v0],suffix)
    case Canonical.DeliverySubmissionBatchCheck{v0,v1} <> Nil{}: 89n <> v0 <> boolean(v1,suffix)
    case Canonical.DeliveryCredentialObserveCheck{v0,v1,v2} <> Nil{}: 90n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.DeliveryFinalCredentialCheck{v0,v1} <> Nil{}: 91n <> boolean(v0,boolean(v1,suffix))
    case Canonical.ValidationRouteCheck{v0,v1} <> Nil{}: 92n <> boolean(v0,handoff_validationstatus([v1],suffix))
    case Canonical.PostValidationCheck{v0,v1,v2} <> Nil{}: 93n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.FinalCandidateCheck{v0,v1,v2,v3,v4,v5} <> Nil{}: 94n <> boolean(v0,boolean(v1,boolean(v2,boolean(v3,boolean(v4,boolean(v5,suffix))))))
    case Canonical.RoundBeginStopCheck{v0,v1,v2} <> Nil{}: 95n <> boolean(v0,boolean(v1,v2 <> suffix))
    case Canonical.RoundActivityCheck{v0,v1,v2,v3,v4,v5} <> Nil{}: 96n <> boolean(v0,boolean(v1,v2 <> boolean(v3,v4 <> v5 <> suffix)))
    case Canonical.RoundBarrierCheck{v0,v1,v2} <> Nil{}: 97n <> boolean(v0,v1 <> v2 <> suffix)
    case Canonical.RoundOwnsStopCheck{v0,v1,v2} <> Nil{}: 98n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.RoundStopTerminalCheck{v0,v1,v2} <> Nil{}: 99n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.RoundExpireCloseCheck{v0,v1} <> Nil{}: 100n <> boolean(v0,boolean(v1,suffix))
    case Canonical.RoundContinuationBudgetCheck{v0,v1} <> Nil{}: 101n <> boolean(v0,v1 <> suffix)
    case Canonical.DeliverySubmissionAllowedCheck{v0,v1,v2,v3,v4,v5} <> Nil{}: 102n <> boolean(v0,boolean(v1,boolean(v2,delivery_surface([v3],boolean(v4,boolean(v5,suffix))))))
    case Canonical.DeliveryExistingTokenCheck{v0,v1,v2} <> Nil{}: 103n <> delivery_surface([v0],boolean(v1,boolean(v2,suffix)))
    case Canonical.DeliveryUnreservedStopCheck{v0,v1} <> Nil{}: 104n <> boolean(v0,boolean(v1,suffix))
    case Canonical.IncludeLayerCheck{v0,v1,v2} <> Nil{}: 105n <> boolean(v0,v1 <> v2 <> suffix)
    case Canonical.FileSelectionCheck{v0,v1,v2,v3} <> Nil{}: 106n <> boolean(v0,boolean(v1,boolean(v2,boolean(v3,suffix))))
    case Canonical.FileProtectionInvalid{} <> Nil{}: 107n <> suffix
    case Canonical.FileProtectionCheck{v0,v1,v2} <> Nil{}: 108n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.CandidateFileCheck{v0,v1,v2} <> Nil{}: 109n <> boolean(v0,boolean(v1,boolean(v2,suffix)))
    case Canonical.ReviewAdmissionCheck{v0,v1,v2,v3} <> Nil{}: 110n <> boolean(v0,boolean(v1,boolean(v2,boolean(v3,suffix))))
    case Canonical.RuleEnableCheck{v0,v1} <> Nil{}: 111n <> boolean(v0,boolean(v1,suffix))
    case Canonical.RuleApplicabilityCheck{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12} <> Nil{}: 112n <> boolean(v0,boolean(v1,rulepolicy_target([v2],boolean(v3,boolean(v4,boolean(v5,boolean(v6,boolean(v7,boolean(v8,boolean(v9,boolean(v10,v11 <> v12 <> suffix)))))))))))
    case Canonical.RuleFindingCheck{v0,v1} <> Nil{}: 113n <> rulepolicy_probabilitywords([v0],rulepolicy_probabilitywords([v1],suffix))
    case Canonical.RuleRankOrderCheck{v0,v1,v2,v3} <> Nil{}: 114n <> rulepolicy_probabilitywords([v0],rulepolicy_probabilitywords([v1],v2 <> v3 <> suffix))
    case Canonical.AdviceOrderCheck{v0,v1,v2,v3} <> Nil{}: 115n <> rulepolicy_probabilitywords([v0],rulepolicy_probabilitywords([v1],rulepolicy_order([v2],rulepolicy_order([v3],suffix))))
    case Canonical.RuleBudgetCheck{v0,v1} <> Nil{}: 116n <> v0 <> v1 <> suffix
    case Canonical.ReuseRoute{v0,v1} <> Nil{}: 117n <> v0 <> boolean(v1,suffix)
    case Canonical.ReuseClaim{v0} <> Nil{}: 118n <> v0 <> suffix
    case Canonical.ReuseAttach{v0} <> Nil{}: 119n <> v0 <> suffix
    case Canonical.ReuseRelease{v0} <> Nil{}: 120n <> v0 <> suffix
    case Canonical.ReuseTouch{v0} <> Nil{}: 121n <> v0 <> suffix
    case Canonical.CachePrepare{v0,v1,v2,v3} <> Nil{}: 122n <> v0 <> v1 <> v2 <> v3 <> suffix
    case Canonical.CacheCommit{v0,v1,v2,v3,v4,v5} <> Nil{}: 123n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> suffix
    case Canonical.CacheDiscardPartition{v0} <> Nil{}: 124n <> v0 <> suffix
    case Canonical.CacheClear{} <> Nil{}: 125n <> suffix
    case Canonical.NoticeAdvance{v0,v1,v2,v3,v4,v5} <> Nil{}: 126n <> v0 <> maybe_nat([v1],v2 <> v3 <> v4 <> v5 <> suffix)
    case Canonical.NoticeCommit{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 127n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> v6 <> suffix
    case Canonical.NoticePrune{v0,v1,v2,v3,v4} <> Nil{}: 128n <> v0 <> boolean(v1,boolean(v2,boolean(v3,boolean(v4,suffix))))
    case Canonical.NoticeDrop{v0} <> Nil{}: 129n <> v0 <> suffix
    case Canonical.NoticeLease{v0,v1} <> Nil{}: 130n <> v0 <> boolean(v1,suffix)
    case Canonical.NoticeClearPending{v0} <> Nil{}: 131n <> v0 <> suffix
    case Canonical.NoticeSelect{v0,v1,v2,v3,v4} <> Nil{}: 132n <> v0 <> v1 <> boolean(v2,boolean(v3,list_nat([v4],suffix)))
    case Canonical.OutputStarted{v0,v1,v2} <> Nil{}: 133n <> v0 <> v1 <> v2 <> suffix
    case Canonical.OutputTerminal{v0,v1,v2,v3,v4} <> Nil{}: 134n <> v0 <> v1 <> v2 <> v3 <> canonical_writeoutcome([v4],suffix)
    case Canonical.RetirePartition{v0,v1,v2} <> Nil{}: 135n <> v0 <> v1 <> v2 <> suffix
    case _: 999999n <> suffix

def importgraph_edge(values: List<&2,ImportGraph.Edge>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Edge{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def importgraph_reason(values: List<&2,ImportGraph.Reason>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Missing{} <> Nil{}: 0n <> suffix
    case ImportGraph.Ambiguous{} <> Nil{}: 1n <> suffix
    case ImportGraph.Unsupported{} <> Nil{}: 2n <> suffix
    case ImportGraph.Omitted{} <> Nil{}: 3n <> suffix
    case ImportGraph.Excluded{} <> Nil{}: 4n <> suffix
    case ImportGraph.CaptureUnavailable{} <> Nil{}: 5n <> suffix
    case ImportGraph.FileLimit{} <> Nil{}: 6n <> suffix
    case ImportGraph.ReadLimit{} <> Nil{}: 7n <> suffix
    case ImportGraph.TreeLimit{} <> Nil{}: 8n <> suffix
    case ImportGraph.WorkLimit{} <> Nil{}: 9n <> suffix
    case ImportGraph.Deadline{} <> Nil{}: 10n <> suffix
    case ImportGraph.DepthLimit{} <> Nil{}: 11n <> suffix
    case ImportGraph.ProtocolViolation{} <> Nil{}: 12n <> suffix
    case _: 999999n <> suffix

def importgraph_phase(values: List<&2,ImportGraph.Phase>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Idle{} <> Nil{}: 0n <> suffix
    case ImportGraph.Ready{} <> Nil{}: 1n <> suffix
    case ImportGraph.Resolving{v0} <> Nil{}: 2n <> importgraph_edge([v0],suffix)
    case ImportGraph.Checking{v0,v1} <> Nil{}: 3n <> importgraph_edge([v0],v1 <> suffix)
    case ImportGraph.Capturing{v0,v1} <> Nil{}: 4n <> importgraph_edge([v0],v1 <> suffix)
    case ImportGraph.Complete{} <> Nil{}: 5n <> suffix
    case ImportGraph.Incomplete{v0} <> Nil{}: 6n <> importgraph_reason([v0],suffix)
    case _: 999999n <> suffix

def list_importgraph_edge_items(values: List<&2,List<&2,ImportGraph.Edge>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: importgraph_edge([head],list_importgraph_edge_items([tail],suffix))
    case _: 999999n <> suffix

def list_importgraph_edge(values: List<&2,List<&2,ImportGraph.Edge>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,ImportGraph.Edge,value) <> list_importgraph_edge_items([value],suffix)
    case _: 999999n <> suffix

def importgraph_limits(values: List<&2,ImportGraph.Limits>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Limits{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> v6 <> v7 <> suffix
    case _: 999999n <> suffix

def importgraph_graph(values: List<&2,ImportGraph.Graph>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Graph{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10} <> Nil{}: 0n <> importgraph_phase([v0],list_importgraph_edge([v1],list_nat([v2],v3 <> v4 <> v5 <> v6 <> boolean(v7,boolean(v8,boolean(v9,importgraph_limits([v10],suffix)))))))
    case _: 999999n <> suffix

def importgraph_bounded(values: List<&2,ImportGraph.Bounded>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Bounded{v0,v1} <> Nil{}: 0n <> importgraph_graph([v0],v1 <> suffix)
    case _: 999999n <> suffix

def importgraph_command(values: List<&2,ImportGraph.Command>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.NoCommand{} <> Nil{}: 0n <> suffix
    case ImportGraph.ResolveEdge{v0} <> Nil{}: 1n <> v0 <> suffix
    case ImportGraph.CheckPath{v0} <> Nil{}: 2n <> v0 <> suffix
    case ImportGraph.ReadSource{v0} <> Nil{}: 3n <> v0 <> suffix
    case ImportGraph.UnitComplete{} <> Nil{}: 4n <> suffix
    case ImportGraph.UnitIncomplete{v0} <> Nil{}: 5n <> importgraph_reason([v0],suffix)
    case ImportGraph.SkipImport{v0,v1} <> Nil{}: 6n <> v0 <> importgraph_reason([v1],suffix)
    case _: 999999n <> suffix

def importgraph_boundedstep(values: List<&2,ImportGraph.BoundedStep>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.BoundedStep{v0,v1} <> Nil{}: 0n <> importgraph_bounded([v0],importgraph_command([v1],suffix))
    case _: 999999n <> suffix

def importgraph_resolution(values: List<&2,ImportGraph.Resolution>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Found{} <> Nil{}: 0n <> suffix
    case ImportGraph.NotFound{} <> Nil{}: 1n <> suffix
    case ImportGraph.Many{} <> Nil{}: 2n <> suffix
    case ImportGraph.Unhandled{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def importgraph_graphevent(values: List<&2,ImportGraph.GraphEvent>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ImportGraph.Root{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],suffix)
    case ImportGraph.Next{} <> Nil{}: 1n <> suffix
    case ImportGraph.Resolved{v0,v1} <> Nil{}: 2n <> v0 <> importgraph_resolution([v1],suffix)
    case ImportGraph.PathChecked{v0} <> Nil{}: 3n <> boolean(v0,suffix)
    case ImportGraph.Captured{v0,v1,v2,v3} <> Nil{}: 4n <> v0 <> v1 <> v2 <> list_nat([v3],suffix)
    case ImportGraph.CaptureFailed{} <> Nil{}: 5n <> suffix
    case ImportGraph.DeadlineReached{} <> Nil{}: 6n <> suffix
    case _: 999999n <> suffix

def callbacks_owner(values: List<&2,Callbacks.Owner>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.Owner{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def callbacks_effect(values: List<&2,Callbacks.Effect>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.JevStarted{v0} <> Nil{}: 0n <> v0 <> suffix
    case Callbacks.JevInterrupted{v0} <> Nil{}: 1n <> v0 <> suffix
    case Callbacks.JevSettled{v0} <> Nil{}: 2n <> v0 <> suffix
    case Callbacks.PreparationCompleted{} <> Nil{}: 3n <> suffix
    case Callbacks.OutputTerminal{v0,v1} <> Nil{}: 4n <> v0 <> v1 <> suffix
    case Callbacks.OutputExpiry{v0,v1} <> Nil{}: 5n <> v0 <> v1 <> suffix
    case Callbacks.FinishTerminal{v0,v1,v2,v3,v4} <> Nil{}: 6n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],suffix)
    case _: 999999n <> suffix

def callbacks_target(values: List<&2,Callbacks.Target>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.Target{v0,v1,v2} <> Nil{}: 0n <> callbacks_owner([v0],callbacks_effect([v1],v2 <> suffix))
    case _: 999999n <> suffix

def callbacks_applicability(values: List<&2,Callbacks.Applicability>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.Applied{} <> Nil{}: 0n <> suffix
    case Callbacks.Missing{} <> Nil{}: 1n <> suffix
    case Callbacks.NotQueued{} <> Nil{}: 2n <> suffix
    case Callbacks.NotHeld{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def callbacks_control(values: List<&2,Callbacks.Control>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.Hold{} <> Nil{}: 0n <> suffix
    case Callbacks.Release{} <> Nil{}: 1n <> suffix
    case Callbacks.Drop{} <> Nil{}: 2n <> suffix
    case Callbacks.Duplicate{} <> Nil{}: 3n <> suffix
    case Callbacks.Reorder{} <> Nil{}: 4n <> suffix
    case _: 999999n <> suffix

def adviceelifecycle_status(values: List<&2,AdviceeLifecycle.Status>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case AdviceeLifecycle.Active{} <> Nil{}: 0n <> suffix
    case AdviceeLifecycle.Disconnected{} <> Nil{}: 1n <> suffix
    case AdviceeLifecycle.Removed{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def adviceelifecycle_entry(values: List<&2,AdviceeLifecycle.Entry>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case AdviceeLifecycle.Entry{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> adviceelifecycle_status([v2],suffix)
    case _: 999999n <> suffix

def adviceelifecycle_action(values: List<&2,AdviceeLifecycle.Action>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case AdviceeLifecycle.Disconnect{} <> Nil{}: 0n <> suffix
    case AdviceeLifecycle.Remove{} <> Nil{}: 1n <> suffix
    case AdviceeLifecycle.Resume{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def types_graphkey(values: List<&2,Types.GraphKey>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Types.GraphKey{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case _: 999999n <> suffix

def types_graphentry(values: List<&2,Types.GraphEntry>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Types.GraphEntry{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> importgraph_bounded([v6],suffix)
    case _: 999999n <> suffix

def list_adviceelifecycle_entry_items(values: List<&2,List<&2,AdviceeLifecycle.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: adviceelifecycle_entry([head],list_adviceelifecycle_entry_items([tail],suffix))
    case _: 999999n <> suffix

def list_adviceelifecycle_entry(values: List<&2,List<&2,AdviceeLifecycle.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,AdviceeLifecycle.Entry,value) <> list_adviceelifecycle_entry_items([value],suffix)
    case _: 999999n <> suffix

def session_config(values: List<&2,Session.Config>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Session.Settings{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> U32.to_nat(v0) <> U32.to_nat(v1) <> U32.to_nat(v2) <> U32.to_nat(v3) <> U32.to_nat(v4) <> U32.to_nat(v5) <> suffix
    case _: 999999n <> suffix

def list_u32_items(values: List<&2,List<&2,U32>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: U32.to_nat(head) <> list_u32_items([tail],suffix)
    case _: 999999n <> suffix

def list_u32(values: List<&2,List<&2,U32>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,U32,value) <> list_u32_items([value],suffix)
    case _: 999999n <> suffix

def workload_profile(values: List<&2,Workload.Profile>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Workload.Profile{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> session_config([v0],U32.to_nat(v1) <> list_u32([v2],v3 <> list_nat([v4],maybe_nat([v5],suffix))))
    case _: 999999n <> suffix

def maybe_workload_profile(values: List<&2,Maybe<&2,Workload.Profile>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> workload_profile([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_advicee(values: List<&2,NativeRunTypes.Advicee>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.Advicee{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> maybe_workload_profile([v2],suffix)
    case _: 999999n <> suffix

def list_nativeruntypes_advicee_items(values: List<&2,List<&2,NativeRunTypes.Advicee>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_advicee([head],list_nativeruntypes_advicee_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_advicee(values: List<&2,List<&2,NativeRunTypes.Advicee>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.Advicee,value) <> list_nativeruntypes_advicee_items([value],suffix)
    case _: 999999n <> suffix

def maybe_canonical_requestoutcome(values: List<&2,Maybe<&2,Canonical.RequestOutcome>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> canonical_requestoutcome([value],suffix)
    case _: 999999n <> suffix

def numeric_words(values: List<&2,Numeric.Words>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Numeric.Words{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_numeric_words_items(values: List<&2,List<&2,Numeric.Words>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: numeric_words([head],list_numeric_words_items([tail],suffix))
    case _: 999999n <> suffix

def list_numeric_words(values: List<&2,List<&2,Numeric.Words>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Numeric.Words,value) <> list_numeric_words_items([value],suffix)
    case _: 999999n <> suffix

def treefacts_profile(values: List<&2,TreeFacts.Profile>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case TreeFacts.Profile{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> v6 <> v7 <> v8 <> v9 <> v10 <> v11 <> v12 <> v13 <> v14 <> v15 <> suffix
    case _: 999999n <> suffix

def outputscenario_outcome(values: List<&2,OutputScenario.Outcome>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case OutputScenario.Certain{} <> Nil{}: 0n <> suffix
    case OutputScenario.Uncertain{} <> Nil{}: 1n <> suffix
    case OutputScenario.Failed{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def nativeruntypes_outputprofile(values: List<&2,NativeRunTypes.OutputProfile>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.OutputProfile{v0,v1} <> Nil{}: 0n <> outputscenario_outcome([v0],maybe_nat([v1],suffix))
    case _: 999999n <> suffix

def nativeruntypes_environment(values: List<&2,NativeRunTypes.Environment>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.Environment{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13} <> Nil{}: 0n <> v0 <> maybe_canonical_requestoutcome([v1],list_numeric_words([v2],v3 <> treefacts_profile([v4],importgraph_limits([v5],v6 <> v7 <> boolean(v8,boolean(v9,v10 <> boolean(v11,v12 <> nativeruntypes_outputprofile([v13],suffix))))))))
    case _: 999999n <> suffix

def collectorscenario_profile(values: List<&2,CollectorScenario.Profile>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectorScenario.Profile{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def maybe_collectorscenario_profile(values: List<&2,Maybe<&2,CollectorScenario.Profile>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> collectorscenario_profile([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_config(values: List<&2,NativeRunTypes.Config>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.Config{v0,v1,v2,v3} <> Nil{}: 0n <> ledger_limits([v0],list_nativeruntypes_advicee([v1],nativeruntypes_environment([v2],maybe_collectorscenario_profile([v3],suffix))))
    case _: 999999n <> suffix

def defenseconsumerobserved_input(values: List<&2,DefenseConsumerObserved.Input>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseConsumerObserved.GameKey{v0} <> Nil{}: 0n <> U32.to_nat(v0) <> suffix
    case DefenseConsumerObserved.Ticks{v0} <> Nil{}: 1n <> v0 <> suffix
    case DefenseConsumerObserved.JevProfile{v0,v1} <> Nil{}: 2n <> v0 <> list_numeric_words([v1],suffix)
    case _: 999999n <> suffix

def list_defenseconsumerobserved_input_items(values: List<&2,List<&2,DefenseConsumerObserved.Input>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defenseconsumerobserved_input([head],list_defenseconsumerobserved_input_items([tail],suffix))
    case _: 999999n <> suffix

def list_defenseconsumerobserved_input(values: List<&2,List<&2,DefenseConsumerObserved.Input>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseConsumerObserved.Input,value) <> list_defenseconsumerobserved_input_items([value],suffix)
    case _: 999999n <> suffix

def list_types_graphentry_items(values: List<&2,List<&2,Types.GraphEntry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: types_graphentry([head],list_types_graphentry_items([tail],suffix))
    case _: 999999n <> suffix

def list_types_graphentry(values: List<&2,List<&2,Types.GraphEntry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Types.GraphEntry,value) <> list_types_graphentry_items([value],suffix)
    case _: 999999n <> suffix

def scheduler_entry(values: List<&2,Scheduler.Entry>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Scheduler.Entry{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_scheduler_entry_items(values: List<&2,List<&2,Scheduler.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: scheduler_entry([head],list_scheduler_entry_items([tail],suffix))
    case _: 999999n <> suffix

def list_scheduler_entry(values: List<&2,List<&2,Scheduler.Entry>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Scheduler.Entry,value) <> list_scheduler_entry_items([value],suffix)
    case _: 999999n <> suffix

def scheduler_state(values: List<&2,Scheduler.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Scheduler.State{v0,v1} <> Nil{}: 0n <> list_scheduler_entry([v0],v1 <> suffix)
    case _: 999999n <> suffix

def session_state(values: List<&2,Session.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Session.Stream{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11} <> Nil{}: 0n <> U32.to_nat(v0) <> U32.to_nat(v1) <> U32.to_nat(v2) <> v3 <> v4 <> v5 <> boolean(v6,U32.to_nat(v7) <> U32.to_nat(v8) <> v9 <> v10 <> list_nat([v11],suffix))
    case _: 999999n <> suffix

def workload_advicee(values: List<&2,Workload.Advicee>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Workload.Advicee{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> session_config([v1],session_state([v2],maybe_nat([v3],suffix)))
    case _: 999999n <> suffix

def list_workload_advicee_items(values: List<&2,List<&2,Workload.Advicee>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: workload_advicee([head],list_workload_advicee_items([tail],suffix))
    case _: 999999n <> suffix

def list_workload_advicee(values: List<&2,List<&2,Workload.Advicee>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Workload.Advicee,value) <> list_workload_advicee_items([value],suffix)
    case _: 999999n <> suffix

def random_state(values: List<&2,Random.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Random.State{v0,v1} <> Nil{}: 0n <> U32.to_nat(v0) <> U32.to_nat(v1) <> suffix
    case _: 999999n <> suffix

def advicees_scope(values: List<&2,Advicees.Scope>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Advicees.Scope{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> v2 <> suffix
    case _: 999999n <> suffix

def list_advicees_scope_items(values: List<&2,List<&2,Advicees.Scope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: advicees_scope([head],list_advicees_scope_items([tail],suffix))
    case _: 999999n <> suffix

def list_advicees_scope(values: List<&2,List<&2,Advicees.Scope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Advicees.Scope,value) <> list_advicees_scope_items([value],suffix)
    case _: 999999n <> suffix

def advicees_registry(values: List<&2,Advicees.Registry>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Advicees.Registry{v0,v1} <> Nil{}: 0n <> v0 <> list_advicees_scope([v1],suffix)
    case _: 999999n <> suffix

def credentialfacts_capture(values: List<&2,CredentialFacts.Capture>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CredentialFacts.Capture{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_credentialfacts_capture_items(values: List<&2,List<&2,CredentialFacts.Capture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: credentialfacts_capture([head],list_credentialfacts_capture_items([tail],suffix))
    case _: 999999n <> suffix

def list_credentialfacts_capture(values: List<&2,List<&2,CredentialFacts.Capture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CredentialFacts.Capture,value) <> list_credentialfacts_capture_items([value],suffix)
    case _: 999999n <> suffix

def credentialfacts_state(values: List<&2,CredentialFacts.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CredentialFacts.State{v0,v1,v2} <> Nil{}: 0n <> boolean(v0,v1 <> list_credentialfacts_capture([v2],suffix))
    case _: 999999n <> suffix

def adviceelifecyclecleanup_capturedpreparation(values: List<&2,AdviceeLifecycleCleanup.CapturedPreparation>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case AdviceeLifecycleCleanup.CapturedPreparation{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case _: 999999n <> suffix

def list_adviceelifecyclecleanup_capturedpreparation_items(values: List<&2,List<&2,AdviceeLifecycleCleanup.CapturedPreparation>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: adviceelifecyclecleanup_capturedpreparation([head],list_adviceelifecyclecleanup_capturedpreparation_items([tail],suffix))
    case _: 999999n <> suffix

def list_adviceelifecyclecleanup_capturedpreparation(values: List<&2,List<&2,AdviceeLifecycleCleanup.CapturedPreparation>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,AdviceeLifecycleCleanup.CapturedPreparation,value) <> list_adviceelifecyclecleanup_capturedpreparation_items([value],suffix)
    case _: 999999n <> suffix

def adviceeactivity_scope(values: List<&2,AdviceeActivity.Scope>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case AdviceeActivity.Scope{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_adviceeactivity_scope_items(values: List<&2,List<&2,AdviceeActivity.Scope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: adviceeactivity_scope([head],list_adviceeactivity_scope_items([tail],suffix))
    case _: 999999n <> suffix

def list_adviceeactivity_scope(values: List<&2,List<&2,AdviceeActivity.Scope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,AdviceeActivity.Scope,value) <> list_adviceeactivity_scope_items([value],suffix)
    case _: 999999n <> suffix

def driver_candidate(values: List<&2,Driver.Candidate>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Driver.Candidate{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> handoff_surface([v4],boolean(v5,suffix))
    case _: 999999n <> suffix

def maybe_driver_candidate(values: List<&2,Maybe<&2,Driver.Candidate>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> driver_candidate([value],suffix)
    case _: 999999n <> suffix

def driver_action(values: List<&2,Driver.Action>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Driver.Action{v0,v1,v2,v3,v4} <> Nil{}: 0n <> canonical_canonicalevent([v0],v1 <> maybe_driver_candidate([v2],boolean(v3,maybe_nat([v4],suffix))))
    case _: 999999n <> suffix

def outputscenario_attempt(values: List<&2,OutputScenario.Attempt>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case OutputScenario.Individual{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case OutputScenario.Finish{v0,v1,v2,v3,v4} <> Nil{}: 1n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],suffix)
    case _: 999999n <> suffix

def outputscenario_capture(values: List<&2,OutputScenario.Capture>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case OutputScenario.Capture{v0,v1,v2,v3,v4} <> Nil{}: 0n <> outputscenario_attempt([v0],v1 <> outputscenario_outcome([v2],v3 <> v4 <> suffix))
    case _: 999999n <> suffix

def maybe_outputscenario_capture(values: List<&2,Maybe<&2,OutputScenario.Capture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> outputscenario_capture([value],suffix)
    case _: 999999n <> suffix

def callbacks_fact(values: List<&2,Callbacks.Fact>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.Fact{v0,v1,v2,v3} <> Nil{}: 0n <> callbacks_target([v0],v1 <> driver_action([v2],maybe_outputscenario_capture([v3],suffix)))
    case _: 999999n <> suffix

def callbacks_status(values: List<&2,Callbacks.Status>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.Queued{} <> Nil{}: 0n <> suffix
    case Callbacks.Held{} <> Nil{}: 1n <> suffix
    case Callbacks.Dropped{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def callbacks_original(values: List<&2,Callbacks.Original>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.Original{v0,v1,v2} <> Nil{}: 0n <> callbacks_fact([v0],callbacks_status([v1],v2 <> suffix))
    case _: 999999n <> suffix

def list_callbacks_original_items(values: List<&2,List<&2,Callbacks.Original>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: callbacks_original([head],list_callbacks_original_items([tail],suffix))
    case _: 999999n <> suffix

def list_callbacks_original(values: List<&2,List<&2,Callbacks.Original>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Callbacks.Original,value) <> list_callbacks_original_items([value],suffix)
    case _: 999999n <> suffix

def callbacks_state(values: List<&2,Callbacks.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Callbacks.State{v0} <> Nil{}: 0n <> list_callbacks_original([v0],suffix)
    case _: 999999n <> suffix

def noticescenario_scope(values: List<&2,NoticeScenario.Scope>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NoticeScenario.Scope{v0,v1,v2,v3,v4,v5,v6} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> v6 <> suffix
    case _: 999999n <> suffix

def noticescenario_pending(values: List<&2,NoticeScenario.Pending>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NoticeScenario.Pending{v0,v1,v2} <> Nil{}: 0n <> noticescenario_scope([v0],v1 <> v2 <> suffix)
    case _: 999999n <> suffix

def list_noticescenario_pending_items(values: List<&2,List<&2,NoticeScenario.Pending>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: noticescenario_pending([head],list_noticescenario_pending_items([tail],suffix))
    case _: 999999n <> suffix

def list_noticescenario_pending(values: List<&2,List<&2,NoticeScenario.Pending>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NoticeScenario.Pending,value) <> list_noticescenario_pending_items([value],suffix)
    case _: 999999n <> suffix

def noticescenario_state(values: List<&2,NoticeScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NoticeScenario.State{v0} <> Nil{}: 0n <> list_noticescenario_pending([v0],suffix)
    case _: 999999n <> suffix

def expiryscenario_noticeclock(values: List<&2,ExpiryScenario.NoticeClock>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ExpiryScenario.NoticeClock{v0,v1,v2,v3,v4,v5,v6,v7,v8} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> v6 <> v7 <> v8 <> suffix
    case _: 999999n <> suffix

def maybe_expiryscenario_noticeclock(values: List<&2,Maybe<&2,ExpiryScenario.NoticeClock>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> expiryscenario_noticeclock([value],suffix)
    case _: 999999n <> suffix

def noticescenario_clock(values: List<&2,NoticeScenario.Clock>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NoticeScenario.Clock{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> maybe_expiryscenario_noticeclock([v4],suffix)
    case _: 999999n <> suffix

def list_noticescenario_clock_items(values: List<&2,List<&2,NoticeScenario.Clock>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: noticescenario_clock([head],list_noticescenario_clock_items([tail],suffix))
    case _: 999999n <> suffix

def list_noticescenario_clock(values: List<&2,List<&2,NoticeScenario.Clock>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NoticeScenario.Clock,value) <> list_noticescenario_clock_items([value],suffix)
    case _: 999999n <> suffix

def freshnessscenario_scope(values: List<&2,FreshnessScenario.Scope>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case FreshnessScenario.Scope{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def freshnessscenario_source(values: List<&2,FreshnessScenario.Source>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case FreshnessScenario.Source{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def freshnessscenario_binding(values: List<&2,FreshnessScenario.Binding>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case FreshnessScenario.Binding{v0,v1,v2} <> Nil{}: 0n <> freshnessscenario_scope([v0],freshnessscenario_source([v1],v2 <> suffix))
    case _: 999999n <> suffix

def list_freshnessscenario_binding_items(values: List<&2,List<&2,FreshnessScenario.Binding>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: freshnessscenario_binding([head],list_freshnessscenario_binding_items([tail],suffix))
    case _: 999999n <> suffix

def list_freshnessscenario_binding(values: List<&2,List<&2,FreshnessScenario.Binding>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,FreshnessScenario.Binding,value) <> list_freshnessscenario_binding_items([value],suffix)
    case _: 999999n <> suffix

def freshnessscenario_state(values: List<&2,FreshnessScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case FreshnessScenario.State{v0} <> Nil{}: 0n <> list_freshnessscenario_binding([v0],suffix)
    case _: 999999n <> suffix

def scopedrevision_subjectkey(values: List<&2,ScopedRevision.SubjectKey>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ScopedRevision.SubjectKey{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> v2 <> suffix
    case _: 999999n <> suffix

def list_scopedrevision_subjectkey_items(values: List<&2,List<&2,ScopedRevision.SubjectKey>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: scopedrevision_subjectkey([head],list_scopedrevision_subjectkey_items([tail],suffix))
    case _: 999999n <> suffix

def list_scopedrevision_subjectkey(values: List<&2,List<&2,ScopedRevision.SubjectKey>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,ScopedRevision.SubjectKey,value) <> list_scopedrevision_subjectkey_items([value],suffix)
    case _: 999999n <> suffix

def scopedrevision_state(values: List<&2,ScopedRevision.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case ScopedRevision.State{v0,v1} <> Nil{}: 0n <> list_scopedrevision_subjectkey([v0],v1 <> suffix)
    case _: 999999n <> suffix

def sharingscenario_sharingkey(values: List<&2,SharingScenario.SharingKey>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingScenario.SharingKey{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def sharingscenario_member(values: List<&2,SharingScenario.Member>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingScenario.Member{v0,v1,v2} <> Nil{}: 0n <> freshnessscenario_scope([v0],freshnessscenario_source([v1],v2 <> suffix))
    case _: 999999n <> suffix

def list_sharingscenario_member_items(values: List<&2,List<&2,SharingScenario.Member>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: sharingscenario_member([head],list_sharingscenario_member_items([tail],suffix))
    case _: 999999n <> suffix

def list_sharingscenario_member(values: List<&2,List<&2,SharingScenario.Member>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SharingScenario.Member,value) <> list_sharingscenario_member_items([value],suffix)
    case _: 999999n <> suffix

def sharingscenario_physical(values: List<&2,SharingScenario.Physical>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingScenario.Physical{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case _: 999999n <> suffix

def maybe_sharingscenario_physical(values: List<&2,Maybe<&2,SharingScenario.Physical>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> sharingscenario_physical([value],suffix)
    case _: 999999n <> suffix

def maybe_freshnessscenario_scope(values: List<&2,Maybe<&2,FreshnessScenario.Scope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> freshnessscenario_scope([value],suffix)
    case _: 999999n <> suffix

def sharingscenario_evaluation(values: List<&2,SharingScenario.Evaluation>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingScenario.Evaluation{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> sharingscenario_sharingkey([v1],list_sharingscenario_member([v2],maybe_sharingscenario_physical([v3],maybe_freshnessscenario_scope([v4],suffix))))
    case _: 999999n <> suffix

def list_sharingscenario_evaluation_items(values: List<&2,List<&2,SharingScenario.Evaluation>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: sharingscenario_evaluation([head],list_sharingscenario_evaluation_items([tail],suffix))
    case _: 999999n <> suffix

def list_sharingscenario_evaluation(values: List<&2,List<&2,SharingScenario.Evaluation>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SharingScenario.Evaluation,value) <> list_sharingscenario_evaluation_items([value],suffix)
    case _: 999999n <> suffix

def sharingscenario_state(values: List<&2,SharingScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingScenario.State{v0,v1} <> Nil{}: 0n <> list_sharingscenario_evaluation([v0],v1 <> suffix)
    case _: 999999n <> suffix

def sharingruntime_disposition(values: List<&2,SharingRuntime.Disposition>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingRuntime.Awaiting{} <> Nil{}: 0n <> suffix
    case SharingRuntime.Owned{} <> Nil{}: 1n <> suffix
    case SharingRuntime.Joined{} <> Nil{}: 2n <> suffix
    case SharingRuntime.CachedFinding{} <> Nil{}: 3n <> suffix
    case _: 999999n <> suffix

def sharingruntime_preparedunit(values: List<&2,SharingRuntime.PreparedUnit>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingRuntime.PreparedUnit{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> sharingscenario_sharingkey([v2],v3 <> sharingruntime_disposition([v4],suffix))
    case _: 999999n <> suffix

def list_sharingruntime_preparedunit_items(values: List<&2,List<&2,SharingRuntime.PreparedUnit>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: sharingruntime_preparedunit([head],list_sharingruntime_preparedunit_items([tail],suffix))
    case _: 999999n <> suffix

def list_sharingruntime_preparedunit(values: List<&2,List<&2,SharingRuntime.PreparedUnit>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SharingRuntime.PreparedUnit,value) <> list_sharingruntime_preparedunit_items([value],suffix)
    case _: 999999n <> suffix

def sharingruntime_preparation(values: List<&2,SharingRuntime.Preparation>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingRuntime.Preparation{v0,v1,v2} <> Nil{}: 0n <> freshnessscenario_scope([v0],sharingscenario_member([v1],list_sharingruntime_preparedunit([v2],suffix)))
    case _: 999999n <> suffix

def list_sharingruntime_preparation_items(values: List<&2,List<&2,SharingRuntime.Preparation>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: sharingruntime_preparation([head],list_sharingruntime_preparation_items([tail],suffix))
    case _: 999999n <> suffix

def list_sharingruntime_preparation(values: List<&2,List<&2,SharingRuntime.Preparation>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SharingRuntime.Preparation,value) <> list_sharingruntime_preparation_items([value],suffix)
    case _: 999999n <> suffix

def sharingruntime_binding(values: List<&2,SharingRuntime.Binding>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingRuntime.Binding{v0,v1,v2,v3} <> Nil{}: 0n <> freshnessscenario_scope([v0],v1 <> v2 <> boolean(v3,suffix))
    case _: 999999n <> suffix

def list_sharingruntime_binding_items(values: List<&2,List<&2,SharingRuntime.Binding>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: sharingruntime_binding([head],list_sharingruntime_binding_items([tail],suffix))
    case _: 999999n <> suffix

def list_sharingruntime_binding(values: List<&2,List<&2,SharingRuntime.Binding>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SharingRuntime.Binding,value) <> list_sharingruntime_binding_items([value],suffix)
    case _: 999999n <> suffix

def sharingruntime_sharingresult(values: List<&2,SharingRuntime.SharingResult>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingRuntime.SharingResult{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> canonical_requestoutcome([v1],freshnessscenario_scope([v2],v3 <> suffix))
    case _: 999999n <> suffix

def list_sharingruntime_sharingresult_items(values: List<&2,List<&2,SharingRuntime.SharingResult>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: sharingruntime_sharingresult([head],list_sharingruntime_sharingresult_items([tail],suffix))
    case _: 999999n <> suffix

def list_sharingruntime_sharingresult(values: List<&2,List<&2,SharingRuntime.SharingResult>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,SharingRuntime.SharingResult,value) <> list_sharingruntime_sharingresult_items([value],suffix)
    case _: 999999n <> suffix

def sharingruntime_state(values: List<&2,SharingRuntime.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case SharingRuntime.State{v0,v1,v2,v3} <> Nil{}: 0n <> sharingscenario_state([v0],list_sharingruntime_preparation([v1],list_sharingruntime_binding([v2],list_sharingruntime_sharingresult([v3],suffix))))
    case _: 999999n <> suffix

def cachescenario_offer(values: List<&2,CacheScenario.Offer>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheScenario.Offer{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> sharingscenario_sharingkey([v1],freshnessscenario_scope([v2],v3 <> canonical_requestoutcome([v4],suffix)))
    case _: 999999n <> suffix

def cachescenario_payload(values: List<&2,CacheScenario.Payload>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheScenario.Payload{v0,v1} <> Nil{}: 0n <> cachescenario_offer([v0],v1 <> suffix)
    case _: 999999n <> suffix

def list_cachescenario_payload_items(values: List<&2,List<&2,CacheScenario.Payload>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: cachescenario_payload([head],list_cachescenario_payload_items([tail],suffix))
    case _: 999999n <> suffix

def list_cachescenario_payload(values: List<&2,List<&2,CacheScenario.Payload>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CacheScenario.Payload,value) <> list_cachescenario_payload_items([value],suffix)
    case _: 999999n <> suffix

def cachescenario_state(values: List<&2,CacheScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheScenario.State{v0} <> Nil{}: 0n <> list_cachescenario_payload([v0],suffix)
    case _: 999999n <> suffix

def cacheruntime_stage(values: List<&2,CacheRuntime.Stage>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheRuntime.PrepareStage{} <> Nil{}: 0n <> suffix
    case CacheRuntime.ReserveStage{} <> Nil{}: 1n <> suffix
    case CacheRuntime.CommitStage{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def cacheruntime_pending(values: List<&2,CacheRuntime.Pending>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheRuntime.Pending{v0,v1,v2,v3,v4} <> Nil{}: 0n <> cachescenario_offer([v0],v1 <> v2 <> maybe_nat([v3],cacheruntime_stage([v4],suffix)))
    case _: 999999n <> suffix

def list_cacheruntime_pending_items(values: List<&2,List<&2,CacheRuntime.Pending>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: cacheruntime_pending([head],list_cacheruntime_pending_items([tail],suffix))
    case _: 999999n <> suffix

def list_cacheruntime_pending(values: List<&2,List<&2,CacheRuntime.Pending>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CacheRuntime.Pending,value) <> list_cacheruntime_pending_items([value],suffix)
    case _: 999999n <> suffix

def cacheruntime_sourcecapture(values: List<&2,CacheRuntime.SourceCapture>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheRuntime.SourceCapture{v0,v1} <> Nil{}: 0n <> cachescenario_offer([v0],freshnessscenario_binding([v1],suffix))
    case _: 999999n <> suffix

def list_cacheruntime_sourcecapture_items(values: List<&2,List<&2,CacheRuntime.SourceCapture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: cacheruntime_sourcecapture([head],list_cacheruntime_sourcecapture_items([tail],suffix))
    case _: 999999n <> suffix

def list_cacheruntime_sourcecapture(values: List<&2,List<&2,CacheRuntime.SourceCapture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CacheRuntime.SourceCapture,value) <> list_cacheruntime_sourcecapture_items([value],suffix)
    case _: 999999n <> suffix

def cacheruntime_config(values: List<&2,CacheRuntime.Config>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheRuntime.Config{v0,v1,v2} <> Nil{}: 0n <> boolean(v0,v1 <> v2 <> suffix)
    case _: 999999n <> suffix

def cacheruntime_state(values: List<&2,CacheRuntime.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheRuntime.State{v0,v1,v2,v3} <> Nil{}: 0n <> cachescenario_state([v0],list_cacheruntime_pending([v1],list_cacheruntime_sourcecapture([v2],cacheruntime_config([v3],suffix))))
    case _: 999999n <> suffix

def collectionscenario_identity(values: List<&2,CollectionScenario.Identity>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionScenario.Identity{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def collectionscenario_response(values: List<&2,CollectionScenario.Response>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionScenario.Response{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> boolean(v5,suffix)
    case _: 999999n <> suffix

def collectionscenario_phase(values: List<&2,CollectionScenario.Phase>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionScenario.Idle{} <> Nil{}: 0n <> suffix
    case CollectionScenario.Gating{v0} <> Nil{}: 1n <> boolean(v0,suffix)
    case CollectionScenario.Selecting{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def collectionscenario_selection(values: List<&2,CollectionScenario.Selection>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionScenario.Selection{v0,v1} <> Nil{}: 0n <> v0 <> v1 <> suffix
    case _: 999999n <> suffix

def list_collectionscenario_selection_items(values: List<&2,List<&2,CollectionScenario.Selection>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: collectionscenario_selection([head],list_collectionscenario_selection_items([tail],suffix))
    case _: 999999n <> suffix

def list_collectionscenario_selection(values: List<&2,List<&2,CollectionScenario.Selection>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CollectionScenario.Selection,value) <> list_collectionscenario_selection_items([value],suffix)
    case _: 999999n <> suffix

def collectionscenario_context(values: List<&2,CollectionScenario.Context>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionScenario.Context{v0,v1,v2,v3,v4} <> Nil{}: 0n <> collectionscenario_identity([v0],collectionscenario_response([v1],v2 <> collectionscenario_phase([v3],list_collectionscenario_selection([v4],suffix))))
    case _: 999999n <> suffix

def list_collectionscenario_context_items(values: List<&2,List<&2,CollectionScenario.Context>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: collectionscenario_context([head],list_collectionscenario_context_items([tail],suffix))
    case _: 999999n <> suffix

def list_collectionscenario_context(values: List<&2,List<&2,CollectionScenario.Context>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CollectionScenario.Context,value) <> list_collectionscenario_context_items([value],suffix)
    case _: 999999n <> suffix

def collectionscenario_scope(values: List<&2,CollectionScenario.Scope>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionScenario.Scope{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> v2 <> suffix
    case _: 999999n <> suffix

def list_collectionscenario_scope_items(values: List<&2,List<&2,CollectionScenario.Scope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: collectionscenario_scope([head],list_collectionscenario_scope_items([tail],suffix))
    case _: 999999n <> suffix

def list_collectionscenario_scope(values: List<&2,List<&2,CollectionScenario.Scope>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CollectionScenario.Scope,value) <> list_collectionscenario_scope_items([value],suffix)
    case _: 999999n <> suffix

def collectionscenario_state(values: List<&2,CollectionScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectionScenario.State{v0,v1,v2} <> Nil{}: 0n <> v0 <> list_collectionscenario_context([v1],list_collectionscenario_scope([v2],suffix))
    case _: 999999n <> suffix

def writerscenario_target(values: List<&2,WriterScenario.Target>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case WriterScenario.Target{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def writerscenario_capture(values: List<&2,WriterScenario.Capture>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case WriterScenario.Capture{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> writerscenario_target([v0],v1 <> v2 <> v3 <> v4 <> collectionscenario_response([v5],suffix))
    case _: 999999n <> suffix

def list_writerscenario_capture_items(values: List<&2,List<&2,WriterScenario.Capture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: writerscenario_capture([head],list_writerscenario_capture_items([tail],suffix))
    case _: 999999n <> suffix

def list_writerscenario_capture(values: List<&2,List<&2,WriterScenario.Capture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,WriterScenario.Capture,value) <> list_writerscenario_capture_items([value],suffix)
    case _: 999999n <> suffix

def writerscenario_state(values: List<&2,WriterScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case WriterScenario.State{v0,v1} <> Nil{}: 0n <> list_writerscenario_capture([v0],list_collectionscenario_scope([v1],suffix))
    case _: 999999n <> suffix

def collectorscenario_candidate(values: List<&2,CollectorScenario.Candidate>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectorScenario.Candidate{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> suffix
    case _: 999999n <> suffix

def list_collectorscenario_candidate_items(values: List<&2,List<&2,CollectorScenario.Candidate>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: collectorscenario_candidate([head],list_collectorscenario_candidate_items([tail],suffix))
    case _: 999999n <> suffix

def list_collectorscenario_candidate(values: List<&2,List<&2,CollectorScenario.Candidate>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,CollectorScenario.Candidate,value) <> list_collectorscenario_candidate_items([value],suffix)
    case _: 999999n <> suffix

def collectorscenario_state(values: List<&2,CollectorScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CollectorScenario.State{v0,v1} <> Nil{}: 0n <> maybe_collectorscenario_profile([v0],list_collectorscenario_candidate([v1],suffix))
    case _: 999999n <> suffix

def list_outputscenario_capture_items(values: List<&2,List<&2,OutputScenario.Capture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: outputscenario_capture([head],list_outputscenario_capture_items([tail],suffix))
    case _: 999999n <> suffix

def list_outputscenario_capture(values: List<&2,List<&2,OutputScenario.Capture>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,OutputScenario.Capture,value) <> list_outputscenario_capture_items([value],suffix)
    case _: 999999n <> suffix

def stopscenario_finish(values: List<&2,StopScenario.Finish>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case StopScenario.Finish{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> v5 <> boolean(v6,list_nat([v7],boolean(v8,v9 <> v10 <> boolean(v11,list_outputscenario_capture([v12],suffix)))))
    case _: 999999n <> suffix

def list_stopscenario_finish_items(values: List<&2,List<&2,StopScenario.Finish>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: stopscenario_finish([head],list_stopscenario_finish_items([tail],suffix))
    case _: 999999n <> suffix

def list_stopscenario_finish(values: List<&2,List<&2,StopScenario.Finish>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,StopScenario.Finish,value) <> list_stopscenario_finish_items([value],suffix)
    case _: 999999n <> suffix

def stopscenario_state(values: List<&2,StopScenario.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case StopScenario.State{v0,v1} <> Nil{}: 0n <> list_stopscenario_finish([v0],v1 <> suffix)
    case _: 999999n <> suffix

def runtimescenarios_state(values: List<&2,RuntimeScenarios.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case RuntimeScenarios.State{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10} <> Nil{}: 0n <> callbacks_state([v0],noticescenario_state([v1],list_noticescenario_clock([v2],freshnessscenario_state([v3],scopedrevision_state([v4],sharingruntime_state([v5],cacheruntime_state([v6],collectionscenario_state([v7],writerscenario_state([v8],collectorscenario_state([v9],stopscenario_state([v10],suffix)))))))))))
    case _: 999999n <> suffix

def types_state(values: List<&2,Types.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Types.State{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12} <> Nil{}: 0n <> canonical_state([v0],list_types_graphentry([v1],scheduler_state([v2],list_workload_advicee([v3],random_state([v4],advicees_registry([v5],credentialfacts_state([v6],list_nat([v7],list_nat([v8],list_adviceelifecycle_entry([v9],list_adviceelifecyclecleanup_capturedpreparation([v10],list_adviceeactivity_scope([v11],runtimescenarios_state([v12],suffix)))))))))))))
    case _: 999999n <> suffix

def list_types_state_items(values: List<&2,List<&2,Types.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: types_state([head],list_types_state_items([tail],suffix))
    case _: 999999n <> suffix

def list_types_state(values: List<&2,List<&2,Types.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Types.State,value) <> list_types_state_items([value],suffix)
    case _: 999999n <> suffix

def workload_emission(values: List<&2,Workload.Emission>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Workload.Emission{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9} <> Nil{}: 0n <> v0 <> v1 <> v2 <> U32.to_nat(v3) <> v4 <> v5 <> v6 <> list_nat([v7],boolean(v8,boolean(v9,suffix)))
    case _: 999999n <> suffix

def driver_sourcejob(values: List<&2,Driver.SourceJob>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Driver.SourceJob{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> list_nat([v3],maybe_canonical_requestoutcome([v4],suffix))
    case _: 999999n <> suffix

def maybe_driver_sourcejob(values: List<&2,Maybe<&2,Driver.SourceJob>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> driver_sourcejob([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_job(values: List<&2,NativeRunTypes.Job>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.Job{v0,v1,v2,v3,v4,v5,v6,v7,v8} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> list_nat([v4],v5 <> boolean(v6,maybe_nat([v7],maybe_driver_sourcejob([v8],suffix))))
    case _: 999999n <> suffix

def maybe_nativeruntypes_job(values: List<&2,Maybe<&2,NativeRunTypes.Job>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> nativeruntypes_job([value],suffix)
    case _: 999999n <> suffix

def driver_context(values: List<&2,Driver.Context>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Driver.Context{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19,v20} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> boolean(v4,v5 <> maybe_canonical_requestoutcome([v6],boolean(v7,boolean(v8,boolean(v9,boolean(v10,v11 <> maybe_driver_candidate([v12],boolean(v13,boolean(v14,boolean(v15,boolean(v16,v17 <> v18 <> boolean(v19,boolean(v20,suffix)))))))))))))
    case _: 999999n <> suffix

def driver_outcomesource(values: List<&2,Driver.OutcomeSource>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Driver.EditForced{} <> Nil{}: 0n <> suffix
    case Driver.RunForced{} <> Nil{}: 1n <> suffix
    case Driver.Sampled{} <> Nil{}: 2n <> suffix
    case _: 999999n <> suffix

def maybe_u32(values: List<&2,Maybe<&2,U32>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> U32.to_nat(value) <> suffix
    case _: 999999n <> suffix

def driver_outcomereceipt(values: List<&2,Driver.OutcomeReceipt>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Driver.OutcomeReceipt{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> v4 <> canonical_requestoutcome([v5],driver_outcomesource([v6],maybe_driver_sourcejob([v7],maybe_u32([v8],maybe_u32([v9],suffix)))))
    case _: 999999n <> suffix

def maybe_driver_outcomereceipt(values: List<&2,Maybe<&2,Driver.OutcomeReceipt>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> driver_outcomereceipt([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_emissioncontext(values: List<&2,NativeRunTypes.EmissionContext>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.EmissionContext{v0,v1} <> Nil{}: 0n <> driver_context([v0],maybe_driver_outcomereceipt([v1],suffix))
    case _: 999999n <> suffix

def maybe_nativeruntypes_emissioncontext(values: List<&2,Maybe<&2,NativeRunTypes.EmissionContext>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> nativeruntypes_emissioncontext([value],suffix)
    case _: 999999n <> suffix

def cacheruntime_fact(values: List<&2,CacheRuntime.Fact>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case CacheRuntime.Fact{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> cachescenario_offer([v0],v1 <> v2 <> cacheruntime_stage([v3],maybe_nat([v4],canonical_canonicalevent([v5],suffix))))
    case _: 999999n <> suffix

def nativeruntypes_input(values: List<&2,NativeRunTypes.Input>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.Arrival{v0,v1} <> Nil{}: 0n <> workload_emission([v0],v1 <> suffix)
    case NativeRunTypes.Edit{v0} <> Nil{}: 1n <> nativeruntypes_job([v0],suffix)
    case NativeRunTypes.Event{v0,v1,v2,v3} <> Nil{}: 2n <> driver_action([v0],maybe_nativeruntypes_job([v1],maybe_nativeruntypes_emissioncontext([v2],maybe_driver_sourcejob([v3],suffix))))
    case NativeRunTypes.CacheFact{v0} <> Nil{}: 3n <> cacheruntime_fact([v0],suffix)
    case NativeRunTypes.FinishInput{v0,v1,v2,v3} <> Nil{}: 4n <> driver_action([v0],nativeruntypes_job([v1],v2 <> maybe_nativeruntypes_emissioncontext([v3],suffix)))
    case NativeRunTypes.GraphFact{v0,v1,v2,v3} <> Nil{}: 5n <> types_graphkey([v0],v1 <> importgraph_graphevent([v2],importgraph_limits([v3],suffix)))
    case _: 999999n <> suffix

def nativeruntypes_item(values: List<&2,NativeRunTypes.Item>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.Item{v0,v1} <> Nil{}: 0n <> v0 <> nativeruntypes_input([v1],suffix)
    case _: 999999n <> suffix

def list_nativeruntypes_item_items(values: List<&2,List<&2,NativeRunTypes.Item>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_item([head],list_nativeruntypes_item_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_item(values: List<&2,List<&2,NativeRunTypes.Item>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.Item,value) <> list_nativeruntypes_item_items([value],suffix)
    case _: 999999n <> suffix

def list_canonical_state_items(values: List<&2,List<&2,Canonical.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: canonical_state([head],list_canonical_state_items([tail],suffix))
    case _: 999999n <> suffix

def list_canonical_state(values: List<&2,List<&2,Canonical.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Canonical.State,value) <> list_canonical_state_items([value],suffix)
    case _: 999999n <> suffix

def maybe_canonical_reason(values: List<&2,Maybe<&2,Canonical.Reason>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> canonical_reason([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_storedjob(values: List<&2,NativeRunTypes.StoredJob>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.StoredJob{v0,v1} <> Nil{}: 0n <> v0 <> nativeruntypes_job([v1],suffix)
    case _: 999999n <> suffix

def list_nativeruntypes_storedjob_items(values: List<&2,List<&2,NativeRunTypes.StoredJob>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_storedjob([head],list_nativeruntypes_storedjob_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_storedjob(values: List<&2,List<&2,NativeRunTypes.StoredJob>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.StoredJob,value) <> list_nativeruntypes_storedjob_items([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_issuedrequest(values: List<&2,NativeRunTypes.IssuedRequest>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.IssuedRequest{v0,v1} <> Nil{}: 0n <> v0 <> canonical_command([v1],suffix)
    case _: 999999n <> suffix

def list_nativeruntypes_issuedrequest_items(values: List<&2,List<&2,NativeRunTypes.IssuedRequest>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_issuedrequest([head],list_nativeruntypes_issuedrequest_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_issuedrequest(values: List<&2,List<&2,NativeRunTypes.IssuedRequest>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.IssuedRequest,value) <> list_nativeruntypes_issuedrequest_items([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_retainedcallback(values: List<&2,NativeRunTypes.RetainedCallback>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.RetainedCallback{v0,v1,v2,v3,v4} <> Nil{}: 0n <> v0 <> v1 <> v2 <> nativeruntypes_input([v3],callbacks_fact([v4],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_retainedcallback_items(values: List<&2,List<&2,NativeRunTypes.RetainedCallback>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_retainedcallback([head],list_nativeruntypes_retainedcallback_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_retainedcallback(values: List<&2,List<&2,NativeRunTypes.RetainedCallback>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.RetainedCallback,value) <> list_nativeruntypes_retainedcallback_items([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_hostfacts(values: List<&2,NativeRunTypes.HostFacts>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.HostFacts{v0,v1,v2} <> Nil{}: 0n <> list_nativeruntypes_issuedrequest([v0],list_nativeruntypes_retainedcallback([v1],list_nat([v2],suffix)))
    case _: 999999n <> suffix

def nativeruntypes_runtimesnapshot(values: List<&2,NativeRunTypes.RuntimeSnapshot>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.RuntimeSnapshot{v0,v1,v2,v3,v4,v5,v6,v7,v8} <> Nil{}: 0n <> list_types_state([v0],list_nativeruntypes_item([v1],v2 <> v3 <> v4 <> nativeruntypes_environment([v5],boolean(v6,list_nativeruntypes_storedjob([v7],nativeruntypes_hostfacts([v8],suffix))))))
    case _: 999999n <> suffix

def list_nativeruntypes_emissioncontext_items(values: List<&2,List<&2,NativeRunTypes.EmissionContext>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_emissioncontext([head],list_nativeruntypes_emissioncontext_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_emissioncontext(values: List<&2,List<&2,NativeRunTypes.EmissionContext>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.EmissionContext,value) <> list_nativeruntypes_emissioncontext_items([value],suffix)
    case _: 999999n <> suffix

def maybe_callbacks_fact(values: List<&2,Maybe<&2,Callbacks.Fact>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> callbacks_fact([value],suffix)
    case _: 999999n <> suffix

def maybe_driver_action(values: List<&2,Maybe<&2,Driver.Action>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> driver_action([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_physicaldelivery(values: List<&2,NativeRunTypes.PhysicalDelivery>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.PhysicalDelivery{v0,v1,v2} <> Nil{}: 0n <> nativeruntypes_runtimesnapshot([v0],nativeruntypes_runtimesnapshot([v1],maybe_driver_action([v2],suffix)))
    case _: 999999n <> suffix

def list_nativeruntypes_physicaldelivery_items(values: List<&2,List<&2,NativeRunTypes.PhysicalDelivery>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_physicaldelivery([head],list_nativeruntypes_physicaldelivery_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_physicaldelivery(values: List<&2,List<&2,NativeRunTypes.PhysicalDelivery>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.PhysicalDelivery,value) <> list_nativeruntypes_physicaldelivery_items([value],suffix)
    case _: 999999n <> suffix

def list_maybe_nat_items(values: List<&2,List<&2,Maybe<&2,Nat>>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: maybe_nat([head],list_maybe_nat_items([tail],suffix))
    case _: 999999n <> suffix

def list_maybe_nat(values: List<&2,List<&2,Maybe<&2,Nat>>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,Maybe<&2,Nat>,value) <> list_maybe_nat_items([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_consumedinput(values: List<&2,NativeRunTypes.ConsumedInput>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.ConsumedInput{v0,v1,v2} <> Nil{}: 0n <> v0 <> nativeruntypes_input([v1],maybe_nat([v2],suffix))
    case _: 999999n <> suffix

def maybe_nativeruntypes_consumedinput(values: List<&2,Maybe<&2,NativeRunTypes.ConsumedInput>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case None{} <> Nil{}: 0n <> suffix
    case Some{value} <> Nil{}: 1n <> nativeruntypes_consumedinput([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_framedetails(values: List<&2,NativeRunTypes.FrameDetails>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.FrameDetails{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9} <> Nil{}: 0n <> nativeruntypes_runtimesnapshot([v0],nativeruntypes_runtimesnapshot([v1],list_nativeruntypes_emissioncontext([v2],maybe_nativeruntypes_emissioncontext([v3],list_types_state([v4],maybe_callbacks_fact([v5],list_nativeruntypes_physicaldelivery([v6],maybe_nat([v7],list_maybe_nat([v8],maybe_nativeruntypes_consumedinput([v9],suffix))))))))))
    case _: 999999n <> suffix

def list_importgraph_bounded_items(values: List<&2,List<&2,ImportGraph.Bounded>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: importgraph_bounded([head],list_importgraph_bounded_items([tail],suffix))
    case _: 999999n <> suffix

def list_importgraph_bounded(values: List<&2,List<&2,ImportGraph.Bounded>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,ImportGraph.Bounded,value) <> list_importgraph_bounded_items([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_frame(values: List<&2,NativeRunTypes.Frame>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.ProductFrame{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 0n <> v0 <> v1 <> canonical_canonicalevent([v2],list_canonical_state([v3],list_canonical_state([v4],list_canonical_command([v5],maybe_canonical_reason([v6],nativeruntypes_framedetails([v7],suffix))))))
    case NativeRunTypes.GraphFrame{v0,v1,v2,v3,v4,v5,v6,v7,v8} <> Nil{}: 1n <> v0 <> v1 <> types_graphkey([v2],v3 <> importgraph_graphevent([v4],list_importgraph_bounded([v5],list_importgraph_bounded([v6],importgraph_command([v7],nativeruntypes_framedetails([v8],suffix))))))
    case _: 999999n <> suffix

def list_nativeruntypes_frame_items(values: List<&2,List<&2,NativeRunTypes.Frame>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_frame([head],list_nativeruntypes_frame_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_frame(values: List<&2,List<&2,NativeRunTypes.Frame>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.Frame,value) <> list_nativeruntypes_frame_items([value],suffix)
    case _: 999999n <> suffix

def nativeruntypes_state(values: List<&2,NativeRunTypes.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case NativeRunTypes.State{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10} <> Nil{}: 0n <> list_types_state([v0],list_nativeruntypes_item([v1],v2 <> v3 <> v4 <> nativeruntypes_environment([v5],list_nativeruntypes_frame([v6],boolean(v7,list_nativeruntypes_emissioncontext([v8],list_nativeruntypes_storedjob([v9],nativeruntypes_hostfacts([v10],suffix))))))))
    case _: 999999n <> suffix

def list_nativeruntypes_state_items(values: List<&2,List<&2,NativeRunTypes.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: nativeruntypes_state([head],list_nativeruntypes_state_items([tail],suffix))
    case _: 999999n <> suffix

def list_nativeruntypes_state(values: List<&2,List<&2,NativeRunTypes.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,NativeRunTypes.State,value) <> list_nativeruntypes_state_items([value],suffix)
    case _: 999999n <> suffix

def defensemodel_tower(values: List<&2,DefenseModel.Tower>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseModel.Tower{v0,v1,v2,v3,v4,v5,v6,v7} <> Nil{}: 0n <> U32.to_nat(v0) <> U32.to_nat(v1) <> U32.to_nat(v2) <> U32.to_nat(v3) <> U32.to_nat(v4) <> U32.to_nat(v5) <> v6 <> U32.to_nat(v7) <> suffix
    case _: 999999n <> suffix

def list_defensemodel_tower_items(values: List<&2,List<&2,DefenseModel.Tower>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemodel_tower([head],list_defensemodel_tower_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemodel_tower(values: List<&2,List<&2,DefenseModel.Tower>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseModel.Tower,value) <> list_defensemodel_tower_items([value],suffix)
    case _: 999999n <> suffix

def defensemodel_timer(values: List<&2,DefenseModel.Timer>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseModel.Timer{v0,v1,v2,v3,v4,v5,v6,v7,v8} <> Nil{}: 0n <> v0 <> U32.to_nat(v1) <> U32.to_nat(v2) <> v3 <> U32.to_nat(v4) <> U32.to_nat(v5) <> U32.to_nat(v6) <> U32.to_nat(v7) <> U32.to_nat(v8) <> suffix
    case _: 999999n <> suffix

def list_defensemodel_timer_items(values: List<&2,List<&2,DefenseModel.Timer>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemodel_timer([head],list_defensemodel_timer_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemodel_timer(values: List<&2,List<&2,DefenseModel.Timer>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseModel.Timer,value) <> list_defensemodel_timer_items([value],suffix)
    case _: 999999n <> suffix

def defenseauto_state(values: List<&2,DefenseAuto.State>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseAuto.Activity{v0} <> Nil{}: 0n <> boolean(v0,suffix)
    case _: 999999n <> suffix

def list_defenseauto_state_items(values: List<&2,List<&2,DefenseAuto.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defenseauto_state([head],list_defenseauto_state_items([tail],suffix))
    case _: 999999n <> suffix

def list_defenseauto_state(values: List<&2,List<&2,DefenseAuto.State>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseAuto.State,value) <> list_defenseauto_state_items([value],suffix)
    case _: 999999n <> suffix

def defensemodel_cue(values: List<&2,DefenseModel.Cue>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseModel.Cue{v0,v1,v2,v3,v4,v5} <> Nil{}: 0n <> U32.to_nat(v0) <> v1 <> v2 <> U32.to_nat(v3) <> U32.to_nat(v4) <> U32.to_nat(v5) <> suffix
    case _: 999999n <> suffix

def list_defensemodel_cue_items(values: List<&2,List<&2,DefenseModel.Cue>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemodel_cue([head],list_defensemodel_cue_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemodel_cue(values: List<&2,List<&2,DefenseModel.Cue>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseModel.Cue,value) <> list_defensemodel_cue_items([value],suffix)
    case _: 999999n <> suffix

def defensemotiontypes_workidentity(values: List<&2,DefenseMotionTypes.WorkIdentity>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseMotionTypes.WorkIdentity{v0,v1,v2,v3} <> Nil{}: 0n <> v0 <> v1 <> v2 <> v3 <> suffix
    case _: 999999n <> suffix

def defensemotiontypes_waypoint(values: List<&2,DefenseMotionTypes.Waypoint>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseMotionTypes.Waypoint{v0,v1,v2,v3} <> Nil{}: 0n <> U32.to_nat(v0) <> U32.to_nat(v1) <> U32.to_nat(v2) <> v3 <> suffix
    case _: 999999n <> suffix

def list_defensemotiontypes_waypoint_items(values: List<&2,List<&2,DefenseMotionTypes.Waypoint>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemotiontypes_waypoint([head],list_defensemotiontypes_waypoint_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemotiontypes_waypoint(values: List<&2,List<&2,DefenseMotionTypes.Waypoint>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseMotionTypes.Waypoint,value) <> list_defensemotiontypes_waypoint_items([value],suffix)
    case _: 999999n <> suffix

def list_defensemotiontypes_workidentity_items(values: List<&2,List<&2,DefenseMotionTypes.WorkIdentity>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemotiontypes_workidentity([head],list_defensemotiontypes_workidentity_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemotiontypes_workidentity(values: List<&2,List<&2,DefenseMotionTypes.WorkIdentity>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseMotionTypes.WorkIdentity,value) <> list_defensemotiontypes_workidentity_items([value],suffix)
    case _: 999999n <> suffix

def defensemotiontypes_actor(values: List<&2,DefenseMotionTypes.Actor>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseMotionTypes.Actor{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10} <> Nil{}: 0n <> defensemotiontypes_workidentity([v0],v1 <> U32.to_nat(v2) <> U32.to_nat(v3) <> U32.to_nat(v4) <> U32.to_nat(v5) <> U32.to_nat(v6) <> list_defensemotiontypes_waypoint([v7],U32.to_nat(v8) <> list_defensemotiontypes_workidentity([v9],v10 <> suffix)))
    case _: 999999n <> suffix

def list_defensemotiontypes_actor_items(values: List<&2,List<&2,DefenseMotionTypes.Actor>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemotiontypes_actor([head],list_defensemotiontypes_actor_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemotiontypes_actor(values: List<&2,List<&2,DefenseMotionTypes.Actor>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseMotionTypes.Actor,value) <> list_defensemotiontypes_actor_items([value],suffix)
    case _: 999999n <> suffix

def defensemodel_settings(values: List<&2,DefenseModel.Settings>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseModel.Settings{v0,v1,v2} <> Nil{}: 0n <> v0 <> v1 <> U32.to_nat(v2) <> suffix
    case _: 999999n <> suffix

def list_defensemodel_settings_items(values: List<&2,List<&2,DefenseModel.Settings>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemodel_settings([head],list_defensemodel_settings_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemodel_settings(values: List<&2,List<&2,DefenseModel.Settings>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseModel.Settings,value) <> list_defensemodel_settings_items([value],suffix)
    case _: 999999n <> suffix

def defensemodel_control(values: List<&2,DefenseModel.Control>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseModel.Control{v0,v1,v2,v3,v4} <> Nil{}: 0n <> list_defenseauto_state([v0],U32.to_nat(v1) <> list_defensemodel_cue([v2],list_defensemotiontypes_actor([v3],list_defensemodel_settings([v4],suffix))))
    case _: 999999n <> suffix

def list_defensemodel_control_items(values: List<&2,List<&2,DefenseModel.Control>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemodel_control([head],list_defensemodel_control_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemodel_control(values: List<&2,List<&2,DefenseModel.Control>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseModel.Control,value) <> list_defensemodel_control_items([value],suffix)
    case _: 999999n <> suffix

def defensemodel_world(values: List<&2,DefenseModel.World>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseModel.World{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16,v17,v18,v19} <> Nil{}: 0n <> list_nativeruntypes_state([v0],U32.to_nat(v1) <> boolean(v2,U32.to_nat(v3) <> U32.to_nat(v4) <> U32.to_nat(v5) <> U32.to_nat(v6) <> list_defensemodel_tower([v7],list_defensemodel_timer([v8],boolean(v9,U32.to_nat(v10) <> U32.to_nat(v11) <> U32.to_nat(v12) <> U32.to_nat(v13) <> list_defensemodel_control([v14],U32.to_nat(v15) <> U32.to_nat(v16) <> U32.to_nat(v17) <> U32.to_nat(v18) <> U32.to_nat(v19) <> suffix))))))
    case _: 999999n <> suffix

def list_defensemodel_world_items(values: List<&2,List<&2,DefenseModel.World>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defensemodel_world([head],list_defensemodel_world_items([tail],suffix))
    case _: 999999n <> suffix

def list_defensemodel_world(values: List<&2,List<&2,DefenseModel.World>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseModel.World,value) <> list_defensemodel_world_items([value],suffix)
    case _: 999999n <> suffix

def defenseconsumerobserved_ticksnapshot(values: List<&2,DefenseConsumerObserved.TickSnapshot>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseConsumerObserved.TickSnapshot{v0,v1,v2,v3} <> Nil{}: 0n <> list_nativeruntypes_state([v0],list_nativeruntypes_state([v1],list_nativeruntypes_frame([v2],list_nativeruntypes_physicaldelivery([v3],suffix))))
    case _: 999999n <> suffix

def list_defenseconsumerobserved_ticksnapshot_items(values: List<&2,List<&2,DefenseConsumerObserved.TickSnapshot>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defenseconsumerobserved_ticksnapshot([head],list_defenseconsumerobserved_ticksnapshot_items([tail],suffix))
    case _: 999999n <> suffix

def list_defenseconsumerobserved_ticksnapshot(values: List<&2,List<&2,DefenseConsumerObserved.TickSnapshot>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseConsumerObserved.TickSnapshot,value) <> list_defenseconsumerobserved_ticksnapshot_items([value],suffix)
    case _: 999999n <> suffix

def defenseconsumerbatches_batch(values: List<&2,DefenseConsumerBatches.Batch>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case DefenseConsumerBatches.GameBatch{v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11} <> Nil{}: 0n <> nativeruntypes_config([v0],v1 <> v2 <> list_defenseconsumerobserved_input([v3],v4 <> defenseconsumerobserved_input([v5],list_defensemodel_world([v6],list_defensemodel_world([v7],v8 <> list_defenseconsumerobserved_ticksnapshot([v9],boolean(v10,list_defensemodel_world([v11],suffix))))))))
    case _: 999999n <> suffix

def list_defenseconsumerbatches_batch_items(values: List<&2,List<&2,DefenseConsumerBatches.Batch>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{} <> Nil{}: suffix
    case Con{head,tail} <> Nil{}: defenseconsumerbatches_batch([head],list_defenseconsumerbatches_batch_items([tail],suffix))
    case _: 999999n <> suffix

def list_defenseconsumerbatches_batch(values: List<&2,List<&2,DefenseConsumerBatches.Batch>>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case +value <> Nil{}: List.length(&2,DefenseConsumerBatches.Batch,value) <> list_defenseconsumerbatches_batch_items([value],suffix)
    case _: 999999n <> suffix

def game_consumer(values: List<&2,DefenseConsumerBatches.Batch>, suffix: List<&2,Nat>) -> List<&2,Nat>:
  list_defenseconsumerbatches_batch([values],suffix)

def number_prefix(comma: Bool, value: Nat, suffix: String) -> String:
  match comma:
    case False{}: String.append(Nat.show(value),suffix)
    case True{}: String.append(Nat.show(value),String.append(",",suffix))

# A long owner envelope must not retain one JS call per word, or append the
# closing bracket through a long left String. Reverse once, then prepend only
# bounded decimal chunks into the accumulator, preserving every original word.
def number_fold(value: List<&2,Nat>, suffix: String, comma: Bool) -> String:
  match value:
    case Nil{}: suffix
    case head <> tail: number_fold(tail,number_prefix(comma,head,suffix),True{})

def render(value: List<&2,Nat>) -> String:
  String.append("[",number_fold(List.reverse(&2,Nat,value),"]",False{}))
