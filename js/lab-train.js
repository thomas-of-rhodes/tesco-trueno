/* Tesco Trueno - lab-train.js
   The granny brain's training maths, shared by lab.html (in the browser) and
   tools/train.js (in the terminal, 2026-10-13), so both run the identical
   algorithm. Needs net.js. */

/* The hand-written granny, asked for by name: since v1.0 the game's default is
   the brain, so an arm that says nothing would be the brain. */
const HAND_CODE = "BRAINS.granny.policy = 'hand'; BRAINS.granny.tap = [];";
function netCode(hive){
  return "BRAINS.granny.policy = 'net'; BRAINS.granny.kind = " + JSON.stringify(hive) +
         "; BRAINS.granny.learnRate = 0; BRAINS.granny.dialRate = 0; BRAINS.granny.tap = [];";
}
function mean(a){ return a.length ? a.reduce(function(s, x){ return s + x; }, 0) / a.length : null; }

/* Round 0: copy the hand-written granny from her own decisions. */
function copyHand(samples){
  const hive = netNew(GRANNY_SHAPE.nIn, GRANNY_SHAPE.nHid, GRANNY_SHAPE.nOut, 7);
  const st = {};
  for (let ep = 0; ep < 300; ep++){
    const acc = netZero(hive);
    for (const e of samples) netGrad(hive, grannyInput(e.s, e.d), GRANNY_SLOTS[e.d], e.a, 1 / samples.length, acc);
    netAdam(hive, acc, st, 0.02);
  }
  let hit = 0;
  for (const e of samples){
    const c = netChances(netForward(hive, grannyInput(e.s, e.d)).z, GRANNY_SLOTS[e.d]);
    let best = 0; for (let i = 1; i < c.p.length; i++) if (c.p[i] > c.p[best]) best = i;
    if (best === e.a) hit++;
  }
  return { hive:hive, acc:samples.length ? hit / samples.length : null };
}
/* After a round: learn from its choices, one choice at a time. Each is
   pushed by what followed IT (its two minutes of her feelings) against what
   usually follows that kind of choice this round, in standard deviations.

   2026-10-13: the first version took 4 small steps a round - 28 in seven
   rounds - and the brain hardly moved off its copy of the hand-written granny
   while thousands of choices went to waste. Now LEARN_PASSES passes over the
   round, in minibatches, with the usual safety rail for this (the clipped
   objective of PPO): once a choice's chance has moved more than LEARN_CLIP
   (20%) from what it was when she made it, that choice stops pushing. She
   learns from the round as hard as it will bear, but never lurches. */
