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

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_value_0) {
  const _high_0 = _value_0["high"];
  return _high_0;
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_value_0) {
  const _low_0 = _value_0["low"];
  return _low_0;
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$(_value_0) {
  return $Bool$and$(($Nat$is_eq$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_value_0)), 0)), ($Nat$is_eq$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_value_0)), 0)));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058greater$(_a_0, _b_0) {
  const _x_0 = ($Nat$is_gt$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_a_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_b_0))));
  const _x_1 = ($Bool$and$(($Nat$is_eq$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_a_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_b_0)))), ($Nat$is_gt$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_a_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_b_0))))));
  return (_x_0 || _x_1);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058ge$(_a_0, _b_0) {
  return $Bool$not$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058greater$(_b_0, _a_0)));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_parts$(_ah_0, _bh_0, _lo_0) {
  const _x_0 = nat_chk(_ah_0 + _bh_0);
  const _x_1 = ($Nat$div$(_lo_0, 268435456));
  return {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": nat_chk(_x_0 + _x_1), "low": ($Nat$mod$(_lo_0, 268435456))};
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add$(_a_0, _b_0) {
  const _ah_0 = _a_0["high"];
  const _al_0 = _a_0["low"];
  const _bh_0 = _b_0["high"];
  const _bl_0 = _b_0["low"];
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_parts$(_ah_0, _bh_0, nat_chk(_al_0 + _bl_0));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sub_parts$(_ah_0, _al_0, _bh_0, _bl_0) {
  const _x_0 = (_ah_0 < _bh_0 ? 0 : _ah_0 - _bh_0);
  const _x_1 = ($Bool$pick$((_al_0 < _bl_0), 1, 0));
  const _x_2 = nat_chk(_al_0 + 268435456);
  return {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": (_x_0 < _x_1 ? 0 : _x_0 - _x_1), "low": ($Nat$mod$((_x_2 < _bl_0 ? 0 : _x_2 - _bl_0), 268435456))};
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sub$(_a_0, _b_0) {
  const _ah_0 = _a_0["high"];
  const _al_0 = _a_0["low"];
  const _bh_0 = _b_0["high"];
  const _bl_0 = _b_0["low"];
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sub_parts$(_ah_0, _al_0, _bh_0, _bl_0);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_value_0) {
  const _high_0 = _value_0["high"];
  const _low_0 = _value_0["low"];
  const _x_0 = nat_chk(_high_0 * 2);
  const _x_1 = ($Nat$div$(_low_0, 134217728));
  return {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": nat_chk(_x_0 + _x_1), "low": ($Nat$mod$(nat_chk(_low_0 * 2), 268435456))};
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr$(_value_0) {
  const _high_0 = _value_0["high"];
  const _low_0 = _value_0["low"];
  const _x_0 = ($Nat$mod$(_high_0, 2));
  const _x_1 = ($Nat$div$(_low_0, 2));
  const _x_2 = nat_chk(_x_0 * 134217728);
  return {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": ($Nat$div$(_high_0, 2)), "low": nat_chk(_x_1 + _x_2)};
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sticky$(_value_0, _bit_0) {
  const _high_0 = _value_0["high"];
  const _low_0 = _value_0["low"];
  const _x_0 = ($Bool$pick$(($Bool$and$(_bit_0, ($Nat$is_eq$(($Nat$mod$(_low_0, 2)), 0)))), 1, 0));
  return {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": _high_0, "low": nat_chk(_low_0 + _x_0)};
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr_sticky$(_value_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sticky$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr$(_value_0)), ($Nat$is_eq$(($Nat$mod$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_value_0)), 2)), 1)));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shift_right$($0, $1) {
  for (;;) {
    {
      const _count_0 = $0;
      const _value_0 = $1;
      if (_count_0 === 0) {
        return _value_0;
      } else {
        const _rest_0 = (_count_0 - 1);
        $0 = _rest_0;
        $1 = ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr_sticky$(_value_0));
        continue;
      }
    }
  }
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058bounded_shift$(_count_0, _value_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shift_right$(($Bool$pick$(($Nat$is_gt$(_count_0, 56)), 56, _count_0)), _value_0);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize_step$(_done_0, _value_0, _exponent_0, _rest_0) {
  if (_done_0) {
    return {$: "../../packages/monkey-business-bend/Numeric.Value", "mantissa": _value_0, "exponent": _exponent_0};
  } else {
    return run_tail(_rest_0(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_value_0))), (_exponent_0 < 1 ? 0 : _exponent_0 - 1));
  }
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize$(_fuel_0, _value_0, _exponent_0) {
  if (_fuel_0 === 0) {
    return {$: "../../packages/monkey-business-bend/Numeric.Value", "mantissa": _value_0, "exponent": _exponent_0};
  } else {
    const _rest_0 = (_fuel_0 - 1);
    const _x_0 = ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$(_value_0));
    const _x_1 = ($Nat$is_ge$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_value_0)), 16777216));
    return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize_step$((_x_0 || _x_1), _value_0, _exponent_0, run_clo((_x_2) => {
  return run_clo((_x_3) => {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize$(_rest_0, _x_2, _x_3);
});
}));
  }
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decoded$(_high_0, _low_0) {
  const _x_0 = ($Nat$mod$(_high_0, 1048576));
  const _x_1 = nat_chk(_x_0 * 16);
  const _x_2 = ($Nat$div$(_low_0, 268435456));
  const _x_3 = nat_chk(_x_1 + _x_2);
  const _x_4 = ($Bool$pick$(($Nat$is_eq$(($Nat$div$(_high_0, 1048576)), 0)), 0, 16777216));
  const _x_5 = ($Bool$pick$(($Nat$is_eq$(($Nat$div$(_high_0, 1048576)), 0)), 1, ($Nat$div$(_high_0, 1048576))));
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize$(52, {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": nat_chk(_x_3 + _x_4), "low": ($Nat$mod$(_low_0, 268435456))}, nat_chk(2048 + _x_5));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decode$(_words_0) {
  const _high_0 = _words_0["high"];
  const _low_0 = _words_0["low"];
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decoded$(_high_0, _low_0);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058encoded$(_mantissa_0, _exponent_0) {
  const _x_0 = ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_mantissa_0));
  const _x_1 = ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$(_mantissa_0));
  const _x_2 = (_x_0 < 16777216);
  const _x_3 = ($Bool$pick$((_x_1 || _x_2), 0, (_exponent_0 < 2048 ? 0 : _exponent_0 - 2048)));
  const _x_4 = nat_chk(_x_3 * 1048576);
  const _x_5 = ($Nat$mod$(($Nat$div$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_mantissa_0)), 16)), 1048576));
  const _x_6 = ($Nat$mod$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_mantissa_0)), 16));
  const _x_7 = nat_chk(_x_6 * 268435456);
  const _x_8 = ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_mantissa_0));
  return {$: "../../packages/monkey-business-bend/Numeric.Words", "high": nat_chk(_x_4 + _x_5), "low": nat_chk(_x_7 + _x_8)};
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058increment$(_value_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add$(_value_0, {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": 0, "low": 1});
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058rounded_parts$(_mantissa_0, _exponent_0) {
  const _x_0 = ($Bool$pick$(($Nat$is_ge$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_mantissa_0)), 33554432)), 1, 0));
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058encoded$(($Bool$pick$(($Nat$is_ge$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_mantissa_0)), 33554432)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr$(_mantissa_0)), _mantissa_0)), nat_chk(_exponent_0 + _x_0));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058rounded$(_value_0, _exponent_0) {
  const _base_0 = ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr$(_value_0))))));
  const _x_0 = ($Nat$is_gt$(($Nat$mod$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_value_0)), 8)), 4));
  const _x_1 = ($Bool$and$(($Nat$is_eq$(($Nat$mod$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_value_0)), 8)), 4)), ($Nat$is_eq$(($Nat$mod$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$(_base_0)), 2)), 1))));
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058rounded_parts$(($Bool$pick$((_x_0 || _x_1), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058increment$(_base_0)), _base_0)), _exponent_0);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058round_finite$(_value_0, _exponent_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058rounded$(($Bool$pick$((_exponent_0 < 2049), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058bounded_shift$((2049 < _exponent_0 ? 0 : 2049 - _exponent_0), _value_0)), _value_0)), ($Bool$pick$((_exponent_0 < 2049), 2049, _exponent_0)));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_aligned$(_sum_0, _exponent_0) {
  const _x_0 = ($Bool$pick$(($Nat$is_ge$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_sum_0)), 268435456)), 1, 0));
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058round_finite$(($Bool$pick$(($Nat$is_ge$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$(_sum_0)), 268435456)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr_sticky$(_sum_0)), _sum_0)), nat_chk(_exponent_0 + _x_0));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_ordered$(_a_0, _ae_0, _b_0, _be_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_aligned$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_a_0)))))), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058bounded_shift$((_ae_0 < _be_0 ? 0 : _ae_0 - _be_0), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_b_0)))))))))), _ae_0);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_values$(_a_0, _b_0) {
  const _am_0 = _a_0["mantissa"];
  const _ae_0 = _a_0["exponent"];
  const _bm_0 = _b_0["mantissa"];
  const _be_0 = _b_0["exponent"];
  return $Bool$pick$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$(_am_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058round_finite$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_bm_0)))))), _be_0)), ($Bool$pick$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$(_bm_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058round_finite$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_am_0)))))), _ae_0)), ($Bool$pick$(($Nat$is_ge$(_ae_0, _be_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_ordered$(_am_0, _ae_0, _bm_0, _be_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_ordered$(_bm_0, _be_0, _am_0, _ae_0)))))));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058plus$(_a_0, _b_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_values$(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decode$(_a_0)), run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decode$(_b_0)));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_choose$(_take_0, _remainder_0, _denominator_0, _quotient_0, _exponent_0, _rest_0) {
  if (_take_0) {
    return run_tail(_rest_0(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sub$(_remainder_0, _denominator_0)))(_denominator_0)(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_quotient_0)), {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": 0, "low": 1}))), _exponent_0);
  } else {
    return run_tail(_rest_0(_remainder_0)(_denominator_0)(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_quotient_0))), _exponent_0);
  }
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_loop$(_fuel_0, _remainder_0, _denominator_0, _quotient_0, _exponent_0) {
  if (_fuel_0 === 0) {
    return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058round_finite$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sticky$(_quotient_0, ($Bool$not$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$(_remainder_0)))))), _exponent_0);
  } else {
    const _rest_0 = (_fuel_0 - 1);
    return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_choose$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058ge$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_remainder_0)), _denominator_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_remainder_0)), _denominator_0, _quotient_0, _exponent_0, run_clo((_x_0) => {
  return run_clo((_x_1) => {
  return run_clo((_x_2) => {
  return run_clo((_x_3) => {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_loop$(_rest_0, _x_0, _x_1, _x_2, _x_3);
});
});
});
}));
  }
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_start$(_numerator_0, _denominator_0, _exponent_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_loop$(55, ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sub$(_numerator_0, _denominator_0)), _denominator_0, {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": 0, "low": 1}, _exponent_0);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_values$(_a_0, _b_0) {
  const _am_0 = _a_0["mantissa"];
  const _ae_0 = _a_0["exponent"];
  const _bm_0 = _b_0["mantissa"];
  const _be_0 = _b_0["exponent"];
  const _x_0 = nat_chk(_ae_0 + 3071);
  const _x_1 = (_x_0 < _be_0 ? 0 : _x_0 - _be_0);
  const _x_2 = ($Bool$pick$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058greater$(_bm_0, _am_0)), 1, 0));
  return $Bool$pick$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$(_am_0)), {$: "../../packages/monkey-business-bend/Numeric.Words", "high": 0, "low": 0}, run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_start$(($Bool$pick$(($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058greater$(_bm_0, _am_0)), ($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$(_am_0)), _am_0)), _bm_0, (_x_1 < _x_2 ? 0 : _x_1 - _x_2))));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide$(_a_0, _b_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_values$(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decode$(_a_0)), run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decode$(_b_0)));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058ordered$(_left_0, _right_0) {
  const _lh_0 = _left_0["high"];
  const _ll_0 = _left_0["low"];
  const _rh_0 = _right_0["high"];
  const _rl_0 = _right_0["low"];
  const _x_0 = (_lh_0 < _rh_0);
  const _x_1 = ($Bool$and$(($Nat$is_eq$(_lh_0, _rh_0)), (_ll_0 < _rl_0)));
  return (_x_0 || _x_1);
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058integer_words$(_value_0) {
  const _mantissa_0 = _value_0["mantissa"];
  const _exponent_0 = _value_0["exponent"];
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058encoded$(_mantissa_0, (_exponent_0 < 32 ? 0 : _exponent_0 - 32));
}

function $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058draw$(_word_0) {
  return $$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058integer_words$(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize$(52, {$: "../../packages/monkey-business-bend/Numeric.Limb", "high": ($Nat$div$(_word_0, 268435456)), "low": ($Nat$mod$(_word_0, 268435456))}, 3123)));
}

