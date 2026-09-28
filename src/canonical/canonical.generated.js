// hapsland-bend-source-sha256:d493b0d910d456fadb79ea06b87a4ee68ed1cab6e20de373c08f4bbf3bae0095
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

// An effect source registers each effect under its def's key, as in C.
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
    const _facts_0 = _event_0["facts"];
    return $Canonical$issue_permit$(_state_0, _partition_1, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _facts_0);
  } else if (_event_0.$ === "Canonical.ConsumePermit") {
    const _partition_2 = _event_0["partition"];
    const _lifetime_1 = _event_0["lifetime"];
    const _token_0 = _event_0["token"];
    const _tool_1 = _event_0["tool"];
    const _now_1 = _event_0["now"];
    return $Canonical$consume_permit$(_state_0, _partition_2, _lifetime_1, _token_0, _tool_1, _now_1);
  } else if (_event_0.$ === "Canonical.ReleasePermit") {
    const _partition_3 = _event_0["partition"];
    const _lifetime_2 = _event_0["lifetime"];
    const _token_1 = _event_0["token"];
    return $Canonical$release_permit$(_state_0, _partition_3, _lifetime_2, _token_1);
  } else if (_event_0.$ === "Canonical.ExpirePermit") {
    const _partition_4 = _event_0["partition"];
    const _lifetime_3 = _event_0["lifetime"];
    const _token_2 = _event_0["token"];
    const _deadline_reached_0 = _event_0["deadline_reached"];
    return $Canonical$expire_permit$(_state_0, _partition_4, _lifetime_3, _token_2, _deadline_reached_0);
  } else if (_event_0.$ === "Canonical.ClosePermitRound") {
    const _partition_5 = _event_0["partition"];
    const _lifetime_4 = _event_0["lifetime"];
    const _round_0 = _event_0["round"];
    const _at_0 = _event_0["at"];
    const _prospective_0 = _event_0["prospective"];
    return $Canonical$close_permit_round$(_state_0, _partition_5, _lifetime_4, _round_0, _at_0, _prospective_0);
  } else if (_event_0.$ === "Canonical.OpenRound") {
    const _partition_6 = _event_0["partition"];
    const _lifetime_5 = _event_0["lifetime"];
    return $Canonical$open$(_state_0, _partition_6, _lifetime_5);
  } else if (_event_0.$ === "Canonical.AdmitObservation") {
    const _partition_7 = _event_0["partition"];
    const _lifetime_6 = _event_0["lifetime"];
    const _round_1 = _event_0["round"];
    return $Canonical$admit_observation$(_state_0, _partition_7, _lifetime_6, _round_1);
  } else if (_event_0.$ === "Canonical.StartObservation") {
    const _partition_8 = _event_0["partition"];
    const _lifetime_7 = _event_0["lifetime"];
    const _round_2 = _event_0["round"];
    const _observation_0 = _event_0["observation"];
    return $Canonical$start_observation$(_state_0, _partition_8, _lifetime_7, _round_2, _observation_0);
  } else if (_event_0.$ === "Canonical.CompleteObservation") {
    const _partition_9 = _event_0["partition"];
    const _lifetime_8 = _event_0["lifetime"];
    const _round_3 = _event_0["round"];
    const _observation_1 = _event_0["observation"];
    return $Canonical$complete_observation$(_state_0, _partition_9, _lifetime_8, _round_3, _observation_1);
  } else if (_event_0.$ === "Canonical.InterruptObservation") {
    const _partition_10 = _event_0["partition"];
    const _lifetime_9 = _event_0["lifetime"];
    const _round_4 = _event_0["round"];
    const _observation_2 = _event_0["observation"];
    return $Canonical$interrupt_observation$(_state_0, _partition_10, _lifetime_9, _round_4, _observation_2);
  } else if (_event_0.$ === "Canonical.BeginPreparation") {
    const _partition_11 = _event_0["partition"];
    const _lifetime_10 = _event_0["lifetime"];
    const _round_5 = _event_0["round"];
    const _bytes_2 = _event_0["bytes"];
    return $Canonical$begin$(_state_0, _partition_11, _lifetime_10, _round_5, _bytes_2);
  } else if (_event_0.$ === "Canonical.BeginObservedPreparation") {
    const _partition_12 = _event_0["partition"];
    const _lifetime_11 = _event_0["lifetime"];
    const _round_6 = _event_0["round"];
    const _observation_3 = _event_0["observation"];
    const _bytes_3 = _event_0["bytes"];
    return $Canonical$begin_observed$(_state_0, _partition_12, _lifetime_11, _round_6, _observation_3, _bytes_3);
  } else if (_event_0.$ === "Canonical.InterruptPreparation") {
    const _partition_13 = _event_0["partition"];
    const _lifetime_12 = _event_0["lifetime"];
    const _round_7 = _event_0["round"];
    const _operation_0 = _event_0["operation"];
    return $Canonical$interrupt_preparation$(_state_0, _partition_13, _lifetime_12, _round_7, _operation_0);
  } else if (_event_0.$ === "Canonical.PreparationCompleted") {
    const _partition_14 = _event_0["partition"];
    const _lifetime_13 = _event_0["lifetime"];
    const _round_8 = _event_0["round"];
    const _operation_1 = _event_0["operation"];
    const _bytes_4 = _event_0["unit_bytes"];
    return $Canonical$prepared$(_state_0, _partition_14, _lifetime_13, _round_8, _operation_1, _bytes_4);
  } else if (_event_0.$ === "Canonical.StartReview") {
    const _partition_15 = _event_0["partition"];
    const _lifetime_14 = _event_0["lifetime"];
    const _round_9 = _event_0["round"];
    const _operation_2 = _event_0["operation"];
    return $Canonical$start_review$(_state_0, _partition_15, _lifetime_14, _round_9, _operation_2);
  } else if (_event_0.$ === "Canonical.ReviewCompleted") {
    const _partition_16 = _event_0["partition"];
    const _lifetime_15 = _event_0["lifetime"];
    const _round_10 = _event_0["round"];
    const _operation_3 = _event_0["operation"];
    const _outcome_0 = _event_0["outcome"];
    return $Canonical$reviewed$(_state_0, _partition_16, _lifetime_15, _round_10, _operation_3, _outcome_0);
  } else if (_event_0.$ === "Canonical.RetireReview") {
    const _partition_17 = _event_0["partition"];
    const _lifetime_16 = _event_0["lifetime"];
    const _round_11 = _event_0["round"];
    const _operation_4 = _event_0["operation"];
    return $Canonical$retire_review$(_state_0, _partition_17, _lifetime_16, _round_11, _operation_4);
  } else if (_event_0.$ === "Canonical.ReviewObserved") {
    const _partition_18 = _event_0["partition"];
    const _lifetime_17 = _event_0["lifetime"];
    const _round_12 = _event_0["round"];
    const _operation_5 = _event_0["operation"];
    const _outcome_1 = _event_0["outcome"];
    const _current_work_0 = _event_0["current_work"];
    return $Canonical$review_observed$(_state_0, _partition_18, _lifetime_17, _round_12, _operation_5, _outcome_1, _current_work_0);
  } else if (_event_0.$ === "Canonical.QueueDispatch") {
    const _partition_19 = _event_0["partition"];
    const _lifetime_18 = _event_0["lifetime"];
    const _round_13 = _event_0["round"];
    const _operation_6 = _event_0["operation"];
    return $Canonical$queue_dispatch$(_state_0, _partition_19, _lifetime_18, _round_13, _operation_6);
  } else if (_event_0.$ === "Canonical.DispatchSettled") {
    const _partition_20 = _event_0["partition"];
    const _lifetime_19 = _event_0["lifetime"];
    const _round_14 = _event_0["round"];
    const _operation_7 = _event_0["operation"];
    return $Canonical$settle_dispatch$(_state_0, _partition_20, _lifetime_19, _round_14, _operation_7);
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
    const _ticketed_0 = _event_0["ticketed"];
    return $Canonical$empty_prepared_check$(_state_0, _ready_count_0, _has_non_skipped_0, _ticketed_0);
  } else if (_event_0.$ === "Canonical.ReviewFailureCheck") {
    const _backend_or_timeout_0 = _event_0["backend_or_timeout"];
    const _credential_0 = _event_0["credential"];
    const _missing_0 = _event_0["missing"];
    return $Canonical$review_failure_check$(_state_0, _backend_or_timeout_0, _credential_0, _missing_0);
  } else if (_event_0.$ === "Canonical.StopPolled") {
    const _partition_21 = _event_0["partition"];
    const _lifetime_20 = _event_0["lifetime"];
    const _round_15 = _event_0["round"];
    const _deadline_1 = _event_0["deadline"];
    return $Canonical$stop$(_state_0, _partition_21, _lifetime_20, _round_15, _deadline_1);
  } else if (_event_0.$ === "Canonical.StopGroupPolled") {
    const _group_0 = _event_0["group"];
    const _lifetime_21 = _event_0["lifetime"];
    const _round_16 = _event_0["round"];
    const _scopes_0 = _event_0["scopes"];
    const _deadline_2 = _event_0["deadline"];
    const _extra_pending_0 = _event_0["extra_pending"];
    const _continuations_0 = _event_0["continuations"];
    return $Canonical$stop_group$(_state_0, _group_0, _lifetime_21, _round_16, _scopes_0, _deadline_2, _extra_pending_0, _continuations_0);
  } else if (_event_0.$ === "Canonical.StopGroupEnded") {
    const _group_1 = _event_0["group"];
    const _lifetime_22 = _event_0["lifetime"];
    const _round_17 = _event_0["round"];
    const _scopes_1 = _event_0["scopes"];
    return $Canonical$stop_group_end$(_state_0, _group_1, _lifetime_22, _round_17, _scopes_1);
  } else if (_event_0.$ === "Canonical.CollectionReady") {
    const _advice_0 = _event_0["advice"];
    const _already_0 = _event_0["already"];
    const _turn_end_0 = _event_0["turn_end"];
    const _cycle_complete_0 = _event_0["cycle_complete"];
    const _elapsed_0 = _event_0["elapsed"];
    const _window_0 = _event_0["window"];
    return $Canonical$collection_ready$(_state_0, _advice_0, _already_0, _turn_end_0, _cycle_complete_0, _elapsed_0, _window_0);
  } else if (_event_0.$ === "Canonical.CollectionCredentialCheck") {
    const _same_scope_0 = _event_0["same_scope"];
    const _generation_valid_0 = _event_0["generation_valid"];
    return $Canonical$collection_credential_result$(_state_0, ($Collection$credential_disposition$(_same_scope_0, _generation_valid_0)));
  } else if (_event_0.$ === "Canonical.CollectionCandidateCheck") {
    const _same_partition_0 = _event_0["same_partition"];
    const _unleased_0 = _event_0["unleased"];
    const _has_unsuppressed_0 = _event_0["has_unsuppressed"];
    const _ticket_owns_0 = _event_0["ticket_owns"];
    return $Canonical$collection_candidate$(_state_0, _same_partition_0, _unleased_0, _has_unsuppressed_0, _ticket_owns_0);
  } else if (_event_0.$ === "Canonical.CollectionOrderCheck") {
    const _left_cycle_0 = _event_0["left_cycle"];
    const _left_sequence_0 = _event_0["left_sequence"];
    const _right_cycle_0 = _event_0["right_cycle"];
    const _right_sequence_0 = _event_0["right_sequence"];
    return $Canonical$collection_order_result$(_state_0, ($Collection$order$(_left_cycle_0, _left_sequence_0, _right_cycle_0, _right_sequence_0)));
  } else if (_event_0.$ === "Canonical.CollectionExpiryCheck") {
    const _elapsed_1 = _event_0["elapsed"];
    const _lifetime_23 = _event_0["lifetime"];
    return $Canonical$collection_expiry$(_state_0, _elapsed_1, _lifetime_23);
  } else if (_event_0.$ === "Canonical.CollectionFitCheck") {
    const _items_0 = _event_0["items"];
    const _bytes_5 = _event_0["bytes"];
    return $Canonical$collection_fit$(_state_0, _items_0, _bytes_5);
  } else if (_event_0.$ === "Canonical.CollectionFindingCheck") {
    const _selection_partition_0 = _event_0["selection_partition"];
    const _selection_round_0 = _event_0["selection_round"];
    const _unit_0 = _event_0["unit"];
    const _partition_22 = _event_0["partition"];
    const _round_18 = _event_0["round"];
    const _snapshot_0 = _event_0["snapshot"];
    const _current_snapshot_0 = _event_0["current_snapshot"];
    const _credential_1 = _event_0["credential"];
    const _current_credential_0 = _event_0["current_credential"];
    const _age_ms_0 = _event_0["age_ms"];
    const _solo_bytes_0 = _event_0["solo_bytes"];
    const _collection_ready_0 = _event_0["collection_ready"];
    const _selected_count_0 = _event_0["selected_count"];
    const _prospective_bytes_0 = _event_0["prospective_bytes"];
    return $Canonical$collection_finding$(_state_0, _selection_partition_0, _selection_round_0, _unit_0, _partition_22, _round_18, _snapshot_0, _current_snapshot_0, _credential_1, _current_credential_0, _age_ms_0, _solo_bytes_0, _collection_ready_0, _selected_count_0, _prospective_bytes_0);
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
    const _elapsed_2 = _event_0["elapsed"];
    const _lifetime_24 = _event_0["lifetime"];
    return $Canonical$collection_expire_background$(_state_0, _group_4, _token_8, _elapsed_2, _lifetime_24);
  } else if (_event_0.$ === "Canonical.FinishReserve") {
    const _group_5 = _event_0["group"];
    const _lifetime_25 = _event_0["lifetime"];
    const _round_19 = _event_0["round"];
    const _attempt_0 = _event_0["attempt"];
    const _token_9 = _event_0["token"];
    const _selected_0 = _event_0["selected"];
    const _has_notice_0 = _event_0["has_notice"];
    const _pass_notices_0 = _event_0["pass_notices"];
    const _can_write_0 = _event_0["can_write"];
    const _binding_valid_0 = _event_0["binding_valid"];
    const _deadline_reached_1 = _event_0["deadline_reached"];
    return $Canonical$finish_reserve$(_state_0, _group_5, _lifetime_25, _round_19, _attempt_0, _token_9, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_1);
  } else if (_event_0.$ === "Canonical.FinishRelease") {
    const _group_6 = _event_0["group"];
    const _round_20 = _event_0["round"];
    const _attempt_1 = _event_0["attempt"];
    const _token_10 = _event_0["token"];
    return $Canonical$finish_release$(_state_0, _group_6, _round_20, _attempt_1, _token_10);
  } else if (_event_0.$ === "Canonical.FinishAuthorize") {
    const _group_7 = _event_0["group"];
    const _round_21 = _event_0["round"];
    const _attempt_2 = _event_0["attempt"];
    const _token_11 = _event_0["token"];
    const _selected_1 = _event_0["selected"];
    return $Canonical$finish_authorize$(_state_0, _group_7, _round_21, _attempt_2, _token_11, _selected_1);
  } else if (_event_0.$ === "Canonical.FinishTerminal") {
    const _group_8 = _event_0["group"];
    const _round_22 = _event_0["round"];
    const _attempt_3 = _event_0["attempt"];
    const _token_12 = _event_0["token"];
    const _selected_2 = _event_0["selected"];
    const _outcome_2 = _event_0["outcome"];
    return $Canonical$finish_terminal$(_state_0, _group_8, _round_22, _attempt_3, _token_12, _selected_2, _outcome_2);
  } else if (_event_0.$ === "Canonical.FinishEnd") {
    const _group_9 = _event_0["group"];
    const _round_23 = _event_0["round"];
    const _attempt_4 = _event_0["attempt"];
    const _token_13 = _event_0["token"];
    return $Canonical$finish_end$(_state_0, _group_9, _round_23, _attempt_4, _token_13);
  } else if (_event_0.$ === "Canonical.ContinuationConsume") {
    const _group_10 = _event_0["group"];
    const _round_24 = _event_0["round"];
    return $Canonical$continuation_consume$(_state_0, _group_10, _round_24);
  } else if (_event_0.$ === "Canonical.OutputStarted") {
    const _partition_23 = _event_0["partition"];
    const _lifetime_26 = _event_0["lifetime"];
    const _round_25 = _event_0["round"];
    return $Canonical$output_start$(_state_0, _partition_23, _lifetime_26, _round_25);
  } else if (_event_0.$ === "Canonical.OutputTerminal") {
    const _partition_24 = _event_0["partition"];
    const _lifetime_27 = _event_0["lifetime"];
    const _round_26 = _event_0["round"];
    const _operation_8 = _event_0["operation"];
    const _outcome_3 = _event_0["outcome"];
    return $Canonical$output_terminal$(_state_0, _partition_24, _lifetime_27, _round_26, _operation_8, _outcome_3);
  } else {
    const _partition_25 = _event_0["partition"];
    const _lifetime_28 = _event_0["lifetime"];
    const _round_27 = _event_0["round"];
    return $Canonical$retire$(_state_0, _partition_25, _lifetime_28, _round_27);
  }
}

