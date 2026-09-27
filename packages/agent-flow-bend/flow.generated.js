function word_to_u32(w) {
  let x = 0;
  for (let i = 0; w.$ === "WCon"; i++) {
    x |= Number(w.head) << i;
    w = w.tail;
  }
  return x >>> 0;
}

function u32_to_word(x) {
  let w = {$: "WNil"};
  for (let i = 31; i >= 0; i--) {
    w = {$: "WCon", head: ((x >>> i) & 1) === 1, tail: w};
  }
  return w;
}

function cmp_new(a, b) {
  return {$: a < b ? "LT"
    : a === b ? "EQ" : "GT"};
}

function nat_divmod(a, b) {
  return b === 0n ? {$: "Tuple", fst: 0n, snd: a}
    : {$: "Tuple", fst: a / b, snd: a % b};
}

function nat_chk(n) {
  if (n > 281474976710655n) {
    throw "bend: a Nat past the largest immediate 2^48-1";
  }
  return n;
}

function f32_show(x) {
  if (x !== x) {
    return "nan";
  }
  if (!Number.isFinite(x) || Object.is(x, -0)) {
    return x < 0 ? "-inf"
      : x === 0 ? "-0" : "inf";
  }
  let s = "x";
  for (let p = 1; p <= 9 && Math.fround(Number(s)) !== x; p += 1) {
    s = String(Number(x.toExponential(p - 1)));
  }
  return s;
}

function f32_bits(x) {
  return new Uint32Array(new Float32Array([x]).buffer)[0];
}

function f32_from_bits(u) {
  return new Float32Array(new Uint32Array([u]).buffer)[0];
}

function f32_read(s) {
  const re = /^\s*[+-]?((\d+\.?\d*|\.\d+)(e[+-]?\d+)?|inf(inity)?|nan)$/i;
  const v = Number(s.replace(/inf\w*/i, "Infinity"));
  return re.test(s) ? {$: "Some", value: Math.fround(v)} : {$: "None"};
}

function char_new(code) {
  if (code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) {
    throw "bend: " + code + " is not a Unicode scalar value";
  }
  return String.fromCodePoint(code);
}

// Array
// =====

function array_new(d, v) {
  if (d > 31n) {
    throw "bend: an array past the deepest block class 31";
  }
  return Array(2 ** Number(d)).fill(v);
}

// An unbalanced tree fails, as in C.
function array_node(a, b) {
  if (a.length !== b.length) {
    throw "bend: runtime fail-stop";
  }
  return a.concat(b);
}

function array_swap(a, i, v) {
  const at = i % a.length;
  const old = a[at];
  a[at] = v;
  return {$: "Tuple", fst: a, snd: old};
}

// Run
// ===

function run_jump(f, x) {
  return {$: "$JMP", f: f, x: x};
}

function run_tail(f, x) {
  return {$: "$JMP", f: f.j?.f === f ? f.j : f, x: [x]};
}

function run_clo(j) {
  const f = (x) => run_loop(j(x));
  f.j = j;
  j.f = f;
  return f;
}

function run_loop(r) {
  while (r !== null && typeof r === "object" && r.$ === "$JMP") {
    r = r.f(...r.x);
  }
  return r;
}

function run_lib(f, n) {
  return (...a) => a.length < n ? run_lib((...b) => f(...a, ...b), n - a.length)
    : run_loop(f(...a));
}
// Program
// =======

function $main$() {
  const initial_0 = run_loop($Flow$initial$());
  const result_0 = run_loop($Flow$step$(initial_0, {$: "EditObserved"}, {$: "None"}));
  return {$: "Tuple", ["fst"]: result_0, ["snd"]: run_loop($Flow$changes$(initial_0, {$: "EditObserved"}, {$: "None"}, result_0))};
}

function $Flow$initial$() {
  return {$: "Flow", ["packets"]: {$: "Nil"}, ["next_id"]: 1n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["round_id"]: 0n, ["active"]: false, ["continuations"]: 0n, ["waiting"]: false, ["background_available"]: false, ["lease"]: {$: "None"}, ["leased_id"]: {$: "None"}, ["last_surface"]: {$: "None"}, ["last_id"]: {$: "None"}, ["background_submitted"]: {$: "Nil"}};
}

function $Flow$step$(flow_0, event_0, item_id_0) {
  if (event_0.$ === "EditObserved") {
    return run_jump($Flow$edit$, [flow_0]);
  } else if (event_0.$ === "SourceCapacitySet") {
    const capacity_0 = event_0.capacity;
    return run_jump($Flow$set_capacity$, [flow_0, capacity_0, true]);
  } else if (event_0.$ === "ReviewCapacitySet") {
    const capacity_1 = event_0.capacity;
    return run_jump($Flow$set_capacity$, [flow_0, capacity_1, false]);
  } else if (event_0.$ === "IngressStarted") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else if (event_0.$ === "UnitDispatched") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else if (event_0.$ === "JevRequestSent") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else if (event_0.$ === "BackgroundWaitStarted") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else if (event_0.$ === "AdviceLeasedByStop") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else if (event_0.$ === "AdviceReofferedAtStop") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else if (event_0.$ === "StopAllowed") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else if (event_0.$ === "FinishResponseRequested") {
    return run_jump($Flow$reject$, [flow_0, {$: "InternalEvent"}]);
  } else {
    return run_jump($Flow$step$active$, [flow_0, event_0, item_id_0, run_loop($Flow$is_active$(flow_0))]);
  }
}

function $Flow$changes$(before_0, event_0, selected_0, result_0) {
  if (result_0.$ === "Rejected") {
    const __0 = result_0.state;
    const __1 = result_0.reason;
    return {$: "Nil"};
  } else {
    const __2 = result_0.state;
    const decision_0 = result_0.decision;
    const mid_0 = result_0.settled;
    return run_jump($Flow$changes$accepted$, [before_0, event_0, selected_0, decision_0, mid_0]);
  }
}

function $Flow$edit$(flow_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const source_capacity_0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const active_0 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const __0 = flow_0.background_available;
  const lease_0 = flow_0.lease;
  const leased_id_0 = flow_0.leased_id;
  const last_surface_0 = flow_0.last_surface;
  const last_id_0 = flow_0.last_id;
  const background_submitted_0 = flow_0.background_submitted;
  return run_jump($Flow$edit$open$, [packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, lease_0, leased_id_0, last_surface_0, last_id_0, background_submitted_0]);
}

function $Flow$set_capacity$(flow_0, capacity_0, source_0) {
  return run_jump($Flow$set_capacity$choose$, [flow_0, capacity_0, source_0, run_loop($Flow$capacity_valid$(capacity_0))]);
}

function $Flow$reject$(flow_0, reason_0) {
  return {$: "Rejected", ["state"]: flow_0, ["reason"]: reason_0};
}

function $Flow$step$active$(flow_0, event_0, item_id_0, active_0) {
  if (!active_0) {
    return run_jump($Flow$reject$, [flow_0, {$: "VirtualRoundClosed"}]);
  } else {
    return run_jump($Flow$step$live$, [flow_0, event_0, item_id_0]);
  }
}

function $Flow$is_active$(flow_0) {
  const __0 = flow_0.packets;
  const __1 = flow_0.next_id;
  const __2 = flow_0.source_capacity;
  const __3 = flow_0.review_capacity;
  const __4 = flow_0.round_id;
  const active_0 = flow_0.active;
  const __5 = flow_0.continuations;
  const __6 = flow_0.waiting;
  const __7 = flow_0.background_available;
  const __8 = flow_0.lease;
  const __9 = flow_0.leased_id;
  const __10 = flow_0.last_surface;
  const __11 = flow_0.last_id;
  const __12 = flow_0.background_submitted;
  return active_0;
}

function $Flow$changes$accepted$(before_0, event_0, selected_0, decision_0, mid_0) {
  const old_packets_0 = before_0.packets;
  const next_id_0 = before_0.next_id;
  const __0 = before_0.source_capacity;
  const __1 = before_0.review_capacity;
  const __2 = before_0.round_id;
  const old_active_0 = before_0.active;
  const continuations_0 = before_0.continuations;
  const __3 = before_0.waiting;
  const old_background_0 = before_0.background_available;
  const __4 = before_0.lease;
  const __5 = before_0.leased_id;
  const __6 = before_0.last_surface;
  const __7 = before_0.last_id;
  const __8 = before_0.background_submitted;
  const mid_packets_0 = mid_0.packets;
  const __9 = mid_0.next_id;
  const __10 = mid_0.source_capacity;
  const __11 = mid_0.review_capacity;
  const round_id_0 = mid_0.round_id;
  const mid_active_0 = mid_0.active;
  const __12 = mid_0.continuations;
  const __13 = mid_0.waiting;
  const __14 = mid_0.background_available;
  const __15 = mid_0.lease;
  const __16 = mid_0.leased_id;
  const __17 = mid_0.last_surface;
  const __18 = mid_0.last_id;
  const __19 = mid_0.background_submitted;
  const own_item_0 = run_loop($Flow$event_item$(event_0, selected_0, {$: "Flow", ["packets"]: old_packets_0, ["next_id"]: next_id_0, ["source_capacity"]: __0, ["review_capacity"]: __1, ["round_id"]: __2, ["active"]: old_active_0, ["continuations"]: continuations_0, ["waiting"]: __3, ["background_available"]: old_background_0, ["lease"]: __4, ["leased_id"]: __5, ["last_surface"]: __6, ["last_id"]: __7, ["background_submitted"]: __8}));
  const own_0 = run_loop($Flow$own_change$(event_0, {$: "Flow", ["packets"]: old_packets_0, ["next_id"]: next_id_0, ["source_capacity"]: __0, ["review_capacity"]: __1, ["round_id"]: __2, ["active"]: old_active_0, ["continuations"]: continuations_0, ["waiting"]: __3, ["background_available"]: old_background_0, ["lease"]: __4, ["leased_id"]: __5, ["last_surface"]: __6, ["last_id"]: __7, ["background_submitted"]: __8}, own_item_0));
  const opening_0 = run_loop($Flow$opened$(old_active_0, mid_active_0, round_id_0));
  const emitted_0 = run_loop($Flow$emission$(event_0, own_item_0));
  const started_source_0 = run_loop($Flow$schedule_source$(event_0, next_id_0, run_loop($Flow$ids$({$: "EditQueue"}, old_packets_0)), mid_packets_0));
  const started_review_0 = run_loop($Flow$schedule_review$(event_0, own_item_0, run_loop($Flow$ids$({$: "ReviewQueue"}, old_packets_0)), mid_packets_0));
  const finished_0 = run_loop($Flow$finish_changes$(event_0, continuations_0, decision_0, {$: "Flow", ["packets"]: mid_packets_0, ["next_id"]: __9, ["source_capacity"]: __10, ["review_capacity"]: __11, ["round_id"]: round_id_0, ["active"]: mid_active_0, ["continuations"]: __12, ["waiting"]: __13, ["background_available"]: __14, ["lease"]: __15, ["leased_id"]: __16, ["last_surface"]: __17, ["last_id"]: __18, ["background_submitted"]: __19}));
  const background_0 = run_loop($Flow$background_start$(event_0, old_background_0, own_item_0));
  return {$: "Con", ["head"]: own_0, ["tail"]: run_loop($List$append$(opening_0, run_loop($List$append$(emitted_0, run_loop($List$append$(started_source_0, run_loop($List$append$(started_review_0, run_loop($List$append$(finished_0, background_0))))))))))};
}

