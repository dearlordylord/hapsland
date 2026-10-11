import Base

# Outer resident candidate scope. Each handle gets a fresh Preparation child;
# source-bearing inputs and external effects remain in the host. This cursor
# starts after the existing pre-loop admission/root/credential gates.
type UnavailableReason is Data:
  StaleRound{}
  WrongStage{}
type WorkspaceRefusal is Data:
  CapacityRefused{}
  Unavailable{reason: UnavailableReason}
  InvalidMeasurement{}
type CandidateDiagnostic is Data:
  WorkspaceCapacity{requested_bytes: Nat}
  WorkspaceUnavailable{reason: UnavailableReason}
  WorkspacePanic{}
type CandidateAnalytics is Data:
  CapacityRejected{}
  PreparationFailed{}
type Command is Data:
  StartPolicySource{}
  StartObservation{}
  AwaitBackendGate{}
  ReadRuntimeActive{}
  DecodeControlled{}
  ReadCredentialRequired{}
  CheckCredentialShape{}
  VerifyObservationRoot{}
  CheckCredentialGeneration{}
  ReleaseJobReservation{early: Bool}
  CheckJobActive{}
  RecordPreparationFailureAnalytics{}
  RecordUnavailableActivity{}
  ReadEffectiveAnalytics{}
  CheckCandidateActive{candidate: Nat}
  AdmitCandidateWorkspace{candidate: Nat}
  PrepareCandidate{candidate: Nat, preparation: Nat}
  ObserveCandidateDiagnostic{candidate: Nat, diagnostic: CandidateDiagnostic}
  RejectCandidateCapacity{}
  RecordCandidateAnalytics{outcome: CandidateAnalytics}
  RecordCandidateUnavailable{}
  ReadExpectedActivity{}
  RecordPendingActivity{identities: List<&2, Nat>}
  CompletePolicySource{}
  CompleteObservation{}
  AfterPrepare{}
type Response is Data:
  GateAccepted{value: Bool}
  ExpectedActivity{identities: List<&2, Nat>}
  Active{value: Bool}
  WorkspaceAdmitted{preparation: Nat}
  WorkspaceRefused{reason: WorkspaceRefusal, requested_bytes: Nat}
  ObservationCommittedCancelled{token: Nat}
  ObservationCommittedFailure{token: Nat}
  ObservationCommittedDefect{token: Nat, recoverable: Bool}
  CandidateContinued{value: Bool}
  Ack{}
  CompletionAccepted{value: Bool}
  Failed{token: Nat}
  Defect{token: Nat, interrupted: Bool, recoverable: Bool}
  Cancelled{token: Nat}
type GatePhase is Data:
  PolicyStart{}
  ObservationStart{}
  Backend{}
  RuntimeFirst{}
  Controlled{}
  Required{}
  Shape{}
  Root{}
  Generation{}
  ReleaseNormal{}
  RuntimeSecond{}
  JobActive{}
  Analytics{}
  FailureAnalytics{}
  FailureActivity{}
  ReleaseEarly{}
  RecoveryAnalytics{}
  RecoveryRelease{}
  RecoveryRuntime{}
  RecoveryActivity{}
type Gate is Data:
  Gate{candidates: List<&2, Nat>, controlled_present: Bool, phase: GatePhase, reason: Maybe<&2, Reason>}

type Phase is Data:
  GatePending{gate: Gate}
  RecoveryPending{phase: GatePhase, reason: Reason}
  CandidateChecking{candidate: Nat, remaining: List<&2, Nat>}
  WorkspacePending{candidate: Nat, remaining: List<&2, Nat>}
  RefusalDiagnostic{candidate: Nat, remaining: List<&2, Nat>, capacity: Bool, analytics: CandidateAnalytics}
  RefusalCapacity{candidate: Nat, remaining: List<&2, Nat>}
  RefusalAnalytics{candidate: Nat, remaining: List<&2, Nat>}
  RefusalActivity{candidate: Nat, remaining: List<&2, Nat>}
  CandidatePending{candidate: Nat, remaining: List<&2, Nat>}
  DefectDiagnostic{token: Nat, recoverable: Bool}
  ExpectedPending{}
  ActivityPending{}
  PolicyPending{}
  ObservationPending{}
  BarrierPending{}
type State is Data:
  State{invocation: Nat, next: Nat, policy_required: Bool, completed: Bool, phase: Phase}
