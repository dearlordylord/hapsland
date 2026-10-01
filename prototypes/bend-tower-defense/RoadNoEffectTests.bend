# Bounded classification evidence, not universal proof.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ./RoadScenario.bend as S
import ./RoadPreview.bend as P
import ./RoadDynamicPreview.bend as D
import ./RoadHeadless.bend as H
import ./RoadPreviewTests.bend as T

def sample(+state: M.State, kind: U32, x: U32, y: U32) -> M.State:
  G.move(G.choose(state,kind),x,y)

def check(+state: M.State, expected: U32, label: String) -> IO(Unit):
  H.require(U32.is_eq(D.cue(S.select(0),P.calculate(S.select(0),state),D.calculate(S.select(0),state)),expected),label)

def shield_cap_sample(spent: U32) -> IO(Unit):
  +p : P.Preview = P.Delta{7,6,144,240,255,0,0,0,0,0,0,50}
  +d : D.Snapshot = D.Dynamic{True{},6,[],[],0,0,False{},D.PressureSample{8,4,4,spent,240,0,[]},D.BatchSample{[],[],0,0,[],0,0,False{},[],0,False{},False{}}}
  H.require(U32.is_eq(D.cue(S.select(0),p,d),3),"Hot pressure alreadycapped remains transientzero, not nohotclaim")

def main() -> IO(Unit):
  do IO<Unit>:
    check(sample(G.initial(S.select(0)),0,144,240),3,"Rapid empty eligible site temporaryzero")
    check(sample(G.initial(S.select(0)),1,144,240),3,"Batch empty temporaryzero")
    check(sample(G.initial(S.select(0)),2,144,240),3,"Relay empty temporaryzero")
    check(sample(G.initial(S.select(0)),4,368,240),3,"Coordinator empty temporaryzero")
    check(sample(G.initial(S.select(0)),6,144,240),3,"Shield no hot pressure temporaryzero")
    check(sample(G.initial(S.select(0)),5,112,432),1,"Packager policy useful despite empty candidates")
    check(sample(G.initial(S.select(0)),3,144,240),1,"Parallelizer extra permit")
    check(sample(G.initial(S.select(0)),0,48,432),2,"Rapid no building in range persistentzero")
    check(sample(G.initial(S.select(0)),4,272,400),2,"Coordinator only postreview sites persistentzero")
    check(sample(G.initial(S.select(0)),3,48,432),2,"Parallelizer no eligible site persistentzero")
    check(sample(G.initial(S.select(0)),6,48,432),2,"Shield no site structuralzero")
    check(G.move(T.parallels(S.select(0)),208,240),2,"Supported worker cap persistentzero")
    check(sample(T.wallet(G.initial(S.select(0)),0,0),0,144,240),4,"Unfunded blockedred")
    check(sample(G.initial(S.select(0)),0,144,152),4,"Invalid site blockedred")
    check(sample(H.fixture([H.packet(1,1,31,1,100)],3,1,H.runtime0()),0,368,240),1,"Actual nextshot benefit cyan")
    shield_cap_sample(0)
    shield_cap_sample(1)
    check(G.select(sample(G.initial(S.select(0)),0,144,240),1),0,"Inspection hides buildghost")
