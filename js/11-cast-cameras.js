/* Tesco Trueno - 11-cast-cameras.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ================================================================ cast =====
   The sprites the editor writes, parsed and given something to want.

   They arrive through a <script type="text/plain"> block rather than a fetch,
   because Chrome will not let a file:// page read a sibling file - so the loop
   from sprite-editor.html to here runs through build_cast.py. Face overrides,
   mesh and glass are dropped: 23 boxes of 260 use them and the box renderer
   takes one colour. */
const TONE_DEFAULT = { paint:'#8e9398', skin:'#c2a08a', hair:'#3a3735' };
function parseCast(txt){
  /* v2 (2026-10-12): `size`, `anchor`, `part`/`endpart`, and `paint` as a
     colour. v1 files parse unchanged. */
  const out = {};
  let sp = null, st = null, part = null;
  for (const raw of txt.split('\n')){
    let t = raw.trim();
    if (!t || t.charAt(0) === '#') continue;
    const sc = t.indexOf(';');
    if (sc >= 0) t = t.slice(0, sc).trim();
    if (!t) continue;
    const w = t.split(/\s+/);
    if (w[0] === 'sprite'){
      sp = { name:w[1], mass:1, states:{}, order:[], anchors:{}, size:null, parts:{} };
      out[w[1]] = sp; st = null; part = null;
    } else if (w[0] === 'mass' && sp){
      sp.mass = parseFloat(w[1]);
    } else if (w[0] === 'size' && sp){
      sp.size = { L:+w[1], W:+w[2], H:+w[3] };
    } else if (w[0] === 'anchor' && sp){
      sp.anchors[w[1]] = { f:+w[2], l:+w[3], z:+w[4] };
    } else if (w[0] === 'state' && sp){
      st = []; sp.states[w[1]] = st; sp.order.push(w[1]); part = null;
    } else if (w[0] === 'part' && sp){
      part = w[1];
      sp.parts[part] = { f:+w[2] || 0, l:+w[3] || 0, z:+w[4] || 0 };
    } else if (w[0] === 'endpart'){
      part = null;
    } else if (w[0] === 'box' && st){
      const col = w[7];
      if (col === 'none') continue;
      let mir = false, rot = 0, lit = 0, nm = '';
      for (let i = 8; i < w.length; i++){
        const kv = w[i].split('=');
        if (kv[0] === 'n') nm = kv[1] || '';
        else if (kv[0] === 'mir') mir = kv[1] === '1';
        else if (kv[0] === 'rot') rot = parseFloat(kv[1]);
        /* lit=<0..1>: self-illuminated. Shading is skipped and the box holds
           its colour whatever the hour, so headlights read as headlights once
           there is a night palette to read them against. */
        else if (kv[0] === 'lit') lit = kv[1] === undefined ? 1 : parseFloat(kv[1]);
      }
      /* Named colours, filled in at draw time from whoever this is: `paint`
         (a car's paint, an umbrella), `skin` and `hair` (a person's own).
         `name:k` is that colour darkened to k. TONE_DEFAULT stands in when
         nothing has been chosen. */
      const tn = col.split(':')[0];
      const tone = TONE_DEFAULT[tn] ? tn : null;
      const toneK = tone && col.indexOf(':') > 0 ? (parseFloat(col.split(':')[1]) || 1) : 1;
      const paint = tone === 'paint', paintK = toneK;
      const hex = tone ? TONE_DEFAULT[tone] : col.length > 7 ? col.slice(0, 7) : col;   // drop any alpha
      for (const sg of (mir ? [1, -1] : [1]))
        st.push({ f:+w[1], l:(+w[2]) * sg, z:+w[3], L:+w[4], W:+w[5], H:+w[6],
                  rot:rot * sg, col:hex, lit:lit, paint:paint, paintK:paintK, tone:tone, toneK:toneK,
                  part:part, n:nm });
    }
  }
  return out;
}
/* The sprite files (sprites/*.sprite.js) each push their text onto
   SPRITE_SOURCES as they load, ahead of the code. */
const CAST = parseCast((window.SPRITE_SOURCES || []).join('\n'));
/* Draw-list items for a sprite standing at (x, y) facing h, its base at z.
   o.state picks a state (default the first), o.paint fills `paint` boxes,
   o.cid tags the items, and o.each(box, item) may adjust any item - the
   recovery truck flashes its beacons through it. */
function spriteItems(name, x, y, h, z, o){
  const sp = CAST[name];
  if (!sp) return [];
  const st = (o && o.state && sp.states[o.state]) || sp.states[sp.order[0]];
  if (!st) return [];
  const ch = Math.cos(h), sh = Math.sin(h), out = [];
  for (const q of st){
    const it = { cid:o ? o.cid : undefined, lit:q.lit,
                 X:x + q.f * ch - q.l * sh, Y:y + q.f * sh + q.l * ch,
                 L:q.L, W:q.W, rot:h + q.rot, z0:z + q.z, z1:z + q.z + q.H,
                 col:toneCol(q, o && (o.tones || (o.paint ? { paint:o.paint } : null))) };
    if (o && o.each) o.each(q, it);
    out.push(it);
  }
  return out;
}
/* A box's colour for this particular owner: its named tone if it has one and
   the owner has that tone, else what the sprite says. */
function toneCol(q, tones){
  if (q.tone && tones && tones[q.tone]) return tint(tones[q.tone], q.toneK);
  if (q.tone) return tint(TONE_DEFAULT[q.tone], q.toneK);
  return q.col;
}
/* `paint:0.75` - the paint colour scaled toward black. */
function tint(hex, k){
  if (k === 1 || !hex || hex.charAt(0) !== '#') return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  const c = function(v){ return ('0' + Math.max(0, Math.min(255, Math.round(v * k))).toString(16)).slice(-2); };
  return '#' + c(n >> 16 & 255) + c(n >> 8 & 255) + c(n & 255);
}
/* A named anchor of a sprite, in its own frame, or null. */
function anchorOf(name, a){
  const sp = CAST[name];
  return (sp && sp.anchors[a]) || null;
}
/* An anchor placed in the world for a sprite at (x, y) facing h. */
function anchorAt(name, a, x, y, h){
  const q = anchorOf(name, a);
  if (!q) return null;
  const ch = Math.cos(h), sh = Math.sin(h);
  return [x + q.f * ch - q.l * sh, y + q.f * sh + q.l * ch, q.z];
}

/* ------------------------------------------------------------- the beings ---
   Each one is a position, a heading, a sprite state and a want. No planning and
   no learning yet - that is the last milestone - but enough that the car park
   has weather of its own for Trueno to drive through. */
const BEINGS = [];
/* An accelerated clock rather than a real-time one - twenty minutes to the day,
   so a watcher sees a whole cycle in a sitting and the night is not something
   that only happens while you are asleep. Still your call; DAY_SECS is the
   whole of the decision. */
const DAY_SECS = 1200;
let TOD = 0.35;                    // 0..1 through the day
function isNight(){ return TOD > 0.80 || TOD < 0.16; }
/* Light, as a number that moves. Dawn and dusk take a twentieth of the day
   each rather than happening between one frame and the next - the renderer can
   read this whenever it grows a night palette, and the behaviours read it now
   so the changeover is gradual for THEM too. 0 is fully dark, 1 full daylight. */
function daylight(){
  const t = TOD;
  if (t >= 0.26 && t <= 0.76) return 1;
  if (t > 0.76 && t < 0.86) return 1 - (t - 0.76) / 0.10;   // dusk
  if (t > 0.16 && t < 0.26) return (t - 0.16) / 0.10;       // dawn
  return 0;
}
function todName(){
  if (TOD < 0.16) return 'small hours';
  if (TOD < 0.30) return 'early morning';
  if (TOD < 0.46) return 'mid morning';
  if (TOD < 0.60) return 'lunchtime';
  if (TOD < 0.74) return 'afternoon';
  if (TOD < 0.80) return 'closing time';
  if (TOD < 0.90) return 'evening';
  return 'night';
}
/* Who is about, and when. The grannies go home, and that is the whole point:
   an empty car park is the only place he can actually drive. */
/* Hours are a GUIDELINE. Every being carries a personal offset, so five
   grannies do not turn on their heel at the same instant, and the offsets are
   re-rolled each day so no two days run the same. A schedule that repeats
   exactly is a timetable; this is a car park. */
