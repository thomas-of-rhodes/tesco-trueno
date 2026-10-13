/* Tesco Trueno - 05-movers-moods.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ===================================================== movers, and trolleys ===
   Until now the only thing in this world that moved under its own steam was Trueno,
   plus a lorry on a timer. A trolley is the cheapest being there is - no brain at
   all, just mass and four castors - which makes it the right one to build first:
   everything the god hand learns to do to a trolley it will later do to a granny.

   Movers are deliberately NOT world boxes. A world box is a wall: Trueno bounces
   off it and loses speed by §4.1. A trolley is the opposite - he shunts it out of
   the way and barely slows, because 1120 kg against 25 kg is a 45:1 mismatch. So
   they live in their own list, they are in the field he SEES, and they are not in
   the field he collides against. */
const MOVERS = [];
const GRAV = 9.81;

function makeTrolley(x, y, h){
  const t = { kind:'trolley', x:x, y:y, h:h || 0, vx:0, vy:0, r:0,
              z:0, vz:0, held:false, flail:RND.movers() * 6.28,
              mass:25, hl:0.53, hw:0.31, rolled:0,
              /* Every trolley has one castor with a mind of its own. This is the
                 whole personality of the object and it is one number. */
              wonk:(RND.movers() - 0.5) * 0.9,
              box:{ x:x, y:y, hl:0.53, hw:0.31, a:h || 0, c:1, s:0, kind:'trolley' } };
  syncBox(t);
  return t;
}
function syncBox(m){
  /* The hand calls this on anything it is carrying, and a being has no
     collision box at all - people live in their own list precisely so that
     Trueno does not bounce off a granny. */
  if (!m.box) return;
  const b = m.box;
  b.x = m.x; b.y = m.y; b.a = m.h;
  b.c = Math.cos(-m.h); b.s = Math.sin(-m.h);
}

/* The sense field: everything in sdfAt, plus any mover actually on the ground.
   Trueno's rays read this, so he treats a stray trolley as something to avoid -
   which he should, since hitting one dents him and denting him is one of the two
   things he genuinely hates. Held or airborne movers drop out of it. */
/* The field the LATTICE is built against: the world, plus trolleys and parked
   cars, but not people. A trolley abandoned in an aisle is semi-permanent and
   genuinely worth routing round; a granny is a thing you walk past, and treating
   her as a severed edge took the network from 60 reachable nodes to 11. The route
   says which way down the car park; §5.2 and the gap finder deal with
   whoever is standing in it. */
function sdfStatic(x, y){
  let d = sdfAt(x, y);
  for (let i = 0; i < MOVERS.length; i++){
    const m = MOVERS[i];
    if (m.held || m.z > 0.35) continue;
    const e = sdRect(x, y, m.box);
    if (e < d) d = e;
  }
  return d;
}

/* The same field plus the cars that are MOVING, which is what an arriving driver
   needs to see and what the lattice must not. This used to be one function and
   the two callers wanted opposite things: a car creeping down an aisle is an
   obstacle to the car behind it, and emphatically not a reason to delete that
   aisle from the road network. Because it was shared, every NPC driving down a
   lane severed the lane it was driving down - and the lattice is built ONCE at
   startup, so whichever cars happened to be mid-aisle at that moment cut their
   lanes permanently, for the rest of the session.
   Parked cars need no special handling either way: parkInBay writes them into
   world.boxes, so sdfAt already has them. */
/* Deliberately NOT sdfStatic: the world and the other cars, but no trolleys.
   A stray trolley was the single biggest reason an arriving car gave up and went
   home - 35% of all give-ups - because the probe treated 25 kg of wire basket as
   a wall and the driver sat in front of it until its patience ran out. §4.2
   settled this for Trueno long ago: 1120 kg against 25 kg is a 45:1 mismatch and
   you shunt it without noticing. A Honda Jazz is 1200 kg. It shunts it too.
   So trolleys come out of what the NPC cars SEE, and npcShunt below pushes any
   they actually reach - which is also how the car park gets tidied by accident,
   and how Trolleyboy ends up with work to do at the far end. */
function sdfTraffic(x, y){
  let d = sdfAt(x, y);
  for (let i = 0; i < CARS.length; i++){
    const e = sdRect(x, y, CARS[i].box);
    if (e < d) d = e;
  }
  return d;
}

/* The shunt itself. Gentler than Trueno's - these are people doing 4 mph in a
   car park, not a panda AE86 having fun - so the trolley is pushed clear and
   given a shove along, and the car does not care. */
/* The guarantee, and it is new because the problem is new. A straight forward
   probe was adequate while these cars pivoted on the spot and then drove into
   the bay in a straight line - a ray along the heading really was where the car
   was about to be. Now that they ARC into spaces, the body sweeps sideways
   through ground the ray never looked at, so they started clipping the cars
   either side of the bay, and Trueno with them.
   Two answers, and both are wanted. trafficArc below looks along the curve the
   steering has actually set, which stops most of it happening. This stops ALL of
   it showing: sample the body, and if any part of it is inside something solid,
   push it back out along the gradient of the field and take the speed off.
   The NPC always yields - to the scenery, to a parked car, and to Trueno, who is
   not in the distance field at all and so is checked by hand. He gets right of
   way here for the same reason he gets it in the probe: a car park full of NPCs
   that shunt him would make the one interesting thing in it impossible. */
