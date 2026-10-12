/* Tesco Trueno - 10-god.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ============================================================== god mode =====
   Pick a thing up, watch it struggle, put it down somewhere worse.

   It earns its place as a test instrument before it earns it as a toy. Every
   subsystem left on the list - the gap finder, the routing, the gulls, the
   grannies - has to be judged by watching, and until now the only way to ask
   "what does he do if a trolley is RIGHT THERE" was to edit the source and
   reload. Now it is a drag of the mouse.

   The projection has to be inverted to do it at all. Screen to world is solvable
   because the isometric is affine and the ground plane fixes z:
     sx = (p0 - p1) K + W/2 + panX          so  u = p0 - p1
     sy = (p0 + p1) K/2 + H/2 + panY - zK.78    so  v = p0 + p1
   giving p0 = (u + v)/2, p1 = (v - u)/2, and P() inverts to x, y. */
const HAND = { on:false, grabbed:null, x:0, y:0, z:0, lift:0,
               vx:0, vy:0, px:0, py:0, since:0, dropped:0, camI:-1 };
const CARRY_Z = 3.4;

function screenToGround(mx, my, z){
  const d = dpr(), W = cv.width / d, H = cv.height / d;
  const u = (mx - W / 2 - panX) / K;
  const v = (my - H / 2 - panY + (z || 0) * K * 0.78) / (K * 0.5);
  const p0 = (u + v) / 2, p1 = (v - u) / 2;
  return [(X0 + X1) / 2 - p0, (Y0 + Y1) / 2 + p1];
}

/* ------------------------------------------- the pointer, in the quad view ---
   Both halves of picking - `screenToGround` above and `grabbableAt` below -
   read the projection out of the globals K, panX and panY. In the ordinary
   view there is one camera and that is fine. In the quad view `drawCCTV` leaves
   those globals set to whatever the LAST quadrant used, so every click in every
   monitor was being inverted through camera four's transform. It did not fail
   loudly; it picked up whatever camera four would have had under that point,
   which is how Thomas found it - occasionally completely the wrong car.
   (I had told him picking would simply stop working in the quad view. It does
   not: it works, through the wrong camera.)

   So the pointer carries its own camera. `pointerView` works out which monitor
   it is on, sets the globals to that camera for the duration of the pick, and
   hands back the pointer in that camera's own pre-roll screen space.
   Strictly paired with `pointerDone`, which puts the globals back - the frame
   loop sets them every frame anyway, but leaving a mutated projection lying
   around for the next thing to read is exactly the bug this is fixing. */
function camUnder(mx, my, forceI){
  if (!CCTV.on || !CCTV.cams.length) return null;
  const qs = quadSize(), top = 40;
  let i = forceI;
  if (i === undefined || i === null || i < 0){
    if (my < top) return null;
    i = (mx < qs[0] ? 0 : 1) + (my < top + qs[1] ? 0 : 2);
    if (mx > qs[0] * 2 || my > top + qs[1] * 2) return null;
  }
  const cam = CCTV.cams[i];
  if (!cam) return null;
  return { cam:cam, i:i, vx:(i % 2) * qs[0], vy:top + (i >> 1) * qs[1],
           w:qs[0], h:qs[1] };
}
let VIEW_SAVE = null;
function pointerView(mx, my, forceI){
  const q = camUnder(mx, my, forceI);
  if (!q) return [mx, my, -1];
  const d = dpr(), cam = q.cam;
  VIEW_SAVE = { K:K, panX:panX, panY:panY };
  K = (q.w / 100) * Math.pow(2, cam.zl.p);
  panX = q.vx + q.w / 2 - cv.width / (2 * d) - cam.pan.p * K;
  panY = q.vy + q.h / 2 - cv.height / (2 * d) - cam.tilt.p * K;
  /* The quadrant is drawn rotated by its camera's wonky mount, so the pointer
     has to be rotated BACK through the same angle about the same centre before
     the projection can be inverted. Half a degree, but a car is only twelve
     pixels long in a wide shot and half a degree at the corner of the frame is
     three of them. */
  const ccx = q.vx + q.w / 2, ccy = q.vy + q.h / 2;
  const a = -cam.roll, ca = Math.cos(a), sa = Math.sin(a);
  const dx = mx - ccx, dy = my - ccy;
  return [ccx + dx * ca - dy * sa, ccy + dx * sa + dy * ca, q.i];
}
function pointerDone(){
  if (!VIEW_SAVE) return;
  K = VIEW_SAVE.K; panX = VIEW_SAVE.panX; panY = VIEW_SAVE.panY;
  VIEW_SAVE = null;
}

