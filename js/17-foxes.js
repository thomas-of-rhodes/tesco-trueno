/* Tesco Trueno - 17-foxes.js
   The foxes, and the world they raid (2026-10-13, designed with Thomas).

   A special treat, not a fixture. Two foxes live off the car park - a den in
   the railway embankment, and the tip down the road - and VISIT now and then
   at night, slipping in through the railway fence. A visit is short: every
   moment on the tarmac drains a fox's NERVE (faster in lamplight and near
   people), and when it is gone the fox slips away - instinct, not a choice a
   brain can learn past. So: a few minutes at a time, once or twice a night,
   some nights not at all, and the cameras love it when they come.

   The pair (Thomas): a bold dog fox and a shy vixen, who enjoy each other's
   company and dislike the conspicuous lamp pools - photorepellent. Placeholder
   names, Thomas's to change: Rab and Senga.

   What they want, pulling against each other:
     food      bins in the service yard (a feast - tipped over, the rubbish is
               left for the gulls at dawn and for Gordon to tidy), carrot scraps
               in stray trolleys (tipped and licked out - Kyle has to right
               them), gull splats (Thomas: gulls poop as they flee; a tiny but
               nourishing snack), or the tip (safe, dull, off the map)
     company   each other
     curiosity a good stare at a person, from the shadows, at a safe distance
     fear      people, cars; the vixen far more than the dog fox
     light     the lamp pools; the shadows are home
     dawn      home before daylight
     rain      a misery - and an opportunity, with nobody about
   Gulls: stalked and pounced on, NEVER caught (Thomas) - they flap off, and
   leave a splat.

   The hand-written fox is a sensible one: hungry, it forages; raining, it gets
   under a car; otherwise it finds the other fox or prowls; off the map it
   visits when its nerve is back. The brain (16-brains.js) starts from it. */

/* ---------------------------------------------------------------- the two of them */
const FOX_TRAITS = {
  dog:    { name:'Rab',   fearR:9,  instinctR:3, drain:1.0, lightK:1.0 },   // bold
  vixen:  { name:'Senga', fearR:16, instinctR:6, drain:1.6, lightK:1.5 }    // shy
};
const FOX_NERVE_SECS = 150;          // a full nerve lasts this long on a dark, empty car park
/* Not back until its nerve has properly recovered - instinct, not a choice
   (2026-10-13: the first fox training learned to pop in and out all night,
   nine short visits instead of five; Thomas wants them a treat). */
const FOX_RETURN_NERVE = 0.67;
const PEOPLE_KINDS = { granny:1, shopper:1, trolleyboy:1, manager:1, cleaner:1 };

/* ---------------------------------------------------------------- their world
   Saved with the moment: the bins, what has spilled, the splats. */
const BINS = [];                     // { x, y, tipped, fill }
const RUBBISH = [];                  // { x, y, c } - c: colour of the litter
const SPLATS = [];                   // { x, y, age }
const FOXW = { day:-1, nightFoxes:0 };
const COMPLAINTS = [];               // { x, y, t } - a boomer has moaned about the mess here
SAVE_MOMENT.push('BINS', 'RUBBISH', 'SPLATS', 'FOXW', 'COMPLAINTS');

/* The bins go against the store's rear wing in the service yard, on the first
   clear spots there are (found, not guessed: the yard is crowded). */
function foxWorldInit(){
  if (BINS.length || !WORLD || !WORLD.boxes) return;
  const spots = [];
  for (let y = Y1 - 26; y < Y1 - 3 && spots.length < 3; y += 1.4){
    const x = X1 + 1.5;
    if (sdfAt(x, y) > 0.6 && (!spots.length || y - spots[spots.length - 1][1] > 1.3)) spots.push([x, y]);
  }
  while (spots.length < 3) spots.push([X1 - 3 - spots.length * 1.4, Y1 - 6]);
  for (const s of spots) BINS.push({ x:s[0], y:s[1], tipped:false, fill:1 });
}
/* Once a step, from stepBeings: the bins fill again each morning, some stray
   trolleys get carrot scraps left in them, and splats dry up or wash away. */
