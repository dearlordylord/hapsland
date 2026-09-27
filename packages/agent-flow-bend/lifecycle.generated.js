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
  return run_jump($Lifecycle$apply$, [run_loop($Lifecycle$initial$(1n, 1n)), 1n, 1n, 0n, {$: "Issue", ["tool"]: 2n, ["started"]: 1n, ["deadline"]: 5n, ["now"]: 1n}]);
}

function $Lifecycle$apply$(state_0, partition_0, lifetime_0, round_0, event_0) {
  if (event_0.$ === "Issue") {
    const tool_0 = event_0.tool;
    const started_0 = event_0.started;
    const deadline_0 = event_0.deadline;
    const now_0 = event_0.now;
    return run_jump($Lifecycle$issue$, [state_0, partition_0, lifetime_0, tool_0, started_0, deadline_0, now_0]);
  } else if (event_0.$ === "Commit") {
    const permit_0 = event_0.permit;
    const tool_1 = event_0.tool;
    const now_1 = event_0.now;
    return run_jump($Lifecycle$commit$, [state_0, partition_0, lifetime_0, permit_0, tool_1, now_1]);
  } else if (event_0.$ === "Prepared") {
    const observation_0 = event_0.observation;
    const count_0 = event_0.count;
    return run_jump($Lifecycle$prepared$, [state_0, partition_0, lifetime_0, round_0, observation_0, count_0]);
  } else if (event_0.$ === "Reviewed") {
    const unit_0 = event_0.unit;
    const outcome_0 = event_0.outcome;
    return run_jump($Lifecycle$reviewed$, [state_0, partition_0, lifetime_0, round_0, unit_0, outcome_0]);
  } else if (event_0.$ === "SourceInterrupted") {
    const observation_1 = event_0.observation;
    return run_jump($Lifecycle$interrupt$, [state_0, partition_0, lifetime_0, round_0, observation_1, true]);
  } else if (event_0.$ === "ReviewInterrupted") {
    const unit_1 = event_0.unit;
    return run_jump($Lifecycle$interrupt$, [state_0, partition_0, lifetime_0, round_0, unit_1, false]);
  } else if (event_0.$ === "FinishCheck") {
    const original_deadline_0 = event_0.original_deadline;
    const actionable_0 = event_0.actionable_findings;
    const at_0 = event_0.at;
    const collector_0 = event_0.collector;
    return run_jump($Lifecycle$finish_check$, [state_0, partition_0, lifetime_0, round_0, original_deadline_0, actionable_0, at_0, collector_0]);
  } else {
    const slot_0 = event_0.slot;
    const token_0 = event_0.token;
    const collector_1 = event_0.collector;
    return run_jump($Lifecycle$write_terminal$, [state_0, partition_0, lifetime_0, round_0, slot_0, token_0, collector_1]);
  }
}

function $Lifecycle$initial$(partition_0, lifetime_0) {
  return {$: "Lifecycle", ["admission"]: run_loop($Admission$initial$(partition_0, lifetime_0)), ["work"]: run_loop($Work$initial$()), ["finish"]: run_loop($Handoff$finish$initial$(0n))};
}

function $Lifecycle$issue$(state_0, partition_0, lifetime_0, tool_0, started_0, deadline_0, now_0) {
  const admission_0 = state_0.admission;
  const work_0 = state_0.work;
  const finish_0 = state_0.finish;
  return run_jump($Lifecycle$issue$result$, [work_0, finish_0, run_loop($Admission$step$(admission_0, partition_0, lifetime_0, {$: "Issue", ["tool"]: tool_0, ["started"]: started_0, ["deadline"]: deadline_0, ["now"]: now_0}))]);
}

function $Lifecycle$commit$(state_0, partition_0, lifetime_0, permit_0, tool_0, now_0) {
  const _t_0 = state_0.admission;
  const __0 = _t_0.partition;
  const __1 = _t_0.lifetime;
  const __2 = _t_0.round;
  const active_0 = _t_0.active;
  const __3 = _t_0.closed_at;
  const __4 = _t_0.next_token;
  const __5 = _t_0.permits;
  const __6 = _t_0.used;
  const work_0 = state_0.work;
  const finish_0 = state_0.finish;
  return run_jump($Lifecycle$commit$accept$, [work_0, finish_0, active_0, run_loop($Admission$step$({$: "AdmissionState", ["partition"]: __0, ["lifetime"]: __1, ["round"]: __2, ["active"]: active_0, ["closed_at"]: __3, ["next_token"]: __4, ["permits"]: __5, ["used"]: __6}, partition_0, lifetime_0, {$: "Consume", ["token"]: permit_0, ["tool"]: tool_0, ["now"]: now_0}))]);
}

function $Lifecycle$prepared$(state_0, partition_0, lifetime_0, round_0, observation_0, count_0) {
  const admission_0 = state_0.admission;
  const __0 = state_0.work;
  const __1 = state_0.finish;
  return run_jump($Lifecycle$prepared$guard$, [{$: "Lifecycle", ["admission"]: admission_0, ["work"]: __0, ["finish"]: __1}, observation_0, count_0, run_loop($Admission$callback_current$(admission_0, partition_0, lifetime_0, round_0))]);
}

function $Lifecycle$reviewed$(state_0, partition_0, lifetime_0, round_0, unit_0, outcome_0) {
  const admission_0 = state_0.admission;
  const __0 = state_0.work;
  const __1 = state_0.finish;
  return run_jump($Lifecycle$reviewed$guard$, [{$: "Lifecycle", ["admission"]: admission_0, ["work"]: __0, ["finish"]: __1}, unit_0, outcome_0, run_loop($Admission$callback_current$(admission_0, partition_0, lifetime_0, round_0))]);
}

function $Lifecycle$interrupt$(state_0, partition_0, lifetime_0, round_0, id_0, source_0) {
  const admission_0 = state_0.admission;
  const __0 = state_0.work;
  const __1 = state_0.finish;
  return run_jump($Lifecycle$interrupt$guard$, [{$: "Lifecycle", ["admission"]: admission_0, ["work"]: __0, ["finish"]: __1}, id_0, source_0, run_loop($Admission$callback_current$(admission_0, partition_0, lifetime_0, round_0))]);
}

function $Lifecycle$finish_check$(state_0, partition_0, lifetime_0, round_0, original_deadline_0, actionable_0, at_0, collector_0) {
  const admission_0 = state_0.admission;
  const work_0 = state_0.work;
  const __0 = state_0.finish;
  return run_jump($Lifecycle$finish$guard$, [{$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: __0}, original_deadline_0, actionable_0, at_0, collector_0, run_loop($Bool$and$(run_loop($Admission$callback_current$(admission_0, partition_0, lifetime_0, round_0)), run_loop($Bool$and$(run_loop($Nat$is_gt$(original_deadline_0, 0n)), run_loop($Bool$and$(run_loop($Nat$is_gt$(collector_0, 0n)), run_loop($Bool$and$(run_loop($Nat$is_le$(actionable_0, run_loop($Work$pending_findings$(work_0)))), run_loop($Nat$is_le$(actionable_0, 5n))))))))))]);
}

function $Lifecycle$write_terminal$(state_0, partition_0, lifetime_0, round_0, slot_0, token_0, collector_0) {
  const admission_0 = state_0.admission;
  const __0 = state_0.work;
  const finish_0 = state_0.finish;
  return run_jump($Lifecycle$write$guard$, [{$: "Lifecycle", ["admission"]: admission_0, ["work"]: __0, ["finish"]: finish_0}, round_0, slot_0, token_0, collector_0, run_loop($Bool$and$(run_loop($Admission$callback_current$(admission_0, partition_0, lifetime_0, round_0)), run_loop($Handoff$finish$can_complete$(finish_0, round_0, slot_0, token_0, collector_0))))]);
}

function $Admission$initial$(partition_0, lifetime_0) {
  return {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: 0n, ["active"]: false, ["closed_at"]: 0n, ["next_token"]: 1n, ["permits"]: {$: "Nil"}, ["used"]: {$: "Nil"}};
}

