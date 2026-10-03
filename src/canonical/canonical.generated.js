// hapsland-bend-source-sha256:b41ae37afc4f1884383095a6dc917578f07d545acf3c177d6da1dff87a6781eb
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
  return {$: "Tuple", "fst": ($Canonical$step$(($Canonical$initial$({$: "Ledger.Limits", "global_items": 4, "global_bytes": 100, "partition_items": 2, "partition_bytes": 60})), {$: "Canonical.OpenRound", "partition": 1, "lifetime": 1})), "snd": ($Ledger$inventory$({$: "Ledger.Limits", "global_items": 4, "global_bytes": 100, "partition_items": 2, "partition_bytes": 60}))};
}

function $Canonical$step$(_state_0, _event_0) {
  return $Canonical$check_step$(_state_0, ($Canonical$step_unchecked$(_state_0, _event_0)));
}

function $Canonical$initial$(_limits_0) {
  return {$: "Canonical.State", "ledger": ($Ledger$initial$(_limits_0)), "rounds": {$: "Nil"}, "work": {$: "Nil"}, "next_round": 1, "next_operation": 1, "admissions": {$: "Nil"}, "dispatch": ($Dispatch$initial$()), "collection": ($CollectionState$initial$()), "history": ($EditHistory$initial$())};
}

function $Ledger$inventory$(_limits_0) {
  return {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.ObservationDispatch"}, "limits": ($Ledger$limits_for$({$: "Ledger.ObservationDispatch"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.Preparation"}, "limits": ($Ledger$limits_for$({$: "Ledger.Preparation"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.ReviewUnit"}, "limits": ($Ledger$limits_for$({$: "Ledger.ReviewUnit"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.StoredResult"}, "limits": ($Ledger$limits_for$({$: "Ledger.StoredResult"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.OperationalNotice"}, "limits": ($Ledger$limits_for$({$: "Ledger.OperationalNotice"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.AdviceRecheck"}, "limits": ($Ledger$limits_for$({$: "Ledger.AdviceRecheck"}, _limits_0))}, "tail": {$: "Nil"}}}}}}};
}

function $Canonical$check_step$(_original_0, _result_0) {
  if (_result_0.$ === "Canonical.Advanced") {
    const _t_0 = _result_0["state"];
    const __0 = _t_0["ledger"];
    const _rounds_0 = _t_0["rounds"];
    const __1 = _t_0["work"];
    const __2 = _t_0["next_round"];
    const __3 = _t_0["next_operation"];
    const __4 = _t_0["admissions"];
    const __5 = _t_0["dispatch"];
    const __6 = _t_0["collection"];
    const _history_0 = _t_0["history"];
    const _commands_0 = _result_0["commands"];
    return $Canonical$check_round_invariant$(_original_0, {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _commands_0, ($Canonical$unique_rounds$(_rounds_0)));
  } else {
    const _state_0 = _result_0["state"];
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": _reason_0};
  }
}

function $Canonical$step_unchecked$(_state_0, _event_0) {
  if (_event_0.$ === "Canonical.ReserveCapacity") {
    const _partition_0 = _event_0["partition"];
    const _bytes_0 = _event_0["bytes"];
    const _purpose_0 = _event_0["purpose"];
    return $Canonical$capacity_reserve$(_state_0, _partition_0, _bytes_0, _purpose_0);
  } else if (_event_0.$ === "Canonical.ResizeCapacity") {
    const _reservation_0 = _event_0["reservation"];
    const _bytes_1 = _event_0["bytes"];
    const _purpose_1 = _event_0["purpose"];
    return $Canonical$capacity_resize$(_state_0, _reservation_0, _bytes_1, _purpose_1);
  } else if (_event_0.$ === "Canonical.ReleaseCapacity") {
    const _reservation_1 = _event_0["reservation"];
    return $Canonical$capacity_release$(_state_0, _reservation_1);
  } else if (_event_0.$ === "Canonical.ReplaceCapacity") {
    const _reservation_2 = _event_0["reservation"];
    const _unit_bytes_0 = _event_0["unit_bytes"];
    return $Canonical$capacity_replace$(_state_0, _reservation_2, _unit_bytes_0);
  } else if (_event_0.$ === "Canonical.IssuePermit") {
    const _partition_1 = _event_0["partition"];
    const _lifetime_0 = _event_0["lifetime"];
    const _tool_0 = _event_0["tool"];
    const _started_0 = _event_0["started"];
    const _deadline_0 = _event_0["deadline"];
    const _now_0 = _event_0["now"];
    const _minimum_started_0 = _event_0["minimum_started"];
    const _facts_0 = _event_0["facts"];
    return $Canonical$issue_permit$(_state_0, _partition_1, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _minimum_started_0, _facts_0);
  } else if (_event_0.$ === "Canonical.CheckCompletedEdit") {
    const _tool_1 = _event_0["tool"];
    return $Canonical$check_completed_edit$(_state_0, _tool_1);
  } else if (_event_0.$ === "Canonical.RememberCompletedEdit") {
    const _tool_2 = _event_0["tool"];
    const _reason_0 = _event_0["reason"];
    return $Canonical$remember_completed_edit$(_state_0, _tool_2, _reason_0);
  } else if (_event_0.$ === "Canonical.QuietRoundTick") {
    const _partition_2 = _event_0["partition"];
    const _lifetime_1 = _event_0["lifetime"];
    const _round_0 = _event_0["round"];
    const _now_1 = _event_0["now"];
    const _window_0 = _event_0["window"];
    const _facts_1 = _event_0["facts"];
    return $Canonical$quiet_round_tick$(_state_0, _partition_2, _lifetime_1, _round_0, _now_1, _window_0, _facts_1);
  } else if (_event_0.$ === "Canonical.QuietRoundReset") {
    const _partition_3 = _event_0["partition"];
    const _lifetime_2 = _event_0["lifetime"];
    const _round_1 = _event_0["round"];
    return $Canonical$quiet_round_reset$(_state_0, _partition_3, _lifetime_2, _round_1);
  } else if (_event_0.$ === "Canonical.ConsumePermit") {
    const _partition_4 = _event_0["partition"];
    const _lifetime_3 = _event_0["lifetime"];
    const _token_0 = _event_0["token"];
    const _tool_3 = _event_0["tool"];
    const _now_2 = _event_0["now"];
    return $Canonical$consume_permit$(_state_0, _partition_4, _lifetime_3, _token_0, _tool_3, _now_2);
  } else if (_event_0.$ === "Canonical.ReleasePermit") {
    const _partition_5 = _event_0["partition"];
    const _lifetime_4 = _event_0["lifetime"];
    const _token_1 = _event_0["token"];
    return $Canonical$release_permit$(_state_0, _partition_5, _lifetime_4, _token_1);
  } else if (_event_0.$ === "Canonical.ExpirePermit") {
    const _partition_6 = _event_0["partition"];
    const _lifetime_5 = _event_0["lifetime"];
    const _token_2 = _event_0["token"];
    const _deadline_reached_0 = _event_0["deadline_reached"];
    return $Canonical$expire_permit$(_state_0, _partition_6, _lifetime_5, _token_2, _deadline_reached_0);
  } else if (_event_0.$ === "Canonical.ClosePermitRound") {
    const _partition_7 = _event_0["partition"];
    const _lifetime_6 = _event_0["lifetime"];
    const _round_2 = _event_0["round"];
    const _at_0 = _event_0["at"];
    return $Canonical$close_permit_round$(_state_0, _partition_7, _lifetime_6, _round_2, _at_0);
  } else if (_event_0.$ === "Canonical.OpenRound") {
    const _partition_8 = _event_0["partition"];
    const _lifetime_7 = _event_0["lifetime"];
    return $Canonical$open$(_state_0, _partition_8, _lifetime_7);
  } else if (_event_0.$ === "Canonical.AdmitObservation") {
    const _partition_9 = _event_0["partition"];
    const _lifetime_8 = _event_0["lifetime"];
    const _round_3 = _event_0["round"];
    return $Canonical$admit_observation$(_state_0, _partition_9, _lifetime_8, _round_3);
  } else if (_event_0.$ === "Canonical.StartObservation") {
    const _partition_10 = _event_0["partition"];
    const _lifetime_9 = _event_0["lifetime"];
    const _round_4 = _event_0["round"];
    const _observation_0 = _event_0["observation"];
    return $Canonical$start_observation$(_state_0, _partition_10, _lifetime_9, _round_4, _observation_0);
  } else if (_event_0.$ === "Canonical.CompleteObservation") {
    const _partition_11 = _event_0["partition"];
    const _lifetime_10 = _event_0["lifetime"];
    const _round_5 = _event_0["round"];
    const _observation_1 = _event_0["observation"];
    return $Canonical$complete_observation$(_state_0, _partition_11, _lifetime_10, _round_5, _observation_1);
  } else if (_event_0.$ === "Canonical.InterruptObservation") {
    const _partition_12 = _event_0["partition"];
    const _lifetime_11 = _event_0["lifetime"];
    const _round_6 = _event_0["round"];
    const _observation_2 = _event_0["observation"];
    return $Canonical$interrupt_observation$(_state_0, _partition_12, _lifetime_11, _round_6, _observation_2);
  } else if (_event_0.$ === "Canonical.BeginPreparation") {
    const _partition_13 = _event_0["partition"];
    const _lifetime_12 = _event_0["lifetime"];
    const _round_7 = _event_0["round"];
    const _bytes_2 = _event_0["bytes"];
    return $Canonical$begin$(_state_0, _partition_13, _lifetime_12, _round_7, _bytes_2);
  } else if (_event_0.$ === "Canonical.BeginObservedPreparation") {
    const _partition_14 = _event_0["partition"];
    const _lifetime_13 = _event_0["lifetime"];
    const _round_8 = _event_0["round"];
    const _observation_3 = _event_0["observation"];
    const _bytes_3 = _event_0["bytes"];
    return $Canonical$begin_observed$(_state_0, _partition_14, _lifetime_13, _round_8, _observation_3, _bytes_3);
  } else if (_event_0.$ === "Canonical.InterruptPreparation") {
    const _partition_15 = _event_0["partition"];
    const _lifetime_14 = _event_0["lifetime"];
    const _round_9 = _event_0["round"];
    const _operation_0 = _event_0["operation"];
    return $Canonical$interrupt_preparation$(_state_0, _partition_15, _lifetime_14, _round_9, _operation_0);
  } else if (_event_0.$ === "Canonical.PreparationCompleted") {
    const _partition_16 = _event_0["partition"];
    const _lifetime_15 = _event_0["lifetime"];
    const _round_10 = _event_0["round"];
    const _operation_1 = _event_0["operation"];
    const _bytes_4 = _event_0["unit_bytes"];
    return $Canonical$prepared$(_state_0, _partition_16, _lifetime_15, _round_10, _operation_1, _bytes_4);
  } else if (_event_0.$ === "Canonical.StartReview") {
    const _partition_17 = _event_0["partition"];
    const _lifetime_16 = _event_0["lifetime"];
    const _round_11 = _event_0["round"];
    const _operation_2 = _event_0["operation"];
    return $Canonical$start_review$(_state_0, _partition_17, _lifetime_16, _round_11, _operation_2);
  } else if (_event_0.$ === "Canonical.JevRequestReady") {
    const _partition_18 = _event_0["partition"];
    const _lifetime_17 = _event_0["lifetime"];
    const _round_12 = _event_0["round"];
    const _operation_3 = _event_0["operation"];
    const _root_valid_0 = _event_0["root_valid"];
    const _configuration_valid_0 = _event_0["configuration_valid"];
    const _credential_ready_0 = _event_0["credential_ready"];
    const _selected_0 = _event_0["selected"];
    const _current_work_0 = _event_0["current_work"];
    const _physical_available_0 = _event_0["physical_available"];
    return $Canonical$request_ready$(_state_0, _partition_18, _lifetime_17, _round_12, _operation_3, _root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0);
  } else if (_event_0.$ === "Canonical.JevRequestStarted") {
    const _partition_19 = _event_0["partition"];
    const _lifetime_18 = _event_0["lifetime"];
    const _round_13 = _event_0["round"];
    const _operation_4 = _event_0["operation"];
    const _request_0 = _event_0["request"];
    return $Canonical$request_started$(_state_0, _partition_19, _lifetime_18, _round_13, _operation_4, _request_0);
  } else if (_event_0.$ === "Canonical.JevRequestInterrupted") {
    const _partition_20 = _event_0["partition"];
    const _lifetime_19 = _event_0["lifetime"];
    const _round_14 = _event_0["round"];
    const _operation_5 = _event_0["operation"];
    const _request_1 = _event_0["request"];
    return $Canonical$request_interrupted$(_state_0, _partition_20, _lifetime_19, _round_14, _operation_5, _request_1);
  } else if (_event_0.$ === "Canonical.JevRequestSettled") {
    const _partition_21 = _event_0["partition"];
    const _lifetime_20 = _event_0["lifetime"];
    const _round_15 = _event_0["round"];
    const _operation_6 = _event_0["operation"];
    const _request_2 = _event_0["request"];
    const _outcome_0 = _event_0["outcome"];
    const _current_work_1 = _event_0["current_work"];
    return $Canonical$request_settled$(_state_0, _partition_21, _lifetime_20, _round_15, _operation_6, _request_2, _outcome_0, _current_work_1);
  } else if (_event_0.$ === "Canonical.ReviewCompleted") {
    const _partition_22 = _event_0["partition"];
    const _lifetime_21 = _event_0["lifetime"];
    const _round_16 = _event_0["round"];
    const _operation_7 = _event_0["operation"];
    const _outcome_1 = _event_0["outcome"];
    return $Canonical$reviewed$(_state_0, _partition_22, _lifetime_21, _round_16, _operation_7, _outcome_1);
  } else if (_event_0.$ === "Canonical.RetireReview") {
    const _partition_23 = _event_0["partition"];
    const _lifetime_22 = _event_0["lifetime"];
    const _round_17 = _event_0["round"];
    const _operation_8 = _event_0["operation"];
    return $Canonical$retire_review$(_state_0, _partition_23, _lifetime_22, _round_17, _operation_8);
  } else if (_event_0.$ === "Canonical.CancelReview") {
    const _partition_24 = _event_0["partition"];
    const _lifetime_23 = _event_0["lifetime"];
    const _round_18 = _event_0["round"];
    const _operation_9 = _event_0["operation"];
    return $Canonical$cancel_review$(_state_0, _partition_24, _lifetime_23, _round_18, _operation_9);
  } else if (_event_0.$ === "Canonical.ReviewObserved") {
    const _partition_25 = _event_0["partition"];
    const _lifetime_24 = _event_0["lifetime"];
    const _round_19 = _event_0["round"];
    const _operation_10 = _event_0["operation"];
    const _outcome_2 = _event_0["outcome"];
    const _current_work_2 = _event_0["current_work"];
    return $Canonical$review_observed$(_state_0, _partition_25, _lifetime_24, _round_19, _operation_10, _outcome_2, _current_work_2);
  } else if (_event_0.$ === "Canonical.FindingCountUpdated") {
    const _partition_26 = _event_0["partition"];
    const _lifetime_25 = _event_0["lifetime"];
    const _round_20 = _event_0["round"];
    const _operation_11 = _event_0["operation"];
    const _count_0 = _event_0["count"];
    return $Canonical$finding_count_update$(_state_0, _partition_26, _lifetime_25, _round_20, _operation_11, _count_0);
  } else if (_event_0.$ === "Canonical.QueueDispatch") {
    const _partition_27 = _event_0["partition"];
    const _lifetime_26 = _event_0["lifetime"];
    const _round_21 = _event_0["round"];
    const _operation_12 = _event_0["operation"];
    return $Canonical$queue_dispatch$(_state_0, _partition_27, _lifetime_26, _round_21, _operation_12);
  } else if (_event_0.$ === "Canonical.DispatchSettled") {
    const _partition_28 = _event_0["partition"];
    const _lifetime_27 = _event_0["lifetime"];
    const _round_22 = _event_0["round"];
    const _operation_13 = _event_0["operation"];
    return $Canonical$settle_dispatch$(_state_0, _partition_28, _lifetime_27, _round_22, _operation_13);
  } else if (_event_0.$ === "Canonical.DiscardDispatch") {
    const _operations_0 = _event_0["operations"];
    return $Canonical$discard_dispatch$(_state_0, _operations_0);
  } else if (_event_0.$ === "Canonical.DispatchScopeCheck") {
    const _named_count_0 = _event_0["named_count"];
    const _cancelled_count_0 = _event_0["cancelled_count"];
    const _has_unnamed_0 = _event_0["has_unnamed"];
    return $Canonical$dispatch_scope$(_state_0, _named_count_0, _cancelled_count_0, _has_unnamed_0);
  } else if (_event_0.$ === "Canonical.CloseDispatch") {
    return $Canonical$close_dispatch$(_state_0);
  } else if (_event_0.$ === "Canonical.PreparedOfferCheck") {
    const _ready_0 = _event_0["ready"];
    const _within_frame_0 = _event_0["within_frame"];
    return $Canonical$prepared_offer_check$(_state_0, _ready_0, _within_frame_0);
  } else if (_event_0.$ === "Canonical.EmptyPreparedCheck") {
    const _ready_count_0 = _event_0["ready_count"];
    const _has_non_skipped_0 = _event_0["has_non_skipped"];
    const _authority_bound_0 = _event_0["authority_bound"];
    return $Canonical$empty_prepared_check$(_state_0, _ready_count_0, _has_non_skipped_0, _authority_bound_0);
  } else if (_event_0.$ === "Canonical.ReviewFailureCheck") {
    const _backend_or_timeout_0 = _event_0["backend_or_timeout"];
    const _credential_0 = _event_0["credential"];
    const _missing_0 = _event_0["missing"];
    return $Canonical$review_failure_check$(_state_0, _backend_or_timeout_0, _credential_0, _missing_0);
  } else if (_event_0.$ === "Canonical.StopPolled") {
    const _partition_29 = _event_0["partition"];
    const _lifetime_28 = _event_0["lifetime"];
    const _round_23 = _event_0["round"];
    const _deadline_1 = _event_0["deadline"];
    return $Canonical$stop$(_state_0, _partition_29, _lifetime_28, _round_23, _deadline_1);
  } else if (_event_0.$ === "Canonical.StopGroupPolled") {
    const _group_0 = _event_0["group"];
    const _lifetime_29 = _event_0["lifetime"];
    const _round_24 = _event_0["round"];
    const _scopes_0 = _event_0["scopes"];
    const _deadline_2 = _event_0["deadline"];
    const _extra_pending_0 = _event_0["extra_pending"];
    const _continuations_0 = _event_0["continuations"];
    return $Canonical$stop_group$(_state_0, _group_0, _lifetime_29, _round_24, _scopes_0, _deadline_2, _extra_pending_0, _continuations_0);
  } else if (_event_0.$ === "Canonical.StopGroupEnded") {
    const _group_1 = _event_0["group"];
    const _lifetime_30 = _event_0["lifetime"];
    const _round_25 = _event_0["round"];
    const _scopes_1 = _event_0["scopes"];
    return $Canonical$stop_group_end$(_state_0, _group_1, _lifetime_30, _round_25, _scopes_1);
  } else if (_event_0.$ === "Canonical.CollectionReady") {
    const _advice_0 = _event_0["advice"];
    const _partition_30 = _event_0["partition"];
    const _lifetime_31 = _event_0["lifetime"];
    const _round_26 = _event_0["round"];
    const _observation_4 = _event_0["observation"];
    const _joined_pending_0 = _event_0["joined_pending"];
    return $Canonical$collection_ready$(_state_0, _advice_0, _partition_30, _lifetime_31, _round_26, _observation_4, _joined_pending_0);
  } else if (_event_0.$ === "Canonical.CollectionCredentialCheck") {
    const _same_scope_0 = _event_0["same_scope"];
    const _generation_valid_0 = _event_0["generation_valid"];
    return $Canonical$collection_credential_result$(_state_0, ($Collection$credential_disposition$(_same_scope_0, _generation_valid_0)));
  } else if (_event_0.$ === "Canonical.CollectionCandidateCheck") {
    const _same_partition_0 = _event_0["same_partition"];
    const _unleased_0 = _event_0["unleased"];
    const _has_unsuppressed_0 = _event_0["has_unsuppressed"];
    const _authority_owns_0 = _event_0["authority_owns"];
    return $Canonical$collection_candidate$(_state_0, _same_partition_0, _unleased_0, _has_unsuppressed_0, _authority_owns_0);
  } else if (_event_0.$ === "Canonical.CollectionOrderCheck") {
    const _left_sequence_0 = _event_0["left_sequence"];
    const _right_sequence_0 = _event_0["right_sequence"];
    return $Canonical$collection_order_result$(_state_0, ($Collection$order$(_left_sequence_0, _right_sequence_0)));
  } else if (_event_0.$ === "Canonical.CollectionExpiryCheck") {
    const _elapsed_0 = _event_0["elapsed"];
    const _lifetime_32 = _event_0["lifetime"];
    return $Canonical$collection_expiry$(_state_0, _elapsed_0, _lifetime_32);
  } else if (_event_0.$ === "Canonical.CollectionFitCheck") {
    const _items_0 = _event_0["items"];
    const _bytes_5 = _event_0["bytes"];
    return $Canonical$collection_fit$(_state_0, _items_0, _bytes_5);
  } else if (_event_0.$ === "Canonical.CollectionFindingCheck") {
    const _selection_partition_0 = _event_0["selection_partition"];
    const _selection_round_0 = _event_0["selection_round"];
    const _unit_0 = _event_0["unit"];
    const _partition_31 = _event_0["partition"];
    const _round_27 = _event_0["round"];
    const _snapshot_0 = _event_0["snapshot"];
    const _current_snapshot_0 = _event_0["current_snapshot"];
    const _credential_1 = _event_0["credential"];
    const _current_credential_0 = _event_0["current_credential"];
    const _age_ms_0 = _event_0["age_ms"];
    const _solo_bytes_0 = _event_0["solo_bytes"];
    const _collection_ready_0 = _event_0["collection_ready"];
    const _selected_count_0 = _event_0["selected_count"];
    const _prospective_bytes_0 = _event_0["prospective_bytes"];
    return $Canonical$collection_finding$(_state_0, _selection_partition_0, _selection_round_0, _unit_0, _partition_31, _round_27, _snapshot_0, _current_snapshot_0, _credential_1, _current_credential_0, _age_ms_0, _solo_bytes_0, _collection_ready_0, _selected_count_0, _prospective_bytes_0);
  } else if (_event_0.$ === "Canonical.CollectionNoticeCheck") {
    const _items_1 = _event_0["items"];
    const _bytes_6 = _event_0["bytes"];
    const _skip_unfitting_0 = _event_0["skip_unfitting"];
    return $Canonical$collection_notice_result$(_state_0, ($Handoff$notice_offer$(_items_1, _bytes_6, _skip_unfitting_0)));
  } else if (_event_0.$ === "Canonical.CollectionReserveLease") {
    const _advice_1 = _event_0["advice"];
    const _token_3 = _event_0["token"];
    return $Canonical$collection_reserve$(_state_0, _advice_1, _token_3);
  } else if (_event_0.$ === "Canonical.CollectionReleaseLease") {
    const _advice_2 = _event_0["advice"];
    const _token_4 = _event_0["token"];
    return $Canonical$collection_release$(_state_0, _advice_2, _token_4);
  } else if (_event_0.$ === "Canonical.CollectionLeaseCheck") {
    const _advice_3 = _event_0["advice"];
    const _token_5 = _event_0["token"];
    const _expired_0 = _event_0["expired"];
    const _stop_collector_0 = _event_0["stop_collector"];
    const _same_group_0 = _event_0["same_group"];
    const _reofferable_0 = _event_0["reofferable"];
    return $Canonical$collection_lease_check$(_state_0, _advice_3, _token_5, _expired_0, _stop_collector_0, _same_group_0, _reofferable_0);
  } else if (_event_0.$ === "Canonical.CollectionRetireAdvice") {
    const _advice_4 = _event_0["advice"];
    return $Canonical$collection_retire$(_state_0, _advice_4);
  } else if (_event_0.$ === "Canonical.CollectionClaimBackground") {
    const _group_2 = _event_0["group"];
    const _token_6 = _event_0["token"];
    const _active_0 = _event_0["active"];
    const _capacity_0 = _event_0["capacity"];
    return $Canonical$collection_claim$(_state_0, _group_2, _token_6, _active_0, _capacity_0);
  } else if (_event_0.$ === "Canonical.CollectionReleaseBackground") {
    const _group_3 = _event_0["group"];
    const _token_7 = _event_0["token"];
    return $Canonical$collection_release_background$(_state_0, _group_3, _token_7);
  } else if (_event_0.$ === "Canonical.CollectionExpireBackground") {
    const _group_4 = _event_0["group"];
    const _token_8 = _event_0["token"];
    const _elapsed_1 = _event_0["elapsed"];
    const _lifetime_33 = _event_0["lifetime"];
    return $Canonical$collection_expire_background$(_state_0, _group_4, _token_8, _elapsed_1, _lifetime_33);
  } else if (_event_0.$ === "Canonical.FinishReserve") {
    const _group_5 = _event_0["group"];
    const _lifetime_34 = _event_0["lifetime"];
    const _round_28 = _event_0["round"];
    const _attempt_0 = _event_0["attempt"];
    const _token_9 = _event_0["token"];
    const _selected_1 = _event_0["selected"];
    const _has_notice_0 = _event_0["has_notice"];
    const _pass_notices_0 = _event_0["pass_notices"];
    const _can_write_0 = _event_0["can_write"];
    const _binding_valid_0 = _event_0["binding_valid"];
    const _deadline_reached_1 = _event_0["deadline_reached"];
    return $Canonical$finish_reserve$(_state_0, _group_5, _lifetime_34, _round_28, _attempt_0, _token_9, _selected_1, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_1);
  } else if (_event_0.$ === "Canonical.FinishRelease") {
    const _group_6 = _event_0["group"];
    const _round_29 = _event_0["round"];
    const _attempt_1 = _event_0["attempt"];
    const _token_10 = _event_0["token"];
    return $Canonical$finish_release$(_state_0, _group_6, _round_29, _attempt_1, _token_10);
  } else if (_event_0.$ === "Canonical.FinishAuthorize") {
    const _group_7 = _event_0["group"];
    const _round_30 = _event_0["round"];
    const _attempt_2 = _event_0["attempt"];
    const _token_11 = _event_0["token"];
    const _selected_2 = _event_0["selected"];
    return $Canonical$finish_authorize$(_state_0, _group_7, _round_30, _attempt_2, _token_11, _selected_2);
  } else if (_event_0.$ === "Canonical.FinishTerminal") {
    const _group_8 = _event_0["group"];
    const _round_31 = _event_0["round"];
    const _attempt_3 = _event_0["attempt"];
    const _token_12 = _event_0["token"];
    const _selected_3 = _event_0["selected"];
    const _outcome_3 = _event_0["outcome"];
    return $Canonical$finish_terminal$(_state_0, _group_8, _round_31, _attempt_3, _token_12, _selected_3, _outcome_3);
  } else if (_event_0.$ === "Canonical.FinishEnd") {
    const _group_9 = _event_0["group"];
    const _round_32 = _event_0["round"];
    const _attempt_4 = _event_0["attempt"];
    const _token_13 = _event_0["token"];
    return $Canonical$finish_end$(_state_0, _group_9, _round_32, _attempt_4, _token_13);
  } else if (_event_0.$ === "Canonical.ContinuationConsume") {
    const _group_10 = _event_0["group"];
    const _round_33 = _event_0["round"];
    return $Canonical$continuation_consume$(_state_0, _group_10, _round_33);
  } else if (_event_0.$ === "Canonical.SubmissionBegin") {
    const _advice_5 = _event_0["advice"];
    const _group_11 = _event_0["group"];
    const _round_34 = _event_0["round"];
    const _token_14 = _event_0["token"];
    const _surface_0 = _event_0["surface"];
    const _authorize_now_0 = _event_0["authorize_now"];
    const _fingerprints_0 = _event_0["fingerprints"];
    const _units_0 = _event_0["units"];
    return $Canonical$submission_begin$(_state_0, _advice_5, _group_11, _round_34, _token_14, _surface_0, _authorize_now_0, _fingerprints_0, _units_0);
  } else if (_event_0.$ === "Canonical.SubmissionAuthorize") {
    const _advice_6 = _event_0["advice"];
    const _token_15 = _event_0["token"];
    return $Canonical$submission_authorize$(_state_0, _advice_6, _token_15);
  } else if (_event_0.$ === "Canonical.SubmissionTerminal") {
    const _advice_7 = _event_0["advice"];
    const _token_16 = _event_0["token"];
    const _certain_0 = _event_0["certain"];
    return $Canonical$submission_terminal$(_state_0, _advice_7, _token_16, _certain_0);
  } else if (_event_0.$ === "Canonical.SubmissionRelease") {
    const _advice_8 = _event_0["advice"];
    const _token_17 = _event_0["token"];
    return $Canonical$submission_release$(_state_0, _advice_8, _token_17);
  } else if (_event_0.$ === "Canonical.SubmissionForget") {
    const _advice_9 = _event_0["advice"];
    return $Canonical$submission_forget$(_state_0, _advice_9);
  } else if (_event_0.$ === "Canonical.SubmissionSuppressCheck") {
    const _advice_10 = _event_0["advice"];
    const _fingerprint_0 = _event_0["fingerprint"];
    const _round_35 = _event_0["round"];
    const _surface_1 = _event_0["surface"];
    return $Canonical$submission_suppress_check$(_state_0, _advice_10, _fingerprint_0, _round_35, _surface_1);
  } else if (_event_0.$ === "Canonical.SubmissionReofferCheck") {
    const _advice_11 = _event_0["advice"];
    const _token_18 = _event_0["token"];
    return $Canonical$submission_reoffer_check$(_state_0, _advice_11, _token_18);
  } else if (_event_0.$ === "Canonical.SubmissionExpiryCheck") {
    const _advice_12 = _event_0["advice"];
    const _token_19 = _event_0["token"];
    const _elapsed_2 = _event_0["elapsed"];
    const _lifetime_35 = _event_0["lifetime"];
    return $Canonical$submission_expiry_check$(_state_0, _advice_12, _token_19, _elapsed_2, _lifetime_35);
  } else if (_event_0.$ === "Canonical.RevisionRegister") {
    const _subject_0 = _event_0["subject"];
    const _input_0 = _event_0["input"];
    const _add_member_0 = _event_0["add_member"];
    return $Canonical$revision_register$(_state_0, _subject_0, _input_0, _add_member_0);
  } else if (_event_0.$ === "Canonical.RevisionRelease") {
    const _subject_1 = _event_0["subject"];
    const _generation_0 = _event_0["generation"];
    return $Canonical$revision_release$(_state_0, _subject_1, _generation_0);
  } else if (_event_0.$ === "Canonical.RevisionCurrentCheck") {
    const _subject_2 = _event_0["subject"];
    const _input_1 = _event_0["input"];
    const _generation_1 = _event_0["generation"];
    return $Canonical$revision_current_check$(_state_0, _subject_2, _input_1, _generation_1);
  } else if (_event_0.$ === "Canonical.RevisionSupersededCheck") {
    const _subject_3 = _event_0["subject"];
    const _candidate_subject_0 = _event_0["candidate_subject"];
    const _generation_2 = _event_0["generation"];
    return $Canonical$revision_superseded_check$(_state_0, _subject_3, _candidate_subject_0, _generation_2);
  } else if (_event_0.$ === "Canonical.RevisionGenerationCheck") {
    const _subject_4 = _event_0["subject"];
    return $Canonical$revision_generation_check$(_state_0, _subject_4);
  } else if (_event_0.$ === "Canonical.RevisionCountCheck") {
    return $Canonical$revision_count_check$(_state_0);
  } else if (_event_0.$ === "Canonical.CollectorGateCheck") {
    const _expired_1 = _event_0["expired"];
    const _credential_valid_0 = _event_0["credential_valid"];
    return $Canonical$collector_gate_result$(_state_0, ($CollectorAuthority$collect_gate$(_expired_1, _credential_valid_0)));
  } else if (_event_0.$ === "Canonical.CollectorFinalAuthorityCheck") {
    const _admitted_block_0 = _event_0["admitted_block"];
    const _current_block_0 = _event_0["current_block"];
    return $Canonical$collector_final_authority_result$(_state_0, ($CollectorAuthority$final_authority$(_admitted_block_0, _current_block_0)));
  } else if (_event_0.$ === "Canonical.ReuseMemberCheck") {
    const _joined_state_0 = _event_0["joined_state"];
    const _stale_unavailable_0 = _event_0["stale_unavailable"];
    const _has_revision_0 = _event_0["has_revision"];
    const _has_advice_id_0 = _event_0["has_advice_id"];
    return $Canonical$reuse_member_result$(_state_0, ($Reuse$joined_disposition$(_joined_state_0, _stale_unavailable_0, _has_revision_0, _has_advice_id_0)));
  } else if (_event_0.$ === "Canonical.CleanupCheck") {
    const _facts_2 = _event_0["facts"];
    return $Canonical$cleanup_check_result$(_state_0, ($Retention$cleanup_gate$(_facts_2)));
  } else if (_event_0.$ === "Canonical.CleanupCommit") {
    return $Canonical$cleanup_commit$(_state_0);
  } else if (_event_0.$ === "Canonical.DeliveryReleaseCheck") {
    const _acknowledged_0 = _event_0["acknowledged"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$release_unacknowledged$(_acknowledged_0)), {$: "Canonical.DeliveryReleaseUnacknowledged"}, {$: "Canonical.DeliveryKeepAcknowledged"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryAcknowledgeCheck") {
    const _items_2 = _event_0["items"];
    const _any_expired_0 = _event_0["any_expired"];
    return $Canonical$delivery_ack_result$(_state_0, ($Delivery$acknowledge$(_items_2, _any_expired_0)));
  } else if (_event_0.$ === "Canonical.DeliveryFinalizeCheck") {
    const _items_3 = _event_0["items"];
    const _all_acknowledged_0 = _event_0["all_acknowledged"];
    const _any_expired_1 = _event_0["any_expired"];
    return $Canonical$delivery_final_result$(_state_0, ($Delivery$finalize$(_items_3, _all_acknowledged_0, _any_expired_1)));
  } else if (_event_0.$ === "Canonical.DeliveryFindingDispositionCheck") {
    const _composed_0 = _event_0["composed"];
    const _remaining_0 = _event_0["remaining"];
    return $Canonical$delivery_disposition_result$(_state_0, ($Delivery$finding_disposition$(_composed_0, _remaining_0)));
  } else if (_event_0.$ === "Canonical.DeliverySubmissionCandidateCheck") {
    const _facts_3 = _event_0["facts"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$submission_candidate$(_facts_3)), {$: "Canonical.DeliverySubmissionCandidate"}, {$: "Canonical.DeliverySubmissionRefused"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliverySubmissionBatchCheck") {
    const _count_1 = _event_0["count"];
    const _all_valid_0 = _event_0["all_valid"];
    return $Canonical$delivery_batch_result$(_state_0, ($Delivery$submission_batch_gate$(_count_1, _all_valid_0)));
  } else if (_event_0.$ === "Canonical.DeliveryCredentialObserveCheck") {
    const _invalid_seen_0 = _event_0["invalid_seen"];
    const _generation_valid_1 = _event_0["generation_valid"];
    const _authorized_0 = _event_0["authorized"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$credential_observe$(_invalid_seen_0, _generation_valid_1, _authorized_0)), {$: "Canonical.DeliveryCredentialInvalid"}, {$: "Canonical.DeliveryCredentialValid"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryFinalCredentialCheck") {
    const _shared_collect_0 = _event_0["shared_collect"];
    const _invalid_seen_1 = _event_0["invalid_seen"];
    return $Canonical$delivery_batch_result$(_state_0, ($Delivery$final_credential_gate$(_shared_collect_0, _invalid_seen_1)));
  } else if (_event_0.$ === "Canonical.ValidationRouteCheck") {
    const _owner_current_0 = _event_0["owner_current"];
    const _status_0 = _event_0["status"];
    return $Canonical$candidate_route_result$(_state_0, ($Handoff$validation_route$(_owner_current_0, _status_0)));
  } else if (_event_0.$ === "Canonical.PostValidationCheck") {
    const _work_accepted_0 = _event_0["work_accepted"];
    const _expired_2 = _event_0["expired"];
    const _has_fitting_0 = _event_0["has_fitting"];
    return $Canonical$candidate_route_result$(_state_0, ($Handoff$post_validation$(_work_accepted_0, _expired_2, _has_fitting_0)));
  } else if (_event_0.$ === "Canonical.FinalCandidateCheck") {
    const _owner_current_1 = _event_0["owner_current"];
    const _credential_generation_0 = _event_0["credential_generation"];
    const _credential_authorized_0 = _event_0["credential_authorized"];
    const _expired_3 = _event_0["expired"];
    const _work_current_0 = _event_0["work_current"];
    const _has_findings_0 = _event_0["has_findings"];
    return $Canonical$candidate_route_result$(_state_0, ($Handoff$final_candidate$(_owner_current_1, _credential_generation_0, _credential_authorized_0, _expired_3, _work_current_0, _has_findings_0)));
  } else if (_event_0.$ === "Canonical.RoundBeginStopCheck") {
    const _active_1 = _event_0["active"];
    const _has_stop_0 = _event_0["has_stop"];
    const _token_20 = _event_0["token"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_active_1, ($Bool$and$(($Bool$not$(_has_stop_0)), ($Nat$is_gt$(_token_20, 0)))))), {$: "Canonical.RoundStopBegun"}, {$: "Canonical.RoundStopRefused"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RoundActivityCheck") {
    const _bound_0 = _event_0["bound"];
    const _has_admission_0 = _event_0["has_admission"];
    const _round_36 = _event_0["round"];
    const _active_2 = _event_0["active"];
    const _expected_generation_0 = _event_0["expected_generation"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_bound_0, ($Bool$and$(_has_admission_0, ($Bool$and$(($Nat$is_eq$(_expected_generation_0, _round_36)), _active_2)))))), {$: "Canonical.RoundActive"}, {$: "Canonical.RoundInactive"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RoundBarrierCheck") {
    const _has_stop_1 = _event_0["has_stop"];
    const _used_at_start_0 = _event_0["used_at_start"];
    const _used_now_0 = _event_0["used_now"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_has_stop_1, ($Nat$is_gt$(_used_now_0, _used_at_start_0)))), {$: "Canonical.RoundBarrierRaised"}, {$: "Canonical.RoundBarrierClear"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RoundOwnsStopCheck") {
    const _active_3 = _event_0["active"];
    const _token_matches_0 = _event_0["token_matches"];
    const _deciding_0 = _event_0["deciding"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_active_3, ($Bool$and$(_token_matches_0, ($Bool$not$(_deciding_0)))))), {$: "Canonical.RoundStopOwned"}, {$: "Canonical.RoundStopNotOwned"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RoundStopTerminalCheck") {
    const _has_output_0 = _event_0["has_output"];
    const _authorized_1 = _event_0["authorized"];
    const _requested_close_0 = _event_0["requested_close"];
    return $Canonical$stop_terminal_result$(_state_0, ($Round$stop_terminal$(_has_output_0, _authorized_1, _requested_close_0)));
  } else if (_event_0.$ === "Canonical.RoundExpireCloseCheck") {
    const _barrier_0 = _event_0["barrier"];
    const _authorized_output_0 = _event_0["authorized_output"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(($Bool$not$(_authorized_output_0)), ($Round$expire_close$(_barrier_0)))), {$: "Canonical.RoundExpireCloses"}, {$: "Canonical.RoundExpireKeeps"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RoundContinuationBudgetCheck") {
    const _active_4 = _event_0["active"];
    const _count_2 = _event_0["count"];
    const _x_0 = ($Round$max_continuations$());
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_active_4, (_count_2 < _x_0))), {$: "Canonical.RoundContinuationAvailable"}, {$: "Canonical.RoundContinuationExhausted"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliverySubmissionAllowedCheck") {
    const _active_5 = _event_0["active"];
    const _barrier_1 = _event_0["barrier"];
    const _deciding_1 = _event_0["deciding"];
    const _surface_2 = _event_0["surface"];
    const _existing_token_0 = _event_0["existing_token"];
    const _finish_permit_0 = _event_0["finish_permit"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$submission_allowed_facts$(_active_5, _barrier_1, _deciding_1, _surface_2, _existing_token_0, _finish_permit_0)), {$: "Canonical.DeliverySubmissionAllowed"}, {$: "Canonical.DeliverySubmissionDenied"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryExistingTokenCheck") {
    const _surface_3 = _event_0["surface"];
    const _existing_token_1 = _event_0["existing_token"];
    const _finish_permit_1 = _event_0["finish_permit"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$existing_token_allowed$(_surface_3, _existing_token_1, _finish_permit_1)), {$: "Canonical.DeliveryExistingTokenAllowed"}, {$: "Canonical.DeliveryExistingTokenDenied"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryUnreservedStopCheck") {
    const _active_6 = _event_0["active"];
    const _deciding_2 = _event_0["deciding"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$unreserved_stop_allowed_facts$(_active_6, _deciding_2)), {$: "Canonical.DeliveryUnreservedStopAllowed"}, {$: "Canonical.DeliveryUnreservedStopDenied"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.IncludeLayerCheck") {
    const _supplied_0 = _event_0["supplied"];
    const _current_rank_0 = _event_0["current_rank"];
    const _candidate_rank_0 = _event_0["candidate_rank"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.IncludeChoice", "choice": ($Configuration$include_choice$(_supplied_0, _current_rank_0, _candidate_rank_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.FileSelectionCheck") {
    const _protected_0 = _event_0["protected"];
    const _excluded_0 = _event_0["excluded"];
    const _includes_empty_0 = _event_0["includes_empty"];
    const _included_0 = _event_0["included"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FileSelection", "selection": ($Configuration$select$(_protected_0, _excluded_0, _includes_empty_0, _included_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.FileProtectionInvalid") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FileProtection", "protection": {$: "Configuration.RepositoryBoundary"}}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.FileProtectionCheck") {
    const _sensitive_name_0 = _event_0["sensitive_name"];
    const _generated_or_vendor_0 = _event_0["generated_or_vendor"];
    const _allowed_extension_0 = _event_0["allowed_extension"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FileProtection", "protection": ($Configuration$protection$(_sensitive_name_0, _generated_or_vendor_0, _allowed_extension_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.CandidateFileCheck") {
    const _git_admin_0 = _event_0["git_admin"];
    const _physical_safe_0 = _event_0["physical_safe"];
    const _git_allowed_0 = _event_0["git_allowed"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CandidateFile", "candidate": ($Configuration$candidate$(_git_admin_0, _physical_safe_0, _git_allowed_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.ReviewAdmissionCheck") {
    const _root_valid_1 = _event_0["root_valid"];
    const _configuration_valid_1 = _event_0["configuration_valid"];
    const _credential_ready_1 = _event_0["credential_ready"];
    const _selected_4 = _event_0["selected"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReviewAdmission", "admission": ($Configuration$admit$(_root_valid_1, _configuration_valid_1, _credential_ready_1, _selected_4))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleEnableCheck") {
    const _pack_enabled_0 = _event_0["pack_enabled"];
    const _rule_enabled_0 = _event_0["rule_enabled"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($RulePolicy$enabled$(_pack_enabled_0, _rule_enabled_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleApplicabilityCheck") {
    const _consent_0 = _event_0["consent"];
    const _complete_0 = _event_0["complete"];
    const _target_0 = _event_0["target"];
    const _global_included_0 = _event_0["global_included"];
    const _global_excluded_0 = _event_0["global_excluded"];
    const _pack_enabled_1 = _event_0["pack_enabled"];
    const _rule_enabled_1 = _event_0["rule_enabled"];
    const _rule_included_0 = _event_0["rule_included"];
    const _rule_excluded_0 = _event_0["rule_excluded"];
    const _target_declared_0 = _event_0["target_declared"];
    const _capabilities_available_0 = _event_0["capabilities_available"];
    const _source_rung_0 = _event_0["source_rung"];
    const _minimum_rung_0 = _event_0["minimum_rung"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($RulePolicy$applicable$(_consent_0, _complete_0, _target_0, _global_included_0, _global_excluded_0, _pack_enabled_1, _rule_enabled_1, _rule_included_0, _rule_excluded_0, _target_declared_0, _capabilities_available_0, _source_rung_0, _minimum_rung_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleFindingCheck") {
    const _probability_0 = _event_0["probability"];
    const _threshold_0 = _event_0["threshold"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($RulePolicy$finding$(_probability_0, _threshold_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleRankOrderCheck") {
    const _left_0 = _event_0["left"];
    const _right_0 = _event_0["right"];
    const _left_rank_0 = _event_0["left_rank"];
    const _right_rank_0 = _event_0["right_rank"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleOrder", "order": ($RulePolicy$rank_order$(_left_0, _right_0, _left_rank_0, _right_rank_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.AdviceOrderCheck") {
    const _left_1 = _event_0["left"];
    const _right_1 = _event_0["right"];
    const _path_order_0 = _event_0["path_order"];
    const _id_order_0 = _event_0["id_order"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleOrder", "order": ($RulePolicy$advice_order$(_left_1, _right_1, _path_order_0, _id_order_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleBudgetCheck") {
    const _position_0 = _event_0["position"];
    const _limit_0 = _event_0["limit"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($RulePolicy$budget$(_position_0, _limit_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.ReuseRoute") {
    const _id_0 = _event_0["id"];
    const _live_advice_0 = _event_0["live_advice"];
    return $Canonical$reuse_route_result$(_state_0, ($ReuseState$route$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _id_0, _live_advice_0)));
  } else if (_event_0.$ === "Canonical.ReuseClaim") {
    const _id_1 = _event_0["id"];
    return $Canonical$reuse_decision_result$(_state_0, ($ReuseState$claim$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _id_1)), {$: "Canonical.ReuseClaimed"});
  } else if (_event_0.$ === "Canonical.ReuseAttach") {
    const _id_2 = _event_0["id"];
    return $Canonical$reuse_decision_result$(_state_0, ($ReuseState$attach$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _id_2)), {$: "Canonical.ReuseAttached"});
  } else if (_event_0.$ === "Canonical.ReuseRelease") {
    const _id_3 = _event_0["id"];
    return $Canonical$reuse_step$(_state_0, ($ReuseState$release$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _id_3)), {$: "Canonical.ReuseReleased"});
  } else if (_event_0.$ === "Canonical.ReuseTouch") {
    const _id_4 = _event_0["id"];
    return $Canonical$reuse_route_result$(_state_0, ($ReuseState$touch$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _id_4)));
  } else if (_event_0.$ === "Canonical.CachePrepare") {
    const _id_5 = _event_0["id"];
    const _bytes_7 = _event_0["bytes"];
    const _entry_limit_0 = _event_0["entry_limit"];
    const _byte_limit_0 = _event_0["byte_limit"];
    return $Canonical$cache_plan_result$(_state_0, ($ReuseState$prepare$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _id_5, _bytes_7, _entry_limit_0, _byte_limit_0)));
  } else if (_event_0.$ === "Canonical.CacheCommit") {
    const _id_6 = _event_0["id"];
    const _partition_32 = _event_0["partition"];
    const _bytes_8 = _event_0["bytes"];
    const _reservation_3 = _event_0["reservation"];
    const _entry_limit_1 = _event_0["entry_limit"];
    const _byte_limit_1 = _event_0["byte_limit"];
    return $Canonical$cache_commit$(_state_0, _id_6, _partition_32, _bytes_8, _reservation_3, _entry_limit_1, _byte_limit_1);
  } else if (_event_0.$ === "Canonical.CacheDiscardPartition") {
    const _partition_33 = _event_0["partition"];
    return $Canonical$cache_discard_result$(_state_0, ($ReuseState$discard$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _partition_33)));
  } else if (_event_0.$ === "Canonical.CacheClear") {
    return $Canonical$cache_discard_result$(_state_0, ($ReuseState$clear$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))))));
  } else if (_event_0.$ === "Canonical.NoticeAdvance") {
    const _key_0 = _event_0["key"];
    const _remaining_1 = _event_0["remaining"];
    const _maximum_keys_0 = _event_0["maximum_keys"];
    const _proposed_0 = _event_0["proposed"];
    const _sequence_0 = _event_0["sequence"];
    const _max_count_0 = _event_0["max_count"];
    return $Canonical$notice_advance_result$(_state_0, ($NoticeState$advance$(($CollectionState$notice_state$(($Canonical$collection_of$(_state_0)))), _key_0, _remaining_1, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0)));
  } else if (_event_0.$ === "Canonical.NoticeCommit") {
    const _key_1 = _event_0["key"];
    const _partition_34 = _event_0["partition"];
    const _group_12 = _event_0["group"];
    const _reservation_4 = _event_0["reservation"];
    const _pending_0 = _event_0["pending"];
    const _sequence_1 = _event_0["sequence"];
    const _maximum_keys_1 = _event_0["maximum_keys"];
    return $Canonical$notice_commit$(_state_0, _key_1, _partition_34, _group_12, _reservation_4, _pending_0, _sequence_1, _maximum_keys_1);
  } else if (_event_0.$ === "Canonical.NoticePrune") {
    const _key_2 = _event_0["key"];
    const _lease_expired_0 = _event_0["lease_expired"];
    const _pending_expired_0 = _event_0["pending_expired"];
    const _excepted_0 = _event_0["excepted"];
    const _cooldown_expired_0 = _event_0["cooldown_expired"];
    return $Canonical$notice_prune_result$(_state_0, ($NoticeState$prune$(($CollectionState$notice_state$(($Canonical$collection_of$(_state_0)))), _key_2, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0)));
  } else if (_event_0.$ === "Canonical.NoticeDrop") {
    const _key_3 = _event_0["key"];
    return $Canonical$notice_step$(_state_0, ($NoticeState$drop$(($CollectionState$notice_state$(($Canonical$collection_of$(_state_0)))), _key_3)), {$: "Canonical.NoticeDropped"});
  } else if (_event_0.$ === "Canonical.NoticeLease") {
    const _key_4 = _event_0["key"];
    const _leased_0 = _event_0["leased"];
    return $Canonical$notice_decision_result$(_state_0, ($NoticeState$lease$(($CollectionState$notice_state$(($Canonical$collection_of$(_state_0)))), _key_4, _leased_0)), {$: "Canonical.NoticeLeased"});
  } else if (_event_0.$ === "Canonical.NoticeClearPending") {
    const _key_5 = _event_0["key"];
    return $Canonical$notice_decision_result$(_state_0, ($NoticeState$clear_pending$(($CollectionState$notice_state$(($Canonical$collection_of$(_state_0)))), _key_5)), {$: "Canonical.NoticePendingCleared"});
  } else if (_event_0.$ === "Canonical.NoticeSelect") {
    const _partition_35 = _event_0["partition"];
    const _group_13 = _event_0["group"];
    const _composed_1 = _event_0["composed"];
    const _authority_bound_1 = _event_0["authority_bound"];
    const _allowed_0 = _event_0["allowed"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeSelected", "ids": ($NoticeState$select$(($CollectionState$notice_state$(($Canonical$collection_of$(_state_0)))), _partition_35, _group_13, _composed_1, _authority_bound_1, _allowed_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.OutputStarted") {
    const _partition_36 = _event_0["partition"];
    const _lifetime_36 = _event_0["lifetime"];
    const _round_37 = _event_0["round"];
    return $Canonical$output_start$(_state_0, _partition_36, _lifetime_36, _round_37);
  } else if (_event_0.$ === "Canonical.OutputTerminal") {
    const _partition_37 = _event_0["partition"];
    const _lifetime_37 = _event_0["lifetime"];
    const _round_38 = _event_0["round"];
    const _operation_14 = _event_0["operation"];
    const _outcome_4 = _event_0["outcome"];
    return $Canonical$output_terminal$(_state_0, _partition_37, _lifetime_37, _round_38, _operation_14, _outcome_4);
  } else if (_event_0.$ === "Canonical.RetirePartition") {
    const _partition_38 = _event_0["partition"];
    const _lifetime_38 = _event_0["lifetime"];
    const _round_39 = _event_0["round"];
    return $Canonical$retire$(_state_0, _partition_38, _lifetime_38, _round_39);
  } else {
    const _partition_39 = _event_0["partition"];
    const _lifetime_39 = _event_0["lifetime"];
    return $Canonical$forget_admission$(_state_0, _partition_39, _lifetime_39);
  }
}

function $Ledger$initial$(_limits_0) {
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": 1, "charges": {$: "Nil"}};
}

function $Dispatch$initial$() {
  return {$: "Dispatch.State", "queued": {$: "Nil"}, "running": {$: "Nil"}, "next_sequence": 0, "closed": false, "requests": {$: "Nil"}};
}

function $CollectionState$initial$() {
  return {$: "CollectionState.State", "ready": {$: "Nil"}, "leases": {$: "Nil"}, "claims": {$: "Nil"}, "delivery": ($DeliveryState$initial$()), "revision": ($RevisionState$initial$()), "reuse": ($ReuseState$initial$()), "notices": ($NoticeState$initial$())};
}

function $EditHistory$initial$() {
  return {$: "EditHistory.State", "entries": {$: "Nil"}};
}

function $Ledger$limits_for$(_purpose_0, _limits_0) {
  if (_purpose_0.$ === "Ledger.ObservationDispatch") {
    return _limits_0;
  } else if (_purpose_0.$ === "Ledger.Preparation") {
    return _limits_0;
  } else if (_purpose_0.$ === "Ledger.ReviewUnit") {
    return _limits_0;
  } else if (_purpose_0.$ === "Ledger.StoredResult") {
    return _limits_0;
  } else if (_purpose_0.$ === "Ledger.OperationalNotice") {
    return _limits_0;
  } else {
    return _limits_0;
  }
}

function $Canonical$check_round_invariant$(_original_0, _updated_0, _commands_0, _valid_0) {
  if (_valid_0) {
    return {$: "Canonical.Advanced", "state": _updated_0, "commands": _commands_0};
  } else {
    return {$: "Canonical.Rejected", "state": _original_0, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Canonical$unique_rounds$(_rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _rounds_0["head"];
    const _partition_0 = _t_0["partition"];
    const _rest_0 = _rounds_0["tail"];
    return $Bool$and$(($Canonical$round_not_found$(($Canonical$find_round$(_partition_0, _rest_0)))), ($Canonical$unique_rounds$(_rest_0)));
  }
}

function $Canonical$capacity_reserve$(_state_0, _partition_0, _bytes_0, _purpose_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$capacity_reserve_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _bytes_0, ($Ledger$reserve_for$(_ledger_0, _partition_0, _bytes_0, _purpose_0)));
}

function $Canonical$capacity_resize$(_state_0, _id_0, _bytes_0, _purpose_0) {
  const _t_0 = _state_0["ledger"];
  const __0 = _t_0["limits"];
  const __1 = _t_0["next_id"];
  const _charges_0 = _t_0["charges"];
  const __2 = _state_0["rounds"];
  const __3 = _state_0["work"];
  const __4 = _state_0["next_round"];
  const __5 = _state_0["next_operation"];
  const __6 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$capacity_resize_found$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _bytes_0, _purpose_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Canonical$capacity_release$(_state_0, _id_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$capacity_release_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, ($Ledger$release$(_ledger_0, _id_0)));
}

function $Canonical$capacity_replace$(_state_0, _id_0, _sizes_0) {
  const _t_0 = _state_0["ledger"];
  const __0 = _t_0["limits"];
  const __1 = _t_0["next_id"];
  const _charges_0 = _t_0["charges"];
  const __2 = _state_0["rounds"];
  const __3 = _state_0["work"];
  const __4 = _state_0["next_round"];
  const __5 = _state_0["next_operation"];
  const __6 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$capacity_replace_found$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _sizes_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Canonical$issue_permit$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _minimum_started_0, _facts_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  const _hook_window_0 = _facts_0["hook_window"];
  const _started_upper_0 = _facts_0["started_upper"];
  const _now_lower_0 = _facts_0["now_lower"];
  const _advicee_limit_0 = _facts_0["advicee_permit_limit"];
  const _resident_limit_0 = _facts_0["resident_permit_limit"];
  return $Bool$pick$(($Nat$is_gt$(_started_0, _minimum_started_0)), ($Canonical$issue_permit_gate$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0, ($Admission$prospective_gate$({$: "Admission.ProspectiveFacts", "clock_valid": _clock_valid_0, "hook_window": _hook_window_0, "started_upper": _started_upper_0, "now_lower": _now_lower_0, "advicee_permit_limit": _advicee_limit_0, "resident_permit_limit": _resident_limit_0}, _started_0, _now_0)))), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.StaleInvocation"}}});
}

function $Canonical$check_completed_edit$(_state_0, _tool_0) {
  return $Canonical$checked_completed_edit$(_state_0, _tool_0, ($EditHistory$lookup$(_tool_0, ($Canonical$history_of$(_state_0)))));
}

function $Canonical$remember_completed_edit$(_state_0, _tool_0, _reason_0) {
  return $Canonical$remember_completed_checked$(_state_0, _tool_0, _reason_0, ($EditHistory$lookup$(_tool_0, ($Canonical$history_of$(_state_0)))));
}

function $Canonical$quiet_round_tick$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$quiet_round_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$quiet_round_reset$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$quiet_round_reset_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$consume_permit$(_state_0, _partition_0, _lifetime_0, _token_0, _tool_0, _now_0) {
  return $Canonical$consume_result$(_state_0, _partition_0, _lifetime_0, ($Admission$step$(($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Consume", "token": _token_0, "tool": _tool_0, "now": _now_0})));
}

function $Canonical$release_permit$(_state_0, _partition_0, _lifetime_0, _token_0) {
  return $Canonical$permit_result$(_state_0, _partition_0, ($Admission$step$(($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Release", "token": _token_0})), {$: "Canonical.PermitReleased"});
}

function $Canonical$expire_permit$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0) {
  return $Canonical$expire_permit_checked$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0, ($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
}

function $Canonical$close_permit_round$(_state_0, _partition_0, _lifetime_0, _round_0, _at_0) {
  return $Canonical$close_permit_checked$(_state_0, _partition_0, _lifetime_0, _round_0, _at_0, ($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
}

function $Canonical$open$(_state_0, _partition_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$open_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$admit_observation$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$admit_observation_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$start_observation$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$observation_started_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _observation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $Canonical$complete_observation$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$observation_completed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _observation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $Canonical$interrupt_observation$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$interrupt_observation_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _observation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $Canonical$begin$(_state_0, _partition_0, _lifetime_0, _round_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$begin_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _bytes_0, 0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$begin_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$begin_observed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _observation_0, _bytes_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $Canonical$interrupt_preparation$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  return $Canonical$prepared$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Nil"});
}

function $Canonical$prepared$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  const __3 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$prepared_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0, ($Canonical$find_round$(_partition_0, _rounds_0)), ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$start_review$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$start_review_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$request_ready$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$request_ready_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, ($Canonical$request_facts_ready$(_root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0)), ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$request_started$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$request_update_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, ($Dispatch$request_update$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, true, false, false)), {$: "Canonical.JevRequestStartRecorded"});
}

function $Canonical$request_interrupted$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$request_update_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, ($Dispatch$request_update$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, false, true, false)), {$: "Canonical.JevInterruptionRecorded"});
}

function $Canonical$request_settled$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _outcome_0, _current_work_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _t_0 = _state_0["dispatch"];
  const __6 = _t_0["queued"];
  const __7 = _t_0["running"];
  const __8 = _t_0["next_sequence"];
  const __9 = _t_0["closed"];
  const _requests_0 = _t_0["requests"];
  const __10 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$request_settled_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": {$: "Dispatch.State", "queued": __6, "running": __7, "next_sequence": __8, "closed": __9, "requests": _requests_0}, "collection": __10, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _outcome_0, _current_work_0, ($Dispatch$request_phase$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)));
}

function $Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$reviewed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _outcome_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$retire_review$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$retire_review_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$cancel_review$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const __7 = _state_0["history"];
  return $Canonical$cancel_review_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": __7}, _operation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$review_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0) {
  return $Canonical$review_observed_choice$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, ($Work$evaluated_disposition$(($Canonical$is_finding$(_outcome_0)), _current_work_0)));
}

function $Canonical$finding_count_update$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _count_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$finding_count_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _operation_0, _count_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$queue_dispatch$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($Canonical$work_dispatchable$(($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)))), ($Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($Dispatch$enqueue$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, ($Canonical$dispatch_preparation$(($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)))))))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}});
}

function $Canonical$settle_dispatch$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($Dispatch$settle$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0)));
}

function $Canonical$discard_dispatch$(_state_0, _operations_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($Dispatch$discard$(_dispatch_0, _operations_0)));
}

function $Canonical$dispatch_scope$(_state_0, _named_count_0, _cancelled_count_0, _has_unnamed_0) {
  return $Canonical$dispatch_scope_result$(_state_0, ($Retention$discard_scope$(_named_count_0, _cancelled_count_0, _has_unnamed_0)));
}

function $Canonical$close_dispatch$(_state_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($Dispatch$close$(_dispatch_0)));
}

function $Canonical$prepared_offer_check$(_state_0, _ready_0, _within_frame_0) {
  return $Canonical$prepared_offer_result$(_state_0, ($Work$prepared_offer$(_ready_0, _within_frame_0)));
}

function $Canonical$empty_prepared_check$(_state_0, _ready_count_0, _has_non_skipped_0, _authority_bound_0) {
  return $Canonical$empty_prepared_result$(_state_0, ($Work$empty_prepared$(_ready_count_0, _has_non_skipped_0, _authority_bound_0)));
}

function $Canonical$review_failure_check$(_state_0, _backend_or_timeout_0, _credential_0, _missing_0) {
  return $Canonical$review_failure_result$(_state_0, ($Work$failure_disposition$(_backend_or_timeout_0, _credential_0, _missing_0)));
}

function $Canonical$stop$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$stop_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$stop_group$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _deadline_0, _extra_pending_0, _continuations_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$stop_group_checked$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, _deadline_0, _extra_pending_0, _continuations_0, ($Canonical$find_round$(_group_0, _rounds_0)));
}

function $Canonical$stop_group_end$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$stop_group_end_checked$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, ($Canonical$find_round$(_group_0, _rounds_0)));
}

function $Canonical$collection_ready$(_state_0, _advice_0, _partition_0, _lifetime_0, _round_0, _observation_0, _joined_pending_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  const __3 = _state_0["admissions"];
  const __4 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _x_0 = ($Canonical$unfinished_for_observation$(_work_0, _partition_0, _lifetime_0, _round_0, _observation_0));
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, ($CollectionState$mark_ready$(_collection_0, _advice_0, ($Bool$and$(($Canonical$finding_for_observation$(_work_0, _partition_0, _lifetime_0, _round_0, _observation_0, _advice_0)), ($Collection$eligible$(($Canonical$deciding_round$(($Canonical$find_round$(_partition_0, _rounds_0)), _partition_0, _lifetime_0, _round_0)), ($Bool$not$((_joined_pending_0 || _x_0))))))))), {$: "Canonical.CollectionEligible"}, {$: "Canonical.CollectionWaiting"});
}

function $Canonical$collection_credential_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Collection.RetireAdvice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionRetireCredential"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionRetainCredential"}, "tail": {$: "Nil"}}};
  }
}

