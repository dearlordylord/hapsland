import Base
import ./LAWS.bend as Laws
import ./UPDATE_SUPPORT_LAWS.bend as Support
import ./LOOKUP_PROOF.bend as Lookup
import ./CACHE_PROOF.bend as Cache
import ./OTHER_LOOKUP_PROOF.bend as Other
import ./MEMBERSHIP_PROOF.bend as Membership
import ./INVARIANT_PROOF.bend as Valid
import ./SIZE_PROOF.bend as Size
import ./RECORDS_PROOF.bend as Records
import ./UPDATE_HELPERS_PROOF.bend as Helpers

# Canonical approved laws implemented by exact isolated statement proofs.
def Laws.lookup_after_insert_exact(V, catalog, key, value, fallback):
  Lookup.lookup_after_insert_exact(V, catalog, key, value, fallback)

def Laws.other_lookup_preserved(V, catalog, key, other, value, fallback, distinct):
  Other.other_lookup_preserved(V, catalog, key, other, value, fallback, distinct)

def Laws.insertion_membership_exact(V, catalog, key, other, value):
  Membership.insertion_membership_exact(V, catalog, key, other, value)

def Laws.insertion_preserves_invariant(V, catalog, key, value, valid):
  Valid.insertion_preserves_invariant(V, catalog, key, value, valid)

def Laws.cached_size_exact(V, catalog, valid):
  Cache.cached_size_exact(V, catalog, valid)

def Laws.insertion_size_exact(V, catalog, key, value, valid):
  Size.insertion_size_exact(V, catalog, key, value, valid)

def Support.bool_reflexive(flag):
  Helpers.bool_reflexive(flag)

def Support.head_distinct(name, key, other, same, distinct):
  Helpers.head_distinct(name, key, other, same, distinct)

def Support.other_lookup_insert_step(
  V,
  found,
  name,
  key,
  other,
  previous,
  rest,
  value,
  fallback,
  same,
  distinct,
  suffix
):
  Other.other_lookup_insert_step(
    V,
    found,
    name,
    key,
    other,
    previous,
    rest,
    value,
    fallback,
    same,
    distinct,
    suffix
  )

def Support.choice_membership(found, suffix):
  Helpers.choice_membership(found, suffix)

def Support.membership_head_repeat(found, suffix):
  Helpers.membership_head_repeat(found, suffix)

def Support.membership_insert_step(V, found, name, key, other, previous, rest, value, same, suffix):
  Membership.membership_insert_step(V, found, name, key, other, previous, rest, value, same, suffix)

def Support.valid_cons(V, name, value, rest, valid, missing):
  Valid.valid_cons(V, name, value, rest, valid, missing)

def Support.missing_after_insert_distinct(V, name, key, value, rest, distinct, missing):
  Valid.missing_after_insert_distinct(V, name, key, value, rest, distinct, missing)

def Support.invariant_insert_step(
  V,
  found,
  name,
  key,
  previous,
  rest,
  value,
  same,
  valid,
  missing,
  suffix
):
  Valid.invariant_insert_step(
    V,
    found,
    name,
    key,
    previous,
    rest,
    value,
    same,
    valid,
    missing,
    suffix
  )

def Support.successor_choose(found, yes, no):
  Helpers.successor_choose(found, yes, no)

def Support.records_insert_step(V, found, name, key, previous, rest, value, same, suffix):
  Records.records_insert_step(V, found, name, key, previous, rest, value, same, suffix)

def Support.records_insert_exact(V, catalog, key, value):
  Records.records_insert_exact(V, catalog, key, value)
