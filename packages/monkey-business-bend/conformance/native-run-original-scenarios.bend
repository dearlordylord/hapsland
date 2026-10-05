import Base
import ./native-run-scenario.bend as Original
import ./native-run-credential-restore.bend as CredentialRestore
import ./native-run-credential-rotate.bend as CredentialRotate
import ./native-run-boundaries.bend as Boundaries
import ./native-run-future-profile.bend as FutureProfile
import ./native-run-wrong-completion.bend as WrongCompletion
import ./native-run-empty-sizes.bend as EmptySizes
import ./native-run-projection.bend as Projection

def prepend_original(rest: List<&2, List<&2, List<&2, Nat>>>) -> List<&2, List<&2, List<&2, Nat>>>:
  Original.trace() <> rest

def prepend_credential_restore(rest: List<&2, List<&2, List<&2, Nat>>>) -> List<&2, List<&2, List<&2, Nat>>>:
  CredentialRestore.trace() <> rest

def prepend_credential_rotate(rest: List<&2, List<&2, List<&2, Nat>>>) -> List<&2, List<&2, List<&2, Nat>>>:
  CredentialRotate.trace() <> rest

def prepend_boundaries(rest: List<&2, List<&2, List<&2, Nat>>>) -> List<&2, List<&2, List<&2, Nat>>>:
  Boundaries.trace() <> rest

def prepend_future_profile(rest: List<&2, List<&2, List<&2, Nat>>>) -> List<&2, List<&2, List<&2, Nat>>>:
  FutureProfile.trace() <> rest

def prepend_wrong_completion(rest: List<&2, List<&2, List<&2, Nat>>>) -> List<&2, List<&2, List<&2, Nat>>>:
  WrongCompletion.trace() <> rest

def prepend_empty_sizes(rest: List<&2, List<&2, List<&2, Nat>>>) -> List<&2, List<&2, List<&2, Nat>>>:
  EmptySizes.trace() <> rest

def reversed_cases() -> List<&2, List<&2, List<&2, Nat>>>:
  prepend_empty_sizes(prepend_wrong_completion(prepend_future_profile(prepend_boundaries(
    prepend_credential_rotate(prepend_credential_restore(prepend_original([])))))))

def trace() -> List<&2, List<&2, List<&2, Nat>>>:
  List.reverse(&2, List<&2, List<&2, Nat>>, reversed_cases())

def show_cases(cases: List<&2, List<&2, List<&2, Nat>>>) -> String:
  match cases:
    case Nil{}: ""
    case rows <> rest:
      String.append(Projection.bracket(Projection.show_rows(rows)), Projection.comma(show_cases(rest)))

def main() -> IO(Unit):
  IO.print(Projection.bracket(show_cases(trace())))
