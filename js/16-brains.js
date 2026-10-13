/* Tesco Trueno - 16-brains.js
   The brain socket (pre-neural step 6, 2026-10-13).

   A being's behaviour is two things the old code did together: CHOOSING what
   to do, and DOING it (walking, steering, the physics, the character's own
   limits - a granny's half a metre a second, her patience). The doing stays
   where it is. The choosing, at the moments where there really is a choice,
   comes through here, the same way for every kind:

     SENSES   a short fixed list of numbers, 0..1, of what she could know
              standing where she is - never a look at the whole map.
     ACTIONS  a small menu of things SHE would do. Every option is in
              character, so whatever a brain learns she still reads as a
              granny: no olympian grannies (Thomas, 2026-10-13 - success is an
              entertaining view; a convincing granny improves her own day AND
              the viewer's).
     WHEN     decision moments (her car is not there; another granny is in
              chatting range; a shower has found her), not 120 times a second.
     SCORE    how she feels, as it happens (company good, wet and worry bad,
              time free - see GRANNY_FEEL); each choice is judged by the
              two minutes after it, her day by the lot.

   What plugs in is a POLICY, chosen per kind in BRAINS[kind].policy:
     'hand'    the hand-written logic, unchanged - the default. A day with
               'hand' everywhere is identical to the day before this file.
     'random'  any option on the menu, from its own random stream - the
               plumbing check, and the floor a brain has to beat.
     (next)    a learned one: same senses, same menu, same score.

   Whose brain: Thomas chose KIND + PERSONAL. Every granny shares the kind's
   brain (BRAINS.granny.kind - it learns from all of them, so it learns fast);
   each resident also carries a small personal one (resident.brain - her own
   habits, from her own visits). Both are the TOWN's, so they are saved with
   it and survive a new day (15-save.js).

   The experience a learner will need is kept as it happens: each decision
   (senses, choice) goes in the being's diary, and when her day is scored the
   diary goes into the kind's replay with the score attached. */

const BRAINS = {
  granny: {
    policy:'hand',
    kind:{},                               // the hive: a net.js network - empty until one is trained
    learnRate:0.003, dialRate:0.05,        // learning as the game goes (net policy only); 0 = frozen
    base:null,                             // her usual day, the yardstick a day is measured against
    days:{ n:0, sum:0, lost:0, chats:0, wet:0 },  // running tallies of scored days, for the lab
    made:{},                               // decision -> how often each option was taken
    replay:[]                              // [{ d, s, a, score, rid }], the newest REPLAY_MAX
  }
};
const REPLAY_MAX = 400, DIARY_MAX = 40;
SAVE_TOWN.push('BRAINS');                  // the learning is the town's, not the day's

/* ---------------------------------------------------------------- senses */
const GRANNY_SENSES = ['rain where she is', 'daylight', 'time without her car', 'how far she has searched',
  'distance to the doors', 'distance to where she parked', 'nearest moving car',
  'grannies nearby', 'a manager about', 'staff busy helping', 'just soaked', 'chats so far',
  'umbrella up'];
function lostSecs(b){
  return (b.lostSecs || 0) + (b.lostAt !== undefined && b.lostAt !== null ? simClock - b.lostAt : 0);
}
function grannySenses(b){
  const dr = nearestPlace(PLACES.doors, b.x, b.y);
  let carD = 99;
  for (const c of CARS){
    if (Math.abs(c.spd) < 0.3) continue;
    const d = Math.hypot(c.x - b.x, c.y - b.y);
    if (d < carD) carD = d;
  }
  let gr = 0;
  for (const o of BEINGS)
    if (o !== b && o.kind === 'granny' && !beingAbsent(o) && Math.hypot(o.x - b.x, o.y - b.y) < 15) gr++;
  const one = function(x){ return Math.max(0, Math.min(1, x)); };
  return [
    one(rainHere(b.x, b.y)),
    daylight(),
    one(lostSecs(b) / 180),
    one((b.huntRing || 0) / 5),
    one(Math.hypot(dr[0] - b.x, dr[1] - b.y) / 80),
    b.parkedAt ? one(Math.hypot(b.parkedAt[0] - b.x, b.parkedAt[1] - b.y) / 80) : 1,
    one(carD / 20),
    one(gr / 5),
    liveBeing('manager') ? 1 : 0,
    HELP.length ? 1 : 0,
    b.soakUntil !== undefined && simClock < b.soakUntil ? 1 : 0,
    one((b.chats || 0) / 3),
    brollyUp(b) ? 1 : 0
  ];
}

