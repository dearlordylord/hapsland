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

function $state_random$(_s_0) {
  const _random_0 = _s_0["random"];
  return _random_0;
}

function $state_phase$(_s_0) {
  const _phase_0 = _s_0["phase"];
  return _phase_0;
}

function $state_edit$(_s_0) {
  const _edit_0 = _s_0["edit"];
  return _edit_0;
}

function $state_task$(_s_0) {
  const _task_0 = _s_0["task"];
  return _task_0;
}

function $state_revision$(_s_0) {
  const _revision_0 = _s_0["revision"];
  return _revision_0;
}

function $state_generation$(_s_0) {
  const _generation_0 = _s_0["generation"];
  return _generation_0;
}

function $state_suspended$(_s_0) {
  const _suspended_0 = _s_0["suspended"];
  return _suspended_0;
}

function $state_pendingPhase$(_s_0) {
  const _pendingPhase_0 = _s_0["pendingPhase"];
  return _pendingPhase_0;
}

function $state_pendingEdit$(_s_0) {
  const _pendingEdit_0 = _s_0["pendingEdit"];
  return _pendingEdit_0;
}

function $state_pendingTask$(_s_0) {
  const _pendingTask_0 = _s_0["pendingTask"];
  return _pendingTask_0;
}

function $state_bytes$(_s_0) {
  const _bytes_0 = _s_0["bytes"];
  return _bytes_0;
}

function $state_units$(_s_0) {
  const _units_0 = _s_0["units"];
  return _units_0;
}

function $set_random$(_s_0, _value_0) {
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _value_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_phase$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _value_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_edit$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _value_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_task$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _value_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_revision$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _value_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_generation$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _value_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_suspended$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _value_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_pendingPhase$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _value_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_pendingEdit$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _value_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_pendingTask$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _bytes_0 = _s_0["bytes"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _value_0, "bytes": _bytes_0, "units": _units_0};
}

function $set_bytes$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _units_0 = _s_0["units"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _value_0, "units": _units_0};
}

