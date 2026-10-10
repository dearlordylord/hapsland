import Base
import ./Types.bend as T

# Shared mechanical primitives only. No graph selection, policy, budgets,
# admission or expected-query callback is part of this algebra.
# The concrete platform binding remains a separately exercised foreign engine.
# Composite facts derive from the SAME primitives; callers cannot supply
# contradictory joined/normalized/extension answers independently.
def joined_facts(
  ~dirname: String -> String,
  ~join: List<&2, String> -> String,
  ~normalize: String -> String,
  ~extension: String -> String,
  ~absolute: String -> Bool,
  +separator: String,
  +from: String,
  +leaf: String
) -> T.ServiceOutcome:
  +normalized = normalize(join([dirname(from), leaf]))
  T.JoinedPathFactsResult{
    separator,
    normalized,
    absolute(normalized),
    extension(normalized),
    extension(leaf)
  }

# None identifies an external operation: it must be delegated to the arbitrary
# stateful provider. A mechanical reply carries no provider world/effects or
# suspension lease. This function does not erase an await/cancellation point.
def reply(
  ~dirname: String -> String,
  ~basename: String -> Maybe<&2, String> -> String,
  ~join: List<&2, String> -> String,
  ~normalize: String -> String,
  ~relative: String -> String -> String,
  ~extension: String -> String,
  ~absolute: String -> Bool,
  +separator: String,
  operation: T.Operation
) -> Maybe<&2, T.ServiceOutcome>:
  match operation:
    case T.PathDirname{path}: Some{T.DirnameResult{dirname(path)}}
    case T.PathBasename{path, suffix}: Some{T.BasenameResult{basename(path, suffix)}}
    case T.ReadPathSeparator{}: Some{T.PathSeparatorResult{separator}}
    case T.PathJoin{parts}: Some{T.JoinedResult{join(parts)}}
    case T.PathNormalize{path}: Some{T.NormalizedResult{normalize(path)}}
    case T.PathRelative{from, to}: Some{T.RelativeResult{relative(from, to)}}
    case T.PathExtension{path}: Some{T.ExtensionResult{extension(path)}}
    case T.PathIsAbsolute{path}: Some{T.AbsoluteResult{absolute(path)}}
    case T.JoinedPathFacts{from, leaf}: Some{
      joined_facts(~dirname, ~join, ~normalize, ~extension, ~absolute, separator, from, leaf)
    }
    case _: None{}

def main() -> Unit:
  Unit{}
