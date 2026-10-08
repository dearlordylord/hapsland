import Base
import ./core.bend as Core

# Astra-approved exact laws; universal proofs are in PROOF.bend.
# Submission prioritizes Back, then Exit, then selected payload, else a warning.
def submit_spec(back_row: Bool, exit_row: Bool, nonempty: Bool) -> Core.Plan:
  match back_row exit_row nonempty:
    case True{} _ _: Core.Back{}
    case False{} True{} _: Core.Cancel{}
    case False{} False{} True{}: Core.Select{}
    case False{} False{} False{}: Core.Warn{}

# Toggle-all precedes a focused choice; absent/empty IDs hold exact state identity.
def toggle_spec(
  select_all: Bool,
  all_selected: Bool,
  choice_present: Bool,
  choice_selected: Bool
) -> Core.Plan:
  match select_all all_selected choice_present choice_selected:
    case True{} True{} _ _: Core.ClearAll{}
    case True{} False{} _ _: Core.ChooseAll{}
    case False{} _ False{} _: Core.Hold{}
    case False{} _ True{} True{}: Core.RemoveChoice{}
    case False{} _ True{} False{}: Core.AddChoice{}

# All key aliases and unrelated-key holds remain the existing native UI behavior.
def step_spec(
  key: Core.Key,
  back: Bool,
  back_row: Bool,
  exit_row: Bool,
  nonempty: Bool,
  select_all: Bool,
  all_selected: Bool,
  choice_present: Bool,
  choice_selected: Bool
) -> Core.Plan:
  match key:
    case Core.Escape{}: Bool.pick(Core.Plan, back, Core.Back{}, Core.Cancel{})
    case Core.Up{}: Core.Previous{}
    case Core.Down{}: Core.Next{}
    case Core.Tab{}: Core.Next{}
    case Core.Home{}: Core.First{}
    case Core.End{}: Core.Last{}
    case Core.Return{}: submit_spec(back_row, exit_row, nonempty)
    case Core.Enter{}: submit_spec(back_row, exit_row, nonempty)
    case Core.Space{}: toggle_spec(select_all, all_selected, choice_present, choice_selected)
    case Core.Other{}: Core.Hold{}

law submit_exact:
  for +back_row: Bool
  for +exit_row: Bool
  for +nonempty: Bool
  {
    Core.submit(back_row, exit_row, nonempty)
    == submit_spec(back_row, exit_row, nonempty)
    : Core.Plan
  }

law toggle_exact:
  for +select_all: Bool
  for +all_selected: Bool
  for +choice_present: Bool
  for +choice_selected: Bool
  {
    Core.toggle(select_all, all_selected, choice_present, choice_selected)
    == toggle_spec(select_all, all_selected, choice_present, choice_selected)
    : Core.Plan
  }

law step_exact:
  for +key: Core.Key
  for +back: Bool
  for +back_row: Bool
  for +exit_row: Bool
  for +nonempty: Bool
  for +select_all: Bool
  for +all_selected: Bool
  for +choice_present: Bool
  for +choice_selected: Bool
  {
    Core.step(
      key,
      back,
      back_row,
      exit_row,
      nonempty,
      select_all,
      all_selected,
      choice_present,
      choice_selected
    )
    == step_spec(
      key,
      back,
      back_row,
      exit_row,
      nonempty,
      select_all,
      all_selected,
      choice_present,
      choice_selected
    )
    : Core.Plan
  }
