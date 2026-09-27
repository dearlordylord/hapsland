// hapsland-bend-source-sha256:ac3e2223a7f8cc17833f51cf64b4142fcd060c8429b3adb4d5a7bf7ddb052e53
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
  return {$: "Smoke", ["admission"]: run_loop($Admission$step$(run_loop($Admission$initial$(1n, 1n)), 1n, 1n, {$: "Issue", ["tool"]: 1n, ["started"]: 1n, ["deadline"]: 2n, ["now"]: 1n})), ["prospective_gate"]: run_loop($Admission$prospective_gate$({$: "ProspectiveFacts", ["clock_valid"]: true, ["within_hook_window"]: true, ["started_after_closure"]: true, ["duplicate_event"]: false, ["permit_count"]: 0n, ["permit_limit"]: BigInt(1024), ["round_count"]: 0n, ["round_limit"]: 64n, ["new_round"]: true, ["event_count"]: 0n, ["event_limit"]: BigInt(4096)})), ["prospective_close"]: run_loop($Admission$close_prospective$({$: "AdmissionState", ["partition"]: 1n, ["lifetime"]: 1n, ["round"]: 0n, ["active"]: false, ["closed_at"]: 0n, ["next_token"]: 2n, ["permits"]: {$: "Con", ["head"]: {$: "Permit", ["token"]: 1n, ["tool"]: 1n, ["round"]: 1n, ["started"]: 1n, ["deadline"]: 2n}, ["tail"]: {$: "Nil"}}, ["used"]: {$: "Nil"}}, 3n)), ["expired_permit"]: run_loop($Admission$expire$(run_loop($Admission$initial$(1n, 1n)), 1n, true)), ["callback"]: run_loop($Admission$callback_current$(run_loop($Admission$initial$(1n, 1n)), 1n, 1n, 0n)), ["admitted"]: run_loop($Work$admit$(run_loop($Work$initial$()))), ["started_source"]: run_loop($Work$start_source$(run_loop($sample_work$()), 1n)), ["started_unit"]: run_loop($Work$start_unit$(run_loop($sample_unit_work$()), 1n)), ["spawned"]: run_loop($Work$spawn$(run_loop($sample_work$()), 1n, 1n)), ["prepared"]: run_loop($Work$prepare$(run_loop($sample_work$()), 1n, 2n)), ["source_completed"]: run_loop($Work$complete_source$(run_loop($sample_work$()), 1n)), ["cached_finding"]: run_loop($Work$cached_finding$(run_loop($sample_work$()), 1n, 1n, 20n)), ["revised_finding"]: run_loop($Work$revise_finding$({$: "Work", ["next_observation"]: 2n, ["next_unit"]: 2n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Nil"}, ["units"]: {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: 1n, ["observation"]: 1n, ["stage"]: {$: "PendingFinding"}, ["findings"]: 1n, ["bytes"]: 20n}, ["tail"]: {$: "Nil"}}}, 1n, 1n, 10n)), ["outcome"]: run_loop($Work$outcome$(run_loop($sample_unit_work$()), 1n, {$: "Clear"})), ["interrupted_source"]: run_loop($Work$interrupt_observation$(run_loop($sample_work$()), 1n)), ["interrupted_unit"]: run_loop($Work$interrupt_unit$(run_loop($sample_unit_work$()), 1n)), ["retired"]: run_loop($Work$retire$({$: "Work", ["next_observation"]: 2n, ["next_unit"]: 2n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Nil"}, ["units"]: {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: 1n, ["observation"]: 1n, ["stage"]: {$: "ClearResult"}, ["findings"]: 0n, ["bytes"]: 0n}, ["tail"]: {$: "Nil"}}}, 1n)), ["unfinished"]: run_loop($Work$unfinished$(run_loop($sample_unit_work$()))), ["pending_findings"]: run_loop($Work$pending_findings$(run_loop($sample_unit_work$()))), ["pending_for"]: run_loop($Work$pending_for$(run_loop($sample_unit_work$()), 1n)), ["closed_work"]: run_loop($Work$close$(run_loop($sample_work$()))), ["cancelled_work"]: run_loop($Work$cancel_unfinished$(run_loop($sample_work$()))), ["finish_wait"]: run_loop($Work$finish_wait$(1n, false, true)), ["prepared_offer"]: run_loop($Work$prepared_offer$(true, true)), ["empty_prepared"]: run_loop($Work$empty_prepared$(0n, true, true)), ["evaluated_disposition"]: run_loop($Work$evaluated_disposition$(true, true)), ["failure_disposition"]: run_loop($Work$failure_disposition$(false, true, false)), ["source_capacity"]: run_loop($Work$set_source_capacity$(run_loop($sample_work$()), {$: "Capacity", ["low"]: 2n, ["high"]: 0n})), ["review_capacity"]: run_loop($Work$set_review_capacity$(run_loop($sample_unit_work$()), {$: "Capacity", ["low"]: 2n, ["high"]: 0n})), ["selection"]: run_loop($Handoff$select$(run_loop($Handoff$initial$(1n, 1n)), {$: "Advice", ["id"]: 1n, ["unit"]: 1n, ["partition"]: 1n, ["round"]: 1n, ["snapshot"]: 1n, ["current_snapshot"]: 1n, ["credential"]: 1n, ["current_credential"]: 1n, ["age_ms"]: 0n, ["solo_bytes"]: 100n, ["collection_ready"]: true}, 100n)), ["fit"]: run_loop($Handoff$fits_batch$(1n, 100n)), ["notice_offer"]: run_loop($Handoff$notice_offer$(6n, 100n, true)), ["notice_prune"]: run_loop($Notice$prune$(true, true, true, false, false, false)), ["validation_route"]: run_loop($Handoff$validation_route$(true, {$: "Current"})), ["post_validation"]: run_loop($Handoff$post_validation$(true, false, true)), ["final_candidate"]: run_loop($Handoff$final_candidate$(true, true, true, false, true, true)), ["finish"]: run_loop($Handoff$finish$decide$(run_loop($Handoff$finish$initial$(1n)), 0n, false, 1n)), ["lease_reserve"]: run_loop($Handoff$lease$reserve$(run_loop($Handoff$lease$initial$(1n, 1n)), 1n, 1n, {$: "Background"})), ["lease_authorize"]: run_loop($Handoff$lease$authorize$(run_loop($sample_reserved_lease$()), 1n, 1n)), ["lease_release"]: run_loop($Handoff$lease$release$(run_loop($sample_reserved_lease$()), 1n, 1n)), ["lease_terminal"]: run_loop($Handoff$lease$terminal$(run_loop($sample_authorized_lease$()), 1n, 1n, false)), ["lease_reoffer"]: run_loop($Handoff$lease$reoffer$(run_loop($sample_uncertain_lease$()), 1n, 2n, true)), ["lease_offer"]: run_loop($Handoff$lease$offer$(run_loop($sample_uncertain_lease$()), 1n, 2n, {$: "Stop"}, true)), ["closed_lease"]: run_loop($Handoff$lease$close$(run_loop($Handoff$lease$initial$(1n, 1n)))), ["lease_suppresses"]: run_loop($Handoff$lease$suppresses$(run_loop($sample_uncertain_lease$()), 1n, {$: "Edit"})), ["round_begin"]: run_loop($Round$begin_stop$(run_loop($Round$initial$()), 1n)), ["round_active"]: run_loop($Round$active$(run_loop($Round$initial$()), 1n)), ["round_budget"]: run_loop($Round$budget$(run_loop($Round$initial$()))), ["round_max"]: run_loop($Round$max_continuations$()), ["round_owns"]: run_loop($Round$owns_stop$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}, 1n)), ["round_decision"]: run_loop($Round$begin_decision$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}, 1n)), ["round_consume"]: run_loop($Round$consume$(run_loop($Round$initial$()))), ["round_reserve"]: run_loop($Round$reserve_output$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: true, ["output_reserved"]: false}, 1n)), ["round_finish"]: run_loop($Round$finish_stop$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}, 1n, true, 2n)), ["round_stop_terminal"]: run_loop($Round$stop_terminal$(true, false, false)), ["round_expire_close"]: run_loop($Round$expire_close$(false)), ["round_reopen"]: run_loop($Round$reopen$({$: "Round", ["generation"]: 1n, ["active"]: false, ["closed_at"]: 2n, ["continuations"]: 0n, ["stop_token"]: 0n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}, 2n)), ["background_claim"]: run_loop($Background$claim$(run_loop($Background$initial$()), 1n, true, 0n, 64n)), ["background_release"]: run_loop($Background$release$({$: "Waiter", ["owner"]: 1n}, 1n)), ["background_expire"]: run_loop($Background$expire$({$: "Waiter", ["owner"]: 1n}, BigInt(20001), BigInt(20000))), ["notice"]: run_loop($Notice$decide$({$: "Some", ["value"]: 10n}, 1n, 64n)), ["notice_advance"]: run_loop($Notice$advance$({$: "Some", ["value"]: 0n}, 1n, 64n, 3n, {$: "Some", ["value"]: 2n}, false, 5n)), ["collection_order"]: run_loop($Collection$order$(1n, 2n, 1n, 3n)), ["collection_eligible"]: run_loop($Collection$eligible$(false, false, false, 50n, 50n)), ["collection_expired"]: run_loop($Collection$expired$(BigInt(600000), BigInt(600000))), ["delivery_transition"]: run_loop($Delivery$transition$({$: "Authorized"}, {$: "Uncertain"})), ["delivery_expired"]: run_loop($Delivery$expired$({$: "Authorized"}, BigInt(1000), BigInt(1000))), ["background_reofferable"]: run_loop($Delivery$background_reofferable$({$: "Uncertain"}, {$: "Background"})), ["submission_allowed"]: run_loop($Delivery$submission_allowed$(run_loop($Round$initial$()), {$: "Edit"}, false, false)), ["existing_token_allowed"]: run_loop($Delivery$existing_token_allowed$({$: "Edit"}, false, false)), ["legacy_stop_allowed"]: run_loop($Delivery$legacy_stop_allowed$(run_loop($Round$initial$()))), ["delivery_ack"]: run_loop($Delivery$acknowledge$(1n, false)), ["delivery_final"]: run_loop($Delivery$finalize$(1n, true, false)), ["delivery_finding"]: run_loop($Delivery$finding_disposition$(false, 0n)), ["delivery_release"]: run_loop($Delivery$release_unacknowledged$(false)), ["submission_candidate"]: run_loop($Delivery$submission_candidate$({$: "SubmissionFacts", ["round_active"]: true, ["has_round"]: true, ["has_unit"]: true, ["has_delivery"]: true, ["pending_capacity"]: true, ["submission_allowed"]: true, ["current_work"]: true, ["credential_authorized"]: true})), ["submission_batch_gate"]: run_loop($Delivery$submission_batch_gate$(1n, true)), ["credential_observe"]: run_loop($Delivery$credential_observe$(false, true, true)), ["final_credential_gate"]: run_loop($Delivery$final_credential_gate$(true, false)), ["collection_lease"]: run_loop($Delivery$collection_lease$(true, false, true, true, true)), ["advice_candidate"]: run_loop($Delivery$advice_candidate$(true, true, true, true)), ["notice_candidate"]: run_loop($Delivery$notice_candidate$(true, true, true, true)), ["reserve_candidate"]: run_loop($Delivery$reserve_candidate$(true)), ["reuse_route"]: run_loop($Reuse$route$(false, false, false)), ["reuse_cache_route"]: run_loop($Reuse$cache_route$(false)), ["cache_admission"]: run_loop($Cache$admit$(false, 10n, 100n)), ["cache_evict"]: run_loop($Cache$evict$(8n, 100n, 20n, 8n, BigInt(128000))), ["lifecycle_cutoff"]: run_loop($Lifecycle$cutoff$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}, run_loop($sample_work$()), 1n)), ["lifecycle_finish_gate"]: run_loop($Lifecycle$finish_gate$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}, run_loop($sample_work$()), 1n, 0n, false)), ["lifecycle_reserve"]: run_loop($Lifecycle$reserve_selected$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: true, ["output_reserved"]: false}, {$: "Work", ["next_observation"]: 2n, ["next_unit"]: 2n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Nil"}, ["units"]: {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: 1n, ["observation"]: 1n, ["stage"]: {$: "PendingFinding"}, ["findings"]: 1n, ["bytes"]: 20n}, ["tail"]: {$: "Nil"}}}, 1n, {$: "Con", ["head"]: 1n, ["tail"]: {$: "Nil"}})), ["lifecycle_release"]: run_loop($Lifecycle$release_unwritten$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 1n, ["stop_token"]: 1n, ["barrier"]: true, ["deciding"]: true, ["output_reserved"]: true}, 1n)), ["finish_disposition"]: run_loop($Lifecycle$finish_disposition$(run_loop($sample_work$()), {$: "Nil"}, true, true, true, true, false)), ["finish_output"]: run_loop($Lifecycle$finish_output$({$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 1n, ["barrier"]: false, ["deciding"]: true, ["output_reserved"]: false}, run_loop($sample_work$()), 1n, {$: "Nil"}, true, true, true, true, false)), ["selection_reserved"]: run_loop($Lifecycle$selection_reserve$({$: "Work", ["next_observation"]: 2n, ["next_unit"]: 2n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Nil"}, ["units"]: {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: 1n, ["observation"]: 1n, ["stage"]: {$: "PendingFinding"}, ["findings"]: 1n, ["bytes"]: 20n}, ["tail"]: {$: "Nil"}}}, {$: "Con", ["head"]: 1n, ["tail"]: {$: "Nil"}})), ["selection_authorized"]: run_loop($Lifecycle$selection_authorize$({$: "OutputSelection", ["selected"]: {$: "Con", ["head"]: 1n, ["tail"]: {$: "Nil"}}, ["authorized"]: false, ["consumed"]: false})), ["selection_consumed"]: run_loop($Lifecycle$selection_consume$({$: "OutputSelection", ["selected"]: {$: "Con", ["head"]: 1n, ["tail"]: {$: "Nil"}}, ["authorized"]: true, ["consumed"]: false}, {$: "Con", ["head"]: 1n, ["tail"]: {$: "Nil"}})), ["ticket_initial"]: run_loop($Ticket$initial$()), ["ticket_fail"]: run_loop($Ticket$fail$(run_loop($Ticket$initial$()), {$: "Backend"})), ["ticket_close"]: run_loop($Ticket$close$(run_loop($Ticket$fail$(run_loop($Ticket$initial$()), {$: "Backend"})))), ["ticket_terminal"]: run_loop($Ticket$terminal$({$: "Closed"}, {$: "Facts", ["expired"]: false, ["credential_valid"]: true, ["pending_units"]: 0n, ["live_advice"]: false, ["pending_notice"]: false, ["unit_failure"]: {$: "None"}, ["finding_units"]: 0n, ["undelivered_findings"]: 0n, ["total_units"]: 1n})), ["ticket_collect_gate"]: run_loop($Ticket$collect_gate$(false, true)), ["ticket_final_authority"]: run_loop($Ticket$final_authority$(true, true)), ["ticket_joined_disposition"]: run_loop($Ticket$joined_disposition$({$: "JoinedFinding"}, false, true, true)), ["ticket_unit"]: run_loop($Ticket$unit$step$({$: "UnitFinding", ["delivered"]: false}, {$: "MarkDelivered"})), ["ticket_unit_initial"]: run_loop($Ticket$unit$initial$()), ["revision_register"]: run_loop($Revision$register$(true, false)), ["revision_superseded"]: run_loop($Revision$superseded$(1n, 1n, 1n, 2n)), ["cleanup_gate"]: run_loop($Retention$cleanup_gate$({$: "CleanupFacts", ["active"]: true, ["dispatcher_idle"]: true, ["no_advice"]: true, ["no_notices"]: true, ["no_pending_evaluations"]: true, ["no_current_work"]: true, ["no_cooldowns"]: true, ["connection_count_ok"]: true, ["cache_matches_ledger"]: true})), ["cleanup_commit"]: run_loop($Retention$cleanup_commit$(true)), ["ticket_retention"]: run_loop($Retention$ticket_retention$(2n, 1n, true)), ["discard_scope"]: run_loop($Retention$discard_scope$(2n, 2n, false))};
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

