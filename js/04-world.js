/* Tesco Trueno - 04-world.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* =============================================================== world =====
   Everything solid is a vertical prism with a rectangular footprint, so the
   signed distance is analytic. `arena` is inverted: solid outside it.        */

let WORLD = null;
function makeWorld(arena){
  return { arena:arena, boxes:[], owner:[], always:[] };
}
/* Every box knows how tall it is now. The collision field never needed a height
   - it is a plan view and Trueno cannot drive over anything - but a gull can, and
   the moment one thing can walk on top of another the world needs a third
   dimension even if only one creature uses it.
   `top` is in metres. Anything at or under CLIMB_MAX is something a gull will
   walk up and over; anything above it is a thing to walk round, which gets
   bollards, kerbs, cars, shelters, masts and the artic all behaving sensibly
   without a single special case. */
const CLIMB_MAX = 1.5;
function addBox(w, x, y, lng, wid, ang, kind, top){
  w.boxes.push({ x:x, y:y, hl:lng / 2, hw:wid / 2, a:ang || 0,
                 c:Math.cos(-(ang || 0)), s:Math.sin(-(ang || 0)),
                 kind:kind || 'hard',
                 top:(top === undefined ? 2.2 : top) });
}

/* exact signed distance to one rectangle: negative inside.

   `off` is how a bay with no car in it disappears. Every bay owns a permanent
   box, indexed once at world build, and parking just switches it on. The
   alternative was adding and removing boxes at runtime, which means rebuilding
   the spatial index on every arrival, or parking the lot in w.always and paying
   130 linear tests on every SDF query - the index exists precisely to avoid
   that. One branch here covers the distance field, the collision test and
   nearestKind together. */
function sdRect(px, py, b){
  if (b.off) return 1e9;
  const dx = px - b.x, dy = py - b.y;
  const lx = dx * b.c - dy * b.s, ly = dx * b.s + dy * b.c;
  const qx = Math.abs(lx) - b.hl, qy = Math.abs(ly) - b.hw;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
}

/* §2.1 wants signed distance to the nearest solid surface, negative inside a
   solid. Outside the arena counts as solid, hence the negated arena term. */
/* A uniform grid over the boxes. sdfAt is called about twenty times per physics
   step by the collision corners alone, and scanning 434 boxes each time made a
   multi-seed comparison impossible - which is how a single noisy run ends up being
   treated as evidence. Boxes go into every cell their expanded footprint touches,
   and a query searches the 3x3 neighbourhood, so the box term is a valid lower
   bound out to GCELL. Sphere tracing is safe with an underestimate; collision only
   needs accuracy near zero, which is far inside that. */
