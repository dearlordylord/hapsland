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

# Wall edges:0West,1East,2North,3South. Ports are wall midpoints.
def port(+point: Point,edge: U32) -> Point:
  match edge:
    case 0: Point{(px(point) - 32 : U32),py(point)}
    case 1: Point{(px(point) + 32 : U32),py(point)}
    case 2: Point{px(point),(py(point) - 24 : U32)}
    case _: Point{px(point),(py(point) + 24 : U32)}

def entry_side(layout: U32,phase: U32,lane: U32) -> U32:
  match phase:
    case 4: Bool.pick(U32,U32.is_eq(layout,1) && U32.is_eq(lane,0),0,1)
    case 5: Bool.pick(U32,U32.is_eq(layout,1),3,1)
    case _: 0

def exit_side(layout: U32,phase: U32) -> U32:
  match layout phase:
    case 0 2: 1
    case _ 2: 3
    case 0 4: 0
    case 1 4: 3
    case _ 4: 3
    case 1 5: 1
    case _ 5: 3
    case _ _: 1

def clear_side(layout: U32) -> U32:
  2

def entry_port(+layout: U32,+phase: U32,+lane: U32) -> Point:
  port(center(layout,phase,lane),entry_side(layout,phase,lane))

def exit_port(+layout: U32,+phase: U32) -> Point:
  port(center(layout,phase,0),exit_side(layout,phase))

def distance_order(+a: U32,+b: U32,up: Bool) -> U32:
  match up:
    case True{}: (b - a : U32)
    case False{}: (a - b : U32)

def distance(+a: U32,+b: U32) -> U32:
  distance_order(a,b,(a <= b : U32))

# Five authored horizontal passes; four U-turns, no closed loop.
def snake(+point: Point) -> List<&2,Point>:
  [
    Point{(px(point) - 20 : U32),(py(point) - 16 : U32)},Point{(px(point) + 20 : U32),(py(point) - 16 : U32)},
    Point{(px(point) + 20 : U32),(py(point) - 8 : U32)},Point{(px(point) - 20 : U32),(py(point) - 8 : U32)},
    Point{(px(point) - 20 : U32),py(point)},Point{(px(point) + 20 : U32),py(point)},
    Point{(px(point) + 20 : U32),(py(point) + 8 : U32)},Point{(px(point) - 20 : U32),(py(point) + 8 : U32)},
    Point{(px(point) - 20 : U32),(py(point) + 16 : U32)},Point{(px(point) + 20 : U32),(py(point) + 16 : U32)}]

def entry_channel(+point: Point,+edge: U32) -> List<&2,Point>:
  match edge:
    case 0: [port(point,edge),Point{(px(point) - 24 : U32),py(point)},Point{(px(point) - 24 : U32),(py(point) - 16 : U32)}]
    case 1: [port(point,edge),Point{(px(point) + 24 : U32),py(point)},Point{(px(point) + 24 : U32),(py(point) - 20 : U32)},Point{(px(point) - 24 : U32),(py(point) - 20 : U32)},Point{(px(point) - 24 : U32),(py(point) - 16 : U32)}]
    case 2: [port(point,edge),Point{px(point),(py(point) - 20 : U32)},Point{(px(point) - 24 : U32),(py(point) - 20 : U32)},Point{(px(point) - 24 : U32),(py(point) - 16 : U32)}]
    case _: [port(point,edge),Point{px(point),(py(point) + 20 : U32)},Point{(px(point) - 24 : U32),(py(point) + 20 : U32)},Point{(px(point) - 24 : U32),(py(point) - 16 : U32)}]