function foxWorldStep(dt){
  foxWorldInit();
  if (FOXW.day !== DAY_N && TOD > 0.3 && TOD < 0.5){
    FOXW.day = DAY_N;
    for (const bn of BINS) if (!bn.tipped) bn.fill = 1;
    for (let i = 0; i < MOVERS.length; i++) MOVERS[i].carrot = pick01(i + 1, 300 + DAY_N) < 0.35;
  }
  boomerMoans(dt);
  const wash = WX.rain > 0.2 ? 4 : 1;
  for (let i = SPLATS.length - 1; i >= 0; i--){
    SPLATS[i].age += dt * wash;
    if (SPLATS[i].age > 900) SPLATS.splice(i, 1);     // a quarter of an hour: a fox at dusk finds the day's
  }
}
/* A gull taking off in a panic leaves a splat behind (Thomas). */
function gullSplat(g){
  if (SPLATS.length > 120) SPLATS.shift();
  SPLATS.push({ x:g.x + (RND.beings() - 0.5) * 0.6, y:g.y + (RND.beings() - 0.5) * 0.6, age:0 });
}
/* A fox's pounce: every gull close by goes up, squawking, and splats. */
function gullStartle(g, fx, fy){
  if (g.z > 0.2 || g.leavingTo) return;
  g.state = poseOr(g, 'wings-out'); g.vz = 3.4;
  const away = Math.atan2(g.y - fy, g.x - fx);
  g.tx = g.x + Math.cos(away) * 14; g.ty = g.y + Math.sin(away) * 14;
  g.hold = 2.2;
  gullSplat(g);
}

/* How lit a spot is at night: the lamp pools, and the store frontage's glare
   over the prime row. 0 dark, 1 standing under a lamp. */
function lampLight(x, y){
  const nk = 1 - daylight();
  if (nk <= 0) return 0;
  let L = 0;
  for (let i = 0; i < MASTS.length; i++){
    const b = lampBright(i);
    if (b < 0.02) continue;
    const R = 16 * (0.55 + 0.45 * b);
    const d = Math.hypot(x - MASTS[i][0], y - MASTS[i][1]);
    if (d < R){ const f = 1 - d / R; L = Math.max(L, b * f * f * nk); }
  }
  if (y < Y0 + WALK_W + PRIME_W + 4) L = Math.max(L, 0.4 * nk);
  return Math.min(1, L);
}

/* ---------------------------------------------------------------- senses */
function nearestPerson(b){
  let best = null, bd = Infinity;
  for (const o of BEINGS){
    if (!PEOPLE_KINDS[o.kind] || beingAbsent(o)) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < bd){ bd = d; best = o; }
  }
  return best ? { who:best, d:bd } : null;
}
function otherFox(b){
  for (const o of BEINGS) if (o !== b && o.kind === 'fox' && !o.gone) return o;
  return null;
}
/* The nearest thing worth eating, and what it is. Bins only if there is
   something in them; trolleys only if they have carrot in them. */
function foxFood(b){
  let best = null, bd = 60;
  const take = function(kind, obj, x, y, weight){
    const d = Math.hypot(x - b.x, y - b.y) / weight;
    if (d < bd){ bd = d; best = { kind:kind, obj:obj, x:x, y:y }; }
  };
  for (const r of RUBBISH) take('rubbish', r, r.x, r.y, 1.6);
  for (const bn of BINS) if (!bn.tipped && bn.fill > 0) take('bin', bn, bn.x, bn.y, 2.0);
  for (const m of MOVERS) if (m.carrot && !m.tipped && !m.held && m.z <= 0.01) take('trolley', m, m.x, m.y, 1.2);
  for (const s of SPLATS) take('splat', s, s.x, s.y, 0.8);
  return best;
}
const FOX_SENSES = ['hunger', 'nerve', 'food nearby', 'a feast in reach', 'a gull about', 'a person - how close',
  'a car coming', 'the other fox - how close', 'the other fox is here', 'light here', 'rain', 'night left',
  'away from the car park', 'bold', 'curious right now', 'wet'];
function foxSenses(b){
  const one = function(x){ return Math.max(0, Math.min(1, x)); };
  const tr = FOX_TRAITS[b.foxKind] || FOX_TRAITS.dog;
  const fd = b.away ? null : foxFood(b);
  const p = b.away ? null : nearestPerson(b);
  const of = otherFox(b);
  let gull = 0;
  if (!b.away) for (const o of BEINGS)
    if (o.kind === 'gull' && !beingAbsent(o) && o.z < 0.6){ const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < 25) gull = Math.max(gull, 1 - d / 25); }
  /* How much night is left: from dusk (TOD 0.80) to first light (0.16). */
  const nl = TOD >= 0.80 ? 1 - (TOD - 0.80) / 0.36 : TOD < 0.16 ? (0.16 - TOD) / 0.36 : 0;
  return [
    one(b.hunger || 0),
    one(b.nerve || 0),
    fd ? one(1 - Math.hypot(fd.x - b.x, fd.y - b.y) / 60) : 0,
    fd && (fd.kind === 'bin' || fd.kind === 'rubbish') ? 1 : 0,
    gull,
    p ? one(1 - p.d / (tr.fearR * 2)) : 0,
    b.away ? 0 : carThreat(b),
    of && !of.away && !b.away ? one(1 - Math.hypot(of.x - b.x, of.y - b.y) / 40) : 0,
    of && !of.away ? 1 : 0,
    b.away ? 0 : lampLight(b.x, b.y),
    one(WX.rain),
    one(nl),
    b.away ? 1 : 0,
    b.foxKind === 'dog' ? 1 : 0,
    p && p.d > tr.instinctR && p.d < tr.fearR * 1.3 ? 1 : 0,
    b.wetT > 0 ? one(b.wetT / 60) : 0
  ];
}

