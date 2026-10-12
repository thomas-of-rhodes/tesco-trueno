/* Tesco Trueno - 12-beings.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ======================================================= standing on things ===
   A gull does not walk round a car, it walks over it, and that is most of what
   makes a gull in a car park read as a gull. So walkable ground has a height
   now: tarmac is zero, and a car is a shape you go up and over.

   The profile is one Gaussian along the car's own length - about 0.8 m at the
   nose and tail, 1.4 at the roof - which gives the bonnet, the screen and the
   boot for free and in the right order. Pseudo-Z and deliberately so: nothing
   collides against it, nothing falls off it, it only decides how high the sprite
   sits and when the bird has to flap. */
function carTop(x, y, cx, cy, a, hl){
  const u = ((x - cx) * Math.cos(a) + (y - cy) * Math.sin(a)) / Math.max(0.1, hl);
  return 0.78 + 0.62 * Math.exp(-(u * u) / 0.20);
}
function surfaceAt(x, y){
  let top = 0;
  const w = WORLD;
  if (!w) return 0;
  /* Whatever is here, however tall it says it is. A car gets the bonnet-roof-boot
     curve because a car is the one thing with an interesting shape to walk over;
     everything else is flat on top, which for a bollard or a kerb it is. */
  const hit = boxAt(x, y);
  if (hit && sdRect(x, y, hit) <= 0){
    top = (hit.kind === 'car')
      ? carTop(x, y, hit.x, hit.y, hit.a, hit.hl)
      : (hit.top === undefined ? 2.2 : hit.top);
  }
  for (let i = 0; i < CARS.length; i++){            // and the ones still moving
    const c = CARS[i];
    if (c.box.off || sdRect(x, y, c.box) > 0) continue;
    const h = carTop(x, y, c.x, c.y, c.h, c.model.l / 2);
    if (h > top) top = h;
  }
  /* Trolleys. A gull on a trolley handle is the most Dundee thing in here. */
  for (let i = 0; i < MOVERS.length; i++){
    const m = MOVERS[i];
    if (m.held || m.z > 0.4) continue;
    if (sdRect(x, y, m.box) > 0) continue;
    if (1.02 > top) top = 1.02;
  }
  /* Trueno is not in the field, and he is the one they most want to stand on. */
  const dx = x - car.x, dy = y - car.y;
  const lx = dx * Math.cos(car.h) + dy * Math.sin(car.h);
  const ly = -dx * Math.sin(car.h) + dy * Math.cos(car.h);
  if (Math.abs(lx) < (LF + LR) / 2 + 0.6 && Math.abs(ly) < HALF_W){
    const h = carTop(x, y, car.x, car.y, car.h, (LF + LR) / 2 + 0.6);
    if (h > top) top = h;
  }
  return top;
}

/* Walking somewhere, as opposed to walking AT something. The old version was a
   single local step: point at the target, and if something solid is in the way
   slide along its surface. That is fine for crossing an aisle and hopeless for
   crossing the car park, which is why Trolleyboy could not reliably reach a
   customer forty metres away through six rows of parked cars, and why a shopper
   could take a hundred seconds to reach a car thirty metres off.

   Two fixes, and the first is the one that matters:

   1. For anything over sixteen metres, use the ROUTE LATTICE the cars already
      have. Nodes down every aisle, Dijkstra between them, and the walk becomes
      a sequence of short hops that local deflection handles well. Refreshed
      every couple of seconds rather than every tick, because it is Dijkstra.

   2. Commit to a side. Choosing which way to slide round an obstacle fresh on
      every tick lets the choice flip as the geometry shifts under you, and a
      walker that alternates left and right stands still while looking busy.
      Pick a side, keep it for a second, then reconsider. */
function walkTo(b, dt, speed){
  /* Everybody walks faster in the rain, and faster still without an umbrella. */
  if (b.kind !== 'gull' && b.kind !== 'fox' && WX.rain > 0.05){
    const rh = rainHere(b.x, b.y);
    if (rh > 0.05) speed *= 1 + 0.45 * rh * (brollyUp(b) ? 0.5 : 1);
  }
  const dx = b.tx - b.x, dy = b.ty - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 1.1){ b.wp = null; return true; }

  /* Where to head RIGHT NOW: the final target if it is close, otherwise the next
     node on the route to it. */
  let gx = b.tx, gy = b.ty;
  if (d > 16 && RNODE.length){
    const moved = !b.rtGoal ||
                  Math.hypot(b.rtGoal[0] - b.tx, b.rtGoal[1] - b.ty) > 4;
    b.rtT = (b.rtT || 0) - dt;
    if (b.rtT <= 0 || moved || !b.wp){
      b.rtT = 2.5; b.rtGoal = [b.tx, b.ty];
      const a = nearestNode(b.x, b.y), z = nearestNode(b.tx, b.ty);
      const path = (a >= 0 && z >= 0) ? routeTo(a, z) : null;
      b.wp = path ? path.map(function(i){ return [RNODE[i].x, RNODE[i].y]; }) : null;
      /* Start from the node AFTER the nearest one, not from the beginning. A
         fresh route always starts at whichever node she is closest to - that is
         what nearestNode means - so resetting the index to zero every two and a
         half seconds pointed her back at the node she was standing on. She
         walked to it, the route rebuilt, she walked to it again: ten metres of
         progress in three hundred seconds, at a walking speed of half a metre
         a second. Always aim at the next one. */
      b.wi = 0;
      if (b.wp && b.wp.length > 1){
        let ni = 0, nd = 1e9;
        for (let i = 0; i < b.wp.length; i++){
          const dd = Math.hypot(b.wp[i][0] - b.x, b.wp[i][1] - b.y);
          if (dd < nd){ nd = dd; ni = i; }
        }
        b.wi = Math.min(b.wp.length - 1, ni + 1);
      }
    }
    if (b.wp){
      while (b.wi < b.wp.length - 1 &&
             Math.hypot(b.wp[b.wi][0] - b.x, b.wp[b.wi][1] - b.y) < 4.5) b.wi++;
      if (b.wi < b.wp.length){ gx = b.wp[b.wi][0]; gy = b.wp[b.wi][1]; }
    }
  } else b.wp = null;

  const ldx = gx - b.x, ldy = gy - b.y;
  const ld = Math.hypot(ldx, ldy) || 1;
  let ux = ldx / ld, uy = ldy / ld;
  /* The arena is the car park's wall to a CAR. The bus stop and the gate path
     are outside it, and to a pedestrian the edge of the arena was a wall too -
     every bus passenger walked into it and slid along it for ever (46 of them
     after a day, pinned at x 35.9, none ever arriving). A pedestrian outside
     it, or walking to somewhere outside it, ignores it; the boxes still count. */
  const noArena = sdRect(b.x, b.y, WORLD.arena) > -0.6 ||
                  sdRect(b.tx, b.ty, WORLD.arena) > 0;
  /* Inside something solid - a car parked on top of them while they were
     cutting through its empty space, which happens. Walking only ever slides
     ALONG a surface, so from inside one there was no way out at all: Derek
     spent a ticket round shuffling inside a Jazz. Step out to the nearest
     edge first. Gulls stand on cars on purpose and are left alone. */
  if (!b.k.climbs){
    const here = sdfAt(b.x, b.y, noArena);
    if (here < 0.05){
      const n = sdfNormal(b.x, b.y, noArena);
      const out = -here + b.k.r + 0.05;
      b.x += n[0] * out; b.y += n[1] * out;
    }
  }
  let ahead = sdfAt(b.x + ux * 1.1, b.y + uy * 1.1, noArena);
  /* Over, not round. Only cars: a bollard, a kerb or the store is still a thing
     a gull walks round, because it cannot see over any of them. */
  if (ahead < b.k.r + 0.2 && b.k.climbs){
    /* Over if it can be stepped onto, round if it cannot. One test covers cars,
       bollards, kerbs and trolleys on the one side and the shelters, the masts,
       the pavilion, the store and the artic on the other. */
    const hit = boxAt(b.x + ux * 1.1, b.y + uy * 1.1);
    if (hit && (hit.top === undefined ? 2.2 : hit.top) <= CLIMB_MAX) ahead = 9;
  }
  /* People are obstacles to a gull in exactly the same way, and were not in the
     field at all - so gulls walked through shoppers. Too tall to step onto, so
     they get walked round. */
  if (b.k.climbs){
    for (const o of BEINGS){
      if (o === b || beingAbsent(o) || !o.k.solid) continue;
      const px = b.x + ux * 1.1 - o.x, py = b.y + uy * 1.1 - o.y;
      if (px * px + py * py < (o.k.r + b.k.r) * (o.k.r + b.k.r)){
        const n = Math.atan2(b.y - o.y, b.x - o.x);
        ux = Math.cos(n + Math.PI / 2); uy = Math.sin(n + Math.PI / 2);
        break;
      }
    }
  }
  if (ahead < b.k.r + 0.2){
    const n = sdfNormal(b.x + ux * 1.1, b.y + uy * 1.1, noArena);
    const tx = -n[1], ty = n[0];
    /* Committed, not recomputed - see the note above. */
    b.sideT = (b.sideT || 0) - dt;
    if (b.sideT <= 0 || b.side === undefined || b.side === 0){
      b.side = (ux * tx + uy * ty) >= 0 ? 1 : -1;
      b.sideT = 1.1;
    }
    ux = tx * b.side; uy = ty * b.side;
  } else b.sideT = 0;
  /* Facing turns at a rate rather than snapping. Assigning it outright is
     invisible on a shopper ambling across an aisle and very visible the instant
     anything arcs: a gull coming out of a banked turn landed and swung 105
     degrees in one frame, because walkTo simply told it where to point. The
     travel direction is untouched - only the sprite's facing is rate-limited -
     so nothing about where anybody goes changes, it just stops being a
     flick-book. */
  const face = Math.atan2(uy, ux);
  const turn = (b.kind === 'gull' ? 7.0 : 4.5) * dt;
  b.h += Math.max(-turn, Math.min(turn, angDiff(face, b.h)));
  b.x += ux * speed * dt; b.y += uy * speed * dt;
  b.moving = true;
  return false;
}
/* Nobody in a car park walks to a random point in it. They walk to the doors,
   to the trolley pen, or back to their own car - and the first version had
   everybody heading for uniform noise across 176 metres, which at a granny's
   half a metre per second is a four-minute leg. Over two and a half minutes:
   no weather discussed, no trolleys returned, the Manager never went inside.
   Not broken behaviour - nobody ever ARRIVED anywhere, so nothing that happens
   on arrival could happen. Places fix it, and they are also just true. */