type Request is Data:
  Request{invocation: Nat, id: Nat, command: Command}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, response: Response}
type Reason is Data:
  StartRefused{}
  SourceInactive{}
  SettingsRefused{}
  CandidateStopped{}
  PolicyRefused{}
  ObservationRefused{}
  TechnicalFailure{token: Nat}
  DefectFailure{token: Nat}
  InvocationCancelled{token: Nat}
  ProtocolFailure{}
type Step is Data:
  Await{state: State, request: Request}
  Finished{}
  Stopped{completed: Bool, reason: Reason}
  Rejected{}

def await_command(+invocation: Nat, +next: Nat, policy_required: Bool, completed: Bool, phase: Phase, command: Command) -> Step:
  Await{State{invocation, Nat.add(next, 1n), policy_required, completed, phase}, Request{invocation, next, command}}

def next_candidate(+invocation: Nat, +next: Nat, +policy_required: Bool, remaining: List<&2, Nat>) -> Step:
  match remaining:
    case Nil{}: await_command(invocation, next, policy_required, False{}, ExpectedPending{}, ReadExpectedActivity{})
    case +candidate <> rest: await_command(invocation, next, policy_required, False{}, CandidateChecking{candidate, rest}, CheckCandidateActive{candidate})

def initial_after_gates(invocation: Nat, policy_required: Bool, candidates: List<&2, Nat>) -> Step:
  next_candidate(invocation, 0n, policy_required, candidates)

def policy_next(bound: Bool, invocation: Nat, next: Nat) -> Step:
  match bound:
    case True{}: await_command(invocation, next, True{}, False{}, PolicyPending{}, CompletePolicySource{})
    case False{}: await_command(invocation, next, False{}, False{}, ObservationPending{}, CompleteObservation{})

def expected_activity(invocation: Nat, next: Nat, policy_required: Bool, +identities: List<&2, Nat>) -> Step:
  match identities:
    case Nil{}: policy_next(policy_required, invocation, next)
    case _ <> _: await_command(invocation, next, policy_required, False{}, ActivityPending{}, RecordPendingActivity{identities})

def workspace_refused(invocation: Nat, next: Nat, policy_required: Bool, +candidate: Nat, remaining: List<&2, Nat>, reason: WorkspaceRefusal, requested_bytes: Nat) -> Step:
  match reason:
    case CapacityRefused{}: await_command(invocation, next, policy_required, False{}, RefusalDiagnostic{candidate, remaining, True{}, CapacityRejected{}}, ObserveCandidateDiagnostic{candidate, WorkspaceCapacity{requested_bytes}})
    case Unavailable{reason}: await_command(invocation, next, policy_required, False{}, RefusalDiagnostic{candidate, remaining, False{}, PreparationFailed{}}, ObserveCandidateDiagnostic{candidate, WorkspaceUnavailable{reason}})
    case InvalidMeasurement{}: await_command(invocation, next, policy_required, False{}, RefusalDiagnostic{candidate, remaining, False{}, PreparationFailed{}}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})

def refusal_diagnostic_done(invocation: Nat, next: Nat, policy_required: Bool, candidate: Nat, remaining: List<&2, Nat>, capacity: Bool, analytics: CandidateAnalytics) -> Step:
  match capacity:
    case True{}: await_command(invocation, next, policy_required, False{}, RefusalCapacity{candidate, remaining}, RejectCandidateCapacity{})
    case False{}: await_command(invocation, next, policy_required, False{}, RefusalAnalytics{candidate, remaining}, RecordCandidateAnalytics{analytics})

def gate_command(phase: GatePhase) -> Command:
  match phase:
    case PolicyStart{}: StartPolicySource{}
    case ObservationStart{}: StartObservation{}
    case Backend{}: AwaitBackendGate{}
    case RuntimeFirst{}: ReadRuntimeActive{}
    case Controlled{}: DecodeControlled{}
    case Required{}: ReadCredentialRequired{}
    case Shape{}: CheckCredentialShape{}
    case Root{}: VerifyObservationRoot{}
    case Generation{}: CheckCredentialGeneration{}
    case ReleaseNormal{}: ReleaseJobReservation{False{}}
    case RuntimeSecond{}: ReadRuntimeActive{}
    case JobActive{}: CheckJobActive{}
    case Analytics{}: ReadEffectiveAnalytics{}
    case FailureAnalytics{}: RecordPreparationFailureAnalytics{}
    case FailureActivity{}: RecordUnavailableActivity{}
    case ReleaseEarly{}: ReleaseJobReservation{True{}}
    case RecoveryAnalytics{}: RecordPreparationFailureAnalytics{}
    case RecoveryRelease{}: ReleaseJobReservation{True{}}
    case RecoveryRuntime{}: ReadRuntimeActive{}
    case RecoveryActivity{}: RecordUnavailableActivity{}

