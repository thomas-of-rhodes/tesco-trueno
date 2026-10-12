/* Tesco Trueno - 08-driver-routing.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ============================================== the reactive driver §5 =====
   Genome values are the trained set from §8, which was selected on environments it
   had never seen and beat the hand-tuned defaults about 2:1. Not tuned here.     */
const GENE = {
  rays:8, fan:0.79, reach:51.5, aim:2.02, bias:0.17, steer:0.95, yawDamp:0.19,
  vClear:0.88, brake:1.56, holdSlide:0.00, focus:0.38, boredom:0.66, homing:0.90,
  hbAim:0.78, bailMargin:0.64, bailSpeed:4.04
};
const K_ctrSteer = 0.587, K_vTop = 16.88, K_throttle = 0.860;
/* How much tail-out he is willing to carry before §5.4 gathers it up. 0.118 rad
   is 6.8 degrees, which is the trained value and is why he never looks lairy:
   evolution selected for lap time, and a slide is slow.

   Tried as a flair dial and it is the wrong dial. Swept over 10 starts:

     hold 0.00 slip  7deg   sideways on his own 1%   10.4 mph   26 kJ/run
     hold 0.25 slip 11deg   sideways on his own 1%   10.1 mph   28 kJ/run
     hold 0.45 slip 17deg   sideways on his own 1%    8.2 mph   34 kJ/run
     hold 0.70 slip 23deg   sideways on his own 2%    9.1 mph   52 kJ/run

   Willingness was never the constraint - SPEED is. Breaking traction needs
   v^2/r > mu*g, so at the 10 mph he manages between the bays the radius would
   have to be about 2 m, which is tighter than the car can steer at all. He is not
   refusing to slide, he cannot. Natural flair therefore needs open ground and a
   reason to go there: the long aisle, the service road, an empty car park at
   night. That is a routing and scheduling answer, not a tuning one. */
let K_slipWant = 0.118;
const K_gaze = 1.403, K_patience = 40;
const K_hbSpeed = 11.36, K_hbHold = 0.35, K_hbCatch = 0.60, K_hbGate = 0.133;
const K_jSpeed = 6.0, K_jLock = 1.0, K_jHold = 0.05, K_jExit = 2.6, K_jCatch = 0.80;
const K_bailLock = 1.0, K_bailTurn = 1.22, K_bailOut = 0.451;
/* How many consecutive 1.5 s windows of no progress count as wedged rather than
   careful, how blocked the way ahead has to be before the answer is a J-turn
   rather than a shuffle, and how long he has to go without one afterwards so it
   stays a moment rather than a habit. */
/* Swept, 10 starts x 25 s each:

     windows   pace          wedged     damage   flick
        1      9.7 +/- 3.1   28 +/- 7%   84 kJ    101 deg
        2      8.6 +/- 3.2   36 +/- 9%   84 kJ    123 deg

   One, at 12 starts x 35 s. Wedging is 2.4 standard errors better, pace is a
   statistical tie and damage is identical. An earlier, shorter sweep said two -
   it was 25 s runs on a different harness and did not hold up.
   The important part: the J-turn coming down from 31% of his life to about 19%
   is NOT from this threshold. It is from J_RARITY and from letting the shuffle
   hand back early, both of which are kept. Waiting longer to notice he is stuck
   only buys time spent stuck. */
let STUCK_WINDOWS = 1, J_DEADEND = 7.0, J_RARITY = 14.0;
/* How much room ahead counts as 'free, you drive' at the end of a shuffle.
   Swept 4 / 6 / 9 / 14 m: driving 62/53/51/53%, pace 6.9/7.6/7.8/8.3 mph,
   wedged 33/31/31/30%. No clean winner anywhere in that range, so it is not
   tuned on the noise - 9 m is a car length and a half of visible daylight. */
let SHUF_OUT = 9.0;

/* §5.5 staleness. Coarse 12 m cells, time since last visited, fed through the ray
   weights so it can never override obstacle avoidance. Its real job is not
   exploration: without it one seed settled at 1.0 cells per window and 3.1 mph. */
const CELL = 12;
const GW = Math.ceil((X1 + 40) / CELL), GH = Math.ceil((Y1 + 20) / CELL);
let visit = new Float32Array(GW * GH);
let simClock = 0;
function cellIdx(x, y){
  const i = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)));
  const j = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)));
  return j * GW + i;
}
function stampVisit(x, y){ visit[cellIdx(x, y)] = simClock; }
function staleness(x, y){
  const age = simClock - visit[cellIdx(x, y)];
  return Math.max(0, Math.min(1, age / K_patience));
}

function bodySlip(c){ return Math.atan2(-c.vy, Math.max(1, Math.abs(c.vx))); }

/* §5.1 the fan is centred on the velocity vector, not the nose. The negation is
   the sign convention: velocity lies at -slip from the nose. */
function senses(c){
  const gaze = Math.max(-1.3, Math.min(1.3, -K_gaze * bodySlip(c)));
  const n = GENE.rays, out = [];
  for (let i = 0; i < n; i++){
    const local = (n === 1 ? 0 : (i / (n - 1) - 0.5)) * GENE.fan;
    const ang = gaze + local;
    const wa = c.h + ang;
    const dist = wideEyes
      ? corridorProbe(c.x, c.y, Math.cos(wa), Math.sin(wa), GENE.reach, CAR_W * 0.5)
      : probe(c.x, c.y, Math.cos(wa), Math.sin(wa), GENE.reach);
    const px = c.x + Math.cos(wa) * dist * 0.8, py = c.y + Math.sin(wa) * dist * 0.8;
    out.push({ local:local, ang:ang, dist:dist, stale:staleness(px, py) });
  }
  return { gaze:gaze, rays:out };
}

/* §5.3 clearance is read along the line he has CHOSEN, sanity-checked against
   straight ahead. Taking the minimum over the whole cone was the single biggest
   performance bug in the project: in an 11 m corridor a ray 20 deg off axis hits a
   wall 15 m away, so the minimum read 9.4 m where the real figure was 43. */
function chooseFwd(sen, aim){
  let ra = sen.rays[0], rn = sen.rays[0];
  for (const r of sen.rays){
    if (Math.abs(r.ang - aim) < Math.abs(ra.ang - aim)) ra = r;
    if (Math.abs(r.ang) < Math.abs(rn.ang)) rn = r;
  }
  return Math.min(ra.dist, rn.dist);
}
function coneFwd(sen){                     // the bug, kept only to measure against
  let m = Infinity;
  for (const r of sen.rays) if (r.dist < m) m = r.dist;
  return m;
}

