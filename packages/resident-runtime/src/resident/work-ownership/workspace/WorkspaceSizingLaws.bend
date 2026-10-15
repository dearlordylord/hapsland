import Base
import ./WorkspaceSizing.bend as Workspace

# Registers retain native values. These laws pin ordered primitive execution,
# not a mathematical-real replacement for native IEEE arithmetic/coercion.
law capture_entry_exact:
  {Workspace.initial(Workspace.WorkspaceCapture{})
    == Workspace.next(Workspace.capture_recipe(), 20n) : Workspace.Step}

law analysis_entry_exact:
  {Workspace.initial(Workspace.WorkspaceAnalysis{})
    == Workspace.next(Workspace.analysis_recipe(), 35n) : Workspace.Step}

law capture_recipe_exact:
  {Workspace.capture_recipe() == [
    Workspace.WorkspaceCall{5n, Workspace.WorkspaceIdentity{}, [1n]},
    Workspace.WorkspaceBranch{Workspace.WorkspaceIsUndefined{}, [5n],
      [Workspace.WorkspaceConstant{5n, Workspace.WorkspaceMaxSource{}}], []},
    Workspace.WorkspaceBranch{Workspace.WorkspaceSafeInteger{}, [5n], [], [Workspace.WorkspaceInvalidSource{}]},
    Workspace.WorkspaceConstant{6n, Workspace.WorkspaceZero{}},
    Workspace.WorkspaceBranch{Workspace.WorkspaceLess{}, [5n, 6n], [Workspace.WorkspaceInvalidSource{}], []},
    Workspace.WorkspaceConstant{7n, Workspace.WorkspaceMaxSource{}},
    Workspace.WorkspaceBranch{Workspace.WorkspaceGreater{}, [5n, 7n], [Workspace.WorkspaceInvalidSource{}], []},
    Workspace.WorkspaceConstant{8n, Workspace.WorkspaceEight{}},
    Workspace.WorkspaceCall{9n, Workspace.WorkspaceMultiply{}, [8n, 5n]},
    Workspace.WorkspaceConstant{10n, Workspace.WorkspaceMaxDeclarations{}},
    Workspace.WorkspaceCall{11n, Workspace.WorkspaceMeasure{}, [0n]},
    Workspace.WorkspaceConstant{12n, Workspace.WorkspaceMetadataMargin{}},
    Workspace.WorkspaceCall{13n, Workspace.WorkspaceAdd{}, [11n, 12n]},
    Workspace.WorkspaceCall{14n, Workspace.WorkspaceMultiply{}, [10n, 13n]},
    Workspace.WorkspaceCall{20n, Workspace.WorkspaceAdd{}, [9n, 14n]}
  ] : List<&2, Workspace.Operation>}

law analysis_recipe_exact:
  {Workspace.analysis_recipe() == List.append(&2, Workspace.Operation, [
    Workspace.WorkspaceReadOptional{4n, 2n, "declarations"},
    Workspace.WorkspaceBranch{Workspace.WorkspaceIsNullish{}, [4n],
      [Workspace.WorkspaceConstant{4n, Workspace.WorkspaceMaxDeclarations{}}], []}
  ], List.append(&2, Workspace.Operation, Workspace.capture_recipe(), [
    Workspace.WorkspaceReadOptional{21n, 2n, "hasImports"},
    Workspace.WorkspaceBranch{Workspace.WorkspaceTruthy{}, [21n],
      [Workspace.WorkspaceConstant{22n, Workspace.WorkspaceImportWorkspace{}}],
      [Workspace.WorkspaceConstant{22n, Workspace.WorkspaceZero{}}]},
    Workspace.WorkspaceCall{23n, Workspace.WorkspaceAdd{}, [20n, 22n]},
    Workspace.WorkspaceReadOptional{24n, 2n, "expandedUnitBytes"},
    Workspace.WorkspaceBranch{Workspace.WorkspaceIsNullish{}, [24n], [
      Workspace.WorkspaceConstant{25n, Workspace.WorkspaceMaxDeclarations{}},
      Workspace.WorkspaceConstant{26n, Workspace.WorkspaceMaxSource{}},
      Workspace.WorkspaceCall{24n, Workspace.WorkspaceMultiply{}, [25n, 26n]}
    ], []},
    Workspace.WorkspaceCall{27n, Workspace.WorkspaceAdd{}, [23n, 24n]},
    Workspace.WorkspaceCall{28n, Workspace.WorkspaceMeasure{}, [3n]},
    Workspace.WorkspaceCall{29n, Workspace.WorkspaceAdd{}, [28n, 1n]},
    Workspace.WorkspaceConstant{30n, Workspace.WorkspaceFour{}},
    Workspace.WorkspaceCall{31n, Workspace.WorkspaceMeasure{}, [0n]},
    Workspace.WorkspaceCall{32n, Workspace.WorkspaceMultiply{}, [30n, 31n]},
    Workspace.WorkspaceCall{33n, Workspace.WorkspaceAdd{}, [29n, 32n]},
    Workspace.WorkspaceConstant{34n, Workspace.WorkspaceAnalysisMargin{}},
    Workspace.WorkspaceCall{35n, Workspace.WorkspaceAdd{}, [33n, 34n]},
    Workspace.WorkspaceCall{36n, Workspace.WorkspaceMultiply{}, [4n, 35n]},
    Workspace.WorkspaceCall{35n, Workspace.WorkspaceAdd{}, [27n, 36n]}
  ])) : List<&2, Workspace.Operation>}