function $Work$initial$() {
  return {$: "Work", ["next_observation"]: 1n, ["next_unit"]: 1n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Nil"}, ["units"]: {$: "Nil"}};
}

function $Handoff$finish$initial$(round_0) {
  return {$: "Finish", ["round"]: round_0, ["active"]: true, ["closed"]: false, ["continuations"]: 0n, ["reserved"]: false, ["token"]: 0n, ["collector"]: 0n, ["deadline_at"]: 0n};
}

function $Lifecycle$issue$result$(work_0, finish_0, result_0) {
  if (result_0.$ === "Accepted") {
    const admission_0 = result_0.state;
    const _t_0 = result_0.token;
    if (_t_0.$ === "Some") {
      const value_0 = _t_0.value;
      const __0 = result_0.round;
      return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}, ["command"]: {$: "PermitIssued", ["token"]: value_0}};
    } else {
      const __1 = result_0.round;
      return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}};
    }
  } else {
    const admission_1 = result_0.state;
    const __2 = result_0.reason;
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_1, ["work"]: work_0, ["finish"]: finish_0}};
  }
}

function $Admission$step$(state_0, partition_0, lifetime_0, event_0) {
  const owner_0 = state_0.partition;
  const live_0 = state_0.lifetime;
  const __0 = state_0.round;
  const __1 = state_0.active;
  const __2 = state_0.closed_at;
  const __3 = state_0.next_token;
  const __4 = state_0.permits;
  const __5 = state_0.used;
  return run_jump($Admission$step$partition$, [{$: "AdmissionState", ["partition"]: owner_0, ["lifetime"]: live_0, ["round"]: __0, ["active"]: __1, ["closed_at"]: __2, ["next_token"]: __3, ["permits"]: __4, ["used"]: __5}, partition_0, lifetime_0, event_0, run_loop($Nat$is_eq$(owner_0, partition_0)), run_loop($Nat$is_eq$(live_0, lifetime_0))]);
}

function $Lifecycle$commit$accept$(work_0, finish_0, earlier_0, result_0) {
  if (result_0.$ === "Accepted") {
    const admission_0 = result_0.state;
    const __0 = result_0.token;
    const _t_0 = result_0.round;
    if (_t_0.$ === "Some") {
      const value_0 = _t_0.value;
      return run_jump($Lifecycle$commit$work$, [admission_0, run_loop($Work$admit$(work_0)), run_loop($Lifecycle$finish_for_commit$(earlier_0, finish_0, value_0))]);
    } else {
      return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}};
    }
  } else {
    const admission_1 = result_0.state;
    const __1 = result_0.reason;
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_1, ["work"]: work_0, ["finish"]: finish_0}};
  }
}

function $Lifecycle$prepared$guard$(state_0, observation_0, count_0, current_0) {
  const admission_0 = state_0.admission;
  const work_0 = state_0.work;
  const finish_0 = state_0.finish;
  if (current_0) {
    return run_jump($Lifecycle$prepared$result$, [admission_0, finish_0, run_loop($Work$prepare$(work_0, observation_0, count_0))]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}};
  }
}

function $Admission$callback_current$(state_0, partition_0, lifetime_0, round_0) {
  const owner_0 = state_0.partition;
  const live_0 = state_0.lifetime;
  const current_0 = state_0.round;
  const active_0 = state_0.active;
  const __0 = state_0.closed_at;
  const __1 = state_0.next_token;
  const __2 = state_0.permits;
  const __3 = state_0.used;
  return run_jump($Bool$and$, [active_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(owner_0, partition_0)), run_loop($Bool$and$(run_loop($Nat$is_eq$(live_0, lifetime_0)), run_loop($Nat$is_eq$(current_0, round_0))))))]);
}

function $Lifecycle$reviewed$guard$(state_0, unit_0, outcome_0, current_0) {
  const admission_0 = state_0.admission;
  const work_0 = state_0.work;
  const finish_0 = state_0.finish;
  if (current_0) {
    return run_jump($Lifecycle$reviewed$result$, [admission_0, finish_0, run_loop($Work$outcome$(work_0, unit_0, outcome_0))]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}};
  }
}

function $Lifecycle$interrupt$guard$(state_0, id_0, source_0, current_0) {
  const admission_0 = state_0.admission;
  const work_0 = state_0.work;
  const finish_0 = state_0.finish;
  if (current_0) {
    return run_jump($Lifecycle$interrupt$valid$, [admission_0, work_0, finish_0, id_0, source_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}};
  }
}

function $Lifecycle$finish$guard$(state_0, original_deadline_0, actionable_0, at_0, collector_0, current_0) {
  const admission_0 = state_0.admission;
  const work_0 = state_0.work;
  const finish_0 = state_0.finish;
  if (current_0) {
    return run_jump($Lifecycle$finish$result$, [admission_0, work_0, at_0, collector_0, run_loop($Handoff$finish$decide_at$(finish_0, run_loop($Work$unfinished$(work_0)), at_0, original_deadline_0, actionable_0))]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}};
  }
}

function $Bool$and$(a_0, b_0) {
  if (!a_0) {
    return false;
  } else {
    return b_0;
  }
}

function $Nat$is_gt$(a_0, b_0) {
  return run_jump($Cmp$is_gt$, [cmp_new(a_0, b_0)]);
}

function $Nat$is_le$(a_0, b_0) {
  return run_jump($Cmp$is_le$, [cmp_new(a_0, b_0)]);
}

function $Work$pending_findings$(work_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$pending_findings_in$, [units_0]);
}

function $Lifecycle$write$guard$(state_0, round_0, slot_0, token_0, collector_0, current_0) {
  const admission_0 = state_0.admission;
  const work_0 = state_0.work;
  const finish_0 = state_0.finish;
  if (current_0) {
    return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: run_loop($Handoff$finish$complete$(finish_0, round_0, slot_0, token_0, collector_0))}, ["command"]: {$: "WriteSettled"}};
  } else {
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}};
  }
}

function $Handoff$finish$can_complete$(state_0, round_0, slot_0, token_0, collector_0) {
  const own_round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_0 = state_0.closed;
  const continuations_0 = state_0.continuations;
  const reserved_0 = state_0.reserved;
  const own_token_0 = state_0.token;
  const own_collector_0 = state_0.collector;
  const __0 = state_0.deadline_at;
  return run_jump($Bool$and$, [run_loop($Nat$is_eq$(own_round_0, round_0)), run_loop($Bool$and$(active_0, run_loop($Bool$and$(run_loop($Bool$not$(closed_0)), run_loop($Bool$and$(reserved_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(continuations_0, slot_0)), run_loop($Bool$and$(run_loop($Nat$is_eq$(own_token_0, token_0)), run_loop($Nat$is_eq$(own_collector_0, collector_0))))))))))))]);
}

function $Admission$step$partition$(state_0, partition_0, lifetime_0, event_0, correct_partition_0, correct_lifetime_0) {
  if (!correct_partition_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "WrongPartition"}};
  } else {
    if (!correct_lifetime_0) {
      return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "WrongLifetime"}};
    } else {
      return run_jump($Admission$apply_event$, [state_0, event_0]);
    }
  }
}

function $Nat$is_eq$(a_0, b_0) {
  return run_jump($Cmp$is_eq$, [cmp_new(a_0, b_0)]);
}

function $Lifecycle$commit$work$(admission_0, work_result_0, finish_0) {
  if (work_result_0.$ === "Accepted") {
    const work_0 = work_result_0.state;
    const ids_0 = work_result_0.admitted;
    return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}, ["command"]: {$: "ObservationAdmitted", ["ids"]: ids_0}};
  } else {
    const work_1 = work_result_0.state;
    const __0 = work_result_0.reason;
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_1, ["finish"]: finish_0}};
  }
}

