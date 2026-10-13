/* Tesco Trueno - 15-save.js
   Save and load (pre-neural step 4, 2026-10-13).

   Two layers, agreed with Thomas:
   - THE TOWN: the residents and every visit they have made, the cars they own,
     the census tallies and the id counters. Small, and the part that must never
     be lost - it is what the brains will learn into.
   - THE MOMENT: everything else that moves - cars mid-manoeuvre, who is in the
     shop, the weather, the lorry, Trueno, the clock, and where every random
     stream has got to. Close the tab, open it again, and the day carries on
     from exactly there (Thomas chose "resume the moment").

   The sim is a web of objects pointing at each other: a bay holds its car, the
   car holds its owner, the owner holds her visit, the visit holds the bay. A
   file cannot hold a pointer, so each object is written ONCE, given a number,
   and every other mention of it is written as that number. Loading reverses it
   and every link comes back to the same object. Things the code builds the same
   way on every load (the sprites, the car models, the road graph, the names)
   are not copied at all: they are written by WHERE they are ("NPC_MODELS/3"),
   and come back as this load's own copy.

   Versions: the moment is only loaded by the code that wrote it (SAVE_VERSION).
   When the sim changes shape, bump it - an older moment is then skipped and the
   town alone is carried into a fresh day, so the people and their histories
   survive any change to the code. TOWN_VERSION is the town's own, with
   upgrades in TOWN_UPGRADE, and should hardly ever move.

   Where: IndexedDB in the browser, every half minute of sim time and whenever
   the tab is hidden or closed. Safari on an iPad clears a site's storage if it
   is not opened for about a week, so EXPORT writes a file to keep (and to move
   a town between machines), and IMPORT reads one back.

   Not saved: the view, the zoom, the cameras' heads, god mode's hand. A page
   opened with ?seed= is a replay: it neither loads nor saves.

   ADDING A GLOBAL THAT CHANGES AS THE SIM RUNS? Put it in SAVE_MOMENT, or the
   day will drift after a reload. The suite's round-trip row catches a miss. */

const SAVE_VERSION = 1;
const TOWN_VERSION = 1;
const TOWN_UPGRADE = {};             // n -> function(town) giving version n + 1

/* The moment: every global that changes as the sim runs (found by stepping the
   sim and fingerprinting all 290 top-level names), plus the switches. */
const SAVE_MOMENT = [
  'TRAF', 'SHIFTS', 'WX', 'SQ', 'RAIN', 'PUDDLES', 'SPRAY', 'FLY',
  'WORLD', 'BAYS', 'CARS', 'LORRY', 'TOW', 'MOVERS', 'MOOD', 'car', 'CTL', 'visit',
  'simClock', 'MAN', 'REDGE', 'ROUTE', 'lastGap', 'RIPPLES', 'RUB', 'RUB_LAID', 'CID',
  'BEINGS', 'TOD', 'DAY_N', 'EXC', 'EXB', 'EXD', 'EXE', 'EM', 'BUS', 'BUS_STOP',
  'CAR_GATE', 'GATE', 'SIM_TICK', 'VOID', 'HELP', 'LAMP',
  'fastDay', 'auto', 'OCCUPANCY', 'TRAFFIC_OFF', 'LORRY_PIN', 'WET_PIN', 'withLorry', 'trace'
];
/* The town. */
const SAVE_TOWN = ['TOWN', 'PEOPLE', 'VEH', 'PID', 'VID', 'CENSUS'];
/* Built by the code, identically on every load, and never changed by the sim:
   referred to by place, never copied. */
const SAVE_SHARED = [
  'CAST', 'NPC_MODELS', 'TOW_MODEL', 'KINDS', 'BEHAVE', 'PLACES', 'NAMES', 'SKIN', 'HAIR',
  'PAINTS', 'PEAK', 'WANDER', 'LOST', 'TONE_DEFAULT', 'GENE', 'DOING', 'JDOING',
  'BANDS', 'ROWY', 'CROSS', 'LANES', 'RNODE', 'SITE_C', 'SHELTERS', 'MASTS', 'CC',
  'DOORS', 'DOCK', 'CORN', 'GND', 'GND_NIGHT', 'AREAS', 'GROUND', 'RAILS', 'SCEN',
  'BODY', 'TROLLEY', 'SWIM', 'CCTV_HOME', 'STARTS'
];