function $Collection$credential_disposition$(_same_scope_0, _generation_valid_0) {
  return $Bool$pick$(($Bool$and$(_same_scope_0, ($Bool$not$(_generation_valid_0)))), {$: "Collection.RetireAdvice"}, {$: "Collection.RetainAdvice"});
}

function $Canonical$collection_candidate$(_state_0, _same_partition_0, _unleased_0, _has_unsuppressed_0, _authority_owns_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$advice_candidate$(_same_partition_0, _unleased_0, _has_unsuppressed_0, _authority_owns_0)), {$: "Canonical.CollectionCandidate"}, {$: "Canonical.CollectionSkip"})), "tail": {$: "Nil"}}};
}

function $Canonical$collection_order_result$(_state_0, _order_0) {
  if (_order_0.$ === "Collection.Before") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionBefore"}, "tail": {$: "Nil"}}};
  } else if (_order_0.$ === "Collection.Equal") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionEqual"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionAfter"}, "tail": {$: "Nil"}}};
  }
}

function $Collection$order$(_left_sequence_0, _right_sequence_0) {
  return $Bool$pick$((_left_sequence_0 < _right_sequence_0), {$: "Collection.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_sequence_0, _right_sequence_0)), {$: "Collection.After"}, {$: "Collection.Equal"})));
}

function $Canonical$collection_expiry$(_state_0, _elapsed_0, _lifetime_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Collection$expired$(_elapsed_0, _lifetime_0)), {$: "Canonical.CollectionExpired"}, {$: "Canonical.CollectionCurrent"})), "tail": {$: "Nil"}}};
}

function $Canonical$collection_fit$(_state_0, _items_0, _bytes_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Handoff$fits_batch$(_items_0, _bytes_0)), {$: "Canonical.CollectionFits"}, {$: "Canonical.CollectionLimited"})), "tail": {$: "Nil"}}};
}

function $Canonical$collection_finding$(_state_0, _selection_partition_0, _selection_round_0, _unit_0, _partition_0, _round_0, _snapshot_0, _current_snapshot_0, _credential_0, _current_credential_0, _age_ms_0, _solo_bytes_0, _collection_ready_0, _selected_count_0, _prospective_bytes_0) {
  return $Canonical$collection_finding_result$(_state_0, ($Handoff$current$({$: "Handoff.Advice", "id": 1, "unit": _unit_0, "partition": _partition_0, "round": _round_0, "snapshot": _snapshot_0, "current_snapshot": _current_snapshot_0, "credential": _credential_0, "current_credential": _current_credential_0, "age_ms": _age_ms_0, "solo_bytes": _solo_bytes_0, "collection_ready": _collection_ready_0}, _selection_partition_0, _selection_round_0)), ($Nat$is_gt$(_solo_bytes_0, 10240)), ($Handoff$fits_batch$(nat_chk(_selected_count_0 + 1), _prospective_bytes_0)));
}

function $Canonical$collection_notice_result$(_state_0, _result_0) {
  if (_result_0.$ === "Handoff.IncludeNotice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionNoticeIncluded"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "Handoff.SkipNotice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionNoticeSkipped"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionNoticeStopped"}, "tail": {$: "Nil"}}};
  }
}

function $Handoff$notice_offer$(_items_0, _bytes_0, _skip_unfitting_0) {
  return $Bool$pick$(($Handoff$fits_batch$(_items_0, _bytes_0)), {$: "Handoff.IncludeNotice"}, ($Bool$pick$(_skip_unfitting_0, {$: "Handoff.SkipNotice"}, {$: "Handoff.StopNotices"})));
}

function $Canonical$collection_reserve$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$reserve$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseReserved"}, {$: "Canonical.CollectionLeaseRefused"});
}

function $Canonical$collection_release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$release$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseReleased"}, {$: "Canonical.CollectionLeaseRefused"});
}

function $Canonical$collection_lease_check$(_state_0, _advice_0, _token_0, _expired_0, _stop_collector_0, _same_group_0, _reofferable_0) {
  return $Canonical$collection_lease_checked$(_state_0, _advice_0, _token_0, ($Delivery$collection_lease$(true, _expired_0, _stop_collector_0, _same_group_0, _reofferable_0)));
}

function $Canonical$collection_retire$(_state_0, _advice_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($CollectionState$protected_advice$(_collection_0, _advice_0)), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}}, {$: "Canonical.Advanced", "state": ($Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$retire$(_collection_0, _advice_0)))), "commands": {$: "Con", "head": {$: "Canonical.CollectionAdviceRetired"}, "tail": {$: "Nil"}}});
}

function $Canonical$collection_claim$(_state_0, _group_0, _token_0, _active_0, _capacity_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$claim$(_collection_0, _group_0, _token_0, _active_0, _capacity_0)), {$: "Canonical.CollectionBackgroundClaimed"}, {$: "Canonical.CollectionBackgroundRefused"});
}

function $Canonical$collection_release_background$(_state_0, _group_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$release_claim$(_collection_0, _group_0, _token_0)), {$: "Canonical.CollectionBackgroundReleased"}, {$: "Canonical.CollectionBackgroundRefused"});
}

function $Canonical$collection_expire_background$(_state_0, _group_0, _token_0, _elapsed_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$expire_claim$(_collection_0, _group_0, _token_0, _elapsed_0, _lifetime_0)), {$: "Canonical.CollectionBackgroundReleased"}, {$: "Canonical.CollectionBackgroundKept"});
}

function $Canonical$finish_reserve$(_state_0, _group_0, _lifetime_0, _round_0, _attempt_0, _token_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  const __3 = _state_0["admissions"];
  const __4 = _state_0["dispatch"];
  const __5 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($Bool$not$(_can_write_0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(_deadline_reached_0, {$: "Canonical.FinishAllowedDeadline"}, {$: "Canonical.FinishAllowedNoAdvice"})), "tail": {$: "Nil"}}}, ($Bool$pick$(($Nat$is_eq$(($List$length$(_selected_0)), 0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_has_notice_0, _pass_notices_0)), {$: "Canonical.FinishNotices"}, ($Bool$pick$(_deadline_reached_0, {$: "Canonical.FinishAllowedDeadline"}, {$: "Canonical.FinishAllowedNoAdvice"})))), "tail": {$: "Nil"}}}, ($Bool$pick$(($Bool$and$(_binding_valid_0, ($Bool$and$(($Canonical$deciding_round$(($Canonical$find_round$(_group_0, _rounds_0)), _group_0, _lifetime_0, _round_0)), ($Canonical$selected_pending$(_selected_0, _work_0)))))), ($Canonical$finish_reserve_decision$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.FinishAllowedUnavailable"}, "tail": {$: "Nil"}}})))));
}

function $Canonical$finish_release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$finish_release$(_collection_0, _group_0, _round_0, _attempt_0, _token_0)), {$: "Canonical.FinishReleased"}, {$: "Canonical.FinishRefused"});
}

function $Canonical$finish_authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($CollectionState$submission_ready$(_collection_0, _group_0, _round_0, _token_0, _selected_0)), ($Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$finish_authorize$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.FinishAuthorized"}, {$: "Canonical.FinishRefused"})), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.FinishRefused"}, "tail": {$: "Nil"}}});
}

function $Canonical$finish_terminal$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _outcome_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_outcome_0.$ === "Canonical.Acknowledged") {
    return $Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, {$: "Canonical.Acknowledged"}, ($CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Submitted"})));
  } else if (_outcome_0.$ === "Canonical.Failed") {
    return $Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, {$: "Canonical.Failed"}, ($CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Failed"})));
  } else {
    return $Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, {$: "Canonical.Unknown"}, ($CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Uncertain"})));
  }
}

function $Canonical$finish_end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$finish_end$(_collection_0, _group_0, _round_0, _attempt_0, _token_0)), {$: "Canonical.FinishEnded"}, {$: "Canonical.FinishRefused"});
}

function $Canonical$continuation_consume$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$consume_continuation$(_collection_0, _group_0, _round_0)), {$: "Canonical.ContinuationConsumed"}, {$: "Canonical.ContinuationRefused"});
}

function $Canonical$submission_begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($Bool$and$(($Canonical$submission_round_found$(_group_0, _round_0, ($Canonical$find_round$(_group_0, _rounds_0)))), ($Canonical$submission_stop_reservation$(_surface_0, _authorize_now_0, ($CollectionState$submission_reservation$(_collection_0, _group_0, _round_0, _token_0)))))), ($Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, ($CollectionState$submission_begin$(_collection_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0)), {$: "Canonical.SubmissionBegun"}, {$: "Canonical.SubmissionRefused"})), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.SubmissionRefused"}, "tail": {$: "Nil"}}});
}

function $Canonical$submission_authorize$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$submission_authorize$(_collection_0, _advice_0, _token_0)), {$: "Canonical.SubmissionAuthorized"}, {$: "Canonical.SubmissionRefused"});
}

function $Canonical$submission_terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$submission_terminal$(_collection_0, _advice_0, _token_0, _certain_0)), {$: "Canonical.SubmissionRecorded"}, {$: "Canonical.SubmissionRefused"});
}

function $Canonical$submission_release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$submission_release$(_collection_0, _advice_0, _token_0)), {$: "Canonical.SubmissionReleased"}, {$: "Canonical.SubmissionRefused"});
}

function $Canonical$submission_forget$(_state_0, _advice_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($CollectionState$protected_advice$(_collection_0, _advice_0)), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}}, {$: "Canonical.Advanced", "state": ($Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$submission_forget$(_collection_0, _advice_0)))), "commands": {$: "Con", "head": {$: "Canonical.SubmissionForgotten"}, "tail": {$: "Nil"}}});
}

function $Canonical$submission_suppress_check$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($CollectionState$submission_suppresses$(_collection_0, _advice_0, _fingerprint_0, _round_0, _surface_0)), {$: "Canonical.SubmissionSuppresses"}, {$: "Canonical.SubmissionUnsuppressed"})), "tail": {$: "Nil"}}};
}

function $Canonical$submission_reoffer_check$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($CollectionState$submission_reofferable$(_collection_0, _advice_0, _token_0)), {$: "Canonical.SubmissionReofferable"}, {$: "Canonical.SubmissionNotReofferable"})), "tail": {$: "Nil"}}};
}

function $Canonical$submission_expiry_check$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($CollectionState$submission_expired$(_collection_0, _advice_0, _token_0, _elapsed_0, _lifetime_0)), {$: "Canonical.SubmissionExpired"}, {$: "Canonical.SubmissionCurrent"})), "tail": {$: "Nil"}}};
}

function $Canonical$revision_register$(_state_0, _subject_0, _input_0, _add_member_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$revision_register_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$revision_register$(_collection_0, _subject_0, _input_0, _add_member_0)));
}

function $Canonical$revision_release$(_state_0, _subject_0, _generation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$revision_release$(_collection_0, _subject_0, _generation_0)))), "commands": {$: "Con", "head": {$: "Canonical.RevisionReleased"}, "tail": {$: "Nil"}}};
}

function $Canonical$revision_current_check$(_state_0, _subject_0, _input_0, _generation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($CollectionState$revision_current$(_collection_0, _subject_0, _input_0, _generation_0)), {$: "Canonical.RevisionCurrent"}, {$: "Canonical.RevisionStale"})), "tail": {$: "Nil"}}};
}

function $Canonical$revision_superseded_check$(_state_0, _subject_0, _candidate_subject_0, _generation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($CollectionState$revision_superseded$(_collection_0, _subject_0, _candidate_subject_0, _generation_0)), {$: "Canonical.RevisionSuperseded"}, {$: "Canonical.RevisionNotSuperseded"})), "tail": {$: "Nil"}}};
}

function $Canonical$revision_generation_check$(_state_0, _subject_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.RevisionGeneration", "generation": ($CollectionState$revision_generation$(_collection_0, _subject_0))}, "tail": {$: "Nil"}}};
}

function $Canonical$revision_count_check$(_state_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.RevisionCount", "count": ($CollectionState$revision_count$(_collection_0))}, "tail": {$: "Nil"}}};
}

function $Canonical$collector_gate_result$(_state_0, _result_0) {
  if (_result_0.$ === "CollectorAuthority.CollectProceed") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorProceed"}, "tail": {$: "Nil"}}};
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorUnavailable", "reason": _reason_0}, "tail": {$: "Nil"}}};
  }
}

function $CollectorAuthority$collect_gate$(_expired_0, _credential_valid_0) {
  return $Bool$pick$(_expired_0, {$: "CollectorAuthority.CollectUnavailable", "reason": {$: "CollectorAuthority.Expired"}}, ($Bool$pick$(($Bool$not$(_credential_valid_0)), {$: "CollectorAuthority.CollectUnavailable", "reason": {$: "CollectorAuthority.Credential"}}, {$: "CollectorAuthority.CollectProceed"})));
}

function $Canonical$collector_final_authority_result$(_state_0, _result_0) {
  if (_result_0.$ === "CollectorAuthority.FinalProceed") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorFinalProceed"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorFinalRelease"}, "tail": {$: "Nil"}}};
  }
}

function $CollectorAuthority$final_authority$(_admitted_block_0, _current_block_0) {
  return $Bool$pick$(($Bool$and$(_admitted_block_0, ($Bool$not$(_current_block_0)))), {$: "CollectorAuthority.FinalRelease"}, {$: "CollectorAuthority.FinalProceed"});
}

function $Canonical$reuse_member_result$(_state_0, _result_0) {
  if (_result_0.$ === "Reuse.KeepJoined") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseKeepMember"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "Reuse.SetJoinedClear") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseSetMemberClear"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "Reuse.SetJoinedFinding") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseSetMemberFinding"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "Reuse.SetJoinedUnavailable") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseSetMemberUnavailable"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseSetMemberLost"}, "tail": {$: "Nil"}}};
  }
}

function $Reuse$joined_disposition$(_state_0, _stale_unavailable_0, _has_revision_0, _has_advice_id_0) {
  return $Bool$pick$(_stale_unavailable_0, {$: "Reuse.KeepJoined"}, ($Reuse$joined$route$(_state_0, _has_revision_0, _has_advice_id_0)));
}

function $Canonical$cleanup_check_result$(_state_0, _result_0) {
  if (_result_0.$ === "Retention.CleanupReady") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Canonical$cleanup_state_clean$(_state_0)), {$: "Canonical.CleanupReady"}, {$: "Canonical.CleanupBusy"})), "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CleanupBusy"}, "tail": {$: "Nil"}}};
  }
}

