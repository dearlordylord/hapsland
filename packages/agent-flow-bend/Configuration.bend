import Base

# File names, patterns, source, and credentials remain native facts. These
# decisions consume only whether a layer supplied includes and whether a
# measured path matched each effective list.
type IncludeChoice is Data:
  ReplaceIncludes{}
  KeepIncludes{}

type Selection is Data:
  Protected{}
  Excluded{}
  EmptyIncludes{}
  NotIncluded{}
  Selected{}

type Admission is Data:
  AdmitReview{}
  RefuseRoot{}
  RefuseConfiguration{}
  RefuseCredential{}
  RefuseSelection{}

def include_choice(supplied: Bool, current_rank: Nat,
    candidate_rank: Nat) -> IncludeChoice:
  Bool.pick(IncludeChoice, Bool.and(supplied,
    Nat.is_ge(candidate_rank, current_rank)), ReplaceIncludes{}, KeepIncludes{})

def select(protected: Bool, excluded: Bool, includes_empty: Bool,
    included: Bool) -> Selection:
  Bool.pick(Selection, protected, Protected{},
    Bool.pick(Selection, excluded, Excluded{},
      Bool.pick(Selection, includes_empty, EmptyIncludes{},
        Bool.pick(Selection, included, Selected{}, NotIncluded{}))))

def admit(root_valid: Bool, configuration_valid: Bool,
    credential_ready: Bool, selected: Bool) -> Admission:
  Bool.pick(Admission, Bool.not(root_valid), RefuseRoot{},
    Bool.pick(Admission, Bool.not(configuration_valid), RefuseConfiguration{},
      Bool.pick(Admission, Bool.not(credential_ready), RefuseCredential{},
        Bool.pick(Admission, Bool.not(selected), RefuseSelection{}, AdmitReview{}))))

def main() -> Selection:
  select(False{}, False{}, False{}, True{})
