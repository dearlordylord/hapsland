# Read-only build hover. Both sides derive from the exact engine configuration.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G

type Preview is Data:
  Delta{status: U32, kind: U32, x: U32, y: U32, target: U32,
    workers: U32, workerDelta: U32, overhead: U32, overheadReduction: U32,
    batchTarget: U32, batchDelta: U32, cost: U32}

# 0selection;1legal delta;2invalid ground;3unaffordable;4no eligible site;
# 5legal saturated zero;6terminal;7dynamic work/protection only.
def status(p: Preview) -> U32:
  match p:
    case Delta{value,_,_,_,_,_,_,_,_,_,_,_}: value

def kind(p: Preview) -> U32:
  match p:
    case Delta{_,value,_,_,_,_,_,_,_,_,_,_}: value

def x(p: Preview) -> U32:
  match p:
    case Delta{_,_,value,_,_,_,_,_,_,_,_,_}: value

def y(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,value,_,_,_,_,_,_,_,_}: value

def target(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,value,_,_,_,_,_,_,_}: value

def workers(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,_,value,_,_,_,_,_,_}: value

def worker_delta(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,_,_,value,_,_,_,_,_}: value

def overhead(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,_,_,_,value,_,_,_,_}: value

def overhead_reduction(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,_,_,_,_,value,_,_,_}: value

def batch_target(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,_,_,_,_,_,value,_,_}: value

def batch_delta(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,_,_,_,_,_,_,value,_}: value

def cost(p: Preview) -> U32:
  match p:
    case Delta{_,_,_,_,_,_,_,_,_,_,_,value}: value

def legal(+p: Preview) -> Bool:
  U32.is_eq(status(p),1) || U32.is_eq(status(p),4) || U32.is_eq(status(p),5) || U32.is_eq(status(p),7)

def fixed(+p: Preview) -> Bool:
  U32.is_eq(status(p),1) || U32.is_eq(status(p),5)

def affected(+p: Preview, id: U32) -> Bool:
  fixed(p) && U32.is_eq(target(p),id)

def blank(code: U32, +state: M.State) -> Preview:
  Delta{code,G.state_choice(state),G.snap(G.state_mouseX(state)),G.snap(G.state_mouseY(state)),255,0,0,0,0,0,0,0}

def result(+kind: U32, x: U32, y: U32, target: U32, workers: U32, +wd: U32, overhead: U32, +od: U32, batch: U32, +bd: U32) -> Preview:
  Delta{M.choose(1,5,(wd > 0 : U32) || (od > 0 : U32) || (bd > 0 : U32)),kind,x,y,target,workers,wd,overhead,od,batch,bd,G.cost(kind)}

# Hypothetical G.click is a pure value, never returned as a playable game state.
# Derived configurations are not re-fed to helpers that would double-apply buffs.
def compare(+config: M.Config, +state: M.State, +tower: M.Tower, +site: U32) -> Preview:
  +before = G.supported_config(config,G.state_towers(state))
  +afterState = G.click(config,state,G.state_mouseX(state),G.state_mouseY(state),0)
  +after = G.supported_config(config,G.state_towers(afterState))
  +kind = G.tower_kind(tower)
  +workers = G.node_workers(G.get_node(before,site))
  +overhead = G.rules_itemOverhead(G.config_rules(before))
  +batch = G.rules_batchTarget(G.config_rules(before))
  result(kind,G.tower_x(tower),G.tower_y(tower),site,workers,
    M.choose(M.sub(G.node_workers(G.get_node(after,site)),workers),0,U32.is_eq(kind,3)),
    overhead,M.choose(M.sub(overhead,G.rules_itemOverhead(G.config_rules(after))),0,U32.is_eq(kind,5)),
    batch,M.choose(M.sub(G.rules_batchTarget(G.config_rules(after)),batch),0,U32.is_eq(kind,5)))

def eligible(config: M.Config, +state: M.State, tower: M.Tower, site: U32) -> Preview:
  match site:
    case 255:
      Delta{4,G.state_choice(state),G.snap(G.state_mouseX(state)),G.snap(G.state_mouseY(state)),255,0,0,0,0,0,0,G.cost(G.state_choice(state))}
    case _: compare(config,state,tower,site)

