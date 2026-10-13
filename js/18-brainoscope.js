/* Tesco Trueno - 18-brainoscope.js
   The brainoscope (Thomas, 2026-10-13): hover over a granny, a gull or a fox
   and see its brain at work, beside its thought bubble.

     left    its senses, as they are right now - brighter is stronger
     middle  its hidden neurons: warm firing one way, cool the other, and the
             strongest connections drawn in
     right   the options of one of its decisions, as chances, the likeliest lit
     below   its own leanings - the personal dials it has learned

   A being makes several kinds of decision; B steps through them. The scope
   only READS: senses are pure readings, the network is run on a copy of the
   numbers, nothing is chosen and nothing rolls a die - so watching changes
   nothing about the day. Off until the 'brains' button is pressed, like the
   other overlays. Purely drawing: the lab and the trainer never call it. */

const SCOPE = { on:false, pick:0, last:null };

/* Which decision to show for a being: the one it is most likely facing, then
   B steps round the rest. */
function scopeDecisions(b){
  const w = WIRING[b.kind];
  if (!w) return null;
  const all = w.decs.slice();
  let first = all[0];
  if (b.kind === 'granny') first = b.chatT > 0 ? 'linger' : (rainHere(b.x, b.y) > 0.25 ? 'rain' : 'chat');
  if (b.kind === 'gull') first = carThreat(b) > 0.25 ? 'gullThreat' : 'gullNext';
  if (b.kind === 'fox') first = b.away ? 'foxGo' : (b.fmode === 'freeze' || b.fmode === 'bolt' ? 'foxThreat' : 'foxNext');
  const i = all.indexOf(first);
  return all.slice(i).concat(all.slice(0, i));
}