/* ---------------------------------------------------------------- the decisions
   hand(b, ctx) is the hand-written choice. It must not roll dice or change
   anything - the caller does what the choice says, exactly as before. */
const DECISIONS = {
  /* Her car is not where she left it, and there is no reason she knows of
     (a tow is a reason, and goes home without asking). */
  lostCar: { kind:'granny', senses:grannySenses,
             actions:['hunt', 'help', 'home'],     // look for it / go and ask / bus home, deal with it later
             hand:function(){ return 'hunt'; } },
  /* Not at this space either. */
  huntNext: { kind:'granny', senses:grannySenses,
              actions:['wider', 'closer', 'help'], // a bit further out / round here again / give up and ask
              hand:function(){ return 'wider'; } },
  /* Another granny, close enough to talk to. The hand-written one stops
     unless it is pouring and she has nothing over her head. */
  chat: { kind:'granny', senses:grannySenses,
          actions:['chat', 'nod'],                 // the weather, at length / a nod, and on
          hand:function(b){ return rainHere(b.x, b.y) > 0.3 && !brollyUp(b) ? 'nod' : 'chat'; } },
  /* A shower has found her on her way across. With an umbrella she presses
     on; without one, she waits it out at the doors if they are not far. */
  rain: { kind:'granny', senses:grannySenses,
          actions:['shelter', 'press on'],
          hand:function(b){
            if (brollyOf(b)) return 'press on';
            const dr = nearestPlace(PLACES.doors, b.x, b.y);
            return Math.hypot(dr[0] - b.x, dr[1] - b.y) < 35 ? 'shelter' : 'press on';
          } }
};

/* ---------------------------------------------------------------- a granny's moments
   Things that interrupt her walk. Returns true while one has her (the walk
   waits). Called for every granny with a visit, every step. */
const GRANNY_WALKS = { toDoors:1, toCar:1, toExit:1, hunting:1 };
const GRANNY_MUDDLE = 0.15;      // a granny who drove, setting off for last time's space
function grannyMoment(b, dt){
  const walking = GRANNY_WALKS[b.life] === 1 && !beingAbsent(b) && !b.held;
  grannyFeel(b, dt, walking);
  /* Talking. Facing each other, going nowhere. */
  if (b.chatT > 0){
    b.chatT -= dt;
    b.moving = false; b.state = b.look;
    if (b.chatFace !== undefined) b.h = b.chatFace;
    return true;
  }
  /* Waiting out a shower at the doors: there, then until it eases - or two
     minutes, when it is plainly not going off and she goes anyway. */
  if (b.shelter){
    if (b.shelterAt === undefined || b.shelterAt === null){
      b.tx = b.shelter[0]; b.ty = b.shelter[1]; b.state = b.look;
      if (walkTo(b, dt, b.k.speed)) b.shelterAt = simClock;
      return true;
    }
    b.moving = false; b.state = b.look;
    if (WX.rain < 0.12 || simClock - b.shelterAt > 120){ b.shelter = null; b.shelterAt = null; }
    return true;
  }
  if (!walking) return false;
  /* A shower: asked once a shower, and not on the way IN (she is going to the
     doors anyway). */
  if (WX.rain < 0.05) b.rainAsked = false;
  else if (!b.rainAsked && b.life !== 'toDoors' && rainHere(b.x, b.y) > 0.25){
    b.rainAsked = true;
    if (decide('rain', b) === 'shelter'){
      const dr = nearestPlace(PLACES.doors, b.x, b.y);
      b.shelter = [dr[0], dr[1] + 0.8];
      b.shelterAt = null;
      if (!CENSUS.mute) CENSUS.ev.sheltered = (CENSUS.ev.sheltered || 0) + 1;
      return true;
    }
  }
  /* Another granny within talking distance, who is also just walking - asked
     twice a second, and once per pair. It takes both of them. */
  b.chatLook = (b.chatLook || 0) - dt;
  if (b.chatLook <= 0){
    b.chatLook = 0.5;
    const o = chatPartner(b);
    if (o){
      (b.met = b.met || []).push(o.pid); if (b.met.length > 8) b.met.shift();
      (o.met = o.met || []).push(b.pid); if (o.met.length > 8) o.met.shift();
      if (decide('chat', b, { other:o }) === 'chat' && decide('chat', o, { other:b }) === 'chat'){
        b.chatT = o.chatT = 14 + RND.beings() * 16;       // the weather, and her hip
        b.chatFace = Math.atan2(o.y - b.y, o.x - b.x);
        o.chatFace = b.chatFace + Math.PI;
        b.chats = (b.chats || 0) + 1; o.chats = (o.chats || 0) + 1;
        if (!CENSUS.mute) CENSUS.ev.chats = (CENSUS.ev.chats || 0) + 1;
        return true;
      }
    }
  }
  return false;
}
function chatPartner(b){
  for (const o of BEINGS){
    if (o === b || o.kind !== 'granny' || GRANNY_WALKS[o.life] !== 1) continue;
    if (beingAbsent(o) || o.held || o.chatT > 0 || o.shelter) continue;
    if (Math.hypot(o.x - b.x, o.y - b.y) > 3.5) continue;
    if (b.met && b.met.indexOf(o.pid) >= 0) continue;
    return o;
  }
  return null;
}
/* ---------------------------------------------------------------- how she feels
   A running tally, added to as it happens. Each choice she makes is judged by
   what this tally did in the CHOICE_SECS after it - not by her whole day,
   where one good decision drowned in everything it had nothing to do with.

   Thomas, 2026-10-13: grannies get lonely. A quick efficient trip is just more
   time at home with daytime TV and the cat. So TIME COSTS HER NOTHING here;
   company is the prize (a natter, being looked after by staff, waiting out a
   shower at the doors with others), and being out of the house is worth a
   little in itself. What costs her is getting wet, worry, and losing the car. */