/* Which box a point is actually inside, because the field only returns how far.
   Needed so a contact can tell a parked Corsa from a bollard.

   The first version read the spatial grid's contents as if they were boxes. They
   are INDICES into w.boxes - nearestKind two hundred lines down had it right all
   along - so every lookup took sdRect of a number, got NaN, and returned null.
   Everything built on it silently did nothing: the parked-car nudge never fired
   once in a simulated day and I reported that as 'cars stop short of contact, so
   there is no interlock to resolve'. That conclusion was wrong and it was my bug,
   not a property of the car park. w.always goes in too, or a gull walks straight
   through the artic. */
function boxAt(x, y){
  const w = WORLD;
  if (!w) return null;
  const near = nearBoxes(w, x, y);
  let best = null, bd = Infinity;
  if (near === null){
    for (let i = 0; i < w.boxes.length; i++){
      const b = w.boxes[i];
      if (b.off) continue;
      const d = sdRect(x, y, b);
      if (d < bd){ bd = d; best = b; }
    }
    return best;
  }
  for (let i = 0; i < near.length; i++){
    const b = w.boxes[near[i]];
    if (!b || b.off) continue;
    const d = sdRect(x, y, b);
    if (d < bd){ bd = d; best = b; }
  }
  for (let i = 0; i < w.always.length; i++){
    const b = w.boxes[w.always[i]];
    if (!b || b.off) continue;
    const d = sdRect(x, y, b);
    if (d < bd){ bd = d; best = b; }
  }
  return best;
}

/* `bite` is how much speed a contact takes off. Half is right for a car that is
   driving and has just found a wall; a car rolling to a stop after being dropped
   needs far less, or six body samples in one frame multiply out to 0.5^6 and the
   roll dies in a fiftieth of a second the moment it touches a neighbour. */
function npcSolid(c, bite){
  const keep = 1 - (bite === undefined ? 0.5 : bite);
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  const HL = c.model.l / 2, HW = c.model.w / 2;
  const pts = [[HL, 0], [-HL, 0], [HL, HW], [HL, -HW], [-HL, HW], [-HL, -HW]];
  const was = c.box.off;
  c.box.off = true;                       // never detect itself
  for (const q of pts){
    const wx = c.x + q[0] * ch - q[1] * sh, wy = c.y + q[0] * sh + q[1] * ch;
    const d = sdfAt(wx, wy);
    if (d >= 0 || !isFinite(d)) continue;
    const e = 0.08;
    const gx = (sdfAt(wx + e, wy) - sdfAt(wx - e, wy)) / (2 * e);
    const gy = (sdfAt(wx, wy + e) - sdfAt(wx, wy - e)) / (2 * e);
    const gl = Math.hypot(gx, gy);
    if (gl < 1e-6) continue;
    const nx = gx / gl, ny = gy / gl, pen = -d + 0.02;

    /* A parked car is not a bollard, and pretending otherwise is what jams this
       car park. Geometry that a hundredth of a metre would resolve was instead
       resolved by somebody abandoning their shopping trip, because the only
       thing allowed to move was the car that had nowhere to go.
       So a parked car gives. Not much - a quarter of the contact, and never more
       than 32 cm from where it was left, which is well inside the slack a bay
       already has and reads as somebody's handbrake not being quite on. It is
       §4.2's 'struck objects should roll', finally applied to the things that
       are struck most often. Scenery, kerbs, bollards, the store and the artic
       do not give at all: those are the walls of the world. */
    const hit = boxAt(wx, wy);
    let share = 1.0;                       // the moving car yields the rest
    if (hit && hit.kind === 'car'){
      const slack = 0.32 - (hit.nudged || 0);
      if (slack > 0.001){
        const give = Math.min(pen * 0.25, slack);
        hit.x += nx * give; hit.y += ny * give;
        hit.nudged = (hit.nudged || 0) + give;
        share = 1 - give / pen;
      }
    }
    c.x += nx * pen * share;
    c.y += ny * pen * share;
    c.spd *= keep;
  }
  c.box.off = was;
  /* And Trueno. Centre separation rather than a proper rectangle test, because
     being roughly out of his way immediately beats being exactly out of it a
     frame later. */
  const dx = c.x - car.x, dy = c.y - car.y;
  const dist = Math.hypot(dx, dy);
  const need = HL + 1.55;
  if (dist < need && dist > 1e-6){
    c.x += (dx / dist) * (need - dist);
    c.y += (dy / dist) * (need - dist);
    c.spd *= Math.min(keep, 0.8);
  }
  if (isFinite(c.x) && isFinite(c.y)) syncNpc(c);
}

/* Clearance along the curve the steering has actually set, rather than along a
   straight line the car is not going to follow. Six samples of the bicycle model
   is plenty: the whole point is the first two metres of the sweep. */