const PLACES = { doors:[], pens:[], park:[] };
function buildPlaces(){
  PLACES.doors.length = 0; PLACES.pens.length = 0; PLACES.park.length = 0;
  for (let i = 0; i < 4; i++){
    const q = [X1 - 14 - i * 5, Y0 + WALK_W + PRIME_W + 1.5];
    if (sdfAt(q[0], q[1]) > 0.9) PLACES.doors.push(q);
  }
  PLACES.doors.push([PVX, Y0 + WALK_W + PRIME_W + 1.5]);      // the rotunda
  for (const sh of SHELTERS){
    /* The pen approach has to be somewhere a person can actually stand. Half of
       these sat inside the island kerb. */
    /* Either open end, out in the aisle it faces. */
    for (const e of [[0, 1], [0, -1], [1.2, 1], [-1.2, -1]]){
      const q = [sh[0] + e[0], sh[1] + e[1] * (SHL / 2 + 1.6)];
      if (sdfAt(q[0], q[1]) > 0.9){ PLACES.pens.push(q); break; }
    }
  }
  for (const y of ROWY)
    for (let x = X0 + 14; x < X1 - 10; x += 26)
      if (sdfAt(x, y) > 0.9) PLACES.park.push([x, y]);
}
function nearestPlace(list, x, y){
  let best = null, bd = Infinity;
  for (const q of list){
    const d = Math.hypot(q[0] - x, q[1] - y);
    if (d < bd){ bd = d; best = q; }
  }
  return best || [x, y];
}
function pickPlace(list){
  return list.length ? list[Math.floor(RND.beings() * list.length)] : null;
}
function goTo(b, q, jitter){
  if (!q) return;
  const j = jitter === undefined ? 2.5 : jitter;
  b.tx = q[0] + (RND.beings() - 0.5) * j;
  b.ty = q[1] + (RND.beings() - 0.5) * j;
}
function wanderTarget(b, pad){
  /* Shoppers and grannies alternate between the doors and where they parked,
     which is what a car park is FOR, and it is why they keep crossing paths. */
  b.leg = !b.leg;
  goTo(b, b.leg ? pickPlace(PLACES.doors) : (b.home || pickPlace(PLACES.park)), 3);
  void pad;
}

/* How frightened should a being be of the car? Distance and closing speed, so a
   parked Trueno is furniture and a moving one is a threat. */
/* Somebody about to be run over by a Honda Jazz minds as much as somebody
   about to be run over by Trueno, and the NPC cars creep for people - so if
   people do not also step aside, an aisle with a pram in it jams for good. */
function stepAsideForCars(b, dt){
  for (const c of CARS){
    const dx = b.x - c.x, dy = b.y - c.y;
    const dist = Math.hypot(dx, dy);
    /* The deadlock this condition used to cause, and it is a good one. A car
       creeps rather than stopping for people - correct - and stops dead only
       when somebody is practically on the bonnet. A person steps aside for a car
       - also correct - but ONLY if the car is moving. So a shopper standing a
       metre off a stopped car's nose held it there, and the car being stopped was
       the reason the shopper never moved. Each was waiting for the other and
       neither was wrong.
       Nobody loiters pressed against a car's bumper, though. Within two and a
       half metres they shift whether it is moving or not, which breaks the cycle
       at the only point where breaking it is also true to life. */
    const tooClose = dist < 2.6;
    if (dist > 7 || (Math.abs(c.spd) < 0.2 && !tooClose)) continue;
    const al = (dx * Math.cos(c.h) + dy * Math.sin(c.h)) * (c.spd < 0 ? -1 : 1);
    if (al < -1) continue;                     // already behind it
    const away = Math.atan2(dy, dx);
    const push = (tooClose ? 1.0 : (7 - dist) / 7) * b.k.speed * 1.6 * dt;
    b.x += Math.cos(away) * push; b.y += Math.sin(away) * push;
    b.h = away;
    b.moving = true;
  }
}
function carThreat(b){
  const dx = car.x - b.x, dy = car.y - b.y;
  const d = Math.hypot(dx, dy);
  const sp = Math.hypot(car.vx, car.vy);
  if (d > 22 || sp < 1.5) return 0;
  const closing = -((dx * (car.vx * Math.cos(car.h) - car.vy * Math.sin(car.h)) +
                     dy * (car.vx * Math.sin(car.h) + car.vy * Math.cos(car.h))) / d);
  return closing > 0 ? Math.min(1, (22 - d) / 22) * Math.min(1, closing / 6) : 0;
}

/* The same lesson §6.4 taught the car, learned again by the people. walkTo
   slides along anything solid rather than stopping, which is right - but with
   nothing watching for progress it slides along the SAME obstacle for ever. The
   trolleyboy spent ninety seconds pressed against a shelter two metres from the
   pen, and the Manager never once reached the doors. Neither was stopped; both
   were moving the whole time. Low speed is not the test, and it never was. */