function $Canonical$initial$(_limits_0) {
  return {$: "Canonical.State", "ledger": ($Ledger$initial$(_limits_0)), "rounds": {$: "Nil"}, "work": {$: "Nil"}, "next_round": 1, "next_operation": 1, "admissions": {$: "Nil"}, "dispatch": ($Dispatch$initial$()), "collection": ($CollectionState$initial$())};
}

function $Ledger$inventory$(_limits_0) {
  return {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.ObservationDispatch"}, "limits": ($Ledger$limits_for$({$: "Ledger.ObservationDispatch"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.Preparation"}, "limits": ($Ledger$limits_for$({$: "Ledger.Preparation"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.ReviewUnit"}, "limits": ($Ledger$limits_for$({$: "Ledger.ReviewUnit"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.StoredResult"}, "limits": ($Ledger$limits_for$({$: "Ledger.StoredResult"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.OperationalNotice"}, "limits": ($Ledger$limits_for$({$: "Ledger.OperationalNotice"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.AdviceRecheck"}, "limits": ($Ledger$limits_for$({$: "Ledger.AdviceRecheck"}, _limits_0))}, "tail": {$: "Nil"}}}}}}};
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
  return $Canonical$capacity_reserve_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _bytes_0, ($Ledger$reserve_for$(_ledger_0, _partition_0, _bytes_0, _purpose_0)));
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
  return $Canonical$capacity_resize_found$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": _dispatch_0, "collection": _collection_0}, _id_0, _bytes_0, _purpose_0, ($Ledger$find$(_id_0, _charges_0)));
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
  return $Canonical$capacity_release_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _id_0, ($Ledger$release$(_ledger_0, _id_0)));
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
  return $Canonical$capacity_replace_found$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": _dispatch_0, "collection": _collection_0}, _id_0, _sizes_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Canonical$issue_permit$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _facts_0) {
  return $Canonical$issue_permit_gate$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, ($Admission$prospective_gate$(_facts_0)));
}

function $Canonical$consume_permit$(_state_0, _partition_0, _lifetime_0, _token_0, _tool_0, _now_0) {
  return $Canonical$consume_result$(_state_0, _partition_0, ($Admission$step$(($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Consume", "token": _token_0, "tool": _tool_0, "now": _now_0})));
}

function $Canonical$release_permit$(_state_0, _partition_0, _lifetime_0, _token_0) {
  return $Canonical$permit_result$(_state_0, _partition_0, ($Admission$step$(($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Release", "token": _token_0})), {$: "Canonical.PermitReleased"});
}

function $Canonical$expire_permit$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0) {
  return $Canonical$expire_permit_checked$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0, ($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
}

function $Canonical$close_permit_round$(_state_0, _partition_0, _lifetime_0, _round_0, _at_0, _prospective_0) {
  return $Canonical$close_permit_checked$(_state_0, _partition_0, _lifetime_0, _round_0, _at_0, _prospective_0, ($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
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
  return $Canonical$open_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
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
  return $Canonical$admit_observation_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
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
  return $Canonical$observation_started_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _observation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
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
  return $Canonical$observation_completed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _observation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
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
  return $Canonical$interrupt_observation_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _observation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
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
  return $Canonical$begin_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _bytes_0, 0, ($Canonical$find_round$(_partition_0, _rounds_0)));
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
  return $Canonical$begin_observed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _observation_0, _bytes_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
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
  return $Canonical$prepared_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0, ($Canonical$find_round$(_partition_0, _rounds_0)), ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
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
  return $Canonical$start_review_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
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
  return $Canonical$reviewed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, _outcome_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
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
  return $Canonical$retire_review_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$review_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0) {
  return $Canonical$review_observed_choice$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, ($Work$evaluated_disposition$(($Canonical$is_finding$(_outcome_0)), _current_work_0)));
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
  return $Bool$pick$(($Canonical$work_dispatchable$(($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)))), ($Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, ($Dispatch$enqueue$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0)))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}});
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
  return $Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0}, ($Dispatch$settle$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0)));
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
  return $Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0}, ($Dispatch$discard$(_dispatch_0, _operations_0)));
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
  return $Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0}, ($Dispatch$close$(_dispatch_0)));
}