function shiftEdge(b, lo, hi){
  const j = b.jitter || 0;
  return TOD > lo + j * 0.6 && TOD < hi + j;
}
/* Shoppers and grannies are customers and get the whole visit. The Manager and
   Trolleyboy work here, so they keep the shift routine they always had - they
   arrive, do their job, and go home, and they are emphatically not browsing the
   bakery aisle. Gulls and the fox are wildlife. */
function hasLife(b){ return b.kind === 'shopper' || b.kind === 'granny'; }

/* Where a person STANDS next to a parked car - out in the aisle beside it, not
   on top of it. I first stored the remembered spot as the car's own box centre,
   which is a point inside a solid object: walkTo deflects around anything solid
   ahead of it, so forty-two shoppers spent four hundred seconds orbiting their
   own cars and never arriving. The old code had a milder version of the same
   confusion - `bay.x + bay.toAisle * 1.4` - putting them along the row rather
   than out into the aisle, because toAisle is a sign on Y and that applied it
   to X. */
/* =========================================================== the CCTV view ===
   Four cameras on the real site, same locked isometric angle, each panning,
   tilting and zooming on its own. The angle is deliberately NOT changed: the
   projection is the one thing in this file everything else is built on, and a
   quad view that needed a second projection would be a different program. What
   makes it read as CCTV is not the geometry, it is the motion and the grade.

   THE MOTION IS THE POINT. Thomas asked for a badly tuned PID on a stepper
   head, so the cameras are not interpolated toward their targets - they are
   driven, by a controller with four honest faults:

     underdamped   kd is about a quarter of what it wants to be, so every move
                   overshoots by a third and rings two or three times
     integral      a windup term with a limit, which is what makes it creep up
                   on the last half metre instead of simply arriving
     finite motor  the commanded acceleration is clamped, and then the
                   velocity is clamped, so it winds up to speed over half a
                   second and winds down again - the motion is smooth, and only
                   the AIM is bad

   Which is the distinction worth getting right: a badly tuned head is not a
   jerky head. It accelerates and decelerates perfectly pleasantly and simply
   cannot stop where it meant to. The ugliness is all in the damping, which is
   why it looks like a mechanism rather than an effect.

   The axes are the PROJECTED coordinates, not the world ones, because that is
   what the motors actually move: pan is screen-x, tilt is screen-y, and in this
   locked projection those are a fixed linear map off the ground plane. */
const CCTV = { on:false, cams:[], t:0, day:0, lastTod:0, godI:-1, godT:0 };

function projAt(x, y){
  const q = P(x, y);
  return [q[0] - q[1], (q[0] + q[1]) * 0.5];
}

/* Pan and tilt share a gain set; zoom gets its own, slacker and lazier, because
   a real zoom is the slowest axis on the head.

   UNDERDAMPED, NOT NOTCHY, and the difference matters. I built the stepper
   literally first - the error quantised to whole steps the way a real encoder
   reads it, and a stiction threshold the proportional term could not break on
   its own - and what that gives you is a head that judders between two steps
   and creeps up on the last half metre in lurches. Which is accurate, and not
   what was wanted. Thomas wanted the opposite: smooth through the acceleration
   and the deceleration, and badly damped only in that it sails past the mark
   and has to come back for it.
   So the quantisation and the stiction are gone, the controller reads its true
   position, and everything that makes the motion ugly is now in the damping
   alone.

   kd 1.9 against kp 9 is a damping ratio of 0.32, where a tuned head would be
   about 6. Traced at 120 Hz, target 25 metres, sampled every 0.1 s:

     0 0.3 1.1 2.5 4.5 7 9.9 12.9      accelerating, limited by amax, not by a
                                        gain - which is why it is smooth
     ... 24.6 26.8 28.5 29.7 30.3 30.4  sails 22% past the mark
     30.0 29.3 28.4 27.3 26.2 25.3 ...  and comes back for it
     24.4 23.8 23.4 23.1 23.1 23.2      a little too far back
     23.5 23.8 24.2 ... 25.6 25.7       and a second, smaller nip
     ... 24.8                           settled, about four seconds

   Overshoot runs 11% on a fifty metre slew and 35% on a short one, which is the
   right way round: a long move spends most of its time at the slew limit, so
   there is less stored energy to overshoot with when it arrives.

   `amax` is what keeps it smooth. Without it the proportional term at the start
   of a fifty metre move commands 450 m/s-squared and the head snaps to full
   slew in 80 ms, which reads as a cut rather than a pan. Clamping the
   commanded acceleration gives it a little over half a second to wind up to
   speed, and the controller shapes everything after that. */
const PAX = { kp:9.0, ki:0, kd:1.9, slew:30, amax:55, dead:0.25, vmin:0.35,
              imax:1.2 };
const ZAX = { kp:9.0, ki:0, kd:1.6, slew:0.75, amax:1.4, dead:0.008,
              vmin:0.011, imax:0.1 };

function stepAxis(a, want, ax, dt, sloppy){
  const e = want - a.p;
  if (Math.abs(e) < ax.dead && Math.abs(a.v) < ax.vmin){
    /* Parked. Nothing is holding it anywhere, so it simply coasts to a stop. */
    a.i = 0;
    a.v *= Math.max(0, 1 - 9 * dt);
    a.p += a.v * dt;
    return;
  }
  a.i = Math.max(-ax.imax, Math.min(ax.imax, a.i + e * dt));
  /* A finite motor: the commanded acceleration is clamped before it becomes
     velocity, and the velocity is clamped before it becomes movement. Two
     limits, and between them they are the whole of the smoothness.
     `sloppy` scales kp only, which raises the natural frequency AND lowers the
     damping ratio - so camera four, at 1.75, is quicker off the mark and
     noticeably worse at stopping. One number per head, and they all behave
     like different ages of the same unit. */
  let u = ax.kp * sloppy * e + ax.ki * sloppy * a.i - ax.kd * a.v;
  u = Math.max(-ax.amax, Math.min(ax.amax, u));
  a.v = Math.max(-ax.slew, Math.min(ax.slew, a.v + u * dt));
  a.p += a.v * dt;
}

/* Where each camera looks when there is nothing worth looking at - which is
   most of a Tuesday morning, and is also what a real one does. */
const CCTV_HOME = [null, [X1 - 24, 14], [X0 + 16, 24], [X0 + 88, 58]];

function cctvReset(){
  CCTV.cams.length = 0;
  for (let i = 0; i < 4; i++){
    const home = CCTV_HOME[i] || [car.x, car.y];
    const q = projAt(home[0], home[1]);
    CCTV.cams.push({
      i:i,
      pan:{ p:q[0], v:0, i:0 }, tilt:{ p:q[1], v:0, i:0 },
      zl:{ p:0.3, v:0, i:0 },
      tx:home[0], ty:home[1], tzl:0.3, score:0,
      homeX:home[0], homeY:home[1],
      dwell:0, label:'',
      /* Each head is a different age and a different bodge. Four is the one
         somebody has been meaning to replace. */
      godZl:0.5,
      sloppy:[1.0, 1.3, 0.85, 1.75][i],
      roll:[0.006, -0.011, 0.004, -0.016][i]
    });
  }
}

/* Naming the shot. A label that says ROW B rather than (94, 41) is the
   difference between a readout and a debug print, and the zones are the ones
   the site is actually built out of. */
function zoneName(x, y){
  if (x > X1 + 2) return 'LOADING DOCK';
  if (x < X0 + 8) return 'ENTRANCE';
  if (x > X1 - 34 && y < 14) return 'STORE DOORS';
  if (Math.abs(x - PVX) < 9 && y < 16) return 'PAVILION';
  if (y < Y0 + WALK_W) return 'COVERED WALKWAY';
  if (y < Y0 + WALK_W + PRIME_W) return 'PRIME ROW';
  if (y < BAND0) return 'PRIME AISLE';
  if (y < ISLAND_Y - ISLAND_W / 2){
    const b = Math.floor((y - BAND0) / BAND);
    return 'ROW ' + 'ABCDEF'.charAt(Math.max(0, Math.min(5, b)));
  }
  if (y < ISLAND_Y + ISLAND_W / 2 + 1.5) return 'TROLLEY BAY';
  return 'SERVICE ROAD';
}