/* ======================================================= manoeuvres §6 =====
   Four phased sequences, each with a hard entry gate. The handover is emphatic that
   the gates matter more than the sequences: ungated, the handbrake became his
   default state and cost him two thirds of his pace, and the flick produced 43
   degrees instead of 140. */
const MAN = { mode:'none', phase:'', t:0, cool:0, dir:1, h0:0,
              progT:0, stuckT:0, refX:0, refY:0, hbTicks:0, ticks:0,
              flicks:[], hbTurns:0, jTurns:0, shuffles:0, bails:0 };
function resetMan(c){
  resetMood();
  /* The gap he was committed to is per-run state, like the staleness grid. Left
     standing between runs it carries one seed's decision into the next one. */
  lastGap = null;
  resetRoute();
  MAN.mode = 'none'; MAN.phase = ''; MAN.t = 0; MAN.cool = 0;
  MAN.progT = 0; MAN.stuckT = 0; MAN.refX = c.x; MAN.refY = c.y; MAN.jCool = 0;
  MAN.hbTicks = 0; MAN.ticks = 0; MAN.flicks = [];
  MAN.hbTurns = MAN.jTurns = MAN.shuffles = MAN.bails = 0;
}
function angDiff(a, b){
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
/* §6.1's gate cannot be read off the ray fan. The perception aim carries `gaze`,
   which is -1.403 x body slip, so |aim| only exceeds hbAim once he is already
   sideways by about 13 degrees - while the same gate insists |ar| < 0.133, i.e. that
   he is NOT sliding. Mutually exclusive. The old build read this off its route
   lattice and racing line: how big a direction change the intended path demands,
   independent of how sideways he happens to be.
   This is the cheapest stand-in for that - a bearing to the most inviting stale
   ground, off the §5.5 grid that already exists. It steers nothing; it only tells
   the gates how large a turn is coming. */
/* ============================================================== routing =====
   Everything so far has been local. §5.2 picks a direction from what is in front
   of him this instant, §6 reacts when that goes wrong, and the gap finder chooses
   between openings with no way of preferring one - its score literally asks which
   gap is nearest to where the mean already points, which is circular. None of it
   knows the shape of the place.

   The shape is the point. A car park is not open ground: the bay rows run
   unbroken from X0+4 to X1-5, so you cannot cut from one aisle to the next in the
   middle. You drive to the end of the row. That single fact is what makes routing
   worth having here rather than decorative - the straight line to where he wants
   to be is almost never available, and the old stand-in returned exactly that
   straight line, walls and all.

   So: a lattice of the ways through, and a real path along it. */
const LANES = [];        // the drivable centrelines, in y
const RNODE = [];        // { x, y, e:[edge indices] }
const REDGE = [];        // { a, b, len, ok }
const RSPACING = 16;

/* One-way, by lane: +1 east (towards the store), -1 west, 0 both ways. The bay
   aisles alternate, starting with the prime aisle running east past the doors;
   the access road along the railway stays two-way - it is the way in and out,
   and the lorry's road. The end columns (the 8 m west road and the east end)
   are two-way too, so every bay has a short way in from one end and a short
   way out at the other. Real Riverside is two-way throughout; the sim's aisles
   are tighter than the real ones, so here they are not (Thomas, 2026-10-12). */
function laneFlow(l){
  if (l === LANES.length - 1) return 0;
  return l % 2 === 0 ? 1 : -1;
}
/* The flow of the aisle a point is in. */
function flowAt(y){
  let best = 0, bd = Infinity;
  for (let l = 0; l < LANES.length; l++){
    const d = Math.abs(LANES[l] - y);
    if (d < bd){ bd = d; best = l; }
  }
  return laneFlow(best);
}
function edgeOf(a, b){
  for (const ei of RNODE[a].e){
    const e = REDGE[ei];
    if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
  }
  return null;
}
function buildLattice(){
  LANES.length = 0; RNODE.length = 0; REDGE.length = 0;
  LANES.push(Y0 + WALK_W + PRIME_W + PAISLE / 2);          // the prime aisle
  for (const b of BANDS) LANES.push(b + AISLE_C);          // one per band
  LANES.push(Y1 - ROAD_W / 2);                             // the service road

  /* Along each lane, plus a column at each end of the bay rows - the only two
     places the rows do not block a crossing. */
  const xs = [];
  const x0 = X0 + 4.2, x1 = X1 + 1.5;        // west: the middle of the 8 m road
  const n = Math.max(2, Math.round((x1 - x0) / RSPACING));
  for (let i = 0; i <= n; i++) xs.push(x0 + (x1 - x0) * i / n);

  const idx = [];
  for (let l = 0; l < LANES.length; l++){
    idx.push([]);
    for (let k = 0; k < xs.length; k++){
      idx[l].push(RNODE.length);
      RNODE.push({ x:xs[k], y:LANES[l], e:[] });
    }
  }
  const link = function(a, b){
    const na = RNODE[a], nb = RNODE[b];
    const e = REDGE.length;
    REDGE.push({ a:a, b:b, len:Math.hypot(nb.x - na.x, nb.y - na.y), ok:true });
    na.e.push(e); nb.e.push(e);
  };
  for (let l = 0; l < LANES.length; l++)
    for (let k = 0; k + 1 < xs.length; k++){
      link(idx[l][k], idx[l][k + 1]);           // a is the west end of the edge
      REDGE[REDGE.length - 1].dir = laneFlow(l);
    }
  /* The cross-links, only at the two ends. */
  for (let l = 0; l + 1 < LANES.length; l++){
    link(idx[l][0], idx[l + 1][0]);
    link(idx[l][xs.length - 1], idx[l + 1][xs.length - 1]);
  }
  validateLattice();
}

/* An edge is only real if a car-width body can actually get down it. Asserting
   the geometry instead of measuring it would bake in every assumption I have
   made about this car park, and the last three of those were wrong. */
/* And re-run as the car park changes, because it does. The lattice was built
   once at startup and never revisited, while the thing it is derived from moves
   all day: Trueno shunts trolleys across aisles, the god hand throws them,
   cars park and leave. So a trolley knocked into an aisle severed that lane for
   good, and a trolley knocked back OUT of one never healed it.
   The topology makes that worse than it sounds. The lanes are chains joined only
   at the two ends - the only two columns where the bay rows do not block a
   crossing - so one blockage is survivable (reach it from the other end) and two
   in the same lane isolate everything between them. That is what was happening:
   a middle stretch of the first band aisle was unreachable, every bay nearest to
   it was unroutable, and 58% of arrivals were being discarded because the
   controller asked for a car and the road network said there was no way in.
   Sixty-three edges, so this is cheap enough to simply keep doing. */
function validateLattice(){
  for (const e of REDGE){
    const a = RNODE[e.a], b = RNODE[e.b];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    const d = staticProbe(a.x, a.y, dx / L, dy / L, L, CAR_W * 0.5 * 1.05);
    e.ok = d >= L - 0.6;
  }
}

function nearestNode(x, y){
  let best = -1, bd = Infinity;
  for (let i = 0; i < RNODE.length; i++){
    if (!RNODE[i]) continue;          // a hole here used to kill the whole frame
    const d = Math.hypot(RNODE[i].x - x, RNODE[i].y - y);
    if (d < bd){ bd = d; best = i; }
  }
  return best;
}

/* Dijkstra. Sixty nodes, so the naive scan costs nothing and is easier to trust
   than a heap. */
function routeTo(from, to, obey){
  const dist = new Float64Array(RNODE.length).fill(Infinity);
  const prev = new Int32Array(RNODE.length).fill(-1);
  const done = new Uint8Array(RNODE.length);
  dist[from] = 0;
  for (;;){
    let u = -1, bd = Infinity;
    for (let i = 0; i < RNODE.length; i++)
      if (!done[i] && dist[i] < bd){ bd = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const ei of RNODE[u].e){
      const e = REDGE[ei];
      if (!e.ok) continue;
      if (obey && e.dir && (e.dir > 0 ? u !== e.a : u !== e.b)) continue;
      const v = (e.a === u) ? e.b : e.a;
      const nd = dist[u] + e.len;
      if (nd < dist[v]){ dist[v] = nd; prev[v] = u; }
    }
  }
  if (!isFinite(dist[to])) return null;
  const path = [];
  for (let v = to; v >= 0; v = prev[v]) path.push(v);
  return path.reverse();
}

/* Where is worth going? He is not running errands - he is a boy racer in a car
   park - so the objective is somewhere he has not been lately and where there is
   room to enjoy himself, discounted by how far it is. Staleness is §5.5's grid,
   already there for exactly this kind of question. */
/* The stand-in this replaced, kept so the replacement can be measured against
   it rather than against nothing. */
function staleAim(c){
  let bx = 0, by = 0, best = -1;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++){
    const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
    if (cx < X0 + 3 || cx > X1 - 3 || cy < Y0 + 3 || cy > Y1 - 3) continue;
    const d = Math.hypot(cx - c.x, cy - c.y);
    if (d < CELL) continue;
    const sc = staleness(cx, cy) / (1 + d / 70);
    if (sc > best){ best = sc; bx = cx; by = cy; }
  }
  if (best < 0) return 0;
  return angDiff(Math.atan2(by - c.y, bx - c.x), c.h);
}
const ROUTE = { path:null, at:0, goal:-1, since:0, revalid:0 };
function pickGoal(c){
  let best = -1, bs = -1;
  for (let i = 0; i < RNODE.length; i++){
    const n = RNODE[i];
    const d = Math.hypot(n.x - c.x, n.y - c.y);
    if (d < 18) continue;
    const room = Math.min(1, sdfAt(n.x, n.y) / 6);
    const sc = (0.35 + staleness(n.x, n.y)) * (0.3 + room) / (1 + d / 90);
    if (sc > bs){ bs = sc; best = i; }
  }
  return best;
}

