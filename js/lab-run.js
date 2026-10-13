/* Tesco Trueno - lab-run.js
   One experiment run (pre-neural step 5, 2026-10-13): a day that has already
   been built from a seed is run for a number of steps with nothing drawn, and
   scored. Loaded by lab-worker.js inside a background worker, or - where
   workers are not allowed - by the game page itself inside a hidden frame
   (trueno.html?seed=N&lab=1). Either way it talks to lab.html in messages:
     in:  { type:'run', ticks, code, every }
     out: { type:'progress', tick, of }  ...  { type:'done', result }  or  { type:'error', error }

   `code` is the variant under test: JavaScript run once, after the day is
   built and before the first step (e.g. "KEEP_LEFT = 1.4"). An empty string is
   the sim as it stands.

   Scores are what the day DID, so counters are taken as end minus start; a few
   things are averaged over samples every `every` steps. Integrity counts must
   always be zero - a run that invents a driver or loses a car is a bug, and
   the lab is a long-running way of finding them.

   These are READINGS, not one score to push up (Thomas, 2026-10-13: success
   is "an entertaining view, not an olympian granny" - a convincing granny
   improves her own day AND the viewer's). So there is a 'watching' group -
   how lively the place is, how much of it is jammed - beside the per-person
   ones, and the arrows only say which way is usually better. */

function labMetrics(){
  const ev = CENSUS.ev;
  return {
    arrived:TRAF.arrived, left:ev.carsExited || 0, turnedAway:TRAF.turnedAway,   // TRAF.left misses most exits
    parkN:ev.parkN || 0, parkSecs:ev.parkSecs || 0,
    bumps:MOOD.bumps || 0, sulks:MOOD.sulks || 0, truenoTay:VOID.trueno,
    tickets:ev.tickets || 0, towed:ev.towed || 0, soaked:RAIN.soaked,
    peopleTay:VOID.people + VOID.cast, carsTay:VOID.cars,
    vanishedCars:ev.carsVanished || 0, vanishedPeople:ev.peopleVanished || 0,
    invented:ev.inventedDrivers || 0,
    gdN:BRAINS.granny.days.n, gdSum:BRAINS.granny.days.sum, gdLost:BRAINS.granny.days.lost,
    gdChats:BRAINS.granny.days.chats, gdWet:BRAINS.granny.days.wet || 0, gaveUp:ev.gaveUp || 0,
    gdCompany:BRAINS.granny.days.company || 0,
    misremembered:ev.misremembered || 0, sheltered:ev.sheltered || 0, forgot:ev.forgot || 0,
    lingered:ev.lingered || 0, wandered:ev.wandered || 0, backIn:ev.backIn || 0,
    fedGulls:ev.fedGulls || 0, mobbed:ev.mobbed || 0,
    glMins:brainOf('gull').life.mins, glFeel:brainOf('gull').life.feel, glFood:brainOf('gull').life.food,
    glFlock:brainOf('gull').life.flock, glFright:brainOf('gull').life.frights, gullHeld:brainOf('gull').life.held,
    gullCrumbs:brainOf('gull').life.crumbs, glHeavy:brainOf('gull').life.heavy,
    gullLeft:brainOf('gull').life.left, gullArrived:brainOf('gull').life.arrived,
    fxNight:brainOf('fox').life.nightMins, fxFeel:brainOf('fox').life.feel, fxOn:brainOf('fox').life.onMins,
    foxVisits:brainOf('fox').life.visits, foxBins:brainOf('fox').life.bins, foxTrolleys:brainOf('fox').life.trolleys,
    foxSplats:brainOf('fox').life.splats, foxPounces:brainOf('fox').life.pounces, fxPair:brainOf('fox').life.pairMins,
    fxLit:brainOf('fox').life.litMins, foxBolts:brainOf('fox').life.bolts, foxTip:brainOf('fox').life.tipTrips,
    tidied:ev.tidied || 0, trolleysRighted:ev.trolleysRighted || 0, moans:ev.moans || 0, staffTidied:ev.staffTidied || 0
  };
}
/* The rows lab.html shows, in order: [key, label, group, better]. `better` is
   'up', 'down' or '' (just a reading); integrity rows must be zero. */