/* Shot selection, and the only interesting decision in it is the DWELL FLOOR.
   The excitementometer is recomputed four times a second and its peaks wander;
   a camera that re-picked the best one every quarter second would never settle,
   and watching the head settle is the entire point. So each camera tracks the
   peak nearest where it is ALREADY looking, and re-tasks only when it has had
   its nine seconds or its subject has gone.
   Camera one is Trueno's and stays Trueno's. He is only actually moving about
   an eighth of the time, so for most of the day it is a shot of a parked panda
   AE86 - which is either the flaw in the idea or the best thing about it. */
/* ------------------------------------------------------- following Trueno ---
   The third view, and the easy one, because the quad view already built
   everything it needs: an axis integrator, limit stops, and the fact that the
   whole projection is three globals.

   It is the same `stepAxis` as the CCTV heads with the damping put RIGHT, which
   is the nicest thing about having written the bad version first. kd 4.6 against
   kp 7 is a damping ratio of 0.87, so it settles without overshooting and the
   picture does not ring every time he turns. The CCTV heads are 0.32 and lurch;
   same code, one number.

   Two things make a follow camera watchable rather than queasy:
     - it aims where he is GOING, not where he is. Three quarters of a second of
       lead, so the frame is already looking down the aisle he is entering.
     - it pulls back as he speeds up. At a crawl you want to see the bay he is
       inching into; at 30 mph you want to see what he is about to arrive at.
   And no frame margin on the stops, unlike a security camera: a chase camera
   that refused to follow him into the west end because the shot would include
   some off-site grass would be a chase camera that loses him. */
const TCAM = { pan:{ p:0, v:0, i:0 }, tilt:{ p:0, v:0, i:0 },
               zl:{ p:1.3, v:0, i:0 }, bias:0 };
const TAX = { kp:7.0, ki:0, kd:4.6, slew:70, amax:170, dead:0.04,
              vmin:0.05, imax:0 };
const TZX = { kp:5.0, ki:0, kd:4.0, slew:1.1, amax:3.2, dead:0.01,
              vmin:0.01, imax:0 };

function truenoCamReset(){
  const q = projAt(car.x, car.y);
  TCAM.pan.p = q[0]; TCAM.tilt.p = q[1];
  TCAM.pan.v = TCAM.tilt.v = TCAM.zl.v = 0;
  TCAM.pan.i = TCAM.tilt.i = TCAM.zl.i = 0;
}

function stepTruenoCam(dt){
  if (!isFinite(TCAM.pan.p) || !isFinite(TCAM.tilt.p)) truenoCamReset();
  const spd = Math.hypot(car.vx, car.vy);
  const lead = 0.75;
  const ax = stopAt(car.x + car.vx * lead, AIMBOX.x0, AIMBOX.x1);
  const ay = stopAt(car.y + car.vy * lead, AIMBOX.y0, AIMBOX.y1);
  const q = projAt(ax, ay);
  /* Magnification over the whole-site fit, so it means the same thing in any
     window: about 2.5x pottering, 1.7x at speed, and the wheel biases both. */
  const want = Math.max(0.1, Math.min(2.6,
    1.32 - 0.55 * Math.min(1, spd / 12) + TCAM.bias));
  let left = Math.min(0.25, dt);
  while (left > 0){
    const h = Math.min(1 / 120, left);
    stepAxis(TCAM.pan, q[0], TAX, h, 1);
    stepAxis(TCAM.tilt, q[1], TAX, h, 1);
    stepAxis(TCAM.zl, want, TZX, h, 1);
    left -= h;
  }
  /* Put the aim at the centre of the frame. SX adds the canvas centre itself,
     so cancelling it is simply a pan of -px*K; the 18 is the same clearance for
     the button bar that applyZoom uses. */
  K = Kfit * Math.pow(2, TCAM.zl.p);
  panX = -TCAM.pan.p * K;
  panY = -TCAM.tilt.p * K + 18;
}

/* ----------------------------------------- a monitor the god is working in ---
   Click something liftable in a quadrant and THAT QUADRANT becomes the god's
   window: the camera stops taking shots, pulls back a notch so you can see
   where you are putting things, and then HOLDS STILL. Which is the part that
   matters. A camera that tracked the object would mean the object never appears
   to move and the car park slides about behind it, and dragging a car fifty
   metres would feel like dragging nothing at all.
   So the view is static while the object moves about inside it, and the camera
   only intervenes when the object gets near the edge - at which point it pans
   to bring it back toward the middle, faster the closer to the edge it gets.
   That is what makes a small window enough to move a car a long way: you shove
   it at the edge, the world scrolls under it, you ease off and it stops.

   The nudge is a RATE, not a target. Re-aiming the camera AT the object the
   moment it crossed the line would hand the move to the underdamped head, and
   it would overshoot and ring its way across the car park while you were trying
   to steer - seasick. A rate that ramps with how far into the band the object
   is gives you a throttle instead, and the head still smooths it because the
   rate drives the aim and the aim drives the head. Squared, so the band's inner
   edge is a gentle creep and its outer edge shifts. */
const GQ_BAND = 0.40;      // the outer 30% of the frame, measured from centre
/* Measured rather than guessed: the scroll comes out at RATE/2 frame-widths a
   second at the very edge, less a little lag while the head catches the moving
   aim. 0.6 gave 24% of a frame a second - four seconds to cross one, which is
   not "a long way". 1.3 gives about half a frame a second, so you cross the
   shot in two and the whole car park in about eight. It reads as scale-free
   because it is: the rate is a fraction of the FRAME, so it feels the same
   whatever the camera is zoomed to. */
const GQ_RATE = 1.30;      // frame-widths a second at the very edge
function godQuad(cam, dt, qs){
  const o = HAND.grabbed;
  cam.label = 'GOD MODE / ' + zoneName(HAND.x, HAND.y);
  cam.score = 0;
  cam.dwell = 0;
  cam.tzl = cam.godZl === undefined ? 0.5 : cam.godZl;
  if (!o) return;
  const kk = (qs[0] / 100) * Math.pow(2, cam.zl.p);
  const halfX = (qs[0] / 2) / kk, halfY = (qs[1] / 2) / kk;
  const q = projAt(HAND.x, HAND.y);
  /* The object is held at carry height, and SY subtracts z, so its position in
     the frame is up the screen from its position on the ground. Small against a
     fifty unit half-frame, but it is the drawn position the eye is judging the
     edge against, so it is the drawn position the band has to use. */
  const oz = (o.lift || 0) + (o.z || 0);
  const fx = (q[0] - cam.pan.p) / halfX;
  const fy = ((q[1] - oz * 0.78) - cam.tilt.p) / halfY;
  const comp = function(f, half){
    const a = Math.abs(f);
    if (a <= GQ_BAND) return 0;
    const ex = Math.min(1, (a - GQ_BAND) / (1 - GQ_BAND));
    return (f < 0 ? -1 : 1) * ex * ex * GQ_RATE * half;
  };
  const npx = comp(fx, halfX) * dt, npy = comp(fy, halfY) * dt;
  if (!npx && !npy) return;                      // inside the band: dead still
  /* Back out of the projection, because the aim downstream is in world
     coordinates and so are its limit stops:
       px = -dx - dy  and  2 py = dy - dx  give
       dx = -(px + 2 py)/2  and  dy = (2 py - px)/2                        */
  cam.tx += -(npx + 2 * npy) / 2;
  cam.ty += (2 * npy - npx) / 2;
}