function replan(c){
  const from = nearestNode(c.x, c.y);
  const goal = pickGoal(c);
  if (goal < 0){ ROUTE.path = null; return; }
  ROUTE.path = routeTo(from, goal);
  ROUTE.goal = goal; ROUTE.at = 0; ROUTE.since = 0;
}

/* The bearing to the next waypoint, relative to his nose - the same contract the
   staleness stand-in had, so §6 needs no changes. */
function routeAim(c){
  ROUTE.since += DT * 4;
  ROUTE.revalid += DT * 4;
  if (ROUTE.revalid > 2.0){ validateLattice(); ROUTE.revalid = 0; }
  if (!ROUTE.path || ROUTE.since > 12) replan(c);
  if (!ROUTE.path || ROUTE.path.length === 0) return 0;

  /* Advance through waypoints he has reached, and skip the one he is standing on
     so the bearing is always to somewhere he is not. */
  while (ROUTE.at < ROUTE.path.length){
    const n = RNODE[ROUTE.path[ROUTE.at]];
    if (Math.hypot(n.x - c.x, n.y - c.y) > 9) break;
    ROUTE.at++;
  }
  if (ROUTE.at >= ROUTE.path.length){ replan(c); if (!ROUTE.path) return 0; }
  const w = RNODE[ROUTE.path[Math.min(ROUTE.at, ROUTE.path.length - 1)]];
  ROUTE.wx = w.x; ROUTE.wy = w.y;
  return angDiff(Math.atan2(w.y - c.y, w.x - c.x), c.h);
}
function resetRoute(){
  ROUTE.path = null; ROUTE.at = 0; ROUTE.goal = -1;
  ROUTE.since = 99; ROUTE.revalid = 99;
}

/* Where is there actually room? A blind reverse-then-floor-it puts him somewhere
   worse about as often as somewhere better, which is why adding the escapes made the
   wedge rate go up rather than down. Both halves of the shuffle now aim at measured
   space instead of a fixed lock. */
function clearestSteer(c, backwards){
  let best = 0, bestD = -1;
  for (let k = -3; k <= 3; k++){
    const off = (k / 3) * 0.9;
    const a = c.h + (backwards ? Math.PI : 0) + off;
    const d = probe(c.x, c.y, Math.cos(a), Math.sin(a), 26);
    if (d > bestD){ bestD = d; best = off; }
  }
  return Math.max(-1, Math.min(1, best / 0.62));
}
function lateralRoom(c){
  const l = probe(c.x, c.y, -Math.sin(c.h), Math.cos(c.h), 12);
  const r = probe(c.x, c.y, Math.sin(c.h), -Math.cos(c.h), 12);
  return Math.max(l, r);
}
/* Room straight ahead, for deciding when a recovery is over. Cheap: one probe. */
function fwdNow(c){
  return corridorProbe(c.x, c.y, Math.cos(c.h), Math.sin(c.h), 30, CAR_W * 0.5);
}
function rearRoom(c){
  return probe(c.x, c.y, -Math.cos(c.h), -Math.sin(c.h), 30);
}

