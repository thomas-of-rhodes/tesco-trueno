/* Tesco Trueno - 09-scenery-water.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ================================================================ render ===
   The whole site, drawn the way site-plan.html draws it, so he is visibly driving
   in the place we measured rather than on an abstract rectangle. Only things that
   stand at car height are physics obstacles; the roofs here are scenery he passes
   underneath.                                                                   */
const BH = 2, MH = 1.4;                  // buildings x2, masts x1.4, as in the plan

/* ------------------------------------------------------ the lamps, one by one ---
   Nine masts that used to switch on together, at one global brightness, because
   they shared `nightK` and nothing else. Real ones do not. Each has its own
   photocell with its own idea of how dark is dark, so they trip minutes apart;
   each is a sodium lamp, so it does not come on so much as warm up, going
   through a dim orange stage on the way; and in any car park of this size one or
   two are on the way out and dip.

   Deterministic personalities, from a fixed seed. That matters more than it
   sounds: the two dodgy ones should be the SAME two every time you load the
   page, because a flickering lamp is a fact about that lamp - "the one by the
   trolley bay has been like that for months" - and one that moved about would
   just read as noise.

   `trip` is a nightK threshold rather than a clock time, which gets the
   staggering for free: dusk takes about an hour of simulated time to run
   nightK from 0 to 1, so thresholds spread over 0.08 to 0.30 put several
   minutes between the first lamp and the last. */
const LAMP = (function(){
  let sd = 20251008;
  const rnd = function(){ sd = (sd * 1103515245 + 12345) & 0x7fffffff;
    return sd / 0x7fffffff; };
  const out = [];
  for (let i = 0; i < MASTS.length; i++){
    out.push({
      trip: 0.08 + rnd() * 0.22,
      /* Two to seven simulated minutes to full output, which at this clock is
         three to six seconds of watching. */
      warm: 120 + rnd() * 300,
      k: 0, dip: 1, dipWant: 1, dipT: 20 + rnd() * 120,
      dodgy: false
    });
  }
  /* Two of the nine, picked once and never again. */
  for (let n = 0; n < 2; n++){
    let j = Math.floor(rnd() * out.length);
    for (let g = 0; g < out.length && out[j].dodgy; g++) j = (j + 1) % out.length;
    out[j].dodgy = true;
  }
  return out;
})();

function lampBright(i){
  const L = LAMP[i];
  return L ? L.k * L.dip : 1;
}

/* Skipping two hours forward should not leave you sitting in the dark for
   three minutes while nine lamps strike. The warm-up is a property of the lamp,
   not of the viewer, so when the CLOCK jumps the lamps jump with it: straight to
   wherever they would have settled. The variability survives, because that lives
   in `trip` (which still decides whether this lamp is on at this light level)
   and in `dip` (which is left strictly alone, so the two bad ones carry on
   breathing through the jump). */
function settleLamps(){
  const nightK = 1 - daylight();
  for (const L of LAMP) L.k = nightK > L.trip ? 1 : 0;
}

function stepLamps(dt){
  const nightK = 1 - daylight();
  for (const L of LAMP){
    if (nightK > L.trip) L.k = Math.min(1, L.k + dt / L.warm);
    /* Off is quicker than on. A sodium lamp cut at dawn goes out in seconds;
       it is only the striking that is slow. */
    else L.k = Math.max(0, L.k - dt / 8);
    if (L.dodgy && L.k > 0.15){
      L.dipT -= dt;
      if (L.dipT <= 0){
        if (L.dipWant > 0.9){
          /* Into a dip: a couple of seconds to seven, down to between a fifth
             and two thirds. Not off - a lamp that cut out completely would be a
             different and much more dramatic fault. */
          L.dipWant = 0.2 + RND.scenery() * 0.45;
          L.dipT = 1.5 + RND.scenery() * 6;
        } else {
          L.dipWant = 1;
          L.dipT = 25 + RND.scenery() * 150;
        }
      }
      L.dip += (L.dipWant - L.dip) * Math.min(1, dt * 1.3);
    } else {
      L.dip += (1 - L.dip) * Math.min(1, dt * 1.3);
    }
  }
}
const GND = {
  tar:[43,49,55], grass:[46,68,44], ballast:[64,58,50], road:[40,40,43],
  water:[42,66,78], scrub:[40,62,42], waste:[74,70,58], lane:[38,44,49],
  fore:[126,128,124], walk:[62,66,68], island:[88,92,94]
};
/* The night ground, lifted from site-plan.html where it was a day/night SWITCH.
   Here it is a blend against daylight(), so dusk actually falls over a couple of
   minutes instead of happening between two frames. */