const LAB_ROWS = [
  ['arrived',      'cars arrived and parked',      'traffic',   'up'],
  ['left',         'cars out through the gate',     'traffic',   'up'],
  ['turnedAway',   'turned away at the gate',       'traffic',   'down'],
  ['parkTime',     'seconds to find a bay',         'traffic',   'down'],
  ['moving',       'cars on the move (mean)',       'traffic',   ''],
  ['people',       'people about (mean)',           'watching',  'up'],
  ['jammed',       'cars stuck over 8 s (mean)',    'watching',  'down'],
  ['grannyDay',    'a granny\'s day (score)',       'grannies',  'up'],
  ['grannyLost',   'seconds without her car, each', 'grannies',  'down'],
  ['grannyChats',  'chats, each',                   'grannies',  ''],
  ['grannyCompany','company (score), each',         'grannies',  'up'],
  ['grannyWet',    'seconds out in the rain, each', 'grannies',  'down'],
  ['misremembered','went to last time\'s space',    'grannies',  ''],
  ['sheltered',    'waited out a shower',           'grannies',  ''],
  ['lingered',     'another wee minute',            'grannies',  ''],
  ['wandered',     'a wee wander after the shop',   'grannies',  ''],
  ['backIn',       'back in for the milk',          'grannies',  ''],
  ['fedGulls',     'fed the gulls',                 'grannies',  ''],
  ['mobbed',       'mobbed by gulls',               'grannies',  'down'],
  ['gaveUp',       'gave up on her car',            'grannies',  'down'],
  ['forgot',       'forgot she drove (bus home)',   'grannies',  ''],
  ['gdN',          'grannies scored',               'grannies',  ''],
  ['gullHappy',    'a gull\'s life (feel a minute)', 'gulls',     'up'],
  ['gullFood',     'food, a gull-minute',           'gulls',     'up'],
  ['gullFlock',    'share of time in company',      'gulls',     'up'],
  ['gullFright',   'frights, a gull-hour',          'gulls',     'down'],
  ['gullHeld',     'held its nerve',                'gulls',     ''],
  ['gullCrumbs',   'crumbs eaten',                  'gulls',     ''],
  ['gullHeavy',    'share of time too heavy to fly', 'gulls',     'down'],
  ['gullLeft',     'gave up - tip or Tay',          'gulls',     'down'],
  ['gullArrived',  'new gulls flew in',             'gulls',     ''],
  ['foxHappy',     'a fox\'s night (feel a minute)', 'foxes',    'up'],
  ['foxVisits',    'visits to the car park',        'foxes',     ''],
  ['foxOnShare',   'share of the night on the car park', 'foxes', ''],
  ['foxBins',      'bins tipped',                   'foxes',     ''],
  ['foxTrolleys',  'trolleys tipped (carrots)',     'foxes',     ''],
  ['foxSplats',    'gull splats eaten',             'foxes',     ''],
  ['foxPounces',   'pounces at gulls',              'foxes',     ''],
  ['foxPairShare', 'share of a visit together',     'foxes',     'up'],
  ['foxLitShare',  'share of a visit in lamplight', 'foxes',     'down'],
  ['foxBolts',     'made to bolt',                  'foxes',     'down'],
  ['foxTip',       'trips to the tip',              'foxes',     ''],
  ['tidied',       'Ralph swept up',                'foxes',     ''],
  ['trolleysRighted','Kyle righted a trolley',      'foxes',     ''],
  ['moans',        'boomers moaned about the mess', 'foxes',     ''],
  ['staffTidied',  'Derek/Gordon/Kyle tidied (on a moan)', 'foxes', ''],
  ['bumps',        'Trueno: bumps',                 'trueno',    'down'],
  ['sulks',        'Trueno: sulks',                 'trueno',    'down'],
  ['truenoTay',    'Trueno: into the Tay',          'trueno',    'down'],
  ['tickets',      'tickets written',               'town',      ''],
  ['towed',        'cars towed',                    'town',      ''],
  ['soaked',       'people soaked',                 'town',      'down'],
  ['raining',      'share of time raining',         'town',      ''],
  ['peopleTay',    'people lost to the Tay',        'town',      'down'],
  ['carsTay',      'cars lost to the Tay',          'town',      'down'],
  ['vanishedCars', 'cars vanished',                 'integrity', 'zero'],
  ['vanishedPeople','people vanished',              'integrity', 'zero'],
  ['invented',     'drivers invented',              'integrity', 'zero'],
  ['unaccounted',  'parked cars unaccounted (end)', 'integrity', 'zero'],
  ['carless',      'drivers without a car (end)',   'integrity', 'zero']
];

function labHash(txt){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < txt.length; i++){ h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}
/* The whole saved state, hashed: two runs of the same seed and variant must
   agree on it exactly, wherever they ran. */
function labFingerprint(){
  if (typeof saveEncode !== 'function') return null;
  return labHash(JSON.stringify(saveEncode(SAVE_TOWN.concat(SAVE_MOMENT))) + JSON.stringify(saveRng()));
}

