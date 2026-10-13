/* Tesco Trueno - net.js
   A very small neural network, for the brains (2026-10-13). Loaded by the
   game (before 16-brains.js) and by lab.html, so training in the lab and
   playing in the game run the identical arithmetic.

   One hidden layer: inputs -> tanh hidden -> one output per option. A
   decision only looks at ITS OWN options (its "slots"); a softmax over those
   gives the chance of each. Every number is a plain array, so a brain saves,
   copies and ships as ordinary JSON.

   Learning is by gradient: the gradient of log(chance of the option taken)
   says which way to move every weight to make that option likelier.
     copying   (lab, first)   push towards what the hand-written granny did.
     REINFORCE (after)        push towards what was taken, scaled by how much
                              better than usual her day went - or away from
                              it, if worse.
   Logits are capped at +/-LOGIT_CAP, so no option is ever certain: with two
   options the least likely still has about 1 chance in 150. A granny who
   always does the same thing is not a granny. */

const LOGIT_CAP = 2.5;

/* Its own little generator: a new brain's starting weights are the same
   every time and touch none of the sim's streams. */
function netRng(seed){
  let s = seed >>> 0;
  return function(){
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function netNew(nIn, nHid, nOut, seed){
  const r = netRng(seed || 1);
  const g = function(n, k){ const a = []; for (let i = 0; i < n; i++) a.push((r() * 2 - 1) * k); return a; };
  return { nIn:nIn, nHid:nHid, nOut:nOut,
           w1:g(nIn * nHid, 1 / Math.sqrt(nIn)), b1:g(nHid, 0),
           w2:g(nHid * nOut, 1 / Math.sqrt(nHid)), b2:g(nOut, 0) };
}
function netCopy(n){ return JSON.parse(JSON.stringify(n)); }
function netZero(n){
  return { w1:n.w1.map(function(){ return 0; }), b1:n.b1.map(function(){ return 0; }),
           w2:n.w2.map(function(){ return 0; }), b2:n.b2.map(function(){ return 0; }) };
}
function netForward(n, x){
  const h = new Array(n.nHid), z = new Array(n.nOut);
  for (let j = 0; j < n.nHid; j++){
    let s = n.b1[j];
    const o = j * n.nIn;
    for (let i = 0; i < n.nIn; i++) s += n.w1[o + i] * x[i];
    h[j] = Math.tanh(s);
  }
  for (let k = 0; k < n.nOut; k++){
    let s = n.b2[k];
    const o = k * n.nHid;
    for (let j = 0; j < n.nHid; j++) s += n.w2[o + j] * h[j];
    z[k] = s;
  }
  return { h:h, z:z };
}
/* Chances over one decision's slots. `bias` (optional) is added first - the
   personal dials. Returns { p, live }: live[i] is false where the cap bit. */
function netChances(z, slots, bias){
  const l = [], live = [];
  for (const s of slots){
    const v = z[s] + (bias ? bias[s] || 0 : 0);
    l.push(Math.max(-LOGIT_CAP, Math.min(LOGIT_CAP, v)));
    live.push(v > -LOGIT_CAP && v < LOGIT_CAP);
  }
  let m = -Infinity;
  for (const v of l) if (v > m) m = v;
  let t = 0;
  const p = l.map(function(v){ const e = Math.exp(v - m); t += e; return e; });
  for (let i = 0; i < p.length; i++) p[i] /= t;
  return { p:p, live:live };
}
/* Add coef x d log p(slots[a]) / d weights into `acc`. Returns the chances. */
function netGrad(n, x, slots, a, coef, acc, bias){
  const f = netForward(n, x);
  const c = netChances(f.z, slots, bias);
  const dz = new Array(n.nOut).fill(0);
  for (let i = 0; i < slots.length; i++)
    if (c.live[i]) dz[slots[i]] = coef * ((i === a ? 1 : 0) - c.p[i]);
  const dh = new Array(n.nHid).fill(0);
  for (let k = 0; k < n.nOut; k++){
    if (dz[k] === 0) continue;
    acc.b2[k] += dz[k];
    const o = k * n.nHid;
    for (let j = 0; j < n.nHid; j++){ acc.w2[o + j] += dz[k] * f.h[j]; dh[j] += dz[k] * n.w2[o + j]; }
  }
  for (let j = 0; j < n.nHid; j++){
    const g = dh[j] * (1 - f.h[j] * f.h[j]);
    if (g === 0) continue;
    acc.b1[j] += g;
    const o = j * n.nIn;
    for (let i = 0; i < n.nIn; i++) acc.w1[o + i] += g * x[i];
  }
  return c.p;
}
/* Adam, the usual way of taking a step along an accumulated gradient (as an
   ASCENT - these gradients point uphill). `st` is kept between steps. */
function netAdam(n, acc, st, lr){
  st.t = (st.t || 0) + 1;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  for (const key of ['w1', 'b1', 'w2', 'b2']){
    const w = n[key], g = acc[key];
    const m = st['m' + key] || (st['m' + key] = w.map(function(){ return 0; }));
    const v = st['v' + key] || (st['v' + key] = w.map(function(){ return 0; }));
    for (let i = 0; i < w.length; i++){
      m[i] = b1 * m[i] + (1 - b1) * g[i];
      v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i];
      const mh = m[i] / (1 - Math.pow(b1, st.t)), vh = v[i] / (1 - Math.pow(b2, st.t));
      w[i] += lr * mh / (Math.sqrt(vh) + eps);
    }
  }
}
/* A plain small step, for learning as the game goes. */
function netStep(n, acc, lr, clip){
  for (const key of ['w1', 'b1', 'w2', 'b2']){
    const w = n[key], g = acc[key];
    for (let i = 0; i < w.length; i++) w[i] += Math.max(-clip, Math.min(clip, lr * g[i]));
  }
}

/* ---------------------------------------------------------------- the granny's wiring
   Her 16 senses and a flag for which of her 7 decisions this is; one output
   per option, the decisions' options side by side. Kept here, not in
   16-brains.js, so the lab feeds her exactly as the game does. */
const GRANNY_DECS = ['lostCar', 'huntNext', 'chat', 'rain', 'linger', 'afterShop', 'gulls'];
const GRANNY_SLOTS = { lostCar:[0, 1, 2], huntNext:[3, 4, 5], chat:[6, 7], rain:[8, 9],
                       linger:[10, 11], afterShop:[12, 13, 14], gulls:[15, 16] };
const GRANNY_SHAPE = { nIn:23, nHid:12, nOut:17 };     // 16 senses + 7 decision flags
function grannyInput(s, name){
  const x = s.slice();
  for (const d of GRANNY_DECS) x.push(d === name ? 1 : 0);
  return x;
}

/* ---------------------------------------------------------------- the gull's wiring
   12 senses and which of its 2 decisions; options: forage / join the others /
   loaf, and fly / hold its nerve. Smaller than a granny: a simpler life. */
const GULL_DECS = ['gullNext', 'gullThreat'];
const GULL_SLOTS = { gullNext:[0, 1, 2], gullThreat:[3, 4] };
const GULL_SHAPE = { nIn:14, nHid:8, nOut:5 };
function gullInput(s, name){
  const x = s.slice();
  for (const d of GULL_DECS) x.push(d === name ? 1 : 0);
  return x;
}

/* ---------------------------------------------------------------- every kind
   Which wiring a decision belongs to, so the game, the lab and the trainer can
   handle any kind of being the same way. `shipped` is the global a trained
   brain file sets (brains/<kind>.brain.js). */
const WIRING = {
  granny:{ decs:GRANNY_DECS, slots:GRANNY_SLOTS, shape:GRANNY_SHAPE, input:grannyInput, shipped:'GRANNY_BRAIN' },
  gull:  { decs:GULL_DECS,   slots:GULL_SLOTS,   shape:GULL_SHAPE,   input:gullInput,   shipped:'GULL_BRAIN' }
};
const DEC_KIND = {};
for (const k in WIRING) for (const d of WIRING[k].decs) DEC_KIND[d] = k;
function brainInput(s, d){ return WIRING[DEC_KIND[d]].input(s, d); }
function brainSlots(d){ return WIRING[DEC_KIND[d]].slots[d]; }