function $Canonical$prepared_offer_check$(_state_0, _ready_0, _within_frame_0) {
  return $Canonical$prepared_offer_result$(_state_0, ($Work$prepared_offer$(_ready_0, _within_frame_0)));
}

function $Canonical$empty_prepared_check$(_state_0, _ready_count_0, _has_non_skipped_0, _ticketed_0) {
  return $Canonical$empty_prepared_result$(_state_0, ($Work$empty_prepared$(_ready_count_0, _has_non_skipped_0, _ticketed_0)));
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
  return $Canonical$stop_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
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
  return $Canonical$stop_group_checked$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0}, _group_0, _lifetime_0, _round_0, _scopes_0, _deadline_0, _extra_pending_0, _continuations_0, ($Canonical$find_round$(_group_0, _rounds_0)));
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
  return $Canonical$stop_group_end_checked$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0}, _group_0, _lifetime_0, _round_0, _scopes_0, ($Canonical$find_round$(_group_0, _rounds_0)));
}

function $Canonical$collection_ready$(_state_0, _advice_0, _already_0, _turn_end_0, _cycle_complete_0, _elapsed_0, _window_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$mark_ready$(_collection_0, _advice_0, ($Collection$eligible$(_already_0, _turn_end_0, _cycle_complete_0, _elapsed_0, _window_0)))), {$: "Canonical.CollectionEligible"}, {$: "Canonical.CollectionWaiting"});
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

function $Canonical$collection_candidate$(_state_0, _same_partition_0, _unleased_0, _has_unsuppressed_0, _ticket_owns_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Delivery$advice_candidate$(_same_partition_0, _unleased_0, _has_unsuppressed_0, _ticket_owns_0)), {$: "Canonical.CollectionCandidate"}, {$: "Canonical.CollectionSkip"})), "tail": {$: "Nil"}}};
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

function $Collection$order$(_left_cycle_0, _left_sequence_0, _right_cycle_0, _right_sequence_0) {
  return $Bool$pick$((_left_cycle_0 < _right_cycle_0), {$: "Collection.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_cycle_0, _right_cycle_0)), {$: "Collection.After"}, ($Bool$pick$((_left_sequence_0 < _right_sequence_0), {$: "Collection.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_sequence_0, _right_sequence_0)), {$: "Collection.After"}, {$: "Collection.Equal"})))))));
}

function $Canonical$collection_expiry$(_state_0, _elapsed_0, _lifetime_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Collection$expired$(_elapsed_0, _lifetime_0)), {$: "Canonical.CollectionExpired"}, {$: "Canonical.CollectionCurrent"})), "tail": {$: "Nil"}}};
}

function $Canonical$collection_fit$(_state_0, _items_0, _bytes_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Handoff$fits_batch$(_items_0, _bytes_0)), {$: "Canonical.CollectionFits"}, {$: "Canonical.CollectionLimited"})), "tail": {$: "Nil"}}};
}

function $Canonical$collection_finding$(_state_0, _selection_partition_0, _selection_round_0, _unit_0, _partition_0, _round_0, _snapshot_0, _current_snapshot_0, _credential_0, _current_credential_0, _age_ms_0, _solo_bytes_0, _collection_ready_0, _selected_count_0, _prospective_bytes_0) {
  return $Canonical$collection_finding_result$(_state_0, ($Handoff$current$({$: "Handoff.Advice", "id": 1, "unit": _unit_0, "partition": _partition_0, "round": _round_0, "snapshot": _snapshot_0, "current_snapshot": _current_snapshot_0, "credential": _credential_0, "current_credential": _current_credential_0, "age_ms": _age_ms_0, "solo_bytes": _solo_bytes_0, "collection_ready": _collection_ready_0}, _selection_partition_0, _selection_round_0)), ($Nat$is_gt$(_solo_bytes_0, 2048)), ($Handoff$fits_batch$(nat_chk(_selected_count_0 + 1), _prospective_bytes_0)));
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$reserve$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseReserved"}, {$: "Canonical.CollectionLeaseRefused"});
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$release$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseReleased"}, {$: "Canonical.CollectionLeaseRefused"});
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
  return {$: "Canonical.Advanced", "state": ($Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$retire$(_collection_0, _advice_0)))), "commands": {$: "Con", "head": {$: "Canonical.CollectionAdviceRetired"}, "tail": {$: "Nil"}}};
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$claim$(_collection_0, _group_0, _token_0, _active_0, _capacity_0)), {$: "Canonical.CollectionBackgroundClaimed"}, {$: "Canonical.CollectionBackgroundRefused"});
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$release_claim$(_collection_0, _group_0, _token_0)), {$: "Canonical.CollectionBackgroundReleased"}, {$: "Canonical.CollectionBackgroundRefused"});
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$expire_claim$(_collection_0, _group_0, _token_0, _elapsed_0, _lifetime_0)), {$: "Canonical.CollectionBackgroundReleased"}, {$: "Canonical.CollectionBackgroundKept"});
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
  return $Bool$pick$(($Bool$not$(_can_write_0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5}, "commands": {$: "Con", "head": ($Bool$pick$(_deadline_reached_0, {$: "Canonical.FinishAllowedDeadline"}, {$: "Canonical.FinishAllowedNoAdvice"})), "tail": {$: "Nil"}}}, ($Bool$pick$(($Nat$is_eq$(($List$length$(_selected_0)), 0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5}, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_has_notice_0, _pass_notices_0)), {$: "Canonical.FinishNotices"}, ($Bool$pick$(_deadline_reached_0, {$: "Canonical.FinishAllowedDeadline"}, {$: "Canonical.FinishAllowedNoAdvice"})))), "tail": {$: "Nil"}}}, ($Bool$pick$(($Bool$and$(_binding_valid_0, ($Bool$and$(($Canonical$deciding_round$(($Canonical$find_round$(_group_0, _rounds_0)), _group_0, _lifetime_0, _round_0)), ($Canonical$selected_pending$(_selected_0, _work_0)))))), ($Canonical$finish_reserve_decision$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5}, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5}, "commands": {$: "Con", "head": {$: "Canonical.FinishAllowedUnavailable"}, "tail": {$: "Nil"}}})))));
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$finish_release$(_collection_0, _group_0, _round_0, _attempt_0, _token_0)), {$: "Canonical.FinishReleased"}, {$: "Canonical.FinishRefused"});
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$finish_authorize$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.FinishAuthorized"}, {$: "Canonical.FinishRefused"});
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
  if (_outcome_0.$ === "Canonical.Acknowledged") {
    return $Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, {$: "Canonical.Acknowledged"}, ($CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Submitted"})));
  } else if (_outcome_0.$ === "Canonical.Failed") {
    return $Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, {$: "Canonical.Failed"}, ($CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Failed"})));
  } else {
    return $Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, {$: "Canonical.Unknown"}, ($CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Uncertain"})));
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$finish_end$(_collection_0, _group_0, _round_0, _attempt_0, _token_0)), {$: "Canonical.FinishEnded"}, {$: "Canonical.FinishRefused"});
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$consume_continuation$(_collection_0, _group_0, _round_0)), {$: "Canonical.ContinuationConsumed"}, {$: "Canonical.ContinuationRefused"});
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
  return $Canonical$output_start_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
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
  return $Canonical$output_terminal_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
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
  return $Canonical$retire_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Ledger$initial$(_limits_0) {
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": 1, "charges": {$: "Nil"}};
}

function $Dispatch$initial$() {
  return {$: "Dispatch.State", "pending": {$: "Nil"}, "active": {$: "Nil"}, "running": {$: "Nil"}, "next_sequence": 0, "cycle": 0, "closed": false};
}

