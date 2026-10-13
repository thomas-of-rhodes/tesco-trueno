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
              chatting range, or the chat is ending; a shower has found her;
              she is out of the shop; a gull, on a sunny day), not 120 times
              a second.
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
    policy:'net',                          // the shipped brain (v1.0, 2026-10-13); 'hand' for the old way
    kind:{},                               // the hive: a net.js network - empty until one is trained
    learnRate:0, dialRate:0.05,            // as the game goes: the shared hive stays as shipped,
                                           // each granny's own dials keep learning (0 = frozen)
    v:1,                                   // which shipped brain this town has been switched to
    base:null,                             // her usual day, the yardstick a day is measured against
    days:{ n:0, sum:0, lost:0, chats:0, wet:0 },  // running tallies of scored days, for the lab
    made:{},                               // decision -> how often each option was taken
    replay:[]                              // [{ d, s, a, score, rid }], the newest REPLAY_MAX
  }
};
/* The gulls (2026-10-13): hand-written until a brain is trained for them.
   Made on first use, through brainOf, because a town saved before gulls had
   brains loads a BRAINS without one. */
const BRAIN_NEW = {
  /* Gull brain v1.0 shipped 2026-10-13: the brain by default, its shared hive
     as shipped, each gull's own dials learning. */
  /* Foxes (17-foxes.js): fox brain v1.0 shipped 2026-10-13 - the brain by
     default, its shared hive as shipped, Rab's and Senga's own dials learning. */
  fox:function(){ return { policy:'net', kind:{}, learnRate:0, dialRate:0.05, base:null, v:1,
                           made:{}, replay:[],
                           life:{ nightMins:0, feel:0, onMins:0, visits:0, bins:0, trolleys:0, splats:0,
                                  ate:0, pounces:0, pairMins:0, litMins:0, bolts:0, tipTrips:0 } }; },
  gull:function(){ return { policy:'net', kind:{}, learnRate:0, dialRate:0.05, base:null, v:1,
                            made:{}, replay:[],
                            life:{ mins:0, feel:0, food:0, flock:0, frights:0, held:0, crumbs:0,
                                   heavy:0, left:0, arrived:0 } }; }
};
function brainOf(kind){
  return BRAINS[kind] || (BRAINS[kind] = BRAIN_NEW[kind]());
}
brainOf('gull');
brainOf('fox');
const REPLAY_MAX = 400, DIARY_MAX = 40;
SAVE_TOWN.push('BRAINS');                  // the learning is the town's, not the day's

