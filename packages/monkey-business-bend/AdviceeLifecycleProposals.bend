# Unapproved primitive law proposals under issue176; not a complete lifecycle
# proof or native orchestration claim. No accepted law is changed by this file.
import Base
import ./AdviceeLifecycle.bend as L

# For arbitrary Nat scopes/lifetimes/generations, a declared departed entry
# grants no current activity even when the generation identity matches.
law departed_activity_refused:
  for owner: Nat
  for lifetime: Nat
  for generation: Nat
  {L.valid_entry(Some{L.Entry{owner, lifetime, L.Disconnected{}}}, generation) == False{} : Bool}
def departed_activity_refused(owner, lifetime, generation): {==}

# Removal cannot grant activity for any scope or generation. Physical completion
# remains outside this primitive; the law does not promise a drained queue.
law removed_activity_refused:
  for owner: Nat
  for lifetime: Nat
  for generation: Nat
  {L.valid_entry(Some{L.Entry{owner, lifetime, L.Removed{}}}, generation) == False{} : Bool}
def removed_activity_refused(owner, lifetime, generation): {==}

# For any arbitrary finite entry list and prior entry, a refused resume decision
# preserves every lifecycle fact and reports exactly the same previous/current.
law refused_resume_preserves_facts:
  for +entries: List<&2, L.Entry>
  for +entry: L.Entry
  {L.resumed(False{}, entries, entry) == L.Changed{entries, Some{entry}, Some{entry}, False{}} : L.Changed}
def refused_resume_preserves_facts(entries, entry): {==}

# A disconnect of an already removed entry cannot revive that identity.
law disconnect_preserves_removal:
  for owner: Nat
  for lifetime: Nat
  {L.disconnected_entry_status(L.Entry{owner, lifetime, L.Removed{}}) == L.Removed{} : L.Status}
def disconnect_preserves_removal(owner, lifetime): {==}
