import Base
import ./core.bend as Core

# Proposed exact preservation laws; proofs await Astra approval.
def sweep_spec(operation: Core.Operation) -> Bool:
  match operation:
    case Core.Hello{}: False{}
    case Core.Other{}: False{}
    case _: True{}

def unsupported_spec(operation: Core.Operation, direct: Bool, observed: Bool) -> Bool:
  match operation direct observed:
    case _ True{} _: True{}
    case Core.Admit{} False{} True{}: True{}
    case Core.AdmitAndCollect{} False{} True{}: True{}
    case _ False{} _: False{}

def snapshot_spec(operation: Core.Operation, matched: Bool) -> Bool:
  match operation matched:
    case Core.Hello{} _: True{}
    case _ True{}: True{}
    case _ False{}: False{}

def lifetime_spec(
  operation: Core.Operation,
  matched: Bool,
  active: Bool,
  edit: Bool
) -> Core.LifetimePlan:
  match operation matched active edit:
    case Core.Hello{} _ True{} _: Core.RequestReady{}
    case Core.Hello{} _ False{} _: Core.RequestObsolete{}
    case _ True{} True{} _: Core.RequestContinue{}
    case _ _ _ True{}: Core.RequestEditLost{}
    case _ _ _ False{}: Core.RequestObsolete{}

law sweep_exact:
  for +operation: Core.Operation
  { Core.needs_sweep(operation) == sweep_spec(operation) : Bool }

law unsupported_exact:
  for +operation: Core.Operation
  for +direct: Bool
  for +observed: Bool
  {
    Core.unsupported(operation, direct, observed)
    == unsupported_spec(operation, direct, observed)
    : Bool
  }

law snapshot_exact:
  for +operation: Core.Operation
  for +matched: Bool
  { Core.needs_snapshot(operation, matched) == snapshot_spec(operation, matched) : Bool }

law lifetime_exact:
  for +operation: Core.Operation
  for +matched: Bool
  for +active: Bool
  for +edit: Bool
  {
    Core.lifetime(operation, matched, active, edit)
    == lifetime_spec(operation, matched, active, edit)
    : Core.LifetimePlan
  }