function $Work$admit$(work_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: nat_chk(next_observation_0 + 1n), ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: run_loop($List$append$(observations_0, {$: "Con", ["head"]: {$: "Observation", ["id"]: next_observation_0, ["stage"]: {$: "SourceQueued"}}, ["tail"]: {$: "Nil"}})), ["units"]: units_0})), ["admitted"]: {$: "Con", ["head"]: next_observation_0, ["tail"]: {$: "Nil"}}};
}

function $Lifecycle$finish_for_commit$(earlier_0, current_0, round_0) {
  if (earlier_0) {
    return current_0;
  } else {
    return run_jump($Handoff$finish$initial$, [round_0]);
  }
}

function $Lifecycle$prepared$result$(admission_0, finish_0, result_0) {
  if (result_0.$ === "Accepted") {
    const work_0 = result_0.state;
    const ids_0 = result_0.admitted;
    return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}, ["command"]: {$: "UnitsAdmitted", ["ids"]: ids_0}};
  } else {
    const work_1 = result_0.state;
    const __0 = result_0.reason;
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_1, ["finish"]: finish_0}};
  }
}

function $Work$prepare$(work_0, observation_0, count_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const __4 = work_0.units;
  return run_jump($Work$prepare$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: observations_0, ["units"]: __4}, observation_0, count_0, run_loop($Work$find_observation$(observation_0, observations_0))]);
}

function $Lifecycle$reviewed$result$(admission_0, finish_0, result_0) {
  if (result_0.$ === "Accepted") {
    const work_0 = result_0.state;
    const __0 = result_0.admitted;
    return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}, ["command"]: {$: "OutcomeRecorded"}};
  } else {
    const work_1 = result_0.state;
    const __1 = result_0.reason;
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_1, ["finish"]: finish_0}};
  }
}

function $Work$outcome$(work_0, id_0, result_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$outcome$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: __4, ["units"]: units_0}, id_0, result_0, run_loop($Work$find_unit$(id_0, units_0))]);
}

function $Lifecycle$interrupt$valid$(admission_0, work_0, finish_0, id_0, source_0) {
  if (source_0) {
    return run_jump($Lifecycle$interrupt$result$, [admission_0, finish_0, run_loop($Work$interrupt_observation$(work_0, id_0))]);
  } else {
    return run_jump($Lifecycle$interrupt$result$, [admission_0, finish_0, run_loop($Work$interrupt_unit$(work_0, id_0))]);
  }
}

function $Lifecycle$finish$result$(admission_0, work_0, at_0, collector_0, result_0) {
  if (result_0.$ === "Wait") {
    const finish_0 = result_0.state;
    return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}, ["command"]: {$: "FinishWaiting"}};
  } else if (result_0.$ === "Continue") {
    const finish_1 = result_0.state;
    return run_jump($Lifecycle$finish$continue$, [admission_0, work_0, finish_1, collector_0]);
  } else {
    const finish_2 = result_0.state;
    return run_jump($Lifecycle$allow$closed$, [run_loop($Admission$close_round$(admission_0, at_0)), run_loop($Work$close$(work_0)), finish_2]);
  }
}

function $Handoff$finish$decide_at$(state_0, unfinished_0, now_0, original_deadline_0, actionable_findings_0) {
  return run_jump($Handoff$finish$at$, [run_loop($Handoff$finish$start$(state_0, original_deadline_0)), unfinished_0, now_0, actionable_findings_0]);
}