const GRANNY_FEEL = {
  wetPerMin:-0.3,       // out in the rain with nothing over her
  worryPerMin:-0.2,     // without her car - not the time, the worry
  chatPerMin:0.4,       // a natter
  helpedPerMin:0.2,     // being looked after by somebody from the shop
  crowdPerMin:0.15,     // sheltering at the doors in company
  outPerMin:0.05,       // out of the house at all...
  outCap:1.0,           // ...up to twenty minutes' worth
  soaked:-0.3,          // each splash from a car
  gaveUp:-0.5,          // going home without the car
  home:1.0, tay:-1.5,   // how the day ended (not any one choice's doing)
  beforeDark:0.2, afterDark:-0.2
};
const CHOICE_SECS = 120;
function grannyFelt(b, part, v){
  const f = b.feelBy || (b.feelBy = {});
  f[part] = (f[part] || 0) + v;
  b.feel = (b.feel || 0) + v;
}
function grannyFeel(b, dt, walking){
  if (beingAbsent(b) || b.held) return;
  const F = GRANNY_FEEL, m = dt / 60;
  if (walking && !b.shelter && rainHere(b.x, b.y) > 0.22 && !brollyUp(b)){
    b.wetSecs = (b.wetSecs || 0) + dt;
    grannyFelt(b, 'wet', F.wetPerMin * m);
  }
  if (b.lostAt !== undefined && b.lostAt !== null) grannyFelt(b, 'worry', F.worryPerMin * m);
  if (b.chatT > 0) grannyFelt(b, 'company', F.chatPerMin * m);
  else if (b.life === 'waitHelp' || b.life === 'following') grannyFelt(b, 'company', F.helpedPerMin * m);
  else if (b.shelterAt !== undefined && b.shelterAt !== null && somebodyNear(b, 4)) grannyFelt(b, 'company', F.crowdPerMin * m);
  if ((b.outF || 0) < F.outCap){
    const v = Math.min(F.outCap - (b.outF || 0), F.outPerMin * m);
    b.outF = (b.outF || 0) + v;
    grannyFelt(b, 'out', v);
  }
  const so = b.soaks || 0;
  if (so > (b.soaksFelt || 0)){ grannyFelt(b, 'soaked', F.soaked * (so - (b.soaksFelt || 0))); b.soaksFelt = so; }
  if (b.gaveUp && !b.gaveUpFelt){ b.gaveUpFelt = true; grannyFelt(b, 'gaveUp', F.gaveUp); }
  /* Choices whose two minutes are up: what came of them is now known. */
  if (b.diary) for (const e of b.diary)
    if (e.fH === undefined && e.f0 !== undefined && simClock - e.t >= CHOICE_SECS) e.fH = b.feel || 0;
}
function somebodyNear(b, r){
  for (const o of BEINGS){
    if (o === b || beingAbsent(o) || o.kind === 'gull' || o.kind === 'fox') continue;
    if (Math.hypot(o.x - b.x, o.y - b.y) < r) return true;
  }
  return false;
}