const GCELL = 10;
function indexWorld(w){
  const gw = Math.ceil((WX_MAX + 2 * GCELL) / GCELL);
  const gh = Math.ceil((WY_MAX + 2 * GCELL) / GCELL);
  w.gw = gw; w.gh = gh; w.grid = [];
  for (let i = 0; i < gw * gh; i++) w.grid.push(null);
  for (let k = 0; k < w.boxes.length; k++){
    if (w.always.indexOf(k) >= 0) continue;
    const b = w.boxes[k];
    const rad = Math.hypot(b.hl, b.hw) + GCELL;
    const i0 = Math.max(0, Math.floor((b.x - rad) / GCELL));
    const i1 = Math.min(gw - 1, Math.floor((b.x + rad) / GCELL));
    const j0 = Math.max(0, Math.floor((b.y - rad) / GCELL));
    const j1 = Math.min(gh - 1, Math.floor((b.y + rad) / GCELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){
      const c = j * gw + i;
      if (!w.grid[c]) w.grid[c] = [];
      w.grid[c].push(k);
    }
  }
}
function nearBoxes(w, x, y){
  if (!w.grid) return null;
  /* NaN defeats every one of the bounds tests below - every comparison against
     it is false - so a non-finite query sailed through, indexed the grid with
     NaN, got undefined back and crashed sdfAt on .length. Worth guarding on its
     own merits: an SDF query should never be able to bring the sim down. */
  if (!isFinite(x) || !isFinite(y)) return null;
  const i = Math.floor(x / GCELL), j = Math.floor(y / GCELL);
  if (i < 0 || j < 0 || i >= w.gw || j >= w.gh) return null;
  return w.grid[j * w.gw + i];
}
function sdfAt(x, y, noArena){
  const w = WORLD;
  let d = noArena ? GCELL : -sdRect(x, y, w.arena);
  const list = nearBoxes(w, x, y);
  if (list === null){
    for (let i = 0; i < w.boxes.length; i++){
      const e = sdRect(x, y, w.boxes[i]);
      if (e < d) d = e;
    }
    return d;
  }
  if (d > GCELL) d = GCELL;
  for (let i = 0; i < list.length; i++){
    const e = sdRect(x, y, w.boxes[list[i]]);
    if (e < d) d = e;
  }
  for (let i = 0; i < w.always.length; i++){
    const e = sdRect(x, y, w.boxes[w.always[i]]);
    if (e < d) d = e;
  }
  return d;
}
/* Which thing is nearest, so a contact can be classified §4.1 */
function nearestKind(x, y){
  const w = WORLD;
  let d = -sdRect(x, y, w.arena), k = 'terrain';
  /* An un-indexed world - the little test arenas - must still fall back to every
     box, exactly as sdfAt does. Returning only the movers made every contact read
     as terrain, which quietly turned walls into kerbs. */
  const near = nearBoxes(w, x, y);
  if (near === null){
    for (let i = 0; i < w.boxes.length; i++){
      const b = w.boxes[i], e = sdRect(x, y, b);
      if (e < d){ d = e; k = b.kind; }
    }
    return k;
  }
  const list = near.concat(w.always);
  for (let i = 0; i < list.length; i++){
    const b = w.boxes[list[i]], e = sdRect(x, y, b);
    if (e < d){ d = e; k = b.kind; }
  }
  return k;
}
/* Central differences. The old build needed +/-0.7 because the chamfer field
   rippled; this field is exact, so a tight epsilon is stable and sharper. */
const NEPS = 0.05;
function sdfNormal(x, y, noArena){
  const gx = sdfAt(x + NEPS, y, noArena) - sdfAt(x - NEPS, y, noArena);
  const gy = sdfAt(x, y + NEPS, noArena) - sdfAt(x, y - NEPS, noArena);
  const m = Math.hypot(gx, gy);
  return m < 1e-9 ? [0, 0] : [gx / m, gy / m];
}
function solid(x, y){ return sdfAt(x, y) <= 0; }
/* Sphere tracing on an exact field: no fixed step, no missed thin walls. */
/* Rays read sdfSense, not sdfAt: he SEES trolleys and steers round them, but
   §4.1 never fires on one, because a trolley is not a wall - he shunts it. The two
   fields differing is the whole point, not an oversight. */
function probe(x, y, dx, dy, len){
  let t = 0;
  for (let i = 0; i < 96 && t < len; i++){
    const d = sdfSense(x + dx * t, y + dy * t);
    if (d < 0.04) return t;
    t += Math.max(d, 0.04);
  }
  return Math.min(t, len);
}

/* The real site, matching site-plan.html. Only things that stand at car height are
   obstacles: the walkway and shelter roofs sit at 4.2 and 2.5 m, so he drives under
   them and the columns are what he has to thread. That makes the walkway edge a
   7 m slalom and the pavilion an eight-column ring, which is where the cornering
   actually lives - the bay grid itself is rectilinear and tests almost nothing. */
const WY = Y0 + WALK_W / 2;              // colonnade centreline
const KERB_Y = Y0 + WALK_W;              // the bollard line, and the bay fronts
/* The pavilion turns out to be the trolley rotunda at the corner of the colonnade:
   octagonal, glazed between white columns, louvred clerestory, green pitched roof,
   full of trolleys. Solid to a car, and it projects past the kerb into the prime
   row, which makes it the one thing in that aisle worth swerving for. */
const PVX = X0 + 40, PVR = 7.0;
/* Set so the rotunda's far face lands exactly on the prime aisle's kerb line: it
   eats the first few bays of the prime row, which is what it does in life, without
   standing half a metre out in the road. */
const PVY = Y0 + WALK_W + PRIME_W - PVR;
/* Curved-hoop canopies, and Thomas's photo (2026-10-12) says what they really
   are: two back-to-back bays roofed over. So the long axis runs ACROSS the car
   park, along the depth of the bays, standing on a back-to-back line, one bay
   wide - not a 12 m tube lying along the island. Placed on the bay grid
   (BAYLINE) so each takes exactly two spaces, clear of the masts, the grass
   beds and Click+Collect. Open-ended and see-through, but packed with
   trolleys, so: solid. SHL is the long side, which is now the y extent. */
const SHELTERS = [[BAYLINE(20), CROSS[0]], [BAYLINE(33), CROSS[0]], [BAYLINE(52), CROSS[0]],
                  [BAYLINE(7), CROSS[1]], [BAYLINE(14), CROSS[1]], [BAYLINE(40), CROSS[1]]];
const SHL = 8.8, SHW = 2.7;
/* Masts: on the island facing the road, and where four bays meet. The ones out in
   the bays each have a ring of black-and-white bollards at their foot, so what he
   actually clips is a bollard - smaller, and there are four of them. The ones on the
   island do not: the kerb is already doing that job, which is what the island is
   for. Giving those a 1.5 m ring as well pushed it 0.3 m into the road. */
const onIsland = function(m){ return Math.abs(m[1] - ISLAND_Y) < 0.01; };
const MASTS = [[BAYLINE(10), CROSS[0]], [BAYLINE(27), CROSS[0]], [BAYLINE(44), CROSS[0]],
               [BAYLINE(61), CROSS[0]],
               [BAYLINE(18), CROSS[1]], [BAYLINE(35), CROSS[1]], [BAYLINE(52), CROSS[1]],
               [BAYLINE(8), ISLAND_Y], [BAYLINE(62), ISLAND_Y]];
/* A roller-shuttered unit up at the store end with produce crates stacked outside,
   not the kiosk out in the middle of the bays where I first put it. */
const CC = [X1 - 20, BANDS[NBANDS - 1] + 2.2];
const SRY = Y1 - ROAD_W / 2;             // the road centreline, and the lorry on it
/* How full it is. This started at 0.72 - a Saturday lunchtime - which left him
   almost nowhere to go, so every driving test was really a test of squeezing past
   parked cars rather than of driving. It is the dial the peak-time calendar will
   drive later; a weekday mid-morning is about a quarter full.
   It was a fixed 0.26, which against each bay's `want` came to about 121 cars
   when the curve at the opening hour asks for about 81, so every day began with
   40 cars driving home for no reason and every short lab run measured that. Now
   it is the curve's own level at the hour the day opens. Fixed at load rather
   than read from the live TOD, because buildSite must build the same world every
   time it is called - the suite rebuilds the live one and expects that. */
const OPEN_TOD = 0.35;                   // TOD's starting value, in 11-cast-cameras
let OCCUPANCY = wantOccupancy(OPEN_TOD);
const BAYS = [];          // every bay, with the box it owns
const CARS = [];          // the ones currently driving about
/* A bay here is 2.55 wide by 4.8 deep, and one 1.85 x 4.4 box in every single one
   filled it almost to the paint - which is not what a supermarket car park looks
   like. Most of what parks at a Tesco is a supermini a metre shorter than its bay.
   Weighted so the cast's own cars fall out of the same table later: the grannies'
   Jazz is a supermini, a boomer's A4 is the saloon, the Discovery the big one. */
/* care: how straight it ends up. Not ageism, observation - a Jazz that has been
   reversed into the same space twice a week for nine years goes in at whatever
   angle it goes in at, and nobody is checking. A freshly leased A4 gets lined up
   between the paint because its owner can see it from the cafe window. The
   Discovery is simply too wide to be neat and takes the liberty anyway. */
/* ONE fleet, not two. There used to be a FLEET table for the cars placed at
   world build and an NPC_MODELS table for the ones that drive, and they shared
   field names but not fields: FLEET had no top speed, no urge, no acceleration.
   beginDeparture reuses whatever model the bay is holding, so every originally
   parked car that tried to leave got a model with top === undefined, and
   Math.min(undefined, ...) is NaN. The NaN clamp then pinned its speed to zero
   and it sat there until it gave up.
   That is the whole departure mystery: departures of cars that had ARRIVED
   worked perfectly - 81 in 700 seconds - because those carry a real model.
   Departures of seeded cars could never move at all, and most of the car park
   is seeded cars. 84 of 102 abandoned journeys were this one line. */
function pickCar(u){
  let acc = 0;
  for (const f of NPC_MODELS){ acc += f.p; if (u <= acc) return f; }
  return NPC_MODELS[0];
}
let withLorry = true;

/* Putting a car in a bay: switch its box on, size it to the vehicle, and give
   it the slightly-wrong placement people actually manage. */
function parkInBay(bay, model, rnd, w, at, veh){
  const world = w || WORLD;
  const r = rnd || RND.world;      /* seeded: a parked car's wonk is part of the day */
  /* Sloppiness scales with how little the driver cares. A Jazz is askew about a
     third of the time and by a fair margin; the A4 is within a few centimetres
     of straight almost always. */
  const care = model.care === undefined ? 0.6 : model.care;
  const bad = r() < 0.42 * (1 - care);
  const slop = 1 - care;
  /* Even the careful ones are a degree or so out. Scaling the tidy case purely
     by slop gave the A4 a mean of 0.1 degrees, which is not careful parking, it
     is a robot - nobody lines up that well and it reads as fake. The floor term
     is the irreducible wonk of a human being with a steering wheel. */
  const skew = bad ? (r() - 0.5) * 0.95 * slop
                   : (r() - 0.5) * (0.032 + 0.22 * slop);
  const off  = bad ? (r() - 0.5) * 2.0 * slop
                   : (r() - 0.5) * (0.14 + 0.55 * slop);
  const shy = bay.toAisle * r() * 0.5;        // nobody pulls all the way in
  const b = world.boxes[bay.box];
  /* `at` is where the car actually came to rest. A parked car only has to fit
     between the things either side of it - the painted rectangle is a
     suggestion, and anybody who has used a car park knows how loosely it is
     taken. Accepting the real position instead of snapping to the bay centre
     removes the whole class of failure where a car was in the slot, could not
     advance the last half metre, and timed out as a failed journey. */
  const a = at ? at.a : bay.h + skew;
  b.x = at ? at.x : bay.x + off;
  b.y = at ? at.y : bay.y + shy;
  b.hl = model.l / 2; b.hw = model.w / 2;
  b.a = a; b.c = Math.cos(-a); b.s = Math.sin(-a);
  b.off = false;
  bay.car = { model:model, skew:skew, off:off, shy:shy, veh:veh || newVeh(model) };
  bay.car.veh.bay = bay;
  return bay;
}
function emptyBay(bay){
  if (bay.car && bay.car.veh && bay.car.veh.bay === bay) bay.car.veh.bay = null;
  /* The tickets go with the car, not with the space. */
  bay.tickets = 0; bay.abandonedAt = undefined; bay.ticketBy = null;
  WORLD.boxes[bay.box].off = true;
  bay.car = null;
}
function bayFree(bay){ return bay.car === null; }

function buildSite(){
  const w = makeWorld({ x:(X0 + X1 + 4) / 2, y:(Y0 + Y1) / 2,
                        hl:(X1 + 4 - X0) / 2, hw:(Y1 - Y0) / 2, a:0, c:1, s:0 });
  let seed = 20260917;
  const rnd = function(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff; };

  /* Every bay in the car park, whether or not anything is in it. They used to be
     scattered by a probability at world build and then never change for the rest
     of the run, which is why occupancy could not breathe: there was nothing to
     breathe. Now a bay is a slot with a permanent, switched-off box, and parking
     a car in it is a state change rather than a new obstacle. */
  addBox(w, CC[0], CC[1], 13, 4.4, 0, 'hard', 3.0);          // Click+Collect cabin
  addBox(w, CC[0] - 7.2, CC[1], 1.2, 3.2, 0, 'hard', 1.2); // the crates outside it
  /* The bollard line along the colonnade kerb: gaps of 1.45 m against a body 1.85 m
     wide, so it reads as a dashed wall - he can see straight through it and can
     never get in. I had him slaloming between the columns before, which is ground
     he cannot reach, so the old 'walkway damage' baseline measured a fiction. */
  for (let x = X0; x <= X1 + 4; x += 1.6)
    addBox(w, x, KERB_Y, 0.15, 0.15, 0, 'hard', 0.95);     // a gull's favourite perch
  /* Pavilion as a solid octagon: two crossed rects, exactly what sdRect wants. */
  addBox(w, PVX, PVY, PVR, PVR * 0.414, 0, 'hard', 4.2);
  addBox(w, PVX, PVY, PVR * 0.414, PVR, 0, 'hard', 4.2);
  for (const sh of SHELTERS)                        // hoop canopies, packed solid
    addBox(w, sh[0], sh[1], SHL, SHW, Math.PI / 2, 'hard', 2.3);   // hoop canopy, across
  addBox(w, (X0 + X1) / 2, ISLAND_Y, PARK_L * 0.48, 0.5, 0, 'kerb', 0.12);  // the island
  for (const m of MASTS){
    addBox(w, m[0], m[1], 0.55, 0.55, 0, 'hard', 8.0);       // CCTV mast
    if (onIsland(m)) continue;
    for (const d of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]])
      addBox(w, m[0] + d[0], m[1] + d[1], 0.22, 0.22, 0, 'hard', 0.95);
  }

  /* Bays LAST, because the validator needs the obstacles in order to validate
     against them. Built first, w.boxes was still empty, nothing was ever
     rejected, and all 448 went in - shelters, rotunda and all. */
  BAYS.length = 0;
  /* A bay is only a bay if you could actually put a car in it. The first version
     laid one down every 2.55 m along every row with no check at all, which put
     448 of them in the car park - including inside the trolley shelters, inside
     Click+Collect, under the rotunda, around the mast bollards and in the grass
     beds. Cars were then dispatched to spaces that are solid objects, sat there
     unable to arrive, and gave up: 284 abandoned journeys in a simulated day and
     not one completed.
     Checked against w directly rather than through sdfAt, because WORLD is still
     the PREVIOUS world while this one is being built. Brute force over a few
     hundred boxes, once, at build. */
  const clearHere = function(px, py, need){
    if (-sdRect(px, py, w.arena) < need) return false;
    for (const b of w.boxes){
      if (b.off) continue;
      if (sdRect(px, py, b) < need) return false;
    }
    return true;
  };
  let rejected = 0;
  for (let ri = 0; ri < ROWY.length; ri++){
    const y = ROWY[ri];
    /* Which way the aisle lies: cars nose IN, so the heading points away from
       it, and the approach point sits out in the aisle. */
    const toAisle = (ri === 0 || ri % 2 === 1) ? 1 : -1;
    const h = toAisle > 0 ? -Math.PI / 2 : Math.PI / 2;
    const prized = (ri === 0 ? 1.9 : 1.0);
    /* Two bays further in than the paint used to start. The west end is a
       two-way road joining every aisle, about 8 m of it - the real one is - and
       with the rows starting at X0 + 4 it was 2.5 m of tarmac that every car in
       and out of the place had to share. 14 bays, gladly given. Still on the
       BAYLINE grid, so the masts keep their corners. */
    for (let x = X0 + 4 + 2 * BAY; x < X1 - 5; x += BAY){
      /* The bay itself must be clear, and so must the spot in the aisle you
         line up from - a bay you cannot reach is no more use than a solid one. */
      if (!clearHere(x, y, 1.25) ||
          !clearHere(x, y + toAisle * 2.0, 1.1) ||
          !clearHere(x, y + toAisle * 4.2, 1.3)){ rejected++; continue; }
      const idx = w.boxes.length;
      addBox(w, x, y, 4.6, 1.85, h, 'car', 1.45);  // the largest the fleet gets
      w.boxes[idx].off = true;
      BAYS.push({ x:x, y:y, h:h, box:idx, car:null,
                  /* Where you line up from. 6.2 m out meant a 90 degree turn
                     into the bay with barely a car length to do it in, so cars
                     crabbed along the bay row and jammed. 4.2 is about where
                     you actually stop before swinging in. */
                  ax:x, ay:y + toAisle * 4.2,
                  toAisle:toAisle,
                  /* How sought-after: the prime row and the store end go first,
                     which is exactly why the far end stays Trueno's. */
                  want:prized * (0.5 + 1.1 * ((x - X0) / PARK_L)) });
    }
  }
  w.baysRejected = rejected;
  /* Opening state. Seeding the car park as it stands at t=0 is not popping -
     popping is a car materialising while somebody is watching. */
  /* Most of these never move, and that is not a shortcut - it is what a
     supermarket car park actually contains. Staff on an eight-hour shift, the
     click-and-collect van, somebody's second car, the one with the flat tyre.
     The distinction matters mechanically: the departure channel used to pick ANY
     occupied bay, so over a simulated day it quietly drained the entire opening
     stock and occupancy decayed toward the only thing arrivals can sustain,
     which is rate x dwell - about 6%. A car park at 6% looks abandoned.
     So the population is now two layers: a long-stay base that stays put, and a
     dynamic layer of real arrivals and departures on top. The curve modulates
     the layer the road can actually move, which is the only one it was ever
     going to be able to modulate. */
  /* OCCUPANCY decides how many; `want` still decides WHERE (the prime row and
     the store end first), scaled so the expected total is OCCUPANCY x bays. */
  let wantSum = 0;
  for (const b of BAYS) wantSum += b.want;
  const fillK = wantSum > 0 ? OCCUPANCY * BAYS.length / wantSum : 0;
  for (const b of BAYS){
    if (rnd() > fillK * b.want) continue;
    parkInBay(b, pickCar(rnd()), rnd, w);
    /* 0.78 left the departure channel with two candidate bays in the whole car
       park, so nothing could leave. Half is enough of a stable base to keep the
       place looking like a Tesco while leaving plenty that can turn over. */
    b.longStay = rnd() < 0.50;
  }

  /* 13 x 4.4, so it sits inside one bay row. I had it 8 m deep, which straddled
     the row behind and put a corner of it in the aisle. */

  /* The artic across the service run. It arrives before the shop opens and late at
     night, which is exactly when he has the place to himself, and at 40 tonnes it
     is the one obstacle he cannot shunt. */
  if (withLorry){
    /* The artic moves every frame, so it is never put in the grid - it lives in
       the small always-tested list instead. Tractor FIRST now, because the
       articulated model drives the tractor and hangs the trailer off it. */
    LORRY.tractor = w.boxes.length;
    LORRY.trailer = LORRY.tractor + 1;
    w.lorry = LORRY.tractor;
    w.always.push(LORRY.tractor, LORRY.trailer);
    addBox(w, X1 - 14, SRY, 6.0, 2.5, Math.PI, 'hard', 2.9);   // tractor unit
    addBox(w, X1 - 4, SRY, 13.6, 2.55, Math.PI, 'hard', 4.0);  // trailer
    /* The bus, which lives on the approach road rather than in the car park -
       see the note by stepBus. */
    BUS.box = w.boxes.length;
    w.always.push(BUS.box);
    addBox(w, X0 - 58, Y0 + WALK_W + PRIME_W + PAISLE / 2, BUS_L, BUS_W, 0,
           'hard', 3.2);
    w.boxes[BUS.box].off = true;
    BUS.on = false; BUS.phase = 'away'; BUS.t = 0;
    BUS.x = X0 - 58; BUS.y = Y0 + WALK_W + PRIME_W + PAISLE / 2;
    BUS.h = 0; BUS.v = 0; BUS.steer = 0;
    LORRY.on = false; LORRY.phase = 'away'; LORRY.t = 0;
    LORRY.x = X1 + 26; LORRY.y = LANE_Y; LORRY.h = Math.PI; LORRY.ht = Math.PI;
    LORRY.v = 0; LORRY.steer = 0;
    syncLorry(w);
  }
  w.strays = true;
  indexWorld(w);
  return w;
}
/* ============================================================== the artic ===
   This was never simulated. The old version computed POSITIONS from a phase:
   the trailer slid along a lerp between two points and the tractor was placed
   at a made-up angle off it, which is why it looked deranged - it crabbed
   sideways, the hinge did whatever the arithmetic said, and the one genuinely
   distinctive motion in the whole car park was a slideshow.

   Now it is an articulated pair, and the jack-knife is a consequence rather
   than a keyframe:

     tractor   kinematic bicycle, wheelbase LT, steered and driven
     trailer   hitched behind the drive axle, its own heading HT
     hinge     g = h - ht, and the trailer's heading rate is

                   dht/dt = v * sin(g) / LH

   Forwards that is self-correcting: any hinge angle shrinks, which is why a
   lorry tracks straight. In REVERSE the same equation has the opposite sign and
   the hinge runs away from you - that is a jack-knife, and it is why reversing
   an artic is a skill. The driver here has to fight it, and sometimes loses and
   has to pull forward and have another go.

   It arrives from the east, off the service access rather than through the car
   park, because that is how deliveries actually reach a dock. */