/* §5.1 centres the fan on the velocity vector - but bodySlip takes |vx|, so the fan
   can never swing behind the car however hard he is reversing. That left every
   reversing manoeuvre running nearly blind: the J-turn wind-up on one straight-back
   probe for up to 3.5 s, and the shuffle on a seven-direction sample taken ONCE at
   entry and then frozen for the whole 1.4 s reverse. Open loop, in other words,
   through exactly the ground he has just decided he cannot drive forwards through.
   So: a live fan out of the back. Wider than the front one (100° against 45°) and
   shorter, because reversing is about not hitting anything rather than about
   picking a line, and a wide arc is what tells him whether the thing he is about
   to back into is off to one side. */
const REAR_N = 7, REAR_FAN = 1.75, REAR_REACH = 26;
function rearSense(c){
  const out = [];
  let minD = Infinity, best = 0, bestD = -1;
  for (let i = 0; i < REAR_N; i++){
    const local = (i / (REAR_N - 1) - 0.5) * REAR_FAN;
    const wa = c.h + Math.PI + local;
    const d = probe(c.x, c.y, Math.cos(wa), Math.sin(wa), REAR_REACH);
    out.push({ ang:Math.PI + local, dist:d });
    if (d < minD) minD = d;
    if (d > bestD){ bestD = d; best = local; }
  }
  /* Steering in reverse is mirrored: to send the TAIL left you turn the wheel
     right, so the bearing he wants has its sign flipped on the way to the wheel. */
  return { rays:out, min:minD, best:best,
           steer:Math.max(-1, Math.min(1, -best / 0.62)),
           straight:out[(REAR_N - 1) / 2].dist };
}

/* §6.4 Stuck is lack of progress, never low speed. Leaning on something with the
   throttle on, the collision push-out jiggles the car enough to reset a speed-based
   timer every few frames, so it never accumulates and never triggers an escape. */
function trackProgress(c, dt){
  MAN.progT += dt;
  if (MAN.progT >= 1.5){
    const moved = Math.hypot(c.x - MAN.refX, c.y - MAN.refY);
    MAN.stuckT = moved < 2.2 ? MAN.stuckT + 1.5 : 0;
    MAN.refX = c.x; MAN.refY = c.y; MAN.progT = 0;
  }
}

function runManoeuvre(c, ctl, aim, excess, dt){
  MAN.t += dt;
  const spd = Math.abs(c.vx);

  if (MAN.mode === 'hb'){
    if (MAN.t < K_hbHold){
      ctl.hb = 1; ctl.thr = 0; ctl.brk = 0; ctl.rev = 0;
      ctl.steer = MAN.dir;                        // full lock into the corner
    } else {
      ctl.hb = 0; ctl.thr = K_hbCatch; ctl.brk = 0;
      ctl.steer = Math.max(-1, Math.min(1, GENE.steer * aim
                  - GENE.yawDamp * c.r + K_ctrSteer * excess));
      if (MAN.t > K_hbHold + K_hbCatch){
        MAN.mode = 'none'; MAN.cool = K_hbHold + 1.5;   // cannot become his default
      }
    }
    return;
  }

  if (MAN.mode === 'jturn'){
    if (MAN.phase === 'back'){
      ctl.rev = 1; ctl.thr = 0; ctl.brk = 0; ctl.hb = 0;
      /* §6.2 wants the wheel dead straight through the wind-up or the flick does
         not come round, so the rear fan is not allowed to steer here - it is only
         allowed to stop him. */
      ctl.steer = Math.max(-1, Math.min(1, -0.3 * c.r));   // wheel dead straight
      const back = -c.vx, rs = rearSense(c);
      MAN.rear = rs;
      const room = rs.straight;
      if (back >= K_jSpeed || (room < 5 && back > 4.5) ||
          (rs.min < 2.2 && back > 3.0)){
        MAN.phase = 'flick'; MAN.t = 0; MAN.h0 = c.h;
      } else if (rs.min < 1.3){
        /* Something close off to the side that the straight-back probe cannot see.
           Abandon the wind-up rather than reverse into it. */
        MAN.mode = 'shuffle'; MAN.t = 0;
        MAN.back = rs.steer; MAN.out = clearestSteer(c, false);
      } else if (MAN.t > 3.5){
        MAN.mode = 'shuffle'; MAN.t = 0;
        MAN.back = clearestSteer(c, true); MAN.out = clearestSteer(c, false);
      }
      return;
    }
    if (MAN.phase === 'flick'){
      /* Lift off. Holding reverse power fights the rotation: 149 degrees lifted
         against 65 held. Evolution never found this because until the entry gate
         was right the flick barely ran and the gene was under no pressure. */
      ctl.rev = 0; ctl.thr = K_jHold; ctl.brk = 0; ctl.hb = 0;
      ctl.steer = MAN.dir * K_jLock;
      const rot = Math.abs(angDiff(c.h, MAN.h0));
      if (rot > K_jExit || MAN.t > 3){
        MAN.flicks.push(rot * DEG);
        MAN.phase = 'catch'; MAN.t = 0;
      }
      return;
    }
    ctl.rev = 0; ctl.thr = K_jCatch; ctl.brk = 0; ctl.hb = 0;
    ctl.steer = Math.max(-1, Math.min(1, -GENE.yawDamp * 2 * c.r + K_ctrSteer * excess));
    /* A long cooldown after one, so it reads as an event. Two J-turns inside a
       few seconds looks like a car malfunctioning, not a car showing off. */
    if (MAN.t > 1.2 || c.vx > 4){
      MAN.mode = 'none'; MAN.cool = 2;
      /* Rarity is about not doing ANOTHER J-TURN soon, not about not escaping.
         Putting it on MAN.cool locked out every manoeuvre for fourteen seconds,
         shuffles included, so when he got wedged straight after a J-turn he had
         to sit there and wait it out - and the suite's wedge rate went from 29%
         to 40% on the strength of it. */
      MAN.jCool = J_RARITY;
    }
    return;
  }

  /* No room to wind up: reverse OFF whatever he is leaning on first. Driving
     forward is exactly wrong when he is nose-first into something. */
  if (MAN.mode === 'shuffle'){
    if (MAN.t < 1.4){
      ctl.rev = 1; ctl.thr = 0; ctl.brk = 0; ctl.hb = 0;
      /* Live, not the frozen bearing it used to hold for the whole reverse. */
      const rs = rearSense(c);
      MAN.rear = rs;
      ctl.steer = rs.steer;
      if (rs.min < 1.1) MAN.t = 1.4;        // out of room: stop backing, drive out
    } else {
      /* The exit, and this is where the flair is supposed to come from.

         It used to hold 0.65 throttle on a FIXED bearing for a fixed 3 seconds.
         Both halves of that are wrong. A fixed bearing means §5.4's counter-steer
         is switched off, so if the rear steps out nothing catches it - which
         means it must never be allowed to step out, which means no slide, which
         means the only way to get any flair into a recovery was to script one.
         That is what the J-turn was for, and why it ended up running a third of
         the time.
         So: give it everything, keep the counter-steer live, and hand back to the
         real driver the moment he is rolling with room ahead - WHILE he is still
         sideways. The catch is then his, not a scripted phase, and it comes out
         different every time because it depends on grip, angle and speed rather
         than on a clock. */
      ctl.rev = 0; ctl.thr = 1; ctl.brk = 0; ctl.hb = 0;
      ctl.steer = Math.max(-1, Math.min(1,
        MAN.out - GENE.yawDamp * c.r + K_ctrSteer * excess));
      const rolling = Math.hypot(c.vx, c.vy) > 2.6;
      if ((rolling && fwdNow(c) > SHUF_OUT) || MAN.t > 3.0){
        MAN.mode = 'none'; MAN.cool = 0.8;
      }
    }
    return;
  }

  if (MAN.mode === 'bail'){
    ctl.hb = 1; ctl.rev = 0; ctl.thr = 0; ctl.brk = K_bailOut;
    ctl.steer = MAN.dir * K_bailLock;
    if (MAN.t > K_bailTurn || spd < 1.2){ MAN.mode = 'none'; MAN.cool = 1.5; }
    return;
  }
}