function $Flow$edit$open$(packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, lease_0, leased_id_0, last_surface_0, last_id_0, background_submitted_0) {
  if (active_0) {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: run_loop($List$append$(packets_0, {$: "Con", ["head"]: {$: "Packet", ["id"]: next_id_0, ["at"]: {$: "EditQueue"}}, ["tail"]: {$: "Nil"}})), ["next_id"]: nat_chk(next_id_0 + 1n), ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: true, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: true, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: background_submitted_0}]);
  } else {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: {$: "Con", ["head"]: {$: "Packet", ["id"]: next_id_0, ["at"]: {$: "EditQueue"}}, ["tail"]: {$: "Nil"}}, ["next_id"]: nat_chk(next_id_0 + 1n), ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: nat_chk(round_id_0 + 1n), ["active"]: true, ["continuations"]: 0n, ["waiting"]: false, ["background_available"]: true, ["lease"]: {$: "None"}, ["leased_id"]: {$: "None"}, ["last_surface"]: {$: "None"}, ["last_id"]: {$: "None"}, ["background_submitted"]: {$: "Nil"}}]);
  }
}

function $Flow$set_capacity$choose$(flow_0, capacity_0, source_0, valid_0) {
  if (!valid_0) {
    return run_jump($Flow$reject$, [flow_0, {$: "InvalidCapacity"}]);
  } else {
    return run_jump($Flow$set_capacity$valid$, [flow_0, capacity_0, source_0]);
  }
}

function $Flow$capacity_valid$(capacity_0) {
  const low_0 = capacity_0.low;
  const high_0 = capacity_0.high;
  const x_0 = run_loop($Nat$is_gt$(high_0, 0n));
  const x_1 = run_loop($Nat$is_gt$(low_0, 0n));
  return (x_0 || x_1);
}

function $Flow$step$live$(flow_0, event_0, item_id_0) {
  if (event_0.$ === "ReviewUnitPrepared") {
    return run_jump($Flow$apply_move$, [flow_0, {$: "Preparation"}, {$: "ReviewQueue"}, false, false, item_id_0]);
  } else if (event_0.$ === "JevFindingReceived") {
    return run_jump($Flow$apply_move$, [flow_0, {$: "Jev"}, {$: "AdviceStore"}, false, false, item_id_0]);
  } else if (event_0.$ === "JevClearReceived") {
    return run_jump($Flow$apply_move$, [flow_0, {$: "Jev"}, {$: "Jev"}, false, true, item_id_0]);
  } else if (event_0.$ === "JevUnavailable") {
    return run_jump($Flow$apply_move$, [flow_0, {$: "Jev"}, {$: "Jev"}, false, true, item_id_0]);
  } else if (event_0.$ === "StopHookFired") {
    return run_jump($Flow$stop$, [flow_0]);
  } else if (event_0.$ === "FinishDecisionDeadlineReached") {
    return run_jump($Flow$deadline$, [flow_0, {$: "FinishDecisionDeadlineReached"}]);
  } else if (event_0.$ === "FinishDecisionAllWorkSettled") {
    return run_jump($Flow$deadline$, [flow_0, {$: "FinishDecisionAllWorkSettled"}]);
  } else if (event_0.$ === "FinishDecisionBudgetExhausted") {
    return run_jump($Flow$deadline$, [flow_0, {$: "FinishDecisionBudgetExhausted"}]);
  } else if (event_0.$ === "AdviceLeasedByBackground") {
    return run_jump($Flow$lease_background$, [flow_0, item_id_0]);
  } else if (event_0.$ === "HostOutputSubmitted") {
    return run_jump($Flow$submit$, [flow_0]);
  } else {
    return run_jump($Flow$reject$, [flow_0, {$: "UnexpectedControl"}]);
  }
}

function $Flow$event_item$(event_0, selected_0, before_0) {
  const packets_0 = before_0.packets;
  const next_id_0 = before_0.next_id;
  const __0 = before_0.source_capacity;
  const __1 = before_0.review_capacity;
  const __2 = before_0.round_id;
  const __3 = before_0.active;
  const __4 = before_0.continuations;
  const __5 = before_0.waiting;
  const __6 = before_0.background_available;
  const __7 = before_0.lease;
  const leased_id_0 = before_0.leased_id;
  const __8 = before_0.last_surface;
  const __9 = before_0.last_id;
  const __10 = before_0.background_submitted;
  return run_jump($Flow$event_item$pick$, [event_0, selected_0, packets_0, next_id_0, leased_id_0]);
}

function $Flow$own_change$(event_0, before_0, item_0) {
  if (event_0.$ === "SourceCapacitySet") {
    const capacity_0 = event_0.capacity;
    const __0 = before_0.packets;
    const __1 = before_0.next_id;
    const previous_0 = before_0.source_capacity;
    const __2 = before_0.review_capacity;
    const __3 = before_0.round_id;
    const __4 = before_0.active;
    const __5 = before_0.continuations;
    const __6 = before_0.waiting;
    const __7 = before_0.background_available;
    const __8 = before_0.lease;
    const __9 = before_0.leased_id;
    const __10 = before_0.last_surface;
    const __11 = before_0.last_id;
    const __12 = before_0.background_submitted;
    return {$: "CapacityChanged", ["source"]: true, ["before"]: previous_0, ["after"]: capacity_0};
  } else if (event_0.$ === "ReviewCapacitySet") {
    const capacity_1 = event_0.capacity;
    const __13 = before_0.packets;
    const __14 = before_0.next_id;
    const __15 = before_0.source_capacity;
    const previous_1 = before_0.review_capacity;
    const __16 = before_0.round_id;
    const __17 = before_0.active;
    const __18 = before_0.continuations;
    const __19 = before_0.waiting;
    const __20 = before_0.background_available;
    const __21 = before_0.lease;
    const __22 = before_0.leased_id;
    const __23 = before_0.last_surface;
    const __24 = before_0.last_id;
    const __25 = before_0.background_submitted;
    return {$: "CapacityChanged", ["source"]: false, ["before"]: previous_1, ["after"]: capacity_1};
  } else {
    return {$: "Transition", ["event"]: event_0, ["route"]: run_loop($Flow$route_of$(event_0)), ["item"]: item_0};
  }
}