/* What is under the cursor. Everything grabbable is compared in SCREEN space, not
   world space: in an isometric view the thing that looks nearest to the pointer is
   the thing the hand should take, and a world-space test picks differently. */
/* A parked car is not an object at all - it is a switched-on box belonging to a
   bay, which is exactly what makes the car park cheap to run. So picking one up
   has to wake it into a real car first: empty the bay, make an NPC out of the
   model that was in it, and hand that back. Which means that when you put it
   down it drives away, because it is now a car with somewhere to be, and its
   owner is still in the shop. */
/* The nearest space with nothing in it, so a car set down goes back to being
   parked somewhere sensible rather than owning a bay on the far side of the
   car park. */
function nearestFreeBay(x, y, within){
  let best = null, bd = (within === undefined ? 9.0 : within);
  for (const b of BAYS){
    if (b.car || b.claimed || b.leaving) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bd){ bd = d; best = b; }
  }
  return best;
}

function liftParked(bay){
  const model = bay.car ? bay.car.model : pickModel();
  const veh = bay.car ? bay.car.veh : null;
  /* Whose it is, carried with the car. Without this a lost driver had nothing to
     recognise her own car BY: matching on the model alone meant the first Jazz
     she walked past was close enough, so she drove off in a stranger's car
     twenty-four seconds after coming out of the shop. Funny once, and it meant
     the search was never a search. */
  let owner = null;
  for (const o of BEINGS) if (o.ownBay === bay) owner = o;
  emptyBay(bay);
  bay.claimed = true;                 // keep it reserved while it is in the air
  bay.leaving = false; bay.leaveBy = undefined; bay.longStay = false;
  /* 'idle' rather than 'go': it is a parked car that happens to be off the
     ground, and it has no journey to make. */
  /* Lift it from where it is sitting, which after a nudge or an earlier drop is
     not where its bay is. */
  const bx = WORLD.boxes[bay.box];
  const c = makeNpc(model, bx ? bx.x : bay.x, bx ? bx.y : bay.y,
                    bx ? bx.a : bay.h, 'idle', veh);
  c.bay = bay; c.fromBay = bay; c.repark = true;
  c.ownerCid = bay.ownerCid || (owner ? owner.cid : null);
  if (owner) owner.ownBay = null;        // she does not know where it has gone
  c.path = null; c.at = 0;
  syncNpc(c);
  return c;
}

function grabbableAt(mx, my){
  let best = null, bestD = 34;                 // pixels
  const test = function(obj, wx, wy, wz){
    const p = P(wx, wy);
    const dx = SX(p) - mx, dy = SY(p, wz) - my;
    const d = Math.hypot(dx, dy);
    if (d < bestD){ bestD = d; best = obj; }
  };
  for (const m of MOVERS) if (!m.abyss) test(m, m.x, m.y, m.z + 0.4);
  /* The whole point of god mode was picking up a CHARACTER - that was the
     suggestion it came from - and it has only ever been able to pick up
     trolleys and Trueno, because those were the only two things in the world
     when it was written. Everything that moves is fair game now: shoppers,
     grannies, the Manager, Trolleyboy, the gulls, the fox, and the NPC cars.
     Tested at the height they are actually drawn at, or the hit box sits on the
     tarmac under a gull standing on somebody's roof. */
  for (const b of BEINGS){
    if (beingAbsent(b) || b.abyss) continue;
    test(b, b.x, b.y, b.z + (b.gz || 0) + 0.4);
  }
  for (const c of CARS){
    if (c.done || c.abyss) continue;
    test(c, c.x, c.y, 0.6);
  }
  /* And the parked ones, which are most of the car park - tested at the box,
     not at the bay. A bay is a slot at a fixed spot; the car in it can be a few
     centimetres off from sloppy parking, 32 cm off from being nudged, or right
     across the car park after being picked up and set down. Testing the slot
     meant that once you had moved a car you were clicking bare tarmac where it
     used to be, and the car itself could never be picked up again. */
  for (const b of BAYS){
    if (!b.car) continue;
    const bx = WORLD.boxes[b.box];
    test(b, bx ? bx.x : b.x, bx ? bx.y : b.y, 0.6);
  }
  if (!car.abyss) test(car, car.x, car.y, 0.6);
  return best;
}