def gate_await(invocation: Nat, next: Nat, policy_required: Bool, candidates: List<&2, Nat>, controlled: Bool, +phase: GatePhase, reason: Maybe<&2, Reason>) -> Step:
  await_command(invocation, next, policy_required, False{}, GatePending{Gate{candidates, controlled, phase, reason}}, gate_command(phase))

def initial(invocation: Nat, +policy_required: Bool, controlled_present: Bool, candidates: List<&2, Nat>) -> Step:
  gate_await(invocation, 0n, policy_required, candidates, controlled_present,
    Bool.pick(GatePhase, policy_required, PolicyStart{}, ObservationStart{}), None{})

def gate_stopped(reason: Maybe<&2, Reason>) -> Step:
  match reason:
    case Some{value}: Stopped{False{}, value}
    case None{}: Stopped{False{}, ProtocolFailure{}}

def gate_after_release(invocation: Nat, next: Nat, policy_required: Bool, candidates: List<&2, Nat>, controlled: Bool, +reason: Maybe<&2, Reason>) -> Step:
  match reason:
    case None{}: gate_await(invocation, next, policy_required, candidates, controlled, RuntimeSecond{}, None{})
    case Some{_}: gate_await(invocation, next, policy_required, candidates, controlled, FailureAnalytics{}, reason)

def gate_recovering(phase: GatePhase) -> Bool:
  match phase:
    case RecoveryAnalytics{}: True{}
    case RecoveryRelease{}: True{}
    case RecoveryRuntime{}: True{}
    case RecoveryActivity{}: True{}
    case _: False{}

def gate_error(recovering: Bool, invocation: Nat, next: Nat, policy_required: Bool, candidates: List<&2, Nat>, controlled: Bool, reason: Maybe<&2, Reason>, failure: Reason) -> Step:
  match recovering:
    case True{}: Stopped{False{}, failure}
    case False{}: gate_await(invocation, next, policy_required, candidates, controlled, RecoveryAnalytics{}, Some{failure})

