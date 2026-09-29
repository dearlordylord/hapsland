// hapsland-bend-source-sha256:2320484bd14a68b4d4c9933857078bc02c6845c1dd079d5bb49708a42cb97302
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
  return {$: "Smoke", "admission": ($Admission$step$(($Admission$initial$(1, 1)), 1, 1, {$: "Admission.Issue", "tool": 1, "started": 1, "deadline": 2, "now": 1})), "prospective_gate": ($Admission$prospective_gate$({$: "Admission.ProspectiveFacts", "clock_valid": true, "within_hook_window": true, "started_after_closure": true, "duplicate_event": false, "permit_count": 0, "permit_limit": 1024, "round_count": 0, "round_limit": 64, "new_round": true, "event_count": 0, "event_limit": 4096})), "expired_permit": ($Admission$expire$(($Admission$initial$(1, 1)), 1, true)), "callback": ($Admission$callback_current$(($Admission$initial$(1, 1)), 1, 1, 0)), "admitted": ($Work$admit$(($Work$initial$()))), "started_source": ($Work$start_source$(($sample_work$()), 1)), "started_unit": ($Work$start_unit$(($sample_unit_work$()), 1)), "spawned": ($Work$spawn$(($sample_work$()), 1, 1)), "prepared": ($Work$prepare$(($sample_work$()), 1, 2)), "source_completed": ($Work$complete_source$(($sample_work$()), 1)), "cached_finding": ($Work$cached_finding$(($sample_work$()), 1, 1, 20)), "revised_finding": ($Work$revise_finding$({$: "Work.Work", "next_observation": 2, "next_unit": 2, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Con", "head": {$: "Work.ReviewUnit", "id": 1, "observation": 1, "stage": {$: "Work.PendingFinding"}, "findings": 1, "bytes": 20}, "tail": {$: "Nil"}}}, 1, 1, 10)), "outcome": ($Work$outcome$(($sample_unit_work$()), 1, {$: "Work.Clear"})), "interrupted_source": ($Work$interrupt_observation$(($sample_work$()), 1)), "interrupted_unit": ($Work$interrupt_unit$(($sample_unit_work$()), 1)), "retired": ($Work$retire$({$: "Work.Work", "next_observation": 2, "next_unit": 2, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Con", "head": {$: "Work.ReviewUnit", "id": 1, "observation": 1, "stage": {$: "Work.ClearResult"}, "findings": 0, "bytes": 0}, "tail": {$: "Nil"}}}, 1)), "unfinished": ($Work$unfinished$(($sample_unit_work$()))), "pending_findings": ($Work$pending_findings$(($sample_unit_work$()))), "pending_for": ($Work$pending_for$(($sample_unit_work$()), 1)), "closed_work": ($Work$close$(($sample_work$()))), "cancelled_work": ($Work$cancel_unfinished$(($sample_work$()))), "finish_wait": ($Work$finish_wait$(1, false, true)), "prepared_offer": ($Work$prepared_offer$(true, true)), "empty_prepared": ($Work$empty_prepared$(0, true, true)), "evaluated_disposition": ($Work$evaluated_disposition$(true, true)), "failure_disposition": ($Work$failure_disposition$(false, true, false)), "source_capacity": ($Work$set_source_capacity$(($sample_work$()), {$: "Flow.Capacity", "low": 2, "high": 0})), "review_capacity": ($Work$set_review_capacity$(($sample_unit_work$()), {$: "Flow.Capacity", "low": 2, "high": 0})), "selection": ($Handoff$select$(($Handoff$initial$(1, 1)), {$: "Handoff.Advice", "id": 1, "unit": 1, "partition": 1, "round": 1, "snapshot": 1, "current_snapshot": 1, "credential": 1, "current_credential": 1, "age_ms": 0, "solo_bytes": 100, "collection_ready": true}, 100)), "fit": ($Handoff$fits_batch$(1, 100)), "notice_offer": ($Handoff$notice_offer$(6, 100, true)), "notice_prune": ($Notice$prune$(true, true, true, false, false, false)), "validation_route": ($Handoff$validation_route$(true, {$: "Handoff.Current"})), "post_validation": ($Handoff$post_validation$(true, false, true)), "final_candidate": ($Handoff$final_candidate$(true, true, true, false, true, true)), "finish": ($Handoff$finish$decide$(($Handoff$finish$initial$(1)), 0, false, 1)), "lease_reserve": ($Handoff$lease$reserve$(($Handoff$lease$initial$(1, 1)), 1, 1, {$: "Handoff.Background"})), "lease_authorize": ($Handoff$lease$authorize$(($sample_reserved_lease$()), 1, 1)), "lease_release": ($Handoff$lease$release$(($sample_reserved_lease$()), 1, 1)), "lease_terminal": ($Handoff$lease$terminal$(($sample_authorized_lease$()), 1, 1, false)), "lease_reoffer": ($Handoff$lease$reoffer$(($sample_uncertain_lease$()), 1, 2, true)), "lease_offer": ($Handoff$lease$offer$(($sample_uncertain_lease$()), 1, 2, {$: "Handoff.Stop"}, true)), "closed_lease": ($Handoff$lease$close$(($Handoff$lease$initial$(1, 1)))), "lease_suppresses": ($Handoff$lease$suppresses$(($sample_uncertain_lease$()), 1, {$: "Handoff.Edit"})), "round_begin": ($Round$begin_stop$(($Round$initial$()), 1)), "round_active": ($Round$active$(($Round$initial$()), 1)), "round_budget": ($Round$budget$(($Round$initial$()))), "round_max": ($Round$max_continuations$()), "round_owns": ($Round$owns_stop$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": false, "output_reserved": false}, 1)), "round_decision": ($Round$begin_decision$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": false, "output_reserved": false}, 1)), "round_consume": ($Round$consume$(($Round$initial$()))), "round_reserve": ($Round$reserve_output$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": true, "output_reserved": false}, 1)), "round_finish": ($Round$finish_stop$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": false, "output_reserved": false}, 1, true, 2)), "round_stop_terminal": ($Round$stop_terminal$(true, false, false)), "round_expire_close": ($Round$expire_close$(false)), "round_reopen": ($Round$reopen$({$: "Round.Round", "generation": 1, "active": false, "closed_at": 2, "continuations": 0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false}, 2)), "background_claim": ($Background$claim$(($Background$initial$()), 1, true, 0, 64)), "background_release": ($Background$release$({$: "Background.Waiter", "owner": 1}, 1)), "background_expire": ($Background$expire$({$: "Background.Waiter", "owner": 1}, 20001, 20000)), "notice": ($Notice$decide$({$: "Some", "value": 10}, 1, 64)), "notice_advance": ($Notice$advance$({$: "Some", "value": 0}, 1, 64, 3, {$: "Some", "value": 2}, false, 5)), "collection_order": ($Collection$order$(1, 2, 1, 3)), "collection_credential": ($Collection$credential_disposition$(true, false)), "collection_eligible": ($Collection$eligible$(false, false, false, 50, 50)), "collection_expired": ($Collection$expired$(600000, 600000)), "delivery_transition": ($Delivery$transition$({$: "Delivery.Authorized"}, {$: "Delivery.Uncertain"})), "delivery_expired": ($Delivery$expired$({$: "Delivery.Authorized"}, 1000, 1000)), "background_reofferable": ($Delivery$background_reofferable$({$: "Delivery.Uncertain"}, {$: "Delivery.Background"})), "submission_allowed": ($Delivery$submission_allowed$(($Round$initial$()), {$: "Delivery.Edit"}, false, false)), "existing_token_allowed": ($Delivery$existing_token_allowed$({$: "Delivery.Edit"}, false, false)), "unreserved_stop_allowed": ($Delivery$unreserved_stop_allowed$(($Round$initial$()))), "delivery_ack": ($Delivery$acknowledge$(1, false)), "delivery_final": ($Delivery$finalize$(1, true, false)), "delivery_finding": ($Delivery$finding_disposition$(false, 0)), "delivery_release": ($Delivery$release_unacknowledged$(false)), "submission_candidate": ($Delivery$submission_candidate$({$: "Delivery.SubmissionFacts", "round_active": true, "has_round": true, "has_unit": true, "has_delivery": true, "pending_capacity": true, "submission_allowed": true, "current_work": true, "credential_authorized": true})), "submission_batch_gate": ($Delivery$submission_batch_gate$(1, true)), "credential_observe": ($Delivery$credential_observe$(false, true, true)), "final_credential_gate": ($Delivery$final_credential_gate$(true, false)), "collection_lease": ($Delivery$collection_lease$(true, false, true, true, true)), "advice_candidate": ($Delivery$advice_candidate$(true, true, true, true)), "notice_candidate": ($Delivery$notice_candidate$(true, true, true, true)), "reserve_candidate": ($Delivery$reserve_candidate$(true)), "reuse_route": ($Reuse$route$(false, false, false)), "reuse_cache_route": ($Reuse$cache_route$(false)), "cache_admission": ($Cache$admit$(false, 10, 100)), "cache_evict": ($Cache$evict$(8, 100, 20, 8, 128000)), "lifecycle_cutoff": ($Lifecycle$cutoff$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": false, "output_reserved": false}, ($sample_work$()), 1)), "lifecycle_finish_gate": ($Lifecycle$finish_gate$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": false, "output_reserved": false}, ($sample_work$()), 1, 0, false)), "lifecycle_reserve": ($Lifecycle$reserve_selected$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": true, "output_reserved": false}, {$: "Work.Work", "next_observation": 2, "next_unit": 2, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Con", "head": {$: "Work.ReviewUnit", "id": 1, "observation": 1, "stage": {$: "Work.PendingFinding"}, "findings": 1, "bytes": 20}, "tail": {$: "Nil"}}}, 1, {$: "Con", "head": 1, "tail": {$: "Nil"}})), "lifecycle_release": ($Lifecycle$release_unwritten$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 1, "stop_token": 1, "barrier": true, "deciding": true, "output_reserved": true}, 1)), "finish_disposition": ($Lifecycle$finish_disposition$(($sample_work$()), {$: "Nil"}, true, true, true, true, false)), "finish_output": ($Lifecycle$finish_output$({$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 1, "barrier": false, "deciding": true, "output_reserved": false}, ($sample_work$()), 1, {$: "Nil"}, true, true, true, true, false)), "selection_reserved": ($Lifecycle$selection_reserve$({$: "Work.Work", "next_observation": 2, "next_unit": 2, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Con", "head": {$: "Work.ReviewUnit", "id": 1, "observation": 1, "stage": {$: "Work.PendingFinding"}, "findings": 1, "bytes": 20}, "tail": {$: "Nil"}}}, {$: "Con", "head": 1, "tail": {$: "Nil"}})), "selection_authorized": ($Lifecycle$selection_authorize$({$: "Lifecycle.OutputSelection", "selected": {$: "Con", "head": 1, "tail": {$: "Nil"}}, "authorized": false, "consumed": false})), "selection_consumed": ($Lifecycle$selection_consume$({$: "Lifecycle.OutputSelection", "selected": {$: "Con", "head": 1, "tail": {$: "Nil"}}, "authorized": true, "consumed": false}, {$: "Con", "head": 1, "tail": {$: "Nil"}})), "ticket_collect_gate": ($Ticket$collect_gate$(false, true)), "ticket_final_authority": ($Ticket$final_authority$(true, true)), "ticket_joined_disposition": ($Ticket$joined_disposition$({$: "Ticket.JoinedFinding"}, false, true, true)), "ticket_unit": ($Ticket$unit$step$({$: "Ticket.UnitFinding", "delivered": false}, {$: "Ticket.MarkDelivered"})), "ticket_unit_initial": ($Ticket$unit$initial$()), "revision_register": ($Revision$register$(true, false)), "revision_superseded": ($Revision$superseded$(1, 1, 1, 2)), "cleanup_gate": ($Retention$cleanup_gate$({$: "Retention.CleanupFacts", "active": true, "dispatcher_idle": true, "no_advice": true, "no_notices": true, "no_pending_evaluations": true, "no_current_work": true, "no_cooldowns": true, "connection_count_ok": true, "cache_matches_ledger": true})), "cleanup_commit": ($Retention$cleanup_commit$(true)), "ticket_retention": ($Retention$ticket_retention$(2, 1, true)), "discard_scope": ($Retention$discard_scope$(2, 2, false))};
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

function $Admission$initial$(_partition_0, _lifetime_0) {
  return {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": 0, "active": false, "closed_at": 0, "next_token": 1, "permits": {$: "Nil"}, "used": {$: "Nil"}};
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

function $Admission$expire$(_state_0, _token_0, _deadline_reached_0) {
  if (!_deadline_reached_0) {
    return {$: "Admission.KeepPermit", "state": _state_0};
  } else {
    return $Admission$expire$due$(_state_0, _token_0);
  }
}

function $Admission$callback_current$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const _owner_0 = _state_0["partition"];
  const _live_0 = _state_0["lifetime"];
  const _current_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  return $Bool$and$(_active_0, ($Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_live_0, _lifetime_0)), ($Nat$is_eq$(_current_0, _round_0)))))));
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