function $Flow$opened$(before_active_0, mid_active_0, round_id_0) {
  if (!before_active_0) {
    if (mid_active_0) {
      return {$: "Con", ["head"]: {$: "RoundOpened", ["id"]: round_id_0}, ["tail"]: {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else {
    return {$: "Nil"};
  }
}

function $Flow$emission$(event_0, item_0) {
  if (event_0.$ === "JevClearReceived") {
    if (item_0.$ === "Some") {
      const id_0 = item_0.value;
      return {$: "Con", ["head"]: {$: "Emitted", ["event"]: {$: "JevClearReceived"}, ["at"]: {$: "OutcomeStoreNode"}, ["item"]: id_0}, ["tail"]: {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else if (event_0.$ === "JevUnavailable") {
    if (item_0.$ === "Some") {
      const id_1 = item_0.value;
      return {$: "Con", ["head"]: {$: "Emitted", ["event"]: {$: "JevUnavailable"}, ["at"]: {$: "OutcomeStoreNode"}, ["item"]: id_1}, ["tail"]: {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else if (event_0.$ === "HostOutputSubmitted") {
    if (item_0.$ === "Some") {
      const id_2 = item_0.value;
      return {$: "Con", ["head"]: {$: "Emitted", ["event"]: {$: "HostOutputSubmitted"}, ["at"]: {$: "ObservedWriteNode"}, ["item"]: id_2}, ["tail"]: {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else {
    return {$: "Nil"};
  }
}

function $Flow$schedule_source$(event_0, next_id_0, old_edit_ids_0, packets_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const id_0 = _t_0.id;
    const place_0 = _t_0.at;
    const rest_0 = packets_0.tail;
    const x_0 = run_loop($Flow$contains$(id_0, old_edit_ids_0));
    const x_1 = run_loop($Bool$and$(run_loop($Flow$is_edit$(event_0)), run_loop($Nat$is_eq$(id_0, next_id_0))));
    const hit_0 = run_loop($Bool$and$(run_loop($Flow$same_place$(place_0, {$: "Preparation"})), (x_0 || x_1)));
    return run_jump($Flow$schedule_source$pick$, [id_0, run_loop($Flow$schedule_source$(event_0, next_id_0, old_edit_ids_0, rest_0)), hit_0]);
  }
}

function $Flow$ids$(place_0, packets_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const id_0 = _t_0.id;
    const location_0 = _t_0.at;
    const rest_0 = packets_0.tail;
    return run_jump($Flow$ids$pick$, [id_0, run_loop($Flow$ids$(place_0, rest_0)), run_loop($Flow$same_place$(location_0, place_0))]);
  }
}

function $Flow$schedule_review$(event_0, own_item_0, old_review_ids_0, packets_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const id_0 = _t_0.id;
    const place_0 = _t_0.at;
    const rest_0 = packets_0.tail;
    const x_0 = run_loop($Flow$contains$(id_0, old_review_ids_0));
    const x_1 = run_loop($Bool$and$(run_loop($Flow$is_prepared$(event_0)), run_loop($Flow$selected_is$(id_0, own_item_0))));
    const hit_0 = run_loop($Bool$and$(run_loop($Flow$same_place$(place_0, {$: "Jev"})), (x_0 || x_1)));
    return run_jump($Flow$schedule_review$pick$, [id_0, run_loop($Flow$schedule_review$(event_0, own_item_0, old_review_ids_0, rest_0)), hit_0]);
  }
}

function $Flow$finish_changes$(event_0, continuations_0, decision_0, mid_0) {
  if (decision_0.$ === "NoDecision") {
    return {$: "Nil"};
  } else {
    return run_jump($List$append$, [run_loop($Flow$finish_trigger$(event_0, continuations_0)), run_loop($Flow$finish_tail$(decision_0, mid_0))]);
  }
}

function $Flow$background_start$(event_0, available_0, item_0) {
  if (event_0.$ === "EditObserved") {
    if (!available_0) {
      if (item_0.$ === "Some") {
        const id_0 = item_0.value;
        return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "BackgroundWaitStarted"}, ["route"]: run_loop($Flow$route_of$({$: "BackgroundWaitStarted"})), ["item"]: {$: "Some", ["value"]: id_0}}, ["tail"]: {$: "Nil"}};
      } else {
        return {$: "Nil"};
      }
    } else {
      return {$: "Nil"};
    }
  } else {
    return {$: "Nil"};
  }
}

function $List$append$(xs_0, ys_0) {
  if (xs_0.$ === "Nil") {
    return ys_0;
  } else {
    const h_0 = xs_0.head;
    const t_0 = xs_0.tail;
    return {$: "Con", ["head"]: h_0, ["tail"]: run_loop($List$append$(t_0, ys_0))};
  }
}

function $Flow$accept$(flow_0) {
  const settled_0 = run_loop($Flow$settle$(flow_0));
  return run_jump($Flow$accept$after$, [settled_0, run_loop($Flow$ready_to_finish$(settled_0))]);
}

function $Flow$set_capacity$valid$(flow_0, capacity_0, source_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const __0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const active_0 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const background_available_0 = flow_0.background_available;
  const lease_0 = flow_0.lease;
  const leased_id_0 = flow_0.leased_id;
  const last_surface_0 = flow_0.last_surface;
  const last_id_0 = flow_0.last_id;
  const background_submitted_0 = flow_0.background_submitted;
  if (source_0) {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: next_id_0, ["source_capacity"]: capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: background_submitted_0}]);
  } else {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: next_id_0, ["source_capacity"]: __0, ["review_capacity"]: capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: background_submitted_0}]);
  }
}

function $Nat$is_gt$(a_0, b_0) {
  return run_jump($Cmp$is_gt$, [cmp_new(a_0, b_0)]);
}

function $Flow$apply_move$(flow_0, source_0, target_0, copy_0, terminal_0, selected_0) {
  const packets_0 = flow_0.packets;
  const __0 = flow_0.next_id;
  const __1 = flow_0.source_capacity;
  const __2 = flow_0.review_capacity;
  const __3 = flow_0.round_id;
  const __4 = flow_0.active;
  const __5 = flow_0.continuations;
  const __6 = flow_0.waiting;
  const __7 = flow_0.background_available;
  const __8 = flow_0.lease;
  const __9 = flow_0.leased_id;
  const __10 = flow_0.last_surface;
  const __11 = flow_0.last_id;
  const __12 = flow_0.background_submitted;
  return run_jump($Flow$apply_move$found$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: __0, ["source_capacity"]: __1, ["review_capacity"]: __2, ["round_id"]: __3, ["active"]: __4, ["continuations"]: __5, ["waiting"]: __6, ["background_available"]: __7, ["lease"]: __8, ["leased_id"]: __9, ["last_surface"]: __10, ["last_id"]: __11, ["background_submitted"]: __12}, source_0, target_0, copy_0, terminal_0, run_loop($Flow$find$(source_0, selected_0, packets_0))]);
}

function $Flow$stop$(flow_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const source_capacity_0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const active_0 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const background_available_0 = flow_0.background_available;
  const lease_0 = flow_0.lease;
  const leased_id_0 = flow_0.leased_id;
  const last_surface_0 = flow_0.last_surface;
  const last_id_0 = flow_0.last_id;
  const background_submitted_0 = flow_0.background_submitted;
  return run_jump($Flow$stop$choose$, [packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, background_available_0, lease_0, leased_id_0, last_surface_0, last_id_0, background_submitted_0]);
}

function $Flow$deadline$(flow_0, kind_0) {
  const __0 = flow_0.packets;
  const __1 = flow_0.next_id;
  const __2 = flow_0.source_capacity;
  const __3 = flow_0.review_capacity;
  const __4 = flow_0.round_id;
  const __5 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const __6 = flow_0.background_available;
  const __7 = flow_0.lease;
  const __8 = flow_0.leased_id;
  const __9 = flow_0.last_surface;
  const __10 = flow_0.last_id;
  const __11 = flow_0.background_submitted;
  return run_jump($Flow$deadline$wait$, [{$: "Flow", ["packets"]: __0, ["next_id"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["round_id"]: __4, ["active"]: __5, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: __6, ["lease"]: __7, ["leased_id"]: __8, ["last_surface"]: __9, ["last_id"]: __10, ["background_submitted"]: __11}, kind_0, continuations_0, waiting_0]);
}

function $Flow$lease_background$(flow_0, selected_0) {
  const __0 = flow_0.packets;
  const __1 = flow_0.next_id;
  const __2 = flow_0.source_capacity;
  const __3 = flow_0.review_capacity;
  const __4 = flow_0.round_id;
  const __5 = flow_0.active;
  const __6 = flow_0.continuations;
  const __7 = flow_0.waiting;
  const available_0 = flow_0.background_available;
  const lease_0 = flow_0.lease;
  const __8 = flow_0.leased_id;
  const __9 = flow_0.last_surface;
  const __10 = flow_0.last_id;
  const __11 = flow_0.background_submitted;
  return run_jump($Flow$lease_background$guard$, [{$: "Flow", ["packets"]: __0, ["next_id"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["round_id"]: __4, ["active"]: __5, ["continuations"]: __6, ["waiting"]: __7, ["background_available"]: available_0, ["lease"]: lease_0, ["leased_id"]: __8, ["last_surface"]: __9, ["last_id"]: __10, ["background_submitted"]: __11}, selected_0, available_0, run_loop($Flow$has_lease$(lease_0))]);
}

function $Flow$submit$(flow_0) {
  const __0 = flow_0.packets;
  const __1 = flow_0.next_id;
  const __2 = flow_0.source_capacity;
  const __3 = flow_0.review_capacity;
  const __4 = flow_0.round_id;
  const __5 = flow_0.active;
  const __6 = flow_0.continuations;
  const __7 = flow_0.waiting;
  const __8 = flow_0.background_available;
  const lease_0 = flow_0.lease;
  const leased_id_0 = flow_0.leased_id;
  const __9 = flow_0.last_surface;
  const __10 = flow_0.last_id;
  const __11 = flow_0.background_submitted;
  return run_jump($Flow$submit$lease$, [{$: "Flow", ["packets"]: __0, ["next_id"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["round_id"]: __4, ["active"]: __5, ["continuations"]: __6, ["waiting"]: __7, ["background_available"]: __8, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: __9, ["last_id"]: __10, ["background_submitted"]: __11}, lease_0, leased_id_0]);
}

function $Flow$event_item$pick$(event_0, selected_0, packets_0, next_id_0, leased_id_0) {
  if (event_0.$ === "EditObserved") {
    return {$: "Some", ["value"]: next_id_0};
  } else if (event_0.$ === "ReviewUnitPrepared") {
    return run_jump($Flow$find$, [{$: "Preparation"}, selected_0, packets_0]);
  } else if (event_0.$ === "JevFindingReceived") {
    return run_jump($Flow$find$, [{$: "Jev"}, selected_0, packets_0]);
  } else if (event_0.$ === "JevClearReceived") {
    return run_jump($Flow$find$, [{$: "Jev"}, selected_0, packets_0]);
  } else if (event_0.$ === "JevUnavailable") {
    return run_jump($Flow$find$, [{$: "Jev"}, selected_0, packets_0]);
  } else if (event_0.$ === "AdviceLeasedByBackground") {
    return run_jump($Flow$find$, [{$: "AdviceStore"}, selected_0, packets_0]);
  } else if (event_0.$ === "HostOutputSubmitted") {
    return leased_id_0;
  } else {
    return {$: "None"};
  }
}

function $Flow$route_of$(event_0) {
  if (event_0.$ === "EditObserved") {
    return {$: "DataRoute", ["from"]: {$: "AgentEditNode"}, ["to"]: {$: "EditQueueNode"}, ["input"]: {$: "EditObservation"}, ["output"]: {$: "CaptureJob"}, ["copy"]: false};
  } else if (event_0.$ === "IngressStarted") {
    return {$: "DataRoute", ["from"]: {$: "EditQueueNode"}, ["to"]: {$: "PreparationNode"}, ["input"]: {$: "CaptureJob"}, ["output"]: {$: "CaptureJob"}, ["copy"]: false};
  } else if (event_0.$ === "ReviewUnitPrepared") {
    return {$: "DataRoute", ["from"]: {$: "PreparationNode"}, ["to"]: {$: "ReviewQueueNode"}, ["input"]: {$: "CaptureJob"}, ["output"]: {$: "ReviewWorkItem"}, ["copy"]: false};
  } else if (event_0.$ === "UnitDispatched") {
    return {$: "DataRoute", ["from"]: {$: "ReviewQueueNode"}, ["to"]: {$: "JevDispatchNode"}, ["input"]: {$: "ReviewWorkItem"}, ["output"]: {$: "DecisionRequest"}, ["copy"]: false};
  } else if (event_0.$ === "JevRequestSent") {
    return {$: "DataRoute", ["from"]: {$: "JevDispatchNode"}, ["to"]: {$: "JevNode"}, ["input"]: {$: "DecisionRequest"}, ["output"]: {$: "NetworkRequest"}, ["copy"]: false};
  } else if (event_0.$ === "JevFindingReceived") {
    return {$: "DataRoute", ["from"]: {$: "JevNode"}, ["to"]: {$: "AdviceStoreNode"}, ["input"]: {$: "NetworkRequest"}, ["output"]: {$: "Advice"}, ["copy"]: false};
  } else if (event_0.$ === "JevClearReceived") {
    return {$: "DataRoute", ["from"]: {$: "JevNode"}, ["to"]: {$: "OutcomeStoreNode"}, ["input"]: {$: "NetworkRequest"}, ["output"]: {$: "ReviewStatus"}, ["copy"]: false};
  } else if (event_0.$ === "JevUnavailable") {
    return {$: "DataRoute", ["from"]: {$: "JevNode"}, ["to"]: {$: "OutcomeStoreNode"}, ["input"]: {$: "NetworkRequest"}, ["output"]: {$: "ReviewStatus"}, ["copy"]: false};
  } else if (event_0.$ === "BackgroundWaitStarted") {
    return {$: "ControlRoute", ["from"]: {$: "AgentEditNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["signal"]: {$: "BackgroundSignal"}};
  } else if (event_0.$ === "StopHookFired") {
    return {$: "ControlRoute", ["from"]: {$: "AgentEditNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["signal"]: {$: "StopSignal"}};
  } else if (event_0.$ === "FinishDecisionAllWorkSettled") {
    return {$: "ControlRoute", ["from"]: {$: "DeliveryStateNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["signal"]: {$: "SettledSignal"}};
  } else if (event_0.$ === "FinishDecisionDeadlineReached") {
    return {$: "ControlRoute", ["from"]: {$: "DeliveryStateNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["signal"]: {$: "DeadlineSignal"}};
  } else if (event_0.$ === "FinishDecisionBudgetExhausted") {
    return {$: "ControlRoute", ["from"]: {$: "DeliveryStateNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["signal"]: {$: "AllowSignal"}};
  } else if (event_0.$ === "AdviceLeasedByBackground") {
    return {$: "DataRoute", ["from"]: {$: "AdviceStoreNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["input"]: {$: "Advice"}, ["output"]: {$: "LeasedBatch"}, ["copy"]: true};
  } else if (event_0.$ === "AdviceLeasedByStop") {
    return {$: "DataRoute", ["from"]: {$: "AdviceStoreNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["input"]: {$: "Advice"}, ["output"]: {$: "LeasedBatch"}, ["copy"]: true};
  } else if (event_0.$ === "AdviceReofferedAtStop") {
    return {$: "DataRoute", ["from"]: {$: "AdviceStoreNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["input"]: {$: "Advice"}, ["output"]: {$: "LeasedBatch"}, ["copy"]: true};
  } else if (event_0.$ === "HostOutputSubmitted") {
    return {$: "DataRoute", ["from"]: {$: "AdvicePolicyNode"}, ["to"]: {$: "ObservedWriteNode"}, ["input"]: {$: "LeasedBatch"}, ["output"]: {$: "RuntimeSubmission"}, ["copy"]: false};
  } else if (event_0.$ === "StopAllowed") {
    return {$: "ControlRoute", ["from"]: {$: "AdvicePolicyNode"}, ["to"]: {$: "DeliveryStateNode"}, ["signal"]: {$: "AllowSignal"}};
  } else if (event_0.$ === "FinishResponseRequested") {
    return {$: "ControlRoute", ["from"]: {$: "AdvicePolicyNode"}, ["to"]: {$: "ResponseCommandNode"}, ["signal"]: {$: "ResponseSignal"}};
  } else if (event_0.$ === "SourceCapacitySet") {
    const __0 = event_0.capacity;
    return {$: "ControlRoute", ["from"]: {$: "AdvicePolicyNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["signal"]: {$: "AllowSignal"}};
  } else {
    const __1 = event_0.capacity;
    return {$: "ControlRoute", ["from"]: {$: "AdvicePolicyNode"}, ["to"]: {$: "AdvicePolicyNode"}, ["signal"]: {$: "AllowSignal"}};
  }
}

function $Bool$and$(a_0, b_0) {
  if (!a_0) {
    return false;
  } else {
    return b_0;
  }
}

function $Flow$same_place$(a_0, b_0) {
  if (a_0.$ === "EditQueue") {
    if (b_0.$ === "EditQueue") {
      return true;
    } else {
      return false;
    }
  } else if (a_0.$ === "Preparation") {
    if (b_0.$ === "Preparation") {
      return true;
    } else {
      return false;
    }
  } else if (a_0.$ === "ReviewQueue") {
    if (b_0.$ === "ReviewQueue") {
      return true;
    } else {
      return false;
    }
  } else if (a_0.$ === "Jev") {
    if (b_0.$ === "Jev") {
      return true;
    } else {
      return false;
    }
  } else if (a_0.$ === "AdviceStore") {
    if (b_0.$ === "AdviceStore") {
      return true;
    } else {
      return false;
    }
  } else {
    if (b_0.$ === "AdvicePolicy") {
      return true;
    } else {
      return false;
    }
  }
}

function $Flow$contains$(id_0, xs_0) {
  if (xs_0.$ === "Nil") {
    return false;
  } else {
    const x_0 = xs_0.head;
    const rest_0 = xs_0.tail;
    const x_1 = run_loop($Nat$is_eq$(x_0, id_0));
    const x_2 = run_loop($Flow$contains$(id_0, rest_0));
    return (x_1 || x_2);
  }
}

function $Flow$is_edit$(event_0) {
  if (event_0.$ === "EditObserved") {
    return true;
  } else {
    return false;
  }
}

function $Nat$is_eq$(a_0, b_0) {
  return run_jump($Cmp$is_eq$, [cmp_new(a_0, b_0)]);
}

function $Flow$schedule_source$pick$(id_0, tail_0, hit_0) {
  if (hit_0) {
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "IngressStarted"}, ["route"]: run_loop($Flow$route_of$({$: "IngressStarted"})), ["item"]: {$: "Some", ["value"]: id_0}}, ["tail"]: tail_0};
  } else {
    return tail_0;
  }
}

function $Flow$ids$pick$(id_0, rest_0, hit_0) {
  if (hit_0) {
    return {$: "Con", ["head"]: id_0, ["tail"]: rest_0};
  } else {
    return rest_0;
  }
}

function $Flow$is_prepared$(event_0) {
  if (event_0.$ === "ReviewUnitPrepared") {
    return true;
  } else {
    return false;
  }
}

function $Flow$selected_is$(id_0, selected_0) {
  if (selected_0.$ === "None") {
    return false;
  } else {
    const wanted_0 = selected_0.value;
    return run_jump($Nat$is_eq$, [id_0, wanted_0]);
  }
}

function $Flow$schedule_review$pick$(id_0, tail_0, hit_0) {
  if (hit_0) {
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "UnitDispatched"}, ["route"]: run_loop($Flow$route_of$({$: "UnitDispatched"})), ["item"]: {$: "Some", ["value"]: id_0}}, ["tail"]: {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "JevRequestSent"}, ["route"]: run_loop($Flow$route_of$({$: "JevRequestSent"})), ["item"]: {$: "Some", ["value"]: id_0}}, ["tail"]: tail_0}};
  } else {
    return tail_0;
  }
}

function $Flow$finish_trigger$(event_0, continuations_0) {
  if (event_0.$ === "FinishDecisionDeadlineReached") {
    return {$: "Nil"};
  } else if (event_0.$ === "FinishDecisionAllWorkSettled") {
    return {$: "Nil"};
  } else if (event_0.$ === "FinishDecisionBudgetExhausted") {
    return {$: "Nil"};
  } else if (event_0.$ === "StopHookFired") {
    return run_jump($Flow$finish_trigger$stop$, [(continuations_0 < 4n)]);
  } else {
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "FinishDecisionAllWorkSettled"}, ["route"]: run_loop($Flow$route_of$({$: "FinishDecisionAllWorkSettled"})), ["item"]: {$: "None"}}, ["tail"]: {$: "Nil"}};
  }
}

function $Flow$finish_tail$(decision_0, mid_0) {
  const packets_0 = mid_0.packets;
  const __0 = mid_0.next_id;
  const __1 = mid_0.source_capacity;
  const __2 = mid_0.review_capacity;
  const round_id_0 = mid_0.round_id;
  const __3 = mid_0.active;
  const __4 = mid_0.continuations;
  const __5 = mid_0.waiting;
  const __6 = mid_0.background_available;
  const __7 = mid_0.lease;
  const __8 = mid_0.leased_id;
  const __9 = mid_0.last_surface;
  const __10 = mid_0.last_id;
  const submitted_0 = mid_0.background_submitted;
  return run_jump($Flow$finish_tail$pick$, [decision_0, packets_0, round_id_0, submitted_0]);
}

function $Flow$settle$(flow_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const source_capacity_0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const _t_0 = flow_0.active;
  if (!_t_0) {
    const continuations_0 = flow_0.continuations;
    const waiting_0 = flow_0.waiting;
    const background_available_0 = flow_0.background_available;
    const lease_0 = flow_0.lease;
    const leased_id_0 = flow_0.leased_id;
    const last_surface_0 = flow_0.last_surface;
    const last_id_0 = flow_0.last_id;
    const background_submitted_0 = flow_0.background_submitted;
    return {$: "Flow", ["packets"]: packets_0, ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: false, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: background_submitted_0};
  } else {
    const continuations_1 = flow_0.continuations;
    const waiting_1 = flow_0.waiting;
    const background_available_1 = flow_0.background_available;
    const lease_1 = flow_0.lease;
    const leased_id_1 = flow_0.leased_id;
    const last_surface_1 = flow_0.last_surface;
    const last_id_1 = flow_0.last_id;
    const background_submitted_1 = flow_0.background_submitted;
    const started_0 = run_loop($Flow$fill_source$(packets_0, source_capacity_0, run_loop($Flow$count$({$: "Preparation"}, packets_0))));
    return {$: "Flow", ["packets"]: run_loop($Flow$fill_jev$(started_0, review_capacity_0, run_loop($Flow$count$({$: "Jev"}, started_0)))), ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: true, ["continuations"]: continuations_1, ["waiting"]: waiting_1, ["background_available"]: background_available_1, ["lease"]: lease_1, ["leased_id"]: leased_id_1, ["last_surface"]: last_surface_1, ["last_id"]: last_id_1, ["background_submitted"]: background_submitted_1};
  }
}

function $Flow$accept$after$(flow_0, ready_0) {
  if (ready_0) {
    return run_jump($Flow$finish$, [flow_0]);
  } else {
    return {$: "Accepted", ["state"]: flow_0, ["decision"]: {$: "NoDecision"}, ["settled"]: flow_0};
  }
}

function $Flow$ready_to_finish$(flow_0) {
  const __0 = flow_0.packets;
  const __1 = flow_0.next_id;
  const __2 = flow_0.source_capacity;
  const __3 = flow_0.review_capacity;
  const __4 = flow_0.round_id;
  const __5 = flow_0.active;
  const __6 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const __7 = flow_0.background_available;
  const __8 = flow_0.lease;
  const __9 = flow_0.leased_id;
  const __10 = flow_0.last_surface;
  const __11 = flow_0.last_id;
  const __12 = flow_0.background_submitted;
  return run_jump($Bool$and$, [waiting_0, run_loop($Bool$not$(run_loop($Flow$work_pending$({$: "Flow", ["packets"]: __0, ["next_id"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["round_id"]: __4, ["active"]: __5, ["continuations"]: __6, ["waiting"]: waiting_0, ["background_available"]: __7, ["lease"]: __8, ["leased_id"]: __9, ["last_surface"]: __10, ["last_id"]: __11, ["background_submitted"]: __12}))))]);
}

function $Cmp$is_gt$(c_0) {
  if (c_0.$ === "LT") {
    return false;
  } else if (c_0.$ === "EQ") {
    return false;
  } else {
    return true;
  }
}

function $Flow$apply_move$found$(flow_0, source_0, target_0, copy_0, terminal_0, found_0) {
  if (found_0.$ === "None") {
    return run_jump($Flow$reject$, [flow_0, {$: "MissingPacket"}]);
  } else {
    const id_0 = found_0.value;
    return run_jump($Flow$apply_move$do$, [flow_0, source_0, target_0, copy_0, terminal_0, id_0]);
  }
}

function $Flow$find$(place_0, selected_0, packets_0) {
  if (packets_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = packets_0.head;
    const id_0 = _t_0.id;
    const location_0 = _t_0.at;
    const rest_0 = packets_0.tail;
    return run_jump($Flow$find$pick$, [id_0, selected_0, run_loop($Flow$find$(place_0, selected_0, rest_0)), run_loop($Flow$same_place$(location_0, place_0))]);
  }
}

function $Flow$stop$choose$(packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, background_available_0, lease_0, leased_id_0, last_surface_0, last_id_0, background_submitted_0) {
  if (waiting_0) {
    return run_jump($Flow$reject$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: true, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: background_submitted_0}, {$: "FinishDecisionAlreadyOpen"}]);
  } else {
    return run_jump($Flow$stop$budget$, [packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, background_available_0, lease_0, leased_id_0, last_surface_0, last_id_0, background_submitted_0, (continuations_0 < 4n)]);
  }
}

function $Flow$deadline$wait$(flow_0, kind_0, continuations_0, waiting_0) {
  if (!waiting_0) {
    return run_jump($Flow$reject$, [flow_0, {$: "StopNotWaiting"}]);
  } else {
    return run_jump($Flow$deadline$kind$, [flow_0, kind_0, continuations_0]);
  }
}

function $Flow$lease_background$guard$(flow_0, selected_0, available_0, busy_0) {
  if (!available_0) {
    return run_jump($Flow$reject$, [flow_0, {$: "BackgroundNotRequested"}]);
  } else {
    if (busy_0) {
      return run_jump($Flow$reject$, [flow_0, {$: "LeaseBusy"}]);
    } else {
      return run_jump($Flow$lease_find$, [flow_0, selected_0, {$: "Background"}]);
    }
  }
}

function $Flow$has_lease$(lease_0) {
  if (lease_0.$ === "None") {
    return false;
  } else {
    const __0 = lease_0.value;
    return true;
  }
}

function $Flow$submit$lease$(flow_0, lease_0, leased_id_0) {
  if (lease_0.$ === "None") {
    return run_jump($Flow$reject$, [flow_0, {$: "NoLease"}]);
  } else {
    const surface_0 = lease_0.value;
    if (leased_id_0.$ === "Some") {
      const id_0 = leased_id_0.value;
      return run_jump($Flow$submit$run$, [flow_0, surface_0, id_0]);
    } else {
      return run_jump($Flow$reject$, [flow_0, {$: "NoLease"}]);
    }
  }
}

function $Cmp$is_eq$(c_0) {
  if (c_0.$ === "LT") {
    return false;
  } else if (c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Flow$finish_trigger$stop$(under_budget_0) {
  if (under_budget_0) {
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "FinishDecisionAllWorkSettled"}, ["route"]: run_loop($Flow$route_of$({$: "FinishDecisionAllWorkSettled"})), ["item"]: {$: "None"}}, ["tail"]: {$: "Nil"}};
  } else {
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "FinishDecisionBudgetExhausted"}, ["route"]: run_loop($Flow$route_of$({$: "FinishDecisionBudgetExhausted"})), ["item"]: {$: "None"}}, ["tail"]: {$: "Nil"}};
  }
}

function $Flow$finish_tail$pick$(decision_0, packets_0, round_id_0, submitted_0) {
  if (decision_0.$ === "NoDecision") {
    return {$: "Nil"};
  } else if (decision_0.$ === "ContinueWithAdvice") {
    const advice_ids_0 = decision_0.ids;
    const __0 = decision_0.discarded;
    const __1 = decision_0.cancelled_source;
    const __2 = decision_0.cancelled_jev;
    return run_jump($List$append$, [run_loop($Flow$finish_leases$(advice_ids_0, submitted_0)), {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "FinishResponseRequested"}, ["route"]: run_loop($Flow$route_of$({$: "FinishResponseRequested"})), ["item"]: run_loop($Flow$first_id$(advice_ids_0))}, ["tail"]: {$: "Con", ["head"]: {$: "FinishDecision", ["decision"]: {$: "ContinueWithAdvice", ["ids"]: advice_ids_0, ["discarded"]: __0, ["cancelled_source"]: __1, ["cancelled_jev"]: __2}}, ["tail"]: {$: "Nil"}}}]);
  } else {
    const __3 = decision_0.discarded;
    const __4 = decision_0.cancelled_source;
    const __5 = decision_0.cancelled_jev;
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "StopAllowed"}, ["route"]: run_loop($Flow$route_of$({$: "StopAllowed"})), ["item"]: {$: "None"}}, ["tail"]: {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "FinishResponseRequested"}, ["route"]: run_loop($Flow$route_of$({$: "FinishResponseRequested"})), ["item"]: {$: "None"}}, ["tail"]: {$: "Con", ["head"]: {$: "FinishDecision", ["decision"]: {$: "AllowFinish", ["discarded"]: __3, ["cancelled_source"]: __4, ["cancelled_jev"]: __5}}, ["tail"]: {$: "Con", ["head"]: {$: "RoundClosed", ["id"]: round_id_0, ["discarded"]: run_loop($List$length$(run_loop($Flow$distinct$(run_loop($Flow$all_ids$(packets_0)), {$: "Nil"}))))}, ["tail"]: {$: "Nil"}}}}};
  }
}