function $set_units$(_s_0, _value_0) {
  const _random_0 = _s_0["random"];
  const _phase_0 = _s_0["phase"];
  const _edit_0 = _s_0["edit"];
  const _task_0 = _s_0["task"];
  const _revision_0 = _s_0["revision"];
  const _generation_0 = _s_0["generation"];
  const _suspended_0 = _s_0["suspended"];
  const _pendingPhase_0 = _s_0["pendingPhase"];
  const _pendingEdit_0 = _s_0["pendingEdit"];
  const _pendingTask_0 = _s_0["pendingTask"];
  const _bytes_0 = _s_0["bytes"];
  return {$: "Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _value_0};
}

function $transition_state$(_t_0) {
  const _s_0 = _t_0["state"];
  return _s_0;
}

function $transition_events$(_t_0) {
  const _events_0 = _t_0["events"];
  return _events_0;
}

function $event_delay$(_e_0) {
  const _delay_0 = _e_0["delay"];
  return _delay_0;
}

function $event_kind$(_e_0) {
  const _kind_0 = _e_0["kind"];
  return _kind_0;
}

function $event_task$(_e_0) {
  const _task_0 = _e_0["task"];
  return _task_0;
}

function $event_revision$(_e_0) {
  const _revision_0 = _e_0["revision"];
  return _revision_0;
}

function $event_generation$(_e_0) {
  const _generation_0 = _e_0["generation"];
  return _generation_0;
}

function $event_bytes$(_e_0) {
  const _bytes_0 = _e_0["bytes"];
  return _bytes_0;
}

function $event_units$(_e_0) {
  const _units_0 = _e_0["units"];
  return _units_0;
}

function $event_repair$(_e_0) {
  const _repair_0 = _e_0["repair"];
  return _repair_0;
}

function $event_recurring$(_e_0) {
  const _recurring_0 = _e_0["recurring"];
  return _recurring_0;
}

function $seed_hash$($0, $1) {
  for (;;) {
    {
      const _codes_0 = $0;
      const _seed_0 = $1;
      if (_codes_0.$ === "Nil") {
        return _seed_0;
      } else {
        const _code_0 = _codes_0["head"];
        const _tail_0 = _codes_0["tail"];
        const _x_0 = ((_seed_0 ^ _code_0) >>> 0);
        $0 = _tail_0;
        $1 = (Math.imul(_x_0, 16777619) >>> 0);
        continue;
      }
    }
  }
}

function $nonzero$(_seed_0) {
  return $Bool$pick$((_seed_0 === 0), 1, _seed_0);
}

function $initial$(_config_0, _seed_0, _codes_0, _bytes_0, _units_0) {
  return {$: "Stream", "random": ($nonzero$(($seed_hash$(_codes_0, _seed_0)))), "phase": 0, "edit": 0, "task": 0, "revision": 0, "generation": 0, "suspended": false, "pendingPhase": 0, "pendingEdit": 0, "pendingTask": 0, "bytes": _bytes_0, "units": _units_0};
}

function $random_step$(_random_0) {
  const _x_0 = (13 >= 32 ? 0 : (_random_0 << 13) >>> 0);
  const _a_0 = ((_random_0 ^ _x_0) >>> 0);
  const _x_1 = (17 >= 32 ? 0 : (_a_0 >>> 17) >>> 0);
  const _b_0 = ((_a_0 ^ _x_1) >>> 0);
  const _x_2 = (5 >= 32 ? 0 : (_b_0 << 5) >>> 0);
  return ((_b_0 ^ _x_2) >>> 0);
}

function $positive_delay$(_total_0, _variation_0) {
  return $Bool$pick$((_total_0 > _variation_0), ((_total_0 - _variation_0) >>> 0), 1);
}

function $sample_delay$(_config_0, _random_0) {
  const _interval_0 = _config_0["interval"];
  const _variation_0 = _config_0["variation"];
  const _x_0 = (Math.imul(2, _variation_0) >>> 0);
  const _x_1 = ((_x_0 + 1) >>> 0);
  const _x_2 = (_x_1 === 0 ? _random_0 : _random_0 % _x_1);
  return $positive_delay$(((_interval_0 + _x_2) >>> 0), _variation_0);
}

function $snapshot$(_s_0) {
  return $set_pendingTask$(($set_pendingEdit$(($set_pendingPhase$(_s_0, ($state_phase$(_s_0)))), ($state_edit$(_s_0)))), ($state_task$(_s_0)));
}

function $emission$(_s_0, _delay_0, _kind_0, _repair_0, _recurring_0) {
  return {$: "Emission", "delay": _delay_0, "kind": _kind_0, "task": ($state_task$(_s_0)), "revision": ($state_revision$(_s_0)), "generation": ($state_generation$(_s_0)), "bytes": ($state_bytes$(_s_0)), "units": ($state_units$(_s_0)), "repair": _repair_0, "recurring": _recurring_0};
}

function $fresh$(_s_0, _delay_0, _repair_0, _recurring_0) {
  const _x_0 = ($state_revision$(_s_0));
  const _updated_0 = ($set_revision$(_s_0, nat_chk(_x_0 + 1)));
  return {$: "Changed", "state": _updated_0, "events": {$: "Con", "head": ($emission$(_updated_0, _delay_0, 1, _repair_0, _recurring_0)), "tail": {$: "Nil"}}};
}

function $task_next$(_config_0, _s_0) {
  const _pause_0 = _config_0["pause"];
  const _delay_0 = ($Bool$pick$(($Nat$is_eq$(($state_task$(_s_0)), 0)), 0, _pause_0));
  const _x_0 = ($state_task$(_s_0));
  const _updated_0 = ($set_task$(($set_edit$(($set_phase$(_s_0, 1)), 0)), nat_chk(_x_0 + 1)));
  return {$: "Changed", "state": _updated_0, "events": {$: "Con", "head": ($emission$(_updated_0, _delay_0, 0, false, true)), "tail": {$: "Nil"}}};
}

function $edit_next$(_config_0, _s_0) {
  const __0 = _config_0["interval"];
  const __1 = _config_0["variation"];
  const _edits_0 = _config_0["edits"];
  const __2 = _config_0["pause"];
  const __3 = _config_0["response"];
  const __4 = _config_0["repairDelay"];
  const _x_0 = ($state_edit$(_s_0));
  const _count_0 = ((_x_0 + 1) >>> 0);
  const _random_0 = ($random_step$(($state_random$(_s_0))));
  const _updated_0 = ($set_random$(($set_edit$(($set_phase$(_s_0, ($Bool$pick$((_count_0 >= _edits_0), 2, 1)))), _count_0)), _random_0));
  return $fresh$(_updated_0, ($sample_delay$({$: "Settings", "interval": __0, "variation": __1, "edits": _edits_0, "pause": __2, "response": __3, "repairDelay": __4}, _random_0)), false, true);
}

function $finish_next$(_config_0, _s_0) {
  const _random_0 = ($random_step$(($state_random$(_s_0))));
  const _updated_0 = ($set_random$(($set_phase$(_s_0, 0)), _random_0));
  return {$: "Changed", "state": _updated_0, "events": {$: "Con", "head": ($emission$(_updated_0, ($sample_delay$(_config_0, _random_0)), 2, false, true)), "tail": {$: "Nil"}}};
}

function $phase_next$(_config_0, _s_0, _phase_0) {
  if (_phase_0 == 0) {
    return $task_next$(_config_0, _s_0);
  } else if ((_phase_0 & 1) == 0) {
    return $finish_next$(_config_0, _s_0);
  } else if (_phase_0 == 1) {
    return $edit_next$(_config_0, _s_0);
  } else {
    return $finish_next$(_config_0, _s_0);
  }
}

function $enabled_next$(_config_0, _s_0, _suspended_0) {
  if (_suspended_0) {
    return {$: "Changed", "state": _s_0, "events": {$: "Nil"}};
  } else {
    const _saved_0 = ($snapshot$(_s_0));
    return $phase_next$(_config_0, _saved_0, ($state_phase$(_saved_0)));
  }
}

function $next$(_config_0, _s_0) {
  return $enabled_next$(_config_0, _s_0, ($state_suspended$(_s_0)));
}

function $finish_state$(_s_0, _continuation_0) {
  if (_continuation_0) {
    return $set_edit$(($set_phase$(_s_0, 1)), 0);
  } else {
    return $set_phase$(_s_0, 0);
  }
}

function $on_finish$(_config_0, _s_0, _continuation_0) {
  return $next$(_config_0, ($finish_state$(_s_0, _continuation_0)));
}

function $rewind$(_config_0, _s_0) {
  const _x_0 = ($state_generation$(_s_0));
  const _updated_0 = ($set_task$(($set_edit$(($set_phase$(($set_generation$(_s_0, nat_chk(_x_0 + 1))), ($state_pendingPhase$(_s_0)))), ($state_pendingEdit$(_s_0)))), ($state_pendingTask$(_s_0))));
  return $next$(_config_0, _updated_0);
}

function $sizes$(_s_0, _bytes_0, _units_0) {
  return $set_units$(($set_bytes$(_s_0, _bytes_0)), _units_0);
}

function $suspend$(_config_0, _s_0, _suspended_0) {
  return $rewind$(_config_0, ($set_suspended$(_s_0, _suspended_0)));
}

function $set_interval$(_config_0, _interval_0) {
  const _variation_0 = _config_0["variation"];
  const _edits_0 = _config_0["edits"];
  const _pause_0 = _config_0["pause"];
  const _response_0 = _config_0["response"];
  const _repairDelay_0 = _config_0["repairDelay"];
  return {$: "Settings", "interval": _interval_0, "variation": _variation_0, "edits": _edits_0, "pause": _pause_0, "response": _response_0, "repairDelay": _repairDelay_0};
}

function $advice_case$(_s_0, _response_0, _repairDelay_0) {
  if (_response_0 == 0) {
    return {$: "Changed", "state": _s_0, "events": {$: "Nil"}};
  } else if ((_response_0 & 3) == 0) {
    return $fresh$(_s_0, _repairDelay_0, true, false);
  } else if (_response_0 == 2) {
    return $fresh$(_s_0, 1, true, false);
  } else if ((_response_0 & 3) == 2) {
    return $fresh$(_s_0, _repairDelay_0, true, false);
  } else if (_response_0 == 1) {
    return {$: "Changed", "state": _s_0, "events": {$: "Nil"}};
  } else {
    return $fresh$(_s_0, _repairDelay_0, true, false);
  }
}

function $on_advice$(_config_0, _s_0) {
  const _response_0 = _config_0["response"];
  const _repairDelay_0 = _config_0["repairDelay"];
  return $advice_case$(_s_0, _response_0, _repairDelay_0);
}

function $burst_events$(_count_0, _s_0) {
  if (_count_0 === 0) {
    return {$: "Nil"};
  } else {
    const _p_0 = (_count_0 - 1);
    const _x_0 = ($state_revision$(_s_0));
    const _updated_0 = ($set_revision$(_s_0, nat_chk(_x_0 + 1)));
    return {$: "Con", "head": ($emission$(_updated_0, 0, 1, false, false)), "tail": ($burst_events$(_p_0, _updated_0))};
  }
}

function $burst$(_count_0, _s_0) {
  const _x_0 = ($state_revision$(_s_0));
  return {$: "Changed", "state": ($set_revision$(_s_0, nat_chk(_x_0 + _count_0))), "events": ($burst_events$(_count_0, _s_0))};
}

function $Bool$pick$(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
}

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
}

