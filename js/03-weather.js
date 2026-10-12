/* Tesco Trueno - 03-weather.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ============================================================== weather =====
   Rain does four things, and the fourth is the one worth having.

   1. The tarmac goes slippery. Peak grip falls furthest - wet asphalt is about
      0.65 against 1.05 dry - and sliding grip falls less, so the MU_S/MU_K GAP
      narrows. §3.1 is explicit that the gap is what makes him tail-happy, so a
      wet car is not simply a dry car with less grip: it lets go sooner and then
      behaves more predictably once it has. Which is exactly right.
   2. Headlights come on, because it is dark enough to want them.
   3. It washes the rubber off the asphalt.
   4. And (3) is the interesting one, because the rubber is what the GULLS eat.
      Rain does not just change the driving, it takes the food away, and the
      birds go and stand about instead. The weather reaches the food chain
      without anybody having written a rule connecting them.

   WET is surface wetness rather than rainfall: it lags the rain going on and
   takes a good while to dry afterwards, so the interesting part - a drying
   car park with grip coming back unevenly in time - happens on its own. */
const WX = { rain:0, wet:0, next:120 + RND.weather() * 400, spell:0 };
function stepWeather(dt){
  WX.next -= dt;
  if (WX.spell > 0){
    WX.spell -= dt;
    WX.rain = Math.min(1, WX.rain + dt * 0.5);
    if (WX.spell <= 0) WX.next = 200 + RND.weather() * 700;
  } else {
    WX.rain = Math.max(0, WX.rain - dt * 0.25);
    if (WX.next <= 0) WX.spell = 60 + RND.weather() * 260;
  }
  /* Squalls run on top of the spell - but only in the live sim. Anything that
     pins the wetness (the test rigs) gets the plain spell and nothing else. */
  if (WET_PIN === null) stepSqualls(dt);
  /* Wetting is quick, drying is slow, which is why the roads are still greasy
     an hour after it stops. The tarmac gets wet from what is falling ON IT, so
     in the live sim a squall going over soaks it and the drizzle either side
     barely does. */
  const target = WET_PIN === null ? rainAt(SITE_C[0], SITE_C[1]) : WX.rain;
  const rate = target > WX.wet ? 0.35 : 0.030;
  WX.wet += (target - WX.wet) * Math.min(1, rate * dt);
  WX.wet = Math.max(0, Math.min(1, WX.wet));
}
/* Non-null freezes the weather for anything that reads grip. The open-loop
   rigs in §10 compare against the handover's measured numbers - 20 degrees of
   slip from a handbrake yank, a 150 degree flick, 8 mph out of a 45 degree
   thump - and every one of those is a DRY figure. Once stepWeather started
   running inside driveSim's loop the suite began raining on itself, and the
   rigs happily measured wet tarmac against dry references: the yank came out at
   4.8 degrees instead of 20, the J-turn exited at 0.1 mph, and even the
   steering calibration moved from 0.052 to 0.039. Nothing was wrong with the
   car. The test had got wet. */
let WET_PIN = null;
function wetNow(){ return WET_PIN === null ? WX.wet : WET_PIN; }
function muWet(){
  /* Peak falls hard, sliding falls softly: the gap closes from 0.60 dry to
     about 0.28 soaking. */
  const w = wetNow();
  /* And standing water takes most of what is left: AQUA is how far he is
     riding on a puddle rather than on the tarmac. Never in a pinned rig. */
  const aq = WET_PIN === null ? AQUA : 0;
  return [(MU_S - 0.40 * w) * (1 - 0.50 * aq), (MU_K - 0.08 * w) * (1 - 0.35 * aq)];
}

/* ============================================================ squalls =====
   Thomas, 2026-10-09: "focus on all of the rain behaviours. think squalls."
   Rain used to be one number for the whole site, which is drizzle: it is
   everywhere at once and it never ARRIVES. A squall arrives. You see it coming
   across the river, the light goes, the wind gets up, and then it is coming
   down sideways for half a minute and goes on its way, leaving everything
   dripping. So rain is a FIELD now:
     - a wind, from the south-west as it mostly is on the Tay, veering slowly,
       stronger in a spell, with GUSTS - short impulses, far more often and far
       harder under a squall
     - squall CELLS: bands of heavy rain, wide across the wind and short along
       it, spawned upwind and carried across the site at about the wind speed.
       One every 25-70 s through a spell; crossing takes twenty-odd seconds.
     - rainAt(x, y) = the spell, times a drizzle floor plus the cells. WX.rain
       stays the SPELL (so every existing reader - grip, the rubber, the lamps,
       the tests - is untouched), and the tarmac wets from what is overhead.
   Everything below reads the field, not the spell, which is why it all moves
   together: the streaks, the shadow, the rings, the spray, the people. */