function $Flow$fill_source$(packets_0, capacity_0, occupied_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const id_0 = _t_0.id;
    const _t_1 = _t_0.at;
    if (_t_1.$ === "EditQueue") {
      const rest_0 = packets_0.tail;
      const room_0 = run_loop($Flow$has_room$(occupied_0, capacity_0));
      const new_place_0 = run_loop($Bool$pick$(room_0, {$: "Preparation"}, {$: "EditQueue"}));
      const x_0 = run_loop($Bool$pick$(room_0, 1n, 0n));
      const new_occupied_0 = nat_chk(occupied_0 + x_0);
      return {$: "Con", ["head"]: {$: "Packet", ["id"]: id_0, ["at"]: new_place_0}, ["tail"]: run_loop($Flow$fill_source$(rest_0, capacity_0, new_occupied_0))};
    } else {
      const rest_1 = packets_0.tail;
      return {$: "Con", ["head"]: {$: "Packet", ["id"]: id_0, ["at"]: _t_1}, ["tail"]: run_loop($Flow$fill_source$(rest_1, capacity_0, occupied_0))};
    }
  }
}

function $Flow$count$(place_0, packets_0) {
  if (packets_0.$ === "Nil") {
    return 0n;
  } else {
    const p_0 = packets_0.head;
    const rest_0 = packets_0.tail;
    const x_0 = run_loop($Bool$pick$(run_loop($Flow$at$(place_0, p_0)), 1n, 0n));
    const x_1 = run_loop($Flow$count$(place_0, rest_0));
    return nat_chk(x_0 + x_1);
  }
}

