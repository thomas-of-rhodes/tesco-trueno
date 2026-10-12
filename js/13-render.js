/* Tesco Trueno - 13-render.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ================================================== painter's ordering =====
   The engine was still using the centroid key the EDITOR threw out. Measured
   against per-pixel ray-cast ground truth while building the editor, that key
   gets 9.43% of pixels wrong; separating-axis ordering with a topological sort
   gets 2.52%, and every one of the residual errors is provably unfixable by ANY
   ordering (interpenetrating pairs). The flicker that was so obvious in the
   editor was in here the whole time - it just had fewer small boxes to show it
   with. The cast is about to change that.

   Why not simply run the editor's algorithm over everything: it is O(n^2) in
   pairs, the editor sorts one sprite of ~20 boxes, and a frame here is nearer a
   thousand. But the errors are not spread evenly - they happen where boxes
   INTERLEAVE, which is within one jointed thing, not between a gull and a lamp
   post forty metres away. So: key-sort globally, then re-order each cluster's
   own slots exactly. O(n log n) + O(clusters x m^2), with m about fifteen. */
const RAY = [1, 1, 1 / 0.78];
const keyOf = function(it){
  const pa = P(it.X, it.Y);
  return pa[0] + pa[1] + 1.282 * (it.z0 + it.z1) / 2;
};
const SORT = function(a, b){ return keyOf(a) - keyOf(b); };

function annotate(it){
  const c = Math.cos(it.rot || 0), sn = Math.sin(it.rot || 0);
  const hl = it.L / 2, hw = it.W / 2, cs = [];
  for (const q of [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]])
    cs.push(P(it.X + q[0] * c - q[1] * sn, it.Y + q[0] * sn + q[1] * c));
  it._cs = cs;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of cs){
    const sx = q[0] - q[1];
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
    for (const z of [it.z0, it.z1]){
      const sy = (q[0] + q[1]) * 0.5 - z * 0.78;
      if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
  }
  it._bb = [x0, y0, x1, y1];
  it._key = keyOf(it);
}
/* The two in-plane normals, taken from the mapped corners rather than from the
   angle - P() reflects x, so a world rotation is a NEGATIVE rotation in this
   space and reasoning about that sign is how you get a subtly wrong sort. */
function axesOf(it){
  const a = it._cs[0], b = it._cs[1], d = it._cs[3];
  let ux = b[0] - a[0], uy = b[1] - a[1];
  let vx = d[0] - a[0], vy = d[1] - a[1];
  const ul = Math.hypot(ux, uy) || 1, vl = Math.hypot(vx, vy) || 1;
  return [[ux / ul, uy / ul, 0], [vx / vl, vy / vl, 0]];
}
function projInt(it, n){
  let lo = Infinity, hi = -Infinity;
  for (const q of it._cs){
    const xy = q[0] * n[0] + q[1] * n[1];
    for (const z of [it.z0, it.z1]){
      const d = xy + z * n[2];
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
  }
  return [lo, hi];
}
function sepOrder(A, B){
  const E = 1e-9;
  const axes = [[0, 0, 1]].concat(axesOf(A)).concat(axesOf(B));
  for (const n of axes){
    const a = projInt(A, n), b = projInt(B, n);
    let sign = 0;
    if (a[1] <= b[0] + E) sign = 1;
    else if (b[1] <= a[0] + E) sign = -1;
    else continue;
    const d = n[0] * RAY[0] + n[1] * RAY[1] + n[2] * RAY[2];
    if (d > E) return sign;
    if (d < -E) return -sign;
  }
  return 0;
}
/* Kahn, with the centroid key as the tie-break so the free choices still come
   out in a sensible order. A cycle means no correct ordering exists - genuinely
   interpenetrating geometry - and the fallback is the key, which is what the
   editor settled on after measuring that the alternative is no better. */
function exactOrder(ps){
  const n = ps.length;
  if (n < 2) return ps;
  for (const it of ps) if (!it._cs) annotate(it);
  const adj = [], indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) adj.push([]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){
    const a = ps[i], b = ps[j];
    if (a._bb[2] <= b._bb[0] || b._bb[2] <= a._bb[0] ||
        a._bb[3] <= b._bb[1] || b._bb[3] <= a._bb[1]) continue;
    const ord = sepOrder(a, b);
    if (ord === 0) continue;
    const first = ord > 0 ? i : j, last = ord > 0 ? j : i;
    adj[first].push(last); indeg[last]++;
  }
  const ready = [], out = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  while (ready.length){
    let bi = 0;
    for (let k = 1; k < ready.length; k++)
      if (ps[ready[k]]._key < ps[ready[bi]]._key) bi = k;
    const i = ready.splice(bi, 1)[0];
    out.push(ps[i]);
    for (const j of adj[i]) if (--indeg[j] === 0) ready.push(j);
  }
  if (out.length < n){
    ORDER_CYCLES++;
    return ps.slice().sort(function(a, b){ return a._key - b._key; });
  }
  return out;
}
let ORDER_CYCLES = 0;