let manEnabled = true;
function tryEnter(c, aim, fwd, err){
  if (!manEnabled) return false;
  const spd = Math.abs(c.vx);
  if (MAN.cool > 0) return false;
  const rAim = MAN.rAim || 0;         // computed once in drive()

  /* §6.4 escape takes priority over everything.

     STUCK_WINDOWS was 1, and that was much too twitchy. §6.4 fixes how stuckT
     accumulates - one 1.5 s window with under 2.2 m of progress - but the level
     it fires at was my choice, and 2.2 m in 1.5 s is 3.3 mph. In a car park he
     crosses at 9 mph, dropping under 3.3 for a second and a half is what turning
     a corner LOOKS like. So the escape was firing on ordinary careful driving.

     Measured before this: 43% of his life inside a scripted manoeuvre, 31% of it
     in J-turns. A J-turn is meant to be the flourish on an error recovery, and a
     flourish that happens a third of the time is not a flourish, it is a tic -
     and it is his actual driving that gets displaced by it. Three consecutive
     dead windows is being genuinely wedged; one is being careful. */
  if (MAN.stuckT >= 1.5 * STUCK_WINDOWS){
    MAN.stuckT = 0; MAN.t = 0;
    /* Which way to swing, and it must be toward SPACE, not toward the
       destination. Using the route bearing here tripled the damage: when he is
       wedged, the goal is on the far side of whatever he is wedged against, so
       aiming the escape at it drives him further into it. The route decides
       where he goes; it has no business deciding which way he thrashes. */
    MAN.dir = (clearestSteer(c, false) >= 0 ? 1 : -1);
    /* Which escape, and this is a question about what KIND of stuck he is, not
       simply whether there is room behind him. Nose into something with space at
       his back is a shuffle: reverse off it and drive away. A J-turn is for the
       other case - a dead end ahead and a long clear run behind, where what he
       actually needs is to be facing the other way, at speed. The old gate only
       asked about the room behind, which is true in nearly every aisle here, so
       the flourish won almost every time.
       §6.2 needs about v^2/2a to wind up plus a car length to swing through, and
       the swing needs somewhere to go sideways or the flick grinds into whatever
       is beside him and the rotation is damped away. */
    const rs = rearSense(c);
    /* J_DEADEND turned out to be dead weight - measured at 7 m, 12 m and off, the
       three came out identical, because by the time he is genuinely stuck there
       is always something in front of him. Kept as documentation of that. */
    const deadEnd = fwd < J_DEADEND;
    if (deadEnd && MAN.jCool <= 0 && rs.straight > 16 && rs.min > 2.5 &&
        lateralRoom(c) > 5.5){
      MAN.mode = 'jturn'; MAN.phase = 'back'; MAN.jTurns++;
    } else {
      MAN.mode = 'shuffle'; MAN.shuffles++;
      MAN.back = clearestSteer(c, true);
      MAN.out = clearestSteer(c, false);
    }
    return true;
  }

  /* §6.3 Braking distance goes with the SQUARE of speed. A fixed seconds-of-
     clearance trigger fires far too readily when slow and far too late when quick. */
  if (spd > GENE.bailSpeed && fwd < (c.vx * c.vx / 23.6) * GENE.bailMargin){
    MAN.mode = 'bail'; MAN.t = 0; MAN.bails++;
    MAN.dir = (clearestSteer(c, false) >= 0 ? 1 : -1);   // space, not the goal
    return true;
  }

  /* §6.1 The err < 0 term is essential: arriving faster than the corner allows.
     Without it he discovered he could sit on the handbrake about 15% of the time,
     which drops him to 4.6 mph, and at that speed the yanks earn nothing either. */
  /* The night gate. I took this out once, believing it had pushed handbrake
     duty to 36.7% - it had not. That figure was the PARKING BRAKE while
     sulking, being counted as handbrake duty, and the real driving figure was
     about 2%. Removing this also removed the only thing that was actually
     producing night flair, so it is back, and modestly: an empty car park at
     3 a.m. is the one place a handbrake turn costs nobody anything. */
  /* And the room to come out of it, which this gate never asked for. Every
     single run down the clear 160 m aisle ended the same way: up to 31 mph dead
     centre, a route corner appears at x=81, the gate sees 'big turn wanted,
     carrying too much speed', and he puts the handbrake on in a six-metre aisle
     with a parked row 1.3 m off each flank. 97 kJ into an Astra, 15 times out of
     15, and the reference test read 13 mph instead of 28 - which looked like a
     pace regression and was actually him writing the car off halfway down.

     The gate was asking whether he WANTS to turn, never whether the turn goes
     anywhere. A handbrake turn is a corner taken at the limit, so the thing to
     check is the exit: car-width clearance along the heading he will be pointing
     at when it is over. If that is a parked Corsa, this is not a corner, it is a
     crash, and §6.3's bail is the right answer instead.

     A straight probe along the exit heading was the first attempt and it passed
     every time: the bay row is only a quarter occupied, so the probe found a GAP
     between two parked cars, declared the corner open, and he slid fourteen
     metres into the next car along. A ray cannot predict where a slide ends.

     So compute it instead. Changing heading by rAim at speed spd needs a turn
     radius of about spd^2 / (mu g), and sweeping through that angle costs

         lateral = R (1 - cos rAim)

     metres of sideways room. At 31 mph and a 45 degree corner that is 5.7 m of
     lateral space, against 3.1 m of aisle - the corner was never available, with
     or without the handbrake, and §6.3's bail is the honest answer.
     The 0.6 is the handbrake's actual worth: yanking it rotates the car faster
     than grip alone would, so he needs less room than the formula says - but a
     factor, not an exemption. §8 trap 1 again: flair multiplies pace, it does
     not substitute for physics. */
  /* MU_S, deliberately, and not the grip he actually has. I changed this to
     muWet on the reasoning that a slide needs more room when grip is lower,
     which is true of the physics and wrong for the car. Tracking wet grip makes
     the gate tighten exactly when it is raining, so he stopped attempting
     handbrake turns in the wet at all: tail-out measured 38 degrees wet against
     50 to 78 dry, which inverts 'rain makes him slide' - one of the two things
     the weather was built for.
     The gate exists to stop him turning into a parked Corsa in a six-metre
     aisle, not to model the corner. A fixed dry reference does that job and
     leaves the wet behaviour to the tyre model, where it belongs. §8 trap 1
     once more: a safety check is allowed to bound the flair, never to replace
     the thing that produces it. */
  const hbR = (spd * spd) / (MU_S * 9.81);
  const hbNeed = hbR * (1 - Math.cos(Math.min(1.2, Math.abs(rAim)))) * 0.6 + HALF_W;
  const exitOK = sdfSense(c.x, c.y) > hbNeed;
  if (err < 0 && exitOK &&
      Math.abs(rAim) > GENE.hbAim * (1 - 0.30 * (MOOD.shine || 0)) &&
      spd > K_hbSpeed * (1 - 0.15 * (MOOD.shine || 0)) &&
      Math.abs(c.ar) < K_hbGate){
    MAN.mode = 'hb'; MAN.t = 0; MAN.hbTurns++;
    /* The one place the route SHOULD decide the direction: this is a corner, not
       an escape. The gate above is 'the route wants a big turn and I am carrying
       too much speed for it', so the turn is toward the route by definition. */
    MAN.dir = (rAim >= 0 ? 1 : -1);
    return true;
  }
  return false;
}