function $refined_weights$() {
  return {$: "Con", "head": {$: "../../packages/monkey-business-bend/Numeric.Words", "high": 0, "low": 0}, "tail": {$: "Con", "head": {$: "../../packages/monkey-business-bend/Numeric.Words", "high": 1071644672, "low": 0}, "tail": {$: "Con", "head": {$: "../../packages/monkey-business-bend/Numeric.Words", "high": 1072693248, "low": 0}, "tail": {$: "Con", "head": {$: "../../packages/monkey-business-bend/Numeric.Words", "high": 0, "low": 0}, "tail": {$: "Con", "head": {$: "../../packages/monkey-business-bend/Numeric.Words", "high": 0, "low": 0}, "tail": {$: "Con", "head": {$: "../../packages/monkey-business-bend/Numeric.Words", "high": 0, "low": 0}, "tail": {$: "Nil"}}}}}}};
}

function $translate$(_ability_0) {
  if (_ability_0.$ === "DependencyAcceleration") {
    return {$: "Unsupported"};
  } else if (_ability_0.$ === "FutureBatching") {
    return {$: "Unsupported"};
  } else if (_ability_0.$ === "LaunchPacing") {
    return {$: "Unsupported"};
  } else if (_ability_0.$ === "OutputLatency") {
    const _outcome_0 = _ability_0["outcome"];
    const _delay_0 = _ability_0["delay"];
    const _lease_0 = _ability_0["lease"];
    return {$: "OutputTiming", "outcome": _outcome_0, "delay": _delay_0, "lease": _lease_0};
  } else {
    return {$: "FutureReview", "delay": 3200, "weights": ($refined_weights$())};
  }
}