function $Work$unfinished$(work_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  const x_0 = run_loop($Work$unfinished_observations$(observations_0));
  const x_1 = run_loop($Work$unfinished_units$(units_0));
  return nat_chk(x_0 + x_1);
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

function $Cmp$is_le$(c_0) {
  if (c_0.$ === "LT") {
    return true;
  } else if (c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Work$pending_findings_in$(units_0) {
  if (units_0.$ === "Nil") {
    return 0n;
  } else {
    const _t_0 = units_0.head;
    const __0 = _t_0.id;
    const __1 = _t_0.observation;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "PendingFinding") {
      const findings_0 = _t_0.findings;
      const __2 = _t_0.bytes;
      const rest_0 = units_0.tail;
      const x_0 = run_loop($Work$pending_findings_in$(rest_0));
      return nat_chk(findings_0 + x_0);
    } else {
      const findings_1 = _t_0.findings;
      const __3 = _t_0.bytes;
      const rest_1 = units_0.tail;
      return run_jump($Work$pending_findings_in$, [rest_1]);
    }
  }
}

function $Handoff$finish$complete$(state_0, round_0, slot_0, token_0, collector_0) {
  const __0 = state_0.round;
  const __1 = state_0.active;
  const __2 = state_0.closed;
  const __3 = state_0.continuations;
  const __4 = state_0.reserved;
  const __5 = state_0.token;
  const __6 = state_0.collector;
  const __7 = state_0.deadline_at;
  return run_jump($Handoff$finish$complete$check$, [{$: "Finish", ["round"]: __0, ["active"]: __1, ["closed"]: __2, ["continuations"]: __3, ["reserved"]: __4, ["token"]: __5, ["collector"]: __6, ["deadline_at"]: __7}, run_loop($Handoff$finish$can_complete$({$: "Finish", ["round"]: __0, ["active"]: __1, ["closed"]: __2, ["continuations"]: __3, ["reserved"]: __4, ["token"]: __5, ["collector"]: __6, ["deadline_at"]: __7}, round_0, slot_0, token_0, collector_0))]);
}

function $Bool$not$(b_0) {
  if (!b_0) {
    return true;
  } else {
    return false;
  }
}

function $Admission$apply_event$(state_0, event_0) {
  if (event_0.$ === "Issue") {
    const tool_0 = event_0.tool;
    const started_0 = event_0.started;
    const deadline_0 = event_0.deadline;
    const now_0 = event_0.now;
    return run_jump($Admission$issue$, [state_0, tool_0, started_0, deadline_0, now_0]);
  } else if (event_0.$ === "Consume") {
    const token_0 = event_0.token;
    const tool_1 = event_0.tool;
    const now_1 = event_0.now;
    return run_jump($Admission$consume$, [state_0, token_0, tool_1, now_1]);
  } else if (event_0.$ === "Release") {
    const token_1 = event_0.token;
    return run_jump($Admission$release$, [state_0, token_1]);
  } else if (event_0.$ === "CloseRound") {
    const at_0 = event_0.at;
    return run_jump($Admission$close_round$, [state_0, at_0]);
  } else {
    const new_lifetime_0 = event_0.new_lifetime;
    const at_1 = event_0.at;
    return run_jump($Admission$restart$, [state_0, new_lifetime_0, at_1]);
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

function $Work$settle$(work_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: run_loop($Work$fill_source$(observations_0, source_capacity_0, run_loop($Work$reading_count$(observations_0)))), ["units"]: run_loop($Work$fill_review$(units_0, review_capacity_0, run_loop($Work$at_jev_count$(units_0))))};
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

function $Work$prepare$found$(work_0, observation_0, count_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingObservation"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const stage_0 = _t_0.stage;
    return run_jump($Work$prepare$stage$, [work_0, observation_0, count_0, stage_0]);
  }
}

function $Work$find_observation$(id_0, observations_0) {
  if (observations_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = observations_0.head;
    const current_0 = _t_0.id;
    const __0 = _t_0.stage;
    const rest_0 = observations_0.tail;
    return run_jump($Work$find_observation$pick$, [{$: "Observation", ["id"]: current_0, ["stage"]: __0}, run_loop($Work$find_observation$(id_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Work$outcome$found$(work_0, id_0, result_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingUnit"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const observation_0 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __1 = _t_0.findings;
    const __2 = _t_0.bytes;
    return run_jump($Work$outcome$stage$, [work_0, id_0, observation_0, stage_0, result_0]);
  }
}

function $Work$find_unit$(id_0, units_0) {
  if (units_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = units_0.head;
    const current_0 = _t_0.id;
    const __0 = _t_0.observation;
    const __1 = _t_0.stage;
    const __2 = _t_0.findings;
    const __3 = _t_0.bytes;
    const rest_0 = units_0.tail;
    return run_jump($Work$find_unit$pick$, [{$: "ReviewUnit", ["id"]: current_0, ["observation"]: __0, ["stage"]: __1, ["findings"]: __2, ["bytes"]: __3}, run_loop($Work$find_unit$(id_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Lifecycle$interrupt$result$(admission_0, finish_0, result_0) {
  if (result_0.$ === "Accepted") {
    const work_0 = result_0.state;
    const __0 = result_0.admitted;
    return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}, ["command"]: {$: "WorkInterrupted"}};
  } else {
    const work_1 = result_0.state;
    const __1 = result_0.reason;
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_1, ["finish"]: finish_0}};
  }
}

function $Work$interrupt_observation$(work_0, id_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const __4 = work_0.units;
  return run_jump($Work$interrupt_observation$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: observations_0, ["units"]: __4}, id_0, run_loop($Work$find_observation$(id_0, observations_0))]);
}

function $Work$interrupt_unit$(work_0, id_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$interrupt_unit$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: __4, ["units"]: units_0}, id_0, run_loop($Work$find_unit$(id_0, units_0))]);
}

function $Lifecycle$finish$continue$(admission_0, work_0, finish_0, collector_0) {
  return run_jump($Lifecycle$finish$continue$bound$, [admission_0, work_0, run_loop($Handoff$finish$bind_writer$(finish_0, collector_0))]);
}

function $Lifecycle$allow$closed$(admission_result_0, closed_work_0, finish_0) {
  if (admission_result_0.$ === "Accepted") {
    const admission_0 = admission_result_0.state;
    const __0 = admission_result_0.token;
    const __1 = admission_result_0.round;
    const work_0 = closed_work_0.state;
    const source_0 = closed_work_0.cancelled_source;
    const jev_0 = closed_work_0.cancelled_jev;
    const discarded_0 = closed_work_0.discarded_findings;
    return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: finish_0}, ["command"]: {$: "Allow", ["cancelled_source"]: source_0, ["cancelled_jev"]: jev_0, ["discarded"]: discarded_0}};
  } else {
    const admission_1 = admission_result_0.state;
    const __2 = admission_result_0.reason;
    const work_1 = closed_work_0.state;
    const __3 = closed_work_0.cancelled_source;
    const __4 = closed_work_0.cancelled_jev;
    const __5 = closed_work_0.discarded_findings;
    return {$: "Denied", ["state"]: {$: "Lifecycle", ["admission"]: admission_1, ["work"]: work_1, ["finish"]: finish_0}};
  }
}

function $Admission$close_round$(state_0, at_0) {
  const partition_0 = state_0.partition;
  const lifetime_0 = state_0.lifetime;
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const next_token_0 = state_0.next_token;
  const __0 = state_0.permits;
  const used_0 = state_0.used;
  return run_jump($Admission$close_round$active$, [{$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: __0, ["used"]: used_0}, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, used_0, at_0]);
}

function $Work$close$(work_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Closed", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: {$: "Nil"}, ["units"]: {$: "Nil"}}, ["cancelled_source"]: run_loop($Work$source_cancel_ids$(observations_0)), ["cancelled_jev"]: run_loop($Work$jev_cancel_ids$(units_0)), ["discarded_findings"]: run_loop($Work$discarded_finding_ids$(units_0))};
}

function $Handoff$finish$at$(state_0, unfinished_0, now_0, actionable_findings_0) {
  const __0 = state_0.round;
  const __1 = state_0.active;
  const __2 = state_0.closed;
  const __3 = state_0.continuations;
  const __4 = state_0.reserved;
  const __5 = state_0.token;
  const __6 = state_0.collector;
  const deadline_at_0 = state_0.deadline_at;
  return run_jump($Handoff$finish$decide$, [{$: "Finish", ["round"]: __0, ["active"]: __1, ["closed"]: __2, ["continuations"]: __3, ["reserved"]: __4, ["token"]: __5, ["collector"]: __6, ["deadline_at"]: deadline_at_0}, unfinished_0, run_loop($Nat$is_ge$(now_0, deadline_at_0)), actionable_findings_0]);
}

function $Handoff$finish$start$(state_0, original_deadline_0) {
  const __0 = state_0.round;
  const __1 = state_0.active;
  const __2 = state_0.closed;
  const __3 = state_0.continuations;
  const __4 = state_0.reserved;
  const __5 = state_0.token;
  const __6 = state_0.collector;
  const deadline_at_0 = state_0.deadline_at;
  return run_jump($Handoff$finish$start$choose$, [{$: "Finish", ["round"]: __0, ["active"]: __1, ["closed"]: __2, ["continuations"]: __3, ["reserved"]: __4, ["token"]: __5, ["collector"]: __6, ["deadline_at"]: deadline_at_0}, original_deadline_0, run_loop($Nat$is_eq$(deadline_at_0, 0n))]);
}

function $Work$unfinished_observations$(observations_0) {
  return run_jump($List$length$, [observations_0]);
}

function $Work$unfinished_units$(units_0) {
  if (units_0.$ === "Nil") {
    return 0n;
  } else {
    const _t_0 = units_0.head;
    const __0 = _t_0.id;
    const __1 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __2 = _t_0.findings;
    const __3 = _t_0.bytes;
    const rest_0 = units_0.tail;
    const x_0 = run_loop($Bool$pick$(run_loop($Work$is_unit_unfinished$(stage_0)), 1n, 0n));
    const x_1 = run_loop($Work$unfinished_units$(rest_0));
    return nat_chk(x_0 + x_1);
  }
}

function $Handoff$finish$complete$check$(state_0, valid_0) {
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_0 = state_0.closed;
  const continuations_0 = state_0.continuations;
  const reserved_0 = state_0.reserved;
  const token_0 = state_0.token;
  const collector_0 = state_0.collector;
  const deadline_at_0 = state_0.deadline_at;
  if (valid_0) {
    return {$: "Finish", ["round"]: round_0, ["active"]: active_0, ["closed"]: closed_0, ["continuations"]: continuations_0, ["reserved"]: false, ["token"]: token_0, ["collector"]: collector_0, ["deadline_at"]: 0n};
  } else {
    return {$: "Finish", ["round"]: round_0, ["active"]: active_0, ["closed"]: closed_0, ["continuations"]: continuations_0, ["reserved"]: reserved_0, ["token"]: token_0, ["collector"]: collector_0, ["deadline_at"]: deadline_at_0};
  }
}

function $Admission$issue$(state_0, tool_0, started_0, deadline_0, now_0) {
  const partition_0 = state_0.partition;
  const lifetime_0 = state_0.lifetime;
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const next_token_0 = state_0.next_token;
  const permits_0 = state_0.permits;
  const used_0 = state_0.used;
  return run_jump($Admission$issue$guard$, [{$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: permits_0, ["used"]: used_0}, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, tool_0, started_0, deadline_0, now_0, run_loop($Bool$and$(run_loop($Nat$is_gt$(started_0, closed_at_0)), run_loop($Bool$and$(run_loop($Nat$is_le$(started_0, now_0)), run_loop($Nat$is_le$(now_0, deadline_0))))))]);
}

function $Admission$consume$(state_0, token_0, tool_0, now_0) {
  const __0 = state_0.partition;
  const __1 = state_0.lifetime;
  const __2 = state_0.round;
  const __3 = state_0.active;
  const __4 = state_0.closed_at;
  const __5 = state_0.next_token;
  const permits_0 = state_0.permits;
  const used_0 = state_0.used;
  return run_jump($Admission$consume$used$, [{$: "AdmissionState", ["partition"]: __0, ["lifetime"]: __1, ["round"]: __2, ["active"]: __3, ["closed_at"]: __4, ["next_token"]: __5, ["permits"]: permits_0, ["used"]: used_0}, token_0, tool_0, now_0, run_loop($Admission$has_token$(token_0, used_0)), run_loop($Admission$find_permit$(token_0, permits_0))]);
}

function $Admission$release$(state_0, token_0) {
  const __0 = state_0.partition;
  const __1 = state_0.lifetime;
  const __2 = state_0.round;
  const __3 = state_0.active;
  const __4 = state_0.closed_at;
  const __5 = state_0.next_token;
  const permits_0 = state_0.permits;
  const used_0 = state_0.used;
  return run_jump($Admission$release$used$, [{$: "AdmissionState", ["partition"]: __0, ["lifetime"]: __1, ["round"]: __2, ["active"]: __3, ["closed_at"]: __4, ["next_token"]: __5, ["permits"]: permits_0, ["used"]: used_0}, token_0, run_loop($Admission$has_token$(token_0, used_0)), run_loop($Admission$find_permit$(token_0, permits_0))]);
}

function $Admission$restart$(state_0, new_lifetime_0, at_0) {
  const partition_0 = state_0.partition;
  const lifetime_0 = state_0.lifetime;
  const __0 = state_0.round;
  const __1 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const __2 = state_0.next_token;
  const __3 = state_0.permits;
  const __4 = state_0.used;
  return run_jump($Admission$restart$fresh$, [{$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: __0, ["active"]: __1, ["closed_at"]: closed_at_0, ["next_token"]: __2, ["permits"]: __3, ["used"]: __4}, partition_0, lifetime_0, closed_at_0, new_lifetime_0, at_0, run_loop($Bool$and$(run_loop($Nat$is_gt$(new_lifetime_0, lifetime_0)), run_loop($Nat$is_ge$(at_0, closed_at_0))))]);
}

function $Work$fill_source$(observations_0, capacity_0, occupied_0) {
  if (observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = observations_0.head;
    const id_0 = _t_0.id;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "SourceQueued") {
      const rest_0 = observations_0.tail;
      const room_0 = run_loop($Flow$has_room$(occupied_0, capacity_0));
      const next_stage_0 = run_loop($Bool$pick$(room_0, {$: "SourceReading"}, {$: "SourceQueued"}));
      const x_0 = run_loop($Bool$pick$(room_0, 1n, 0n));
      return {$: "Con", ["head"]: {$: "Observation", ["id"]: id_0, ["stage"]: next_stage_0}, ["tail"]: run_loop($Work$fill_source$(rest_0, capacity_0, nat_chk(occupied_0 + x_0)))};
    } else {
      const rest_1 = observations_0.tail;
      return {$: "Con", ["head"]: {$: "Observation", ["id"]: id_0, ["stage"]: {$: "SourceReading"}}, ["tail"]: run_loop($Work$fill_source$(rest_1, capacity_0, occupied_0))};
    }
  }
}

function $Work$reading_count$(observations_0) {
  if (observations_0.$ === "Nil") {
    return 0n;
  } else {
    const _t_0 = observations_0.head;
    const __0 = _t_0.id;
    const stage_0 = _t_0.stage;
    const rest_0 = observations_0.tail;
    const x_0 = run_loop($Bool$pick$(run_loop($Work$is_source_reading$(stage_0)), 1n, 0n));
    const x_1 = run_loop($Work$reading_count$(rest_0));
    return nat_chk(x_0 + x_1);
  }
}

function $Work$fill_review$(units_0, capacity_0, occupied_0) {
  if (units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = units_0.head;
    const id_0 = _t_0.id;
    const observation_0 = _t_0.observation;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "ReviewQueued") {
      const findings_0 = _t_0.findings;
      const bytes_0 = _t_0.bytes;
      const rest_0 = units_0.tail;
      const room_0 = run_loop($Flow$has_room$(occupied_0, capacity_0));
      const next_stage_0 = run_loop($Bool$pick$(room_0, {$: "AtJev"}, {$: "ReviewQueued"}));
      const x_0 = run_loop($Bool$pick$(room_0, 1n, 0n));
      return {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: next_stage_0, ["findings"]: findings_0, ["bytes"]: bytes_0}, ["tail"]: run_loop($Work$fill_review$(rest_0, capacity_0, nat_chk(occupied_0 + x_0)))};
    } else {
      const findings_1 = _t_0.findings;
      const bytes_1 = _t_0.bytes;
      const rest_1 = units_0.tail;
      return {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: _t_1, ["findings"]: findings_1, ["bytes"]: bytes_1}, ["tail"]: run_loop($Work$fill_review$(rest_1, capacity_0, occupied_0))};
    }
  }
}