function $Admission$initial$(partition_0, lifetime_0) {
  return {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: 0n, ["active"]: false, ["closed_at"]: 0n, ["next_token"]: 1n, ["permits"]: {$: "Nil"}, ["used"]: {$: "Nil"}};
}

function $Admission$prospective_gate$(facts_0) {
  const clock_valid_0 = facts_0.clock_valid;
  const within_hook_window_0 = facts_0.within_hook_window;
  const started_after_closure_0 = facts_0.started_after_closure;
  const duplicate_event_0 = facts_0.duplicate_event;
  const permit_count_0 = facts_0.permit_count;
  const permit_limit_0 = facts_0.permit_limit;
  const round_count_0 = facts_0.round_count;
  const round_limit_0 = facts_0.round_limit;
  const new_round_0 = facts_0.new_round;
  const event_count_0 = facts_0.event_count;
  const event_limit_0 = facts_0.event_limit;
  const x_0 = run_loop($Bool$not$(new_round_0));
  const x_1 = (round_count_0 < round_limit_0);
  return run_jump($Bool$pick$, [run_loop($Bool$and$(clock_valid_0, run_loop($Bool$and$(within_hook_window_0, run_loop($Bool$and$(started_after_closure_0, run_loop($Bool$and$(run_loop($Bool$not$(duplicate_event_0)), run_loop($Bool$and$((permit_count_0 < permit_limit_0), run_loop($Bool$and$((x_0 || x_1), (event_count_0 < event_limit_0))))))))))))), {$: "PermitAllowed"}, {$: "PermitDenied"}]);
}

function $Admission$close_prospective$(state_0, at_0) {
  const partition_0 = state_0.partition;
  const lifetime_0 = state_0.lifetime;
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const next_token_0 = state_0.next_token;
  const permits_0 = state_0.permits;
  const used_0 = state_0.used;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Bool$not$(active_0)), run_loop($Bool$and$(run_loop($Nat$is_ge$(at_0, closed_at_0)), run_loop($Nat$is_gt$(run_loop($List$length$(permits_0)), 0n)))))), {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: nat_chk(round_0 + 1n), ["active"]: false, ["closed_at"]: at_0, ["next_token"]: next_token_0, ["permits"]: {$: "Nil"}, ["used"]: used_0}, ["token"]: {$: "None"}, ["round"]: {$: "Some", ["value"]: nat_chk(round_0 + 1n)}}, {$: "Rejected", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: permits_0, ["used"]: used_0}, ["reason"]: {$: "RoundAlreadyClosed"}}]);
}

function $Admission$expire$(state_0, token_0, deadline_reached_0) {
  if (!deadline_reached_0) {
    return {$: "KeepPermit", ["state"]: state_0};
  } else {
    return run_jump($Admission$expire$due$, [state_0, token_0]);
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

function $Work$admit$(work_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: nat_chk(next_observation_0 + 1n), ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: run_loop($List$append$(observations_0, {$: "Con", ["head"]: {$: "Observation", ["id"]: next_observation_0, ["stage"]: {$: "SourceQueued"}}, ["tail"]: {$: "Nil"}})), ["units"]: units_0})), ["admitted"]: {$: "Con", ["head"]: next_observation_0, ["tail"]: {$: "Nil"}}};
}

function $Work$initial$() {
  return {$: "Work", ["next_observation"]: 1n, ["next_unit"]: 1n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Nil"}, ["units"]: {$: "Nil"}};
}

function $Work$start_source$(work_0, id_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const __4 = work_0.units;
  return run_jump($Work$start_source$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: observations_0, ["units"]: __4}, id_0, run_loop($Work$find_observation$(id_0, observations_0))]);
}

function $sample_work$() {
  return {$: "Work", ["next_observation"]: 2n, ["next_unit"]: 1n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Con", ["head"]: {$: "Observation", ["id"]: 1n, ["stage"]: {$: "SourceReading"}}, ["tail"]: {$: "Nil"}}, ["units"]: {$: "Nil"}};
}

function $Work$start_unit$(work_0, id_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$start_unit$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: __4, ["units"]: units_0}, id_0, run_loop($Work$find_unit$(id_0, units_0))]);
}

function $sample_unit_work$() {
  return {$: "Work", ["next_observation"]: 2n, ["next_unit"]: 2n, ["source_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["review_capacity"]: {$: "Capacity", ["low"]: 3n, ["high"]: 0n}, ["observations"]: {$: "Nil"}, ["units"]: {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: 1n, ["observation"]: 1n, ["stage"]: {$: "AtJev"}, ["findings"]: 0n, ["bytes"]: 0n}, ["tail"]: {$: "Nil"}}};
}

function $Work$spawn$(work_0, observation_0, count_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const __4 = work_0.units;
  return run_jump($Work$spawn$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: observations_0, ["units"]: __4}, observation_0, count_0, run_loop($Work$find_observation$(observation_0, observations_0))]);
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

function $Work$complete_source$(work_0, id_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const __4 = work_0.units;
  return run_jump($Work$complete_source$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: observations_0, ["units"]: __4}, id_0, run_loop($Work$find_observation$(id_0, observations_0))]);
}

function $Work$cached_finding$(work_0, observation_0, count_0, bytes_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const __4 = work_0.units;
  return run_jump($Work$cached_finding$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: observations_0, ["units"]: __4}, observation_0, count_0, bytes_0, run_loop($Work$find_observation$(observation_0, observations_0))]);
}

function $Work$revise_finding$(work_0, id_0, count_0, bytes_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$revise_finding$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: __4, ["units"]: units_0}, id_0, count_0, bytes_0, run_loop($Work$find_unit$(id_0, units_0))]);
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

function $Work$retire$(work_0, id_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$retire$found$, [{$: "Work", ["next_observation"]: __0, ["next_unit"]: __1, ["source_capacity"]: __2, ["review_capacity"]: __3, ["observations"]: __4, ["units"]: units_0}, id_0, run_loop($Work$find_unit$(id_0, units_0))]);
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

function $Work$pending_findings$(work_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$pending_findings_in$, [units_0]);
}

function $Work$pending_for$(work_0, id_0) {
  const __0 = work_0.next_observation;
  const __1 = work_0.next_unit;
  const __2 = work_0.source_capacity;
  const __3 = work_0.review_capacity;
  const __4 = work_0.observations;
  const units_0 = work_0.units;
  return run_jump($Work$pending_for$found$, [run_loop($Work$find_unit$(id_0, units_0))]);
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

function $Work$cancel_unfinished$(work_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Cancelled", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: {$: "Nil"}, ["units"]: run_loop($Work$keep_terminal$(units_0))}, ["cancelled_source"]: run_loop($Work$observation_ids$(observations_0)), ["cancelled_jev"]: run_loop($Work$unfinished_unit_ids$(units_0))};
}

function $Work$finish_wait$(unfinished_0, deadline_reached_0, continuation_budget_0) {
  return run_jump($Bool$and$, [continuation_budget_0, run_loop($Bool$and$(run_loop($Bool$not$(deadline_reached_0)), run_loop($Nat$is_gt$(unfinished_0, 0n))))]);
}

function $Work$prepared_offer$(ready_0, within_frame_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$not$(ready_0)), {$: "SkipPrepared"}, run_loop($Bool$pick$(within_frame_0, {$: "AdmitPrepared"}, {$: "RejectPreparedCapacity"}))]);
}

function $Work$empty_prepared$(ready_count_0, has_non_skipped_0, ticketed_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_eq$(ready_count_0, 0n)), run_loop($Bool$and$(has_non_skipped_0, ticketed_0)))), {$: "FailEmptyLost"}, {$: "NoEmptyFailure"}]);
}

function $Work$evaluated_disposition$(has_findings_0, current_work_0) {
  return run_jump($Bool$pick$, [has_findings_0, run_loop($Bool$pick$(current_work_0, {$: "RetainFinding"}, {$: "RetireStaleFinding"})), run_loop($Bool$pick$(current_work_0, {$: "SettleClear"}, {$: "SettleStaleClear"}))]);
}

function $Work$failure_disposition$(backend_or_timeout_0, credential_0, missing_0) {
  return run_jump($Bool$pick$, [backend_or_timeout_0, {$: "BackendUnavailable"}, run_loop($Bool$pick$(credential_0, {$: "CredentialUnavailable"}, run_loop($Bool$pick$(missing_0, {$: "LostUnavailable"}, {$: "NoFailure"}))))]);
}

function $Work$set_source_capacity$(work_0, capacity_0) {
  return run_jump($Work$set_source_capacity$apply$, [work_0, capacity_0, run_loop($Flow$capacity_valid$(capacity_0))]);
}

function $Work$set_review_capacity$(work_0, capacity_0) {
  return run_jump($Work$set_review_capacity$apply$, [work_0, capacity_0, run_loop($Flow$capacity_valid$(capacity_0))]);
}

function $Handoff$select$(state_0, advice_0, prospective_bytes_0) {
  const partition_0 = state_0.partition;
  const round_0 = state_0.round;
  const selected_0 = state_0.selected;
  const retained_0 = state_0.retained;
  const __0 = state_0.findings;
  const __1 = state_0.bytes;
  const id_0 = advice_0.id;
  const __2 = advice_0.unit;
  const __3 = advice_0.partition;
  const __4 = advice_0.round;
  const __5 = advice_0.snapshot;
  const __6 = advice_0.current_snapshot;
  const __7 = advice_0.credential;
  const __8 = advice_0.current_credential;
  const __9 = advice_0.age_ms;
  const __10 = advice_0.solo_bytes;
  const __11 = advice_0.collection_ready;
  const x_0 = run_loop($Handoff$contains$(id_0, selected_0));
  const x_1 = run_loop($Handoff$contains$(id_0, retained_0));
  return run_jump($Handoff$select$duplicate$, [{$: "Selection", ["partition"]: partition_0, ["round"]: round_0, ["selected"]: selected_0, ["retained"]: retained_0, ["findings"]: __0, ["bytes"]: __1}, {$: "Advice", ["id"]: id_0, ["unit"]: __2, ["partition"]: __3, ["round"]: __4, ["snapshot"]: __5, ["current_snapshot"]: __6, ["credential"]: __7, ["current_credential"]: __8, ["age_ms"]: __9, ["solo_bytes"]: __10, ["collection_ready"]: __11}, prospective_bytes_0, run_loop($Handoff$current$({$: "Advice", ["id"]: id_0, ["unit"]: __2, ["partition"]: __3, ["round"]: __4, ["snapshot"]: __5, ["current_snapshot"]: __6, ["credential"]: __7, ["current_credential"]: __8, ["age_ms"]: __9, ["solo_bytes"]: __10, ["collection_ready"]: __11}, partition_0, round_0)), (x_0 || x_1)]);
}

function $Handoff$initial$(partition_0, round_0) {
  return {$: "Selection", ["partition"]: partition_0, ["round"]: round_0, ["selected"]: {$: "Nil"}, ["retained"]: {$: "Nil"}, ["findings"]: 0n, ["bytes"]: 0n};
}

function $Handoff$fits_batch$(items_0, bytes_0) {
  return run_jump($Bool$and$, [run_loop($Nat$is_gt$(items_0, 0n)), run_loop($Bool$and$(run_loop($Nat$is_le$(items_0, 5n)), run_loop($Nat$is_le$(bytes_0, BigInt(2048)))))]);
}