function $Work$initial$() {
  return {$: "Work.Work", "next_observation": 1, "next_unit": 1, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Nil"}};
}

function $Work$start_source$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work$start_source$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($Work$find_observation$(_id_0, _observations_0)));
}

function $sample_work$() {
  return {$: "Work.Work", "next_observation": 2, "next_unit": 1, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Con", "head": {$: "Work.Observation", "id": 1, "stage": {$: "Work.SourceReading"}}, "tail": {$: "Nil"}}, "units": {$: "Nil"}};
}

function $Work$start_unit$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work$start_unit$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($Work$find_unit$(_id_0, _units_0)));
}

function $sample_unit_work$() {
  return {$: "Work.Work", "next_observation": 2, "next_unit": 2, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Con", "head": {$: "Work.ReviewUnit", "id": 1, "observation": 1, "stage": {$: "Work.AtJev"}, "findings": 0, "bytes": 0}, "tail": {$: "Nil"}}};
}

function $Work$spawn$(_work_0, _observation_0, _count_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work$spawn$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, ($Work$find_observation$(_observation_0, _observations_0)));
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

function $Work$complete_source$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work$complete_source$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($Work$find_observation$(_id_0, _observations_0)));
}

function $Work$cached_finding$(_work_0, _observation_0, _count_0, _bytes_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work$cached_finding$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, _bytes_0, ($Work$find_observation$(_observation_0, _observations_0)));
}

function $Work$revise_finding$(_work_0, _id_0, _count_0, _bytes_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work$revise_finding$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, _count_0, _bytes_0, ($Work$find_unit$(_id_0, _units_0)));
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

function $Work$retire$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work$retire$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($Work$find_unit$(_id_0, _units_0)));
}

function $Work$unfinished$(_work_0) {
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _x_0 = ($Work$unfinished_observations$(_observations_0));
  const _x_1 = ($Work$unfinished_units$(_units_0));
  return nat_chk(_x_0 + _x_1);
}

function $Work$pending_findings$(_work_0) {
  const _units_0 = _work_0["units"];
  return $Work$pending_findings_in$(_units_0);
}

function $Work$pending_for$(_work_0, _id_0) {
  const _units_0 = _work_0["units"];
  return $Work$pending_for$found$(($Work$find_unit$(_id_0, _units_0)));
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

function $Work$cancel_unfinished$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Cancelled", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": {$: "Nil"}, "units": ($Work$keep_terminal$(_units_0))}, "cancelled_source": ($Work$observation_ids$(_observations_0)), "cancelled_jev": ($Work$unfinished_unit_ids$(_units_0))};
}

function $Work$finish_wait$(_unfinished_0, _deadline_reached_0, _continuation_budget_0) {
  return $Bool$and$(_continuation_budget_0, ($Bool$and$(($Bool$not$(_deadline_reached_0)), ($Nat$is_gt$(_unfinished_0, 0)))));
}

function $Work$prepared_offer$(_ready_0, _within_frame_0) {
  return $Bool$pick$(($Bool$not$(_ready_0)), {$: "Work.SkipPrepared"}, ($Bool$pick$(_within_frame_0, {$: "Work.AdmitPrepared"}, {$: "Work.RejectPreparedCapacity"})));
}

function $Work$empty_prepared$(_ready_count_0, _has_non_skipped_0, _ticketed_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_ready_count_0, 0)), ($Bool$and$(_has_non_skipped_0, _ticketed_0)))), {$: "Work.FailEmptyLost"}, {$: "Work.NoEmptyFailure"});
}

function $Work$evaluated_disposition$(_has_findings_0, _current_work_0) {
  return $Bool$pick$(_has_findings_0, ($Bool$pick$(_current_work_0, {$: "Work.RetainFinding"}, {$: "Work.RetireStaleFinding"})), ($Bool$pick$(_current_work_0, {$: "Work.SettleClear"}, {$: "Work.SettleStaleClear"})));
}

function $Work$failure_disposition$(_backend_or_timeout_0, _credential_0, _missing_0) {
  return $Bool$pick$(_backend_or_timeout_0, {$: "Work.BackendUnavailable"}, ($Bool$pick$(_credential_0, {$: "Work.CredentialUnavailable"}, ($Bool$pick$(_missing_0, {$: "Work.LostUnavailable"}, {$: "Work.NoFailure"})))));
}

function $Work$set_source_capacity$(_work_0, _capacity_0) {
  return $Work$set_source_capacity$apply$(_work_0, _capacity_0, ($Flow$capacity_valid$(_capacity_0)));
}

function $Work$set_review_capacity$(_work_0, _capacity_0) {
  return $Work$set_review_capacity$apply$(_work_0, _capacity_0, ($Flow$capacity_valid$(_capacity_0)));
}

