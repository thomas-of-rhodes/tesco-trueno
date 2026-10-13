/* Tesco Trueno - lab-worker.js
   A background worker that runs one day for lab.html (pre-neural step 5,
   2026-10-13). Started as lab-worker.js?seed=N so 00-rng.js seeds from it.

   A worker has no page: no document, no canvas. The game's files still build
   their buttons and canvases as they load, so the worker gives them a DUMMY
   screen that accepts anything and does nothing. While the sim is stepping,
   every touch of that dummy is counted (LAB_SCREEN.touches): the simulation
   must never depend on the screen - least of all once brains are learning in
   it - and the lab shows the count, which should always be 0. */

self.window = self;
self.LAB_WORKER = true;
self.LAB_SCREEN = { on:false, touches:0, what:[] };

(function(){
  const noop = function(){};
  let dummy;
  const handler = {
    get: function(t, k){
      if (k === Symbol.toPrimitive) return function(hint){ return hint === 'string' ? '' : 0; };
      if (k === Symbol.iterator) return function(){ return { next:function(){ return { done:true }; } }; };
      if (k === 'then') return undefined;              // not a promise
      if (LAB_SCREEN.on){
        LAB_SCREEN.touches++;
        if (LAB_SCREEN.what.length < 8 && LAB_SCREEN.what.indexOf(String(k)) < 0) LAB_SCREEN.what.push(String(k));
      }
      if (k === 'length') return 0;
      return dummy;
    },
    set: function(){ if (LAB_SCREEN.on) LAB_SCREEN.touches++; return true; },
    apply: function(){ if (LAB_SCREEN.on) LAB_SCREEN.touches++; return dummy; },
    construct: function(){ if (LAB_SCREEN.on) LAB_SCREEN.touches++; return dummy; },
    has: function(){ return true; }
  };
  dummy = new Proxy(noop, handler);
  self.document = dummy;
  self.Path2D = function(){ return dummy; };
  self.requestAnimationFrame = function(){ return 0; };   // the lab steps the sim itself
  self.cancelAnimationFrame = noop;
  self.innerWidth = 1280; self.innerHeight = 800; self.devicePixelRatio = 1;
  self.alert = noop; self.confirm = function(){ return false; };
})();

onmessage = function(e){
  const d = e.data;
  if (!d || d.type !== 'run') return;
  try {
    /* The game's own files, in the game's own order (lab.html reads them out of
       trueno.html), then the runner. */
    importScripts.apply(self, d.scripts.concat([d.runner]));
    bootDay();
  } catch (err){
    postMessage({ type:'error', error:'loading: ' + (err.stack || err) });
    return;
  }
  labRun(d, function(m){ postMessage(m); });
};
postMessage({ type:'ready' });
