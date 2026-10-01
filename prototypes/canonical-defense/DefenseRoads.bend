# Fixed authored road geometry only. Positions never enter the canonical reducer.
import Base
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseHost.bend as H

type Point is Data:
  Point{x: U32,y: U32}

def px(point:Point)->U32:
  match point:
    case Point{x,_}:x

def py(point:Point)->U32:
  match point:
    case Point{_,y}:y

def center(layout: U32,phase: U32,side: U32)->Point:
  match layout phase:
    case 0 0: Point{116,174}
    case 0 1: Point{380,174}
    case 0 2: Point{644,174}
    case 0 3: Point{644,444}
    case 0 4: Point{380,444}
    case 0 _: Point{116,444}
    case 1 0: Point{96,166}
    case 1 1: Point{256,166}
    case 1 2: Point{448,166}
    case 1 3: Bool.pick(Point,U32.is_eq(side,0),Point{168,348},Point{640,348})
    case 1 4: Point{404,496}
    case 1 _: Point{152,572}
    case _ 0: Point{132,172}
    case _ 1: Point{420,172}
    case _ 2: Point{654,300}
    case _ 3: Point{558,544}
    case _ 4: Point{274,544}
    case _ _: Point{132,356}

def branch(token:P.Token)->U32:
  (P.id(token) % 2 : U32)

def micro(+point:Point)->List<&2,Point>:
  [Point{(px(point)-30: U32),(py(point)-16: U32)},Point{(px(point)+28: U32),(py(point)-16: U32)},Point{(px(point)+28: U32),(py(point)+20: U32)},Point{(px(point)-30: U32),(py(point)+20: U32)},Point{(px(point)-30: U32),(py(point)-16: U32)}]

def source_route(layout: U32)->List<&2,Point>:
  match layout:
    case 0:[Point{36,174},Point{116,174},Point{316,174}]
    case 1:[Point{24,166},Point{96,166},Point{192,166}]
    case _:[Point{24,172},Point{132,172},Point{356,172}]

def review_route(layout: U32,side: U32)->List<&2,Point>:
  match layout side:
    case 0 _:[Point{644,238},Point{708,238},Point{708,444},Point{644,510},Point{460,510},Point{444,444}]
    case 1 0:[Point{448,230},Point{320,266},Point{168,282},Point{168,420},Point{320,420},Point{340,496}]
    case 1 _:[Point{448,230},Point{528,266},Point{640,282},Point{640,420},Point{488,420},Point{468,496}]
    case _ _:[Point{654,364},Point{710,426},Point{634,544},Point{558,608},Point{354,608},Point{338,544}]

def lerp_order(+a: U32,+b: U32,+t: U32,ascending:Bool)->U32:
  match ascending:
    case True{}:(a+(b - a) * t  /  100: U32)
    case False{}:(a-(a - b) * t  /  100: U32)


def lerp(+a: U32,+b: U32,t: U32)->U32:
  lerp_order(a,b,t,(a  <=  b: U32))

def segment(+a:Point,+b:Point,+t: U32)->Point:
  Point{lerp(px(a),px(b),t),lerp(py(a),py(b),t)}

def along(points:List<&2,Point>,index: U32,t: U32)->Point:
  match points index:
    case Nil{} _:Point{24,120}
    case Con{a,Nil{}} _:a
    case Con{a,Con{+b,tail}} 0:segment(a,b,t)
    case Con{_,tail} n:along(tail,(n - 1: U32),t)

def route_position(+points:List<&2,Point>,+age: U32,+duration: U32)->Point:
  +segments=(M.number(List.length(&2,Point,points))-1: U32)
  +scaled=(U32.min(age,duration) * segments  *  100  /  U32.max(1,duration) : U32)
  along(points,(scaled  /  100: U32),(scaled  %  100: U32))

def ordinal(tokens:List<&2,P.Token>,+token:P.Token)->U32:
  match tokens:
    case Nil{}:0
    case Con{+head,tail}:
      (Bool.to_u32(U32.is_eq(P.phase(head),P.phase(token)) && U32.is_eq(P.family(head),P.family(token)) && (P.id(head) < P.id(token) : U32)) + ordinal(tail,token) : U32)

def phase_age(+world:M.World,+token:P.Token)->U32:
  H.timer_age(U32.to_nat(P.id(token)),P.phase(token),M.timers(world))

def inside_position(+world:M.World,+token:P.Token)->Point:
  +progress=((phase_age(world,token) + P.id(token) * 5) % 64: U32)
  route_position(micro(center(M.layout(world),P.phase(token),branch(token))),progress,64)


def preparation_route(layout: U32)->List<&2,Point>:
  match layout:
    case 0:[Point{444,174},Point{580,174}]
    case 1:[Point{320,166},Point{384,166}]
    case _:[Point{484,172},Point{590,172},Point{590,300}]

def queue_ordinal(tokens:List<&2,P.Token>,+token:P.Token,+world: M.World,+layout: U32)->U32:
  match tokens:
    case Nil{}:0
    case Con{+head,tail}:
      (Bool.to_u32(Bool.not(H.in_building(world,head)) && U32.is_eq(P.phase(head),P.phase(token)) &&
        (Bool.not(U32.is_eq(layout,1) && U32.is_eq(P.phase(token),3)) || U32.is_eq(branch(head),branch(token))) &&
        (P.id(head) < P.id(token) : U32)) + queue_ordinal(tail,token,world,layout) : U32)

def approach_path(layout: U32,phase: U32,side: U32)->List<&2,Point>:
  match phase:
    case 2:preparation_route(layout)
    case 3:review_route(layout,side)
    case 4:review_route(layout,side)
    case _:source_route(layout)

def outside_position(+world:M.World,+token:P.Token)->Point:
  +age=phase_age(world,token)
  +phase=P.phase(token)
  +rank=ordinal(P.tokens(world),token)
  +queue=queue_ordinal(P.tokens(world),token,world,M.layout(world))
  +delay=Bool.pick(U32,U32.is_eq(phase,3),(3 + rank * 5 : U32),0)
  +travel=U32.sub(U32.max(age,delay),delay)
  +path=approach_path(M.layout(world),phase,branch(token))
  +park=U32.sub(U32.max(100,(queue * 5 : U32)),(queue * 5 : U32))
  +progress=Bool.pick(U32,U32.is_eq(phase,4),park,U32.min((travel * 7 : U32),park))
  Bool.pick(Point,U32.is_eq(phase,3) && (age <= delay : U32),route_position(path,(rank * 5 : U32),100),route_position(path,progress,100))

def actor_position(+world:M.World,+token:P.Token)->Point:
  Bool.pick(Point,H.in_building(world,token),inside_position(world,token),outside_position(world,token))