def exit_channel(+point: Point,+edge: U32) -> List<&2,Point>:
  match edge:
    case 0: [Point{(px(point) + 24 : U32),(py(point) + 16 : U32)},Point{(px(point) + 24 : U32),(py(point) + 20 : U32)},Point{(px(point) - 24 : U32),(py(point) + 20 : U32)},Point{(px(point) - 24 : U32),py(point)},port(point,edge)]
    case 2: [Point{(px(point) + 24 : U32),(py(point) + 16 : U32)},Point{(px(point) + 24 : U32),(py(point) - 20 : U32)},Point{px(point),(py(point) - 20 : U32)},port(point,edge)]
    case 3: [Point{(px(point) + 24 : U32),(py(point) + 16 : U32)},Point{(px(point) + 24 : U32),(py(point) + 20 : U32)},Point{px(point),(py(point) + 20 : U32)},port(point,edge)]
    case _: [Point{(px(point) + 24 : U32),(py(point) + 16 : U32)},Point{(px(point) + 24 : U32),py(point)},port(point,edge)]

def route_in_room(+point: Point,entry: U32,exit: U32) -> List<&2,Point>:
  List.append(&2,Point,entry_channel(point,entry),List.append(&2,Point,snake(point),exit_channel(point,exit)))

def micro_route(point: Point) -> List<&2,Point>:
  route_in_room(point,0,1)

def room_route(+layout: U32,+phase: U32,+lane: U32) -> List<&2,Point>:
  route_in_room(center(layout,phase,lane),entry_side(layout,phase,lane),exit_side(layout,phase))

def source_route(layout: U32) -> List<&2,Point>:
  match layout:
    case 0: [Point{36,174},Point{116,174},entry_port(layout,1,0)]
    case 1: [Point{24,166},Point{96,166},entry_port(layout,1,0)]
    case _: [Point{24,172},Point{132,172},entry_port(layout,1,0)]

def review_route(+layout: U32,+side: U32) -> List<&2,Point>:
  match layout side:
    case 0 _: [exit_port(layout,2),Point{708,174},Point{708,510},Point{444,510},Point{444,444},entry_port(layout,4,side)]
    case 1 0: [exit_port(layout,2),Point{448,222},Point{320,222},Point{320,266},Point{168,266},Point{168,420},Point{338,420},Point{338,496},entry_port(layout,4,side)]
    case 1 _: [exit_port(layout,2),Point{448,222},Point{528,222},Point{528,266},Point{640,266},Point{640,420},Point{470,420},Point{470,496},entry_port(layout,4,side)]
    case _ _: [exit_port(layout,2),Point{654,356},Point{710,356},Point{710,426},Point{634,426},Point{634,544},Point{558,544},Point{558,608},Point{338,608},Point{338,544},entry_port(layout,4,side)]

def lerp_order(+a: U32,+b: U32,+t: U32,ascending:Bool)->U32:
  match ascending:
    case True{}:(a+(b - a) * t  /  100: U32)
    case False{}:(a-(a - b) * t  /  100: U32)


def lerp(+a: U32,+b: U32,t: U32)->U32:
  lerp_order(a,b,t,(a  <=  b: U32))

def segment(+a:Point,+b:Point,+t: U32)->Point:
  Point{lerp(px(a),px(b),t),lerp(py(a),py(b),t)}

def preparation_route(+layout: U32) -> List<&2,Point>:
  match layout:
    case 0: [exit_port(layout,1),entry_port(layout,2,0)]
    case 1: [exit_port(layout,1),entry_port(layout,2,0)]
    case _: [exit_port(layout,1),Point{486,172},Point{486,300},entry_port(layout,2,0)]

def retained_route(+layout: U32) -> List<&2,Point>:
  match layout:
    case 0: [exit_port(layout,4),entry_port(layout,5,0)]
    case 1: [exit_port(layout,4),Point{404,636},Point{152,636},entry_port(layout,5,0)]
    case _: [exit_port(layout,4),Point{274,600},Point{226,600},Point{226,356},entry_port(layout,5,0)]

def outer_point(+point: Point,edge: U32) -> Point:
  match edge:
    case 0: Point{(px(point) - 32 : U32),py(point)}
    case 1: Point{(px(point) + 32 : U32),py(point)}
    case 2: Point{px(point),(py(point) - 32 : U32)}
    case _: Point{px(point),(py(point) + 32 : U32)}

