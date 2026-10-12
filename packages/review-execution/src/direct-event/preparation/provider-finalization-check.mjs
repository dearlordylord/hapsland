import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import * as Schema from "effect/Schema"
import {
  REVIEW_PROVIDERS,
  ReviewBackendSettings,
  DEFAULT_REVIEW_BACKEND
} from "@hapsland/runtime-environment/runtime/backend"
import { effectiveReviewBackend } from "@hapsland/runtime-inputs/configuration/resolve"
import { providerIdentity } from "@hapsland/review-definition/review-providers/catalog"

const backend = "../../../../runtime-environment/src/runtime/backend/Backend."
const configuration = "../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend."
const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const maybe = (value) => (value === undefined ? { $: "None" } : { $: "Some", value })
const selection = (value) => ({
  $: backend + "Selection",
  provider: value.provider,
  model: "model" in value ? { $: backend + "Supplied", value: maybe(value.model) } : { $: backend + "Missing" },
  fields: list(
    Object.entries(value)
      .filter(([, value]) => typeof value === "string")
      .map(([name, value]) => ({ $: backend + "Field", name, value }))
  )
})
const catalog = () =>
  list(
    Object.values(REVIEW_PROVIDERS).map((value) => ({
      $: backend + "Declaration",
      id: value.id,
      default_model: maybe(value.defaultModel),
      destination: value.destination
    }))
  )
const layers = (value) =>
  value === undefined
    ? { $: "None" }
    : maybe(
        list(
          value.map((layer) => ({
            $: configuration + "Layer",
            name: layer.name,
            backend: maybe(
              layer.document.reviewBackend === undefined ? undefined : selection(layer.document.reviewBackend)
            )
          }))
        )
      )