/* Globals by name. Indirect eval runs in the global scope, which is where the
   top-level let and const of every script live. */
function saveGet(name){ return (0, eval)(name); }
function saveSet(name, v){ window.__saveV = v; (0, eval)(name + ' = window.__saveV'); window.__saveV = null; }

/* ---------------------------------------------------------------- the shared things, by place */
let SAVE_REG = null;                 // { byObj: Map(obj -> path), byPath: Map(path -> obj) }
function saveRegistry(){
  if (SAVE_REG) return SAVE_REG;
  const own = new Set();
  for (const n of SAVE_MOMENT.concat(SAVE_TOWN)){
    const v = saveGet(n);
    if (v && typeof v === 'object') own.add(v);
  }
  const byObj = new Map(), byPath = new Map();
  const walk = function(x, path){
    if (!x || (typeof x !== 'object' && typeof x !== 'function')) return;
    if (own.has(x) || byObj.has(x)) return;
    byObj.set(x, path); byPath.set(path, x);
    if (typeof x === 'function' || ArrayBuffer.isView(x)) return;
    for (const k of Object.keys(x)) walk(x[k], path + '/' + k);
  };
  for (const n of SAVE_SHARED) walk(saveGet(n), n);
  SAVE_REG = { byObj:byObj, byPath:byPath };
  return SAVE_REG;
}

/* ---------------------------------------------------------------- encoding
   Every object or array is written once, numbered by $i; after that it is
   {$r:n}. Shared things are {$s:path}; named functions {$f:name}; numbers JSON
   cannot hold (NaN, Infinity, -0) are {$n:'...'}; undefined is {$u:1}.
   `cut` (a Set) turns the objects in it into null - the town on its own leaves
   out the bays and beings its records point at. */
function saveEncode(names, cut){
  const reg = saveRegistry();
  const ids = new Map();
  let next = 0;
  const roots = {};
  /* The roots are numbered first, so a root first met INSIDE another root
     still comes back as the one live object. */
  for (const n of names){
    const v = saveGet(n);
    if (v && typeof v === 'object') ids.set(v, next++);
  }
  const done = new Set();
  const enc = function(x, path, isRoot){
    if (x === undefined) return { $u:1 };
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return x;
    if (typeof x === 'number'){
      if (Number.isNaN(x)) return { $n:'NaN' };
      if (x === Infinity) return { $n:'Inf' };
      if (x === -Infinity) return { $n:'-Inf' };
      if (x === 0 && 1 / x < 0) return { $n:'-0' };
      return x;
    }
    if (typeof x === 'function'){
      if (reg.byObj.has(x)) return { $s:reg.byObj.get(x) };
      if (x.name && window[x.name] === x) return { $f:x.name };
      throw new Error('save: a function at ' + path);
    }
    if (cut && cut.has(x)) return null;
    if (!isRoot && reg.byObj.has(x)) return { $s:reg.byObj.get(x) };
    /* Already written - or a root met before its own entry, which writes it. */
    if (ids.has(x) && (done.has(x) || !isRoot)) return { $r:ids.get(x) };
    if (!ids.has(x)) ids.set(x, next++);
    done.add(x);
    const i = ids.get(x);
    if (ArrayBuffer.isView(x)) return { $i:i, $t:x.constructor.name, v:Array.from(x, function(e){ return enc(e, path); }) };
    if (Array.isArray(x)) return { $i:i, $a:x.map(function(e, k){ return enc(e, path + '/' + k); }) };
    const p = Object.getPrototypeOf(x);
    if (p !== Object.prototype && p !== null)
      throw new Error('save: a ' + (x.constructor && x.constructor.name) + ' at ' + path);
    const o = {};
    for (const k of Object.keys(x)) o[k] = enc(x[k], path + '/' + k);
    return { $i:i, $o:o };
  };
  for (const n of names) roots[n] = enc(saveGet(n), n, true);
  return roots;
}

/* Decoding. Each root's own live object is reused where it can be - a const
   array is emptied and refilled, never replaced, so anything that held on to
   it still holds the right one. */