const LT = 3.9, LH = 8.6;                 // tractor wheelbase, hitch to axle
/* The dock was a guess, and the guess was the reason the manoeuvre looked both
   wrong and far too easy. The scenery already draws it: a 4 m loading platform at
   X1+16..X1+20 with three roller doors behind it, and those doors face WEST. So a
   trailer on them points west with its rear against the platform face at X1+16 -
   and the rear sits 2.5 m behind the axle, which puts the axle at X1+13.5. The old
   DOCK.x of X1+11 stopped the trailer 5 m short of its own platform.

   The y mattered more. DOCK.y was the service road centreline, which is also the
   line the lorry approaches on - so the reverse was dead straight, the hinge never
   left 2 degrees, and the whole articulated model was doing nothing. Aiming at a
   real door instead puts five and a half metres of lateral offset in the way,
   which is what makes it a manoeuvre.

   LANE_Y is the strip behind the store: the rear wing covers the service road out
   to y 72, so the lane in is the clear metres between the wing and the boundary. */
/* Anchored to the RAILWAY edge (Y1), like LANE_Y and the service road, so
   widening the car park leaves the dock manoeuvre exactly as it was tuned. They
   were Y0 + 54/60/66 when Y1 was Y0 + 73. */
const DOORS = [Y1 - 19, Y1 - 13, Y1 - 7];       // the three roller doors, as drawn
const LANE_Y = Y1 - 1.5;                        // the lane in, behind the rear wing
const DOCK = { x:X1 + 13.5, y:DOORS[1], h:Math.PI };
const LORRY = { on:false, phase:'away', t:0, x:0, y:0, h:Math.PI, ht:Math.PI,
                v:0, steer:0, tries:0, wait:0, setY:0, setX:0, held:0,
                tractor:-1, trailer:-1 };

