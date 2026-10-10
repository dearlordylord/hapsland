import Base
import ./Runtime.bend as Probe

type ProbeOutcome is Data:
  ProbeReady{end_utf16: Nat, named_children: Nat}
  SyntaxRefusal{end_utf16: Nat}
  EngineFault{}

def choose_outcome(has_error: Bool, end_utf16: Nat, named_children: Nat) -> ProbeOutcome:
  match has_error:
    case False{}: ProbeReady{end_utf16, named_children}
    case True{}: SyntaxRefusal{end_utf16}

def classify_reply(reply: Probe.ParserReply) -> ProbeOutcome:
  match reply:
    case Probe.Parsed{has_error, _, end_utf16, named_children}:
      choose_outcome(has_error, end_utf16, named_children)
    case Probe.EngineFailure{}: EngineFault{}

def resolve_probe(source: String, configured: Bool) -> IO(ProbeOutcome):
  do IO<ProbeOutcome>:
    reply : Probe.ParserReply <- Probe.parser_request(source, configured)
    return classify_reply(reply)

def resolve_steps(fuel: Nat, +source: String, +configured: Bool) -> IO(ProbeOutcome):
  match fuel:
    case 0n: resolve_probe(source, configured)
    case 1n+rest:
      do IO<ProbeOutcome>:
        reply : Probe.ParserReply <- Probe.parser_request(source, configured)
        result : ProbeOutcome <- resolve_steps(rest, source ++ " ", configured)
        return result

def main() -> IO(Unit):
  do IO<Unit>:
    result : ProbeOutcome <- resolve_steps(2n, "interface Root {}", True{})
    return Unit{}
