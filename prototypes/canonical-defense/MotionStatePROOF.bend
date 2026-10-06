# Proofs for the accepted actual-game motion laws.
import Base
import ./MotionStateLAWS.bend as Laws
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ./DefensePresentation.bend as Display

def Laws.observation_preserves_position(actor,item,layout,at):
  match actor:
    case V.Actor{k,f,l,x,y,p,seen,path,t,parent,shown,cause,released}: {==}
def Laws.observation_preserves_identity(actor,item,layout,at):
  match actor:
    case V.Actor{k,f,l,x,y,p,seen,path,t,parent,shown,cause,released}: {==}
def Laws.blocked_actor_unchanged(actor): {==}
def Laws.advance_preserves_identity(actor,path):
  match actor path:
    case V.Actor{k,f,l,x,y,p,seen,old,t,parent,shown,cause,released} Nil{}: {==}
    case V.Actor{k,f,l,x,y,p,seen,old,t,parent,shown,cause,released} Con{V.Waypoint{tx,ty,phase,at},rest}: {==}
def Laws.advance_preserves_outcome(actor,path):
  match actor path:
    case V.Actor{k,f,l,x,y,p,seen,old,t,parent,shown,cause,released} Nil{}: {==}
    case V.Actor{k,f,l,x,y,p,seen,old,t,parent,shown,cause,released} Con{V.Waypoint{tx,ty,phase,at},rest}: {==}