function trackWalk(b, dt){
  b.pT = (b.pT || 0) + dt;
  if (b.pT < 2.0) return false;
  const moved = Math.hypot(b.x - (b.pX || 0), b.y - (b.pY || 0));
  b.pX = b.x; b.pY = b.y; b.pT = 0;
  if (moved > 1.2){ b.stuckT = 0; return false; }
  b.stuckT = (b.stuckT || 0) + 2.0;
  return b.stuckT >= 4.0;
}
function stepBeing(b, dt){
  b.t += dt;
  b.anim += dt;
  b.moving = false;
  /* Held: the hand is doing the moving and the flailing. */
  if (b.held){ b.state = poseOr(b, b.kind === 'gull' ? 'wings-out' : b.look); return; }
  if (b.bumped > 0) b.bumped -= dt;
  if (trackWalk(b, dt)){
    /* Give up on wherever that was. A dropped trolley left where it is is more
       true to life than a man welded to a shelter. */
    b.stuckT = 0;
    if (b.carry){ b.carry.held = false; b.carry = null; }
    b.hold = 0;
    wanderTarget(b, 6);
  }
  if (b.inStore){
    b.hold -= dt;
    if (b.hold <= 0){
      b.inStore = false;
      const dr = nearestPlace(PLACES.doors, X1 - 20, ROWY[0]);
      b.x = dr[0]; b.y = dr[1] + 1.2;        // and back out of the same doors
    }
    return;
  }
  const f = BEHAVE[b.kind];
  if (f) f(b, dt);
  /* Nothing shoves something that is three metres above it. */
  if (CARS.length && !b.held && b.z < 0.9) stepAsideForCars(b, dt);
  /* The pseudo-Z, eased rather than snapped - a snap would teleport the sprite a
     metre up the instant a toe crossed the bumper. gz is kept SEPARATE from z so
     that every existing test of z still means 'how far off its own ground am I',
     which is what the take-off and landing code is asking.
     And a flap while it changes: a gull getting onto a bonnet does not step up
     like a man climbing a stile, it half-opens its wings and hops, and the same
     coming down. Half a second of 'wings-out' is the whole gesture. */
  if (b.k.climbs){
    /* Same reasoning: a gull walks at a metre and a half a second, so asking
       what it is standing on ten times a second is far more often than it can
       possibly matter. Fourteen gulls at sixteen microseconds each was a fifth
       of the whole being budget. */
    b.surfT = (b.surfT || 0) - dt;
    if (b.surfT <= 0 || b.surfZ === undefined){
      b.surfZ = surfaceAt(b.x, b.y);
      b.surfT = 0.1;
    }
    const want = b.surfZ;
    const gz = b.gz || 0;
    const d = want - gz;
    if (Math.abs(d) > 0.06){
      b.gz = gz + Math.max(-2.6 * dt, Math.min(2.6 * dt, d));
      b.flap = 0.45;
    } else {
      b.gz = want;
    }
    if ((b.flap || 0) > 0){
      b.flap -= dt;
      if (b.z <= 0.02) b.state = poseOr(b, 'wings-out');
    }
  }
  /* Airborne things fall back to the tarmac - and TRAVEL while they do it. The
     height was integrated here all along and the horizontal throw was not, so
     anything launched by the hand went straight up and straight back down. The
     trolleys are the model for this: the thing that makes picking one up
     satisfying is that a flick of the mouse sends it across the car park, and
     there was no reason that should be true only of trolleys. */
  if (b.z > 0 || b.vz !== 0){
    b.vz -= (b.kind === 'gull' ? 3.2 : GRAV) * dt;
    b.z += b.vz * dt;
    b.x += (b.vx || 0) * dt;
    b.y += (b.vy || 0) * dt;
    const drag = b.kind === 'gull' ? 0.6 : 1.4;      // a bird glides, a granny does not
    b.vx = (b.vx || 0) * Math.max(0, 1 - drag * dt);
    b.vy = (b.vy || 0) * Math.max(0, 1 - drag * dt);
    if (b.z <= 0){
      b.z = 0; b.vz = 0;
      /* Skitters on landing rather than stopping dead, then stops. */
      b.vx = (b.vx || 0) * 0.3; b.vy = (b.vy || 0) * 0.3;
      if (Math.hypot(b.vx, b.vy) < 0.25){ b.vx = 0; b.vy = 0; }
    }
  }
  b.x = Math.max(X0 + 1, Math.min(X1 + 3, b.x));
  b.y = Math.max(Y0 + 1, Math.min(Y1 - 1, b.y));
}

