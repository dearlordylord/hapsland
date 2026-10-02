import Base
import ./core.bend as C

type CurrentTrace is Data:
  CurrentTrace{name: String, accepted: Nat,
    round: Nat, native_fresh: Bool,
    spent: Nat}

# Actual native start and close times enter only this output monitor, never C.run.
def observe(name: String, +events: List<&2, C.TraceEvent>, native_start: Nat, closed_at: Nat) -> CurrentTrace:
  +current = C.run(events, C.Current{}, C.initial())
  CurrentTrace{name, C.count(current), C.round(current),
    Nat.is_gt(native_start, closed_at), C.spent(current)}

def baseline() -> List<&2, C.TraceEvent>:
  [C.Pre{1n,1n,1n,1n,20n,1n},C.NativeStart{1n,2n},C.NativeComplete{1n,3n},C.Post{1n,1n,1n,4n}]

def main() -> List<&2, CurrentTrace>:
  +base = baseline()
  [observe("normal",base,2n,0n),
   observe("missing-pre",[C.NativeStart{2n,1n},C.NativeComplete{2n,2n},C.Post{1n,1n,2n,3n}],1n,0n),
   observe("deadline-expiry",[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,3n}],2n,0n),
   observe("before-expiry",[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,2n}],2n,0n),
   observe("expired",[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,4n}],2n,0n),
   observe("released",[C.Pre{1n,1n,2n,1n,10n,1n},C.Release{2n},C.Post{1n,1n,2n,4n}],2n,0n),
   observe("fresh-permitted-after-close",List.append(&2,C.TraceEvent,base,[C.RoundClose{5n},C.Pre{1n,1n,2n,6n,15n,6n},C.NativeStart{2n,7n},C.NativeComplete{2n,8n},C.Post{1n,1n,2n,9n}]),7n,5n),
   observe("host-order-premise-violated",List.append(&2,C.TraceEvent,base,[C.RoundClose{5n},C.Pre{1n,1n,2n,6n,15n,6n},C.NativeStart{2n,2n},C.NativeComplete{2n,3n},C.Post{1n,1n,2n,8n}]),2n,5n),
   observe("duplicate",List.append(&2,C.TraceEvent,base,[C.Post{1n,1n,1n,5n}]),2n,0n),
   observe("wrong-agent",[C.Pre{1n,1n,2n,1n,10n,1n},C.Post{2n,1n,2n,4n}],2n,0n),
   observe("wrong-lifetime",[C.Pre{1n,1n,2n,1n,10n,1n},C.Post{1n,2n,2n,4n}],2n,0n),
   observe("restart-old-post",List.append(&2,C.TraceEvent,base,[C.Restart{2n,5n},C.Post{1n,1n,2n,6n}]),2n,5n),
   observe("restart-fresh",List.append(&2,C.TraceEvent,base,[C.Restart{2n,5n},C.Pre{1n,2n,2n,6n,15n,6n},C.Post{1n,2n,2n,8n}]),7n,5n),
   observe("capacity-third",[C.Pre{1n,1n,1n,1n,20n,1n},C.Pre{1n,1n,2n,1n,20n,1n},C.Pre{1n,1n,3n,1n,20n,1n},C.Post{1n,1n,3n,4n}],2n,0n),
   observe("pre-window-exclusive",[C.Pre{1n,1n,2n,1n,20n,6n},C.Post{1n,1n,2n,7n}],2n,0n),
   observe("pre-only",[C.Pre{1n,1n,2n,1n,20n,1n}],2n,0n),
   observe("no-minted-continuation",List.append(&2,C.TraceEvent,base,[C.Continue{},C.RoundClose{5n},C.Post{1n,1n,2n,6n}]),6n,5n)]
