# Fixed authored road geometry only. Positions never enter the canonical reducer.
import Base
import ./DefenseModel.bend as M

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

def micro_route(+point: Point) -> List<&2,Point>:
  [Point{(px(point) - 12 : U32),(py(point) - 9 : U32)},Point{(px(point) + 12 : U32),(py(point) - 9 : U32)},Point{(px(point) + 12 : U32),py(point)},Point{(px(point) - 12 : U32),py(point)},Point{(px(point) - 12 : U32),(py(point) + 9 : U32)},Point{(px(point) + 12 : U32),(py(point) + 9 : U32)}]

def source_route(layout: U32)->List<&2,Point>:
  match layout:
    case 0:[Point{36,174},Point{116,174},Point{348,174}]
    case 1:[Point{24,166},Point{96,166},Point{224,166}]
    case _:[Point{24,172},Point{132,172},Point{388,172}]

def review_route(layout: U32,side: U32) -> List<&2,Point>:
  match layout side:
    case 0 _: [Point{644,198},Point{708,198},Point{708,510},Point{412,510},Point{412,444}]
    case 1 0: [Point{448,190},Point{320,190},Point{320,266},Point{168,266},Point{168,420},Point{372,420},Point{372,496}]
    case 1 _: [Point{448,190},Point{528,190},Point{528,266},Point{640,266},Point{640,420},Point{436,420},Point{436,496}]
    case _ _: [Point{654,324},Point{710,324},Point{710,426},Point{634,426},Point{634,544},Point{558,544},Point{558,608},Point{306,608},Point{306,544}]

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


def preparation_route(layout: U32) -> List<&2,Point>:
  match layout:
    case 0: [Point{412,174},Point{612,174}]
    case 1: [Point{288,166},Point{416,166}]
    case _: [Point{452,172},Point{622,172},Point{622,300}]

def retained_route(layout: U32) -> List<&2,Point>:
  match layout:
    case 0: [Point{348,444},Point{148,444}]
    case 1: [Point{404,520},Point{404,636},Point{152,636},Point{152,596}]
    case _: [Point{274,520},Point{274,356},Point{164,356}]

def distance_order(+a: U32,+b: U32,up: Bool) -> U32:
  match up:
    case True{}: (b - a : U32)
    case False{}: (a - b : U32)

def distance(+a: U32,+b: U32) -> U32:
  distance_order(a,b,(a <= b : U32))

def segment_length(+a: Point,+b: Point) -> U32:
  (distance(px(a),px(b)) + distance(py(a),py(b)) : U32)

def path_length(points: List<&2,Point>) -> U32:
  match points:
    case Nil{}: 0
    case Con{_,Nil{}}: 0
    case Con{+a,Con{+b,tail}}: (segment_length(a,b) + path_length(Con{b,tail}) : U32)

def path_position(points: List<&2,Point>, +pixels: U32) -> Point:
  match points:
    case Nil{}: Point{24,120}
    case Con{a,Nil{}}: a
    case Con{+a,Con{+b,tail}}:
      +length = segment_length(a,b)
      Bool.pick(Point,(pixels <= length : U32),segment(a,b,(U32.min(pixels,length) * 100 / U32.max(1,length) : U32)),path_position(Con{b,tail},U32.sub(U32.max(pixels,length),length)))

def in_range(+a: Point,+b: Point,+radius: U32) -> Bool:
  +dx = distance(px(a),px(b))
  +dy = distance(py(a),py(b))
  (dx * dx + dy * dy <= radius * radius : U32)

def clamped_gap(+value: U32,+low: U32,+high: U32) -> U32:
  distance(value,U32.max(low,U32.min(value,high)))

def near_segment(+point: Point,+a: Point,+b: Point,+margin: U32) -> Bool:
  +dx = clamped_gap(px(point),U32.min(px(a),px(b)),U32.max(px(a),px(b)))
  +dy = clamped_gap(py(point),U32.min(py(a),py(b)),U32.max(py(a),py(b)))
  (dx * dx + dy * dy <= margin * margin : U32)

def on_path(+point: Point,points: List<&2,Point>,+margin: U32) -> Bool:
  match points:
    case Nil{}: False{}
    case Con{_,Nil{}}: False{}
    case Con{+a,Con{+b,tail}}: near_segment(point,a,b,margin) || on_path(point,Con{b,tail},margin)

def in_building_rect(+point: Point,+building: Point) -> Bool:
  (distance(px(point),px(building)) <= 32 : U32) && (distance(py(point),py(building)) <= 24 : U32)

def placement_ground(+layout: U32,+point: Point) -> Bool:
  Bool.not(in_building_rect(point,center(layout,1,0)) || in_building_rect(point,center(layout,2,0)) ||
    in_building_rect(point,center(layout,4,0)) || in_building_rect(point,center(layout,5,0)) ||
    on_path(point,source_route(layout),6) || on_path(point,preparation_route(layout),6) ||
    on_path(point,review_route(layout,0),6) || on_path(point,review_route(layout,1),6) ||
    on_path(point,retained_route(layout),6))
