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
  return $ImportGraph$step$(($ImportGraph$initial$()), {$: "ImportGraph.Root", "target": 1, "source_bytes": 100, "tree_bytes": 100, "edges": {$: "Con", "head": 2, "tail": {$: "Nil"}}});
}

function $ImportGraph$step$(_state_0, _event_0) {
  if (_event_0.$ === "ImportGraph.DeadlineReached") {
    return $ImportGraph$deadline$(_state_0);
  } else {
    return $ImportGraph$apply$(_state_0, _event_0);
  }
}

function $ImportGraph$initial$() {
  return {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Idle"}, "pending": {$: "Nil"}, "visited": {$: "Nil"}, "files": 0, "read_bytes": 0, "tree_bytes": 0, "work": 0, "skipped_tree": false, "skipped_excluded": false};
}

function $ImportGraph$deadline$(_state_0) {
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
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Complete"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.NoCommand"}};
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
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": _reason_0}, "pending": _pending_1, "visited": _visited_1, "files": _files_1, "read_bytes": _read_bytes_1, "tree_bytes": _tree_bytes_1, "work": _work_1, "skipped_tree": _skipped_tree_1, "skipped_excluded": _skipped_excluded_1}, "command": {$: "ImportGraph.NoCommand"}};
  } else {
    const _pending_2 = _state_0["pending"];
    const _visited_2 = _state_0["visited"];
    const _files_2 = _state_0["files"];
    const _read_bytes_2 = _state_0["read_bytes"];
    const _tree_bytes_2 = _state_0["tree_bytes"];
    const _work_2 = _state_0["work"];
    const _skipped_tree_2 = _state_0["skipped_tree"];
    const _skipped_excluded_2 = _state_0["skipped_excluded"];
    return $ImportGraph$fail$(_pending_2, _visited_2, _files_2, _read_bytes_2, _tree_bytes_2, _work_2, _skipped_tree_2, _skipped_excluded_2, {$: "ImportGraph.Deadline"});
  }
}