function $Work$at_jev_count$(units_0) {
  if (units_0.$ === "Nil") {
    return 0n;
  } else {
    const _t_0 = units_0.head;
    const __0 = _t_0.id;
    const __1 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __2 = _t_0.findings;
    const __3 = _t_0.bytes;
    const rest_0 = units_0.tail;
    const x_0 = run_loop($Bool$pick$(run_loop($Work$is_at_jev$(stage_0)), 1n, 0n));
    const x_1 = run_loop($Work$at_jev_count$(rest_0));
    return nat_chk(x_0 + x_1);
  }
}

function $Work$prepare$stage$(work_0, observation_0, count_0, stage_0) {
  if (stage_0.$ === "SourceQueued") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "SourceNotReading"}};
  } else {
    return run_jump($Work$prepare$count$, [work_0, observation_0, count_0, run_loop($Nat$is_le$(count_0, 16n))]);
  }
}

function $Work$find_observation$pick$(observation_0, fallback_0, hit_0) {
  if (hit_0) {
    return {$: "Some", ["value"]: observation_0};
  } else {
    return fallback_0;
  }
}

function $Work$outcome$stage$(work_0, id_0, observation_0, stage_0, result_0) {
  if (stage_0.$ === "AtJev") {
    return run_jump($Work$outcome$kind$, [work_0, id_0, observation_0, result_0]);
  } else {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "UnitNotAtJev"}};
  }
}

function $Work$find_unit$pick$(unit_0, fallback_0, hit_0) {
  if (hit_0) {
    return {$: "Some", ["value"]: unit_0};
  } else {
    return fallback_0;
  }
}

function $Work$interrupt_observation$found$(work_0, id_0, found_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: units_0}, ["reason"]: {$: "MissingObservation"}};
  } else {
    const __0 = found_0.value;
    return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: run_loop($Work$remove_observation$(id_0, observations_0)), ["units"]: units_0})), ["admitted"]: {$: "Nil"}};
  }
}

function $Work$interrupt_unit$found$(work_0, id_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingUnit"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const observation_0 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __1 = _t_0.findings;
    const __2 = _t_0.bytes;
    return run_jump($Work$interrupt_unit$stage$, [work_0, id_0, observation_0, stage_0]);
  }
}

function $Lifecycle$finish$continue$bound$(admission_0, work_0, finish_0) {
  const __0 = finish_0.round;
  const __1 = finish_0.active;
  const __2 = finish_0.closed;
  const slot_0 = finish_0.continuations;
  const __3 = finish_0.reserved;
  const token_0 = finish_0.token;
  const __4 = finish_0.collector;
  const __5 = finish_0.deadline_at;
  return {$: "Advanced", ["state"]: {$: "Lifecycle", ["admission"]: admission_0, ["work"]: work_0, ["finish"]: {$: "Finish", ["round"]: __0, ["active"]: __1, ["closed"]: __2, ["continuations"]: slot_0, ["reserved"]: __3, ["token"]: token_0, ["collector"]: __4, ["deadline_at"]: __5}}, ["command"]: {$: "Continue", ["slot"]: slot_0, ["token"]: token_0}};
}

function $Handoff$finish$bind_writer$(state_0, writer_0) {
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_0 = state_0.closed;
  const continuations_0 = state_0.continuations;
  const reserved_0 = state_0.reserved;
  const token_0 = state_0.token;
  const __0 = state_0.collector;
  const deadline_at_0 = state_0.deadline_at;
  return {$: "Finish", ["round"]: round_0, ["active"]: active_0, ["closed"]: closed_0, ["continuations"]: continuations_0, ["reserved"]: reserved_0, ["token"]: nat_chk(token_0 + 1n), ["collector"]: writer_0, ["deadline_at"]: deadline_at_0};
}