function $Handoff$select$(_state_0, _advice_0, _prospective_bytes_0) {
  const _partition_0 = _state_0["partition"];
  const _round_0 = _state_0["round"];
  const _selected_0 = _state_0["selected"];
  const _retained_0 = _state_0["retained"];
  const __0 = _state_0["findings"];
  const __1 = _state_0["bytes"];
  const _id_0 = _advice_0["id"];
  const __2 = _advice_0["unit"];
  const __3 = _advice_0["partition"];
  const __4 = _advice_0["round"];
  const __5 = _advice_0["snapshot"];
  const __6 = _advice_0["current_snapshot"];
  const __7 = _advice_0["credential"];
  const __8 = _advice_0["current_credential"];
  const __9 = _advice_0["age_ms"];
  const __10 = _advice_0["solo_bytes"];
  const __11 = _advice_0["collection_ready"];
  const _x_0 = ($Handoff$contains$(_id_0, _selected_0));
  const _x_1 = ($Handoff$contains$(_id_0, _retained_0));
  return $Handoff$select$duplicate$({$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": _retained_0, "findings": __0, "bytes": __1}, {$: "Handoff.Advice", "id": _id_0, "unit": __2, "partition": __3, "round": __4, "snapshot": __5, "current_snapshot": __6, "credential": __7, "current_credential": __8, "age_ms": __9, "solo_bytes": __10, "collection_ready": __11}, _prospective_bytes_0, ($Handoff$current$({$: "Handoff.Advice", "id": _id_0, "unit": __2, "partition": __3, "round": __4, "snapshot": __5, "current_snapshot": __6, "credential": __7, "current_credential": __8, "age_ms": __9, "solo_bytes": __10, "collection_ready": __11}, _partition_0, _round_0)), (_x_0 || _x_1));
}

function $Handoff$initial$(_partition_0, _round_0) {
  return {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": {$: "Nil"}, "retained": {$: "Nil"}, "findings": 0, "bytes": 0};
}

function $Handoff$fits_batch$(_items_0, _bytes_0) {
  return $Bool$and$(($Nat$is_gt$(_items_0, 0)), ($Nat$is_le$(_bytes_0, 10240)));
}

function $Handoff$notice_offer$(_items_0, _bytes_0, _skip_unfitting_0) {
  return $Bool$pick$(($Handoff$fits_batch$(_items_0, _bytes_0)), {$: "Handoff.IncludeNotice"}, ($Bool$pick$(_skip_unfitting_0, {$: "Handoff.SkipNotice"}, {$: "Handoff.StopNotices"})));
}

function $Notice$prune$(_has_pending_0, _leased_0, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0) {
  const _x_0 = ($Bool$not$(_has_pending_0));
  return {$: "Notice.Prune", "drop_lease": ($Bool$and$(_has_pending_0, ($Bool$and$(_leased_0, _lease_expired_0)))), "drop_pending": ($Bool$and$(_has_pending_0, _pending_expired_0)), "drop_key": ($Bool$and$(($Bool$not$(_excepted_0)), ($Bool$and$(_cooldown_expired_0, (_x_0 || _pending_expired_0)))))};
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

function $Handoff$finish$initial$(_round_0) {
  return {$: "Handoff.Finish", "round": _round_0, "active": true, "closed": false, "continuations": 0, "reserved": false, "token": 0, "collector": 0, "deadline_at": 0};
}

function $Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff$lease$reserve$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _surface_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $Handoff$lease$initial$(_item_0, _round_0) {
  return {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": false, "reoffered": false, "phase": {$: "Handoff.Available"}};
}

function $Handoff$lease$authorize$(_state_0, _round_0, _token_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff$lease$authorize$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $sample_reserved_lease$() {
  return {$: "Handoff.Lease", "item": 1, "round": 1, "closed": false, "reoffered": false, "phase": {$: "Handoff.Reserved", "token": 1, "surface": {$: "Handoff.Background"}}};
}

function $Handoff$lease$release$(_state_0, _round_0, _token_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff$lease$release$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $Handoff$lease$terminal$(_state_0, _round_0, _token_0, _certain_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff$lease$terminal$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _certain_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $sample_authorized_lease$() {
  return {$: "Handoff.Lease", "item": 1, "round": 1, "closed": false, "reoffered": false, "phase": {$: "Handoff.Authorized", "token": 1, "surface": {$: "Handoff.Background"}}};
}

function $Handoff$lease$reoffer$(_state_0, _round_0, _token_0, _fresh_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const __1 = _state_0["phase"];
  return $Handoff$lease$reoffer$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": __1}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$and$(($Bool$not$(_closed_0)), ($Bool$and$(($Bool$not$(_reoffered_0)), _fresh_0)))))));
}

function $sample_uncertain_lease$() {
  return {$: "Handoff.Lease", "item": 1, "round": 1, "closed": false, "reoffered": false, "phase": {$: "Handoff.Uncertain", "surface": {$: "Handoff.Background"}}};
}

function $Handoff$lease$offer$(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  const __0 = _state_0["item"];
  const __1 = _state_0["round"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  return $Handoff$lease$offer$phase$({$: "Handoff.Lease", "item": __0, "round": __1, "closed": __2, "reoffered": __3, "phase": _phase_0}, _round_0, _token_0, _surface_0, _fresh_0, _phase_0);
}

function $Handoff$lease$close$(_state_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  return {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": true, "reoffered": _reoffered_0, "phase": _phase_0};
}

function $Handoff$lease$suppresses$(_state_0, _round_0, _requested_0) {
  const _owner_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _phase_0 = _state_0["phase"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _round_0)), ($Bool$and$(($Bool$not$(_closed_0)), ($Handoff$lease$suppress_phase$(_phase_0, _requested_0)))));
}

function $Round$begin_stop$(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($Bool$and$(_live_0, ($Bool$and$(($Nat$is_eq$(_owner_0, 0)), ($Nat$is_gt$(_token_0, 0)))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _token_0, "barrier": false, "deciding": false, "output_reserved": false}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round$initial$() {
  return {$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false};
}

function $Round$active$(_state_0, _generation_0) {
  const _own_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  return $Bool$and$(_live_0, ($Nat$is_eq$(_own_0, _generation_0)));
}

function $Round$budget$(_state_0) {
  const _live_0 = _state_0["active"];
  const _count_0 = _state_0["continuations"];
  const _x_0 = ($Round$max_continuations$());
  return $Bool$and$(_live_0, (_count_0 < _x_0));
}

function $Round$max_continuations$() {
  return 4;
}

function $Round$owns_stop$(_state_0, _token_0) {
  const _live_0 = _state_0["active"];
  const _owner_0 = _state_0["stop_token"];
  const _deciding_0 = _state_0["deciding"];
  return $Bool$and$(_live_0, ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Nat$is_eq$(_owner_0, _token_0)), ($Bool$not$(_deciding_0)))))));
}

function $Round$begin_decision$(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($Round$owns_stop$({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}, _token_0)), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": true, "output_reserved": _output_0}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round$consume$(_state_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  const _x_0 = ($Nat$is_gt$(_owner_0, 0));
  return $Bool$pick$(($Round$budget$({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0})), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": nat_chk(_count_0 + 1), "stop_token": _owner_0, "barrier": (_barrier_0 || _x_0), "deciding": _deciding_0, "output_reserved": _output_0}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round$reserve_output$(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($Bool$and$(_live_0, ($Bool$and$(_deciding_0, ($Bool$and$(($Nat$is_eq$(_owner_0, _token_0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(_output_0)), ($Round$budget$({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0})))))))))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": nat_chk(_count_0 + 1), "stop_token": _owner_0, "barrier": true, "deciding": _deciding_0, "output_reserved": true}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round$finish_stop$(_state_0, _token_0, _close_0, _at_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Nat$is_eq$(_owner_0, _token_0)))), {$: "Round.Granted", "state": ($Bool$pick$(_close_0, {$: "Round.Round", "generation": _generation_0, "active": false, "closed_at": _at_0, "continuations": _count_0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false}, {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false}))}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round$stop_terminal$(_has_output_0, _authorized_0, _requested_close_0) {
  const _x_0 = ($Bool$and$(_has_output_0, ($Bool$not$(_authorized_0))));
  return {$: "Round.StopTerminal", "revoke_provisional": ($Bool$and$(_has_output_0, ($Bool$not$(_authorized_0)))), "close": (_requested_close_0 || _x_0)};
}

function $Round$expire_close$(_barrier_0) {
  return $Bool$not$(_barrier_0);
}

function $Round$reopen$(_state_0, _generation_0) {
  const _current_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($Bool$and$(($Bool$not$(_live_0)), ($Nat$is_eq$(_generation_0, nat_chk(_current_0 + 1))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": true, "closed_at": _closed_at_0, "continuations": 0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _current_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Background$claim$(_state_0, _token_0, _active_0, _used_0, _capacity_0) {
  const _owner_0 = _state_0["owner"];
  return $Bool$pick$(($Bool$and$(_active_0, ($Bool$and$(($Nat$is_eq$(_owner_0, 0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), (_used_0 < _capacity_0))))))), {$: "Background.Granted", "state": {$: "Background.Waiter", "owner": _token_0}}, {$: "Background.Denied", "state": {$: "Background.Waiter", "owner": _owner_0}});
}

function $Background$initial$() {
  return {$: "Background.Waiter", "owner": 0};
}

function $Background$release$(_state_0, _token_0) {
  const _owner_0 = _state_0["owner"];
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Nat$is_eq$(_owner_0, _token_0)))), {$: "Background.Granted", "state": ($Background$initial$())}, {$: "Background.Denied", "state": {$: "Background.Waiter", "owner": _owner_0}});
}

function $Background$expire$(_state_0, _elapsed_0, _lifetime_0) {
  const _owner_0 = _state_0["owner"];
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_owner_0, 0)), ($Nat$is_ge$(_elapsed_0, _lifetime_0)))), ($Background$initial$()), {$: "Background.Waiter", "owner": _owner_0});
}

function $Notice$decide$(_remaining_0, _count_0, _maximum_0) {
  if (_remaining_0.$ === "Some") {
    const _duration_0 = _remaining_0["value"];
    return $Bool$pick$(($Nat$is_gt$(_duration_0, 0)), {$: "Notice.Suppress"}, {$: "Notice.Refresh"});
  } else {
    return $Bool$pick$(($Nat$is_ge$(_count_0, _maximum_0)), {$: "Notice.RejectFull"}, {$: "Notice.Create"});
  }
}

function $Notice$advance$(_remaining_0, _count_0, _maximum_0, _suppressed_0, _pending_0, _leased_0, _max_count_0) {
  return $Notice$advance$action$(($Notice$decide$(_remaining_0, _count_0, _maximum_0)), _suppressed_0, _pending_0, _leased_0, _max_count_0);
}

function $Collection$order$(_left_cycle_0, _left_sequence_0, _right_cycle_0, _right_sequence_0) {
  return $Bool$pick$((_left_cycle_0 < _right_cycle_0), {$: "Collection.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_cycle_0, _right_cycle_0)), {$: "Collection.After"}, ($Bool$pick$((_left_sequence_0 < _right_sequence_0), {$: "Collection.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_sequence_0, _right_sequence_0)), {$: "Collection.After"}, {$: "Collection.Equal"})))))));
}

function $Collection$credential_disposition$(_same_scope_0, _generation_valid_0) {
  return $Bool$pick$(($Bool$and$(_same_scope_0, ($Bool$not$(_generation_valid_0)))), {$: "Collection.RetireAdvice"}, {$: "Collection.RetainAdvice"});
}

function $Collection$eligible$(_already_0, _turn_end_0, _cycle_complete_0, _elapsed_0, _window_0) {
  const _x_0 = ($Nat$is_ge$(_elapsed_0, _window_0));
  const _x_1 = (_cycle_complete_0 || _x_0);
  const _x_2 = (_turn_end_0 || _x_1);
  return (_already_0 || _x_2);
}

function $Collection$expired$(_elapsed_0, _lifetime_0) {
  return $Nat$is_ge$(_elapsed_0, _lifetime_0);
}

function $Delivery$transition$(_current_0, _requested_0) {
  if (_current_0.$ === "Delivery.Reserved") {
    if (_requested_0.$ === "Delivery.Authorized") {
      return {$: "Delivery.Granted", "phase": {$: "Delivery.Authorized"}};
    } else {
      return {$: "Delivery.Denied", "phase": {$: "Delivery.Reserved"}};
    }
  } else if (_current_0.$ === "Delivery.Authorized") {
    if (_requested_0.$ === "Delivery.Submitted") {
      return {$: "Delivery.Granted", "phase": {$: "Delivery.Submitted"}};
    } else if (_requested_0.$ === "Delivery.Uncertain") {
      return {$: "Delivery.Granted", "phase": {$: "Delivery.Uncertain"}};
    } else {
      return {$: "Delivery.Denied", "phase": {$: "Delivery.Authorized"}};
    }
  } else {
    return {$: "Delivery.Denied", "phase": _current_0};
  }
}