function lorryGeom(){
  /* The hitch sits a little behind the drive axle; the trailer hangs off it. */
  const hx = LORRY.x - Math.cos(LORRY.h) * 0.6;
  const hy = LORRY.y - Math.sin(LORRY.h) * 0.6;
  const tx = hx - Math.cos(LORRY.ht) * (LH * 0.5);
  const ty = hy - Math.sin(LORRY.ht) * (LH * 0.5);
  return { hx:hx, hy:hy, tx:tx, ty:ty };
}
function lorryTrailerAxle(){
  const g = lorryGeom();
  return [g.hx - Math.cos(LORRY.ht) * LH, g.hy - Math.sin(LORRY.ht) * LH];
}
function syncLorry(w){
  /* A world built by buildSiteClear, buildSiteBare or buildArena has no artic in
     it, and LORRY.tractor is a global that still holds an index into the world
     before it. Writing through that index is how the whole suite died with
     'cannot set properties of undefined': 27 tests, one stale integer. The
     world's own w.lorry is the only thing that says whether there is a lorry
     here, so it is what both functions ask. */
  if (!w || w.lorry === undefined) return;
  const a = w.boxes[w.lorry], b = w.boxes[w.lorry + 1];
  if (!a || !b) return;
  const g = lorryGeom();
  a.x = LORRY.x; a.y = LORRY.y; a.a = LORRY.h;
  a.c = Math.cos(-LORRY.h); a.s = Math.sin(-LORRY.h);
  a.off = !LORRY.on;
  b.x = g.tx; b.y = g.ty; b.a = LORRY.ht;
  b.c = Math.cos(-LORRY.ht); b.s = Math.sin(-LORRY.ht);
  b.off = !LORRY.on;
}