function $Cmp$is_eq$(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $0m1(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Nil": at[key] = v; return top[0];
      case "Con": at = at[key] = {...v, "head": nat_host(v["head"])}; key = "tail"; v = v[key]; continue;
      default: throw "bend: List has no tag " + v?.$ + " (its tags: Nil, Con); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m0(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Stream": at = at[key] = {...v, "task": nat_host(v["task"]), "revision": nat_host(v["revision"]), "generation": nat_host(v["generation"]), "pendingTask": nat_host(v["pendingTask"]), "bytes": nat_host(v["bytes"]), "units": $0m1(v["units"])}; return top[0];
      default: throw "bend: State has no tag " + v?.$ + " (its tags: Stream); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m3(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Nil": at[key] = v; return top[0];
      case "Con": at = at[key] = {...v, "head": BigInt(v["head"])}; key = "tail"; v = v[key]; continue;
      default: throw "bend: List has no tag " + v?.$ + " (its tags: Nil, Con); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m2(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Stream": at = at[key] = {...v, "task": BigInt(v["task"]), "revision": BigInt(v["revision"]), "generation": BigInt(v["generation"]), "pendingTask": BigInt(v["pendingTask"]), "bytes": BigInt(v["bytes"]), "units": $0m3(v["units"])}; return top[0];
      default: throw "bend: State has no tag " + v?.$ + " (its tags: Stream); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m6(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Emission": at = at[key] = {...v, "task": nat_host(v["task"]), "revision": nat_host(v["revision"]), "generation": nat_host(v["generation"]), "bytes": nat_host(v["bytes"]), "units": $0m1(v["units"])}; return top[0];
      default: throw "bend: Input has no tag " + v?.$ + " (its tags: Emission); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m5(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Nil": at[key] = v; return top[0];
      case "Con": at = at[key] = {...v, "head": $0m6(v["head"])}; key = "tail"; v = v[key]; continue;
      default: throw "bend: List has no tag " + v?.$ + " (its tags: Nil, Con); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m4(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Changed": at = at[key] = {...v, "state": $0m0(v["state"]), "events": $0m5(v["events"])}; return top[0];
      default: throw "bend: Transition has no tag " + v?.$ + " (its tags: Changed); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m9(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Emission": at = at[key] = {...v, "task": BigInt(v["task"]), "revision": BigInt(v["revision"]), "generation": BigInt(v["generation"]), "bytes": BigInt(v["bytes"]), "units": $0m3(v["units"])}; return top[0];
      default: throw "bend: Input has no tag " + v?.$ + " (its tags: Emission); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m8(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Nil": at[key] = v; return top[0];
      case "Con": at = at[key] = {...v, "head": $0m9(v["head"])}; key = "tail"; v = v[key]; continue;
      default: throw "bend: List has no tag " + v?.$ + " (its tags: Nil, Con); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m7(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Changed": at = at[key] = {...v, "state": $0m2(v["state"]), "events": $0m8(v["events"])}; return top[0];
      default: throw "bend: Transition has no tag " + v?.$ + " (its tags: Changed); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}
export default {
  "state_random": run_lib((a0) => { const r = (run_loop($state_random$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_phase": run_lib((a0) => { const r = (run_loop($state_phase$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_edit": run_lib((a0) => { const r = (run_loop($state_edit$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_task": run_lib((a0) => { const r = BigInt(run_loop($state_task$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_revision": run_lib((a0) => { const r = BigInt(run_loop($state_revision$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_generation": run_lib((a0) => { const r = BigInt(run_loop($state_generation$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_suspended": run_lib((a0) => { const r = (run_loop($state_suspended$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_pendingPhase": run_lib((a0) => { const r = (run_loop($state_pendingPhase$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_pendingEdit": run_lib((a0) => { const r = (run_loop($state_pendingEdit$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_pendingTask": run_lib((a0) => { const r = BigInt(run_loop($state_pendingTask$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_bytes": run_lib((a0) => { const r = BigInt(run_loop($state_bytes$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "state_units": run_lib((a0) => { const r = $0m3(run_loop($state_units$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "set_random": run_lib((a0, a1) => { const r = $0m2(run_loop($set_random$($0m0(a0), (a1)))); $0m2(a0); (a1); return r; }, 2),
  "set_phase": run_lib((a0, a1) => { const r = $0m2(run_loop($set_phase$($0m0(a0), (a1)))); $0m2(a0); (a1); return r; }, 2),
  "set_edit": run_lib((a0, a1) => { const r = $0m2(run_loop($set_edit$($0m0(a0), (a1)))); $0m2(a0); (a1); return r; }, 2),
  "set_task": run_lib((a0, a1) => { const r = $0m2(run_loop($set_task$($0m0(a0), nat_host(a1)))); $0m2(a0); BigInt(a1); return r; }, 2),
  "set_revision": run_lib((a0, a1) => { const r = $0m2(run_loop($set_revision$($0m0(a0), nat_host(a1)))); $0m2(a0); BigInt(a1); return r; }, 2),
  "set_generation": run_lib((a0, a1) => { const r = $0m2(run_loop($set_generation$($0m0(a0), nat_host(a1)))); $0m2(a0); BigInt(a1); return r; }, 2),
  "set_suspended": run_lib((a0, a1) => { const r = $0m2(run_loop($set_suspended$($0m0(a0), (a1)))); $0m2(a0); (a1); return r; }, 2),
  "set_pendingPhase": run_lib((a0, a1) => { const r = $0m2(run_loop($set_pendingPhase$($0m0(a0), (a1)))); $0m2(a0); (a1); return r; }, 2),
  "set_pendingEdit": run_lib((a0, a1) => { const r = $0m2(run_loop($set_pendingEdit$($0m0(a0), (a1)))); $0m2(a0); (a1); return r; }, 2),
  "set_pendingTask": run_lib((a0, a1) => { const r = $0m2(run_loop($set_pendingTask$($0m0(a0), nat_host(a1)))); $0m2(a0); BigInt(a1); return r; }, 2),
  "set_bytes": run_lib((a0, a1) => { const r = $0m2(run_loop($set_bytes$($0m0(a0), nat_host(a1)))); $0m2(a0); BigInt(a1); return r; }, 2),
  "set_units": run_lib((a0, a1) => { const r = $0m2(run_loop($set_units$($0m0(a0), $0m1(a1)))); $0m2(a0); $0m3(a1); return r; }, 2),
  "transition_state": run_lib((a0) => { const r = $0m2(run_loop($transition_state$($0m4(a0)))); $0m7(a0); return r; }, 1),
  "transition_events": run_lib((a0) => { const r = $0m8(run_loop($transition_events$($0m4(a0)))); $0m7(a0); return r; }, 1),
  "event_delay": run_lib((a0) => { const r = (run_loop($event_delay$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_kind": run_lib((a0) => { const r = (run_loop($event_kind$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_task": run_lib((a0) => { const r = BigInt(run_loop($event_task$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_revision": run_lib((a0) => { const r = BigInt(run_loop($event_revision$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_generation": run_lib((a0) => { const r = BigInt(run_loop($event_generation$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_bytes": run_lib((a0) => { const r = BigInt(run_loop($event_bytes$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_units": run_lib((a0) => { const r = $0m3(run_loop($event_units$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_repair": run_lib((a0) => { const r = (run_loop($event_repair$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "event_recurring": run_lib((a0) => { const r = (run_loop($event_recurring$($0m6(a0)))); $0m9(a0); return r; }, 1),
  "seed_hash": run_lib((a0, a1) => { const r = (run_loop($seed_hash$((a0), (a1)))); (a0); (a1); return r; }, 2),
  "nonzero": run_lib((a0) => { const r = (run_loop($nonzero$((a0)))); (a0); return r; }, 1),
  "initial": run_lib((a0, a1, a2, a3, a4) => { const r = $0m2(run_loop($initial$((a0), (a1), (a2), nat_host(a3), $0m1(a4)))); (a0); (a1); (a2); BigInt(a3); $0m3(a4); return r; }, 5),
  "random_step": run_lib((a0) => { const r = (run_loop($random_step$((a0)))); (a0); return r; }, 1),
  "positive_delay": run_lib((a0, a1) => { const r = (run_loop($positive_delay$((a0), (a1)))); (a0); (a1); return r; }, 2),
  "sample_delay": run_lib((a0, a1) => { const r = (run_loop($sample_delay$((a0), (a1)))); (a0); (a1); return r; }, 2),
  "snapshot": run_lib((a0) => { const r = $0m2(run_loop($snapshot$($0m0(a0)))); $0m2(a0); return r; }, 1),
  "emission": run_lib((a0, a1, a2, a3, a4) => { const r = $0m9(run_loop($emission$($0m0(a0), (a1), (a2), (a3), (a4)))); $0m2(a0); (a1); (a2); (a3); (a4); return r; }, 5),
  "fresh": run_lib((a0, a1, a2, a3) => { const r = $0m7(run_loop($fresh$($0m0(a0), (a1), (a2), (a3)))); $0m2(a0); (a1); (a2); (a3); return r; }, 4),
  "task_next": run_lib((a0, a1) => { const r = $0m7(run_loop($task_next$((a0), $0m0(a1)))); (a0); $0m2(a1); return r; }, 2),
  "edit_next": run_lib((a0, a1) => { const r = $0m7(run_loop($edit_next$((a0), $0m0(a1)))); (a0); $0m2(a1); return r; }, 2),
  "finish_next": run_lib((a0, a1) => { const r = $0m7(run_loop($finish_next$((a0), $0m0(a1)))); (a0); $0m2(a1); return r; }, 2),
  "phase_next": run_lib((a0, a1, a2) => { const r = $0m7(run_loop($phase_next$((a0), $0m0(a1), (a2)))); (a0); $0m2(a1); (a2); return r; }, 3),
  "enabled_next": run_lib((a0, a1, a2) => { const r = $0m7(run_loop($enabled_next$((a0), $0m0(a1), (a2)))); (a0); $0m2(a1); (a2); return r; }, 3),
  "next": run_lib((a0, a1) => { const r = $0m7(run_loop($next$((a0), $0m0(a1)))); (a0); $0m2(a1); return r; }, 2),
  "finish_state": run_lib((a0, a1) => { const r = $0m2(run_loop($finish_state$($0m0(a0), (a1)))); $0m2(a0); (a1); return r; }, 2),
  "on_finish": run_lib((a0, a1, a2) => { const r = $0m7(run_loop($on_finish$((a0), $0m0(a1), (a2)))); (a0); $0m2(a1); (a2); return r; }, 3),
  "rewind": run_lib((a0, a1) => { const r = $0m7(run_loop($rewind$((a0), $0m0(a1)))); (a0); $0m2(a1); return r; }, 2),
  "sizes": run_lib((a0, a1, a2) => { const r = $0m2(run_loop($sizes$($0m0(a0), nat_host(a1), $0m1(a2)))); $0m2(a0); BigInt(a1); $0m3(a2); return r; }, 3),
  "suspend": run_lib((a0, a1, a2) => { const r = $0m7(run_loop($suspend$((a0), $0m0(a1), (a2)))); (a0); $0m2(a1); (a2); return r; }, 3),
  "set_interval": run_lib((a0, a1) => { const r = (run_loop($set_interval$((a0), (a1)))); (a0); (a1); return r; }, 2),
  "advice_case": run_lib((a0, a1, a2) => { const r = $0m7(run_loop($advice_case$($0m0(a0), (a1), (a2)))); $0m2(a0); (a1); (a2); return r; }, 3),
  "on_advice": run_lib((a0, a1) => { const r = $0m7(run_loop($on_advice$((a0), $0m0(a1)))); (a0); $0m2(a1); return r; }, 2),
  "burst_events": run_lib((a0, a1) => { const r = $0m8(run_loop($burst_events$(nat_host(a0), $0m0(a1)))); BigInt(a0); $0m2(a1); return r; }, 2),
  "burst": run_lib((a0, a1) => { const r = $0m7(run_loop($burst$(nat_host(a0), $0m0(a1)))); BigInt(a0); $0m2(a1); return r; }, 2),
};