law next_empty_exact:
  for +result: Nat
  {Workspace.next([], result) == Workspace.WorkspaceDone{result} : Workspace.Step}

law next_nonempty_exact:
  for +operation: Workspace.Operation
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.next(operation <> remaining, result)
    == Workspace.WorkspaceAwait{operation, remaining, result} : Workspace.Step}

law branch_true_exact:
  for primitive: Workspace.Primitive
  for arguments: List<&2, Nat>
  for +yes: List<&2, Workspace.Operation>
  for no: List<&2, Workspace.Operation>
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceBranch{primitive, arguments, yes, no}, remaining, result},
      Workspace.WorkspaceFlag{True{}})
    == Workspace.next(List.append(&2, Workspace.Operation, yes, remaining), result) : Workspace.Step}

law branch_false_exact:
  for primitive: Workspace.Primitive
  for arguments: List<&2, Nat>
  for yes: List<&2, Workspace.Operation>
  for +no: List<&2, Workspace.Operation>
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceBranch{primitive, arguments, yes, no}, remaining, result},
      Workspace.WorkspaceFlag{False{}})
    == Workspace.next(List.append(&2, Workspace.Operation, no, remaining), result) : Workspace.Step}

law branch_rejects_ack:
  for primitive: Workspace.Primitive
  for arguments: List<&2, Nat>
  for yes: List<&2, Workspace.Operation>
  for no: List<&2, Workspace.Operation>
  for remaining: List<&2, Workspace.Operation>
  for result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceBranch{primitive, arguments, yes, no}, remaining, result},
      Workspace.WorkspaceAck{}) == Workspace.WorkspaceRejected{} : Workspace.Step}

law done_refuses:
  for result: Nat
  for reply: Workspace.Reply
  {Workspace.resume(Workspace.WorkspaceDone{result}, reply) == Workspace.WorkspaceRejected{} : Workspace.Step}

law rejected_refuses:
  for reply: Workspace.Reply
  {Workspace.resume(Workspace.WorkspaceRejected{}, reply) == Workspace.WorkspaceRejected{} : Workspace.Step}
law constant_ack_exact:
  for target: Nat
  for value: Workspace.Literal
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceConstant{target, value}, remaining, result},
      Workspace.WorkspaceAck{})
    == Workspace.next(remaining, result) : Workspace.Step}

law constant_rejects_flag:
  for target: Nat
  for value: Workspace.Literal
  for flag: Bool
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceConstant{target, value}, remaining, result},
      Workspace.WorkspaceFlag{flag})
    == Workspace.WorkspaceRejected{} : Workspace.Step}

law optional_ack_exact:
  for target: Nat
  for source: Nat
  for field: String
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceReadOptional{target, source, field}, remaining, result},
      Workspace.WorkspaceAck{})
    == Workspace.next(remaining, result) : Workspace.Step}

law optional_rejects_flag:
  for target: Nat
  for source: Nat
  for field: String
  for flag: Bool
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceReadOptional{target, source, field}, remaining, result},
      Workspace.WorkspaceFlag{flag})
    == Workspace.WorkspaceRejected{} : Workspace.Step}

law call_ack_exact:
  for target: Nat
  for primitive: Workspace.Primitive
  for arguments: List<&2, Nat>
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceCall{target, primitive, arguments}, remaining, result},
      Workspace.WorkspaceAck{})
    == Workspace.next(remaining, result) : Workspace.Step}

law call_rejects_flag:
  for target: Nat
  for primitive: Workspace.Primitive
  for arguments: List<&2, Nat>
  for flag: Bool
  for +remaining: List<&2, Workspace.Operation>
  for +result: Nat
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceCall{target, primitive, arguments}, remaining, result},
      Workspace.WorkspaceFlag{flag})
    == Workspace.WorkspaceRejected{} : Workspace.Step}

law invalid_source_refuses:
  for remaining: List<&2, Workspace.Operation>
  for result: Nat
  for reply: Workspace.Reply
  {Workspace.resume(Workspace.WorkspaceAwait{Workspace.WorkspaceInvalidSource{}, remaining, result}, reply)
    == Workspace.WorkspaceRejected{} : Workspace.Step}
