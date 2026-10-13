/* Tesco Trueno - tools/sim-thread.js
   One day of the sim in a Node worker thread, for tools/train.js (2026-10-13).
   The laptop-only twin of js/lab-worker.js: the game's own files, in the
   game's own order (read out of trueno.html), with a dummy screen that counts
   any touch while the sim steps. No browser, so nothing can throttle it.

   in  (workerData): { root, seed, ticks, code, every, speedEvery }
   out (messages):   { type:'speed', ... } (optional)  { type:'done', result } | { type:'error', error } */
'use strict';
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const D = workerData;
const g = globalThis;
g.window = g; g.self = g;
g.LAB_WORKER = true;
g.LAB_SCREEN = { on:false, touches:0, what:[] };
g.location = { search:'?seed=' + D.seed, href:'file:///trueno.html?seed=' + D.seed, protocol:'file:' };
(function(){
  const noop = function(){};
  let dummy;
  dummy = new Proxy(noop, {
    get: function(t, k){
      if (k === Symbol.toPrimitive) return function(h){ return h === 'string' ? '' : 0; };
      if (k === Symbol.iterator) return function(){ return { next:function(){ return { done:true }; } }; };
      if (k === 'then') return undefined;
      if (LAB_SCREEN.on){ LAB_SCREEN.touches++; if (LAB_SCREEN.what.length < 8 && LAB_SCREEN.what.indexOf(String(k)) < 0) LAB_SCREEN.what.push(String(k)); }
      if (k === 'length') return 0;
      return dummy;
    },
    set: function(){ if (LAB_SCREEN.on) LAB_SCREEN.touches++; return true; },
    apply: function(){ if (LAB_SCREEN.on) LAB_SCREEN.touches++; return dummy; },
    construct: function(){ if (LAB_SCREEN.on) LAB_SCREEN.touches++; return dummy; },
    has: function(){ return true; }
  });
  g.document = dummy;
  g.Path2D = function(){ return dummy; };
  g.requestAnimationFrame = function(){ return 0; };
  g.cancelAnimationFrame = noop;
  g.addEventListener = noop; g.removeEventListener = noop;
  g.innerWidth = 1280; g.innerHeight = 800; g.devicePixelRatio = 1;
  g.alert = noop; g.confirm = function(){ return false; };
  g.sessionStorage = { getItem:function(){ return null; }, setItem:noop, removeItem:noop };
})();

function load(rel){
  const file = path.join(D.root, rel);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename:file });
}
try {
  const html = fs.readFileSync(path.join(D.root, 'trueno.html'), 'utf8');
  const re = /<script src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) load(m[1]);
  load('js/lab-run.js');
  vm.runInThisContext('bootDay();');
} catch (e){
  parentPort.postMessage({ type:'error', error:'loading: ' + (e.stack || e) });
  return;
}

/* Where the time goes: run to D.from, then time the named functions over
   D.ticks more steps. Self time is not separated - a function's share
   includes what it calls. */
if (D.profile){
  const step = vm.runInThisContext('simStep');
  while (vm.runInThisContext('SIM_TICK') < D.from) step();
  const T = {}, N = {};
  for (const n of D.profile){
    const f = g[n];
    if (typeof f !== 'function') continue;
    T[n] = 0; N[n] = 0;
    g[n] = function(){ const t = process.hrtime.bigint(); try { return f.apply(this, arguments); }
                       finally { T[n] += Number(process.hrtime.bigint() - t); N[n]++; } };
  }
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < D.ticks; i++) step();
  const all = Number(process.hrtime.bigint() - t0);
  parentPort.postMessage({ type:'profile', all:all / 1e6, x:(D.ticks / 120) / (all / 1e9), rows:Object.keys(T)
    .sort(function(a, b){ return T[b] - T[a]; })
    .map(function(n){ return [n, +(100 * T[n] / all).toFixed(1), N[n]]; }) });
  return;
}

/* Speed through the day: how fast each stretch of sim time ran. */
if (D.speedEvery){
  const out = [];
  const step = vm.runInThisContext('simStep');
  const cnt = vm.runInThisContext('(function(){ return [BEINGS.length, CARS.length, SIM_TICK]; })');
  while (cnt()[2] < D.ticks){
    const t = process.hrtime.bigint();
    for (let i = 0; i < D.speedEvery; i++) step();
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const c = cnt();
    out.push({ simSecs:Math.round(c[2] / 120), x:+((D.speedEvery / 120) / (ms / 1000)).toFixed(1), beings:c[0], cars:c[1] });
  }
  parentPort.postMessage({ type:'speed', rows:out });
  return;
}

vm.runInThisContext('labRun')(D, function(m){
  /* D.report: an expression read out at the end, for checks (e.g. SDF_MISMATCH). */
  if (m.type === 'done' && D.report) m.result.report = vm.runInThisContext(D.report);
  if (m.type === 'done' || m.type === 'error') parentPort.postMessage(m);
});