/* ---------------------------------------------------------------- how a fox feels */
const FOX_FEEL = {
  hungerPerMin:-0.15,   // times how hungry
  rubbish:0.3, carrot:0.25, splat:0.06, tip:0.3, binTip:0.2,
  pounce:0.1,           // the fun of it - it never catches one
  companyPerMin:0.3,    // the other fox close by
  curiousPerMin:0.25,   // a good look at a person, from the dark, at a safe distance
  fearPerMin:-0.5,      // a person inside its fear distance
  bolted:-0.2,          // made to run
  lightPerMin:-0.4,     // standing in a lamp pool (x how lit, x how much it minds)
  wetPerMin:-0.3,
  daylightPerMin:-0.8   // caught out on the car park as it gets light
};
const FOX_SECS = 30;
function foxFelt(b, part, v){
  b.feel = (b.feel || 0) + v;
  const f = b.feelBy || (b.feelBy = {});
  f[part] = (f[part] || 0) + v;
  if (!CENSUS.mute) brainOf('fox').life.feel += v;
}
function foxFeel(b, dt, tr){
  const F = FOX_FEEL, m = dt / 60, L = brainOf('fox').life, live = !CENSUS.mute;
  const night = isNight();
  if (night && live) L.nightMins += m;
  b.hunger = Math.min(1.5, (b.hunger || 0) + dt / 600);
  foxFelt(b, 'hunger', F.hungerPerMin * Math.min(1, b.hunger) * m);
  if (!b.away){
    if (live) L.onMins += m;
    const lit = lampLight(b.x, b.y);
    if (lit > 0.05){ foxFelt(b, 'light', F.lightPerMin * lit * tr.lightK * m); if (live) L.litMins += m * lit; }
    const p = nearestPerson(b);
    if (p && p.d < tr.fearR) foxFelt(b, 'fear', F.fearPerMin * (1 - p.d / tr.fearR) * m);
    if ((b.fmode === 'watch' || b.fmode === 'freeze') && p && p.d > tr.instinctR && p.d < tr.fearR * 1.3 && lit < 0.3)
      foxFelt(b, 'curious', F.curiousPerMin * m);
    const of = otherFox(b);
    if (of && !of.away && Math.hypot(of.x - b.x, of.y - b.y) < 5){ foxFelt(b, 'company', F.companyPerMin * m); if (live) L.pairMins += m; }
    if (rainHere(b.x, b.y) > 0.22 && b.fmode !== 'shelter'){ b.wetT = (b.wetT || 0) + dt; foxFelt(b, 'wet', F.wetPerMin * m); }
    else b.wetT = Math.max(0, (b.wetT || 0) - dt);
    const day = daylight();
    if (day > 0.1) foxFelt(b, 'daylight', F.daylightPerMin * day * m);
  }
  /* Settle choices whose thirty seconds are up (a fox's visit can end a
     choice early: everything open is settled as it leaves). */
  foxSettle(b, false);
}
function foxSettle(b, all){
  if (!b.diary || !b.diary.length) return;
  const kb = brainOf('fox'), done = [];
  while (b.diary.length && (all || simClock - b.diary[0].t >= FOX_SECS)){
    const e = b.diary.shift();
    if (e.f0 === undefined) continue;
    e.credit = +((b.feel || 0) - e.f0).toFixed(4);
    const rec = { d:e.d, s:e.s, a:e.a, credit:e.credit, score:null, fox:b.foxKind };
    kb.replay.push(rec);
    if (kb.replay.length > REPLAY_MAX) kb.replay.shift();
    if (kb.tap) kb.tap.push(rec);
    done.push(e);
  }
  if (done.length && kb.policy === 'net') brainLearn(kb, b.brain || null, done, 'fox');
}

/* ---------------------------------------------------------------- the fox, every step
   Called from stepBeings for every fox. Returns true when the fox is off the
   map (handled entirely here); false when it is on the car park, where its
   behaviour (BEHAVE.fox -> foxOnMap) runs as for any being. */