function $Retention$cleanup_gate$(_facts_0) {
  const _active_0 = _facts_0["active"];
  const _dispatcher_idle_0 = _facts_0["dispatcher_idle"];
  const _no_advice_0 = _facts_0["no_advice"];
  const _no_notices_0 = _facts_0["no_notices"];
  const _no_pending_evaluations_0 = _facts_0["no_pending_evaluations"];
  const _no_current_work_0 = _facts_0["no_current_work"];
  const _no_cooldowns_0 = _facts_0["no_cooldowns"];
  const _connection_count_ok_0 = _facts_0["connection_count_ok"];
  const _cache_matches_ledger_0 = _facts_0["cache_matches_ledger"];
  return $Bool$pick$(($Bool$and$(_active_0, ($Bool$and$(_dispatcher_idle_0, ($Bool$and$(_no_advice_0, ($Bool$and$(_no_notices_0, ($Bool$and$(_no_pending_evaluations_0, ($Bool$and$(_no_current_work_0, ($Bool$and$(_no_cooldowns_0, ($Bool$and$(_connection_count_ok_0, _cache_matches_ledger_0)))))))))))))))), {$: "Retention.CleanupReady"}, {$: "Retention.CleanupBusy"});
}

function $Canonical$cleanup_commit$(_state_0) {
  return $Canonical$cleanup_commit_checked$(_state_0, ($Canonical$cleanup_commit_eligible$(_state_0)));
}

function $Bool$pick$(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
}

function $Delivery$release_unacknowledged$(_acknowledged_0) {
  return $Bool$not$(_acknowledged_0);
}

function $Canonical$delivery_ack_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.AckReady") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryAckReady"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Delivery.AckExpired") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryAckExpired"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryAckEmpty"}, "tail": {$: "Nil"}}};
  }
}

function $Delivery$acknowledge$(_items_0, _any_expired_0) {
  return $Bool$pick$(($Nat$is_eq$(_items_0, 0)), {$: "Delivery.AckEmpty"}, ($Bool$pick$(_any_expired_0, {$: "Delivery.AckExpired"}, {$: "Delivery.AckReady"})));
}

function $Canonical$delivery_final_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.FinalReady") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryFinalReady"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Delivery.FinalExpired") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryFinalExpired"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryFinalEmpty"}, "tail": {$: "Nil"}}};
  }
}

function $Delivery$finalize$(_items_0, _all_acknowledged_0, _any_expired_0) {
  const _x_0 = ($Nat$is_eq$(_items_0, 0));
  const _x_1 = ($Bool$not$(_all_acknowledged_0));
  return $Bool$pick$((_x_0 || _x_1), {$: "Delivery.FinalEmpty"}, ($Bool$pick$(_any_expired_0, {$: "Delivery.FinalExpired"}, {$: "Delivery.FinalReady"})));
}

function $Canonical$delivery_disposition_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.RetireAdvice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryRetireAdvice"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Delivery.KeepRemaining") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryKeepRemaining"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryKeepForReoffer"}, "tail": {$: "Nil"}}};
  }
}

function $Delivery$finding_disposition$(_composed_0, _remaining_0) {
  return $Bool$pick$(_composed_0, {$: "Delivery.KeepForReoffer"}, ($Bool$pick$(($Nat$is_eq$(_remaining_0, 0)), {$: "Delivery.RetireAdvice"}, {$: "Delivery.KeepRemaining"})));
}

function $Delivery$submission_candidate$(_facts_0) {
  const _round_active_0 = _facts_0["round_active"];
  const _has_round_0 = _facts_0["has_round"];
  const _has_unit_0 = _facts_0["has_unit"];
  const _has_delivery_0 = _facts_0["has_delivery"];
  const _pending_capacity_0 = _facts_0["pending_capacity"];
  const _submission_allowed_0 = _facts_0["submission_allowed"];
  const _current_work_0 = _facts_0["current_work"];
  const _credential_authorized_0 = _facts_0["credential_authorized"];
  return $Bool$and$(_round_active_0, ($Bool$and$(_has_round_0, ($Bool$and$(_has_unit_0, ($Bool$and$(_has_delivery_0, ($Bool$and$(_pending_capacity_0, ($Bool$and$(_submission_allowed_0, ($Bool$and$(_current_work_0, _credential_authorized_0)))))))))))));
}

function $Canonical$delivery_batch_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.BatchProceed") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryBatchProceed"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryBatchRelease"}, "tail": {$: "Nil"}}};
  }
}

function $Delivery$submission_batch_gate$(_count_0, _all_valid_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_count_0, 0)), _all_valid_0)), {$: "Delivery.BatchProceed"}, {$: "Delivery.BatchRelease"});
}

function $Delivery$credential_observe$(_invalid_seen_0, _generation_valid_0, _authorized_0) {
  const _x_0 = ($Bool$not$(($Bool$and$(_generation_valid_0, _authorized_0))));
  return (_invalid_seen_0 || _x_0);
}

function $Delivery$final_credential_gate$(_shared_collect_0, _invalid_seen_0) {
  return $Bool$pick$(($Bool$and$(_shared_collect_0, _invalid_seen_0)), {$: "Delivery.BatchRelease"}, {$: "Delivery.BatchProceed"});
}

function $Canonical$candidate_route_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Handoff.IgnoreCandidate") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.IgnoreCandidate"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Handoff.ReleaseCandidate") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReleaseCandidate"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Handoff.RetireCandidate") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RetireCandidate"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Handoff.ContinueCandidate") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ContinueCandidate"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RetainCandidate"}, "tail": {$: "Nil"}}};
  }
}

function $Handoff$validation_route$(_owner_current_0, _status_0) {
  if (!_owner_current_0) {
    return {$: "Handoff.IgnoreCandidate"};
  } else {
    if (_status_0.$ === "Handoff.Current") {
      return {$: "Handoff.ContinueCandidate"};
    } else if (_status_0.$ === "Handoff.Stale") {
      return {$: "Handoff.RetireCandidate"};
    } else {
      return {$: "Handoff.ReleaseCandidate"};
    }
  }
}

function $Handoff$post_validation$(_work_accepted_0, _expired_0, _has_fitting_0) {
  const _x_0 = ($Bool$not$(_work_accepted_0));
  return $Bool$pick$((_x_0 || _expired_0), {$: "Handoff.RetireCandidate"}, ($Bool$pick$(_has_fitting_0, {$: "Handoff.RetainCandidate"}, {$: "Handoff.ReleaseCandidate"})));
}

function $Handoff$final_candidate$(_owner_current_0, _credential_generation_0, _credential_authorized_0, _expired_0, _work_current_0, _has_findings_0) {
  const _x_0 = ($Bool$not$(_work_current_0));
  return $Bool$pick$(($Bool$not$(_owner_current_0)), {$: "Handoff.IgnoreCandidate"}, ($Bool$pick$(($Bool$not$(_credential_generation_0)), {$: "Handoff.RetireCandidate"}, ($Bool$pick$(($Bool$not$(_credential_authorized_0)), {$: "Handoff.ReleaseCandidate"}, ($Bool$pick$((_expired_0 || _x_0), {$: "Handoff.RetireCandidate"}, ($Bool$pick$(_has_findings_0, {$: "Handoff.RetainCandidate"}, {$: "Handoff.ReleaseCandidate"})))))))));
}

function $Bool$and$(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Bool$not$(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $Nat$is_gt$(_a_0, _b_0) {
  return $Cmp$is_gt$(cmp_new(_a_0, _b_0));
}

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
}

function $Canonical$stop_terminal_result$(_state_0, _result_0) {
  const _revoke_provisional_0 = _result_0["revoke_provisional"];
  const _close_0 = _result_0["close"];
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RoundStopTerminal", "revoke_provisional": _revoke_provisional_0, "close": _close_0}, "tail": {$: "Nil"}}};
}

function $Round$stop_terminal$(_has_output_0, _authorized_0, _requested_close_0) {
  const _x_0 = ($Bool$and$(_has_output_0, ($Bool$not$(_authorized_0))));
  return {$: "Round.StopTerminal", "revoke_provisional": ($Bool$and$(_has_output_0, ($Bool$not$(_authorized_0)))), "close": (_requested_close_0 || _x_0)};
}

function $Round$expire_close$(_barrier_0) {
  return $Bool$not$(_barrier_0);
}

function $Round$max_continuations$() {
  return 4;
}

function $Delivery$submission_allowed_facts$(_live_0, _barrier_0, _deciding_0, _surface_0, _existing_token_0, _finish_permit_0) {
  if (_surface_0.$ === "Delivery.Background") {
    return $Bool$and$(_live_0, ($Bool$and$(($Delivery$existing_token_allowed$({$: "Delivery.Background"}, _existing_token_0, _finish_permit_0)), ($Bool$and$(($Bool$not$(_barrier_0)), ($Bool$not$(_deciding_0)))))));
  } else if (_surface_0.$ === "Delivery.Stop") {
    return $Bool$and$(_live_0, ($Delivery$existing_token_allowed$({$: "Delivery.Stop"}, _existing_token_0, _finish_permit_0)));
  } else {
    return $Bool$and$(_live_0, ($Delivery$existing_token_allowed$({$: "Delivery.Edit"}, _existing_token_0, _finish_permit_0)));
  }
}

function $Delivery$existing_token_allowed$(_surface_0, _existing_token_0, _finish_permit_0) {
  if (_surface_0.$ === "Delivery.Stop") {
    const _x_0 = ($Bool$not$(_existing_token_0));
    return (_x_0 || _finish_permit_0);
  } else {
    return $Bool$not$(_existing_token_0);
  }
}

function $Delivery$unreserved_stop_allowed_facts$(_live_0, _deciding_0) {
  return $Bool$and$(_live_0, ($Bool$not$(_deciding_0)));
}

function $Configuration$include_choice$(_supplied_0, _current_rank_0, _candidate_rank_0) {
  return $Bool$pick$(($Bool$and$(_supplied_0, ($Nat$is_ge$(_candidate_rank_0, _current_rank_0)))), {$: "Configuration.ReplaceIncludes"}, {$: "Configuration.KeepIncludes"});
}

function $Configuration$select$(_protected_0, _excluded_0, _includes_empty_0, _included_0) {
  return $Bool$pick$(_protected_0, {$: "Configuration.Protected"}, ($Bool$pick$(_excluded_0, {$: "Configuration.Excluded"}, ($Bool$pick$(_includes_empty_0, {$: "Configuration.EmptyIncludes"}, ($Bool$pick$(_included_0, {$: "Configuration.Selected"}, {$: "Configuration.NotIncluded"})))))));
}

function $Configuration$protection$(_sensitive_name_0, _generated_or_vendor_0, _allowed_extension_0) {
  return $Bool$pick$(_sensitive_name_0, {$: "Configuration.SensitivePath"}, ($Bool$pick$(_generated_or_vendor_0, {$: "Configuration.GeneratedOrVendor"}, ($Bool$pick$(($Bool$not$(_allowed_extension_0)), {$: "Configuration.FileExtension"}, {$: "Configuration.AllowedPath"})))));
}

function $Configuration$candidate$(_git_admin_0, _physical_safe_0, _git_allowed_0) {
  return $Bool$pick$(_git_admin_0, {$: "Configuration.RefuseGitAdmin"}, ($Bool$pick$(($Bool$not$(_physical_safe_0)), {$: "Configuration.RefuseFileKind"}, ($Bool$pick$(($Bool$not$(_git_allowed_0)), {$: "Configuration.RefuseGitIgnore"}, {$: "Configuration.CandidateAllowed"})))));
}

function $Configuration$admit$(_root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0) {
  return $Bool$pick$(($Bool$not$(_root_valid_0)), {$: "Configuration.RefuseRoot"}, ($Bool$pick$(($Bool$not$(_configuration_valid_0)), {$: "Configuration.RefuseConfiguration"}, ($Bool$pick$(($Bool$not$(_credential_ready_0)), {$: "Configuration.RefuseCredential"}, ($Bool$pick$(($Bool$not$(_selected_0)), {$: "Configuration.RefuseSelection"}, {$: "Configuration.AdmitReview"})))))));
}

function $RulePolicy$enabled$(_pack_enabled_0, _rule_enabled_0) {
  return $Bool$pick$(($Bool$and$(_pack_enabled_0, _rule_enabled_0)), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $RulePolicy$applicable$(_consent_0, _complete_0, _target_0, _global_included_0, _global_excluded_0, _pack_enabled_0, _rule_enabled_0, _rule_included_0, _rule_excluded_0, _target_declared_0, _capabilities_available_0, _source_rung_0, _minimum_rung_0) {
  const _scope_ok_0 = ($Bool$and$(_consent_0, _complete_0));
  const _target_ok_0 = ($Bool$and$(($RulePolicy$target_compatible$(_target_0)), ($Bool$and$(_target_declared_0, _capabilities_available_0))));
  const _path_ok_0 = ($Bool$and$(_global_included_0, ($Bool$and$(($Bool$not$(_global_excluded_0)), ($Bool$and$(_rule_included_0, ($Bool$not$(_rule_excluded_0))))))));
  const _rule_ok_0 = ($Bool$and$(_pack_enabled_0, _rule_enabled_0));
  const _rung_ok_0 = ($Bool$and$(($Nat$is_ge$(_source_rung_0, 1)), ($Bool$and$(($Nat$is_le$(_source_rung_0, 3)), ($Bool$and$(($Nat$is_ge$(_minimum_rung_0, 1)), ($Bool$and$(($Nat$is_le$(_minimum_rung_0, 3)), ($Nat$is_ge$(_source_rung_0, _minimum_rung_0))))))))));
  return $Bool$pick$(($Bool$and$(_scope_ok_0, ($Bool$and$(_target_ok_0, ($Bool$and$(_path_ok_0, ($Bool$and$(_rule_ok_0, _rung_ok_0)))))))), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $RulePolicy$finding$(_probability_0, _threshold_0) {
  return $Bool$pick$(($Bool$and$(($RulePolicy$valid_words$(_probability_0)), ($Bool$and$(($RulePolicy$valid_words$(_threshold_0)), ($RulePolicy$greater_words$(_probability_0, _threshold_0)))))), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $RulePolicy$rank_order$(_left_0, _right_0, _left_rank_0, _right_rank_0) {
  return $RulePolicy$rank_order_result$(($RulePolicy$probability_order$(_left_0, _right_0)), _left_rank_0, _right_rank_0);
}

function $RulePolicy$advice_order$(_left_0, _right_0, _path_order_0, _id_order_0) {
  return $RulePolicy$advice_order_result$(($RulePolicy$probability_order$(_left_0, _right_0)), _path_order_0, _id_order_0);
}

function $RulePolicy$budget$(_position_0, _limit_0) {
  return $Bool$pick$((_position_0 < _limit_0), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $Canonical$reuse_route_result$(_state_0, _result_0) {
  if (_result_0.$ === "ReuseState.JoinAdvice") {
    const _replacement_0 = _result_0["state"];
    return $Canonical$reuse_step$(_state_0, _replacement_0, {$: "Canonical.ReuseJoinAdvice"});
  } else if (_result_0.$ === "ReuseState.JoinPending") {
    const _replacement_1 = _result_0["state"];
    return $Canonical$reuse_step$(_state_0, _replacement_1, {$: "Canonical.ReuseJoinPending"});
  } else if (_result_0.$ === "ReuseState.JoinClaimed") {
    const _replacement_2 = _result_0["state"];
    return $Canonical$reuse_step$(_state_0, _replacement_2, {$: "Canonical.ReuseJoinClaimed"});
  } else if (_result_0.$ === "ReuseState.Cached") {
    const _replacement_3 = _result_0["state"];
    return $Canonical$reuse_step$(_state_0, _replacement_3, {$: "Canonical.ReuseCached"});
  } else {
    const _replacement_4 = _result_0["state"];
    return $Canonical$reuse_step$(_state_0, _replacement_4, {$: "Canonical.ReuseOwn"});
  }
}

function $ReuseState$route$(_state_0, _id_0, _live_advice_0) {
  const _claims_0 = _state_0["claims"];
  const __0 = _state_0["cache"];
  if (_live_advice_0) {
    return {$: "ReuseState.JoinAdvice", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": __0}};
  } else {
    return $ReuseState$route_claim$({$: "ReuseState.State", "claims": _claims_0, "cache": __0}, _id_0, ($ReuseState$find_claim$(_id_0, _claims_0)));
  }
}

function $CollectionState$reuse_state$(_state_0) {
  const _reuse_0 = _state_0["reuse"];
  return _reuse_0;
}

function $Canonical$collection_of$(_state_0) {
  const _collection_0 = _state_0["collection"];
  return _collection_0;
}

function $Canonical$reuse_decision_result$(_state_0, _result_0, _granted_0) {
  if (_result_0.$ === "ReuseState.Granted") {
    const _replacement_0 = _result_0["state"];
    return $Canonical$reuse_step$(_state_0, _replacement_0, _granted_0);
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseRefused"}, "tail": {$: "Nil"}}};
  }
}

function $ReuseState$claim$(_state_0, _id_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $Bool$pick$(($Maybe$is_none$(($ReuseState$find_claim$(_id_0, _claims_0)))), {$: "ReuseState.Granted", "state": {$: "ReuseState.State", "claims": {$: "Con", "head": {$: "ReuseState.Claim", "id": _id_0, "attached": false}, "tail": _claims_0}, "cache": _cache_0}}, {$: "ReuseState.Refused", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}});
}

function $ReuseState$attach$(_state_0, _id_0) {
  const _claims_0 = _state_0["claims"];
  const __0 = _state_0["cache"];
  return $ReuseState$attach_found$({$: "ReuseState.State", "claims": _claims_0, "cache": __0}, _id_0, ($ReuseState$find_claim$(_id_0, _claims_0)));
}

function $Canonical$reuse_step$(_state_0, _replacement_0, _command_0) {
  return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$(_state_0, ($CollectionState$with_reuse$(($Canonical$collection_of$(_state_0)), _replacement_0)))), "commands": {$: "Con", "head": _command_0, "tail": {$: "Nil"}}};
}

function $ReuseState$release$(_state_0, _id_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return {$: "ReuseState.State", "claims": ($ReuseState$without_claim$(_id_0, _claims_0)), "cache": _cache_0};
}

function $ReuseState$touch$(_state_0, _id_0) {
  return $ReuseState$route_cache_only$(_state_0, _id_0);
}

function $Canonical$cache_plan_result$(_state_0, _result_0) {
  if (_result_0.$ === "ReuseState.Already") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CacheAlready"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "ReuseState.Reject") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CacheRejected"}, "tail": {$: "Nil"}}};
  } else {
    const _replacement_0 = _result_0["state"];
    const _ids_0 = _result_0["evicted"];
    return $Canonical$reuse_step$(_state_0, _replacement_0, {$: "Canonical.CachePrepared", "evicted": _ids_0});
  }
}

function $ReuseState$prepare$(_state_0, _id_0, _incoming_0, _entry_limit_0, _byte_limit_0) {
  const __0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $ReuseState$prepare_decision$({$: "ReuseState.State", "claims": __0, "cache": _cache_0}, _incoming_0, _entry_limit_0, _byte_limit_0, ($ReuseState$find_entry$(_id_0, _cache_0)));
}

function $Canonical$cache_commit$(_state_0, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0) {
  const _t_0 = _state_0["ledger"];
  const __0 = _t_0["limits"];
  const __1 = _t_0["next_id"];
  const _charges_0 = _t_0["charges"];
  const __2 = _state_0["rounds"];
  const __3 = _state_0["work"];
  const __4 = _state_0["next_round"];
  const __5 = _state_0["next_operation"];
  const __6 = _state_0["admissions"];
  const __7 = _state_0["dispatch"];
  const __8 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$cache_commit_checked$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": __7, "collection": __8, "history": _history_0}, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0, ($Canonical$cache_charge_valid$(($Ledger$find$(_reservation_0, _charges_0)), _partition_0, _bytes_0)));
}

function $Canonical$cache_discard_result$(_state_0, _result_0) {
  const _replacement_0 = _result_0["state"];
  const _ids_0 = _result_0["ids"];
  return $Canonical$reuse_step$(_state_0, _replacement_0, {$: "Canonical.CacheDiscarded", "ids": _ids_0});
}

function $ReuseState$discard$(_state_0, _partition_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $ReuseState$discard_with_claims$(_claims_0, ($ReuseState$discard_partition$(_cache_0, _partition_0)));
}

function $ReuseState$clear$(_state_0) {
  const _cache_0 = _state_0["cache"];
  return {$: "ReuseState.Discarded", "state": ($ReuseState$initial$()), "ids": ($ReuseState$entry_ids$(_cache_0))};
}

function $Canonical$notice_advance_result$(_state_0, _result_0) {
  if (_result_0.$ === "NoticeState.Suppressed") {
    const _replacement_0 = _result_0["state"];
    const _count_0 = _result_0["count"];
    return $Canonical$notice_step$(_state_0, _replacement_0, {$: "Canonical.NoticeSuppressed", "count": _count_0});
  } else if (_result_0.$ === "NoticeState.RejectedFull") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRejectedFull"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "NoticeState.CreateKey") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeCreateKey"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "NoticeState.CreatePending") {
    const _replacement_1 = _result_0["state"];
    const _count_1 = _result_0["count"];
    return $Canonical$notice_step$(_state_0, _replacement_1, {$: "Canonical.NoticeCreatePending", "count": _count_1});
  } else if (_result_0.$ === "NoticeState.MergePending") {
    const _replacement_2 = _result_0["state"];
    const _count_2 = _result_0["count"];
    return $Canonical$notice_step$(_state_0, _replacement_2, {$: "Canonical.NoticeMergePending", "count": _count_2});
  } else if (_result_0.$ === "NoticeState.KeepLeased") {
    const _replacement_3 = _result_0["state"];
    return $Canonical$notice_step$(_state_0, _replacement_3, {$: "Canonical.NoticeKeepLeased"});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $NoticeState$advance$(_state_0, _key_0, _remaining_0, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0) {
  const _records_0 = _state_0["records"];
  return $NoticeState$advance_found$({$: "NoticeState.State", "records": _records_0}, ($NoticeState$find_record$(_key_0, _records_0)), _remaining_0, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0);
}

function $CollectionState$notice_state$(_state_0) {
  const _notices_0 = _state_0["notices"];
  return _notices_0;
}

function $Canonical$notice_commit$(_state_0, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0) {
  const _t_0 = _state_0["ledger"];
  const __0 = _t_0["limits"];
  const __1 = _t_0["next_id"];
  const _charges_0 = _t_0["charges"];
  const __2 = _state_0["rounds"];
  const __3 = _state_0["work"];
  const __4 = _state_0["next_round"];
  const __5 = _state_0["next_operation"];
  const __6 = _state_0["admissions"];
  const __7 = _state_0["dispatch"];
  const __8 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$notice_commit_checked$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": __7, "collection": __8, "history": _history_0}, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0, ($Canonical$notice_charge_valid$(($Ledger$find$(_reservation_0, _charges_0)), _partition_0)));
}

function $Canonical$notice_prune_result$(_state_0, _result_0) {
  if (_result_0.$ === "NoticeState.Pruned") {
    const _replacement_0 = _result_0["state"];
    const _drop_lease_0 = _result_0["drop_lease"];
    const _drop_pending_0 = _result_0["drop_pending"];
    const _drop_key_0 = _result_0["drop_key"];
    return $Canonical$notice_step$(_state_0, _replacement_0, {$: "Canonical.NoticePruned", "drop_lease": _drop_lease_0, "drop_pending": _drop_pending_0, "drop_key": _drop_key_0});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $NoticeState$prune$(_state_0, _key_0, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0) {
  const _records_0 = _state_0["records"];
  return $NoticeState$prune_found$({$: "NoticeState.State", "records": _records_0}, ($NoticeState$find_record$(_key_0, _records_0)), _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0);
}

function $Canonical$notice_step$(_state_0, _replacement_0, _command_0) {
  return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$(_state_0, ($CollectionState$with_notices$(($Canonical$collection_of$(_state_0)), _replacement_0)))), "commands": {$: "Con", "head": _command_0, "tail": {$: "Nil"}}};
}

function $NoticeState$drop$(_state_0, _key_0) {
  const _records_0 = _state_0["records"];
  return {$: "NoticeState.State", "records": ($NoticeState$without$(_key_0, _records_0))};
}

function $Canonical$notice_decision_result$(_state_0, _result_0, _granted_0) {
  if (_result_0.$ === "NoticeState.Granted") {
    const _replacement_0 = _result_0["state"];
    return $Canonical$notice_step$(_state_0, _replacement_0, _granted_0);
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $NoticeState$lease$(_state_0, _key_0, _leased_0) {
  const _records_0 = _state_0["records"];
  return $NoticeState$lease_found$({$: "NoticeState.State", "records": _records_0}, ($NoticeState$find_record$(_key_0, _records_0)), _leased_0);
}

function $NoticeState$clear_pending$(_state_0, _key_0) {
  const _records_0 = _state_0["records"];
  return $NoticeState$clear_pending_found$({$: "NoticeState.State", "records": _records_0}, ($NoticeState$find_record$(_key_0, _records_0)));
}

function $NoticeState$select$(_state_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0) {
  const _records_0 = _state_0["records"];
  return $NoticeState$pending_ids$(($NoticeState$collect_candidates$(_records_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0)));
}

function $Canonical$output_start$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$output_start_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$output_terminal$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$output_terminal_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$retire$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$retire_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$forget_admission$(_state_0, _partition_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$forget_admission_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, ($Canonical$find_admission$(_partition_0, _admissions_0)));
}

function $DeliveryState$initial$() {
  return {$: "DeliveryState.State", "slots": {$: "Nil"}, "counters": {$: "Nil"}, "submissions": ($SubmissionState$initial$())};
}

function $RevisionState$initial$() {
  return {$: "RevisionState.State", "entries": {$: "Nil"}, "next_generation": 1};
}

function $ReuseState$initial$() {
  return {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Nil"}};
}

function $NoticeState$initial$() {
  return {$: "NoticeState.State", "records": {$: "Nil"}};
}

function $Canonical$round_not_found$(_found_0) {
  if (_found_0.$ === "None") {
    return true;
  } else {
    return false;
  }
}

function $Canonical$find_round$(_partition_0, _rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _round_0 = _rounds_0["head"];
    const _rest_0 = _rounds_0["tail"];
    return $Bool$pick$(($Canonical$same_partition$(_partition_0, _round_0)), {$: "Some", "value": _round_0}, ($Canonical$find_round$(_partition_0, _rest_0)));
  }
}

function $Canonical$capacity_reserve_result$(_state_0, _partition_0, _bytes_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    const _id_0 = _result_0["id"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityGranted", "id": _id_0, "after": ($Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}};
  } else {
    const _ledger_1 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityRefused", "reason": ($Ledger$admission$(_ledger_1, _partition_0, _bytes_0)), "after": ($Canonical$capacity_view$(_ledger_1, _partition_0))}, "tail": {$: "Nil"}}};
  }
}

function $Ledger$reserve_for$(_state_0, _partition_0, _bytes_0, _purpose_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$reserve$check$(_limits_0, _next_id_0, _charges_0, _partition_0, _bytes_0, _purpose_0, ($Ledger$fits$(($Ledger$limits_for$(_purpose_0, _limits_0)), ($Ledger$total$(_charges_0)), ($Ledger$partition_usage$(_charges_0, _partition_0)), _bytes_0)));
}

function $Canonical$capacity_resize_found$(_state_0, _id_0, _bytes_0, _purpose_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "None") {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    return $Canonical$capacity_resize_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _partition_0, _bytes_0, ($Ledger$resize_for$(_ledger_0, _id_0, _bytes_0, _purpose_0)));
  }
}

function $Ledger$find$(_id_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["bytes"];
    const __2 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$find$pick$({$: "Ledger.Charge", "id": _current_0, "partition": __0, "bytes": __1, "purpose": __2}, ($Ledger$find$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Canonical$capacity_release_result$(_state_0, _id_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _id_0}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Ledger$release$(_state_0, _id_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$release$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Canonical$capacity_replace_found$(_state_0, _id_0, _sizes_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    const _t_1 = _t_0["purpose"];
    if (_t_1.$ === "Ledger.Preparation") {
      return $Canonical$capacity_replace_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _partition_0, _sizes_0, ($Ledger$release$(_ledger_0, _id_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$issue_permit_gate$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0, _gate_0) {
  if (_gate_0.$ === "Admission.PermitDenied") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.ProspectiveDenied"}};
  } else if (_gate_0.$ === "Admission.PermitLate") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.StaleInvocation"}}};
  } else if (_gate_0.$ === "Admission.PermitInvalidClock") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.InvalidClock"}}};
  } else {
    return $Canonical$issue_permit_capacity$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0);
  }
}

function $Admission$prospective_gate$(_facts_0, _started_0, _now_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  const _hook_window_0 = _facts_0["hook_window"];
  const _started_upper_0 = _facts_0["started_upper"];
  const _now_lower_0 = _facts_0["now_lower"];
  const _advicee_permit_limit_0 = _facts_0["advicee_permit_limit"];
  const _resident_permit_limit_0 = _facts_0["resident_permit_limit"];
  const _x_0 = nat_chk(_started_0 + _hook_window_0);
  return $Admission$prospective_gate_window$({$: "Admission.ProspectiveFacts", "clock_valid": _clock_valid_0, "hook_window": _hook_window_0, "started_upper": _started_upper_0, "now_lower": _now_lower_0, "advicee_permit_limit": _advicee_permit_limit_0, "resident_permit_limit": _resident_permit_limit_0}, (_now_0 < _x_0), ($Nat$is_le$(_started_upper_0, _now_lower_0)));
}

function $Canonical$checked_completed_edit$(_state_0, _tool_0, _result_0) {
  if (_result_0.$ === "EditHistory.Absent") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CompletedEditAbsent"}, "tail": {$: "Nil"}}};
  } else {
    const _reason_0 = _result_0["reason"];
    const _report_0 = _result_0["report"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_history$(_state_0, ($EditHistory$mark_reported$(_tool_0, ($Canonical$history_of$(_state_0)))))), "commands": {$: "Con", "head": {$: "Canonical.CompletedEditSeen", "reason": _reason_0, "report": _report_0}, "tail": {$: "Nil"}}};
  }
}

function $EditHistory$lookup$(_tool_0, _state_0) {
  const _entries_0 = _state_0["entries"];
  return $EditHistory$lookup_entries$(_tool_0, _entries_0);
}

function $Canonical$history_of$(_state_0) {
  const _history_0 = _state_0["history"];
  return _history_0;
}

function $Canonical$remember_completed_checked$(_state_0, _tool_0, _reason_0, _lookup_0) {
  if (_lookup_0.$ === "EditHistory.Absent") {
    return $Canonical$remembered_completed_edit$(_state_0, ($EditHistory$record$(_tool_0, _reason_0, ($Canonical$history_of$(_state_0)))));
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CompletedEditRemembered", "evicted": {$: "None"}}, "tail": {$: "Nil"}}};
  }
}

function $Canonical$quiet_round_found$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  } else {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Canonical$quiet_round_current$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, _current_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  }
}

function $Canonical$quiet_round_reset_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  } else {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), {$: "Canonical.Advanced", "state": ($Canonical$with_quiet_round$(_state_0, _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.QuietRoundResetRecorded"}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  }
}

function $Canonical$consume_result$(_state_0, _partition_0, _lifetime_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["round"];
    if (_t_0.$ === "Some") {
      const _round_0 = _t_0["value"];
      return $Canonical$consume_admitted$(_state_0, _partition_0, _lifetime_0, _admission_0, _round_0);
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.InconsistentLedger"}};
    }
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": _reason_0}};
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

function $Canonical$current_admission$(_state_0, _partition_0, _lifetime_0) {
  const _admissions_0 = _state_0["admissions"];
  return $Canonical$current_admission_found$(_partition_0, _lifetime_0, ($Canonical$find_admission$(_partition_0, _admissions_0)));
}

function $Canonical$permit_result$(_state_0, _partition_0, _result_0, _command_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": _command_0, "tail": {$: "Nil"}}};
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": _reason_0}};
  }
}

function $Canonical$expire_permit_checked$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0, _admission_0) {
  const __0 = _admission_0["partition"];
  const _owner_lifetime_0 = _admission_0["lifetime"];
  const __1 = _admission_0["round"];
  const __2 = _admission_0["active"];
  const __3 = _admission_0["closed_at"];
  const __4 = _admission_0["next_token"];
  const __5 = _admission_0["permits"];
  return $Bool$pick$(($Nat$is_eq$(_owner_lifetime_0, _lifetime_0)), ($Canonical$expire_permit_result$(_state_0, _partition_0, ($Admission$expire$({$: "Admission.AdmissionState", "partition": __0, "lifetime": _owner_lifetime_0, "round": __1, "active": __2, "closed_at": __3, "next_token": __4, "permits": __5}, _token_0, _deadline_reached_0)))), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.WrongLifetime"}}});
}

function $Canonical$close_permit_checked$(_state_0, _partition_0, _lifetime_0, _expected_0, _at_0, _admission_0) {
  const __0 = _admission_0["partition"];
  const _owner_lifetime_0 = _admission_0["lifetime"];
  const _round_0 = _admission_0["round"];
  const _active_0 = _admission_0["active"];
  const __1 = _admission_0["closed_at"];
  const __2 = _admission_0["next_token"];
  const __3 = _admission_0["permits"];
  return $Bool$pick$(($Nat$is_eq$(_owner_lifetime_0, _lifetime_0)), ($Bool$pick$(($Nat$is_eq$(_expected_0, ($Admission$candidate_round$(_round_0, _active_0)))), ($Canonical$close_permit_result$(_state_0, _partition_0, ($Admission$step$({$: "Admission.AdmissionState", "partition": __0, "lifetime": _owner_lifetime_0, "round": _round_0, "active": _active_0, "closed_at": __1, "next_token": __2, "permits": __3}, _partition_0, _lifetime_0, {$: "Admission.CloseRound", "at": _at_0})))), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}})), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.WrongLifetime"}}});
}

function $Canonical$open_found$(_state_0, _partition_0, _lifetime_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  } else {
    const _x_0 = ($List$length$(_rounds_0));
    return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Bool$and$(($Nat$is_gt$(_lifetime_0, 0)), (_x_0 < 64))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _next_round_0, "waiting": false, "deciding": false, "write": {$: "None"}, "uncertain": false, "quiet_since": {$: "None"}}, "tail": _rounds_0}, "work": _work_0, "next_round": nat_chk(_next_round_0 + 1), "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.RoundStarted", "id": _next_round_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": ($Bool$pick$(($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Nat$is_gt$(_lifetime_0, 0)))), {$: "Canonical.RoundLimit"}, {$: "Canonical.InvalidIdentity"}))});
  }
}

function $Canonical$admit_observation_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($Canonical$is_deciding$(_current_0)))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _next_operation_0, "charge": 0, "kind": {$: "Canonical.AwaitingSourceRead"}, "parent": 0}, "tail": _work_0}, "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationAdmitted", "id": _next_operation_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$observation_started_found$(_state_0, _operation_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.AwaitingSourceRead") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$replace_work_kind$(_operation_0, {$: "Canonical.SourceReading"}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationStarted"}, "tail": {$: "Nil"}}};
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Canonical$work_matches$(_partition_0, _lifetime_0, _round_0, _operation_0, _item_0)), {$: "Some", "value": _item_0}, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _rest_0)));
  }
}

function $Canonical$observation_completed_found$(_state_0, _operation_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.SourceReading") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationCompleted"}, "tail": {$: "Nil"}}};
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $Canonical$interrupt_observation_found$(_state_0, _operation_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.AwaitingSourceRead") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationInterrupted"}, "tail": {$: "Nil"}}};
      } else if (_t_2.$ === "Canonical.SourceReading") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationInterrupted"}, "tail": {$: "Nil"}}};
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $Canonical$begin_found$(_state_0, _partition_0, _lifetime_0, _round_0, _bytes_0, _parent_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$and$(($Bool$not$(($Canonical$is_deciding$(_current_0)))), ($Nat$is_gt$(_bytes_0, 0)))))), ($Canonical$begin_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _parent_0, ($Ledger$reserve_for$(_ledger_0, _partition_0, _bytes_0, {$: "Ledger.Preparation"})))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$begin_observed_found$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _bytes_0, _found_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.SourceReading") {
        return $Canonical$begin_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _bytes_0, _observation_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $Canonical$prepared_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0, _found_round_0, _found_work_0) {
  if (_found_round_0.$ === "Some") {
    const _current_0 = _found_round_0["value"];
    if (_found_work_0.$ === "Some") {
      const _t_0 = _found_work_0["value"];
      const _charge_0 = _t_0["charge"];
      const _t_1 = _t_0["kind"];
      if (_t_1.$ === "Canonical.Preparing") {
        const _parent_0 = _t_0["parent"];
        return $Bool$pick$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Canonical$prepared_release$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
      } else {
        return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$start_review_found$(_state_0, _operation_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ReviewStarted"}, "tail": {$: "Nil"}}};
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $Canonical$request_ready_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _ready_0, _found_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const __5 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      return $Bool$pick$(_ready_0, ($Canonical$request_ready_reserved$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _next_operation_0, ($Dispatch$reserve_request$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _next_operation_0)))), ($Canonical$append_review_disposition$(($Canonical$reviewed$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Unavailable"})), {$: "Canonical.JevRequestUnavailable"})));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $Canonical$request_facts_ready$(_root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0) {
  return $Bool$and$(_root_valid_0, ($Bool$and$(_configuration_valid_0, ($Bool$and$(_credential_ready_0, ($Bool$and$(_selected_0, ($Bool$and$(_current_work_0, _physical_available_0)))))))));
}

function $Canonical$request_update_result$(_state_0, _result_0, _command_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const __0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Dispatch.RequestAccepted") {
    const _dispatch_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": _command_0, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$request_update$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _start_0, _interrupt_0, _settle_0) {
  const __0 = _state_0["queued"];
  const __1 = _state_0["running"];
  const __2 = _state_0["next_sequence"];
  const __3 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  return $Dispatch$request_update_found$({$: "Dispatch.State", "queued": __0, "running": __1, "next_sequence": __2, "closed": __3, "requests": _requests_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _start_0, _interrupt_0, _settle_0, ($Dispatch$request_phase$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)));
}

function $Canonical$request_settled_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _outcome_0, _current_work_0, _found_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _started_0 = _t_0["started"];
    const _interrupted_0 = _t_0["interrupted"];
    return $Bool$pick$(($Canonical$request_outcome_valid$(_outcome_0, _started_0, _interrupted_0)), ($Canonical$request_settled_released$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, ($Dispatch$request_update$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, false, false, true)))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$request_phase$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Dispatch$request_matches$(_item_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), {$: "Some", "value": _item_0}, ($Dispatch$request_phase$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)));
  }
}

function $Canonical$reviewed_found$(_state_0, _operation_0, _outcome_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      const _parent_0 = _t_0["parent"];
      return $Canonical$reviewed_decide$(_state_0, _operation_0, _charge_0, _parent_0, _outcome_0);
    } else if (_t_1.$ === "Canonical.AtJev") {
      const _parent_1 = _t_0["parent"];
      return $Canonical$reviewed_decide$(_state_0, _operation_0, _charge_0, _parent_1, _outcome_0);
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$retire_review_found$(_state_0, _operation_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.PendingFinding") {
      return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Discarded"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$cancel_review_found$(_state_0, _operation_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _kind_0 = _t_0["kind"];
    return $Canonical$cancel_review_kind$(_state_0, _operation_0, _charge_0, _kind_0);
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$review_observed_choice$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _choice_0) {
  if (_choice_0.$ === "Work.RetainFinding") {
    return $Canonical$append_review_disposition$(($Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0)), {$: "Canonical.RetainFinding"});
  } else if (_choice_0.$ === "Work.RetireStaleFinding") {
    return $Canonical$append_review_disposition$(($Canonical$reviewed_stale$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0)), {$: "Canonical.RetireStaleFinding"});
  } else if (_choice_0.$ === "Work.SettleClear") {
    return $Canonical$append_review_disposition$(($Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0)), {$: "Canonical.SettleClear"});
  } else {
    return $Canonical$append_review_disposition$(($Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0)), {$: "Canonical.SettleStaleClear"});
  }
}

