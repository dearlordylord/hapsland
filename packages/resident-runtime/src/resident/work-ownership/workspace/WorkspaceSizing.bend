import Base

# Workspace policy selects every ordered primitive; native values stay in host registers.
# 0=path, 1=original source bytes, 2=preflight, 3=rules. Capture default uses register 5.
type Mode is Data:
  WorkspaceCapture{}
  WorkspaceAnalysis{}
type Primitive is Data:
  WorkspaceIdentity{}
  WorkspaceIsUndefined{}
  WorkspaceIsNullish{}
  WorkspaceSafeInteger{}
  WorkspaceLess{}
  WorkspaceGreater{}
  WorkspaceTruthy{}
  WorkspaceMeasure{}
  WorkspaceMultiply{}
  WorkspaceAdd{}
type Literal is Data:
  WorkspaceMaxSource{}
  WorkspaceMaxDeclarations{}
  WorkspaceZero{}
  WorkspaceEight{}
  WorkspaceFour{}
  WorkspaceMetadataMargin{}
  WorkspaceAnalysisMargin{}
  WorkspaceImportWorkspace{}
type Operation is Data:
  WorkspaceConstant{target: Nat, value: Literal}
  WorkspaceReadOptional{target: Nat, source: Nat, field: String}
  WorkspaceCall{target: Nat, primitive: Primitive, arguments: List<&2, Nat>}
  WorkspaceBranch{
    primitive: Primitive,
    arguments: List<&2, Nat>,
    yes: List<&2, Operation>,
    no: List<&2, Operation>
  }
  WorkspaceInvalidSource{}
type Step is Data:
  WorkspaceAwait{operation: Operation, remaining: List<&2, Operation>, result: Nat}
  WorkspaceDone{result: Nat}
  WorkspaceRejected{}
type Reply is Data:
  WorkspaceAck{}
  WorkspaceFlag{value: Bool}

def next(operations: List<&2, Operation>, result: Nat) -> Step:
  match operations:
    case Nil{}: WorkspaceDone{result}
    case operation <> remaining: WorkspaceAwait{operation, remaining, result}

def capture_recipe() -> List<&2, Operation>:
  [
    WorkspaceCall{5n, WorkspaceIdentity{}, [1n]},
    WorkspaceBranch{WorkspaceIsUndefined{}, [5n],
      [WorkspaceConstant{5n, WorkspaceMaxSource{}}], []},
    WorkspaceBranch{WorkspaceSafeInteger{}, [5n], [], [WorkspaceInvalidSource{}]},
    WorkspaceConstant{6n, WorkspaceZero{}},
    WorkspaceBranch{WorkspaceLess{}, [5n, 6n], [WorkspaceInvalidSource{}], []},
    WorkspaceConstant{7n, WorkspaceMaxSource{}},
    WorkspaceBranch{WorkspaceGreater{}, [5n, 7n], [WorkspaceInvalidSource{}], []},
    WorkspaceConstant{8n, WorkspaceEight{}},
    WorkspaceCall{9n, WorkspaceMultiply{}, [8n, 5n]},
    WorkspaceConstant{10n, WorkspaceMaxDeclarations{}},
    WorkspaceCall{11n, WorkspaceMeasure{}, [0n]},
    WorkspaceConstant{12n, WorkspaceMetadataMargin{}},
    WorkspaceCall{13n, WorkspaceAdd{}, [11n, 12n]},
    WorkspaceCall{14n, WorkspaceMultiply{}, [10n, 13n]},
    WorkspaceCall{20n, WorkspaceAdd{}, [9n, 14n]}
  ]

def analysis_recipe() -> List<&2, Operation>:
  List.append(&2, Operation, [
    WorkspaceReadOptional{4n, 2n, "declarations"},
    WorkspaceBranch{WorkspaceIsNullish{}, [4n],
      [WorkspaceConstant{4n, WorkspaceMaxDeclarations{}}], []}
  ], List.append(&2, Operation, capture_recipe(), [
    WorkspaceReadOptional{21n, 2n, "hasImports"},
    WorkspaceBranch{WorkspaceTruthy{}, [21n],
      [WorkspaceConstant{22n, WorkspaceImportWorkspace{}}],
      [WorkspaceConstant{22n, WorkspaceZero{}}]},
    WorkspaceCall{23n, WorkspaceAdd{}, [20n, 22n]},
    WorkspaceReadOptional{24n, 2n, "expandedUnitBytes"},
    WorkspaceBranch{WorkspaceIsNullish{}, [24n], [
      WorkspaceConstant{25n, WorkspaceMaxDeclarations{}},
      WorkspaceConstant{26n, WorkspaceMaxSource{}},
      WorkspaceCall{24n, WorkspaceMultiply{}, [25n, 26n]}
    ], []},
    WorkspaceCall{27n, WorkspaceAdd{}, [23n, 24n]},
    WorkspaceCall{28n, WorkspaceMeasure{}, [3n]},
    WorkspaceCall{29n, WorkspaceAdd{}, [28n, 1n]},
    WorkspaceConstant{30n, WorkspaceFour{}},
    WorkspaceCall{31n, WorkspaceMeasure{}, [0n]},
    WorkspaceCall{32n, WorkspaceMultiply{}, [30n, 31n]},
    WorkspaceCall{33n, WorkspaceAdd{}, [29n, 32n]},
    WorkspaceConstant{34n, WorkspaceAnalysisMargin{}},
    WorkspaceCall{35n, WorkspaceAdd{}, [33n, 34n]},
    WorkspaceCall{36n, WorkspaceMultiply{}, [4n, 35n]},
    WorkspaceCall{35n, WorkspaceAdd{}, [27n, 36n]}
  ]))

def initial(mode: Mode) -> Step:
  match mode:
    case WorkspaceCapture{}: next(capture_recipe(), 20n)
    case WorkspaceAnalysis{}: next(analysis_recipe(), 35n)

def reply_operation(
  operation: Operation,
  remaining: List<&2, Operation>,
  result: Nat,
  reply: Reply
) -> Step:
  match operation reply:
    case WorkspaceBranch{_, _, yes, _} WorkspaceFlag{True{}}: next(
      List.append(&2, Operation, yes, remaining),
      result
    )
    case WorkspaceBranch{_, _, _, no} WorkspaceFlag{False{}}: next(
      List.append(&2, Operation, no, remaining),
      result
    )
    case WorkspaceConstant{_, _} WorkspaceAck{}: next(remaining, result)
    case WorkspaceReadOptional{_, _, _} WorkspaceAck{}: next(remaining, result)
    case WorkspaceCall{_, _, _} WorkspaceAck{}: next(remaining, result)
    case _ _: WorkspaceRejected{}

def resume(step: Step, reply: Reply) -> Step:
  match step:
    case WorkspaceAwait{operation, remaining, result}: reply_operation(
      operation,
      remaining,
      result,
      reply
    )
    case _: WorkspaceRejected{}
