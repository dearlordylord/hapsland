import Base
import ./REGISTRY_LAWS.bend as Laws
import ./REGISTRY_DECODE_PROOF.bend as Decode
import ./REGISTRY_GROWTH_PROOF.bend as Growth
import ./REGISTRY_UNIQUE_PROOF.bend as Unique
import ./REGISTRY_COMPLETION_PROOF.bend as Completion

# Canonical gate implements every exact main law in the single registry owner.

def Laws.selected_id_decodes(names, name, identity, selected):
  Decode.selected_id_decodes(names, name, identity, selected)

def Laws.shared_id_exact(names, left, right, identity, selected_left, selected_right):
  Decode.shared_id_exact(names, left, right, identity, selected_left, selected_right)

def Laws.extension_preserves_selected(names, added, query, identity, selected):
  Growth.extension_preserves_selected(names, added, query, identity, selected)

def Laws.intern_existing_exact(names, name, identity, selected):
  Decode.intern_existing_exact(names, name, identity, selected)

def Laws.intern_decodes(names, name):
  Growth.intern_decodes(names, name)

def Laws.intern_preserves_selected(names, name, query, identity, selected):
  Growth.intern_preserves_selected(names, name, query, identity, selected)

def Laws.intern_encodes(names, name):
  Growth.intern_encodes(names, name)

def Laws.intern_preserves_unique(names, name, valid):
  Unique.intern_preserves_unique(names, name, valid)

def Laws.constructed_registry_unique(items):
  Unique.constructed_registry_unique(items)

def Laws.decoded_id_encodes(names, name, identity, valid, decoded):
  Completion.decoded_id_encodes(names, name, identity, valid, decoded)

def Laws.collect_preserves_selected(items, names, query, identity, selected):
  Growth.collect_preserves_selected(items, names, query, identity, selected)

def Laws.collect_preserves_unique(items, names, valid):
  Unique.collect_preserves_unique(items, names, valid)

def Laws.collected_input_present(items, names, query, occurs):
  Completion.collected_input_present(items, names, query, occurs)

def Laws.assigned_id_in_range(names, name, identity, selected):
  Completion.assigned_id_in_range(names, name, identity, selected)