function trafficArc(c, dir, reach){
  const wb = Math.max(1.9, c.model.l * 0.58);
  const halfW = c.model.w * 0.5;
  let x = c.x, y = c.y, h = c.h, gone = 0;
  const step = reach / 6;
  /* Its own box, again. The field includes every car in CARS and this one is in
     CARS, so without this the car sampled ITSELF along its own predicted path,
     found itself solidly in the way the instant it turned the wheel, and stopped.
     Every journey in the car park failed. Third time this exact mistake has
     appeared in this file - the probe, the lattice, and now the arc - so the
     rule is worth stating plainly: anything that samples the field from a body
     has to switch that body off first. */
  const was = c.box.off;
  c.box.off = true;
  for (let i = 0; i < 6; i++){
    h += (dir * step / wb) * Math.tan(c.steer || 0);
    x += Math.cos(h) * step * dir;
    y += Math.sin(h) * step * dir;
    gone += step;
    /* The leading corners, not the centreline - a swinging nose arrives before
       the middle of the car does. */
    for (const sgn of [-1, 1]){
      const px = x + Math.cos(h + sgn * Math.PI / 2) * halfW * 0.9;
      const py = y + Math.sin(h + sgn * Math.PI / 2) * halfW * 0.9;
      if (sdfTraffic(px, py) < 0.12){ c.box.off = was; return gone - step; }
    }
  }
  c.box.off = was;
  return reach;
}

/* Room along the curve you would be on if you turned a given way, which is the
   question a blocked driver actually asks and the one nothing here was asking.
   Everything so far probed straight ahead and, finding that blocked, stopped -
   which is why a jam looked like a row of cars banging their heads off a wall.
   From almost anywhere in a car park there are two ways out, and trying one then
   the other is both what a person does and much better to watch. */
function sideRoom(c, steer, dir, reach){
  const wb = Math.max(1.9, c.model.l * 0.58);
  const halfW = c.model.w * 0.5;
  let x = c.x, y = c.y, h = c.h, gone = 0;
  const step = reach / 7;
  const was = c.box.off;
  c.box.off = true;
  for (let i = 0; i < 7; i++){
    h += (dir * step / wb) * Math.tan(steer);
    x += Math.cos(h) * step * dir;
    y += Math.sin(h) * step * dir;
    gone += step;
    for (const sgn of [-1, 1]){
      const px = x + Math.cos(h + sgn * Math.PI / 2) * halfW * 0.95;
      const py = y + Math.sin(h + sgn * Math.PI / 2) * halfW * 0.95;
      if (sdfTraffic(px, py) < 0.10){ c.box.off = was; return gone - step; }
    }
  }
  c.box.off = was;
  return reach;
}

function npcShunt(c){
  if (!MOVERS.length) return;
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  const HL = c.model.l / 2 + 0.25, HW = c.model.w / 2 + 0.1;
  for (const m of MOVERS){
    if (m.held || m.z > 0.9) continue;
    const dx = m.x - c.x, dy = m.y - c.y;
    const lx = dx * ch + dy * sh, ly = -dx * sh + dy * ch;
    const ix = HL - Math.abs(lx), iy = HW - Math.abs(ly);
    if (ix <= 0 || iy <= 0) continue;
    /* Out through the nearest face, so a nose-on hit sends it ahead and a
       side-swipe sends it sideways. */
    const useX = ix < iy;
    const nx = useX ? (Math.sign(lx) || 1) * ch : -(Math.sign(ly) || 1) * sh;
    const ny = useX ? (Math.sign(lx) || 1) * sh : (Math.sign(ly) || 1) * ch;
    const depth = useX ? ix : iy;
    m.x += nx * depth; m.y += ny * depth;
    const push = Math.min(2.2, Math.abs(c.spd) * 0.7);
    m.vx += nx * push; m.vy += ny * push;
    m.r += (RND.movers() - 0.5) * 1.2;
    syncBox(m);
  }
}
function trafficProbe(x, y, dx, dy, len, halfW){
  let t = 0;
  for (let i = 0; i < 64 && t < len; i++){
    const d = sdfTraffic(x + dx * t, y + dy * t);
    if (d < halfW) return t;
    t += Math.max(d - halfW, 0.3);
  }
  return Math.min(t, len);
}
function staticProbe(x, y, dx, dy, len, halfW){
  let t = 0;
  for (let i = 0; i < 64 && t < len; i++){
    const d = sdfStatic(x + dx * t, y + dy * t);
    if (d < halfW) return t;
    t += Math.max(d - halfW, 0.3);
  }
  return Math.min(t, len);
}
function sdfSense(x, y){
  let d = sdfAt(x, y);
  for (let i = 0; i < MOVERS.length; i++){
    const m = MOVERS[i];
    if (m.held || m.z > 0.35) continue;
    const e = sdRect(x, y, m.box);
    if (e < d) d = e;
  }
  return d;
}