function $CollectionState$initial$() {
  return {$: "CollectionState.State", "ready": {$: "Nil"}, "leases": {$: "Nil"}, "claims": {$: "Nil"}, "delivery": ($DeliveryState$initial$())};
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

function $Canonical$capacity_reserve_result$(_state_0, _partition_0, _bytes_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    const _id_0 = _result_0["id"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityGranted", "id": _id_0, "after": ($Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}};
  } else {
    const _ledger_1 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityRefused", "reason": ($Ledger$admission$(_ledger_1, _partition_0, _bytes_0)), "after": ($Canonical$capacity_view$(_ledger_1, _partition_0))}, "tail": {$: "Nil"}}};
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
  if (_found_0.$ === "None") {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    return $Canonical$capacity_resize_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _id_0, _partition_0, _bytes_0, ($Ledger$resize_for$(_ledger_0, _id_0, _bytes_0, _purpose_0)));
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
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _id_0}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    const _t_1 = _t_0["purpose"];
    if (_t_1.$ === "Ledger.Preparation") {
      return $Canonical$capacity_replace_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _id_0, _partition_0, _sizes_0, ($Ledger$release$(_ledger_0, _id_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$issue_permit_gate$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _gate_0) {
  if (_gate_0.$ === "Admission.PermitDenied") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.ProspectiveDenied"}};
  } else {
    return $Canonical$issue_result$(_state_0, _partition_0, ($Admission$step$(($Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Issue", "tool": _tool_0, "started": _started_0, "deadline": _deadline_0, "now": _now_0})));
  }
}

function $Admission$prospective_gate$(_facts_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  const _within_hook_window_0 = _facts_0["within_hook_window"];
  const _started_after_closure_0 = _facts_0["started_after_closure"];
  const _duplicate_event_0 = _facts_0["duplicate_event"];
  const _permit_count_0 = _facts_0["permit_count"];
  const _permit_limit_0 = _facts_0["permit_limit"];
  const _round_count_0 = _facts_0["round_count"];
  const _round_limit_0 = _facts_0["round_limit"];
  const _new_round_0 = _facts_0["new_round"];
  const _event_count_0 = _facts_0["event_count"];
  const _event_limit_0 = _facts_0["event_limit"];
  const _x_0 = ($Bool$not$(_new_round_0));
  const _x_1 = (_round_count_0 < _round_limit_0);
  return $Bool$pick$(($Bool$and$(_clock_valid_0, ($Bool$and$(_within_hook_window_0, ($Bool$and$(_started_after_closure_0, ($Bool$and$(($Bool$not$(_duplicate_event_0)), ($Bool$and$((_permit_count_0 < _permit_limit_0), ($Bool$and$((_x_0 || _x_1), (_event_count_0 < _event_limit_0))))))))))))), {$: "Admission.PermitAllowed"}, {$: "Admission.PermitDenied"});
}

function $Canonical$consume_result$(_state_0, _partition_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["round"];
    if (_t_0.$ === "Some") {
      const _round_0 = _t_0["value"];
      return {$: "Canonical.Advanced", "state": ($Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": {$: "Canonical.PermitConsumed", "round": _round_0}, "tail": {$: "Nil"}}};
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
  const __5 = _state_0["used"];
  return $Admission$step$partition$({$: "Admission.AdmissionState", "partition": _owner_0, "lifetime": _live_0, "round": __0, "active": __1, "closed_at": __2, "next_token": __3, "permits": __4, "used": __5}, _partition_0, _lifetime_0, _event_0, ($Nat$is_eq$(_owner_0, _partition_0)), ($Nat$is_eq$(_live_0, _lifetime_0)));
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
  const __6 = _admission_0["used"];
  return $Bool$pick$(($Nat$is_eq$(_owner_lifetime_0, _lifetime_0)), ($Canonical$expire_permit_result$(_state_0, _partition_0, ($Admission$expire$({$: "Admission.AdmissionState", "partition": __0, "lifetime": _owner_lifetime_0, "round": __1, "active": __2, "closed_at": __3, "next_token": __4, "permits": __5, "used": __6}, _token_0, _deadline_reached_0)))), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.WrongLifetime"}}});
}

function $Canonical$close_permit_checked$(_state_0, _partition_0, _lifetime_0, _expected_0, _at_0, _prospective_0, _admission_0) {
  const __0 = _admission_0["partition"];
  const _owner_lifetime_0 = _admission_0["lifetime"];
  const _round_0 = _admission_0["round"];
  const _active_0 = _admission_0["active"];
  const __1 = _admission_0["closed_at"];
  const __2 = _admission_0["next_token"];
  const __3 = _admission_0["permits"];
  const __4 = _admission_0["used"];
  return $Bool$pick$(($Nat$is_eq$(_owner_lifetime_0, _lifetime_0)), ($Bool$pick$(($Nat$is_eq$(_expected_0, ($Admission$candidate_round$(_round_0, _active_0)))), ($Canonical$close_permit_apply$(_state_0, _partition_0, _lifetime_0, _at_0, _prospective_0, {$: "Admission.AdmissionState", "partition": __0, "lifetime": _owner_lifetime_0, "round": _round_0, "active": _active_0, "closed_at": __1, "next_token": __2, "permits": __3, "used": __4})), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}})), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.WrongLifetime"}}});
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
  if (_found_0.$ === "Some") {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}};
  } else {
    const _x_0 = ($List$length$(_rounds_0));
    return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Bool$and$(($Nat$is_gt$(_lifetime_0, 0)), (_x_0 < 256))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _next_round_0, "waiting": false, "deciding": false, "write": {$: "None"}, "uncertain": false}, "tail": _rounds_0}, "work": _work_0, "next_round": nat_chk(_next_round_0 + 1), "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.RoundStarted", "id": _next_round_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": ($Bool$pick$(($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Nat$is_gt$(_lifetime_0, 0)))), {$: "Canonical.RoundLimit"}, {$: "Canonical.InvalidIdentity"}))});
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

function $Canonical$admit_observation_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($Canonical$is_deciding$(_current_0)))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _next_operation_0, "charge": 0, "kind": {$: "Canonical.SourceQueued"}, "parent": 0}, "tail": _work_0}, "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationAdmitted", "id": _next_operation_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}};
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.SourceQueued") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$replace_work_kind$(_operation_0, {$: "Canonical.SourceReading"}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationStarted"}, "tail": {$: "Nil"}}};
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.SourceReading") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationCompleted"}, "tail": {$: "Nil"}}};
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.SourceQueued") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationInterrupted"}, "tail": {$: "Nil"}}};
      } else if (_t_2.$ === "Canonical.SourceReading") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationInterrupted"}, "tail": {$: "Nil"}}};
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
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
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$and$(($Bool$not$(($Canonical$is_deciding$(_current_0)))), ($Nat$is_gt$(_bytes_0, 0)))))), ($Canonical$begin_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _parent_0, ($Ledger$reserve_for$(_ledger_0, _partition_0, _bytes_0, {$: "Ledger.Preparation"})))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}};
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["charge"];
    if (_t_1 === 0) {
      const _t_2 = _t_0["kind"];
      if (_t_2.$ === "Canonical.SourceReading") {
        return $Canonical$begin_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _bytes_0, _observation_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
      } else {
        return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
      }
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($Canonical$replace_work_kind$(_operation_0, {$: "Canonical.AtJev"}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ReviewStarted"}, "tail": {$: "Nil"}}};
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.WrongStage"}};
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.PendingFinding") {
      return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Discarded"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
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

function $Bool$pick$(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
}

function $Canonical$work_dispatchable$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.SourceQueued") {
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
  if (_result_0.$ === "Dispatch.Advanced") {
    const _dispatch_0 = _result_0["state"];
    const _commands_0 = _result_0["commands"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": ($Canonical$dispatch_commands$(_commands_0))};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$enqueue$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _pending_0 = _state_0["pending"];
  const _active_0 = _state_0["active"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _cycle_0 = _state_0["cycle"];
  const _closed_0 = _state_0["closed"];
  const _x_0 = ($Dispatch$known$({$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0}, _partition_0, _lifetime_0, _round_0, _operation_0));
  return $Bool$pick$((_closed_0 || _x_0), {$: "Dispatch.Denied", "state": {$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0}}, ($Bool$pick$(($Bool$and$(($Nat$is_eq$(($List$length$(_active_0)), 0)), ($Nat$is_eq$(($List$length$(_running_0)), 0)))), ($Dispatch$pump_two$({$: "Dispatch.State", "pending": _pending_0, "active": {$: "Con", "head": {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _next_sequence_0, "cycle": nat_chk(_cycle_0 + 1), "cancelled": false}, "tail": {$: "Nil"}}, "running": _running_0, "next_sequence": nat_chk(_next_sequence_0 + 1), "cycle": nat_chk(_cycle_0 + 1), "closed": _closed_0})), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "pending": ($List$append$(_pending_0, {$: "Con", "head": {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _next_sequence_0, "cycle": 0, "cancelled": false}, "tail": {$: "Nil"}})), "active": _active_0, "running": _running_0, "next_sequence": nat_chk(_next_sequence_0 + 1), "cycle": _cycle_0, "closed": _closed_0}, "commands": {$: "Nil"}})));
}

function $Dispatch$settle$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _pending_0 = _state_0["pending"];
  const _active_0 = _state_0["active"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _cycle_0 = _state_0["cycle"];
  const _closed_0 = _state_0["closed"];
  return $Bool$pick$(($Dispatch$contains$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0)), ($Dispatch$after_settle$({$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": ($Dispatch$remove_entry$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0)), "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0})), {$: "Dispatch.Denied", "state": {$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0}});
}

function $Dispatch$discard$(_state_0, _ids_0) {
  const _pending_0 = _state_0["pending"];
  const _active_0 = _state_0["active"];
  const _running_0 = _state_0["running"];
  const __0 = _state_0["next_sequence"];
  const __1 = _state_0["cycle"];
  const __2 = _state_0["closed"];
  return $Dispatch$discarded_result$({$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": __0, "cycle": __1, "closed": __2}, ($Dispatch$filter_queued$(_pending_0, _ids_0)), ($Dispatch$filter_queued$(_active_0, _ids_0)), ($Dispatch$filter_running$(_running_0, _ids_0)));
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
  const _pending_0 = _state_0["pending"];
  const _active_0 = _state_0["active"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _cycle_0 = _state_0["cycle"];
  return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "pending": {$: "Nil"}, "active": {$: "Nil"}, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": true}, "commands": ($List$append$(($Dispatch$discard_all$(_pending_0)), ($Dispatch$discard_all$(_active_0))))};
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

function $Work$empty_prepared$(_ready_count_0, _has_non_skipped_0, _ticketed_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_ready_count_0, 0)), ($Bool$and$(_has_non_skipped_0, _ticketed_0)))), {$: "Work.FailEmptyLost"}, {$: "Work.NoEmptyFailure"});
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
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    const _x_0 = ($Canonical$scoped_pending$(_work_0, _lifetime_0, _scopes_0));
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_group_0, _lifetime_0, _round_0, _current_0)), ($Bool$and$(($Bool$not$(($Canonical$is_deciding$(_current_0)))), ($Canonical$valid_stop_scopes$(_rounds_0, _lifetime_0, _scopes_0)))))), ($Bool$pick$(($Bool$and$(($Bool$not$(_deadline_0)), (_extra_pending_0 || _x_0))), ($Canonical$stop_group_wait$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0}, _group_0, _lifetime_0, _round_0, _scopes_0)), ($Canonical$stop_group_ready$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0}, _group_0, _lifetime_0, _round_0, _scopes_0, _continuations_0)))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}};
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
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Canonical$stop_group_end_valid$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0}, _group_0, _lifetime_0, _round_0, _scopes_0, ($Bool$and$(($Canonical$same_round$(_group_0, _lifetime_0, _round_0, _current_0)), ($Canonical$valid_end_scopes$(_rounds_0, _lifetime_0, _scopes_0)))));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}};
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
  const _x_0 = ($CollectionState$contains$(_advice_0, _ready_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_advice_0, 0)), (_eligible_now_0 || _x_0))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": ($Bool$pick$(($CollectionState$contains$(_advice_0, _ready_0)), _ready_0, {$: "Con", "head": _advice_0, "tail": _ready_0})), "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0}});
}

function $Collection$eligible$(_already_0, _turn_end_0, _cycle_complete_0, _elapsed_0, _window_0) {
  const _x_0 = ($Nat$is_ge$(_elapsed_0, _window_0));
  const _x_1 = (_cycle_complete_0 || _x_0);
  const _x_2 = (_turn_end_0 || _x_1);
  return (_already_0 || _x_2);
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

function $Delivery$advice_candidate$(_same_partition_0, _unleased_0, _has_unsuppressed_finding_0, _ticket_owns_0) {
  return $Bool$and$(_same_partition_0, ($Bool$and$(_unleased_0, ($Bool$and$(_has_unsuppressed_finding_0, _ticket_owns_0)))));
}

function $Nat$is_gt$(_a_0, _b_0) {
  return $Cmp$is_gt$(cmp_new(_a_0, _b_0));
}

function $Collection$expired$(_elapsed_0, _lifetime_0) {
  return $Nat$is_ge$(_elapsed_0, _lifetime_0);
}

function $Handoff$fits_batch$(_items_0, _bytes_0) {
  return $Bool$and$(($Nat$is_gt$(_items_0, 0)), ($Bool$and$(($Nat$is_le$(_items_0, 5)), ($Nat$is_le$(_bytes_0, 2048)))));
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
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($CollectionState$contains$(_advice_0, _ready_0)), ($Bool$not$(($CollectionState$lease_exists$(_advice_0, _leases_0)))))))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": {$: "Con", "head": {$: "CollectionState.Lease", "advice": _advice_0, "owner": _token_0}, "tail": _leases_0}, "claims": _claims_0, "delivery": _delivery_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0}});
}

