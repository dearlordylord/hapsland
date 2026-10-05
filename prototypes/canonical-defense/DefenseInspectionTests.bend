# Presentation-only inspection preserves complete identities and hides unreleased bodies.
import Base
import ./Font.bend as F
import ./DefenseHistory.bend as History
import ./DefenseHost.bend as H
import ./DefenseRender.bend as R
import ./DefenseMotionTypes.bend as V
import ./DefenseMotion.bend as Motion

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def selected(found: Maybe<&2,V.Actor>,+key: V.WorkIdentity) -> Bool:
  match found:
    case None{}: False{}
    case Some{actor}: Motion.same(Motion.actor_key(actor),key)
def actors() -> List<&2,V.Actor>:
  [V.Actor{V.WorkIdentity{1n,1n,1n,7n},1n,0,100,100,3,5,[],0,[],0n,0,False{}},
   V.Actor{V.WorkIdentity{2n,3n,4n,7n},9n,0,100,100,3,4,[],30,[],0n,2,True{}}]
# Independent pixel probe of actual body rectangles, not just the colour helper.
def pixel(rects: List<&2,F.Rect>,+x: U32,+y: U32) -> U32:
  match rects:
    case Nil{}: 0
    case F.Box{+rx,+ry,w,h,color} <> rest:
      Bool.pick(U32,(rx <= x : U32) && (ry <= y : U32) && (x < rx + w : U32) && (y < ry + h : U32),color,pixel(rest,x,y))
def travelling_body() -> V.Actor:
  V.Actor{V.WorkIdentity{1n,1n,1n,1n},1n,0,100,100,0,1,[V.Waypoint{116,100,0,0n}],30,[],0n,6,True{}}
def main() -> IO(Unit):
  do IO<Unit>:
    require(U32.is_eq(pixel(R.history_actor(travelling_body(),H.initial(),[]),100,100),History.phase_color(0)),"actual rendered body pixel keeps visible phase colour despite completed business")
    require(selected(R.hover_actor(actors(),H.move(H.initial(),100,100)),V.WorkIdentity{2n,3n,4n,7n}),"hover skips hidden bodies and preserves full identity of retired playback")
    require(Nat.is_eq(R.hover_family(R.hover_actor(actors(),H.move(H.initial(),100,100))),9n),"hover focuses the originating edit without confusing equal operation numbers")
    require(Nat.is_eq(R.hover_family(R.hover_actor(actors(),H.move(H.initial(),150,100))),0n),"moving off a body restores the unfiltered business overview")