def supported(+config: M.Config, +state: M.State, +kind: U32) -> Preview:
  match kind:
    case 3:
      +tower : M.Tower = M.Processor{G.snap(G.state_mouseX(state)),G.snap(G.state_mouseY(state)),kind,1,0,0,0,0,M.Pulse{240,0}}
      eligible(config,state,tower,G.support_target(config,tower))
    case 5:
      +tower : M.Tower = M.Processor{G.snap(G.state_mouseX(state)),G.snap(G.state_mouseY(state)),kind,1,0,0,0,0,M.Pulse{240,0}}
      eligible(config,state,tower,G.support_target(config,tower))
    case _:
      Delta{7,kind,G.snap(G.state_mouseX(state)),G.snap(G.state_mouseY(state)),255,0,0,0,0,0,0,G.cost(kind)}

def funded(config: M.Config, +state: M.State, enough: Bool) -> Preview:
  match enough:
    case True{}: supported(config,state,G.state_choice(state))
    case False{}: blank(3,state)

def ground(+config: M.Config, +state: M.State, valid: Bool) -> Preview:
  match valid:
    case True{}: funded(config,state,(G.state_gold(state) >= G.cost(G.state_choice(state)) : U32))
    case False{}: blank(2,state)

def phase(+config: M.Config, +state: M.State, live: Bool) -> Preview:
  match live:
    case True{}:
      ground(config,state,G.placement_valid(config,G.state_towers(state),G.snap(G.state_mouseX(state)),G.snap(G.state_mouseY(state))) && U32.is_eq(G.tower_index(G.state_towers(state),G.state_mouseX(state),G.state_mouseY(state),1),0))
    case False{}: blank(6,state)

def selected(config: M.Config, +state: M.State, selection: U32) -> Preview:
  match selection:
    case 0: phase(config,state,(G.state_phase(state) < 2 : U32))
    case _: blank(0,state)

def calculate(config: M.Config, +state: M.State) -> Preview:
  selected(config,state,G.state_selected(state))

def reason(p: Preview) -> String:
  match p:
    case Delta{0,_,_,_,_,_,_,_,_,_,_,_}: "SELECTED TOWER / NO BUILD PREVIEW"
    case Delta{1,_,_,_,_,_,_,_,_,_,_,_}: "BUILD PREVIEW / COLORED VALUES ARE PROPOSED DELTAS"
    case Delta{2,_,_,_,_,_,_,_,_,_,_,_}: "CANNOT BUILD / ROAD SITE OR OCCUPIED GROUND"
    case Delta{3,_,_,_,_,_,_,_,_,_,_,_}: "CANNOT BUILD / NOT ENOUGH GOLD"
    case Delta{4,_,_,_,_,_,_,_,_,_,_,_}: "CAN BUILD / NO ELIGIBLE BUILDING IN RANGE / NO BUFF"
    case Delta{5,3,_,_,_,_,_,_,_,_,_,_}: "NO EXTRA PERMIT / BUILDING BONUS CAP REACHED"
    case Delta{5,_,_,_,_,_,_,_,_,_,_,_}: "NO EXTRA EFFECT / PACKAGER BONUS CAP REACHED"
    case Delta{6,_,_,_,_,_,_,_,_,_,_,_}: "RUN ENDED / CANNOT BUILD"
    case Delta{_,_,_,_,_,_,_,_,_,_,_,_}: "DYNAMIC EFFECT / NO FIXED CAPACITY OR THROUGHPUT DELTA"

def diagnostics(+p: Preview) -> String:
  " PREVIEW=" ++ U32.show(status(p)) ++ " TARGET=" ++ U32.show(target(p)) ++ " WORKERS_NOW=" ++ U32.show(workers(p)) ++ " WORKERS_PLUS=" ++ U32.show(worker_delta(p)) ++ " OVERHEAD_NOW=" ++ U32.show(overhead(p)) ++ " OVERHEAD_MINUS=" ++ U32.show(overhead_reduction(p)) ++ " TARGET_NOW=" ++ U32.show(batch_target(p)) ++ " TARGET_PLUS=" ++ U32.show(batch_delta(p)) ++ " GOLD_MINUS=" ++ U32.show(cost(p))

# Number keys explicitly enter build mode; all other keys preserve inspection.
def build_intent(+state: M.State, building: Bool) -> M.State:
  match building:
    case True{}: G.select(state,0)
    case False{}: state

def key(+config: M.Config, state: M.State, +code: U32) -> M.State:
  build_intent(G.key(config,state,code),(code >= 49 : U32) && (code <= 55 : U32))