function $Flow$fill_jev$(packets_0, capacity_0, occupied_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const id_0 = _t_0.id;
    const _t_1 = _t_0.at;
    if (_t_1.$ === "ReviewQueue") {
      const rest_0 = packets_0.tail;
      const room_0 = run_loop($Flow$has_room$(occupied_0, capacity_0));
      const new_place_0 = run_loop($Bool$pick$(room_0, {$: "Jev"}, {$: "ReviewQueue"}));
      const x_0 = run_loop($Bool$pick$(room_0, 1n, 0n));
      const new_occupied_0 = nat_chk(occupied_0 + x_0);
      return {$: "Con", ["head"]: {$: "Packet", ["id"]: id_0, ["at"]: new_place_0}, ["tail"]: run_loop($Flow$fill_jev$(rest_0, capacity_0, new_occupied_0))};
    } else {
      const rest_1 = packets_0.tail;
      return {$: "Con", ["head"]: {$: "Packet", ["id"]: id_0, ["at"]: _t_1}, ["tail"]: run_loop($Flow$fill_jev$(rest_1, capacity_0, occupied_0))};
    }
  }
}

function $Flow$finish$(flow_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const source_capacity_0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const __0 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const __1 = flow_0.waiting;
  const __2 = flow_0.background_available;
  const __3 = flow_0.lease;
  const __4 = flow_0.leased_id;
  const __5 = flow_0.last_surface;
  const __6 = flow_0.last_id;
  const submitted_0 = flow_0.background_submitted;
  const advice_0 = run_loop($Flow$ids$({$: "AdviceStore"}, packets_0));
  const can_continue_0 = run_loop($Bool$and$(run_loop($Bool$not$(run_loop($List$is_empty$(advice_0)))), (continuations_0 < 4n)));
  return run_jump($Flow$finish$choose$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: __0, ["continuations"]: continuations_0, ["waiting"]: __1, ["background_available"]: __2, ["lease"]: __3, ["leased_id"]: __4, ["last_surface"]: __5, ["last_id"]: __6, ["background_submitted"]: submitted_0}, packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, continuations_0, submitted_0, advice_0, can_continue_0]);
}