/* Key-sort the lot, then hand each cluster its own slots back in exact order. */
function paintOrder(items){
  for (const it of items){ it._cs = null; annotate(it); }
  items.sort(function(a, b){ return a._key - b._key; });
  const slots = {};
  for (let i = 0; i < items.length; i++){
    const c = items[i].cid;
    if (c === undefined) continue;
    (slots[c] || (slots[c] = [])).push(i);
  }
  for (const c in slots){
    const at = slots[c];
    if (at.length < 2) continue;
    const grp = exactOrder(at.map(function(i){ return items[i]; }));
    for (let k = 0; k < at.length; k++) items[at[k]] = grp[k];
  }
  return items;
}

/* The crop, and it is a hard one. Framing the whole world - the Tay, the railway,
   waste ground out to 200 m - put the car park in one corner and filled the rest of
   the screen with empty scrubland. This frames the car park plus just enough margin
   to read the things that make it that place and not any car park: the store
   frontage he can actually hit, the walkway approach, the railway fence. The store
   itself runs off the top of the frame, which is what a hard crop is for. */
const CROP = { x0:X0 - 10, x1:X1 + 36, y0:Y0 - 15, y1:Y1 + 17 };
let zoom = 1, Kfit = 3;
const ZOOM_MIN = 1, ZOOM_MAX = 4;
const FITX = { x0:0, x1:1, y0:0, y1:1 };   // the crop, in projected units

/* ------------------------------------------------ the camera in god mode ---
   Picking something up pulls the view back a little and unlocks the pan, and
   that is the whole of it. The reasoning is that god mode is the one thing in
   here you do with your hands rather than watch: the moment you have a Honda
   Jazz dangling off the cursor you want to see where you are about to put it,
   and the fixed centre-locked frame is suddenly in the way.

   Three behaviours, and the second is the one that makes it feel right:
     - pull back to 80% when you first pick something up
     - and LEAVE IT THERE. Not while you are holding something - for as long as
       god mode is on. Snapping the view back every time you set a trolley down
       and reaching back out every time you lift the next one would be the
       camera fidgeting at you while you work.
     - push the pointer into the edge of the screen and the view scrolls, which
       is how every map and every level editor has worked for thirty years

   And it unwinds five seconds after god mode is switched off, not immediately,
   because switching it off to watch what you have just done and having the
   camera lurch at the same moment is the same fidget from the other end.

   The pan limits fall out of the crop rather than being chosen: you may push
   until the edge of the crop meets the edge of the screen. Which means that at
   1x, where the whole site already fits, the limit is zero and the edge-scroll
   simply does nothing - correct, and not a special case. There is nowhere to
   scroll to. */
const GOD = { z:1, zWant:1, px:0, py:0, off:99 };
const GOD_OUT = 0.80;

function stepGod(dt){
  if (CCTV.on) return;                     // in the quad view the cameras own it
  if (HAND.on){
    GOD.off = 0;
    if (HAND.grabbed) GOD.zWant = GOD_OUT;
  } else {
    GOD.off += dt;
    if (GOD.off > 5) GOD.zWant = 1;
  }
  GOD.z += (GOD.zWant - GOD.z) * Math.min(1, dt * 3.0);

  /* Edge scroll, while something is actually in the hand. The margin is a band
     round the frame and the speed ramps across it, so nudging into it creeps
     and burying the pointer in the corner fairly shifts. */
  const d = dpr(), W = cv.width / d, H = cv.height / d;
  if (HAND.on && HAND.grabbed && HOVER.mx >= 0){
    const M = 110, SPD = 520;
    let ex = 0, ey = 0;
    if (HOVER.mx < M) ex = (M - HOVER.mx) / M;
    else if (HOVER.mx > W - M) ex = -(HOVER.mx - (W - M)) / M;
    /* A little deeper at the top, because the button bar and the hint line
       live up there and the pointer passes through on its way to them. */
    if (HOVER.my < M + 30) ey = (M + 30 - HOVER.my) / (M + 30);
    else if (HOVER.my > H - M) ey = -(HOVER.my - (H - M)) / M;
    GOD.px += ex * SPD * dt;
    GOD.py += ey * SPD * dt;
  } else if (GOD.zWant === 1){
    /* Back to the middle, at the same unhurried rate as the zoom. */
    const k = Math.min(1, dt * 2.0);
    GOD.px -= GOD.px * k; GOD.py -= GOD.py * k;
  }

  /* Clamped against the crop at the CURRENT scale, which also means that as the
     view pulls back the allowed pan shrinks and any offset already banked is
     eased in rather than clipped. */
  const Kn = Kfit * Math.max(ZOOM_MIN, zoom * GOD.z);
  const lx = Math.max(0, (FITX.x1 - FITX.x0) * Kn / 2 - W / 2 + 10);
  const ly = Math.max(0, (FITX.y1 - FITX.y0) * Kn / 2 - H / 2 + 10);
  GOD.px = Math.max(-lx, Math.min(lx, GOD.px));
  GOD.py = Math.max(-ly, Math.min(ly, GOD.py));
  applyZoom();
}

