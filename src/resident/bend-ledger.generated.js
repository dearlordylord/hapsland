// hapsland-bend-source-sha256:9c06cb105ef58b81681a65e64824b085ba16356d52c6629f6e7a39f75b275c1c
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
  return {$: "Smoke", ["initial"]: run_loop($Ledger$initial$({$: "Limits", ["global_items"]: 4n, ["global_bytes"]: 100n, ["partition_items"]: 2n, ["partition_bytes"]: 60n})), ["reserved"]: run_loop($Ledger$reserve$(run_loop($sample$()), 1n, 40n)), ["released"]: run_loop($Ledger$release$(run_loop($sample$()), 1n)), ["resized"]: run_loop($Ledger$resize$(run_loop($sample$()), 1n, 30n)), ["cleared"]: run_loop($Ledger$clear$(run_loop($sample$()))), ["total"]: run_loop($Ledger$total$({$: "Con", ["head"]: {$: "Charge", ["id"]: 1n, ["partition"]: 1n, ["bytes"]: 20n}, ["tail"]: {$: "Nil"}})), ["local"]: run_loop($Ledger$partition_usage$({$: "Con", ["head"]: {$: "Charge", ["id"]: 1n, ["partition"]: 1n, ["bytes"]: 20n}, ["tail"]: {$: "Nil"}}, 1n))};
}

function $Ledger$initial$(limits_0) {
  return {$: "Ledger", ["limits"]: limits_0, ["next_id"]: 1n, ["charges"]: {$: "Nil"}};
}

function $Ledger$reserve$(state_0, partition_0, bytes_0) {
  const limits_0 = state_0.limits;
  const next_id_0 = state_0.next_id;
  const charges_0 = state_0.charges;
  return run_jump($Ledger$reserve$check$, [limits_0, next_id_0, charges_0, partition_0, bytes_0, run_loop($Ledger$fits$(limits_0, run_loop($Ledger$total$(charges_0)), run_loop($Ledger$partition_usage$(charges_0, partition_0)), bytes_0))]);
}

function $sample$() {
  return {$: "Ledger", ["limits"]: {$: "Limits", ["global_items"]: 4n, ["global_bytes"]: 100n, ["partition_items"]: 2n, ["partition_bytes"]: 60n}, ["next_id"]: 2n, ["charges"]: {$: "Con", ["head"]: {$: "Charge", ["id"]: 1n, ["partition"]: 1n, ["bytes"]: 20n}, ["tail"]: {$: "Nil"}}};
}

function $Ledger$release$(state_0, id_0) {
  const __0 = state_0.limits;
  const __1 = state_0.next_id;
  const charges_0 = state_0.charges;
  return run_jump($Ledger$release$found$, [{$: "Ledger", ["limits"]: __0, ["next_id"]: __1, ["charges"]: charges_0}, id_0, run_loop($Ledger$find$(id_0, charges_0))]);
}

function $Ledger$resize$(state_0, id_0, bytes_0) {
  const __0 = state_0.limits;
  const __1 = state_0.next_id;
  const charges_0 = state_0.charges;
  return run_jump($Ledger$resize$found$, [{$: "Ledger", ["limits"]: __0, ["next_id"]: __1, ["charges"]: charges_0}, id_0, bytes_0, run_loop($Ledger$find$(id_0, charges_0))]);
}

function $Ledger$clear$(state_0) {
  const limits_0 = state_0.limits;
  const next_id_0 = state_0.next_id;
  const __0 = state_0.charges;
  return {$: "Ledger", ["limits"]: limits_0, ["next_id"]: next_id_0, ["charges"]: {$: "Nil"}};
}

function $Ledger$total$(charges_0) {
  if (charges_0.$ === "Nil") {
    return {$: "Usage", ["items"]: 0n, ["bytes"]: 0n};
  } else {
    const _t_0 = charges_0.head;
    const __0 = _t_0.id;
    const __1 = _t_0.partition;
    const bytes_0 = _t_0.bytes;
    const rest_0 = charges_0.tail;
    return run_jump($Ledger$total$add$, [run_loop($Ledger$total$(rest_0)), bytes_0]);
  }
}