function $Admission$close_round$active$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, used_0, at_0) {
  if (!active_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "RoundAlreadyClosed"}};
  } else {
    return run_jump($Admission$close_round$time$, [state_0, partition_0, lifetime_0, round_0, next_token_0, used_0, at_0, run_loop($Nat$is_ge$(at_0, closed_at_0))]);
  }
}

function $Work$source_cancel_ids$(observations_0) {
  if (observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = observations_0.head;
    const id_0 = _t_0.id;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "SourceReading") {
      const rest_0 = observations_0.tail;
      return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Work$source_cancel_ids$(rest_0))};
    } else {
      const rest_1 = observations_0.tail;
      return run_jump($Work$source_cancel_ids$, [rest_1]);
    }
  }
}

function $Work$jev_cancel_ids$(units_0) {
  if (units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = units_0.head;
    const id_0 = _t_0.id;
    const __0 = _t_0.observation;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "AtJev") {
      const __1 = _t_0.findings;
      const __2 = _t_0.bytes;
      const rest_0 = units_0.tail;
      return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Work$jev_cancel_ids$(rest_0))};
    } else {
      const __3 = _t_0.findings;
      const __4 = _t_0.bytes;
      const rest_1 = units_0.tail;
      return run_jump($Work$jev_cancel_ids$, [rest_1]);
    }
  }
}

function $Work$discarded_finding_ids$(units_0) {
  if (units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = units_0.head;
    const id_0 = _t_0.id;
    const __0 = _t_0.observation;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "PendingFinding") {
      const __1 = _t_0.findings;
      const __2 = _t_0.bytes;
      const rest_0 = units_0.tail;
      return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Work$discarded_finding_ids$(rest_0))};
    } else {
      const __3 = _t_0.findings;
      const __4 = _t_0.bytes;
      const rest_1 = units_0.tail;
      return run_jump($Work$discarded_finding_ids$, [rest_1]);
    }
  }
}

function $Handoff$finish$decide$(state_0, unfinished_0, deadline_0, actionable_findings_0) {
  const __0 = state_0.round;
  const active_0 = state_0.active;
  const closed_0 = state_0.closed;
  const __1 = state_0.continuations;
  const reserved_0 = state_0.reserved;
  const __2 = state_0.token;
  const __3 = state_0.collector;
  const __4 = state_0.deadline_at;
  return run_jump($Handoff$finish$guard$, [{$: "Finish", ["round"]: __0, ["active"]: active_0, ["closed"]: closed_0, ["continuations"]: __1, ["reserved"]: reserved_0, ["token"]: __2, ["collector"]: __3, ["deadline_at"]: __4}, unfinished_0, deadline_0, actionable_findings_0, run_loop($Bool$and$(active_0, run_loop($Bool$not$(closed_0)))), reserved_0]);
}

function $Nat$is_ge$(a_0, b_0) {
  return run_jump($Cmp$is_ge$, [cmp_new(a_0, b_0)]);
}

function $Handoff$finish$start$choose$(state_0, original_deadline_0, first_0) {
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_0 = state_0.closed;
  const continuations_0 = state_0.continuations;
  const reserved_0 = state_0.reserved;
  const token_0 = state_0.token;
  const collector_0 = state_0.collector;
  const deadline_at_0 = state_0.deadline_at;
  if (first_0) {
    return {$: "Finish", ["round"]: round_0, ["active"]: active_0, ["closed"]: closed_0, ["continuations"]: continuations_0, ["reserved"]: reserved_0, ["token"]: token_0, ["collector"]: collector_0, ["deadline_at"]: original_deadline_0};
  } else {
    return {$: "Finish", ["round"]: round_0, ["active"]: active_0, ["closed"]: closed_0, ["continuations"]: continuations_0, ["reserved"]: reserved_0, ["token"]: token_0, ["collector"]: collector_0, ["deadline_at"]: deadline_at_0};
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

function $Bool$pick$(c_0, a_0, b_0) {
  if (!c_0) {
    return b_0;
  } else {
    return a_0;
  }
}

function $Work$is_unit_unfinished$(stage_0) {
  if (stage_0.$ === "ReviewQueued") {
    return true;
  } else if (stage_0.$ === "AtJev") {
    return true;
  } else {
    return false;
  }
}

function $Admission$issue$guard$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, tool_0, started_0, deadline_0, now_0, clock_valid_0) {
  if (!clock_valid_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "StaleInvocation"}};
  } else {
    const x_0 = run_loop($Admission$has_tool$(tool_0, permits_0));
    const x_1 = run_loop($Admission$has_used_tool$(tool_0, used_0));
    return run_jump($Admission$issue$tool$, [state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, tool_0, started_0, deadline_0, (x_0 || x_1)]);
  }
}

function $Admission$consume$used$(state_0, token_0, tool_0, now_0, was_used_0, permit_0) {
  if (was_used_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "UsedPermit"}};
  } else {
    return run_jump($Admission$consume$found$, [state_0, token_0, tool_0, now_0, permit_0]);
  }
}

function $Admission$has_token$(token_0, used_0) {
  if (used_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = used_0.head;
    const current_0 = _t_0.token;
    const __0 = _t_0.tool;
    const rest_0 = used_0.tail;
    const x_0 = run_loop($Nat$is_eq$(token_0, current_0));
    const x_1 = run_loop($Admission$has_token$(token_0, rest_0));
    return (x_0 || x_1);
  }
}

function $Admission$find_permit$(token_0, permits_0) {
  if (permits_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = permits_0.head;
    const current_0 = _t_0.token;
    const __0 = _t_0.tool;
    const __1 = _t_0.round;
    const __2 = _t_0.started;
    const __3 = _t_0.deadline;
    const rest_0 = permits_0.tail;
    return run_jump($Admission$find_permit$pick$, [{$: "Permit", ["token"]: current_0, ["tool"]: __0, ["round"]: __1, ["started"]: __2, ["deadline"]: __3}, run_loop($Admission$find_permit$(token_0, rest_0)), run_loop($Nat$is_eq$(current_0, token_0))]);
  }
}

function $Admission$release$used$(state_0, token_0, used_0, found_0) {
  if (used_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "UsedPermit"}};
  } else {
    return run_jump($Admission$release$found$, [state_0, token_0, found_0]);
  }
}

function $Admission$restart$fresh$(state_0, partition_0, lifetime_0, closed_at_0, new_lifetime_0, at_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "LifetimeNotFresh"}};
  } else {
    return {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: new_lifetime_0, ["round"]: 0n, ["active"]: false, ["closed_at"]: at_0, ["next_token"]: 1n, ["permits"]: {$: "Nil"}, ["used"]: {$: "Nil"}}, ["token"]: {$: "None"}, ["round"]: {$: "None"}};
  }
}

function $Flow$has_room$(occupied_0, capacity_0) {
  const low_0 = capacity_0.low;
  const high_0 = capacity_0.high;
  const x_0 = run_loop($Nat$is_gt$(high_0, 0n));
  const x_1 = (occupied_0 < low_0);
  return (x_0 || x_1);
}

function $Work$is_source_reading$(stage_0) {
  if (stage_0.$ === "SourceQueued") {
    return false;
  } else {
    return true;
  }
}

function $Work$is_at_jev$(stage_0) {
  if (stage_0.$ === "AtJev") {
    return true;
  } else {
    return false;
  }
}

function $Work$prepare$count$(work_0, observation_0, count_0, within_limit_0) {
  if (!within_limit_0) {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "TooManyUnits"}};
  } else {
    return run_jump($Work$prepare$apply$, [work_0, observation_0, count_0]);
  }
}