/* Where she thinks she parked: where she DID park last time she came, or -
   if this is the first time we have seen her drive - her usual sort of spot,
   from who she is. */
function lastSpotOf(r){
  if (r.lastSpot) return r.lastSpot;
  if (!BAYS.length) return null;
  return bayStand(BAYS[Math.floor(pick01(r.rid, 21) * BAYS.length)]);
}
/* Thomas's forgetful moment (2026-10-13): out of the shop, she sets off for
   last time's space, not today's. A problem for her with no god required -
   and the lost-car choices above come up on their own. */
function grannyMisremember(b){
  if (!b.res) return;
  const spot = lastSpotOf(b.res);
  const today = b.ownBay && b.ownBay.car ? bayStand(b.ownBay) : b.parkedAt;
  if (!spot || !today || Math.hypot(spot[0] - today[0], spot[1] - today[1]) < 12) return;
  if (RND.beings() >= GRANNY_MUDDLE) return;
  b.wrongSpot = [spot[0], spot[1]];
  b.misremembered = true;
  CENSUS.ev.misremembered = (CENSUS.ev.misremembered || 0) + 1;
  censusNote('went to last time\'s space', b.name);
}

/* ---------------------------------------------------------------- policies
   Each returns an option by name or index. `kb` is the kind's brain, `pb` the
   resident's own (null for somebody who is not a resident). */
const POLICIES = {
  hand: function(dp, b, s, kb, pb, ctx){ return dp.hand(b, ctx); },
  random: function(dp){ return Math.floor(RND.brains() * dp.actions.length); },
  /* The brain: the hive's chances for this decision's options, nudged by her
     own dials, and one picked by those chances - not always the likeliest,
     which is what keeps her from being a machine. */
  net: function(dp, b, s, kb, pb, ctx, name){
    const net = grannyHive(kb);
    if (!net) return dp.hand(b, ctx);
    const c = netChances(netForward(net, grannyInput(s, name)).z, GRANNY_SLOTS[name], pb && pb.dials);
    let r = RND.brains();
    for (let i = 0; i < c.p.length; i++){ r -= c.p[i]; if (r <= 0) return i; }
    return c.p.length - 1;
  }
};

/* ---------------------------------------------------------------- the granny brain
   Thomas, 2026-10-13: the hive (every granny's) has 22 neurons - 17 inputs
   (her 13 senses and which of the 4 decisions this is) into 12 hidden, out to
   10, one per option across the four menus. Each granny has 10 personal dials,
   one per option, added to the hive's answer: her own leanings. */
/* GRANNY_DECS, GRANNY_SLOTS, GRANNY_SHAPE and grannyInput are in net.js,
   so the lab wires her up exactly as the game does. */
/* The hive: her town's own if it has one, else the one shipped with the game
   (brains/granny.brain.js, trained in the lab). */
function grannyHive(kb){
  if (kb.kind && kb.kind.w1) return kb.kind;
  if (window.GRANNY_BRAIN && window.GRANNY_BRAIN.net){ kb.kind = netCopy(window.GRANNY_BRAIN.net); return kb.kind; }
  return null;
}
function grannyDials(pb){
  if (!pb.dials) pb.dials = new Array(GRANNY_SHAPE.nOut).fill(0);
  return pb.dials;
}
/* Learning as the game goes: after her day, each choice she made gets a
   little likelier if what followed it beat what usually follows that kind of
   choice, a little less if not. The yardstick is per decision (a chat is not
   measured against a lost car). The hive learns slowly from everybody; her
   dials faster, from her alone. */