function $Ledger$partition_usage$(charges_0, partition_0) {
  if (charges_0.$ === "Nil") {
    return {$: "Usage", ["items"]: 0n, ["bytes"]: 0n};
  } else {
    const _t_0 = charges_0.head;
    const __0 = _t_0.id;
    const owner_0 = _t_0.partition;
    const bytes_0 = _t_0.bytes;
    const rest_0 = charges_0.tail;
    return run_jump($Ledger$partition_usage$add$, [run_loop($Ledger$partition_usage$(rest_0, partition_0)), bytes_0, run_loop($Nat$is_eq$(owner_0, partition_0))]);
  }
}

function $Ledger$reserve$check$(limits_0, next_id_0, charges_0, partition_0, bytes_0, allowed_0) {
  if (allowed_0) {
    return {$: "Granted", ["state"]: {$: "Ledger", ["limits"]: limits_0, ["next_id"]: nat_chk(next_id_0 + 1n), ["charges"]: run_loop($List$append$(charges_0, {$: "Con", ["head"]: {$: "Charge", ["id"]: next_id_0, ["partition"]: partition_0, ["bytes"]: bytes_0}, ["tail"]: {$: "Nil"}}))}, ["id"]: next_id_0};
  } else {
    return {$: "Rejected", ["state"]: {$: "Ledger", ["limits"]: limits_0, ["next_id"]: next_id_0, ["charges"]: charges_0}};
  }
}

function $Ledger$fits$(limits_0, global_0, local_0, bytes_0) {
  const global_items_0 = limits_0.global_items;
  const global_bytes_0 = limits_0.global_bytes;
  const partition_items_0 = limits_0.partition_items;
  const partition_bytes_0 = limits_0.partition_bytes;
  const used_items_0 = global_0.items;
  const used_bytes_0 = global_0.bytes;
  const local_items_0 = local_0.items;
  const local_bytes_0 = local_0.bytes;
  return run_jump($Bool$and$, [run_loop($Nat$is_le$(nat_chk(used_items_0 + 1n), global_items_0)), run_loop($Bool$and$(run_loop($Nat$is_le$(nat_chk(used_bytes_0 + bytes_0), global_bytes_0)), run_loop($Bool$and$(run_loop($Nat$is_le$(nat_chk(local_items_0 + 1n), partition_items_0)), run_loop($Nat$is_le$(nat_chk(local_bytes_0 + bytes_0), partition_bytes_0))))))]);
}

function $Ledger$release$found$(state_0, id_0, found_0) {
  const limits_0 = state_0.limits;
  const next_id_0 = state_0.next_id;
  const charges_0 = state_0.charges;
  if (found_0.$ === "Some") {
    const __0 = found_0.value;
    return {$: "Granted", ["state"]: {$: "Ledger", ["limits"]: limits_0, ["next_id"]: next_id_0, ["charges"]: run_loop($Ledger$remove$(id_0, charges_0))}, ["id"]: id_0};
  } else {
    return {$: "Rejected", ["state"]: {$: "Ledger", ["limits"]: limits_0, ["next_id"]: next_id_0, ["charges"]: charges_0}};
  }
}