const GND_NIGHT = {
  tar:[22,26,30], grass:[18,28,19], ballast:[28,26,23], road:[20,20,22],
  water:[13,20,26], scrub:[16,25,17], waste:[30,29,25], lane:[19,23,26],
  fore:[64,66,63], walk:[30,33,35], island:[42,45,47]
};
const AREAS = [
  { k:'water',   x0:-20, x1:340, y0:-104, y1:-32 },
  { k:'road',    x0:-20, x1:340, y0:-32,  y1:-12 },
  { k:'grass',   x0:-20, x1:340, y0:-12,  y1:Y0 },
  { k:'tar',     x0:X0,  x1:X1 + 4, y0:Y0, y1:Y1 },
  { k:'lane',    x0:X0,  x1:X1,   y0:Y1 - ROAD_W, y1:Y1 },
  /* The access road in from the mini-roundabout by the Seabraes footbridge,
     along the railway: where every car now arrives and leaves. */
  { k:'lane',    x0:X0 - 30, x1:X0, y0:Y1 - ROAD_W, y1:Y1 },
  { k:'walk',    x0:X0,  x1:X1 + 4, y0:Y0, y1:KERB_Y },
  { k:'island',  x0:X0 + 9, x1:X1 - 6, y0:ISLAND_Y - ISLAND_W / 2,
                 y1:ISLAND_Y + ISLAND_W / 2 },
  { k:'grass',   x0:X0 + 18, x1:X0 + 46, y0:BANDS[0] + BAND, y1:BANDS[0] + BAND + 4.4 },
  { k:'grass',   x0:X0 + 74, x1:X0 + 102, y0:BANDS[1] + BAND, y1:BANDS[1] + BAND + 4.4 },
  { k:'grass',   x0:X0 + 120, x1:X0 + 148, y0:BANDS[0] + BAND, y1:BANDS[0] + BAND + 4.4 },
  { k:'grass',   x0:-20, x1:340, y0:Y1,    y1:Y1 + 6 },
  { k:'ballast', x0:-20, x1:340, y0:Y1 + 6, y1:Y1 + 24 },
  { k:'scrub',   x0:-20, x1:340, y0:Y1 + 24, y1:Y1 + 50 },
  { k:'waste',   x0:-20, x1:340, y0:Y1 + 50, y1:200 },
  { k:'fore',    x0:6,   x1:38,  y0:-12,  y1:Y0 + 2 }
];
/* ======================================================= the black realm =====
   The ground is these rectangles and nothing else, so anywhere none of them
   covers there is no ground at all - and on screen that is exactly what it
   looks like: black. That is past the edges of the world, and ALSO the west-end
   approach, which was never painted: the filling station and the bus stop stand
   on black. Trueno cannot drive there (the world is walled to the car park), so
   the only way in is to be dropped.
   Thomas's request (2026-10-09): drop something out there in god mode and it
   should not land on tarmac that is not drawn, it should go.
   So the edge of the world is DERIVED from what is drawn rather than chosen,
   which keeps the two from ever disagreeing: extend the waste ground and the
   edge moves with it.
   What 'goes' means depends on who it is, and that is the actual design:
     - a car, a customer: gone. That was their visit. The traffic controller is
       already steering occupancy at a target, so a car park you have been
       throwing cars out of fills back up on its own, as fast as the entrance
       road will deliver them - which is the flurry, and it needs no new rule.
       The owner of a vanished car gets the lost-car episode the sim already
       has: she hunts, asks the Manager, Trolleyboy's sixth sense finds nothing,
       and she goes home on foot or on the bus.
     - the named cast (the Manager, Trolleyboy, the gulls, the fox, and Trueno
       himself): they COME BACK, the same individual, not a replacement. They
       are the place, and once beings learn, a replacement would be a stranger
       with an empty head - the void must not be a way of wiping a brain.
     - a trolley: turns up back in a shelter, as trolleys do.
   Falling is just the drop carrying on below z = 0, which the renderer already
   draws correctly (SY is linear in z), faded out over VOID_DEPTH metres. No
   shadow out there either, because there is nothing for one to land on - and
   that missing shadow is the tell, while you are still carrying it, that you
   are holding it over nothing. */
const GROUND = (function(){
  const g = { x0:1e9, x1:-1e9, y0:1e9, y1:-1e9 };
  for (const a of AREAS){
    g.x0 = Math.min(g.x0, a.x0); g.x1 = Math.max(g.x1, a.x1);
    g.y0 = Math.min(g.y0, a.y0); g.y1 = Math.max(g.y1, a.y1);
  }
  return g;
})();
/* The kind of ground at a point - the LAST area covering it, because later
   areas are painted over earlier ones - or null where nothing is drawn. */
function groundKind(x, y){
  if (x < GROUND.x0 || x > GROUND.x1 || y < GROUND.y0 || y > GROUND.y1) return null;
  for (let i = AREAS.length - 1; i >= 0; i--){
    const a = AREAS[i];
    if (x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1) return a.k;
  }
  return null;
}
function inVoid(x, y){ return groundKind(x, y) === null; }
function inTay(x, y){ return groundKind(x, y) === 'water'; }
const VOID_DEPTH = 7;                   // metres of fall before it is gone
const VOID = { cars:0, people:0, cast:0, trolleys:0, trueno:0 };
function voidAlpha(o){
  if (o && o.vis !== undefined) return o.vis;
  return o && o.abyss ? Math.max(0, 1 - o.abyss / VOID_DEPTH) : 1;
}

