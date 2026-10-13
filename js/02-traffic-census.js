/* Tesco Trueno - 02-traffic-census.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ============================================================== traffic =====
   Cars that arrive, park, and leave - which is the last place this car park
   popped. Occupancy used to be a probability rolled once at world build and
   then frozen, so the whole idea of a busy lunchtime had nowhere to live.

   The population is NOT set. It is the running total of a difference: arrivals
   per minute minus departures per minute. A target curve says how full the
   place wants to be at this hour, and the two rates are driven by the GAP to
   that target - so a rising target means arrivals genuinely outnumber
   departures and the car park fills by filling, one car at a time through the
   entrance. Evening reverses it. Both rates keep a baseline on top of that, so
   even at a flat target there is always somebody coming and going; a car park
   at a dead-steady hundred cars with no movement would be a photograph.

   The curve itself is the peak-time research from 2026-09-17: morning build,
   a lunch bulge from noon, the hard peak at five, and empty by nine. */
/* This curve was the peak-time research applied straight from life - 2% at
   dawn, 72% at five o'clock - and the car park could not follow it anywhere.
   Measured flat out, the road delivers 0.038 completed arrivals a second. The
   population a car park holds is Little's law, arrival rate times dwell, and no
   amount of asking changes either term: pushing the controller harder just
   queues cars at the entrance.

   The reason is the clock, and it is not a bug in the traffic at all. The day is
   compressed 72 times over. Demand compresses with it; DRIVING DOES NOT. A car
   still crosses 172 m of car park at four metres a second and still takes most
   of a minute to park. A real store taking on 140 cars across a morning has four
   hours to do it; this one has 370 seconds, which works out at a car through the
   single entrance every 2.6 seconds - not a car park filling up, a solid queue
   at the roundabout. Occupancy = rate x dwell is invariant under compressing the
   clock, but the rate is capped by tarmac, so the achievable occupancy falls by
   exactly the factor the road cannot keep up.

   So the curve is now the one the site can actually drive, measured rather than
   researched: a band of about six points either side of the seeded 26%. It still
   has the shape of a day - overnight trough, a morning climb, the lunch bulge,
   the hard five o'clock peak, the evening emptying - and it is asymmetric for a
   real reason rather than a cosmetic one: draining is five times faster than
   filling, because a departure is one car driving out while an arrival is a car
   driving the length of the park and then parking. So it fills gradually and
   empties quickly, which is also what a supermarket car park looks like.

   The original curve is kept below. If journey time ever comes down - the 90th
   percentile is 285 s against a median of 71, so the tail is where the room is -
   the band can widen toward it. The research is not wrong; the road is slow.

     real life:  [[0,0.02],[0.22,0.03],[0.27,0.12],[0.34,0.30],[0.42,0.42],
                  [0.50,0.55],[0.58,0.64],[0.64,0.52],[0.71,0.72],[0.76,0.58],
                  [0.82,0.28],[0.88,0.08],[1,0.02]]                            */
const PEAK = [[0.00, 0.21], [0.20, 0.20], [0.27, 0.21], [0.34, 0.23],
              [0.42, 0.24], [0.50, 0.25], [0.58, 0.26], [0.64, 0.25],
              [0.71, 0.27], [0.78, 0.25], [0.84, 0.22], [0.92, 0.21],
              [1.00, 0.21]];