function $CollectionState$release$(_state_0, _advice_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return $Bool$pick$(($CollectionState$lease_owned$(_advice_0, _token_0, _leases_0)), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": ($CollectionState$remove_lease$(_advice_0, _token_0, _leases_0)), "claims": _claims_0, "delivery": _delivery_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0}});
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

function $Canonical$with_collection$(_state_0, _replacement_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _replacement_0};
}

function $CollectionState$retire$(_state_0, _advice_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return {$: "CollectionState.State", "ready": ($CollectionState$remove_ready$(_advice_0, _ready_0)), "leases": ($CollectionState$remove_advice_lease$(_advice_0, _leases_0)), "claims": _claims_0, "delivery": _delivery_0};
}

function $CollectionState$claim$(_state_0, _group_0, _token_0, _active_0, _capacity_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _x_0 = ($List$length$(_claims_0));
  return $Bool$pick$(($Bool$and$(_active_0, ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($CollectionState$claim_exists$(_group_0, _claims_0)))), (_x_0 < _capacity_0))))))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": {$: "Con", "head": {$: "CollectionState.Claim", "group": _group_0, "owner": _token_0}, "tail": _claims_0}, "delivery": _delivery_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0}});
}

function $CollectionState$release_claim$(_state_0, _group_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return $Bool$pick$(($CollectionState$claim_owned$(_group_0, _token_0, _claims_0)), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": ($CollectionState$remove_claim$(_group_0, _token_0, _claims_0)), "delivery": _delivery_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0}});
}

function $CollectionState$expire_claim$(_state_0, _group_0, _token_0, _elapsed_0, _lifetime_0) {
  return $Bool$pick$(($Collection$expired$(_elapsed_0, _lifetime_0)), ($CollectionState$release_claim$(_state_0, _group_0, _token_0)), {$: "CollectionState.Refused", "state": _state_0});
}

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
}

function $List$length$(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk(($List$length$(_t_0)) + 1);
  }
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
    return $Bool$and$(_deciding_0, ($Canonical$same_round$(_group_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": __3, "deciding": _deciding_0, "write": __4, "uncertain": __5})));
  } else {
    return false;
  }
}

function $Canonical$selected_pending$(_selected_0, _work_0) {
  if (_selected_0.$ === "Nil") {
    return true;
  } else {
    const _operation_0 = _selected_0["head"];
    const _rest_0 = _selected_0["tail"];
    return $Bool$and$(($Canonical$pending_operation$(_operation_0, _work_0)), ($Canonical$selected_pending$(_rest_0, _work_0)));
  }
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
  return $Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, ($CollectionState$finish_reserve$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.FinishReserved"}, {$: "Canonical.FinishRefused"});
}

function $CollectionState$finish_release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0}, ($DeliveryState$release$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0)));
}

function $CollectionState$finish_authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0}, ($DeliveryState$authorize$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)));
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
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0}, ($DeliveryState$terminal$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0)));
}

function $CollectionState$finish_end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0}, ($DeliveryState$end$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0)));
}

function $CollectionState$consume_continuation$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0}, ($DeliveryState$consume$(_delivery_0, _group_0, _round_0)));
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
      return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": _uncertain_0})), ($Bool$not$(_deciding_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": false, "write": {$: "Some", "value": _next_operation_0}, "uncertain": _uncertain_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.WriteAuthorized", "operation": _next_operation_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}});
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleRound"}};
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

function $DeliveryState$initial$() {
  return {$: "DeliveryState.State", "slots": {$: "Nil"}, "counters": {$: "Nil"}};
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
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityResized", "id": _id_0, "after": ($Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}};
  } else {
    const _t_0 = _result_0["state"];
    const _limits_0 = _t_0["limits"];
    const _next_id_0 = _t_0["next_id"];
    const _charges_0 = _t_0["charges"];
    const _others_0 = {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($Ledger$remove$(_id_0, _charges_0))};
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityRefused", "reason": ($Ledger$admission$(_others_0, _partition_0, _bytes_0)), "after": ($Canonical$capacity_view$({$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}, _partition_0))}, "tail": {$: "Nil"}}};
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
  if (_result_0.$ === "Ledger.Granted") {
    const _released_0 = _result_0["state"];
    return $Canonical$capacity_replace_batch$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": __1, "dispatch": _dispatch_0, "collection": _collection_0}, _id_0, _partition_0, _released_0, ($Canonical$capacity_replace_units$(_sizes_0, {$: "Canonical.CapacityBatch", "ledger": _released_0, "commands": {$: "Nil"}}, _partition_0, 1)));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": __1, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
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
        return {$: "Canonical.Advanced", "state": ($Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": {$: "Canonical.PermitIssued", "token": _token_0, "round": _round_0}, "tail": {$: "Nil"}}};
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

function $Canonical$with_admission$(_state_0, _partition_0, _admission_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": {$: "Con", "head": _admission_0, "tail": ($Canonical$remove_admission$(_partition_0, _admissions_0))}, "dispatch": _dispatch_0, "collection": _collection_0};
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

function $Canonical$find_admission$(_partition_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Canonical$admission_matches$(_partition_0, _item_0)), {$: "Some", "value": _item_0}, ($Canonical$find_admission$(_partition_0, _rest_0)));
  }
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

function $Canonical$close_permit_apply$(_state_0, _partition_0, _lifetime_0, _at_0, _prospective_0, _admission_0) {
  if (_prospective_0) {
    return $Canonical$close_prospective_permit$(_state_0, _partition_0, _at_0, _admission_0);
  } else {
    return $Canonical$close_permit_result$(_state_0, _partition_0, ($Admission$step$(_admission_0, _partition_0, _lifetime_0, {$: "Admission.CloseRound", "at": _at_0})));
  }
}

function $Canonical$same_partition$(_partition_0, _round_0) {
  const _owner_0 = _round_0["partition"];
  return $Nat$is_eq$(_owner_0, _partition_0);
}

function $Canonical$same_round$(_partition_0, _lifetime_0, _id_0, _round_0) {
  const _owner_0 = _round_0["partition"];
  const _generation_0 = _round_0["lifetime"];
  const _current_0 = _round_0["id"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Nat$is_eq$(_current_0, _id_0)))));
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
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    const _charge_0 = _result_0["id"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($List$append$(_work_0, {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _next_operation_0, "charge": _charge_0, "kind": {$: "Canonical.Preparing"}, "parent": _parent_0}, "tail": {$: "Nil"}})), "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.Prepare", "operation": _next_operation_0, "reservation": _charge_0}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationRefused"}, "tail": {$: "Nil"}}};
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
  return $Canonical$prepared_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0, ($Ledger$release$(_ledger_0, _charge_0)));
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
  if (_outcome_0.$ === "Canonical.Finding") {
    return $Bool$pick$(($Nat$is_gt$(_parent_0, 0)), ($Canonical$reviewed_retained_find$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, _charge_0, _ledger_0)), ($Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)))));
  } else if (_outcome_0.$ === "Canonical.Clear") {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Clear"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else if (_outcome_0.$ === "Canonical.Unavailable") {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Unavailable"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else if (_outcome_0.$ === "Canonical.Interrupted") {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Interrupted"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
  } else {
    return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Discarded"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
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
  if (_result_0.$ === "Ledger.Granted") {
    const _updated_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _updated_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": {$: "Con", "head": {$: "Canonical.ReviewRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
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

function $Canonical$reviewed_stale$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  return $Canonical$reviewed_stale_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$dispatch_commands$(_items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    if (_t_0.$ === "Dispatch.Started") {
      const _operation_0 = _t_0["operation"];
      const _sequence_0 = _t_0["sequence"];
      const _cycle_0 = _t_0["cycle"];
      const _rest_0 = _items_0["tail"];
      return {$: "Con", "head": {$: "Canonical.DispatchStarted", "operation": _operation_0, "sequence": _sequence_0, "cycle": _cycle_0}, "tail": ($Canonical$dispatch_commands$(_rest_0))};
    } else if (_t_0.$ === "Dispatch.CycleCompleted") {
      const _cycle_1 = _t_0["cycle"];
      const _rest_1 = _items_0["tail"];
      return {$: "Con", "head": {$: "Canonical.DispatchCycleCompleted", "cycle": _cycle_1}, "tail": ($Canonical$dispatch_commands$(_rest_1))};
    } else {
      const _operation_1 = _t_0["operation"];
      const _running_0 = _t_0["running"];
      const _rest_2 = _items_0["tail"];
      return {$: "Con", "head": {$: "Canonical.DispatchDiscarded", "operation": _operation_1, "running": _running_0}, "tail": ($Canonical$dispatch_commands$(_rest_2))};
    }
  }
}

function $Dispatch$known$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _pending_0 = _state_0["pending"];
  const _active_0 = _state_0["active"];
  const _running_0 = _state_0["running"];
  const _x_0 = ($Dispatch$contains$(_active_0, _partition_0, _lifetime_0, _round_0, _operation_0));
  const _x_1 = ($Dispatch$contains$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0));
  const _x_2 = ($Dispatch$contains$(_pending_0, _partition_0, _lifetime_0, _round_0, _operation_0));
  const _x_3 = (_x_0 || _x_1);
  return (_x_2 || _x_3);
}

function $Dispatch$pump_two$(_state_0) {
  return $Dispatch$pump_two_result$(_state_0, ($Dispatch$pump_one$(_state_0)));
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

function $Dispatch$after_settle$(_state_0) {
  const _pending_0 = _state_0["pending"];
  const _active_0 = _state_0["active"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _cycle_0 = _state_0["cycle"];
  const _closed_0 = _state_0["closed"];
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(($List$length$(_active_0)), 0)), ($Nat$is_eq$(($List$length$(_running_0)), 0)))), ($Bool$pick$(($Nat$is_eq$(($List$length$(_pending_0)), 0)), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0}, "commands": {$: "Con", "head": {$: "Dispatch.CycleCompleted", "cycle": _cycle_0}, "tail": {$: "Nil"}}}, ($Dispatch$promoted_result$({$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0}, _pending_0, _next_sequence_0, _cycle_0, _closed_0)))), ($Dispatch$pump_two$({$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0})));
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

