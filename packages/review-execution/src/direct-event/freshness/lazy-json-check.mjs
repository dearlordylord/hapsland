import assert from "node:assert/strict"
import { canonicalValue, semanticIdentity } from "@hapsland/review-definition/direct-event/model"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import { createLazyJson } from "../../../dist/direct-event/freshness/lazy-json.js"

const sameInput = (left, right) => {
  const { sourceFingerprints: _lc, rootLocation: _ll, ...l } = left
  const { sourceFingerprints: _rc, rootLocation: _rl, ...r } = right
  return canonicalValue(l) === canonicalValue(r)
}
const candidate = () => {
  const arena = new Map()
  let next = 0n
  const store = (value) => {
    const id = next++
    arena.set(id, value)
    return id
  }
  return { json: createLazyJson(store, (id) => arena.get(id)), store }
}
let cases = 0
const qualify = (name, fixture, operation = "serialize") => {
  const lanes = []
  for (const bend of [false, true]) {
    const trace = []
    const values = fixture(trace)
    let result,
      error,
      failed = false
    try {
      if (!bend)
        result =
          operation === "serialize"
            ? canonicalValue(values[0])
            : operation === "identity"
              ? semanticIdentity(values[0])
              : operation === "review"
                ? sameInput(...values)
                : operation === "lens"
                  ? canonicalValue(values[0].field) === canonicalValue(values[1].field)
                  : canonicalValue(values[0]) === canonicalValue(values[1])
      else {
        const { json, store } = candidate()
        result =
          operation === "serialize"
            ? json.serialize(1n, values[0])
            : operation === "identity"
              ? json.identity(1n, values[0])
              : operation === "lens"
                ? json.compareLenses(
                    1n,
                    { $: "Lens", object: store(values[0]), fields: list(["field"]) },
                    { $: "Lens", object: store(values[1]), fields: list(["field"]) }
                  )
                : json.compare(1n, ...values, operation === "review")
      }
    } catch (caught) {
      failed = true
      error = caught instanceof Error ? caught.constructor.name : caught
    }
    lanes.push({ result, failed, error, trace })
  }
  assert.deepEqual(lanes[1], lanes[0], name)
  cases++
}
for (const value of [
  null,
  undefined,
  false,
  true,
  0,
  -0,
  NaN,
  Infinity,
  -Infinity,
  1.25,
  "",
  "\ud800",
  Symbol("leaf"),
  1n
])
  qualify("scalar " + String(value), () => [value])
qualify("sorted UTF16 original getters", (trace) => {
  const value = {}
  for (const key of ["z", "a", "\ud800", "\uffff", "\u{10000}"])
    Object.defineProperty(value, key, {
      enumerable: true,
      get() {
        trace.push(key)
        return key
      }
    })
  return [value]
})
qualify("complete enumeration before values", (trace) => [
  new Proxy(
    { z: 1, a: 2 },
    {
      ownKeys(target) {
        trace.push("ownKeys")
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, key) {
        trace.push("descriptor " + key)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get(target, key) {
        trace.push("get " + key)
        return Reflect.get(target, key)
      }
    }
  )
])
qualify("object toJSON ignored", (trace) => [
  {
    a: 1,
    toJSON() {
      trace.push("unexpected")
      return "wrong"
    }
  }
])
qualify("sparse nested arrays", () => {
  const nested = Array(2),
    outer = Array(4)
  nested[1] = 2
  outer[1] = undefined
  outer[2] = { z: nested, a: null }
  return [outer]
})
qualify("native map species join coercion", (trace) => {
  class Values extends Array {
    static get [Symbol.species]() {
      trace.push("species")
      return class Result extends Array {
        join(separator) {
          trace.push("join " + separator)
          const text = super.join(separator)
          return {
            [Symbol.toPrimitive](hint) {
              trace.push("coerce " + hint)
              return text
            }
          }
        }
      }
    }
  }
  return [new Values({ b: 2, a: 1 }, undefined)]
})
qualify("custom map repeated callback and lone join text", (trace) => {
  const array = []
  array.map = function (callback) {
    trace.push(this === array)
    trace.push(callback({ b: 2, a: 1 }))
    trace.push(callback(undefined))
    return {
      join(separator) {
        trace.push(separator)
        return "\ud800"
      }
    }
  }
  return [array]
})
qualify("custom join Symbol error", () => {
  const array = []
  array.map = () => ({ join: () => Symbol("join") })
  return [array]
})
for (const original of [null, undefined, false, 0, "", new Error("original")]) {
  qualify("getter exception " + String(original), (trace) => [
    {
      get a() {
        trace.push("throw")
        throw original
      }
    }
  ])
}
const restFixture = (trace) => {
  const source = {}
  const symbol = Symbol("included")
  for (const key of ["sourceFingerprints", "rootLocation", "z", "a", "__proto__", symbol])
    Object.defineProperty(source, key, {
      enumerable: true,
      get() {
        trace.push(String(key))
        return String(key)
      }
    })
  return source
}
qualify("rest identity getter symbols proto", (trace) => [restFixture(trace)], "identity")
qualify("both rest copies before serialization", (trace) => [restFixture(trace), restFixture(trace)], "review")
qualify(
  "rest changing descriptors",
  (trace) => {
    const source = { sourceFingerprints: {}, rootLocation: {} }
    Object.defineProperty(source, "a", {
      enumerable: true,
      get() {
        trace.push("a")
        delete source.b
        return 1
      }
    })
    source.b = 2
    return [source, { a: 1 }]
  },
  "review"
)
qualify(
  "rest proxy source sequencing",
  (trace) => [
    new Proxy(
      { sourceFingerprints: 0, rootLocation: 0, a: 1 },
      {
        ownKeys(target) {
          trace.push("ownKeys")
          return Reflect.ownKeys(target)
        },
        getOwnPropertyDescriptor(target, key) {
          trace.push("descriptor " + key)
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
        get(target, key) {
          trace.push("get " + key)
          return Reflect.get(target, key)
        }
      }
    )
  ],
  "identity"
)
for (const value of [null, undefined, "ab", 12, true])
  qualify("rest primitive " + String(value), () => [value], "identity")
qualify(
  "fingerprint left serialized before right lens",
  (trace) => [
    {
      get field() {
        trace.push("left field")
        return {
          get a() {
            trace.push("left a")
            return 1
          }
        }
      }
    },
    {
      get field() {
        trace.push("right field")
        return {
          get a() {
            trace.push("right a")
            return 1
          }
        }
      }
    }
  ],
  "lens"
)
qualify(
  "comparison always serializes complete right",
  (trace) => [
    {
      get a() {
        trace.push("left")
        return 1
      }
    },
    {
      get a() {
        trace.push("right")
        return 2
      }
    }
  ],
  "compare"
)
console.log(JSON.stringify({ owner: "freshness-lazy-json", cases, qualified: true }))