function stepMover(m, dt){
  if (m.held) return;
  if (m.swim){
    if (swimStep(m, dt)) consignTrolley(m);
    else { m.z = m.swimZ; m.vz = 0; syncBox(m); }
    return;
  }

  if (m.z > 0 || m.vz !== 0){            // in the air: pure ballistics
    m.vz -= GRAV * dt;
    m.z += m.vz * dt;
    m.x += m.vx * dt; m.y += m.vy * dt;
    m.h += m.r * dt;
    if (m.z <= 0 && !m.abyss && inTay(m.x, m.y)){
      startSwim(m, 'trolley', m.vx, m.vy);
      m.z = 0; m.vz = 0; m.vx = 0; m.vy = 0; m.r = 0;
      syncBox(m);
      return;
    }
    if (m.abyss || (m.z <= 0 && inVoid(m.x, m.y))){
      m.abyss = Math.max(1e-3, -m.z);
      if (m.abyss > VOID_DEPTH) consignTrolley(m);
      else syncBox(m);
      return;
    }
    if (m.z <= 0){
      m.z = 0;
      /* Landing. A dropped trolley does not stop dead, it slaps down and skitters,
         and most of the fall speed goes into noise and a bounce it loses at once. */
      const slam = -m.vz;
      m.vz = 0;
      m.vx *= 0.55; m.vy *= 0.55;
      m.r += (RND.movers() - 0.5) * slam * 0.6;
      m.rolled += slam;
    }
    syncBox(m);
    return;
  }

  /* On the ground. Four swivel castors: it rolls in any direction fairly freely,
     but a sideways push turns into spin, which is why a shoved trolley pirouettes
     instead of sliding straight. */
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > 1e-4){
    const ch = Math.cos(m.h), sh = Math.sin(m.h);
    const fwd = m.vx * ch + m.vy * sh;        // along its own axis
    const lat = -m.vx * sh + m.vy * ch;       // across it
    m.r += lat * 0.9 * dt;                    // castor trail: sideways becomes yaw
    m.r += m.wonk * sp * 0.12 * dt;           // and the bad wheel pulls it round
    const drag = Math.min(sp, (0.75 + 0.55 * Math.abs(lat)) * dt);
    m.vx -= (m.vx / sp) * drag;
    m.vy -= (m.vy / sp) * drag;
    void fwd;
  } else { m.vx = 0; m.vy = 0; }
  m.r *= Math.max(0, 1 - 2.4 * dt);
  if (m.vx === 0 && m.vy === 0 && Math.abs(m.r) < 1e-4) m.r = 0;
  m.x += m.vx * dt; m.y += m.vy * dt; m.h += m.r * dt;

  /* At rest, and nothing has moved it since it last looked: the four corner
     checks below come out the same, so a still trolley only looks every
     eighth step (2026-10-13 - trolleys standing still were 39% of the sim's
     time, the lab's first profile). Anything that pushes it - Trueno, another
     trolley, Kyle, the hand - moves it or gives it speed, and it looks again
     at once; a car nosing into it is noticed within eight steps (1/15 s). */
  if (m.vx === 0 && m.vy === 0 && m.r === 0 &&
      m.x === m.restX && m.y === m.restY && m.h === m.restH &&
      ((m.restN = (m.restN || 0) + 1) & 7) !== 0) return;

  /* Against the world. Four corners, push out, and lose most of the speed - a
     trolley hitting a kerb stops, it does not ping off. */
  const ch2 = Math.cos(m.h), sh2 = Math.sin(m.h);
  for (const k of [[m.hl, m.hw], [m.hl, -m.hw], [-m.hl, m.hw], [-m.hl, -m.hw]]){
    const wx = m.x + k[0] * ch2 - k[1] * sh2, wy = m.y + k[0] * sh2 + k[1] * ch2;
    const d = sdfAt(wx, wy);
    if (d >= 0) continue;
    const n = sdfNormal(wx, wy);
    m.x += n[0] * -d; m.y += n[1] * -d;
    const vn = m.vx * n[0] + m.vy * n[1];
    if (vn < 0){
      m.vx -= 1.35 * vn * n[0]; m.vy -= 1.35 * vn * n[1];
      m.vx *= 0.5; m.vy *= 0.5;
      m.r += (k[0] * n[1] - k[1] * n[0]) * vn * 0.8;
    }
  }
  m.restX = m.x; m.restY = m.y; m.restH = m.h;
  syncBox(m);
}

/* Trolley against trolley, so a shunted one clears the ones behind it instead of
   sitting inside them. Cheap: there are never many, and it is one pass. */
function moversTouch(){
  for (let i = 0; i < MOVERS.length; i++){
    const a = MOVERS[i];
    if (a.held || a.z > 0.3) continue;
    for (let j = i + 1; j < MOVERS.length; j++){
      const b = MOVERS[j];
      if (b.held || b.z > 0.3) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy), want = 0.86;
      if (dist > want || dist < 1e-6) continue;
      const nx = dx / dist, ny = dy / dist, push = (want - dist) * 0.5;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0){
        const jimp = -0.7 * rel;
        a.vx -= nx * jimp; a.vy -= ny * jimp;
        b.vx += nx * jimp; b.vy += ny * jimp;
        a.r += (RND.movers() - 0.5) * jimp * 0.5;
        b.r += (RND.movers() - 0.5) * jimp * 0.5;
      }
      syncBox(a); syncBox(b);
    }
  }
}