const BEHAVE = {
  /* The real menace. Eats rubber off the asphalt and whatever the shoppers drop,
     and takes off the moment a car means it. */
  gull: function(b, dt){
    const threat = carThreat(b);
    if (threat > 0.25 && b.z < 0.2){
      b.state = poseOr(b, 'wings-out'); b.vz = 3.4;
      const away = Math.atan2(b.y - car.y, b.x - car.x);
      b.tx = b.x + Math.cos(away) * 14; b.ty = b.y + Math.sin(away) * 14;
      b.hold = 2.2;
    }
    if (b.z > 0.2 || b.hold > 0){
      b.hold -= dt; b.state = poseOr(b, 'wings-out');
      /* A gull in the air does not go anywhere in a straight line, and it used
         to: `walkTo` at seven metres a second, which is a bird on rails.
         It BANKS. Heading comes from a turn rate that persists, so the path is
         always an arc, and the turn rate is three things added together:

           what it wants   a gentle pull toward wherever it was heading
           what it sees    toward food, away from anything with an engine
           its own fancy   a new whim every second or two, which is most of it

         The whim term is deliberately the largest. A gull's flight path is not
         a plan being executed, it is a series of opinions, and the only reason
         this reads as a seagull rather than as a badly-tuned car is that a bird
         has flight feathers and is allowed to turn like that. The same arcing
         descent looked absurd on a dropped Honda Jazz, which is how this came
         up in the first place. */
      const aim = angDiff(Math.atan2(b.ty - b.y, b.tx - b.x), b.h);

      b.whimT = (b.whimT || 0) - dt;
      if (b.whimT <= 0){
        b.whimT = 1.1 + RND.beings() * 2.4;
        b.whim = (RND.beings() - 0.5) * 1.15;
      }

      /* What it sees. Rubber on the tarmac is food and worth a look; Trueno is
         the reason it is up here in the first place. */
      let see = 0;
      if (RUB.length){
        const r = RUB[(b.cid.length * 7 + Math.floor(b.t)) % RUB.length];
        if (r){
          const d = Math.hypot(r[0] - b.x, r[1] - b.y);
          if (d > 3 && d < 55)
            see += angDiff(Math.atan2(r[1] - b.y, r[0] - b.x), b.h) * 0.30;
        }
      }
      const cd = Math.hypot(car.x - b.x, car.y - b.y);
      if (cd < 26){
        const toCar = angDiff(Math.atan2(car.y - b.y, car.x - b.x), b.h);
        see -= Math.sign(toCar || 1) * (1 - cd / 26) * 0.9;
      }

      const wantRate = 0.30 * aim + (b.whim || 0) + see;
      b.bank = (b.bank || 0) + (wantRate - (b.bank || 0)) * Math.min(1, dt * 2.2);
      b.bank = Math.max(-1.25, Math.min(1.25, b.bank));
      /* On the ground it is running rather than flying, so the same impulse
         produces a much tighter, scrappier curve. */
      const air = b.z > 0.2;
      b.h += b.bank * dt * (air ? 1 : 1.8);
      const sp = air ? 7.4 : 2.6;
      b.x += Math.cos(b.h) * sp * dt;
      b.y += Math.sin(b.h) * sp * dt;
      b.moving = true;
      /* And it leans into it. One number, and the renderer tilts the sprite's
         boxes about its own long axis, which is enough to read as a wing down. */
      b.roll = air ? b.bank * 0.55 : 0;

      if (b.hold <= 0 && b.z <= 0.01){
        b.state = poseOr(b, 'loaf');
        b.bank = 0; b.roll = 0;
      }
      return;
    }
    /* Rubber is food. Finding it is why RUB has always been kept in world
       coordinates rather than painted straight onto the canvas. */
    if (b.hold <= 0 && RUB.length && (b.t % 1) < dt){
      let bd = 26, bi = -1;
      for (let i = RUB.length - 1; i >= 0 && i > RUB.length - 240; i--){
        const r = RUB[i];
        /* RUB is shared mutable state that several gulls read and write, the
           weather deletes from and the test rig swaps wholesale. A missing
           entry should cost this gull its lunch, not the frame loop. */
        if (!r) continue;
        const d = Math.hypot(r[0] - b.x, r[1] - b.y);
        if (d < bd){ bd = d; bi = i; }
      }
      if (bi >= 0 && RUB[bi]){ b.tx = RUB[bi][0]; b.ty = RUB[bi][1]; b.rubI = bi; }
      else if (RND.beings() < 0.3) wanderTarget(b, 6);
    }
    const there = walkTo(b, dt, b.k.speed * (0.5 + 0.5 * Math.sin(b.anim * 3) ** 2));
    if (there){
      b.state = poseOr(b, b.fed > 6 ? 'overfed' : 'alert');
      if (b.rubI !== undefined && b.rubI < RUB.length){
        RUB.splice(b.rubI, 1); b.rubI = undefined; b.fed++;   // pecked up
      }
      if (RND.beings() < 0.02) wanderTarget(b, 6);
    } else b.state = poseOr(b, 'loaf');
  },

  /* Night shift. Same scavenging niche, but solitary, ground-bound, and it wants
     nothing to do with anybody. */
  fox: function(b, dt){
    if (!isNight()){ b.hold = 0; b.state = poseOr(b, 'trot');
      b.tx = X0 + 4; b.ty = Y1 - 2; walkTo(b, dt, 3.2); return; }
    const p = beingNear(b, ['granny', 'shopper', 'trolleyboy', 'manager'], 14);
    if (p || carThreat(b) > 0.15){
      const ax = p ? p.x : car.x, ay = p ? p.y : car.y;
      const away = Math.atan2(b.y - ay, b.x - ax);
      b.tx = b.x + Math.cos(away) * 20; b.ty = b.y + Math.sin(away) * 20;
      b.state = poseOr(b, 'trot'); walkTo(b, dt, 4.4); return;
    }
    if (b.hold > 0){ b.hold -= dt; b.state = poseOr(b, 'sniff'); return; }
    if (walkTo(b, dt, b.k.speed)){
      b.state = poseOr(b, 'sniff'); b.hold = 1.5 + RND.beings() * 3;
      wanderTarget(b, 5);
    } else b.state = poseOr(b, Math.sin(b.anim * 2) > 0.9 ? 'alert' : 'trot');
  },

  /* They survived wars. They are in no hurry, they do not see the gulls, and it
     has not occurred to them that the aisle is for cars. */
  granny: function(b, dt){
    if (b.hold > 0){ b.hold -= dt; b.state = b.look; return; }
    const other = beingNear(b, ['granny'], 6.5);
    if (other && !other.chatted && !b.chatted){
      b.chatted = other.chatted = true;
      b.hold = other.hold = 14 + RND.beings() * 16;      // the weather
      b.state = b.look; other.state = other.look;
      b.h = Math.atan2(other.y - b.y, other.x - b.x);
      other.h = b.h + Math.PI;
      return;
    }
    if (!other) b.chatted = false;
    /* A granny who can see another granny at any distance is already, slowly,
       on her way over. This is the congregation mechanism: without a little
       attraction, five of them in a 176 m car park essentially never meet. */
    const far = beingNear(b, ['granny'], 40);
    if (far && !b.chatted && RND.beings() < 0.02){ b.tx = far.x; b.ty = far.y; }
    if (walkTo(b, dt, b.k.speed)){
      b.hold = 3 + RND.beings() * 8;
      wanderTarget(b, 8);
    } else b.state = b.look;
  },

  /* In a rush, and it shows. */
  shopper: function(b, dt){
    if (walkTo(b, dt, b.k.speed)) wanderTarget(b, 6);
    else b.state = b.look;
  },

  /* Underpaid. Collects the strays, smokes, feeds the gulls, and keeps half an
     eye out for the Manager. */
  trolleyboy: function(b, dt){
    /* A job from the Manager outranks the trolleys, and he is glad of it. */
    if (b.job) b.hold = 0;
    if (b.job){
      const job = b.job;
      if (HELP.indexOf(job) < 0 || beingAbsent(job.who)){ b.job = null; }
      else {
        if (b.carry){ b.carry.held = false; b.carry = null; }
        job.age += dt;
        if (!job.bay) job.bay = senseCar(job);
        if (!job.bay || job.age > 260){
          /* Even his sixth sense has limits. */
          job.who.guide = null; job.who.life = 'toExit';
          HELP.splice(HELP.indexOf(job), 1); b.job = null;
        } else if (job.stage === 'delegated'){
          /* Collect the customer first - you do not shout directions across a
             car park, you walk them over. TIME-BOXED, though: people walk by
             local deflection rather than by following a route, so a long haul
             across six rows of parked cars can have him sliding round the same
             row indefinitely. Forty seconds of trying, and then he gets on with
             the half of the job that matters - going to the car - and she falls
             in behind him when he passes. The nice version happens whenever he
             is anywhere nearby, which is most of the time. */
          b.tx = job.who.x; b.ty = job.who.y;
          b.state = b.look;
          if (Math.hypot(job.who.x - b.x, job.who.y - b.y) < 2.6 || job.age > 40){
            job.stage = 'guiding';
            job.who.guide = b;
          } else walkTo(b, dt, b.k.speed * 1.2);
          return;
        } else {
          const st = bayStand(job.bay);
          b.tx = st[0]; b.ty = st[1];
          b.state = b.look;
          const bx = WORLD.boxes[job.bay.box];
          const there = bx && Math.hypot(bx.x - b.x, bx.y - b.y) < 3.2;
          if (there){
            /* There it is. */
            job.who.ownBay = job.bay;
            job.who.parkedAt = bayStand(job.bay);
            job.who.guide = null;
            job.who.life = 'toCar';
            HELP.splice(HELP.indexOf(job), 1);
            b.job = null;
          } else walkTo(b, dt, b.k.speed * 1.1);
          return;
        }
      }
    }
    const boss = beingNear(b, ['manager'], 26);
    if (b.hold > 0 && !boss){ b.hold -= dt; b.state = poseOr(b, 'smoking'); return; }
    if (boss) b.hold = 0;
    if (b.carry){
      const pen = nearestPlace(PLACES.pens, b.x, b.y);
      b.tx = pen[0]; b.ty = pen[1];
      if (walkTo(b, dt, b.k.speed * 0.8)){ b.carry.held = false; b.carry = null; }
      else {
        b.state = b.look;
        const ch = Math.cos(b.h), sh2 = Math.sin(b.h);
        b.carry.x = b.x + ch * 1.3; b.carry.y = b.y + sh2 * 1.3;
        b.carry.h = b.h; b.carry.tipped = false; b.carry.vx = 0; b.carry.vy = 0;
        syncBox(b.carry);
      }
      return;
    }
    let best = null, bd = 90;
    for (const m of MOVERS){
      if (m.held) continue;
      let nearPen = false;
      for (const sh of SHELTERS)
        if (Math.hypot(m.x - sh[0], m.y - sh[1]) < SHL) nearPen = true;
      if (nearPen) continue;
      const d = Math.hypot(m.x - b.x, m.y - b.y);
      if (d < bd){ bd = d; best = m; }
    }
    if (!best){ b.hold = 8 + RND.beings() * 14; b.state = poseOr(b, 'smoking'); return; }
    b.tx = best.x; b.ty = best.y;
    if (walkTo(b, dt, b.k.speed)){ b.carry = best; best.held = true; }
    else b.state = b.look;
  },

  /* Despises almost everything. The gulls most of all, and Trueno a close
     second. Vanishes into the store, which is after all his domain. And when a
     customer asks him where their car has gone, he finds the boy. */
  manager: function(b, dt){

    if (b.hold > 0){ b.hold -= dt; b.state = b.look; return; }
    /* The ticket round, before the gulls and before the door: an abandoned car
       is the one thing on the car park that is officially his problem. Walk
       out to it, stand there writing for a couple of seconds, stick it on. */
    const tb = (b.ticketBay && b.ticketBay.car && b.ticketBay.abandonedAt !== undefined)
             ? b.ticketBay : ticketDue(b);
    b.ticketBay = tb || null;
    if (tb){
      tb.ticketBy = b;
      const st = bayStand(tb), bx = WORLD.boxes[tb.box];
      b.tx = st[0]; b.ty = st[1]; b.state = b.look;
      const near = bx && Math.hypot(bx.x - b.x, bx.y - b.y) < 3.6;
      if (near || walkTo(b, dt, b.k.speed)){
        if (near){
          tb.tickets = (tb.tickets || 0) + 1;
          tb.ticketBy = null; b.ticketBay = null;
          b.ticketed = simClockNow();
          b.hold = 2.5;                       // writing it out
          CENSUS.ev.tickets = (CENSUS.ev.tickets || 0) + 1;
          if (typeof exciteAt === 'function') exciteAt(tb.x, tb.y, 2.0);
        }
      }
      return;
    }
    /* His shift. With fourteen gulls about he always had one inside thirteen
       metres, so he was permanently mid-grievance and never once got as far as
       the door - which is funny for a minute and then he is just a man
       vibrating at a seagull. The grudge gets a cooldown and the shift gets a
       clock. */
    b.shift = (b.shift || 0) + dt;
    b.grudge = Math.max(0, (b.grudge || 0) - dt);
    if (b.shift > 55 + RND.beings() * 40){
      /* He goes in through the DOORS, like a person. Vanishing from the middle
         of the car park was the only popping left in here once the shifts
         started using the entrance. */
      const dr = nearestPlace(PLACES.doors, b.x, b.y);
      b.tx = dr[0]; b.ty = dr[1]; b.state = b.look;
      if (walkTo(b, dt, b.k.speed * 1.2)){
        b.shift = 0; b.inStore = true; b.hold = 14 + RND.beings() * 26;
      }
      return;
    }
    const gull = b.grudge > 0 ? null : beingNear(b, ['gull'], 13);
    if (gull){
      b.tx = gull.x; b.ty = gull.y;
      b.state = b.look;
      if (walkTo(b, dt, b.k.speed * 1.5)){
        gull.vz = 4.0; gull.state = poseOr(gull, 'wings-out'); gull.hold = 2.5;
        b.grudge = 7 + RND.beings() * 9;     // briefly satisfied
      }
      return;
    }
    if (walkTo(b, dt, b.k.speed)){
      if (RND.beings() < 0.35 &&
          Math.hypot(b.x - nearestPlace(PLACES.doors, b.x, b.y)[0],
                     b.y - nearestPlace(PLACES.doors, b.x, b.y)[1]) < 6){
        b.inStore = true; b.hold = 12 + RND.beings() * 30;   // in at the doors
      } else {
        b.hold = 2 + RND.beings() * 5;
        /* He does not roam. He works the frontage and the pens, which is where
           the gulls and the trolleys are, and therefore where the grievances
           are. */
        goTo(b, RND.beings() < 0.5 ? pickPlace(PLACES.doors)
                                    : pickPlace(PLACES.pens), 6);
      }
    } else b.state = b.look;
  }
};

