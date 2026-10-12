# Trueno: driving core handover

You are inheriting a car that skids, catches slides, threads gaps, reverses out of
trouble and J-turns back into forward motion. It was built for an isometric Tesco
car park; you are putting it somewhere else. This document is the transferable
part — the physics, the driver, the manoeuvres, the tuned numbers — plus the
mistakes that cost the most time, so you don't repay them.

Reference implementation: `trueno-testdrive-at-tesco.html`, single file, no
dependencies. Everything below is quoted from it, not from memory.

---

## 1. What to take and what to leave

**Take:** the physics step, the collision response, the reactive driver, the four
manoeuvres, and the tuned constants in §8. These are environment-agnostic.

**Leave unless you want them:** the evolutionary learner, the ghost planner, the
scoring function. They are about *improving* a driver, not driving. §6 and §7
explain what they actually bought, which in one case is "nothing".

**Must be replaced:** the world interface. The car only touches the world through
four functions (§2.1). Implement those for your environment and the rest ports
unchanged.

---

## 2. The interface between car and world

Everything the car knows about the world goes through these. Implement them and
nothing else needs to change.

```js
solid(x, y)               // -> truthy if that point is blocked. Integer cell lookup
                          //    in the original; make it whatever your world is.

probe(x, y, dx, dy, len)  // -> distance to the first obstruction along a unit
                          //    direction, or len. Used for perception.

sdfAt(x, y)               // -> signed distance to the nearest solid surface,
                          //    negative inside. Used for collision.

sdfNormal(x, y)           // -> unit vector pointing away from the nearest surface.
```

### 2.1 Why the signed distance field is not optional

The original world is a 1 m grid. A diagonal wall in a grid is a staircase, and the
normal at any step face points along an axis. A car meant to glance off a 45°
kerb gets hit square instead, sticks, and stops.

Measured, on walls of different angles, how much the surface normal wobbles as you
slide along it:

| wall | 5×5 cell kernel | distance field |
|---|---|---|
| exactly 45° | 0.0° | 2.5° |
| 27° | **10.3°** | 2.5° |
| 63° | **9.5°** | 2.7° |
| curved | resolves nothing | tracks it |

And in the actual environment, per-cell normals produced a run where the car spent
2.5% of its life in contact, took 134 kJ of median damage and crawled at 4.7 mph —
caught on geometry it could not get off. The same seed with the field: 14.3 mph,
11 kJ.

If your world is already polygonal or has real surface normals, you get this for
free and can skip the field. If it's voxel/grid/tile based, build the field. Two
chamfer passes (1.0 / 1.414 weights) over the solid set and the open set, subtract
one from the other, then **one blur pass** — the chamfer approximation ripples and
the ripple shows up in the gradient as a wobbly normal. Sample it bilinearly and
take the normal by central differences at ±0.7 units.

Rebuild cost is trivial (~120k ops for 30k cells); the original rebuilds it every
time a car moves.

---

## 3. The physics

Fixed timestep, **1/120 s**, with an accumulator. Slip-curve tyre models go unstable
if dt wanders. Rollouts for planning can run at 1/30 (drifts < 0.7 m over a 2 s
horizon); don't go coarser.

State: `x, y, h` (heading), `vx, vy` (body frame), `r` (yaw rate), `ax` (kept for
load transfer), `d` (actual steering angle).
Controls: `steer, thr, brk, hb` (handbrake 0–1), `rev` (reverse throttle 0–1).

### 3.1 Constants

```js
M = 1120        // kg
IZ = 1750       // yaw inertia
L = 2.45        // wheelbase; LF = L*0.53, LR = L*0.47
HCG = 0.56      // CoG height — high, so it transfers weight readily
MU_S = 1.05     // peak grip
MU_K = 0.45     // sliding grip
MU_V = 1.1      // how fast grip collapses once sliding
PB = 7.0, PC = 1.55   // tyre curve stiffness / shape
F_DRIVE = 6600  // N at the rear wheels
F_BRAKE = 13500 // N total, split 62 front / 38 rear
DRAG = 0.40, RRES = 0.017*M*G
MAX_STEER = 0.62 rad, STEER_RATE = 4.6 rad/s
```

The MU_S / MU_K **gap** is what makes it tail-happy, far more than the absolute
level. 1.05 → 0.45 means grip more than halves the instant a tyre starts sliding.
Raise MU_K toward MU_S for a grippy, planted car; widen the gap for a snappier one.

