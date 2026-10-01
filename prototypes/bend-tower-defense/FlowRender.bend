# Pure native 512-square quadtree renderer; no foreign code or shader escape.
import Base
import ./FlowModel.bend as M
import ./Font.bend as F

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

def select_color(on: Bool, yes: U32, no: U32) -> U32:
  match on:
    case True{}: yes
    case False{}: no

def count_jobs(jobs: List<&2, M.Job>, +stage: U32) -> U32:
  match jobs:
    case Nil{}: 0
    case Con{M.Packet{_, id, _, _, _, _}, rest}:
      (select_color(U32.is_eq(id, stage), 1, 0) + count_jobs(rest, stage) : U32)

def oldest(jobs: List<&2, M.Job>, +stage: U32) -> U32:
  match jobs:
    case Nil{}: 0
    case Con{M.Packet{_, id, _, age, _, _}, rest}:
      U32.max(select_color(U32.is_eq(id, stage), age, 0), oldest(rest, stage))

def running_jobs(jobs: List<&2, M.Job>, +stage: U32) -> U32:
  match jobs:
    case Nil{}: 0
    case Con{M.Packet{_, id, elapsed, _, _, held}, rest}:
      (select_color(U32.is_eq(id, stage) && (elapsed > 0 : U32) && Bool.not(held), 1, 0) + running_jobs(rest, stage) : U32)

def waiting_jobs(jobs: List<&2, M.Job>, +stage: U32) -> U32:
  match jobs:
    case Nil{}: 0
    case Con{M.Packet{_, id, elapsed, _, _, held}, rest}:
      (select_color(U32.is_eq(id, stage) && U32.is_eq(elapsed, 0) && Bool.not(held), 1, 0) + waiting_jobs(rest, stage) : U32)

def held_jobs(jobs: List<&2, M.Job>, +stage: U32) -> U32:
  match jobs:
    case Nil{}: 0
    case Con{M.Packet{_, id, _, _, _, held}, rest}:
      (select_color(U32.is_eq(id, stage) && held, 1, 0) + held_jobs(rest, stage) : U32)