function saveDecode(roots){
  const reg = saveRegistry();
  const objs = [];
  const fills = [];
  const shell = function(e){
    if (e.$a) return [];
    if (e.$t) return new window[e.$t](e.v.length);
    return {};
  };
  const dec = function(e){
    if (e === null || typeof e !== 'object') return e;
    if (e.$u) return undefined;
    if (e.$n !== undefined) return e.$n === 'NaN' ? NaN : e.$n === 'Inf' ? Infinity : e.$n === '-Inf' ? -Infinity : -0;
    if (e.$s !== undefined){
      if (!reg.byPath.has(e.$s)) throw new Error('save: nothing at ' + e.$s);
      return reg.byPath.get(e.$s);
    }
    if (e.$f !== undefined){
      if (typeof window[e.$f] !== 'function') throw new Error('save: no function ' + e.$f);
      return window[e.$f];
    }
    if (e.$r !== undefined){
      if (!objs[e.$r]) throw new Error('save: forward reference ' + e.$r);
      return objs[e.$r];
    }
    if (e.$t){
      const out = objs[e.$i] || shell(e);
      for (let k = 0; k < e.v.length; k++) out[k] = dec(e.v[k]);
      objs[e.$i] = out;
      return out;
    }
    const out = objs[e.$i] || shell(e);
    objs[e.$i] = out;
    if (e.$a){
      out.length = 0;
      for (const v of e.$a) out.push(dec(v));
    } else {
      for (const k of Object.keys(out)) delete out[k];
      for (const k of Object.keys(e.$o)) out[k] = dec(e.$o[k]);
    }
    return out;
  };
  /* Roots first: a root that is a live object of the same kind is filled in
     place; a typed array of the same length too. */
  for (const n of Object.keys(roots)){
    const e = roots[n];
    if (!e || typeof e !== 'object' || e.$i === undefined) continue;
    let live; try { live = saveGet(n); } catch (err){ continue; }
    const same = live && typeof live === 'object' &&
      ((e.$a && Array.isArray(live)) || (e.$o && !Array.isArray(live) && !ArrayBuffer.isView(live)) ||
       (e.$t && ArrayBuffer.isView(live) && live.constructor.name === e.$t && live.length === e.v.length));
    /* Every root has its object before anything is read, so a root that
       turns up inside another root links to it, live or new. */
    objs[e.$i] = same ? live : shell(e);
  }
  for (const n of Object.keys(roots)){
    let exists = true;
    try { saveGet(n); } catch (err){ exists = false; }
    if (!exists) continue;                       // a global this code no longer has
    const v = dec(roots[n]);
    let live = saveGet(n);
    if (live !== v){
      try { saveSet(n, v); }
      catch (err){ throw new Error('save: cannot restore ' + n + ' (' + err.message + ')'); }
    }
  }
}

/* ---------------------------------------------------------------- the whole thing */
function saveSnapshot(){
  /* The town on its own, with the links into the moment cut, so it can be
     carried into a fresh day by itself. */
  const cut = new Set();
  for (const a of [BAYS, CARS, BEINGS, MOVERS]) for (const o of a) cut.add(o);
  return {
    app:'tesco-trueno', saved:new Date().toISOString(),
    seed:RNG.seed, tick:SIM_TICK, clock:simClock,
    town:{ v:TOWN_VERSION, roots:saveEncode(SAVE_TOWN, cut) },
    moment:{ v:SAVE_VERSION, roots:saveEncode(SAVE_TOWN.concat(SAVE_MOMENT)),
             rng:saveRng(), cctvDay:CCTV.day }
  };
}
/* Which layer this save can give: 'moment', 'town' or null. */
function saveKind(snap, townOnly){
  if (!snap || snap.app !== 'tesco-trueno') return null;
  if (!townOnly && snap.moment && snap.moment.v === SAVE_VERSION) return 'moment';
  return snap.town ? 'town' : null;
}
/* The moment goes over a day that has been built; the town alone goes in
   BEFORE the day is built, so the opening car park is seeded from its people.
   Returns 'moment', 'town' or throws. */