function $ImportGraph$apply$(_state_0, _event_0) {
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
    if (_event_0.$ === "ImportGraph.Root") {
      const _target_0 = _event_0["target"];
      const _source_bytes_0 = _event_0["source_bytes"];
      const _tree_bytes_1 = _event_0["tree_bytes"];
      const _edges_0 = _event_0["edges"];
      return $ImportGraph$root$(_target_0, _source_bytes_0, _tree_bytes_1, _edges_0);
    } else {
      return $ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.ProtocolViolation"});
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
    if (_event_0.$ === "ImportGraph.Next") {
      return $ImportGraph$next$(_pending_1, _visited_1, _files_1, _read_bytes_1, _tree_bytes_2, _work_1, _skipped_tree_1, _skipped_excluded_1);
    } else {
      return $ImportGraph$fail$(_pending_1, _visited_1, _files_1, _read_bytes_1, _tree_bytes_2, _work_1, _skipped_tree_1, _skipped_excluded_1, {$: "ImportGraph.ProtocolViolation"});
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
    if (_event_0.$ === "ImportGraph.Resolved") {
      const _target_1 = _event_0["target"];
      const _result_0 = _event_0["result"];
      return $ImportGraph$resolved$(_edge_0, _target_1, _result_0, _pending_2, _visited_2, _files_2, _read_bytes_2, _tree_bytes_3, _work_2, _skipped_tree_2, _skipped_excluded_2);
    } else {
      return $ImportGraph$fail$(_pending_2, _visited_2, _files_2, _read_bytes_2, _tree_bytes_3, _work_2, _skipped_tree_2, _skipped_excluded_2, {$: "ImportGraph.ProtocolViolation"});
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
    if (_event_0.$ === "ImportGraph.PathChecked") {
      const _allowed_0 = _event_0["allowed"];
      return $ImportGraph$checked$(_edge_1, _target_2, _allowed_0, _pending_3, _visited_3, _files_3, _read_bytes_3, _tree_bytes_4, _work_3, _skipped_tree_3, _skipped_excluded_3);
    } else {
      return $ImportGraph$fail$(_pending_3, _visited_3, _files_3, _read_bytes_3, _tree_bytes_4, _work_3, _skipped_tree_3, _skipped_excluded_3, {$: "ImportGraph.ProtocolViolation"});
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
    if (_event_0.$ === "ImportGraph.Captured") {
      const _source_bytes_1 = _event_0["source_bytes"];
      const _node_bytes_0 = _event_0["node_bytes"];
      const _edges_1 = _event_0["edges"];
      return $ImportGraph$captured$(_edge_2, _target_3, _source_bytes_1, _node_bytes_0, _edges_1, _pending_4, _visited_4, _files_4, _read_bytes_4, _tree_bytes_5, _work_4, _skipped_tree_4, _skipped_excluded_4);
    } else if (_event_0.$ === "ImportGraph.CaptureFailed") {
      return $ImportGraph$fail$(_pending_4, _visited_4, _files_4, _read_bytes_4, _tree_bytes_5, _work_4, _skipped_tree_4, _skipped_excluded_4, {$: "ImportGraph.CaptureUnavailable"});
    } else {
      return $ImportGraph$fail$(_pending_4, _visited_4, _files_4, _read_bytes_4, _tree_bytes_5, _work_4, _skipped_tree_4, _skipped_excluded_4, {$: "ImportGraph.ProtocolViolation"});
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
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Complete"}, "pending": _pending_5, "visited": _visited_5, "files": _files_5, "read_bytes": _read_bytes_5, "tree_bytes": _tree_bytes_6, "work": _work_5, "skipped_tree": _skipped_tree_5, "skipped_excluded": _skipped_excluded_5}, "command": {$: "ImportGraph.NoCommand"}};
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
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": _reason_0}, "pending": _pending_6, "visited": _visited_6, "files": _files_6, "read_bytes": _read_bytes_6, "tree_bytes": _tree_bytes_7, "work": _work_6, "skipped_tree": _skipped_tree_6, "skipped_excluded": _skipped_excluded_6}, "command": {$: "ImportGraph.NoCommand"}};
  }
}

function $ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, _reason_0) {
  return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": _reason_0}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.UnitIncomplete", "reason": _reason_0}};
}

function $ImportGraph$root$(_target_0, _source_bytes_0, _tree_bytes_0, _edges_0) {
  return $Bool$pick$(($Nat$is_gt$(_source_bytes_0, 262144)), ($ImportGraph$fail$({$: "Nil"}, {$: "Nil"}, 0, 0, 0, 0, false, false, {$: "ImportGraph.ReadLimit"})), ($Bool$pick$(($Nat$is_gt$(_tree_bytes_0, 20480)), ($ImportGraph$fail$({$: "Nil"}, {$: "Nil"}, 0, 0, 0, 0, false, false, {$: "ImportGraph.TreeLimit"})), ($Bool$pick$(($Nat$is_gt$(($ImportGraph$edge_count$(_edges_0)), 16)), ($ImportGraph$fail$({$: "Nil"}, {$: "Nil"}, 0, 0, 0, 0, false, false, {$: "ImportGraph.WorkLimit"})), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": ($ImportGraph$with_depth$(_edges_0, 1)), "visited": {$: "Con", "head": _target_0, "tail": {$: "Nil"}}, "files": 1, "read_bytes": _source_bytes_0, "tree_bytes": _tree_bytes_0, "work": 0, "skipped_tree": false, "skipped_excluded": false}, "command": {$: "ImportGraph.NoCommand"}})))));
}

function $ImportGraph$next$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0) {
  if (_pending_0.$ === "Nil") {
    return $Bool$pick$(_skipped_tree_0, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": {$: "ImportGraph.TreeLimit"}}, "pending": {$: "Nil"}, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": true, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.UnitIncomplete", "reason": {$: "ImportGraph.TreeLimit"}}}, ($Bool$pick$(_skipped_excluded_0, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Incomplete", "reason": {$: "ImportGraph.Excluded"}}, "pending": {$: "Nil"}, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": false, "skipped_excluded": true}, "command": {$: "ImportGraph.UnitIncomplete", "reason": {$: "ImportGraph.Excluded"}}}, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Complete"}, "pending": {$: "Nil"}, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": false, "skipped_excluded": false}, "command": {$: "ImportGraph.UnitComplete"}})));
  } else {
    const _t_0 = _pending_0["head"];
    const _id_0 = _t_0["id"];
    const _depth_0 = _t_0["depth"];
    const _rest_0 = _pending_0["tail"];
    return $Bool$pick$(($Nat$is_ge$(_work_0, 128)), ($ImportGraph$fail$({$: "Con", "head": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}, "tail": _rest_0}, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.WorkLimit"})), ($Bool$pick$(($Nat$is_gt$(_depth_0, 4)), ($ImportGraph$fail$({$: "Con", "head": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}, "tail": _rest_0}, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.DepthLimit"})), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Resolving", "edge": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}}, "pending": _rest_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": nat_chk(_work_0 + 1), "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.ResolveEdge", "edge": _id_0}})));
  }
}

function $ImportGraph$resolved$(_edge_0, _target_0, _result_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0) {
  if (_result_0.$ === "ImportGraph.NotFound") {
    return $ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.Missing"});
  } else if (_result_0.$ === "ImportGraph.Many") {
    return $ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.Ambiguous"});
  } else if (_result_0.$ === "ImportGraph.Unhandled") {
    return $ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.Unsupported"});
  } else {
    return $Bool$pick$(($ImportGraph$contains$(_target_0, _visited_0)), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.NoCommand"}}, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Checking", "edge": _edge_0, "target": _target_0}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.CheckPath", "target": _target_0}});
  }
}