def gate_reply(invocation: Nat, next: Nat, policy_required: Bool, gate: Gate, response: Response) -> Step:
  match gate response:
    case Gate{candidates, controlled, PolicyStart{}, _} GateAccepted{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ObservationStart{}, None{})
    case Gate{candidates, controlled, PolicyStart{}, _} GateAccepted{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseEarly{}, Some{StartRefused{}})
    case Gate{candidates, controlled, ObservationStart{}, _} GateAccepted{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, Backend{}, None{})
    case Gate{candidates, controlled, ObservationStart{}, _} GateAccepted{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseEarly{}, Some{StartRefused{}})
    case Gate{candidates, controlled, Backend{}, _} Ack{}:
      gate_await(invocation, next, policy_required, candidates, controlled, RuntimeFirst{}, None{})
    case Gate{candidates, controlled, RuntimeFirst{}, _} Active{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, Controlled{}, None{})
    case Gate{candidates, controlled, RuntimeFirst{}, _} Active{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseEarly{}, Some{SourceInactive{}})
    case Gate{candidates, controlled, Controlled{}, _} GateAccepted{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, Required{}, None{})
    case Gate{candidates, False{}, Controlled{}, _} GateAccepted{False{}}:
      gate_await(invocation, next, policy_required, candidates, False{}, Required{}, None{})
    case Gate{candidates, controlled, Controlled{}, _} GateAccepted{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseNormal{}, Some{SettingsRefused{}})
    case Gate{candidates, controlled, Required{}, _} Ack{}:
      gate_await(invocation, next, policy_required, candidates, controlled, Shape{}, None{})
    case Gate{candidates, controlled, Shape{}, _} GateAccepted{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, Root{}, None{})
    case Gate{candidates, controlled, Shape{}, _} GateAccepted{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseNormal{}, Some{SettingsRefused{}})
    case Gate{candidates, controlled, Root{}, _} GateAccepted{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, Generation{}, None{})
    case Gate{candidates, controlled, Root{}, _} GateAccepted{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseNormal{}, Some{SettingsRefused{}})
    case Gate{candidates, controlled, Generation{}, _} GateAccepted{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseNormal{}, None{})
    case Gate{candidates, controlled, Generation{}, _} GateAccepted{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, ReleaseNormal{}, Some{SettingsRefused{}})
    case Gate{candidates, controlled, RuntimeSecond{}, _} Active{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, JobActive{}, None{})
    case Gate{candidates, controlled, RuntimeSecond{}, _} Active{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, FailureAnalytics{}, Some{SourceInactive{}})
    case Gate{candidates, controlled, JobActive{}, _} Active{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, Analytics{}, None{})
    case Gate{candidates, controlled, JobActive{}, _} Active{False{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, FailureAnalytics{}, Some{SourceInactive{}})
    case Gate{candidates, controlled, ReleaseNormal{}, reason} Ack{}:
      gate_after_release(invocation, next, policy_required, candidates, controlled, reason)
    case Gate{candidates, _, Analytics{}, _} Ack{}: next_candidate(invocation, next, policy_required, candidates)
    case Gate{candidates, controlled, FailureAnalytics{}, reason} Ack{}:
      gate_await(invocation, next, policy_required, candidates, controlled, FailureActivity{}, reason)
    case Gate{_, _, FailureActivity{}, reason} Ack{}: gate_stopped(reason)
    case Gate{_, _, ReleaseEarly{}, reason} Ack{}: gate_stopped(reason)
    case Gate{candidates, controlled, RecoveryAnalytics{}, reason} Ack{}:
      gate_await(invocation, next, policy_required, candidates, controlled, RecoveryRelease{}, reason)
    case Gate{candidates, controlled, RecoveryRelease{}, reason} Ack{}:
      gate_await(invocation, next, policy_required, candidates, controlled, RecoveryRuntime{}, reason)
    case Gate{candidates, controlled, RecoveryRuntime{}, reason} Active{True{}}:
      gate_await(invocation, next, policy_required, candidates, controlled, RecoveryActivity{}, reason)
    case Gate{_, _, RecoveryRuntime{}, reason} Active{False{}}: gate_stopped(reason)
    case Gate{_, _, RecoveryActivity{}, reason} Ack{}: gate_stopped(reason)
    case Gate{candidates, controlled, phase, reason} Failed{token}:
      gate_error(gate_recovering(phase), invocation, next, policy_required, candidates, controlled, reason, TechnicalFailure{token})
    case Gate{candidates, controlled, phase, reason} Defect{token, _, True{}}:
      gate_error(gate_recovering(phase), invocation, next, policy_required, candidates, controlled, reason, TechnicalFailure{token})
    case Gate{_, _, _, _} Defect{token, _, False{}}: Stopped{False{}, DefectFailure{token}}
    case Gate{_, _, _, _} Cancelled{token}: Stopped{False{}, InvocationCancelled{token}}
    case _ _: Rejected{}

def recovery_await(invocation: Nat, next: Nat, policy_required: Bool, completed: Bool, +phase: GatePhase, reason: Reason) -> Step:
  await_command(invocation, next, policy_required, completed, RecoveryPending{phase, reason}, gate_command(phase))

def recovery_reply(invocation: Nat, next: Nat, policy_required: Bool, completed: Bool, phase: GatePhase, reason: Reason, response: Response) -> Step:
  match phase response:
    case RecoveryAnalytics{} Ack{}: recovery_await(invocation, next, policy_required, completed, RecoveryRelease{}, reason)
    case RecoveryRelease{} Ack{}: recovery_await(invocation, next, policy_required, completed, RecoveryRuntime{}, reason)
    case RecoveryRuntime{} Active{True{}}: recovery_await(invocation, next, policy_required, completed, RecoveryActivity{}, reason)
    case RecoveryRuntime{} Active{False{}}: Stopped{completed, reason}
    case RecoveryActivity{} Ack{}: Stopped{completed, reason}
    case _ Defect{token, _, _}: Stopped{completed, DefectFailure{token}}
    case _ Failed{token}: Stopped{completed, TechnicalFailure{token}}
    case _ Cancelled{token}: Stopped{completed, InvocationCancelled{token}}
    case _ _: Rejected{}

def defect_finish(invocation: Nat, next: Nat, policy_required: Bool, completed: Bool, token: Nat, recoverable: Bool) -> Step:
  match recoverable:
    case True{}: recovery_await(invocation, next, policy_required, completed, RecoveryAnalytics{}, TechnicalFailure{token})
    case False{}: Stopped{completed, DefectFailure{token}}

def phase_reply(state: State, response: Response) -> Step:
  match state response:
    case State{invocation, next, policy_required, completed, RecoveryPending{phase, reason}} response:
      recovery_reply(invocation, next, policy_required, completed, phase, reason, response)
    case State{invocation, next, policy_required, _, GatePending{gate}} response:
      gate_reply(invocation, next, policy_required, gate, response)
    case State{invocation, next, policy_required, _, CandidateChecking{+candidate, remaining}} Active{True{}}:
      await_command(invocation, next, policy_required, False{}, WorkspacePending{candidate, remaining}, AdmitCandidateWorkspace{candidate})
    case State{_, _, _, completed, CandidateChecking{_, _}} Active{False{}}:
      Stopped{completed, CandidateStopped{}}
    case State{invocation, next, policy_required, _, WorkspacePending{+candidate, remaining}} WorkspaceAdmitted{preparation}:
      await_command(invocation, next, policy_required, False{}, CandidatePending{candidate, remaining}, PrepareCandidate{candidate, preparation})
    case State{invocation, next, policy_required, _, WorkspacePending{candidate, remaining}} WorkspaceRefused{reason, requested_bytes}:
      workspace_refused(invocation, next, policy_required, candidate, remaining, reason, requested_bytes)
    case State{invocation, next, policy_required, _, RefusalDiagnostic{candidate, remaining, capacity, analytics}} Ack{}:
      refusal_diagnostic_done(invocation, next, policy_required, candidate, remaining, capacity, analytics)
    case State{invocation, next, policy_required, _, RefusalCapacity{candidate, remaining}} Ack{}:
      await_command(invocation, next, policy_required, False{}, RefusalAnalytics{candidate, remaining}, RecordCandidateAnalytics{CapacityRejected{}})
    case State{invocation, next, policy_required, _, RefusalAnalytics{candidate, remaining}} Ack{}:
      await_command(invocation, next, policy_required, False{}, RefusalActivity{candidate, remaining}, RecordCandidateUnavailable{})
    case State{invocation, next, policy_required, _, RefusalActivity{candidate, remaining}} Ack{}:
      next_candidate(invocation, next, policy_required, remaining)
    case State{invocation, next, policy_required, completed, CandidateChecking{candidate, _}} Defect{token, False{}, recoverable}:
      await_command(invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})
    case State{invocation, next, policy_required, completed, WorkspacePending{candidate, _}} Defect{token, False{}, recoverable}:
      await_command(invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})
    case State{invocation, next, policy_required, completed, RefusalDiagnostic{candidate, _, _, _}} Defect{token, False{}, recoverable}:
      await_command(invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})
    case State{invocation, next, policy_required, completed, RefusalCapacity{candidate, _}} Defect{token, False{}, recoverable}:
      await_command(invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})
    case State{invocation, next, policy_required, completed, RefusalAnalytics{candidate, _}} Defect{token, False{}, recoverable}:
      await_command(invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})
    case State{invocation, next, policy_required, completed, RefusalActivity{candidate, _}} Defect{token, False{}, recoverable}:
      await_command(invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})
    case State{invocation, next, policy_required, completed, CandidatePending{candidate, _}} Defect{token, False{}, recoverable}:
      await_command(invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}, ObserveCandidateDiagnostic{candidate, WorkspacePanic{}})
    case State{invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}} Ack{}:
      defect_finish(invocation, next, policy_required, completed, token, recoverable)
    case State{invocation, next, policy_required, completed, DefectDiagnostic{_, _}} Defect{token, _, recoverable}:
      defect_finish(invocation, next, policy_required, completed, token, recoverable)
    case State{invocation, next, policy_required, completed, DefectDiagnostic{token, recoverable}} _:
      defect_finish(invocation, next, policy_required, completed, token, recoverable)
    case State{invocation, next, policy_required, _, CandidatePending{_, remaining}} CandidateContinued{True{}}:
      next_candidate(invocation, next, policy_required, remaining)
    case State{_, _, _, completed, CandidatePending{_, _}} CandidateContinued{False{}}:
      Stopped{completed, CandidateStopped{}}
    case State{invocation, next, policy_required, _, ExpectedPending{}} ExpectedActivity{identities}:
      expected_activity(invocation, next, policy_required, identities)
    case State{invocation, next, policy_required, _, ActivityPending{}} Ack{}:
      policy_next(policy_required, invocation, next)
    case State{invocation, next, policy_required, _, PolicyPending{}} CompletionAccepted{True{}}:
      await_command(invocation, next, policy_required, False{}, ObservationPending{}, CompleteObservation{})
    case State{invocation, next, policy_required, completed, PolicyPending{}} CompletionAccepted{False{}}:
      recovery_await(invocation, next, policy_required, completed, RecoveryAnalytics{}, PolicyRefused{})
    case State{invocation, next, policy_required, _, ObservationPending{}} CompletionAccepted{True{}}:
      await_command(invocation, next, policy_required, True{}, BarrierPending{}, AfterPrepare{})
    case State{_, _, _, _, ObservationPending{}} ObservationCommittedCancelled{token}: Stopped{True{}, InvocationCancelled{token}}
    case State{invocation, next, policy_required, _, ObservationPending{}} ObservationCommittedDefect{token, recoverable}:
      defect_finish(invocation, next, policy_required, True{}, token, recoverable)
    case State{invocation, next, policy_required, _, ObservationPending{}} ObservationCommittedFailure{token}:
      recovery_await(invocation, next, policy_required, True{}, RecoveryAnalytics{}, TechnicalFailure{token})
    case State{invocation, next, policy_required, completed, ObservationPending{}} CompletionAccepted{False{}}:
      recovery_await(invocation, next, policy_required, completed, RecoveryAnalytics{}, ObservationRefused{})
    case State{_, _, _, _, BarrierPending{}} Ack{}: Finished{}
    case State{invocation, next, policy_required, completed, _} Defect{token, _, recoverable}:
      defect_finish(invocation, next, policy_required, completed, token, recoverable)
    case State{invocation, next, policy_required, completed, _} Failed{token}: recovery_await(invocation, next, policy_required, completed, RecoveryAnalytics{}, TechnicalFailure{token})
    case State{_, _, _, completed, _} Cancelled{token}: Stopped{completed, InvocationCancelled{token}}
    case State{_, _, _, _, _} _: Rejected{}

