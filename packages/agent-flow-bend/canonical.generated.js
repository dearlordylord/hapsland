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
  return $Canonical$step$(($Canonical$initial$({$: "Ledger.Limits", "global_items": 4, "global_bytes": 100, "partition_items": 2, "partition_bytes": 60})), {$: "Canonical.OpenRound", "partition": 1, "lifetime": 1});
}

function $Canonical$step$(_state_0, _event_0) {
  if (_event_0.$ === "Canonical.OpenRound") {
    const _partition_0 = _event_0["partition"];
    const _lifetime_0 = _event_0["lifetime"];
    return $Canonical$open$(_state_0, _partition_0, _lifetime_0);
  } else if (_event_0.$ === "Canonical.BeginPreparation") {
    const _partition_1 = _event_0["partition"];
    const _lifetime_1 = _event_0["lifetime"];
    const _round_0 = _event_0["round"];
    const _bytes_0 = _event_0["bytes"];
    return $Canonical$begin$(_state_0, _partition_1, _lifetime_1, _round_0, _bytes_0);
  } else if (_event_0.$ === "Canonical.PreparationCompleted") {
    const _partition_2 = _event_0["partition"];
    const _lifetime_2 = _event_0["lifetime"];
    const _round_1 = _event_0["round"];
    const _operation_0 = _event_0["operation"];
    const _bytes_1 = _event_0["unit_bytes"];
    return $Canonical$prepared$(_state_0, _partition_2, _lifetime_2, _round_1, _operation_0, _bytes_1);
  } else if (_event_0.$ === "Canonical.ReviewCompleted") {
    const _partition_3 = _event_0["partition"];
    const _lifetime_3 = _event_0["lifetime"];
    const _round_2 = _event_0["round"];
    const _operation_1 = _event_0["operation"];
    const _outcome_0 = _event_0["outcome"];
    return $Canonical$reviewed$(_state_0, _partition_3, _lifetime_3, _round_2, _operation_1, _outcome_0);
  } else if (_event_0.$ === "Canonical.StopPolled") {
    const _partition_4 = _event_0["partition"];
    const _lifetime_4 = _event_0["lifetime"];
    const _round_3 = _event_0["round"];
    const _deadline_0 = _event_0["deadline"];
    return $Canonical$stop$(_state_0, _partition_4, _lifetime_4, _round_3, _deadline_0);
  } else if (_event_0.$ === "Canonical.OutputStarted") {
    const _partition_5 = _event_0["partition"];
    const _lifetime_5 = _event_0["lifetime"];
    const _round_4 = _event_0["round"];
    return $Canonical$output_start$(_state_0, _partition_5, _lifetime_5, _round_4);
  } else if (_event_0.$ === "Canonical.OutputTerminal") {
    const _partition_6 = _event_0["partition"];
    const _lifetime_6 = _event_0["lifetime"];
    const _round_5 = _event_0["round"];
    const _operation_2 = _event_0["operation"];
    const _outcome_1 = _event_0["outcome"];
    return $Canonical$output_terminal$(_state_0, _partition_6, _lifetime_6, _round_5, _operation_2, _outcome_1);
  } else {
    const _partition_7 = _event_0["partition"];
    const _lifetime_7 = _event_0["lifetime"];
    const _round_6 = _event_0["round"];
    return $Canonical$retire$(_state_0, _partition_7, _lifetime_7, _round_6);
  }
}

function $Canonical$initial$(_limits_0) {
  return {$: "Canonical.State", "ledger": ($Ledger$initial$(_limits_0)), "rounds": {$: "Nil"}, "work": {$: "Nil"}, "next_round": 1, "next_operation": 1};
}

function $Canonical$open$(_state_0, _partition_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$open_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$begin$(_state_0, _partition_0, _lifetime_0, _round_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$begin_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, _bytes_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$prepared$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  return $Canonical$prepared_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2}, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0, ($Canonical$find_round$(_partition_0, _rounds_0)), ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$reviewed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3}, _operation_0, _outcome_0, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $Canonical$stop$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$stop_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$output_start$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$output_start_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$output_terminal$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$output_terminal_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Canonical$retire$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$retire_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, ($Canonical$find_round$(_partition_0, _rounds_0)));
}

function $Ledger$initial$(_limits_0) {
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": 1, "charges": {$: "Nil"}};
}