def clear_route(+layout: U32) -> List<&2,Point>:
  +edge = clear_side(layout)
  +start = port(center(layout,4,0),edge)
  [start,outer_point(start,edge)]

def delivery_route(+layout: U32) -> List<&2,Point>:
  +start = exit_port(layout,5)
  [start,outer_point(start,exit_side(layout,5))]

def segment_length(+a: Point,+b: Point) -> U32:
  (distance(px(a),px(b)) + distance(py(a),py(b)) : U32)

def path_length(points: List<&2,Point>) -> U32:
  match points:
    case Nil{}: 0
    case Con{_,Nil{}}: 0
    case Con{+a,Con{+b,tail}}: (segment_length(a,b) + path_length(Con{b,tail}) : U32)

def travel_coordinate_order(+a: U32,+b: U32,+pixels: U32,up: Bool) -> U32:
  match up:
    case True{}: (a + U32.min(pixels,(b - a : U32)) : U32)
    case False{}: (a - U32.min(pixels,(a - b : U32)) : U32)

def travel_coordinate(+a: U32,+b: U32,pixels: U32) -> U32:
  travel_coordinate_order(a,b,pixels,(a <= b : U32))

def travel_segment(+a: Point,+b: Point,+pixels: U32) -> Point:
  Point{travel_coordinate(px(a),px(b),pixels),travel_coordinate(py(a),py(b),pixels)}

def path_position(points: List<&2,Point>, +pixels: U32) -> Point:
  match points:
    case Nil{}: Point{24,120}
    case Con{a,Nil{}}: a
    case Con{+a,Con{+b,tail}}:
      +length = segment_length(a,b)
      Bool.pick(Point,(pixels <= length : U32),travel_segment(a,b,U32.min(pixels,length)),path_position(Con{b,tail},U32.sub(U32.max(pixels,length),length)))

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

# Executable geometry constraints: a wall port's tangent component is exactly zero.
def same(+a: Point,+b: Point) -> Bool:
  U32.is_eq(px(a),px(b)) && U32.is_eq(py(a),py(b))

def axis_segment(+a: Point,+b: Point) -> Bool:
  Bool.not(same(a,b)) && (U32.is_eq(px(a),px(b)) || U32.is_eq(py(a),py(b)))

def orthogonal(points: List<&2,Point>) -> Bool:
  match points:
    case Nil{}: True{}
    case _ <> Nil{}: True{}
    case +a <> (+b <> rest): axis_segment(a,b) && orthogonal(b <> rest)

def first(points: List<&2,Point>) -> Point:
  match points:
    case Nil{}: Point{0,0}
    case point <> _: point

def second(points: List<&2,Point>) -> Point:
  match points:
    case _ <> (point <> _): point
    case _: Point{0,0}

def last(points: List<&2,Point>) -> Point:
  match points:
    case Nil{}: Point{0,0}
    case point <> Nil{}: point
    case _ <> rest: last(rest)

def previous(points: List<&2,Point>) -> Point:
  match points:
    case point <> (_ <> Nil{}): point
    case _ <> rest: previous(rest)
    case _: Point{0,0}

def normal_direction(edge: U32,+portal: Point,+outside: Point) -> Bool:
  match edge:
    case 0: U32.is_eq(py(portal),py(outside)) && (px(outside) < px(portal) : U32)
    case 1: U32.is_eq(py(portal),py(outside)) && (px(outside) > px(portal) : U32)
    case 2: U32.is_eq(px(portal),px(outside)) && (py(outside) < py(portal) : U32)
    case _: U32.is_eq(px(portal),px(outside)) && (py(outside) > py(portal) : U32)

def normal_port(room: Point,+edge: U32,+portal: Point,outside: Point) -> Bool:
  same(port(room,edge),portal) && normal_direction(edge,portal,outside)

