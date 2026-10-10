import { appendFile, rm, rename, symlink } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  prepareObservation,
  preparedProviderInput,
  preparedUnitStillCurrent,
  reviewCodexDirectEvent,
  type DirectReviewContext
} from "@hapsland/review-execution/direct-event/pipeline"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { resolveConfiguration } from "@hapsland/runtime-inputs/configuration/resolve"
import { addEvent, makeGitFixture, put, updateEvent } from "@hapsland/build-tooling/test-support/test-fixtures"

const context = (
  observation: NonNullable<Effect.Success<ReturnType<typeof adaptCodexDirectEvent>>>
): DirectReviewContext => ({
  controlledWriter: true,
  advicee: observation.advicee,
  settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
  rules: configuredRules,
  inputContract: TYPE_INPUT_CONTRACT
})
const prepare = (event: unknown, extra: Partial<DirectReviewContext> = {}) =>
  Effect.gen(function* () {
    const observation = yield* adaptCodexDirectEvent(event)
    if (!observation) throw new Error("fixture adaptation failed")
    const reviewContext = { ...context(observation), ...extra }
    const result = yield* prepareObservation(observation, reviewContext)
    return {
      observation,
      reviewContext,
      ready: result.outcomes.filter((outcome) => outcome.status === "ready").map((outcome) => outcome.prepared),
      result
    }
  })
const rules = ["absence_confusion", "bare_domain_value", "meaningless_combinations"]
const base = "class Base:\n    id: str\n    def describe(self):\n        return self.id\n"
const readyModel = (ready: ReturnType<typeof preparedProviderInput>[]) =>
  ready.find((input) => input?.artifact.name === "Model")