function $Work$outcome$kind$(work_0, id_0, observation_0, result_0) {
  if (result_0.$ === "Finding") {
    const count_0 = result_0.count;
    const bytes_0 = result_0.bytes;
    return run_jump($Work$outcome$finding$, [work_0, id_0, observation_0, count_0, bytes_0, run_loop($Nat$is_gt$(count_0, 0n))]);
  } else if (result_0.$ === "Clear") {
    return run_jump($Work$outcome$apply$, [work_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: {$: "ClearResult"}, ["findings"]: 0n, ["bytes"]: 0n}]);
  } else {
    return run_jump($Work$outcome$apply$, [work_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: {$: "UnavailableResult"}, ["findings"]: 0n, ["bytes"]: 0n}]);
  }
}

function $Work$remove_observation$(id_0, observations_0) {
  if (observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = observations_0.head;
    const current_0 = _t_0.id;
    const __0 = _t_0.stage;
    const rest_0 = observations_0.tail;
    return run_jump($Work$remove_observation$pick$, [{$: "Observation", ["id"]: current_0, ["stage"]: __0}, run_loop($Work$remove_observation$(id_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Work$interrupt_unit$stage$(work_0, id_0, observation_0, stage_0) {
  if (stage_0.$ === "AtJev") {
    return run_jump($Work$outcome$apply$, [work_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: {$: "InterruptedResult"}, ["findings"]: 0n, ["bytes"]: 0n}]);
  } else if (stage_0.$ === "ReviewQueued") {
    return run_jump($Work$outcome$apply$, [work_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: {$: "InterruptedResult"}, ["findings"]: 0n, ["bytes"]: 0n}]);
  } else {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "UnitNotAtJev"}};
  }
}

function $Admission$close_round$time$(state_0, partition_0, lifetime_0, round_0, next_token_0, used_0, at_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "InvalidClock"}};
  } else {
    return {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: false, ["closed_at"]: at_0, ["next_token"]: next_token_0, ["permits"]: {$: "Nil"}, ["used"]: used_0}, ["token"]: {$: "None"}, ["round"]: {$: "Some", ["value"]: round_0}};
  }
}

function $Handoff$finish$guard$(state_0, unfinished_0, deadline_0, actionable_findings_0, valid_0, reserved_0) {
  if (valid_0) {
    return run_jump($Handoff$finish$pending$, [state_0, unfinished_0, deadline_0, actionable_findings_0, reserved_0]);
  } else {
    return {$: "Allow", ["state"]: state_0};
  }
}

function $Cmp$is_ge$(c_0) {
  if (c_0.$ === "LT") {
    return false;
  } else if (c_0.$ === "EQ") {
    return true;
  } else {
    return true;
  }
}

function $Admission$issue$tool$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, tool_0, started_0, deadline_0, duplicate_0) {
  if (duplicate_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "DuplicateTool"}};
  } else {
    const expected_round_0 = run_loop($Admission$candidate_round$(round_0, active_0));
    return {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: nat_chk(next_token_0 + 1n), ["permits"]: run_loop($List$append$(permits_0, {$: "Con", ["head"]: {$: "Permit", ["token"]: next_token_0, ["tool"]: tool_0, ["round"]: expected_round_0, ["started"]: started_0, ["deadline"]: deadline_0}, ["tail"]: {$: "Nil"}})), ["used"]: used_0}, ["token"]: {$: "Some", ["value"]: next_token_0}, ["round"]: {$: "Some", ["value"]: expected_round_0}};
  }
}

function $Admission$has_tool$(tool_0, permits_0) {
  if (permits_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = permits_0.head;
    const __0 = _t_0.token;
    const current_0 = _t_0.tool;
    const __1 = _t_0.round;
    const __2 = _t_0.started;
    const __3 = _t_0.deadline;
    const rest_0 = permits_0.tail;
    const x_0 = run_loop($Nat$is_eq$(tool_0, current_0));
    const x_1 = run_loop($Admission$has_tool$(tool_0, rest_0));
    return (x_0 || x_1);
  }
}

function $Admission$has_used_tool$(tool_0, used_0) {
  if (used_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = used_0.head;
    const __0 = _t_0.token;
    const current_0 = _t_0.tool;
    const rest_0 = used_0.tail;
    const x_0 = run_loop($Nat$is_eq$(tool_0, current_0));
    const x_1 = run_loop($Admission$has_used_tool$(tool_0, rest_0));
    return (x_0 || x_1);
  }
}

function $Admission$consume$found$(state_0, token_0, tool_0, now_0, permit_0) {
  if (permit_0.$ === "None") {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "NoPermit"}};
  } else {
    const _t_0 = permit_0.value;
    const __0 = _t_0.token;
    const permitted_tool_0 = _t_0.tool;
    const permitted_round_0 = _t_0.round;
    const started_0 = _t_0.started;
    const deadline_0 = _t_0.deadline;
    return run_jump($Admission$consume$check$, [state_0, token_0, tool_0, now_0, permitted_tool_0, permitted_round_0, started_0, deadline_0]);
  }
}

function $Admission$find_permit$pick$(permit_0, fallback_0, hit_0) {
  if (hit_0) {
    return {$: "Some", ["value"]: permit_0};
  } else {
    return fallback_0;
  }
}

function $Admission$release$found$(state_0, token_0, found_0) {
  const partition_0 = state_0.partition;
  const lifetime_0 = state_0.lifetime;
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const next_token_0 = state_0.next_token;
  const permits_0 = state_0.permits;
  const used_0 = state_0.used;
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: permits_0, ["used"]: used_0}, ["reason"]: {$: "NoPermit"}};
  } else {
    const __0 = found_0.value;
    return {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: run_loop($Admission$remove_permit$(token_0, permits_0)), ["used"]: used_0}, ["token"]: {$: "None"}, ["round"]: {$: "None"}};
  }
}

function $Work$prepare$apply$(work_0, observation_0, count_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  const new_units_0 = run_loop($Work$make_units$(count_0, observation_0, next_unit_0));
  return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: nat_chk(next_unit_0 + count_0), ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: run_loop($Work$remove_observation$(observation_0, observations_0)), ["units"]: run_loop($List$append$(units_0, new_units_0))})), ["admitted"]: run_loop($Work$unit_ids$(new_units_0))};
}

function $Work$outcome$finding$(work_0, id_0, observation_0, count_0, bytes_0, positive_0) {
  if (!positive_0) {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "InvalidFinding"}};
  } else {
    return run_jump($Work$outcome$apply$, [work_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: {$: "PendingFinding"}, ["findings"]: count_0, ["bytes"]: bytes_0}]);
  }
}

function $Work$outcome$apply$(work_0, unit_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  const id_0 = unit_0.id;
  const __0 = unit_0.observation;
  const __1 = unit_0.stage;
  const __2 = unit_0.findings;
  const __3 = unit_0.bytes;
  return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: run_loop($Work$replace_unit$(id_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: __0, ["stage"]: __1, ["findings"]: __2, ["bytes"]: __3}, units_0))})), ["admitted"]: {$: "Nil"}};
}

function $Work$remove_observation$pick$(observation_0, tail_0, hit_0) {
  if (hit_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: observation_0, ["tail"]: tail_0};
  }
}

function $Handoff$finish$pending$(state_0, unfinished_0, deadline_0, actionable_findings_0, reserved_0) {
  if (reserved_0) {
    return {$: "Wait", ["state"]: state_0};
  } else {
    return run_jump($Handoff$finish$ready$, [state_0, unfinished_0, deadline_0, actionable_findings_0]);
  }
}

function $Admission$candidate_round$(round_0, active_0) {
  if (active_0) {
    return round_0;
  } else {
    return nat_chk(round_0 + 1n);
  }
}

function $Admission$consume$check$(state_0, token_0, tool_0, now_0, permitted_tool_0, permitted_round_0, started_0, deadline_0) {
  const partition_0 = state_0.partition;
  const lifetime_0 = state_0.lifetime;
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const next_token_0 = state_0.next_token;
  const permits_0 = state_0.permits;
  const used_0 = state_0.used;
  return run_jump($Admission$consume$tool$, [{$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: permits_0, ["used"]: used_0}, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, tool_0, now_0, permitted_round_0, started_0, deadline_0, run_loop($Nat$is_eq$(tool_0, permitted_tool_0))]);
}

