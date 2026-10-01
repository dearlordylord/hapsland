# Native layouts are read-only projections of the canonical reducer.
import Base
import ./Font.bend as F
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseHost.bend as H
import ./DefenseRoads.bend as D

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

def owned(xs: List<&2,M.Tower>, +kind: U32) -> Bool:
  match xs:
    case Nil{}: False{}
    case Con{head,tail}: U32.is_eq(M.tkind(head),kind) || owned(tail,kind)

def tower_button(+kind: U32, +world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +y = (112 + kind * 68 : U32)
  +built = owned(M.towers(world),kind)
  +color = Bool.pick(U32,built,9170322,Bool.pick(U32,(M.gold(world) >= H.tower_cost(kind) : U32),65483,15758447))
  box(U32.show((kind + 1 : U32)) ++ " " ++ H.tower_name(kind),Bool.pick(String,built,"BUILT / AUTOMATIC","BUILD COST " ++ U32.show(H.tower_cost(kind))),808,y,200,54,color,F.text(H.tower_detail(kind),820,(y + 45 : U32),1,12439239,F.put(808,y,3,54,Bool.pick(U32,U32.is_eq(M.choice(world),kind),16777215,1914923),rest)))

def sidebar(+world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +towers = tower_button(0,world,tower_button(1,world,tower_button(2,world,rest)))
  +summary = F.text("MANUAL BUILD DOCK",820,88,2,16050112,towers)
  +host = box("HOST FACTS","SYNTHETIC TIMER / REAL REDUCER EVENTS",808,324,200,156,15124059,summary)
  +timing = F.text("HOST TICK " ++ U32.show(M.time(world)),820,370,1,12439239,
    F.text("GOLD " ++ U32.show(M.gold(world)) ++ " HEALTH " ++ U32.show(M.hp(world)),820,387,1,12439239,
      F.text("OFFERED " ++ U32.show(M.offered(world)),820,404,1,12439239,
        F.text("CLEAR " ++ U32.show(M.clear(world)) ++ " DELIVERED " ++ U32.show(M.delivered(world)),820,421,1,9170322,host))))
  box("CANONICAL AUTHORITY","SAME CORE / DEMAND / ACTIONS IN ALL VIEWS",808,496,200,190,65483,
    F.text("LAYOUTS CHANGE PROJECTION",820,548,1,12439239,
      F.text("TOWERS ALTER HOST LATENCY",820,566,1,12439239,
        F.text("NO EXTRA REDUCER CAPACITY",820,584,1,12439239,
          F.text("FINDING DELIVERY IS NOT REPAIR",820,602,1,16768133,timing)))))


def road_dots(fuel: Nat, +a: D.Point, +b: D.Point, +step: U32, +width: U32, +color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n+n:
      +point = D.segment(a,b,step)
      F.put(U32.sub(D.px(point),(width / 2 : U32)),U32.sub(D.py(point),(width / 2 : U32)),width,width,color,road_dots(n,a,b,(step + 2 : U32),width,color,rest))

def road(points: List<&2,D.Point>, +width: U32, +color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match points:
    case Nil{}: rest
    case Con{_,Nil{}}: rest
    case Con{a,Con{+b,tail}}:
      road_dots(51n,a,b,0,width,color,road(Con{b,tail},width,color,rest))

def asphalt(+points: List<&2,D.Point>, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  road(points,14,3358535,road(points,22,5003871,rest))

def bridge(+layout: U32) -> List<&2,D.Point>:
  match layout:
    case 0: [D.Point{316,444},D.Point{180,444}]
    case 1: [D.Point{404,560},D.Point{404,636},D.Point{152,636},D.Point{152,572}]
    case _: [D.Point{274,480},D.Point{274,356},D.Point{212,356}]

def exits(+world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +jev = D.center(M.layout(world),4,0)
  +finding = D.center(M.layout(world),5,0)
  F.text("CLEAR EXIT " ++ U32.show(M.clear(world)),(D.px(jev) + 8 : U32),U32.sub(D.py(jev),91),1,9170322,
    F.text("DELIVERY GATE " ++ U32.show(M.delivered(world)),U32.sub(D.px(finding),64),(D.py(finding) + 76 : U32),1,65483,
      road([D.Point{D.px(jev),U32.sub(D.py(jev),52)},D.Point{D.px(jev),U32.sub(D.py(jev),84)}],8,9170322,
        road([D.Point{D.px(finding),(D.py(finding) + 52 : U32)},D.Point{D.px(finding),(D.py(finding) + 72 : U32)}],8,65483,rest))))

def network(+layout: U32, +world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  asphalt(D.source_route(layout),asphalt(D.preparation_route(layout),asphalt(D.review_route(layout,0),asphalt(D.review_route(layout,1),asphalt(bridge(layout),exits(world,rest))))))

def branch_count(tokens: List<&2,P.Token>, +phase: U32, +side: U32) -> U32:
  match tokens:
    case Nil{}: 0
    case Con{+token,tail}: (Bool.to_u32(U32.is_eq(P.phase(token),phase) && U32.is_eq(D.branch(token),side)) + branch_count(tail,phase,side) : U32)

def site_shape(enclosed: Bool, +point: D.Point, +x: U32, +y: U32, +color: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match enclosed:
    case True{}:
      List.append(&2,F.Rect,road(D.micro(point),5,7042681,rest),[F.Box{x,y,128,4,color},F.Box{x,(y + 100 : U32),128,4,color},F.Box{x,y,4,104,color},F.Box{(x + 124 : U32),y,4,104,color},F.Box{x,y,128,104,1914923}])
    case False{}: F.put(x,(y + 100 : U32),128,3,color,rest)

def building(+world: M.World, +phase: U32, +side: U32, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +point = D.center(M.layout(world),phase,side)
  +x = U32.sub(D.px(point),64)
  +y = U32.sub(D.py(point),52)
  +enclosed = Bool.not(U32.is_eq(phase,0) || U32.is_eq(phase,3))
  +title = Bool.pick(String,U32.is_eq(phase,0),"SOURCE QUEUE / SAFE",Bool.pick(String,U32.is_eq(phase,3),"REVIEW QUEUE / SAFE",phase_name(phase)))
  +count = Bool.pick(U32,U32.is_eq(M.layout(world),1) && U32.is_eq(phase,3),branch_count(P.tokens(world),phase,side),P.count(world,phase))
  F.text(title,x,U32.sub(y,13),1,phase_color(phase),F.text("OWNED " ++ U32.show(count),x,(y + 108 : U32),1,phase_color(phase),site_shape(enclosed,point,x,y,phase_color(phase),rest)))

def buildings(fuel: Nat, +phase: U32, +world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n+n: building(world,phase,0,buildings(n,(phase + 1 : U32),world,rest))

def extra_building(on: Bool, world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case True{}: building(world,3,1,rest)
    case False{}: rest

def actor(+world: M.World, +token: P.Token, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  +point = D.actor_position(world,token)
  +small = H.in_building(world,token)
  +width = Bool.pick(U32,small,5,10)
  +height = Bool.pick(U32,small,7,14)
  +x = U32.sub(D.px(point),(width / 2 : U32))
  +y = U32.sub(D.py(point),(height / 2 : U32))
  F.text("U" ++ U32.show(P.id(token)),(x + width + 2 : U32),y,1,16777215,F.put(x,y,width,height,phase_color(P.phase(token)),F.put(x,U32.sub(y,3),width,2,16777215,rest)))

def actors(tokens: List<&2,P.Token>, +world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match tokens:
    case Nil{}: rest
    case Con{token,tail}: actor(world,token,actors(tail,world,rest))

def layout_scene(+layout: U32, +world: M.World, rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  actors(P.tokens(world),world,extra_building(U32.is_eq(layout,1),world,buildings(6n,0,world,network(layout,world,
    F.text("SAFE ROAD / SMALL ACTORS INSIDE BUILDINGS",24,674,1,65483,
      F.text("FANOUT EXIT STAGGER IS VISUAL / OWNERSHIP IMMEDIATE",24,690,1,15124059,
        F.text("JEV RESERVED " ++ U32.show(P.requests(world)) ++ "/8   LEDGER " ++ U32.show(P.ledger_bytes(world)) ++ "/240   BUILDING PRESSURE " ++ U32.show(H.building_pressure_bytes(world)),24,710,1,16768133,
          F.text("CLEAR EXIT " ++ U32.show(M.clear(world)) ++ "   DELIVERY SLOT " ++ U32.show(P.writes(world)) ++ "   LEASES " ++ U32.show(P.leases(world)),24,726,1,9170322,rest))))))))

def scene(+world: M.World) -> List<&2,F.Rect>:
  +base = sidebar(world,layout_scene(M.layout(world),world,[]))
  +header = frame(M.layout(world),F.text("TAB LAYOUTS / 1 2 3 TOWER CHOICE / CLICK DOCK TO BUILD / SPACE PAUSE / N WAVE / R RESET",24,742,1,16768133,base))
  F.text("REAL CANONICAL STATE / LIVE TOKENS " ++ U32.show((P.count(world,0) + P.count(world,1) + P.count(world,2) + P.count(world,3) + P.count(world,4) + P.count(world,5) : U32)),24,78,1,65483,
    F.text(Bool.pick(String,M.paused(world),"PAUSED / ALL VIEWS SHARE THIS SNAPSHOT","HOST TIMERS RUNNING / TAB SWITCHES ONLY LAYOUT"),24,98,1,15124059,header))

def view(world: M.World) -> Image:
  paint(10n,0,0,1024,scene(world),False{})

def diagnostics(+world: M.World) -> String:
  "LAYOUT=" ++ U32.show(M.layout(world)) ++ " PAUSED=" ++ Bool.pick(String,M.paused(world),"YES","NO") ++ " TICK=" ++ U32.show(M.time(world)) ++ " GOLD=" ++ U32.show(M.gold(world)) ++ " HP=" ++ U32.show(M.hp(world)) ++ " OFFERED=" ++ U32.show(M.offered(world)) ++ " CLEAR=" ++ U32.show(M.clear(world)) ++ " DELIVERED=" ++ U32.show(M.delivered(world)) ++ " WRITESLOTS=" ++ U32.show(P.writes(world)) ++ " LEASES=" ++ U32.show(P.leases(world)) ++ " READY=" ++ U32.show(P.ready(world)) ++ " WAIT=" ++ U32.show(P.waiting(world)) ++ " DECIDE=" ++ U32.show(P.deciding(world)) ++ " PENDING_UNITS=" ++ U32.show(P.count(world,5)) ++ " ATJEV=" ++ U32.show(P.requests(world)) ++ " LEDGER_ITEMS=" ++ U32.show(P.ledger_items(world)) ++ " LEDGER_BYTES=" ++ U32.show(P.ledger_bytes(world))
