/* Tesco Trueno - 18-brainoscope.js
   The brainoscope (Thomas, 2026-10-13): hover over a granny, a gull or a fox
   and see its brain at work, beside its thought bubble.

     left    its senses, as they are right now - brighter is stronger
     middle  its hidden neurons: warm firing one way, cool the other, and the
             strongest connections drawn in
     right   the options of one of its decisions, as chances, the likeliest lit
     below   its own leanings - the personal dials it has learned

   A being makes several kinds of decision; B steps through them. Docked at
   the bottom left; click a creature to follow it (a halo marks it), click the
   ground or press Esc to let go. The scope
   only READS: senses are pure readings, the network is run on a copy of the
   numbers, nothing is chosen and nothing rolls a die - so watching changes
   nothing about the day. Off until the 'brains' button is pressed, like the
   other overlays. Purely drawing: the lab and the trainer never call it. */

const SCOPE = { on:false, pick:0, last:null, follow:null, geo:null };

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

/* Thomas, 2026-10-13: docked at the bottom left, and latched onto whoever you
   click - with a halo at their feet, so you can see who you are following.
   Click empty ground (or Esc) to let go; hovering works while nobody is held. */
function scopeDock(W, H, sc){
  const vh = cv.height / dpr();
  let below = 8;
  const cen = document.getElementById('cen');
  if (cen && cen.offsetParent !== null && getComputedStyle(cen).display !== 'none') below += cen.offsetHeight + 8;
  return [8, Math.max(40, vh - below - H * sc)];
}
function scopeHalo(b){
  const q = P(b.x, b.y), sx = SX(q), sy = SY(q, b.z > 0.3 ? b.z : 0);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
  const r = Math.max(9, 1.2 * K);
  g2.save();
  g2.lineWidth = 2;
  g2.strokeStyle = 'rgba(143,195,216,' + (0.55 + 0.4 * pulse).toFixed(2) + ')';
  g2.beginPath(); g2.ellipse(sx, sy, r * (1 + 0.12 * pulse), r * 0.5 * (1 + 0.12 * pulse), 0, 0, 6.2832); g2.stroke();
  g2.lineWidth = 6;
  g2.strokeStyle = 'rgba(143,195,216,' + (0.12 + 0.12 * pulse).toFixed(2) + ')';
  g2.beginPath(); g2.ellipse(sx, sy, r * 1.25, r * 0.62, 0, 0, 6.2832); g2.stroke();
  g2.restore();
}
function scopeWhere(b){
  if (b.kind === 'fox' && b.away) return b.where === 'tip' ? 'off at the tip' : 'in the den by the railway';
  if (b.inStore) return 'in the shop';
  return 'gone home';
}
/* `place` (the CCTV's brain quadrant): a function (W, H) -> [x, y, scale]
   that puts the panel somewhere other than the dock, for the followed being. */