function foxStep(b, dt){
  if (!b.foxKind){
    let dogs = 0;
    for (const o of BEINGS) if (o !== b && o.kind === 'fox' && o.foxKind === 'dog') dogs++;
    b.foxKind = dogs ? 'vixen' : 'dog';
    b.name = FOX_TRAITS[b.foxKind].name;
    b.nerve = 1; b.hunger = 0.3;
    if (!isNight()) foxGoOff(b, 'den');
  }
  const tr = FOX_TRAITS[b.foxKind];
  if (b.held) return false;
  foxFeel(b, dt, tr);
  if (!b.away) return false;
  /* ---- off the map: the den, or the tip */
  b.nerve = Math.min(1, (b.nerve || 0) + dt / (b.where === 'den' ? 150 : 220));   // slow: visits are a treat
  if (b.where === 'tip'){
    b.tipT -= dt;
    if (b.tipT <= 0){
      b.where = 'den';
      b.hunger = Math.max(0, b.hunger - 0.6);
      foxFelt(b, 'food', FOX_FEEL.tip);
      if (!CENSUS.mute) brainOf('fox').life.tipTrips++;
    }
    return true;
  }
  if (!isNight()) return true;                         // asleep in the den till dusk
  if (b.nerve < FOX_RETURN_NERVE) return true;         // not yet: still settling its nerves
  b.askT = (b.askT || 0) - dt;
  if (b.askT > 0) return true;
  b.askT = 20;
  const act = decide('foxGo', b);
  if (act === 'visit') foxArrive(b);
  else if (act === 'tip'){ b.where = 'tip'; b.tipT = 60 + RND.beings() * 40; }
  return !!b.away;
}
function foxGoOff(b, where){
  foxSettle(b, true);
  b.away = true; b.where = where; b.fmode = null; b.fmodeT = 0;
  if (where === 'tip') b.tipT = 60 + RND.beings() * 40;
}
/* In through the railway fence, somewhere along the south side. */
function foxArrive(b){
  let x = X0 + 10 + RND.beings() * (PARK_L - 20), y = Y1 - 1.2;
  for (let k = 0; k < 8 && sdfAt(x, y) < 0.3; k++) x = X0 + 10 + RND.beings() * (PARK_L - 20);
  b.x = x; b.y = y; b.z = 0;
  b.away = false; b.where = null; b.fmode = null; b.fmodeT = 0; b.decideT = 0;
  b.tx = x; b.ty = y - 4;
  if (!CENSUS.mute) brainOf('fox').life.visits++;
  exciteAt(b.x, b.y, 18);                              // a fox! the cameras want this
}

/* ---- on the car park. Instinct first (the bits no brain may learn past),
   then any running action, then a choice. */
