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
  return b === 0 ? {$: "Tuple", fst: 0, snd: a}
    : {$: "Tuple", fst: Math.trunc(a / b), snd: a % b};
}

function nat_chk(n) {
  if (n > 281474976710655) {
    throw "bend: a Nat past the largest immediate 2^48-1";
  }
  return n;
}

function nat_host(n) {
  const int = typeof n === "bigint" || Number.isInteger(n);
  if (int && n >= 0 && n <= 2 ** 53) {
    return Number(n);
  }
  return { [Symbol.toPrimitive]() { throw "bend: a Nat past the largest immediate 2^48-1"; } };
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
  for (let p = 1; p <= 9 && f32_round(s) !== x; p += 1) {
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
  const v = f32_round(s.replace(/inf\w*/i, "Infinity"));
  return re.test(s) ? {$: "Some", value: v} : {$: "None"};
}

const f32_round = function f32_round(s) {
  const d = Number(s);
  const a = Math.abs(d);
  const f = Math.fround(a);
  const g = 2 * a - Math.min(f, 2 ** 128);
  if (g === f || Math.fround(g) !== g || g === Infinity) {
    return Math.sign(d) * f;
  }
  let k = 0;
  while (a * 2 ** k % 1 !== 0) {
    k += 1;
  }
  const [, i, r, e] = /(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s);
  const n = Number(e ?? 0) - r.length;
  const x = BigInt(i + r) * 2n ** BigInt(k) * 10n ** BigInt(Math.max(n, 0));
  const y = BigInt(a * 2 ** k) * 10n ** BigInt(Math.max(-n, 0));
  return Math.sign(d) * (x === y || x > y !== g > f ? f : g);
};

function char_new(code) {
  if (code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) {
    throw "bend: " + code + " is not a Unicode scalar value";
  }
  return String.fromCodePoint(code);
}

// Array
// =====

function array_new(d, v) {
  if (d > 31) {
    throw "bend: an array past the deepest block class 31";
  }
  return Array(2 ** d).fill(v);
}

function array_node(a, b) {
  if (a.length !== b.length) {
    throw "bend: runtime fail-stop";
  }
  return a.concat(b);
}

function array_rmw(a, i, f) {
  const at = i % a.length;
  const old = a[at];
  a[at] = f(old);
  return {$: "Tuple", fst: a, snd: old};
}

// Run
// ===

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
    : f(...a);
}

// Effect
// ======

const $0eff = Object.create(null);

function io_eff(k, run, need) {
  if (k in $0eff) {
    throw new Error("bend: two effects register " + k);
  }
  $0eff[k] = { run, need };
}
// Program
// =======

function $main$() {
  return $Lifecycle$apply$(($Lifecycle$initial$(1, 1)), 1, 1, 0, {$: "Lifecycle.Issue", "tool": 2, "started": 1, "deadline": 5, "now": 1});
}

function $Lifecycle$apply$(_state_0, _partition_0, _lifetime_0, _round_0, _event_0) {
  if (_event_0.$ === "Lifecycle.Issue") {
    const _tool_0 = _event_0["tool"];
    const _started_0 = _event_0["started"];
    const _deadline_0 = _event_0["deadline"];
    const _now_0 = _event_0["now"];
    return $Lifecycle$issue$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0);
  } else if (_event_0.$ === "Lifecycle.Commit") {
    const _permit_0 = _event_0["permit"];
    const _tool_1 = _event_0["tool"];
    const _now_1 = _event_0["now"];
    return $Lifecycle$commit$(_state_0, _partition_0, _lifetime_0, _permit_0, _tool_1, _now_1);
  } else if (_event_0.$ === "Lifecycle.Prepared") {
    const _observation_0 = _event_0["observation"];
    const _count_0 = _event_0["count"];
    return $Lifecycle$prepared$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _count_0);
  } else if (_event_0.$ === "Lifecycle.Reviewed") {
    const _unit_0 = _event_0["unit"];
    const _outcome_0 = _event_0["outcome"];
    return $Lifecycle$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _unit_0, _outcome_0);
  } else if (_event_0.$ === "Lifecycle.SourceInterrupted") {
    const _observation_1 = _event_0["observation"];
    return $Lifecycle$interrupt$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_1, true);
  } else if (_event_0.$ === "Lifecycle.ReviewInterrupted") {
    const _unit_1 = _event_0["unit"];
    return $Lifecycle$interrupt$(_state_0, _partition_0, _lifetime_0, _round_0, _unit_1, false);
  } else if (_event_0.$ === "Lifecycle.FinishCheck") {
    const _original_deadline_0 = _event_0["original_deadline"];
    const _actionable_0 = _event_0["actionable_findings"];
    const _at_0 = _event_0["at"];
    const _collector_0 = _event_0["collector"];
    return $Lifecycle$finish_check$(_state_0, _partition_0, _lifetime_0, _round_0, _original_deadline_0, _actionable_0, _at_0, _collector_0);
  } else {
    const _slot_0 = _event_0["slot"];
    const _token_0 = _event_0["token"];
    const _collector_1 = _event_0["collector"];
    return $Lifecycle$write_terminal$(_state_0, _partition_0, _lifetime_0, _round_0, _slot_0, _token_0, _collector_1);
  }
}

function $Lifecycle$initial$(_partition_0, _lifetime_0) {
  return {$: "Lifecycle.Lifecycle", "admission": ($Admission$initial$(_partition_0, _lifetime_0)), "work": ($Work$initial$()), "finish": ($Handoff$finish$initial$(0))};
}

function $Lifecycle$issue$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  return $Lifecycle$issue$result$(_work_0, _finish_0, ($Admission$step$(_admission_0, _partition_0, _lifetime_0, {$: "Admission.Issue", "tool": _tool_0, "started": _started_0, "deadline": _deadline_0, "now": _now_0})));
}