function $Bool$not$(b_0) {
  if (!b_0) {
    return true;
  } else {
    return false;
  }
}

function $Flow$work_pending$(flow_0) {
  const packets_0 = flow_0.packets;
  const __0 = flow_0.next_id;
  const __1 = flow_0.source_capacity;
  const __2 = flow_0.review_capacity;
  const __3 = flow_0.round_id;
  const __4 = flow_0.active;
  const __5 = flow_0.continuations;
  const __6 = flow_0.waiting;
  const __7 = flow_0.background_available;
  const lease_0 = flow_0.lease;
  const __8 = flow_0.leased_id;
  const __9 = flow_0.last_surface;
  const __10 = flow_0.last_id;
  const __11 = flow_0.background_submitted;
  const x_0 = run_loop($Flow$unfinished$(packets_0));
  const x_1 = run_loop($Flow$has_lease$(lease_0));
  return (x_0 || x_1);
}

function $Flow$apply_move$do$(flow_0, source_0, target_0, copy_0, terminal_0, id_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const source_capacity_0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const active_0 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const background_available_0 = flow_0.background_available;
  const lease_0 = flow_0.lease;
  const leased_id_0 = flow_0.leased_id;
  const last_surface_0 = flow_0.last_surface;
  const last_id_0 = flow_0.last_id;
  const submitted_0 = flow_0.background_submitted;
  if (terminal_0) {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: run_loop($Flow$remove_one$(id_0, source_0, packets_0)), ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: submitted_0}]);
  } else {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: run_loop($Flow$move_one$(id_0, source_0, target_0, copy_0, packets_0)), ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: submitted_0}]);
  }
}

function $Flow$find$pick$(id_0, selected_0, fallback_0, same_place_0) {
  if (selected_0.$ === "None") {
    if (!same_place_0) {
      return fallback_0;
    } else {
      return {$: "Some", ["value"]: id_0};
    }
  } else {
    const wanted_0 = selected_0.value;
    if (!same_place_0) {
      return fallback_0;
    } else {
      return run_jump($Flow$find$id_match$, [id_0, fallback_0, run_loop($Nat$is_eq$(wanted_0, id_0))]);
    }
  }
}

function $Flow$stop$budget$(packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, background_available_0, lease_0, leased_id_0, last_surface_0, last_id_0, background_submitted_0, under_budget_0) {
  if (under_budget_0) {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: true, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: background_submitted_0}]);
  } else {
    return run_jump($Flow$finish$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: true, ["background_available"]: background_available_0, ["lease"]: lease_0, ["leased_id"]: leased_id_0, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: background_submitted_0}]);
  }
}

function $Flow$deadline$kind$(flow_0, kind_0, continuations_0) {
  if (kind_0.$ === "FinishDecisionAllWorkSettled") {
    return run_jump($Flow$deadline$settled$, [flow_0, run_loop($Flow$work_pending$(flow_0))]);
  } else if (kind_0.$ === "FinishDecisionBudgetExhausted") {
    return run_jump($Flow$deadline$budget$, [flow_0, (continuations_0 < 4n)]);
  } else {
    return run_jump($Flow$finish$, [flow_0]);
  }
}

function $Flow$lease_find$(flow_0, selected_0, surface_0) {
  const packets_0 = flow_0.packets;
  const __0 = flow_0.next_id;
  const __1 = flow_0.source_capacity;
  const __2 = flow_0.review_capacity;
  const __3 = flow_0.round_id;
  const __4 = flow_0.active;
  const __5 = flow_0.continuations;
  const __6 = flow_0.waiting;
  const __7 = flow_0.background_available;
  const __8 = flow_0.lease;
  const __9 = flow_0.leased_id;
  const __10 = flow_0.last_surface;
  const __11 = flow_0.last_id;
  const __12 = flow_0.background_submitted;
  return run_jump($Flow$lease_found$, [{$: "Flow", ["packets"]: packets_0, ["next_id"]: __0, ["source_capacity"]: __1, ["review_capacity"]: __2, ["round_id"]: __3, ["active"]: __4, ["continuations"]: __5, ["waiting"]: __6, ["background_available"]: __7, ["lease"]: __8, ["leased_id"]: __9, ["last_surface"]: __10, ["last_id"]: __11, ["background_submitted"]: __12}, surface_0, run_loop($Flow$find$({$: "AdviceStore"}, selected_0, packets_0))]);
}

function $Flow$submit$run$(flow_0, surface_0, id_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const source_capacity_0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const active_0 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const available_0 = flow_0.background_available;
  const __0 = flow_0.lease;
  const __1 = flow_0.leased_id;
  const __2 = flow_0.last_surface;
  const __3 = flow_0.last_id;
  const submitted_0 = flow_0.background_submitted;
  return run_jump($Flow$submit$surface$, [packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, available_0, submitted_0, surface_0, id_0]);
}

function $Flow$finish_leases$(ids_0, submitted_0) {
  if (ids_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const id_0 = ids_0.head;
    const rest_0 = ids_0.tail;
    return run_jump($Flow$finish_leases$pick$, [id_0, run_loop($Flow$finish_leases$(rest_0, submitted_0)), run_loop($Flow$contains$(id_0, submitted_0))]);
  }
}

function $Flow$first_id$(ids_0) {
  if (ids_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const id_0 = ids_0.head;
    const __0 = ids_0.tail;
    return {$: "Some", ["value"]: id_0};
  }
}

function $List$length$(xs_0) {
  if (xs_0.$ === "Nil") {
    return 0n;
  } else {
    const h_0 = xs_0.head;
    const t_0 = xs_0.tail;
    return nat_chk(run_loop($List$length$(t_0)) + 1n);
  }
}

function $Flow$distinct$(xs_0, seen_0) {
  if (xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const id_0 = xs_0.head;
    const rest_0 = xs_0.tail;
    return run_jump($Flow$distinct$pick$, [id_0, run_loop($Flow$distinct$(rest_0, {$: "Con", ["head"]: id_0, ["tail"]: seen_0})), run_loop($Flow$contains$(id_0, seen_0))]);
  }
}

function $Flow$all_ids$(packets_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const id_0 = _t_0.id;
    const __0 = _t_0.at;
    const rest_0 = packets_0.tail;
    return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Flow$all_ids$(rest_0))};
  }
}

function $Flow$has_room$(occupied_0, capacity_0) {
  const low_0 = capacity_0.low;
  const high_0 = capacity_0.high;
  const x_0 = run_loop($Nat$is_gt$(high_0, 0n));
  const x_1 = (occupied_0 < low_0);
  return (x_0 || x_1);
}

function $Bool$pick$(c_0, a_0, b_0) {
  if (!c_0) {
    return b_0;
  } else {
    return a_0;
  }
}

function $Flow$at$(place_0, packet_0) {
  const __0 = packet_0.id;
  const location_0 = packet_0.at;
  return run_jump($Flow$same_place$, [location_0, place_0]);
}

function $List$is_empty$(xs_0) {
  if (xs_0.$ === "Nil") {
    return true;
  } else {
    const h_0 = xs_0.head;
    const t_0 = xs_0.tail;
    return false;
  }
}

function $Flow$finish$choose$(original_0, packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, continuations_0, submitted_0, advice_0, can_continue_0) {
  if (can_continue_0) {
    const dropped_0 = run_loop($Flow$discarded$(run_loop($Flow$distinct$(run_loop($Flow$all_ids$(packets_0)), {$: "Nil"})), advice_0, true));
    const decision_0 = {$: "ContinueWithAdvice", ["ids"]: advice_0, ["discarded"]: dropped_0, ["cancelled_source"]: run_loop($Flow$ids$({$: "Preparation"}, packets_0)), ["cancelled_jev"]: run_loop($Flow$ids$({$: "Jev"}, packets_0))};
    return {$: "Accepted", ["state"]: {$: "Flow", ["packets"]: {$: "Nil"}, ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: true, ["continuations"]: nat_chk(continuations_0 + 1n), ["waiting"]: false, ["background_available"]: false, ["lease"]: {$: "None"}, ["leased_id"]: {$: "None"}, ["last_surface"]: {$: "None"}, ["last_id"]: {$: "None"}, ["background_submitted"]: {$: "Nil"}}, ["decision"]: decision_0, ["settled"]: original_0};
  } else {
    const decision_1 = {$: "AllowFinish", ["discarded"]: run_loop($Flow$distinct$(run_loop($Flow$all_ids$(packets_0)), {$: "Nil"})), ["cancelled_source"]: run_loop($Flow$ids$({$: "Preparation"}, packets_0)), ["cancelled_jev"]: run_loop($Flow$ids$({$: "Jev"}, packets_0))};
    return {$: "Accepted", ["state"]: {$: "Flow", ["packets"]: {$: "Nil"}, ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: false, ["continuations"]: continuations_0, ["waiting"]: false, ["background_available"]: false, ["lease"]: {$: "None"}, ["leased_id"]: {$: "None"}, ["last_surface"]: {$: "None"}, ["last_id"]: {$: "None"}, ["background_submitted"]: {$: "Nil"}}, ["decision"]: decision_1, ["settled"]: original_0};
  }
}

function $Flow$unfinished$(packets_0) {
  if (packets_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = packets_0.head;
    const __0 = _t_0.id;
    const _t_1 = _t_0.at;
    if (_t_1.$ === "EditQueue") {
      const rest_0 = packets_0.tail;
      return true;
    } else if (_t_1.$ === "Preparation") {
      const rest_1 = packets_0.tail;
      return true;
    } else if (_t_1.$ === "ReviewQueue") {
      const rest_2 = packets_0.tail;
      return true;
    } else if (_t_1.$ === "Jev") {
      const rest_3 = packets_0.tail;
      return true;
    } else {
      const rest_4 = packets_0.tail;
      return run_jump($Flow$unfinished$, [rest_4]);
    }
  }
}