/* A ray is a line of zero width, and that is the wrong question. The right one is
   "how far can a car-WIDTH body travel along this heading before it touches
   something", and an exact distance field answers it directly: march along the
   heading and stop when the field drops below the body half-width. Sphere tracing already
   works this way; it just needs the radius adding.

   This matters more than it sounds. The gap scan has 21 rays over 100 degrees, so
   at 20 m the rays are 1.75 m apart and a 0.5 m lamp post falls BETWEEN them about
   seventy percent of the time. He was not failing to thread gaps, he could not see
   what he was threading. A corridor probe cannot miss the post, because the field
   knows the post is there even when no ray hits it. */
function corridorProbe(x, y, dx, dy, len, halfW){
  let t = 0;
  /* The step floor matters for cost, not correctness. Sphere tracing against a
     corridor converges slowly when the walls are only just wider than the car -
     d minus halfW goes to nearly nothing and it inches forward. A 0.06 m floor
     made the test suite four times slower; 0.3 m costs at most 0.3 m of
     overstatement at the stopping point and is invisible in the behaviour. */
  for (let i = 0; i < 64 && t < len; i++){
    const d = sdfSense(x + dx * t, y + dy * t);
    if (d < halfW) return t;
    t += Math.max(d - halfW, 0.3);
  }
  return Math.min(t, len);
}

/* ========================================================= the gap finder ===
   §8 hands over six tuned constants for this and §7 mentions "the gap-finder's
   exit check" in passing, but the algorithm itself was never written down. What
   follows is built from the constants, their values, and a measurement.

   The measurement first, because it says what is actually wrong. §5.2 picks a
   direction by taking a WEIGHTED MEAN of the ray angles. That is a potential
   field, and potential fields have one classic failure: given clear air to the
   left, clear air to the right and a lamp post between them, the mean points at
   the lamp post. Measured over 6000 driver ticks on the real site:

     aiming somewhere with under 70% of the best available clearance   29.3%
     mean (clearance along his aim) / (best ray)                        0.78
     ticks aimed at something closer than 6 m                          22.2%

   So nearly a third of the time he is steering at the obstacle between two gaps.
   That is where the damage comes from, and no amount of tuning the mean fixes it,
   because the mean is the bug. The fix is to stop averaging and start CHOOSING.

   Its own scan, not the driving fan. GENE.rays is 8 over 45 degrees - 5.6 degrees
   a ray - which is too coarse to resolve a 7 m gate at 25 m. This one is 21 rays
   over 100 degrees out to K_gapRange, which is 4.8 degrees and wide enough to see
   a gap he is not already pointing at. */
const K_gapRange = 28.1, K_gapNerve = 1.3, K_gapHold = 1.03;
const K_gapSeek = 0.105, K_gapPicky = 2.1, K_gapExit = 1.06;
const GAP_N = 21, GAP_FAN = 1.75;
const CAR_W = HALF_W * 2, CAR_L = LF + LR;
let lastGap = null;          // which gap he committed to, for the hysteresis
/* THE VERDICT, revised once routing existed.

   Measured on its own, before there was any destination, it was a wash - the
   same finding §7 reached about the ghost planner. The reason was written into
   its own scoring: the alignment term asked which gap lay nearest to where the
   MEAN was already pointing, which is circular. "The better gap" is not a
   well-posed question for a car with nowhere to be.

   With the lattice supplying a route bearing to score against, 25 starts x 30 s:

                       off               on                se
       pace        8.5 +/- 3.1       10.2 +/- 3.9        1.7
       wedged %   28.7 +/- 7.7       26.2 +/- 8.7       -1.1
       damage kJ  59.3 +/- 49.0      55.2 +/- 41.7      -0.3

   1.7 se is short of significance and I am not going to call it significant. But
   the direction is the same in an independent 14-start sample (1.2 se), every
   sign is favourable, and the cost side is nothing. On for that reason, and
   because the circularity that explained the earlier null result is gone. */