function $Bool$and$(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Nat$is_eq$(_a_0, _b_0) {
  return $Cmp$is_eq$(cmp_new(_a_0, _b_0));
}

function $Nat$is_gt$(_a_0, _b_0) {
  return $Cmp$is_gt$(cmp_new(_a_0, _b_0));
}

function $Bool$not$(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $Nat$div$(_a_0, _b_0) {
  return $Pair$fst$(nat_divmod(_a_0, _b_0));
}

function $Nat$mod$(_a_0, _b_0) {
  return $Pair$snd$(nat_divmod(_a_0, _b_0));
}

function $Bool$pick$(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
}

function $Nat$is_ge$(_a_0, _b_0) {
  return $Cmp$is_ge$(cmp_new(_a_0, _b_0));
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

function $Pair$fst$(_p_0) {
  const _a_0 = _p_0["fst"];
  return _a_0;
}

function $Pair$snd$(_p_0) {
  const _b_0 = _p_0["snd"];
  return _b_0;
}

function $Cmp$is_ge$(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}

function $0m0(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "../../packages/monkey-business-bend/Numeric.Limb": at = at[key] = {...v, "high": nat_host(v["high"]), "low": nat_host(v["low"])}; return top[0];
      default: throw "bend: ../../packages/monkey-business-bend/Numeric.Limb has no tag " + v?.$ + " (its tags: ../../packages/monkey-business-bend/Numeric.Limb); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m1(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "../../packages/monkey-business-bend/Numeric.Limb": at = at[key] = {...v, "high": BigInt(v["high"]), "low": BigInt(v["low"])}; return top[0];
      default: throw "bend: ../../packages/monkey-business-bend/Numeric.Limb has no tag " + v?.$ + " (its tags: ../../packages/monkey-business-bend/Numeric.Limb); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m2(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "../../packages/monkey-business-bend/Numeric.Value": at = at[key] = {...v, "mantissa": $0m0(v["mantissa"]), "exponent": nat_host(v["exponent"])}; return top[0];
      default: throw "bend: ../../packages/monkey-business-bend/Numeric.Value has no tag " + v?.$ + " (its tags: ../../packages/monkey-business-bend/Numeric.Value); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m3(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "../../packages/monkey-business-bend/Numeric.Value": at = at[key] = {...v, "mantissa": $0m1(v["mantissa"]), "exponent": BigInt(v["exponent"])}; return top[0];
      default: throw "bend: ../../packages/monkey-business-bend/Numeric.Value has no tag " + v?.$ + " (its tags: ../../packages/monkey-business-bend/Numeric.Value); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m4(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "../../packages/monkey-business-bend/Numeric.Words": at = at[key] = {...v, "high": nat_host(v["high"]), "low": nat_host(v["low"])}; return top[0];
      default: throw "bend: ../../packages/monkey-business-bend/Numeric.Words has no tag " + v?.$ + " (its tags: ../../packages/monkey-business-bend/Numeric.Words); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m5(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "../../packages/monkey-business-bend/Numeric.Words": at = at[key] = {...v, "high": BigInt(v["high"]), "low": BigInt(v["low"])}; return top[0];
      default: throw "bend: ../../packages/monkey-business-bend/Numeric.Words has no tag " + v?.$ + " (its tags: ../../packages/monkey-business-bend/Numeric.Words); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m6(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Nil": at[key] = v; return top[0];
      case "Con": at = at[key] = {...v, "head": $0m5(v["head"])}; key = "tail"; v = v[key]; continue;
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
      case "DependencyAcceleration": at[key] = v; return top[0];
      case "FutureBatching": at[key] = v; return top[0];
      case "LaunchPacing": at[key] = v; return top[0];
      case "OutputLatency": at = at[key] = {...v, "delay": nat_host(v["delay"]), "lease": nat_host(v["lease"])}; return top[0];
      case "Refinement": at[key] = v; return top[0];
      default: throw "bend: Ability has no tag " + v?.$ + " (its tags: DependencyAcceleration, FutureBatching, LaunchPacing, OutputLatency, Refinement); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m8(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "DependencyAcceleration": at[key] = v; return top[0];
      case "FutureBatching": at[key] = v; return top[0];
      case "LaunchPacing": at[key] = v; return top[0];
      case "OutputLatency": at = at[key] = {...v, "delay": BigInt(v["delay"]), "lease": BigInt(v["lease"])}; return top[0];
      case "Refinement": at[key] = v; return top[0];
      default: throw "bend: Ability has no tag " + v?.$ + " (its tags: DependencyAcceleration, FutureBatching, LaunchPacing, OutputLatency, Refinement); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}

function $0m9(v) {
  const top = [v];
  for (let at = top, key = 0;;) {
    switch (v.$) {
      case "Unsupported": at[key] = v; return top[0];
      case "OutputTiming": at = at[key] = {...v, "delay": BigInt(v["delay"]), "lease": BigInt(v["lease"])}; return top[0];
      case "FutureReview": at = at[key] = {...v, "delay": BigInt(v["delay"]), "weights": $0m6(v["weights"])}; return top[0];
      default: throw "bend: Action has no tag " + v?.$ + " (its tags: Unsupported, OutputTiming, FutureReview); a tag names its constructor as the"
      + " loading file sees it, which a later version will make the same"
      + " everywhere (#1105)";
    }
  }
}
export default {
  "../../packages/monkey-business-bend/Numeric.high": run_lib((a0) => { const r = BigInt(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058high$($0m0(a0)))); $0m1(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.low": run_lib((a0) => { const r = BigInt(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058low$($0m0(a0)))); $0m1(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.zero": run_lib((a0) => { const r = (run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058zero$($0m0(a0)))); $0m1(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.greater": run_lib((a0, a1) => { const r = (run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058greater$($0m0(a0), $0m0(a1)))); $0m1(a0); $0m1(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.ge": run_lib((a0, a1) => { const r = (run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058ge$($0m0(a0), $0m0(a1)))); $0m1(a0); $0m1(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.add_parts": run_lib((a0, a1, a2) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_parts$(nat_host(a0), nat_host(a1), nat_host(a2)))); BigInt(a0); BigInt(a1); BigInt(a2); return r; }, 3),
  "../../packages/monkey-business-bend/Numeric.add": run_lib((a0, a1) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add$($0m0(a0), $0m0(a1)))); $0m1(a0); $0m1(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.sub_parts": run_lib((a0, a1, a2, a3) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sub_parts$(nat_host(a0), nat_host(a1), nat_host(a2), nat_host(a3)))); BigInt(a0); BigInt(a1); BigInt(a2); BigInt(a3); return r; }, 4),
  "../../packages/monkey-business-bend/Numeric.sub": run_lib((a0, a1) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sub$($0m0(a0), $0m0(a1)))); $0m1(a0); $0m1(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.shl": run_lib((a0) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shl$($0m0(a0)))); $0m1(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.shr": run_lib((a0) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr$($0m0(a0)))); $0m1(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.sticky": run_lib((a0, a1) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058sticky$($0m0(a0), (a1)))); $0m1(a0); (a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.shr_sticky": run_lib((a0) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shr_sticky$($0m0(a0)))); $0m1(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.shift_right": run_lib((a0, a1) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058shift_right$(nat_host(a0), $0m0(a1)))); BigInt(a0); $0m1(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.bounded_shift": run_lib((a0, a1) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058bounded_shift$(nat_host(a0), $0m0(a1)))); BigInt(a0); $0m1(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.normalize_step": run_lib((a0, a1, a2, a3) => { const r = $0m3(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize_step$((a0), $0m0(a1), nat_host(a2), ((f) => (x) => ((f) => (x) => $0m2(f(BigInt(x))))(f($0m1(x))))(a3)))); (a0); $0m1(a1); BigInt(a2); ((f) => (x) => ((f) => (x) => $0m3(f(nat_host(x))))(f($0m0(x))))(a3); return r; }, 4),
  "../../packages/monkey-business-bend/Numeric.normalize": run_lib((a0, a1, a2) => { const r = $0m3(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058normalize$(nat_host(a0), $0m0(a1), nat_host(a2)))); BigInt(a0); $0m1(a1); BigInt(a2); return r; }, 3),
  "../../packages/monkey-business-bend/Numeric.decoded": run_lib((a0, a1) => { const r = $0m3(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decoded$(nat_host(a0), nat_host(a1)))); BigInt(a0); BigInt(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.decode": run_lib((a0) => { const r = $0m3(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058decode$($0m4(a0)))); $0m5(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.encoded": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058encoded$($0m0(a0), nat_host(a1)))); $0m1(a0); BigInt(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.increment": run_lib((a0) => { const r = $0m1(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058increment$($0m0(a0)))); $0m1(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.rounded_parts": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058rounded_parts$($0m0(a0), nat_host(a1)))); $0m1(a0); BigInt(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.rounded": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058rounded$($0m0(a0), nat_host(a1)))); $0m1(a0); BigInt(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.round_finite": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058round_finite$($0m0(a0), nat_host(a1)))); $0m1(a0); BigInt(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.add_aligned": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_aligned$($0m0(a0), nat_host(a1)))); $0m1(a0); BigInt(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.add_ordered": run_lib((a0, a1, a2, a3) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_ordered$($0m0(a0), nat_host(a1), $0m0(a2), nat_host(a3)))); $0m1(a0); BigInt(a1); $0m1(a2); BigInt(a3); return r; }, 4),
  "../../packages/monkey-business-bend/Numeric.add_values": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058add_values$($0m2(a0), $0m2(a1)))); $0m3(a0); $0m3(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.plus": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058plus$($0m4(a0), $0m4(a1)))); $0m5(a0); $0m5(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.divide_choose": run_lib((a0, a1, a2, a3, a4, a5) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_choose$((a0), $0m0(a1), $0m0(a2), $0m0(a3), nat_host(a4), ((f) => (x) => ((f) => (x) => ((f) => (x) => ((f) => (x) => $0m4(f(BigInt(x))))(f($0m1(x))))(f($0m1(x))))(f($0m1(x))))(a5)))); (a0); $0m1(a1); $0m1(a2); $0m1(a3); BigInt(a4); ((f) => (x) => ((f) => (x) => ((f) => (x) => ((f) => (x) => $0m5(f(nat_host(x))))(f($0m0(x))))(f($0m0(x))))(f($0m0(x))))(a5); return r; }, 6),
  "../../packages/monkey-business-bend/Numeric.divide_loop": run_lib((a0, a1, a2, a3, a4) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_loop$(nat_host(a0), $0m0(a1), $0m0(a2), $0m0(a3), nat_host(a4)))); BigInt(a0); $0m1(a1); $0m1(a2); $0m1(a3); BigInt(a4); return r; }, 5),
  "../../packages/monkey-business-bend/Numeric.divide_start": run_lib((a0, a1, a2) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_start$($0m0(a0), $0m0(a1), nat_host(a2)))); $0m1(a0); $0m1(a1); BigInt(a2); return r; }, 3),
  "../../packages/monkey-business-bend/Numeric.divide_values": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide_values$($0m2(a0), $0m2(a1)))); $0m3(a0); $0m3(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.divide": run_lib((a0, a1) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058divide$($0m4(a0), $0m4(a1)))); $0m5(a0); $0m5(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.ordered": run_lib((a0, a1) => { const r = (run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058ordered$($0m4(a0), $0m4(a1)))); $0m5(a0); $0m5(a1); return r; }, 2),
  "../../packages/monkey-business-bend/Numeric.integer_words": run_lib((a0) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058integer_words$($0m2(a0)))); $0m3(a0); return r; }, 1),
  "../../packages/monkey-business-bend/Numeric.draw": run_lib((a0) => { const r = $0m5(run_loop($$$$047$$$047packages$047monkey$045business$045bend$047Numeric$058draw$(nat_host(a0)))); BigInt(a0); return r; }, 1),
  "refined_weights": run_lib(() => { const r = $0m6(run_loop($refined_weights$()));  return r; }, 0),
  "translate": run_lib((a0) => { const r = $0m9(run_loop($translate$($0m7(a0)))); $0m8(a0); return r; }, 1),
};
