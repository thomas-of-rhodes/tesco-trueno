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
     SCORE    how her day on the map went, in her terms, plus a smaller share
              for the person watching. Scored when she leaves the map.

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
    kind:{},                               // the shared brain - empty until one learns
    days:{ n:0, sum:0, lost:0, chats:0, wet:0 },  // running tallies of scored days, for the lab
    made:{},                               // decision -> how often each option was taken
    replay:[]                              // [{ d, s, a, score, rid }], the newest REPLAY_MAX
  }
};
const REPLAY_MAX = 400, DIARY_MAX = 40;
SAVE_TOWN.push('BRAINS');                  // the learning is the town's, not the day's

/* ---------------------------------------------------------------- senses */
const GRANNY_SENSES = ['raining', 'daylight', 'time without her car', 'how far she has searched',
  'distance to the doors', 'distance to where she parked', 'nearest moving car',
  'grannies nearby', 'a manager about', 'staff busy helping', 'just soaked', 'chats so far'];
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
    one(WX.rain),
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
    one((b.chats || 0) / 3)
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
  /* Her day: time out in the rain with nothing over her. */
  if (walking && !b.shelter && rainHere(b.x, b.y) > 0.22 && !brollyUp(b)) b.wetSecs = (b.wetSecs || 0) + dt;
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
  random: function(dp){ return Math.floor(RND.brains() * dp.actions.length); }
};

function decide(name, b, ctx){
  const dp = DECISIONS[name];
  const kb = BRAINS[dp.kind];
  const s = dp.senses(b, ctx);
  const pol = POLICIES[kb.policy] || POLICIES.hand;
  const pb = b.res ? (b.res.brain || (b.res.brain = { n:0, mean:0, bias:{} })) : null;
  let a = pol(dp, b, s, kb, pb, ctx);
  if (typeof a === 'string') a = dp.actions.indexOf(a);
  if (!(a >= 0 && a < dp.actions.length)) a = dp.actions.indexOf(dp.hand(b, ctx));
  if (!CENSUS.mute){
    const m = kb.made[name] || (kb.made[name] = dp.actions.map(function(){ return 0; }));
    m[a]++;
    const di = b.diary || (b.diary = []);
    di.push({ d:name, s:s, a:a, t:+simClock.toFixed(1) });
    if (di.length > DIARY_MAX) di.shift();
  }
  return dp.actions[a];
}

/* ---------------------------------------------------------------- her day
   Weights in one place, to be argued about. Her own day first; the chats
   count twice over because they are her day AND the scene. */
const GRANNY_DAY = {
  home:1.0,          // got home - walked, bus, or drove
  tay:-1.5,          // did not
  lostPer300s:-1.0,  // time spent without her car, up to five minutes
  soaked:-0.3,       // each soaking, up to two
  beforeDark:0.2,    // and they do want to be home before dark
  afterDark:-0.2,
  chat:0.15,         // each chat, up to three
  rainPerMin:-0.3,   // out in the rain with nothing over her, up to two minutes
  gaveUp:-0.5        // went home without the car: she has to come back for it
};
function scoreGrannyDay(b, how){
  if (CENSUS.mute || b.kind !== 'granny') return null;
  const W = GRANNY_DAY;
  const lost = lostSecs(b);
  const parts = {
    home: (how === 'walked' || how === 'bus' || how === 'drove') ? W.home : (how === 'vanished' ? 0 : W.tay),
    lost: W.lostPer300s * Math.min(1, lost / 300),
    soaked: W.soaked * Math.min(2, b.soaks || 0),
    dark: daylight() > 0.5 ? W.beforeDark : W.afterDark,
    chats: W.chat * Math.min(3, b.chats || 0),
    rain: W.rainPerMin * Math.min(2, (b.wetSecs || 0) / 60),
    gaveUp: b.gaveUp ? W.gaveUp : 0
  };
  let total = 0;
  for (const k in parts) total += parts[k];
  total = +total.toFixed(3);
  const kb = BRAINS.granny;
  kb.days.n++; kb.days.sum += total; kb.days.lost += lost; kb.days.chats += b.chats || 0;
  kb.days.wet = (kb.days.wet || 0) + (b.wetSecs || 0);
  const vis = b.res && b.res.visit;
  if (vis) vis.day = { score:total, parts:parts };
  if (b.res){
    const pb = b.res.brain || (b.res.brain = { n:0, mean:0, bias:{} });
    pb.n++; pb.mean += (total - pb.mean) / pb.n;
  }
  for (const e of (b.diary || [])){
    kb.replay.push({ d:e.d, s:e.s, a:e.a, score:total, rid:b.res ? b.res.rid : null });
    if (kb.replay.length > REPLAY_MAX) kb.replay.shift();
  }
  b.diary = [];
  return total;
}