let gapEnabled = true;
/* Whether §5.1's fan asks "how far to the first surface along this line" or the
   better question, "how far can a car-width body actually get". The genome was
   trained on the former, so this was measured rather than assumed, and it is the
   single biggest improvement in this session:

       25 starts x 20 s      point rays        corridor probe      se
       damage kJ            83.7 +/- 57.3     36.6 +/- 46.8      -3.2
       runs over 100 kJ      9 of 25           3 of 25
       pace mph             10.0 +/- 3.3       8.8 +/- 3.2       -1.3

   Damage more than halved. He is a little slower, which is correct and not a
   regression: he is now braking for things that were previously invisible to
   him. §5.3 sets speed from clearance, and clearance measured by a zero-width
   ray through a car park full of 0.2 m bollards is a lie. */
let wideEyes = true;
/* 'lattice' is the real thing; 'stale' is the crude stand-in it replaced - the
   bearing to the stalest distant grid cell, straight line, walls and all; 'none'
   is no bearing at all. Three ways, because comparing the lattice against NOTHING
   would have flattered it by also removing the stand-in, and for a while that is
   exactly what I was measuring. */
let routeMode = 'lattice';

function scanGaps(c, gaze, aim0){
  const d = [], ang = [], live = [];
  for (let i = 0; i < GAP_N; i++){
    const a = gaze + (i / (GAP_N - 1) - 0.5) * GAP_FAN;
    const wa = c.h + a;
    ang.push(a);
    d.push(corridorProbe(c.x, c.y, Math.cos(wa), Math.sin(wa), K_gapRange, CAR_W * 0.5));
    live.push(true);
  }

  /* The first version called a ray "open" if it had a car's length of room, then
     took runs of open rays as gaps. Measured, that left the fan as ONE unbroken
     run 88% of the time: a lamp post five metres away still counts as open
     ground by that test, so the post never split anything and the gap finder
     spent seven ticks in eight agreeing with the mean it was meant to correct.

     What actually matters is not whether a ray is long enough in the abstract, it
     is whether the NEAREST hazard leaves room to pass. So: find the closest thing
     in the fan, blank out the angular wedge it occupies - half-width = the angle
     a car's half-width plus a margin subtends at that range - and repeat. Three
     bubbles covers a post, a trolley and a wing mirror. What survives is the set
     of directions that are genuinely passable, and a post between two openings
     now splits them instead of hiding inside one. */
  const need = CAR_W * 0.5 * K_gapNerve;
  for (let pass = 0; pass < 3; pass++){
    let k = -1, dm = Infinity;
    for (let i = 0; i < GAP_N; i++)
      if (live[i] && d[i] < dm){ dm = d[i]; k = i; }
    if (k < 0 || dm >= K_gapRange - 0.1) break;
    const half = Math.atan2(need, Math.max(0.6, dm));
    for (let i = 0; i < GAP_N; i++)
      if (Math.abs(ang[i] - ang[k]) <= half) live[i] = false;
  }

  const gaps = [];
  let i2 = 0;
  while (i2 < GAP_N){
    if (!live[i2]){ i2++; continue; }
    let j = i2;
    while (j + 1 < GAP_N && live[j + 1]) j++;

    let mouth = Infinity, deepest = 0;
    for (let k = i2; k <= j; k++){
      if (d[k] < mouth) mouth = d[k];
      if (d[k] > deepest) deepest = d[k];
    }
    const halfAng = (ang[j] - ang[i2]) / 2 + (GAP_FAN / (GAP_N - 1)) / 2;
    /* Metric width at the NARROWEST point. Measuring at the deepest point
       flatters every gap, because the far end of a funnel is always wide. */
    const wide = 2 * mouth * Math.sin(Math.max(0.01, halfAng));
    if (wide >= CAR_W * K_gapNerve){
      /* The exit check §7 refers to. A gap he can enter but not leave is a dead
         end, and threading into one is worse than not threading: he arrives
         committed, slow, and facing a wall. Require a car's length of room past
         the narrowest point, along the gap's own centreline. */
      const mid = (ang[i2] + ang[j]) / 2;
      const wa = c.h + mid;
      const through = corridorProbe(c.x, c.y, Math.cos(wa), Math.sin(wa),
                                    K_gapRange, CAR_W * 0.5);
      if (through >= mouth + CAR_L * K_gapExit || through >= K_gapRange - 0.1)
        gaps.push({ a:mid, mouth:mouth, deep:deepest, wide:wide, depth:through });
    }
    i2 = j + 1;
  }
  /* Clearance along the direction the MEAN picked, measured on this same scan so
     the comparison downstream is like for like. Getting this wrong was subtle and
     total: the gate used to compare gap depth against the 51.5 m driving fan, but
     depth is capped at K_gapRange, so whenever the driving fan saw more than 28 m
     the gate could never be satisfied and the gap finder silently switched itself
     off - on exactly the long open runs where a post is most dangerous, because
     he is quickest there. The gauntlet test came out identical to the digit with
     it on and off, which is what gave it away. */
  let nearI = 0;
  for (let k = 1; k < GAP_N; k++)
    if (Math.abs(ang[k] - aim0) < Math.abs(ang[nearI] - aim0)) nearI = k;
  const aimClear = d[nearI];
  if (!gaps.length){ lastGap = null; return null; }

  /* Score: how far it goes, how little it costs to turn to it, how generous it
     is. The depth exponent mirrors GENE.aim (2.02) because it is the same
     judgement - distance is worth more than proportionally. */
  let best = null, bestS = -1;
  for (const g of gaps){
    /* aim0 was the MEAN's own aim, which made this circular - it preferred the
       gap nearest to where he was already pointing. With a route there is
       something outside the loop to prefer. */
    const want = (routeMode !== 'none') ? MAN.rAim : aim0;
    let sc = Math.pow(g.depth / K_gapRange, K_gapPicky) *
             (0.5 + 0.5 * Math.cos(g.a - want)) *
             Math.min(1.7, g.wide / (CAR_W * K_gapNerve));
    /* Hysteresis. Two gaps of near-equal merit either side of a post will
       otherwise swap every tick and he drives into the post between them - the
       very failure this exists to fix, reintroduced as indecision. */
    if (lastGap !== null && Math.abs(g.a - lastGap) < 0.32) sc *= K_gapHold;
    if (sc > bestS){ bestS = sc; best = g; }
  }
  lastGap = best ? best.a : null;
  if (best) best.aimClear = aimClear;
  return best;
}