function $Flow$remove_one$(id_0, source_0, packets_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const pid_0 = _t_0.id;
    const location_0 = _t_0.at;
    const rest_0 = packets_0.tail;
    const hit_0 = run_loop($Bool$and$(run_loop($Nat$is_eq$(pid_0, id_0)), run_loop($Flow$same_place$(location_0, source_0))));
    return run_jump($Flow$remove_one$pick$, [pid_0, location_0, run_loop($Flow$remove_one$(id_0, source_0, rest_0)), hit_0]);
  }
}

function $Flow$move_one$(id_0, source_0, target_0, copy_0, packets_0) {
  if (packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = packets_0.head;
    const pid_0 = _t_0.id;
    const location_0 = _t_0.at;
    const rest_0 = packets_0.tail;
    const hit_0 = run_loop($Bool$and$(run_loop($Nat$is_eq$(pid_0, id_0)), run_loop($Flow$same_place$(location_0, source_0))));
    const tail_0 = run_loop($Flow$move_one$(id_0, source_0, target_0, copy_0, rest_0));
    return run_jump($Flow$move_one$pick$, [pid_0, location_0, tail_0, target_0, copy_0, hit_0]);
  }
}

function $Flow$find$id_match$(id_0, fallback_0, hit_0) {
  if (hit_0) {
    return {$: "Some", ["value"]: id_0};
  } else {
    return fallback_0;
  }
}

function $Flow$deadline$settled$(flow_0, pending_0) {
  if (pending_0) {
    return run_jump($Flow$reject$, [flow_0, {$: "WorkStillPending"}]);
  } else {
    return run_jump($Flow$finish$, [flow_0]);
  }
}

function $Flow$deadline$budget$(flow_0, under_budget_0) {
  if (under_budget_0) {
    return run_jump($Flow$reject$, [flow_0, {$: "UnexpectedControl"}]);
  } else {
    return run_jump($Flow$finish$, [flow_0]);
  }
}

function $Flow$lease_found$(flow_0, surface_0, found_0) {
  if (found_0.$ === "None") {
    return run_jump($Flow$reject$, [flow_0, {$: "MissingPacket"}]);
  } else {
    const id_0 = found_0.value;
    return run_jump($Flow$lease_check$, [flow_0, surface_0, id_0]);
  }
}

function $Flow$submit$surface$(packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, available_0, submitted_0, surface_0, id_0) {
  if (surface_0.$ === "Background") {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: run_loop($Flow$remove_one$(id_0, {$: "AdvicePolicy"}, packets_0)), ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: false, ["lease"]: {$: "None"}, ["leased_id"]: {$: "None"}, ["last_surface"]: {$: "Some", ["value"]: {$: "Background"}}, ["last_id"]: {$: "Some", ["value"]: id_0}, ["background_submitted"]: run_loop($List$append$(submitted_0, {$: "Con", ["head"]: id_0, ["tail"]: {$: "Nil"}}))}]);
  } else {
    const next_0 = run_loop($Flow$remove_one$(id_0, {$: "AdvicePolicy"}, packets_0));
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: run_loop($Flow$remove_one$(id_0, {$: "AdviceStore"}, next_0)), ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: false, ["background_available"]: available_0, ["lease"]: {$: "None"}, ["leased_id"]: {$: "None"}, ["last_surface"]: {$: "Some", ["value"]: {$: "Stop"}}, ["last_id"]: {$: "Some", ["value"]: id_0}, ["background_submitted"]: submitted_0}]);
  }
}

function $Flow$finish_leases$pick$(id_0, tail_0, reoffer_0) {
  if (reoffer_0) {
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "AdviceReofferedAtStop"}, ["route"]: run_loop($Flow$route_of$({$: "AdviceReofferedAtStop"})), ["item"]: {$: "Some", ["value"]: id_0}}, ["tail"]: tail_0};
  } else {
    return {$: "Con", ["head"]: {$: "Transition", ["event"]: {$: "AdviceLeasedByStop"}, ["route"]: run_loop($Flow$route_of$({$: "AdviceLeasedByStop"})), ["item"]: {$: "Some", ["value"]: id_0}}, ["tail"]: tail_0};
  }
}

function $Flow$distinct$pick$(id_0, tail_0, known_0) {
  if (known_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: id_0, ["tail"]: tail_0};
  }
}

function $Flow$discarded$(ids_all_0, advice_0, keep_advice_0) {
  if (ids_all_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const id_0 = ids_all_0.head;
    const rest_0 = ids_all_0.tail;
    return run_jump($Flow$discarded$pick$, [id_0, run_loop($Flow$discarded$(rest_0, advice_0, keep_advice_0)), run_loop($Bool$and$(keep_advice_0, run_loop($Flow$contains$(id_0, advice_0))))]);
  }
}

function $Flow$remove_one$pick$(pid_0, location_0, tail_0, hit_0) {
  if (hit_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: {$: "Packet", ["id"]: pid_0, ["at"]: location_0}, ["tail"]: tail_0};
  }
}

function $Flow$move_one$pick$(pid_0, location_0, tail_0, target_0, copy_0, hit_0) {
  if (copy_0) {
    if (hit_0) {
      return {$: "Con", ["head"]: {$: "Packet", ["id"]: pid_0, ["at"]: location_0}, ["tail"]: run_loop($List$append$(tail_0, {$: "Con", ["head"]: {$: "Packet", ["id"]: pid_0, ["at"]: target_0}, ["tail"]: {$: "Nil"}}))};
    } else {
      return {$: "Con", ["head"]: {$: "Packet", ["id"]: pid_0, ["at"]: location_0}, ["tail"]: tail_0};
    }
  } else {
    if (hit_0) {
      return run_jump($List$append$, [tail_0, {$: "Con", ["head"]: {$: "Packet", ["id"]: pid_0, ["at"]: target_0}, ["tail"]: {$: "Nil"}}]);
    } else {
      return {$: "Con", ["head"]: {$: "Packet", ["id"]: pid_0, ["at"]: location_0}, ["tail"]: tail_0};
    }
  }
}

function $Flow$lease_check$(flow_0, surface_0, id_0) {
  const __0 = flow_0.packets;
  const __1 = flow_0.next_id;
  const __2 = flow_0.source_capacity;
  const __3 = flow_0.review_capacity;
  const __4 = flow_0.round_id;
  const __5 = flow_0.active;
  const __6 = flow_0.continuations;
  const __7 = flow_0.waiting;
  const __8 = flow_0.background_available;
  const __9 = flow_0.lease;
  const __10 = flow_0.leased_id;
  const __11 = flow_0.last_surface;
  const __12 = flow_0.last_id;
  const submitted_0 = flow_0.background_submitted;
  return run_jump($Flow$lease_check$submitted$, [{$: "Flow", ["packets"]: __0, ["next_id"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["round_id"]: __4, ["active"]: __5, ["continuations"]: __6, ["waiting"]: __7, ["background_available"]: __8, ["lease"]: __9, ["leased_id"]: __10, ["last_surface"]: __11, ["last_id"]: __12, ["background_submitted"]: submitted_0}, surface_0, id_0, run_loop($Flow$contains$(id_0, submitted_0))]);
}

function $Flow$discarded$pick$(id_0, tail_0, keep_0) {
  if (keep_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: id_0, ["tail"]: tail_0};
  }
}

function $Flow$lease_check$submitted$(flow_0, surface_0, id_0, submitted_0) {
  if (surface_0.$ === "Background") {
    if (submitted_0) {
      return run_jump($Flow$reject$, [flow_0, {$: "BackgroundAlreadySubmitted"}]);
    } else {
      return run_jump($Flow$lease_apply$, [flow_0, {$: "Background"}, id_0]);
    }
  } else {
    return run_jump($Flow$lease_apply$, [flow_0, {$: "Stop"}, id_0]);
  }
}

function $Flow$lease_apply$(flow_0, surface_0, id_0) {
  const packets_0 = flow_0.packets;
  const next_id_0 = flow_0.next_id;
  const source_capacity_0 = flow_0.source_capacity;
  const review_capacity_0 = flow_0.review_capacity;
  const round_id_0 = flow_0.round_id;
  const active_0 = flow_0.active;
  const continuations_0 = flow_0.continuations;
  const waiting_0 = flow_0.waiting;
  const available_0 = flow_0.background_available;
  const __0 = flow_0.lease;
  const __1 = flow_0.leased_id;
  const last_surface_0 = flow_0.last_surface;
  const last_id_0 = flow_0.last_id;
  const submitted_0 = flow_0.background_submitted;
  return run_jump($Flow$lease_apply$surface$, [packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, available_0, last_surface_0, last_id_0, submitted_0, surface_0, id_0]);
}

function $Flow$lease_apply$surface$(packets_0, next_id_0, source_capacity_0, review_capacity_0, round_id_0, active_0, continuations_0, waiting_0, available_0, last_surface_0, last_id_0, submitted_0, surface_0, id_0) {
  if (surface_0.$ === "Background") {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: run_loop($Flow$move_one$(id_0, {$: "AdviceStore"}, {$: "AdvicePolicy"}, true, packets_0)), ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: continuations_0, ["waiting"]: waiting_0, ["background_available"]: available_0, ["lease"]: {$: "Some", ["value"]: {$: "Background"}}, ["leased_id"]: {$: "Some", ["value"]: id_0}, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: submitted_0}]);
  } else {
    return run_jump($Flow$accept$, [{$: "Flow", ["packets"]: run_loop($Flow$move_one$(id_0, {$: "AdviceStore"}, {$: "AdvicePolicy"}, true, packets_0)), ["next_id"]: next_id_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["round_id"]: round_id_0, ["active"]: active_0, ["continuations"]: nat_chk(continuations_0 + 1n), ["waiting"]: waiting_0, ["background_available"]: available_0, ["lease"]: {$: "Some", ["value"]: {$: "Stop"}}, ["leased_id"]: {$: "Some", ["value"]: id_0}, ["last_surface"]: last_surface_0, ["last_id"]: last_id_0, ["background_submitted"]: submitted_0}]);
  }
}

// Cli
// ===

// A JS program runs one thread and no GPU: --threads and --gpu do nothing.
let cli_args = [];

function cli(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--") {
      cli_args.push(...argv.slice(i + 1));
      break;
    } else if (argv[i] === "--help") {
      io_out(1, io_bytes("usage: " + process.argv[1] + "\n"));
      process.exit(0);
    } else if (argv[i] === "--threads" || argv[i] === "--gpu") {
      i += 1;
    } else {
      cli_args.push(argv[i]);
    }
  }
}

