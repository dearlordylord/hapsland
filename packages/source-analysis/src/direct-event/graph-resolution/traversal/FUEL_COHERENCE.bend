import Base
import ./SPEC.bend as Spec

# Proof-only discriminator of actual completed interpreter variants.
# This does not replace the coupled interpreter/flatten completion claim.
def completed(result: Spec.DispatchResult) -> Bool:
  match result:
    case Spec.BuildResult{Spec.Missing{_}}: True{}
    case Spec.BuildResult{Spec.Built{_, _}}: True{}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: False{}
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: True{}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: False{}
