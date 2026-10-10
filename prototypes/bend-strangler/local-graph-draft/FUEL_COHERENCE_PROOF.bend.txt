import Base
import ./FUEL_COHERENCE_LAWS.bend as Laws
import ./INTERPRET_COHERENCE_PROOF.bend as Interpreter
import ./FLATTEN_COHERENCE_PROOF.bend as Flatten

def Laws.completed_interpretations_equal(
  left_fuel,
  right_fuel,
  request,
  left_complete,
  right_complete
):
  Interpreter.completed_interpretations_equal(
    left_fuel,
    right_fuel,
    request,
    left_complete,
    right_complete
  )

def Laws.successful_flattenings_equal(
  left_fuel,
  right_fuel,
  request,
  left_complete,
  right_complete
):
  Flatten.successful_flattenings_equal(
    left_fuel,
    right_fuel,
    request,
    left_complete,
    right_complete
  )