/* Reversing an artic, as a controller rather than an animation. You cannot aim
   the trailer directly - you aim the HINGE, and the hinge aims the trailer. */
/* First attempt at this fed the trailer's lateral offset straight into the hinge
   command. That looks reasonable and is completely wrong: once the trailer is
   PARALLEL to the dock but still off to one side, the heading error is zero and
   the offset term alone demands a permanent 35 degrees of hinge - so the rig
   reverses round and round a circle for ever. It did exactly that, 105 metres of
   reversing per attempt, five attempts, ending up 400 m west of the dock.

   Cross-track error does not belong in the hinge. It belongs one level up, in the
   heading you want the trailer to HAVE, and the cascade has to run all the way
   down:

     cross-track  ->  trailer heading you want   (aim it across to close the gap)
     that error   ->  hinge angle you want       (the hinge is what turns a trailer)
     that error   ->  steering                   (and steering is what moves a hinge)

   Each stage is the only actuator the stage above it has. Reversed sign at the
   bottom, because in reverse the tractor swings away from where you want the
   trailer's rear to go - which is the thing that makes it counter-intuitive to do
   in real life. */
function reverseSteer(){
  const axle = lorryTrailerAxle();
  /* The trailer travels along ht + PI when reversing: rear first. */
  const axis = DOCK.h + Math.PI;
  const ex = DOCK.x - axle[0], ey = DOCK.y - axle[1];
  /* How far to the left of the dock axis the dock sits, from the axle. */
  const left = -ex * Math.sin(axis) + ey * Math.cos(axis);
  /* 1. the heading that closes that gap. atan, so a big offset asks for a firm
        but bounded angle rather than an impossible one. */
  const crab = Math.max(-0.5, Math.min(0.5, Math.atan(0.09 * left)));
  const htWant = axis + crab - Math.PI;
  /* 2. the hinge that produces that heading - and the sign is BACKWARDS, which is
        the second thing this controller got wrong. The trailer's heading rate is
        (v/LH) sin(g), and in reverse v is negative, so a positive hinge angle
        DECREASES the trailer's heading. Every forward intuition about which way to
        bend the rig is inverted here. This is the whole reason reversing an artic
        is a skill and not just driving slowly. */
  const gWant = Math.max(-0.55, Math.min(0.55, -2.0 * angDiff(htWant, LORRY.ht)));
  /* 3. and the steering that produces that hinge. */
  const g = angDiff(LORRY.h, LORRY.ht);
  return Math.max(-0.62, Math.min(0.62, -2.6 * (gWant - g)));
}