function $Work$evaluated_disposition$(_has_findings_0, _current_work_0) {
  return $Bool$pick$(_has_findings_0, ($Bool$pick$(_current_work_0, {$: "Work.RetainFinding"}, {$: "Work.RetireStaleFinding"})), ($Bool$pick$(_current_work_0, {$: "Work.SettleClear"}, {$: "Work.SettleStaleClear"})));
}

function $Canonical$is_finding$(_outcome_0) {
  if (_outcome_0.$ === "Canonical.Finding") {
    return true;
  } else {
    return false;
  }
}

function $Canonical$finding_count_found$(_state_0, _operation_0, _count_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.PendingFinding") {
      return $Bool$pick$(($Nat$is_gt$(_count_0, 0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$replace_work_kind$(_operation_0, {$: "Canonical.PendingFinding", "count": _count_0}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.FindingCountRecorded"}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}});
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $Canonical$work_dispatchable$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.AwaitingSourceRead") {
      return true;
    } else if (_t_1.$ === "Canonical.Reviewing") {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $Canonical$dispatch_result$(_state_0, _result_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const __0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Dispatch.Advanced") {
    const _dispatch_0 = _result_0["state"];
    const _commands_0 = _result_0["commands"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": ($Canonical$dispatch_commands$(_commands_0))};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$enqueue$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _preparation_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  const _x_0 = ($Dispatch$known$({$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, _partition_0, _lifetime_0, _round_0, _operation_0));
  return $Bool$pick$((_closed_0 || _x_0), {$: "Dispatch.Denied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}}, ($Dispatch$pump_available$({$: "Dispatch.State", "queued": ($List$append$(_queued_0, {$: "Con", "head": {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _next_sequence_0, "cancelled": false, "preparation": _preparation_0}, "tail": {$: "Nil"}})), "running": _running_0, "next_sequence": nat_chk(_next_sequence_0 + 1), "closed": _closed_0, "requests": _requests_0})));
}

function $Canonical$dispatch_preparation$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.AwaitingSourceRead") {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $Dispatch$settle$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  return $Bool$pick$(($Dispatch$contains$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0)), ($Dispatch$pump_available$({$: "Dispatch.State", "queued": _queued_0, "running": ($Dispatch$remove_entry$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0)), "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0})), {$: "Dispatch.Denied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}});
}

function $Dispatch$discard$(_state_0, _ids_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const __0 = _state_0["next_sequence"];
  const __1 = _state_0["closed"];
  const __2 = _state_0["requests"];
  return $Dispatch$discarded_result$({$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": __0, "closed": __1, "requests": __2}, ($Dispatch$filter_queued$(_queued_0, _ids_0)), ($Dispatch$filter_running$(_running_0, _ids_0)));
}

function $Canonical$dispatch_scope_result$(_state_0, _result_0) {
  if (_result_0.$ === "Retention.NamedOnly") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DiscardNamedOnly"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DiscardAllUnfinished"}, "tail": {$: "Nil"}}};
  }
}

function $Retention$discard_scope$(_named_count_0, _cancelled_count_0, _has_unnamed_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_named_count_0, _cancelled_count_0)), ($Bool$not$(_has_unnamed_0)))), {$: "Retention.NamedOnly"}, {$: "Retention.AllUnfinished"});
}

function $Dispatch$close$(_state_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _requests_0 = _state_0["requests"];
  return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": {$: "Nil"}, "running": _running_0, "next_sequence": _next_sequence_0, "closed": true, "requests": _requests_0}, "commands": ($Dispatch$discard_all$(_queued_0))};
}

function $Canonical$prepared_offer_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Work.SkipPrepared") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PreparedSkipped"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Work.AdmitPrepared") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PreparedAdmitted"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PreparedCapacityRefused"}, "tail": {$: "Nil"}}};
  }
}

function $Work$prepared_offer$(_ready_0, _within_frame_0) {
  return $Bool$pick$(($Bool$not$(_ready_0)), {$: "Work.SkipPrepared"}, ($Bool$pick$(_within_frame_0, {$: "Work.AdmitPrepared"}, {$: "Work.RejectPreparedCapacity"})));
}

function $Canonical$empty_prepared_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Work.FailEmptyLost") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.EmptyLost"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.EmptyAccepted"}, "tail": {$: "Nil"}}};
  }
}

function $Work$empty_prepared$(_ready_count_0, _has_non_skipped_0, _authority_bound_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_ready_count_0, 0)), ($Bool$and$(_has_non_skipped_0, _authority_bound_0)))), {$: "Work.FailEmptyLost"}, {$: "Work.NoEmptyFailure"});
}

function $Canonical$review_failure_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Work.BackendUnavailable") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FailureBackend"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Work.CredentialUnavailable") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FailureCredential"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Work.LostUnavailable") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FailureLost"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FailureNone"}, "tail": {$: "Nil"}}};
  }
}

function $Work$failure_disposition$(_backend_or_timeout_0, _credential_0, _missing_0) {
  return $Bool$pick$(_backend_or_timeout_0, {$: "Work.BackendUnavailable"}, ($Bool$pick$(_credential_0, {$: "Work.CredentialUnavailable"}, ($Bool$pick$(_missing_0, {$: "Work.LostUnavailable"}, {$: "Work.NoFailure"})))));
}

function $Canonical$stop_found$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($Canonical$is_deciding$(_current_0)))))), ($Canonical$match_pending$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _current_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$stop_group_checked$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _deadline_0, _extra_pending_0, _continuations_0, _found_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  const __3 = _state_0["admissions"];
  const __4 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    const _x_0 = ($Canonical$scoped_pending$(_work_0, _lifetime_0, _scopes_0));
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_group_0, _lifetime_0, _round_0, _current_0)), ($Bool$and$(($Bool$not$(($Canonical$is_deciding$(_current_0)))), ($Canonical$valid_stop_scopes$(_rounds_0, _lifetime_0, _scopes_0)))))), ($Bool$pick$(($Bool$and$(($Bool$not$(_deadline_0)), (_extra_pending_0 || _x_0))), ($Canonical$stop_group_wait$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0)), ($Canonical$stop_group_ready$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, _continuations_0)))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$stop_group_end_checked$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _found_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Canonical$stop_group_end_valid$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, ($Bool$and$(($Canonical$same_round$(_group_0, _lifetime_0, _round_0, _current_0)), ($Canonical$valid_end_scopes$(_rounds_0, _lifetime_0, _scopes_0)))));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$collection_decision$(_state_0, _decision_0, _accepted_0, _refused_0) {
  if (_decision_0.$ === "CollectionState.Accepted") {
    const _collection_0 = _decision_0["state"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$(_state_0, _collection_0)), "commands": {$: "Con", "head": _accepted_0, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": _refused_0, "tail": {$: "Nil"}}};
  }
}

function $CollectionState$mark_ready$(_state_0, _advice_0, _eligible_now_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  const _x_0 = ($CollectionState$contains$(_advice_0, _ready_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_advice_0, 0)), (_eligible_now_0 || _x_0))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": ($Bool$pick$(($CollectionState$contains$(_advice_0, _ready_0)), _ready_0, {$: "Con", "head": _advice_0, "tail": _ready_0})), "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $Canonical$finding_for_observation$($0, $1, $2, $3, $4, $5) {
  for (;;) {
    {
      const _items_0 = $0;
      const _partition_0 = $1;
      const _lifetime_0 = $2;
      const _round_0 = $3;
      const _observation_0 = $4;
      const _advice_0 = $5;
      if (_items_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _items_0["head"];
        const _owner_0 = _t_0["partition"];
        const _generation_0 = _t_0["lifetime"];
        const _current_0 = _t_0["round"];
        const _operation_0 = _t_0["operation"];
        const _t_1 = _t_0["kind"];
        if (_t_1.$ === "Canonical.PendingFinding") {
          const _parent_0 = _t_0["parent"];
          const _rest_0 = _items_0["tail"];
          const _x_0 = ($Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Nat$is_eq$(_current_0, _round_0)), ($Bool$and$(($Nat$is_eq$(_operation_0, _advice_0)), ($Nat$is_eq$(_parent_0, _observation_0))))))))));
          const _x_1 = ($Canonical$finding_for_observation$(_rest_0, _partition_0, _lifetime_0, _round_0, _observation_0, _advice_0));
          return (_x_0 || _x_1);
        } else {
          const _rest_1 = _items_0["tail"];
          $0 = _rest_1;
          $1 = _partition_0;
          $2 = _lifetime_0;
          $3 = _round_0;
          $4 = _observation_0;
          $5 = _advice_0;
          continue;
        }
      }
    }
  }
}

function $Collection$eligible$(_stop_deciding_0, _edit_complete_0) {
  return (_stop_deciding_0 || _edit_complete_0);
}

function $Canonical$deciding_round$(_found_0, _group_0, _lifetime_0, _round_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["lifetime"];
    const __2 = _t_0["id"];
    const __3 = _t_0["waiting"];
    const _deciding_0 = _t_0["deciding"];
    const __4 = _t_0["write"];
    const __5 = _t_0["uncertain"];
    const _quiet_since_0 = _t_0["quiet_since"];
    return $Bool$and$(_deciding_0, ($Canonical$same_round$(_group_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": __3, "deciding": _deciding_0, "write": __4, "uncertain": __5, "quiet_since": _quiet_since_0})));
  } else {
    return false;
  }
}

function $Canonical$unfinished_for_observation$($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _items_0 = $0;
      const _partition_0 = $1;
      const _lifetime_0 = $2;
      const _round_0 = $3;
      const _observation_0 = $4;
      if (_items_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _items_0["head"];
        const __0 = _t_0["partition"];
        const __1 = _t_0["lifetime"];
        const __2 = _t_0["round"];
        const __3 = _t_0["operation"];
        const _t_1 = _t_0["kind"];
        if (_t_1.$ === "Canonical.PendingFinding") {
          const _rest_0 = _items_0["tail"];
          $0 = _rest_0;
          $1 = _partition_0;
          $2 = _lifetime_0;
          $3 = _round_0;
          $4 = _observation_0;
          continue;
        } else {
          const __7 = _t_0["parent"];
          const _rest_1 = _items_0["tail"];
          const _x_0 = ($Nat$is_eq$(__3, _observation_0));
          const _x_1 = ($Nat$is_eq$(__7, _observation_0));
          const _x_2 = ($Bool$and$(($Nat$is_eq$(__0, _partition_0)), ($Bool$and$(($Nat$is_eq$(__1, _lifetime_0)), ($Bool$and$(($Nat$is_eq$(__2, _round_0)), (_x_0 || _x_1)))))));
          const _x_3 = ($Canonical$unfinished_for_observation$(_rest_1, _partition_0, _lifetime_0, _round_0, _observation_0));
          return (_x_2 || _x_3);
        }
      }
    }
  }
}

function $Delivery$advice_candidate$(_same_partition_0, _unleased_0, _has_unsuppressed_finding_0, _authority_owns_0) {
  return $Bool$and$(_same_partition_0, ($Bool$and$(_unleased_0, ($Bool$and$(_has_unsuppressed_finding_0, _authority_owns_0)))));
}

function $Collection$expired$(_elapsed_0, _lifetime_0) {
  return $Nat$is_ge$(_elapsed_0, _lifetime_0);
}

function $Handoff$fits_batch$(_items_0, _bytes_0) {
  return $Bool$and$(($Nat$is_gt$(_items_0, 0)), ($Nat$is_le$(_bytes_0, 10240)));
}

function $Canonical$collection_finding_result$(_state_0, _current_0, _oversized_0, _fits_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$not$(_current_0)), {$: "Canonical.CollectionFindingExpired"}, ($Bool$pick$(_oversized_0, {$: "Canonical.CollectionFindingLimited"}, ($Bool$pick$(_fits_0, {$: "Canonical.CollectionFindingSelected"}, {$: "Canonical.CollectionFindingRetained"})))))), "tail": {$: "Nil"}}};
}

function $Handoff$current$(_advice_0, _partition_0, _round_0) {
  const _source_partition_0 = _advice_0["partition"];
  const _source_round_0 = _advice_0["round"];
  const _source_snapshot_0 = _advice_0["snapshot"];
  const _current_snapshot_0 = _advice_0["current_snapshot"];
  const _source_credential_0 = _advice_0["credential"];
  const _current_credential_0 = _advice_0["current_credential"];
  const _age_ms_0 = _advice_0["age_ms"];
  const _ready_0 = _advice_0["collection_ready"];
  return $Bool$and$(($Nat$is_eq$(_source_partition_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_source_round_0, _round_0)), ($Bool$and$(($Nat$is_eq$(_source_snapshot_0, _current_snapshot_0)), ($Bool$and$(($Nat$is_eq$(_source_credential_0, _current_credential_0)), ($Bool$and$((_age_ms_0 < 600000), _ready_0)))))))));
}

function $CollectionState$reserve$(_state_0, _advice_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($CollectionState$contains$(_advice_0, _ready_0)), ($Bool$not$(($CollectionState$lease_exists$(_advice_0, _leases_0)))))))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": {$: "Con", "head": {$: "CollectionState.Lease", "advice": _advice_0, "owner": _token_0}, "tail": _leases_0}, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $CollectionState$release$(_state_0, _advice_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $Bool$pick$(($CollectionState$lease_owned$(_advice_0, _token_0, _leases_0)), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": ($CollectionState$remove_lease$(_advice_0, _token_0, _leases_0)), "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $Canonical$collection_lease_checked$(_state_0, _advice_0, _token_0, _action_0) {
  if (_action_0.$ === "Delivery.DropLease") {
    return $Canonical$collection_release$(_state_0, _advice_0, _token_0);
  } else {
    return $Canonical$collection_lease_keep$(_state_0, _advice_0, _token_0);
  }
}

function $Delivery$collection_lease$(_has_lease_0, _expired_0, _stop_collector_0, _same_group_0, _background_reofferable_0) {
  const _x_0 = ($Bool$and$(_stop_collector_0, ($Bool$and$(_same_group_0, _background_reofferable_0))));
  return $Bool$pick$(($Bool$and$(_has_lease_0, (_expired_0 || _x_0))), {$: "Delivery.DropLease"}, {$: "Delivery.KeepLease"});
}

function $CollectionState$protected_advice$(_state_0, _advice_0) {
  const _delivery_0 = _state_0["delivery"];
  return $DeliveryState$protected_advice$(_delivery_0, _advice_0);
}

function $Canonical$with_collection$(_state_0, _replacement_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _replacement_0, "history": _history_0};
}

function $CollectionState$retire$(_state_0, _advice_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": ($CollectionState$remove_ready$(_advice_0, _ready_0)), "leases": ($CollectionState$remove_advice_lease$(_advice_0, _leases_0)), "claims": _claims_0, "delivery": ($DeliveryState$submission_forget$(_delivery_0, _advice_0)), "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $CollectionState$claim$(_state_0, _group_0, _token_0, _active_0, _capacity_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  const _x_0 = ($List$length$(_claims_0));
  return $Bool$pick$(($Bool$and$(_active_0, ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($CollectionState$claim_exists$(_group_0, _claims_0)))), (_x_0 < _capacity_0))))))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": {$: "Con", "head": {$: "CollectionState.Claim", "group": _group_0, "owner": _token_0}, "tail": _claims_0}, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $CollectionState$release_claim$(_state_0, _group_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $Bool$pick$(($CollectionState$claim_owned$(_group_0, _token_0, _claims_0)), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": ($CollectionState$remove_claim$(_group_0, _token_0, _claims_0)), "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $CollectionState$expire_claim$(_state_0, _group_0, _token_0, _elapsed_0, _lifetime_0) {
  return $Bool$pick$(($Collection$expired$(_elapsed_0, _lifetime_0)), ($CollectionState$release_claim$(_state_0, _group_0, _token_0)), {$: "CollectionState.Refused", "state": _state_0});
}

function $List$length$(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk(($List$length$(_t_0)) + 1);
  }
}

function $Canonical$selected_pending$(_selected_0, _work_0) {
  return $Canonical$selected_valid$(_selected_0, _selected_0, _work_0);
}

function $Canonical$finish_reserve_decision$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$finish_reserve$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.FinishReserved"}, {$: "Canonical.FinishRefused"});
}

function $CollectionState$finish_release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$release$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0)));
}

function $CollectionState$submission_ready$(_state_0, _group_0, _round_0, _token_0, _selected_0) {
  const _delivery_0 = _state_0["delivery"];
  return $DeliveryState$submission_ready$(_delivery_0, _group_0, _round_0, _token_0, _selected_0);
}

function $CollectionState$finish_authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$authorize$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)));
}

function $Canonical$finish_terminal_result$(_state_0, _outcome_0, _decision_0) {
  if (_decision_0.$ === "CollectionState.Accepted") {
    const _collection_0 = _decision_0["state"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$(_state_0, _collection_0)), "commands": {$: "Con", "head": {$: "Canonical.FinishRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FinishRefused"}, "tail": {$: "Nil"}}};
  }
}

function $CollectionState$finish_terminal$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$terminal$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0)));
}

function $CollectionState$finish_end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$end$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0)));
}

function $CollectionState$consume_continuation$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$consume$(_delivery_0, _group_0, _round_0)));
}

function $Canonical$submission_round_found$(_group_0, _round_0, _found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _owner_0 = _t_0["partition"];
    const _current_0 = _t_0["id"];
    return $Bool$and$(($Nat$is_eq$(_group_0, _owner_0)), ($Nat$is_eq$(_round_0, _current_0)));
  }
}

function $Canonical$submission_stop_reservation$(_surface_0, _authorize_now_0, _reserved_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return (_authorize_now_0 || _reserved_0);
  } else {
    return true;
  }
}

function $CollectionState$submission_reservation$(_state_0, _group_0, _round_0, _token_0) {
  const _delivery_0 = _state_0["delivery"];
  return $DeliveryState$submission_reservation$(_delivery_0, _group_0, _round_0, _token_0);
}

function $CollectionState$submission_begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$submission_begin$(_delivery_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0)));
}

function $CollectionState$submission_authorize$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$submission_authorize$(_delivery_0, _advice_0, _token_0)));
}

function $CollectionState$submission_terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$submission_terminal$(_delivery_0, _advice_0, _token_0, _certain_0)));
}

function $CollectionState$submission_release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$submission_release$(_delivery_0, _advice_0, _token_0)));
}

function $CollectionState$submission_forget$(_state_0, _advice_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": ($DeliveryState$submission_forget$(_delivery_0, _advice_0)), "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $CollectionState$submission_suppresses$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const _delivery_0 = _state_0["delivery"];
  return $DeliveryState$submission_suppresses$(_delivery_0, _advice_0, _fingerprint_0, _round_0, _surface_0);
}

function $CollectionState$submission_reofferable$(_state_0, _advice_0, _token_0) {
  const _delivery_0 = _state_0["delivery"];
  return $DeliveryState$submission_reofferable$(_delivery_0, _advice_0, _token_0);
}

function $CollectionState$submission_expired$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const _delivery_0 = _state_0["delivery"];
  return $DeliveryState$submission_expired$(_delivery_0, _advice_0, _token_0, _elapsed_0, _lifetime_0);
}

function $Canonical$revision_register_result$(_state_0, _result_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "RevisionState.Reused") {
    const _replacement_0 = _result_0["state"];
    const _generation_0 = _result_0["generation"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$revision_replace$(_collection_0, _replacement_0)))), "commands": {$: "Con", "head": {$: "Canonical.RevisionReused", "generation": _generation_0}, "tail": {$: "Nil"}}};
  } else {
    const _replacement_1 = _result_0["state"];
    const _generation_1 = _result_0["generation"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($CollectionState$revision_replace$(_collection_0, _replacement_1)))), "commands": {$: "Con", "head": {$: "Canonical.RevisionReplaced", "generation": _generation_1}, "tail": {$: "Nil"}}};
  }
}

function $CollectionState$revision_register$(_state_0, _subject_0, _input_0, _add_member_0) {
  const _revision_0 = _state_0["revision"];
  return $RevisionState$register$(_revision_0, _subject_0, _input_0, _add_member_0);
}

function $CollectionState$revision_release$(_state_0, _subject_0, _generation_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": ($RevisionState$release$(_revision_0, _subject_0, _generation_0)), "reuse": _reuse_0, "notices": _notices_0};
}

function $CollectionState$revision_current$(_state_0, _subject_0, _input_0, _generation_0) {
  const _revision_0 = _state_0["revision"];
  return $RevisionState$current$(_revision_0, _subject_0, _input_0, _generation_0);
}

function $CollectionState$revision_superseded$(_state_0, _subject_0, _candidate_subject_0, _generation_0) {
  const _revision_0 = _state_0["revision"];
  return $RevisionState$superseded$(_revision_0, _subject_0, _candidate_subject_0, _generation_0);
}

function $CollectionState$revision_generation$(_state_0, _subject_0) {
  const _revision_0 = _state_0["revision"];
  return $RevisionState$generation$(_revision_0, _subject_0);
}

function $CollectionState$revision_count$(_state_0) {
  const _revision_0 = _state_0["revision"];
  return $RevisionState$count$(_revision_0);
}

function $Reuse$joined$route$(_state_0, _has_revision_0, _has_advice_id_0) {
  if (_state_0.$ === "Reuse.JoinedUnavailable") {
    return {$: "Reuse.SetJoinedUnavailable"};
  } else if (_state_0.$ === "Reuse.JoinedPending") {
    return $Bool$pick$(_has_revision_0, {$: "Reuse.KeepJoined"}, {$: "Reuse.SetJoinedLost"});
  } else if (_state_0.$ === "Reuse.JoinedClear") {
    return $Bool$pick$(_has_revision_0, {$: "Reuse.SetJoinedClear"}, {$: "Reuse.SetJoinedLost"});
  } else {
    return $Bool$pick$(($Bool$and$(_has_revision_0, _has_advice_id_0)), {$: "Reuse.SetJoinedFinding"}, {$: "Reuse.SetJoinedLost"});
  }
}

function $Canonical$cleanup_state_clean$(_state_0) {
  const _t_0 = _state_0["rounds"];
  if (_t_0.$ === "Nil") {
    const _t_1 = _state_0["work"];
    if (_t_1.$ === "Nil") {
      const _admissions_0 = _state_0["admissions"];
      const _t_2 = _state_0["dispatch"];
      const _t_3 = _t_2["queued"];
      if (_t_3.$ === "Nil") {
        const _t_4 = _t_2["running"];
        if (_t_4.$ === "Nil") {
          const _t_5 = _t_2["closed"];
          if (!_t_5) {
            const _t_6 = _t_2["requests"];
            if (_t_6.$ === "Nil") {
              const _t_7 = _state_0["collection"];
              const _t_8 = _t_7["ready"];
              if (_t_8.$ === "Nil") {
                const _t_9 = _t_7["leases"];
                if (_t_9.$ === "Nil") {
                  const _t_10 = _t_7["claims"];
                  if (_t_10.$ === "Nil") {
                    const _t_11 = _t_7["delivery"];
                    const _t_12 = _t_11["slots"];
                    if (_t_12.$ === "Nil") {
                      const _t_13 = _t_11["submissions"];
                      const _t_14 = _t_13["leases"];
                      if (_t_14.$ === "Nil") {
                        const _t_15 = _t_13["batches"];
                        if (_t_15.$ === "Nil") {
                          const _t_16 = _t_7["revision"];
                          const _t_17 = _t_16["entries"];
                          if (_t_17.$ === "Nil") {
                            const _t_18 = _t_7["reuse"];
                            const _t_19 = _t_18["claims"];
                            if (_t_19.$ === "Nil") {
                              const _t_20 = _t_7["notices"];
                              const _t_21 = _t_20["records"];
                              if (_t_21.$ === "Nil") {
                                return $Retention$cleanup_live_state$(true, ($Nat$is_eq$(($Canonical$pending_resident_permits$(_admissions_0)), 0)));
                              } else {
                                return false;
                              }
                            } else {
                              return false;
                            }
                          } else {
                            return false;
                          }
                        } else {
                          return false;
                        }
                      } else {
                        return false;
                      }
                    } else {
                      return false;
                    }
                  } else {
                    return false;
                  }
                } else {
                  return false;
                }
              } else {
                return false;
              }
            } else {
              return false;
            }
          } else {
            return false;
          }
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $Canonical$cleanup_commit_checked$(_state_0, _valid_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_valid_0) {
    return $Canonical$cleanup_closed$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, ($Dispatch$close$(_dispatch_0)));
  } else {
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CleanupBusy"}, "tail": {$: "Nil"}}};
  }
}

function $Canonical$cleanup_commit_eligible$(_state_0) {
  const _t_0 = _state_0["ledger"];
  const __0 = _t_0["limits"];
  const __1 = _t_0["next_id"];
  const _t_1 = _t_0["charges"];
  if (_t_1.$ === "Nil") {
    const __2 = _state_0["rounds"];
    const __3 = _state_0["work"];
    const __4 = _state_0["next_round"];
    const __5 = _state_0["next_operation"];
    const __6 = _state_0["admissions"];
    const __7 = _state_0["dispatch"];
    const _t_2 = _state_0["collection"];
    const __8 = _t_2["ready"];
    const __9 = _t_2["leases"];
    const __10 = _t_2["claims"];
    const __11 = _t_2["delivery"];
    const __12 = _t_2["revision"];
    const _t_3 = _t_2["reuse"];
    const __13 = _t_3["claims"];
    const _t_4 = _t_3["cache"];
    if (_t_4.$ === "Nil") {
      const __14 = _t_2["notices"];
      const _history_0 = _state_0["history"];
      return $Canonical$cleanup_state_clean$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": {$: "Nil"}}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": __7, "collection": {$: "CollectionState.State", "ready": __8, "leases": __9, "claims": __10, "delivery": __11, "revision": __12, "reuse": {$: "ReuseState.State", "claims": __13, "cache": {$: "Nil"}}, "notices": __14}, "history": _history_0});
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $Cmp$is_gt$(_c_0) {
  if (_c_0.$ === "GT") {
    return true;
  } else {
    return false;
  }
}

function $Cmp$is_eq$(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Nat$is_ge$(_a_0, _b_0) {
  return $Cmp$is_ge$(cmp_new(_a_0, _b_0));
}

function $RulePolicy$target_compatible$(_target_0) {
  if (_target_0.$ === "RulePolicy.TypeShape") {
    return true;
  } else if (_target_0.$ === "RulePolicy.FunctionTarget") {
    return true;
  } else {
    return false;
  }
}

function $Nat$is_le$(_a_0, _b_0) {
  return $Cmp$is_le$(cmp_new(_a_0, _b_0));
}

function $RulePolicy$valid_words$(_word_0) {
  const _high_0 = _word_0["high"];
  const _low_0 = _word_0["low"];
  const _x_0 = (_high_0 < 1072693248);
  const _x_1 = ($Nat$is_eq$(_low_0, 0));
  return $Bool$and$(($Nat$is_le$(_low_0, 4294967295)), ($Bool$and$(($Nat$is_le$(_high_0, 1072693248)), (_x_0 || _x_1))));
}

function $RulePolicy$greater_words$(_left_0, _right_0) {
  const _left_high_0 = _left_0["high"];
  const _left_low_0 = _left_0["low"];
  const _right_high_0 = _right_0["high"];
  const _right_low_0 = _right_0["low"];
  const _x_0 = ($Nat$is_gt$(_left_high_0, _right_high_0));
  const _x_1 = ($Bool$and$(($Nat$is_eq$(_left_high_0, _right_high_0)), ($Nat$is_gt$(_left_low_0, _right_low_0))));
  return (_x_0 || _x_1);
}

function $RulePolicy$rank_order_result$(_order_0, _left_rank_0, _right_rank_0) {
  if (_order_0.$ === "RulePolicy.Before") {
    return {$: "RulePolicy.Before"};
  } else if (_order_0.$ === "RulePolicy.After") {
    return {$: "RulePolicy.After"};
  } else {
    return $Bool$pick$((_left_rank_0 < _right_rank_0), {$: "RulePolicy.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_rank_0, _right_rank_0)), {$: "RulePolicy.After"}, {$: "RulePolicy.Equal"})));
  }
}

function $RulePolicy$probability_order$(_left_0, _right_0) {
  return $Bool$pick$(($Bool$and$(($RulePolicy$valid_words$(_left_0)), ($RulePolicy$valid_words$(_right_0)))), ($Bool$pick$(($RulePolicy$greater_words$(_left_0, _right_0)), {$: "RulePolicy.Before"}, ($Bool$pick$(($RulePolicy$greater_words$(_right_0, _left_0)), {$: "RulePolicy.After"}, {$: "RulePolicy.Equal"})))), {$: "RulePolicy.Equal"});
}

function $RulePolicy$advice_order_result$(_order_0, _path_order_0, _id_order_0) {
  if (_order_0.$ === "RulePolicy.Before") {
    return {$: "RulePolicy.Before"};
  } else if (_order_0.$ === "RulePolicy.After") {
    return {$: "RulePolicy.After"};
  } else {
    if (_path_order_0.$ === "RulePolicy.Equal") {
      return _id_order_0;
    } else if (_path_order_0.$ === "RulePolicy.Before") {
      return {$: "RulePolicy.Before"};
    } else {
      return {$: "RulePolicy.After"};
    }
  }
}

function $ReuseState$route_claim$(_state_0, _id_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["attached"];
    if (_t_1) {
      return {$: "ReuseState.JoinPending", "state": _state_0};
    } else {
      return {$: "ReuseState.JoinClaimed", "state": _state_0};
    }
  } else {
    return $ReuseState$route_cache$(_state_0, _id_0);
  }
}

function $ReuseState$find_claim$(_id_0, _claims_0) {
  if (_claims_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _claim_0 = _claims_0["head"];
    const _rest_0 = _claims_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_id_0, ($ReuseState$claim_id$(_claim_0)))), {$: "Some", "value": _claim_0}, ($ReuseState$find_claim$(_id_0, _rest_0)));
  }
}

function $Maybe$is_none$(_m_0) {
  return $Bool$not$(($Maybe$is_some$(_m_0)));
}

function $ReuseState$attach_found$(_state_0, _id_0, _found_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_found_0.$ === "Some") {
    return {$: "ReuseState.Granted", "state": {$: "ReuseState.State", "claims": {$: "Con", "head": {$: "ReuseState.Claim", "id": _id_0, "attached": true}, "tail": ($ReuseState$without_claim$(_id_0, _claims_0))}, "cache": _cache_0}};
  } else {
    return {$: "ReuseState.Refused", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}};
  }
}

function $CollectionState$with_reuse$(_state_0, _replacement_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _replacement_0, "notices": _notices_0};
}

function $ReuseState$without_claim$(_id_0, _claims_0) {
  if (_claims_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _claim_0 = _claims_0["head"];
    const _rest_0 = _claims_0["tail"];
    return $ReuseState$keep_claim$(_claim_0, ($ReuseState$without_claim$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, ($ReuseState$claim_id$(_claim_0)))));
  }
}

function $ReuseState$route_cache_only$(_state_0, _id_0) {
  const __0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $ReuseState$route_cache_only_found$({$: "ReuseState.State", "claims": __0, "cache": _cache_0}, _id_0, ($ReuseState$find_entry$(_id_0, _cache_0)));
}

function $ReuseState$prepare_decision$(_state_0, _incoming_0, _entry_limit_0, _byte_limit_0, _found_0) {
  if (_found_0.$ === "Some") {
    return {$: "ReuseState.Already", "state": _state_0};
  } else {
    return $ReuseState$prepare_missing$(_state_0, _incoming_0, _entry_limit_0, _byte_limit_0, ($Nat$is_gt$(_incoming_0, _byte_limit_0)));
  }
}

function $ReuseState$find_entry$(_id_0, _cache_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_id_0, ($ReuseState$entry_id$(_entry_0)))), {$: "Some", "value": _entry_0}, ($ReuseState$find_entry$(_id_0, _rest_0)));
  }
}

function $Canonical$cache_commit_checked$(_state_0, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0, _valid_0) {
  if (_valid_0) {
    return $Canonical$reuse_decision_result$(_state_0, ($ReuseState$commit$(($CollectionState$reuse_state$(($Canonical$collection_of$(_state_0)))), _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0)), {$: "Canonical.CacheCommitted"});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseRefused"}, "tail": {$: "Nil"}}};
  }
}

function $Canonical$cache_charge_valid$(_found_0, _partition_0, _bytes_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _owner_0 = _t_0["partition"];
    const _size_0 = _t_0["bytes"];
    const _t_1 = _t_0["purpose"];
    if (_t_1.$ === "Ledger.StoredResult") {
      return $Bool$and$(($Nat$is_eq$(_partition_0, _owner_0)), ($Nat$is_eq$(_bytes_0, _size_0)));
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $ReuseState$discard_with_claims$(_claims_0, _result_0) {
  const _t_0 = _result_0["state"];
  const _kept_0 = _t_0["cache"];
  const _ids_0 = _result_0["ids"];
  return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _kept_0}, "ids": _ids_0};
}

function $ReuseState$discard_partition$(_cache_0, _partition_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Nil"}}, "ids": {$: "Nil"}};
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    return $ReuseState$discard_choice$(_entry_0, ($ReuseState$discard_partition$(_rest_0, _partition_0)), ($Nat$is_eq$(($ReuseState$entry_partition$(_entry_0)), _partition_0)));
  }
}

function $ReuseState$entry_ids$(_cache_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _cache_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _cache_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($ReuseState$entry_ids$(_rest_0))};
  }
}

function $NoticeState$advance_found$(_state_0, _found_0, _remaining_0, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0) {
  const _records_0 = _state_0["records"];
  if (_found_0.$ === "None") {
    return $Bool$pick$(($Nat$is_ge$(($List$length$(_records_0)), _maximum_keys_0)), {$: "NoticeState.RejectedFull", "state": {$: "NoticeState.State", "records": _records_0}}, {$: "NoticeState.CreateKey", "state": {$: "NoticeState.State", "records": _records_0}});
  } else {
    const _t_0 = _found_0["value"];
    const __0 = _t_0["id"];
    const __1 = _t_0["partition"];
    const __2 = _t_0["group"];
    const __3 = _t_0["reservation"];
    const _suppressed_0 = _t_0["suppressed"];
    const _pending_0 = _t_0["pending"];
    return $NoticeState$advance_applied$({$: "NoticeState.State", "records": _records_0}, {$: "NoticeState.Record", "id": __0, "partition": __1, "group": __2, "reservation": __3, "suppressed": _suppressed_0, "pending": _pending_0}, ($Notice$advance$(_remaining_0, 1, _maximum_keys_0, _suppressed_0, ($NoticeState$pending_count$(_pending_0)), ($NoticeState$pending_leased$(_pending_0)), _max_count_0)), _proposed_0, _sequence_0);
  }
}

function $NoticeState$find_record$(_id_0, _records_0) {
  if (_records_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _record_0 = _records_0["head"];
    const _rest_0 = _records_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_id_0, ($NoticeState$record_id$(_record_0)))), {$: "Some", "value": _record_0}, ($NoticeState$find_record$(_id_0, _rest_0)));
  }
}

function $Canonical$notice_commit_checked$(_state_0, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0, _valid_0) {
  if (_valid_0) {
    return $Canonical$notice_decision_result$(_state_0, ($NoticeState$commit$(($CollectionState$notice_state$(($Canonical$collection_of$(_state_0)))), _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0)), {$: "Canonical.NoticeCommitted"});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $Canonical$notice_charge_valid$(_found_0, _partition_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _owner_0 = _t_0["partition"];
    const _t_1 = _t_0["purpose"];
    if (_t_1.$ === "Ledger.OperationalNotice") {
      return $Nat$is_eq$(_partition_0, _owner_0);
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $NoticeState$prune_found$(_state_0, _found_0, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0) {
  if (_found_0.$ === "None") {
    return {$: "NoticeState.PruneMissing", "state": _state_0};
  } else {
    const _t_0 = _found_0["value"];
    const __0 = _t_0["id"];
    const __1 = _t_0["partition"];
    const __2 = _t_0["group"];
    const __3 = _t_0["reservation"];
    const __4 = _t_0["suppressed"];
    const _pending_0 = _t_0["pending"];
    return $NoticeState$prune_applied$(_state_0, {$: "NoticeState.Record", "id": __0, "partition": __1, "group": __2, "reservation": __3, "suppressed": __4, "pending": _pending_0}, ($Notice$prune$(($Maybe$is_some$(_pending_0)), ($NoticeState$pending_leased$(_pending_0)), _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0)));
  }
}

function $CollectionState$with_notices$(_state_0, _replacement_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _replacement_0};
}

function $NoticeState$without$(_id_0, _records_0) {
  if (_records_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _record_0 = _records_0["head"];
    const _rest_0 = _records_0["tail"];
    return $NoticeState$without_choice$(_record_0, ($NoticeState$without$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, ($NoticeState$record_id$(_record_0)))));
  }
}

function $NoticeState$lease_found$(_state_0, _found_0, _leased_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _id_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const _group_0 = _t_0["group"];
    const _reservation_0 = _t_0["reservation"];
    const _suppressed_0 = _t_0["suppressed"];
    const _t_1 = _t_0["pending"];
    if (_t_1.$ === "Some") {
      const __0 = _t_1["value"];
      return {$: "NoticeState.Granted", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _suppressed_0, "pending": ($NoticeState$set_leased$({$: "Some", "value": __0}, _leased_0))}))};
    } else {
      return {$: "NoticeState.Refused", "state": _state_0};
    }
  } else {
    return {$: "NoticeState.Refused", "state": _state_0};
  }
}

function $NoticeState$clear_pending_found$(_state_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _id_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const _group_0 = _t_0["group"];
    const _reservation_0 = _t_0["reservation"];
    const _suppressed_0 = _t_0["suppressed"];
    const _t_1 = _t_0["pending"];
    if (_t_1.$ === "Some") {
      return {$: "NoticeState.Granted", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _suppressed_0, "pending": {$: "None"}}))};
    } else {
      return {$: "NoticeState.Refused", "state": _state_0};
    }
  } else {
    return {$: "NoticeState.Refused", "state": _state_0};
  }
}

