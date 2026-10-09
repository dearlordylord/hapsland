import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.sweep_exact(operation):
  match operation:
    case Core.Hello{}: {==}
    case Core.RegisterEdit{}: {==}
    case Core.Admit{}: {==}
    case Core.AdmitAndCollect{}: {==}
    case Core.BeginStop{}: {==}
    case Core.Other{}: {==}

def Laws.unsupported_exact(operation, direct, observed):
  match operation direct observed:
    case Core.Hello{} False{} False{}: {==}
    case Core.Hello{} False{} True{}: {==}
    case Core.Hello{} True{} False{}: {==}
    case Core.Hello{} True{} True{}: {==}
    case Core.RegisterEdit{} False{} False{}: {==}
    case Core.RegisterEdit{} False{} True{}: {==}
    case Core.RegisterEdit{} True{} False{}: {==}
    case Core.RegisterEdit{} True{} True{}: {==}
    case Core.Admit{} False{} False{}: {==}
    case Core.Admit{} False{} True{}: {==}
    case Core.Admit{} True{} False{}: {==}
    case Core.Admit{} True{} True{}: {==}
    case Core.AdmitAndCollect{} False{} False{}: {==}
    case Core.AdmitAndCollect{} False{} True{}: {==}
    case Core.AdmitAndCollect{} True{} False{}: {==}
    case Core.AdmitAndCollect{} True{} True{}: {==}
    case Core.BeginStop{} False{} False{}: {==}
    case Core.BeginStop{} False{} True{}: {==}
    case Core.BeginStop{} True{} False{}: {==}
    case Core.BeginStop{} True{} True{}: {==}
    case Core.Other{} False{} False{}: {==}
    case Core.Other{} False{} True{}: {==}
    case Core.Other{} True{} False{}: {==}
    case Core.Other{} True{} True{}: {==}

def Laws.snapshot_exact(operation, matched):
  match operation matched:
    case Core.Hello{} False{}: {==}
    case Core.Hello{} True{}: {==}
    case Core.RegisterEdit{} False{}: {==}
    case Core.RegisterEdit{} True{}: {==}
    case Core.Admit{} False{}: {==}
    case Core.Admit{} True{}: {==}
    case Core.AdmitAndCollect{} False{}: {==}
    case Core.AdmitAndCollect{} True{}: {==}
    case Core.BeginStop{} False{}: {==}
    case Core.BeginStop{} True{}: {==}
    case Core.Other{} False{}: {==}
    case Core.Other{} True{}: {==}

def Laws.lifetime_exact(operation, matched, active, edit):
  match operation matched active edit:
    case Core.Hello{} False{} False{} False{}: {==}
    case Core.Hello{} False{} False{} True{}: {==}
    case Core.Hello{} False{} True{} False{}: {==}
    case Core.Hello{} False{} True{} True{}: {==}
    case Core.Hello{} True{} False{} False{}: {==}
    case Core.Hello{} True{} False{} True{}: {==}
    case Core.Hello{} True{} True{} False{}: {==}
    case Core.Hello{} True{} True{} True{}: {==}
    case Core.RegisterEdit{} False{} False{} False{}: {==}
    case Core.RegisterEdit{} False{} False{} True{}: {==}
    case Core.RegisterEdit{} False{} True{} False{}: {==}
    case Core.RegisterEdit{} False{} True{} True{}: {==}
    case Core.RegisterEdit{} True{} False{} False{}: {==}
    case Core.RegisterEdit{} True{} False{} True{}: {==}
    case Core.RegisterEdit{} True{} True{} False{}: {==}
    case Core.RegisterEdit{} True{} True{} True{}: {==}
    case Core.Admit{} False{} False{} False{}: {==}
    case Core.Admit{} False{} False{} True{}: {==}
    case Core.Admit{} False{} True{} False{}: {==}
    case Core.Admit{} False{} True{} True{}: {==}
    case Core.Admit{} True{} False{} False{}: {==}
    case Core.Admit{} True{} False{} True{}: {==}
    case Core.Admit{} True{} True{} False{}: {==}
    case Core.Admit{} True{} True{} True{}: {==}
    case Core.AdmitAndCollect{} False{} False{} False{}: {==}
    case Core.AdmitAndCollect{} False{} False{} True{}: {==}
    case Core.AdmitAndCollect{} False{} True{} False{}: {==}
    case Core.AdmitAndCollect{} False{} True{} True{}: {==}
    case Core.AdmitAndCollect{} True{} False{} False{}: {==}
    case Core.AdmitAndCollect{} True{} False{} True{}: {==}
    case Core.AdmitAndCollect{} True{} True{} False{}: {==}
    case Core.AdmitAndCollect{} True{} True{} True{}: {==}
    case Core.BeginStop{} False{} False{} False{}: {==}
    case Core.BeginStop{} False{} False{} True{}: {==}
    case Core.BeginStop{} False{} True{} False{}: {==}
    case Core.BeginStop{} False{} True{} True{}: {==}
    case Core.BeginStop{} True{} False{} False{}: {==}
    case Core.BeginStop{} True{} False{} True{}: {==}
    case Core.BeginStop{} True{} True{} False{}: {==}
    case Core.BeginStop{} True{} True{} True{}: {==}
    case Core.Other{} False{} False{} False{}: {==}
    case Core.Other{} False{} False{} True{}: {==}
    case Core.Other{} False{} True{} False{}: {==}
    case Core.Other{} False{} True{} True{}: {==}
    case Core.Other{} True{} False{} False{}: {==}
    case Core.Other{} True{} False{} True{}: {==}
    case Core.Other{} True{} True{} False{}: {==}
    case Core.Other{} True{} True{} True{}: {==}
