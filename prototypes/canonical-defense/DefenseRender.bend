# Native layouts are read-only projections of the canonical reducer.
import Base
import ./Font.bend as F
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseHost.bend as H
import ./DefenseTeaching.bend as T
import ./DefenseStop.bend as Stop
import ./DefenseRoads.bend as Motion
import ./DefenseMap.bend as D
import ./DefensePreview.bend as Preview
import ./DefenseOutput.bend as O
import ./DefenseEffects.bend as E

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

# A covering front rectangle hides all later rectangles in this tile.
# Stop filtering immediately rather than allocating invisible candidates.
def filter_cut(rs: List<&2,F.Rect>,+x: U32,+y: U32,+size: U32,covered: Bool) -> List<&2,F.Rect>:
  match rs covered:
    case Nil{} _: Nil{}
    case Con{r,_} True{}: Con{r,Nil{}}
    case Con{+r,+tail} False{}:
      keep(overlap(r,x,y,size),r,filter_cut(tail,x,y,size,full(tail,x,y,size)))
def filter(+rs: List<&2,F.Rect>,+x: U32,+y: U32,+size: U32) -> List<&2,F.Rect>:
  filter_cut(rs,x,y,size,full(rs,x,y,size))

# Collapse uniform children, including regions covered by several same-color runs.
def pack(a: Image,b: Image,c: Image,d: Image) -> Image:
  match a b c d:
    case Pix{+ca} Pix{+cb} Pix{+cc} Pix{+cd}:
      Bool.pick(Image,U32.is_eq(ca,cb) && U32.is_eq(ca,cc) && U32.is_eq(ca,cd),Pix{ca},Qua{Pix{ca},Pix{cb},Pix{cc},Pix{cd}})
    case a b c d: Qua{a,b,c,d}

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
      pack(a,b,c,d)