def token_draw(+index: U32, +x: U32, +y: U32, id: U32, elapsed: U32, +service: U32, +age: U32, +deadline: U32, finding: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  +tx = (x + 12 + (index % 12) * 17 : U32)
  +ty = (y + 68 : U32)
  +color = select_color((age * 4 > deadline * 3 : U32), 15758447, select_color((age * 2 > deadline : U32), 16755794, select_color(finding, 16768133, 9756671)))
  base = F.put(tx, ty, 12, 14, color, rest)
  F.text(U32.show((id % 100 : U32)), tx, (ty + 4 : U32), 1, 1058076, F.put(tx, (ty + 17 : U32), U32.min(12, (12 * elapsed / U32.max(1, service) : U32)), 2, 9170322, base))

def token_if(show: Bool, index: U32, x: U32, y: U32, service: U32, deadline: U32, id: U32, elapsed: U32, age: U32, finding: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match show:
    case False{}: rest
    case True{}: token_draw(index, x, y, id, elapsed, service, age, deadline, finding, rest)

def tokens(jobs: List<&2, M.Job>, +stage: U32, +index: U32, +x: U32, +y: U32, +service: U32, +hold: U32, +deadline: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match jobs:
    case Nil{}: rest
    case Con{M.Packet{jobId, id, elapsed, age, finding, held}, tail}:
      +on = U32.is_eq(id, stage)
      after = tokens(tail, stage, (index + select_color(on, 1, 0) : U32), x, y, service, hold, deadline, rest)
      token_if(on && (index < 12 : U32), index, x, y, select_color(held, hold, service), deadline, jobId, elapsed, age, finding, after)

def select_text(on: Bool, yes: String, no: String) -> String:
  match on:
    case True{}: yes
    case False{}: no

def destination(nodes: List<&2, M.Stage>, +id: U32) -> String:
  match nodes id:
    case _ 255: "DONE"
    case Nil{} _: "UNKNOWN"
    case Con{M.Node{other, label, _, _, _, _, _, _, _, _}, rest} _:
      select_text(U32.is_eq(other, id), label, destination(rest, id))

def card(+nodes: List<&2, M.Stage>, +index: U32, node: M.Stage, station: M.StageState, +jobs: List<&2, M.Job>, +selected: U32, +deadline: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match node station:
    case M.Node{+id, label, +service, +limit, immediate, +resource, +hold, next, nextFinding, cost} M.Station{_, workers, +level, completed, refused}:
      +x = (16 + (index % 2) * 248 : U32)
      +y = (142 + (index / 2) * 140 : U32)
      +count = count_jobs(jobs, id)
      +effectiveService = U32.max(1, (service / (level + 1) : U32))
      border = F.put(x, y, 232, 128, select_color(U32.is_eq(id, selected), 12900846, 2901312), rest)
      body = F.put((x + 2 : U32), (y + 2 : U32), 228, 124, 1518380, border)
      title = F.text(U32.show((index + 1 : U32)) ++ " " ++ label, (x + 12 : U32), (y + 12 : U32), 2, 16050112, body)
      info = F.text("WORKERS " ++ U32.show(workers) ++ "  LEVEL " ++ U32.show(level), (x + 12 : U32), (y + 32 : U32), 1, 12900846, title)
      counts = F.text("BUSY " ++ U32.show(running_jobs(jobs, id)) ++ " WAIT " ++ U32.show(waiting_jobs(jobs, id)) ++ " HELD " ++ U32.show(held_jobs(jobs, id)), (x + 12 : U32), (y + 46 : U32), 1, select_color((waiting_jobs(jobs, id) >= limit : U32) && (limit > 0 : U32) || (count >= resource : U32) && (resource > 0 : U32), 15758447, 12439239), info)
      ages = F.text("AGE " ++ U32.show((oldest(jobs, id) * 20 : U32)) ++ " MS QUEUE " ++ U32.show(waiting_jobs(jobs, id)) ++ "/" ++ U32.show(limit), (x + 12 : U32), (y + 57 : U32), 1, 12439239, counts)
      stats = F.text("PASSED " ++ U32.show(completed) ++ " REFUSED " ++ U32.show(refused), (x + 12 : U32), (y + 99 : U32), 1, 11913663, ages)
      routing = F.text("NEXT " ++ destination(nodes, next) ++ " / FIND " ++ destination(nodes, nextFinding), (x + 12 : U32), (y + 89 : U32), 1, 16768133, stats)
      caption = F.text("SERVICE " ++ U32.show((effectiveService * 20 : U32)) ++ " MS  U COST " ++ U32.show((cost * (level + 1) : U32)), (x + 12 : U32), (y + 111 : U32), 1, 11913663, routing)
      tokens(jobs, id, 0, x, y, effectiveService, hold, deadline, caption)

def cards(nodes: List<&2, M.Stage>, +all: List<&2, M.Stage>, +index: U32, stations: List<&2, M.StageState>, +jobs: List<&2, M.Job>, +selected: U32, +deadline: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match nodes stations:
    case Con{node, ns} Con{station, ss}:
      card(all, index, node, station, jobs, selected, deadline, cards(ns, all, (index + 1 : U32), ss, jobs, selected, deadline, rest))
    case _ _: rest

def phase_text(phase: U32, paused: Bool) -> String:
  match phase paused:
    case _ True{}: "PAUSED - SPACE RESUME"
    case 0 _: "PREPARE - N START WAVE"
    case 1 _: "FLOW ACTIVE"
    case 2 _: "ALL WAVES PROCESSED - R RESET"
    case _ _: "BACKLOG OVERLOAD - R RESET"

def selected_hint(nodes: List<&2, M.Stage>, +selected: U32) -> String:
  match nodes:
    case Nil{}: "SELECT A STATION"
    case Con{M.Node{id, label, _, limit, immediate, resource, hold, _, _, _}, rest}:
      hint = label ++ " " ++ select_text(immediate, "NO WAIT ", "WAIT SPACE " ++ U32.show(limit) ++ " ") ++ "HOLD " ++ U32.show((hold * 20 : U32)) ++ " MS"
      select_text(U32.is_eq(id, selected), hint, selected_hint(rest, selected))

def scene(config: M.Config, state: M.State) -> List<&2, F.Rect>:
  match config state:
    case M.Board{label, +nodes, _, _, _, _, +deadline, waves, _} M.World{clock, _, wave, phase, lives, gold, score, left, _, pace, paused, +selected, free, offered, +finished, dropped, stations, +jobs}:
      background = F.put(0, 0, 512, 512, 1058076, Nil{})
      board = cards(nodes, nodes, 0, stations, jobs, selected, deadline, background)
      title = F.text(label, 16, 13, 3, 16050112, board)
      summary = F.text("HEALTH " ++ U32.show(lives) ++ "  BUDGET " ++ U32.show(gold) ++ "  DONE " ++ U32.show(finished), 16, 43, 2, 12900846, title)
      waveinfo = F.text("WAVE " ++ U32.show(wave) ++ "/" ++ U32.show(waves) ++ " ARRIVALS " ++ U32.show(left) ++ " FREE WORKERS " ++ U32.show(free), 16, 68, 1, 12439239, summary)
      pacing = F.text("ADMISSION PACE " ++ U32.show((pace * 20 : U32)) ++ " MS" ++ "  AGE LIMIT " ++ U32.show((deadline * 20 : U32)) ++ " MS", 16, 83, 1, 12439239, waveinfo)
      coverage = F.text("OFFERED " ++ U32.show(offered) ++ " DONE " ++ U32.show(finished) ++ " LOST " ++ U32.show(dropped), 16, 94, 1, 12439239, pacing)
      status = F.text(phase_text(phase, paused), 16, 106, 2, 16768133, coverage)
      direction = F.text("SYNTHETIC FLOW - ROUTES SHOWN ON STATIONS", 16, 127, 1, 11913663, status)
      hint = F.text(selected_hint(nodes, selected), 16, 420, 1, 16768133, direction)
      controls = F.text("1-4 SELECT  MINUS RETURN  PLUS ASSIGN  U UPGRADE", 16, 438, 1, 16050112, hint)
      controls2 = F.text("BRACKETS PACE  N NEXT  SPACE PAUSE  R RESET  TAB SCENARIO", 16, 454, 1, 16050112, controls)
      legend = F.text("BLUE WORK  GOLD FINDING  RED AGED  BAR PROGRESS", 16, 478, 1, 12439239, controls2)
      F.text("STATIONS PROCESS - BACKLOG AGE DAMAGES HEALTH", 16, 494, 1, 12439239, legend)

def view(config: M.Config, +s: M.State) -> M.State & Image:
  (s, paint(9n, 0, 0, 512, scene(config, s), False{}))