/* Forty tonnes does not get to be the thing that swerves. Everything else in the
   car park gives way to the artic - Trueno included, since the one rule is that he
   never hits anybody and the artic is the one mass he cannot shunt - so the artic's
   side of that bargain is that it looks before it moves and simply waits.
   This is also where the retries come from honestly. A driver reversing onto a
   dock stops the moment something appears behind the trailer, and if the hold runs
   long enough the attempt is spoiled and has to be taken again. Manufacturing
   occasional failure with a random number would have been a lie; a panda AE86
   loitering in the service road at two in the morning is a reason. */
function lorryHold(dir){
  const g = lorryGeom();
  /* Reversing, the trailer's rear leads and the mirrors are the only view of it;
     forwards, it is the front of the cab. */
  const ex = dir < 0 ? -Math.cos(LORRY.ht) : Math.cos(LORRY.h);
  const ey = dir < 0 ? -Math.sin(LORRY.ht) : Math.sin(LORRY.h);
  const px = dir < 0 ? g.tx - Math.cos(LORRY.ht) * 6.8 : LORRY.x + Math.cos(LORRY.h) * 3.0;
  const py = dir < 0 ? g.ty - Math.sin(LORRY.ht) * 6.8 : LORRY.y + Math.sin(LORRY.h) * 3.0;
  const reach = dir < 0 ? 7.0 : 11.0;
  const near = function(x, y, pad){
    const dx = x - px, dy = y - py;
    const al = dx * ex + dy * ey;
    const ac = Math.abs(-dx * ey + dy * ex);
    return al > -1.0 && al < reach && ac < 1.9 + pad;
  };
  if (near(car.x, car.y, 0.9)) return true;
  for (const b of BEINGS){
    if (beingAbsent(b) || b.kind === 'gull') continue;
    if (near(b.x, b.y, 0.5)) return true;
  }
  for (const c of CARS) if (near(c.x, c.y, 0.9)) return true;
  return false;
}