def correlated(valid: Bool, state: State, response: Response) -> Step:
  match valid:
    case True{}: phase_reply(state, response)
    case False{}: Rejected{}

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Await{state, Request{invocation, id, _}} Reply{other, other_id, response}:
      correlated(Bool.and(Nat.is_eq(invocation, other), Nat.is_eq(id, other_id)), state, response)
    case _ _: Rejected{}

def permission(command: Command) -> Nat:
  match command:
    case StartPolicySource{}: 6n
    case StartObservation{}: 7n
    case ReleaseJobReservation{True{}}: 9n
    case AwaitBackendGate{}: 8n
    case ReadRuntimeActive{}: 9n
    case DecodeControlled{}: 8n
    case ReadCredentialRequired{}: 8n
    case CheckCredentialShape{}: 8n
    case VerifyObservationRoot{}: 8n
    case CheckCredentialGeneration{}: 8n
    case ReleaseJobReservation{False{}}: 8n
    case CheckJobActive{}: 8n
    case RecordPreparationFailureAnalytics{}: 9n
    case RecordUnavailableActivity{}: 9n
    case ReadEffectiveAnalytics{}: 8n
    case CheckCandidateActive{_}: 1n
    case AdmitCandidateWorkspace{_}: 1n
    case PrepareCandidate{_, _}: 1n
    case ObserveCandidateDiagnostic{_, _}: 1n
    case RejectCandidateCapacity{}: 1n
    case RecordCandidateAnalytics{_}: 1n
    case RecordCandidateUnavailable{}: 1n
    case ReadExpectedActivity{}: 2n
    case RecordPendingActivity{_}: 2n
    case CompletePolicySource{}: 3n
    case CompleteObservation{}: 4n
    case AfterPrepare{}: 5n