const LEARN_PASSES = 8, LEARN_BATCHES = 4, LEARN_CLIP = 0.2;
function learnFrom(hive, st, samples, lr){
  samples = samples.filter(function(e){ return e.credit !== undefined && e.credit !== null; });
  if (!samples.length) return { steps:0, clipped:0 };
  const by = {};
  for (const e of samples) (by[e.d] = by[e.d] || []).push(e.credit);
  const norm = {};
  for (const d in by){
    const m = mean(by[d]);
    norm[d] = { m:m, sd:Math.sqrt(mean(by[d].map(function(x){ return (x - m) * (x - m); }))) || 1 };
  }
  /* How likely each choice was under the brain that made it (this round's). */
  const old = samples.map(function(e){
    return netChances(netForward(hive, grannyInput(e.s, e.d)).z, GRANNY_SLOTS[e.d]).p[e.a];
  });
  const order = samples.map(function(e, i){ return i; });
  const r = netRng(samples.length * 7919 + (st.t || 0));
  let steps = 0, clipped = 0, seen = 0;
  for (let pass = 0; pass < LEARN_PASSES; pass++){
    for (let i = order.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const per = Math.ceil(order.length / LEARN_BATCHES);
    for (let c = 0; c < LEARN_BATCHES; c++){
      const part = order.slice(c * per, (c + 1) * per);
      if (!part.length) continue;
      const acc = netZero(hive);
      for (const k of part){
        const e = samples[k];
        const adv = (e.credit - norm[e.d].m) / norm[e.d].sd;
        const x = grannyInput(e.s, e.d), sl = GRANNY_SLOTS[e.d];
        const ratio = netChances(netForward(hive, x).z, sl).p[e.a] / Math.max(1e-9, old[k]);
        seen++;
        if ((adv > 0 && ratio > 1 + LEARN_CLIP) || (adv < 0 && ratio < 1 - LEARN_CLIP)){ clipped++; continue; }
        netGrad(hive, x, sl, e.a, adv * ratio / part.length, acc);
      }
      netAdam(hive, acc, st, lr);
      steps++;
    }
  }
  return { steps:steps, clipped:seen ? clipped / seen : 0 };
}

/* One round's results: specs[i] is { arm:'net'|'hand', seed }, in pairs (the
   brain then the hand-written granny on the same day); res[i] what came back.
   Returns the table row and the brain's choices to learn from. */
function trainStats(xs){
  const n = xs.length;
  if (!n) return null;
  const m = mean(xs);
  const sd = n > 1 ? Math.sqrt(xs.reduce(function(a, b){ return a + (b - m) * (b - m); }, 0) / (n - 1)) : 0;
  return { n:n, m:m, se:n > 1 ? sd / Math.sqrt(n) : null };
}
function roundRow(k, specs, res){
  const errs = res.filter(function(r){ return !r || r.error; });
  const net = [], hand = [], diffs = [], samples = [];
  const pick = function(arm, key){
    return res.map(function(r, i){ return specs[i].arm === arm && r && r.metrics ? r.metrics[key] : null; })
              .filter(function(x){ return x !== null && x !== undefined; });
  };
  for (let i = 0; i < specs.length; i += 2){
    const a = res[i], b = res[i + 1];
    if (a && a.metrics && a.metrics.grannyDay !== null) net.push(a.metrics.grannyDay);
    if (b && b.metrics && b.metrics.grannyDay !== null) hand.push(b.metrics.grannyDay);
    if (a && a.metrics && b && b.metrics && a.metrics.grannyDay !== null && b.metrics.grannyDay !== null)
      diffs.push(a.metrics.grannyDay - b.metrics.grannyDay);
    if (a && a.tap) for (const e of a.tap) samples.push(e);
  }
  const d = trainStats(diffs);
  const row = { round:k, net:mean(net), hand:mean(hand), diff:d ? d.m : null, se:d && d.se !== null ? 2 * d.se : null,
                chats:mean(pick('net', 'grannyChats')), chatsH:mean(pick('hand', 'grannyChats')),
                company:mean(pick('net', 'grannyCompany')), companyH:mean(pick('hand', 'grannyCompany')),
                lost:mean(pick('net', 'grannyLost')), lostH:mean(pick('hand', 'grannyLost')),
                wet:mean(pick('net', 'grannyWet')), wetH:mean(pick('hand', 'grannyWet')),
                gaveUp:mean(pick('net', 'gaveUp')), shelter:mean(pick('net', 'sheltered')), shelterH:mean(pick('hand', 'sheltered')),
                linger:mean(pick('net', 'lingered')), lingerH:mean(pick('hand', 'lingered')),
                wander:mean(pick('net', 'wandered')), wanderH:mean(pick('hand', 'wandered')),
                backIn:mean(pick('net', 'backIn')), gulls:mean(pick('net', 'fedGulls')), gullsH:mean(pick('hand', 'fedGulls')),
                mobbed:mean(pick('net', 'mobbed')), mobbedH:mean(pick('hand', 'mobbed')),
                n:samples.length, errs:errs.length, err:errs.length ? String((errs[0] || {}).error || 'no result').slice(0, 300) : null };
  return { row:row, samples:samples };
}
