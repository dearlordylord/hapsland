import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve as __resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createDispatcher, embedProgram, TransportFailure } from "../../../../packages/source-analysis/src/direct-event/graph-resolution/runtime-observation/transport.mjs";
import { Parser, TypeScript } from "../../../../packages/source-analysis/dist/direct-event/languages/native-parser.js";
const folder = import.meta.dirname,
  temp = mkdtempSync("/tmp/hapsland-resolver-embedding-");
try {
  assert.equal(execFileSync("bend", ["version"], {
    encoding: "utf8",
    timeout: 5000
  }).trim(), "bend 2.0.36");
  const program = join(temp, "program.js"),
    embedded = join(temp, "embedded.mjs");
  execFileSync("bend", [join(folder, "../../../../packages/source-analysis/src/direct-event/graph-resolution/runtime-observation/Embedding.bend"), "-o", program], {
    timeout: 5000
  });
  const source = readFileSync(program, "utf8");
  assert.throws(() => embedProgram(source + "\nunknown-layout"), TransportFailure);
  writeFileSync(embedded, embedProgram(source));
  globalThis.__hapslandWholeResolverProbeEngine = Object.freeze({
    Parser,
    TypeScript
  });
  const {
    start,
    startMany,
    handlers
  } = await import(pathToFileURL(embedded));
  assert.deepEqual(Object.keys(handlers), ["Runtime.parser_request"]);
  const invoke = createDispatcher(start, handlers),
    prior = {
      marker: "untouched"
    };
  globalThis.BEND_IO = prior;
  const real = await invoke(["interface Root {}", true]);
  assert.equal(real.$, "ProbeReady");
  assert.equal(real.end_utf16, 17);
  const next = await invoke(["interface {", true]);
  assert.equal(next.$, "SyntaxRefusal");
  const failed = await invoke(["", false]);
  assert.equal(failed.$, "EngineFault");
  assert.equal(globalThis.BEND_IO, prior);
  class ResetFailureParser extends Parser {
    reset() {
      super.reset();
      throw new Error("controlled cleanup failure");
    }
  }
  globalThis.__hapslandWholeResolverProbeEngine = Object.freeze({
    Parser: ResetFailureParser,
    TypeScript
  });
  await assert.rejects(invoke(["interface Root {}", true]), e => e.code === "handler-rejected");
  globalThis.__hapslandWholeResolverProbeEngine = Object.freeze({
    Parser,
    TypeScript
  });
  let raw = startMany(2, "x", true);
  const continuationForms = [];
  for (let step = 0; step < 3; step++) {
    assert.equal(raw.$, "Runtime.parser_request");
    raw = raw.kont({
      $: "Runtime.Parsed",
      has_error: false,
      root_type: "program",
      end_utf16: step + 1,
      named_children: 1
    });
    continuationForms.push(raw.$);
  }
  assert.deepEqual(continuationForms, ["Runtime.parser_request", "Runtime.parser_request", "Emit"]);
  const multiRequests = [];
  const multi = createDispatcher(startMany, {
    "Runtime.parser_request": source => {
      multiRequests.push(source);
      return {
        $: "Runtime.Parsed",
        has_error: false,
        root_type: "program",
        end_utf16: source.length,
        named_children: 1
      };
    }
  });
  const multiResult = await multi([2, "x", true]);
  assert.deepEqual(multiRequests, ["x", "x ", "x  "]);
  assert.equal(multiResult.end_utf16, 3);
  assert.throws(() => embedProgram(source.replace('io_eff("Runtime.parser_request",', 'io_eff("Unknown.effect",')), TransportFailure);
  const parsed = end => ({
    $: "Runtime.Parsed",
    has_error: false,
    root_type: "program",
    end_utf16: end,
    named_children: 1
  });
  const effect = "Runtime.parser_request",
    events = [];
  let closed = 0;
  const delayed = createDispatcher(start, {
    [effect]: (name, configured, {
      signal
    }) => new Promise((resolve, reject) => {
      events.push("start:" + name);
      let timer;
      const abort = () => {
        clearTimeout(timer);
        closed++;
        events.push("closed:" + name);
        reject(new Error("cancelled"));
      };
      signal?.addEventListener("abort", abort, {
        once: true
      });
      timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        closed++;
        events.push("reply:" + name);
        resolve(parsed(Number(name)));
      }, name === "1" ? 30 : 5);
    })
  });
  let heartbeat = false;
  setTimeout(() => {
    heartbeat = true;
  }, 0);
  const results = await Promise.all([delayed(["1", true]), delayed(["2", true])]);
  assert.deepEqual(results.map(x => x.end_utf16), [1, 2]);
  assert.ok(events.indexOf("reply:2") < events.indexOf("reply:1"));
  assert.ok(heartbeat);
  const pre = new AbortController();
  pre.abort();
  const before = events.length;
  await assert.rejects(delayed(["3", true], {
    signal: pre.signal
  }), e => e.code === "aborted");
  assert.equal(events.length, before);
  const pending = new AbortController(),
    cancelled = delayed(["1", true], {
      signal: pending.signal
    });
  setTimeout(() => pending.abort(), 1);
  await assert.rejects(cancelled, e => e.code === "aborted");
  assert.ok(events.includes("closed:1"));
  let deliverLate,
    continuations = 0;
  const late = createDispatcher((...a) => {
    const op = start(...a);
    return {
      ...op,
      kont: reply => {
        continuations++;
        return op.kont(reply);
      }
    };
  }, {
    [effect]: () => new Promise(resolve => {
      deliverLate = resolve;
    })
  });
  const controller = new AbortController(),
    aborted = late(["99", true], {
      signal: controller.signal
    });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(aborted, e => e.code === "aborted");
  deliverLate(parsed(99));
  await Promise.resolve();
  assert.equal(continuations, 0);
  assert.equal((await delayed(["4", true])).end_utf16, 4);
  const rejects = createDispatcher(start, {
    [effect]: () => Promise.reject(new Error("engine transport failure"))
  });
  await assert.rejects(rejects(["x", true]), e => e.code === "handler-rejected");
  assert.equal(globalThis.BEND_IO, prior);
  const abortBeforeContinuation = new AbortController(),
    race = createDispatcher(start, {
      [effect]: () => {
        abortBeforeContinuation.abort();
        return parsed(1);
      }
    });
  await assert.rejects(race(["x", true], {
    signal: abortBeforeContinuation.signal
  }), e => e.code === "aborted");
  for (const result of [() => {
    throw new Error("sync rejection");
  }, () => ({
    then(_resolve, reject) {
      reject(new Error("thenable rejection"));
    }
  })]) await assert.rejects(createDispatcher(start, {
    [effect]: result
  })(["x", true]), error => error.code === "handler-rejected");
  const continuationError = new Error("compiled continuation failure");
  await assert.rejects(createDispatcher(() => ({
    $: effect,
    args: [],
    kont() {
      throw continuationError;
    }
  }), {
    [effect]: () => parsed(1)
  })([]), error => error === continuationError);
  const shared = new Map(),
    ordering = [];
  const sharedInvoke = createDispatcher(startMany, {
    [effect]: name => {
      ordering.push(name);
      shared.set(name, (shared.get(name) ?? 0) + 1);
      return name.endsWith(" ") ? new Promise(resolve => setTimeout(() => resolve(parsed(name.length)), 0)) : parsed(name.length);
    }
  });
  await Promise.all([sharedInvoke([1, "a", true]), sharedInvoke([1, "b", true])]);
  assert.deepEqual(ordering, ["a", "b", "a ", "b "]);
  assert.deepEqual([...shared], [["a", 1], ["b", 1], ["a ", 1], ["b ", 1]]);
  const suppliedSignal = new AbortController(),
    between = [];
  const betweenInvoke = createDispatcher(startMany, {
    [effect]: name => {
      between.push(name);
      if (name.endsWith(" ")) suppliedSignal.abort();
      return parsed(name.length);
    }
  });
  await assert.rejects(betweenInvoke([2, "a", true], {
    signal: suppliedSignal.signal
  }), error => error.code === "aborted");
  assert.deepEqual(between, ["a", "a "]);
  for (const malformed of [null, {
    $: "Emit"
  }, {
    $: "Unknown",
    args: [],
    kont: x => x
  }, {
    $: 1,
    args: [],
    kont: x => x
  }, Object.assign(Object.create({
    args: []
  }), {
    $: effect,
    kont: x => x
  }), Object.assign(Object.create({
    kont: x => x
  }), {
    $: effect,
    args: []
  }), Object.assign(Object.create({
    $: effect
  }), {
    args: [],
    kont: x => x
  })]) await assert.rejects(createDispatcher(() => malformed, {})([]), TransportFailure);
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    actualNativeForeignCalls: 4,
    immediate: true,
    sequential: true,
    overlapReversed: true,
    eventLoopHeartbeat: true,
    preAbort: true,
    waitingAbort: true,
    lateResponseFenced: true,
    beforeContinuationAbort: true,
    handlerRejection: true,
    cleanupFailureVisible: true,
    globalRuntimeContextUnchanged: true,
    unknownLayoutRejected: true,
    multipleCompiledEffects: true,
    continuationForms,
    explicitAllowlist: true,
    closed,
    events,
    scope: "technical sequential foreign-effect dispatcher over actual emitted Bend continuations; not full resolver or adoption; synchronous engine plus controlled async lifecycle fixtures; no process.exit/BEND_IO scheduling"
  };
  writeFileSync(join(folder, "embedding-" + record.runtime + "-evidence.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({
    runtime: record.runtime,
    passed: true,
    actualNativeForeignCalls: 4,
    lateContinuationCount: continuations
  }));
} finally {
  rmSync(temp, {
    recursive: true,
    force: true
  });
}