function cctvAim(dt){
  const hot = EXC_HOT || [];
  const cams = CCTV.cams;
  const qs = quadSize();
  /* The god's monitor is excused from shot selection entirely - including
     camera one, which otherwise belongs to Trueno whatever else is going on. */
  if (CCTV.godI >= 0 && cams[CCTV.godI]){
    godQuad(cams[CCTV.godI], dt, qs);
    CCTV.godT = HAND.grabbed ? 0 : CCTV.godT + dt;
    /* A couple of seconds after letting go, so you see where the thing landed
       before the camera goes back to work. */
    if (!HAND.on || CCTV.godT > 2.5) CCTV.godI = -1;
  }
  const c0 = cams[0];
  if (CCTV.godI !== 0){
    c0.tx = car.x; c0.ty = car.y;
    c0.label = 'TRUENO / ' + zoneName(car.x, car.y);
    const spd = Math.hypot(car.vx, car.vy);
    c0.tzl = (car.held || car.airborne) ? 1.5 : spd > 4 ? 1.05 : 1.6;
  }
  for (let i = 1; i < 4; i++){
    if (i === CCTV.godI) continue;
    const cam = cams[i];
    cam.dwell += dt;
    /* Nobody else's shot. Without this all three of them ended up on the
       prime aisle at once - which is where most of the interest genuinely is,
       so each camera was right and the wall of monitors was useless. A quad
       view's job is four DIFFERENT things, so a peak another camera is already
       within thirty metres of is not available. */
    const free = function(h){
      for (let j = 0; j < 4; j++){
        if (j === i) continue;
        if (Math.hypot(h.x - cams[j].tx, h.y - cams[j].ty) < 30) return false;
      }
      return true;
    };
    let near = null, nd = 20;
    for (const h of hot){
      if (!free(h)) continue;
      const d = Math.hypot(h.x - cam.tx, h.y - cam.ty);
      if (d < nd){ nd = d; near = h; }
    }
    if (near){ cam.tx = near.x; cam.ty = near.y; cam.score = near.v; }
    if (cam.dwell > 9 || !near){
      let pick = null;
      for (const h of hot) if (free(h)){ pick = h; break; }
      if (pick && Math.hypot(pick.x - cam.tx, pick.y - cam.ty) > 6){
        cam.tx = pick.x; cam.ty = pick.y; cam.score = pick.v; cam.dwell = 0;
      } else if (!near){
        /* Nothing of its own to watch, so back to its standing view - which is
           what a real one does between events, and it also keeps the four
           shots spread across the site instead of stacked up. */
        cam.tx = cam.homeX; cam.ty = cam.homeY; cam.score = 0; cam.dwell = 0;
      }
    }
    cam.tzl = cam.score > 0 ? 0.75 + 0.95 * Math.min(1, cam.score / 70) : 0.25;
    cam.label = zoneName(cam.tx, cam.ty);
  }
}

/* The quadrant, in CSS pixels. Needed in three places now - the limit stops,
   the god's monitor and the drawing - and they have to agree or the limits stop
   the wrong thing.
   FLOORED AT 1, and that is not defensive decoration. A hidden pane reports
   cv.width 0, which gave [0, -20]: a zero scale, a limit margin of Infinity,
   and `stopAt(v, Infinity, -Infinity)` returning Infinity + -Infinity over two,
   which is NaN. That NaN went straight into the integrator and stayed there,
   because NaN propagates - so hiding the window once killed every camera head
   permanently, and they did not come back when it reappeared. A thing built to
   run for days cannot have a state it cannot leave. */
function quadSize(){
  const d = dpr();
  return [Math.max(1, Math.floor((cv.width / d) / 2)),
          Math.max(1, Math.floor(((cv.height / d) - 40) / 2))];
}

/* Limit stops. A real head has them, and without them camera one followed
   Trueno down to the entrance and framed sixty percent black void off the west
   end of the site, which reads as a bug rather than as a camera.
   IN WORLD COORDINATES, which took two goes. I clamped the projected pan and
   tilt first, against the bounding box of the site's four projected corners -
   and it never fired, because the site rectangle projects to a PARALLELOGRAM
   and its bounding box is nearly twice the area. A point sixty metres off the
   west end sits comfortably inside that box. The diagonals are exactly the
   case the void appears in, so the bounding box lets through the only thing it
   was there to stop.
   The site IS a rectangle in world coordinates, so the clamp belongs there.
   A little wider than the bays on purpose: the service road and the loading
   dock are both worth watching. */
/* The east edge reaches past the dock rather than up to it, so that the artic
   reversing onto the roller door can be CENTRED when a camera is zoomed in on
   it - which is the best set piece on the site and worth a stop of its own. It
   costs nothing at wide angle because the margin below scales with the frame:
   at 1x the same box only lets the aim out to 200. */
const AIMBOX = { x0:X0 - 2, x1:X1 + 34, y0:Y0 - 2, y1:Y1 + 4 };
/* A frame wider than its own limits is CENTRED rather than jammed against one
   stop, which is what a wide shot of a narrow site should do - and at 1x a
   quadrant sees more than this car park is deep, so this is the normal case
   vertically rather than an edge case. */
function stopAt(v, lo, hi){
  /* Not finite means the scale was nonsense, so decline to have an opinion
     rather than returning one that poisons the integrator. */
  if (!isFinite(lo) || !isFinite(hi)) return v;
  if (hi < lo) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}
/* How far inside the box the aim has to stay for the frame to stay on site.
   The frame is w by h pixels, so W = w/K by H = h/K in projected units, and
   inverting the projection
       px = -dx - dy        dy - dx = 2 py
   gives dx = -(px + 2 py)/2 and dy = (2 py - px)/2, both of which peak at
   (W + 2H)/4 over the frame's corners. One margin, both axes. */
function aimStop(cam, qs, loose){
  /* The god's monitor gets the stops WITHOUT the frame margin, and that is a
     deliberate difference rather than an oversight. The margin exists so a
     security camera never frames empty void - but at a wide zoom it is nearly
     thirty metres, which put the whole western third of the site, the entrance
     included, out of reach. A god dragging a car to the far corner and finding
     he cannot is worse than a bit of overhang at the edge of the world, and a
     camera chasing a hand is not a security camera any more anyway.
     It showed up in the trace as the scroll rate FALLING at the very edge -
     33% of a frame a second at nine tenths out, 27% at the edge - which is the
     signature of a clamp biting, not of a ramp. */
  const kk = (qs[0] / 100) * Math.pow(2, cam.zl.p);
  const m = loose ? 0 : ((qs[0] / kk) + 2 * (qs[1] / kk)) / 4;
  return [stopAt(cam.tx, AIMBOX.x0 + m, AIMBOX.x1 - m),
          stopAt(cam.ty, AIMBOX.y0 + m, AIMBOX.y1 - m)];
}

function stepCCTV(dt){
  if (!CCTV.cams.length) cctvReset();
  if (!(cv.width > 8)) return;        // no canvas, nothing to aim at
  /* And the way back out. One bad frame used to be permanent; now any axis that
     has gone non-finite is put back where it was pointing and carries on. */
  for (const cam of CCTV.cams){
    for (const a of [cam.pan, cam.tilt, cam.zl]){
      if (!isFinite(a.p) || !isFinite(a.v) || !isFinite(a.i)){
        const q = projAt(cam.tx, cam.ty);
        cam.pan.p = q[0]; cam.tilt.p = q[1]; cam.zl.p = cam.tzl || 0.3;
        cam.pan.v = cam.tilt.v = cam.zl.v = 0;
        cam.pan.i = cam.tilt.i = cam.zl.i = 0;
        break;
      }
    }
  }
  CCTV.t += dt;
  if (TOD < CCTV.lastTod - 0.5) CCTV.day++;
  CCTV.lastTod = TOD;
  cctvAim(dt);
  /* Fixed sub-steps, because a controller this underdamped is not stable at a
     frame time that wanders between 8 and 40 ms - it would ring differently
     depending on how busy the car park was, which is a bug dressed up as a
     feature. */
  const qs = quadSize();
  let left = Math.min(0.25, dt);
  while (left > 0){
    const h = Math.min(1 / 120, left);
    for (const cam of CCTV.cams){
      const aim = aimStop(cam, qs, cam.i === CCTV.godI);
      const q = projAt(aim[0], aim[1]);
      stepAxis(cam.pan, q[0], PAX, h, cam.sloppy);
      stepAxis(cam.tilt, q[1], PAX, h, cam.sloppy);
      stepAxis(cam.zl, cam.tzl, ZAX, h, cam.sloppy);
    }
    left -= h;
  }
}

/* A shaft of light, because a car rising off the tarmac under its own steam
   wants a reason. Vertical in world terms, which in this projection is vertical
   on screen too - SX does not depend on z at all - so the whole thing is one
   trapezoid and a squashed ellipse on the ground, drawn additively over the
   finished frame. In the quad view it goes in BEFORE the grade, so the beam is
   washed out and scanlined along with everything else: a light in the car park
   that the cameras happen to see, rather than a graphic laid on top of them.
   Drawn in every view that can see it, for the same reason. */
