import assert from "node:assert/strict";
import { readFileSync as __readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dirname, "../../..");
const source = execFileSync("git", ["show", "fda9ba07:packages/source-analysis/src/direct-event/languages/typescript-functions.ts"], {
  cwd: root,
  encoding: "utf8"
});
const start = source.indexOf("const effectWrapper ="),
  end = source.indexOf("/** Same callable classification", start);
assert.ok(start >= 0 && end > start);
const native = new Function(new Bun.Transpiler({
  loader: "ts"
}).transformSync(source.slice(start, end)) + ";return {effectWrapper,callableValue,constCallable}")();
const node = (type, fields = {}, namedChildren = [], text = "") => ({
  type,
  text,
  namedChildren,
  childForFieldName: name => fields[name] ?? null
});
const temporary = mkdtempSync(join(tmpdir(), "hapsland-callable-native-"));
try {
  const out = join(temporary, "core.mjs");
  execFileSync("bend", [root + "/packages/agent-flow-bend/callable-policy/core.bend", "-o", out], {
    timeout: 5000
  });
  const core = (await import(pathToFileURL(out))).default;
  let cases = 0;
  const bindings = [{
    kind: "NamedEffect",
    binding: {
      path: "effect",
      name: "Effect"
    }
  }, {
    kind: "EffectNamespace",
    binding: {
      path: "effect/Effect",
      name: "*"
    }
  }, {
    kind: "OtherImport",
    binding: {
      path: "other",
      name: "Effect"
    }
  }, {
    kind: "OtherImport",
    binding: {
      path: "effect",
      name: "Other"
    }
  }, {
    kind: "OtherImport",
    binding: {
      path: "effect/Effect",
      name: "Effect"
    }
  }];
  const member = (method, identifier = true) => node("member_expression", {
    object: node(identifier ? "identifier" : "other", {}, [], "Alias"),
    property: node("property_identifier", {}, [], method)
  });
  for (const {
    kind,
    binding
  } of bindings) for (const typeOnly of [false, true]) {
    const imports = new Map([["Alias", {
      ...binding,
      typeOnly
    }]]);
    assert.equal(core.runtime_import({
      $: kind
    }, typeOnly), native.effectWrapper(member("fn"), imports));
    cases++;
  }
  const imports = new Map([["Alias", {
    path: "effect",
    name: "Effect",
    typeOnly: false
  }]]);
  for (const types of [false, true]) for (const identifier of [false, true]) for (const binding of [false, true]) for (const method of ["fn", "fnUntraced", "other"]) for (const invoked of [false, true]) for (const label of [false, true]) {
    const selected = member(method, identifier);
    const callee = invoked ? node("call_expression", {
      function: selected,
      arguments: node("arguments", {}, label ? [node("string")] : [])
    }, types ? [node("type_arguments")] : []) : node("member_expression", selected, types ? [node("type_arguments")] : []);
    // Bare callee fields must be supplied through the exact native AST access port.
    if (!invoked) callee.childForFieldName = selected.childForFieldName;
    const actual = native.effectWrapper(callee, binding ? imports : new Map());
    assert.equal(core.wrapper(types, identifier, binding, {
      $: method === "fn" ? "Fn" : method === "fnUntraced" ? "FnUntraced" : "OtherMethod"
    }, invoked, label), actual);
    cases++;
  }
  for (const kind of ["arrow_function", "function_expression", "generator_function", "other"]) {
    const body = node(kind),
      value = node("call_expression", {
        function: member("fn"),
        arguments: node("arguments", {}, [body])
      });
    const eligible = native.callableValue(value, imports) === body;
    assert.equal(core.inline_body({
      $: {
        arrow_function: "Arrow",
        function_expression: "FunctionExpression",
        generator_function: "GeneratorFunction",
        other: "OtherBody"
      }[kind]
    }), eligible);
    cases++;
  }
  for (const kind of ["DirectArrow", "WrapperCall", "OtherValue"]) for (const types of [false, true]) for (const wrapper of [false, true]) for (const one of [false, true]) for (const bodyEligible of [false, true]) {
    const body = node(bodyEligible ? "arrow_function" : "other"),
      value = node(kind === "DirectArrow" ? "arrow_function" : kind === "WrapperCall" ? "call_expression" : "function_expression", {
        function: member(wrapper ? "fn" : "other"),
        arguments: node("arguments", {}, one ? [body] : [])
      }, types ? [node("type_arguments")] : []);
    const actual = native.callableValue(value, imports);
    const plan = actual === value ? "Self" : actual === body ? "InlineArgument" : "Reject";
    assert.equal(core.callable_value({
      $: kind
    }, types, wrapper, one, bodyEligible).$, plan);
    cases++;
  }
  for (const lexical of [false, true]) for (const one of [false, true]) for (const identifier of [false, true]) for (const callable of [false, true]) {
    const name = node(identifier ? "identifier" : "object_pattern"),
      value = node(callable ? "arrow_function" : "function_expression"),
      declarator = node("variable_declarator", {
        name,
        value
      }),
      declaration = node("lexical_declaration", {}, one ? [declarator] : [declarator, declarator], lexical ? "const x = value" : "let x = value");
    const actual = native.constCallable(declaration, imports);
    assert.equal(core.const_callable(lexical, one, identifier, callable), actual !== undefined);
    if (actual) {
      assert.equal(actual.name, name);
      assert.equal(actual.callable, value);
      assert.equal(actual.declaration, declaration);
    }
    cases++;
  }
  const result = {
    passed: true,
    cases,
    scope: "compiled Bend versus actual transpiled current TypeScript helpers through controlled AST field ports; finite classification and selected node identity; real parsing, access-order integration and universal proof remain separate checks"
  };
  writeFileSync(root + "/evidence/bend-strangler/callable-native-falsification.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  rmSync(temporary, {
    recursive: true,
    force: true
  });
}
