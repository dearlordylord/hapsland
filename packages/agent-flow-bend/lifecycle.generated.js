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
  return {$: a < b ? "LT" : a === b ? "EQ" : "GT"};
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

function nat_in(n) {
  if (!Number.isInteger(n) || n < 0 || n > 2 ** 53) {
    throw "bend: expected a Nat host number: an integer from 0 to 2^53";
  }
  return n;
}

function f32_show(x) {
  let s = "nan";
  for (let p = 1; x === x && p <= 9 && f32_round(s) !== x; p += 1) {
    s = String(Number(x.toExponential(p - 1)));
  }
  return (Object.is(x, -0) ? "-0" : s).replace("Infinity", "inf");
}

function f32_bits(x) {
  return new Uint32Array(new Float32Array([x]).buffer)[0];
}

function f32_from_bits(u) {
  return new Float32Array(new Uint32Array([u]).buffer)[0];
}

function f32_read(s) {
  const re = /^[\t\n\v\f\r ]*[+-]?((\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?|inf(inity)?|nan)$/i;
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

const char_new = function char_new(c) {
  return c < 55296 || c >= 57344 && c <= 1114111 ? String.fromCodePoint(c) : String.fromCharCode(56320, c >>> 22, c >>> 11 & 2047, c & 2047);
};

function char_len(s, at = 0) {
  return s[at] === "\uDC00" ? 4 : s.codePointAt(at) > 0xFFFF ? 2 : 1;
}

function char_code(s) {
  return s.length < 4 ? s.codePointAt(0)
    : (s.charCodeAt(1) << 22 | s.charCodeAt(2) << 11 | s.charCodeAt(3)) >>> 0;
}

function string_contains(s, p) {
  // A match must start at a Char boundary, not inside a packed U32 code.
  for (let at = 0; at <= s.length; at += char_len(s, at)) {
    if (s.startsWith(p, at)) {
      return true;
    }
  }
  return false;
}

function str_out(s) {
  return s.replace(/\uDC00[^]{3}/gu, "\uFFFD");
}

function str_in(s) {
  return s.replace(/\p{Cs}/gu, "\uFFFD");
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
  return {$: "$JMP", f: f.j?.f === f ? f.j : f, x};
}

function run_clo(j) {
  const f = (x) => run_loop(j(x));
  f.j = j;
  j.f = f;
  return f;
}

function run_loop(r) {
  while (r !== null && typeof r === "object" && r.$ === "$JMP") {
    r = r.f(r.x);
  }
  return r;
}

function run_lib(f, n) {
  return (...a) => a.length < n ? run_lib((...b) => f(...a, ...b), n - a.length)
    : run_loop(f(...a));
}

// Effect
// ======

const $0eff = Object.create(null);

function io_eff(k, run) {
  if (arguments.length > 2) {
    throw new Error("bend: " + k + " takes no need: an effect that waits parks itself");
  }
  if (k in $0eff) {
    throw new Error("bend: two effects register " + k);
  }
  $0eff[k] = run;
}
// Program
// =======

function $Admission_prospective_gate_ordered(_clock_valid_0, _within_0) {
  if (!_within_0) {
    return {$: "Admission.PermitLate"};
  } else {
    return $Bool_pick(_clock_valid_0, {$: "Admission.PermitAllowed"}, {$: "Admission.PermitDenied"});
  }
}

function $Admission_prospective_gate_window(_facts_0, _within_0, _ordered_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  if (!_ordered_0) {
    return {$: "Admission.PermitInvalidClock"};
  } else {
    return $Admission_prospective_gate_ordered(_clock_valid_0, _within_0);
  }
}

function $Admission_prospective_gate(_facts_0, _started_0, _now_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  const _hook_window_0 = _facts_0["hook_window"];
  const _started_upper_0 = _facts_0["started_upper"];
  const _now_lower_0 = _facts_0["now_lower"];
  const _advicee_permit_limit_0 = _facts_0["advicee_permit_limit"];
  const _resident_permit_limit_0 = _facts_0["resident_permit_limit"];
  const _x_0 = nat_chk(_started_0 + _hook_window_0);
  return $Admission_prospective_gate_window({$: "Admission.ProspectiveFacts", "clock_valid": _clock_valid_0, "hook_window": _hook_window_0, "started_upper": _started_upper_0, "now_lower": _now_lower_0, "advicee_permit_limit": _advicee_permit_limit_0, "resident_permit_limit": _resident_permit_limit_0}, (_now_0 < _x_0), ($Nat_is_le(_started_upper_0, _now_lower_0)));
}

function $Admission_pending_count(_state_0) {
  const _permits_0 = _state_0["permits"];
  return $List_length(_permits_0);
}

function $Admission_initial(_partition_0, _lifetime_0) {
  return {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": 0, "active": false, "closed_at": 0, "next_token": 1, "permits": {$: "Nil"}};
}

function $Admission_has_tool(_tool_0, _permits_0) {
  if (_permits_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _permits_0["head"];
    const _current_0 = _t_0["tool"];
    const _rest_0 = _permits_0["tail"];
    const _x_0 = ($Nat_is_eq(_tool_0, _current_0));
    const _x_1 = ($Admission_has_tool(_tool_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $Admission_find_permit(_token_0, _permits_0) {
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
    return $Bool_pick(($Nat_is_eq(_current_0, _token_0)), {$: "Some", "value": {$: "Admission.Permit", "token": _current_0, "tool": __0, "round": __1, "started": __2, "deadline": __3}}, ($Admission_find_permit(_token_0, _rest_0)));
  }
}

function $Admission_remove_permit(_token_0, _permits_0) {
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
    return $List_filter_put({$: "Admission.Permit", "token": _current_0, "tool": __0, "round": __1, "started": __2, "deadline": __3}, ($Admission_remove_permit(_token_0, _rest_0)), ($Bool_not(($Nat_is_eq(_current_0, _token_0)))));
  }
}

function $Admission_candidate_round(_round_0, _active_0) {
  if (_active_0) {
    return _round_0;
  } else {
    return nat_chk(_round_0 + 1);
  }
}

function $Admission_issue_tool(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _duplicate_0) {
  if (_duplicate_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.DuplicateTool"}};
  } else {
    const _expected_round_0 = ($Admission_candidate_round(_round_0, _active_0));
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": nat_chk(_next_token_0 + 1), "permits": ($List_append(_permits_0, {$: "Con", "head": {$: "Admission.Permit", "token": _next_token_0, "tool": _tool_0, "round": _expected_round_0, "started": _started_0, "deadline": _deadline_0}, "tail": {$: "Nil"}}))}, "token": {$: "Some", "value": _next_token_0}, "round": {$: "Some", "value": _expected_round_0}};
  }
}

function $Admission_issue_guard(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _now_0, _clock_valid_0) {
  if (!_clock_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.StaleInvocation"}};
  } else {
    return $Admission_issue_tool(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, ($Admission_has_tool(_tool_0, _permits_0)));
  }
}

function $Admission_issue(_state_0, _tool_0, _started_0, _deadline_0, _now_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission_issue_guard({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _now_0, ($Bool_and(($Nat_is_gt(_started_0, _closed_at_0)), ($Bool_and(($Nat_is_le(_started_0, _now_0)), ($Nat_is_le(_now_0, _deadline_0)))))));
}

function $Admission_consume_round(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, _correct_round_0) {
  if (!_correct_round_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.OldRound"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _permitted_round_0, "active": true, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission_remove_permit(_token_0, _permits_0))}, "token": {$: "Some", "value": _token_0}, "round": {$: "Some", "value": _permitted_round_0}};
  }
}

function $Admission_consume_time(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.Expired"}};
  } else {
    return $Admission_consume_round(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, ($Nat_is_eq(_permitted_round_0, ($Admission_candidate_round(_round_0, _active_0)))));
  }
}

function $Admission_consume_tool(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, _correct_tool_0) {
  if (!_correct_tool_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongTool"}};
  } else {
    return $Admission_consume_time(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, ($Bool_and(($Nat_is_gt(_started_0, _closed_at_0)), ($Bool_and(($Nat_is_le(_started_0, _now_0)), ($Nat_is_le(_now_0, _deadline_0)))))));
  }
}

function $Admission_consume_check(_state_0, _token_0, _tool_0, _now_0, _permitted_tool_0, _permitted_round_0, _started_0, _deadline_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission_consume_tool({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, ($Nat_is_eq(_tool_0, _permitted_tool_0)));
}

function $Admission_consume_found(_state_0, _token_0, _tool_0, _now_0, _permit_0) {
  if (_permit_0.$ === "None") {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.NoPermit"}};
  } else {
    const _t_0 = _permit_0["value"];
    const _permitted_tool_0 = _t_0["tool"];
    const _permitted_round_0 = _t_0["round"];
    const _started_0 = _t_0["started"];
    const _deadline_0 = _t_0["deadline"];
    return $Admission_consume_check(_state_0, _token_0, _tool_0, _now_0, _permitted_tool_0, _permitted_round_0, _started_0, _deadline_0);
  }
}

function $Admission_consume(_state_0, _token_0, _tool_0, _now_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission_consume_found({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0}, _token_0, _tool_0, _now_0, ($Admission_find_permit(_token_0, _permits_0)));
}

function $Admission_release_found(_state_0, _token_0, _found_0) {
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
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission_remove_permit(_token_0, _permits_0))}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $Admission_release(_state_0, _token_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission_release_found({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0}, _token_0, ($Admission_find_permit(_token_0, _permits_0)));
}

function $Admission_expire_due(_state_0, _token_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return {$: "Admission.RemovePermit", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($Admission_remove_permit(_token_0, _permits_0))}};
}

function $Admission_expire(_state_0, _token_0, _deadline_reached_0) {
  if (!_deadline_reached_0) {
    return {$: "Admission.KeepPermit", "state": _state_0};
  } else {
    return $Admission_expire_due(_state_0, _token_0);
  }
}

function $Admission_close_round_time(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.InvalidClock"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "Some", "value": _round_0}};
  }
}

function $Admission_close_round_active(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _at_0) {
  if (!_active_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.RoundAlreadyClosed"}};
  } else {
    return $Admission_close_round_time(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, ($Nat_is_ge(_at_0, _closed_at_0)));
  }
}

function $Admission_close_round(_state_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $Admission_close_round_active({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _at_0);
}

function $Admission_restart_fresh(_state_0, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.LifetimeNotFresh"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _new_lifetime_0, "round": 0, "active": false, "closed_at": _at_0, "next_token": 1, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $Admission_restart(_state_0, _new_lifetime_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const __2 = _state_0["next_token"];
  const __3 = _state_0["permits"];
  return $Admission_restart_fresh({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": __0, "active": __1, "closed_at": _closed_at_0, "next_token": __2, "permits": __3}, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, ($Bool_and(($Nat_is_gt(_new_lifetime_0, _lifetime_0)), ($Nat_is_ge(_at_0, _closed_at_0)))));
}

function $Admission_callback_current(_state_0, _partition_0, _lifetime_0, _round_0) {
  const _owner_0 = _state_0["partition"];
  const _live_0 = _state_0["lifetime"];
  const _current_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  return $Bool_and(_active_0, ($Bool_and(($Nat_is_eq(_owner_0, _partition_0)), ($Bool_and(($Nat_is_eq(_live_0, _lifetime_0)), ($Nat_is_eq(_current_0, _round_0)))))));
}

function $Admission_apply_event(_state_0, _event_0) {
  if (_event_0.$ === "Admission.Issue") {
    const _tool_0 = _event_0["tool"];
    const _started_0 = _event_0["started"];
    const _deadline_0 = _event_0["deadline"];
    const _now_0 = _event_0["now"];
    return $Admission_issue(_state_0, _tool_0, _started_0, _deadline_0, _now_0);
  } else if (_event_0.$ === "Admission.Consume") {
    const _token_0 = _event_0["token"];
    const _tool_1 = _event_0["tool"];
    const _now_1 = _event_0["now"];
    return $Admission_consume(_state_0, _token_0, _tool_1, _now_1);
  } else if (_event_0.$ === "Admission.Release") {
    const _token_1 = _event_0["token"];
    return $Admission_release(_state_0, _token_1);
  } else if (_event_0.$ === "Admission.CloseRound") {
    const _at_0 = _event_0["at"];
    return $Admission_close_round(_state_0, _at_0);
  } else {
    const _new_lifetime_0 = _event_0["new_lifetime"];
    const _at_1 = _event_0["at"];
    return $Admission_restart(_state_0, _new_lifetime_0, _at_1);
  }
}

function $Admission_step_partition(_state_0, _partition_0, _lifetime_0, _event_0, _correct_partition_0, _correct_lifetime_0) {
  if (!_correct_partition_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongPartition"}};
  } else {
    if (!_correct_lifetime_0) {
      return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongLifetime"}};
    } else {
      return $Admission_apply_event(_state_0, _event_0);
    }
  }
}

function $Admission_step(_state_0, _partition_0, _lifetime_0, _event_0) {
  const _owner_0 = _state_0["partition"];
  const _live_0 = _state_0["lifetime"];
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed_at"];
  const __3 = _state_0["next_token"];
  const __4 = _state_0["permits"];
  return $Admission_step_partition({$: "Admission.AdmissionState", "partition": _owner_0, "lifetime": _live_0, "round": __0, "active": __1, "closed_at": __2, "next_token": __3, "permits": __4}, _partition_0, _lifetime_0, _event_0, ($Nat_is_eq(_owner_0, _partition_0)), ($Nat_is_eq(_live_0, _lifetime_0)));
}

function $Admission_main() {
  return $Admission_step(($Admission_initial(7, 3)), 7, 3, {$: "Admission.Issue", "tool": 42, "started": 10, "deadline": 20, "now": 11});
}

function $Flow_capacity_valid(_capacity_0) {
  const _low_0 = _capacity_0["low"];
  const _high_0 = _capacity_0["high"];
  const _x_0 = ($Nat_is_gt(_high_0, 0));
  const _x_1 = ($Nat_is_gt(_low_0, 0));
  return (_x_0 || _x_1);
}

function $Flow_has_room(_occupied_0, _capacity_0) {
  const _low_0 = _capacity_0["low"];
  const _high_0 = _capacity_0["high"];
  const _x_0 = ($Nat_is_gt(_high_0, 0));
  const _x_1 = (_occupied_0 < _low_0);
  return (_x_0 || _x_1);
}

function $Flow_route_of(_event_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.AgentEditNode"}, "to": {$: "Flow.EditQueueNode"}, "input": {$: "Flow.EditObservation"}, "output": {$: "Flow.CaptureJob"}, "copy": false};
  } else if (_event_0.$ === "Flow.IngressStarted") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.EditQueueNode"}, "to": {$: "Flow.PreparationNode"}, "input": {$: "Flow.CaptureJob"}, "output": {$: "Flow.CaptureJob"}, "copy": false};
  } else if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.PreparationNode"}, "to": {$: "Flow.ReviewQueueNode"}, "input": {$: "Flow.CaptureJob"}, "output": {$: "Flow.ReviewWorkItem"}, "copy": false};
  } else if (_event_0.$ === "Flow.UnitDispatched") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.ReviewQueueNode"}, "to": {$: "Flow.JevDispatchNode"}, "input": {$: "Flow.ReviewWorkItem"}, "output": {$: "Flow.DecisionRequest"}, "copy": false};
  } else if (_event_0.$ === "Flow.ReviewServiceRequestSent") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.JevDispatchNode"}, "to": {$: "Flow.JevNode"}, "input": {$: "Flow.DecisionRequest"}, "output": {$: "Flow.NetworkRequest"}, "copy": false};
  } else if (_event_0.$ === "Flow.JevFindingReceived") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.JevNode"}, "to": {$: "Flow.AdviceStoreNode"}, "input": {$: "Flow.NetworkRequest"}, "output": {$: "Flow.Advice"}, "copy": false};
  } else if (_event_0.$ === "Flow.JevClearReceived") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.JevNode"}, "to": {$: "Flow.OutcomeStoreNode"}, "input": {$: "Flow.NetworkRequest"}, "output": {$: "Flow.ReviewStatus"}, "copy": false};
  } else if (_event_0.$ === "Flow.JevUnavailable") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.JevNode"}, "to": {$: "Flow.OutcomeStoreNode"}, "input": {$: "Flow.NetworkRequest"}, "output": {$: "Flow.ReviewStatus"}, "copy": false};
  } else if (_event_0.$ === "Flow.BackgroundWaitStarted") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.AgentEditNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "signal": {$: "Flow.BackgroundSignal"}};
  } else if (_event_0.$ === "Flow.StopHookFired") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.AgentEditNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "signal": {$: "Flow.StopSignal"}};
  } else if (_event_0.$ === "Flow.FinishDecisionAllWorkSettled") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.DeliveryStateNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "signal": {$: "Flow.SettledSignal"}};
  } else if (_event_0.$ === "Flow.FinishDecisionDeadlineReached") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.DeliveryStateNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "signal": {$: "Flow.DeadlineSignal"}};
  } else if (_event_0.$ === "Flow.FinishDecisionBudgetExhausted") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.DeliveryStateNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "signal": {$: "Flow.AllowSignal"}};
  } else if (_event_0.$ === "Flow.AdviceLeasedByBackground") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.AdviceStoreNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "input": {$: "Flow.Advice"}, "output": {$: "Flow.LeasedBatch"}, "copy": true};
  } else if (_event_0.$ === "Flow.AdviceLeasedByStop") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.AdviceStoreNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "input": {$: "Flow.Advice"}, "output": {$: "Flow.LeasedBatch"}, "copy": true};
  } else if (_event_0.$ === "Flow.AdviceReofferedAtStop") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.AdviceStoreNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "input": {$: "Flow.Advice"}, "output": {$: "Flow.LeasedBatch"}, "copy": true};
  } else if (_event_0.$ === "Flow.HostOutputSubmitted") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.AdvicePolicyNode"}, "to": {$: "Flow.ObservedWriteNode"}, "input": {$: "Flow.LeasedBatch"}, "output": {$: "Flow.RuntimeSubmission"}, "copy": false};
  } else if (_event_0.$ === "Flow.StopAllowed") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.AdvicePolicyNode"}, "to": {$: "Flow.DeliveryStateNode"}, "signal": {$: "Flow.AllowSignal"}};
  } else if (_event_0.$ === "Flow.FinishResponseRequested") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.AdvicePolicyNode"}, "to": {$: "Flow.ResponseCommandNode"}, "signal": {$: "Flow.ResponseSignal"}};
  } else if (_event_0.$ === "Flow.SourceCapacitySet") {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.AdvicePolicyNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "signal": {$: "Flow.AllowSignal"}};
  } else {
    return {$: "Flow.ControlRoute", "from": {$: "Flow.AdvicePolicyNode"}, "to": {$: "Flow.AdvicePolicyNode"}, "signal": {$: "Flow.AllowSignal"}};
  }
}

