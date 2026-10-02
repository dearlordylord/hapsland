import Base
import ../core.bend as C
import ../traces.bend as T

# The monitor's native times are never passed to either admission reducer.
def main() -> List<&2,T.Comparison>:
  +base = T.baseline()
  [T.compare("lost-post-with-live-permit",List.append(&2,C.TraceEvent,base,[C.Pre{1n,1n,2n,5n,20n,5n},C.NativeStart{2n,6n},C.NativeComplete{2n,7n}]),6n,0n),
   T.compare("three-posts-before-close",List.append(&2,C.TraceEvent,base,[C.NativeStart{2n,4n},C.Post{1n,1n,2n,5n},C.NativeStart{3n,5n},C.Post{1n,1n,3n,6n},C.RoundClose{7n}]),5n,7n),
   T.compare("late-known-post-after-close",List.append(&2,C.TraceEvent,base,[C.RoundClose{5n},C.Post{1n,1n,1n,8n}]),2n,5n),
   T.compare("old-unseen-post-opens-successor",List.append(&2,C.TraceEvent,base,[C.NativeStart{2n,2n},C.NativeComplete{2n,3n},C.RoundClose{5n},C.Post{1n,1n,2n,8n}]),2n,5n),
   T.compare("fresh-unseen-post-same-observable-input",List.append(&2,C.TraceEvent,base,[C.RoundClose{5n},C.NativeStart{2n,6n},C.NativeComplete{2n,7n},C.Post{1n,1n,2n,8n}]),6n,5n),
   T.compare("old-restamped-post-after-restart",List.append(&2,C.TraceEvent,base,[C.Restart{2n,5n},C.NativeStart{2n,2n},C.NativeComplete{2n,3n},C.Post{1n,2n,2n,8n}]),2n,5n)]