function $Delivery$expired$(_phase_0, _elapsed_0, _lifetime_0) {
  if (_phase_0.$ === "Delivery.Authorized") {
    return $Nat$is_ge$(_elapsed_0, _lifetime_0);
  } else {
    return false;
  }
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

function $Delivery$submission_allowed$(_round_0, _surface_0, _existing_token_0, _finish_permit_0) {
  const _live_0 = _round_0["active"];
  const _barrier_0 = _round_0["barrier"];
  const _deciding_0 = _round_0["deciding"];
  return $Delivery$submission_allowed_facts$(_live_0, _barrier_0, _deciding_0, _surface_0, _existing_token_0, _finish_permit_0);
}

function $Delivery$existing_token_allowed$(_surface_0, _existing_token_0, _finish_permit_0) {
  if (_surface_0.$ === "Delivery.Stop") {
    const _x_0 = ($Bool$not$(_existing_token_0));
    return (_x_0 || _finish_permit_0);
  } else {
    return $Bool$not$(_existing_token_0);
  }
}

function $Delivery$unreserved_stop_allowed$(_round_0) {
  const _live_0 = _round_0["active"];
  const _deciding_0 = _round_0["deciding"];
  return $Delivery$unreserved_stop_allowed_facts$(_live_0, _deciding_0);
}

function $Delivery$acknowledge$(_items_0, _any_expired_0) {
  return $Bool$pick$(($Nat$is_eq$(_items_0, 0)), {$: "Delivery.AckEmpty"}, ($Bool$pick$(_any_expired_0, {$: "Delivery.AckExpired"}, {$: "Delivery.AckReady"})));
}

function $Delivery$finalize$(_items_0, _all_acknowledged_0, _any_expired_0) {
  const _x_0 = ($Nat$is_eq$(_items_0, 0));
  const _x_1 = ($Bool$not$(_all_acknowledged_0));
  return $Bool$pick$((_x_0 || _x_1), {$: "Delivery.FinalEmpty"}, ($Bool$pick$(_any_expired_0, {$: "Delivery.FinalExpired"}, {$: "Delivery.FinalReady"})));
}

function $Delivery$finding_disposition$(_composed_0, _remaining_0) {
  return $Bool$pick$(_composed_0, {$: "Delivery.KeepForReoffer"}, ($Bool$pick$(($Nat$is_eq$(_remaining_0, 0)), {$: "Delivery.RetireAdvice"}, {$: "Delivery.KeepRemaining"})));
}

function $Delivery$release_unacknowledged$(_acknowledged_0) {
  return $Bool$not$(_acknowledged_0);
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

function $Delivery$collection_lease$(_has_lease_0, _expired_0, _stop_collector_0, _same_group_0, _background_reofferable_0) {
  const _x_0 = ($Bool$and$(_stop_collector_0, ($Bool$and$(_same_group_0, _background_reofferable_0))));
  return $Bool$pick$(($Bool$and$(_has_lease_0, (_expired_0 || _x_0))), {$: "Delivery.DropLease"}, {$: "Delivery.KeepLease"});
}

function $Delivery$advice_candidate$(_same_partition_0, _unleased_0, _has_unsuppressed_finding_0, _ticket_owns_0) {
  return $Bool$and$(_same_partition_0, ($Bool$and$(_unleased_0, ($Bool$and$(_has_unsuppressed_finding_0, _ticket_owns_0)))));
}

function $Delivery$notice_candidate$(_same_partition_0, _has_pending_0, _unleased_0, _ticket_owns_0) {
  return $Bool$and$(_same_partition_0, ($Bool$and$(_has_pending_0, ($Bool$and$(_unleased_0, _ticket_owns_0)))));
}

function $Delivery$reserve_candidate$(_unleased_0) {
  return _unleased_0;
}

function $Reuse$route$(_live_advice_0, _attached_pending_0, _claimed_pending_0) {
  if (_live_advice_0) {
    return {$: "Reuse.JoinAdvice"};
  } else {
    if (_attached_pending_0) {
      return {$: "Reuse.JoinPending"};
    } else {
      if (_claimed_pending_0) {
        return {$: "Reuse.JoinClaimed"};
      } else {
        return {$: "Reuse.LookupCache"};
      }
    }
  }
}

function $Reuse$cache_route$(_hit_0) {
  if (_hit_0) {
    return {$: "Reuse.Cached"};
  } else {
    return {$: "Reuse.Own"};
  }
}

function $Cache$admit$(_existing_0, _incoming_bytes_0, _byte_limit_0) {
  return $Bool$pick$(_existing_0, {$: "Cache.Already"}, ($Bool$pick$(($Nat$is_gt$(_incoming_bytes_0, _byte_limit_0)), {$: "Cache.Reject"}, {$: "Cache.Add"})));
}

function $Cache$evict$(_entries_0, _current_bytes_0, _incoming_bytes_0, _entry_limit_0, _byte_limit_0) {
  const _x_0 = ($Nat$is_ge$(_entries_0, _entry_limit_0));
  const _x_1 = ($Nat$is_gt$(nat_chk(_current_bytes_0 + _incoming_bytes_0), _byte_limit_0));
  return $Bool$and$(($Nat$is_gt$(_entries_0, 0)), (_x_0 || _x_1));
}

function $Lifecycle$cutoff$(_round_0, _work_0, _token_0) {
  return $Lifecycle$cutoff$round$(_work_0, ($Round$begin_decision$(_round_0, _token_0)));
}

function $Lifecycle$finish_gate$(_round_0, _work_0, _token_0, _extra_unfinished_0, _deadline_reached_0) {
  const _x_0 = ($Work$unfinished$(_work_0));
  return $Bool$pick$(($Round$owns_stop$(_round_0, _token_0)), ($Bool$pick$(($Work$finish_wait$(nat_chk(_x_0 + _extra_unfinished_0), _deadline_reached_0, ($Round$budget$(_round_0)))), {$: "Lifecycle.GateWaiting", "round": _round_0, "work": _work_0}, ($Lifecycle$finish_gate$cutoff$(($Lifecycle$cutoff$(_round_0, _work_0, _token_0)))))), {$: "Lifecycle.GateDenied", "round": _round_0, "work": _work_0});
}

function $Lifecycle$reserve_selected$(_round_0, _work_0, _token_0, _selected_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(($List$length$(_selected_0)), 0)), ($Lifecycle$selected_valid$(_work_0, _selected_0, _selected_0)))), ($Round$reserve_output$(_round_0, _token_0)), {$: "Round.Denied", "state": _round_0});
}

function $Lifecycle$release_unwritten$(_round_0, _token_0) {
  return $Round$release_output$(_round_0, _token_0);
}

function $Lifecycle$finish_disposition$(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0) {
  if (!_can_write_0) {
    return $Lifecycle$finish_disposition$empty$(false, false, _deadline_reached_0);
  } else {
    return $Lifecycle$finish_disposition$writable$(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _binding_valid_0, _deadline_reached_0);
  }
}

function $Lifecycle$finish_output$(_round_0, _work_0, _token_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0) {
  return $Lifecycle$finish_output$decide$(_round_0, _work_0, _token_0, _selected_0, ($Lifecycle$finish_disposition$(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0)));
}

function $Lifecycle$selection_reserve$(_work_0, _selected_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(($List$length$(_selected_0)), 0)), ($Lifecycle$selected_valid$(_work_0, _selected_0, _selected_0)))), {$: "Lifecycle.SelectionReserved", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": false, "consumed": false}}, {$: "Lifecycle.SelectionRejected"});
}

function $Lifecycle$selection_authorize$(_state_0) {
  const _selected_0 = _state_0["selected"];
  const _authorized_0 = _state_0["authorized"];
  const _consumed_0 = _state_0["consumed"];
  return $Bool$pick$(($Bool$and$(($Bool$not$(_authorized_0)), ($Bool$not$(_consumed_0)))), {$: "Lifecycle.SelectionGranted", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": true, "consumed": false}}, {$: "Lifecycle.SelectionDenied", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": _authorized_0, "consumed": _consumed_0}});
}

function $Lifecycle$selection_consume$(_state_0, _actual_0) {
  const _selected_0 = _state_0["selected"];
  const _authorized_0 = _state_0["authorized"];
  const _consumed_0 = _state_0["consumed"];
  return $Bool$pick$(($Bool$and$(_authorized_0, ($Bool$and$(($Bool$not$(_consumed_0)), ($Lifecycle$selection_same$(_selected_0, _actual_0)))))), {$: "Lifecycle.SelectionGranted", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": true, "consumed": true}}, {$: "Lifecycle.SelectionDenied", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": _authorized_0, "consumed": _consumed_0}});
}

function $Ticket$collect_gate$(_expired_0, _credential_valid_0) {
  return $Bool$pick$(_expired_0, {$: "Ticket.CollectUnavailable", "reason": {$: "Ticket.Expired"}}, ($Bool$pick$(($Bool$not$(_credential_valid_0)), {$: "Ticket.CollectUnavailable", "reason": {$: "Ticket.Credential"}}, {$: "Ticket.CollectProceed"})));
}

function $Ticket$final_authority$(_admitted_block_0, _current_block_0) {
  return $Bool$pick$(($Bool$and$(_admitted_block_0, ($Bool$not$(_current_block_0)))), {$: "Ticket.FinalRelease"}, {$: "Ticket.FinalProceed"});
}

function $Ticket$joined_disposition$(_state_0, _stale_unavailable_0, _has_revision_0, _has_advice_id_0) {
  return $Bool$pick$(_stale_unavailable_0, {$: "Ticket.KeepJoined"}, ($Ticket$joined$route$(_state_0, _has_revision_0, _has_advice_id_0)));
}

function $Ticket$unit$step$(_stage_0, _event_0) {
  if (_event_0.$ === "Ticket.Revise") {
    return $Ticket$unit$revise$(_stage_0);
  } else if (_event_0.$ === "Ticket.ClearResult") {
    return $Ticket$unit$result$(_stage_0, false);
  } else if (_event_0.$ === "Ticket.FindingResult") {
    return $Ticket$unit$result$(_stage_0, true);
  } else if (_event_0.$ === "Ticket.FailUnit") {
    return {$: "Ticket.UnitGranted", "stage": {$: "Ticket.UnitUnavailable"}};
  } else {
    return $Ticket$unit$delivered$(_stage_0);
  }
}

function $Ticket$unit$initial$() {
  return {$: "Ticket.UnitPending"};
}

function $Revision$register$(_has_current_0, _same_input_0) {
  return $Bool$pick$(($Bool$and$(_has_current_0, _same_input_0)), {$: "Revision.Reuse"}, {$: "Revision.Replace"});
}