function $Flow_initial() {
  return {$: "Flow.Flow", "packets": {$: "Nil"}, "next_id": 1, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "round_id": 0, "active": false, "continuations": 0, "waiting": false, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}};
}

function $Flow_same_place(_a_0, _b_0) {
  if (_a_0.$ === "Flow.EditQueue") {
    if (_b_0.$ === "Flow.EditQueue") {
      return true;
    } else {
      return false;
    }
  } else if (_a_0.$ === "Flow.Preparation") {
    if (_b_0.$ === "Flow.Preparation") {
      return true;
    } else {
      return false;
    }
  } else if (_a_0.$ === "Flow.ReviewQueue") {
    if (_b_0.$ === "Flow.ReviewQueue") {
      return true;
    } else {
      return false;
    }
  } else if (_a_0.$ === "Flow.Jev") {
    if (_b_0.$ === "Flow.Jev") {
      return true;
    } else {
      return false;
    }
  } else if (_a_0.$ === "Flow.AdviceStore") {
    if (_b_0.$ === "Flow.AdviceStore") {
      return true;
    } else {
      return false;
    }
  } else {
    if (_b_0.$ === "Flow.AdvicePolicy") {
      return true;
    } else {
      return false;
    }
  }
}

function $Flow_at(_place_0, _packet_0) {
  const _location_0 = _packet_0["at"];
  return $Flow_same_place(_location_0, _place_0);
}

function $Flow_count(_place_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return 0;
  } else {
    const _p_0 = _packets_0["head"];
    const _rest_0 = _packets_0["tail"];
    const _x_0 = ($Bool_pick(($Flow_at(_place_0, _p_0)), 1, 0));
    const _x_1 = ($Flow_count(_place_0, _rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Flow_ids_pick(_id_0, _rest_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _id_0, "tail": _rest_0};
  } else {
    return _rest_0;
  }
}

function $Flow_ids(_place_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    return $Flow_ids_pick(_id_0, ($Flow_ids(_place_0, _rest_0)), ($Flow_same_place(_location_0, _place_0)));
  }
}

function $Flow_contains(_id_0, _xs_0) {
  if (_xs_0.$ === "Nil") {
    return false;
  } else {
    const _x_0 = _xs_0["head"];
    const _rest_0 = _xs_0["tail"];
    const _x_1 = ($Nat_is_eq(_x_0, _id_0));
    const _x_2 = ($Flow_contains(_id_0, _rest_0));
    return (_x_1 || _x_2);
  }
}

function $Flow_unfinished($0) {
  for (;;) {
    {
      const _packets_0 = $0;
      if (_packets_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _packets_0["head"];
        const _t_1 = _t_0["at"];
        if (_t_1.$ === "Flow.EditQueue") {
          return true;
        } else if (_t_1.$ === "Flow.Preparation") {
          return true;
        } else if (_t_1.$ === "Flow.ReviewQueue") {
          return true;
        } else if (_t_1.$ === "Flow.Jev") {
          return true;
        } else {
          const _rest_4 = _packets_0["tail"];
          $0 = _rest_4;
          continue;
        }
      }
    }
  }
}

function $Flow_find_id_match(_id_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _id_0};
  } else {
    return _fallback_0;
  }
}

function $Flow_find_pick(_id_0, _selected_0, _fallback_0, _same_place_0) {
  if (_selected_0.$ === "None") {
    if (!_same_place_0) {
      return _fallback_0;
    } else {
      return {$: "Some", "value": _id_0};
    }
  } else {
    const _wanted_0 = _selected_0["value"];
    if (!_same_place_0) {
      return _fallback_0;
    } else {
      return $Flow_find_id_match(_id_0, _fallback_0, ($Nat_is_eq(_wanted_0, _id_0)));
    }
  }
}

function $Flow_find(_place_0, _selected_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    return $Flow_find_pick(_id_0, _selected_0, ($Flow_find(_place_0, _selected_0, _rest_0)), ($Flow_same_place(_location_0, _place_0)));
  }
}

function $Flow_move_one_pick(_pid_0, _location_0, _tail_0, _target_0, _copy_0, _hit_0) {
  if (_copy_0) {
    if (_hit_0) {
      return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": ($List_append(_tail_0, {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _target_0}, "tail": {$: "Nil"}}))};
    } else {
      return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": _tail_0};
    }
  } else {
    if (_hit_0) {
      return $List_append(_tail_0, {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _target_0}, "tail": {$: "Nil"}});
    } else {
      return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": _tail_0};
    }
  }
}

function $Flow_move_one(_id_0, _source_0, _target_0, _copy_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _pid_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _hit_0 = ($Bool_and(($Nat_is_eq(_pid_0, _id_0)), ($Flow_same_place(_location_0, _source_0))));
    const _tail_0 = ($Flow_move_one(_id_0, _source_0, _target_0, _copy_0, _rest_0));
    return $Flow_move_one_pick(_pid_0, _location_0, _tail_0, _target_0, _copy_0, _hit_0);
  }
}

function $Flow_remove_one_pick(_pid_0, _location_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": _tail_0};
  }
}

function $Flow_remove_one(_id_0, _source_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _pid_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _hit_0 = ($Bool_and(($Nat_is_eq(_pid_0, _id_0)), ($Flow_same_place(_location_0, _source_0))));
    return $Flow_remove_one_pick(_pid_0, _location_0, ($Flow_remove_one(_id_0, _source_0, _rest_0)), _hit_0);
  }
}

function $Flow_fill_source(_packets_0, _capacity_0, _occupied_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _t_1 = _t_0["at"];
    if (_t_1.$ === "Flow.EditQueue") {
      const _rest_0 = _packets_0["tail"];
      const _room_0 = ($Flow_has_room(_occupied_0, _capacity_0));
      const _new_place_0 = ($Bool_pick(_room_0, {$: "Flow.Preparation"}, {$: "Flow.EditQueue"}));
      const _x_0 = ($Bool_pick(_room_0, 1, 0));
      const _new_occupied_0 = nat_chk(_occupied_0 + _x_0);
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _new_place_0}, "tail": ($Flow_fill_source(_rest_0, _capacity_0, _new_occupied_0))};
    } else {
      const _rest_1 = _packets_0["tail"];
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _t_1}, "tail": ($Flow_fill_source(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $Flow_fill_jev(_packets_0, _capacity_0, _occupied_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _t_1 = _t_0["at"];
    if (_t_1.$ === "Flow.ReviewQueue") {
      const _rest_0 = _packets_0["tail"];
      const _room_0 = ($Flow_has_room(_occupied_0, _capacity_0));
      const _new_place_0 = ($Bool_pick(_room_0, {$: "Flow.Jev"}, {$: "Flow.ReviewQueue"}));
      const _x_0 = ($Bool_pick(_room_0, 1, 0));
      const _new_occupied_0 = nat_chk(_occupied_0 + _x_0);
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _new_place_0}, "tail": ($Flow_fill_jev(_rest_0, _capacity_0, _new_occupied_0))};
    } else {
      const _rest_1 = _packets_0["tail"];
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _t_1}, "tail": ($Flow_fill_jev(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $Flow_settle(_flow_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _t_0 = _flow_0["active"];
  if (!_t_0) {
    const _continuations_0 = _flow_0["continuations"];
    const _waiting_0 = _flow_0["waiting"];
    const _background_available_0 = _flow_0["background_available"];
    const _lease_0 = _flow_0["lease"];
    const _leased_id_0 = _flow_0["leased_id"];
    const _last_surface_0 = _flow_0["last_surface"];
    const _last_id_0 = _flow_0["last_id"];
    const _background_submitted_0 = _flow_0["background_submitted"];
    return {$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": false, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0};
  } else {
    const _continuations_1 = _flow_0["continuations"];
    const _waiting_1 = _flow_0["waiting"];
    const _background_available_1 = _flow_0["background_available"];
    const _lease_1 = _flow_0["lease"];
    const _leased_id_1 = _flow_0["leased_id"];
    const _last_surface_1 = _flow_0["last_surface"];
    const _last_id_1 = _flow_0["last_id"];
    const _background_submitted_1 = _flow_0["background_submitted"];
    const _started_0 = ($Flow_fill_source(_packets_0, _source_capacity_0, ($Flow_count({$: "Flow.Preparation"}, _packets_0))));
    return {$: "Flow.Flow", "packets": ($Flow_fill_jev(_started_0, _review_capacity_0, ($Flow_count({$: "Flow.Jev"}, _started_0)))), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": true, "continuations": _continuations_1, "waiting": _waiting_1, "background_available": _background_available_1, "lease": _lease_1, "leased_id": _leased_id_1, "last_surface": _last_surface_1, "last_id": _last_id_1, "background_submitted": _background_submitted_1};
  }
}

function $Flow_replace_packets(_flow_0, _new_packets_0) {
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _active_0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const _background_available_0 = _flow_0["background_available"];
  const _lease_0 = _flow_0["lease"];
  const _leased_id_0 = _flow_0["leased_id"];
  const _last_surface_0 = _flow_0["last_surface"];
  const _last_id_0 = _flow_0["last_id"];
  const _background_submitted_0 = _flow_0["background_submitted"];
  return {$: "Flow.Flow", "packets": _new_packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0};
}

function $Flow_has_lease(_lease_0) {
  if (_lease_0.$ === "None") {
    return false;
  } else {
    return true;
  }
}

function $Flow_work_pending(_flow_0) {
  const _packets_0 = _flow_0["packets"];
  const _lease_0 = _flow_0["lease"];
  const _x_0 = ($Flow_unfinished(_packets_0));
  const _x_1 = ($Flow_has_lease(_lease_0));
  return (_x_0 || _x_1);
}

function $Flow_distinct_pick(_id_0, _tail_0, _known_0) {
  if (_known_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _id_0, "tail": _tail_0};
  }
}

function $Flow_distinct(_xs_0, _seen_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _xs_0["head"];
    const _rest_0 = _xs_0["tail"];
    return $Flow_distinct_pick(_id_0, ($Flow_distinct(_rest_0, {$: "Con", "head": _id_0, "tail": _seen_0})), ($Flow_contains(_id_0, _seen_0)));
  }
}

function $Flow_all_ids(_packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _packets_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($Flow_all_ids(_rest_0))};
  }
}

function $Flow_discarded_pick(_id_0, _tail_0, _keep_0) {
  if (_keep_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _id_0, "tail": _tail_0};
  }
}

function $Flow_discarded(_ids_all_0, _advice_0, _keep_advice_0) {
  if (_ids_all_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _ids_all_0["head"];
    const _rest_0 = _ids_all_0["tail"];
    return $Flow_discarded_pick(_id_0, ($Flow_discarded(_rest_0, _advice_0, _keep_advice_0)), ($Bool_and(_keep_advice_0, ($Flow_contains(_id_0, _advice_0)))));
  }
}