function $ImportGraph$checked$(_edge_0, _target_0, _allowed_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0) {
  if (!_allowed_0) {
    return {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": true}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.Excluded"}}};
  } else {
    return $Bool$pick$(($Nat$is_ge$(_files_0, 8)), ($ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.FileLimit"})), ($Bool$pick$(($Nat$is_gt$(nat_chk(_read_bytes_0 + 262144), 1572864)), ($ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.ReadLimit"})), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Capturing", "edge": _edge_0, "target": _target_0}, "pending": _pending_0, "visited": _visited_0, "files": _files_0, "read_bytes": _read_bytes_0, "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.ReadSource", "target": _target_0}})));
  }
}

function $ImportGraph$captured$(_edge_0, _target_0, _source_bytes_0, _node_bytes_0, _edges_0, _pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0) {
  const _depth_0 = _edge_0["depth"];
  return $Bool$pick$(($Nat$is_gt$(_source_bytes_0, 262144)), ($ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.ReadLimit"})), ($Bool$pick$(($Nat$is_gt$(($ImportGraph$edge_count$(_edges_0)), 16)), ($ImportGraph$fail$(_pending_0, _visited_0, _files_0, _read_bytes_0, _tree_bytes_0, _work_0, _skipped_tree_0, _skipped_excluded_0, {$: "ImportGraph.WorkLimit"})), ($Bool$pick$(($Nat$is_gt$(nat_chk(_tree_bytes_0 + _node_bytes_0), 20480)), {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": _pending_0, "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": nat_chk(_files_0 + 1), "read_bytes": nat_chk(_read_bytes_0 + _source_bytes_0), "tree_bytes": _tree_bytes_0, "work": _work_0, "skipped_tree": true, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.SkipImport", "target": _target_0, "reason": {$: "ImportGraph.TreeLimit"}}}, {$: "ImportGraph.Step", "state": {$: "ImportGraph.Graph", "phase": {$: "ImportGraph.Ready"}, "pending": ($List$append$(_pending_0, ($ImportGraph$with_depth$(_edges_0, nat_chk(_depth_0 + 1))))), "visited": {$: "Con", "head": _target_0, "tail": _visited_0}, "files": nat_chk(_files_0 + 1), "read_bytes": nat_chk(_read_bytes_0 + _source_bytes_0), "tree_bytes": nat_chk(_tree_bytes_0 + _node_bytes_0), "work": _work_0, "skipped_tree": _skipped_tree_0, "skipped_excluded": _skipped_excluded_0}, "command": {$: "ImportGraph.NoCommand"}})))));
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

function $ImportGraph$edge_count$(_edges_0) {
  if (_edges_0.$ === "Nil") {
    return 0;
  } else {
    const _rest_0 = _edges_0["tail"];
    const _x_0 = ($ImportGraph$edge_count$(_rest_0));
    return nat_chk(1 + _x_0);
  }
}

function $ImportGraph$with_depth$(_edges_0, _depth_0) {
  if (_edges_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _id_0 = _edges_0["head"];
    const _rest_0 = _edges_0["tail"];
    return {$: "Con", "head": {$: "ImportGraph.Edge", "id": _id_0, "depth": _depth_0}, "tail": ($ImportGraph$with_depth$(_rest_0, _depth_0))};
  }
}

function $Nat$is_ge$(_a_0, _b_0) {
  return $Cmp$is_ge$(cmp_new(_a_0, _b_0));
}

function $ImportGraph$contains$(_target_0, _visited_0) {
  if (_visited_0.$ === "Nil") {
    return false;
  } else {
    const _head_0 = _visited_0["head"];
    const _rest_0 = _visited_0["tail"];
    const _x_0 = ($Nat$is_eq$(_target_0, _head_0));
    const _x_1 = ($ImportGraph$contains$(_target_0, _rest_0));
    return (_x_0 || _x_1);
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

function $Cmp$is_gt$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else if (_c_0.$ === "EQ") {
    return false;
  } else {
    return true;
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

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
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

const MAX_NAT = (1n << 48n) - 1n;
const NAMESPACED_TAGS = true;
const BIGINT_NAT = false;
const nat = (value) => {
  const integer = typeof value === "number"
    ? Number.isSafeInteger(value) ? BigInt(value) : null
    : typeof value === "bigint" ? value : null;
  if (integer === null || integer < 0n || integer > MAX_NAT) {
    throw new TypeError("expected Bend Nat within the immediate range");
  }
  return BIGINT_NAT ? integer : Number(integer);
};
const normalize = (value) => {
  if (typeof value === "number" || typeof value === "bigint") return nat(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === "$" && !NAMESPACED_TAGS && typeof item === "string"
        ? item.replace(/^ImportGraph\./, "") : normalize(item)]));
  }
  return value;
};
export const bendImportGraphInitial = () => run_loop($ImportGraph$initial$());
export const bendImportGraphStep = (state, event) =>
  run_loop($ImportGraph$step$(state, normalize(event)));