function $Handoff$notice_offer$(items_0, bytes_0, skip_unfitting_0) {
  return run_jump($Bool$pick$, [run_loop($Handoff$fits_batch$(items_0, bytes_0)), {$: "IncludeNotice"}, run_loop($Bool$pick$(skip_unfitting_0, {$: "SkipNotice"}, {$: "StopNotices"}))]);
}

function $Notice$prune$(has_pending_0, leased_0, lease_expired_0, pending_expired_0, excepted_0, cooldown_expired_0) {
  const x_0 = run_loop($Bool$not$(has_pending_0));
  return {$: "Prune", ["drop_lease"]: run_loop($Bool$and$(has_pending_0, run_loop($Bool$and$(leased_0, lease_expired_0)))), ["drop_pending"]: run_loop($Bool$and$(has_pending_0, pending_expired_0)), ["drop_key"]: run_loop($Bool$and$(run_loop($Bool$not$(excepted_0)), run_loop($Bool$and$(cooldown_expired_0, (x_0 || pending_expired_0)))))};
}

function $Handoff$validation_route$(owner_current_0, status_0) {
  if (!owner_current_0) {
    return {$: "IgnoreCandidate"};
  } else {
    if (status_0.$ === "Current") {
      return {$: "ContinueCandidate"};
    } else if (status_0.$ === "Stale") {
      return {$: "RetireCandidate"};
    } else {
      return {$: "ReleaseCandidate"};
    }
  }
}

function $Handoff$post_validation$(work_accepted_0, expired_0, has_fitting_0) {
  const x_0 = run_loop($Bool$not$(work_accepted_0));
  return run_jump($Bool$pick$, [(x_0 || expired_0), {$: "RetireCandidate"}, run_loop($Bool$pick$(has_fitting_0, {$: "RetainCandidate"}, {$: "ReleaseCandidate"}))]);
}

function $Handoff$final_candidate$(owner_current_0, credential_generation_0, credential_authorized_0, expired_0, work_current_0, has_findings_0) {
  const x_0 = run_loop($Bool$not$(work_current_0));
  return run_jump($Bool$pick$, [run_loop($Bool$not$(owner_current_0)), {$: "IgnoreCandidate"}, run_loop($Bool$pick$(run_loop($Bool$not$(credential_generation_0)), {$: "RetireCandidate"}, run_loop($Bool$pick$(run_loop($Bool$not$(credential_authorized_0)), {$: "ReleaseCandidate"}, run_loop($Bool$pick$((expired_0 || x_0), {$: "RetireCandidate"}, run_loop($Bool$pick$(has_findings_0, {$: "RetainCandidate"}, {$: "ReleaseCandidate"}))))))))]);
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

function $Handoff$finish$initial$(round_0) {
  return {$: "Finish", ["round"]: round_0, ["active"]: true, ["closed"]: false, ["continuations"]: 0n, ["reserved"]: false, ["token"]: 0n, ["collector"]: 0n, ["deadline_at"]: 0n};
}

function $Handoff$lease$reserve$(state_0, round_0, token_0, surface_0) {
  const __0 = state_0.item;
  const own_round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const __1 = state_0.reoffered;
  const __2 = state_0.phase;
  return run_jump($Handoff$lease$reserve$guard$, [{$: "Lease", ["item"]: __0, ["round"]: own_round_0, ["closed"]: closed_0, ["reoffered"]: __1, ["phase"]: __2}, token_0, surface_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(own_round_0, round_0)), run_loop($Bool$not$(closed_0))))]);
}

function $Handoff$lease$initial$(item_0, round_0) {
  return {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: false, ["reoffered"]: false, ["phase"]: {$: "Available"}};
}

function $Handoff$lease$authorize$(state_0, round_0, token_0) {
  const __0 = state_0.item;
  const own_round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const __1 = state_0.reoffered;
  const __2 = state_0.phase;
  return run_jump($Handoff$lease$authorize$guard$, [{$: "Lease", ["item"]: __0, ["round"]: own_round_0, ["closed"]: closed_0, ["reoffered"]: __1, ["phase"]: __2}, token_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(own_round_0, round_0)), run_loop($Bool$not$(closed_0))))]);
}

function $sample_reserved_lease$() {
  return {$: "Lease", ["item"]: 1n, ["round"]: 1n, ["closed"]: false, ["reoffered"]: false, ["phase"]: {$: "Reserved", ["token"]: 1n, ["surface"]: {$: "Background"}}};
}

function $Handoff$lease$release$(state_0, round_0, token_0) {
  const __0 = state_0.item;
  const own_round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const __1 = state_0.reoffered;
  const __2 = state_0.phase;
  return run_jump($Handoff$lease$release$guard$, [{$: "Lease", ["item"]: __0, ["round"]: own_round_0, ["closed"]: closed_0, ["reoffered"]: __1, ["phase"]: __2}, token_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(own_round_0, round_0)), run_loop($Bool$not$(closed_0))))]);
}

function $Handoff$lease$terminal$(state_0, round_0, token_0, certain_0) {
  const __0 = state_0.item;
  const own_round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const __1 = state_0.reoffered;
  const __2 = state_0.phase;
  return run_jump($Handoff$lease$terminal$guard$, [{$: "Lease", ["item"]: __0, ["round"]: own_round_0, ["closed"]: closed_0, ["reoffered"]: __1, ["phase"]: __2}, token_0, certain_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(own_round_0, round_0)), run_loop($Bool$not$(closed_0))))]);
}

function $sample_authorized_lease$() {
  return {$: "Lease", ["item"]: 1n, ["round"]: 1n, ["closed"]: false, ["reoffered"]: false, ["phase"]: {$: "Authorized", ["token"]: 1n, ["surface"]: {$: "Background"}}};
}

function $Handoff$lease$reoffer$(state_0, round_0, token_0, fresh_0) {
  const __0 = state_0.item;
  const own_round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const reoffered_0 = state_0.reoffered;
  const __1 = state_0.phase;
  return run_jump($Handoff$lease$reoffer$guard$, [{$: "Lease", ["item"]: __0, ["round"]: own_round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: __1}, token_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(own_round_0, round_0)), run_loop($Bool$and$(run_loop($Bool$not$(closed_0)), run_loop($Bool$and$(run_loop($Bool$not$(reoffered_0)), fresh_0))))))]);
}

function $sample_uncertain_lease$() {
  return {$: "Lease", ["item"]: 1n, ["round"]: 1n, ["closed"]: false, ["reoffered"]: false, ["phase"]: {$: "Uncertain", ["surface"]: {$: "Background"}}};
}

function $Handoff$lease$offer$(state_0, round_0, token_0, surface_0, fresh_0) {
  const __0 = state_0.item;
  const __1 = state_0.round;
  const __2 = state_0.closed;
  const __3 = state_0.reoffered;
  const phase_0 = state_0.phase;
  return run_jump($Handoff$lease$offer$phase$, [{$: "Lease", ["item"]: __0, ["round"]: __1, ["closed"]: __2, ["reoffered"]: __3, ["phase"]: phase_0}, round_0, token_0, surface_0, fresh_0, phase_0]);
}

function $Handoff$lease$close$(state_0) {
  const item_0 = state_0.item;
  const round_0 = state_0.round;
  const __0 = state_0.closed;
  const reoffered_0 = state_0.reoffered;
  const phase_0 = state_0.phase;
  return {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: true, ["reoffered"]: reoffered_0, ["phase"]: phase_0};
}

function $Handoff$lease$suppresses$(state_0, round_0, requested_0) {
  const __0 = state_0.item;
  const owner_0 = state_0.round;
  const closed_0 = state_0.closed;
  const __1 = state_0.reoffered;
  const phase_0 = state_0.phase;
  return run_jump($Bool$and$, [run_loop($Nat$is_eq$(owner_0, round_0)), run_loop($Bool$and$(run_loop($Bool$not$(closed_0)), run_loop($Handoff$lease$suppress_phase$(phase_0, requested_0))))]);
}

function $Round$begin_stop$(state_0, token_0) {
  const generation_0 = state_0.generation;
  const live_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const barrier_0 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const output_0 = state_0.output_reserved;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(live_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(owner_0, 0n)), run_loop($Nat$is_gt$(token_0, 0n)))))), {$: "Granted", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: token_0, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}}, {$: "Denied", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}}]);
}

function $Round$initial$() {
  return {$: "Round", ["generation"]: 1n, ["active"]: true, ["closed_at"]: 0n, ["continuations"]: 0n, ["stop_token"]: 0n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false};
}

function $Round$active$(state_0, generation_0) {
  const own_0 = state_0.generation;
  const live_0 = state_0.active;
  const __0 = state_0.closed_at;
  const __1 = state_0.continuations;
  const __2 = state_0.stop_token;
  const __3 = state_0.barrier;
  const __4 = state_0.deciding;
  const __5 = state_0.output_reserved;
  return run_jump($Bool$and$, [live_0, run_loop($Nat$is_eq$(own_0, generation_0))]);
}

function $Round$budget$(state_0) {
  const __0 = state_0.generation;
  const live_0 = state_0.active;
  const __1 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const __2 = state_0.stop_token;
  const __3 = state_0.barrier;
  const __4 = state_0.deciding;
  const __5 = state_0.output_reserved;
  const x_0 = run_loop($Round$max_continuations$());
  return run_jump($Bool$and$, [live_0, (count_0 < x_0)]);
}

function $Round$max_continuations$() {
  return 4n;
}

function $Round$owns_stop$(state_0, token_0) {
  const __0 = state_0.generation;
  const live_0 = state_0.active;
  const __1 = state_0.closed_at;
  const __2 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const __3 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const __4 = state_0.output_reserved;
  return run_jump($Bool$and$, [live_0, run_loop($Bool$and$(run_loop($Nat$is_gt$(token_0, 0n)), run_loop($Bool$and$(run_loop($Nat$is_eq$(owner_0, token_0)), run_loop($Bool$not$(deciding_0))))))]);
}

function $Round$begin_decision$(state_0, token_0) {
  const generation_0 = state_0.generation;
  const live_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const barrier_0 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const output_0 = state_0.output_reserved;
  return run_jump($Bool$pick$, [run_loop($Round$owns_stop$({$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}, token_0)), {$: "Granted", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: true, ["output_reserved"]: output_0}}, {$: "Denied", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}}]);
}

function $Round$consume$(state_0) {
  const generation_0 = state_0.generation;
  const live_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const barrier_0 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const output_0 = state_0.output_reserved;
  const x_0 = run_loop($Nat$is_gt$(owner_0, 0n));
  return run_jump($Bool$pick$, [run_loop($Round$budget$({$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0})), {$: "Granted", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: nat_chk(count_0 + 1n), ["stop_token"]: owner_0, ["barrier"]: (barrier_0 || x_0), ["deciding"]: deciding_0, ["output_reserved"]: output_0}}, {$: "Denied", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}}]);
}

function $Round$reserve_output$(state_0, token_0) {
  const generation_0 = state_0.generation;
  const live_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const barrier_0 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const output_0 = state_0.output_reserved;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(live_0, run_loop($Bool$and$(deciding_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(owner_0, token_0)), run_loop($Bool$and$(run_loop($Nat$is_gt$(token_0, 0n)), run_loop($Bool$and$(run_loop($Bool$not$(output_0)), run_loop($Round$budget$({$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0})))))))))))), {$: "Granted", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: nat_chk(count_0 + 1n), ["stop_token"]: owner_0, ["barrier"]: true, ["deciding"]: deciding_0, ["output_reserved"]: true}}, {$: "Denied", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}}]);
}

function $Round$finish_stop$(state_0, token_0, close_0, at_0) {
  const generation_0 = state_0.generation;
  const live_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const barrier_0 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const output_0 = state_0.output_reserved;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_gt$(token_0, 0n)), run_loop($Nat$is_eq$(owner_0, token_0)))), {$: "Granted", ["state"]: run_loop($Bool$pick$(close_0, {$: "Round", ["generation"]: generation_0, ["active"]: false, ["closed_at"]: at_0, ["continuations"]: count_0, ["stop_token"]: 0n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}, {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: 0n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}))}, {$: "Denied", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}}]);
}

function $Round$stop_terminal$(has_output_0, authorized_0, requested_close_0) {
  const x_0 = run_loop($Bool$and$(has_output_0, run_loop($Bool$not$(authorized_0))));
  return {$: "StopTerminal", ["revoke_provisional"]: run_loop($Bool$and$(has_output_0, run_loop($Bool$not$(authorized_0)))), ["close"]: (requested_close_0 || x_0)};
}

function $Round$expire_close$(barrier_0) {
  return run_jump($Bool$not$, [barrier_0]);
}

function $Round$reopen$(state_0, generation_0) {
  const current_0 = state_0.generation;
  const live_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const barrier_0 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const output_0 = state_0.output_reserved;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Bool$not$(live_0)), run_loop($Nat$is_eq$(generation_0, nat_chk(current_0 + 1n))))), {$: "Granted", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: true, ["closed_at"]: closed_at_0, ["continuations"]: 0n, ["stop_token"]: 0n, ["barrier"]: false, ["deciding"]: false, ["output_reserved"]: false}}, {$: "Denied", ["state"]: {$: "Round", ["generation"]: current_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}}]);
}

function $Background$claim$(state_0, token_0, active_0, used_0, capacity_0) {
  const owner_0 = state_0.owner;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(active_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(owner_0, 0n)), run_loop($Bool$and$(run_loop($Nat$is_gt$(token_0, 0n)), (used_0 < capacity_0))))))), {$: "Granted", ["state"]: {$: "Waiter", ["owner"]: token_0}}, {$: "Denied", ["state"]: {$: "Waiter", ["owner"]: owner_0}}]);
}