/* ============================================================ the Tay =====
   Thomas's (2026-10-09): drop something in the river and it should SINK, not
   land on the water as if it were tarmac. Three ways to leave by water, by what
   the thing is:
     sink   cars and trolleys. A car floats for a few seconds riding low, then
            goes down, slowly at first, bubbling. A trolley is a steel cage and
            barely floats at all.
     drift  people and the fox: head and shoulders out, turning slowly, carried
            off downstream by the current until the river has them. Nobody goes
            UNDER on screen; the Tay takes them away, which is the same exit as
            the void and a much kinder picture.
     fly    a gull is perfectly happy on water. It bobs, then takes off.
   Then the same consequences as the void: customers and cars gone, the named
   cast back. While in the water the depth is fed through the same height the
   renderer already draws (negative z), and the alpha through vis - so a sinking
   car sinks INTO the water colour, which is what submerged things look like.
   The current runs toward +x: the Tay flows east to the sea, and the store end
   of the site is the east end. */
const SWIM = {
  car:     { mode:'sink',  float:[2.5, 4.5], ride:0.40, bob:0.07, sink:0.45, deep:2.2, drift:0.35 },
  trolley: { mode:'sink',  float:[0.3, 0.7], ride:0.35, bob:0.04, sink:1.6,  deep:1.3, drift:0.25 },
  person:  { mode:'drift', float:[6.0, 9.0], ride:1.20, bob:0.06, fade:3.5,  drift:0.95 },
  fox:     { mode:'drift', float:[5.0, 7.0], ride:0.30, bob:0.05, fade:3.0,  drift:0.95 },
  gull:    { mode:'fly',   float:[2.5, 4.5], ride:0.05, bob:0.05, fade:1.6,  drift:0.80 }
};
const RIPPLES = [];
function ripple(x, y, r, life, a, foam){
  RIPPLES.push({ x:x, y:y, r:r, life:life, a:a, t:simClock, foam:!!foam });
  if (RIPPLES.length > 700) RIPPLES.splice(0, RIPPLES.length - 700);
}
function splash(x, y, size){
  ripple(x, y, 1.2 * size, 0.6, 0.85, true);           // the hit itself, foam
  for (let i = 0; i < 3; i++){
    const rr = { x:x, y:y, r:(3 + i * 1.6) * size, life:1.6 + i * 0.5,
                 a:0.55 - i * 0.12, t:simClock + i * 0.18, foam:false };
    RIPPLES.push(rr);
  }
}
function startSwim(o, kind, vx, vy){
  const p = SWIM[kind];
  o.swim = kind; o.wetT = 0; o.depth = 0; o.sinkV = 0; o.vis = 1;
  o.abyss = o.abyss || 1e-3;                 // committed: no picking it back out
  o.bobPh = RND.scenery() * 6.28;
  o.floatT = p.float[0] + RND.scenery() * (p.float[1] - p.float[0]);
  o.wvx = (vx || 0) * 0.25; o.wvy = (vy || 0) * 0.25;   // the splash kills the throw
  o.ripT = 0.5;
  o.swimZ = 0;
  splash(o.x, o.y, kind === 'car' ? 1 : kind === 'trolley' ? 0.55 : 0.4);
  VOID.tay = (VOID.tay || 0) + 1;
}
/* One step in the river. Writes o.swimZ (the height to draw at, negative) and
   o.vis, and returns true when the river has finished with it. */
function swimStep(o, dt){
  const p = SWIM[o.swim];
  o.wetT += dt;
  /* Water drag on whatever the throw left, relaxing toward the current. */
  const k = Math.max(0, 1 - 1.6 * dt);
  o.wvx = o.wvx * k + p.drift * (1 - k);
  o.wvy = o.wvy * k;
  o.x += o.wvx * dt; o.y += o.wvy * dt;
  const bob = Math.sin(o.wetT * 3.1 + o.bobPh) * p.bob;
  const floating = o.wetT < o.floatT;
  let done = false;
  if (p.mode === 'sink'){
    if (floating) o.depth += (p.ride - o.depth) * Math.min(1, dt * 4);
    else {
      o.sinkV = Math.min(1.1, o.sinkV + p.sink * dt);
      o.depth += o.sinkV * dt;
      if (RND.scenery() < dt * 5)                     // bubbles
        ripple(o.x + (RND.scenery() - 0.5) * 1.2, o.y + (RND.scenery() - 0.5) * 1.2,
               0.45, 0.7, 0.6, false);
    }
    o.vis = Math.max(0, Math.min(1, 1 - (o.depth - p.ride) / (p.deep - p.ride)));
    done = o.depth >= p.deep;
  } else if (p.mode === 'drift'){
    o.depth += (p.ride - o.depth) * Math.min(1, dt * 3);
    o.h = (o.h || 0) + dt * 0.35;                       // turning in the current
    o.vis = floating ? 1 : Math.max(0, 1 - (o.wetT - o.floatT) / p.fade);
    done = o.vis <= 0;
  } else {                                              // fly
    if (floating) o.depth += (p.ride - o.depth) * Math.min(1, dt * 4);
    else o.depth -= dt * 2.6;                           // up and away
    o.vis = floating ? 1 : Math.max(0, 1 - (o.wetT - o.floatT) / p.fade);
    done = o.vis <= 0;
  }
  /* A ring now and then while it is on the surface. */
  o.ripT -= dt;
  if (o.ripT <= 0 && o.depth < p.ride + 0.5 && o.depth > -0.3){
    o.ripT = 0.8 + RND.scenery() * 0.5;
    ripple(o.x, o.y, o.swim === 'car' ? 3.2 : 1.4, 1.5, 0.35, false);
  }
  o.swimZ = -(o.depth + (o.depth > -0.3 ? bob : 0));
  return done;
}
function clearSwim(o){
  o.swim = null; o.vis = undefined; o.depth = 0; o.swimZ = 0;
}
/* A car that has gone over the edge. Its bay is let go so the controller sees a
   space and fills it; the driver, if she is still in the shop, is told nothing,
   which is the point. */