function grab(obj){
  /* A bay was clicked, so wake its car up before anything else touches it. */
  if (obj && obj.ax !== undefined && obj.car) obj = liftParked(obj);
  HAND.grabbed = obj; HAND.since = 0;
  obj.held = true;
  /* A being's drawn height is z + gz, and gz is the roof it happened to be
     standing on. Leave that in and a gull picked off a car floats a metre above
     the hand. */
  if (obj.gz !== undefined) obj.gz = 0;
  if (obj.k){                      // a being: stop whatever it was in the middle of
    obj.hold = 0; obj.vz = 0;
    if (obj.carry){ obj.carry.held = false; obj.carry = null; }
  }
  if (obj.model){ obj.spd = 0; obj.steer = 0; }   // an NPC car
  if (obj === car){
    /* He is 1120 kg of Trueno and he does not enjoy this. Kill the drivetrain so
       he is not still trying to accelerate while dangling. */
    CTL.thr = CTL.brk = CTL.hb = CTL.rev = 0; CTL.steer = 0;
    car.vx = 0; car.vy = 0; car.r = 0;
    car.lift = 0; car.flail = RND.god() * 6.28;
  }
}

function release(){
  const o = HAND.grabbed;
  if (!o) return;
  o.held = false;
  /* Whatever the hand was doing at the moment of release is what the thing
     inherits - so a flick throws it, and letting go while still lifts it and
     drops it straight down. Capped, because a mouse can move implausibly fast. */
  const sp = Math.hypot(HAND.vx, HAND.vy);
  const cap = sp > 26 ? 26 / sp : 1;
  o.vx = HAND.vx * cap; o.vy = HAND.vy * cap;
  o.vz = 0;
  o.r = (o.r || 0) + (RND.god() - 0.5) * 3.5;
  /* Dropped people land badly and need a moment, which is both funnier and more
     plausible than a granny touching down mid-stride. The fall itself is the
     airborne branch of stepBeing, which beings already had for the gulls. */
  if (o.k && o !== car){
    o.z = o.lift || 0; o.vz = 0;
    o.down = 1.6 + RND.god() * 2.2;
    o.lift = 0;
  }
  /* An NPC car has no vertical physics - the driving model is deliberately 2D -
     so it gets the same treatment as Trueno in miniature: a dent for the drop,
     a moment sitting there, and then it carries on with its day. */
  if (o.model){
    /* The same fall Trueno gets, which is the bit that sells it: it hangs, it
       drops, it lands on its wheels and sits there a moment wondering what
       happened. Velocity into the body frame, a dent for the landing, and then
       it works out where it was going and carries on. */
    const drop = o.lift || 0;
    /* z AND airborne both feed the renderer, so leaving z set here drew the car
       at 6.8 m - it appeared to leap upward at the moment of release and then
       fall from twice the height it had been held at. The height is handed over
       to airborne, which is the one the fall integrates. Trueno never had this
       because he has no z at all, which is exactly why his pickup felt right and
       everything else felt wrong. */
    o.lift = 0; o.z = 0; o.spd = 0; o.steer = 0;
    o.airborne = drop; o.vzz = 0;
    const land = Math.sqrt(Math.max(0, 2 * GRAV * drop));
    o.dents = (o.dents || 0) + (drop > 0.8 ? 1 : 0);
    /* The throw, not a clamp to walking pace. Forward component becomes speed;
       the sideways component becomes the angle it lands at, because a kinematic
       car has no lateral velocity to give it to. */
    /* The throw is kept in WORLD axes while it is in the air, not as a speed
       along the heading. Integrating along the heading means the velocity turns
       with the body, so a spinning car flew a banana - and nothing in the air can
       do that, because an arc needs a sideways force and the only thing that
       could supply one is four tyres that are not touching anything. A dropped
       car travels in a straight line and rotates about its own centre while it
       does it; the two are independent until the wheels land. */
    o.fvx = o.vx; o.fvy = o.vy;
    const lat = -o.vx * Math.sin(o.h) + o.vy * Math.cos(o.h);
    o.spd = 0;
    /* A spin, in radians per second, rather than an angle applied at touchdown.
       The first version added the sideways throw and a random kick to the heading
       at the MOMENT OF LANDING, so the car turned through thirty degrees in one
       frame and the angle it ended up at had nothing to do with the angle you
       had been watching it at in the air. A flicked car should rotate all the
       way down and still be rotating when it touches, which is both continuous
       to look at and what actually happens. */
    o.spin = Math.max(-3.0, Math.min(3.0, lat * 0.40 +
             Math.sin((o.flail || 0) * 0.6) * 0.5));
    o.wait = 0.7 + land * 0.12;
    o.blocked = 0; o.queued = 0; o.replanned = 0;
    if (!o.repark && o.bay && (o.state === 'in' || o.state === 'go')){
      const tgt = (o.state === 'go') ? carGate() : [o.bay.ax, o.bay.ay];
      routeFor(o, tgt[0], tgt[1]);
    }
    syncNpc(o);
  }
  if (o === car){
    /* Dropping the car is not the same as dropping a trolley. He lands on his
       wheels, in the body frame, and the fall is worth real damage. */
    const drop = car.lift || 0;
    const land = Math.sqrt(Math.max(0, 2 * GRAV * drop));
    const ch = Math.cos(car.h), sh = Math.sin(car.h);
    car.vx = o.vx * ch + o.vy * sh;
    car.vy = -o.vx * sh + o.vy * ch;
    car.dmg += 0.5 * M * land * land * 0.40;
    car.airborne = drop;
    car.vzz = 0;
  }
  HAND.grabbed = null;
  HAND.dropped = 1.2;
}