const label = (value) => value.$.split(".").at(-1)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-provider-finalization-"))
try {
  const output = join(temporary, "provider.mjs")
  execFileSync(
    "timeout",
    ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "ProviderFinalization.bend"), "-o", output],
    { timeout: 6000 }
  )
  const core = (await import(pathToFileURL(output))).default
  const identityNamespace = "../../../../review-definition/src/review-providers/ProviderIdentity."
  const nativeTokens = (value, fuel) => {
    const result = []
    let remaining = value
    while (fuel-- > 0 && remaining !== "") {
      const character = String.fromCodePoint(remaining.codePointAt(0))
      const tail = remaining.slice(character.length)
      if (character !== "{") {
        result.push({ kind: "Literal", value: character })
        remaining = tail
        continue
      }
      const closing = tail.indexOf("}")
      if (closing < 0) {
        result.push({ kind: "Literal", value: remaining })
        break
      }
      if (closing === 0) {
        result.push({ kind: "Literal", value: "{" })
        remaining = tail
      } else {
        result.push({ kind: "Placeholder", value: tail.slice(0, closing) })
        remaining = tail.slice(closing + 1)
      }
    }
    return result
  }
  const readTokens = (items) => {
    const result = []
    while (items.$ === "Con") {
      const kind = label(items.head)
      assert.ok(kind === "Literal" || kind === "Placeholder")
      result.push({ kind, value: kind === "Literal" ? items.head.value : items.head.field })
      items = items.tail
    }
    assert.equal(items.$, "Nil")
    return result
  }
  let tokenCases = 0
  const tokenInputs = [
    "",
    "a",
    "}",
    "{}",
    "{{}}",
    "{",
    "{x",
    "{x}",
    "{x}tail}",
    "{{x}}",
    "a{x}b{y}c",
    "{x}{x}{y}",
    "{}/{{}/{accountId}",
    "😀/{accountId}/尾",
    "{😀}尾",
    "a".repeat(256),
    "😀".repeat(128)
  ]
  for (const value of tokenInputs) {
    const width = [...value].length
    const fuels = new Set([0, 1, 2, 3, 4, 5, 8, 12, width, width + 1])
    for (const fuel of fuels) {
      assert.deepEqual(
        readTokens(core[identityNamespace + "tokens"](BigInt(fuel), value)),
        nativeTokens(value, fuel),
        JSON.stringify({ value, fuel })
      )
      tokenCases++
    }
    const closing = value.indexOf("}")
    const captured = core[identityNamespace + "capture"](value)
    assert.deepEqual(
      captured,
      closing < 0
        ? { $: identityNamespace + "Unclosed" }
        : { $: identityNamespace + "Closed", body: value.slice(0, closing), tail: value.slice(closing + 1) }
    )
    tokenCases++
  }
  let cases = 0
  let engineRequests = 0
  let rejectedReplies = 0
  const check = (configurationLayers, suppliedIdentity, extension = false) => {
    let expected
    try {
      expected = {
        status: "Completed",
        identity:
          configurationLayers !== undefined
            ? providerIdentity(effectiveReviewBackend({ layers: configurationLayers }))
            : (suppliedIdentity ?? providerIdentity(DEFAULT_REVIEW_BACKEND))
      }
    } catch (error) {
      expected = { status: error.name, ...(error instanceof TypeError ? { message: error.message } : {}) }
    }
    let step = core.initial(
      BigInt(cases + 1),
      layers(configurationLayers),
      maybe(suppliedIdentity === undefined ? undefined : { $: backend + "Identity", ...suppliedIdentity }),
      catalog()
    )
    let previousRequest = 0n
    for (let turns = 0; ["Continue", "EncodeComponent"].includes(label(step)); turns++) {
      assert.ok(turns < 10000)
      assert.equal(
        label(core.resume(step, { $: "Encoded", invocation: 0n, request: 0n, value: "wrong" })),
        "InvalidReply"
      )
      rejectedReplies++
      if (label(step) === "Continue") step = core.advance(step.state)
      else {
        const { invocation, request } = step.state
        assert.ok(request > previousRequest)
        previousRequest = request
        for (const reply of [
          { $: "Encoded", invocation: invocation + 1n, request, value: "wrong" },
          { $: "Encoded", invocation, request: request + 1n, value: "wrong" },
          { $: "EncodingFailed", invocation: invocation + 1n, request }
        ]) {
          assert.equal(label(core.resume(step, reply)), "InvalidReply")
          rejectedReplies++
        }
        let reply
        try {
          reply = { $: "Encoded", invocation, request, value: encodeURIComponent(step.value) }
        } catch (error) {
          assert.ok(error instanceof URIError)
          reply = { $: "EncodingFailed", invocation, request }
        }
        step = core.resume(step, reply)
        engineRequests++
      }
    }
    const actual = {
      status: label(step),
      ...(step.identity
        ? {
            identity: {
              provider: step.identity.provider,
              model: step.identity.model,
              destination: step.identity.destination
            }
          }
        : {}),
      ...(step.message ? { message: step.message } : {})
    }
    assert.deepEqual(actual, expected, JSON.stringify({ configurationLayers, suppliedIdentity, extension }))
    cases++
  }
  const selections = [DEFAULT_REVIEW_BACKEND]
  for (const provider of Object.values(REVIEW_PROVIDERS))
    for (const model of Object.keys(provider.models)) {
      const value =
        provider.id === "jev"
          ? { provider: provider.id }
          : {
              provider: provider.id,
              model,
              ...(provider.id === "cloudflare" ? { accountId: "0123456789abcdef0123456789abcdef" } : {})
            }
      selections.push(Schema.decodeUnknownSync(ReviewBackendSettings)(value))
    }
  const supplied = { provider: "openai", model: "gpt-6-luna", destination: "supplied identity" }
  for (const identity of [undefined, supplied]) {
    check(undefined, identity)
    check([], identity)
    for (const selected of selections) {
      check([{ name: "user", document: { reviewBackend: selected } }], identity)
      check(
        [
          { name: "project", document: {} },
          { name: "user", document: { reviewBackend: selected } }
        ],
        identity
      )
      check(
        [
          { name: "user", document: {} },
          { name: "user", document: { reviewBackend: selected } }
        ],
        identity
      )
      check(
        [
          { name: "user", document: { reviewBackend: selected } },
          { name: "user", document: {} }
        ],
        identity
      )
    }
  }
  const producerCases = cases
  // Explicit raw-shape extensions exercise missing values and exact template
  // scanning. They are outside the validated configuration producer domain.
  const jev = REVIEW_PROVIDERS.jev
  const original = { destination: jev.destination, defaultModel: jev.defaultModel }
  try {
    for (const destination of [
      "",
      "{}",
      "{model}/{provider}",
      "{{accountId}}",
      "{accountId}{accountId}",
      "{missing}",
      "{accountId",
      "{}/{{}/{accountId}",
      "😀/{accountId}"
    ])
      for (const accountId of ["a b/?#", "{}", "😀", "\ud800", ""]) {
        jev.destination = destination
        check(
          [
            {
              name: "user",
              document: { reviewBackend: { provider: "jev", accountId, "{accountId": accountId, "{": accountId } }
            }
          ],
          supplied,
          true
        )
      }
    jev.destination = "{model}"
    check([{ name: "user", document: { reviewBackend: { provider: "jev", model: undefined } } }], supplied, true)
    jev.defaultModel = undefined
    check([{ name: "user", document: { reviewBackend: { provider: "jev" } } }], supplied, true)
  } finally {
    Object.assign(jev, original)
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      producerCases,
      tokenCases,
      engineRequests,
      rejectedReplies,
      scope:
        "Connected configuration/provider precedence and exact template/URI engine protocol; finite comparison, whole input construction and production adoption remain open"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