`STEER_RATE = 4.6` is deliberately slow. A slide gets away from the driver before
he can catch it, which is most of the character. It is not a gene, so he cannot
tune it away.

### 3.2 The step

```
1. Steering actuator: move car.d toward ctl.steer, rate-limited by STEER_RATE.

2. Slip angles, per axle, IN THE WHEEL'S OWN FRAME against |v_long|:
     front: u = (vx, vy + LF*r), rotate by -delta, af = atan2(lat, max(|long|,1.2))
     rear:  u = (vx, vy - LR*r),                  ar = atan2(u.y, max(|u.x|,1.2))

3. Load transfer from last step's ax:
     Fzf = M*(G*LR - ax*HCG)/L,  Fzr = M*(G*LF + ax*HCG)/L,  floor at 60 N

4. Grip falls off with lateral slip SPEED, not slip angle:
     spd = |v_axle| * |sin(alpha)|
     mu  = MU_K + (MU_S-MU_K)*exp(-spd/MU_V)
     cap = mu * Fz

5. Longitudinal forces, then friction ellipse per axle:
     clamp Fx to ±0.99*cap, then FyMax = sqrt(cap² - Fx²)
     Fy = -cap * sin(PC * atan(PB * alpha)), clamped to ±FyMax

6. Handbrake (see §3.4)

7. Rotate front forces into the body, sum, integrate:
     ax = Fx/M;  vx += (ax + r*vy)*dt;  vy += (Fy/M - r*vx)*dt;  r += Mz/IZ*dt
     h += r*dt;  then advance x,y in world frame
```

**Step 2 is the one people get wrong.** If you compute slip against `|vx|` (i.e.
assume forward travel) the model behaves as though the car is always going
forwards, and reverse becomes stable. In reality the steered axle *trails* in
reverse, which is directionally unstable — and that instability **is** the J-turn.
Get this wrong and no amount of steering lock will rotate the car backwards.

### 3.3 Anti-creep guard

```js
if (|vx| < 0.06 && thr < 0.02 && rev < 0.02) { vx = 0; vy *= 0.4; }
```
Note the `rev` term. Without it the guard zeroes velocity every step while
reversing and the car can never accelerate backwards. This cost an hour to find.

### 3.4 Handbrake

A locked tyre doesn't steer, it just opposes whichever way it's being dragged.
Blend the rear axle force toward a pure friction vector opposing the rear contact
patch velocity:

```js
vR = rear axle velocity;  cap = MU_K * 0.95 * Fzr
FxR = FxR*(1-hb) - cap*(vRx/|vR|)*hb
FyR = FyR*(1-hb) - cap*(vRy/|vR|)*hb
```

Verified behaviour: same steering input at 40 mph gives 3° of slip on grip and
**20° with the handbrake up**, yaw rate 40°/s → 107°/s. Pulling it in a straight
line only slows the car, as it should.

---

## 4. Collision response

Per corner (4 corners of the body box), sample `sdfAt`. If negative you have exact
penetration depth and a smooth normal. Accumulate normals weighted by depth, then
separate by *exactly* the deepest penetration — not a fixed shove. A barely-touched
corner gets barely moved.

### 4.1 Sloped kerbs vs solid objects

Classify the contact: terrain-only contacts get ramp treatment, anything involving
another vehicle stays hard. In the original, terrain is identified by an `owner`
array (which cell belongs to which car) — the grid alone can't tell, since parked
cars are stamped into it.

**Ramp (terrain):** turn the velocity along the surface and feed a little back
outward, so he glances off and keeps rolling.
```js
wn += (-0.55*vn + 0.8)*n     // mild bounce plus a constant outward ease
vt *= 0.96                   // tangential barely scrubbed
r   *= 0.95                  // rotation barely damped
impact charged at 0.30×      // it's a graze
```

**Hard (vehicle/wall):** `bounce = 1.35`, tangential scrubbed 22%, `r *= 0.6`,
full impact energy.

Measured, at 35 mph into a kerb:

| angle | vertical wall | sloped |
|---|---|---|
| 10° glance | 15 mph out | **36 mph out** |
| 25° | 12 mph | 18 mph |
| 45° thump | 7 mph | 8 mph |

