# Executable bounded gameplay scenarios, entirely Bend. No theorem claims.
import Base
import ./Model.bend as M
import ./Game.bend as G

def frames(fuel: Nat, state: M.State) -> M.State:
  match fuel:
    case 0n:
      state
    case 1n+n:
      frames(n, G.advance(state))

def batches(fuel: Nat, state: M.State) -> M.State:
  match fuel:
    case 0n:
      state
    case 1n+n:
      batches(n, frames(50n, state))

def enemy_text(enemy: M.Enemy) -> String:
  match enemy:
    case M.Creep{id, progress, hp, maxHp, speed, slow, kind}:
      U32.show(id) ++ "/" ++ U32.show(progress) ++ "/" ++ U32.show(hp) ++ "/" ++
        U32.show(maxHp) ++ "/" ++ U32.show(speed) ++ "/" ++ U32.show(slow) ++ "/" ++ U32.show(kind)

def tower_text(tower: M.Tower) -> String:
  match tower:
    case M.Turret{x, y, kind, level, cooldown, flash, aimX, aimY}:
      U32.show(x) ++ "/" ++ U32.show(y) ++ "/" ++ U32.show(kind) ++ "/" ++ U32.show(level) ++
        "/" ++ U32.show(cooldown) ++ "/" ++ U32.show(flash) ++ "/" ++ U32.show(aimX) ++ "/" ++ U32.show(aimY)

def snapshot(state: M.State) -> String:
  match state:
    case M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, choice, selected, mouseX, mouseY, towers, enemies}:
      U32.show(clock) ++ ":" ++ U32.show(wave) ++ ":" ++ U32.show(phase) ++ ":" ++ U32.show(lives) ++
        ":" ++ U32.show(gold) ++ ":" ++ U32.show(kills) ++ ":" ++ U32.show(remaining) ++ ":" ++ U32.show(spawnIn) ++
        ":" ++ Bool.show(paused) ++ ":" ++ U32.show(choice) ++ ":" ++ U32.show(selected) ++ ":" ++
        U32.show(mouseX) ++ ":" ++ U32.show(mouseY) ++ ":" ++
        List.show(~&2, ~M.Tower, ~tower_text, towers) ++ ":" ++ List.show(~&2, ~M.Enemy, ~enemy_text, enemies)

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}:
      IO.print("PASS " ++ message)
    case False{}:
      IO.die(Unit, 1, "FAIL " ++ message)

def initial_guns() -> M.State:
  G.click(G.click(G.click(M.initial(), 224, 192, 0), 352, 192, 0), 224, 352, 0)

def initial_mixed() -> M.State:
  G.click(G.key(G.click(G.click(M.initial(), 224, 192, 0), 352, 192, 0), 50), 224, 352, 0)

def auto_start(state: M.State) -> M.State:
  G.key(state, 110)

def campaign(fuel: Nat, state: M.State) -> M.State:
  match fuel:
    case 0n:
      state
    case 1n+n:
      campaign(n, G.advance(auto_start(state)))

def equip(state: M.State, kind: U32, x: U32, y: U32) -> M.State:
  G.key(G.click(G.key(state, kind), x, y, 0), 117)

def spend(state: M.State) -> M.State:
  equip(equip(equip(equip(equip(state, 49, 224, 192), 49, 352, 192),
    51, 144, 352), 49, 224, 352), 50, 352, 352)

def prepare(+state: M.State) -> M.State:
  match state:
    case M.World{_, _, 0, _, _, _, _, _, _, _, _, _, _, _, _}:
      G.key(spend(state), 110)
    case _:
      state

def invested_campaign(fuel: Nat, state: M.State) -> M.State:
  match fuel:
    case 0n:
      state
    case 1n+n:
      invested_campaign(n, G.advance(prepare(state)))

def report(name: String, +state: M.State) -> IO(Unit):
  IO.print(name ++ ": " ++ G.status(state) ++ " | " ++ snapshot(state))

def life(state: M.State) -> U32:
  match state:
    case M.World{_, _, _, lives, _, _, _, _, _, _, _, _, _, _, _}:
      lives

def phase(state: M.State) -> U32:
  match state:
    case M.World{_, _, phase, _, _, _, _, _, _, _, _, _, _, _, _}:
      phase

