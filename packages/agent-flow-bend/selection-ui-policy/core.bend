import Base

# Pure keyboard decisions; native host retains string payloads, JS arithmetic and terminal IO.
type Key is Data:
  Escape{}
  Up{}
  Down{}
  Tab{}
  Home{}
  End{}
  Return{}
  Enter{}
  Space{}
  Other{}

type Plan is Data:
  Hold{}
  Back{}
  Cancel{}
  Previous{}
  Next{}
  First{}
  Last{}
  Select{}
  Warn{}
  ClearAll{}
  ChooseAll{}
  RemoveChoice{}
  AddChoice{}

def submit(back_row: Bool, exit_row: Bool, nonempty: Bool) -> Plan:
  Bool.pick(
    Plan,
    back_row,
    Back{},
    Bool.pick(Plan, exit_row, Cancel{}, Bool.pick(Plan, nonempty, Select{}, Warn{}))
  )

def toggle(
  select_all: Bool,
  all_selected: Bool,
  choice_present: Bool,
  choice_selected: Bool
) -> Plan:
  Bool.pick(
    Plan,
    select_all,
    Bool.pick(Plan, all_selected, ClearAll{}, ChooseAll{}),
    Bool.pick(
      Plan,
      choice_present,
      Bool.pick(Plan, choice_selected, RemoveChoice{}, AddChoice{}),
      Hold{}
    )
  )

def step(
  key: Key,
  back: Bool,
  back_row: Bool,
  exit_row: Bool,
  nonempty: Bool,
  select_all: Bool,
  all_selected: Bool,
  choice_present: Bool,
  choice_selected: Bool
) -> Plan:
  match key:
    case Escape{}: Bool.pick(Plan, back, Back{}, Cancel{})
    case Up{}: Previous{}
    case Down{}: Next{}
    case Tab{}: Next{}
    case Home{}: First{}
    case End{}: Last{}
    case Return{}: submit(back_row, exit_row, nonempty)
    case Enter{}: submit(back_row, exit_row, nonempty)
    case Space{}: toggle(select_all, all_selected, choice_present, choice_selected)
    case Other{}: Hold{}