// Show
// ====

// char_show: an escape, a \u{hex}, else the code point
function show_chr(c, q) {
  const k = { 10: "n", 9: "t", 13: "r", 0: "0", 92: "\\" }[c]
    ?? (c === q.codePointAt(0) ? q : null);
  return k !== null ? "\\" + k : c < 32 || c === 127
    ? "\\u{" + c.toString(16) + "}" : String.fromCodePoint(c);
}

// A pure main's value, spelled as term_show spells it: d is a node of
// the descriptor D over the names N (see show_main), v the value, chain
// the bracket of the [a, b] or (a, b) it continues, or 0.
function show_val(D, N, d, v, chain) {
  if (D[d] === 7) {
    const fs = Object.values(typeof v === "boolean"
      ? { $: v ? "True" : "False" } : v);
    let a = d + 3;
    for (; N[D[a]] !== fs[0]; a += 3 + 2 * D[a + 2]) {}
    let o = "{";
    let z = "}";
    if (fs[0] === "Con" || fs[0] === "Nil") {
      o = "[";
      z = "]";
    } else if (fs[0] === "Tuple") {
      o = "(";
      z = ")";
    }
    let s = o === "{" ? fs[0] + "{" : chain === o ? "" : o;
    for (const [j, f] of fs.slice(1).entries()) {
      if (o === "[" ? j === 0 && chain === o : j > 0) {
        s += ", ";
      }
      s += show_val(D, N, D[a + 4 + 2 * j], f, j === 1 && o !== "{" ? o : 0);
    }
    return o === "{" || chain !== o ? s + z : s;
  }
  return D[d] === 0 ? String(v)
    : D[d] === 1 ? f32_show(v).replace(/^-?\d+(?=e|$)/, "$&.0")
    : D[d] === 2 ? v + "n"
    : D[d] === 3 ? "'" + show_chr(v.codePointAt(0), "'") + "'"
    : D[d] === 4 ? "\"" + [...v].map((c) =>
      show_chr(c.codePointAt(0), "\"")).join("") + "\""
    : D[d] === 5 ? "{==}"
    : "[" + v.map((x) => show_val(D, N, D[d + 1], x, 0)).join(", ") + "]";
}

// Io
// ==

function io_exit(main, show) {
  try {
    if (show !== null) {
      io_out(1, io_bytes(show_val(...show, 0, run_loop(main()), 0) + "\n"));
      process.exit(0);
    }
    process.exit(io_run(main));
  } catch (e) {
    io_errs(String(e));
    process.exit(1);
  }
}

function io_out(fd, data) {
  const fs = require("fs");
  let at = 0;
  while (at < data.length) {
    try {
      at += fs.writeSync(fd, data, at, data.length - at);
    } catch (e) {
      if (e.code === "EAGAIN" || e.code === "EINTR") {
        continue;
      }
      try {
        fs.writeSync(2, "bend: a short write on a standard stream\n");
      } catch (o) {
      }
      process.exit(1);
    }
  }
}

function io_errs(message) {
  io_out(2, io_bytes(message + "\n"));
}

function io_sys() {
  if (globalThis.BEND_SYS === undefined) {
    const ffi = require("bun:ffi");
    const mac = process.platform === "darwin";
    const err = mac ? "__error" : "__errno_location";
    const T = { i: "i32", u: "u32", U: "u64", I: "i64", p: "ptr",
      c: "cstring" };
    // fcntl is variadic. Apple arm64 passes variadic arguments on the
    // stack, where the fixed convention puts arguments past the eighth, so
    // there the flags ride as a ninth argument; elsewhere in a register.
    const vari = mac && process.arch === "arm64";
    const lib = ffi.dlopen(mac ? "libSystem.dylib" : "libc.so.6",
      Object.fromEntries(("socket:iii>i bind:ipu>i listen:ii>i connect:ipu>i"
        + " accept:ipp>i send:ipUi>I recv:ipUi>I read:ipU>I pread:ipUI>I"
        + " sendto:ipUipu>I"
        + " recvfrom:ipUipp>I close:i>i poll:pui>i setsockopt:iiipu>i"
        + (vari ? " fcntl:iiiiiiiii>i" : " fcntl:iii>i") + " getsockopt:iiipp>i"
        + " strerror:i>c " + err + ":>p").split(" ").map((s) => {
        const [name, args, ret] = s.split(/[:>]/);
        return [name, { args: [...args].map((a) => T[a]), returns: T[ret] }];
      })));
    const fcntl = (fd, cmd, arg) => vari
      ? lib.symbols.fcntl(fd, cmd, 0, 0, 0, 0, 0, 0, arg)
      : lib.symbols.fcntl(fd, cmd, arg);
    globalThis.BEND_SYS = { ...lib.symbols, fcntl, ptr: ffi.ptr, mac,
      errno: () => ffi.read.i32(lib.symbols[err](), 0) };
  }
  return globalThis.BEND_SYS;
}

function io_fail(code) {
  const text = String(io_sys().strerror(code));
  return { $: "Fail", error: io_tup(code >>> 0, text) };
}

function io_done(value) {
  return { $: "Done", value };
}

function io_tup(...xs) {
  return xs.reduceRight((snd, fst) => ({ $: "Tuple", fst: fst, snd: snd }));
}

function io_bytes(text) {
  return new TextEncoder().encode(text);
}

function io_text(b, n) {
  const dec = new TextDecoder("utf-8", { ignoreBOM: true });
  return dec.decode(b.subarray(0, n));
}

function io_addr(host, port) {
  const part = host.split(".");
  const deci = (p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) < 256;
  if (port > 65535 || part.length !== 4 || !part.every(deci)) {
    return null;
  }
  const b = new Uint8Array(16);
  const head = io_sys().mac ? [16, 2] : [2, 0];
  b.set([...head, port >> 8, port & 255, ...part.map(Number)]);
  return b;
}

function io_push(fun, arg, fresh) {
  const io = globalThis.BEND_IO;
  io.runs.push({ fun: fun, arg: arg });
  io.live += fresh ? 1 : 0;
}

function io_wait(io) {
  const soon = io.waits.reduce((m, w) => Math.min(m, w.at ?? m), Infinity);
  let ms = -1;
  if (soon !== Infinity) {
    ms = Math.ceil(soon - performance.now());
    ms = Math.min(Math.max(0, ms), 2147483647);
  }
  const fds = io.waits.filter((w) => w.fd !== undefined);
  const buf = Int32Array.from(fds.flatMap((w) => [w.fd, w.out ? 4 : 1]));
  io_sys().poll(fds.length > 0 ? io_sys().ptr(buf) : null, fds.length, ms);
  const now = performance.now();
  const fire = io.waits.filter((w) =>
    (buf[2 * fds.indexOf(w) + 1] >>> 16) !== 0 || w.at <= now);
  io.waits = io.waits.filter((w) => !fire.includes(w));
  for (const w of fire) {
    io_push(io_wake, w, false);
  }
}

// A park's wake: more's value goes to k, or undefined, a re-park.
function io_wake(w) {
  const x = w.more();
  return x === undefined ? undefined : w.k(x);
}

// Parks the running effect until fd is readable (out false) or writable.
function io_park_on(fd, out, k, more) {
  globalThis.BEND_IO.waits.push({ fd: fd, out: out, k: k, more: more });
}

function io_run(m) {
  const io = { runs: [], live: 0, waits: [] };
  globalThis.BEND_IO = io;
  try {
    io_push(run_loop(m()), (x) => ({ $: "Emit", value: x }), true);
    for (;;) {
      if (io.runs.length === 0) {
        if (io.live === 0) {
          return 0;
        }
        if (io.waits.length === 0) {
          io_errs("bend: deadlock: every computation waits on a channel");
          return 1;
        }
        io_wait(io);
        continue;
      }
      const s = io.runs.shift();
      let op = s.fun(s.arg);
      for (;;) {
        if (op === undefined) {
          break;
        }
        if (op.$ === "Emit") {
          io.live -= 1;
          break;
        }
        if (op.$ === "Halt") {
          io_errs(op.message);
          return op.code;
        }
        const need = op.need?.() ?? {};
        const fd = need.read ? op.args[0] : null;
        if (need.time || fd !== null) {
          const more = () => op.run(...op.args, op.kont);
          io.waits.push(fd === null
            ? { at: performance.now() + Number(op.args[0]), k: op.kont, more }
            : { fd: fd, k: op.kont, more });
          break;
        }
        const x = op.run(...op.args, op.kont);
        if (x === undefined) {
          break;
        }
        op = op.kont(x);
      }
    }
  } catch (req) {
    if (req instanceof RangeError) {
      throw "bend: memory fault (machine stack overflow?)";
    }
    if (req?.$ !== "$FFI") {
      throw req;
    }
    io_errs("bend: runtime fail-stop");
    return 1;
  }
}

// Chan
// ====

function chan_wake(row, x) {
  const w = row.wait.shift();
  io_push(w.cont, x, false);
  return w.item;
}

function chan_take(row) {
  const v = row.ring.shift();
  if (row.wait.length > 0) {
    row.ring.push(chan_wake(row, true));
  }
  return v;
}

// A handle is the row (a stale copy keeps it, shut).
function chan_shut(row) {
  row.shut = true;
  while (row.wait.length > 0) {
    chan_wake(row, row.wait[0].item === null ? { $: "None" } : false);
  }
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const LOW_MASK = (1n << 48n) - 1n;
const normalizeEvent = (event) => {
  if (event.$ !== "SourceCapacitySet" && event.$ !== "ReviewCapacitySet") return event;
  const raw = event.capacity;
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) return null;
  const value = BigInt(raw);
  if (value < 1n || value > MAX_SAFE) return null;
  return { ...event, capacity: { $: "Capacity", low: value & LOW_MASK, high: value >> 48n } };
};
export const bendInitial = () => run_loop($Flow$initial$());
export const bendStep = (state, event, itemId = {$: "None"}) => {
  const normalized = normalizeEvent(event);
  return normalized === null
    ? { $: "Rejected", state, reason: { $: "InvalidCapacity" } }
    : run_loop($Flow$step$(state, normalized, itemId));
};
export const bendChanges = (before, event, itemId, result) => {
  const normalized = normalizeEvent(event);
  return normalized === null ? { $: "Nil" }
    : run_loop($Flow$changes$(before, normalized, itemId, result));
};