function fit(){
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const probe2 = function(X, Y, z){
    const p = P(X, Y), sx = p[0] - p[1], sy = (p[0] + p[1]) * 0.5 - z * 0.78;
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
    if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  };
  for (const X of [CROP.x0, CROP.x1]) for (const Y of [CROP.y0, CROP.y1]) probe2(X, Y, 0);
  /* Tall things raise the top of the frame, so they have to be in the fit or the
     mast heads and the store ridge get clipped. */
  for (const m of MASTS) probe2(m[0], m[1], 14.3 * MH);
  for (const Y of [Y0 + 20, Y1 - 20]) probe2(X1 + 10, Y, 9.2 * BH);
  const d = dpr(), W = cv.width / d, H = cv.height / d;
  /* Margins must never exceed the canvas, or K goes negative and the whole view
     turns inside out - which is exactly what a small window did. */
  const usableW = Math.max(60, W - 20), usableH = Math.max(60, H - 78);
  Kfit = Math.max(0.15, Math.min(usableW / (x1 - x0), usableH / (y1 - y0)));
  CXp = (x0 + x1) / 2; CYp = (y0 + y1) / 2;
  /* Kept, because the pan limits below are exactly this extent: you may push
     the view until the edge of the crop reaches the edge of the screen and no
     further. */
  FITX.x0 = x0; FITX.x1 = x1; FITX.y0 = y0; FITX.y1 = y1;
  applyZoom();
}
/* Zoom within the crop, about its centre. The centre only moves in god mode -
   see GOD above - and even then only as far as the crop allows, so the view
   still cannot wander off to look at the Tesco or the river.
   The product is floored at ZOOM_MIN so that god mode pulling back from an
   already-fitted view does not open up empty margin round the site; at 1x
   there is nothing to pull back from and it correctly does nothing. */
function applyZoom(){
  K = Kfit * Math.max(ZOOM_MIN, zoom * GOD.z);
  panX = -CXp * K + GOD.px;
  panY = -CYp * K + 18 + GOD.py;         // clear of the button bar
}

