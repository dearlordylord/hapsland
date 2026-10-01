# Pure gameplay reducer: fixed twenty-millisecond ticks, no external effects.
import Base
import ./Model.bend as M

type Shot is Data:
  Shot{tower: M.Tower, enemies: List<&2, M.Enemy>}

def shot_tower(value: Shot) -> M.Tower:
  match value:
    case Shot{tower, enemies}: tower

def shot_enemies(value: Shot) -> List<&2, M.Enemy>:
  match value:
    case Shot{tower, enemies}: enemies

type Harvest is Data:
  Harvest{enemies: List<&2, M.Enemy>, money: U32, count: U32}

def harvest_enemies(value: Harvest) -> List<&2, M.Enemy>:
  match value:
    case Harvest{enemies, money, count}: enemies

def harvest_money(value: Harvest) -> U32:
  match value:
    case Harvest{enemies, money, count}: money

def harvest_count(value: Harvest) -> U32:
  match value:
    case Harvest{enemies, money, count}: count

type Combat is Data:
  Combat{towers: List<&2, M.Tower>, enemies: List<&2, M.Enemy>, money: U32, count: U32}

def combat_towers(value: Combat) -> List<&2, M.Tower>:
  match value:
    case Combat{towers, enemies, money, count}: towers

def combat_enemies(value: Combat) -> List<&2, M.Enemy>:
  match value:
    case Combat{towers, enemies, money, count}: enemies

def combat_money(value: Combat) -> U32:
  match value:
    case Combat{towers, enemies, money, count}: money

def combat_count(value: Combat) -> U32:
  match value:
    case Combat{towers, enemies, money, count}: count

type Motion is Data:
  Motion{enemies: List<&2, M.Enemy>, escaped: U32}

def motion_enemies(value: Motion) -> List<&2, M.Enemy>:
  match value:
    case Motion{enemies, escaped}: enemies

def motion_escaped(value: Motion) -> U32:
  match value:
    case Motion{enemies, escaped}: escaped

type Arrivals is Data:
  Arrivals{enemies: List<&2, M.Enemy>, left: U32, wait: U32}

def arrivals_enemies(value: Arrivals) -> List<&2, M.Enemy>:
  match value:
    case Arrivals{enemies, left, wait}: enemies

def arrivals_left(value: Arrivals) -> U32:
  match value:
    case Arrivals{enemies, left, wait}: left

def arrivals_wait(value: Arrivals) -> U32:
  match value:
    case Arrivals{enemies, left, wait}: wait

type Aim is Data:
  Target{found: Bool, +id: U32, +progress: U32, +x: U32, +y: U32}

def cost(+kind: U32) -> U32:
  M.choose_word(30, M.choose_word(40, 55, U32.is_eq(kind, 1)), U32.is_eq(kind, 0))

def range(+kind: U32, +level: U32) -> U32:
  (M.choose_word(100, 88, U32.is_eq(kind, 0)) + level * 12 : U32)

def damage(+kind: U32, +level: U32) -> U32:
  M.choose_word((8 + level * 5 : U32), M.choose_word((3 + level * 2 : U32), (12 + level * 7 : U32), U32.is_eq(kind, 1)), U32.is_eq(kind, 0))

def reload(+kind: U32) -> U32:
  M.choose_word(15, M.choose_word(26, 38, U32.is_eq(kind, 1)), U32.is_eq(kind, 0))

def aim_choose(+candidate: Aim, +old: Aim, +take: Bool) -> Aim:
  match take:
    case True{}: candidate
    case False{}: old

def target(+xs: List<&2, M.Enemy>, +x: U32, +y: U32, +radius: U32, +best: Aim) -> Aim:
  match xs best:
    case Nil{} _:
      best
    case Con{M.Creep{+id, +progress, _, _, _, _, _}, +tail} Target{+found, _, +bp, _, _}:
      +ex = Pair.fst(U32, U32, M.path(progress))
      +ey = Pair.snd(U32, U32, M.path(progress))
      take = (M.distance(x, y, ex, ey) <= M.square(radius) : U32) && ((progress >= bp : U32) || Bool.not(found))
      target(tail, x, y, radius, aim_choose(Target{True{}, id, progress, ex, ey}, best, take))

def hurt(+xs: List<&2, M.Enemy>, +id: U32, +x: U32, +y: U32, +kind: U32, +amount: U32) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: Nil{}
    case Con{M.Creep{+eid, +progress, +hp, +maxHp, +speed, +slow, +ekind}, +tail}:
      +ex = Pair.fst(U32, U32, M.path(progress))
      +ey = Pair.snd(U32, U32, M.path(progress))
      +hit = U32.is_eq(eid, id) || (U32.is_eq(kind, 2) && (M.distance(ex, ey, x, y) <= 2304 : U32))
      dealt = M.choose_word(amount, 0, hit)
      chilled = M.choose_word(70, slow, hit && U32.is_eq(kind, 1))
      Con{M.Creep{eid, progress, M.sub(hp, dealt), maxHp, speed, chilled, ekind}, hurt(tail, id, x, y, kind, amount)}

