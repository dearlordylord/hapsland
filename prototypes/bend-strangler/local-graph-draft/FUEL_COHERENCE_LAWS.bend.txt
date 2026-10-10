import Base
import ./SPEC.bend as Spec
import ./INTERPRETER_MEASURE.bend as Measure
import ./FUEL_COHERENCE.bend as Coherence

# Actual full interpreter state/tree/reference results agree whenever both runs
# complete. Fuels are arbitrary and need not be ordered; catalogs may be raw.
law completed_interpretations_equal:
  for +left_fuel: Nat
  for +right_fuel: Nat
  for +request: Spec.Request
  for left_complete: {
    Coherence.completed(Spec.interpret(left_fuel, request)) == True{} : Bool
  }
  for right_complete: {
    Coherence.completed(Spec.interpret(right_fuel, request)) == True{} : Bool
  }
  {Spec.interpret(left_fuel, request) == Spec.interpret(right_fuel, request) : Spec.DispatchResult}

# Actual successful full projections agree, including every node and slot.
# There is no tree-size, address-validity, canonical-map or reachability premise.
law successful_flattenings_equal:
  for +left_fuel: Nat
  for +right_fuel: Nat
  for +request: Spec.FlattenRequest
  for left_complete: {
    Measure.flat_success(Spec.flatten(left_fuel, request)) == True{} : Bool
  }
  for right_complete: {
    Measure.flat_success(Spec.flatten(right_fuel, request)) == True{} : Bool
  }
  {Spec.flatten(left_fuel, request) == Spec.flatten(right_fuel, request) : Spec.Flat}