/* Trueno against a trolley. Not §4.1: that is for things that do not move. Here
   momentum goes the other way - the trolley leaves, he keeps almost all his speed,
   and he takes a dent, which is the part he will care about later. */
function collideMovers(c){
  /* The first version sampled the CAR'S FOUR CORNERS against the trolley, the way
     §4.2 samples them against the world. It never fired once. A trolley is 0.62 m
     across and his track is 1.56, so driving dead at one puts a corner either side
     of it and the trolley sails straight through the middle of the car.
     The world can be sampled at points because the world is large. A small object
     has to be tested as a shape. So: treat the car as the rectangle it is, and ask
     whether any part of the trolley is inside it. */
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  const HL = (LF + LR) / 2 + 0.72, HW = HALF_W;      // the car's own footprint
  for (const m of MOVERS){
    if (m.held || m.z > 0.9) continue;

    /* Trolley centre and corners, in the car's frame. Centre catches a square hit,
       the corners catch a clip. */
    const mch = Math.cos(m.h), msh = Math.sin(m.h);
    let bestDepth = 0, bn = null, bpx = 0, bpy = 0;
    const pts = [[0, 0], [m.hl, m.hw], [m.hl, -m.hw], [-m.hl, m.hw], [-m.hl, -m.hw]];
    for (const q of pts){
      const wx = m.x + q[0] * mch - q[1] * msh, wy = m.y + q[0] * msh + q[1] * mch;
      const dx = wx - c.x, dy = wy - c.y;
      const lx = dx * ch + dy * sh, ly = -dx * sh + dy * ch;   // into car frame
      const ix = HL - Math.abs(lx), iy = HW - Math.abs(ly);
      if (ix <= 0 || iy <= 0) continue;                        // outside
      const depth = Math.min(ix, iy);
      if (depth <= bestDepth) continue;
      bestDepth = depth;
      /* Which face it came in through, so a nose hit throws it forward and a
         side-swipe throws it sideways. */
      bn = ix < iy ? [Math.sign(lx) || 1, 0] : [0, Math.sign(ly) || 1];
      bpx = wx; bpy = wy;
    }
    if (!bn) continue;
    void bpx; void bpy;

    const nx = bn[0] * ch - bn[1] * sh;          // face normal back into the world
    const ny = bn[0] * sh + bn[1] * ch;

    const wvx = c.vx * ch - c.vy * sh, wvy = c.vx * sh + c.vy * ch;
    const rel = (wvx - m.vx) * nx + (wvy - m.vy) * ny;
    m.x += nx * bestDepth; m.y += ny * bestDepth;    // it leaves, he does not
    syncBox(m);
    if (rel <= 0.2) continue;

    const MT = m.mass;
    const jimp = (1 + 0.28) * rel / (1 / M + 1 / MT);
    m.vx += (jimp / MT) * nx; m.vy += (jimp / MT) * ny;
    m.r += (RND.movers() - 0.5) * rel * 1.4;        // it slews as it goes
    m.vz = Math.min(2.4, rel * 0.16);                // and gets a bit of air
    m.struck = true;

    const dvx = -(jimp / M) * nx, dvy = -(jimp / M) * ny;   // his share, tiny
    c.vx += dvx * ch + dvy * sh;
    c.vy += -dvx * sh + dvy * ch;

    /* The dent. Energy actually transferred into the panel, which is what he will
       care about once he has feelings about his paint. */
    c.dmg += 0.5 * MT * rel * rel * 0.55;
    c.dents = (c.dents || 0) + 1;
    c.contact++;
    syncBox(m);
  }
}

/* ============================================================ sulk mode =====
   "Booo, it's too busy, I'm going to sit on TikTok for a bit."

   It is a joke and it is also the most useful thing in this file since routing,
   for a reason that took a while to see. When the car park fills up he does not
   get slower in an interesting way - he grinds round at eight miles an hour
   having near-misses, and every second of that lands in the statistics as
   WEDGING, which is the measurement for being stuck. It is not the same thing
   at all, and conflating them hid both.

   Sulking separates them. Congestion now produces a decision instead of a
   failure, and a watcher can read it: he is not broken, he is in a huff. It
   also gives the terrarium the rhythm the whole thing was asked for - busy, so
   he withdraws; quiet, so he comes back out - and that hangs directly off the
   peak-times calendar.

   FRET is a mood, not a sensor. It accumulates from things that actually annoy
   him - swerving round people, getting wedged, being dented, abandoning a
   manoeuvre half way - and it bleeds off whenever he is moving freely. So the
   trigger is his EXPERIENCE of the last minute rather than a head-count, and
   two cars in the same car park can feel differently about it. */
const MOOD = { fret:0, sulk:false, spot:null, since:0, sulks:0, sulkT:0 };
const FRET_SULK = 1.0, FRET_CALM = 0.22, SULK_MAX = 55;

function resetMood(){
  MOOD.fret = 0; MOOD.sulk = false; MOOD.spot = null;
  MOOD.since = 0; MOOD.sulks = 0; MOOD.sulkT = 0;
}

/* Somewhere to go and be unhappy. The far end, because it is emptiest - the
   occupancy gradient already puts the crowds at the store end - and in an
   actual bay, because he is precious about the car and would not just abandon
   it across two spaces like an animal. */
