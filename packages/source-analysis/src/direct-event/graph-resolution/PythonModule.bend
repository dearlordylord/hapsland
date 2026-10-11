import Base
import ./Types.bend as T
import ./python-module/Session.bend as S
import ./python-module/MembershipMachine.bend as Membership
import ./python-module/ImportName.bend as Name
import ./python-module/CaptureMachine.bend as Capture
import ./python-module/StatMachine.bend as Stat
import ./python-module/RevalidationMachine.bend as Revalidation
import ./python-module/RootsMachine.bend as Roots
import ./python-module/RootPolicyMachine.bend as RootPolicy
import ./python-module/AlternativesMachine.bend as Alternatives
import ./python-module/Bindings.bend as Bindings
import ./python-module/Scope.bend as Scope
import ./python-module/Authority.bend as Authority
import ./python-module/PackageParentsMachine.bend as Parents
import ./python-module/ModuleTargetMachine.bend as Target
import ./python-module/ResolveImportMachine.bend as Import
import ./python-module/PreparationMachine.bend as Preparation
import ./python-module/InspectMachine.bend as Inspect

# Entry for the in-progress Python child. Resolver and Canonical composition
# remain open; these functions do not constitute subsystem adoption.
def initial_session(root: String, source_cap: Nat, depth: Nat, remaining: S.Remaining) -> S.Session:
  S.initial(root, source_cap, depth, remaining)

def observe(session: S.Session, path: String, refresh: Bool, clock: T.ClockToken,
    separator: String, invocation: Nat, next_request: Nat) -> Membership.Step:
  Membership.begin(session, path, refresh, clock, separator, invocation, next_request)

def resume(step: Membership.Step, reply: T.Reply) -> Membership.Step:
  Membership.resume(step, reply)

def import_name(characters: List<&2, T.IdentifierCharacter>, depth: Nat) -> Maybe<&2, Name.ModuleName>:
  Name.parse(characters, depth)

def usage(session: S.Session) -> S.Usage:
  S.usage(session)

def reserve_capture(session: S.Session, path: String) -> S.Session:
  S.reserve_capture(session, path)

def capture_succeeded(session: S.Session, path: String) -> S.Session:
  S.capture_succeeded(session, path)

def finish_capture(session: S.Session, path: String, capture: T.CaptureToken,
    bytes: Nat, expired: Bool) -> S.AuthorityResult:
  S.finish_capture(session, path, capture, bytes, expired)

def transfer_to_canonical(session: S.Session, path: String) -> S.Session:
  S.transfer_to_canonical(session, path)

def difference(cap: Nat, used: Nat) -> S.Bound:
  S.difference(cap, used)

def read_authority(session: S.Session, path: String, clock: T.ClockToken, cache: T.CacheToken,
    invocation: Nat, next_request: Nat) -> Capture.Step:
  Capture.begin(session, path, clock, cache, invocation, next_request)

def resume_authority(step: Capture.Step, reply: T.Reply) -> Capture.Step:
  Capture.resume(step, reply)

def stat(session: S.Session, path: String, clock: T.ClockToken, separator: String,
    invocation: Nat, next_request: Nat) -> Stat.Step:
  Stat.begin(session, path, clock, separator, invocation, next_request)

def resume_stat(step: Stat.Step, reply: T.Reply) -> Stat.Step:
  Stat.resume(step, reply)

def revalidate(session: S.Session, clock: T.ClockToken, separator: String, invocation: Nat,
    next_request: Nat) -> Revalidation.Step:
  Revalidation.begin(session, clock, separator, invocation, next_request)

def resume_revalidation(step: Revalidation.Step, reply: T.Reply) -> Revalidation.Step:
  Revalidation.resume(step, reply)

def absolute_roots(session: S.Session, clock: T.ClockToken, cache: T.CacheToken, separator: String,
    invocation: Nat, next_request: Nat) -> Roots.Step:
  Roots.begin(session, clock, cache, separator, invocation, next_request)

def resume_roots(step: Roots.Step, reply: T.Reply) -> Roots.Step:
  Roots.resume(step, reply)