function drive(c, ctl){
  const sen = senses(c);

  /* Where the route says to go, once per tick - §6 reads the same value rather
     than asking again, or the route clock advances twice a tick. */
  const rAim = routeMode === 'lattice' ? routeAim(c)
             : routeMode === 'stale'   ? staleAim(c) : 0;
  MAN.rAim = rAim;

  /* §5.2 weighted mean of the ray directions, now with a term for where he is
     actually trying to get to. It is a WEIGHT, not an override: a ray pointing
     at the waypoint is worth more, but a blocked ray still has almost no weight
     because dist^aim collapses, so intent can never talk him into a wall. That
     is the same shape as the boredom term §5.5 adds, and for the same reason. */
  let wsum = 0, asum = 0;
  for (const r of sen.rays){
    const centred = Math.pow(0.5 + 0.5 * Math.cos(r.local), GENE.focus);
    const home = routeMode === 'none'
      ? 1 : (1 + GENE.homing * Math.max(0, Math.cos(r.ang - rAim)));
    const w = Math.pow(r.dist / GENE.reach, GENE.aim) * centred *
              (1 + GENE.boredom * r.stale) * home;
    wsum += w; asum += w * r.ang;
  }
  let aim = (wsum > 1e-9 ? asum / wsum : 0) + GENE.bias * GENE.fan * 0.5;

  /* The gap finder arbitrates: it does not replace §5.2, it overrules it when the
     mean is pointing at something. Leaving the mean in charge on open ground
     matters - the genome was selected with it, and it is a smooth, committed
     driver. The gap finder is for the moment the smooth thing would hit a post. */
  const aimD = chooseFwd(sen, aim);
  const gap = gapEnabled ? scanGaps(c, sen.gaze, aim) : null;
  /* Both sides measured on the SAME scan, at the same range: how far he gets
     along the line the mean chose, against how far he gets through the best gap.
     He only turns if the gap is meaningfully better. */
  if (gap && gap.depth > gap.aimClear * K_gapHold){
    /* Blend rather than snap, or the steering rings. But blend FASTER the closer
       the thing he is currently aimed at - 0.105 a tick is a third of a second,
       which is fine at 25 m and far too slow at six. */
    const urgency = 1 + 3 * Math.max(0, 1 - aimD / K_gapRange);
    const rate = Math.min(0.85, K_gapSeek * urgency);
    aim += (gap.a - aim) * rate;
  }

  // §5.3 speed from the clearance he actually chose
  const fwd = chooseFwd(sen, aim);
  /* Off the leash: a higher ceiling and a longer view of the clear ground, so
     the speed he needs to break traction is actually reachable. */
  const sh1 = MOOD.shine || 0;
  const vTarget = Math.min(K_vTop * (1 + 0.30 * sh1),
                           GENE.vClear * (1 + 0.25 * sh1) * fwd);
  const err = vTarget - c.vx;
  ctl.thr = err > 0 ? Math.max(0, Math.min(1, K_throttle * err / 9)) : GENE.holdSlide;
  ctl.brk = err > 0 ? 0 : Math.max(0, Math.min(1, GENE.brake * -err / 9));
  ctl.rev = 0;
  ctl.hb = 0;

  // §5.4 counter-steer on rear slip beyond what he wants to carry
  /* And he stops gathering it up so early. Three times the tail-out at 3 a.m.,
     which on an empty 160 m aisle is a slide rather than a wobble. */
  /* 3.2x tolerance disabled the catch outright and he scrabbled - 6.2 mph at
     night against 9.5 by day, which is backwards. §5.4 is what keeps him
     pointing where he is going; the night dial is allowed to loosen it, not
     switch it off. */
  const slipW = K_slipWant * (1 + 0.7 * sh1);
  const excess = c.ar - Math.max(-slipW, Math.min(slipW, c.ar));
  ctl.steer = Math.max(-1, Math.min(1,
    GENE.steer * aim - GENE.yawDamp * c.r + K_ctrSteer * excess));

  // §6 sits on top: the gates decide, then the sequence overrides the controls
  const dt = DT * 4;                       // the driver runs at 30 Hz
  MAN.cool = Math.max(0, MAN.cool - dt);
  MAN.jCool = Math.max(0, (MAN.jCool || 0) - dt);
  trackProgress(c, dt);
  if (MAN.mode === 'none') tryEnter(c, aim, fwd, err);
  if (MAN.mode !== 'none') runManoeuvre(c, ctl, aim, excess, dt);
  /* Mood, then the sulk, then the swerve. Order matters: sulking overrides the
     driving, and the swerve overrides everything including the sulk - he is
     still not allowed to hit anyone on his way to go and be unhappy. */
  stepMood(c, dt, !!c.dodging);
  if (MOOD.sulk){
    if (driveSulk(c, ctl)){ MAN.mode = 'none'; MAN.phase = ''; }
  }
  swerve(c, ctl);
  /* The parking brake while sulking is not 'handbrake duty'. Counting it read
     40.7% and looked exactly like §6.1 failing, when it was a car parked in a
     bay with the brake on, which is what parking is. */
  MAN.ticks++; if (ctl.hb > 0 && !MOOD.sulk) MAN.hbTicks++;

  /* Kept for the overlay whether or not a manoeuvre is running, so 'rays' shows
     what he can see behind him at all times. */
  const rear = rearSense(c);
  c.dbg = { aim:aim, fwd:fwd, cone:coneFwd(sen), vTarget:vTarget, sen:sen, rear:rear,
            gap:gap, aimD:aimD,
            mode:MAN.mode + (MAN.phase ? '/' + MAN.phase : ''),
            rAim:MAN.rAim || 0,
            stuckT:MAN.stuckT };
}