function $Dispatch$discarded_result$(_state_0, _queued_0, _active_0, _running_0) {
  const _next_sequence_0 = _state_0["next_sequence"];
  const _cycle_0 = _state_0["cycle"];
  const _closed_0 = _state_0["closed"];
  const _pending_0 = _queued_0["entries"];
  const _pending_commands_0 = _queued_0["commands"];
  const _current_0 = _active_0["entries"];
  const _current_commands_0 = _active_0["commands"];
  const _executing_0 = _running_0["entries"];
  const _executing_commands_0 = _running_0["commands"];
  return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "pending": _pending_0, "active": _current_0, "running": _executing_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0}, "commands": ($List$append$(_pending_commands_0, ($List$append$(_current_commands_0, _executing_commands_0))))};
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
    const __4 = _t_0["cycle"];
    const __5 = _t_0["cancelled"];
    const _rest_0 = _items_0["tail"];
    return $Dispatch$filter_queued_one$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": _operation_0, "sequence": __3, "cycle": __4, "cancelled": __5}, ($Dispatch$listed$(_ids_0, _operation_0)), ($Dispatch$filter_queued$(_rest_0, _ids_0)));
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
    const __4 = _t_0["cycle"];
    const __5 = _t_0["cancelled"];
    const _rest_0 = _items_0["tail"];
    return $Dispatch$filter_running_one$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": _operation_0, "sequence": __3, "cycle": __4, "cancelled": __5}, ($Dispatch$listed$(_ids_0, _operation_0)), ($Dispatch$filter_running$(_rest_0, _ids_0)));
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
  const _write_0 = _current_0["write"];
  const _uncertain_0 = _current_0["uncertain"];
  return $Canonical$stop_current$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($Canonical$pending$(_partition_0, _lifetime_0, _round_0, _work_0)), _write_0, _uncertain_0);
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, true, false)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.WaitForWork"}, "tail": {$: "Nil"}}};
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_scoped_charges$(_work_0, _ledger_0, _lifetime_0, _scopes_0)), "rounds": ($Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, false, true)), "work": ($Canonical$retain_scoped_work$(_work_0, _lifetime_0, _scopes_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": ($List$append$(($Canonical$release_scoped_commands$(_work_0, _lifetime_0, _scopes_0)), ($List$append$(($Canonical$cancel_scoped_dispatch$(_dispatch_0, _work_0, _lifetime_0, _scopes_0)), {$: "Con", "head": ($Bool$pick$((_continuations_0 < 4), {$: "Canonical.FinishReady"}, {$: "Canonical.FinishLimit"})), "tail": {$: "Nil"}}))))};
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

function $Nat$is_ge$(_a_0, _b_0) {
  return $Cmp$is_ge$(cmp_new(_a_0, _b_0));
}

function $Cmp$is_gt$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else if (_c_0.$ === "EQ") {
    return false;
  } else {
    return true;
  }
}

function $Nat$is_le$(_a_0, _b_0) {
  return $Cmp$is_le$(cmp_new(_a_0, _b_0));
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0}, "commands": {$: "Con", "head": ($Bool$pick$(($CollectionState$owns_lease$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseKept"}, {$: "Canonical.CollectionLeaseRefused"})), "tail": {$: "Nil"}}};
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

function $Cmp$is_eq$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Canonical$pending_operation$($0, $1) {
  for (;;) {
    {
      const _operation_0 = $0;
      const _items_0 = $1;
      if (_items_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _items_0["head"];
        const _candidate_0 = _t_0["operation"];
        const _t_1 = _t_0["kind"];
        if (_t_1.$ === "Canonical.PendingFinding") {
          const _rest_0 = _items_0["tail"];
          const _x_0 = ($Nat$is_eq$(_operation_0, _candidate_0));
          const _x_1 = ($Canonical$pending_operation$(_operation_0, _rest_0));
          return (_x_0 || _x_1);
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

function $CollectionState$finish_reserve$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  return $CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0}, ($DeliveryState$reserve$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)));
}

function $CollectionState$delivery_result$(_state_0, _result_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const __0 = _state_0["delivery"];
  if (_result_0.$ === "DeliveryState.Granted") {
    const _delivery_0 = _result_0["state"];
    return {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0}};
  } else {
    return {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": __0}};
  }
}

function $DeliveryState$release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _used_0 = ($DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($DeliveryState$reserved_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), ($Nat$is_gt$(_used_0, 0)))), {$: "DeliveryState.Granted", "state": ($DeliveryState$set_count$({$: "DeliveryState.State", "slots": ($DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), "counters": _counters_0}, _group_0, _round_0, (_used_0 < 1 ? 0 : _used_0 - 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0}});
}

function $DeliveryState$authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  return $Bool$pick$(($DeliveryState$authorizable$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _slots_0)), {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Authorized"}, _slots_0)), "counters": _counters_0}}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0}});
}

function $DeliveryState$terminal$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  return $Bool$pick$(($DeliveryState$terminal_owned$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _slots_0)), {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _slots_0)), "counters": _counters_0}}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0}});
}

function $DeliveryState$end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  return $Bool$pick$(($DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), "counters": _counters_0}}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0}});
}

function $DeliveryState$consume$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _used_0 = ($DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), (_used_0 < 4))))), {$: "DeliveryState.Granted", "state": ($DeliveryState$set_count$({$: "DeliveryState.State", "slots": __0, "counters": _counters_0}, _group_0, _round_0, nat_chk(_used_0 + 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": __0, "counters": _counters_0}});
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
  const __0 = _current_0["partition"];
  const __1 = _current_0["lifetime"];
  const __2 = _current_0["id"];
  const _waiting_0 = _current_0["waiting"];
  const _deciding_0 = _current_0["deciding"];
  const _t_0 = _current_0["write"];
  if (_t_0.$ === "Some") {
    const _token_0 = _t_0["value"];
    const __3 = _current_0["uncertain"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "Some", "value": _token_0}, "uncertain": __3})), ($Nat$is_eq$(_token_0, _operation_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": ($Canonical$write_is_unknown$(_outcome_0))}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.WriteRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_round_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": ($Canonical$remove_round$(_partition_0, _rounds_0)), "work": ($Canonical$retain_other_work$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": ($List$append$(($Canonical$release_all_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": {$: "Canonical.PartitionRetired", "round": _round_0}, "tail": {$: "Nil"}}))))};
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
  const _ledger_0 = _batch_0["ledger"];
  const _commands_0 = _batch_0["commands"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationReleased", "id": _id_0, "after": ($Canonical$capacity_view$(_released_0, _partition_0))}, "tail": _commands_0}};
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

function $Canonical$remove_admission$(_partition_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Canonical$retain_admission$(_item_0, ($Canonical$remove_admission$(_partition_0, _rest_0)), ($Canonical$admission_matches$(_partition_0, _item_0)));
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
  return {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": 0, "active": false, "closed_at": 0, "next_token": 1, "permits": {$: "Nil"}, "used": {$: "Nil"}};
}

function $Canonical$admission_matches$(_partition_0, _item_0) {
  const _owner_0 = _item_0["partition"];
  return $Nat$is_eq$(_owner_0, _partition_0);
}

function $Admission$expire$due$(_state_0, _token_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  const _used_0 = _state_0["used"];
  return {$: "Admission.RemovePermit", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0)), "used": _used_0}};
}

function $Canonical$close_prospective_permit$(_state_0, _partition_0, _at_0, _admission_0) {
  const _owner_0 = _admission_0["partition"];
  const _lifetime_0 = _admission_0["lifetime"];
  const _round_0 = _admission_0["round"];
  const _t_0 = _admission_0["active"];
  if (!_t_0) {
    const _closed_at_0 = _admission_0["closed_at"];
    const _next_token_0 = _admission_0["next_token"];
    const _t_1 = _admission_0["permits"];
    if (_t_1.$ === "Nil") {
      const _used_0 = _admission_0["used"];
      return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_next_token_0, 1)), ($Nat$is_ge$(_at_0, _closed_at_0)))), {$: "Canonical.Advanced", "state": ($Canonical$with_admission$(_state_0, _partition_0, {$: "Admission.AdmissionState", "partition": _owner_0, "lifetime": _lifetime_0, "round": nat_chk(_round_0 + 1), "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}, "used": _used_0})), "commands": {$: "Con", "head": {$: "Canonical.PermitRoundClosed", "round": nat_chk(_round_0 + 1)}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.RoundAlreadyClosed"}}});
    } else {
      const _used_1 = _admission_0["used"];
      return $Canonical$close_permit_result$(_state_0, _partition_0, ($Admission$close_prospective$({$: "Admission.AdmissionState", "partition": _owner_0, "lifetime": _lifetime_0, "round": _round_0, "active": false, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _t_1, "used": _used_1}, _at_0)));
    }
  } else {
    const _closed_at_1 = _admission_0["closed_at"];
    const _next_token_1 = _admission_0["next_token"];
    const _30_0 = _admission_0["permits"];
    const _used_2 = _admission_0["used"];
    return $Canonical$close_permit_result$(_state_0, _partition_0, ($Admission$close_prospective$({$: "Admission.AdmissionState", "partition": _owner_0, "lifetime": _lifetime_0, "round": _round_0, "active": _t_0, "closed_at": _closed_at_1, "next_token": _next_token_1, "permits": _30_0, "used": _used_2}, _at_0)));
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
  if (_bytes_0.$ === "Nil") {
    if (_result_0.$ === "Ledger.Rejected") {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.InconsistentLedger"}};
    } else {
      const _released_0 = _result_0["state"];
      return $Canonical$prepared_batch$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, _charge_0, _partition_0, _released_0, {$: "Canonical.Batch", "ledger": _released_0, "work": {$: "Nil"}, "next_operation": _next_operation_0, "commands": {$: "Nil"}});
    }
  } else {
    const _size_0 = _bytes_0["head"];
    const _rest_0 = _bytes_0["tail"];
    if (_result_0.$ === "Ledger.Rejected") {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.InconsistentLedger"}};
    } else {
      const _released_1 = _result_0["state"];
      return $Canonical$prepared_batch$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, _charge_0, _partition_0, _released_1, ($Canonical$admit_units$({$: "Con", "head": _size_0, "tail": _rest_0}, {$: "Canonical.Batch", "ledger": _released_1, "work": {$: "Nil"}, "next_operation": _next_operation_0, "commands": {$: "Nil"}}, _partition_0, _lifetime_0, _round_0, 1, _parent_0)));
    }
  }
}