def declared_root(syntax: T.TomlValue, separator: String, invocation: Nat,
    next_request: Nat) -> RootPolicy.Step:
  RootPolicy.begin(syntax, separator, invocation, next_request)

def resume_declared_root(step: RootPolicy.Step, reply: T.Reply) -> RootPolicy.Step:
  RootPolicy.resume(step, reply)

def alternatives(session: S.Session, base: String, clock: T.ClockToken, separator: String,
    invocation: Nat, next_request: Nat) -> Alternatives.Step:
  Alternatives.begin(session, base, clock, separator, invocation, next_request)

def resume_alternatives(step: Alternatives.Step, reply: T.Reply) -> Alternatives.Step:
  Alternatives.resume(step, reply)

def scope_bindings(syntax: T.PythonSyntax, id: Nat, static: Bool) -> List<&2, Bindings.Binding>:
  Bindings.scope_bindings(syntax, id, static)

def identities(facts: List<&2, Bindings.Binding>) -> List<&2, Bindings.Binding>:
  Bindings.identities(facts)

def module_scope(syntax: T.PythonSyntax) -> Scope.Scope:
  Scope.module_scope(syntax)

def python_imports(syntax: T.PythonSyntax) -> Maybe<&2, List<&2, Authority.Import>>:
  Authority.python_imports(syntax)

def static_package_authority(syntax: T.PythonSyntax) -> Bool:
  Authority.static_package_authority(syntax)

def has_package_binding(syntax: T.PythonSyntax, name: String) -> Bool:
  Authority.has_package_binding(syntax, name)

def unavailable_namespace(syntax: T.PythonSyntax, scope: Scope.Scope) -> Bool:
  Authority.unavailable_namespace(syntax, scope)

def unknown_evaluated(syntax: T.PythonSyntax, scope: Scope.Scope) -> Bool:
  Authority.unknown_evaluated(syntax, scope)

def dynamic_call(name: String) -> Bool:
  Authority.dynamic_call(name)

def package_parents(session: S.Session, path: String, root: String, clock: T.ClockToken, cache: T.CacheToken,
    separator: String, invocation: Nat, next_request: Nat) -> Parents.Step:
  Parents.begin(session, path, root, clock, cache, separator, invocation, next_request)

def resume_parents(step: Parents.Step, reply: T.Reply) -> Parents.Step:
  Parents.resume(step, reply)

def module_target(session: S.Session, from: String, import_path: String, root_path: String,
    clock: T.ClockToken, cache: T.CacheToken, separator: String, invocation: Nat, next_request: Nat) -> Target.Step:
  Target.begin(session, from, import_path, root_path, clock, cache, separator, invocation, next_request)

def resume_target(step: Target.Step, reply: T.Reply) -> Target.Step:
  Target.resume(step, reply)

def cached_roots(session: S.Session, roots: List<&2, String>) -> S.Session:
  S.with_roots_attempted(S.with_roots(session, roots), True{})

def resolve_import(session: S.Session, remaining: S.Remaining, from: String, import_path: String,
    member: String, root_path: String, clock: T.ClockToken, cache: T.CacheToken, separator: String,
    invocation: Nat, next_request: Nat) -> Import.Step:
  Import.begin(session, remaining, from, import_path, member, root_path, clock, cache, separator, invocation, next_request)

def resume_import(step: Import.Step, reply: T.Reply) -> Import.Step:
  Import.resume(step, reply)

def prepare_session(input: Preparation.Input, next: Nat) -> Preparation.Step:
  Preparation.begin(input, next)

def resume_preparation(step: Preparation.Step, reply: T.Reply) -> Preparation.Step:
  Preparation.resume(step, reply)

def inspect_session(branch: T.Branch, path: String, root_path: String, capture: T.CaptureToken,
    invocation: Nat, next: Nat) -> Inspect.Step:
  Inspect.begin(branch, path, root_path, capture, invocation, next)

def resume_inspect(step: Inspect.Step, reply: T.Reply) -> Inspect.Step:
  Inspect.resume(step, reply)

def session_usage(session: S.Session) -> S.Usage:
  S.usage(session)

def session_remaining(session: S.Session, remaining: S.Remaining) -> S.Session:
  S.with_remaining(session, remaining)

def main() -> Unit:
  Unit{}