function consignCar(c){
  c.done = true;
  if (c.veh) c.veh.fate = 'void';
  clearSwim(c);
  VOID.cars++;
  if (c.repark && c.fromBay){ c.fromBay.claimed = false; c.fromBay.leaving = false; }
  else if (c.bay && c.state === 'in') c.bay.claimed = false;
  if (c.ownerCid)
    for (const o of BEINGS) if (o.cid === c.ownerCid){ o.ownBay = null; o.carVoid = true; }
}
function consignBeing(b, how){
  b.voidHow = how || 'void';
  clearSwim(b);
  b.abyss = 0; b.z = 0; b.vz = 0; b.vx = 0; b.vy = 0; b.gz = 0;
  if (b.carry){ b.carry.held = false; b.carry = null; }
  if (hasLife(b)){ b.gone = true; VOID.people++; return; }
  VOID.cast++;
  b.voidAt = simClock;
  b.leaving = false; b.arriving = false; b.hold = 0;
  if (b.kind === 'gull' || b.kind === 'fox'){
    /* Wildlife: off the premises for a while, then back the usual way. */
    b.away = true;
    b.voidT = how === 'tay' && b.kind === 'gull' ? 8 + RND.scenery() * 8
                                                 : 30 + RND.scenery() * 30;
  } else {
    /* Staff: back in the shop, and out of the doors again in a little while as
       if nothing happened. Put AT the doors now, because the radio can call
       Trolleyboy out early and that only clears inStore - it does not move him. */
    const dr = nearestPlace(PLACES.doors, X1 - 20, ROWY[0]);
    b.x = dr[0]; b.y = dr[1] + 1.2;
    b.inStore = true;
    b.hold = 25 + RND.scenery() * 25;
  }
}
/* The fall itself, for a being. Kept out of stepBeing because that clamps
   everybody to the car park every tick, which is what used to happen to anyone
   dropped out here: snapped straight back to the kerb. */
function beingFall(b, dt){
  if (!b.abyss){
    b.abyss = 1e-3;
    if (b.carry){ b.carry.held = false; b.carry = null; }
  }
  if (b.swim){
    const out = swimStep(b, dt);
    b.z = b.swimZ; b.vz = 0; b.gz = 0;
    b.state = poseOr(b, (b.kind === 'gull' && b.wetT > b.floatT) ? 'wings-out' : b.look);
    if (out) consignBeing(b, 'tay');
    return;
  }
  b.vz -= GRAV * dt;
  b.z += b.vz * dt;
  b.x += (b.vx || 0) * dt;
  b.y += (b.vy || 0) * dt;
  b.gz = 0;
  b.state = poseOr(b, b.kind === 'gull' ? 'wings-out' : b.look);
  if (b.z <= 0 && !(b.abyss > 1e-3) && inTay(b.x, b.y)){
    startSwim(b, b.kind === 'gull' ? 'gull' : b.kind === 'fox' ? 'fox' : 'person', b.vx, b.vy);
    b.z = 0; b.vz = 0;
    return;
  }
  if (b.z < 0) b.abyss = Math.max(1e-3, -b.z);
  if (b.abyss >= VOID_DEPTH) consignBeing(b);
}
function consignTrolley(m){
  VOID.trolleys++;
  for (const b of BEINGS) if (b.carry === m) b.carry = null;
  const sh = SHELTERS[Math.floor(RND.scenery() * SHELTERS.length)];
  m.x = sh[0]; m.y = sh[1] - 2 + Math.floor(RND.scenery() * 4) * 1.1; m.h = Math.PI / 2;
  m.z = 0; m.vz = 0; m.vx = 0; m.vy = 0; m.r = 0; m.abyss = 0;
  clearSwim(m);
  syncBox(m);
}
/* Trueno comes back in through the entrance, like an arrival. Shaken - the
   manoeuvre state and mood start fresh - but with his dents, because the void
   is not a repair shop. */
function truenoReturns(how){
  car.voidHow = how || 'void';
  clearSwim(car);
  const g = carGate();
  car.x = g[0] + 3; car.y = g[1]; car.h = 0;
  car.vx = 0; car.vy = 0; car.r = 0; car.ax = 0; car.ar = 0;
  car.airborne = 0; car.vzz = 0; car.abyss = 0;
  CTL.thr = CTL.brk = CTL.hb = CTL.rev = 0; CTL.steer = 0;
  resetMan(car);
  car.voidAt = simClock;
  VOID.trueno++;
}

const RAILS = [Y1 + 9.8, Y1 + 13.2, Y1 + 16.8, Y1 + 20.2];

