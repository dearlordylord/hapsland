import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.runtime_import_exact(kind, type_only):
  match kind type_only:
    case Core.NamedEffect{} False{}: {==}
    case Core.NamedEffect{} True{}: {==}
    case Core.EffectNamespace{} False{}: {==}
    case Core.EffectNamespace{} True{}: {==}
    case Core.OtherImport{} False{}: {==}
    case Core.OtherImport{} True{}: {==}

def Laws.wrapper_exact(types, member, binding, method, invoked, label):
  match types member binding method invoked label:
    case False{} False{} False{} Core.Fn{} False{} False{}: {==}
    case False{} False{} False{} Core.Fn{} False{} True{}: {==}
    case False{} False{} False{} Core.Fn{} True{} False{}: {==}
    case False{} False{} False{} Core.Fn{} True{} True{}: {==}
    case False{} False{} False{} Core.FnUntraced{} False{} False{}: {==}
    case False{} False{} False{} Core.FnUntraced{} False{} True{}: {==}
    case False{} False{} False{} Core.FnUntraced{} True{} False{}: {==}
    case False{} False{} False{} Core.FnUntraced{} True{} True{}: {==}
    case False{} False{} False{} Core.OtherMethod{} False{} False{}: {==}
    case False{} False{} False{} Core.OtherMethod{} False{} True{}: {==}
    case False{} False{} False{} Core.OtherMethod{} True{} False{}: {==}
    case False{} False{} False{} Core.OtherMethod{} True{} True{}: {==}
    case False{} False{} True{} Core.Fn{} False{} False{}: {==}
    case False{} False{} True{} Core.Fn{} False{} True{}: {==}
    case False{} False{} True{} Core.Fn{} True{} False{}: {==}
    case False{} False{} True{} Core.Fn{} True{} True{}: {==}
    case False{} False{} True{} Core.FnUntraced{} False{} False{}: {==}
    case False{} False{} True{} Core.FnUntraced{} False{} True{}: {==}
    case False{} False{} True{} Core.FnUntraced{} True{} False{}: {==}
    case False{} False{} True{} Core.FnUntraced{} True{} True{}: {==}
    case False{} False{} True{} Core.OtherMethod{} False{} False{}: {==}
    case False{} False{} True{} Core.OtherMethod{} False{} True{}: {==}
    case False{} False{} True{} Core.OtherMethod{} True{} False{}: {==}
    case False{} False{} True{} Core.OtherMethod{} True{} True{}: {==}
    case False{} True{} False{} Core.Fn{} False{} False{}: {==}
    case False{} True{} False{} Core.Fn{} False{} True{}: {==}
    case False{} True{} False{} Core.Fn{} True{} False{}: {==}
    case False{} True{} False{} Core.Fn{} True{} True{}: {==}
    case False{} True{} False{} Core.FnUntraced{} False{} False{}: {==}
    case False{} True{} False{} Core.FnUntraced{} False{} True{}: {==}
    case False{} True{} False{} Core.FnUntraced{} True{} False{}: {==}
    case False{} True{} False{} Core.FnUntraced{} True{} True{}: {==}
    case False{} True{} False{} Core.OtherMethod{} False{} False{}: {==}
    case False{} True{} False{} Core.OtherMethod{} False{} True{}: {==}
    case False{} True{} False{} Core.OtherMethod{} True{} False{}: {==}
    case False{} True{} False{} Core.OtherMethod{} True{} True{}: {==}
    case False{} True{} True{} Core.Fn{} False{} False{}: {==}
    case False{} True{} True{} Core.Fn{} False{} True{}: {==}
    case False{} True{} True{} Core.Fn{} True{} False{}: {==}
    case False{} True{} True{} Core.Fn{} True{} True{}: {==}
    case False{} True{} True{} Core.FnUntraced{} False{} False{}: {==}
    case False{} True{} True{} Core.FnUntraced{} False{} True{}: {==}
    case False{} True{} True{} Core.FnUntraced{} True{} False{}: {==}
    case False{} True{} True{} Core.FnUntraced{} True{} True{}: {==}
    case False{} True{} True{} Core.OtherMethod{} False{} False{}: {==}
    case False{} True{} True{} Core.OtherMethod{} False{} True{}: {==}
    case False{} True{} True{} Core.OtherMethod{} True{} False{}: {==}
    case False{} True{} True{} Core.OtherMethod{} True{} True{}: {==}
    case True{} False{} False{} Core.Fn{} False{} False{}: {==}
    case True{} False{} False{} Core.Fn{} False{} True{}: {==}
    case True{} False{} False{} Core.Fn{} True{} False{}: {==}
    case True{} False{} False{} Core.Fn{} True{} True{}: {==}
    case True{} False{} False{} Core.FnUntraced{} False{} False{}: {==}
    case True{} False{} False{} Core.FnUntraced{} False{} True{}: {==}
    case True{} False{} False{} Core.FnUntraced{} True{} False{}: {==}
    case True{} False{} False{} Core.FnUntraced{} True{} True{}: {==}
    case True{} False{} False{} Core.OtherMethod{} False{} False{}: {==}
    case True{} False{} False{} Core.OtherMethod{} False{} True{}: {==}
    case True{} False{} False{} Core.OtherMethod{} True{} False{}: {==}
    case True{} False{} False{} Core.OtherMethod{} True{} True{}: {==}
    case True{} False{} True{} Core.Fn{} False{} False{}: {==}
    case True{} False{} True{} Core.Fn{} False{} True{}: {==}
    case True{} False{} True{} Core.Fn{} True{} False{}: {==}
    case True{} False{} True{} Core.Fn{} True{} True{}: {==}
    case True{} False{} True{} Core.FnUntraced{} False{} False{}: {==}
    case True{} False{} True{} Core.FnUntraced{} False{} True{}: {==}
    case True{} False{} True{} Core.FnUntraced{} True{} False{}: {==}
    case True{} False{} True{} Core.FnUntraced{} True{} True{}: {==}
    case True{} False{} True{} Core.OtherMethod{} False{} False{}: {==}
    case True{} False{} True{} Core.OtherMethod{} False{} True{}: {==}
    case True{} False{} True{} Core.OtherMethod{} True{} False{}: {==}
    case True{} False{} True{} Core.OtherMethod{} True{} True{}: {==}
    case True{} True{} False{} Core.Fn{} False{} False{}: {==}
    case True{} True{} False{} Core.Fn{} False{} True{}: {==}
    case True{} True{} False{} Core.Fn{} True{} False{}: {==}
    case True{} True{} False{} Core.Fn{} True{} True{}: {==}
    case True{} True{} False{} Core.FnUntraced{} False{} False{}: {==}
    case True{} True{} False{} Core.FnUntraced{} False{} True{}: {==}
    case True{} True{} False{} Core.FnUntraced{} True{} False{}: {==}
    case True{} True{} False{} Core.FnUntraced{} True{} True{}: {==}
    case True{} True{} False{} Core.OtherMethod{} False{} False{}: {==}
    case True{} True{} False{} Core.OtherMethod{} False{} True{}: {==}
    case True{} True{} False{} Core.OtherMethod{} True{} False{}: {==}
    case True{} True{} False{} Core.OtherMethod{} True{} True{}: {==}
    case True{} True{} True{} Core.Fn{} False{} False{}: {==}
    case True{} True{} True{} Core.Fn{} False{} True{}: {==}
    case True{} True{} True{} Core.Fn{} True{} False{}: {==}
    case True{} True{} True{} Core.Fn{} True{} True{}: {==}
    case True{} True{} True{} Core.FnUntraced{} False{} False{}: {==}
    case True{} True{} True{} Core.FnUntraced{} False{} True{}: {==}
    case True{} True{} True{} Core.FnUntraced{} True{} False{}: {==}
    case True{} True{} True{} Core.FnUntraced{} True{} True{}: {==}
    case True{} True{} True{} Core.OtherMethod{} False{} False{}: {==}
    case True{} True{} True{} Core.OtherMethod{} False{} True{}: {==}
    case True{} True{} True{} Core.OtherMethod{} True{} False{}: {==}
    case True{} True{} True{} Core.OtherMethod{} True{} True{}: {==}