A shallow clip used to cost two-thirds of his speed. Now it costs nothing, while a
real hit still costs everything. Contact time only rose from 0.20% to 0.25%, so he
does *not* learn to ride the kerbs.

### 4.2 Struck objects should roll

If your environment has moveable objects, let them roll on their wheels: scrub
lateral motion hard (1.35 g), let longitudinal roll almost free (0.09 g). A 16 mph
knock sends a car 12 m, essentially all along its own axis. This measurably reduced
both wedging (22 → 12 episodes/hour) and clutter, because a struck object trundles
clear instead of becoming a new obstacle exactly where you hit it.

---

## 5. The driver

Reactive, runs at **30 Hz** (every 4th physics step). Cheap and surprisingly hard
to beat (see §7).

### 5.1 Perception

A fan of `rays` raycasts, spread over `fan` radians, reaching `reach` metres.
The fan is **centred on the velocity vector, not the nose**:

```js
gaze = clamp(-K_gaze * car.slip, ±1.3)   // eyes follow the slide
```

This is what a drifter does — eyes on the exit, not the bonnet. Sign convention
matters: `car.slip = atan2(-vy, max(1,|vx|))`, so the velocity direction is at
`-slip` from the nose, hence the negation. I had this backwards originally and
evolution inverted the gene to correct me.

### 5.2 Choosing a direction

```js
for each ray:
  centred = (0.5 + 0.5*cos(ray.local))^focus    // how much peripheral vision counts
  w = (ray.dist/reach)^aim * centred * (1 + boredom*staleness) / (1 + badVibes*dread)
  accumulate w, w*ray.angle
aim = weighted mean + bias*fan*0.5
```

`staleness` and `dread` are optional memory layers (§5.5).

### 5.3 Speed

```js
// clearance along the line he's CHOSEN, sanity-checked against straight ahead
fwd = min( dist of ray nearest to aim , dist of ray nearest to nose )
vTarget = min(K_vTop, vClear * fwd)
err = vTarget - vx
err > 0 ? thr = clamp(K_throttle*err/9) : brk = clamp(brake*err/9)
```

**Do not take the minimum over a cone of rays.** That was the single biggest
performance bug in the project. In a 11 m corridor a ray only 20° off-axis hits a
wall 15 m away, so the minimum-over-cone read 9.4 m of clearance where the real
figure was 43 m. The car was driving at 19 mph on a 190 m straight — not being
cautious, effectively driving in fog. Fixing this roughly doubled his pace.

Note this clearance rule *is* an anticipatory brake, and a good one. Keep it in
mind before adding a planner (§7).

### 5.4 Counter-steer

```js
excess = ar - clamp(ar, ±K_slipWant)          // rear slip beyond what he wants
steer  = steerGain*aim - yawDamp*r + K_ctrSteer*excess
```

### 5.5 Optional memory layers

Both are coarse grids (12 m cells) over the world, and both work through the ray
weights in §5.2 rather than as rules, so they can never override obstacle
avoidance.

- **Staleness** (`boredom`, `K_patience`): time since last visit; stale ground looks
  more inviting. Its real value is not exploration — it's an antidote to the
  degenerate attractor where the car finds one spot and stops moving. One test seed
  without it settled at 1.0 cells/window and 3.1 mph; with it, 29.7 cells and 23.9 mph.
- **Dread** (`badVibes`, `K_grudge`): stamp the zone wherever he was forced to
  reverse; dreaded ground looks less inviting, decaying over ~7 minutes. Dropped his
  time in a poisoned patch from 6.7% to 0.5%. Costs nothing measurable in pace.

Give `badVibes` a **floor**. With no dreaded ground early in a run the gene is under
no selection pressure and drifts to zero before it is ever needed.

---

## 6. The manoeuvres

Four phased sequences, each with a hard entry gate. All of them matter; the gates
matter more than the sequences.

### 6.1 Handbrake turn

Trigger: `cooldown done && err < 0 && |aim| > hbAim && spd > K_hbSpeed && |ar| < K_hbGate`.

The `err < 0` term (arriving faster than the corner allows) is essential. Without
it, he discovered he could sit on the handbrake ~15% of the time, which drops him
to 4.6 mph — and at that speed the yanks earn nothing either, so he was simply bad
with no gradient back out. Cooldown is `hold + 1.5 s` so it cannot become his
default state.

### 6.2 J-turn (reverse, flick, catch)