function $Background$initial$() {
  return {$: "Waiter", ["owner"]: 0n};
}

function $Background$release$(state_0, token_0) {
  const owner_0 = state_0.owner;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_gt$(token_0, 0n)), run_loop($Nat$is_eq$(owner_0, token_0)))), {$: "Granted", ["state"]: run_loop($Background$initial$())}, {$: "Denied", ["state"]: {$: "Waiter", ["owner"]: owner_0}}]);
}

function $Background$expire$(state_0, elapsed_0, lifetime_0) {
  const owner_0 = state_0.owner;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_gt$(owner_0, 0n)), run_loop($Nat$is_ge$(elapsed_0, lifetime_0)))), run_loop($Background$initial$()), {$: "Waiter", ["owner"]: owner_0}]);
}

function $Notice$decide$(remaining_0, count_0, maximum_0) {
  if (remaining_0.$ === "Some") {
    const duration_0 = remaining_0.value;
    return run_jump($Bool$pick$, [run_loop($Nat$is_gt$(duration_0, 0n)), {$: "Suppress"}, {$: "Refresh"}]);
  } else {
    return run_jump($Bool$pick$, [run_loop($Nat$is_ge$(count_0, maximum_0)), {$: "RejectFull"}, {$: "Create"}]);
  }
}

function $Notice$advance$(remaining_0, count_0, maximum_0, suppressed_0, pending_0, leased_0, max_count_0) {
  return run_jump($Notice$advance$action$, [run_loop($Notice$decide$(remaining_0, count_0, maximum_0)), suppressed_0, pending_0, leased_0, max_count_0]);
}

function $Collection$order$(left_cycle_0, left_sequence_0, right_cycle_0, right_sequence_0) {
  return run_jump($Bool$pick$, [(left_cycle_0 < right_cycle_0), {$: "Before"}, run_loop($Bool$pick$(run_loop($Nat$is_gt$(left_cycle_0, right_cycle_0)), {$: "After"}, run_loop($Bool$pick$((left_sequence_0 < right_sequence_0), {$: "Before"}, run_loop($Bool$pick$(run_loop($Nat$is_gt$(left_sequence_0, right_sequence_0)), {$: "After"}, {$: "Equal"}))))))]);
}

function $Collection$eligible$(already_0, turn_end_0, cycle_complete_0, elapsed_0, window_0) {
  const x_0 = run_loop($Nat$is_ge$(elapsed_0, window_0));
  const x_1 = (cycle_complete_0 || x_0);
  const x_2 = (turn_end_0 || x_1);
  return (already_0 || x_2);
}

function $Collection$expired$(elapsed_0, lifetime_0) {
  return run_jump($Nat$is_ge$, [elapsed_0, lifetime_0]);
}

function $Delivery$transition$(current_0, requested_0) {
  if (current_0.$ === "Reserved") {
    if (requested_0.$ === "Authorized") {
      return {$: "Granted", ["phase"]: {$: "Authorized"}};
    } else {
      return {$: "Denied", ["phase"]: {$: "Reserved"}};
    }
  } else if (current_0.$ === "Authorized") {
    if (requested_0.$ === "Submitted") {
      return {$: "Granted", ["phase"]: {$: "Submitted"}};
    } else if (requested_0.$ === "Uncertain") {
      return {$: "Granted", ["phase"]: {$: "Uncertain"}};
    } else {
      return {$: "Denied", ["phase"]: {$: "Authorized"}};
    }
  } else {
    return {$: "Denied", ["phase"]: current_0};
  }
}

function $Delivery$expired$(phase_0, elapsed_0, lifetime_0) {
  if (phase_0.$ === "Authorized") {
    return run_jump($Nat$is_ge$, [elapsed_0, lifetime_0]);
  } else {
    return false;
  }
}

function $Delivery$background_reofferable$(phase_0, surface_0) {
  if (phase_0.$ === "Submitted") {
    if (surface_0.$ === "Background") {
      return true;
    } else {
      return false;
    }
  } else if (phase_0.$ === "Uncertain") {
    if (surface_0.$ === "Background") {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $Delivery$submission_allowed$(round_0, surface_0, existing_token_0, finish_permit_0) {
  const __0 = round_0.generation;
  const live_0 = round_0.active;
  const __1 = round_0.closed_at;
  const __2 = round_0.continuations;
  const __3 = round_0.stop_token;
  const barrier_0 = round_0.barrier;
  const deciding_0 = round_0.deciding;
  const __4 = round_0.output_reserved;
  if (surface_0.$ === "Background") {
    return run_jump($Bool$and$, [live_0, run_loop($Bool$and$(run_loop($Delivery$existing_token_allowed$({$: "Background"}, existing_token_0, finish_permit_0)), run_loop($Bool$and$(run_loop($Bool$not$(barrier_0)), run_loop($Bool$not$(deciding_0))))))]);
  } else if (surface_0.$ === "Stop") {
    return run_jump($Bool$and$, [live_0, run_loop($Delivery$existing_token_allowed$({$: "Stop"}, existing_token_0, finish_permit_0))]);
  } else {
    return run_jump($Bool$and$, [live_0, run_loop($Delivery$existing_token_allowed$({$: "Edit"}, existing_token_0, finish_permit_0))]);
  }
}

function $Delivery$existing_token_allowed$(surface_0, existing_token_0, finish_permit_0) {
  if (surface_0.$ === "Stop") {
    const x_0 = run_loop($Bool$not$(existing_token_0));
    return (x_0 || finish_permit_0);
  } else {
    return run_jump($Bool$not$, [existing_token_0]);
  }
}

function $Delivery$legacy_stop_allowed$(round_0) {
  const __0 = round_0.generation;
  const live_0 = round_0.active;
  const __1 = round_0.closed_at;
  const __2 = round_0.continuations;
  const __3 = round_0.stop_token;
  const __4 = round_0.barrier;
  const deciding_0 = round_0.deciding;
  const __5 = round_0.output_reserved;
  return run_jump($Bool$and$, [live_0, run_loop($Bool$not$(deciding_0))]);
}

function $Delivery$acknowledge$(items_0, any_expired_0) {
  return run_jump($Bool$pick$, [run_loop($Nat$is_eq$(items_0, 0n)), {$: "AckEmpty"}, run_loop($Bool$pick$(any_expired_0, {$: "AckExpired"}, {$: "AckReady"}))]);
}

function $Delivery$finalize$(items_0, all_acknowledged_0, any_expired_0) {
  const x_0 = run_loop($Nat$is_eq$(items_0, 0n));
  const x_1 = run_loop($Bool$not$(all_acknowledged_0));
  return run_jump($Bool$pick$, [(x_0 || x_1), {$: "FinalEmpty"}, run_loop($Bool$pick$(any_expired_0, {$: "FinalExpired"}, {$: "FinalReady"}))]);
}

function $Delivery$finding_disposition$(composed_0, remaining_0) {
  return run_jump($Bool$pick$, [composed_0, {$: "KeepForReoffer"}, run_loop($Bool$pick$(run_loop($Nat$is_eq$(remaining_0, 0n)), {$: "RetireAdvice"}, {$: "KeepRemaining"}))]);
}

function $Delivery$release_unacknowledged$(acknowledged_0) {
  return run_jump($Bool$not$, [acknowledged_0]);
}

function $Delivery$submission_candidate$(facts_0) {
  const round_active_0 = facts_0.round_active;
  const has_round_0 = facts_0.has_round;
  const has_unit_0 = facts_0.has_unit;
  const has_delivery_0 = facts_0.has_delivery;
  const pending_capacity_0 = facts_0.pending_capacity;
  const submission_allowed_0 = facts_0.submission_allowed;
  const current_work_0 = facts_0.current_work;
  const credential_authorized_0 = facts_0.credential_authorized;
  return run_jump($Bool$and$, [round_active_0, run_loop($Bool$and$(has_round_0, run_loop($Bool$and$(has_unit_0, run_loop($Bool$and$(has_delivery_0, run_loop($Bool$and$(pending_capacity_0, run_loop($Bool$and$(submission_allowed_0, run_loop($Bool$and$(current_work_0, credential_authorized_0))))))))))))]);
}

function $Delivery$submission_batch_gate$(count_0, all_valid_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_gt$(count_0, 0n)), all_valid_0)), {$: "BatchProceed"}, {$: "BatchRelease"}]);
}

function $Delivery$credential_observe$(invalid_seen_0, generation_valid_0, authorized_0) {
  const x_0 = run_loop($Bool$not$(run_loop($Bool$and$(generation_valid_0, authorized_0))));
  return (invalid_seen_0 || x_0);
}

function $Delivery$final_credential_gate$(legacy_collect_0, invalid_seen_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(legacy_collect_0, invalid_seen_0)), {$: "BatchRelease"}, {$: "BatchProceed"}]);
}

function $Delivery$collection_lease$(has_lease_0, expired_0, stop_collector_0, same_group_0, background_reofferable_0) {
  const x_0 = run_loop($Bool$and$(stop_collector_0, run_loop($Bool$and$(same_group_0, background_reofferable_0))));
  return run_jump($Bool$pick$, [run_loop($Bool$and$(has_lease_0, (expired_0 || x_0))), {$: "DropLease"}, {$: "KeepLease"}]);
}

function $Delivery$advice_candidate$(same_partition_0, unleased_0, has_unsuppressed_finding_0, ticket_owns_0) {
  return run_jump($Bool$and$, [same_partition_0, run_loop($Bool$and$(unleased_0, run_loop($Bool$and$(has_unsuppressed_finding_0, ticket_owns_0))))]);
}

function $Delivery$notice_candidate$(same_partition_0, has_pending_0, unleased_0, ticket_owns_0) {
  return run_jump($Bool$and$, [same_partition_0, run_loop($Bool$and$(has_pending_0, run_loop($Bool$and$(unleased_0, ticket_owns_0))))]);
}

function $Delivery$reserve_candidate$(unleased_0) {
  return unleased_0;
}

function $Reuse$route$(live_advice_0, attached_pending_0, claimed_pending_0) {
  if (live_advice_0) {
    return {$: "JoinAdvice"};
  } else {
    if (attached_pending_0) {
      return {$: "JoinPending"};
    } else {
      if (claimed_pending_0) {
        return {$: "JoinClaimed"};
      } else {
        return {$: "LookupCache"};
      }
    }
  }
}

function $Reuse$cache_route$(hit_0) {
  if (hit_0) {
    return {$: "Cached"};
  } else {
    return {$: "Own"};
  }
}

function $Cache$admit$(existing_0, incoming_bytes_0, byte_limit_0) {
  return run_jump($Bool$pick$, [existing_0, {$: "Already"}, run_loop($Bool$pick$(run_loop($Nat$is_gt$(incoming_bytes_0, byte_limit_0)), {$: "Reject"}, {$: "Add"}))]);
}

function $Cache$evict$(entries_0, current_bytes_0, incoming_bytes_0, entry_limit_0, byte_limit_0) {
  const x_0 = run_loop($Nat$is_ge$(entries_0, entry_limit_0));
  const x_1 = run_loop($Nat$is_gt$(nat_chk(current_bytes_0 + incoming_bytes_0), byte_limit_0));
  return run_jump($Bool$and$, [run_loop($Nat$is_gt$(entries_0, 0n)), (x_0 || x_1)]);
}

function $Lifecycle$cutoff$(round_0, work_0, token_0) {
  return run_jump($Lifecycle$cutoff$round$, [work_0, run_loop($Round$begin_decision$(round_0, token_0))]);
}

function $Lifecycle$finish_gate$(round_0, work_0, token_0, extra_unfinished_0, deadline_reached_0) {
  const x_0 = run_loop($Work$unfinished$(work_0));
  return run_jump($Bool$pick$, [run_loop($Round$owns_stop$(round_0, token_0)), run_loop($Bool$pick$(run_loop($Work$finish_wait$(nat_chk(x_0 + extra_unfinished_0), deadline_reached_0, run_loop($Round$budget$(round_0)))), {$: "GateWaiting", ["round"]: round_0, ["work"]: work_0}, run_loop($Lifecycle$finish_gate$cutoff$(run_loop($Lifecycle$cutoff$(round_0, work_0, token_0)))))), {$: "GateDenied", ["round"]: round_0, ["work"]: work_0}]);
}

function $Lifecycle$reserve_selected$(round_0, work_0, token_0, selected_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_gt$(run_loop($List$length$(selected_0)), 0n)), run_loop($Bool$and$(run_loop($Nat$is_le$(run_loop($List$length$(selected_0)), 5n)), run_loop($Lifecycle$selected_valid$(work_0, selected_0, selected_0)))))), run_loop($Round$reserve_output$(round_0, token_0)), {$: "Denied", ["state"]: round_0}]);
}

function $Lifecycle$release_unwritten$(round_0, token_0) {
  return run_jump($Round$release_output$, [round_0, token_0]);
}

function $Lifecycle$finish_disposition$(work_0, selected_0, has_notice_0, pass_notices_0, can_write_0, binding_valid_0, deadline_reached_0) {
  if (!can_write_0) {
    return run_jump($Lifecycle$finish_disposition$empty$, [false, false, deadline_reached_0]);
  } else {
    return run_jump($Lifecycle$finish_disposition$writable$, [work_0, selected_0, has_notice_0, pass_notices_0, binding_valid_0, deadline_reached_0]);
  }
}

function $Lifecycle$finish_output$(round_0, work_0, token_0, selected_0, has_notice_0, pass_notices_0, can_write_0, binding_valid_0, deadline_reached_0) {
  return run_jump($Lifecycle$finish_output$decide$, [round_0, work_0, token_0, selected_0, run_loop($Lifecycle$finish_disposition$(work_0, selected_0, has_notice_0, pass_notices_0, can_write_0, binding_valid_0, deadline_reached_0))]);
}

