import Base
import ../CollectionScenario.bend as Response

# Original public controls only. Response attempts name the identity actually
# issued by the preceding open; the allocator and all eligibility stay Engine-owned.
type Control is Data:
  OpenResponse{agent: String, response: Response.Response}
  AttemptIssuedResponse{agent: String, open_index: Nat, blocked: Bool}
  OutputProfile{delay: Nat, lease: Nat}
  LeaveMember{agent: String, admission_index: Nat}