def gold(state: M.State) -> U32:
  match state:
    case M.World{_, _, _, _, gold, _, _, _, _, _, _, _, _, _, _}:
      gold

def kills(state: M.State) -> U32:
  match state:
    case M.World{_, _, _, _, _, kills, _, _, _, _, _, _, _, _, _}:
      kills

def combat_state(towers: List<&2, M.Tower>, enemies: List<&2, M.Enemy>) -> M.State:
  M.World{0, 1, 1, 15, 0, 0, 0, 0, False{}, 0, 0, 256, 224, towers, enemies}

def first_progress(es: List<&2, M.Enemy>) -> U32:
  match es:
    case Nil{}:
      0
    case Con{M.Creep{_, p, _, _, _, _, _}, _}:
      p

def progress(state: M.State) -> U32:
  match state:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, es}:
      first_progress(es)

def main() -> IO(Unit):
  do IO<Unit>:
    +prepared : M.State = initial_guns()
    +started : M.State = G.key(prepared, 110)
    +paused : M.State = G.key(started, 32)
    +a : M.State = frames(1000n, started)
    +b : M.State = batches(20n, started)
    require(String.eq(snapshot(a), snapshot(b)), "same tick count has exact same game state")
    require(String.eq(snapshot(paused), snapshot(frames(100n, paused))), "pause freezes all game state")
    require(String.eq(snapshot(prepared), snapshot(frames(100n, prepared))), "preparation waits for start")
    require(U32.is_eq(gold(prepared), 30), "three guns cost ninety from initial 120")
    require(U32.is_eq(gold(G.click(M.initial(), 224, 144, 0)), 120), "road placement cannot spend gold")
    require(String.eq(snapshot(M.initial()), snapshot(G.key(a, 114))), "restart restores initial world")
    require((kills(a) > 0 : U32), "built guns acquire enemies and earn kills")
    +once : M.State = G.advance(combat_state(
      [M.Turret{208, 208, 0, 1, 0, 0, 208, 208}, M.Turret{240, 208, 0, 1, 0, 0, 240, 208}],
      [M.Creep{1, 208, 1, 1, 1, 0, 0}]))
    require(U32.is_eq(kills(once), 1) && U32.is_eq(gold(once), 30), "two towers cannot claim the same kill bounty")
    +blast : M.State = G.advance(combat_state([M.Turret{240, 208, 2, 1, 0, 0, 240, 208}],
      [M.Creep{1, 208, 1, 1, 1, 0, 0}, M.Creep{2, 216, 1, 1, 1, 0, 0}]))
    require(U32.is_eq(kills(blast), 2), "splash hits two neighboring enemies")
    +chilled : M.State = G.advance(combat_state([M.Turret{240, 208, 1, 1, 0, 0, 240, 208}],
      [M.Creep{1, 208, 100, 100, 5, 0, 1}]))
    require(U32.is_eq(progress(G.advance(chilled)), 215), "frost reduces a runner's next movement from five pixels to two")
    +selected : M.State = G.click(G.click(M.initial(), 224, 192, 0), 224, 192, 0)
    +upgraded : M.State = G.key(selected, 117)
    require(U32.is_eq(gold(upgraded), 50), "selected level-one upgrade costs forty")
    require(U32.is_eq(gold(G.key(upgraded, 117)), 50), "unaffordable level-two upgrade preserves gold")
    +idle : M.State = campaign(20000n, M.initial())
    +guns : M.State = campaign(20000n, initial_guns())
    +mixed : M.State = campaign(20000n, initial_mixed())
    +invested : M.State = invested_campaign(20000n, initial_guns())
    require(U32.is_eq(phase(idle), 3), "undefended campaign loses")
    require((life(idle) <= 15 : U32) && (life(guns) <= 15 : U32) && (life(mixed) <= 15 : U32), "lives never wrap in these campaigns")
    report("UNDEFENDED", idle)
    report("THREE GUNS", guns)
    report("GUNS AND FROST", mixed)
    report("SPENDING BETWEEN WAVES", invested)
    require(U32.is_eq(phase(invested), 2), "spending on upgrades and more defenses can win all six waves")