def box(title: String, detail: String, +x: U32, +y: U32, w: U32, h: U32, color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  F.text(title,(x + 12 : U32),(y + 12 : U32),2,color,F.text(detail,(x + 12 : U32),(y + 32 : U32),1,12439239,List.append(&2,F.Rect,rest,[F.Box{x,y,w,h,1914923}])))

def layout_name(layout: U32) -> String:
  match layout:
    case 0: "SWITCHBACK DISTRICT"
    case 1: "FORKED CAMPUS"
    case _: "RESOURCE JUNCTION"

def layout_caption(layout: U32) -> String:
  match layout:
    case 0: "WORK PHASES / SHARED SERVICE BUILDINGS / CANONICAL ROUTES"
    case 1: "EDIT SIBLINGS / DEPENDENCY READINESS / SHARED RESOURCES"
    case _: "INTAKE CORRIDOR / SHARED CHECKPOINT / DELIVERY BRIDGE"

def frame(+layout: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  F.text(layout_name(layout),24,18,3,16050112,F.text(layout_caption(layout),24,46,1,12439239,rest))

# Numeric phase names follow the canonical Work constructors through Projection.
def phase_name(phase: U32) -> String:
  match phase:
    case 0: "AWAITING SOURCE READ"
    case 1: "SOURCE READING"
    case 2: "PREPARING"
    case 3: "REVIEWING"
    case 4: "AT JEV"
    case _: "PENDING FINDING"

def phase_color(phase: U32) -> U32:
  match phase:
    case 0: 15124059
    case 1: 65483
    case 2: 7449343
    case 3: 9756671
    case 4: 16754253
    case _: 15758447

def kind_color(kind: U32) -> U32:
  match kind:
    case 0: 65483
    case 1: 9170322
    case 2: 9756671
    case 3: 65483
    case 4: 16768133
    case 5: 7449343
    case _: 15124059

def palette_row(+kind: U32,+world: M.World,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +y = (118 + kind * 26 : U32)
  F.text(U32.show((kind + 1 : U32)) ++ " " ++ H.tower_name(kind) ++ " " ++ U32.show(H.tower_cost(kind)),818,y,1,kind_color(kind),F.text(H.tower_detail(kind),818,(y + 12 : U32),1,12439239,F.put(806,U32.sub(y,4),3,23,Bool.pick(U32,U32.is_eq(M.choice(world),kind),16777215,1914923),rest)))

def palette(fuel: Nat,+kind: U32,+world: M.World,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n+n: palette_row(kind,world,palette(n,(kind + 1 : U32),world,rest))

def sidebar(+world: M.World,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  box("BUILD ON MAP","1-7 CHOOSE / CLICK GROUND / U UPGRADE",800,80,216,240,65483,palette(7n,0,world,
    box("ACTIVE WORK","TARGET FIRST / ACTUAL UNITS",800,330,216,104,16768133,rest)))

def road_dots(fuel: Nat, +a: D.Point, +b: D.Point, +step: U32, +width: U32, +color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n+n:
      +point = D.segment(a,b,step)
      F.put(U32.sub(D.px(point),(width / 2 : U32)),U32.sub(D.py(point),(width / 2 : U32)),width,width,color,road_dots(n,a,b,(step + 2 : U32),width,color,rest))

# Continuous authored segments need one rectangle; diagonal target links stay dotted.
def axis_distance(+a: U32,+b: U32) -> U32:
  M.sub(U32.max(a,b),U32.min(a,b))
def road_segment_kind(+a: D.Point,+b: D.Point,width: U32) -> U32:
  +length = (axis_distance(D.px(a),D.px(b)) + axis_distance(D.py(a),D.py(b)) : U32)
  Bool.pick(U32,(length <= 50 * width : U32),Bool.pick(U32,U32.is_eq(D.py(a),D.py(b)),0,Bool.pick(U32,U32.is_eq(D.px(a),D.px(b)),1,2)),2)
def road_segment(kind: U32,+a: D.Point,+b: D.Point,+width: U32,color: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match kind:
    case 0: F.put(M.sub(U32.min(D.px(a),D.px(b)),(width / 2 : U32)),M.sub(D.py(a),(width / 2 : U32)),(axis_distance(D.px(a),D.px(b)) + width : U32),width,color,rest)
    case 1: F.put(M.sub(D.px(a),(width / 2 : U32)),M.sub(U32.min(D.py(a),D.py(b)),(width / 2 : U32)),width,(axis_distance(D.py(a),D.py(b)) + width : U32),color,rest)
    case _: road_dots(51n,a,b,0,width,color,rest)

def road(points: List<&2,D.Point>, +width: U32, +color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match points:
    case Nil{}: rest
    case Con{_,Nil{}}: rest
    case Con{+a,Con{+b,tail}}:
      road_segment(road_segment_kind(a,b,width),a,b,width,color,road(Con{b,tail},width,color,rest))

def asphalt(+points: List<&2,D.Point>, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  road(points,14,3358535,road(points,22,5003871,rest))

def exits(+world: M.World,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +layout = M.layout(world)
  +clear = D.outer_point(D.port(D.center(layout,4,0),D.clear_side(layout)),D.clear_side(layout))
  +delivery = D.outer_point(D.exit_port(layout,5),D.exit_side(layout,5))
  F.text("CLEAR EXIT " ++ U32.show(M.clear(world)),(D.px(clear) + 8 : U32),U32.sub(D.py(clear),7),1,9170322,
    F.text("DELIVERY " ++ U32.show(M.delivered(world)),(D.px(delivery) + 8 : U32),(D.py(delivery) + 2 : U32),1,65483,
      road(D.clear_route(layout),8,9170322,road(D.delivery_route(layout),8,65483,rest))))

def network(+layout: U32, +world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  asphalt(D.source_route(layout),asphalt(D.preparation_route(layout),asphalt(D.review_route(layout,0),asphalt(D.review_route(layout,1),asphalt(D.retained_route(layout),exits(world,rest))))))

def branch_count(tokens: List<&2,P.Token>, +world: M.World, +phase: U32, +side: U32) -> U32:
  match tokens:
    case Nil{}: 0
    case Con{+token,tail}: (Bool.to_u32(U32.is_eq(P.phase(token),phase) && U32.is_eq(Motion.branch(world,token),side)) + branch_count(tail,world,phase,side) : U32)

def door_open(+layout: U32,+phase: U32,+edge: U32) -> Bool:
  U32.is_eq(edge,D.entry_side(layout,phase,0)) || U32.is_eq(edge,D.entry_side(layout,phase,1)) ||
    U32.is_eq(edge,D.exit_side(layout,phase)) || (U32.is_eq(phase,4) && U32.is_eq(edge,D.clear_side(layout)))

def wall(open: Bool,+edge: U32,+point: D.Point,+color: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match open edge:
    case False{} 0: F.put(U32.sub(D.px(point),32),U32.sub(D.py(point),24),3,48,color,rest)
    case False{} 1: F.put((D.px(point) + 29 : U32),U32.sub(D.py(point),24),3,48,color,rest)
    case False{} 2: F.put(U32.sub(D.px(point),32),U32.sub(D.py(point),24),64,3,color,rest)
    case False{} _: F.put(U32.sub(D.px(point),32),(D.py(point) + 21 : U32),64,3,color,rest)
    case True{} 0: F.put(U32.sub(D.px(point),32),U32.sub(D.py(point),24),3,12,color,F.put(U32.sub(D.px(point),32),(D.py(point) + 12 : U32),3,12,color,rest))
    case True{} 1: F.put((D.px(point) + 29 : U32),U32.sub(D.py(point),24),3,12,color,F.put((D.px(point) + 29 : U32),(D.py(point) + 12 : U32),3,12,color,rest))
    case True{} 2: F.put(U32.sub(D.px(point),32),U32.sub(D.py(point),24),20,3,color,F.put((D.px(point) + 12 : U32),U32.sub(D.py(point),24),20,3,color,rest))
    case True{} _: F.put(U32.sub(D.px(point),32),(D.py(point) + 21 : U32),20,3,color,F.put((D.px(point) + 12 : U32),(D.py(point) + 21 : U32),20,3,color,rest))

def room_walls(+layout: U32,+phase: U32,+point: D.Point,+color: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  wall(door_open(layout,phase,0),0,point,color,wall(door_open(layout,phase,1),1,point,color,
    wall(door_open(layout,phase,2),2,point,color,wall(door_open(layout,phase,3),3,point,color,rest))))

def room_other_entry(on: Bool,+layout: U32,+phase: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}: road(D.room_route(layout,phase,1),3,7042681,rest)

def site_shape(enclosed: Bool,+layout: U32,+phase: U32,+point: D.Point,+x: U32,+y: U32,color: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match enclosed:
    case True{}:
      List.append(&2,F.Rect,room_walls(layout,phase,point,color,
        road(D.room_route(layout,phase,0),3,7042681,room_other_entry(U32.is_eq(layout,1) && U32.is_eq(phase,4),layout,phase,rest))),[F.Box{x,y,64,48,1914923}])
    case False{}: F.put(x,(y + 45 : U32),64,3,color,rest)

def site_pressure(tokens: List<&2,P.Token>,+world: M.World,+phase: U32) -> U32:
  match tokens:
    case Nil{}: 0
    case Con{+token,tail}: (Bool.pick(U32,U32.is_eq(P.phase(token),phase) && H.in_building(world,token),P.bytes(token),0) + site_pressure(tail,world,phase) : U32)

def preparation_pool(+world: M.World,+x: U32,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  F.text("PREP SHARED " ++ U32.show(T.preparation_used(world)) ++ "/" ++ U32.show(T.preparation_limit()) ++ " / HOST " ++ U32.show(H.source_permits(world)),x,(y + 80 : U32),1,65483,
    F.text("LEDGER SHARED / NO ROOM CAP",x,(y + 91 : U32),1,12439239,rest))
def building_permits(phase: U32,+world: M.World,+x: U32,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match phase:
    case 1: preparation_pool(world,x,y,rest)
    case 2: preparation_pool(world,x,y,rest)
    case 4: F.text("JEV SHARED " ++ U32.show(P.requests(world)) ++ "/" ++ U32.show(T.request_limit()) ++ " / HOST " ++ U32.show(E.permits(world,4)),x,(y + 80 : U32),1,65483,
      F.text("LEDGER SHARED / OWNED UNTIL ACK",x,(y + 91 : U32),1,12439239,rest))
    case _: F.text("WRITER OWNERS " ++ U32.show(P.writes(world)),x,(y + 80 : U32),1,65483,rest)

def health_bar(on: Bool,+world: M.World,+phase: U32,+x: U32,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}:
      +hot = site_pressure(P.tokens(world),world,phase)
      F.text("HOT " ++ U32.show(hot),x,(y + 69 : U32),1,Bool.pick(U32,(hot > 0 : U32),15758447,12439239),
        F.put(x,(y + 61 : U32),(64 * M.hp(world) / 100 : U32),3,Bool.pick(U32,(hot > 0 : U32) && (M.hp(world) < 100 : U32),15758447,9170322),F.put(x,(y + 61 : U32),64,3,5003871,building_permits(phase,world,x,y,rest))))

def queue_caption(+layout: U32,side: U32) -> D.Point:
  match layout:
    case 0: D.Point{600,552}
    case 1: D.Point{Bool.pick(U32,U32.is_eq(side,0),80,564),450}
    case _: D.Point{612,562}
def queue_details(phase: U32,+world: M.World,+side: U32,x: U32,y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match phase:
    case 3:
      +caption = queue_caption(M.layout(world),side)
      +cx = D.px(caption)
      +cy = D.py(caption)
      F.text("TRAVEL " ++ U32.show(T.review_count(M.work(M.core(world)),world,side,False{})) ++ " / PERMIT WAIT " ++ U32.show(T.review_count(M.work(M.core(world)),world,side,True{})),cx,cy,1,65483,
        F.text("JEV REQUESTS " ++ U32.show(P.requests(world)) ++ "/" ++ U32.show(E.permits(world,4)) ++ " HOST / CORE " ++ U32.show(T.request_limit()),cx,(cy + 12 : U32),1,12439239,
          F.text("ROAD SHOTS / WAIT AT JEV DOOR",cx,(cy + 24 : U32),1,12439239,rest)))
    case _: rest

def building(+world: M.World, +phase: U32, +side: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +point = D.center(M.layout(world),phase,side)
  +x = U32.sub(D.px(point),32)
  +y = U32.sub(D.py(point),24)
  +enclosed = Bool.not(U32.is_eq(phase,0) || U32.is_eq(phase,3))
  +title = Bool.pick(String,U32.is_eq(phase,0),"SOURCE QUEUE / SAFE",Bool.pick(String,U32.is_eq(phase,3),"TO JEV / REVIEW QUEUE",phase_name(phase)))
  +count = Bool.pick(U32,U32.is_eq(M.layout(world),1) && U32.is_eq(phase,3),branch_count(P.tokens(world),world,phase,side),P.count(world,phase))
  F.text(title,x,U32.sub(y,13),1,phase_color(phase),F.text("OWNED " ++ U32.show(count),x,(y + 53 : U32),1,phase_color(phase),queue_details(phase,world,side,x,y,health_bar(enclosed,world,phase,x,y,site_shape(enclosed,M.layout(world),phase,point,x,y,Bool.pick(U32,(M.damage_flash(world) > 0 : U32) && (site_pressure(P.tokens(world),world,phase) > 0 : U32),15758447,phase_color(phase)),rest)))))

def buildings(fuel: Nat, +phase: U32, +world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n+n: building(world,phase,0,buildings(n,(phase + 1 : U32),world,rest))

def extra_building(on: Bool, world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case True{}: building(world,3,1,rest)
    case False{}: rest

def ring(fuel: Nat, +x: U32, +y: U32, +radius: U32, +color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n++n:
      +angle = (U32.to_f32(U32.from_nat(n)) * 6.283185 / 48.0 : F32)
      px = F32.to_u32(F32.max(0.0,(U32.to_f32(x) + F32.cos(angle) * U32.to_f32(radius) : F32)))
      py = F32.to_u32(F32.max(0.0,(U32.to_f32(y) + F32.sin(angle) * U32.to_f32(radius) : F32)))
      F.put(px,py,2,2,color,ring(n,x,y,radius,color,rest))

def roof(fuel: Nat,+x: U32,+y: U32,+color: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n++n:
      +row = (10 - U32.from_nat(n) : U32)
      F.put(U32.sub(x,row),(y + row : U32),(row * 2 : U32),2,color,roof(n,x,y,color,rest))

def processor_icon(+x: U32,+y: U32,kind: U32,level: U32,+color: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  roof(10n,x,U32.sub(y,17),color,F.text(U32.show((kind + 1 : U32)) ++ " L" ++ U32.show(level),U32.sub(x,14),(y + 14 : U32),1,color,F.put(U32.sub(x,4),U32.sub(y,3),9,10,3028557,F.put(U32.sub(x,11),U32.sub(y,7),23,19,color,rest))))

def beam_if(on: Bool,+world: M.World,+tower: M.Tower,token: P.Token,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}: road_dots(51n,D.Point{M.tx(tower),M.ty(tower)},H.unit_point(world,token),0,2,kind_color(M.tkind(tower)),rest)

def beam_target(tokens: List<&2,P.Token>,+world: M.World,+tower: M.Tower,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match tokens:
    case Nil{}: rest
    case Con{+token,tail}:
      beam_if(U32.is_eq(P.id(token),M.number(M.aim(tower))) && (M.flash(tower) > 0 : U32),world,tower,token,beam_target(tail,world,tower,rest))

def selected_ring(on: Bool,+tower: M.Tower,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}: ring(48n,M.tx(tower),M.ty(tower),H.tower_range(M.tkind(tower),M.level(tower)),kind_color(M.tkind(tower)),rest)

def processors(ts: List<&2,M.Tower>,+world: M.World,+index: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match ts:
    case Nil{}: rest
    case Con{+tower,tail}:
      processor_icon(M.tx(tower),M.ty(tower),M.tkind(tower),M.level(tower),kind_color(M.tkind(tower)),
        selected_ring(U32.is_eq(M.selected(world),index),tower,beam_target(P.tokens(world),world,tower,processors(tail,world,(index + 1 : U32),rest))))

def cue_color(status: U32) -> U32:
  match status:
    case 1: 65483
    case 4: 13265499
    case 5: 13265499
    case _: 15758447

def stat_label(kind: U32) -> String:
  match kind:
    case 0: "NEXT SHOT TRAVEL / WORK"
    case 1: "NEXT SHOT SIMULATED RISK %"
    case 2: "NEXT SHOT TRAVEL / WORK"
    case 3: "HOST LAUNCH LIMIT"
    case 4: "BLOCKING SIBLING REMAINING WORK"
    case 5: "NEXT BATCH TARGET"
    case _: "ONE TICK HEALTH DAMAGE WORK"

def text_width(value: String) -> U32:
  match value:
    case SNil{}: 0
    case SCon{_,tail}: (8 + text_width(tail) : U32)

def stat_delta(+preview: Preview.Preview,+x: U32,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +current = U32.show(Preview.before(preview))
  +sign = Bool.pick(String,Preview.reduction(Preview.kind(preview))," - "," + ")
  F.text(current,x,y,2,16777215,F.text(sign ++ U32.show(Preview.delta(preview)),(x + text_width(current) : U32),y,2,cue_color(Preview.status(preview)),rest))

def actionable_stats(on: Bool,preview: Preview.Preview,x: U32,y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case True{}: stat_delta(preview,x,y,rest)
    case False{}: F.text("BUILD UNAVAILABLE",x,y,1,15758447,rest)

def secondary_stats(on: Bool,+preview: Preview.Preview,+x: U32,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}:
      +value = U32.show(Preview.secondary_before(preview))
      F.text("NEXT ITEM WORK TICKS",x,y,1,12439239,
        F.text(value,x,(y + 12 : U32),2,16777215,
          F.text(" - " ++ U32.show(Preview.secondary_delta(preview)),(x + text_width(value) : U32),(y + 12 : U32),2,cue_color(Preview.status(preview)),rest)))

def placement_point(+world: M.World,preview: Preview.Preview,operation: Nat) -> D.Point:
  match operation:
    case 0n: D.center(M.layout(world),Preview.site(preview),0)
    case operation: H.point_found(world,E.find_work(operation,M.work(M.core(world))))

def placement_link(on: Bool,+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}:
      +point = placement_point(world,preview,Preview.target(preview))
      +color = cue_color(Preview.status(preview))
      +label_y = Bool.pick(U32,(D.py(point) > 500 : U32),U32.sub(D.py(point),92),(D.py(point) + 76 : U32))
      road_dots(51n,D.Point{Preview.x(preview),Preview.y(preview)},point,0,1,color,
        ring(48n,D.px(point),D.py(point),Bool.pick(U32,Nat.is_eq(Preview.target(preview),0n),42,18),color,
          F.text(stat_label(Preview.kind(preview)),U32.max(24,M.sub(D.px(point),64)),label_y,1,12439239,
            stat_delta(preview,U32.max(24,M.sub(D.px(point),32)),(label_y + 12 : U32),secondary_stats(U32.is_eq(Preview.kind(preview),5),preview,U32.sub(D.px(point),32),(label_y + 28 : U32),rest)))))

def generic_panel(+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  box("PLACEMENT SNAPSHOT",Preview.reason(preview),800,538,216,184,cue_color(Preview.status(preview)),
    F.text(stat_label(Preview.kind(preview)),812,584,1,12439239,
      actionable_stats(Preview.legal(preview),preview,812,604,
        F.text("GOLD " ++ U32.show(M.gold(world)) ++ " - " ++ U32.show(Preview.cost(preview)),812,666,1,15758447,
          F.text("RANGE " ++ U32.show(Preview.range(preview)) ++ " / AUTO EFFECT",812,684,1,12439239,
            F.text("NO MANUAL ACTIVATION",812,702,1,12439239,rest))))))
def batch_panel(+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +after = H.hypothetical(world,Preview.x(preview),Preview.y(preview),5)
  box("NEXT BATCH / GHOST",T.batch_reason(world),800,538,216,184,cue_color(Preview.status(preview)),
    F.text("NOW U" ++ T.ids_short(T.candidates(world),5n),812,584,1,16777215,
      F.text("GHOST U" ++ T.ids_short(T.candidates(after),5n),812,600,1,65483,
        F.text("COUNT " ++ U32.show(T.candidate_count(world)) ++ " TO " ++ U32.show(T.candidate_count(after)) ++ " / TARGET " ++ U32.show(O.batch_target(after)),812,616,1,16777215,
          F.text("BYTES " ++ U32.show(T.candidate_bytes(world)) ++ " TO " ++ U32.show(T.candidate_bytes(after)),812,632,1,65483,
            F.text("WRITER TICKS " ++ U32.show(T.candidate_work(world)) ++ " TO " ++ U32.show(T.candidate_work(after)),812,648,1,65483,
              F.text("LOCKED U" ++ T.ids_short(O.selection_members(world),4n),812,664,1,15758447,
                F.text("ACK BASE " ++ U32.show(O.acknowledgement_work(after)) ++ "T / BYTES UNTIL ACK",812,682,1,12439239,
                  F.text("CANDIDATES NOW / FUTURE ARRIVALS UNKNOWN",812,700,1,12439239,rest)))))))))
def coordinator_panel(+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +target = Preview.target(preview)
  +family = T.target_family(world,target)
  box("SIBLING DEPENDENCY",Preview.reason(preview),800,538,216,184,cue_color(Preview.status(preview)),
    F.text(Bool.pick(String,Nat.is_eq(target,0n),"NO ACTIVE BLOCKING SIBLING","TARGET U" ++ Nat.show(target) ++ " E" ++ Nat.show(family)),812,584,1,16777215,
      stat_delta(preview,812,602,
        F.text("WAITING U" ++ T.ids_short(T.family_members(P.tokens(world),family,1),5n),812,626,1,15758447,
          F.text(Bool.pick(String,Nat.is_eq(target,0n),"NO COMPLETION FORECAST",Bool.pick(String,T.final_blocker(world,target,Preview.delta(preview)),"THIS SHOT FINISHES LAST SIBLING","MORE SIBLING WORK REMAINS")),812,644,1,65483,
            F.text("SIBLING DONE DOES NOT MEAN READY",812,664,1,12439239,
              F.text("READY DOES NOT MEAN BATCH OR ACK",812,682,1,12439239,
                F.text("SCENARIO BATCH WAITS FOR ALL WORK",812,700,1,12439239,rest))))))))
def shield_panel(+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +after = H.hypothetical(world,Preview.x(preview),Preview.y(preview),6)
  box("GAME PROTECTION",Bool.pick(String,Bool.not(H.pressure_hot(H.building_pressure_bytes(world))),"COVERED / NO DAMAGING PRESSURE",Bool.pick(String,U32.is_eq(Preview.delta(preview),0),"OVERLAP CAP / NO EXTRA PROTECTION","DAMAGE CHANGES / OWNERSHIP DOES NOT")),800,538,216,184,cue_color(Preview.status(preview)),
    F.text("DAMAGE WORK PER TICK",812,584,1,12439239,
      stat_delta(preview,812,602,
        F.text("RAW ROOM BYTES " ++ U32.show(H.building_pressure_bytes(world)),812,626,1,16777215,
          F.text("EXTRA PROTECTED " ++ U32.show(M.sub(H.shield_bytes(H.shield_allocation(after)),H.shield_bytes(H.shield_allocation(world)))) ++ " GAME BYTES",812,644,1,65483,
            F.text("NEW TOWER CHARGES NEXT TICK " ++ U32.show(T.shield_next_spend(after)),812,662,1,65483,
              F.text("LEDGER STILL " ++ U32.show(P.ledger_bytes(world)) ++ " BYTES",812,682,1,15758447,
                F.text("GAME METAPHOR / NO CORE CAPACITY GAIN",812,700,1,12439239,rest))))))))
def refiner_panel(+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  box("PREVENTION / RISK",Preview.reason(preview),800,538,216,184,cue_color(Preview.status(preview)),
    F.text("SIMULATED FINDINGS RISK",812,584,1,12439239,
      stat_delta(preview,812,602,
        F.text("MINIMUM RISK 60% / SAME AT EVERY LEVEL",812,632,1,65483,
          F.text("REPEATED SHOTS HAVE DIMINISHING EFFECT",812,650,1,12439239,
            F.text("UPGRADES REACH THE FLOOR FASTER",812,668,1,12439239,
              F.text("SATURATED TARGETS RECEIVE NO SHOTS",812,686,1,12439239,
                F.text("OBSERVED FINDINGS CANNOT BE REWRITTEN",812,704,1,15758447,rest))))))))
def preview_panel(kind: U32,legal: Bool,world: M.World,preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match kind legal:
    case 1 True{}: refiner_panel(world,preview,rest)
    case 5 True{}: batch_panel(world,preview,rest)
    case 4 True{}: coordinator_panel(world,preview,rest)
    case 6 True{}: shield_panel(world,preview,rest)
    case _ _: generic_panel(world,preview,rest)
def ghost_visible(on: Bool,+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}:
      +color = cue_color(Preview.status(preview))
      +x = Preview.x(preview)
      +y = Preview.y(preview)
      ring(48n,x,y,Preview.range(preview),color,processor_icon(x,y,Preview.kind(preview),1,color,
        placement_link(Preview.legal(preview) && Bool.not(U32.is_eq(Preview.site(preview),255)),world,preview,
          preview_panel(Preview.kind(preview),Preview.legal(preview),world,preview,rest))))

def note_kind(kind: U32,+charges: U32) -> String:
  match kind:
    case 1: "RISK FLOOR60 / UPGRADES REACH IT FASTER"
    case 3: "WORKERS / STORAGE UNCHANGED"
    case 4: "ONLY REAL BLOCKING SIBLINGS"
    case 5: "NEXT BATCH / COMMITTED BYTES FIXED"
    case 6: Bool.pick(String,U32.is_eq(charges,0),"GAME SHIELD / CHARGES EXHAUSTED","GAME SHIELD CHARGE " ++ U32.show(charges))
    case _: "NEXT SHOT / ACTUAL TARGET WORK"

def selected_note(+tower: M.Tower) -> String:
  note_kind(M.tkind(tower),M.charges(tower))

def actual_current_kind(kind: U32,+world: M.World,+tower: M.Tower) -> U32:
  match kind:
    case 1:
      +id = E.target(world,tower)
      Bool.pick(U32,Nat.is_eq(id,0n),0,M.timer_risk(E.find_timer(id,M.timers(world))))
    case 3: Bool.pick(U32,E.supports(world,tower,4),E.permits(world,4),H.source_permits(world))
    case 5: O.batch_target(world)
    case 6: H.residual_damage(world)
    case _: H.target_remaining(world,E.find_work(E.target(world,tower),M.work(M.core(world))))

def actual_current(+world: M.World,+tower: M.Tower) -> U32:
  actual_current_kind(M.tkind(tower),world,tower)

def inspection_if(on: Bool,+world: M.World,+tower: M.Tower,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}:
      box("SELECTED " ++ H.tower_name(M.tkind(tower)),Bool.pick(String,(M.level(tower) >= 3 : U32),"MAX LEVEL 3","LEVEL " ++ U32.show(M.level(tower)) ++ " / U COST " ++ U32.show(H.upgrade_cost(M.level(tower)))),800,538,216,184,kind_color(M.tkind(tower)),
        F.text("RANGE " ++ U32.show(H.tower_range(M.tkind(tower),M.level(tower))),812,584,1,12439239,
          F.text("COOLDOWN " ++ U32.show((M.cooldown(tower) * 20 : U32)) ++ " MS",812,602,1,12439239,
            F.text(stat_label(M.tkind(tower)),812,624,1,12439239,
              F.text(U32.show(actual_current(world,tower)),812,640,2,16777215,
                F.text(selected_note(tower),812,666,1,15124059,
                  F.text("CURRENT SNAPSHOT / ZERO IF NO TARGET",812,684,1,12439239,rest)))))))

def inspection(ts: List<&2,M.Tower>,+world: M.World,+index: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match ts:
    case Nil{}: rest
    case Con{+tower,tail}: inspection_if(U32.is_eq(index,M.selected(world)),world,tower,inspection(tail,world,(index + 1 : U32),rest))

def ghost(+world: M.World,+preview: Preview.Preview,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  ghost_visible(Bool.not(U32.is_eq(Preview.status(preview),0)) && (Preview.x(preview) < 792 : U32) && (Preview.y(preview) > 100 : U32) && (Preview.y(preview) < 656 : U32),world,preview,inspection(M.towers(world),world,1,rest))

def unit_work_row(+token: P.Token,remaining: U32,risk: U32,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  F.text("U" ++ U32.show(P.id(token)) ++ " E" ++ U32.show(P.family(token)) ++ Bool.pick(String,U32.is_eq(P.phase(token),5)," RETAINED"," REM " ++ U32.show(remaining)),812,y,1,phase_color(P.phase(token)),
    F.text(Bool.pick(String,U32.is_eq(P.phase(token),5),"FINDING / RETAINED OWNERSHIP","SIMULATED RISK " ++ U32.show(risk) ++ "% BEFORE RESPONSE"),812,(y + 8 : U32),1,12439239,rest))

def work_row_if(on: Bool,+token: P.Token,+world: M.World,index: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}: unit_work_row(token,H.remaining(world,token),H.risk(world,token),(375 + index * 20 : U32),rest)

def work_rows(tokens: List<&2,P.Token>,+world: M.World,+index: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match tokens:
    case Nil{}: rest
    case Con{+token,tail}:
      work_row_if((index < 2 : U32),token,world,index,work_rows(tail,world,(index + 1 : U32),rest))

def waiting_at_end(+world: M.World,+token: P.Token) -> Bool:
  +point = H.unit_point(world,token)
  +end = D.path_position(D.room_route(M.layout(world),5,0),D.path_length(D.room_route(M.layout(world),5,0)))
  H.in_building(world,token) && U32.is_eq(D.px(point),D.px(end)) && U32.is_eq(D.py(point),D.py(end))
def waiting_phase(phase: U32,+world: M.World,+token: P.Token) -> Bool:
  match phase:
    case 5: waiting_at_end(world,token)
    case _: False{}
def waiting_end(+world: M.World,+token: P.Token) -> Bool:
  waiting_phase(P.phase(token),world,token)
# Classify each actor once per frame. Ranking must not recompute everybody's path.
def waiting_keep(on: Bool,id: U32,rest: List<&2,U32>) -> List<&2,U32>:
  match on:
    case True{}: id <> rest
    case False{}: rest
def waiting_ids(tokens: List<&2,P.Token>,+world: M.World) -> List<&2,U32>:
  match tokens:
    case Nil{}: Nil{}
    case +token <> rest:
      waiting_keep(waiting_end(world,token),P.id(token),waiting_ids(rest,world))
def wait_rank(ids: List<&2,U32>,+id: U32) -> U32:
  match ids:
    case Nil{}: 0
    case head <> tail: (Bool.to_u32((head < id : U32)) + wait_rank(tail,id) : U32)
def is_waiting(ids: List<&2,U32>,+id: U32) -> Bool:
  match ids:
    case Nil{}: False{}
    case head <> tail: Bool.or(U32.is_eq(head,id),is_waiting(tail,id))

# Authored monster silhouettes. Road9x12 cells scaled2; interior7x8.
# A contiguous run equals the original cell union, including expanded outlines.
def sprite_run(run: U32,+column: U32,+x: U32,+y: U32,+size: U32,+height: U32,+color: U32,+outline: Bool,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match run:
    case 0: rest
    case +length:
      +left = (x + M.sub(column,length) * size : U32)
      F.put(Bool.pick(U32,outline,M.sub(left,1),left),Bool.pick(U32,outline,M.sub(y,1),y),
        ((length * size) + Bool.pick(U32,outline,2,0) : U32),(height + Bool.pick(U32,outline,2,0) : U32),color,rest)
def sprite_scan(fuel: Nat,+mask: U32,+column: U32,+run: U32,+x: U32,+y: U32,+size: U32,+height: U32,+color: U32,+outline: Bool,on: Bool,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel on:
    case 0n _: sprite_run(run,column,x,y,size,height,color,outline,rest)
    case 1n+n True{}:
      sprite_scan(n,mask,(column + 1 : U32),(run + 1 : U32),x,y,size,height,color,outline,
        Bool.not(U32.is_eq(((mask >> U32.to_nat((column + 1 : U32))) .&. 1 : U32),0)),rest)
    case 1n+n False{}:
      sprite_scan(n,mask,(column + 1 : U32),0,x,y,size,height,color,outline,
        Bool.not(U32.is_eq(((mask >> U32.to_nat((column + 1 : U32))) .&. 1 : U32),0)),sprite_run(run,column,x,y,size,height,color,outline,rest))
def sprite_row(fuel: Nat,+mask: U32,+column: U32,x: U32,y: U32,+size: U32,color: U32,outline: Bool,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  sprite_scan(fuel,mask,column,0,x,y,size,size,color,outline,Bool.not(U32.is_eq(((mask >> U32.to_nat(column)) .&. 1 : U32),0)),rest)

type MaskRun is Data:
  MaskRun{mask: U32, rows: U32}
def add_mask_run(+mask: U32,runs: List<&2,MaskRun>) -> List<&2,MaskRun>:
  match runs:
    case Nil{}: [MaskRun{mask,1}]
    case MaskRun{+head,+count} <> +tail:
      Bool.pick(List<&2,MaskRun>,U32.is_eq(mask,head),MaskRun{mask,(count + 1 : U32)} <> tail,MaskRun{mask,1} <> MaskRun{head,count} <> tail)
def mask_runs(rows: List<&2,U32>) -> List<&2,MaskRun>:
  match rows:
    case Nil{}: []
    case row <> tail: add_mask_run(row,mask_runs(tail))
def sprite_blocks(runs: List<&2,MaskRun>,+width: Nat,+x: U32,+y: U32,+size: U32,+color: U32,+outline: Bool,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match runs:
    case Nil{}: rest
    case MaskRun{+mask,+count} <> tail:
      sprite_scan(width,mask,0,0,x,y,size,(count * size : U32),color,outline,Bool.not(U32.is_eq((mask .&. 1 : U32),0)),
        sprite_blocks(tail,width,x,(y + count * size : U32),size,color,outline,rest))
def sprite_rows(rows: List<&2,U32>,width: Nat,x: U32,y: U32,size: U32,color: U32,outline: Bool,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  sprite_blocks(mask_runs(rows),width,x,y,size,color,outline,rest)

def silhouette(+rows: List<&2,U32>,+width: Nat,+x: U32,+y: U32,+size: U32,color: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  sprite_rows(rows,width,x,y,size,color,False{},sprite_rows(rows,width,x,y,size,1058076,True{},rest))

def monster_at(+x: U32,+y: U32,small: Bool,+color: U32,+step: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match small:
    case True{}:
      F.put(U32.sub(x,2),U32.sub(y,1),1,1,16777215,F.put((x + 2 : U32),U32.sub(y,1),1,1,16777215,
        F.put(x,(y + 1 : U32),1,1,1058076,silhouette([34,62,127,127,127,62,54,99],7n,U32.sub(x,3),U32.sub(y,4),1,color,rest))))
    case False{}:
      F.put(U32.sub(x,5),U32.sub(y,4),4,4,16777215,F.put((x + 3 : U32),U32.sub(y,4),4,4,16777215,
        F.put(U32.sub(x,3),U32.sub(y,3),2,2,1058076,F.put((x + 3 : U32),U32.sub(y,3),2,2,1058076,
          F.put(U32.sub(x,2),(y + 3 : U32),6,2,1058076,
            silhouette([68,198,124,254,254,254,254,511,254,124,108,Bool.pick(U32,U32.is_eq((step % 2 : U32),0),238,220)],9n,U32.sub(x,9),U32.sub(y,12),2,color,rest))))))

def monster(+point: D.Point,small: Bool,color: U32,step: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  monster_at(D.px(point),D.py(point),small,color,step,rest)

def wait_point(+world: M.World,+token: P.Token,ids: List<&2,U32>) -> D.Point:
  +rank = wait_rank(ids,P.id(token))
  +center = D.center(M.layout(world),5,0)
  D.Point{(U32.sub(D.px(center),21) + rank % 4 * 14 : U32),(U32.sub(D.py(center),15) + rank / 4 * 10 : U32)}
def actor_point_at(on: Bool,world: M.World,token: P.Token,ids: List<&2,U32>) -> D.Point:
  match on:
    case True{}: wait_point(world,token,ids)
    case False{}: H.unit_point(world,token)
def actor_point(+world: M.World,+token: P.Token,+ids: List<&2,U32>) -> D.Point:
  actor_point_at(is_waiting(ids,P.id(token)),world,token,ids)
def wait_actor(world: M.World,token: P.Token,ids: List<&2,U32>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  monster(wait_point(world,token,ids),True{},phase_color(5),0,rest)

def actor_unit(+world: M.World,+token: P.Token,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +point = H.unit_point(world,token)
  +small = H.in_building(world,token)
  +label_x = (D.px(point) + Bool.pick(U32,small,6,13) : U32)
  +label_y = U32.sub(D.py(point),Bool.pick(U32,small,2,13))
  F.text("U" ++ U32.show(P.id(token)) ++ Bool.pick(String,small,""," E" ++ U32.show(P.family(token))),label_x,label_y,1,16777215,
    monster(point,small,phase_color(P.phase(token)),((M.time(world) / 8 + P.id(token)) % 2 : U32),rest))

def waiting_actor(on: Bool,+world: M.World,+token: P.Token,ids: List<&2,U32>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: actor_unit(world,token,rest)
    case True{}: wait_actor(world,token,ids,rest)

def actor_role(file: Bool,+world: M.World,+token: P.Token,+ids: List<&2,U32>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match file:
    case False{}: waiting_actor(is_waiting(ids,P.id(token)),world,token,ids,rest)
    case True{}:
      +point = H.unit_point(world,token)
      F.text("FILE U" ++ U32.show(P.id(token)) ++ " E" ++ U32.show(P.family(token)),(D.px(point) + 8 : U32),D.py(point),1,12439239,
        F.put(U32.sub(D.px(point),2),U32.sub(D.py(point),3),5,7,12439239,rest))

def actor(+world: M.World,+token: P.Token,ids: List<&2,U32>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  actor_role(U32.is_eq(P.phase(token),1) && (P.parent_children(world,P.family(token)) > 0 : U32),world,token,ids,rest)

def actors(tokens: List<&2,P.Token>, +world: M.World,+ids: List<&2,U32>, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match tokens:
    case Nil{}: rest
    case Con{token,tail}: actor(world,token,ids,actors(tail,world,ids,rest))

def wait_count(tokens: List<&2,P.Token>,world: M.World) -> U32:
  M.number(List.length(&2,U32,waiting_ids(tokens,world)))
def wait_label(+world: M.World,ids: List<&2,U32>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +point = D.center(M.layout(world),5,0)
  F.text("WAIT SLOTS " ++ U32.show(M.number(List.length(&2,U32,ids))),U32.sub(D.px(point),32),(D.py(point) + 66 : U32),1,15758447,rest)

def output_hud(+world: M.World,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  F.text("OUTPUT NEXT " ++ U32.show(O.batch_target(world)) ++ " / ITEM " ++ U32.show(O.item_work(world)) ++ " TICKS / SCENARIO WAITS FOR ALL REVIEW WORK",24,674,1,7449343,
    F.text("COMMITTED " ++ U32.show(M.number(List.length(&2,Nat,O.selection_members(world)))) ++ " / BYTES " ++ U32.show(O.selection_bytes(world)) ++ " / LEFT " ++ U32.show((O.remaining(world) * 20 : U32)) ++ " MS",388,686,1,65483,
      F.text(Bool.pick(String,T.flush_running(world),"FLUSH IN " ++ U32.show((O.flush_remaining(world) * 20 : U32)) ++ " MS", "FLUSH IDLE / " ++ T.batch_reason(world)) ++ " / LEASES " ++ U32.show(P.leases(world)) ++ " / UNCERTAIN " ++ U32.show(P.uncertain(world)),24,690,1,12439239,
        F.text("SHARED LEDGER " ++ U32.show(P.ledger_items(world)) ++ "/" ++ U32.show(P.ledger_item_limit(world)) ++ " ITEMS " ++ U32.show(P.ledger_bytes(world)) ++ "/" ++ U32.show(P.ledger_byte_limit(world)) ++ " B / P1 " ++ U32.show(T.partition_bytes(world)) ++ "/" ++ U32.show(T.partition_byte_limit_value(T.partition_limits(world))) ++ " B / NO ROOM CAPS",24,706,1,16768133,
          F.text(Stop.phase_name(world) ++ Bool.pick(String,U32.is_eq(M.stop_state(world),1)," / " ++ U32.show((Stop.remaining(world) * 20 : U32)) ++ " MS","") ++ " / CUT OPS " ++ T.ids_short(M.cancelled(world),6n) ++ " / CLEANUP " ++ U32.show(M.cleanup_left(world)),24,726,1,Bool.pick(U32,(M.stop_state(world) >= 3 : U32),15758447,9170322),
            F.put(24,719,U32.min(744,(744 * P.ledger_bytes(world) / U32.max(1,P.ledger_byte_limit(world)) : U32)),2,16768133,F.put(24,719,744,2,2901312,rest)))))))

def layout_scene(+layout: U32,+world: M.World,+tokens: List<&2,P.Token>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +ids = waiting_ids(tokens,world)
  wait_label(world,ids,actors(tokens,world,ids,extra_building(U32.is_eq(layout,1),world,buildings(6n,0,world,network(layout,world,output_hud(world,rest))))))

def on_word(on: Bool) -> String:
  match on:
    case True{}: "ON"
    case False{}: "OFF"

def wave_phase(world: M.World,status: U32) -> String:
  match status:
    case 0: "NEXT WAVE " ++ U32.show((M.wave(world) + 1 : U32)) ++ "/" ++ U32.show(M.wave_count()) ++ " READY"
    case 1: "WAVE " ++ U32.show(M.wave(world)) ++ "/" ++ U32.show(M.wave_count()) ++ " RUNNING"
    case 2: "CAMPAIGN COMPLETE / R RESTART"
    case 4: "INCOMPLETE / OWNERSHIP RETAINED / R RESTART"
    case _: "DEFEAT / R RESTART"

def wave_line(+world: M.World) -> String:
  Bool.pick(String,M.paused(world),"PAUSED / ","") ++ wave_phase(world,H.wave_status(world)) ++
    " / AUTO WAVES " ++ on_word(M.auto(world)) ++
    Bool.pick(String,M.auto_pending(world)," / NEXT IN " ++ U32.show(M.auto_left(world)) ++ " MS","")

def family_row(+world: M.World,+family: Nat,index: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +tokens = P.tokens(world)
  +y = (480 + index * 25 : U32)
  +unresolved = T.count_family(tokens,family,0)
  +findings = T.count_family(tokens,family,1)
  +locked = T.family_committed(world,family)
  F.text("E" ++ Nat.show(family) ++ " WORK " ++ U32.show(unresolved) ++ " FIND " ++ U32.show(findings) ++ " BYTES " ++ Nat.show(T.family_bytes(M.work(M.core(world)),world,family,[])),812,y,1,16777215,
    F.text(Bool.pick(String,(locked > 0 : U32),"COMMITTED " ++ U32.show(locked) ++ " / AWAITING ACK",
      Bool.pick(String,(unresolved > 0 : U32),"WAIT U" ++ T.ids_short(T.family_members(tokens,family,0),4n),
        "ELIGIBLE " ++ U32.show(T.family_ready(world,family)) ++ " / NOT YET ACK")),812,(y + 10 : U32),1,Bool.pick(U32,(unresolved > 0 : U32),15758447,65483),rest))
def family_rows(ids: List<&2,Nat>,+world: M.World,index: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match ids index:
    case Nil{} _: rest
    case _ 2: rest
    case id <> tail +n: family_row(world,id,n,family_rows(tail,world,(n + 1 : U32),rest))
def family_panel(+world: M.World,target: Nat,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  box("EDIT FAMILIES","TARGET THEN BLOCKED / ACTUAL OWNERSHIP",800,440,216,94,15758447,
    family_rows(T.families_focused(world,target),world,0,rest))
def dependency_visible(on: Bool,+world: M.World,+token: P.Token,target: Nat,ids: List<&2,U32>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}:
      +point = actor_point(world,token,ids)
      ring(48n,D.px(point),D.py(point),12,15758447,
        road_dots(51n,point,H.point_found(world,E.find_work(target,M.work(M.core(world)))),0,1,15758447,rest))
def dependency_targets(tokens: List<&2,P.Token>,+world: M.World,+target: Nat,+family: Nat,+ids: List<&2,U32>,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match tokens:
    case Nil{}: rest
    case +token <> tail:
      +next = dependency_targets(tail,world,target,family,ids,rest)
      dependency_visible(U32.is_eq(P.phase(token),5) && Nat.is_eq(U32.to_nat(P.family(token)),family),world,token,target,ids,next)
def dependency_kind(kind: U32,+world: M.World,target: Nat,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match kind target:
    case 4 1n++n: dependency_targets(P.tokens(world),world,1n+n,T.target_family(world,1n+n),waiting_ids(P.tokens(world),world),rest)
    case _ _: rest
def scene(+world: M.World) -> List<&2,F.Rect>:
  +preview = Preview.calculate(world)
  +tokens = P.tokens(world)
  +target = T.focus(world,Preview.target(preview))
  +base = dependency_kind(T.focus_kind(world,Preview.kind(preview)),world,target,ghost(world,preview,family_panel(world,target,F.text("SHOWING " ++ U32.show(U32.min(2,M.number(List.length(&2,P.Token,tokens)))) ++ " OF " ++ U32.show(M.number(List.length(&2,P.Token,tokens))) ++ " LIVE UNITS",812,420,1,12439239,work_rows(T.tokens_focused(tokens,target),world,0,sidebar(world,processors(M.towers(world),world,1,layout_scene(M.layout(world),world,tokens,[]))))))))
  +header = frame(M.layout(world),F.text("1-7 BUILD / U UPGRADE / SPACE P PAUSE / N WAVE / A AUTO / [ ] PACE / D STOP / F WORKLOAD / R RESET / TAB MAP",24,742,1,16768133,base))
  F.text("GOLD " ++ U32.show(M.gold(world)) ++ " HEALTH " ++ U32.show(M.hp(world)) ++ " CLEAR " ++ U32.show(M.clear(world)) ++ " SUBMITTED " ++ U32.show(M.delivered(world)),480,78,1,16768133,
  F.text("REAL CANONICAL STATE / WORK AND FILE OWNERS " ++ U32.show((P.count(world,0) + P.count(world,1) + P.count(world,2) + P.count(world,3) + P.count(world,4) + P.count(world,5) : U32)),24,78,1,65483,
    F.text(wave_line(world) ++ " / ARRIVAL " ++ U32.show((M.wave_interval(world) * 20 : U32)) ++ " MS",24,98,1,15124059,F.text("D BEFORE WAVE: STOP WINDOW " ++ U32.show((M.stop_budget(world) * 20 : U32)) ++ " MS / F WORKLOAD: " ++ M.profile_name(world),24,111,1,12439239,header))))

def view(world: M.World) -> Image:
  paint(10n,0,0,1024,scene(world),False{})

def selected_level(items: List<&2,M.Tower>,index: U32) -> U32:
  match items index:
    case Nil{} _: 0
    case tower <> _ 1: M.level(tower)
    case _ <> rest _: selected_level(rest,M.sub(index,1))

def trace_if(on: Bool,+token: P.Token,+world: M.World,+prefix: String,rest: String) -> String:
  match on:
    case False{}: rest
    case True{}:
      +point = H.unit_point(world,token)
      prefix ++ "ID=" ++ U32.show(P.id(token)) ++ " " ++ prefix ++ "X=" ++ U32.show(D.px(point)) ++ " " ++ prefix ++ "Y=" ++ U32.show(D.py(point)) ++ " " ++ prefix ++ "REM=" ++ U32.show(H.remaining(world,token)) ++ " " ++ prefix ++ "RISK=" ++ U32.show(H.risk(world,token))

def first_trace(tokens: List<&2,P.Token>,+world: M.World,+phase: U32,+prefix: String) -> String:
  match tokens:
    case Nil{}: prefix ++ "ID=0"
    case Con{+token,tail}: trace_if(U32.is_eq(P.phase(token),phase),token,world,prefix,first_trace(tail,world,phase,prefix))

def diagnostics(+world: M.World) -> String:
  +preview = Preview.calculate(world)
  "PROFILE=" ++ U32.show(M.profile(world)) ++ " PACE=" ++ U32.show(M.wave_interval(world)) ++ " STOPSTATE=" ++ U32.show(M.stop_state(world)) ++ " STOPLEFT=" ++ U32.show(Stop.remaining(world)) ++ " STOPBUDGET=" ++ U32.show(M.stop_budget(world)) ++ " CUTOPS=" ++ U32.show(M.number(List.length(&2,Nat,M.cancelled(world)))) ++ " CLEANUP=" ++ U32.show(M.cleanup_left(world)) ++ " CANDIDATES=" ++ U32.show(T.candidate_count(world)) ++ " CANDIDATE_BYTES=" ++ U32.show(T.candidate_bytes(world)) ++ " WAVE=" ++ U32.show(M.wave(world)) ++ " AUTO=" ++ on_word(M.auto(world)) ++ " AUTO_PENDING=" ++ on_word(M.auto_pending(world)) ++ " AUTO_LEFT=" ++ U32.show(M.auto_left(world)) ++ " AUTO_TASK=" ++ Nat.show(M.auto_task(world)) ++ " ROUND=" ++ Nat.show(M.round(world)) ++ " STATUS=" ++ U32.show(H.wave_status(world)) ++ " LAYOUT=" ++ U32.show(M.layout(world)) ++ " PAUSED=" ++ Bool.pick(String,M.paused(world),"YES","NO") ++ " TICK=" ++ U32.show(M.time(world)) ++ " GOLD=" ++ U32.show(M.gold(world)) ++ " HP=" ++ U32.show(M.hp(world)) ++ " OFFERED=" ++ U32.show(M.offered(world)) ++ " CLEAR=" ++ U32.show(M.clear(world)) ++ " DELIVERED=" ++ U32.show(M.delivered(world)) ++ " WRITESLOTS=" ++ U32.show(P.writes(world)) ++ " LEASES=" ++ U32.show(P.leases(world)) ++ " READY=" ++ U32.show(P.ready(world)) ++ " WAIT=" ++ U32.show(P.waiting(world)) ++ " DECIDE=" ++ U32.show(P.deciding(world)) ++ " PENDING_UNITS=" ++ U32.show(P.count(world,5)) ++ " ATJEV=" ++ U32.show(P.requests(world)) ++ " LEDGER_ITEMS=" ++ U32.show(P.ledger_items(world)) ++ " LEDGER_BYTES=" ++ U32.show(P.ledger_bytes(world)) ++ " TOWERS=" ++ U32.show(M.number(List.length(&2,M.Tower,M.towers(world)))) ++ " SELECTED=" ++ U32.show(M.selected(world)) ++ " LEVEL=" ++ U32.show(selected_level(M.towers(world),M.selected(world))) ++ " PREVIEW=" ++ U32.show(Preview.status(preview)) ++ " BEFORE=" ++ U32.show(Preview.before(preview)) ++ " DELTA=" ++ U32.show(Preview.delta(preview)) ++ " TARGET=" ++ Nat.show(Preview.target(preview)) ++ " SITE=" ++ U32.show(Preview.site(preview)) ++ " SECONDARY=" ++ U32.show(Preview.secondary_before(preview)) ++ " SECONDARY_DELTA=" ++ U32.show(Preview.secondary_delta(preview)) ++ " WAIT_SLOTS=" ++ U32.show(wait_count(P.tokens(world),world)) ++ " DAMAGE_FLASH=" ++ U32.show(M.damage_flash(world)) ++ " COMMITTED=" ++ U32.show(M.number(List.length(&2,Nat,O.selection_members(world)))) ++ " WRITERLEFT=" ++ U32.show(O.remaining(world)) ++ " " ++ first_trace(P.tokens(world),world,0,"ROAD") ++ " " ++ first_trace(P.tokens(world),world,1,"SERVICE") ++ " " ++ first_trace(P.tokens(world),world,3,"FANOUT")