function drawBeam(){
  const o = HAND.grabbed;
  if (!o) return;
  const q = P(HAND.x, HAND.y);
  const sx = SX(q), sy0 = SY(q, 0), sy1 = SY(q, 26);
  const wB = 2.4 * K, wT = 7.0 * K;
  g2.save();
  g2.globalCompositeOperation = 'lighter';
  const gr = g2.createLinearGradient(0, sy1, 0, sy0);
  gr.addColorStop(0, 'rgba(255,246,214,0)');
  gr.addColorStop(0.4, 'rgba(255,244,206,0.045)');
  gr.addColorStop(1, 'rgba(255,238,192,0.15)');
  g2.fillStyle = gr;
  g2.beginPath();
  g2.moveTo(sx - wT, sy1); g2.lineTo(sx + wT, sy1);
  g2.lineTo(sx + wB, sy0); g2.lineTo(sx - wB, sy0);
  g2.closePath(); g2.fill();
  const r = 3.6 * K;
  const gp = g2.createRadialGradient(sx, sy0, 0, sx, sy0, r);
  gp.addColorStop(0, 'rgba(255,244,206,0.26)');
  gp.addColorStop(1, 'rgba(255,238,192,0)');
  g2.fillStyle = gp;
  g2.beginPath(); g2.ellipse(sx, sy0, r, r * 0.5, 0, 0, 6.2832); g2.fill();
  g2.restore();
}

/* -------------------------------------------------------------- the grade --- */
let SCAN = null;
function scanPattern(){
  if (SCAN) return SCAN;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 3;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(0, 0, 1, 1);
  SCAN = g2.createPattern(c, 'repeat');
  return SCAN;
}

function cctvSkin(cam, vx, vy, vw, vh){
  const cx = vx + vw / 2, cy = vy + vh / 2;
  const dayK = daylight(), ir = 1 - dayK;
  /* Washed out, because every car park camera is, and nearly monochrome at
     night because at night it is an infra-red camera and there is nothing else
     it can be.
     'color' is the blend that does this in one fill: it imposes the SOURCE's
     hue and saturation on the destination and keeps the destination's
     luminosity, so filling with a desaturated green at alpha a drags the whole
     quadrant a-of-the-way toward grey-green without touching the lighting. No
     pixel loop, no getImageData, no readback stall.
     I had 'saturation' here first, which sets the destination's saturation TO
     the source's - and tarmac is nearly grey, so a 26% source pushed it UP.
     The first quad view came out in vivid teal, which is the exact opposite of
     the washed-out look I was asking for. */
  g2.save();
  g2.globalCompositeOperation = 'color';
  g2.globalAlpha = 0.52 + 0.38 * ir;
  g2.fillStyle = ir > 0.5 ? 'hsl(138,13%,50%)' : 'hsl(196,9%,50%)';
  g2.fillRect(vx, vy, vw, vh);
  g2.restore();
  /* A touch of lift in the blacks, which is what a cheap sensor with its gain
     up actually does - it never gives you true black. */
  g2.save();
  g2.globalCompositeOperation = 'lighter';
  g2.fillStyle = 'rgba(96,112,104,' + (0.045 + 0.03 * ir).toFixed(3) + ')';
  g2.fillRect(vx, vy, vw, vh);
  g2.restore();
  /* Scanlines, as a 1x3 pattern rather than a hundred fillRects. */
  g2.save();
  g2.translate(vx, vy);
  g2.fillStyle = scanPattern();
  g2.fillRect(0, 0, vw, vh);
  g2.restore();
  /* The tracking band: one pale stripe crawling down the frame. Cheapest thing
     on this list and the one that most says 'recorded'. */
  const bandY = vy + ((CCTV.t * 26 + cam.i * 83) % (vh + 70)) - 35;
  g2.save();
  g2.globalCompositeOperation = 'lighter';
  const bg = g2.createLinearGradient(0, bandY, 0, bandY + 11);
  bg.addColorStop(0, 'rgba(190,214,200,0)');
  bg.addColorStop(0.5, 'rgba(190,214,200,0.055)');
  bg.addColorStop(1, 'rgba(190,214,200,0)');
  g2.fillStyle = bg;
  g2.fillRect(vx, bandY, vw, 11);
  g2.restore();
  /* Vignette. Cheap lens, no shade, and it hides the clip edges as well. */
  const vg = g2.createRadialGradient(cx, cy, Math.min(vw, vh) * 0.20,
                                     cx, cy, Math.max(vw, vh) * 0.64);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.65, 'rgba(0,0,0,0.18)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  g2.fillStyle = vg;
  g2.fillRect(vx, vy, vw, vh);

  /* ---- the furniture */
  g2.strokeStyle = '#0a0c0e'; g2.lineWidth = 2;
  g2.strokeRect(vx + 1, vy + 1, vw - 2, vh - 2);
  g2.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  g2.textBaseline = 'top';
  const lab = function(txt, ax, ay, right, col){
    g2.textAlign = right ? 'right' : 'left';
    g2.lineWidth = 3; g2.strokeStyle = 'rgba(6,8,9,0.85)';
    g2.strokeText(txt, ax, ay);
    g2.fillStyle = col || 'rgba(222,232,226,0.88)';
    g2.fillText(txt, ax, ay);
  };
  const god = CCTV.godI === cam.i;
  lab('CAM ' + ('0' + (cam.i + 1)).slice(-2) + '   ' + cam.label, vx + 9, vy + 8,
      false, god ? 'rgba(255,232,170,0.95)' : null);
  const mag = Math.pow(2, cam.zl.p);
  lab(mag.toFixed(1) + '×', vx + vw - 9, vy + 8, true);
  g2.textBaseline = 'bottom';
  lab(cctvStamp(), vx + 9, vy + vh - 8);
  /* A slewing head is the one piece of state a real overlay actually shows you,
     so it says PTZ while it is moving and goes back to REC when it parks. */
  const mv = Math.hypot(cam.pan.v, cam.tilt.v) > 0.6 || Math.abs(cam.zl.v) > 0.08;
  if (mv) lab('PTZ', vx + vw - 9, vy + vh - 8, true, 'rgba(255,214,120,0.92)');
  else {
    g2.fillStyle = (CCTV.t % 2) < 1.2 ? 'rgba(214,76,64,0.92)'
                                      : 'rgba(214,76,64,0.22)';
    g2.beginPath(); g2.arc(vx + vw - 13, vy + vh - 12, 3.4, 0, 6.2832); g2.fill();
    lab('REC', vx + vw - 22, vy + vh - 8, true);
  }
  g2.textBaseline = 'alphabetic';
}

function cctvStamp(){
  const secs = TOD * 86400;
  const p2 = function(n){ return ('0' + n).slice(-2); };
  return p2(8 + CCTV.day) + '/10/2026  ' + p2(Math.floor(secs / 3600)) + ':' +
         p2(Math.floor(secs / 60) % 60) + ':' + p2(Math.floor(secs) % 60);
}

function drawCCTV(){
  const d = dpr(), top = 40;                   // clear of the button bar
  const qs = quadSize(), w2 = qs[0], h2 = qs[1];
  if (w2 < 40 || h2 < 40) return;
  g2.setTransform(1, 0, 0, 1, 0, 0);
  g2.fillStyle = '#07080a'; g2.fillRect(0, 0, cv.width, cv.height);
  QUAD = true;
  for (const cam of CCTV.cams){
    const vx = (cam.i % 2) * w2, vy = top + (cam.i >> 1) * h2;
    /* A quadrant this wide shows about a seventy metre square at 1x, which is
       most of one end of the car park, and about twenty at the top of the zoom,
       which is four bays and the car in them. */
    K = (w2 / 100) * Math.pow(2, cam.zl.p);
    panX = vx + w2 / 2 - cv.width / (2 * d) - cam.pan.p * K;
    panY = vy + h2 / 2 - cv.height / (2 * d) - cam.tilt.p * K;
    VIEW_ROLL = cam.roll; VIEW_CX = vx + w2 / 2; VIEW_CY = vy + h2 / 2;
    CLIP = { x0:vx - 8, y0:vy - 8, x1:vx + w2 + 8, y1:vy + h2 + 8 };
    g2.save();
    g2.setTransform(d, 0, 0, d, 0, 0);
    g2.beginPath(); g2.rect(vx, vy, w2, h2); g2.clip();
    render();
    drawBeam();
    g2.setTransform(d, 0, 0, d, 0, 0);      // the furniture is not wonky
    cctvSkin(cam, vx, vy, w2, h2);
    g2.restore();
  }
  QUAD = false; CLIP = null; VIEW_ROLL = 0;
  g2.setTransform(d, 0, 0, d, 0, 0);
  plain();
}

