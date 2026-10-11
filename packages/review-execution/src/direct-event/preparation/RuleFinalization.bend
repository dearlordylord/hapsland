import Base
import ../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ../../../../review-definition/src/rules/finalization/RuleSnapshot.bend as Rules
import ../../../../runtime-inputs/src/matcher/glob/Glob.bend as Glob
import ../../../../agent-flow-bend/RulePolicy.bend as Policy

# Whole ordered rule block of preparation finalization. Snapshot semantics and
# glob semantics remain with their owners; only the existing Canonical gate
# decides admission. Every foreign/policy reply belongs to one emitted request.
type Context is Data:
  Context{
    path: Maybe<&2, String>,
    language: String,
    kind: String,
    contract: String,
    complete: Bool,
    available: List<&2, T.ProductValue>
  }
type State is Data:
  State{
    invocation: Nat,
    request: Nat,
    context: Context,
    pending: List<&2, T.ProductValue>,
    reversed: List<&2, T.ProductValue>
  }
type Work is Data:
  Work{state: State, rule: T.ProductValue, included: Bool}
type EngineReply is Data:
  Compiled{valid: Bool}
  Tested{valid: Bool, matched: Bool}
type Reply is Data:
  GateReply{invocation: Nat, request: Nat, admit: Bool}
  EngineResult{invocation: Nat, request: Nat, result: EngineReply}
type Step is Data:
  Continue{state: State}
  GlobContinue{work: Work, excluding: Bool, patterns: List<&2, String>, path: String}
  Engine{work: Work, excluding: Bool, query: Glob.AnyProtocol}
  CanonicalGate{
    work: Work,
    consent: Bool,
    complete: Bool,
    target: Policy.Target,
    global_included: Bool,
    global_excluded: Bool,
    pack_enabled: Bool,
    rule_enabled: Bool,
    rule_included: Bool,
    rule_excluded: Bool,
    target_declared: Bool,
    capabilities_available: Bool,
    source_rung: Nat,
    minimum_rung: Nat
  }
  Completed{frozen: List<&2, T.ProductValue>}
  InvalidReply{}

def strings(values: List<&2, T.ProductValue>) -> List<&2, String>:
  match values:
    case []: []
    case T.ProductText{value} <> tail: value <> strings(tail)
    case _ <> tail: strings(tail)

def applicability_field(key: String, rule: T.ProductValue) -> Maybe<&2, T.ProductValue>:
  Rules.field(key, Rules.artifact_value(Rules.field("applicability", rule)))

def enabled(value: Maybe<&2, T.ProductValue>) -> Bool:
  match value:
    case Some{T.ProductBool{value}}: value
    case _: False{}

def work_rule(work: Work) -> T.ProductValue:
  match work:
    case Work{_, rule, _}: rule

def work_context(work: Work) -> Context:
  match work:
    case Work{State{_, _, context, _, _}, _, _}: context

def next_request(work: Work) -> Work:
  match work:
    case Work{State{invocation, request, context, pending, reversed}, rule, included}:
      Work{State{invocation, Nat.add(1n, request), context, pending, reversed}, rule, included}

def policy_target(+contract: String) -> Policy.Target:
  Bool.pick(
    Policy.Target,
    String.eq(contract, "direct-event/type-shape/v1"),
    Policy.TypeShape{},
    Bool.pick(
      Policy.Target,
      String.eq(contract, "direct-event/function/v1"),
      Policy.FunctionTarget{},
      Policy.UnsupportedTarget{}
    )
  )

def gate_context(context: Context, work: Work, excluded: Bool) -> Step:
  match context work:
    case Context{_, +language, +kind, contract, complete, available} Work{state, +rule, +included}:
      CanonicalGate{
        next_request(Work{state, rule, included}),
        True{},
        complete,
        policy_target(contract),
        True{},
        False{},
        True{},
        enabled(Rules.field("enabled", rule)),
        included,
        excluded,
        Rules.target_declared(rule, language, kind),
        Rules.capabilities_available(rule, language, kind, available),
        1n,
        1n
      }

def gate(+work: Work, excluded: Bool) -> Step:
  gate_context(work_context(work), work, excluded)

def excluded_path(path: Maybe<&2, String>, +work: Work) -> Step:
  match path:
    case None{}: gate(work, False{})
    case Some{path}: GlobContinue{
      work,
      True{},
      strings(Rules.items(applicability_field("excludes", work_rule(work)))),
      path
    }

def context_path(context: Context) -> Maybe<&2, String>:
  match context:
    case Context{path, _, _, _, _, _}: path

def included_work(+included: Bool, work: Work) -> Step:
  match work:
    case Work{+state, +rule, _}:
      excluded_path(
        context_path(work_context(Work{state, rule, included})),
        Work{state, rule, included}
      )

