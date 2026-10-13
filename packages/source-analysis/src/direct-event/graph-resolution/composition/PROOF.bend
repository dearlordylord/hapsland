import Base
import ./ArtifactComposition.bend as Core
import ../Types.bend as T

# Corollary of the unchanged full-view contract: every step projects exactly
# its existing Await request, and all other full views project None.
def awaiting_request_exact(
  step: Core.Step
) -> {
  Core.awaiting_request(step)
  == Core.request_from_view(Core.view(step))
  : Maybe<&2, T.Request>
}:
  {==}

def main() -> @step: Core.Step -> {
  Core.awaiting_request(step)
  == Core.request_from_view(Core.view(step))
  : Maybe<&2, T.Request>
}:
  awaiting_request_exact