function wantOccupancy(tod){
  if (tod === undefined) tod = TOD;
  for (let i = 1; i < PEAK.length; i++){
    if (tod <= PEAK[i][0]){
      const a = PEAK[i - 1], b = PEAK[i];
      const u = (tod - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * u;
    }
  }
  return PEAK[PEAK.length - 1][1];
}
function bayCounts(){
  let taken = 0;
  for (const b of BAYS) if (b.car) taken++;
  return taken;
}

const TRAF = { inQ:0, outQ:0, arrived:0, left:0, turnedAway:0 };

/* ================================================================ the census =
   Who everybody is, and where. Thomas, 2026-10-12: "if there is a car there, it
   should be connected to a person who is either in the shop, in the Tay, or
   using Tesco's three hours free and gone for a wander."
   This block is step 1 and it only MEASURES. Nothing here changes what anybody
   does; it names them, numbers them, and counts what does not add up.

   Two identity spaces, kept apart from `cid` (which stays what it always was, a
   drawing and thought-line id):
     pid  one per PERSON or animal, never reused, kind is a field below it
     vid  one per VEHICLE, and the record follows the
          car through parking, lifting, departing and the Tay - a parked car
          used to have no identity at all beyond the bay it was in.

   THE TOWN. People are not generated, they are drawn from a fixed roster of
   residents built once from a fixed seed, with names unique by construction.
   That is what lets history mean anything: the same Moira Robertson comes back
   on Tuesday, and a learned brain has somewhere permanent to live. Step 1 only
   names people from it; drawing ARRIVALS from it comes in step 2/3.

   Names: National Records of Scotland figures, Scotland-wide (nobody publishes
   Dundee's own). Surnames are the NRS top twenty for 1999-2001 plus five just
   below. Grannies were born about 1950 (Mary and Margaret led; the rest of that
   list is from general knowledge). Shoppers were born in the 1980s (NRS decade
   leaders, filled out below the top dozen). */
const NAMES = {
  sur: ['Smith','Brown','Wilson','Campbell','Stewart','Thomson','Robertson',
        'Anderson','MacDonald','Scott','Reid','Murray','Taylor','Clark','Ross',
        'Watson','Morrison','Paterson','Young','Mitchell','Walker','Fraser',
        'Miller','Henderson','Johnston'],
  granny: ['Margaret','Mary','Elizabeth','Anne','Catherine','Helen','Janet',
           'Isobel','Agnes','Christine','Patricia','Sandra','Jean','Irene','Moira',
           'Linda','Elaine','Marion','Sheila','Rosemary','Alison','Evelyn',
           'Maureen','Isabella','Doreen'],
  her:  ['Laura','Claire','Nicola','Jennifer','Emma','Sarah','Lisa','Louise',
         'Kirsty','Michelle','Fiona','Gemma','Lindsay','Amanda','Lynsey','Joanne',
         'Karen','Stephanie','Hayley','Donna','Natalie','Leanne','Victoria',
         'Rachel','Jillian'],
  him:  ['David','Christopher','Andrew','John','James','Michael','Steven','Paul',
         'Mark','Scott','Craig','Ross','Kevin','Stuart','Gary','Graeme','Darren',
         'Jamie','Ryan','Martin','Thomas','Barry','Euan','Neil','Gordon']
};
/* Its own generator, so building the town never draws from the world's seeded
   stream - the car park must come out byte-identical with or without a census. */
/* Skin tones by group, and hair by group and generation, as weighted lists. */
const SKIN = {
  white:     [['#ecd0b8', 14], ['#e4c3a8', 22], ['#dbb596', 22], ['#d0a787', 16],
              ['#c2a08a', 10], ['#e8bba5', 10], ['#c79a78', 6]],
  asian:     [['#b78659', 3], ['#a5744c', 4], ['#8f6140', 3]],
  mixed:     [['#c9966c', 4], ['#b07f58', 4], ['#9b6c48', 2]],
  african:   [['#7a4e33', 4], ['#64402b', 4], ['#4e3222', 3]],
  eastasian: [['#e3be97', 5], ['#d6ad85', 5]]
};
const HAIR = {
  white:      [['#3d2a1f', 26], ['#5a3e2b', 24], ['#7a5a3e', 14], ['#9c7f55', 8], ['#c9ab70', 8],
               ['#a0471f', 6], ['#1e1b19', 6], ['#8e9398', 8]],
  olderWhite: [['#9da1a3', 26], ['#d9dbd8', 20], ['#c3c6c5', 16], ['#8a8278', 10],
               ['#5a4030', 12], ['#c9b080', 9], ['#7a3b22', 7]],
  dark:       [['#141210', 78], ['#2a1d16', 20], ['#8e9398', 2]],
  olderDark:  [['#141210', 35], ['#9da1a3', 40], ['#d9dbd8', 25]]
};
function townRng(seed){
  let sd = seed;
  return function(){ sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
}
const TOWN = (function(){
  const r = townRng(1950198);
  const used = {};
  const out = [];
  let rid = 0;
  const add = function(kind, firsts, sex, n){
    for (let i = 0; i < n; i++){
      let nm = null;
      for (let k = 0; k < 200 && !nm; k++){
        const f = firsts[Math.floor(r() * firsts.length)];
        const l = NAMES.sur[Math.floor(r() * NAMES.sur.length)];
        if (!used[f + ' ' + l]){ nm = [f, l]; used[f + ' ' + l] = 1; }
      }
      if (!nm) continue;
      out.push({ rid:rid++, kind:kind, sex:sex, first:nm[0], last:nm[1],
                 name:nm[0] + ' ' + nm[1], being:null, car:null, visits:[], visit:null });
    }
  };
  add('granny',  NAMES.granny, 'f', 160);
  add('shopper', NAMES.her,    'f', 120);
  add('shopper', NAMES.him,    'm', 120);
  /* The staff are residents with a job. Fixed, so they are the same two men on
     every load; Thomas can rename them. */
  /* The shop's own staff - tills, shelves, the bakery. Never seen inside, and
     for now never seen at all: they are who owns the long-stay cars. Step 4
     gives them shifts, so they come and go at shift change. */
  add('staff', NAMES.her, 'f', 45);
  add('staff', NAMES.him, 'm', 45);
  out.push({ rid:rid++, kind:'manager',    sex:'m', first:'Derek', last:'Paterson',
             name:'Derek Paterson', being:null, car:null, visits:[], visit:null });
  out.push({ rid:rid++, kind:'trolleyboy', sex:'m', first:'Kyle',  last:'Reid',
             name:'Kyle Reid', being:null, car:null, visits:[], visit:null });
  /* The night manager. Same job, less of the enthusiasm, and a car that has
     seen better years. */
  out.push({ rid:rid++, kind:'manager', night:true, sex:'m', first:'Gordon', last:'Fraser',
             name:'Gordon Fraser', being:null, car:{ sprite:'jazz', paint:'#24364f' }, visits:[], visit:null });
  /* Habits, from a generator of their own so the names above never move. Some
     people use the free parking to go into town as a matter of course; most
     only ever come for the shop. */
  const hr = townRng(3600);
  for (const r of out){
    r.townish = (r.kind === 'shopper' && hr() < 0.30) || (r.kind === 'granny' && hr() < 0.15);
  }
  /* Skin and hair, once per resident, from a generator of their own so the
     names and habits above never move. Proportions from the stats (Thomas,
     2026-10-12): Scotland's 2022 census is ~93% White, and Dundee's children
     are 16% non-White, the lowest of the cities - so ~90% White for the
     1980s-born shoppers and staff, ~98% for the grannies' generation. The
     rest follows the largest groups nationally: Pakistani 1.3%, Mixed 1.1%,
     Indian 1.0%, African 1.0%, Chinese 0.9%. Red hair ~6% of Scots (a study
     of over 500,000), not the often-quoted 13%. Hair follows skin and age. */
  const tr = townRng(5150);
  const pick = function(list){
    let t = 0; for (const e of list) t += e[1];
    let x = tr() * t;
    for (const e of list){ x -= e[1]; if (x <= 0) return e[0]; }
    return list[0][0];
  };
  for (const r of out){
    const old = r.kind === 'granny';
    const group = tr() < (old ? 0.98 : 0.90) ? 'white'
                : pick([['asian', 4.6], ['mixed', 1.6], ['african', 1.6], ['eastasian', 1.4]]);
    r.skin = pick(SKIN[group]);
    r.hair = pick(group === 'white' ? (old ? HAIR.olderWhite : HAIR.white)
                                    : (old ? HAIR.olderDark : HAIR.dark));
  }
  return out;
})();

/* Tesco's three hours free. The clock runs 72x but people do not, so this is
   in REAL seconds of the sim, not clock hours: a shop is 1.5-16 minutes here,
   so a literal three clock-hours (150 s) would ticket nearly every shopper.
   "Three hours" is what the warden's ticket will say. Agreed with Thomas
   2026-10-12, with overstaying kept rare - about one wanderer in twenty. */
const WANDER = {
  limit: 1200,          // the free period, real seconds (20 min)
  overstay: 0.05,       // chance a trip runs past it
  tow: 1800,            // gone this long, with three tickets on it: the truck
  ticketGap: 200        // between tickets once past the limit
};
function wanderStay(){
  return RND.traffic() < WANDER.overstay
       ? (RND.traffic() < 0.35
            ? WANDER.tow + 60 + RND.traffic() * 400         // lost all track of time
            : WANDER.limit + 60 + RND.traffic() * 500)      // lost track of time
       : 360 + RND.traffic() * 720;                       // 6 to 18 minutes
}
/* Whether somebody who has just parked goes into town rather than the shop.
   Mostly the town people, mostly in the working day. Never in the test rig. */
function wantsTown(r){
  if (CENSUS.mute || !r || (r.kind !== 'shopper' && r.kind !== 'granny')) return false;
  if (daylight() < 0.3) return false;
  const day = (TOD > 0.33 && TOD < 0.70) ? 1 : 0.35;
  return RND.traffic() < (r.townish ? 0.55 : 0.04) * day;
}
/* Staff shifts. The shop's own staff are off the map at 'work'; at each shift
   boundary a few of them come out to their cars and a few new ones drive in.
   SWAP is per wave and deliberately small: a real Tesco Extra changes over
   dozens at once, but here a clock hour is 50 real seconds and the road moves
   about three cars a minute, so thirty at once would be a queue to the A85. */
const SHIFTS = { at:[0.25, 7 / 12, 11 / 12], swap:4, spread:70,
                 lastTod:null, queue:[] };
/* What a resident looks like walking about. Shop staff are not a sprite of
   their own; in their own clothes, they look like anybody else. */
function figureOf(r){ return KINDS[r.kind] ? r.kind : 'shopper'; }
/* The model a resident drives - the same car every visit once they have one. */
function modelOf(r){
  if (r && r.car && r.car.sprite)
    for (const m of NPC_MODELS) if (m.sprite === r.car.sprite) return m;
  return pickModel();
}
/* Staff park out of the way: the least wanted spaces, so the customers get the
   good ones. Somewhere in the bottom quarter, not always the same one. */
function staffBay(){
  const free = BAYS.filter(function(b){ return !b.car && !b.claimed && !b.leaving; });
  if (!free.length) return null;
  free.sort(function(a, b){ return a.want - b.want; });
  return free[Math.floor(RND.traffic() * Math.max(1, Math.floor(free.length / 4)))];
}
/* A staff car coming in. `being` for the Manager or Trolleyboy, who exist on
   the map all along; otherwise a shop-staff resident starting a shift. */
function spawnStaffCar(r, being){
  /* Staff may use the slots held back for departures. Waiting behind the
     customers' arrival limit, most of an incoming shift sat in the queue all
     day (4 staff cars in against 12 out) and the shop slowly ran out of staff. */
  if (!r || !roomToLeave() || !gateClear()) return null;
  const bay = staffBay();
  if (!bay) return null;
  const g = carGate();
  const c = makeNpc(modelOf(r), g[0] + 0.5, g[1], 0, 'in', null, r.car && r.car.paint);
  bay.claimed = true;
  c.bay = bay;
  c.veh.ownerRid = r.rid;
  if (being) c.staffBeing = being;
  else { openVisit(r, 'car', 'car', bay); c.shopStaff = true; }
  if (routeFor(c, bay.ax, bay.ay)){ syncNpc(c); TRAF.staffIn = (TRAF.staffIn || 0) + 1; return c; }
  CARS.pop(); bay.claimed = false;
  if (!being){ r.visits.pop(); r.visit = null; }
  return null;
}
/* The Manager or Trolleyboy, if that is whose car this is. */
function staffBeingOf(veh){
  if (!veh || veh.ownerRid === null || veh.ownerRid === undefined) return null;
  const r = TOWN[veh.ownerRid];
  if (!r || (r.kind !== 'manager' && r.kind !== 'trolleyboy')) return null;
  return (r.being && BEINGS.indexOf(r.being) >= 0) ? r.being : null;
}
/* They have parked: out they get, beside their own car. */
function settleStaff(sb, c){
  const bay = c.bay;
  sb.away = false; sb.gone = false; sb.voidT = 0;
  sb.x = bay.x + bay.toAisle * 1.4; sb.y = bay.y;
  sb.ownBay = bay; sb.parkedAt = bayStand(bay);
  sb.carSprite = c.model.sprite;
  bay.ownerCid = sb.cid; bay.longStay = true;
  c.veh.ownerPid = sb.pid;
  if (sb.res) sb.res.car = carRecord(c.veh);
  sb.carComing = null; sb.carTries = 0;
  /* Arriving for a shift walks in; one who was LEAVING and could not get out
     is stood beside the car again and will have another go. */
  if (!sb.leaving){ sb.arriving = true; goTo(sb, sb.home || pickPlace(PLACES.park), 4); }
}
/* A shop-staff resident at the end of their shift: out of the doors to their
   car, like a shopper being fetched. */
function endShift(r){
  let veh = null;
  for (const e of VEH) if (e.ownerRid === r.rid && !e.fate) veh = e;
  const bay = veh && veh.bay && veh.bay.car && veh.bay.car.veh === veh ? veh.bay : null;
  if (!bay) return false;
  const dr = nearestPlace(PLACES.doors, bay.x, bay.y);
  const b = addBeing(figureOf(r), dr[0], dr[1] + 1.2, r);
  b.spawned = true; b.staff = true;
  b.ownBay = bay; b.arrivedBy = 'car';
  b.carSprite = veh.sprite; b.parkedAt = bayStand(bay);
  bay.ownerCid = b.cid; veh.ownerPid = b.pid;
  bay.leaving = true; bay.leaveBy = simClockNow() + 300;
  b.life = 'outDoors';
  TRAF.staffOut = (TRAF.staffOut || 0) + 1;
  return true;
}
/* Once a second, from stepCensus. */
function stepShifts(){
  const t = TOD, last = SHIFTS.lastTod;
  SHIFTS.lastTod = t;
  if (last !== null){
    for (const at of SHIFTS.at){
      const crossed = last <= t ? (last < at && t >= at) : (last < at || t >= at);
      if (!crossed) continue;
      /* A wave: a few go, the same number come. */
      const working = TOWN.filter(function(r){
        return r.kind === 'staff' && r.visit && r.visit.out === null &&
               r.visit.where === 'work' && !residentOnSite(r) && !r.visit.endAt;
      });
      for (let i = 0; i < SHIFTS.swap && working.length; i++){
        const r = working.splice(Math.floor(RND.traffic() * working.length), 1)[0];
        r.visit.endAt = simClockNow() + RND.traffic() * SHIFTS.spread;
        SHIFTS.queue.push(simClockNow() + 15 + RND.traffic() * SHIFTS.spread);
      }
      CENSUS.ev.shiftWaves = (CENSUS.ev.shiftWaves || 0) + 1;
    }
  }
  for (const r of TOWN){
    const v = r.visit;
    if (r.kind !== 'staff' || !v || v.out !== null || v.where !== 'work' || !v.endAt) continue;
    if (simClockNow() >= v.endAt && !residentOnSite(r)){
      if (endShift(r)) v.endAt = null;
      else v.endAt = simClockNow() + 10;          // car not to hand; try again
    }
  }
  for (let i = SHIFTS.queue.length - 1; i >= 0; i--){
    if (simClockNow() < SHIFTS.queue[i]) continue;
    if (spawnStaffCar(freeResident('staff'), null)) SHIFTS.queue.splice(i, 1);
    else SHIFTS.queue[i] = simClockNow() + 8;      // no room just now
  }
}
/* Abandoned cars. A parked car with nobody behind it - owner in the Tay, in
   the void, vanished, or a granny who went home on the bus and forgot - gets
   an abandonedAt. A manager tickets it every `gap` seconds, three times, and
   at `after` the recovery truck comes for it. Real seconds: 480 is 0.4 of a
   sim day, so three tickets and a tow take about a day and a half, which is
   "there for a day or two" on the clock. Step 6 will use the same tickets for
   overstayers. */
const TOW = { gap:480, after:1800, maxTickets:3, truck:null };
const GRANNY_FORGET = 0.04;          // a granny who came by car and forgets it
/* The recovery driver is paid by the tow and wants his tea (Thomas,
   2026-10-12: "a bit impulsive and careless... a little nudge here or there
   is fine"). So: the Audi's temper and urgency in a 6.6 m truck, and no
   regard for the one-way arrows from the moment he arrives. */
const TOW_MODEL = { sprite:'tow', l:6.6, w:2.35, care:0.5, p:0,
                    top:6.6, urge:0.85, accel:3.6, nerve:1.0, wait:16,
                    temper:0.95, wetSlow:0.0 };
function stepTow(){
  const now = simClockNow();
  for (const bay of BAYS){
    if (!bay.car || bay.towing){ continue; }
    if (ownerOfBay(bay) || offMapOwner(bay)){
      /* Somebody's. But somebody in town past the three hours, three tickets
         on the windscreen, is about to have a very bad afternoon. Tickets are
         NOT wiped here: they stay on the car until it leaves. */
      bay.abandonedAt = undefined;
      const plan = ticketPlan(bay);
      if (plan && !TOW.truck && (bay.tickets || 0) >= TOW.maxTickets && now >= plan.towAt){
        if (spawnTow(bay)) CENSUS.ev.towOverstay = (CENSUS.ev.towOverstay || 0) + 1;
      }
      continue;
    }
    if (bay.abandonedAt === undefined){
      bay.abandonedAt = now; bay.tickets = 0;
      CENSUS.ev.abandoned = (CENSUS.ev.abandoned || 0) + 1;
      censusNote('abandoned', vehName(bay.car.veh));
    }
    if (!TOW.truck && (bay.tickets || 0) >= TOW.maxTickets &&
        now - bay.abandonedAt >= TOW.after) spawnTow(bay);
  }
  if (TOW.truck && TOW.truck.done) TOW.truck = null;
}
/* When this car's next ticket is due and when the truck may come for it, or
   null if it is not in trouble. Two ways in: abandoned (nobody behind it), or
   an owner in town past the free three hours. */
function ticketPlan(bay){
  if (!bay.car || bay.towing) return null;
  const n = bay.tickets || 0;
  if (bay.abandonedAt !== undefined)
    return { next:bay.abandonedAt + TOW.gap * (n + 1), towAt:bay.abandonedAt + TOW.after };
  const r = offMapOwner(bay);
  if (r && r.visit.where === 'town' && r.visit.left !== undefined){
    const over = r.visit.left + WANDER.limit;
    return { next:over + WANDER.ticketGap * n, towAt:r.visit.left + WANDER.tow };
  }
  return null;
}
/* The next car this manager should ticket, if any is due. */
function ticketDue(b){
  const now = simClockNow();
  let best = null, bd = Infinity;
  for (const bay of BAYS){
    const plan = ticketPlan(bay);
    if (!plan) continue;
    const n = bay.tickets || 0;
    if (n >= TOW.maxTickets || now < plan.next) continue;
    if (bay.ticketBy && bay.ticketBy !== b && !beingAbsent(bay.ticketBy)) continue;
    const d = Math.hypot(bay.x - b.x, bay.y - b.y);
    if (d < bd){ bd = d; best = bay; }
  }
  return best;
}
function spawnTow(bay){
  if (!roomToLeave() || !gateClear()) return null;
  const g = carGate();
  const c = makeNpc(TOW_MODEL, g[0] + 0.5, g[1], 0, 'in');
  c.rogue = true;                     // arrows are for people paid by the hour
  c.tow = { bay:bay, veh:bay.car.veh, model:bay.car.model, loadT:0, lifting:false, loaded:false };
  if (!routeFor(c, bay.ax, bay.ay)){ CARS.pop(); return null; }
  bay.towing = true;
  syncNpc(c);
  TOW.truck = c;
  CENSUS.ev.towCalled = (CENSUS.ev.towCalled || 0) + 1;
  censusNote('tow called', vehName(bay.car.veh) + ' after ' + bay.tickets + ' tickets');
  return c;
}
/* Hand a new being a resident of its kind who is not already on site. "On
   site" is checked against BEINGS itself rather than trusted from a flag,
   because the test rig empties and restores BEINGS wholesale and would leave
   claims behind that nothing ever releases. */
function residentOnSite(r){
  return !!(r.being && !r.being.gone && BEINGS.indexOf(r.being) >= 0);
}
/* Somebody of this kind who is at home: not on site, and not off-map in the
   middle of a visit either (in the shop, or at work). */
function freeResident(kind){
  const free = [];
  for (const r of TOWN){
    if (r.kind !== kind) continue;
    if (residentOnSite(r)) continue;
    if (r.visit && r.visit.out === null) continue;
    if (r.reserved && !r.reserved.done) continue;      // driving in right now
    free.push(r);
  }
  return free.length ? free[Math.floor(RND.traffic() * free.length)] : null;
}
/* `want` is a particular resident coming back into view - out of the shop
   doors, say - rather than whoever is free. */
function claimResident(b, want){
  let r = want || null;
  if (!r && b.kind === 'manager'){
    /* Two managers now: the day one unless this being is the night one. */
    r = TOWN.find(function(q){
      return q.kind === 'manager' && !!q.night === !!b.night && !residentOnSite(q);
    }) || null;
  }
  if (!r) r = freeResident(b.kind);
  if (!r) return null;
  r.being = b;
  return r;
}
/* A visit that has started with nobody on screen: the opening car park. */
function openVisit(r, where, by, bay){
  r.visit = { in:+simClockNow().toFixed(1), out:null, fate:null, by:by,
              where:where, bay:bay || null };
  r.visits.push(r.visit);
  return r.visit;
}
/* The owner of a car who is NOT on the map - in the shop, at work, or (step 3)
   in town. Keyed off the car's own record, which follows it everywhere. */
function offMapOwner(bay){
  const v = bay.car && bay.car.veh;
  if (!v || v.ownerRid === null || v.ownerRid === undefined) return null;
  const r = TOWN[v.ownerRid];
  if (!r || residentOnSite(r) || !r.visit || r.visit.out !== null) return null;
  return r;
}

let PID = 0, VID = 0;
const VEH = [];                       // every vehicle that has ever existed
/* Car paint, from the stats (Thomas, 2026-10-12: "there must be stats
   available for uk car colours"). A car park holds cars up to twenty years
   old, so this blends the on-the-road fleet (DVLA, 2017: silver 21%, black 20%,
   blue 18%, grey ~13%) with new registrations (SMMT 2024: grey 27.8%, black
   21.7%, blue 14.9%, white 14.9%, red 7.0%, silver 6.3%, green 3.5%, yellow
   0.6%, orange 0.6%, bronze 0.3%). Silver and grey in several shades lead;
   black and blue are commoner than you would guess; yellow, orange and lime
   are rare. Weights are percentages. */
const PAINTS = [
  /* silver and grey, ~38% */
  ['#c3c8c8', 7], ['#b2b9b9', 8], ['#a1a8aa', 7], ['#8d9599', 6], ['#767e83', 5], ['#5f666c', 5],
  /* black ~20%, blue ~16%, white ~12%, red ~8% */
  ['#1f2226', 14], ['#2c3036', 6],
  ['#2f5a8f', 7], ['#24364f', 5], ['#5c7fae', 4],
  ['#e6e8e6', 9], ['#d6d8d3', 3],
  ['#9e3a33', 5], ['#7a2a2a', 3],
  /* and the few: dark green, bronze, beige, yellow, orange, lime */
  ['#3f4f46', 2.2], ['#8a6a4a', 0.6], ['#c8b796', 0.4], ['#d8b13a', 0.6], ['#c4702a', 0.6], ['#8bbf3a', 0.2] ];
function pickPaint(){
  let t = 0;
  for (const p of PAINTS) t += p[1];
  let r = RND.traffic() * t;
  for (const p of PAINTS){ r -= p[1]; if (r <= 0) return p[0]; }
  return PAINTS[0][0];
}
/* What a resident remembers about their car. */
function carRecord(v){ return { vid:v.vid, sprite:v.sprite, paint:v.paint }; }
function newVeh(model, paint){
  const v = { vid:VID++, sprite:model ? model.sprite : '?', paint:paint || pickPaint(),
              ownerPid:null, ownerRid:null, bay:null, fate:null, born:simClockNow() };
  VEH.push(v);
  return v;
}
/* No number plates (Thomas: too in-depth). A car is described by whose it is. */
function vehName(v){
  const o = v.ownerPid !== null ? PEOPLE[v.ownerPid] : null;
  return o ? o.name + "'s " + v.sprite : v.sprite + ' #' + v.vid;
}
function simClockNow(){ return typeof simClock === 'number' ? simClock : 0; }
/* What the census found, kept as running tallies rather than recomputed,
   because a car that VANISHED is only visible at the moment it goes. */
const CENSUS = { mute:false, t:0, last:null, samples:0,
                 ev:{ carsExited:0, carsVanished:0, carsVoid:0, carsParked:0,
                      inventedDrivers:0,
                      peopleWalked:0, peopleBus:0, peopleDrove:0, peopleVoid:0,
                      peopleVanished:0 },
                 worst:{ orphanCars:0, carlessDrivers:0 },
                 log:[] };
const PEOPLE = {};                    // pid -> the person's record, kept after they go
function censusNote(kind, what){
  if (CENSUS.mute) return;
  CENSUS.log.push([+simClockNow().toFixed(1), kind, what]);
  if (CENSUS.log.length > 400) CENSUS.log.shift();
}
/* A car has left CARS. Either it parked (its record is now in a bay), it went
   out through the gate, it went over the edge, or it simply stopped existing
   in the middle of the car park - which is the popping Thomas ruled out, and
   the thing this exists to count. Judged by WHERE it was, not by which counter
   the code happened to bump: one exit path counts a failed route as 'left'. */
function censusCarDone(c){
  if (CENSUS.mute || !c.veh) return;
  const v = c.veh;
  if (v.bay && v.bay.car && v.bay.car.veh === v){
    CENSUS.ev.carsParked++;
    if (c.st0 === 'in' && c.born !== undefined){
      CENSUS.ev.parkN = (CENSUS.ev.parkN || 0) + 1;
      CENSUS.ev.parkSecs = (CENSUS.ev.parkSecs || 0) + (simClockNow() - c.born);
    }
    return;
  }
  if (v.fate === 'void'){ CENSUS.ev.carsVoid++; return; }
  /* The recovery truck going out: the car on its back is gone, properly. */
  if (c.tow){
    if (c.tow.loaded){
      c.tow.veh.fate = 'towed'; c.tow.veh.towedAt = simClockNow();
      CENSUS.ev.towed = (CENSUS.ev.towed || 0) + 1;
      censusNote('towed', vehName(c.tow.veh));
    } else c.tow.bay.towing = false;
  }
  const g = carGate();
  if (Math.hypot(c.x - g[0], c.y - g[1]) < 12){
    v.fate = 'exited'; CENSUS.ev.carsExited++;
    if (v.ownerPid !== null && PEOPLE[v.ownerPid]) closeVisit(PEOPLE[v.ownerPid], 'drove');
    return;
  }
  v.fate = 'vanished'; CENSUS.ev.carsVanished++;
  if (v.ownerPid !== null && PEOPLE[v.ownerPid]) closeVisit(PEOPLE[v.ownerPid], 'vanished');
  censusNote('car vanished', vehName(v) + ' state ' + c.state +
             ' at ' + c.x.toFixed(0) + ',' + c.y.toFixed(0));
}
function closeVisit(rec, how){
  const vis = rec.visits[rec.visits.length - 1];
  if (vis && vis.out === null){ vis.out = +simClockNow().toFixed(1); vis.fate = how; }
  if (rec.rid !== null && rec.rid !== undefined && TOWN[rec.rid] &&
      TOWN[rec.rid].visit === vis) TOWN[rec.rid].visit = null;
  for (const b of BEINGS) if (b.pid === rec.pid && vis && !vis.by) vis.by = b.arrivedBy;
}
/* A being is being reaped. Record how they went. */
function censusBeingOut(b){
  if (CENSUS.mute || !hasLife(b)) return;
  const rec = PEOPLE[b.pid];
  if (b.toWork && b.res && b.res.visit && b.res.visit.out === null){
    b.res.visit.where = 'work'; b.res.visit.endAt = null;
    CENSUS.ev.toWork = (CENSUS.ev.toWork || 0) + 1;
    return;
  }
  if (b.toTown && b.res && b.res.visit && b.res.visit.out === null){
    const v = b.res.visit, stay = wanderStay();
    v.where = 'town'; v.left = simClockNow(); v.due = simClockNow() + stay; v.over = false;
    CENSUS.ev.toTown = (CENSUS.ev.toTown || 0) + 1;
    return;
  }
  let how;
  if (b.voidHow) how = b.voidHow;
  else if (b.drove) how = 'drove';
  else if (b.life === 'toExit') how = (b.x < gateSpot()[0] + 8) ? 'walked' : 'bus';
  else how = 'vanished';
  if (how === 'walked') CENSUS.ev.peopleWalked++;
  else if (how === 'bus') CENSUS.ev.peopleBus++;
  else if (how === 'drove') CENSUS.ev.peopleDrove++;
  else if (how === 'vanished'){
    CENSUS.ev.peopleVanished++;
    censusNote('person vanished', (b.name || b.pid) + ' life ' + b.life);
  }
  else CENSUS.ev.peopleVoid++;
  /* A granny's day on the map, for the brains (16-brains.js). */
  if (b.kind === 'granny' && typeof scoreGrannyDay === 'function') scoreGrannyDay(b, how);
  /* Somebody who got into their car has not left - they are in it. Their visit
     closes when the CAR goes out of the gate. */
  if (rec && how !== 'drove') closeVisit(rec, how);
}
function ownerOfBay(bay){
  /* The bay's current owner first: an earlier owner can still be pointing at
     it on her way out, and taking the first match marked HER as the driver
     (2026-10-13: a staff member was then counted as vanished). */
  if (bay.ownerCid)
    for (const o of BEINGS) if (!o.gone && o.cid === bay.ownerCid) return o;
  for (const o of BEINGS){
    if (o.gone) continue;
    if (o.ownBay === bay) return o;
  }
  return null;
}
function whereIs(b){
  if (b.gone) return 'gone';
  if (b.voidHow || b.swim || b.abyss) return 'tay/void';
  if (b.inStore || b.life === 'inStore') return 'shop';
  if (b.away) return 'away';
  return 'car park';
}
const LOST = ['muddled','hunting','seekHelp','waitHelp','following'];
/* The snapshot. Every parked car must lead to a person, and every person who
   came by car must lead to a car. Anything that does not is listed. */
function census(){
  const out = { t:+simClockNow().toFixed(1),
    cars:{ parked:0, ownerShop:0, ownerCarPark:0, ownerAway:0, ownerTay:0,
           ownerWork:0, ownerTown:0, ownerInCar:0,
           orphanLong:0, orphanShort:0,
           arrivingNoPerson:0, leavingWithDriver:0, leavingNoDriver:0,
           lifted:0, other:0 },
    people:{ shop:0, carPark:0, away:0, tay:0,
             byCar:0, byFoot:0, byBus:0, lost:0, carless:0 },
    staff:{ onSite:0, inShop:0, away:0, withCar:0 },
    offMap:{ shop:0, work:0, town:0, car:0 },
    orphans:[], carless:[] };
  for (const bay of BAYS){
    if (!bay.car) continue;
    out.cars.parked++;
    const o = ownerOfBay(bay);
    if (!o){
      const r = offMapOwner(bay);
      if (r){
        if (r.visit.where === 'work') out.cars.ownerWork++;
        else if (r.visit.where === 'town') out.cars.ownerTown++;
        else if (r.visit.where === 'car') out.cars.ownerInCar++;
        else out.cars.ownerShop++;
        continue;
      }
      if (bay.longStay) out.cars.orphanLong++; else out.cars.orphanShort++;
      if (out.orphans.length < 60)
        out.orphans.push((bay.car.veh ? vehName(bay.car.veh) : '?') +
                         (bay.longStay ? ' long-stay' : '') +
                         (bay.leaving ? ' leaving' : ''));
      continue;
    }
    const w = whereIs(o);
    if (w === 'shop') out.cars.ownerShop++;
    else if (w === 'away') out.cars.ownerAway++;
    else if (w === 'tay/void') out.cars.ownerTay++;
    else out.cars.ownerCarPark++;
  }
  for (const c of CARS){
    if (c.done) continue;
    if (c.state === 'idle' || c.repark || c.held || c.airborne) out.cars.lifted++;
    else if (c.state === 'in') out.cars.arrivingNoPerson++;
    else if (c.state === 'out' || c.state === 'go'){
      if (c.veh && c.veh.ownerPid !== null) out.cars.leavingWithDriver++;
      else out.cars.leavingNoDriver++;
    }
    else out.cars.other++;
  }
  for (const r of TOWN){
    if (!r.visit || r.visit.out !== null || residentOnSite(r)) continue;
    if (r.visit.where && out.offMap[r.visit.where] !== undefined) out.offMap[r.visit.where]++;
  }
  for (const b of BEINGS){
    if (b.gone) continue;
    if (b.kind === 'manager' || b.kind === 'trolleyboy'){
      if (b.away) out.staff.away++;
      else { out.staff.onSite++; if (b.inStore) out.staff.inShop++; }
      if (b.ownBay && b.ownBay.car) out.staff.withCar++;
      continue;
    }
    if (!hasLife(b)) continue;
    const w = whereIs(b);
    if (w === 'shop') out.people.shop++;
    else if (w === 'away') out.people.away++;
    else if (w === 'tay/void') out.people.tay++;
    else out.people.carPark++;
    if (b.arrivedBy === 'car') out.people.byCar++;
    else if (b.arrivedBy === 'bus') out.people.byBus++;
    else out.people.byFoot++;
    if (LOST.indexOf(b.life) >= 0) out.people.lost++;
    if (b.arrivedBy === 'car' && LOST.indexOf(b.life) < 0 && !b.carVoid){
      let has = !!(b.ownBay && b.ownBay.car);
      if (!has) for (const bay of BAYS) if (bay.car && bay.ownerCid === b.cid){ has = true; break; }
      if (!has) for (const c of CARS) if (!c.done && c.ownerCid === b.cid){ has = true; break; }
      if (!has){
        out.people.carless++;
        if (out.carless.length < 30) out.carless.push((b.name || b.pid) + ' (' + b.life + ')');
      }
    }
  }
  return out;
}
function stepCensus(dt){
  if (CENSUS.mute) return;
  CENSUS.t += dt;
  if (CENSUS.t < 1) return;
  CENSUS.t = 0;
  stepTown();
  stepShifts();
  stepTow();
  const c = census();
  CENSUS.last = c; CENSUS.samples++;
  const oc = c.cars.orphanLong + c.cars.orphanShort;
  if (oc > CENSUS.worst.orphanCars) CENSUS.worst.orphanCars = oc;
  if (c.people.carless > CENSUS.worst.carlessDrivers) CENSUS.worst.carlessDrivers = c.people.carless;
}
/* Once a second: anybody in town who is due back walks in at the gate, the
   same person, to the same car. Overstays are counted here (step 6 tickets
   them). */
function stepTown(){
  for (const r of TOWN){
    const v = r.visit;
    if (!v || v.out !== null || v.where !== 'town') continue;
    if (!v.over && simClockNow() - v.left > WANDER.limit){
      v.over = true;
      CENSUS.ev.overstays = (CENSUS.ev.overstays || 0) + 1;
    }
    if (simClockNow() >= v.due && KINDS[r.kind]) comeBack(r);
  }
}
function comeBack(r){
  const v = r.visit;
  let veh = null;
  for (const e of VEH) if (e.ownerRid === r.rid && !e.fate){ veh = e; }
  const bay = veh && veh.bay && veh.bay.car && veh.bay.car.veh === veh ? veh.bay : null;
  const g = gateSpot();
  const b = addBeing(r.kind, g[0] - 2, g[1] + (RND.traffic() - 0.5) * 3, r);
  b.spawned = true;
  b.arrivedBy = 'car';
  b.fromTown = true;
  b.inStore = false;
  if (bay){
    b.ownBay = bay;
    b.parkedAt = bayStand(bay);
    b.carSprite = veh.sprite;
    bay.ownerCid = b.cid;
    veh.ownerPid = b.pid;
  } else {
    /* Not where they left it - towed, lifted, in the Tay. They go and look
       anyway, and the lost-car chain takes it from there - unless it was
       TOWED, in which case they will know the moment they see the space. */
    for (const e of VEH) if (e.ownerRid === r.rid && e.fate === 'towed' &&
                             e.towedAt !== undefined && e.towedAt > (v.left || 0)) b.towed = true;
    /* Still on the back of the truck counts: it is gone from the space. */
    if (TOW.truck && TOW.truck.tow && TOW.truck.tow.lifting &&
        TOW.truck.tow.veh.ownerRid === r.rid) b.towed = true;
    b.ownBay = null; b.carVoid = true;
    b.parkedAt = v.bay ? bayStand(v.bay) : [g[0] + 20, g[1]];
  }
  /* A few call in for a pint of milk on the way back. */
  b.life = RND.traffic() < 0.25 ? 'toDoors' : 'toCar';
  CENSUS.ev.backFromTown = (CENSUS.ev.backFromTown || 0) + 1;
}
/* For the console: `__census()` is the snapshot plus the running tallies. */
window.__census = function(){
  return { now:census(), events:CENSUS.ev, worst:CENSUS.worst, samples:CENSUS.samples,
           log:CENSUS.log.slice(-40) };
};
window.__person = function(q){
  for (const k in PEOPLE){ const r = PEOPLE[k]; if (r.name === q || r.pid === q) return r; }
  return null;
};
/* How many can be moving at once. Seven starved the departures: arrivals filled
   every slot, beginDeparture could never find one, and a day came out 23 in
   against 5 out. The last few slots are held back for cars trying to LEAVE,
   which is also how a real car park behaves - somebody going is somebody else's
   space. */
/* Twelve was nowhere near enough, and the arithmetic says so plainly. The peak
   of the curve is 63% of 366 bays, so getting there from the overnight 25% means
   about 140 arrivals across the morning - call it 0.37 cars a second - and a
   journey from the entrance to a parked car takes the better part of a minute.
   Rate times duration is the number that have to be moving at once: roughly
   seventeen, before a single departure is counted. With twelve slots and four
   held back, the eight arrival slots were full 77% of the day and the controller
   spent its time being told there was no room - which is why occupancy sat flat
   at 30% whatever the curve asked for. It was not the rate. It was the pipe. */
/* Thirty was right while demand was uncapped and most of it was being turned
   away; with the rate capped it is simply too many cars for five lanes, and the
   extra ones do not become throughput, they become the jam that stops everyone
   completing. Little's law backwards: 0.055 arrivals a second at a journey of
   about 200 s wants a dozen moving at once.
   Fourteen then turned out to be too few once the reverse-unwedge landed and
   journeys actually completed - 93 arrivals turned away in two days with the
   slots permanently full - so twenty, which is where arrivals stop being the
   thing that is starved. The number is not a guess either way; it is whatever
   leaves neither the entrance queueing nor the aisles jammed. */
/* Re-tested after the west end was rebuilt (2026-10-12): 26 filled every slot,
   left 18 cars stopped in the aisles and got 22-34 cars out in 900 s against
   41 at 20. The entrance is no longer the limit - manoeuvring in and out of
   bays in 6 m aisles is - so more cars is still just more jam. 20 stays. */
/* Arrivals and departures get a share each, not a pool (2026-10-13, measured in
   the lab). The old rule held six slots back for departures but none for
   arrivals, so departures alone could fill all twenty. Every day opens with
   about forty more cars parked than the curve wants, the controller sends them
   home four times faster than it lets anyone in, and at the moment an arrival
   was refused there were typically thirteen cars driving OUT. Over 22 seeds of
   five minutes: 9 turned away against 4.5 parked. Eight arriving at once is
   what the capped rate needs (0.055 a second x a journey of 100-130 s); the
   other twelve are for going home, and a driver who finds them all taken waits
   by the car, which is what you do. 8/12 against the old pool: 2.9 turned away,
   6.2 parked, journeys a little quicker, nothing lost from the census. */
const MAX_CARS = 20, IN_SLOTS = 8;
function inFlight(st0){
  let n = 0;
  for (const c of CARS) if (c.st0 === st0 && !c.done) n++;
  return n;
}
/* Nothing may be created on top of a car already standing in the gate. Shift
   changes send staff cars in bursts, and five of them were made on the same
   spot, inside each other, where none could ever move again. */
function gateClear(){
  const g = carGate();
  for (const c of CARS) if (!c.done && Math.hypot(c.x - g[0], c.y - g[1]) < 7) return false;
  return true;
}
function roomToArrive(){ return CARS.length < MAX_CARS && inFlight('in') < IN_SLOTS && gateClear(); }
function roomToLeave(){ return CARS.length < MAX_CARS && inFlight('out') < MAX_CARS - IN_SLOTS; }
function trafficStep(dt){
  /* Twice a second, not 120 times. This is a rate controller for something that
     happens every few seconds, and it was walking all 414 bays every physics
     step - 70 million counts over a simulated day, which alone was enough to
     stall the whole thing. */
  if (TRAFFIC_OFF) return;
  TRAF.tick = (TRAF.tick || 0) + dt;
  if (TRAF.tick < 0.5) return;
  dt = TRAF.tick; TRAF.tick = 0;
  /* A few edges per tick rather than all 63 once a second. Sweeping the whole
     lattice at 1 Hz is 63 corridor probes a second, each sphere-tracing a field
     that walks thirty trolleys - and trafficStep runs inside every driveSim, so
     it was costing the test suite about seven million field samples and took it
     from forty seconds to over a minute and a half. Six edges a tick covers the
     lattice in five seconds, which is far quicker than a trolley moves, at an
     eighth of the cost. */
  TRAF.vi = (TRAF.vi || 0);
  for (let k = 0; k < 6 && REDGE.length; k++){
    const e = REDGE[TRAF.vi % REDGE.length];
    TRAF.vi++;
    const a = RNODE[e.a], b = RNODE[e.b];
    if (!a || !b) continue;
    const ex = b.x - a.x, ey = b.y - a.y, L = Math.hypot(ex, ey);
    if (L < 1e-6) continue;
    e.ok = staticProbe(a.x, a.y, ex / L, ey / L, L, CAR_W * 0.5 * 1.05) >= L - 0.6;
  }
  const total = BAYS.length;
  const taken = bayCounts();
  const want = wantOccupancy() * total;
  const err = (want - taken) / total;        // -1..1

  /* Baseline churn, biggest in the middle of the day. This is what keeps the
     place alive when the target is flat: people are always leaving and always
     arriving, the net is just zero. */
  const churn = 0.16 * (0.25 + 0.75 * Math.max(0, 1 - Math.abs(TOD - 0.55) * 3));
  const push = err * 0.55;
  /* Capped, because demand above what the road can deliver does not become
     occupancy - it becomes a queue at the entrance. Measured flat out, arrivals
     complete at 0.038 a second; asking for 0.17 just filled every slot with cars
     that then timed out, and the harder the curve asked the worse the car park
     got. 170 turned away and 109 abandoned journeys in two days, against 25 that
     made it. The cap is a little above the measured rate so there is always some
     pressure, and no more. Departures are not capped: a departure is one car
     driving out of a space, and the road has never had trouble with those. */
  const inRate = Math.min(0.055, Math.max(0, churn + push));   // cars per second
  const outRate = Math.max(0, churn - push);

  /* Release any bay whose departure never happened. */
  for (const b of BAYS)
    if (b.leaving && b.leaveBy !== undefined && simClock > b.leaveBy){
      b.leaving = false; b.leaveBy = undefined;
      TRAF.stranded = (TRAF.stranded || 0) + 1;
    }
  /* On foot through the entrance. Not everybody at a supermarket drives to it,
     and the ones who do not are the cheapest population there is - no bay, no
     journey, no pipeline. They are also the hook a bus plugs into: a bus is
     twelve of these arriving at once with arrivedBy 'bus'. */
  const footWant = 0.55 + 0.45 * Math.max(0, 1 - Math.abs(TOD - 0.55) * 3);
  if (daylight() > 0.12 && BEINGS.length < 70 &&
      RND.traffic() < dt * 0.075 * footWant){
    const fg = gateSpot();
    const fk = RND.traffic() < 0.3 ? 'granny' : 'shopper';
    const w = addBeing(fk, fg[0] - 2, fg[1] + (RND.traffic() - 0.5) * 3);
    w.spawned = true;
    w.life = 'arriving';
    w.arrivedBy = 'foot';
  }
  TRAF.inQ += inRate * dt;
  TRAF.outQ += outRate * dt;

  if (TRAF.inQ >= 1){
    TRAF.inQ -= 1;
    if (!spawnArrival()) TRAF.turnedAway++;
  }
  if (TRAF.outQ >= 1){ TRAF.outQ -= 1; spawnDeparture(); }
}

/* Which bay a driver wants: the sought-after ones first, but only among those
   actually free, and with a bit of noise so two arrivals do not make for the
   same space. */
function pickBay(skip){
  let best = null, bs = -1;
  for (const b of BAYS){
    if (b.car || b.claimed) continue;
    if (skip && skip.indexOf(b) >= 0) continue;
    const sc = b.want * (0.55 + RND.traffic() * 0.9);
    if (sc > bs){ bs = sc; best = b; }
  }
  return best;
}

/* Temperament, which turns out to matter mechanically as well as for the
   character. Every car used to drive with the same timid following gap, so a
   queue moved at the pace of its most cautious member and nothing ever closed
   up. Giving the Audi somewhere to put its impatience is also what keeps the
   aisle flowing.

     top     how fast it will go on a clear run
     urge    metres of speed bought per metre of room ahead - high is tailgating
     accel   how hard it fills a gap that opens
     nerve   how close it will creep to a pedestrian before it stops
     wait    seconds of being stuck before it gives up and goes home   */
/* `temper` is shortness of it, 0 to 1, and it is one behaviour for everybody
   rather than a special case for the Audis. Everything in the car park responds
   to a blockage the same way and in the same order - wait, look for a way past,
   take it, and failing all that turn round - and temper only decides HOW LONG
   each stage gets. A granny works through the identical ladder; she just takes
   eight seconds to get bored where an A4 takes two, which is the difference
   between patience and a man in a German saloon deciding the bay row is a road. */
/* wetSlow: how much of its cruising speed it gives up in a full squall, in
   the same spirit as wait and temper - a character, not a physics number
   (Thomas, 2026-10-09: "audis are unchanged, jazzes half"). The Discovery
   has four-wheel drive and knows it; the MX-5 is light at the back and its
   driver has been round in a circle before. */
const NPC_MODELS = [
  { sprite:'jazz',      l:3.68, w:1.58, care:0.30, p:0.46,
    top:4.0, urge:0.38, accel:1.9, nerve:0.55, wait:45, temper:0.12, wetSlow:0.50 },
  { sprite:'a4',        l:4.36, w:1.70, care:0.95, p:0.30,
    top:7.4, urge:0.88, accel:5.0, nerve:1.25, wait:13, temper:0.95, wetSlow:0.00 },
  { sprite:'discovery', l:4.56, w:1.80, care:0.45, p:0.17,
    top:6.8, urge:0.82, accel:4.3, nerve:1.15, wait:14, temper:0.85, wetSlow:0.12 },
  { sprite:'miata',     l:3.60, w:1.60, care:0.90, p:0.07,
    top:7.0, urge:0.68, accel:5.4, nerve:0.95, wait:22, temper:0.55, wetSlow:0.30 }
];
function temperOf(c){
  return c.model && c.model.temper !== undefined ? c.model.temper : 0.45;
}
function pickModel(){
  const r = RND.traffic();
  return r < 0.42 ? NPC_MODELS[0] : r < 0.74 ? NPC_MODELS[1]
       : r < 0.94 ? NPC_MODELS[2] : NPC_MODELS[3];
}

function makeNpc(model, x, y, h, state, veh, paint){
  const c = { model:model, veh:veh || newVeh(model, paint), x:x, y:y, h:h, spd:0, state:state, bay:null,
              st0:state, born:simClockNow(),       // for the lab: how long arriving took
              path:null, at:0, t:0, wait:0, blocked:0, cid:'n' + (CID++),
              box:{ x:x, y:y, hl:model.l / 2, hw:model.w / 2, a:h,
                    c:Math.cos(-h), s:Math.sin(-h), kind:'car' } };
  CARS.push(c);
  return c;
}
function syncNpc(c){
  const b = c.box;
  b.x = c.x; b.y = c.y; b.a = c.h;
  b.c = Math.cos(-c.h); b.s = Math.sin(-c.h);
}

/* Where to route TO, for a point in a one-way aisle: the node upstream of it,
   so the last stretch is driven the way the aisle flows. The nearest node can
   be downstream, and for the east-end prime bays by the doors it always was -
   so every arrival for them came down the east column and turned into the
   prime aisle against the flow, head-on, and the store end locked solid. */
function destNode(tx, ty, rogue){
  let l = 0, bd = Infinity;
  for (let i = 0; i < LANES.length; i++){
    const d = Math.abs(LANES[i] - ty);
    if (d < bd){ bd = d; l = i; }
  }
  const f = laneFlow(l);
  if (rogue || !f || bd > 3.5) return nearestNode(tx, ty);
  let best = -1, bx = f > 0 ? -Infinity : Infinity;
  for (let i = 0; i < RNODE.length; i++){
    const n = RNODE[i];
    if (!n || Math.abs(n.y - LANES[l]) > 0.01) continue;
    if (f > 0 ? (n.x <= tx + 0.5 && n.x > bx) : (n.x >= tx - 0.5 && n.x < bx)){ bx = n.x; best = i; }
  }
  return best >= 0 ? best : nearestNode(tx, ty);
}
function routeFor(c, tx, ty){
  const a = nearestNode(c.x, c.y), b = destNode(tx, ty, c.rogue);
  /* Everybody keeps to the one-way system except a driver who has run out of
     patience with it. */
  let pth = routeTo(a, b, !c.rogue);
  /* One-way leaves an aisle exactly one way out, so a trolley or a lorry in
     the wrong place for a moment can leave a law-abiding driver with no legal
     route at all. Then they do what anybody does: go the wrong way, once. */
  if (!pth && !c.rogue){
    pth = routeTo(a, b, false);
    if (pth){ c.rogue = true; TRAF.forcedRogue = (TRAF.forcedRogue || 0) + 1; }
  }
  c.path = pth; c.at = 0;
  /* The nearest node can be one the car is already past. Two-way, driving
     back to it cost a few metres; one-way, it means turning round in the aisle
     to drive to a point behind you. Skip it if we are between it and the next. */
  if (pth && pth.length > 1){
    const n0 = RNODE[pth[0]], n1 = RNODE[pth[1]];
    if ((c.x - n0.x) * (n1.x - n0.x) + (c.y - n0.y) * (n1.y - n0.y) > 0) c.at = 1;
  }
  return pth !== null;
}

/* A driver who cannot get to the space they fancied takes a different space.
   This gave up after ONE pick, and since the lattice had a severed stretch in it
   the pick landed in the unreachable part most of the time - so the arrival was
   abandoned, the queued demand was consumed and lost, and occupancy could never
   climb to meet the target no matter what the curve asked for. 204 turned away
   against 40 let in. Trying a handful of bays is both the fix and what a person
   actually does. */
function spawnArrival(){
  if (!roomToArrive()) return false;
  const tried = [];
  for (let k = 0; k < 6; k++){
    const bay = pickBay(tried);
    if (!bay) return false;
    const g = carGate();
    /* WHO is arriving, first - and they come in their own car, in its own
       paint, if they have been before. A random car with a random person
       getting out of it meant Moira turned up in a different car each time. */
    const r = CENSUS.mute ? null : freeResident(RND.traffic() < 0.3 ? 'granny' : 'shopper');
    const model = r && r.car ? modelOf(r)
                : (r && r.kind === 'granny' && RND.traffic() < 0.62) ? NPC_MODELS[0] : pickModel();
    const c = makeNpc(model, g[0] + 0.5, g[1], 0, 'in', null, r && r.car && r.car.paint);
    if (r){ c.resident = r; r.reserved = c; }
    bay.claimed = true;
    c.bay = bay;
    if (routeFor(c, bay.ax, bay.ay)){ syncNpc(c); return true; }
    if (r) r.reserved = null;
    CARS.pop(); bay.claimed = false; tried.push(bay);
  }
  return false;
}

/* A departure starts with a PERSON. Somebody walks back to the car they came in,
   and only then does a car appear in the aisle - which is the whole point, and
   why this is not just the arrival run backwards. */
function spawnDeparture(){
  if (!roomToLeave()) return false;
  let best = null, bs = -1;
  for (const b of BAYS){
    if (!b.car || b.leaving) continue;
    if (b.longStay) continue;              // the staff are not going anywhere
    /* Nor is an abandoned car: nobody is coming for it but the truck. The old
       fallback below would otherwise invent a stranger to drive it away. */
    if (b.abandonedAt !== undefined || b.towing) continue;
    /* And somebody else's car is not available to be driven away. The departure
       channel used to pick any occupied bay, so a car whose owner was still in
       the shop would simply leave without her - and she would come out, walk to
       where she left it, and quite correctly conclude it had been stolen. Three
       spontaneous lost-car episodes in ninety seconds, none of them anything to
       do with god mode, which is what the muddle is supposed to be FOR. */
    let owned = false;
    for (const o of BEINGS){
      if (o.gone) continue;
      if (o.ownBay === b || (b.ownerCid && o.cid === b.ownerCid)) owned = true;
    }
    if (owned) continue;
    /* Staff at work are not leaving because the car park would like a space. */
    const offr = offMapOwner(b);
    if (offr && (offr.visit.where === 'work' || offr.visit.where === 'town')) continue;
    /* Its owner has gone home without it - forgot she drove, or gave up on it
       (2026-10-13: the census caught a driver invented for each). It stays,
       for the tickets and the truck, and nobody drives it away. */
    const vv = b.car.veh;
    if (vv && vv.ownerRid !== null && vv.ownerRid !== undefined){
      const rr = TOWN[vv.ownerRid];
      if (rr && !(rr.visit && rr.visit.out === null)) continue;
    }
    /* The far end goes first in the evening, the prime row clings on. */
    const sc = (1.6 - b.want) * (0.5 + RND.traffic());
    if (sc > bs){ bs = sc; best = b; }
  }
  if (!best) return false;
  /* Flagged, WITH a deadline. leaving was set here and cleared only on success,
     so every departure whose shopper never made it to the car stranded that bay
     for the rest of the run. Departures work perfectly in isolation - 81 in 700
     seconds with none lost - and died over a full day because the pool of bays
     that could depart quietly drained to nothing. */
  best.leaving = true;
  best.leaveBy = simClock + 240;
  /* Somebody already in the shop decides they are done, which is what a
     departure IS. Inventing a fresh person beside the car was the old way and it
     meant the car park quietly manufactured shoppers who had never arrived -
     the population and the traffic were telling different stories. Only somebody
     whose own car this is will do. */
  for (const b of BEINGS){
    if (b.life !== 'inStore' || b.ownBay !== best) continue;
    b.shopT = 0;
    return true;
  }
  /* Sat in it already - got in, could not get out, ended up back in the space.
     They just start the engine again. */
  const inCar = offMapOwner(best);
  if (inCar && inCar.visit.where === 'car'){
    beginDeparture(best);
    TRAF.restarted = (TRAF.restarted || 0) + 1;
    return true;
  }
  /* The owner is in the shop, off the map: they finish, and come out of the
     doors like everybody else. This is what a departure IS now - somebody you
     could have counted all along walking back to their own car. */
  const offr = offMapOwner(best);
  if (offr && offr.visit.where === 'shop' && KINDS[offr.kind]){
    const dr = nearestPlace(PLACES.doors, best.x, best.y);
    const who = addBeing(offr.kind, dr[0], dr[1] + 1.2, offr);
    who.spawned = true;
    who.ownBay = best;
    who.arrivedBy = 'car';
    who.carSprite = best.car && best.car.model ? best.car.model.sprite : null;
    who.parkedAt = bayStand(best);
    best.ownerCid = who.cid;
    if (best.car && best.car.veh) best.car.veh.ownerPid = who.pid;
    who.life = 'outDoors';
    CENSUS.ev.fetched = (CENSUS.ev.fetched || 0) + 1;
    return true;
  }
  /* Nobody owns it at all, which should no longer happen outside the test rig:
     a driver turns up for it the old way, and the census counts it. */
  const owner = addBeing('shopper', best.x + best.toAisle * 1.2, best.y);
  /* The census counts every one of these: a person who appeared beside a car
     with no visit behind them. Step 2 removes the need for them. */
  CENSUS.ev.inventedDrivers += CENSUS.mute ? 0 : 1;
  censusNote('invented driver', owner.name + ' for ' + (best.car && best.car.veh ? vehName(best.car.veh) : '?'));
  if (best.car && best.car.veh) best.car.veh.ownerPid = owner.pid;
  owner.spawned = true;
  owner.ownBay = best;
  owner.arrivedBy = 'car';
  owner.carSprite = best.car && best.car.model ? best.car.model.sprite : null;
  owner.parkedAt = bayStand(best);
  owner.life = 'toCar';
  return true;
}

/* Called by the being behaviour once its owner reaches the car - and that
   being, `who`, is the driver: said, not looked up. */
function beginDeparture(bay, who){
  const model = bay.car ? bay.car.model : pickModel();
  const veh = bay.car ? bay.car.veh : null;
  /* Whoever is getting in is now IN the car, as far as the census goes - their
     visit stays open until the car is out of the gate. */
  const drv = who || ownerOfBay(bay);
  if (drv){ drv.drove = true; if (veh) veh.ownerPid = drv.pid;
    if (drv.res && drv.res.visit && drv.res.visit.out === null) drv.res.visit.where = 'car'; }
  emptyBay(bay);
  bay.leaving = false; bay.leaveBy = undefined; bay.claimed = false;
  bay.longStay = false;
  const c = makeNpc(model, bay.x, bay.y, bay.h, 'out', veh);
  c.bay = bay;
  syncNpc(c);
  return c;
}

/* The driver. Kinematic rather than §3: twenty of these with full tyre models
   and ray fans would cost more than the car the whole project is about, and
   nobody needs weight transfer to park a Honda Jazz. A turn-rate limit of
   v/5 m is what stops it looking like a hovercraft. */
const NPC_LOOK = 9;
/* Metres left of a lane's centreline. 1.6 put a car's flank 0.3 m off the
   parked noses in a 6 m aisle, so its own look-ahead kept seeing them; 1.1
   leaves 0.65 m there and still parts opposing cars by 0.3 m. Measured over
   840 s: 41 cars out and 9 failed departures at 1.1, against 27-35 and 18 at
   1.6, and 23 and 21 with no keep-left at all. */
let KEEP_LEFT = 1.1;
/* The bay rows run PARALLEL to the aisles, which means three empty spaces in a
   row are a bypass lane and everybody knows it. This is the manoeuvre a blocked
   driver actually makes once waiting stops feeling like an option: swing out of
   the aisle into the empty spaces, drive along them past whatever is in the way,
   and rejoin beyond it. Nobody is proud of it and everybody has done it.
   Looks for the first run of three free bays ahead, on either side, and lays
   three waypoints through them - in, along, and back out. */
function bypassBays(c){
  const fwd = Math.cos(c.h) >= 0 ? 1 : -1;
  let best = null, bestAlong = 1e9;
  for (const row of ROWY){
    if (Math.abs(row - c.y) > 9.5) continue;
    const cand = [];
    for (const b of BAYS){
      if (Math.abs(b.y - row) > 1.0) continue;
      const along = (b.x - c.x) * fwd;
      if (along < 2.0 || along > 24) continue;
      cand.push({ b:b, along:along });
    }
    cand.sort(function(p, q){ return p.along - q.along; });
    let run = [];
    for (const e of cand){
      const free = !e.b.car && !e.b.claimed && !e.b.leaving;
      const adjacent = run.length === 0 ||
                       Math.abs(e.along - run[run.length - 1].along) < BAY * 1.6;
      if (free && adjacent) run.push(e);
      else run = free ? [e] : [];
      if (run.length >= 3) break;
    }
    if (run.length >= 3 && run[0].along < bestAlong){
      bestAlong = run[0].along; best = run;
    }
  }
  if (!best) return false;
  const first = best[0].b, last = best[best.length - 1].b;
  /* Round the OUTSIDE of the empty spaces, not into them. Aiming at the bay
     centres meant threading a 1.7 m car into a 2.95 m slot at forty degrees and
     straight back out again, and it got as far as putting its nose against the
     neighbouring Corsa every time. The free run is not the road - it is the
     PERMISSION. What it proves is that this side of the aisle has nothing
     sticking out of it, and three metres of lateral swing is all it takes to get
     round a stopped car and back again. Which is also the manoeuvre people
     actually make, with the same slightly guilty air. */
  /* Where the thing in the way actually is, because the swing has to be OUT
     before it and back IN after it. Hanging the waypoints off the free bay run
     instead put the first one level with the obstruction, so the car set off on
     a long shallow diagonal that passed within a metre of the very car it was
     going round, and stopped against it.

     2.4 m of offset, and that is measured rather than picked. The aisle runs
     clear from 38.3 to 45.7 - the bay rows either side are 11.1 m apart and a
     parked car sticks 1.84 m out of each - so there is 7.4 m of tarmac. A
     stopped Jazz occupies 41.2 to 42.8 of it. At 2.4 m out, the car going past
     covers 43.6 to 45.3: three quarters of a metre off the car it is passing and
     four tenths off the parked noses. Tight, rude, and entirely possible, which
     is the correct feeling for this manoeuvre. */
  let blockX = c.x + 8;
  for (const o of CARS){
    if (o === c || o.done) continue;
    const along = (o.x - c.x) * fwd;
    const across = Math.abs(o.y - c.y);
    if (along > 0 && along < 14 && across < 2.6) blockX = Math.min(blockX, o.x);
  }
  const sign = (first.y >= c.y) ? 1 : -1;
  const lane = c.y;
  const off = lane + sign * 2.4;
  c.detour = [
    [c.x + fwd * 3.2,      off],
    [blockX + fwd * 6.5,   off],
    [blockX + fwd * 11.0,  lane]
  ];
  /* Fourteen seconds, not twenty-six. It is a six-metre swing round a stopped
     car; if it has not come off in fourteen it is not going to, and the whole
     point of a ladder is that a rung you fall off drops you onto the next one
     rather than leaving you hanging. */
  c.detourT = 14;
  c.detourFrom = c.x;
  c.blocked = 0; c.queued = 0; c.seek = 0;
  TRAF.bypass = (TRAF.bypass || 0) + 1;
  return true;
}

function stepNpc(c, dt){
  c.t += dt;
  /* Safety net: an arrival with no bay to arrive at cannot be parked, and the
     parking code reads c.bay without asking - a TypeError there kills the
     frame loop. Whatever got it here, it leaves instead. */
  if ((c.state === 'in' || c.state === 'park') && !c.bay && !c.tow){
    c.state = 'go'; c.path = null; c.linedUp = false;
    TRAF.noBay = (TRAF.noBay || 0) + 1;
  }
  /* Dangling from the sky is not a journey. The hand owns the position; give the
     patience timers a rest too, or it files itself as a failed trip while it is
     being carried across the car park. */
  if (c.held){ c.spd = 0; c.blocked = 0; c.queued = 0; return; }
  /* A car lifted out of a space is waiting to be put down, not driving. */
  if (c.state === 'idle'){ c.spd *= Math.max(0, 1 - 6 * dt); return; }
  if (c.wait > 0){ c.wait -= dt; c.spd *= Math.max(0, 1 - 6 * dt); return; }

  let tx = c.x, ty = c.y, rev = false, arrive = 1.8, top = c.model.top;

  if (c.state === 'in' || c.state === 'go'){
    if (!c.path || c.at >= c.path.length){
      if (c.state === 'in'){ c.state = c.tow ? 'load' : 'park'; }
      else {
        /* The end of the road is the gate. Anywhere else, the path was lost
           (or never found) - get a new one, waiting if there is none yet. */
        const g = carGate();
        if (Math.hypot(g[0] - c.x, g[1] - c.y) > 12){
          if (!routeFor(c, g[0], g[1])){
            c.wait = 2 + RND.traffic() * 2;
            TRAF.routeWait = (TRAF.routeWait || 0) + 1;
          }
          return;
        }
        c.done = true; return;
      }
    } else {
      const n = RNODE[c.path[c.at]];
      tx = n.x; ty = n.y;
      /* Keep LEFT. Every car aimed at the dead centre of every lane, so two
         meeting in an aisle met nose to nose and the whole place locked solid
         at the entrance - fifteen cars at 0 mph. Aiming 1.6 m to the left of
         the centreline, measured off the direction of the leg being driven,
         puts opposing cars 3.2 m apart: enough to pass. Left of +x is +y here,
         the railway side, which is left as you drive in towards the store. */
      const pn = c.at > 0 ? RNODE[c.path[c.at - 1]] : null;
      const lx = pn ? n.x - pn.x : n.x - c.x, ly = pn ? n.y - pn.y : n.y - c.y;
      const ll = Math.hypot(lx, ly);
      /* In a one-way aisle there is nobody coming the other way, so the
         law-abiding take the middle and get the room either side for cars
         pulling out. Keep left is for the two-way roads, and for anybody
         going the wrong way down a one-way one. */
      const leg = pn ? edgeOf(c.path[c.at - 1], c.path[c.at]) : null;
      const keep = (leg && leg.dir && !c.rogue) ? 0 : KEEP_LEFT;
      if (ll > 1){ tx += -ly / ll * keep; ty += lx / ll * keep; }
      /* Advanced in ONE place. It used to step here and again at the bottom of
         the function, so every other waypoint was skipped and the route became
         a set of straight lines through the bay rows. */
      if (Math.hypot(tx - c.x, ty - c.y) < 5.5) c.at++;
    }
  }
  /* A detour overrides the route while it lasts. It is deliberately a short list
     of plain points rather than lattice nodes: the lattice is a road network and
     this is the opposite of using the roads. */
  c.onDetour = !!(c.detour && c.detour.length);
  if (c.onDetour){
    c.detourT = (c.detourT || 0) - dt;
    tx = c.detour[0][0]; ty = c.detour[0][1];
    top = Math.min(top, 3.4);
    /* A tighter arrival radius than a route node gets: these points are metres
       apart, not tens of metres, and a 2.3 m radius swallowed the first one
       whole. */
    if (Math.hypot(tx - c.x, ty - c.y) < 1.5) c.detour.shift();
    if (c.detourT <= 0 || !c.detour.length){
      /* Did it actually achieve anything? If the swing has not carried the car
         more than four metres past where it started, the gap was too small -
         which for a Discovery squeezing between a stopped Jazz and a row of
         parked noses is simply true - and the answer is to stop trying to get
         past and go round the other way. */
      const got = Math.abs(c.x - (c.detourFrom === undefined ? c.x : c.detourFrom));
      const failed = c.detourT <= 0 && got < 4.0;
      c.detour = null; c.onDetour = false;
      if (failed){
        c.jammed = 0; c.replanned = 0; c.bypasses = 9;   // no more squeezing
        c.unwedge = 1.6;
        c.lastSide = (c.lastSide === 1) ? -1 : 1;
        c.bias = c.lastSide * 0.5; c.biasT = 1.6;
        TRAF.turnedRound = (TRAF.turnedRound || 0) + 1;
      }
      if (c.state === 'in' && c.bay) routeFor(c, c.bay.ax, c.bay.ay);
      else if (c.state === 'go') { const g = carGate(); routeFor(c, g[0], g[1]); }
    }
  }
  if (c.state === 'park'){
    tx = c.x; ty = c.y;
    /* Line up in the aisle first, then turn in. Driving straight at the bay
       from wherever you happen to be is how you end up across two of them. */
    const lined = Math.hypot(c.bay.ax - c.x, c.bay.ay - c.y);
    /* Latch on POSITION AND HEADING, and unlatch if it drifts away again.
       Position alone was not enough: a car that sailed past its approach point
       still latched, then turned back on itself, and its forward probe pointed
       along the row of parked cars instead of into its own gap - which is
       exactly the room=0.0 at 5.5 m from the bay that every stalled manoeuvre
       reported. If it loses the plot it goes round and lines up again. */
    const facing = Math.abs(angDiff(c.bay.h, c.h));
    /* The latch used to require the car to be BOTH at the approach point and
       already facing within a radian of the bay axis. A car arriving along the
       aisle is at ninety degrees to its bay, so that condition could only ever
       be met by rotating on the spot - which is exactly what the old tank model
       did, and the moment the cars got a real steering lock it could not be met
       at all. Arrivals fell from twenty-one a day to one.
       A car does not pivot into a space, it ARCS into it, and an arc has to
       start before the space. So the turn-in now begins a radius short of the
       approach point - four and a bit metres, which is about the turning circle
       these get - and the steering describes the curve from there. Heading is no
       longer a precondition for turning in; it is the thing turning in produces. */
    if (c.linedUp && lined > 7.0 && facing > 1.3) c.linedUp = false;
    if (!c.linedUp && lined > 4.2){
      tx = c.bay.ax; ty = c.bay.ay; top = 2.6;
    }
    else { c.linedUp = true; tx = c.bay.x; ty = c.bay.y; top = 1.7; arrive = 0.7; }
    /* Parked when it is in the slot, not when it hits the middle of the paint.
       Either it reaches the centre, or it is close enough and has stopped
       moving - which is a car that has parked, however badly. */
    const dBay = Math.hypot(c.bay.x - c.x, c.bay.y - c.y);
    /* A car arcing 90 degrees into a 2.95 m bay out of a 6.4 m aisle needs about
       3.5 m of radius and has 3.6 to 4.4, so it very nearly makes it in one
       sweep and often does not. Nobody drives away in that situation; they stop,
       reverse half a length, and straighten up. Without this the arc left them
       at forty degrees across the bay, 'settled' never became true, and arrivals
       sat there until they swapped bays three times and went home - one arrival
       a day against twenty-one. */
    if (dBay < 4.5 && Math.abs(c.spd) < 0.3 &&
        Math.abs(angDiff(c.bay.h, c.h)) > 0.5 &&
        (c.unwedge || 0) <= 0 && (c.shuffles || 0) < 4){
      c.shuffles = (c.shuffles || 0) + 1;
      c.unwedge = 0.9;
      c.blocked = 0;
      /* OPPOSITE lock, and this is the whole point of a shuffle. Reversing on
         the steering you drove in on simply retraces the arc you just drove and
         puts you back where you started having achieved nothing - which is what
         it was doing. Winding the wheel the other way first is what gains the
         angle, and it is what everybody actually does without thinking about it:
         forward-left, back-right, forward-left again. */
      c.bias = -Math.sign(c.steer || 1) * 0.55;
      c.biasT = 0.9;
    }
    const settled = dBay < 2.8 && Math.abs(c.spd) < 0.35 &&
                    Math.abs(angDiff(c.bay.h, c.h)) < 0.95;
    if (settled) c.settle = (c.settle || 0) + dt; else c.settle = 0;
    if (c.linedUp && (dBay < 0.9 || c.settle > 0.9)){
      parkInBay(c.bay, c.model, RND.traffic, null,
                c.settle > 0.9 ? { x:c.x, y:c.y, a:c.h } : null, c.veh);
      c.bay.claimed = false;
      /* And out gets a shopper - who GOES INTO THE SHOP. Leaving that step out
         was the single worst bug in this session and the only one a screenshot
         found rather than a number: every arrival added a pedestrian who then
         wandered the car park for ever. 194 shoppers where there should be six,
         and the place looked like a riot. Nobody who has just parked mills
         about outside; they go in, they come out, they drive away. That one
         step bounds the population, removes the leak, and makes the departure
         trigger a shopping timer instead of a shift boundary. */
      /* Who got out depends on what they parked, which is a rule the cast
         already had: the grannies drive the Jazz. Tying the two together means
         the car park's population comes out of its own traffic rather than
         being declared separately. */
      /* The Manager or Trolleyboy: they already exist, so it is them who get
         out, not a new person. Also covers one of them who tried to drive
         home, could not get out, and parked up again. */
      const sb = c.staffBeing || staffBeingOf(c.veh);
      if (sb){
        settleStaff(sb, c);
        c.done = true;
        TRAF.arrived++;
        return;
      }
      /* Whoever is already IN it gets out. A car that tried to leave, could not,
         and parked up again still has its owner at the wheel - it is only a new
         arrival if nobody is. */
      const back = c.veh && c.veh.ownerRid !== null && c.veh.ownerRid !== undefined
                 ? TOWN[c.veh.ownerRid] : null;
      const again = !!(back && back.visit && back.visit.out === null &&
                       !residentOnSite(back));
      /* Or the resident who drove in, if this is a fresh arrival. */
      const fresh = !again && c.resident && !residentOnSite(c.resident) &&
                    !(c.resident.visit && c.resident.visit.out === null) ? c.resident : null;
      if (c.resident) c.resident.reserved = null;
      const kind = again ? figureOf(back) : fresh ? fresh.kind
                 : (c.model.sprite === 'jazz' && RND.traffic() < 0.62) ? 'granny' : 'shopper';
      const w = addBeing(kind, c.bay.x + c.bay.toAisle * 1.4, c.bay.y,
                         again ? back : fresh || undefined);
      if (again && !c.shopStaff) TRAF.reparkedOwner = (TRAF.reparkedOwner || 0) + 1;
      w.home = [c.bay.x + c.bay.toAisle * 1.4, c.bay.y];
      w.ownBay = c.bay;
      w.spawned = true;
      w.life = 'toDoors';
      w.arrivedBy = 'car';
      w.carSprite = c.model.sprite;
      /* The SPOT, not the bay. A bay is a slot that can be reassigned, nudged or
         emptied behind their back; where they actually left the car is what a
         person remembers and what they will walk back to. */
      w.parkedAt = bayStand(c.bay);
      c.bay.ownerCid = w.cid;
      if (c.veh){ c.veh.ownerPid = w.pid; c.veh.ownerRid = w.res ? w.res.rid : null;
        if (w.res){ w.res.car = carRecord(c.veh); if (w.res.visit) w.res.visit.by = 'car'; } }
      /* Not everybody who parks here is here for Tesco. */
      if (!again && wantsTown(w.res)) w.life = 'toTown';
      /* A member of staff starting a shift: into work, not into the shop. */
      if (c.shopStaff){ w.toWork = true; w.staff = true; c.bay.longStay = true; }
      c.done = true;
      TRAF.arrived++;
      return;
    }
  }
  /* The recovery truck at its job: up to the car, stop, lift it onto the bed,
     and away. */
  if (c.state === 'load'){
    const t = c.tow, bay = t.bay;
    /* Pull up IN THE LANE alongside the car, still pointing along the aisle,
       and winch it up from there. Driving to the bay's own approach point put a
       6.6 m truck nose-first across the aisle, and once loaded it was pointing
       into the parked row opposite with no room to turn out of it. */
    let ly = LANES[0], ld = Infinity;
    for (const L of LANES) if (Math.abs(L - bay.ay) < ld){ ld = Math.abs(L - bay.ay); ly = L; }
    tx = bay.x; ty = ly; top = 2.0; arrive = 1.2;
    const there = Math.abs(bay.x - c.x) < 2.5 && Math.abs(ly - c.y) < 2.2;
    if (there || t.lifting){
      c.spd *= Math.max(0, 1 - 6 * dt);
      if (!t.lifting){
        /* Somebody moved it (god, usually). Nothing to take. */
        if (!bay.car || bay.car.veh !== t.veh){
          bay.towing = false; c.state = 'go';
          const g = carGate(); routeFor(c, g[0], g[1]);
          return;
        }
        const bx = WORLD.boxes[bay.box];
        t.from = { x:bx.x, y:bx.y, a:bx.a };
        t.lifting = true;
        emptyBay(bay);
        bay.claimed = true;
      }
      t.loadT += dt;
      if (t.loadT >= 4.5 && !t.loaded){
        t.loaded = true;
        bay.claimed = false; bay.towing = false; bay.ownerCid = null;
        bay.abandonedAt = undefined; bay.tickets = 0; bay.longStay = false;
        bay.ticketBy = null;
      }
      if (t.loadT >= 7){
        c.state = 'go';
        /* Away the way he is FACING. Free to take the shortest way, he took the
           one behind him and spent a minute and a half turning a 6.6 m truck
           round in a 8 m aisle. If he is already going with the arrows he
           follows them out; if he came in against them he carries on. */
        const f = flowAt(c.y), east = Math.cos(c.h) > 0;
        if (f !== 0 && (f > 0) === east) c.rogue = false;
        const g = carGate(); routeFor(c, g[0], g[1]);
      }
      syncNpc(c);
      return;
    }
  }
  if (c.state === 'out'){
    rev = true; top = 2.2;
    /* Back out with the tail swung UPSTREAM, so the nose comes round pointing
       the way the aisle flows - which is what a one-way aisle is for, and what
       saves the three-point turn. */
    tx = c.bay.ax - flowAt(c.bay.ay) * 1.5; ty = c.bay.ay;
    if (Math.hypot(tx - c.x, ty - c.y) < 2.0){
      c.state = 'go';
      const g = carGate();
      /* No way out RIGHT NOW is not no way out: edges close while something
         stands on them. Wait in the aisle and ask again, rather than vanish. */
      if (!routeFor(c, g[0], g[1])){
        c.state = 'out'; c.wait = 2 + RND.traffic() * 2;
        TRAF.routeWait = (TRAF.routeWait || 0) + 1;
        return;
      }
    }
  }

  /* Steer. In reverse the geometry mirrors, which is why a car backing out of
     a space swings its nose the opposite way to the one you expect. */
  const want = angDiff(Math.atan2(ty - c.y, tx - c.x), rev ? c.h + Math.PI : c.h);

  /* These drove like tanks, and the reason was one number. The old rule slewed
     the heading straight toward the target at up to 3.3 rad/s with a FLOOR under
     it, so a car rotated about its own centre at a hundred and ninety degrees a
     second whether it was moving or not. Nothing about that is a car: no
     steering lag, no minimum radius, and rotation while stationary.

     So they get a steering wheel. Not Trueno's physics - no slip angles, no
     weight transfer, no friction ellipse, because twenty of those would cost
     more than the car the project is about - but the one piece of a car that you
     can actually see from above:

       steer   an angle with a LOCK and a RATE, so the wheels take a moment to
               go over and the car leads with its nose
       heading dh/dt = (v / wheelbase) tan(steer)

     Heading rate now comes from SPEED. A stopped car cannot rotate at all, which
     is why it needed the reverse-unwedge above to exist - under the old rule it
     could always spin its way out of anything, and that is exactly why it looked
     wrong. The turning circle falls out of the wheelbase: the Jazz comes out at
     about 3.3 m of radius, which is a 6.6 m circle, and a Jazz really does turn
     in 6.5 m.

     The low-speed lock bonus is not a fudge either - it is power steering and a
     driver winding on full lock at a crawl, which is how anyone gets into a
     space. It raises the lock, never the rate, so the car still has to turn its
     wheels before anything happens. */
  const wb = Math.max(1.9, c.model.l * 0.58);
  const crawl = 1 - Math.min(1, Math.abs(c.spd) / 2.2);
  const lock = 0.52 + 0.20 * crawl;                  // ~30 deg, ~41 at a crawl
  let aim = 1.6 * want * (rev ? -1 : 1);
  /* A car going round something steers away from its target on purpose - unless
     it has committed to a detour, in which case the detour IS the decision and
     the hopeful wiggle must not steer over the top of it. That conflict was why
     a car would decide to cut through the empty bays and then sit in the lane
     shuffling from side to side instead: two rungs of the same ladder both
     holding the wheel. */
  if ((c.biasT || 0) > 0 && !c.onDetour) aim = c.bias;
  const steerWant = Math.max(-lock, Math.min(lock, aim));
  const rate = 2.6 * dt;                             // lock to lock in ~0.4 s
  c.steer = (c.steer || 0) +
            Math.max(-rate, Math.min(rate, steerWant - (c.steer || 0)));
  c.h += (c.spd / wb) * Math.tan(c.steer) * dt;

  /* Look where you are going, at one tenth the physics rate - that is plenty
     for something doing walking pace in a car park, and twenty of them probing
     every step would cost more than Trueno does. */
  if ((c.t * 10 | 0) !== (c.lastLook | 0)){
    c.lastLook = c.t * 10 | 0;
    const dir = rev ? -1 : 1;
    /* Manoeuvring in and out of a bay is a different question from driving down
       an aisle, and asking it the same way deadlocked the whole system. A bay is
       2.55 m wide with cars either side, so a car-WIDTH corridor - 2.2 m with
       margin - never fits: every car backing out read as blocked from the first
       frame, sat there for its fourteen seconds and gave up. Over a simulated
       day that was 0 arrivals and 0 departures while bays quietly emptied.
       Threading a tight space is the one time you accept the gap you have. */
    /* Squeezing down a row of empty bays is as tight as parking, and wants the
       same relaxed idea of what counts as a gap. */
    const tight = (c.state === 'park' || c.state === 'out' || !!c.onDetour);
    const halfW = tight ? 0.30 : c.model.w / 2 + 0.15;
    const reach = tight ? 4.0 : NPC_LOOK;
    /* Hide its own box first, or it sees itself: the probe starts a couple of
       metres off the nose, the car's own rectangle reaches most of the way
       there, and every car reported zero room from the frame it spawned. */
    c.box.off = true;
    /* staticProbe, not corridorProbe: geometry, trolleys and other cars, but NOT
       people. A pedestrian is a reason to creep, never a reason to stop dead,
       and treating one as a wall deadlocked every arrival - the car stopped 1.5 m
       short of a shopper crossing the prime aisle, waited out its give-up timer
       and went home. Fourteen seconds is also no time at all to wait in a car
       park, so the timer is longer now and waiting for a person does not count
       towards it. */
    const look = trafficProbe(c.x + Math.cos(c.h) * dir * (c.model.l / 2 + 0.2),
                              c.y + Math.sin(c.h) * dir * (c.model.l / 2 + 0.2),
                              Math.cos(c.h) * dir, Math.sin(c.h) * dir,
                              reach, halfW);
    c.box.off = false;
    c.room = look;
    /* People, separately: how close is the nearest one in the way. */
    let ped = 99;
    for (const b of BEINGS){
      if (beingAbsent(b) || b.kind === 'gull' || b.kind === 'fox') continue;
      const dx = b.x - c.x, dy = b.y - c.y;
      const al = (dx * Math.cos(c.h) + dy * Math.sin(c.h)) * dir;
      const ac = Math.abs(-dx * Math.sin(c.h) + dy * Math.cos(c.h));
      if (al > -0.5 && al < 7 && ac < c.model.w / 2 + 1.0) ped = Math.min(ped, al);
    }
    c.ped = ped;
    /* And whether the thing in front is another car, which c.room cannot tell us
       because it is one number for scenery, trolleys and traffic alike. The
       difference decides whether this car is STUCK or merely QUEUING, and those
       are opposite situations. */
    let aheadCar = 99;
    for (const o of CARS){
      if (o === c) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      const al = (dx * Math.cos(c.h) + dy * Math.sin(c.h)) * dir;
      const ac = Math.abs(-dx * Math.sin(c.h) + dy * Math.cos(c.h));
      if (al > 0 && al < 9 && ac < c.model.w / 2 + 1.1) aheadCar = Math.min(aheadCar, al);
    }
    c.carAhead = aheadCar;
    c.tight = tight;
    /* Trueno is not in the distance field, so he is checked by hand - and
       given right of way, because a car park full of NPCs that drive into him
       would make the one interesting thing in it impossible. */
    const dx = car.x - c.x, dy = car.y - c.y;
    const ahead = (dx * Math.cos(c.h) + dy * Math.sin(c.h)) * dir;
    if (ahead > 0 && Math.hypot(dx, dy) < 11) c.room = Math.min(c.room, 1.2);
  }
  const room = c.room === undefined ? NPC_LOOK : c.room;
  const ped = c.ped === undefined ? 99 : c.ped;
  const d = Math.hypot(tx - c.x, ty - c.y);
  const urge = c.model.urge === undefined ? 0.55 : c.model.urge;
  const nerve = c.model.nerve === undefined ? 0.8 : c.model.nerve;
  /* In the rain, each driver gives up its own share of cruising speed, scaled
     by how hard it is coming down right here - but never below a walking pace
     cap, so nobody parks in slow motion. Zero in a pinned test rig. */
  const wetK = (c.model.wetSlow || 0) * rainHere(c.x, c.y);
  const topWet = wetK > 0 ? Math.max(Math.min(top, 1.5), top * (1 - wetK)) : top;
  c.wetK = wetK;
  let vWant = Math.min(topWet, urge * room + (c.tight ? 1.0 : 0), 0.75 * d + 0.4);
  /* A tailgater will sit closer before lifting; a granny leaves a car's length
     she does not need. */
  /* And if the curve he is on is blocked sooner than the straight line, believe
     the curve. */
  /* Ten times a second, not a hundred and twenty. This is a safety check on a
     five-metre arc and a car doing seven metres a second covers seventy
     centimetres between looks, so the freshness is ample - and it was the single
     most expensive thing in the sim. Forty microseconds per car per tick, every
     tick a wheel was turned, which is most of them: it alone took the test suite
     from forty seconds to six minutes. The last answer is cached and reused in
     between, which is what makes it a throttle rather than a hole. */
  if (Math.abs(c.steer || 0) > 0.12){
    c.arcT = (c.arcT || 0) - dt;
    if (c.arcT <= 0){
      c.arcD = trafficArc(c, rev ? -1 : 1, 5.0);
      c.arcT = 0.1;
    }
    if ((c.arcD === undefined ? 5 : c.arcD) < 1.2)
      vWant = Math.min(vWant, Math.max(0, c.arcD * 0.5));
  } else c.arcT = 0;

  /* Try left, try right, and only then give up on going forwards. The side is
     remembered per car and flipped on each fresh attempt, so a driver that finds
     nothing to the left tries the right next time instead of shaking its head at
     the same wall - and because the bias decays, it rejoins its route of its own
     accord once it is past whatever was in the way. */
  if (!rev && room < 2.2 && c.state !== 'park' && !c.onDetour &&
      (c.unwedge || 0) <= 0){
    c.seek = (c.seek || 0) + dt;
    if (c.seek > 1.7 - 1.4 * temperOf(c)){
      c.seek = 0;
      const lock = 0.52;
      const L = sideRoom(c, lock, 1, 7.0);
      const R = sideRoom(c, -lock, 1, 7.0);
      const prefer = (c.lastSide === 1) ? -1 : 1;      // alternate on each go
      let pick = 0;
      if (Math.max(L, R) > room + 1.2){
        /* Both open? take the one not tried last. Only one? take that one. */
        pick = (L > room + 1.2 && R > room + 1.2) ? prefer : (L > R ? 1 : -1);
      }
      if (pick !== 0){
        c.lastSide = pick;
        c.bias = pick * lock;
        c.biasT = 1.4;
        c.blocked = 0;                 // going round is progress, not failure
      }
    }
  } else c.seek = 0;
  if ((c.biasT || 0) > 0){
    c.biasT -= dt;
    vWant = Math.max(vWant, 1.1);       // enough to make the steering bite
  }
  const gapNeeded = c.tight ? 0.55 : (2.4 - nerve);
  /* This was a hard stop, and a hard stop is what gridlocked the car park. Every
     car in a stationary queue sits at roughly a metre of clearance, which is
     below everybody's preferred gap - so every car in the queue wanted zero
     speed, the queue could never close up, and one by one all of them timed out
     and went home. The same mistake as the pedestrian rule, which was already
     fixed by creeping rather than halting; cars simply never got the same
     treatment. So: creep. */
  if (room < gapNeeded) vWant = Math.min(vWant, Math.max(0, (room - 0.75) * 1.2));
  /* The last two metres of a parking manoeuvre: stop asking. Every single
     abandoned journey in the car park was a car lined up in front of a bay
     reading 0.3 m of room - because a prime-row bay sits 2.6 m from the kerb
     and a car is 2.4 m from centre to nose, so parking properly DOES put the
     nose 20 cm off the bollards. That is not an obstruction, it is the only
     legal position, and a forward probe is simply the wrong instrument there.
     He creeps the rest of the way in on the bay geometry alone. */
  const finalApproach = (c.state === 'park' && c.linedUp && d < 5.0);
  if (finalApproach) vWant = Math.max(0.55, Math.min(1.5, 0.7 * d));
  /* Creep for people rather than stopping: walking pace at four metres, a crawl
     at two, a halt only when one is practically on the bonnet. */
  /* And how close it will creep to somebody walking. The Audi noses up; the
     Jazz stops a long way back and waits, which is correct of both. */
  const pedStop = 2.3 - nerve;
  if (ped < 4.5 + nerve)
    vWant = Math.min(vWant, Math.max(0, (ped - pedStop) * (0.5 + 0.5 * nerve)));
  /* Belt and braces. A non-finite speed target propagates into the position in
     one step and from there into the distance field, where it took the whole
     sim down. The source is intermittent and I have not pinned it; stopping it
     here costs one comparison and turns a crash into a car that pauses. */
  if (!isFinite(vWant)) vWant = 0;
  /* Give up only when the GEOMETRY is against it - a queue behind a pedestrian,
     or behind another car, is just a car park working. Counting the second case
     as being stuck is why widening the pipeline made things WORSE: with eight
     cars moving it half-functioned, and with twenty-one every queue timed itself
     out, 170 abandoned journeys against 76 completed.
     The safety valve is separate and much longer. A queue that has not moved in
     two minutes is not a queue any more, and without this a genuine circular
     deadlock would simply accumulate cars for ever. */
  const carAhead = c.carAhead === undefined ? 99 : c.carAhead;
  const inQueue = carAhead < 9;
  const reallyStuck = vWant < 0.3 && Math.abs(c.spd) < 0.3 && ped > 4.5 &&
                      !inQueue && !finalApproach;
  if (inQueue && Math.abs(c.spd) < 0.3) c.queued = (c.queued || 0) + dt;
  else c.queued = 0;
  /* And the rung above going round: go THROUGH. Sitting in a queue is the one
     situation the give-up timer deliberately ignores, so without this a blocked
     car waited out the whole jam however cross it was. The threshold is where
     temper lives: about nine seconds for a Honda Jazz, under two for an A4. */
  /* A separate timer from `queued`, and it has to be: queued only counts while
     the car is under 0.3 m/s, and the rung below this one - trying a way round -
     deliberately keeps it creeping at over a metre a second. So the lower rung
     reset the timer the upper rung was waiting on, and a car could shuffle
     hopefully from side to side for ever without ever getting cross enough to do
     anything about it. jammed asks the honest question instead: is there a car in
     front of me and am I getting nowhere? */
  /* Measured as GROUND COVERED rather than speed. Speed is the wrong question:
     a car creeping hopefully from side to side is doing 1.5 m/s and going
     absolutely nowhere, and every speed-based threshold I tried either reset
     constantly or never reset at all. Half a second of clock, and if it has not
     got a metre further on, that half second was wasted - which is exactly the
     thing a short-tempered driver is counting. */
  c.progT = (c.progT || 0) + dt;
  if (c.progT >= 0.5){
    const moved = Math.hypot(c.x - (c.progX === undefined ? c.x : c.progX),
                             c.y - (c.progY === undefined ? c.y : c.progY));
    if (moved < 1.0 && carAhead < 10) c.jammed = (c.jammed || 0) + c.progT;
    else if (moved > 1.6) c.jammed = 0;
    c.progX = c.x; c.progY = c.y; c.progT = 0;
  }
  if (!c.onDetour && c.state !== 'park' && c.state !== 'out' &&
      c.jammed > 9.5 - 7.6 * temperOf(c) && (c.bypasses || 0) < 3){
    c.jammed = 0;
    c.bypasses = (c.bypasses || 0) + 1;
    /* Patience gone, and with it any respect for the arrows. Only the short-
       tempered: a Jazz will sit there all day rather than go the wrong way. */
    if (temperOf(c) > 0.7 && !c.rogue && c.bypasses >= 2){ c.rogue = true; TRAF.rogue = (TRAF.rogue || 0) + 1; }
    if (!bypassBays(c)){
      /* Nothing to cut through, so turn round and go the long way instead -
         which is the last thing anybody tries and the most satisfying to watch. */
      c.queued = 0; c.replanned = 0;
      c.unwedge = 1.6;
      c.lastSide = (c.lastSide === 1) ? -1 : 1;
      c.bias = c.lastSide * 0.5; c.biasT = 1.6;
      TRAF.turnedRound = (TRAF.turnedRound || 0) + 1;
    }
  }
  if (reallyStuck) c.blocked += dt; else c.blocked = 0;
  /* The valve, and it goes AFTER that reset rather than before it. Written the
     other way round it did nothing at all: queuing makes reallyStuck false, so
     the very next line set blocked back to zero and the car waited for ever.
     Cars were sitting in queues for 772 seconds with blocked reading 0. */
  if (c.queued > 120) c.blocked = 1e3;        // that is not traffic any more
  /* Try another way before giving up altogether. Eight cars funnelled down the
     same aisle queue behind each other, the one at the front stops for
     something, and the whole queue used to time out together - 177 abandoned
     journeys in a day. A driver in that position does not drive home, he backs
     up and goes round, so: re-plan once at eight seconds, and only go home if
     the new route is no better either. */
  if (c.blocked > 8 && (c.replanned || 0) < 2){
    c.replanned = (c.replanned || 0) + 1; c.blocked = 0;
    const tgt = (c.state === 'go') ? carGate()
              : (c.bay ? [c.bay.ax, c.bay.ay] : null);
    if (tgt && (c.state === 'in' || c.state === 'go')){
      if (routeFor(c, tgt[0], tgt[1])) TRAF.replans = (TRAF.replans || 0) + 1;
    }
  }
  /* And the one case the replan above could not help, which turned out to be the
     head of nearly every queue in the car park: a car in PARK state, sitting on
     its final waypoint with zero room, not lined up, and therefore never
     finishing. Re-routing to the same bay changes nothing - the bay is the
     problem. Three of these were parked across an aisle for twelve minutes each
     with a queue of ten behind them.
     A person in that position gives up on the space, not on the shopping. So:
     drop the claim, take another bay, and drive to it. */
  if (c.state === 'park' && Math.abs(c.spd) < 0.3 &&
      (c.room === undefined || c.room < 0.9)){
    c.parkStuck = (c.parkStuck || 0) + dt;
    if (c.parkStuck > 14 && (c.baySwaps || 0) < 3){
      c.parkStuck = 0; c.baySwaps = (c.baySwaps || 0) + 1;
      const old = c.bay;
      const fresh = pickBay(old ? [old] : null);
      if (fresh && routeFor(c, fresh.ax, fresh.ay)){
        if (old) old.claimed = false;
        fresh.claimed = true;
        c.bay = fresh; c.state = 'in'; c.linedUp = false; c.blocked = 0;
        TRAF.swapped = (TRAF.swapped || 0) + 1;
      }
    }
  } else c.parkStuck = 0;
  /* The last rung, and there wasn't one. The ladder runs out at three bypasses,
     and when that budget went so did every other escape at once: with
     `bypasses` at three nothing reads `jammed` any more, `queued` stays at zero
     because the car is still creeping rather than stopped, and `blocked` stays
     at zero for exactly the same reason. A car that had tried three ways round
     and failed just crawled on the spot for the rest of the day.
     The excitementometer is what found them. It spent most of a 900 s trace
     pinned to the prime aisle, and when I looked there were eight cars sitting
     there with jam timers reading 105, 147 and 307 seconds - which is not
     traffic, it is furniture. Worth knowing twice over: it was a real bug, and
     it was also what made the meter boring.
     Nobody behaves like that. Once the ways round are used up and you have
     spent half a minute going nowhere, you take whatever space is left
     somewhere else entirely, and failing that you drive out and shop in
     Lochee. */
  if (!c.onDetour && c.state !== 'out' && (c.bypasses || 0) >= 3 &&
      c.jammed > 24 - 12 * temperOf(c)){
    c.jammed = 0; c.blocked = 0; c.queued = 0;
    c.fedUp = (c.fedUp || 0) + 1;
    let moved = false;
    if (c.state === 'in' && !c.tow && (c.baySwaps || 0) < 3){
      /* Somewhere ELSE, and the distance floor is the whole point: re-picking
         on desirability alone hands back a bay in the same contested row, which
         is the row it cannot get through. */
      let far = null, fs = -1;
      for (const b of BAYS){
        if (b.car || b.claimed) continue;
        if (Math.hypot(b.ax - c.x, b.ay - c.y) < 22) continue;
        const sc = b.want * (0.6 + RND.traffic() * 0.8);
        if (sc > fs){ fs = sc; far = b; }
      }
      if (far && routeFor(c, far.ax, far.ay)){
        if (c.bay) c.bay.claimed = false;
        far.claimed = true;
        c.bay = far; c.linedUp = false;
        c.baySwaps = (c.baySwaps || 0) + 1;
        c.bypasses = 1;                    // a fresh row deserves a fresh go
        TRAF.swapped = (TRAF.swapped || 0) + 1;
        moved = true;
      }
    } else if (c.state === 'go' && (c.fedUp || 0) < 3){
      /* A departure that cannot get OUT does the opposite: parks up again and
         tries later. Nearest free bay, because the point is to stop occupying
         the aisle, not to find a good space. Giving up and vanishing from the
         middle of a lane is the popping all of this exists to prevent. */
      let near = null, nd = 1e9;
      for (const b of BAYS){
        if (b.car || b.claimed) continue;
        const d = Math.hypot(b.ax - c.x, b.ay - c.y);
        if (d < nd){ nd = d; near = b; }
      }
      if (near && routeFor(c, near.ax, near.ay)){
        if (c.bay){ c.bay.claimed = false; c.bay.leaving = false; }
        near.claimed = true;
        c.bay = near; c.state = 'in'; c.linedUp = false;
        c.bypasses = 1; c.replanned = 0;
        TRAF.gaveUpOut = (TRAF.gaveUpOut || 0) + 1;
        moved = true;
      }
    }
    if (!moved){
      if (c.bay){ c.bay.claimed = false; c.bay.leaving = false; c.bay = null; }
      const g = carGate();
      if (c.state !== 'go' && (c.fedUp || 0) < 3 && routeFor(c, g[0], g[1])){
        c.state = 'go'; c.linedUp = false;
        c.bypasses = 1; c.replanned = 0;
        TRAF.fedUp = (TRAF.fedUp || 0) + 1;
      } else if (routeFor(c, g[0], g[1])){
        /* Out of ideas. This used to delete the car, which is popping. A real
           driver with no ideas left switches the engine off, sits there, and
           then has another go at the way out. Visible, honest, and the jam
           around them usually moves on while they sulk. */
        c.state = 'go'; c.linedUp = false;
        c.fedUp = 1; c.bypasses = 1; c.replanned = 0;
        c.jammed = 0; c.blocked = 0; c.queued = 0;
        c.wait = 12 + RND.traffic() * 10;
        TRAF.sulked = (TRAF.sulked || 0) + 1;
        return;
      } else {
        /* No route to the gate at all, even the wrong way: the lattice is
           cut for the moment. Wait for it to open rather than vanish - as a
           car LEAVING, because its space has already been given up above, and
           an arrival with no bay crashes the parking code (it did, and in the
           live page that stops the frame loop dead). The 'go' path-end rule
           asks for a route again when the wait is over. */
        c.state = 'go'; c.path = null; c.linedUp = false;
        c.wait = 5 + RND.traffic() * 5;
        c.jammed = 0; c.blocked = 0;
        TRAF.cutWait = (TRAF.cutWait || 0) + 1;
        return;
      }
    }
  }
  if (c.blocked > (c.model.wait === undefined ? 25 : c.model.wait)){
    /* An ARRIVAL that gives up does what a departure that gives up does - it
       does not evaporate. It drives back out of the gate and shops somewhere
       else. The census caught twenty of these vanishing from the middle of the
       west end in one day. Once only: a car that cannot even get out is the
       last resort below, and is counted. */
    if ((c.state === 'in' || c.state === 'park') && !c.quit){
      if (c.bay){ c.bay.claimed = false; c.bay.leaving = false; }
      const g = carGate();
      if (routeFor(c, g[0], g[1])){
        c.quit = true; c.bay = null; c.state = 'go'; c.linedUp = false;
        c.blocked = 0; c.queued = 0;
        TRAF.quit = (TRAF.quit || 0) + 1;
        return;
      }
    }
    /* Gave up. An arrival abandons its claim; a departure that cannot get out
       parks itself again rather than evaporating, because a car that vanished
       from the middle of an aisle is exactly the popping this was built to
       stop. */
    /* Already given up once and stuck again, with no space to go back to: sit
       with the engine off and then try the gate again, as on the fed-up
       ladder. Never evaporate. */
    if (!c.bay || c.state === 'in' || c.state === 'park'){
      const g = carGate();
      if (routeFor(c, g[0], g[1])){
        if (c.bay){ c.bay.claimed = false; c.bay.leaving = false; c.bay = null; }
        c.state = 'go'; c.linedUp = false;
        c.blocked = 0; c.queued = 0; c.jammed = 0;
        c.wait = 12 + RND.traffic() * 10;
        TRAF.sulked = (TRAF.sulked || 0) + 1;
        return;
      }
    }
    if (c.bay && (c.state === 'out' || c.state === 'go')){
      /* A departure still beside its own space: back into it and try later. */
      parkInBay(c.bay, c.model, RND.traffic, null, null, c.veh);
      c.bay.claimed = false; c.bay.leaving = false;
      c.done = true;
      TRAF.gaveUp = (TRAF.gaveUp || 0) + 1;
      return;
    }
    /* Nowhere to put it and no way out just now: wait, never vanish. */
    c.wait = 5 + RND.traffic() * 5;
    c.blocked = 0; c.jammed = 0;
    TRAF.cutWait = (TRAF.cutWait || 0) + 1;
    return;
  }

  /* A car that has nowhere to go forwards backs up. Without this, EVERY give-up
     in the car park - 175 of them in two simulated days, and not one of any other
     kind - was the same situation: a departure reverses out of its bay, which
     leaves it square across the aisle with its nose pointing straight into the
     row opposite, hands over from 'out' to 'go', and 'go' only drives forwards.
     Zero clearance ahead, nothing in the way behind, no car anywhere near it, and
     a kinematic model that cannot turn without rolling. So it sat against a parked
     Corsa until its patience ran out, at one of four aisle mouths, over and over.
     Reversing for a second and a half is enough to swing the nose round, and then
     the ordinary steering takes it to the waypoint. It is also exactly what you do
     in a car park. */
  if (c.state !== 'out' && (c.unwedge || 0) <= 0 &&
      Math.abs(c.spd) < 0.3 && room < 0.9 && carAhead > 5){
    const bx = Math.cos(c.h), by = Math.sin(c.h);
    c.box.off = true;
    const behind = trafficProbe(c.x - bx * (c.model.l / 2 + 0.2),
                                c.y - by * (c.model.l / 2 + 0.2),
                                -bx, -by, 6.0, c.model.w * 0.5);
    c.box.off = false;
    if (behind > 3.0){
      c.unwedge = 1.5;
      /* Opposite lock first, same rule as the shuffle; and if the wheel happened
         to be straight, alternate instead so two attempts differ. */
      const cur = Math.abs(c.steer || 0) > 0.08 ? -Math.sign(c.steer) : null;
      if (cur !== null) c.lastSide = cur;
      else c.lastSide = (c.lastSide === 1) ? -1 : 1;
      c.bias = c.lastSide * 0.48;
      c.biasT = 1.5;
    }
  }
  if ((c.unwedge || 0) > 0){
    c.unwedge -= dt;
    rev = true; vWant = 1.4;
    c.blocked = 0;                       // backing out is progress, not failure
  }
  const sgn = rev ? -1 : 1;
  const target = vWant * sgn;
  /* Filling a gap: the impatient ones go for it. */
  const up = c.model.accel === undefined ? 3.4 : c.model.accel;
  const accel = (target > c.spd ? up : 5.5) * dt;
  c.spd += Math.max(-accel, Math.min(accel, target - c.spd));
  c.x += Math.cos(c.h) * c.spd * dt;
  c.y += Math.sin(c.h) * c.spd * dt;
  if (c.state === 'go'){
    const g = carGate();
    if (c.x < g[0] + 3 && Math.abs(c.y - g[1]) < 5){ c.done = true; TRAF.left++; }
  }
  syncNpc(c);
}

/* An NPC car in the air after being dropped. Same trick as stepCarFall: the
   driving model is 2D on purpose, so the fall is a little separate integration
   that exists only between release and landing. */
function stepNpcFall(c, dt){
  if (c.swim){
    if (swimStep(c, dt)) consignCar(c);
    else { c.airborne = c.swimZ; c.vzz = 0; syncNpc(c); }
    return true;
  }
  if (!c.airborne) return true;
  c.vzz = (c.vzz || 0) - GRAV * dt;
  c.airborne += c.vzz * dt;
  /* Straight line, independent spin - see the note in release(). */
  c.x += (c.fvx || 0) * dt;
  c.y += (c.fvy || 0) * dt;
  c.h += (c.spin || 0) * dt;
  /* Into the Tay. */
  if (c.airborne <= 0 && !c.abyss && inTay(c.x, c.y)){
    startSwim(c, 'car', c.fvx, c.fvy);
    c.airborne = -1e-3; c.vzz = 0; c.spin = 0; c.fvx = 0; c.fvy = 0;
    syncNpc(c);
    return true;
  }
  /* Over the black there is nothing to land on: the drop just carries on. */
  if (c.abyss || (c.airborne <= 0 && inVoid(c.x, c.y))){
    c.abyss = Math.max(1e-3, -c.airborne);
    if (c.abyss > VOID_DEPTH) consignCar(c);
    return true;
  }
  if (c.airborne <= 0){
    c.airborne = 0; c.vzz = 0;
    /* The wheels arrive. Whatever of the throw was pointing along the car
       becomes the roll; whatever was pointing across it is scrubbed off by the
       tyres, which is what that squeal would be if this had sound. */
    const fwd = (c.fvx || 0) * Math.cos(c.h) + (c.fvy || 0) * Math.sin(c.h);
    c.spd = Math.max(-9, Math.min(9, fwd));
    c.fvx = 0; c.fvy = 0;
    /* Tyres bite: the spin is killed by the landing, not replaced by a new one.
       Whatever forward speed it still has becomes a ROLL - a car set down with
       momentum does not stop dead, it trundles on with the handbrake not quite
       holding. Only the forward component, because that is the direction wheels
       go: the sideways part of a throw went into the spin on the way down and
       does not come back as motion. */
    c.spin = 0;
    c.rolling = true;
    syncNpc(c);
    /* A car that was lifted out of a space goes back to being a parked car
       wherever it is put down. It is not a journey and it should not become one:
       picking one up and setting it down two rows over should leave a car parked
       two rows over, which is the joke. It takes the nearest free space to where
       it landed so the bay it occupies is roughly the bay it is sitting in, and
       falls back to its own old space if it is nowhere near one. */
    return true;
  }
  return false;
}

/* The roll-out after a drop, and the settling that ends it. Kept out of stepNpc
   because none of the driving applies: it is not steering, it is not following a
   route, it is a parked car with the handbrake slipping. */
function stepNpcRoll(c, dt){
  c.x += Math.cos(c.h) * c.spd * dt;
  c.y += Math.sin(c.h) * c.spd * dt;
  /* A poor handbrake, not a good one: about four metres from walking pace. */
  c.spd *= Math.max(0, 1 - 1.1 * dt);
  /* Rolled off the edge of the world. Its roll becomes a straight-line throw and
     it goes over. */
  if (inVoid(c.x, c.y)){
    c.rolling = false;
    c.fvx = Math.cos(c.h) * c.spd; c.fvy = Math.sin(c.h) * c.spd;
    c.spd = 0; c.spin = 0;
    c.airborne = -1e-3; c.vzz = 0; c.abyss = 1e-3;
    syncNpc(c);
    return;
  }
  syncNpc(c);
  npcSolid(c, 0.08);                 // nudges past what it brushes, stops at a wall
  if (Math.abs(c.spd) < 0.25){
    c.spd = 0; c.rolling = false;
    /* A car that was lifted out of a space goes back to being a parked car
       wherever it finally came to rest. Picking one up and setting it down two
       rows over should leave a car parked two rows over, which is the joke, and
       it should not become a journey. Nearest free space to where it stopped, so
       the bay it owns is roughly the bay it is standing in. */
    if (c.repark){
      const bay = nearestFreeBay(c.x, c.y, 9.0) || c.fromBay;
      if (bay){
        if (c.fromBay && bay !== c.fromBay){
          c.fromBay.claimed = false; c.fromBay.leaving = false;
        }
        parkInBay(bay, c.model, RND.traffic, null, { x:c.x, y:c.y, a:c.h }, c.veh);
        bay.claimed = false;
        bay.ownerCid = c.ownerCid || null;    // still hers, wherever it now is
      }
      c.repark = false; c.done = true;
    } else {
      c.wait = Math.max(c.wait || 0, 0.4);
    }
  }
}

function stepCars(dt){
  for (const c of CARS){
    if (c.done) continue;
    /* ALOFT. A car three metres in the air is not part of the traffic and must
       not be solved against it in plan view, which is all these functions can
       see. Held cars were still running the trolley shunt and the overlap
       guarantee at ground level, so a car dangling from the hand barged its way
       through every space it passed over - and because its box stayed switched
       on, every car on the tarmac was dodging a shadow. Switching the box off
       takes it out of the field for everybody at once: its own perception, the
       other cars' perception, and the lattice. */
    const aloft = c.held || c.airborne > 0 || c.abyss;
    if (aloft){
      c.box.off = true;
      if (c.held) continue;                 // the hand is doing the moving
      stepNpcFall(c, dt);
      continue;
    }
    c.box.off = false;                      // back on the tarmac, back in the field
    if (c.rolling){ stepNpcRoll(c, dt); continue; }
    stepNpc(c, dt);
    npcShunt(c);
    npcSolid(c);
    /* And catch it at the source rather than three layers down in the distance
       field. A car that has gone non-finite is unrecoverable; it releases its
       bay and leaves quietly. */
    if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.h) || !isFinite(c.spd)){
      /* Put it back in its space rather than letting it evaporate. A departure
         has already emptied its bay, so a car lost on the way out vanished from
         the middle of an aisle - which is precisely the popping this whole
         system exists to abolish. */
      if (c.bay){
        if (c.state === 'out' || c.state === 'go') parkInBay(c.bay, c.model, RND.traffic, null, null, c.veh);
        c.bay.claimed = false; c.bay.leaving = false;
      }
      c.done = true;
      TRAF.nan = (TRAF.nan || 0) + 1;
    }
  }
  for (let i = CARS.length - 1; i >= 0; i--)
    if (CARS[i].done){ censusCarDone(CARS[i]); CARS.splice(i, 1); }
}