function saveRestore(snap, townOnly){
  if (saveKind(snap, townOnly) === 'moment'){
    try {
      saveDecode(snap.moment.roots);
      loadRng(snap.moment.rng);
      CCTV.day = snap.moment.cctvDay || 0;
      saveAfter();
      return 'moment';
    } catch (e){
      /* Half a moment is worse than none: start the page again and take the
         town alone. */
      console.warn('moment did not load:', e);
      SAVE.broken = String(e.message || e);
      throw e;
    }
  }
  let town = snap.town;
  if (!town) throw new Error('no town in the save');
  while (town.v < TOWN_VERSION){
    if (!TOWN_UPGRADE[town.v]) throw new Error('town save v' + town.v + ' has no upgrade');
    town = TOWN_UPGRADE[town.v](town);
  }
  saveDecode(town.roots);
  SAVE_REG = null;                   // built again once the day exists
  /* A fresh day: nobody is anywhere yet. Visits the save left open are closed,
     the people the opening car park seeds are matched to residents as usual. */
  for (const r of TOWN){
    if (r.visit && r.visit.out === null){ r.visit.out = r.visit.in; r.visit.fate = 'new day'; }
    r.visit = null; r.being = null;
  }
  for (const v of VEH) if (v.bay === null && v.fate === null) v.fate = 'new day';
  return 'town';
}
/* What the screen needs to agree with what was loaded. */
function saveAfter(){
  /* The world's boxes may all be somewhere new: nearest-first lists rebuild. */
  if (typeof fineForget === 'function') fineForget(WORLD);
  const b = function(id, on){ const el = document.getElementById(id); if (el) el.classList.toggle('on', !!on); };
  b('bFast', fastDay); b('bAuto', auto);
  acc = 0; last = 0;
}

/* ---------------------------------------------------------------- IndexedDB */
const SAVE = { db:null, every:30, t:0, off:false, broken:null, last:null, busy:false };
function saveDb(){
  return new Promise(function(ok, no){
    if (SAVE.db) return ok(SAVE.db);
    if (!window.indexedDB) return no(new Error('no IndexedDB'));
    const rq = indexedDB.open('tesco-trueno', 1);
    rq.onupgradeneeded = function(){ rq.result.createObjectStore('saves'); };
    rq.onsuccess = function(){ SAVE.db = rq.result; ok(SAVE.db); };
    rq.onerror = function(){ no(rq.error); };
  });
}
function savePut(key, val){
  return saveDb().then(function(db){ return new Promise(function(ok, no){
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put(val, key);
    tx.oncomplete = function(){ ok(); };
    tx.onerror = function(){ no(tx.error); };
  }); });
}
function saveGetDb(key){
  return saveDb().then(function(db){ return new Promise(function(ok, no){
    const rq = db.transaction('saves', 'readonly').objectStore('saves').get(key);
    rq.onsuccess = function(){ ok(rq.result || null); };
    rq.onerror = function(){ no(rq.error); };
  }); });
}
/* Stored as a JSON string: one clone of a string is far cheaper than the
   browser cloning a hundred thousand little objects. */
function saveNow(){
  if (SAVE.off || HAND.grabbed) return Promise.resolve(false);   // not mid-grab: try again shortly
  let txt;
  try { txt = JSON.stringify(saveSnapshot()); }
  catch (e){ console.warn('save failed:', e); SAVE.broken = String(e.message || e); return Promise.resolve(false); }
  SAVE.last = { at:Date.now(), bytes:txt.length };
  return savePut('auto', txt).then(function(){ return true; },
                                   function(e){ console.warn('save failed:', e); return false; });
}
/* Called once per sim step; saves on sim time, so a fast day saves no more
   often per real second than it can afford. */
function saveTick(dt){
  if (SAVE.off) return;
  SAVE.t += dt;
  if (SAVE.t >= SAVE.every){ SAVE.t = 0; saveNow(); }
}