/* ---------------------------------------------------------------- senses */
const GRANNY_SENSES = ['rain where she is', 'daylight', 'time without her car', 'how far she has searched',
  'distance to the doors', 'distance to where she parked', 'nearest moving car',
  'grannies nearby', 'a manager about', 'staff busy helping', 'just soaked', 'chats so far',
  'umbrella up', 'a car waiting on her', 'out of the house so far', 'gulls nearby'];
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
    brollyUp(b) ? 1 : 0,
    carWaitingNear(b) ? 1 : 0,
    one((b.outF || 0) / GRANNY_FEEL.outCap),
    one(gullsNear(b, 6) / 5)
  ];
}
/* A car stopped and waiting within six metres of her - she is in its way. */
function carWaitingNear(b){
  for (const c of CARS)
    if ((c.blocked || 0) > 1 && Math.hypot(c.x - b.x, c.y - b.y) < 6) return true;
  return false;
}
function gullsNear(b, r){
  let n = 0;
  for (const o of BEINGS)
    if (o.kind === 'gull' && !beingAbsent(o) && o.z < 0.6 && Math.hypot(o.x - b.x, o.y - b.y) < r) n++;
  return n;
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
          } },
  /* A chat has run its course: part, or another wee minute. Both have to want
     to. The hand-written granny parts. */
  linger: { kind:'granny', senses:grannySenses,
            actions:['part', 'another minute'],
            hand:function(){ return 'part'; } },
  /* Out of the shop: straight off, a wee wander round first, or back in for
     the thing she forgot. The hand-written granny goes straight off. */
  afterShop: { kind:'granny', senses:grannySenses,
               actions:['go', 'wander', 'back in'],
               hand:function(){ return 'go'; } },
  /* A gull on a sunny day, and crumbs in her purse (Thomas, 2026-10-13). The
     hand-written granny always feeds it. One gull is the best bit of her day;
     a crowd of them is a fright. */
  gulls: { kind:'granny', senses:grannySenses,
           actions:['feed', 'walk on'],
           hand:function(){ return 'feed'; } },

  /* ---- the gulls. Every few seconds on the ground: forage (what a gull has
     always done - crumbs first, then tyre rubber), join the others, or loaf.
     The hand-written gull forages. */
  gullNext: { kind:'gull', senses:gullSenses,
              actions:['forage', 'flock', 'loaf'],
              hand:function(){ return 'forage'; } },
  /* A car coming: fly, or hold its nerve a moment (a really close one is
     instinct, not a choice - 12-beings.js). The hand-written gull flies. */
  gullThreat: { kind:'gull', senses:gullSenses,
                actions:['fly', 'hold'],
                hand:function(){ return 'fly'; } },

  /* ---- the foxes (17-foxes.js). Off the map, now and then by night: visit
     the car park, go to the tip, or rest. The hand-written fox visits once
     its nerve is back, goes to the tip if very hungry, else rests. */
  foxGo: { kind:'fox', senses:function(b){ return foxSenses(b); },
           actions:['visit', 'tip', 'rest'],
           hand:function(b){ return (b.nerve || 0) >= 0.9 ? 'visit' : (b.hunger || 0) > 0.6 ? 'tip' : 'rest'; } },
  /* On the car park, every few seconds. Hand-written: under a car if it is
     raining on it, forage if hungry, find the other fox, else prowl. */
  foxNext: { kind:'fox', senses:function(b){ return foxSenses(b); },
             actions:['forage', 'stalk', 'watch', 'join', 'prowl', 'shelter', 'leave'],
             hand:function(b){
               if (rainHere(b.x, b.y) > 0.3) return 'shelter';
               if ((b.hunger || 0) > 0.35) return 'forage';
               const of = otherFox(b);
               if (of && !of.away && Math.hypot(of.x - b.x, of.y - b.y) > 6) return 'join';
               return 'prowl';
             } },
  /* A person inside its fear distance (closer than that is instinct: it
     bolts). The hand-written fox bolts. */
  foxThreat: { kind:'fox', senses:function(b){ return foxSenses(b); },
               actions:['bolt', 'freeze', 'slink'],
               hand:function(){ return 'bolt'; } }
};

/* ---------------------------------------------------------------- a granny's moments
   Things that interrupt her walk. Returns true while one has her (the walk
   waits). Called for every granny with a visit, every step. */
const GRANNY_WALKS = { toDoors:1, toCar:1, toExit:1, hunting:1, wandering:1 };
const GRANNY_MUDDLE = 0.15;      // a granny who drove, setting off for last time's space
function grannyMoment(b, dt){
  const walking = GRANNY_WALKS[b.life] === 1 && !beingAbsent(b) && !b.held;
  grannyFeel(b, dt, walking);
  /* Talking. Facing each other, going nowhere. */
  if (b.chatT > 0){
    b.chatT -= dt;
    b.moving = false; b.state = b.look;
    if (b.chatFace !== undefined) b.h = b.chatFace;
    if (b.chatT <= 0 && b.chatMate) grannyLinger(b);
    return true;
  }
  /* Scattering crumbs: stood still, facing the birds. */
  if (b.feedT > 0){
    b.feedT -= dt;
    b.moving = false; b.state = b.look;
    if (b.feedFace !== undefined) b.h = b.feedFace;
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
      b.shelterAt = null; b.shelterCo = 0;
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
        b.chatMate = o; o.chatMate = b; b.lingers = o.lingers = 0;
        b.chatFace = Math.atan2(o.y - b.y, o.x - b.x);
        o.chatFace = b.chatFace + Math.PI;
        b.chats = (b.chats || 0) + 1; o.chats = (o.chats || 0) + 1;
        if (!CENSUS.mute) CENSUS.ev.chats = (CENSUS.ev.chats || 0) + 1;
        return true;
      }
    }
    /* A gull, on a sunny day, and she has not just been asked: crumbs? Twice
       a visit at most - a purse only holds so many. */
    if (b.life !== 'hunting' && WX.rain < 0.05 && daylight() > 0.7 && (b.feeds || 0) < 2 &&
        simClock - (b.gullAsk === undefined ? -1e9 : b.gullAsk) > 90){
      const gl = nearestGull(b, 12);
      if (gl){
        b.gullAsk = simClock;
        if (decide('gulls', b, { gull:gl }) === 'feed'){
          b.feedT = 15 + RND.beings() * 15;
          b.crumbs = 6 + Math.floor(RND.beings() * 7);       // a handful - they run out
          b.feeds = (b.feeds || 0) + 1; b.mobbedNoted = false;
          b.feedFace = Math.atan2(gl.y - b.y, gl.x - b.x);
          if (!CENSUS.mute) CENSUS.ev.fedGulls = (CENSUS.ev.fedGulls || 0) + 1;
          return true;
        }
      }
    }
  }
  return false;
}
/* The chat has run its course. Another wee minute - if they both want one,
   and not more than twice. */