/* While held, a thing does not obey physics - it obeys the mouse - but it must
   still look alive, which is the whole point of the idea. The flail is a phase
   that only advances while held, so a thing set down stops dead rather than
   twitching on the tarmac. */
/* The hand is at CARRY_Z, and the screen position of the pointer means a point
   at THAT height - not a point on the tarmac. Solving the pointer against the
   object's current lift, which is what it used to do, means the ground position
   under the cursor changes as the thing rises, so a lifted car slid across the
   car park while it came up and slid back when it went down. Two different
   motions fighting, and the eye reads it as the car dropping to meet the mouse.
   One fixed reference height removes it: the object rises vertically out of its
   space into the hand, and after that the hand simply is where the pointer is. */
function handHeight(){ return CARRY_Z; }

function stepHand(dt){
  HAND.dropped = Math.max(0, HAND.dropped - dt);
  const o = HAND.grabbed;
  if (!o) return;
  HAND.since += dt;
  /* A car dangles; a trolley thrashes. The difference is most of why picking
     Trueno up feels right and picking a Honda up did not - same slow flail rate,
     same gentle roll, for anything with four wheels. */
  const isCar = (o === car) || !!o.model;
  o.flail = (o.flail || 0) + dt * (isCar ? 7.5 : 11.0);
  /* Rise to carry height over a third of a second, so it is plainly a lift and
     not a teleport. */
  o.lift = Math.min(CARRY_Z, (o.lift || 0) + dt * 12);
  o.z = o.lift;
  /* Eased rather than snapped, over about the same time as the lift, so the
     thing swings up into the hand instead of teleporting under it. */
  const k = Math.min(1, dt * 9);
  o.x += (HAND.x - o.x) * k;
  o.y += (HAND.y - o.y) * k;
  if (!isCar){ o.h += dt * 2.2 * Math.sin(o.flail * 0.7); syncBox(o); }
  else {
    o.h += dt * 1.1 * Math.sin(o.flail * 0.6);
    if (o !== car) syncNpc(o);
  }
}

/* Trueno in the air after being dropped: he has no vertical physics of his own,
   because the whole driving model is 2D by design and should stay that way. So
   the fall is a tiny separate integration that only exists between release and
   landing, and hands him back to the normal physics the instant he touches down. */
function stepCarFall(dt){
  if (car.swim){
    if (swimStep(car, dt)) truenoReturns('tay');
    else { car.airborne = car.swimZ; car.vzz = 0; }
    return;
  }
  if (!car.airborne) return;
  car.vzz = (car.vzz || 0) - GRAV * dt;
  car.airborne += car.vzz * dt;
  if (car.airborne <= 0 && !car.abyss && inTay(car.x, car.y)){
    const ch = Math.cos(car.h), sh = Math.sin(car.h);
    startSwim(car, 'car', car.vx * ch - car.vy * sh, car.vx * sh + car.vy * ch);
    car.vx = 0; car.vy = 0; car.r = 0;
    car.airborne = -1e-3; car.vzz = 0;
    return;
  }
  if (car.abyss || (car.airborne <= 0 && inVoid(car.x, car.y))){
    car.abyss = Math.max(1e-3, -car.airborne);
    /* Over the edge he keeps whatever way he had on - body frame to world. */
    const ch = Math.cos(car.h), sh = Math.sin(car.h);
    car.x += (car.vx * ch - car.vy * sh) * dt;
    car.y += (car.vx * sh + car.vy * ch) * dt;
    if (car.abyss > VOID_DEPTH) truenoReturns('void');
    return;
  }
  if (car.airborne <= 0){
    car.airborne = 0; car.vzz = 0;
    car.r += (RND.god() - 0.5) * 1.2;      // lands askew
  }
}