function $NoticeState$pending_ids$(_pending_0) {
  if (_pending_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _pending_0["head"];
    const _rest_0 = _pending_0["tail"];
    return {$: "Con", "head": ($NoticeState$pending_id$(_item_0)), "tail": ($NoticeState$pending_ids$(_rest_0))};
  }
}

function $NoticeState$collect_candidates$(_records_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0) {
  if (_records_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _record_0 = _records_0["head"];
    const _rest_0 = _records_0["tail"];
    return $NoticeState$collect_choice$(($NoticeState$candidate$(_record_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0)), ($NoticeState$collect_candidates$(_rest_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0)));
  }
}

function $Canonical$output_start_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["lifetime"];
    const __2 = _t_0["id"];
    const _waiting_0 = _t_0["waiting"];
    const _deciding_0 = _t_0["deciding"];
    const _t_1 = _t_0["write"];
    if (_t_1.$ === "None") {
      const _uncertain_0 = _t_0["uncertain"];
      const _quiet_since_0 = _t_0["quiet_since"];
      return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": _uncertain_0, "quiet_since": _quiet_since_0})), ($Bool$not$(_deciding_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": false, "write": {$: "Some", "value": _next_operation_0}, "uncertain": _uncertain_0, "quiet_since": _quiet_since_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WriteAuthorized", "operation": _next_operation_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$output_terminal_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Canonical$output_terminal_current$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_0);
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$retire_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Canonical$retire_current$(_state_0, _partition_0, _lifetime_0, _round_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$forget_admission_found$(_state_0, _partition_0, _lifetime_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "None") {
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.AdmissionForgotten"}, "tail": {$: "Nil"}}};
  } else {
    const _t_0 = _found_0["value"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _active_0 = _t_0["active"];
    const _permits_0 = _t_0["permits"];
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Bool$not$(_active_0)), ($Bool$and$(($List$is_empty$(_permits_0)), ($Bool$and$(($Bool$not$(($Canonical$has_partition_work$(_partition_0, _work_0)))), ($Canonical$no_round_for_partition$(_partition_0, _rounds_0)))))))))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": ($Canonical$remove_admission$(_partition_0, _admissions_0)), "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.AdmissionForgotten"}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}});
  }
}

function $Canonical$find_admission$(_partition_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Canonical$admission_matches$(_partition_0, _item_0)), {$: "Some", "value": _item_0}, ($Canonical$find_admission$(_partition_0, _rest_0)));
  }
}

function $SubmissionState$initial$() {
  return {$: "SubmissionState.State", "leases": {$: "Nil"}, "batches": {$: "Nil"}};
}

function $Canonical$same_partition$(_partition_0, _round_0) {
  const _owner_0 = _round_0["partition"];
  return $Nat$is_eq$(_owner_0, _partition_0);
}

function $Canonical$capacity_view$(_ledger_0, _partition_0) {
  const _charges_0 = _ledger_0["charges"];
  return {$: "Canonical.CapacityView", "global": ($Ledger$total$(_charges_0)), "local": ($Ledger$partition_usage$(_charges_0, _partition_0)), "charges": _charges_0};
}

function $Ledger$admission$(_state_0, _partition_0, _bytes_0) {
  const _limits_0 = _state_0["limits"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$fit_decision$(_limits_0, ($Ledger$total$(_charges_0)), ($Ledger$partition_usage$(_charges_0, _partition_0)), _bytes_0);
}

function $Ledger$reserve$check$(_limits_0, _next_id_0, _charges_0, _partition_0, _bytes_0, _purpose_0, _allowed_0) {
  if (_allowed_0) {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": nat_chk(_next_id_0 + 1), "charges": ($List$append$(_charges_0, {$: "Con", "head": {$: "Ledger.Charge", "id": _next_id_0, "partition": _partition_0, "bytes": _bytes_0, "purpose": _purpose_0}, "tail": {$: "Nil"}}))}, "id": _next_id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $Ledger$fits$(_limits_0, _global_0, _local_0, _bytes_0) {
  return $Ledger$decision_fits$(($Ledger$fit_decision$(_limits_0, _global_0, _local_0, _bytes_0)));
}

function $Ledger$total$(_charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Ledger.Usage", "items": 0, "bytes": 0};
  } else {
    const _t_0 = _charges_0["head"];
    const _bytes_0 = _t_0["bytes"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$total$add$(($Ledger$total$(_rest_0)), _bytes_0);
  }
}

function $Ledger$partition_usage$(_charges_0, _partition_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Ledger.Usage", "items": 0, "bytes": 0};
  } else {
    const _t_0 = _charges_0["head"];
    const _owner_0 = _t_0["partition"];
    const _bytes_0 = _t_0["bytes"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$partition_usage$add$(($Ledger$partition_usage$(_rest_0, _partition_0)), _bytes_0, ($Nat$is_eq$(_owner_0, _partition_0)));
  }
}

function $Canonical$capacity_resize_result$(_state_0, _id_0, _partition_0, _bytes_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityResized", "id": _id_0, "after": ($Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}};
  } else {
    const _t_0 = _result_0["state"];
    const _limits_0 = _t_0["limits"];
    const _next_id_0 = _t_0["next_id"];
    const _charges_0 = _t_0["charges"];
    const _others_0 = {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($Ledger$remove$(_id_0, _charges_0))};
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityRefused", "reason": ($Ledger$admission$(_others_0, _partition_0, _bytes_0)), "after": ($Canonical$capacity_view$({$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}, _partition_0))}, "tail": {$: "Nil"}}};
  }
}

function $Ledger$resize_for$(_state_0, _id_0, _bytes_0, _purpose_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$resize_for$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, _bytes_0, _purpose_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Ledger$find$pick$(_charge_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _charge_0};
  } else {
    return _fallback_0;
  }
}

function $Ledger$release$found$(_state_0, _id_0, _found_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  if (_found_0.$ === "Some") {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($Ledger$remove$(_id_0, _charges_0))}, "id": _id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $Canonical$capacity_replace_released$(_state_0, _id_0, _partition_0, _sizes_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const __1 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _released_0 = _result_0["state"];
    return $Canonical$capacity_replace_batch$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": __1, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _partition_0, _released_0, ($Canonical$capacity_replace_units$(_sizes_0, {$: "Canonical.CapacityBatch", "ledger": _released_0, "commands": {$: "Nil"}}, _partition_0, 1)));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": __1, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$issue_permit_capacity$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _x_0 = ($Canonical$pending_advicee_permits$(_partition_0, _admissions_0));
  const _x_1 = ($Canonical$pending_resident_permits$(_admissions_0));
  return $Canonical$issue_permit_capacity_checked$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, (_x_0 < _advicee_limit_0), (_x_1 < _resident_limit_0));
}

function $Admission$prospective_gate_window$(_facts_0, _within_0, _ordered_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  if (!_ordered_0) {
    return {$: "Admission.PermitInvalidClock"};
  } else {
    return $Admission$prospective_gate_ordered$(_clock_valid_0, _within_0);
  }
}

function $Canonical$with_history$(_state_0, _replacement_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _replacement_0};
}

function $EditHistory$mark_reported$(_tool_0, _state_0) {
  const _entries_0 = _state_0["entries"];
  return {$: "EditHistory.State", "entries": ($EditHistory$mark_entries$(_tool_0, _entries_0))};
}

function $EditHistory$lookup_entries$(_tool_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "EditHistory.Absent"};
  } else {
    const _t_0 = _entries_0["head"];
    const _current_0 = _t_0["tool"];
    const _reason_0 = _t_0["reason"];
    const _reported_0 = _t_0["reported"];
    const _rest_0 = _entries_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_tool_0, _current_0)), {$: "EditHistory.Seen", "reason": _reason_0, "report": ($Bool$not$(_reported_0))}, ($EditHistory$lookup_entries$(_tool_0, _rest_0)));
  }
}

function $Canonical$remembered_completed_edit$(_state_0, _result_0) {
  const _replacement_0 = _result_0["state"];
  const _evicted_0 = _result_0["evicted"];
  return {$: "Canonical.Advanced", "state": ($Canonical$with_history$(_state_0, _replacement_0)), "commands": {$: "Con", "head": {$: "Canonical.CompletedEditRemembered", "evicted": _evicted_0}, "tail": {$: "Nil"}}};
}

function $EditHistory$record$(_tool_0, _reason_0, _state_0) {
  const _entries_0 = _state_0["entries"];
  return $EditHistory$record_entries$(_tool_0, _reason_0, _entries_0, ($List$length$(_entries_0)));
}

function $Canonical$same_round$(_partition_0, _lifetime_0, _id_0, _round_0) {
  const _owner_0 = _round_0["partition"];
  const _generation_0 = _round_0["lifetime"];
  const _current_0 = _round_0["id"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Nat$is_eq$(_current_0, _id_0)))));
}

function $Canonical$quiet_round_current$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, _current_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _waiting_0 = _current_0["waiting"];
  const _deciding_0 = _current_0["deciding"];
  const _write_0 = _current_0["write"];
  const _quiet_since_0 = _current_0["quiet_since"];
  const _quiet_0 = ($Bool$and$(($Quiescence$facts_quiet$(_facts_0)), ($Bool$and$(($Canonical$quiet_admission$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0)), ($Bool$and$(($Bool$not$(($Canonical$pending$(_partition_0, _lifetime_0, _round_0, _work_0)))), ($Bool$and$(($Bool$not$(_waiting_0)), ($Bool$and$(($Bool$not$(_deciding_0)), ($Maybe$is_none$(_write_0))))))))))));
  return $Canonical$quiet_round_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, ($Quiescence$decide$(_quiet_since_0, _now_0, _window_0, _quiet_0)));
}

function $Canonical$with_quiet_round$(_state_0, _partition_0, _since_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($Canonical$replace_quiet_round$(_partition_0, _since_0, _rounds_0)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0};
}

function $Canonical$consume_admitted$(_state_0, _partition_0, _lifetime_0, _admission_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$consume_existing$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, ($Canonical$with_admission$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _partition_0, _admission_0)), _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
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

function $Canonical$current_admission_found$(_partition_0, _lifetime_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _item_0 = _found_0["value"];
    return _item_0;
  } else {
    return $Admission$initial$(_partition_0, _lifetime_0);
  }
}

function $Canonical$with_admission$(_state_0, _partition_0, _admission_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": {$: "Con", "head": _admission_0, "tail": ($Canonical$remove_admission$(_partition_0, _admissions_0))}, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0};
}

function $Canonical$expire_permit_result$(_state_0, _partition_0, _result_0) {
  if (_result_0.$ === "Admission.KeepPermit") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PermitKept"}, "tail": {$: "Nil"}}};
  } else {
    const _admission_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": {$: "Canonical.PermitExpired"}, "tail": {$: "Nil"}}};
  }
}

function $Admission$expire$(_state_0, _token_0, _deadline_reached_0) {
  if (!_deadline_reached_0) {
    return {$: "Admission.KeepPermit", "state": _state_0};
  } else {
    return $Admission$expire$due$(_state_0, _token_0);
  }
}

function $Admission$candidate_round$(_round_0, _active_0) {
  if (_active_0) {
    return _round_0;
  } else {
    return nat_chk(_round_0 + 1);
  }
}

function $Canonical$close_permit_result$(_state_0, _partition_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["round"];
    if (_t_0.$ === "Some") {
      const _round_0 = _t_0["value"];
      return {$: "Canonical.Advanced", "state": ($Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": {$: "Canonical.PermitRoundClosed", "round": _round_0}, "tail": {$: "Nil"}}};
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.InconsistentLedger"}};
    }
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": _reason_0}};
  }
}

function $Canonical$is_deciding$(_current_0) {
  const _deciding_0 = _current_0["deciding"];
  return _deciding_0;
}

function $Canonical$replace_work_kind$(_operation_0, _kind_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _partition_0 = _t_0["partition"];
    const _lifetime_0 = _t_0["lifetime"];
    const _round_0 = _t_0["round"];
    const _current_0 = _t_0["operation"];
    const _charge_0 = _t_0["charge"];
    const __0 = _t_0["kind"];
    const _parent_0 = _t_0["parent"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$replace_work_kind_pick$({$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _current_0, "charge": _charge_0, "kind": __0, "parent": _parent_0}, {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _current_0, "charge": _charge_0, "kind": _kind_0, "parent": _parent_0}, ($Canonical$replace_work_kind$(_operation_0, _kind_0, _rest_0)), ($Nat$is_eq$(_current_0, _operation_0)));
  }
}

function $Canonical$work_matches$(_partition_0, _lifetime_0, _round_0, _operation_0, _item_0) {
  const _owner_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["round"];
  const _op_0 = _item_0["operation"];
  return $Bool$and$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Nat$is_eq$(_op_0, _operation_0)));
}

function $Canonical$remove_work$(_operation_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["lifetime"];
    const __2 = _t_0["round"];
    const _op_0 = _t_0["operation"];
    const __3 = _t_0["charge"];
    const __4 = _t_0["kind"];
    const __5 = _t_0["parent"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$remove_work_pick$({$: "Canonical.Work", "partition": __0, "lifetime": __1, "round": __2, "operation": _op_0, "charge": __3, "kind": __4, "parent": __5}, ($Canonical$remove_work$(_operation_0, _rest_0)), ($Nat$is_eq$(_op_0, _operation_0)));
  }
}

function $Canonical$begin_result$(_state_0, _partition_0, _lifetime_0, _round_0, _parent_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    const _charge_0 = _result_0["id"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($List$append$(_work_0, {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _next_operation_0, "charge": _charge_0, "kind": {$: "Canonical.Preparing"}, "parent": _parent_0}, "tail": {$: "Nil"}})), "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.Prepare", "operation": _next_operation_0, "reservation": _charge_0}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationRefused"}, "tail": {$: "Nil"}}};
  }
}

function $Canonical$prepared_release$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$prepared_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0, ($Ledger$release$(_ledger_0, _charge_0)));
}

function $Canonical$request_ready_reserved$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _result_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const __0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Dispatch.RequestAccepted") {
    const _dispatch_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$replace_work_kind$(_operation_0, {$: "Canonical.AtJev"}, _work_0)), "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.JevRequestIssued", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "request": _request_0}, "tail": {$: "Nil"}}};
  } else {
    return $Canonical$append_review_disposition$(($Canonical$reviewed$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Unavailable"})), {$: "Canonical.JevRequestUnavailable"});
  }
}

function $Dispatch$reserve_request$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  const _x_0 = ($List$length$(_requests_0));
  const _x_1 = ($Dispatch$max_requests$());
  const _x_2 = ($Dispatch$request_for_work$(_requests_0, _operation_0));
  const _x_3 = ($Bool$not$((_x_0 < _x_1)));
  const _x_4 = (_x_2 || _x_3);
  return $Bool$pick$((_closed_0 || _x_4), {$: "Dispatch.RequestDenied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}}, {$: "Dispatch.RequestAccepted", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": {$: "Con", "head": {$: "Dispatch.Request", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "request": _request_0, "started": false, "interrupted": false}, "tail": _requests_0}}});
}

function $Canonical$append_review_disposition$(_step_0, _command_0) {
  if (_step_0.$ === "Canonical.Advanced") {
    const _state_0 = _step_0["state"];
    const _commands_0 = _step_0["commands"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": ($List$append$(_commands_0, {$: "Con", "head": _command_0, "tail": {$: "Nil"}}))};
  } else {
    const _state_1 = _step_0["state"];
    const _reason_0 = _step_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_1, "reason": _reason_0};
  }
}

function $Dispatch$request_update_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _start_0, _interrupt_0, _settle_0, _found_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  if (_found_0.$ === "None") {
    return {$: "Dispatch.RequestDenied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}};
  } else {
    const _t_0 = _found_0["value"];
    const _started_0 = _t_0["started"];
    const _interrupted_0 = _t_0["interrupted"];
    const _x_0 = ($Bool$and$(_interrupt_0, _interrupted_0));
    const _x_1 = ($Bool$and$(_interrupt_0, ($Bool$not$(_started_0))));
    const _x_2 = ($Bool$and$(_start_0, _started_0));
    const _x_3 = (_x_0 || _x_1);
    return $Bool$pick$((_x_2 || _x_3), {$: "Dispatch.RequestDenied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}}, {$: "Dispatch.RequestAccepted", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": ($Bool$pick$(_settle_0, ($Dispatch$request_remove$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), ($Bool$pick$(_start_0, ($Dispatch$request_started$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), ($Dispatch$request_interrupted$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))))))}});
  }
}

function $Canonical$request_outcome_valid$(_outcome_0, _started_0, _interrupted_0) {
  if (_outcome_0.$ === "Canonical.NeverSent") {
    return $Bool$not$(_started_0);
  } else if (_outcome_0.$ === "Canonical.RequestInterrupted") {
    return $Bool$and$(_started_0, _interrupted_0);
  } else {
    return _started_0;
  }
}

function $Canonical$request_settled_released$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, _result_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const __0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Dispatch.RequestAccepted") {
    const _dispatch_0 = _result_0["state"];
    return $Canonical$request_settled_work$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$request_matches$(_item_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const _owner_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["round"];
  const _work_0 = _item_0["operation"];
  const _id_0 = _item_0["request"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Nat$is_eq$(_current_0, _round_0)), ($Bool$and$(($Nat$is_eq$(_work_0, _operation_0)), ($Nat$is_eq$(_id_0, _request_0)))))))));
}

function $Canonical$reviewed_decide$(_state_0, _operation_0, _charge_0, _parent_0, _outcome_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_outcome_0.$ === "Canonical.Finding") {
    return $Bool$pick$(($Nat$is_gt$(_parent_0, 0)), ($Canonical$reviewed_retained_find$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _charge_0, _ledger_0)), ($Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)))));
  } else if (_outcome_0.$ === "Canonical.Clear") {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Clear"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else if (_outcome_0.$ === "Canonical.Unavailable") {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Unavailable"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else if (_outcome_0.$ === "Canonical.Interrupted") {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Interrupted"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Discarded"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  }
}

function $Canonical$reviewed_released$(_state_0, _operation_0, _outcome_0, _charge_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _updated_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _updated_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": {$: "Con", "head": {$: "Canonical.ReviewRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Canonical$cancel_review_kind$(_state_0, _operation_0, _charge_0, _kind_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const __7 = _state_0["history"];
  if (_kind_0.$ === "Canonical.Reviewing") {
    return $Canonical$cancel_review_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": __7}, _operation_0, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else if (_kind_0.$ === "Canonical.AtJev") {
    return $Canonical$cancel_review_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": __7}, _operation_0, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": __7}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$reviewed_stale$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Canonical$reviewed_stale_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$dispatch_commands$(_items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    if (_t_0.$ === "Dispatch.Started") {
      const _operation_0 = _t_0["operation"];
      const _sequence_0 = _t_0["sequence"];
      const _rest_0 = _items_0["tail"];
      return {$: "Con", "head": {$: "Canonical.DispatchStarted", "operation": _operation_0, "sequence": _sequence_0}, "tail": ($Canonical$dispatch_commands$(_rest_0))};
    } else {
      const _operation_1 = _t_0["operation"];
      const _running_0 = _t_0["running"];
      const _rest_1 = _items_0["tail"];
      return {$: "Con", "head": {$: "Canonical.DispatchDiscarded", "operation": _operation_1, "running": _running_0}, "tail": ($Canonical$dispatch_commands$(_rest_1))};
    }
  }
}

function $Dispatch$known$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _x_0 = ($Dispatch$contains$(_queued_0, _partition_0, _lifetime_0, _round_0, _operation_0));
  const _x_1 = ($Dispatch$contains$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0));
  return (_x_0 || _x_1);
}

function $Dispatch$pump_available$(_state_0) {
  const _queued_0 = _state_0["queued"];
  const __0 = _state_0["running"];
  const __1 = _state_0["next_sequence"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["requests"];
  return $Dispatch$pump_remaining$(($List$length$(_queued_0)), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _queued_0, "running": __0, "next_sequence": __1, "closed": __2, "requests": __3}, "commands": {$: "Nil"}});
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

function $Dispatch$contains$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _entry_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Dispatch$same_entry$(_entry_0, _partition_0, _lifetime_0, _round_0, _operation_0));
    const _x_1 = ($Dispatch$contains$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0));
    return (_x_0 || _x_1);
  }
}

function $Dispatch$remove_entry$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Dispatch$same_entry$(_entry_0, _partition_0, _lifetime_0, _round_0, _operation_0)), _rest_0, {$: "Con", "head": _entry_0, "tail": ($Dispatch$remove_entry$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0))});
  }
}

function $Dispatch$discarded_result$(_state_0, _queued_0, _running_0) {
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  const _waiting_0 = _queued_0["entries"];
  const _waiting_commands_0 = _queued_0["commands"];
  const _executing_0 = _running_0["entries"];
  const _executing_commands_0 = _running_0["commands"];
  return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _waiting_0, "running": _executing_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, "commands": ($List$append$(_waiting_commands_0, _executing_commands_0))};
}

function $Dispatch$filter_queued$(_items_0, _ids_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Dispatch.Filtered", "entries": {$: "Nil"}, "commands": {$: "Nil"}};
  } else {
    const _t_0 = _items_0["head"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["lifetime"];
    const __2 = _t_0["round"];
    const _operation_0 = _t_0["operation"];
    const __3 = _t_0["sequence"];
    const __4 = _t_0["cancelled"];
    const __5 = _t_0["preparation"];
    const _rest_0 = _items_0["tail"];
    return $Dispatch$filter_queued_one$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": _operation_0, "sequence": __3, "cancelled": __4, "preparation": __5}, ($Dispatch$listed$(_ids_0, _operation_0)), ($Dispatch$filter_queued$(_rest_0, _ids_0)));
  }
}

function $Dispatch$filter_running$(_items_0, _ids_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Dispatch.Filtered", "entries": {$: "Nil"}, "commands": {$: "Nil"}};
  } else {
    const _t_0 = _items_0["head"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["lifetime"];
    const __2 = _t_0["round"];
    const _operation_0 = _t_0["operation"];
    const __3 = _t_0["sequence"];
    const __4 = _t_0["cancelled"];
    const __5 = _t_0["preparation"];
    const _rest_0 = _items_0["tail"];
    return $Dispatch$filter_running_one$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": _operation_0, "sequence": __3, "cancelled": __4, "preparation": __5}, ($Dispatch$listed$(_ids_0, _operation_0)), ($Dispatch$filter_running$(_rest_0, _ids_0)));
  }
}

function $Dispatch$discard_all$(_items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return {$: "Con", "head": ($Dispatch$discarded_entry$(_entry_0, false)), "tail": ($Dispatch$discard_all$(_rest_0))};
  }
}

function $Canonical$match_pending$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _current_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _write_0 = _current_0["write"];
  const _uncertain_0 = _current_0["uncertain"];
  return $Canonical$stop_current$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($Canonical$pending$(_partition_0, _lifetime_0, _round_0, _work_0)), _write_0, _uncertain_0);
}

function $Canonical$valid_stop_scopes$(_rounds_0, _lifetime_0, _scopes_0) {
  if (_scopes_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _scopes_0["head"];
    const _partition_0 = _t_0["partition"];
    const _round_0 = _t_0["round"];
    const _rest_0 = _scopes_0["tail"];
    return $Bool$and$(($Bool$not$(($Canonical$scope_partition_seen$(_rest_0, _partition_0)))), ($Bool$and$(($Canonical$scope_round_valid$(($Canonical$find_round$(_partition_0, _rounds_0)), _partition_0, _lifetime_0, _round_0)), ($Canonical$valid_stop_scopes$(_rounds_0, _lifetime_0, _rest_0)))));
  }
}

function $Canonical$scoped_pending$(_items_0, _lifetime_0, _scopes_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _partition_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _round_0 = _t_0["round"];
    const _kind_0 = _t_0["kind"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($Canonical$unfinished$(_kind_0))))));
    const _x_1 = ($Canonical$scoped_pending$(_rest_0, _lifetime_0, _scopes_0));
    return (_x_0 || _x_1);
  }
}

function $Canonical$stop_group_wait$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, true, false)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WaitForWork"}, "tail": {$: "Nil"}}};
}

function $Canonical$stop_group_ready$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _continuations_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_scoped_charges$(_work_0, _ledger_0, _lifetime_0, _scopes_0)), "rounds": ($Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, false, true)), "work": ($Canonical$retain_scoped_work$(_work_0, _lifetime_0, _scopes_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": ($List$append$(($Canonical$release_scoped_commands$(_work_0, _lifetime_0, _scopes_0)), ($List$append$(($Canonical$cancel_scoped_dispatch$(_dispatch_0, _work_0, _lifetime_0, _scopes_0)), {$: "Con", "head": ($Bool$pick$((_continuations_0 < 4), {$: "Canonical.FinishReady"}, {$: "Canonical.FinishLimit"})), "tail": {$: "Nil"}}))))};
}

function $Canonical$stop_group_end_valid$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _valid_0) {
  return $Bool$pick$(_valid_0, ($Canonical$stop_group_end_apply$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
}

function $Canonical$valid_end_scopes$(_rounds_0, _lifetime_0, _scopes_0) {
  if (_scopes_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _scopes_0["head"];
    const _partition_0 = _t_0["partition"];
    const _round_0 = _t_0["round"];
    const _rest_0 = _scopes_0["tail"];
    return $Bool$and$(($Bool$not$(($Canonical$scope_partition_seen$(_rest_0, _partition_0)))), ($Bool$and$(($Canonical$end_scope_valid$(($Canonical$find_round$(_partition_0, _rounds_0)), _partition_0, _lifetime_0, _round_0)), ($Canonical$valid_end_scopes$(_rounds_0, _lifetime_0, _rest_0)))));
  }
}

function $CollectionState$contains$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _item_0));
    const _x_1 = ($CollectionState$contains$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $CollectionState$lease_exists$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _advice_0));
    const _x_1 = ($CollectionState$lease_exists$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $CollectionState$lease_owned$(_id_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _owner_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_id_0, _advice_0)), ($Nat$is_eq$(_token_0, _owner_0))));
    const _x_1 = ($CollectionState$lease_owned$(_id_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $CollectionState$remove_lease$(_id_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _owner_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    return $CollectionState$keep_lease$({$: "CollectionState.Lease", "advice": _advice_0, "owner": _owner_0}, ($CollectionState$remove_lease$(_id_0, _token_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_id_0, _advice_0)), ($Nat$is_eq$(_token_0, _owner_0)))));
  }
}

function $Canonical$collection_lease_keep$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($CollectionState$owns_lease$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseKept"}, {$: "Canonical.CollectionLeaseRefused"})), "tail": {$: "Nil"}}};
}

function $DeliveryState$protected_advice$(_state_0, _advice_0) {
  const _slots_0 = _state_0["slots"];
  const _t_0 = _state_0["submissions"];
  const _batches_0 = _t_0["batches"];
  return $DeliveryState$protected_advice_items$(_advice_0, _batches_0, _slots_0);
}

function $CollectionState$remove_ready$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $CollectionState$keep_ready$(_item_0, ($CollectionState$remove_ready$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, _item_0)));
  }
}

function $CollectionState$remove_advice_lease$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const __0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    return $CollectionState$keep_lease$({$: "CollectionState.Lease", "advice": _advice_0, "owner": __0}, ($CollectionState$remove_advice_lease$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, _advice_0)));
  }
}

function $DeliveryState$submission_forget$(_state_0, _advice_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": ($SubmissionState$forget$(_submissions_0, _advice_0))};
}

function $CollectionState$claim_exists$(_group_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_group_0, _candidate_group_0));
    const _x_1 = ($CollectionState$claim_exists$(_group_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $CollectionState$claim_owned$(_group_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_token_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_token_0, _candidate_token_0))));
    const _x_1 = ($CollectionState$claim_owned$(_group_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $CollectionState$remove_claim$(_group_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_token_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    return $CollectionState$keep_claim$({$: "CollectionState.Claim", "group": _candidate_group_0, "owner": _candidate_token_0}, ($CollectionState$remove_claim$(_group_0, _token_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)))));
  }
}

function $Canonical$selected_valid$(_all_0, _remaining_0, _work_0) {
  if (_remaining_0.$ === "Nil") {
    return true;
  } else {
    const _operation_0 = _remaining_0["head"];
    const _rest_0 = _remaining_0["tail"];
    return $Bool$and$(($Nat$is_gt$(_operation_0, 0)), ($Bool$and$(($Nat$is_le$(($Canonical$selected_count$(_operation_0, _all_0)), ($Canonical$pending_count$(_operation_0, _work_0)))), ($Canonical$selected_valid$(_all_0, _rest_0, _work_0)))));
  }
}

function $CollectionState$finish_reserve$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($DeliveryState$reserve$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)));
}

function $CollectionState$delivery_result$(_state_0, _result_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const __0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  if (_result_0.$ === "DeliveryState.Granted") {
    const _delivery_0 = _result_0["state"];
    return {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}};
  } else {
    return {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": __0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}};
  }
}

function $DeliveryState$release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  const _used_0 = ($DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($DeliveryState$reserved_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), ($Nat$is_gt$(_used_0, 0)))), {$: "DeliveryState.Granted", "state": ($DeliveryState$set_count$({$: "DeliveryState.State", "slots": ($DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}, _group_0, _round_0, (_used_0 < 1 ? 0 : _used_0 - 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": _submissions_0}});
}

function $DeliveryState$submission_ready$(_state_0, _group_0, _round_0, _token_0, _selected_0) {
  const _submissions_0 = _state_0["submissions"];
  return $SubmissionState$token_ready$(_submissions_0, _group_0, _round_0, _token_0, _selected_0);
}

function $DeliveryState$authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($DeliveryState$authorizable$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _slots_0)), ($DeliveryState$authorize_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, ($SubmissionState$authorize_stop_token$(_submissions_0, _token_0)))), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}});
}

function $DeliveryState$terminal$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const __1 = _state_0["submissions"];
  return $Bool$pick$(($DeliveryState$terminal_owned$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _slots_0)), ($DeliveryState$terminal_owned_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": __1}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": __1}});
}

function $DeliveryState$end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0, _submissions_0)), {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": _submissions_0}});
}

function $DeliveryState$consume$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const __1 = _state_0["submissions"];
  const _used_0 = ($DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), (_used_0 < 4))))), {$: "DeliveryState.Granted", "state": ($DeliveryState$set_count$({$: "DeliveryState.State", "slots": __0, "counters": _counters_0, "submissions": __1}, _group_0, _round_0, nat_chk(_used_0 + 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": __0, "counters": _counters_0, "submissions": __1}});
}

function $DeliveryState$submission_reservation$(_state_0, _group_0, _round_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  return $DeliveryState$reserved_token$(_group_0, _round_0, _token_0, _slots_0);
}

function $DeliveryState$submission_begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($DeliveryState$staging_locked$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($SubmissionState$begin$(_submissions_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0)))));
}

function $DeliveryState$submission_authorize$(_state_0, _advice_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($DeliveryState$slot_token$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($SubmissionState$authorize$(_submissions_0, _advice_0, _token_0)))));
}

function $DeliveryState$submission_terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($DeliveryState$slot_token$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($SubmissionState$terminal$(_submissions_0, _advice_0, _token_0, _certain_0)))));
}

function $DeliveryState$submission_release$(_state_0, _advice_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($DeliveryState$authorized_slot_token$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($SubmissionState$release$(_submissions_0, _advice_0, _token_0)))));
}

function $DeliveryState$submission_suppresses$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const _submissions_0 = _state_0["submissions"];
  return $SubmissionState$suppresses$(_submissions_0, _advice_0, _fingerprint_0, _round_0, _surface_0);
}

function $DeliveryState$submission_reofferable$(_state_0, _advice_0, _token_0) {
  const _submissions_0 = _state_0["submissions"];
  return $SubmissionState$background_reofferable$(_submissions_0, _advice_0, _token_0);
}

function $DeliveryState$submission_expired$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const _submissions_0 = _state_0["submissions"];
  return $SubmissionState$expired$(_submissions_0, _advice_0, _token_0, _elapsed_0, _lifetime_0);
}

function $CollectionState$revision_replace$(_state_0, _replacement_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _replacement_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $RevisionState$register$(_state_0, _subject_0, _input_0, _add_member_0) {
  const _entries_0 = _state_0["entries"];
  const __0 = _state_0["next_generation"];
  return $RevisionState$register_found$({$: "RevisionState.State", "entries": _entries_0, "next_generation": __0}, _subject_0, _input_0, _add_member_0, ($RevisionState$find$(_subject_0, _entries_0)));
}

function $RevisionState$release$(_state_0, _subject_0, _generation_0) {
  const _entries_0 = _state_0["entries"];
  const __0 = _state_0["next_generation"];
  return $RevisionState$release_found$({$: "RevisionState.State", "entries": _entries_0, "next_generation": __0}, _subject_0, _generation_0, ($RevisionState$find$(_subject_0, _entries_0)));
}

function $RevisionState$current$(_state_0, _subject_0, _input_0, _generation_0) {
  const _entries_0 = _state_0["entries"];
  return $RevisionState$current_found$(_input_0, _generation_0, ($RevisionState$find$(_subject_0, _entries_0)));
}

function $RevisionState$superseded$(_state_0, _subject_0, _candidate_subject_0, _candidate_0) {
  const _entries_0 = _state_0["entries"];
  return $Bool$and$(($Nat$is_eq$(_subject_0, _candidate_subject_0)), ($RevisionState$superseded_found$(_candidate_0, ($RevisionState$find$(_subject_0, _entries_0)))));
}

function $RevisionState$generation$(_state_0, _subject_0) {
  const _entries_0 = _state_0["entries"];
  return $RevisionState$generation_found$(($RevisionState$find$(_subject_0, _entries_0)));
}

function $RevisionState$count$(_state_0) {
  const _entries_0 = _state_0["entries"];
  return $List$length$(_entries_0);
}

function $Retention$cleanup_live_state$(_rounds_empty_0, _pending_permits_empty_0) {
  return $Bool$and$(_rounds_empty_0, _pending_permits_empty_0);
}

function $Canonical$pending_resident_permits$(_admissions_0) {
  if (_admissions_0.$ === "Nil") {
    return 0;
  } else {
    const _admission_0 = _admissions_0["head"];
    const _rest_0 = _admissions_0["tail"];
    const _x_0 = ($Admission$pending_count$(_admission_0));
    const _x_1 = ($Canonical$pending_resident_permits$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Canonical$cleanup_closed$(_state_0, _result_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const __0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Dispatch.Advanced") {
    const _replacement_0 = _result_0["state"];
    const _t_0 = _result_0["commands"];
    if (_t_0.$ === "Nil") {
      return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _replacement_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CleanupCommitted"}, "tail": {$: "Nil"}}};
    } else {
      return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CleanupBusy"}, "tail": {$: "Nil"}}};
    }
  } else {
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CleanupBusy"}, "tail": {$: "Nil"}}};
  }
}

function $Cmp$is_ge$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}

function $Cmp$is_le$(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $ReuseState$route_cache$(_state_0, _id_0) {
  const __0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $ReuseState$route_cache_found$({$: "ReuseState.State", "claims": __0, "cache": _cache_0}, _id_0, ($ReuseState$find_entry$(_id_0, _cache_0)));
}

function $ReuseState$claim_id$(_claim_0) {
  const _id_0 = _claim_0["id"];
  return _id_0;
}

function $Maybe$is_some$(_m_0) {
  if (_m_0.$ === "None") {
    return false;
  } else {
    return true;
  }
}

function $ReuseState$keep_claim$(_claim_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _claim_0, "tail": _tail_0};
  }
}

function $ReuseState$route_cache_only_found$(_state_0, _id_0, _found_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_found_0.$ === "Some") {
    const _entry_0 = _found_0["value"];
    return {$: "ReuseState.Cached", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": ($List$append$(($ReuseState$without_entry$(_id_0, _cache_0)), {$: "Con", "head": _entry_0, "tail": {$: "Nil"}}))}};
  } else {
    return {$: "ReuseState.Own", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}};
  }
}

function $ReuseState$prepare_missing$(_state_0, _incoming_0, _entry_limit_0, _byte_limit_0, _oversized_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_oversized_0) {
    return {$: "ReuseState.Reject", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}};
  } else {
    return $ReuseState$prepared_after_eviction$(_claims_0, ($ReuseState$evict_for$(_cache_0, _incoming_0, _entry_limit_0, _byte_limit_0, {$: "Nil"})));
  }
}

function $ReuseState$entry_id$(_entry_0) {
  const _id_0 = _entry_0["id"];
  return _id_0;
}

function $ReuseState$commit$(_state_0, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  const _x_0 = ($List$length$(_cache_0));
  const _x_1 = ($ReuseState$cache_bytes$(_cache_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_id_0, 0)), ($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Bool$and$(($Nat$is_gt$(_reservation_0, 0)), ($Bool$and$(($Maybe$is_none$(($ReuseState$find_entry$(_id_0, _cache_0)))), ($Bool$and$(($Bool$not$(($ReuseState$find_reservation$(_reservation_0, _cache_0)))), ($Bool$and$((_x_0 < _entry_limit_0), ($Nat$is_le$(nat_chk(_x_1 + _bytes_0), _byte_limit_0)))))))))))))), {$: "ReuseState.Granted", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": ($List$append$(_cache_0, {$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": _partition_0, "bytes": _bytes_0, "reservation": _reservation_0}, "tail": {$: "Nil"}}))}}, {$: "ReuseState.Refused", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}});
}

function $ReuseState$discard_choice$(_entry_0, _result_0, _selected_0) {
  const _id_0 = _entry_0["id"];
  const __0 = _entry_0["partition"];
  const __1 = _entry_0["bytes"];
  const __2 = _entry_0["reservation"];
  const _t_0 = _result_0["state"];
  const _kept_0 = _t_0["cache"];
  const _ids_0 = _result_0["ids"];
  if (_selected_0) {
    return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": _kept_0}, "ids": {$: "Con", "head": _id_0, "tail": _ids_0}};
  } else {
    return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": __0, "bytes": __1, "reservation": __2}, "tail": _kept_0}}, "ids": _ids_0};
  }
}

function $ReuseState$entry_partition$(_entry_0) {
  const _partition_0 = _entry_0["partition"];
  return _partition_0;
}