function $Lifecycle$selection_reserve$(work_0, selected_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_gt$(run_loop($List$length$(selected_0)), 0n)), run_loop($Bool$and$(run_loop($Nat$is_le$(run_loop($List$length$(selected_0)), 5n)), run_loop($Lifecycle$selected_valid$(work_0, selected_0, selected_0)))))), {$: "SelectionReserved", ["state"]: {$: "OutputSelection", ["selected"]: selected_0, ["authorized"]: false, ["consumed"]: false}}, {$: "SelectionRejected"}]);
}

function $Lifecycle$selection_authorize$(state_0) {
  const selected_0 = state_0.selected;
  const authorized_0 = state_0.authorized;
  const consumed_0 = state_0.consumed;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Bool$not$(authorized_0)), run_loop($Bool$not$(consumed_0)))), {$: "SelectionGranted", ["state"]: {$: "OutputSelection", ["selected"]: selected_0, ["authorized"]: true, ["consumed"]: false}}, {$: "SelectionDenied", ["state"]: {$: "OutputSelection", ["selected"]: selected_0, ["authorized"]: authorized_0, ["consumed"]: consumed_0}}]);
}

function $Lifecycle$selection_consume$(state_0, actual_0) {
  const selected_0 = state_0.selected;
  const authorized_0 = state_0.authorized;
  const consumed_0 = state_0.consumed;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(authorized_0, run_loop($Bool$and$(run_loop($Bool$not$(consumed_0)), run_loop($Lifecycle$selection_same$(selected_0, actual_0)))))), {$: "SelectionGranted", ["state"]: {$: "OutputSelection", ["selected"]: selected_0, ["authorized"]: true, ["consumed"]: true}}, {$: "SelectionDenied", ["state"]: {$: "OutputSelection", ["selected"]: selected_0, ["authorized"]: authorized_0, ["consumed"]: consumed_0}}]);
}

function $Ticket$initial$() {
  return {$: "Preparing", ["failure"]: {$: "None"}};
}

function $Ticket$fail$(phase_0, reason_0) {
  if (phase_0.$ === "Preparing") {
    const previous_0 = phase_0.failure;
    return run_jump($Ticket$fail$previous$, [previous_0, reason_0]);
  } else {
    return phase_0;
  }
}

function $Ticket$close$(phase_0) {
  if (phase_0.$ === "Preparing") {
    const _t_0 = phase_0.failure;
    if (_t_0.$ === "None") {
      return {$: "Closed"};
    } else {
      const reason_0 = _t_0.value;
      return {$: "Failed", ["reason"]: reason_0};
    }
  } else {
    return phase_0;
  }
}

function $Ticket$terminal$(state_0, facts_0) {
  const expired_0 = facts_0.expired;
  const credential_valid_0 = facts_0.credential_valid;
  const __0 = facts_0.pending_units;
  const __1 = facts_0.live_advice;
  const __2 = facts_0.pending_notice;
  const __3 = facts_0.unit_failure;
  const __4 = facts_0.finding_units;
  const __5 = facts_0.undelivered_findings;
  const __6 = facts_0.total_units;
  return run_jump($Bool$pick$, [expired_0, {$: "Unavailable", ["reason"]: {$: "Expired"}}, run_loop($Bool$pick$(run_loop($Bool$not$(credential_valid_0)), {$: "Unavailable", ["reason"]: {$: "Credential"}}, run_loop($Ticket$terminal$pending$(state_0, {$: "Facts", ["expired"]: expired_0, ["credential_valid"]: credential_valid_0, ["pending_units"]: __0, ["live_advice"]: __1, ["pending_notice"]: __2, ["unit_failure"]: __3, ["finding_units"]: __4, ["undelivered_findings"]: __5, ["total_units"]: __6}))))]);
}

function $Ticket$collect_gate$(expired_0, credential_valid_0) {
  return run_jump($Ticket$collect_gate$result$, [run_loop($Ticket$terminal$(run_loop($Ticket$initial$()), {$: "Facts", ["expired"]: expired_0, ["credential_valid"]: credential_valid_0, ["pending_units"]: 0n, ["live_advice"]: false, ["pending_notice"]: false, ["unit_failure"]: {$: "None"}, ["finding_units"]: 0n, ["undelivered_findings"]: 0n, ["total_units"]: 0n}))]);
}

function $Ticket$final_authority$(admitted_block_0, current_block_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(admitted_block_0, run_loop($Bool$not$(current_block_0)))), {$: "FinalRelease"}, {$: "FinalProceed"}]);
}

function $Ticket$joined_disposition$(state_0, stale_unavailable_0, has_revision_0, has_advice_id_0) {
  return run_jump($Bool$pick$, [stale_unavailable_0, {$: "KeepJoined"}, run_loop($Ticket$joined$route$(state_0, has_revision_0, has_advice_id_0))]);
}

function $Ticket$unit$step$(stage_0, event_0) {
  if (event_0.$ === "Revise") {
    return run_jump($Ticket$unit$revise$, [stage_0]);
  } else if (event_0.$ === "ClearResult") {
    return run_jump($Ticket$unit$result$, [stage_0, false]);
  } else if (event_0.$ === "FindingResult") {
    return run_jump($Ticket$unit$result$, [stage_0, true]);
  } else if (event_0.$ === "FailUnit") {
    return {$: "UnitGranted", ["stage"]: {$: "UnitUnavailable"}};
  } else {
    return run_jump($Ticket$unit$delivered$, [stage_0]);
  }
}

function $Ticket$unit$initial$() {
  return {$: "UnitPending"};
}

function $Revision$register$(has_current_0, same_input_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(has_current_0, same_input_0)), {$: "Reuse"}, {$: "Replace"}]);
}

function $Revision$superseded$(candidate_subject_0, target_subject_0, candidate_generation_0, current_generation_0) {
  return run_jump($Bool$and$, [run_loop($Nat$is_eq$(candidate_subject_0, target_subject_0)), run_loop($Bool$not$(run_loop($Nat$is_eq$(candidate_generation_0, current_generation_0))))]);
}

function $Retention$cleanup_gate$(facts_0) {
  const active_0 = facts_0.active;
  const dispatcher_idle_0 = facts_0.dispatcher_idle;
  const no_advice_0 = facts_0.no_advice;
  const no_notices_0 = facts_0.no_notices;
  const no_pending_evaluations_0 = facts_0.no_pending_evaluations;
  const no_current_work_0 = facts_0.no_current_work;
  const no_cooldowns_0 = facts_0.no_cooldowns;
  const connection_count_ok_0 = facts_0.connection_count_ok;
  const cache_matches_ledger_0 = facts_0.cache_matches_ledger;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(active_0, run_loop($Bool$and$(dispatcher_idle_0, run_loop($Bool$and$(no_advice_0, run_loop($Bool$and$(no_notices_0, run_loop($Bool$and$(no_pending_evaluations_0, run_loop($Bool$and$(no_current_work_0, run_loop($Bool$and$(no_cooldowns_0, run_loop($Bool$and$(connection_count_ok_0, cache_matches_ledger_0)))))))))))))))), {$: "CleanupReady"}, {$: "CleanupBusy"}]);
}

function $Retention$cleanup_commit$(ledger_empty_0) {
  return run_jump($Bool$pick$, [ledger_empty_0, {$: "CleanupReady"}, {$: "CleanupBusy"}]);
}

function $Retention$ticket_retention$(count_0, limit_0, has_oldest_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_gt$(count_0, limit_0)), has_oldest_0)), {$: "EvictOldest"}, {$: "KeepTickets"}]);
}

function $Retention$discard_scope$(named_count_0, cancelled_count_0, has_unnamed_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(run_loop($Nat$is_eq$(named_count_0, cancelled_count_0)), run_loop($Bool$not$(has_unnamed_0)))), {$: "NamedOnly"}, {$: "AllUnfinished"}]);
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

function $Bool$pick$(c_0, a_0, b_0) {
  if (!c_0) {
    return b_0;
  } else {
    return a_0;
  }
}

function $Bool$and$(a_0, b_0) {
  if (!a_0) {
    return false;
  } else {
    return b_0;
  }
}

function $Bool$not$(b_0) {
  if (!b_0) {
    return true;
  } else {
    return false;
  }
}

function $Nat$is_ge$(a_0, b_0) {
  return run_jump($Cmp$is_ge$, [cmp_new(a_0, b_0)]);
}

function $Nat$is_gt$(a_0, b_0) {
  return run_jump($Cmp$is_gt$, [cmp_new(a_0, b_0)]);
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

function $Admission$expire$due$(state_0, token_0) {
  const partition_0 = state_0.partition;
  const lifetime_0 = state_0.lifetime;
  const round_0 = state_0.round;
  const active_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const next_token_0 = state_0.next_token;
  const permits_0 = state_0.permits;
  const used_0 = state_0.used;
  return {$: "RemovePermit", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: active_0, ["closed_at"]: closed_at_0, ["next_token"]: next_token_0, ["permits"]: run_loop($Admission$remove_permit$(token_0, permits_0)), ["used"]: used_0}};
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

function $Work$start_source$found$(work_0, id_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingObservation"}};
  } else {
    const __0 = found_0.value;
    return run_jump($Work$start_source$apply$, [work_0, id_0]);
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

function $Work$start_unit$found$(work_0, id_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingUnit"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const observation_0 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __1 = _t_0.findings;
    const __2 = _t_0.bytes;
    return run_jump($Work$start_unit$stage$, [work_0, id_0, observation_0, stage_0]);
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

function $Work$spawn$found$(work_0, observation_0, count_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingObservation"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "SourceQueued") {
      return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "SourceNotReading"}};
    } else {
      return run_jump($Work$spawn$count$, [work_0, observation_0, count_0, run_loop($Nat$is_le$(count_0, 16n))]);
    }
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

function $Work$complete_source$found$(work_0, id_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingObservation"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "SourceQueued") {
      return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "SourceNotReading"}};
    } else {
      return run_jump($Work$interrupt_observation$, [work_0, id_0]);
    }
  }
}

function $Work$cached_finding$found$(work_0, observation_0, count_0, bytes_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingObservation"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "SourceQueued") {
      return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "SourceNotReading"}};
    } else {
      return run_jump($Work$cached_finding$count$, [work_0, observation_0, count_0, bytes_0, run_loop($Nat$is_gt$(count_0, 0n))]);
    }
  }
}

function $Work$revise_finding$found$(work_0, id_0, count_0, bytes_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingUnit"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const observation_0 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __1 = _t_0.findings;
    const __2 = _t_0.bytes;
    return run_jump($Work$revise_finding$stage$, [work_0, id_0, observation_0, stage_0, count_0, bytes_0]);
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

function $Work$retire$found$(work_0, id_0, found_0) {
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "MissingUnit"}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const __1 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __2 = _t_0.findings;
    const __3 = _t_0.bytes;
    return run_jump($Work$retire$stage$, [work_0, id_0, run_loop($Work$is_unit_unfinished$(stage_0))]);
  }
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

function $Work$pending_for$found$(found_0) {
  if (found_0.$ === "None") {
    return 0n;
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const __1 = _t_0.observation;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "PendingFinding") {
      const findings_0 = _t_0.findings;
      const __2 = _t_0.bytes;
      return findings_0;
    } else {
      const findings_1 = _t_0.findings;
      const __3 = _t_0.bytes;
      return 0n;
    }
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

function $Work$keep_terminal$(units_0) {
  if (units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = units_0.head;
    const __0 = _t_0.id;
    const __1 = _t_0.observation;
    const stage_0 = _t_0.stage;
    const __2 = _t_0.findings;
    const __3 = _t_0.bytes;
    const rest_0 = units_0.tail;
    return run_jump($Work$keep_terminal$pick$, [{$: "ReviewUnit", ["id"]: __0, ["observation"]: __1, ["stage"]: stage_0, ["findings"]: __2, ["bytes"]: __3}, run_loop($Work$keep_terminal$(rest_0)), run_loop($Work$is_unit_unfinished$(stage_0))]);
  }
}

function $Work$observation_ids$(observations_0) {
  if (observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = observations_0.head;
    const id_0 = _t_0.id;
    const __0 = _t_0.stage;
    const rest_0 = observations_0.tail;
    return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Work$observation_ids$(rest_0))};
  }
}

function $Work$unfinished_unit_ids$(units_0) {
  if (units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = units_0.head;
    const id_0 = _t_0.id;
    const __0 = _t_0.observation;
    const _t_1 = _t_0.stage;
    if (_t_1.$ === "ReviewQueued") {
      const __1 = _t_0.findings;
      const __2 = _t_0.bytes;
      const rest_0 = units_0.tail;
      return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Work$unfinished_unit_ids$(rest_0))};
    } else if (_t_1.$ === "AtJev") {
      const __3 = _t_0.findings;
      const __4 = _t_0.bytes;
      const rest_1 = units_0.tail;
      return {$: "Con", ["head"]: id_0, ["tail"]: run_loop($Work$unfinished_unit_ids$(rest_1))};
    } else {
      const __5 = _t_0.findings;
      const __6 = _t_0.bytes;
      const rest_2 = units_0.tail;
      return run_jump($Work$unfinished_unit_ids$, [rest_2]);
    }
  }
}

function $Work$set_source_capacity$apply$(work_0, capacity_0, valid_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  if (!valid_0) {
    return {$: "Rejected", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: units_0}, ["reason"]: {$: "InvalidCapacity"}};
  } else {
    return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: units_0})), ["admitted"]: {$: "Nil"}};
  }
}

function $Flow$capacity_valid$(capacity_0) {
  const low_0 = capacity_0.low;
  const high_0 = capacity_0.high;
  const x_0 = run_loop($Nat$is_gt$(high_0, 0n));
  const x_1 = run_loop($Nat$is_gt$(low_0, 0n));
  return (x_0 || x_1);
}