function $Canonical$reviewed_retained_find$(_state_0, _operation_0, _charge_0, _ledger_0) {
  const _charges_0 = _ledger_0["charges"];
  return $Canonical$reviewed_retained_charge$(_state_0, _operation_0, _charge_0, ($Ledger$find$(_charge_0, _charges_0)));
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
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
    } else if (_t_1.$ === "Canonical.AtJev") {
      return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Dispatch$pump_two_result$(_state_0, _result_0) {
  if (_result_0.$ === "Dispatch.Advanced") {
    const _t_0 = _result_0["state"];
    const __0 = _t_0["pending"];
    const __1 = _t_0["active"];
    const _running_0 = _t_0["running"];
    const __2 = _t_0["next_sequence"];
    const __3 = _t_0["cycle"];
    const __4 = _t_0["closed"];
    const _commands_0 = _result_0["commands"];
    const _x_0 = ($List$length$(_running_0));
    return $Bool$pick$((_x_0 < 2), ($Dispatch$pump_second$({$: "Dispatch.State", "pending": __0, "active": __1, "running": _running_0, "next_sequence": __2, "cycle": __3, "closed": __4}, _commands_0)), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "pending": __0, "active": __1, "running": _running_0, "next_sequence": __2, "cycle": __3, "closed": __4}, "commands": _commands_0});
  } else {
    return {$: "Dispatch.Denied", "state": _state_0};
  }
}

function $Dispatch$pump_one$($0) {
  for (;;) {
    {
      const _state_0 = $0;
      const _pending_0 = _state_0["pending"];
      const _t_0 = _state_0["active"];
      if (_t_0.$ === "Con") {
        const _t_1 = _t_0["head"];
        const __0 = _t_1["partition"];
        const __1 = _t_1["lifetime"];
        const __2 = _t_1["round"];
        const __3 = _t_1["operation"];
        const __4 = _t_1["sequence"];
        const __5 = _t_1["cycle"];
        const _t_2 = _t_1["cancelled"];
        if (_t_2) {
          const _active_0 = _t_0["tail"];
          const _running_0 = _state_0["running"];
          const _next_sequence_0 = _state_0["next_sequence"];
          const _cycle_0 = _state_0["cycle"];
          const _closed_0 = _state_0["closed"];
          $0 = {$: "Dispatch.State", "pending": _pending_0, "active": _active_0, "running": _running_0, "next_sequence": _next_sequence_0, "cycle": _cycle_0, "closed": _closed_0};
          continue;
        } else {
          const _active_1 = _t_0["tail"];
          const _running_1 = _state_0["running"];
          const _next_sequence_1 = _state_0["next_sequence"];
          const _cycle_1 = _state_0["cycle"];
          const _closed_1 = _state_0["closed"];
          const _next_0 = ($Dispatch$start$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": __3, "sequence": __4, "cycle": __5, "cancelled": _t_2}, _cycle_1));
          return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "pending": _pending_0, "active": _active_1, "running": ($List$append$(_running_1, {$: "Con", "head": _next_0, "tail": {$: "Nil"}})), "next_sequence": _next_sequence_1, "cycle": _cycle_1, "closed": _closed_1}, "commands": {$: "Con", "head": ($Dispatch$start_command$(_next_0)), "tail": {$: "Nil"}}};
        }
      } else {
        const _running_2 = _state_0["running"];
        const _next_sequence_2 = _state_0["next_sequence"];
        const _cycle_2 = _state_0["cycle"];
        const _closed_2 = _state_0["closed"];
        return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "pending": _pending_0, "active": _t_0, "running": _running_2, "next_sequence": _next_sequence_2, "cycle": _cycle_2, "closed": _closed_2}, "commands": {$: "Nil"}};
      }
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

function $Dispatch$promoted_result$(_state_0, _pending_0, _next_sequence_0, _cycle_0, _closed_0) {
  return $Dispatch$promoted_pumped$(_state_0, _cycle_0, ($Dispatch$pump_two$({$: "Dispatch.State", "pending": {$: "Nil"}, "active": ($Dispatch$promote$(_pending_0, nat_chk(_cycle_0 + 1))), "running": {$: "Nil"}, "next_sequence": _next_sequence_0, "cycle": nat_chk(_cycle_0 + 1), "closed": _closed_0})));
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
  const __5 = _entry_0["cycle"];
  const _t_0 = _entry_0["cancelled"];
  if (_t_0) {
    const _entries_0 = _tail_0["entries"];
    const _commands_0 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": {$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": __3, "sequence": __4, "cycle": __5, "cancelled": true}, "tail": _entries_0}, "commands": _commands_0};
  } else {
    return $Dispatch$filter_running_hit$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": __3, "sequence": __4, "cycle": __5, "cancelled": _t_0}, _hit_0, _tail_0);
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
  return $Bool$pick$(($Bool$and$(_has_pending_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": true, "deciding": false, "write": _write_0, "uncertain": _uncertain_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.WaitForWork"}, "tail": {$: "Nil"}}}, ($Canonical$stop_output$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, _write_0, _uncertain_0)));
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
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Canonical$same_round$(_group_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": __0, "deciding": __1, "write": __2, "uncertain": __3}));
    const _x_1 = ($Canonical$scope_contains$(_scopes_0, _partition_0, _current_0));
    return $Canonical$mark_stop_rounds_one$({$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": __0, "deciding": __1, "write": __2, "uncertain": __3}, ($Canonical$mark_stop_rounds$(_rest_0, _group_0, _lifetime_0, _round_0, _scopes_0, _waiting_0, _deciding_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), (_x_0 || _x_1))), _waiting_0, _deciding_0);
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
  const _pending_0 = _dispatch_0["pending"];
  const _active_0 = _dispatch_0["active"];
  const _running_0 = _dispatch_0["running"];
  return $List$append$(($Canonical$cancel_dispatch_entries$(_pending_0, _work_0, _lifetime_0, _scopes_0)), ($List$append$(($Canonical$cancel_dispatch_entries$(_active_0, _work_0, _lifetime_0, _scopes_0)), ($Canonical$cancel_dispatch_entries$(_running_0, _work_0, _lifetime_0, _scopes_0)))));
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, false, false)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.StopEnded"}, "tail": {$: "Nil"}}};
}

function $Canonical$end_scope_valid$(_found_0, _partition_0, _lifetime_0, _round_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0);
  } else {
    return false;
  }
}

function $Cmp$is_ge$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else if (_c_0.$ === "EQ") {
    return true;
  } else {
    return true;
  }
}

function $Cmp$is_le$(_c_0) {
  if (_c_0.$ === "LT") {
    return true;
  } else if (_c_0.$ === "EQ") {
    return true;
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

function $CollectionState$keep_ready$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $CollectionState$keep_claim$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $DeliveryState$reserve$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _used_0 = ($DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), ($Bool$and$(($Nat$is_gt$(_attempt_0, 0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($DeliveryState$has_group$(_group_0, _slots_0)))), ($Bool$and$((_used_0 < 4), ($Bool$and$(($Nat$is_gt$(($List$length$(_selected_0)), 0)), ($Nat$is_le$(($List$length$(_selected_0)), 5)))))))))))))))), {$: "DeliveryState.Granted", "state": ($DeliveryState$set_count$({$: "DeliveryState.State", "slots": {$: "Con", "head": {$: "DeliveryState.Slot", "group": _group_0, "round": _round_0, "attempt": _attempt_0, "token": _token_0, "selected": _selected_0, "phase": {$: "DeliveryState.Reserved"}}, "tail": _slots_0}, "counters": _counters_0}, _group_0, _round_0, nat_chk(_used_0 + 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0}});
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
  return {$: "DeliveryState.State", "slots": _slots_0, "counters": {$: "Con", "head": {$: "DeliveryState.Counter", "group": _group_0, "round": _round_0, "used": _used_0}, "tail": ($DeliveryState$without_counter$(_group_0, _round_0, _counters_0))}};
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

function $DeliveryState$durable_owned$($0, $1, $2, $3, $4) {
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
          $0 = _group_0;
          $1 = _round_0;
          $2 = _attempt_0;
          $3 = _token_0;
          $4 = _rest_0;
          continue;
        } else {
          const _rest_1 = _slots_0["tail"];
          const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0))))))));
          const _x_1 = ($DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _rest_1));
          return (_x_0 || _x_1);
        }
      }
    }
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

function $Canonical$retain_admission$(_item_0, _tail_0, _match_owner_0) {
  if (_match_owner_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
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
  const _used_0 = _state_0["used"];
  return $Admission$issue$guard$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0, "used": _used_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _tool_0, _started_0, _deadline_0, _now_0, ($Bool$and$(($Nat$is_gt$(_started_0, _closed_at_0)), ($Bool$and$(($Nat$is_le$(_started_0, _now_0)), ($Nat$is_le$(_now_0, _deadline_0)))))));
}

function $Admission$consume$(_state_0, _token_0, _tool_0, _now_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  const _used_0 = _state_0["used"];
  return $Admission$consume$used$({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0, "used": _used_0}, _token_0, _tool_0, _now_0, ($Admission$has_token$(_token_0, _used_0)), ($Admission$find_permit$(_token_0, _permits_0)));
}

function $Admission$release$(_state_0, _token_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  const _used_0 = _state_0["used"];
  return $Admission$release$used$({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0, "used": _used_0}, _token_0, ($Admission$has_token$(_token_0, _used_0)), ($Admission$find_permit$(_token_0, _permits_0)));
}

function $Admission$close_round$(_state_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const __0 = _state_0["permits"];
  const _used_0 = _state_0["used"];
  return $Admission$close_round$active$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": __0, "used": _used_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _used_0, _at_0);
}

function $Admission$restart$(_state_0, _new_lifetime_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const __2 = _state_0["next_token"];
  const __3 = _state_0["permits"];
  const __4 = _state_0["used"];
  return $Admission$restart$fresh$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": __0, "active": __1, "closed_at": _closed_at_0, "next_token": __2, "permits": __3, "used": __4}, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, ($Bool$and$(($Nat$is_gt$(_new_lifetime_0, _lifetime_0)), ($Nat$is_ge$(_at_0, _closed_at_0)))));
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

function $Admission$close_prospective$(_state_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  const _used_0 = _state_0["used"];
  return $Bool$pick$(($Bool$and$(($Bool$not$(_active_0)), ($Bool$and$(($Nat$is_ge$(_at_0, _closed_at_0)), ($Nat$is_gt$(($List$length$(_permits_0)), 0)))))), {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": nat_chk(_round_0 + 1), "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}, "used": _used_0}, "token": {$: "None"}, "round": {$: "Some", "value": nat_chk(_round_0 + 1)}}, {$: "Admission.Rejected", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0, "used": _used_0}, "reason": {$: "Admission.RoundAlreadyClosed"}});
}