/* The way in and out. Every arrival and departure uses it, because a car park
   where people blink into existence is a screensaver rather than a place. */
/* The CAR entrance, on the railway side. The real one is where the access road
   from the mini-roundabout by the Seabraes footbridge runs into the car park
   along the railway (checked on the aerial photo, 2026-10-12) - not the end of
   the prime aisle, where it was. Pedestrians and the bus keep gateSpot below:
   they come up from Riverside Drive. */
const CAR_GATE = [X0 + 1.5, 0];
function carGate(){
  CAR_GATE[1] = Y1 - ROAD_W / 2;
  return CAR_GATE;
}
const GATE = [X0 + 3, 0];
function gateSpot(){
  GATE[1] = Y0 + WALK_W + PRIME_W + PAISLE / 2;
  return GATE;
}

/* onShift is now a WISH rather than a switch. A being whose hours have ended
   walks to the entrance and leaves through it; one whose hours have started
   walks in through it. Nobody is ever added to or removed from the car park
   anywhere else, and the changeover trickles - each being independently decides
   to head off within a minute or so of its time, rather than the whole shift
   turning on its heel at once. */
let DAY_N = 0;
/* Beings that are finished with leave the array. Marking them 'away' and
   leaving them in it is how 194 shoppers accumulated: invisible ones still cost
   nothing to draw, but every one of them is still walked by beingNear, which is
   O(n^2) over the whole cast. */
function reapBeings(){
  for (let i = HELP.length - 1; i >= 0; i--){
    const j = HELP[i];
    if (j.who.gone || !BEINGS.includes(j.who)) HELP.splice(i, 1);
  }
  for (let i = BEINGS.length - 1; i >= 0; i--){
    const b = BEINGS[i];
    if (b.gone || (b.away && b.spawned && b.life === null &&
                   b.ownBay === null && b.kind === 'shopper')){
      censusBeingOut(b); BEINGS.splice(i, 1);
    }
  }
}
/* The radio call, and it lives OUTSIDE the Manager's behaviour on purpose. Put
   inside it, the delegation only happened on ticks where he was being simulated
   as a walking character - and he spends a good part of the day inside the shop,
   where beingAbsent is true and his behaviour never runs at all. So a lost
   granny stood at the doors with her job stuck on 'asked' for two and a half
   minutes and then gave up, because the man with the handset was in the
   warehouse. A radio that only works when you can see him is not a radio. */
function stepHelp(dt){
  if (!HELP.length) return;
  const job = HELP[0];
  if (job.stage !== 'asked') return;
  const mgr = liveBeing('manager') ||
              BEINGS.find(function(o){ return o.kind === 'manager' && !o.away; });
  if (!mgr) return;                       // nobody on duty to ask
  job.radioT = (job.radioT || 0) + dt;
  if (job.radioT < 2.0) return;           // holding it up to his ear
  const tb = liveBeing('trolleyboy') ||
             BEINGS.find(function(o){ return o.kind === 'trolleyboy' && !o.away; });
  if (tb){
    tb.inStore = false;                   // out you come
    job.stage = 'delegated';
    tb.job = job;
  } else if (!beingAbsent(mgr)){
    /* Nobody to pass it to, so he deals with it himself, which he resents more
       than the gulls. */
    job.guide = mgr; job.stage = 'guiding';
    job.bay = job.bay || senseCar(job);
    job.who.guide = mgr;
  }
}