function foxOnMap(b, dt){
  const tr = FOX_TRAITS[b.foxKind] || FOX_TRAITS.dog;
  /* The cameras love a fox; more so the pair together. */
  exciteAt(b.x, b.y, 3 * dt);
  const of = otherFox(b);
  if (of && !of.away && Math.hypot(of.x - b.x, of.y - b.y) < 6) exciteAt(b.x, b.y, 3 * dt);
  /* Nerve drains: faster in the light and near people. Out of nerve, or
     daylight coming, or the visit has gone on long enough: away it slips. */
  const lit = lampLight(b.x, b.y);
  const p = nearestPerson(b);
  const nearK = p && p.d < tr.fearR ? 1 + 2 * (1 - p.d / tr.fearR) : 1;
  b.nerve -= dt / FOX_NERVE_SECS * tr.drain * (1 + 2 * lit * tr.lightK) * nearK;
  if (b.fmode !== 'leave' && (b.nerve <= 0 || daylight() > 0.35)) foxStartLeave(b, b.hunger > 0.6 ? 'tip' : 'den');
  if (b.fmode === 'leave'){
    b.state = poseOr(b, 'trot');
    if (walkTo(b, dt, b.k.speed * 1.3) || b.y > Y1 - 1.6) foxGoOff(b, b.leaveTo || 'den');
    return;
  }
  /* A person too close, or a car really coming: bolt. Instinct. */
  const threat = carThreat(b);
  if ((p && p.d < tr.instinctR) || threat > 0.5){
    if (b.fmode !== 'bolt'){ foxFelt(b, 'bolted', FOX_FEEL.bolted); if (!CENSUS.mute) brainOf('fox').life.bolts++; }
    foxBolt(b, p ? p.who : null);
  } else if (((p && p.d < tr.fearR) || threat > 0.15) && !(b.fmode === 'bolt' || b.fmode === 'freeze' || b.fmode === 'slink')
             && simClock - (b.threatAsk || -1e9) > 4){
    /* Inside its fear distance: bolt, freeze and stare, or slink round. */
    b.threatAsk = simClock;
    const act = decide('foxThreat', b);
    if (act === 'bolt') foxBolt(b, p ? p.who : null);
    else if (act === 'freeze'){ b.fmode = 'freeze'; b.fmodeT = 2 + RND.beings() * 2; b.staring = p ? p.who : null; }
    else {
      const from = p ? p.who : car;
      const a = Math.atan2(b.y - from.y, b.x - from.x) + (RND.beings() < 0.5 ? 1.2 : -1.2);
      b.tx = b.x + Math.cos(a) * 9; b.ty = b.y + Math.sin(a) * 9;
      b.fmode = 'slink'; b.fmodeT = 4;
    }
  }
  /* What it is doing now. */
  b.fmodeT = (b.fmodeT || 0) - dt;
  const m = b.fmode;
  if (m === 'bolt'){
    b.state = poseOr(b, 'trot'); walkTo(b, dt, 4.4);
    if (b.fmodeT <= 0) b.fmode = null;
    return;
  }
  if (m === 'freeze'){
    b.state = poseOr(b, 'alert'); b.moving = false;
    if (b.staring) b.h = Math.atan2(b.staring.y - b.y, b.staring.x - b.x);
    if (b.fmodeT <= 0) b.fmode = null;
    return;
  }
  if (m === 'slink'){
    b.state = poseOr(b, 'trot');
    if (walkTo(b, dt, b.k.speed * 0.7) || b.fmodeT <= 0) b.fmode = null;
    return;
  }
  if (m === 'eat'){
    b.state = poseOr(b, 'sniff'); b.moving = false;
    if (b.fmodeT <= 0) b.fmode = null;
    return;
  }
  if (m === 'watch' || m === 'shelter' || m === 'sit'){
    b.state = poseOr(b, m === 'watch' ? 'alert' : 'sniff'); b.moving = false;
    if (m === 'watch' && b.staring) b.h = Math.atan2(b.staring.y - b.y, b.staring.x - b.x);
    if (m === 'shelter' && WX.rain < 0.1) b.fmodeT = 0;
    if (b.fmodeT <= 0) b.fmode = null;
    return;
  }
  /* Going somewhere for a reason: get there, then do the thing. */
  if (m === 'go'){
    const g = b.goal;
    if (g && g.kind === 'stalk' && g.obj){ b.tx = g.obj.x; b.ty = g.obj.y; }
    if (g && g.kind === 'join' && g.obj){ b.tx = g.obj.x; b.ty = g.obj.y; }
    const sp = g && g.kind === 'stalk' ? b.k.speed * 0.45 : b.k.speed;
    b.state = poseOr(b, 'trot');
    const there = walkTo(b, dt, sp) || (g && g.kind === 'stalk' && g.obj && Math.hypot(g.obj.x - b.x, g.obj.y - b.y) < 3);
    if (there) foxReached(b, g);
    else if (b.fmodeT <= 0) b.fmode = null;        // given up on it
    return;
  }
  /* Nothing on: a choice, every few seconds. */
  b.decideT = (b.decideT || 0) - dt;
  if (b.decideT > 0){
    b.state = poseOr(b, Math.sin(b.anim * 2) > 0.9 ? 'alert' : 'sniff');
    return;
  }
  b.decideT = 2.5;
  const act = decide('foxNext', b);
  foxDo(b, act, tr);
}
function foxBolt(b, from){
  const ax = from ? from.x : car.x, ay = from ? from.y : car.y;
  const away = Math.atan2(b.y - ay, b.x - ax);
  b.tx = b.x + Math.cos(away) * 20; b.ty = b.y + Math.sin(away) * 20;
  b.fmode = 'bolt'; b.fmodeT = 2.5;
}
function foxStartLeave(b, to){
  b.fmode = 'leave'; b.leaveTo = to;
  b.tx = Math.max(X0 + 4, Math.min(X1 - 4, b.x)); b.ty = Y1 - 1.2;
}
function foxDo(b, act, tr){
  if (act === 'forage'){
    const f = foxFood(b);
    if (f){ b.goal = f; b.tx = f.x; b.ty = f.y; b.fmode = 'go'; b.fmodeT = 25; return; }
  } else if (act === 'stalk'){
    let g = null, gd = 25;
    for (const o of BEINGS)
      if (o.kind === 'gull' && !beingAbsent(o) && o.z < 0.3){ const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < gd){ gd = d; g = o; } }
    if (g){ b.goal = { kind:'stalk', obj:g }; b.fmode = 'go'; b.fmodeT = 20; return; }
  } else if (act === 'watch'){
    const p = nearestPerson(b);
    if (p && p.d < 30){
      /* Somewhere at the edge of its fear distance, on the darker side. */
      let best = null, bl = 2;
      for (let k = 0; k < 6; k++){
        const a = k / 6 * 6.2832, r = tr.fearR * 1.1;
        const x = p.who.x + Math.cos(a) * r, y = p.who.y + Math.sin(a) * r;
        if (y > Y1 - 1 || y < Y0 + 1 || x < X0 + 1 || x > X1 + 3) continue;
        const l = lampLight(x, y) + Math.hypot(x - b.x, y - b.y) / 60;
        if (l < bl){ bl = l; best = [x, y]; }
      }
      if (best){ b.goal = { kind:'watch', obj:p.who }; b.tx = best[0]; b.ty = best[1]; b.fmode = 'go'; b.fmodeT = 20; return; }
    }
  } else if (act === 'join'){
    const of = otherFox(b);
    if (of && !of.away){ b.goal = { kind:'join', obj:of }; b.fmode = 'go'; b.fmodeT = 25; return; }
  } else if (act === 'shelter'){
    let best = null, bd = 30;
    for (const bay of BAYS){
      if (!bay.car) continue;
      const bx = WORLD.boxes[bay.box];
      if (!bx) continue;
      const d = Math.hypot(bx.x - b.x, bx.y - b.y);
      if (d < bd){ bd = d; best = bay; }
    }
    if (best){ const st = bayStand(best); b.goal = { kind:'shelter' }; b.tx = st[0]; b.ty = st[1]; b.fmode = 'go'; b.fmodeT = 20; return; }
  } else if (act === 'leave'){
    foxStartLeave(b, b.hunger > 0.6 ? 'tip' : 'den');
    return;
  }
  /* prowl - or anything above with nothing to do it to. */
  wanderTarget(b, 5);
  b.goal = { kind:'prowl' }; b.fmode = 'go'; b.fmodeT = 12;
}
/* Got there. */
function foxReached(b, g){
  b.fmode = null;
  if (!g) return;
  const live = !CENSUS.mute, L = brainOf('fox').life;
  if (g.kind === 'bin'){
    const bn = g.obj;
    if (!bn.tipped && bn.fill > 0){
      /* Over it goes. A feast, and a mess for the morning. */
      bn.tipped = true;
      const n = 6 + Math.floor(RND.beings() * 5);
      const cols = ['#e8e4d8', '#c9b48a', '#5f7fae', '#d24b3f', '#e8e4d8', '#7a8a5a'];
      for (let i = 0; i < n; i++)
        RUBBISH.push({ x:bn.x - 0.8 - RND.beings() * 2.4, y:bn.y + (RND.beings() - 0.5) * 2.6,
                       c:cols[Math.floor(RND.beings() * cols.length)] });
      bn.fill = 0;
      foxFelt(b, 'binTip', FOX_FEEL.binTip);
      if (live) L.bins++;
      exciteAt(bn.x, bn.y, 25);
    }
  } else if (g.kind === 'rubbish'){
    const i = RUBBISH.indexOf(g.obj);
    if (i >= 0){
      RUBBISH.splice(i, 1);
      b.hunger = Math.max(0, b.hunger - 0.12);
      foxFelt(b, 'food', FOX_FEEL.rubbish);
      b.fmode = 'eat'; b.fmodeT = 2;
      if (live) L.ate++;
    }
  } else if (g.kind === 'trolley'){
    const t = g.obj;
    if (t.carrot && !t.tipped && !t.held){
      /* Nosed over, licked out. Kyle will have something to say. */
      t.tipped = true; t.carrot = false;
      b.hunger = Math.max(0, b.hunger - 0.15);
      foxFelt(b, 'food', FOX_FEEL.carrot);
      b.fmode = 'eat'; b.fmodeT = 5;
      if (live) L.trolleys++;
      exciteAt(t.x, t.y, 10);
    }
  } else if (g.kind === 'splat'){
    const i = SPLATS.indexOf(g.obj);
    if (i >= 0){
      SPLATS.splice(i, 1);
      b.hunger = Math.max(0, b.hunger - 0.03);
      foxFelt(b, 'food', FOX_FEEL.splat);
      b.fmode = 'eat'; b.fmodeT = 1;
      if (live) L.splats++;
    }
  } else if (g.kind === 'stalk'){
    /* The pounce. Never a catch: up they all go, and down come the splats. */
    let n = 0;
    for (const o of BEINGS)
      if (o.kind === 'gull' && !beingAbsent(o) && Math.hypot(o.x - b.x, o.y - b.y) < 4){ gullStartle(o, b.x, b.y); n++; }
    if (n){ foxFelt(b, 'pounce', FOX_FEEL.pounce); if (live) L.pounces++; exciteAt(b.x, b.y, 15); }
  } else if (g.kind === 'watch'){
    b.fmode = 'watch'; b.fmodeT = 4 + RND.beings() * 4; b.staring = g.obj;
  } else if (g.kind === 'shelter'){
    b.fmode = 'shelter'; b.fmodeT = 30;
  } else if (g.kind === 'join'){
    b.fmode = 'sit'; b.fmodeT = 3 + RND.beings() * 4;
  }
}

