# Pure native 512-square quadtree renderer; no foreign code or shader escape.
import Base
import ./RoadModel.bend as M
import ./Font.bend as F
import ./RoadGame.bend as G
import ./RoadPreview.bend as P
import ./RoadDynamicPreview.bend as D

def overlap(r: F.Rect, +x: U32, +y: U32, +size: U32) -> Bool:
  match r:
    case F.Box{+rx, +ry, w, h, _}:
      (rx < x + size : U32) && (ry < y + size : U32) && (rx + w > x : U32) && (ry + h > y : U32)

def keep(on: Bool, r: F.Rect, tail: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case True{}:
      Con{r, tail}
    case False{}:
      tail

def filter(rs: List<&2, F.Rect>, +x: U32, +y: U32, +size: U32) -> List<&2, F.Rect>:
  match rs:
    case Nil{}:
      Nil{}
    case Con{+r, tail}:
      keep(overlap(r, x, y, size), r, filter(tail, x, y, size))

def covers(r: F.Rect, +x: U32, +y: U32, +size: U32) -> Bool:
  match r:
    case F.Box{+rx, +ry, w, h, _}:
      (rx <= x : U32) && (ry <= y : U32) && (rx + w >= x + size : U32) && (ry + h >= y + size : U32)

def full(rs: List<&2, F.Rect>, x: U32, y: U32, size: U32) -> Bool:
  match rs:
    case Nil{}:
      False{}
    case Con{r, _}:
      covers(r, x, y, size)

def paint(k: Nat, +x: U32, +y: U32, +size: U32, rs: List<&2, F.Rect>, solid: Bool) -> Image:
  match k rs solid:
    case _ Nil{} _:
      Pix{1058076}
    case 0n Con{F.Box{_, _, _, _, color}, _} _:
      Pix{color}
    case 1n+q Con{F.Box{_, _, _, _, color}, _} True{}:
      Pix{color}
    case 1n++q Con{r, tail} False{}:
      +half = (size / 2 : U32)
      +all = {Con{r, tail} : List<&2, F.Rect>}
      +ra = filter(all, x, y, half)
      +rb = filter(all, (x + half : U32), y, half)
      +rc = filter(all, x, (y + half : U32), half)
      +rd = filter(all, (x + half : U32), (y + half : U32), half)
      a b c d = paint(q, x, y, half, ra, full(ra, x, y, half)) paint(q, (x + half : U32), y, half, rb, full(rb, (x + half : U32), y, half)) paint(q, x, (y + half : U32), half, rc, full(rc, x, (y + half : U32), half)) paint(q, (x + half : U32), (y + half : U32), half, rd, full(rd, (x + half : U32), (y + half : U32), half))
      Qua{a, b, c, d}

def kind_color(kind: U32) -> U32:
  match kind:
    case 0: 4842955
    case 1: 7449343
    case 2: 16755794
    case 3: 9170322
    case 4: 9756671
    case 5: 16768133
    case _: 12165365

def kind_name(kind: U32) -> String:
  match kind:
    case 0: "RAPID"
    case 1: "BATCH"
    case 2: "RELAY"
    case 3: "PARALLELIZER"
    case 4: "COORDINATOR"
    case 5: "PACKAGER"
    case _: "SHIELD"

def flash(on: Bool, +x: U32, +y: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case False{}:
      rest
    case True{}:
      F.put(M.sub(x, 8), M.sub(y, 1), 17, 3, color, F.put(M.sub(x, 1), M.sub(y, 8), 3, 17, color, rest))

def beam(fuel: Nat, +x: U32, +y: U32, +tx: U32, +ty: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match fuel:
    case 0n:
      rest
    case 1n++n:
      +i = U32.from_nat(n)
      px = ((x * (16 - i) + tx * i) / 16 : U32)
      py = ((y * (16 - i) + ty * i) / 16 : U32)
      F.put(px, py, 3, 3, color, beam(n, x, y, tx, ty, color, rest))

def shot_line(on: Bool, x: U32, y: U32, tx: U32, ty: U32, color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case False{}:
      rest
    case True{}:
      beam(16n, x, y, tx, ty, color, rest)

def border(+x: U32, +y: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  F.put(M.sub(x, 12), M.sub(y, 12), 25, 2, color, F.put(M.sub(x, 12), (y + 11 : U32), 25, 2, color, F.put(M.sub(x, 12), M.sub(y, 12), 2, 25, color, F.put((x + 11 : U32), M.sub(y, 12), 2, 25, color, rest))))

def ring(fuel: Nat, +x: U32, +y: U32, +radius: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match fuel:
    case 0n: rest
    case 1n++n:
      +angle = (U32.to_f32(U32.from_nat(n)) * 6.283185 / 48.0 : F32)
      px = F32.to_u32(F32.max(0.0, (U32.to_f32(x) + F32.cos(angle) * U32.to_f32(radius) : F32)))
      py = F32.to_u32(F32.max(0.0, (U32.to_f32(y) + F32.sin(angle) * U32.to_f32(radius) : F32)))
      F.put(px, py, 2, 2, color, ring(n, x, y, radius, color, rest))

def road_line(fuel: Nat, +x: U32, +y: U32, +tx: U32, +ty: U32, +width: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match fuel:
    case 0n: rest
    case 1n++n:
      +i = U32.from_nat(n)
      px = ((x * (64 - i) + tx * i) / 64 : U32)
      py = ((y * (64 - i) + ty * i) / 64 : U32)
      F.put(M.sub(px, (width / 2 : U32)), M.sub(py, (width / 2 : U32)), width, width, color, road_line(n, x, y, tx, ty, width, color, rest))

def roof(fuel: Nat, +x: U32, +y: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match fuel:
    case 0n: rest
    case 1n++n:
      +row = (10 - U32.from_nat(n) : U32)
      F.put(M.sub(x, row), (y + row : U32), (row * 2 : U32), 2, color, roof(n, x, y, color, rest))

def roads(nodes: List<&2, M.Node>, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match nodes:
    case Nil{}: rest
    case Con{M.Site{_, _, +sx, +sy, +x, +y, _, _, _, _, _, _, _, _, _, _, _, _}, tail}:
      road_line(64n, sx, sy, x, y, 3, 5274785, road_line(64n, sx, sy, x, y, 18, 4278076, roads(tail, rest)))

def exit_side(right: Bool, +x: U32, +y: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match right:
    case True{}:
      F.text("EXIT", (x + 30 : U32), M.sub(y, 13), 1, 9170322, F.put((x + 22 : U32), M.sub(y, 3), 43, 2, 9170322, F.put((x + 63 : U32), M.sub(y, 6), 2, 8, 9170322, rest)))
    case False{}:
      F.text("EXIT", M.sub(x, 62), M.sub(y, 13), 1, 9170322, F.put(M.sub(x, 65), M.sub(y, 3), 43, 2, 9170322, F.put(M.sub(x, 65), M.sub(y, 6), 2, 8, 9170322, rest)))

def exit_marker(on: Bool, +x: U32, y: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case False{}: rest
    case True{}: exit_side((x > 256 : U32), x, y, rest)

# Presentation categories derive from the core's readiness and active-worker predicates.
def visual_held(+config: M.Config, +state: M.State, +enemy: M.Enemy) -> Bool:
  +node = G.get_node(config, G.enemy_stage(enemy))
  G.enemy_inside(enemy) && Bool.not(G.active_enemy(config, state, enemy)) &&
    ((U32.is_eq(G.node_releaseMode(node), 1) && Bool.not(G.edit_ready(config, state, G.enemy_edit(enemy)))) || U32.is_eq(G.node_serviceMode(node), 1))

def active_at(es: List<&2, M.Enemy>, +config: M.Config, +state: M.State, +id: U32) -> U32:
  match es:
    case Nil{}: 0
    case Con{+enemy, tail}:
      (M.choose(1, 0, U32.is_eq(G.enemy_stage(enemy), id) && G.active_enemy(config, state, enemy)) + active_at(tail, config, state, id) : U32)

def text_width(s: String, +scale: U32) -> U32:
  match s:
    case SNil{}: 0
    case SCon{_, tail}: (4 * scale + text_width(tail,scale) : U32)

# Font lacks '+'; draw it locally instead of dropping the proposed delta sign.
def plus(value: U32, +x: U32, +y: U32, +scale: U32, +color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  F.text(U32.show(value),(x + 4 * scale : U32),y,scale,color,F.put(x,(y + 2 * scale : U32),(3 * scale : U32),scale,color,F.put((x + scale : U32),(y + scale : U32),scale,(3 * scale : U32),color,rest)))

def delta_color(+value: U32) -> U32:
  M.choose(16768133,65483,U32.is_eq(value,0))

def plus_if(show: Bool, +value: U32, x: U32, y: U32, scale: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}: plus(value,x,y,scale,delta_color(value),rest)

def minus_if(show: Bool, +value: U32, x: U32, y: U32, scale: U32, color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}: F.text("-" ++ U32.show(value),x,y,scale,color,rest)

def preview_workers(+p: P.Preview, +id: U32) -> Bool:
  P.affected(p,id) && U32.is_eq(P.kind(p),3)

def preview_package(+p: P.Preview, +id: U32) -> Bool:
  P.affected(p,id) && U32.is_eq(P.kind(p),5)

def worker_line(+prefix: String, suffix: String, +show: Bool, value: U32, +x: U32, +y: U32, +scale: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +edge = (x + text_width(prefix,scale) : U32)
  F.text(prefix,x,y,scale,12900846,plus_if(show,value,(edge + scale : U32),y,scale,F.text(suffix,(edge + M.choose((12 * scale : U32),0,show) : U32),y,scale,11913663,rest)))

def package_line(+config: M.Config, +state: M.State, +p: P.Preview, +id: U32, +x: U32, +y: U32, +scale: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +show = preview_package(p,id)
  +encoding = G.package_overhead(config,state)
  +prefix = "NEXT BATCH ITEM OVERHEAD " ++ U32.show(encoding)
  +edge = (x + text_width(prefix,scale) : U32)
  +targetX = (edge + M.choose((20 * scale : U32),(8 * scale : U32),show) : U32)
  +target = "TARGET " ++ U32.show(G.package_target(config,state))
  F.text(prefix,x,y,scale,12900846,minus_if(show,P.overhead_reduction(p),(edge + scale : U32),y,scale,delta_color(P.overhead_reduction(p)),F.text(target,targetX,y,scale,12900846,plus_if(show,P.batch_delta(p),(targetX + text_width(target,scale) + scale : U32),y,scale,rest))))

def site_extra(show: Bool, config: M.Config, state: M.State, p: P.Preview, id: U32, x: U32, y: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}: package_line(config,state,p,id,x,y,1,rest)

def stage_extra(show: Bool, config: M.Config, state: M.State, p: P.Preview, id: U32, x: U32, y: U32, ordinary: String, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match show:
    case False{}: F.text(ordinary,x,y,1,16768133,rest)
    case True{}: package_line(config,state,p,id,x,y,1,rest)

def site_sprite(node: M.Node, +config: M.Config, +state: M.State, +preview: P.Preview, +enemies: List<&2, M.Enemy>, pulse: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match node:
    case M.Site{+id, label, _, _, +x, +y, _, _, slots, roadLimit, work, next, nextFinding, _, +workers, +mode, _, _}:
      +hot = G.inside_in(enemies, id)
      +safe = G.road_in(enemies, id)
      +active = active_at(enemies, config, state, id)
      used = M.choose(M.choose(1, 0, G.writer_active(G.runtime_writer(G.state_runtime(state)))), active, U32.is_eq(mode, 1))
      color = M.choose(16755794, 7449343, (hot > 0 : U32))
      border = F.put(M.sub(x, 19), M.sub(y, 18), 38, 36, M.choose(16777215, 925221, pulse && (hot > 0 : U32)), rest)
      body = F.put(M.sub(x, 16), M.sub(y, 10), 32, 25, color, border)
      door = F.put(M.sub(x, 5), (y + 2 : U32), 10, 13, 925221, body)
      building = roof(10n, x, M.sub(y, 22), 16050112, door)
      name = F.text(label, M.sub(x, 22), M.sub(y, 34), 1, 16050112, building)
      counts = F.text("SAFE " ++ U32.show(safe) ++ " HOT " ++ U32.show(hot), M.sub(x, 28), (y + 23 : U32), 1, 12439239, name)
      limits = worker_line("STORE " ++ U32.show(G.storage_in(config, state, id)) ++ "/" ++ U32.show(slots) ++ " WORK " ++ U32.show(used) ++ "/" ++ U32.show(G.effective_workers(config, state, id)), "", preview_workers(preview,id), P.worker_delta(preview), M.sub(x,28), (y + 34 : U32), 1, counts)
      extra = site_extra(preview_package(preview,id),config,state,preview,id,U32.min(248,M.sub(x,28)),(y + 45 : U32),limits)
      exit_marker(U32.is_eq(next, 255) || U32.is_eq(nextFinding, 255), x, y, extra)

def sites(nodes: List<&2, M.Node>, +config: M.Config, +state: M.State, +preview: P.Preview, +enemies: List<&2, M.Enemy>, +pulse: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match nodes:
    case Nil{}: rest
    case Con{node, tail}:
      site_sprite(node, config, state, preview, enemies, pulse, sites(tail, config, state, preview, enemies, pulse, rest))

def text_pick(on: Bool, yes: String, no: String) -> String:
  match on:
    case True{}: yes
    case False{}: no

def progress_if(inside: Bool, +x: U32, +y: U32, +effort: U32, +work: U32, held: Bool, ready: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match inside held:
    case False{} _: rest
    case True{} False{}:
      F.put(M.sub(x, 7), (y + 12 : U32), U32.min(15, (15 * effort / U32.max(1, work) : U32)), 3, 9170322, F.put(M.sub(x, 7), (y + 12 : U32), 15, 3, 925221, rest))
    case True{} True{}:
      F.text(text_pick(ready, "H", "D"), (x + 8 : U32), M.sub(y, 8), 1, 16768133, F.put(M.sub(x, 7), (y + 12 : U32), 15, 3, 16768133, rest))

def enemy_sprite(position: U32 & U32, id: U32, edit: U32, +active: Bool, ready: Bool, +inside: Bool, finding: Bool, +held: Bool, effort: U32, work: U32, pulse: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  (+x, +y) = position
  +color = M.choose(M.choose(9170322, M.choose(16768133, 15758447, held), active), M.choose(16768133, 9756671, finding), inside)
  halo = F.put(M.sub(x, 7), M.sub(y, 11), 15, 23, M.choose(M.choose(16777215, 15758447, pulse), 1058076, inside), rest)
  feet = F.put(M.sub(x, 5), (y + 6 : U32), 3, 3, color, F.put((x + 3 : U32), (y + 6 : U32), 3, 3, color, halo))
  body = F.put(M.sub(x, 5), M.sub(y, 3), 11, 9, color, F.put(M.sub(x, 4), M.sub(y, 9), 9, 6, color, feet))
  eyes = F.put(M.sub(x, 2), M.sub(y, 7), 2, 2, 925221, F.put((x + 2 : U32), M.sub(y, 7), 2, 2, 925221, body))
  labeled = F.text("U" ++ U32.show(id), M.sub(x, 5), y, 1, 925221, eyes)
  progress_if(inside, x, y, effort, work, held && Bool.not(active), ready, labeled)

def rank_step(found: Bool, same: Bool, tail: U32) -> U32:
  match found:
    case True{}: 0
    case False{}: (M.choose(1, 0, same) + tail : U32)

def inside_rank(es: List<&2, M.Enemy>, +id: U32, +stage: U32) -> U32:
  match es:
    case Nil{}: 0
    case Con{M.Packet{other, location, _, _, inside, _, _, _}, tail}:
      rank_step(U32.is_eq(id, other), U32.is_eq(stage, location) && inside, inside_rank(tail, id, stage))

# Draw-only packing for hot crowds; road position and mechanical range stay authoritative.
def crowd_offset(position: U32 & U32, +rank: U32) -> U32 & U32:
  (x, y) = position
  (M.sub((x + (rank % 3) * 14 : U32), 14), M.sub((y + ((rank / 3) % 2) * 16 : U32), 8))

def crowd_position(inside: Bool, position: U32 & U32, rank: U32) -> U32 & U32:
  match inside:
    case False{}: position
    case True{}: crowd_offset(position, rank)

def enemy_draw(enemy: M.Enemy, active: Bool, ready: Bool, held: Bool, all: List<&2, M.Enemy>, +node: M.Node, position: U32 & U32, pulse: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match enemy:
    case M.Packet{+id, stage, _, effort, +inside, finding, edit, _}:
      enemy_sprite(crowd_position(inside, position, inside_rank(all, id, stage)), id, edit, active, ready, inside, finding, held, effort, G.node_work(node), pulse, rest)

def enemies(es: List<&2, M.Enemy>, +all: List<&2, M.Enemy>, +state: M.State, +config: M.Config, +pulse: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match es:
    case Nil{}: rest
    case Con{+enemy, tail}:
      enemy_draw(enemy, G.active_enemy(config, state, enemy), G.edit_ready(config, state, G.enemy_edit(enemy)), visual_held(config, state, enemy), all, G.get_node(config, G.enemy_stage(enemy)), G.enemy_position(config, enemy), pulse, enemies(tail, all, state, config, pulse, rest))

def ring_if(on: Bool, x: U32, y: U32, radius: U32, color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case False{}: rest
    case True{}: ring(48n, x, y, radius, color, rest)

def towers(ts: List<&2, M.Tower>, +index: U32, +selected: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match ts:
    case Nil{}: rest
    case Con{M.Processor{+x, +y, +kind, +level, _, +shot, ax, ay, _}, tail}:
      +color = kind_color(kind)
      body = F.put(M.sub(x, 12), M.sub(y, 6), 25, 23, color, towers(tail, (index + 1 : U32), selected, rest))
      windows = F.put(M.sub(x, 8), y, 5, 5, 925221, F.put((x + 4 : U32), y, 5, 5, 925221, body))
      structure = roof(10n, x, M.sub(y, 16), color, windows)
      label = F.text(U32.show(level), M.sub(x, 2), (y + 9 : U32), 1, 16777215, structure)
      area = ring_if(U32.is_eq(index, selected), x, y, G.range(kind, level), 13039846, label)
      shot_line((shot > 0 : U32), x, y, ax, ay, color, border(x, y, M.choose(16773548, 925221, U32.is_eq(index, selected)), area))

def cue_color(code: U32) -> U32:
  match code:
    case 1: 65483
    case 2: 16754253
    case 3: 15124059
    case _: 15758447

def ghost(+p: P.Preview, +d: D.Snapshot, +code: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match p:
    case P.Delta{0,_,_,_,_,_,_,_,_,_,_,_}: rest
    case _:
      +color = cue_color(code)
      +x = P.x(p)
      +y = P.y(p)
      +labelX = M.choose(x,16,(x < 280 : U32))
      F.text(D.cue_text(code,p,d),labelX,M.choose((y + 26 : U32),M.sub(y,26),(y < 400 : U32)),1,color,
        ring(48n,x,y,G.range(P.kind(p),1),color,border(x,y,color,rest)))

def panel(title: String, subtitle: String, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  box = F.put(48, 215, 416, 78, 925221, rest)
  F.text(title, 72, 233, 3, 16115383, F.text(subtitle, 72, 267, 1, 13031636, box))

def overlay(phase: U32, lives: U32, paused: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match phase lives paused:
    case _ _ True{}: F.text("PAUSED / HOVER SNAPSHOT / SPACE TO RESUME",24,456,1,16768133,F.put(16,452,480,18,925221,rest))
    case 2 _ False{}: panel("RUN COMPLETE", "CHECK CLEAR / SUBMITTED / CANCELLED / LIMITED TOTALS", rest)
    case 3 0 False{}: panel("BUILDING OVERLOAD", "HEALTH LOST TO HOT BUILDINGS - R RESET", rest)
    case 3 _ False{}: panel("INCOMPLETE", "RETAINED OR UNFINISHED OUTPUT - CHECK TOTALS", rest)
    case _ _ False{}: rest

def phase_text(phase: U32, lives: U32) -> String:
  match phase lives:
    case 0 _: "BUILD PROCESSORS - N SEND WAVE"
    case 1 _: "PROCESS ARRIVALS BEFORE BUILDING OVERLOAD"
    case 2 _: "RUN COMPLETE - CHECK OUTCOME TOTALS"
    case 3 0: "BUILDING OVERLOAD"
    case _ _: "INCOMPLETE - RETAINED OR UNFINISHED OUTPUT"

def upgrade_label(price: U32) -> String:
  match price:
    case 0: "CLICK GROUND BUILD / TOWER SELECT"
    case p: "U UPGRADE COST " ++ U32.show(p)

def safe_count(es: List<&2, M.Enemy>) -> U32:
  match es:
    case Nil{}: 0
    case Con{M.Packet{_, _, _, _, inside, _, _, _}, tail}:
      (M.choose(0, 1, inside) + safe_count(tail) : U32)

def held_at(es: List<&2, M.Enemy>, +config: M.Config, +state: M.State, +id: U32) -> U32:
  match es:
    case Nil{}: 0
    case Con{+enemy, tail}:
      (M.choose(1, 0, U32.is_eq(G.enemy_stage(enemy), id) && visual_held(config, state, enemy)) + held_at(tail, config, state, id) : U32)

def stage_panel(node: M.Node, +config: M.Config, +state: M.State, +preview: P.Preview, +es: List<&2, M.Enemy>, +index: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match node:
    case M.Site{+id, label, _, _, _, _, _, _, +slots, _, _, _, _, _, +workers, +mode, release, _}:
      +stored = G.storage_in(config, state, id)
      +permits = G.effective_workers(config, state, id)
      +jobs = active_at(es, config, state, id)
      +used = M.choose(M.choose(1, 0, G.writer_active(G.runtime_writer(G.state_runtime(state)))), jobs, U32.is_eq(mode, 1))
      +storedActive = M.choose(0, jobs, U32.is_eq(mode, 1))
      +y = (76 + index * 106 : U32)
      background = F.put(528, y, 480, 98, 1518380, rest)
      name = F.text(label, 544, (y + 10 : U32), 2, 16050112, background)
      storage = worker_line("STORAGE " ++ U32.show(stored) ++ "/" ++ U32.show(slots) ++ " WORKERS " ++ U32.show(used) ++ "/" ++ U32.show(permits), " BASE " ++ U32.show(workers) ++ " BONUS " ++ U32.show(M.sub(permits,workers)),preview_workers(preview,id),P.worker_delta(preview),544,(y + 29 : U32),2,name)
      bars = F.put(544, (y + 49 : U32), U32.min(208, (208 * stored / U32.max(1, slots) : U32)), 6, 15758447, F.put(544, (y + 49 : U32), 208, 6, 2901312, F.put(776, (y + 49 : U32), U32.min(208, (208 * used / U32.max(1, permits) : U32)), 6, 9170322, F.put(776, (y + 49 : U32), 208, 6, 2901312, storage))))
      queue = F.text("ACTIVE JOBS " ++ U32.show(jobs) ++ " QUEUED " ++ U32.show(M.sub(M.sub(stored, storedActive), held_at(es, config, state, id))) ++ " HELD " ++ U32.show(held_at(es, config, state, id)), 544, (y + 63 : U32), 1, 12439239, bars)
      stage_extra(preview_package(preview,id),config,state,preview,id,544,(y + 79 : U32),text_pick(U32.is_eq(mode,1),"PENDING STORE / RESERVED TRANSPORT AND WRITER LANE",text_pick(U32.is_eq(release,1),"DEPENDENCY - WAIT FOR EDIT REVIEW SIBLINGS","STORAGE AND ACTIVE WORK ARE SEPARATE")),queue)

def stage_panels(nodes: List<&2, M.Node>, +config: M.Config, +state: M.State, +preview: P.Preview, +es: List<&2, M.Enemy>, +index: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match nodes:
    case Nil{}: rest
    case Con{node, tail}:
      stage_panel(node, config, state, preview, es, index, stage_panels(tail, config, state, preview, es, (index + 1 : U32), rest))

def ids(values: List<&2, U32>) -> String:
  match values:
    case Nil{}: ""
    case Con{id, tail}: U32.show(id) ++ " " ++ ids(tail)

def count_ids(ids: List<&2, U32>) -> U32:
  match ids:
    case Nil{}: 0
    case Con{_, tail}: (1 + count_ids(tail) : U32)

def stop_name(stop: U32) -> String:
  match stop:
    case 0: "ORDINARY FLOW"
    case 1: "STOP WAIT"
    case 2: "STOP DECIDING"
    case 3: "STOP OUTPUT"
    case _: "STOP RESPONSE COMPLETE"

def contains(ids: List<&2, U32>, +id: U32) -> Bool:
  match ids:
    case Nil{}: False{}
    case Con{item, tail}: U32.is_eq(item, id) || contains(tail, id)

def writer_content(es: List<&2, M.Enemy>, +members: List<&2, U32>) -> U32:
  match es:
    case Nil{}: 0
    case Con{M.Packet{id, _, _, _, _, _, _, bytes}, tail}:
      (M.choose(bytes, 0, contains(members, id)) + writer_content(tail, members) : U32)

def writer_panel(writer: M.Writer, +config: M.Config, +state: M.State, +preview: P.Preview, +cap: U32, +ticks: U32, +baseHeader: U32, +baseItem: U32, flushTicks: U32, flushAge: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match writer:
    case M.Output{+members, +bytes, +left, _}:
      +count = count_ids(members)
      +content = writer_content(G.state_enemies(state), members)
      +encoding = M.sub(bytes, content)
      +saved = M.choose(M.sub((baseHeader + count * baseItem : U32), encoding), 0, (count > 0 : U32))
      background = F.put(528, 526, 480, 126, 1518380, rest)
      title = F.text("OUTPUT BYTE BATCH / ONE WRITER", 544, 535, 2, 16050112, background)
      status = F.text("CONTENT " ++ U32.show(content) ++ " MODEL ENCODING " ++ U32.show(encoding) ++ " TOTAL " ++ U32.show(bytes) ++ "/" ++ U32.show(cap), 544, 554, 1, 12900846, title)
      waitLabel = F.text("WAIT " ++ U32.show((flushAge * 20 : U32)) ++ "/" ++ U32.show((flushTicks * 20 : U32)) ++ " MS MEMBERS " ++ U32.show(count), 840, 538, 1, 12439239, status)
      wait = package_line(config,state,preview,G.writer_site(G.config_nodes(config)),544,568,1,waitLabel)
      fill = F.put(544, 579, U32.min(440, (440 * bytes / U32.max(1, cap) : U32)), 4, 7449343, F.put(544, 579, 440, 4, 2901312, wait))
      phase = F.text(text_pick((count > 0 : U32), "WRITER RESERVED - MIN ACK DELAY " ++ U32.show((left * 20 : U32)) ++ " MS", "WRITER IDLE - BATCH FORMS AUTOMATICALLY"), 544, 590, 1, 16768133, fill)
      progress = F.put(544, 603, U32.min(440, (440 * M.choose(M.sub(ticks, left), 0, (count > 0 : U32)) / U32.max(1, ticks) : U32)), 4, 9170322, F.put(544, 603, 440, 4, 2901312, phase))
      memberLine = F.text("RESERVED UNIT IDS " ++ ids(members), 544, 615, 1, 12439239, progress)
      delay = F.text("ACK ALSO WAITS FOR MEMBER TRAVEL / SERVICE", 544, 628, 1, 12439239, memberLine)
      F.text("SAVED " ++ U32.show(saved) ++ " MODEL BYTES / RESERVATION SIZE IS COMMITTED", 544, 640, 1, 16768133, delay)

def runtime_panels(+config: M.Config, +state: M.State, +preview: P.Preview, rules: M.Rules, runtime: M.Runtime, +clock: U32, dropped: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match rules runtime:
    case M.Contract{_, cap, overhead, itemOverhead, target, flushTicks, writerTicks, _, _, _, _, _} M.Run{+stop, deadline, flushAge, writer, cancelled, limited, batches, acknowledged, clear, findings, attempts, cutoff}:
      output = writer_panel(writer, config, state, preview, cap, writerTicks, overhead, itemOverhead, flushTicks, flushAge, rest)
      background = F.put(528, 654, 480, 98, 1518380, output)
      title = F.text(stop_name(stop), 544, 664, 2, 16768133, background)
      timer = F.text(text_pick(U32.is_eq(stop, 0), "STOP STARTS AUTOMATICALLY", "DEADLINE IN " ++ U32.show((M.sub(deadline, clock) * 20 : U32)) ++ " MS  RESPONSE " ++ U32.show(attempts) ++ "/4"), 544, 688, 1, 12439239, title)
      status = F.text("CLEAR " ++ U32.show(clear) ++ " FINDINGS REVIEWED " ++ U32.show(findings) ++ " SUBMITTED " ++ U32.show(acknowledged), 544, 704, 1, 12900846, timer)
      failures = F.text("DROPPED " ++ U32.show(dropped) ++ " CANCELLED " ++ U32.show(cancelled) ++ " LIMITED " ++ U32.show(limited), 544, 720, 1, 15758447, status)
      F.text("BATCHES " ++ U32.show(batches) ++ text_pick(cutoff, " CUTOFF / OVERFLOW RETAINED", " DELIVERY IS NOT REPAIR"), 544, 738, 1, 12439239, failures)

def edit_live(es: List<&2, M.Enemy>, +edit: U32) -> U32:
  match es:
    case Nil{}: 0
    case Con{M.Packet{_, _, _, _, _, _, id, _}, tail}:
      (M.choose(1, 0, U32.is_eq(edit, id)) + edit_live(tail, edit) : U32)

def edit_bytes(es: List<&2, M.Enemy>, +edit: U32) -> U32:
  match es:
    case Nil{}: 0
    case Con{M.Packet{_, _, _, _, _, _, id, bytes}, tail}:
      (M.choose(bytes, 0, U32.is_eq(edit, id)) + edit_bytes(tail, edit) : U32)

def ribbon(show: Bool, +edit: U32, +row: U32, +all: List<&2, M.Enemy>, +config: M.Config, +state: M.State, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match show:
    case False{}: rest
    case True{}:
      +ready = G.edit_ready(config, state, edit)
      +y = (568 + row * 22 : U32)
      bar = F.put(20, y, 5, 14, M.choose(9170322, 16768133, ready), rest)
      F.text("E" ++ U32.show(edit) ++ " LIVE " ++ U32.show(edit_live(all, edit)) ++ " BYTES " ++ U32.show(edit_bytes(all, edit)) ++ " " ++ text_pick(ready, "READY", "WAIT SIBLINGS"), 32, y, 2, M.choose(9170322, 16768133, ready), bar)

def ribbons(es: List<&2, M.Enemy>, +all: List<&2, M.Enemy>, +seen: List<&2, U32>, +row: U32, +config: M.Config, +state: M.State, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match es:
    case Nil{}: rest
    case Con{M.Packet{_, _, _, _, _, _, +edit, _}, tail}:
      +show = Bool.not(contains(seen, edit)) && (row < 2 : U32)
      later = ribbons(tail, all, Con{edit, seen}, (row + M.choose(1, 0, show) : U32), config, state, rest)
      ribbon(show, edit, row, all, config, state, later)

def choose_tower(on: Bool, yes: M.Tower, no: M.Tower) -> M.Tower:
  match on:
    case True{}: yes
    case False{}: no

def picked_tower(ts: List<&2, M.Tower>, +index: U32, preview: M.Tower) -> M.Tower:
  match ts:
    case Nil{}: preview
    case Con{head, tail}: choose_tower(U32.is_eq(index, 1), head, picked_tower(tail, M.sub(index, 1), preview))

def selected_tower(+state: M.State) -> M.Tower:
  +kind = G.state_choice(state)
  preview : M.Tower = M.Processor{G.snap(G.state_mouseX(state)), G.snap(G.state_mouseY(state)), kind, 1, 0, 0, 0, 0, M.Pulse{M.choose(240, 0, U32.is_eq(kind, 6)), 0}}
  picked_tower(G.state_towers(state), G.state_selected(state), preview)

def parallel_note(+config: M.Config, +state: M.State, +target: U32) -> String:
  match target:
    case 255: "NO ORDINARY BUILDING IN RANGE"
    case _:
      +node = G.get_node(config, target)
      +base = G.node_workers(node)
      +cap = G.effective_workers(config, state, target)
      G.node_label(node) ++ " BASE " ++ U32.show(base) ++ " BONUS " ++ U32.show(M.sub(cap, base)) ++ " PERMITS " ++ U32.show(cap)

def target_description(enemy: M.Enemy, +config: M.Config, +state: M.State) -> String:
  match enemy:
    case M.Packet{+id, stage, progress, effort, inside, finding, +edit, bytes}:
      packet : M.Enemy = M.Packet{id, stage, progress, effort, inside, finding, edit, bytes}
      "NEXT E" ++ U32.show(edit) ++ " UNIT " ++ U32.show(id) ++ " / " ++ U32.show(G.coordinator_blockers(config, state, packet)) ++ " FINDINGS WAITING"

def target_line(on: Bool, enemy: M.Enemy, config: M.Config, state: M.State, other: String) -> String:
  match on:
    case True{}: target_description(enemy, config, state)
    case False{}: other

def coordinator_note(es: List<&2, M.Enemy>, +config: M.Config, +state: M.State, +id: U32) -> String:
  match es:
    case Nil{}: "NO ACTIVE UNFINISHED SIBLING BLOCKER IN RANGE"
    case Con{+enemy, tail}:
      target_line(U32.is_eq(G.enemy_id(enemy), id), enemy, config, state, coordinator_note(tail, config, state, id))

def support_notes(+kind: U32, +tower: M.Tower, +config: M.Config, +state: M.State) -> String & String:
  match kind:
    case 3:
      (parallel_note(config, state, G.support_target(config, tower)), "PERMITS ONLY / BONUS CAP 2 / STORAGE AND WRITER UNCHANGED")
    case 4:
      (coordinator_note(G.state_enemies(state), config, state, G.coordinator_target(config, state, tower)), "WORK BOOST " ++ U32.show(G.power(kind, G.tower_level(tower))) ++ " / NO OUTCOME CHANGE / COOLDOWN " ++ U32.show((G.tower_cooldown(tower) * 20 : U32)) ++ " MS")
    case 5:
      ("MODEL ENCODING PER ITEM " ++ U32.show(G.package_overhead(config, state)) ++ " / BASE " ++ U32.show(G.rules_itemOverhead(G.config_rules(config))), "TARGET " ++ U32.show(G.package_target(config, state)) ++ " FINDINGS / SAME BYTE CAP / LARGER TARGET CAN WAIT")
    case 6:
      ("PRESSURE TICKS LEFT " ++ U32.show(G.tower_charges(tower)) ++ "/240 ABSORBED " ++ U32.show(G.tower_prevented(tower)), "ABSORBS AT MOST HALF HOT PRESSURE / BACKLOG AND DEADLINE STAY")
    case _:
      ("AUTOMATIC ACTIVE WORK / POWER " ++ U32.show(G.power(kind, G.tower_level(tower))) ++ " RANGE " ++ U32.show(G.range(kind, G.tower_level(tower))), "COOLDOWN " ++ U32.show((G.tower_cooldown(tower) * 20 : U32)) ++ " MS / STORED WORK DOES NOT ALL BECOME ACTIVE")

def support_panel_notes(notes: String & String, +tower: M.Tower, +state: M.State, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  (effect, limit) = notes
  background = F.put(16, 680, 496, 66, 1518380, rest)
  title = F.text(text_pick(U32.is_eq(G.state_selected(state), 0), "BUILD / CURRENT ", "SELECTED ") ++ kind_name(G.tower_kind(tower)) ++ " LEVEL " ++ U32.show(G.tower_level(tower)), 24, 687, 2, kind_color(G.tower_kind(tower)), background)
  details = F.text(effect, 24, 707, 1, 12439239, title)
  bounds = F.text(limit, 24, 720, 1, 16768133, details)
  F.text(upgrade_label(G.upgrade_price(G.state_towers(state), G.state_selected(state))), 24, 733, 1, 12439239, bounds)

def preview_link_on(+p: P.Preview, config: M.Config, +color: U32, rest: List<&2,F.Rect>, show: Bool) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}:
      +node = G.get_node(config,P.target(p))
      +x = G.node_x(node)
      +y = G.node_y(node)
      road_line(64n,P.x(p),P.y(p),x,y,1,color,F.put(M.sub(x,22),M.sub(y,22),44,2,color,F.put(M.sub(x,22),(y + 20 : U32),44,2,color,F.put(M.sub(x,22),M.sub(y,22),2,44,color,F.put((x + 20 : U32),M.sub(y,22),2,44,color,rest)))))

def preview_link(+p: P.Preview, config: M.Config, color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  preview_link_on(p,config,color,rest,P.fixed(p))

def gold_summary(+state: M.State, +p: P.Preview, waves: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +prefix = "HEALTH " ++ U32.show(G.state_lives(state)) ++ " GOLD " ++ U32.show(G.state_gold(state))
  +edge = (16 + text_width(prefix,2) : U32)
  F.text(prefix,16,30,2,12900846,minus_if(P.legal(p),P.cost(p),(edge + 8 : U32),30,2,15758447,F.text(" WAVE " ++ U32.show(G.state_wave(state)) ++ "/" ++ U32.show(waves),(edge + M.choose(48,0,P.legal(p)) : U32),30,2,12900846,rest)))

def build_note(+kind: U32) -> String:
  match kind:
    case 3: "PERMITS ONLY / BONUS CAP 2 / STORAGE AND WRITER UNCHANGED"
    case 5: "NEXT BATCH POLICY / FLOOR 0 / BONUS CAP 3 / TARGET CAN WAIT"
    case 6: "SHIELD CAP 240 PRESSURE TICKS / AT MOST HALF LOCAL HOT"
    case _: "POWER " ++ U32.show(G.power(kind,1)) ++ " RANGE " ++ U32.show(G.range(kind,1)) ++ " COOLDOWN " ++ U32.show((G.cooldown(kind) * 20 : U32)) ++ " MS / DYNAMIC WORK"

def build_panel(+p: P.Preview, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  background = F.put(16,680,496,66,1518380,rest)
  title = F.text("BUILD " ++ kind_name(P.kind(p)) ++ " PREVIEW",24,687,2,kind_color(P.kind(p)),background)
  note = F.text(P.reason(p),24,707,1,M.choose(15758447,16768133,U32.is_eq(P.status(p),2) || U32.is_eq(P.status(p),3) || U32.is_eq(P.status(p),6)),title)
  limits = F.text(build_note(P.kind(p)),24,720,1,12439239,note)
  F.text("CYAN DELTA / AMBER ZERO / RED GOLD COST / CURRENT STATE STAYS",24,733,1,65483,limits)

def short_ids(values: List<&2,U32>, fuel: Nat) -> String:
  match values fuel:
    case Nil{} _: ""
    case _ 0n: "..."
    case Con{id,tail} 1n+n: U32.show(id) ++ " " ++ short_ids(tail,n)

def yes(on: Bool) -> String:
  match on:
    case True{}: "YES"
    case False{}: "NO"

def dynamic_mode(+d: D.Snapshot, +p: P.Preview) -> Bool:
  D.enabled(d) && Bool.not(U32.is_eq(D.kind(d),3)) && Bool.not(U32.is_eq(P.status(p),4)) && Bool.not(U32.is_eq(P.status(p),5))

def find_hit(hits: List<&2,D.Hit>, +id: U32) -> D.Hit:
  match hits:
    case Nil{}: D.WorkHit{0,0,0,0}
    case Con{+head,tail}: Bool.pick(D.Hit,U32.is_eq(D.hit_id(head),id),head,find_hit(tail,id))

def work_delta(show: Bool, +hit: D.Hit, +x: U32, y: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}:
      F.text("-" ++ U32.show(M.sub(D.hit_before(hit),D.hit_after(hit))) ++ " NEXT " ++ U32.show(D.hit_after(hit)),x,y,2,65483,rest)

def work_row(+enemy: M.Enemy, +d: D.Snapshot, +config: M.Config, +state: M.State, row: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +id = G.enemy_id(enemy)
  +prefix = "UNIT " ++ U32.show(id) ++ " E" ++ U32.show(G.enemy_edit(enemy)) ++ " " ++ G.node_label(G.get_node(config,G.enemy_stage(enemy))) ++ " REMAIN " ++ U32.show(G.enemy_effort(enemy))
  +y = (610 + row * 14 : U32)
  +color = M.choose(12553727,12900846,D.dependent_member(d,id))
  F.text(prefix,16,y,2,color,work_delta(D.hit_member(d,id),find_hit(D.hits(d),id),(24 + text_width(prefix,2) : U32),y,rest))

def work_rows_next(show: Bool, id: U32, all: List<&2,M.Enemy>, d: D.Snapshot, config: M.Config, state: M.State, row: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}: work_row(D.find_enemy(all,id),d,config,state,row,rest)

def work_rows(ids: List<&2,U32>, +seen: List<&2,U32>, +all: List<&2,M.Enemy>, +d: D.Snapshot, +config: M.Config, +state: M.State, +row: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match ids:
    case Nil{}: rest
    case Con{+id,tail}:
      +show = Bool.not(contains(seen,id)) && (row < 5 : U32)
      work_rows_next(show,id,all,d,config,state,row,work_rows(tail,Con{id,seen},all,d,config,state,(row + M.choose(1,0,show) : U32),rest))

def inside_ids(es: List<&2,M.Enemy>) -> List<&2,U32>:
  match es:
    case Nil{}: []
    case Con{+head,tail}: List.append(&2,U32,Bool.pick(List<&2,U32>,G.enemy_inside(head),[G.enemy_id(head)],[]),inside_ids(tail))

def shield_site_lookup(sites: List<&2,D.ShieldSite>, +id: U32) -> D.ShieldSite:
  match sites:
    case Nil{}: D.SiteShield{id,0,0,0}
    case Con{+head,tail}: Bool.pick(D.ShieldSite,U32.is_eq(D.site_site(head),id),head,shield_site_lookup(tail,id))

def pressure_line_on(+site: D.ShieldSite, +x: U32, +y: U32, rest: List<&2,F.Rect>, show: Bool) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}:
      +prefix = "ONE TICK PRESSURE " ++ U32.show(M.sub(D.site_inside(site),D.site_before_absorb(site)))
      F.text(prefix,x,y,1,12900846,F.text(" WITH SHIELD " ++ U32.show(M.sub(D.site_inside(site),D.site_after_absorb(site))),(x + text_width(prefix,1) : U32),y,1,65483,rest))

def pressure_line(+d: D.Snapshot, +id: U32, x: U32, y: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +site = shield_site_lookup(D.shield_sites(D.shield(d)),id)
  pressure_line_on(site,x,y,rest,D.enabled(d) && U32.is_eq(D.kind(d),6) && (U32.is_eq(D.shield_site(D.shield(d)),id) || Bool.not(U32.is_eq(D.site_before_absorb(site),D.site_after_absorb(site)))))

def pressure_stage_line(d: D.Snapshot, id: U32, +y: U32, rest: List<&2,F.Rect>, show: Bool) -> List<&2,F.Rect>:
  match show:
    case False{}: rest
    case True{}: pressure_line(d,id,544,y,F.put(544,y,448,7,1518380,rest))
def pressure_sites(nodes: List<&2,M.Node>, +d: D.Snapshot, +index: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match nodes:
    case Nil{}: rest
    case Con{+node,tail}:
      +id = G.node_id(node)
      +site = shield_site_lookup(D.shield_sites(D.shield(d)),id)
      +show = D.enabled(d) && U32.is_eq(D.kind(d),6) && (U32.is_eq(D.shield_site(D.shield(d)),id) || Bool.not(U32.is_eq(D.site_before_absorb(site),D.site_after_absorb(site))))
      pressure_line(d,id,U32.min(280,M.sub(G.node_x(node),28)),(G.node_y(node) + 45 : U32),pressure_stage_line(d,id,(76 + index * 106 + 79 : U32),pressure_sites(tail,d,(index + 1 : U32),rest),show))


def work_list(+es: List<&2,M.Enemy>, +d: D.Snapshot, config: M.Config, state: M.State, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  work_rows(List.append(&2,U32,D.hit_ids(D.hits(d)),List.append(&2,U32,D.dependents(d),List.append(&2,U32,Bool.pick(List<&2,U32>,U32.is_eq(D.kind(d),5),D.package_members_after(D.package(d)),[]),inside_ids(es)))),[],es,d,config,state,0,rest)

def highlight_enemy_at(position: U32 & U32, +hit: Bool, dependent: Bool, +gx: U32, +gy: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  (+x,+y) = position
  shot_line(hit,gx,gy,x,y,65483,ring_if(hit || dependent,x,y,10,M.choose(65483,12553727,hit),rest))

def highlight_enemies(es: List<&2,M.Enemy>, +all: List<&2,M.Enemy>, +d: D.Snapshot, +config: M.Config, +state: M.State, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match es:
    case Nil{}: rest
    case Con{+head,tail}:
      +id = G.enemy_id(head)
      highlight_enemy_at(crowd_position(G.enemy_inside(head),G.enemy_position(config,head),inside_rank(all,id,G.enemy_stage(head))),D.hit_member(d,id),D.dependent_member(d,id) || (U32.is_eq(D.kind(d),5) && G.member(D.package_members_after(D.package(d)),id)),G.snap(G.state_mouseX(state)),G.snap(G.state_mouseY(state)),highlight_enemies(tail,all,d,config,state,rest))

def shot_panel(+d: D.Snapshot, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  background = F.put(16,680,496,66,1518380,rest)
  title = F.text("NEXT SHOT " ++ kind_name(D.kind(d)) ++ " / SNAPSHOT",24,687,2,65483,background)
  target = F.text("AFFECTED UNITS " ++ short_ids(D.hit_ids(D.hits(d)),6n) ++ text_pick(U32.is_eq(D.hit_count(d),0),"NONE WORKER-ACTIVE IN RANGE",""),24,707,1,12900846,title)
  depend = F.text("WAITING FINDING UNITS " ++ short_ids(D.dependents(d),6n) ++ " OTHER LIVE BLOCKERS " ++ U32.show(D.coordinator_blockers(d)),24,720,1,12553727,target)
  F.text(text_pick(U32.is_eq(D.kind(d),4),"AFTER SHOT EDIT READY " ++ yes(D.release_ready(d)) ++ " / UNOFFERED SIBLINGS STILL MATTER","CURRENT JOBS FROZEN / NO MOVEMENT OR NATURAL SERVICE / WORK NOT DAMAGE"),24,733,1,16768133,depend)

def shield_panel(d: D.Snapshot, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +p = D.shield(d)
  background = F.put(16,680,496,66,1518380,rest)
  title = F.text("ONE PRESSURE TICK / SHIELD SNAPSHOT",24,687,2,65483,background)
  now = F.text(text_pick(U32.is_eq(D.shield_site(p),255),"NO ELIGIBLE BUILDING IN RANGE / NO LOCAL PROTECTION","CURRENT HOT " ++ U32.show(D.shield_danger(p)) ++ " PRESSURE " ++ U32.show(M.sub(D.shield_danger(p),D.shield_prevented_before(p)))),24,707,1,12900846,title)
  after = F.text("WITH SHIELD PRESSURE " ++ U32.show(M.sub(D.shield_danger(p),D.shield_prevented_after(p))) ++ " / EXTRA PREVENTED " ++ U32.show(M.sub(D.shield_prevented_after(p),D.shield_prevented_before(p))),24,720,1,65483,now)
  F.text("NEW CHARGE -" ++ U32.show(D.shield_new_charge_spent(p)) ++ " LEFT " ++ U32.show(D.shield_charge_left(p)) ++ "/240 / BACKLOG AND HP ARE NOT PREDICTED",24,733,1,16768133,after)

def package_panel(d: D.Snapshot, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +p = D.package(d)
  background = F.put(16,680,496,66,1518380,rest)
  title = F.text("ELIGIBLE NOW / NEXT BATCH SNAPSHOT",24,687,2,65483,background)
  now = F.text("NOW UNITS " ++ short_ids(D.package_members_before(p),5n) ++ " BYTES " ++ U32.show(D.package_bytes_before(p)) ++ " / GHOST UNITS " ++ short_ids(D.package_members_after(p),5n) ++ " BYTES " ++ U32.show(D.package_bytes_after(p)),24,707,1,12900846,title)
  dispatch = F.text("FLUSH TIMER LEFT " ++ U32.show((D.package_flush_remaining(p) * 20 : U32)) ++ " MS / DISPATCH NOW " ++ yes(D.package_dispatch_before(p)) ++ " WITH GHOST " ++ yes(D.package_dispatch_after(p)),24,720,1,65483,now)
  F.text("WRITER BUSY " ++ yes(D.package_writer_busy(p)) ++ " / COMMITTED " ++ short_ids(D.package_committed_ids(p),5n) ++ " BYTES " ++ U32.show(D.package_committed_bytes(p)) ++ " UNCHANGED",24,733,1,16768133,dispatch)

def dynamic_panel_kind(+d: D.Snapshot, rest: List<&2,F.Rect>, kind: U32) -> List<&2,F.Rect>:
  match kind:
    case 5: package_panel(d,rest)
    case 6: shield_panel(d,rest)
    case _: shot_panel(d,rest)

def dynamic_panel(+d: D.Snapshot, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  dynamic_panel_kind(d,rest,D.kind(d))

def build_panel_choice(dynamic: D.Snapshot, preview: P.Preview, rest: List<&2,F.Rect>, show: Bool) -> List<&2,F.Rect>:
  match show:
    case True{}: dynamic_panel(dynamic,rest)
    case False{}: build_panel(preview,rest)

def support_panel_mode(+config: M.Config, +state: M.State, +preview: P.Preview, +dynamic: D.Snapshot, rest: List<&2,F.Rect>, selected: U32) -> List<&2,F.Rect>:
  match selected:
    case 0: build_panel_choice(dynamic,preview,rest,dynamic_mode(dynamic,preview))
    case _:
      +tower = selected_tower(state)
      support_panel_notes(support_notes(G.tower_kind(tower),tower,config,state),tower,state,rest)

def support_panel(+config: M.Config, +state: M.State, preview: P.Preview, dynamic: D.Snapshot, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  support_panel_mode(config,state,preview,dynamic,rest,G.state_selected(state))

def dashboard(+config: M.Config, +state: M.State, +preview: P.Preview, +dynamic: D.Snapshot, +nodes: List<&2, M.Node>, +es: List<&2, M.Enemy>, rules: M.Rules, runtime: M.Runtime, clock: U32, dropped: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  background = F.put(512, 0, 512, 768, 925221, F.put(0, 512, 512, 256, 925221, rest))
  panels = pressure_sites(nodes,dynamic,0,stage_panels(nodes, config, state, preview, es, 0, runtime_panels(config, state, preview, rules, runtime, clock, dropped, background)))
  title = F.text("ARCHITECTURE STATE", 528, 14, 3, 16050112, panels)
  purpose = F.text("STORE / WORK / DEPEND / WRITE / STOP", 528, 46, 2, 11913663, F.text("GREEN ACTIVE / RED QUEUED / AMBER HELD", 528, 510, 1, 12439239, title))
  legend = F.text("SHARED EDIT READINESS", 16, 532, 2, 16050112, purpose)
  hint = F.text("FIRST 2 EDITS / FIRST 5 AFFECTED OR HOT UNITS / REMAINING WORK", 16, 551, 1, 12439239, legend)
  ribbons(es, es, Nil{}, 0, config, state, work_list(es,dynamic,config,state,support_panel(config, state, preview, dynamic, F.text("ALL INSIDE ADD PRESSURE - SUBMISSION IS NOT REPAIR", 16, 748, 1, 12439239, hint))))

def scene(+config: M.Config, +state: M.State) -> List<&2, F.Rect>:
  match config state:
    case M.Board{label, +nodes, _, _, _, waves, _, +pressureEvery, _, _, +rules} M.World{+clock, _, wave, +phase, +lives, +gold, _, left, _, pace, paused, +choice, +selected, mx, my, offered, finished, +dropped, pressure, +ts, +es, +runtime}:
      +preview = P.calculate(config,state)
      +dynamic = D.calculate(config,state)
      +cue = D.cue(config,preview,dynamic)
      +pulse = (clock % 20 < 4 : U32)
      ground = F.put(16, 100, 480, 370, 1914923, Nil{})
      map = sites(nodes, config, state, preview, es, pulse, roads(nodes, ground))
      processors = towers(ts, 1, selected, map)
      packets = enemies(es, es, state, config, pulse, processors)
      world = ghost(preview,dynamic,cue,preview_link(preview,config,cue_color(cue),highlight_enemies(es,es,dynamic,config,state,packets)))
      hud = F.put(0, 0, 512, 96, 925221, F.put(0, 474, 512, 38, 925221, world))
      title = F.text(label, 16, 10, 2, 16050112, hud)
      summary = gold_summary(state,preview,waves,title)
      coverage = F.text("OFFERED " ++ U32.show(offered) ++ " FINISHED " ++ U32.show(finished) ++ " DROPPED " ++ U32.show(dropped) ++ " LEFT " ++ U32.show(left) ++ " PACE " ++ U32.show((pace * 20 : U32)) ++ " MS", 16, 51, 1, 12439239, summary)
      pressureHud = F.text("ROAD SAFE " ++ U32.show(safe_count(es)) ++ " BUILDING HOT " ++ U32.show(G.danger_count(es)) ++ " PRESSURE " ++ U32.show(pressure) ++ "/" ++ U32.show(pressureEvery), 16, 64, 1, 16768133, coverage)
      status = F.text(phase_text(phase, lives), 16, 80, 1, 11913663, pressureHud)
      costs = F.text("1 RAPID " ++ U32.show(G.cost(0)) ++ "  2 BATCH " ++ U32.show(G.cost(1)) ++ "  3 RELAY " ++ U32.show(G.cost(2)), 16, 478, 1, kind_color(choice), status)
      action = F.text("4 PARALLEL " ++ U32.show(G.cost(3)) ++ " 5 COORD " ++ U32.show(G.cost(4)) ++ " 6 PACK " ++ U32.show(G.cost(5)) ++ " 7 SHIELD " ++ U32.show(G.cost(6)), 16, 491, 1, kind_color(choice), costs)
      controls = F.text("N WAVE SPACE PAUSE A AUTO WAVES R RESET U UP TAB CONTEXT BRACKETS PACE ESC", 16, 503, 1, 12439239, action)
      dashboard(config, state, preview, dynamic, nodes, es, rules, runtime, clock, dropped, overlay(phase, lives, paused, controls))

def view(+config: M.Config, +s: M.State) -> M.State & Image:
  (s, paint(10n, 0, 0, 1024, scene(config, s), False{}))

def dynamic_diagnostics(+d: D.Snapshot) -> String:
  +p = D.package(d)
  +s = D.shield(d)
  " DYN=" ++ yes(D.enabled(d)) ++ " HITS=" ++ U32.show(D.hit_count(d)) ++ " COORD_ID=" ++ U32.show(D.coordinator_id(d)) ++ " DEPENDENTS=" ++ U32.show(D.waiting_count(d)) ++ " RELEASE_READY=" ++ yes(D.release_ready(d)) ++ " PRESSURE_NOW=" ++ U32.show(M.sub(D.shield_danger(s),D.shield_prevented_before(s))) ++ " PRESSURE_WITH=" ++ U32.show(M.sub(D.shield_danger(s),D.shield_prevented_after(s))) ++ " CHARGE_SPEND=" ++ U32.show(D.shield_new_charge_spent(s)) ++ " ELIGIBLE=" ++ U32.show(count_ids(D.package_eligible_ids(p))) ++ " CANDIDATE_NOW=" ++ U32.show(D.package_bytes_before(p)) ++ " CANDIDATE_WITH=" ++ U32.show(D.package_bytes_after(p)) ++ " WRITER_BUSY=" ++ yes(D.package_writer_busy(p))

# Native evidence reads exact current state, without affecting game mechanics.
def diagnostics(+config: M.Config, +state: M.State) -> String:
  +tower = selected_tower(state)
  +writer = G.runtime_writer(G.state_runtime(state))
  " SELECTED=" ++ U32.show(G.state_selected(state)) ++ " KIND=" ++ U32.show(G.tower_kind(tower)) ++ " LEVEL=" ++ U32.show(G.tower_level(tower)) ++ " CHARGE=" ++ U32.show(G.tower_charges(tower)) ++ " ABSORBED=" ++ U32.show(G.tower_prevented(tower)) ++ " BATCH_BYTES=" ++ U32.show(G.writer_bytes(writer)) ++ " BATCH_MEMBERS=" ++ U32.show(count_ids(G.writer_members(writer))) ++ " CONTENT=" ++ U32.show(writer_content(G.state_enemies(state), G.writer_members(writer))) ++ " COORD_TARGET=" ++ U32.show(G.coordinator_target(config, state, tower)) ++ P.diagnostics(P.calculate(config,state)) ++ " CUE=" ++ U32.show(D.cue(config,P.calculate(config,state),D.calculate(config,state))) ++ dynamic_diagnostics(D.calculate(config,state))

def view_auto(+config: M.Config, +s: M.State, auto: String) -> M.State & Image:
  (s, paint(10n, 0, 0, 1024, F.text(auto, 16, 94, 1, 16768133, scene(config, s)), False{}))