function $Canonical$open_found$(_state_0, _partition_0, _lifetime_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  if (_found_0.$ === "Some") {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": {$: "Canonical.StaleRound"}};
  } else {
    const _x_0 = ($List$length$(_rounds_0));
    return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Bool$and$(($Nat$is_gt$(_lifetime_0, 0)), (_x_0 < 256))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _next_round_0, "waiting": false, "deciding": false, "write": {$: "None"}, "uncertain": false}, "tail": _rounds_0}, "work": _work_0, "next_round": nat_chk(_next_round_0 + 1), "next_operation": _next_operation_0}, "commands": {$: "Con", "head": {$: "Canonical.RoundStarted", "id": _next_round_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": ($Bool$pick$(($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Nat$is_gt$(_lifetime_0, 0)))), {$: "Canonical.RoundLimit"}, {$: "Canonical.InvalidIdentity"}))});
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

function $Canonical$begin_found$(_state_0, _partition_0, _lifetime_0, _round_0, _bytes_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$and$(($Bool$not$(($Canonical$is_deciding$(_current_0)))), ($Nat$is_gt$(_bytes_0, 0)))))), ($Canonical$begin_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, ($Ledger$reserve$(_ledger_0, _partition_0, _bytes_0)))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3}, "reason": {$: "Canonical.StaleRound"}};
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
        return $Bool$pick$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Canonical$prepared_release$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _bytes_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
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

function $Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($Canonical$work_matches$(_partition_0, _lifetime_0, _round_0, _operation_0, _item_0)), {$: "Some", "value": _item_0}, ($Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _rest_0)));
  }
}

function $Canonical$reviewed_found$(_state_0, _operation_0, _outcome_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      return $Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3}, _operation_0, _outcome_0, _charge_0, ($Ledger$release$(_ledger_0, _charge_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$stop_found$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($Canonical$is_deciding$(_current_0)))))), ($Canonical$match_pending$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _current_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $Canonical$output_start_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
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
      return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": _uncertain_0})), ($Bool$not$(_deciding_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": false, "write": {$: "Some", "value": _next_operation_0}, "uncertain": _uncertain_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1)}, "commands": {$: "Con", "head": {$: "Canonical.WriteAuthorized", "operation": _next_operation_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": {$: "Canonical.StaleRound"}});
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": {$: "Canonical.StaleRound"}};
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

function $Nat$is_gt$(_a_0, _b_0) {
  return $Cmp$is_gt$(cmp_new(_a_0, _b_0));
}

function $List$length$(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk(($List$length$(_t_0)) + 1);
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

function $Bool$not$(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $Canonical$is_deciding$(_current_0) {
  const _deciding_0 = _current_0["deciding"];
  return _deciding_0;
}

function $Canonical$begin_result$(_state_0, _partition_0, _lifetime_0, _round_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    const _charge_0 = _result_0["id"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($List$append$(_work_0, {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _next_operation_0, "charge": _charge_0, "kind": {$: "Canonical.Preparing"}}, "tail": {$: "Nil"}})), "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1)}, "commands": {$: "Con", "head": {$: "Canonical.Prepare", "operation": _next_operation_0, "reservation": _charge_0}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationRefused"}, "tail": {$: "Nil"}}};
  }
}

function $Ledger$reserve$(_state_0, _partition_0, _bytes_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$reserve$check$(_limits_0, _next_id_0, _charges_0, _partition_0, _bytes_0, ($Ledger$fits$(_limits_0, ($Ledger$total$(_charges_0)), ($Ledger$partition_usage$(_charges_0, _partition_0)), _bytes_0)));
}

function $Canonical$prepared_release$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _bytes_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  return $Canonical$prepared_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _bytes_0, ($Ledger$release$(_ledger_0, _charge_0)));
}

function $Canonical$work_matches$(_partition_0, _lifetime_0, _round_0, _operation_0, _item_0) {
  const _owner_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["round"];
  const _op_0 = _item_0["operation"];
  return $Bool$and$(($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Nat$is_eq$(_op_0, _operation_0)));
}