def tower_tick(+tower: M.Tower, +enemies: List<&2, M.Enemy>, +aim: Aim) -> Shot:
  match tower aim:
    case M.Turret{+x, +y, +kind, +level, 0, +flash, +aimX, +aimY} Target{False{}, _, _, _, _}:
      Shot{M.Turret{x, y, kind, level, 0, M.sub(flash, 1), aimX, aimY}, enemies}
    case M.Turret{+x, +y, +kind, +level, 0, _, _, _} Target{True{}, +id, _, +tx, +ty}:
      Shot{M.Turret{x, y, kind, level, reload(kind), 5, tx, ty}, hurt(enemies, id, tx, ty, kind, damage(kind, level))}
    case M.Turret{+x, +y, +kind, +level, +cooldown, +flash, +aimX, +aimY} _:
      Shot{M.Turret{x, y, kind, level, M.sub(cooldown, 1), M.sub(flash, 1), aimX, aimY}, enemies}

# Dead enemies are removed after each individual shot: each bounty occurs once.
def collect(+xs: List<&2, M.Enemy>) -> Harvest:
  match xs:
    case Nil{}: Harvest{Nil{}, 0, 0}
    case Con{M.Creep{_, _, 0, _, _, _, +kind}, +tail}:
      +bundle = collect(tail)
      +rest = harvest_enemies(bundle)
      +money = harvest_money(bundle)
      +count = harvest_count(bundle)
      Harvest{rest, (money + 5 + kind * 2 : U32), (count + 1 : U32)}
    case Con{+head, +tail}:
      +bundle = collect(tail)
      +rest = harvest_enemies(bundle)
      +money = harvest_money(bundle)
      +count = harvest_count(bundle)
      Harvest{Con{head, rest}, money, count}

def tower_stats(+tower: M.Tower) -> U32 & U32 & U32 & U32:
  match tower:
    case M.Turret{+x, +y, +kind, +level, _, _, _, _}: (x, y, kind, level)

def towers_tick(+xs: List<&2, M.Tower>, +enemies: List<&2, M.Enemy>) -> Combat:
  match xs:
    case Nil{}: Combat{Nil{}, enemies, 0, 0}
    case Con{+head, +tail}:
      +x = Pair.fst(U32, U32 & U32 & U32, tower_stats(head))
      +y = Pair.fst(U32, U32 & U32, Pair.snd(U32, U32 & U32 & U32, tower_stats(head)))
      +kind = Pair.fst(U32, U32, Pair.snd(U32, U32 & U32, Pair.snd(U32, U32 & U32 & U32, tower_stats(head))))
      +level = Pair.snd(U32, U32, Pair.snd(U32, U32 & U32, Pair.snd(U32, U32 & U32 & U32, tower_stats(head))))
      +bundle = tower_tick(head, enemies, target(enemies, x, y, range(kind, level), Target{False{}, 0, 0, 0, 0}))
      +updated = shot_tower(bundle)
      +shot = shot_enemies(bundle)
      +bundle = collect(shot)
      +alive = harvest_enemies(bundle)
      +earned = harvest_money(bundle)
      +killed = harvest_count(bundle)
      +bundle = towers_tick(tail, alive)
      +rest = combat_towers(bundle)
      +final = combat_enemies(bundle)
      +money = combat_money(bundle)
      +count = combat_count(bundle)
      Combat{Con{updated, rest}, final, (earned + money : U32), (killed + count : U32)}


def walk_put(+enemy: M.Enemy, +rest: List<&2, M.Enemy>, +escaped: U32, +exit: Bool) -> Motion:
  match exit:
    case True{}: Motion{rest, (escaped + 1 : U32)}
    case False{}: Motion{Con{enemy, rest}, escaped}

def walk(+xs: List<&2, M.Enemy>) -> Motion:
  match xs:
    case Nil{}: Motion{Nil{}, 0}
    case Con{M.Creep{+id, +progress, +hp, +maxHp, +speed, +slow, +kind}, +tail}:
      +bundle = walk(tail)
      +rest = motion_enemies(bundle)
      +escaped = motion_escaped(bundle)
      step = M.choose_word(U32.max(1, (speed / 2 : U32)), speed, (slow > 0 : U32))
      +next = (progress + step : U32)
      walk_put(M.Creep{id, next, hp, maxHp, speed, M.sub(slow, 1), kind}, rest, escaped, (next >= 1312 : U32))

