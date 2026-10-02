import Base
import ./core.bend as C

type Comparison is Data:
  Comparison{name: String, current_accepted: Nat, receipt_accepted: Nat,
    current_round: Nat, receipt_round: Nat, native_fresh: Bool,
    current_spent: Nat, receipt_spent: Nat}

# Actual native start and close times enter only this output monitor, never C.run.
def compare(name: String, +events: List<&2, C.TraceEvent>, native_start: Nat, closed_at: Nat) -> Comparison:
  +current = C.run(events, C.Current{}, C.initial())
  +receipt = C.run(events, C.Receipt{}, C.initial())
  Comparison{name, C.count(current), C.count(receipt), C.round(current), C.round(receipt),
    Nat.is_gt(native_start, closed_at), C.spent(current), C.spent(receipt)}

def baseline() -> List<&2, C.TraceEvent>:
  [C.Pre{1n,1n,1n,1n,20n,1n},C.NativeStart{1n,2n},C.NativeComplete{1n,3n},C.Post{1n,1n,1n,4n}]

def main() -> List<&2, Comparison>:
  +base = baseline()
  [compare("normal",base,2n,0n),
   compare("missing-pre",[C.NativeStart{2n,1n},C.NativeComplete{2n,2n},C.Post{1n,1n,2n,3n}],1n,0n),
   compare("deadline-expiry",[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,3n}],2n,0n),
   compare("before-expiry",[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,2n}],2n,0n),
   compare("expired",[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,4n}],2n,0n),
   compare("released",[C.Pre{1n,1n,2n,1n,10n,1n},C.Release{2n},C.Post{1n,1n,2n,4n}],2n,0n),
   compare("old-unseen-after-close",List.append(&2,C.TraceEvent,base,[C.NativeStart{2n,2n},C.NativeComplete{2n,3n},C.RoundClose{5n},C.Post{1n,1n,2n,8n}]),2n,5n),
   compare("fresh-no-pre-after-close",List.append(&2,C.TraceEvent,base,[C.RoundClose{5n},C.NativeStart{2n,6n},C.NativeComplete{2n,7n},C.Post{1n,1n,2n,8n}]),6n,5n),
   compare("fresh-permitted-after-close",List.append(&2,C.TraceEvent,base,[C.RoundClose{5n},C.Pre{1n,1n,2n,6n,15n,6n},C.NativeStart{2n,7n},C.NativeComplete{2n,8n},C.Post{1n,1n,2n,9n}]),7n,5n),
   compare("host-order-premise-violated",List.append(&2,C.TraceEvent,base,[C.RoundClose{5n},C.Pre{1n,1n,2n,6n,15n,6n},C.NativeStart{2n,2n},C.NativeComplete{2n,3n},C.Post{1n,1n,2n,8n}]),2n,5n),
   compare("restart-restamped-unseen-old",List.append(&2,C.TraceEvent,base,[C.Restart{2n,5n},C.NativeStart{2n,2n},C.NativeComplete{2n,3n},C.Post{1n,2n,2n,8n}]),2n,5n),
   compare("duplicate",List.append(&2,C.TraceEvent,base,[C.Post{1n,1n,1n,5n}]),2n,0n),
   compare("wrong-agent",[C.Pre{1n,1n,2n,1n,10n,1n},C.Post{2n,1n,2n,4n}],2n,0n),
   compare("wrong-lifetime",[C.Pre{1n,1n,2n,1n,10n,1n},C.Post{1n,2n,2n,4n}],2n,0n),
   compare("restart-old-post",List.append(&2,C.TraceEvent,base,[C.Restart{2n,5n},C.Post{1n,1n,2n,6n}]),2n,5n),
   compare("restart-fresh",List.append(&2,C.TraceEvent,base,[C.Restart{2n,5n},C.Pre{1n,2n,2n,6n,15n,6n},C.Post{1n,2n,2n,8n}]),7n,5n),
   compare("capacity-third",[C.Pre{1n,1n,1n,1n,20n,1n},C.Pre{1n,1n,2n,1n,20n,1n},C.Pre{1n,1n,3n,1n,20n,1n},C.Post{1n,1n,3n,4n}],2n,0n),
   compare("pre-window-exclusive",[C.Pre{1n,1n,2n,1n,20n,6n},C.Post{1n,1n,2n,7n}],2n,0n),
   compare("pre-only",[C.Pre{1n,1n,2n,1n,20n,1n}],2n,0n),
   compare("no-minted-continuation",List.append(&2,C.TraceEvent,base,[C.Continue{},C.RoundClose{5n},C.Post{1n,1n,2n,6n}]),6n,5n)]
