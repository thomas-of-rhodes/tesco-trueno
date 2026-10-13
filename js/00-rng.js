/* Tesco Trueno - 00-rng.js
   Seeded randomness (pre-neural step 3, 2026-10-12).

   Every dice roll the SIMULATION makes comes from here, not Math.random, so a
   run is fully determined by one number - the seed. Same seed, same day: the
   same arrivals, the same squall at two o'clock, the same granny forgetting
   her car. That is what lets two brains be compared on the same day, and what
   stops A/B measurements being mostly luck.

   One STREAM per subsystem, each its own generator seeded from the master
   seed and the stream's name. With a single shared sequence, adding one roll
   to the weather would shift every roll after it and the traffic would come
   out different with no change to the traffic; separate streams keep a change
   in one part from disturbing the luck of the others.

   Choices ABOUT a person or a car that can be asked for at any moment (does
   she own an umbrella?) must not come from a stream at all: if the drawing
   code happens to ask first, the answer would depend on the frame rate. Those
   use pick01(id, salt) - a pure function of who it is.

   Drawing does not need any of this: visual-only jitter is not part of the
   simulation and does not have to be repeatable.

   The seed: ?seed=1234 in the address replays that day. Otherwise each load
   gets a fresh one (you learn the place, never the day), shown in the census
   panel so a good day can be replayed. Limits: god-mode interference cannot be
   replayed, and a different browser engine may round some maths differently
   and drift apart over a long run - the same browser is exact. */

/* sfc32: small, fast, good quality, and its whole state is four numbers, so
   it can be saved and restored (the test rigs need that). */
function Sfc32(a, b, c, d){ this.s = [a | 0, b | 0, c | 0, d | 0]; }
Sfc32.prototype.next = function(){
  const s = this.s;
  let a = s[0], b = s[1], c = s[2], d = s[3];
  const t = (a + b | 0) + d | 0;
  d = d + 1 | 0;
  a = b ^ (b >>> 9);
  b = c + (c << 3) | 0;
  c = (c << 21) | (c >>> 11);
  c = c + t | 0;
  s[0] = a; s[1] = b; s[2] = c; s[3] = d;
  return (t >>> 0) / 4294967296;
};
function hashStr(str){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/* A deterministic number in [0, 1) from an integer id and a salt. */
function pick01(id, salt){
  let h = (Math.imul((id | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* The streams, by subsystem. Adding a new one is safe; renaming one changes
   its sequence. */
const STREAMS = ['traffic', 'weather', 'world', 'movers', 'scenery', 'beings', 'god', 'brains'];
const RNG = { seed:0, gens:{} };
const RND = {};
for (const name of STREAMS) RND[name] = function(){ return RNG.gens[name].next(); };
function seedAll(seed){
  RNG.seed = seed >>> 0;
  for (const name of STREAMS){
    const h = hashStr(name);
    const g = new Sfc32(RNG.seed, h, RNG.seed ^ 0x9e3779b9, h ^ 0x85ebca6b);
    for (let i = 0; i < 15; i++) g.next();          // let the seed mix in
    RNG.gens[name] = g;
  }
}
function saveRng(){
  const out = { seed:RNG.seed, s:{} };
  for (const name of STREAMS) out.s[name] = RNG.gens[name].s.slice();
  return out;
}
function loadRng(st){
  RNG.seed = st.seed;
  /* A save from before a stream existed leaves that stream where the seed put it. */
  for (const name of STREAMS) if (st.s[name]) RNG.gens[name].s = st.s[name].slice();
}
/* The test rigs run from fixed seeds of their own, one per run in order, so
   the suite is the same every time and still sees different days. */
const RNG_TEST = { base:20261012, n:0 };

(function(){
  const q = new URLSearchParams(location.search).get('seed');
  const seed = q !== null && isFinite(+q) ? (+q >>> 0)
             : (Math.random() * 4294967296) >>> 0;   // the one unseeded roll: which day
  seedAll(seed);
})();