const SITE_C = [(X0 + X1) / 2, (Y0 + Y1) / 2];
const SQ = { wa:0.45, waWant:0.45, waT:30, ws:2.5, gust:0, cells:[], cellT:0 };
let AQUA = 0;
const RAIN = { soaked:0, brollies:0, puddleHits:0, cells:0 };
function spawnCell(dist){
  const ux = Math.cos(SQ.wa), uy = Math.sin(SQ.wa);
  const across = (RND.weather() - 0.5) * 80;
  /* Slower and deeper than the first go, which crossed in eight seconds and
     read as a flicker: heavy rain for fifteen to twenty, and coming and going
     for half a minute either side. */
  const v = 3 + SQ.ws * 0.45 + RND.weather() * 1.5;
  SQ.cells.push({ x:SITE_C[0] - ux * dist - uy * across,
                  y:SITE_C[1] - uy * dist + ux * across,
                  ux:ux, uy:uy, v:v,
                  a:65 + RND.weather() * 30,        // half-depth along the wind
                  w:65 + RND.weather() * 45,        // half-width across it
                  k:0.75 + RND.weather() * 0.25,
                  age:0, life:(dist * 2) / v });
  RAIN.cells++;
}
function stepSqualls(dt){
  /* The wind veers about the south-west rather than holding a compass line. */
  SQ.waT -= dt;
  if (SQ.waT <= 0){ SQ.waT = 20 + RND.weather() * 40; SQ.waWant = 0.45 + (RND.weather() - 0.5) * 1.1; }
  SQ.wa += angDiff(SQ.waWant, SQ.wa) * Math.min(1, dt * 0.05);
  const here = squallAt(SITE_C[0], SITE_C[1]);
  const wsWant = 2.5 + WX.rain * 6 + here * WX.rain * 5;
  SQ.ws += (wsWant - SQ.ws) * Math.min(1, dt * 0.3);
  /* Gusts are impulses that decay, not a noise: you feel each one. */
  SQ.gust *= Math.exp(-dt / 1.6);
  if (RND.weather() < dt * (0.03 + 0.55 * here * WX.rain))
    SQ.gust = Math.max(SQ.gust, 0.5 + 0.5 * RND.weather());
  if (WX.rain > 0.05){
    SQ.cellT -= dt;
    if (SQ.cellT <= 0){ spawnCell(300); SQ.cellT = 45 + RND.weather() * 60; }
  } else SQ.cellT = Math.min(SQ.cellT, 4);
  for (let i = SQ.cells.length - 1; i >= 0; i--){
    const c = SQ.cells[i];
    c.x += c.ux * c.v * dt; c.y += c.uy * c.v * dt; c.age += dt;
    if (c.age > c.life) SQ.cells.splice(i, 1);
  }
}
function squallAt(x, y){
  let s = 0;
  for (const c of SQ.cells){
    const dx = x - c.x, dy = y - c.y;
    const al = (dx * c.ux + dy * c.uy) / c.a, ac = (-dx * c.uy + dy * c.ux) / c.w;
    const e = al * al + ac * ac;
    if (e > 9) continue;
    const ramp = Math.min(1, c.age / 6, (c.life - c.age) / 6);
    s += c.k * Math.exp(-e) * Math.max(0, ramp);
  }
  return Math.min(1, s);
}
function rainAt(x, y){
  if (WET_PIN !== null) return WX.rain;
  return WX.rain * (0.28 + 0.72 * squallAt(x, y));
}
/* For BEHAVIOURS: nothing in a pinned rig reacts to the weather. */
function rainHere(x, y){ return WET_PIN !== null ? 0 : rainAt(x, y); }
function windNow(){
  const sp = SQ.ws * (1 + 0.9 * SQ.gust);
  return [Math.cos(SQ.wa) * sp, Math.sin(SQ.wa) * sp];
}
function squallNow(){
  return WET_PIN === null && WX.rain > 0.4 && squallAt(SITE_C[0], SITE_C[1]) > 0.55;
}