function $NoticeState$advance_applied$(_state_0, _record_0, _action_0, _proposed_0, _sequence_0) {
  const _id_0 = _record_0["id"];
  const _partition_0 = _record_0["partition"];
  const _group_0 = _record_0["group"];
  const _reservation_0 = _record_0["reservation"];
  const _t_0 = _record_0["pending"];
  if (_t_0.$ === "Some") {
    const _t_1 = _t_0["value"];
    const _pending_id_0 = _t_1["id"];
    const __1 = _t_1["count"];
    const _previous_0 = _t_1["sequence"];
    const _leased_0 = _t_1["leased"];
    if (_action_0.$ === "Notice.Suppressed") {
      const _count_0 = _action_0["count"];
      return {$: "NoticeState.Suppressed", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _count_0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_id_0, "count": __1, "sequence": _previous_0, "leased": _leased_0}}})), "count": _count_0};
    } else if (_action_0.$ === "Notice.RejectedFull") {
      return {$: "NoticeState.RejectedFull", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreateKey") {
      return {$: "NoticeState.RefusedAdvance", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreatePending") {
      const _count_1 = _action_0["count"];
      return {$: "NoticeState.CreatePending", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _proposed_0, "count": _count_1, "sequence": _sequence_0, "leased": false}}})), "count": _count_1};
    } else if (_action_0.$ === "Notice.MergePending") {
      const _count_2 = _action_0["count"];
      return {$: "NoticeState.MergePending", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_id_0, "count": _count_2, "sequence": _previous_0, "leased": _leased_0}}})), "count": _count_2};
    } else {
      return {$: "NoticeState.KeepLeased", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_id_0, "count": __1, "sequence": _previous_0, "leased": _leased_0}}}))};
    }
  } else {
    if (_action_0.$ === "Notice.Suppressed") {
      const _count_3 = _action_0["count"];
      return {$: "NoticeState.Suppressed", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _count_3, "pending": _t_0})), "count": _count_3};
    } else if (_action_0.$ === "Notice.RejectedFull") {
      return {$: "NoticeState.RejectedFull", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreateKey") {
      return {$: "NoticeState.RefusedAdvance", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreatePending") {
      const _count_4 = _action_0["count"];
      return {$: "NoticeState.CreatePending", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _proposed_0, "count": _count_4, "sequence": _sequence_0, "leased": false}}})), "count": _count_4};
    } else if (_action_0.$ === "Notice.KeepLeased") {
      return {$: "NoticeState.KeepLeased", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": _t_0}))};
    } else {
      return {$: "NoticeState.RefusedAdvance", "state": _state_0};
    }
  }
}

function $Notice$advance$(_remaining_0, _count_0, _maximum_0, _suppressed_0, _pending_0, _leased_0, _max_count_0) {
  return $Notice$advance$action$(($Notice$decide$(_remaining_0, _count_0, _maximum_0)), _suppressed_0, _pending_0, _leased_0, _max_count_0);
}

function $NoticeState$pending_count$(_pending_0) {
  if (_pending_0.$ === "Some") {
    const _t_0 = _pending_0["value"];
    const _count_0 = _t_0["count"];
    return {$: "Some", "value": _count_0};
  } else {
    return {$: "None"};
  }
}

function $NoticeState$pending_leased$(_pending_0) {
  if (_pending_0.$ === "Some") {
    const _t_0 = _pending_0["value"];
    const _leased_0 = _t_0["leased"];
    return _leased_0;
  } else {
    return false;
  }
}

function $NoticeState$record_id$(_record_0) {
  const _id_0 = _record_0["id"];
  return _id_0;
}

function $NoticeState$commit$(_state_0, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0) {
  const _records_0 = _state_0["records"];
  const _x_0 = ($List$length$(_records_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_key_0, 0)), ($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_reservation_0, 0)), ($Bool$and$(($Nat$is_gt$(_pending_0, 0)), ($Bool$and$(($Maybe$is_none$(($NoticeState$find_record$(_key_0, _records_0)))), (_x_0 < _maximum_keys_0))))))))))))), {$: "NoticeState.Granted", "state": {$: "NoticeState.State", "records": {$: "Con", "head": {$: "NoticeState.Record", "id": _key_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_0, "count": 0, "sequence": _sequence_0, "leased": false}}}, "tail": _records_0}}}, {$: "NoticeState.Refused", "state": {$: "NoticeState.State", "records": _records_0}});
}

function $NoticeState$prune_applied$(_state_0, _record_0, _decision_0) {
  const _id_0 = _record_0["id"];
  const _partition_0 = _record_0["partition"];
  const _group_0 = _record_0["group"];
  const _reservation_0 = _record_0["reservation"];
  const _suppressed_0 = _record_0["suppressed"];
  const _pending_0 = _record_0["pending"];
  const _drop_lease_0 = _decision_0["drop_lease"];
  const _drop_pending_0 = _decision_0["drop_pending"];
  const _t_0 = _decision_0["drop_key"];
  if (_t_0) {
    return {$: "NoticeState.Pruned", "state": {$: "NoticeState.State", "records": ($NoticeState$without$(_id_0, ($NoticeState$records_of$(_state_0))))}, "drop_lease": _drop_lease_0, "drop_pending": _drop_pending_0, "drop_key": true};
  } else {
    return {$: "NoticeState.Pruned", "state": ($NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _suppressed_0, "pending": ($NoticeState$prune_pending$(_pending_0, _drop_lease_0, _drop_pending_0))})), "drop_lease": _drop_lease_0, "drop_pending": _drop_pending_0, "drop_key": false};
  }
}

function $Notice$prune$(_has_pending_0, _leased_0, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0) {
  const _x_0 = ($Bool$not$(_has_pending_0));
  return {$: "Notice.Prune", "drop_lease": ($Bool$and$(_has_pending_0, ($Bool$and$(_leased_0, _lease_expired_0)))), "drop_pending": ($Bool$and$(_has_pending_0, _pending_expired_0)), "drop_key": ($Bool$and$(($Bool$not$(_excepted_0)), ($Bool$and$(_cooldown_expired_0, (_x_0 || _pending_expired_0)))))};
}

function $NoticeState$without_choice$(_record_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _record_0, "tail": _tail_0};
  }
}

function $NoticeState$replace$(_state_0, _record_0) {
  const _records_0 = _state_0["records"];
  return {$: "NoticeState.State", "records": {$: "Con", "head": _record_0, "tail": ($NoticeState$without$(($NoticeState$record_id$(_record_0)), _records_0))}};
}

function $NoticeState$set_leased$(_pending_0, _leased_0) {
  if (_pending_0.$ === "Some") {
    const _t_0 = _pending_0["value"];
    const _id_0 = _t_0["id"];
    const _count_0 = _t_0["count"];
    const _sequence_0 = _t_0["sequence"];
    return {$: "Some", "value": {$: "NoticeState.Pending", "id": _id_0, "count": _count_0, "sequence": _sequence_0, "leased": _leased_0}};
  } else {
    return {$: "None"};
  }
}

function $NoticeState$pending_id$(_pending_0) {
  const _id_0 = _pending_0["id"];
  return _id_0;
}

function $NoticeState$collect_choice$(_found_0, _tail_0) {
  if (_found_0.$ === "Some") {
    const _pending_0 = _found_0["value"];
    return $NoticeState$insert_pending$(_pending_0, _tail_0);
  } else {
    return _tail_0;
  }
}

function $NoticeState$candidate$(_record_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0) {
  const _owner_0 = _record_0["partition"];
  const _delivery_group_0 = _record_0["group"];
  const _t_0 = _record_0["pending"];
  if (_t_0.$ === "Some") {
    const _pending_0 = _t_0["value"];
    const _x_0 = ($Bool$not$(_authority_bound_0));
    const _x_1 = ($NoticeState$contains$(($NoticeState$pending_id$(_pending_0)), _allowed_0));
    return $Bool$pick$(($Bool$and$(($Bool$pick$(_composed_0, ($Nat$is_eq$(_delivery_group_0, _group_0)), ($Nat$is_eq$(_owner_0, _partition_0)))), ($Bool$and$(($Bool$not$(($NoticeState$pending_leased$({$: "Some", "value": _pending_0})))), (_x_0 || _x_1))))), {$: "Some", "value": _pending_0}, {$: "None"});
  } else {
    return {$: "None"};
  }
}

function $Canonical$remove_round$(_partition_0, _rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _round_0 = _rounds_0["head"];
    const _rest_0 = _rounds_0["tail"];
    return $Canonical$remove_round_pick$(_round_0, ($Canonical$remove_round$(_partition_0, _rest_0)), ($Canonical$same_partition$(_partition_0, _round_0)));
  }
}

function $Canonical$output_terminal_current$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const __0 = _current_0["partition"];
  const __1 = _current_0["lifetime"];
  const __2 = _current_0["id"];
  const _waiting_0 = _current_0["waiting"];
  const _deciding_0 = _current_0["deciding"];
  const _t_0 = _current_0["write"];
  if (_t_0.$ === "Some") {
    const _token_0 = _t_0["value"];
    const __3 = _current_0["uncertain"];
    const _quiet_since_0 = _current_0["quiet_since"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "Some", "value": _token_0}, "uncertain": __3, "quiet_since": _quiet_since_0})), ($Nat$is_eq$(_token_0, _operation_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": ($Canonical$write_is_unknown$(_outcome_0)), "quiet_since": _quiet_since_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WriteRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$retire_current$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_round_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": ($Canonical$remove_round$(_partition_0, _rounds_0)), "work": ($Canonical$retain_other_work$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": ($CollectionState$retire_round$(_collection_0, _partition_0, _round_0)), "history": _history_0}, "commands": ($List$append$(($Canonical$release_all_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": {$: "Canonical.PartitionRetired", "round": _round_0}, "tail": {$: "Nil"}}))))};
}

function $List$is_empty$(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return true;
  } else {
    return false;
  }
}

function $Canonical$has_partition_work$(_partition_0, _work_0) {
  if (_work_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _work_0["head"];
    const _owner_0 = _t_0["partition"];
    const _rest_0 = _work_0["tail"];
    const _x_0 = ($Nat$is_eq$(_partition_0, _owner_0));
    const _x_1 = ($Canonical$has_partition_work$(_partition_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $Canonical$no_round_for_partition$(_partition_0, _rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _rounds_0["head"];
    const _owner_0 = _t_0["partition"];
    const _rest_0 = _rounds_0["tail"];
    return $Bool$and$(($Bool$not$(($Nat$is_eq$(_partition_0, _owner_0)))), ($Canonical$no_round_for_partition$(_partition_0, _rest_0)));
  }
}

function $Canonical$remove_admission$(_partition_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$retain_admission$(_item_0, ($Canonical$remove_admission$(_partition_0, _rest_0)), ($Canonical$admission_matches$(_partition_0, _item_0)));
  }
}

function $Canonical$admission_matches$(_partition_0, _item_0) {
  const _owner_0 = _item_0["partition"];
  return $Nat$is_eq$(_owner_0, _partition_0);
}

function $Ledger$fit_decision$(_limits_0, _global_0, _local_0, _bytes_0) {
  const _global_items_0 = _limits_0["global_items"];
  const _global_bytes_0 = _limits_0["global_bytes"];
  const _partition_items_0 = _limits_0["partition_items"];
  const _partition_bytes_0 = _limits_0["partition_bytes"];
  const _used_items_0 = _global_0["items"];
  const _used_bytes_0 = _global_0["bytes"];
  const _local_items_0 = _local_0["items"];
  const _local_bytes_0 = _local_0["bytes"];
  return $Bool$pick$(($Nat$is_gt$(nat_chk(_used_items_0 + 1), _global_items_0)), {$: "Ledger.GlobalItemLimit"}, ($Bool$pick$(($Nat$is_gt$(nat_chk(_used_bytes_0 + _bytes_0), _global_bytes_0)), {$: "Ledger.GlobalByteLimit"}, ($Bool$pick$(($Nat$is_gt$(nat_chk(_local_items_0 + 1), _partition_items_0)), {$: "Ledger.PartitionItemLimit"}, ($Bool$pick$(($Nat$is_gt$(nat_chk(_local_bytes_0 + _bytes_0), _partition_bytes_0)), {$: "Ledger.PartitionByteLimit"}, {$: "Ledger.Fits"})))))));
}

function $Ledger$decision_fits$(_decision_0) {
  if (_decision_0.$ === "Ledger.Fits") {
    return true;
  } else {
    return false;
  }
}

function $Ledger$total$add$(_usage_0, _bytes_0) {
  const _items_0 = _usage_0["items"];
  const _current_bytes_0 = _usage_0["bytes"];
  return {$: "Ledger.Usage", "items": nat_chk(_items_0 + 1), "bytes": nat_chk(_current_bytes_0 + _bytes_0)};
}

function $Ledger$partition_usage$add$(_usage_0, _bytes_0, _same_0) {
  const _items_0 = _usage_0["items"];
  const _current_bytes_0 = _usage_0["bytes"];
  if (_same_0) {
    return {$: "Ledger.Usage", "items": nat_chk(_items_0 + 1), "bytes": nat_chk(_current_bytes_0 + _bytes_0)};
  } else {
    return {$: "Ledger.Usage", "items": _items_0, "bytes": _current_bytes_0};
  }
}

function $Ledger$remove$(_id_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["bytes"];
    const __2 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$remove$pick$({$: "Ledger.Charge", "id": _current_0, "partition": __0, "bytes": __1, "purpose": __2}, ($Ledger$remove$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Ledger$resize_for$found$(_state_0, _id_0, _bytes_0, _purpose_0, _found_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  if (_found_0.$ === "None") {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  } else {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    const _others_0 = ($Ledger$remove$(_id_0, _charges_0));
    return $Ledger$resize_for$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, _purpose_0, ($Ledger$fits$(($Ledger$limits_for$(_purpose_0, _limits_0)), ($Ledger$total$(_others_0)), ($Ledger$partition_usage$(_others_0, _partition_0)), _bytes_0)));
  }
}

function $Canonical$capacity_replace_batch$(_state_0, _id_0, _partition_0, _released_0, _batch_0) {
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _ledger_0 = _batch_0["ledger"];
  const _commands_0 = _batch_0["commands"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationReleased", "id": _id_0, "after": ($Canonical$capacity_view$(_released_0, _partition_0))}, "tail": _commands_0}};
}

function $Canonical$capacity_replace_units$($0, $1, $2, $3) {
  for (;;) {
    {
      const _sizes_0 = $0;
      const _batch_0 = $1;
      const _partition_0 = $2;
      const _position_0 = $3;
      if (_sizes_0.$ === "Nil") {
        return _batch_0;
      } else {
        const _size_0 = _sizes_0["head"];
        const _rest_0 = _sizes_0["tail"];
        const _ledger_0 = _batch_0["ledger"];
        const _commands_0 = _batch_0["commands"];
        $0 = _rest_0;
        $1 = ($Canonical$capacity_replace_one$(_partition_0, _position_0, _size_0, _commands_0, ($Ledger$reserve_for$(_ledger_0, _partition_0, _size_0, {$: "Ledger.ReviewUnit"}))));
        $2 = _partition_0;
        $3 = nat_chk(_position_0 + 1);
        continue;
      }
    }
  }
}

function $Canonical$issue_permit_capacity_checked$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_available_0, _resident_available_0) {
  if (!_advicee_available_0) {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.AdviceePermitLimit"}};
  } else {
    if (!_resident_available_0) {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.ResidentPermitLimit"}};
    } else {
      return $Canonical$issue_result$(_state_0, _partition_0, ($Admission$step$(($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Issue", "tool": _tool_0, "started": _started_0, "deadline": _deadline_0, "now": _now_0})));
    }
  }
}

function $Canonical$pending_advicee_permits$(_partition_0, _admissions_0) {
  return $Canonical$pending_advicee_permits_found$(($Canonical$find_admission$(_partition_0, _admissions_0)));
}

function $Admission$prospective_gate_ordered$(_clock_valid_0, _within_0) {
  if (!_within_0) {
    return {$: "Admission.PermitLate"};
  } else {
    return $Bool$pick$(_clock_valid_0, {$: "Admission.PermitAllowed"}, {$: "Admission.PermitDenied"});
  }
}

function $EditHistory$mark_entries$(_tool_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _entries_0["head"];
    const _current_0 = _t_0["tool"];
    const _reason_0 = _t_0["reason"];
    const _reported_0 = _t_0["reported"];
    const _rest_0 = _entries_0["tail"];
    const _x_0 = ($Nat$is_eq$(_tool_0, _current_0));
    return {$: "Con", "head": {$: "EditHistory.Completed", "tool": _current_0, "reason": _reason_0, "reported": (_reported_0 || _x_0)}, "tail": ($EditHistory$mark_entries$(_tool_0, _rest_0))};
  }
}

function $EditHistory$record_entries$(_tool_0, _reason_0, _entries_0, _size_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "EditHistory.Recorded", "state": {$: "EditHistory.State", "entries": {$: "Con", "head": {$: "EditHistory.Completed", "tool": _tool_0, "reason": _reason_0, "reported": false}, "tail": {$: "Nil"}}}, "evicted": {$: "None"}};
  } else {
    const _t_0 = _entries_0["head"];
    const _oldest_0 = _t_0["tool"];
    const _old_reason_0 = _t_0["reason"];
    const _reported_0 = _t_0["reported"];
    const _tail_0 = _entries_0["tail"];
    return $Bool$pick$((_size_0 < 1000), {$: "EditHistory.Recorded", "state": {$: "EditHistory.State", "entries": ($List$append$({$: "Con", "head": {$: "EditHistory.Completed", "tool": _oldest_0, "reason": _old_reason_0, "reported": _reported_0}, "tail": _tail_0}, {$: "Con", "head": {$: "EditHistory.Completed", "tool": _tool_0, "reason": _reason_0, "reported": false}, "tail": {$: "Nil"}}))}, "evicted": {$: "None"}}, {$: "EditHistory.Recorded", "state": {$: "EditHistory.State", "entries": ($List$append$(_tail_0, {$: "Con", "head": {$: "EditHistory.Completed", "tool": _tool_0, "reason": _reason_0, "reported": false}, "tail": {$: "Nil"}}))}, "evicted": {$: "Some", "value": _oldest_0}});
  }
}

function $Quiescence$facts_quiet$(_facts_0) {
  const _work_0 = _facts_0["native_work_idle"];
  const _advice_0 = _facts_0["advice_empty"];
  const _handoff_0 = _facts_0["handoff_idle"];
  const _stop_0 = _facts_0["stop_absent"];
  return $Bool$and$(_work_0, ($Bool$and$(_advice_0, ($Bool$and$(_handoff_0, _stop_0)))));
}

function $Canonical$quiet_admission$(_state_0, _partition_0, _lifetime_0) {
  return $Canonical$quiet_admission_state$(($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
}

function $Canonical$pending$(_partition_0, _lifetime_0, _round_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _kind_0 = _t_0["kind"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Canonical$unfinished$(_kind_0))));
    const _x_1 = ($Canonical$pending$(_partition_0, _lifetime_0, _round_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $Canonical$quiet_round_decision$(_state_0, _partition_0, _decision_0) {
  if (_decision_0.$ === "Quiescence.Busy") {
    return {$: "Canonical.Advanced", "state": ($Canonical$with_quiet_round$(_state_0, _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.QuietRoundBusy"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Quiescence.Waiting") {
    const _since_0 = _decision_0["since"];
    return {$: "Canonical.Advanced", "state": ($Canonical$with_quiet_round$(_state_0, _partition_0, {$: "Some", "value": _since_0})), "commands": {$: "Con", "head": {$: "Canonical.QuietRoundWaiting", "since": _since_0}, "tail": {$: "Nil"}}};
  } else {
    const _since_1 = _decision_0["since"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.QuietRoundExpired", "since": _since_1}, "tail": {$: "Nil"}}};
  }
}

function $Quiescence$decide$(_since_0, _now_0, _window_0, _quiet_0) {
  if (!_quiet_0) {
    return {$: "Quiescence.Busy"};
  } else {
    return $Quiescence$decide_quiet$(_since_0, _now_0, _window_0);
  }
}

function $Canonical$replace_quiet_round$(_partition_0, _since_0, _rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _rounds_0["head"];
    const _owner_0 = _t_0["partition"];
    const _lifetime_0 = _t_0["lifetime"];
    const _id_0 = _t_0["id"];
    const _waiting_0 = _t_0["waiting"];
    const _deciding_0 = _t_0["deciding"];
    const _write_0 = _t_0["write"];
    const _uncertain_0 = _t_0["uncertain"];
    const _previous_0 = _t_0["quiet_since"];
    const _rest_0 = _rounds_0["tail"];
    return {$: "Con", "head": {$: "Canonical.Round", "partition": _owner_0, "lifetime": _lifetime_0, "id": _id_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": _write_0, "uncertain": _uncertain_0, "quiet_since": ($Bool$pick$(($Nat$is_eq$(_partition_0, _owner_0)), _since_0, _previous_0))}, "tail": ($Canonical$replace_quiet_round$(_partition_0, _since_0, _rest_0))};
  }
}

function $Canonical$consume_existing$(_original_0, _updated_0, _partition_0, _lifetime_0, _round_0, _existing_0) {
  if (_existing_0.$ === "None") {
    return $Canonical$consume_opened$(_original_0, _round_0, ($Canonical$open$(_updated_0, _partition_0, _lifetime_0)));
  } else {
    const _t_0 = _existing_0["value"];
    const _owner_lifetime_0 = _t_0["lifetime"];
    return $Bool$pick$(($Nat$is_eq$(_lifetime_0, _owner_lifetime_0)), {$: "Canonical.Advanced", "state": ($Canonical$with_quiet_round$(_updated_0, _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.PermitConsumed", "round": _round_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": _original_0, "reason": {$: "Canonical.StaleRound"}});
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

function $Admission$initial$(_partition_0, _lifetime_0) {
  return {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": 0, "active": false, "closed_at": 0, "next_token": 1, "permits": {$: "Nil"}};
}

function $Admission$expire$due$(_state_0, _token_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return {$: "Admission.RemovePermit", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0))}};
}

function $Canonical$replace_work_kind_pick$(_item_0, _next_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _next_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $Canonical$same_ids$(_a_0, _b_0, _c_0, _x_0, _y_0, _z_0) {
  return $Bool$and$(($Nat$is_eq$(_a_0, _x_0)), ($Bool$and$(($Nat$is_eq$(_b_0, _y_0)), ($Nat$is_eq$(_c_0, _z_0)))));
}

function $Canonical$remove_work_pick$(_item_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $Canonical$prepared_released$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0, _result_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_bytes_0.$ === "Nil") {
    if (_result_0.$ === "Ledger.Rejected") {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
    } else {
      const _released_0 = _result_0["state"];
      return $Canonical$prepared_batch$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _charge_0, _partition_0, _released_0, {$: "Canonical.Batch", "ledger": _released_0, "work": {$: "Nil"}, "next_operation": _next_operation_0, "commands": {$: "Nil"}});
    }
  } else {
    const _size_0 = _bytes_0["head"];
    const _rest_0 = _bytes_0["tail"];
    if (_result_0.$ === "Ledger.Rejected") {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
    } else {
      const _released_1 = _result_0["state"];
      return $Canonical$prepared_batch$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _charge_0, _partition_0, _released_1, ($Canonical$admit_units$({$: "Con", "head": _size_0, "tail": _rest_0}, {$: "Canonical.Batch", "ledger": _released_1, "work": {$: "Nil"}, "next_operation": _next_operation_0, "commands": {$: "Nil"}}, _partition_0, _lifetime_0, _round_0, 1, _parent_0)));
    }
  }
}

function $Dispatch$request_for_work$(_items_0, _operation_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _work_0 = _t_0["operation"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_work_0, _operation_0));
    const _x_1 = ($Dispatch$request_for_work$(_rest_0, _operation_0));
    return (_x_0 || _x_1);
  }
}

function $Dispatch$max_requests$() {
  return 8;
}

function $Dispatch$request_remove$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Dispatch$request_matches$(_item_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), _rest_0, {$: "Con", "head": _item_0, "tail": ($Dispatch$request_remove$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))});
  }
}

function $Dispatch$request_started$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _work_0 = _t_0["operation"];
    const _id_0 = _t_0["request"];
    const __0 = _t_0["started"];
    const _interrupted_0 = _t_0["interrupted"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Dispatch$request_matches$({$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": __0, "interrupted": _interrupted_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": true, "interrupted": _interrupted_0}, "tail": _rest_0}, {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": __0, "interrupted": _interrupted_0}, "tail": ($Dispatch$request_started$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))});
  }
}

function $Dispatch$request_interrupted$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _work_0 = _t_0["operation"];
    const _id_0 = _t_0["request"];
    const _started_0 = _t_0["started"];
    const __0 = _t_0["interrupted"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Dispatch$request_matches$({$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": _started_0, "interrupted": __0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": _started_0, "interrupted": true}, "tail": _rest_0}, {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": _started_0, "interrupted": __0}, "tail": ($Dispatch$request_interrupted$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))});
  }
}

function $Canonical$request_settled_work$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.AtJev") {
      return $Canonical$request_settled_outcome$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0);
    } else {
      return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.JevObservationIgnored"}, "tail": {$: "Nil"}}};
    }
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.JevObservationIgnored"}, "tail": {$: "Nil"}}};
  }
}

function $Canonical$reviewed_retained_find$(_state_0, _operation_0, _charge_0, _ledger_0) {
  const _charges_0 = _ledger_0["charges"];
  return $Canonical$reviewed_retained_charge$(_state_0, _operation_0, _charge_0, ($Ledger$find$(_charge_0, _charges_0)));
}

function $Canonical$cancel_review_released$(_state_0, _operation_0, _charge_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    return $Canonical$cancel_review_dispatched$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _charge_0, ($Dispatch$discard$(_dispatch_0, {$: "Con", "head": _operation_0, "tail": {$: "Nil"}})));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Canonical$reviewed_stale_found$(_state_0, _operation_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
    } else if (_t_1.$ === "Canonical.AtJev") {
      return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$pump_remaining$(_remaining_0, _result_0) {
  if (_remaining_0 === 0) {
    return _result_0;
  } else {
    const _rest_0 = (_remaining_0 - 1);
    if (_result_0.$ === "Dispatch.Advanced") {
      const _t_0 = _result_0["state"];
      const _queued_0 = _t_0["queued"];
      const _running_0 = _t_0["running"];
      const __0 = _t_0["next_sequence"];
      const __1 = _t_0["closed"];
      const __2 = _t_0["requests"];
      const _commands_0 = _result_0["commands"];
      return $Bool$pick$(($Dispatch$may_pump$(_queued_0, _running_0)), ($Dispatch$pump_remaining$(_rest_0, ($Dispatch$pump_next$({$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": __0, "closed": __1, "requests": __2}, _commands_0)))), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": __0, "closed": __1, "requests": __2}, "commands": _commands_0});
    } else {
      const _state_0 = _result_0["state"];
      return {$: "Dispatch.Denied", "state": _state_0};
    }
  }
}

function $Dispatch$same_entry$(_entry_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _owner_0 = _entry_0["partition"];
  const _generation_0 = _entry_0["lifetime"];
  const _current_0 = _entry_0["round"];
  const _id_0 = _entry_0["operation"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Nat$is_eq$(_current_0, _round_0)), ($Nat$is_eq$(_id_0, _operation_0)))))));
}

function $Dispatch$filter_queued_one$(_entry_0, _hit_0, _tail_0) {
  if (_hit_0) {
    const _entries_0 = _tail_0["entries"];
    const _commands_0 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": _entries_0, "commands": {$: "Con", "head": ($Dispatch$discarded_entry$(_entry_0, false)), "tail": _commands_0}};
  } else {
    const _entries_1 = _tail_0["entries"];
    const _commands_1 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": _entry_0, "tail": _entries_1}, "commands": _commands_1};
  }
}

function $Dispatch$listed$(_ids_0, _operation_0) {
  if (_ids_0.$ === "Nil") {
    return false;
  } else {
    const _id_0 = _ids_0["head"];
    const _rest_0 = _ids_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _operation_0));
    const _x_1 = ($Dispatch$listed$(_rest_0, _operation_0));
    return (_x_0 || _x_1);
  }
}

function $Dispatch$filter_running_one$(_entry_0, _hit_0, _tail_0) {
  const __0 = _entry_0["partition"];
  const __1 = _entry_0["lifetime"];
  const __2 = _entry_0["round"];
  const __3 = _entry_0["operation"];
  const __4 = _entry_0["sequence"];
  const _t_0 = _entry_0["cancelled"];
  if (_t_0) {
    const __5 = _entry_0["preparation"];
    const _entries_0 = _tail_0["entries"];
    const _commands_0 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": {$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": __3, "sequence": __4, "cancelled": true, "preparation": __5}, "tail": _entries_0}, "commands": _commands_0};
  } else {
    const __6 = _entry_0["preparation"];
    return $Dispatch$filter_running_hit$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": __3, "sequence": __4, "cancelled": _t_0, "preparation": __6}, _hit_0, _tail_0);
  }
}

function $Dispatch$discarded_entry$(_entry_0, _running_0) {
  const _operation_0 = _entry_0["operation"];
  return {$: "Dispatch.Discarded", "operation": _operation_0, "running": _running_0};
}

function $Canonical$stop_current$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _has_pending_0, _write_0, _uncertain_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($Bool$and$(_has_pending_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": true, "deciding": false, "write": _write_0, "uncertain": _uncertain_0, "quiet_since": {$: "None"}}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WaitForWork"}, "tail": {$: "Nil"}}}, ($Canonical$stop_output$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, _write_0, _uncertain_0)));
}

function $Canonical$scope_partition_seen$(_scopes_0, _partition_0) {
  if (_scopes_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _scopes_0["head"];
    const _owner_0 = _t_0["partition"];
    const _rest_0 = _scopes_0["tail"];
    const _x_0 = ($Nat$is_eq$(_owner_0, _partition_0));
    const _x_1 = ($Canonical$scope_partition_seen$(_rest_0, _partition_0));
    return (_x_0 || _x_1);
  }
}

function $Canonical$scope_round_valid$(_found_0, _partition_0, _lifetime_0, _round_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($Canonical$is_deciding$(_current_0)))));
  } else {
    return false;
  }
}

function $Canonical$scope_contains$(_scopes_0, _partition_0, _round_0) {
  if (_scopes_0.$ === "Nil") {
    return false;
  } else {
    const _scope_0 = _scopes_0["head"];
    const _rest_0 = _scopes_0["tail"];
    const _x_0 = ($Canonical$scope_matches$(_scope_0, _partition_0, _round_0));
    const _x_1 = ($Canonical$scope_contains$(_rest_0, _partition_0, _round_0));
    return (_x_0 || _x_1);
  }
}

function $Canonical$unfinished$(_kind_0) {
  if (_kind_0.$ === "Canonical.PendingFinding") {
    return false;
  } else {
    return true;
  }
}

function $Canonical$mark_stop_rounds$(_items_0, _group_0, _lifetime_0, _round_0, _scopes_0, _waiting_0, _deciding_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _partition_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["waiting"];
    const __1 = _t_0["deciding"];
    const __2 = _t_0["write"];
    const __3 = _t_0["uncertain"];
    const _quiet_since_0 = _t_0["quiet_since"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Canonical$same_round$(_group_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": __0, "deciding": __1, "write": __2, "uncertain": __3, "quiet_since": _quiet_since_0}));
    const _x_1 = ($Canonical$scope_contains$(_scopes_0, _partition_0, _current_0));
    return $Canonical$mark_stop_rounds_one$({$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": __0, "deciding": __1, "write": __2, "uncertain": __3, "quiet_since": _quiet_since_0}, ($Canonical$mark_stop_rounds$(_rest_0, _group_0, _lifetime_0, _round_0, _scopes_0, _waiting_0, _deciding_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), (_x_0 || _x_1))), _waiting_0, _deciding_0);
  }
}

function $Canonical$release_scoped_charges$($0, $1, $2, $3) {
  for (;;) {
    {
      const _items_0 = $0;
      const _ledger_0 = $1;
      const _lifetime_0 = $2;
      const _scopes_0 = $3;
      if (_items_0.$ === "Nil") {
        return _ledger_0;
      } else {
        const _t_0 = _items_0["head"];
        const _partition_0 = _t_0["partition"];
        const _generation_0 = _t_0["lifetime"];
        const _round_0 = _t_0["round"];
        const _charge_0 = _t_0["charge"];
        const _kind_0 = _t_0["kind"];
        const _rest_0 = _items_0["tail"];
        $0 = _rest_0;
        $1 = ($Bool$pick$(($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($Canonical$unfinished$(_kind_0)))))))), ($Canonical$release_charge$(_ledger_0, _charge_0)), _ledger_0));
        $2 = _lifetime_0;
        $3 = _scopes_0;
        continue;
      }
    }
  }
}

function $Canonical$retain_scoped_work$(_items_0, _lifetime_0, _scopes_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _partition_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _round_0 = _t_0["round"];
    const __0 = _t_0["operation"];
    const __1 = _t_0["charge"];
    const _kind_0 = _t_0["kind"];
    const __2 = _t_0["parent"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$retain_work_pick$({$: "Canonical.Work", "partition": _partition_0, "lifetime": _generation_0, "round": _round_0, "operation": __0, "charge": __1, "kind": _kind_0, "parent": __2}, ($Canonical$retain_scoped_work$(_rest_0, _lifetime_0, _scopes_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($Canonical$unfinished$(_kind_0)))))));
  }
}

function $Canonical$release_scoped_commands$(_items_0, _lifetime_0, _scopes_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _partition_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _round_0 = _t_0["round"];
    const _charge_0 = _t_0["charge"];
    const _kind_0 = _t_0["kind"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$release_pick$(_charge_0, ($Canonical$release_scoped_commands$(_rest_0, _lifetime_0, _scopes_0)), ($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($Canonical$unfinished$(_kind_0)))))))));
  }
}

function $Canonical$cancel_scoped_dispatch$(_dispatch_0, _work_0, _lifetime_0, _scopes_0) {
  const _queued_0 = _dispatch_0["queued"];
  const _running_0 = _dispatch_0["running"];
  return $List$append$(($Canonical$cancel_dispatch_entries$(_queued_0, _work_0, _lifetime_0, _scopes_0)), ($Canonical$cancel_dispatch_entries$(_running_0, _work_0, _lifetime_0, _scopes_0)));
}

function $Canonical$stop_group_end_apply$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, false, false)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.StopEnded"}, "tail": {$: "Nil"}}};
}

function $Canonical$end_scope_valid$(_found_0, _partition_0, _lifetime_0, _round_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0);
  } else {
    return false;
  }
}

function $CollectionState$keep_lease$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $CollectionState$owns_lease$(_state_0, _advice_0, _token_0) {
  const _leases_0 = _state_0["leases"];
  return $CollectionState$lease_owned$(_advice_0, _token_0, _leases_0);
}

function $DeliveryState$protected_advice_items$(_advice_0, _items_0, _slots_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["advice"];
    const _token_0 = _t_0["token"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_advice_0, _candidate_0)), ($DeliveryState$authorized_slot_token$(_token_0, _slots_0))));
    const _x_1 = ($DeliveryState$protected_advice_items$(_advice_0, _rest_0, _slots_0));
    return (_x_0 || _x_1);
  }
}

function $CollectionState$keep_ready$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $SubmissionState$forget$(_state_0, _advice_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return {$: "SubmissionState.State", "leases": ($SubmissionState$remove_advice_leases$(_advice_0, _leases_0)), "batches": ($SubmissionState$remove_advice_batches$(_advice_0, _batches_0))};
}

function $CollectionState$keep_claim$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $Canonical$selected_count$(_operation_0, _selected_0) {
  if (_selected_0.$ === "Nil") {
    return 0;
  } else {
    const _candidate_0 = _selected_0["head"];
    const _rest_0 = _selected_0["tail"];
    const _x_0 = ($Bool$pick$(($Nat$is_eq$(_operation_0, _candidate_0)), 1, 0));
    const _x_1 = ($Canonical$selected_count$(_operation_0, _rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Canonical$pending_count$($0, $1) {
  for (;;) {
    {
      const _operation_0 = $0;
      const _items_0 = $1;
      if (_items_0.$ === "Nil") {
        return 0;
      } else {
        const _t_0 = _items_0["head"];
        const _candidate_0 = _t_0["operation"];
        const _t_1 = _t_0["kind"];
        if (_t_1.$ === "Canonical.PendingFinding") {
          const _count_0 = _t_1["count"];
          const _rest_0 = _items_0["tail"];
          return $Bool$pick$(($Nat$is_eq$(_operation_0, _candidate_0)), _count_0, ($Canonical$pending_count$(_operation_0, _rest_0)));
        } else {
          const _rest_1 = _items_0["tail"];
          $0 = _operation_0;
          $1 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $DeliveryState$reserve$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  const _used_0 = ($DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), ($Bool$and$(($Nat$is_gt$(_attempt_0, 0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($DeliveryState$has_group$(_group_0, _slots_0)))), ($Bool$and$((_used_0 < 4), ($Nat$is_gt$(($List$length$(_selected_0)), 0)))))))))))))), {$: "DeliveryState.Granted", "state": ($DeliveryState$set_count$({$: "DeliveryState.State", "slots": {$: "Con", "head": {$: "DeliveryState.Slot", "group": _group_0, "round": _round_0, "attempt": _attempt_0, "token": _token_0, "selected": _selected_0, "phase": {$: "DeliveryState.Reserved"}}, "tail": _slots_0}, "counters": _counters_0, "submissions": _submissions_0}, _group_0, _round_0, nat_chk(_used_0 + 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": _submissions_0}});
}

function $DeliveryState$count$(_group_0, _round_0, _counters_0) {
  if (_counters_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _counters_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _used_0 = _t_0["used"];
    const _rest_0 = _counters_0["tail"];
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_round_0, _candidate_round_0)))), _used_0, ($DeliveryState$count$(_group_0, _round_0, _rest_0)));
  }
}

function $DeliveryState$reserved_owned$($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _group_0 = $0;
      const _round_0 = $1;
      const _attempt_0 = $2;
      const _token_0 = $3;
      const _slots_0 = $4;
      if (_slots_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _slots_0["head"];
        const _candidate_group_0 = _t_0["group"];
        const _candidate_round_0 = _t_0["round"];
        const _candidate_attempt_0 = _t_0["attempt"];
        const _candidate_token_0 = _t_0["token"];
        const _t_1 = _t_0["phase"];
        if (_t_1.$ === "DeliveryState.Reserved") {
          const _rest_0 = _slots_0["tail"];
          const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0))))))));
          const _x_1 = ($DeliveryState$reserved_owned$(_group_0, _round_0, _attempt_0, _token_0, _rest_0));
          return (_x_0 || _x_1);
        } else {
          const _rest_1 = _slots_0["tail"];
          $0 = _group_0;
          $1 = _round_0;
          $2 = _attempt_0;
          $3 = _token_0;
          $4 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $DeliveryState$set_count$(_state_0, _group_0, _round_0, _used_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return {$: "DeliveryState.State", "slots": _slots_0, "counters": {$: "Con", "head": {$: "DeliveryState.Counter", "group": _group_0, "round": _round_0, "used": _used_0}, "tail": ($DeliveryState$without_counter$(_group_0, _round_0, _counters_0))}, "submissions": _submissions_0};
}

function $DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _candidate_attempt_0 = _t_0["attempt"];
    const _candidate_token_0 = _t_0["token"];
    const __0 = _t_0["selected"];
    const __1 = _t_0["phase"];
    const _rest_0 = _slots_0["tail"];
    return $DeliveryState$keep_slot$({$: "DeliveryState.Slot", "group": _candidate_group_0, "round": _candidate_round_0, "attempt": _candidate_attempt_0, "token": _candidate_token_0, "selected": __0, "phase": __1}, ($DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)))))))));
  }
}