/* ---------------------------------------------------------------- the buttons */
function saveExport(){
  let txt;
  try { txt = JSON.stringify(saveSnapshot()); }
  catch (e){ alert('Could not save: ' + e.message); return; }
  const d = new Date(), p2 = function(n){ return (n < 10 ? '0' : '') + n; };
  const name = 'trueno-town-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
               '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.json';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type:'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
}
function saveImport(file){
  const fr = new FileReader();
  fr.onload = function(){
    let snap;
    try { snap = JSON.parse(fr.result); if (snap.app !== 'tesco-trueno') throw new Error('not a Tesco Trueno save'); }
    catch (e){ alert('That file is not a Tesco Trueno save.'); return; }
    if (!confirm('Replace this car park with the one in ' + file.name + '?')) return;
    /* Through the page's own start-up, so it loads exactly as a reopen would. */
    SAVE.off = true;
    savePut('auto', fr.result).then(function(){ location.reload(); },
                                    function(e){ alert('Could not store it: ' + e.message); SAVE.off = false; });
  };
  fr.readAsText(file);
}
function saveNewDay(){
  if (!confirm('Start a new day? Everyone and their history stays; today is put away.')) return;
  let snap;
  try { snap = saveSnapshot(); } catch (e){ alert('Could not save: ' + e.message); return; }
  snap.moment = null;
  SAVE.off = true;
  savePut('auto', JSON.stringify(snap)).then(function(){ location.reload(); },
                                             function(e){ alert('Could not store it: ' + e.message); SAVE.off = false; });
}
(function(){
  if (self.LAB_WORKER) return;        // a lab worker has no buttons
  const bar = document.getElementById('bPlan');
  if (!bar) return;
  const mk = function(id, label, title){
    const el = document.createElement('button');
    el.id = id; el.textContent = label; el.title = title;
    return el;
  };
  const sp = document.createElement('span');
  sp.className = 'sp'; sp.style.width = '10px';
  const ex = mk('bExport', 'export', 'save the whole car park to a file');
  const im = mk('bImport', 'import', 'open a car park saved with export');
  const nd = mk('bNewDay', 'new day', 'keep the town, start a fresh day');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json'; inp.style.display = 'none';
  bar.after(sp, ex, im, nd, inp);
  ex.onclick = saveExport;
  im.onclick = function(){ inp.value = ''; inp.click(); };
  inp.onchange = function(){ if (inp.files[0]) saveImport(inp.files[0]); };
  nd.onclick = saveNewDay;
})();

/* ---------------------------------------------------------------- start-up
   The page has already built a fresh day (14-ui). If there is a save, it is
   poured over that, and only then does the clock start. */
(function(){
  const replay = new URLSearchParams(location.search).has('seed');
  let started = false;
  const go = function(snap){
    if (started) return;
    started = true;
    const townOnly = !!sessionStorage.getItem('trueno-town-only');
    sessionStorage.removeItem('trueno-town-only');
    const kind = saveKind(snap, townOnly);
    if (kind === 'town'){
      /* If even the town will not load, the page must not keep trying: it
         starts fresh and does not save over what is there. */
      try { SAVE.loaded = saveRestore(snap, true); }
      catch (e){ console.warn('town did not load:', e);
                 sessionStorage.setItem('trueno-no-save', '1'); location.reload(); return; }
    }
    bootDay();
    if (kind === 'moment'){
      try { SAVE.loaded = saveRestore(snap); }
      catch (e){
        /* The moment would not load. A failed load may have half-filled the
           world, so the page starts again and takes the town alone. */
        sessionStorage.setItem('trueno-town-only', '1');
        location.reload();
        return;
      }
    }
    addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') saveNow(); });
    addEventListener('pagehide', function(){ saveNow(); });
    requestAnimationFrame(frame);
  };
  /* The lab (lab.html, step 5). In a worker it boots the day itself; in a
     frame (when workers are not allowed, e.g. a page opened from a file) the
     day is built here and lab-run.js takes it from there. Neither saves. */
  if (self.LAB_WORKER){ SAVE.off = true; return; }
  if (new URLSearchParams(location.search).has('lab')){
    SAVE.off = true;
    bootDay();
    const sc = document.createElement('script');
    sc.src = 'js/lab-run.js';
    document.head.appendChild(sc);
    return;
  }
  if (replay){ SAVE.off = true; go(null); return; }
  if (sessionStorage.getItem('trueno-no-save')){
    sessionStorage.removeItem('trueno-no-save');
    SAVE.off = true; SAVE.broken = 'the saved town would not load';
    go(null); return;
  }
  /* A browser that never answers must not leave a blank page. */
  setTimeout(function(){ if (!started){ SAVE.off = true; go(null); } }, 4000);
  saveGetDb('auto').then(function(txt){
    let snap = null;
    try { snap = txt ? JSON.parse(txt) : null; } catch (e){ console.warn('save unreadable:', e); }
    go(snap);
  }, function(e){ console.warn('no saving here:', e); SAVE.off = true; go(null); });
})();
