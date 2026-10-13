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
    invented:ev.inventedDrivers || 0
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
      r.jammed = samples ? jammed / samples : null;
      const c = census();
      const abandoned = BAYS.filter(function(q){ return q.car && q.abandonedAt !== undefined; }).length;
      r.unaccounted = Math.max(0, c.cars.orphanLong + c.cars.orphanShort - abandoned);
      r.carless = c.people.carless;
      post({ type:'done', result:{
        metrics:r, ms:Math.round(performance.now() - t0), ticks:ticks,
        simSecs:ticks * DT, fp:labFingerprint(),
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