function stepBeings(dt){
  const was = TOD;
  /* Only the CLOCK speeds up, never the physics - the point is to reach dusk
     sooner, not to watch a car park on fast forward. */
  TOD = (TOD + dt * (typeof fastDay !== 'undefined' && fastDay ? 20 : 1) / DAY_SECS) % 1;
  if (TOD < was){
    /* A new day. Re-roll everybody, so today is not yesterday. */
    DAY_N++;
    for (const b of BEINGS) b.jitter = (RND.beings() - 0.5) * 0.10;
  }
  for (const b of BEINGS){
    if (b.abyss || (!b.held && b.z > 0 && (inVoid(b.x, b.y) || inTay(b.x, b.y)))){
      beingFall(b, dt); continue;
    }
    /* Just been soaked, or just watched their umbrella leave: they stop, and
       they LOOK at it, for a second or two. */
    if (b.stareT > 0 && !b.held && !beingAbsent(b)){
      b.stareT -= dt;
      b.h = Math.atan2(b.stareAt[1] - b.y, b.stareAt[0] - b.x);
      b.moving = false; b.state = b.look;
      continue;
    }
    const want = onShift(b);
    const g = gateSpot();

    /* ================================================== a whole visit =====
       The arrival mode is DATA, not a branch: 'car', 'foot', and whatever comes
       next - a bus would be twelve people with arrivedBy 'bus' and the identical
       life from the doors onwards. */
    if (b.life){
      /* --- walking in from the entrance */
      if (b.life === 'arriving'){
        b.tx = g[0] + 6; b.ty = g[1];
        b.state = b.look;
        if (walkTo(b, dt, b.k.speed)) b.life = 'toDoors';
        continue;
      }
      /* --- across the car park to the doors */
      if (b.life === 'toDoors'){
        const dr = nearestPlace(PLACES.doors, b.x, b.y);
        b.tx = dr[0]; b.ty = dr[1];
        b.state = b.look;
        /* One step per tick: walkTo MOVES the being, so it is called once. */
        const atDoor = walkTo(b, dt, b.k.speed);
        if (atDoor && b.toWork){
          /* Staff go in to WORK: off the map until their shift ends, with
             the car left where it is. */
          b.gone = true;
          continue;
        }
        if (atDoor){
          b.inStore = true;
          /* A Tesco shop is a few minutes to the best part of an hour. */
          b.shopT = 90 + RND.beings() * 900;
          b.life = 'inStore';
        }
        continue;
      }
      /* --- in there, for a while */
      if (b.life === 'inStore'){
        b.shopT -= dt;
        if (b.shopT <= 0){ b.inStore = false; b.life = 'outDoors'; }
        continue;
      }
      /* --- out again, and the one decision that matters: car or feet */
      if (b.life === 'outDoors'){
        const dr = nearestPlace(PLACES.doors, b.x, b.y);
        b.x = dr[0]; b.y = dr[1] + 1.2;
        b.life = (b.arrivedBy === 'car' && b.parkedAt) ? 'toCar' : 'toExit';
        /* Now and then a granny who drove here comes out, sees the bus, and
           goes home on it - the car entirely forgotten. It becomes one of the
           abandoned, and gets the tickets and the truck in due course. */
        if (b.life === 'toCar' && b.kind === 'granny' && !CENSUS.mute &&
            RND.beings() < GRANNY_FORGET){
          b.life = 'toExit'; b.forgot = true;
          CENSUS.ev.forgot = (CENSUS.ev.forgot || 0) + 1;
          censusNote('forgot her car', b.name);
        }
        continue;
      }
      /* --- back to where they left it */
      if (b.life === 'toCar'){
        const bay = b.ownBay;
        const bbx = (bay && bay.car) ? WORLD.boxes[bay.box] : null;
        /* NEAR CONTACT is what gets you in, not arriving at a particular square
           of tarmac. Aiming at an exact spot meant the spot had to be both
           reachable and still correct, and it was neither once a car had been
           nudged or set down slightly askew. Getting within a couple of metres
           of your own car is the actual condition for getting into it. */
        /* 3.6, not 2.6: bayStand puts the spot 2.3 m out from the car's centre
           and walkTo calls anywhere within 1.1 m of it arrived, so at 2.6 a
           driver could stand at their own bumper for ever. The census found 53
           of them doing exactly that; the invented drivers, spawned right
           beside the car, had been hiding it. */
        if (bbx && Math.hypot(bbx.x - b.x, bbx.y - b.y) < 3.6){
          b.moving = false;
          if (roomToLeave()){ beginDeparture(bay); b.gone = true; }
          /* No room on the aisle yet: wait by the car, which is what you do. */
          continue;
        }
        /* Head for where it is if it is still there - following it if it has
           shifted - and for where they LEFT it if it is not. */
        const aim = bbx ? bayStand(bay) : b.parkedAt;
        b.tx = aim[0]; b.ty = aim[1];
        b.state = b.look;
        if (walkTo(b, dt, b.k.speed * 1.1)){
          if (bbx){
            /* Reached the spot but still not within reach of the car: let the
               proximity test above settle it next tick. */
          } else {
            /* It is not there. This used to be one line - clear the bay, set
               leaving, walk out of the car park - and a shrug is the one reaction
               nobody actually has. */
            b.life = 'muddled';
            b.muddleT = 3 + RND.beings() * 3.5;
            b.ownBay = null;
          }
        }
        continue;
      }
      /* --- standing where the car was, turning round slowly */
      if (b.life === 'muddled'){
        b.muddleT -= dt;
        b.h += dt * 1.1;                      // looking about
        b.state = b.look;
        b.moving = false;
        if (b.muddleT <= 0 && b.towed){
          /* No search: there is only one reason a car goes from a space while
             its owner is three hours over in town. Off home, on foot or bus. */
          b.life = 'toExit';
          CENSUS.ev.towedOwners = (CENSUS.ev.towedOwners || 0) + 1;
          continue;
        }
        if (b.muddleT <= 0){
          b.life = 'hunting';
          b.huntT = 60 + RND.beings() * 40;
          b.huntRing = 0;
          b.huntPicked = false;
        }
        continue;
      }
      /* --- off looking for it, in widening rings */
      if (b.life === 'hunting'){
        b.huntT -= dt;
        b.state = b.look;
        if (b.huntT <= 0){ b.life = 'seekHelp'; continue; }
        /* Pick somewhere to look BEFORE looking. Starting the hunt with the
           target set to her own feet meant walkTo returned true on the first
           tick and she 'searched' the spot she was already standing on - which
           is the one place she knew it wasn't. */
        if (!b.huntPicked){
          b.huntPicked = true;
          b.huntRing = 1;
          b.tx = b.x + (RND.beings() - 0.5) * 14;
          b.ty = b.y + (RND.beings() - 0.5) * 10;
          continue;
        }
        if (walkTo(b, dt, b.k.speed * 1.15)){
          /* Arrived at a space. Is this it? Matched on the model only, because
             that is all anybody has to go on in a car park - which means they
             will cheerfully drive off in a stranger's identical Jazz, and that
             is correct of them. */
          /* Her OWN car, identified by the tag it carries around with it, not
             by being the right shape. You recognise your own car at three metres
             and you do not recognise somebody else's at any distance. */
          let found = null;
          for (const bay of BAYS){
            if (!bay.car || bay.leaving) continue;
            if (bay.ownerCid !== b.cid) continue;
            const bx = WORLD.boxes[bay.box];
            if (!bx || Math.hypot(bx.x - b.x, bx.y - b.y) > 3.4) continue;
            found = bay; break;
          }
          if (found){
            b.ownBay = found;
            b.parkedAt = bayStand(found);
            b.life = 'toCar';
            continue;
          }
          /* Not here either. Try another space, a little further out each time. */
          b.huntRing = Math.min(5, (b.huntRing || 0) + 1);
          const rad = 6 + b.huntRing * 7;
          let best = null, bd = 1e9;
          for (const bay of BAYS){
            if (!bay.car) continue;
            const bx = WORLD.boxes[bay.box];
            if (!bx) continue;
            const d = Math.hypot(bx.x - b.x, bx.y - b.y);
            if (d < 3.5 || d > rad) continue;
            const sc = d + RND.beings() * 12;
            if (sc < bd){ bd = sc; best = bx; }
          }
          if (best){ b.tx = best.x; b.ty = best.y; }
          else { b.life = 'seekHelp'; }
        }
        continue;
      }
      /* --- going to find somebody who works here */
      if (b.life === 'seekHelp'){
        /* To the DOORS, not after the Manager. Walking to wherever he currently
           is looked sensible and is hopeless: he moves at 1.45 m/s and a granny
           does 0.5, so she pursued him round the car park indefinitely and never
           got within asking distance. You do not chase a manager, you go to the
           front of the shop and find one - and if he happens to be standing
           right there on the way, so much the better. */
        const dr = nearestPlace(PLACES.doors, b.x, b.y);
        const mgr = liveBeing('manager');
        b.tx = dr[0]; b.ty = dr[1] + 2;
        b.state = b.look;
        const toHand = mgr && Math.hypot(mgr.x - b.x, mgr.y - b.y) < 3.2;
        const arrived = walkTo(b, dt, b.k.speed);
        if (toHand || arrived){
          if (!helpJobFor(b) && HELP.length < 1){
            HELP.push({ who:b, stage:'asked', guide:null, bay:null, age:0 });
            b.life = 'waitHelp'; b.huntT = 260;
          }
          /* If somebody else is already being dealt with, she waits here. */
          b.moving = false;
        }
        continue;
      }
      /* --- standing with a member of staff, being dealt with */
      if (b.life === 'waitHelp'){
        b.huntT -= dt;
        b.moving = false;
        b.state = b.look;
        if (b.guide){ b.life = 'following'; continue; }
        if (b.huntT <= 0){
          const j = helpJobFor(b);
          if (j) HELP.splice(HELP.indexOf(j), 1);
          b.life = 'toExit';
        }
        continue;
      }
      /* --- walking after Trolleyboy, who knows where it is */
      if (b.life === 'following'){
        const gd = b.guide;
        if (!gd || beingAbsent(gd)){ b.guide = null; b.life = 'seekHelp'; continue; }
        const d = Math.hypot(gd.x - b.x, gd.y - b.y);
        b.state = b.look;
        if (d > 2.4){ b.tx = gd.x; b.ty = gd.y; walkTo(b, dt, b.k.speed * 1.15); }
        else b.moving = false;
        continue;
      }
      /* --- off into town, leaving the car where it is. The visit stays OPEN:
         they are off the map, not gone, and they will be back for it. */
      if (b.life === 'toTown'){
        b.tx = g[0] - 2; b.ty = g[1];
        b.state = b.look;
        if (walkTo(b, dt, b.k.speed) || b.x < X0 + 4){ b.gone = true; b.toTown = true; }
        continue;
      }
      /* --- out through the entrance on foot, car or no car */
      if (b.life === 'toExit'){
        /* If there is a bus in, they get on it. Nobody walks past a bus they
           could be on, and it closes the loop: the same vehicle that brought
           eight people in takes six different ones away. */
        if (busBoarding()){
          const d = busDoor();
          b.tx = d[0]; b.ty = d[1];
          b.state = b.look;
          if (walkTo(b, dt, b.k.speed * 1.1) ||
              Math.hypot(d[0] - b.x, d[1] - b.y) < 2.2){
            b.gone = true;
          }
          continue;
        }
        b.tx = g[0] - 2; b.ty = g[1];
        b.state = b.look;
        if (walkTo(b, dt, b.k.speed * 1.05) || b.x < X0 + 4){
          b.gone = true;
        }
        continue;
      }
    }

    /* Somebody sent to fetch their car goes NOW. This used to sit inside the
       leaving branch, which only runs once a being is off shift - so a shopper
       created expressly to drive away stood about until the evening while its
       bay was flagged as leaving and could never be reused. */
    if (b.toCar && !b.away){
      if (!b.toCar.car){ b.toCar = null; }
      else {
        const st = bayStand(b.toCar), bx = WORLD.boxes[b.toCar.box];
        b.tx = st[0]; b.ty = st[1];
        b.state = b.look;
        const near = bx && Math.hypot(bx.x - b.x, bx.y - b.y) < 3.6;
        if (near || walkTo(b, dt, b.k.speed * 1.2)){
          if (near && roomToLeave()){
            beginDeparture(b.toCar); b.toCar = null; b.gone = true;
          }
        }
        continue;
      }
    }

    if (b.away){
      /* Back from the void, but not just yet. */
      if (b.voidT > 0){ b.voidT -= dt; continue; }
      /* Off the premises. Comes back in when its hours start again. */
      if (b.carComing && b.carComing.done) b.carComing = null;
      if (b.carComing) continue;                  // on the way in, in the car
      if (want && RND.beings() < dt * 0.35){
        /* The Manager and Trolleyboy DRIVE in now, and park out of the way.
           Walking in from the gate stays as the fallback if no car can get in
           for a couple of minutes, and in the test rig. */
        if (b.kind === 'manager' && b.res && !CENSUS.mute &&
            (b.carTries || 0) < 120){
          const sc = spawnStaffCar(b.res, b);
          if (sc){ b.carComing = sc; b.carTries = 0; }
          else b.carTries = (b.carTries || 0) + 1;
          continue;
        }
        b.away = false; b.leaving = false; b.arriving = true;
        b.x = g[0] - 3; b.y = g[1] + (RND.beings() - 0.5) * 3;
        b.hold = 0; b.carry = null;
        goTo(b, b.home || pickPlace(PLACES.park), 4);
      }
      continue;
    }

    /* Grannies want to be home before dark, and it does not take actual dark -
       the first suggestion that the afternoon is going is enough. Their urge to
       leave climbs steeply as the light goes, well before anyone else thinks
       about it, and it is CONTAGIOUS: one of them making a move is what
       reminds the others they should be getting on. So dusk produces a visible
       exodus rather than a trickle, which is what it looks like in life. */
    let urge = 0.22;
    if (b.kind === 'granny'){
      const dark = 1 - daylight();
      const worry = TOD > 0.58 ? (TOD - 0.58) / 0.18 : 0;
      let others = 0;
      for (const o of BEINGS) if (o !== b && o.kind === 'granny' && o.leaving) others++;
      urge = 0.10 + 3.2 * Math.max(dark, worry) + 0.55 * others;
    }
    /* A granny may decide to go BEFORE her hours are up - that is the whole
       behaviour. Everyone else waits to be told. */
    const early = b.kind === 'granny' && TOD > 0.56 && !b.leaving &&
                  RND.beings() < dt * urge * 0.55;
    if ((!want || early) && !b.leaving && RND.beings() < dt * urge || early){
      /* Time to go. Not all at once - this fires independently per being. */
      b.leaving = true; b.hold = 0;
      if (b.carry){ b.carry.held = false; b.carry = null; }
    }
    if (want) b.leaving = false;

    if (b.leaving){
      /* Somebody who arrived BY CAR goes back to it rather than walking out of
         the entrance, and the car leaves when they reach it. That is the loop
         closing: a car brought them, a car takes them away, and the population
         is the difference between the two. */
      const own = b.ownBay || b.toCar;
      if (own && own.car){
        /* Out in the aisle beside it (bayStand), and in on NEAR CONTACT - the
           same fix the shoppers got. This aimed at own.x + toAisle * 1.4,
           which puts the offset along the row, into the next bay, and waited
           to arrive exactly; so the Manager and Trolleyboy spent every night
           'leaving' and never reached their cars. */
        const st = bayStand(own), bx = WORLD.boxes[own.box];
        b.tx = st[0]; b.ty = st[1];
        b.state = b.look;
        const near = bx && Math.hypot(bx.x - b.x, bx.y - b.y) < 3.6;
        if (near || walkTo(b, dt, b.k.speed * 1.2)){
          if (near && roomToLeave()){
            beginDeparture(own); b.away = true; b.leaving = false;
            /* The space is not theirs once they have driven out of it; holding
               on to it credited whoever parked there next to them, and that car
               was then never picked to leave. */
            if (b.ownBay === own) b.ownBay = null;
            if (b.toCar === own) b.toCar = null;
          }
          else b.hold = 2;        // not quite there, or no room on the aisle yet
        }
        continue;
      }
      b.tx = g[0]; b.ty = g[1];
      b.state = b.look;
      /* And a worried granny bustles. It is still not fast. */
      const hurry = b.kind === 'granny' ? 1.7 : 1.25;
      if (walkTo(b, dt, b.k.speed * hurry) || b.x < X0 + 4){
        b.away = true; b.leaving = false;
      }
      if (b.z > 0 || b.vz !== 0){
        b.vz -= (b.kind === 'gull' ? 3.2 : GRAV) * dt;
        b.z += b.vz * dt;
        if (b.z <= 0){ b.z = 0; b.vz = 0; }
      }
      continue;
    }

    if (b.arriving){
      /* Walk in properly before the ordinary behaviour takes over. */
      b.state = b.look;
      if (walkTo(b, dt, b.k.speed) || b.x > X0 + 16) b.arriving = false;
      continue;
    }

    stepBeing(b, dt);
  }
  stepHelp(dt);
  reapBeings();
}
function beingAbsent(b){ return b.inStore || b.away || b.gone; }