function $Revision$superseded$(_candidate_subject_0, _target_subject_0, _candidate_generation_0, _current_generation_0) {
  return $Bool$and$(($Nat$is_eq$(_candidate_subject_0, _target_subject_0)), ($Bool$not$(($Nat$is_eq$(_candidate_generation_0, _current_generation_0)))));
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

function $Retention$cleanup_commit$(_ledger_empty_0) {
  return $Bool$pick$(_ledger_empty_0, {$: "Retention.CleanupReady"}, {$: "Retention.CleanupBusy"});
}

function $Retention$ticket_retention$(_count_0, _limit_0, _has_oldest_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_count_0, _limit_0)), _has_oldest_0)), {$: "Retention.EvictOldest"}, {$: "Retention.KeepTickets"});
}

function $Retention$discard_scope$(_named_count_0, _cancelled_count_0, _has_unnamed_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_named_count_0, _cancelled_count_0)), ($Bool$not$(_has_unnamed_0)))), {$: "Retention.NamedOnly"}, {$: "Retention.AllUnfinished"});
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

function $Bool$pick$(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
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

function $Admission$expire$due$(_state_0, _token_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  const _used_0 = _state_0["used"];
  return {$: "Admission.RemovePermit", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0)), "used": ($Admission$record_used$(_token_0, _permits_0, _used_0))}};
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

function $Work$start_source$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    return $Work$start_source$apply$(_work_0, _id_0);
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

function $Work$start_unit$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work$start_unit$stage$(_work_0, _id_0, _observation_0, _stage_0);
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

function $Work$spawn$found$(_work_0, _observation_0, _count_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $Work$spawn$count$(_work_0, _observation_0, _count_0, ($Nat$is_le$(_count_0, 16)));
    }
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

function $Work$complete_source$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $Work$interrupt_observation$(_work_0, _id_0);
    }
  }
}

function $Work$cached_finding$found$(_work_0, _observation_0, _count_0, _bytes_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $Work$cached_finding$count$(_work_0, _observation_0, _count_0, _bytes_0, ($Nat$is_gt$(_count_0, 0)));
    }
  }
}

function $Work$revise_finding$found$(_work_0, _id_0, _count_0, _bytes_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work$revise_finding$stage$(_work_0, _id_0, _observation_0, _stage_0, _count_0, _bytes_0);
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

function $Work$retire$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _stage_0 = _t_0["stage"];
    return $Work$retire$stage$(_work_0, _id_0, ($Work$is_unit_unfinished$(_stage_0)));
  }
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

function $Work$pending_for$found$(_found_0) {
  if (_found_0.$ === "None") {
    return 0;
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.PendingFinding") {
      const _findings_0 = _t_0["findings"];
      return _findings_0;
    } else {
      return 0;
    }
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

function $Work$keep_terminal$(_units_0) {
  if (_units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _units_0["head"];
    const __0 = _t_0["id"];
    const __1 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    const __2 = _t_0["findings"];
    const __3 = _t_0["bytes"];
    const _rest_0 = _units_0["tail"];
    return $Work$keep_terminal$pick$({$: "Work.ReviewUnit", "id": __0, "observation": __1, "stage": _stage_0, "findings": __2, "bytes": __3}, ($Work$keep_terminal$(_rest_0)), ($Work$is_unit_unfinished$(_stage_0)));
  }
}

function $Work$observation_ids$(_observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _observations_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($Work$observation_ids$(_rest_0))};
  }
}

function $Work$unfinished_unit_ids$($0) {
  for (;;) {
    {
      const _units_0 = $0;
      if (_units_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _t_0 = _units_0["head"];
        const _id_0 = _t_0["id"];
        const _t_1 = _t_0["stage"];
        if (_t_1.$ === "Work.ReviewQueued") {
          const _rest_0 = _units_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($Work$unfinished_unit_ids$(_rest_0))};
        } else if (_t_1.$ === "Work.AtJev") {
          const _rest_1 = _units_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($Work$unfinished_unit_ids$(_rest_1))};
        } else {
          const _rest_2 = _units_0["tail"];
          $0 = _rest_2;
          continue;
        }
      }
    }
  }
}

function $Nat$is_gt$(_a_0, _b_0) {
  return $Cmp$is_gt$(cmp_new(_a_0, _b_0));
}

