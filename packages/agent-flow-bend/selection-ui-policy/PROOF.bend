import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.submit_exact(back_row, exit_row, nonempty):
  match back_row exit_row nonempty:
    case True{} _ _: {==}
    case False{} True{} _: {==}
    case False{} False{} True{}: {==}
    case False{} False{} False{}: {==}

def Laws.toggle_exact(select_all, all_selected, choice_present, choice_selected):
  match select_all all_selected choice_present choice_selected:
    case True{} True{} _ _: {==}
    case True{} False{} _ _: {==}
    case False{} _ False{} _: {==}
    case False{} _ True{} True{}: {==}
    case False{} _ True{} False{}: {==}

def Laws.step_exact(
  key,
  back,
  back_row,
  exit_row,
  nonempty,
  select_all,
  all_selected,
  choice_present,
  choice_selected
):
  match key:
    case Core.Escape{}: {==}
    case Core.Up{}: {==}
    case Core.Down{}: {==}
    case Core.Tab{}: {==}
    case Core.Home{}: {==}
    case Core.End{}: {==}
    case Core.Return{}: Laws.submit_exact(back_row, exit_row, nonempty)
    case Core.Enter{}: Laws.submit_exact(back_row, exit_row, nonempty)
    case Core.Space{}: Laws.toggle_exact(select_all, all_selected, choice_present, choice_selected)
    case Core.Other{}: {==}