function stepLorry(w, dt){
  if (!w || w.lorry === undefined) return;
  if (LORRY_PIN){ syncLorry(w); return; }      // held still for the lane tests
  LORRY.t += dt;

  /* Deliveries come before the shop opens and late at night - which is exactly
     when Trueno has the place to himself, so the one obstacle he cannot shunt
     turns up precisely when he is enjoying himself. */
  const window = (TOD > 0.17 && TOD < 0.27) || (TOD > 0.86 && TOD < 0.96);
  if (LORRY.phase === 'away'){
    LORRY.on = false;
    if (window && LORRY.t > 40){
      LORRY.on = true; LORRY.phase = 'in'; LORRY.t = 0; LORRY.tries = 0;
      /* The southern door, and only that one. The other two are further into the
         yard, and the tractor would have to reach them across the kerbed island
         that separates the service road from the bay rows - it would climb a kerb
         on the way in every single night. Variety comes from where it sets up
         instead, which changes how much the hinge has to do and therefore how
         often it has to pull forward and try again. */
      DOCK.y = DOORS[2];
      /* How good the setup is, which is the only thing that decides whether this
         goes in first time. A driver who pulls right forward and sits square has
         thirty metres to work with and walks it in; one who stops short, or ends
         up tight against the fence, has to take two bites at it. Randomising this
         rather than randomising the outcome means the retries are earned. */
      LORRY.setY = LANE_Y - 3.0 + RND.world() * 3.4;
      LORRY.setX = X1 - 13 - RND.world() * 13;
      LORRY.x = X1 + 26; LORRY.y = LANE_Y;
      LORRY.h = Math.PI; LORRY.ht = Math.PI; LORRY.v = 0; LORRY.steer = 0;
    }
    syncLorry(w);
    return;
  }

  let vWant = 0, rev = false;
  if (LORRY.phase === 'in'){
    /* Pull forward past the dock, out into the car park end of the service road,
       so there is two trailer lengths to swing it back through. */
    const px = LORRY.setX;
    const want = angDiff(Math.atan2(LORRY.setY - LORRY.y, px - LORRY.x), LORRY.h);
    LORRY.steer = Math.max(-0.5, Math.min(0.5, want * 1.6));
    vWant = 4.2;
    if (LORRY.x < px + 1.5){ LORRY.phase = 'set'; LORRY.t = 0; }
  } else if (LORRY.phase === 'set'){
    vWant = 0;
    LORRY.steer = 0;
    if (LORRY.t > 2.5){ LORRY.phase = 'back'; LORRY.t = 0; }
  } else if (LORRY.phase === 'back'){
    rev = true; vWant = 1.5;
    LORRY.steer = reverseSteer();
    const axle = lorryTrailerAxle();
    const g = Math.abs(angDiff(LORRY.h, LORRY.ht));
    /* Jack-knifed. Nothing for it but to pull forward and straighten up, which
       is what the hinge limit means in practice. */
    if (g > 1.25){
      LORRY.phase = 'pull'; LORRY.t = 0; LORRY.tries++;
    } else if (Math.hypot(axle[0] - DOCK.x, axle[1] - DOCK.y) < 1.1 &&
               Math.abs(angDiff(DOCK.h, LORRY.ht)) < 0.14){
      LORRY.phase = 'dock'; LORRY.t = 0;
      LORRY.wait = 70 + RND.world() * 150;
    } else if (Math.abs(angDiff(DOCK.h, LORRY.ht)) > 1.0 ||
               (DOCK.x - axle[0]) * Math.cos(DOCK.h + Math.PI) +
               (DOCK.y - axle[1]) * Math.sin(DOCK.h + Math.PI) < -2.5 ||
               LORRY.t > 38){
      /* Gone past it, lost the line, or taken too long. Thirty-odd metres of
         reverse is twenty seconds; anything much over that means it is not
         going in on this attempt. */
      LORRY.phase = 'pull'; LORRY.t = 0; LORRY.tries++;
    }
  } else if (LORRY.phase === 'pull'){
    /* Straighten the hinge going forwards - this is the bit that works for free,
       because forwards the equation pulls the trailer back into line. */
    vWant = 2.4;
    const g = angDiff(LORRY.h, LORRY.ht);
    LORRY.steer = Math.max(-0.5, Math.min(0.5, -1.4 * g));
    if (LORRY.t > 5.5 && Math.abs(g) < 0.18){
      LORRY.phase = LORRY.tries > 4 ? 'leave' : 'back';
      LORRY.t = 0;
    }
  } else if (LORRY.phase === 'dock'){
    vWant = 0; LORRY.steer = 0;
    if (LORRY.t > LORRY.wait){ LORRY.phase = 'out'; LORRY.t = 0; }
  } else if (LORRY.phase === 'out'){
    vWant = 2.2;
    const g = angDiff(LORRY.h, LORRY.ht);
    LORRY.steer = Math.max(-0.5, Math.min(0.5, -1.2 * g));
    if (LORRY.t > 9){ LORRY.phase = 'leave'; LORRY.t = 0; }
  } else if (LORRY.phase === 'leave'){
    /* West, down the service road and out through the car park - which is the
       whole reason the artic is interesting. It came in round the back of the
       store; it goes out the front, past Trueno, sealing the one strip of tarmac
       with no bays, no grannies and nothing to swerve for.
       It used to try to leave east, back the way it came, which meant a sixteen
       metre rig attempting a U-turn in an eighteen metre yard: 74 degrees of hinge
       and the crabbing sideways look that started all this. */
    const want = angDiff(Math.atan2(SRY - LORRY.y, (X0 - 40) - LORRY.x), LORRY.h);
    LORRY.steer = Math.max(-0.5, Math.min(0.5, want * 1.4));
    vWant = 4.5;
    if (LORRY.x < X0 - 12){ LORRY.phase = 'away'; LORRY.t = 0; LORRY.on = false; }
  }

  /* And the hold. The phase timer is wound back with it, so waiting for Trueno to
     get out of the way never counts as failing to get the trailer in. */
  if (vWant > 0 && lorryHold(rev ? -1 : 1)){
    vWant = 0;
    LORRY.t -= dt;
    LORRY.held += dt;
    /* Long enough and the attempt is spoiled: the line is cold, and you pull
       forward and set up again rather than finish a reverse you stopped in. */
    if (LORRY.held > 12 && LORRY.phase === 'back'){
      LORRY.phase = 'pull'; LORRY.t = 0; LORRY.held = 0; LORRY.tries++;
    }
  } else {
    LORRY.held = 0;
  }

  /* Forty tonnes does not change speed quickly. */
  const target = vWant * (rev ? -1 : 1);
  const acc = (Math.abs(target) > Math.abs(LORRY.v) ? 0.8 : 1.6) * dt;
  LORRY.v += Math.max(-acc, Math.min(acc, target - LORRY.v));

  /* The bicycle model, and the hinge equation that does all the work. */
  LORRY.x += Math.cos(LORRY.h) * LORRY.v * dt;
  LORRY.y += Math.sin(LORRY.h) * LORRY.v * dt;
  LORRY.h += (LORRY.v / LT) * Math.tan(LORRY.steer) * dt;
  LORRY.ht += (LORRY.v / LH) * Math.sin(angDiff(LORRY.h, LORRY.ht)) * dt;
  syncLorry(w);
}