describe("Python bounded local model evidence", () => {
  it.effect("named, aliased and qualified module imports retain exact reachable source with shipped rules", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "support.py", base + "class Unrelated:\n    ignored: str\n"))
      for (const [imports, name] of [
        ["from support import Base", "Base"],
        ["from support import Base as B", "B"],
        ["import support as models", "models.Base"],
        ["import support", "support.Base"]
      ]) {
        yield* Effect.promise(() => put(root, "model.py", `${imports}\nclass Model(${name}):\n    pass\n`))
        const result = yield* prepare(addEvent(root, ["model.py"]))
        expect(result.ready).toHaveLength(1)
        const input = preparedProviderInput(result.ready[0]!)!
        expect(input.artifact.source).toBe(`class Model(${name}):\n    pass`)
        expect(input.evidence?.nodes).toEqual([
          expect.objectContaining({ domain: "support.py", name: "Base", source: base.trimEnd() })
        ])
        expect(result.ready[0]!.input.rules.map((rule) => rule.id).sort()).toEqual(rules)
        expect(input.inputContract.completeness).toBe("complete")
        expect(input.evidence?.nodes.some((node) => node.name === "Unrelated")).toBe(false)
      }
    })
  )
  it.effect("named qualified imports honor initializer bindings before submodule fallback", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "pkg/base.py", base))
      yield* Effect.promise(() => put(root, "pkg/Base.py", "class Inner:\n    id: str\n"))
      for (const initializer of ["", "from . import base\n", "import pkg.base as base\n"]) {
        yield* Effect.promise(() => put(root, "pkg/__init__.py", initializer))
        yield* Effect.promise(() =>
          put(root, "model.py", "from pkg import base as m\nclass Model(m.Base):\n    pass\n")
        )
        const result = yield* prepare(addEvent(root, ["model.py"]))
        expect(result.ready).toHaveLength(1)
        expect(preparedProviderInput(result.ready[0]!)?.evidence?.nodes[0]?.domain).toBe("pkg/base.py")
      }
      for (const [initializer, reference] of [
        ["from .base import Base\n", "Base.Inner"],
        ["base = 1\n", "base.Base"]
      ]) {
        yield* Effect.promise(() => put(root, "pkg/__init__.py", initializer!))
        yield* Effect.promise(() =>
          put(
            root,
            "model.py",
            `from pkg import ${reference!.split(".")[0]} as m\nclass Model:\n    value: m.${reference!.split(".")[1]}\nclass Good:\n    value: str\n`
          )
        )
        const result = yield* prepare(addEvent(root, ["model.py"]))
        expect(result.ready.map((item) => preparedProviderInput(item)?.artifact.name)).toEqual(["Good"])
        yield* Effect.promise(() =>
          put(
            root,
            "model.py",
            `import pkg as p\nclass Model:\n    value: p.${reference}\nclass Good:\n    value: str\n`
          )
        )
        const moduleResult = yield* prepare(addEvent(root, ["model.py"]))
        expect(moduleResult.ready.map((item) => preparedProviderInput(item)?.artifact.name)).toEqual(["Good"])
      }
    })
  )
  it.effect("loader and imported namespace effects cannot establish cross-file bindings", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      for (const effects of [
        'import sys\nsys.path.insert(0, "/outside")\n',
        "import sys as system\nsystem.meta_path.insert(0, custom_loader)\n",
        "from sys import path as paths\npaths.append(extra)\n",
        "import support\nsupport.Base = Other\n",
        "import support\nclass Helper:\n    (support.Base, x) = (Other, 1)\n",
        "import support\nclass Helper:\n    [x, [support.Base, y]] = values\n",
        "import support\nclass Helper:\n    del support.Base, other\n",
        "import sys\nsys.modules['support'] = other\n",
        "import importlib as loader\nloader.import_module(dynamic_name)\n",
        "exec(dynamic_loader)\n",
        "def install_loader():\n    import sys\n    sys.meta_path.append(loader)\ninstall_loader()\n",
        "def install_loader():\n    import sys\n    sys.path.insert(0, '/outside')\nclass Bootstrap:\n    install_loader()\n",
        "@install_loader()\nclass Bootstrap:\n    pass\n",
        "@install_loader\nclass Bootstrap:\n    pass\n",
        "property = install_loader\nclass Bootstrap:\n    @property\n    def value(self):\n        pass\n",
        "def helper(value=install_loader()):\n    pass\n",
        "class Bootstrap(metaclass=install_loader):\n    pass\n",
        "from pydantic import Field\nclass Bootstrap:\n    Field = install_loader\n    value = Field()\n"
      ]) {
        yield* Effect.promise(() => put(root, "support.py", base))
        yield* Effect.promise(() =>
          put(
            root,
            "model.py",
            effects + "from support import Base\nclass Model(Base):\n    pass\nclass Good:\n    value: str\n"
          )
        )
        yield* Effect.promise(() => put(root, "good.py", "class Independent:\n    value: str\n"))
        const result = yield* prepare(addEvent(root, ["model.py", "good.py"]))
        expect(
          result.ready.map((item) => preparedProviderInput(item)?.artifact.name),
          effects
        ).toEqual(["Good", "Independent"])
        yield* Effect.promise(() => put(root, "support.py", effects + base))
        yield* Effect.promise(() =>
          put(root, "model.py", "from support import Base\nclass Model(Base):\n    pass\nclass Good:\n    value: str\n")
        )
        const supporting = yield* prepare(addEvent(root, ["model.py"]))
        expect(
          supporting.ready.map((item) => preparedProviderInput(item)?.artifact.name),
          effects
        ).toEqual(["Good"])
      }
      yield* Effect.promise(() =>
        put(
          root,
          "support.py",
          base +
            "def helper():\n    import sys\n    sys.path.append(extra)\nunused = lambda: install_loader()\n" +
            "from dataclasses import field\nclass Deferred:\n    value=field(default_factory=lambda: install_loader())\n"
        )
      )
      expect(
        (yield* prepare(addEvent(root, ["model.py"]))).ready.map((item) => preparedProviderInput(item)?.artifact.name)
      ).toEqual(["Model", "Good"])
    })
  )
  it.effect("destructured helper mutations omit the affected qualified field root", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "support.py", base))
      yield* Effect.promise(() =>
        put(
          root,
          "model.py",
          "import support\nclass Other:\n    id: int\nclass Helper:\n    (support.Base, x) = (Other, 1)\nclass Model:\n    value: support.Base\nclass Good:\n    id: str\n"
        )
      )
      const omitted: string[] = []
      const result = yield* prepare(addEvent(root, ["model.py"]), {
        observePreparationOmission: (_path, name) => omitted.push(name)
      })
      expect(result.ready.map((item) => preparedProviderInput(item)?.artifact.name)).toEqual(["Other", "Good"])
      expect(omitted).toContain("Model")
      for (const item of result.ready) {
        expect(preparedProviderInput(item)?.evidence?.nodes.some((node) => node.domain === "support.py")).not.toBe(true)
        expect(item.input.rules.map((rule) => rule.id).sort()).toEqual(rules)
      }
    })
  )
  it.effect("relative imports, named initializer chains and source-layout qualified imports share the graph", () =>
    Effect.gen(function* () {
      for (const prefix of ["", "src/"]) {
        const root = yield* Effect.promise(makeGitFixture)
        yield* Effect.promise(() =>
          put(root, `${prefix}domain/__init__.py`, "from .public import Base as PublicBase\n")
        )
        yield* Effect.promise(() => put(root, `${prefix}domain/public/__init__.py`, "from ..base import Base\n"))
        yield* Effect.promise(() => put(root, `${prefix}domain/base.py`, base))
        const cases = [
          ["from .base import Base as B", "B"],
          ["from domain import PublicBase", "PublicBase"],
          ["import domain.base as models", "models.Base"],
          ["import domain.base", "domain.base.Base"],
          ["from domain import base as models", "models.Base"]
        ]
        for (const [imports, name] of cases) {
          yield* Effect.promise(() =>
            put(root, `${prefix}domain/model.py`, `${imports}\nclass Model(${name}):\n    pass\n`)
          )
          const result = yield* prepare(addEvent(root, [`${prefix}domain/model.py`]))
          expect(result.ready, `${prefix}:${imports}`).toHaveLength(1)
          expect(preparedProviderInput(result.ready[0]!)?.evidence?.nodes).toEqual([
            expect.objectContaining({ domain: `${prefix}domain/base.py`, source: base.trimEnd() })
          ])
        }
      }
    })
  )
  it.effect("static TYPE_CHECKING imports and literal forward expressions resolve without evaluation", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "support.py", base))
      for (const [marker, guard] of [
        ["from typing import TYPE_CHECKING as TC", "TC"],
        ["import typing as t", "t.TYPE_CHECKING"]
      ]) {
        yield* Effect.promise(() =>
          put(
            root,
            "model.py",
            `${marker}\nif ${guard}:\n    from support import Base as B\nclass Model:\n    value: 'list[B] | None'\n`
          )
        )
        const result = yield* prepare(addEvent(root, ["model.py"]))
        expect(result.ready).toHaveLength(1)
        expect(preparedProviderInput(result.ready[0]!)?.evidence?.nodes.map((node) => node.name)).toEqual(["Base"])
      }
    })
  )
  it.effect("custom metadata roots are captured; conflicting roots and unsupported authority remain unavailable", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "pyproject.toml", '[tool.setuptools.package-dir]\n"" = "lib"\n'))
      yield* Effect.promise(() => put(root, "lib/domain/__init__.py", ""))
      yield* Effect.promise(() => put(root, "lib/domain/base.py", base))
      yield* Effect.promise(() => put(root, "model.py", "from domain.base import Base\nclass Model(Base):\n    pass\n"))
      const accepted = yield* prepare(addEvent(root, ["model.py"]))
      expect(accepted.ready).toHaveLength(1)
      expect(accepted.ready[0]!.input.sourceFingerprints?.map((item) => item.path)).toContain("pyproject.toml")
      yield* Effect.promise(() => put(root, "domain/__init__.py", ""))
      yield* Effect.promise(() => put(root, "domain/base.py", base))
      expect((yield* prepare(addEvent(root, ["model.py"]))).ready).toHaveLength(0)
      yield* Effect.promise(() => rm(join(root, "domain"), { recursive: true }))
      for (const metadata of [
        '[tool.setuptools.package-dir]\n"" = "lib"\nother = "elsewhere"\n',
        '[tool.hatch.build]\ndirectory = "lib"\n'
      ]) {
        yield* Effect.promise(() => put(root, "pyproject.toml", metadata))
        expect((yield* prepare(addEvent(root, ["model.py"]))).ready).toHaveLength(0)
      }
    })
  )
  it.effect("source precedes same-route stub; supporting stubs cannot replace source methods or become roots", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "support.pyi", "class Base:\n    stub: str\n"))
      yield* Effect.promise(() => put(root, "support.py", base))
      yield* Effect.promise(() => put(root, "model.py", "from support import Base\nclass Model(Base):\n    pass\n"))
      const event = addEvent(root, ["model.py"])
      const source = yield* prepare(event)
      expect(preparedProviderInput(source.ready[0]!)?.evidence?.nodes[0]?.source).toBe(base.trimEnd())
      yield* Effect.promise(() => rm(join(root, "support.py")))
      const stub = yield* prepare(event)
      expect(preparedProviderInput(stub.ready[0]!)?.evidence?.nodes[0]?.domain).toBe("support.pyi")
      expect((yield* prepare(addEvent(root, ["support.pyi"]))).ready).toHaveLength(0)
      yield* Effect.promise(() =>
        put(root, "support.py", "class Base:\n    id: str\n    def __init__(self):\n        configure()\n")
      )
      expect((yield* prepare(event)).ready).toHaveLength(0)
    })
  )
  it.effect("dataclass, TypedDict and Pydantic local ancestry retain bases rather than flattening fields", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      for (const framework of [
        "from dataclasses import dataclass\n@dataclass\n",
        "from typing import TypedDict\n",
        "from pydantic import BaseModel\n",
        ""
      ]) {
        const superclass = framework.includes("TypedDict")
          ? "(TypedDict)"
          : framework.includes("BaseModel")
            ? "(BaseModel)"
            : ""
        const parent = framework + `class Base${superclass}:\n    id: str\n`
        yield* Effect.promise(() => put(root, "support.py", parent))
        yield* Effect.promise(() => put(root, "model.py", "from support import Base\nclass Model(Base):\n    pass\n"))
        const result = yield* prepare(updateEvent(root, "model.py", ["class Model(Base):"]))
        expect(result.ready).toHaveLength(1)
        expect(preparedProviderInput(result.ready[0]!)?.artifact.source).toBe("class Model(Base):\n    pass")
        expect(preparedProviderInput(result.ready[0]!)?.evidence?.nodes[0]?.source).toBe(
          (framework.includes("@dataclass") ? "@dataclass\n" : "") + `class Base${superclass}:\n    id: str`
        )
      }
    })
  )
  it.effect("rebindings, type/runtime conflicts, class shadows, reexport shadows and cycles never guess closure", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "support.py", base))
      const cases = [
        "from support import Base\nBase = other\nclass Model:\n    value: Base\n",
        "import support as models\nmodels = other\nclass Model:\n    value: models.Base\n",
        "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from support import Base\nfrom remote import Base\nclass Model:\n    value: Base\n",
        "from support import Base\nclass Model:\n    Base = other\n    value: Base\n",
        "from pkg import Base\nclass Model:\n    value: Base\n",
        "from cycle import Base\nclass Model:\n    value: Base\n"
      ]
      yield* Effect.promise(() => put(root, "pkg/__init__.py", "from support import Base\nBase = other\n"))
      yield* Effect.promise(() => put(root, "cycle/__init__.py", "from .other import Base\n"))
      yield* Effect.promise(() => put(root, "cycle/other/__init__.py", "from .. import Base\n"))
      for (const source of cases) {
        yield* Effect.promise(() => put(root, "model.py", source + "class Good:\n    id: str\n"))
        const result = yield* prepare(addEvent(root, ["model.py"]))
        expect(
          result.ready.map((item) => item.input.declaration.name),
          source
        ).toEqual(["Good"])
      }
    })
  )
  it.effect("excluded, outside-root and namespace evidence is unavailable; source includes never exempt metadata", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "support.py", base))
      yield* Effect.promise(() => put(root, "model.py", "from support import Base\nclass Model(Base):\n    pass\n"))
      const reads: string[] = []
      const result = yield* prepare(addEvent(root, ["model.py"]), {
        policy: { includes: ["**/*"], excludes: ["support.py"] },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(String(path))
          }
        }
      })
      expect(result.ready).toHaveLength(0)
      expect(reads.some((path) => path.endsWith("support.py"))).toBe(false)
      expect(
        (yield* prepare(addEvent(root, ["model.py"]), { policy: { includes: ["**/*.py"], excludes: [] } })).ready
      ).toHaveLength(0)
      expect(
        (yield* prepare(addEvent(root, ["model.py"]), {
          policy: { includes: ["**/*.py"], excludes: [], contextIncludes: ["**/*"] }
        })).ready
      ).toHaveLength(1)
      expect(
        (yield* prepare(addEvent(root, ["model.py"]), { policy: { includes: ["**/*"], excludes: ["pyproject.toml"] } }))
          .ready
      ).toHaveLength(0)
      yield* Effect.promise(() =>
        put(root, "pkg/model.py", "from ..support import Base\nclass Model(Base):\n    pass\n")
      )
      expect((yield* prepare(addEvent(root, ["pkg/model.py"]))).ready).toHaveLength(0)
      yield* Effect.promise(() => put(root, "namespace/base.py", base))
      yield* Effect.promise(() =>
        put(root, "model.py", "from namespace.base import Base\nclass Model(Base):\n    pass\n")
      )
      expect((yield* prepare(addEvent(root, ["model.py"]))).ready).toHaveLength(0)
    })
  )
  it.effect(
    "positive captures and absent module/package alternatives invalidate on create/delete/rename/restoration",
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        yield* Effect.promise(() => put(root, "support.py", base))
        yield* Effect.promise(() => put(root, "model.py", "from support import Base\nclass Model(Base):\n    pass\n"))
        const event = addEvent(root, ["model.py"])
        const initial = yield* prepare(event)
        const frozen = initial.ready[0]!
        expect(yield* preparedUnitStillCurrent(initial.observation, frozen, initial.reviewContext)).toBe(true)
        yield* Effect.promise(() => put(root, "support/__init__.py", "from other import Base\n"))
        expect(yield* preparedUnitStillCurrent(initial.observation, frozen, initial.reviewContext)).toBe(false)
        yield* Effect.promise(() => rename(join(root, "support/__init__.py"), join(root, "support/hidden.py")))
        expect(yield* preparedUnitStillCurrent(initial.observation, frozen, initial.reviewContext)).toBe(true)
        yield* Effect.promise(() => put(root, "support.py", base.replace("id: str", "id: int")))
        expect(yield* preparedUnitStillCurrent(initial.observation, frozen, initial.reviewContext)).toBe(false)
        yield* Effect.promise(() => put(root, "support.py", base))
        expect(yield* preparedUnitStillCurrent(initial.observation, frozen, initial.reviewContext)).toBe(true)
        yield* Effect.promise(() => rm(join(root, "support.py")))
        expect(yield* preparedUnitStillCurrent(initial.observation, frozen, initial.reviewContext)).toBe(false)
        yield* Effect.promise(() => put(root, "support.py", base))
        const calls: unknown[] = []
        const reviewed = yield* reviewCodexDirectEvent(event, initial.reviewContext).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              answers: Object.fromEntries(rules.map((rule) => [rule, { _tag: "Probability", probability: 0.95 }])),
              inspectRequest: (request) =>
                Effect.sync(() => {
                  calls.push(request.state)
                }),
              onRequest: Effect.promise(() => put(root, "support/__init__.py", "from other import Base\n"))
            })
          )
        )
        expect(calls).toHaveLength(1)
        expect(readyModel(calls as ReturnType<typeof preparedProviderInput>[])).toBeDefined()
        expect(reviewed.output).toBeUndefined()
      })
  )
  it.effect("shared file/read/work budgets bound authority and evidence reads without provider calls", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "pyproject.toml", '[project]\nname = "fixture"\n'))
      yield* Effect.promise(() => put(root, "pkg/__init__.py", "from .base import Base\n"))
      yield* Effect.promise(() => put(root, "pkg/base.py", base))
      yield* Effect.promise(() => put(root, "model.py", "from pkg import Base\nclass Model(Base):\n    pass\n"))
      for (const limits of [
        { files: 2 },
        { work: 5 },
        { readBytes: 2 * 1024 * 1024 },
        { sourceBytes: 8 },
        { treeBytes: 8 }
      ]) {
        const configuration = {
          policy: resolveConfiguration(
            [
              {
                name: "user",
                source: "python-bounds",
                document: { version: 1, graphLimits: { version: 1, ...limits } }
              }
            ],
            root
          )
        }
        const result = yield* prepare(addEvent(root, ["model.py"]), {
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration }
        })
        expect(result.ready, JSON.stringify(limits)).toHaveLength(0)
      }
      const accepted = yield* prepare(addEvent(root, ["model.py"]))
      expect(accepted.ready).toHaveLength(1)
      expect(accepted.ready[0]!.input.sourceFingerprints?.map((item) => item.path).sort()).toEqual([
        "model.py",
        "pkg/__init__.py",
        "pkg/base.py",
        "pyproject.toml"
      ])
    })
  )
  it.effect("multiple local ancestry levels preserve exact declarations and supported relative member forms", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "pkg/__init__.py", "from .base import Base\n"))
      yield* Effect.promise(() => put(root, "pkg/base.py", base))
      yield* Effect.promise(() => put(root, "pkg/middle.py", "from . import Base\nclass Middle(Base):\n    pass\n"))
      yield* Effect.promise(() =>
        put(root, "pkg/model.py", "from . import middle as m\nclass Model(m.Middle):\n    pass\n")
      )
      const result = yield* prepare(addEvent(root, ["pkg/model.py"]))
      expect(result.ready).toHaveLength(1)
      expect(
        preparedProviderInput(result.ready[0]!)?.evidence?.nodes.toSorted((left, right) =>
          left.domain.localeCompare(right.domain)
        )
      ).toEqual([
        expect.objectContaining({ domain: "pkg/base.py", name: "Base", source: base.trimEnd() }),
        expect.objectContaining({ domain: "pkg/middle.py", name: "Middle", source: "class Middle(Base):\n    pass" })
      ])
      expect(result.ready[0]!.input.rules.map((rule) => rule.id).sort()).toEqual(rules)
    })
  )
  it.effect("a previously absent package created during supporting capture refuses the affected input", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "support.py", base))
      yield* Effect.promise(() => put(root, "model.py", "from support import Base\nclass Model(Base):\n    pass\n"))
      let lastRead = ""
      let created = false
      const result = yield* prepare(addEvent(root, ["model.py"]), {
        captureHooks: {
          sourceRead: (path) => {
            lastRead = path
          },
          betweenReads: () =>
            Effect.gen(function* () {
              if (lastRead !== "support.py" || created) return
              created = true
              yield* Effect.promise(() => put(root, "support/__init__.py", "from other import Base\n"))
            })
        }
      })
      expect(created).toBe(true)
      expect(result.ready).toHaveLength(0)
    })
  )
  it.effect("supporting symlinks never traverse outside the physical root", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const outside = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(outside, "base.py", base))
      yield* Effect.promise(() => symlink(join(outside, "base.py"), join(root, "support.py")))
      yield* Effect.promise(() => put(root, "model.py", "from support import Base\nclass Model(Base):\n    pass\n"))
      const reads: string[] = []
      const result = yield* prepare(addEvent(root, ["model.py"]), {
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(result.ready).toHaveLength(0)
      expect([...new Set(reads)]).toEqual(["model.py"])
    })
  )
  it.effect("the eight-file ceiling includes the root and every supporting capture", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const reads: string[] = []
      const hooks = {
        sourceRead: (path: string) => {
          reads.push(path)
        }
      }
      for (let index = 0; index < 8; index++)
        yield* Effect.promise(() => put(root, `support${index}.py`, `class Base${index}:\n    id: str\n`))
      for (const count of [7, 8]) {
        const imports = Array.from({ length: count }, (_, index) => `from support${index} import Base${index}`).join(
          "\n"
        )
        const fields = Array.from({ length: count }, (_, index) => `    field${index}: Base${index}`).join("\n")
        yield* Effect.promise(() => put(root, "model.py", `${imports}\nclass Model:\n${fields}\n`))
        reads.length = 0
        const result = yield* prepare(addEvent(root, ["model.py"]), { captureHooks: hooks })
        expect(new Set(reads).size).toBeLessThanOrEqual(8)
        if (count === 7) {
          expect(result.ready).toHaveLength(1)
          expect(preparedProviderInput(result.ready[0]!)?.evidence?.nodes).toHaveLength(7)
        } else expect(result.ready).toHaveLength(0)
      }
    })
  )
  it.effect("initializer loader/path mutation and conditional authority remain unavailable", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "pkg/base.py", base))
      yield* Effect.promise(() => put(root, "model.py", "from pkg import Base\nclass Model(Base):\n    pass\n"))
      for (const initializer of [
        "from .base import Base\nimport sys\nsys.meta_path.append(loader())\n",
        "from .base import Base\n__path__ = ['elsewhere']\n",
        "from .base import Base\ndef __getattr__(name):\n    return dynamic(name)\n",
        "from .base import *\n",
        "from .base import Base\nif configured:\n    configure_imports()\n"
      ]) {
        yield* Effect.promise(() => put(root, "pkg/__init__.py", initializer))
        expect((yield* prepare(addEvent(root, ["model.py"]))).ready, initializer).toHaveLength(0)
      }
      yield* Effect.promise(() => put(root, "pkg/__init__.py", "from .base import Base\n__all__ = ['Base']\n"))
      expect((yield* prepare(addEvent(root, ["model.py"]))).ready).toHaveLength(1)
    })
  )
  it.effect("unstable authority and source captures consume file and read reservations", () =>
    Effect.gen(function* () {
      for (const packages of [true, false]) {
        const root = yield* Effect.promise(makeGitFixture)
        const imports: string[] = [],
          fields: string[] = []
        for (let i = 0; i < 12; i++) {
          const path = packages ? `pkg${i}/__init__.py` : `support${i}.py`
          yield* Effect.promise(() => put(root, path, packages ? "from .base import Base\n" : base))
          imports.push(`from ${packages ? "pkg" : "support"}${i} import Base as B${i}`)
          fields.push(`    field${i}: B${i}`)
        }
        yield* Effect.promise(() =>
          put(root, "model.py", imports.join("\n") + "\nclass Model:\n" + fields.join("\n") + "\n")
        )
        const reads: string[] = []
        let last = ""
        const result = yield* prepare(addEvent(root, ["model.py"]), {
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
              last = path
            },
            betweenReads: () =>
              last === "model.py" ? Effect.void : Effect.promise(() => appendFile(join(root, last), "# changed\n"))
          }
        })
        expect(result.ready).toHaveLength(0)
        expect(new Set(reads).size).toBeLessThanOrEqual(8)
        expect(reads.some((path) => path !== "model.py")).toBe(true)
      }
    })
  )
  it.effect("failed supporting declaration inspection still consumes the eight-file read ceiling", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      for (let index = 0; index < 12; index++)
        yield* Effect.promise(() => put(root, `support${index}.py`, `class Other${index}:\n    id: str\n`))
      const imports = Array.from({ length: 12 }, (_, index) => `from support${index} import Base${index}`).join("\n")
      const fields = Array.from({ length: 12 }, (_, index) => `    field${index}: Base${index}`).join("\n")
      yield* Effect.promise(() => put(root, "model.py", `${imports}\nclass Model:\n${fields}\n`))
      const reads: string[] = []
      const result = yield* prepare(addEvent(root, ["model.py"]), {
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(result.ready).toHaveLength(0)
      expect(new Set(reads).size).toBeLessThanOrEqual(8)
    })
  )
  it.effect("an edited initializer is charged once while resolving its local supporting model", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "pkg/base.py", base))
      yield* Effect.promise(() =>
        put(root, "pkg/__init__.py", "from .base import Base\nclass Model(Base):\n    pass\n")
      )
      const configuration = {
        policy: resolveConfiguration(
          [
            {
              name: "user",
              source: "initializer-budget",
              document: { version: 1, graphLimits: { version: 1, files: 2 } }
            }
          ],
          root
        )
      }
      const result = yield* prepare(addEvent(root, ["pkg/__init__.py"]), {
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration }
      })
      expect(result.ready).toHaveLength(1)
      expect(preparedProviderInput(result.ready[0]!)?.evidence?.nodes[0]?.domain).toBe("pkg/base.py")
    })
  )
  it.effect("a captured cross-file type cycle closes without reserving another file", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "model.py",
          "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from support import Base\nclass Model:\n    value: 'Base'\n"
        )
      )
      yield* Effect.promise(() =>
        put(
          root,
          "support.py",
          "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from model import Model\nclass Base:\n    value: 'Model'\n"
        )
      )
      const configuration = {
        policy: resolveConfiguration(
          [{ name: "user", source: "cycle-budget", document: { version: 1, graphLimits: { version: 1, files: 2 } } }],
          root
        )
      }
      const result = yield* prepare(addEvent(root, ["model.py"]), {
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration }
      })
      expect(result.ready).toHaveLength(1)
      const input = preparedProviderInput(result.ready[0]!)!
      expect(input.evidence?.nodes).toEqual([expect.objectContaining({ domain: "support.py", name: "Base" })])
      expect(input.evidence?.edges.some((edge) => edge.kind === "included")).toBe(true)
      expect(input.inputContract.completeness).toBe("complete")
    })
  )
})