function drawBrainoscope(place){
  if (!SCOPE.on || typeof castAt !== 'function' || !DECISIONS) return;
  if (!place && VIEW === 'cctv') return;          // the CCTV draws its own (drawScopeCctv)
  /* Whoever is being followed - or, failing that, whoever is under the mouse. */
  let b = SCOPE.follow;
  if (b && BEINGS.indexOf(b) < 0){ b = SCOPE.follow = null; }      // gone for good
  if (place && !b) return;
  if (b && beingAbsent(b)){
    const W0 = 380, H0 = 34;
    const pl = place ? place(W0, H0) : null;
    const sc0 = pl ? pl[2] : Math.min(1, (cv.width / dpr() - 16) / W0);
    const at = pl ? [pl[0], pl[1]] : scopeDock(W0, H0, sc0);
    g2.save(); g2.translate(at[0], at[1]); g2.scale(sc0, sc0);
    g2.fillStyle = 'rgba(9,11,13,0.94)'; g2.strokeStyle = '#3a444c'; g2.lineWidth = 1;
    g2.fillRect(0, 0, W0, H0); g2.strokeRect(0.5, 0.5, W0 - 1, H0 - 1);
    g2.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'; g2.textBaseline = 'middle';
    g2.fillStyle = '#8fc3d8'; g2.fillText((b.name || b.kind) + ' - out of sight, ' + scopeWhere(b), 8, 11);
    g2.fillStyle = '#6c7780'; g2.fillText('still following  [click the ground or Esc to let go]', 8, 24);
    g2.restore();
    return;
  }
  /* The mouse over the panel itself keeps whoever it is showing. */
  const g0 = SCOPE.geo;
  const onPanel = g0 && HOVER.mx >= g0.x && HOVER.mx <= g0.x + g0.w && HOVER.my >= g0.y && HOVER.my <= g0.y + g0.h;
  if (!b){
    if (HOVER.mx < 0) return;
    b = onPanel && SCOPE.last && BEINGS.indexOf(SCOPE.last) >= 0 && !beingAbsent(SCOPE.last) ? SCOPE.last : castAt(HOVER.mx, HOVER.my);
  }
  if (!b || !b.kind || !WIRING[b.kind]) return;
  if (b === SCOPE.follow && !place) scopeHalo(b);
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

  /* Layout: docked at the bottom left. */
  const nIn = s.length, nH = net.nHid, nO = slots.length;
  const row = 11, top = 46, lh = Math.max(nIn, nH, nO) * row;
  const W = 380, H = top + lh + 46;
  const vw = cv.width / dpr(), vh = cv.height / dpr();
  /* A narrow window gets a smaller scope, not half of one. */
  let sc, at;
  if (place){ const pl = place(W, H); at = [pl[0], pl[1]]; sc = pl[2]; }
  else { sc = Math.min(1, (vw - 16) / W, (vh - 56) / H); at = scopeDock(W, H, sc); }
  SCOPE.geo = { x:at[0], y:at[1], w:W * sc, h:H * sc };
  /* Where the mouse is, in the panel's own coordinates (for the weights). */
  const lmx = onPanel ? (HOVER.mx - at[0]) / sc : -1e9, lmy = onPanel ? (HOVER.my - at[1]) / sc : -1e9;
  g2.save();
  g2.translate(at[0], at[1]); g2.scale(sc, sc);
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
  g2.fillText('deciding: ' + d + (decs.length > 1 ? '   [B: next of ' + decs.length + ']' : '') +
              (b === SCOPE.follow ? '   following' : '   [click to follow]'), px + 8, py + 23);
  let th = '';
  try { th = thoughtOf(b) || ''; } catch (e){}
  if (th){ g2.fillStyle = '#cfd6db'; g2.fillText('"' + th + '"', px + 8, py + 36); }

  const yIn = function(i){ return py + top + (lh - nIn * row) / 2 + i * row + row / 2; };
  const yH = function(j){ return py + top + (lh - nH * row) / 2 + j * row + row / 2; };
  const yO = function(k){ return py + top + (lh - nO * row * 1.6) / 2 + k * row * 1.6 + row * 0.8; };
  const warm = function(v, a){ return v >= 0 ? 'rgba(255,170,90,' + a + ')' : 'rgba(110,170,255,' + a + ')'; };

  /* The wires. Every branch has a weight - a multiplier: the signal coming
     down it is multiplied by it, and the neuron adds them all up (plus a bias
     of its own) and squashes the total. The weights are what was learned.
     Thicker = a bigger multiplier; warm pushes up, cool pushes down; brighter =
     carrying more signal right now. Hovering over a neuron in the panel shows
     every one of its branches, with the multipliers written on. */
  let fH = -1, fI = -1, fO = -1;
  for (let j = 0; j < nH; j++) if (Math.abs(lmx - colH) < 9 && Math.abs(lmy - yH(j)) < 6) fH = j;
  if (fH < 0) for (let i = 0; i < nIn; i++) if (lmx > colIn - 125 && lmx < colIn + 7 && Math.abs(lmy - yIn(i)) < row / 2) fI = i;
  if (fH < 0 && fI < 0) for (let k = 0; k < nO; k++) if (lmx > colO - 6 && lmx < colO + 150 && Math.abs(lmy - yO(k)) < 8) fO = k;
  const focused = fH >= 0 || fI >= 0 || fO >= 0;
  const wire = function(x0, y0, x1, y1, w, sig, show){
    const a = show ? 0.85 : Math.min(0.55, 0.12 + Math.abs(sig) * 0.4);
    g2.strokeStyle = warm(w, a.toFixed(2));
    g2.lineWidth = 0.5 + Math.min(3, Math.abs(w) * 1.2);
    g2.beginPath(); g2.moveTo(x0, y0); g2.lineTo(x1, y1); g2.stroke();
  };
  const label = function(txt, x, y, w, align){
    g2.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    g2.textAlign = align || 'left';
    g2.fillStyle = warm(w, 1);
    g2.fillText(txt, x, y);
    g2.textAlign = 'left';
    g2.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  };
  const times = function(w){ return '\u00d7' + (w >= 0 ? '+' : '') + w.toFixed(2); };
  for (let j = 0; j < nH; j++){
    for (let i = 0; i < nIn; i++){
      const w = net.w1[j * net.nIn + i];
      const show = j === fH || i === fI;
      if (focused && !show) continue;
      if (!focused && Math.abs(w) < 0.6) continue;
      wire(colIn + 5, yIn(i), colH - 5, yH(j), w, w * x[i], show);
    }
    for (let k = 0; k < nO; k++){
      const w = net.w2[slots[k] * net.nHid + j];
      const show = j === fH || k === fO;
      if (focused && !show) continue;
      if (!focused && Math.abs(w) < 0.6) continue;
      wire(colH + 5, yH(j), colO - 2, yO(k), w, w * f.h[j], show);
    }
  }
  g2.lineWidth = 1;
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
    g2.beginPath(); g2.arc(colH, yH(j), j === fH ? 6 : 4.5, 0, 6.2832);
    g2.fillStyle = warm(f.h[j], (0.25 + 0.75 * Math.abs(f.h[j])).toFixed(2)); g2.fill();
    if (j === fH){ g2.strokeStyle = '#cfd6db'; g2.lineWidth = 1; g2.stroke(); }
  }
  /* The multipliers on the focused neuron's branches. */
  if (fH >= 0){
    for (let i = 0; i < nIn; i++){ const w = net.w1[fH * net.nIn + i]; label(times(w), colIn + 9, yIn(i), w); }
    for (let k = 0; k < nO; k++){ const w = net.w2[slots[k] * net.nHid + fH]; label(times(w), colO - 4, yO(k) - 7, w, 'right'); }
    label('bias ' + (net.b1[fH] >= 0 ? '+' : '') + net.b1[fH].toFixed(2) + '   firing ' + f.h[fH].toFixed(2), colH, yH(fH) - 10, f.h[fH], 'center');
  } else if (fI >= 0){
    for (let j = 0; j < nH; j++){ const w = net.w1[j * net.nIn + fI]; label(times(w), colH - 8, yH(j), w, 'right'); }
  } else if (fO >= 0){
    for (let j = 0; j < nH; j++){ const w = net.w2[slots[fO] * net.nHid + j]; label(times(w), colH + 8, yH(j), w); }
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
  g2.fillStyle = '#5c666e';
  g2.fillText(focused ? 'the \u00d7 numbers are the branch weights: what it has learned'
                      : 'hover a neuron here to see its branch weights', px + 8, py + H - 30);
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

/* ---------------------------------------------------------------- on the CCTV
   Thomas, 2026-10-13: with brains on and somebody followed, the bottom-left
   camera locks onto them, centred and in close, and the bottom-right quadrant
   becomes the brain screen. The other two carry on chasing the excitement.
   Let go and the bottom two are cameras again. */
const SCOPE_CAM = 2, SCOPE_SCREEN = 3;
function scopeCctvOn(){
  const b = SCOPE.follow;
  return SCOPE.on && VIEW === 'cctv' && b && BEINGS.indexOf(b) >= 0;
}
/* The camera's aim: the followed being, when there is one in sight. */
if (typeof aimStop === 'function'){
  const origAim = aimStop;
  aimStop = function(cam, qs, loose){
    if (cam.i === SCOPE_CAM && scopeCctvOn() && !beingAbsent(SCOPE.follow)){
      cam.tzl = 1.6;                                  // in close
      return [SCOPE.follow.x, SCOPE.follow.y];
    }
    return origAim(cam, qs, loose);
  };
}
/* After the four quadrants are drawn: the halo in the following camera's
   picture, and the brain screen over the quadrant beside it. */
function drawScopeCctv(){
  if (!scopeCctvOn()) return;
  const b = SCOPE.follow, d = dpr(), top = 40;
  const qs = quadSize(), w2 = qs[0], h2 = qs[1];
  const cam = CCTV.cams[SCOPE_CAM];
  if (cam && !beingAbsent(b)){
    const vx = (SCOPE_CAM % 2) * w2, vy = top + (SCOPE_CAM >> 1) * h2;
    const save = { K:K, panX:panX, panY:panY };
    K = (w2 / 100) * Math.pow(2, cam.zl.p);
    panX = vx + w2 / 2 - cv.width / (2 * d) - cam.pan.p * K;
    panY = vy + h2 / 2 - cv.height / (2 * d) - cam.tilt.p * K;
    g2.save();
    g2.setTransform(d, 0, 0, d, 0, 0);
    g2.beginPath(); g2.rect(vx, vy, w2, h2); g2.clip();
    g2.translate(vx + w2 / 2, vy + h2 / 2); g2.rotate(cam.roll || 0); g2.translate(-(vx + w2 / 2), -(vy + h2 / 2));
    scopeHalo(b);
    g2.restore();
    K = save.K; panX = save.panX; panY = save.panY;
  }
  /* The brain screen. */
  const sx = (SCOPE_SCREEN % 2) * w2, sy = top + (SCOPE_SCREEN >> 1) * h2;
  g2.save();
  g2.setTransform(d, 0, 0, d, 0, 0);
  g2.fillStyle = '#07080a'; g2.fillRect(sx, sy, w2, h2);
  g2.beginPath(); g2.rect(sx, sy, w2, h2); g2.clip();
  drawBrainoscope(function(W, H){
    const scl = Math.min((w2 - 16) / W, (h2 - 36) / H, 2.2);
    return [sx + (w2 - W * scl) / 2, sy + 26 + (h2 - 26 - H * scl) / 2, scl];
  });
  g2.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  g2.textBaseline = 'middle'; g2.fillStyle = 'rgba(143,195,216,0.85)';
  g2.fillText('CAM ' + (SCOPE_SCREEN + 1) + '  BRAIN  \u00b7  ' + (b.name || b.kind) + '  \u00b7  following on CAM ' + (SCOPE_CAM + 1), sx + 10, sy + 13);
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
  bt.onclick = function(){ SCOPE.on = !SCOPE.on; bt.classList.toggle('on', SCOPE.on); if (!SCOPE.on) SCOPE.follow = null; };
  addEventListener('keydown', function(e){
    if (!SCOPE.on) return;
    if (e.key === 'b' || e.key === 'B') SCOPE.pick++;
    if (e.key === 'Escape') SCOPE.follow = null;
  });
  /* Click a granny, gull or fox to follow it; click anything else to let go.
     Not while god mode has the mouse - that click is for picking things up. */
  cv.addEventListener('click', function(e){
    if (!SCOPE.on || (typeof HAND !== 'undefined' && HAND.on)) return;
    const r = cv.getBoundingClientRect();
    let mx = e.clientX - r.left, my = e.clientY - r.top, who;
    if (VIEW === 'cctv'){
      /* Through whichever camera was clicked - but the brain screen is a
         screen, not a camera: clicks there change nothing. */
      const qs = quadSize();
      const qi = (mx >= qs[0] ? 1 : 0) + (my - 40 >= qs[1] ? 2 : 0);
      if (scopeCctvOn() && qi === SCOPE_SCREEN) return;
      const pv = pointerView(mx, my);
      who = castAt(pv[0], pv[1]);
      pointerDone();
    } else who = castAt(mx, my);
    const next = who && who.kind && WIRING[who.kind] ? who : null;
    if (next !== SCOPE.follow) SCOPE.pick = 0;
    SCOPE.follow = next;
  });
  /* Drawn after everything else each frame, on top of the thought bubble. */
  /* Fenced off: whatever goes wrong in here must never stop the game. */
  if (typeof frame === 'function'){
    const orig = frame;
    frame = function(t){
      orig(t);
      try { drawBrainoscope(); drawScopeCctv(); }
      catch (e){ if (!SCOPE.warned){ SCOPE.warned = true; console.warn('brainoscope:', e); } }
    };
  }
})();
