import Base

type ParserReply is Data:
  Parsed{has_error: Bool, root_type: String, end_utf16: Nat, named_children: Nat}
  EngineFailure{}

# Runtime-only foreign effect; never import this module from proofs.
def parser_request(source: String, configured: Bool) -> IO(ParserReply):
  import "./parser.js"

def report_parse(has_error: Bool, root_type: String, end_utf16: Nat, children: Nat) -> IO(Unit):
  match has_error:
    case False{}: IO.print("accepted:" ++ root_type ++ ":" ++ Nat.show(end_utf16) ++ ":" ++ Nat.show(children))
    case True{}: IO.print("syntax-refusal:" ++ root_type ++ ":" ++ Nat.show(end_utf16))

def continue_after_parser(reply: ParserReply) -> IO(Unit):
  match reply:
    case Parsed{has_error, root_type, end_utf16, children}:
      report_parse(has_error, root_type, end_utf16, children)
    case EngineFailure{}: IO.print("engine-failure")

def main() -> IO(Unit):
  do IO<Unit>:
    valid : ParserReply <- parser_request("interface Root { value: string } // 😀", True{})
    continue_after_parser(valid)
    invalid : ParserReply <- parser_request("interface {", True{})
    continue_after_parser(invalid)
    failure : ParserReply <- parser_request("", False{})
    continue_after_parser(failure)