def spawn(+wave: U32, +left: U32, +clock: U32) -> M.Enemy:
  +kind = M.choose_word(2, M.choose_word(1, 0, U32.is_eq((left % 4 : U32), 0)), U32.is_eq((left % 5 : U32), 0))
  +hp = (16 + wave * 18 : U32)
  M.Creep{clock, 0, M.choose_word((hp * 3 : U32), hp, U32.is_eq(kind, 2)), M.choose_word((hp * 3 : U32), hp, U32.is_eq(kind, 2)), M.choose_word(5, M.choose_word(1, 2, U32.is_eq(kind, 2)), U32.is_eq(kind, 1)), 0, kind}

def spawn_tick(+xs: List<&2, M.Enemy>, +wave: U32, +left: U32, +wait: U32, +clock: U32, +ready: Bool) -> Arrivals:
  match ready:
    case True{}: Arrivals{Con{spawn(wave, left, clock), xs}, M.sub(left, 1), M.sub(34, wave)}
    case False{}: Arrivals{xs, left, M.sub(wait, 1)}

def phase_end(+wave: U32, +lives: U32, +gold: U32, +remaining: U32, +enemies: List<&2, M.Enemy>) -> U32 & U32:
  match lives remaining enemies:
    case 0 _ _: (3, gold)
    case _ 0 Nil{}: (M.choose_word(2, 0, (wave >= 6 : U32)), (gold + 20 + wave * 5 : U32))
    case _ _ _: (1, gold)

def advance_live(+state: M.State) -> M.State:
  match state:
    case M.World{+clock, +wave, +phase, +lives, +gold, +kills, +remaining, +spawnIn, +paused, +choice, +selected, +mouseX, +mouseY, +towers, +enemies}:
      +bundle = spawn_tick(enemies, wave, remaining, spawnIn, clock, (remaining > 0 : U32) && U32.is_eq(spawnIn, 0))
      +arrived = arrivals_enemies(bundle)
      +left = arrivals_left(bundle)
      +wait = arrivals_wait(bundle)
      +bundle = walk(arrived)
      +walked = motion_enemies(bundle)
      +escaped = motion_escaped(bundle)
      +bundle = towers_tick(towers, walked)
      +ts = combat_towers(bundle)
      +alive = combat_enemies(bundle)
      +money = combat_money(bundle)
      +count = combat_count(bundle)
      +life = M.sub(lives, escaped)
      +nextPhase = Pair.fst(U32, U32, phase_end(wave, life, (gold + money : U32), left, alive))
      +nextGold = Pair.snd(U32, U32, phase_end(wave, life, (gold + money : U32), left, alive))
      M.World{(clock + 1 : U32), wave, nextPhase, life, nextGold, (kills + count : U32), left, wait, paused, choice, selected, mouseX, mouseY, ts, alive}

def advance(+state: M.State) -> M.State:
  match state:
    case M.World{+clock, +wave, 1, +lives, +gold, +kills, +remaining, +spawnIn, False{}, +choice, +selected, +mouseX, +mouseY, +towers, +enemies}:
      advance_live(M.World{clock, wave, 1, lives, gold, kills, remaining, spawnIn, False{}, choice, selected, mouseX, mouseY, towers, enemies})
    case other: other

def decide(+yes: Bool, a: M.State, b: M.State) -> M.State:
  match yes:
    case True{}: a
    case False{}: b

def move(state: M.State, x: U32, y: U32) -> M.State:
  match state:
    case M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, choice, selected, _, _, towers, enemies}:
      M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, choice, selected, x, y, towers, enemies}

def tower_index(xs: List<&2, M.Tower>, +x: U32, +y: U32, +index: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{M.Turret{tx, ty, _, _, _, _, _, _}, tail}:
      M.choose_word(index, tower_index(tail, x, y, (index + 1 : U32)), (M.distance(x, y, tx, ty) < 784 : U32))

def select(state: M.State, index: U32) -> M.State:
  match state:
    case M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, choice, _, x, y, towers, enemies}:
      M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, choice, index, x, y, towers, enemies}

def placement_valid(+ts: List<&2, M.Tower>, +x: U32, +y: U32) -> Bool:
  (x >= 32 : U32) && (x <= 480 : U32) && (y >= 96 : U32) && (y <= 464 : U32) && Bool.not(M.road(x, y)) && U32.is_eq(tower_index(ts, x, y, 1), 0)