function grannyLearn(kb, pb, diary){
  const net = grannyHive(kb);
  if (!net || !diary.length) return;
  const cb = kb.cbase || (kb.cbase = {});
  const adv = diary.map(function(e){
    if (cb[e.d] === undefined){ cb[e.d] = e.credit; return 0; }
    const a = Math.max(-1.5, Math.min(1.5, e.credit - cb[e.d]));
    cb[e.d] += 0.03 * (e.credit - cb[e.d]);
    return a;
  });
  if (kb.learnRate > 0){
    const acc = netZero(net);
    diary.forEach(function(e, i){
      if (adv[i]) netGrad(net, grannyInput(e.s, e.d), GRANNY_SLOTS[e.d], e.a, adv[i], acc, pb && pb.dials);
    });
    netStep(net, acc, kb.learnRate / diary.length, 0.05);
  }
  if (pb && kb.dialRate > 0){
    const dl = grannyDials(pb);
    diary.forEach(function(e, k){
      if (!adv[k]) return;
      const sl = GRANNY_SLOTS[e.d];
      const c = netChances(netForward(net, grannyInput(e.s, e.d)).z, sl, dl);
      for (let i = 0; i < sl.length; i++){
        dl[sl[i]] += kb.dialRate * adv[k] * ((i === e.a ? 1 : 0) - c.p[i]);
        dl[sl[i]] = Math.max(-1.5, Math.min(1.5, dl[sl[i]]));       // a leaning, not a personality transplant
      }
    });
  }
}

function decide(name, b, ctx){
  const dp = DECISIONS[name];
  const kb = BRAINS[dp.kind];
  const s = dp.senses(b, ctx);
  const pol = POLICIES[kb.policy] || POLICIES.hand;
  const pb = b.res ? (b.res.brain || (b.res.brain = { n:0, mean:0, bias:{} })) : null;
  let a = pol(dp, b, s, kb, pb, ctx, name);
  if (typeof a === 'string') a = dp.actions.indexOf(a);
  if (!(a >= 0 && a < dp.actions.length)) a = dp.actions.indexOf(dp.hand(b, ctx));
  if (!CENSUS.mute){
    const m = kb.made[name] || (kb.made[name] = dp.actions.map(function(){ return 0; }));
    m[a]++;
    const di = b.diary || (b.diary = []);
    di.push({ d:name, s:s, a:a, t:+simClock.toFixed(1), f0:b.feel || 0 });
    if (di.length > DIARY_MAX) di.shift();
  }
  return dp.actions[a];
}

/* ---------------------------------------------------------------- her day
   Weights in one place, to be argued about. Her own day first; the chats
   count twice over because they are her day AND the scene. */
/* Her day: the tally of how she felt, plus how it ended. The ending is not
   any one choice's doing, so it is in the day's score but not in a choice's. */
function scoreGrannyDay(b, how){
  if (CENSUS.mute || b.kind !== 'granny') return null;
  const F = GRANNY_FEEL;
  const lost = lostSecs(b);
  const parts = {};
  for (const k in (b.feelBy || {})) parts[k] = +b.feelBy[k].toFixed(3);
  parts.home = (how === 'walked' || how === 'bus' || how === 'drove') ? F.home : (how === 'vanished' ? 0 : F.tay);
  parts.dark = daylight() > 0.5 ? F.beforeDark : F.afterDark;
  const total = +((b.feel || 0) + parts.home + parts.dark).toFixed(3);
  /* Choices still inside their two minutes are judged by what there was. */
  for (const e of (b.diary || [])){
    if (e.f0 === undefined) continue;
    if (e.fH === undefined) e.fH = b.feel || 0;
    e.credit = +(e.fH - e.f0).toFixed(4);
  }
  const kb = BRAINS.granny;
  kb.days.n++; kb.days.sum += total; kb.days.lost += lost; kb.days.chats += b.chats || 0;
  kb.days.wet = (kb.days.wet || 0) + (b.wetSecs || 0);
  kb.days.company = (kb.days.company || 0) + ((b.feelBy && b.feelBy.company) || 0);
  const vis = b.res && b.res.visit;
  if (vis) vis.day = { score:total, parts:parts };
  if (b.res){
    const pb = b.res.brain || (b.res.brain = { n:0, mean:0, bias:{} });
    pb.n++; pb.mean += (total - pb.mean) / pb.n;
  }
  for (const e of (b.diary || [])){
    const rec = { d:e.d, s:e.s, a:e.a, score:total, credit:e.credit, rid:b.res ? b.res.rid : null };
    kb.replay.push(rec);
    if (kb.replay.length > REPLAY_MAX) kb.replay.shift();
    if (kb.tap) kb.tap.push(rec);           // the lab, collecting a run's experience
  }
  if (kb.policy === 'net') grannyLearn(kb, b.res ? b.res.brain : null, (b.diary || []).filter(function(e){ return e.credit !== undefined; }));
  b.diary = [];
  return total;
}