/* The recovery truck: no sprite in cast.sprite.txt, so boxes in code like the
   bus. Cab at the front, a flat bed behind, an amber beacon, and whatever it
   is carrying - lifted from the bay to the bed in an arc while it loads. */
function towParts(c){
  /* From the `tow` sprite: beacons flash alternately, and whatever it is
     carrying rides at the sprite's `bed` anchor, lifted from the bay to the
     bed in an arc while it loads. */
  const flash = (Math.sin(simClockNow() * 9) > 0) ? 1 : 0;
  const out = spriteItems('tow', c.x, c.y, c.h, 0, { cid:c.cid, each:function(q, it){
    if (q.n === 'beaconA' || q.n === 'beaconB'){
      const on = (q.n === 'beaconA') === !!flash;
      it.col = on ? '#ffcc33' : '#7a5a10'; it.lit = on ? 1 : 0;
    }
  } });
  const t = c.tow;
  if (t && (t.lifting || t.loaded)){
    const sp = CAST[t.model.sprite];
    const boxes = sp ? sp.states[sp.order[0]] : null;
    if (boxes){
      const k = t.loaded ? 1 : Math.min(1, t.loadT / 4.5);
      const bed = anchorAt('tow', 'bed', c.x, c.y, c.h) || [c.x, c.y, 0.95];
      const bedX = bed[0], bedY = bed[1];
      const fx = t.from ? t.from.x : bedX, fy = t.from ? t.from.y : bedY;
      const X = fx + (bedX - fx) * k, Y = fy + (bedY - fy) * k;
      const A = (t.from ? t.from.a : c.h) + angDiff(c.h, t.from ? t.from.a : c.h) * k;
      const Z = bed[2] * k + Math.sin(Math.PI * k) * 1.1;
      for (const q of spriteItems(t.model.sprite, X, Y, A, Z, { cid:c.cid, paint:t.veh && t.veh.paint }))
        out.push(q);
    }
  }
  return out;
}
function npcParts(c){
  if (c.model.sprite === 'tow') return towParts(c);
  const sp = CAST[c.model.sprite];
  if (!sp) return [];
  const boxes = sp.states[sp.order[0]];
  if (!boxes) return [];
  const ch = Math.cos(c.h), sh = Math.sin(c.h), out = [];
  for (const q of boxes)
    out.push({ cid:c.cid, lit:q.lit,
               X:c.x + q.f * ch - q.l * sh, Y:c.y + q.f * sh + q.l * ch,
               L:q.L, W:q.W, rot:c.h + q.rot,
               z0:q.z + (c.z || 0) + (c.airborne || 0),
               z1:q.z + q.H + (c.z || 0) + (c.airborne || 0),
               col:(q.paint && c.veh && c.veh.paint) ? tint(c.veh.paint, q.paintK) : q.col });
  return out;
}