def Laws.inline_body_exact(kind):
  match kind:
    case Core.Arrow{}: {==}
    case Core.FunctionExpression{}: {==}
    case Core.GeneratorFunction{}: {==}
    case Core.OtherBody{}: {==}

def Laws.callable_value_exact(kind, types, wrapper, one, body):
  match kind types wrapper one body:
    case Core.DirectArrow{} False{} False{} False{} False{}: {==}
    case Core.DirectArrow{} False{} False{} False{} True{}: {==}
    case Core.DirectArrow{} False{} False{} True{} False{}: {==}
    case Core.DirectArrow{} False{} False{} True{} True{}: {==}
    case Core.DirectArrow{} False{} True{} False{} False{}: {==}
    case Core.DirectArrow{} False{} True{} False{} True{}: {==}
    case Core.DirectArrow{} False{} True{} True{} False{}: {==}
    case Core.DirectArrow{} False{} True{} True{} True{}: {==}
    case Core.DirectArrow{} True{} False{} False{} False{}: {==}
    case Core.DirectArrow{} True{} False{} False{} True{}: {==}
    case Core.DirectArrow{} True{} False{} True{} False{}: {==}
    case Core.DirectArrow{} True{} False{} True{} True{}: {==}
    case Core.DirectArrow{} True{} True{} False{} False{}: {==}
    case Core.DirectArrow{} True{} True{} False{} True{}: {==}
    case Core.DirectArrow{} True{} True{} True{} False{}: {==}
    case Core.DirectArrow{} True{} True{} True{} True{}: {==}
    case Core.WrapperCall{} False{} False{} False{} False{}: {==}
    case Core.WrapperCall{} False{} False{} False{} True{}: {==}
    case Core.WrapperCall{} False{} False{} True{} False{}: {==}
    case Core.WrapperCall{} False{} False{} True{} True{}: {==}
    case Core.WrapperCall{} False{} True{} False{} False{}: {==}
    case Core.WrapperCall{} False{} True{} False{} True{}: {==}
    case Core.WrapperCall{} False{} True{} True{} False{}: {==}
    case Core.WrapperCall{} False{} True{} True{} True{}: {==}
    case Core.WrapperCall{} True{} False{} False{} False{}: {==}
    case Core.WrapperCall{} True{} False{} False{} True{}: {==}
    case Core.WrapperCall{} True{} False{} True{} False{}: {==}
    case Core.WrapperCall{} True{} False{} True{} True{}: {==}
    case Core.WrapperCall{} True{} True{} False{} False{}: {==}
    case Core.WrapperCall{} True{} True{} False{} True{}: {==}
    case Core.WrapperCall{} True{} True{} True{} False{}: {==}
    case Core.WrapperCall{} True{} True{} True{} True{}: {==}
    case Core.OtherValue{} False{} False{} False{} False{}: {==}
    case Core.OtherValue{} False{} False{} False{} True{}: {==}
    case Core.OtherValue{} False{} False{} True{} False{}: {==}
    case Core.OtherValue{} False{} False{} True{} True{}: {==}
    case Core.OtherValue{} False{} True{} False{} False{}: {==}
    case Core.OtherValue{} False{} True{} False{} True{}: {==}
    case Core.OtherValue{} False{} True{} True{} False{}: {==}
    case Core.OtherValue{} False{} True{} True{} True{}: {==}
    case Core.OtherValue{} True{} False{} False{} False{}: {==}
    case Core.OtherValue{} True{} False{} False{} True{}: {==}
    case Core.OtherValue{} True{} False{} True{} False{}: {==}
    case Core.OtherValue{} True{} False{} True{} True{}: {==}
    case Core.OtherValue{} True{} True{} False{} False{}: {==}
    case Core.OtherValue{} True{} True{} False{} True{}: {==}
    case Core.OtherValue{} True{} True{} True{} False{}: {==}
    case Core.OtherValue{} True{} True{} True{} True{}: {==}

def Laws.const_callable_exact(lexical, one, identifier, callable):
  match lexical one identifier callable:
    case False{} False{} False{} False{}: {==}
    case False{} False{} False{} True{}: {==}
    case False{} False{} True{} False{}: {==}
    case False{} False{} True{} True{}: {==}
    case False{} True{} False{} False{}: {==}
    case False{} True{} False{} True{}: {==}
    case False{} True{} True{} False{}: {==}
    case False{} True{} True{} True{}: {==}
    case True{} False{} False{} False{}: {==}
    case True{} False{} False{} True{}: {==}
    case True{} False{} True{} False{}: {==}
    case True{} False{} True{} True{}: {==}
    case True{} True{} False{} False{}: {==}
    case True{} True{} False{} True{}: {==}
    case True{} True{} True{} False{}: {==}
    case True{} True{} True{} True{}: {==}