function grannyLinger(b){
  const o = b.chatMate;
  b.chatMate = null;
  if (!o || o.chatMate !== b || !(o.chatT > 0) || (b.lingers || 0) >= 2) { if (o && o.chatMate === b) o.chatMate = null; return; }
  if (decide('linger', b, { other:o }) === 'another minute' && decide('linger', o, { other:b }) === 'another minute'){
    b.chatT = o.chatT = 15 + RND.beings() * 20;
    b.chatMate = o;
    b.lingers = (b.lingers || 0) + 1; o.lingers = (o.lingers || 0) + 1;
    if (!CENSUS.mute) CENSUS.ev.lingered = (CENSUS.ev.lingered || 0) + 1;
  } else o.chatMate = null;
}
function nearestGull(b, r){
  let best = null, bd = r;
  for (const o of BEINGS){
    if (o.kind !== 'gull' || beingAbsent(o) || o.z > 0.6) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < bd){ bd = d; best = o; }
  }
  return best;
}
/* For the gulls (12-beings.js): the nearest granny scattering crumbs, if any. */
function grannyFeeding(g){
  let best = null, bd = 30;
  for (const o of BEINGS){
    if (o.kind !== 'granny' || !(o.feedT > 0) || !(o.crumbs > 0) || beingAbsent(o)) continue;
    const d = Math.hypot(o.x - g.x, o.y - g.y);
    if (d < bd){ bd = d; best = o; }
  }
  return best;
}
/* Out of the shop (12-beings.js calls this once a visit): straight off, a wee
   wander round, or back in for the thing she forgot. */