/* ---------------------------------------------------------------- the others' side of it */
/* Ralph (Thomas, 2026-10-13): the cleaner. A half day from seven, pushing his
   cart, broom in hand: the night's rubbish swept up, gull splats scrubbed,
   tipped bins stood up again. Nothing to do, he sweeps along the shop front.
   The gulls get a head start on the litter at first light, and the foxes
   would rather have had the splats - whoever is there before the broom. */
function cleanerStep(b, dt){
  if (b.grumbleT > 0) b.grumbleT -= dt;
  if (b.hold > 0){ b.hold -= dt; b.state = b.look; b.moving = false; return; }
  let tgt = null, td = 160;
  for (const r of RUBBISH){ const d = Math.hypot(r.x - b.x, r.y - b.y); if (d < td){ td = d; tgt = r; } }
  for (const bn of BINS) if (bn.tipped){ const d = Math.hypot(bn.x - b.x, bn.y - b.y) + 4; if (d < td){ td = d; tgt = bn; } }
  for (const s of SPLATS){ const d = Math.hypot(s.x - b.x, s.y - b.y) + 8; if (d < td){ td = d; tgt = s; } }
  if (!tgt){
    /* The shop front, slowly, back and forth. */
    if (!b.sweepTo || Math.hypot(b.sweepTo[0] - b.x, b.sweepTo[1] - b.y) < 1.2)
      b.sweepTo = [X0 + 30 + RND.beings() * (PARK_L - 50), Y0 + WALK_W + PRIME_W + 2];
    b.tx = b.sweepTo[0]; b.ty = b.sweepTo[1]; b.state = b.look;
    walkTo(b, dt, b.k.speed * 0.6);
    return;
  }
  b.tx = tgt.x; b.ty = tgt.y; b.state = b.look;
  if (walkTo(b, dt, b.k.speed) || Math.hypot(tgt.x - b.x, tgt.y - b.y) < 1.4){
    let i = RUBBISH.indexOf(tgt);
    if (i >= 0) RUBBISH.splice(i, 1);
    else if ((i = SPLATS.indexOf(tgt)) >= 0) SPLATS.splice(i, 1);
    else { tgt.tipped = false; b.grumbleT = 5; }
    b.hold = 1.4;
    if (!CENSUS.mute) CENSUS.ev.tidied = (CENSUS.ev.tidied || 0) + 1;
  }
}
/* Thomas, 2026-10-13: Derek, Gordon and Kyle do a bit of tidying - "only if
   the boomer moans about the mess". A short-tempered driver going past litter,
   a tipped bin or a tipped trolley moans about it (once a car), and that goes
   down as a complaint; whichever of them is about and free goes and sorts that
   spot. Ralph does the real cleaning; this is the occasional extra. */