function render(){
  const d = dpr();
  g2.setTransform(1, 0, 0, 1, 0, 0);
  /* Under a clip this fills the quadrant and nothing else, which is why the
     four cameras do not wipe each other out. */
  g2.fillStyle = '#0a0c0e'; g2.fillRect(0, 0, cv.width, cv.height);
  setViewT(d);

  /* Wet tarmac goes dark and slightly blue, the way it does. */
  const wetK = WX.wet, dayK = daylight();
  for (const a of AREAS){
    const d = GND[a.k], n = GND_NIGHT[a.k] || d;
    /* Night first, then rain on top of whatever hour it is. */
    let cc = [n[0] + (d[0] - n[0]) * dayK,
              n[1] + (d[1] - n[1]) * dayK,
              n[2] + (d[2] - n[2]) * dayK];
    if (wetK > 0.02)
      cc = [cc[0] * (1 - 0.30 * wetK), cc[1] * (1 - 0.26 * wetK),
            cc[2] * (1 - 0.18 * wetK) + 3 * wetK];
    quadAt(a.x0, a.y0, a.x1, a.y1, rgbOf(cc));
  }

  /* Sodium pools under the masts, from site-plan.html - laid on the ground
     before anything stands on it, squashed 2:1 because that is what a circle
     on the ground looks like in this projection. Faded in with the dusk rather
     than switched on.

     DO NOT CACHE THIS LAYER. I tried, 2026-10-08, and it is worth recording why
     not. Timing `render()` in a loop said the 234 wet-sheen strokes below cost
     18 ms a frame and the fourteen big gradients cost 1.8 - so I baked the
     strokes into an offscreen layer and blitted it, which is sound in principle
     because the projection is affine and one drawImage can serve any camera.
     Then I counted REAL animation frames instead of timing a loop, and all of
     it was false: 24.5 fps with the strokes, 24.5 with them deleted entirely,
     24.7 with the baked layer. The sheen costs nothing measurable.
     The trap is that canvas drawing is asynchronous. Timing a loop of render()
     calls measures how fast you can QUEUE work, not how long the frame takes,
     and it charges 234 synchronous stroke() calls for their CPU setup while a
     single drawImage's GPU work lands outside the window. Forcing a flush with
     getImageData swings it the other way, because a readback can drop the
     canvas into software rasterisation and then a large blit really is slow.
     Neither synthetic number means anything. Count frames. */
  const nightK = 1 - dayK;
  if (nightK > 0.03){
    g2.save();
    g2.globalCompositeOperation = 'lighter';
    for (let mi = 0; mi < MASTS.length; mi++){
      /* Each pool carries its own lamp's brightness now, so they fade up one
         at a time at dusk and the two bad ones breathe. A lamp still warming
         also throws a SMALLER pool, which is the half of it you notice without
         being told: a sodium lamp at a third of its output does not light a
         smaller circle brightly, it lights a smaller circle. */
      const b = lampBright(mi);
      if (b < 0.02) continue;
      const m = MASTS[mi];
      const q = P(m[0], m[1]), sx = SX(q), sy = SY(q, 0);
      const r = 46 * K * (0.55 + 0.45 * b);
      const gr = g2.createRadialGradient(sx, sy, 3, sx, sy, r);
      gr.addColorStop(0, 'rgba(255,206,140,' + (0.30 * nightK * b).toFixed(3) + ')');
      gr.addColorStop(0.45, 'rgba(255,198,126,' + (0.12 * nightK * b).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,196,124,0)');
      g2.fillStyle = gr;
      g2.beginPath(); g2.ellipse(sx, sy, r, r * 0.5, 0, 0, 6.2832); g2.fill();
    }
    /* The store frontage throws its own, colder light out over the prime row. */
    for (const dr of PLACES.doors){
      const q = P(dr[0], dr[1]), sx = SX(q), sy = SY(q, 0), r = 30 * K;
      const gr = g2.createRadialGradient(sx, sy, 4, sx, sy, r);
      gr.addColorStop(0, 'rgba(226,232,210,' + (0.16 * nightK).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(226,232,210,0)');
      g2.fillStyle = gr;
      g2.beginPath(); g2.ellipse(sx, sy, r, r * 0.5, 0, 0, 6.2832); g2.fill();
    }

    /* And the wet sheen: light streaking AWAY from each lamp down the wet
       tarmac. This is the other half of the old demo's night, and it is the
       thing that actually reads as a reflective surface - far more than the
       mirrored boxes do, because it is the light that smears, not the object.
       Deterministic per mast, so it does not crawl about between frames. */
    if (wetK > 0.08){
      let sd = 1337;
      const rnd = function(){ sd = (sd * 1103515245 + 12345) & 0x7fffffff;
        return sd / 0x7fffffff; };
      for (let mi = 0; mi < MASTS.length; mi++){
        const m = MASTS[mi], b = lampBright(mi);
        for (let k = 0; k < 26; k++){
          /* All four rnd() calls happen whether this lamp is lit or not. The
             sequence is the streak geometry, so skipping a dark lamp early
             would shuffle every streak downstream of it and the whole car park
             would shimmer as lamps came on. */
          const off = (rnd() - 0.5) * 34;
          const len = 4 + rnd() * 26;
          const ar = 0.035 + rnd() * 0.055;
          const lw = 1.4 + rnd() * 1.6;
          if (b < 0.02) continue;
          /* Straight DOWN the screen from the lamp's mirror image. A light
             on wet ground smears toward whoever is looking at it, whichever
             way that is, and in this view that is always screen-down. These
             used to run along the world's y axis, which put them at a fixed
             diagonal across the tarmac - and once the rain arrived, they
             criss-crossed it and read as more rain at the wrong angle. Soft,
             wider with the zoom, and fading toward the viewer. */
          const mp = P(m[0], m[1]);
          const sx = SX(mp) + off * K * 0.30;
          const y0 = SY(mp, -LAMP_HEAD_Z * (0.55 + 0.03 * Math.abs(off)));
          const y1 = y0 + len * K * 0.45;
          const gr = g2.createLinearGradient(sx, y0, sx, y1);
          const al = (ar * 1.4 * wetK * nightK * b).toFixed(3);
          gr.addColorStop(0, 'rgba(255,214,158,0)');
          gr.addColorStop(0.2, 'rgba(255,214,158,' + al + ')');
          gr.addColorStop(1, 'rgba(255,214,158,0)');
          g2.strokeStyle = gr;
          g2.lineWidth = Math.max(1, lw * K * 0.12);
          g2.lineCap = 'round';
          g2.beginPath();
          g2.moveTo(sx, y0); g2.lineTo(sx, y1);
          g2.stroke();
        }
      }
    }
    g2.restore();
  }
  /* Puddles OVER the sodium pools, and under the painted lines. Twice now:
     drawn after the pools as near-black they were holes in the light; moved
     underneath, the pool lifted them exactly as much as the tarmac round them
     and they vanished at night. Real standing water at night is darker and
     glossier than the wet tarmac - it does not scatter the lamp, it mirrors
     it - so it goes on top, as deep blue-grey glass, and the glints say
     where a lamp is in it. */
  drawPuddles(dayK, nightK);
  /* Bay lines from the BAYS themselves, both sides of every space that exists.
     They used to come off a fixed grid that started at the old west edge, so
     when the west end became a road and the shelters moved into the rows, the
     paint carried on regardless and the new layout was invisible. Shared edges
     are drawn once. */
  const painted = {};
  for (const b of BAYS){
    for (const sx of [-1, 1]){
      const lx = b.x + sx * BAY / 2;
      const key = Math.round(lx * 10) + ':' + Math.round(b.y);
      if (painted[key]) continue;
      painted[key] = 1;
      lineAt(lx, b.y - 2.4, lx, b.y + 2.4, 'rgba(226,230,232,0.20)', 1);
    }
  }
  /* One-way arrows down the middle of each one-way aisle. */
  for (let l = 0; l < LANES.length; l++){
    const f = laneFlow(l);
    if (!f) continue;
    const ly = LANES[l];
    for (let ax = X0 + 22; ax < X1 - 10; ax += 28){
      lineAt(ax - 1.6 * f, ly, ax + 1.6 * f, ly, 'rgba(228,232,234,0.34)', 1.6);
      lineAt(ax + 1.6 * f, ly, ax + 0.6 * f, ly - 0.7, 'rgba(228,232,234,0.34)', 1.6);
      lineAt(ax + 1.6 * f, ly, ax + 0.6 * f, ly + 0.7, 'rgba(228,232,234,0.34)', 1.6);
    }
  }
  /* The west road's centre line, and the access road's, dashed: they are roads,
     and should read as roads rather than as tarmac with no bays on it. */
  for (let y = Y0 + WALK_W + 1; y < Y1 - ROAD_W; y += 4)
    lineAt(X0 + 4.2, y, X0 + 4.2, y + 2, 'rgba(228,232,234,0.30)', 1.2);
  for (let x = X0 - 30; x < X0 + 4; x += 4)
    lineAt(x, Y1 - ROAD_W / 2, x + 2, Y1 - ROAD_W / 2, 'rgba(228,232,234,0.30)', 1.2);
  for (const ry of RAILS) lineAt(-20, ry, 340, ry, 'rgba(158,164,168,0.55)', 1.2);
  /* Marked pedestrian crossings hatched across the aisles, as in the photos. They
     are painted, not solid - but they are where the people will walk. */
  for (const cx of [X0 + 34, X0 + 86, X0 + 138]){
    for (let i = 0; i < 9; i++){
      const y = KERB_Y + i * ((Y1 - ROAD_W - KERB_Y) / 9);
      lineAt(cx - 1.6, y, cx + 1.6, y + 1.1, 'rgba(228,232,234,0.30)', 1.6);
    }
  }
  for (const ly of [-28, -16]) lineAt(-20, ly, 340, ly, 'rgba(228,198,92,0.45)', 1.1);

  if (trace) for (const m of RUB){
    const p = P(m[0], m[1]);
    g2.fillStyle = 'rgba(14,16,18,' + (0.12 + 0.36 * m[2]).toFixed(3) + ')';
    g2.fillRect(SX(p) - 1.2, SY(p, 0) - 1.2, 2.4, 2.4);
  }

  const items = SCEN.slice();
  /* Only the PARKED CARS come from the collision boxes. Everything else solid -
     shelters, the rotunda, Click+Collect, the island - is already drawn properly
     in SCEN, and drawing it again from its collision box put a second, cruder
     copy on top: the shelters appeared twice, and the island kerb, whose box is
     84 m long, was being rendered as a four-metre grey WALL down the length of
     the car park. It has been there since the island went in. */
  /* The artic, from its sprites, at its two collision boxes (the articulated
     model moves those). It was two grey slabs until 2026-10-12. */
  if (LORRY.tractor >= 0 && WORLD.boxes[LORRY.tractor] && !WORLD.boxes[LORRY.tractor].off){
    const tb = WORLD.boxes[LORRY.tractor], rb = WORLD.boxes[LORRY.trailer];
    for (const q of spriteItems('lorry-tractor', tb.x, tb.y, tb.a, 0, { cid:'lorry' })) items.push(q);
    if (rb && !rb.off)
      for (const q of spriteItems('lorry-trailer', rb.x, rb.y, rb.a, 0, { cid:'lorry' })) items.push(q);
  }
  /* A parked car drawn from its own sprite rather than as a grey slab. They are
     the single most numerous thing in the car park, so it is worth the boxes. */
  /* The bus, built from boxes in code rather than from a sprite, the same way
     the scenery and the artic are: body, a darker window band, a lighter roof,
     and the destination blind, which is the one detail that makes it read as a
     bus rather than a van. */
  if (BUS.on)
    for (const q of spriteItems('bus', BUS.x, BUS.y, BUS.h, 0, { cid:'bus' })) items.push(q);
  for (const bay of BAYS){
    if (!bay.car) continue;
    const sp = CAST[bay.car.model.sprite];
    if (!sp) continue;
    const bx = WORLD.boxes[bay.box];
    const boxes = sp.states[sp.order[0]];
    const ch = Math.cos(bx.a), sh = Math.sin(bx.a);
    const paint = bay.car.veh && bay.car.veh.paint;
    for (const q of boxes)
      items.push({ cid:'p' + bay.box, lit:0,
                   X:bx.x + q.f * ch - q.l * sh, Y:bx.y + q.f * sh + q.l * ch,
                   L:q.L, W:q.W, rot:bx.a + q.rot,
                   z0:q.z, z1:q.z + q.H,
                   col:(q.paint && paint) ? tint(paint, q.paintK) : q.col });
    /* Parking tickets, one yellow slip each, on the roof by the windscreen
       where the camera can see them. */
    /* At the car's own `ticket` anchor - a Miata's roof is not a Discovery's. */
    const ta = anchorOf(bay.car.model.sprite, 'ticket') || { f:0.55, l:0, z:1.47 };
    for (let k = 0; k < (bay.tickets || 0); k++){
      const f = ta.f, l = ta.l - 0.42 + k * 0.42;
      for (const q of spriteItems('ticket', bx.x + f * ch - l * sh, bx.y + f * sh + l * ch,
                                  bx.a + 0.15 * (k - 1), ta.z, { cid:'p' + bay.box })) items.push(q);
    }
  }
  /* Height is nearly unreadable in an isometric view without one of these: a
     lifted trolley just looks like a trolley slightly further away. The shadow is
     what makes the lift legible. */
  const shadow = function(wx, wy, up, rad){
    if (up < 0.15 || inVoid(wx, wy)) return;
    const p = P(wx, wy);
    const k = Math.max(0.35, 1 - up / (CARRY_Z * 1.6));
    g2.fillStyle = 'rgba(0,0,0,' + (0.34 * k).toFixed(3) + ')';
    g2.beginPath();
    g2.ellipse(SX(p), SY(p, 0), rad * K * k, rad * K * k * 0.5, 0, 0, 6.2832);
    g2.fill();
  };
  for (const m of MOVERS) shadow(m.x, m.y, m.held ? m.lift : m.z, 0.75);
  shadow(car.x, car.y, (car.held ? car.lift : 0) + (car.airborne || 0), 1.9);
  /* The same for everything else that leaves the ground. The shadow is the only
     cue in an isometric view that tells height from distance - without it a car
     being carried across the car park just looks like a car driving across it,
     badly. Trueno has had one all along and it is the reason his pickup reads
     properly, so: the NPC cars, and every being, including a gull standing on
     somebody's roof and a granny in mid-air. */
  for (const c of CARS){
    if (c.done) continue;
    const up = (c.held ? (c.lift || 0) : 0) + (c.airborne || 0);
    shadow(c.x, c.y, up, Math.max(1.2, c.model.l * 0.42));
  }
  for (const b of BEINGS){
    if (beingAbsent(b)) continue;
    const up = (b.held ? (b.lift || 0) : b.z) + (b.gz || 0);
    shadow(b.x, b.y, up, b.k.r * 1.25);
  }
  /* Splashes, ripples and bubbles on the Tay. Aged off simClock, so they need
     no stepping of their own and freeze with everything else. */
  for (let i = RIPPLES.length - 1; i >= 0; i--){
    const rp = RIPPLES[i];
    const age = simClock - rp.t;
    if (age > rp.life){ RIPPLES.splice(i, 1); continue; }
    if (age < 0) continue;
    const f = age / rp.life;
    const rad = rp.r * (0.25 + 0.75 * Math.sqrt(f));
    const pp = P(rp.x, rp.y);
    const al = rp.a * (1 - f) * (0.55 + 0.45 * dayK);
    g2.beginPath();
    g2.ellipse(SX(pp), SY(pp, 0), rad * K, rad * K * 0.5, 0, 0, 6.2832);
    if (rp.foam){
      g2.fillStyle = 'rgba(232,242,246,' + (al * 0.8).toFixed(3) + ')';
      g2.fill();
    }
    g2.strokeStyle = 'rgba(214,232,240,' + al.toFixed(3) + ')';
    g2.lineWidth = Math.max(1, 1.6 * (1 - f));
    g2.stroke();
  }

  /* Anything falling into the void fades as it goes; its parts carry the alpha. */
  const fadeFrom = function(o, n){
    const a = voidAlpha(o);
    if (a < 1) for (let i = n; i < items.length; i++) items[i].al = a;
  };
  let n0 = items.length;
  for (const q of carParts(car)) items.push(q);
  fadeFrom(car, n0);
  for (const m of MOVERS){
    n0 = items.length;
    for (const q of trolleyParts(m)) items.push(q);
    fadeFrom(m, n0);
  }
  for (const b of BEINGS){
    if (beingAbsent(b)) continue;
    n0 = items.length;
    for (const q of beingParts(b)) items.push(q);
    fadeFrom(b, n0);
  }
  for (const c of CARS){
    n0 = items.length;
    for (const q of npcParts(c)) items.push(q);
    fadeFrom(c, n0);
  }
  /* Umbrellas on the loose. */
  for (const u of FLY)
    for (const q of spriteItems('umbrella', u.x, u.y, u.h, u.z, { state:'blown', paint:u.col })) items.push(q);
  paintOrder(items);
  /* A lit box keeps its colour: no face shading, and it brightens as the light
     goes, so the same headlight is a detail at noon and a beacon at 3 a.m. */
  /* Reflections, which this projection gives away almost for free: SY is
     linear in z, so mirroring an object about the ground plane is just z -> -z
     and it lands exactly where its reflection belongs. Squashed a little,
     because a real reflection in a thin film of water is foreshortened, and
     drawn BEFORE everything else so it sits under the world rather than on it.
     Only movers and lit boxes are reflected - reflecting the scenery as well
     doubled the draw count and made mud of it, and a headlight smeared down
     wet tarmac is the whole of the effect anyway. */
  const wetR = WX.wet;
  if (wetR > 0.06){
    const squash = 0.62;
    g2.save();
    for (const it of items){
      if (!it.lit && it.cid === undefined) continue;
      if (it.z1 > 6 || it.al !== undefined) continue;    // nothing to reflect in
      const fade = Math.max(0, 1 - it.z0 / 3.2);
      const al = wetR * fade * (it.lit ? 0.55 : 0.20);
      if (al < 0.02) continue;
      g2.globalAlpha = al;
      drawBoxAt(it.X, it.Y, it.rot, it.L, it.W,
                -it.z1 * squash, -it.z0 * squash, it.col, it.lit ? 1.5 : 1);
    }
    g2.restore();
  }

  const lampK = Math.max(0, Math.min(1, lightsOn()));
  for (const it of items){
    if (it.al !== undefined) g2.globalAlpha = it.al;
    if (it.lit){
      /* A tagged box belongs to one mast and follows that lamp; everything else
         lit - headlights, the store front, the lit signs - is unaffected. */
      const lb = it.mast === undefined ? 1 : lampBright(it.mast);
      const k = it.lit * (0.25 + 0.75 * lampK) * lb;
      drawBoxAt(it.X, it.Y, it.rot, it.L, it.W, it.z0, it.z1, it.col, 1 + 0.9 * k);
    } else {
      /* Solid things go dark with the hour as well. Lighting only the ground
         left the car park glowing under a set of perfectly daylit buildings,
         which is worse than not doing it at all. Nothing goes fully black -
         there is enough spill from the masts to keep shapes readable. */
      drawBoxAt(it.X, it.Y, it.rot, it.L, it.W, it.z0, it.z1, it.col,
                0.34 + 0.66 * dayK);
    }
    if (it.al !== undefined) g2.globalAlpha = 1;
  }

  drawRainOver(dayK, nightK);
  if (showRays && car.dbg){
    const fanDraw = function(rays, col){
      g2.strokeStyle = col; g2.lineWidth = 1;
      for (const r of rays){
        const wa = car.h + r.ang;
        const p0 = P(car.x, car.y);
        const p1 = P(car.x + Math.cos(wa) * r.dist, car.y + Math.sin(wa) * r.dist);
        g2.beginPath(); g2.moveTo(SX(p0), SY(p0, 0.4)); g2.lineTo(SX(p1), SY(p1, 0.4));
        g2.stroke();
      }
    };
    fanDraw(car.dbg.sen.rays, 'rgba(77,127,150,0.55)');
    /* The rear fan, brighter while he is actually reversing. */
    if (car.dbg.rear)
      fanDraw(car.dbg.rear.rays, car.vx < -0.3 ? 'rgba(196,138,84,0.75)'
                                               : 'rgba(150,120,96,0.28)');
  }
  if (!QUAD) plain();        // four cameras do not need four DOM rewrites
}

/* ------------------------------------------------- plain english readouts --- */
const DOING = {
  none:'cruising, picking his way through',
  hb:'handbrake turn',
  shuffle:'reversing off something he ran into',
  bail:'emergency handbrake stop'
};
const JDOING = { back:'backing up to swing it round',
                 flick:'flicking it round backwards',
                 catch:'catching the slide' };
function plain(){
  const spd = Math.hypot(car.vx, car.vy) / MPH;
  const m = car.dbg ? car.dbg.mode : 'none';
  let what = DOING[m.split('/')[0]] || m;
  if (m.indexOf('jturn/') === 0) what = JDOING[m.split('/')[1]] || 'J-turn';
  const stuckFor = car.dbg ? car.dbg.stuckT : 0;
  const rows = [
    ['doing', what],
    ['speed', spd.toFixed(0) + ' mph'],
    ['sliding', (Math.abs(car.ar) > 0.15 ? 'yes, ' +
      (car.ar * DEG).toFixed(0) + '° of tail-out' : 'no, gripping')],
    ['laid rubber', RUB.length + ' marks'],
    ['bumped into things', car.contact + ' times'],
    ['paint damage', (car.dmg / 1000).toFixed(0) + ' kJ'],
    ['no progress for', stuckFor.toFixed(1) + ' s' +
      (stuckFor > 1 ? '  — about to escape' : '')]
  ];
  /* He reverses a lot - every escape and every J-turn wind-up - so what he can see
     back there belongs on the panel, not just in the ray overlay. */
  rows.push(['the weather', squallNow()
    ? 'a squall going through \u2014 coming down sideways'
    : WX.rain > 0.15
    ? 'raining, and the tarmac is greasy'
    : WX.wet > 0.25 ? 'wet through, grip is down a third'
    : WX.wet > 0.05 ? 'drying out, grip coming back' : 'dry']);
  if (MOOD.sulk) rows.push(['his mood', 'sulking \u2014 too busy out there']);
  else if (MOOD.shine > 0) rows.push(['his mood', 'the place to himself']);
  if (car.dbg && car.dbg.rear)
    rows.push(['room behind him', car.dbg.rear.straight.toFixed(1) +
               ' m straight back, closest in the arc ' +
               car.dbg.rear.min.toFixed(1) + ' m']);
  let h = '';
  for (const r of rows)
    h += '<tr><td>' + r[0] + '</td><td class="n">' + r[1] + '</td></tr>';
  document.getElementById('telT').innerHTML = h;

  /* Who is here. Two numbers Thomas asked for - inside the shop, and out in the
     car park - plus the few that make them readable: a headcount with no idea
     how many cars are parked or moving does not tell you whether the place is
     busy or merely occupied.
     `inStore` is the honest test for being inside: it is the same flag that
     takes a being out of the draw list and out of everybody's perception, so
     the two numbers always add up to the cast actually on the premises. */
  const cen = document.getElementById('cenT');
  /* Only while it is on screen: it is a dev overlay, hidden by default. */
  if (cen && $('cen').style.display !== 'none'){
    let inShop = 0, outside = 0, birds = 0, staffIn = 0;
    for (const b of BEINGS){
      if (b.gone || b.away) continue;
      if (b.kind === 'gull' || b.kind === 'fox'){ if (!b.inStore) birds++; continue; }
      if (b.inStore){ inShop++; if (!hasLife(b)) staffIn++; }
      else outside++;
    }
    const taken = BAYS.filter(function(q){ return q.car; }).length;
    const lost = BEINGS.filter(function(q){
      return ['muddled','hunting','seekHelp','waitHelp','following'].indexOf(q.life) >= 0;
    }).length;
    /* The census proper (step 7): everybody accounted for, on the map or off
       it. Read from the once-a-second snapshot rather than recounted every
       frame. Off-map people are residents with an open visit and no being. */
    const cs = CENSUS.last;
    const om = cs ? cs.offMap : { shop:0, work:0, town:0, car:0 };
    const cc = cs ? cs.cars : null;
    const abandoned = BAYS.filter(function(q){ return q.car && q.abandonedAt !== undefined; }).length;
    const orphans = cc ? cc.orphanLong + cc.orphanShort : 0;
    const unaccounted = Math.max(0, orphans - abandoned);
    const ticketed = BAYS.filter(function(q){ return q.car && (q.tickets || 0) > 0; }).length;
    const rows2 = [
      ['<b>in Tesco</b>', inShop - staffIn + om.shop, 1],     // customers
      ['<b>in the car park</b>', outside, 1],
      ['<b>in town</b>', om.town, 1],
      ['staff at work', om.work + staffIn, 0],
      ['cars parked', taken + ' of ' + BAYS.length, 0],
      ['cars moving', CARS.length, 0]
    ];
    if (cc) rows2.push(['whose they are', cc.ownerShop + ' shopping · ' + cc.ownerWork +
                        ' staff · ' + cc.ownerTown + ' in town · ' +
                        (cc.ownerCarPark + cc.ownerInCar) + ' nearby', 0]);
    if (abandoned) rows2.push(['abandoned', abandoned + (ticketed ? ', ' + ticketed + ' ticketed' : ''), 0]);
    else if (ticketed) rows2.push(['ticketed', ticketed, 0]);
    if (CENSUS.ev.tickets || CENSUS.ev.towed)
      rows2.push(['tickets written · towed', (CENSUS.ev.tickets || 0) + ' · ' + (CENSUS.ev.towed || 0), 0]);
    if (TOW.truck) rows2.push(['the recovery truck', TOW.truck.tow && TOW.truck.tow.loaded ? 'leaving, loaded' : 'on its way in', 0]);
    /* The one that should always say nothing: a car nobody is behind and the
       census has not yet put down as abandoned. Shown in red if it ever isn't. */
    if (unaccounted || (cs && cs.people.carless))
      rows2.push(['<span class="bad">unaccounted</span>', '<span class="bad">' + unaccounted +
                  ' cars · ' + (cs ? cs.people.carless : 0) + ' people</span>', 0]);
    rows2.push(['gulls and foxes', birds, 0]);
    if (lost) rows2.push(['looking for their car', lost, 0]);
    if (EXC_HOT.length){
      const top = EXC_HOT[0];
      rows2.push(['most going on', top.v.toFixed(0) + ' at (' +
                  top.x.toFixed(0) + ',' + top.y.toFixed(0) + ')', 0]);
    }
    if (BUS.on) rows2.push(['the bus', BUS.phase === 'dwell' ? 'at the stop' : 'on the road', 0]);
    let hc = '';
    for (const r of rows2)
      hc += '<tr' + (r[2] ? ' class="big"' : '') + '><td>' + r[0] +
            '</td><td class="n">' + r[1] + '</td></tr>';
    cen.innerHTML = hc;
  }
  const cl = document.getElementById('clock');
  if (cl){
    const hh = Math.floor(TOD * 24), mm = Math.floor((TOD * 24 % 1) * 60);
    const wetTxt = squallNow() ? 'squall' : WX.rain > 0.15 ? 'raining'
                 : WX.wet > 0.25 ? 'wet' : WX.wet > 0.05 ? 'drying' : 'dry';
    cl.textContent = ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) +
      '  ' + todName() + '  \u00b7  ' + wetTxt;
  }
}

/* ================================================================= input === */
const keys = {};
addEventListener('keydown', function(e){
  keys[e.key.toLowerCase()] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(e.key.toLowerCase()) >= 0)
    e.preventDefault();
});
addEventListener('keyup', function(e){ keys[e.key.toLowerCase()] = false; });
let auto = true;
function readInput(){
  if (auto) return;
  const lt = keys['arrowleft'] || keys['a'], rt = keys['arrowright'] || keys['d'];
  CTL.steer = (lt ? 1 : 0) - (rt ? 1 : 0);
  const up = keys['arrowup'] || keys['w'], dn = keys['arrowdown'] || keys['s'];
  CTL.hb = keys[' '] ? 1 : 0;
  if (keys['shift']){ CTL.rev = up || dn ? 1 : 0; CTL.thr = 0; CTL.brk = 0; }
  else { CTL.rev = 0; CTL.thr = up ? 1 : 0; CTL.brk = dn ? 1 : 0; }
}

let acc = 0, last = 0;