function $SubmissionState$token_ready$(_state_0, _group_0, _round_0, _token_0, _selected_0) {
  const _batches_0 = _state_0["batches"];
  return $Bool$and$(($SubmissionState$token_exists$(_token_0, _batches_0)), ($Bool$and$(($SubmissionState$token_ready_items$(_group_0, _round_0, _token_0, _batches_0)), ($SubmissionState$same_units$(($SubmissionState$token_units$(_token_0, _batches_0)), _selected_0)))));
}

function $DeliveryState$authorizable$($0, $1, $2, $3, $4, $5) {
  for (;;) {
    {
      const _group_0 = $0;
      const _round_0 = $1;
      const _attempt_0 = $2;
      const _token_0 = $3;
      const _selected_0 = $4;
      const _slots_0 = $5;
      if (_slots_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _slots_0["head"];
        const _candidate_group_0 = _t_0["group"];
        const _candidate_round_0 = _t_0["round"];
        const _candidate_attempt_0 = _t_0["attempt"];
        const _candidate_token_0 = _t_0["token"];
        const _candidate_selected_0 = _t_0["selected"];
        const _t_1 = _t_0["phase"];
        if (_t_1.$ === "DeliveryState.Reserved") {
          const _rest_0 = _slots_0["tail"];
          const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_token_0)), ($DeliveryState$same_selected$(_selected_0, _candidate_selected_0))))))))));
          const _x_1 = ($DeliveryState$authorizable$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _rest_0));
          return (_x_0 || _x_1);
        } else {
          const _rest_1 = _slots_0["tail"];
          $0 = _group_0;
          $1 = _round_0;
          $2 = _attempt_0;
          $3 = _token_0;
          $4 = _selected_0;
          $5 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $DeliveryState$authorize_result$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _result_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const __0 = _state_0["submissions"];
  if (_result_0.$ === "SubmissionState.Denied") {
    return {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": __0}};
  } else {
    const _submissions_0 = _result_0["state"];
    return {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Authorized"}, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}};
  }
}

function $SubmissionState$authorize_stop_token$(_state_0, _token_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  const _advices_0 = ($SubmissionState$stop_token_advices$(_token_0, _batches_0));
  return $Bool$pick$(($Nat$is_gt$(($List$length$(_advices_0)), 0)), ($SubmissionState$terminal_stop_result$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, ($SubmissionState$authorize_each$(_advices_0, {$: "Some", "value": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}}, _token_0)))), {$: "SubmissionState.Denied", "state": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}});
}

function $DeliveryState$terminal_owned$($0, $1, $2, $3, $4, $5) {
  for (;;) {
    {
      const _group_0 = $0;
      const _round_0 = $1;
      const _attempt_0 = $2;
      const _token_0 = $3;
      const _selected_0 = $4;
      const _slots_0 = $5;
      if (_slots_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _slots_0["head"];
        const _candidate_group_0 = _t_0["group"];
        const _candidate_round_0 = _t_0["round"];
        const _candidate_attempt_0 = _t_0["attempt"];
        const _candidate_token_0 = _t_0["token"];
        const _candidate_selected_0 = _t_0["selected"];
        const _t_1 = _t_0["phase"];
        if (_t_1.$ === "DeliveryState.Authorized") {
          const _rest_0 = _slots_0["tail"];
          const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_token_0)), ($DeliveryState$same_selected$(_selected_0, _candidate_selected_0))))))))));
          const _x_1 = ($DeliveryState$terminal_owned$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _rest_0));
          return (_x_0 || _x_1);
        } else {
          const _rest_1 = _slots_0["tail"];
          $0 = _group_0;
          $1 = _round_0;
          $2 = _attempt_0;
          $3 = _token_0;
          $4 = _selected_0;
          $5 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $DeliveryState$terminal_owned_result$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0) {
  const __0 = _state_0["slots"];
  const __1 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  if (_phase_0.$ === "DeliveryState.Submitted") {
    return $Bool$pick$(($SubmissionState$token_units_match$(_submissions_0, _token_0, _selected_0)), ($DeliveryState$terminal_submission_result$({$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Submitted"}, ($SubmissionState$terminal_stop_token$(_submissions_0, _token_0, true)))), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}});
  } else if (_phase_0.$ === "DeliveryState.Uncertain") {
    return $Bool$pick$(($SubmissionState$token_units_match$(_submissions_0, _token_0, _selected_0)), ($DeliveryState$terminal_submission_result$({$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Uncertain"}, ($SubmissionState$terminal_stop_token$(_submissions_0, _token_0, false)))), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}});
  } else {
    return {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, __0)), "counters": __1, "submissions": _submissions_0}};
  }
}

function $DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0, _submissions_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _candidate_attempt_0 = _t_0["attempt"];
    const _candidate_token_0 = _t_0["token"];
    const _phase_0 = _t_0["phase"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Bool$and$(($DeliveryState$durable_phase$(_phase_0, _token_0, _submissions_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0))))))))));
    const _x_1 = ($DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _rest_0, _submissions_0));
    return (_x_0 || _x_1);
  }
}

function $DeliveryState$reserved_token$(_group_0, _round_0, _token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _candidate_token_0 = _t_0["token"];
    const _phase_0 = _t_0["phase"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_token_0)), ($DeliveryState$phase_is_reserved$(_phase_0))))))));
    const _x_1 = ($DeliveryState$reserved_token$(_group_0, _round_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $DeliveryState$staging_locked$(_token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_0 = _t_0["token"];
    const _phase_0 = _t_0["phase"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_0)), ($DeliveryState$staging_locked_phase$(_phase_0))));
    const _x_1 = ($DeliveryState$staging_locked$(_token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $DeliveryState$submission_result$(_state_0, _result_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const __0 = _state_0["submissions"];
  if (_result_0.$ === "SubmissionState.Granted") {
    const _submissions_0 = _result_0["state"];
    return {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": _submissions_0}};
  } else {
    return {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": __0}};
  }
}

function $SubmissionState$begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_advice_0, 0)), ($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($SubmissionState$has_batch$(_advice_0, _token_0, _batches_0)))), ($Nat$is_gt$(($List$length$(_fingerprints_0)), 0)))))))))))), ($SubmissionState$begin_result$({$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0}, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0, ($SubmissionState$begin_many$(_fingerprints_0, {$: "Some", "value": {$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0}}, _advice_0, _round_0, _token_0, _surface_0, _authorize_now_0)))), {$: "SubmissionState.Denied", "state": {$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0}});
}

function $DeliveryState$slot_token$(_token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_0 = _t_0["token"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Nat$is_eq$(_token_0, _candidate_0));
    const _x_1 = ($DeliveryState$slot_token$(_token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $SubmissionState$authorize$(_state_0, _advice_0, _token_0) {
  return $SubmissionState$transition$(_state_0, _advice_0, _token_0, {$: "Delivery.Authorized"}, {$: "Delivery.Reserved"});
}

function $SubmissionState$terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  if (_certain_0) {
    return $SubmissionState$transition$(_state_0, _advice_0, _token_0, {$: "Delivery.Submitted"}, {$: "Delivery.Authorized"});
  } else {
    return $SubmissionState$transition$(_state_0, _advice_0, _token_0, {$: "Delivery.Uncertain"}, {$: "Delivery.Authorized"});
  }
}

function $DeliveryState$authorized_slot_token$($0, $1) {
  for (;;) {
    {
      const _token_0 = $0;
      const _slots_0 = $1;
      if (_slots_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _slots_0["head"];
        const _candidate_0 = _t_0["token"];
        const _t_1 = _t_0["phase"];
        if (_t_1.$ === "DeliveryState.Authorized") {
          const _rest_0 = _slots_0["tail"];
          const _x_0 = ($Nat$is_eq$(_token_0, _candidate_0));
          const _x_1 = ($DeliveryState$authorized_slot_token$(_token_0, _rest_0));
          return (_x_0 || _x_1);
        } else {
          const _rest_1 = _slots_0["tail"];
          $0 = _token_0;
          $1 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $SubmissionState$release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return $SubmissionState$release_lookup$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, ($SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $SubmissionState$suppresses$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const _leases_0 = _state_0["leases"];
  return $SubmissionState$suppresses_found$(_round_0, _surface_0, ($SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)));
}

function $SubmissionState$background_reofferable$(_state_0, _advice_0, _token_0) {
  const _batches_0 = _state_0["batches"];
  return $SubmissionState$reofferable_found$(($SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $SubmissionState$expired$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const _batches_0 = _state_0["batches"];
  return $SubmissionState$expired_found$(_elapsed_0, _lifetime_0, ($SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $RevisionState$register_found$(_state_0, _subject_0, _input_0, _add_member_0, _found_0) {
  const _entries_0 = _state_0["entries"];
  const _next_generation_0 = _state_0["next_generation"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _old_input_0 = _t_0["input"];
    const _generation_0 = _t_0["generation"];
    const _members_0 = _t_0["members"];
    const _updated_0 = ($Bool$pick$(_add_member_0, nat_chk(_members_0 + 1), _members_0));
    return $Bool$pick$(($Nat$is_eq$(_old_input_0, _input_0)), {$: "RevisionState.Reused", "state": {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _generation_0, "members": _updated_0}, "tail": ($RevisionState$without$(_subject_0, _entries_0))}, "next_generation": _next_generation_0}, "generation": _generation_0}, {$: "RevisionState.Replaced", "state": {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _next_generation_0, "members": 1}, "tail": ($RevisionState$without$(_subject_0, _entries_0))}, "next_generation": nat_chk(_next_generation_0 + 1)}, "generation": _next_generation_0});
  } else {
    return {$: "RevisionState.Replaced", "state": {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _next_generation_0, "members": 1}, "tail": _entries_0}, "next_generation": nat_chk(_next_generation_0 + 1)}, "generation": _next_generation_0};
  }
}

function $RevisionState$find$(_subject_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _entry_0 = _entries_0["head"];
    const _rest_0 = _entries_0["tail"];
    return $Bool$pick$(($RevisionState$same_subject$(_subject_0, _entry_0)), {$: "Some", "value": _entry_0}, ($RevisionState$find$(_subject_0, _rest_0)));
  }
}

function $RevisionState$release_found$(_state_0, _subject_0, _generation_0, _found_0) {
  const _entries_0 = _state_0["entries"];
  const _next_generation_0 = _state_0["next_generation"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _input_0 = _t_0["input"];
    const _current_0 = _t_0["generation"];
    const _members_0 = _t_0["members"];
    return $Bool$pick$(($Nat$is_eq$(_current_0, _generation_0)), ($Bool$pick$((1 < _members_0), {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _current_0, "members": (_members_0 < 1 ? 0 : _members_0 - 1)}, "tail": ($RevisionState$without$(_subject_0, _entries_0))}, "next_generation": _next_generation_0}, {$: "RevisionState.State", "entries": ($RevisionState$without$(_subject_0, _entries_0)), "next_generation": _next_generation_0})), {$: "RevisionState.State", "entries": _entries_0, "next_generation": _next_generation_0});
  } else {
    return {$: "RevisionState.State", "entries": _entries_0, "next_generation": _next_generation_0};
  }
}

function $RevisionState$current_found$(_input_0, _generation_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _retained_input_0 = _t_0["input"];
    const _retained_generation_0 = _t_0["generation"];
    return $Bool$and$(($Nat$is_eq$(_input_0, _retained_input_0)), ($Nat$is_eq$(_generation_0, _retained_generation_0)));
  } else {
    return false;
  }
}

function $RevisionState$superseded_found$(_candidate_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _current_0 = _t_0["generation"];
    return (_candidate_0 < _current_0);
  } else {
    return false;
  }
}

function $RevisionState$generation_found$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _current_0 = _t_0["generation"];
    return _current_0;
  } else {
    return 0;
  }
}

function $Admission$pending_count$(_state_0) {
  const _permits_0 = _state_0["permits"];
  return $List$length$(_permits_0);
}

function $ReuseState$route_cache_found$(_state_0, _id_0, _found_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_found_0.$ === "Some") {
    const _entry_0 = _found_0["value"];
    return {$: "ReuseState.Cached", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": ($List$append$(($ReuseState$without_entry$(_id_0, _cache_0)), {$: "Con", "head": _entry_0, "tail": {$: "Nil"}}))}};
  } else {
    return {$: "ReuseState.Own", "state": {$: "ReuseState.State", "claims": {$: "Con", "head": {$: "ReuseState.Claim", "id": _id_0, "attached": false}, "tail": _claims_0}, "cache": _cache_0}};
  }
}

function $ReuseState$without_entry$(_id_0, _cache_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    return $ReuseState$keep_entry$(_entry_0, ($ReuseState$without_entry$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, ($ReuseState$entry_id$(_entry_0)))));
  }
}

function $ReuseState$prepared_after_eviction$(_claims_0, _result_0) {
  const _t_0 = _result_0["state"];
  const _remaining_0 = _t_0["cache"];
  const _ids_0 = _result_0["ids"];
  return {$: "ReuseState.Prepared", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _remaining_0}, "evicted": _ids_0};
}

function $ReuseState$evict_for$(_cache_0, _incoming_0, _entry_limit_0, _byte_limit_0, _evicted_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Nil"}}, "ids": _evicted_0};
  } else {
    const _t_0 = _cache_0["head"];
    const _id_0 = _t_0["id"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["bytes"];
    const __2 = _t_0["reservation"];
    const _rest_0 = _cache_0["tail"];
    const _x_0 = ($ReuseState$cache_bytes$({$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": __0, "bytes": __1, "reservation": __2}, "tail": _rest_0}));
    const _x_1 = ($Nat$is_ge$(($List$length$({$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": __0, "bytes": __1, "reservation": __2}, "tail": _rest_0})), _entry_limit_0));
    const _x_2 = ($Nat$is_gt$(nat_chk(_x_0 + _incoming_0), _byte_limit_0));
    return $Bool$pick$((_x_1 || _x_2), ($ReuseState$evict_for$(_rest_0, _incoming_0, _entry_limit_0, _byte_limit_0, ($List$append$(_evicted_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})))), {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": __0, "bytes": __1, "reservation": __2}, "tail": _rest_0}}, "ids": _evicted_0});
  }
}

function $ReuseState$find_reservation$(_reservation_0, _cache_0) {
  if (_cache_0.$ === "Nil") {
    return false;
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    const _x_0 = ($Nat$is_eq$(_reservation_0, ($ReuseState$entry_reservation$(_entry_0))));
    const _x_1 = ($ReuseState$find_reservation$(_reservation_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $ReuseState$cache_bytes$(_cache_0) {
  if (_cache_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _cache_0["head"];
    const _bytes_0 = _t_0["bytes"];
    const _rest_0 = _cache_0["tail"];
    const _x_0 = ($ReuseState$cache_bytes$(_rest_0));
    return nat_chk(_bytes_0 + _x_0);
  }
}

function $Notice$advance$action$(_action_0, _suppressed_0, _pending_0, _leased_0, _maximum_0) {
  if (_action_0.$ === "Notice.Suppress") {
    return {$: "Notice.Suppressed", "count": ($Notice$bounded_add$(_suppressed_0, 1, _maximum_0))};
  } else if (_action_0.$ === "Notice.RejectFull") {
    return {$: "Notice.RejectedFull"};
  } else if (_action_0.$ === "Notice.Create") {
    return {$: "Notice.CreateKey"};
  } else {
    return $Notice$refresh$(_pending_0, _leased_0, _suppressed_0, _maximum_0);
  }
}

function $Notice$decide$(_remaining_0, _count_0, _maximum_0) {
  if (_remaining_0.$ === "Some") {
    const _duration_0 = _remaining_0["value"];
    return $Bool$pick$(($Nat$is_gt$(_duration_0, 0)), {$: "Notice.Suppress"}, {$: "Notice.Refresh"});
  } else {
    return $Bool$pick$(($Nat$is_ge$(_count_0, _maximum_0)), {$: "Notice.RejectFull"}, {$: "Notice.Create"});
  }
}

function $NoticeState$records_of$(_state_0) {
  const _records_0 = _state_0["records"];
  return _records_0;
}

function $NoticeState$prune_pending$(_pending_0, _drop_lease_0, _drop_pending_0) {
  if (_pending_0.$ === "Some") {
    const _t_0 = _pending_0["value"];
    const _id_0 = _t_0["id"];
    const _count_0 = _t_0["count"];
    const _sequence_0 = _t_0["sequence"];
    const _leased_0 = _t_0["leased"];
    if (_drop_pending_0) {
      return {$: "None"};
    } else {
      return {$: "Some", "value": {$: "NoticeState.Pending", "id": _id_0, "count": _count_0, "sequence": _sequence_0, "leased": ($Bool$and$(_leased_0, ($Bool$not$(_drop_lease_0))))}};
    }
  } else {
    if (_drop_pending_0) {
      return {$: "None"};
    } else {
      return {$: "None"};
    }
  }
}

function $NoticeState$insert_pending$(_pending_0, _ordered_0) {
  if (_ordered_0.$ === "Nil") {
    return {$: "Con", "head": _pending_0, "tail": {$: "Nil"}};
  } else {
    const _head_0 = _ordered_0["head"];
    const _rest_0 = _ordered_0["tail"];
    return $Bool$pick$(($Nat$is_le$(($NoticeState$pending_sequence$(_pending_0)), ($NoticeState$pending_sequence$(_head_0)))), {$: "Con", "head": _pending_0, "tail": {$: "Con", "head": _head_0, "tail": _rest_0}}, {$: "Con", "head": _head_0, "tail": ($NoticeState$insert_pending$(_pending_0, _rest_0))});
  }
}

function $NoticeState$contains$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _item_0));
    const _x_1 = ($NoticeState$contains$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $Canonical$remove_round_pick$(_round_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _round_0, "tail": _tail_0};
  }
}

function $Canonical$write_is_unknown$(_outcome_0) {
  if (_outcome_0.$ === "Canonical.Unknown") {
    return true;
  } else {
    return false;
  }
}

function $Canonical$release_round_charges$($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _items_0 = $0;
      const _ledger_0 = $1;
      const _partition_0 = $2;
      const _lifetime_0 = $3;
      const _round_0 = $4;
      if (_items_0.$ === "Nil") {
        return _ledger_0;
      } else {
        const _t_0 = _items_0["head"];
        const _owner_0 = _t_0["partition"];
        const _generation_0 = _t_0["lifetime"];
        const _current_0 = _t_0["round"];
        const _charge_0 = _t_0["charge"];
        const _rest_0 = _items_0["tail"];
        $0 = _rest_0;
        $1 = ($Bool$pick$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Canonical$release_charge$(_ledger_0, _charge_0)), _ledger_0));
        $2 = _partition_0;
        $3 = _lifetime_0;
        $4 = _round_0;
        continue;
      }
    }
  }
}

function $Canonical$retain_other_work$(_items_0, _partition_0, _lifetime_0, _round_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const __0 = _t_0["operation"];
    const __1 = _t_0["charge"];
    const __2 = _t_0["kind"];
    const __3 = _t_0["parent"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$retain_work_pick$({$: "Canonical.Work", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": __0, "charge": __1, "kind": __2, "parent": __3}, ($Canonical$retain_other_work$(_rest_0, _partition_0, _lifetime_0, _round_0)), ($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)));
  }
}

function $CollectionState$retire_round$(_state_0, _group_0, _round_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": ($DeliveryState$retire_round$(_delivery_0, _group_0, _round_0)), "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $Canonical$release_all_commands$(_partition_0, _lifetime_0, _round_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _charge_0 = _t_0["charge"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$release_pick$(_charge_0, ($Canonical$release_all_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)))));
  }
}

function $Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _op_0 = _t_0["operation"];
    const _kind_0 = _t_0["kind"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$cancel_pick$(_op_0, ($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Bool$and$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Canonical$unfinished$(_kind_0)))));
  }
}

function $Canonical$retain_admission$(_item_0, _tail_0, _match_owner_0) {
  if (_match_owner_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $Ledger$remove$pick$(_charge_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
  }
}

function $Ledger$resize_for$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, _purpose_0, _allowed_0) {
  if (_allowed_0) {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($Ledger$replace_for$(_id_0, _bytes_0, _purpose_0, _charges_0))}, "id": _id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $Canonical$capacity_replace_one$(_partition_0, _position_0, _bytes_0, _commands_0, _result_0) {
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    const _id_0 = _result_0["id"];
    return {$: "Canonical.CapacityBatch", "ledger": _ledger_0, "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.CapacityUnitAdmitted", "reservation": _id_0, "position": _position_0, "bytes": _bytes_0, "after": ($Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}))};
  } else {
    const _ledger_1 = _result_0["state"];
    return {$: "Canonical.CapacityBatch", "ledger": _ledger_1, "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.CapacityUnitRefused", "position": _position_0, "bytes": _bytes_0, "reason": ($Ledger$admission$(_ledger_1, _partition_0, _bytes_0)), "after": ($Canonical$capacity_view$(_ledger_1, _partition_0))}, "tail": {$: "Nil"}}))};
  }
}

function $Canonical$issue_result$(_state_0, _partition_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["token"];
    if (_t_0.$ === "Some") {
      const _token_0 = _t_0["value"];
      const _t_1 = _result_0["round"];
      if (_t_1.$ === "Some") {
        const _round_0 = _t_1["value"];
        return {$: "Canonical.Advanced", "state": ($Canonical$with_quiet_round$(($Canonical$with_admission$(_state_0, _partition_0, _admission_0)), _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.PermitIssued", "token": _token_0, "round": _round_0}, "tail": {$: "Nil"}}};
      } else {
        return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.InconsistentLedger"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.InconsistentLedger"}};
    }
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": _reason_0}};
  }
}

function $Canonical$pending_advicee_permits_found$(_found_0) {
  if (_found_0.$ === "None") {
    return 0;
  } else {
    const _admission_0 = _found_0["value"];
    return $Admission$pending_count$(_admission_0);
  }
}

function $Canonical$quiet_admission_state$(_admission_0) {
  const _active_0 = _admission_0["active"];
  const _permits_0 = _admission_0["permits"];
  return $Bool$and$(_active_0, ($List$is_empty$(_permits_0)));
}

function $Quiescence$decide_quiet$(_since_0, _now_0, _window_0) {
  if (_since_0.$ === "None") {
    return {$: "Quiescence.Waiting", "since": _now_0};
  } else {
    const _start_0 = _since_0["value"];
    return $Bool$pick$(($Nat$is_ge$(_now_0, _start_0)), ($Quiescence$decide_started$(_start_0, _now_0, _window_0)), {$: "Quiescence.Waiting", "since": _now_0});
  }
}

function $Canonical$consume_opened$(_original_0, _round_0, _opened_0) {
  if (_opened_0.$ === "Canonical.Advanced") {
    const _state_0 = _opened_0["state"];
    const _commands_0 = _opened_0["commands"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PermitConsumed", "round": _round_0}, "tail": _commands_0}};
  } else {
    const _reason_0 = _opened_0["reason"];
    return {$: "Canonical.Rejected", "state": _original_0, "reason": _reason_0};
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

function $Canonical$prepared_batch$(_state_0, _operation_0, _charge_0, _partition_0, _released_0, _batch_0) {
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _ledger_0 = _batch_0["ledger"];
  const _units_0 = _batch_0["work"];
  const _next_0 = _batch_0["next_operation"];
  const _commands_0 = _batch_0["commands"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($List$append$(($Canonical$remove_work$(_operation_0, _work_0)), _units_0)), "next_round": _next_round_0, "next_operation": _next_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationReleased", "id": _charge_0, "after": ($Canonical$capacity_view$(_released_0, _partition_0))}, "tail": _commands_0}};
}

function $Canonical$admit_units$($0, $1, $2, $3, $4, $5, $6) {
  for (;;) {
    {
      const _sizes_0 = $0;
      const _batch_0 = $1;
      const _partition_0 = $2;
      const _lifetime_0 = $3;
      const _round_0 = $4;
      const _position_0 = $5;
      const _parent_0 = $6;
      if (_sizes_0.$ === "Nil") {
        return _batch_0;
      } else {
        const _size_0 = _sizes_0["head"];
        const _rest_0 = _sizes_0["tail"];
        const _ledger_0 = _batch_0["ledger"];
        const _work_0 = _batch_0["work"];
        const _operation_0 = _batch_0["next_operation"];
        const _commands_0 = _batch_0["commands"];
        $0 = _rest_0;
        $1 = ($Canonical$admit_one$(($Ledger$reserve_for$(_ledger_0, _partition_0, _size_0, {$: "Ledger.ReviewUnit"})), _partition_0, _lifetime_0, _round_0, _operation_0, _position_0, _size_0, _parent_0, _work_0, _commands_0));
        $2 = _partition_0;
        $3 = _lifetime_0;
        $4 = _round_0;
        $5 = nat_chk(_position_0 + 1);
        $6 = _parent_0;
        continue;
      }
    }
  }
}

function $Canonical$request_settled_outcome$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0) {
  if (_outcome_0.$ === "Canonical.RequestFinding") {
    return $Canonical$append_review_disposition$(($Canonical$review_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Finding"}, _current_work_0)), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": {$: "Canonical.RequestFinding"}});
  } else if (_outcome_0.$ === "Canonical.RequestClear") {
    return $Canonical$append_review_disposition$(($Canonical$review_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Clear"}, _current_work_0)), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": {$: "Canonical.RequestClear"}});
  } else if (_outcome_0.$ === "Canonical.RequestInterrupted") {
    return $Canonical$append_review_disposition$(($Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Interrupted"})), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": {$: "Canonical.RequestInterrupted"}});
  } else {
    return $Canonical$append_review_disposition$(($Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Unavailable"})), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": _outcome_0});
  }
}

function $Canonical$reviewed_retained_charge$(_state_0, _operation_0, _charge_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _bytes_0 = _t_0["bytes"];
    return $Canonical$reviewed_retained_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($Ledger$resize_for$(_ledger_0, _charge_0, _bytes_0, {$: "Ledger.StoredResult"})));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Canonical$cancel_review_dispatched$(_original_0, _updated_0, _operation_0, _charge_0, _result_0) {
  const _ledger_0 = _updated_0["ledger"];
  const _rounds_0 = _updated_0["rounds"];
  const _work_0 = _updated_0["work"];
  const _next_round_0 = _updated_0["next_round"];
  const _next_operation_0 = _updated_0["next_operation"];
  const _admissions_0 = _updated_0["admissions"];
  const _collection_0 = _updated_0["collection"];
  const _history_0 = _updated_0["history"];
  if (_result_0.$ === "Dispatch.Advanced") {
    const _dispatch_0 = _result_0["state"];
    const _commands_0 = _result_0["commands"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": {$: "Con", "head": {$: "Canonical.CancelWork", "operation": _operation_0}, "tail": ($Canonical$dispatch_commands$(_commands_0))}}};
  } else {
    return {$: "Canonical.Rejected", "state": _original_0, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$may_pump$(_queued_0, _running_0) {
  if (_queued_0.$ === "Nil") {
    return false;
  } else {
    const _entry_0 = _queued_0["head"];
    const _rest_0 = _queued_0["tail"];
    const _x_0 = ($Dispatch$can_start$(_entry_0, _running_0));
    const _x_1 = ($Dispatch$may_pump$(_rest_0, _running_0));
    return (_x_0 || _x_1);
  }
}

function $Dispatch$pump_next$(_first_0, _commands_0) {
  return $Dispatch$pump_next_result$(_first_0, _commands_0, ($Dispatch$pump_one$(_first_0)));
}

function $Dispatch$filter_running_hit$(_entry_0, _hit_0, _tail_0) {
  if (!_hit_0) {
    const _entries_0 = _tail_0["entries"];
    const _commands_0 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": _entry_0, "tail": _entries_0}, "commands": _commands_0};
  } else {
    const _entries_1 = _tail_0["entries"];
    const _commands_1 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": ($Dispatch$cancelled_entry$(_entry_0)), "tail": _entries_1}, "commands": {$: "Con", "head": ($Dispatch$discarded_entry$(_entry_0, true)), "tail": _commands_1}};
  }
}

function $Canonical$stop_output$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _write_0, _uncertain_0) {
  if (!_deadline_0) {
    if (_write_0.$ === "Some") {
      return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.WaitForOutput"}, "tail": {$: "Nil"}}};
    } else {
      return $Canonical$stop_ready$(_state_0, _partition_0, _lifetime_0, _round_0, false, _uncertain_0);
    }
  } else {
    return $Canonical$stop_ready$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _uncertain_0);
  }
}

function $Canonical$scope_matches$(_scope_0, _partition_0, _round_0) {
  const _owner_0 = _scope_0["partition"];
  const _current_0 = _scope_0["round"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Nat$is_eq$(_current_0, _round_0)));
}

function $Canonical$mark_stop_rounds_one$(_item_0, _tail_0, _hit_0, _waiting_0, _deciding_0) {
  if (_hit_0) {
    return $Canonical$mark_stop_rounds_hit$(_item_0, _tail_0, _waiting_0, _deciding_0);
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $Canonical$release_charge$(_ledger_0, _charge_0) {
  const _limits_0 = _ledger_0["limits"];
  const _next_id_0 = _ledger_0["next_id"];
  const _charges_0 = _ledger_0["charges"];
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($Ledger$remove$(_charge_0, _charges_0))};
}

function $Canonical$retain_work_pick$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $Canonical$release_pick$(_charge_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": _tail_0};
  } else {
    return _tail_0;
  }
}

function $Canonical$cancel_dispatch_entries$(_items_0, _work_0, _lifetime_0, _scopes_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _partition_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _round_0 = _t_0["round"];
    const _operation_0 = _t_0["operation"];
    const _cancelled_0 = _t_0["cancelled"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$cancel_pick$(_operation_0, ($Canonical$cancel_dispatch_entries$(_rest_0, _work_0, _lifetime_0, _scopes_0)), ($Bool$and$(($Bool$not$(_cancelled_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($Canonical$dispatch_work_unfinished$(($Canonical$find_work$(_partition_0, _generation_0, _round_0, _operation_0, _work_0)))))))))));
  }
}

function $SubmissionState$remove_advice_leases$(_advice_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["advice"];
    const __0 = _t_0["fingerprint"];
    const __1 = _t_0["current"];
    const __2 = _t_0["previous"];
    const _rest_0 = _items_0["tail"];
    return $SubmissionState$keep_record$({$: "SubmissionState.LeaseRecord", "advice": _candidate_0, "fingerprint": __0, "current": __1, "previous": __2}, ($SubmissionState$remove_advice_leases$(_advice_0, _rest_0)), ($Nat$is_eq$(_advice_0, _candidate_0)));
  }
}

function $SubmissionState$remove_advice_batches$(_advice_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["advice"];
    const __0 = _t_0["group"];
    const __1 = _t_0["round"];
    const __2 = _t_0["token"];
    const __3 = _t_0["surface"];
    const __4 = _t_0["phase"];
    const __5 = _t_0["fingerprints"];
    const __6 = _t_0["units"];
    const _rest_0 = _items_0["tail"];
    return $SubmissionState$keep_batch$({$: "SubmissionState.Batch", "advice": _candidate_0, "group": __0, "round": __1, "token": __2, "surface": __3, "phase": __4, "fingerprints": __5, "units": __6}, ($SubmissionState$remove_advice_batches$(_advice_0, _rest_0)), ($Nat$is_eq$(_advice_0, _candidate_0)));
  }
}

function $DeliveryState$has_group$(_group_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Nat$is_eq$(_group_0, _candidate_group_0));
    const _x_1 = ($DeliveryState$has_group$(_group_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $DeliveryState$without_counter$(_group_0, _round_0, _counters_0) {
  if (_counters_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _counters_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const __0 = _t_0["used"];
    const _rest_0 = _counters_0["tail"];
    return $DeliveryState$keep_counter$({$: "DeliveryState.Counter", "group": _candidate_group_0, "round": _candidate_round_0, "used": __0}, ($DeliveryState$without_counter$(_group_0, _round_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_round_0, _candidate_round_0)))));
  }
}

function $DeliveryState$keep_slot$(_item_0, _rest_0, _remove_0) {
  if (_remove_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _rest_0};
  }
}

function $SubmissionState$token_exists$(_token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["token"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_token_0, _candidate_0));
    const _x_1 = ($SubmissionState$token_exists$(_token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $SubmissionState$token_ready_items$(_group_0, _round_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _candidate_token_0 = _t_0["token"];
    const _phase_0 = _t_0["phase"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$not$(($Nat$is_eq$(_token_0, _candidate_token_0))));
    const _x_1 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($SubmissionState$phase_is$(_phase_0, {$: "Delivery.Reserved"}))))));
    return $Bool$and$((_x_0 || _x_1), ($SubmissionState$token_ready_items$(_group_0, _round_0, _token_0, _rest_0)));
  }
}

function $SubmissionState$same_units$(_left_0, _right_0) {
  if (_left_0.$ === "Nil") {
    if (_right_0.$ === "Nil") {
      return true;
    } else {
      return false;
    }
  } else {
    const _left_head_0 = _left_0["head"];
    const _left_rest_0 = _left_0["tail"];
    if (_right_0.$ === "Con") {
      const _right_head_0 = _right_0["head"];
      const _right_rest_0 = _right_0["tail"];
      return $Bool$and$(($Nat$is_eq$(_left_head_0, _right_head_0)), ($SubmissionState$same_units$(_left_rest_0, _right_rest_0)));
    } else {
      return false;
    }
  }
}

function $SubmissionState$token_units$(_token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["token"];
    const _units_0 = _t_0["units"];
    const _rest_0 = _items_0["tail"];
    return $SubmissionState$token_units_keep$(_units_0, ($SubmissionState$token_units$(_token_0, _rest_0)), ($Nat$is_eq$(_token_0, _candidate_0)));
  }
}

function $DeliveryState$same_selected$(_left_0, _right_0) {
  if (_left_0.$ === "Nil") {
    if (_right_0.$ === "Nil") {
      return true;
    } else {
      return false;
    }
  } else {
    const _head_0 = _left_0["head"];
    const _tail_0 = _left_0["tail"];
    if (_right_0.$ === "Nil") {
      return false;
    } else {
      const _other_0 = _right_0["head"];
      const _rest_0 = _right_0["tail"];
      return $Bool$and$(($Nat$is_eq$(_head_0, _other_0)), ($DeliveryState$same_selected$(_tail_0, _rest_0)));
    }
  }
}

function $DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _candidate_attempt_0 = _t_0["attempt"];
    const _candidate_token_0 = _t_0["token"];
    const __0 = _t_0["selected"];
    const __1 = _t_0["phase"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)))))))), {$: "Con", "head": {$: "DeliveryState.Slot", "group": _group_0, "round": _round_0, "attempt": _attempt_0, "token": _token_0, "selected": _selected_0, "phase": _phase_0}, "tail": _rest_0}, {$: "Con", "head": {$: "DeliveryState.Slot", "group": _candidate_group_0, "round": _candidate_round_0, "attempt": _candidate_attempt_0, "token": _candidate_token_0, "selected": __0, "phase": __1}, "tail": ($DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _rest_0))});
  }
}

function $SubmissionState$stop_token_advices$(_token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _candidate_0 = _t_0["token"];
    const _surface_0 = _t_0["surface"];
    const _rest_0 = _items_0["tail"];
    const _tail_0 = ($SubmissionState$stop_token_advices$(_token_0, _rest_0));
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_token_0, _candidate_0)), ($SubmissionState$stop_surface$(_surface_0)))), {$: "Con", "head": _advice_0, "tail": _tail_0}, _tail_0);
  }
}

function $SubmissionState$terminal_stop_result$(_original_0, _result_0) {
  if (_result_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _original_0};
  } else {
    const _state_0 = _result_0["value"];
    return {$: "SubmissionState.Granted", "state": _state_0};
  }
}

function $SubmissionState$authorize_each$($0, $1, $2) {
  for (;;) {
    {
      const _advices_0 = $0;
      const _current_0 = $1;
      const _token_0 = $2;
      if (_advices_0.$ === "Nil") {
        return _current_0;
      } else {
        const _advice_0 = _advices_0["head"];
        const _rest_0 = _advices_0["tail"];
        $0 = _rest_0;
        $1 = ($SubmissionState$authorize_one$(_current_0, _advice_0, _token_0));
        $2 = _token_0;
        continue;
      }
    }
  }
}

function $SubmissionState$token_units_match$(_state_0, _token_0, _selected_0) {
  const _batches_0 = _state_0["batches"];
  return $SubmissionState$same_units$(($SubmissionState$token_units$(_token_0, _batches_0)), _selected_0);
}

function $DeliveryState$terminal_submission_result$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _result_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const __0 = _state_0["submissions"];
  if (_result_0.$ === "SubmissionState.Denied") {
    return {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": __0}};
  } else {
    const _submissions_0 = _result_0["state"];
    return {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}};
  }
}

function $SubmissionState$terminal_stop_token$(_state_0, _token_0, _certain_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  const _advices_0 = ($SubmissionState$stop_token_advices$(_token_0, _batches_0));
  return $Bool$pick$(($Nat$is_gt$(($List$length$(_advices_0)), 0)), ($SubmissionState$terminal_stop_result$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, ($SubmissionState$terminal_each$(_advices_0, {$: "Some", "value": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}}, _token_0, _certain_0)))), {$: "SubmissionState.Denied", "state": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}});
}

function $DeliveryState$durable_phase$(_phase_0, _token_0, _submissions_0) {
  if (_phase_0.$ === "DeliveryState.Submitted") {
    return true;
  } else if (_phase_0.$ === "DeliveryState.Uncertain") {
    return true;
  } else if (_phase_0.$ === "DeliveryState.Failed") {
    return $Bool$not$(($SubmissionState$token_exists_state$(_submissions_0, _token_0)));
  } else {
    return false;
  }
}

function $DeliveryState$phase_is_reserved$(_phase_0) {
  if (_phase_0.$ === "DeliveryState.Reserved") {
    return true;
  } else {
    return false;
  }
}

function $DeliveryState$staging_locked_phase$(_phase_0) {
  if (_phase_0.$ === "DeliveryState.Reserved") {
    return false;
  } else {
    return true;
  }
}

