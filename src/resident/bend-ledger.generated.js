// hapsland-bend-source-sha256:f04cfe83658a17f955c87c0b5abd17790bc5e25a8fed24c6e56b546e57fc6aec
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
  return {$: "Smoke", "initial": ($Ledger$initial$({$: "Ledger.Limits", "global_items": 4, "global_bytes": 100, "partition_items": 2, "partition_bytes": 60})), "reserved": ($Ledger$reserve$(($sample$()), 1, 40)), "released": ($Ledger$release$(($sample$()), 1)), "resized": ($Ledger$resize$(($sample$()), 1, 30)), "cleared": ($Ledger$clear$(($sample$()))), "total": ($Ledger$total$({$: "Con", "head": {$: "Ledger.Charge", "id": 1, "partition": 1, "bytes": 20, "purpose": {$: "Ledger.ReviewUnit"}}, "tail": {$: "Nil"}})), "local": ($Ledger$partition_usage$({$: "Con", "head": {$: "Ledger.Charge", "id": 1, "partition": 1, "bytes": 20, "purpose": {$: "Ledger.ReviewUnit"}}, "tail": {$: "Nil"}}, 1))};
}

function $Ledger$initial$(_limits_0) {
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": 1, "charges": {$: "Nil"}};
}

function $Ledger$reserve$(_state_0, _partition_0, _bytes_0) {
  return $Ledger$reserve_for$(_state_0, _partition_0, _bytes_0, {$: "Ledger.ReviewUnit"});
}

function $sample$() {
  return {$: "Ledger.Ledger", "limits": {$: "Ledger.Limits", "global_items": 4, "global_bytes": 100, "partition_items": 2, "partition_bytes": 60}, "next_id": 2, "charges": {$: "Con", "head": {$: "Ledger.Charge", "id": 1, "partition": 1, "bytes": 20, "purpose": {$: "Ledger.ReviewUnit"}}, "tail": {$: "Nil"}}};
}

function $Ledger$release$(_state_0, _id_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$release$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Ledger$resize$(_state_0, _id_0, _bytes_0) {
  const __0 = _state_0["limits"];
  const __1 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$resize$found$({$: "Ledger.Ledger", "limits": __0, "next_id": __1, "charges": _charges_0}, _id_0, _bytes_0, ($Ledger$find$(_id_0, _charges_0)));
}

function $Ledger$clear$(_state_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  return {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": {$: "Nil"}};
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

function $Ledger$reserve_for$(_state_0, _partition_0, _bytes_0, _purpose_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  return $Ledger$reserve$check$(_limits_0, _next_id_0, _charges_0, _partition_0, _bytes_0, _purpose_0, ($Ledger$fits$(($Ledger$limits_for$(_purpose_0, _limits_0)), ($Ledger$total$(_charges_0)), ($Ledger$partition_usage$(_charges_0, _partition_0)), _bytes_0)));
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
    const __2 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$find$pick$({$: "Ledger.Charge", "id": _current_0, "partition": __0, "bytes": __1, "purpose": __2}, ($Ledger$find$(_id_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
}

function $Ledger$resize$found$(_state_0, _id_0, _bytes_0, _found_0) {
  const _limits_0 = _state_0["limits"];
  const _next_id_0 = _state_0["next_id"];
  const _charges_0 = _state_0["charges"];
  if (_found_0.$ === "None") {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
  } else {
    const _t_0 = _found_0["value"];
    const _partition_0 = _t_0["partition"];
    const _others_0 = ($Ledger$remove$(_id_0, _charges_0));
    return $Ledger$resize$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, ($Ledger$fits$(_limits_0, ($Ledger$total$(_others_0)), ($Ledger$partition_usage$(_others_0, _partition_0)), _bytes_0)));
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

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
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

function $Ledger$find$pick$(_charge_0, _fallback_0, _hit_0) {
  if (_hit_0) {
    return {$: "Some", "value": _charge_0};
  } else {
    return _fallback_0;
  }
}

function $Ledger$resize$check$(_limits_0, _next_id_0, _charges_0, _id_0, _partition_0, _bytes_0, _allowed_0) {
  if (_allowed_0) {
    return {$: "Ledger.Granted", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": ($Ledger$replace$(_id_0, _bytes_0, _charges_0))}, "id": _id_0};
  } else {
    return {$: "Ledger.Rejected", "state": {$: "Ledger.Ledger", "limits": _limits_0, "next_id": _next_id_0, "charges": _charges_0}};
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

function $List$append$(_xs_0, _ys_0) {
  if (_xs_0.$ === "Nil") {
    return _ys_0;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return {$: "Con", "head": _h_0, "tail": ($List$append$(_t_0, _ys_0))};
  }
}

function $Ledger$decision_fits$(_decision_0) {
  if (_decision_0.$ === "Ledger.Fits") {
    return true;
  } else {
    return false;
  }
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

function $Ledger$remove$pick$(_charge_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return _tail_0;
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
  }
}

function $Ledger$replace$(_id_0, _bytes_0, _charges_0) {
  if (_charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _charges_0["head"];
    const _current_0 = _t_0["id"];
    const _partition_0 = _t_0["partition"];
    const _old_bytes_0 = _t_0["bytes"];
    const _purpose_0 = _t_0["purpose"];
    const _rest_0 = _charges_0["tail"];
    return $Ledger$replace$pick$({$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": _old_bytes_0, "purpose": _purpose_0}, {$: "Ledger.Charge", "id": _current_0, "partition": _partition_0, "bytes": _bytes_0, "purpose": _purpose_0}, ($Ledger$replace$(_id_0, _bytes_0, _rest_0)), ($Nat$is_eq$(_current_0, _id_0)));
  }
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

function $Ledger$replace$pick$(_charge_0, _replacement_0, _tail_0, _hit_0) {
  if (_hit_0) {
    return {$: "Con", "head": _replacement_0, "tail": _tail_0};
  } else {
    return {$: "Con", "head": _charge_0, "tail": _tail_0};
  }
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

const MAX_NAT = 2 ** 48 - 1;
const nat = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_NAT) {
    throw new TypeError("expected Bend Nat within the immediate range");
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
export const bendLedgerInitial = (limits) => run_loop($Ledger$initial$(normalize(limits)));
export const bendLedgerReserve = (state, partition, bytes) =>
  run_loop($Ledger$reserve$(state, nat(partition), nat(bytes)));
export const bendLedgerRelease = (state, id) =>
  run_loop($Ledger$release$(state, nat(id)));
export const bendLedgerResize = (state, id, bytes) =>
  run_loop($Ledger$resize$(state, nat(id), nat(bytes)));
export const bendLedgerClear = (state) => run_loop($Ledger$clear$(state));
export const bendLedgerTotal = (state) => run_loop($Ledger$total$(state.charges));
export const bendLedgerPartitionUsage = (state, partition) =>
  run_loop($Ledger$partition_usage$(state.charges, nat(partition)));