function beingParts(b){
  const sp = CAST[b.k.sprite];
  if (!sp) return [];
  const boxes = sp.states[b.state] || sp.states[sp.order[0]];
  if (!boxes) return [];
  const ch = Math.cos(b.h), sh = Math.sin(b.h), out = [];
  /* A walking thing bobs. One sine wave is the difference between a sprite
     sliding across the tarmac and something with legs. */
  const moving = b.moving;
  const bob = moving ? Math.abs(Math.sin(b.anim * 5.5)) * 0.045 : 0;
  /* Banking, cheaply. Every box in a sprite carries its lateral offset `l`, so
     raising each one by -l*sin(roll) tilts the whole bird about its own long
     axis: outer wing up on the inside of the turn, down on the outside. It is a
     stepped approximation rather than a real rotation, which at this scale is
     indistinguishable from one and costs a sine. */
  const roll = b.roll || 0;
  const tilt = roll ? Math.sin(roll) : 0;
  for (const q of boxes){
    const lean = tilt ? -q.l * tilt : 0;
    out.push({ cid:b.cid, lit:q.lit,
               X:b.x + q.f * ch - q.l * sh, Y:b.y + q.f * sh + q.l * ch,
               L:q.L, W:q.W, rot:b.h + q.rot,
               z0:b.z + (b.gz || 0) + bob + q.z + lean,
               z1:b.z + (b.gz || 0) + bob + q.z + q.H + lean, col:toneCol(q, b.tones) });
  }
  if (brollyUp(b)){
    let top = 0;
    for (const q of boxes) top = Math.max(top, q.z + q.H);
    const z = b.z + bob + top;
    /* Held in the right hand, leaning downwind in a gust. */
    const wv = windNow(), lean = 0.012 * SQ.gust;
    const kx = b.x + wv[0] * lean, ky = b.y + wv[1] * lean;
    /* The umbrella sprite: its canopy over the head, its pole in the right
       hand (the pole box carries the hand offset), canopy in their colour. */
    for (const q of spriteItems('umbrella', kx, ky, b.h, z - 0.75, { cid:b.cid, paint:b.brolly })) out.push(q);
  }
  return out;
}