function $Work$set_review_capacity$apply$(work_0, capacity_0, valid_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  if (!valid_0) {
    return {$: "Rejected", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: units_0}, ["reason"]: {$: "InvalidCapacity"}};
  } else {
    return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: capacity_0, ["observations"]: observations_0, ["units"]: units_0})), ["admitted"]: {$: "Nil"}};
  }
}

function $Handoff$select$duplicate$(state_0, advice_0, prospective_bytes_0, current_0, duplicate_0) {
  if (duplicate_0) {
    return {$: "Duplicate", ["state"]: state_0};
  } else {
    return run_jump($Handoff$select$current$, [state_0, advice_0, prospective_bytes_0, current_0]);
  }
}

function $Handoff$current$(advice_0, partition_0, round_0) {
  const __0 = advice_0.id;
  const __1 = advice_0.unit;
  const source_partition_0 = advice_0.partition;
  const source_round_0 = advice_0.round;
  const source_snapshot_0 = advice_0.snapshot;
  const current_snapshot_0 = advice_0.current_snapshot;
  const source_credential_0 = advice_0.credential;
  const current_credential_0 = advice_0.current_credential;
  const age_ms_0 = advice_0.age_ms;
  const __2 = advice_0.solo_bytes;
  const ready_0 = advice_0.collection_ready;
  const x_0 = BigInt(600000);
  return run_jump($Bool$and$, [run_loop($Nat$is_eq$(source_partition_0, partition_0)), run_loop($Bool$and$(run_loop($Nat$is_eq$(source_round_0, round_0)), run_loop($Bool$and$(run_loop($Nat$is_eq$(source_snapshot_0, current_snapshot_0)), run_loop($Bool$and$(run_loop($Nat$is_eq$(source_credential_0, current_credential_0)), run_loop($Bool$and$((age_ms_0 < x_0), ready_0))))))))]);
}

function $Handoff$contains$(id_0, ids_0) {
  if (ids_0.$ === "Nil") {
    return false;
  } else {
    const item_0 = ids_0.head;
    const rest_0 = ids_0.tail;
    const x_0 = run_loop($Nat$is_eq$(id_0, item_0));
    const x_1 = run_loop($Handoff$contains$(id_0, rest_0));
    return (x_0 || x_1);
  }
}

function $Nat$is_le$(a_0, b_0) {
  return run_jump($Cmp$is_le$, [cmp_new(a_0, b_0)]);
}

function $Handoff$finish$guard$(state_0, unfinished_0, deadline_0, actionable_findings_0, valid_0, reserved_0) {
  if (valid_0) {
    return run_jump($Handoff$finish$pending$, [state_0, unfinished_0, deadline_0, actionable_findings_0, reserved_0]);
  } else {
    return {$: "Allow", ["state"]: state_0};
  }
}