/* ------------------------------------------------------------ puddles ---
   Where water actually stands: down the middle of the aisles where the tarmac
   is worn, along the walkway kerb, and in the low west corner the trolleys
   drift to. Each has its own threshold, so the big low ones form first and go
   last, and the car park dries in patches rather than all at once - which it
   gets for free, because WX.wet already lags the rain on the way down. */
const PUDDLES = (function(){
  let sd = 4471;
  const rnd = function(){ sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
  const out = [];
  const add = function(x, y, r, t){
    const parts = [[0, 0, r]];
    for (let k = 0; k < 2; k++)
      parts.push([(rnd() - 0.5) * r * 1.4, (rnd() - 0.5) * r * 0.8, r * (0.45 + rnd() * 0.4)]);
    out.push({ x:x, y:y, r:r, t:t, parts:parts, f:0 });
  };
  const lanes = [Y0 + WALK_W + PRIME_W + PAISLE / 2, Y1 - ROAD_W / 2];
  for (const b of BANDS) lanes.push(b + AISLE_C);
  for (const ly of lanes)
    for (let k = 0; k < 6; k++)
      add(X0 + 10 + rnd() * (PARK_L - 20), ly + (rnd() - 0.5) * 2.2,
          0.8 + rnd() * 1.8, 0.25 + rnd() * 0.45);
  for (let k = 0; k < 5; k++)                       // along the walkway kerb
    add(X0 + 14 + rnd() * (PARK_L - 28), Y0 + WALK_W + 0.9, 0.6 + rnd() * 0.9, 0.35 + rnd() * 0.3);
  add(X0 + 9, Y1 - 12, 3.4, 0.2);                   // the low corner
  add(X0 + 15, Y1 - 15, 2.2, 0.28);
  return out;
})();
function puddleAt(x, y, pad){
  for (let i = 0; i < PUDDLES.length; i++){
    const q = PUDDLES[i];
    if (q.f < 0.2) continue;
    if (Math.hypot(x - q.x, y - q.y) < q.r * q.f + (pad || 0)) return i;
  }
  return -1;
}

/* ------------------------------------------------------- spray and soak --- */
const SPRAY = [];
function sprayOne(x, y, z, vx, vy, vz){
  if (SPRAY.length > 900) return;
  SPRAY.push({ x:x, y:y, z:z, vx:vx, vy:vy, vz:vz });
}
/* Through a puddle: two sheets of water, one off each side. Anyone standing
   close enough on either side gets it. */
function puddleBurst(by, x, y, h, v){
  const ch = Math.cos(h), sh = Math.sin(h);
  const n = Math.min(80, 18 + v * 3);
  for (let i = 0; i < n; i++){
    const side = i % 2 ? 1 : -1;
    const lat = side * (1.2 + v * 0.30) * (0.5 + RND.weather());
    const fw = v * (0.25 + RND.weather() * 0.3);
    sprayOne(x + (RND.weather() - 0.5) * 1.5, y + (RND.weather() - 0.5) * 1.5, 0.15,
             ch * fw - sh * lat, sh * fw + ch * lat, 1.6 + v * 0.16 * RND.weather() + RND.weather());
  }
  const pi = puddleAt(x, y, 0.5);
  if (pi >= 0){ const q = PUDDLES[pi]; ripple(q.x, q.y, q.r * 1.6, 0.9, 0.5, true); }
  RAIN.puddleHits++;
  if (v < 5) return;
  let wet = 0;
  for (const b of BEINGS){
    if (beingAbsent(b) || b.held || b.abyss || b.z > 0.6) continue;
    if (b.kind === 'gull' || b.kind === 'fox') continue;
    if (Math.hypot(b.x - x, b.y - y) > 3.2 + v * 0.12) continue;
    b.soakUntil = simClock + 25;
    b.stareT = 1.6; b.stareAt = [x, y];
    wet++; RAIN.soaked++;
  }
  if (wet){
    exciteAt(x, y, 3 + wet * 4);
    if (by === car) car.soakAt = simClock;
  }
}

/* ------------------------------------------------------------ umbrellas ---
   Decided once per person, the first time it rains on them. The Manager has a
   company one. Trolleyboy has a hood and an attitude. */
function brollyOf(b){
  if (b.brolly === undefined){
    const p = b.kind === 'granny' ? 0.75 : b.kind === 'shopper' ? 0.45
            : b.kind === 'manager' ? 1 : 0;
    const cols = ['#2b4f8a', '#a83232', '#2f6b45', '#d9b23a', '#5b3f7a', '#262a2e', '#c4567a'];
    /* From WHO it is, not from a stream: this is first asked by whatever
       wants to know, often the drawing code, so a roll here would make the
       day depend on the frame rate. */
    b.brolly = pick01(b.pid || 0, 11) < p
             ? (b.kind === 'manager' ? '#1f4e9c' : cols[Math.floor(pick01(b.pid || 0, 12) * cols.length)])
             : null;
  }
  return b.brolly;
}
function brollyUp(b){
  if (b.brolly === null || b.brollyLost || b.held || b.swim || b.abyss) return false;
  if (b.kind !== 'shopper' && b.kind !== 'granny' && b.kind !== 'manager') return false;
  return rainHere(b.x, b.y) > 0.22 && !!brollyOf(b);
}
const FLY = [];               // umbrellas that have got away

/* ------------------------------------------------------- the rain, live ---
   Everything that happens BECAUSE of the field, stepped from the main loop
   only - never inside a test rig. */
function stepRain(dt){
  const r0 = WX.rain;
  /* Puddles fill and drain with the surface. */
  const w = WET_PIN === null ? WX.wet : 0;
  for (const q of PUDDLES){
    const want = Math.max(0, Math.min(1, (w - q.t) / 0.35));
    q.f += (want - q.f) * Math.min(1, dt * 0.5);
  }
  if (r0 > 0.03){
    /* Rings on the Tay, wherever it is coming down hardest. */
    let n = 70 * r0 * dt;
    while (n > 0){
      if (n < 1 && RND.weather() > n) break;
      n -= 1;
      const x = X0 - 40 + RND.weather() * (PARK_L + 100), y = -104 + RND.weather() * 72;
      if (RND.weather() < rainAt(x, y))
        ripple(x, y, 0.3 + RND.weather() * 0.35, 0.5 + RND.weather() * 0.3, 0.5, false);
    }
    /* And on the puddles. */
    for (const q of PUDDLES){
      if (q.f < 0.15) continue;
      if (RND.weather() < dt * 1.2 * q.r * q.f * rainAt(q.x, q.y)){
        const a = RND.weather() * 6.28, d = RND.weather() * q.r * q.f * 0.8;
        ripple(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d * 0.7, 0.25 + RND.weather() * 0.2,
               0.45, 0.55, false);
      }
    }
  }

  /* Spray off the tyres, and the puddles. Trueno first. */
  AQUA = Math.max(0, AQUA - dt * 3);
  if (w > 0.12 && !car.held && !car.airborne){
    const ch = Math.cos(car.h), sh = Math.sin(car.h);
    const vx = car.vx * ch - car.vy * sh, vy = car.vx * sh + car.vy * ch;
    const v = Math.hypot(vx, vy);
    if (v > 3){
      let n = w * (v - 3) * 6 * dt;
      while (n > 0){
        if (n < 1 && RND.weather() > n) break;
        n -= 1;
        const side = RND.weather() < 0.5 ? 1 : -1;
        sprayOne(car.x - ch * LR + -sh * side * HALF_W, car.y - sh * LR + ch * side * HALF_W, 0.15,
                 vx * 0.45 + (RND.weather() - 0.5) * 1.6, vy * 0.45 + (RND.weather() - 0.5) * 1.6,
                 1.2 + RND.weather() * 1.8);
      }
    }
    const pi = puddleAt(car.x, car.y, 0.6);
    if (pi >= 0 && car.inPud !== pi && v > 2.5) puddleBurst(car, car.x, car.y, car.h, v);
    car.inPud = pi;
    /* Aquaplaning: a deep puddle at speed and the tyres are riding on water. */
    if (pi >= 0 && v > 11){
      const q = PUDDLES[pi];
      AQUA = Math.max(AQUA, Math.min(1, (v - 11) / 8) * q.f);
      if (AQUA > 0.3) exciteAt(car.x, car.y, 2.5 * AQUA);
    }
  }
  for (const c of CARS){
    if (c.done || c.held || c.airborne || c.swim || c.abyss) continue;
    const v = Math.abs(c.spd || 0);
    if (w > 0.12 && v > 3 && RND.weather() < w * (v - 3) * 2.5 * dt){
      const ch = Math.cos(c.h), sh = Math.sin(c.h), side = RND.weather() < 0.5 ? 1 : -1;
      sprayOne(c.x - ch * c.model.l * 0.35 - sh * side * c.model.w * 0.45,
               c.y - sh * c.model.l * 0.35 + ch * side * c.model.w * 0.45, 0.15,
               ch * c.spd * 0.45 + (RND.weather() - 0.5) * 1.4,
               sh * c.spd * 0.45 + (RND.weather() - 0.5) * 1.4, 1 + RND.weather() * 1.4);
    }
    const pi = v > 2.5 ? puddleAt(c.x, c.y, 0.4) : -1;
    if (pi >= 0 && c.inPud !== pi) puddleBurst(c, c.x, c.y, c.h, v);
    c.inPud = pi;
  }
  for (let i = SPRAY.length - 1; i >= 0; i--){
    const q = SPRAY[i];
    q.vz -= GRAV * dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    q.vx *= 1 - 0.8 * dt; q.vy *= 1 - 0.8 * dt;
    if (q.z <= 0) SPRAY.splice(i, 1);
  }

  /* The wind. Gusts push the stray trolleys about - not a breeze, a GUST: only
     the part of the wind over 8 m/s pushes, so they sit still until one comes. */
  const wv = windNow(), wsp = Math.hypot(wv[0], wv[1]);
  if (wsp > 8){
    const a = 0.11 * (wsp - 8);
    for (const m of MOVERS){
      if (m.held || m.z > 0 || m.swim || m.abyss) continue;
      m.vx += wv[0] / wsp * a * dt; m.vy += wv[1] / wsp * a * dt;
    }
  }
  for (const b of BEINGS){
    if (beingAbsent(b) || b.held || b.abyss || b.swim) continue;
    /* A gull on the ground turns to face into the wind, which is what they
       all do, in rows, on every car park roof in Scotland. */
    if (b.kind === 'gull'){
      if (b.z < 0.05 && !b.moving && SQ.ws > 5 && WET_PIN === null)
        b.h += angDiff(SQ.wa + Math.PI, b.h) * Math.min(1, dt * 1.2);
      continue;
    }
    if (WX.rain < 0.05){ b.brollyLost = false; continue; }   // dry: a new one
    /* And a gust under a squall takes umbrellas. */
    if (SQ.gust > 0.7 && brollyUp(b) && rainHere(b.x, b.y) > 0.45 &&
        RND.weather() < dt * 0.04){
      b.brollyLost = true; b.brollyT = simClock;
      b.stareT = 2.2; b.stareAt = [b.x + wv[0] * 3, b.y + wv[1] * 3];
      FLY.push({ x:b.x, y:b.y, z:2.0, vx:wv[0] * 0.5, vy:wv[1] * 0.5,
                 vz:2 + RND.weather() * 2, h:RND.weather() * 6.28,
                 r:(RND.weather() - 0.5) * 9, col:b.brolly, t:0 });
      RAIN.brollies++;
      exciteAt(b.x, b.y, 2);
    }
  }
  for (let i = FLY.length - 1; i >= 0; i--){
    const u = FLY[i];
    u.t += dt;
    if (u.z > 0 || u.vz > 0){
      /* It glides - an open umbrella is a very bad parachute. */
      u.vz -= 3.5 * dt;
      u.vx += (wv[0] - u.vx) * 0.8 * dt; u.vy += (wv[1] - u.vy) * 0.8 * dt;
      u.x += u.vx * dt; u.y += u.vy * dt; u.z += u.vz * dt; u.h += u.r * dt;
      if (u.z <= 0){
        u.z = 0; u.vz = 0;
        if (inTay(u.x, u.y)){ splash(u.x, u.y, 0.3); FLY.splice(i, 1); continue; }
        if (inVoid(u.x, u.y)){ FLY.splice(i, 1); continue; }
      }
    } else {
      /* On the ground it cartwheels on with each gust. */
      if (SQ.gust > 0.4){
        u.x += wv[0] * 0.18 * SQ.gust * dt; u.y += wv[1] * 0.18 * SQ.gust * dt;
        u.h += dt * 3 * SQ.gust;
      }
      if (inTay(u.x, u.y)){ splash(u.x, u.y, 0.3); FLY.splice(i, 1); continue; }
    }
    if (u.t > 120 || inVoid(u.x, u.y)) FLY.splice(i, 1);
  }
}

/* --------------------------------------------------------- drawing it --- */
/* Seconds a drop path stays where it is before it is redrawn elsewhere in its
   cell. 0 = completely still. */
const STREAK_REFRESH = 1.1;
/* A small integer hash to [0, 1): the same cell and salt always give the same
   number, which is what keeps a ground-anchored streak where it is. */
function rhash(i, j, k){
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* On the ground, under the boxes: the puddles. Sky in the day, black glass at
   night, with the sodium in them under a lit lamp. */
/* Height of the lamp heads on the masts, for their reflections. */
const LAMP_HEAD_Z = 7.6;
function drawPuddles(dayK, nightK){
  if (!PUDDLES.some(function(q){ return q.f > 0.02; })) return;
  const day = [138, 150, 164], night = [18, 23, 32];
  const c = [night[0] + (day[0] - night[0]) * dayK, night[1] + (day[1] - night[1]) * dayK,
             night[2] + (day[2] - night[2]) * dayK];
  for (const q of PUDDLES){
    if (q.f <= 0.02) continue;
    g2.fillStyle = 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' +
                   ((0.275 + 0.17 * nightK) * Math.min(1, q.f * 1.6)).toFixed(3) + ')';
    g2.beginPath();
    for (const pt of q.parts){
      const pp = P(q.x + pt[0], q.y + pt[1]), r = pt[2] * q.f * K;
      g2.moveTo(SX(pp) + r, SY(pp, 0));
      g2.ellipse(SX(pp), SY(pp, 0), r, r * 0.5, 0, 0, 6.2832);
    }
    g2.fill();
    /* No rim. There was one, and Thomas had it out: it stroked every
       sub-ellipse, so it drew overlapping outlines inside the water too. The
       blue-grey glass over the lit pools carries it on its own. */
    /* A lamp shows in a puddle only where its reflection actually is: the
       mirror image of the lamp head, straight below the mast on screen by the
       height of the head (SY is linear in z, so the mirror is just z -> -z).
       If that point lands inside this puddle, there is a soft glint there,
       clipped to the water. The flat amber disc this replaces sat in the
       middle of every puddle near a lamp and read as a target. */
    if (nightK > 0.1){
      for (let mi = 0; mi < MASTS.length; mi++){
        const m = MASTS[mi];
        if (Math.abs(m[0] - q.x) > 30 || Math.abs(m[1] - q.y) > 30) continue;
        const b = lampBright(mi);
        if (b < 0.05) continue;
        const mp = P(m[0], m[1]), gx = SX(mp), gy = SY(mp, -LAMP_HEAD_Z);
        /* Exactly on the mirror point it is brightest; otherwise the glint
           sits on the side of the puddle facing it, fading with how far off
           it is - a reflection in rough wet tarmac is spread, not a pinhole.
           The exact-point version lit 0 of 37 puddles. */
        const qp = P(q.x, q.y), cx = SX(qp), cy = SY(qp, 0), rq = q.r * q.f * K;
        const ex = (gx - cx) / rq, ey = (gy - cy) / (rq * 0.5), e = Math.hypot(ex, ey);
        let px = gx, py = gy, k = 1;
        if (e > 0.75){
          px = cx + ex / e * 0.75 * rq; py = cy + ey / e * 0.75 * rq * 0.5;
          const off = Math.hypot(gx - px, gy - py) / (6 * K);
          k = Math.exp(-off * off);
        }
        if (k < 0.05) continue;
        const rg = Math.max(3, 1.1 * K);
        g2.save();
        g2.beginPath();                             // the puddle again, to clip to
        for (const pt of q.parts){
          const pp = P(q.x + pt[0], q.y + pt[1]), r = pt[2] * q.f * K;
          g2.moveTo(SX(pp) + r, SY(pp, 0));
          g2.ellipse(SX(pp), SY(pp, 0), r, r * 0.5, 0, 0, 6.2832);
        }
        g2.clip();
        g2.globalCompositeOperation = 'lighter';
        const gr = g2.createRadialGradient(px, py, 0, px, py, rg);
        gr.addColorStop(0, 'rgba(255,214,160,' + (0.70 * b * k * nightK).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,196,124,0)');
        g2.fillStyle = gr;
        g2.beginPath(); g2.ellipse(px, py, rg, rg * 1.6, 0, 0, 6.2832); g2.fill();
        g2.restore();
      }
    }
  }
}
/* Over everything: the squall's shadow, the spray, and the rain itself. The
   streaks are screen-space - one fixed pool of positions sliding down the view
   - but each one asks the field what is falling on the ground under it, by
   inverting this camera's projection (it is affine), and only draws if the
   answer is heavy enough. So the band of heavy rain is visible as a band, and
   you can watch it come across the car park, in every view, the quad included. */
function drawRainOver(dayK, nightK){
  if (WX.rain < 0.03 && !SPRAY.length) return;
  const d = dpr();
  const cx = cv.width / (2 * d) + panX, cy = cv.height / (2 * d) + panY;
  const toG = function(sx, sy){
    const a = (sx - cx) / K, b = (sy - cy) / (K * 0.5);
    return [SITE_C[0] - (a + b) / 2, SITE_C[1] + (b - a) / 2];
  };
  /* Screen displacement of a world vector on the ground. */
  const S = function(vx, vy){ return [(-vx - vy) * K, (-vx + vy) * K * 0.5]; };

  if (WET_PIN === null) for (const c of SQ.cells){
    const k = c.k * WX.rain * Math.max(0, Math.min(1, c.age / 6, (c.life - c.age) / 6));
    if (k < 0.02) continue;
    const pp = P(c.x, c.y), acr = S(-c.uy, c.ux), alg = S(c.ux, c.uy);
    g2.save();
    g2.translate(SX(pp), SY(pp, 0));
    g2.rotate(Math.atan2(acr[1], acr[0]));
    g2.scale(c.w * Math.hypot(acr[0], acr[1]) * 1.3, c.a * Math.hypot(alg[0], alg[1]) * 1.6 + 1);
    const gr = g2.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(20,26,34,' + (0.30 * k * (0.35 + 0.65 * dayK)).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(20,26,34,0)');
    g2.fillStyle = gr;
    g2.beginPath(); g2.arc(0, 0, 1, 0, 6.2832); g2.fill();
    g2.restore();
  }

  if (SPRAY.length){
    g2.fillStyle = 'rgba(214,224,232,' + (0.55 * (0.45 + 0.55 * dayK)).toFixed(3) + ')';
    const sz = Math.max(1, 0.07 * K);
    for (const q of SPRAY){
      const pp = P(q.x, q.y);
      g2.fillRect(SX(pp) - sz / 2, SY(pp, q.z) - sz / 2, sz, sz);
    }
  }

  if (WX.rain < 0.03) return;
  const R = CLIP || { x0:0, y0:0, x1:cv.width / d, y1:cv.height / d };
  const wv = WET_PIN === null ? windNow() : [0, 0];
  /* Each streak is a whole drop's PATH, not a drop - the fall is already in it,
     so nothing slides down the screen (Thomas, 2026-10-09: "show the squalling,
     not the falling"). What moves is the weather: the band of heavy rain
     sweeping across, and the lean swinging out with each gust and settling.
     The lean is capped as an ANGLE on screen, because a metre across the
     ground projects about a third longer than a metre of fall: about 12
     degrees in a steady wind, out toward 38 in a full gust. */
  const fall = 9, lean = 0.10 + 0.30 * SQ.gust;
  const blow = S(wv[0] / fall * lean, wv[1] / fall * lean);
  let ux = blow[0], uy = blow[1] + K * 0.78;            // px per metre of fall
  const maxA = Math.tan((12 + 26 * SQ.gust) * Math.PI / 180);
  if (uy < K * 0.5) uy = K * 0.5;
  if (Math.abs(ux) > maxA * uy) ux = Math.sign(ux) * maxA * uy;

  /* ANCHORED TO THE GROUND, on a fixed 2.5 m grid, so a streak belongs to a
     spot in the car park and stays there when the camera moves - screen-space
     streaks that stood still would look like dirt on the lens. Each cell's
     streaks come from a hash of the cell, so they are stable frame to frame
     and the same in all four quad cameras. Density is set per screen area
     (one per ~900 px^2 at full rain), so zooming in does not thin it out. */
  const CELL = 2.5;
  const dens = CELL * CELL * K * K / 900;
  const c0 = toG(R.x0, R.y0), c1 = toG(R.x1, R.y0), c2 = toG(R.x0, R.y1), c3 = toG(R.x1, R.y1);
  const pad = 8;
  const gx0 = Math.min(c0[0], c1[0], c2[0], c3[0]) - pad, gx1 = Math.max(c0[0], c1[0], c2[0], c3[0]) + pad;
  const gy0 = Math.min(c0[1], c1[1], c2[1], c3[1]) - pad, gy1 = Math.max(c0[1], c1[1], c2[1], c3[1]) + pad;
  const i0 = Math.floor(gx0 / CELL), i1 = Math.ceil(gx1 / CELL);
  const j0 = Math.floor(gy0 / CELL), j1 = Math.ceil(gy1 / CELL);
  const per = Math.max(1, Math.ceil(dens));
  /* A drop path is not there for ever: each one is redrawn somewhere else in
     its cell every second or so, each cell on its own phase, so the rain has
     life without anything travelling. STREAK_REFRESH = 0 freezes them. */
  const tiers = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const ambT = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  let anyAmb = false;
  if ((i1 - i0) * (j1 - j0) * per < 60000)
  for (let ci = i0; ci < i1; ci++) for (let cj = j0; cj < j1; cj++){
    const ep = STREAK_REFRESH > 0
             ? Math.floor(simClock / STREAK_REFRESH + rhash(ci, cj, 1)) : 0;
    for (let k = 0; k < per; k++){
      const salt = ep * 64 + k * 8;
      if (rhash(ci, cj, salt + 2) > dens - k) continue;   // this camera's density
      const x = (ci + rhash(ci, cj, salt + 3)) * CELL;
      const y = (cj + rhash(ci, cj, salt + 4)) * CELL;
      const here = rainAt(x, y);
      if (rhash(ci, cj, salt + 5) > here) continue;          // the squall field
      const h6 = rhash(ci, cj, salt + 6), h7 = rhash(ci, cj, salt + 7);
      /* Longer than the falling streaks were: most two or three metres of
         fall, a few much longer, and all longer where it is heavier. */
      const L = (1.6 + h6 * h6 * 4.4) * (0.7 + 0.6 * here);
      const jit = h7 * 2 - 1;
      const z = 1 + rhash(ci, cj, salt + 9) * 4;              // top of the path
      const pp = P(x, y);
      const sx = SX(pp), sy = SY(pp, z);
      const dx = ux * (1 + 0.35 * jit) * L + jit * 0.12 * K * L, dy = uy * L;
      const tier = Math.min(3, Math.floor(rhash(ci, cj, salt + 10) * rhash(ci, cj, salt + 11) * 5));
      let path = tiers[tier];
      if (nightK > 0.15){
        for (let mi = 0; mi < MASTS.length; mi++){
          const m = MASTS[mi];
          if (Math.abs(m[0] - x) < 16 && Math.abs(m[1] - y) < 16 &&
              lampBright(mi) > 0.2){ path = ambT[tier]; anyAmb = true; break; }
        }
      }
      path.moveTo(sx, sy); path.lineTo(sx + dx, sy + dy);
    }
  }
  /* Four weights, from barely there to bright, so the rain has depth rather
     than reading as one flat hatch over the picture. */
  const TIER = [0.12, 0.24, 0.40, 0.60];
  g2.lineWidth = 1;
  for (let k = 0; k < 4; k++){
    g2.strokeStyle = 'rgba(200,210,220,' + (TIER[k] * (0.40 + 0.60 * dayK)).toFixed(3) + ')';
    g2.stroke(tiers[k]);
  }
  if (anyAmb) for (let k = 0; k < 4; k++){
    g2.strokeStyle = 'rgba(255,208,146,' + (TIER[k] * 1.3 * nightK).toFixed(3) + ')';
    g2.stroke(ambT[k]);
  }
}
/* Lights on when it is dark OR when it is wet, which is the actual rule people
   drive by and not a coincidence of the two. */
function lightsOn(){
  return Math.max(1 - daylight() * 1.25, WX.wet * 1.3 - 0.15);
}
const PB = 7.0, PC = 1.55;
const F_DRIVE = 6600, F_BRAKE = 13500, BRK_F = 0.62, BRK_R = 0.38;
const DRAG = 0.40, RRES = 0.017 * M * G;
const MAX_STEER = 0.62, STEER_RATE = 4.6;
const HALF_L = 2.05, HALF_W = 0.86;
const DT = 1 / 120;