function sulkSpot(c){
  let best = null, bs = -1;
  for (const y of ROWY){
    for (let x = X0 + 8; x < X1 - 10; x += 9){
      if (sdfAt(x, y) < 2.2) continue;
      let crowd = 0;
      for (const b of BEINGS){
        if (beingAbsent(b) || b.kind === 'gull' || b.kind === 'fox') continue;
        if (Math.hypot(b.x - x, b.y - y) < 22) crowd++;
      }
      const away = 1 - (x - X0) / PARK_L;          // far end from the doors
      const trek = Math.hypot(x - c.x, y - c.y);
      const sc = (away * 1.4 + 1) / (1 + crowd * 0.9) / (1 + trek / 120);
      if (sc > bs){ bs = sc; best = [x, y]; }
    }
  }
  return best;
}

/* The other pole. Sulking is what a busy car park does to him; SHINE is what
   an empty one at night does, and it is the answer to something measured much
   earlier and left open: he could not slide because he never carried the speed
   to break traction, and slackening the slip dials did nothing because
   willingness was never the constraint. Space and speed were. At 3 a.m. with
   the grannies at home he has both, so this is where the dials finally bite. */
function shineLevel(){
  if (!isNight()) return 0;
  let people = 0;
  for (const b of BEINGS){
    if (beingAbsent(b) || b.kind === 'gull' || b.kind === 'fox') continue;
    people++;
  }
  return people === 0 ? 1 : (people <= 2 ? 0.5 : 0);
}

function stepMood(c, dt, dodging){
  /* What winds him up. Each term is scaled so a single event is a nudge and a
     bad minute is a decision. */
  const sp = Math.hypot(c.vx, c.vy);
  MOOD.shine = shineLevel();
  if (MOOD.shine > 0){
    /* Nothing to be cross about, and he is not going to sulk through the one
       part of the day that is his. */
    MOOD.fret = Math.max(0, MOOD.fret - 0.9 * dt);
    if (MOOD.sulk && MOOD.fret < FRET_CALM){ MOOD.sulk = false; MOOD.spot = null; }
  }
  let d = 0;
  if (dodging) d += 0.55 * dt;                       // people in his way
  if (sp < 1.0) d += 0.40 * dt;                      // going nowhere
  if (MAN.mode === 'shuffle' || MAN.mode === 'jturn') d += 0.30 * dt;
  const dmgRate = (c.dmg - (c._lastDmg || 0)) / Math.max(dt, 1e-6);
  c._lastDmg = c.dmg;
  d += Math.min(0.9, dmgRate / 26000) * dt;          // paint, which he minds
  if (sp > 5.5 && !dodging) d -= 0.50 * dt;          // a clear run is the cure
  d -= 0.07 * dt;                                    // and it fades anyway
  MOOD.fret = Math.max(0, Math.min(2.2, MOOD.fret + d));

  MOOD.since += dt;
  if (MOOD.sulk){
    MOOD.sulkT += dt;
    /* He comes out when he has calmed down AND it has actually gone quiet.
       Either alone is not enough: calm in a crowd just means another swerve in
       ten seconds, and quiet while still cross means he is not ready. */
    let near = 0;
    for (const b of BEINGS){
      if (beingAbsent(b) || b.kind === 'gull' || b.kind === 'fox') continue;
      if (Math.hypot(b.x - c.x, b.y - c.y) < 26) near++;
    }
    /* He also gets bored of the phone. Without this the exit needed the car
       park to have gone quiet, which at lunchtime it never does - so he sulked
       78% of the busy period and a viewer tuning in at noon saw a parked car.
       A sulk is a bit, not a shift. On timeout he comes out whether or not it
       has calmed down, has a go, and usually storms off again - which is a
       rhythm rather than an absence, and much more like the actual mood. */
    const bored = MOOD.sulkT > SULK_MAX;
    if ((MOOD.fret < FRET_CALM && near <= 1 && MOOD.since > 12) || bored){
      MOOD.sulk = false; MOOD.spot = null; MOOD.since = 0; MOOD.sulkT = 0;
      if (bored) MOOD.fret = FRET_SULK * 0.55;   // still cross, but out
    }
  } else if (MOOD.fret > FRET_SULK && MOOD.since > 20){
    MOOD.sulk = true; MOOD.spot = sulkSpot(c);
    MOOD.since = 0; MOOD.sulkT = 0; MOOD.sulks++;
  }
}

/* Driving while sulking: get to the spot, line up, switch off. The route layer
   does the getting there - he is not storming off in a straight line through a
   bay row - and once parked he simply stops being a driver. */