function $Admission$remove_permit$(token_0, permits_0) {
  if (permits_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = permits_0.head;
    const current_0 = _t_0.token;
    const __0 = _t_0.tool;
    const __1 = _t_0.round;
    const __2 = _t_0.started;
    const __3 = _t_0.deadline;
    const rest_0 = permits_0.tail;
    return run_jump($Admission$remove_permit$pick$, [{$: "Permit", ["token"]: current_0, ["tool"]: __0, ["round"]: __1, ["started"]: __2, ["deadline"]: __3}, run_loop($Admission$remove_permit$(token_0, rest_0)), run_loop($Nat$is_eq$(current_0, token_0))]);
  }
}

function $Work$make_units$(count_0, observation_0, next_id_0) {
  if (count_0 === 0n) {
    return {$: "Nil"};
  } else {
    const rest_0 = (count_0 - 1n);
    return {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: next_id_0, ["observation"]: observation_0, ["stage"]: {$: "ReviewQueued"}, ["findings"]: 0n, ["bytes"]: 0n}, ["tail"]: run_loop($Work$make_units$(rest_0, observation_0, nat_chk(next_id_0 + 1n)))};
  }
}

function $Work$unit_ids$(units_0) {
  if (units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = units_0.head;
    const id_0 = _t_0.id;
    const __0 = _t_0.observation;
    const __1 = _t_0.stage;
    const __2 = _t_0.findings;
    const __3 = _t_0.bytes;
    const rest_0 = units_0.tail;
    return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Work$unit_ids$(rest_0))};
  }
}

function $Work$replace_unit$(id_0, replacement_0, units_0) {
  if (units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = units_0.head;
    const current_0 = _t_0.id;
    const __0 = _t_0.observation;
    const __1 = _t_0.stage;
    const __2 = _t_0.findings;
    const __3 = _t_0.bytes;
    const rest_0 = units_0.tail;
    return run_jump($Work$replace_unit$pick$, [{$: "ReviewUnit", ["id"]: current_0, ["observation"]: __0, ["stage"]: __1, ["findings"]: __2, ["bytes"]: __3}, replacement_0, run_loop($Work$replace_unit$(id_0, replacement_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Handoff$finish$ready$(state_0, unfinished_0, deadline_0, actionable_findings_0) {
  if (deadline_0) {
    return run_jump($Handoff$finish$choose$, [state_0, actionable_findings_0]);
  } else {
    return run_jump($Handoff$finish$zero$, [state_0, actionable_findings_0, run_loop($Nat$is_eq$(unfinished_0, 0n))]);
  }
}

function $Admission$consume$tool$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, tool_0, now_0, permitted_round_0, started_0, deadline_0, correct_tool_0) {
  if (!correct_tool_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "WrongTool"}};
  } else {
    return run_jump($Admission$consume$time$, [state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, now_0, permitted_round_0, run_loop($Bool$and$(run_loop($Nat$is_gt$(started_0, closed_at_0)), run_loop($Bool$and$(run_loop($Nat$is_le$(started_0, now_0)), run_loop($Nat$is_le$(now_0, deadline_0))))))]);
  }
}

function $Admission$remove_permit$pick$(permit_0, tail_0, hit_0) {
  if (hit_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: permit_0, ["tail"]: tail_0};
  }
}

function $Work$replace_unit$pick$(unit_0, replacement_0, tail_0, hit_0) {
  if (hit_0) {
    return {$: "Con", ["head"]: replacement_0, ["tail"]: tail_0};
  } else {
    return {$: "Con", ["head"]: unit_0, ["tail"]: tail_0};
  }
}

function $Handoff$finish$choose$(state_0, actionable_findings_0) {
  const __0 = state_0.round;
  const __1 = state_0.active;
  const __2 = state_0.closed;
  const continuations_0 = state_0.continuations;
  const __3 = state_0.reserved;
  const __4 = state_0.token;
  const __5 = state_0.collector;
  const __6 = state_0.deadline_at;
  return run_jump($Handoff$finish$choose$check$, [{$: "Finish", ["round"]: __0, ["active"]: __1, ["closed"]: __2, ["continuations"]: continuations_0, ["reserved"]: __3, ["token"]: __4, ["collector"]: __5, ["deadline_at"]: __6}, run_loop($Bool$and$(run_loop($Nat$is_gt$(actionable_findings_0, 0n)), (continuations_0 < 4n)))]);
}

function $Handoff$finish$zero$(state_0, actionable_findings_0, zero_0) {
  if (zero_0) {
    return run_jump($Handoff$finish$choose$, [state_0, actionable_findings_0]);
  } else {
    return {$: "Wait", ["state"]: state_0};
  }
}

function $Admission$consume$time$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, now_0, permitted_round_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "Expired"}};
  } else {
    return run_jump($Admission$consume$round$, [state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, permitted_round_0, run_loop($Nat$is_eq$(permitted_round_0, run_loop($Admission$candidate_round$(round_0, active_0))))]);
  }
}

function $Handoff$finish$choose$check$(state_0, can_continue_0) {
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_0 = state_0.closed;
  const continuations_0 = state_0.continuations;
  const reserved_0 = state_0.reserved;
  const token_0 = state_0.token;
  const collector_0 = state_0.collector;
  const deadline_at_0 = state_0.deadline_at;
  if (can_continue_0) {
    return {$: "Continue", ["state"]: {$: "Finish", ["round"]: round_0, ["active"]: active_0, ["closed"]: closed_0, ["continuations"]: nat_chk(continuations_0 + 1n), ["reserved"]: true, ["token"]: token_0, ["collector"]: collector_0, ["deadline_at"]: deadline_at_0}};
  } else {
    return {$: "Allow", ["state"]: {$: "Finish", ["round"]: round_0, ["active"]: false, ["closed"]: true, ["continuations"]: continuations_0, ["reserved"]: false, ["token"]: token_0, ["collector"]: collector_0, ["deadline_at"]: deadline_at_0}};
  }
}

function $Admission$consume$round$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, permitted_round_0, correct_round_0) {
  if (!correct_round_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "OldRound"}};
  } else {
    return {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: permitted_round_0, ["active"]: true, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: run_loop($Admission$remove_permit$(token_0, permits_0)), ["used"]: run_loop($Admission$record_used$(token_0, permits_0, used_0))}, ["token"]: {$: "Some", ["value"]: token_0}, ["round"]: {$: "Some", ["value"]: permitted_round_0}};
  }
}

function $Admission$record_used$(token_0, permits_0, used_0) {
  return run_jump($Admission$record_used$found$, [run_loop($Admission$find_permit$(token_0, permits_0)), used_0]);
}

function $Admission$record_used$found$(permit_0, used_0) {
  if (permit_0.$ === "None") {
    return used_0;
  } else {
    const _t_0 = permit_0.value;
    const found_0 = _t_0.token;
    const tool_0 = _t_0.tool;
    const __0 = _t_0.round;
    const __1 = _t_0.started;
    const __2 = _t_0.deadline;
    return {$: "Con", ["head"]: {$: "Used", ["token"]: found_0, ["tool"]: tool_0}, ["tail"]: used_0};
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

const MAX_NAT = (1n << 48n) - 1n;
const nat = (value) => {
  const integer = typeof value === "number"
    ? Number.isSafeInteger(value) ? BigInt(value) : null
    : typeof value === "bigint" ? value : null;
  if (integer === null || integer < 0n || integer > MAX_NAT) {
    throw new TypeError("expected Bend Nat within the immediate range");
  }
  return integer;
};
const normalize = (value) => {
  if (typeof value === "number" || typeof value === "bigint") return nat(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
};
export const bendLifecycleInitial = (partition, lifetime) =>
  run_loop($Lifecycle$initial$(nat(partition), nat(lifetime)));
export const bendLifecycleApply = (state, partition, lifetime, round, event) =>
  run_loop($Lifecycle$apply$(state, nat(partition), nat(lifetime), nat(round), normalize(event)));