const WALL = '#98a09d', ROOF = '#45786a', ROOF2 = '#3d6c5f', COLC = '#39424a';
const MASTC = '#2a3238', MASTH = '#3b454b', BRIDGE = '#d4d9d8';
/* Arched glazing in the rotunda and along the colonnade: dark and reflective. */
const GLASS = 'rgba(70,92,96,0.62)';
const SCEN = [];
function sbox(X, Y, L, W, z0, z1, col, rot){
  SCEN.push({ X:X, Y:Y, L:L, W:W, z0:z0, z1:z1, col:col, rot:rot || 0 });
}
function spitch(X, Y, L, W, z0, z1, col, axis, n){
  n = n || 3;
  const dz = (z1 - z0) / n;
  for (let i = 0; i < n; i++){
    const f = 1 - i / n;
    sbox(X, Y, axis === 'x' ? L : L * f, axis === 'x' ? W * f : W,
         z0 + i * dz, z0 + (i + 1) * dz, col);
  }
}
(function buildScenery(){
  /* The rear wing and dock hang off the railway edge (see DOORS); the main
     shed runs from its old river-side line to meet the wing, so it deepens by
     however much the car park was widened. */
  const SMD = (Y1 - 23) - (Y0 - 12) + 2;            // 64 at the measured width
  const SMY = Y0 - 12 + SMD / 2, SRY = Y1 - 13;
  sbox(X1 + 60, SMY, 120, SMD, 0, 5.4 * BH, WALL);         // store, main shed
  sbox(X1 + 70.5, SRY, 99, 20, 0, 5.4 * BH, WALL);         // rear wing
  for (let i = 0; i < 6; i++)
    spitch(X1 + 10 + i * 20, SMY, 20, SMD, 5.4 * BH, 9.6 * BH, ROOF, 'y');
  for (let i = 0; i < 5; i++)
    spitch(X1 + 31 + i * 20, SRY, 20, 20, 5.4 * BH, 9.2 * BH, ROOF, 'y');
  sbox(X1 + 1, SMY, 3, SMD - 6, 0, 6.2 * BH, '#6f7a7c');   // frontage glazing
  sbox(X1 - 0.5, SMY, 1.2, 54, 4.0 * BH, 5.6 * BH, '#c3502f');   // the red sign
  sbox(X1 + 18, SRY, 4, 20, 0, 1.2 * BH, '#6d7378');       // loading platform
  for (const dy of [SRY - 6, SRY, SRY + 6])
    sbox(X1 + 20.3, dy, 0.7, 4.6, 1.2 * BH, 4.4 * BH, '#20262a');

  /* The colonnade: a single line of white columns on the kerb, arched glazing
     between them, green pitched roof over. 5 m deep, not the 11 m I had. */
  /* Runs from the rotunda, not from 8 m short of it - in the photos the colonnade
     runs straight into the rotunda and they read as one structure. */
  for (let x = PVX; x <= X1 - 4; x += 6){
    sbox(x, KERB_Y - 0.5, 0.42, 0.42, 0, 4.2 * BH, COLC);
    sbox(x + 3, KERB_Y - 0.5, 0.9, 0.18, 3.4 * BH, 4.0 * BH, COLC);  // the arch
  }
  spitch((PVX + X1 - 4) / 2, WY, X1 - 4 - PVX, WALK_W + 1.4,
         4.2 * BH, 5.4 * BH, ROOF, 'x');
  /* And the bollard line that actually keeps him out, which is dense enough in the
     photos to read as a fence. */
  for (let x = X0; x <= X1 + 4; x += 1.6){
    sbox(x, KERB_Y, 0.15, 0.15, 0, 0.95, '#141719');
    sbox(x, KERB_Y, 0.16, 0.16, 0.58, 0.74, '#e8ebee');   // the white band
  }
  /* The trolley rotunda. 14 m across, not the 34 m my old roof implied: white
     octagon of columns, arched glazing between them, a louvred clerestory band, then
     the green pitched cap. The roof was comically oversized before. */
  for (let a = 0; a < 8; a++){
    const th = a * Math.PI / 4;
    sbox(PVX + PVR * Math.cos(th), PVY + PVR * Math.sin(th), 0.5, 0.5,
         0, 4.2 * BH, COLC);
  }
  sbox(PVX, PVY, PVR * 1.9, PVR * 1.9 * 0.414, 0.9 * BH, 3.4 * BH, GLASS);
  sbox(PVX, PVY, PVR * 1.9 * 0.414, PVR * 1.9, 0.9 * BH, 3.4 * BH, GLASS);
  for (let i = 0; i < 3; i++){                     // the stepped octagonal cap
    const f = 1 - i * 0.22, z0 = 4.2 * BH + i * 0.42 * BH;
    sbox(PVX, PVY, 16 * f, 16 * f * 0.414, z0, z0 + 0.42 * BH, ROOF2);
    sbox(PVX, PVY, 16 * f * 0.414, 16 * f, z0, z0 + 0.42 * BH, ROOF2);
  }
  sbox(PVX, PVY, 7.4, 7.4 * 0.414, 5.5 * BH, 6.1 * BH, '#d7dad4');   // clerestory
  sbox(PVX, PVY, 7.4 * 0.414, 7.4, 5.5 * BH, 6.1 * BH, '#d7dad4');
  for (let i = 0; i < 2; i++){
    const f = 0.72 - i * 0.3, z0 = 6.1 * BH + i * 0.4 * BH;
    sbox(PVX, PVY, 16 * f, 16 * f * 0.414, z0, z0 + 0.4 * BH, ROOF2);
    sbox(PVX, PVY, 16 * f * 0.414, 16 * f, z0, z0 + 0.4 * BH, ROOF2);
  }
  /* It does have a finial - I took it off earlier and the photos put it back. */
  sbox(PVX, PVY, 0.6, 0.6, 6.9 * BH, 7.6 * BH, '#c3cac8');
  /* Curved-hoop trolley canopies: a run of tubular arches with a clear barrel
     roof over, trolleys nested underneath. Stepping four boxes up each side fakes
     the curve well enough at this scale. */
  for (const sh of SHELTERS){
    /* Five hoops along its length (the photo has five), each a tubular arch
       across the one-bay width. */
    for (let i = 0; i <= 4; i++){
      const hy = sh[1] - SHL / 2 + i * (SHL / 4);
      for (const k of [0, 1, 2, 3]){
        const fx = [1.0, 0.92, 0.68, 0.0][k], z = [0, 1.05, 1.75, 2.15][k];
        const zt = [1.05, 1.75, 2.15, 2.35][k];
        sbox(sh[0] - SHW / 2 * fx, hy, 0.16, 0.3, z, zt, '#9aa3a6');
        if (fx > 0.01) sbox(sh[0] + SHW / 2 * fx, hy, 0.16, 0.3, z, zt, '#9aa3a6');
      }
    }
    sbox(sh[0], sh[1], SHW * 0.9, SHL, 2.3, 2.45, 'rgba(206,214,216,0.55)');
    for (let i = 0; i < 3; i++)                    // the trolleys inside
      sbox(sh[0], sh[1] - SHL / 2 + 1.6 + i * 2.5, 0.6, 1.9, 0.2, 1.0, '#aeb6ba');
  }
  for (let mi = 0; mi < MASTS.length; mi++){
    const m = MASTS[mi];
    sbox(m[0], m[1], 0.55, 0.55, 0, 13.2 * MH, MASTC);
    sbox(m[0], m[1], 3.6, 0.9, 13.2 * MH, 13.9 * MH, MASTH);
    for (const dx of [-1.3, 0, 1.3]){
      sbox(m[0] + dx, m[1], 0.9, 1.1, 13.9 * MH, 14.3 * MH, '#ffe6b4');
      const head = SCEN[SCEN.length - 1];
      head.lit = 1;                       // the lamp itself, self-illuminated
      head.mast = mi;                     // and whose lamp it is, so it can dim
    }
  }
  for (const m of MASTS){                                  // bollard rings
    if (onIsland(m)) continue;
    for (const d of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]){
      sbox(m[0] + d[0], m[1] + d[1], 0.22, 0.22, 0, 1.0, '#1c2024');
      sbox(m[0] + d[0], m[1] + d[1], 0.23, 0.23, 0.6, 0.78, '#e8ebee');
    }
  }
  sbox((X0 + 9 + X0 + 168.6) / 2, ISLAND_Y, 159.6, ISLAND_W, 0, 0.14, '#8d9296');
  sbox(CC[0], CC[1], 13, 4.4, 0, 3.4 * BH, '#a8332c');     // click and collect
  sbox(CC[0] + 3.4, CC[1], 4.2, 4.5, 0.3, 2.9 * BH, '#c9ccc9');  // roller shutter
  sbox(CC[0], CC[1], 13.6, 5.0, 3.4 * BH, 3.8 * BH, '#8e9490');
  for (let i = 0; i < 3; i++)                              // the produce crates
    sbox(CC[0] - 7.2, CC[1] - 1.2 + i * 1.2, 1.1, 1.0, 0, 0.9, '#7a5a3a');

  sbox(22, Y0 + 15, 28, 22, 0, 4.2 * BH, WALL);            // filling station
  for (let i = 0; i < 4; i++)
    spitch(10 + i * 8, Y0 + 15, 8.5, 22, 4.2 * BH, 6.4 * BH, ROOF, 'y');
  for (const dx of [-11, 11]) for (const dy of [-4, 4])
    sbox(23 + dx, -4 + dy, 0.5, 0.5, 0, 5.0 * BH, COLC);
  spitch(23, -4, 26, 11, 5.0 * BH, 6.0 * BH, '#c2c7c5', 'x', 2);

  for (let x = -18; x < 340; x += 6)                       // railway fence
    sbox(x, Y1 + 3.5, 0.22, 0.22, 0, 1.7, '#485055');
  for (let i = 0; i <= 14; i++){                           // footbridge
    const t = i / 14, y = Y1 + t * 46;
    const z = 5.2 + 3.4 * Math.sin(Math.PI * t);
    sbox(52, y, 4.2, 3.4, z, z + 0.55, BRIDGE);
  }
  sbox(46, Y1 + 42, 1.5, 1.5, 0, 17, '#e4e8e7', 0.22);
  sbox(52, Y1 + 50, 4.0, 4.0, 0, 5.4, '#c8cdcc');
})();