/* ======================================================== the excitementometer ===
   Where is the interesting thing happening? The whole sim already knows - it is
   just that the knowledge is scattered across a slip angle here, a jam timer
   there, a help job somewhere else. This gathers it into one number per patch of
   tarmac.

   A FIELD rather than a list of events, and that choice is what makes the
   readout easy: a coarse grid over the car park, every cell decaying toward
   zero, and anything interesting pouring weight into the cell it happens in.
   Clusters then form by themselves, because two things happening near each other
   land in the same cell or its neighbours - no clustering pass to write, no
   decisions about what counts as 'near'. And a decaying scalar field over a grid
   is exactly a barometric chart, so the cloud is the honest picture of it rather
   than a decoration on top.

   All the scoring lives in this one function, reading state and remembering last
   frame's values for the deltas. Nothing is scattered through the rest of the
   file: no `excite()` calls buried in the collision code, nothing to keep in step
   when a behaviour changes. If the weights are wrong they are all wrong in one
   place. */
const ECELL = 5;
const EX0 = X0 - 14, EY0 = Y0 - 6;
const EGW = Math.ceil(((X1 + 10) - EX0) / ECELL);
const EGH = Math.ceil(((Y1 + 6) - EY0) / ECELL);
const EXC = new Float32Array(EGW * EGH);
const EXB = new Float32Array(EGW * EGH);
const EXD = new Float32Array(EGW * EGH);   // the two the cloud blurs through
const EXE = new Float32Array(EGW * EGH);
const EM = {};                  // last frame, for the things measured as deltas
let EXC_ON = false;
let EXC_HOT = [];

function exciteAt(x, y, w){
  if (!(w > 0)) return;
  const i = Math.floor((x - EX0) / ECELL), j = Math.floor((y - EY0) / ECELL);
  if (i < 0 || j < 0 || i >= EGW || j >= EGH) return;
  EXC[j * EGW + i] += w;
}

function stepExcite(dt){
  /* Everything fades. Six seconds or so of half-life, which is long enough that
     a handbrake turn leaves a glow behind it and short enough that the cloud
     follows the action rather than painting a history of the whole day. */
  const k = Math.exp(-dt / 5.5);
  /* One cell is enough to check, and that is not laziness - it follows from
     `exciteAt` being the only writer. It rejects a non-finite weight (NaN > 0
     is false) and a non-finite coordinate cannot corrupt anything either,
     because a Float32Array silently discards a write to an invalid index. So
     the decay below is the ONLY route by which a non-finite value can reach the
     field, and it reaches every cell at once.
     Worth healing rather than just guarding, because this failure is silent:
     a poisoned field makes `hotspots` return nothing for ever, so the meter
     reads empty and all four cameras quietly go home, with no error anywhere
     to say why. */
  if (!isFinite(EXC[0])) EXC.fill(0);
  for (let i = 0; i < EXC.length; i++) EXC[i] *= k;

  /* --- Trueno, generously, because he is the protagonist and a viewer looking
     for something to watch almost always wants to be watching him. */
  /* A constant source settles at w x tau, so a per-second weight of 1 shows up
     on the cloud as about 5.5. Everything steady is therefore scored small and
     everything that HAPPENS is scored large, or the background drowns the
     events - which is exactly what went wrong first time round.

     And none of it counts unless he is actually moving. `driveSulk` pulls the
     handbrake on when he parks up to sit on TikTok, so scoring the handbrake
     unconditionally made a stationary sulking car the most exciting thing in the
     car park for most of a simulated day. That is the third time this file has
     been caught by the sulk parking brake pretending to be flair - the suite hit
     it twice - so: MOOD.parked and a speed floor, explicitly. */
  const spd = Math.hypot(car.vx, car.vy);
  const going = spd > 1.2 && !MOOD.parked;
  let w = 0;
  if (going){
    w += Math.abs(car.ar || 0) * 7;
    if (CTL.hb > 0) w += 3.0;
    if (MAN.mode && MAN.mode !== 'none') w += 2.0;
    if (spd > 8) w += (spd - 8) * 0.35;
    if (car.dodging) w += 3.2;
  }
  if (car.held || car.airborne) w += 5.5;
  exciteAt(car.x, car.y, w * dt);
  /* Impacts and near-misses are events, not states, so they are measured as a
     change since last frame. A 20 kJ bash is worth about twenty points. */
  const dmg = car.dmg || 0;
  const dd = dmg - (EM.dmg === undefined ? dmg : EM.dmg); EM.dmg = dmg;
  if (dd > 0) exciteAt(car.x, car.y, Math.min(70, dd / 900));
  const sv = car.saves || 0;
  if (sv > (EM.saves || 0)) exciteAt(car.x, car.y, 30 * (sv - (EM.saves || 0)));
  EM.saves = sv;

  /* --- the traffic. A jam is mildly interesting; somebody deciding to do
     something about a jam is much more so. */
  for (const c of CARS){
    if (c.done) continue;
    let cw = 0;
    if (c.onDetour) cw += 2.2;
    /* A jam is interesting while it FORMS and dull once it has stood for a
       while, and without this the readout was useless: a queue of eight cars in
       the prime aisle held the top spot for four hundred seconds solid, simply
       by existing. Novelty is most of what makes something worth looking at, so
       the contribution peaks at about six seconds of being stuck and is gone by
       twenty-five. The jam is still a bug worth fixing - it just is not a
       spectacle. */
    const jm = c.jammed || 0;
    if (jm > 3) cw += 1.5 * Math.max(0, Math.min(1, (25 - jm) / 15));
    if (c.state === 'park') cw += 0.3;
    if (c.held || c.airborne || c.rolling) cw += 5.0;
    if (cw) exciteAt(c.x, c.y, cw * dt);
  }
  const byp = TRAF.bypass || 0, trn = TRAF.turnedRound || 0, gav = TRAF.gaveUp || 0;
  if (byp > (EM.byp || 0) || trn > (EM.trn || 0) || gav > (EM.gav || 0)){
    /* The counters do not say WHERE, so credit the car most likely responsible:
       the one currently making the most fuss. */
    let worst = null, wv = -1;
    for (const c of CARS){
      if (c.done) continue;
      const v = (c.onDetour ? 2 : 0) + (c.jammed || 0) * 0.1;
      if (v > wv){ wv = v; worst = c; }
    }
    const pts = 20 * (byp - (EM.byp || 0)) + 26 * (trn - (EM.trn || 0)) +
                10 * (gav - (EM.gav || 0));
    if (worst) exciteAt(worst.x, worst.y, pts);
  }
  EM.byp = byp; EM.trn = trn; EM.gav = gav;

  /* --- the cast. Somebody who cannot find their car is the best small story in
     here, so it is weighted like one. */
  for (const b of BEINGS){
    if (beingAbsent(b)) continue;
    let bw = 0;
    if (b.life === 'muddled') bw += 3.6;
    else if (b.life === 'hunting') bw += 1.4;
    else if (b.life === 'seekHelp' || b.life === 'waitHelp') bw += 1.8;
    else if (b.life === 'following') bw += 3.0;
    if (b.job) bw += 2.7;                     // Trolleyboy on the case
    if (b.down > 0) bw += 2.0;
    if (b.held) bw += 5.5;
    /* Gulls are everywhere and always up to something, so a flying one is worth
       very little - otherwise the cloud simply tracks the flock. */
    /* These two are always here and always up to something. A flock settling at
       eight points apiece was enough to outrank the artic. */
    if (b.kind === 'gull' && b.z > 0.4) bw += 0.30;
    if (b.kind === 'fox') bw += 0.45;
    if (bw) exciteAt(b.x, b.y, bw * dt);
  }
  /* A trolley in the air is somebody's doing, and worth looking at. */
  for (const m of MOVERS){
    if (m.held) exciteAt(m.x, m.y, 5.5 * dt);
    else if (m.z > 0.45) exciteAt(m.x, m.y, 3.3 * dt);
    else if (Math.hypot(m.vx || 0, m.vy || 0) > 1.6) exciteAt(m.x, m.y, 1.2 * dt);
  }

  /* --- the set pieces. */
  if (LORRY.on){
    const tb = WORLD && WORLD.lorry !== undefined ? WORLD.boxes[WORLD.lorry + 1] : null;
    const lx = tb ? tb.x : LORRY.x, ly = tb ? tb.y : LORRY.y;
    if (LORRY.phase === 'back' || LORRY.phase === 'pull') exciteAt(lx, ly, 4.5 * dt);
    else exciteAt(lx, ly, 1.0 * dt);
  }
  if (BUS.on) exciteAt(BUS.x, BUS.y, (BUS.phase === 'dwell' ? 2.2 : 1.0) * dt);
}