Phases: `back → flick → catch`, with `shuffle` as the no-room fallback.

```
entry:   stuck && room behind > 12 m  ->  back      (else straight to shuffle)
back:    full reverse, WHEEL DEAD STRAIGHT (steer = -0.3*r)
         -> flick when reverse speed >= K_jSpeed, or when room behind < 5 m
            and speed > 4.5 m/s (use what you've wound up before you run out)
flick:   full lock, LIFT OFF (K_jHold = 0.05)
         -> catch when rotated past K_jExit (2.6 rad) or 3 s elapsed
catch:   forward throttle K_jCatch, counter-steer to arrest
```

Two things here were counter-intuitive and are worth keeping:

**Lift off through the flick.** Holding reverse power fights the rotation. From 13 mph
in reverse, lifting gives 149° in 1.85 s at 118°/s peak and exits still carrying
6 mph; holding power gives 65°. Evolution never found this on its own, because
until the entry gate was right the flick barely ever ran and the gene was under no
pressure.

**Require the room before starting.** He needs roughly `v²/2a` to wind up plus a car
length to swing through — about 12 m. Below that there is no J-turn to be had and
attempting one produces a stunted pivot. Gated properly, average flick entry is
12–14 mph with **131–143° of rotation**; ungated it was 43°.

### 6.3 Bail-out turn (handbrake stop)

Trigger: a committed route just shut, *or* a straight-line stop won't fit:
`fwd < (v²/23.6) * bailMargin`. Braking distance goes with the **square** of speed;
a fixed "seconds of clearance" trigger fires far too readily when slow and far too
late when quick. Evolution told me this by turning a time-based trigger down to its
floor on every seed that drove well.

From 31 mph the car rotates 122° and stops dead in 2.2 s.

### 6.4 Getting stuck — read this one

Stuck must be measured as **lack of progress**, never as low speed:

```js
progT += dt;
if (progT >= 1.5) { stuckT = dist_moved_since_last_check < 2.2 ? stuckT + 1.5 : 0;
                    reset reference point; progT = 0; }
```

Leaning on an obstacle with the throttle on, the collision push-out jiggles the car
just enough to reset a speed-based timer every few frames. It never accumulates
enough to trigger an escape, and it never triggers a respawn either, so it can sit
there indefinitely. Before the fix, one seed spent **20% of an hour wedged, with a
single episode lasting 5½ minutes**. After: 0.3%, longest under 5 seconds.

Also: the no-room fallback must **reverse off** whatever it's leaning on before
driving away. Forward-only is exactly wrong when you're nose-first into something.

---

## 7. The ghost planner — and an honest verdict

Five rollouts through the real physics, 1.8 s horizon at 1/30 s, replanned every
0.3 s. Each ghost proposes a line **and a pace** (`as planned / line left / line
right / ease off / press on`). Winner's bias and pace feed back into the reactive
controller, weighted by `thinkTrust`.

Two design points, if you build one:

- **Score on speed carried to the horizon, not distance covered.** Distance rewards a
  burst into a dead end.
- **Terminal cost is mandatory.** Without one, ghosts vote "press on" 90% of the time,
  because the crash caused by excess speed happens just past the horizon. Penalise
  `max(0, v²/2a − clearance)` at the end state.

**The verdict: across eight seeds it was a wash.** 21.9 mph without the planner,
21.6 with. What it does do is narrow the spread (σ 5.4 → 3.7) — the worst runs
improve, the best give a little back. It halves throughput.

The reason is worth internalising: the reactive controller already contains three
forms of lookahead — clearance-proportional speed, the gap-finder's exit check, and
the bail-out's braking-distance test. The ghosts largely re-derive decisions it is
already making, and the model mismatch (simplified ghost controller, coarser rays)
adds noise. **Build the reactive driver properly before you reach for planning.**

---

## 8. Tuned values

These are from a trained genome, selected out of five three-hour runs by how it
scored on environments it had *never seen*, not on its training one. It beat the
hand-tuned defaults roughly 2:1 on the objective. Start here.