def glob_finished(excluding: Bool, matched: Bool, +work: Work) -> Step:
  match excluding:
    case True{}: gate(work, matched)
    case False{}: included_work(matched, work)

def glob_step(query: Glob.AnyProtocol, work: Work, excluding: Bool) -> Step:
  match query:
    case Glob.AnyCompleted{matched}: glob_finished(excluding, matched, work)
    case Glob.AnyContinue{patterns, path}: GlobContinue{work, excluding, patterns, path}
    case _: Engine{next_request(work), excluding, query}

def glob_advance(work: Work, excluding: Bool, patterns: List<&2, String>, path: String) -> Step:
  glob_step(Glob.any_advance(patterns, path), work, excluding)

def no_path_included(+rule: T.ProductValue) -> Bool:
  Bool.and(
    Rules.absent(applicability_field("includes", rule)),
    List.is_empty(&2, T.ProductValue, Rules.items(applicability_field("excludes", rule)))
  )

def includes_path(
  path: Maybe<&2, String>,
  includes: Maybe<&2, T.ProductValue>,
  +work: Work
) -> Step:
  match path includes:
    case None{} _: included_work(no_path_included(work_rule(work)), work)
    case Some{_} None{}: included_work(True{}, work)
    case Some{path} Some{value}: GlobContinue{
      work,
      False{},
      strings(Rules.items(Some{value})),
      path
    }

def begin_rule(+work: Work) -> Step:
  includes_path(
    context_path(work_context(work)),
    applicability_field("includes", work_rule(work)),
    work
  )

def completed_context(context: Context, rules: List<&2, T.ProductValue>) -> Step:
  match context:
    case Context{_, language, kind, contract, _, _}: Completed{
      Rules.freeze_rules(List.reverse(&2, T.ProductValue, rules), language, kind, contract)
    }

def advance(state: State) -> Step:
  match state:
    case State{_, _, context, [], reversed}: completed_context(context, reversed)
    case State{invocation, request, context, head <> tail, reversed}:
      begin_rule(Work{State{invocation, request, context, tail, reversed}, head, False{}})

def initial(invocation: Nat, rules: List<&2, T.ProductValue>, context: Context) -> Step:
  Continue{State{invocation, 0n, context, rules, []}}

def correlation(invocation: Nat, request: Nat, work: Work) -> Bool:
  match work:
    case Work{State{actual, expected, _, _, _}, _, _}: Bool.and(
      Nat.is_eq(invocation, actual),
      Nat.is_eq(request, expected)
    )

def gate_accepted(admit: Bool, work: Work) -> Step:
  match work:
    case Work{State{invocation, request, context, pending, +reversed}, +rule, _}:
      Continue{
        State{
          invocation,
          request,
          context,
          pending,
          Bool.pick(List<&2, T.ProductValue>, admit, rule <> reversed, reversed)
        }
      }

def gate_correlated(matches: Bool, admit: Bool, work: Work) -> Step:
  match matches:
    case False{}: InvalidReply{}
    case True{}: gate_accepted(admit, work)

def gate_returned(invocation: Nat, request: Nat, admit: Bool, +work: Work) -> Step:
  gate_correlated(correlation(invocation, request, work), admit, work)

def engine_reply(query: Glob.AnyProtocol, reply: EngineReply, work: Work, excluding: Bool) -> Step:
  match query reply:
    case Glob.AnyCompile{pending, path, state, _} Compiled{valid}:
      glob_step(Glob.any_compile_returned(valid, state, pending, path), work, excluding)
    case Glob.AnyTest{pending, path, state, _, _} Tested{valid, matched}:
      glob_step(Glob.any_match_returned(valid, matched, state, pending, path), work, excluding)
    case _ _: InvalidReply{}

def engine_correlated(
  matches: Bool,
  query: Glob.AnyProtocol,
  reply: EngineReply,
  work: Work,
  excluding: Bool
) -> Step:
  match matches:
    case False{}: InvalidReply{}
    case True{}: engine_reply(query, reply, work, excluding)

def engine_returned(
  invocation: Nat,
  request: Nat,
  +work: Work,
  excluding: Bool,
  query: Glob.AnyProtocol,
  reply: EngineReply
) -> Step:
  engine_correlated(correlation(invocation, request, work), query, reply, work, excluding)

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Engine{work, excluding, query} EngineResult{invocation, request, result}:
      engine_returned(invocation, request, work, excluding, query, result)
    case CanonicalGate{work, _, _, _, _, _, _, _, _, _, _, _, _, _} GateReply{
      invocation,
      request,
      admit
    }:
      gate_returned(invocation, request, admit, work)
    case _ _: InvalidReply{}

def main() -> Unit:
  Unit{}