const cv = document.getElementById('cv'), g2 = cv.getContext('2d');
let K = 3, panX = 0, panY = 0, CXp = 0, CYp = 0;
/* Everything the renderer knows about the camera is K, panX and panY - SX and SY
   read nothing else - so pointing a second camera at the same world is a matter
   of setting three numbers and clipping. No camera object has to be threaded
   through the drawing code at all, which is the whole reason the quad view is
   cheap to try.
   CLIP is the quadrant being drawn, in CSS pixels, and null means the ordinary
   full-screen view. Boxes outside it return early: with four cameras on one
   canvas the same 2900 boxes would otherwise be drawn four times over, and a
   quadrant shows about a tenth of them.
   VIEW_ROLL is a fixed per-camera tilt about the quadrant centre - nobody ever
   mounted a car park camera level, and half a degree of wonk does more for the
   look of the thing than any amount of noise. */
let CLIP = null, QUAD = false;
let VIEW = 'fishtank';           // fishtank | cctv | trueno
let VIEW_ROLL = 0, VIEW_CX = 0, VIEW_CY = 0;
function setViewT(d){
  g2.setTransform(d, 0, 0, d, 0, 0);
  if (VIEW_ROLL){
    g2.translate(VIEW_CX, VIEW_CY);
    g2.rotate(VIEW_ROLL);
    g2.translate(-VIEW_CX, -VIEW_CY);
  }
}
let trace = true, showRays = false;
function dpr(){ return Math.min(2, window.devicePixelRatio || 1); }
/* Same locked view as the site plan: railway on his left walking in toward the
   store, north to screen left, no orbit and no panning. */