/* Kept for the tests, which ask for the lorry across the lane at a known time. */
function setLorry(w, t){ void t; stepLorry(w, DT); }

/* Same site with the lorry away, so the service run can be measured both ways. */
/* This has now been wrong twice, so it gets a permanent test. Anything a car has
   to steer round must sit in a bay row, on the island or on the walkway - never in
   a lane a car is meant to drive down. */
function aisleAudit(){
  const aisles = [[Y0 + WALK_W + PRIME_W, Y0 + WALK_W + PRIME_W + PAISLE]];
  for (const b of BANDS) aisles.push([b + 4.8, b + 4.8 + AISLE_W]);
  aisles.push([Y1 - ROAD_W, Y1]);
  /* Each item with the half-depth it actually occupies, because checking centres
     alone let a mast sit exactly on a bay line with its 1.5 m bollard ring sticking
     out into the road - which is the whole failure mode this audit exists for. */
  const items = [];
  for (const sh of SHELTERS) items.push([sh[1], SHL / 2]);     // long side across
  for (const m of MASTS)
    items.push([m[1], onIsland(m) ? 0.3 : 1.62]);        // ring only out in the bays
  items.push([PVY, PVR]);                                // the rotunda
  items.push([CC[1], 2.2]);                              // its real 4.4 m depth
  let bad = 0;
  for (const it of items){
    const lo = it[0] - it[1], hi = it[0] + it[1];
    for (const a of aisles)
      if (hi > a[0] + 0.05 && lo < a[1] - 0.05){ bad++; break; }
  }
  return bad;
}