function $Lifecycle$commit$(_state_0, _partition_0, _lifetime_0, _permit_0, _tool_0, _now_0) {
  const _t_0 = _state_0["admission"];
  const __0 = _t_0["partition"];
  const __1 = _t_0["lifetime"];
  const __2 = _t_0["round"];
  const _active_0 = _t_0["active"];
  const __3 = _t_0["closed_at"];
  const __4 = _t_0["next_token"];
  const __5 = _t_0["permits"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  return $Lifecycle$commit$accept$(_work_0, _finish_0, _active_0, ($Admission$step$({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": _active_0, "closed_at": __3, "next_token": __4, "permits": __5}, _partition_0, _lifetime_0, {$: "Admission.Consume", "token": _permit_0, "tool": _tool_0, "now": _now_0})));
}

function $Lifecycle$prepared$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _count_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const __1 = _state_0["finish"];
  return $Lifecycle$prepared$guard$({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": __1}, _observation_0, _count_0, ($Admission$callback_current$(_admission_0, _partition_0, _lifetime_0, _round_0)));
}

function $Lifecycle$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _unit_0, _outcome_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const __1 = _state_0["finish"];
  return $Lifecycle$reviewed$guard$({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": __1}, _unit_0, _outcome_0, ($Admission$callback_current$(_admission_0, _partition_0, _lifetime_0, _round_0)));
}

function $Lifecycle$interrupt$(_state_0, _partition_0, _lifetime_0, _round_0, _id_0, _source_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const __1 = _state_0["finish"];
  return $Lifecycle$interrupt$guard$({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": __1}, _id_0, _source_0, ($Admission$callback_current$(_admission_0, _partition_0, _lifetime_0, _round_0)));
}

function $Lifecycle$finish_check$(_state_0, _partition_0, _lifetime_0, _round_0, _original_deadline_0, _actionable_0, _at_0, _collector_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const __0 = _state_0["finish"];
  return $Lifecycle$finish$guard$({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": __0}, _original_deadline_0, _actionable_0, _at_0, _collector_0, ($Bool$and$(($Admission$callback_current$(_admission_0, _partition_0, _lifetime_0, _round_0)), ($Bool$and$(($Nat$is_gt$(_original_deadline_0, 0)), ($Bool$and$(($Nat$is_gt$(_collector_0, 0)), ($Nat$is_le$(_actionable_0, ($Work$pending_findings$(_work_0)))))))))));
}

function $Lifecycle$write_terminal$(_state_0, _partition_0, _lifetime_0, _round_0, _slot_0, _token_0, _collector_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  return $Lifecycle$write$guard$({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": _finish_0}, _round_0, _slot_0, _token_0, _collector_0, ($Bool$and$(($Admission$callback_current$(_admission_0, _partition_0, _lifetime_0, _round_0)), ($Handoff$finish$can_complete$(_finish_0, _round_0, _slot_0, _token_0, _collector_0)))));
}

function $Admission$initial$(_partition_0, _lifetime_0) {
  return {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": 0, "active": false, "closed_at": 0, "next_token": 1, "permits": {$: "Nil"}};
}

function $Work$initial$() {
  return {$: "Work.Work", "next_observation": 1, "next_unit": 1, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Nil"}};
}

function $Handoff$finish$initial$(_round_0) {
  return {$: "Handoff.Finish", "round": _round_0, "active": true, "closed": false, "continuations": 0, "reserved": false, "token": 0, "collector": 0, "deadline_at": 0};
}

function $Lifecycle$issue$result$(_work_0, _finish_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["token"];
    if (_t_0.$ === "Some") {
      const _value_0 = _t_0["value"];
      return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.PermitIssued", "token": _value_0}};
    } else {
      return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
    }
  } else {
    const _admission_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_1, "work": _work_0, "finish": _finish_0}};
  }
}

function $Admission$step$(_state_0, _partition_0, _lifetime_0, _event_0) {
  const _owner_0 = _state_0["partition"];
  const _live_0 = _state_0["lifetime"];
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed_at"];
  const __3 = _state_0["next_token"];
  const __4 = _state_0["permits"];
  return $Admission$step$partition$({$: "Admission.AdmissionState", "partition": _owner_0, "lifetime": _live_0, "round": __0, "active": __1, "closed_at": __2, "next_token": __3, "permits": __4}, _partition_0, _lifetime_0, _event_0, ($Nat$is_eq$(_owner_0, _partition_0)), ($Nat$is_eq$(_live_0, _lifetime_0)));
}

function $Lifecycle$commit$accept$(_work_0, _finish_0, _earlier_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["round"];
    if (_t_0.$ === "Some") {
      const _value_0 = _t_0["value"];
      return $Lifecycle$commit$work$(_admission_0, ($Work$admit$(_work_0)), ($Lifecycle$finish_for_commit$(_earlier_0, _finish_0, _value_0)));
    } else {
      return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
    }
  } else {
    const _admission_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_1, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle$prepared$guard$(_state_0, _observation_0, _count_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle$prepared$result$(_admission_0, _finish_0, ($Work$prepare$(_work_0, _observation_0, _count_0)));
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Admission$callback_current$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const _owner_0 = _state_0["partition"];
  const _live_0 = _state_0["lifetime"];
  const _current_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  return $Bool$and$(_active_0, ($Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_live_0, _lifetime_0)), ($Nat$is_eq$(_current_0, _round_0)))))));
}

function $Lifecycle$reviewed$guard$(_state_0, _unit_0, _outcome_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle$reviewed$result$(_admission_0, _finish_0, ($Work$outcome$(_work_0, _unit_0, _outcome_0)));
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle$interrupt$guard$(_state_0, _id_0, _source_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle$interrupt$valid$(_admission_0, _work_0, _finish_0, _id_0, _source_0);
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle$finish$guard$(_state_0, _original_deadline_0, _actionable_0, _at_0, _collector_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle$finish$result$(_admission_0, _work_0, _at_0, _collector_0, ($Handoff$finish$decide_at$(_finish_0, ($Work$unfinished$(_work_0)), _at_0, _original_deadline_0, _actionable_0)));
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Bool$and$(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Nat$is_gt$(_a_0, _b_0) {
  return $Cmp$is_gt$(cmp_new(_a_0, _b_0));
}

function $Nat$is_le$(_a_0, _b_0) {
  return $Cmp$is_le$(cmp_new(_a_0, _b_0));
}

function $Work$pending_findings$(_work_0) {
  const _units_0 = _work_0["units"];
  return $Work$pending_findings_in$(_units_0);
}

function $Lifecycle$write$guard$(_state_0, _round_0, _slot_0, _token_0, _collector_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": ($Handoff$finish$complete$(_finish_0, _round_0, _slot_0, _token_0, _collector_0))}, "command": {$: "Lifecycle.WriteSettled"}};
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Handoff$finish$can_complete$(_state_0, _round_0, _slot_0, _token_0, _collector_0) {
  const _own_round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _own_token_0 = _state_0["token"];
  const _own_collector_0 = _state_0["collector"];
  return $Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$and$(_active_0, ($Bool$and$(($Bool$not$(_closed_0)), ($Bool$and$(_reserved_0, ($Bool$and$(($Nat$is_eq$(_continuations_0, _slot_0)), ($Bool$and$(($Nat$is_eq$(_own_token_0, _token_0)), ($Nat$is_eq$(_own_collector_0, _collector_0)))))))))))));
}

function $Admission$step$partition$(_state_0, _partition_0, _lifetime_0, _event_0, _correct_partition_0, _correct_lifetime_0) {
  if (!_correct_partition_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongPartition"}};
  } else {
    if (!_correct_lifetime_0) {
      return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongLifetime"}};
    } else {
      return $Admission$apply_event$(_state_0, _event_0);
    }
  }
}

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
}

function $Lifecycle$commit$work$(_admission_0, _work_result_0, _finish_0) {
  if (_work_result_0.$ === "Work.Accepted") {
    const _work_0 = _work_result_0["state"];
    const _ids_0 = _work_result_0["admitted"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.ObservationAdmitted", "ids": _ids_0}};
  } else {
    const _work_1 = _work_result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Work$admit$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": ($Work$settle$({$: "Work.Work", "next_observation": nat_chk(_next_observation_0 + 1), "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($List$append$(_observations_0, {$: "Con", "head": {$: "Work.Observation", "id": _next_observation_0, "stage": {$: "Work.SourceQueued"}}, "tail": {$: "Nil"}})), "units": _units_0})), "admitted": {$: "Con", "head": _next_observation_0, "tail": {$: "Nil"}}};
}

function $Lifecycle$finish_for_commit$(_earlier_0, _current_0, _round_0) {
  if (_earlier_0) {
    return _current_0;
  } else {
    return $Handoff$finish$initial$(_round_0);
  }
}

function $Lifecycle$prepared$result$(_admission_0, _finish_0, _result_0) {
  if (_result_0.$ === "Work.Accepted") {
    const _work_0 = _result_0["state"];
    const _ids_0 = _result_0["admitted"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.UnitsAdmitted", "ids": _ids_0}};
  } else {
    const _work_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Work$prepare$(_work_0, _observation_0, _count_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work$prepare$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, ($Work$find_observation$(_observation_0, _observations_0)));
}

function $Lifecycle$reviewed$result$(_admission_0, _finish_0, _result_0) {
  if (_result_0.$ === "Work.Accepted") {
    const _work_0 = _result_0["state"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.OutcomeRecorded"}};
  } else {
    const _work_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Work$outcome$(_work_0, _id_0, _result_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work$outcome$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, _result_0, ($Work$find_unit$(_id_0, _units_0)));
}

function $Lifecycle$interrupt$valid$(_admission_0, _work_0, _finish_0, _id_0, _source_0) {
  if (_source_0) {
    return $Lifecycle$interrupt$result$(_admission_0, _finish_0, ($Work$interrupt_observation$(_work_0, _id_0)));
  } else {
    return $Lifecycle$interrupt$result$(_admission_0, _finish_0, ($Work$interrupt_unit$(_work_0, _id_0)));
  }
}

function $Lifecycle$finish$result$(_admission_0, _work_0, _at_0, _collector_0, _result_0) {
  if (_result_0.$ === "Handoff.Wait") {
    const _finish_0 = _result_0["state"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.FinishWaiting"}};
  } else if (_result_0.$ === "Handoff.Continue") {
    const _finish_1 = _result_0["state"];
    return $Lifecycle$finish$continue$(_admission_0, _work_0, _finish_1, _collector_0);
  } else {
    const _finish_2 = _result_0["state"];
    return $Lifecycle$allow$closed$(($Admission$close_round$(_admission_0, _at_0)), ($Work$close$(_work_0)), _finish_2);
  }
}

function $Handoff$finish$decide_at$(_state_0, _unfinished_0, _now_0, _original_deadline_0, _actionable_findings_0) {
  return $Handoff$finish$at$(($Handoff$finish$start$(_state_0, _original_deadline_0)), _unfinished_0, _now_0, _actionable_findings_0);
}

function $Work$unfinished$(_work_0) {
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _x_0 = ($Work$unfinished_observations$(_observations_0));
  const _x_1 = ($Work$unfinished_units$(_units_0));
  return nat_chk(_x_0 + _x_1);
}

function $Cmp$is_gt$(_c_0) {
  if (_c_0.$ === "GT") {
    return true;
  } else {
    return false;
  }
}

function $Cmp$is_le$(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $Work$pending_findings_in$($0) {
  for (;;) {
    {
      const _units_0 = $0;
      if (_units_0.$ === "Nil") {
        return 0;
      } else {
        const _t_0 = _units_0["head"];
        const _t_1 = _t_0["stage"];
        if (_t_1.$ === "Work.PendingFinding") {
          const _findings_0 = _t_0["findings"];
          const _rest_0 = _units_0["tail"];
          const _x_0 = ($Work$pending_findings_in$(_rest_0));
          return nat_chk(_findings_0 + _x_0);
        } else {
          const _rest_1 = _units_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Handoff$finish$complete$(_state_0, _round_0, _slot_0, _token_0, _collector_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const __7 = _state_0["deadline_at"];
  return $Handoff$finish$complete$check$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": __7}, ($Handoff$finish$can_complete$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": __7}, _round_0, _slot_0, _token_0, _collector_0)));
}

function $Bool$not$(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $Admission$apply_event$(_state_0, _event_0) {
  if (_event_0.$ === "Admission.Issue") {
    const _tool_0 = _event_0["tool"];
    const _started_0 = _event_0["started"];
    const _deadline_0 = _event_0["deadline"];
    const _now_0 = _event_0["now"];
    return $Admission$issue$(_state_0, _tool_0, _started_0, _deadline_0, _now_0);
  } else if (_event_0.$ === "Admission.Consume") {
    const _token_0 = _event_0["token"];
    const _tool_1 = _event_0["tool"];
    const _now_1 = _event_0["now"];
    return $Admission$consume$(_state_0, _token_0, _tool_1, _now_1);
  } else if (_event_0.$ === "Admission.Release") {
    const _token_1 = _event_0["token"];
    return $Admission$release$(_state_0, _token_1);
  } else if (_event_0.$ === "Admission.CloseRound") {
    const _at_0 = _event_0["at"];
    return $Admission$close_round$(_state_0, _at_0);
  } else {
    const _new_lifetime_0 = _event_0["new_lifetime"];
    const _at_1 = _event_0["at"];
    return $Admission$restart$(_state_0, _new_lifetime_0, _at_1);
  }
}

function $Cmp$is_eq$(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Work$settle$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work$fill_source$(_observations_0, _source_capacity_0, ($Work$reading_count$(_observations_0)))), "units": ($Work$fill_review$(_units_0, _review_capacity_0, ($Work$at_jev_count$(_units_0))))};
}

function $List$append$(_xs_0, _ys_0) {
  if (_xs_0.$ === "Nil") {
    return _ys_0;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return {$: "Con", "head": _h_0, "tail": ($List$append$(_t_0, _ys_0))};
  }
}

function $Work$prepare$found$(_work_0, _observation_0, _count_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _stage_0 = _t_0["stage"];
    return $Work$prepare$stage$(_work_0, _observation_0, _count_0, _stage_0);
  }
}

function $Work$find_observation$(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $Work$find_observation$pick$({$: "Work.Observation", "id": _current_0, "stage": __0}, ($Work$find_observation$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Work$outcome$found$(_work_0, _id_0, _result_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work$outcome$stage$(_work_0, _id_0, _observation_0, _stage_0, _result_0);
  }
}

function $Work$find_unit$(_id_0, _units_0) {
  if (_units_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _units_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["observation"];
    const __1 = _t_0["stage"];
    const __2 = _t_0["findings"];
    const __3 = _t_0["bytes"];
    const _rest_0 = _units_0["tail"];
    return $Work$find_unit$pick$({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, ($Work$find_unit$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Lifecycle$interrupt$result$(_admission_0, _finish_0, _result_0) {
  if (_result_0.$ === "Work.Accepted") {
    const _work_0 = _result_0["state"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.WorkInterrupted"}};
  } else {
    const _work_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Work$interrupt_observation$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work$interrupt_observation$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($Work$find_observation$(_id_0, _observations_0)));
}

function $Work$interrupt_unit$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work$interrupt_unit$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($Work$find_unit$(_id_0, _units_0)));
}

function $Lifecycle$finish$continue$(_admission_0, _work_0, _finish_0, _collector_0) {
  return $Lifecycle$finish$continue$bound$(_admission_0, _work_0, ($Handoff$finish$bind_writer$(_finish_0, _collector_0)));
}

function $Lifecycle$allow$closed$(_admission_result_0, _closed_work_0, _finish_0) {
  if (_admission_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _admission_result_0["state"];
    const _work_0 = _closed_work_0["state"];
    const _source_0 = _closed_work_0["cancelled_source"];
    const _jev_0 = _closed_work_0["cancelled_jev"];
    const _discarded_0 = _closed_work_0["discarded_findings"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.Allow", "cancelled_source": _source_0, "cancelled_jev": _jev_0, "discarded": _discarded_0}};
  } else {
    const _admission_1 = _admission_result_0["state"];
    const _work_1 = _closed_work_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_1, "work": _work_1, "finish": _finish_0}};
  }
}

function $Admission$close_round$(_state_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission$close_round$active$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _at_0);
}

function $Work$close$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Closed", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": {$: "Nil"}, "units": {$: "Nil"}}, "cancelled_source": ($Work$source_cancel_ids$(_observations_0)), "cancelled_jev": ($Work$jev_cancel_ids$(_units_0)), "discarded_findings": ($Work$discarded_finding_ids$(_units_0))};
}

function $Handoff$finish$at$(_state_0, _unfinished_0, _now_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return $Handoff$finish$decide$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": _deadline_at_0}, _unfinished_0, ($Nat$is_ge$(_now_0, _deadline_at_0)), _actionable_findings_0);
}

function $Handoff$finish$start$(_state_0, _original_deadline_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return $Handoff$finish$start$choose$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": _deadline_at_0}, _original_deadline_0, ($Nat$is_eq$(_deadline_at_0, 0)));
}

function $Work$unfinished_observations$(_observations_0) {
  return $List$length$(_observations_0);
}

function $Work$unfinished_units$(_units_0) {
  if (_units_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _units_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _units_0["tail"];
    const _x_0 = ($Bool$pick$(($Work$is_unit_unfinished$(_stage_0)), 1, 0));
    const _x_1 = ($Work$unfinished_units$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Handoff$finish$complete$check$(_state_0, _valid_0) {
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _token_0 = _state_0["token"];
  const _collector_0 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  if (_valid_0) {
    return {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": _continuations_0, "reserved": false, "token": _token_0, "collector": _collector_0, "deadline_at": 0};
  } else {
    return {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": _continuations_0, "reserved": _reserved_0, "token": _token_0, "collector": _collector_0, "deadline_at": _deadline_at_0};
  }
}

function $Admission$issue$(_state_0, _tool_0, _started_0, _deadline_0, _now_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission$issue$guard$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _now_0, ($Bool$and$(($Nat$is_gt$(_started_0, _closed_at_0)), ($Bool$and$(($Nat$is_le$(_started_0, _now_0)), ($Nat$is_le$(_now_0, _deadline_0)))))));
}

function $Admission$consume$(_state_0, _token_0, _tool_0, _now_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission$consume$found$({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0}, _token_0, _tool_0, _now_0, ($Admission$find_permit$(_token_0, _permits_0)));
}

function $Admission$release$(_state_0, _token_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission$release$found$({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0}, _token_0, ($Admission$find_permit$(_token_0, _permits_0)));
}

function $Admission$restart$(_state_0, _new_lifetime_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const __2 = _state_0["next_token"];
  const __3 = _state_0["permits"];
  return $Admission$restart$fresh$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": __0, "active": __1, "closed_at": _closed_at_0, "next_token": __2, "permits": __3}, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, ($Bool$and$(($Nat$is_gt$(_new_lifetime_0, _lifetime_0)), ($Nat$is_ge$(_at_0, _closed_at_0)))));
}

function $Work$fill_source$(_observations_0, _capacity_0, _occupied_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _id_0 = _t_0["id"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      const _rest_0 = _observations_0["tail"];
      const _room_0 = ($Flow$has_room$(_occupied_0, _capacity_0));
      const _next_stage_0 = ($Bool$pick$(_room_0, {$: "Work.SourceReading"}, {$: "Work.SourceQueued"}));
      const _x_0 = ($Bool$pick$(_room_0, 1, 0));
      return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": _next_stage_0}, "tail": ($Work$fill_source$(_rest_0, _capacity_0, nat_chk(_occupied_0 + _x_0)))};
    } else {
      const _rest_1 = _observations_0["tail"];
      return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": {$: "Work.SourceReading"}}, "tail": ($Work$fill_source$(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $Work$reading_count$(_observations_0) {
  if (_observations_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _observations_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    const _x_0 = ($Bool$pick$(($Work$is_source_reading$(_stage_0)), 1, 0));
    const _x_1 = ($Work$reading_count$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Work$fill_review$(_units_0, _capacity_0, _occupied_0) {
  if (_units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _units_0["head"];
    const _id_0 = _t_0["id"];
    const _observation_0 = _t_0["observation"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.ReviewQueued") {
      const _findings_0 = _t_0["findings"];
      const _bytes_0 = _t_0["bytes"];
      const _rest_0 = _units_0["tail"];
      const _room_0 = ($Flow$has_room$(_occupied_0, _capacity_0));
      const _next_stage_0 = ($Bool$pick$(_room_0, {$: "Work.AtJev"}, {$: "Work.ReviewQueued"}));
      const _x_0 = ($Bool$pick$(_room_0, 1, 0));
      return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": _next_stage_0, "findings": _findings_0, "bytes": _bytes_0}, "tail": ($Work$fill_review$(_rest_0, _capacity_0, nat_chk(_occupied_0 + _x_0)))};
    } else {
      const _findings_1 = _t_0["findings"];
      const _bytes_1 = _t_0["bytes"];
      const _rest_1 = _units_0["tail"];
      return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": _t_1, "findings": _findings_1, "bytes": _bytes_1}, "tail": ($Work$fill_review$(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $Work$at_jev_count$(_units_0) {
  if (_units_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _units_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _units_0["tail"];
    const _x_0 = ($Bool$pick$(($Work$is_at_jev$(_stage_0)), 1, 0));
    const _x_1 = ($Work$at_jev_count$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Work$prepare$stage$(_work_0, _observation_0, _count_0, _stage_0) {
  if (_stage_0.$ === "Work.SourceQueued") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
  } else {
    return $Work$prepare$count$(_work_0, _observation_0, _count_0, ($Nat$is_le$(_count_0, 16)));
  }
}

function $Work$find_observation$pick$(_observation_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _observation_0};
  } else {
    return _fallback_0;
  }
}

function $Work$outcome$stage$(_work_0, _id_0, _observation_0, _stage_0, _result_0) {
  if (_stage_0.$ === "Work.AtJev") {
    return $Work$outcome$kind$(_work_0, _id_0, _observation_0, _result_0);
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
  }
}

function $Work$find_unit$pick$(_unit_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _unit_0};
  } else {
    return _fallback_0;
  }
}

function $Work$interrupt_observation$found$(_work_0, _id_0, _found_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.MissingObservation"}};
  } else {
    return {$: "Work.Accepted", "state": ($Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work$remove_observation$(_id_0, _observations_0)), "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $Work$interrupt_unit$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work$interrupt_unit$stage$(_work_0, _id_0, _observation_0, _stage_0);
  }
}

function $Lifecycle$finish$continue$bound$(_admission_0, _work_0, _finish_0) {
  const __0 = _finish_0["round"];
  const __1 = _finish_0["active"];
  const __2 = _finish_0["closed"];
  const _slot_0 = _finish_0["continuations"];
  const __3 = _finish_0["reserved"];
  const _token_0 = _finish_0["token"];
  const __4 = _finish_0["collector"];
  const __5 = _finish_0["deadline_at"];
  return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": {$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": _slot_0, "reserved": __3, "token": _token_0, "collector": __4, "deadline_at": __5}}, "command": {$: "Lifecycle.Continue", "slot": _slot_0, "token": _token_0}};
}

function $Handoff$finish$bind_writer$(_state_0, _writer_0) {
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _token_0 = _state_0["token"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": _continuations_0, "reserved": _reserved_0, "token": nat_chk(_token_0 + 1), "collector": _writer_0, "deadline_at": _deadline_at_0};
}

function $Admission$close_round$active$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _at_0) {
  if (!_active_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.RoundAlreadyClosed"}};
  } else {
    return $Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, ($Nat$is_ge$(_at_0, _closed_at_0)));
  }
}

function $Work$source_cancel_ids$($0) {
  for (;;) {
    {
      const _observations_0 = $0;
      if (_observations_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _t_0 = _observations_0["head"];
        const _id_0 = _t_0["id"];
        const _t_1 = _t_0["stage"];
        if (_t_1.$ === "Work.SourceReading") {
          const _rest_0 = _observations_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($Work$source_cancel_ids$(_rest_0))};
        } else {
          const _rest_1 = _observations_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Work$jev_cancel_ids$($0) {
  for (;;) {
    {
      const _units_0 = $0;
      if (_units_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _t_0 = _units_0["head"];
        const _id_0 = _t_0["id"];
        const _t_1 = _t_0["stage"];
        if (_t_1.$ === "Work.AtJev") {
          const _rest_0 = _units_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($Work$jev_cancel_ids$(_rest_0))};
        } else {
          const _rest_1 = _units_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Work$discarded_finding_ids$($0) {
  for (;;) {
    {
      const _units_0 = $0;
      if (_units_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _t_0 = _units_0["head"];
        const _id_0 = _t_0["id"];
        const _t_1 = _t_0["stage"];
        if (_t_1.$ === "Work.PendingFinding") {
          const _rest_0 = _units_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($Work$discarded_finding_ids$(_rest_0))};
        } else {
          const _rest_1 = _units_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Handoff$finish$decide$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const __2 = _state_0["token"];
  const __3 = _state_0["collector"];
  const __4 = _state_0["deadline_at"];
  return $Handoff$finish$guard$({$: "Handoff.Finish", "round": __0, "active": _active_0, "closed": _closed_0, "continuations": __1, "reserved": _reserved_0, "token": __2, "collector": __3, "deadline_at": __4}, _unfinished_0, _deadline_0, _actionable_findings_0, ($Bool$and$(_active_0, ($Bool$not$(_closed_0)))), _reserved_0);
}

function $Nat$is_ge$(_a_0, _b_0) {
  return $Cmp$is_ge$(cmp_new(_a_0, _b_0));
}

function $Handoff$finish$start$choose$(_state_0, _original_deadline_0, _first_0) {
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _token_0 = _state_0["token"];
  const _collector_0 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  if (_first_0) {
    return {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": _continuations_0, "reserved": _reserved_0, "token": _token_0, "collector": _collector_0, "deadline_at": _original_deadline_0};
  } else {
    return {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": _continuations_0, "reserved": _reserved_0, "token": _token_0, "collector": _collector_0, "deadline_at": _deadline_at_0};
  }
}

function $List$length$(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk(($List$length$(_t_0)) + 1);
  }
}

function $Bool$pick$(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
}

function $Work$is_unit_unfinished$(_stage_0) {
  if (_stage_0.$ === "Work.ReviewQueued") {
    return true;
  } else if (_stage_0.$ === "Work.AtJev") {
    return true;
  } else {
    return false;
  }
}

function $Admission$issue$guard$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _now_0, _clock_valid_0) {
  if (!_clock_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.StaleInvocation"}};
  } else {
    return $Admission$issue$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, ($Admission$has_tool$(_tool_0, _permits_0)));
  }
}

function $Admission$consume$found$(_state_0, _token_0, _tool_0, _now_0, _permit_0) {
  if (_permit_0.$ === "None") {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.NoPermit"}};
  } else {
    const _t_0 = _permit_0["value"];
    const _permitted_tool_0 = _t_0["tool"];
    const _permitted_round_0 = _t_0["round"];
    const _started_0 = _t_0["started"];
    const _deadline_0 = _t_0["deadline"];
    return $Admission$consume$check$(_state_0, _token_0, _tool_0, _now_0, _permitted_tool_0, _permitted_round_0, _started_0, _deadline_0);
  }
}

function $Admission$find_permit$(_token_0, _permits_0) {
  if (_permits_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _permits_0["head"];
    const _current_0 = _t_0["token"];
    const __0 = _t_0["tool"];
    const __1 = _t_0["round"];
    const __2 = _t_0["started"];
    const __3 = _t_0["deadline"];
    const _rest_0 = _permits_0["tail"];
    return $Admission$find_permit$pick$({$: "Admission.Permit", "token": _current_0, "tool": __0, "round": __1, "started": __2, "deadline": __3}, ($Admission$find_permit$(_token_0, _rest_0)), ($Nat$is_eq$(_current_0, _token_0)));
  }
}

function $Admission$release$found$(_state_0, _token_0, _found_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  if (_found_0.$ === "None") {
    return {$: "Admission.Rejected", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, "reason": {$: "Admission.NoPermit"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0))}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $Admission$restart$fresh$(_state_0, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.LifetimeNotFresh"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _new_lifetime_0, "round": 0, "active": false, "closed_at": _at_0, "next_token": 1, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $Flow$has_room$(_occupied_0, _capacity_0) {
  const _low_0 = _capacity_0["low"];
  const _high_0 = _capacity_0["high"];
  const _x_0 = ($Nat$is_gt$(_high_0, 0));
  const _x_1 = (_occupied_0 < _low_0);
  return (_x_0 || _x_1);
}

function $Work$is_source_reading$(_stage_0) {
  if (_stage_0.$ === "Work.SourceQueued") {
    return false;
  } else {
    return true;
  }
}

function $Work$is_at_jev$(_stage_0) {
  if (_stage_0.$ === "Work.AtJev") {
    return true;
  } else {
    return false;
  }
}

function $Work$prepare$count$(_work_0, _observation_0, _count_0, _within_limit_0) {
  if (!_within_limit_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.TooManyUnits"}};
  } else {
    return $Work$prepare$apply$(_work_0, _observation_0, _count_0);
  }
}

function $Work$outcome$kind$(_work_0, _id_0, _observation_0, _result_0) {
  if (_result_0.$ === "Work.Finding") {
    const _count_0 = _result_0["count"];
    const _bytes_0 = _result_0["bytes"];
    return $Work$outcome$finding$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, ($Nat$is_gt$(_count_0, 0)));
  } else if (_result_0.$ === "Work.Clear") {
    return $Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.ClearResult"}, "findings": 0, "bytes": 0});
  } else {
    return $Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.UnavailableResult"}, "findings": 0, "bytes": 0});
  }
}

function $Work$remove_observation$(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $Work$remove_observation$pick$({$: "Work.Observation", "id": _current_0, "stage": __0}, ($Work$remove_observation$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Work$interrupt_unit$stage$(_work_0, _id_0, _observation_0, _stage_0) {
  if (_stage_0.$ === "Work.AtJev") {
    return $Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.InterruptedResult"}, "findings": 0, "bytes": 0});
  } else if (_stage_0.$ === "Work.ReviewQueued") {
    return $Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.InterruptedResult"}, "findings": 0, "bytes": 0});
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
  }
}

function $Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.InvalidClock"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "Some", "value": _round_0}};
  }
}

function $Handoff$finish$guard$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _valid_0, _reserved_0) {
  if (_valid_0) {
    return $Handoff$finish$pending$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0);
  } else {
    return {$: "Handoff.Allow", "state": _state_0};
  }
}

function $Cmp$is_ge$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}

function $Admission$issue$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _duplicate_0) {
  if (_duplicate_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.DuplicateTool"}};
  } else {
    const _expected_round_0 = ($Admission$candidate_round$(_round_0, _active_0));
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": nat_chk(_next_token_0 + 1), "permits": ($List$append$(_permits_0, {$: "Con", "head": {$: "Admission.Permit", "token": _next_token_0, "tool": _tool_0, "round": _expected_round_0, "started": _started_0, "deadline": _deadline_0}, "tail": {$: "Nil"}}))}, "token": {$: "Some", "value": _next_token_0}, "round": {$: "Some", "value": _expected_round_0}};
  }
}

function $Admission$has_tool$(_tool_0, _permits_0) {
  if (_permits_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _permits_0["head"];
    const _current_0 = _t_0["tool"];
    const _rest_0 = _permits_0["tail"];
    const _x_0 = ($Nat$is_eq$(_tool_0, _current_0));
    const _x_1 = ($Admission$has_tool$(_tool_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $Admission$consume$check$(_state_0, _token_0, _tool_0, _now_0, _permitted_tool_0, _permitted_round_0, _started_0, _deadline_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission$consume$tool$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, ($Nat$is_eq$(_tool_0, _permitted_tool_0)));
}

function $Admission$find_permit$pick$(_permit_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _permit_0};
  } else {
    return _fallback_0;
  }
}

function $Admission$remove_permit$(_token_0, _permits_0) {
  if (_permits_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _permits_0["head"];
    const _current_0 = _t_0["token"];
    const __0 = _t_0["tool"];
    const __1 = _t_0["round"];
    const __2 = _t_0["started"];
    const __3 = _t_0["deadline"];
    const _rest_0 = _permits_0["tail"];
    return $Admission$remove_permit$pick$({$: "Admission.Permit", "token": _current_0, "tool": __0, "round": __1, "started": __2, "deadline": __3}, ($Admission$remove_permit$(_token_0, _rest_0)), ($Nat$is_eq$(_current_0, _token_0)));
  }
}

function $Work$prepare$apply$(_work_0, _observation_0, _count_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _new_units_0 = ($Work$make_units$(_count_0, _observation_0, _next_unit_0));
  return {$: "Work.Accepted", "state": ($Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + _count_0), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work$remove_observation$(_observation_0, _observations_0)), "units": ($List$append$(_units_0, _new_units_0))})), "admitted": ($Work$unit_ids$(_new_units_0))};
}

function $Work$outcome$finding$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, _positive_0) {
  if (!_positive_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0});
  }
}

function $Work$outcome$apply$(_work_0, _unit_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _id_0 = _unit_0["id"];
  const __0 = _unit_0["observation"];
  const __1 = _unit_0["stage"];
  const __2 = _unit_0["findings"];
  const __3 = _unit_0["bytes"];
  return {$: "Work.Accepted", "state": ($Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($Work$replace_unit$(_id_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, _units_0))})), "admitted": {$: "Nil"}};
}

function $Work$remove_observation$pick$(_observation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _observation_0, "tail": _tail_0};
  }
}

function $Handoff$finish$pending$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0) {
  if (_reserved_0) {
    return {$: "Handoff.Wait", "state": _state_0};
  } else {
    return $Handoff$finish$ready$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0);
  }
}

function $Admission$candidate_round$(_round_0, _active_0) {
  if (_active_0) {
    return _round_0;
  } else {
    return nat_chk(_round_0 + 1);
  }
}

function $Admission$consume$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, _correct_tool_0) {
  if (!_correct_tool_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongTool"}};
  } else {
    return $Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, ($Bool$and$(($Nat$is_gt$(_started_0, _closed_at_0)), ($Bool$and$(($Nat$is_le$(_started_0, _now_0)), ($Nat$is_le$(_now_0, _deadline_0)))))));
  }
}

function $Admission$remove_permit$pick$(_permit_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _permit_0, "tail": _tail_0};
  }
}

function $Work$make_units$(_count_0, _observation_0, _next_id_0) {
  if (_count_0 === 0) {
    return {$: "Nil"};
  } else {
    const _rest_0 = (_count_0 - 1);
    return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _next_id_0, "observation": _observation_0, "stage": {$: "Work.ReviewQueued"}, "findings": 0, "bytes": 0}, "tail": ($Work$make_units$(_rest_0, _observation_0, nat_chk(_next_id_0 + 1)))};
  }
}

function $Work$unit_ids$(_units_0) {
  if (_units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _units_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _units_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($Work$unit_ids$(_rest_0))};
  }
}

function $Work$replace_unit$(_id_0, _replacement_0, _units_0) {
  if (_units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _units_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["observation"];
    const __1 = _t_0["stage"];
    const __2 = _t_0["findings"];
    const __3 = _t_0["bytes"];
    const _rest_0 = _units_0["tail"];
    return $Work$replace_unit$pick$({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, _replacement_0, ($Work$replace_unit$(_id_0, _replacement_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Handoff$finish$ready$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0) {
  if (_deadline_0) {
    return $Handoff$finish$choose$(_state_0, _actionable_findings_0);
  } else {
    return $Handoff$finish$zero$(_state_0, _actionable_findings_0, ($Nat$is_eq$(_unfinished_0, 0)));
  }
}

function $Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.Expired"}};
  } else {
    return $Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, ($Nat$is_eq$(_permitted_round_0, ($Admission$candidate_round$(_round_0, _active_0)))));
  }
}

function $Work$replace_unit$pick$(_unit_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $Handoff$finish$choose$(_state_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const __3 = _state_0["reserved"];
  const __4 = _state_0["token"];
  const __5 = _state_0["collector"];
  const __6 = _state_0["deadline_at"];
  return $Handoff$finish$choose$check$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": _continuations_0, "reserved": __3, "token": __4, "collector": __5, "deadline_at": __6}, ($Bool$and$(($Nat$is_gt$(_actionable_findings_0, 0)), (_continuations_0 < 4))));
}

function $Handoff$finish$zero$(_state_0, _actionable_findings_0, _zero_0) {
  if (_zero_0) {
    return $Handoff$finish$choose$(_state_0, _actionable_findings_0);
  } else {
    return {$: "Handoff.Wait", "state": _state_0};
  }
}

function $Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, _correct_round_0) {
  if (!_correct_round_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.OldRound"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _permitted_round_0, "active": true, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0))}, "token": {$: "Some", "value": _token_0}, "round": {$: "Some", "value": _permitted_round_0}};
  }
}

function $Handoff$finish$choose$check$(_state_0, _can_continue_0) {
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _token_0 = _state_0["token"];
  const _collector_0 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  if (_can_continue_0) {
    return {$: "Handoff.Continue", "state": {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": nat_chk(_continuations_0 + 1), "reserved": true, "token": _token_0, "collector": _collector_0, "deadline_at": _deadline_at_0}};
  } else {
    return {$: "Handoff.Allow", "state": {$: "Handoff.Finish", "round": _round_0, "active": false, "closed": true, "continuations": _continuations_0, "reserved": false, "token": _token_0, "collector": _collector_0, "deadline_at": _deadline_at_0}};
  }
}

// Cli
// ===

let cli_args = [];

function cli(argv) {
  cli_args.push(argv[0]);
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === "--") {
      cli_args.push(...argv.slice(i + 1));
      break;
    } else if (argv[i] === "--bend-help") {
      io_out(1, io_bytes("usage: " + argv[0] + "\n"));
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

// show_val prints a pure main's value as term_show does (see show_main);
// chain is the bracket it continues, or 0. show_chr escapes as char_show.

function show_chr(c, q) {
  const k = { 10: "n", 9: "t", 13: "r", 0: "0", 92: "\\" }[c]
    ?? (c === q.codePointAt(0) ? q : null);
  return k !== null ? "\\" + k : c < 32 || c === 127
    || (c >= 0xD800 && c <= 0xDFFF) || c > 0x10FFFF
    ? "\\u{" + c.toString(16) + "}" : String.fromCodePoint(c);
}

function show_val(D, N, d, v, chain) {
  if (D[d] === 7) {
    const fs = Object.values(typeof v === "boolean"
      ? { $: v ? "True" : "False" } : v);
    let a = d + 3;
    for (; N[D[a]] !== fs[0]; a += 4 + 2 * D[a + 2]) {}
    const o = "{[("[D[a + 3]];
    let s = o === "{" ? fs[0] + "{" : chain === o ? "" : o;
    for (const [j, f] of fs.slice(1).entries()) {
      if (o === "[" ? j === 0 && chain === o : j > 0) {
        s += ", ";
      }
      s += show_val(D, N, D[a + 5 + 2 * j], f, j === 1 && o !== "{" ? o : 0);
    }
    return o === "{" || chain !== o ? s + "}])"[D[a + 3]] : s;
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

// Apple arm64 passes variadic fcntl flags on the stack, so io_sys
// binds fcntl there with the flags as the ninth fixed argument. A
// parked effect waits for fd (a write when out) or until at
// (performance.now()), either one undefined when unused; io_wake
// resumes k with the value of more, and undefined parks it again. The
// waits stay in deadline order, as io_park does in C.

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
    const sel = mac ? "select$DARWIN_EXTSN" : "select";
    const T = { i: "i32", u: "u32", U: "u64", I: "i64", p: "ptr",
      c: "cstring" };
    const vari = mac && process.arch === "arm64";
    const lib = ffi.dlopen(mac ? "libSystem.dylib" : "libc.so.6",
      Object.fromEntries(("socket:iii>i bind:ipu>i listen:ii>i connect:ipu>i"
        + " accept:ipp>i send:ipUi>I recv:ipUi>I read:ipU>I pread:ipUI>I"
        + " sendto:ipUipu>I recvfrom:ipUipp>I close:i>i setsockopt:iiipu>i"
        + " " + sel + ":ipppp>i"
        + (vari ? " fcntl:iiiiiiiii>i" : " fcntl:iii>i") + " getsockopt:iiipp>i"
        + " strerror:i>c " + err + ":>p").split(" ").map((s) => {
        const [name, args, ret] = s.split(/[:>]/);
        return [name, { args: [...args].map((a) => T[a]), returns: T[ret] }];
      }))).symbols;
    const fcntl = (fd, cmd, arg) => vari
      ? lib.fcntl(fd, cmd, 0, 0, 0, 0, 0, 0, arg)
      : lib.fcntl(fd, cmd, arg);
    globalThis.BEND_SYS = { ...lib, fcntl, select: lib[sel],
      ptr: ffi.ptr, mac,
      errno: () => ffi.read.i32(lib[err](), 0) };
  }
  return globalThis.BEND_SYS;
}

function io_fail(code) {
  return { $: "Fail",
    error: io_tup(code >>> 0, String(io_sys().strerror(code))) };
}

function io_done(value) {
  return { $: "Done", value };
}

function io_tup(...xs) {
  return xs.reduceRight((snd, fst) => ({ $: "Tuple", fst, snd }));
}

function io_bytes(text) {
  return new TextEncoder().encode(text);
}

function io_text(b, n) {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(b.subarray(0, n));
}

// Bytes cross as they are (0..255), one List cell each, with no UTF-8 in
// either direction; io_unlist answers null if a value is past 255.
function io_list(b, n) {
  let xs = { $: "Nil" };
  while (n > 0) {
    xs = { $: "Con", head: b[--n], tail: xs };
  }
  return xs;
}

function io_unlist(xs) {
  const b = [];
  for (; xs.$ === "Con"; xs = xs.tail) {
    b.push(xs.head);
  }
  return b.some((x) => x > 255) ? null : Uint8Array.from(b);
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
  io.runs.push({ fun, arg });
  io.live += fresh ? 1 : 0;
}

function io_wait(io) {
  const soon = io.waits[0]?.at ?? Infinity;
  const ms = soon === Infinity ? -1
    : Math.max(0, Math.ceil(soon - performance.now()));
  const fds = io.waits.filter((w) => w.fd !== undefined);
  const top = fds.reduce((m, w) => Math.max(m, w.fd), 0);
  const len = (top >> 6 << 3) + 8;
  const set = new Uint8Array(2 * len);
  const at = (w) => (w.out ? len : 0) + (w.fd >> 3);
  for (const w of fds) {
    set[at(w)] |= 1 << (w.fd & 7);
  }
  const tv = new BigInt64Array([BigInt(ms / 1000 | 0),
    BigInt(ms % 1000 * 1000)]);
  const sys = io_sys();
  if (sys.select(top + 1, sys.ptr(set), sys.ptr(set, len), null,
    ms < 0 ? null : sys.ptr(tv)) < 0) {
    if (sys.errno() !== 4) {
      throw "bend: the poller failed";
    }
    set.fill(0);
  }
  const now = performance.now();
  io.waits = io.waits.filter((w) => {
    const ready = w.at <= now || w.fd !== undefined
      && set[at(w)] & 1 << (w.fd & 7);
    if (ready) {
      io_push(io_wake, w, false);
    }
    return !ready;
  });
}

function io_wake(w) {
  const x = w.more();
  return x === undefined ? undefined : w.k(x);
}

function io_park_on(fd, out, k, more, at) {
  const ws = globalThis.BEND_IO.waits;
  const i = ws.findLastIndex((w) => (w.at ?? Infinity) <= (at ?? Infinity));
  ws.splice(i + 1, 0, { fd, out, k, more, at });
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
      while (op !== undefined) {
        if (op.$ === "Emit") {
          io.live -= 1;
          break;
        }
        if (op.$ === "Halt") {
          io_errs(op.message);
          return op.code;
        }
        const need = op.need?.() ?? {};
        if (need.time || need.read) {
          const more = () => op.run(...op.args, op.kont);
          io_park_on(need.read ? op.args[0] : undefined, false, op.kont, more,
            need.read ? undefined : performance.now() + Number(op.args[0]));
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

const MAX_NAT = (1n << 48n) - 1n;
const nat = (value) => {
  const integer = typeof value === "number"
    ? Number.isSafeInteger(value) ? BigInt(value) : null
    : typeof value === "bigint" ? value : null;
  if (integer === null || integer < 0n || integer > MAX_NAT) {
    throw new TypeError("expected Bend Nat within the immediate range");
  }
  return Number(integer);
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
const shortTag = (value) => value.split(".").at(-1);
const publicCommand = (value) => {
  if (typeof value === "number") return BigInt(value);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === "$" ? shortTag(item) : publicCommand(item)]));
  }
  return value;
};
const resultForCaller = (value) => ({ ...value, $: shortTag(value.$),
  ...(value.command === undefined ? {} : { command: publicCommand(value.command) }) });
const lifecycleEvent = (event) => normalize({ ...event, $: "Lifecycle." + event.$,
  ...(event.outcome === undefined ? {} : { outcome: { ...event.outcome, $: "Work." + event.outcome.$ } }) });
export const bendLifecycleApply = (state, partition, lifetime, round, event) =>
  resultForCaller(run_loop($Lifecycle$apply$(state, nat(partition), nat(lifetime), nat(round), lifecycleEvent(event))));
