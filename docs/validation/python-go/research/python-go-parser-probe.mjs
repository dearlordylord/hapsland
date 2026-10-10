// Run in an isolated directory containing the pinned npm packages from the retained result.
// Synthetic syntax probe only: neither a language compiler nor a Hapsland adapter test.
import Parser from "tree-sitter";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const python = [
  ["pep758-unparenthesized-exceptions", "def run():\n    try:\n        return 1\n    except ValueError, TypeError:\n        return None\n"],
  ["imports-and-relative-reexports", "import typing as t\nfrom ..models import Payment as P\nfrom . import state\nfrom models import *\n"],
  ["type-checking-forward-reference", "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from .user import User\ndef owner(x: 'User') -> 'User':\n    return x\n"],
  ["pep695-generic-alias", "type Result[T] = T | None\n"],
  ["pep695-generic-class", "class Box[T]:\n    value: T\n"],
  ["pep695-generic-function", "def identity[T](x: T) -> T:\n    return x\n"],
  ["pep696-type-parameter-default", "class Box[T = str]:\n    value: T\n"],
  ["pep750-template-string", 'def greeting(name: str):\n    return t"Hello {name}"\n'],
  ["dataclass-fields", "from dataclasses import dataclass, field\n@dataclass(frozen=True, kw_only=True)\nclass State:\n    ready: bool\n    items: list[str] = field(default_factory=list)\n"],
  ["pydantic-validator", "from pydantic import BaseModel, model_validator\nclass Payment(BaseModel):\n    paid: bool\n    receipt: str | None = None\n    @model_validator(mode='after')\n    def validate(self):\n        return self\n"],
  ["typed-dict-class", "from typing import TypedDict, NotRequired, ReadOnly\nclass State(TypedDict):\n    ready: bool\n    receipt: NotRequired[ReadOnly[str]]\n"],
  ["typed-dict-functional", "from typing import TypedDict\nState = TypedDict('State', {'ready': bool, 'value': str})\n"],
  ["annotated-literal-union", "from typing import Annotated, Literal\ntype State = Annotated[Literal['ready', 'pending'] | None, 'state']\n"],
  ["async-decorated-method", "class Agent:\n    @staticmethod\n    async def run(x: str) -> str:\n        return x\n"],
  ["stub-overloads", "from typing import overload\n@overload\ndef get(x: int) -> int: ...\n@overload\ndef get(x: str) -> str: ...\n"],
  ["match-state", "def handle(state):\n    match state:\n        case {'kind': 'ready', 'value': value}:\n            return value\n        case _:\n            return None\n"],
  ["dynamic-import", "import importlib\nmodels = importlib.import_module('app.models')\n"],
];
const go = [
  ["import-alias-dot-blank", 'package app\nimport ( alias "example.org/app/model"; . "example.org/app/types"; _ "example.org/app/driver" )\n'],
  ["struct-tags-embedding", 'package app\ntype Payment struct { Base; Paid bool `json:"paid"`; Receipt *string `json:"receipt,omitempty"` }\n'],
  ["generic-struct", "package app\ntype Result[T any] struct { Value T; Err error }\n"],
  ["generic-alias-go124", "package app\ntype Set[T comparable] = map[T]bool\n"],
  ["defined-versus-alias", "package app\ntype UserID string\ntype ID = UserID\n"],
  ["constant-enum", "package app\ntype Status int\nconst (\n Pending Status = iota\n Ready\n Failed\n)\n"],
  ["compact-constant-enum", "package app\ntype Status int\nconst ( Pending Status = iota; Ready; Failed )\n"],
  ["grouped-type-declarations", "package app\ntype (\n UserID string\n Payment struct { ID UserID; Values map[string][]byte; Events chan<- int }\n)\n"],
  ["interfaces-and-type-set", "package app\ntype Number interface { ~int | ~float64 }\ntype Reader interface { Read(p []byte) (n int, err error) }\n"],
  ["generic-function", "package app\nfunc Identity[T any](x T) T { return x }\n"],
  ["receiver-method", "package app\ntype State struct { Ready bool }\nfunc (s *State) IsReady() bool { return s.Ready }\n"],
  ["generic-receiver", "package app\ntype Box[T any] struct { Value T }\nfunc (b Box[T]) Get() T { return b.Value }\n"],
  ["build-constraint-and-generate", '//go:build linux && !integration\n\npackage app\n//go:generate go run ./cmd/generate\ntype State struct { Ready bool }\n'],
  ["external-test-package", "package app_test\nimport \"testing\"\nfunc TestState(t *testing.T) {}\n"],
  ["range-over-function-go123", "package app\nfunc Count(seq func(func(int) bool)) int { n := 0; for range seq { n++ }; return n }\n"],
  ["type-switch", "package app\nfunc Handle(v any) { switch x := v.(type) { case string: _ = x; default: } }\n"],
  ["cgo-preamble", 'package app\n/* int value(void); */\nimport "C"\nfunc Value() int { return int(C.value()) }\n'],
];
const results = [];
for (const [language, packageName, fixtures] of [["python", "tree-sitter-python", python], ["go", "tree-sitter-go", go]]) {
  const grammar = (await import(packageName)).default;
  const parser = new Parser();
  parser.setLanguage(grammar);
  for (const [id, source] of fixtures) {
    const tree = parser.parse(source);
    const nodes = [];
    const pending = [tree.rootNode];
    while (pending.length) {
      const n = pending.pop();
      if (n.type === "ERROR" || n.isMissing) nodes.push({type: n.type, missing: n.isMissing, start: n.startPosition, end: n.endPosition});
      pending.push(...n.namedChildren);
    }
    results.push({language, id, grammarVersion: require(packageName + "/package.json").version, source, hasError: tree.rootNode.hasError, errors: nodes, tree: tree.rootNode.toString()});
  }
}
const bindingRoot = process.env.TREE_SITTER_PREBUILD;
console.log(JSON.stringify({date: "2026-10-09", sourceClass: "RUN", verificationState: "RUNTIME-TESTED", node: process.version, platform: process.platform, arch: process.arch, runtime: require("tree-sitter/package.json").version, runtimeArtifactSha256: bindingRoot ? createHash("sha256").update(readFileSync(bindingRoot + "/build/Release/tree_sitter_runtime_binding.node")).digest("hex") : null, expected: "Record grammar acceptance and errors for each synthetic construct; unsupported constructs are retained, not treated as successful coverage.", scope: "Synthetic syntax-only fixtures. No Python/Go compiler check, imports, semantic resolution, application corpus, Bun packaging, Hapsland review or runtime execution.", results}, null, 2));