function driveSulk(c, ctl){
  const sp = MOOD.spot;
  if (!sp){ ctl.thr = 0; ctl.brk = 1; ctl.steer = 0; return true; }
  const dx = sp[0] - c.x, dy = sp[1] - c.y;
  const d = Math.hypot(dx, dy);
  if (d < 2.2){
    /* Parked. Straighten up against the bay and shut it down. */
    ctl.thr = 0; ctl.brk = 1; ctl.hb = Math.hypot(c.vx, c.vy) < 0.4 ? 1 : 0;
    ctl.steer = 0; ctl.rev = 0;
    MOOD.parked = true;
    return true;
  }
  MOOD.parked = false;
  const want = angDiff(Math.atan2(dy, dx), c.h);
  const room = corridorProbe(c.x, c.y, Math.cos(c.h), Math.sin(c.h), 24, CAR_W * 0.5);
  ctl.steer = Math.max(-1, Math.min(1, GENE.steer * want - GENE.yawDamp * c.r));
  const vWant = Math.min(7.5, 0.8 * room, 0.9 * d);
  const err = vWant - c.vx;
  ctl.thr = err > 0 ? Math.max(0, Math.min(1, K_throttle * err / 9)) : 0;
  ctl.brk = err > 0 ? 0 : Math.max(0, Math.min(1, GENE.brake * -err / 9));
  ctl.hb = 0; ctl.rev = 0;
  return false;
}

/* ====================================================== he always swerves ===
   The rule, decided rather than emergent: Trueno never hits a person. Not
   rarely, not usually - never. Property is fair game, and swerving into a
   trolley or somebody's wing mirror is the price, but a car and a human body
   do not meet in this car park.

   It is enforced twice, because once is not a guarantee.

   First as a VETO on the controls, above everything: above §5.2's aim, above
   the gap finder, above a handbrake turn in progress. A manoeuvre that would
   run him into a granny gets abandoned mid-sequence. That handles the honest
   cases and it looks like driving, because it IS driving - he brakes and steers
   round, and whatever he clips instead gets bashed about.

   Then as a POSITIONAL GUARANTEE after the physics, for the cases the veto
   cannot save: too fast, too close, boxed in. There the physics simply bends.
   He does not pass through and he does not knock them down - he is stopped
   short, as though he had found grip that was not there. That is a fudge and it
   is meant to be; the alternative is a sim where you sometimes run over an old
   lady, and no amount of physical honesty is worth that.

   The envelope took one correction. A fixed 14 m look-ahead regardless of speed
   deadlocked him completely: he braked because somebody was near, so he never
   got away, so they stayed near - 100% of ticks in a swerve, mean speed 0.4 mph.
   That is §6.3's lesson arriving for the third time. Stopping distance goes with
   the SQUARE of speed, so a fixed look-ahead is far too twitchy when slow and
   far too short when quick. It follows v^2 now, and nothing counts as a threat
   unless he is actually closing on it. A car stopped beside a granny is not an
   emergency, it is a queue. */
const SWERVE_WIDE = 2.6;
function personThreat(c){
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  const sp = Math.hypot(c.vx, c.vy);
  if (sp < 1.2) return null;                    // walking pace is already safe
  const look = 2.2 + (sp * sp) / 9.0;           // his own braking distance
  let worst = null, ws = 0;
  for (const b of BEINGS){
    if (beingAbsent(b) || b.z > 0.9) continue;
    if (b.kind === 'gull' || b.kind === 'fox') continue;
    const dx = b.x - c.x, dy = b.y - c.y;
    const lx = dx * ch + dy * sh;               // ahead
    const ly = -dx * sh + dy * ch;              // across
    if (lx < 0.2 || lx > look) continue;
    const room = Math.abs(ly) - (HALF_W + b.k.r);
    if (room > SWERVE_WIDE) continue;
    const score = (1 - lx / look) *
                  (1 - Math.max(0, room) / SWERVE_WIDE);
    if (score > ws){ ws = score; worst = { b:b, lx:lx, ly:ly, room:room, s:score }; }
  }
  return worst;
}
function swerve(c, ctl){
  const t = personThreat(c);
  c.dodging = null;
  if (!t) return;
  c.dodging = t;
  /* Away from them, hard. The sign is the side they are NOT on. */
  const away = t.ly >= 0 ? -1 : 1;
  const urgency = Math.min(1, t.s * 2.6);
  ctl.steer = Math.max(-1, Math.min(1, ctl.steer * (1 - urgency) + away * urgency));
  ctl.thr = Math.min(ctl.thr, (1 - urgency) * 0.4);
  ctl.brk = Math.max(ctl.brk, urgency * 0.85);
  ctl.hb = 0;                     // a handbrake mid-dodge is how you hit them
  if (urgency > 0.55 && MAN.mode !== 'none'){
    MAN.mode = 'none'; MAN.phase = ''; MAN.cool = 0.5;   // abandon the manoeuvre
    c.vetoes = (c.vetoes || 0) + 1;
  }
}

/* He was passing straight THROUGH them. People were put in the sense field so he
   would steer round them and deliberately left out of the collision field so he
   would not bounce off a granny like a bollard - but leaving them out of both
   means a car drives through a pedestrian and nothing happens at all, which is
   the worst of the three options and the one I shipped. */