function $Work$set_source_capacity$apply$(_work_0, _capacity_0, _valid_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.InvalidCapacity"}};
  } else {
    return {$: "Work.Accepted", "state": ($Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $Flow$capacity_valid$(_capacity_0) {
  const _low_0 = _capacity_0["low"];
  const _high_0 = _capacity_0["high"];
  const _x_0 = ($Nat$is_gt$(_high_0, 0));
  const _x_1 = ($Nat$is_gt$(_low_0, 0));
  return (_x_0 || _x_1);
}

function $Work$set_review_capacity$apply$(_work_0, _capacity_0, _valid_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.InvalidCapacity"}};
  } else {
    return {$: "Work.Accepted", "state": ($Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _capacity_0, "observations": _observations_0, "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $Handoff$select$duplicate$(_state_0, _advice_0, _prospective_bytes_0, _current_0, _duplicate_0) {
  if (_duplicate_0) {
    return {$: "Handoff.Duplicate", "state": _state_0};
  } else {
    return $Handoff$select$current$(_state_0, _advice_0, _prospective_bytes_0, _current_0);
  }
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

function $Handoff$contains$(_id_0, _ids_0) {
  if (_ids_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _ids_0["head"];
    const _rest_0 = _ids_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _item_0));
    const _x_1 = ($Handoff$contains$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $Nat$is_le$(_a_0, _b_0) {
  return $Cmp$is_le$(cmp_new(_a_0, _b_0));
}

function $Handoff$finish$guard$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _valid_0, _reserved_0) {
  if (_valid_0) {
    return $Handoff$finish$pending$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0);
  } else {
    return {$: "Handoff.Allow", "state": _state_0};
  }
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

function $Handoff$lease$release$guard$(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff$lease$release$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
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

function $Nat$is_ge$(_a_0, _b_0) {
  return $Cmp$is_ge$(cmp_new(_a_0, _b_0));
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

function $Delivery$submission_allowed_facts$(_live_0, _barrier_0, _deciding_0, _surface_0, _existing_token_0, _finish_permit_0) {
  if (_surface_0.$ === "Delivery.Background") {
    return $Bool$and$(_live_0, ($Bool$and$(($Delivery$existing_token_allowed$({$: "Delivery.Background"}, _existing_token_0, _finish_permit_0)), ($Bool$and$(($Bool$not$(_barrier_0)), ($Bool$not$(_deciding_0)))))));
  } else if (_surface_0.$ === "Delivery.Stop") {
    return $Bool$and$(_live_0, ($Delivery$existing_token_allowed$({$: "Delivery.Stop"}, _existing_token_0, _finish_permit_0)));
  } else {
    return $Bool$and$(_live_0, ($Delivery$existing_token_allowed$({$: "Delivery.Edit"}, _existing_token_0, _finish_permit_0)));
  }
}

function $Delivery$unreserved_stop_allowed_facts$(_live_0, _deciding_0) {
  return $Bool$and$(_live_0, ($Bool$not$(_deciding_0)));
}

function $Lifecycle$cutoff$round$(_work_0, _result_0) {
  if (_result_0.$ === "Round.Granted") {
    const _round_0 = _result_0["state"];
    return $Lifecycle$cutoff$granted$(_round_0, ($Work$cancel_unfinished$(_work_0)));
  } else {
    const _round_1 = _result_0["state"];
    return {$: "Lifecycle.CutoffDenied", "round": _round_1, "work": _work_0};
  }
}

function $Lifecycle$finish_gate$cutoff$(_result_0) {
  if (_result_0.$ === "Lifecycle.CutoffGranted") {
    const _round_0 = _result_0["round"];
    const _work_0 = _result_0["work"];
    const _source_0 = _result_0["cancelled_source"];
    const _jev_0 = _result_0["cancelled_jev"];
    return {$: "Lifecycle.GateCutoff", "round": _round_0, "work": _work_0, "cancelled_source": _source_0, "cancelled_jev": _jev_0};
  } else {
    const _round_1 = _result_0["round"];
    const _work_1 = _result_0["work"];
    return {$: "Lifecycle.GateDenied", "round": _round_1, "work": _work_1};
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

function $Lifecycle$selected_valid$(_work_0, _selected_0, _remaining_0) {
  if (_remaining_0.$ === "Nil") {
    return true;
  } else {
    const _unit_0 = _remaining_0["head"];
    const _rest_0 = _remaining_0["tail"];
    return $Bool$and$(($Nat$is_gt$(_unit_0, 0)), ($Bool$and$(($Nat$is_le$(($Lifecycle$selected_count$(_unit_0, _selected_0)), ($Work$pending_for$(_work_0, _unit_0)))), ($Lifecycle$selected_valid$(_work_0, _selected_0, _rest_0)))));
  }
}

function $Round$release_output$(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($Bool$and$(_live_0, ($Bool$and$(_deciding_0, ($Bool$and$(($Nat$is_eq$(_owner_0, _token_0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(_output_0, ($Nat$is_gt$(_count_0, 0)))))))))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": (_count_0 < 1 ? 0 : _count_0 - 1), "stop_token": _owner_0, "barrier": false, "deciding": _deciding_0, "output_reserved": false}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Lifecycle$finish_disposition$empty$(_has_notice_0, _pass_notices_0, _deadline_reached_0) {
  return $Bool$pick$(($Bool$and$(_has_notice_0, _pass_notices_0)), {$: "Lifecycle.PassNotices"}, ($Bool$pick$(_deadline_reached_0, {$: "Lifecycle.AllowDeadline"}, {$: "Lifecycle.AllowNoAdvice"})));
}

function $Lifecycle$finish_disposition$writable$(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _binding_valid_0, _deadline_reached_0) {
  if (!_binding_valid_0) {
    return {$: "Lifecycle.AllowUnavailable"};
  } else {
    return $Lifecycle$finish_disposition$valid$(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _deadline_reached_0);
  }
}

function $Lifecycle$finish_output$decide$(_round_0, _work_0, _token_0, _selected_0, _disposition_0) {
  if (_disposition_0.$ === "Lifecycle.ReserveFindings") {
    return $Lifecycle$finish_output$reserve$(_round_0, _work_0, _token_0, _selected_0);
  } else if (_disposition_0.$ === "Lifecycle.PassNotices") {
    return {$: "Lifecycle.OutputNotices"};
  } else if (_disposition_0.$ === "Lifecycle.AllowNoAdvice") {
    return {$: "Lifecycle.OutputAllowed", "reason": {$: "Lifecycle.AllowNoAdvice"}};
  } else if (_disposition_0.$ === "Lifecycle.AllowDeadline") {
    return {$: "Lifecycle.OutputAllowed", "reason": {$: "Lifecycle.AllowDeadline"}};
  } else {
    return {$: "Lifecycle.OutputAllowed", "reason": {$: "Lifecycle.AllowUnavailable"}};
  }
}

function $Lifecycle$selection_same$(_left_0, _right_0) {
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
      return $Bool$and$(($Nat$is_eq$(_head_0, _other_0)), ($Lifecycle$selection_same$(_tail_0, _rest_0)));
    }
  }
}

function $Ticket$joined$route$(_state_0, _has_revision_0, _has_advice_id_0) {
  if (_state_0.$ === "Ticket.JoinedUnavailable") {
    return {$: "Ticket.SetJoinedUnavailable"};
  } else if (_state_0.$ === "Ticket.JoinedPending") {
    return $Bool$pick$(_has_revision_0, {$: "Ticket.KeepJoined"}, {$: "Ticket.SetJoinedLost"});
  } else if (_state_0.$ === "Ticket.JoinedClear") {
    return $Bool$pick$(_has_revision_0, {$: "Ticket.SetJoinedClear"}, {$: "Ticket.SetJoinedLost"});
  } else {
    return $Bool$pick$(($Bool$and$(_has_revision_0, _has_advice_id_0)), {$: "Ticket.SetJoinedFinding"}, {$: "Ticket.SetJoinedLost"});
  }
}

function $Ticket$unit$revise$(_stage_0) {
  if (_stage_0.$ === "Ticket.UnitPending") {
    return {$: "Ticket.UnitGranted", "stage": {$: "Ticket.UnitPending"}};
  } else {
    return {$: "Ticket.UnitDenied", "stage": _stage_0};
  }
}

function $Ticket$unit$result$(_stage_0, _finding_0) {
  if (_stage_0.$ === "Ticket.UnitUnavailable") {
    return {$: "Ticket.UnitDenied", "stage": {$: "Ticket.UnitUnavailable"}};
  } else {
    return {$: "Ticket.UnitGranted", "stage": ($Bool$pick$(_finding_0, {$: "Ticket.UnitFinding", "delivered": false}, {$: "Ticket.UnitClear"}))};
  }
}

function $Ticket$unit$delivered$(_stage_0) {
  if (_stage_0.$ === "Ticket.UnitFinding") {
    return {$: "Ticket.UnitGranted", "stage": {$: "Ticket.UnitFinding", "delivered": true}};
  } else {
    return {$: "Ticket.UnitDenied", "stage": _stage_0};
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

function $Admission$record_used$(_token_0, _permits_0, _used_0) {
  return $Admission$record_used$found$(($Admission$find_permit$(_token_0, _permits_0)), _used_0);
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

function $Work$start_source$apply$(_work_0, _id_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work$start_observation$(_id_0, _observations_0)), "units": _units_0}, "admitted": {$: "Nil"}};
}

function $Work$find_observation$pick$(_observation_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _observation_0};
  } else {
    return _fallback_0;
  }
}

function $Work$start_unit$stage$(_work_0, _id_0, _observation_0, _stage_0) {
  if (_stage_0.$ === "Work.ReviewQueued") {
    return $Work$start_unit$apply$(_work_0, _id_0, _observation_0);
  } else if (_stage_0.$ === "Work.AtJev") {
    return {$: "Work.Accepted", "state": _work_0, "admitted": {$: "Nil"}};
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

function $Work$spawn$count$(_work_0, _observation_0, _count_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.TooManyUnits"}};
  } else {
    return $Work$spawn$apply$(_work_0, _observation_0, _count_0);
  }
}

function $Work$prepare$stage$(_work_0, _observation_0, _count_0, _stage_0) {
  if (_stage_0.$ === "Work.SourceQueued") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
  } else {
    return $Work$prepare$count$(_work_0, _observation_0, _count_0, ($Nat$is_le$(_count_0, 16)));
  }
}

function $Work$cached_finding$count$(_work_0, _observation_0, _count_0, _bytes_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $Work$cached_finding$apply$(_work_0, _observation_0, _count_0, _bytes_0);
  }
}

function $Work$revise_finding$stage$(_work_0, _id_0, _observation_0, _stage_0, _count_0, _bytes_0) {
  if (_stage_0.$ === "Work.PendingFinding") {
    return $Work$revise_finding$valid$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, ($Nat$is_gt$(_count_0, 0)));
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
  }
}

function $Work$outcome$stage$(_work_0, _id_0, _observation_0, _stage_0, _result_0) {
  if (_stage_0.$ === "Work.AtJev") {
    return $Work$outcome$kind$(_work_0, _id_0, _observation_0, _result_0);
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
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

function $Work$retire$stage$(_work_0, _id_0, _unfinished_0) {
  if (_unfinished_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitStillUnfinished"}};
  } else {
    return $Work$retire$apply$(_work_0, _id_0);
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

function $Work$keep_terminal$pick$(_unit_0, _tail_0, _unfinished_0) {
  if (_unfinished_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $Cmp$is_gt$(_c_0) {
  if (_c_0.$ === "GT") {
    return true;
  } else {
    return false;
  }
}

function $Handoff$select$current$(_state_0, _advice_0, _prospective_bytes_0, _valid_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["round"];
  const __2 = _state_0["selected"];
  const __3 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const __4 = _state_0["bytes"];
  const _id_0 = _advice_0["id"];
  const _solo_bytes_0 = _advice_0["solo_bytes"];
  return $Handoff$select$valid$({$: "Handoff.Selection", "partition": __0, "round": __1, "selected": __2, "retained": __3, "findings": _count_0, "bytes": __4}, _id_0, _prospective_bytes_0, _solo_bytes_0, _count_0, _valid_0);
}

function $Cmp$is_le$(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $Handoff$finish$pending$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0) {
  if (_reserved_0) {
    return {$: "Handoff.Wait", "state": _state_0};
  } else {
    return $Handoff$finish$ready$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0);
  }
}

function $Handoff$lease$reserve$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _surface_0) {
  if (_phase_0.$ === "Handoff.Available") {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
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

function $Handoff$lease$release$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Reserved") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $Handoff$lease$release$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat$is_eq$(_own_token_0, _token_0)));
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
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

function $Handoff$lease$offer$background$(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return $Handoff$lease$reoffer$(_state_0, _round_0, _token_0, _fresh_0);
  } else {
    return $Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0);
  }
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

function $Cmp$is_ge$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
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

function $Lifecycle$cutoff$granted$(_round_0, _result_0) {
  const _work_0 = _result_0["state"];
  const _source_0 = _result_0["cancelled_source"];
  const _jev_0 = _result_0["cancelled_jev"];
  return {$: "Lifecycle.CutoffGranted", "round": _round_0, "work": _work_0, "cancelled_source": _source_0, "cancelled_jev": _jev_0};
}

function $Lifecycle$selected_count$(_unit_0, _selected_0) {
  if (_selected_0.$ === "Nil") {
    return 0;
  } else {
    const _head_0 = _selected_0["head"];
    const _rest_0 = _selected_0["tail"];
    const _x_0 = ($Bool$pick$(($Nat$is_eq$(_head_0, _unit_0)), 1, 0));
    const _x_1 = ($Lifecycle$selected_count$(_unit_0, _rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Lifecycle$finish_disposition$valid$(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _deadline_reached_0) {
  if (_selected_0.$ === "Nil") {
    return $Lifecycle$finish_disposition$empty$(_has_notice_0, _pass_notices_0, _deadline_reached_0);
  } else {
    return $Lifecycle$finish_disposition$selected$(_work_0, _selected_0, true);
  }
}

function $Lifecycle$finish_output$reserve$(_round_0, _work_0, _token_0, _selected_0) {
  return $Lifecycle$finish_output$reservation$(_round_0, _work_0, _token_0, _selected_0, ($Lifecycle$selection_reserve$(_work_0, _selected_0)));
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

function $Admission$remove_permit$pick$(_permit_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _permit_0, "tail": _tail_0};
  }
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

function $Work$start_observation$(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $Work$start_observation$pick$({$: "Work.Observation", "id": _current_0, "stage": __0}, ($Work$start_observation$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Work$start_unit$apply$(_work_0, _id_0, _observation_0) {
  return $Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.AtJev"}, "findings": 0, "bytes": 0});
}

function $Work$spawn$apply$(_work_0, _observation_0, _count_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _new_units_0 = ($Work$make_units$(_count_0, _observation_0, _next_unit_0));
  return {$: "Work.Accepted", "state": ($Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + _count_0), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($List$append$(_units_0, _new_units_0))})), "admitted": ($Work$unit_ids$(_new_units_0))};
}

function $Work$prepare$count$(_work_0, _observation_0, _count_0, _within_limit_0) {
  if (!_within_limit_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.TooManyUnits"}};
  } else {
    return $Work$prepare$apply$(_work_0, _observation_0, _count_0);
  }
}

function $Work$cached_finding$apply$(_work_0, _observation_0, _count_0, _bytes_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + 1), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($List$append$(_units_0, {$: "Con", "head": {$: "Work.ReviewUnit", "id": _next_unit_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0}, "tail": {$: "Nil"}}))}, "admitted": {$: "Con", "head": _next_unit_0, "tail": {$: "Nil"}}};
}

function $Work$revise_finding$valid$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0});
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

function $Work$remove_observation$pick$(_observation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _observation_0, "tail": _tail_0};
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

function $Work$retire$apply$(_work_0, _id_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($Work$remove_unit$(_id_0, _units_0))}, "admitted": {$: "Nil"}};
}

function $Handoff$select$valid$(_state_0, _id_0, _prospective_bytes_0, _solo_bytes_0, _count_0, _valid_0) {
  if (_valid_0) {
    return $Handoff$select$solo$(_state_0, _id_0, _prospective_bytes_0, _count_0, ($Nat$is_gt$(_solo_bytes_0, 10240)));
  } else {
    return {$: "Handoff.Expired", "state": _state_0};
  }
}

function $Handoff$finish$ready$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0) {
  if (_deadline_0) {
    return $Handoff$finish$choose$(_state_0, _actionable_findings_0);
  } else {
    return $Handoff$finish$zero$(_state_0, _actionable_findings_0, ($Nat$is_eq$(_unfinished_0, 0)));
  }
}

function $Handoff$lease$authorize$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0) {
  if (_same_0) {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Authorized", "token": _own_token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _own_token_0, "surface": _surface_0}}};
  }
}

function $Handoff$lease$release$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0) {
  if (_same_0) {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Available"}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _own_token_0, "surface": _surface_0}}};
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

function $Lifecycle$finish_disposition$selected$(_work_0, _selected_0, _binding_valid_0) {
  return $Bool$pick$(($Bool$and$(_binding_valid_0, ($Lifecycle$selected_valid$(_work_0, _selected_0, _selected_0)))), {$: "Lifecycle.ReserveFindings"}, {$: "Lifecycle.AllowUnavailable"});
}

function $Lifecycle$finish_output$reservation$(_round_0, _work_0, _token_0, _selected_0, _reservation_0) {
  if (_reservation_0.$ === "Lifecycle.SelectionReserved") {
    const _selection_0 = _reservation_0["state"];
    return $Lifecycle$finish_output$slot$(_selection_0, ($Lifecycle$reserve_selected$(_round_0, _work_0, _token_0, _selected_0)));
  } else {
    return {$: "Lifecycle.OutputAllowed", "reason": {$: "Lifecycle.AllowUnavailable"}};
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

function $Admission$find_permit$pick$(_permit_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _permit_0};
  } else {
    return _fallback_0;
  }
}

function $Work$start_observation$pick$(_observation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return $Work$start_observation$read$(_observation_0, _tail_0);
  } else {
    return {$: "Con", "head": _observation_0, "tail": _tail_0};
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

function $Work$remove_unit$(_id_0, _units_0) {
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
    return $Work$remove_unit$pick$({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, ($Work$remove_unit$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Handoff$select$solo$(_state_0, _id_0, _prospective_bytes_0, _count_0, _oversized_0) {
  if (_oversized_0) {
    return $Handoff$select$limit$(_state_0, _id_0);
  } else {
    return $Handoff$select$fit$(_state_0, _id_0, _prospective_bytes_0, ($Handoff$fits_batch$(nat_chk(_count_0 + 1), _prospective_bytes_0)));
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

function $Lifecycle$finish_output$slot$(_selection_0, _step_0) {
  if (_step_0.$ === "Round.Granted") {
    const _round_0 = _step_0["state"];
    return {$: "Lifecycle.OutputReserved", "round": _round_0, "selection": _selection_0};
  } else {
    return {$: "Lifecycle.OutputAllowed", "reason": {$: "Lifecycle.AllowUnavailable"}};
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
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission$remove_permit$(_token_0, _permits_0)), "used": ($Admission$record_used$(_token_0, _permits_0, _used_0))}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _used_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.InvalidClock"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}, "used": _used_0}, "token": {$: "None"}, "round": {$: "Some", "value": _round_0}};
  }
}

function $Work$start_observation$read$(_observation_0, _tail_0) {
  const _id_0 = _observation_0["id"];
  return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": {$: "Work.SourceReading"}}, "tail": _tail_0};
}

function $Work$replace_unit$pick$(_unit_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $Work$remove_unit$pick$(_unit_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $Handoff$select$limit$(_state_0, _id_0) {
  const _partition_0 = _state_0["partition"];
  const _round_0 = _state_0["round"];
  const _selected_0 = _state_0["selected"];
  const _retained_0 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const _bytes_0 = _state_0["bytes"];
  return {$: "Handoff.Limited", "state": {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": ($List$append$(_retained_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})), "findings": _count_0, "bytes": _bytes_0}, "id": _id_0};
}

function $Handoff$select$fit$(_state_0, _id_0, _prospective_bytes_0, _fits_0) {
  const _partition_0 = _state_0["partition"];
  const _round_0 = _state_0["round"];
  const _selected_0 = _state_0["selected"];
  const _retained_0 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const _bytes_0 = _state_0["bytes"];
  if (_fits_0) {
    return {$: "Handoff.Selected", "state": {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": ($List$append$(_selected_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})), "retained": _retained_0, "findings": nat_chk(_count_0 + 1), "bytes": _prospective_bytes_0}};
  } else {
    return {$: "Handoff.Retained", "state": {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": ($List$append$(_retained_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})), "findings": _count_0, "bytes": _bytes_0}};
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

function $Admission$candidate_round$(_round_0, _active_0) {
  if (_active_0) {
    return _round_0;
  } else {
    return nat_chk(_round_0 + 1);
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
export const bendSelectionInitial = (partition, round) =>
  run_loop($Handoff$initial$(nat(partition), nat(round)));
export const bendSelectionStep = (state, advice, prospectiveBytes) =>
  run_loop($Handoff$select$(state, normalize(advice), nat(prospectiveBytes)));
export const bendFitsBatch = (items, bytes) =>
  run_loop($Handoff$fits_batch$(nat(items), nat(bytes)));
export const bendNoticeOffer = (items, bytes, skipUnfitting) =>
  run_loop($Handoff$notice_offer$(nat(items), nat(bytes), skipUnfitting));
export const bendValidationRoute = (ownerCurrent, status) =>
  run_loop($Handoff$validation_route$(ownerCurrent, normalize(status)));
export const bendPostValidation = (workAccepted, expired, hasFitting) =>
  run_loop($Handoff$post_validation$(workAccepted, expired, hasFitting));
export const bendFinalCandidate = (ownerCurrent, credentialGeneration,
  credentialAuthorized, expired, workCurrent, hasFindings) =>
  run_loop($Handoff$final_candidate$(ownerCurrent, credentialGeneration,
    credentialAuthorized, expired, workCurrent, hasFindings));
export const bendAdmissionInitial = (partition, lifetime) =>
  run_loop($Admission$initial$(nat(partition), nat(lifetime)));
export const bendAdmissionStep = (state, partition, lifetime, event) =>
  run_loop($Admission$step$(state, nat(partition), nat(lifetime), normalize(event)));
export const bendAdmissionProspectiveGate = (facts) =>
  run_loop($Admission$prospective_gate$(normalize(facts)));
export const bendAdmissionExpire = (state, token, deadlineReached) =>
  run_loop($Admission$expire$(state, nat(token), deadlineReached));
export const bendWorkFinishWait = (unfinished, deadlineReached, continuationBudget) =>
  run_loop($Work$finish_wait$(nat(unfinished), deadlineReached, continuationBudget));
export const bendWorkPreparedOffer = (ready, withinFrame) =>
  run_loop($Work$prepared_offer$(ready, withinFrame));
export const bendWorkEmptyPrepared = (readyCount, hasNonSkipped, ticketed) =>
  run_loop($Work$empty_prepared$(nat(readyCount), hasNonSkipped, ticketed));
export const bendWorkEvaluatedDisposition = (hasFindings, currentWork) =>
  run_loop($Work$evaluated_disposition$(hasFindings, currentWork));
export const bendWorkFailureDisposition = (backendOrTimeout, credential, missing) =>
  run_loop($Work$failure_disposition$(backendOrTimeout, credential, missing));
export const bendWorkInitial = () => run_loop($Work$initial$());
export const bendWorkAdmit = (state) => run_loop($Work$admit$(state));
export const bendWorkStartSource = (state, observation) =>
  run_loop($Work$start_source$(state, nat(observation)));
export const bendWorkStartUnit = (state, unit) =>
  run_loop($Work$start_unit$(state, nat(unit)));
export const bendWorkSpawn = (state, observation, count) =>
  run_loop($Work$spawn$(state, nat(observation), nat(count)));
export const bendWorkCompleteSource = (state, observation) =>
  run_loop($Work$complete_source$(state, nat(observation)));
export const bendWorkCachedFinding = (state, observation, count, bytes) =>
  run_loop($Work$cached_finding$(state, nat(observation), nat(count), nat(bytes)));
export const bendWorkOutcome = (state, unit, outcome) =>
  run_loop($Work$outcome$(state, nat(unit), normalize(outcome)));
export const bendWorkInterruptObservation = (state, observation) =>
  run_loop($Work$interrupt_observation$(state, nat(observation)));
export const bendWorkInterruptUnit = (state, unit) =>
  run_loop($Work$interrupt_unit$(state, nat(unit)));
export const bendWorkRetire = (state, unit) =>
  run_loop($Work$retire$(state, nat(unit)));
export const bendWorkReviseFinding = (state, unit, count, bytes) =>
  run_loop($Work$revise_finding$(state, nat(unit), nat(count), nat(bytes)));
export const bendWorkUnfinished = (state) => run_loop($Work$unfinished$(state));
export const bendWorkPendingFindings = (state) => run_loop($Work$pending_findings$(state));
export const bendWorkPendingFor = (state, unit) =>
  run_loop($Work$pending_for$(state, nat(unit)));
export const bendWorkClose = (state) => run_loop($Work$close$(state));
export const bendWorkCancelUnfinished = (state) => run_loop($Work$cancel_unfinished$(state));
export const bendLeaseInitial = (item, round) =>
  run_loop($Handoff$lease$initial$(nat(item), nat(round)));
export const bendLeaseReserve = (state, round, token, surface) =>
  run_loop($Handoff$lease$reserve$(state, nat(round), nat(token), normalize(surface)));
export const bendLeaseOffer = (state, round, token, surface, fresh) =>
  run_loop($Handoff$lease$offer$(state, nat(round), nat(token), normalize(surface), fresh));
export const bendLeaseAuthorize = (state, round, token) =>
  run_loop($Handoff$lease$authorize$(state, nat(round), nat(token)));
export const bendLeaseRelease = (state, round, token) =>
  run_loop($Handoff$lease$release$(state, nat(round), nat(token)));
export const bendLeaseTerminal = (state, round, token, certain) =>
  run_loop($Handoff$lease$terminal$(state, nat(round), nat(token), certain));
export const bendLeaseReoffer = (state, round, token, fresh) =>
  run_loop($Handoff$lease$reoffer$(state, nat(round), nat(token), fresh));
export const bendLeaseClose = (state) => run_loop($Handoff$lease$close$(state));
export const bendLeaseSuppresses = (state, round, requested) =>
  run_loop($Handoff$lease$suppresses$(state, nat(round), normalize(requested)));
export const bendRoundInitial = () => run_loop($Round$initial$());
export const bendRoundMaxContinuations = () => run_loop($Round$max_continuations$());
export const bendRoundActive = (state, generation) =>
  run_loop($Round$active$(state, nat(generation)));
export const bendRoundBudget = (state) => run_loop($Round$budget$(state));
export const bendRoundBeginStop = (state, token) =>
  run_loop($Round$begin_stop$(state, nat(token)));
export const bendRoundOwnsStop = (state, token) =>
  run_loop($Round$owns_stop$(state, nat(token)));
export const bendRoundBeginDecision = (state, token) =>
  run_loop($Round$begin_decision$(state, nat(token)));
export const bendRoundConsume = (state) => run_loop($Round$consume$(state));
export const bendRoundReserveOutput = (state, token) =>
  run_loop($Round$reserve_output$(state, nat(token)));
export const bendRoundReleaseOutput = (state, token) =>
  run_loop($Round$release_output$(state, nat(token)));
export const bendRoundFinishStop = (state, token, close, at) =>
  run_loop($Round$finish_stop$(state, nat(token), close, nat(at)));
export const bendRoundStopTerminal = (hasOutput, authorized, requestedClose) =>
  run_loop($Round$stop_terminal$(hasOutput, authorized, requestedClose));
export const bendRoundExpireClose = (barrier) =>
  run_loop($Round$expire_close$(barrier));
export const bendRoundReopen = (state, generation) =>
  run_loop($Round$reopen$(state, nat(generation)));
export const bendBackgroundInitial = () => run_loop($Background$initial$());
export const bendBackgroundClaim = (state, token, active, used, capacity) =>
  run_loop($Background$claim$(state, nat(token), active, nat(used), nat(capacity)));
export const bendBackgroundRelease = (state, token) =>
  run_loop($Background$release$(state, nat(token)));
export const bendBackgroundExpire = (state, elapsed, lifetime) =>
  run_loop($Background$expire$(state, nat(elapsed), nat(lifetime)));
export const bendNoticeDecide = (remaining, count, maximum) =>
  run_loop($Notice$decide$(normalize(remaining), nat(count), nat(maximum)));
export const bendNoticeAdvance = (remaining, count, maximum, suppressed, pending, leased) =>
  run_loop($Notice$advance$(normalize(remaining), nat(count), nat(maximum),
    nat(suppressed), normalize(pending), leased, MAX_NAT));
export const bendNoticePrune = (hasPending, leased, leaseExpired,
  pendingExpired, excepted, cooldownExpired) =>
  run_loop($Notice$prune$(hasPending, leased, leaseExpired,
    pendingExpired, excepted, cooldownExpired));
export const bendCollectionOrder = (leftCycle, leftSequence, rightCycle, rightSequence) =>
  run_loop($Collection$order$(nat(leftCycle), nat(leftSequence), nat(rightCycle), nat(rightSequence)));
export const bendCollectionCredentialDisposition = (sameScope, generationValid) =>
  run_loop($Collection$credential_disposition$(sameScope, generationValid));
export const bendCollectionEligible = (already, turnEnd, cycleComplete, elapsed, window) =>
  run_loop($Collection$eligible$(already, turnEnd, cycleComplete, nat(elapsed), nat(window)));
export const bendCollectionExpired = (elapsed, lifetime) =>
  run_loop($Collection$expired$(nat(elapsed), nat(lifetime)));
export const bendDeliveryTransition = (current, requested) =>
  run_loop($Delivery$transition$(normalize(current), normalize(requested)));
export const bendDeliveryExpired = (phase, elapsed, lifetime) =>
  run_loop($Delivery$expired$(normalize(phase), nat(elapsed), nat(lifetime)));
export const bendDeliveryBackgroundReofferable = (phase, surface) =>
  run_loop($Delivery$background_reofferable$(normalize(phase), normalize(surface)));
export const bendDeliverySubmissionAllowed = (round, surface, existingToken, finishPermit) =>
  run_loop($Delivery$submission_allowed$(normalize(round), normalize(surface), existingToken, finishPermit));
export const bendDeliveryExistingTokenAllowed = (surface, existingToken, finishPermit) =>
  run_loop($Delivery$existing_token_allowed$(normalize(surface), existingToken, finishPermit));
export const bendDeliveryUnreservedStopAllowed = (round) =>
  run_loop($Delivery$unreserved_stop_allowed$(normalize(round)));
export const bendDeliveryAcknowledge = (items, anyExpired) =>
  run_loop($Delivery$acknowledge$(nat(items), anyExpired));
export const bendDeliveryFinalize = (items, allAcknowledged, anyExpired) =>
  run_loop($Delivery$finalize$(nat(items), allAcknowledged, anyExpired));
export const bendDeliveryFindingDisposition = (composed, remaining) =>
  run_loop($Delivery$finding_disposition$(composed, nat(remaining)));
export const bendDeliveryReleaseUnacknowledged = (acknowledged) =>
  run_loop($Delivery$release_unacknowledged$(acknowledged));
export const bendDeliverySubmissionCandidate = (facts) =>
  run_loop($Delivery$submission_candidate$(normalize(facts)));
export const bendDeliverySubmissionBatchGate = (count, allValid) =>
  run_loop($Delivery$submission_batch_gate$(nat(count), allValid));
export const bendDeliveryCredentialObserve = (invalidSeen, generationValid, authorized) =>
  run_loop($Delivery$credential_observe$(invalidSeen, generationValid, authorized));
export const bendDeliveryFinalCredentialGate = (sharedCollect, invalidSeen) =>
  run_loop($Delivery$final_credential_gate$(sharedCollect, invalidSeen));
export const bendDeliveryCollectionLease = (hasLease, expired, stopCollector, sameGroup, reofferable) =>
  run_loop($Delivery$collection_lease$(hasLease, expired, stopCollector, sameGroup, reofferable));
export const bendDeliveryAdviceCandidate = (samePartition, unleased, hasUnsuppressed, ticketOwns) =>
  run_loop($Delivery$advice_candidate$(samePartition, unleased, hasUnsuppressed, ticketOwns));
export const bendDeliveryNoticeCandidate = (samePartition, hasPending, unleased, ticketOwns) =>
  run_loop($Delivery$notice_candidate$(samePartition, hasPending, unleased, ticketOwns));
export const bendDeliveryReserveCandidate = (unleased) =>
  run_loop($Delivery$reserve_candidate$(unleased));
export const bendReuseRoute = (liveAdvice, attachedPending, claimedPending) =>
  run_loop($Reuse$route$(liveAdvice, attachedPending, claimedPending));
export const bendReuseCacheRoute = (hit) =>
  run_loop($Reuse$cache_route$(hit));
export const bendCacheAdmit = (existing, incomingBytes, byteLimit) =>
  run_loop($Cache$admit$(existing, nat(incomingBytes), nat(byteLimit)));
export const bendCacheEvict = (entries, currentBytes, incomingBytes, entryLimit, byteLimit) =>
  run_loop($Cache$evict$(nat(entries), nat(currentBytes), nat(incomingBytes),
    nat(entryLimit), nat(byteLimit)));
export const bendLifecycleCutoff = (round, work, token) =>
  run_loop($Lifecycle$cutoff$(round, work, nat(token)));
export const bendLifecycleFinishGate = (round, work, token, extraUnfinished, deadlineReached) =>
  run_loop($Lifecycle$finish_gate$(round, work, nat(token), nat(extraUnfinished), deadlineReached));
export const bendLifecycleFinishDisposition = (work, selected, hasNotice,
  passNotices, canWrite, bindingValid, deadlineReached) =>
  run_loop($Lifecycle$finish_disposition$(work,
    selected.reduceRight((tail, value) => ({ $: "Con", head: nat(value), tail }), { $: "Nil" }),
    hasNotice, passNotices, canWrite, bindingValid, deadlineReached));
export const bendLifecycleFinishOutput = (round, work, token, selected,
  hasNotice, passNotices, canWrite, bindingValid, deadlineReached) =>
  run_loop($Lifecycle$finish_output$(normalize(round), work, nat(token),
    selected.reduceRight((tail, value) => ({ $: "Con", head: nat(value), tail }), { $: "Nil" }),
    hasNotice, passNotices, canWrite, bindingValid, deadlineReached));
export const bendLifecycleSelectionReserve = (work, selected) =>
  run_loop($Lifecycle$selection_reserve$(work,
    selected.reduceRight((tail, value) => ({ $: "Con", head: nat(value), tail }), { $: "Nil" })));
export const bendLifecycleSelectionAuthorize = (state) =>
  run_loop($Lifecycle$selection_authorize$(normalize(state)));
export const bendLifecycleSelectionConsume = (state, selected) =>
  run_loop($Lifecycle$selection_consume$(normalize(state),
    selected.reduceRight((tail, value) => ({ $: "Con", head: nat(value), tail }), { $: "Nil" })));
export const bendLifecycleReserveSelected = (round, work, token, selected) =>
  run_loop($Lifecycle$reserve_selected$(round, work, nat(token),
    selected.reduceRight((tail, value) => ({ $: "Con", head: nat(value), tail }), { $: "Nil" })));
export const bendLifecycleReleaseUnwritten = (round, token) =>
  run_loop($Lifecycle$release_unwritten$(round, nat(token)));
export const bendTicketCollectGate = (expired, credentialValid) =>
  run_loop($Ticket$collect_gate$(expired, credentialValid));
export const bendTicketFinalAuthority = (admittedBlock, currentBlock) =>
  run_loop($Ticket$final_authority$(admittedBlock, currentBlock));
export const bendTicketJoinedDisposition = (state, staleUnavailable,
  hasRevision, hasAdviceId) =>
  run_loop($Ticket$joined_disposition$(normalize(state), staleUnavailable,
    hasRevision, hasAdviceId));
export const bendTicketUnitStep = (stage, event) =>
  run_loop($Ticket$unit$step$(normalize(stage), normalize(event)));
export const bendTicketUnitInitial = () => run_loop($Ticket$unit$initial$());
export const bendRevisionRegister = (hasCurrent, sameInput) =>
  run_loop($Revision$register$(hasCurrent, sameInput));
export const bendRevisionSuperseded = (candidateSubject, targetSubject,
  candidateGeneration, currentGeneration) =>
  run_loop($Revision$superseded$(nat(candidateSubject), nat(targetSubject),
    nat(candidateGeneration), nat(currentGeneration)));
export const bendCleanupGate = (facts) =>
  run_loop($Retention$cleanup_gate$(normalize(facts)));
export const bendCleanupCommit = (ledgerEmpty) =>
  run_loop($Retention$cleanup_commit$(ledgerEmpty));
export const bendTicketRetention = (count, limit, hasOldest) =>
  run_loop($Retention$ticket_retention$(nat(count), nat(limit), hasOldest));
export const bendDiscardScope = (namedCount, cancelledCount, hasUnnamed) =>
  run_loop($Retention$discard_scope$(nat(namedCount), nat(cancelledCount), hasUnnamed));