/* The peaks, for the numbers in the middle of the clouds. Gathered over a 3x3
   first so a single hot cell beside a warm one reads as one hotspot rather than
   two, then picked greedily with a suppression radius - which is the whole of
   the clustering, and it is four lines because the field did the work.
   A SUM over the neighbourhood, not a mean. The mean was wrong twice: it
   divided every score by nine, so a car park with plenty going on read 2 where
   the weights say 15, and it also punished anything that MOVES - a walking
   Trolleyboy spreads his contribution over four or five cells, and averaging
   then reports a fifth of it. The question the number answers is how much is
   going on around here, and that is an amount, not an average. */
function hotspots(n){
  for (let j = 0; j < EGH; j++){
    for (let i = 0; i < EGW; i++){
      let sum = 0, cnt = 0;
      for (let dj = -1; dj <= 1; dj++){
        for (let di = -1; di <= 1; di++){
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= EGW || jj >= EGH) continue;
          sum += EXC[jj * EGW + ii]; cnt++;
        }
      }
      EXB[j * EGW + i] = sum;
    }
  }
  const out = [];
  for (let k = 0; k < n; k++){
    let bi = -1, bv = 5;                   // a floor, so a quiet car park is quiet
    for (let i = 0; i < EXB.length; i++) if (EXB[i] > bv){ bv = EXB[i]; bi = i; }
    if (bi < 0) break;
    const i = bi % EGW, j = (bi - i) / EGW;
    out.push({ x:EX0 + (i + 0.5) * ECELL, y:EY0 + (j + 0.5) * ECELL, v:bv });
    for (let jj = Math.max(0, j - 3); jj <= Math.min(EGH - 1, j + 3); jj++)
      for (let ii = Math.max(0, i - 3); ii <= Math.min(EGW - 1, i + 3); ii++)
        EXB[jj * EGW + ii] = 0;
  }
  return out;
}

/* ==================================================================== the bus ===
   The 22 and the 73 both stop at a Tesco Extra, and a bus is the cheapest
   population in the sim: eight people at once, no bay, no journey, nothing in
   the pipeline. It is also the thing the life-cycle was shaped for - arrivedBy
   is data, so a bus passenger is simply somebody whose life starts at the gate
   instead of beside a car, and everything from the doors onwards is identical.

   It stops OUTSIDE, on the approach road, and that is the site's decision rather
   than mine. The covered walkway is fenced off from every drivable lane by the
   bollard line along its kerb - that is what the bollards are for, and they went
   in because six Street View photos showed them - so nothing on wheels gets
   within six metres of it. And an eleven-and-a-half metre bus wants eleven
   metres of turning radius, which a car park with one entrance and 6.4 m aisles
   does not have anywhere: a bus that drove in could not get out again. So it
   pulls up on the road, everybody walks in through the entrance like everybody
   else, and it carries on. Which is also what actually happens. */
const BUS_L = 11.5, BUS_W = 2.55, BUS_WB = 5.9;
const BUS = { on:false, phase:'away', t:0, x:0, y:0, h:0, v:0, steer:0,
              wait:0, out:0, box:-1, stopped:0 };
const BUS_STOP = { x:0, y:0 };

function busGeom(){
  BUS_STOP.x = X0 - 9;
  BUS_STOP.y = gateSpot()[1];
  return BUS_STOP;
}
function syncBus(w){
  if (!w || BUS.box < 0) return;
  const b = w.boxes[BUS.box];
  if (!b) return;
  b.x = BUS.x; b.y = BUS.y; b.a = BUS.h;
  b.c = Math.cos(-BUS.h); b.s = Math.sin(-BUS.h);
  b.off = !BUS.on;
}

/* Where the door is, which is where people appear and where they queue. */
function busDoor(){
  /* The sprite's `door` anchor (2.6 forward, 0.9 out from the side). */
  const d = anchorAt('bus', 'door', BUS.x, BUS.y, BUS.h);
  if (d) return [d[0], d[1]];
  const ch = Math.cos(BUS.h), sh = Math.sin(BUS.h);
  return [BUS.x + ch * 2.6 - sh * (BUS_W / 2 + 0.9),
          BUS.y + sh * 2.6 + ch * (BUS_W / 2 + 0.9)];
}

function stepBus(w, dt){
  if (!w || BUS.box < 0) return;
  BUS.t += dt;
  const st = busGeom();

  if (BUS.phase === 'away'){
    BUS.on = false;
    /* Roughly every two simulated hours while the shop is open, which at this
       clock is a bus every hundred seconds or so - often enough to be a feature
       of the day and rare enough to be an event. */
    if (BUS.t > 90 + RND.beings() * 70 && daylight() > 0.1){
      BUS.on = true; BUS.phase = 'in'; BUS.t = 0;
      BUS.x = X0 - 58; BUS.y = st.y; BUS.h = 0; BUS.v = 0; BUS.steer = 0;
      BUS.out = 3 + Math.floor(RND.beings() * 6);
      BUS.stopped = 0;
    }
    syncBus(w);
    return;
  }

  let vWant = 0;
  if (BUS.phase === 'in'){
    vWant = Math.min(7.0, 0.9 * Math.max(0, st.x - BUS.x) + 0.6);
    const want = angDiff(Math.atan2(st.y - BUS.y, (st.x + 6) - BUS.x), BUS.h);
    BUS.steer = Math.max(-0.4, Math.min(0.4, want * 1.3));
    if (BUS.x > st.x - 0.6){ BUS.phase = 'dwell'; BUS.t = 0; BUS.wait = 16 + RND.beings() * 20; }
  } else if (BUS.phase === 'dwell'){
    vWant = 0; BUS.steer = 0;
    BUS.wait -= dt;
    /* Off they come, one at a time rather than in a heap. */
    BUS.stopped += dt;
    if (BUS.out > 0 && BUS.stopped > 1.2){
      BUS.stopped = 0; BUS.out--;
      const d = busDoor();
      const kind = RND.beings() < 0.28 ? 'granny' : 'shopper';
      const b = addBeing(kind, d[0], d[1]);
      b.spawned = true;
      b.life = 'arriving';
      b.arrivedBy = 'bus';
    }
    if (BUS.wait <= 0 && BUS.out <= 0){ BUS.phase = 'out'; BUS.t = 0; }
  } else if (BUS.phase === 'out'){
    vWant = 7.5;
    const want = angDiff(Math.PI, BUS.h);
    BUS.steer = Math.max(-0.4, Math.min(0.4, want * 1.1));
    if (BUS.x < X0 - 54){ BUS.phase = 'away'; BUS.t = 0; BUS.on = false; }
  }

  /* Twelve tonnes of single-decker: it does not change speed quickly either. */
  const acc = (vWant > Math.abs(BUS.v) ? 1.4 : 2.6) * dt;
  BUS.v += Math.max(-acc, Math.min(acc, vWant - BUS.v));
  BUS.x += Math.cos(BUS.h) * BUS.v * dt;
  BUS.y += Math.sin(BUS.h) * BUS.v * dt;
  BUS.h += (BUS.v / BUS_WB) * Math.tan(BUS.steer) * dt;
  syncBus(w);
}

/* Anybody leaving on foot while a bus is sitting there gets on it, because of
   course they do. */
function busBoarding(){
  return BUS.on && BUS.phase === 'dwell';
}

/* ============================================== somebody has lost their car ===
   A lost driver does not shrug and walk home, and having them give up was the
   weakest thing in the life machine. They go and find a member of staff.

   The chain is the point: the customer asks the MANAGER, who does what managers
   do and delegates it to TROLLEYBOY, who spends his entire working life pushing
   trolleys up and down these rows and therefore knows exactly where that
   Discovery is. It is the only thing he is better at than anybody else, and it
   finally gives the two of them a reason to be in the simulation rather than
   merely on the premises.

   One job at a time, deliberately. A queue of lost drivers being processed in
   parallel would be a work-flow; one bewildered granny being walked to her car
   by a boy with a cigarette is a scene. */