def build(+state: M.State, +x: U32, +y: U32) -> M.State:
  match state:
    case M.World{+clock, +wave, +phase, +lives, +gold, +kills, +remaining, +spawnIn, +paused, +choice, +selected, +mx, +my, +towers, +enemies}:
      valid = placement_valid(towers, x, y) && (gold >= cost(choice) : U32) && (phase < 2 : U32)
      decide(valid, M.World{clock, wave, phase, lives, M.sub(gold, cost(choice)), kills, remaining, spawnIn, paused, choice, 0, mx, my, Con{M.Turret{x, y, choice, 1, 0, 0, x, y}, towers}, enemies}, state)

def click_pick(+state: M.State, x: U32, y: U32, +index: U32) -> M.State:
  decide((index > 0 : U32), select(state, index), build(state, x, y))

def click(+state: M.State, +x: U32, +y: U32, +button: U32) -> M.State:
  match state:
    case M.World{_, _, +phase, _, _, _, _, _, _, _, _, _, _, +towers, _}:
      +sx = ((x / 32) * 32 + 16 : U32)
      +sy = ((y / 32) * 32 + 16 : U32)
      decide(U32.is_eq(button, 0) && (phase < 2 : U32), click_pick(move(state, x, y), sx, sy, tower_index(towers, x, y, 1)), state)

def upgrade_cost(+level: U32) -> U32:
  M.choose_word((20 + level * 20 : U32), 0, (level < 3 : U32))

def upgrade_price(xs: List<&2, M.Tower>, +index: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{M.Turret{_, _, _, +level, _, _, _, _}, tail}:
      M.choose_word(upgrade_cost(level), upgrade_price(tail, M.sub(index, 1)), U32.is_eq(index, 1))

def upgrade_one(tower: M.Tower, yes: Bool) -> M.Tower:
  match tower yes:
    case M.Turret{x, y, kind, level, cooldown, flash, ax, ay} True{}:
      M.Turret{x, y, kind, (level + 1 : U32), cooldown, flash, ax, ay}
    case tower False{}: tower

def upgrade_list(xs: List<&2, M.Tower>, +index: U32) -> List<&2, M.Tower>:
  match xs:
    case Nil{}: Nil{}
    case Con{head, tail}:
      Con{upgrade_one(head, U32.is_eq(index, 1)), upgrade_list(tail, M.sub(index, 1))}

def upgrade(+state: M.State) -> M.State:
  match state:
    case M.World{+clock, +wave, +phase, +lives, +gold, +kills, +remaining, +spawnIn, +paused, +choice, +selected, +mx, +my, +towers, +enemies}:
      +price = upgrade_price(towers, selected)
      decide((price > 0 : U32) && (gold >= price : U32) && (phase < 2 : U32), M.World{clock, wave, phase, lives, M.sub(gold, price), kills, remaining, spawnIn, paused, choice, selected, mx, my, upgrade_list(towers, selected), enemies}, state)

def choose(state: M.State, kind: U32) -> M.State:
  match state:
    case M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, _, selected, mx, my, towers, enemies}:
      M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, kind, selected, mx, my, towers, enemies}

def pause(state: M.State) -> M.State:
  match state:
    case M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, paused, choice, selected, mx, my, towers, enemies}:
      M.World{clock, wave, phase, lives, gold, kills, remaining, spawnIn, Bool.not(paused), choice, selected, mx, my, towers, enemies}

def wave_start(state: M.State) -> M.State:
  match state:
    case M.World{clock, +wave, 0, lives, gold, kills, _, _, False{}, choice, selected, mx, my, towers, enemies}:
      M.World{clock, (wave + 1 : U32), 1, lives, gold, kills, (7 + wave * 3 : U32), 0, False{}, choice, selected, mx, my, towers, enemies}
    case other: other

def key(state: M.State, code: U32) -> M.State:
  match code:
    case 49: choose(state, 0)
    case 50: choose(state, 1)
    case 51: choose(state, 2)
    case 85: upgrade(state)
    case 117: upgrade(state)
    case 78: wave_start(state)
    case 110: wave_start(state)
    case 13: wave_start(state)
    case 32: pause(state)
    case 80: pause(state)
    case 112: pause(state)
    case 82: M.initial()
    case 114: M.initial()
    case _: state

def status(state: M.State) -> String:
  match state:
    case M.World{clock, wave, phase, lives, gold, kills, remaining, _, paused, choice, selected, _, _, _, _}:
      "wave=" ++ U32.show(wave) ++ " phase=" ++ U32.show(phase) ++ " lives=" ++ U32.show(lives) ++ " gold=" ++ U32.show(gold) ++ " kills=" ++ U32.show(kills) ++ " remaining=" ++ U32.show(remaining) ++ " tick=" ++ U32.show(clock)
