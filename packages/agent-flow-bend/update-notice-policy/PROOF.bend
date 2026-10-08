import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.incompatible_exact(operation, present, current):
  match operation present current:
    case Core.Hello{} False{} False{}: {==}
    case Core.Hello{} False{} True{}: {==}
    case Core.Hello{} True{} False{}: {==}
    case Core.Hello{} True{} True{}: {==}
    case Core.Admit{} False{} False{}: {==}
    case Core.Admit{} False{} True{}: {==}
    case Core.Admit{} True{} False{}: {==}
    case Core.Admit{} True{} True{}: {==}
    case Core.AdmitAndCollect{} False{} False{}: {==}
    case Core.AdmitAndCollect{} False{} True{}: {==}
    case Core.AdmitAndCollect{} True{} False{}: {==}
    case Core.AdmitAndCollect{} True{} True{}: {==}
    case Core.EditPolicy{} False{} False{}: {==}
    case Core.EditPolicy{} False{} True{}: {==}
    case Core.EditPolicy{} True{} False{}: {==}
    case Core.EditPolicy{} True{} True{}: {==}
    case Core.PromptMarker{} False{} False{}: {==}
    case Core.PromptMarker{} False{} True{}: {==}
    case Core.PromptMarker{} True{} False{}: {==}
    case Core.PromptMarker{} True{} True{}: {==}
    case Core.RegisterEdit{} False{} False{}: {==}
    case Core.RegisterEdit{} False{} True{}: {==}
    case Core.RegisterEdit{} True{} False{}: {==}
    case Core.RegisterEdit{} True{} True{}: {==}
    case Core.Collect{} False{} False{}: {==}
    case Core.Collect{} False{} True{}: {==}
    case Core.Collect{} True{} False{}: {==}
    case Core.Collect{} True{} True{}: {==}
    case Core.Other{} False{} False{}: {==}
    case Core.Other{} False{} True{}: {==}
    case Core.Other{} True{} False{}: {==}
    case Core.Other{} True{} True{}: {==}

def Laws.opportunity_exact(override, operation, pi, ordinary):
  match override operation pi ordinary:
    case Core.Explicit{value} _ _ _: {==}
    case Core.Automatic{} Core.Hello{} False{} False{}: {==}
    case Core.Automatic{} Core.Hello{} False{} True{}: {==}
    case Core.Automatic{} Core.Hello{} True{} False{}: {==}
    case Core.Automatic{} Core.Hello{} True{} True{}: {==}
    case Core.Automatic{} Core.Admit{} False{} False{}: {==}
    case Core.Automatic{} Core.Admit{} False{} True{}: {==}
    case Core.Automatic{} Core.Admit{} True{} False{}: {==}
    case Core.Automatic{} Core.Admit{} True{} True{}: {==}
    case Core.Automatic{} Core.AdmitAndCollect{} False{} False{}: {==}
    case Core.Automatic{} Core.AdmitAndCollect{} False{} True{}: {==}
    case Core.Automatic{} Core.AdmitAndCollect{} True{} False{}: {==}
    case Core.Automatic{} Core.AdmitAndCollect{} True{} True{}: {==}
    case Core.Automatic{} Core.EditPolicy{} False{} False{}: {==}
    case Core.Automatic{} Core.EditPolicy{} False{} True{}: {==}
    case Core.Automatic{} Core.EditPolicy{} True{} False{}: {==}
    case Core.Automatic{} Core.EditPolicy{} True{} True{}: {==}
    case Core.Automatic{} Core.PromptMarker{} False{} False{}: {==}
    case Core.Automatic{} Core.PromptMarker{} False{} True{}: {==}
    case Core.Automatic{} Core.PromptMarker{} True{} False{}: {==}
    case Core.Automatic{} Core.PromptMarker{} True{} True{}: {==}
    case Core.Automatic{} Core.RegisterEdit{} False{} False{}: {==}
    case Core.Automatic{} Core.RegisterEdit{} False{} True{}: {==}
    case Core.Automatic{} Core.RegisterEdit{} True{} False{}: {==}
    case Core.Automatic{} Core.RegisterEdit{} True{} True{}: {==}
    case Core.Automatic{} Core.Collect{} False{} False{}: {==}
    case Core.Automatic{} Core.Collect{} False{} True{}: {==}
    case Core.Automatic{} Core.Collect{} True{} False{}: {==}
    case Core.Automatic{} Core.Collect{} True{} True{}: {==}
    case Core.Automatic{} Core.Other{} False{} False{}: {==}
    case Core.Automatic{} Core.Other{} False{} True{}: {==}
    case Core.Automatic{} Core.Other{} True{} False{}: {==}
    case Core.Automatic{} Core.Other{} True{} True{}: {==}

def Laws.grant_exact(already, full):
  match already full:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}