function drawBrainoscope(){
  if (!SCOPE.on || HOVER.mx < 0 || typeof castAt !== 'function') return;
  const b = castAt(HOVER.mx, HOVER.my);
  if (!b || !b.kind || !WIRING[b.kind] || !DECISIONS) return;
  const kb = brainOf(b.kind);
  const net = kindHive(kb, b.kind);
  if (!net) return;
  if (SCOPE.last !== b){ SCOPE.last = b; SCOPE.pick = 0; }
  const decs = scopeDecisions(b);
  const d = decs[SCOPE.pick % decs.length];
  const dp = DECISIONS[d];
  let s;
  try { s = dp.senses(b); } catch (e){ return; }
  const x = brainInput(s, d);
  const f = netForward(net, x);
  const pb = b.res ? b.res.brain : b.brain;
  const slots = brainSlots(d);
  const c = netChances(f.z, slots, pb && pb.dials);
  const names = (b.kind === 'granny' ? GRANNY_SENSES : b.kind === 'gull' ? GULL_SENSES : FOX_SENSES);

  /* Layout. Beside the thought bubble, on whichever side has room. */
  const nIn = s.length, nH = net.nHid, nO = slots.length;
  const row = 11, top = 34, lh = Math.max(nIn, nH, nO) * row;
  const W = 380, H = top + lh + 46;
  const q = P(b.x, b.y), ax = SX(q), ay = SY(q, (b.z || 0) + (b.gz || 0) + 1.75);
  const vw = cv.width / dpr(), vh = cv.height / dpr();
  /* A narrow window gets a smaller scope, not half of one. */
  const sc = Math.min(1, (vw - 16) / W, (vh - 56) / H);
  let ox = ax + 24, oy = ay - 10;
  if (ox + W * sc > vw - 8) ox = ax - 24 - W * sc;
  if (ox < 8) ox = Math.max(8, vw - 8 - W * sc);
  if (oy + H * sc > vh - 8) oy = vh - 8 - H * sc;
  if (oy < 40) oy = 40;
  g2.save();
  g2.translate(ox, oy); g2.scale(sc, sc);
  const px = 0, py = 0;
  const colIn = px + 128, colH = px + 228, colO = px + 268;

  g2.fillStyle = 'rgba(9,11,13,0.94)';
  g2.strokeStyle = '#3a444c'; g2.lineWidth = 1;
  g2.fillRect(px, py, W, H); g2.strokeRect(px + 0.5, py + 0.5, W - 1, H - 1);
  g2.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  g2.textBaseline = 'middle';
  g2.fillStyle = '#8fc3d8';
  const who = b.name || b.kind;
  g2.fillText(who + ' - ' + (net.nHid + net.nOut) + ' neurons' + (kb.policy === 'net' ? '' : ' (not in charge: hand-written)'), px + 8, py + 10);
  g2.fillStyle = '#6c7780';
  g2.fillText('deciding: ' + d + (decs.length > 1 ? '   [B: next of ' + decs.length + ']' : ''), px + 8, py + 23);

  const yIn = function(i){ return py + top + (lh - nIn * row) / 2 + i * row + row / 2; };
  const yH = function(j){ return py + top + (lh - nH * row) / 2 + j * row + row / 2; };
  const yO = function(k){ return py + top + (lh - nO * row * 1.6) / 2 + k * row * 1.6 + row * 0.8; };
  const warm = function(v, a){ return v >= 0 ? 'rgba(255,170,90,' + a + ')' : 'rgba(110,170,255,' + a + ')'; };

  /* The strongest wires: input -> hidden, hidden -> these options. */
  g2.lineWidth = 1;
  for (let j = 0; j < nH; j++){
    for (let i = 0; i < x.length && i < nIn; i++){
      const wv = net.w1[j * net.nIn + i] * x[i];
      if (Math.abs(wv) < 0.35) continue;
      g2.strokeStyle = warm(wv, Math.min(0.5, Math.abs(wv) * 0.4).toFixed(2));
      g2.beginPath(); g2.moveTo(colIn + 5, yIn(i)); g2.lineTo(colH - 5, yH(j)); g2.stroke();
    }
    for (let k = 0; k < nO; k++){
      const wv = net.w2[slots[k] * net.nHid + j] * f.h[j];
      if (Math.abs(wv) < 0.3) continue;
      g2.strokeStyle = warm(wv, Math.min(0.6, Math.abs(wv) * 0.5).toFixed(2));
      g2.beginPath(); g2.moveTo(colH + 5, yH(j)); g2.lineTo(colO - 2, yO(k)); g2.stroke();
    }
  }
  /* Senses. */
  for (let i = 0; i < nIn; i++){
    const v = Math.max(0, Math.min(1, s[i]));
    g2.fillStyle = 'rgba(207,214,219,' + (0.35 + 0.65 * v).toFixed(2) + ')';
    g2.textAlign = 'right';
    g2.fillText(names[i] || ('sense ' + i), colIn - 8, yIn(i));
    g2.beginPath(); g2.arc(colIn, yIn(i), 4, 0, 6.2832);
    g2.fillStyle = 'rgba(143,195,216,' + (0.15 + 0.85 * v).toFixed(2) + ')'; g2.fill();
  }
  g2.textAlign = 'left';
  /* Hidden neurons. */
  for (let j = 0; j < nH; j++){
    g2.beginPath(); g2.arc(colH, yH(j), 4.5, 0, 6.2832);
    g2.fillStyle = warm(f.h[j], (0.25 + 0.75 * Math.abs(f.h[j])).toFixed(2)); g2.fill();
  }
  /* The options, as chances. */
  let best = 0;
  for (let k = 1; k < nO; k++) if (c.p[k] > c.p[best]) best = k;
  for (let k = 0; k < nO; k++){
    const y = yO(k), bw = 70 * c.p[k];
    g2.fillStyle = k === best ? '#8fbf7a' : 'rgba(207,214,219,0.35)';
    g2.fillRect(colO, y - 4, bw, 8);
    g2.fillStyle = k === best ? '#cfd6db' : '#7e8890';
    g2.fillText(dp.actions[k] + ' ' + Math.round(100 * c.p[k]) + '%', colO + 74, y);
  }
  /* Its own leanings, for these options. */
  const dl = pb && pb.dials;
  g2.fillStyle = '#6c7780';
  g2.fillText('own leanings:', px + 8, py + H - 14);
  let lx = px + 100;
  for (let k = 0; k < nO; k++){
    const v = dl ? dl[slots[k]] || 0 : 0;
    const t = dp.actions[k] + (v >= 0 ? ' +' : ' ') + v.toFixed(2);
    g2.fillStyle = Math.abs(v) > 0.05 ? warm(v, 0.9) : '#5c666e';
    g2.fillText(t, lx, py + H - 14);
    lx += g2.measureText(t).width + 10;
    if (lx > px + W - 40) break;
  }
  g2.restore();
}

/* The button, beside the overlays; B steps through a being's decisions. */
(function(){
  if (typeof document === 'undefined' || self.LAB_WORKER) return;
  const after = document.getElementById('bPlan');
  if (!after || !after.after) return;
  const bt = document.createElement('button');
  bt.id = 'bScope'; bt.textContent = 'brains'; bt.title = 'hover over a granny, gull or fox to see its brain (B: next decision)';
  after.after(bt);
  bt.onclick = function(){ SCOPE.on = !SCOPE.on; bt.classList.toggle('on', SCOPE.on); };
  addEventListener('keydown', function(e){ if (SCOPE.on && (e.key === 'b' || e.key === 'B')) SCOPE.pick++; });
  /* Drawn after everything else each frame, on top of the thought bubble. */
  if (typeof frame === 'function'){
    const orig = frame;
    frame = function(t){ orig(t); drawBrainoscope(); };
  }
})();