function grannyAfterShop(b){
  if (b.afterAsked) return;
  b.afterAsked = true;
  const act = decide('afterShop', b);
  if (act === 'wander'){
    b.wanderNext = b.life; b.life = 'wandering';
    b.wanderT = 60 + RND.beings() * 60;
    wanderTarget(b, 6);
    if (!CENSUS.mute) CENSUS.ev.wandered = (CENSUS.ev.wandered || 0) + 1;
  } else if (act === 'back in'){
    b.life = 'inStore'; b.inStore = true; b.backIn = true;
    b.shopT = 45 + RND.beings() * 120;
    if (!CENSUS.mute) CENSUS.ev.backIn = (CENSUS.ev.backIn || 0) + 1;
  }
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
   little in itself. What costs her is getting wet, worry, and losing the car.
   Added the same day: the gulls (a joy, until there is a crowd of them),
   being in somebody's way, and the light going. Sheltering's company is
   capped per shower: the first long training learned to shelter at every
   drop, because company at the doors paid without limit. */
const GRANNY_FEEL = {
  wetPerMin:-0.3,       // out in the rain with nothing over her
  worryPerMin:-0.2,     // without her car - not the time, the worry
  chatPerMin:0.4,       // a natter
  helpedPerMin:0.2,     // being looked after by somebody from the shop
  crowdPerMin:0.15,     // sheltering at the doors in company...
  crowdCap:0.08,        // ...but only so much of it a shower
  birdsPerMin:0.4,      // a gull or two at her feet
  mobbedPerMin:-0.5,    // three or more - a fright
  inTheWayPerMin:-0.3,  // stood chatting or feeding while a car waits on her
  duskPerMin:-0.2,      // still out as the light goes
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
  else if (b.shelterAt !== undefined && b.shelterAt !== null && (b.shelterCo || 0) < F.crowdCap && somebodyNear(b, 4)){
    const v = Math.min(F.crowdCap - (b.shelterCo || 0), F.crowdPerMin * m);
    b.shelterCo = (b.shelterCo || 0) + v;
    grannyFelt(b, 'company', v);
  }
  if (b.feedT > 0){
    const n = gullsNear(b, 3);
    if (n >= 3){
      grannyFelt(b, 'mobbed', F.mobbedPerMin * m);
      if (!b.mobbedNoted){ b.mobbedNoted = true; if (!CENSUS.mute) CENSUS.ev.mobbed = (CENSUS.ev.mobbed || 0) + 1; }
    } else if (n >= 1) grannyFelt(b, 'birds', F.birdsPerMin * m);
  }
  if ((b.chatT > 0 || b.feedT > 0) && carWaitingNear(b)) grannyFelt(b, 'inTheWay', F.inTheWayPerMin * m);
  if (daylight() < 0.6) grannyFelt(b, 'dusk', F.duskPerMin * m);
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

/* ================================================================ the gulls
   Thomas, 2026-10-13: a flocking behaviour that makes them happy to be around
   someone - a gull or a person, not a fox or a car. So a gull feels good in
   company and can choose to go and find some; food is still the main prize,
   and crumbs are a real handful now (a granny scatters 6-12), so a gull in a
   crowd round a granny is happier but gets less lunch. No snatching (Thomas). */
const GULL_FEEL = {
  food:0.25,            // each peck of rubber or crumb - less the fuller it is,
  stuffed:0.2,          //   by this much per unit of `full`...
  foodFloor:-0.1,       //   ...down to a peck it did not want at all
  heavyPerMin:-0.2,     // too heavy to fly: uncomfortable, and stuck
  weakPerMin:-0.3,      // four minutes and more without food
  gaveUp:-2.0,          // gone - to the tip, or fishing in the Tay
  companyPerMin:0.3,    // a gull or a person within a few metres
  foxPerMin:-0.4,       // a fox about
  fright:-0.3,          // a car going by too close
  flyPerMin:-0.1        // flying is work
};
const GULL_SECS = 20;   // a gull's choice is judged by the next twenty seconds
/* Thomas, 2026-10-13: over-eating slows a gull down and in the end grounds it;
   going hungry weakens it and in the end it gives up on the car park - off to
   the tip, or fishing in the Tay. A new gull flies in from the river now and
   then, so there are always about GULL_POP of them by day. */
const GULL_FAT = { perPeck:0.03, burnPerMin:0.04, grounded:1.0 };
const GULL_HUNGER = { weak:240, gives:480 };      // seconds without food
const GULL_POP = 14;                              // as seedCast puts them down
function gullPace(b){
  let k = 1 - 0.35 * Math.min(1, b.fat || 0);
  if ((b.hungerT || 0) > GULL_HUNGER.weak) k *= 0.7;
  return k;
}
function gullGrounded(b){ return (b.fat || 0) >= GULL_FAT.grounded; }
const COMPANY_KINDS = { gull:1, granny:1, shopper:1, trolleyboy:1, manager:1, cleaner:1 };
function gullFelt(b, part, v){
  b.feel = (b.feel || 0) + v;
  const f = b.feelBy || (b.feelBy = {});
  f[part] = (f[part] || 0) + v;
  if (!CENSUS.mute) brainOf('gull').life.feel += v;
}
function gullCompanyNear(b, r){
  for (const o of BEINGS){
    if (o === b || !COMPANY_KINDS[o.kind] || beingAbsent(o)) continue;
    if (o.kind === 'gull' && o.z > 0.6) continue;
    if (Math.hypot(o.x - b.x, o.y - b.y) < r) return o;
  }
  return null;
}
/* Where the nearest company is, within thirty metres: a spot just beside it. */
function gullFlockTarget(b){
  let best = null, bd = 30;
  for (const o of BEINGS){
    if (o === b || !COMPANY_KINDS[o.kind] || beingAbsent(o)) continue;
    if (o.kind === 'gull' && o.z > 0.6) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < bd){ bd = d; best = o; }
  }
  if (!best) return null;
  const a = Math.atan2(b.y - best.y, b.x - best.x);
  return [best.x + Math.cos(a) * 1.2, best.y + Math.sin(a) * 1.2];
}
function gullSenses(b){
  const one = function(x){ return Math.max(0, Math.min(1, x)); };
  let rub = 0;
  for (let i = RUB.length - 1; i >= 0 && i > RUB.length - 240; i--){
    const r = RUB[i];
    if (!r) continue;
    const d = Math.hypot(r[0] - b.x, r[1] - b.y);
    if (d < 26) rub = Math.max(rub, 1 - d / 26);
  }
  const cg = grannyFeeding(b);
  let gulls = 0, people = 0, fox = 0, near = 0;
  for (const o of BEINGS){
    if (o === b || beingAbsent(o)) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (o.kind === 'fox'){ if (d < 15) fox = Math.max(fox, 1 - d / 15); continue; }
    if (!COMPANY_KINDS[o.kind]) continue;
    if (d < 30) near = Math.max(near, 1 - d / 30);
    if (d < 6){ if (o.kind === 'gull') gulls++; else people++; }
  }
  return [
    rub,
    cg ? one(1 - Math.hypot(cg.x - b.x, cg.y - b.y) / 30) : 0,
    one(gulls / 5),
    one(people / 3),
    gullCompanyNear(b, 4) ? 1 : 0,
    near,
    fox,
    carThreat(b),
    1 - one(b.full || 0),
    b.z > 0.2 ? 1 : 0,
    daylight(),
    one(WX.rain),
    one(b.fat || 0),
    one((b.hungerT || 0) / GULL_HUNGER.gives)
  ];
}
const GULL_SENSES = ['rubber in sight', 'crumbs going', 'gulls nearby', 'people nearby', 'in company now',
  'nearest company', 'a fox about', 'a car coming', 'hungry', 'in the air', 'daylight', 'rain',
  'how heavy', 'time since food'];
/* Every step, from the gull's own behaviour (12-beings.js): how it feels, and
   choices whose twenty seconds are up are settled - learned from at once,
   since a gull has no end to its day the way a granny's visit does. */
function gullFeel(b, dt){
  if (beingAbsent(b) || b.held) return;
  const F = GULL_FEEL, m = dt / 60, L = brainOf('gull').life, live = !CENSUS.mute;
  if (live) L.mins += m;
  b.full = (b.full || 0) * Math.exp(-dt / 60);
  b.fat = Math.max(0, (b.fat || 0) - GULL_FAT.burnPerMin * m);
  b.hungerT = (b.hungerT || 0) + dt;
  const fed = b.fed || 0;
  if (fed > (b.fedFelt || 0)){
    const n = fed - (b.fedFelt || 0);
    for (let i = 0; i < n; i++){
      gullFelt(b, 'food', Math.max(F.foodFloor, F.food - F.stuffed * b.full));
      b.full += 0.25; b.fat += GULL_FAT.perPeck;
    }
    b.fedFelt = fed; b.hungerT = 0;
    if (live) L.food += n;
  }
  if (gullGrounded(b)){ gullFelt(b, 'heavy', F.heavyPerMin * m); if (live) L.heavy += m; }
  if (b.hungerT > GULL_HUNGER.weak) gullFelt(b, 'weak', F.weakPerMin * m);
  /* Eight minutes and nothing: it gives up on the place. */
  if (b.hungerT > GULL_HUNGER.gives && !b.leavingTo){
    b.leavingTo = RND.beings() < 0.5 ? 'tip' : 'tay';
    gullFelt(b, 'gaveUp', F.gaveUp);
    if (live) L.left++;
    gullSettle(b, true);
    return;
  }
  if (b.z <= 0.6 && gullCompanyNear(b, 4)){ gullFelt(b, 'company', F.companyPerMin * m); if (live) L.flock += m; }
  if (b.z > 0.2) gullFelt(b, 'flying', F.flyPerMin * m);
  b.frightCool = (b.frightCool || 0) - dt;
  if (b.frightCool <= 0 && b.z < 0.6){
    let close = Math.hypot(car.vx, car.vy) > 2 && Math.hypot(car.x - b.x, car.y - b.y) < 2.5;
    if (!close) for (const c of CARS)
      if (Math.abs(c.spd) > 2 && Math.hypot(c.x - b.x, c.y - b.y) < 2.5){ close = true; break; }
    if (close){ gullFelt(b, 'fright', F.fright); b.frightCool = 3; if (live) L.frights++; }
  }
  for (const o of BEINGS)
    if (o.kind === 'fox' && !beingAbsent(o) && Math.hypot(o.x - b.x, o.y - b.y) < 6){ gullFelt(b, 'fox', F.foxPerMin * m); break; }
  gullSettle(b, false);
}
/* Settle the choices whose twenty seconds are up - or all of them, when the
   gull is leaving and there will be no more to come. */
function gullSettle(b, all){
  if (b.diary && b.diary.length){
    const kb = brainOf('gull'), done = [];
    while (b.diary.length && (all || simClock - b.diary[0].t >= GULL_SECS)){
      const e = b.diary.shift();
      if (e.f0 === undefined) continue;
      e.credit = +((b.feel || 0) - e.f0).toFixed(4);
      const rec = { d:e.d, s:e.s, a:e.a, credit:e.credit, score:null, gull:b.cid };
      kb.replay.push(rec);
      if (kb.replay.length > REPLAY_MAX) kb.replay.shift();
      if (kb.tap) kb.tap.push(rec);
      done.push(e);
    }
    if (done.length && kb.policy === 'net') brainLearn(kb, b.brain || null, done, 'gull');
  }
}
/* Off it goes: up, and away - north over the Tay to fish, or west to the
   tip - and gone once it is well off the site. */
function gullLeave(b, dt){
  const to = b.leavingTo === 'tay' ? [b.x, -70] : [X0 - 120, b.y];
  const a = Math.atan2(to[1] - b.y, to[0] - b.x);
  b.h = a; b.z = Math.min(6, (b.z || 0) + dt * 2.5);
  b.x += Math.cos(a) * 7.4 * dt; b.y += Math.sin(a) * 7.4 * dt;
  b.state = poseOr(b, 'wings-out'); b.moving = true;
  b.leaveT = (b.leaveT || 0) + dt;
  if (b.y < -45 || b.x < X0 - 60 || b.leaveT > 30) b.gone = true;
}
/* By day, a gull short of GULL_POP is made up now and then: one flies in
   from the river and drops onto the car park. */
function gullTopUp(dt){
  if (daylight() < 0.5) return;
  let n = 0;
  for (const o of BEINGS) if (o.kind === 'gull' && !o.gone && !o.leavingTo) n++;
  if (n >= GULL_POP) return;
  BRAINS_GULL_T = (BRAINS_GULL_T || 0) - dt;
  if (BRAINS_GULL_T > 0) return;
  BRAINS_GULL_T = 60 + RND.beings() * 90;
  const g = addBeing('gull', X0 + 20 + RND.beings() * (X1 - X0 - 40), Y0 - 10);
  g.z = 5; g.hold = 3; g.tx = g.x + (RND.beings() - 0.5) * 20; g.ty = Y0 + 20 + RND.beings() * 40;
  if (!CENSUS.mute) brainOf('gull').life.arrived++;
}
let BRAINS_GULL_T = 0;
SAVE_MOMENT.push('BRAINS_GULL_T');         // part of the moment: a reloaded day must not drift

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
    const net = kindHive(kb, dp.kind);
    if (!net) return dp.hand(b, ctx);
    const c = netChances(netForward(net, brainInput(s, name)).z, brainSlots(name), pb && pb.dials);
    let r = RND.brains();
    for (let i = 0; i < c.p.length; i++){ r -= c.p[i]; if (r <= 0) return i; }
    return c.p.length - 1;
  }
};