function $Canonical$reviewed_released$(_state_0, _operation_0, _outcome_0, _charge_0, _result_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  if (_result_0.$ === "Ledger.Granted") {
    const _updated_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _updated_0, "rounds": _rounds_0, "work": ($Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": {$: "Con", "head": {$: "Canonical.ReviewRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $Ledger$release$(_state_0, _id_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$release$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Canonical$match_pending$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _current_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const _write_0 = _current_0["write"];
  const _uncertain_0 = _current_0["uncertain"];
  return $Canonical$stop_current$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($Canonical$pending$(_partition_0, _lifetime_0, _round_0, _work_0)), _write_0, _uncertain_0);
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
  const __0 = _current_0["partition"];
  const __1 = _current_0["lifetime"];
  const __2 = _current_0["id"];
  const _waiting_0 = _current_0["waiting"];
  const _deciding_0 = _current_0["deciding"];
  const _t_0 = _current_0["write"];
  if (_t_0.$ === "Some") {
    const _token_0 = _t_0["value"];
    const __3 = _current_0["uncertain"];
    return $Bool$pick$(($Bool$and$(($Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "Some", "value": _token_0}, "uncertain": __3})), ($Nat$is_eq$(_token_0, _operation_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": ($Canonical$write_is_unknown$(_outcome_0))}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "commands": {$: "Con", "head": {$: "Canonical.WriteRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": {$: "Canonical.StaleOperation"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $Canonical$retire_current$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_round_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": ($Canonical$remove_round$(_partition_0, _rounds_0)), "work": ($Canonical$retain_other_work$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0}, "commands": ($List$append$(($Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": {$: "Canonical.PartitionRetired", "round": _round_0}, "tail": {$: "Nil"}}))))};
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

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
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

function $Ledger$reserve$check$(_limits_0, _next_id_0, _charges_0, _partition_0, _bytes_0, _allowed_0) {
  if (_allowed_0) {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": nat_chk(_next_id_0 + 1), "charges": ($List$append$(_charges_0, {$: "Con", "head": {$: "Ledger.Charge", "id": _next_id_0, "partition": _partition_0, "bytes": _bytes_0}, "tail": {$: "Nil"}}))}, "id": _next_id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $Ledger$fits$(_limits_0, _global_0, _local_0, _bytes_0) {
  const _global_items_0 = _limits_0["global_items"];
  const _global_bytes_0 = _limits_0["global_bytes"];
  const _partition_items_0 = _limits_0["partition_items"];
  const _partition_bytes_0 = _limits_0["partition_bytes"];
  const _used_items_0 = _global_0["items"];
  const _used_bytes_0 = _global_0["bytes"];
  const _local_items_0 = _local_0["items"];
  const _local_bytes_0 = _local_0["bytes"];
  return $Bool$and$(($Nat$is_le$(nat_chk(_used_items_0 + 1), _global_items_0)), ($Bool$and$(($Nat$is_le$(nat_chk(_used_bytes_0 + _bytes_0), _global_bytes_0)), ($Bool$and$(($Nat$is_le$(nat_chk(_local_items_0 + 1), _partition_items_0)), ($Nat$is_le$(nat_chk(_local_bytes_0 + _bytes_0), _partition_bytes_0)))))));
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

function $Canonical$prepared_released$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _bytes_0, _result_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  if (_result_0.$ === "Ledger.Rejected") {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  } else {
    const _released_0 = _result_0["state"];
    return $Canonical$prepared_batch$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0}, _operation_0, _charge_0, ($Canonical$admit_units$(_bytes_0, _released_0, _partition_0, _lifetime_0, _round_0, _next_operation_0)));
  }
}

function $Canonical$same_ids$(_a_0, _b_0, _c_0, _x_0, _y_0, _z_0) {
  return $Bool$and$(($Nat$is_eq$(_a_0, _x_0)), ($Bool$and$(($Nat$is_eq$(_b_0, _y_0)), ($Nat$is_eq$(_c_0, _z_0)))));
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
    const _rest_0 = _items_0["tail"];
    return $Canonical$remove_work_pick$({$: "Canonical.Work", "partition": __0, "lifetime": __1, "round": __2, "operation": _op_0, "charge": __3, "kind": __4}, ($Canonical$remove_work$(_operation_0, _rest_0)), ($Nat$is_eq$(_op_0, _operation_0)));
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

function $Ledger$find$(_id_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["bytes"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$find$pick$({$: "Ledger.Charge", "id": _current_0, "partition": __0, "bytes": __1}, ($Ledger$find$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Canonical$stop_current$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _has_pending_0, _write_0, _uncertain_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  return $Bool$pick$(($Bool$and$(_has_pending_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": true, "deciding": false, "write": _write_0, "uncertain": _uncertain_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, "commands": {$: "Con", "head": {$: "Canonical.WaitForWork"}, "tail": {$: "Nil"}}}, ($Canonical$stop_output$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, _write_0, _uncertain_0)));
}

function $Canonical$pending$(_partition_0, _lifetime_0, _round_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0));
    const _x_1 = ($Canonical$pending$(_partition_0, _lifetime_0, _round_0, _rest_0));
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
    const _rest_0 = _items_0["tail"];
    return $Canonical$retain_work_pick$({$: "Canonical.Work", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": __0, "charge": __1, "kind": __2}, ($Canonical$retain_other_work$(_rest_0, _partition_0, _lifetime_0, _round_0)), ($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)));
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
    const _rest_0 = _items_0["tail"];
    return $Canonical$release_pick$(_charge_0, ($Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)));
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
    const _rest_0 = _items_0["tail"];
    return $Canonical$cancel_pick$(_op_0, ($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)));
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

function $Nat$is_le$(_a_0, _b_0) {
  return $Cmp$is_le$(cmp_new(_a_0, _b_0));
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

function $Canonical$prepared_batch$(_state_0, _operation_0, _charge_0, _batch_0) {
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _ledger_0 = _batch_0["ledger"];
  const _units_0 = _batch_0["work"];
  const _next_0 = _batch_0["next_operation"];
  const _commands_0 = _batch_0["commands"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($List$append$(($Canonical$remove_work$(_operation_0, _work_0)), _units_0)), "next_round": _next_round_0, "next_operation": _next_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": _commands_0}};
}

function $Canonical$admit_units$(_bytes_0, _ledger_0, _partition_0, _lifetime_0, _round_0, _next_operation_0) {
  if (_bytes_0.$ === "Nil") {
    return {$: "Canonical.Batch", "ledger": _ledger_0, "work": {$: "Nil"}, "next_operation": _next_operation_0, "commands": {$: "Nil"}};
  } else {
    const _size_0 = _bytes_0["head"];
    const _rest_0 = _bytes_0["tail"];
    const _limits_0 = _ledger_0["limits"];
    const _next_id_0 = _ledger_0["next_id"];
    const _charges_0 = _ledger_0["charges"];
    const _allowed_0 = ($Ledger$fits$(_limits_0, ($Ledger$total$(_charges_0)), ($Ledger$partition_usage$(_charges_0, _partition_0)), _size_0));
    const _granted_0 = {$: "Ledger.Ledger", "limits": _limits_0, "next_id": nat_chk(_next_id_0 + 1), "charges": ($List$append$(_charges_0, {$: "Con", "head": {$: "Ledger.Charge", "id": _next_id_0, "partition": _partition_0, "bytes": _size_0}, "tail": {$: "Nil"}}))};
    return $Bool$pick$(_allowed_0, ($Canonical$admit_granted_batch$(_partition_0, _lifetime_0, _round_0, _next_operation_0, _next_id_0, ($Canonical$admit_units$(_rest_0, _granted_0, _partition_0, _lifetime_0, _round_0, nat_chk(_next_operation_0 + 1))))), ($Canonical$admit_refused_batch$(($Canonical$admit_units$(_rest_0, {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}, _partition_0, _lifetime_0, _round_0, _next_operation_0)))));
  }
}

function $Canonical$remove_work_pick$(_item_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
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
    const _rest_0 = _charges_0["tail"];
    return $Ledger$remove$pick$({$: "Ledger.Charge", "id": _current_0, "partition": __0, "bytes": __1}, ($Ledger$remove$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Ledger$find$pick$(_charge_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _charge_0};
  } else {
    return _fallback_0;
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

function $Canonical$cancel_pick$(_operation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Canonical.CancelWork", "operation": _operation_0}, "tail": _tail_0};
  } else {
    return _tail_0;
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

function $Canonical$admit_granted_batch$(_partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _batch_0) {
  const _ledger_0 = _batch_0["ledger"];
  const _work_0 = _batch_0["work"];
  const _next_0 = _batch_0["next_operation"];
  const _commands_0 = _batch_0["commands"];
  return {$: "Canonical.Batch", "ledger": _ledger_0, "work": {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "charge": _charge_0, "kind": {$: "Canonical.Reviewing"}}, "tail": _work_0}, "next_operation": _next_0, "commands": {$: "Con", "head": {$: "Canonical.UnitAdmitted", "operation": _operation_0, "reservation": _charge_0}, "tail": _commands_0}};
}

function $Canonical$admit_refused_batch$(_batch_0) {
  const _ledger_0 = _batch_0["ledger"];
  const _work_0 = _batch_0["work"];
  const _next_0 = _batch_0["next_operation"];
  const _commands_0 = _batch_0["commands"];
  return {$: "Canonical.Batch", "ledger": _ledger_0, "work": _work_0, "next_operation": _next_0, "commands": {$: "Con", "head": {$: "Canonical.UnitRefused"}, "tail": _commands_0}};
}

function $Ledger$remove$pick$(_charge_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
  }
}

function $Canonical$stop_ready$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _uncertain_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($Canonical$release_round_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": false, "deciding": true, "write": {$: "None"}, "uncertain": _uncertain_0}, "tail": ($Canonical$remove_round$(_partition_0, _rounds_0))}, "work": ($Canonical$retain_other_work$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0}, "commands": ($List$append$(($Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": ($Bool$pick$(($Bool$and$(_uncertain_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.ReofferAtStop"}, {$: "Canonical.FinishReady"})), "tail": {$: "Nil"}}))))};
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