function $Canonical$prepared_batch$(_state_0, _operation_0, _charge_0, _partition_0, _released_0, _batch_0) {
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _ledger_0 = _batch_0["ledger"];
  const _units_0 = _batch_0["work"];
  const _next_0 = _batch_0["next_operation"];
  const _commands_0 = _batch_0["commands"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($List$append$(($Canonical$remove_work$(_operation_0, _work_0)), _units_0)), "next_round": _next_round_0, "next_operation": _next_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationReleased", "id": _charge_0, "after": ($Canonical$capacity_view$(_released_0, _partition_0))}, "tail": _commands_0}};
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

function $Canonical$reviewed_retained_charge$(_state_0, _operation_0, _charge_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _bytes_0 = _t_0["bytes"];
    return $Canonical$reviewed_retained_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, _operation_0, ($Ledger$resize_for$(_ledger_0, _charge_0, _bytes_0, {$: "Ledger.StoredResult"})));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Dispatch$pump_second$(_first_0, _commands_0) {
  return $Dispatch$pump_second_result$(_first_0, _commands_0, ($Dispatch$pump_one$(_first_0)));
}

function $Dispatch$start$(_entry_0, _cycle_0) {
  const _partition_0 = _entry_0["partition"];
  const _lifetime_0 = _entry_0["lifetime"];
  const _round_0 = _entry_0["round"];
  const _operation_0 = _entry_0["operation"];
  const _sequence_0 = _entry_0["sequence"];
  const _cancelled_0 = _entry_0["cancelled"];
  return {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _sequence_0, "cycle": _cycle_0, "cancelled": _cancelled_0};
}

function $Dispatch$start_command$(_entry_0) {
  const _operation_0 = _entry_0["operation"];
  const _sequence_0 = _entry_0["sequence"];
  const _cycle_0 = _entry_0["cycle"];
  return {$: "Dispatch.Started", "operation": _operation_0, "sequence": _sequence_0, "cycle": _cycle_0};
}

function $Dispatch$promoted_pumped$(_state_0, _cycle_0, _result_0) {
  if (_result_0.$ === "Dispatch.Advanced") {
    const _next_0 = _result_0["state"];
    const _starts_0 = _result_0["commands"];
    return {$: "Dispatch.Advanced", "state": _next_0, "commands": {$: "Con", "head": {$: "Dispatch.CycleCompleted", "cycle": _cycle_0}, "tail": _starts_0}};
  } else {
    return {$: "Dispatch.Denied", "state": _state_0};
  }
}

function $Dispatch$promote$(_items_0, _cycle_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return {$: "Con", "head": ($Dispatch$start$(_entry_0, _cycle_0)), "tail": ($Dispatch$promote$(_rest_0, _cycle_0))};
  }
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

function $Admission$issue$guard$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _tool_0, _started_0, _deadline_0, _now_0, _clock_valid_0) {
  if (!_clock_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.StaleInvocation"}};
  } else {
    const _x_0 = ($Admission$has_tool$(_tool_0, _permits_0));
    const _x_1 = ($Admission$has_used_tool$(_tool_0, _used_0));
    return $Admission$issue$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _tool_0, _started_0, _deadline_0, (_x_0 || _x_1));
  }
}

function $Admission$consume$used$(_state_0, _token_0, _tool_0, _now_0, _was_used_0, _permit_0) {
  if (_was_used_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.UsedPermit"}};
  } else {
    return $Admission$consume$found$(_state_0, _token_0, _tool_0, _now_0, _permit_0);
  }
}

function $Admission$has_token$(_token_0, _used_0) {
  if (_used_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _used_0["head"];
    const _current_0 = _t_0["token"];
    const _rest_0 = _used_0["tail"];
    const _x_0 = ($Nat$is_eq$(_token_0, _current_0));
    const _x_1 = ($Admission$has_token$(_token_0, _rest_0));
    return (_x_0 || _x_1);
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

function $Admission$release$used$(_state_0, _token_0, _used_0, _found_0) {
  if (_used_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.UsedPermit"}};
  } else {
    return $Admission$release$found$(_state_0, _token_0, _found_0);
  }
}

function $Admission$close_round$active$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _used_0, _at_0) {
  if (!_active_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.RoundAlreadyClosed"}};
  } else {
    return $Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _used_0, _at_0, ($Nat$is_ge$(_at_0, _closed_at_0)));
  }
}

function $Admission$restart$fresh$(_state_0, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.LifetimeNotFresh"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _new_lifetime_0, "round": 0, "active": false, "closed_at": _at_0, "next_token": 1, "permits": {$: "Nil"}, "used": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "None"}};
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
  if (_result_0.$ === "Ledger.Granted") {
    const _updated_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _updated_0, "rounds": _rounds_0, "work": ($Canonical$replace_work_kind$(_operation_0, {$: "Canonical.PendingFinding"}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": {$: "Con", "head": {$: "Canonical.ReviewRecorded", "outcome": {$: "Canonical.Finding"}}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Dispatch$pump_second_result$(_first_0, _commands_0, _result_0) {
  if (_result_0.$ === "Dispatch.Advanced") {
    const _second_0 = _result_0["state"];
    const _more_0 = _result_0["commands"];
    return {$: "Dispatch.Advanced", "state": _second_0, "commands": ($List$append$(_commands_0, _more_0))};
  } else {
    return {$: "Dispatch.Denied", "state": _first_0};
  }
}

function $Dispatch$cancelled_entry$(_entry_0) {
  const _partition_0 = _entry_0["partition"];
  const _lifetime_0 = _entry_0["lifetime"];
  const _round_0 = _entry_0["round"];
  const _operation_0 = _entry_0["operation"];
  const _sequence_0 = _entry_0["sequence"];
  const _cycle_0 = _entry_0["cycle"];
  return {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _sequence_0, "cycle": _cycle_0, "cancelled": true};
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_unfinished_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": false, "deciding": true, "write": {$: "None"}, "uncertain": _uncertain_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": ($Canonical$retain_after_stop$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0}, "commands": ($List$append$(($Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": ($Bool$pick$(($Bool$and$(_uncertain_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.ReofferAtStop"}, {$: "Canonical.FinishReady"})), "tail": {$: "Nil"}}))))};
}

function $Canonical$mark_stop_rounds_hit$(_item_0, _tail_0, _waiting_0, _deciding_0) {
  const _partition_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["id"];
  const _write_0 = _item_0["write"];
  const _uncertain_0 = _item_0["uncertain"];
  return {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": _write_0, "uncertain": _uncertain_0}, "tail": _tail_0};
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

function $DeliveryState$keep_counter$(_item_0, _rest_0, _remove_0) {
  if (_remove_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _rest_0};
  }
}

function $Ledger$replace$pick$(_charge_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
  }
}

function $Admission$issue$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _tool_0, _started_0, _deadline_0, _duplicate_0) {
  if (_duplicate_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.DuplicateTool"}};
  } else {
    const _expected_round_0 = ($Admission$candidate_round$(_round_0, _active_0));
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": nat_chk(_next_token_0 + 1), "permits": ($List$append$(_permits_0, {$: "Con", "head": {$: "Admission.Permit", "token": _next_token_0, "tool": _tool_0, "round": _expected_round_0, "started": _started_0, "deadline": _deadline_0}, "tail": {$: "Nil"}})), "used": _used_0}, "token": {$: "Some", "value": _next_token_0}, "round": {$: "Some", "value": _expected_round_0}};
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

function $Admission$has_used_tool$(_tool_0, _used_0) {
  if (_used_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _used_0["head"];
    const _current_0 = _t_0["tool"];
    const _rest_0 = _used_0["tail"];
    const _x_0 = ($Nat$is_eq$(_tool_0, _current_0));
    const _x_1 = ($Admission$has_used_tool$(_tool_0, _rest_0));
    return (_x_0 || _x_1);
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

function $Admission$find_permit$pick$(_permit_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _permit_0};
  } else {
    return _fallback_0;
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
  const _used_0 = _state_0["used"];
  if (_found_0.$ === "None") {
    return {$: "Admission.Rejected", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0, "used": _used_0}, "reason": {$: "Admission.NoPermit"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0)), "used": _used_0}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _used_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.InvalidClock"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}, "used": _used_0}, "token": {$: "None"}, "round": {$: "Some", "value": _round_0}};
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

function $Admission$consume$check$(_state_0, _token_0, _tool_0, _now_0, _permitted_tool_0, _permitted_round_0, _started_0, _deadline_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  const _used_0 = _state_0["used"];
  return $Admission$consume$tool$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0, "used": _used_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, ($Nat$is_eq$(_tool_0, _permitted_tool_0)));
}

function $Admission$consume$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, _correct_tool_0) {
  if (!_correct_tool_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongTool"}};
  } else {
    return $Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _token_0, _now_0, _permitted_round_0, ($Bool$and$(($Nat$is_gt$(_started_0, _closed_at_0)), ($Bool$and$(($Nat$is_le$(_started_0, _now_0)), ($Nat$is_le$(_now_0, _deadline_0)))))));
  }
}

function $Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _token_0, _now_0, _permitted_round_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.Expired"}};
  } else {
    return $Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _token_0, _permitted_round_0, ($Nat$is_eq$(_permitted_round_0, ($Admission$candidate_round$(_round_0, _active_0)))));
  }
}

function $Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _used_0, _token_0, _permitted_round_0, _correct_round_0) {
  if (!_correct_round_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.OldRound"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _permitted_round_0, "active": true, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0)), "used": ($Admission$record_used$(_token_0, _permits_0, _used_0))}, "token": {$: "Some", "value": _token_0}, "round": {$: "Some", "value": _permitted_round_0}};
  }
}

function $Admission$record_used$(_token_0, _permits_0, _used_0) {
  return $Admission$record_used$found$(($Admission$find_permit$(_token_0, _permits_0)), _used_0);
}

function $Admission$record_used$found$(_permit_0, _used_0) {
  if (_permit_0.$ === "None") {
    return _used_0;
  } else {
    const _t_0 = _permit_0["value"];
    const _found_0 = _t_0["token"];
    const _tool_0 = _t_0["tool"];
    return {$: "Con", "head": {$: "Admission.Used", "token": _found_0, "tool": _tool_0}, "tail": _used_0};
  }
}

// Cli
// ===

// A JS program runs one thread and no GPU: --threads and --gpu do nothing.
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
  for (let i = n; i > 0; i -= 1) {
    xs = { $: "Con", head: b[i - 1], tail: xs };
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
  const soon = io.waits.reduce((m, w) => Math.min(m, w.at ?? m), Infinity);
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