function labRun(cfg, post){
  const ticks = cfg.ticks | 0, every = cfg.every || 600;
  try {
    if (cfg.code) (0, eval)(cfg.code);
  } catch (e){ post({ type:'error', error:'variant code: ' + (e.message || e) }); return; }
  const m0 = labMetrics();
  const t0 = performance.now();
  const end = SIM_TICK + ticks;
  let samples = 0, moving = 0, raining = 0, people = 0, jammed = 0;
  let lastPost = 0;
  /* Between chunks, a message to itself rather than setTimeout: a browser
     slows chained timers to once a second in a tab that is not in front,
     which would make the frame fallback crawl. Messages are not slowed. */
  const ch = new MessageChannel();
  const later = function(){ ch.port2.postMessage(0); };
  const chunk = function(){
    try {
      const stop = Math.min(end, SIM_TICK + 1200);
      if (self.LAB_SCREEN) self.LAB_SCREEN.on = true;
      while (SIM_TICK < stop){
        simStep();
        if (SIM_TICK % every === 0){
          samples++;
          moving += CARS.length;
          raining += WX.rain > 0.05 ? 1 : 0;
          people += BEINGS.length;
          for (const c of CARS) if (c.blocked > 8) jammed++;
        }
      }
      if (self.LAB_SCREEN) self.LAB_SCREEN.on = false;
      const now = performance.now();
      if (now - lastPost > 250){ lastPost = now; post({ type:'progress', tick:ticks - (end - SIM_TICK), of:ticks }); }
      if (SIM_TICK < end){ later(); return; }
      ch.port1.onmessage = null;
      const m1 = labMetrics();
      const r = {};
      for (const k in m1) r[k] = m1[k] - m0[k];
      r.parkTime = r.parkN > 0 ? r.parkSecs / r.parkN : null;
      r.moving = samples ? moving / samples : null;
      r.raining = samples ? raining / samples : null;
      r.people = samples ? people / samples : null;
      r.grannyDay = r.gdN > 0 ? r.gdSum / r.gdN : null;
      r.grannyLost = r.gdN > 0 ? r.gdLost / r.gdN : null;
      r.grannyChats = r.gdN > 0 ? r.gdChats / r.gdN : null;
      r.grannyWet = r.gdN > 0 ? r.gdWet / r.gdN : null;
      r.grannyCompany = r.gdN > 0 ? r.gdCompany / r.gdN : null;
      r.gullHappy = r.glMins > 0 ? r.glFeel / r.glMins : null;
      r.gullFood = r.glMins > 0 ? r.glFood / r.glMins : null;
      r.gullFlock = r.glMins > 0 ? r.glFlock / r.glMins : null;
      r.gullFright = r.glMins > 0 ? 60 * r.glFright / r.glMins : null;
      r.gullHeavy = r.glMins > 0 ? r.glHeavy / r.glMins : null;
      r.foxHappy = r.fxNight > 0 ? r.fxFeel / r.fxNight : null;
      r.foxOnShare = r.fxNight > 0 ? r.fxOn / r.fxNight : null;
      r.foxPairShare = r.fxOn > 0 ? r.fxPair / r.fxOn : null;
      r.foxLitShare = r.fxOn > 0 ? r.fxLit / r.fxOn : null;
      r.jammed = samples ? jammed / samples : null;
      const c = census();
      const abandoned = BAYS.filter(function(q){ return q.car && q.abandonedAt !== undefined; }).length;
      r.unaccounted = Math.max(0, c.cars.orphanLong + c.cars.orphanShort - abandoned);
      r.carless = c.people.carless;
      post({ type:'done', result:{
        metrics:r, ms:Math.round(performance.now() - t0), ticks:ticks,
        simSecs:ticks * DT, fp:labFingerprint(),
        /* Every kind's collected choices (only the kind being trained has its
           tap switched on). This said BRAINS.granny.tap until the gulls came. */
        tap:Object.keys(BRAINS).reduce(function(all, k){ return BRAINS[k].tap ? all.concat(BRAINS[k].tap) : all; }, []),
        screen:self.LAB_SCREEN ? self.LAB_SCREEN.touches : null,
        screenWhat:self.LAB_SCREEN ? self.LAB_SCREEN.what.slice(0, 8) : null } });
    } catch (e){
      if (self.LAB_SCREEN) self.LAB_SCREEN.on = false;
      post({ type:'error', error:(e.stack || String(e)) + '\n  at sim tick ' + SIM_TICK });
    }
  };
  ch.port1.onmessage = chunk;
  chunk();
}

/* In a frame: the game page has built its day; wait for lab.html's word. */
if (typeof self.LAB_WORKER === 'undefined' && typeof window !== 'undefined' && window.parent !== window){
  addEventListener('message', function(e){
    if (e.data && e.data.type === 'run') labRun(e.data, function(m){ parent.postMessage(m, '*'); });
  });
  parent.postMessage({ type:'ready' }, '*');
}
