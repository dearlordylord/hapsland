import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { Maybe, Reply, ServiceOutcome, Token, TokenKind } from "./service-contract.ts"

export function encodeGraphToken<Kind extends TokenKind>(token: Token<Kind>): Token<Kind, bigint> {
  return { $: token.$, invocation: BigInt(token.invocation), id: BigInt(token.id) }
}

export function encodeGraphCache(cache: Maybe<Token<"CacheToken">>): Maybe<Token<"CacheToken", bigint>> {
  return cache.$ === "None" ? cache : { $: "Some", value: encodeGraphToken(cache.value) }
}

// Encode the closed transport fields after the provider catch. Frontend facts
// and ProductValue payloads already have their own ABI and are not traversed.
function encodeOutcome(outcome: ServiceOutcome): ServiceOutcome<bigint> {
  switch (outcome.$) {
    case "Types.ClockStarted":
      return { ...outcome, clock: encodeGraphToken(outcome.clock) }
    case "Types.InvocationCacheCreated":
      return { ...outcome, cache: encodeGraphToken(outcome.cache) }
    case "Types.ProviderRejected":
      return { ...outcome, exception: encodeGraphToken(outcome.exception) }
    case "Types.AccessResult":
      return {
        ...outcome,
        outcome:
          outcome.outcome.$ === "Types.AccessDenied"
            ? outcome.outcome
            : { ...outcome.outcome, selection: encodeGraphToken(outcome.outcome.selection) }
      }
    case "Types.CacheResult":
      return {
        ...outcome,
        outcome:
          outcome.outcome.$ === "Types.CacheAbsent"
            ? outcome.outcome
            : {
                ...outcome.outcome,
                capture: encodeGraphToken(outcome.outcome.capture),
                bytes: BigInt(outcome.outcome.bytes)
              }
      }
    case "Types.CaptureResult":
      return {
        ...outcome,
        outcome:
          outcome.outcome.$ === "Types.CaptureUnavailable"
            ? outcome.outcome
            : {
                ...outcome.outcome,
                capture: encodeGraphToken(outcome.outcome.capture),
                bytes: BigInt(outcome.outcome.bytes)
              }
      }
    case "Types.CacheSnapshot":
      return {
        ...outcome,
        entries: list(unlist(outcome.entries).map((entry) => ({ ...entry, bytes: BigInt(entry.bytes) })))
      }
    case "Types.ProductEncoded":
    case "Types.SourceTextEncoded":
      return { ...outcome, bytes: BigInt(outcome.bytes) }
    default:
      return outcome
  }
}

export function encodeGraphReply(reply: Reply): Reply<bigint> {
  return {
    $: reply.$,
    invocation: BigInt(reply.invocation),
    id: BigInt(reply.id),
    outcome: encodeOutcome(reply.outcome)
  }
}