function P(x, y){ return [-(x - (X0 + X1) / 2), (y - (Y0 + Y1) / 2)]; }
function SX(p){ return (p[0] - p[1]) * K + cv.width / (2 * dpr()) + panX; }
/* This had cv.height / (2 * dpr()) * 0.5 - which is a QUARTER of the height, not
   half - so the framed content was centred a quarter of the way down the canvas and
   the bottom half of the screen was always empty. */
function SY(p, z){ return (p[0] + p[1]) * K * 0.5 + cv.height / (2 * dpr())
                          + panY - (z || 0) * K * 0.78; }
function shade(hex, f){
  const n = parseInt(hex.slice(1), 16);
  return 'rgb(' + Math.min(255, (n >> 16) * f | 0) + ',' +
                  Math.min(255, ((n >> 8) & 255) * f | 0) + ',' +
                  Math.min(255, (n & 255) * f | 0) + ')';
}
function rgbOf(c){ return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

const RUB = [];
const RUB_MAX = 5000;
let RUB_LAID = 0;      // gulls eat it, so what survives is not what he laid
function layRubber(c){
  const slipSpd = Math.hypot(c.vx, c.vy - LR * c.r) * Math.abs(Math.sin(c.ar));
  if (slipSpd < 1.8) return;
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  for (const sy of [HALF_W * 0.95, -HALF_W * 0.95]){
    RUB.push([c.x + -LR * ch - sy * sh, c.y + -LR * sh + sy * ch,
              Math.min(1, slipSpd / 9)]);
  }
  while (RUB.length > RUB_MAX) RUB.shift();
  RUB_LAID += 2;                 // one per rear wheel, matching the pushes above
}

function quadAt(x0, y0, x1, y1, fill){
  const pts = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  g2.fillStyle = fill;
  g2.beginPath(); g2.moveTo(SX(pts[0]), SY(pts[0], 0));
  for (let i = 1; i < 4; i++) g2.lineTo(SX(pts[i]), SY(pts[i], 0));
  g2.closePath(); g2.fill();
}
function lineAt(x0, y0, x1, y1, col, w){
  const a = P(x0, y0), b = P(x1, y1);
  g2.strokeStyle = col; g2.lineWidth = w;
  g2.beginPath(); g2.moveTo(SX(a), SY(a, 0)); g2.lineTo(SX(b), SY(b, 0)); g2.stroke();
}
/* glow > 1 lifts every face toward the box's own colour instead of shading it
   down, which is what self-illuminated means in a painter's renderer. */
function drawBoxAt(x, y, ang, lng, wid, z0, z1, col, glow){
  /* The cull, and it goes here rather than in the two loops that call it so that
     the scenery, the reflections and the sprites all get it from one place. The
     radius is deliberately generous - (length + width) x K is about twice the
     true projected half-extent of a rotated rect - because a box wrongly culled
     is a hole in the picture and a box wrongly kept costs four function calls. */
  if (CLIP){
    const o = P(x, y), sx = SX(o);
    const r = (Math.abs(lng) + Math.abs(wid)) * K;
    if (sx + r < CLIP.x0 || sx - r > CLIP.x1) return;
    const sa = SY(o, z0), sb = SY(o, z1);
    if (Math.min(sa, sb) - r > CLIP.y1 || Math.max(sa, sb) + r < CLIP.y0) return;
  }
  const c = Math.cos(ang), s = Math.sin(ang), hl = lng / 2, hw = wid / 2;
  const pts = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(function(q){
    return P(x + q[0] * c - q[1] * s, y + q[0] * s + q[1] * c);
  });
  const o = P(x, y), dc = o[0] + o[1];
  for (let i = 0; i < 4; i++){
    const a = pts[i], b = pts[(i + 1) % 4];
    if (((a[0] + b[0]) + (a[1] + b[1])) / 2 <= dc) continue;
    g2.fillStyle = shade(col, (glow || 1) * Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? 0.62 : 0.46);
    g2.beginPath();
    g2.moveTo(SX(a), SY(a, z0)); g2.lineTo(SX(b), SY(b, z0));
    g2.lineTo(SX(b), SY(b, z1)); g2.lineTo(SX(a), SY(a, z1));
    g2.closePath(); g2.fill();
  }
  g2.fillStyle = col;
  g2.beginPath(); g2.moveTo(SX(pts[0]), SY(pts[0], z1));
  for (let i = 1; i < 4; i++) g2.lineTo(SX(pts[i]), SY(pts[i], z1));
  g2.closePath(); g2.fill();
}

/* Trueno, as built: the panda AE86 from cast.sprite.txt */
const WHT = '#e9eae5', BLK = '#15171a', TYRE = '#0d0e10';
const BODY = [
  [1.22, 0.84, 0.00, 0.60, 0.24, 0.34, TYRE, 1],
  [-1.26, 0.84, 0.00, 0.60, 0.24, 0.34, TYRE, 1],
  [0, 0, 0.18, 4.02, 1.56, 0.32, BLK, 0],
  [0, 0, 0.50, 3.92, 1.44, 0.30, WHT, 0],
  [-0.36, 0, 0.80, 1.84, 1.26, 0.36, WHT, 0],
  [1.52, 0.44, 0.80, 0.26, 0.30, 0.20, '#f4f5f1', 1],
  [-1.99, 0.42, 0.56, 0.10, 0.30, 0.18, '#c0392b', 1],
  [1.99, 0, 0.34, 0.10, 1.04, 0.24, '#101214', 0]
];
let CID = 0;
function carParts(c){
  /* Held, he bucks and his nose pitches - a car dangled by an invisible hand,
     wheels spinning, thoroughly undignified. */
  const up = (c.held ? c.lift : 0) + (c.airborne || 0);
  const pitch = c.held ? Math.sin(c.flail * 1.3) * 0.30 : 0;
  const roll = c.held ? Math.sin(c.flail * 0.9) * 0.22 : 0;
  const ch = Math.cos(c.h), sh = Math.sin(c.h), out = [];
  const cid = 'car';
  for (const b of BODY){
    for (const lt of (b[7] ? [b[1], -b[1]] : [b[1]])){
      out.push({ cid:cid, X:c.x + b[0] * ch - lt * sh, Y:c.y + b[0] * sh + lt * ch,
                 L:b[3], W:b[4],
                 z0:up + b[2] + pitch * b[0] + roll * lt,
                 z1:up + b[2] + b[5] + pitch * b[0] + roll * lt,
                 col:b[6], rot:c.h });
    }
  }
  return out;
}

/* A trolley, in eight boxes. Basket walls left open at the top so you can see
   into it - which is also how the sprite editor draws it, and how a box of
   cornflakes ends up visibly inside one later. */
const TROLLEY = [
  [ 0.34,  0.24, 0.02, 0.13, 0.13, 0.11, '#2b3034', 0],   // castors
  [ 0.34, -0.24, 0.02, 0.13, 0.13, 0.11, '#2b3034', 0],
  [-0.34,  0.24, 0.02, 0.13, 0.13, 0.11, '#2b3034', 0],
  [-0.34, -0.24, 0.02, 0.13, 0.13, 0.11, '#2b3034', 0],
  [ 0.00,  0.00, 0.30, 0.94, 0.56, 0.06, '#aeb6ba', 0],   // basket floor
  [ 0.44,  0.00, 0.30, 0.06, 0.56, 0.36, '#c2c9cc', 0],   // front wall
  [-0.44,  0.00, 0.30, 0.06, 0.56, 0.44, '#c2c9cc', 0],   // back wall
  [-0.52,  0.00, 0.72, 0.05, 0.54, 0.05, '#d24b3f', 0]    // the red handle
];
function trolleyParts(m){
  /* Held, it swings and kicks. A trolley has no limbs to flail, so its whole body
     does the flailing - which reads correctly, because that is what a trolley
     dangled off the ground actually does. */
  const sw = m.held ? Math.sin(m.flail * 2.7) * 0.34 : 0;
  const tip = m.held ? Math.sin(m.flail * 1.9) * 0.22 : 0;
  const h = m.h + sw;
  const ch = Math.cos(h), sh = Math.sin(h), out = [];
  for (const b of TROLLEY){
    /* On its side, the box's height becomes its lateral extent and its lateral
       offset becomes height - a 90 degree roll about its own long axis, done in
       the box list rather than with a real rotation, which this renderer has no
       way to express. */
    const lat = m.tipped ? b[2] + b[5] / 2 - 0.3 : b[1];
    const wid = m.tipped ? b[5] : b[4];
    const z0 = m.tipped ? 0.02 + Math.abs(b[1]) : b[2];
    const z1 = m.tipped ? 0.02 + Math.abs(b[1]) + b[4] : b[2] + b[5];
    out.push({ cid:m.cid, X:m.x + b[0] * ch - lat * sh, Y:m.y + b[0] * sh + lat * ch,
               L:b[3], W:wid, rot:h,
               z0:m.z + z0 + tip * b[0], z1:m.z + z1 + tip * b[0],
               col:b[6] });
  }
  return out;
}