/* ---------------------------------------------------------------- the granny brain
   The hive (every granny's): 23 inputs (her 16 senses and which of the 7
   decisions this is) into 12 hidden neurons, out to 17 - one per option across
   the seven menus. Each granny has 17 personal dials, one per option, added to
   the hive's answer: her own leanings. (Started 2026-10-13 at 22 neurons and 10
   dials, four decisions; grew with the menu the same day.) */
/* GRANNY_DECS, GRANNY_SLOTS, GRANNY_SHAPE and grannyInput are in net.js,
   so the lab wires her up exactly as the game does. */
/* The hive: her town's own if it has one, else the one shipped with the game
   (brains/granny.brain.js, trained in the lab). */
/* A brain wired for a different menu (an older save, an older file) is no use
   to her: it is set aside and she goes on the hand-written choices. */
function kindFits(n, kind){
  const sh = WIRING[kind].shape;
  return !!(n && n.w1 && n.nIn === sh.nIn && n.nOut === sh.nOut);
}
function kindHive(kb, kind){
  if (kindFits(kb.kind, kind)) return kb.kind;
  const shipped = window[WIRING[kind].shipped];
  if (shipped && kindFits(shipped.net, kind)){ kb.kind = netCopy(shipped.net); return kb.kind; }
  return null;
}
function kindDials(pb, kind){
  if (!pb.dials) pb.dials = [];
  while (pb.dials.length < WIRING[kind].shape.nOut) pb.dials.push(0);   // the menu grew
  return pb.dials;
}
function grannyHive(kb){ return kindHive(kb, 'granny'); }
function grannyDials(pb){ return kindDials(pb, 'granny'); }
/* Learning as the game goes: after her day, each choice she made gets a
   little likelier if what followed it beat what usually follows that kind of
   choice, a little less if not. The yardstick is per decision (a chat is not
   measured against a lost car). The hive learns slowly from everybody; her
   dials faster, from her alone. */