const BOOMER_TEMPER = 0.8;
function messNear(x, y, r){
  for (const o of RUBBISH) if (Math.hypot(o.x - x, o.y - y) < r) return o;
  for (const bn of BINS) if (bn.tipped && Math.hypot(bn.x - x, bn.y - y) < r) return bn;
  for (const m of MOVERS) if (m.tipped && !m.held && Math.hypot(m.x - x, m.y - y) < r) return m;
  return null;
}
function boomerMoans(dt){
  for (const c of CARS){
    if (c.moanT > 0) c.moanT -= dt;
    if (c.moaned || c.done || c.tow || temperOf(c) < BOOMER_TEMPER || Math.abs(c.spd) < 0.5) continue;
    if ((SIM_TICK + (c.cid.length * 7)) % 60 !== 0) continue;          // looks about once a half-second
    const m = messNear(c.x, c.y, 8);
    if (!m) continue;
    c.moaned = true; c.moanT = 4;
    if (COMPLAINTS.length < 6) COMPLAINTS.push({ x:m.x, y:m.y, t:simClock });
    if (!CENSUS.mute) CENSUS.ev.moans = (CENSUS.ev.moans || 0) + 1;
  }
  for (let i = COMPLAINTS.length - 1; i >= 0; i--){
    const q = COMPLAINTS[i];
    if (simClock - q.t > 240 || !messNear(q.x, q.y, 3)) COMPLAINTS.splice(i, 1);   // sorted, or forgotten
  }
}
/* Derek, Gordon or Kyle: a complaint to answer? Off they go; everything messy
   within three metres of it is put right. True while busy with it. */
function staffAnswer(b, dt){
  if (!COMPLAINTS.length) return false;
  let q = null, qd = 140;
  for (const c of COMPLAINTS){
    if (c.by && c.by !== b && !c.by.gone && !beingAbsent(c.by)) continue;   // somebody is on it
    const d = Math.hypot(c.x - b.x, c.y - b.y);
    if (d < qd){ qd = d; q = c; }
  }
  if (!q) return false;
  q.by = b;
  b.tx = q.x; b.ty = q.y; b.state = b.look;
  if (walkTo(b, dt, b.k.speed) || Math.hypot(q.x - b.x, q.y - b.y) < 1.6){
    for (let i = RUBBISH.length - 1; i >= 0; i--)
      if (Math.hypot(RUBBISH[i].x - q.x, RUBBISH[i].y - q.y) < 3) RUBBISH.splice(i, 1);
    for (const bn of BINS) if (bn.tipped && Math.hypot(bn.x - q.x, bn.y - q.y) < 3) bn.tipped = false;
    for (const m of MOVERS) if (m.tipped && !m.held && Math.hypot(m.x - q.x, m.y - q.y) < 3) m.tipped = false;
    COMPLAINTS.splice(COMPLAINTS.indexOf(q), 1);
    b.hold = 1.5; b.grumbleT = 5;
    if (!CENSUS.mute) CENSUS.ev.staffTidied = (CENSUS.ev.staffTidied || 0) + 1;
  }
  return true;
}
function cleanerThought(b){
  if (b.grumbleT > 0) return pickLine(b, ['foxes again', 'every. single. morning.']);
  if (b.hold > 0) return 'sweep sweep';
  for (const r of RUBBISH) if (Math.hypot(r.x - b.x, r.y - b.y) < 6) return 'who EATS a crisp packet';
  for (const s of SPLATS) if (Math.hypot(s.x - b.x, s.y - b.y) < 6) return 'gulls. GULLS.';
  return pickLine(b, ['nice and quiet', 'radio two, a brew at nine', 'half day. lovely.']);
}
/* The gulls' share: rubbish beats rubber (a gull foraging asks this first). */
function nearestRubbish(b, r){
  let best = null, bd = r;
  for (const o of RUBBISH){ const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd){ bd = d; best = o; } }
  return best;
}

