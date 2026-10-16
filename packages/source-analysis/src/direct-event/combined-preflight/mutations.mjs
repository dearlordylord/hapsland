// Temporary combined-preflight migration counterexamples for both finite and kernel checks.
// Delete at whole Preparation acceptance under LAWS.bend cleanup.
const mutations = [
  [
    "admits_1025",
    "Nat.is_le(Nat.add(types, functions), 1024n)",
    "Nat.is_le(Nat.add(types, functions), 1025n)",
    "typescript_exact",
    "typescript",
    [true, 1025, [], true, false, false]
  ],
  [
    "missing_type_bound_accepted",
    "Bool.or(Nat.is_eq(types, 0n), bound)",
    "True{}",
    "typescript_exact",
    "typescript",
    [true, 1, [], false, false, false]
  ],
  [
    "raw_path_not_measured",
    "M.MeasureRawPath{}",
    "M.Push{0n}",
    "typescript_exact",
    "typescript",
    [true, 0, [1], false, false, false]
  ],
  [
    "final_operand_order_changed",
    "[M.ReadTypeBytes{}, M.Swap{}, M.Add{}]",
    "[M.ReadTypeBytes{}, M.Add{}, M.Swap{}]",
    "typescript_exact",
    "typescript",
    [true, 1, [], true, false, false]
  ],
  [
    "go_inspection_skipped",
    "case False{}: AwaitGo{0n}",
    "case False{}: Completed{M.Unavailable{}}",
    "go_exact",
    "go",
    [false, true]
  ],
  [
    "wrong_group_ack_accepted",
    "acknowledge_group(Nat.is_eq(request, actual), remaining, next, request)",
    "acknowledge_group(True{}, remaining, next, request)",
    "resume_group_exact"
  ],
  ["group_successor_lost", "case []: Nat.add(request, 1n)", "case []: request", "resume_group_exact"]
]
mutations.push(
  [
    "passthrough_bound_lost",
    "def passthrough(bound: Bool) -> Step:\n  match bound:\n    case True{}: Completed{M.RetainBound{}}",
    "def passthrough(bound: Bool) -> Step:\n  match bound:\n    case True{}: Completed{M.Unavailable{}}",
    "passthrough_exact",
    "passthrough",
    [true]
  ],
  [
    "wrong_sites_reply_accepted",
    "accepted_sites(Nat.is_eq(request, actual), slot, functions, count, sites, request)",
    "accepted_sites(True{}, slot, functions, count, sites, request)",
    "scalar_protocol_exact"
  ]
)
mutations.push([
  "advance_request_reset",
  "case Imports{count, empty}: AwaitRootImports{count, empty, request}",
  "case Imports{count, empty}: AwaitRootImports{count, empty, 0n}",
  "scalar_protocol_exact"
])
const proofLocations = {
  admits_1025: "Laws.typescript_exact",
  missing_type_bound_accepted: "admitted_trace",
  raw_path_not_measured: "sites_trace",
  final_operand_order_changed: "functions_trace",
  go_inspection_skipped: "Laws.go_exact",
  wrong_group_ack_accepted: "Laws.resume_group_exact",
  group_successor_lost: "drain_same",
  passthrough_bound_lost: "Laws.passthrough_exact",
  wrong_sites_reply_accepted: "resume_same",
  advance_request_reset: "phase_same"
}
export const preflightMutations = mutations.map(([name, from, to, law, entry, args]) => [
  name,
  from,
  to,
  law,
  entry,
  args,
  proofLocations[name]
])