```js
// evolvable in the original (name, min, max, value)
rays        5     17    8.14     // number of raycasts
fan         0.6   4.9   0.79     // total cone, radians — he chose NARROW and long
reach       18    95    51.5     // ray length, metres
aim         0.4   3.5   2.02     // exponent on clearance when weighting rays
bias       -0.5   0.5   0.17     // lateral line preference
steer       0.5   4.2   0.95     // steering gain on aim error
yawDamp     0     0.7   0.19     // yaw-rate damping
vClear      0.12  1.3   0.88     // target speed per metre of clearance
brake       0.1   2.2   1.56
holdSlide   0     1     0.00     // throttle held while sliding — he chose none
focus       0     4     0.38     // how much peripheral rays count
hbAim       0.15  0.9   0.78     // turn needed before a handbrake yank
bailMargin  0.5   2.0   0.64     // multiplier on braking distance
bailSpeed   4     18    4.04
boredom     0     3     0.66
thinkTrust  0     1     0.45
thinkNerve  0.5   6     1.38
lineBold    0     1     0.46
badVibes    0.4   4     0.89     // note the floor

// fixed
K_ctrSteer 0.587   K_slipWant 0.118   K_vTop 16.88   K_throttle 0.860
K_gaze 1.403       K_hbSpeed 11.36    K_hbHold 0.35  K_hbCatch 0.60
K_hbGate 0.133     K_jSpeed 6.0       K_jLock 1.0    K_jHold 0.05
K_jExit 2.6        K_jCatch 0.80      K_bailLock 1.0 K_bailTurn 1.22
K_bailOut 0.451    K_patience 40      K_grudge 420
K_gapRange 28.1    K_gapNerve 1.3     K_gapHold 1.03 K_gapSeek 0.105
K_gapPicky 2.1     K_gapExit 1.06     K_thinkAhead 1.82  K_thinkWide 0.303
```

Interesting that he evolved *narrow* long-range vision (45° cone, 51 m) with low
`focus`, halved the steering gain and doubled the braking, and set `holdSlide` to
zero. That is a smooth, committed driver, not a lairy one.

---

## 9. The traps, in order of how much time they cost

1. **A reward that can be farmed at walking pace.** Any bonus added to the score as
   an absolute term gets harvested by a car that pootles. Style must **multiply**
   pace, never add to it. I hit this three separate times — handbrake flair, gap
   threading, and slip — and patched the first two at the trigger before finally
   fixing the cause. Symptom: score climbs while speed collapses.
2. **Spiky rewards are unlearnable.** A single spectacular event worth a whole
   window turns the objective into a lottery; the benchmark thrashes and nothing is
   learned. Cap per-event credit so consistency is required. Symptom: rescue/reset
   machinery firing constantly, pace flat.
3. **Speed-based stuck detection** (§6.4).
4. **Minimum-over-a-cone clearance** (§5.3).
5. **Positional gene indices.** Inserting a gene mid-array silently shifted every
   index after it, handing one subsystem another's parameter. Use a name→index map
   (`GI[name]`) and add an audit that checks every index referenced in code against
   the table length. I then compounded this by "restoring" genes that had been
   deliberately promoted to constants — check what the code actually reads before
   concluding a table is corrupt.
6. **Geometry buried inside other geometry.** Painter's ordering can hide a part
   that's *behind* another; nothing can hide a part *inside* another — it just
   paints on top. Make every piece genuinely protrude from the one beneath.
7. **Unseeded comparisons.** Run-to-run variance in this system is larger than most
   effects being measured. I twice drew a confident conclusion from noise. Seed the
   RNG and compare like-for-like, ideally across 4+ seeds.

---

## 10. Porting checklist

1. Implement `solid / probe / sdfAt / sdfNormal` for your world. Build the distance
   field if your geometry is tiles or voxels.
2. Drop in `stepPhysics` and `collide` unchanged. Verify with open-loop tests before
   attaching any driver:
   - turn-in at 40 mph, no throttle → ~3° slip
   - same with handbrake → ~20° slip, ~107°/s yaw
   - reverse at 13 mph, full lock, lifted → ~150° in under 2 s
   - 10° glance off a wall at 35 mph → keeps ~100% of speed
3. Drop in the reactive driver with the §8 values. Check mean clearance readings look
   like the actual free space — if they're a quarter of it, you have the cone bug.
4. Add manoeuvres one at a time, each with its gate. Measure wedge episodes per hour
   (§6.4 metric) before and after; it should be near zero.
5. Only then consider the planner, and read §7 first.

If the car feels glued, suspect collision normals. If it feels timid, suspect the
clearance measurement. If it stops moving and the score is fine, suspect a farmable
reward. Those three cover most of what went wrong here.