function $SubmissionState$has_batch$(_advice_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($SubmissionState$batch_matches$(_advice_0, _token_0, _item_0));
    const _x_1 = ($SubmissionState$has_batch$(_advice_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $SubmissionState$begin_result$(_original_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0, _result_0) {
  if (_result_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _original_0};
  } else {
    const _t_0 = _result_0["value"];
    const _leases_0 = _t_0["leases"];
    const _batches_0 = _t_0["batches"];
    return {$: "SubmissionState.Granted", "state": {$: "SubmissionState.State", "leases": _leases_0, "batches": ($List$append$(_batches_0, {$: "Con", "head": {$: "SubmissionState.Batch", "advice": _advice_0, "group": _group_0, "round": _round_0, "token": _token_0, "surface": _surface_0, "phase": ($Bool$pick$(_authorize_now_0, {$: "Delivery.Authorized"}, {$: "Delivery.Reserved"})), "fingerprints": _fingerprints_0, "units": _units_0}, "tail": {$: "Nil"}}))}};
  }
}

function $SubmissionState$begin_many$($0, $1, $2, $3, $4, $5, $6) {
  for (;;) {
    {
      const _fingerprints_0 = $0;
      const _current_0 = $1;
      const _advice_0 = $2;
      const _round_0 = $3;
      const _token_0 = $4;
      const _surface_0 = $5;
      const _authorize_now_0 = $6;
      if (_fingerprints_0.$ === "Nil") {
        return _current_0;
      } else {
        const _fingerprint_0 = _fingerprints_0["head"];
        const _rest_0 = _fingerprints_0["tail"];
        $0 = _rest_0;
        $1 = ($SubmissionState$begin_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0));
        $2 = _advice_0;
        $3 = _round_0;
        $4 = _token_0;
        $5 = _surface_0;
        $6 = _authorize_now_0;
        continue;
      }
    }
  }
}

function $SubmissionState$transition$(_state_0, _advice_0, _token_0, _target_0, _required_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return $SubmissionState$transition_lookup$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, _target_0, _required_0, ($SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $SubmissionState$release_lookup$(_state_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _state_0};
  } else {
    const _batch_0 = _found_0["value"];
    return $SubmissionState$release_found$(_state_0, _batch_0);
  }
}

function $SubmissionState$find_batch$(_advice_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($SubmissionState$batch_matches$(_advice_0, _token_0, _item_0)), {$: "Some", "value": _item_0}, ($SubmissionState$find_batch$(_advice_0, _token_0, _rest_0)));
  }
}

function $SubmissionState$suppresses_found$(_round_0, _surface_0, _found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _current_0 = _t_0["current"];
    return $Handoff$lease$suppresses$(_current_0, _round_0, _surface_0);
  }
}

function $SubmissionState$find_lease$(_advice_0, _fingerprint_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($SubmissionState$record_matches$(_advice_0, _fingerprint_0, _item_0)), {$: "Some", "value": _item_0}, ($SubmissionState$find_lease$(_advice_0, _fingerprint_0, _rest_0)));
  }
}

function $SubmissionState$reofferable_found$(_found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _surface_0 = _t_0["surface"];
    const _phase_0 = _t_0["phase"];
    return $Delivery$background_reofferable$(_phase_0, ($SubmissionState$delivery_surface$(_surface_0)));
  }
}

function $SubmissionState$expired_found$(_elapsed_0, _lifetime_0, _found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _phase_0 = _t_0["phase"];
    return $Delivery$expired$(_phase_0, _elapsed_0, _lifetime_0);
  }
}

function $RevisionState$without$(_subject_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _entries_0["head"];
    const _rest_0 = _entries_0["tail"];
    return $RevisionState$keep_entry$(_entry_0, ($RevisionState$without$(_subject_0, _rest_0)), ($RevisionState$same_subject$(_subject_0, _entry_0)));
  }
}

function $RevisionState$same_subject$(_subject_0, _entry_0) {
  const _candidate_0 = _entry_0["subject"];
  return $Nat$is_eq$(_subject_0, _candidate_0);
}

function $ReuseState$keep_entry$(_entry_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _entry_0, "tail": _tail_0};
  }
}

function $ReuseState$entry_reservation$(_entry_0) {
  const _reservation_0 = _entry_0["reservation"];
  return _reservation_0;
}

function $Notice$bounded_add$(_left_0, _right_0, _maximum_0) {
  return $Notice$bounded_add$result$(_left_0, _right_0, _maximum_0, ($Nat$is_gt$(_right_0, (_maximum_0 < _left_0 ? 0 : _maximum_0 - _left_0))));
}

function $Notice$refresh$(_pending_0, _leased_0, _suppressed_0, _maximum_0) {
  if (_pending_0.$ === "None") {
    return {$: "Notice.CreatePending", "count": _suppressed_0};
  } else {
    const _count_0 = _pending_0["value"];
    return $Notice$refresh$leased$(_count_0, _suppressed_0, _maximum_0, _leased_0);
  }
}

function $NoticeState$pending_sequence$(_pending_0) {
  const _sequence_0 = _pending_0["sequence"];
  return _sequence_0;
}

function $DeliveryState$retire_round$(_state_0, _group_0, _round_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return {$: "DeliveryState.State", "slots": _slots_0, "counters": ($DeliveryState$without_counter$(_group_0, _round_0, _counters_0)), "submissions": _submissions_0};
}

function $Canonical$cancel_pick$(_operation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Canonical.CancelWork", "operation": _operation_0}, "tail": _tail_0};
  } else {
    return _tail_0;
  }
}

function $Ledger$replace_for$(_id_0, _bytes_0, _purpose_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const __0 = _t_0["bytes"];
    const __1 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$replace$pick$({$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": __0, "purpose": __1}, {$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": _bytes_0, "purpose": _purpose_0}, ($Ledger$replace_for$(_id_0, _bytes_0, _purpose_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Quiescence$decide_started$(_since_0, _now_0, _window_0) {
  return $Bool$pick$(($Nat$is_ge$(_now_0, nat_chk(_since_0 + _window_0))), {$: "Quiescence.Expired", "since": _since_0}, {$: "Quiescence.Waiting", "since": _since_0});
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

function $Admission$close_round$active$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _at_0) {
  if (!_active_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.RoundAlreadyClosed"}};
  } else {
    return $Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, ($Nat$is_ge$(_at_0, _closed_at_0)));
  }
}

function $Admission$restart$fresh$(_state_0, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.LifetimeNotFresh"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _new_lifetime_0, "round": 0, "active": false, "closed_at": _at_0, "next_token": 1, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $Admission$remove_permit$pick$(_permit_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _permit_0, "tail": _tail_0};
  }
}

function $Canonical$admit_one$(_result_0, _partition_0, _lifetime_0, _round_0, _operation_0, _position_0, _bytes_0, _parent_0, _work_0, _commands_0) {
  if (_result_0.$ === "Ledger.Granted") {
    const _granted_0 = _result_0["state"];
    const _id_0 = _result_0["id"];
    return {$: "Canonical.Batch", "ledger": _granted_0, "work": {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "charge": _id_0, "kind": {$: "Canonical.Reviewing"}, "parent": _parent_0}, "tail": _work_0}, "next_operation": nat_chk(_operation_0 + 1), "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.UnitAdmitted", "operation": _operation_0, "reservation": _id_0, "position": _position_0, "bytes": _bytes_0, "after": ($Canonical$capacity_view$(_granted_0, _partition_0))}, "tail": {$: "Nil"}}))};
  } else {
    const _unchanged_0 = _result_0["state"];
    return {$: "Canonical.Batch", "ledger": _unchanged_0, "work": _work_0, "next_operation": _operation_0, "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.UnitRefused", "position": _position_0, "bytes": _bytes_0, "reason": ($Ledger$admission$(_unchanged_0, _partition_0, _bytes_0)), "after": ($Canonical$capacity_view$(_unchanged_0, _partition_0))}, "tail": {$: "Nil"}}))};
  }
}

function $Canonical$reviewed_retained_result$(_state_0, _operation_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  if (_result_0.$ === "Ledger.Granted") {
    const _updated_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _updated_0, "rounds": _rounds_0, "work": ($Canonical$replace_work_kind$(_operation_0, {$: "Canonical.PendingFinding", "count": 1}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ReviewRecorded", "outcome": {$: "Canonical.Finding"}}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Dispatch$can_start$(_entry_0, _running_0) {
  const _t_0 = _entry_0["preparation"];
  if (!_t_0) {
    return true;
  } else {
    const _x_0 = ($Dispatch$preparation_count$(_running_0));
    const _x_1 = ($Dispatch$max_running$());
    return (_x_0 < _x_1);
  }
}

function $Dispatch$pump_next_result$(_first_0, _commands_0, _result_0) {
  if (_result_0.$ === "Dispatch.Advanced") {
    const _second_0 = _result_0["state"];
    const _more_0 = _result_0["commands"];
    return {$: "Dispatch.Advanced", "state": _second_0, "commands": ($List$append$(_commands_0, _more_0))};
  } else {
    return {$: "Dispatch.Denied", "state": _first_0};
  }
}

function $Dispatch$pump_one$(_state_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  return $Dispatch$pump_queued$(_queued_0, _running_0, _next_sequence_0, _closed_0, _requests_0);
}

function $Dispatch$cancelled_entry$(_entry_0) {
  const _partition_0 = _entry_0["partition"];
  const _lifetime_0 = _entry_0["lifetime"];
  const _round_0 = _entry_0["round"];
  const _operation_0 = _entry_0["operation"];
  const _sequence_0 = _entry_0["sequence"];
  const _preparation_0 = _entry_0["preparation"];
  return {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _sequence_0, "cancelled": true, "preparation": _preparation_0};
}

function $Canonical$stop_ready$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _uncertain_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_unfinished_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": false, "deciding": true, "write": {$: "None"}, "uncertain": _uncertain_0, "quiet_since": {$: "None"}}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": ($Canonical$retain_after_stop$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": ($List$append$(($Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": ($Bool$pick$(($Bool$and$(_uncertain_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.ReofferAtStop"}, {$: "Canonical.FinishReady"})), "tail": {$: "Nil"}}))))};
}

function $Canonical$mark_stop_rounds_hit$(_item_0, _tail_0, _waiting_0, _deciding_0) {
  const _partition_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["id"];
  const _write_0 = _item_0["write"];
  const _uncertain_0 = _item_0["uncertain"];
  const _quiet_since_0 = _item_0["quiet_since"];
  return {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": _write_0, "uncertain": _uncertain_0, "quiet_since": _quiet_since_0}, "tail": _tail_0};
}

function $Canonical$dispatch_work_unfinished$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _kind_0 = _t_0["kind"];
    return $Canonical$unfinished$(_kind_0);
  } else {
    return false;
  }
}

function $SubmissionState$keep_record$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $SubmissionState$keep_batch$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $DeliveryState$keep_counter$(_item_0, _rest_0, _remove_0) {
  if (_remove_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _rest_0};
  }
}

function $SubmissionState$phase_is$(_phase_0, _required_0) {
  if (_phase_0.$ === "Delivery.Reserved") {
    if (_required_0.$ === "Delivery.Reserved") {
      return true;
    } else {
      return false;
    }
  } else if (_phase_0.$ === "Delivery.Authorized") {
    if (_required_0.$ === "Delivery.Authorized") {
      return true;
    } else {
      return false;
    }
  } else if (_phase_0.$ === "Delivery.Submitted") {
    if (_required_0.$ === "Delivery.Submitted") {
      return true;
    } else {
      return false;
    }
  } else {
    if (_required_0.$ === "Delivery.Uncertain") {
      return true;
    } else {
      return false;
    }
  }
}

function $SubmissionState$token_units_keep$(_units_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return $List$append$(_units_0, _tail_0);
  } else {
    return _tail_0;
  }
}

function $SubmissionState$stop_surface$(_surface_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return true;
  } else {
    return false;
  }
}

function $SubmissionState$authorize_one$(_current_0, _advice_0, _token_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $SubmissionState$terminal_one_result$(($SubmissionState$authorize$(_state_0, _advice_0, _token_0)));
  }
}

function $SubmissionState$terminal_each$($0, $1, $2, $3) {
  for (;;) {
    {
      const _advices_0 = $0;
      const _current_0 = $1;
      const _token_0 = $2;
      const _certain_0 = $3;
      if (_advices_0.$ === "Nil") {
        return _current_0;
      } else {
        const _advice_0 = _advices_0["head"];
        const _rest_0 = _advices_0["tail"];
        $0 = _rest_0;
        $1 = ($SubmissionState$terminal_one$(_current_0, _advice_0, _token_0, _certain_0));
        $2 = _token_0;
        $3 = _certain_0;
        continue;
      }
    }
  }
}

function $SubmissionState$token_exists_state$(_state_0, _token_0) {
  const _batches_0 = _state_0["batches"];
  return $SubmissionState$token_exists$(_token_0, _batches_0);
}

function $SubmissionState$batch_matches$(_advice_0, _token_0, _item_0) {
  const _candidate_advice_0 = _item_0["advice"];
  const _candidate_token_0 = _item_0["token"];
  return $Bool$and$(($Nat$is_eq$(_advice_0, _candidate_advice_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)));
}

function $SubmissionState$begin_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $SubmissionState$begin_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0);
  }
}

function $SubmissionState$transition_lookup$(_state_0, _target_0, _required_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _state_0};
  } else {
    const _batch_0 = _found_0["value"];
    return $SubmissionState$transition_found$(_state_0, _batch_0, _target_0, _required_0);
  }
}

function $SubmissionState$release_found$(_state_0, _batch_0) {
  const _advice_0 = _batch_0["advice"];
  const _token_0 = _batch_0["token"];
  const _phase_0 = _batch_0["phase"];
  const _fingerprints_0 = _batch_0["fingerprints"];
  const _x_0 = ($SubmissionState$phase_is$(_phase_0, {$: "Delivery.Reserved"}));
  const _x_1 = ($SubmissionState$phase_is$(_phase_0, {$: "Delivery.Authorized"}));
  return $Bool$pick$((_x_0 || _x_1), {$: "SubmissionState.Granted", "state": ($SubmissionState$without_batch$(($SubmissionState$restore_many$(_fingerprints_0, _state_0, _advice_0)), _advice_0, _token_0))}, {$: "SubmissionState.Denied", "state": _state_0});
}

function $Handoff$lease$suppresses$(_state_0, _round_0, _requested_0) {
  const _owner_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _phase_0 = _state_0["phase"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _round_0)), ($Bool$and$(($Bool$not$(_closed_0)), ($Handoff$lease$suppress_phase$(_phase_0, _requested_0)))));
}

function $SubmissionState$record_matches$(_advice_0, _fingerprint_0, _item_0) {
  const _candidate_advice_0 = _item_0["advice"];
  const _candidate_fingerprint_0 = _item_0["fingerprint"];
  return $Bool$and$(($Nat$is_eq$(_advice_0, _candidate_advice_0)), ($Nat$is_eq$(_fingerprint_0, _candidate_fingerprint_0)));
}

function $Delivery$background_reofferable$(_phase_0, _surface_0) {
  if (_phase_0.$ === "Delivery.Submitted") {
    return false;
  } else if (_phase_0.$ === "Delivery.Uncertain") {
    if (_surface_0.$ === "Delivery.Background") {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $SubmissionState$delivery_surface$(_surface_0) {
  if (_surface_0.$ === "Handoff.Edit") {
    return {$: "Delivery.Edit"};
  } else if (_surface_0.$ === "Handoff.Background") {
    return {$: "Delivery.Background"};
  } else {
    return {$: "Delivery.Stop"};
  }
}

function $Delivery$expired$(_phase_0, _elapsed_0, _lifetime_0) {
  if (_phase_0.$ === "Delivery.Authorized") {
    return $Nat$is_ge$(_elapsed_0, _lifetime_0);
  } else {
    return false;
  }
}

function $RevisionState$keep_entry$(_entry_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _entry_0, "tail": _tail_0};
  }
}

function $Notice$bounded_add$result$(_left_0, _right_0, _maximum_0, _over_0) {
  if (_over_0) {
    return _maximum_0;
  } else {
    return nat_chk(_left_0 + _right_0);
  }
}

function $Notice$refresh$leased$(_count_0, _suppressed_0, _maximum_0, _leased_0) {
  if (_leased_0) {
    return {$: "Notice.KeepLeased"};
  } else {
    return {$: "Notice.MergePending", "count": ($Notice$bounded_add$(_count_0, _suppressed_0, _maximum_0))};
  }
}

function $Ledger$replace$pick$(_charge_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
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

function $Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.InvalidClock"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "Some", "value": _round_0}};
  }
}

function $Dispatch$preparation_count$($0) {
  for (;;) {
    {
      const _items_0 = $0;
      if (_items_0.$ === "Nil") {
        return 0;
      } else {
        const _t_0 = _items_0["head"];
        const _t_1 = _t_0["preparation"];
        if (_t_1) {
          const _rest_0 = _items_0["tail"];
          const _x_0 = ($Dispatch$preparation_count$(_rest_0));
          return nat_chk(1 + _x_0);
        } else {
          const _rest_1 = _items_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Dispatch$max_running$() {
  return 8;
}

function $Dispatch$pump_queued$(_queued_0, _running_0, _next_sequence_0, _closed_0, _requests_0) {
  if (_queued_0.$ === "Nil") {
    return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": {$: "Nil"}, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, "commands": {$: "Nil"}};
  } else {
    const _entry_0 = _queued_0["head"];
    const _rest_0 = _queued_0["tail"];
    return $Bool$pick$(($Dispatch$can_start$(_entry_0, _running_0)), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _rest_0, "running": ($List$append$(_running_0, {$: "Con", "head": _entry_0, "tail": {$: "Nil"}})), "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, "commands": {$: "Con", "head": ($Dispatch$start_command$(_entry_0)), "tail": {$: "Nil"}}}, ($Dispatch$prepend_waiting$(_entry_0, ($Dispatch$pump_queued$(_rest_0, _running_0, _next_sequence_0, _closed_0, _requests_0)))));
  }
}

function $Canonical$release_unfinished_charges$($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _items_0 = $0;
      const _ledger_0 = $1;
      const _partition_0 = $2;
      const _lifetime_0 = $3;
      const _round_0 = $4;
      if (_items_0.$ === "Nil") {
        return _ledger_0;
      } else {
        const _t_0 = _items_0["head"];
        const _owner_0 = _t_0["partition"];
        const _generation_0 = _t_0["lifetime"];
        const _current_0 = _t_0["round"];
        const _charge_0 = _t_0["charge"];
        const _kind_0 = _t_0["kind"];
        const _rest_0 = _items_0["tail"];
        $0 = _rest_0;
        $1 = ($Bool$pick$(($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Canonical$unfinished$(_kind_0)))))), ($Canonical$release_charge$(_ledger_0, _charge_0)), _ledger_0));
        $2 = _partition_0;
        $3 = _lifetime_0;
        $4 = _round_0;
        continue;
      }
    }
  }
}

function $Canonical$retain_after_stop$(_items_0, _partition_0, _lifetime_0, _round_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const __0 = _t_0["operation"];
    const __1 = _t_0["charge"];
    const _kind_0 = _t_0["kind"];
    const __2 = _t_0["parent"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$retain_work_pick$({$: "Canonical.Work", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": __0, "charge": __1, "kind": _kind_0, "parent": __2}, ($Canonical$retain_after_stop$(_rest_0, _partition_0, _lifetime_0, _round_0)), ($Bool$and$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Canonical$unfinished$(_kind_0)))));
  }
}

function $Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _charge_0 = _t_0["charge"];
    const _kind_0 = _t_0["kind"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$release_pick$(_charge_0, ($Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Canonical$unfinished$(_kind_0)))))));
  }
}

function $SubmissionState$terminal_one_result$(_result_0) {
  if (_result_0.$ === "SubmissionState.Granted") {
    const _next_0 = _result_0["state"];
    return {$: "Some", "value": _next_0};
  } else {
    return {$: "None"};
  }
}

function $SubmissionState$terminal_one$(_current_0, _advice_0, _token_0, _certain_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $SubmissionState$terminal_one_result$(($SubmissionState$terminal$(_state_0, _advice_0, _token_0, _certain_0)));
  }
}

function $SubmissionState$begin_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0) {
  const _leases_0 = _state_0["leases"];
  const __0 = _state_0["batches"];
  return $SubmissionState$begin_one_result$({$: "SubmissionState.State", "leases": _leases_0, "batches": __0}, _advice_0, _fingerprint_0, ($SubmissionState$staged_lease$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, ($SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)))));
}

function $SubmissionState$transition_found$(_state_0, _batch_0, _target_0, _required_0) {
  const _advice_0 = _batch_0["advice"];
  const __0 = _batch_0["group"];
  const _round_0 = _batch_0["round"];
  const _token_0 = _batch_0["token"];
  const __1 = _batch_0["surface"];
  const _phase_0 = _batch_0["phase"];
  const _fingerprints_0 = _batch_0["fingerprints"];
  const __2 = _batch_0["units"];
  return $Bool$pick$(($SubmissionState$phase_is$(_phase_0, _required_0)), ($SubmissionState$transition_result$(_state_0, {$: "SubmissionState.Batch", "advice": _advice_0, "group": __0, "round": _round_0, "token": _token_0, "surface": __1, "phase": _phase_0, "fingerprints": _fingerprints_0, "units": __2}, _target_0, ($SubmissionState$update_many$(_fingerprints_0, {$: "Some", "value": _state_0}, _advice_0, _round_0, _token_0, _target_0)))), {$: "SubmissionState.Denied", "state": _state_0});
}

function $SubmissionState$without_batch$(_state_0, _advice_0, _token_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return {$: "SubmissionState.State", "leases": _leases_0, "batches": ($SubmissionState$remove_batch$(_advice_0, _token_0, _batches_0))};
}

function $SubmissionState$restore_many$($0, $1, $2) {
  for (;;) {
    {
      const _fingerprints_0 = $0;
      const _state_0 = $1;
      const _advice_0 = $2;
      if (_fingerprints_0.$ === "Nil") {
        return _state_0;
      } else {
        const _fingerprint_0 = _fingerprints_0["head"];
        const _rest_0 = _fingerprints_0["tail"];
        $0 = _rest_0;
        $1 = ($SubmissionState$restore_one$(_state_0, _advice_0, _fingerprint_0));
        $2 = _advice_0;
        continue;
      }
    }
  }
}

function $Handoff$lease$suppress_phase$(_phase_0, _requested_0) {
  if (_phase_0.$ === "Handoff.Available") {
    return false;
  } else if (_phase_0.$ === "Handoff.Reserved") {
    return true;
  } else if (_phase_0.$ === "Handoff.Authorized") {
    return true;
  } else if (_phase_0.$ === "Handoff.Submitted") {
    return true;
  } else {
    const _surface_0 = _phase_0["surface"];
    return $Handoff$lease$suppress_surface$(_surface_0, _requested_0);
  }
}

function $Admission$consume$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, _correct_tool_0) {
  if (!_correct_tool_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongTool"}};
  } else {
    return $Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, ($Bool$and$(($Nat$is_gt$(_started_0, _closed_at_0)), ($Bool$and$(($Nat$is_le$(_started_0, _now_0)), ($Nat$is_le$(_now_0, _deadline_0)))))));
  }
}

function $Dispatch$start_command$(_entry_0) {
  const _operation_0 = _entry_0["operation"];
  const _sequence_0 = _entry_0["sequence"];
  return {$: "Dispatch.Started", "operation": _operation_0, "sequence": _sequence_0};
}

function $Dispatch$prepend_waiting$(_entry_0, _result_0) {
  if (_result_0.$ === "Dispatch.Advanced") {
    const _t_0 = _result_0["state"];
    const _queued_0 = _t_0["queued"];
    const _running_0 = _t_0["running"];
    const _next_sequence_0 = _t_0["next_sequence"];
    const _closed_0 = _t_0["closed"];
    const _requests_0 = _t_0["requests"];
    const _commands_0 = _result_0["commands"];
    return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": {$: "Con", "head": _entry_0, "tail": _queued_0}, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, "commands": _commands_0};
  } else {
    const _state_0 = _result_0["state"];
    return {$: "Dispatch.Denied", "state": _state_0};
  }
}

function $SubmissionState$begin_one_result$(_state_0, _advice_0, _fingerprint_0, _result_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  if (_result_0.$ === "Some") {
    const _record_0 = _result_0["value"];
    return {$: "Some", "value": {$: "SubmissionState.State", "leases": {$: "Con", "head": _record_0, "tail": ($SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0))}, "batches": _batches_0}};
  } else {
    return {$: "None"};
  }
}

function $SubmissionState$staged_lease$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, _previous_0) {
  if (_previous_0.$ === "None") {
    return $SubmissionState$staged_lease_from$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, ($Handoff$lease$initial$(_fingerprint_0, _round_0)), {$: "None"});
  } else {
    const _t_0 = _previous_0["value"];
    const _current_0 = _t_0["current"];
    return $SubmissionState$staged_lease_from$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, _current_0, {$: "Some", "value": _current_0});
  }
}

function $SubmissionState$transition_result$(_original_0, _batch_0, _target_0, _result_0) {
  if (_result_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _original_0};
  } else {
    const _state_0 = _result_0["value"];
    return $SubmissionState$transition_success$(_state_0, _batch_0, _target_0);
  }
}

function $SubmissionState$update_many$($0, $1, $2, $3, $4, $5) {
  for (;;) {
    {
      const _fingerprints_0 = $0;
      const _current_0 = $1;
      const _advice_0 = $2;
      const _round_0 = $3;
      const _token_0 = $4;
      const _target_0 = $5;
      if (_fingerprints_0.$ === "Nil") {
        return _current_0;
      } else {
        const _fingerprint_0 = _fingerprints_0["head"];
        const _rest_0 = _fingerprints_0["tail"];
        $0 = _rest_0;
        $1 = ($SubmissionState$update_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0));
        $2 = _advice_0;
        $3 = _round_0;
        $4 = _token_0;
        $5 = _target_0;
        continue;
      }
    }
  }
}

function $SubmissionState$remove_batch$(_advice_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $SubmissionState$keep_batch$(_item_0, ($SubmissionState$remove_batch$(_advice_0, _token_0, _rest_0)), ($SubmissionState$batch_matches$(_advice_0, _token_0, _item_0)));
  }
}

function $SubmissionState$restore_one$(_state_0, _advice_0, _fingerprint_0) {
  const _leases_0 = _state_0["leases"];
  const __0 = _state_0["batches"];
  return $SubmissionState$restore_found$({$: "SubmissionState.State", "leases": _leases_0, "batches": __0}, _advice_0, _fingerprint_0, ($SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)));
}

function $Handoff$lease$suppress_surface$(_own_0, _requested_0) {
  if (_own_0.$ === "Handoff.Background") {
    if (_requested_0.$ === "Handoff.Stop") {
      return false;
    } else {
      return true;
    }
  } else {
    return true;
  }
}

function $Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.Expired"}};
  } else {
    return $Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, ($Nat$is_eq$(_permitted_round_0, ($Admission$candidate_round$(_round_0, _active_0)))));
  }
}

function $SubmissionState$remove_record$(_advice_0, _fingerprint_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $SubmissionState$keep_record$(_item_0, ($SubmissionState$remove_record$(_advice_0, _fingerprint_0, _rest_0)), ($SubmissionState$record_matches$(_advice_0, _fingerprint_0, _item_0)));
  }
}

function $SubmissionState$staged_lease_from$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, _current_0, _previous_0) {
  return $SubmissionState$staged_lease_offered$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, ($Handoff$lease$offer$(_current_0, _round_0, _token_0, _surface_0, true)));
}

function $Handoff$lease$initial$(_item_0, _round_0) {
  return {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": false, "reoffered": false, "phase": {$: "Handoff.Available"}};
}

function $SubmissionState$transition_success$(_state_0, _batch_0, _target_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  const _advice_0 = _batch_0["advice"];
  const __0 = _batch_0["group"];
  const __1 = _batch_0["round"];
  const _token_0 = _batch_0["token"];
  const __2 = _batch_0["surface"];
  const __3 = _batch_0["phase"];
  const __4 = _batch_0["fingerprints"];
  const __5 = _batch_0["units"];
  return {$: "SubmissionState.Granted", "state": {$: "SubmissionState.State", "leases": _leases_0, "batches": ($List$append$(($SubmissionState$remove_batch$(_advice_0, _token_0, _batches_0)), {$: "Con", "head": ($SubmissionState$batch_phase$({$: "SubmissionState.Batch", "advice": _advice_0, "group": __0, "round": __1, "token": _token_0, "surface": __2, "phase": __3, "fingerprints": __4, "units": __5}, _target_0)), "tail": {$: "Nil"}}))}};
}

function $SubmissionState$update_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $SubmissionState$update_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0);
  }
}

function $SubmissionState$restore_found$(_state_0, _advice_0, _fingerprint_0, _found_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  if (_found_0.$ === "None") {
    return {$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0};
  } else {
    const _record_0 = _found_0["value"];
    return $SubmissionState$restore_previous$(_advice_0, _fingerprint_0, _leases_0, _batches_0, ($SubmissionState$restore_record$(_record_0)));
  }
}

function $Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, _correct_round_0) {
  if (!_correct_round_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.OldRound"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _permitted_round_0, "active": true, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0))}, "token": {$: "Some", "value": _token_0}, "round": {$: "Some", "value": _permitted_round_0}};
  }
}

function $SubmissionState$staged_lease_offered$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, _result_0) {
  if (_result_0.$ === "Handoff.Granted") {
    const _current_0 = _result_0["state"];
    return $SubmissionState$staged_lease_granted$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, _current_0);
  } else {
    return {$: "None"};
  }
}

function $Handoff$lease$offer$(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  const __0 = _state_0["item"];
  const __1 = _state_0["round"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  return $Handoff$lease$offer$phase$({$: "Handoff.Lease", "item": __0, "round": __1, "closed": __2, "reoffered": __3, "phase": _phase_0}, _round_0, _token_0, _surface_0, _fresh_0, _phase_0);
}

function $SubmissionState$batch_phase$(_batch_0, _phase_0) {
  const _advice_0 = _batch_0["advice"];
  const _group_0 = _batch_0["group"];
  const _round_0 = _batch_0["round"];
  const _token_0 = _batch_0["token"];
  const _surface_0 = _batch_0["surface"];
  const _fingerprints_0 = _batch_0["fingerprints"];
  const _units_0 = _batch_0["units"];
  return {$: "SubmissionState.Batch", "advice": _advice_0, "group": _group_0, "round": _round_0, "token": _token_0, "surface": _surface_0, "phase": _phase_0, "fingerprints": _fingerprints_0, "units": _units_0};
}

function $SubmissionState$update_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0) {
  const _leases_0 = _state_0["leases"];
  const __0 = _state_0["batches"];
  return $SubmissionState$update_one_found$({$: "SubmissionState.State", "leases": _leases_0, "batches": __0}, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0, ($SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)));
}

function $SubmissionState$restore_previous$(_advice_0, _fingerprint_0, _leases_0, _batches_0, _previous_0) {
  if (_previous_0.$ === "None") {
    return {$: "SubmissionState.State", "leases": ($SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0)), "batches": _batches_0};
  } else {
    const _record_0 = _previous_0["value"];
    return {$: "SubmissionState.State", "leases": {$: "Con", "head": _record_0, "tail": ($SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0))}, "batches": _batches_0};
  }
}

function $SubmissionState$restore_record$(_record_0) {
  const _advice_0 = _record_0["advice"];
  const _fingerprint_0 = _record_0["fingerprint"];
  const _t_0 = _record_0["previous"];
  if (_t_0.$ === "None") {
    return {$: "None"};
  } else {
    const _current_0 = _t_0["value"];
    return {$: "Some", "value": {$: "SubmissionState.LeaseRecord", "advice": _advice_0, "fingerprint": _fingerprint_0, "current": _current_0, "previous": {$: "None"}}};
  }
}

function $SubmissionState$staged_lease_granted$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, _current_0) {
  if (_authorize_now_0) {
    return $SubmissionState$staged_lease_authorize$(_advice_0, _fingerprint_0, _round_0, _token_0, _previous_0, ($Handoff$lease$authorize$(_current_0, _round_0, _token_0)));
  } else {
    return {$: "Some", "value": {$: "SubmissionState.LeaseRecord", "advice": _advice_0, "fingerprint": _fingerprint_0, "current": _current_0, "previous": _previous_0}};
  }
}

function $Handoff$lease$offer$phase$(_state_0, _round_0, _token_0, _surface_0, _fresh_0, _phase_0) {
  if (_phase_0.$ === "Handoff.Uncertain") {
    const _t_0 = _phase_0["surface"];
    if (_t_0.$ === "Handoff.Background") {
      return $Handoff$lease$offer$background$(_state_0, _round_0, _token_0, _surface_0, _fresh_0);
    } else {
      return $Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0);
    }
  } else {
    return $Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0);
  }
}

function $SubmissionState$update_one_found$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "None"};
  } else {
    const _record_0 = _found_0["value"];
    return $SubmissionState$update_one_result$(_state_0, _advice_0, _fingerprint_0, ($SubmissionState$step_record$(_record_0, _round_0, _token_0, _target_0)));
  }
}

function $SubmissionState$staged_lease_authorize$(_advice_0, _fingerprint_0, _round_0, _token_0, _previous_0, _result_0) {
  if (_result_0.$ === "Handoff.Granted") {
    const _current_0 = _result_0["state"];
    return {$: "Some", "value": {$: "SubmissionState.LeaseRecord", "advice": _advice_0, "fingerprint": _fingerprint_0, "current": _current_0, "previous": _previous_0}};
  } else {
    return {$: "None"};
  }
}

function $Handoff$lease$authorize$(_state_0, _round_0, _token_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff$lease$authorize$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $Handoff$lease$offer$background$(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return $Handoff$lease$reoffer$(_state_0, _round_0, _token_0, _fresh_0);
  } else {
    return $Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0);
  }
}

function $Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff$lease$reserve$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _surface_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $SubmissionState$update_one_result$(_state_0, _advice_0, _fingerprint_0, _result_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  if (_result_0.$ === "Some") {
    const _record_0 = _result_0["value"];
    return {$: "Some", "value": {$: "SubmissionState.State", "leases": {$: "Con", "head": _record_0, "tail": ($SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0))}, "batches": _batches_0}};
  } else {
    return {$: "None"};
  }
}

function $SubmissionState$step_record$(_record_0, _round_0, _token_0, _target_0) {
  const __0 = _record_0["advice"];
  const __1 = _record_0["fingerprint"];
  const _current_0 = _record_0["current"];
  const __2 = _record_0["previous"];
  return $SubmissionState$step_record_result$({$: "SubmissionState.LeaseRecord", "advice": __0, "fingerprint": __1, "current": _current_0, "previous": __2}, ($SubmissionState$lease_step$(_current_0, _round_0, _token_0, _target_0)));
}

function $Handoff$lease$authorize$guard$(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff$lease$authorize$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff$lease$reoffer$(_state_0, _round_0, _token_0, _fresh_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const __1 = _state_0["phase"];
  return $Handoff$lease$reoffer$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": __1}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$and$(($Bool$not$(_closed_0)), ($Bool$and$(($Bool$not$(_reoffered_0)), _fresh_0)))))));
}

function $Handoff$lease$reserve$guard$(_state_0, _token_0, _surface_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff$lease$reserve$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _surface_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $SubmissionState$step_record_result$(_record_0, _result_0) {
  const _advice_0 = _record_0["advice"];
  const _fingerprint_0 = _record_0["fingerprint"];
  const _previous_0 = _record_0["previous"];
  if (_result_0.$ === "Handoff.Granted") {
    const _current_0 = _result_0["state"];
    return {$: "Some", "value": {$: "SubmissionState.LeaseRecord", "advice": _advice_0, "fingerprint": _fingerprint_0, "current": _current_0, "previous": _previous_0}};
  } else {
    return {$: "None"};
  }
}

function $SubmissionState$lease_step$(_current_0, _round_0, _token_0, _target_0) {
  if (_target_0.$ === "Delivery.Authorized") {
    return $Handoff$lease$authorize$(_current_0, _round_0, _token_0);
  } else if (_target_0.$ === "Delivery.Submitted") {
    return $Handoff$lease$terminal$(_current_0, _round_0, _token_0, true);
  } else if (_target_0.$ === "Delivery.Uncertain") {
    return $Handoff$lease$terminal$(_current_0, _round_0, _token_0, false);
  } else {
    return {$: "Handoff.Denied", "state": _current_0};
  }
}

function $Handoff$lease$authorize$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Reserved") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $Handoff$lease$authorize$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat$is_eq$(_own_token_0, _token_0)));
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff$lease$reoffer$guard$(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff$lease$reoffer$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff$lease$reserve$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _surface_0) {
  if (_phase_0.$ === "Handoff.Available") {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff$lease$terminal$(_state_0, _round_0, _token_0, _certain_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff$lease$terminal$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _certain_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $Handoff$lease$authorize$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0) {
  if (_same_0) {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Authorized", "token": _own_token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _own_token_0, "surface": _surface_0}}};
  }
}

function $Handoff$lease$reoffer$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Submitted") {
    const _surface_0 = _phase_0["surface"];
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Submitted", "surface": _surface_0}}};
  } else if (_phase_0.$ === "Handoff.Uncertain") {
    const _surface_1 = _phase_0["surface"];
    return $Handoff$lease$reoffer$surface$(_item_0, _round_0, _closed_0, _reoffered_0, _surface_1, true, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff$lease$terminal$guard$(_state_0, _token_0, _certain_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff$lease$terminal$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _certain_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff$lease$reoffer$surface$(_item_0, _round_0, _closed_0, _reoffered_0, _surface_0, _uncertain_0, _token_0) {
  if (_surface_0.$ === "Handoff.Edit") {
    if (_uncertain_0) {
      return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Uncertain", "surface": {$: "Handoff.Edit"}}}};
    } else {
      return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Submitted", "surface": {$: "Handoff.Edit"}}}};
    }
  } else if (_surface_0.$ === "Handoff.Background") {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": true, "phase": {$: "Handoff.Reserved", "token": _token_0, "surface": {$: "Handoff.Stop"}}}};
  } else {
    if (_uncertain_0) {
      return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Uncertain", "surface": {$: "Handoff.Stop"}}}};
    } else {
      return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Submitted", "surface": {$: "Handoff.Stop"}}}};
    }
  }
}

function $Handoff$lease$terminal$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _certain_0) {
  if (_phase_0.$ === "Handoff.Authorized") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $Handoff$lease$terminal$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat$is_eq$(_own_token_0, _token_0)), _certain_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff$lease$terminal$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0, _certain_0) {
  if (_same_0) {
    if (_certain_0) {
      return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Submitted", "surface": _surface_0}}};
    } else {
      return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Uncertain", "surface": _surface_0}}};
    }
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Authorized", "token": _own_token_0, "surface": _surface_0}}};
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

const nat = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 48) {
    throw new TypeError("expected immediate Bend Nat");
  }
  return value;
};
const normalize = (value) => {
  if (typeof value === "number") return nat(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === "$" ? item : normalize(item)]));
  }
  return value;
};
export const bendCanonicalInitial = (limits) =>
  run_loop($Canonical$initial$(normalize(limits)));
export const bendCanonicalStep = (state, event) =>
  run_loop($Canonical$step$(state, normalize(event)));
export const bendCanonicalTotal = (state) =>
  run_loop($Ledger$total$(state.ledger.charges));
export const bendCanonicalPartitionUsage = (state, partition) =>
  run_loop($Ledger$partition_usage$(state.ledger.charges, nat(partition)));
export const bendCanonicalInventory = (state) =>
  run_loop($Ledger$inventory$(state.ledger.limits));
export const bendPreparationLimit = () =>
  run_loop($Dispatch$max_running$());
export const bendJevRequestLimit = () =>
  run_loop($Dispatch$max_requests$());