const HELP = [];
function helpJobFor(b){
  for (const j of HELP) if (j.who === b) return j;
  return null;
}
function liveBeing(kind){
  for (const b of BEINGS) if (b.kind === kind && !beingAbsent(b)) return b;
  return null;
}
/* Trolleyboy's sixth sense, and it is simply that he is allowed to look at the
   answer: the nearest car of the right model to where they swear they left it.
   Everyone else in this file has to find things by walking into them. */
function senseCar(job){
  const who = job.who;
  const from = who.parkedAt || [who.x, who.y];
  let best = null, bd = 1e9;
  /* The tag first - that is the sixth sense, and it is right every time. */
  for (const bay of BAYS){
    if (!bay.car || bay.leaving) continue;
    if (bay.ownerCid === who.cid) return bay;
  }
  /* No tag to go on, so fall back to the nearest car of the right model, which
     is what anybody else would do and is sometimes wrong. */
  for (const bay of BAYS){
    if (!bay.car || bay.leaving) continue;
    if (bay.car.model && who.carSprite && bay.car.model.sprite !== who.carSprite) continue;
    let taken = false;
    for (const o of BEINGS) if (o !== who && o.ownBay === bay) taken = true;
    if (taken) continue;
    const bx = WORLD.boxes[bay.box];
    if (!bx) continue;
    const d = Math.hypot(bx.x - from[0], bx.y - from[1]);
    if (d < bd){ bd = d; best = bay; }
  }
  return best;
}

function bayStand(bay){
  const bx = WORLD.boxes[bay.box];
  const x = bx ? bx.x : bay.x, y = bx ? bx.y : bay.y;
  return [x, y + bay.toAisle * 2.3];
}

function onShift(b){
  if (b.kind === 'fox') return isNight();
  if (b.kind === 'gull') return !isNight();
  if (b.kind === 'granny') return shiftEdge(b, 0.28, 0.72);
  if (b.kind === 'shopper') return shiftEdge(b, 0.22, 0.80);
  /* Kyle never clocks off. He has no shift, no car and no home to go to; he
     is simply always here, pushing trolleys (Thomas, 2026-10-12: a joke on
     capitalism). */
  if (b.kind === 'trolleyboy') return true;
  /* The night manager's hours are the day manager's turned inside out, with
     a little overlap at each end so the handover has somebody on it. */
  if (b.kind === 'manager') return b.night ? !shiftEdge(b, 0.24, 0.84)
                                           : shiftEdge(b, 0.20, 0.86);
  return true;
}

const KINDS = {
  gull:      { sprite:'gull',      r:0.35, speed:1.5, solid:false, climbs:true },
  fox:       { sprite:'fox',       r:0.40, speed:2.6, solid:false },
  granny:    { sprite:'granny',    r:0.45, speed:0.50, solid:true },
  shopper:   { sprite:'shopper',   r:0.45, speed:1.85, solid:true },
  trolleyboy:{ sprite:'trolleyboy',r:0.45, speed:1.25, solid:true },
  manager:   { sprite:'manager',   r:0.45, speed:1.45, solid:true }
};

/* The human sprites turned out not to have POSES. Their states are the design
   variants from the casting session - granny is hunched / rigid / round, the
   manager is suit / clipboard / looming - because that is what they were drawn
   for. Only the gull and the fox were built as poses.
   Rather than fake nine pose states, the variants become what they already are:
   three different grannies, three different shoppers. Motion comes from the
   procedural bob instead, which is the right place for it anyway. Where a real
   pose does exist - the gull's wings, the fox's sniff, trolleyboy smoking -
   the behaviour still uses it. */
function poseOr(b, pose){
  const sp = CAST[b.k.sprite];
  return (sp && sp.states[pose]) ? pose : b.look;
}
function addBeing(kind, x, y, who){
  const k = KINDS[kind];
  const sp = CAST[k.sprite];
  /* Pick the LOOK from the variants only. Some sprites carry a genuine pose
     among their states - trolleyboy has a smoking one - and a being whose
     resting appearance is mid-cigarette looks broken when it is pushing a
     trolley. Where every state is a pose (the gull, the fox) the pool falls
     back to all of them and the behaviour drives it anyway. */
  const POSES = ['wings-out','loaf','alert','overfed','trot','sniff','smoking',
                 'standing','walking','pushing','driving'];
  let pool = sp ? sp.order.filter(function(n){ return POSES.indexOf(n) < 0; }) : [];
  if (!pool.length && sp) pool = sp.order;
  /* A resident keeps their look from visit to visit: Moira in her coat. */
  let look = pool.length ? pool[Math.floor(RND.beings() * pool.length)] : null;
  if (who && who.look && pool.indexOf(who.look) >= 0) look = who.look;
  const b = { kind:kind, k:k, x:x, y:y, h:RND.beings() * 6.28, z:0, vz:0,
              look:look, state:look, home:[x, y], leg:false,
              away:false, leaving:false, arriving:false,
              ownBay:null, toCar:null, spawned:false, gone:false,
              gz:0, flap:0,
              jitter:(RND.beings() - 0.5) * 0.10,
              /* `anim` is the walk cycle - the bob, the gull's dawdle. It used to
                 be called `phase`, and `phase` was ALSO the name of the shopper
                 state machine, and the object literal below declared `phase`
                 TWICE: once as undefined and once as a random number. The number
                 won, so the state strings only ever worked because spawnArrival
                 overwrote the field afterwards, and they only survived the frame
                 because those branches happened to `continue` before `phase += dt`
                 turned 'toDoors' into "toDoors0.00833". Two meanings, one name,
                 and a duplicate key holding it together. */
              anim:RND.beings() * 6.28,
              /* And the life. One state machine for the whole span of a visit:
                   arriving -> toDoors -> inStore -> outDoors
                             -> toCar | toExit -> gone
                 with muddled/hunting hanging off toCar for when the car is not
                 where it was left. Staff do not have one - they are not here to
                 shop - and neither do the gulls and the fox. */
              life:null, arrivedBy:null, parkedAt:null, carSprite:null,
              shopT:0, muddleT:0, huntT:0, huntRing:0,
              guide:null, job:null,
              wp:null, wi:0, rtT:0, rtGoal:null, side:0, sideT:0,
              bank:0, roll:0, whim:0, whimT:0,
              t:0, cid:'b' + (CID++), pid:PID++,
              tx:x, ty:y, hold:0, carry:null, inStore:false, fed:0 };
  /* A name. People come from the town; animals get a number, and keep it. */
  const res = (hasLife(b) || kind === 'manager' || kind === 'trolleyboy')
            ? claimResident(b, who) : null;
  b.res = res;
  if (res && !res.look) res.look = b.look;
  /* Their own skin and hair, from the town roll. */
  b.tones = res && res.skin ? { skin:res.skin, hair:res.hair } : null;
  b.name = res ? res.name : (kind + ' ' + b.pid);
  if (!CENSUS.mute && hasLife(b)){
    /* Coming back into view mid-visit (out of the shop doors) carries the visit
       on; anybody else is starting one. */
    let vis = res && res.visit && res.visit.out === null ? res.visit : null;
    if (!vis){
      vis = { in:+simClockNow().toFixed(1), out:null, fate:null, by:null, where:null, bay:null };
      if (res){ res.visit = vis; res.visits.push(vis); }
    }
    vis.where = null;                     // on the map now
    PEOPLE[b.pid] = { pid:b.pid, name:b.name, kind:kind, rid:res ? res.rid : null,
                      visits:[vis] };
  }
  BEINGS.push(b);
  return b;
}

function beingNear(b, kinds, rad){
  let best = null, bd = rad;
  for (const o of BEINGS){
    if (o === b || beingAbsent(o)) continue;
    if (kinds.indexOf(o.kind) < 0) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < bd){ bd = d; best = o; }
  }
  return best;
}

/* Walk toward a point, sliding along anything solid rather than stopping dead.
   People are not physics objects; they are pedestrians, and a pedestrian who
   meets a parked car walks round it. */