def road_entry(+layout: U32,+phase: U32,+lane: U32,+points: List<&2,Point>) -> Bool:
  orthogonal(points) && normal_port(center(layout,phase,lane),entry_side(layout,phase,lane),last(points),previous(points))

def road_exit(+layout: U32,+phase: U32,+points: List<&2,Point>) -> Bool:
  orthogonal(points) && normal_port(center(layout,phase,0),exit_side(layout,phase),first(points),second(points))

def inside_points(points: List<&2,Point>,+room: Point) -> Bool:
  match points:
    case Nil{}: True{}
    case point <> rest: in_building_rect(point,room) && inside_points(rest,room)

def point_member(+point: Point,points: List<&2,Point>) -> Bool:
  match points:
    case Nil{}: False{}
    case head <> rest: same(point,head) || point_member(point,rest)

def unique_points(points: List<&2,Point>) -> Bool:
  match points:
    case Nil{}: True{}
    case point <> +rest: Bool.not(point_member(point,rest)) && unique_points(rest)

def segments_intersect(+a: Point,+b: Point,+c: Point,+d: Point) -> Bool:
  (U32.max(U32.min(px(a),px(b)),U32.min(px(c),px(d))) <= U32.min(U32.max(px(a),px(b)),U32.max(px(c),px(d))) : U32) &&
    (U32.max(U32.min(py(a),py(b)),U32.min(py(c),py(d))) <= U32.min(U32.max(py(a),py(b)),U32.max(py(c),py(d))) : U32)

def avoids_later(+a: Point,+b: Point,points: List<&2,Point>) -> Bool:
  match points:
    case +c <> (+d <> rest): Bool.not(segments_intersect(a,b,c,d)) && avoids_later(a,b,d <> rest)
    case _: True{}

def no_crossings(points: List<&2,Point>) -> Bool:
  match points:
    case +a <> (+b <> (+c <> +rest)): avoids_later(a,b,c <> rest) && no_crossings(b <> (c <> rest))
    case _: True{}

def tangent_zero(edge: U32,+a: Point,+b: Point) -> Bool:
  Bool.pick(Bool,(edge < 2 : U32),U32.is_eq(py(a),py(b)),U32.is_eq(px(a),px(b))) && Bool.not(same(a,b))

def room_valid_points(+layout: U32,+phase: U32,+lane: U32,+points: List<&2,Point>) -> Bool:
  orthogonal(points) && inside_points(points,center(layout,phase,lane)) && unique_points(points) && no_crossings(points) &&
    same(first(points),entry_port(layout,phase,lane)) && same(last(points),exit_port(layout,phase)) &&
    tangent_zero(entry_side(layout,phase,lane),first(points),second(points)) &&
    tangent_zero(exit_side(layout,phase),previous(points),last(points))

def room_valid(+layout: U32,+phase: U32,+lane: U32) -> Bool:
  room_valid_points(layout,phase,lane,room_route(layout,phase,lane))

def layout_valid(+layout: U32) -> Bool:
  road_entry(layout,1,0,source_route(layout)) &&
    road_exit(layout,1,preparation_route(layout)) && road_entry(layout,2,0,preparation_route(layout)) &&
    road_exit(layout,2,review_route(layout,0)) && road_entry(layout,4,0,review_route(layout,0)) &&
    road_exit(layout,2,review_route(layout,1)) && road_entry(layout,4,1,review_route(layout,1)) &&
    road_exit(layout,4,retained_route(layout)) && road_entry(layout,5,0,retained_route(layout)) &&
    normal_port(center(layout,4,0),clear_side(layout),first(clear_route(layout)),second(clear_route(layout))) &&
    road_exit(layout,5,delivery_route(layout)) &&
    room_valid(layout,1,0) && room_valid(layout,2,0) && room_valid(layout,4,0) && room_valid(layout,4,1) && room_valid(layout,5,0)