/* Who is standing in the road. People go into the field Trueno SEES, never the
   one he collides against - a granny is not a bollard, and the whole point is
   that he goes round her. */
function seedCast(){
  BEINGS.length = 0;
  let sd = 773311;
  const rnd = function(){ sd = (sd * 1103515245 + 12345) & 0x7fffffff;
    return sd / 0x7fffffff; };
  const spot = function(pad){
    for (let i = 0; i < 60; i++){
      const x = X0 + pad + rnd() * (PARK_L - 2 * pad);
      const y = Y0 + pad + rnd() * (PARK_W - 2 * pad);
      if (sdfAt(x, y) > 1.2) return [x, y];
    }
    return [X0 + 20, ROWY[0]];
  };
  const put = function(kind, n, pad){
    for (let i = 0; i < n; i++){ const q = spot(pad); addBeing(kind, q[0], q[1]); }
  };
  buildPlaces();
  /* Everyone parked somewhere, and that is where they will go back to. */
  put('gull', 14, 4);
  put('granny', 5, 6);
  put('shopper', 6, 6);
  put('trolleyboy', 1, 8);
  put('manager', 1, 8);
  put('fox', 2, 4);
  /* The night manager. Made AFTER the seeded draws, at a fixed spot by the
     doors, so adding him moves nobody else; he is off shift at opening and is
     sent home below like anyone whose hours have not started. */
  {
    /* Handed his own resident as he is made, so he is Gordon, not Derek. */
    const nr = TOWN.find(function(r){ return r.kind === 'manager' && r.night; });
    const b = addBeing('manager', X1 - 20, Y0 + WALK_W + PRIME_W + 2, nr);
    b.night = true;
    /* Less enthusiastic: a fifth slower about everything on foot. */
    b.k = Object.assign({}, KINDS.manager, { speed:KINDS.manager.speed * 0.8 });
  }
  /* Opening state, and it is a snapshot of lives in progress rather than a crowd
     waiting to be told what to do. Most of them drove - the grannies especially,
     because a Tesco Extra off a dual carriageway is not somewhere you stroll to -
     and most of those are already inside with their shopping half done. */
  for (const b of BEINGS){
    if (!hasLife(b)) continue;
    const drove = rnd() < (b.kind === 'granny' ? 0.78 : 0.55);
    if (drove){
      /* Hand them one of the cars that is already parked. */
      let mine = null, md = 1e9;
      for (const bay of BAYS){
        if (!bay.car || bay.leaving) continue;
        let taken = false;
        for (const o of BEINGS) if (o !== b && o.ownBay === bay) taken = true;
        if (taken) continue;
        const d = Math.hypot(bay.x - b.x, bay.y - b.y);
        if (d < md){ md = d; mine = bay; }
      }
      if (mine){
        b.ownBay = mine;
        b.arrivedBy = 'car';
        b.carSprite = mine.car.model ? mine.car.model.sprite : null;
        b.parkedAt = bayStand(mine);
        mine.ownerCid = b.cid;
        if (mine.car.veh){ mine.car.veh.ownerPid = b.pid; mine.car.veh.ownerRid = b.res ? b.res.rid : null;
          if (b.res) b.res.car = carRecord(mine.car.veh); }
      } else b.arrivedBy = 'foot';
    } else b.arrivedBy = 'foot';
    if (rnd() < 0.6){
      b.life = 'inStore'; b.inStore = true; b.shopT = 60 + rnd() * 700;
    } else {
      b.life = 'toDoors';
    }
  }
  /* Start each one where its hours say it should be: on the premises if it is
     working, off them if not. Otherwise the first minute of any run is the
     whole night shift walking out of the gate at once. */
  for (const b of BEINGS) if (!onShift(b)) b.away = true;
  seedOwners();
}

/* Every car parked at opening belongs to somebody. The census found 112 of 118
   with nobody behind them, and the departure channel then invented a driver
   beside the car whenever one had to leave - fifty of them in the first seven
   minutes, people popping into existence exactly as cars were forbidden to.
   Long-stay cars belong to the shop's staff, at work. Everybody else is in the
   shop, OFF THE MAP: a resident with an open visit and no being, which costs
   nothing per tick, and who walks out of the doors when it is time to go.
   Not in the test rig, which builds throwaway worlds and must stay exactly as
   it was; there the old fallback still covers it. */
function seedOwners(){
  if (CENSUS.mute) return;
  /* The Manager and Trolleyboy, if on shift, came in their own cars: a
     long-stay one out of the way is theirs. */
  for (const sb of BEINGS){
    if (sb.kind !== 'manager' || sb.away || !sb.res) continue;      // Kyle has no car
    let best = null;
    for (const bay of BAYS){
      if (!bay.car || !bay.longStay || !bay.car.veh || ownerOfBay(bay)) continue;
      if (!best || bay.want < best.want) best = bay;
    }
    if (!best) continue;
    sb.ownBay = best; sb.parkedAt = bayStand(best);
    sb.carSprite = best.car.veh.sprite;
    best.ownerCid = sb.cid;
    best.car.veh.ownerRid = sb.res.rid; best.car.veh.ownerPid = sb.pid;
    sb.res.car = carRecord(best.car.veh);
  }
  for (const bay of BAYS){
    if (!bay.car || !bay.car.veh) continue;
    if (ownerOfBay(bay) || offMapOwner(bay)) continue;
    const jazz = bay.car.model && bay.car.model.sprite === 'jazz';
    const kind = bay.longStay ? 'staff'
               : (jazz && RND.beings() < 0.62) ? 'granny' : 'shopper';
    const r = freeResident(kind);
    if (!r) continue;
    /* Some of the cars that are here before you are are town cars: their
       owners are part way through a trip in, with the rest of it to come. */
    const town = !bay.longStay && RND.beings() < (r.townish ? 0.6 : 0.08);
    openVisit(r, bay.longStay ? 'work' : 'shop', 'car', bay);
    if (town){
      const stay = wanderStay(), done = RND.beings() * stay * 0.8;
      r.visit.where = 'town'; r.visit.left = -done; r.visit.due = stay - done; r.visit.over = false;
    }
    bay.car.veh.ownerRid = r.rid;
    r.car = carRecord(bay.car.veh);
  }
}