/* ---------------------------------------------------------------- what they think */
function foxThought(b){
  if (b.fmode === 'leave') return b.leaveTo === 'tip' ? 'off to the tip' : 'home';
  if (b.fmode === 'bolt') return 'NOPE';
  if (b.fmode === 'freeze' || b.fmode === 'watch') return pickLine(b, ['i see you', '...', 'don\'t mind me']);
  if (b.fmode === 'shelter') return 'not in this';
  if (b.fmode === 'eat') return b.goal && b.goal.kind === 'trolley' ? 'carrots!' : pickLine(b, ['mine', 'lovely']);
  if (b.fmode === 'go' && b.goal){
    if (b.goal.kind === 'bin') return 'bins. BINS.';
    if (b.goal.kind === 'stalk') return pickLine(b, ['...', 'steady...']);
    if (b.goal.kind === 'join') return 'there you are';
  }
  if (lampLight(b.x, b.y) > 0.4) return 'too bright';
  return pickLine(b, ['nobody here but me', 'the bins are this way']);
}

/* ---------------------------------------------------------------- drawing */
/* Bins: a dark green wheelie bin, upright or on its side. */
function foxWorldItems(){
  const out = [];
  /* Ralph's cart, pushed in front of him, and his broom stood up in it. */
  for (const c of BEINGS){
    if (c.kind !== 'cleaner' || beingAbsent(c)) continue;
    const ch = Math.cos(c.h), sh = Math.sin(c.h), x = c.x + ch * 0.95, y = c.y + sh * 0.95;
    out.push({ cid:c.cid + 'cart', X:x, Y:y, L:0.85, W:0.55, rot:c.h, z0:0.15, z1:0.8, col:'#d9b23a' });
    out.push({ cid:c.cid + 'cart', X:x - ch * 0.2, Y:y - sh * 0.2, L:0.5, W:0.4, rot:c.h, z0:0.8, z1:0.95, col:'#3a6fb0' });
    out.push({ cid:c.cid + 'cart', X:x + ch * 0.3 + sh * 0.22, Y:y + sh * 0.3 - ch * 0.22, L:0.05, W:0.05, rot:c.h, z0:0.6, z1:1.9, col:'#8a6a4a' });
  }
  for (let i = 0; i < BINS.length; i++){
    const bn = BINS[i], h = -Math.PI / 2;
    const ch = Math.cos(h), sh = Math.sin(h);
    if (!bn.tipped){
      out.push({ cid:'bin' + i, X:bn.x, Y:bn.y, L:0.66, W:0.6, rot:h, z0:0.05, z1:1.0, col:'#2f5a3c' });
      out.push({ cid:'bin' + i, X:bn.x, Y:bn.y, L:0.72, W:0.64, rot:h, z0:1.0, z1:1.08, col:'#25472f' });
    } else {
      out.push({ cid:'bin' + i, X:bn.x - 0.5 * ch, Y:bn.y - 0.5 * sh, L:1.0, W:0.6, rot:h + Math.PI / 2, z0:0.0, z1:0.62, col:'#2f5a3c' });
    }
  }
  return out;
}
/* Rubbish and splats: flat, like the rubber marks. */
function drawFoxGround(){
  for (const r of RUBBISH){
    const p = P(r.x, r.y);
    g2.fillStyle = r.c;
    g2.fillRect(SX(p) - 1.6, SY(p, 0) - 1.1, 3.2, 2.2);
  }
  for (const s of SPLATS){
    const p = P(s.x, s.y);
    g2.fillStyle = 'rgba(240,240,232,' + Math.max(0.15, 0.85 - s.age / 300).toFixed(3) + ')';
    g2.beginPath(); g2.arc(SX(p), SY(p, 0), 1.2, 0, 6.2832); g2.fill();
  }
}