function collidePeople(c){
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  const HL = (LF + LR) / 2 + 0.72, HW = HALF_W;
  for (const b of BEINGS){
    if (beingAbsent(b) || b.z > 0.9) continue;
    if (b.kind === 'gull' || b.kind === 'fox') continue;
    const dx = b.x - c.x, dy = b.y - c.y;
    const lx = dx * ch + dy * sh, ly = -dx * sh + dy * ch;
    if (Math.abs(lx) > HL + b.k.r || Math.abs(ly) > HW + b.k.r) continue;
    void lx; void ly;
    /* The guarantee. He is put back out to the edge of the exclusion - HE
       moves, never the person - and loses most of his speed doing it. Counted,
       because a swerve system that quietly needs rescuing forty times a minute
       is not working and I want to be able to see that. */
    const sep = Math.hypot(dx, dy) || 1e-6;
    const need = HALF_W + b.k.r + 0.25;
    const push = need - sep;
    if (push > 0){
      c.x -= (dx / sep) * push; c.y -= (dy / sep) * push;
      c.vx *= 0.30; c.vy *= 0.30; c.r *= 0.4;
      if (!b.bumped){ c.saves = (c.saves || 0) + 1; b.bumped = 0.8; }
      c.contact++;
    }
  }
}

function stepMovers(dt){
  for (const m of MOVERS) stepMover(m, dt);
  moversTouch();
}

/* Rain lifting the rubber off the asphalt. Proportional to how hard it is
   actually raining rather than to how wet the ground is, because a drying car
   park is not washing anything away. */
function washRubber(dt){
  if (WX.rain < 0.15 || !RUB.length) return;
  const n = Math.min(RUB.length, Math.floor(RUB.length * WX.rain * 0.10 * dt) +
                     (RND.movers() < RUB.length * WX.rain * 0.10 * dt ? 1 : 0));
  for (let i = 0; i < n; i++) RUB.splice(Math.floor(RND.movers() * RUB.length), 1);
}

/* Strays, where strays actually end up: abandoned mid-bay by someone in a hurry,
   nosed against a kerb, or drifted to the low corner of the car park. Grannies
   will be the ones generating these later; for now they are just scattered. */
function seedTrolleys(){
  MOVERS.length = 0;
  let sd = 90210;
  const rnd = function(){ sd = (sd * 1103515245 + 12345) & 0x7fffffff;
    return sd / 0x7fffffff; };
  for (const sh of SHELTERS)                     // a few still parked properly
    for (let i = 0; i < 2; i++)
      MOVERS.push(makeTrolley(sh[0], sh[1] - 2 + i * 1.1, Math.PI / 2));
  for (let i = 0; i < 16; i++){                  // and the strays
    const y = ROWY[Math.floor(rnd() * ROWY.length)] + (rnd() - 0.5) * 3.4;
    const x = X0 + 8 + rnd() * (PARK_L - 16);
    MOVERS.push(makeTrolley(x, y, rnd() * 6.28));
  }
}

/* Same site with the artic held across the service road, which the two lane
   tests need and could no longer get. The old lorry was a position on a timer and
   was simply always there; the real one only comes at delivery time, and both
   tests run mid-morning - so they were measuring an empty road against an empty
   road and reporting 15 vs 15 mph as though that disproved something.

   Pinned mid-reverse rather than docked, and that is the honest case now: a
   DOCKED artic sits in the yard east of the store with its trailer on the
   platform, outside the car park, blocking nothing at all. The twenty seconds
   when it is jack-knifed across the service road setting up for the dock is the
   only time it takes the lane away from him, so that is the moment to measure. */
/* The lane comparison measures clear road against blocked road, so the only
   thing that may differ between the two runs is the artic. Once the traffic
   system could actually put twenty cars on the site, it was putting some of them
   on the service road during the CLEAR run too - the clear figure fell from 15 to
   13 mph and the comparison started measuring other shoppers. Same discipline as
   WET_PIN and the hour: if a test depends on global state, the test pins it. */
let TRAFFIC_OFF = false;
let LORRY_PIN = false;
function buildSiteArtic(){
  const w = buildSite();
  LORRY.on = true; LORRY.phase = 'back'; LORRY.t = 0; LORRY.tries = 0;
  LORRY.x = X1 - 10; LORRY.y = SRY + 1.4;
  LORRY.h = Math.PI; LORRY.ht = Math.PI - 0.8;      // hinged, across the road
  LORRY.v = 0; LORRY.steer = 0; LORRY.held = 0;
  LORRY_PIN = true;
  syncLorry(w);
  return w;
}

/* Same site with the lorry away, so the service run can be measured both ways. */
function buildSiteClear(){
  withLorry = false;
  const w = buildSite();
  withLorry = true;
  return w;
}
/* The site with no stray trolleys on it. The 160 m aisle test is a REFERENCE
   measurement - it exists to show that his speed tracks the clearance ahead on an
   unobstructed run - and the moment 22 trolleys appeared, that run stopped being
   unobstructed and the reference read 12 mph instead of 28. The driver had not
   got worse; the ruler had. Clutter belongs in the roaming tests, not in the
   thing the roaming tests are measured against. */
function buildSiteBare(){
  const w = buildSiteClear();
  w.strays = false;
  return w;
}

/* An empty box for the open-loop tests, so parked cars cannot interfere. */
function buildArena(size){
  return makeWorld({ x:0, y:0, hl:size, hw:size, a:0, c:1, s:0 });
}
