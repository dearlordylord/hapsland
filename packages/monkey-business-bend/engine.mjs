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

function $$$$047agent$045flow$045bend$047Ledger$limits_for$(_purpose_0, _limits_0) {
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

function $$$$047agent$045flow$045bend$047Ledger$inventory$(_limits_0) {
  return {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.ObservationDispatch"}, "limits": ($$$$047agent$045flow$045bend$047Ledger$limits_for$({$: "Ledger.ObservationDispatch"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.Preparation"}, "limits": ($$$$047agent$045flow$045bend$047Ledger$limits_for$({$: "Ledger.Preparation"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.ReviewUnit"}, "limits": ($$$$047agent$045flow$045bend$047Ledger$limits_for$({$: "Ledger.ReviewUnit"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.StoredResult"}, "limits": ($$$$047agent$045flow$045bend$047Ledger$limits_for$({$: "Ledger.StoredResult"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.OperationalNotice"}, "limits": ($$$$047agent$045flow$045bend$047Ledger$limits_for$({$: "Ledger.OperationalNotice"}, _limits_0))}, "tail": {$: "Con", "head": {$: "Ledger.InventoryEntry", "purpose": {$: "Ledger.AdviceRecheck"}, "limits": ($$$$047agent$045flow$045bend$047Ledger$limits_for$({$: "Ledger.AdviceRecheck"}, _limits_0))}, "tail": {$: "Nil"}}}}}}};
}

function $$$$047agent$045flow$045bend$047Ledger$initial$(_limits_0) {
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": 1, "charges": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Ledger$total$add$(_usage_0, _bytes_0) {
  const _items_0 = _usage_0["items"];
  const _current_bytes_0 = _usage_0["bytes"];
  return {$: "Ledger.Usage", "items": nat_chk(_items_0 + 1), "bytes": nat_chk(_current_bytes_0 + _bytes_0)};
}

function $$$$047agent$045flow$045bend$047Ledger$total$(_charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Ledger.Usage", "items": 0, "bytes": 0};
  } else {
    const _t_0 = _charges_0["head"];
    const _bytes_0 = _t_0["bytes"];
    const _rest_0 = _charges_0["tail"];
    return $$$$047agent$045flow$045bend$047Ledger$total$add$(($$$$047agent$045flow$045bend$047Ledger$total$(_rest_0)), _bytes_0);
  }
}

function $$$$047agent$045flow$045bend$047Ledger$partition_usage$add$(_usage_0, _bytes_0, _same_0) {
  const _items_0 = _usage_0["items"];
  const _current_bytes_0 = _usage_0["bytes"];
  if (_same_0) {
    return {$: "Ledger.Usage", "items": nat_chk(_items_0 + 1), "bytes": nat_chk(_current_bytes_0 + _bytes_0)};
  } else {
    return {$: "Ledger.Usage", "items": _items_0, "bytes": _current_bytes_0};
  }
}

function $$$$047agent$045flow$045bend$047Ledger$partition_usage$(_charges_0, _partition_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Ledger.Usage", "items": 0, "bytes": 0};
  } else {
    const _t_0 = _charges_0["head"];
    const _owner_0 = _t_0["partition"];
    const _bytes_0 = _t_0["bytes"];
    const _rest_0 = _charges_0["tail"];
    return $$$$047agent$045flow$045bend$047Ledger$partition_usage$add$(($$$$047agent$045flow$045bend$047Ledger$partition_usage$(_rest_0, _partition_0)), _bytes_0, ($Nat$is_eq$(_owner_0, _partition_0)));
  }
}

function $$$$047agent$045flow$045bend$047Ledger$fit_decision$(_limits_0, _global_0, _local_0, _bytes_0) {
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

function $$$$047agent$045flow$045bend$047Ledger$decision_fits$(_decision_0) {
  if (_decision_0.$ === "Ledger.Fits") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Ledger$fits$(_limits_0, _global_0, _local_0, _bytes_0) {
  return $$$$047agent$045flow$045bend$047Ledger$decision_fits$(($$$$047agent$045flow$045bend$047Ledger$fit_decision$(_limits_0, _global_0, _local_0, _bytes_0)));
}

function $$$$047agent$045flow$045bend$047Ledger$admission$(_state_0, _partition_0, _bytes_0) {
  const _limits_0 = _state_0["limits"];
  const _charges_0 = _state_0["charges"];
  return $$$$047agent$045flow$045bend$047Ledger$fit_decision$(_limits_0, ($$$$047agent$045flow$045bend$047Ledger$total$(_charges_0)), ($$$$047agent$045flow$045bend$047Ledger$partition_usage$(_charges_0, _partition_0)), _bytes_0);
}

function $$$$047agent$045flow$045bend$047Ledger$reserve$check$(_limits_0, _next_id_0, _charges_0, _partition_0, _bytes_0, _purpose_0, _allowed_0) {
  if (_allowed_0) {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": nat_chk(_next_id_0 + 1), "charges": ($List$append$(_charges_0, {$: "Con", "head": {$: "Ledger.Charge", "id": _next_id_0, "partition": _partition_0, "bytes": _bytes_0, "purpose": _purpose_0}, "tail": {$: "Nil"}}))}, "id": _next_id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $$$$047agent$045flow$045bend$047Ledger$reserve_for$(_state_0, _partition_0, _bytes_0, _purpose_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $$$$047agent$045flow$045bend$047Ledger$reserve$check$(_limits_0, _next_id_0, _charges_0, _partition_0, _bytes_0, _purpose_0, ($$$$047agent$045flow$045bend$047Ledger$fits$(($$$$047agent$045flow$045bend$047Ledger$limits_for$(_purpose_0, _limits_0)), ($$$$047agent$045flow$045bend$047Ledger$total$(_charges_0)), ($$$$047agent$045flow$045bend$047Ledger$partition_usage$(_charges_0, _partition_0)), _bytes_0)));
}

function $$$$047agent$045flow$045bend$047Ledger$reserve$(_state_0, _partition_0, _bytes_0) {
  return $$$$047agent$045flow$045bend$047Ledger$reserve_for$(_state_0, _partition_0, _bytes_0, {$: "Ledger.ReviewUnit"});
}

function $$$$047agent$045flow$045bend$047Ledger$find$pick$(_charge_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _charge_0};
  } else {
    return _fallback_0;
  }
}

function $$$$047agent$045flow$045bend$047Ledger$find$(_id_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["bytes"];
    const __2 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $$$$047agent$045flow$045bend$047Ledger$find$pick$({$: "Ledger.Charge", "id": _current_0, "partition": __0, "bytes": __1, "purpose": __2}, ($$$$047agent$045flow$045bend$047Ledger$find$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Ledger$remove$pick$(_charge_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Ledger$remove$(_id_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["bytes"];
    const __2 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $$$$047agent$045flow$045bend$047Ledger$remove$pick$({$: "Ledger.Charge", "id": _current_0, "partition": __0, "bytes": __1, "purpose": __2}, ($$$$047agent$045flow$045bend$047Ledger$remove$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Ledger$release$found$(_state_0, _id_0, _found_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  if (_found_0.$ === "Some") {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($$$$047agent$045flow$045bend$047Ledger$remove$(_id_0, _charges_0))}, "id": _id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $$$$047agent$045flow$045bend$047Ledger$release$(_state_0, _id_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $$$$047agent$045flow$045bend$047Ledger$release$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, ($$$$047agent$045flow$045bend$047Ledger$find$(_id_0, _charges_0)));
}

function $$$$047agent$045flow$045bend$047Ledger$replace$pick$(_charge_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Ledger$replace$(_id_0, _bytes_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const _old_bytes_0 = _t_0["bytes"];
    const _purpose_0 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $$$$047agent$045flow$045bend$047Ledger$replace$pick$({$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": _old_bytes_0, "purpose": _purpose_0}, {$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": _bytes_0, "purpose": _purpose_0}, ($$$$047agent$045flow$045bend$047Ledger$replace$(_id_0, _bytes_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Ledger$replace_for$(_id_0, _bytes_0, _purpose_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const __0 = _t_0["bytes"];
    const __1 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $$$$047agent$045flow$045bend$047Ledger$replace$pick$({$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": __0, "purpose": __1}, {$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": _bytes_0, "purpose": _purpose_0}, ($$$$047agent$045flow$045bend$047Ledger$replace_for$(_id_0, _bytes_0, _purpose_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Ledger$resize$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, _allowed_0) {
  if (_allowed_0) {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($$$$047agent$045flow$045bend$047Ledger$replace$(_id_0, _bytes_0, _charges_0))}, "id": _id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $$$$047agent$045flow$045bend$047Ledger$resize_for$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, _purpose_0, _allowed_0) {
  if (_allowed_0) {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($$$$047agent$045flow$045bend$047Ledger$replace_for$(_id_0, _bytes_0, _purpose_0, _charges_0))}, "id": _id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  }
}

function $$$$047agent$045flow$045bend$047Ledger$resize_for$found$(_state_0, _id_0, _bytes_0, _purpose_0, _found_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  if (_found_0.$ === "None") {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  } else {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    const _others_0 = ($$$$047agent$045flow$045bend$047Ledger$remove$(_id_0, _charges_0));
    return $$$$047agent$045flow$045bend$047Ledger$resize_for$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, _purpose_0, ($$$$047agent$045flow$045bend$047Ledger$fits$(($$$$047agent$045flow$045bend$047Ledger$limits_for$(_purpose_0, _limits_0)), ($$$$047agent$045flow$045bend$047Ledger$total$(_others_0)), ($$$$047agent$045flow$045bend$047Ledger$partition_usage$(_others_0, _partition_0)), _bytes_0)));
  }
}

function $$$$047agent$045flow$045bend$047Ledger$resize_for$(_state_0, _id_0, _bytes_0, _purpose_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $$$$047agent$045flow$045bend$047Ledger$resize_for$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, _bytes_0, _purpose_0, ($$$$047agent$045flow$045bend$047Ledger$find$(_id_0, _charges_0)));
}

function $$$$047agent$045flow$045bend$047Ledger$resize$found$(_state_0, _id_0, _bytes_0, _found_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  if (_found_0.$ === "None") {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  } else {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    const _others_0 = ($$$$047agent$045flow$045bend$047Ledger$remove$(_id_0, _charges_0));
    return $$$$047agent$045flow$045bend$047Ledger$resize$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, ($$$$047agent$045flow$045bend$047Ledger$fits$(_limits_0, ($$$$047agent$045flow$045bend$047Ledger$total$(_others_0)), ($$$$047agent$045flow$045bend$047Ledger$partition_usage$(_others_0, _partition_0)), _bytes_0)));
  }
}

function $$$$047agent$045flow$045bend$047Ledger$resize$(_state_0, _id_0, _bytes_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $$$$047agent$045flow$045bend$047Ledger$resize$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, _bytes_0, ($$$$047agent$045flow$045bend$047Ledger$find$(_id_0, _charges_0)));
}

function $$$$047agent$045flow$045bend$047Ledger$clear$(_state_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Ledger$main$() {
  return $$$$047agent$045flow$045bend$047Ledger$reserve$(($$$$047agent$045flow$045bend$047Ledger$initial$({$: "Ledger.Limits", "global_items": 4, "global_bytes": 100, "partition_items": 2, "partition_bytes": 60})), 1, 20);
}

function $$$$047agent$045flow$045bend$047Admission$prospective_gate_ordered$(_clock_valid_0, _within_0) {
  if (!_within_0) {
    return {$: "Admission.PermitLate"};
  } else {
    return $Bool$pick$(_clock_valid_0, {$: "Admission.PermitAllowed"}, {$: "Admission.PermitDenied"});
  }
}

function $$$$047agent$045flow$045bend$047Admission$prospective_gate_window$(_facts_0, _within_0, _ordered_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  if (!_ordered_0) {
    return {$: "Admission.PermitInvalidClock"};
  } else {
    return $$$$047agent$045flow$045bend$047Admission$prospective_gate_ordered$(_clock_valid_0, _within_0);
  }
}

function $$$$047agent$045flow$045bend$047Admission$prospective_gate$(_facts_0, _started_0, _now_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  const _hook_window_0 = _facts_0["hook_window"];
  const _started_upper_0 = _facts_0["started_upper"];
  const _now_lower_0 = _facts_0["now_lower"];
  const _advicee_permit_limit_0 = _facts_0["advicee_permit_limit"];
  const _resident_permit_limit_0 = _facts_0["resident_permit_limit"];
  const _x_0 = nat_chk(_started_0 + _hook_window_0);
  return $$$$047agent$045flow$045bend$047Admission$prospective_gate_window$({$: "Admission.ProspectiveFacts", "clock_valid": _clock_valid_0, "hook_window": _hook_window_0, "started_upper": _started_upper_0, "now_lower": _now_lower_0, "advicee_permit_limit": _advicee_permit_limit_0, "resident_permit_limit": _resident_permit_limit_0}, (_now_0 < _x_0), ($Nat$is_le$(_started_upper_0, _now_lower_0)));
}

function $$$$047agent$045flow$045bend$047Admission$pending_count$(_state_0) {
  const _permits_0 = _state_0["permits"];
  return $List$length$(_permits_0);
}

function $$$$047agent$045flow$045bend$047Admission$initial$(_partition_0, _lifetime_0) {
  return {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": 0, "active": false, "closed_at": 0, "next_token": 1, "permits": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Admission$has_tool$(_tool_0, _permits_0) {
  if (_permits_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _permits_0["head"];
    const _current_0 = _t_0["tool"];
    const _rest_0 = _permits_0["tail"];
    const _x_0 = ($Nat$is_eq$(_tool_0, _current_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Admission$has_tool$(_tool_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Admission$find_permit$pick$(_permit_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _permit_0};
  } else {
    return _fallback_0;
  }
}

function $$$$047agent$045flow$045bend$047Admission$find_permit$(_token_0, _permits_0) {
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
    return $$$$047agent$045flow$045bend$047Admission$find_permit$pick$({$: "Admission.Permit", "token": _current_0, "tool": __0, "round": __1, "started": __2, "deadline": __3}, ($$$$047agent$045flow$045bend$047Admission$find_permit$(_token_0, _rest_0)), ($Nat$is_eq$(_current_0, _token_0)));
  }
}

function $$$$047agent$045flow$045bend$047Admission$remove_permit$pick$(_permit_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _permit_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Admission$remove_permit$(_token_0, _permits_0) {
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
    return $$$$047agent$045flow$045bend$047Admission$remove_permit$pick$({$: "Admission.Permit", "token": _current_0, "tool": __0, "round": __1, "started": __2, "deadline": __3}, ($$$$047agent$045flow$045bend$047Admission$remove_permit$(_token_0, _rest_0)), ($Nat$is_eq$(_current_0, _token_0)));
  }
}

function $$$$047agent$045flow$045bend$047Admission$candidate_round$(_round_0, _active_0) {
  if (_active_0) {
    return _round_0;
  } else {
    return nat_chk(_round_0 + 1);
  }
}

function $$$$047agent$045flow$045bend$047Admission$issue$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _duplicate_0) {
  if (_duplicate_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.DuplicateTool"}};
  } else {
    const _expected_round_0 = ($$$$047agent$045flow$045bend$047Admission$candidate_round$(_round_0, _active_0));
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": nat_chk(_next_token_0 + 1), "permits": ($List$append$(_permits_0, {$: "Con", "head": {$: "Admission.Permit", "token": _next_token_0, "tool": _tool_0, "round": _expected_round_0, "started": _started_0, "deadline": _deadline_0}, "tail": {$: "Nil"}}))}, "token": {$: "Some", "value": _next_token_0}, "round": {$: "Some", "value": _expected_round_0}};
  }
}

function $$$$047agent$045flow$045bend$047Admission$issue$guard$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _now_0, _clock_valid_0) {
  if (!_clock_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.StaleInvocation"}};
  } else {
    return $$$$047agent$045flow$045bend$047Admission$issue$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, ($$$$047agent$045flow$045bend$047Admission$has_tool$(_tool_0, _permits_0)));
  }
}

function $$$$047agent$045flow$045bend$047Admission$issue$(_state_0, _tool_0, _started_0, _deadline_0, _now_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $$$$047agent$045flow$045bend$047Admission$issue$guard$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _tool_0, _started_0, _deadline_0, _now_0, ($Bool$and$(($Nat$is_gt$(_started_0, _closed_at_0)), ($Bool$and$(($Nat$is_le$(_started_0, _now_0)), ($Nat$is_le$(_now_0, _deadline_0)))))));
}

function $$$$047agent$045flow$045bend$047Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, _correct_round_0) {
  if (!_correct_round_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.OldRound"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _permitted_round_0, "active": true, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($$$$047agent$045flow$045bend$047Admission$remove_permit$(_token_0, _permits_0))}, "token": {$: "Some", "value": _token_0}, "round": {$: "Some", "value": _permitted_round_0}};
  }
}

function $$$$047agent$045flow$045bend$047Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.Expired"}};
  } else {
    return $$$$047agent$045flow$045bend$047Admission$consume$round$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _permitted_round_0, ($Nat$is_eq$(_permitted_round_0, ($$$$047agent$045flow$045bend$047Admission$candidate_round$(_round_0, _active_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Admission$consume$tool$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, _correct_tool_0) {
  if (!_correct_tool_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongTool"}};
  } else {
    return $$$$047agent$045flow$045bend$047Admission$consume$time$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _now_0, _permitted_round_0, ($Bool$and$(($Nat$is_gt$(_started_0, _closed_at_0)), ($Bool$and$(($Nat$is_le$(_started_0, _now_0)), ($Nat$is_le$(_now_0, _deadline_0)))))));
  }
}

function $$$$047agent$045flow$045bend$047Admission$consume$check$(_state_0, _token_0, _tool_0, _now_0, _permitted_tool_0, _permitted_round_0, _started_0, _deadline_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $$$$047agent$045flow$045bend$047Admission$consume$tool$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _permits_0, _token_0, _tool_0, _now_0, _permitted_round_0, _started_0, _deadline_0, ($Nat$is_eq$(_tool_0, _permitted_tool_0)));
}

function $$$$047agent$045flow$045bend$047Admission$consume$found$(_state_0, _token_0, _tool_0, _now_0, _permit_0) {
  if (_permit_0.$ === "None") {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.NoPermit"}};
  } else {
    const _t_0 = _permit_0["value"];
    const _permitted_tool_0 = _t_0["tool"];
    const _permitted_round_0 = _t_0["round"];
    const _started_0 = _t_0["started"];
    const _deadline_0 = _t_0["deadline"];
    return $$$$047agent$045flow$045bend$047Admission$consume$check$(_state_0, _token_0, _tool_0, _now_0, _permitted_tool_0, _permitted_round_0, _started_0, _deadline_0);
  }
}

function $$$$047agent$045flow$045bend$047Admission$consume$(_state_0, _token_0, _tool_0, _now_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $$$$047agent$045flow$045bend$047Admission$consume$found$({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0}, _token_0, _tool_0, _now_0, ($$$$047agent$045flow$045bend$047Admission$find_permit$(_token_0, _permits_0)));
}

function $$$$047agent$045flow$045bend$047Admission$release$found$(_state_0, _token_0, _found_0) {
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
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($$$$047agent$045flow$045bend$047Admission$remove_permit$(_token_0, _permits_0))}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $$$$047agent$045flow$045bend$047Admission$release$(_state_0, _token_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["lifetime"];
  const __2 = _state_0["round"];
  const __3 = _state_0["active"];
  const __4 = _state_0["closed_at"];
  const __5 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $$$$047agent$045flow$045bend$047Admission$release$found$({$: "Admission.AdmissionState", "partition": __0, "lifetime": __1, "round": __2, "active": __3, "closed_at": __4, "next_token": __5, "permits": _permits_0}, _token_0, ($$$$047agent$045flow$045bend$047Admission$find_permit$(_token_0, _permits_0)));
}

function $$$$047agent$045flow$045bend$047Admission$expire$due$(_state_0, _token_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return {$: "Admission.RemovePermit", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": ($$$$047agent$045flow$045bend$047Admission$remove_permit$(_token_0, _permits_0))}};
}

function $$$$047agent$045flow$045bend$047Admission$expire$(_state_0, _token_0, _deadline_reached_0) {
  if (!_deadline_reached_0) {
    return {$: "Admission.KeepPermit", "state": _state_0};
  } else {
    return $$$$047agent$045flow$045bend$047Admission$expire$due$(_state_0, _token_0);
  }
}

function $$$$047agent$045flow$045bend$047Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.InvalidClock"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": false, "closed_at": _at_0, "next_token": _next_token_0, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "Some", "value": _round_0}};
  }
}

function $$$$047agent$045flow$045bend$047Admission$close_round$active$(_state_0, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _at_0) {
  if (!_active_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.RoundAlreadyClosed"}};
  } else {
    return $$$$047agent$045flow$045bend$047Admission$close_round$time$(_state_0, _partition_0, _lifetime_0, _round_0, _next_token_0, _at_0, ($Nat$is_ge$(_at_0, _closed_at_0)));
  }
}

function $$$$047agent$045flow$045bend$047Admission$close_round$(_state_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _next_token_0 = _state_0["next_token"];
  const _permits_0 = _state_0["permits"];
  return $$$$047agent$045flow$045bend$047Admission$close_round$active$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "active": _active_0, "closed_at": _closed_at_0, "next_token": _next_token_0, "permits": _permits_0}, _partition_0, _lifetime_0, _round_0, _active_0, _closed_at_0, _next_token_0, _at_0);
}

function $$$$047agent$045flow$045bend$047Admission$restart$fresh$(_state_0, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.LifetimeNotFresh"}};
  } else {
    return {$: "Admission.Accepted", "state": {$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _new_lifetime_0, "round": 0, "active": false, "closed_at": _at_0, "next_token": 1, "permits": {$: "Nil"}}, "token": {$: "None"}, "round": {$: "None"}};
  }
}

function $$$$047agent$045flow$045bend$047Admission$restart$(_state_0, _new_lifetime_0, _at_0) {
  const _partition_0 = _state_0["partition"];
  const _lifetime_0 = _state_0["lifetime"];
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const __2 = _state_0["next_token"];
  const __3 = _state_0["permits"];
  return $$$$047agent$045flow$045bend$047Admission$restart$fresh$({$: "Admission.AdmissionState", "partition": _partition_0, "lifetime": _lifetime_0, "round": __0, "active": __1, "closed_at": _closed_at_0, "next_token": __2, "permits": __3}, _partition_0, _lifetime_0, _closed_at_0, _new_lifetime_0, _at_0, ($Bool$and$(($Nat$is_gt$(_new_lifetime_0, _lifetime_0)), ($Nat$is_ge$(_at_0, _closed_at_0)))));
}

function $$$$047agent$045flow$045bend$047Admission$callback_current$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const _owner_0 = _state_0["partition"];
  const _live_0 = _state_0["lifetime"];
  const _current_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  return $Bool$and$(_active_0, ($Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_live_0, _lifetime_0)), ($Nat$is_eq$(_current_0, _round_0)))))));
}

function $$$$047agent$045flow$045bend$047Admission$apply_event$(_state_0, _event_0) {
  if (_event_0.$ === "Admission.Issue") {
    const _tool_0 = _event_0["tool"];
    const _started_0 = _event_0["started"];
    const _deadline_0 = _event_0["deadline"];
    const _now_0 = _event_0["now"];
    return $$$$047agent$045flow$045bend$047Admission$issue$(_state_0, _tool_0, _started_0, _deadline_0, _now_0);
  } else if (_event_0.$ === "Admission.Consume") {
    const _token_0 = _event_0["token"];
    const _tool_1 = _event_0["tool"];
    const _now_1 = _event_0["now"];
    return $$$$047agent$045flow$045bend$047Admission$consume$(_state_0, _token_0, _tool_1, _now_1);
  } else if (_event_0.$ === "Admission.Release") {
    const _token_1 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Admission$release$(_state_0, _token_1);
  } else if (_event_0.$ === "Admission.CloseRound") {
    const _at_0 = _event_0["at"];
    return $$$$047agent$045flow$045bend$047Admission$close_round$(_state_0, _at_0);
  } else {
    const _new_lifetime_0 = _event_0["new_lifetime"];
    const _at_1 = _event_0["at"];
    return $$$$047agent$045flow$045bend$047Admission$restart$(_state_0, _new_lifetime_0, _at_1);
  }
}

function $$$$047agent$045flow$045bend$047Admission$step$partition$(_state_0, _partition_0, _lifetime_0, _event_0, _correct_partition_0, _correct_lifetime_0) {
  if (!_correct_partition_0) {
    return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongPartition"}};
  } else {
    if (!_correct_lifetime_0) {
      return {$: "Admission.Rejected", "state": _state_0, "reason": {$: "Admission.WrongLifetime"}};
    } else {
      return $$$$047agent$045flow$045bend$047Admission$apply_event$(_state_0, _event_0);
    }
  }
}

function $$$$047agent$045flow$045bend$047Admission$step$(_state_0, _partition_0, _lifetime_0, _event_0) {
  const _owner_0 = _state_0["partition"];
  const _live_0 = _state_0["lifetime"];
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed_at"];
  const __3 = _state_0["next_token"];
  const __4 = _state_0["permits"];
  return $$$$047agent$045flow$045bend$047Admission$step$partition$({$: "Admission.AdmissionState", "partition": _owner_0, "lifetime": _live_0, "round": __0, "active": __1, "closed_at": __2, "next_token": __3, "permits": __4}, _partition_0, _lifetime_0, _event_0, ($Nat$is_eq$(_owner_0, _partition_0)), ($Nat$is_eq$(_live_0, _lifetime_0)));
}

function $$$$047agent$045flow$045bend$047Admission$main$() {
  return $$$$047agent$045flow$045bend$047Admission$step$(($$$$047agent$045flow$045bend$047Admission$initial$(7, 3)), 7, 3, {$: "Admission.Issue", "tool": 42, "started": 10, "deadline": 20, "now": 11});
}

function $$$$047agent$045flow$045bend$047EditHistory$initial$() {
  return {$: "EditHistory.State", "entries": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047EditHistory$count$(_state_0) {
  const _entries_0 = _state_0["entries"];
  return $List$length$(_entries_0);
}

function $$$$047agent$045flow$045bend$047EditHistory$lookup_entries$(_tool_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "EditHistory.Absent"};
  } else {
    const _t_0 = _entries_0["head"];
    const _current_0 = _t_0["tool"];
    const _reason_0 = _t_0["reason"];
    const _reported_0 = _t_0["reported"];
    const _rest_0 = _entries_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_tool_0, _current_0)), {$: "EditHistory.Seen", "reason": _reason_0, "report": ($Bool$not$(_reported_0))}, ($$$$047agent$045flow$045bend$047EditHistory$lookup_entries$(_tool_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047EditHistory$lookup$(_tool_0, _state_0) {
  const _entries_0 = _state_0["entries"];
  return $$$$047agent$045flow$045bend$047EditHistory$lookup_entries$(_tool_0, _entries_0);
}

function $$$$047agent$045flow$045bend$047EditHistory$mark_entries$(_tool_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _entries_0["head"];
    const _current_0 = _t_0["tool"];
    const _reason_0 = _t_0["reason"];
    const _reported_0 = _t_0["reported"];
    const _rest_0 = _entries_0["tail"];
    const _x_0 = ($Nat$is_eq$(_tool_0, _current_0));
    return {$: "Con", "head": {$: "EditHistory.Completed", "tool": _current_0, "reason": _reason_0, "reported": (_reported_0 || _x_0)}, "tail": ($$$$047agent$045flow$045bend$047EditHistory$mark_entries$(_tool_0, _rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047EditHistory$mark_reported$(_tool_0, _state_0) {
  const _entries_0 = _state_0["entries"];
  return {$: "EditHistory.State", "entries": ($$$$047agent$045flow$045bend$047EditHistory$mark_entries$(_tool_0, _entries_0))};
}

function $$$$047agent$045flow$045bend$047EditHistory$record_entries$(_tool_0, _reason_0, _entries_0, _size_0) {
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

function $$$$047agent$045flow$045bend$047EditHistory$record$(_tool_0, _reason_0, _state_0) {
  const _entries_0 = _state_0["entries"];
  return $$$$047agent$045flow$045bend$047EditHistory$record_entries$(_tool_0, _reason_0, _entries_0, ($List$length$(_entries_0)));
}

function $$$$047agent$045flow$045bend$047Quiescence$facts_quiet$(_facts_0) {
  const _work_0 = _facts_0["native_work_idle"];
  const _advice_0 = _facts_0["advice_empty"];
  const _handoff_0 = _facts_0["handoff_idle"];
  const _stop_0 = _facts_0["stop_absent"];
  return $Bool$and$(_work_0, ($Bool$and$(_advice_0, ($Bool$and$(_handoff_0, _stop_0)))));
}

function $$$$047agent$045flow$045bend$047Quiescence$decide_started$(_since_0, _now_0, _window_0) {
  return $Bool$pick$(($Nat$is_ge$(_now_0, nat_chk(_since_0 + _window_0))), {$: "Quiescence.Expired", "since": _since_0}, {$: "Quiescence.Waiting", "since": _since_0});
}

function $$$$047agent$045flow$045bend$047Quiescence$decide_quiet$(_since_0, _now_0, _window_0) {
  if (_since_0.$ === "None") {
    return {$: "Quiescence.Waiting", "since": _now_0};
  } else {
    const _start_0 = _since_0["value"];
    return $Bool$pick$(($Nat$is_ge$(_now_0, _start_0)), ($$$$047agent$045flow$045bend$047Quiescence$decide_started$(_start_0, _now_0, _window_0)), {$: "Quiescence.Waiting", "since": _now_0});
  }
}

function $$$$047agent$045flow$045bend$047Quiescence$decide$(_since_0, _now_0, _window_0, _quiet_0) {
  if (!_quiet_0) {
    return {$: "Quiescence.Busy"};
  } else {
    return $$$$047agent$045flow$045bend$047Quiescence$decide_quiet$(_since_0, _now_0, _window_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$capacity_valid$(_capacity_0) {
  const _low_0 = _capacity_0["low"];
  const _high_0 = _capacity_0["high"];
  const _x_0 = ($Nat$is_gt$(_high_0, 0));
  const _x_1 = ($Nat$is_gt$(_low_0, 0));
  return (_x_0 || _x_1);
}

function $$$$047agent$045flow$045bend$047Flow$has_room$(_occupied_0, _capacity_0) {
  const _low_0 = _capacity_0["low"];
  const _high_0 = _capacity_0["high"];
  const _x_0 = ($Nat$is_gt$(_high_0, 0));
  const _x_1 = (_occupied_0 < _low_0);
  return (_x_0 || _x_1);
}

function $$$$047agent$045flow$045bend$047Flow$route_of$(_event_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.AgentEditNode"}, "to": {$: "Flow.EditQueueNode"}, "input": {$: "Flow.EditObservation"}, "output": {$: "Flow.CaptureJob"}, "copy": false};
  } else if (_event_0.$ === "Flow.IngressStarted") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.EditQueueNode"}, "to": {$: "Flow.PreparationNode"}, "input": {$: "Flow.CaptureJob"}, "output": {$: "Flow.CaptureJob"}, "copy": false};
  } else if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.PreparationNode"}, "to": {$: "Flow.ReviewQueueNode"}, "input": {$: "Flow.CaptureJob"}, "output": {$: "Flow.ReviewWorkItem"}, "copy": false};
  } else if (_event_0.$ === "Flow.UnitDispatched") {
    return {$: "Flow.DataRoute", "from": {$: "Flow.ReviewQueueNode"}, "to": {$: "Flow.JevDispatchNode"}, "input": {$: "Flow.ReviewWorkItem"}, "output": {$: "Flow.DecisionRequest"}, "copy": false};
  } else if (_event_0.$ === "Flow.JevRequestSent") {
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

function $$$$047agent$045flow$045bend$047Flow$initial$() {
  return {$: "Flow.Flow", "packets": {$: "Nil"}, "next_id": 1, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "round_id": 0, "active": false, "continuations": 0, "waiting": false, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Flow$same_place$(_a_0, _b_0) {
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

function $$$$047agent$045flow$045bend$047Flow$at$(_place_0, _packet_0) {
  const _location_0 = _packet_0["at"];
  return $$$$047agent$045flow$045bend$047Flow$same_place$(_location_0, _place_0);
}

function $$$$047agent$045flow$045bend$047Flow$count$(_place_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return 0;
  } else {
    const _p_0 = _packets_0["head"];
    const _rest_0 = _packets_0["tail"];
    const _x_0 = ($Bool$pick$(($$$$047agent$045flow$045bend$047Flow$at$(_place_0, _p_0)), 1, 0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Flow$count$(_place_0, _rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Flow$ids$pick$(_id_0, _rest_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _id_0, "tail": _rest_0};
  } else {
    return _rest_0;
  }
}

function $$$$047agent$045flow$045bend$047Flow$ids$(_place_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    return $$$$047agent$045flow$045bend$047Flow$ids$pick$(_id_0, ($$$$047agent$045flow$045bend$047Flow$ids$(_place_0, _rest_0)), ($$$$047agent$045flow$045bend$047Flow$same_place$(_location_0, _place_0)));
  }
}

function $$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _xs_0) {
  if (_xs_0.$ === "Nil") {
    return false;
  } else {
    const _x_0 = _xs_0["head"];
    const _rest_0 = _xs_0["tail"];
    const _x_1 = ($Nat$is_eq$(_x_0, _id_0));
    const _x_2 = ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _rest_0));
    return (_x_1 || _x_2);
  }
}

function $$$$047agent$045flow$045bend$047Flow$unfinished$($0) {
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

function $$$$047agent$045flow$045bend$047Flow$find$id_match$(_id_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _id_0};
  } else {
    return _fallback_0;
  }
}

function $$$$047agent$045flow$045bend$047Flow$find$pick$(_id_0, _selected_0, _fallback_0, _same_place_0) {
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
      return $$$$047agent$045flow$045bend$047Flow$find$id_match$(_id_0, _fallback_0, ($Nat$is_eq$(_wanted_0, _id_0)));
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$find$(_place_0, _selected_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    return $$$$047agent$045flow$045bend$047Flow$find$pick$(_id_0, _selected_0, ($$$$047agent$045flow$045bend$047Flow$find$(_place_0, _selected_0, _rest_0)), ($$$$047agent$045flow$045bend$047Flow$same_place$(_location_0, _place_0)));
  }
}

function $$$$047agent$045flow$045bend$047Flow$move_one$pick$(_pid_0, _location_0, _tail_0, _target_0, _copy_0, _hit_0) {
  if (_copy_0) {
    if (_hit_0) {
      return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": ($List$append$(_tail_0, {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _target_0}, "tail": {$: "Nil"}}))};
    } else {
      return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": _tail_0};
    }
  } else {
    if (_hit_0) {
      return $List$append$(_tail_0, {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _target_0}, "tail": {$: "Nil"}});
    } else {
      return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": _tail_0};
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$move_one$(_id_0, _source_0, _target_0, _copy_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _pid_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _hit_0 = ($Bool$and$(($Nat$is_eq$(_pid_0, _id_0)), ($$$$047agent$045flow$045bend$047Flow$same_place$(_location_0, _source_0))));
    const _tail_0 = ($$$$047agent$045flow$045bend$047Flow$move_one$(_id_0, _source_0, _target_0, _copy_0, _rest_0));
    return $$$$047agent$045flow$045bend$047Flow$move_one$pick$(_pid_0, _location_0, _tail_0, _target_0, _copy_0, _hit_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$remove_one$pick$(_pid_0, _location_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": {$: "Flow.Packet", "id": _pid_0, "at": _location_0}, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$remove_one$(_id_0, _source_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _pid_0 = _t_0["id"];
    const _location_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _hit_0 = ($Bool$and$(($Nat$is_eq$(_pid_0, _id_0)), ($$$$047agent$045flow$045bend$047Flow$same_place$(_location_0, _source_0))));
    return $$$$047agent$045flow$045bend$047Flow$remove_one$pick$(_pid_0, _location_0, ($$$$047agent$045flow$045bend$047Flow$remove_one$(_id_0, _source_0, _rest_0)), _hit_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$fill_source$(_packets_0, _capacity_0, _occupied_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _t_1 = _t_0["at"];
    if (_t_1.$ === "Flow.EditQueue") {
      const _rest_0 = _packets_0["tail"];
      const _room_0 = ($$$$047agent$045flow$045bend$047Flow$has_room$(_occupied_0, _capacity_0));
      const _new_place_0 = ($Bool$pick$(_room_0, {$: "Flow.Preparation"}, {$: "Flow.EditQueue"}));
      const _x_0 = ($Bool$pick$(_room_0, 1, 0));
      const _new_occupied_0 = nat_chk(_occupied_0 + _x_0);
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _new_place_0}, "tail": ($$$$047agent$045flow$045bend$047Flow$fill_source$(_rest_0, _capacity_0, _new_occupied_0))};
    } else {
      const _rest_1 = _packets_0["tail"];
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _t_1}, "tail": ($$$$047agent$045flow$045bend$047Flow$fill_source$(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$fill_jev$(_packets_0, _capacity_0, _occupied_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _t_1 = _t_0["at"];
    if (_t_1.$ === "Flow.ReviewQueue") {
      const _rest_0 = _packets_0["tail"];
      const _room_0 = ($$$$047agent$045flow$045bend$047Flow$has_room$(_occupied_0, _capacity_0));
      const _new_place_0 = ($Bool$pick$(_room_0, {$: "Flow.Jev"}, {$: "Flow.ReviewQueue"}));
      const _x_0 = ($Bool$pick$(_room_0, 1, 0));
      const _new_occupied_0 = nat_chk(_occupied_0 + _x_0);
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _new_place_0}, "tail": ($$$$047agent$045flow$045bend$047Flow$fill_jev$(_rest_0, _capacity_0, _new_occupied_0))};
    } else {
      const _rest_1 = _packets_0["tail"];
      return {$: "Con", "head": {$: "Flow.Packet", "id": _id_0, "at": _t_1}, "tail": ($$$$047agent$045flow$045bend$047Flow$fill_jev$(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$settle$(_flow_0) {
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
    const _started_0 = ($$$$047agent$045flow$045bend$047Flow$fill_source$(_packets_0, _source_capacity_0, ($$$$047agent$045flow$045bend$047Flow$count$({$: "Flow.Preparation"}, _packets_0))));
    return {$: "Flow.Flow", "packets": ($$$$047agent$045flow$045bend$047Flow$fill_jev$(_started_0, _review_capacity_0, ($$$$047agent$045flow$045bend$047Flow$count$({$: "Flow.Jev"}, _started_0)))), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": true, "continuations": _continuations_1, "waiting": _waiting_1, "background_available": _background_available_1, "lease": _lease_1, "leased_id": _leased_id_1, "last_surface": _last_surface_1, "last_id": _last_id_1, "background_submitted": _background_submitted_1};
  }
}

function $$$$047agent$045flow$045bend$047Flow$replace_packets$(_flow_0, _new_packets_0) {
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

function $$$$047agent$045flow$045bend$047Flow$has_lease$(_lease_0) {
  if (_lease_0.$ === "None") {
    return false;
  } else {
    return true;
  }
}

function $$$$047agent$045flow$045bend$047Flow$work_pending$(_flow_0) {
  const _packets_0 = _flow_0["packets"];
  const _lease_0 = _flow_0["lease"];
  const _x_0 = ($$$$047agent$045flow$045bend$047Flow$unfinished$(_packets_0));
  const _x_1 = ($$$$047agent$045flow$045bend$047Flow$has_lease$(_lease_0));
  return (_x_0 || _x_1);
}

function $$$$047agent$045flow$045bend$047Flow$distinct$pick$(_id_0, _tail_0, _known_0) {
  if (_known_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _id_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$distinct$(_xs_0, _seen_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _xs_0["head"];
    const _rest_0 = _xs_0["tail"];
    return $$$$047agent$045flow$045bend$047Flow$distinct$pick$(_id_0, ($$$$047agent$045flow$045bend$047Flow$distinct$(_rest_0, {$: "Con", "head": _id_0, "tail": _seen_0})), ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _seen_0)));
  }
}

function $$$$047agent$045flow$045bend$047Flow$all_ids$(_packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _packets_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Flow$all_ids$(_rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047Flow$discarded$pick$(_id_0, _tail_0, _keep_0) {
  if (_keep_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _id_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$discarded$(_ids_all_0, _advice_0, _keep_advice_0) {
  if (_ids_all_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _ids_all_0["head"];
    const _rest_0 = _ids_all_0["tail"];
    return $$$$047agent$045flow$045bend$047Flow$discarded$pick$(_id_0, ($$$$047agent$045flow$045bend$047Flow$discarded$(_rest_0, _advice_0, _keep_advice_0)), ($Bool$and$(_keep_advice_0, ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _advice_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish$choose$(_original_0, _packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _continuations_0, _submitted_0, _advice_0, _can_continue_0) {
  if (_can_continue_0) {
    const _dropped_0 = ($$$$047agent$045flow$045bend$047Flow$discarded$(($$$$047agent$045flow$045bend$047Flow$distinct$(($$$$047agent$045flow$045bend$047Flow$all_ids$(_packets_0)), {$: "Nil"})), _advice_0, true));
    const _decision_0 = {$: "Flow.ContinueWithAdvice", "ids": _advice_0, "discarded": _dropped_0, "cancelled_source": ($$$$047agent$045flow$045bend$047Flow$ids$({$: "Flow.Preparation"}, _packets_0)), "cancelled_jev": ($$$$047agent$045flow$045bend$047Flow$ids$({$: "Flow.Jev"}, _packets_0))};
    return {$: "Flow.Accepted", "state": {$: "Flow.Flow", "packets": {$: "Nil"}, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": true, "continuations": nat_chk(_continuations_0 + 1), "waiting": false, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}}, "decision": _decision_0, "settled": _original_0};
  } else {
    const _decision_1 = {$: "Flow.AllowFinish", "discarded": ($$$$047agent$045flow$045bend$047Flow$distinct$(($$$$047agent$045flow$045bend$047Flow$all_ids$(_packets_0)), {$: "Nil"})), "cancelled_source": ($$$$047agent$045flow$045bend$047Flow$ids$({$: "Flow.Preparation"}, _packets_0)), "cancelled_jev": ($$$$047agent$045flow$045bend$047Flow$ids$({$: "Flow.Jev"}, _packets_0))};
    return {$: "Flow.Accepted", "state": {$: "Flow.Flow", "packets": {$: "Nil"}, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": false, "continuations": _continuations_0, "waiting": false, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}}, "decision": _decision_1, "settled": _original_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish$(_flow_0) {
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
  const _advice_0 = ($$$$047agent$045flow$045bend$047Flow$ids$({$: "Flow.AdviceStore"}, _packets_0));
  const _can_continue_0 = ($Bool$and$(($Bool$not$(($List$is_empty$(_advice_0)))), (_continuations_0 < 4)));
  return $$$$047agent$045flow$045bend$047Flow$finish$choose$({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": __0, "continuations": _continuations_0, "waiting": __1, "background_available": __2, "lease": __3, "leased_id": __4, "last_surface": __5, "last_id": __6, "background_submitted": _submitted_0}, _packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _continuations_0, _submitted_0, _advice_0, _can_continue_0);
}

function $$$$047agent$045flow$045bend$047Flow$ready_to_finish$(_flow_0) {
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
  return $Bool$and$(_waiting_0, ($Bool$not$(($$$$047agent$045flow$045bend$047Flow$work_pending$({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": _waiting_0, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12})))));
}

function $$$$047agent$045flow$045bend$047Flow$accept$after$(_flow_0, _ready_0) {
  if (_ready_0) {
    return $$$$047agent$045flow$045bend$047Flow$finish$(_flow_0);
  } else {
    return {$: "Flow.Accepted", "state": _flow_0, "decision": {$: "Flow.NoDecision"}, "settled": _flow_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$accept$(_flow_0) {
  const _settled_0 = ($$$$047agent$045flow$045bend$047Flow$settle$(_flow_0));
  return $$$$047agent$045flow$045bend$047Flow$accept$after$(_settled_0, ($$$$047agent$045flow$045bend$047Flow$ready_to_finish$(_settled_0)));
}

function $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, _reason_0) {
  return {$: "Flow.Rejected", "state": _flow_0, "reason": _reason_0};
}

function $$$$047agent$045flow$045bend$047Flow$edit$open$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0) {
  if (_active_0) {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": ($List$append$(_packets_0, {$: "Con", "head": {$: "Flow.Packet", "id": _next_id_0, "at": {$: "Flow.EditQueue"}}, "tail": {$: "Nil"}})), "next_id": nat_chk(_next_id_0 + 1), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": true, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": true, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": {$: "Con", "head": {$: "Flow.Packet", "id": _next_id_0, "at": {$: "Flow.EditQueue"}}, "tail": {$: "Nil"}}, "next_id": nat_chk(_next_id_0 + 1), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": nat_chk(_round_id_0 + 1), "active": true, "continuations": 0, "waiting": false, "background_available": true, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "None"}, "last_id": {$: "None"}, "background_submitted": {$: "Nil"}});
  }
}

function $$$$047agent$045flow$045bend$047Flow$edit$(_flow_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$edit$open$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0);
}

function $$$$047agent$045flow$045bend$047Flow$set_capacity$valid$(_flow_0, _capacity_0, _source_0) {
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
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": __0, "review_capacity": _capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  }
}

function $$$$047agent$045flow$045bend$047Flow$set_capacity$choose$(_flow_0, _capacity_0, _source_0, _valid_0) {
  if (!_valid_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InvalidCapacity"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$set_capacity$valid$(_flow_0, _capacity_0, _source_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$set_capacity$(_flow_0, _capacity_0, _source_0) {
  return $$$$047agent$045flow$045bend$047Flow$set_capacity$choose$(_flow_0, _capacity_0, _source_0, ($$$$047agent$045flow$045bend$047Flow$capacity_valid$(_capacity_0)));
}

function $$$$047agent$045flow$045bend$047Flow$stop$budget$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0, _under_budget_0) {
  if (_under_budget_0) {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": true, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$finish$({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": true, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0});
  }
}

function $$$$047agent$045flow$045bend$047Flow$stop$choose$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0) {
  if (_waiting_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$({$: "Flow.Flow", "packets": _packets_0, "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": true, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _background_submitted_0}, {$: "Flow.FinishDecisionAlreadyOpen"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$stop$budget$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0, (_continuations_0 < 4));
  }
}

function $$$$047agent$045flow$045bend$047Flow$stop$(_flow_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$stop$choose$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _background_available_0, _lease_0, _leased_id_0, _last_surface_0, _last_id_0, _background_submitted_0);
}

function $$$$047agent$045flow$045bend$047Flow$is_active$(_flow_0) {
  const _active_0 = _flow_0["active"];
  return _active_0;
}

function $$$$047agent$045flow$045bend$047Flow$apply_move$do$(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _id_0) {
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
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": ($$$$047agent$045flow$045bend$047Flow$remove_one$(_id_0, _source_0, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": ($$$$047agent$045flow$045bend$047Flow$move_one$(_id_0, _source_0, _target_0, _copy_0, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _background_available_0, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  }
}

function $$$$047agent$045flow$045bend$047Flow$apply_move$found$(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _found_0) {
  if (_found_0.$ === "None") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.MissingPacket"});
  } else {
    const _id_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047Flow$apply_move$do$(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _id_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$apply_move$(_flow_0, _source_0, _target_0, _copy_0, _terminal_0, _selected_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$apply_move$found$({$: "Flow.Flow", "packets": _packets_0, "next_id": __0, "source_capacity": __1, "review_capacity": __2, "round_id": __3, "active": __4, "continuations": __5, "waiting": __6, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12}, _source_0, _target_0, _copy_0, _terminal_0, ($$$$047agent$045flow$045bend$047Flow$find$(_source_0, _selected_0, _packets_0)));
}

function $$$$047agent$045flow$045bend$047Flow$deadline$settled$(_flow_0, _pending_0) {
  if (_pending_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.WorkStillPending"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$finish$(_flow_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$deadline$budget$(_flow_0, _under_budget_0) {
  if (_under_budget_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.UnexpectedControl"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$finish$(_flow_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$deadline$kind$(_flow_0, _kind_0, _continuations_0) {
  if (_kind_0.$ === "Flow.FinishDecisionAllWorkSettled") {
    return $$$$047agent$045flow$045bend$047Flow$deadline$settled$(_flow_0, ($$$$047agent$045flow$045bend$047Flow$work_pending$(_flow_0)));
  } else if (_kind_0.$ === "Flow.FinishDecisionBudgetExhausted") {
    return $$$$047agent$045flow$045bend$047Flow$deadline$budget$(_flow_0, (_continuations_0 < 4));
  } else {
    return $$$$047agent$045flow$045bend$047Flow$finish$(_flow_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$deadline$wait$(_flow_0, _kind_0, _continuations_0, _waiting_0) {
  if (!_waiting_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.StopNotWaiting"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$deadline$kind$(_flow_0, _kind_0, _continuations_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$deadline$(_flow_0, _kind_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$deadline$wait$({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": __6, "lease": __7, "leased_id": __8, "last_surface": __9, "last_id": __10, "background_submitted": __11}, _kind_0, _continuations_0, _waiting_0);
}

function $$$$047agent$045flow$045bend$047Flow$lease_apply$surface$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _last_surface_0, _last_id_0, _submitted_0, _surface_0, _id_0) {
  if (_surface_0.$ === "Flow.Background") {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": ($$$$047agent$045flow$045bend$047Flow$move_one$(_id_0, {$: "Flow.AdviceStore"}, {$: "Flow.AdvicePolicy"}, true, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": _available_0, "lease": {$: "Some", "value": {$: "Flow.Background"}}, "leased_id": {$: "Some", "value": _id_0}, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": ($$$$047agent$045flow$045bend$047Flow$move_one$(_id_0, {$: "Flow.AdviceStore"}, {$: "Flow.AdvicePolicy"}, true, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": nat_chk(_continuations_0 + 1), "waiting": _waiting_0, "background_available": _available_0, "lease": {$: "Some", "value": {$: "Flow.Stop"}}, "leased_id": {$: "Some", "value": _id_0}, "last_surface": _last_surface_0, "last_id": _last_id_0, "background_submitted": _submitted_0});
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_apply$(_flow_0, _surface_0, _id_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$lease_apply$surface$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _last_surface_0, _last_id_0, _submitted_0, _surface_0, _id_0);
}

function $$$$047agent$045flow$045bend$047Flow$lease_check$submitted$(_flow_0, _surface_0, _id_0, _submitted_0) {
  if (_surface_0.$ === "Flow.Background") {
    if (_submitted_0) {
      return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.BackgroundAlreadySubmitted"});
    } else {
      return $$$$047agent$045flow$045bend$047Flow$lease_apply$(_flow_0, {$: "Flow.Background"}, _id_0);
    }
  } else {
    return $$$$047agent$045flow$045bend$047Flow$lease_apply$(_flow_0, {$: "Flow.Stop"}, _id_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_check$(_flow_0, _surface_0, _id_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$lease_check$submitted$({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": __8, "lease": __9, "leased_id": __10, "last_surface": __11, "last_id": __12, "background_submitted": _submitted_0}, _surface_0, _id_0, ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _submitted_0)));
}

function $$$$047agent$045flow$045bend$047Flow$lease_found$(_flow_0, _surface_0, _found_0) {
  if (_found_0.$ === "None") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.MissingPacket"});
  } else {
    const _id_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047Flow$lease_check$(_flow_0, _surface_0, _id_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_find$(_flow_0, _selected_0, _surface_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$lease_found$({$: "Flow.Flow", "packets": _packets_0, "next_id": __0, "source_capacity": __1, "review_capacity": __2, "round_id": __3, "active": __4, "continuations": __5, "waiting": __6, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12}, _surface_0, ($$$$047agent$045flow$045bend$047Flow$find$({$: "Flow.AdviceStore"}, _selected_0, _packets_0)));
}

function $$$$047agent$045flow$045bend$047Flow$lease_background$guard$(_flow_0, _selected_0, _available_0, _busy_0) {
  if (!_available_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.BackgroundNotRequested"});
  } else {
    if (_busy_0) {
      return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.LeaseBusy"});
    } else {
      return $$$$047agent$045flow$045bend$047Flow$lease_find$(_flow_0, _selected_0, {$: "Flow.Background"});
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_background$(_flow_0, _selected_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$lease_background$guard$({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": _available_0, "lease": _lease_0, "leased_id": __8, "last_surface": __9, "last_id": __10, "background_submitted": __11}, _selected_0, _available_0, ($$$$047agent$045flow$045bend$047Flow$has_lease$(_lease_0)));
}

function $$$$047agent$045flow$045bend$047Flow$lease_stop$eligible$(_flow_0, _id_0, _reoffer_0, _submitted_0) {
  if (_reoffer_0) {
    if (!_submitted_0) {
      return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.ReofferNeedsBackground"});
    } else {
      return $$$$047agent$045flow$045bend$047Flow$lease_apply$(_flow_0, {$: "Flow.Stop"}, _id_0);
    }
  } else {
    if (_submitted_0) {
      return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.StopNeedsFreshAdvice"});
    } else {
      return $$$$047agent$045flow$045bend$047Flow$lease_apply$(_flow_0, {$: "Flow.Stop"}, _id_0);
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_stop$check$(_flow_0, _reoffer_0, _id_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$lease_stop$eligible$({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": __8, "lease": __9, "leased_id": __10, "last_surface": __11, "last_id": __12, "background_submitted": _submitted_0}, _id_0, _reoffer_0, ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _submitted_0)));
}

function $$$$047agent$045flow$045bend$047Flow$lease_stop$found$(_flow_0, _reoffer_0, _found_0) {
  if (_found_0.$ === "None") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.MissingPacket"});
  } else {
    const _id_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047Flow$lease_stop$check$(_flow_0, _reoffer_0, _id_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_stop$find$(_flow_0, _selected_0, _reoffer_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$lease_stop$found$({$: "Flow.Flow", "packets": _packets_0, "next_id": __0, "source_capacity": __1, "review_capacity": __2, "round_id": __3, "active": __4, "continuations": __5, "waiting": __6, "background_available": __7, "lease": __8, "leased_id": __9, "last_surface": __10, "last_id": __11, "background_submitted": __12}, _reoffer_0, ($$$$047agent$045flow$045bend$047Flow$find$({$: "Flow.AdviceStore"}, _selected_0, _packets_0)));
}

function $$$$047agent$045flow$045bend$047Flow$lease_stop$budget$(_flow_0, _selected_0, _reoffer_0, _under_budget_0) {
  if (!_under_budget_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.ContinuationBudgetExhausted"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$lease_stop$find$(_flow_0, _selected_0, _reoffer_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_stop$guard$(_flow_0, _selected_0, _reoffer_0, _continuations_0, _waiting_0, _busy_0) {
  if (!_waiting_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.StopNotRequested"});
  } else {
    if (_busy_0) {
      return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.LeaseBusy"});
    } else {
      return $$$$047agent$045flow$045bend$047Flow$lease_stop$budget$(_flow_0, _selected_0, _reoffer_0, (_continuations_0 < 4));
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$lease_stop$(_flow_0, _selected_0, _reoffer_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$lease_stop$guard$({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": __6, "lease": _lease_0, "leased_id": __7, "last_surface": __8, "last_id": __9, "background_submitted": __10}, _selected_0, _reoffer_0, _continuations_0, _waiting_0, ($$$$047agent$045flow$045bend$047Flow$has_lease$(_lease_0)));
}

function $$$$047agent$045flow$045bend$047Flow$submit$surface$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _submitted_0, _surface_0, _id_0) {
  if (_surface_0.$ === "Flow.Background") {
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": ($$$$047agent$045flow$045bend$047Flow$remove_one$(_id_0, {$: "Flow.AdvicePolicy"}, _packets_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": _waiting_0, "background_available": false, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "Some", "value": {$: "Flow.Background"}}, "last_id": {$: "Some", "value": _id_0}, "background_submitted": ($List$append$(_submitted_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}}))});
  } else {
    const _next_0 = ($$$$047agent$045flow$045bend$047Flow$remove_one$(_id_0, {$: "Flow.AdvicePolicy"}, _packets_0));
    return $$$$047agent$045flow$045bend$047Flow$accept$({$: "Flow.Flow", "packets": ($$$$047agent$045flow$045bend$047Flow$remove_one$(_id_0, {$: "Flow.AdviceStore"}, _next_0)), "next_id": _next_id_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "round_id": _round_id_0, "active": _active_0, "continuations": _continuations_0, "waiting": false, "background_available": _available_0, "lease": {$: "None"}, "leased_id": {$: "None"}, "last_surface": {$: "Some", "value": {$: "Flow.Stop"}}, "last_id": {$: "Some", "value": _id_0}, "background_submitted": _submitted_0});
  }
}

function $$$$047agent$045flow$045bend$047Flow$submit$run$(_flow_0, _surface_0, _id_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$submit$surface$(_packets_0, _next_id_0, _source_capacity_0, _review_capacity_0, _round_id_0, _active_0, _continuations_0, _waiting_0, _available_0, _submitted_0, _surface_0, _id_0);
}

function $$$$047agent$045flow$045bend$047Flow$submit$lease$(_flow_0, _lease_0, _leased_id_0) {
  if (_lease_0.$ === "None") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.NoLease"});
  } else {
    const _surface_0 = _lease_0["value"];
    if (_leased_id_0.$ === "Some") {
      const _id_0 = _leased_id_0["value"];
      return $$$$047agent$045flow$045bend$047Flow$submit$run$(_flow_0, _surface_0, _id_0);
    } else {
      return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.NoLease"});
    }
  }
}

function $$$$047agent$045flow$045bend$047Flow$submit$(_flow_0) {
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
  return $$$$047agent$045flow$045bend$047Flow$submit$lease$({$: "Flow.Flow", "packets": __0, "next_id": __1, "source_capacity": __2, "review_capacity": __3, "round_id": __4, "active": __5, "continuations": __6, "waiting": __7, "background_available": __8, "lease": _lease_0, "leased_id": _leased_id_0, "last_surface": __9, "last_id": __10, "background_submitted": __11}, _lease_0, _leased_id_0);
}

function $$$$047agent$045flow$045bend$047Flow$step$live$(_flow_0, _event_0, _item_id_0) {
  if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return $$$$047agent$045flow$045bend$047Flow$apply_move$(_flow_0, {$: "Flow.Preparation"}, {$: "Flow.ReviewQueue"}, false, false, _item_id_0);
  } else if (_event_0.$ === "Flow.JevFindingReceived") {
    return $$$$047agent$045flow$045bend$047Flow$apply_move$(_flow_0, {$: "Flow.Jev"}, {$: "Flow.AdviceStore"}, false, false, _item_id_0);
  } else if (_event_0.$ === "Flow.JevClearReceived") {
    return $$$$047agent$045flow$045bend$047Flow$apply_move$(_flow_0, {$: "Flow.Jev"}, {$: "Flow.Jev"}, false, true, _item_id_0);
  } else if (_event_0.$ === "Flow.JevUnavailable") {
    return $$$$047agent$045flow$045bend$047Flow$apply_move$(_flow_0, {$: "Flow.Jev"}, {$: "Flow.Jev"}, false, true, _item_id_0);
  } else if (_event_0.$ === "Flow.StopHookFired") {
    return $$$$047agent$045flow$045bend$047Flow$stop$(_flow_0);
  } else if (_event_0.$ === "Flow.FinishDecisionDeadlineReached") {
    return $$$$047agent$045flow$045bend$047Flow$deadline$(_flow_0, {$: "Flow.FinishDecisionDeadlineReached"});
  } else if (_event_0.$ === "Flow.FinishDecisionAllWorkSettled") {
    return $$$$047agent$045flow$045bend$047Flow$deadline$(_flow_0, {$: "Flow.FinishDecisionAllWorkSettled"});
  } else if (_event_0.$ === "Flow.FinishDecisionBudgetExhausted") {
    return $$$$047agent$045flow$045bend$047Flow$deadline$(_flow_0, {$: "Flow.FinishDecisionBudgetExhausted"});
  } else if (_event_0.$ === "Flow.AdviceLeasedByBackground") {
    return $$$$047agent$045flow$045bend$047Flow$lease_background$(_flow_0, _item_id_0);
  } else if (_event_0.$ === "Flow.HostOutputSubmitted") {
    return $$$$047agent$045flow$045bend$047Flow$submit$(_flow_0);
  } else {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.UnexpectedControl"});
  }
}

function $$$$047agent$045flow$045bend$047Flow$step$active$(_flow_0, _event_0, _item_id_0, _active_0) {
  if (!_active_0) {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.VirtualRoundClosed"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$step$live$(_flow_0, _event_0, _item_id_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$step$(_flow_0, _event_0, _item_id_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return $$$$047agent$045flow$045bend$047Flow$edit$(_flow_0);
  } else if (_event_0.$ === "Flow.SourceCapacitySet") {
    const _capacity_0 = _event_0["capacity"];
    return $$$$047agent$045flow$045bend$047Flow$set_capacity$(_flow_0, _capacity_0, true);
  } else if (_event_0.$ === "Flow.ReviewCapacitySet") {
    const _capacity_1 = _event_0["capacity"];
    return $$$$047agent$045flow$045bend$047Flow$set_capacity$(_flow_0, _capacity_1, false);
  } else if (_event_0.$ === "Flow.IngressStarted") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.UnitDispatched") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.JevRequestSent") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.BackgroundWaitStarted") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.AdviceLeasedByStop") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.AdviceReofferedAtStop") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.StopAllowed") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else if (_event_0.$ === "Flow.FinishResponseRequested") {
    return $$$$047agent$045flow$045bend$047Flow$reject$(_flow_0, {$: "Flow.InternalEvent"});
  } else {
    return $$$$047agent$045flow$045bend$047Flow$step$active$(_flow_0, _event_0, _item_id_0, ($$$$047agent$045flow$045bend$047Flow$is_active$(_flow_0)));
  }
}

function $$$$047agent$045flow$045bend$047Flow$main$() {
  return $$$$047agent$045flow$045bend$047Flow$initial$();
}

function $$$$047agent$045flow$045bend$047Flow$some$(_value_0) {
  if (_value_0.$ === "None") {
    return false;
  } else {
    return true;
  }
}

function $$$$047agent$045flow$045bend$047Flow$event_item$pick$(_event_0, _selected_0, _packets_0, _next_id_0, _leased_id_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return {$: "Some", "value": _next_id_0};
  } else if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return $$$$047agent$045flow$045bend$047Flow$find$({$: "Flow.Preparation"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.JevFindingReceived") {
    return $$$$047agent$045flow$045bend$047Flow$find$({$: "Flow.Jev"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.JevClearReceived") {
    return $$$$047agent$045flow$045bend$047Flow$find$({$: "Flow.Jev"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.JevUnavailable") {
    return $$$$047agent$045flow$045bend$047Flow$find$({$: "Flow.Jev"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.AdviceLeasedByBackground") {
    return $$$$047agent$045flow$045bend$047Flow$find$({$: "Flow.AdviceStore"}, _selected_0, _packets_0);
  } else if (_event_0.$ === "Flow.HostOutputSubmitted") {
    return _leased_id_0;
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047Flow$event_item$(_event_0, _selected_0, _before_0) {
  const _packets_0 = _before_0["packets"];
  const _next_id_0 = _before_0["next_id"];
  const _leased_id_0 = _before_0["leased_id"];
  return $$$$047agent$045flow$045bend$047Flow$event_item$pick$(_event_0, _selected_0, _packets_0, _next_id_0, _leased_id_0);
}

function $$$$047agent$045flow$045bend$047Flow$own_change$(_event_0, _before_0, _item_0) {
  if (_event_0.$ === "Flow.SourceCapacitySet") {
    const _capacity_0 = _event_0["capacity"];
    const _previous_0 = _before_0["source_capacity"];
    return {$: "Flow.CapacityChanged", "source": true, "before": _previous_0, "after": _capacity_0};
  } else if (_event_0.$ === "Flow.ReviewCapacitySet") {
    const _capacity_1 = _event_0["capacity"];
    const _previous_1 = _before_0["review_capacity"];
    return {$: "Flow.CapacityChanged", "source": false, "before": _previous_1, "after": _capacity_1};
  } else {
    return {$: "Flow.Transition", "event": _event_0, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$(_event_0)), "item": _item_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$opened$(_before_active_0, _mid_active_0, _round_id_0) {
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

function $$$$047agent$045flow$045bend$047Flow$emission$(_event_0, _item_0) {
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

function $$$$047agent$045flow$045bend$047Flow$is_edit$(_event_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Flow$is_prepared$(_event_0) {
  if (_event_0.$ === "Flow.ReviewUnitPrepared") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Flow$schedule_source$pick$(_id_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.IngressStarted"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.IngressStarted"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0};
  } else {
    return _tail_0;
  }
}

function $$$$047agent$045flow$045bend$047Flow$schedule_source$(_event_0, _next_id_0, _old_edit_ids_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _place_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _old_edit_ids_0));
    const _x_1 = ($Bool$and$(($$$$047agent$045flow$045bend$047Flow$is_edit$(_event_0)), ($Nat$is_eq$(_id_0, _next_id_0))));
    const _hit_0 = ($Bool$and$(($$$$047agent$045flow$045bend$047Flow$same_place$(_place_0, {$: "Flow.Preparation"})), (_x_0 || _x_1)));
    return $$$$047agent$045flow$045bend$047Flow$schedule_source$pick$(_id_0, ($$$$047agent$045flow$045bend$047Flow$schedule_source$(_event_0, _next_id_0, _old_edit_ids_0, _rest_0)), _hit_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$selected_is$(_id_0, _selected_0) {
  if (_selected_0.$ === "None") {
    return false;
  } else {
    const _wanted_0 = _selected_0["value"];
    return $Nat$is_eq$(_id_0, _wanted_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$schedule_review$pick$(_id_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.UnitDispatched"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.UnitDispatched"})), "item": {$: "Some", "value": _id_0}}, "tail": {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.JevRequestSent"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.JevRequestSent"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0}};
  } else {
    return _tail_0;
  }
}

function $$$$047agent$045flow$045bend$047Flow$schedule_review$(_event_0, _own_item_0, _old_review_ids_0, _packets_0) {
  if (_packets_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _packets_0["head"];
    const _id_0 = _t_0["id"];
    const _place_0 = _t_0["at"];
    const _rest_0 = _packets_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _old_review_ids_0));
    const _x_1 = ($Bool$and$(($$$$047agent$045flow$045bend$047Flow$is_prepared$(_event_0)), ($$$$047agent$045flow$045bend$047Flow$selected_is$(_id_0, _own_item_0))));
    const _hit_0 = ($Bool$and$(($$$$047agent$045flow$045bend$047Flow$same_place$(_place_0, {$: "Flow.Jev"})), (_x_0 || _x_1)));
    return $$$$047agent$045flow$045bend$047Flow$schedule_review$pick$(_id_0, ($$$$047agent$045flow$045bend$047Flow$schedule_review$(_event_0, _own_item_0, _old_review_ids_0, _rest_0)), _hit_0);
  }
}

function $$$$047agent$045flow$045bend$047Flow$first_id$(_ids_0) {
  if (_ids_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _id_0 = _ids_0["head"];
    return {$: "Some", "value": _id_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish_trigger$stop$(_under_budget_0) {
  if (_under_budget_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishDecisionAllWorkSettled"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.FinishDecisionAllWorkSettled"})), "item": {$: "None"}}, "tail": {$: "Nil"}};
  } else {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishDecisionBudgetExhausted"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.FinishDecisionBudgetExhausted"})), "item": {$: "None"}}, "tail": {$: "Nil"}};
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish_trigger$(_event_0, _continuations_0) {
  if (_event_0.$ === "Flow.FinishDecisionDeadlineReached") {
    return {$: "Nil"};
  } else if (_event_0.$ === "Flow.FinishDecisionAllWorkSettled") {
    return {$: "Nil"};
  } else if (_event_0.$ === "Flow.FinishDecisionBudgetExhausted") {
    return {$: "Nil"};
  } else if (_event_0.$ === "Flow.StopHookFired") {
    return $$$$047agent$045flow$045bend$047Flow$finish_trigger$stop$((_continuations_0 < 4));
  } else {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishDecisionAllWorkSettled"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.FinishDecisionAllWorkSettled"})), "item": {$: "None"}}, "tail": {$: "Nil"}};
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish_leases$pick$(_id_0, _tail_0, _reoffer_0) {
  if (_reoffer_0) {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.AdviceReofferedAtStop"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.AdviceReofferedAtStop"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0};
  } else {
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.AdviceLeasedByStop"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.AdviceLeasedByStop"})), "item": {$: "Some", "value": _id_0}}, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish_leases$(_ids_0, _submitted_0) {
  if (_ids_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _ids_0["head"];
    const _rest_0 = _ids_0["tail"];
    return $$$$047agent$045flow$045bend$047Flow$finish_leases$pick$(_id_0, ($$$$047agent$045flow$045bend$047Flow$finish_leases$(_rest_0, _submitted_0)), ($$$$047agent$045flow$045bend$047Flow$contains$(_id_0, _submitted_0)));
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish_tail$pick$(_decision_0, _packets_0, _round_id_0, _submitted_0) {
  if (_decision_0.$ === "Flow.NoDecision") {
    return {$: "Nil"};
  } else if (_decision_0.$ === "Flow.ContinueWithAdvice") {
    const _advice_ids_0 = _decision_0["ids"];
    const __0 = _decision_0["discarded"];
    const __1 = _decision_0["cancelled_source"];
    const __2 = _decision_0["cancelled_jev"];
    return $List$append$(($$$$047agent$045flow$045bend$047Flow$finish_leases$(_advice_ids_0, _submitted_0)), {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishResponseRequested"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.FinishResponseRequested"})), "item": ($$$$047agent$045flow$045bend$047Flow$first_id$(_advice_ids_0))}, "tail": {$: "Con", "head": {$: "Flow.FinishDecision", "decision": {$: "Flow.ContinueWithAdvice", "ids": _advice_ids_0, "discarded": __0, "cancelled_source": __1, "cancelled_jev": __2}}, "tail": {$: "Nil"}}});
  } else {
    const __3 = _decision_0["discarded"];
    const __4 = _decision_0["cancelled_source"];
    const __5 = _decision_0["cancelled_jev"];
    return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.StopAllowed"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.StopAllowed"})), "item": {$: "None"}}, "tail": {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.FinishResponseRequested"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.FinishResponseRequested"})), "item": {$: "None"}}, "tail": {$: "Con", "head": {$: "Flow.FinishDecision", "decision": {$: "Flow.AllowFinish", "discarded": __3, "cancelled_source": __4, "cancelled_jev": __5}}, "tail": {$: "Con", "head": {$: "Flow.RoundClosed", "id": _round_id_0, "discarded": ($List$length$(($$$$047agent$045flow$045bend$047Flow$distinct$(($$$$047agent$045flow$045bend$047Flow$all_ids$(_packets_0)), {$: "Nil"}))))}, "tail": {$: "Nil"}}}}};
  }
}

function $$$$047agent$045flow$045bend$047Flow$finish_tail$(_decision_0, _mid_0) {
  const _packets_0 = _mid_0["packets"];
  const _round_id_0 = _mid_0["round_id"];
  const _submitted_0 = _mid_0["background_submitted"];
  return $$$$047agent$045flow$045bend$047Flow$finish_tail$pick$(_decision_0, _packets_0, _round_id_0, _submitted_0);
}

function $$$$047agent$045flow$045bend$047Flow$finish_changes$(_event_0, _continuations_0, _decision_0, _mid_0) {
  if (_decision_0.$ === "Flow.NoDecision") {
    return {$: "Nil"};
  } else {
    return $List$append$(($$$$047agent$045flow$045bend$047Flow$finish_trigger$(_event_0, _continuations_0)), ($$$$047agent$045flow$045bend$047Flow$finish_tail$(_decision_0, _mid_0)));
  }
}

function $$$$047agent$045flow$045bend$047Flow$background_start$(_event_0, _available_0, _item_0) {
  if (_event_0.$ === "Flow.EditObserved") {
    if (!_available_0) {
      if (_item_0.$ === "Some") {
        const _id_0 = _item_0["value"];
        return {$: "Con", "head": {$: "Flow.Transition", "event": {$: "Flow.BackgroundWaitStarted"}, "route": ($$$$047agent$045flow$045bend$047Flow$route_of$({$: "Flow.BackgroundWaitStarted"})), "item": {$: "Some", "value": _id_0}}, "tail": {$: "Nil"}};
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

function $$$$047agent$045flow$045bend$047Flow$changes$accepted$(_before_0, _event_0, _selected_0, _decision_0, _mid_0) {
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
  const _own_item_0 = ($$$$047agent$045flow$045bend$047Flow$event_item$(_event_0, _selected_0, {$: "Flow.Flow", "packets": _old_packets_0, "next_id": _next_id_0, "source_capacity": __0, "review_capacity": __1, "round_id": __2, "active": _old_active_0, "continuations": _continuations_0, "waiting": __3, "background_available": _old_background_0, "lease": __4, "leased_id": __5, "last_surface": __6, "last_id": __7, "background_submitted": __8}));
  const _own_0 = ($$$$047agent$045flow$045bend$047Flow$own_change$(_event_0, {$: "Flow.Flow", "packets": _old_packets_0, "next_id": _next_id_0, "source_capacity": __0, "review_capacity": __1, "round_id": __2, "active": _old_active_0, "continuations": _continuations_0, "waiting": __3, "background_available": _old_background_0, "lease": __4, "leased_id": __5, "last_surface": __6, "last_id": __7, "background_submitted": __8}, _own_item_0));
  const _opening_0 = ($$$$047agent$045flow$045bend$047Flow$opened$(_old_active_0, _mid_active_0, _round_id_0));
  const _emitted_0 = ($$$$047agent$045flow$045bend$047Flow$emission$(_event_0, _own_item_0));
  const _started_source_0 = ($$$$047agent$045flow$045bend$047Flow$schedule_source$(_event_0, _next_id_0, ($$$$047agent$045flow$045bend$047Flow$ids$({$: "Flow.EditQueue"}, _old_packets_0)), _mid_packets_0));
  const _started_review_0 = ($$$$047agent$045flow$045bend$047Flow$schedule_review$(_event_0, _own_item_0, ($$$$047agent$045flow$045bend$047Flow$ids$({$: "Flow.ReviewQueue"}, _old_packets_0)), _mid_packets_0));
  const _finished_0 = ($$$$047agent$045flow$045bend$047Flow$finish_changes$(_event_0, _continuations_0, _decision_0, {$: "Flow.Flow", "packets": _mid_packets_0, "next_id": __9, "source_capacity": __10, "review_capacity": __11, "round_id": _round_id_0, "active": _mid_active_0, "continuations": __12, "waiting": __13, "background_available": __14, "lease": __15, "leased_id": __16, "last_surface": __17, "last_id": __18, "background_submitted": __19}));
  const _background_0 = ($$$$047agent$045flow$045bend$047Flow$background_start$(_event_0, _old_background_0, _own_item_0));
  return {$: "Con", "head": _own_0, "tail": ($List$append$(_opening_0, ($List$append$(_emitted_0, ($List$append$(_started_source_0, ($List$append$(_started_review_0, ($List$append$(_finished_0, _background_0))))))))))};
}

function $$$$047agent$045flow$045bend$047Flow$changes$(_before_0, _event_0, _selected_0, _result_0) {
  if (_result_0.$ === "Flow.Rejected") {
    return {$: "Nil"};
  } else {
    const _decision_0 = _result_0["decision"];
    const _mid_0 = _result_0["settled"];
    return $$$$047agent$045flow$045bend$047Flow$changes$accepted$(_before_0, _event_0, _selected_0, _decision_0, _mid_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$prepared_offer$(_ready_0, _within_frame_0) {
  return $Bool$pick$(($Bool$not$(_ready_0)), {$: "Work.SkipPrepared"}, ($Bool$pick$(_within_frame_0, {$: "Work.AdmitPrepared"}, {$: "Work.RejectPreparedCapacity"})));
}

function $$$$047agent$045flow$045bend$047Work$empty_prepared$(_ready_count_0, _has_non_skipped_0, _authority_bound_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_ready_count_0, 0)), ($Bool$and$(_has_non_skipped_0, _authority_bound_0)))), {$: "Work.FailEmptyLost"}, {$: "Work.NoEmptyFailure"});
}

function $$$$047agent$045flow$045bend$047Work$evaluated_disposition$(_has_findings_0, _current_work_0) {
  return $Bool$pick$(_has_findings_0, ($Bool$pick$(_current_work_0, {$: "Work.RetainFinding"}, {$: "Work.RetireStaleFinding"})), ($Bool$pick$(_current_work_0, {$: "Work.SettleClear"}, {$: "Work.SettleStaleClear"})));
}

function $$$$047agent$045flow$045bend$047Work$failure_disposition$(_backend_or_timeout_0, _credential_0, _missing_0) {
  return $Bool$pick$(_backend_or_timeout_0, {$: "Work.BackendUnavailable"}, ($Bool$pick$(_credential_0, {$: "Work.CredentialUnavailable"}, ($Bool$pick$(_missing_0, {$: "Work.LostUnavailable"}, {$: "Work.NoFailure"})))));
}

function $$$$047agent$045flow$045bend$047Work$initial$() {
  return {$: "Work.Work", "next_observation": 1, "next_unit": 1, "source_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "review_capacity": {$: "Flow.Capacity", "low": 3, "high": 0}, "observations": {$: "Nil"}, "units": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Work$is_source_reading$(_stage_0) {
  if (_stage_0.$ === "Work.SourceQueued") {
    return false;
  } else {
    return true;
  }
}

function $$$$047agent$045flow$045bend$047Work$is_at_jev$(_stage_0) {
  if (_stage_0.$ === "Work.AtJev") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Work$is_unit_unfinished$(_stage_0) {
  if (_stage_0.$ === "Work.ReviewQueued") {
    return true;
  } else if (_stage_0.$ === "Work.AtJev") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Work$reading_count$(_observations_0) {
  if (_observations_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _observations_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    const _x_0 = ($Bool$pick$(($$$$047agent$045flow$045bend$047Work$is_source_reading$(_stage_0)), 1, 0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Work$reading_count$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Work$at_jev_count$(_units_0) {
  if (_units_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _units_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _units_0["tail"];
    const _x_0 = ($Bool$pick$(($$$$047agent$045flow$045bend$047Work$is_at_jev$(_stage_0)), 1, 0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Work$at_jev_count$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Work$unfinished_observations$(_observations_0) {
  return $List$length$(_observations_0);
}

function $$$$047agent$045flow$045bend$047Work$unfinished_units$(_units_0) {
  if (_units_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _units_0["head"];
    const _stage_0 = _t_0["stage"];
    const _rest_0 = _units_0["tail"];
    const _x_0 = ($Bool$pick$(($$$$047agent$045flow$045bend$047Work$is_unit_unfinished$(_stage_0)), 1, 0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Work$unfinished_units$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Work$unfinished$(_work_0) {
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _x_0 = ($$$$047agent$045flow$045bend$047Work$unfinished_observations$(_observations_0));
  const _x_1 = ($$$$047agent$045flow$045bend$047Work$unfinished_units$(_units_0));
  return nat_chk(_x_0 + _x_1);
}

function $$$$047agent$045flow$045bend$047Work$finish_wait$(_unfinished_0, _deadline_reached_0, _continuation_budget_0) {
  return $Bool$and$(_continuation_budget_0, ($Bool$and$(($Bool$not$(_deadline_reached_0)), ($Nat$is_gt$(_unfinished_0, 0)))));
}

function $$$$047agent$045flow$045bend$047Work$pending_findings_in$($0) {
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
          const _x_0 = ($$$$047agent$045flow$045bend$047Work$pending_findings_in$(_rest_0));
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

function $$$$047agent$045flow$045bend$047Work$pending_findings$(_work_0) {
  const _units_0 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$pending_findings_in$(_units_0);
}

function $$$$047agent$045flow$045bend$047Work$fill_source$(_observations_0, _capacity_0, _occupied_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _id_0 = _t_0["id"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      const _rest_0 = _observations_0["tail"];
      const _room_0 = ($$$$047agent$045flow$045bend$047Flow$has_room$(_occupied_0, _capacity_0));
      const _next_stage_0 = ($Bool$pick$(_room_0, {$: "Work.SourceReading"}, {$: "Work.SourceQueued"}));
      const _x_0 = ($Bool$pick$(_room_0, 1, 0));
      return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": _next_stage_0}, "tail": ($$$$047agent$045flow$045bend$047Work$fill_source$(_rest_0, _capacity_0, nat_chk(_occupied_0 + _x_0)))};
    } else {
      const _rest_1 = _observations_0["tail"];
      return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": {$: "Work.SourceReading"}}, "tail": ($$$$047agent$045flow$045bend$047Work$fill_source$(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$fill_review$(_units_0, _capacity_0, _occupied_0) {
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
      const _room_0 = ($$$$047agent$045flow$045bend$047Flow$has_room$(_occupied_0, _capacity_0));
      const _next_stage_0 = ($Bool$pick$(_room_0, {$: "Work.AtJev"}, {$: "Work.ReviewQueued"}));
      const _x_0 = ($Bool$pick$(_room_0, 1, 0));
      return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": _next_stage_0, "findings": _findings_0, "bytes": _bytes_0}, "tail": ($$$$047agent$045flow$045bend$047Work$fill_review$(_rest_0, _capacity_0, nat_chk(_occupied_0 + _x_0)))};
    } else {
      const _findings_1 = _t_0["findings"];
      const _bytes_1 = _t_0["bytes"];
      const _rest_1 = _units_0["tail"];
      return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": _t_1, "findings": _findings_1, "bytes": _bytes_1}, "tail": ($$$$047agent$045flow$045bend$047Work$fill_review$(_rest_1, _capacity_0, _occupied_0))};
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$settle$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($$$$047agent$045flow$045bend$047Work$fill_source$(_observations_0, _source_capacity_0, ($$$$047agent$045flow$045bend$047Work$reading_count$(_observations_0)))), "units": ($$$$047agent$045flow$045bend$047Work$fill_review$(_units_0, _review_capacity_0, ($$$$047agent$045flow$045bend$047Work$at_jev_count$(_units_0))))};
}

function $$$$047agent$045flow$045bend$047Work$admit$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": ($$$$047agent$045flow$045bend$047Work$settle$({$: "Work.Work", "next_observation": nat_chk(_next_observation_0 + 1), "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($List$append$(_observations_0, {$: "Con", "head": {$: "Work.Observation", "id": _next_observation_0, "stage": {$: "Work.SourceQueued"}}, "tail": {$: "Nil"}})), "units": _units_0})), "admitted": {$: "Con", "head": _next_observation_0, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Work$find_observation$pick$(_observation_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _observation_0};
  } else {
    return _fallback_0;
  }
}

function $$$$047agent$045flow$045bend$047Work$find_observation$(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $$$$047agent$045flow$045bend$047Work$find_observation$pick$({$: "Work.Observation", "id": _current_0, "stage": __0}, ($$$$047agent$045flow$045bend$047Work$find_observation$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$start_observation$read$(_observation_0, _tail_0) {
  const _id_0 = _observation_0["id"];
  return {$: "Con", "head": {$: "Work.Observation", "id": _id_0, "stage": {$: "Work.SourceReading"}}, "tail": _tail_0};
}

function $$$$047agent$045flow$045bend$047Work$start_observation$pick$(_observation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return $$$$047agent$045flow$045bend$047Work$start_observation$read$(_observation_0, _tail_0);
  } else {
    return {$: "Con", "head": _observation_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Work$start_observation$(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $$$$047agent$045flow$045bend$047Work$start_observation$pick$({$: "Work.Observation", "id": _current_0, "stage": __0}, ($$$$047agent$045flow$045bend$047Work$start_observation$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$start_source$apply$(_work_0, _id_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($$$$047agent$045flow$045bend$047Work$start_observation$(_id_0, _observations_0)), "units": _units_0}, "admitted": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Work$start_source$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$start_source$apply$(_work_0, _id_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$start_source$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$start_source$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($$$$047agent$045flow$045bend$047Work$find_observation$(_id_0, _observations_0)));
}

function $$$$047agent$045flow$045bend$047Work$remove_observation$pick$(_observation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _observation_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Work$remove_observation$(_id_0, _observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _current_0 = _t_0["id"];
    const __0 = _t_0["stage"];
    const _rest_0 = _observations_0["tail"];
    return $$$$047agent$045flow$045bend$047Work$remove_observation$pick$({$: "Work.Observation", "id": _current_0, "stage": __0}, ($$$$047agent$045flow$045bend$047Work$remove_observation$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$make_units$(_count_0, _observation_0, _next_id_0) {
  if (_count_0 === 0) {
    return {$: "Nil"};
  } else {
    const _rest_0 = (_count_0 - 1);
    return {$: "Con", "head": {$: "Work.ReviewUnit", "id": _next_id_0, "observation": _observation_0, "stage": {$: "Work.ReviewQueued"}, "findings": 0, "bytes": 0}, "tail": ($$$$047agent$045flow$045bend$047Work$make_units$(_rest_0, _observation_0, nat_chk(_next_id_0 + 1)))};
  }
}

function $$$$047agent$045flow$045bend$047Work$unit_ids$(_units_0) {
  if (_units_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _units_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _units_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Work$unit_ids$(_rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047Work$prepare$apply$(_work_0, _observation_0, _count_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _new_units_0 = ($$$$047agent$045flow$045bend$047Work$make_units$(_count_0, _observation_0, _next_unit_0));
  return {$: "Work.Accepted", "state": ($$$$047agent$045flow$045bend$047Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + _count_0), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($$$$047agent$045flow$045bend$047Work$remove_observation$(_observation_0, _observations_0)), "units": ($List$append$(_units_0, _new_units_0))})), "admitted": ($$$$047agent$045flow$045bend$047Work$unit_ids$(_new_units_0))};
}

function $$$$047agent$045flow$045bend$047Work$prepare$count$(_work_0, _observation_0, _count_0, _within_limit_0) {
  if (!_within_limit_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.TooManyUnits"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$prepare$apply$(_work_0, _observation_0, _count_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$prepare$stage$(_work_0, _observation_0, _count_0, _stage_0) {
  if (_stage_0.$ === "Work.SourceQueued") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$prepare$count$(_work_0, _observation_0, _count_0, ($Nat$is_le$(_count_0, 16)));
  }
}

function $$$$047agent$045flow$045bend$047Work$prepare$found$(_work_0, _observation_0, _count_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _stage_0 = _t_0["stage"];
    return $$$$047agent$045flow$045bend$047Work$prepare$stage$(_work_0, _observation_0, _count_0, _stage_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$prepare$(_work_0, _observation_0, _count_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$prepare$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, ($$$$047agent$045flow$045bend$047Work$find_observation$(_observation_0, _observations_0)));
}

function $$$$047agent$045flow$045bend$047Work$spawn$apply$(_work_0, _observation_0, _count_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  const _new_units_0 = ($$$$047agent$045flow$045bend$047Work$make_units$(_count_0, _observation_0, _next_unit_0));
  return {$: "Work.Accepted", "state": ($$$$047agent$045flow$045bend$047Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + _count_0), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($List$append$(_units_0, _new_units_0))})), "admitted": ($$$$047agent$045flow$045bend$047Work$unit_ids$(_new_units_0))};
}

function $$$$047agent$045flow$045bend$047Work$spawn$count$(_work_0, _observation_0, _count_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.TooManyUnits"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$spawn$apply$(_work_0, _observation_0, _count_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$spawn$found$(_work_0, _observation_0, _count_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $$$$047agent$045flow$045bend$047Work$spawn$count$(_work_0, _observation_0, _count_0, ($Nat$is_le$(_count_0, 16)));
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$spawn$(_work_0, _observation_0, _count_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$spawn$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, ($$$$047agent$045flow$045bend$047Work$find_observation$(_observation_0, _observations_0)));
}

function $$$$047agent$045flow$045bend$047Work$find_unit$pick$(_unit_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _unit_0};
  } else {
    return _fallback_0;
  }
}

function $$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _units_0) {
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
    return $$$$047agent$045flow$045bend$047Work$find_unit$pick$({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, ($$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$pending_for$found$(_found_0) {
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

function $$$$047agent$045flow$045bend$047Work$pending_for$(_work_0, _id_0) {
  const _units_0 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$pending_for$found$(($$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _units_0)));
}

function $$$$047agent$045flow$045bend$047Work$replace_unit$pick$(_unit_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Work$replace_unit$(_id_0, _replacement_0, _units_0) {
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
    return $$$$047agent$045flow$045bend$047Work$replace_unit$pick$({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, _replacement_0, ($$$$047agent$045flow$045bend$047Work$replace_unit$(_id_0, _replacement_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, _unit_0) {
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
  return {$: "Work.Accepted", "state": ($$$$047agent$045flow$045bend$047Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($$$$047agent$045flow$045bend$047Work$replace_unit$(_id_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, _units_0))})), "admitted": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Work$start_unit$apply$(_work_0, _id_0, _observation_0) {
  return $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.AtJev"}, "findings": 0, "bytes": 0});
}

function $$$$047agent$045flow$045bend$047Work$start_unit$stage$(_work_0, _id_0, _observation_0, _stage_0) {
  if (_stage_0.$ === "Work.ReviewQueued") {
    return $$$$047agent$045flow$045bend$047Work$start_unit$apply$(_work_0, _id_0, _observation_0);
  } else if (_stage_0.$ === "Work.AtJev") {
    return {$: "Work.Accepted", "state": _work_0, "admitted": {$: "Nil"}};
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
  }
}

function $$$$047agent$045flow$045bend$047Work$start_unit$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $$$$047agent$045flow$045bend$047Work$start_unit$stage$(_work_0, _id_0, _observation_0, _stage_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$start_unit$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$start_unit$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _units_0)));
}

function $$$$047agent$045flow$045bend$047Work$outcome$finding$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, _positive_0) {
  if (!_positive_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0});
  }
}

function $$$$047agent$045flow$045bend$047Work$outcome$kind$(_work_0, _id_0, _observation_0, _result_0) {
  if (_result_0.$ === "Work.Finding") {
    const _count_0 = _result_0["count"];
    const _bytes_0 = _result_0["bytes"];
    return $$$$047agent$045flow$045bend$047Work$outcome$finding$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, ($Nat$is_gt$(_count_0, 0)));
  } else if (_result_0.$ === "Work.Clear") {
    return $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.ClearResult"}, "findings": 0, "bytes": 0});
  } else {
    return $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.UnavailableResult"}, "findings": 0, "bytes": 0});
  }
}

function $$$$047agent$045flow$045bend$047Work$outcome$stage$(_work_0, _id_0, _observation_0, _stage_0, _result_0) {
  if (_stage_0.$ === "Work.AtJev") {
    return $$$$047agent$045flow$045bend$047Work$outcome$kind$(_work_0, _id_0, _observation_0, _result_0);
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
  }
}

function $$$$047agent$045flow$045bend$047Work$outcome$found$(_work_0, _id_0, _result_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $$$$047agent$045flow$045bend$047Work$outcome$stage$(_work_0, _id_0, _observation_0, _stage_0, _result_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$outcome$(_work_0, _id_0, _result_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$outcome$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, _result_0, ($$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _units_0)));
}

function $$$$047agent$045flow$045bend$047Work$revise_finding$valid$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0});
  }
}

function $$$$047agent$045flow$045bend$047Work$revise_finding$stage$(_work_0, _id_0, _observation_0, _stage_0, _count_0, _bytes_0) {
  if (_stage_0.$ === "Work.PendingFinding") {
    return $$$$047agent$045flow$045bend$047Work$revise_finding$valid$(_work_0, _id_0, _observation_0, _count_0, _bytes_0, ($Nat$is_gt$(_count_0, 0)));
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
  }
}

function $$$$047agent$045flow$045bend$047Work$revise_finding$found$(_work_0, _id_0, _count_0, _bytes_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $$$$047agent$045flow$045bend$047Work$revise_finding$stage$(_work_0, _id_0, _observation_0, _stage_0, _count_0, _bytes_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$revise_finding$(_work_0, _id_0, _count_0, _bytes_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$revise_finding$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, _count_0, _bytes_0, ($$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _units_0)));
}

function $$$$047agent$045flow$045bend$047Work$interrupt_unit$stage$(_work_0, _id_0, _observation_0, _stage_0) {
  if (_stage_0.$ === "Work.AtJev") {
    return $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.InterruptedResult"}, "findings": 0, "bytes": 0});
  } else if (_stage_0.$ === "Work.ReviewQueued") {
    return $$$$047agent$045flow$045bend$047Work$outcome$apply$(_work_0, {$: "Work.ReviewUnit", "id": _id_0, "observation": _observation_0, "stage": {$: "Work.InterruptedResult"}, "findings": 0, "bytes": 0});
  } else {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitNotAtJev"}};
  }
}

function $$$$047agent$045flow$045bend$047Work$interrupt_unit$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _observation_0 = _t_0["observation"];
    const _stage_0 = _t_0["stage"];
    return $$$$047agent$045flow$045bend$047Work$interrupt_unit$stage$(_work_0, _id_0, _observation_0, _stage_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$interrupt_unit$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$interrupt_unit$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _units_0)));
}

function $$$$047agent$045flow$045bend$047Work$interrupt_observation$found$(_work_0, _id_0, _found_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.MissingObservation"}};
  } else {
    return {$: "Work.Accepted", "state": ($$$$047agent$045flow$045bend$047Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": ($$$$047agent$045flow$045bend$047Work$remove_observation$(_id_0, _observations_0)), "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $$$$047agent$045flow$045bend$047Work$interrupt_observation$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$interrupt_observation$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($$$$047agent$045flow$045bend$047Work$find_observation$(_id_0, _observations_0)));
}

function $$$$047agent$045flow$045bend$047Work$complete_source$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $$$$047agent$045flow$045bend$047Work$interrupt_observation$(_work_0, _id_0);
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$complete_source$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$complete_source$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _id_0, ($$$$047agent$045flow$045bend$047Work$find_observation$(_id_0, _observations_0)));
}

function $$$$047agent$045flow$045bend$047Work$cached_finding$apply$(_work_0, _observation_0, _count_0, _bytes_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": nat_chk(_next_unit_0 + 1), "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($List$append$(_units_0, {$: "Con", "head": {$: "Work.ReviewUnit", "id": _next_unit_0, "observation": _observation_0, "stage": {$: "Work.PendingFinding"}, "findings": _count_0, "bytes": _bytes_0}, "tail": {$: "Nil"}}))}, "admitted": {$: "Con", "head": _next_unit_0, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Work$cached_finding$count$(_work_0, _observation_0, _count_0, _bytes_0, _valid_0) {
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.InvalidFinding"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$cached_finding$apply$(_work_0, _observation_0, _count_0, _bytes_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$cached_finding$found$(_work_0, _observation_0, _count_0, _bytes_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingObservation"}};
  } else {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["stage"];
    if (_t_1.$ === "Work.SourceQueued") {
      return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.SourceNotReading"}};
    } else {
      return $$$$047agent$045flow$045bend$047Work$cached_finding$count$(_work_0, _observation_0, _count_0, _bytes_0, ($Nat$is_gt$(_count_0, 0)));
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$cached_finding$(_work_0, _observation_0, _count_0, _bytes_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const __4 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$cached_finding$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": _observations_0, "units": __4}, _observation_0, _count_0, _bytes_0, ($$$$047agent$045flow$045bend$047Work$find_observation$(_observation_0, _observations_0)));
}

function $$$$047agent$045flow$045bend$047Work$remove_unit$pick$(_unit_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Work$remove_unit$(_id_0, _units_0) {
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
    return $$$$047agent$045flow$045bend$047Work$remove_unit$pick$({$: "Work.ReviewUnit", "id": _current_0, "observation": __0, "stage": __1, "findings": __2, "bytes": __3}, ($$$$047agent$045flow$045bend$047Work$remove_unit$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$retire$apply$(_work_0, _id_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Accepted", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": ($$$$047agent$045flow$045bend$047Work$remove_unit$(_id_0, _units_0))}, "admitted": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Work$retire$stage$(_work_0, _id_0, _unfinished_0) {
  if (_unfinished_0) {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.UnitStillUnfinished"}};
  } else {
    return $$$$047agent$045flow$045bend$047Work$retire$apply$(_work_0, _id_0);
  }
}

function $$$$047agent$045flow$045bend$047Work$retire$found$(_work_0, _id_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Work.Rejected", "state": _work_0, "reason": {$: "Work.MissingUnit"}};
  } else {
    const _t_0 = _found_0["value"];
    const _stage_0 = _t_0["stage"];
    return $$$$047agent$045flow$045bend$047Work$retire$stage$(_work_0, _id_0, ($$$$047agent$045flow$045bend$047Work$is_unit_unfinished$(_stage_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$retire$(_work_0, _id_0) {
  const __0 = _work_0["next_observation"];
  const __1 = _work_0["next_unit"];
  const __2 = _work_0["source_capacity"];
  const __3 = _work_0["review_capacity"];
  const __4 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return $$$$047agent$045flow$045bend$047Work$retire$found$({$: "Work.Work", "next_observation": __0, "next_unit": __1, "source_capacity": __2, "review_capacity": __3, "observations": __4, "units": _units_0}, _id_0, ($$$$047agent$045flow$045bend$047Work$find_unit$(_id_0, _units_0)));
}

function $$$$047agent$045flow$045bend$047Work$set_source_capacity$apply$(_work_0, _capacity_0, _valid_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.InvalidCapacity"}};
  } else {
    return {$: "Work.Accepted", "state": ($$$$047agent$045flow$045bend$047Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $$$$047agent$045flow$045bend$047Work$set_source_capacity$(_work_0, _capacity_0) {
  return $$$$047agent$045flow$045bend$047Work$set_source_capacity$apply$(_work_0, _capacity_0, ($$$$047agent$045flow$045bend$047Flow$capacity_valid$(_capacity_0)));
}

function $$$$047agent$045flow$045bend$047Work$set_review_capacity$apply$(_work_0, _capacity_0, _valid_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  if (!_valid_0) {
    return {$: "Work.Rejected", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": _observations_0, "units": _units_0}, "reason": {$: "Work.InvalidCapacity"}};
  } else {
    return {$: "Work.Accepted", "state": ($$$$047agent$045flow$045bend$047Work$settle$({$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _capacity_0, "observations": _observations_0, "units": _units_0})), "admitted": {$: "Nil"}};
  }
}

function $$$$047agent$045flow$045bend$047Work$set_review_capacity$(_work_0, _capacity_0) {
  return $$$$047agent$045flow$045bend$047Work$set_review_capacity$apply$(_work_0, _capacity_0, ($$$$047agent$045flow$045bend$047Flow$capacity_valid$(_capacity_0)));
}

function $$$$047agent$045flow$045bend$047Work$source_cancel_ids$($0) {
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
          return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Work$source_cancel_ids$(_rest_0))};
        } else {
          const _rest_1 = _observations_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$observation_ids$(_observations_0) {
  if (_observations_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _observations_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _observations_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Work$observation_ids$(_rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047Work$unfinished_unit_ids$($0) {
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
          return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Work$unfinished_unit_ids$(_rest_0))};
        } else if (_t_1.$ === "Work.AtJev") {
          const _rest_1 = _units_0["tail"];
          return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Work$unfinished_unit_ids$(_rest_1))};
        } else {
          const _rest_2 = _units_0["tail"];
          $0 = _rest_2;
          continue;
        }
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$keep_terminal$pick$(_unit_0, _tail_0, _unfinished_0) {
  if (_unfinished_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _unit_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Work$keep_terminal$(_units_0) {
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
    return $$$$047agent$045flow$045bend$047Work$keep_terminal$pick$({$: "Work.ReviewUnit", "id": __0, "observation": __1, "stage": _stage_0, "findings": __2, "bytes": __3}, ($$$$047agent$045flow$045bend$047Work$keep_terminal$(_rest_0)), ($$$$047agent$045flow$045bend$047Work$is_unit_unfinished$(_stage_0)));
  }
}

function $$$$047agent$045flow$045bend$047Work$cancel_unfinished$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Cancelled", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": {$: "Nil"}, "units": ($$$$047agent$045flow$045bend$047Work$keep_terminal$(_units_0))}, "cancelled_source": ($$$$047agent$045flow$045bend$047Work$observation_ids$(_observations_0)), "cancelled_jev": ($$$$047agent$045flow$045bend$047Work$unfinished_unit_ids$(_units_0))};
}

function $$$$047agent$045flow$045bend$047Work$jev_cancel_ids$($0) {
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
          return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Work$jev_cancel_ids$(_rest_0))};
        } else {
          const _rest_1 = _units_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$discarded_finding_ids$($0) {
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
          return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047Work$discarded_finding_ids$(_rest_0))};
        } else {
          const _rest_1 = _units_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Work$close$(_work_0) {
  const _next_observation_0 = _work_0["next_observation"];
  const _next_unit_0 = _work_0["next_unit"];
  const _source_capacity_0 = _work_0["source_capacity"];
  const _review_capacity_0 = _work_0["review_capacity"];
  const _observations_0 = _work_0["observations"];
  const _units_0 = _work_0["units"];
  return {$: "Work.Closed", "state": {$: "Work.Work", "next_observation": _next_observation_0, "next_unit": _next_unit_0, "source_capacity": _source_capacity_0, "review_capacity": _review_capacity_0, "observations": {$: "Nil"}, "units": {$: "Nil"}}, "cancelled_source": ($$$$047agent$045flow$045bend$047Work$source_cancel_ids$(_observations_0)), "cancelled_jev": ($$$$047agent$045flow$045bend$047Work$jev_cancel_ids$(_units_0)), "discarded_findings": ($$$$047agent$045flow$045bend$047Work$discarded_finding_ids$(_units_0))};
}

function $$$$047agent$045flow$045bend$047Work$main$() {
  return $$$$047agent$045flow$045bend$047Work$admit$(($$$$047agent$045flow$045bend$047Work$initial$()));
}

function $$$$047agent$045flow$045bend$047Dispatch$initial$() {
  return {$: "Dispatch.State", "queued": {$: "Nil"}, "running": {$: "Nil"}, "next_sequence": 0, "closed": false, "requests": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047Dispatch$max_running$() {
  return 8;
}

function $$$$047agent$045flow$045bend$047Dispatch$max_requests$() {
  return 8;
}

function $$$$047agent$045flow$045bend$047Dispatch$preparation_count$($0) {
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
          const _x_0 = ($$$$047agent$045flow$045bend$047Dispatch$preparation_count$(_rest_0));
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

function $$$$047agent$045flow$045bend$047Dispatch$same_entry$(_entry_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _owner_0 = _entry_0["partition"];
  const _generation_0 = _entry_0["lifetime"];
  const _current_0 = _entry_0["round"];
  const _id_0 = _entry_0["operation"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Nat$is_eq$(_current_0, _round_0)), ($Nat$is_eq$(_id_0, _operation_0)))))));
}

function $$$$047agent$045flow$045bend$047Dispatch$contains$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _entry_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Dispatch$same_entry$(_entry_0, _partition_0, _lifetime_0, _round_0, _operation_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$contains$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$known$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _x_0 = ($$$$047agent$045flow$045bend$047Dispatch$contains$(_queued_0, _partition_0, _lifetime_0, _round_0, _operation_0));
  const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$contains$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0));
  return (_x_0 || _x_1);
}

function $$$$047agent$045flow$045bend$047Dispatch$start_command$(_entry_0) {
  const _operation_0 = _entry_0["operation"];
  const _sequence_0 = _entry_0["sequence"];
  return {$: "Dispatch.Started", "operation": _operation_0, "sequence": _sequence_0};
}

function $$$$047agent$045flow$045bend$047Dispatch$can_start$(_entry_0, _running_0) {
  const _t_0 = _entry_0["preparation"];
  if (!_t_0) {
    return true;
  } else {
    const _x_0 = ($$$$047agent$045flow$045bend$047Dispatch$preparation_count$(_running_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$max_running$());
    return (_x_0 < _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$prepend_waiting$(_entry_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047Dispatch$pump_queued$(_queued_0, _running_0, _next_sequence_0, _closed_0, _requests_0) {
  if (_queued_0.$ === "Nil") {
    return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": {$: "Nil"}, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, "commands": {$: "Nil"}};
  } else {
    const _entry_0 = _queued_0["head"];
    const _rest_0 = _queued_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$can_start$(_entry_0, _running_0)), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _rest_0, "running": ($List$append$(_running_0, {$: "Con", "head": _entry_0, "tail": {$: "Nil"}})), "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, "commands": {$: "Con", "head": ($$$$047agent$045flow$045bend$047Dispatch$start_command$(_entry_0)), "tail": {$: "Nil"}}}, ($$$$047agent$045flow$045bend$047Dispatch$prepend_waiting$(_entry_0, ($$$$047agent$045flow$045bend$047Dispatch$pump_queued$(_rest_0, _running_0, _next_sequence_0, _closed_0, _requests_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$pump_one$(_state_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  return $$$$047agent$045flow$045bend$047Dispatch$pump_queued$(_queued_0, _running_0, _next_sequence_0, _closed_0, _requests_0);
}

function $$$$047agent$045flow$045bend$047Dispatch$pump_next_result$(_first_0, _commands_0, _result_0) {
  if (_result_0.$ === "Dispatch.Advanced") {
    const _second_0 = _result_0["state"];
    const _more_0 = _result_0["commands"];
    return {$: "Dispatch.Advanced", "state": _second_0, "commands": ($List$append$(_commands_0, _more_0))};
  } else {
    return {$: "Dispatch.Denied", "state": _first_0};
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$pump_next$(_first_0, _commands_0) {
  return $$$$047agent$045flow$045bend$047Dispatch$pump_next_result$(_first_0, _commands_0, ($$$$047agent$045flow$045bend$047Dispatch$pump_one$(_first_0)));
}

function $$$$047agent$045flow$045bend$047Dispatch$may_pump$(_queued_0, _running_0) {
  if (_queued_0.$ === "Nil") {
    return false;
  } else {
    const _entry_0 = _queued_0["head"];
    const _rest_0 = _queued_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Dispatch$can_start$(_entry_0, _running_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$may_pump$(_rest_0, _running_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$pump_remaining$(_remaining_0, _result_0) {
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
      return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$may_pump$(_queued_0, _running_0)), ($$$$047agent$045flow$045bend$047Dispatch$pump_remaining$(_rest_0, ($$$$047agent$045flow$045bend$047Dispatch$pump_next$({$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": __0, "closed": __1, "requests": __2}, _commands_0)))), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": __0, "closed": __1, "requests": __2}, "commands": _commands_0});
    } else {
      const _state_0 = _result_0["state"];
      return {$: "Dispatch.Denied", "state": _state_0};
    }
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$pump_available$(_state_0) {
  const _queued_0 = _state_0["queued"];
  const __0 = _state_0["running"];
  const __1 = _state_0["next_sequence"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["requests"];
  return $$$$047agent$045flow$045bend$047Dispatch$pump_remaining$(($List$length$(_queued_0)), {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _queued_0, "running": __0, "next_sequence": __1, "closed": __2, "requests": __3}, "commands": {$: "Nil"}});
}

function $$$$047agent$045flow$045bend$047Dispatch$enqueue$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _preparation_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  const _x_0 = ($$$$047agent$045flow$045bend$047Dispatch$known$({$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, _partition_0, _lifetime_0, _round_0, _operation_0));
  return $Bool$pick$((_closed_0 || _x_0), {$: "Dispatch.Denied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}}, ($$$$047agent$045flow$045bend$047Dispatch$pump_available$({$: "Dispatch.State", "queued": ($List$append$(_queued_0, {$: "Con", "head": {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _next_sequence_0, "cancelled": false, "preparation": _preparation_0}, "tail": {$: "Nil"}})), "running": _running_0, "next_sequence": nat_chk(_next_sequence_0 + 1), "closed": _closed_0, "requests": _requests_0})));
}

function $$$$047agent$045flow$045bend$047Dispatch$remove_entry$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$same_entry$(_entry_0, _partition_0, _lifetime_0, _round_0, _operation_0)), _rest_0, {$: "Con", "head": _entry_0, "tail": ($$$$047agent$045flow$045bend$047Dispatch$remove_entry$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0))});
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$settle$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$contains$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0)), ($$$$047agent$045flow$045bend$047Dispatch$pump_available$({$: "Dispatch.State", "queued": _queued_0, "running": ($$$$047agent$045flow$045bend$047Dispatch$remove_entry$(_running_0, _partition_0, _lifetime_0, _round_0, _operation_0)), "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0})), {$: "Dispatch.Denied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}});
}

function $$$$047agent$045flow$045bend$047Dispatch$listed$(_ids_0, _operation_0) {
  if (_ids_0.$ === "Nil") {
    return false;
  } else {
    const _id_0 = _ids_0["head"];
    const _rest_0 = _ids_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _operation_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$listed$(_rest_0, _operation_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$discarded_entry$(_entry_0, _running_0) {
  const _operation_0 = _entry_0["operation"];
  return {$: "Dispatch.Discarded", "operation": _operation_0, "running": _running_0};
}

function $$$$047agent$045flow$045bend$047Dispatch$filter_queued_one$(_entry_0, _hit_0, _tail_0) {
  if (_hit_0) {
    const _entries_0 = _tail_0["entries"];
    const _commands_0 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": _entries_0, "commands": {$: "Con", "head": ($$$$047agent$045flow$045bend$047Dispatch$discarded_entry$(_entry_0, false)), "tail": _commands_0}};
  } else {
    const _entries_1 = _tail_0["entries"];
    const _commands_1 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": _entry_0, "tail": _entries_1}, "commands": _commands_1};
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$filter_queued$(_items_0, _ids_0) {
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
    return $$$$047agent$045flow$045bend$047Dispatch$filter_queued_one$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": _operation_0, "sequence": __3, "cancelled": __4, "preparation": __5}, ($$$$047agent$045flow$045bend$047Dispatch$listed$(_ids_0, _operation_0)), ($$$$047agent$045flow$045bend$047Dispatch$filter_queued$(_rest_0, _ids_0)));
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$cancelled_entry$(_entry_0) {
  const _partition_0 = _entry_0["partition"];
  const _lifetime_0 = _entry_0["lifetime"];
  const _round_0 = _entry_0["round"];
  const _operation_0 = _entry_0["operation"];
  const _sequence_0 = _entry_0["sequence"];
  const _preparation_0 = _entry_0["preparation"];
  return {$: "Dispatch.Entry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "sequence": _sequence_0, "cancelled": true, "preparation": _preparation_0};
}

function $$$$047agent$045flow$045bend$047Dispatch$filter_running_hit$(_entry_0, _hit_0, _tail_0) {
  if (!_hit_0) {
    const _entries_0 = _tail_0["entries"];
    const _commands_0 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": _entry_0, "tail": _entries_0}, "commands": _commands_0};
  } else {
    const _entries_1 = _tail_0["entries"];
    const _commands_1 = _tail_0["commands"];
    return {$: "Dispatch.Filtered", "entries": {$: "Con", "head": ($$$$047agent$045flow$045bend$047Dispatch$cancelled_entry$(_entry_0)), "tail": _entries_1}, "commands": {$: "Con", "head": ($$$$047agent$045flow$045bend$047Dispatch$discarded_entry$(_entry_0, true)), "tail": _commands_1}};
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$filter_running_one$(_entry_0, _hit_0, _tail_0) {
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
    return $$$$047agent$045flow$045bend$047Dispatch$filter_running_hit$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": __3, "sequence": __4, "cancelled": _t_0, "preparation": __6}, _hit_0, _tail_0);
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$filter_running$(_items_0, _ids_0) {
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
    return $$$$047agent$045flow$045bend$047Dispatch$filter_running_one$({$: "Dispatch.Entry", "partition": __0, "lifetime": __1, "round": __2, "operation": _operation_0, "sequence": __3, "cancelled": __4, "preparation": __5}, ($$$$047agent$045flow$045bend$047Dispatch$listed$(_ids_0, _operation_0)), ($$$$047agent$045flow$045bend$047Dispatch$filter_running$(_rest_0, _ids_0)));
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$discarded_result$(_state_0, _queued_0, _running_0) {
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  const _waiting_0 = _queued_0["entries"];
  const _waiting_commands_0 = _queued_0["commands"];
  const _executing_0 = _running_0["entries"];
  const _executing_commands_0 = _running_0["commands"];
  return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": _waiting_0, "running": _executing_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}, "commands": ($List$append$(_waiting_commands_0, _executing_commands_0))};
}

function $$$$047agent$045flow$045bend$047Dispatch$discard$(_state_0, _ids_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const __0 = _state_0["next_sequence"];
  const __1 = _state_0["closed"];
  const __2 = _state_0["requests"];
  return $$$$047agent$045flow$045bend$047Dispatch$discarded_result$({$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": __0, "closed": __1, "requests": __2}, ($$$$047agent$045flow$045bend$047Dispatch$filter_queued$(_queued_0, _ids_0)), ($$$$047agent$045flow$045bend$047Dispatch$filter_running$(_running_0, _ids_0)));
}

function $$$$047agent$045flow$045bend$047Dispatch$discard_all$(_items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return {$: "Con", "head": ($$$$047agent$045flow$045bend$047Dispatch$discarded_entry$(_entry_0, false)), "tail": ($$$$047agent$045flow$045bend$047Dispatch$discard_all$(_rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$close$(_state_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _requests_0 = _state_0["requests"];
  return {$: "Dispatch.Advanced", "state": {$: "Dispatch.State", "queued": {$: "Nil"}, "running": _running_0, "next_sequence": _next_sequence_0, "closed": true, "requests": _requests_0}, "commands": ($$$$047agent$045flow$045bend$047Dispatch$discard_all$(_queued_0))};
}

function $$$$047agent$045flow$045bend$047Dispatch$request_matches$(_item_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const _owner_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["round"];
  const _work_0 = _item_0["operation"];
  const _id_0 = _item_0["request"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Nat$is_eq$(_current_0, _round_0)), ($Bool$and$(($Nat$is_eq$(_work_0, _operation_0)), ($Nat$is_eq$(_id_0, _request_0)))))))));
}

function $$$$047agent$045flow$045bend$047Dispatch$request_known$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Dispatch$request_matches$(_item_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$request_known$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$request_for_work$(_items_0, _operation_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _work_0 = _t_0["operation"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_work_0, _operation_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$request_for_work$(_rest_0, _operation_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$reserve_request$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const _queued_0 = _state_0["queued"];
  const _running_0 = _state_0["running"];
  const _next_sequence_0 = _state_0["next_sequence"];
  const _closed_0 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  const _x_0 = ($List$length$(_requests_0));
  const _x_1 = ($$$$047agent$045flow$045bend$047Dispatch$max_requests$());
  const _x_2 = ($$$$047agent$045flow$045bend$047Dispatch$request_for_work$(_requests_0, _operation_0));
  const _x_3 = ($Bool$not$((_x_0 < _x_1)));
  const _x_4 = (_x_2 || _x_3);
  return $Bool$pick$((_closed_0 || _x_4), {$: "Dispatch.RequestDenied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}}, {$: "Dispatch.RequestAccepted", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": {$: "Con", "head": {$: "Dispatch.Request", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "request": _request_0, "started": false, "interrupted": false}, "tail": _requests_0}}});
}

function $$$$047agent$045flow$045bend$047Dispatch$request_started$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
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
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$request_matches$({$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": __0, "interrupted": _interrupted_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": true, "interrupted": _interrupted_0}, "tail": _rest_0}, {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": __0, "interrupted": _interrupted_0}, "tail": ($$$$047agent$045flow$045bend$047Dispatch$request_started$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))});
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$request_interrupted$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
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
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$request_matches$({$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": _started_0, "interrupted": __0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": _started_0, "interrupted": true}, "tail": _rest_0}, {$: "Con", "head": {$: "Dispatch.Request", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": _work_0, "request": _id_0, "started": _started_0, "interrupted": __0}, "tail": ($$$$047agent$045flow$045bend$047Dispatch$request_interrupted$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))});
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$request_remove$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$request_matches$(_item_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), _rest_0, {$: "Con", "head": _item_0, "tail": ($$$$047agent$045flow$045bend$047Dispatch$request_remove$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))});
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$request_phase$(_items_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Dispatch$request_matches$(_item_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), {$: "Some", "value": _item_0}, ($$$$047agent$045flow$045bend$047Dispatch$request_phase$(_rest_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)));
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$request_update_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _start_0, _interrupt_0, _settle_0, _found_0) {
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
    return $Bool$pick$((_x_2 || _x_3), {$: "Dispatch.RequestDenied", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": _requests_0}}, {$: "Dispatch.RequestAccepted", "state": {$: "Dispatch.State", "queued": _queued_0, "running": _running_0, "next_sequence": _next_sequence_0, "closed": _closed_0, "requests": ($Bool$pick$(_settle_0, ($$$$047agent$045flow$045bend$047Dispatch$request_remove$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), ($Bool$pick$(_start_0, ($$$$047agent$045flow$045bend$047Dispatch$request_started$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)), ($$$$047agent$045flow$045bend$047Dispatch$request_interrupted$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0))))))}});
  }
}

function $$$$047agent$045flow$045bend$047Dispatch$request_update$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _start_0, _interrupt_0, _settle_0) {
  const __0 = _state_0["queued"];
  const __1 = _state_0["running"];
  const __2 = _state_0["next_sequence"];
  const __3 = _state_0["closed"];
  const _requests_0 = _state_0["requests"];
  return $$$$047agent$045flow$045bend$047Dispatch$request_update_found$({$: "Dispatch.State", "queued": __0, "running": __1, "next_sequence": __2, "closed": __3, "requests": _requests_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _start_0, _interrupt_0, _settle_0, ($$$$047agent$045flow$045bend$047Dispatch$request_phase$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)));
}

function $$$$047agent$045flow$045bend$047Retention$cleanup_gate$(_facts_0) {
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

function $$$$047agent$045flow$045bend$047Retention$cleanup_commit$(_ledger_empty_0) {
  return $Bool$pick$(_ledger_empty_0, {$: "Retention.CleanupReady"}, {$: "Retention.CleanupBusy"});
}

function $$$$047agent$045flow$045bend$047Retention$cleanup_live_state$(_rounds_empty_0, _pending_permits_empty_0) {
  return $Bool$and$(_rounds_empty_0, _pending_permits_empty_0);
}

function $$$$047agent$045flow$045bend$047Retention$discard_scope$(_named_count_0, _cancelled_count_0, _has_unnamed_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_named_count_0, _cancelled_count_0)), ($Bool$not$(_has_unnamed_0)))), {$: "Retention.NamedOnly"}, {$: "Retention.AllUnfinished"});
}

function $$$$047agent$045flow$045bend$047Retention$main$() {
  return $$$$047agent$045flow$045bend$047Retention$cleanup_gate$({$: "Retention.CleanupFacts", "active": true, "dispatcher_idle": true, "no_advice": true, "no_notices": true, "no_pending_evaluations": true, "no_current_work": true, "no_cooldowns": true, "connection_count_ok": true, "cache_matches_ledger": true});
}

function $$$$047agent$045flow$045bend$047Collection$credential_disposition$(_same_scope_0, _generation_valid_0) {
  return $Bool$pick$(($Bool$and$(_same_scope_0, ($Bool$not$(_generation_valid_0)))), {$: "Collection.RetireAdvice"}, {$: "Collection.RetainAdvice"});
}

function $$$$047agent$045flow$045bend$047Collection$order$(_left_sequence_0, _right_sequence_0) {
  return $Bool$pick$((_left_sequence_0 < _right_sequence_0), {$: "Collection.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_sequence_0, _right_sequence_0)), {$: "Collection.After"}, {$: "Collection.Equal"})));
}

function $$$$047agent$045flow$045bend$047Collection$eligible$(_stop_deciding_0, _edit_complete_0) {
  return (_stop_deciding_0 || _edit_complete_0);
}

function $$$$047agent$045flow$045bend$047Collection$expired$(_elapsed_0, _lifetime_0) {
  return $Nat$is_ge$(_elapsed_0, _lifetime_0);
}

function $$$$047agent$045flow$045bend$047Collection$main$() {
  return $$$$047agent$045flow$045bend$047Collection$eligible$(false, true);
}

function $$$$047agent$045flow$045bend$047Handoff$validation_route$(_owner_current_0, _status_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$post_validation$(_work_accepted_0, _expired_0, _has_fitting_0) {
  const _x_0 = ($Bool$not$(_work_accepted_0));
  return $Bool$pick$((_x_0 || _expired_0), {$: "Handoff.RetireCandidate"}, ($Bool$pick$(_has_fitting_0, {$: "Handoff.RetainCandidate"}, {$: "Handoff.ReleaseCandidate"})));
}

function $$$$047agent$045flow$045bend$047Handoff$final_candidate$(_owner_current_0, _credential_generation_0, _credential_authorized_0, _expired_0, _work_current_0, _has_findings_0) {
  const _x_0 = ($Bool$not$(_work_current_0));
  return $Bool$pick$(($Bool$not$(_owner_current_0)), {$: "Handoff.IgnoreCandidate"}, ($Bool$pick$(($Bool$not$(_credential_generation_0)), {$: "Handoff.RetireCandidate"}, ($Bool$pick$(($Bool$not$(_credential_authorized_0)), {$: "Handoff.ReleaseCandidate"}, ($Bool$pick$((_expired_0 || _x_0), {$: "Handoff.RetireCandidate"}, ($Bool$pick$(_has_findings_0, {$: "Handoff.RetainCandidate"}, {$: "Handoff.ReleaseCandidate"})))))))));
}

function $$$$047agent$045flow$045bend$047Handoff$initial$(_partition_0, _round_0) {
  return {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": {$: "Nil"}, "retained": {$: "Nil"}, "findings": 0, "bytes": 0};
}

function $$$$047agent$045flow$045bend$047Handoff$current$(_advice_0, _partition_0, _round_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$fits_batch$(_items_0, _bytes_0) {
  return $Bool$and$(($Nat$is_gt$(_items_0, 0)), ($Nat$is_le$(_bytes_0, 10240)));
}

function $$$$047agent$045flow$045bend$047Handoff$notice_offer$(_items_0, _bytes_0, _skip_unfitting_0) {
  return $Bool$pick$(($$$$047agent$045flow$045bend$047Handoff$fits_batch$(_items_0, _bytes_0)), {$: "Handoff.IncludeNotice"}, ($Bool$pick$(_skip_unfitting_0, {$: "Handoff.SkipNotice"}, {$: "Handoff.StopNotices"})));
}

function $$$$047agent$045flow$045bend$047Handoff$select$fit$(_state_0, _id_0, _prospective_bytes_0, _fits_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$select$limit$(_state_0, _id_0) {
  const _partition_0 = _state_0["partition"];
  const _round_0 = _state_0["round"];
  const _selected_0 = _state_0["selected"];
  const _retained_0 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const _bytes_0 = _state_0["bytes"];
  return {$: "Handoff.Limited", "state": {$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": ($List$append$(_retained_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})), "findings": _count_0, "bytes": _bytes_0}, "id": _id_0};
}

function $$$$047agent$045flow$045bend$047Handoff$select$solo$(_state_0, _id_0, _prospective_bytes_0, _count_0, _oversized_0) {
  if (_oversized_0) {
    return $$$$047agent$045flow$045bend$047Handoff$select$limit$(_state_0, _id_0);
  } else {
    return $$$$047agent$045flow$045bend$047Handoff$select$fit$(_state_0, _id_0, _prospective_bytes_0, ($$$$047agent$045flow$045bend$047Handoff$fits_batch$(nat_chk(_count_0 + 1), _prospective_bytes_0)));
  }
}

function $$$$047agent$045flow$045bend$047Handoff$select$valid$(_state_0, _id_0, _prospective_bytes_0, _solo_bytes_0, _count_0, _valid_0) {
  if (_valid_0) {
    return $$$$047agent$045flow$045bend$047Handoff$select$solo$(_state_0, _id_0, _prospective_bytes_0, _count_0, ($Nat$is_gt$(_solo_bytes_0, 10240)));
  } else {
    return {$: "Handoff.Expired", "state": _state_0};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$select$current$(_state_0, _advice_0, _prospective_bytes_0, _valid_0) {
  const __0 = _state_0["partition"];
  const __1 = _state_0["round"];
  const __2 = _state_0["selected"];
  const __3 = _state_0["retained"];
  const _count_0 = _state_0["findings"];
  const __4 = _state_0["bytes"];
  const _id_0 = _advice_0["id"];
  const _solo_bytes_0 = _advice_0["solo_bytes"];
  return $$$$047agent$045flow$045bend$047Handoff$select$valid$({$: "Handoff.Selection", "partition": __0, "round": __1, "selected": __2, "retained": __3, "findings": _count_0, "bytes": __4}, _id_0, _prospective_bytes_0, _solo_bytes_0, _count_0, _valid_0);
}

function $$$$047agent$045flow$045bend$047Handoff$contains$(_id_0, _ids_0) {
  if (_ids_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _ids_0["head"];
    const _rest_0 = _ids_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _item_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Handoff$contains$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Handoff$select$duplicate$(_state_0, _advice_0, _prospective_bytes_0, _current_0, _duplicate_0) {
  if (_duplicate_0) {
    return {$: "Handoff.Duplicate", "state": _state_0};
  } else {
    return $$$$047agent$045flow$045bend$047Handoff$select$current$(_state_0, _advice_0, _prospective_bytes_0, _current_0);
  }
}

function $$$$047agent$045flow$045bend$047Handoff$select$(_state_0, _advice_0, _prospective_bytes_0) {
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
  const _x_0 = ($$$$047agent$045flow$045bend$047Handoff$contains$(_id_0, _selected_0));
  const _x_1 = ($$$$047agent$045flow$045bend$047Handoff$contains$(_id_0, _retained_0));
  return $$$$047agent$045flow$045bend$047Handoff$select$duplicate$({$: "Handoff.Selection", "partition": _partition_0, "round": _round_0, "selected": _selected_0, "retained": _retained_0, "findings": __0, "bytes": __1}, {$: "Handoff.Advice", "id": _id_0, "unit": __2, "partition": __3, "round": __4, "snapshot": __5, "current_snapshot": __6, "credential": __7, "current_credential": __8, "age_ms": __9, "solo_bytes": __10, "collection_ready": __11}, _prospective_bytes_0, ($$$$047agent$045flow$045bend$047Handoff$current$({$: "Handoff.Advice", "id": _id_0, "unit": __2, "partition": __3, "round": __4, "snapshot": __5, "current_snapshot": __6, "credential": __7, "current_credential": __8, "age_ms": __9, "solo_bytes": __10, "collection_ready": __11}, _partition_0, _round_0)), (_x_0 || _x_1));
}

function $$$$047agent$045flow$045bend$047Handoff$finish$initial$(_round_0) {
  return {$: "Handoff.Finish", "round": _round_0, "active": true, "closed": false, "continuations": 0, "reserved": false, "token": 0, "collector": 0, "deadline_at": 0};
}

function $$$$047agent$045flow$045bend$047Handoff$finish$choose$check$(_state_0, _can_continue_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$finish$choose$(_state_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const __3 = _state_0["reserved"];
  const __4 = _state_0["token"];
  const __5 = _state_0["collector"];
  const __6 = _state_0["deadline_at"];
  return $$$$047agent$045flow$045bend$047Handoff$finish$choose$check$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": _continuations_0, "reserved": __3, "token": __4, "collector": __5, "deadline_at": __6}, ($Bool$and$(($Nat$is_gt$(_actionable_findings_0, 0)), (_continuations_0 < 4))));
}

function $$$$047agent$045flow$045bend$047Handoff$finish$zero$(_state_0, _actionable_findings_0, _zero_0) {
  if (_zero_0) {
    return $$$$047agent$045flow$045bend$047Handoff$finish$choose$(_state_0, _actionable_findings_0);
  } else {
    return {$: "Handoff.Wait", "state": _state_0};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$finish$ready$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0) {
  if (_deadline_0) {
    return $$$$047agent$045flow$045bend$047Handoff$finish$choose$(_state_0, _actionable_findings_0);
  } else {
    return $$$$047agent$045flow$045bend$047Handoff$finish$zero$(_state_0, _actionable_findings_0, ($Nat$is_eq$(_unfinished_0, 0)));
  }
}

function $$$$047agent$045flow$045bend$047Handoff$finish$pending$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0) {
  if (_reserved_0) {
    return {$: "Handoff.Wait", "state": _state_0};
  } else {
    return $$$$047agent$045flow$045bend$047Handoff$finish$ready$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0);
  }
}

function $$$$047agent$045flow$045bend$047Handoff$finish$guard$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _valid_0, _reserved_0) {
  if (_valid_0) {
    return $$$$047agent$045flow$045bend$047Handoff$finish$pending$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0, _reserved_0);
  } else {
    return {$: "Handoff.Allow", "state": _state_0};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$finish$decide$(_state_0, _unfinished_0, _deadline_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const __2 = _state_0["token"];
  const __3 = _state_0["collector"];
  const __4 = _state_0["deadline_at"];
  return $$$$047agent$045flow$045bend$047Handoff$finish$guard$({$: "Handoff.Finish", "round": __0, "active": _active_0, "closed": _closed_0, "continuations": __1, "reserved": _reserved_0, "token": __2, "collector": __3, "deadline_at": __4}, _unfinished_0, _deadline_0, _actionable_findings_0, ($Bool$and$(_active_0, ($Bool$not$(_closed_0)))), _reserved_0);
}

function $$$$047agent$045flow$045bend$047Handoff$finish$start$choose$(_state_0, _original_deadline_0, _first_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$finish$start$(_state_0, _original_deadline_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return $$$$047agent$045flow$045bend$047Handoff$finish$start$choose$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": _deadline_at_0}, _original_deadline_0, ($Nat$is_eq$(_deadline_at_0, 0)));
}

function $$$$047agent$045flow$045bend$047Handoff$finish$at$(_state_0, _unfinished_0, _now_0, _actionable_findings_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return $$$$047agent$045flow$045bend$047Handoff$finish$decide$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": _deadline_at_0}, _unfinished_0, ($Nat$is_ge$(_now_0, _deadline_at_0)), _actionable_findings_0);
}

function $$$$047agent$045flow$045bend$047Handoff$finish$decide_at$(_state_0, _unfinished_0, _now_0, _original_deadline_0, _actionable_findings_0) {
  return $$$$047agent$045flow$045bend$047Handoff$finish$at$(($$$$047agent$045flow$045bend$047Handoff$finish$start$(_state_0, _original_deadline_0)), _unfinished_0, _now_0, _actionable_findings_0);
}

function $$$$047agent$045flow$045bend$047Handoff$finish$bind_writer$(_state_0, _writer_0) {
  const _round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _token_0 = _state_0["token"];
  const _deadline_at_0 = _state_0["deadline_at"];
  return {$: "Handoff.Finish", "round": _round_0, "active": _active_0, "closed": _closed_0, "continuations": _continuations_0, "reserved": _reserved_0, "token": nat_chk(_token_0 + 1), "collector": _writer_0, "deadline_at": _deadline_at_0};
}

function $$$$047agent$045flow$045bend$047Handoff$finish$complete$check$(_state_0, _valid_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$finish$can_complete$(_state_0, _round_0, _slot_0, _token_0, _collector_0) {
  const _own_round_0 = _state_0["round"];
  const _active_0 = _state_0["active"];
  const _closed_0 = _state_0["closed"];
  const _continuations_0 = _state_0["continuations"];
  const _reserved_0 = _state_0["reserved"];
  const _own_token_0 = _state_0["token"];
  const _own_collector_0 = _state_0["collector"];
  return $Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$and$(_active_0, ($Bool$and$(($Bool$not$(_closed_0)), ($Bool$and$(_reserved_0, ($Bool$and$(($Nat$is_eq$(_continuations_0, _slot_0)), ($Bool$and$(($Nat$is_eq$(_own_token_0, _token_0)), ($Nat$is_eq$(_own_collector_0, _collector_0)))))))))))));
}

function $$$$047agent$045flow$045bend$047Handoff$finish$complete$(_state_0, _round_0, _slot_0, _token_0, _collector_0) {
  const __0 = _state_0["round"];
  const __1 = _state_0["active"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["continuations"];
  const __4 = _state_0["reserved"];
  const __5 = _state_0["token"];
  const __6 = _state_0["collector"];
  const __7 = _state_0["deadline_at"];
  return $$$$047agent$045flow$045bend$047Handoff$finish$complete$check$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": __7}, ($$$$047agent$045flow$045bend$047Handoff$finish$can_complete$({$: "Handoff.Finish", "round": __0, "active": __1, "closed": __2, "continuations": __3, "reserved": __4, "token": __5, "collector": __6, "deadline_at": __7}, _round_0, _slot_0, _token_0, _collector_0)));
}

function $$$$047agent$045flow$045bend$047Handoff$main$() {
  return $$$$047agent$045flow$045bend$047Handoff$finish$decide$(($$$$047agent$045flow$045bend$047Handoff$finish$initial$(1)), 0, false, 1);
}

function $$$$047agent$045flow$045bend$047Handoff$lease$initial$(_item_0, _round_0) {
  return {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": false, "reoffered": false, "phase": {$: "Handoff.Available"}};
}

function $$$$047agent$045flow$045bend$047Handoff$lease$reserve$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _surface_0) {
  if (_phase_0.$ === "Handoff.Available") {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$reserve$guard$(_state_0, _token_0, _surface_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $$$$047agent$045flow$045bend$047Handoff$lease$reserve$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _surface_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $$$$047agent$045flow$045bend$047Handoff$lease$reserve$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _surface_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $$$$047agent$045flow$045bend$047Handoff$lease$authorize$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0) {
  if (_same_0) {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Authorized", "token": _own_token_0, "surface": _surface_0}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _own_token_0, "surface": _surface_0}}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$authorize$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Reserved") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $$$$047agent$045flow$045bend$047Handoff$lease$authorize$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat$is_eq$(_own_token_0, _token_0)));
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$authorize$guard$(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $$$$047agent$045flow$045bend$047Handoff$lease$authorize$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$authorize$(_state_0, _round_0, _token_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $$$$047agent$045flow$045bend$047Handoff$lease$authorize$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $$$$047agent$045flow$045bend$047Handoff$lease$release$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0) {
  if (_same_0) {
    return {$: "Handoff.Granted", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Available"}}};
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Reserved", "token": _own_token_0, "surface": _surface_0}}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$release$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Reserved") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $$$$047agent$045flow$045bend$047Handoff$lease$release$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat$is_eq$(_own_token_0, _token_0)));
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$release$guard$(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $$$$047agent$045flow$045bend$047Handoff$lease$release$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$release$(_state_0, _round_0, _token_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $$$$047agent$045flow$045bend$047Handoff$lease$release$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $$$$047agent$045flow$045bend$047Handoff$lease$terminal$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, _same_0, _certain_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$lease$terminal$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _certain_0) {
  if (_phase_0.$ === "Handoff.Authorized") {
    const _own_token_0 = _phase_0["token"];
    const _surface_0 = _phase_0["surface"];
    return $$$$047agent$045flow$045bend$047Handoff$lease$terminal$match$(_item_0, _round_0, _closed_0, _reoffered_0, _own_token_0, _surface_0, ($Nat$is_eq$(_own_token_0, _token_0)), _certain_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$terminal$guard$(_state_0, _token_0, _certain_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $$$$047agent$045flow$045bend$047Handoff$lease$terminal$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0, _certain_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$terminal$(_state_0, _round_0, _token_0, _certain_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const __1 = _state_0["reoffered"];
  const __2 = _state_0["phase"];
  return $$$$047agent$045flow$045bend$047Handoff$lease$terminal$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": __1, "phase": __2}, _token_0, _certain_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$not$(_closed_0)))));
}

function $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$surface$(_item_0, _round_0, _closed_0, _reoffered_0, _surface_0, _uncertain_0, _token_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0) {
  if (_phase_0.$ === "Handoff.Submitted") {
    const _surface_0 = _phase_0["surface"];
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": {$: "Handoff.Submitted", "surface": _surface_0}}};
  } else if (_phase_0.$ === "Handoff.Uncertain") {
    const _surface_1 = _phase_0["surface"];
    return $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$surface$(_item_0, _round_0, _closed_0, _reoffered_0, _surface_1, true, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$guard$(_state_0, _token_0, _allowed_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  if (_allowed_0) {
    return $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$phase$(_item_0, _round_0, _closed_0, _reoffered_0, _phase_0, _token_0);
  } else {
    return {$: "Handoff.Denied", "state": {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": _phase_0}};
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$(_state_0, _round_0, _token_0, _fresh_0) {
  const __0 = _state_0["item"];
  const _own_round_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _reoffered_0 = _state_0["reoffered"];
  const __1 = _state_0["phase"];
  return $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$guard$({$: "Handoff.Lease", "item": __0, "round": _own_round_0, "closed": _closed_0, "reoffered": _reoffered_0, "phase": __1}, _token_0, ($Bool$and$(($Nat$is_eq$(_own_round_0, _round_0)), ($Bool$and$(($Bool$not$(_closed_0)), ($Bool$and$(($Bool$not$(_reoffered_0)), _fresh_0)))))));
}

function $$$$047agent$045flow$045bend$047Handoff$lease$offer$background$(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return $$$$047agent$045flow$045bend$047Handoff$lease$reoffer$(_state_0, _round_0, _token_0, _fresh_0);
  } else {
    return $$$$047agent$045flow$045bend$047Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0);
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$offer$phase$(_state_0, _round_0, _token_0, _surface_0, _fresh_0, _phase_0) {
  if (_phase_0.$ === "Handoff.Uncertain") {
    const _t_0 = _phase_0["surface"];
    if (_t_0.$ === "Handoff.Background") {
      return $$$$047agent$045flow$045bend$047Handoff$lease$offer$background$(_state_0, _round_0, _token_0, _surface_0, _fresh_0);
    } else {
      return $$$$047agent$045flow$045bend$047Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0);
    }
  } else {
    return $$$$047agent$045flow$045bend$047Handoff$lease$reserve$(_state_0, _round_0, _token_0, _surface_0);
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$offer$(_state_0, _round_0, _token_0, _surface_0, _fresh_0) {
  const __0 = _state_0["item"];
  const __1 = _state_0["round"];
  const __2 = _state_0["closed"];
  const __3 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  return $$$$047agent$045flow$045bend$047Handoff$lease$offer$phase$({$: "Handoff.Lease", "item": __0, "round": __1, "closed": __2, "reoffered": __3, "phase": _phase_0}, _round_0, _token_0, _surface_0, _fresh_0, _phase_0);
}

function $$$$047agent$045flow$045bend$047Handoff$lease$close$(_state_0) {
  const _item_0 = _state_0["item"];
  const _round_0 = _state_0["round"];
  const _reoffered_0 = _state_0["reoffered"];
  const _phase_0 = _state_0["phase"];
  return {$: "Handoff.Lease", "item": _item_0, "round": _round_0, "closed": true, "reoffered": _reoffered_0, "phase": _phase_0};
}

function $$$$047agent$045flow$045bend$047Handoff$lease$suppress_surface$(_own_0, _requested_0) {
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

function $$$$047agent$045flow$045bend$047Handoff$lease$suppress_phase$(_phase_0, _requested_0) {
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
    return $$$$047agent$045flow$045bend$047Handoff$lease$suppress_surface$(_surface_0, _requested_0);
  }
}

function $$$$047agent$045flow$045bend$047Handoff$lease$suppresses$(_state_0, _round_0, _requested_0) {
  const _owner_0 = _state_0["round"];
  const _closed_0 = _state_0["closed"];
  const _phase_0 = _state_0["phase"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _round_0)), ($Bool$and$(($Bool$not$(_closed_0)), ($$$$047agent$045flow$045bend$047Handoff$lease$suppress_phase$(_phase_0, _requested_0)))));
}

function $$$$047agent$045flow$045bend$047Round$stop_terminal$(_has_output_0, _authorized_0, _requested_close_0) {
  const _x_0 = ($Bool$and$(_has_output_0, ($Bool$not$(_authorized_0))));
  return {$: "Round.StopTerminal", "revoke_provisional": ($Bool$and$(_has_output_0, ($Bool$not$(_authorized_0)))), "close": (_requested_close_0 || _x_0)};
}

function $$$$047agent$045flow$045bend$047Round$expire_close$(_barrier_0) {
  return $Bool$not$(_barrier_0);
}

function $$$$047agent$045flow$045bend$047Round$initial$() {
  return {$: "Round.Round", "generation": 1, "active": true, "closed_at": 0, "continuations": 0, "stop_token": 0, "barrier": false, "deciding": false, "output_reserved": false};
}

function $$$$047agent$045flow$045bend$047Round$max_continuations$() {
  return 4;
}

function $$$$047agent$045flow$045bend$047Round$active$(_state_0, _generation_0) {
  const _own_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  return $Bool$and$(_live_0, ($Nat$is_eq$(_own_0, _generation_0)));
}

function $$$$047agent$045flow$045bend$047Round$budget$(_state_0) {
  const _live_0 = _state_0["active"];
  const _count_0 = _state_0["continuations"];
  const _x_0 = ($$$$047agent$045flow$045bend$047Round$max_continuations$());
  return $Bool$and$(_live_0, (_count_0 < _x_0));
}

function $$$$047agent$045flow$045bend$047Round$begin_stop$(_state_0, _token_0) {
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

function $$$$047agent$045flow$045bend$047Round$owns_stop$(_state_0, _token_0) {
  const _live_0 = _state_0["active"];
  const _owner_0 = _state_0["stop_token"];
  const _deciding_0 = _state_0["deciding"];
  return $Bool$and$(_live_0, ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Nat$is_eq$(_owner_0, _token_0)), ($Bool$not$(_deciding_0)))))));
}

function $$$$047agent$045flow$045bend$047Round$begin_decision$(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047Round$owns_stop$({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}, _token_0)), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": true, "output_reserved": _output_0}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $$$$047agent$045flow$045bend$047Round$consume$(_state_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  const _x_0 = ($Nat$is_gt$(_owner_0, 0));
  return $Bool$pick$(($$$$047agent$045flow$045bend$047Round$budget$({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0})), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": nat_chk(_count_0 + 1), "stop_token": _owner_0, "barrier": (_barrier_0 || _x_0), "deciding": _deciding_0, "output_reserved": _output_0}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $$$$047agent$045flow$045bend$047Round$reserve_output$(_state_0, _token_0) {
  const _generation_0 = _state_0["generation"];
  const _live_0 = _state_0["active"];
  const _closed_at_0 = _state_0["closed_at"];
  const _count_0 = _state_0["continuations"];
  const _owner_0 = _state_0["stop_token"];
  const _barrier_0 = _state_0["barrier"];
  const _deciding_0 = _state_0["deciding"];
  const _output_0 = _state_0["output_reserved"];
  return $Bool$pick$(($Bool$and$(_live_0, ($Bool$and$(_deciding_0, ($Bool$and$(($Nat$is_eq$(_owner_0, _token_0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(_output_0)), ($$$$047agent$045flow$045bend$047Round$budget$({$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0})))))))))))), {$: "Round.Granted", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": nat_chk(_count_0 + 1), "stop_token": _owner_0, "barrier": true, "deciding": _deciding_0, "output_reserved": true}}, {$: "Round.Denied", "state": {$: "Round.Round", "generation": _generation_0, "active": _live_0, "closed_at": _closed_at_0, "continuations": _count_0, "stop_token": _owner_0, "barrier": _barrier_0, "deciding": _deciding_0, "output_reserved": _output_0}});
}

function $$$$047agent$045flow$045bend$047Round$release_output$(_state_0, _token_0) {
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

function $$$$047agent$045flow$045bend$047Round$finish_stop$(_state_0, _token_0, _close_0, _at_0) {
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

function $$$$047agent$045flow$045bend$047Round$reopen$(_state_0, _generation_0) {
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

function $$$$047agent$045flow$045bend$047Round$main$() {
  return $$$$047agent$045flow$045bend$047Round$begin_stop$(($$$$047agent$045flow$045bend$047Round$initial$()), 1);
}

function $$$$047agent$045flow$045bend$047Delivery$submission_candidate$(_facts_0) {
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

function $$$$047agent$045flow$045bend$047Delivery$submission_batch_gate$(_count_0, _all_valid_0) {
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_count_0, 0)), _all_valid_0)), {$: "Delivery.BatchProceed"}, {$: "Delivery.BatchRelease"});
}

function $$$$047agent$045flow$045bend$047Delivery$credential_observe$(_invalid_seen_0, _generation_valid_0, _authorized_0) {
  const _x_0 = ($Bool$not$(($Bool$and$(_generation_valid_0, _authorized_0))));
  return (_invalid_seen_0 || _x_0);
}

function $$$$047agent$045flow$045bend$047Delivery$final_credential_gate$(_shared_collect_0, _invalid_seen_0) {
  return $Bool$pick$(($Bool$and$(_shared_collect_0, _invalid_seen_0)), {$: "Delivery.BatchRelease"}, {$: "Delivery.BatchProceed"});
}

function $$$$047agent$045flow$045bend$047Delivery$collection_lease$(_has_lease_0, _expired_0, _stop_collector_0, _same_group_0, _background_reofferable_0) {
  const _x_0 = ($Bool$and$(_stop_collector_0, ($Bool$and$(_same_group_0, _background_reofferable_0))));
  return $Bool$pick$(($Bool$and$(_has_lease_0, (_expired_0 || _x_0))), {$: "Delivery.DropLease"}, {$: "Delivery.KeepLease"});
}

function $$$$047agent$045flow$045bend$047Delivery$advice_candidate$(_same_partition_0, _unleased_0, _has_unsuppressed_finding_0, _authority_owns_0) {
  return $Bool$and$(_same_partition_0, ($Bool$and$(_unleased_0, ($Bool$and$(_has_unsuppressed_finding_0, _authority_owns_0)))));
}

function $$$$047agent$045flow$045bend$047Delivery$notice_candidate$(_same_partition_0, _has_pending_0, _unleased_0, _authority_owns_0) {
  return $Bool$and$(_same_partition_0, ($Bool$and$(_has_pending_0, ($Bool$and$(_unleased_0, _authority_owns_0)))));
}

function $$$$047agent$045flow$045bend$047Delivery$reserve_candidate$(_unleased_0) {
  return _unleased_0;
}

function $$$$047agent$045flow$045bend$047Delivery$acknowledge$(_items_0, _any_expired_0) {
  return $Bool$pick$(($Nat$is_eq$(_items_0, 0)), {$: "Delivery.AckEmpty"}, ($Bool$pick$(_any_expired_0, {$: "Delivery.AckExpired"}, {$: "Delivery.AckReady"})));
}

function $$$$047agent$045flow$045bend$047Delivery$finalize$(_items_0, _all_acknowledged_0, _any_expired_0) {
  const _x_0 = ($Nat$is_eq$(_items_0, 0));
  const _x_1 = ($Bool$not$(_all_acknowledged_0));
  return $Bool$pick$((_x_0 || _x_1), {$: "Delivery.FinalEmpty"}, ($Bool$pick$(_any_expired_0, {$: "Delivery.FinalExpired"}, {$: "Delivery.FinalReady"})));
}

function $$$$047agent$045flow$045bend$047Delivery$finding_disposition$(_composed_0, _remaining_0) {
  return $Bool$pick$(_composed_0, {$: "Delivery.KeepForReoffer"}, ($Bool$pick$(($Nat$is_eq$(_remaining_0, 0)), {$: "Delivery.RetireAdvice"}, {$: "Delivery.KeepRemaining"})));
}

function $$$$047agent$045flow$045bend$047Delivery$release_unacknowledged$(_acknowledged_0) {
  return $Bool$not$(_acknowledged_0);
}

function $$$$047agent$045flow$045bend$047Delivery$existing_token_allowed$(_surface_0, _existing_token_0, _finish_permit_0) {
  if (_surface_0.$ === "Delivery.Stop") {
    const _x_0 = ($Bool$not$(_existing_token_0));
    return (_x_0 || _finish_permit_0);
  } else {
    return $Bool$not$(_existing_token_0);
  }
}

function $$$$047agent$045flow$045bend$047Delivery$submission_allowed_facts$(_live_0, _barrier_0, _deciding_0, _surface_0, _existing_token_0, _finish_permit_0) {
  if (_surface_0.$ === "Delivery.Background") {
    return $Bool$and$(_live_0, ($Bool$and$(($$$$047agent$045flow$045bend$047Delivery$existing_token_allowed$({$: "Delivery.Background"}, _existing_token_0, _finish_permit_0)), ($Bool$and$(($Bool$not$(_barrier_0)), ($Bool$not$(_deciding_0)))))));
  } else if (_surface_0.$ === "Delivery.Stop") {
    return $Bool$and$(_live_0, ($$$$047agent$045flow$045bend$047Delivery$existing_token_allowed$({$: "Delivery.Stop"}, _existing_token_0, _finish_permit_0)));
  } else {
    return $Bool$and$(_live_0, ($$$$047agent$045flow$045bend$047Delivery$existing_token_allowed$({$: "Delivery.Edit"}, _existing_token_0, _finish_permit_0)));
  }
}

function $$$$047agent$045flow$045bend$047Delivery$submission_allowed$(_round_0, _surface_0, _existing_token_0, _finish_permit_0) {
  const _live_0 = _round_0["active"];
  const _barrier_0 = _round_0["barrier"];
  const _deciding_0 = _round_0["deciding"];
  return $$$$047agent$045flow$045bend$047Delivery$submission_allowed_facts$(_live_0, _barrier_0, _deciding_0, _surface_0, _existing_token_0, _finish_permit_0);
}

function $$$$047agent$045flow$045bend$047Delivery$unreserved_stop_allowed_facts$(_live_0, _deciding_0) {
  return $Bool$and$(_live_0, ($Bool$not$(_deciding_0)));
}

function $$$$047agent$045flow$045bend$047Delivery$unreserved_stop_allowed$(_round_0) {
  const _live_0 = _round_0["active"];
  const _deciding_0 = _round_0["deciding"];
  return $$$$047agent$045flow$045bend$047Delivery$unreserved_stop_allowed_facts$(_live_0, _deciding_0);
}

function $$$$047agent$045flow$045bend$047Delivery$transition$(_current_0, _requested_0) {
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

function $$$$047agent$045flow$045bend$047Delivery$expired$(_phase_0, _elapsed_0, _lifetime_0) {
  if (_phase_0.$ === "Delivery.Authorized") {
    return $Nat$is_ge$(_elapsed_0, _lifetime_0);
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Delivery$background_reofferable$(_phase_0, _surface_0) {
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

function $$$$047agent$045flow$045bend$047Delivery$main$() {
  return $$$$047agent$045flow$045bend$047Delivery$transition$({$: "Delivery.Authorized"}, {$: "Delivery.Uncertain"});
}

function $$$$047agent$045flow$045bend$047SubmissionState$initial$() {
  return {$: "SubmissionState.State", "leases": {$: "Nil"}, "batches": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047SubmissionState$record_matches$(_advice_0, _fingerprint_0, _item_0) {
  const _candidate_advice_0 = _item_0["advice"];
  const _candidate_fingerprint_0 = _item_0["fingerprint"];
  return $Bool$and$(($Nat$is_eq$(_advice_0, _candidate_advice_0)), ($Nat$is_eq$(_fingerprint_0, _candidate_fingerprint_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$find_lease$(_advice_0, _fingerprint_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047SubmissionState$record_matches$(_advice_0, _fingerprint_0, _item_0)), {$: "Some", "value": _item_0}, ($$$$047agent$045flow$045bend$047SubmissionState$find_lease$(_advice_0, _fingerprint_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$keep_record$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$remove_record$(_advice_0, _fingerprint_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047SubmissionState$keep_record$(_item_0, ($$$$047agent$045flow$045bend$047SubmissionState$remove_record$(_advice_0, _fingerprint_0, _rest_0)), ($$$$047agent$045flow$045bend$047SubmissionState$record_matches$(_advice_0, _fingerprint_0, _item_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$batch_matches$(_advice_0, _token_0, _item_0) {
  const _candidate_advice_0 = _item_0["advice"];
  const _candidate_token_0 = _item_0["token"];
  return $Bool$and$(($Nat$is_eq$(_advice_0, _candidate_advice_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$has_batch$(_advice_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047SubmissionState$batch_matches$(_advice_0, _token_0, _item_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047SubmissionState$has_batch$(_advice_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_authorize$(_advice_0, _fingerprint_0, _round_0, _token_0, _previous_0, _result_0) {
  if (_result_0.$ === "Handoff.Granted") {
    const _current_0 = _result_0["state"];
    return {$: "Some", "value": {$: "SubmissionState.LeaseRecord", "advice": _advice_0, "fingerprint": _fingerprint_0, "current": _current_0, "previous": _previous_0}};
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_granted$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, _current_0) {
  if (_authorize_now_0) {
    return $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_authorize$(_advice_0, _fingerprint_0, _round_0, _token_0, _previous_0, ($$$$047agent$045flow$045bend$047Handoff$lease$authorize$(_current_0, _round_0, _token_0)));
  } else {
    return {$: "Some", "value": {$: "SubmissionState.LeaseRecord", "advice": _advice_0, "fingerprint": _fingerprint_0, "current": _current_0, "previous": _previous_0}};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_offered$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, _result_0) {
  if (_result_0.$ === "Handoff.Granted") {
    const _current_0 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_granted$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, _current_0);
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_from$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, _current_0, _previous_0) {
  return $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_offered$(_advice_0, _fingerprint_0, _round_0, _token_0, _authorize_now_0, _previous_0, ($$$$047agent$045flow$045bend$047Handoff$lease$offer$(_current_0, _round_0, _token_0, _surface_0, true)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$staged_lease$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, _previous_0) {
  if (_previous_0.$ === "None") {
    return $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_from$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, ($$$$047agent$045flow$045bend$047Handoff$lease$initial$(_fingerprint_0, _round_0)), {$: "None"});
  } else {
    const _t_0 = _previous_0["value"];
    const _current_0 = _t_0["current"];
    return $$$$047agent$045flow$045bend$047SubmissionState$staged_lease_from$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, _current_0, {$: "Some", "value": _current_0});
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$is_stop$(_surface_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$begin_one_result$(_state_0, _advice_0, _fingerprint_0, _result_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  if (_result_0.$ === "Some") {
    const _record_0 = _result_0["value"];
    return {$: "Some", "value": {$: "SubmissionState.State", "leases": {$: "Con", "head": _record_0, "tail": ($$$$047agent$045flow$045bend$047SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0))}, "batches": _batches_0}};
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$begin_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0) {
  const _leases_0 = _state_0["leases"];
  const __0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$begin_one_result$({$: "SubmissionState.State", "leases": _leases_0, "batches": __0}, _advice_0, _fingerprint_0, ($$$$047agent$045flow$045bend$047SubmissionState$staged_lease$(_advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0, ($$$$047agent$045flow$045bend$047SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)))));
}

function $$$$047agent$045flow$045bend$047SubmissionState$begin_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$begin_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$begin_many$($0, $1, $2, $3, $4, $5, $6) {
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
        $1 = ($$$$047agent$045flow$045bend$047SubmissionState$begin_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _surface_0, _authorize_now_0));
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

function $$$$047agent$045flow$045bend$047SubmissionState$begin_result$(_original_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0, _result_0) {
  if (_result_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _original_0};
  } else {
    const _t_0 = _result_0["value"];
    const _leases_0 = _t_0["leases"];
    const _batches_0 = _t_0["batches"];
    return {$: "SubmissionState.Granted", "state": {$: "SubmissionState.State", "leases": _leases_0, "batches": ($List$append$(_batches_0, {$: "Con", "head": {$: "SubmissionState.Batch", "advice": _advice_0, "group": _group_0, "round": _round_0, "token": _token_0, "surface": _surface_0, "phase": ($Bool$pick$(_authorize_now_0, {$: "Delivery.Authorized"}, {$: "Delivery.Reserved"})), "fingerprints": _fingerprints_0, "units": _units_0}, "tail": {$: "Nil"}}))}};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_advice_0, 0)), ($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047SubmissionState$has_batch$(_advice_0, _token_0, _batches_0)))), ($Nat$is_gt$(($List$length$(_fingerprints_0)), 0)))))))))))), ($$$$047agent$045flow$045bend$047SubmissionState$begin_result$({$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0}, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0, ($$$$047agent$045flow$045bend$047SubmissionState$begin_many$(_fingerprints_0, {$: "Some", "value": {$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0}}, _advice_0, _round_0, _token_0, _surface_0, _authorize_now_0)))), {$: "SubmissionState.Denied", "state": {$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0}});
}

function $$$$047agent$045flow$045bend$047SubmissionState$find_batch$(_advice_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047SubmissionState$batch_matches$(_advice_0, _token_0, _item_0)), {$: "Some", "value": _item_0}, ($$$$047agent$045flow$045bend$047SubmissionState$find_batch$(_advice_0, _token_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$keep_batch$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$remove_batch$(_advice_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047SubmissionState$keep_batch$(_item_0, ($$$$047agent$045flow$045bend$047SubmissionState$remove_batch$(_advice_0, _token_0, _rest_0)), ($$$$047agent$045flow$045bend$047SubmissionState$batch_matches$(_advice_0, _token_0, _item_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$phase_is$(_phase_0, _required_0) {
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

function $$$$047agent$045flow$045bend$047SubmissionState$batch_phase$(_batch_0, _phase_0) {
  const _advice_0 = _batch_0["advice"];
  const _group_0 = _batch_0["group"];
  const _round_0 = _batch_0["round"];
  const _token_0 = _batch_0["token"];
  const _surface_0 = _batch_0["surface"];
  const _fingerprints_0 = _batch_0["fingerprints"];
  const _units_0 = _batch_0["units"];
  return {$: "SubmissionState.Batch", "advice": _advice_0, "group": _group_0, "round": _round_0, "token": _token_0, "surface": _surface_0, "phase": _phase_0, "fingerprints": _fingerprints_0, "units": _units_0};
}

function $$$$047agent$045flow$045bend$047SubmissionState$lease_step$(_current_0, _round_0, _token_0, _target_0) {
  if (_target_0.$ === "Delivery.Authorized") {
    return $$$$047agent$045flow$045bend$047Handoff$lease$authorize$(_current_0, _round_0, _token_0);
  } else if (_target_0.$ === "Delivery.Submitted") {
    return $$$$047agent$045flow$045bend$047Handoff$lease$terminal$(_current_0, _round_0, _token_0, true);
  } else if (_target_0.$ === "Delivery.Uncertain") {
    return $$$$047agent$045flow$045bend$047Handoff$lease$terminal$(_current_0, _round_0, _token_0, false);
  } else {
    return {$: "Handoff.Denied", "state": _current_0};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$step_record_result$(_record_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047SubmissionState$step_record$(_record_0, _round_0, _token_0, _target_0) {
  const __0 = _record_0["advice"];
  const __1 = _record_0["fingerprint"];
  const _current_0 = _record_0["current"];
  const __2 = _record_0["previous"];
  return $$$$047agent$045flow$045bend$047SubmissionState$step_record_result$({$: "SubmissionState.LeaseRecord", "advice": __0, "fingerprint": __1, "current": _current_0, "previous": __2}, ($$$$047agent$045flow$045bend$047SubmissionState$lease_step$(_current_0, _round_0, _token_0, _target_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$update_one_result$(_state_0, _advice_0, _fingerprint_0, _result_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  if (_result_0.$ === "Some") {
    const _record_0 = _result_0["value"];
    return {$: "Some", "value": {$: "SubmissionState.State", "leases": {$: "Con", "head": _record_0, "tail": ($$$$047agent$045flow$045bend$047SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0))}, "batches": _batches_0}};
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$update_one_found$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "None"};
  } else {
    const _record_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$update_one_result$(_state_0, _advice_0, _fingerprint_0, ($$$$047agent$045flow$045bend$047SubmissionState$step_record$(_record_0, _round_0, _token_0, _target_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$update_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0) {
  const _leases_0 = _state_0["leases"];
  const __0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$update_one_found$({$: "SubmissionState.State", "leases": _leases_0, "batches": __0}, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0, ($$$$047agent$045flow$045bend$047SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$update_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$update_one$(_state_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$update_many$($0, $1, $2, $3, $4, $5) {
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
        $1 = ($$$$047agent$045flow$045bend$047SubmissionState$update_one_if$(_current_0, _advice_0, _fingerprint_0, _round_0, _token_0, _target_0));
        $2 = _advice_0;
        $3 = _round_0;
        $4 = _token_0;
        $5 = _target_0;
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$transition_success$(_state_0, _batch_0, _target_0) {
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
  return {$: "SubmissionState.Granted", "state": {$: "SubmissionState.State", "leases": _leases_0, "batches": ($List$append$(($$$$047agent$045flow$045bend$047SubmissionState$remove_batch$(_advice_0, _token_0, _batches_0)), {$: "Con", "head": ($$$$047agent$045flow$045bend$047SubmissionState$batch_phase$({$: "SubmissionState.Batch", "advice": _advice_0, "group": __0, "round": __1, "token": _token_0, "surface": __2, "phase": __3, "fingerprints": __4, "units": __5}, _target_0)), "tail": {$: "Nil"}}))}};
}

function $$$$047agent$045flow$045bend$047SubmissionState$transition_result$(_original_0, _batch_0, _target_0, _result_0) {
  if (_result_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _original_0};
  } else {
    const _state_0 = _result_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$transition_success$(_state_0, _batch_0, _target_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$transition_found$(_state_0, _batch_0, _target_0, _required_0) {
  const _advice_0 = _batch_0["advice"];
  const __0 = _batch_0["group"];
  const _round_0 = _batch_0["round"];
  const _token_0 = _batch_0["token"];
  const __1 = _batch_0["surface"];
  const _phase_0 = _batch_0["phase"];
  const _fingerprints_0 = _batch_0["fingerprints"];
  const __2 = _batch_0["units"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047SubmissionState$phase_is$(_phase_0, _required_0)), ($$$$047agent$045flow$045bend$047SubmissionState$transition_result$(_state_0, {$: "SubmissionState.Batch", "advice": _advice_0, "group": __0, "round": _round_0, "token": _token_0, "surface": __1, "phase": _phase_0, "fingerprints": _fingerprints_0, "units": __2}, _target_0, ($$$$047agent$045flow$045bend$047SubmissionState$update_many$(_fingerprints_0, {$: "Some", "value": _state_0}, _advice_0, _round_0, _token_0, _target_0)))), {$: "SubmissionState.Denied", "state": _state_0});
}

function $$$$047agent$045flow$045bend$047SubmissionState$transition_lookup$(_state_0, _target_0, _required_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _state_0};
  } else {
    const _batch_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$transition_found$(_state_0, _batch_0, _target_0, _required_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$transition$(_state_0, _advice_0, _token_0, _target_0, _required_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$transition_lookup$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, _target_0, _required_0, ($$$$047agent$045flow$045bend$047SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$authorize$(_state_0, _advice_0, _token_0) {
  return $$$$047agent$045flow$045bend$047SubmissionState$transition$(_state_0, _advice_0, _token_0, {$: "Delivery.Authorized"}, {$: "Delivery.Reserved"});
}

function $$$$047agent$045flow$045bend$047SubmissionState$terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  if (_certain_0) {
    return $$$$047agent$045flow$045bend$047SubmissionState$transition$(_state_0, _advice_0, _token_0, {$: "Delivery.Submitted"}, {$: "Delivery.Authorized"});
  } else {
    return $$$$047agent$045flow$045bend$047SubmissionState$transition$(_state_0, _advice_0, _token_0, {$: "Delivery.Uncertain"}, {$: "Delivery.Authorized"});
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$stop_surface$(_surface_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$stop_token_advices$(_token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _candidate_0 = _t_0["token"];
    const _surface_0 = _t_0["surface"];
    const _rest_0 = _items_0["tail"];
    const _tail_0 = ($$$$047agent$045flow$045bend$047SubmissionState$stop_token_advices$(_token_0, _rest_0));
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_token_0, _candidate_0)), ($$$$047agent$045flow$045bend$047SubmissionState$stop_surface$(_surface_0)))), {$: "Con", "head": _advice_0, "tail": _tail_0}, _tail_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$terminal_one_result$(_result_0) {
  if (_result_0.$ === "SubmissionState.Granted") {
    const _next_0 = _result_0["state"];
    return {$: "Some", "value": _next_0};
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$terminal_one$(_current_0, _advice_0, _token_0, _certain_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$terminal_one_result$(($$$$047agent$045flow$045bend$047SubmissionState$terminal$(_state_0, _advice_0, _token_0, _certain_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$terminal_each$($0, $1, $2, $3) {
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
        $1 = ($$$$047agent$045flow$045bend$047SubmissionState$terminal_one$(_current_0, _advice_0, _token_0, _certain_0));
        $2 = _token_0;
        $3 = _certain_0;
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$terminal_stop_result$(_original_0, _result_0) {
  if (_result_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _original_0};
  } else {
    const _state_0 = _result_0["value"];
    return {$: "SubmissionState.Granted", "state": _state_0};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$terminal_stop_token$(_state_0, _token_0, _certain_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  const _advices_0 = ($$$$047agent$045flow$045bend$047SubmissionState$stop_token_advices$(_token_0, _batches_0));
  return $Bool$pick$(($Nat$is_gt$(($List$length$(_advices_0)), 0)), ($$$$047agent$045flow$045bend$047SubmissionState$terminal_stop_result$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, ($$$$047agent$045flow$045bend$047SubmissionState$terminal_each$(_advices_0, {$: "Some", "value": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}}, _token_0, _certain_0)))), {$: "SubmissionState.Denied", "state": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}});
}

function $$$$047agent$045flow$045bend$047SubmissionState$authorize_one$(_current_0, _advice_0, _token_0) {
  if (_current_0.$ === "None") {
    return {$: "None"};
  } else {
    const _state_0 = _current_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$terminal_one_result$(($$$$047agent$045flow$045bend$047SubmissionState$authorize$(_state_0, _advice_0, _token_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$authorize_each$($0, $1, $2) {
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
        $1 = ($$$$047agent$045flow$045bend$047SubmissionState$authorize_one$(_current_0, _advice_0, _token_0));
        $2 = _token_0;
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$authorize_stop_token$(_state_0, _token_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  const _advices_0 = ($$$$047agent$045flow$045bend$047SubmissionState$stop_token_advices$(_token_0, _batches_0));
  return $Bool$pick$(($Nat$is_gt$(($List$length$(_advices_0)), 0)), ($$$$047agent$045flow$045bend$047SubmissionState$terminal_stop_result$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, ($$$$047agent$045flow$045bend$047SubmissionState$authorize_each$(_advices_0, {$: "Some", "value": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}}, _token_0)))), {$: "SubmissionState.Denied", "state": {$: "SubmissionState.State", "leases": __0, "batches": _batches_0}});
}

function $$$$047agent$045flow$045bend$047SubmissionState$restore_record$(_record_0) {
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

function $$$$047agent$045flow$045bend$047SubmissionState$restore_previous$(_advice_0, _fingerprint_0, _leases_0, _batches_0, _previous_0) {
  if (_previous_0.$ === "None") {
    return {$: "SubmissionState.State", "leases": ($$$$047agent$045flow$045bend$047SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0)), "batches": _batches_0};
  } else {
    const _record_0 = _previous_0["value"];
    return {$: "SubmissionState.State", "leases": {$: "Con", "head": _record_0, "tail": ($$$$047agent$045flow$045bend$047SubmissionState$remove_record$(_advice_0, _fingerprint_0, _leases_0))}, "batches": _batches_0};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$restore_found$(_state_0, _advice_0, _fingerprint_0, _found_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  if (_found_0.$ === "None") {
    return {$: "SubmissionState.State", "leases": _leases_0, "batches": _batches_0};
  } else {
    const _record_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$restore_previous$(_advice_0, _fingerprint_0, _leases_0, _batches_0, ($$$$047agent$045flow$045bend$047SubmissionState$restore_record$(_record_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$restore_one$(_state_0, _advice_0, _fingerprint_0) {
  const _leases_0 = _state_0["leases"];
  const __0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$restore_found$({$: "SubmissionState.State", "leases": _leases_0, "batches": __0}, _advice_0, _fingerprint_0, ($$$$047agent$045flow$045bend$047SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$restore_many$($0, $1, $2) {
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
        $1 = ($$$$047agent$045flow$045bend$047SubmissionState$restore_one$(_state_0, _advice_0, _fingerprint_0));
        $2 = _advice_0;
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$without_batch$(_state_0, _advice_0, _token_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return {$: "SubmissionState.State", "leases": _leases_0, "batches": ($$$$047agent$045flow$045bend$047SubmissionState$remove_batch$(_advice_0, _token_0, _batches_0))};
}

function $$$$047agent$045flow$045bend$047SubmissionState$release_found$(_state_0, _batch_0) {
  const _advice_0 = _batch_0["advice"];
  const _token_0 = _batch_0["token"];
  const _phase_0 = _batch_0["phase"];
  const _fingerprints_0 = _batch_0["fingerprints"];
  const _x_0 = ($$$$047agent$045flow$045bend$047SubmissionState$phase_is$(_phase_0, {$: "Delivery.Reserved"}));
  const _x_1 = ($$$$047agent$045flow$045bend$047SubmissionState$phase_is$(_phase_0, {$: "Delivery.Authorized"}));
  return $Bool$pick$((_x_0 || _x_1), {$: "SubmissionState.Granted", "state": ($$$$047agent$045flow$045bend$047SubmissionState$without_batch$(($$$$047agent$045flow$045bend$047SubmissionState$restore_many$(_fingerprints_0, _state_0, _advice_0)), _advice_0, _token_0))}, {$: "SubmissionState.Denied", "state": _state_0});
}

function $$$$047agent$045flow$045bend$047SubmissionState$release_lookup$(_state_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "SubmissionState.Denied", "state": _state_0};
  } else {
    const _batch_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047SubmissionState$release_found$(_state_0, _batch_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$release_lookup$({$: "SubmissionState.State", "leases": __0, "batches": _batches_0}, ($$$$047agent$045flow$045bend$047SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$remove_advice_leases$(_advice_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["advice"];
    const __0 = _t_0["fingerprint"];
    const __1 = _t_0["current"];
    const __2 = _t_0["previous"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047SubmissionState$keep_record$({$: "SubmissionState.LeaseRecord", "advice": _candidate_0, "fingerprint": __0, "current": __1, "previous": __2}, ($$$$047agent$045flow$045bend$047SubmissionState$remove_advice_leases$(_advice_0, _rest_0)), ($Nat$is_eq$(_advice_0, _candidate_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$remove_advice_batches$(_advice_0, _items_0) {
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
    return $$$$047agent$045flow$045bend$047SubmissionState$keep_batch$({$: "SubmissionState.Batch", "advice": _candidate_0, "group": __0, "round": __1, "token": __2, "surface": __3, "phase": __4, "fingerprints": __5, "units": __6}, ($$$$047agent$045flow$045bend$047SubmissionState$remove_advice_batches$(_advice_0, _rest_0)), ($Nat$is_eq$(_advice_0, _candidate_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$forget$(_state_0, _advice_0) {
  const _leases_0 = _state_0["leases"];
  const _batches_0 = _state_0["batches"];
  return {$: "SubmissionState.State", "leases": ($$$$047agent$045flow$045bend$047SubmissionState$remove_advice_leases$(_advice_0, _leases_0)), "batches": ($$$$047agent$045flow$045bend$047SubmissionState$remove_advice_batches$(_advice_0, _batches_0))};
}

function $$$$047agent$045flow$045bend$047SubmissionState$suppresses_found$(_round_0, _surface_0, _found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _current_0 = _t_0["current"];
    return $$$$047agent$045flow$045bend$047Handoff$lease$suppresses$(_current_0, _round_0, _surface_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$suppresses$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const _leases_0 = _state_0["leases"];
  return $$$$047agent$045flow$045bend$047SubmissionState$suppresses_found$(_round_0, _surface_0, ($$$$047agent$045flow$045bend$047SubmissionState$find_lease$(_advice_0, _fingerprint_0, _leases_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$delivery_surface$(_surface_0) {
  if (_surface_0.$ === "Handoff.Edit") {
    return {$: "Delivery.Edit"};
  } else if (_surface_0.$ === "Handoff.Background") {
    return {$: "Delivery.Background"};
  } else {
    return {$: "Delivery.Stop"};
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$reofferable_found$(_found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _surface_0 = _t_0["surface"];
    const _phase_0 = _t_0["phase"];
    return $$$$047agent$045flow$045bend$047Delivery$background_reofferable$(_phase_0, ($$$$047agent$045flow$045bend$047SubmissionState$delivery_surface$(_surface_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$background_reofferable$(_state_0, _advice_0, _token_0) {
  const _batches_0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$reofferable_found$(($$$$047agent$045flow$045bend$047SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$expired_found$(_elapsed_0, _lifetime_0, _found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _phase_0 = _t_0["phase"];
    return $$$$047agent$045flow$045bend$047Delivery$expired$(_phase_0, _elapsed_0, _lifetime_0);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$expired$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const _batches_0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$expired_found$(_elapsed_0, _lifetime_0, ($$$$047agent$045flow$045bend$047SubmissionState$find_batch$(_advice_0, _token_0, _batches_0)));
}

function $$$$047agent$045flow$045bend$047SubmissionState$token_ready_items$(_group_0, _round_0, _token_0, _items_0) {
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
    const _x_1 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($$$$047agent$045flow$045bend$047SubmissionState$phase_is$(_phase_0, {$: "Delivery.Reserved"}))))));
    return $Bool$and$((_x_0 || _x_1), ($$$$047agent$045flow$045bend$047SubmissionState$token_ready_items$(_group_0, _round_0, _token_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$token_exists$(_token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["token"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_token_0, _candidate_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047SubmissionState$token_exists$(_token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$token_exists_state$(_state_0, _token_0) {
  const _batches_0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$token_exists$(_token_0, _batches_0);
}

function $$$$047agent$045flow$045bend$047SubmissionState$token_units_keep$(_units_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return $List$append$(_units_0, _tail_0);
  } else {
    return _tail_0;
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$token_units$(_token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["token"];
    const _units_0 = _t_0["units"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047SubmissionState$token_units_keep$(_units_0, ($$$$047agent$045flow$045bend$047SubmissionState$token_units$(_token_0, _rest_0)), ($Nat$is_eq$(_token_0, _candidate_0)));
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$same_units$(_left_0, _right_0) {
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
      return $Bool$and$(($Nat$is_eq$(_left_head_0, _right_head_0)), ($$$$047agent$045flow$045bend$047SubmissionState$same_units$(_left_rest_0, _right_rest_0)));
    } else {
      return false;
    }
  }
}

function $$$$047agent$045flow$045bend$047SubmissionState$token_units_match$(_state_0, _token_0, _selected_0) {
  const _batches_0 = _state_0["batches"];
  return $$$$047agent$045flow$045bend$047SubmissionState$same_units$(($$$$047agent$045flow$045bend$047SubmissionState$token_units$(_token_0, _batches_0)), _selected_0);
}

function $$$$047agent$045flow$045bend$047SubmissionState$token_ready$(_state_0, _group_0, _round_0, _token_0, _selected_0) {
  const _batches_0 = _state_0["batches"];
  return $Bool$and$(($$$$047agent$045flow$045bend$047SubmissionState$token_exists$(_token_0, _batches_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047SubmissionState$token_ready_items$(_group_0, _round_0, _token_0, _batches_0)), ($$$$047agent$045flow$045bend$047SubmissionState$same_units$(($$$$047agent$045flow$045bend$047SubmissionState$token_units$(_token_0, _batches_0)), _selected_0)))));
}

function $$$$047agent$045flow$045bend$047SubmissionState$main$() {
  return $$$$047agent$045flow$045bend$047SubmissionState$begin$(($$$$047agent$045flow$045bend$047SubmissionState$initial$()), 1, 1, 1, 1, {$: "Handoff.Background"}, true, {$: "Con", "head": 1, "tail": {$: "Nil"}}, {$: "Nil"});
}

function $$$$047agent$045flow$045bend$047DeliveryState$initial$() {
  return {$: "DeliveryState.State", "slots": {$: "Nil"}, "counters": {$: "Nil"}, "submissions": ($$$$047agent$045flow$045bend$047SubmissionState$initial$())};
}

function $$$$047agent$045flow$045bend$047DeliveryState$count$(_group_0, _round_0, _counters_0) {
  if (_counters_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _counters_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _used_0 = _t_0["used"];
    const _rest_0 = _counters_0["tail"];
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_round_0, _candidate_round_0)))), _used_0, ($$$$047agent$045flow$045bend$047DeliveryState$count$(_group_0, _round_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$has_group$(_group_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Nat$is_eq$(_group_0, _candidate_group_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$has_group$(_group_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$keep_counter$(_item_0, _rest_0, _remove_0) {
  if (_remove_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _rest_0};
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$without_counter$(_group_0, _round_0, _counters_0) {
  if (_counters_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _counters_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const __0 = _t_0["used"];
    const _rest_0 = _counters_0["tail"];
    return $$$$047agent$045flow$045bend$047DeliveryState$keep_counter$({$: "DeliveryState.Counter", "group": _candidate_group_0, "round": _candidate_round_0, "used": __0}, ($$$$047agent$045flow$045bend$047DeliveryState$without_counter$(_group_0, _round_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_round_0, _candidate_round_0)))));
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$retire_round$(_state_0, _group_0, _round_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return {$: "DeliveryState.State", "slots": _slots_0, "counters": ($$$$047agent$045flow$045bend$047DeliveryState$without_counter$(_group_0, _round_0, _counters_0)), "submissions": _submissions_0};
}

function $$$$047agent$045flow$045bend$047DeliveryState$set_count$(_state_0, _group_0, _round_0, _used_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return {$: "DeliveryState.State", "slots": _slots_0, "counters": {$: "Con", "head": {$: "DeliveryState.Counter", "group": _group_0, "round": _round_0, "used": _used_0}, "tail": ($$$$047agent$045flow$045bend$047DeliveryState$without_counter$(_group_0, _round_0, _counters_0))}, "submissions": _submissions_0};
}

function $$$$047agent$045flow$045bend$047DeliveryState$same_selected$(_left_0, _right_0) {
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
      return $Bool$and$(($Nat$is_eq$(_head_0, _other_0)), ($$$$047agent$045flow$045bend$047DeliveryState$same_selected$(_tail_0, _rest_0)));
    }
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$reserve$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  const _used_0 = ($$$$047agent$045flow$045bend$047DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), ($Bool$and$(($Nat$is_gt$(_attempt_0, 0)), ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047DeliveryState$has_group$(_group_0, _slots_0)))), ($Bool$and$((_used_0 < 4), ($Nat$is_gt$(($List$length$(_selected_0)), 0)))))))))))))), {$: "DeliveryState.Granted", "state": ($$$$047agent$045flow$045bend$047DeliveryState$set_count$({$: "DeliveryState.State", "slots": {$: "Con", "head": {$: "DeliveryState.Slot", "group": _group_0, "round": _round_0, "attempt": _attempt_0, "token": _token_0, "selected": _selected_0, "phase": {$: "DeliveryState.Reserved"}}, "tail": _slots_0}, "counters": _counters_0, "submissions": _submissions_0}, _group_0, _round_0, nat_chk(_used_0 + 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": _submissions_0}});
}

function $$$$047agent$045flow$045bend$047DeliveryState$slot_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _candidate_attempt_0 = _t_0["attempt"];
    const _candidate_token_0 = _t_0["token"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0))))))));
    const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$slot_owned$(_group_0, _round_0, _attempt_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$reserved_owned$($0, $1, $2, $3, $4) {
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
          const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$reserved_owned$(_group_0, _round_0, _attempt_0, _token_0, _rest_0));
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

function $$$$047agent$045flow$045bend$047DeliveryState$keep_slot$(_item_0, _rest_0, _remove_0) {
  if (_remove_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _rest_0};
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0) {
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
    return $$$$047agent$045flow$045bend$047DeliveryState$keep_slot$({$: "DeliveryState.Slot", "group": _candidate_group_0, "round": _candidate_round_0, "attempt": _candidate_attempt_0, "token": _candidate_token_0, "selected": __0, "phase": __1}, ($$$$047agent$045flow$045bend$047DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)))))))));
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  const _used_0 = ($$$$047agent$045flow$045bend$047DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047DeliveryState$reserved_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), ($Nat$is_gt$(_used_0, 0)))), {$: "DeliveryState.Granted", "state": ($$$$047agent$045flow$045bend$047DeliveryState$set_count$({$: "DeliveryState.State", "slots": ($$$$047agent$045flow$045bend$047DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}, _group_0, _round_0, (_used_0 < 1 ? 0 : _used_0 - 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": _submissions_0}});
}

function $$$$047agent$045flow$045bend$047DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _items_0) {
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
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)))))))), {$: "Con", "head": {$: "DeliveryState.Slot", "group": _group_0, "round": _round_0, "attempt": _attempt_0, "token": _token_0, "selected": _selected_0, "phase": _phase_0}, "tail": _rest_0}, {$: "Con", "head": {$: "DeliveryState.Slot", "group": _candidate_group_0, "round": _candidate_round_0, "attempt": _candidate_attempt_0, "token": _candidate_token_0, "selected": __0, "phase": __1}, "tail": ($$$$047agent$045flow$045bend$047DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _rest_0))});
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$authorizable$($0, $1, $2, $3, $4, $5) {
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
          const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_token_0)), ($$$$047agent$045flow$045bend$047DeliveryState$same_selected$(_selected_0, _candidate_selected_0))))))))));
          const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$authorizable$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _rest_0));
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

function $$$$047agent$045flow$045bend$047DeliveryState$authorize_result$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _result_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const __0 = _state_0["submissions"];
  if (_result_0.$ === "SubmissionState.Denied") {
    return {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": __0}};
  } else {
    const _submissions_0 = _result_0["state"];
    return {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($$$$047agent$045flow$045bend$047DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Authorized"}, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}};
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047DeliveryState$authorizable$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _slots_0)), ($$$$047agent$045flow$045bend$047DeliveryState$authorize_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, ($$$$047agent$045flow$045bend$047SubmissionState$authorize_stop_token$(_submissions_0, _token_0)))), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}});
}

function $$$$047agent$045flow$045bend$047DeliveryState$terminal_owned$($0, $1, $2, $3, $4, $5) {
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
          const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_token_0)), ($$$$047agent$045flow$045bend$047DeliveryState$same_selected$(_selected_0, _candidate_selected_0))))))))));
          const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$terminal_owned$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _rest_0));
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

function $$$$047agent$045flow$045bend$047DeliveryState$terminal_submission_result$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _result_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const __0 = _state_0["submissions"];
  if (_result_0.$ === "SubmissionState.Denied") {
    return {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": __0}};
  } else {
    const _submissions_0 = _result_0["state"];
    return {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($$$$047agent$045flow$045bend$047DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}};
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$terminal_owned_result$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0) {
  const __0 = _state_0["slots"];
  const __1 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  if (_phase_0.$ === "DeliveryState.Submitted") {
    return $Bool$pick$(($$$$047agent$045flow$045bend$047SubmissionState$token_units_match$(_submissions_0, _token_0, _selected_0)), ($$$$047agent$045flow$045bend$047DeliveryState$terminal_submission_result$({$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Submitted"}, ($$$$047agent$045flow$045bend$047SubmissionState$terminal_stop_token$(_submissions_0, _token_0, true)))), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}});
  } else if (_phase_0.$ === "DeliveryState.Uncertain") {
    return $Bool$pick$(($$$$047agent$045flow$045bend$047SubmissionState$token_units_match$(_submissions_0, _token_0, _selected_0)), ($$$$047agent$045flow$045bend$047DeliveryState$terminal_submission_result$({$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Uncertain"}, ($$$$047agent$045flow$045bend$047SubmissionState$terminal_stop_token$(_submissions_0, _token_0, false)))), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": __0, "counters": __1, "submissions": _submissions_0}});
  } else {
    return {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($$$$047agent$045flow$045bend$047DeliveryState$update_slot$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0, __0)), "counters": __1, "submissions": _submissions_0}};
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$terminal$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const __1 = _state_0["submissions"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047DeliveryState$terminal_owned$(_group_0, _round_0, _attempt_0, _token_0, _selected_0, _slots_0)), ($$$$047agent$045flow$045bend$047DeliveryState$terminal_owned_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": __1}, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": __1}});
}

function $$$$047agent$045flow$045bend$047DeliveryState$durable_phase$(_phase_0, _token_0, _submissions_0) {
  if (_phase_0.$ === "DeliveryState.Submitted") {
    return true;
  } else if (_phase_0.$ === "DeliveryState.Uncertain") {
    return true;
  } else if (_phase_0.$ === "DeliveryState.Failed") {
    return $Bool$not$(($$$$047agent$045flow$045bend$047SubmissionState$token_exists_state$(_submissions_0, _token_0)));
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0, _submissions_0) {
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
    const _x_0 = ($Bool$and$(($$$$047agent$045flow$045bend$047DeliveryState$durable_phase$(_phase_0, _token_0, _submissions_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_attempt_0, _candidate_attempt_0)), ($Nat$is_eq$(_token_0, _candidate_token_0))))))))));
    const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _rest_0, _submissions_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047DeliveryState$durable_owned$(_group_0, _round_0, _attempt_0, _token_0, _slots_0, _submissions_0)), {$: "DeliveryState.Granted", "state": {$: "DeliveryState.State", "slots": ($$$$047agent$045flow$045bend$047DeliveryState$without_slot$(_group_0, _round_0, _attempt_0, _token_0, _slots_0)), "counters": _counters_0, "submissions": _submissions_0}}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": _submissions_0}});
}

function $$$$047agent$045flow$045bend$047DeliveryState$consume$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const __1 = _state_0["submissions"];
  const _used_0 = ($$$$047agent$045flow$045bend$047DeliveryState$count$(_group_0, _round_0, _counters_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_round_0, 0)), (_used_0 < 4))))), {$: "DeliveryState.Granted", "state": ($$$$047agent$045flow$045bend$047DeliveryState$set_count$({$: "DeliveryState.State", "slots": __0, "counters": _counters_0, "submissions": __1}, _group_0, _round_0, nat_chk(_used_0 + 1)))}, {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": __0, "counters": _counters_0, "submissions": __1}});
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_result$(_state_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047DeliveryState$staging_locked_phase$(_phase_0) {
  if (_phase_0.$ === "DeliveryState.Reserved") {
    return false;
  } else {
    return true;
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$staging_locked$(_token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_0 = _t_0["token"];
    const _phase_0 = _t_0["phase"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_0)), ($$$$047agent$045flow$045bend$047DeliveryState$staging_locked_phase$(_phase_0))));
    const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$staging_locked$(_token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047DeliveryState$staging_locked$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($$$$047agent$045flow$045bend$047SubmissionState$begin$(_submissions_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0)))));
}

function $$$$047agent$045flow$045bend$047DeliveryState$slot_token$(_token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_0 = _t_0["token"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Nat$is_eq$(_token_0, _candidate_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$slot_token$(_token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$authorized_slot_token$($0, $1) {
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
          const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$authorized_slot_token$(_token_0, _rest_0));
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

function $$$$047agent$045flow$045bend$047DeliveryState$protected_advice_items$(_advice_0, _items_0, _slots_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_0 = _t_0["advice"];
    const _token_0 = _t_0["token"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_advice_0, _candidate_0)), ($$$$047agent$045flow$045bend$047DeliveryState$authorized_slot_token$(_token_0, _slots_0))));
    const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$protected_advice_items$(_advice_0, _rest_0, _slots_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$protected_advice$(_state_0, _advice_0) {
  const _slots_0 = _state_0["slots"];
  const _t_0 = _state_0["submissions"];
  const _batches_0 = _t_0["batches"];
  return $$$$047agent$045flow$045bend$047DeliveryState$protected_advice_items$(_advice_0, _batches_0, _slots_0);
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_authorize$(_state_0, _advice_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047DeliveryState$slot_token$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($$$$047agent$045flow$045bend$047SubmissionState$authorize$(_submissions_0, _advice_0, _token_0)))));
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047DeliveryState$slot_token$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($$$$047agent$045flow$045bend$047SubmissionState$terminal$(_submissions_0, _advice_0, _token_0, _certain_0)))));
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_release$(_state_0, _advice_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  const __0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047DeliveryState$authorized_slot_token$(_token_0, _slots_0)), {$: "DeliveryState.Denied", "state": {$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_result$({$: "DeliveryState.State", "slots": _slots_0, "counters": __0, "submissions": _submissions_0}, ($$$$047agent$045flow$045bend$047SubmissionState$release$(_submissions_0, _advice_0, _token_0)))));
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_forget$(_state_0, _advice_0) {
  const _slots_0 = _state_0["slots"];
  const _counters_0 = _state_0["counters"];
  const _submissions_0 = _state_0["submissions"];
  return {$: "DeliveryState.State", "slots": _slots_0, "counters": _counters_0, "submissions": ($$$$047agent$045flow$045bend$047SubmissionState$forget$(_submissions_0, _advice_0))};
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_suppresses$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const _submissions_0 = _state_0["submissions"];
  return $$$$047agent$045flow$045bend$047SubmissionState$suppresses$(_submissions_0, _advice_0, _fingerprint_0, _round_0, _surface_0);
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_reofferable$(_state_0, _advice_0, _token_0) {
  const _submissions_0 = _state_0["submissions"];
  return $$$$047agent$045flow$045bend$047SubmissionState$background_reofferable$(_submissions_0, _advice_0, _token_0);
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_expired$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const _submissions_0 = _state_0["submissions"];
  return $$$$047agent$045flow$045bend$047SubmissionState$expired$(_submissions_0, _advice_0, _token_0, _elapsed_0, _lifetime_0);
}

function $$$$047agent$045flow$045bend$047DeliveryState$phase_is_reserved$(_phase_0) {
  if (_phase_0.$ === "DeliveryState.Reserved") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$reserved_token$(_group_0, _round_0, _token_0, _slots_0) {
  if (_slots_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _slots_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_round_0 = _t_0["round"];
    const _candidate_token_0 = _t_0["token"];
    const _phase_0 = _t_0["phase"];
    const _rest_0 = _slots_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Bool$and$(($Nat$is_eq$(_round_0, _candidate_round_0)), ($Bool$and$(($Nat$is_eq$(_token_0, _candidate_token_0)), ($$$$047agent$045flow$045bend$047DeliveryState$phase_is_reserved$(_phase_0))))))));
    const _x_1 = ($$$$047agent$045flow$045bend$047DeliveryState$reserved_token$(_group_0, _round_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_reservation$(_state_0, _group_0, _round_0, _token_0) {
  const _slots_0 = _state_0["slots"];
  return $$$$047agent$045flow$045bend$047DeliveryState$reserved_token$(_group_0, _round_0, _token_0, _slots_0);
}

function $$$$047agent$045flow$045bend$047DeliveryState$submission_ready$(_state_0, _group_0, _round_0, _token_0, _selected_0) {
  const _submissions_0 = _state_0["submissions"];
  return $$$$047agent$045flow$045bend$047SubmissionState$token_ready$(_submissions_0, _group_0, _round_0, _token_0, _selected_0);
}

function $$$$047agent$045flow$045bend$047DeliveryState$main$() {
  return $$$$047agent$045flow$045bend$047DeliveryState$reserve$(($$$$047agent$045flow$045bend$047DeliveryState$initial$()), 1, 1, 1, 1, {$: "Con", "head": 1, "tail": {$: "Nil"}});
}

function $$$$047agent$045flow$045bend$047RevisionState$initial$() {
  return {$: "RevisionState.State", "entries": {$: "Nil"}, "next_generation": 1};
}

function $$$$047agent$045flow$045bend$047RevisionState$same_subject$(_subject_0, _entry_0) {
  const _candidate_0 = _entry_0["subject"];
  return $Nat$is_eq$(_subject_0, _candidate_0);
}

function $$$$047agent$045flow$045bend$047RevisionState$find$(_subject_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _entry_0 = _entries_0["head"];
    const _rest_0 = _entries_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047RevisionState$same_subject$(_subject_0, _entry_0)), {$: "Some", "value": _entry_0}, ($$$$047agent$045flow$045bend$047RevisionState$find$(_subject_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$keep_entry$(_entry_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _entry_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$without$(_subject_0, _entries_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _entries_0["head"];
    const _rest_0 = _entries_0["tail"];
    return $$$$047agent$045flow$045bend$047RevisionState$keep_entry$(_entry_0, ($$$$047agent$045flow$045bend$047RevisionState$without$(_subject_0, _rest_0)), ($$$$047agent$045flow$045bend$047RevisionState$same_subject$(_subject_0, _entry_0)));
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$register_found$(_state_0, _subject_0, _input_0, _add_member_0, _found_0) {
  const _entries_0 = _state_0["entries"];
  const _next_generation_0 = _state_0["next_generation"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _old_input_0 = _t_0["input"];
    const _generation_0 = _t_0["generation"];
    const _members_0 = _t_0["members"];
    const _updated_0 = ($Bool$pick$(_add_member_0, nat_chk(_members_0 + 1), _members_0));
    return $Bool$pick$(($Nat$is_eq$(_old_input_0, _input_0)), {$: "RevisionState.Reused", "state": {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _generation_0, "members": _updated_0}, "tail": ($$$$047agent$045flow$045bend$047RevisionState$without$(_subject_0, _entries_0))}, "next_generation": _next_generation_0}, "generation": _generation_0}, {$: "RevisionState.Replaced", "state": {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _next_generation_0, "members": 1}, "tail": ($$$$047agent$045flow$045bend$047RevisionState$without$(_subject_0, _entries_0))}, "next_generation": nat_chk(_next_generation_0 + 1)}, "generation": _next_generation_0});
  } else {
    return {$: "RevisionState.Replaced", "state": {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _next_generation_0, "members": 1}, "tail": _entries_0}, "next_generation": nat_chk(_next_generation_0 + 1)}, "generation": _next_generation_0};
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$register$(_state_0, _subject_0, _input_0, _add_member_0) {
  const _entries_0 = _state_0["entries"];
  const __0 = _state_0["next_generation"];
  return $$$$047agent$045flow$045bend$047RevisionState$register_found$({$: "RevisionState.State", "entries": _entries_0, "next_generation": __0}, _subject_0, _input_0, _add_member_0, ($$$$047agent$045flow$045bend$047RevisionState$find$(_subject_0, _entries_0)));
}

function $$$$047agent$045flow$045bend$047RevisionState$release_found$(_state_0, _subject_0, _generation_0, _found_0) {
  const _entries_0 = _state_0["entries"];
  const _next_generation_0 = _state_0["next_generation"];
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _input_0 = _t_0["input"];
    const _current_0 = _t_0["generation"];
    const _members_0 = _t_0["members"];
    return $Bool$pick$(($Nat$is_eq$(_current_0, _generation_0)), ($Bool$pick$((1 < _members_0), {$: "RevisionState.State", "entries": {$: "Con", "head": {$: "RevisionState.Entry", "subject": _subject_0, "input": _input_0, "generation": _current_0, "members": (_members_0 < 1 ? 0 : _members_0 - 1)}, "tail": ($$$$047agent$045flow$045bend$047RevisionState$without$(_subject_0, _entries_0))}, "next_generation": _next_generation_0}, {$: "RevisionState.State", "entries": ($$$$047agent$045flow$045bend$047RevisionState$without$(_subject_0, _entries_0)), "next_generation": _next_generation_0})), {$: "RevisionState.State", "entries": _entries_0, "next_generation": _next_generation_0});
  } else {
    return {$: "RevisionState.State", "entries": _entries_0, "next_generation": _next_generation_0};
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$release$(_state_0, _subject_0, _generation_0) {
  const _entries_0 = _state_0["entries"];
  const __0 = _state_0["next_generation"];
  return $$$$047agent$045flow$045bend$047RevisionState$release_found$({$: "RevisionState.State", "entries": _entries_0, "next_generation": __0}, _subject_0, _generation_0, ($$$$047agent$045flow$045bend$047RevisionState$find$(_subject_0, _entries_0)));
}

function $$$$047agent$045flow$045bend$047RevisionState$current_found$(_input_0, _generation_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _retained_input_0 = _t_0["input"];
    const _retained_generation_0 = _t_0["generation"];
    return $Bool$and$(($Nat$is_eq$(_input_0, _retained_input_0)), ($Nat$is_eq$(_generation_0, _retained_generation_0)));
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$current$(_state_0, _subject_0, _input_0, _generation_0) {
  const _entries_0 = _state_0["entries"];
  return $$$$047agent$045flow$045bend$047RevisionState$current_found$(_input_0, _generation_0, ($$$$047agent$045flow$045bend$047RevisionState$find$(_subject_0, _entries_0)));
}

function $$$$047agent$045flow$045bend$047RevisionState$generation_found$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _current_0 = _t_0["generation"];
    return _current_0;
  } else {
    return 0;
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$generation$(_state_0, _subject_0) {
  const _entries_0 = _state_0["entries"];
  return $$$$047agent$045flow$045bend$047RevisionState$generation_found$(($$$$047agent$045flow$045bend$047RevisionState$find$(_subject_0, _entries_0)));
}

function $$$$047agent$045flow$045bend$047RevisionState$count$(_state_0) {
  const _entries_0 = _state_0["entries"];
  return $List$length$(_entries_0);
}

function $$$$047agent$045flow$045bend$047RevisionState$superseded_found$(_candidate_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _current_0 = _t_0["generation"];
    return (_candidate_0 < _current_0);
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047RevisionState$superseded$(_state_0, _subject_0, _candidate_subject_0, _candidate_0) {
  const _entries_0 = _state_0["entries"];
  return $Bool$and$(($Nat$is_eq$(_subject_0, _candidate_subject_0)), ($$$$047agent$045flow$045bend$047RevisionState$superseded_found$(_candidate_0, ($$$$047agent$045flow$045bend$047RevisionState$find$(_subject_0, _entries_0)))));
}

function $$$$047agent$045flow$045bend$047ReuseState$initial$() {
  return {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047ReuseState$claim_id$(_claim_0) {
  const _id_0 = _claim_0["id"];
  return _id_0;
}

function $$$$047agent$045flow$045bend$047ReuseState$entry_id$(_entry_0) {
  const _id_0 = _entry_0["id"];
  return _id_0;
}

function $$$$047agent$045flow$045bend$047ReuseState$entry_partition$(_entry_0) {
  const _partition_0 = _entry_0["partition"];
  return _partition_0;
}

function $$$$047agent$045flow$045bend$047ReuseState$entry_reservation$(_entry_0) {
  const _reservation_0 = _entry_0["reservation"];
  return _reservation_0;
}

function $$$$047agent$045flow$045bend$047ReuseState$find_reservation$(_reservation_0, _cache_0) {
  if (_cache_0.$ === "Nil") {
    return false;
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    const _x_0 = ($Nat$is_eq$(_reservation_0, ($$$$047agent$045flow$045bend$047ReuseState$entry_reservation$(_entry_0))));
    const _x_1 = ($$$$047agent$045flow$045bend$047ReuseState$find_reservation$(_reservation_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$find_claim$(_id_0, _claims_0) {
  if (_claims_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _claim_0 = _claims_0["head"];
    const _rest_0 = _claims_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_id_0, ($$$$047agent$045flow$045bend$047ReuseState$claim_id$(_claim_0)))), {$: "Some", "value": _claim_0}, ($$$$047agent$045flow$045bend$047ReuseState$find_claim$(_id_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$find_entry$(_id_0, _cache_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_id_0, ($$$$047agent$045flow$045bend$047ReuseState$entry_id$(_entry_0)))), {$: "Some", "value": _entry_0}, ($$$$047agent$045flow$045bend$047ReuseState$find_entry$(_id_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$keep_claim$(_claim_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _claim_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$without_claim$(_id_0, _claims_0) {
  if (_claims_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _claim_0 = _claims_0["head"];
    const _rest_0 = _claims_0["tail"];
    return $$$$047agent$045flow$045bend$047ReuseState$keep_claim$(_claim_0, ($$$$047agent$045flow$045bend$047ReuseState$without_claim$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, ($$$$047agent$045flow$045bend$047ReuseState$claim_id$(_claim_0)))));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$keep_entry$(_entry_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _entry_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$without_entry$(_id_0, _cache_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    return $$$$047agent$045flow$045bend$047ReuseState$keep_entry$(_entry_0, ($$$$047agent$045flow$045bend$047ReuseState$without_entry$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, ($$$$047agent$045flow$045bend$047ReuseState$entry_id$(_entry_0)))));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$route_cache_found$(_state_0, _id_0, _found_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_found_0.$ === "Some") {
    const _entry_0 = _found_0["value"];
    return {$: "ReuseState.Cached", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": ($List$append$(($$$$047agent$045flow$045bend$047ReuseState$without_entry$(_id_0, _cache_0)), {$: "Con", "head": _entry_0, "tail": {$: "Nil"}}))}};
  } else {
    return {$: "ReuseState.Own", "state": {$: "ReuseState.State", "claims": {$: "Con", "head": {$: "ReuseState.Claim", "id": _id_0, "attached": false}, "tail": _claims_0}, "cache": _cache_0}};
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$route_cache$(_state_0, _id_0) {
  const __0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $$$$047agent$045flow$045bend$047ReuseState$route_cache_found$({$: "ReuseState.State", "claims": __0, "cache": _cache_0}, _id_0, ($$$$047agent$045flow$045bend$047ReuseState$find_entry$(_id_0, _cache_0)));
}

function $$$$047agent$045flow$045bend$047ReuseState$route_claim$(_state_0, _id_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["attached"];
    if (_t_1) {
      return {$: "ReuseState.JoinPending", "state": _state_0};
    } else {
      return {$: "ReuseState.JoinClaimed", "state": _state_0};
    }
  } else {
    return $$$$047agent$045flow$045bend$047ReuseState$route_cache$(_state_0, _id_0);
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$route$(_state_0, _id_0, _live_advice_0) {
  const _claims_0 = _state_0["claims"];
  const __0 = _state_0["cache"];
  if (_live_advice_0) {
    return {$: "ReuseState.JoinAdvice", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": __0}};
  } else {
    return $$$$047agent$045flow$045bend$047ReuseState$route_claim$({$: "ReuseState.State", "claims": _claims_0, "cache": __0}, _id_0, ($$$$047agent$045flow$045bend$047ReuseState$find_claim$(_id_0, _claims_0)));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$claim$(_state_0, _id_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $Bool$pick$(($Maybe$is_none$(($$$$047agent$045flow$045bend$047ReuseState$find_claim$(_id_0, _claims_0)))), {$: "ReuseState.Granted", "state": {$: "ReuseState.State", "claims": {$: "Con", "head": {$: "ReuseState.Claim", "id": _id_0, "attached": false}, "tail": _claims_0}, "cache": _cache_0}}, {$: "ReuseState.Refused", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}});
}

function $$$$047agent$045flow$045bend$047ReuseState$attach_found$(_state_0, _id_0, _found_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_found_0.$ === "Some") {
    return {$: "ReuseState.Granted", "state": {$: "ReuseState.State", "claims": {$: "Con", "head": {$: "ReuseState.Claim", "id": _id_0, "attached": true}, "tail": ($$$$047agent$045flow$045bend$047ReuseState$without_claim$(_id_0, _claims_0))}, "cache": _cache_0}};
  } else {
    return {$: "ReuseState.Refused", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}};
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$attach$(_state_0, _id_0) {
  const _claims_0 = _state_0["claims"];
  const __0 = _state_0["cache"];
  return $$$$047agent$045flow$045bend$047ReuseState$attach_found$({$: "ReuseState.State", "claims": _claims_0, "cache": __0}, _id_0, ($$$$047agent$045flow$045bend$047ReuseState$find_claim$(_id_0, _claims_0)));
}

function $$$$047agent$045flow$045bend$047ReuseState$release$(_state_0, _id_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return {$: "ReuseState.State", "claims": ($$$$047agent$045flow$045bend$047ReuseState$without_claim$(_id_0, _claims_0)), "cache": _cache_0};
}

function $$$$047agent$045flow$045bend$047ReuseState$route_cache_only_found$(_state_0, _id_0, _found_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_found_0.$ === "Some") {
    const _entry_0 = _found_0["value"];
    return {$: "ReuseState.Cached", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": ($List$append$(($$$$047agent$045flow$045bend$047ReuseState$without_entry$(_id_0, _cache_0)), {$: "Con", "head": _entry_0, "tail": {$: "Nil"}}))}};
  } else {
    return {$: "ReuseState.Own", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}};
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$route_cache_only$(_state_0, _id_0) {
  const __0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $$$$047agent$045flow$045bend$047ReuseState$route_cache_only_found$({$: "ReuseState.State", "claims": __0, "cache": _cache_0}, _id_0, ($$$$047agent$045flow$045bend$047ReuseState$find_entry$(_id_0, _cache_0)));
}

function $$$$047agent$045flow$045bend$047ReuseState$touch$(_state_0, _id_0) {
  return $$$$047agent$045flow$045bend$047ReuseState$route_cache_only$(_state_0, _id_0);
}

function $$$$047agent$045flow$045bend$047ReuseState$cache_bytes$(_cache_0) {
  if (_cache_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _cache_0["head"];
    const _bytes_0 = _t_0["bytes"];
    const _rest_0 = _cache_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047ReuseState$cache_bytes$(_rest_0));
    return nat_chk(_bytes_0 + _x_0);
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$evict_for$(_cache_0, _incoming_0, _entry_limit_0, _byte_limit_0, _evicted_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Nil"}}, "ids": _evicted_0};
  } else {
    const _t_0 = _cache_0["head"];
    const _id_0 = _t_0["id"];
    const __0 = _t_0["partition"];
    const __1 = _t_0["bytes"];
    const __2 = _t_0["reservation"];
    const _rest_0 = _cache_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047ReuseState$cache_bytes$({$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": __0, "bytes": __1, "reservation": __2}, "tail": _rest_0}));
    const _x_1 = ($Nat$is_ge$(($List$length$({$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": __0, "bytes": __1, "reservation": __2}, "tail": _rest_0})), _entry_limit_0));
    const _x_2 = ($Nat$is_gt$(nat_chk(_x_0 + _incoming_0), _byte_limit_0));
    return $Bool$pick$((_x_1 || _x_2), ($$$$047agent$045flow$045bend$047ReuseState$evict_for$(_rest_0, _incoming_0, _entry_limit_0, _byte_limit_0, ($List$append$(_evicted_0, {$: "Con", "head": _id_0, "tail": {$: "Nil"}})))), {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": __0, "bytes": __1, "reservation": __2}, "tail": _rest_0}}, "ids": _evicted_0});
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$prepared_after_eviction$(_claims_0, _result_0) {
  const _t_0 = _result_0["state"];
  const _remaining_0 = _t_0["cache"];
  const _ids_0 = _result_0["ids"];
  return {$: "ReuseState.Prepared", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _remaining_0}, "evicted": _ids_0};
}

function $$$$047agent$045flow$045bend$047ReuseState$prepare_missing$(_state_0, _incoming_0, _entry_limit_0, _byte_limit_0, _oversized_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  if (_oversized_0) {
    return {$: "ReuseState.Reject", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}};
  } else {
    return $$$$047agent$045flow$045bend$047ReuseState$prepared_after_eviction$(_claims_0, ($$$$047agent$045flow$045bend$047ReuseState$evict_for$(_cache_0, _incoming_0, _entry_limit_0, _byte_limit_0, {$: "Nil"})));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$prepare_decision$(_state_0, _incoming_0, _entry_limit_0, _byte_limit_0, _found_0) {
  if (_found_0.$ === "Some") {
    return {$: "ReuseState.Already", "state": _state_0};
  } else {
    return $$$$047agent$045flow$045bend$047ReuseState$prepare_missing$(_state_0, _incoming_0, _entry_limit_0, _byte_limit_0, ($Nat$is_gt$(_incoming_0, _byte_limit_0)));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$prepare$(_state_0, _id_0, _incoming_0, _entry_limit_0, _byte_limit_0) {
  const __0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $$$$047agent$045flow$045bend$047ReuseState$prepare_decision$({$: "ReuseState.State", "claims": __0, "cache": _cache_0}, _incoming_0, _entry_limit_0, _byte_limit_0, ($$$$047agent$045flow$045bend$047ReuseState$find_entry$(_id_0, _cache_0)));
}

function $$$$047agent$045flow$045bend$047ReuseState$commit$(_state_0, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  const _x_0 = ($List$length$(_cache_0));
  const _x_1 = ($$$$047agent$045flow$045bend$047ReuseState$cache_bytes$(_cache_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_id_0, 0)), ($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Bool$and$(($Nat$is_gt$(_reservation_0, 0)), ($Bool$and$(($Maybe$is_none$(($$$$047agent$045flow$045bend$047ReuseState$find_entry$(_id_0, _cache_0)))), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047ReuseState$find_reservation$(_reservation_0, _cache_0)))), ($Bool$and$((_x_0 < _entry_limit_0), ($Nat$is_le$(nat_chk(_x_1 + _bytes_0), _byte_limit_0)))))))))))))), {$: "ReuseState.Granted", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": ($List$append$(_cache_0, {$: "Con", "head": {$: "ReuseState.Entry", "id": _id_0, "partition": _partition_0, "bytes": _bytes_0, "reservation": _reservation_0}, "tail": {$: "Nil"}}))}}, {$: "ReuseState.Refused", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _cache_0}});
}

function $$$$047agent$045flow$045bend$047ReuseState$discard_choice$(_entry_0, _result_0, _selected_0) {
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

function $$$$047agent$045flow$045bend$047ReuseState$discard_partition$(_cache_0, _partition_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": {$: "Nil"}, "cache": {$: "Nil"}}, "ids": {$: "Nil"}};
  } else {
    const _entry_0 = _cache_0["head"];
    const _rest_0 = _cache_0["tail"];
    return $$$$047agent$045flow$045bend$047ReuseState$discard_choice$(_entry_0, ($$$$047agent$045flow$045bend$047ReuseState$discard_partition$(_rest_0, _partition_0)), ($Nat$is_eq$(($$$$047agent$045flow$045bend$047ReuseState$entry_partition$(_entry_0)), _partition_0)));
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$discard_with_claims$(_claims_0, _result_0) {
  const _t_0 = _result_0["state"];
  const _kept_0 = _t_0["cache"];
  const _ids_0 = _result_0["ids"];
  return {$: "ReuseState.Discarded", "state": {$: "ReuseState.State", "claims": _claims_0, "cache": _kept_0}, "ids": _ids_0};
}

function $$$$047agent$045flow$045bend$047ReuseState$discard$(_state_0, _partition_0) {
  const _claims_0 = _state_0["claims"];
  const _cache_0 = _state_0["cache"];
  return $$$$047agent$045flow$045bend$047ReuseState$discard_with_claims$(_claims_0, ($$$$047agent$045flow$045bend$047ReuseState$discard_partition$(_cache_0, _partition_0)));
}

function $$$$047agent$045flow$045bend$047ReuseState$entry_ids$(_cache_0) {
  if (_cache_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _cache_0["head"];
    const _id_0 = _t_0["id"];
    const _rest_0 = _cache_0["tail"];
    return {$: "Con", "head": _id_0, "tail": ($$$$047agent$045flow$045bend$047ReuseState$entry_ids$(_rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047ReuseState$clear$(_state_0) {
  const _cache_0 = _state_0["cache"];
  return {$: "ReuseState.Discarded", "state": ($$$$047agent$045flow$045bend$047ReuseState$initial$()), "ids": ($$$$047agent$045flow$045bend$047ReuseState$entry_ids$(_cache_0))};
}

function $$$$047agent$045flow$045bend$047Notice$decide$(_remaining_0, _count_0, _maximum_0) {
  if (_remaining_0.$ === "Some") {
    const _duration_0 = _remaining_0["value"];
    return $Bool$pick$(($Nat$is_gt$(_duration_0, 0)), {$: "Notice.Suppress"}, {$: "Notice.Refresh"});
  } else {
    return $Bool$pick$(($Nat$is_ge$(_count_0, _maximum_0)), {$: "Notice.RejectFull"}, {$: "Notice.Create"});
  }
}

function $$$$047agent$045flow$045bend$047Notice$prune$(_has_pending_0, _leased_0, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0) {
  const _x_0 = ($Bool$not$(_has_pending_0));
  return {$: "Notice.Prune", "drop_lease": ($Bool$and$(_has_pending_0, ($Bool$and$(_leased_0, _lease_expired_0)))), "drop_pending": ($Bool$and$(_has_pending_0, _pending_expired_0)), "drop_key": ($Bool$and$(($Bool$not$(_excepted_0)), ($Bool$and$(_cooldown_expired_0, (_x_0 || _pending_expired_0)))))};
}

function $$$$047agent$045flow$045bend$047Notice$bounded_add$result$(_left_0, _right_0, _maximum_0, _over_0) {
  if (_over_0) {
    return _maximum_0;
  } else {
    return nat_chk(_left_0 + _right_0);
  }
}

function $$$$047agent$045flow$045bend$047Notice$bounded_add$(_left_0, _right_0, _maximum_0) {
  return $$$$047agent$045flow$045bend$047Notice$bounded_add$result$(_left_0, _right_0, _maximum_0, ($Nat$is_gt$(_right_0, (_maximum_0 < _left_0 ? 0 : _maximum_0 - _left_0))));
}

function $$$$047agent$045flow$045bend$047Notice$refresh$leased$(_count_0, _suppressed_0, _maximum_0, _leased_0) {
  if (_leased_0) {
    return {$: "Notice.KeepLeased"};
  } else {
    return {$: "Notice.MergePending", "count": ($$$$047agent$045flow$045bend$047Notice$bounded_add$(_count_0, _suppressed_0, _maximum_0))};
  }
}

function $$$$047agent$045flow$045bend$047Notice$refresh$(_pending_0, _leased_0, _suppressed_0, _maximum_0) {
  if (_pending_0.$ === "None") {
    return {$: "Notice.CreatePending", "count": _suppressed_0};
  } else {
    const _count_0 = _pending_0["value"];
    return $$$$047agent$045flow$045bend$047Notice$refresh$leased$(_count_0, _suppressed_0, _maximum_0, _leased_0);
  }
}

function $$$$047agent$045flow$045bend$047Notice$advance$action$(_action_0, _suppressed_0, _pending_0, _leased_0, _maximum_0) {
  if (_action_0.$ === "Notice.Suppress") {
    return {$: "Notice.Suppressed", "count": ($$$$047agent$045flow$045bend$047Notice$bounded_add$(_suppressed_0, 1, _maximum_0))};
  } else if (_action_0.$ === "Notice.RejectFull") {
    return {$: "Notice.RejectedFull"};
  } else if (_action_0.$ === "Notice.Create") {
    return {$: "Notice.CreateKey"};
  } else {
    return $$$$047agent$045flow$045bend$047Notice$refresh$(_pending_0, _leased_0, _suppressed_0, _maximum_0);
  }
}

function $$$$047agent$045flow$045bend$047Notice$advance$(_remaining_0, _count_0, _maximum_0, _suppressed_0, _pending_0, _leased_0, _max_count_0) {
  return $$$$047agent$045flow$045bend$047Notice$advance$action$(($$$$047agent$045flow$045bend$047Notice$decide$(_remaining_0, _count_0, _maximum_0)), _suppressed_0, _pending_0, _leased_0, _max_count_0);
}

function $$$$047agent$045flow$045bend$047Notice$main$() {
  return $$$$047agent$045flow$045bend$047Notice$decide$({$: "Some", "value": 10}, 1, 64);
}

function $$$$047agent$045flow$045bend$047NoticeState$initial$() {
  return {$: "NoticeState.State", "records": {$: "Nil"}};
}

function $$$$047agent$045flow$045bend$047NoticeState$record_id$(_record_0) {
  const _id_0 = _record_0["id"];
  return _id_0;
}

function $$$$047agent$045flow$045bend$047NoticeState$pending_id$(_pending_0) {
  const _id_0 = _pending_0["id"];
  return _id_0;
}

function $$$$047agent$045flow$045bend$047NoticeState$pending_sequence$(_pending_0) {
  const _sequence_0 = _pending_0["sequence"];
  return _sequence_0;
}

function $$$$047agent$045flow$045bend$047NoticeState$find_record$(_id_0, _records_0) {
  if (_records_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _record_0 = _records_0["head"];
    const _rest_0 = _records_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(_id_0, ($$$$047agent$045flow$045bend$047NoticeState$record_id$(_record_0)))), {$: "Some", "value": _record_0}, ($$$$047agent$045flow$045bend$047NoticeState$find_record$(_id_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$without_choice$(_record_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _record_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$without$(_id_0, _records_0) {
  if (_records_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _record_0 = _records_0["head"];
    const _rest_0 = _records_0["tail"];
    return $$$$047agent$045flow$045bend$047NoticeState$without_choice$(_record_0, ($$$$047agent$045flow$045bend$047NoticeState$without$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, ($$$$047agent$045flow$045bend$047NoticeState$record_id$(_record_0)))));
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$pending_count$(_pending_0) {
  if (_pending_0.$ === "Some") {
    const _t_0 = _pending_0["value"];
    const _count_0 = _t_0["count"];
    return {$: "Some", "value": _count_0};
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$pending_leased$(_pending_0) {
  if (_pending_0.$ === "Some") {
    const _t_0 = _pending_0["value"];
    const _leased_0 = _t_0["leased"];
    return _leased_0;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, _record_0) {
  const _records_0 = _state_0["records"];
  return {$: "NoticeState.State", "records": {$: "Con", "head": _record_0, "tail": ($$$$047agent$045flow$045bend$047NoticeState$without$(($$$$047agent$045flow$045bend$047NoticeState$record_id$(_record_0)), _records_0))}};
}

function $$$$047agent$045flow$045bend$047NoticeState$advance_applied$(_state_0, _record_0, _action_0, _proposed_0, _sequence_0) {
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
      return {$: "NoticeState.Suppressed", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _count_0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_id_0, "count": __1, "sequence": _previous_0, "leased": _leased_0}}})), "count": _count_0};
    } else if (_action_0.$ === "Notice.RejectedFull") {
      return {$: "NoticeState.RejectedFull", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreateKey") {
      return {$: "NoticeState.RefusedAdvance", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreatePending") {
      const _count_1 = _action_0["count"];
      return {$: "NoticeState.CreatePending", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _proposed_0, "count": _count_1, "sequence": _sequence_0, "leased": false}}})), "count": _count_1};
    } else if (_action_0.$ === "Notice.MergePending") {
      const _count_2 = _action_0["count"];
      return {$: "NoticeState.MergePending", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_id_0, "count": _count_2, "sequence": _previous_0, "leased": _leased_0}}})), "count": _count_2};
    } else {
      return {$: "NoticeState.KeepLeased", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_id_0, "count": __1, "sequence": _previous_0, "leased": _leased_0}}}))};
    }
  } else {
    if (_action_0.$ === "Notice.Suppressed") {
      const _count_3 = _action_0["count"];
      return {$: "NoticeState.Suppressed", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _count_3, "pending": _t_0})), "count": _count_3};
    } else if (_action_0.$ === "Notice.RejectedFull") {
      return {$: "NoticeState.RejectedFull", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreateKey") {
      return {$: "NoticeState.RefusedAdvance", "state": _state_0};
    } else if (_action_0.$ === "Notice.CreatePending") {
      const _count_4 = _action_0["count"];
      return {$: "NoticeState.CreatePending", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _proposed_0, "count": _count_4, "sequence": _sequence_0, "leased": false}}})), "count": _count_4};
    } else if (_action_0.$ === "Notice.KeepLeased") {
      return {$: "NoticeState.KeepLeased", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": _t_0}))};
    } else {
      return {$: "NoticeState.RefusedAdvance", "state": _state_0};
    }
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$advance_found$(_state_0, _found_0, _remaining_0, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0) {
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
    return $$$$047agent$045flow$045bend$047NoticeState$advance_applied$({$: "NoticeState.State", "records": _records_0}, {$: "NoticeState.Record", "id": __0, "partition": __1, "group": __2, "reservation": __3, "suppressed": _suppressed_0, "pending": _pending_0}, ($$$$047agent$045flow$045bend$047Notice$advance$(_remaining_0, 1, _maximum_keys_0, _suppressed_0, ($$$$047agent$045flow$045bend$047NoticeState$pending_count$(_pending_0)), ($$$$047agent$045flow$045bend$047NoticeState$pending_leased$(_pending_0)), _max_count_0)), _proposed_0, _sequence_0);
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$advance$(_state_0, _key_0, _remaining_0, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0) {
  const _records_0 = _state_0["records"];
  return $$$$047agent$045flow$045bend$047NoticeState$advance_found$({$: "NoticeState.State", "records": _records_0}, ($$$$047agent$045flow$045bend$047NoticeState$find_record$(_key_0, _records_0)), _remaining_0, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0);
}

function $$$$047agent$045flow$045bend$047NoticeState$commit$(_state_0, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0) {
  const _records_0 = _state_0["records"];
  const _x_0 = ($List$length$(_records_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_key_0, 0)), ($Bool$and$(($Nat$is_gt$(_partition_0, 0)), ($Bool$and$(($Nat$is_gt$(_group_0, 0)), ($Bool$and$(($Nat$is_gt$(_reservation_0, 0)), ($Bool$and$(($Nat$is_gt$(_pending_0, 0)), ($Bool$and$(($Maybe$is_none$(($$$$047agent$045flow$045bend$047NoticeState$find_record$(_key_0, _records_0)))), (_x_0 < _maximum_keys_0))))))))))))), {$: "NoticeState.Granted", "state": {$: "NoticeState.State", "records": {$: "Con", "head": {$: "NoticeState.Record", "id": _key_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": 0, "pending": {$: "Some", "value": {$: "NoticeState.Pending", "id": _pending_0, "count": 0, "sequence": _sequence_0, "leased": false}}}, "tail": _records_0}}}, {$: "NoticeState.Refused", "state": {$: "NoticeState.State", "records": _records_0}});
}

function $$$$047agent$045flow$045bend$047NoticeState$records_of$(_state_0) {
  const _records_0 = _state_0["records"];
  return _records_0;
}

function $$$$047agent$045flow$045bend$047NoticeState$prune_pending$(_pending_0, _drop_lease_0, _drop_pending_0) {
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

function $$$$047agent$045flow$045bend$047NoticeState$prune_applied$(_state_0, _record_0, _decision_0) {
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
    return {$: "NoticeState.Pruned", "state": {$: "NoticeState.State", "records": ($$$$047agent$045flow$045bend$047NoticeState$without$(_id_0, ($$$$047agent$045flow$045bend$047NoticeState$records_of$(_state_0))))}, "drop_lease": _drop_lease_0, "drop_pending": _drop_pending_0, "drop_key": true};
  } else {
    return {$: "NoticeState.Pruned", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _suppressed_0, "pending": ($$$$047agent$045flow$045bend$047NoticeState$prune_pending$(_pending_0, _drop_lease_0, _drop_pending_0))})), "drop_lease": _drop_lease_0, "drop_pending": _drop_pending_0, "drop_key": false};
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$prune_found$(_state_0, _found_0, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0) {
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
    return $$$$047agent$045flow$045bend$047NoticeState$prune_applied$(_state_0, {$: "NoticeState.Record", "id": __0, "partition": __1, "group": __2, "reservation": __3, "suppressed": __4, "pending": _pending_0}, ($$$$047agent$045flow$045bend$047Notice$prune$(($Maybe$is_some$(_pending_0)), ($$$$047agent$045flow$045bend$047NoticeState$pending_leased$(_pending_0)), _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0)));
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$prune$(_state_0, _key_0, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0) {
  const _records_0 = _state_0["records"];
  return $$$$047agent$045flow$045bend$047NoticeState$prune_found$({$: "NoticeState.State", "records": _records_0}, ($$$$047agent$045flow$045bend$047NoticeState$find_record$(_key_0, _records_0)), _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0);
}

function $$$$047agent$045flow$045bend$047NoticeState$drop$(_state_0, _key_0) {
  const _records_0 = _state_0["records"];
  return {$: "NoticeState.State", "records": ($$$$047agent$045flow$045bend$047NoticeState$without$(_key_0, _records_0))};
}

function $$$$047agent$045flow$045bend$047NoticeState$set_leased$(_pending_0, _leased_0) {
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

function $$$$047agent$045flow$045bend$047NoticeState$lease_found$(_state_0, _found_0, _leased_0) {
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
      return {$: "NoticeState.Granted", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _suppressed_0, "pending": ($$$$047agent$045flow$045bend$047NoticeState$set_leased$({$: "Some", "value": __0}, _leased_0))}))};
    } else {
      return {$: "NoticeState.Refused", "state": _state_0};
    }
  } else {
    return {$: "NoticeState.Refused", "state": _state_0};
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$lease$(_state_0, _key_0, _leased_0) {
  const _records_0 = _state_0["records"];
  return $$$$047agent$045flow$045bend$047NoticeState$lease_found$({$: "NoticeState.State", "records": _records_0}, ($$$$047agent$045flow$045bend$047NoticeState$find_record$(_key_0, _records_0)), _leased_0);
}

function $$$$047agent$045flow$045bend$047NoticeState$clear_pending_found$(_state_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _id_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const _group_0 = _t_0["group"];
    const _reservation_0 = _t_0["reservation"];
    const _suppressed_0 = _t_0["suppressed"];
    const _t_1 = _t_0["pending"];
    if (_t_1.$ === "Some") {
      return {$: "NoticeState.Granted", "state": ($$$$047agent$045flow$045bend$047NoticeState$replace$(_state_0, {$: "NoticeState.Record", "id": _id_0, "partition": _partition_0, "group": _group_0, "reservation": _reservation_0, "suppressed": _suppressed_0, "pending": {$: "None"}}))};
    } else {
      return {$: "NoticeState.Refused", "state": _state_0};
    }
  } else {
    return {$: "NoticeState.Refused", "state": _state_0};
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$clear_pending$(_state_0, _key_0) {
  const _records_0 = _state_0["records"];
  return $$$$047agent$045flow$045bend$047NoticeState$clear_pending_found$({$: "NoticeState.State", "records": _records_0}, ($$$$047agent$045flow$045bend$047NoticeState$find_record$(_key_0, _records_0)));
}

function $$$$047agent$045flow$045bend$047NoticeState$contains$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _item_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047NoticeState$contains$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$candidate$(_record_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0) {
  const _owner_0 = _record_0["partition"];
  const _delivery_group_0 = _record_0["group"];
  const _t_0 = _record_0["pending"];
  if (_t_0.$ === "Some") {
    const _pending_0 = _t_0["value"];
    const _x_0 = ($Bool$not$(_authority_bound_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047NoticeState$contains$(($$$$047agent$045flow$045bend$047NoticeState$pending_id$(_pending_0)), _allowed_0));
    return $Bool$pick$(($Bool$and$(($Bool$pick$(_composed_0, ($Nat$is_eq$(_delivery_group_0, _group_0)), ($Nat$is_eq$(_owner_0, _partition_0)))), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047NoticeState$pending_leased$({$: "Some", "value": _pending_0})))), (_x_0 || _x_1))))), {$: "Some", "value": _pending_0}, {$: "None"});
  } else {
    return {$: "None"};
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$insert_pending$(_pending_0, _ordered_0) {
  if (_ordered_0.$ === "Nil") {
    return {$: "Con", "head": _pending_0, "tail": {$: "Nil"}};
  } else {
    const _head_0 = _ordered_0["head"];
    const _rest_0 = _ordered_0["tail"];
    return $Bool$pick$(($Nat$is_le$(($$$$047agent$045flow$045bend$047NoticeState$pending_sequence$(_pending_0)), ($$$$047agent$045flow$045bend$047NoticeState$pending_sequence$(_head_0)))), {$: "Con", "head": _pending_0, "tail": {$: "Con", "head": _head_0, "tail": _rest_0}}, {$: "Con", "head": _head_0, "tail": ($$$$047agent$045flow$045bend$047NoticeState$insert_pending$(_pending_0, _rest_0))});
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$collect_choice$(_found_0, _tail_0) {
  if (_found_0.$ === "Some") {
    const _pending_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047NoticeState$insert_pending$(_pending_0, _tail_0);
  } else {
    return _tail_0;
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$collect_candidates$(_records_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0) {
  if (_records_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _record_0 = _records_0["head"];
    const _rest_0 = _records_0["tail"];
    return $$$$047agent$045flow$045bend$047NoticeState$collect_choice$(($$$$047agent$045flow$045bend$047NoticeState$candidate$(_record_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0)), ($$$$047agent$045flow$045bend$047NoticeState$collect_candidates$(_rest_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0)));
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$pending_ids$(_pending_0) {
  if (_pending_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _pending_0["head"];
    const _rest_0 = _pending_0["tail"];
    return {$: "Con", "head": ($$$$047agent$045flow$045bend$047NoticeState$pending_id$(_item_0)), "tail": ($$$$047agent$045flow$045bend$047NoticeState$pending_ids$(_rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047NoticeState$select$(_state_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0) {
  const _records_0 = _state_0["records"];
  return $$$$047agent$045flow$045bend$047NoticeState$pending_ids$(($$$$047agent$045flow$045bend$047NoticeState$collect_candidates$(_records_0, _partition_0, _group_0, _composed_0, _authority_bound_0, _allowed_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$initial$() {
  return {$: "CollectionState.State", "ready": {$: "Nil"}, "leases": {$: "Nil"}, "claims": {$: "Nil"}, "delivery": ($$$$047agent$045flow$045bend$047DeliveryState$initial$()), "revision": ($$$$047agent$045flow$045bend$047RevisionState$initial$()), "reuse": ($$$$047agent$045flow$045bend$047ReuseState$initial$()), "notices": ($$$$047agent$045flow$045bend$047NoticeState$initial$())};
}

function $$$$047agent$045flow$045bend$047CollectionState$contains$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _item_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047CollectionState$contains$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$lease_exists$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_id_0, _advice_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047CollectionState$lease_exists$(_id_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$claim_exists$(_group_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Nat$is_eq$(_group_0, _candidate_group_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047CollectionState$claim_exists$(_group_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$keep_ready$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$remove_ready$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047CollectionState$keep_ready$(_item_0, ($$$$047agent$045flow$045bend$047CollectionState$remove_ready$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, _item_0)));
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$keep_lease$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$remove_lease$(_id_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _owner_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047CollectionState$keep_lease$({$: "CollectionState.Lease", "advice": _advice_0, "owner": _owner_0}, ($$$$047agent$045flow$045bend$047CollectionState$remove_lease$(_id_0, _token_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_id_0, _advice_0)), ($Nat$is_eq$(_token_0, _owner_0)))));
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$lease_owned$(_id_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const _owner_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_id_0, _advice_0)), ($Nat$is_eq$(_token_0, _owner_0))));
    const _x_1 = ($$$$047agent$045flow$045bend$047CollectionState$lease_owned$(_id_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$owns_lease$(_state_0, _advice_0, _token_0) {
  const _leases_0 = _state_0["leases"];
  return $$$$047agent$045flow$045bend$047CollectionState$lease_owned$(_advice_0, _token_0, _leases_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$remove_advice_lease$(_id_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _advice_0 = _t_0["advice"];
    const __0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047CollectionState$keep_lease$({$: "CollectionState.Lease", "advice": _advice_0, "owner": __0}, ($$$$047agent$045flow$045bend$047CollectionState$remove_advice_lease$(_id_0, _rest_0)), ($Nat$is_eq$(_id_0, _advice_0)));
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$keep_claim$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$remove_claim$(_group_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_token_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047CollectionState$keep_claim$({$: "CollectionState.Claim", "group": _candidate_group_0, "owner": _candidate_token_0}, ($$$$047agent$045flow$045bend$047CollectionState$remove_claim$(_group_0, _token_0, _rest_0)), ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_token_0, _candidate_token_0)))));
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$claim_owned$(_group_0, _token_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _candidate_group_0 = _t_0["group"];
    const _candidate_token_0 = _t_0["owner"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_group_0, _candidate_group_0)), ($Nat$is_eq$(_token_0, _candidate_token_0))));
    const _x_1 = ($$$$047agent$045flow$045bend$047CollectionState$claim_owned$(_group_0, _token_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047CollectionState$mark_ready$(_state_0, _advice_0, _eligible_now_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  const _x_0 = ($$$$047agent$045flow$045bend$047CollectionState$contains$(_advice_0, _ready_0));
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_advice_0, 0)), (_eligible_now_0 || _x_0))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": ($Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$contains$(_advice_0, _ready_0)), _ready_0, {$: "Con", "head": _advice_0, "tail": _ready_0})), "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $$$$047agent$045flow$045bend$047CollectionState$reserve$(_state_0, _advice_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $Bool$pick$(($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($$$$047agent$045flow$045bend$047CollectionState$contains$(_advice_0, _ready_0)), ($Bool$not$(($$$$047agent$045flow$045bend$047CollectionState$lease_exists$(_advice_0, _leases_0)))))))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": {$: "Con", "head": {$: "CollectionState.Lease", "advice": _advice_0, "owner": _token_0}, "tail": _leases_0}, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $$$$047agent$045flow$045bend$047CollectionState$release$(_state_0, _advice_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$lease_owned$(_advice_0, _token_0, _leases_0)), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": ($$$$047agent$045flow$045bend$047CollectionState$remove_lease$(_advice_0, _token_0, _leases_0)), "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $$$$047agent$045flow$045bend$047CollectionState$retire$(_state_0, _advice_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": ($$$$047agent$045flow$045bend$047CollectionState$remove_ready$(_advice_0, _ready_0)), "leases": ($$$$047agent$045flow$045bend$047CollectionState$remove_advice_lease$(_advice_0, _leases_0)), "claims": _claims_0, "delivery": ($$$$047agent$045flow$045bend$047DeliveryState$submission_forget$(_delivery_0, _advice_0)), "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $$$$047agent$045flow$045bend$047CollectionState$protected_advice$(_state_0, _advice_0) {
  const _delivery_0 = _state_0["delivery"];
  return $$$$047agent$045flow$045bend$047DeliveryState$protected_advice$(_delivery_0, _advice_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$claim$(_state_0, _group_0, _token_0, _active_0, _capacity_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  const _x_0 = ($List$length$(_claims_0));
  return $Bool$pick$(($Bool$and$(_active_0, ($Bool$and$(($Nat$is_gt$(_token_0, 0)), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047CollectionState$claim_exists$(_group_0, _claims_0)))), (_x_0 < _capacity_0))))))), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": {$: "Con", "head": {$: "CollectionState.Claim", "group": _group_0, "owner": _token_0}, "tail": _claims_0}, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $$$$047agent$045flow$045bend$047CollectionState$release_claim$(_state_0, _group_0, _token_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$claim_owned$(_group_0, _token_0, _claims_0)), {$: "CollectionState.Accepted", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": ($$$$047agent$045flow$045bend$047CollectionState$remove_claim$(_group_0, _token_0, _claims_0)), "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}}, {$: "CollectionState.Refused", "state": {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0}});
}

function $$$$047agent$045flow$045bend$047CollectionState$expire_claim$(_state_0, _group_0, _token_0, _elapsed_0, _lifetime_0) {
  return $Bool$pick$(($$$$047agent$045flow$045bend$047Collection$expired$(_elapsed_0, _lifetime_0)), ($$$$047agent$045flow$045bend$047CollectionState$release_claim$(_state_0, _group_0, _token_0)), {$: "CollectionState.Refused", "state": _state_0});
}

function $$$$047agent$045flow$045bend$047CollectionState$delivery_result$(_state_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047CollectionState$finish_reserve$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$reserve$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$finish_release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$release$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$finish_authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$authorize$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$finish_terminal$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$terminal$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _phase_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$finish_end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$end$(_delivery_0, _group_0, _round_0, _attempt_0, _token_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$consume_continuation$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$consume$(_delivery_0, _group_0, _round_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_begin$(_delivery_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_authorize$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_authorize$(_delivery_0, _advice_0, _token_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_terminal$(_delivery_0, _advice_0, _token_0, _certain_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ready"];
  const __1 = _state_0["leases"];
  const __2 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const __3 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return $$$$047agent$045flow$045bend$047CollectionState$delivery_result$({$: "CollectionState.State", "ready": __0, "leases": __1, "claims": __2, "delivery": _delivery_0, "revision": __3, "reuse": _reuse_0, "notices": _notices_0}, ($$$$047agent$045flow$045bend$047DeliveryState$submission_release$(_delivery_0, _advice_0, _token_0)));
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_forget$(_state_0, _advice_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": ($$$$047agent$045flow$045bend$047DeliveryState$submission_forget$(_delivery_0, _advice_0)), "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $$$$047agent$045flow$045bend$047CollectionState$retire_round$(_state_0, _group_0, _round_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": ($$$$047agent$045flow$045bend$047DeliveryState$retire_round$(_delivery_0, _group_0, _round_0)), "revision": _revision_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_suppresses$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const _delivery_0 = _state_0["delivery"];
  return $$$$047agent$045flow$045bend$047DeliveryState$submission_suppresses$(_delivery_0, _advice_0, _fingerprint_0, _round_0, _surface_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_reofferable$(_state_0, _advice_0, _token_0) {
  const _delivery_0 = _state_0["delivery"];
  return $$$$047agent$045flow$045bend$047DeliveryState$submission_reofferable$(_delivery_0, _advice_0, _token_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_expired$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const _delivery_0 = _state_0["delivery"];
  return $$$$047agent$045flow$045bend$047DeliveryState$submission_expired$(_delivery_0, _advice_0, _token_0, _elapsed_0, _lifetime_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_reservation$(_state_0, _group_0, _round_0, _token_0) {
  const _delivery_0 = _state_0["delivery"];
  return $$$$047agent$045flow$045bend$047DeliveryState$submission_reservation$(_delivery_0, _group_0, _round_0, _token_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$submission_ready$(_state_0, _group_0, _round_0, _token_0, _selected_0) {
  const _delivery_0 = _state_0["delivery"];
  return $$$$047agent$045flow$045bend$047DeliveryState$submission_ready$(_delivery_0, _group_0, _round_0, _token_0, _selected_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$revision_register$(_state_0, _subject_0, _input_0, _add_member_0) {
  const _revision_0 = _state_0["revision"];
  return $$$$047agent$045flow$045bend$047RevisionState$register$(_revision_0, _subject_0, _input_0, _add_member_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$revision_replace$(_state_0, _replacement_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _replacement_0, "reuse": _reuse_0, "notices": _notices_0};
}

function $$$$047agent$045flow$045bend$047CollectionState$revision_release$(_state_0, _subject_0, _generation_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": ($$$$047agent$045flow$045bend$047RevisionState$release$(_revision_0, _subject_0, _generation_0)), "reuse": _reuse_0, "notices": _notices_0};
}

function $$$$047agent$045flow$045bend$047CollectionState$revision_current$(_state_0, _subject_0, _input_0, _generation_0) {
  const _revision_0 = _state_0["revision"];
  return $$$$047agent$045flow$045bend$047RevisionState$current$(_revision_0, _subject_0, _input_0, _generation_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$revision_generation$(_state_0, _subject_0) {
  const _revision_0 = _state_0["revision"];
  return $$$$047agent$045flow$045bend$047RevisionState$generation$(_revision_0, _subject_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$revision_count$(_state_0) {
  const _revision_0 = _state_0["revision"];
  return $$$$047agent$045flow$045bend$047RevisionState$count$(_revision_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$revision_superseded$(_state_0, _subject_0, _candidate_subject_0, _generation_0) {
  const _revision_0 = _state_0["revision"];
  return $$$$047agent$045flow$045bend$047RevisionState$superseded$(_revision_0, _subject_0, _candidate_subject_0, _generation_0);
}

function $$$$047agent$045flow$045bend$047CollectionState$reuse_state$(_state_0) {
  const _reuse_0 = _state_0["reuse"];
  return _reuse_0;
}

function $$$$047agent$045flow$045bend$047CollectionState$with_reuse$(_state_0, _replacement_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _notices_0 = _state_0["notices"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _replacement_0, "notices": _notices_0};
}

function $$$$047agent$045flow$045bend$047CollectionState$notice_state$(_state_0) {
  const _notices_0 = _state_0["notices"];
  return _notices_0;
}

function $$$$047agent$045flow$045bend$047CollectionState$with_notices$(_state_0, _replacement_0) {
  const _ready_0 = _state_0["ready"];
  const _leases_0 = _state_0["leases"];
  const _claims_0 = _state_0["claims"];
  const _delivery_0 = _state_0["delivery"];
  const _revision_0 = _state_0["revision"];
  const _reuse_0 = _state_0["reuse"];
  return {$: "CollectionState.State", "ready": _ready_0, "leases": _leases_0, "claims": _claims_0, "delivery": _delivery_0, "revision": _revision_0, "reuse": _reuse_0, "notices": _replacement_0};
}

function $$$$047agent$045flow$045bend$047CollectorAuthority$collect_gate$(_expired_0, _credential_valid_0) {
  return $Bool$pick$(_expired_0, {$: "CollectorAuthority.CollectUnavailable", "reason": {$: "CollectorAuthority.Expired"}}, ($Bool$pick$(($Bool$not$(_credential_valid_0)), {$: "CollectorAuthority.CollectUnavailable", "reason": {$: "CollectorAuthority.Credential"}}, {$: "CollectorAuthority.CollectProceed"})));
}

function $$$$047agent$045flow$045bend$047CollectorAuthority$final_authority$(_admitted_block_0, _current_block_0) {
  return $Bool$pick$(($Bool$and$(_admitted_block_0, ($Bool$not$(_current_block_0)))), {$: "CollectorAuthority.FinalRelease"}, {$: "CollectorAuthority.FinalProceed"});
}

function $$$$047agent$045flow$045bend$047CollectorAuthority$main$() {
  return $$$$047agent$045flow$045bend$047CollectorAuthority$collect_gate$(false, true);
}

function $$$$047agent$045flow$045bend$047Reuse$route$(_live_advice_0, _attached_pending_0, _claimed_pending_0) {
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

function $$$$047agent$045flow$045bend$047Reuse$cache_route$(_hit_0) {
  if (_hit_0) {
    return {$: "Reuse.Cached"};
  } else {
    return {$: "Reuse.Own"};
  }
}

function $$$$047agent$045flow$045bend$047Reuse$joined$route$(_state_0, _has_revision_0, _has_advice_id_0) {
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

function $$$$047agent$045flow$045bend$047Reuse$joined_disposition$(_state_0, _stale_unavailable_0, _has_revision_0, _has_advice_id_0) {
  return $Bool$pick$(_stale_unavailable_0, {$: "Reuse.KeepJoined"}, ($$$$047agent$045flow$045bend$047Reuse$joined$route$(_state_0, _has_revision_0, _has_advice_id_0)));
}

function $$$$047agent$045flow$045bend$047Reuse$main$() {
  return $$$$047agent$045flow$045bend$047Reuse$route$(false, false, false);
}

function $$$$047agent$045flow$045bend$047Configuration$include_choice$(_supplied_0, _current_rank_0, _candidate_rank_0) {
  return $Bool$pick$(($Bool$and$(_supplied_0, ($Nat$is_ge$(_candidate_rank_0, _current_rank_0)))), {$: "Configuration.ReplaceIncludes"}, {$: "Configuration.KeepIncludes"});
}

function $$$$047agent$045flow$045bend$047Configuration$select$(_protected_0, _excluded_0, _includes_empty_0, _included_0) {
  return $Bool$pick$(_protected_0, {$: "Configuration.Protected"}, ($Bool$pick$(_excluded_0, {$: "Configuration.Excluded"}, ($Bool$pick$(_includes_empty_0, {$: "Configuration.EmptyIncludes"}, ($Bool$pick$(_included_0, {$: "Configuration.Selected"}, {$: "Configuration.NotIncluded"})))))));
}

function $$$$047agent$045flow$045bend$047Configuration$protection$(_sensitive_name_0, _generated_or_vendor_0, _allowed_extension_0) {
  return $Bool$pick$(_sensitive_name_0, {$: "Configuration.SensitivePath"}, ($Bool$pick$(_generated_or_vendor_0, {$: "Configuration.GeneratedOrVendor"}, ($Bool$pick$(($Bool$not$(_allowed_extension_0)), {$: "Configuration.FileExtension"}, {$: "Configuration.AllowedPath"})))));
}

function $$$$047agent$045flow$045bend$047Configuration$candidate$(_git_admin_0, _physical_safe_0, _git_allowed_0) {
  return $Bool$pick$(_git_admin_0, {$: "Configuration.RefuseGitAdmin"}, ($Bool$pick$(($Bool$not$(_physical_safe_0)), {$: "Configuration.RefuseFileKind"}, ($Bool$pick$(($Bool$not$(_git_allowed_0)), {$: "Configuration.RefuseGitIgnore"}, {$: "Configuration.CandidateAllowed"})))));
}

function $$$$047agent$045flow$045bend$047Configuration$admit$(_root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0) {
  return $Bool$pick$(($Bool$not$(_root_valid_0)), {$: "Configuration.RefuseRoot"}, ($Bool$pick$(($Bool$not$(_configuration_valid_0)), {$: "Configuration.RefuseConfiguration"}, ($Bool$pick$(($Bool$not$(_credential_ready_0)), {$: "Configuration.RefuseCredential"}, ($Bool$pick$(($Bool$not$(_selected_0)), {$: "Configuration.RefuseSelection"}, {$: "Configuration.AdmitReview"})))))));
}

function $$$$047agent$045flow$045bend$047Configuration$main$() {
  return $$$$047agent$045flow$045bend$047Configuration$select$(false, false, false, true);
}

function $$$$047agent$045flow$045bend$047RulePolicy$valid_words$(_word_0) {
  const _high_0 = _word_0["high"];
  const _low_0 = _word_0["low"];
  const _x_0 = (_high_0 < 1072693248);
  const _x_1 = ($Nat$is_eq$(_low_0, 0));
  return $Bool$and$(($Nat$is_le$(_low_0, 4294967295)), ($Bool$and$(($Nat$is_le$(_high_0, 1072693248)), (_x_0 || _x_1))));
}

function $$$$047agent$045flow$045bend$047RulePolicy$enabled$(_pack_enabled_0, _rule_enabled_0) {
  return $Bool$pick$(($Bool$and$(_pack_enabled_0, _rule_enabled_0)), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $$$$047agent$045flow$045bend$047RulePolicy$target_compatible$(_target_0) {
  if (_target_0.$ === "RulePolicy.TypeShape") {
    return true;
  } else if (_target_0.$ === "RulePolicy.FunctionTarget") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047RulePolicy$applicable$(_consent_0, _complete_0, _target_0, _global_included_0, _global_excluded_0, _pack_enabled_0, _rule_enabled_0, _rule_included_0, _rule_excluded_0, _target_declared_0, _capabilities_available_0, _source_rung_0, _minimum_rung_0) {
  const _scope_ok_0 = ($Bool$and$(_consent_0, _complete_0));
  const _target_ok_0 = ($Bool$and$(($$$$047agent$045flow$045bend$047RulePolicy$target_compatible$(_target_0)), ($Bool$and$(_target_declared_0, _capabilities_available_0))));
  const _path_ok_0 = ($Bool$and$(_global_included_0, ($Bool$and$(($Bool$not$(_global_excluded_0)), ($Bool$and$(_rule_included_0, ($Bool$not$(_rule_excluded_0))))))));
  const _rule_ok_0 = ($Bool$and$(_pack_enabled_0, _rule_enabled_0));
  const _rung_ok_0 = ($Bool$and$(($Nat$is_ge$(_source_rung_0, 1)), ($Bool$and$(($Nat$is_le$(_source_rung_0, 3)), ($Bool$and$(($Nat$is_ge$(_minimum_rung_0, 1)), ($Bool$and$(($Nat$is_le$(_minimum_rung_0, 3)), ($Nat$is_ge$(_source_rung_0, _minimum_rung_0))))))))));
  return $Bool$pick$(($Bool$and$(_scope_ok_0, ($Bool$and$(_target_ok_0, ($Bool$and$(_path_ok_0, ($Bool$and$(_rule_ok_0, _rung_ok_0)))))))), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $$$$047agent$045flow$045bend$047RulePolicy$greater_words$(_left_0, _right_0) {
  const _left_high_0 = _left_0["high"];
  const _left_low_0 = _left_0["low"];
  const _right_high_0 = _right_0["high"];
  const _right_low_0 = _right_0["low"];
  const _x_0 = ($Nat$is_gt$(_left_high_0, _right_high_0));
  const _x_1 = ($Bool$and$(($Nat$is_eq$(_left_high_0, _right_high_0)), ($Nat$is_gt$(_left_low_0, _right_low_0))));
  return (_x_0 || _x_1);
}

function $$$$047agent$045flow$045bend$047RulePolicy$finding$(_probability_0, _threshold_0) {
  return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047RulePolicy$valid_words$(_probability_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047RulePolicy$valid_words$(_threshold_0)), ($$$$047agent$045flow$045bend$047RulePolicy$greater_words$(_probability_0, _threshold_0)))))), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $$$$047agent$045flow$045bend$047RulePolicy$probability_order$(_left_0, _right_0) {
  return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047RulePolicy$valid_words$(_left_0)), ($$$$047agent$045flow$045bend$047RulePolicy$valid_words$(_right_0)))), ($Bool$pick$(($$$$047agent$045flow$045bend$047RulePolicy$greater_words$(_left_0, _right_0)), {$: "RulePolicy.Before"}, ($Bool$pick$(($$$$047agent$045flow$045bend$047RulePolicy$greater_words$(_right_0, _left_0)), {$: "RulePolicy.After"}, {$: "RulePolicy.Equal"})))), {$: "RulePolicy.Equal"});
}

function $$$$047agent$045flow$045bend$047RulePolicy$rank_order_result$(_order_0, _left_rank_0, _right_rank_0) {
  if (_order_0.$ === "RulePolicy.Before") {
    return {$: "RulePolicy.Before"};
  } else if (_order_0.$ === "RulePolicy.After") {
    return {$: "RulePolicy.After"};
  } else {
    return $Bool$pick$((_left_rank_0 < _right_rank_0), {$: "RulePolicy.Before"}, ($Bool$pick$(($Nat$is_gt$(_left_rank_0, _right_rank_0)), {$: "RulePolicy.After"}, {$: "RulePolicy.Equal"})));
  }
}

function $$$$047agent$045flow$045bend$047RulePolicy$rank_order$(_left_0, _right_0, _left_rank_0, _right_rank_0) {
  return $$$$047agent$045flow$045bend$047RulePolicy$rank_order_result$(($$$$047agent$045flow$045bend$047RulePolicy$probability_order$(_left_0, _right_0)), _left_rank_0, _right_rank_0);
}

function $$$$047agent$045flow$045bend$047RulePolicy$advice_order_result$(_order_0, _path_order_0, _id_order_0) {
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

function $$$$047agent$045flow$045bend$047RulePolicy$advice_order$(_left_0, _right_0, _path_order_0, _id_order_0) {
  return $$$$047agent$045flow$045bend$047RulePolicy$advice_order_result$(($$$$047agent$045flow$045bend$047RulePolicy$probability_order$(_left_0, _right_0)), _path_order_0, _id_order_0);
}

function $$$$047agent$045flow$045bend$047RulePolicy$budget$(_position_0, _limit_0) {
  return $Bool$pick$((_position_0 < _limit_0), {$: "RulePolicy.Admit"}, {$: "RulePolicy.Omit"});
}

function $$$$047agent$045flow$045bend$047RulePolicy$main$() {
  return $$$$047agent$045flow$045bend$047RulePolicy$finding$({$: "RulePolicy.Words", "high": 1, "low": 1}, {$: "RulePolicy.Words", "high": 1, "low": 0});
}

function $$$$047agent$045flow$045bend$047Canonical$initial$(_limits_0) {
  return {$: "Canonical.State", "ledger": ($$$$047agent$045flow$045bend$047Ledger$initial$(_limits_0)), "rounds": {$: "Nil"}, "work": {$: "Nil"}, "next_round": 1, "next_operation": 1, "admissions": {$: "Nil"}, "dispatch": ($$$$047agent$045flow$045bend$047Dispatch$initial$()), "collection": ($$$$047agent$045flow$045bend$047CollectionState$initial$()), "history": ($$$$047agent$045flow$045bend$047EditHistory$initial$())};
}

function $$$$047agent$045flow$045bend$047Canonical$with_history$(_state_0, _replacement_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$history_of$(_state_0) {
  const _history_0 = _state_0["history"];
  return _history_0;
}

function $$$$047agent$045flow$045bend$047Canonical$checked_completed_edit$(_state_0, _tool_0, _result_0) {
  if (_result_0.$ === "EditHistory.Absent") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CompletedEditAbsent"}, "tail": {$: "Nil"}}};
  } else {
    const _reason_0 = _result_0["reason"];
    const _report_0 = _result_0["report"];
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_history$(_state_0, ($$$$047agent$045flow$045bend$047EditHistory$mark_reported$(_tool_0, ($$$$047agent$045flow$045bend$047Canonical$history_of$(_state_0)))))), "commands": {$: "Con", "head": {$: "Canonical.CompletedEditSeen", "reason": _reason_0, "report": _report_0}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$check_completed_edit$(_state_0, _tool_0) {
  return $$$$047agent$045flow$045bend$047Canonical$checked_completed_edit$(_state_0, _tool_0, ($$$$047agent$045flow$045bend$047EditHistory$lookup$(_tool_0, ($$$$047agent$045flow$045bend$047Canonical$history_of$(_state_0)))));
}

function $$$$047agent$045flow$045bend$047Canonical$remembered_completed_edit$(_state_0, _result_0) {
  const _replacement_0 = _result_0["state"];
  const _evicted_0 = _result_0["evicted"];
  return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_history$(_state_0, _replacement_0)), "commands": {$: "Con", "head": {$: "Canonical.CompletedEditRemembered", "evicted": _evicted_0}, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$remember_completed_checked$(_state_0, _tool_0, _reason_0, _lookup_0) {
  if (_lookup_0.$ === "EditHistory.Absent") {
    return $$$$047agent$045flow$045bend$047Canonical$remembered_completed_edit$(_state_0, ($$$$047agent$045flow$045bend$047EditHistory$record$(_tool_0, _reason_0, ($$$$047agent$045flow$045bend$047Canonical$history_of$(_state_0)))));
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CompletedEditRemembered", "evicted": {$: "None"}}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$remember_completed_edit$(_state_0, _tool_0, _reason_0) {
  return $$$$047agent$045flow$045bend$047Canonical$remember_completed_checked$(_state_0, _tool_0, _reason_0, ($$$$047agent$045flow$045bend$047EditHistory$lookup$(_tool_0, ($$$$047agent$045flow$045bend$047Canonical$history_of$(_state_0)))));
}

function $$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _id_0, _round_0) {
  const _owner_0 = _round_0["partition"];
  const _generation_0 = _round_0["lifetime"];
  const _current_0 = _round_0["id"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Nat$is_eq$(_current_0, _id_0)))));
}

function $$$$047agent$045flow$045bend$047Canonical$same_partition$(_partition_0, _round_0) {
  const _owner_0 = _round_0["partition"];
  return $Nat$is_eq$(_owner_0, _partition_0);
}

function $$$$047agent$045flow$045bend$047Canonical$admission_matches$(_partition_0, _item_0) {
  const _owner_0 = _item_0["partition"];
  return $Nat$is_eq$(_owner_0, _partition_0);
}

function $$$$047agent$045flow$045bend$047Canonical$find_admission$(_partition_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$admission_matches$(_partition_0, _item_0)), {$: "Some", "value": _item_0}, ($$$$047agent$045flow$045bend$047Canonical$find_admission$(_partition_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$retain_admission$(_item_0, _tail_0, _match_owner_0) {
  if (_match_owner_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$remove_admission$(_partition_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047Canonical$retain_admission$(_item_0, ($$$$047agent$045flow$045bend$047Canonical$remove_admission$(_partition_0, _rest_0)), ($$$$047agent$045flow$045bend$047Canonical$admission_matches$(_partition_0, _item_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$with_admission$(_state_0, _partition_0, _admission_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": {$: "Con", "head": _admission_0, "tail": ($$$$047agent$045flow$045bend$047Canonical$remove_admission$(_partition_0, _admissions_0))}, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0};
}

function $$$$047agent$045flow$045bend$047Canonical$has_partition_work$(_partition_0, _work_0) {
  if (_work_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _work_0["head"];
    const _owner_0 = _t_0["partition"];
    const _rest_0 = _work_0["tail"];
    const _x_0 = ($Nat$is_eq$(_partition_0, _owner_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$has_partition_work$(_partition_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$no_round_for_partition$(_partition_0, _rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _rounds_0["head"];
    const _owner_0 = _t_0["partition"];
    const _rest_0 = _rounds_0["tail"];
    return $Bool$and$(($Bool$not$(($Nat$is_eq$(_partition_0, _owner_0)))), ($$$$047agent$045flow$045bend$047Canonical$no_round_for_partition$(_partition_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$forget_admission_found$(_state_0, _partition_0, _lifetime_0, _found_0) {
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
    return $Bool$pick$(($Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($Bool$not$(_active_0)), ($Bool$and$(($List$is_empty$(_permits_0)), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$has_partition_work$(_partition_0, _work_0)))), ($$$$047agent$045flow$045bend$047Canonical$no_round_for_partition$(_partition_0, _rounds_0)))))))))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": ($$$$047agent$045flow$045bend$047Canonical$remove_admission$(_partition_0, _admissions_0)), "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.AdmissionForgotten"}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$forget_admission$(_state_0, _partition_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$forget_admission_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, ($$$$047agent$045flow$045bend$047Canonical$find_admission$(_partition_0, _admissions_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$current_admission_found$(_partition_0, _lifetime_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _item_0 = _found_0["value"];
    return _item_0;
  } else {
    return $$$$047agent$045flow$045bend$047Admission$initial$(_partition_0, _lifetime_0);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$current_admission$(_state_0, _partition_0, _lifetime_0) {
  const _admissions_0 = _state_0["admissions"];
  return $$$$047agent$045flow$045bend$047Canonical$current_admission_found$(_partition_0, _lifetime_0, ($$$$047agent$045flow$045bend$047Canonical$find_admission$(_partition_0, _admissions_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$pending_advicee_permits_found$(_found_0) {
  if (_found_0.$ === "None") {
    return 0;
  } else {
    const _admission_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047Admission$pending_count$(_admission_0);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$pending_advicee_permits$(_partition_0, _admissions_0) {
  return $$$$047agent$045flow$045bend$047Canonical$pending_advicee_permits_found$(($$$$047agent$045flow$045bend$047Canonical$find_admission$(_partition_0, _admissions_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$pending_resident_permits$(_admissions_0) {
  if (_admissions_0.$ === "Nil") {
    return 0;
  } else {
    const _admission_0 = _admissions_0["head"];
    const _rest_0 = _admissions_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Admission$pending_count$(_admission_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$pending_resident_permits$(_rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$permit_result$(_state_0, _partition_0, _result_0, _command_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": _command_0, "tail": {$: "Nil"}}};
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": _reason_0}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$replace_quiet_round$(_partition_0, _since_0, _rounds_0) {
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
    return {$: "Con", "head": {$: "Canonical.Round", "partition": _owner_0, "lifetime": _lifetime_0, "id": _id_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": _write_0, "uncertain": _uncertain_0, "quiet_since": ($Bool$pick$(($Nat$is_eq$(_partition_0, _owner_0)), _since_0, _previous_0))}, "tail": ($$$$047agent$045flow$045bend$047Canonical$replace_quiet_round$(_partition_0, _since_0, _rest_0))};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$with_quiet_round$(_state_0, _partition_0, _since_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($$$$047agent$045flow$045bend$047Canonical$replace_quiet_round$(_partition_0, _since_0, _rounds_0)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0};
}

function $$$$047agent$045flow$045bend$047Canonical$issue_result$(_state_0, _partition_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["token"];
    if (_t_0.$ === "Some") {
      const _token_0 = _t_0["value"];
      const _t_1 = _result_0["round"];
      if (_t_1.$ === "Some") {
        const _round_0 = _t_1["value"];
        return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_quiet_round$(($$$$047agent$045flow$045bend$047Canonical$with_admission$(_state_0, _partition_0, _admission_0)), _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.PermitIssued", "token": _token_0, "round": _round_0}, "tail": {$: "Nil"}}};
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

function $$$$047agent$045flow$045bend$047Canonical$close_permit_result$(_state_0, _partition_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["round"];
    if (_t_0.$ === "Some") {
      const _round_0 = _t_0["value"];
      return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": {$: "Canonical.PermitRoundClosed", "round": _round_0}, "tail": {$: "Nil"}}};
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.InconsistentLedger"}};
    }
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": _reason_0}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$issue_permit_capacity_checked$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_available_0, _resident_available_0) {
  if (!_advicee_available_0) {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.AdviceePermitLimit"}};
  } else {
    if (!_resident_available_0) {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.ResidentPermitLimit"}};
    } else {
      return $$$$047agent$045flow$045bend$047Canonical$issue_result$(_state_0, _partition_0, ($$$$047agent$045flow$045bend$047Admission$step$(($$$$047agent$045flow$045bend$047Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Issue", "tool": _tool_0, "started": _started_0, "deadline": _deadline_0, "now": _now_0})));
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$issue_permit_capacity$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _x_0 = ($$$$047agent$045flow$045bend$047Canonical$pending_advicee_permits$(_partition_0, _admissions_0));
  const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$pending_resident_permits$(_admissions_0));
  return $$$$047agent$045flow$045bend$047Canonical$issue_permit_capacity_checked$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, (_x_0 < _advicee_limit_0), (_x_1 < _resident_limit_0));
}

function $$$$047agent$045flow$045bend$047Canonical$issue_permit_gate$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0, _gate_0) {
  if (_gate_0.$ === "Admission.PermitDenied") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.ProspectiveDenied"}};
  } else if (_gate_0.$ === "Admission.PermitLate") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.StaleInvocation"}}};
  } else if (_gate_0.$ === "Admission.PermitInvalidClock") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.InvalidClock"}}};
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$issue_permit_capacity$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$issue_permit$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _minimum_started_0, _facts_0) {
  const _clock_valid_0 = _facts_0["clock_valid"];
  const _hook_window_0 = _facts_0["hook_window"];
  const _started_upper_0 = _facts_0["started_upper"];
  const _now_lower_0 = _facts_0["now_lower"];
  const _advicee_limit_0 = _facts_0["advicee_permit_limit"];
  const _resident_limit_0 = _facts_0["resident_permit_limit"];
  return $Bool$pick$(($Nat$is_gt$(_started_0, _minimum_started_0)), ($$$$047agent$045flow$045bend$047Canonical$issue_permit_gate$(_state_0, _partition_0, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _advicee_limit_0, _resident_limit_0, ($$$$047agent$045flow$045bend$047Admission$prospective_gate$({$: "Admission.ProspectiveFacts", "clock_valid": _clock_valid_0, "hook_window": _hook_window_0, "started_upper": _started_upper_0, "now_lower": _now_lower_0, "advicee_permit_limit": _advicee_limit_0, "resident_permit_limit": _resident_limit_0}, _started_0, _now_0)))), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.StaleInvocation"}}});
}

function $$$$047agent$045flow$045bend$047Canonical$release_permit$(_state_0, _partition_0, _lifetime_0, _token_0) {
  return $$$$047agent$045flow$045bend$047Canonical$permit_result$(_state_0, _partition_0, ($$$$047agent$045flow$045bend$047Admission$step$(($$$$047agent$045flow$045bend$047Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Release", "token": _token_0})), {$: "Canonical.PermitReleased"});
}

function $$$$047agent$045flow$045bend$047Canonical$expire_permit_result$(_state_0, _partition_0, _result_0) {
  if (_result_0.$ === "Admission.KeepPermit") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PermitKept"}, "tail": {$: "Nil"}}};
  } else {
    const _admission_0 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_admission$(_state_0, _partition_0, _admission_0)), "commands": {$: "Con", "head": {$: "Canonical.PermitExpired"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$expire_permit_checked$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0, _admission_0) {
  const __0 = _admission_0["partition"];
  const _owner_lifetime_0 = _admission_0["lifetime"];
  const __1 = _admission_0["round"];
  const __2 = _admission_0["active"];
  const __3 = _admission_0["closed_at"];
  const __4 = _admission_0["next_token"];
  const __5 = _admission_0["permits"];
  return $Bool$pick$(($Nat$is_eq$(_owner_lifetime_0, _lifetime_0)), ($$$$047agent$045flow$045bend$047Canonical$expire_permit_result$(_state_0, _partition_0, ($$$$047agent$045flow$045bend$047Admission$expire$({$: "Admission.AdmissionState", "partition": __0, "lifetime": _owner_lifetime_0, "round": __1, "active": __2, "closed_at": __3, "next_token": __4, "permits": __5}, _token_0, _deadline_reached_0)))), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.WrongLifetime"}}});
}

function $$$$047agent$045flow$045bend$047Canonical$expire_permit$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0) {
  return $$$$047agent$045flow$045bend$047Canonical$expire_permit_checked$(_state_0, _partition_0, _lifetime_0, _token_0, _deadline_reached_0, ($$$$047agent$045flow$045bend$047Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$close_permit_checked$(_state_0, _partition_0, _lifetime_0, _expected_0, _at_0, _admission_0) {
  const __0 = _admission_0["partition"];
  const _owner_lifetime_0 = _admission_0["lifetime"];
  const _round_0 = _admission_0["round"];
  const _active_0 = _admission_0["active"];
  const __1 = _admission_0["closed_at"];
  const __2 = _admission_0["next_token"];
  const __3 = _admission_0["permits"];
  return $Bool$pick$(($Nat$is_eq$(_owner_lifetime_0, _lifetime_0)), ($Bool$pick$(($Nat$is_eq$(_expected_0, ($$$$047agent$045flow$045bend$047Admission$candidate_round$(_round_0, _active_0)))), ($$$$047agent$045flow$045bend$047Canonical$close_permit_result$(_state_0, _partition_0, ($$$$047agent$045flow$045bend$047Admission$step$({$: "Admission.AdmissionState", "partition": __0, "lifetime": _owner_lifetime_0, "round": _round_0, "active": _active_0, "closed_at": __1, "next_token": __2, "permits": __3}, _partition_0, _lifetime_0, {$: "Admission.CloseRound", "at": _at_0})))), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}})), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": {$: "Admission.WrongLifetime"}}});
}

function $$$$047agent$045flow$045bend$047Canonical$close_permit_round$(_state_0, _partition_0, _lifetime_0, _round_0, _at_0) {
  return $$$$047agent$045flow$045bend$047Canonical$close_permit_checked$(_state_0, _partition_0, _lifetime_0, _round_0, _at_0, ($$$$047agent$045flow$045bend$047Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _round_0 = _rounds_0["head"];
    const _rest_0 = _rounds_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$same_partition$(_partition_0, _round_0)), {$: "Some", "value": _round_0}, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$remove_round_pick$(_round_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _round_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$remove_round$(_partition_0, _rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _round_0 = _rounds_0["head"];
    const _rest_0 = _rounds_0["tail"];
    return $$$$047agent$045flow$045bend$047Canonical$remove_round_pick$(_round_0, ($$$$047agent$045flow$045bend$047Canonical$remove_round$(_partition_0, _rest_0)), ($$$$047agent$045flow$045bend$047Canonical$same_partition$(_partition_0, _round_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$same_ids$(_a_0, _b_0, _c_0, _x_0, _y_0, _z_0) {
  return $Bool$and$(($Nat$is_eq$(_a_0, _x_0)), ($Bool$and$(($Nat$is_eq$(_b_0, _y_0)), ($Nat$is_eq$(_c_0, _z_0)))));
}

function $$$$047agent$045flow$045bend$047Canonical$work_matches$(_partition_0, _lifetime_0, _round_0, _operation_0, _item_0) {
  const _owner_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["round"];
  const _op_0 = _item_0["operation"];
  return $Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($Nat$is_eq$(_op_0, _operation_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _item_0 = _items_0["head"];
    const _rest_0 = _items_0["tail"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$work_matches$(_partition_0, _lifetime_0, _round_0, _operation_0, _item_0)), {$: "Some", "value": _item_0}, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$remove_work_pick$(_item_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$remove_work$(_operation_0, _items_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$remove_work_pick$({$: "Canonical.Work", "partition": __0, "lifetime": __1, "round": __2, "operation": _op_0, "charge": __3, "kind": __4, "parent": __5}, ($$$$047agent$045flow$045bend$047Canonical$remove_work$(_operation_0, _rest_0)), ($Nat$is_eq$(_op_0, _operation_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0) {
  if (_kind_0.$ === "Canonical.PendingFinding") {
    return false;
  } else {
    return true;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$pending$(_partition_0, _lifetime_0, _round_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _kind_0 = _t_0["kind"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0))));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$pending$(_partition_0, _lifetime_0, _round_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_admission_state$(_admission_0) {
  const _active_0 = _admission_0["active"];
  const _permits_0 = _admission_0["permits"];
  return $Bool$and$(_active_0, ($List$is_empty$(_permits_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_admission$(_state_0, _partition_0, _lifetime_0) {
  return $$$$047agent$045flow$045bend$047Canonical$quiet_admission_state$(($$$$047agent$045flow$045bend$047Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_round_decision$(_state_0, _partition_0, _decision_0) {
  if (_decision_0.$ === "Quiescence.Busy") {
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_quiet_round$(_state_0, _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.QuietRoundBusy"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Quiescence.Waiting") {
    const _since_0 = _decision_0["since"];
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_quiet_round$(_state_0, _partition_0, {$: "Some", "value": _since_0})), "commands": {$: "Con", "head": {$: "Canonical.QuietRoundWaiting", "since": _since_0}, "tail": {$: "Nil"}}};
  } else {
    const _since_1 = _decision_0["since"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.QuietRoundExpired", "since": _since_1}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_round_current$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, _current_0) {
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
  const _quiet_0 = ($Bool$and$(($$$$047agent$045flow$045bend$047Quiescence$facts_quiet$(_facts_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$quiet_admission$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0)), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$pending$(_partition_0, _lifetime_0, _round_0, _work_0)))), ($Bool$and$(($Bool$not$(_waiting_0)), ($Bool$and$(($Bool$not$(_deciding_0)), ($Maybe$is_none$(_write_0))))))))))));
  return $$$$047agent$045flow$045bend$047Canonical$quiet_round_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, ($$$$047agent$045flow$045bend$047Quiescence$decide$(_quiet_since_0, _now_0, _window_0, _quiet_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_round_found$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  } else {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$quiet_round_current$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, _current_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_round_tick$(_state_0, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$quiet_round_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _now_0, _window_0, _facts_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_round_reset_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  } else {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_quiet_round$(_state_0, _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.QuietRoundResetRecorded"}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$quiet_round_reset$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$quiet_round_reset_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$cancel_pick$(_operation_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Canonical.CancelWork", "operation": _operation_0}, "tail": _tail_0};
  } else {
    return _tail_0;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _items_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$cancel_pick$(_op_0, ($$$$047agent$045flow$045bend$047Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$release_pick$(_charge_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": _tail_0};
  } else {
    return _tail_0;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _items_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$release_pick$(_charge_0, ($$$$047agent$045flow$045bend$047Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0)))))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$release_all_commands$(_partition_0, _lifetime_0, _round_0, _items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    const _owner_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _current_0 = _t_0["round"];
    const _charge_0 = _t_0["charge"];
    const _rest_0 = _items_0["tail"];
    return $$$$047agent$045flow$045bend$047Canonical$release_pick$(_charge_0, ($$$$047agent$045flow$045bend$047Canonical$release_all_commands$(_partition_0, _lifetime_0, _round_0, _rest_0)), ($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$release_charge$(_ledger_0, _charge_0) {
  const _limits_0 = _ledger_0["limits"];
  const _next_id_0 = _ledger_0["next_id"];
  const _charges_0 = _ledger_0["charges"];
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($$$$047agent$045flow$045bend$047Ledger$remove$(_charge_0, _charges_0))};
}

function $$$$047agent$045flow$045bend$047Canonical$release_round_charges$($0, $1, $2, $3, $4) {
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
        $1 = ($Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$release_charge$(_ledger_0, _charge_0)), _ledger_0));
        $2 = _partition_0;
        $3 = _lifetime_0;
        $4 = _round_0;
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$release_unfinished_charges$($0, $1, $2, $3, $4) {
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
        $1 = ($Bool$pick$(($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0)))))), ($$$$047agent$045flow$045bend$047Canonical$release_charge$(_ledger_0, _charge_0)), _ledger_0));
        $2 = _partition_0;
        $3 = _lifetime_0;
        $4 = _round_0;
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$retain_work_pick$(_item_0, _tail_0, _remove_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$retain_other_work$(_items_0, _partition_0, _lifetime_0, _round_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$retain_work_pick$({$: "Canonical.Work", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": __0, "charge": __1, "kind": __2, "parent": __3}, ($$$$047agent$045flow$045bend$047Canonical$retain_other_work$(_rest_0, _partition_0, _lifetime_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$retain_after_stop$(_items_0, _partition_0, _lifetime_0, _round_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$retain_work_pick$({$: "Canonical.Work", "partition": _owner_0, "lifetime": _generation_0, "round": _current_0, "operation": __0, "charge": __1, "kind": _kind_0, "parent": __2}, ($$$$047agent$045flow$045bend$047Canonical$retain_after_stop$(_rest_0, _partition_0, _lifetime_0, _round_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_ids$(_partition_0, _lifetime_0, _round_0, _owner_0, _generation_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$open_found$(_state_0, _partition_0, _lifetime_0, _found_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$open$(_state_0, _partition_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$open_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$consume_opened$(_original_0, _round_0, _opened_0) {
  if (_opened_0.$ === "Canonical.Advanced") {
    const _state_0 = _opened_0["state"];
    const _commands_0 = _opened_0["commands"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PermitConsumed", "round": _round_0}, "tail": _commands_0}};
  } else {
    const _reason_0 = _opened_0["reason"];
    return {$: "Canonical.Rejected", "state": _original_0, "reason": _reason_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$consume_existing$(_original_0, _updated_0, _partition_0, _lifetime_0, _round_0, _existing_0) {
  if (_existing_0.$ === "None") {
    return $$$$047agent$045flow$045bend$047Canonical$consume_opened$(_original_0, _round_0, ($$$$047agent$045flow$045bend$047Canonical$open$(_updated_0, _partition_0, _lifetime_0)));
  } else {
    const _t_0 = _existing_0["value"];
    const _owner_lifetime_0 = _t_0["lifetime"];
    return $Bool$pick$(($Nat$is_eq$(_lifetime_0, _owner_lifetime_0)), {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_quiet_round$(_updated_0, _partition_0, {$: "None"})), "commands": {$: "Con", "head": {$: "Canonical.PermitConsumed", "round": _round_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": _original_0, "reason": {$: "Canonical.StaleRound"}});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$consume_admitted$(_state_0, _partition_0, _lifetime_0, _admission_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$consume_existing$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, ($$$$047agent$045flow$045bend$047Canonical$with_admission$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _partition_0, _admission_0)), _partition_0, _lifetime_0, _round_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$consume_result$(_state_0, _partition_0, _lifetime_0, _result_0) {
  if (_result_0.$ === "Admission.Accepted") {
    const _admission_0 = _result_0["state"];
    const _t_0 = _result_0["round"];
    if (_t_0.$ === "Some") {
      const _round_0 = _t_0["value"];
      return $$$$047agent$045flow$045bend$047Canonical$consume_admitted$(_state_0, _partition_0, _lifetime_0, _admission_0, _round_0);
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.InconsistentLedger"}};
    }
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.PermitDenied", "reason": _reason_0}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$consume_permit$(_state_0, _partition_0, _lifetime_0, _token_0, _tool_0, _now_0) {
  return $$$$047agent$045flow$045bend$047Canonical$consume_result$(_state_0, _partition_0, _lifetime_0, ($$$$047agent$045flow$045bend$047Admission$step$(($$$$047agent$045flow$045bend$047Canonical$current_admission$(_state_0, _partition_0, _lifetime_0)), _partition_0, _lifetime_0, {$: "Admission.Consume", "token": _token_0, "tool": _tool_0, "now": _now_0})));
}

function $$$$047agent$045flow$045bend$047Canonical$is_deciding$(_current_0) {
  const _deciding_0 = _current_0["deciding"];
  return _deciding_0;
}

function $$$$047agent$045flow$045bend$047Canonical$admit_observation_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
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
    return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$is_deciding$(_current_0)))))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _next_operation_0, "charge": 0, "kind": {$: "Canonical.AwaitingSourceRead"}, "parent": 0}, "tail": _work_0}, "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationAdmitted", "id": _next_operation_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$admit_observation$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$admit_observation_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$replace_work_kind_pick$(_item_0, _next_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _next_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$replace_work_kind$(_operation_0, _kind_0, _items_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$replace_work_kind_pick$({$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _current_0, "charge": _charge_0, "kind": __0, "parent": _parent_0}, {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _current_0, "charge": _charge_0, "kind": _kind_0, "parent": _parent_0}, ($$$$047agent$045flow$045bend$047Canonical$replace_work_kind$(_operation_0, _kind_0, _rest_0)), ($Nat$is_eq$(_current_0, _operation_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$observation_started_found$(_state_0, _operation_0, _found_0) {
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
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$replace_work_kind$(_operation_0, {$: "Canonical.SourceReading"}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationStarted"}, "tail": {$: "Nil"}}};
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

function $$$$047agent$045flow$045bend$047Canonical$observation_completed_found$(_state_0, _operation_0, _found_0) {
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
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationCompleted"}, "tail": {$: "Nil"}}};
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

function $$$$047agent$045flow$045bend$047Canonical$start_observation$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$observation_started_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _observation_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$complete_observation$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$observation_completed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _observation_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$interrupt_observation_found$(_state_0, _operation_0, _found_0) {
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
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationInterrupted"}, "tail": {$: "Nil"}}};
      } else if (_t_2.$ === "Canonical.SourceReading") {
        return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ObservationInterrupted"}, "tail": {$: "Nil"}}};
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

function $$$$047agent$045flow$045bend$047Canonical$interrupt_observation$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$interrupt_observation_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _observation_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$begin_result$(_state_0, _partition_0, _lifetime_0, _round_0, _parent_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$begin_found$(_state_0, _partition_0, _lifetime_0, _round_0, _bytes_0, _parent_0, _found_0) {
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
    return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$is_deciding$(_current_0)))), ($Nat$is_gt$(_bytes_0, 0)))))), ($$$$047agent$045flow$045bend$047Canonical$begin_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _parent_0, ($$$$047agent$045flow$045bend$047Ledger$reserve_for$(_ledger_0, _partition_0, _bytes_0, {$: "Ledger.Preparation"})))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$begin$(_state_0, _partition_0, _lifetime_0, _round_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$begin_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _bytes_0, 0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$begin_observed_found$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _bytes_0, _found_0) {
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
        return $$$$047agent$045flow$045bend$047Canonical$begin_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _bytes_0, _observation_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
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

function $$$$047agent$045flow$045bend$047Canonical$begin_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _observation_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$begin_observed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _observation_0, _bytes_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _observation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_view$(_ledger_0, _partition_0) {
  const _charges_0 = _ledger_0["charges"];
  return {$: "Canonical.CapacityView", "global": ($$$$047agent$045flow$045bend$047Ledger$total$(_charges_0)), "local": ($$$$047agent$045flow$045bend$047Ledger$partition_usage$(_charges_0, _partition_0)), "charges": _charges_0};
}

function $$$$047agent$045flow$045bend$047Canonical$admit_one$(_result_0, _partition_0, _lifetime_0, _round_0, _operation_0, _position_0, _bytes_0, _parent_0, _work_0, _commands_0) {
  if (_result_0.$ === "Ledger.Granted") {
    const _granted_0 = _result_0["state"];
    const _id_0 = _result_0["id"];
    return {$: "Canonical.Batch", "ledger": _granted_0, "work": {$: "Con", "head": {$: "Canonical.Work", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "charge": _id_0, "kind": {$: "Canonical.Reviewing"}, "parent": _parent_0}, "tail": _work_0}, "next_operation": nat_chk(_operation_0 + 1), "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.UnitAdmitted", "operation": _operation_0, "reservation": _id_0, "position": _position_0, "bytes": _bytes_0, "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_granted_0, _partition_0))}, "tail": {$: "Nil"}}))};
  } else {
    const _unchanged_0 = _result_0["state"];
    return {$: "Canonical.Batch", "ledger": _unchanged_0, "work": _work_0, "next_operation": _operation_0, "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.UnitRefused", "position": _position_0, "bytes": _bytes_0, "reason": ($$$$047agent$045flow$045bend$047Ledger$admission$(_unchanged_0, _partition_0, _bytes_0)), "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_unchanged_0, _partition_0))}, "tail": {$: "Nil"}}))};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$admit_units$($0, $1, $2, $3, $4, $5, $6) {
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
        $1 = ($$$$047agent$045flow$045bend$047Canonical$admit_one$(($$$$047agent$045flow$045bend$047Ledger$reserve_for$(_ledger_0, _partition_0, _size_0, {$: "Ledger.ReviewUnit"})), _partition_0, _lifetime_0, _round_0, _operation_0, _position_0, _size_0, _parent_0, _work_0, _commands_0));
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

function $$$$047agent$045flow$045bend$047Canonical$prepared_batch$(_state_0, _operation_0, _charge_0, _partition_0, _released_0, _batch_0) {
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($List$append$(($$$$047agent$045flow$045bend$047Canonical$remove_work$(_operation_0, _work_0)), _units_0)), "next_round": _next_round_0, "next_operation": _next_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationReleased", "id": _charge_0, "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_released_0, _partition_0))}, "tail": _commands_0}};
}

function $$$$047agent$045flow$045bend$047Canonical$prepared_released$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0, _result_0) {
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
      return $$$$047agent$045flow$045bend$047Canonical$prepared_batch$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _charge_0, _partition_0, _released_0, {$: "Canonical.Batch", "ledger": _released_0, "work": {$: "Nil"}, "next_operation": _next_operation_0, "commands": {$: "Nil"}});
    }
  } else {
    const _size_0 = _bytes_0["head"];
    const _rest_0 = _bytes_0["tail"];
    if (_result_0.$ === "Ledger.Rejected") {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
    } else {
      const _released_1 = _result_0["state"];
      return $$$$047agent$045flow$045bend$047Canonical$prepared_batch$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _charge_0, _partition_0, _released_1, ($$$$047agent$045flow$045bend$047Canonical$admit_units$({$: "Con", "head": _size_0, "tail": _rest_0}, {$: "Canonical.Batch", "ledger": _released_1, "work": {$: "Nil"}, "next_operation": _next_operation_0, "commands": {$: "Nil"}}, _partition_0, _lifetime_0, _round_0, 1, _parent_0)));
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$prepared_release$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$prepared_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$prepared_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0, _found_round_0, _found_work_0) {
  if (_found_round_0.$ === "Some") {
    const _current_0 = _found_round_0["value"];
    if (_found_work_0.$ === "Some") {
      const _t_0 = _found_work_0["value"];
      const _charge_0 = _t_0["charge"];
      const _t_1 = _t_0["kind"];
      if (_t_1.$ === "Canonical.Preparing") {
        const _parent_0 = _t_0["parent"];
        return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$prepared_release$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _charge_0, _parent_0, _bytes_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
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

function $$$$047agent$045flow$045bend$047Canonical$prepared$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  const __3 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$prepared_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _bytes_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)), ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$interrupt_preparation$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  return $$$$047agent$045flow$045bend$047Canonical$prepared$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Nil"});
}

function $$$$047agent$045flow$045bend$047Canonical$start_review_found$(_state_0, _operation_0, _found_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$start_review$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$start_review_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed_released$(_state_0, _operation_0, _outcome_0, _charge_0, _result_0) {
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
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _updated_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$remove_work$(_operation_0, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ReservationReleased", "id": _charge_0}, "tail": {$: "Con", "head": {$: "Canonical.ReviewRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed_retained_result$(_state_0, _operation_0, _result_0) {
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
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _updated_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$replace_work_kind$(_operation_0, {$: "Canonical.PendingFinding", "count": 1}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.ReviewRecorded", "outcome": {$: "Canonical.Finding"}}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed_retained_charge$(_state_0, _operation_0, _charge_0, _found_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$reviewed_retained_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($$$$047agent$045flow$045bend$047Ledger$resize_for$(_ledger_0, _charge_0, _bytes_0, {$: "Ledger.StoredResult"})));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed_retained_find$(_state_0, _operation_0, _charge_0, _ledger_0) {
  const _charges_0 = _ledger_0["charges"];
  return $$$$047agent$045flow$045bend$047Canonical$reviewed_retained_charge$(_state_0, _operation_0, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$find$(_charge_0, _charges_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed_decide$(_state_0, _operation_0, _charge_0, _parent_0, _outcome_0) {
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
    return $Bool$pick$(($Nat$is_gt$(_parent_0, 0)), ($$$$047agent$045flow$045bend$047Canonical$reviewed_retained_find$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _charge_0, _ledger_0)), ($$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)))));
  } else if (_outcome_0.$ === "Canonical.Clear") {
    return $$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Clear"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
  } else if (_outcome_0.$ === "Canonical.Unavailable") {
    return $$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Unavailable"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
  } else if (_outcome_0.$ === "Canonical.Interrupted") {
    return $$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Interrupted"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Discarded"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed_found$(_state_0, _operation_0, _outcome_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _charge_0 = _t_0["charge"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.Reviewing") {
      const _parent_0 = _t_0["parent"];
      return $$$$047agent$045flow$045bend$047Canonical$reviewed_decide$(_state_0, _operation_0, _charge_0, _parent_0, _outcome_0);
    } else if (_t_1.$ === "Canonical.AtJev") {
      const _parent_1 = _t_0["parent"];
      return $$$$047agent$045flow$045bend$047Canonical$reviewed_decide$(_state_0, _operation_0, _charge_0, _parent_1, _outcome_0);
    } else {
      return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$reviewed_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, _outcome_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$retire_review_found$(_state_0, _operation_0, _found_0) {
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
      return $$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Discarded"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$retire_review$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$retire_review_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$finding_count_found$(_state_0, _operation_0, _count_0, _found_0) {
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
      return $Bool$pick$(($Nat$is_gt$(_count_0, 0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$replace_work_kind$(_operation_0, {$: "Canonical.PendingFinding", "count": _count_0}, _work_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.FindingCountRecorded"}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}});
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$finding_count_update$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _count_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$finding_count_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _operation_0, _count_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(_step_0, _command_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$reviewed_stale_found$(_state_0, _operation_0, _found_0) {
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
      return $$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
    } else if (_t_1.$ === "Canonical.AtJev") {
      return $$$$047agent$045flow$045bend$047Canonical$reviewed_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, {$: "Canonical.Finding"}, _charge_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _charge_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reviewed_stale$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$reviewed_stale_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _operation_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$review_observed_choice$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _choice_0) {
  if (_choice_0.$ === "Work.RetainFinding") {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0)), {$: "Canonical.RetainFinding"});
  } else if (_choice_0.$ === "Work.RetireStaleFinding") {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed_stale$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0)), {$: "Canonical.RetireStaleFinding"});
  } else if (_choice_0.$ === "Work.SettleClear") {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0)), {$: "Canonical.SettleClear"});
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0)), {$: "Canonical.SettleStaleClear"});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$is_finding$(_outcome_0) {
  if (_outcome_0.$ === "Canonical.Finding") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$review_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0) {
  return $$$$047agent$045flow$045bend$047Canonical$review_observed_choice$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, ($$$$047agent$045flow$045bend$047Work$evaluated_disposition$(($$$$047agent$045flow$045bend$047Canonical$is_finding$(_outcome_0)), _current_work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$request_outcome_valid$(_outcome_0, _started_0, _interrupted_0) {
  if (_outcome_0.$ === "Canonical.NeverSent") {
    return $Bool$not$(_started_0);
  } else if (_outcome_0.$ === "Canonical.RequestInterrupted") {
    return $Bool$and$(_started_0, _interrupted_0);
  } else {
    return _started_0;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$request_settled_outcome$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0) {
  if (_outcome_0.$ === "Canonical.RequestFinding") {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$review_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Finding"}, _current_work_0)), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": {$: "Canonical.RequestFinding"}});
  } else if (_outcome_0.$ === "Canonical.RequestClear") {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$review_observed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Clear"}, _current_work_0)), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": {$: "Canonical.RequestClear"}});
  } else if (_outcome_0.$ === "Canonical.RequestInterrupted") {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Interrupted"})), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": {$: "Canonical.RequestInterrupted"}});
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Unavailable"})), {$: "Canonical.JevRequestOutcomeRecorded", "outcome": _outcome_0});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$request_settled_work$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.AtJev") {
      return $$$$047agent$045flow$045bend$047Canonical$request_settled_outcome$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0);
    } else {
      return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.JevObservationIgnored"}, "tail": {$: "Nil"}}};
    }
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.JevObservationIgnored"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$request_settled_released$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, _result_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$request_settled_work$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$request_settled_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _outcome_0, _current_work_0, _found_0) {
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
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$request_outcome_valid$(_outcome_0, _started_0, _interrupted_0)), ($$$$047agent$045flow$045bend$047Canonical$request_settled_released$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_work_0, ($$$$047agent$045flow$045bend$047Dispatch$request_update$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, false, false, true)))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$request_settled$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _outcome_0, _current_work_0) {
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
  return $$$$047agent$045flow$045bend$047Canonical$request_settled_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": {$: "Dispatch.State", "queued": __6, "running": __7, "next_sequence": __8, "closed": __9, "requests": _requests_0}, "collection": __10, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _outcome_0, _current_work_0, ($$$$047agent$045flow$045bend$047Dispatch$request_phase$(_requests_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$request_facts_ready$(_root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0) {
  return $Bool$and$(_root_valid_0, ($Bool$and$(_configuration_valid_0, ($Bool$and$(_credential_ready_0, ($Bool$and$(_selected_0, ($Bool$and$(_current_work_0, _physical_available_0)))))))));
}

function $$$$047agent$045flow$045bend$047Canonical$request_ready_reserved$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, _result_0) {
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
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": ($$$$047agent$045flow$045bend$047Canonical$replace_work_kind$(_operation_0, {$: "Canonical.AtJev"}, _work_0)), "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.JevRequestIssued", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "request": _request_0}, "tail": {$: "Nil"}}};
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Unavailable"})), {$: "Canonical.JevRequestUnavailable"});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$request_ready_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _ready_0, _found_0) {
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
      return $Bool$pick$(_ready_0, ($$$$047agent$045flow$045bend$047Canonical$request_ready_reserved$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _next_operation_0, ($$$$047agent$045flow$045bend$047Dispatch$reserve_request$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _next_operation_0)))), ($$$$047agent$045flow$045bend$047Canonical$append_review_disposition$(($$$$047agent$045flow$045bend$047Canonical$reviewed$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, {$: "Canonical.Unavailable"})), {$: "Canonical.JevRequestUnavailable"})));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": _next_operation_0, "admissions": __4, "dispatch": _dispatch_0, "collection": __5, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$request_ready$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$request_ready_found$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, ($$$$047agent$045flow$045bend$047Canonical$request_facts_ready$(_root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0)), ($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$request_update_result$(_state_0, _result_0, _command_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$request_started$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$request_update_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, ($$$$047agent$045flow$045bend$047Dispatch$request_update$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, true, false, false)), {$: "Canonical.JevRequestStartRecorded"});
}

function $$$$047agent$045flow$045bend$047Canonical$request_interrupted$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const __6 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$request_update_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, ($$$$047agent$045flow$045bend$047Dispatch$request_update$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, _request_0, false, true, false)), {$: "Canonical.JevInterruptionRecorded"});
}

function $$$$047agent$045flow$045bend$047Canonical$prepared_offer_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Work.SkipPrepared") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PreparedSkipped"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Work.AdmitPrepared") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PreparedAdmitted"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.PreparedCapacityRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$prepared_offer_check$(_state_0, _ready_0, _within_frame_0) {
  return $$$$047agent$045flow$045bend$047Canonical$prepared_offer_result$(_state_0, ($$$$047agent$045flow$045bend$047Work$prepared_offer$(_ready_0, _within_frame_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$empty_prepared_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Work.FailEmptyLost") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.EmptyLost"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.EmptyAccepted"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$empty_prepared_check$(_state_0, _ready_count_0, _has_non_skipped_0, _authority_bound_0) {
  return $$$$047agent$045flow$045bend$047Canonical$empty_prepared_result$(_state_0, ($$$$047agent$045flow$045bend$047Work$empty_prepared$(_ready_count_0, _has_non_skipped_0, _authority_bound_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$review_failure_result$(_state_0, _decision_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$review_failure_check$(_state_0, _backend_or_timeout_0, _credential_0, _missing_0) {
  return $$$$047agent$045flow$045bend$047Canonical$review_failure_result$(_state_0, ($$$$047agent$045flow$045bend$047Work$failure_disposition$(_backend_or_timeout_0, _credential_0, _missing_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$scope_matches$(_scope_0, _partition_0, _round_0) {
  const _owner_0 = _scope_0["partition"];
  const _current_0 = _scope_0["round"];
  return $Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Nat$is_eq$(_current_0, _round_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$scope_contains$(_scopes_0, _partition_0, _round_0) {
  if (_scopes_0.$ === "Nil") {
    return false;
  } else {
    const _scope_0 = _scopes_0["head"];
    const _rest_0 = _scopes_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Canonical$scope_matches$(_scope_0, _partition_0, _round_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$scope_contains$(_rest_0, _partition_0, _round_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$scope_partition_seen$(_scopes_0, _partition_0) {
  if (_scopes_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _scopes_0["head"];
    const _owner_0 = _t_0["partition"];
    const _rest_0 = _scopes_0["tail"];
    const _x_0 = ($Nat$is_eq$(_owner_0, _partition_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$scope_partition_seen$(_rest_0, _partition_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$scope_round_valid$(_found_0, _partition_0, _lifetime_0, _round_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$is_deciding$(_current_0)))));
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$valid_stop_scopes$(_rounds_0, _lifetime_0, _scopes_0) {
  if (_scopes_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _scopes_0["head"];
    const _partition_0 = _t_0["partition"];
    const _round_0 = _t_0["round"];
    const _rest_0 = _scopes_0["tail"];
    return $Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$scope_partition_seen$(_rest_0, _partition_0)))), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$scope_round_valid$(($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)), _partition_0, _lifetime_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$valid_stop_scopes$(_rounds_0, _lifetime_0, _rest_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$end_scope_valid$(_found_0, _partition_0, _lifetime_0, _round_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0);
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$valid_end_scopes$(_rounds_0, _lifetime_0, _scopes_0) {
  if (_scopes_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _scopes_0["head"];
    const _partition_0 = _t_0["partition"];
    const _round_0 = _t_0["round"];
    const _rest_0 = _scopes_0["tail"];
    return $Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$scope_partition_seen$(_rest_0, _partition_0)))), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$end_scope_valid$(($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)), _partition_0, _lifetime_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$valid_end_scopes$(_rounds_0, _lifetime_0, _rest_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$scoped_pending$(_items_0, _lifetime_0, _scopes_0) {
  if (_items_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _items_0["head"];
    const _partition_0 = _t_0["partition"];
    const _generation_0 = _t_0["lifetime"];
    const _round_0 = _t_0["round"];
    const _kind_0 = _t_0["kind"];
    const _rest_0 = _items_0["tail"];
    const _x_0 = ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0))))));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$scoped_pending$(_rest_0, _lifetime_0, _scopes_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds_hit$(_item_0, _tail_0, _waiting_0, _deciding_0) {
  const _partition_0 = _item_0["partition"];
  const _generation_0 = _item_0["lifetime"];
  const _current_0 = _item_0["id"];
  const _write_0 = _item_0["write"];
  const _uncertain_0 = _item_0["uncertain"];
  const _quiet_since_0 = _item_0["quiet_since"];
  return {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": _write_0, "uncertain": _uncertain_0, "quiet_since": _quiet_since_0}, "tail": _tail_0};
}

function $$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds_one$(_item_0, _tail_0, _hit_0, _waiting_0, _deciding_0) {
  if (_hit_0) {
    return $$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds_hit$(_item_0, _tail_0, _waiting_0, _deciding_0);
  } else {
    return {$: "Con", "head": _item_0, "tail": _tail_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds$(_items_0, _group_0, _lifetime_0, _round_0, _scopes_0, _waiting_0, _deciding_0) {
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
    const _x_0 = ($$$$047agent$045flow$045bend$047Canonical$same_round$(_group_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": __0, "deciding": __1, "write": __2, "uncertain": __3, "quiet_since": _quiet_since_0}));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$scope_contains$(_scopes_0, _partition_0, _current_0));
    return $$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds_one$({$: "Canonical.Round", "partition": _partition_0, "lifetime": _generation_0, "id": _current_0, "waiting": __0, "deciding": __1, "write": __2, "uncertain": __3, "quiet_since": _quiet_since_0}, ($$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds$(_rest_0, _group_0, _lifetime_0, _round_0, _scopes_0, _waiting_0, _deciding_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), (_x_0 || _x_1))), _waiting_0, _deciding_0);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$release_scoped_charges$($0, $1, $2, $3) {
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
        $1 = ($Bool$pick$(($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0)))))))), ($$$$047agent$045flow$045bend$047Canonical$release_charge$(_ledger_0, _charge_0)), _ledger_0));
        $2 = _lifetime_0;
        $3 = _scopes_0;
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$retain_scoped_work$(_items_0, _lifetime_0, _scopes_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$retain_work_pick$({$: "Canonical.Work", "partition": _partition_0, "lifetime": _generation_0, "round": _round_0, "operation": __0, "charge": __1, "kind": _kind_0, "parent": __2}, ($$$$047agent$045flow$045bend$047Canonical$retain_scoped_work$(_rest_0, _lifetime_0, _scopes_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0)))))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$release_scoped_commands$(_items_0, _lifetime_0, _scopes_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$release_pick$(_charge_0, ($$$$047agent$045flow$045bend$047Canonical$release_scoped_commands$(_rest_0, _lifetime_0, _scopes_0)), ($Bool$and$(($Nat$is_gt$(_charge_0, 0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0)))))))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$dispatch_work_unfinished$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _kind_0 = _t_0["kind"];
    return $$$$047agent$045flow$045bend$047Canonical$unfinished$(_kind_0);
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cancel_dispatch_entries$(_items_0, _work_0, _lifetime_0, _scopes_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$cancel_pick$(_operation_0, ($$$$047agent$045flow$045bend$047Canonical$cancel_dispatch_entries$(_rest_0, _work_0, _lifetime_0, _scopes_0)), ($Bool$and$(($Bool$not$(_cancelled_0)), ($Bool$and$(($Nat$is_eq$(_generation_0, _lifetime_0)), ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$scope_contains$(_scopes_0, _partition_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$dispatch_work_unfinished$(($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _generation_0, _round_0, _operation_0, _work_0)))))))))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cancel_scoped_dispatch$(_dispatch_0, _work_0, _lifetime_0, _scopes_0) {
  const _queued_0 = _dispatch_0["queued"];
  const _running_0 = _dispatch_0["running"];
  return $List$append$(($$$$047agent$045flow$045bend$047Canonical$cancel_dispatch_entries$(_queued_0, _work_0, _lifetime_0, _scopes_0)), ($$$$047agent$045flow$045bend$047Canonical$cancel_dispatch_entries$(_running_0, _work_0, _lifetime_0, _scopes_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group_wait$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, true, false)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WaitForWork"}, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group_ready$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _continuations_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($$$$047agent$045flow$045bend$047Canonical$release_scoped_charges$(_work_0, _ledger_0, _lifetime_0, _scopes_0)), "rounds": ($$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, false, true)), "work": ($$$$047agent$045flow$045bend$047Canonical$retain_scoped_work$(_work_0, _lifetime_0, _scopes_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": ($List$append$(($$$$047agent$045flow$045bend$047Canonical$release_scoped_commands$(_work_0, _lifetime_0, _scopes_0)), ($List$append$(($$$$047agent$045flow$045bend$047Canonical$cancel_scoped_dispatch$(_dispatch_0, _work_0, _lifetime_0, _scopes_0)), {$: "Con", "head": ($Bool$pick$((_continuations_0 < 4), {$: "Canonical.FinishReady"}, {$: "Canonical.FinishLimit"})), "tail": {$: "Nil"}}))))};
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group_checked$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _deadline_0, _extra_pending_0, _continuations_0, _found_0) {
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
    const _x_0 = ($$$$047agent$045flow$045bend$047Canonical$scoped_pending$(_work_0, _lifetime_0, _scopes_0));
    return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_group_0, _lifetime_0, _round_0, _current_0)), ($Bool$and$(($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$is_deciding$(_current_0)))), ($$$$047agent$045flow$045bend$047Canonical$valid_stop_scopes$(_rounds_0, _lifetime_0, _scopes_0)))))), ($Bool$pick$(($Bool$and$(($Bool$not$(_deadline_0)), (_extra_pending_0 || _x_0))), ($$$$047agent$045flow$045bend$047Canonical$stop_group_wait$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0)), ($$$$047agent$045flow$045bend$047Canonical$stop_group_ready$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, _continuations_0)))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _deadline_0, _extra_pending_0, _continuations_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$stop_group_checked$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, _deadline_0, _extra_pending_0, _continuations_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_group_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group_end_apply$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": ($$$$047agent$045flow$045bend$047Canonical$mark_stop_rounds$(_rounds_0, _group_0, _lifetime_0, _round_0, _scopes_0, false, false)), "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.StopEnded"}, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group_end_valid$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _valid_0) {
  return $Bool$pick$(_valid_0, ($$$$047agent$045flow$045bend$047Canonical$stop_group_end_apply$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group_end_checked$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0, _found_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$stop_group_end_valid$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_group_0, _lifetime_0, _round_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$valid_end_scopes$(_rounds_0, _lifetime_0, _scopes_0)))));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$stop_group_end$(_state_0, _group_0, _lifetime_0, _round_0, _scopes_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$stop_group_end_checked$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, _group_0, _lifetime_0, _round_0, _scopes_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_group_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$stop_ready$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _uncertain_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($$$$047agent$045flow$045bend$047Canonical$release_unfinished_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": false, "deciding": true, "write": {$: "None"}, "uncertain": _uncertain_0, "quiet_since": {$: "None"}}, "tail": ($$$$047agent$045flow$045bend$047Canonical$remove_round$(_partition_0, _rounds_0))}, "work": ($$$$047agent$045flow$045bend$047Canonical$retain_after_stop$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": ($List$append$(($$$$047agent$045flow$045bend$047Canonical$release_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($$$$047agent$045flow$045bend$047Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": ($Bool$pick$(($Bool$and$(_uncertain_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.ReofferAtStop"}, {$: "Canonical.FinishReady"})), "tail": {$: "Nil"}}))))};
}

function $$$$047agent$045flow$045bend$047Canonical$stop_output$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _write_0, _uncertain_0) {
  if (!_deadline_0) {
    if (_write_0.$ === "Some") {
      return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.WaitForOutput"}, "tail": {$: "Nil"}}};
    } else {
      return $$$$047agent$045flow$045bend$047Canonical$stop_ready$(_state_0, _partition_0, _lifetime_0, _round_0, false, _uncertain_0);
    }
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$stop_ready$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _uncertain_0);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$stop_current$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _has_pending_0, _write_0, _uncertain_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($Bool$and$(_has_pending_0, ($Bool$not$(_deadline_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": true, "deciding": false, "write": _write_0, "uncertain": _uncertain_0, "quiet_since": {$: "None"}}, "tail": ($$$$047agent$045flow$045bend$047Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WaitForWork"}, "tail": {$: "Nil"}}}, ($$$$047agent$045flow$045bend$047Canonical$stop_output$({$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, _write_0, _uncertain_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$match_pending$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _current_0) {
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
  return $$$$047agent$045flow$045bend$047Canonical$stop_current$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($$$$047agent$045flow$045bend$047Canonical$pending$(_partition_0, _lifetime_0, _round_0, _work_0)), _write_0, _uncertain_0);
}

function $$$$047agent$045flow$045bend$047Canonical$stop_found$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($Bool$not$(($$$$047agent$045flow$045bend$047Canonical$is_deciding$(_current_0)))))), ($$$$047agent$045flow$045bend$047Canonical$match_pending$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0, _current_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$stop$(_state_0, _partition_0, _lifetime_0, _round_0, _deadline_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$stop_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _deadline_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$output_start_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
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
      return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": _uncertain_0, "quiet_since": _quiet_since_0})), ($Bool$not$(_deciding_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": false, "write": {$: "Some", "value": _next_operation_0}, "uncertain": _uncertain_0, "quiet_since": _quiet_since_0}, "tail": ($$$$047agent$045flow$045bend$047Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": nat_chk(_next_operation_0 + 1), "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WriteAuthorized", "operation": _next_operation_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}});
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$output_start$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$output_start_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$write_is_unknown$(_outcome_0) {
  if (_outcome_0.$ === "Canonical.Unknown") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$output_terminal_current$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_0) {
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
    return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "Some", "value": _token_0}, "uncertain": __3, "quiet_since": _quiet_since_0})), ($Nat$is_eq$(_token_0, _operation_0)))), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": {$: "Con", "head": {$: "Canonical.Round", "partition": _partition_0, "lifetime": _lifetime_0, "id": _round_0, "waiting": _waiting_0, "deciding": _deciding_0, "write": {$: "None"}, "uncertain": ($$$$047agent$045flow$045bend$047Canonical$write_is_unknown$(_outcome_0)), "quiet_since": _quiet_since_0}, "tail": ($$$$047agent$045flow$045bend$047Canonical$remove_round$(_partition_0, _rounds_0))}, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.WriteRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}}, {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}});
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$output_terminal_found$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $$$$047agent$045flow$045bend$047Canonical$output_terminal_current$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, _current_0);
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$output_terminal$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$output_terminal_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, _operation_0, _outcome_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$retire_current$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const _ledger_0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _next_round_0 = _state_0["next_round"];
  const _next_operation_0 = _state_0["next_operation"];
  const _admissions_0 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": ($$$$047agent$045flow$045bend$047Canonical$release_round_charges$(_work_0, _ledger_0, _partition_0, _lifetime_0, _round_0)), "rounds": ($$$$047agent$045flow$045bend$047Canonical$remove_round$(_partition_0, _rounds_0)), "work": ($$$$047agent$045flow$045bend$047Canonical$retain_other_work$(_work_0, _partition_0, _lifetime_0, _round_0)), "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": ($$$$047agent$045flow$045bend$047CollectionState$retire_round$(_collection_0, _partition_0, _round_0)), "history": _history_0}, "commands": ($List$append$(($$$$047agent$045flow$045bend$047Canonical$release_all_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), ($List$append$(($$$$047agent$045flow$045bend$047Canonical$cancel_commands$(_partition_0, _lifetime_0, _round_0, _work_0)), {$: "Con", "head": {$: "Canonical.PartitionRetired", "round": _round_0}, "tail": {$: "Nil"}}))))};
}

function $$$$047agent$045flow$045bend$047Canonical$retire_found$(_state_0, _partition_0, _lifetime_0, _round_0, _found_0) {
  if (_found_0.$ === "Some") {
    const _current_0 = _found_0["value"];
    return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$same_round$(_partition_0, _lifetime_0, _round_0, _current_0)), ($$$$047agent$045flow$045bend$047Canonical$retire_current$(_state_0, _partition_0, _lifetime_0, _round_0)), {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}});
  } else {
    return {$: "Canonical.Rejected", "state": _state_0, "reason": {$: "Canonical.StaleRound"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$retire$(_state_0, _partition_0, _lifetime_0, _round_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$retire_found$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _lifetime_0, _round_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_reserve_result$(_state_0, _partition_0, _bytes_0, _result_0) {
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
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityGranted", "id": _id_0, "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}};
  } else {
    const _ledger_1 = _result_0["state"];
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityRefused", "reason": ($$$$047agent$045flow$045bend$047Ledger$admission$(_ledger_1, _partition_0, _bytes_0)), "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_ledger_1, _partition_0))}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_reserve$(_state_0, _partition_0, _bytes_0, _purpose_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$capacity_reserve_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _partition_0, _bytes_0, ($$$$047agent$045flow$045bend$047Ledger$reserve_for$(_ledger_0, _partition_0, _bytes_0, _purpose_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_resize_result$(_state_0, _id_0, _partition_0, _bytes_0, _result_0) {
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
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityResized", "id": _id_0, "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}};
  } else {
    const _t_0 = _result_0["state"];
    const _limits_0 = _t_0["limits"];
    const _next_id_0 = _t_0["next_id"];
    const _charges_0 = _t_0["charges"];
    const _others_0 = {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($$$$047agent$045flow$045bend$047Ledger$remove$(_id_0, _charges_0))};
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CapacityRefused", "reason": ($$$$047agent$045flow$045bend$047Ledger$admission$(_others_0, _partition_0, _bytes_0)), "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$({$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}, _partition_0))}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_resize_found$(_state_0, _id_0, _bytes_0, _purpose_0, _found_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$capacity_resize_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _partition_0, _bytes_0, ($$$$047agent$045flow$045bend$047Ledger$resize_for$(_ledger_0, _id_0, _bytes_0, _purpose_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_resize$(_state_0, _id_0, _bytes_0, _purpose_0) {
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
  return $$$$047agent$045flow$045bend$047Canonical$capacity_resize_found$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _bytes_0, _purpose_0, ($$$$047agent$045flow$045bend$047Ledger$find$(_id_0, _charges_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_release_result$(_state_0, _id_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$capacity_release$(_state_0, _id_0) {
  const _ledger_0 = _state_0["ledger"];
  const __0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$capacity_release_result$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _id_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_replace_one$(_partition_0, _position_0, _bytes_0, _commands_0, _result_0) {
  if (_result_0.$ === "Ledger.Granted") {
    const _ledger_0 = _result_0["state"];
    const _id_0 = _result_0["id"];
    return {$: "Canonical.CapacityBatch", "ledger": _ledger_0, "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.CapacityUnitAdmitted", "reservation": _id_0, "position": _position_0, "bytes": _bytes_0, "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_ledger_0, _partition_0))}, "tail": {$: "Nil"}}))};
  } else {
    const _ledger_1 = _result_0["state"];
    return {$: "Canonical.CapacityBatch", "ledger": _ledger_1, "commands": ($List$append$(_commands_0, {$: "Con", "head": {$: "Canonical.CapacityUnitRefused", "position": _position_0, "bytes": _bytes_0, "reason": ($$$$047agent$045flow$045bend$047Ledger$admission$(_ledger_1, _partition_0, _bytes_0)), "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_ledger_1, _partition_0))}, "tail": {$: "Nil"}}))};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_replace_units$($0, $1, $2, $3) {
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
        $1 = ($$$$047agent$045flow$045bend$047Canonical$capacity_replace_one$(_partition_0, _position_0, _size_0, _commands_0, ($$$$047agent$045flow$045bend$047Ledger$reserve_for$(_ledger_0, _partition_0, _size_0, {$: "Ledger.ReviewUnit"}))));
        $2 = _partition_0;
        $3 = nat_chk(_position_0 + 1);
        continue;
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_replace_batch$(_state_0, _id_0, _partition_0, _released_0, _batch_0) {
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
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.PreparationReleased", "id": _id_0, "after": ($$$$047agent$045flow$045bend$047Canonical$capacity_view$(_released_0, _partition_0))}, "tail": _commands_0}};
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_replace_released$(_state_0, _id_0, _partition_0, _sizes_0, _result_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$capacity_replace_batch$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": __1, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _partition_0, _released_0, ($$$$047agent$045flow$045bend$047Canonical$capacity_replace_units$(_sizes_0, {$: "Canonical.CapacityBatch", "ledger": _released_0, "commands": {$: "Nil"}}, _partition_0, 1)));
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": __1, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_replace_found$(_state_0, _id_0, _sizes_0, _found_0) {
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
      return $$$$047agent$045flow$045bend$047Canonical$capacity_replace_released$({$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _partition_0, _sizes_0, ($$$$047agent$045flow$045bend$047Ledger$release$(_ledger_0, _id_0)));
    } else {
      return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
    }
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": __0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$capacity_replace$(_state_0, _id_0, _sizes_0) {
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
  return $$$$047agent$045flow$045bend$047Canonical$capacity_replace_found$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, _id_0, _sizes_0, ($$$$047agent$045flow$045bend$047Ledger$find$(_id_0, _charges_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$dispatch_commands$(_items_0) {
  if (_items_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _items_0["head"];
    if (_t_0.$ === "Dispatch.Started") {
      const _operation_0 = _t_0["operation"];
      const _sequence_0 = _t_0["sequence"];
      const _rest_0 = _items_0["tail"];
      return {$: "Con", "head": {$: "Canonical.DispatchStarted", "operation": _operation_0, "sequence": _sequence_0}, "tail": ($$$$047agent$045flow$045bend$047Canonical$dispatch_commands$(_rest_0))};
    } else {
      const _operation_1 = _t_0["operation"];
      const _running_0 = _t_0["running"];
      const _rest_1 = _items_0["tail"];
      return {$: "Con", "head": {$: "Canonical.DispatchDiscarded", "operation": _operation_1, "running": _running_0}, "tail": ($$$$047agent$045flow$045bend$047Canonical$dispatch_commands$(_rest_1))};
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$dispatch_result$(_state_0, _result_0) {
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
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "commands": ($$$$047agent$045flow$045bend$047Canonical$dispatch_commands$(_commands_0))};
  } else {
    return {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": _ledger_0, "rounds": _rounds_0, "work": _work_0, "next_round": _next_round_0, "next_operation": _next_operation_0, "admissions": _admissions_0, "dispatch": __0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$work_dispatchable$(_found_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$dispatch_preparation$(_found_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$queue_dispatch$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$work_dispatchable$(($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)))), ($$$$047agent$045flow$045bend$047Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047Dispatch$enqueue$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0, ($$$$047agent$045flow$045bend$047Canonical$dispatch_preparation$(($$$$047agent$045flow$045bend$047Canonical$find_work$(_partition_0, _lifetime_0, _round_0, _operation_0, _work_0)))))))), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": _work_0, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.StaleOperation"}});
}

function $$$$047agent$045flow$045bend$047Canonical$settle_dispatch$(_state_0, _partition_0, _lifetime_0, _round_0, _operation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047Dispatch$settle$(_dispatch_0, _partition_0, _lifetime_0, _round_0, _operation_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$discard_dispatch$(_state_0, _operations_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047Dispatch$discard$(_dispatch_0, _operations_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$close_dispatch$(_state_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const _dispatch_0 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$dispatch_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047Dispatch$close$(_dispatch_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$dispatch_scope_result$(_state_0, _result_0) {
  if (_result_0.$ === "Retention.NamedOnly") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DiscardNamedOnly"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DiscardAllUnfinished"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$dispatch_scope$(_state_0, _named_count_0, _cancelled_count_0, _has_unnamed_0) {
  return $$$$047agent$045flow$045bend$047Canonical$dispatch_scope_result$(_state_0, ($$$$047agent$045flow$045bend$047Retention$discard_scope$(_named_count_0, _cancelled_count_0, _has_unnamed_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$with_collection$(_state_0, _replacement_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$collection_decision$(_state_0, _decision_0, _accepted_0, _refused_0) {
  if (_decision_0.$ === "CollectionState.Accepted") {
    const _collection_0 = _decision_0["state"];
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$(_state_0, _collection_0)), "commands": {$: "Con", "head": _accepted_0, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": _refused_0, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$unfinished_for_observation$($0, $1, $2, $3, $4) {
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
          const _x_3 = ($$$$047agent$045flow$045bend$047Canonical$unfinished_for_observation$(_rest_1, _partition_0, _lifetime_0, _round_0, _observation_0));
          return (_x_2 || _x_3);
        }
      }
    }
  }
}

function $$$$047agent$045flow$045bend$047Canonical$finding_for_observation$($0, $1, $2, $3, $4, $5) {
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
          const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$finding_for_observation$(_rest_0, _partition_0, _lifetime_0, _round_0, _observation_0, _advice_0));
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

function $$$$047agent$045flow$045bend$047Canonical$deciding_round$(_found_0, _group_0, _lifetime_0, _round_0) {
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
    return $Bool$and$(_deciding_0, ($$$$047agent$045flow$045bend$047Canonical$same_round$(_group_0, _lifetime_0, _round_0, {$: "Canonical.Round", "partition": __0, "lifetime": __1, "id": __2, "waiting": __3, "deciding": _deciding_0, "write": __4, "uncertain": __5, "quiet_since": _quiet_since_0})));
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$collection_ready$(_state_0, _advice_0, _partition_0, _lifetime_0, _round_0, _observation_0, _joined_pending_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  const __3 = _state_0["admissions"];
  const __4 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  const _x_0 = ($$$$047agent$045flow$045bend$047Canonical$unfinished_for_observation$(_work_0, _partition_0, _lifetime_0, _round_0, _observation_0));
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$mark_ready$(_collection_0, _advice_0, ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$finding_for_observation$(_work_0, _partition_0, _lifetime_0, _round_0, _observation_0, _advice_0)), ($$$$047agent$045flow$045bend$047Collection$eligible$(($$$$047agent$045flow$045bend$047Canonical$deciding_round$(($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rounds_0)), _partition_0, _lifetime_0, _round_0)), ($Bool$not$((_joined_pending_0 || _x_0))))))))), {$: "Canonical.CollectionEligible"}, {$: "Canonical.CollectionWaiting"});
}

function $$$$047agent$045flow$045bend$047Canonical$collection_credential_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Collection.RetireAdvice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionRetireCredential"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionRetainCredential"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$collection_candidate$(_state_0, _same_partition_0, _unleased_0, _has_unsuppressed_0, _authority_owns_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Delivery$advice_candidate$(_same_partition_0, _unleased_0, _has_unsuppressed_0, _authority_owns_0)), {$: "Canonical.CollectionCandidate"}, {$: "Canonical.CollectionSkip"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$collection_order_result$(_state_0, _order_0) {
  if (_order_0.$ === "Collection.Before") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionBefore"}, "tail": {$: "Nil"}}};
  } else if (_order_0.$ === "Collection.Equal") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionEqual"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionAfter"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$collection_expiry$(_state_0, _elapsed_0, _lifetime_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Collection$expired$(_elapsed_0, _lifetime_0)), {$: "Canonical.CollectionExpired"}, {$: "Canonical.CollectionCurrent"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$collection_fit$(_state_0, _items_0, _bytes_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Handoff$fits_batch$(_items_0, _bytes_0)), {$: "Canonical.CollectionFits"}, {$: "Canonical.CollectionLimited"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$collection_finding_result$(_state_0, _current_0, _oversized_0, _fits_0) {
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$not$(_current_0)), {$: "Canonical.CollectionFindingExpired"}, ($Bool$pick$(_oversized_0, {$: "Canonical.CollectionFindingLimited"}, ($Bool$pick$(_fits_0, {$: "Canonical.CollectionFindingSelected"}, {$: "Canonical.CollectionFindingRetained"})))))), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$collection_finding$(_state_0, _selection_partition_0, _selection_round_0, _unit_0, _partition_0, _round_0, _snapshot_0, _current_snapshot_0, _credential_0, _current_credential_0, _age_ms_0, _solo_bytes_0, _collection_ready_0, _selected_count_0, _prospective_bytes_0) {
  return $$$$047agent$045flow$045bend$047Canonical$collection_finding_result$(_state_0, ($$$$047agent$045flow$045bend$047Handoff$current$({$: "Handoff.Advice", "id": 1, "unit": _unit_0, "partition": _partition_0, "round": _round_0, "snapshot": _snapshot_0, "current_snapshot": _current_snapshot_0, "credential": _credential_0, "current_credential": _current_credential_0, "age_ms": _age_ms_0, "solo_bytes": _solo_bytes_0, "collection_ready": _collection_ready_0}, _selection_partition_0, _selection_round_0)), ($Nat$is_gt$(_solo_bytes_0, 10240)), ($$$$047agent$045flow$045bend$047Handoff$fits_batch$(nat_chk(_selected_count_0 + 1), _prospective_bytes_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$collection_notice_result$(_state_0, _result_0) {
  if (_result_0.$ === "Handoff.IncludeNotice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionNoticeIncluded"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "Handoff.SkipNotice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionNoticeSkipped"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectionNoticeStopped"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$collection_reserve$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$reserve$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseReserved"}, {$: "Canonical.CollectionLeaseRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$collection_release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$release$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseReleased"}, {$: "Canonical.CollectionLeaseRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$collection_lease_keep$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$owns_lease$(_collection_0, _advice_0, _token_0)), {$: "Canonical.CollectionLeaseKept"}, {$: "Canonical.CollectionLeaseRefused"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$collection_lease_checked$(_state_0, _advice_0, _token_0, _action_0) {
  if (_action_0.$ === "Delivery.DropLease") {
    return $$$$047agent$045flow$045bend$047Canonical$collection_release$(_state_0, _advice_0, _token_0);
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$collection_lease_keep$(_state_0, _advice_0, _token_0);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$collection_lease_check$(_state_0, _advice_0, _token_0, _expired_0, _stop_collector_0, _same_group_0, _reofferable_0) {
  return $$$$047agent$045flow$045bend$047Canonical$collection_lease_checked$(_state_0, _advice_0, _token_0, ($$$$047agent$045flow$045bend$047Delivery$collection_lease$(true, _expired_0, _stop_collector_0, _same_group_0, _reofferable_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$collection_retire$(_state_0, _advice_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$protected_advice$(_collection_0, _advice_0)), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}}, {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$retire$(_collection_0, _advice_0)))), "commands": {$: "Con", "head": {$: "Canonical.CollectionAdviceRetired"}, "tail": {$: "Nil"}}});
}

function $$$$047agent$045flow$045bend$047Canonical$collection_claim$(_state_0, _group_0, _token_0, _active_0, _capacity_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$claim$(_collection_0, _group_0, _token_0, _active_0, _capacity_0)), {$: "Canonical.CollectionBackgroundClaimed"}, {$: "Canonical.CollectionBackgroundRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$collection_release_background$(_state_0, _group_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$release_claim$(_collection_0, _group_0, _token_0)), {$: "Canonical.CollectionBackgroundReleased"}, {$: "Canonical.CollectionBackgroundRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$collection_expire_background$(_state_0, _group_0, _token_0, _elapsed_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$expire_claim$(_collection_0, _group_0, _token_0, _elapsed_0, _lifetime_0)), {$: "Canonical.CollectionBackgroundReleased"}, {$: "Canonical.CollectionBackgroundKept"});
}

function $$$$047agent$045flow$045bend$047Canonical$pending_count$($0, $1) {
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
          return $Bool$pick$(($Nat$is_eq$(_operation_0, _candidate_0)), _count_0, ($$$$047agent$045flow$045bend$047Canonical$pending_count$(_operation_0, _rest_0)));
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

function $$$$047agent$045flow$045bend$047Canonical$selected_count$(_operation_0, _selected_0) {
  if (_selected_0.$ === "Nil") {
    return 0;
  } else {
    const _candidate_0 = _selected_0["head"];
    const _rest_0 = _selected_0["tail"];
    const _x_0 = ($Bool$pick$(($Nat$is_eq$(_operation_0, _candidate_0)), 1, 0));
    const _x_1 = ($$$$047agent$045flow$045bend$047Canonical$selected_count$(_operation_0, _rest_0));
    return nat_chk(_x_0 + _x_1);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$selected_valid$(_all_0, _remaining_0, _work_0) {
  if (_remaining_0.$ === "Nil") {
    return true;
  } else {
    const _operation_0 = _remaining_0["head"];
    const _rest_0 = _remaining_0["tail"];
    return $Bool$and$(($Nat$is_gt$(_operation_0, 0)), ($Bool$and$(($Nat$is_le$(($$$$047agent$045flow$045bend$047Canonical$selected_count$(_operation_0, _all_0)), ($$$$047agent$045flow$045bend$047Canonical$pending_count$(_operation_0, _work_0)))), ($$$$047agent$045flow$045bend$047Canonical$selected_valid$(_all_0, _rest_0, _work_0)))));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$selected_pending$(_selected_0, _work_0) {
  return $$$$047agent$045flow$045bend$047Canonical$selected_valid$(_selected_0, _selected_0, _work_0);
}

function $$$$047agent$045flow$045bend$047Canonical$finish_reserve_decision$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$finish_reserve$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.FinishReserved"}, {$: "Canonical.FinishRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$finish_reserve$(_state_0, _group_0, _lifetime_0, _round_0, _attempt_0, _token_0, _selected_0, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const __1 = _state_0["next_round"];
  const __2 = _state_0["next_operation"];
  const __3 = _state_0["admissions"];
  const __4 = _state_0["dispatch"];
  const __5 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($Bool$not$(_can_write_0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(_deadline_reached_0, {$: "Canonical.FinishAllowedDeadline"}, {$: "Canonical.FinishAllowedNoAdvice"})), "tail": {$: "Nil"}}}, ($Bool$pick$(($Nat$is_eq$(($List$length$(_selected_0)), 0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_has_notice_0, _pass_notices_0)), {$: "Canonical.FinishNotices"}, ($Bool$pick$(_deadline_reached_0, {$: "Canonical.FinishAllowedDeadline"}, {$: "Canonical.FinishAllowedNoAdvice"})))), "tail": {$: "Nil"}}}, ($Bool$pick$(($Bool$and$(_binding_valid_0, ($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$deciding_round$(($$$$047agent$045flow$045bend$047Canonical$find_round$(_group_0, _rounds_0)), _group_0, _lifetime_0, _round_0)), ($$$$047agent$045flow$045bend$047Canonical$selected_pending$(_selected_0, _work_0)))))), ($$$$047agent$045flow$045bend$047Canonical$finish_reserve_decision$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": _work_0, "next_round": __1, "next_operation": __2, "admissions": __3, "dispatch": __4, "collection": __5, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.FinishAllowedUnavailable"}, "tail": {$: "Nil"}}})))));
}

function $$$$047agent$045flow$045bend$047Canonical$finish_release$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$finish_release$(_collection_0, _group_0, _round_0, _attempt_0, _token_0)), {$: "Canonical.FinishReleased"}, {$: "Canonical.FinishRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$finish_authorize$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$submission_ready$(_collection_0, _group_0, _round_0, _token_0, _selected_0)), ($$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$finish_authorize$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0)), {$: "Canonical.FinishAuthorized"}, {$: "Canonical.FinishRefused"})), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.FinishRefused"}, "tail": {$: "Nil"}}});
}

function $$$$047agent$045flow$045bend$047Canonical$finish_terminal_result$(_state_0, _outcome_0, _decision_0) {
  if (_decision_0.$ === "CollectionState.Accepted") {
    const _collection_0 = _decision_0["state"];
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$(_state_0, _collection_0)), "commands": {$: "Con", "head": {$: "Canonical.FinishRecorded", "outcome": _outcome_0}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FinishRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$finish_terminal$(_state_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, _outcome_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, {$: "Canonical.Acknowledged"}, ($$$$047agent$045flow$045bend$047CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Submitted"})));
  } else if (_outcome_0.$ === "Canonical.Failed") {
    return $$$$047agent$045flow$045bend$047Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, {$: "Canonical.Failed"}, ($$$$047agent$045flow$045bend$047CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Failed"})));
  } else {
    return $$$$047agent$045flow$045bend$047Canonical$finish_terminal_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, {$: "Canonical.Unknown"}, ($$$$047agent$045flow$045bend$047CollectionState$finish_terminal$(_collection_0, _group_0, _round_0, _attempt_0, _token_0, _selected_0, {$: "DeliveryState.Uncertain"})));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$finish_end$(_state_0, _group_0, _round_0, _attempt_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$finish_end$(_collection_0, _group_0, _round_0, _attempt_0, _token_0)), {$: "Canonical.FinishEnded"}, {$: "Canonical.FinishRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$continuation_consume$(_state_0, _group_0, _round_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$consume_continuation$(_collection_0, _group_0, _round_0)), {$: "Canonical.ContinuationConsumed"}, {$: "Canonical.ContinuationRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$submission_round_found$(_group_0, _round_0, _found_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _owner_0 = _t_0["partition"];
    const _current_0 = _t_0["id"];
    return $Bool$and$(($Nat$is_eq$(_group_0, _owner_0)), ($Nat$is_eq$(_round_0, _current_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$submission_stop_reservation$(_surface_0, _authorize_now_0, _reserved_0) {
  if (_surface_0.$ === "Handoff.Stop") {
    return (_authorize_now_0 || _reserved_0);
  } else {
    return true;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$submission_begin$(_state_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0) {
  const __0 = _state_0["ledger"];
  const _rounds_0 = _state_0["rounds"];
  const __1 = _state_0["work"];
  const __2 = _state_0["next_round"];
  const __3 = _state_0["next_operation"];
  const __4 = _state_0["admissions"];
  const __5 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($Bool$and$(($$$$047agent$045flow$045bend$047Canonical$submission_round_found$(_group_0, _round_0, ($$$$047agent$045flow$045bend$047Canonical$find_round$(_group_0, _rounds_0)))), ($$$$047agent$045flow$045bend$047Canonical$submission_stop_reservation$(_surface_0, _authorize_now_0, ($$$$047agent$045flow$045bend$047CollectionState$submission_reservation$(_collection_0, _group_0, _round_0, _token_0)))))), ($$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$submission_begin$(_collection_0, _advice_0, _group_0, _round_0, _token_0, _surface_0, _authorize_now_0, _fingerprints_0, _units_0)), {$: "Canonical.SubmissionBegun"}, {$: "Canonical.SubmissionRefused"})), {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.SubmissionRefused"}, "tail": {$: "Nil"}}});
}

function $$$$047agent$045flow$045bend$047Canonical$submission_authorize$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$submission_authorize$(_collection_0, _advice_0, _token_0)), {$: "Canonical.SubmissionAuthorized"}, {$: "Canonical.SubmissionRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$submission_terminal$(_state_0, _advice_0, _token_0, _certain_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$submission_terminal$(_collection_0, _advice_0, _token_0, _certain_0)), {$: "Canonical.SubmissionRecorded"}, {$: "Canonical.SubmissionRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$submission_release$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$collection_decision$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$submission_release$(_collection_0, _advice_0, _token_0)), {$: "Canonical.SubmissionReleased"}, {$: "Canonical.SubmissionRefused"});
}

function $$$$047agent$045flow$045bend$047Canonical$submission_forget$(_state_0, _advice_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$protected_advice$(_collection_0, _advice_0)), {$: "Canonical.Rejected", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "reason": {$: "Canonical.WrongStage"}}, {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$submission_forget$(_collection_0, _advice_0)))), "commands": {$: "Con", "head": {$: "Canonical.SubmissionForgotten"}, "tail": {$: "Nil"}}});
}

function $$$$047agent$045flow$045bend$047Canonical$submission_suppress_check$(_state_0, _advice_0, _fingerprint_0, _round_0, _surface_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$submission_suppresses$(_collection_0, _advice_0, _fingerprint_0, _round_0, _surface_0)), {$: "Canonical.SubmissionSuppresses"}, {$: "Canonical.SubmissionUnsuppressed"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$submission_reoffer_check$(_state_0, _advice_0, _token_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$submission_reofferable$(_collection_0, _advice_0, _token_0)), {$: "Canonical.SubmissionReofferable"}, {$: "Canonical.SubmissionNotReofferable"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$submission_expiry_check$(_state_0, _advice_0, _token_0, _elapsed_0, _lifetime_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$submission_expired$(_collection_0, _advice_0, _token_0, _elapsed_0, _lifetime_0)), {$: "Canonical.SubmissionExpired"}, {$: "Canonical.SubmissionCurrent"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$revision_register_result$(_state_0, _result_0) {
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
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$revision_replace$(_collection_0, _replacement_0)))), "commands": {$: "Con", "head": {$: "Canonical.RevisionReused", "generation": _generation_0}, "tail": {$: "Nil"}}};
  } else {
    const _replacement_1 = _result_0["state"];
    const _generation_1 = _result_0["generation"];
    return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$revision_replace$(_collection_0, _replacement_1)))), "commands": {$: "Con", "head": {$: "Canonical.RevisionReplaced", "generation": _generation_1}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$revision_register$(_state_0, _subject_0, _input_0, _add_member_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return $$$$047agent$045flow$045bend$047Canonical$revision_register_result$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$revision_register$(_collection_0, _subject_0, _input_0, _add_member_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$revision_release$(_state_0, _subject_0, _generation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, ($$$$047agent$045flow$045bend$047CollectionState$revision_release$(_collection_0, _subject_0, _generation_0)))), "commands": {$: "Con", "head": {$: "Canonical.RevisionReleased"}, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$revision_current_check$(_state_0, _subject_0, _input_0, _generation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$revision_current$(_collection_0, _subject_0, _input_0, _generation_0)), {$: "Canonical.RevisionCurrent"}, {$: "Canonical.RevisionStale"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$revision_superseded_check$(_state_0, _subject_0, _candidate_subject_0, _generation_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047CollectionState$revision_superseded$(_collection_0, _subject_0, _candidate_subject_0, _generation_0)), {$: "Canonical.RevisionSuperseded"}, {$: "Canonical.RevisionNotSuperseded"})), "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$revision_generation_check$(_state_0, _subject_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.RevisionGeneration", "generation": ($$$$047agent$045flow$045bend$047CollectionState$revision_generation$(_collection_0, _subject_0))}, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$revision_count_check$(_state_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const __2 = _state_0["work"];
  const __3 = _state_0["next_round"];
  const __4 = _state_0["next_operation"];
  const __5 = _state_0["admissions"];
  const __6 = _state_0["dispatch"];
  const _collection_0 = _state_0["collection"];
  const _history_0 = _state_0["history"];
  return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": __6, "collection": _collection_0, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.RevisionCount", "count": ($$$$047agent$045flow$045bend$047CollectionState$revision_count$(_collection_0))}, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0) {
  const _collection_0 = _state_0["collection"];
  return _collection_0;
}

function $$$$047agent$045flow$045bend$047Canonical$collector_gate_result$(_state_0, _result_0) {
  if (_result_0.$ === "CollectorAuthority.CollectProceed") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorProceed"}, "tail": {$: "Nil"}}};
  } else {
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorUnavailable", "reason": _reason_0}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$collector_final_authority_result$(_state_0, _result_0) {
  if (_result_0.$ === "CollectorAuthority.FinalProceed") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorFinalProceed"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CollectorFinalRelease"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reuse_member_result$(_state_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$cleanup_state_clean$(_state_0) {
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
                                return $$$$047agent$045flow$045bend$047Retention$cleanup_live_state$(true, ($Nat$is_eq$(($$$$047agent$045flow$045bend$047Canonical$pending_resident_permits$(_admissions_0)), 0)));
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

function $$$$047agent$045flow$045bend$047Canonical$cleanup_check_result$(_state_0, _result_0) {
  if (_result_0.$ === "Retention.CleanupReady") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Canonical$cleanup_state_clean$(_state_0)), {$: "Canonical.CleanupReady"}, {$: "Canonical.CleanupBusy"})), "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CleanupBusy"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$delivery_ack_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.AckReady") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryAckReady"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Delivery.AckExpired") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryAckExpired"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryAckEmpty"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$delivery_final_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.FinalReady") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryFinalReady"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Delivery.FinalExpired") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryFinalExpired"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryFinalEmpty"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$delivery_disposition_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.RetireAdvice") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryRetireAdvice"}, "tail": {$: "Nil"}}};
  } else if (_decision_0.$ === "Delivery.KeepRemaining") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryKeepRemaining"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryKeepForReoffer"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$delivery_batch_result$(_state_0, _decision_0) {
  if (_decision_0.$ === "Delivery.BatchProceed") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryBatchProceed"}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.DeliveryBatchRelease"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$candidate_route_result$(_state_0, _decision_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$stop_terminal_result$(_state_0, _result_0) {
  const _revoke_provisional_0 = _result_0["revoke_provisional"];
  const _close_0 = _result_0["close"];
  return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RoundStopTerminal", "revoke_provisional": _revoke_provisional_0, "close": _close_0}, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$cleanup_commit_eligible$(_state_0) {
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
      return $$$$047agent$045flow$045bend$047Canonical$cleanup_state_clean$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": {$: "Nil"}}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": __7, "collection": {$: "CollectionState.State", "ready": __8, "leases": __9, "claims": __10, "delivery": __11, "revision": __12, "reuse": {$: "ReuseState.State", "claims": __13, "cache": {$: "Nil"}}, "notices": __14}, "history": _history_0});
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cleanup_closed$(_state_0, _result_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$cleanup_commit_checked$(_state_0, _valid_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$cleanup_closed$({$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, ($$$$047agent$045flow$045bend$047Dispatch$close$(_dispatch_0)));
  } else {
    return {$: "Canonical.Advanced", "state": {$: "Canonical.State", "ledger": __0, "rounds": __1, "work": __2, "next_round": __3, "next_operation": __4, "admissions": __5, "dispatch": _dispatch_0, "collection": __6, "history": _history_0}, "commands": {$: "Con", "head": {$: "Canonical.CleanupBusy"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cleanup_commit$(_state_0) {
  return $$$$047agent$045flow$045bend$047Canonical$cleanup_commit_checked$(_state_0, ($$$$047agent$045flow$045bend$047Canonical$cleanup_commit_eligible$(_state_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_0, _command_0) {
  return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$(_state_0, ($$$$047agent$045flow$045bend$047CollectionState$with_reuse$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)), _replacement_0)))), "commands": {$: "Con", "head": _command_0, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$reuse_route_result$(_state_0, _result_0) {
  if (_result_0.$ === "ReuseState.JoinAdvice") {
    const _replacement_0 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_0, {$: "Canonical.ReuseJoinAdvice"});
  } else if (_result_0.$ === "ReuseState.JoinPending") {
    const _replacement_1 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_1, {$: "Canonical.ReuseJoinPending"});
  } else if (_result_0.$ === "ReuseState.JoinClaimed") {
    const _replacement_2 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_2, {$: "Canonical.ReuseJoinClaimed"});
  } else if (_result_0.$ === "ReuseState.Cached") {
    const _replacement_3 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_3, {$: "Canonical.ReuseCached"});
  } else {
    const _replacement_4 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_4, {$: "Canonical.ReuseOwn"});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$reuse_decision_result$(_state_0, _result_0, _granted_0) {
  if (_result_0.$ === "ReuseState.Granted") {
    const _replacement_0 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_0, _granted_0);
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cache_plan_result$(_state_0, _result_0) {
  if (_result_0.$ === "ReuseState.Already") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CacheAlready"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "ReuseState.Reject") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CacheRejected"}, "tail": {$: "Nil"}}};
  } else {
    const _replacement_0 = _result_0["state"];
    const _ids_0 = _result_0["evicted"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_0, {$: "Canonical.CachePrepared", "evicted": _ids_0});
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cache_discard_result$(_state_0, _result_0) {
  const _replacement_0 = _result_0["state"];
  const _ids_0 = _result_0["ids"];
  return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, _replacement_0, {$: "Canonical.CacheDiscarded", "ids": _ids_0});
}

function $$$$047agent$045flow$045bend$047Canonical$cache_charge_valid$(_found_0, _partition_0, _bytes_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$cache_commit_checked$(_state_0, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0, _valid_0) {
  if (_valid_0) {
    return $$$$047agent$045flow$045bend$047Canonical$reuse_decision_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$commit$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0)), {$: "Canonical.CacheCommitted"});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReuseRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$cache_commit$(_state_0, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0) {
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
  return $$$$047agent$045flow$045bend$047Canonical$cache_commit_checked$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": __7, "collection": __8, "history": _history_0}, _id_0, _partition_0, _bytes_0, _reservation_0, _entry_limit_0, _byte_limit_0, ($$$$047agent$045flow$045bend$047Canonical$cache_charge_valid$(($$$$047agent$045flow$045bend$047Ledger$find$(_reservation_0, _charges_0)), _partition_0, _bytes_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, _replacement_0, _command_0) {
  return {$: "Canonical.Advanced", "state": ($$$$047agent$045flow$045bend$047Canonical$with_collection$(_state_0, ($$$$047agent$045flow$045bend$047CollectionState$with_notices$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)), _replacement_0)))), "commands": {$: "Con", "head": _command_0, "tail": {$: "Nil"}}};
}

function $$$$047agent$045flow$045bend$047Canonical$notice_advance_result$(_state_0, _result_0) {
  if (_result_0.$ === "NoticeState.Suppressed") {
    const _replacement_0 = _result_0["state"];
    const _count_0 = _result_0["count"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, _replacement_0, {$: "Canonical.NoticeSuppressed", "count": _count_0});
  } else if (_result_0.$ === "NoticeState.RejectedFull") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRejectedFull"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "NoticeState.CreateKey") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeCreateKey"}, "tail": {$: "Nil"}}};
  } else if (_result_0.$ === "NoticeState.CreatePending") {
    const _replacement_1 = _result_0["state"];
    const _count_1 = _result_0["count"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, _replacement_1, {$: "Canonical.NoticeCreatePending", "count": _count_1});
  } else if (_result_0.$ === "NoticeState.MergePending") {
    const _replacement_2 = _result_0["state"];
    const _count_2 = _result_0["count"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, _replacement_2, {$: "Canonical.NoticeMergePending", "count": _count_2});
  } else if (_result_0.$ === "NoticeState.KeepLeased") {
    const _replacement_3 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, _replacement_3, {$: "Canonical.NoticeKeepLeased"});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$notice_decision_result$(_state_0, _result_0, _granted_0) {
  if (_result_0.$ === "NoticeState.Granted") {
    const _replacement_0 = _result_0["state"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, _replacement_0, _granted_0);
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$notice_prune_result$(_state_0, _result_0) {
  if (_result_0.$ === "NoticeState.Pruned") {
    const _replacement_0 = _result_0["state"];
    const _drop_lease_0 = _result_0["drop_lease"];
    const _drop_pending_0 = _result_0["drop_pending"];
    const _drop_key_0 = _result_0["drop_key"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, _replacement_0, {$: "Canonical.NoticePruned", "drop_lease": _drop_lease_0, "drop_pending": _drop_pending_0, "drop_key": _drop_key_0});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$notice_charge_valid$(_found_0, _partition_0) {
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

function $$$$047agent$045flow$045bend$047Canonical$notice_commit_checked$(_state_0, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0, _valid_0) {
  if (_valid_0) {
    return $$$$047agent$045flow$045bend$047Canonical$notice_decision_result$(_state_0, ($$$$047agent$045flow$045bend$047NoticeState$commit$(($$$$047agent$045flow$045bend$047CollectionState$notice_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0)), {$: "Canonical.NoticeCommitted"});
  } else {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeRefused"}, "tail": {$: "Nil"}}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$notice_commit$(_state_0, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0) {
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
  return $$$$047agent$045flow$045bend$047Canonical$notice_commit_checked$({$: "Canonical.State", "ledger": {$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, "rounds": __2, "work": __3, "next_round": __4, "next_operation": __5, "admissions": __6, "dispatch": __7, "collection": __8, "history": _history_0}, _key_0, _partition_0, _group_0, _reservation_0, _pending_0, _sequence_0, _maximum_keys_0, ($$$$047agent$045flow$045bend$047Canonical$notice_charge_valid$(($$$$047agent$045flow$045bend$047Ledger$find$(_reservation_0, _charges_0)), _partition_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$step_unchecked$(_state_0, _event_0) {
  if (_event_0.$ === "Canonical.ReserveCapacity") {
    const _partition_0 = _event_0["partition"];
    const _bytes_0 = _event_0["bytes"];
    const _purpose_0 = _event_0["purpose"];
    return $$$$047agent$045flow$045bend$047Canonical$capacity_reserve$(_state_0, _partition_0, _bytes_0, _purpose_0);
  } else if (_event_0.$ === "Canonical.ResizeCapacity") {
    const _reservation_0 = _event_0["reservation"];
    const _bytes_1 = _event_0["bytes"];
    const _purpose_1 = _event_0["purpose"];
    return $$$$047agent$045flow$045bend$047Canonical$capacity_resize$(_state_0, _reservation_0, _bytes_1, _purpose_1);
  } else if (_event_0.$ === "Canonical.ReleaseCapacity") {
    const _reservation_1 = _event_0["reservation"];
    return $$$$047agent$045flow$045bend$047Canonical$capacity_release$(_state_0, _reservation_1);
  } else if (_event_0.$ === "Canonical.ReplaceCapacity") {
    const _reservation_2 = _event_0["reservation"];
    const _unit_bytes_0 = _event_0["unit_bytes"];
    return $$$$047agent$045flow$045bend$047Canonical$capacity_replace$(_state_0, _reservation_2, _unit_bytes_0);
  } else if (_event_0.$ === "Canonical.IssuePermit") {
    const _partition_1 = _event_0["partition"];
    const _lifetime_0 = _event_0["lifetime"];
    const _tool_0 = _event_0["tool"];
    const _started_0 = _event_0["started"];
    const _deadline_0 = _event_0["deadline"];
    const _now_0 = _event_0["now"];
    const _minimum_started_0 = _event_0["minimum_started"];
    const _facts_0 = _event_0["facts"];
    return $$$$047agent$045flow$045bend$047Canonical$issue_permit$(_state_0, _partition_1, _lifetime_0, _tool_0, _started_0, _deadline_0, _now_0, _minimum_started_0, _facts_0);
  } else if (_event_0.$ === "Canonical.CheckCompletedEdit") {
    const _tool_1 = _event_0["tool"];
    return $$$$047agent$045flow$045bend$047Canonical$check_completed_edit$(_state_0, _tool_1);
  } else if (_event_0.$ === "Canonical.RememberCompletedEdit") {
    const _tool_2 = _event_0["tool"];
    const _reason_0 = _event_0["reason"];
    return $$$$047agent$045flow$045bend$047Canonical$remember_completed_edit$(_state_0, _tool_2, _reason_0);
  } else if (_event_0.$ === "Canonical.QuietRoundTick") {
    const _partition_2 = _event_0["partition"];
    const _lifetime_1 = _event_0["lifetime"];
    const _round_0 = _event_0["round"];
    const _now_1 = _event_0["now"];
    const _window_0 = _event_0["window"];
    const _facts_1 = _event_0["facts"];
    return $$$$047agent$045flow$045bend$047Canonical$quiet_round_tick$(_state_0, _partition_2, _lifetime_1, _round_0, _now_1, _window_0, _facts_1);
  } else if (_event_0.$ === "Canonical.QuietRoundReset") {
    const _partition_3 = _event_0["partition"];
    const _lifetime_2 = _event_0["lifetime"];
    const _round_1 = _event_0["round"];
    return $$$$047agent$045flow$045bend$047Canonical$quiet_round_reset$(_state_0, _partition_3, _lifetime_2, _round_1);
  } else if (_event_0.$ === "Canonical.ConsumePermit") {
    const _partition_4 = _event_0["partition"];
    const _lifetime_3 = _event_0["lifetime"];
    const _token_0 = _event_0["token"];
    const _tool_3 = _event_0["tool"];
    const _now_2 = _event_0["now"];
    return $$$$047agent$045flow$045bend$047Canonical$consume_permit$(_state_0, _partition_4, _lifetime_3, _token_0, _tool_3, _now_2);
  } else if (_event_0.$ === "Canonical.ReleasePermit") {
    const _partition_5 = _event_0["partition"];
    const _lifetime_4 = _event_0["lifetime"];
    const _token_1 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$release_permit$(_state_0, _partition_5, _lifetime_4, _token_1);
  } else if (_event_0.$ === "Canonical.ExpirePermit") {
    const _partition_6 = _event_0["partition"];
    const _lifetime_5 = _event_0["lifetime"];
    const _token_2 = _event_0["token"];
    const _deadline_reached_0 = _event_0["deadline_reached"];
    return $$$$047agent$045flow$045bend$047Canonical$expire_permit$(_state_0, _partition_6, _lifetime_5, _token_2, _deadline_reached_0);
  } else if (_event_0.$ === "Canonical.ClosePermitRound") {
    const _partition_7 = _event_0["partition"];
    const _lifetime_6 = _event_0["lifetime"];
    const _round_2 = _event_0["round"];
    const _at_0 = _event_0["at"];
    return $$$$047agent$045flow$045bend$047Canonical$close_permit_round$(_state_0, _partition_7, _lifetime_6, _round_2, _at_0);
  } else if (_event_0.$ === "Canonical.OpenRound") {
    const _partition_8 = _event_0["partition"];
    const _lifetime_7 = _event_0["lifetime"];
    return $$$$047agent$045flow$045bend$047Canonical$open$(_state_0, _partition_8, _lifetime_7);
  } else if (_event_0.$ === "Canonical.AdmitObservation") {
    const _partition_9 = _event_0["partition"];
    const _lifetime_8 = _event_0["lifetime"];
    const _round_3 = _event_0["round"];
    return $$$$047agent$045flow$045bend$047Canonical$admit_observation$(_state_0, _partition_9, _lifetime_8, _round_3);
  } else if (_event_0.$ === "Canonical.StartObservation") {
    const _partition_10 = _event_0["partition"];
    const _lifetime_9 = _event_0["lifetime"];
    const _round_4 = _event_0["round"];
    const _observation_0 = _event_0["observation"];
    return $$$$047agent$045flow$045bend$047Canonical$start_observation$(_state_0, _partition_10, _lifetime_9, _round_4, _observation_0);
  } else if (_event_0.$ === "Canonical.CompleteObservation") {
    const _partition_11 = _event_0["partition"];
    const _lifetime_10 = _event_0["lifetime"];
    const _round_5 = _event_0["round"];
    const _observation_1 = _event_0["observation"];
    return $$$$047agent$045flow$045bend$047Canonical$complete_observation$(_state_0, _partition_11, _lifetime_10, _round_5, _observation_1);
  } else if (_event_0.$ === "Canonical.InterruptObservation") {
    const _partition_12 = _event_0["partition"];
    const _lifetime_11 = _event_0["lifetime"];
    const _round_6 = _event_0["round"];
    const _observation_2 = _event_0["observation"];
    return $$$$047agent$045flow$045bend$047Canonical$interrupt_observation$(_state_0, _partition_12, _lifetime_11, _round_6, _observation_2);
  } else if (_event_0.$ === "Canonical.BeginPreparation") {
    const _partition_13 = _event_0["partition"];
    const _lifetime_12 = _event_0["lifetime"];
    const _round_7 = _event_0["round"];
    const _bytes_2 = _event_0["bytes"];
    return $$$$047agent$045flow$045bend$047Canonical$begin$(_state_0, _partition_13, _lifetime_12, _round_7, _bytes_2);
  } else if (_event_0.$ === "Canonical.BeginObservedPreparation") {
    const _partition_14 = _event_0["partition"];
    const _lifetime_13 = _event_0["lifetime"];
    const _round_8 = _event_0["round"];
    const _observation_3 = _event_0["observation"];
    const _bytes_3 = _event_0["bytes"];
    return $$$$047agent$045flow$045bend$047Canonical$begin_observed$(_state_0, _partition_14, _lifetime_13, _round_8, _observation_3, _bytes_3);
  } else if (_event_0.$ === "Canonical.InterruptPreparation") {
    const _partition_15 = _event_0["partition"];
    const _lifetime_14 = _event_0["lifetime"];
    const _round_9 = _event_0["round"];
    const _operation_0 = _event_0["operation"];
    return $$$$047agent$045flow$045bend$047Canonical$interrupt_preparation$(_state_0, _partition_15, _lifetime_14, _round_9, _operation_0);
  } else if (_event_0.$ === "Canonical.PreparationCompleted") {
    const _partition_16 = _event_0["partition"];
    const _lifetime_15 = _event_0["lifetime"];
    const _round_10 = _event_0["round"];
    const _operation_1 = _event_0["operation"];
    const _bytes_4 = _event_0["unit_bytes"];
    return $$$$047agent$045flow$045bend$047Canonical$prepared$(_state_0, _partition_16, _lifetime_15, _round_10, _operation_1, _bytes_4);
  } else if (_event_0.$ === "Canonical.StartReview") {
    const _partition_17 = _event_0["partition"];
    const _lifetime_16 = _event_0["lifetime"];
    const _round_11 = _event_0["round"];
    const _operation_2 = _event_0["operation"];
    return $$$$047agent$045flow$045bend$047Canonical$start_review$(_state_0, _partition_17, _lifetime_16, _round_11, _operation_2);
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
    return $$$$047agent$045flow$045bend$047Canonical$request_ready$(_state_0, _partition_18, _lifetime_17, _round_12, _operation_3, _root_valid_0, _configuration_valid_0, _credential_ready_0, _selected_0, _current_work_0, _physical_available_0);
  } else if (_event_0.$ === "Canonical.JevRequestStarted") {
    const _partition_19 = _event_0["partition"];
    const _lifetime_18 = _event_0["lifetime"];
    const _round_13 = _event_0["round"];
    const _operation_4 = _event_0["operation"];
    const _request_0 = _event_0["request"];
    return $$$$047agent$045flow$045bend$047Canonical$request_started$(_state_0, _partition_19, _lifetime_18, _round_13, _operation_4, _request_0);
  } else if (_event_0.$ === "Canonical.JevRequestInterrupted") {
    const _partition_20 = _event_0["partition"];
    const _lifetime_19 = _event_0["lifetime"];
    const _round_14 = _event_0["round"];
    const _operation_5 = _event_0["operation"];
    const _request_1 = _event_0["request"];
    return $$$$047agent$045flow$045bend$047Canonical$request_interrupted$(_state_0, _partition_20, _lifetime_19, _round_14, _operation_5, _request_1);
  } else if (_event_0.$ === "Canonical.JevRequestSettled") {
    const _partition_21 = _event_0["partition"];
    const _lifetime_20 = _event_0["lifetime"];
    const _round_15 = _event_0["round"];
    const _operation_6 = _event_0["operation"];
    const _request_2 = _event_0["request"];
    const _outcome_0 = _event_0["outcome"];
    const _current_work_1 = _event_0["current_work"];
    return $$$$047agent$045flow$045bend$047Canonical$request_settled$(_state_0, _partition_21, _lifetime_20, _round_15, _operation_6, _request_2, _outcome_0, _current_work_1);
  } else if (_event_0.$ === "Canonical.ReviewCompleted") {
    const _partition_22 = _event_0["partition"];
    const _lifetime_21 = _event_0["lifetime"];
    const _round_16 = _event_0["round"];
    const _operation_7 = _event_0["operation"];
    const _outcome_1 = _event_0["outcome"];
    return $$$$047agent$045flow$045bend$047Canonical$reviewed$(_state_0, _partition_22, _lifetime_21, _round_16, _operation_7, _outcome_1);
  } else if (_event_0.$ === "Canonical.RetireReview") {
    const _partition_23 = _event_0["partition"];
    const _lifetime_22 = _event_0["lifetime"];
    const _round_17 = _event_0["round"];
    const _operation_8 = _event_0["operation"];
    return $$$$047agent$045flow$045bend$047Canonical$retire_review$(_state_0, _partition_23, _lifetime_22, _round_17, _operation_8);
  } else if (_event_0.$ === "Canonical.ReviewObserved") {
    const _partition_24 = _event_0["partition"];
    const _lifetime_23 = _event_0["lifetime"];
    const _round_18 = _event_0["round"];
    const _operation_9 = _event_0["operation"];
    const _outcome_2 = _event_0["outcome"];
    const _current_work_2 = _event_0["current_work"];
    return $$$$047agent$045flow$045bend$047Canonical$review_observed$(_state_0, _partition_24, _lifetime_23, _round_18, _operation_9, _outcome_2, _current_work_2);
  } else if (_event_0.$ === "Canonical.FindingCountUpdated") {
    const _partition_25 = _event_0["partition"];
    const _lifetime_24 = _event_0["lifetime"];
    const _round_19 = _event_0["round"];
    const _operation_10 = _event_0["operation"];
    const _count_0 = _event_0["count"];
    return $$$$047agent$045flow$045bend$047Canonical$finding_count_update$(_state_0, _partition_25, _lifetime_24, _round_19, _operation_10, _count_0);
  } else if (_event_0.$ === "Canonical.QueueDispatch") {
    const _partition_26 = _event_0["partition"];
    const _lifetime_25 = _event_0["lifetime"];
    const _round_20 = _event_0["round"];
    const _operation_11 = _event_0["operation"];
    return $$$$047agent$045flow$045bend$047Canonical$queue_dispatch$(_state_0, _partition_26, _lifetime_25, _round_20, _operation_11);
  } else if (_event_0.$ === "Canonical.DispatchSettled") {
    const _partition_27 = _event_0["partition"];
    const _lifetime_26 = _event_0["lifetime"];
    const _round_21 = _event_0["round"];
    const _operation_12 = _event_0["operation"];
    return $$$$047agent$045flow$045bend$047Canonical$settle_dispatch$(_state_0, _partition_27, _lifetime_26, _round_21, _operation_12);
  } else if (_event_0.$ === "Canonical.DiscardDispatch") {
    const _operations_0 = _event_0["operations"];
    return $$$$047agent$045flow$045bend$047Canonical$discard_dispatch$(_state_0, _operations_0);
  } else if (_event_0.$ === "Canonical.DispatchScopeCheck") {
    const _named_count_0 = _event_0["named_count"];
    const _cancelled_count_0 = _event_0["cancelled_count"];
    const _has_unnamed_0 = _event_0["has_unnamed"];
    return $$$$047agent$045flow$045bend$047Canonical$dispatch_scope$(_state_0, _named_count_0, _cancelled_count_0, _has_unnamed_0);
  } else if (_event_0.$ === "Canonical.CloseDispatch") {
    return $$$$047agent$045flow$045bend$047Canonical$close_dispatch$(_state_0);
  } else if (_event_0.$ === "Canonical.PreparedOfferCheck") {
    const _ready_0 = _event_0["ready"];
    const _within_frame_0 = _event_0["within_frame"];
    return $$$$047agent$045flow$045bend$047Canonical$prepared_offer_check$(_state_0, _ready_0, _within_frame_0);
  } else if (_event_0.$ === "Canonical.EmptyPreparedCheck") {
    const _ready_count_0 = _event_0["ready_count"];
    const _has_non_skipped_0 = _event_0["has_non_skipped"];
    const _authority_bound_0 = _event_0["authority_bound"];
    return $$$$047agent$045flow$045bend$047Canonical$empty_prepared_check$(_state_0, _ready_count_0, _has_non_skipped_0, _authority_bound_0);
  } else if (_event_0.$ === "Canonical.ReviewFailureCheck") {
    const _backend_or_timeout_0 = _event_0["backend_or_timeout"];
    const _credential_0 = _event_0["credential"];
    const _missing_0 = _event_0["missing"];
    return $$$$047agent$045flow$045bend$047Canonical$review_failure_check$(_state_0, _backend_or_timeout_0, _credential_0, _missing_0);
  } else if (_event_0.$ === "Canonical.StopPolled") {
    const _partition_28 = _event_0["partition"];
    const _lifetime_27 = _event_0["lifetime"];
    const _round_22 = _event_0["round"];
    const _deadline_1 = _event_0["deadline"];
    return $$$$047agent$045flow$045bend$047Canonical$stop$(_state_0, _partition_28, _lifetime_27, _round_22, _deadline_1);
  } else if (_event_0.$ === "Canonical.StopGroupPolled") {
    const _group_0 = _event_0["group"];
    const _lifetime_28 = _event_0["lifetime"];
    const _round_23 = _event_0["round"];
    const _scopes_0 = _event_0["scopes"];
    const _deadline_2 = _event_0["deadline"];
    const _extra_pending_0 = _event_0["extra_pending"];
    const _continuations_0 = _event_0["continuations"];
    return $$$$047agent$045flow$045bend$047Canonical$stop_group$(_state_0, _group_0, _lifetime_28, _round_23, _scopes_0, _deadline_2, _extra_pending_0, _continuations_0);
  } else if (_event_0.$ === "Canonical.StopGroupEnded") {
    const _group_1 = _event_0["group"];
    const _lifetime_29 = _event_0["lifetime"];
    const _round_24 = _event_0["round"];
    const _scopes_1 = _event_0["scopes"];
    return $$$$047agent$045flow$045bend$047Canonical$stop_group_end$(_state_0, _group_1, _lifetime_29, _round_24, _scopes_1);
  } else if (_event_0.$ === "Canonical.CollectionReady") {
    const _advice_0 = _event_0["advice"];
    const _partition_29 = _event_0["partition"];
    const _lifetime_30 = _event_0["lifetime"];
    const _round_25 = _event_0["round"];
    const _observation_4 = _event_0["observation"];
    const _joined_pending_0 = _event_0["joined_pending"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_ready$(_state_0, _advice_0, _partition_29, _lifetime_30, _round_25, _observation_4, _joined_pending_0);
  } else if (_event_0.$ === "Canonical.CollectionCredentialCheck") {
    const _same_scope_0 = _event_0["same_scope"];
    const _generation_valid_0 = _event_0["generation_valid"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_credential_result$(_state_0, ($$$$047agent$045flow$045bend$047Collection$credential_disposition$(_same_scope_0, _generation_valid_0)));
  } else if (_event_0.$ === "Canonical.CollectionCandidateCheck") {
    const _same_partition_0 = _event_0["same_partition"];
    const _unleased_0 = _event_0["unleased"];
    const _has_unsuppressed_0 = _event_0["has_unsuppressed"];
    const _authority_owns_0 = _event_0["authority_owns"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_candidate$(_state_0, _same_partition_0, _unleased_0, _has_unsuppressed_0, _authority_owns_0);
  } else if (_event_0.$ === "Canonical.CollectionOrderCheck") {
    const _left_sequence_0 = _event_0["left_sequence"];
    const _right_sequence_0 = _event_0["right_sequence"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_order_result$(_state_0, ($$$$047agent$045flow$045bend$047Collection$order$(_left_sequence_0, _right_sequence_0)));
  } else if (_event_0.$ === "Canonical.CollectionExpiryCheck") {
    const _elapsed_0 = _event_0["elapsed"];
    const _lifetime_31 = _event_0["lifetime"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_expiry$(_state_0, _elapsed_0, _lifetime_31);
  } else if (_event_0.$ === "Canonical.CollectionFitCheck") {
    const _items_0 = _event_0["items"];
    const _bytes_5 = _event_0["bytes"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_fit$(_state_0, _items_0, _bytes_5);
  } else if (_event_0.$ === "Canonical.CollectionFindingCheck") {
    const _selection_partition_0 = _event_0["selection_partition"];
    const _selection_round_0 = _event_0["selection_round"];
    const _unit_0 = _event_0["unit"];
    const _partition_30 = _event_0["partition"];
    const _round_26 = _event_0["round"];
    const _snapshot_0 = _event_0["snapshot"];
    const _current_snapshot_0 = _event_0["current_snapshot"];
    const _credential_1 = _event_0["credential"];
    const _current_credential_0 = _event_0["current_credential"];
    const _age_ms_0 = _event_0["age_ms"];
    const _solo_bytes_0 = _event_0["solo_bytes"];
    const _collection_ready_0 = _event_0["collection_ready"];
    const _selected_count_0 = _event_0["selected_count"];
    const _prospective_bytes_0 = _event_0["prospective_bytes"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_finding$(_state_0, _selection_partition_0, _selection_round_0, _unit_0, _partition_30, _round_26, _snapshot_0, _current_snapshot_0, _credential_1, _current_credential_0, _age_ms_0, _solo_bytes_0, _collection_ready_0, _selected_count_0, _prospective_bytes_0);
  } else if (_event_0.$ === "Canonical.CollectionNoticeCheck") {
    const _items_1 = _event_0["items"];
    const _bytes_6 = _event_0["bytes"];
    const _skip_unfitting_0 = _event_0["skip_unfitting"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_notice_result$(_state_0, ($$$$047agent$045flow$045bend$047Handoff$notice_offer$(_items_1, _bytes_6, _skip_unfitting_0)));
  } else if (_event_0.$ === "Canonical.CollectionReserveLease") {
    const _advice_1 = _event_0["advice"];
    const _token_3 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_reserve$(_state_0, _advice_1, _token_3);
  } else if (_event_0.$ === "Canonical.CollectionReleaseLease") {
    const _advice_2 = _event_0["advice"];
    const _token_4 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_release$(_state_0, _advice_2, _token_4);
  } else if (_event_0.$ === "Canonical.CollectionLeaseCheck") {
    const _advice_3 = _event_0["advice"];
    const _token_5 = _event_0["token"];
    const _expired_0 = _event_0["expired"];
    const _stop_collector_0 = _event_0["stop_collector"];
    const _same_group_0 = _event_0["same_group"];
    const _reofferable_0 = _event_0["reofferable"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_lease_check$(_state_0, _advice_3, _token_5, _expired_0, _stop_collector_0, _same_group_0, _reofferable_0);
  } else if (_event_0.$ === "Canonical.CollectionRetireAdvice") {
    const _advice_4 = _event_0["advice"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_retire$(_state_0, _advice_4);
  } else if (_event_0.$ === "Canonical.CollectionClaimBackground") {
    const _group_2 = _event_0["group"];
    const _token_6 = _event_0["token"];
    const _active_0 = _event_0["active"];
    const _capacity_0 = _event_0["capacity"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_claim$(_state_0, _group_2, _token_6, _active_0, _capacity_0);
  } else if (_event_0.$ === "Canonical.CollectionReleaseBackground") {
    const _group_3 = _event_0["group"];
    const _token_7 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_release_background$(_state_0, _group_3, _token_7);
  } else if (_event_0.$ === "Canonical.CollectionExpireBackground") {
    const _group_4 = _event_0["group"];
    const _token_8 = _event_0["token"];
    const _elapsed_1 = _event_0["elapsed"];
    const _lifetime_32 = _event_0["lifetime"];
    return $$$$047agent$045flow$045bend$047Canonical$collection_expire_background$(_state_0, _group_4, _token_8, _elapsed_1, _lifetime_32);
  } else if (_event_0.$ === "Canonical.FinishReserve") {
    const _group_5 = _event_0["group"];
    const _lifetime_33 = _event_0["lifetime"];
    const _round_27 = _event_0["round"];
    const _attempt_0 = _event_0["attempt"];
    const _token_9 = _event_0["token"];
    const _selected_1 = _event_0["selected"];
    const _has_notice_0 = _event_0["has_notice"];
    const _pass_notices_0 = _event_0["pass_notices"];
    const _can_write_0 = _event_0["can_write"];
    const _binding_valid_0 = _event_0["binding_valid"];
    const _deadline_reached_1 = _event_0["deadline_reached"];
    return $$$$047agent$045flow$045bend$047Canonical$finish_reserve$(_state_0, _group_5, _lifetime_33, _round_27, _attempt_0, _token_9, _selected_1, _has_notice_0, _pass_notices_0, _can_write_0, _binding_valid_0, _deadline_reached_1);
  } else if (_event_0.$ === "Canonical.FinishRelease") {
    const _group_6 = _event_0["group"];
    const _round_28 = _event_0["round"];
    const _attempt_1 = _event_0["attempt"];
    const _token_10 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$finish_release$(_state_0, _group_6, _round_28, _attempt_1, _token_10);
  } else if (_event_0.$ === "Canonical.FinishAuthorize") {
    const _group_7 = _event_0["group"];
    const _round_29 = _event_0["round"];
    const _attempt_2 = _event_0["attempt"];
    const _token_11 = _event_0["token"];
    const _selected_2 = _event_0["selected"];
    return $$$$047agent$045flow$045bend$047Canonical$finish_authorize$(_state_0, _group_7, _round_29, _attempt_2, _token_11, _selected_2);
  } else if (_event_0.$ === "Canonical.FinishTerminal") {
    const _group_8 = _event_0["group"];
    const _round_30 = _event_0["round"];
    const _attempt_3 = _event_0["attempt"];
    const _token_12 = _event_0["token"];
    const _selected_3 = _event_0["selected"];
    const _outcome_3 = _event_0["outcome"];
    return $$$$047agent$045flow$045bend$047Canonical$finish_terminal$(_state_0, _group_8, _round_30, _attempt_3, _token_12, _selected_3, _outcome_3);
  } else if (_event_0.$ === "Canonical.FinishEnd") {
    const _group_9 = _event_0["group"];
    const _round_31 = _event_0["round"];
    const _attempt_4 = _event_0["attempt"];
    const _token_13 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$finish_end$(_state_0, _group_9, _round_31, _attempt_4, _token_13);
  } else if (_event_0.$ === "Canonical.ContinuationConsume") {
    const _group_10 = _event_0["group"];
    const _round_32 = _event_0["round"];
    return $$$$047agent$045flow$045bend$047Canonical$continuation_consume$(_state_0, _group_10, _round_32);
  } else if (_event_0.$ === "Canonical.SubmissionBegin") {
    const _advice_5 = _event_0["advice"];
    const _group_11 = _event_0["group"];
    const _round_33 = _event_0["round"];
    const _token_14 = _event_0["token"];
    const _surface_0 = _event_0["surface"];
    const _authorize_now_0 = _event_0["authorize_now"];
    const _fingerprints_0 = _event_0["fingerprints"];
    const _units_0 = _event_0["units"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_begin$(_state_0, _advice_5, _group_11, _round_33, _token_14, _surface_0, _authorize_now_0, _fingerprints_0, _units_0);
  } else if (_event_0.$ === "Canonical.SubmissionAuthorize") {
    const _advice_6 = _event_0["advice"];
    const _token_15 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_authorize$(_state_0, _advice_6, _token_15);
  } else if (_event_0.$ === "Canonical.SubmissionTerminal") {
    const _advice_7 = _event_0["advice"];
    const _token_16 = _event_0["token"];
    const _certain_0 = _event_0["certain"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_terminal$(_state_0, _advice_7, _token_16, _certain_0);
  } else if (_event_0.$ === "Canonical.SubmissionRelease") {
    const _advice_8 = _event_0["advice"];
    const _token_17 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_release$(_state_0, _advice_8, _token_17);
  } else if (_event_0.$ === "Canonical.SubmissionForget") {
    const _advice_9 = _event_0["advice"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_forget$(_state_0, _advice_9);
  } else if (_event_0.$ === "Canonical.SubmissionSuppressCheck") {
    const _advice_10 = _event_0["advice"];
    const _fingerprint_0 = _event_0["fingerprint"];
    const _round_34 = _event_0["round"];
    const _surface_1 = _event_0["surface"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_suppress_check$(_state_0, _advice_10, _fingerprint_0, _round_34, _surface_1);
  } else if (_event_0.$ === "Canonical.SubmissionReofferCheck") {
    const _advice_11 = _event_0["advice"];
    const _token_18 = _event_0["token"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_reoffer_check$(_state_0, _advice_11, _token_18);
  } else if (_event_0.$ === "Canonical.SubmissionExpiryCheck") {
    const _advice_12 = _event_0["advice"];
    const _token_19 = _event_0["token"];
    const _elapsed_2 = _event_0["elapsed"];
    const _lifetime_34 = _event_0["lifetime"];
    return $$$$047agent$045flow$045bend$047Canonical$submission_expiry_check$(_state_0, _advice_12, _token_19, _elapsed_2, _lifetime_34);
  } else if (_event_0.$ === "Canonical.RevisionRegister") {
    const _subject_0 = _event_0["subject"];
    const _input_0 = _event_0["input"];
    const _add_member_0 = _event_0["add_member"];
    return $$$$047agent$045flow$045bend$047Canonical$revision_register$(_state_0, _subject_0, _input_0, _add_member_0);
  } else if (_event_0.$ === "Canonical.RevisionRelease") {
    const _subject_1 = _event_0["subject"];
    const _generation_0 = _event_0["generation"];
    return $$$$047agent$045flow$045bend$047Canonical$revision_release$(_state_0, _subject_1, _generation_0);
  } else if (_event_0.$ === "Canonical.RevisionCurrentCheck") {
    const _subject_2 = _event_0["subject"];
    const _input_1 = _event_0["input"];
    const _generation_1 = _event_0["generation"];
    return $$$$047agent$045flow$045bend$047Canonical$revision_current_check$(_state_0, _subject_2, _input_1, _generation_1);
  } else if (_event_0.$ === "Canonical.RevisionSupersededCheck") {
    const _subject_3 = _event_0["subject"];
    const _candidate_subject_0 = _event_0["candidate_subject"];
    const _generation_2 = _event_0["generation"];
    return $$$$047agent$045flow$045bend$047Canonical$revision_superseded_check$(_state_0, _subject_3, _candidate_subject_0, _generation_2);
  } else if (_event_0.$ === "Canonical.RevisionGenerationCheck") {
    const _subject_4 = _event_0["subject"];
    return $$$$047agent$045flow$045bend$047Canonical$revision_generation_check$(_state_0, _subject_4);
  } else if (_event_0.$ === "Canonical.RevisionCountCheck") {
    return $$$$047agent$045flow$045bend$047Canonical$revision_count_check$(_state_0);
  } else if (_event_0.$ === "Canonical.CollectorGateCheck") {
    const _expired_1 = _event_0["expired"];
    const _credential_valid_0 = _event_0["credential_valid"];
    return $$$$047agent$045flow$045bend$047Canonical$collector_gate_result$(_state_0, ($$$$047agent$045flow$045bend$047CollectorAuthority$collect_gate$(_expired_1, _credential_valid_0)));
  } else if (_event_0.$ === "Canonical.CollectorFinalAuthorityCheck") {
    const _admitted_block_0 = _event_0["admitted_block"];
    const _current_block_0 = _event_0["current_block"];
    return $$$$047agent$045flow$045bend$047Canonical$collector_final_authority_result$(_state_0, ($$$$047agent$045flow$045bend$047CollectorAuthority$final_authority$(_admitted_block_0, _current_block_0)));
  } else if (_event_0.$ === "Canonical.ReuseMemberCheck") {
    const _joined_state_0 = _event_0["joined_state"];
    const _stale_unavailable_0 = _event_0["stale_unavailable"];
    const _has_revision_0 = _event_0["has_revision"];
    const _has_advice_id_0 = _event_0["has_advice_id"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_member_result$(_state_0, ($$$$047agent$045flow$045bend$047Reuse$joined_disposition$(_joined_state_0, _stale_unavailable_0, _has_revision_0, _has_advice_id_0)));
  } else if (_event_0.$ === "Canonical.CleanupCheck") {
    const _facts_2 = _event_0["facts"];
    return $$$$047agent$045flow$045bend$047Canonical$cleanup_check_result$(_state_0, ($$$$047agent$045flow$045bend$047Retention$cleanup_gate$(_facts_2)));
  } else if (_event_0.$ === "Canonical.CleanupCommit") {
    return $$$$047agent$045flow$045bend$047Canonical$cleanup_commit$(_state_0);
  } else if (_event_0.$ === "Canonical.DeliveryReleaseCheck") {
    const _acknowledged_0 = _event_0["acknowledged"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Delivery$release_unacknowledged$(_acknowledged_0)), {$: "Canonical.DeliveryReleaseUnacknowledged"}, {$: "Canonical.DeliveryKeepAcknowledged"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryAcknowledgeCheck") {
    const _items_2 = _event_0["items"];
    const _any_expired_0 = _event_0["any_expired"];
    return $$$$047agent$045flow$045bend$047Canonical$delivery_ack_result$(_state_0, ($$$$047agent$045flow$045bend$047Delivery$acknowledge$(_items_2, _any_expired_0)));
  } else if (_event_0.$ === "Canonical.DeliveryFinalizeCheck") {
    const _items_3 = _event_0["items"];
    const _all_acknowledged_0 = _event_0["all_acknowledged"];
    const _any_expired_1 = _event_0["any_expired"];
    return $$$$047agent$045flow$045bend$047Canonical$delivery_final_result$(_state_0, ($$$$047agent$045flow$045bend$047Delivery$finalize$(_items_3, _all_acknowledged_0, _any_expired_1)));
  } else if (_event_0.$ === "Canonical.DeliveryFindingDispositionCheck") {
    const _composed_0 = _event_0["composed"];
    const _remaining_0 = _event_0["remaining"];
    return $$$$047agent$045flow$045bend$047Canonical$delivery_disposition_result$(_state_0, ($$$$047agent$045flow$045bend$047Delivery$finding_disposition$(_composed_0, _remaining_0)));
  } else if (_event_0.$ === "Canonical.DeliverySubmissionCandidateCheck") {
    const _facts_3 = _event_0["facts"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Delivery$submission_candidate$(_facts_3)), {$: "Canonical.DeliverySubmissionCandidate"}, {$: "Canonical.DeliverySubmissionRefused"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliverySubmissionBatchCheck") {
    const _count_1 = _event_0["count"];
    const _all_valid_0 = _event_0["all_valid"];
    return $$$$047agent$045flow$045bend$047Canonical$delivery_batch_result$(_state_0, ($$$$047agent$045flow$045bend$047Delivery$submission_batch_gate$(_count_1, _all_valid_0)));
  } else if (_event_0.$ === "Canonical.DeliveryCredentialObserveCheck") {
    const _invalid_seen_0 = _event_0["invalid_seen"];
    const _generation_valid_1 = _event_0["generation_valid"];
    const _authorized_0 = _event_0["authorized"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Delivery$credential_observe$(_invalid_seen_0, _generation_valid_1, _authorized_0)), {$: "Canonical.DeliveryCredentialInvalid"}, {$: "Canonical.DeliveryCredentialValid"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryFinalCredentialCheck") {
    const _shared_collect_0 = _event_0["shared_collect"];
    const _invalid_seen_1 = _event_0["invalid_seen"];
    return $$$$047agent$045flow$045bend$047Canonical$delivery_batch_result$(_state_0, ($$$$047agent$045flow$045bend$047Delivery$final_credential_gate$(_shared_collect_0, _invalid_seen_1)));
  } else if (_event_0.$ === "Canonical.ValidationRouteCheck") {
    const _owner_current_0 = _event_0["owner_current"];
    const _status_0 = _event_0["status"];
    return $$$$047agent$045flow$045bend$047Canonical$candidate_route_result$(_state_0, ($$$$047agent$045flow$045bend$047Handoff$validation_route$(_owner_current_0, _status_0)));
  } else if (_event_0.$ === "Canonical.PostValidationCheck") {
    const _work_accepted_0 = _event_0["work_accepted"];
    const _expired_2 = _event_0["expired"];
    const _has_fitting_0 = _event_0["has_fitting"];
    return $$$$047agent$045flow$045bend$047Canonical$candidate_route_result$(_state_0, ($$$$047agent$045flow$045bend$047Handoff$post_validation$(_work_accepted_0, _expired_2, _has_fitting_0)));
  } else if (_event_0.$ === "Canonical.FinalCandidateCheck") {
    const _owner_current_1 = _event_0["owner_current"];
    const _credential_generation_0 = _event_0["credential_generation"];
    const _credential_authorized_0 = _event_0["credential_authorized"];
    const _expired_3 = _event_0["expired"];
    const _work_current_0 = _event_0["work_current"];
    const _has_findings_0 = _event_0["has_findings"];
    return $$$$047agent$045flow$045bend$047Canonical$candidate_route_result$(_state_0, ($$$$047agent$045flow$045bend$047Handoff$final_candidate$(_owner_current_1, _credential_generation_0, _credential_authorized_0, _expired_3, _work_current_0, _has_findings_0)));
  } else if (_event_0.$ === "Canonical.RoundBeginStopCheck") {
    const _active_1 = _event_0["active"];
    const _has_stop_0 = _event_0["has_stop"];
    const _token_20 = _event_0["token"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_active_1, ($Bool$and$(($Bool$not$(_has_stop_0)), ($Nat$is_gt$(_token_20, 0)))))), {$: "Canonical.RoundStopBegun"}, {$: "Canonical.RoundStopRefused"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RoundActivityCheck") {
    const _bound_0 = _event_0["bound"];
    const _has_admission_0 = _event_0["has_admission"];
    const _round_35 = _event_0["round"];
    const _active_2 = _event_0["active"];
    const _expected_generation_0 = _event_0["expected_generation"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_bound_0, ($Bool$and$(_has_admission_0, ($Bool$and$(($Nat$is_eq$(_expected_generation_0, _round_35)), _active_2)))))), {$: "Canonical.RoundActive"}, {$: "Canonical.RoundInactive"})), "tail": {$: "Nil"}}};
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
    return $$$$047agent$045flow$045bend$047Canonical$stop_terminal_result$(_state_0, ($$$$047agent$045flow$045bend$047Round$stop_terminal$(_has_output_0, _authorized_1, _requested_close_0)));
  } else if (_event_0.$ === "Canonical.RoundExpireCloseCheck") {
    const _barrier_0 = _event_0["barrier"];
    const _authorized_output_0 = _event_0["authorized_output"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(($Bool$not$(_authorized_output_0)), ($$$$047agent$045flow$045bend$047Round$expire_close$(_barrier_0)))), {$: "Canonical.RoundExpireCloses"}, {$: "Canonical.RoundExpireKeeps"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RoundContinuationBudgetCheck") {
    const _active_4 = _event_0["active"];
    const _count_2 = _event_0["count"];
    const _x_0 = ($$$$047agent$045flow$045bend$047Round$max_continuations$());
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($Bool$and$(_active_4, (_count_2 < _x_0))), {$: "Canonical.RoundContinuationAvailable"}, {$: "Canonical.RoundContinuationExhausted"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliverySubmissionAllowedCheck") {
    const _active_5 = _event_0["active"];
    const _barrier_1 = _event_0["barrier"];
    const _deciding_1 = _event_0["deciding"];
    const _surface_2 = _event_0["surface"];
    const _existing_token_0 = _event_0["existing_token"];
    const _finish_permit_0 = _event_0["finish_permit"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Delivery$submission_allowed_facts$(_active_5, _barrier_1, _deciding_1, _surface_2, _existing_token_0, _finish_permit_0)), {$: "Canonical.DeliverySubmissionAllowed"}, {$: "Canonical.DeliverySubmissionDenied"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryExistingTokenCheck") {
    const _surface_3 = _event_0["surface"];
    const _existing_token_1 = _event_0["existing_token"];
    const _finish_permit_1 = _event_0["finish_permit"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Delivery$existing_token_allowed$(_surface_3, _existing_token_1, _finish_permit_1)), {$: "Canonical.DeliveryExistingTokenAllowed"}, {$: "Canonical.DeliveryExistingTokenDenied"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.DeliveryUnreservedStopCheck") {
    const _active_6 = _event_0["active"];
    const _deciding_2 = _event_0["deciding"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": ($Bool$pick$(($$$$047agent$045flow$045bend$047Delivery$unreserved_stop_allowed_facts$(_active_6, _deciding_2)), {$: "Canonical.DeliveryUnreservedStopAllowed"}, {$: "Canonical.DeliveryUnreservedStopDenied"})), "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.IncludeLayerCheck") {
    const _supplied_0 = _event_0["supplied"];
    const _current_rank_0 = _event_0["current_rank"];
    const _candidate_rank_0 = _event_0["candidate_rank"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.IncludeChoice", "choice": ($$$$047agent$045flow$045bend$047Configuration$include_choice$(_supplied_0, _current_rank_0, _candidate_rank_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.FileSelectionCheck") {
    const _protected_0 = _event_0["protected"];
    const _excluded_0 = _event_0["excluded"];
    const _includes_empty_0 = _event_0["includes_empty"];
    const _included_0 = _event_0["included"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FileSelection", "selection": ($$$$047agent$045flow$045bend$047Configuration$select$(_protected_0, _excluded_0, _includes_empty_0, _included_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.FileProtectionInvalid") {
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FileProtection", "protection": {$: "Configuration.RepositoryBoundary"}}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.FileProtectionCheck") {
    const _sensitive_name_0 = _event_0["sensitive_name"];
    const _generated_or_vendor_0 = _event_0["generated_or_vendor"];
    const _allowed_extension_0 = _event_0["allowed_extension"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.FileProtection", "protection": ($$$$047agent$045flow$045bend$047Configuration$protection$(_sensitive_name_0, _generated_or_vendor_0, _allowed_extension_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.CandidateFileCheck") {
    const _git_admin_0 = _event_0["git_admin"];
    const _physical_safe_0 = _event_0["physical_safe"];
    const _git_allowed_0 = _event_0["git_allowed"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.CandidateFile", "candidate": ($$$$047agent$045flow$045bend$047Configuration$candidate$(_git_admin_0, _physical_safe_0, _git_allowed_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.ReviewAdmissionCheck") {
    const _root_valid_1 = _event_0["root_valid"];
    const _configuration_valid_1 = _event_0["configuration_valid"];
    const _credential_ready_1 = _event_0["credential_ready"];
    const _selected_4 = _event_0["selected"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.ReviewAdmission", "admission": ($$$$047agent$045flow$045bend$047Configuration$admit$(_root_valid_1, _configuration_valid_1, _credential_ready_1, _selected_4))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleEnableCheck") {
    const _pack_enabled_0 = _event_0["pack_enabled"];
    const _rule_enabled_0 = _event_0["rule_enabled"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($$$$047agent$045flow$045bend$047RulePolicy$enabled$(_pack_enabled_0, _rule_enabled_0))}, "tail": {$: "Nil"}}};
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
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($$$$047agent$045flow$045bend$047RulePolicy$applicable$(_consent_0, _complete_0, _target_0, _global_included_0, _global_excluded_0, _pack_enabled_1, _rule_enabled_1, _rule_included_0, _rule_excluded_0, _target_declared_0, _capabilities_available_0, _source_rung_0, _minimum_rung_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleFindingCheck") {
    const _probability_0 = _event_0["probability"];
    const _threshold_0 = _event_0["threshold"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($$$$047agent$045flow$045bend$047RulePolicy$finding$(_probability_0, _threshold_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleRankOrderCheck") {
    const _left_0 = _event_0["left"];
    const _right_0 = _event_0["right"];
    const _left_rank_0 = _event_0["left_rank"];
    const _right_rank_0 = _event_0["right_rank"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleOrder", "order": ($$$$047agent$045flow$045bend$047RulePolicy$rank_order$(_left_0, _right_0, _left_rank_0, _right_rank_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.AdviceOrderCheck") {
    const _left_1 = _event_0["left"];
    const _right_1 = _event_0["right"];
    const _path_order_0 = _event_0["path_order"];
    const _id_order_0 = _event_0["id_order"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleOrder", "order": ($$$$047agent$045flow$045bend$047RulePolicy$advice_order$(_left_1, _right_1, _path_order_0, _id_order_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.RuleBudgetCheck") {
    const _position_0 = _event_0["position"];
    const _limit_0 = _event_0["limit"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.RuleGate", "gate": ($$$$047agent$045flow$045bend$047RulePolicy$budget$(_position_0, _limit_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.ReuseRoute") {
    const _id_0 = _event_0["id"];
    const _live_advice_0 = _event_0["live_advice"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_route_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$route$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _id_0, _live_advice_0)));
  } else if (_event_0.$ === "Canonical.ReuseClaim") {
    const _id_1 = _event_0["id"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_decision_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$claim$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _id_1)), {$: "Canonical.ReuseClaimed"});
  } else if (_event_0.$ === "Canonical.ReuseAttach") {
    const _id_2 = _event_0["id"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_decision_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$attach$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _id_2)), {$: "Canonical.ReuseAttached"});
  } else if (_event_0.$ === "Canonical.ReuseRelease") {
    const _id_3 = _event_0["id"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_step$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$release$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _id_3)), {$: "Canonical.ReuseReleased"});
  } else if (_event_0.$ === "Canonical.ReuseTouch") {
    const _id_4 = _event_0["id"];
    return $$$$047agent$045flow$045bend$047Canonical$reuse_route_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$touch$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _id_4)));
  } else if (_event_0.$ === "Canonical.CachePrepare") {
    const _id_5 = _event_0["id"];
    const _bytes_7 = _event_0["bytes"];
    const _entry_limit_0 = _event_0["entry_limit"];
    const _byte_limit_0 = _event_0["byte_limit"];
    return $$$$047agent$045flow$045bend$047Canonical$cache_plan_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$prepare$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _id_5, _bytes_7, _entry_limit_0, _byte_limit_0)));
  } else if (_event_0.$ === "Canonical.CacheCommit") {
    const _id_6 = _event_0["id"];
    const _partition_31 = _event_0["partition"];
    const _bytes_8 = _event_0["bytes"];
    const _reservation_3 = _event_0["reservation"];
    const _entry_limit_1 = _event_0["entry_limit"];
    const _byte_limit_1 = _event_0["byte_limit"];
    return $$$$047agent$045flow$045bend$047Canonical$cache_commit$(_state_0, _id_6, _partition_31, _bytes_8, _reservation_3, _entry_limit_1, _byte_limit_1);
  } else if (_event_0.$ === "Canonical.CacheDiscardPartition") {
    const _partition_32 = _event_0["partition"];
    return $$$$047agent$045flow$045bend$047Canonical$cache_discard_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$discard$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _partition_32)));
  } else if (_event_0.$ === "Canonical.CacheClear") {
    return $$$$047agent$045flow$045bend$047Canonical$cache_discard_result$(_state_0, ($$$$047agent$045flow$045bend$047ReuseState$clear$(($$$$047agent$045flow$045bend$047CollectionState$reuse_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))))));
  } else if (_event_0.$ === "Canonical.NoticeAdvance") {
    const _key_0 = _event_0["key"];
    const _remaining_1 = _event_0["remaining"];
    const _maximum_keys_0 = _event_0["maximum_keys"];
    const _proposed_0 = _event_0["proposed"];
    const _sequence_0 = _event_0["sequence"];
    const _max_count_0 = _event_0["max_count"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_advance_result$(_state_0, ($$$$047agent$045flow$045bend$047NoticeState$advance$(($$$$047agent$045flow$045bend$047CollectionState$notice_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _key_0, _remaining_1, _maximum_keys_0, _proposed_0, _sequence_0, _max_count_0)));
  } else if (_event_0.$ === "Canonical.NoticeCommit") {
    const _key_1 = _event_0["key"];
    const _partition_33 = _event_0["partition"];
    const _group_12 = _event_0["group"];
    const _reservation_4 = _event_0["reservation"];
    const _pending_0 = _event_0["pending"];
    const _sequence_1 = _event_0["sequence"];
    const _maximum_keys_1 = _event_0["maximum_keys"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_commit$(_state_0, _key_1, _partition_33, _group_12, _reservation_4, _pending_0, _sequence_1, _maximum_keys_1);
  } else if (_event_0.$ === "Canonical.NoticePrune") {
    const _key_2 = _event_0["key"];
    const _lease_expired_0 = _event_0["lease_expired"];
    const _pending_expired_0 = _event_0["pending_expired"];
    const _excepted_0 = _event_0["excepted"];
    const _cooldown_expired_0 = _event_0["cooldown_expired"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_prune_result$(_state_0, ($$$$047agent$045flow$045bend$047NoticeState$prune$(($$$$047agent$045flow$045bend$047CollectionState$notice_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _key_2, _lease_expired_0, _pending_expired_0, _excepted_0, _cooldown_expired_0)));
  } else if (_event_0.$ === "Canonical.NoticeDrop") {
    const _key_3 = _event_0["key"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_step$(_state_0, ($$$$047agent$045flow$045bend$047NoticeState$drop$(($$$$047agent$045flow$045bend$047CollectionState$notice_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _key_3)), {$: "Canonical.NoticeDropped"});
  } else if (_event_0.$ === "Canonical.NoticeLease") {
    const _key_4 = _event_0["key"];
    const _leased_0 = _event_0["leased"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_decision_result$(_state_0, ($$$$047agent$045flow$045bend$047NoticeState$lease$(($$$$047agent$045flow$045bend$047CollectionState$notice_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _key_4, _leased_0)), {$: "Canonical.NoticeLeased"});
  } else if (_event_0.$ === "Canonical.NoticeClearPending") {
    const _key_5 = _event_0["key"];
    return $$$$047agent$045flow$045bend$047Canonical$notice_decision_result$(_state_0, ($$$$047agent$045flow$045bend$047NoticeState$clear_pending$(($$$$047agent$045flow$045bend$047CollectionState$notice_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _key_5)), {$: "Canonical.NoticePendingCleared"});
  } else if (_event_0.$ === "Canonical.NoticeSelect") {
    const _partition_34 = _event_0["partition"];
    const _group_13 = _event_0["group"];
    const _composed_1 = _event_0["composed"];
    const _authority_bound_1 = _event_0["authority_bound"];
    const _allowed_0 = _event_0["allowed"];
    return {$: "Canonical.Advanced", "state": _state_0, "commands": {$: "Con", "head": {$: "Canonical.NoticeSelected", "ids": ($$$$047agent$045flow$045bend$047NoticeState$select$(($$$$047agent$045flow$045bend$047CollectionState$notice_state$(($$$$047agent$045flow$045bend$047Canonical$collection_of$(_state_0)))), _partition_34, _group_13, _composed_1, _authority_bound_1, _allowed_0))}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.OutputStarted") {
    const _partition_35 = _event_0["partition"];
    const _lifetime_35 = _event_0["lifetime"];
    const _round_36 = _event_0["round"];
    return $$$$047agent$045flow$045bend$047Canonical$output_start$(_state_0, _partition_35, _lifetime_35, _round_36);
  } else if (_event_0.$ === "Canonical.OutputTerminal") {
    const _partition_36 = _event_0["partition"];
    const _lifetime_36 = _event_0["lifetime"];
    const _round_37 = _event_0["round"];
    const _operation_13 = _event_0["operation"];
    const _outcome_4 = _event_0["outcome"];
    return $$$$047agent$045flow$045bend$047Canonical$output_terminal$(_state_0, _partition_36, _lifetime_36, _round_37, _operation_13, _outcome_4);
  } else if (_event_0.$ === "Canonical.RetirePartition") {
    const _partition_37 = _event_0["partition"];
    const _lifetime_37 = _event_0["lifetime"];
    const _round_38 = _event_0["round"];
    return $$$$047agent$045flow$045bend$047Canonical$retire$(_state_0, _partition_37, _lifetime_37, _round_38);
  } else {
    const _partition_38 = _event_0["partition"];
    const _lifetime_38 = _event_0["lifetime"];
    return $$$$047agent$045flow$045bend$047Canonical$forget_admission$(_state_0, _partition_38, _lifetime_38);
  }
}

function $$$$047agent$045flow$045bend$047Canonical$round_not_found$(_found_0) {
  if (_found_0.$ === "None") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047Canonical$unique_rounds$(_rounds_0) {
  if (_rounds_0.$ === "Nil") {
    return true;
  } else {
    const _t_0 = _rounds_0["head"];
    const _partition_0 = _t_0["partition"];
    const _rest_0 = _rounds_0["tail"];
    return $Bool$and$(($$$$047agent$045flow$045bend$047Canonical$round_not_found$(($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, _rest_0)))), ($$$$047agent$045flow$045bend$047Canonical$unique_rounds$(_rest_0)));
  }
}

function $$$$047agent$045flow$045bend$047Canonical$check_round_invariant$(_original_0, _updated_0, _commands_0, _valid_0) {
  if (_valid_0) {
    return {$: "Canonical.Advanced", "state": _updated_0, "commands": _commands_0};
  } else {
    return {$: "Canonical.Rejected", "state": _original_0, "reason": {$: "Canonical.InconsistentLedger"}};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$check_step$(_original_0, _result_0) {
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
    return $$$$047agent$045flow$045bend$047Canonical$check_round_invariant$(_original_0, {$: "Canonical.State", "ledger": __0, "rounds": _rounds_0, "work": __1, "next_round": __2, "next_operation": __3, "admissions": __4, "dispatch": __5, "collection": __6, "history": _history_0}, _commands_0, ($$$$047agent$045flow$045bend$047Canonical$unique_rounds$(_rounds_0)));
  } else {
    const _state_0 = _result_0["state"];
    const _reason_0 = _result_0["reason"];
    return {$: "Canonical.Rejected", "state": _state_0, "reason": _reason_0};
  }
}

function $$$$047agent$045flow$045bend$047Canonical$step$(_state_0, _event_0) {
  return $$$$047agent$045flow$045bend$047Canonical$check_step$(_state_0, ($$$$047agent$045flow$045bend$047Canonical$step_unchecked$(_state_0, _event_0)));
}

function $$$$047agent$045flow$045bend$047Canonical$main$() {
  return $$$$047agent$045flow$045bend$047Canonical$step$(($$$$047agent$045flow$045bend$047Canonical$initial$({$: "Ledger.Limits", "global_items": 4, "global_bytes": 100, "partition_items": 2, "partition_bytes": 60})), {$: "Canonical.OpenRound", "partition": 1, "lifetime": 1});
}

function $JevEffects$issued$(_outcome_0, _p_0, _l_0, _r_0, _o_0, _request_0, _delay_0) {
  if (_outcome_0.$ === "Canonical.NeverSent") {
    return {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0, "outcome": {$: "Canonical.NeverSent"}, "current_work": true}, "delay": _delay_0}, "tail": {$: "Nil"}};
  } else if (_outcome_0.$ === "Canonical.RequestInterrupted") {
    return {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestStarted", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0}, "delay": 0}, "tail": {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestInterrupted", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0}, "delay": _delay_0}, "tail": {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0, "outcome": {$: "Canonical.RequestInterrupted"}, "current_work": true}, "delay": _delay_0}, "tail": {$: "Nil"}}}};
  } else {
    return {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestStarted", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0}, "delay": 0}, "tail": {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0, "outcome": _outcome_0, "current_work": true}, "delay": _delay_0}, "tail": {$: "Nil"}}};
  }
}

function $JevEffects$started$(_outcome_0, _p_0, _l_0, _r_0, _o_0, _id_0, _delay_0, _interrupted_0) {
  if (_outcome_0.$ === "Canonical.NeverSent") {
    if (_interrupted_0) {
      return {$: "JevEffects.RefusedStarted"};
    } else {
      return {$: "JevEffects.RefusedStarted"};
    }
  } else if (_outcome_0.$ === "Canonical.RequestInterrupted") {
    if (!_interrupted_0) {
      return {$: "JevEffects.Applied", "facts": {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestInterrupted", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _id_0}, "delay": _delay_0}, "tail": {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _id_0, "outcome": {$: "Canonical.RequestInterrupted"}, "current_work": true}, "delay": _delay_0}, "tail": {$: "Nil"}}}};
    } else {
      return {$: "JevEffects.Applied", "facts": {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _id_0, "outcome": {$: "Canonical.RequestInterrupted"}, "current_work": true}, "delay": _delay_0}, "tail": {$: "Nil"}}};
    }
  } else {
    if (_interrupted_0) {
      return {$: "JevEffects.RefusedInterrupted"};
    } else {
      return {$: "JevEffects.Applied", "facts": {$: "Con", "head": {$: "JevEffects.ScheduledFact", "event": {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _id_0, "outcome": _outcome_0, "current_work": true}, "delay": _delay_0}, "tail": {$: "Nil"}}};
    }
  }
}

function $JevEffects$intervene$(_found_0, _outcome_0, _delay_0) {
  if (_found_0.$ === "None") {
    return {$: "JevEffects.RefusedMissing"};
  } else {
    const _t_0 = _found_0["value"];
    const _p_0 = _t_0["partition"];
    const _l_0 = _t_0["lifetime"];
    const _r_0 = _t_0["round"];
    const _o_0 = _t_0["operation"];
    const _id_0 = _t_0["request"];
    const _t_1 = _t_0["started"];
    if (!_t_1) {
      return {$: "JevEffects.Applied", "facts": ($JevEffects$issued$(_outcome_0, _p_0, _l_0, _r_0, _o_0, _id_0, _delay_0))};
    } else {
      const __1 = _t_0["interrupted"];
      return $JevEffects$started$(_outcome_0, _p_0, _l_0, _r_0, _o_0, _id_0, _delay_0, __1);
    }
  }
}

function $JevEffects$started_never_sent_refused$(_p_0, _l_0, _r_0, _o_0, _id_0, _delay_0, _interrupted_0) {
  if (!_interrupted_0) {
    return null;
  } else {
    return null;
  }
}

function $Driver$immediate$(_event_0, _job_0) {
  return {$: "Driver.Action", "event": _event_0, "delay": 0, "candidate": {$: "None"}, "job": _job_0, "expiry_advice": {$: "None"}};
}

function $Driver$candidate_action$(_event_0, _candidate_0) {
  return {$: "Driver.Action", "event": _event_0, "delay": 0, "candidate": {$: "Some", "value": _candidate_0}, "job": false, "expiry_advice": {$: "None"}};
}

function $Driver$work_id$(_work_0) {
  const _operation_0 = _work_0["operation"];
  return _operation_0;
}

function $Driver$operation_hit$(_found_0, _head_0, _rest_0) {
  if (_found_0) {
    return {$: "Some", "value": _head_0};
  } else {
    return _rest_0;
  }
}

function $Driver$find_operation$(_work_0, _operation_0) {
  if (_work_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _head_0 = _work_0["head"];
    const _tail_0 = _work_0["tail"];
    return $Driver$operation_hit$(($Nat$is_eq$(($Driver$work_id$(_head_0)), _operation_0)), _head_0, ($Driver$find_operation$(_tail_0, _operation_0)));
  }
}

function $Driver$dispatch_work$(_found_0, _context_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _p_0 = _t_0["partition"];
    const _l_0 = _t_0["lifetime"];
    const _r_0 = _t_0["round"];
    const _o_0 = _t_0["operation"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.AwaitingSourceRead") {
      const _bytes_0 = _context_0["bytes"];
      return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.StartObservation", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "observation": _o_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.BeginObservedPreparation", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "observation": _o_0, "bytes": _bytes_0}, true)), "tail": {$: "Nil"}}}};
    } else if (_t_1.$ === "Canonical.Reviewing") {
      const _current_0 = _context_0["current_work"];
      const _credential_0 = _context_0["credential_ready"];
      return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.StartReview", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.JevRequestReady", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "root_valid": true, "configuration_valid": true, "credential_ready": _credential_0, "selected": true, "current_work": _current_0, "physical_available": true}, false)), "tail": {$: "Nil"}}}};
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$issued_actions$(_facts_0) {
  if (_facts_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _facts_0["head"];
    const _event_0 = _t_0["event"];
    const _delay_0 = _t_0["delay"];
    const _tail_0 = _facts_0["tail"];
    return {$: "Con", "head": {$: "Driver.Action", "event": _event_0, "delay": _delay_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}}, "tail": ($Driver$issued_actions$(_tail_0))};
  }
}

function $Driver$issued_outcome$(_outcome_0, _p_0, _l_0, _r_0, _o_0, _request_0, _delay_0) {
  return {$: "Driver.Handled", "handled": true, "actions": ($Driver$issued_actions$(($JevEffects$issued$(_outcome_0, _p_0, _l_0, _r_0, _o_0, _request_0, _delay_0))))};
}

function $Driver$candidate_check$(_advice_0, _partition_0, _round_0, _credential_0, _generation_0, _current_0, _readable_0, _surface_0) {
  const _candidate_0 = {$: "Driver.Candidate", "partition": _partition_0, "advice": _advice_0, "round": _round_0, "token": _advice_0, "surface": _surface_0, "selection": false};
  return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$candidate_action$({$: "Canonical.FinalCandidateCheck", "owner_current": true, "credential_generation": _generation_0, "credential_authorized": _credential_0, "expired": false, "work_current": ($Bool$and$(_current_0, _readable_0)), "has_findings": true}, _candidate_0)), "tail": {$: "Nil"}}};
}

function $Driver$suppress_value$(_candidate_0) {
  const __0 = _candidate_0["partition"];
  const _advice_0 = _candidate_0["advice"];
  const _round_0 = _candidate_0["round"];
  const __1 = _candidate_0["token"];
  const _surface_0 = _candidate_0["surface"];
  const __2 = _candidate_0["selection"];
  return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$candidate_action$({$: "Canonical.SubmissionSuppressCheck", "advice": _advice_0, "fingerprint": _advice_0, "round": _round_0, "surface": _surface_0}, {$: "Driver.Candidate", "partition": __0, "advice": _advice_0, "round": _round_0, "token": __1, "surface": _surface_0, "selection": __2})), "tail": {$: "Nil"}}};
}

function $Driver$suppress$(_candidate_0) {
  if (_candidate_0.$ === "Some") {
    const _c_0 = _candidate_0["value"];
    return $Driver$suppress_value$(_c_0);
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$reserve$(_candidate_0) {
  if (_candidate_0.$ === "Some") {
    const _t_0 = _candidate_0["value"];
    const _p_0 = _t_0["partition"];
    const _advice_0 = _t_0["advice"];
    const _round_0 = _t_0["round"];
    const _token_0 = _t_0["token"];
    const _surface_0 = _t_0["surface"];
    const _t_1 = _t_0["selection"];
    if (!_t_1) {
      return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.CollectionReserveLease", "advice": _advice_0, "token": _token_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.SubmissionBegin", "advice": _advice_0, "group": _p_0, "round": _round_0, "token": _token_0, "surface": _surface_0, "authorize_now": true, "fingerprints": {$: "Con", "head": _advice_0, "tail": {$: "Nil"}}, "units": {$: "Con", "head": _advice_0, "tail": {$: "Nil"}}}, false)), "tail": {$: "Nil"}}}};
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$output$(_p_0, _advice_0, _token_0, _certain_0, _delay_0, _lease_0) {
  return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.SubmissionTerminal", "advice": _advice_0, "token": _token_0, "certain": _certain_0}, "delay": _delay_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}}, "tail": {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.CollectionLeaseCheck", "advice": _advice_0, "token": _token_0, "expired": false, "stop_collector": false, "same_group": true, "reofferable": false}, "delay": _delay_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}}, "tail": {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.CollectionReleaseLease", "advice": _advice_0, "token": _token_0}, "delay": _delay_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}}, "tail": {$: "Nil"}}}}};
}

function $Driver$work_list$(_state_0) {
  const _work_0 = _state_0["work"];
  return _work_0;
}

function $Driver$retained$(_event_0, _lifetime_0) {
  if (_event_0.$ === "Canonical.JevRequestSettled") {
    const _operation_0 = _event_0["operation"];
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.CollectionExpiryCheck", "elapsed": _lifetime_0, "lifetime": _lifetime_0}, "delay": _lifetime_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "Some", "value": _operation_0}}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.ReviewCompleted") {
    const _operation_1 = _event_0["operation"];
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.CollectionExpiryCheck", "elapsed": _lifetime_0, "lifetime": _lifetime_0}, "delay": _lifetime_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "Some", "value": _operation_1}}, "tail": {$: "Nil"}}};
  } else if (_event_0.$ === "Canonical.ReviewObserved") {
    const _operation_2 = _event_0["operation"];
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.CollectionExpiryCheck", "elapsed": _lifetime_0, "lifetime": _lifetime_0}, "delay": _lifetime_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "Some", "value": _operation_2}}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$eligible$(_event_0, _credential_0, _generation_0, _current_0, _readable_0, _surface_0) {
  if (_event_0.$ === "Canonical.CollectionReady") {
    const _advice_0 = _event_0["advice"];
    const _p_0 = _event_0["partition"];
    const _r_0 = _event_0["round"];
    return $Driver$candidate_check$(_advice_0, _p_0, _r_0, _credential_0, _generation_0, _current_0, _readable_0, _surface_0);
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$submitted$(_event_0, _p_0, _certain_0, _delay_0, _lease_0) {
  if (_event_0.$ === "Canonical.SubmissionBegin") {
    const _advice_0 = _event_0["advice"];
    const _token_0 = _event_0["token"];
    const _t_0 = _event_0["authorize_now"];
    if (_t_0) {
      return $Driver$output$(_p_0, _advice_0, _token_0, _certain_0, _delay_0, _lease_0);
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_event_0.$ === "Canonical.SubmissionAuthorize") {
    const _advice_1 = _event_0["advice"];
    const _token_1 = _event_0["token"];
    return $Driver$output$(_p_0, _advice_1, _token_1, _certain_0, _delay_0, _lease_0);
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$retired_work$(_found_0, _advice_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _p_0 = _t_0["partition"];
    const _l_0 = _t_0["lifetime"];
    const _r_0 = _t_0["round"];
    const _t_1 = _t_0["kind"];
    if (_t_1.$ === "Canonical.PendingFinding") {
      return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.CollectionRetireAdvice", "advice": _advice_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.SubmissionForget", "advice": _advice_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.RetireReview", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _advice_0}, false)), "tail": {$: "Nil"}}}}};
    } else {
      return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.CollectionRetireAdvice", "advice": _advice_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.SubmissionForget", "advice": _advice_0}, false)), "tail": {$: "Nil"}}}};
    }
  } else {
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.CollectionRetireAdvice", "advice": _advice_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.SubmissionForget", "advice": _advice_0}, false)), "tail": {$: "Nil"}}}};
  }
}

function $Driver$retirement$(_state_0, _candidate_0) {
  if (_candidate_0.$ === "Some") {
    const _t_0 = _candidate_0["value"];
    const _advice_0 = _t_0["advice"];
    return $Driver$retired_work$(($Driver$find_operation$(($Driver$work_list$(_state_0)), _advice_0)), _advice_0);
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$collection_surface$(_background_0) {
  if (_background_0) {
    return {$: "Handoff.Background"};
  } else {
    return {$: "Handoff.Edit"};
  }
}

function $Driver$running$(_state_0) {
  const _t_0 = _state_0["dispatch"];
  const _running_0 = _t_0["running"];
  return _running_0;
}

function $Driver$release_if$(_available_0, _p_0, _l_0, _r_0, _o_0) {
  if (_available_0) {
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.DispatchSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0}, false)), "tail": {$: "Nil"}}};
  } else {
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Nil"}};
  }
}

function $Driver$unavailable$(_state_0, _event_0) {
  if (_event_0.$ === "Canonical.JevRequestReady") {
    const _p_0 = _event_0["partition"];
    const _l_0 = _event_0["lifetime"];
    const _r_0 = _event_0["round"];
    const _o_0 = _event_0["operation"];
    return $Driver$release_if$(($$$$047agent$045flow$045bend$047Dispatch$contains$(($Driver$running$(_state_0)), _p_0, _l_0, _r_0, _o_0)), _p_0, _l_0, _r_0, _o_0);
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$refused_preparation$(_event_0) {
  if (_event_0.$ === "Canonical.BeginObservedPreparation") {
    const _p_0 = _event_0["partition"];
    const _l_0 = _event_0["lifetime"];
    const _r_0 = _event_0["round"];
    const _observation_0 = _event_0["observation"];
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.CompleteObservation", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "observation": _observation_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.DispatchSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _observation_0}, false)), "tail": {$: "Nil"}}}};
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$handle$(_state_0, _event_0, _command_0, _context_0) {
  if (_command_0.$ === "Canonical.PreparationRefused") {
    return $Driver$refused_preparation$(_event_0);
  } else if (_command_0.$ === "Canonical.JevRequestUnavailable") {
    return $Driver$unavailable$(_state_0, _event_0);
  } else if (_command_0.$ === "Canonical.ObservationAdmitted") {
    const _id_0 = _command_0["id"];
    const _p_0 = _context_0["partition"];
    const _l_0 = _context_0["lifetime"];
    const _r_0 = _context_0["round"];
    const _t_0 = _context_0["job"];
    if (_t_0) {
      return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.QueueDispatch", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _id_0}, false)), "tail": {$: "Nil"}}};
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_command_0.$ === "Canonical.DispatchStarted") {
    const _operation_0 = _command_0["operation"];
    const _p_1 = _context_0["partition"];
    const _l_1 = _context_0["lifetime"];
    const _r_1 = _context_0["round"];
    const __34 = _context_0["bytes"];
    const _t_1 = _context_0["job"];
    if (_t_1) {
      const __35 = _context_0["jev_delay"];
      const __36 = _context_0["outcome"];
      const __37 = _context_0["current_work"];
      const __38 = _context_0["credential_ready"];
      const __39 = _context_0["credential_generation"];
      const __40 = _context_0["source_readable"];
      const __41 = _context_0["advice_lifetime"];
      const __42 = _context_0["candidate"];
      const __43 = _context_0["automatic_collection"];
      const __44 = _context_0["automatic_review"];
      const __45 = _context_0["automatic_output"];
      const __46 = _context_0["output_certain"];
      const __47 = _context_0["output_delay"];
      const __48 = _context_0["output_lease"];
      const __49 = _context_0["background"];
      const __50 = _context_0["automatic_dispatch"];
      return $Driver$dispatch_work$(($Driver$find_operation$(($Driver$work_list$(_state_0)), _operation_0)), {$: "Driver.Context", "partition": _p_1, "lifetime": _l_1, "round": _r_1, "bytes": __34, "job": true, "jev_delay": __35, "outcome": __36, "current_work": __37, "credential_ready": __38, "credential_generation": __39, "source_readable": __40, "advice_lifetime": __41, "candidate": __42, "automatic_collection": __43, "automatic_review": __44, "automatic_output": __45, "output_certain": __46, "output_delay": __47, "output_lease": __48, "background": __49, "automatic_dispatch": __50});
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_command_0.$ === "Canonical.UnitAdmitted") {
    const _operation_1 = _command_0["operation"];
    const _p_2 = _context_0["partition"];
    const _l_2 = _context_0["lifetime"];
    const _r_2 = _context_0["round"];
    const _t_2 = _context_0["automatic_dispatch"];
    if (_t_2) {
      return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.QueueDispatch", "partition": _p_2, "lifetime": _l_2, "round": _r_2, "operation": _operation_1}, false)), "tail": {$: "Nil"}}};
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_command_0.$ === "Canonical.JevRequestIssued") {
    const _p_3 = _command_0["partition"];
    const _l_3 = _command_0["lifetime"];
    const _r_3 = _command_0["round"];
    const _o_0 = _command_0["operation"];
    const _request_0 = _command_0["request"];
    const _delay_0 = _context_0["jev_delay"];
    const _outcome_0 = _context_0["outcome"];
    const _t_3 = _context_0["automatic_review"];
    if (_t_3) {
      return $Driver$issued_outcome$(_outcome_0, _p_3, _l_3, _r_3, _o_0, _request_0, _delay_0);
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_command_0.$ === "Canonical.RetainFinding") {
    const _lifetime_0 = _context_0["advice_lifetime"];
    return $Driver$retained$(_event_0, _lifetime_0);
  } else if (_command_0.$ === "Canonical.CollectionEligible") {
    const _current_0 = _context_0["current_work"];
    const _credential_0 = _context_0["credential_ready"];
    const _generation_0 = _context_0["credential_generation"];
    const _readable_0 = _context_0["source_readable"];
    const _t_4 = _context_0["automatic_collection"];
    if (_t_4) {
      const _background_0 = _context_0["background"];
      return $Driver$eligible$(_event_0, _credential_0, _generation_0, _current_0, _readable_0, ($Driver$collection_surface$(_background_0)));
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_command_0.$ === "Canonical.RetireCandidate") {
    const _candidate_0 = _context_0["candidate"];
    return $Driver$retirement$(_state_0, _candidate_0);
  } else if (_command_0.$ === "Canonical.RetainCandidate") {
    const _candidate_1 = _context_0["candidate"];
    return $Driver$suppress$(_candidate_1);
  } else if (_command_0.$ === "Canonical.ContinueCandidate") {
    const _candidate_2 = _context_0["candidate"];
    return $Driver$suppress$(_candidate_2);
  } else if (_command_0.$ === "Canonical.SubmissionUnsuppressed") {
    const _candidate_3 = _context_0["candidate"];
    const _t_5 = _context_0["automatic_output"];
    if (_t_5) {
      return $Driver$reserve$(_candidate_3);
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_command_0.$ === "Canonical.SubmissionAuthorized") {
    const _p_4 = _context_0["partition"];
    const _t_6 = _context_0["automatic_output"];
    if (_t_6) {
      const _certain_0 = _context_0["output_certain"];
      const _delay_1 = _context_0["output_delay"];
      const _lease_0 = _context_0["output_lease"];
      return $Driver$submitted$(_event_0, _p_4, _certain_0, _delay_1, _lease_0);
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else if (_command_0.$ === "Canonical.SubmissionBegun") {
    const _p_5 = _context_0["partition"];
    const _t_7 = _context_0["automatic_output"];
    if (_t_7) {
      const _certain_2 = _context_0["output_certain"];
      const _delay_3 = _context_0["output_delay"];
      const _lease_2 = _context_0["output_lease"];
      return $Driver$submitted$(_event_0, _p_5, _certain_2, _delay_3, _lease_2);
    } else {
      return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
    }
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Driver$edit_round$(_found_0, _partition_0, _lifetime_0) {
  if (_found_0.$ === "None") {
    return {$: "Driver.EditPlan", "retry": true, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.OpenRound", "partition": _partition_0, "lifetime": _lifetime_0}, false)), "tail": {$: "Nil"}}};
  } else {
    const _t_0 = _found_0["value"];
    const _p_0 = _t_0["partition"];
    const _l_0 = _t_0["lifetime"];
    const _r_0 = _t_0["id"];
    return {$: "Driver.EditPlan", "retry": false, "actions": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.AdmitObservation", "partition": _p_0, "lifetime": _l_0, "round": _r_0}, true)), "tail": {$: "Nil"}}};
  }
}

function $Driver$rounds$(_state_0) {
  const _rounds_0 = _state_0["rounds"];
  return _rounds_0;
}

function $Driver$edit$(_state_0, _partition_0, _lifetime_0) {
  return $Driver$edit_round$(($$$$047agent$045flow$045bend$047Canonical$find_round$(_partition_0, ($Driver$rounds$(_state_0)))), _partition_0, _lifetime_0);
}

function $Driver$preparation_completed$(_partition_0, _lifetime_0, _round_0, _operation_0, _unit_bytes_0, _delay_0) {
  return {$: "Driver.Action", "event": {$: "Canonical.PreparationCompleted", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "unit_bytes": _unit_bytes_0}, "delay": _delay_0, "candidate": {$: "None"}, "job": true, "expiry_advice": {$: "None"}};
}

function $Driver$owns$($0, $1) {
  for (;;) {
    {
      const _work_0 = $0;
      const _advice_0 = $1;
      if (_work_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _work_0["head"];
        const _operation_0 = _t_0["operation"];
        const _t_1 = _t_0["kind"];
        if (_t_1.$ === "Canonical.PendingFinding") {
          const _tail_0 = _work_0["tail"];
          const _x_0 = ($Nat$is_eq$(_operation_0, _advice_0));
          const _x_1 = ($Driver$owns$(_tail_0, _advice_0));
          return (_x_0 || _x_1);
        } else {
          const _tail_1 = _work_0["tail"];
          $0 = _tail_1;
          $1 = _advice_0;
          continue;
        }
      }
    }
  }
}

function $Driver$candidate_owner$(_state_0, _candidate_0) {
  if (_candidate_0.$ === "Some") {
    const _t_0 = _candidate_0["value"];
    const _advice_0 = _t_0["advice"];
    return $Driver$owns$(($Driver$work_list$(_state_0)), _advice_0);
  } else {
    return false;
  }
}

function $Driver$fence$(_state_0, _event_0, _generated_0, _context_0) {
  if (_event_0.$ === "Canonical.JevRequestSettled") {
    const _p_0 = _event_0["partition"];
    const _l_0 = _event_0["lifetime"];
    const _r_0 = _event_0["round"];
    const _o_0 = _event_0["operation"];
    const _request_0 = _event_0["request"];
    const _outcome_0 = _event_0["outcome"];
    const __0 = _event_0["current_work"];
    if (_generated_0) {
      const _current_0 = _context_0["current_work"];
      return {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0, "outcome": _outcome_0, "current_work": _current_0};
    } else {
      return {$: "Canonical.JevRequestSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "request": _request_0, "outcome": _outcome_0, "current_work": __0};
    }
  } else if (_event_0.$ === "Canonical.JevRequestReady") {
    const _p_1 = _event_0["partition"];
    const _l_1 = _event_0["lifetime"];
    const _r_1 = _event_0["round"];
    const _o_1 = _event_0["operation"];
    const _root_0 = _event_0["root_valid"];
    const _configuration_0 = _event_0["configuration_valid"];
    const __21 = _event_0["credential_ready"];
    const _selected_0 = _event_0["selected"];
    const __22 = _event_0["current_work"];
    const _physical_0 = _event_0["physical_available"];
    if (_generated_0) {
      const _current_1 = _context_0["current_work"];
      const _credential_0 = _context_0["credential_ready"];
      return {$: "Canonical.JevRequestReady", "partition": _p_1, "lifetime": _l_1, "round": _r_1, "operation": _o_1, "root_valid": _root_0, "configuration_valid": _configuration_0, "credential_ready": _credential_0, "selected": _selected_0, "current_work": _current_1, "physical_available": _physical_0};
    } else {
      return {$: "Canonical.JevRequestReady", "partition": _p_1, "lifetime": _l_1, "round": _r_1, "operation": _o_1, "root_valid": _root_0, "configuration_valid": _configuration_0, "credential_ready": __21, "selected": _selected_0, "current_work": __22, "physical_available": _physical_0};
    }
  } else if (_event_0.$ === "Canonical.FinalCandidateCheck") {
    const __42 = _event_0["owner_current"];
    const __43 = _event_0["credential_generation"];
    const __44 = _event_0["credential_authorized"];
    const _expired_0 = _event_0["expired"];
    const __45 = _event_0["work_current"];
    const _findings_0 = _event_0["has_findings"];
    if (_generated_0) {
      const _current_2 = _context_0["current_work"];
      const _credential_1 = _context_0["credential_ready"];
      const _generation_0 = _context_0["credential_generation"];
      const _readable_0 = _context_0["source_readable"];
      const _candidate_0 = _context_0["candidate"];
      return {$: "Canonical.FinalCandidateCheck", "owner_current": ($Driver$candidate_owner$(_state_0, _candidate_0)), "credential_generation": _generation_0, "credential_authorized": _credential_1, "expired": _expired_0, "work_current": ($Bool$and$(_current_2, _readable_0)), "has_findings": _findings_0};
    } else {
      return {$: "Canonical.FinalCandidateCheck", "owner_current": __42, "credential_generation": __43, "credential_authorized": __44, "expired": _expired_0, "work_current": __45, "has_findings": _findings_0};
    }
  } else {
    return _event_0;
  }
}

function $Driver$fact_time_nonzero$(_delay_0, _index_0, _count_0) {
  const _x_0 = ($Nat$div$(_delay_0, _count_0));
  const _x_1 = ($Nat$mod$(_delay_0, _count_0));
  const _x_2 = nat_chk(_x_0 * _index_0);
  const _x_3 = ($Nat$div$(nat_chk(_x_1 * _index_0), _count_0));
  return nat_chk(_x_2 + _x_3);
}

function $Driver$fact_time$(_delay_0, _index_0, _count_0) {
  if (_count_0 === 0) {
    return 0;
  } else {
    const _p_0 = (_count_0 - 1);
    return $Driver$fact_time_nonzero$(_delay_0, _index_0, nat_chk(_p_0 + 1));
  }
}

function $Driver$handled_actions$(_handled_0) {
  const _actions_0 = _handled_0["actions"];
  return _actions_0;
}

function $Driver$revalidate_work$($0, $1, $2, $3, $4, $5) {
  for (;;) {
    {
      const _work_0 = $0;
      const _credential_0 = $1;
      const _generation_0 = $2;
      const _current_0 = $3;
      const _readable_0 = $4;
      const _background_0 = $5;
      if (_work_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _t_0 = _work_0["head"];
        const _p_0 = _t_0["partition"];
        const _r_0 = _t_0["round"];
        const _o_0 = _t_0["operation"];
        const _t_1 = _t_0["kind"];
        if (_t_1.$ === "Canonical.PendingFinding") {
          const _tail_0 = _work_0["tail"];
          return $List$append$(($Driver$handled_actions$(($Driver$candidate_check$(_o_0, _p_0, _r_0, _credential_0, _generation_0, _current_0, _readable_0, ($Driver$collection_surface$(_background_0)))))), ($Driver$revalidate_work$(_tail_0, _credential_0, _generation_0, _current_0, _readable_0, _background_0)));
        } else {
          const _tail_1 = _work_0["tail"];
          $0 = _tail_1;
          $1 = _credential_0;
          $2 = _generation_0;
          $3 = _current_0;
          $4 = _readable_0;
          $5 = _background_0;
          continue;
        }
      }
    }
  }
}

function $Driver$revalidate$(_state_0, _context_0) {
  const _current_0 = _context_0["current_work"];
  const _credential_0 = _context_0["credential_ready"];
  const _generation_0 = _context_0["credential_generation"];
  const _readable_0 = _context_0["source_readable"];
  const _background_0 = _context_0["background"];
  return $Driver$revalidate_work$(($Driver$work_list$(_state_0)), _credential_0, _generation_0, _current_0, _readable_0, _background_0);
}

function $AdmissionAttempts$contains$(_pending_0, _partition_0) {
  if (_pending_0.$ === "Nil") {
    return false;
  } else {
    const _head_0 = _pending_0["head"];
    const _tail_0 = _pending_0["tail"];
    const _x_0 = ($Nat$is_eq$(_head_0, _partition_0));
    const _x_1 = ($AdmissionAttempts$contains$(_tail_0, _partition_0));
    return (_x_0 || _x_1);
  }
}

function $AdmissionAttempts$remove_hit$(_hit_0, _head_0, _tail_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _head_0, "tail": _tail_0};
  }
}

function $AdmissionAttempts$remove$(_pending_0, _partition_0) {
  if (_pending_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _pending_0["head"];
    const _tail_0 = _pending_0["tail"];
    return $AdmissionAttempts$remove_hit$(($Nat$is_eq$(_head_0, _partition_0)), _head_0, ($AdmissionAttempts$remove$(_tail_0, _partition_0)));
  }
}

function $AdmissionAttempts$consumed$(_pending_0, _event_0) {
  if (_event_0.$ === "Canonical.OpenRound") {
    const _partition_0 = _event_0["partition"];
    return $AdmissionAttempts$remove$(_pending_0, _partition_0);
  } else {
    return _pending_0;
  }
}

function $AdmissionAttempts$pending_plan$(_already_pending_0, _pending_0, _partition_0, _actions_0) {
  if (_already_pending_0) {
    return {$: "AdmissionAttempts.Attempt", "pending": _pending_0, "plan": {$: "Driver.EditPlan", "retry": true, "actions": {$: "Nil"}}};
  } else {
    return {$: "AdmissionAttempts.Attempt", "pending": {$: "Con", "head": _partition_0, "tail": _pending_0}, "plan": {$: "Driver.EditPlan", "retry": true, "actions": _actions_0}};
  }
}

function $AdmissionAttempts$planned$(_pending_0, _partition_0, _plan_0) {
  const _t_0 = _plan_0["retry"];
  if (_t_0) {
    const _actions_0 = _plan_0["actions"];
    return $AdmissionAttempts$pending_plan$(($AdmissionAttempts$contains$(_pending_0, _partition_0)), _pending_0, _partition_0, _actions_0);
  } else {
    const _actions_1 = _plan_0["actions"];
    return {$: "AdmissionAttempts.Attempt", "pending": _pending_0, "plan": {$: "Driver.EditPlan", "retry": _t_0, "actions": _actions_1}};
  }
}

function $AdmissionAttempts$edit$(_state_0, _pending_0, _partition_0, _lifetime_0) {
  return $AdmissionAttempts$planned$(_pending_0, _partition_0, ($Driver$edit$(_state_0, _partition_0, _lifetime_0)));
}

function $PendingEffects$retiring$($0) {
  for (;;) {
    {
      const _actions_0 = $0;
      if (_actions_0.$ === "Nil") {
        return {$: "None"};
      } else {
        const _t_0 = _actions_0["head"];
        const _t_1 = _t_0["event"];
        if (_t_1.$ === "Canonical.RetireReview") {
          const _operation_0 = _t_1["operation"];
          return {$: "Some", "value": _operation_0};
        } else {
          const __12 = _actions_0["tail"];
          $0 = __12;
          continue;
        }
      }
    }
  }
}

function $PendingEffects$known$(_already_pending_0, _pending_0, _operation_0, _actions_0) {
  if (_already_pending_0) {
    return {$: "PendingEffects.Issued", "pending": _pending_0, "actions": {$: "Nil"}};
  } else {
    return {$: "PendingEffects.Issued", "pending": {$: "Con", "head": _operation_0, "tail": _pending_0}, "actions": _actions_0};
  }
}

function $PendingEffects$found$(_operation_0, _pending_0, _actions_0) {
  if (_operation_0.$ === "None") {
    return {$: "PendingEffects.Issued", "pending": _pending_0, "actions": _actions_0};
  } else {
    const _operation_1 = _operation_0["value"];
    return $PendingEffects$known$(($AdmissionAttempts$contains$(_pending_0, _operation_1)), _pending_0, _operation_1, _actions_0);
  }
}

function $PendingEffects$issue$(_pending_0, _actions_0) {
  return $PendingEffects$found$(($PendingEffects$retiring$(_actions_0)), _pending_0, _actions_0);
}

function $PendingEffects$consumed$(_pending_0, _event_0) {
  if (_event_0.$ === "Canonical.RetireReview") {
    const _operation_0 = _event_0["operation"];
    return $AdmissionAttempts$remove$(_pending_0, _operation_0);
  } else {
    return _pending_0;
  }
}

function $PendingEffects$already_issued_batch_coalesces$(_pending_0, _operation_0, _actions_0) {
  return null;
}

function $Advicees$initial$() {
  return {$: "Advicees.Registry", "next": 1, "scopes": {$: "Nil"}};
}

function $Advicees$maximum$() {
  const _x_0 = nat_chk(65536 * 4294967295);
  return nat_chk(_x_0 + 65535);
}

function $Advicees$bounded$(_identity_0) {
  return $Bool$and$(($Nat$is_gt$(_identity_0, 0)), ($Nat$is_le$(_identity_0, ($Advicees$maximum$()))));
}

function $Advicees$scope_identity$(_scope_0) {
  const _identity_0 = _scope_0["identity"];
  return _identity_0;
}

function $Advicees$scope_partition$(_scope_0) {
  const _partition_0 = _scope_0["partition"];
  return _partition_0;
}

function $Advicees$found$(_equal_0, _scope_0, _other_0) {
  if (_equal_0) {
    return {$: "Some", "value": _scope_0};
  } else {
    return _other_0;
  }
}

function $Advicees$find_identity$(_scopes_0, _identity_0) {
  if (_scopes_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _head_0 = _scopes_0["head"];
    const _tail_0 = _scopes_0["tail"];
    return $Advicees$found$(($Nat$is_eq$(($Advicees$scope_identity$(_head_0)), _identity_0)), _head_0, ($Advicees$find_identity$(_tail_0, _identity_0)));
  }
}

function $Advicees$find_partition$(_scopes_0, _partition_0) {
  if (_scopes_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _head_0 = _scopes_0["head"];
    const _tail_0 = _scopes_0["tail"];
    return $Advicees$found$(($Nat$is_eq$(($Advicees$scope_partition$(_head_0)), _partition_0)), _head_0, ($Advicees$find_partition$(_tail_0, _partition_0)));
  }
}

function $Advicees$lookup_identity$(_registry_0, _identity_0) {
  const _scopes_0 = _registry_0["scopes"];
  return $Advicees$find_identity$(_scopes_0, _identity_0);
}

function $Advicees$lookup_partition$(_registry_0, _partition_0) {
  const _scopes_0 = _registry_0["scopes"];
  return $Advicees$find_partition$(_scopes_0, _partition_0);
}

function $Advicees$absent$(_scope_0) {
  if (_scope_0.$ === "None") {
    return true;
  } else {
    return false;
  }
}

function $Advicees$declaration$(_valid_0, _registry_0, _identity_0, _seed_0) {
  if (_valid_0) {
    const _next_0 = _registry_0["next"];
    const _scopes_0 = _registry_0["scopes"];
    const _scope_0 = {$: "Advicees.Scope", "identity": _identity_0, "partition": _next_0, "seed": _seed_0};
    return {$: "Advicees.Declared", "registry": {$: "Advicees.Registry", "next": nat_chk(_next_0 + 1), "scopes": ($List$append$(_scopes_0, {$: "Con", "head": _scope_0, "tail": {$: "Nil"}}))}, "scope": {$: "Some", "value": _scope_0}, "valid": true};
  } else {
    return {$: "Advicees.Declared", "registry": _registry_0, "scope": {$: "None"}, "valid": false};
  }
}

function $Advicees$declare$(_registry_0, _identity_0, _seed_0) {
  const _next_0 = _registry_0["next"];
  const _scopes_0 = _registry_0["scopes"];
  return $Advicees$declaration$(($Bool$and$(($Bool$and$(($Advicees$bounded$(_identity_0)), ($Advicees$bounded$(_next_0)))), ($Advicees$absent$(($Advicees$find_identity$(_scopes_0, _identity_0)))))), {$: "Advicees.Registry", "next": _next_0, "scopes": _scopes_0}, _identity_0, _seed_0);
}

function $Advicees$targeted$(_scope_0) {
  if (_scope_0.$ === "None") {
    return {$: "Advicees.Targeted", "scopes": {$: "Nil"}, "valid": false};
  } else {
    const _scope_1 = _scope_0["value"];
    return {$: "Advicees.Targeted", "scopes": {$: "Con", "head": _scope_1, "tail": {$: "Nil"}}, "valid": true};
  }
}

function $Advicees$targets$(_registry_0, _identity_0) {
  const _scopes_0 = _registry_0["scopes"];
  if (_identity_0.$ === "None") {
    return {$: "Advicees.Targeted", "scopes": _scopes_0, "valid": true};
  } else {
    const _identity_1 = _identity_0["value"];
    return $Advicees$targeted$(($Advicees$find_identity$(_scopes_0, _identity_1)));
  }
}

function $AdviceeScope$select_if$(_owned_0, _id_0, _tail_0) {
  if (_owned_0) {
    return {$: "Con", "head": _id_0, "tail": _tail_0};
  } else {
    return _tail_0;
  }
}

function $AdviceeScope$select$(_bindings_0, _partition_0) {
  if (_bindings_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _bindings_0["head"];
    const _owner_0 = _t_0["owner"];
    const _id_0 = _t_0["id"];
    const _tail_0 = _bindings_0["tail"];
    return $AdviceeScope$select_if$(($Bool$and$(($Nat$is_eq$(_owner_0, _partition_0)), ($Advicees$bounded$(_partition_0)))), _id_0, ($AdviceeScope$select$(_tail_0, _partition_0)));
  }
}

function $AdviceeScope$first$(_found_0, _fallback_0) {
  if (_found_0.$ === "Some") {
    const _partition_0 = _found_0["value"];
    return {$: "Some", "value": _partition_0};
  } else {
    return _fallback_0;
  }
}

function $AdviceeScope$owner_if$(_found_0, _partition_0, _tail_0) {
  if (_found_0) {
    return {$: "Some", "value": _partition_0};
  } else {
    return _tail_0;
  }
}

function $AdviceeScope$work_owner$(_work_0, _operation_0) {
  if (_work_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _work_0["head"];
    const _partition_0 = _t_0["partition"];
    const _id_0 = _t_0["operation"];
    const _tail_0 = _work_0["tail"];
    return $AdviceeScope$owner_if$(($Nat$is_eq$(_id_0, _operation_0)), _partition_0, ($AdviceeScope$work_owner$(_tail_0, _operation_0)));
  }
}

function $AdviceeScope$entry_owner$(_entries_0, _operation_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _entries_0["head"];
    const _partition_0 = _t_0["partition"];
    const _id_0 = _t_0["operation"];
    const _tail_0 = _entries_0["tail"];
    return $AdviceeScope$owner_if$(($Nat$is_eq$(_id_0, _operation_0)), _partition_0, ($AdviceeScope$entry_owner$(_tail_0, _operation_0)));
  }
}

function $AdviceeScope$request_owner$(_requests_0, _operation_0) {
  if (_requests_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _requests_0["head"];
    const _partition_0 = _t_0["partition"];
    const _id_0 = _t_0["operation"];
    const _tail_0 = _requests_0["tail"];
    return $AdviceeScope$owner_if$(($Nat$is_eq$(_id_0, _operation_0)), _partition_0, ($AdviceeScope$request_owner$(_tail_0, _operation_0)));
  }
}

function $AdviceeScope$dispatch_owner$(_dispatch_0, _operation_0) {
  const _queued_0 = _dispatch_0["queued"];
  const _running_0 = _dispatch_0["running"];
  const _requests_0 = _dispatch_0["requests"];
  return $AdviceeScope$first$(($AdviceeScope$entry_owner$(_queued_0, _operation_0)), ($AdviceeScope$first$(($AdviceeScope$entry_owner$(_running_0, _operation_0)), ($AdviceeScope$request_owner$(_requests_0, _operation_0)))));
}

function $AdviceeScope$charge_owner$(_charges_0, _reservation_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _charges_0["head"];
    const _id_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const _tail_0 = _charges_0["tail"];
    return $AdviceeScope$owner_if$(($Nat$is_eq$(_id_0, _reservation_0)), _partition_0, ($AdviceeScope$charge_owner$(_tail_0, _reservation_0)));
  }
}

function $AdviceeScope$round_owner$(_rounds_0, _round_0) {
  if (_rounds_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _rounds_0["head"];
    const _partition_0 = _t_0["partition"];
    const _id_0 = _t_0["id"];
    const _tail_0 = _rounds_0["tail"];
    return $AdviceeScope$owner_if$(($Nat$is_eq$(_id_0, _round_0)), _partition_0, ($AdviceeScope$round_owner$(_tail_0, _round_0)));
  }
}

function $AdviceeScope$batch_owner$(_batches_0, _advice_0) {
  if (_batches_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _batches_0["head"];
    const _id_0 = _t_0["advice"];
    const _group_0 = _t_0["group"];
    const _tail_0 = _batches_0["tail"];
    return $AdviceeScope$owner_if$(($Nat$is_eq$(_id_0, _advice_0)), _group_0, ($AdviceeScope$batch_owner$(_tail_0, _advice_0)));
  }
}

function $AdviceeScope$notice_owner$(_records_0, _key_0) {
  if (_records_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _records_0["head"];
    const _id_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const _tail_0 = _records_0["tail"];
    return $AdviceeScope$owner_if$(($Nat$is_eq$(_id_0, _key_0)), _partition_0, ($AdviceeScope$notice_owner$(_tail_0, _key_0)));
  }
}

function $AdviceeScope$submission_owner$(_submissions_0, _advice_0) {
  const _batches_0 = _submissions_0["batches"];
  return $AdviceeScope$batch_owner$(_batches_0, _advice_0);
}

function $AdviceeScope$delivery_owner$(_delivery_0, _advice_0) {
  const _submissions_0 = _delivery_0["submissions"];
  return $AdviceeScope$submission_owner$(_submissions_0, _advice_0);
}

function $AdviceeScope$collection_advice_owner$(_collection_0, _advice_0) {
  const _delivery_0 = _collection_0["delivery"];
  return $AdviceeScope$delivery_owner$(_delivery_0, _advice_0);
}

function $AdviceeScope$collection_notice_owner$(_collection_0, _key_0) {
  const _t_0 = _collection_0["notices"];
  const _records_0 = _t_0["records"];
  return $AdviceeScope$notice_owner$(_records_0, _key_0);
}

function $AdviceeScope$ledger_owner$(_ledger_0, _reservation_0) {
  const _charges_0 = _ledger_0["charges"];
  return $AdviceeScope$charge_owner$(_charges_0, _reservation_0);
}

function $AdviceeScope$intrinsic$(_state_0, _reference_0) {
  const __0 = _state_0["ledger"];
  const __1 = _state_0["rounds"];
  const _work_0 = _state_0["work"];
  const _dispatch_0 = _state_0["dispatch"];
  const __5 = _state_0["collection"];
  if (_reference_0.$ === "AdviceeScope.Direct") {
    const _partition_0 = _reference_0["partition"];
    return $AdviceeScope$owner_if$(($Advicees$bounded$(_partition_0)), _partition_0, {$: "None"});
  } else if (_reference_0.$ === "AdviceeScope.Operation") {
    const _operation_0 = _reference_0["operation"];
    return $AdviceeScope$first$(($AdviceeScope$work_owner$(_work_0, _operation_0)), ($AdviceeScope$dispatch_owner$(_dispatch_0, _operation_0)));
  } else if (_reference_0.$ === "AdviceeScope.Reservation") {
    const _reservation_0 = _reference_0["reservation"];
    return $AdviceeScope$ledger_owner$(__0, _reservation_0);
  } else if (_reference_0.$ === "AdviceeScope.Round") {
    const _round_0 = _reference_0["round"];
    return $AdviceeScope$round_owner$(__1, _round_0);
  } else if (_reference_0.$ === "AdviceeScope.Advice") {
    const _advice_0 = _reference_0["advice"];
    return $AdviceeScope$first$(($AdviceeScope$work_owner$(_work_0, _advice_0)), ($AdviceeScope$collection_advice_owner$(__5, _advice_0)));
  } else if (_reference_0.$ === "AdviceeScope.Notice") {
    const _key_0 = _reference_0["key"];
    return $AdviceeScope$collection_notice_owner$(__5, _key_0);
  } else {
    return {$: "None"};
  }
}

function $AdviceeScope$context_owner$(_provided_0) {
  if (_provided_0.$ === "Some") {
    const _partition_0 = _provided_0["value"];
    return $AdviceeScope$owner_if$(($Advicees$bounded$(_partition_0)), _partition_0, {$: "None"});
  } else {
    return {$: "None"};
  }
}

function $AdviceeScope$resolve$(_before_0, _after_0, _reference_0, _provided_0) {
  if (_reference_0.$ === "AdviceeScope.Context") {
    return $AdviceeScope$context_owner$(_provided_0);
  } else if (_reference_0.$ === "AdviceeScope.Shared") {
    return {$: "None"};
  } else {
    return $AdviceeScope$first$(($AdviceeScope$intrinsic$(_before_0, _reference_0)), ($AdviceeScope$intrinsic$(_after_0, _reference_0)));
  }
}

function $AdviceeScope$event_reference$(_value_0) {
  if (_value_0.$ === "Canonical.ReserveCapacity") {
    const _partition_0 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_0};
  } else if (_value_0.$ === "Canonical.ResizeCapacity") {
    const _reservation_0 = _value_0["reservation"];
    return {$: "AdviceeScope.Reservation", "reservation": _reservation_0};
  } else if (_value_0.$ === "Canonical.ReleaseCapacity") {
    const _reservation_1 = _value_0["reservation"];
    return {$: "AdviceeScope.Reservation", "reservation": _reservation_1};
  } else if (_value_0.$ === "Canonical.ReplaceCapacity") {
    const _reservation_2 = _value_0["reservation"];
    return {$: "AdviceeScope.Reservation", "reservation": _reservation_2};
  } else if (_value_0.$ === "Canonical.IssuePermit") {
    const _partition_1 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_1};
  } else if (_value_0.$ === "Canonical.CheckCompletedEdit") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RememberCompletedEdit") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.QuietRoundTick") {
    const _partition_2 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_2};
  } else if (_value_0.$ === "Canonical.QuietRoundReset") {
    const _partition_3 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_3};
  } else if (_value_0.$ === "Canonical.ConsumePermit") {
    const _partition_4 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_4};
  } else if (_value_0.$ === "Canonical.ReleasePermit") {
    const _partition_5 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_5};
  } else if (_value_0.$ === "Canonical.ExpirePermit") {
    const _partition_6 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_6};
  } else if (_value_0.$ === "Canonical.ClosePermitRound") {
    const _partition_7 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_7};
  } else if (_value_0.$ === "Canonical.ForgetAdmission") {
    const _partition_8 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_8};
  } else if (_value_0.$ === "Canonical.OpenRound") {
    const _partition_9 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_9};
  } else if (_value_0.$ === "Canonical.AdmitObservation") {
    const _partition_10 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_10};
  } else if (_value_0.$ === "Canonical.StartObservation") {
    const _partition_11 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_11};
  } else if (_value_0.$ === "Canonical.CompleteObservation") {
    const _partition_12 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_12};
  } else if (_value_0.$ === "Canonical.InterruptObservation") {
    const _partition_13 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_13};
  } else if (_value_0.$ === "Canonical.BeginPreparation") {
    const _partition_14 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_14};
  } else if (_value_0.$ === "Canonical.BeginObservedPreparation") {
    const _partition_15 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_15};
  } else if (_value_0.$ === "Canonical.InterruptPreparation") {
    const _partition_16 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_16};
  } else if (_value_0.$ === "Canonical.PreparationCompleted") {
    const _partition_17 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_17};
  } else if (_value_0.$ === "Canonical.StartReview") {
    const _partition_18 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_18};
  } else if (_value_0.$ === "Canonical.JevRequestReady") {
    const _partition_19 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_19};
  } else if (_value_0.$ === "Canonical.JevRequestStarted") {
    const _partition_20 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_20};
  } else if (_value_0.$ === "Canonical.JevRequestInterrupted") {
    const _partition_21 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_21};
  } else if (_value_0.$ === "Canonical.JevRequestSettled") {
    const _partition_22 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_22};
  } else if (_value_0.$ === "Canonical.ReviewCompleted") {
    const _partition_23 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_23};
  } else if (_value_0.$ === "Canonical.RetireReview") {
    const _partition_24 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_24};
  } else if (_value_0.$ === "Canonical.ReviewObserved") {
    const _partition_25 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_25};
  } else if (_value_0.$ === "Canonical.FindingCountUpdated") {
    const _partition_26 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_26};
  } else if (_value_0.$ === "Canonical.QueueDispatch") {
    const _partition_27 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_27};
  } else if (_value_0.$ === "Canonical.DispatchSettled") {
    const _partition_28 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_28};
  } else if (_value_0.$ === "Canonical.DiscardDispatch") {
    return {$: "AdviceeScope.Shared"};
  } else if (_value_0.$ === "Canonical.DispatchScopeCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CloseDispatch") {
    return {$: "AdviceeScope.Shared"};
  } else if (_value_0.$ === "Canonical.PreparedOfferCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.EmptyPreparedCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReviewFailureCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.StopPolled") {
    const _partition_29 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_29};
  } else if (_value_0.$ === "Canonical.StopGroupPolled") {
    const _group_0 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_0};
  } else if (_value_0.$ === "Canonical.StopGroupEnded") {
    const _group_1 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_1};
  } else if (_value_0.$ === "Canonical.CollectionReady") {
    const _partition_30 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_30};
  } else if (_value_0.$ === "Canonical.CollectionCredentialCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionCandidateCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionOrderCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionExpiryCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionFitCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionFindingCheck") {
    const _partition_31 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_31};
  } else if (_value_0.$ === "Canonical.CollectionNoticeCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionReserveLease") {
    const _advice_0 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_0};
  } else if (_value_0.$ === "Canonical.CollectionReleaseLease") {
    const _advice_1 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_1};
  } else if (_value_0.$ === "Canonical.CollectionLeaseCheck") {
    const _advice_2 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_2};
  } else if (_value_0.$ === "Canonical.CollectionRetireAdvice") {
    const _advice_3 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_3};
  } else if (_value_0.$ === "Canonical.CollectionClaimBackground") {
    const _group_2 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_2};
  } else if (_value_0.$ === "Canonical.CollectionReleaseBackground") {
    const _group_3 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_3};
  } else if (_value_0.$ === "Canonical.CollectionExpireBackground") {
    const _group_4 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_4};
  } else if (_value_0.$ === "Canonical.FinishReserve") {
    const _group_5 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_5};
  } else if (_value_0.$ === "Canonical.FinishRelease") {
    const _group_6 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_6};
  } else if (_value_0.$ === "Canonical.FinishAuthorize") {
    const _group_7 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_7};
  } else if (_value_0.$ === "Canonical.FinishTerminal") {
    const _group_8 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_8};
  } else if (_value_0.$ === "Canonical.FinishEnd") {
    const _group_9 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_9};
  } else if (_value_0.$ === "Canonical.ContinuationConsume") {
    const _group_10 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_10};
  } else if (_value_0.$ === "Canonical.SubmissionBegin") {
    const _group_11 = _value_0["group"];
    return {$: "AdviceeScope.Direct", "partition": _group_11};
  } else if (_value_0.$ === "Canonical.SubmissionAuthorize") {
    const _advice_4 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_4};
  } else if (_value_0.$ === "Canonical.SubmissionTerminal") {
    const _advice_5 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_5};
  } else if (_value_0.$ === "Canonical.SubmissionRelease") {
    const _advice_6 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_6};
  } else if (_value_0.$ === "Canonical.SubmissionForget") {
    const _advice_7 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_7};
  } else if (_value_0.$ === "Canonical.SubmissionSuppressCheck") {
    const _advice_8 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_8};
  } else if (_value_0.$ === "Canonical.SubmissionReofferCheck") {
    const _advice_9 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_9};
  } else if (_value_0.$ === "Canonical.SubmissionExpiryCheck") {
    const _advice_10 = _value_0["advice"];
    return {$: "AdviceeScope.Advice", "advice": _advice_10};
  } else if (_value_0.$ === "Canonical.RevisionRegister") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionRelease") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionCurrentCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionSupersededCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionGenerationCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionCountCheck") {
    return {$: "AdviceeScope.Shared"};
  } else if (_value_0.$ === "Canonical.CollectorGateCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectorFinalAuthorityCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseMemberCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CleanupCheck") {
    return {$: "AdviceeScope.Shared"};
  } else if (_value_0.$ === "Canonical.CleanupCommit") {
    return {$: "AdviceeScope.Shared"};
  } else if (_value_0.$ === "Canonical.DeliveryReleaseCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryAcknowledgeCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryFinalizeCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryFindingDispositionCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliverySubmissionCandidateCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliverySubmissionBatchCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryCredentialObserveCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryFinalCredentialCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ValidationRouteCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PostValidationCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinalCandidateCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundBeginStopCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundActivityCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundBarrierCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundOwnsStopCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundStopTerminalCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundExpireCloseCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundContinuationBudgetCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliverySubmissionAllowedCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryExistingTokenCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryUnreservedStopCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.IncludeLayerCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FileSelectionCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FileProtectionInvalid") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FileProtectionCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CandidateFileCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReviewAdmissionCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RuleEnableCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RuleApplicabilityCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RuleFindingCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RuleRankOrderCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.AdviceOrderCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RuleBudgetCheck") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseRoute") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseClaim") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseAttach") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseRelease") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseTouch") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CachePrepare") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CacheCommit") {
    const _partition_32 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_32};
  } else if (_value_0.$ === "Canonical.CacheDiscardPartition") {
    const _partition_33 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_33};
  } else if (_value_0.$ === "Canonical.CacheClear") {
    return {$: "AdviceeScope.Shared"};
  } else if (_value_0.$ === "Canonical.NoticeAdvance") {
    const _key_0 = _value_0["key"];
    return {$: "AdviceeScope.Notice", "key": _key_0};
  } else if (_value_0.$ === "Canonical.NoticeCommit") {
    const _partition_34 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_34};
  } else if (_value_0.$ === "Canonical.NoticePrune") {
    const _key_1 = _value_0["key"];
    return {$: "AdviceeScope.Notice", "key": _key_1};
  } else if (_value_0.$ === "Canonical.NoticeDrop") {
    const _key_2 = _value_0["key"];
    return {$: "AdviceeScope.Notice", "key": _key_2};
  } else if (_value_0.$ === "Canonical.NoticeLease") {
    const _key_3 = _value_0["key"];
    return {$: "AdviceeScope.Notice", "key": _key_3};
  } else if (_value_0.$ === "Canonical.NoticeClearPending") {
    const _key_4 = _value_0["key"];
    return {$: "AdviceeScope.Notice", "key": _key_4};
  } else if (_value_0.$ === "Canonical.NoticeSelect") {
    const _partition_35 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_35};
  } else if (_value_0.$ === "Canonical.OutputStarted") {
    const _partition_36 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_36};
  } else if (_value_0.$ === "Canonical.OutputTerminal") {
    const _partition_37 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_37};
  } else {
    const _partition_38 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_38};
  }
}

function $AdviceeScope$event$(_before_0, _after_0, _value_0, _provided_0) {
  return $AdviceeScope$resolve$(_before_0, _after_0, ($AdviceeScope$event_reference$(_value_0)), _provided_0);
}

function $AdviceeScope$command_reference$(_value_0) {
  if (_value_0.$ === "Canonical.CapacityGranted") {
    const _id_0 = _value_0["id"];
    return {$: "AdviceeScope.Reservation", "reservation": _id_0};
  } else if (_value_0.$ === "Canonical.CapacityRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CapacityResized") {
    const _id_1 = _value_0["id"];
    return {$: "AdviceeScope.Reservation", "reservation": _id_1};
  } else if (_value_0.$ === "Canonical.CapacityUnitAdmitted") {
    const _reservation_0 = _value_0["reservation"];
    return {$: "AdviceeScope.Reservation", "reservation": _reservation_0};
  } else if (_value_0.$ === "Canonical.CapacityUnitRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PermitIssued") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CompletedEditAbsent") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CompletedEditSeen") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CompletedEditRemembered") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.QuietRoundBusy") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.QuietRoundWaiting") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.QuietRoundExpired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.QuietRoundResetRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PermitConsumed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PermitReleased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PermitExpired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PermitKept") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PermitRoundClosed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundStarted") {
    const _id_2 = _value_0["id"];
    return {$: "AdviceeScope.Round", "round": _id_2};
  } else if (_value_0.$ === "Canonical.ObservationAdmitted") {
    const _id_3 = _value_0["id"];
    return {$: "AdviceeScope.Operation", "operation": _id_3};
  } else if (_value_0.$ === "Canonical.ObservationStarted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ObservationCompleted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ObservationInterrupted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.Prepare") {
    const _operation_0 = _value_0["operation"];
    return {$: "AdviceeScope.Operation", "operation": _operation_0};
  } else if (_value_0.$ === "Canonical.PreparationRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.UnitAdmitted") {
    const _operation_1 = _value_0["operation"];
    return {$: "AdviceeScope.Operation", "operation": _operation_1};
  } else if (_value_0.$ === "Canonical.UnitRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PreparationReleased") {
    const _id_4 = _value_0["id"];
    return {$: "AdviceeScope.Reservation", "reservation": _id_4};
  } else if (_value_0.$ === "Canonical.ReviewStarted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.JevRequestIssued") {
    const _partition_0 = _value_0["partition"];
    return {$: "AdviceeScope.Direct", "partition": _partition_0};
  } else if (_value_0.$ === "Canonical.JevRequestUnavailable") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.JevRequestStartRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.JevInterruptionRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.JevRequestOutcomeRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.JevObservationIgnored") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReservationReleased") {
    const _id_5 = _value_0["id"];
    return {$: "AdviceeScope.Reservation", "reservation": _id_5};
  } else if (_value_0.$ === "Canonical.ReviewRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RetainFinding") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FindingCountRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SettleClear") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SettleStaleClear") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RetireStaleFinding") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PreparedSkipped") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PreparedAdmitted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PreparedCapacityRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.EmptyLost") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.EmptyAccepted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FailureBackend") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FailureCredential") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FailureLost") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FailureNone") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DispatchStarted") {
    const _operation_2 = _value_0["operation"];
    return {$: "AdviceeScope.Operation", "operation": _operation_2};
  } else if (_value_0.$ === "Canonical.DispatchDiscarded") {
    const _operation_3 = _value_0["operation"];
    return {$: "AdviceeScope.Operation", "operation": _operation_3};
  } else if (_value_0.$ === "Canonical.DiscardNamedOnly") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DiscardAllUnfinished") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.WaitForWork") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CancelWork") {
    const _operation_4 = _value_0["operation"];
    return {$: "AdviceeScope.Operation", "operation": _operation_4};
  } else if (_value_0.$ === "Canonical.FinishReady") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishLimit") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.StopEnded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionEligible") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionWaiting") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionRetireCredential") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionRetainCredential") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionCandidate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionSkip") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionBefore") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionEqual") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionAfter") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionExpired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionCurrent") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionFits") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionLimited") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionFindingSelected") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionFindingRetained") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionFindingLimited") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionFindingExpired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionNoticeIncluded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionNoticeSkipped") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionNoticeStopped") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionLeaseReserved") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionLeaseRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionLeaseReleased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionLeaseKept") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionAdviceRetired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionBackgroundClaimed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionBackgroundRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionBackgroundReleased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectionBackgroundKept") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishReserved") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishNotices") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishAllowedNoAdvice") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishAllowedDeadline") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishAllowedUnavailable") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishReleased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishAuthorized") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FinishEnded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ContinuationConsumed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ContinuationRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionBegun") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionAuthorized") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionReleased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionForgotten") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionSuppresses") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionUnsuppressed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionReofferable") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionNotReofferable") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionExpired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.SubmissionCurrent") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionReused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionReplaced") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionReleased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionCurrent") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionStale") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionSuperseded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionNotSuperseded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionGeneration") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RevisionCount") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectorProceed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectorUnavailable") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectorFinalProceed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CollectorFinalRelease") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseKeepMember") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseSetMemberClear") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseSetMemberFinding") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseSetMemberUnavailable") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseSetMemberLost") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CleanupReady") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CleanupBusy") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CleanupCommitted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryReleaseUnacknowledged") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryKeepAcknowledged") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryAckReady") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryAckExpired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryAckEmpty") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryFinalReady") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryFinalExpired") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryFinalEmpty") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryRetireAdvice") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryKeepRemaining") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryKeepForReoffer") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliverySubmissionCandidate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliverySubmissionRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryBatchProceed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryBatchRelease") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryCredentialInvalid") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryCredentialValid") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.IgnoreCandidate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReleaseCandidate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RetireCandidate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ContinueCandidate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RetainCandidate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundStopBegun") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundStopRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundActive") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundInactive") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundBarrierRaised") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundBarrierClear") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundStopOwned") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundStopNotOwned") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundStopTerminal") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundExpireCloses") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundExpireKeeps") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundContinuationAvailable") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RoundContinuationExhausted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliverySubmissionAllowed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliverySubmissionDenied") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryExistingTokenAllowed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryExistingTokenDenied") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryUnreservedStopAllowed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.DeliveryUnreservedStopDenied") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseJoinAdvice") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseJoinPending") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseJoinClaimed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseCached") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseOwn") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseClaimed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseAttached") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseReleased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReuseRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CacheAlready") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CacheRejected") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CachePrepared") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CacheCommitted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CacheDiscarded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeSuppressed") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeRejectedFull") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeCreateKey") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeCreatePending") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeMergePending") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeKeepLeased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeRefused") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeCommitted") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticePruned") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeDropped") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeLeased") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticePendingCleared") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.NoticeSelected") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.IncludeChoice") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FileSelection") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.FileProtection") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.CandidateFile") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReviewAdmission") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RuleGate") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.RuleOrder") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.WriteAuthorized") {
    const _operation_5 = _value_0["operation"];
    return {$: "AdviceeScope.Operation", "operation": _operation_5};
  } else if (_value_0.$ === "Canonical.WriteRecorded") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.WaitForOutput") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.ReofferAtStop") {
    return {$: "AdviceeScope.Context"};
  } else if (_value_0.$ === "Canonical.PartitionRetired") {
    return {$: "AdviceeScope.Context"};
  } else {
    return {$: "AdviceeScope.Context"};
  }
}

function $AdviceeScope$command$(_before_0, _after_0, _value_0, _provided_0) {
  return $AdviceeScope$resolve$(_before_0, _after_0, ($AdviceeScope$command_reference$(_value_0)), _provided_0);
}

function $Numeric$high$(_value_0) {
  const _high_0 = _value_0["high"];
  return _high_0;
}

function $Numeric$low$(_value_0) {
  const _low_0 = _value_0["low"];
  return _low_0;
}

function $Numeric$zero$(_value_0) {
  return $Bool$and$(($Nat$is_eq$(($Numeric$high$(_value_0)), 0)), ($Nat$is_eq$(($Numeric$low$(_value_0)), 0)));
}

function $Numeric$greater$(_a_0, _b_0) {
  const _x_0 = ($Nat$is_gt$(($Numeric$high$(_a_0)), ($Numeric$high$(_b_0))));
  const _x_1 = ($Bool$and$(($Nat$is_eq$(($Numeric$high$(_a_0)), ($Numeric$high$(_b_0)))), ($Nat$is_gt$(($Numeric$low$(_a_0)), ($Numeric$low$(_b_0))))));
  return (_x_0 || _x_1);
}

function $Numeric$ge$(_a_0, _b_0) {
  return $Bool$not$(($Numeric$greater$(_b_0, _a_0)));
}

function $Numeric$add_parts$(_ah_0, _bh_0, _lo_0) {
  const _x_0 = nat_chk(_ah_0 + _bh_0);
  const _x_1 = ($Nat$div$(_lo_0, 268435456));
  return {$: "Numeric.Limb", "high": nat_chk(_x_0 + _x_1), "low": ($Nat$mod$(_lo_0, 268435456))};
}

function $Numeric$add$(_a_0, _b_0) {
  const _ah_0 = _a_0["high"];
  const _al_0 = _a_0["low"];
  const _bh_0 = _b_0["high"];
  const _bl_0 = _b_0["low"];
  return $Numeric$add_parts$(_ah_0, _bh_0, nat_chk(_al_0 + _bl_0));
}

function $Numeric$sub_parts$(_ah_0, _al_0, _bh_0, _bl_0) {
  const _x_0 = (_ah_0 < _bh_0 ? 0 : _ah_0 - _bh_0);
  const _x_1 = ($Bool$pick$((_al_0 < _bl_0), 1, 0));
  const _x_2 = nat_chk(_al_0 + 268435456);
  return {$: "Numeric.Limb", "high": (_x_0 < _x_1 ? 0 : _x_0 - _x_1), "low": ($Nat$mod$((_x_2 < _bl_0 ? 0 : _x_2 - _bl_0), 268435456))};
}

function $Numeric$sub$(_a_0, _b_0) {
  const _ah_0 = _a_0["high"];
  const _al_0 = _a_0["low"];
  const _bh_0 = _b_0["high"];
  const _bl_0 = _b_0["low"];
  return $Numeric$sub_parts$(_ah_0, _al_0, _bh_0, _bl_0);
}

function $Numeric$shl$(_value_0) {
  const _high_0 = _value_0["high"];
  const _low_0 = _value_0["low"];
  const _x_0 = nat_chk(_high_0 * 2);
  const _x_1 = ($Nat$div$(_low_0, 134217728));
  return {$: "Numeric.Limb", "high": nat_chk(_x_0 + _x_1), "low": ($Nat$mod$(nat_chk(_low_0 * 2), 268435456))};
}

function $Numeric$shr$(_value_0) {
  const _high_0 = _value_0["high"];
  const _low_0 = _value_0["low"];
  const _x_0 = ($Nat$mod$(_high_0, 2));
  const _x_1 = ($Nat$div$(_low_0, 2));
  const _x_2 = nat_chk(_x_0 * 134217728);
  return {$: "Numeric.Limb", "high": ($Nat$div$(_high_0, 2)), "low": nat_chk(_x_1 + _x_2)};
}

function $Numeric$sticky$(_value_0, _bit_0) {
  const _high_0 = _value_0["high"];
  const _low_0 = _value_0["low"];
  const _x_0 = ($Bool$pick$(($Bool$and$(_bit_0, ($Nat$is_eq$(($Nat$mod$(_low_0, 2)), 0)))), 1, 0));
  return {$: "Numeric.Limb", "high": _high_0, "low": nat_chk(_low_0 + _x_0)};
}

function $Numeric$shr_sticky$(_value_0) {
  return $Numeric$sticky$(($Numeric$shr$(_value_0)), ($Nat$is_eq$(($Nat$mod$(($Numeric$low$(_value_0)), 2)), 1)));
}

function $Numeric$shift_right$($0, $1) {
  for (;;) {
    {
      const _count_0 = $0;
      const _value_0 = $1;
      if (_count_0 === 0) {
        return _value_0;
      } else {
        const _rest_0 = (_count_0 - 1);
        $0 = _rest_0;
        $1 = ($Numeric$shr_sticky$(_value_0));
        continue;
      }
    }
  }
}

function $Numeric$bounded_shift$(_count_0, _value_0) {
  return $Numeric$shift_right$(($Bool$pick$(($Nat$is_gt$(_count_0, 56)), 56, _count_0)), _value_0);
}

function $Numeric$normalize_step$(_done_0, _value_0, _exponent_0, _rest_0) {
  if (_done_0) {
    return {$: "Numeric.Value", "mantissa": _value_0, "exponent": _exponent_0};
  } else {
    return run_tail(_rest_0(($Numeric$shl$(_value_0))), (_exponent_0 < 1 ? 0 : _exponent_0 - 1));
  }
}

function $Numeric$normalize$(_fuel_0, _value_0, _exponent_0) {
  if (_fuel_0 === 0) {
    return {$: "Numeric.Value", "mantissa": _value_0, "exponent": _exponent_0};
  } else {
    const _rest_0 = (_fuel_0 - 1);
    const _x_0 = ($Numeric$zero$(_value_0));
    const _x_1 = ($Nat$is_ge$(($Numeric$high$(_value_0)), 16777216));
    return $Numeric$normalize_step$((_x_0 || _x_1), _value_0, _exponent_0, run_clo((_x_2) => {
  return run_clo((_x_3) => {
  return $Numeric$normalize$(_rest_0, _x_2, _x_3);
});
}));
  }
}

function $Numeric$decoded$(_high_0, _low_0) {
  const _x_0 = ($Nat$mod$(_high_0, 1048576));
  const _x_1 = nat_chk(_x_0 * 16);
  const _x_2 = ($Nat$div$(_low_0, 268435456));
  const _x_3 = nat_chk(_x_1 + _x_2);
  const _x_4 = ($Bool$pick$(($Nat$is_eq$(($Nat$div$(_high_0, 1048576)), 0)), 0, 16777216));
  const _x_5 = ($Bool$pick$(($Nat$is_eq$(($Nat$div$(_high_0, 1048576)), 0)), 1, ($Nat$div$(_high_0, 1048576))));
  return $Numeric$normalize$(52, {$: "Numeric.Limb", "high": nat_chk(_x_3 + _x_4), "low": ($Nat$mod$(_low_0, 268435456))}, nat_chk(2048 + _x_5));
}

function $Numeric$decode$(_words_0) {
  const _high_0 = _words_0["high"];
  const _low_0 = _words_0["low"];
  return $Numeric$decoded$(_high_0, _low_0);
}

function $Numeric$encoded$(_mantissa_0, _exponent_0) {
  const _x_0 = ($Numeric$high$(_mantissa_0));
  const _x_1 = ($Numeric$zero$(_mantissa_0));
  const _x_2 = (_x_0 < 16777216);
  const _x_3 = ($Bool$pick$((_x_1 || _x_2), 0, (_exponent_0 < 2048 ? 0 : _exponent_0 - 2048)));
  const _x_4 = nat_chk(_x_3 * 1048576);
  const _x_5 = ($Nat$mod$(($Nat$div$(($Numeric$high$(_mantissa_0)), 16)), 1048576));
  const _x_6 = ($Nat$mod$(($Numeric$high$(_mantissa_0)), 16));
  const _x_7 = nat_chk(_x_6 * 268435456);
  const _x_8 = ($Numeric$low$(_mantissa_0));
  return {$: "Numeric.Words", "high": nat_chk(_x_4 + _x_5), "low": nat_chk(_x_7 + _x_8)};
}

function $Numeric$increment$(_value_0) {
  return $Numeric$add$(_value_0, {$: "Numeric.Limb", "high": 0, "low": 1});
}

function $Numeric$rounded_parts$(_mantissa_0, _exponent_0) {
  const _x_0 = ($Bool$pick$(($Nat$is_ge$(($Numeric$high$(_mantissa_0)), 33554432)), 1, 0));
  return $Numeric$encoded$(($Bool$pick$(($Nat$is_ge$(($Numeric$high$(_mantissa_0)), 33554432)), ($Numeric$shr$(_mantissa_0)), _mantissa_0)), nat_chk(_exponent_0 + _x_0));
}

function $Numeric$rounded$(_value_0, _exponent_0) {
  const _base_0 = ($Numeric$shr$(($Numeric$shr$(($Numeric$shr$(_value_0))))));
  const _x_0 = ($Nat$is_gt$(($Nat$mod$(($Numeric$low$(_value_0)), 8)), 4));
  const _x_1 = ($Bool$and$(($Nat$is_eq$(($Nat$mod$(($Numeric$low$(_value_0)), 8)), 4)), ($Nat$is_eq$(($Nat$mod$(($Numeric$low$(_base_0)), 2)), 1))));
  return $Numeric$rounded_parts$(($Bool$pick$((_x_0 || _x_1), ($Numeric$increment$(_base_0)), _base_0)), _exponent_0);
}

function $Numeric$round_finite$(_value_0, _exponent_0) {
  return $Numeric$rounded$(($Bool$pick$((_exponent_0 < 2049), ($Numeric$bounded_shift$((2049 < _exponent_0 ? 0 : 2049 - _exponent_0), _value_0)), _value_0)), ($Bool$pick$((_exponent_0 < 2049), 2049, _exponent_0)));
}

function $Numeric$add_aligned$(_sum_0, _exponent_0) {
  const _x_0 = ($Bool$pick$(($Nat$is_ge$(($Numeric$high$(_sum_0)), 268435456)), 1, 0));
  return $Numeric$round_finite$(($Bool$pick$(($Nat$is_ge$(($Numeric$high$(_sum_0)), 268435456)), ($Numeric$shr_sticky$(_sum_0)), _sum_0)), nat_chk(_exponent_0 + _x_0));
}

function $Numeric$add_ordered$(_a_0, _ae_0, _b_0, _be_0) {
  return $Numeric$add_aligned$(($Numeric$add$(($Numeric$shl$(($Numeric$shl$(($Numeric$shl$(_a_0)))))), ($Numeric$bounded_shift$((_ae_0 < _be_0 ? 0 : _ae_0 - _be_0), ($Numeric$shl$(($Numeric$shl$(($Numeric$shl$(_b_0)))))))))), _ae_0);
}

function $Numeric$add_values$(_a_0, _b_0) {
  const _am_0 = _a_0["mantissa"];
  const _ae_0 = _a_0["exponent"];
  const _bm_0 = _b_0["mantissa"];
  const _be_0 = _b_0["exponent"];
  return $Bool$pick$(($Numeric$zero$(_am_0)), ($Numeric$round_finite$(($Numeric$shl$(($Numeric$shl$(($Numeric$shl$(_bm_0)))))), _be_0)), ($Bool$pick$(($Numeric$zero$(_bm_0)), ($Numeric$round_finite$(($Numeric$shl$(($Numeric$shl$(($Numeric$shl$(_am_0)))))), _ae_0)), ($Bool$pick$(($Nat$is_ge$(_ae_0, _be_0)), ($Numeric$add_ordered$(_am_0, _ae_0, _bm_0, _be_0)), ($Numeric$add_ordered$(_bm_0, _be_0, _am_0, _ae_0)))))));
}

function $Numeric$plus$(_a_0, _b_0) {
  return $Numeric$add_values$(run_loop($Numeric$decode$(_a_0)), run_loop($Numeric$decode$(_b_0)));
}

function $Numeric$divide_choose$(_take_0, _remainder_0, _denominator_0, _quotient_0, _exponent_0, _rest_0) {
  if (_take_0) {
    return run_tail(_rest_0(($Numeric$sub$(_remainder_0, _denominator_0)))(_denominator_0)(($Numeric$add$(($Numeric$shl$(_quotient_0)), {$: "Numeric.Limb", "high": 0, "low": 1}))), _exponent_0);
  } else {
    return run_tail(_rest_0(_remainder_0)(_denominator_0)(($Numeric$shl$(_quotient_0))), _exponent_0);
  }
}

function $Numeric$divide_loop$(_fuel_0, _remainder_0, _denominator_0, _quotient_0, _exponent_0) {
  if (_fuel_0 === 0) {
    return $Numeric$round_finite$(($Numeric$sticky$(_quotient_0, ($Bool$not$(($Numeric$zero$(_remainder_0)))))), _exponent_0);
  } else {
    const _rest_0 = (_fuel_0 - 1);
    return $Numeric$divide_choose$(($Numeric$ge$(($Numeric$shl$(_remainder_0)), _denominator_0)), ($Numeric$shl$(_remainder_0)), _denominator_0, _quotient_0, _exponent_0, run_clo((_x_0) => {
  return run_clo((_x_1) => {
  return run_clo((_x_2) => {
  return run_clo((_x_3) => {
  return $Numeric$divide_loop$(_rest_0, _x_0, _x_1, _x_2, _x_3);
});
});
});
}));
  }
}

function $Numeric$divide_start$(_numerator_0, _denominator_0, _exponent_0) {
  return $Numeric$divide_loop$(55, ($Numeric$sub$(_numerator_0, _denominator_0)), _denominator_0, {$: "Numeric.Limb", "high": 0, "low": 1}, _exponent_0);
}

function $Numeric$divide_values$(_a_0, _b_0) {
  const _am_0 = _a_0["mantissa"];
  const _ae_0 = _a_0["exponent"];
  const _bm_0 = _b_0["mantissa"];
  const _be_0 = _b_0["exponent"];
  const _x_0 = nat_chk(_ae_0 + 3071);
  const _x_1 = (_x_0 < _be_0 ? 0 : _x_0 - _be_0);
  const _x_2 = ($Bool$pick$(($Numeric$greater$(_bm_0, _am_0)), 1, 0));
  return $Bool$pick$(($Numeric$zero$(_am_0)), {$: "Numeric.Words", "high": 0, "low": 0}, run_loop($Numeric$divide_start$(($Bool$pick$(($Numeric$greater$(_bm_0, _am_0)), ($Numeric$shl$(_am_0)), _am_0)), _bm_0, (_x_1 < _x_2 ? 0 : _x_1 - _x_2))));
}

function $Numeric$divide$(_a_0, _b_0) {
  return $Numeric$divide_values$(run_loop($Numeric$decode$(_a_0)), run_loop($Numeric$decode$(_b_0)));
}

function $Numeric$ordered$(_left_0, _right_0) {
  const _lh_0 = _left_0["high"];
  const _ll_0 = _left_0["low"];
  const _rh_0 = _right_0["high"];
  const _rl_0 = _right_0["low"];
  const _x_0 = (_lh_0 < _rh_0);
  const _x_1 = ($Bool$and$(($Nat$is_eq$(_lh_0, _rh_0)), (_ll_0 < _rl_0)));
  return (_x_0 || _x_1);
}

function $Numeric$integer_words$(_value_0) {
  const _mantissa_0 = _value_0["mantissa"];
  const _exponent_0 = _value_0["exponent"];
  return $Numeric$encoded$(_mantissa_0, (_exponent_0 < 32 ? 0 : _exponent_0 - 32));
}

function $Numeric$draw$(_word_0) {
  return $Numeric$integer_words$(run_loop($Numeric$normalize$(52, {$: "Numeric.Limb", "high": ($Nat$div$(_word_0, 268435456)), "low": ($Nat$mod$(_word_0, 268435456))}, 3123)));
}

function $$$$047session$045bend$047Session$state_random$(_s_0) {
  const _random_0 = _s_0["random"];
  return _random_0;
}

function $$$$047session$045bend$047Session$state_phase$(_s_0) {
  const _phase_0 = _s_0["phase"];
  return _phase_0;
}

function $$$$047session$045bend$047Session$state_edit$(_s_0) {
  const _edit_0 = _s_0["edit"];
  return _edit_0;
}

function $$$$047session$045bend$047Session$state_task$(_s_0) {
  const _task_0 = _s_0["task"];
  return _task_0;
}

function $$$$047session$045bend$047Session$state_revision$(_s_0) {
  const _revision_0 = _s_0["revision"];
  return _revision_0;
}

function $$$$047session$045bend$047Session$state_generation$(_s_0) {
  const _generation_0 = _s_0["generation"];
  return _generation_0;
}

function $$$$047session$045bend$047Session$state_suspended$(_s_0) {
  const _suspended_0 = _s_0["suspended"];
  return _suspended_0;
}

function $$$$047session$045bend$047Session$state_pendingPhase$(_s_0) {
  const _pendingPhase_0 = _s_0["pendingPhase"];
  return _pendingPhase_0;
}

function $$$$047session$045bend$047Session$state_pendingEdit$(_s_0) {
  const _pendingEdit_0 = _s_0["pendingEdit"];
  return _pendingEdit_0;
}

function $$$$047session$045bend$047Session$state_pendingTask$(_s_0) {
  const _pendingTask_0 = _s_0["pendingTask"];
  return _pendingTask_0;
}

function $$$$047session$045bend$047Session$state_bytes$(_s_0) {
  const _bytes_0 = _s_0["bytes"];
  return _bytes_0;
}

function $$$$047session$045bend$047Session$state_units$(_s_0) {
  const _units_0 = _s_0["units"];
  return _units_0;
}

function $$$$047session$045bend$047Session$set_random$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _value_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_phase$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _value_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_edit$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _value_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_task$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _value_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_revision$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _value_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_generation$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _value_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_suspended$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _value_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_pendingPhase$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _value_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_pendingEdit$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _value_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_pendingTask$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _value_0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_bytes$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _value_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$set_units$(_s_0, _value_0) {
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
  return {$: "Session.Stream", "random": _random_0, "phase": _phase_0, "edit": _edit_0, "task": _task_0, "revision": _revision_0, "generation": _generation_0, "suspended": _suspended_0, "pendingPhase": _pendingPhase_0, "pendingEdit": _pendingEdit_0, "pendingTask": _pendingTask_0, "bytes": _bytes_0, "units": _value_0};
}

function $$$$047session$045bend$047Session$transition_state$(_t_0) {
  const _s_0 = _t_0["state"];
  return _s_0;
}

function $$$$047session$045bend$047Session$transition_events$(_t_0) {
  const _events_0 = _t_0["events"];
  return _events_0;
}

function $$$$047session$045bend$047Session$event_delay$(_e_0) {
  const _delay_0 = _e_0["delay"];
  return _delay_0;
}

function $$$$047session$045bend$047Session$event_kind$(_e_0) {
  const _kind_0 = _e_0["kind"];
  return _kind_0;
}

function $$$$047session$045bend$047Session$event_task$(_e_0) {
  const _task_0 = _e_0["task"];
  return _task_0;
}

function $$$$047session$045bend$047Session$event_revision$(_e_0) {
  const _revision_0 = _e_0["revision"];
  return _revision_0;
}

function $$$$047session$045bend$047Session$event_generation$(_e_0) {
  const _generation_0 = _e_0["generation"];
  return _generation_0;
}

function $$$$047session$045bend$047Session$event_bytes$(_e_0) {
  const _bytes_0 = _e_0["bytes"];
  return _bytes_0;
}

function $$$$047session$045bend$047Session$event_units$(_e_0) {
  const _units_0 = _e_0["units"];
  return _units_0;
}

function $$$$047session$045bend$047Session$event_repair$(_e_0) {
  const _repair_0 = _e_0["repair"];
  return _repair_0;
}

function $$$$047session$045bend$047Session$event_recurring$(_e_0) {
  const _recurring_0 = _e_0["recurring"];
  return _recurring_0;
}

function $$$$047session$045bend$047Session$seed_hash$($0, $1) {
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

function $$$$047session$045bend$047Session$nonzero$(_seed_0) {
  return $Bool$pick$((_seed_0 === 0), 1, _seed_0);
}

function $$$$047session$045bend$047Session$initial$(_config_0, _seed_0, _codes_0, _bytes_0, _units_0) {
  return {$: "Session.Stream", "random": ($$$$047session$045bend$047Session$nonzero$(($$$$047session$045bend$047Session$seed_hash$(_codes_0, _seed_0)))), "phase": 0, "edit": 0, "task": 0, "revision": 0, "generation": 0, "suspended": false, "pendingPhase": 0, "pendingEdit": 0, "pendingTask": 0, "bytes": _bytes_0, "units": _units_0};
}

function $$$$047session$045bend$047Session$random_step$(_random_0) {
  const _x_0 = (13 >= 32 ? 0 : (_random_0 << 13) >>> 0);
  const _a_0 = ((_random_0 ^ _x_0) >>> 0);
  const _x_1 = (17 >= 32 ? 0 : (_a_0 >>> 17) >>> 0);
  const _b_0 = ((_a_0 ^ _x_1) >>> 0);
  const _x_2 = (5 >= 32 ? 0 : (_b_0 << 5) >>> 0);
  return ((_b_0 ^ _x_2) >>> 0);
}

function $$$$047session$045bend$047Session$positive_delay$(_total_0, _variation_0) {
  return $Bool$pick$((_total_0 > _variation_0), ((_total_0 - _variation_0) >>> 0), 1);
}

function $$$$047session$045bend$047Session$sample_delay$(_config_0, _random_0) {
  const _interval_0 = _config_0["interval"];
  const _variation_0 = _config_0["variation"];
  const _x_0 = (Math.imul(2, _variation_0) >>> 0);
  const _x_1 = ((_x_0 + 1) >>> 0);
  const _x_2 = (_x_1 === 0 ? _random_0 : _random_0 % _x_1);
  return $$$$047session$045bend$047Session$positive_delay$(((_interval_0 + _x_2) >>> 0), _variation_0);
}

function $$$$047session$045bend$047Session$snapshot$(_s_0) {
  return $$$$047session$045bend$047Session$set_pendingTask$(($$$$047session$045bend$047Session$set_pendingEdit$(($$$$047session$045bend$047Session$set_pendingPhase$(_s_0, ($$$$047session$045bend$047Session$state_phase$(_s_0)))), ($$$$047session$045bend$047Session$state_edit$(_s_0)))), ($$$$047session$045bend$047Session$state_task$(_s_0)));
}

function $$$$047session$045bend$047Session$emission$(_s_0, _delay_0, _kind_0, _repair_0, _recurring_0) {
  return {$: "Session.Emission", "delay": _delay_0, "kind": _kind_0, "task": ($$$$047session$045bend$047Session$state_task$(_s_0)), "revision": ($$$$047session$045bend$047Session$state_revision$(_s_0)), "generation": ($$$$047session$045bend$047Session$state_generation$(_s_0)), "bytes": ($$$$047session$045bend$047Session$state_bytes$(_s_0)), "units": ($$$$047session$045bend$047Session$state_units$(_s_0)), "repair": _repair_0, "recurring": _recurring_0};
}

function $$$$047session$045bend$047Session$fresh$(_s_0, _delay_0, _repair_0, _recurring_0) {
  const _x_0 = ($$$$047session$045bend$047Session$state_revision$(_s_0));
  const _updated_0 = ($$$$047session$045bend$047Session$set_revision$(_s_0, nat_chk(_x_0 + 1)));
  return {$: "Session.Changed", "state": _updated_0, "events": {$: "Con", "head": ($$$$047session$045bend$047Session$emission$(_updated_0, _delay_0, 1, _repair_0, _recurring_0)), "tail": {$: "Nil"}}};
}

function $$$$047session$045bend$047Session$task_next$(_config_0, _s_0) {
  const _pause_0 = _config_0["pause"];
  const _delay_0 = ($Bool$pick$(($Nat$is_eq$(($$$$047session$045bend$047Session$state_task$(_s_0)), 0)), 0, _pause_0));
  const _x_0 = ($$$$047session$045bend$047Session$state_task$(_s_0));
  const _updated_0 = ($$$$047session$045bend$047Session$set_task$(($$$$047session$045bend$047Session$set_edit$(($$$$047session$045bend$047Session$set_phase$(_s_0, 1)), 0)), nat_chk(_x_0 + 1)));
  return {$: "Session.Changed", "state": _updated_0, "events": {$: "Con", "head": ($$$$047session$045bend$047Session$emission$(_updated_0, _delay_0, 0, false, true)), "tail": {$: "Nil"}}};
}

function $$$$047session$045bend$047Session$edit_next$(_config_0, _s_0) {
  const __0 = _config_0["interval"];
  const __1 = _config_0["variation"];
  const _edits_0 = _config_0["edits"];
  const __2 = _config_0["pause"];
  const __3 = _config_0["response"];
  const __4 = _config_0["repairDelay"];
  const _x_0 = ($$$$047session$045bend$047Session$state_edit$(_s_0));
  const _count_0 = ((_x_0 + 1) >>> 0);
  const _random_0 = ($$$$047session$045bend$047Session$random_step$(($$$$047session$045bend$047Session$state_random$(_s_0))));
  const _updated_0 = ($$$$047session$045bend$047Session$set_random$(($$$$047session$045bend$047Session$set_edit$(($$$$047session$045bend$047Session$set_phase$(_s_0, ($Bool$pick$((_count_0 >= _edits_0), 2, 1)))), _count_0)), _random_0));
  return $$$$047session$045bend$047Session$fresh$(_updated_0, ($$$$047session$045bend$047Session$sample_delay$({$: "Session.Settings", "interval": __0, "variation": __1, "edits": _edits_0, "pause": __2, "response": __3, "repairDelay": __4}, _random_0)), false, true);
}

function $$$$047session$045bend$047Session$finish_next$(_config_0, _s_0) {
  const _random_0 = ($$$$047session$045bend$047Session$random_step$(($$$$047session$045bend$047Session$state_random$(_s_0))));
  const _updated_0 = ($$$$047session$045bend$047Session$set_random$(($$$$047session$045bend$047Session$set_phase$(_s_0, 0)), _random_0));
  return {$: "Session.Changed", "state": _updated_0, "events": {$: "Con", "head": ($$$$047session$045bend$047Session$emission$(_updated_0, ($$$$047session$045bend$047Session$sample_delay$(_config_0, _random_0)), 2, false, true)), "tail": {$: "Nil"}}};
}

function $$$$047session$045bend$047Session$phase_next$(_config_0, _s_0, _phase_0) {
  if (_phase_0 == 0) {
    return $$$$047session$045bend$047Session$task_next$(_config_0, _s_0);
  } else if ((_phase_0 & 1) == 0) {
    return $$$$047session$045bend$047Session$finish_next$(_config_0, _s_0);
  } else if (_phase_0 == 1) {
    return $$$$047session$045bend$047Session$edit_next$(_config_0, _s_0);
  } else {
    return $$$$047session$045bend$047Session$finish_next$(_config_0, _s_0);
  }
}

function $$$$047session$045bend$047Session$enabled_next$(_config_0, _s_0, _suspended_0) {
  if (_suspended_0) {
    return {$: "Session.Changed", "state": _s_0, "events": {$: "Nil"}};
  } else {
    const _saved_0 = ($$$$047session$045bend$047Session$snapshot$(_s_0));
    return $$$$047session$045bend$047Session$phase_next$(_config_0, _saved_0, ($$$$047session$045bend$047Session$state_phase$(_saved_0)));
  }
}

function $$$$047session$045bend$047Session$next$(_config_0, _s_0) {
  return $$$$047session$045bend$047Session$enabled_next$(_config_0, _s_0, ($$$$047session$045bend$047Session$state_suspended$(_s_0)));
}

function $$$$047session$045bend$047Session$finish_state$(_s_0, _continuation_0) {
  if (_continuation_0) {
    return $$$$047session$045bend$047Session$set_edit$(($$$$047session$045bend$047Session$set_phase$(_s_0, 1)), 0);
  } else {
    return $$$$047session$045bend$047Session$set_phase$(_s_0, 0);
  }
}

function $$$$047session$045bend$047Session$on_finish$(_config_0, _s_0, _continuation_0) {
  return $$$$047session$045bend$047Session$next$(_config_0, ($$$$047session$045bend$047Session$finish_state$(_s_0, _continuation_0)));
}

function $$$$047session$045bend$047Session$rewind$(_config_0, _s_0) {
  const _x_0 = ($$$$047session$045bend$047Session$state_generation$(_s_0));
  const _updated_0 = ($$$$047session$045bend$047Session$set_task$(($$$$047session$045bend$047Session$set_edit$(($$$$047session$045bend$047Session$set_phase$(($$$$047session$045bend$047Session$set_generation$(_s_0, nat_chk(_x_0 + 1))), ($$$$047session$045bend$047Session$state_pendingPhase$(_s_0)))), ($$$$047session$045bend$047Session$state_pendingEdit$(_s_0)))), ($$$$047session$045bend$047Session$state_pendingTask$(_s_0))));
  return $$$$047session$045bend$047Session$next$(_config_0, _updated_0);
}

function $$$$047session$045bend$047Session$sizes$(_s_0, _bytes_0, _units_0) {
  return $$$$047session$045bend$047Session$set_units$(($$$$047session$045bend$047Session$set_bytes$(_s_0, _bytes_0)), _units_0);
}

function $$$$047session$045bend$047Session$suspend$(_config_0, _s_0, _suspended_0) {
  return $$$$047session$045bend$047Session$rewind$(_config_0, ($$$$047session$045bend$047Session$set_suspended$(_s_0, _suspended_0)));
}

function $$$$047session$045bend$047Session$set_interval$(_config_0, _interval_0) {
  const _variation_0 = _config_0["variation"];
  const _edits_0 = _config_0["edits"];
  const _pause_0 = _config_0["pause"];
  const _response_0 = _config_0["response"];
  const _repairDelay_0 = _config_0["repairDelay"];
  return {$: "Session.Settings", "interval": _interval_0, "variation": _variation_0, "edits": _edits_0, "pause": _pause_0, "response": _response_0, "repairDelay": _repairDelay_0};
}

function $$$$047session$045bend$047Session$advice_case$(_s_0, _response_0, _repairDelay_0) {
  if (_response_0 == 0) {
    return {$: "Session.Changed", "state": _s_0, "events": {$: "Nil"}};
  } else if ((_response_0 & 3) == 0) {
    return $$$$047session$045bend$047Session$fresh$(_s_0, _repairDelay_0, true, false);
  } else if (_response_0 == 2) {
    return $$$$047session$045bend$047Session$fresh$(_s_0, 1, true, false);
  } else if ((_response_0 & 3) == 2) {
    return $$$$047session$045bend$047Session$fresh$(_s_0, _repairDelay_0, true, false);
  } else if (_response_0 == 1) {
    return {$: "Session.Changed", "state": _s_0, "events": {$: "Nil"}};
  } else {
    return $$$$047session$045bend$047Session$fresh$(_s_0, _repairDelay_0, true, false);
  }
}

function $$$$047session$045bend$047Session$on_advice$(_config_0, _s_0) {
  const _response_0 = _config_0["response"];
  const _repairDelay_0 = _config_0["repairDelay"];
  return $$$$047session$045bend$047Session$advice_case$(_s_0, _response_0, _repairDelay_0);
}

function $$$$047session$045bend$047Session$burst_events$(_count_0, _s_0) {
  if (_count_0 === 0) {
    return {$: "Nil"};
  } else {
    const _p_0 = (_count_0 - 1);
    const _x_0 = ($$$$047session$045bend$047Session$state_revision$(_s_0));
    const _updated_0 = ($$$$047session$045bend$047Session$set_revision$(_s_0, nat_chk(_x_0 + 1)));
    return {$: "Con", "head": ($$$$047session$045bend$047Session$emission$(_updated_0, 0, 1, false, false)), "tail": ($$$$047session$045bend$047Session$burst_events$(_p_0, _updated_0))};
  }
}

function $$$$047session$045bend$047Session$burst$(_count_0, _s_0) {
  const _x_0 = ($$$$047session$045bend$047Session$state_revision$(_s_0));
  return {$: "Session.Changed", "state": ($$$$047session$045bend$047Session$set_revision$(_s_0, nat_chk(_x_0 + _count_0))), "events": ($$$$047session$045bend$047Session$burst_events$(_count_0, _s_0))};
}

function $Random$word_bits$($0, $1, $2, $3) {
  for (;;) {
    {
      const _fuel_0 = $0;
      const _value_0 = $1;
      const _acc_0 = $2;
      const _power_0 = $3;
      if (_fuel_0 === 0) {
        return _acc_0;
      } else {
        const _rest_0 = (_fuel_0 - 1);
        const _x_0 = ($Bool$pick$(($Nat$is_eq$(($Nat$mod$(_value_0, 2)), 1)), _power_0, 0));
        $0 = _rest_0;
        $1 = ($Nat$div$(_value_0, 2));
        $2 = ((_acc_0 + _x_0) >>> 0);
        $3 = (1 >= 32 ? 0 : (_power_0 << 1) >>> 0);
        continue;
      }
    }
  }
}

function $Random$word$(_value_0) {
  return $Random$word_bits$(32, _value_0, 0, 1);
}

function $Random$folded$(_seed_0) {
  const _x_0 = ($Random$word$(_seed_0));
  const _x_1 = ($Random$word$(($Nat$div$(_seed_0, nat_chk(4294967295 + 1)))));
  return ((_x_0 ^ _x_1) >>> 0);
}

function $Random$named_initial$(_seed_0, _codes_0) {
  return $$$$047session$045bend$047Session$nonzero$(($$$$047session$045bend$047Session$seed_hash$(_codes_0, ($Random$folded$(_seed_0)))));
}

function $Random$initial$(_seed_0) {
  return $Random$named_initial$(_seed_0, {$: "Con", "head": 106, "tail": {$: "Con", "head": 101, "tail": {$: "Con", "head": 118, "tail": {$: "Con", "head": 45, "tail": {$: "Con", "head": 111, "tail": {$: "Con", "head": 117, "tail": {$: "Con", "head": 116, "tail": {$: "Con", "head": 99, "tail": {$: "Con", "head": 111, "tail": {$: "Con", "head": 109, "tail": {$: "Con", "head": 101, "tail": {$: "Con", "head": 115, "tail": {$: "Nil"}}}}}}}}}}}}});
}

function $Random$streams$(_seed_0) {
  return {$: "Random.State", "outcomes": ($Random$initial$(_seed_0)), "faults": ($Random$named_initial$(_seed_0, {$: "Con", "head": 102, "tail": {$: "Con", "head": 97, "tail": {$: "Con", "head": 117, "tail": {$: "Con", "head": 108, "tail": {$: "Con", "head": 116, "tail": {$: "Con", "head": 115, "tail": {$: "Nil"}}}}}}}))};
}

function $Random$total$($0, $1) {
  for (;;) {
    {
      const _weights_0 = $0;
      const _acc_0 = $1;
      if (_weights_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _head_0 = _weights_0["head"];
        const _tail_0 = _weights_0["tail"];
        $0 = _tail_0;
        $1 = ($Numeric$plus$(_acc_0, _head_0));
        continue;
      }
    }
  }
}

function $Random$weight_nonzero$(_weight_0) {
  const _high_0 = _weight_0["high"];
  const _low_0 = _weight_0["low"];
  const _x_0 = ($Nat$is_gt$(_high_0, 0));
  const _x_1 = ($Nat$is_gt$(_low_0, 0));
  return (_x_0 || _x_1);
}

function $Random$selected$(_done_0, _index_0, _draw_0, _sum_0, _cumulative_0, _fallback_0, _rest_0) {
  if (_done_0) {
    return _index_0;
  } else {
    return run_tail(_rest_0(_draw_0)(_sum_0)(_cumulative_0)(nat_chk(_index_0 + 1)), _fallback_0);
  }
}

function $Random$choice_step$(_weight_0, _draw_0, _sum_0, _cumulative_0, _index_0, _fallback_0, _rest_0) {
  const _next_0 = ($Numeric$plus$(_cumulative_0, ($Numeric$divide$(_weight_0, _sum_0))));
  return $Random$selected$(($Bool$and$(($Random$weight_nonzero$(_weight_0)), ($Numeric$ordered$(_draw_0, _next_0)))), _index_0, _draw_0, _sum_0, _next_0, ($Bool$pick$(($Random$weight_nonzero$(_weight_0)), _index_0, _fallback_0)), _rest_0);
}

function $Random$choose$(_weights_0, _draw_0, _sum_0, _cumulative_0, _index_0, _fallback_0) {
  if (_weights_0.$ === "Nil") {
    return _fallback_0;
  } else {
    const _weight_0 = _weights_0["head"];
    const _tail_0 = _weights_0["tail"];
    return $Random$choice_step$(_weight_0, _draw_0, _sum_0, _cumulative_0, _index_0, _fallback_0, run_clo((_x_0) => {
  return run_clo((_x_1) => {
  return run_clo((_x_2) => {
  return run_clo((_x_3) => {
  return run_clo((_x_4) => {
  return $Random$choose$(_tail_0, _x_0, _x_1, _x_2, _x_3, _x_4);
});
});
});
});
}));
  }
}

function $Random$sampled$(_random_0, _weights_0) {
  return {$: "Random.Sampled", "random": _random_0, "outcome": run_loop($Random$choose$(_weights_0, ($Numeric$draw$(_random_0)), ($Random$total$(_weights_0, {$: "Numeric.Words", "high": 0, "low": 0})), {$: "Numeric.Words", "high": 0, "low": 0}, 0, 1))};
}

function $Random$sample$(_random_0, _weights_0) {
  return $Random$sampled$(($$$$047session$045bend$047Session$random_step$(_random_0)), _weights_0);
}

function $Random$outcomes$(_state_0) {
  const _outcomes_0 = _state_0["outcomes"];
  return _outcomes_0;
}

function $Random$set_outcomes$(_state_0, _outcomes_0) {
  const _faults_0 = _state_0["faults"];
  return {$: "Random.State", "outcomes": _outcomes_0, "faults": _faults_0};
}

function $TreeFacts$profile_min_files$(_value_0) {
  const _item_0 = _value_0["min_files"];
  return _item_0;
}

function $TreeFacts$profile_max_files$(_value_0) {
  const _item_0 = _value_0["max_files"];
  return _item_0;
}

function $TreeFacts$profile_max_imports$(_value_0) {
  const _item_0 = _value_0["max_imports"];
  return _item_0;
}

function $TreeFacts$profile_max_depth$(_value_0) {
  const _item_0 = _value_0["max_depth"];
  return _item_0;
}

function $TreeFacts$profile_denied_percent$(_value_0) {
  const _item_0 = _value_0["denied_percent"];
  return _item_0;
}

function $TreeFacts$profile_missing_percent$(_value_0) {
  const _item_0 = _value_0["missing_percent"];
  return _item_0;
}

function $TreeFacts$profile_unreadable_percent$(_value_0) {
  const _item_0 = _value_0["unreadable_percent"];
  return _item_0;
}

function $TreeFacts$profile_repeated_percent$(_value_0) {
  const _item_0 = _value_0["repeated_percent"];
  return _item_0;
}

function $TreeFacts$profile_cyclic_percent$(_value_0) {
  const _item_0 = _value_0["cyclic_percent"];
  return _item_0;
}

function $TreeFacts$profile_unsupported_percent$(_value_0) {
  const _item_0 = _value_0["unsupported_percent"];
  return _item_0;
}

function $TreeFacts$profile_deadline_step$(_value_0) {
  const _item_0 = _value_0["deadline_step"];
  return _item_0;
}

function $TreeFacts$profile_local_work$(_value_0) {
  const _item_0 = _value_0["local_work"];
  return _item_0;
}

function $TreeFacts$profile_min_source$(_value_0) {
  const _item_0 = _value_0["min_source"];
  return _item_0;
}

function $TreeFacts$profile_max_source$(_value_0) {
  const _item_0 = _value_0["max_source"];
  return _item_0;
}

function $TreeFacts$profile_min_tree$(_value_0) {
  const _item_0 = _value_0["min_tree"];
  return _item_0;
}

function $TreeFacts$profile_max_tree$(_value_0) {
  const _item_0 = _value_0["max_tree"];
  return _item_0;
}

function $TreeFacts$file_target$(_value_0) {
  const _item_0 = _value_0["target"];
  return _item_0;
}

function $TreeFacts$file_depth$(_value_0) {
  const _item_0 = _value_0["depth"];
  return _item_0;
}

function $TreeFacts$file_allowed$(_value_0) {
  const _item_0 = _value_0["allowed"];
  return _item_0;
}

function $TreeFacts$file_source_bytes$(_value_0) {
  const _item_0 = _value_0["source_bytes"];
  return _item_0;
}

function $TreeFacts$file_tree_bytes$(_value_0) {
  const _item_0 = _value_0["tree_bytes"];
  return _item_0;
}

function $TreeFacts$file_edges$(_value_0) {
  const _item_0 = _value_0["edges"];
  return _item_0;
}

function $TreeFacts$file_missing$(_value_0) {
  const _item_0 = _value_0["missing"];
  return _item_0;
}

function $TreeFacts$file_unreadable$(_value_0) {
  const _item_0 = _value_0["unreadable"];
  return _item_0;
}

function $TreeFacts$file_unsupported$(_value_0) {
  const _item_0 = _value_0["unsupported"];
  return _item_0;
}

function $TreeFacts$decimal_more$(_more_0, _value_0, _digit_0, _rest_0) {
  if (!_more_0) {
    return {$: "Con", "head": _digit_0, "tail": {$: "Nil"}};
  } else {
    return $List$append$(_rest_0(_value_0), {$: "Con", "head": _digit_0, "tail": {$: "Nil"}});
  }
}

function $TreeFacts$decimal_loop$(_fuel_0, _value_0) {
  if (_fuel_0 === 0) {
    return {$: "Nil"};
  } else {
    const _rest_0 = (_fuel_0 - 1);
    const _x_0 = ($Nat$mod$(_value_0, 10));
    return $TreeFacts$decimal_more$(($Nat$is_ge$(_value_0, 10)), ($Nat$div$(_value_0, 10)), ($Random$word$(nat_chk(48 + _x_0))), run_clo((_x_1) => {
  return $TreeFacts$decimal_loop$(_rest_0, _x_1);
}));
  }
}

function $TreeFacts$decimal$(_value_0) {
  return $TreeFacts$decimal_loop$(15, _value_0);
}

function $TreeFacts$initial$(_seed_0, _operation_0, _unit_0) {
  return $$$$047session$045bend$047Session$nonzero$(($$$$047session$045bend$047Session$seed_hash$(($List$append$({$: "Con", "head": 105, "tail": {$: "Con", "head": 109, "tail": {$: "Con", "head": 112, "tail": {$: "Con", "head": 111, "tail": {$: "Con", "head": 114, "tail": {$: "Con", "head": 116, "tail": {$: "Con", "head": 45, "tail": {$: "Con", "head": 116, "tail": {$: "Con", "head": 114, "tail": {$: "Con", "head": 101, "tail": {$: "Con", "head": 101, "tail": {$: "Con", "head": 115, "tail": {$: "Con", "head": 58, "tail": {$: "Nil"}}}}}}}}}}}}}}, ($List$append$(($TreeFacts$decimal$(_operation_0)), ($List$append$({$: "Con", "head": 58, "tail": {$: "Nil"}}, ($TreeFacts$decimal$(_unit_0)))))))), ($Random$folded$(_seed_0)))));
}

function $TreeFacts$scaled$(_word_0, _range_0) {
  const _x_0 = ($Nat$div$(_word_0, 65536));
  const _x_1 = ($Nat$mod$(_word_0, 65536));
  const _x_2 = nat_chk(_x_0 * _range_0);
  const _x_3 = ($Nat$div$(nat_chk(_x_1 * _range_0), 65536));
  return $Nat$div$(nat_chk(_x_2 + _x_3), 65536);
}

function $TreeFacts$drawn$(_random_0, _min_0, _range_0) {
  const _x_0 = ($TreeFacts$scaled$(_random_0, _range_0));
  return {$: "TreeFacts.Draw", "random": _random_0, "value": nat_chk(_min_0 + _x_0)};
}

function $TreeFacts$between$(_random_0, _min_0, _max_0) {
  const _x_0 = (_max_0 < _min_0 ? 0 : _max_0 - _min_0);
  return $TreeFacts$drawn$(($$$$047session$045bend$047Session$random_step$(_random_0)), _min_0, nat_chk(_x_0 + 1));
}

function $TreeFacts$chance_drawn$(_random_0, _percent_0) {
  const _x_0 = nat_chk(4294967295 + 1);
  const _x_1 = nat_chk(_random_0 * 100);
  const _x_2 = nat_chk(_percent_0 * _x_0);
  return {$: "TreeFacts.Chance", "random": _random_0, "yes": (_x_1 < _x_2)};
}

function $TreeFacts$chance_enabled$(_enabled_0, _random_0, _percent_0) {
  if (!_enabled_0) {
    return {$: "TreeFacts.Chance", "random": _random_0, "yes": false};
  } else {
    return $TreeFacts$chance_drawn$(($$$$047session$045bend$047Session$random_step$(_random_0)), _percent_0);
  }
}

function $TreeFacts$chance$(_percent_0, _random_0) {
  return $TreeFacts$chance_enabled$(($Nat$is_gt$(_percent_0, 0)), _random_0, _percent_0);
}

function $TreeFacts$allowed$(_root_0, _random_0, _percent_0) {
  if (_root_0) {
    return {$: "TreeFacts.Chance", "random": _random_0, "yes": false};
  } else {
    return $TreeFacts$chance_drawn$(($$$$047session$045bend$047Session$random_step$(_random_0)), _percent_0);
  }
}

function $TreeFacts$made_tree$(_value_0, _target_0, _depth_0, _allowed_0, _source_0) {
  const _random_0 = _value_0["random"];
  const _tree_0 = _value_0["value"];
  return {$: "TreeFacts.Made", "random": _random_0, "file": {$: "TreeFacts.TreeFile", "target": _target_0, "depth": _depth_0, "allowed": _allowed_0, "source_bytes": _source_0, "tree_bytes": _tree_0, "edges": {$: "Nil"}, "missing": false, "unreadable": false, "unsupported": false}};
}

function $TreeFacts$made_source$(_value_0, _target_0, _depth_0, _allowed_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _source_0 = _value_0["value"];
  return $TreeFacts$made_tree$(($TreeFacts$between$(_random_0, ($TreeFacts$profile_min_tree$(_profile_0)), ($TreeFacts$profile_max_tree$(_profile_0)))), _target_0, _depth_0, _allowed_0, _source_0);
}

function $TreeFacts$made_allowed$(_value_0, _target_0, _depth_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _denied_0 = _value_0["yes"];
  return $TreeFacts$made_source$(($TreeFacts$between$(_random_0, ($TreeFacts$profile_min_source$(_profile_0)), ($TreeFacts$profile_max_source$(_profile_0)))), _target_0, _depth_0, ($Bool$not$(_denied_0)), _profile_0);
}

function $TreeFacts$make$(_random_0, _target_0, _depth_0, _profile_0) {
  return $TreeFacts$made_allowed$(($TreeFacts$allowed$(($Nat$is_eq$(_target_0, 1)), _random_0, ($TreeFacts$profile_denied_percent$(_profile_0)))), _target_0, _depth_0, _profile_0);
}

function $TreeFacts$candidate$(_file_0, _profile_0) {
  const _x_0 = ($TreeFacts$file_depth$(_file_0));
  const _x_1 = ($TreeFacts$profile_max_depth$(_profile_0));
  const _x_2 = ($List$length$(($TreeFacts$file_edges$(_file_0))));
  const _x_3 = ($TreeFacts$profile_max_imports$(_profile_0));
  return $Bool$and$((_x_0 < _x_1), (_x_2 < _x_3));
}

function $TreeFacts$candidates$(_files_0, _profile_0) {
  if (_files_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _files_0["head"];
    const _tail_0 = _files_0["tail"];
    const _rest_0 = ($TreeFacts$candidates$(_tail_0, _profile_0));
    return $Bool$pick$(($TreeFacts$candidate$(_head_0, _profile_0)), {$: "Con", "head": _head_0, "tail": _rest_0}, _rest_0);
  }
}

function $TreeFacts$nth$($0, $1) {
  for (;;) {
    {
      const _index_0 = $0;
      const _files_0 = $1;
      if (_index_0 === 0) {
        if (_files_0.$ === "Nil") {
          return {$: "TreeFacts.TreeFile", "target": 0, "depth": 0, "allowed": false, "source_bytes": 0, "tree_bytes": 0, "edges": {$: "Nil"}, "missing": false, "unreadable": false, "unsupported": false};
        } else {
          const _head_0 = _files_0["head"];
          return _head_0;
        }
      } else {
        const _rest_0 = (_index_0 - 1);
        if (_files_0.$ === "Nil") {
          return {$: "TreeFacts.TreeFile", "target": 0, "depth": 0, "allowed": false, "source_bytes": 0, "tree_bytes": 0, "edges": {$: "Nil"}, "missing": false, "unreadable": false, "unsupported": false};
        } else {
          const _tail_0 = _files_0["tail"];
          $0 = _rest_0;
          $1 = _tail_0;
          continue;
        }
      }
    }
  }
}

function $TreeFacts$connected$(_file_0, _target_0) {
  const _id_0 = _file_0["target"];
  const _depth_0 = _file_0["depth"];
  const _allowed_0 = _file_0["allowed"];
  const _source_0 = _file_0["source_bytes"];
  const _tree_0 = _file_0["tree_bytes"];
  const _edges_0 = _file_0["edges"];
  const _missing_0 = _file_0["missing"];
  const _unreadable_0 = _file_0["unreadable"];
  const _unsupported_0 = _file_0["unsupported"];
  return {$: "TreeFacts.TreeFile", "target": _id_0, "depth": _depth_0, "allowed": _allowed_0, "source_bytes": _source_0, "tree_bytes": _tree_0, "edges": ($List$append$(_edges_0, {$: "Con", "head": _target_0, "tail": {$: "Nil"}})), "missing": _missing_0, "unreadable": _unreadable_0, "unsupported": _unsupported_0};
}

function $TreeFacts$connect$(_files_0, _parent_0, _target_0) {
  if (_files_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _files_0["head"];
    const _tail_0 = _files_0["tail"];
    return {$: "Con", "head": ($Bool$pick$(($Nat$is_eq$(($TreeFacts$file_target$(_head_0)), _parent_0)), ($TreeFacts$connected$(_head_0, _target_0)), _head_0)), "tail": ($TreeFacts$connect$(_tail_0, _parent_0, _target_0))};
  }
}

function $TreeFacts$appended$(_made_0, _files_0) {
  const _random_0 = _made_0["random"];
  const _file_0 = _made_0["file"];
  return {$: "TreeFacts.Files", "random": _random_0, "files": ($List$append$(_files_0, {$: "Con", "head": _file_0, "tail": {$: "Nil"}}))};
}

function $TreeFacts$chosen$(_draw_0, _parents_0, _files_0, _target_0, _profile_0) {
  const _random_0 = _draw_0["random"];
  const _index_0 = _draw_0["value"];
  const _parent_0 = ($TreeFacts$nth$(_index_0, _parents_0));
  const _x_0 = ($TreeFacts$file_depth$(_parent_0));
  return $TreeFacts$appended$(($TreeFacts$make$(_random_0, _target_0, nat_chk(_x_0 + 1), _profile_0)), ($TreeFacts$connect$(_files_0, ($TreeFacts$file_target$(_parent_0)), _target_0)));
}

function $TreeFacts$append_file$(_random_0, _files_0, _target_0, _profile_0) {
  const _parents_0 = ($TreeFacts$candidates$(_files_0, _profile_0));
  const _x_0 = ($List$length$(_parents_0));
  return $TreeFacts$chosen$(($TreeFacts$between$(_random_0, 0, (_x_0 < 1 ? 0 : _x_0 - 1))), _parents_0, _files_0, _target_0, _profile_0);
}

function $TreeFacts$grown$(_value_0, _target_0, _profile_0, _rest_0) {
  const _random_0 = _value_0["random"];
  const _files_0 = _value_0["files"];
  return run_tail(_rest_0(_random_0)(_files_0)(_target_0), _profile_0);
}

function $TreeFacts$grow$(_fuel_0, _random_0, _files_0, _target_0, _profile_0) {
  if (_fuel_0 === 0) {
    return {$: "TreeFacts.Files", "random": _random_0, "files": _files_0};
  } else {
    const _rest_0 = (_fuel_0 - 1);
    return $TreeFacts$grown$(($TreeFacts$append_file$(_random_0, _files_0, _target_0, _profile_0)), nat_chk(_target_0 + 1), _profile_0, run_clo((_x_0) => {
  return run_clo((_x_1) => {
  return run_clo((_x_2) => {
  return run_clo((_x_3) => {
  return $TreeFacts$grow$(_rest_0, _x_0, _x_1, _x_2, _x_3);
});
});
});
}));
  }
}

function $TreeFacts$flagged$(_file_0, _missing_0, _unreadable_0, _unsupported_0, _edges_0) {
  const _target_0 = _file_0["target"];
  const _depth_0 = _file_0["depth"];
  const _allowed_0 = _file_0["allowed"];
  const _source_0 = _file_0["source_bytes"];
  const _tree_0 = _file_0["tree_bytes"];
  return {$: "TreeFacts.TreeFile", "target": _target_0, "depth": _depth_0, "allowed": _allowed_0, "source_bytes": _source_0, "tree_bytes": _tree_0, "edges": _edges_0, "missing": _missing_0, "unreadable": _unreadable_0, "unsupported": _unsupported_0};
}

function $TreeFacts$first$(_edges_0) {
  if (_edges_0.$ === "Nil") {
    return 0;
  } else {
    const _head_0 = _edges_0["head"];
    return _head_0;
  }
}

function $TreeFacts$cyclic$(_value_0, _file_0, _missing_0, _unreadable_0, _unsupported_0, _edges_0) {
  const _random_0 = _value_0["random"];
  const _yes_0 = _value_0["yes"];
  return {$: "TreeFacts.Made", "random": _random_0, "file": ($TreeFacts$flagged$(_file_0, _missing_0, _unreadable_0, _unsupported_0, ($Bool$pick$(_yes_0, ($List$append$(_edges_0, {$: "Con", "head": 1, "tail": {$: "Nil"}})), _edges_0))))};
}

function $TreeFacts$repeated$(_value_0, _file_0, _missing_0, _unreadable_0, _unsupported_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _yes_0 = _value_0["yes"];
  const _edges_0 = ($Bool$pick$(_yes_0, ($List$append$(($TreeFacts$file_edges$(_file_0)), {$: "Con", "head": ($TreeFacts$first$(($TreeFacts$file_edges$(_file_0)))), "tail": {$: "Nil"}})), ($TreeFacts$file_edges$(_file_0))));
  const _x_0 = ($List$length$(_edges_0));
  const _x_1 = ($TreeFacts$profile_max_imports$(_profile_0));
  return $TreeFacts$cyclic$(($TreeFacts$chance_enabled$(($Bool$and$((_x_0 < _x_1), ($Nat$is_gt$(($TreeFacts$profile_cyclic_percent$(_profile_0)), 0)))), _random_0, ($TreeFacts$profile_cyclic_percent$(_profile_0)))), _file_0, _missing_0, _unreadable_0, _unsupported_0, _edges_0);
}

function $TreeFacts$unsupported$(_value_0, _file_0, _missing_0, _unreadable_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _no_support_0 = _value_0["yes"];
  const _x_0 = ($List$length$(($TreeFacts$file_edges$(_file_0))));
  const _x_1 = ($TreeFacts$profile_max_imports$(_profile_0));
  return $TreeFacts$repeated$(($TreeFacts$chance_enabled$(($Bool$and$(($Bool$and$(($Nat$is_gt$(($List$length$(($TreeFacts$file_edges$(_file_0)))), 0)), (_x_0 < _x_1))), ($Nat$is_gt$(($TreeFacts$profile_repeated_percent$(_profile_0)), 0)))), _random_0, ($TreeFacts$profile_repeated_percent$(_profile_0)))), _file_0, _missing_0, _unreadable_0, _no_support_0, _profile_0);
}

function $TreeFacts$unreadable$(_value_0, _file_0, _missing_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _unreadable_0 = _value_0["yes"];
  return $TreeFacts$unsupported$(($TreeFacts$chance_enabled$(($Bool$and$(($Nat$is_gt$(($TreeFacts$file_target$(_file_0)), 1)), ($Nat$is_gt$(($TreeFacts$profile_unsupported_percent$(_profile_0)), 0)))), _random_0, ($TreeFacts$profile_unsupported_percent$(_profile_0)))), _file_0, _missing_0, _unreadable_0, _profile_0);
}

function $TreeFacts$missing$(_value_0, _file_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _missing_0 = _value_0["yes"];
  return $TreeFacts$unreadable$(($TreeFacts$chance_enabled$(($Bool$and$(($Nat$is_gt$(($TreeFacts$file_target$(_file_0)), 1)), ($Nat$is_gt$(($TreeFacts$profile_unreadable_percent$(_profile_0)), 0)))), _random_0, ($TreeFacts$profile_unreadable_percent$(_profile_0)))), _file_0, _missing_0, _profile_0);
}

function $TreeFacts$decorate$(_random_0, _file_0, _profile_0) {
  return $TreeFacts$missing$(($TreeFacts$chance_enabled$(($Bool$and$(($Nat$is_gt$(($TreeFacts$file_target$(_file_0)), 1)), ($Nat$is_gt$(($TreeFacts$profile_missing_percent$(_profile_0)), 0)))), _random_0, ($TreeFacts$profile_missing_percent$(_profile_0)))), _file_0, _profile_0);
}

function $TreeFacts$decorated_tail$(_tail_0, _file_0) {
  const _random_0 = _tail_0["random"];
  const _files_0 = _tail_0["files"];
  return {$: "TreeFacts.Files", "random": _random_0, "files": {$: "Con", "head": _file_0, "tail": _files_0}};
}

function $TreeFacts$decorated_head$(_made_0, _profile_0, _rest_0) {
  const _random_0 = _made_0["random"];
  const _file_0 = _made_0["file"];
  return $TreeFacts$decorated_tail$(_rest_0(_random_0)(_profile_0), _file_0);
}

function $TreeFacts$decorations$(_files_0, _random_0, _profile_0) {
  if (_files_0.$ === "Nil") {
    return {$: "TreeFacts.Files", "random": _random_0, "files": {$: "Nil"}};
  } else {
    const _head_0 = _files_0["head"];
    const _tail_0 = _files_0["tail"];
    return $TreeFacts$decorated_head$(($TreeFacts$decorate$(_random_0, _head_0, _profile_0)), _profile_0, run_clo((_x_0) => {
  return run_clo((_x_1) => {
  return $TreeFacts$decorations$(_tail_0, _x_0, _x_1);
});
}));
  }
}

function $TreeFacts$depth$(_files_0) {
  if (_files_0.$ === "Nil") {
    return 0;
  } else {
    const _head_0 = _files_0["head"];
    const _tail_0 = _files_0["tail"];
    const _x_0 = ($TreeFacts$file_depth$(_head_0));
    const _x_1 = ($TreeFacts$depth$(_tail_0));
    return (_x_0 > _x_1 ? _x_0 : _x_1);
  }
}

function $TreeFacts$finished$(_value_0) {
  const _files_0 = _value_0["files"];
  return {$: "TreeFacts.Tree", "files": _files_0, "depth": ($TreeFacts$depth$(_files_0))};
}

function $TreeFacts$decorated$(_value_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _files_0 = _value_0["files"];
  return $TreeFacts$finished$(($TreeFacts$decorations$(_files_0, _random_0, _profile_0)));
}

function $TreeFacts$rooted$(_value_0, _count_0, _profile_0) {
  const _random_0 = _value_0["random"];
  const _root_0 = _value_0["file"];
  return $TreeFacts$decorated$(run_loop($TreeFacts$grow$(_count_0, _random_0, {$: "Con", "head": _root_0, "tail": {$: "Nil"}}, 2, _profile_0)), _profile_0);
}

function $TreeFacts$counted$(_draw_0, _profile_0) {
  const _random_0 = _draw_0["random"];
  const _count_0 = _draw_0["value"];
  return $TreeFacts$rooted$(($TreeFacts$make$(_random_0, 1, 0, _profile_0)), (_count_0 < 1 ? 0 : _count_0 - 1), _profile_0);
}

function $TreeFacts$generate$(_seed_0, _operation_0, _unit_0, _profile_0) {
  return $TreeFacts$counted$(($TreeFacts$between$(($TreeFacts$initial$(_seed_0, _operation_0, _unit_0)), ($TreeFacts$profile_min_files$(_profile_0)), ($TreeFacts$profile_max_files$(_profile_0)))), _profile_0);
}

function $$$$047agent$045flow$045bend$047ImportGraph$source_cap$(_limits_0) {
  const _source_bytes_0 = _limits_0["source_bytes"];
  return _source_bytes_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$tree_cap$(_limits_0) {
  const _tree_bytes_0 = _limits_0["tree_bytes"];
  return _tree_bytes_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$file_cap$(_limits_0) {
  const _files_0 = _limits_0["files"];
  return _files_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$read_cap$(_limits_0) {
  const _read_bytes_0 = _limits_0["read_bytes"];
  return _read_bytes_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$edge_cap$(_limits_0) {
  const _outgoing_edges_0 = _limits_0["outgoing_edges"];
  return _outgoing_edges_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$depth_cap$(_limits_0) {
  const _depth_0 = _limits_0["depth"];
  return _depth_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$work_cap$(_limits_0) {
  const _work_0 = _limits_0["work"];
  return _work_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$local_budget$(_limits_0, _local_work_0, _local_depth_0, _distinct_targets_0, _graph_work_0) {
  return $Bool$and$(($Bool$not$(($Nat$is_gt$(_local_depth_0, ($$$$047agent$045flow$045bend$047ImportGraph$depth_cap$(_limits_0)))))), ($Bool$and$(($Bool$not$(($Nat$is_gt$(_distinct_targets_0, ($$$$047agent$045flow$045bend$047ImportGraph$edge_cap$(_limits_0)))))), ($Bool$not$(($Nat$is_gt$(nat_chk(_local_work_0 + _graph_work_0), ($$$$047agent$045flow$045bend$047ImportGraph$work_cap$(_limits_0)))))))));
}

function $$$$047agent$045flow$045bend$047ImportGraph$tree_after$(_total_0, _contribution_0, _cap_0) {
  return $Bool$pick$(($Nat$is_gt$(nat_chk(_total_0 + _contribution_0), _cap_0)), _total_0, nat_chk(_total_0 + _contribution_0));
}

function $$$$047agent$045flow$045bend$047ImportGraph$read_after$(_total_0, _contribution_0) {
  return nat_chk(_total_0 + _contribution_0);
}

function $$$$047agent$045flow$045bend$047ImportGraph$initial$(_limits_0) {
  return {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Idle"}, "pending": {$: "Nil"}, "visited": {$: "Nil"}, "files": 0, "read_bytes": 0, "tree_bytes": 0, "work": 0, "skipped_tree": false, "skipped_excluded": false, "skipped_other": false, "limits": _limits_0};
}

function $$$$047agent$045flow$045bend$047ImportGraph$edge_count$(_edges_0) {
  if (_edges_0.$ === "Nil") {
    return 0;
  } else {
    const _rest_0 = _edges_0["tail"];
    const _x_0 = ($$$$047agent$045flow$045bend$047ImportGraph$edge_count$(_rest_0));
    return nat_chk(1 + _x_0);
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$contains$(_target_0, _visited_0) {
  if (_visited_0.$ === "Nil") {
    return false;
  } else {
    const _head_0 = _visited_0["head"];
    const _rest_0 = _visited_0["tail"];
    const _x_0 = ($Nat$is_eq$(_target_0, _head_0));
    const _x_1 = ($$$$047agent$045flow$045bend$047ImportGraph$contains$(_target_0, _rest_0));
    return (_x_0 || _x_1);
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$with_depth$(_edges_0, _depth_0) {
  if (_edges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _edges_0["head"];
    const _rest_0 = _edges_0["tail"];
    return {$: "Con", "head": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}, "tail": ($$$$047agent$045flow$045bend$047ImportGraph$with_depth$(_rest_0, _depth_0))};
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$pending_after$(_pending_0, _edges_0, _depth_0, _overflow_0) {
  return $Bool$pick$(_overflow_0, _pending_0, ($List$append$(_pending_0, ($$$$047agent$045flow$045bend$047ImportGraph$with_depth$(_edges_0, nat_chk(_depth_0 + 1))))));
}

function $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0, _reason_0) {
  return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": _reason_0}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.UnitIncomplete", "reason": _reason_0}};
}

function $$$$047agent$045flow$045bend$047ImportGraph$root$(_limits_0, _target_0, _source_bytes_0, _tree_bytes_0, _local_work_0, _edges_0) {
  const _x_0 = ($Nat$is_gt$(_source_bytes_0, ($$$$047agent$045flow$045bend$047ImportGraph$source_cap$(_limits_0))));
  const _x_1 = ($Nat$is_gt$(_source_bytes_0, ($$$$047agent$045flow$045bend$047ImportGraph$read_cap$(_limits_0))));
  const _x_2 = ($Nat$is_gt$(($$$$047agent$045flow$045bend$047ImportGraph$edge_count$(_edges_0)), ($$$$047agent$045flow$045bend$047ImportGraph$edge_cap$(_limits_0))));
  const _x_3 = ($Nat$is_gt$(_local_work_0, ($$$$047agent$045flow$045bend$047ImportGraph$work_cap$(_limits_0))));
  return $Bool$pick$((_x_0 || _x_1), ($$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, {$: "Nil"}, {$: "Nil"}, 0, 0, 0, 0, false, false, false, {$: "ImportGraph.ReadLimit"})), ($Bool$pick$(($Nat$is_gt$(_tree_bytes_0, ($$$$047agent$045flow$045bend$047ImportGraph$tree_cap$(_limits_0)))), ($$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, {$: "Nil"}, {$: "Nil"}, 0, 0, 0, 0, false, false, false, {$: "ImportGraph.TreeLimit"})), ($Bool$pick$((_x_2 || _x_3), ($$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, {$: "Nil"}, {$: "Nil"}, 0, 0, 0, 0, false, false, false, {$: "ImportGraph.WorkLimit"})), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": ($$$$047agent$045flow$045bend$047ImportGraph$with_depth$(_edges_0, 1)), "visited": {$: "Con", "head": _target_0, "tail": {$: "Nil"}}, "files": 1, "read_bytes": _source_bytes_0, "tree_bytes": _tree_bytes_0, "work": _local_work_0, "skipped_tree": false, "skipped_excluded": false, "skipped_other": false, "limits": _limits_0}, "command": {$: "ImportGraph.NoCommand"}})))));
}

function $$$$047agent$045flow$045bend$047ImportGraph$next$(_limits_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0) {
  if (_pending_0.$ === "Nil") {
    return $Bool$pick$(_skipped_tree_0, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": {$: "ImportGraph.TreeLimit"}}, "pending": {$: "Nil"}, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": true, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.UnitIncomplete", "reason": {$: "ImportGraph.TreeLimit"}}}, ($Bool$pick$(_skipped_excluded_0, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": {$: "ImportGraph.Excluded"}}, "pending": {$: "Nil"}, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": false, "skipped_excluded": true, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.UnitIncomplete", "reason": {$: "ImportGraph.Excluded"}}}, ($Bool$pick$(_skipped_other_0, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": {$: "ImportGraph.Omitted"}}, "pending": {$: "Nil"}, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": false, "skipped_excluded": false, "skipped_other": true, "limits": _limits_0}, "command": {$: "ImportGraph.UnitIncomplete", "reason": {$: "ImportGraph.Omitted"}}}, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Complete"}, "pending": {$: "Nil"}, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": false, "skipped_excluded": false, "skipped_other": false, "limits": _limits_0}, "command": {$: "ImportGraph.UnitComplete"}})))));
  } else {
    const _t_0 = _pending_0["head"];
    const _id_0 = _t_0["id"];
    const _depth_0 = _t_0["depth"];
    const _rest_0 = _pending_0["tail"];
    return $Bool$pick$(($Nat$is_ge$(_work_0, ($$$$047agent$045flow$045bend$047ImportGraph$work_cap$(_limits_0)))), ($$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, {$: "Con", "head": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}, "tail": _rest_0}, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0, {$: "ImportGraph.WorkLimit"})), ($Bool$pick$(($Nat$is_gt$(_depth_0, ($$$$047agent$045flow$045bend$047ImportGraph$depth_cap$(_limits_0)))), ($$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, {$: "Con", "head": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}, "tail": _rest_0}, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0, {$: "ImportGraph.DepthLimit"})), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Resolving", "edge": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}}, "pending": _rest_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": nat_chk(_work_0 + 1), "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.ResolveEdge", "edge": _id_0}})));
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$resolved$(_limits_0, _edge_0, _target_0, _result_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0) {
  if (_result_0.$ === "ImportGraph.NotFound") {
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": true, "limits": _limits_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.Missing"}}};
  } else if (_result_0.$ === "ImportGraph.Many") {
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": true, "limits": _limits_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.Ambiguous"}}};
  } else if (_result_0.$ === "ImportGraph.Unhandled") {
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": true, "limits": _limits_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.Unsupported"}}};
  } else {
    return $Bool$pick$(($$$$047agent$045flow$045bend$047ImportGraph$contains$(_target_0, _visited_0)), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.NoCommand"}}, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Checking", "edge": _edge_0, "target": _target_0}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.CheckPath", "target": _target_0}});
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$checked$(_limits_0, _edge_0, _target_0, _allowed_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0) {
  if (!_allowed_0) {
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": true, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.Excluded"}}};
  } else {
    const _x_0 = ($$$$047agent$045flow$045bend$047ImportGraph$source_cap$(_limits_0));
    return $Bool$pick$(($Nat$is_ge$(_files_0, ($$$$047agent$045flow$045bend$047ImportGraph$file_cap$(_limits_0)))), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": true, "limits": _limits_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.FileLimit"}}}, ($Bool$pick$(($Nat$is_gt$(nat_chk(_read_bytes_0 + _x_0), ($$$$047agent$045flow$045bend$047ImportGraph$read_cap$(_limits_0)))), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": true, "limits": _limits_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.ReadLimit"}}}, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Capturing", "edge": _edge_0, "target": _target_0}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.ReadSource", "target": _target_0}})));
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$captured$(_limits_0, _edge_0, _target_0, _source_bytes_0, _node_bytes_0, _local_work_0, _edges_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0) {
  const _depth_0 = _edge_0["depth"];
  const _x_0 = ($Nat$is_gt$(_source_bytes_0, ($$$$047agent$045flow$045bend$047ImportGraph$source_cap$(_limits_0))));
  const _x_1 = ($Nat$is_gt$(nat_chk(_read_bytes_0 + _source_bytes_0), ($$$$047agent$045flow$045bend$047ImportGraph$read_cap$(_limits_0))));
  const _x_2 = ($Nat$is_gt$(($$$$047agent$045flow$045bend$047ImportGraph$edge_count$(_edges_0)), ($$$$047agent$045flow$045bend$047ImportGraph$edge_cap$(_limits_0))));
  const _x_3 = ($Nat$is_gt$(nat_chk(_work_0 + _local_work_0), ($$$$047agent$045flow$045bend$047ImportGraph$work_cap$(_limits_0))));
  return $Bool$pick$((_x_0 || _x_1), ($$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0, {$: "ImportGraph.ReadLimit"})), ($Bool$pick$((_x_2 || _x_3), ($$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0, {$: "ImportGraph.WorkLimit"})), ($Bool$pick$(($Nat$is_gt$(nat_chk(_tree_bytes_0 + _node_bytes_0), ($$$$047agent$045flow$045bend$047ImportGraph$tree_cap$(_limits_0)))), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": ($$$$047agent$045flow$045bend$047ImportGraph$pending_after$(_pending_0, _edges_0, _depth_0, true)), "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": nat_chk(_files_0 + 1), "read_bytes": ($$$$047agent$045flow$045bend$047ImportGraph$read_after$(_read_bytes_0, _source_bytes_0)), "tree_bytes": _tree_bytes_0, "work": nat_chk(_work_0 + _local_work_0), "skipped_tree": true, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.TreeLimit"}}}, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": ($$$$047agent$045flow$045bend$047ImportGraph$pending_after$(_pending_0, _edges_0, _depth_0, false)), "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": nat_chk(_files_0 + 1), "read_bytes": ($$$$047agent$045flow$045bend$047ImportGraph$read_after$(_read_bytes_0, _source_bytes_0)), "tree_bytes": ($$$$047agent$045flow$045bend$047ImportGraph$tree_after$(_tree_bytes_0, _node_bytes_0, ($$$$047agent$045flow$045bend$047ImportGraph$tree_cap$(_limits_0)))), "work": nat_chk(_work_0 + _local_work_0), "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.NoCommand"}})))));
}

function $$$$047agent$045flow$045bend$047ImportGraph$apply$(_state_0, _event_0) {
  const _t_0 = _state_0["phase"];
  if (_t_0.$ === "ImportGraph.Idle") {
    const _pending_0 = _state_0["pending"];
    const _visited_0 = _state_0["visited"];
    const _files_0 = _state_0["files"];
    const _read_bytes_0 = _state_0["read_bytes"];
    const _tree_bytes_0 = _state_0["tree_bytes"];
    const _work_0 = _state_0["work"];
    const _skipped_tree_0 = _state_0["skipped_tree"];
    const _skipped_excluded_0 = _state_0["skipped_excluded"];
    const _skipped_other_0 = _state_0["skipped_other"];
    const _limits_0 = _state_0["limits"];
    if (_event_0.$ === "ImportGraph.Root") {
      const _target_0 = _event_0["target"];
      const _source_bytes_0 = _event_0["source_bytes"];
      const _tree_bytes_1 = _event_0["tree_bytes"];
      const _local_work_0 = _event_0["local_work"];
      const _edges_0 = _event_0["edges"];
      return $$$$047agent$045flow$045bend$047ImportGraph$root$(_limits_0, _target_0, _source_bytes_0, _tree_bytes_1, _local_work_0, _edges_0);
    } else {
      return $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _skipped_other_0, {$: "ImportGraph.ProtocolViolation"});
    }
  } else if (_t_0.$ === "ImportGraph.Ready") {
    const _pending_1 = _state_0["pending"];
    const _visited_1 = _state_0["visited"];
    const _files_1 = _state_0["files"];
    const _read_bytes_1 = _state_0["read_bytes"];
    const _tree_bytes_2 = _state_0["tree_bytes"];
    const _work_1 = _state_0["work"];
    const _skipped_tree_1 = _state_0["skipped_tree"];
    const _skipped_excluded_1 = _state_0["skipped_excluded"];
    const _skipped_other_1 = _state_0["skipped_other"];
    const _limits_1 = _state_0["limits"];
    if (_event_0.$ === "ImportGraph.Next") {
      return $$$$047agent$045flow$045bend$047ImportGraph$next$(_limits_1, _pending_1, _visited_1, _files_1, _read_bytes_1, _tree_bytes_2, _work_1, _skipped_tree_1, _skipped_excluded_1, _skipped_other_1);
    } else {
      return $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_1, _pending_1, _visited_1, _files_1, _read_bytes_1, _tree_bytes_2, _work_1, _skipped_tree_1, _skipped_excluded_1, _skipped_other_1, {$: "ImportGraph.ProtocolViolation"});
    }
  } else if (_t_0.$ === "ImportGraph.Resolving") {
    const _edge_0 = _t_0["edge"];
    const _pending_2 = _state_0["pending"];
    const _visited_2 = _state_0["visited"];
    const _files_2 = _state_0["files"];
    const _read_bytes_2 = _state_0["read_bytes"];
    const _tree_bytes_3 = _state_0["tree_bytes"];
    const _work_2 = _state_0["work"];
    const _skipped_tree_2 = _state_0["skipped_tree"];
    const _skipped_excluded_2 = _state_0["skipped_excluded"];
    const _skipped_other_2 = _state_0["skipped_other"];
    const _limits_2 = _state_0["limits"];
    if (_event_0.$ === "ImportGraph.Resolved") {
      const _target_1 = _event_0["target"];
      const _result_0 = _event_0["result"];
      return $$$$047agent$045flow$045bend$047ImportGraph$resolved$(_limits_2, _edge_0, _target_1, _result_0, _pending_2, _visited_2, _files_2, _read_bytes_2, _tree_bytes_3, _work_2, _skipped_tree_2, _skipped_excluded_2, _skipped_other_2);
    } else {
      return $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_2, _pending_2, _visited_2, _files_2, _read_bytes_2, _tree_bytes_3, _work_2, _skipped_tree_2, _skipped_excluded_2, _skipped_other_2, {$: "ImportGraph.ProtocolViolation"});
    }
  } else if (_t_0.$ === "ImportGraph.Checking") {
    const _edge_1 = _t_0["edge"];
    const _target_2 = _t_0["target"];
    const _pending_3 = _state_0["pending"];
    const _visited_3 = _state_0["visited"];
    const _files_3 = _state_0["files"];
    const _read_bytes_3 = _state_0["read_bytes"];
    const _tree_bytes_4 = _state_0["tree_bytes"];
    const _work_3 = _state_0["work"];
    const _skipped_tree_3 = _state_0["skipped_tree"];
    const _skipped_excluded_3 = _state_0["skipped_excluded"];
    const _skipped_other_3 = _state_0["skipped_other"];
    const _limits_3 = _state_0["limits"];
    if (_event_0.$ === "ImportGraph.PathChecked") {
      const _allowed_0 = _event_0["allowed"];
      return $$$$047agent$045flow$045bend$047ImportGraph$checked$(_limits_3, _edge_1, _target_2, _allowed_0, _pending_3, _visited_3, _files_3, _read_bytes_3, _tree_bytes_4, _work_3, _skipped_tree_3, _skipped_excluded_3, _skipped_other_3);
    } else {
      return $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_3, _pending_3, _visited_3, _files_3, _read_bytes_3, _tree_bytes_4, _work_3, _skipped_tree_3, _skipped_excluded_3, _skipped_other_3, {$: "ImportGraph.ProtocolViolation"});
    }
  } else if (_t_0.$ === "ImportGraph.Capturing") {
    const _edge_2 = _t_0["edge"];
    const _target_3 = _t_0["target"];
    const _pending_4 = _state_0["pending"];
    const _visited_4 = _state_0["visited"];
    const _files_4 = _state_0["files"];
    const _read_bytes_4 = _state_0["read_bytes"];
    const _tree_bytes_5 = _state_0["tree_bytes"];
    const _work_4 = _state_0["work"];
    const _skipped_tree_4 = _state_0["skipped_tree"];
    const _skipped_excluded_4 = _state_0["skipped_excluded"];
    const _skipped_other_4 = _state_0["skipped_other"];
    const _limits_4 = _state_0["limits"];
    if (_event_0.$ === "ImportGraph.Captured") {
      const _source_bytes_1 = _event_0["source_bytes"];
      const _node_bytes_0 = _event_0["node_bytes"];
      const _local_work_1 = _event_0["local_work"];
      const _edges_1 = _event_0["edges"];
      return $$$$047agent$045flow$045bend$047ImportGraph$captured$(_limits_4, _edge_2, _target_3, _source_bytes_1, _node_bytes_0, _local_work_1, _edges_1, _pending_4, _visited_4, _files_4, _read_bytes_4, _tree_bytes_5, _work_4, _skipped_tree_4, _skipped_excluded_4, _skipped_other_4);
    } else if (_event_0.$ === "ImportGraph.CaptureFailed") {
      return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_4, "visited": {$: "Con", "head": _target_3, "tail": _visited_4}, "files": _files_4, "read_bytes": _read_bytes_4, "tree_bytes": _tree_bytes_5, "work": _work_4, "skipped_tree": _skipped_tree_4, "skipped_excluded": _skipped_excluded_4, "skipped_other": true, "limits": _limits_4}, "command": {$: "ImportGraph.SkipImport", "target": _target_3, "reason": {$: "ImportGraph.CaptureUnavailable"}}};
    } else {
      return $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_4, _pending_4, _visited_4, _files_4, _read_bytes_4, _tree_bytes_5, _work_4, _skipped_tree_4, _skipped_excluded_4, _skipped_other_4, {$: "ImportGraph.ProtocolViolation"});
    }
  } else if (_t_0.$ === "ImportGraph.Complete") {
    const _pending_5 = _state_0["pending"];
    const _visited_5 = _state_0["visited"];
    const _files_5 = _state_0["files"];
    const _read_bytes_5 = _state_0["read_bytes"];
    const _tree_bytes_6 = _state_0["tree_bytes"];
    const _work_5 = _state_0["work"];
    const _skipped_tree_5 = _state_0["skipped_tree"];
    const _skipped_excluded_5 = _state_0["skipped_excluded"];
    const _skipped_other_5 = _state_0["skipped_other"];
    const _limits_5 = _state_0["limits"];
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Complete"}, "pending": _pending_5, "visited": _visited_5, "files": _files_5, "read_bytes": _read_bytes_5, "tree_bytes": _tree_bytes_6, "work": _work_5, "skipped_tree": _skipped_tree_5, "skipped_excluded": _skipped_excluded_5, "skipped_other": _skipped_other_5, "limits": _limits_5}, "command": {$: "ImportGraph.NoCommand"}};
  } else {
    const _reason_0 = _t_0["reason"];
    const _pending_6 = _state_0["pending"];
    const _visited_6 = _state_0["visited"];
    const _files_6 = _state_0["files"];
    const _read_bytes_6 = _state_0["read_bytes"];
    const _tree_bytes_7 = _state_0["tree_bytes"];
    const _work_6 = _state_0["work"];
    const _skipped_tree_6 = _state_0["skipped_tree"];
    const _skipped_excluded_6 = _state_0["skipped_excluded"];
    const _skipped_other_6 = _state_0["skipped_other"];
    const _limits_6 = _state_0["limits"];
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": _reason_0}, "pending": _pending_6, "visited": _visited_6, "files": _files_6, "read_bytes": _read_bytes_6, "tree_bytes": _tree_bytes_7, "work": _work_6, "skipped_tree": _skipped_tree_6, "skipped_excluded": _skipped_excluded_6, "skipped_other": _skipped_other_6, "limits": _limits_6}, "command": {$: "ImportGraph.NoCommand"}};
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$deadline$(_state_0) {
  const _t_0 = _state_0["phase"];
  if (_t_0.$ === "ImportGraph.Complete") {
    const _pending_0 = _state_0["pending"];
    const _visited_0 = _state_0["visited"];
    const _files_0 = _state_0["files"];
    const _read_bytes_0 = _state_0["read_bytes"];
    const _tree_bytes_0 = _state_0["tree_bytes"];
    const _work_0 = _state_0["work"];
    const _skipped_tree_0 = _state_0["skipped_tree"];
    const _skipped_excluded_0 = _state_0["skipped_excluded"];
    const _skipped_other_0 = _state_0["skipped_other"];
    const _limits_0 = _state_0["limits"];
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Complete"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.NoCommand"}};
  } else if (_t_0.$ === "ImportGraph.Incomplete") {
    const _reason_0 = _t_0["reason"];
    const _pending_1 = _state_0["pending"];
    const _visited_1 = _state_0["visited"];
    const _files_1 = _state_0["files"];
    const _read_bytes_1 = _state_0["read_bytes"];
    const _tree_bytes_1 = _state_0["tree_bytes"];
    const _work_1 = _state_0["work"];
    const _skipped_tree_1 = _state_0["skipped_tree"];
    const _skipped_excluded_1 = _state_0["skipped_excluded"];
    const _skipped_other_1 = _state_0["skipped_other"];
    const _limits_1 = _state_0["limits"];
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": _reason_0}, "pending": _pending_1, "visited": _visited_1, "files": _files_1, "read_bytes": _read_bytes_1, "tree_bytes": _tree_bytes_1, "work": _work_1, "skipped_tree": _skipped_tree_1, "skipped_excluded": _skipped_excluded_1, "skipped_other": _skipped_other_1, "limits": _limits_1}, "command": {$: "ImportGraph.NoCommand"}};
  } else {
    const _pending_2 = _state_0["pending"];
    const _visited_2 = _state_0["visited"];
    const _files_2 = _state_0["files"];
    const _read_bytes_2 = _state_0["read_bytes"];
    const _tree_bytes_2 = _state_0["tree_bytes"];
    const _work_2 = _state_0["work"];
    const _skipped_tree_2 = _state_0["skipped_tree"];
    const _skipped_excluded_2 = _state_0["skipped_excluded"];
    const _skipped_other_2 = _state_0["skipped_other"];
    const _limits_2 = _state_0["limits"];
    return $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_2, _pending_2, _visited_2, _files_2, _read_bytes_2, _tree_bytes_2, _work_2, _skipped_tree_2, _skipped_excluded_2, _skipped_other_2, {$: "ImportGraph.Deadline"});
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$step$(_state_0, _event_0) {
  if (_event_0.$ === "ImportGraph.DeadlineReached") {
    return $$$$047agent$045flow$045bend$047ImportGraph$deadline$(_state_0);
  } else {
    return $$$$047agent$045flow$045bend$047ImportGraph$apply$(_state_0, _event_0);
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$event_budget$(_limits_0) {
  const _x_0 = ($$$$047agent$045flow$045bend$047ImportGraph$work_cap$(_limits_0));
  const _x_1 = nat_chk(4 * _x_0);
  return nat_chk(2 + _x_1);
}

function $$$$047agent$045flow$045bend$047ImportGraph$bounded_initial$(_limits_0) {
  return {$: "ImportGraph.Bounded", "graph": ($$$$047agent$045flow$045bend$047ImportGraph$initial$(_limits_0)), "remaining": ($$$$047agent$045flow$045bend$047ImportGraph$event_budget$(_limits_0))};
}

function $$$$047agent$045flow$045bend$047ImportGraph$is_terminal$(_graph_0) {
  const _t_0 = _graph_0["phase"];
  if (_t_0.$ === "ImportGraph.Complete") {
    return true;
  } else if (_t_0.$ === "ImportGraph.Incomplete") {
    return true;
  } else {
    return false;
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$exhausted$(_graph_0) {
  const _t_0 = _graph_0["phase"];
  if (_t_0.$ === "ImportGraph.Complete") {
    const _pending_0 = _graph_0["pending"];
    const _visited_0 = _graph_0["visited"];
    const _files_0 = _graph_0["files"];
    const _read_bytes_0 = _graph_0["read_bytes"];
    const _tree_bytes_0 = _graph_0["tree_bytes"];
    const _work_0 = _graph_0["work"];
    const _skipped_tree_0 = _graph_0["skipped_tree"];
    const _skipped_excluded_0 = _graph_0["skipped_excluded"];
    const _skipped_other_0 = _graph_0["skipped_other"];
    const _limits_0 = _graph_0["limits"];
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Complete"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0, "skipped_other": _skipped_other_0, "limits": _limits_0}, "command": {$: "ImportGraph.NoCommand"}};
  } else if (_t_0.$ === "ImportGraph.Incomplete") {
    const _reason_0 = _t_0["reason"];
    const _pending_1 = _graph_0["pending"];
    const _visited_1 = _graph_0["visited"];
    const _files_1 = _graph_0["files"];
    const _read_bytes_1 = _graph_0["read_bytes"];
    const _tree_bytes_1 = _graph_0["tree_bytes"];
    const _work_1 = _graph_0["work"];
    const _skipped_tree_1 = _graph_0["skipped_tree"];
    const _skipped_excluded_1 = _graph_0["skipped_excluded"];
    const _skipped_other_1 = _graph_0["skipped_other"];
    const _limits_1 = _graph_0["limits"];
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": _reason_0}, "pending": _pending_1, "visited": _visited_1, "files": _files_1, "read_bytes": _read_bytes_1, "tree_bytes": _tree_bytes_1, "work": _work_1, "skipped_tree": _skipped_tree_1, "skipped_excluded": _skipped_excluded_1, "skipped_other": _skipped_other_1, "limits": _limits_1}, "command": {$: "ImportGraph.NoCommand"}};
  } else {
    const _pending_2 = _graph_0["pending"];
    const _visited_2 = _graph_0["visited"];
    const _files_2 = _graph_0["files"];
    const _read_bytes_2 = _graph_0["read_bytes"];
    const _tree_bytes_2 = _graph_0["tree_bytes"];
    const _work_2 = _graph_0["work"];
    const _skipped_tree_2 = _graph_0["skipped_tree"];
    const _skipped_excluded_2 = _graph_0["skipped_excluded"];
    const _skipped_other_2 = _graph_0["skipped_other"];
    const _limits_2 = _graph_0["limits"];
    return $$$$047agent$045flow$045bend$047ImportGraph$fail$(_limits_2, _pending_2, _visited_2, _files_2, _read_bytes_2, _tree_bytes_2, _work_2, _skipped_tree_2, _skipped_excluded_2, _skipped_other_2, {$: "ImportGraph.WorkLimit"});
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$wrap$(_result_0, _remaining_0) {
  const _graph_0 = _result_0["state"];
  const _command_0 = _result_0["command"];
  return {$: "ImportGraph.BoundedStep", "state": {$: "ImportGraph.Bounded", "graph": _graph_0, "remaining": _remaining_0}, "command": _command_0};
}

function $$$$047agent$045flow$045bend$047ImportGraph$bounded_step_go$(_graph_0, _event_0, _remaining_0) {
  if (_remaining_0 === 0) {
    return $$$$047agent$045flow$045bend$047ImportGraph$wrap$(($$$$047agent$045flow$045bend$047ImportGraph$exhausted$(_graph_0)), 0);
  } else {
    const _rest_0 = (_remaining_0 - 1);
    return $$$$047agent$045flow$045bend$047ImportGraph$wrap$(($$$$047agent$045flow$045bend$047ImportGraph$step$(_graph_0, _event_0)), _rest_0);
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$bounded_step$(_state_0, _event_0) {
  const _graph_0 = _state_0["graph"];
  const _remaining_0 = _state_0["remaining"];
  return $$$$047agent$045flow$045bend$047ImportGraph$bounded_step_go$(_graph_0, _event_0, _remaining_0);
}

function $$$$047agent$045flow$045bend$047ImportGraph$bounded_terminal$(_state_0) {
  const _graph_0 = _state_0["graph"];
  return $$$$047agent$045flow$045bend$047ImportGraph$is_terminal$(_graph_0);
}

function $$$$047agent$045flow$045bend$047ImportGraph$bounded_state$(_result_0) {
  const _next_0 = _result_0["state"];
  return _next_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$step_graph$(_result_0) {
  const _graph_0 = _result_0["state"];
  return _graph_0;
}

function $$$$047agent$045flow$045bend$047ImportGraph$event_value$(_events_0, _fallback_0) {
  if (_events_0.$ === "Nil") {
    return _fallback_0;
  } else {
    const _event_0 = _events_0["head"];
    return _event_0;
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$event_rest$(_events_0) {
  if (_events_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _rest_0 = _events_0["tail"];
    return _rest_0;
  }
}

function $$$$047agent$045flow$045bend$047ImportGraph$responsive_run$($0, $1, $2, $3) {
  for (;;) {
    {
      const _steps_0 = $0;
      const _state_0 = $1;
      const _events_0 = $2;
      const _fallback_0 = $3;
      if (_steps_0 === 0) {
        return $$$$047agent$045flow$045bend$047ImportGraph$bounded_state$(($$$$047agent$045flow$045bend$047ImportGraph$bounded_step$(_state_0, ($$$$047agent$045flow$045bend$047ImportGraph$event_value$(_events_0, _fallback_0)))));
      } else {
        const _more_0 = (_steps_0 - 1);
        $0 = _more_0;
        $1 = ($$$$047agent$045flow$045bend$047ImportGraph$bounded_state$(($$$$047agent$045flow$045bend$047ImportGraph$bounded_step$(_state_0, ($$$$047agent$045flow$045bend$047ImportGraph$event_value$(_events_0, _fallback_0))))));
        $2 = ($$$$047agent$045flow$045bend$047ImportGraph$event_rest$(_events_0));
        $3 = _fallback_0;
        continue;
      }
    }
  }
}

function $PreparationScenario$resolution$(_file_0) {
  return $Bool$pick$(($TreeFacts$file_missing$(_file_0)), {$: "ImportGraph.NotFound"}, ($Bool$pick$(($TreeFacts$file_unsupported$(_file_0)), {$: "ImportGraph.Unhandled"}, {$: "ImportGraph.Found"})));
}

function $PreparationScenario$captured$(_file_0, _work_0) {
  return $Bool$pick$(($TreeFacts$file_unreadable$(_file_0)), {$: "ImportGraph.CaptureFailed"}, {$: "ImportGraph.Captured", "source_bytes": ($TreeFacts$file_source_bytes$(_file_0)), "node_bytes": ($TreeFacts$file_tree_bytes$(_file_0)), "local_work": _work_0, "edges": ($TreeFacts$file_edges$(_file_0))});
}

function $PreparationScenario$next_fact$(_command_0, _files_0, _work_0) {
  if (_command_0.$ === "ImportGraph.ResolveEdge") {
    const _edge_0 = _command_0["edge"];
    return {$: "ImportGraph.Resolved", "target": _edge_0, "result": ($PreparationScenario$resolution$(($TreeFacts$nth$((_edge_0 < 1 ? 0 : _edge_0 - 1), _files_0))))};
  } else if (_command_0.$ === "ImportGraph.CheckPath") {
    const _target_0 = _command_0["target"];
    return {$: "ImportGraph.PathChecked", "allowed": ($TreeFacts$file_allowed$(($TreeFacts$nth$((_target_0 < 1 ? 0 : _target_0 - 1), _files_0))))};
  } else if (_command_0.$ === "ImportGraph.ReadSource") {
    const _target_1 = _command_0["target"];
    return $PreparationScenario$captured$(($TreeFacts$nth$((_target_1 < 1 ? 0 : _target_1 - 1), _files_0)), _work_0);
  } else {
    return {$: "ImportGraph.Next"};
  }
}

function $PreparationScenario$progressed$(_terminal_0, _state_0, _command_0, _files_0, _profile_0, _position_0, _facts_0, _rest_0) {
  if (_terminal_0) {
    return {$: "PreparationScenario.Trace", "facts": ($List$reverse$(_facts_0)), "state": _state_0, "terminated": true};
  } else {
    return run_tail(_rest_0(_state_0)(($PreparationScenario$next_fact$(_command_0, _files_0, ($TreeFacts$profile_local_work$(_profile_0)))))(_position_0), _facts_0);
  }
}

function $PreparationScenario$stepped$(_result_0, _files_0, _profile_0, _position_0, _facts_0, _rest_0) {
  const _state_0 = _result_0["state"];
  const _command_0 = _result_0["command"];
  return $PreparationScenario$progressed$(($$$$047agent$045flow$045bend$047ImportGraph$bounded_terminal$(_state_0)), _state_0, _command_0, _files_0, _profile_0, _position_0, _facts_0, _rest_0);
}

function $PreparationScenario$supplied$(_state_0, _fact_0, _files_0, _profile_0, _position_0, _facts_0, _rest_0) {
  return $PreparationScenario$stepped$(($$$$047agent$045flow$045bend$047ImportGraph$bounded_step$(_state_0, _fact_0)), _files_0, _profile_0, nat_chk(_position_0 + 1), {$: "Con", "head": _fact_0, "tail": _facts_0}, _rest_0);
}

function $PreparationScenario$loop$(_fuel_0, _files_0, _profile_0, _state_0, _fact_0, _position_0, _facts_0) {
  if (_fuel_0 === 0) {
    return {$: "PreparationScenario.Trace", "facts": ($List$reverse$(_facts_0)), "state": _state_0, "terminated": false};
  } else {
    const _rest_0 = (_fuel_0 - 1);
    return $PreparationScenario$supplied$(_state_0, ($Bool$pick$(($Bool$and$(($Nat$is_gt$(($TreeFacts$profile_deadline_step$(_profile_0)), 0)), ($Nat$is_eq$(_position_0, ($TreeFacts$profile_deadline_step$(_profile_0)))))), {$: "ImportGraph.DeadlineReached"}, _fact_0)), _files_0, _profile_0, _position_0, _facts_0, run_clo((_x_0) => {
  return run_clo((_x_1) => {
  return run_clo((_x_2) => {
  return run_clo((_x_3) => {
  return $PreparationScenario$loop$(_rest_0, _files_0, _profile_0, _x_0, _x_1, _x_2, _x_3);
});
});
});
}));
  }
}

function $PreparationScenario$root$(_file_0, _work_0) {
  return {$: "ImportGraph.Root", "target": ($TreeFacts$file_target$(_file_0)), "source_bytes": ($TreeFacts$file_source_bytes$(_file_0)), "tree_bytes": ($TreeFacts$file_tree_bytes$(_file_0)), "local_work": _work_0, "edges": ($TreeFacts$file_edges$(_file_0))};
}

function $PreparationScenario$phase_complete$(_phase_0) {
  if (_phase_0.$ === "ImportGraph.Complete") {
    return true;
  } else {
    return false;
  }
}

function $PreparationScenario$root_available$(_state_0) {
  const _t_0 = _state_0["graph"];
  const _files_0 = _t_0["files"];
  return $Nat$is_gt$(_files_0, 0);
}

function $PreparationScenario$closure_available$(_state_0) {
  const _t_0 = _state_0["graph"];
  const _phase_0 = _t_0["phase"];
  return $PreparationScenario$phase_complete$(_phase_0);
}

function $PreparationScenario$rule_gate$(_state_0, _requires_closure_0) {
  const _x_0 = ($Bool$not$(_requires_closure_0));
  const _x_1 = ($PreparationScenario$closure_available$(_state_0));
  return $$$$047agent$045flow$045bend$047RulePolicy$applicable$(true, ($PreparationScenario$root_available$(_state_0)), {$: "RulePolicy.TypeShape"}, true, false, true, true, true, false, true, (_x_0 || _x_1), 2, 2);
}

function $PreparationScenario$generated$(_trace_0, _tree_0) {
  const _facts_0 = _trace_0["facts"];
  const _state_0 = _trace_0["state"];
  const _terminated_0 = _trace_0["terminated"];
  return {$: "PreparationScenario.Generated", "tree": _tree_0, "facts": _facts_0, "state": _state_0, "terminated": _terminated_0, "root_gate": ($PreparationScenario$rule_gate$(_state_0, false)), "closure_gate": ($PreparationScenario$rule_gate$(_state_0, true))};
}

function $PreparationScenario$run$(_tree_0, _profile_0, _limits_0) {
  const _files_0 = _tree_0["files"];
  const _depth_0 = _tree_0["depth"];
  return $PreparationScenario$generated$(run_loop($PreparationScenario$loop$(512, _files_0, _profile_0, ($$$$047agent$045flow$045bend$047ImportGraph$bounded_initial$(_limits_0)), ($PreparationScenario$root$(($TreeFacts$nth$(0, _files_0)), ($TreeFacts$profile_local_work$(_profile_0)))), 0, {$: "Nil"})), {$: "TreeFacts.Tree", "files": _files_0, "depth": _depth_0});
}

function $PreparationScenario$generate$(_seed_0, _operation_0, _unit_0, _profile_0, _limits_0) {
  return $PreparationScenario$run$(($TreeFacts$generate$(_seed_0, _operation_0, _unit_0, _profile_0)), _profile_0, _limits_0);
}

function $FaultTargets$request$(_state_0, _target_0) {
  const _t_0 = _state_0["dispatch"];
  const _requests_0 = _t_0["requests"];
  const _p_0 = _target_0["partition"];
  const _l_0 = _target_0["lifetime"];
  const _r_0 = _target_0["round"];
  const _o_0 = _target_0["operation"];
  const _id_0 = _target_0["request"];
  return $$$$047agent$045flow$045bend$047Dispatch$request_phase$(_requests_0, _p_0, _l_0, _r_0, _o_0, _id_0);
}

function $CredentialFacts$initial$() {
  return {$: "CredentialFacts.State", "available": true, "generation": 1};
}

function $CredentialFacts$availability$(_state_0, _available_0) {
  const _generation_0 = _state_0["generation"];
  return {$: "CredentialFacts.State", "available": _available_0, "generation": _generation_0};
}

function $CredentialFacts$rotate$(_state_0) {
  const _available_0 = _state_0["available"];
  const _generation_0 = _state_0["generation"];
  return {$: "CredentialFacts.State", "available": _available_0, "generation": nat_chk(_generation_0 + 1)};
}

function $CredentialFacts$authorized$(_state_0, _issued_generation_0) {
  const _available_0 = _state_0["available"];
  const _generation_0 = _state_0["generation"];
  return $Bool$and$(_available_0, ($Nat$is_eq$(_generation_0, _issued_generation_0)));
}

function $Scheduler$precedes$(_a_0, _b_0) {
  const _at_0 = _a_0["at"];
  const _order_0 = _a_0["order"];
  const _bt_0 = _b_0["at"];
  const _other_0 = _b_0["order"];
  const _x_0 = (_at_0 < _bt_0);
  const _x_1 = ($Bool$and$(($Nat$is_eq$(_at_0, _bt_0)), ($Nat$is_le$(_order_0, _other_0))));
  return (_x_0 || _x_1);
}

function $Scheduler$inserted$(_before_0, _entry_0, _head_0, _tail_0, _rest_0) {
  if (_before_0) {
    return {$: "Con", "head": _entry_0, "tail": {$: "Con", "head": _head_0, "tail": _tail_0}};
  } else {
    return {$: "Con", "head": _head_0, "tail": _rest_0};
  }
}

function $Scheduler$insert$(_queue_0, _entry_0) {
  if (_queue_0.$ === "Nil") {
    return {$: "Con", "head": _entry_0, "tail": {$: "Nil"}};
  } else {
    const _head_0 = _queue_0["head"];
    const _tail_0 = _queue_0["tail"];
    return $Scheduler$inserted$(($Scheduler$precedes$(_entry_0, _head_0)), _entry_0, _head_0, _tail_0, ($Scheduler$insert$(_tail_0, _entry_0)));
  }
}

function $Scheduler$initial$() {
  return {$: "Scheduler.State", "queue": {$: "Nil"}, "now": 0};
}

function $Scheduler$enqueue$(_state_0, _at_0, _order_0) {
  const _queue_0 = _state_0["queue"];
  const _now_0 = _state_0["now"];
  return {$: "Scheduler.State", "queue": ($Scheduler$insert$(_queue_0, {$: "Scheduler.Entry", "at": _at_0, "order": _order_0})), "now": _now_0};
}

function $Scheduler$take_queue$(_queue_0, _now_0) {
  if (_queue_0.$ === "Nil") {
    return {$: "Scheduler.Taken", "state": {$: "Scheduler.State", "queue": {$: "Nil"}, "now": _now_0}, "entry": {$: "None"}};
  } else {
    const _t_0 = _queue_0["head"];
    const _at_0 = _t_0["at"];
    const _order_0 = _t_0["order"];
    const _tail_0 = _queue_0["tail"];
    return {$: "Scheduler.Taken", "state": {$: "Scheduler.State", "queue": _tail_0, "now": _at_0}, "entry": {$: "Some", "value": {$: "Scheduler.Entry", "at": _at_0, "order": _order_0}}};
  }
}

function $Scheduler$take$(_state_0) {
  const _queue_0 = _state_0["queue"];
  const _now_0 = _state_0["now"];
  return $Scheduler$take_queue$(_queue_0, _now_0);
}

function $Scheduler$peek$(_state_0) {
  const _t_0 = _state_0["queue"];
  if (_t_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _head_0 = _t_0["head"];
    return {$: "Some", "value": _head_0};
  }
}

function $Scheduler$entries$(_state_0) {
  const _queue_0 = _state_0["queue"];
  return _queue_0;
}

function $Scheduler$retain$(_remove_0, _entry_0, _rest_0) {
  if (_remove_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": _entry_0, "tail": _rest_0};
  }
}

function $Scheduler$cancel_one$(_entry_0, _rest_0, _order_0) {
  const _at_0 = _entry_0["at"];
  const _id_0 = _entry_0["order"];
  return $Scheduler$retain$(($Nat$is_eq$(_id_0, _order_0)), {$: "Scheduler.Entry", "at": _at_0, "order": _id_0}, _rest_0);
}

function $Scheduler$cancel_queue$(_queue_0, _order_0) {
  if (_queue_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _queue_0["head"];
    const _tail_0 = _queue_0["tail"];
    return $Scheduler$cancel_one$(_head_0, ($Scheduler$cancel_queue$(_tail_0, _order_0)), _order_0);
  }
}

function $Scheduler$cancel$(_state_0, _order_0) {
  const _queue_0 = _state_0["queue"];
  const _now_0 = _state_0["now"];
  return {$: "Scheduler.State", "queue": ($Scheduler$cancel_queue$(_queue_0, _order_0)), "now": _now_0};
}

function $Scheduler$clock$(_state_0) {
  const _now_0 = _state_0["now"];
  return _now_0;
}

function $Workload$partition$(_advicee_0) {
  const _partition_0 = _advicee_0["partition"];
  return _partition_0;
}

function $Workload$initial$(_partition_0, _profile_0) {
  const _settings_0 = _profile_0["settings"];
  const _seed_0 = _profile_0["seed"];
  const _codes_0 = _profile_0["codes"];
  const _bytes_0 = _profile_0["bytes"];
  const _units_0 = _profile_0["units"];
  const _duration_0 = _profile_0["duration"];
  return {$: "Workload.Advicee", "partition": _partition_0, "settings": _settings_0, "stream": ($$$$047session$045bend$047Session$initial$(_settings_0, _seed_0, _codes_0, _bytes_0, _units_0)), "duration": _duration_0};
}

function $Workload$kept$(_remove_0, _head_0, _tail_0) {
  if (_remove_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _head_0, "tail": _tail_0};
  }
}

function $Workload$remove$(_advicees_0, _target_0) {
  if (_advicees_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _advicees_0["head"];
    const _tail_0 = _advicees_0["tail"];
    return $Workload$kept$(($Nat$is_eq$(($Workload$partition$(_head_0)), _target_0)), _head_0, ($Workload$remove$(_tail_0, _target_0)));
  }
}

function $Workload$configure$(_advicees_0, _target_0, _profile_0) {
  return {$: "Con", "head": ($Workload$initial$(_target_0, _profile_0)), "tail": ($Workload$remove$(_advicees_0, _target_0))};
}

function $Workload$find$(_advicees_0, _target_0) {
  if (_advicees_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _head_0 = _advicees_0["head"];
    const _tail_0 = _advicees_0["tail"];
    return $Bool$pick$(($Nat$is_eq$(($Workload$partition$(_head_0)), _target_0)), {$: "Some", "value": _head_0}, ($Workload$find$(_tail_0, _target_0)));
  }
}

function $Workload$dated$(_event_0, _now_0, _partition_0) {
  const _delay_0 = _event_0["delay"];
  const _kind_0 = _event_0["kind"];
  const _task_0 = _event_0["task"];
  const _revision_0 = _event_0["revision"];
  const _generation_0 = _event_0["generation"];
  const _bytes_0 = _event_0["bytes"];
  const _units_0 = _event_0["units"];
  const _repair_0 = _event_0["repair"];
  const _recurring_0 = _event_0["recurring"];
  return {$: "Workload.Emission", "at": nat_chk(_now_0 + _delay_0), "partition": _partition_0, "generation": _generation_0, "kind": _kind_0, "task": _task_0, "revision": _revision_0, "bytes": _bytes_0, "units": _units_0, "repair": _repair_0, "recurring": _recurring_0};
}

function $Workload$date$(_events_0, _now_0, _partition_0) {
  if (_events_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _events_0["head"];
    const _tail_0 = _events_0["tail"];
    return {$: "Con", "head": ($Workload$dated$(_head_0, _now_0, _partition_0)), "tail": ($Workload$date$(_tail_0, _now_0, _partition_0))};
  }
}

function $Workload$valid_event$(_event_0, _now_0) {
  const _delay_0 = _event_0["delay"];
  const _x_0 = nat_chk(65536 * 4294967295);
  const _x_1 = nat_chk(_x_0 + 65535);
  return $Nat$is_le$(_now_0, (_x_1 < _delay_0 ? 0 : _x_1 - _delay_0));
}

function $Workload$valid_events$(_events_0, _now_0) {
  if (_events_0.$ === "Nil") {
    return true;
  } else {
    const _head_0 = _events_0["head"];
    const _tail_0 = _events_0["tail"];
    return $Bool$and$(($Workload$valid_event$(_head_0, _now_0)), ($Workload$valid_events$(_tail_0, _now_0)));
  }
}

function $Workload$update$(_partition_0, _settings_0, _duration_0, _transition_0) {
  const _stream_0 = _transition_0["state"];
  const _events_0 = _transition_0["events"];
  return {$: "Workload.Updated", "advicee": {$: "Workload.Advicee", "partition": _partition_0, "settings": _settings_0, "stream": _stream_0, "duration": _duration_0}, "events": _events_0};
}

function $Workload$next$(_advicee_0) {
  const _partition_0 = _advicee_0["partition"];
  const _settings_0 = _advicee_0["settings"];
  const _stream_0 = _advicee_0["stream"];
  const _duration_0 = _advicee_0["duration"];
  return $Workload$update$(_partition_0, _settings_0, _duration_0, ($$$$047session$045bend$047Session$next$(_settings_0, _stream_0)));
}

function $Workload$finish$(_advicee_0, _continuation_0) {
  const _partition_0 = _advicee_0["partition"];
  const _settings_0 = _advicee_0["settings"];
  const _stream_0 = _advicee_0["stream"];
  const _duration_0 = _advicee_0["duration"];
  return $Workload$update$(_partition_0, _settings_0, _duration_0, ($$$$047session$045bend$047Session$on_finish$(_settings_0, _stream_0, _continuation_0)));
}

function $Workload$advice$(_advicee_0) {
  const _partition_0 = _advicee_0["partition"];
  const _settings_0 = _advicee_0["settings"];
  const _stream_0 = _advicee_0["stream"];
  const _duration_0 = _advicee_0["duration"];
  return $Workload$update$(_partition_0, _settings_0, _duration_0, ($$$$047session$045bend$047Session$on_advice$(_settings_0, _stream_0)));
}

function $Workload$paced$(_partition_0, _settings_0, _stream_0, _duration_0, _interval_0) {
  const _config_0 = ($$$$047session$045bend$047Session$set_interval$(_settings_0, _interval_0));
  return $Workload$update$(_partition_0, _config_0, _duration_0, ($$$$047session$045bend$047Session$rewind$(_config_0, _stream_0)));
}

function $Workload$control$(_advicee_0, _control_0) {
  const _partition_0 = _advicee_0["partition"];
  const _settings_0 = _advicee_0["settings"];
  const _stream_0 = _advicee_0["stream"];
  const _duration_0 = _advicee_0["duration"];
  if (_control_0.$ === "Workload.Pace") {
    const _interval_0 = _control_0["interval"];
    return $Workload$paced$(_partition_0, _settings_0, _stream_0, _duration_0, _interval_0);
  } else if (_control_0.$ === "Workload.Sizes") {
    const _bytes_0 = _control_0["bytes"];
    const _units_0 = _control_0["units"];
    return {$: "Workload.Updated", "advicee": {$: "Workload.Advicee", "partition": _partition_0, "settings": _settings_0, "stream": ($$$$047session$045bend$047Session$sizes$(_stream_0, _bytes_0, _units_0)), "duration": _duration_0}, "events": {$: "Nil"}};
  } else if (_control_0.$ === "Workload.Burst") {
    const _count_0 = _control_0["count"];
    return $Workload$update$(_partition_0, _settings_0, _duration_0, ($$$$047session$045bend$047Session$burst$(_count_0, _stream_0)));
  } else if (_control_0.$ === "Workload.Suspend") {
    const _suspended_0 = _control_0["suspended"];
    return $Workload$update$(_partition_0, _settings_0, _duration_0, ($$$$047session$045bend$047Session$suspend$(_settings_0, _stream_0, _suspended_0)));
  } else {
    const _duration_1 = _control_0["duration"];
    return {$: "Workload.Updated", "advicee": {$: "Workload.Advicee", "partition": _partition_0, "settings": _settings_0, "stream": _stream_0, "duration": {$: "Some", "value": _duration_1}}, "events": {$: "Nil"}};
  }
}

function $Workload$valid_found$(_found_0, _generation_0) {
  if (_found_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _found_0["value"];
    const _stream_0 = _t_0["stream"];
    return $Nat$is_eq$(($$$$047session$045bend$047Session$state_generation$(_stream_0)), _generation_0);
  }
}

function $Workload$valid$(_advicees_0, _target_0, _generation_0, _recurring_0) {
  const _x_0 = ($Bool$not$(_recurring_0));
  const _x_1 = ($Workload$valid_found$(($Workload$find$(_advicees_0, _target_0)), _generation_0));
  return (_x_0 || _x_1);
}

function $Workload$duration_found$(_found_0, _fallback_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _t_1 = _t_0["duration"];
    if (_t_1.$ === "Some") {
      const _duration_0 = _t_1["value"];
      return _duration_0;
    } else {
      return _fallback_0;
    }
  } else {
    return _fallback_0;
  }
}

function $Workload$duration$(_advicees_0, _target_0, _fallback_0) {
  return $Workload$duration_found$(($Workload$find$(_advicees_0, _target_0)), _fallback_0);
}

function $Workload$changed$(_valid_0, _original_0, _updated_0, _events_0, _now_0) {
  if (!_valid_0) {
    return {$: "Workload.Changed", "advicees": _original_0, "events": {$: "Nil"}, "valid": false};
  } else {
    return {$: "Workload.Changed", "advicees": {$: "Con", "head": _updated_0, "tail": ($Workload$remove$(_original_0, ($Workload$partition$(_updated_0))))}, "events": ($Workload$date$(_events_0, _now_0, ($Workload$partition$(_updated_0)))), "valid": true};
  }
}

function $Workload$completed$(_original_0, _now_0, _updated_0) {
  const _advicee_0 = _updated_0["advicee"];
  const _events_0 = _updated_0["events"];
  return $Workload$changed$(($Workload$valid_events$(_events_0, _now_0)), _original_0, _advicee_0, _events_0, _now_0);
}

function $Workload$acted$(_advicee_0, _action_0) {
  if (_action_0.$ === "Workload.Next") {
    return $Workload$next$(_advicee_0);
  } else if (_action_0.$ === "Workload.Finished") {
    const _continuation_0 = _action_0["continuation"];
    return $Workload$finish$(_advicee_0, _continuation_0);
  } else if (_action_0.$ === "Workload.Advice") {
    return $Workload$advice$(_advicee_0);
  } else {
    const _value_0 = _action_0["control"];
    return $Workload$control$(_advicee_0, _value_0);
  }
}

function $Workload$found_action$(_found_0, _original_0, _now_0, _action_0) {
  if (_found_0.$ === "None") {
    return {$: "Workload.Changed", "advicees": _original_0, "events": {$: "Nil"}, "valid": true};
  } else {
    const _advicee_0 = _found_0["value"];
    return $Workload$completed$(_original_0, _now_0, ($Workload$acted$(_advicee_0, _action_0)));
  }
}

function $Workload$run$(_advicees_0, _target_0, _now_0, _action_0) {
  return $Workload$found_action$(($Workload$find$(_advicees_0, _target_0)), _advicees_0, _now_0, _action_0);
}

function $Workload$pre_duration$(_provided_0, _advicees_0, _target_0, _fallback_0) {
  if (_provided_0.$ === "Some") {
    const _duration_0 = _provided_0["value"];
    return _duration_0;
  } else {
    return $Workload$duration$(_advicees_0, _target_0, _fallback_0);
  }
}

function $Workload$pre_captured$(_started_0, _duration_0, _lifetime_0) {
  const _x_0 = nat_chk(65536 * 4294967295);
  const _maximum_0 = nat_chk(_x_0 + 65535);
  return {$: "Workload.PreTiming", "started": _started_0, "deadline": nat_chk(_started_0 + _lifetime_0), "post": nat_chk(_started_0 + _duration_0), "duration": _duration_0, "valid": ($Bool$and$(($Nat$is_le$(_started_0, (_maximum_0 < _lifetime_0 ? 0 : _maximum_0 - _lifetime_0))), ($Nat$is_le$(_started_0, (_maximum_0 < _duration_0 ? 0 : _maximum_0 - _duration_0)))))};
}

function $Workload$pre_timing$(_advicees_0, _target_0, _now_0, _provided_0, _fallback_0, _lifetime_0) {
  return $Workload$pre_captured$(($Bool$pick$(($Nat$is_eq$(_now_0, 0)), 1, _now_0)), ($Workload$pre_duration$(_provided_0, _advicees_0, _target_0, _fallback_0)), _lifetime_0);
}

function $Workload$pre_action$(_facts_0, _now_0, _timing_0) {
  const _partition_0 = _facts_0["partition"];
  const _lifetime_0 = _facts_0["lifetime"];
  const _tool_0 = _facts_0["tool"];
  const _permit_lifetime_0 = _facts_0["permit_lifetime"];
  const _advicee_limit_0 = _facts_0["advicee_limit"];
  const _resident_limit_0 = _facts_0["resident_limit"];
  const _started_0 = _timing_0["started"];
  const _deadline_0 = _timing_0["deadline"];
  const _t_0 = _timing_0["valid"];
  if (_t_0) {
    return {$: "Driver.Handled", "handled": true, "actions": {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.IssuePermit", "partition": _partition_0, "lifetime": _lifetime_0, "tool": _tool_0, "started": _started_0, "deadline": _deadline_0, "now": _started_0, "minimum_started": 0, "facts": {$: "Admission.ProspectiveFacts", "clock_valid": true, "hook_window": _permit_lifetime_0, "started_upper": _started_0, "now_lower": _started_0, "advicee_permit_limit": _advicee_limit_0, "resident_permit_limit": _resident_limit_0}}, "delay": (_started_0 < _now_0 ? 0 : _started_0 - _now_0), "candidate": {$: "None"}, "job": true, "expiry_advice": {$: "None"}}, "tail": {$: "Nil"}}};
  } else {
    return {$: "Driver.Handled", "handled": false, "actions": {$: "Nil"}};
  }
}

function $Workload$issue$(_advicees_0, _now_0, _facts_0) {
  const _partition_0 = _facts_0["partition"];
  const _lifetime_0 = _facts_0["lifetime"];
  const _tool_0 = _facts_0["tool"];
  const _provided_0 = _facts_0["provided"];
  const _fallback_0 = _facts_0["fallback"];
  const _permit_lifetime_0 = _facts_0["permit_lifetime"];
  const _advicee_limit_0 = _facts_0["advicee_limit"];
  const _resident_limit_0 = _facts_0["resident_limit"];
  return $Workload$pre_action$({$: "Workload.PermitFacts", "partition": _partition_0, "lifetime": _lifetime_0, "tool": _tool_0, "provided": {$: "None"}, "fallback": _fallback_0, "permit_lifetime": _permit_lifetime_0, "advicee_limit": _advicee_limit_0, "resident_limit": _resident_limit_0}, _now_0, ($Workload$pre_timing$(_advicees_0, _partition_0, _now_0, _provided_0, _fallback_0, _permit_lifetime_0)));
}

function $Workload$terminal_action$(_capture_0, _now_0) {
  const _partition_0 = _capture_0["partition"];
  const _lifetime_0 = _capture_0["lifetime"];
  const _token_0 = _capture_0["token"];
  const _tool_0 = _capture_0["tool"];
  const __0 = _capture_0["deadline"];
  const _duration_0 = _capture_0["duration"];
  const _t_0 = _capture_0["terminal"];
  if (_t_0 == 0) {
    return {$: "Driver.Action", "event": {$: "Canonical.ConsumePermit", "partition": _partition_0, "lifetime": _lifetime_0, "token": _token_0, "tool": _tool_0, "now": nat_chk(_now_0 + _duration_0)}, "delay": _duration_0, "candidate": {$: "None"}, "job": true, "expiry_advice": {$: "None"}};
  } else if ((_t_0 & 1) == 0) {
    return {$: "Driver.Action", "event": {$: "Canonical.ExpirePermit", "partition": _partition_0, "lifetime": _lifetime_0, "token": _token_0, "deadline_reached": true}, "delay": (__0 < _now_0 ? 0 : __0 - _now_0), "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}};
  } else if (_t_0 == 1) {
    return {$: "Driver.Action", "event": {$: "Canonical.ReleasePermit", "partition": _partition_0, "lifetime": _lifetime_0, "token": _token_0}, "delay": _duration_0, "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}};
  } else {
    return {$: "Driver.Action", "event": {$: "Canonical.ExpirePermit", "partition": _partition_0, "lifetime": _lifetime_0, "token": _token_0, "deadline_reached": true}, "delay": (__0 < _now_0 ? 0 : __0 - _now_0), "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}};
  }
}

function $Workload$post_actions$(_capture_0, _now_0) {
  const _partition_0 = _capture_0["partition"];
  const _lifetime_0 = _capture_0["lifetime"];
  const _token_0 = _capture_0["token"];
  const _tool_0 = _capture_0["tool"];
  const _deadline_0 = _capture_0["deadline"];
  const _duration_0 = _capture_0["duration"];
  const _terminal_0 = _capture_0["terminal"];
  return {$: "Driver.Handled", "handled": true, "actions": ($Bool$pick$(($Bool$and$((_terminal_0 !== 2), ($Nat$is_gt$(_duration_0, (_deadline_0 < _now_0 ? 0 : _deadline_0 - _now_0))))), {$: "Con", "head": {$: "Driver.Action", "event": {$: "Canonical.ExpirePermit", "partition": _partition_0, "lifetime": _lifetime_0, "token": _token_0, "deadline_reached": true}, "delay": (_deadline_0 < _now_0 ? 0 : _deadline_0 - _now_0), "candidate": {$: "None"}, "job": false, "expiry_advice": {$: "None"}}, "tail": {$: "Con", "head": ($Workload$terminal_action$({$: "Workload.PermitCapture", "partition": _partition_0, "lifetime": _lifetime_0, "token": _token_0, "tool": _tool_0, "deadline": _deadline_0, "duration": _duration_0, "terminal": _terminal_0}, _now_0)), "tail": {$: "Nil"}}}, {$: "Con", "head": ($Workload$terminal_action$({$: "Workload.PermitCapture", "partition": _partition_0, "lifetime": _lifetime_0, "token": _token_0, "tool": _tool_0, "deadline": _deadline_0, "duration": _duration_0, "terminal": _terminal_0}, _now_0)), "tail": {$: "Nil"}}))};
}

function $Preparation$same$(_key_0, _entry_0) {
  const _partition_0 = _key_0["partition"];
  const _lifetime_0 = _key_0["lifetime"];
  const _round_0 = _key_0["round"];
  const _operation_0 = _key_0["operation"];
  const _unit_0 = _key_0["unit"];
  const _p_0 = _entry_0["partition"];
  const _l_0 = _entry_0["lifetime"];
  const _r_0 = _entry_0["round"];
  const _o_0 = _entry_0["operation"];
  const _u_0 = _entry_0["unit"];
  return $Bool$and$(($Bool$and$(($Bool$and$(($Bool$and$(($Nat$is_eq$(_partition_0, _p_0)), ($Nat$is_eq$(_lifetime_0, _l_0)))), ($Nat$is_eq$(_round_0, _r_0)))), ($Nat$is_eq$(_operation_0, _o_0)))), ($Nat$is_eq$(_unit_0, _u_0)));
}

function $Preparation$find_hit$(_hit_0, _entry_0, _rest_0) {
  if (_hit_0) {
    return {$: "Some", "value": _entry_0};
  } else {
    return _rest_0;
  }
}

function $Preparation$find$(_entries_0, _key_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _head_0 = _entries_0["head"];
    const _tail_0 = _entries_0["tail"];
    return $Preparation$find_hit$(($Preparation$same$(_key_0, _head_0)), _head_0, ($Preparation$find$(_tail_0, _key_0)));
  }
}

function $Preparation$graph$(_found_0, _limits_0) {
  if (_found_0.$ === "None") {
    return $$$$047agent$045flow$045bend$047ImportGraph$bounded_initial$(_limits_0);
  } else {
    const _t_0 = _found_0["value"];
    const _graph_0 = _t_0["graph"];
    return _graph_0;
  }
}

function $Preparation$retain_hit$(_hit_0, _entry_0, _rest_0) {
  if (_hit_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": _entry_0, "tail": _rest_0};
  }
}

function $Preparation$remove$(_entries_0, _key_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _entries_0["head"];
    const _tail_0 = _entries_0["tail"];
    return $Preparation$retain_hit$(($Preparation$same$(_key_0, _head_0)), _head_0, ($Preparation$remove$(_tail_0, _key_0)));
  }
}

function $Preparation$install$(_key_0, _position_0, _graph_0) {
  const _partition_0 = _key_0["partition"];
  const _lifetime_0 = _key_0["lifetime"];
  const _round_0 = _key_0["round"];
  const _operation_0 = _key_0["operation"];
  const _unit_0 = _key_0["unit"];
  return {$: "Types.GraphEntry", "partition": _partition_0, "lifetime": _lifetime_0, "round": _round_0, "operation": _operation_0, "unit": _unit_0, "position": _position_0, "graph": _graph_0};
}

function $Preparation$settle$(_state_0, _key_0, _position_0, _before_0, _result_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.GraphTransition", "state": {$: "Types.State", "canonical": _canonical_0, "graphs": {$: "Con", "head": ($Preparation$install$(_key_0, _position_0, ($$$$047agent$045flow$045bend$047ImportGraph$bounded_state$(_result_0)))), "tail": ($Preparation$remove$(_graphs_0, _key_0))}, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "before": _before_0, "result": _result_0};
}

function $Preparation$expected$(_found_0) {
  if (_found_0.$ === "None") {
    return 0;
  } else {
    const _t_0 = _found_0["value"];
    const _position_0 = _t_0["position"];
    return _position_0;
  }
}

function $Preparation$checked$(_valid_0, _state_0, _key_0, _position_0, _before_0, _event_0) {
  if (!_valid_0) {
    return {$: "Types.GraphRejected", "state": _state_0};
  } else {
    return $Preparation$settle$(_state_0, _key_0, nat_chk(_position_0 + 1), _before_0, ($$$$047agent$045flow$045bend$047ImportGraph$bounded_step$(_before_0, _event_0)));
  }
}

function $Preparation$step$(_state_0, _key_0, _position_0, _limits_0, _event_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  const _found_0 = ($Preparation$find$(_graphs_0, _key_0));
  return $Preparation$checked$(($Nat$is_eq$(_position_0, ($Preparation$expected$(_found_0)))), {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, _key_0, _position_0, ($Preparation$graph$(_found_0, _limits_0)), _event_0);
}

function $Preparation$retire_entry$(_entry_0, _rest_0, _operation_0) {
  const _p_0 = _entry_0["partition"];
  const _l_0 = _entry_0["lifetime"];
  const _r_0 = _entry_0["round"];
  const _o_0 = _entry_0["operation"];
  const _u_0 = _entry_0["unit"];
  const _s_0 = _entry_0["position"];
  const _g_0 = _entry_0["graph"];
  return $Preparation$retain_hit$(($Nat$is_eq$(_o_0, _operation_0)), {$: "Types.GraphEntry", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0, "unit": _u_0, "position": _s_0, "graph": _g_0}, _rest_0);
}

function $Preparation$retire_entries$(_entries_0, _operation_0) {
  if (_entries_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _head_0 = _entries_0["head"];
    const _tail_0 = _entries_0["tail"];
    return $Preparation$retire_entry$(_head_0, ($Preparation$retire_entries$(_tail_0, _operation_0)), _operation_0);
  }
}

function $Postprocess$preparation_parent$(_found_0) {
  if (_found_0.$ === "Some") {
    const _t_0 = _found_0["value"];
    const _p_0 = _t_0["partition"];
    const _l_0 = _t_0["lifetime"];
    const _r_0 = _t_0["round"];
    const _t_1 = _t_0["parent"];
    if (_t_1 === 0) {
      return {$: "Nil"};
    } else {
      const _30_0 = (_t_1 - 0);
      return {$: "Con", "head": ($Driver$immediate$({$: "Canonical.CompleteObservation", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "observation": _30_0}, false)), "tail": {$: "Con", "head": ($Driver$immediate$({$: "Canonical.DispatchSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _30_0}, false)), "tail": {$: "Nil"}}};
    }
  } else {
    return {$: "Nil"};
  }
}

function $Postprocess$settlement_if$(_running_0, _p_0, _l_0, _r_0, _o_0) {
  if (_running_0) {
    return {$: "Con", "head": ($Driver$immediate$({$: "Canonical.DispatchSettled", "partition": _p_0, "lifetime": _l_0, "round": _r_0, "operation": _o_0}, false)), "tail": {$: "Nil"}};
  } else {
    return {$: "Nil"};
  }
}

function $Postprocess$released$(_before_0, _event_0) {
  if (_event_0.$ === "Canonical.PreparationCompleted") {
    const _p_0 = _event_0["partition"];
    const _l_0 = _event_0["lifetime"];
    const _r_0 = _event_0["round"];
    const _o_0 = _event_0["operation"];
    return $Postprocess$preparation_parent$(($$$$047agent$045flow$045bend$047Canonical$find_work$(_p_0, _l_0, _r_0, _o_0, ($Driver$work_list$(_before_0)))));
  } else if (_event_0.$ === "Canonical.JevRequestSettled") {
    const _p_1 = _event_0["partition"];
    const _l_1 = _event_0["lifetime"];
    const _r_1 = _event_0["round"];
    const _o_1 = _event_0["operation"];
    return $Postprocess$settlement_if$(($$$$047agent$045flow$045bend$047Dispatch$contains$(($Driver$running$(_before_0)), _p_1, _l_1, _r_1, _o_1)), _p_1, _l_1, _r_1, _o_1);
  } else {
    return {$: "Nil"};
  }
}

function $Postprocess$ready_ids$(_state_0) {
  const _t_0 = _state_0["collection"];
  const _ready_0 = _t_0["ready"];
  return _ready_0;
}

function $Postprocess$readiness_if$(_ready_0, _p_0, _l_0, _r_0, _o_0, _parent_0, _rest_0) {
  if (_ready_0) {
    return _rest_0;
  } else {
    return {$: "Con", "head": ($Driver$immediate$({$: "Canonical.CollectionReady", "advice": _o_0, "partition": _p_0, "lifetime": _l_0, "round": _r_0, "observation": _parent_0, "joined_pending": false}, false)), "tail": _rest_0};
  }
}

function $Postprocess$readiness$($0, $1) {
  for (;;) {
    {
      const _work_0 = $0;
      const _ready_0 = $1;
      if (_work_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _t_0 = _work_0["head"];
        const _p_0 = _t_0["partition"];
        const _l_0 = _t_0["lifetime"];
        const _r_0 = _t_0["round"];
        const _o_0 = _t_0["operation"];
        const _t_1 = _t_0["kind"];
        if (_t_1.$ === "Canonical.PendingFinding") {
          const _parent_0 = _t_0["parent"];
          const _rest_0 = _work_0["tail"];
          const _x_0 = ($$$$047agent$045flow$045bend$047CollectionState$contains$(_o_0, _ready_0));
          const _x_1 = ($Nat$is_eq$(_parent_0, 0));
          return $Postprocess$readiness_if$((_x_0 || _x_1), _p_0, _l_0, _r_0, _o_0, _parent_0, ($Postprocess$readiness$(_rest_0, _ready_0)));
        } else {
          const _rest_1 = _work_0["tail"];
          $0 = _rest_1;
          $1 = _ready_0;
          continue;
        }
      }
    }
  }
}

function $Postprocess$refresh$(_event_0) {
  if (_event_0.$ === "Canonical.CompleteObservation") {
    return true;
  } else if (_event_0.$ === "Canonical.JevRequestSettled") {
    return true;
  } else if (_event_0.$ === "Canonical.ReviewCompleted") {
    return true;
  } else if (_event_0.$ === "Canonical.InterruptObservation") {
    return true;
  } else if (_event_0.$ === "Canonical.InterruptPreparation") {
    return true;
  } else if (_event_0.$ === "Canonical.StopPolled") {
    return true;
  } else {
    return false;
  }
}

function $Postprocess$ready_actions$(_should_0, _after_0) {
  if (_should_0) {
    return $Postprocess$readiness$(($Driver$work_list$(_after_0)), ($Postprocess$ready_ids$(_after_0)));
  } else {
    return {$: "Nil"};
  }
}

function $Postprocess$actions$(_before_0, _after_0, _event_0) {
  return $List$append$(($Postprocess$released$(_before_0, _event_0)), ($Postprocess$ready_actions$(($Postprocess$refresh$(_event_0)), _after_0)));
}

function $initial$(_limits_0) {
  return {$: "Types.State", "canonical": ($$$$047agent$045flow$045bend$047Canonical$initial$(_limits_0)), "graphs": {$: "Nil"}, "scheduler": ($Scheduler$initial$()), "workloads": {$: "Nil"}, "random": ($Random$streams$(1)), "advicees": ($Advicees$initial$()), "credentials": ($CredentialFacts$initial$()), "opening": {$: "Nil"}, "retiring": {$: "Nil"}};
}

function $settle$(_graphs_0, _scheduler_0, _workloads_0, _random_0, _result_0, _advicees_0, _credentials_0, _opening_0, _retiring_0) {
  if (_result_0.$ === "Canonical.Advanced") {
    const _state_0 = _result_0["state"];
    const _commands_0 = _result_0["commands"];
    return {$: "Transition", "state": {$: "Types.State", "canonical": _state_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "result": {$: "Canonical.Advanced", "state": _state_0, "commands": _commands_0}};
  } else {
    const _state_1 = _result_0["state"];
    const _reason_0 = _result_0["reason"];
    return {$: "Transition", "state": {$: "Types.State", "canonical": _state_1, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "result": {$: "Canonical.Rejected", "state": _state_1, "reason": _reason_0}};
  }
}

function $step$(_state_0, _event_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return $settle$(_graphs_0, _scheduler_0, _workloads_0, _random_0, ($$$$047agent$045flow$045bend$047Canonical$step$(_canonical_0, _event_0)), _advicees_0, _credentials_0, ($AdmissionAttempts$consumed$(_opening_0, _event_0)), ($PendingEffects$consumed$(_retiring_0, _event_0)));
}

function $canonical$(_state_0) {
  const _canonical_0 = _state_0["canonical"];
  return _canonical_0;
}

function $graph_step$(_state_0, _key_0, _position_0, _limits_0, _event_0) {
  return $Preparation$step$(_state_0, _key_0, _position_0, _limits_0, _event_0);
}

function $retire$(_state_0, _operation_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.State", "canonical": _canonical_0, "graphs": ($Preparation$retire_entries$(_graphs_0, _operation_0)), "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0};
}

function $handle$(_state_0, _event_0, _command_0, _context_0) {
  return $Driver$handle$(($canonical$(_state_0)), _event_0, _command_0, _context_0);
}

function $edit$(_state_0, _partition_0, _lifetime_0) {
  return $Driver$edit$(($canonical$(_state_0)), _partition_0, _lifetime_0);
}

function $preparation_completed$(_partition_0, _lifetime_0, _round_0, _operation_0, _unit_bytes_0, _delay_0) {
  return $Driver$preparation_completed$(_partition_0, _lifetime_0, _round_0, _operation_0, _unit_bytes_0, _delay_0);
}

function $after$(_before_0, _state_0, _event_0) {
  return $Postprocess$actions$(($canonical$(_before_0)), ($canonical$(_state_0)), _event_0);
}

function $enqueue$(_state_0, _at_0, _order_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": ($Scheduler$enqueue$(_scheduler_0, _at_0, _order_0)), "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0};
}

function $take_result$(_canonical_0, _graphs_0, _workloads_0, _random_0, _taken_0, _advicees_0, _credentials_0, _opening_0, _retiring_0) {
  const _scheduler_0 = _taken_0["state"];
  const _entry_0 = _taken_0["entry"];
  return {$: "Taken", "state": {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "entry": _entry_0};
}

function $take$(_state_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return $take_result$(_canonical_0, _graphs_0, _workloads_0, _random_0, ($Scheduler$take$(_scheduler_0)), _advicees_0, _credentials_0, _opening_0, _retiring_0);
}

function $queued$(_state_0) {
  const _scheduler_0 = _state_0["scheduler"];
  return $Scheduler$entries$(_scheduler_0);
}

function $cancel$(_state_0, _order_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": ($Scheduler$cancel$(_scheduler_0, _order_0)), "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0};
}

function $fence$(_state_0, _event_0, _generated_0, _context_0) {
  return $Driver$fence$(($canonical$(_state_0)), _event_0, _generated_0, _context_0);
}

function $preparation_fact_time$(_delay_0, _index_0, _count_0) {
  return $Driver$fact_time$(_delay_0, _index_0, _count_0);
}

function $revalidate$(_state_0, _context_0) {
  return $Driver$revalidate$(($canonical$(_state_0)), _context_0);
}

function $clock$(_state_0) {
  const _scheduler_0 = _state_0["scheduler"];
  return $Scheduler$clock$(_scheduler_0);
}

function $configure_seed$(_state_0, _seed_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": ($Random$streams$(_seed_0)), "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0};
}

function $configure_workload$(_state_0, _partition_0, _profile_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": ($Workload$configure$(_workloads_0, _partition_0, _profile_0)), "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0};
}

function $workload_changed$(_canonical_0, _graphs_0, _scheduler_0, _random_0, _changed_0, _advicees_0, _credentials_0, _opening_0, _retiring_0) {
  const _workloads_0 = _changed_0["advicees"];
  const _events_0 = _changed_0["events"];
  const _valid_0 = _changed_0["valid"];
  return {$: "WorkloadTransition", "state": {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "events": _events_0, "valid": _valid_0};
}

function $workload_action$(_state_0, _partition_0, _action_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return $workload_changed$(_canonical_0, _graphs_0, _scheduler_0, _random_0, ($Workload$run$(_workloads_0, _partition_0, ($Scheduler$clock$(_scheduler_0)), _action_0)), _advicees_0, _credentials_0, _opening_0, _retiring_0);
}

function $workload_valid$(_state_0, _partition_0, _generation_0, _recurring_0) {
  const _workloads_0 = _state_0["workloads"];
  return $Workload$valid$(_workloads_0, _partition_0, _generation_0, _recurring_0);
}

function $workload_duration$(_state_0, _partition_0, _fallback_0) {
  const _workloads_0 = _state_0["workloads"];
  return $Workload$duration$(_workloads_0, _partition_0, _fallback_0);
}

function $sampled_outcome$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _streams_0, _sample_0, _advicees_0, _credentials_0, _opening_0, _retiring_0) {
  const _random_0 = _sample_0["random"];
  const _outcome_0 = _sample_0["outcome"];
  return {$: "OutcomeTransition", "state": {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": ($Random$set_outcomes$(_streams_0, _random_0)), "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "outcome": _outcome_0};
}

function $sample_outcome$(_state_0, _weights_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return $sampled_outcome$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _random_0, ($Random$sample$(($Random$outcomes$(_random_0)), _weights_0)), _advicees_0, _credentials_0, _opening_0, _retiring_0);
}

function $numeric_add$(_a_0, _b_0) {
  return $Numeric$plus$(_a_0, _b_0);
}

function $numeric_divide$(_a_0, _b_0) {
  return $Numeric$divide$(_a_0, _b_0);
}

function $random_initial$(_seed_0) {
  return $Random$initial$(_seed_0);
}

function $random_sample$(_random_0, _weights_0) {
  return $Random$sample$(_random_0, _weights_0);
}

function $session_initial$(_settings_0, _seed_0, _codes_0, _bytes_0, _units_0) {
  return $$$$047session$045bend$047Session$initial$(_settings_0, _seed_0, _codes_0, _bytes_0, _units_0);
}

function $session_next$(_settings_0, _stream_0) {
  return $$$$047session$045bend$047Session$next$(_settings_0, _stream_0);
}

function $session_generation$(_stream_0) {
  return $$$$047session$045bend$047Session$state_generation$(_stream_0);
}

function $session_sizes$(_stream_0, _bytes_0, _units_0) {
  return $$$$047session$045bend$047Session$sizes$(_stream_0, _bytes_0, _units_0);
}

function $session_burst$(_count_0, _stream_0) {
  return $$$$047session$045bend$047Session$burst$(_count_0, _stream_0);
}

function $session_interval$(_settings_0, _interval_0) {
  return $$$$047session$045bend$047Session$set_interval$(_settings_0, _interval_0);
}

function $session_rewind$(_settings_0, _stream_0) {
  return $$$$047session$045bend$047Session$rewind$(_settings_0, _stream_0);
}

function $session_suspend$(_settings_0, _stream_0, _suspended_0) {
  return $$$$047session$045bend$047Session$suspend$(_settings_0, _stream_0, _suspended_0);
}

function $session_finish$(_stream_0, _continuation_0) {
  return $$$$047session$045bend$047Session$finish_state$(_stream_0, _continuation_0);
}

function $session_advice$(_settings_0, _stream_0) {
  return $$$$047session$045bend$047Session$on_advice$(_settings_0, _stream_0);
}

function $pre_timing$(_state_0, _partition_0, _provided_0, _fallback_0, _lifetime_0) {
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  return $Workload$pre_timing$(_workloads_0, _partition_0, ($Scheduler$clock$(_scheduler_0)), _provided_0, _fallback_0, _lifetime_0);
}

function $pre_issue$(_state_0, _facts_0) {
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  return $Workload$issue$(_workloads_0, ($Scheduler$clock$(_scheduler_0)), _facts_0);
}

function $permit_actions$(_state_0, _capture_0) {
  return $Workload$post_actions$(_capture_0, ($clock$(_state_0)));
}

function $session_delay$(_settings_0, _random_0) {
  return $$$$047session$045bend$047Session$sample_delay$(_settings_0, _random_0);
}

function $intervene_request$(_state_0, _target_0, _outcome_0, _delay_0) {
  return $JevEffects$intervene$(($FaultTargets$request$(($canonical$(_state_0)), _target_0)), _outcome_0, _delay_0);
}

function $credential_initial$() {
  return $CredentialFacts$initial$();
}

function $credential_availability$(_state_0, _available_0) {
  return $CredentialFacts$availability$(_state_0, _available_0);
}

function $credential_rotate$(_state_0) {
  return $CredentialFacts$rotate$(_state_0);
}

function $credential_authorized$(_state_0, _issued_generation_0) {
  return $CredentialFacts$authorized$(_state_0, _issued_generation_0);
}

function $declared_state$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _random_0, _credentials_0, _declared_0, _opening_0, _retiring_0) {
  const _advicees_0 = _declared_0["registry"];
  const _scope_0 = _declared_0["scope"];
  const _valid_0 = _declared_0["valid"];
  return {$: "AdviceeDeclared", "state": {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "scope": _scope_0, "valid": _valid_0};
}

function $declare_advicee$(_state_0, _identity_0, _seed_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return $declared_state$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _random_0, _credentials_0, ($Advicees$declare$(_advicees_0, _identity_0, _seed_0)), _opening_0, _retiring_0);
}

function $advicee_identity$(_state_0, _identity_0) {
  const _advicees_0 = _state_0["advicees"];
  return $Advicees$lookup_identity$(_advicees_0, _identity_0);
}

function $advicee_partition$(_state_0, _partition_0) {
  const _advicees_0 = _state_0["advicees"];
  return $Advicees$lookup_partition$(_advicees_0, _partition_0);
}

function $advicee_targets$(_state_0, _identity_0) {
  const _advicees_0 = _state_0["advicees"];
  return $Advicees$targets$(_advicees_0, _identity_0);
}

function $credentials$(_state_0) {
  const _credentials_0 = _state_0["credentials"];
  return _credentials_0;
}

function $configure_credentials$(_state_0, _available_0, _generation_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": {$: "CredentialFacts.State", "available": _available_0, "generation": _generation_0}, "opening": _opening_0, "retiring": _retiring_0};
}

function $changed_credentials$(_credentials_0, _available_0, _rotation_0) {
  if (_rotation_0) {
    return $CredentialFacts$rotate$(_credentials_0);
  } else {
    return $CredentialFacts$availability$(_credentials_0, _available_0);
  }
}

function $credential_action$(_state_0, _available_0, _rotation_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": ($changed_credentials$(_credentials_0, _available_0, _rotation_0)), "opening": _opening_0, "retiring": _retiring_0};
}

function $generate_tree$(_seed_0, _operation_0, _unit_0, _profile_0, _limits_0) {
  return $PreparationScenario$generate$(_seed_0, _operation_0, _unit_0, _profile_0, _limits_0);
}

function $scope_event$(_before_0, _after_0, _event_0, _provided_0) {
  return $AdviceeScope$event$(($canonical$(_before_0)), ($canonical$(_after_0)), _event_0, _provided_0);
}

function $scope_command$(_before_0, _after_0, _command_0, _provided_0) {
  return $AdviceeScope$command$(($canonical$(_before_0)), ($canonical$(_after_0)), _command_0, _provided_0);
}

function $scope_select$(_bindings_0, _partition_0) {
  return $AdviceeScope$select$(_bindings_0, _partition_0);
}

function $attempted_edit$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _random_0, _advicees_0, _credentials_0, _attempt_0, _retiring_0) {
  const _opening_0 = _attempt_0["pending"];
  const _plan_0 = _attempt_0["plan"];
  return {$: "EditAttempt", "state": {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "plan": _plan_0};
}

function $edit_attempt$(_state_0, _partition_0, _lifetime_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return $attempted_edit$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _random_0, _advicees_0, _credentials_0, ($AdmissionAttempts$edit$(_canonical_0, _opening_0, _partition_0, _lifetime_0)), _retiring_0);
}

function $issued_effects$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _random_0, _advicees_0, _credentials_0, _opening_0, _issued_0) {
  const _retiring_0 = _issued_0["pending"];
  const _actions_0 = _issued_0["actions"];
  return {$: "IssuedActions", "state": {$: "Types.State", "canonical": _canonical_0, "graphs": _graphs_0, "scheduler": _scheduler_0, "workloads": _workloads_0, "random": _random_0, "advicees": _advicees_0, "credentials": _credentials_0, "opening": _opening_0, "retiring": _retiring_0}, "actions": _actions_0};
}

function $issue_actions$(_state_0, _actions_0) {
  const _canonical_0 = _state_0["canonical"];
  const _graphs_0 = _state_0["graphs"];
  const _scheduler_0 = _state_0["scheduler"];
  const _workloads_0 = _state_0["workloads"];
  const _random_0 = _state_0["random"];
  const _advicees_0 = _state_0["advicees"];
  const _credentials_0 = _state_0["credentials"];
  const _opening_0 = _state_0["opening"];
  const _retiring_0 = _state_0["retiring"];
  return $issued_effects$(_canonical_0, _graphs_0, _scheduler_0, _workloads_0, _random_0, _advicees_0, _credentials_0, _opening_0, ($PendingEffects$issue$(_retiring_0, _actions_0)));
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

function $Nat$is_gt$(_a_0, _b_0) {
  return $Cmp$is_gt$(cmp_new(_a_0, _b_0));
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

function $Nat$is_le$(_a_0, _b_0) {
  return $Cmp$is_le$(cmp_new(_a_0, _b_0));
}

function $List$length$(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk(($List$length$(_t_0)) + 1);
  }
}

function $Bool$and$(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Nat$is_ge$(_a_0, _b_0) {
  return $Cmp$is_ge$(cmp_new(_a_0, _b_0));
}

function $Bool$not$(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $List$is_empty$(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return true;
  } else {
    return false;
  }
}

function $Maybe$is_none$(_m_0) {
  return $Bool$not$(($Maybe$is_some$(_m_0)));
}

function $Maybe$is_some$(_m_0) {
  if (_m_0.$ === "None") {
    return false;
  } else {
    return true;
  }
}

function $Nat$div$(_a_0, _b_0) {
  return $Pair$fst$(nat_divmod(_a_0, _b_0));
}

function $Nat$mod$(_a_0, _b_0) {
  return $Pair$snd$(nat_divmod(_a_0, _b_0));
}

function $List$reverse$(_xs_0) {
  return $List$reverse$go$(_xs_0, {$: "Nil"});
}

function $Cmp$is_eq$(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
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

function $Cmp$is_le$(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
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

function $Pair$fst$(_p_0) {
  const _a_0 = _p_0["fst"];
  return _a_0;
}

function $Pair$snd$(_p_0) {
  const _b_0 = _p_0["snd"];
  return _b_0;
}

function $List$reverse$go$($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _acc_0 = $1;
      if (_xs_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _h_0 = _xs_0["head"];
        const _t_0 = _xs_0["tail"];
        $0 = _t_0;
        $1 = {$: "Con", "head": _h_0, "tail": _acc_0};
        continue;
      }
    }
  }
}


export const SOURCE_IDENTITY = "shared-monkey-business-source-sha256:fe387547ad16d1d8c2118fd02649932877d393c6622aed0dc7fb8c7dadcaf49e";
export const PREPARATION_SOURCE_IDENTITY = "import-preparation-sha256:fc81ee6d1b3e536a954faf66f528cbccc232d9513e4d129263b61eed9f5298ff";

const facts = value => {
  if (typeof value === "bigint") {
    if (value < 0n || value > 281474976710655n) throw new RangeError("invalid immediate Nat");
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 48) throw new RangeError("invalid immediate Nat");
    return value;
  }
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "$" && typeof item === "string" ? (item.startsWith("../agent-flow-bend/") ? item.slice(19) : item) : facts(item)]));
  return value;
};
export default {
 issue_actions: (state, actions) => run_loop($issue_actions$(state, facts(actions))),
 edit_attempt: (state, partition, lifetime) => run_loop($edit_attempt$(state, facts(partition), facts(lifetime))),
 scope_event: (before, after, event, provided) => run_loop($scope_event$(before, after, facts(event), facts(provided))),
 scope_command: (before, after, command, provided) => run_loop($scope_command$(before, after, command, facts(provided))),
 scope_select: (bindings, partition) => run_loop($scope_select$(facts(bindings), facts(partition))),
 intervene_request: (state, target, outcome, delay) => run_loop($intervene_request$(state, facts(target), facts(outcome), facts(delay))),
 declare_advicee: (state, identity, seed) => run_loop($declare_advicee$(state, facts(identity), seed)),
 advicee_identity: (state, identity) => run_loop($advicee_identity$(state, facts(identity))),
 advicee_partition: (state, partition) => run_loop($advicee_partition$(state, facts(partition))),
 advicee_targets: (state, identity) => run_loop($advicee_targets$(state, facts(identity))),
 credentials: state => run_loop($credentials$(state)),
 configure_credentials: (state, available, generation) => run_loop($configure_credentials$(state, available, facts(generation))),
 credential_action: (state, available, rotation) => run_loop($credential_action$(state, available, rotation)),
 generate_tree: (seed, operation, unit, profile, limits) => run_loop($generate_tree$(facts(seed), facts(operation), facts(unit), facts(profile), facts(limits))),
 initial: limits => run_loop($initial$(facts(limits))),
 step: (state, event) => run_loop($step$(state, facts(event))),
 canonical: state => run_loop($canonical$(state)),
 graph_step: (state, key, position, limits, event) => run_loop($graph_step$(state, facts(key), facts(position), facts(limits), facts(event))),
 retire: (state, operation) => run_loop($retire$(state, facts(operation))),
 handle: (state, event, command, context) => run_loop($handle$(state, facts(event), command, facts(context))),
 edit: (state, partition, lifetime) => run_loop($edit$(state, facts(partition), facts(lifetime))),
 preparation_completed: (partition, lifetime, round, operation, units, delay) => run_loop($preparation_completed$(facts(partition), facts(lifetime), facts(round), facts(operation), facts(units), facts(delay))),
 after: (before, state, event) => run_loop($after$(before, state, facts(event))),
 enqueue: (state, at, order) => run_loop($enqueue$(state, facts(at), facts(order))),
 take: state => run_loop($take$(state)),
 queued: state => run_loop($queued$(state)),
 cancel: (state, order) => run_loop($cancel$(state, facts(order))),
 fence: (state, event, generated, context) => run_loop($fence$(state, facts(event), generated, facts(context))),
 revalidate: (state, context) => run_loop($revalidate$(state, facts(context))),
 pre_issue: (state, factsInput) => run_loop($pre_issue$(state, facts(factsInput))),
 permit_actions: (state, capture) => run_loop($permit_actions$(state, facts(capture))),
 session_delay: (settings, random) => run_loop($session_delay$(facts(settings), random)),
 clock: state => run_loop($clock$(state)),
 configure_seed: (state, seed) => run_loop($configure_seed$(state, facts(seed))),
 configure_workload: (state, partition, profile) => run_loop($configure_workload$(state, facts(partition), facts(profile))),
 workload_action: (state, partition, action) => run_loop($workload_action$(state, facts(partition), facts(action))),
 workload_valid: (state, partition, generation, recurring) => run_loop($workload_valid$(state, facts(partition), facts(generation), recurring)),
 workload_duration: (state, partition, fallback) => run_loop($workload_duration$(state, facts(partition), facts(fallback))),
 pre_timing: (state, partition, provided, fallback, lifetime) => run_loop($pre_timing$(state, facts(partition), facts(provided), facts(fallback), facts(lifetime))),
 sample_outcome: (state, weights) => run_loop($sample_outcome$(state, facts(weights))),
 numeric_add: (a, b) => run_loop($numeric_add$(facts(a), facts(b))),
 numeric_divide: (a, b) => run_loop($numeric_divide$(facts(a), facts(b))),
 random_initial: seed => run_loop($random_initial$(facts(seed))),
 random_sample: (random, weights) => run_loop($random_sample$(random, facts(weights))),
 session_initial: (settings, seed, codes, bytes, units) => run_loop($session_initial$(facts(settings), seed, facts(codes), facts(bytes), facts(units))),
 session_next: (settings, stream) => run_loop($session_next$(facts(settings), stream)),
 session_generation: stream => run_loop($session_generation$(stream)),
 session_sizes: (stream, bytes, units) => run_loop($session_sizes$(stream, facts(bytes), facts(units))),
 session_burst: (count, stream) => run_loop($session_burst$(facts(count), stream)),
 session_interval: (settings, interval) => run_loop($session_interval$(facts(settings), interval)),
 session_rewind: (settings, stream) => run_loop($session_rewind$(facts(settings), stream)),
 session_suspend: (settings, stream, suspended) => run_loop($session_suspend$(facts(settings), stream, suspended)),
 session_finish: (stream, continuation) => run_loop($session_finish$(stream, continuation)),
 session_advice: (settings, stream) => run_loop($session_advice$(facts(settings), stream)),
 preparation_fact_time: (delay, index, count) => BigInt(run_loop($preparation_fact_time$(facts(delay), facts(index), facts(count)))),
};