function grannyLearn(kb, pb, diary){ brainLearn(kb, pb, diary, 'granny'); }
function brainLearn(kb, pb, diary, kind){
  const net = kindHive(kb, kind);
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
      if (adv[i]) netGrad(net, brainInput(e.s, e.d), brainSlots(e.d), e.a, adv[i], acc, pb && pb.dials);
    });
    netStep(net, acc, kb.learnRate / diary.length, 0.05);
  }
  if (pb && kb.dialRate > 0){
    const dl = kindDials(pb, kind);
    diary.forEach(function(e, k){
      if (!adv[k]) return;
      const sl = brainSlots(e.d);
      const c = netChances(netForward(net, brainInput(e.s, e.d)).z, sl, dl);
      for (let i = 0; i < sl.length; i++){
        dl[sl[i]] += kb.dialRate * adv[k] * ((i === e.a ? 1 : 0) - c.p[i]);
        dl[sl[i]] = Math.max(-1.5, Math.min(1.5, dl[sl[i]]));       // a leaning, not a personality transplant
      }
    });
  }
}

/* A town saved before a brain shipped is switched to it once, on its first
   decision: the shipped hive, frozen; her own dials learning. */
const GRANNY_BRAIN_V = 1;
const GULL_BRAIN_V = 1;
const FOX_BRAIN_V = 1;
function decide(name, b, ctx){
  const dp = DECISIONS[name];
  const kb = brainOf(dp.kind);
  if (dp.kind === 'granny' && (kb.v || 0) < GRANNY_BRAIN_V){
    kb.v = GRANNY_BRAIN_V; kb.policy = 'net'; kb.learnRate = 0; kb.dialRate = 0.05; kb.kind = {};
  }
  if (dp.kind === 'gull' && (kb.v || 0) < GULL_BRAIN_V){
    kb.v = GULL_BRAIN_V; kb.policy = 'net'; kb.learnRate = 0; kb.dialRate = 0.05; kb.kind = {};
  }
  if (dp.kind === 'fox' && (kb.v || 0) < FOX_BRAIN_V){
    kb.v = FOX_BRAIN_V; kb.policy = 'net'; kb.learnRate = 0; kb.dialRate = 0.05; kb.kind = {};
  }
  const s = dp.senses(b, ctx);
  const pol = POLICIES[kb.policy] || POLICIES.hand;
  /* Her own dials live with the resident; a gull keeps its own on itself. */
  const pb = b.res ? (b.res.brain || (b.res.brain = { n:0, mean:0, bias:{} }))
           : (b.kind === 'gull' || b.kind === 'fox') ? (b.brain || (b.brain = { n:0, mean:0, bias:{} })) : null;
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