function $Flow_finish_choose(_original_0, _packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _continuations_0, _submitted_0, _advice_0, _can_continue_0) {
  if (_can_continue_0) {
    const _dropped_0 = ($Flow_discarded(($Flow_distinct(($Flow_all_ids(_packets_0)), {$: "Nil"})), _advice_0, true));
    const _decision_0 = {$: "Flow.ContinueWithAdvice", "ids": _advice_0, "discarded": _dropped_0, "cancelled_source": ($Flow_ids({$: "Flow.Preparation"}, _packets_0)), "cancelled_jev": ($Flow_ids({$: "Flow.Jev"}, _packets_0))};
    return {$: "Flow.Accepted", "state": {$: "Flow.Flow", "packets": {$: "Nil"}, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": true, "continuations": nat_chk(_continuations_0 + 1), "waiting": false, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}}, "decision": _decision_0, "settled": _original_0};
  } else {
    const _decision_1 = {$: "Flow.AllowFinish", "discarded": ($Flow_distinct(($Flow_all_ids(_packets_0)), {$: "Nil"})), "cancelled_source": ($Flow_ids({$: "Flow.Preparation"}, _packets_0)), "cancelled_jev": ($Flow_ids({$: "Flow.Jev"}, _packets_0))};
    return {$: "Flow.Accepted", "state": {$: "Flow.Flow", "packets": {$: "Nil"}, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": false, "continuations": _continuations_0, "waiting": false, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}}, "decision": _decision_1, "settled": _original_0};
  }
}

function $Flow_finish(_flow_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const __0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const __1 = _flow_0["waiting"];
  const __2 = _flow_0["background_available"];
  const __3 = _flow_0["lease"];
  const __4 = _flow_0["leased_id"];
  const __5 = _flow_0["last_surface"];
  const __6 = _flow_0["last_id"];
  const _submitted_0 = _flow_0["background_submitted"];
  const _advice_0 = ($Flow_ids({$: "Flow.AdviceStore"}, _packets_0));
  const _can_continue_0 = ($Bool_and(($Bool_not(($List_is_empty(_advice_0)))), (_continuations_0 < 4)));
  return $Flow_finish_choose({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": __0, "continuations": _continuations_0, "waiting": __1, "background_available": __2, "lease": __3, "leased_id": __4, "last_surface": __5, "last_id": __6, "background_submitted": _submitted_0}, _packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _continuations_0, _submitted_0, _advice_0, _can_continue_0);
}

function $Flow_ready_to_finish(_flow_0) {
  const __0 = _flow_0["packets"];
  const __1 = _flow_0["next_id"];
  const __2 = _flow_0["source_capacity"];
  const __3 = _flow_0["review_capacity"];
  const __4 = _flow_0["round_id"];
  const __5 = _flow_0["active"];
  const __6 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const __7 = _flow_0["background_available"];
  const __8 = _flow_0["lease"];
  const __9 = _flow_0["leased_id"];
  const __10 = _flow_0["last_surface"];
  const __11 = _flow_0["last_id"];
  const __12 = _flow_0["background_submitted"];
  return $Bool_and(_waiting_0, ($Bool_not(($Flow_work_pending({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": _waiting_0, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12})))));
}

function $Flow_accept_after(_flow_0, _ready_0) {
  if (_ready_0) {
    return $Flow_finish(_flow_0);
  } else {
    return {$: "Flow.Accepted", "state": _flow_0, "decision": {$: "Flow.NoDecision"}, "settled": _flow_0};
  }
}

function $Flow_accept(_flow_0) {
  const _settled_0 = ($Flow_settle(_flow_0));
  return $Flow_accept_after(_settled_0, ($Flow_ready_to_finish(_settled_0)));
}

function $Flow_reject(_flow_0, _reason_0) {
  return {$: "Flow.Rejected", "state": _flow_0, "reason": _reason_0};
}

function $Flow_edit_open(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0) {
  if (_active_0) {
    return $Flow_accept({$: "Flow.Flow", "packets": ($List_append(_packets_0, {$: "Con", "head": {$: "Flow.Packet", "id": _next_id_0, "at": {$: "Flow.EditQueue"}}, "tail": {$: "Nil"}})), "next_id": nat_chk(_next_id_0 + 1), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": true, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": true, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  } else {
    return $Flow_accept({$: "Flow.Flow", "packets": {$: "Con", "head": {$: "Flow.Packet", "id": _next_id_0, "at": {$: "Flow.EditQueue"}}, "tail": {$: "Nil"}}, "next_id": nat_chk(_next_id_0 + 1), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": nat_chk(_round_id_0 + 1), "active": true, "continuations": 0, "waiting": false, "background_available": true, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}});
  }
}

function $Flow_edit(_flow_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _active_0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const _lease_0 = _flow_0["lease"];
  const _leased_id_0 = _flow_0["leased_id"];
  const _last_surface_0 = _flow_0["last_surface"];
  const _last_id_0 = _flow_0["last_id"];
  const _background_submitted_0 = _flow_0["background_submitted"];
  return $Flow_edit_open(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0);
}

function $Flow_set_capacity_valid(_flow_0, _capacity_0, _source_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const __0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _active_0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const _background_available_0 = _flow_0["background_available"];
  const _lease_0 = _flow_0["lease"];
  const _leased_id_0 = _flow_0["leased_id"];
  const _last_surface_0 = _flow_0["last_surface"];
  const _last_id_0 = _flow_0["last_id"];
  const _background_submitted_0 = _flow_0["background_submitted"];
  if (_source_0) {
    return $Flow_accept({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  } else {
    return $Flow_accept({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": __0, "review_capacity": _capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  }
}

function $Flow_set_capacity_choose(_flow_0, _capacity_0, _source_0, _valid_0) {
  if (!_valid_0) {
    return $Flow_reject(_flow_0, {$: "Flow.InvalidCapacity"});
  } else {
    return $Flow_set_capacity_valid(_flow_0, _capacity_0, _source_0);
  }
}

function $Flow_set_capacity(_flow_0, _capacity_0, _source_0) {
  return $Flow_set_capacity_choose(_flow_0, _capacity_0, _source_0, ($Flow_capacity_valid(_capacity_0)));
}

function $Flow_stop_budget(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0, _under_budget_0) {
  if (_under_budget_0) {
    return $Flow_accept({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": true, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  } else {
    return $Flow_finish({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": true, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  }
}

function $Flow_stop_choose(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0) {
  if (_waiting_0) {
    return $Flow_reject({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": true, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0}, {$: "Flow.FinishDecisionAlreadyOpen"});
  } else {
    return $Flow_stop_budget(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0, (_continuations_0 < 4));
  }
}

function $Flow_stop(_flow_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _active_0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const _background_available_0 = _flow_0["background_available"];
  const _lease_0 = _flow_0["lease"];
  const _leased_id_0 = _flow_0["leased_id"];
  const _last_surface_0 = _flow_0["last_surface"];
  const _last_id_0 = _flow_0["last_id"];
  const _background_submitted_0 = _flow_0["background_submitted"];
  return $Flow_stop_choose(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0);
}

function $Flow_is_active(_flow_0) {
  const _active_0 = _flow_0["active"];
  return _active_0;
}

function $Flow_apply_move_do(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _id_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _active_0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const _background_available_0 = _flow_0["background_available"];
  const _lease_0 = _flow_0["lease"];
  const _leased_id_0 = _flow_0["leased_id"];
  const _last_surface_0 = _flow_0["last_surface"];
  const _last_id_0 = _flow_0["last_id"];
  const _submitted_0 = _flow_0["background_submitted"];
  if (_terminal_0) {
    return $Flow_accept({$: "Flow.Flow", "packets": ($Flow_remove_one(_id_0, _source_0, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  } else {
    return $Flow_accept({$: "Flow.Flow", "packets": ($Flow_move_one(_id_0, _source_0, _target_0, _copy_0, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  }
}

function $Flow_apply_move_found(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _found_0) {
  if (_found_0.$ === "None") {
    return $Flow_reject(_flow_0, {$: "Flow.MissingPacket"});
  } else {
    const _id_0 = _found_0["value"];
    return $Flow_apply_move_do(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _id_0);
  }
}

function $Flow_apply_move(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _selected_0) {
  const _packets_0 = _flow_0["packets"];
  const __0 = _flow_0["next_id"];
  const __1 = _flow_0["source_capacity"];
  const __2 = _flow_0["review_capacity"];
  const __3 = _flow_0["round_id"];
  const __4 = _flow_0["active"];
  const __5 = _flow_0["continuations"];
  const __6 = _flow_0["waiting"];
  const __7 = _flow_0["background_available"];
  const __8 = _flow_0["lease"];
  const __9 = _flow_0["leased_id"];
  const __10 = _flow_0["last_surface"];
  const __11 = _flow_0["last_id"];
  const __12 = _flow_0["background_submitted"];
  return $Flow_apply_move_found({$: "Flow.Flow", "packets": _packets_0, "next_id": __0, "source_capacity": __1, "review_capacity": __2, "round_id": __3, "active": __4, "continuations": __5, "waiting": __6, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12}, _source_0, _target_0, _copy_0, _terminal_0, ($Flow_find(_source_0, _selected_0, _packets_0)));
}

function $Flow_deadline_settled(_flow_0, _pending_0) {
  if (_pending_0) {
    return $Flow_reject(_flow_0, {$: "Flow.WorkStillPending"});
  } else {
    return $Flow_finish(_flow_0);
  }
}

function $Flow_deadline_budget(_flow_0, _under_budget_0) {
  if (_under_budget_0) {
    return $Flow_reject(_flow_0, {$: "Flow.UnexpectedControl"});
  } else {
    return $Flow_finish(_flow_0);
  }
}

function $Flow_deadline_kind(_flow_0, _kind_0, _continuations_0) {
  if (_kind_0.$ === "Flow.FinishDecisionAllWorkSettled") {
    return $Flow_deadline_settled(_flow_0, ($Flow_work_pending(_flow_0)));
  } else if (_kind_0.$ === "Flow.FinishDecisionBudgetExhausted") {
    return $Flow_deadline_budget(_flow_0, (_continuations_0 < 4));
  } else {
    return $Flow_finish(_flow_0);
  }
}

function $Flow_deadline_wait(_flow_0, _kind_0, _continuations_0, _waiting_0) {
  if (!_waiting_0) {
    return $Flow_reject(_flow_0, {$: "Flow.StopNotWaiting"});
  } else {
    return $Flow_deadline_kind(_flow_0, _kind_0, _continuations_0);
  }
}

function $Flow_deadline(_flow_0, _kind_0) {
  const __0 = _flow_0["packets"];
  const __1 = _flow_0["next_id"];
  const __2 = _flow_0["source_capacity"];
  const __3 = _flow_0["review_capacity"];
  const __4 = _flow_0["round_id"];
  const __5 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const __6 = _flow_0["background_available"];
  const __7 = _flow_0["lease"];
  const __8 = _flow_0["leased_id"];
  const __9 = _flow_0["last_surface"];
  const __10 = _flow_0["last_id"];
  const __11 = _flow_0["background_submitted"];
  return $Flow_deadline_wait({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": __6, "lease": __7, "leased_id": __8, "last_surface": __9, "last_id": __10, "background_submitted": __11}, _kind_0, _continuations_0, _waiting_0);
}

function $Flow_lease_apply_surface(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _last_surface_0, _last_id_0, _submitted_0, _surface_0, _id_0) {
  if (_surface_0.$ === "Flow.Background") {
    return $Flow_accept({$: "Flow.Flow", "packets": ($Flow_move_one(_id_0, {$: "Flow.AdviceStore"}, {$: "Flow.AdvicePolicy"}, true, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _available_0, "lease": {$: "Some", "value": {$: "Flow.Background"}}, "leased_id": {$: "Some", "value": _id_0}, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  } else {
    return $Flow_accept({$: "Flow.Flow", "packets": ($Flow_move_one(_id_0, {$: "Flow.AdviceStore"}, {$: "Flow.AdvicePolicy"}, true, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": nat_chk(_continuations_0 + 1), "waiting": _waiting_0, "background_available": _available_0, "lease": {$: "Some", "value": {$: "Flow.Stop"}}, "leased_id": {$: "Some", "value": _id_0}, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  }
}

function $Flow_lease_apply(_flow_0, _surface_0, _id_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _active_0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const _available_0 = _flow_0["background_available"];
  const _last_surface_0 = _flow_0["last_surface"];
  const _last_id_0 = _flow_0["last_id"];
  const _submitted_0 = _flow_0["background_submitted"];
  return $Flow_lease_apply_surface(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _last_surface_0, _last_id_0, _submitted_0, _surface_0, _id_0);
}

function $Flow_lease_check_submitted(_flow_0, _surface_0, _id_0, _submitted_0) {
  if (_surface_0.$ === "Flow.Background") {
    if (_submitted_0) {
      return $Flow_reject(_flow_0, {$: "Flow.BackgroundAlreadySubmitted"});
    } else {
      return $Flow_lease_apply(_flow_0, {$: "Flow.Background"}, _id_0);
    }
  } else {
    return $Flow_lease_apply(_flow_0, {$: "Flow.Stop"}, _id_0);
  }
}

function $Flow_lease_check(_flow_0, _surface_0, _id_0) {
  const __0 = _flow_0["packets"];
  const __1 = _flow_0["next_id"];
  const __2 = _flow_0["source_capacity"];
  const __3 = _flow_0["review_capacity"];
  const __4 = _flow_0["round_id"];
  const __5 = _flow_0["active"];
  const __6 = _flow_0["continuations"];
  const __7 = _flow_0["waiting"];
  const __8 = _flow_0["background_available"];
  const __9 = _flow_0["lease"];
  const __10 = _flow_0["leased_id"];
  const __11 = _flow_0["last_surface"];
  const __12 = _flow_0["last_id"];
  const _submitted_0 = _flow_0["background_submitted"];
  return $Flow_lease_check_submitted({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": __8, "lease": __9, "leased_id": __10, "last_surface": __11, "last_id": __12, "background_submitted": _submitted_0}, _surface_0, _id_0, ($Flow_contains(_id_0, _submitted_0)));
}

function $Flow_lease_found(_flow_0, _surface_0, _found_0) {
  if (_found_0.$ === "None") {
    return $Flow_reject(_flow_0, {$: "Flow.MissingPacket"});
  } else {
    const _id_0 = _found_0["value"];
    return $Flow_lease_check(_flow_0, _surface_0, _id_0);
  }
}

function $Flow_lease_find(_flow_0, _selected_0, _surface_0) {
  const _packets_0 = _flow_0["packets"];
  const __0 = _flow_0["next_id"];
  const __1 = _flow_0["source_capacity"];
  const __2 = _flow_0["review_capacity"];
  const __3 = _flow_0["round_id"];
  const __4 = _flow_0["active"];
  const __5 = _flow_0["continuations"];
  const __6 = _flow_0["waiting"];
  const __7 = _flow_0["background_available"];
  const __8 = _flow_0["lease"];
  const __9 = _flow_0["leased_id"];
  const __10 = _flow_0["last_surface"];
  const __11 = _flow_0["last_id"];
  const __12 = _flow_0["background_submitted"];
  return $Flow_lease_found({$: "Flow.Flow", "packets": _packets_0, "next_id": __0, "source_capacity": __1, "review_capacity": __2, "round_id": __3, "active": __4, "continuations": __5, "waiting": __6, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12}, _surface_0, ($Flow_find({$: "Flow.AdviceStore"}, _selected_0, _packets_0)));
}

function $Flow_lease_background_guard(_flow_0, _selected_0, _available_0, _busy_0) {
  if (!_available_0) {
    return $Flow_reject(_flow_0, {$: "Flow.BackgroundNotRequested"});
  } else {
    if (_busy_0) {
      return $Flow_reject(_flow_0, {$: "Flow.LeaseBusy"});
    } else {
      return $Flow_lease_find(_flow_0, _selected_0, {$: "Flow.Background"});
    }
  }
}

function $Flow_lease_background(_flow_0, _selected_0) {
  const __0 = _flow_0["packets"];
  const __1 = _flow_0["next_id"];
  const __2 = _flow_0["source_capacity"];
  const __3 = _flow_0["review_capacity"];
  const __4 = _flow_0["round_id"];
  const __5 = _flow_0["active"];
  const __6 = _flow_0["continuations"];
  const __7 = _flow_0["waiting"];
  const _available_0 = _flow_0["background_available"];
  const _lease_0 = _flow_0["lease"];
  const __8 = _flow_0["leased_id"];
  const __9 = _flow_0["last_surface"];
  const __10 = _flow_0["last_id"];
  const __11 = _flow_0["background_submitted"];
  return $Flow_lease_background_guard({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": _available_0, "lease": _lease_0, "leased_id": __8, "last_surface": __9, "last_id": __10, "background_submitted": __11}, _selected_0, _available_0, ($Flow_has_lease(_lease_0)));
}

function $Flow_lease_stop_eligible(_flow_0, _id_0, _reoffer_0, _submitted_0) {
  if (_reoffer_0) {
    if (!_submitted_0) {
      return $Flow_reject(_flow_0, {$: "Flow.ReofferNeedsBackground"});
    } else {
      return $Flow_lease_apply(_flow_0, {$: "Flow.Stop"}, _id_0);
    }
  } else {
    if (_submitted_0) {
      return $Flow_reject(_flow_0, {$: "Flow.StopNeedsFreshAdvice"});
    } else {
      return $Flow_lease_apply(_flow_0, {$: "Flow.Stop"}, _id_0);
    }
  }
}

function $Flow_lease_stop_check(_flow_0, _reoffer_0, _id_0) {
  const __0 = _flow_0["packets"];
  const __1 = _flow_0["next_id"];
  const __2 = _flow_0["source_capacity"];
  const __3 = _flow_0["review_capacity"];
  const __4 = _flow_0["round_id"];
  const __5 = _flow_0["active"];
  const __6 = _flow_0["continuations"];
  const __7 = _flow_0["waiting"];
  const __8 = _flow_0["background_available"];
  const __9 = _flow_0["lease"];
  const __10 = _flow_0["leased_id"];
  const __11 = _flow_0["last_surface"];
  const __12 = _flow_0["last_id"];
  const _submitted_0 = _flow_0["background_submitted"];
  return $Flow_lease_stop_eligible({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": __8, "lease": __9, "leased_id": __10, "last_surface": __11, "last_id": __12, "background_submitted": _submitted_0}, _id_0, _reoffer_0, ($Flow_contains(_id_0, _submitted_0)));
}

function $Flow_lease_stop_found(_flow_0, _reoffer_0, _found_0) {
  if (_found_0.$ === "None") {
    return $Flow_reject(_flow_0, {$: "Flow.MissingPacket"});
  } else {
    const _id_0 = _found_0["value"];
    return $Flow_lease_stop_check(_flow_0, _reoffer_0, _id_0);
  }
}

function $Flow_lease_stop_find(_flow_0, _selected_0, _reoffer_0) {
  const _packets_0 = _flow_0["packets"];
  const __0 = _flow_0["next_id"];
  const __1 = _flow_0["source_capacity"];
  const __2 = _flow_0["review_capacity"];
  const __3 = _flow_0["round_id"];
  const __4 = _flow_0["active"];
  const __5 = _flow_0["continuations"];
  const __6 = _flow_0["waiting"];
  const __7 = _flow_0["background_available"];
  const __8 = _flow_0["lease"];
  const __9 = _flow_0["leased_id"];
  const __10 = _flow_0["last_surface"];
  const __11 = _flow_0["last_id"];
  const __12 = _flow_0["background_submitted"];
  return $Flow_lease_stop_found({$: "Flow.Flow", "packets": _packets_0, "next_id": __0, "source_capacity": __1, "review_capacity": __2, "round_id": __3, "active": __4, "continuations": __5, "waiting": __6, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12}, _reoffer_0, ($Flow_find({$: "Flow.AdviceStore"}, _selected_0, _packets_0)));
}

function $Flow_lease_stop_budget(_flow_0, _selected_0, _reoffer_0, _under_budget_0) {
  if (!_under_budget_0) {
    return $Flow_reject(_flow_0, {$: "Flow.ContinuationBudgetExhausted"});
  } else {
    return $Flow_lease_stop_find(_flow_0, _selected_0, _reoffer_0);
  }
}

function $Flow_lease_stop_guard(_flow_0, _selected_0, _reoffer_0, _continuations_0, _waiting_0, _busy_0) {
  if (!_waiting_0) {
    return $Flow_reject(_flow_0, {$: "Flow.StopNotRequested"});
  } else {
    if (_busy_0) {
      return $Flow_reject(_flow_0, {$: "Flow.LeaseBusy"});
    } else {
      return $Flow_lease_stop_budget(_flow_0, _selected_0, _reoffer_0, (_continuations_0 < 4));
    }
  }
}

function $Flow_lease_stop(_flow_0, _selected_0, _reoffer_0) {
  const __0 = _flow_0["packets"];
  const __1 = _flow_0["next_id"];
  const __2 = _flow_0["source_capacity"];
  const __3 = _flow_0["review_capacity"];
  const __4 = _flow_0["round_id"];
  const __5 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const __6 = _flow_0["background_available"];
  const _lease_0 = _flow_0["lease"];
  const __7 = _flow_0["leased_id"];
  const __8 = _flow_0["last_surface"];
  const __9 = _flow_0["last_id"];
  const __10 = _flow_0["background_submitted"];
  return $Flow_lease_stop_guard({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": __6, "lease": _lease_0, "leased_id": __7, "last_surface": __8, "last_id": __9, "background_submitted": __10}, _selected_0, _reoffer_0, _continuations_0, _waiting_0, ($Flow_has_lease(_lease_0)));
}

function $Flow_submit_surface(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _submitted_0, _surface_0, _id_0) {
  if (_surface_0.$ === "Flow.Background") {
    return $Flow_accept({$: "Flow.Flow", "packets": ($Flow_remove_one(_id_0, {$: "Flow.AdvicePolicy"}, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "Some", "value": {$: "Flow.Background"}}, "last_id": {$: "Some", "value": _id_0}, "background_submitted": ($List_append(_submitted_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}}))});
  } else {
    const _next_0 = ($Flow_remove_one(_id_0, {$: "Flow.AdvicePolicy"}, _packets_0));
    return $Flow_accept({$: "Flow.Flow", "packets": ($Flow_remove_one(_id_0, {$: "Flow.AdviceStore"}, _next_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": false, "background_available": _available_0, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "Some", "value": {$: "Flow.Stop"}}, "last_id": {$: "Some", "value": _id_0}, "background_submitted": _submitted_0});
  }
}

function $Flow_submit_run(_flow_0, _surface_0, _id_0) {
  const _packets_0 = _flow_0["packets"];
  const _next_id_0 = _flow_0["next_id"];
  const _source_capacity_0 = _flow_0["source_capacity"];
  const _review_capacity_0 = _flow_0["review_capacity"];
  const _round_id_0 = _flow_0["round_id"];
  const _active_0 = _flow_0["active"];
  const _continuations_0 = _flow_0["continuations"];
  const _waiting_0 = _flow_0["waiting"];
  const _available_0 = _flow_0["background_available"];
  const _submitted_0 = _flow_0["background_submitted"];
  return $Flow_submit_surface(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _submitted_0, _surface_0, _id_0);
}

function $Flow_submit_lease(_flow_0, _lease_0, _leased_id_0) {
  if (_lease_0.$ === "None") {
    return $Flow_reject(_flow_0, {$: "Flow.NoLease"});
  } else {
    const _surface_0 = _lease_0["value"];
    if (_leased_id_0.$ === "Some") {
      const _id_0 = _leased_id_0["value"];
      return $Flow_submit_run(_flow_0, _surface_0, _id_0);
    } else {
      return $Flow_reject(_flow_0, {$: "Flow.NoLease"});
    }
  }
}

function $Flow_submit(_flow_0) {
  const __0 = _flow_0["packets"];
  const __1 = _flow_0["next_id"];
  const __2 = _flow_0["source_capacity"];
  const __3 = _flow_0["review_capacity"];
  const __4 = _flow_0["round_id"];
  const __5 = _flow_0["active"];
  const __6 = _flow_0["continuations"];
  const __7 = _flow_0["waiting"];
  const __8 = _flow_0["background_available"];
  const _lease_0 = _flow_0["lease"];
  const _leased_id_0 = _flow_0["leased_id"];
  const __9 = _flow_0["last_surface"];
  const __10 = _flow_0["last_id"];
  const __11 = _flow_0["background_submitted"];
  return $Flow_submit_lease({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": __8, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": __9, "last_id": __10, "background_submitted": __11}, _lease_0, _leased_id_0);
}

function $Flow_step_live(_flow_0, _event_0, _item_id_0) {
  if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return $Flow_apply_move(_flow_0, {$: "Flow.Preparation"}, {$: "Flow.ReviewQueue"}, false, false, _item_id_0);
  } else if (_event_0.$ === "Flow.JevFindingReceived") {
    return $Flow_apply_move(_flow_0, {$: "Flow.Jev"}, {$: "Flow.AdviceStore"}, false, false, _item_id_0);
  } else if (_event_0.$ === "Flow.JevClearReceived") {
    return $Flow_apply_move(_flow_0, {$: "Flow.Jev"}, {$: "Flow.Jev"}, false, true, _item_id_0);
  } else if (_event_0.$ === "Flow.JevUnavailable") {
    return $Flow_apply_move(_flow_0, {$: "Flow.Jev"}, {$: "Flow.Jev"}, false, true, _item_id_0);
  } else if (_event_0.$ === "Flow.StopHookFired") {
    return $Flow_stop(_flow_0);
  } else if (_event_0.$ === "Flow.FinishDecisionDeadlineReached") {
    return $Flow_deadline(_flow_0, {$: "Flow.FinishDecisionDeadlineReached"});
  } else if (_event_0.$ === "Flow.FinishDecisionAllWorkSettled") {
    return $Flow_deadline(_flow_0, {$: "Flow.FinishDecisionAllWorkSettled"});
  } else if (_event_0.$ === "Flow.FinishDecisionBudgetExhausted") {
    return $Flow_deadline(_flow_0, {$: "Flow.FinishDecisionBudgetExhausted"});
  } else if (_event_0.$ === "Flow.AdviceLeasedByBackground") {
    return $Flow_lease_background(_flow_0, _item_id_0);
  } else if (_event_0.$ === "Flow.HostOutputSubmitted") {
    return $Flow_submit(_flow_0);
  } else {
    return $Flow_reject(_flow_0, {$: "Flow.UnexpectedControl"});
  }
}

function $Flow_step_active(_flow_0, _event_0, _item_id_0, _active_0) {
  if (!_active_0) {
    return $Flow_reject(_flow_0, {$: "Flow.VirtualRoundClosed"});
  } else {
    return $Flow_step_live(_flow_0, _event_0, _item_id_0);
  }
}

function $Flow_step(_flow_0, _event_0, _item_id_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return $Flow_edit(_flow_0);
  } else if (_event_0.$ === "Flow.SourceCapacitySet") {
    const _capacity_0 = _event_0["capacity"];
    return $Flow_set_capacity(_flow_0, _capacity_0, true);
  } else if (_event_0.$ === "Flow.ReviewCapacitySet") {
    const _capacity_1 = _event_0["capacity"];
    return $Flow_set_capacity(_flow_0, _capacity_1, false);
  } else if (_event_0.$ === "Flow.IngressStarted") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.UnitDispatched") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.ReviewServiceRequestSent") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.BackgroundWaitStarted") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.AdviceLeasedByStop") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.AdviceReofferedAtStop") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.StopAllowed") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.FinishResponseRequested") {
    return $Flow_reject(_flow_0, {$: "Flow.InternalEvent"});
  } else {
    return $Flow_step_active(_flow_0, _event_0, _item_id_0, ($Flow_is_active(_flow_0)));
  }
}

function $Flow_main() {
  return $Flow_initial();
}

function $Flow_some(_value_0) {
  if (_value_0.$ === "None") {
    return false;
  } else {
    return true;
  }
}

function $Flow_event_item_pick(_event_0, _selected_0, _packets_0, _next_id_0, _leased_id_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return {$: "Some", "value": _next_id_0};
  } else if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return $Flow_find({$: "Flow.Preparation"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.JevFindingReceived") {
    return $Flow_find({$: "Flow.Jev"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.JevClearReceived") {
    return $Flow_find({$: "Flow.Jev"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.JevUnavailable") {
    return $Flow_find({$: "Flow.Jev"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.AdviceLeasedByBackground") {
    return $Flow_find({$: "Flow.AdviceStore"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.HostOutputSubmitted") {
    return _leased_id_0;
  } else {
    return {$: "None"};
  }
}

function $Flow_event_item(_event_0, _selected_0, _before_0) {
  const _packets_0 = _before_0["packets"];
  const _next_id_0 = _before_0["next_id"];
  const _leased_id_0 = _before_0["leased_id"];
  return $Flow_event_item_pick(_event_0, _selected_0, _packets_0, _next_id_0, _leased_id_0);
}

function $Flow_own_change(_event_0, _before_0, _item_0) {
  if (_event_0.$ === "Flow.SourceCapacitySet") {
    const _capacity_0 = _event_0["capacity"];
    const _previous_0 = _before_0["source_capacity"];
    return {$: "Flow.CapacityChanged", "source": true, "before": _previous_0, "after": _capacity_0};
  } else if (_event_0.$ === "Flow.ReviewCapacitySet") {
    const _capacity_1 = _event_0["capacity"];
    const _previous_1 = _before_0["review_capacity"];
    return {$: "Flow.CapacityChanged", "source": false, "before": _previous_1, "after": _capacity_1};
  } else {
    return {$: "Flow.Transition", "event": _event_0, "route": ($Flow_route_of(_event_0)), "item": _item_0};
  }
}

function $Flow_opened(_before_active_0, _mid_active_0, _round_id_0) {
  if (!_before_active_0) {
    if (_mid_active_0) {
      return {$: "Con", "head": {$: "Flow.RoundOpened", "id": _round_id_0}, "tail": {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else {
    return {$: "Nil"};
  }
}

function $Flow_emission(_event_0, _item_0) {
  if (_event_0.$ === "Flow.JevClearReceived") {
    if (_item_0.$ === "Some") {
      const _id_0 = _item_0["value"];
      return {$: "Con", "head": {$: "Flow.Emitted", "event": {$: "Flow.JevClearReceived"}, "at": {$: "Flow.OutcomeStoreNode"}, "item": _id_0}, "tail": {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else if (_event_0.$ === "Flow.JevUnavailable") {
    if (_item_0.$ === "Some") {
      const _id_1 = _item_0["value"];
      return {$: "Con", "head": {$: "Flow.Emitted", "event": {$: "Flow.JevUnavailable"}, "at": {$: "Flow.OutcomeStoreNode"}, "item": _id_1}, "tail": {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else if (_event_0.$ === "Flow.HostOutputSubmitted") {
    if (_item_0.$ === "Some") {
      const _id_2 = _item_0["value"];
      return {$: "Con", "head": {$: "Flow.Emitted", "event": {$: "Flow.HostOutputSubmitted"}, "at": {$: "Flow.ObservedWriteNode"}, "item": _id_2}, "tail": {$: "Nil"}};
    } else {
      return {$: "Nil"};
    }
  } else {
    return {$: "Nil"};
  }
}

function $Flow_is_edit(_event_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return true;
  } else {
    return false;
  }
}

function $Flow_is_prepared(_event_0) {
  if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return true;
  } else {
    return false;
  }
}

function $Flow_schedule_source_pick(_id_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.IngressStarted"}, "route": ($Flow_route_of({$: "Flow.IngressStarted"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0};
  } else {
    return _tail_0;
  }
}

function $Flow_schedule_source(_event_0, _next_id_0, _old_edit_ids_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _place_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _x_0 = ($Flow_contains(_id_0, _old_edit_ids_0));
    const _x_1 = ($Bool_and(($Flow_is_edit(_event_0)), ($Nat_is_eq(_id_0, _next_id_0))));
    const _hit_0 = ($Bool_and(($Flow_same_place(_place_0, {$: "Flow.Preparation"})), (_x_0 || _x_1)));
    return $Flow_schedule_source_pick(_id_0, ($Flow_schedule_source(_event_0, _next_id_0, _old_edit_ids_0, _rest_0)), _hit_0);
  }
}

function $Flow_selected_is(_id_0, _selected_0) {
  if (_selected_0.$ === "None") {
    return false;
  } else {
    const _wanted_0 = _selected_0["value"];
    return $Nat_is_eq(_id_0, _wanted_0);
  }
}

function $Flow_schedule_review_pick(_id_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.UnitDispatched"}, "route": ($Flow_route_of({$: "Flow.UnitDispatched"})), "item": {$: "Some", "value": _id_0}}, "tail": {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.ReviewServiceRequestSent"}, "route": ($Flow_route_of({$: "Flow.ReviewServiceRequestSent"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0}};
  } else {
    return _tail_0;
  }
}

function $Flow_schedule_review(_event_0, _own_item_0, _old_review_ids_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _place_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _x_0 = ($Flow_contains(_id_0, _old_review_ids_0));
    const _x_1 = ($Bool_and(($Flow_is_prepared(_event_0)), ($Flow_selected_is(_id_0, _own_item_0))));
    const _hit_0 = ($Bool_and(($Flow_same_place(_place_0, {$: "Flow.Jev"})), (_x_0 || _x_1)));
    return $Flow_schedule_review_pick(_id_0, ($Flow_schedule_review(_event_0, _own_item_0, _old_review_ids_0, _rest_0)), _hit_0);
  }
}

function $Flow_first_id(_ids_0) {
  if (_ids_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _id_0 = _ids_0["head"];
    return {$: "Some", "value": _id_0};
  }
}

function $Flow_finish_trigger_stop(_under_budget_0) {
  if (_under_budget_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishDecisionAllWorkSettled"}, "route": ($Flow_route_of({$: "Flow.FinishDecisionAllWorkSettled"})), "item": {$: "None"}}, "tail": {$: "Nil"}};
  } else {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishDecisionBudgetExhausted"}, "route": ($Flow_route_of({$: "Flow.FinishDecisionBudgetExhausted"})), "item": {$: "None"}}, "tail": {$: "Nil"}};
  }
}

function $Flow_finish_trigger(_event_0, _continuations_0) {
  if (_event_0.$ === "Flow.FinishDecisionDeadlineReached") {
    return {$: "Nil"};
  } else if (_event_0.$ === "Flow.FinishDecisionAllWorkSettled") {
    return {$: "Nil"};
  } else if (_event_0.$ === "Flow.FinishDecisionBudgetExhausted") {
    return {$: "Nil"};
  } else if (_event_0.$ === "Flow.StopHookFired") {
    return $Flow_finish_trigger_stop((_continuations_0 < 4));
  } else {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishDecisionAllWorkSettled"}, "route": ($Flow_route_of({$: "Flow.FinishDecisionAllWorkSettled"})), "item": {$: "None"}}, "tail": {$: "Nil"}};
  }
}

function $Flow_finish_leases_pick(_id_0, _tail_0, _reoffer_0) {
  if (_reoffer_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.AdviceReofferedAtStop"}, "route": ($Flow_route_of({$: "Flow.AdviceReofferedAtStop"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0};
  } else {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.AdviceLeasedByStop"}, "route": ($Flow_route_of({$: "Flow.AdviceLeasedByStop"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0};
  }
}

function $Flow_finish_leases(_ids_0, _submitted_0) {
  if (_ids_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _ids_0["head"];
    const _rest_0 = _ids_0["tail"];
    return $Flow_finish_leases_pick(_id_0, ($Flow_finish_leases(_rest_0, _submitted_0)), ($Flow_contains(_id_0, _submitted_0)));
  }
}

function $Flow_finish_tail_pick(_decision_0, _packets_0, _round_id_0, _submitted_0) {
  if (_decision_0.$ === "Flow.NoDecision") {
    return {$: "Nil"};
  } else if (_decision_0.$ === "Flow.ContinueWithAdvice") {
    const _advice_ids_0 = _decision_0["ids"];
    const __0 = _decision_0["discarded"];
    const __1 = _decision_0["cancelled_source"];
    const __2 = _decision_0["cancelled_jev"];
    return $List_append(($Flow_finish_leases(_advice_ids_0, _submitted_0)), {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishResponseRequested"}, "route": ($Flow_route_of({$: "Flow.FinishResponseRequested"})), "item": ($Flow_first_id(_advice_ids_0))}, "tail": {$: "Con", "head": {$: "Flow.FinishDecision", "decision": {$: "Flow.ContinueWithAdvice", "ids": _advice_ids_0, "discarded": __0, "cancelled_source": __1, "cancelled_jev": __2}}, "tail": {$: "Nil"}}});
  } else {
    const __3 = _decision_0["discarded"];
    const __4 = _decision_0["cancelled_source"];
    const __5 = _decision_0["cancelled_jev"];
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.StopAllowed"}, "route": ($Flow_route_of({$: "Flow.StopAllowed"})), "item": {$: "None"}}, "tail": {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishResponseRequested"}, "route": ($Flow_route_of({$: "Flow.FinishResponseRequested"})), "item": {$: "None"}}, "tail": {$: "Con", "head": {$: "Flow.FinishDecision", "decision": {$: "Flow.AllowFinish", "discarded": __3, "cancelled_source": __4, "cancelled_jev": __5}}, "tail": {$: "Con", "head": {$: "Flow.RoundClosed", "id": _round_id_0, "discarded": ($List_length(($Flow_distinct(($Flow_all_ids(_packets_0)), {$: "Nil"}))))}, "tail": {$: "Nil"}}}}};
  }
}

function $Flow_finish_tail(_decision_0, _mid_0) {
  const _packets_0 = _mid_0["packets"];
  const _round_id_0 = _mid_0["round_id"];
  const _submitted_0 = _mid_0["background_submitted"];
  return $Flow_finish_tail_pick(_decision_0, _packets_0, _round_id_0, _submitted_0);
}

function $Flow_finish_changes(_event_0, _continuations_0, _decision_0, _mid_0) {
  if (_decision_0.$ === "Flow.NoDecision") {
    return {$: "Nil"};
  } else {
    return $List_append(($Flow_finish_trigger(_event_0, _continuations_0)), ($Flow_finish_tail(_decision_0, _mid_0)));
  }
}

function $Flow_background_start(_event_0, _available_0, _item_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    if (!_available_0) {
      if (_item_0.$ === "Some") {
        const _id_0 = _item_0["value"];
        return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.BackgroundWaitStarted"}, "route": ($Flow_route_of({$: "Flow.BackgroundWaitStarted"})), "item": {$: "Some", "value": _id_0}}, "tail": {$: "Nil"}};
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

function $Flow_changes_accepted(_before_0, _event_0, _selected_0, _decision_0, _mid_0) {
  const _old_packets_0 = _before_0["packets"];
  const _next_id_0 = _before_0["next_id"];
  const __0 = _before_0["source_capacity"];
  const __1 = _before_0["review_capacity"];
  const __2 = _before_0["round_id"];
  const _old_active_0 = _before_0["active"];
  const _continuations_0 = _before_0["continuations"];
  const __3 = _before_0["waiting"];
  const _old_background_0 = _before_0["background_available"];
  const __4 = _before_0["lease"];
  const __5 = _before_0["leased_id"];
  const __6 = _before_0["last_surface"];
  const __7 = _before_0["last_id"];
  const __8 = _before_0["background_submitted"];
  const _mid_packets_0 = _mid_0["packets"];
  const __9 = _mid_0["next_id"];
  const __10 = _mid_0["source_capacity"];
  const __11 = _mid_0["review_capacity"];
  const _round_id_0 = _mid_0["round_id"];
  const _mid_active_0 = _mid_0["active"];
  const __12 = _mid_0["continuations"];
  const __13 = _mid_0["waiting"];
  const __14 = _mid_0["background_available"];
  const __15 = _mid_0["lease"];
  const __16 = _mid_0["leased_id"];
  const __17 = _mid_0["last_surface"];
  const __18 = _mid_0["last_id"];
  const __19 = _mid_0["background_submitted"];
  const _own_item_0 = ($Flow_event_item(_event_0, _selected_0, {$: "Flow.Flow", "packets": _old_packets_0, "next_id": _next_id_0, "source_capacity": __0, "review_capacity": __1, "round_id": __2, "active": _old_active_0, "continuations": _continuations_0, "waiting": __3, "background_available": _old_background_0, "lease": __4, "leased_id": __5, "last_surface": __6, "last_id": __7, "background_submitted": __8}));
  const _own_0 = ($Flow_own_change(_event_0, {$: "Flow.Flow", "packets": _old_packets_0, "next_id": _next_id_0, "source_capacity": __0, "review_capacity": __1, "round_id": __2, "active": _old_active_0, "continuations": _continuations_0, "waiting": __3, "background_available": _old_background_0, "lease": __4, "leased_id": __5, "last_surface": __6, "last_id": __7, "background_submitted": __8}, _own_item_0));
  const _opening_0 = ($Flow_opened(_old_active_0, _mid_active_0, _round_id_0));
  const _emitted_0 = ($Flow_emission(_event_0, _own_item_0));
  const _started_source_0 = ($Flow_schedule_source(_event_0, _next_id_0, ($Flow_ids({$: "Flow.EditQueue"}, _old_packets_0)), _mid_packets_0));
  const _started_review_0 = ($Flow_schedule_review(_event_0, _own_item_0, ($Flow_ids({$: "Flow.ReviewQueue"}, _old_packets_0)), _mid_packets_0));
  const _finished_0 = ($Flow_finish_changes(_event_0, _continuations_0, _decision_0, {$: "Flow.Flow", "packets": _mid_packets_0, "next_id": __9, "source_capacity": __10, "review_capacity": __11, "round_id": _round_id_0, "active": _mid_active_0, "continuations": __12, "waiting": __13, "background_available": __14, "lease": __15, "leased_id": __16, "last_surface": __17, "last_id": __18, "background_submitted": __19}));
  const _background_0 = ($Flow_background_start(_event_0, _old_background_0, _own_item_0));
  return {$: "Con", "head": _own_0, "tail": ($List_append(_opening_0, ($List_append(_emitted_0, ($List_append(_started_source_0, ($List_append(_started_review_0, ($List_append(_finished_0, _background_0))))))))))};
}

function $Flow_changes(_before_0, _event_0, _selected_0, _result_0) {
  if (_result_0.$ === "Flow.Rejected") {
    return {$: "Nil"};
  } else {
    const _decision_0 = _result_0["decision"];
    const _mid_0 = _result_0["settled"];
    return $Flow_changes_accepted(_before_0, _event_0, _selected_0, _decision_0, _mid_0);
  }
}

function $Work_prepared_offer(_ready_0, _within_frame_0) {
  return $Bool_pick(($Bool_not(_ready_0)), {$: "Work.SkipPrepared"}, ($Bool_pick(_within_frame_0, {$: "Work.AdmitPrepared"}, {$: "Work.RejectPreparedCapacity"})));
}

function $Work_empty_prepared(_ready_count_0, _has_non_skipped_0, _authority_bound_0) {
  return $Bool_pick(($Bool_and(($Nat_is_eq(_ready_count_0, 0)), ($Bool_and(_has_non_skipped_0, _authority_bound_0)))), {$: "Work.FailEmptyLost"}, {$: "Work.NoEmptyFailure"});
}

function $Work_evaluated_disposition(_has_findings_0, _current_work_0) {
  return $Bool_pick(_has_findings_0, ($Bool_pick(_current_work_0, {$: "Work.FindingRetained"}, {$: "Work.StaleFindingRetired"})), ($Bool_pick(_current_work_0, {$: "Work.ClearSettled"}, {$: "Work.StaleClearSettled"})));
}

function $Work_failure_disposition(_backend_or_timeout_0, _credential_0, _missing_0) {
  return $Bool_pick(_backend_or_timeout_0, {$: "Work.BackendUnavailable"}, ($Bool_pick(_credential_0, {$: "Work.CredentialUnavailable"}, ($Bool_pick(_missing_0, {$: "Work.LostUnavailable"}, {$: "Work.NoFailure"})))));
}

function $Work_initial() {
  return {$: "Work.Work", "next_observation": 1, "next_unit": 1, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Nil"}};
}

function $Work_is_source_reading(_stage_0) {
  if (_stage_0.$ === "Work.SourceQueued") {
    return false;
  } else {
    return true;
  }
}

function $Work_is_at_jev(_stage_0) {
  if (_stage_0.$ === "Work.ReviewServiceRequestOutstanding") {
    return true;
  } else {
    return false;
  }
}

function $Work_is_unit_unfinished(_stage_0) {
  if (_stage_0.$ === "Work.ReviewQueued") {
    return true;
  } else if (_stage_0.$ === "Work.ReviewServiceRequestOutstanding") {
    return true;
  } else {
    return false;
  }
}

function $Work_reading_count(_observations_0) {
  if (_observations_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _observations_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    const _x_0 = ($Bool_pick(($Work_is_source_reading(_stage_0)), 1, 0));
    const _x_1 = ($Work_reading_count(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Work_at_jev_count(_units_0) {
  if (_units_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _units_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _units_0["tail"];
    const _x_0 = ($Bool_pick(($Work_is_at_jev(_stage_0)), 1, 0));
    const _x_1 = ($Work_at_jev_count(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Work_unfinished_observations(_observations_0) {
  return $List_length(_observations_0);
}

function $Work_unfinished_units(_units_0) {
  if (_units_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _units_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _units_0["tail"];
    const _x_0 = ($Bool_pick(($Work_is_unit_unfinished(_stage_0)), 1, 0));
    const _x_1 = ($Work_unfinished_units(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Work_unfinished(_work_0) {
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _x_0 = ($Work_unfinished_observations(_observations_0));
  const _x_1 = ($Work_unfinished_units(_units_0));
  return nat_chk(_x_0 + _x_1);
}

function $Work_finish_wait(_unfinished_0, _deadline_reached_0, _continuation_budget_0) {
  return $Bool_and(_continuation_budget_0, ($Bool_and(($Bool_not(_deadline_reached_0)), ($Nat_is_gt(_unfinished_0, 0)))));
}

function $Work_pending_findings_in($0) {
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
          const _x_0 = ($Work_pending_findings_in(_rest_0));
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

function $Work_pending_findings(_work_0) {
  const _units_0 = _work_0["units"];
  return $Work_pending_findings_in(_units_0);
}

function $Work_fill_source(_observations_0, _capacity_0, _occupied_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _id_0 = _t_0["id"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      const _rest_0 = _observations_0["tail"];
      const _room_0 = ($Flow_has_room(_occupied_0, _capacity_0));
      const _next_stage_0 = ($Bool_pick(_room_0, {$: "Work.SourceReading"}, {$: "Work.SourceQueued"}));
      const _x_0 = ($Bool_pick(_room_0, 1, 0));
      return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": _next_stage_0}, "tail": ($Work_fill_source(_rest_0, _capacity_0, nat_chk(_occupied_0 + _x_0)))};
    } else {
      const _rest_1 = _observations_0["tail"];
      return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": {$: "Work.SourceReading"}}, "tail": ($Work_fill_source(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $Work_fill_review(_units_0, _capacity_0, _occupied_0) {
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
      const _room_0 = ($Flow_has_room(_occupied_0, _capacity_0));
      const _next_stage_0 = ($Bool_pick(_room_0, {$: "Work.ReviewServiceRequestOutstanding"}, {$: "Work.ReviewQueued"}));
      const _x_0 = ($Bool_pick(_room_0, 1, 0));
      return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": _next_stage_0, "findings": _findings_0, "bytes": _bytes_0}, "tail": ($Work_fill_review(_rest_0, _capacity_0, nat_chk(_occupied_0 + _x_0)))};
    } else {
      const _findings_1 = _t_0["findings"];
      const _bytes_1 = _t_0["bytes"];
      const _rest_1 = _units_0["tail"];
      return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": _t_1, "findings": _findings_1, "bytes": _bytes_1}, "tail": ($Work_fill_review(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $Work_settle(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work_fill_source(_observations_0, _source_capacity_0, ($Work_reading_count(_observations_0)))), "units": ($Work_fill_review(_units_0, _review_capacity_0, ($Work_at_jev_count(_units_0))))};
}

function $Work_admit(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": ($Work_settle({$: "Work.Work", "next_observation": nat_chk(_next_observation_0 + 1), "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($List_append(_observations_0, {$: "Con", "head": {$: "Work.Observation", "id": _next_observation_0, "stage": {$: "Work.SourceQueued"}}, "tail": {$: "Nil"}})), "units": _units_0})), "admitted": {$: "Con", "head": _next_observation_0, "tail": {$: "Nil"}}};
}

function $Work_find_observation(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $Bool_pick(($Nat_is_eq(_current_0, _id_0)), {$: "Some", "value": {$: "Work.Observation", "id": _current_0, "stage": __0}}, ($Work_find_observation(_id_0, _rest_0)));
  }
}

function $Work_start_observation_read(_observation_0, _tail_0) {
  const _id_0 = _observation_0["id"];
  return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": {$: "Work.SourceReading"}}, "tail": _tail_0};
}

function $Work_start_observation_pick(_observation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return $Work_start_observation_read(_observation_0, _tail_0);
  } else {
    return {$: "Con", "head": _observation_0, "tail": _tail_0};
  }
}

function $Work_start_observation(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $Work_start_observation_pick({$: "Work.Observation", "id": _current_0, "stage": __0}, ($Work_start_observation(_id_0, _rest_0)), ($Nat_is_eq(_current_0, _id_0)));
  }
}

function $Work_start_source_apply(_work_0, _id_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work_start_observation(_id_0, _observations_0)), "units": _units_0}, "admitted": {$: "Nil"}};
}

function $Work_start_source_found(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    return $Work_start_source_apply(_work_0, _id_0);
  }
}

function $Work_start_source(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work_start_source_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($Work_find_observation(_id_0, _observations_0)));
}

function $Work_remove_observation_pick(_observation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _observation_0, "tail": _tail_0};
  }
}

function $Work_remove_observation(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $Work_remove_observation_pick({$: "Work.Observation", "id": _current_0, "stage": __0}, ($Work_remove_observation(_id_0, _rest_0)), ($Nat_is_eq(_current_0, _id_0)));
  }
}

function $Work_make_units(_count_0, _observation_0, _next_id_0) {
  if (_count_0 === 0) {
    return {$: "Nil"};
  } else {
    const _rest_0 = (_count_0 - 1);
    return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _next_id_0, "observation": _observation_0, "stage": {$: "Work.ReviewQueued"}, "findings": 0, "bytes": 0}, "tail": ($Work_make_units(_rest_0, _observation_0, nat_chk(_next_id_0 + 1)))};
  }
}

function $Work_unit_ids(_units_0) {
  if (_units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _units_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _units_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($Work_unit_ids(_rest_0))};
  }
}

function $Work_prepare_apply(_work_0, _observation_0, _count_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _new_units_0 = ($Work_make_units(_count_0, _observation_0, _next_unit_0));
  return {$: "Work.Accepted", "state": ($Work_settle({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + _count_0), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work_remove_observation(_observation_0, _observations_0)), "units": ($List_append(_units_0, _new_units_0))})), "admitted": ($Work_unit_ids(_new_units_0))};
}

function $Work_prepare_count(_work_0, _observation_0, _count_0, _within_limit_0) {
  if (!_within_limit_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.TooManyUnits"}};
  } else {
    return $Work_prepare_apply(_work_0, _observation_0, _count_0);
  }
}

function $Work_prepare_stage(_work_0, _observation_0, _count_0, _stage_0) {
  if (_stage_0.$ === "Work.SourceQueued") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
  } else {
    return $Work_prepare_count(_work_0, _observation_0, _count_0, ($Nat_is_le(_count_0, 16)));
  }
}

function $Work_prepare_found(_work_0, _observation_0, _count_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _stage_0 = _t_0["stage"];
    return $Work_prepare_stage(_work_0, _observation_0, _count_0, _stage_0);
  }
}

function $Work_prepare(_work_0, _observation_0, _count_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work_prepare_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, ($Work_find_observation(_observation_0, _observations_0)));
}

function $Work_spawn_apply(_work_0, _observation_0, _count_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _new_units_0 = ($Work_make_units(_count_0, _observation_0, _next_unit_0));
  return {$: "Work.Accepted", "state": ($Work_settle({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + _count_0), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($List_append(_units_0, _new_units_0))})), "admitted": ($Work_unit_ids(_new_units_0))};
}

function $Work_spawn_count(_work_0, _observation_0, _count_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.TooManyUnits"}};
  } else {
    return $Work_spawn_apply(_work_0, _observation_0, _count_0);
  }
}

function $Work_spawn_found(_work_0, _observation_0, _count_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $Work_spawn_count(_work_0, _observation_0, _count_0, ($Nat_is_le(_count_0, 16)));
    }
  }
}

function $Work_spawn(_work_0, _observation_0, _count_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work_spawn_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, ($Work_find_observation(_observation_0, _observations_0)));
}

function $Work_find_unit(_id_0, _units_0) {
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
    return $Bool_pick(($Nat_is_eq(_current_0, _id_0)), {$: "Some", "value": {$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}}, ($Work_find_unit(_id_0, _rest_0)));
  }
}

function $Work_pending_for_found(_found_0) {
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

function $Work_pending_for(_work_0, _id_0) {
  const _units_0 = _work_0["units"];
  return $Work_pending_for_found(($Work_find_unit(_id_0, _units_0)));
}

function $Work_replace_unit_pick(_unit_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $Work_replace_unit(_id_0, _replacement_0, _units_0) {
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
    return $Work_replace_unit_pick({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, _replacement_0, ($Work_replace_unit(_id_0, _replacement_0, _rest_0)), ($Nat_is_eq(_current_0, _id_0)));
  }
}

function $Work_outcome_apply(_work_0, _unit_0) {
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
  return {$: "Work.Accepted", "state": ($Work_settle({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($Work_replace_unit(_id_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, _units_0))})), "admitted": {$: "Nil"}};
}

function $Work_start_unit_apply(_work_0, _id_0, _observation_0) {
  return $Work_outcome_apply(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.ReviewServiceRequestOutstanding"}, "findings": 0, "bytes": 0});
}

function $Work_start_unit_stage(_work_0, _id_0, _observation_0, _stage_0) {
  if (_stage_0.$ === "Work.ReviewQueued") {
    return $Work_start_unit_apply(_work_0, _id_0, _observation_0);
  } else if (_stage_0.$ === "Work.ReviewServiceRequestOutstanding") {
    return {$: "Work.Accepted", "state": _work_0, "admitted": {$: "Nil"}};
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotReviewServiceRequestOutstanding"}};
  }
}

function $Work_start_unit_found(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work_start_unit_stage(_work_0, _id_0, _observation_0, _stage_0);
  }
}

function $Work_start_unit(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work_start_unit_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($Work_find_unit(_id_0, _units_0)));
}

function $Work_outcome_finding(_work_0, _id_0, _observation_0, _count_0, _bytes_0, _positive_0) {
  if (!_positive_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $Work_outcome_apply(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0});
  }
}

function $Work_outcome_kind(_work_0, _id_0, _observation_0, _result_0) {
  if (_result_0.$ === "Work.Finding") {
    const _count_0 = _result_0["count"];
    const _bytes_0 = _result_0["bytes"];
    return $Work_outcome_finding(_work_0, _id_0, _observation_0, _count_0, _bytes_0, ($Nat_is_gt(_count_0, 0)));
  } else if (_result_0.$ === "Work.Clear") {
    return $Work_outcome_apply(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.ClearResult"}, "findings": 0, "bytes": 0});
  } else {
    return $Work_outcome_apply(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.UnavailableResult"}, "findings": 0, "bytes": 0});
  }
}

function $Work_outcome_stage(_work_0, _id_0, _observation_0, _stage_0, _result_0) {
  if (_stage_0.$ === "Work.ReviewServiceRequestOutstanding") {
    return $Work_outcome_kind(_work_0, _id_0, _observation_0, _result_0);
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotReviewServiceRequestOutstanding"}};
  }
}

function $Work_outcome_found(_work_0, _id_0, _result_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work_outcome_stage(_work_0, _id_0, _observation_0, _stage_0, _result_0);
  }
}

function $Work_outcome(_work_0, _id_0, _result_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work_outcome_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, _result_0, ($Work_find_unit(_id_0, _units_0)));
}

function $Work_revise_finding_valid(_work_0, _id_0, _observation_0, _count_0, _bytes_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $Work_outcome_apply(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0});
  }
}

function $Work_revise_finding_stage(_work_0, _id_0, _observation_0, _stage_0, _count_0, _bytes_0) {
  if (_stage_0.$ === "Work.PendingFinding") {
    return $Work_revise_finding_valid(_work_0, _id_0, _observation_0, _count_0, _bytes_0, ($Nat_is_gt(_count_0, 0)));
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotReviewServiceRequestOutstanding"}};
  }
}

function $Work_revise_finding_found(_work_0, _id_0, _count_0, _bytes_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work_revise_finding_stage(_work_0, _id_0, _observation_0, _stage_0, _count_0, _bytes_0);
  }
}

function $Work_revise_finding(_work_0, _id_0, _count_0, _bytes_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work_revise_finding_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, _count_0, _bytes_0, ($Work_find_unit(_id_0, _units_0)));
}

function $Work_interrupt_unit_stage(_work_0, _id_0, _observation_0, _stage_0) {
  if (_stage_0.$ === "Work.ReviewServiceRequestOutstanding") {
    return $Work_outcome_apply(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.InterruptedResult"}, "findings": 0, "bytes": 0});
  } else if (_stage_0.$ === "Work.ReviewQueued") {
    return $Work_outcome_apply(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.InterruptedResult"}, "findings": 0, "bytes": 0});
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotReviewServiceRequestOutstanding"}};
  }
}

function $Work_interrupt_unit_found(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $Work_interrupt_unit_stage(_work_0, _id_0, _observation_0, _stage_0);
  }
}

function $Work_interrupt_unit(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work_interrupt_unit_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($Work_find_unit(_id_0, _units_0)));
}

function $Work_interrupt_observation_found(_work_0, _id_0, _found_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.MissingObservation"}};
  } else {
    return {$: "Work.Accepted", "state": ($Work_settle({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($Work_remove_observation(_id_0, _observations_0)), "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $Work_interrupt_observation(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work_interrupt_observation_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($Work_find_observation(_id_0, _observations_0)));
}

function $Work_complete_source_found(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $Work_interrupt_observation(_work_0, _id_0);
    }
  }
}

function $Work_complete_source(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work_complete_source_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($Work_find_observation(_id_0, _observations_0)));
}

function $Work_cached_finding_apply(_work_0, _observation_0, _count_0, _bytes_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + 1), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($List_append(_units_0, {$: "Con", "head": {$: "Work.ReviewUnit", "id": _next_unit_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0}, "tail": {$: "Nil"}}))}, "admitted": {$: "Con", "head": _next_unit_0, "tail": {$: "Nil"}}};
}

function $Work_cached_finding_count(_work_0, _observation_0, _count_0, _bytes_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $Work_cached_finding_apply(_work_0, _observation_0, _count_0, _bytes_0);
  }
}

function $Work_cached_finding_found(_work_0, _observation_0, _count_0, _bytes_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $Work_cached_finding_count(_work_0, _observation_0, _count_0, _bytes_0, ($Nat_is_gt(_count_0, 0)));
    }
  }
}

function $Work_cached_finding(_work_0, _observation_0, _count_0, _bytes_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $Work_cached_finding_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, _bytes_0, ($Work_find_observation(_observation_0, _observations_0)));
}

function $Work_remove_unit_pick(_unit_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $Work_remove_unit(_id_0, _units_0) {
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
    return $Work_remove_unit_pick({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, ($Work_remove_unit(_id_0, _rest_0)), ($Nat_is_eq(_current_0, _id_0)));
  }
}

function $Work_retire_apply(_work_0, _id_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($Work_remove_unit(_id_0, _units_0))}, "admitted": {$: "Nil"}};
}

function $Work_retire_stage(_work_0, _id_0, _unfinished_0) {
  if (_unfinished_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitStillUnfinished"}};
  } else {
    return $Work_retire_apply(_work_0, _id_0);
  }
}

function $Work_retire_found(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _stage_0 = _t_0["stage"];
    return $Work_retire_stage(_work_0, _id_0, ($Work_is_unit_unfinished(_stage_0)));
  }
}

function $Work_retire(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $Work_retire_found({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($Work_find_unit(_id_0, _units_0)));
}

function $Work_set_source_capacity_apply(_work_0, _capacity_0, _valid_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.InvalidCapacity"}};
  } else {
    return {$: "Work.Accepted", "state": ($Work_settle({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $Work_set_source_capacity(_work_0, _capacity_0) {
  return $Work_set_source_capacity_apply(_work_0, _capacity_0, ($Flow_capacity_valid(_capacity_0)));
}

function $Work_set_review_capacity_apply(_work_0, _capacity_0, _valid_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.InvalidCapacity"}};
  } else {
    return {$: "Work.Accepted", "state": ($Work_settle({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _capacity_0, "observations": _observations_0, "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $Work_set_review_capacity(_work_0, _capacity_0) {
  return $Work_set_review_capacity_apply(_work_0, _capacity_0, ($Flow_capacity_valid(_capacity_0)));
}

function $Work_source_cancel_ids($0) {
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
          return {$: "Con", "head": _id_0, "tail": ($Work_source_cancel_ids(_rest_0))};
        } else {
          const _rest_1 = _observations_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Work_observation_ids(_observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _observations_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($Work_observation_ids(_rest_0))};
  }
}

function $Work_unfinished_unit_ids($0) {
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
          return {$: "Con", "head": _id_0, "tail": ($Work_unfinished_unit_ids(_rest_0))};
        } else if (_t_1.$ === "Work.ReviewServiceRequestOutstanding") {
          const _rest_1 = _units_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($Work_unfinished_unit_ids(_rest_1))};
        } else {
          const _rest_2 = _units_0["tail"];
          $0 = _rest_2;
          continue;
        }
      }
    }
  }
}

function $Work_keep_terminal_pick(_unit_0, _tail_0, _unfinished_0) {
  if (_unfinished_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $Work_keep_terminal(_units_0) {
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
    return $Work_keep_terminal_pick({$: "Work.ReviewUnit", "id": __0, "observation": __1, "stage": _stage_0, "findings": __2, "bytes": __3}, ($Work_keep_terminal(_rest_0)), ($Work_is_unit_unfinished(_stage_0)));
  }
}

function $Work_cancel_unfinished(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Cancelled", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": {$: "Nil"}, "units": ($Work_keep_terminal(_units_0))}, "cancelled_source": ($Work_observation_ids(_observations_0)), "cancelled_jev": ($Work_unfinished_unit_ids(_units_0))};
}

function $Work_jev_cancel_ids($0) {
  for (;;) {
    {
      const _units_0 = $0;
      if (_units_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _t_0 = _units_0["head"];
        const _id_0 = _t_0["id"];
        const _t_1 = _t_0["stage"];
        if (_t_1.$ === "Work.ReviewServiceRequestOutstanding") {
          const _rest_0 = _units_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($Work_jev_cancel_ids(_rest_0))};
        } else {
          const _rest_1 = _units_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Work_discarded_finding_ids($0) {
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
          return {$: "Con", "head": _id_0, "tail": ($Work_discarded_finding_ids(_rest_0))};
        } else {
          const _rest_1 = _units_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $Work_close(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Closed", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": {$: "Nil"}, "units": {$: "Nil"}}, "cancelled_source": ($Work_source_cancel_ids(_observations_0)), "cancelled_jev": ($Work_jev_cancel_ids(_units_0)), "discarded_findings": ($Work_discarded_finding_ids(_units_0))};
}

function $Work_main() {
  return $Work_admit(($Work_initial()));
}

function $Handoff_validation_route(_owner_current_0, _status_0) {
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

function $Handoff_post_validation(_work_accepted_0, _expired_0, _has_fitting_0) {
  const _x_0 = ($Bool_not(_work_accepted_0));
  return $Bool_pick((_x_0 || _expired_0), {$: "Handoff.RetireCandidate"}, ($Bool_pick(_has_fitting_0, {$: "Handoff.RetainCandidate"}, {$: "Handoff.ReleaseCandidate"})));
}

function $Handoff_final_candidate(_owner_current_0, _credential_generation_0, _credential_authorized_0, _expired_0, _work_current_0, _has_findings_0) {
  const _x_0 = ($Bool_not(_work_current_0));
  return $Bool_pick(($Bool_not(_owner_current_0)), {$: "Handoff.IgnoreCandidate"}, ($Bool_pick(($Bool_not(_credential_generation_0)), {$: "Handoff.RetireCandidate"}, ($Bool_pick(($Bool_not(_credential_authorized_0)), {$: "Handoff.ReleaseCandidate"}, ($Bool_pick((_expired_0 || _x_0), {$: "Handoff.RetireCandidate"}, ($Bool_pick(_has_findings_0, {$: "Handoff.RetainCandidate"}, {$: "Handoff.ReleaseCandidate"})))))))));
}

function $Handoff_initial(_partition_0, _round_0) {
  return {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": {$: "Nil"}, "retained": {$: "Nil"}, "findings": 0, "bytes": 0};
}

function $Handoff_current(_advice_0, _partition_0, _round_0) {
  const _source_partition_0 = _advice_0["partition"];
  const _source_round_0 = _advice_0["round"];
  const _source_snapshot_0 = _advice_0["snapshot"];
  const _current_snapshot_0 = _advice_0["current_snapshot"];
  const _source_credential_0 = _advice_0["credential"];
  const _current_credential_0 = _advice_0["current_credential"];
  const _age_ms_0 = _advice_0["age_ms"];
  const _ready_0 = _advice_0["collection_ready"];
  return $Bool_and(($Nat_is_eq(_source_partition_0, _partition_0)), ($Bool_and(($Nat_is_eq(_source_round_0, _round_0)), ($Bool_and(($Nat_is_eq(_source_snapshot_0, _current_snapshot_0)), ($Bool_and(($Nat_is_eq(_source_credential_0, _current_credential_0)), ($Bool_and((_age_ms_0 < 600000), _ready_0)))))))));
}

function $Handoff_fits_batch(_items_0, _bytes_0) {
  return $Bool_and(($Nat_is_gt(_items_0, 0)), ($Nat_is_le(_bytes_0, 10240)));
}

function $Handoff_notice_offer(_items_0, _bytes_0, _skip_unfitting_0) {
  return $Bool_pick(($Handoff_fits_batch(_items_0, _bytes_0)), {$: "Handoff.IncludeNotice"}, ($Bool_pick(_skip_unfitting_0, {$: "Handoff.SkipNotice"}, {$: "Handoff.StopNotices"})));
}

function $Handoff_select_fit(_state_0, _id_0, _prospective_bytes_0, _fits_0) {
  const _partition_0 = _state_0["partition"];
  const _round_0 = _state_0["round"];
  const _selected_0 = _state_0["selected"];
  const _retained_0 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const _bytes_0 = _state_0["bytes"];
  if (_fits_0) {
    return {$: "Handoff.Selected", "state": {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": ($List_append(_selected_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})), "retained": _retained_0, "findings": nat_chk(_count_0 + 1), "bytes": _prospective_bytes_0}};
  } else {
    return {$: "Handoff.Retained", "state": {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": ($List_append(_retained_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})), "findings": _count_0, "bytes": _bytes_0}};
  }
}

function $Handoff_select_limit(_state_0, _id_0) {
  const _partition_0 = _state_0["partition"];
  const _round_0 = _state_0["round"];
  const _selected_0 = _state_0["selected"];
  const _retained_0 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const _bytes_0 = _state_0["bytes"];
  return {$: "Handoff.Limited", "state": {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": ($List_append(_retained_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})), "findings": _count_0, "bytes": _bytes_0}, "id": _id_0};
}

function $Handoff_select_solo(_state_0, _id_0, _prospective_bytes_0, _count_0, _oversized_0) {
  if (_oversized_0) {
    return $Handoff_select_limit(_state_0, _id_0);
  } else {
    return $Handoff_select_fit(_state_0, _id_0, _prospective_bytes_0, ($Handoff_fits_batch(nat_chk(_count_0 + 1), _prospective_bytes_0)));
  }
}

function $Handoff_select_valid(_state_0, _id_0, _prospective_bytes_0, _solo_bytes_0, _count_0, _valid_0) {
  if (_valid_0) {
    return $Handoff_select_solo(_state_0, _id_0, _prospective_bytes_0, _count_0, ($Nat_is_gt(_solo_bytes_0, 10240)));
  } else {
    return {$: "Handoff.Expired", "state": _state_0};
  }
}

function $Handoff_select_current(_state_0, _advice_0, _prospective_bytes_0, _valid_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["round"];
  const __2 = _state_0["selected"];
  const __3 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const __4 = _state_0["bytes"];
  const _id_0 = _advice_0["id"];
  const _solo_bytes_0 = _advice_0["solo_bytes"];
  return $Handoff_select_valid({$: "Handoff.Selection", "partition": __0, "round": __1, "selected": __2, "retained": __3, "findings": _count_0, "bytes": __4}, _id_0, _prospective_bytes_0, _solo_bytes_0, _count_0, _valid_0);
}

function $Handoff_contains(_id_0, _ids_0) {
  return $List_contains_0(_ids_0, _id_0);
}

function $Handoff_select_duplicate(_state_0, _advice_0, _prospective_bytes_0, _current_0, _duplicate_0) {
  if (_duplicate_0) {
    return {$: "Handoff.Duplicate", "state": _state_0};
  } else {
    return $Handoff_select_current(_state_0, _advice_0, _prospective_bytes_0, _current_0);
  }
}

function $Handoff_select(_state_0, _advice_0, _prospective_bytes_0) {
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
  const _x_0 = run_loop($Handoff_contains(_id_0, _selected_0));
  const _x_1 = run_loop($Handoff_contains(_id_0, _retained_0));
  return $Handoff_select_duplicate({$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": _retained_0, "findings": __0, "bytes": __1}, {$: "Handoff.FindingCandidate", "id": _id_0, "unit": __2, "partition": __3, "round": __4, "snapshot": __5, "current_snapshot": __6, "credential": __7, "current_credential": __8, "age_ms": __9, "solo_bytes": __10, "collection_ready": __11}, _prospective_bytes_0, ($Handoff_current({$: "Handoff.FindingCandidate", "id": _id_0, "unit": __2, "partition": __3, "round": __4, "snapshot": __5, "current_snapshot": __6, "credential": __7, "current_credential": __8, "age_ms": __9, "solo_bytes": __10, "collection_ready": __11}, _partition_0, _round_0)), (_x_0 || _x_1));
}

function $Handoff_finish_initial(_round_0) {
  return {$: "Handoff.Finish", "round": _round_0, "active": true, "closed": false, "continuations": 0, "reserved": false, "token": 0, "collector": 0, "deadline_at": 0};
}

function $Handoff_finish_choose_check(_state_0, _can_continue_0) {
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

function $Handoff_finish_choose(_state_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const __3 = _state_0["reserved"];
  const __4 = _state_0["token"];
  const __5 = _state_0["collector"];
  const __6 = _state_0["deadline_at"];
  return $Handoff_finish_choose_check({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": _continuations_0, "reserved": __3, "token": __4, "collector": __5, "deadline_at": __6}, ($Bool_and(($Nat_is_gt(_actionable_findings_0, 0)), (_continuations_0 < 4))));
}

function $Handoff_finish_zero(_state_0, _actionable_findings_0, _zero_0) {
  if (_zero_0) {
    return $Handoff_finish_choose(_state_0, _actionable_findings_0);
  } else {
    return {$: "Handoff.FinishWait", "state": _state_0};
  }
}

function $Handoff_finish_ready(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0) {
  if (_deadline_0) {
    return $Handoff_finish_choose(_state_0, _actionable_findings_0);
  } else {
    return $Handoff_finish_zero(_state_0, _actionable_findings_0, ($Nat_is_eq(_unfinished_0, 0)));
  }
}

function $Handoff_finish_pending(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0) {
  if (_reserved_0) {
    return {$: "Handoff.FinishWait", "state": _state_0};
  } else {
    return $Handoff_finish_ready(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0);
  }
}

function $Handoff_finish_guard(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _valid_0, _reserved_0) {
  if (_valid_0) {
    return $Handoff_finish_pending(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0);
  } else {
    return {$: "Handoff.Allow", "state": _state_0};
  }
}

function $Handoff_finish_decide(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const __2 = _state_0["token"];
  const __3 = _state_0["collector"];
  const __4 = _state_0["deadline_at"];
  return $Handoff_finish_guard({$: "Handoff.Finish", "round": __0, "active": _active_0, "closed": _closed_0, "continuations": __1, "reserved": _reserved_0, "token": __2, "collector": __3, "deadline_at": __4}, _unfinished_0, _deadline_0, _actionable_findings_0, ($Bool_and(_active_0, ($Bool_not(_closed_0)))), _reserved_0);
}

function $Handoff_finish_start_choose(_state_0, _original_deadline_0, _first_0) {
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

function $Handoff_finish_start(_state_0, _original_deadline_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return $Handoff_finish_start_choose({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": _deadline_at_0}, _original_deadline_0, ($Nat_is_eq(_deadline_at_0, 0)));
}

function $Handoff_finish_at(_state_0, _unfinished_0, _now_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return $Handoff_finish_decide({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": _deadline_at_0}, _unfinished_0, ($Nat_is_ge(_now_0, _deadline_at_0)), _actionable_findings_0);
}

function $Handoff_finish_decide_at(_state_0, _unfinished_0, _now_0, _original_deadline_0, _actionable_findings_0) {
  return $Handoff_finish_at(($Handoff_finish_start(_state_0, _original_deadline_0)), _unfinished_0, _now_0, _actionable_findings_0);
}

function $Handoff_finish_bind_writer(_state_0, _writer_0) {
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _token_0 = _state_0["token"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": _continuations_0, "reserved": _reserved_0, "token": nat_chk(_token_0 + 1), "collector": _writer_0, "deadline_at": _deadline_at_0};
}

function $Handoff_finish_complete_check(_state_0, _valid_0) {
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

function $Handoff_finish_can_complete(_state_0, _round_0, _slot_0, _token_0, _collector_0) {
  const _own_round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _own_token_0 = _state_0["token"];
  const _own_collector_0 = _state_0["collector"];
  return $Bool_and(($Nat_is_eq(_own_round_0, _round_0)), ($Bool_and(_active_0, ($Bool_and(($Bool_not(_closed_0)), ($Bool_and(_reserved_0, ($Bool_and(($Nat_is_eq(_continuations_0, _slot_0)), ($Bool_and(($Nat_is_eq(_own_token_0, _token_0)), ($Nat_is_eq(_own_collector_0, _collector_0)))))))))))));
}

function $Handoff_finish_complete(_state_0, _round_0, _slot_0, _token_0, _collector_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const __7 = _state_0["deadline_at"];
  return $Handoff_finish_complete_check({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": __7}, ($Handoff_finish_can_complete({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": __7}, _round_0, _slot_0, _token_0, _collector_0)));
}

function $Handoff_main() {
  return $Handoff_finish_decide(($Handoff_finish_initial(1)), 0, false, 1);
}

function $Handoff_lease_initial(_item_0, _round_0) {
  return {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": false, "reoffered": false, "phase": {$: "Handoff.Available"}};
}

function $Handoff_lease_reserve_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _surface_0) {
  if (_phase_0.$ === "Handoff.Available") {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_reserve_guard(_state_0, _token_0, _surface_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff_lease_reserve_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _surface_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_reserve(_state_0, _round_0, _token_0, _surface_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff_lease_reserve_guard({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _surface_0, ($Bool_and(($Nat_is_eq(_own_round_0, _round_0)), ($Bool_not(_closed_0)))));
}

function $Handoff_lease_authorize_match(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0) {
  if (_same_0) {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Authorized", "token": _own_token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _own_token_0, "surface": _surface_0}}};
  }
}

function $Handoff_lease_authorize_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Reserved") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $Handoff_lease_authorize_match(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat_is_eq(_own_token_0, _token_0)));
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_authorize_guard(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff_lease_authorize_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_authorize(_state_0, _round_0, _token_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff_lease_authorize_guard({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, ($Bool_and(($Nat_is_eq(_own_round_0, _round_0)), ($Bool_not(_closed_0)))));
}

function $Handoff_lease_release_match(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0) {
  if (_same_0) {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Available"}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _own_token_0, "surface": _surface_0}}};
  }
}

function $Handoff_lease_release_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Reserved") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $Handoff_lease_release_match(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat_is_eq(_own_token_0, _token_0)));
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_release_guard(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff_lease_release_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_release(_state_0, _round_0, _token_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff_lease_release_guard({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, ($Bool_and(($Nat_is_eq(_own_round_0, _round_0)), ($Bool_not(_closed_0)))));
}

function $Handoff_lease_terminal_match(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0, _certain_0) {
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

function $Handoff_lease_terminal_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _certain_0) {
  if (_phase_0.$ === "Handoff.Authorized") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $Handoff_lease_terminal_match(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat_is_eq(_own_token_0, _token_0)), _certain_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_terminal_guard(_state_0, _token_0, _certain_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff_lease_terminal_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _certain_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_terminal(_state_0, _round_0, _token_0, _certain_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $Handoff_lease_terminal_guard({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _certain_0, ($Bool_and(($Nat_is_eq(_own_round_0, _round_0)), ($Bool_not(_closed_0)))));
}

function $Handoff_lease_reoffer_surface(_item_0, _round_0, _closed_0, _reoffered_0, _surface_0, _uncertain_0, _token_0) {
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

function $Handoff_lease_reoffer_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Submitted") {
    const _surface_0 = _phase_0["surface"];
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Submitted", "surface": _surface_0}}};
  } else if (_phase_0.$ === "Handoff.Uncertain") {
    const _surface_1 = _phase_0["surface"];
    return $Handoff_lease_reoffer_surface(_item_0, _round_0, _closed_0, _reoffered_0, _surface_1, true, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_reoffer_guard(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $Handoff_lease_reoffer_phase(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $Handoff_lease_reoffer(_state_0, _round_0, _token_0, _fresh_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const __1 = _state_0["phase"];
  return $Handoff_lease_reoffer_guard({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": __1}, _token_0, ($Bool_and(($Nat_is_eq(_own_round_0, _round_0)), ($Bool_and(($Bool_not(_closed_0)), ($Bool_and(($Bool_not(_reoffered_0)), _fresh_0)))))));
}

function $Handoff_lease_offer_background(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return $Handoff_lease_reoffer(_state_0, _round_0, _token_0, _fresh_0);
  } else {
    return $Handoff_lease_reserve(_state_0, _round_0, _token_0, _surface_0);
  }
}

function $Handoff_lease_offer_phase(_state_0, _round_0, _token_0, _surface_0, _fresh_0, _phase_0) {
  if (_phase_0.$ === "Handoff.Uncertain") {
    const _t_0 = _phase_0["surface"];
    if (_t_0.$ === "Handoff.Background") {
      return $Handoff_lease_offer_background(_state_0, _round_0, _token_0, _surface_0, _fresh_0);
    } else {
      return $Handoff_lease_reserve(_state_0, _round_0, _token_0, _surface_0);
    }
  } else {
    return $Handoff_lease_reserve(_state_0, _round_0, _token_0, _surface_0);
  }
}

function $Handoff_lease_offer(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  const __0 = _state_0["item"];
  const __1 = _state_0["round"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  return $Handoff_lease_offer_phase({$: "Handoff.Lease", "item": __0, "round": __1, "closed": __2, "reoffered": __3, "phase": _phase_0}, _round_0, _token_0, _surface_0, _fresh_0, _phase_0);
}

function $Handoff_lease_close(_state_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  return {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": true, "reoffered": _reoffered_0, "phase": _phase_0};
}

function $Handoff_lease_suppress_surface(_own_0, _requested_0) {
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

function $Handoff_lease_suppress_phase(_phase_0, _requested_0) {
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
    return $Handoff_lease_suppress_surface(_surface_0, _requested_0);
  }
}

function $Handoff_lease_suppresses(_state_0, _round_0, _requested_0) {
  const _owner_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _phase_0 = _state_0["phase"];
  return $Bool_and(($Nat_is_eq(_owner_0, _round_0)), ($Bool_and(($Bool_not(_closed_0)), ($Handoff_lease_suppress_phase(_phase_0, _requested_0)))));
}

function $Handoff_drop_source_cache(_remaining_0, _aborted_0) {
  if (_aborted_0) {
    return true;
  } else {
    return $Nat_is_eq(_remaining_0, 0);
  }
}

function $Round_stop_terminal(_has_output_0, _authorized_0, _requested_close_0) {
  const _x_0 = ($Bool_and(_has_output_0, ($Bool_not(_authorized_0))));
  return {$: "Round.StopTerminal", "revoke_provisional": ($Bool_and(_has_output_0, ($Bool_not(_authorized_0)))), "close": (_requested_close_0 || _x_0)};
}

function $Round_expire_close(_barrier_0) {
  return $Bool_not(_barrier_0);
}

function $Round_initial() {
  return {$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false};
}

function $Round_max_continuations() {
  return 4;
}

function $Round_active(_state_0, _generation_0) {
  const _own_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  return $Bool_and(_live_0, ($Nat_is_eq(_own_0, _generation_0)));
}

function $Round_budget(_state_0) {
  const _live_0 = _state_0["active"];
  const _count_0 = _state_0["continuations"];
  const _x_0 = ($Round_max_continuations());
  return $Bool_and(_live_0, (_count_0 < _x_0));
}

function $Round_begin_stop(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool_pick(($Bool_and(_live_0, ($Bool_and(($Nat_is_eq(_owner_0, 0)), ($Nat_is_gt(_token_0, 0)))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _token_0, "barrier": false, "deciding": false, "output_reserved": false}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round_owns_stop(_state_0, _token_0) {
  const _live_0 = _state_0["active"];
  const _owner_0 = _state_0["stop_token"];
  const _deciding_0 = _state_0["deciding"];
  return $Bool_and(_live_0, ($Bool_and(($Nat_is_gt(_token_0, 0)), ($Bool_and(($Nat_is_eq(_owner_0, _token_0)), ($Bool_not(_deciding_0)))))));
}

function $Round_begin_decision(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool_pick(($Round_owns_stop({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}, _token_0)), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": true, "output_reserved": _output_0}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round_consume(_state_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  const _x_0 = ($Nat_is_gt(_owner_0, 0));
  return $Bool_pick(($Round_budget({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0})), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": nat_chk(_count_0 + 1), "stop_token": _owner_0, "barrier": (_barrier_0 || _x_0), "deciding": _deciding_0, "output_reserved": _output_0}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round_reserve_output(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool_pick(($Bool_and(_live_0, ($Bool_and(_deciding_0, ($Bool_and(($Nat_is_eq(_owner_0, _token_0)), ($Bool_and(($Nat_is_gt(_token_0, 0)), ($Bool_and(($Bool_not(_output_0)), ($Round_budget({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0})))))))))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": nat_chk(_count_0 + 1), "stop_token": _owner_0, "barrier": true, "deciding": _deciding_0, "output_reserved": true}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round_release_output(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool_pick(($Bool_and(_live_0, ($Bool_and(_deciding_0, ($Bool_and(($Nat_is_eq(_owner_0, _token_0)), ($Bool_and(($Nat_is_gt(_token_0, 0)), ($Bool_and(_output_0, ($Nat_is_gt(_count_0, 0)))))))))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": (_count_0 < 1 ? 0 : _count_0 - 1), "stop_token": _owner_0, "barrier": false, "deciding": _deciding_0, "output_reserved": false}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round_finish_stop(_state_0, _token_0, _close_0, _at_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool_pick(($Bool_and(($Nat_is_gt(_token_0, 0)), ($Nat_is_eq(_owner_0, _token_0)))), {$: "Round.Granted", "state": ($Bool_pick(_close_0, {$: "Round.Round", "generation": _generation_0, "active": false, "closed_at": _at_0, "continuations": _count_0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false}, {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false}))}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round_reopen(_state_0, _generation_0) {
  const _current_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool_pick(($Bool_and(($Bool_not(_live_0)), ($Nat_is_eq(_generation_0, nat_chk(_current_0 + 1))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": true, "closed_at": _closed_at_0, "continuations": 0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _current_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $Round_main() {
  return $Round_begin_stop(($Round_initial()), 1);
}

function $Lifecycle_cutoff_granted(_round_0, _result_0) {
  const _work_0 = _result_0["state"];
  const _source_0 = _result_0["cancelled_source"];
  const _jev_0 = _result_0["cancelled_jev"];
  return {$: "Lifecycle.CutoffGranted", "round": _round_0, "work": _work_0, "cancelled_source": _source_0, "cancelled_jev": _jev_0};
}

function $Lifecycle_cutoff_round(_work_0, _result_0) {
  if (_result_0.$ === "Round.Granted") {
    const _round_0 = _result_0["state"];
    return $Lifecycle_cutoff_granted(_round_0, ($Work_cancel_unfinished(_work_0)));
  } else {
    const _round_1 = _result_0["state"];
    return {$: "Lifecycle.CutoffDenied", "round": _round_1, "work": _work_0};
  }
}

function $Lifecycle_cutoff(_round_0, _work_0, _token_0) {
  return $Lifecycle_cutoff_round(_work_0, ($Round_begin_decision(_round_0, _token_0)));
}

function $Lifecycle_finish_gate_cutoff(_result_0) {
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

function $Lifecycle_finish_gate(_round_0, _work_0, _token_0, _extra_unfinished_0, _deadline_reached_0) {
  const _x_0 = ($Work_unfinished(_work_0));
  return $Bool_pick(($Round_owns_stop(_round_0, _token_0)), ($Bool_pick(($Work_finish_wait(nat_chk(_x_0 + _extra_unfinished_0), _deadline_reached_0, ($Round_budget(_round_0)))), {$: "Lifecycle.GateWaiting", "round": _round_0, "work": _work_0}, ($Lifecycle_finish_gate_cutoff(($Lifecycle_cutoff(_round_0, _work_0, _token_0)))))), {$: "Lifecycle.GateDenied", "round": _round_0, "work": _work_0});
}

function $Lifecycle_selected_count(_unit_0, _selected_0) {
  if (_selected_0.$ === "Nil") {
    return 0;
  } else {
    const _head_0 = _selected_0["head"];
    const _rest_0 = _selected_0["tail"];
    const _x_0 = ($Bool_pick(($Nat_is_eq(_head_0, _unit_0)), 1, 0));
    const _x_1 = ($Lifecycle_selected_count(_unit_0, _rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $Lifecycle_selected_valid(_work_0, _selected_0, _remaining_0) {
  if (_remaining_0.$ === "Nil") {
    return true;
  } else {
    const _unit_0 = _remaining_0["head"];
    const _rest_0 = _remaining_0["tail"];
    return $Bool_and(($Nat_is_gt(_unit_0, 0)), ($Bool_and(($Nat_is_le(($Lifecycle_selected_count(_unit_0, _selected_0)), ($Work_pending_for(_work_0, _unit_0)))), ($Lifecycle_selected_valid(_work_0, _selected_0, _rest_0)))));
  }
}

function $Lifecycle_reserve_selected(_round_0, _work_0, _token_0, _selected_0) {
  return $Bool_pick(($Bool_and(($Nat_is_gt(($List_length(_selected_0)), 0)), ($Lifecycle_selected_valid(_work_0, _selected_0, _selected_0)))), ($Round_reserve_output(_round_0, _token_0)), {$: "Round.Denied", "state": _round_0});
}

function $Lifecycle_release_unwritten(_round_0, _token_0) {
  return $Round_release_output(_round_0, _token_0);
}

function $Lifecycle_selection_reserve(_work_0, _selected_0) {
  return $Bool_pick(($Bool_and(($Nat_is_gt(($List_length(_selected_0)), 0)), ($Lifecycle_selected_valid(_work_0, _selected_0, _selected_0)))), {$: "Lifecycle.SelectionReserved", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": false, "consumed": false}}, {$: "Lifecycle.SelectionRejected"});
}

function $Lifecycle_selection_authorize(_state_0) {
  const _selected_0 = _state_0["selected"];
  const _authorized_0 = _state_0["authorized"];
  const _consumed_0 = _state_0["consumed"];
  return $Bool_pick(($Bool_and(($Bool_not(_authorized_0)), ($Bool_not(_consumed_0)))), {$: "Lifecycle.SelectionGranted", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": true, "consumed": false}}, {$: "Lifecycle.SelectionDenied", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": _authorized_0, "consumed": _consumed_0}});
}

function $Lifecycle_selection_same(_left_0, _right_0) {
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
      return $Bool_and(($Nat_is_eq(_head_0, _other_0)), ($Lifecycle_selection_same(_tail_0, _rest_0)));
    }
  }
}

function $Lifecycle_selection_consume(_state_0, _actual_0) {
  const _selected_0 = _state_0["selected"];
  const _authorized_0 = _state_0["authorized"];
  const _consumed_0 = _state_0["consumed"];
  return $Bool_pick(($Bool_and(_authorized_0, ($Bool_and(($Bool_not(_consumed_0)), ($Lifecycle_selection_same(_selected_0, _actual_0)))))), {$: "Lifecycle.SelectionGranted", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": true, "consumed": true}}, {$: "Lifecycle.SelectionDenied", "state": {$: "Lifecycle.OutputSelection", "selected": _selected_0, "authorized": _authorized_0, "consumed": _consumed_0}});
}

function $Lifecycle_finish_disposition_empty(_has_notice_0, _pass_notices_0, _deadline_reached_0) {
  return $Bool_pick(($Bool_and(_has_notice_0, _pass_notices_0)), {$: "Lifecycle.PassNotices"}, ($Bool_pick(_deadline_reached_0, {$: "Lifecycle.AllowDeadline"}, {$: "Lifecycle.AllowNoAdvice"})));
}

function $Lifecycle_finish_disposition_selected(_work_0, _selected_0, _binding_valid_0) {
  return $Bool_pick(($Bool_and(_binding_valid_0, ($Lifecycle_selected_valid(_work_0, _selected_0, _selected_0)))), {$: "Lifecycle.ReserveFindings"}, {$: "Lifecycle.AllowUnavailable"});
}

function $Lifecycle_finish_disposition_valid(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _deadline_reached_0) {
  if (_selected_0.$ === "Nil") {
    return $Lifecycle_finish_disposition_empty(_has_notice_0, _pass_notices_0, _deadline_reached_0);
  } else {
    return $Lifecycle_finish_disposition_selected(_work_0, _selected_0, true);
  }
}

function $Lifecycle_finish_disposition_writable(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _binding_valid_0, _deadline_reached_0) {
  if (!_binding_valid_0) {
    return {$: "Lifecycle.AllowUnavailable"};
  } else {
    return $Lifecycle_finish_disposition_valid(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _deadline_reached_0);
  }
}

function $Lifecycle_finish_disposition(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0) {
  if (!_can_write_0) {
    return $Lifecycle_finish_disposition_empty(false, false, _deadline_reached_0);
  } else {
    return $Lifecycle_finish_disposition_writable(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _binding_valid_0, _deadline_reached_0);
  }
}

function $Lifecycle_finish_output_slot(_selection_0, _step_0) {
  if (_step_0.$ === "Round.Granted") {
    const _round_0 = _step_0["state"];
    return {$: "Lifecycle.OutputReserved", "round": _round_0, "selection": _selection_0};
  } else {
    return {$: "Lifecycle.OutputAllowed", "reason": {$: "Lifecycle.AllowUnavailable"}};
  }
}

function $Lifecycle_finish_output_reservation(_round_0, _work_0, _token_0, _selected_0, _reservation_0) {
  if (_reservation_0.$ === "Lifecycle.SelectionReserved") {
    const _selection_0 = _reservation_0["state"];
    return $Lifecycle_finish_output_slot(_selection_0, ($Lifecycle_reserve_selected(_round_0, _work_0, _token_0, _selected_0)));
  } else {
    return {$: "Lifecycle.OutputAllowed", "reason": {$: "Lifecycle.AllowUnavailable"}};
  }
}

function $Lifecycle_finish_output_reserve(_round_0, _work_0, _token_0, _selected_0) {
  return $Lifecycle_finish_output_reservation(_round_0, _work_0, _token_0, _selected_0, ($Lifecycle_selection_reserve(_work_0, _selected_0)));
}

function $Lifecycle_finish_output_decide(_round_0, _work_0, _token_0, _selected_0, _disposition_0) {
  if (_disposition_0.$ === "Lifecycle.ReserveFindings") {
    return $Lifecycle_finish_output_reserve(_round_0, _work_0, _token_0, _selected_0);
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

function $Lifecycle_finish_output(_round_0, _work_0, _token_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0) {
  return $Lifecycle_finish_output_decide(_round_0, _work_0, _token_0, _selected_0, ($Lifecycle_finish_disposition(_work_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0)));
}

function $Lifecycle_initial(_partition_0, _lifetime_0) {
  return {$: "Lifecycle.Lifecycle", "admission": ($Admission_initial(_partition_0, _lifetime_0)), "work": ($Work_initial()), "finish": ($Handoff_finish_initial(0))};
}

function $Lifecycle_issue_result(_work_0, _finish_0, _result_0) {
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

function $Lifecycle_issue(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  return $Lifecycle_issue_result(_work_0, _finish_0, ($Admission_step(_admission_0, _partition_0, _lifetime_0, {$: "Admission.Issue", "tool": _tool_0, "started": _started_0, "deadline": _deadline_0, "now": _now_0})));
}

function $Lifecycle_finish_for_commit(_earlier_0, _current_0, _round_0) {
  if (_earlier_0) {
    return _current_0;
  } else {
    return $Handoff_finish_initial(_round_0);
  }
}

function $Lifecycle_commit_work(_admission_0, _work_result_0, _finish_0) {
  if (_work_result_0.$ === "Work.Accepted") {
    const _work_0 = _work_result_0["state"];
    const _ids_0 = _work_result_0["admitted"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.ObservationAdmitted", "ids": _ids_0}};
  } else {
    const _work_1 = _work_result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Lifecycle_commit_accept(_work_0, _finish_0, _earlier_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["round"];
    if (_t_0.$ === "Some") {
      const _value_0 = _t_0["value"];
      return $Lifecycle_commit_work(_admission_0, ($Work_admit(_work_0)), ($Lifecycle_finish_for_commit(_earlier_0, _finish_0, _value_0)));
    } else {
      return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
    }
  } else {
    const _admission_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_1, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle_commit(_state_0, _partition_0, _lifetime_0, _permit_0, _tool_0, _now_0) {
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
  return $Lifecycle_commit_accept(_work_0, _finish_0, _active_0, ($Admission_step({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": _active_0, "closed_at": __3, "next_token": __4, "permits": __5}, _partition_0, _lifetime_0, {$: "Admission.Consume", "token": _permit_0, "tool": _tool_0, "now": _now_0})));
}

function $Lifecycle_prepared_result(_admission_0, _finish_0, _result_0) {
  if (_result_0.$ === "Work.Accepted") {
    const _work_0 = _result_0["state"];
    const _ids_0 = _result_0["admitted"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.UnitsAdmitted", "ids": _ids_0}};
  } else {
    const _work_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Lifecycle_prepared_guard(_state_0, _observation_0, _count_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle_prepared_result(_admission_0, _finish_0, ($Work_prepare(_work_0, _observation_0, _count_0)));
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle_prepared(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _count_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const __1 = _state_0["finish"];
  return $Lifecycle_prepared_guard({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": __1}, _observation_0, _count_0, ($Admission_callback_current(_admission_0, _partition_0, _lifetime_0, _round_0)));
}

function $Lifecycle_reviewed_result(_admission_0, _finish_0, _result_0) {
  if (_result_0.$ === "Work.Accepted") {
    const _work_0 = _result_0["state"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.OutcomeRecorded"}};
  } else {
    const _work_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Lifecycle_reviewed_guard(_state_0, _unit_0, _outcome_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle_reviewed_result(_admission_0, _finish_0, ($Work_outcome(_work_0, _unit_0, _outcome_0)));
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle_reviewed(_state_0, _partition_0, _lifetime_0, _round_0, _unit_0, _outcome_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const __1 = _state_0["finish"];
  return $Lifecycle_reviewed_guard({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": __1}, _unit_0, _outcome_0, ($Admission_callback_current(_admission_0, _partition_0, _lifetime_0, _round_0)));
}

function $Lifecycle_interrupt_result(_admission_0, _finish_0, _result_0) {
  if (_result_0.$ === "Work.Accepted") {
    const _work_0 = _result_0["state"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.WorkInterrupted"}};
  } else {
    const _work_1 = _result_0["state"];
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_1, "finish": _finish_0}};
  }
}

function $Lifecycle_interrupt_valid(_admission_0, _work_0, _finish_0, _id_0, _source_0) {
  if (_source_0) {
    return $Lifecycle_interrupt_result(_admission_0, _finish_0, ($Work_interrupt_observation(_work_0, _id_0)));
  } else {
    return $Lifecycle_interrupt_result(_admission_0, _finish_0, ($Work_interrupt_unit(_work_0, _id_0)));
  }
}

function $Lifecycle_interrupt_guard(_state_0, _id_0, _source_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle_interrupt_valid(_admission_0, _work_0, _finish_0, _id_0, _source_0);
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle_interrupt(_state_0, _partition_0, _lifetime_0, _round_0, _id_0, _source_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const __1 = _state_0["finish"];
  return $Lifecycle_interrupt_guard({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": __1}, _id_0, _source_0, ($Admission_callback_current(_admission_0, _partition_0, _lifetime_0, _round_0)));
}

function $Lifecycle_allow_closed(_admission_result_0, _closed_work_0, _finish_0) {
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

function $Lifecycle_finish_continue_bound(_admission_0, _work_0, _finish_0) {
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

function $Lifecycle_finish_continue(_admission_0, _work_0, _finish_0, _collector_0) {
  return $Lifecycle_finish_continue_bound(_admission_0, _work_0, ($Handoff_finish_bind_writer(_finish_0, _collector_0)));
}

function $Lifecycle_finish_result(_admission_0, _work_0, _at_0, _collector_0, _result_0) {
  if (_result_0.$ === "Handoff.FinishWait") {
    const _finish_0 = _result_0["state"];
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}, "command": {$: "Lifecycle.FinishWaiting"}};
  } else if (_result_0.$ === "Handoff.Continue") {
    const _finish_1 = _result_0["state"];
    return $Lifecycle_finish_continue(_admission_0, _work_0, _finish_1, _collector_0);
  } else {
    const _finish_2 = _result_0["state"];
    return $Lifecycle_allow_closed(($Admission_close_round(_admission_0, _at_0)), ($Work_close(_work_0)), _finish_2);
  }
}

function $Lifecycle_finish_guard(_state_0, _original_deadline_0, _actionable_0, _at_0, _collector_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return $Lifecycle_finish_result(_admission_0, _work_0, _at_0, _collector_0, ($Handoff_finish_decide_at(_finish_0, ($Work_unfinished(_work_0)), _at_0, _original_deadline_0, _actionable_0)));
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle_finish_check(_state_0, _partition_0, _lifetime_0, _round_0, _original_deadline_0, _actionable_0, _at_0, _collector_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const __0 = _state_0["finish"];
  return $Lifecycle_finish_guard({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": __0}, _original_deadline_0, _actionable_0, _at_0, _collector_0, ($Bool_and(($Admission_callback_current(_admission_0, _partition_0, _lifetime_0, _round_0)), ($Bool_and(($Nat_is_gt(_original_deadline_0, 0)), ($Bool_and(($Nat_is_gt(_collector_0, 0)), ($Nat_is_le(_actionable_0, ($Work_pending_findings(_work_0)))))))))));
}

function $Lifecycle_write_guard(_state_0, _round_0, _slot_0, _token_0, _collector_0, _current_0) {
  const _admission_0 = _state_0["admission"];
  const _work_0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  if (_current_0) {
    return {$: "Lifecycle.Advanced", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": ($Handoff_finish_complete(_finish_0, _round_0, _slot_0, _token_0, _collector_0))}, "command": {$: "Lifecycle.WriteSettled"}};
  } else {
    return {$: "Lifecycle.Denied", "state": {$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": _work_0, "finish": _finish_0}};
  }
}

function $Lifecycle_write_terminal(_state_0, _partition_0, _lifetime_0, _round_0, _slot_0, _token_0, _collector_0) {
  const _admission_0 = _state_0["admission"];
  const __0 = _state_0["work"];
  const _finish_0 = _state_0["finish"];
  return $Lifecycle_write_guard({$: "Lifecycle.Lifecycle", "admission": _admission_0, "work": __0, "finish": _finish_0}, _round_0, _slot_0, _token_0, _collector_0, ($Bool_and(($Admission_callback_current(_admission_0, _partition_0, _lifetime_0, _round_0)), ($Handoff_finish_can_complete(_finish_0, _round_0, _slot_0, _token_0, _collector_0)))));
}

function $Lifecycle_apply(_state_0, _partition_0, _lifetime_0, _round_0, _event_0) {
  if (_event_0.$ === "Lifecycle.Issue") {
    const _tool_0 = _event_0["tool"];
    const _started_0 = _event_0["started"];
    const _deadline_0 = _event_0["deadline"];
    const _now_0 = _event_0["now"];
    return $Lifecycle_issue(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0);
  } else if (_event_0.$ === "Lifecycle.Commit") {
    const _permit_0 = _event_0["permit"];
    const _tool_1 = _event_0["tool"];
    const _now_1 = _event_0["now"];
    return $Lifecycle_commit(_state_0, _partition_0, _lifetime_0, _permit_0, _tool_1, _now_1);
  } else if (_event_0.$ === "Lifecycle.Prepared") {
    const _observation_0 = _event_0["observation"];
    const _count_0 = _event_0["count"];
    return $Lifecycle_prepared(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _count_0);
  } else if (_event_0.$ === "Lifecycle.Reviewed") {
    const _unit_0 = _event_0["unit"];
    const _outcome_0 = _event_0["outcome"];
    return $Lifecycle_reviewed(_state_0, _partition_0, _lifetime_0, _round_0, _unit_0, _outcome_0);
  } else if (_event_0.$ === "Lifecycle.SourceInterrupted") {
    const _observation_1 = _event_0["observation"];
    return $Lifecycle_interrupt(_state_0, _partition_0, _lifetime_0, _round_0, _observation_1, true);
  } else if (_event_0.$ === "Lifecycle.ReviewInterrupted") {
    const _unit_1 = _event_0["unit"];
    return $Lifecycle_interrupt(_state_0, _partition_0, _lifetime_0, _round_0, _unit_1, false);
  } else if (_event_0.$ === "Lifecycle.FinishCheck") {
    const _original_deadline_0 = _event_0["original_deadline"];
    const _actionable_0 = _event_0["actionable_findings"];
    const _at_0 = _event_0["at"];
    const _collector_0 = _event_0["collector"];
    return $Lifecycle_finish_check(_state_0, _partition_0, _lifetime_0, _round_0, _original_deadline_0, _actionable_0, _at_0, _collector_0);
  } else {
    const _slot_0 = _event_0["slot"];
    const _token_0 = _event_0["token"];
    const _collector_1 = _event_0["collector"];
    return $Lifecycle_write_terminal(_state_0, _partition_0, _lifetime_0, _round_0, _slot_0, _token_0, _collector_1);
  }
}

function $Lifecycle_main() {
  return $Lifecycle_apply(($Lifecycle_initial(1, 1)), 1, 1, 0, {$: "Lifecycle.Issue", "tool": 2, "started": 1, "deadline": 5, "now": 1});
}

function $main() {
  return $Lifecycle_apply(($Lifecycle_initial(1, 1)), 1, 1, 0, {$: "Lifecycle.Issue", "tool": 2, "started": 1, "deadline": 5, "now": 1});
}

function $Bool_pick(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
}

function $Nat_is_le(_a_0, _b_0) {
  return $Cmp_is_le(cmp_new(_a_0, _b_0));
}

function $List_length(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk(($List_length(_t_0)) + 1);
  }
}

function $Nat_is_eq(_a_0, _b_0) {
  return $Cmp_is_eq(cmp_new(_a_0, _b_0));
}

function $List_filter_put(_h_0, _r_0, _keep_0) {
  if (!_keep_0) {
    return _r_0;
  } else {
    return {$: "Con", "head": _h_0, "tail": _r_0};
  }
}

function $Bool_not(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $List_append(_xs_0, _ys_0) {
  if (_xs_0.$ === "Nil") {
    return _ys_0;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return {$: "Con", "head": _h_0, "tail": ($List_append(_t_0, _ys_0))};
  }
}

function $Bool_and(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Nat_is_gt(_a_0, _b_0) {
  return $Cmp_is_gt(cmp_new(_a_0, _b_0));
}

function $Nat_is_ge(_a_0, _b_0) {
  return $Cmp_is_ge(cmp_new(_a_0, _b_0));
}

function $List_is_empty(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return true;
  } else {
    return false;
  }
}

function $List_contains_0(_xs_0, _x_0) {
  if (_xs_0.$ === "Nil") {
    return false;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return $List_any_if(run_clo($List_contains_0_c1(_t_0,_x_0)), ($Nat_is_eq(_h_0, _x_0)));
  }
}

function $Cmp_is_le(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $Cmp_is_eq(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Cmp_is_gt(_c_0) {
  if (_c_0.$ === "GT") {
    return true;
  } else {
    return false;
  }
}

function $Cmp_is_ge(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}

function $List_any_if(_rest_0, _hit_0) {
  if (!_hit_0) {
    return run_tail(_rest_0, {$: "Unit"});
  } else {
    return true;
  }
}

function $List_contains_0_c1(_t_0,_x_0) {
  return (_x_1) => {
    return $List_contains_0(_t_0, _x_0);
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
  run_loop($Lifecycle_initial(nat(partition), nat(lifetime)));
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
  resultForCaller(run_loop($Lifecycle_apply(state, nat(partition), nat(lifetime), nat(round), lifecycleEvent(event))));