function $Handoff$lease$reserve$guard$(state_0, token_0, surface_0, allowed_0) {
  const item_0 = state_0.item;
  const round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const reoffered_0 = state_0.reoffered;
  const phase_0 = state_0.phase;
  if (allowed_0) {
    return run_jump($Handoff$lease$reserve$phase$, [item_0, round_0, closed_0, reoffered_0, phase_0, token_0, surface_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$authorize$guard$(state_0, token_0, allowed_0) {
  const item_0 = state_0.item;
  const round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const reoffered_0 = state_0.reoffered;
  const phase_0 = state_0.phase;
  if (allowed_0) {
    return run_jump($Handoff$lease$authorize$phase$, [item_0, round_0, closed_0, reoffered_0, phase_0, token_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$release$guard$(state_0, token_0, allowed_0) {
  const item_0 = state_0.item;
  const round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const reoffered_0 = state_0.reoffered;
  const phase_0 = state_0.phase;
  if (allowed_0) {
    return run_jump($Handoff$lease$release$phase$, [item_0, round_0, closed_0, reoffered_0, phase_0, token_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$terminal$guard$(state_0, token_0, certain_0, allowed_0) {
  const item_0 = state_0.item;
  const round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const reoffered_0 = state_0.reoffered;
  const phase_0 = state_0.phase;
  if (allowed_0) {
    return run_jump($Handoff$lease$terminal$phase$, [item_0, round_0, closed_0, reoffered_0, phase_0, token_0, certain_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$reoffer$guard$(state_0, token_0, allowed_0) {
  const item_0 = state_0.item;
  const round_0 = state_0.round;
  const closed_0 = state_0.closed;
  const reoffered_0 = state_0.reoffered;
  const phase_0 = state_0.phase;
  if (allowed_0) {
    return run_jump($Handoff$lease$reoffer$phase$, [item_0, round_0, closed_0, reoffered_0, phase_0, token_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$offer$phase$(state_0, round_0, token_0, surface_0, fresh_0, phase_0) {
  if (phase_0.$ === "Submitted") {
    const _t_0 = phase_0.surface;
    if (_t_0.$ === "Background") {
      return run_jump($Handoff$lease$offer$background$, [state_0, round_0, token_0, surface_0, fresh_0]);
    } else {
      return run_jump($Handoff$lease$reserve$, [state_0, round_0, token_0, surface_0]);
    }
  } else if (phase_0.$ === "Uncertain") {
    const _t_1 = phase_0.surface;
    if (_t_1.$ === "Background") {
      return run_jump($Handoff$lease$offer$background$, [state_0, round_0, token_0, surface_0, fresh_0]);
    } else {
      return run_jump($Handoff$lease$reserve$, [state_0, round_0, token_0, surface_0]);
    }
  } else {
    return run_jump($Handoff$lease$reserve$, [state_0, round_0, token_0, surface_0]);
  }
}

function $Handoff$lease$suppress_phase$(phase_0, requested_0) {
  if (phase_0.$ === "Available") {
    return false;
  } else if (phase_0.$ === "Reserved") {
    const __0 = phase_0.token;
    const __1 = phase_0.surface;
    return true;
  } else if (phase_0.$ === "Authorized") {
    const __2 = phase_0.token;
    const __3 = phase_0.surface;
    return true;
  } else if (phase_0.$ === "Submitted") {
    const surface_0 = phase_0.surface;
    return run_jump($Handoff$lease$suppress_surface$, [surface_0, requested_0]);
  } else {
    const surface_1 = phase_0.surface;
    return run_jump($Handoff$lease$suppress_surface$, [surface_1, requested_0]);
  }
}

function $Notice$advance$action$(action_0, suppressed_0, pending_0, leased_0, maximum_0) {
  if (action_0.$ === "Suppress") {
    return {$: "Suppressed", ["count"]: run_loop($Notice$bounded_add$(suppressed_0, 1n, maximum_0))};
  } else if (action_0.$ === "RejectFull") {
    return {$: "RejectedFull"};
  } else if (action_0.$ === "Create") {
    return {$: "CreateKey"};
  } else {
    return run_jump($Notice$refresh$, [pending_0, leased_0, suppressed_0, maximum_0]);
  }
}

function $Lifecycle$cutoff$round$(work_0, result_0) {
  if (result_0.$ === "Granted") {
    const round_0 = result_0.state;
    return run_jump($Lifecycle$cutoff$granted$, [round_0, run_loop($Work$cancel_unfinished$(work_0))]);
  } else {
    const round_1 = result_0.state;
    return {$: "CutoffDenied", ["round"]: round_1, ["work"]: work_0};
  }
}

function $Lifecycle$finish_gate$cutoff$(result_0) {
  if (result_0.$ === "CutoffGranted") {
    const round_0 = result_0.round;
    const work_0 = result_0.work;
    const source_0 = result_0.cancelled_source;
    const jev_0 = result_0.cancelled_jev;
    return {$: "GateCutoff", ["round"]: round_0, ["work"]: work_0, ["cancelled_source"]: source_0, ["cancelled_jev"]: jev_0};
  } else {
    const round_1 = result_0.round;
    const work_1 = result_0.work;
    return {$: "GateDenied", ["round"]: round_1, ["work"]: work_1};
  }
}

function $Lifecycle$selected_valid$(work_0, selected_0, remaining_0) {
  if (remaining_0.$ === "Nil") {
    return true;
  } else {
    const unit_0 = remaining_0.head;
    const rest_0 = remaining_0.tail;
    return run_jump($Bool$and$, [run_loop($Nat$is_gt$(unit_0, 0n)), run_loop($Bool$and$(run_loop($Nat$is_le$(run_loop($Lifecycle$selected_count$(unit_0, selected_0)), run_loop($Work$pending_for$(work_0, unit_0)))), run_loop($Lifecycle$selected_valid$(work_0, selected_0, rest_0))))]);
  }
}

function $Round$release_output$(state_0, token_0) {
  const generation_0 = state_0.generation;
  const live_0 = state_0.active;
  const closed_at_0 = state_0.closed_at;
  const count_0 = state_0.continuations;
  const owner_0 = state_0.stop_token;
  const barrier_0 = state_0.barrier;
  const deciding_0 = state_0.deciding;
  const output_0 = state_0.output_reserved;
  return run_jump($Bool$pick$, [run_loop($Bool$and$(live_0, run_loop($Bool$and$(deciding_0, run_loop($Bool$and$(run_loop($Nat$is_eq$(owner_0, token_0)), run_loop($Bool$and$(run_loop($Nat$is_gt$(token_0, 0n)), run_loop($Bool$and$(output_0, run_loop($Nat$is_gt$(count_0, 0n)))))))))))), {$: "Granted", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: (count_0 < 1n ? 0n : count_0 - 1n), ["stop_token"]: owner_0, ["barrier"]: false, ["deciding"]: deciding_0, ["output_reserved"]: false}}, {$: "Denied", ["state"]: {$: "Round", ["generation"]: generation_0, ["active"]: live_0, ["closed_at"]: closed_at_0, ["continuations"]: count_0, ["stop_token"]: owner_0, ["barrier"]: barrier_0, ["deciding"]: deciding_0, ["output_reserved"]: output_0}}]);
}

function $Lifecycle$finish_disposition$empty$(has_notice_0, pass_notices_0, deadline_reached_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(has_notice_0, pass_notices_0)), {$: "PassNotices"}, run_loop($Bool$pick$(deadline_reached_0, {$: "AllowDeadline"}, {$: "AllowNoAdvice"}))]);
}

function $Lifecycle$finish_disposition$writable$(work_0, selected_0, has_notice_0, pass_notices_0, binding_valid_0, deadline_reached_0) {
  if (!binding_valid_0) {
    return {$: "AllowUnavailable"};
  } else {
    return run_jump($Lifecycle$finish_disposition$valid$, [work_0, selected_0, has_notice_0, pass_notices_0, deadline_reached_0]);
  }
}

function $Lifecycle$finish_output$decide$(round_0, work_0, token_0, selected_0, disposition_0) {
  if (disposition_0.$ === "ReserveFindings") {
    return run_jump($Lifecycle$finish_output$reserve$, [round_0, work_0, token_0, selected_0]);
  } else if (disposition_0.$ === "PassNotices") {
    return {$: "OutputNotices"};
  } else if (disposition_0.$ === "AllowNoAdvice") {
    return {$: "OutputAllowed", ["reason"]: {$: "AllowNoAdvice"}};
  } else if (disposition_0.$ === "AllowDeadline") {
    return {$: "OutputAllowed", ["reason"]: {$: "AllowDeadline"}};
  } else {
    return {$: "OutputAllowed", ["reason"]: {$: "AllowUnavailable"}};
  }
}

function $Lifecycle$selection_same$(left_0, right_0) {
  if (left_0.$ === "Nil") {
    if (right_0.$ === "Nil") {
      return true;
    } else {
      return false;
    }
  } else {
    const head_0 = left_0.head;
    const tail_0 = left_0.tail;
    if (right_0.$ === "Nil") {
      return false;
    } else {
      const other_0 = right_0.head;
      const rest_0 = right_0.tail;
      return run_jump($Bool$and$, [run_loop($Nat$is_eq$(head_0, other_0)), run_loop($Lifecycle$selection_same$(tail_0, rest_0))]);
    }
  }
}

function $Ticket$fail$previous$(previous_0, reason_0) {
  if (previous_0.$ === "None") {
    return {$: "Preparing", ["failure"]: {$: "Some", ["value"]: reason_0}};
  } else {
    const earlier_0 = previous_0.value;
    return {$: "Preparing", ["failure"]: {$: "Some", ["value"]: earlier_0}};
  }
}

function $Ticket$terminal$pending$(state_0, facts_0) {
  const __0 = facts_0.expired;
  const __1 = facts_0.credential_valid;
  const pending_units_0 = facts_0.pending_units;
  const live_advice_0 = facts_0.live_advice;
  const pending_notice_0 = facts_0.pending_notice;
  const unit_failure_0 = facts_0.unit_failure;
  const finding_units_0 = facts_0.finding_units;
  const undelivered_0 = facts_0.undelivered_findings;
  const total_0 = facts_0.total_units;
  const x_0 = run_loop($Nat$is_gt$(pending_units_0, 0n));
  const x_1 = (live_advice_0 || pending_notice_0);
  const x_2 = run_loop($Ticket$is_preparing$(state_0));
  const x_3 = (x_0 || x_1);
  return run_jump($Bool$pick$, [(x_2 || x_3), {$: "Pending"}, run_loop($Ticket$terminal$phase$(state_0, unit_failure_0, finding_units_0, undelivered_0, total_0))]);
}

function $Ticket$collect_gate$result$(outcome_0) {
  if (outcome_0.$ === "Pending") {
    return {$: "CollectProceed"};
  } else if (outcome_0.$ === "Unavailable") {
    const reason_0 = outcome_0.reason;
    return {$: "CollectUnavailable", ["reason"]: reason_0};
  } else {
    return {$: "CollectUnavailable", ["reason"]: {$: "Lost"}};
  }
}

function $Ticket$joined$route$(state_0, has_revision_0, has_advice_id_0) {
  if (state_0.$ === "JoinedUnavailable") {
    return {$: "SetJoinedUnavailable"};
  } else if (state_0.$ === "JoinedPending") {
    return run_jump($Bool$pick$, [has_revision_0, {$: "KeepJoined"}, {$: "SetJoinedLost"}]);
  } else if (state_0.$ === "JoinedClear") {
    return run_jump($Bool$pick$, [has_revision_0, {$: "SetJoinedClear"}, {$: "SetJoinedLost"}]);
  } else {
    return run_jump($Bool$pick$, [run_loop($Bool$and$(has_revision_0, has_advice_id_0)), {$: "SetJoinedFinding"}, {$: "SetJoinedLost"}]);
  }
}

function $Ticket$unit$revise$(stage_0) {
  if (stage_0.$ === "UnitPending") {
    return {$: "UnitGranted", ["stage"]: {$: "UnitPending"}};
  } else {
    return {$: "UnitDenied", ["stage"]: stage_0};
  }
}

function $Ticket$unit$result$(stage_0, finding_0) {
  if (stage_0.$ === "UnitUnavailable") {
    return {$: "UnitDenied", ["stage"]: {$: "UnitUnavailable"}};
  } else {
    return {$: "UnitGranted", ["stage"]: run_loop($Bool$pick$(finding_0, {$: "UnitFinding", ["delivered"]: false}, {$: "UnitClear"}))};
  }
}

function $Ticket$unit$delivered$(stage_0) {
  if (stage_0.$ === "UnitFinding") {
    const __0 = stage_0.delivered;
    return {$: "UnitGranted", ["stage"]: {$: "UnitFinding", ["delivered"]: true}};
  } else {
    return {$: "UnitDenied", ["stage"]: stage_0};
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

function $Cmp$is_ge$(c_0) {
  if (c_0.$ === "LT") {
    return false;
  } else if (c_0.$ === "EQ") {
    return true;
  } else {
    return true;
  }
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

function $Work$start_source$apply$(work_0, id_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Accepted", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: run_loop($Work$start_observation$(id_0, observations_0)), ["units"]: units_0}, ["admitted"]: {$: "Nil"}};
}

function $Work$find_observation$pick$(observation_0, fallback_0, hit_0) {
  if (hit_0) {
    return {$: "Some", ["value"]: observation_0};
  } else {
    return fallback_0;
  }
}

function $Work$start_unit$stage$(work_0, id_0, observation_0, stage_0) {
  if (stage_0.$ === "ReviewQueued") {
    return run_jump($Work$start_unit$apply$, [work_0, id_0, observation_0]);
  } else if (stage_0.$ === "AtJev") {
    return {$: "Accepted", ["state"]: work_0, ["admitted"]: {$: "Nil"}};
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

function $Work$spawn$count$(work_0, observation_0, count_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "TooManyUnits"}};
  } else {
    return run_jump($Work$spawn$apply$, [work_0, observation_0, count_0]);
  }
}

function $Work$prepare$stage$(work_0, observation_0, count_0, stage_0) {
  if (stage_0.$ === "SourceQueued") {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "SourceNotReading"}};
  } else {
    return run_jump($Work$prepare$count$, [work_0, observation_0, count_0, run_loop($Nat$is_le$(count_0, 16n))]);
  }
}

function $Work$cached_finding$count$(work_0, observation_0, count_0, bytes_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "InvalidFinding"}};
  } else {
    return run_jump($Work$cached_finding$apply$, [work_0, observation_0, count_0, bytes_0]);
  }
}

function $Work$revise_finding$stage$(work_0, id_0, observation_0, stage_0, count_0, bytes_0) {
  if (stage_0.$ === "PendingFinding") {
    return run_jump($Work$revise_finding$valid$, [work_0, id_0, observation_0, count_0, bytes_0, run_loop($Nat$is_gt$(count_0, 0n))]);
  } else {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "UnitNotAtJev"}};
  }
}

function $Work$outcome$stage$(work_0, id_0, observation_0, stage_0, result_0) {
  if (stage_0.$ === "AtJev") {
    return run_jump($Work$outcome$kind$, [work_0, id_0, observation_0, result_0]);
  } else {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "UnitNotAtJev"}};
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

function $Work$retire$stage$(work_0, id_0, unfinished_0) {
  if (unfinished_0) {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "UnitStillUnfinished"}};
  } else {
    return run_jump($Work$retire$apply$, [work_0, id_0]);
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

function $Work$keep_terminal$pick$(unit_0, tail_0, unfinished_0) {
  if (unfinished_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: unit_0, ["tail"]: tail_0};
  }
}

function $Handoff$select$current$(state_0, advice_0, prospective_bytes_0, valid_0) {
  const __0 = state_0.partition;
  const __1 = state_0.round;
  const __2 = state_0.selected;
  const __3 = state_0.retained;
  const count_0 = state_0.findings;
  const __4 = state_0.bytes;
  const id_0 = advice_0.id;
  const __5 = advice_0.unit;
  const __6 = advice_0.partition;
  const __7 = advice_0.round;
  const __8 = advice_0.snapshot;
  const __9 = advice_0.current_snapshot;
  const __10 = advice_0.credential;
  const __11 = advice_0.current_credential;
  const __12 = advice_0.age_ms;
  const solo_bytes_0 = advice_0.solo_bytes;
  const __13 = advice_0.collection_ready;
  return run_jump($Handoff$select$valid$, [{$: "Selection", ["partition"]: __0, ["round"]: __1, ["selected"]: __2, ["retained"]: __3, ["findings"]: count_0, ["bytes"]: __4}, id_0, prospective_bytes_0, solo_bytes_0, count_0, valid_0]);
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

function $Handoff$finish$pending$(state_0, unfinished_0, deadline_0, actionable_findings_0, reserved_0) {
  if (reserved_0) {
    return {$: "Wait", ["state"]: state_0};
  } else {
    return run_jump($Handoff$finish$ready$, [state_0, unfinished_0, deadline_0, actionable_findings_0]);
  }
}

function $Handoff$lease$reserve$phase$(item_0, round_0, closed_0, reoffered_0, phase_0, token_0, surface_0) {
  if (phase_0.$ === "Available") {
    return {$: "Granted", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Reserved", ["token"]: token_0, ["surface"]: surface_0}}};
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$authorize$phase$(item_0, round_0, closed_0, reoffered_0, phase_0, token_0) {
  if (phase_0.$ === "Reserved") {
    const own_token_0 = phase_0.token;
    const surface_0 = phase_0.surface;
    return run_jump($Handoff$lease$authorize$match$, [item_0, round_0, closed_0, reoffered_0, own_token_0, surface_0, run_loop($Nat$is_eq$(own_token_0, token_0))]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$release$phase$(item_0, round_0, closed_0, reoffered_0, phase_0, token_0) {
  if (phase_0.$ === "Reserved") {
    const own_token_0 = phase_0.token;
    const surface_0 = phase_0.surface;
    return run_jump($Handoff$lease$release$match$, [item_0, round_0, closed_0, reoffered_0, own_token_0, surface_0, run_loop($Nat$is_eq$(own_token_0, token_0))]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$terminal$phase$(item_0, round_0, closed_0, reoffered_0, phase_0, token_0, certain_0) {
  if (phase_0.$ === "Authorized") {
    const own_token_0 = phase_0.token;
    const surface_0 = phase_0.surface;
    return run_jump($Handoff$lease$terminal$match$, [item_0, round_0, closed_0, reoffered_0, own_token_0, surface_0, run_loop($Nat$is_eq$(own_token_0, token_0)), certain_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$reoffer$phase$(item_0, round_0, closed_0, reoffered_0, phase_0, token_0) {
  if (phase_0.$ === "Submitted") {
    const surface_0 = phase_0.surface;
    return run_jump($Handoff$lease$reoffer$surface$, [item_0, round_0, closed_0, reoffered_0, surface_0, false, token_0]);
  } else if (phase_0.$ === "Uncertain") {
    const surface_1 = phase_0.surface;
    return run_jump($Handoff$lease$reoffer$surface$, [item_0, round_0, closed_0, reoffered_0, surface_1, true, token_0]);
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: phase_0}};
  }
}

function $Handoff$lease$offer$background$(state_0, round_0, token_0, surface_0, fresh_0) {
  if (surface_0.$ === "Stop") {
    return run_jump($Handoff$lease$reoffer$, [state_0, round_0, token_0, fresh_0]);
  } else {
    return run_jump($Handoff$lease$reserve$, [state_0, round_0, token_0, surface_0]);
  }
}

function $Handoff$lease$suppress_surface$(own_0, requested_0) {
  if (own_0.$ === "Background") {
    if (requested_0.$ === "Stop") {
      return false;
    } else {
      return true;
    }
  } else {
    return true;
  }
}

function $Notice$bounded_add$(left_0, right_0, maximum_0) {
  return run_jump($Notice$bounded_add$result$, [left_0, right_0, maximum_0, run_loop($Nat$is_gt$(right_0, (maximum_0 < left_0 ? 0n : maximum_0 - left_0)))]);
}

function $Notice$refresh$(pending_0, leased_0, suppressed_0, maximum_0) {
  if (pending_0.$ === "None") {
    return {$: "CreatePending", ["count"]: suppressed_0};
  } else {
    const count_0 = pending_0.value;
    return run_jump($Notice$refresh$leased$, [count_0, suppressed_0, maximum_0, leased_0]);
  }
}

function $Lifecycle$cutoff$granted$(round_0, result_0) {
  const work_0 = result_0.state;
  const source_0 = result_0.cancelled_source;
  const jev_0 = result_0.cancelled_jev;
  return {$: "CutoffGranted", ["round"]: round_0, ["work"]: work_0, ["cancelled_source"]: source_0, ["cancelled_jev"]: jev_0};
}

function $Lifecycle$selected_count$(unit_0, selected_0) {
  if (selected_0.$ === "Nil") {
    return 0n;
  } else {
    const head_0 = selected_0.head;
    const rest_0 = selected_0.tail;
    const x_0 = run_loop($Bool$pick$(run_loop($Nat$is_eq$(head_0, unit_0)), 1n, 0n));
    const x_1 = run_loop($Lifecycle$selected_count$(unit_0, rest_0));
    return nat_chk(x_0 + x_1);
  }
}

function $Lifecycle$finish_disposition$valid$(work_0, selected_0, has_notice_0, pass_notices_0, deadline_reached_0) {
  if (selected_0.$ === "Nil") {
    return run_jump($Lifecycle$finish_disposition$empty$, [has_notice_0, pass_notices_0, deadline_reached_0]);
  } else {
    return run_jump($Lifecycle$finish_disposition$selected$, [work_0, selected_0, true]);
  }
}

function $Lifecycle$finish_output$reserve$(round_0, work_0, token_0, selected_0) {
  return run_jump($Lifecycle$finish_output$reservation$, [round_0, work_0, token_0, selected_0, run_loop($Lifecycle$selection_reserve$(work_0, selected_0))]);
}

function $Ticket$is_preparing$(state_0) {
  if (state_0.$ === "Preparing") {
    const __0 = state_0.failure;
    return true;
  } else {
    return false;
  }
}

function $Ticket$terminal$phase$(state_0, failure_0, finding_units_0, undelivered_0, total_0) {
  if (state_0.$ === "Failed") {
    const reason_0 = state_0.reason;
    return {$: "Unavailable", ["reason"]: reason_0};
  } else {
    return run_jump($Ticket$terminal$unit$, [failure_0, finding_units_0, undelivered_0, total_0]);
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

function $Admission$remove_permit$pick$(permit_0, tail_0, hit_0) {
  if (hit_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: permit_0, ["tail"]: tail_0};
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

function $Work$start_observation$(id_0, observations_0) {
  if (observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = observations_0.head;
    const current_0 = _t_0.id;
    const __0 = _t_0.stage;
    const rest_0 = observations_0.tail;
    return run_jump($Work$start_observation$pick$, [{$: "Observation", ["id"]: current_0, ["stage"]: __0}, run_loop($Work$start_observation$(id_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Work$start_unit$apply$(work_0, id_0, observation_0) {
  return run_jump($Work$outcome$apply$, [work_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: {$: "AtJev"}, ["findings"]: 0n, ["bytes"]: 0n}]);
}

function $Work$spawn$apply$(work_0, observation_0, count_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  const new_units_0 = run_loop($Work$make_units$(count_0, observation_0, next_unit_0));
  return {$: "Accepted", ["state"]: run_loop($Work$settle$({$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: nat_chk(next_unit_0 + count_0), ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: run_loop($List$append$(units_0, new_units_0))})), ["admitted"]: run_loop($Work$unit_ids$(new_units_0))};
}

function $Work$prepare$count$(work_0, observation_0, count_0, within_limit_0) {
  if (!within_limit_0) {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "TooManyUnits"}};
  } else {
    return run_jump($Work$prepare$apply$, [work_0, observation_0, count_0]);
  }
}

function $Work$cached_finding$apply$(work_0, observation_0, count_0, bytes_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Accepted", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: nat_chk(next_unit_0 + 1n), ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: run_loop($List$append$(units_0, {$: "Con", ["head"]: {$: "ReviewUnit", ["id"]: next_unit_0, ["observation"]: observation_0, ["stage"]: {$: "PendingFinding"}, ["findings"]: count_0, ["bytes"]: bytes_0}, ["tail"]: {$: "Nil"}}))}, ["admitted"]: {$: "Con", ["head"]: next_unit_0, ["tail"]: {$: "Nil"}}};
}

function $Work$revise_finding$valid$(work_0, id_0, observation_0, count_0, bytes_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: work_0, ["reason"]: {$: "InvalidFinding"}};
  } else {
    return run_jump($Work$outcome$apply$, [work_0, {$: "ReviewUnit", ["id"]: id_0, ["observation"]: observation_0, ["stage"]: {$: "PendingFinding"}, ["findings"]: count_0, ["bytes"]: bytes_0}]);
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

function $Work$remove_observation$pick$(observation_0, tail_0, hit_0) {
  if (hit_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: observation_0, ["tail"]: tail_0};
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

function $Work$retire$apply$(work_0, id_0) {
  const next_observation_0 = work_0.next_observation;
  const next_unit_0 = work_0.next_unit;
  const source_capacity_0 = work_0.source_capacity;
  const review_capacity_0 = work_0.review_capacity;
  const observations_0 = work_0.observations;
  const units_0 = work_0.units;
  return {$: "Accepted", ["state"]: {$: "Work", ["next_observation"]: next_observation_0, ["next_unit"]: next_unit_0, ["source_capacity"]: source_capacity_0, ["review_capacity"]: review_capacity_0, ["observations"]: observations_0, ["units"]: run_loop($Work$remove_unit$(id_0, units_0))}, ["admitted"]: {$: "Nil"}};
}

function $Handoff$select$valid$(state_0, id_0, prospective_bytes_0, solo_bytes_0, count_0, valid_0) {
  if (valid_0) {
    return run_jump($Handoff$select$solo$, [state_0, id_0, prospective_bytes_0, count_0, run_loop($Nat$is_gt$(solo_bytes_0, BigInt(2048)))]);
  } else {
    return {$: "Expired", ["state"]: state_0};
  }
}

function $Handoff$finish$ready$(state_0, unfinished_0, deadline_0, actionable_findings_0) {
  if (deadline_0) {
    return run_jump($Handoff$finish$choose$, [state_0, actionable_findings_0]);
  } else {
    return run_jump($Handoff$finish$zero$, [state_0, actionable_findings_0, run_loop($Nat$is_eq$(unfinished_0, 0n))]);
  }
}

function $Handoff$lease$authorize$match$(item_0, round_0, closed_0, reoffered_0, own_token_0, surface_0, same_0) {
  if (same_0) {
    return {$: "Granted", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Authorized", ["token"]: own_token_0, ["surface"]: surface_0}}};
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Reserved", ["token"]: own_token_0, ["surface"]: surface_0}}};
  }
}

function $Handoff$lease$release$match$(item_0, round_0, closed_0, reoffered_0, own_token_0, surface_0, same_0) {
  if (same_0) {
    return {$: "Granted", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Available"}}};
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Reserved", ["token"]: own_token_0, ["surface"]: surface_0}}};
  }
}

function $Handoff$lease$terminal$match$(item_0, round_0, closed_0, reoffered_0, own_token_0, surface_0, same_0, certain_0) {
  if (same_0) {
    if (certain_0) {
      return {$: "Granted", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Submitted", ["surface"]: surface_0}}};
    } else {
      return {$: "Granted", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Uncertain", ["surface"]: surface_0}}};
    }
  } else {
    return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Authorized", ["token"]: own_token_0, ["surface"]: surface_0}}};
  }
}

function $Handoff$lease$reoffer$surface$(item_0, round_0, closed_0, reoffered_0, surface_0, uncertain_0, token_0) {
  if (surface_0.$ === "Edit") {
    if (uncertain_0) {
      return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Uncertain", ["surface"]: {$: "Edit"}}}};
    } else {
      return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Submitted", ["surface"]: {$: "Edit"}}}};
    }
  } else if (surface_0.$ === "Background") {
    return {$: "Granted", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: true, ["phase"]: {$: "Reserved", ["token"]: token_0, ["surface"]: {$: "Stop"}}}};
  } else {
    if (uncertain_0) {
      return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Uncertain", ["surface"]: {$: "Stop"}}}};
    } else {
      return {$: "Denied", ["state"]: {$: "Lease", ["item"]: item_0, ["round"]: round_0, ["closed"]: closed_0, ["reoffered"]: reoffered_0, ["phase"]: {$: "Submitted", ["surface"]: {$: "Stop"}}}};
    }
  }
}

function $Notice$bounded_add$result$(left_0, right_0, maximum_0, over_0) {
  if (over_0) {
    return maximum_0;
  } else {
    return nat_chk(left_0 + right_0);
  }
}

function $Notice$refresh$leased$(count_0, suppressed_0, maximum_0, leased_0) {
  if (leased_0) {
    return {$: "KeepLeased"};
  } else {
    return {$: "MergePending", ["count"]: run_loop($Notice$bounded_add$(count_0, suppressed_0, maximum_0))};
  }
}

function $Lifecycle$finish_disposition$selected$(work_0, selected_0, binding_valid_0) {
  return run_jump($Bool$pick$, [run_loop($Bool$and$(binding_valid_0, run_loop($Bool$and$(run_loop($Nat$is_le$(run_loop($List$length$(selected_0)), 5n)), run_loop($Lifecycle$selected_valid$(work_0, selected_0, selected_0)))))), {$: "ReserveFindings"}, {$: "AllowUnavailable"}]);
}

function $Lifecycle$finish_output$reservation$(round_0, work_0, token_0, selected_0, reservation_0) {
  if (reservation_0.$ === "SelectionReserved") {
    const selection_0 = reservation_0.state;
    return run_jump($Lifecycle$finish_output$slot$, [selection_0, run_loop($Lifecycle$reserve_selected$(round_0, work_0, token_0, selected_0))]);
  } else {
    return {$: "OutputAllowed", ["reason"]: {$: "AllowUnavailable"}};
  }
}

function $Ticket$terminal$unit$(failure_0, finding_units_0, undelivered_0, total_0) {
  if (failure_0.$ === "Some") {
    const reason_0 = failure_0.value;
    return {$: "Unavailable", ["reason"]: reason_0};
  } else {
    return run_jump($Ticket$terminal$findings$, [finding_units_0, undelivered_0, total_0]);
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

function $Admission$close_round$active$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, used_0, at_0) {
  if (!active_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "RoundAlreadyClosed"}};
  } else {
    return run_jump($Admission$close_round$time$, [state_0, partition_0, lifetime_0, round_0, next_token_0, used_0, at_0, run_loop($Nat$is_ge$(at_0, closed_at_0))]);
  }
}

function $Admission$restart$fresh$(state_0, partition_0, lifetime_0, closed_at_0, new_lifetime_0, at_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "LifetimeNotFresh"}};
  } else {
    return {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: new_lifetime_0, ["round"]: 0n, ["active"]: false, ["closed_at"]: at_0, ["next_token"]: 1n, ["permits"]: {$: "Nil"}, ["used"]: {$: "Nil"}}, ["token"]: {$: "None"}, ["round"]: {$: "None"}};
  }
}

function $Work$start_observation$pick$(observation_0, tail_0, hit_0) {
  if (hit_0) {
    return run_jump($Work$start_observation$read$, [observation_0, tail_0]);
  } else {
    return {$: "Con", ["head"]: observation_0, ["tail"]: tail_0};
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

function $Work$remove_unit$(id_0, units_0) {
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
    return run_jump($Work$remove_unit$pick$, [{$: "ReviewUnit", ["id"]: current_0, ["observation"]: __0, ["stage"]: __1, ["findings"]: __2, ["bytes"]: __3}, run_loop($Work$remove_unit$(id_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Handoff$select$solo$(state_0, id_0, prospective_bytes_0, count_0, oversized_0) {
  if (oversized_0) {
    return run_jump($Handoff$select$limit$, [state_0, id_0]);
  } else {
    return run_jump($Handoff$select$fit$, [state_0, id_0, prospective_bytes_0, run_loop($Handoff$fits_batch$(nat_chk(count_0 + 1n), prospective_bytes_0))]);
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

function $Lifecycle$finish_output$slot$(selection_0, step_0) {
  if (step_0.$ === "Granted") {
    const round_0 = step_0.state;
    return {$: "OutputReserved", ["round"]: round_0, ["selection"]: selection_0};
  } else {
    const __0 = step_0.state;
    return {$: "OutputAllowed", ["reason"]: {$: "AllowUnavailable"}};
  }
}

function $Ticket$terminal$findings$(finding_units_0, undelivered_0, total_0) {
  return run_jump($Bool$pick$, [run_loop($Nat$is_gt$(finding_units_0, 0n)), run_loop($Bool$pick$(run_loop($Nat$is_eq$(undelivered_0, 0n)), {$: "Delivered"}, {$: "Unavailable", ["reason"]: {$: "Lost"}})), run_loop($Bool$pick$(run_loop($Nat$is_gt$(total_0, 0n)), {$: "Clear"}, {$: "NoWork"}))]);
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

function $Admission$close_round$time$(state_0, partition_0, lifetime_0, round_0, next_token_0, used_0, at_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "InvalidClock"}};
  } else {
    return {$: "Accepted", ["state"]: {$: "AdmissionState", ["partition"]: partition_0, ["lifetime"]: lifetime_0, ["round"]: round_0, ["active"]: false, ["closed_at"]: at_0, ["next_token"]: next_token_0, ["permits"]: {$: "Nil"}, ["used"]: used_0}, ["token"]: {$: "None"}, ["round"]: {$: "Some", ["value"]: round_0}};
  }
}

function $Work$start_observation$read$(observation_0, tail_0) {
  const id_0 = observation_0.id;
  const __0 = observation_0.stage;
  return {$: "Con", ["head"]: {$: "Observation", ["id"]: id_0, ["stage"]: {$: "SourceReading"}}, ["tail"]: tail_0};
}

function $Work$replace_unit$pick$(unit_0, replacement_0, tail_0, hit_0) {
  if (hit_0) {
    return {$: "Con", ["head"]: replacement_0, ["tail"]: tail_0};
  } else {
    return {$: "Con", ["head"]: unit_0, ["tail"]: tail_0};
  }
}

function $Work$remove_unit$pick$(unit_0, tail_0, hit_0) {
  if (hit_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: unit_0, ["tail"]: tail_0};
  }
}

function $Handoff$select$limit$(state_0, id_0) {
  const partition_0 = state_0.partition;
  const round_0 = state_0.round;
  const selected_0 = state_0.selected;
  const retained_0 = state_0.retained;
  const count_0 = state_0.findings;
  const bytes_0 = state_0.bytes;
  return {$: "Limited", ["state"]: {$: "Selection", ["partition"]: partition_0, ["round"]: round_0, ["selected"]: selected_0, ["retained"]: run_loop($List$append$(retained_0, {$: "Con", ["head"]: id_0, ["tail"]: {$: "Nil"}})), ["findings"]: count_0, ["bytes"]: bytes_0}, ["id"]: id_0};
}

function $Handoff$select$fit$(state_0, id_0, prospective_bytes_0, fits_0) {
  const partition_0 = state_0.partition;
  const round_0 = state_0.round;
  const selected_0 = state_0.selected;
  const retained_0 = state_0.retained;
  const count_0 = state_0.findings;
  const bytes_0 = state_0.bytes;
  if (fits_0) {
    return {$: "Selected", ["state"]: {$: "Selection", ["partition"]: partition_0, ["round"]: round_0, ["selected"]: run_loop($List$append$(selected_0, {$: "Con", ["head"]: id_0, ["tail"]: {$: "Nil"}})), ["retained"]: retained_0, ["findings"]: nat_chk(count_0 + 1n), ["bytes"]: prospective_bytes_0}};
  } else {
    return {$: "Retained", ["state"]: {$: "Selection", ["partition"]: partition_0, ["round"]: round_0, ["selected"]: selected_0, ["retained"]: run_loop($List$append$(retained_0, {$: "Con", ["head"]: id_0, ["tail"]: {$: "Nil"}})), ["findings"]: count_0, ["bytes"]: bytes_0}};
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

function $Admission$consume$tool$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, tool_0, now_0, permitted_round_0, started_0, deadline_0, correct_tool_0) {
  if (!correct_tool_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "WrongTool"}};
  } else {
    return run_jump($Admission$consume$time$, [state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, now_0, permitted_round_0, run_loop($Bool$and$(run_loop($Nat$is_gt$(started_0, closed_at_0)), run_loop($Bool$and$(run_loop($Nat$is_le$(started_0, now_0)), run_loop($Nat$is_le$(now_0, deadline_0))))))]);
  }
}

function $Admission$consume$time$(state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, now_0, permitted_round_0, valid_0) {
  if (!valid_0) {
    return {$: "Rejected", ["state"]: state_0, ["reason"]: {$: "Expired"}};
  } else {
    return run_jump($Admission$consume$round$, [state_0, partition_0, lifetime_0, round_0, active_0, closed_at_0, next_token_0, permits_0, used_0, token_0, permitted_round_0, run_loop($Nat$is_eq$(permitted_round_0, run_loop($Admission$candidate_round$(round_0, active_0))))]);
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
export const bendAdmissionCloseProspective = (state, at) =>
  run_loop($Admission$close_prospective$(state, nat(at)));
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
export const bendDeliveryLegacyStopAllowed = (round) =>
  run_loop($Delivery$legacy_stop_allowed$(normalize(round)));
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
export const bendDeliveryFinalCredentialGate = (legacyCollect, invalidSeen) =>
  run_loop($Delivery$final_credential_gate$(legacyCollect, invalidSeen));
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
export const bendTicketInitial = () => run_loop($Ticket$initial$());
export const bendTicketFail = (phase, reason) =>
  run_loop($Ticket$fail$(phase, normalize(reason)));
export const bendTicketClose = (phase) => run_loop($Ticket$close$(phase));
export const bendTicketTerminal = (phase, facts) =>
  run_loop($Ticket$terminal$(phase, normalize(facts)));
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