function $Ledger$find$(id_0, charges_0) {
  if (charges_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = charges_0.head;
    const current_0 = _t_0.id;
    const __0 = _t_0.partition;
    const __1 = _t_0.bytes;
    const rest_0 = charges_0.tail;
    return run_jump($Ledger$find$pick$, [{$: "Charge", ["id"]: current_0, ["partition"]: __0, ["bytes"]: __1}, run_loop($Ledger$find$(id_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Ledger$resize$found$(state_0, id_0, bytes_0, found_0) {
  const limits_0 = state_0.limits;
  const next_id_0 = state_0.next_id;
  const charges_0 = state_0.charges;
  if (found_0.$ === "None") {
    return {$: "Rejected", ["state"]: {$: "Ledger", ["limits"]: limits_0, ["next_id"]: next_id_0, ["charges"]: charges_0}};
  } else {
    const _t_0 = found_0.value;
    const __0 = _t_0.id;
    const partition_0 = _t_0.partition;
    const __1 = _t_0.bytes;
    const others_0 = run_loop($Ledger$remove$(id_0, charges_0));
    return run_jump($Ledger$resize$check$, [limits_0, next_id_0, charges_0, id_0, partition_0, bytes_0, run_loop($Ledger$fits$(limits_0, run_loop($Ledger$total$(others_0)), run_loop($Ledger$partition_usage$(others_0, partition_0)), bytes_0))]);
  }
}

function $Ledger$total$add$(usage_0, bytes_0) {
  const items_0 = usage_0.items;
  const current_bytes_0 = usage_0.bytes;
  return {$: "Usage", ["items"]: nat_chk(items_0 + 1n), ["bytes"]: nat_chk(current_bytes_0 + bytes_0)};
}

function $Ledger$partition_usage$add$(usage_0, bytes_0, same_0) {
  const items_0 = usage_0.items;
  const current_bytes_0 = usage_0.bytes;
  if (same_0) {
    return {$: "Usage", ["items"]: nat_chk(items_0 + 1n), ["bytes"]: nat_chk(current_bytes_0 + bytes_0)};
  } else {
    return {$: "Usage", ["items"]: items_0, ["bytes"]: current_bytes_0};
  }
}

function $Nat$is_eq$(a_0, b_0) {
  return run_jump($Cmp$is_eq$, [cmp_new(a_0, b_0)]);
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

function $Bool$and$(a_0, b_0) {
  if (!a_0) {
    return false;
  } else {
    return b_0;
  }
}

function $Nat$is_le$(a_0, b_0) {
  return run_jump($Cmp$is_le$, [cmp_new(a_0, b_0)]);
}

function $Ledger$remove$(id_0, charges_0) {
  if (charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = charges_0.head;
    const current_0 = _t_0.id;
    const __0 = _t_0.partition;
    const __1 = _t_0.bytes;
    const rest_0 = charges_0.tail;
    return run_jump($Ledger$remove$pick$, [{$: "Charge", ["id"]: current_0, ["partition"]: __0, ["bytes"]: __1}, run_loop($Ledger$remove$(id_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Ledger$find$pick$(charge_0, fallback_0, hit_0) {
  if (hit_0) {
    return {$: "Some", ["value"]: charge_0};
  } else {
    return fallback_0;
  }
}

function $Ledger$resize$check$(limits_0, next_id_0, charges_0, id_0, partition_0, bytes_0, allowed_0) {
  if (allowed_0) {
    return {$: "Granted", ["state"]: {$: "Ledger", ["limits"]: limits_0, ["next_id"]: next_id_0, ["charges"]: run_loop($Ledger$replace$(id_0, bytes_0, charges_0))}, ["id"]: id_0};
  } else {
    return {$: "Rejected", ["state"]: {$: "Ledger", ["limits"]: limits_0, ["next_id"]: next_id_0, ["charges"]: charges_0}};
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

function $Cmp$is_le$(c_0) {
  if (c_0.$ === "LT") {
    return true;
  } else if (c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Ledger$remove$pick$(charge_0, tail_0, hit_0) {
  if (hit_0) {
    return tail_0;
  } else {
    return {$: "Con", ["head"]: charge_0, ["tail"]: tail_0};
  }
}

function $Ledger$replace$(id_0, bytes_0, charges_0) {
  if (charges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = charges_0.head;
    const current_0 = _t_0.id;
    const partition_0 = _t_0.partition;
    const old_bytes_0 = _t_0.bytes;
    const rest_0 = charges_0.tail;
    return run_jump($Ledger$replace$pick$, [{$: "Charge", ["id"]: current_0, ["partition"]: partition_0, ["bytes"]: old_bytes_0}, {$: "Charge", ["id"]: current_0, ["partition"]: partition_0, ["bytes"]: bytes_0}, run_loop($Ledger$replace$(id_0, bytes_0, rest_0)), run_loop($Nat$is_eq$(current_0, id_0))]);
  }
}

function $Ledger$replace$pick$(charge_0, replacement_0, tail_0, hit_0) {
  if (hit_0) {
    return {$: "Con", ["head"]: replacement_0, ["tail"]: tail_0};
  } else {
    return {$: "Con", ["head"]: charge_0, ["tail"]: tail_0};
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
